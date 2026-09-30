// M7: the numbers behind the validation report (docs/08).

import { describe, expect, it } from "vitest";
import { simulate } from "../src/model/simulate.js";
import type { Reading } from "../src/model/types.js";
import { reportData } from "../src/validation/report.js";
import { T0, TYPICAL, series, steady } from "./helpers.js";

const MIN = 60;
const r = (ts: number, value: number, over: Partial<Reading> = {}): Reading => ({
  param: "co2",
  ts,
  span: 60,
  value,
  deliveredAt: ts,
  reference: 600,
  truth: 600,
  envelope: 58,
  flags: [],
  ...over,
});

describe("reportData", () => {
  it("counts in-spec shares, errors and missing intervals", () => {
    const readings = [r(T0 + 60, 610), r(T0 + 120, 590), r(T0 + 240, 700, { flags: ["outlier"] })];
    const d = reportData(readings);
    const co2 = d.params[0]!;
    expect(co2.readings).toBe(3);
    expect(co2.missing).toBe(1);
    expect(co2.healthy).toBe(2);
    expect(co2.healthyWithinShare).toBe(1);
    expect(co2.withinShare).toBeCloseTo(2 / 3);
    expect(co2.biasVsTruth).toBeCloseTo(100 / 3);
    expect(co2.maeVsTruth).toBeCloseTo(120 / 3);
    expect(co2.worstHealthyRatio).toBeCloseTo(10 / 58);
    expect(d.totals).toMatchObject({ readings: 3, healthy: 2, healthyWithin: 2, flagged: 1 });
  });

  it("merges consecutive flagged minutes into spans with their excess", () => {
    const readings = [r(T0 + 60, 700, { flags: ["warm-up"] }), r(T0 + 120, 620, { flags: ["warm-up"] }), r(T0 + 180, 600), r(T0 + 240, 680, { flags: ["warm-up"] })];
    const spans = reportData(readings).spans;
    expect(spans.map((s) => [s.from - T0, s.to - T0, s.readings])).toEqual([
      [60, 120, 2],
      [240, 240, 1],
    ]);
    expect(spans[0]!.maxExcess).toBeCloseTo(42);
    expect(spans[0]!.meanExcess).toBeCloseTo(21);
  });

  it("estimates the response lag near τ = T90/ln 10 on a step", () => {
    const air = series((s) => ({ ...TYPICAL, temp: s < 60 * MIN ? 20 : 26, rh: s < 60 * MIN ? 40 : 70, co2: s < 60 * MIN ? 500 : 2000 }), 180);
    const d = reportData(simulate({ deviceId: "d", seed: "lag", errorBudget: { bias: 0, drift: 0, noise: 0 } }, air).readings);
    for (const p of ["temp", "rh", "co2"] as const) {
      const s = d.params.find((x) => x.param === p)!;
      expect(Math.abs(s.lagMinutes! - s.expectedLagMinutes)).toBeLessThanOrEqual(1.5);
    }
  });

  it("leaves the lag blank when the truth barely moves", () => {
    const d = reportData(simulate({ deviceId: "d", seed: "flat" }, steady(TYPICAL, 60)).readings);
    expect(d.params.every((p) => p.lagMinutes === undefined)).toBe(true);
  });

  it("counts the device log", () => {
    const events = [{ t: T0 + 10 * MIN, kind: "power" as const, on: false }, { t: T0 + 20 * MIN, kind: "power" as const, on: true }];
    const res = simulate({ deviceId: "d", seed: "log", events }, steady(TYPICAL, 30));
    expect(reportData(res.readings, res.log).log).toMatchObject({ "power-off": 1, "power-on": 1 });
  });
});
