// Batch mode (docs/03): a true-air series in, every reading the device would report out.
// Irregular input is resampled onto the device's sampling grid by linear interpolation;
// gaps longer than `maxGapS` count as "no air known".

import { PARAMS, type ParamId, type TrueAirSample } from "../params.js";
import type { DeviceConfig, DeviceConfigInput } from "./config.js";
import { createReplayDevice } from "./replay.js";
import type { DeviceStatus, LogEntry, Reading } from "./types.js";

export { interpolate } from "./replay.js";

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

export function simulate(configInput: DeviceConfigInput | DeviceConfig, samples: readonly TrueAirSample[], options: SimulateOptions = {}): SimulationResult {
  const replay = createReplayDevice(configInput, samples, options.maxGapS ?? 600);
  replay.advanceTo(replay.last);
  const readings = [...replay.readings()];
  const log = [...replay.log()];
  readings.sort((x, y) => x.ts - y.ts || PARAMS.indexOf(x.param) - PARAMS.indexOf(y.param));
  return { config: replay.config, readings, undelivered: replay.undelivered(), log, status: replay.status() };
}

/** Readings of one parameter, in time order. */
export function seriesOf(readings: readonly Reading[], param: ParamId): Reading[] {
  return readings.filter((r) => r.param === param).sort((a, b) => a.ts - b.ts);
}
