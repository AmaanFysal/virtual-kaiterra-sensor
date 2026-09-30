// M3a: device lifecycle and availability (docs/03).

import { describe, expect, it } from "vitest";
import { createDevice } from "../src/model/device.js";
import { simulate, seriesOf } from "../src/model/simulate.js";
import { SIM_DEFAULT_START_T, simToUnix } from "../src/time.js";
import { isHealthy, withinEnvelope } from "../src/validation/envelope.js";
import { T0, TYPICAL, randomWalk, steady } from "./helpers.js";

const MIN = 60;
const DAY = 86_400;

describe("module aging", () => {
  it("loses lifetime_pct with running hours, faster at high PM2.5 (S6, S7)", () => {
    const clean = simulate({ deviceId: "d", seed: "age" }, steady({ ...TYPICAL, pm25: 20 }, 24 * 60, 60));
    const dirty = simulate({ deviceId: "d", seed: "age" }, steady({ ...TYPICAL, pm25: 300 }, 24 * 60, 60));
    const km200Clean = 100 - clean.status.modules[0]!.lifetimePct;
    const km200Dirty = 100 - dirty.status.modules[0]!.lifetimePct;
    expect(km200Clean).toBeCloseTo(100 / 730, 2); // 2 years at low exposure
    expect(km200Dirty).toBeCloseTo(100 / (1.3 * 365), 2); // 1.3 years above 200 µg/m³
    expect(clean.status.modules[1]!.lifetimePct).toBeCloseTo(100 - 100 / (1.75 * 365), 2);
  });

  it("does not age modules while powered off", () => {
    const d = createDevice({ deviceId: "d", seed: "off", events: [{ t: T0, kind: "power", on: false }] });
    for (let t = T0; t <= T0 + DAY; t += 60 * 5) d.step(t, TYPICAL);
    expect(d.status().modules[0]!.lifetimePct).toBe(100);
  });

  it("flags readings from an expired module, and lets its drift leave the envelope", () => {
    const r = simulate({ deviceId: "d", seed: "expired", moduleLifetimePct: [0, 100], errorBudget: { bias: 0, drift: 1, noise: 0 } }, steady(TYPICAL, 30));
    const pm = seriesOf(r.readings, "pm25");
    expect(pm.every((x) => x.flags.includes("module-expired"))).toBe(true);
    expect(seriesOf(r.readings, "tvoc").every(isHealthy)).toBe(true);
  });

  it("flags on-board sensors past their drift horizon until recalibrated", () => {
    const events = [{ t: T0 + 30 * MIN, kind: "recalibrate" as const }];
    const r = simulate({ deviceId: "d", seed: "cal", onboardAgeDays: 800, events }, steady(TYPICAL, 60));
    const co2 = seriesOf(r.readings, "co2");
    // Events apply at the first tick at or after their time, before that tick closes its minute.
    expect(co2.filter((x) => x.ts < T0 + 30 * MIN).every((x) => x.flags.includes("calibration-overdue"))).toBe(true);
    expect(co2.filter((x) => x.ts > T0 + 31 * MIN).every(isHealthy)).toBe(true);
    expect(r.log.some((e) => e.kind === "recalibrated")).toBe(true);
  });
});

describe("module replacement", () => {
  const events = [{ t: T0 + 30 * MIN, kind: "replace-module" as const, bay: 0 as const }];
  const before = simulate({ deviceId: "d", seed: "swap", moduleLifetimePct: [3, 80] }, steady(TYPICAL, 20));
  const after = simulate({ deviceId: "d", seed: "swap", moduleLifetimePct: [3, 80], events }, steady(TYPICAL, 60));

  it("resets health to 100%, gives a new serial and logs it", () => {
    expect(after.status.modules[0]!.lifetimePct).toBeGreaterThan(99.9);
    expect(after.status.modules[0]!.installIndex).toBe(1);
    expect(after.status.modules[0]!.serial).not.toBe(before.status.modules[0]!.serial);
    expect(after.status.modules[1]!.lifetimePct).toBeLessThan(80);
    const entry = after.log.find((e) => e.kind === "module-replaced");
    expect(entry).toMatchObject({ bay: 0, module: "KM-200" });
  });

  it("draws a new bias for the new module and leaves the other bay alone", () => {
    const pmBefore = seriesOf(after.readings, "pm25").filter((x) => x.ts <= T0 + 30 * MIN);
    const pmAfter = seriesOf(after.readings, "pm25").filter((x) => x.ts > T0 + 32 * MIN);
    const mean = (xs: { value: number; reference: number }[]) => xs.reduce((s, x) => s + x.value - x.reference, 0) / xs.length;
    expect(mean(pmBefore)).not.toBeCloseTo(mean(pmAfter), 1);
    const tvocBoth = seriesOf(after.readings, "tvoc").filter((x) => x.ts <= T0 + 20 * MIN).map((x) => x.value);
    expect(seriesOf(before.readings, "tvoc").map((x) => x.value)).toEqual(tvocBoth);
  });
});

describe("dropouts", () => {
  it("drops about the configured share of minutes, and logs each one", () => {
    const r = simulate({ deviceId: "d", seed: "drop", params: ["co2"], availability: { paramDropoutPerMinute: 0.1 } }, steady(TYPICAL, 2000, 60));
    const missing = 2000 - r.readings.length;
    expect(missing / 2000).toBeGreaterThan(0.07);
    expect(missing / 2000).toBeLessThan(0.13);
    expect(r.log.filter((e) => e.kind === "dropout").length).toBe(missing);
  });

  it("device dropouts remove every parameter of a minute together", () => {
    const r = simulate({ deviceId: "d", seed: "dev-drop", availability: { deviceDropoutPerMinute: 0.2 } }, steady(TYPICAL, 300, 60));
    const perMinute = new Map<number, number>();
    for (const x of r.readings) perMinute.set(x.ts, (perMinute.get(x.ts) ?? 0) + 1);
    expect(new Set(perMinute.values())).toEqual(new Set([7]));
    expect(perMinute.size).toBeLessThan(290);
  });
});

describe("offline periods and the one-hour onboard buffer (S1, S2)", () => {
  it("buffers readings while offline and backfills them on reconnect", () => {
    const events = [
      { t: T0 + 10 * MIN, kind: "network" as const, online: false },
      { t: T0 + 40 * MIN, kind: "network" as const, online: true },
    ];
    const r = simulate({ deviceId: "d", seed: "net", params: ["pm25"], events }, steady(TYPICAL, 60));
    const pm = seriesOf(r.readings, "pm25");
    expect(pm.length).toBe(60);
    const backfilled = pm.filter((x) => x.flags.includes("backfilled"));
    expect(backfilled.map((x) => (x.ts - T0) / MIN)).toEqual([...Array(30).keys()].map((i) => i + 10));
    expect(backfilled.every((x) => x.deliveredAt === T0 + 40 * MIN)).toBe(true);
    expect(pm.filter((x) => !x.flags.includes("backfilled")).every((x) => x.deliveredAt === x.ts)).toBe(true);
    expect(backfilled.every((x) => isHealthy(x) && withinEnvelope(x))).toBe(true);
  });

  it("loses the oldest minutes when an outage outlasts the hour", () => {
    const events = [
      { t: T0 + 10 * MIN, kind: "network" as const, online: false },
      { t: T0 + 100 * MIN, kind: "network" as const, online: true },
    ];
    const r = simulate({ deviceId: "d", seed: "net", params: ["pm25"], events }, steady(TYPICAL, 120));
    const minutes = seriesOf(r.readings, "pm25").map((x) => (x.ts - T0) / MIN);
    expect(minutes).not.toContain(39);
    expect(minutes).toContain(40);
    expect(minutes.filter((m) => m >= 10 && m < 100).length).toBe(60);
    expect(r.log.filter((e) => e.kind === "buffer-overflow").length).toBe(30);
  });

  it("keeps readings undelivered when the run ends offline", () => {
    const events = [{ t: T0 + 50 * MIN, kind: "network" as const, online: false }];
    const r = simulate({ deviceId: "d", seed: "net", params: ["pm25"], events }, steady(TYPICAL, 60));
    expect(r.undelivered.length).toBe(11); // minutes ending 50..60: the minute ending at the event is already offline
    expect(r.status.online).toBe(false);
  });

  it("random outages happen at the configured rate and are reproducible", () => {
    const cfg = { deviceId: "d", seed: "outage", params: ["co2" as const], availability: { randomOfflinePerDay: 4, randomOfflineMeanMinutes: 20 } };
    const a = simulate(cfg, steady(TYPICAL, 7 * 24 * 60, 60));
    const b = simulate(cfg, steady(TYPICAL, 7 * 24 * 60, 60));
    const outages = a.log.filter((e) => e.kind === "offline").length;
    expect(outages).toBeGreaterThan(14);
    expect(outages).toBeLessThan(45);
    expect(a.log).toEqual(b.log);
    expect(a.readings.some((x) => x.flags.includes("backfilled"))).toBe(true);
  });
});

describe("power", () => {
  it("reports nothing while powered off", () => {
    const events = [
      { t: T0 + 10 * MIN, kind: "power" as const, on: false },
      { t: T0 + 20 * MIN, kind: "power" as const, on: true },
    ];
    const r = simulate({ deviceId: "d", seed: "pwr", params: ["co2"], events }, steady(TYPICAL, 30));
    const minutes = seriesOf(r.readings, "co2").map((x) => (x.ts - T0) / MIN);
    expect(minutes.some((m) => m > 10 && m <= 20)).toBe(false);
    expect(minutes).toContain(21);
    expect(r.log.map((e) => e.kind)).toEqual(expect.arrayContaining(["power-off", "power-on"]));
  });
});

describe("plug-in style stepping on the care home clock", () => {
  it("accepts the sim's 5 s ticks from its default start, with injected events", () => {
    const d = createDevice({ deviceId: "room1", seed: "sim" });
    let delivered = 0;
    for (let t = SIM_DEFAULT_START_T; t < SIM_DEFAULT_START_T + 3600; t += 5) {
      if (t === SIM_DEFAULT_START_T + 1800) d.apply({ t: simToUnix(t) + 5, kind: "replace-module", bay: 1 });
      delivered += d.step(simToUnix(t), TYPICAL).delivered.length;
    }
    expect(delivered).toBe(59 * 7); // the first minute is partial, so 59 full minutes × 7 parameters
    expect(d.status().modules[1]!.installIndex).toBe(1);
  });

  it("gives the same readings stepped live as in batch", () => {
    const input = randomWalk("live", 60).filter((s) => s.t % 5 === 0);
    const d = createDevice({ deviceId: "d", seed: "live" });
    const live = input.flatMap((s) => d.step(s.t, s.air).delivered);
    const batch = simulate({ deviceId: "d", seed: "live" }, input, { maxGapS: 0 }).readings;
    expect(live.map((r) => [r.param, r.ts, r.value])).toEqual(batch.map((r) => [r.param, r.ts, r.value]));
  });
});
