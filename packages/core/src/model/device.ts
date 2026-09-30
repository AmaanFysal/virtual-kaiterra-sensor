// The virtual Sensedge Mini (docs/03). A streaming state machine stepped on the sampling grid:
// sample → lag → interval mean → bounded error → condition effects → clamp → quantise →
// availability (dropouts, offline buffer, backfill). The batch runner and the plug-in adapter
// both drive this one engine.
//
// Determinism: every random component has its own named stream, and every stream is drawn a
// fixed number of times per reporting interval whatever the switches say, so turning one
// feature on never shifts the numbers of another.

import { PARAMS, type ParamId, type TrueAir } from "../params.js";
import { hashString, stream, type Rng } from "../rng.js";
import { MODULES, VARIANTS, moduleForParam, type ModuleType } from "../spec/modules.js";
import { SENSEDGE_MINI, envelope, quantisationError, quantise, reportRange, specRange } from "../spec/sensedge-mini.js";
import { SECONDS_PER_DAY } from "../time.js";
import { resolveConfig, type DeviceConfig, type DeviceConfigInput, type DeviceEvent } from "./config.js";
import { moxTerms, ouStep, pmHumidityGrowth, technologyOf, warmUpOffset } from "./conditions.js";
import { ar1, boundedError, usableEnvelope } from "./error.js";
import { lagAlpha, lagStep } from "./lag.js";
import type { DeviceStatus, Flag, LogEntry, ModuleStatus, Reading, StepResult } from "./types.js";

export interface Device {
  readonly config: DeviceConfig;
  /** Advance to `t` (a multiple of the sampling interval) with the true air at `t`; null if unknown. */
  step(t: number, air: TrueAir | null): StepResult;
  /** Queue an event (power, network, module replacement, recalibration) at or after the current time. */
  apply(event: DeviceEvent): void;
  status(): DeviceStatus;
  /** Readings still in the onboard buffer (not yet delivered). */
  undelivered(): Reading[];
}

interface ModuleState {
  type: ModuleType;
  used: number;
  installIndex: number;
  serial: string;
}

interface Accumulator {
  count: number;
  refSum: number;
  trueSum: number;
}

const PM_PARAMS: readonly ParamId[] = ["pm1", "pm25", "pm10"];

function serialFor(seed: string, bay: number, installIndex: number): string {
  const n = parseInt(hashString(`${seed}/bay${bay}/install${installIndex}`), 16) % 100_000_000;
  return `VH${String(n).padStart(8, "0")}`;
}

export function createDevice(input: DeviceConfigInput | DeviceConfig): Device {
  const config = resolveConfig(input);
  const { seed, sampleIntervalS: dt, reportIntervalS: span, errorBudget, conditions: cond } = config;
  const variant = VARIANTS[config.variant];
  const params = PARAMS.filter((p) => config.params.includes(p));
  const samplesPerInterval = span / dt;

  // --- state -------------------------------------------------------------------------------
  let last: number | undefined;
  let startedAt: number | undefined;
  let powered = true;
  let scheduledOnline = true;
  let outageUntil: number | undefined;
  let onboardAgeDays = config.onboardAgeDays;
  let calibrationIndex = 0;
  let handshakeT: number | undefined;
  const events: DeviceEvent[] = [...config.events].sort((a, b) => a.t - b.t);

  const modules: ModuleState[] = variant.bays.map((type, bay) => ({
    type,
    used: 1 - config.moduleLifetimePct[bay]! / 100,
    installIndex: 0,
    serial: serialFor(seed, bay, 0),
  }));

  const lag = new Map<string, number | undefined>();
  const alpha = new Map<string, number>(params.map((p) => [p, lagAlpha(SENSEDGE_MINI[p].t90.seconds, dt)]));
  alpha.set("ethanol", lagAlpha(SENSEDGE_MINI.tvoc.t90.seconds, dt));

  // Channels sampled each tick: the reported parameters plus the condition inputs, once each.
  const channels: string[] = [...new Set<string>([...params, "ethanol", "rh", "temp"])];
  const acc = new Map<string, Accumulator>();
  const resetAcc = () => {
    for (const key of channels) acc.set(key, { count: 0, refSum: 0, trueSum: 0 });
  };
  resetAcc();
  let poweredTicks = 0;

  // Error draws: bias and drift per module install (or on-board calibration), noise per parameter.
  const biasDraw = new Map<ParamId, number>();
  const driftDraw = new Map<ParamId, number>();
  const drawModuleErrors = (param: ParamId) => {
    const m = moduleForParam(variant.bays, param);
    const key = m ? [`bay${m.bay}`, `install${modules[m.bay]!.installIndex}`] : ["onboard", `cal${calibrationIndex}`];
    biasDraw.set(param, stream(seed, ...key, "bias", param).uniform(-1, 1));
    driftDraw.set(param, stream(seed, ...key, "drift", param).uniform(-1, 1));
  };
  params.forEach(drawModuleErrors);

  const noiseRng = new Map<ParamId, Rng>(params.map((p) => [p, stream(seed, "noise", p)]));
  const noiseZ = new Map<ParamId, number>(params.map((p) => [p, 0]));
  const outlierRng = new Map<ParamId, Rng>(params.map((p) => [p, stream(seed, "outlier", p)]));
  const dropoutRng = new Map<ParamId, Rng>(params.map((p) => [p, stream(seed, "dropout", p)]));
  const deviceDropoutRng = stream(seed, "dropout", "device");
  const offlineRng = stream(seed, "offline");
  const baselineRng = stream(seed, "mox-baseline");
  let moxBaseline = 0;

  // Warm-up: start time and signed initial size (in envelopes) per parameter.
  const warmUp = new Map<ParamId, { start: number; initial: number }>();
  let warmUpCount = 0;
  const startWarmUp = (t: number, which: readonly ParamId[]) => {
    if (!cond.warmUp.enabled) return;
    for (const p of which) {
      if (!params.includes(p)) continue;
      const rng = stream(seed, "warm-up", p, String(warmUpCount));
      const sign = rng.chance(0.5) ? 1 : -1;
      warmUp.set(p, { start: t, initial: sign * rng.uniform(0.5, 1) * cond.warmUp.initialEnvelopes });
    }
    warmUpCount += 1;
  };

  // ABC: offset applied to CO2, and the lowest reading of the current period.
  let abcOffset = 0;
  let abcPeriodMin = Infinity;
  let abcPoweredSeconds = 0;

  // Offline buffer: one group of readings per reporting interval.
  const buffer: Reading[][] = [];

  // --- helpers -----------------------------------------------------------------------------
  const online = () => scheduledOnline && outageUntil === undefined;

  const usedFor = (param: ParamId): number => {
    const m = moduleForParam(variant.bays, param);
    return m ? modules[m.bay]!.used : onboardAgeDays / config.onboardDriftHorizonDays;
  };

  const flushBuffer = (t: number, out: StepResult) => {
    for (const group of buffer) {
      for (const r of group) out.delivered.push({ ...r, deliveredAt: t, flags: [...r.flags, "backfilled"] });
    }
    buffer.length = 0;
  };

  const applyEvent = (e: DeviceEvent, t: number, out: StepResult) => {
    switch (e.kind) {
      case "power":
        if (e.on === powered) return;
        powered = e.on;
        out.log.push({ t, kind: e.on ? "power-on" : "power-off" });
        if (e.on) {
          lag.clear();
          if (online()) handshakeT = t;
          startWarmUp(t, params);
        }
        return;
      case "network": {
        const wasOnline = online();
        scheduledOnline = e.online;
        if (wasOnline !== online()) out.log.push({ t, kind: online() ? "online" : "offline" });
        if (!wasOnline && online()) {
          handshakeT = t;
          flushBuffer(t, out);
        }
        return;
      }
      case "replace-module": {
        const m = modules[e.bay]!;
        m.used = 0;
        m.installIndex += 1;
        m.serial = serialFor(seed, e.bay, m.installIndex);
        const moduleParams = MODULES[m.type].params.filter((p) => params.includes(p));
        moduleParams.forEach(drawModuleErrors);
        for (const p of moduleParams) lag.delete(p);
        if (moduleParams.includes("tvoc")) lag.delete("ethanol");
        out.log.push({ t, kind: "module-replaced", bay: e.bay, module: m.type, serial: m.serial });
        startWarmUp(t, moduleParams);
        return;
      }
      case "recalibrate":
        onboardAgeDays = 0;
        calibrationIndex += 1;
        variant.onboard.filter((p) => params.includes(p)).forEach(drawModuleErrors);
        abcOffset = 0;
        out.log.push({ t, kind: "recalibrated" });
        return;
    }
  };

  const moduleLifeDays = (m: ModuleState, pm25: number | undefined): number => {
    const spec = MODULES[m.type];
    const high = spec.highExposureLifeDays;
    if (high === undefined || pm25 === undefined || pm25 <= 100) return spec.lifeDays;
    if (pm25 >= 200) return high;
    return spec.lifeDays + ((pm25 - 100) / 100) * (high - spec.lifeDays);
  };

  // --- one sampling tick -------------------------------------------------------------------
  const tick = (t: number, air: TrueAir | null, out: StepResult) => {
    while (events.length > 0 && events[0]!.t <= t) applyEvent(events.shift()!, t, out);

    onboardAgeDays += dt / SECONDS_PER_DAY;
    if (powered) {
      poweredTicks += 1;
      abcPoweredSeconds += dt;
      for (const m of modules) m.used += dt / (moduleLifeDays(m, air?.pm25) * SECONDS_PER_DAY);
      for (const key of channels) {
        const x = air?.[key as keyof TrueAir];
        if (x === undefined || !Number.isFinite(x)) continue;
        const a = acc.get(key)!;
        if (alpha.has(key)) {
          const y = lagStep(lag.get(key), x, alpha.get(key)!);
          lag.set(key, y);
          a.refSum += y;
        } else {
          a.refSum += x;
        }
        a.trueSum += x;
        a.count += 1;
      }
    }

    if (t % span === 0) closeInterval(t, out);
  };

  // --- one reporting interval --------------------------------------------------------------
  const closeInterval = (ts: number, out: StepResult) => {
    const windowStart = ts - span;
    const partialStart = startedAt !== undefined && windowStart < startedAt - dt;

    // Unconditional draws, in a fixed order.
    const draws = params.map((p) => {
      const z = ar1(noiseZ.get(p)!, config.noiseAutocorrelation, noiseRng.get(p)!.normal());
      noiseZ.set(p, z);
      const o = outlierRng.get(p)!;
      return { param: p, noiseZ: z, outlierU: o.next(), outlierSign: o.next() < 0.5 ? -1 : 1, outlierExcess: -Math.log(1 - o.next()), dropoutU: dropoutRng.get(p)!.next() };
    });
    const deviceDropped = deviceDropoutRng.next() < config.availability.deviceDropoutPerMinute;
    const offlineU = offlineRng.next();
    const offlineLen = offlineRng.next();
    const baselineEps = baselineRng.normal();
    moxBaseline = ouStep(moxBaseline, cond.mox.baselineSdPpb, cond.mox.baselineTauDays, span / SECONDS_PER_DAY, baselineEps);

    // Random network outages.
    if (outageUntil !== undefined && ts >= outageUntil) {
      outageUntil = undefined;
      if (scheduledOnline) {
        out.log.push({ t: ts, kind: "online" });
        handshakeT = ts;
        flushBuffer(ts, out);
      }
    } else if (outageUntil === undefined && offlineU < config.availability.randomOfflinePerDay / (SECONDS_PER_DAY / span)) {
      const minutes = Math.max(1, Math.ceil(-Math.log(1 - offlineLen) * config.availability.randomOfflineMeanMinutes));
      if (scheduledOnline) out.log.push({ t: ts, kind: "offline" });
      outageUntil = ts + minutes * 60;
    }

    const acceptAbcPeriod = cond.abc.enabled && abcPoweredSeconds >= cond.abc.periodHours * 3600;
    const readings: Reading[] = [];
    const rhAcc = acc.get("rh")!;
    const tempAcc = acc.get("temp")!;
    const ethAcc = acc.get("ethanol")!;
    const rh = rhAcc.count > 0 ? rhAcc.trueSum / rhAcc.count : undefined;
    const temp = tempAcc.count > 0 ? tempAcc.trueSum / tempAcc.count : undefined;
    const ethanolLagged = ethAcc.count > 0 ? ethAcc.refSum / ethAcc.count : undefined;

    for (const d of draws) {
      const p = d.param;
      const a = acc.get(p)!;
      if (poweredTicks === 0) continue;
      if (a.count < config.minCoverage * samplesPerInterval) {
        if (!partialStart) out.log.push({ t: ts, kind: "no-input", ts, param: p });
        continue;
      }
      const r = a.refSum / a.count;
      const truth = a.trueSum / a.count;
      const e = envelope(p, config.specProfile, r);
      const q = quantisationError(p);
      const eq = usableEnvelope(e, q);
      const used = usedFor(p);
      const flags: Flag[] = [];
      let v = r + boundedError(eq, errorBudget, { bias: biasDraw.get(p)!, drift: driftDraw.get(p)!, noiseZ: d.noiseZ }, used);

      const flagIf = (delta: number, flag: Flag) => {
        if (Math.abs(delta) > q) flags.push(flag);
      };
      if (cond.pmHumidity.enabled && PM_PARAMS.includes(p) && rh !== undefined) {
        const delta = r * (pmHumidityGrowth(rh, cond.pmHumidity) - 1);
        v += delta;
        flagIf(delta, "pm-humidity");
      }
      if (cond.mox.enabled && p === "tvoc") {
        const terms = moxTerms(r, rh, temp, ethanolLagged, cond.mox);
        v += terms.humidity + terms.temperature + terms.ethanol + moxBaseline;
        flagIf(terms.humidity, "mox-humidity");
        flagIf(terms.temperature, "mox-temperature");
        flagIf(terms.ethanol, "mox-ethanol");
        flagIf(moxBaseline, "mox-baseline");
      }
      if (cond.abc.enabled && p === "co2") {
        v += abcOffset;
        abcPeriodMin = Math.min(abcPeriodMin, v);
        flagIf(abcOffset, "abc-offset");
      }
      const w = warmUp.get(p);
      let suppress = false;
      if (w !== undefined) {
        // An interval that overlaps the warm-up is affected; its mean offset is taken at the midpoint.
        const duration = cond.warmUp.seconds[technologyOf(p)];
        if (windowStart < w.start + duration) {
          v += warmUpOffset(w.initial * e, Math.max(0, ts - span / 2 - w.start), duration);
          flags.push("warm-up");
          suppress = cond.warmUp.suppress;
        } else {
          warmUp.delete(p);
        }
      }
      if (cond.outliers.enabled && d.outlierU < cond.outliers.perReading) {
        v = r + d.outlierSign * (e + q + d.outlierExcess * cond.outliers.meanExcessEnvelopes * e);
        flags.push("outlier");
      }
      if (used > 1) flags.push(moduleForParam(variant.bays, p) ? "module-expired" : "calibration-overdue");
      const [lo, hi] = specRange(p, config.specProfile);
      const [, reportHi] = reportRange(p, config.specProfile);
      if (r < lo || r > reportHi) flags.push("out-of-range");
      else if (r > hi) flags.push("extended-range");

      const value = quantise(p, Math.min(reportHi, Math.max(lo, v)));
      if (suppress) continue;
      if (deviceDropped || d.dropoutU < config.availability.paramDropoutPerMinute) {
        out.log.push({ t: ts, kind: "dropout", ts, param: deviceDropped ? "all" : p });
        continue;
      }
      const m = moduleForParam(variant.bays, p);
      readings.push({
        param: p,
        ts,
        span,
        value,
        ...(m ? { source: m.module.source } : {}),
        deliveredAt: ts,
        reference: r,
        truth,
        envelope: e,
        flags,
      });
    }

    if (acceptAbcPeriod) {
      if (Number.isFinite(abcPeriodMin)) {
        const step = cond.abc.targetPpm - abcPeriodMin;
        abcOffset += Math.max(-cond.abc.maxStepPpm, Math.min(cond.abc.maxStepPpm, step));
      }
      abcPeriodMin = Infinity;
      abcPoweredSeconds = 0;
    }

    resetAcc();
    poweredTicks = 0;
    if (readings.length === 0) return;
    if (online()) {
      out.delivered.push(...readings);
    } else {
      buffer.push(readings);
      while (buffer.length > config.availability.bufferMinutes) {
        const lost = buffer.shift()!;
        out.log.push({ t: ts, kind: "buffer-overflow", ts: lost[0]!.ts });
      }
    }
  };

  // --- public interface --------------------------------------------------------------------
  return {
    config,
    step(t, air) {
      if (!Number.isInteger(t) || t % dt !== 0) throw new Error(`step time ${t} is not on the ${dt} s grid`);
      if (last !== undefined && t <= last) throw new Error(`step time ${t} is not after ${last}`);
      const out: StepResult = { delivered: [], log: [] };
      if (last === undefined) {
        startedAt = t;
        handshakeT = t;
        last = t - dt;
        if (cond.warmUp.enabled && cond.warmUp.atStart) startWarmUp(t, params);
      }
      for (let tt = last + dt; tt <= t; tt += dt) tick(tt, tt === t ? air : null, out);
      last = t;
      out.delivered.sort((a, b) => a.ts - b.ts || PARAMS.indexOf(a.param) - PARAMS.indexOf(b.param));
      return out;
    },
    apply(event) {
      if (last !== undefined && event.t <= last) throw new Error(`event at ${event.t} is not after the current time ${last}`);
      const i = events.findIndex((e) => e.t > event.t);
      events.splice(i === -1 ? events.length : i, 0, event);
    },
    status() {
      const moduleStatus: ModuleStatus[] = modules.map((m, bay) => ({
        bay,
        type: m.type,
        source: MODULES[m.type].source,
        serial: m.serial,
        lifetimePct: Math.max(0, Math.round((1 - m.used) * 10_000) / 100),
        installIndex: m.installIndex,
      }));
      return {
        t: last,
        powered,
        online: online(),
        bufferedMinutes: buffer.length,
        modules: moduleStatus,
        onboardAgeDays,
        abcOffsetPpm: abcOffset,
        handshakeT,
      };
    },
    undelivered() {
      return buffer.flat();
    },
  };
}
