// M3b: condition-dependent errors, warm-up and outliers (docs/03, ADR-0008). Each is off by
// default; when on, it moves readings and flags them. Inline series stand in for the M5
// scenarios (ensuite-shower-humid, hand-gel-tvoc-spikes, poorly-ventilated-weeks,
// power-cycle-and-module-swap).

import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "../src/model/config.js";
import { pmHumidityGrowth } from "../src/model/conditions.js";
import { simulate, seriesOf } from "../src/model/simulate.js";
import { isHealthy, withinEnvelope } from "../src/validation/envelope.js";
import { T0, TYPICAL, randomWalk, series, steady } from "./helpers.js";

const MIN = 60;
const PERFECT = { bias: 0, drift: 0, noise: 0 };
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("every condition switch is off by default", () => {
  it("has all five switches off", () => {
    expect(Object.values(DEFAULT_CONDITIONS).map((c) => c.enabled)).toEqual([false, false, false, false, false]);
  });

  it("ignores humidity, ethanol and weeks without fresh air when off", () => {
    const air = series((s) => ({ ...TYPICAL, rh: 95, ethanol: 500, co2: 700 + 100 * Math.sin(s / 3600) }), 600, 60);
    const r = simulate({ deviceId: "d", seed: "off" }, air);
    expect(r.readings.every((x) => isHealthy(x) && withinEnvelope(x))).toBe(true);
  });
});

describe("PM hygroscopic growth (Crilley et al. 2018)", () => {
  it("follows the κ-Köhler form: 1 at the calibration humidity, steep above ~80 %RH", () => {
    const cfg = { ...DEFAULT_CONDITIONS.pmHumidity, enabled: true };
    expect(pmHumidityGrowth(40, cfg)).toBeCloseTo(1, 12);
    expect(pmHumidityGrowth(60, cfg)).toBeLessThan(1.25);
    expect(pmHumidityGrowth(90, cfg)).toBeGreaterThan(2);
    expect(pmHumidityGrowth(95, cfg)).toBeGreaterThan(pmHumidityGrowth(90, cfg) * 1.5);
    expect(pmHumidityGrowth(20, cfg)).toBeLessThan(1);
  });

  it("over-reads PM after a shower and flags it; dry air is unaffected", () => {
    // En-suite shower: RH from 50% to 95% for 15 minutes, then back.
    const air = series((s) => ({ ...TYPICAL, pm25: 20, rh: s >= 20 * MIN && s < 35 * MIN ? 95 : 40 }), 60);
    const r = simulate({ deviceId: "d", seed: "shower", errorBudget: PERFECT, conditions: { pmHumidity: { enabled: true } } }, air);
    const pm = seriesOf(r.readings, "pm25");
    const during = pm.filter((x) => x.ts > T0 + 22 * MIN && x.ts <= T0 + 35 * MIN);
    const dry = pm.filter((x) => x.ts <= T0 + 20 * MIN);
    expect(mean(during.map((x) => x.value))).toBeGreaterThan(60);
    expect(during.every((x) => x.flags.includes("pm-humidity") && !withinEnvelope(x))).toBe(true);
    expect(dry.every((x) => isHealthy(x) && x.value === 20)).toBe(true);
    // Temperature and CO2 are not particle measurements.
    expect(seriesOf(r.readings, "co2").every(isHealthy)).toBe(true);
  });
});

describe("MOx TVOC cross-sensitivity and baseline", () => {
  it("reads hand-gel ethanol as TVOC, through the sensor's lag, and flags it", () => {
    // Hand gel used at minutes 10, 30 and 50: 400 ppb ethanol, decaying over ~5 minutes.
    const gel = (s: number) => [10, 30, 50].reduce((sum, m) => (s >= m * MIN ? sum + 400 * Math.exp(-(s - m * MIN) / 150) : sum), 0);
    const air = series((s) => ({ ...TYPICAL, tvoc: 100, ethanol: gel(s) }), 60);
    const r = simulate({ deviceId: "d", seed: "gel", errorBudget: PERFECT, conditions: { mox: { enabled: true, baselineSdPpb: 0, humidityPerPct: 0, temperaturePerDegC: 0 } } }, air);
    const tvoc = seriesOf(r.readings, "tvoc");
    const peak = Math.max(...tvoc.map((x) => x.value));
    expect(peak).toBeGreaterThan(250);
    expect(peak).toBeLessThan(500); // lag and averaging blunt the 400 ppb spike
    expect(tvoc.filter((x) => x.value > 200).every((x) => x.flags.includes("mox-ethanol"))).toBe(true);
    expect(tvoc.filter((x) => x.ts < T0 + 10 * MIN).every(isHealthy)).toBe(true);
    // Ethanol is not TVOC: the reference ignores it.
    expect(tvoc.every((x) => Math.abs(x.reference - 100) < 1e-9)).toBe(true);
  });

  it("reads high in humid, warm air and low in dry, cool air", () => {
    const cfg = { mox: { enabled: true, baselineSdPpb: 0, ethanolResponse: 0 } };
    const humid = simulate({ deviceId: "d", seed: "h", errorBudget: PERFECT, conditions: cfg }, steady({ ...TYPICAL, tvoc: 300, rh: 85, temp: 28 }, 20));
    const dry = simulate({ deviceId: "d", seed: "h", errorBudget: PERFECT, conditions: cfg }, steady({ ...TYPICAL, tvoc: 300, rh: 20, temp: 18 }, 20));
    const last = (xs: typeof humid) => seriesOf(xs.readings, "tvoc").at(-1)!;
    expect(last(humid).value).toBeGreaterThan(300 * 1.3);
    expect(last(humid).flags).toEqual(expect.arrayContaining(["mox-humidity", "mox-temperature"]));
    expect(last(dry).value).toBeLessThan(300 * 0.85);
  });

  it("wanders the baseline slowly, with the configured spread", () => {
    const r = simulate({ deviceId: "d", seed: "base", errorBudget: PERFECT, conditions: { mox: { enabled: true, humidityPerPct: 0, temperaturePerDegC: 0, ethanolResponse: 0 } } }, steady({ ...TYPICAL, tvoc: 200 }, 21 * 24 * 60, 300));
    const offsets = seriesOf(r.readings, "tvoc").map((x) => x.value - 200);
    const sd = Math.sqrt(mean(offsets.map((o) => o * o)));
    expect(sd).toBeGreaterThan(5);
    expect(sd).toBeLessThan(30);
    const steps = offsets.slice(1).map((o, i) => Math.abs(o - offsets[i]!));
    expect(Math.max(...steps)).toBeLessThan(5); // no jumps minute to minute
  });
});

describe("CO2 automatic baseline calibration (Senseair S8 PSP0107: 8-day period, 30–50 ppm per period)", () => {
  const weeks = 4;
  const abc = { abc: { enabled: true } };

  it("drifts low in a room that never reaches outdoor levels", () => {
    // Poorly ventilated room: CO2 between 650 and 1,400 ppm for four weeks, never near 400.
    const air = series((s) => ({ ...TYPICAL, co2: 1025 + 375 * Math.sin((2 * Math.PI * s) / 86_400) }), weeks * 7 * 24 * 60, 300);
    const r = simulate({ deviceId: "d", seed: "abc", errorBudget: PERFECT, conditions: abc }, air);
    const co2 = seriesOf(r.readings, "co2");
    const errorIn = (day: number) => mean(co2.filter((x) => x.ts >= T0 + day * 86_400 && x.ts < T0 + (day + 1) * 86_400).map((x) => x.value - x.reference));
    expect(errorIn(3)).toBeCloseTo(0, 0);
    expect(errorIn(9)).toBeCloseTo(-50, 0);
    expect(errorIn(17)).toBeCloseTo(-100, 0);
    expect(errorIn(26)).toBeCloseTo(-150, 0);
    expect(co2.filter((x) => x.ts > T0 + 9 * 86_400).every((x) => x.flags.includes("abc-offset"))).toBe(true);
    expect(r.status.abcOffsetPpm).toBe(-150);
  });

  it("holds steady where the air reaches 400 ppm every day", () => {
    const air = series((s) => ({ ...TYPICAL, co2: 400 + 400 * Math.max(0, Math.sin((2 * Math.PI * s) / 86_400)) }), weeks * 7 * 24 * 60, 300);
    const r = simulate({ deviceId: "d", seed: "abc", errorBudget: PERFECT, conditions: abc }, air);
    expect(Math.abs(r.status.abcOffsetPpm)).toBeLessThanOrEqual(2);
  });

  it("recalibration clears the ABC offset", () => {
    const air = steady({ ...TYPICAL, co2: 900 }, 20 * 24 * 60, 600);
    const r = simulate({ deviceId: "d", seed: "abc", errorBudget: PERFECT, conditions: abc, events: [{ t: T0 + 18 * 86_400, kind: "recalibrate" }] }, air);
    expect(r.status.abcOffsetPpm).toBe(0);
  });
});

describe("warm-up after power-on and module replacement", () => {
  const warm = { warmUp: { enabled: true } };

  it("flags every parameter after power-on until its sensor has settled", () => {
    const events = [
      { t: T0 + 10 * MIN, kind: "power" as const, on: false },
      { t: T0 + 20 * MIN, kind: "power" as const, on: true },
    ];
    const r = simulate({ deviceId: "d", seed: "warm", conditions: warm, events }, steady(TYPICAL, 120));
    const flaggedMinutes = (p: "pm25" | "co2" | "tvoc" | "temp") => seriesOf(r.readings, p).filter((x) => x.flags.includes("warm-up")).map((x) => (x.ts - T0) / MIN);
    expect(flaggedMinutes("pm25")).toEqual([21]); // 30 s
    expect(flaggedMinutes("co2")).toEqual([21, 22, 23]); // 180 s
    expect(flaggedMinutes("temp").length).toBe(15); // 900 s
    expect(flaggedMinutes("tvoc").length).toBe(60); // 3600 s
    expect(seriesOf(r.readings, "pm25").filter((x) => x.ts <= T0 + 10 * MIN).every(isHealthy)).toBe(true);
  });

  it("starts large and decays", () => {
    const events = [
      { t: T0 + 5 * MIN, kind: "power" as const, on: false },
      { t: T0 + 6 * MIN, kind: "power" as const, on: true },
    ];
    const r = simulate({ deviceId: "d", seed: "decay", errorBudget: PERFECT, conditions: warm, events }, steady(TYPICAL, 90));
    const tvoc = seriesOf(r.readings, "tvoc").filter((x) => x.flags.includes("warm-up"));
    const err = tvoc.map((x) => Math.abs(x.value - x.reference));
    expect(err[0]!).toBeGreaterThan(tvoc[0]!.envelope * 0.5);
    expect(err.at(-1)!).toBeLessThan(err[0]! * 0.1);
  });

  it("flags only the replaced module's parameters", () => {
    const events = [{ t: T0 + 30 * MIN, kind: "replace-module" as const, bay: 1 as const }];
    const r = simulate({ deviceId: "d", seed: "swap", conditions: warm, events }, steady(TYPICAL, 60));
    const flagged = new Set(r.readings.filter((x) => x.flags.includes("warm-up")).map((x) => x.param));
    expect([...flagged]).toEqual(["tvoc"]);
  });

  it("can drop warm-up readings instead of flagging them", () => {
    const events = [{ t: T0 + 30 * MIN, kind: "replace-module" as const, bay: 0 as const }];
    const r = simulate({ deviceId: "d", seed: "swap", conditions: { warmUp: { enabled: true, suppress: true } }, events }, steady(TYPICAL, 60));
    expect(seriesOf(r.readings, "pm25").some((x) => x.ts === T0 + 31 * MIN)).toBe(false);
    expect(r.readings.some((x) => x.flags.includes("warm-up"))).toBe(false);
  });
});

describe("realistic outliers", () => {
  it("puts a few readings outside the envelope, all flagged; the rest stay in", () => {
    const r = simulate({ deviceId: "d", seed: "out", conditions: { outliers: { enabled: true, perReading: 0.01 } } }, randomWalk("out", 24 * 60));
    const outliers = r.readings.filter((x) => x.flags.includes("outlier"));
    expect(outliers.length / r.readings.length).toBeGreaterThan(0.005);
    expect(outliers.length / r.readings.length).toBeLessThan(0.02);
    const clear = outliers.filter((x) => x.flags.length === 1);
    expect(clear.filter((x) => !withinEnvelope(x)).length / clear.length).toBeGreaterThan(0.9);
    expect(r.readings.filter(isHealthy).every(withinEnvelope)).toBe(true);
  });

  it("leaves the other readings exactly as they were without outliers", () => {
    const input = randomWalk("out2", 180);
    const base = simulate({ deviceId: "d", seed: "o" }, input);
    const withOut = simulate({ deviceId: "d", seed: "o", conditions: { outliers: { enabled: true, perReading: 0.05 } } }, input);
    base.readings.forEach((b, i) => {
      const w = withOut.readings[i]!;
      if (!w.flags.includes("outlier")) expect(w.value).toBe(b.value);
    });
  });
});
