// M2: the core sensor model (docs/03, docs/08).

import { describe, expect, it } from "vitest";
import { createDevice } from "../src/model/device.js";
import { lagAlpha } from "../src/model/lag.js";
import { simulate, seriesOf } from "../src/model/simulate.js";
import { PARAMS, type ParamId } from "../src/params.js";
import { SENSEDGE_MINI, SPEC_PROFILES, quantise, reportRange } from "../src/spec/sensedge-mini.js";
import { VARIANTS, variantParams, type Variant } from "../src/spec/modules.js";
import { isHealthy, summarise, withinEnvelope } from "../src/validation/envelope.js";
import { T0, TYPICAL, randomWalk, series, sha256, steady } from "./helpers.js";

const PERFECT = { bias: 0, drift: 0, noise: 0 };

describe("healthy readings stay within the spec envelope", () => {
  const variants = Object.keys(VARIANTS) as Variant[];
  for (const profile of SPEC_PROFILES) {
    it(`profile ${profile}: 24 seeds × 3 variants × 3 h of random air`, () => {
      let checked = 0;
      for (let s = 0; s < 24; s++) {
        const variant = variants[s % variants.length]!;
        const result = simulate(
          { deviceId: `dev-${s}`, seed: `seed-${s}`, variant, specProfile: profile, moduleLifetimePct: [(s * 37) % 101, (s * 53) % 101], onboardAgeDays: (s * 29) % 700 },
          randomWalk(`${profile}-${s}`, 180),
        );
        const bad = result.readings.filter((r) => isHealthy(r) && !withinEnvelope(r));
        expect(bad.map((r) => `${r.param}@${r.ts}: ${r.value} vs ${r.reference} ± ${r.envelope}`)).toEqual([]);
        checked += result.readings.filter(isHealthy).length;
      }
      expect(checked).toBeGreaterThan(10_000);
    });
  }

  it("uses most of the envelope, not a sliver of it", () => {
    const result = simulate({ deviceId: "d", seed: "wide", moduleLifetimePct: [0.5, 0.5], onboardAgeDays: 729 }, randomWalk("wide", 600));
    const summary = summarise(result.readings);
    expect(summary.healthyWithin).toBe(summary.healthy);
    expect(summary.worstHealthyRatio).toBeGreaterThan(0.6);
    expect(summary.worstHealthyRatio).toBeLessThanOrEqual(1);
  });

  it("raises no health flags for in-range air with every condition switch off", () => {
    const result = simulate({ deviceId: "d", seed: "quiet" }, steady(TYPICAL, 120));
    expect(result.readings.length).toBeGreaterThan(0);
    expect(result.readings.every(isHealthy)).toBe(true);
  });
});

describe("reporting", () => {
  const result = simulate({ deviceId: "d", seed: "rep" }, steady(TYPICAL, 30));

  it("reports once a minute, labelled by the interval's end", () => {
    const pm = seriesOf(result.readings, "pm25");
    expect(pm.length).toBe(30);
    for (const r of pm) {
      expect(r.ts % 60).toBe(0);
      expect(r.span).toBe(60);
    }
    expect(pm[0]!.ts).toBe(T0 + 60);
  });

  it("reports exactly the variant's parameters, with module sources", () => {
    const params = new Set(result.readings.map((r) => r.param));
    expect([...params].sort()).toEqual(variantParams(VARIANTS["pm-tvoc-co2"]).sort());
    expect(result.readings.find((r) => r.param === "pm25")?.source).toBe("km200");
    expect(result.readings.find((r) => r.param === "tvoc")?.source).toBe("km203");
    expect(result.readings.find((r) => r.param === "co2")?.source).toBeUndefined();
  });

  it("reports values on the resolution grid and inside the reportable range", () => {
    const big = simulate({ deviceId: "d", seed: "grid", variant: "well" }, randomWalk("grid", 120));
    for (const r of big.readings) {
      expect(quantise(r.param, r.value)).toBe(r.value);
      const [lo, hi] = reportRange(r.param, big.config.specProfile);
      expect(r.value).toBeGreaterThanOrEqual(lo);
      expect(r.value).toBeLessThanOrEqual(hi);
    }
  });

  it("clamps and flags air outside the range", () => {
    const high = simulate({ deviceId: "d", seed: "hi" }, steady({ ...TYPICAL, pm25: 1500, co2: 7000, tvoc: 3000 }, 10));
    const pm = seriesOf(high.readings, "pm25").at(-1)!;
    expect(pm.value).toBe(1000);
    expect(pm.flags).toContain("out-of-range");
    const co2 = seriesOf(high.readings, "co2").at(-1)!;
    expect(co2.flags).toContain("extended-range");
    expect(co2.value).toBeGreaterThan(5000);
    const low = simulate({ deviceId: "d", seed: "lo" }, steady({ ...TYPICAL, co2: 300 }, 10));
    const c = seriesOf(low.readings, "co2").at(-1)!;
    expect(c.value).toBe(400);
    expect(c.flags).toContain("out-of-range");
  });

  it("skips minutes without enough input and logs them", () => {
    const air = steady(TYPICAL, 20).filter((s) => s.t < T0 + 5 * 60 || s.t > T0 + 15 * 60);
    const r = simulate({ deviceId: "d", seed: "gap" }, air, { maxGapS: 60 });
    const minutes = seriesOf(r.readings, "pm25").map((x) => (x.ts - T0) / 60);
    expect(minutes).not.toContain(10);
    expect(minutes).toContain(5);
    expect(minutes).toContain(20);
    expect(r.log.some((e) => e.kind === "no-input" && e.ts === T0 + 600)).toBe(true);
  });

  it("bridges short gaps by interpolation", () => {
    const sparse = steady(TYPICAL, 20, 60);
    const r = simulate({ deviceId: "d", seed: "sparse" }, sparse);
    expect(seriesOf(r.readings, "co2").length).toBe(20);
  });
});

describe("sensor lag", () => {
  const cases: [ParamId, number][] = [
    ["pm25", 100],
    ["co2", 2000],
    ["tvoc", 800],
    ["temp", 30],
    ["rh", 80],
  ];
  for (const [param, high] of cases) {
    const t90 = SENSEDGE_MINI[param].t90.seconds;
    it(`${param}: a step reaches 90% after T90 = ${t90} s, and the device's reference follows it`, () => {
      const alpha = lagAlpha(t90, 5);
      expect((1 - alpha) ** (t90 / 5)).toBeCloseTo(0.1, 12);

      const low = param === "co2" ? 400 : param === "temp" ? 20 : param === "rh" ? 40 : 0;
      const stepAt = T0 + 605; // first sample of the minute ending T0 + 660
      const air = series((s) => ({ [param]: T0 + s < stepAt ? low : high }), 20);
      const readings = seriesOf(simulate({ deviceId: "d", seed: "lag", errorBudget: PERFECT, params: [param] }, air).readings, param);
      for (let minute = 0; minute < 5; minute++) {
        const r = readings.find((x) => x.ts === T0 + 660 + minute * 60)!;
        // Samples k = 1..12 of this minute are the (12·minute + k)-th after the step.
        let meanRemaining = 0;
        for (let k = 1; k <= 12; k++) meanRemaining += (1 - alpha) ** (12 * minute + k) / 12;
        expect(r.reference).toBeCloseTo(high - (high - low) * meanRemaining, 9);
      }
    });
  }

  it("uses the lagged, interval-averaged true value as the reference", () => {
    const air = series((s) => ({ ...TYPICAL, co2: s < 600 ? 500 : 1500 }), 20);
    const r = seriesOf(simulate({ deviceId: "d", seed: "ref", errorBudget: PERFECT }, air).readings, "co2");
    const justAfter = r.find((x) => x.ts === T0 + 660)!;
    expect(justAfter.truth).toBeGreaterThan(1400);
    expect(justAfter.reference).toBeLessThan(justAfter.truth);
    expect(Math.abs(justAfter.value - justAfter.reference)).toBeLessThanOrEqual(0.5);
    expect(r.at(-1)!.reference).toBeCloseTo(1500, 0);
  });
});

describe("determinism", () => {
  const input = randomWalk("det", 90);

  it("the same seed and input give identical output", () => {
    const a = simulate({ deviceId: "d", seed: "same" }, input);
    const b = simulate({ deviceId: "d", seed: "same" }, input);
    expect(sha256(a.readings)).toBe(sha256(b.readings));
  });

  it("different seeds give different devices", () => {
    const a = simulate({ deviceId: "d", seed: "one" }, input);
    const b = simulate({ deviceId: "d", seed: "two" }, input);
    expect(sha256(a.readings.map((r) => r.value))).not.toBe(sha256(b.readings.map((r) => r.value)));
  });

  it("switching dropouts on removes readings but never changes the others", () => {
    const base = simulate({ deviceId: "d", seed: "iso" }, input);
    const dropped = simulate({ deviceId: "d", seed: "iso", availability: { paramDropoutPerMinute: 0.2, deviceDropoutPerMinute: 0.05 } }, input);
    const key = (r: { param: string; ts: number }) => `${r.param}@${r.ts}`;
    const baseValues = new Map(base.readings.map((r) => [key(r), r.value]));
    expect(dropped.readings.length).toBeLessThan(base.readings.length * 0.9);
    for (const r of dropped.readings) expect(r.value).toBe(baseValues.get(key(r)));
  });

  it("reporting a subset of parameters leaves the others' values unchanged", () => {
    const all = simulate({ deviceId: "d", seed: "sub" }, input);
    const some = simulate({ deviceId: "d", seed: "sub", params: ["co2", "pm25"] }, input);
    const allCo2 = seriesOf(all.readings, "co2").map((r) => r.value);
    expect(seriesOf(some.readings, "co2").map((r) => r.value)).toEqual(allCo2);
  });

  it("matches the golden hashes (re-record only on purpose, and say why)", () => {
    const golden = {
      default: simulate({ deviceId: "golden", seed: "golden-1" }, randomWalk("golden", 240)).readings.map((r) => [r.param, r.ts, r.value]),
      well: simulate({ deviceId: "golden", seed: "golden-2", variant: "well", specProfile: "tighter" }, randomWalk("golden", 240)).readings.map((r) => [r.param, r.ts, r.value]),
    };
    expect({ default: sha256(golden.default), well: sha256(golden.well) }).toMatchInlineSnapshot(`
      {
        "default": "62bb84af58c5d654126ba37ccdc5b8ceadd5e633326032e96cef5f8e5ed16279",
        "well": "70e50faf9b5b738cadf94de82d077b08db6334b73f36b20a536130e8facb786d",
      }
    `);
  });
});

describe("config validation", () => {
  it("rejects a budget over 1, off-grid steps and unknown parameters", () => {
    expect(() => createDevice({ deviceId: "d", seed: "s", errorBudget: { bias: 0.6, drift: 0.3, noise: 0.2 } })).toThrow(/sums/);
    expect(() => createDevice({ deviceId: "d", seed: "s", variant: "pm-tvoc", params: ["co2"] })).toThrow(/does not measure/);
    const d = createDevice({ deviceId: "d", seed: "s" });
    expect(() => d.step(T0 + 3, null)).toThrow(/grid/);
    d.step(T0, null);
    expect(() => d.step(T0, null)).toThrow(/not after/);
  });

  it("covers every parameter in some variant", () => {
    const covered = new Set(Object.values(VARIANTS).flatMap(variantParams));
    expect(PARAMS.every((p) => covered.has(p))).toBe(true);
  });
});
