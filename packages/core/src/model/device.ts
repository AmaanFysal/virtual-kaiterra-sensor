// The virtual Sensedge Mini (docs/03). A streaming state machine stepped on the sampling grid:
// sample → lag → interval mean → bounded error → clamp → quantise →
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

function serialFor(seed: string, bay: number, installIndex: number): string {
  const n = parseInt(hashString(`${seed}/bay${bay}/install${installIndex}`), 16) % 100_000_000;
  return `VH${String(n).padStart(8, "0")}`;
}

export function createDevice(input: DeviceConfigInput | DeviceConfig): Device {
  const config = resolveConfig(input);
  const { seed, sampleIntervalS: dt, reportIntervalS: span, errorBudget } = config;
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
  const events: DeviceEvent[] = [...config.events].sort((a, b) => a.t - b.t);

  const modules: ModuleState[] = variant.bays.map((type, bay) => ({
    type,
    used: 1 - config.moduleLifetimePct[bay]! / 100,
    installIndex: 0,
    serial: serialFor(seed, bay, 0),
  }));

  const lag = new Map<string, number | undefined>();
  const alpha = new Map<string, number>(params.map((p) => [p, lagAlpha(SENSEDGE_MINI[p].t90.seconds, dt)]));

  const channels: string[] = [...params];
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
  const dropoutRng = new Map<ParamId, Rng>(params.map((p) => [p, stream(seed, "dropout", p)]));
  const deviceDropoutRng = stream(seed, "dropout", "device");
  const offlineRng = stream(seed, "offline");

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
        if (e.on) lag.clear();
        return;
      case "network": {
        const wasOnline = online();
        scheduledOnline = e.online;
        if (wasOnline !== online()) out.log.push({ t, kind: online() ? "online" : "offline" });
        if (!wasOnline && online()) flushBuffer(t, out);
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
        out.log.push({ t, kind: "module-replaced", bay: e.bay, module: m.type, serial: m.serial });
        return;
      }
      case "recalibrate":
        onboardAgeDays = 0;
        calibrationIndex += 1;
        variant.onboard.filter((p) => params.includes(p)).forEach(drawModuleErrors);
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
      return { param: p, noiseZ: z, dropoutU: dropoutRng.get(p)!.next() };
    });
    const deviceDropped = deviceDropoutRng.next() < config.availability.deviceDropoutPerMinute;
    const offlineU = offlineRng.next();
    const offlineLen = offlineRng.next();

    // Random network outages.
    if (outageUntil !== undefined && ts >= outageUntil) {
      outageUntil = undefined;
      if (scheduledOnline) {
        out.log.push({ t: ts, kind: "online" });
        flushBuffer(ts, out);
      }
    } else if (outageUntil === undefined && offlineU < config.availability.randomOfflinePerDay / (SECONDS_PER_DAY / span)) {
      const minutes = Math.max(1, Math.ceil(-Math.log(1 - offlineLen) * config.availability.randomOfflineMeanMinutes));
      if (scheduledOnline) out.log.push({ t: ts, kind: "offline" });
      outageUntil = ts + minutes * 60;
    }

    const readings: Reading[] = [];

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
      const v = r + boundedError(eq, errorBudget, { bias: biasDraw.get(p)!, drift: driftDraw.get(p)!, noiseZ: d.noiseZ }, used);

      if (used > 1) flags.push(moduleForParam(variant.bays, p) ? "module-expired" : "calibration-overdue");
      const [lo, hi] = specRange(p, config.specProfile);
      const [, reportHi] = reportRange(p, config.specProfile);
      if (r < lo || r > reportHi) flags.push("out-of-range");
      else if (r > hi) flags.push("extended-range");

      const value = quantise(p, Math.min(reportHi, Math.max(lo, v)));
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
        last = t - dt;
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
      };
    },
    undelivered() {
      return buffer.flat();
    },
  };
}
