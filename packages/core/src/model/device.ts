// The virtual Sensedge Mini (docs/03). A streaming state machine stepped on the sampling grid:
// sample → lag → interval mean → bounded error → clamp → quantise. The batch runner and the
// plug-in adapter both drive this one engine.
//
// Determinism: every random component has its own named stream, and every stream is drawn a
// fixed number of times per reporting interval, so adding a feature never shifts the numbers
// of another.

import { PARAMS, type ParamId, type TrueAir } from "../params.js";
import { hashString, stream, type Rng } from "../rng.js";
import { MODULES, VARIANTS, moduleForParam, type ModuleType } from "../spec/modules.js";
import { SENSEDGE_MINI, envelope, quantisationError, quantise, reportRange, specRange } from "../spec/sensedge-mini.js";
import { resolveConfig, type DeviceConfig, type DeviceConfigInput } from "./config.js";
import { ar1, boundedError, usableEnvelope } from "./error.js";
import { lagAlpha, lagStep } from "./lag.js";
import type { DeviceStatus, Flag, ModuleStatus, StepResult } from "./types.js";

export interface Device {
  readonly config: DeviceConfig;
  /** Advance to `t` (a multiple of the sampling interval) with the true air at `t`; null if unknown. */
  step(t: number, air: TrueAir | null): StepResult;
  status(): DeviceStatus;
}

interface ModuleState {
  type: ModuleType;
  used: number;
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

  // Module health is fixed for now; aging and replacement come with the lifecycle (M3a).
  const modules: ModuleState[] = variant.bays.map((type, bay) => ({
    type,
    used: 1 - config.moduleLifetimePct[bay]! / 100,
    serial: serialFor(seed, bay, 0),
  }));

  const lag = new Map<string, number | undefined>();
  const alpha = new Map<string, number>(params.map((p) => [p, lagAlpha(SENSEDGE_MINI[p].t90.seconds, dt)]));

  const acc = new Map<string, Accumulator>();
  const resetAcc = () => {
    for (const key of params) acc.set(key, { count: 0, refSum: 0, trueSum: 0 });
  };
  resetAcc();

  // Error draws: bias and drift per module install (or on-board calibration), noise per parameter.
  const biasDraw = new Map<ParamId, number>();
  const driftDraw = new Map<ParamId, number>();
  for (const param of params) {
    const m = moduleForParam(variant.bays, param);
    const key = m ? [`bay${m.bay}`, "install0"] : ["onboard", "cal0"];
    biasDraw.set(param, stream(seed, ...key, "bias", param).uniform(-1, 1));
    driftDraw.set(param, stream(seed, ...key, "drift", param).uniform(-1, 1));
  }

  const noiseRng = new Map<ParamId, Rng>(params.map((p) => [p, stream(seed, "noise", p)]));
  const noiseZ = new Map<ParamId, number>(params.map((p) => [p, 0]));

  const usedFor = (param: ParamId): number => {
    const m = moduleForParam(variant.bays, param);
    return m ? modules[m.bay]!.used : config.onboardAgeDays / config.onboardDriftHorizonDays;
  };

  // --- one sampling tick -------------------------------------------------------------------
  const tick = (t: number, air: TrueAir | null, out: StepResult) => {
    for (const key of params) {
      const x = air?.[key];
      if (x === undefined || !Number.isFinite(x)) continue;
      const a = acc.get(key)!;
      const y = lagStep(lag.get(key), x, alpha.get(key)!);
      lag.set(key, y);
      a.refSum += y;
      a.trueSum += x;
      a.count += 1;
    }
    if (t % span === 0) closeInterval(t, out);
  };

  // --- one reporting interval --------------------------------------------------------------
  const closeInterval = (ts: number, out: StepResult) => {
    const windowStart = ts - span;
    const partialStart = startedAt !== undefined && windowStart < startedAt - dt;

    for (const p of params) {
      const z = ar1(noiseZ.get(p)!, config.noiseAutocorrelation, noiseRng.get(p)!.normal());
      noiseZ.set(p, z);
      const a = acc.get(p)!;
      if (a.count < config.minCoverage * samplesPerInterval) {
        if (!partialStart) out.log.push({ t: ts, kind: "no-input", ts, param: p });
        continue;
      }
      const r = a.refSum / a.count;
      const truth = a.trueSum / a.count;
      const e = envelope(p, config.specProfile, r);
      const q = quantisationError(p);
      const used = usedFor(p);
      const flags: Flag[] = [];
      const v = r + boundedError(usableEnvelope(e, q), errorBudget, { bias: biasDraw.get(p)!, drift: driftDraw.get(p)!, noiseZ: z }, used);

      if (used > 1) flags.push(moduleForParam(variant.bays, p) ? "module-expired" : "calibration-overdue");
      const [lo, hi] = specRange(p, config.specProfile);
      const [, reportHi] = reportRange(p, config.specProfile);
      if (r < lo || r > reportHi) flags.push("out-of-range");
      else if (r > hi) flags.push("extended-range");

      const m = moduleForParam(variant.bays, p);
      out.delivered.push({
        param: p,
        ts,
        span,
        value: quantise(p, Math.min(reportHi, Math.max(lo, v))),
        ...(m ? { source: m.module.source } : {}),
        reference: r,
        truth,
        envelope: e,
        flags,
      });
    }
    resetAcc();
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
    status() {
      const moduleStatus: ModuleStatus[] = modules.map((m, bay) => ({
        bay,
        type: m.type,
        source: MODULES[m.type].source,
        serial: m.serial,
        lifetimePct: Math.max(0, Math.round((1 - m.used) * 10_000) / 100),
      }));
      return { t: last, modules: moduleStatus, onboardAgeDays: config.onboardAgeDays };
    },
  };
}
