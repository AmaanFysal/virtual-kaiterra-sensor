// What the device produces (docs/03). Readings carry the value a real Sensedge Mini would
// report plus a ground-truth side channel (reference, truth, envelope, flags) that the
// output formats strip: the real device formats have no such fields.

import type { ParamId } from "../params.js";
import type { ModuleType } from "../spec/modules.js";

export type Flag =
  /** The reference is outside the spec range, so no accuracy is promised. */
  | "out-of-range"
  /** CO2 above 5,000 ppm, in the extended range with no published accuracy. */
  | "extended-range"
  /** The module is past 0% health; its drift has outgrown the budget. */
  | "module-expired"
  /** An on-board sensor is past its drift horizon without recalibration. */
  | "calibration-overdue";

/** Flags that mean the reading may be outside the spec envelope. */
export const HEALTH_FLAGS: readonly Flag[] = [
  "out-of-range",
  "extended-range",
  "module-expired",
  "calibration-overdue",
];

export interface Reading {
  param: ParamId;
  /** End of the reporting interval, Unix seconds (the API labels intervals by their end). */
  ts: number;
  /** Reporting interval, seconds (the API's `span`). */
  span: number;
  /** What the device reports: clamped to range and quantised. */
  value: number;
  /** Kaiterra API `source` (module), absent for on-board sensors. */
  source?: string;
  /** Side channel: interval mean of the lagged true value, the target of the accuracy spec. */
  reference: number;
  /** Side channel: interval mean of the true value, without sensor lag. */
  truth: number;
  /** Side channel: the spec envelope E(reference) under the device's profile. */
  envelope: number;
  flags: Flag[];
}

export type LogEntry = { t: number; kind: "no-input"; ts: number; param: ParamId };

export interface ModuleStatus {
  bay: number;
  type: ModuleType;
  source: string;
  serial: string;
  /** API `lifetime_pct`: 100 when new, 0 at end of life. */
  lifetimePct: number;
}

export interface DeviceStatus {
  t: number | undefined;
  modules: ModuleStatus[];
  onboardAgeDays: number;
}

export interface StepResult {
  /** Readings reported during this step, in (ts, param) order. */
  delivered: Reading[];
  log: LogEntry[];
}
