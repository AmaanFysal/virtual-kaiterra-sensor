// Time helpers (docs/03, ADR-0001). Time in the core is integer Unix seconds, UTC.
// Pure arithmetic: no Date, so the core stays deterministic.

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86_400;

/**
 * The care home simulation's t = 0: Monday 2026-11-02 00:00 (virtual-care-home
 * packages/shared-types/src/time.ts). UK clocks are on GMT that day, so it is also UTC.
 */
export const SIM_EPOCH_UNIX = 1_793_577_600;
/** The care home's default run start, Tuesday 2026-11-03 06:00 (its DEFAULT_START_T). */
export const SIM_DEFAULT_START_T = SECONDS_PER_DAY + 6 * SECONDS_PER_HOUR;
/** The care home engine tick (its TICK_SECONDS). */
export const SIM_TICK_SECONDS = 5;

export function simToUnix(t: number): number {
  return SIM_EPOCH_UNIX + t;
}

export function unixToSim(unix: number): number {
  return unix - SIM_EPOCH_UNIX;
}

/** Days since 1970-01-01 for a proleptic Gregorian date (Hinnant's days_from_civil). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Inverse of daysFromCivil (Hinnant's civil_from_days). Month is 1..12. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** RFC 3339 UTC with whole seconds, as the Kaiterra API writes it: "2026-11-03T06:00:00Z". */
export function formatIso(unix: number): string {
  if (!Number.isInteger(unix)) throw new Error(`formatIso needs whole seconds, got ${unix}`);
  const days = Math.floor(unix / SECONDS_PER_DAY);
  const secs = unix - days * SECONDS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:${pad(ss)}Z`;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an RFC 3339 timestamp to Unix seconds. Fractions of a second are truncated,
 * as the Kaiterra API does; offsets are honoured.
 */
export function parseIso(text: string): number {
  const m = ISO_RE.exec(text);
  if (!m) throw new Error(`Not an RFC 3339 timestamp: "${text}"`);
  const [year, month, day, hh, mm, ss] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 59) {
    throw new Error(`Out-of-range field in timestamp "${text}"`);
  }
  let unix = daysFromCivil(year, month, day) * SECONDS_PER_DAY + hh * 3600 + mm * 60 + ss;
  const zone = m[7]!;
  if (zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    unix -= sign * (Number(zone.slice(1, 3)) * 3600 + Number(zone.slice(4, 6)) * 60);
  }
  return unix;
}
