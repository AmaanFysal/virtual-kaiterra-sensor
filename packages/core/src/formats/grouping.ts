// Time averaging for history and exports (docs/05). The Kaiterra API groups by `1m`, `5m`,
// `15m` or any divisor of 60 minutes, `1h`, `2h` or any divisor of 24 hours, and `1d`; labels
// each window by its end; publishes a window only after it has closed; and aligns hour and
// day windows to the `time_zone` (S3).

import type { Reading } from "../model/types.js";
import { SENSEDGE_MINI } from "../spec/sensedge-mini.js";
import { SECONDS_PER_DAY, daysFromCivil } from "../time.js";

/** Parses a `group_by` value to seconds; undefined if the API would reject it. */
export function parseGroupBy(value: string): number | undefined {
  const m = /^(\d+)(m|h|d)$/.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (n <= 0) return undefined;
  if (m[2] === "m") return 60 % n === 0 ? n * 60 : undefined;
  if (m[2] === "h") return 24 % n === 0 ? n * 3600 : undefined;
  return n === 1 ? SECONDS_PER_DAY : undefined;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** True if `timeZone` is a TZ database name the runtime knows. */
export function isTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/**
 * Offset of `timeZone` from UTC at `unix`, in seconds. Uses the runtime's time zone data for
 * the date it is given, never the clock.
 */
export function timeZoneOffset(timeZone: string, unix: number): number {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return 0;
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(unix * 1000).map((p) => [p.type, p.value]));
  const local = daysFromCivil(Number(parts.year), Number(parts.month), Number(parts.day)) * SECONDS_PER_DAY + Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return local - unix;
}

/** End of the window (of `width` seconds, aligned in `timeZone`) that contains an interval ending at `ts`. */
export function windowEnd(ts: number, width: number, timeZone: string): number {
  const offset = timeZoneOffset(timeZone, ts);
  return Math.ceil((ts + offset) / width) * width - offset;
}

export interface GroupedPoint {
  ts: number;
  value: number;
}

/**
 * Averages one parameter's readings into closed windows. Readings must share a parameter;
 * windows ending after `asOf` are still open and are left out.
 */
export function groupReadings(readings: readonly Reading[], width: number, timeZone: string, asOf: number): GroupedPoint[] {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const r of readings) {
    const end = windowEnd(r.ts, width, timeZone);
    if (end > asOf) continue;
    const s = sums.get(end) ?? { sum: 0, n: 0 };
    s.sum += r.value;
    s.n += 1;
    sums.set(end, s);
  }
  const param = readings[0]?.param;
  const decimals = param === undefined ? 1 : Math.max(1, SENSEDGE_MINI[param].decimals);
  const f = 10 ** decimals;
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([ts, s]) => ({ ts, value: Math.round((s.sum / s.n) * f) / f }));
}
