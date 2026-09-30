// Incremental replay (docs/06): a device stepped through a recorded true-air series only as far
// as a query time, so a server can answer "what had the cloud received by now?" with the
// device's state (module health, handshake, buffer) as of now. Batch `simulate` uses the same
// air cursor, so both paths give identical readings.

import type { TrueAir, TrueAirSample } from "../params.js";
import type { DeviceConfig, DeviceConfigInput } from "./config.js";
import { createDevice, type Device } from "./device.js";
import type { DeviceStatus, LogEntry, Reading } from "./types.js";

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

export interface AirCursor {
  /** First and last sampling-grid times covered by the series. */
  first: number;
  last: number;
  /** True air at grid time `t` (non-decreasing between calls); null when unknown. */
  at(t: number): TrueAir | null;
}

/** Walks a true-air series forwards, interpolating onto the grid and treating long gaps as unknown. */
export function createAirCursor(samples: readonly TrueAirSample[], dt: number, maxGapS: number): AirCursor {
  const sorted = [...samples].sort((x, y) => x.t - y.t);
  let i = 0;
  return {
    first: sorted.length === 0 ? 0 : Math.ceil(sorted[0]!.t / dt) * dt,
    last: sorted.length === 0 ? -1 : Math.floor(sorted[sorted.length - 1]!.t / dt) * dt,
    at(t) {
      while (i + 1 < sorted.length && sorted[i + 1]!.t <= t) i += 1;
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a === undefined || a.t > t) return null;
      if (a.t === t) return a.air;
      if (b !== undefined && b.t - a.t <= maxGapS) return interpolate(a, b, t);
      return null;
    },
  };
}

export interface ReplayDevice {
  readonly config: DeviceConfig;
  /** First and last times the series covers. */
  readonly first: number;
  readonly last: number;
  /** Steps the device up to `t` (never past the end of the series; never backwards). */
  advanceTo(t: number): void;
  /** Readings delivered so far, in delivery order. */
  readings(): readonly Reading[];
  log(): readonly LogEntry[];
  status(): DeviceStatus;
  /** Readings still in the onboard buffer (the device is offline). */
  undelivered(): Reading[];
  /** Queues an event at or after the current time (e.g. from a server operator). */
  apply: Device["apply"];
}

export function createReplayDevice(config: DeviceConfigInput | DeviceConfig, samples: readonly TrueAirSample[], maxGapS = 600): ReplayDevice {
  const device: Device = createDevice(config);
  const dt = device.config.sampleIntervalS;
  const cursor = createAirCursor(samples, dt, maxGapS);
  const delivered: Reading[] = [];
  const log: LogEntry[] = [];
  let next = cursor.first;
  return {
    config: device.config,
    first: cursor.first,
    last: cursor.last,
    advanceTo(t) {
      for (; next <= Math.min(t, cursor.last); next += dt) {
        const out = device.step(next, cursor.at(next));
        delivered.push(...out.delivered);
        log.push(...out.log);
      }
    },
    readings: () => delivered,
    log: () => log,
    status: () => device.status(),
    undelivered: () => device.undelivered(),
    apply: (event) => device.apply(event),
  };
}
