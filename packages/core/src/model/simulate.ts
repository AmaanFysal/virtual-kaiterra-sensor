// Batch mode (docs/03): a true-air series in, every reading the device would report out.
// Irregular input is resampled onto the device's sampling grid by linear interpolation;
// gaps longer than `maxGapS` count as "no air known".

import { PARAMS, type ParamId, type TrueAir, type TrueAirSample } from "../params.js";
import type { DeviceConfig, DeviceConfigInput } from "./config.js";
import { createDevice } from "./device.js";
import type { DeviceStatus, LogEntry, Reading } from "./types.js";

export interface SimulateOptions {
  /** Longest input gap bridged by interpolation, seconds (default 600). */
  maxGapS?: number;
}

export interface SimulationResult {
  config: DeviceConfig;
  /** Delivered readings, sorted by (ts, param). */
  readings: Reading[];
  /** Readings still in the onboard buffer at the end (the device was offline). */
  undelivered: Reading[];
  log: LogEntry[];
  status: DeviceStatus;
}

/** Linear interpolation of every key present on both sides; keys on only one side are unknown. */
export function interpolate(a: TrueAirSample, b: TrueAirSample, t: number): TrueAir {
  if (t === a.t) return a.air;
  if (t === b.t) return b.air;
  const f = (t - a.t) / (b.t - a.t);
  const out: TrueAir = {};
  for (const key of Object.keys(a.air) as (keyof TrueAir)[]) {
    const va = a.air[key];
    const vb = b.air[key];
    if (va !== undefined && vb !== undefined) out[key] = va + (vb - va) * f;
  }
  return out;
}

export function simulate(configInput: DeviceConfigInput | DeviceConfig, samples: readonly TrueAirSample[], options: SimulateOptions = {}): SimulationResult {
  const device = createDevice(configInput);
  const dt = device.config.sampleIntervalS;
  const maxGap = options.maxGapS ?? 600;
  const sorted = [...samples].sort((x, y) => x.t - y.t);
  const readings: Reading[] = [];
  const log: LogEntry[] = [];
  if (sorted.length === 0) return { config: device.config, readings, undelivered: [], log, status: device.status() };

  const first = Math.ceil(sorted[0]!.t / dt) * dt;
  const lastT = Math.floor(sorted[sorted.length - 1]!.t / dt) * dt;
  let i = 0;
  for (let t = first; t <= lastT; t += dt) {
    while (i + 1 < sorted.length && sorted[i + 1]!.t <= t) i += 1;
    const a = sorted[i]!;
    const b = sorted[i + 1];
    let air: TrueAir | null = null;
    if (a.t === t) air = a.air;
    else if (b !== undefined && b.t - a.t <= maxGap) air = interpolate(a, b, t);
    const out = device.step(t, air);
    readings.push(...out.delivered);
    log.push(...out.log);
  }
  readings.sort((x, y) => x.ts - y.ts || PARAMS.indexOf(x.param) - PARAMS.indexOf(y.param));
  return { config: device.config, readings, undelivered: device.undelivered(), log, status: device.status() };
}

/** Readings of one parameter, in time order. */
export function seriesOf(readings: readonly Reading[], param: ParamId): Reading[] {
  return readings.filter((r) => r.param === param).sort((a, b) => a.ts - b.ts);
}
