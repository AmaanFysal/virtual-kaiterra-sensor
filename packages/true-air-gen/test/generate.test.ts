// M5: the synthetic true-air generator (docs/04). Physics against closed-form answers, each
// scenario's point, validation, determinism, and the scenarios run through the device.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SIM_DEFAULT_START_T, formatIso, isHealthy, parseIso, simToUnix, simulate, withinEnvelope, type TrueAirSample } from "@vks/core";
import { describe, expect, it } from "vitest";
import { generate, type GeneratedScenario } from "../src/generate.js";
import { co2LitresPerSecond, relativeHumidity, saturationVapourDensity } from "../src/physics.js";
import { expandTimeline, scenarioDeviceConfig, validateScenario } from "../src/scenario.js";

const DIR = join(import.meta.dirname, "..", "..", "..", "data", "scenarios");
const load = (id: string) => validateScenario(JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")));
const ids = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
const cache = new Map<string, GeneratedScenario>();
const gen = (id: string, seed = "test") => {
  const key = `${id}/${seed}`;
  if (!cache.has(key)) cache.set(key, generate(load(id), seed));
  return cache.get(key)!;
};
const at = (g: GeneratedScenario, minutes: number): TrueAirSample => {
  const t = parseIso(g.scenario.start) + minutes * 60;
  return g.samples.find((s) => s.t === t)!;
};
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
const MIN = 60;

describe("scenario files", () => {
  it("has the eleven planned scenarios", () => {
    expect(ids).toEqual([
      "bedroom-night",
      "cleaning-tvoc-spike",
      "cooking-pm-event",
      "door-closed-co2-rise",
      "ensuite-shower-humid",
      "hand-gel-tvoc-spikes",
      "lounge-afternoon",
      "out-of-range-high",
      "poorly-ventilated-weeks",
      "power-cycle-and-module-swap",
      "step-changes",
    ]);
  });

  it.each(ids)("%s validates and generates plausible air", (id) => {
    const g = gen(id);
    const { scenario } = g;
    expect(g.samples.length).toBe(Math.floor((scenario.durationMinutes * 60) / scenario.sampleIntervalS) + 1);
    for (const s of g.samples) {
      for (const v of Object.values(s.air)) expect(v).toBeGreaterThanOrEqual(0);
      expect(s.air.rh!).toBeLessThanOrEqual(100);
      expect(s.air.co2!).toBeGreaterThanOrEqual(380);
      expect(s.air.temp!).toBeGreaterThan(5);
      expect(s.air.temp!).toBeLessThan(35);
    }
  });

  it("uses the care home rooms and starts on its clock by default", () => {
    expect(load("bedroom-night").room).toMatchObject({ id: "Room1", floorAreaM2: 19, ceilingHeightM: 2.4 });
    expect(load("lounge-afternoon").room.floorAreaM2).toBe(52.25);
    expect(load("ensuite-shower-humid").room.floorAreaM2).toBe(3);
    expect(validateScenario({ id: "x", durationMinutes: 1, room: { id: "Room1", floorAreaM2: 19 } }).start).toBe(formatIso(simToUnix(SIM_DEFAULT_START_T)));
  });
});

describe("physics", () => {
  const base = { id: "p", durationMinutes: 24 * 60, jitter: false, room: { id: "Room1", floorAreaM2: 19, baseAch: 0.5, doorOpenAch: 0 }, outdoor: { co2: 420 } };

  it("CO2 approaches C_out + G·N/(λV) (Persily & de Jonge 2017 rates)", () => {
    const g = generate(validateScenario({ ...base, timeline: [{ atMinutes: 0, type: "occupants", who: "resident", activity: "seated", count: 2 }] }), "s");
    const G = co2LitresPerSecond("resident", "seated");
    expect(G).toBeCloseTo(0.0033, 4); // Table 2, ≥ 80, 1.2 met, mean of sexes
    const steady = 420 + ((2 * G * 3.6) / (0.5 * 19 * 2.4)) * 1e6;
    expect(g.samples.at(-1)!.air.co2).toBeCloseTo(steady, 0);
    // First-order rise: after one time constant (1/λ = 2 h), 63% of the way.
    expect(at(g, 120).air.co2!).toBeCloseTo(420 + (steady - 420) * (1 - Math.exp(-1)), -1);
  });

  it("decays pollutants at ventilation plus deposition", () => {
    const g = generate(validateScenario({ ...base, timeline: [{ atMinutes: 0, type: "set", values: { pm25: 500, co2: 2000 } }] }), "s");
    const pm60 = at(g, 60).air.pm25!;
    const pm0 = 500;
    const outdoorSs = (8 * 0.8 * 0.5) / (0.5 + 0.4);
    expect(pm60 - outdoorSs).toBeCloseTo((pm0 - outdoorSs) * Math.exp(-(0.5 + 0.4)), 0);
    expect(at(g, 60).air.co2! - 420).toBeCloseTo((2000 - 420) * Math.exp(-0.5), 0);
  });

  it("keeps humidity at or below saturation", () => {
    expect(relativeHumidity(saturationVapourDensity(22) * 2, 22)).toBe(100);
    expect(Math.abs(saturationVapourDensity(20) - 17.3)).toBeLessThan(0.1); // steam tables: 17.3 g/m³ at 20 °C
  });
});

describe("each scenario makes its point", () => {
  it("door-closed-co2-rise: CO2 climbs while the door is shut and falls after", () => {
    const g = gen("door-closed-co2-rise");
    expect(at(g, 200).air.co2!).toBeGreaterThan(at(g, 30).air.co2! + 700);
    expect(at(g, 300).air.co2!).toBeLessThan(at(g, 210).air.co2! - 300);
  });

  it("bedroom-night: CO2 builds overnight behind the closed door", () => {
    const g = gen("bedroom-night");
    expect(at(g, 600).air.co2!).toBeGreaterThan(1000);
    expect(g.annotations.some((a) => a.label === "door closed" && a.to - a.from > 4 * 3600)).toBe(true);
  });

  it("lounge-afternoon: visitors raise CO2; toast raises PM", () => {
    const g = gen("lounge-afternoon");
    expect(at(g, 235).air.co2!).toBeGreaterThan(at(g, 115).air.co2!);
    expect(at(g, 190).air.pm25!).toBeGreaterThan(at(g, 175).air.pm25! * 2);
  });

  it("cleaning-tvoc-spike: TVOC spikes into the hundreds and the open window clears it", () => {
    const g = gen("cleaning-tvoc-spike");
    const peak = Math.max(...g.samples.map((s) => s.air.tvoc!));
    expect(peak).toBeGreaterThan(300);
    expect(peak).toBeLessThan(1382);
    expect(at(g, 95).air.tvoc!).toBeLessThan(peak * 0.2);
  });

  it("cooking-pm-event: PM2.5 in the hundreds, finer than PM10", () => {
    const g = gen("cooking-pm-event");
    const peak = g.samples.reduce((m, s) => (s.air.pm25! > m.air.pm25! ? s : m));
    expect(peak.air.pm25!).toBeGreaterThan(150);
    expect(peak.air.pm25!).toBeLessThan(1000);
    expect(peak.air.pm1!).toBeLessThan(peak.air.pm25!);
    expect(peak.air.pm10!).toBeGreaterThan(peak.air.pm25!);
  });

  it("ensuite-shower-humid: saturates the en-suite, then the fan dries it", () => {
    const g = gen("ensuite-shower-humid");
    expect(at(g, 27).air.rh!).toBeGreaterThan(95);
    expect(at(g, 27).air.temp!).toBeGreaterThan(at(g, 10).air.temp!);
    expect(at(g, 65).air.rh!).toBeLessThan(80);
    expect(g.scenario.device.conditions?.pmHumidity?.enabled).toBe(true);
  });

  it("hand-gel-tvoc-spikes: eight ethanol spikes, TVOC itself unmoved", () => {
    const g = gen("hand-gel-tvoc-spikes");
    const spikes = g.samples.filter((s, i) => s.air.ethanol! > 200 && (g.samples[i - 1]?.air.ethanol ?? 0) <= 200);
    expect(spikes).toHaveLength(8);
    expect(Math.max(...g.samples.map((s) => s.air.tvoc!))).toBeLessThan(150);
  });

  it("poorly-ventilated-weeks: CO2 never nears outdoor air for four weeks", () => {
    const g = gen("poorly-ventilated-weeks");
    expect(g.samples.length).toBe(28 * 24 * 12 + 1);
    expect(Math.min(...g.samples.map((s) => s.air.co2!))).toBeGreaterThan(800);
  });

  it("step-changes: holds each step exactly", () => {
    const g = gen("step-changes");
    expect(at(g, 30).air).toMatchObject({ co2: 500, pm25: 10, tvoc: 100, temp: 20, rh: 40 });
    expect(at(g, 100).air).toMatchObject({ co2: 2000, pm25: 200, tvoc: 800, temp: 26, rh: 70 });
  });

  it("power-cycle-and-module-swap: turns its device events into Unix times", () => {
    const s = load("power-cycle-and-module-swap");
    const cfg = scenarioDeviceConfig(s, "d", "seed");
    expect(cfg.events!.map((e) => (e.t - parseIso(s.start)) / MIN)).toEqual([60, 75, 180, 240]);
    expect(cfg.conditions?.warmUp?.enabled).toBe(true);
  });
});

describe("timeline", () => {
  it("expands repeats and daily events in time order", () => {
    const hand = expandTimeline(load("hand-gel-tvoc-spikes")).filter((e) => e.spec.type === "hand-gel");
    expect(hand.map((e) => e.t - hand[0]!.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((h) => h * 3600));
    const daily = expandTimeline(load("poorly-ventilated-weeks"));
    expect(daily.filter((e) => e.spec.type === "occupants" && e.spec.activity === "sleeping")).toHaveLength(29);
    expect(daily.map((e) => e.t)).toEqual([...daily.map((e) => e.t)].sort((a, b) => a - b));
  });

  it("rejects bad scenarios with the path of the problem", () => {
    const ok = { id: "x", durationMinutes: 10, room: { id: "Room1", floorAreaM2: 19 } };
    expect(() => validateScenario({ ...ok, id: "Bad Id" })).toThrow(/id/);
    expect(() => validateScenario({ ...ok, room: { id: "Room1" } })).toThrow(/room\.floorAreaM2/);
    expect(() => validateScenario({ ...ok, timeline: [{ atMinutes: 1, type: "party" }] })).toThrow(/timeline\[0\]\.type/);
    expect(() => validateScenario({ ...ok, timeline: [{ atMinutes: 1, type: "occupants", who: "cat", activity: "seated", count: 1 }] })).toThrow(/who/);
    expect(() => validateScenario({ ...ok, daily: [{ at: "25:00", type: "door", open: true }] })).toThrow(/daily\[0\]\.at/);
    expect(() => validateScenario({ ...ok, sampleIntervalS: 7 })).toThrow(/multiple of 5/);
    expect(() => validateScenario({ ...ok, timeline: [{ atMinutes: 1, type: "set", values: { radon: 3 } }] })).toThrow(/radon/);
  });
});

describe("determinism", () => {
  it("same seed, same air; different seed, different jitter", () => {
    expect(sha(generate(load("lounge-afternoon"), "a").samples)).toBe(sha(gen("lounge-afternoon", "a").samples));
    expect(sha(gen("lounge-afternoon", "a").samples)).not.toBe(sha(gen("lounge-afternoon", "b").samples));
  });

  it("without jitter, the seed does not matter", () => {
    expect(sha(gen("step-changes", "a").samples)).toBe(sha(gen("step-changes", "b").samples));
  });

  it("matches the golden hashes (re-record only on purpose, and say why)", () => {
    const hashes = Object.fromEntries(ids.filter((id) => id !== "poorly-ventilated-weeks").map((id) => [id, sha(gen(id, "golden").samples)]));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "bedroom-night": "2a9db3a4f8d1d118",
        "cleaning-tvoc-spike": "dfc8dfa075522fc1",
        "cooking-pm-event": "aa122b8a605bab51",
        "door-closed-co2-rise": "93ad8bbd6bd8cc05",
        "ensuite-shower-humid": "77040ac48ae3ee57",
        "hand-gel-tvoc-spikes": "ab6fe7e986cc1ec6",
        "lounge-afternoon": "91f2930e436f6fab",
        "out-of-range-high": "b57ecff6ae51db81",
        "power-cycle-and-module-swap": "967cb95ec8df1a7b",
        "step-changes": "39f32a755b409ba6",
      }
    `);
  });
});

describe("through the default device", () => {
  it.each(ids.filter((id) => !["out-of-range-high", "poorly-ventilated-weeks"].includes(id)))("%s: every healthy reading is in spec", (id) => {
    const g = gen(id);
    const r = simulate({ deviceId: id, seed: id }, g.samples);
    expect(r.readings.length).toBeGreaterThan(0);
    expect(r.readings.filter((x) => isHealthy(x) && !withinEnvelope(x))).toEqual([]);
  });

  it("out-of-range-high: flags what is beyond the ranges", () => {
    const r = simulate({ deviceId: "d", seed: "d" }, gen("out-of-range-high").samples);
    const flags = new Set(r.readings.flatMap((x) => x.flags));
    expect([...flags]).toEqual(expect.arrayContaining(["out-of-range", "extended-range"]));
  });
});
