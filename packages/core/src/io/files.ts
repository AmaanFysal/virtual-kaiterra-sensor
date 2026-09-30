// Text formats for true air and readings (docs/04, docs/06). Pure: strings in, strings out;
// the CLI does the file I/O.
//
// True air, CSV:   timestamp,pm1,pm25,pm10,co2,tvoc,temp,rh,o3,no2,co,ethanol   (blank = unknown)
// True air, JSONL: {"ts":"2026-11-03T06:00:00Z","co2":650,...}                   (one object per line)
// Timestamps are RFC 3339 or Unix seconds.

import type { Reading } from "../model/types.js";
import { INTERFERENTS, PARAMS, type TrueAir, type TrueAirSample } from "../params.js";
import { formatIso, parseIso } from "../time.js";

export const TRUE_AIR_KEYS: readonly (keyof TrueAir)[] = [...PARAMS, ...INTERFERENTS];

function parseTime(value: string | number, where: string): number {
  if (typeof value === "number" || /^-?\d+$/.test(value)) {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new Error(`${where}: timestamp must be whole Unix seconds`);
    return n;
  }
  try {
    return parseIso(value);
  } catch {
    throw new Error(`${where}: "${value}" is not an RFC 3339 timestamp or Unix seconds`);
  }
}

function checkValue(key: string, v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${where}: ${key} must be a number`);
  return v;
}

export function formatTrueAirCsv(samples: readonly TrueAirSample[]): string {
  const rows = samples.map((s) => [formatIso(s.t), ...TRUE_AIR_KEYS.map((k) => (s.air[k] === undefined ? "" : String(s.air[k])))].join(","));
  return `${["timestamp", ...TRUE_AIR_KEYS].join(",")}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

export function parseTrueAirCsv(text: string): TrueAirSample[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (lines.length === 0) return [];
  const header = lines[0]!.split(",").map((h) => h.trim());
  const timeCol = header.findIndex((h) => h === "timestamp" || h === "ts");
  if (timeCol === -1) throw new Error('CSV header needs a "timestamp" column');
  for (const h of header) {
    if (h !== header[timeCol] && !TRUE_AIR_KEYS.includes(h as keyof TrueAir)) throw new Error(`CSV column "${h}" is not one of ${TRUE_AIR_KEYS.join(", ")}`);
  }
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const where = `CSV line ${i + 2}`;
    if (cells.length !== header.length) throw new Error(`${where}: expected ${header.length} cells, got ${cells.length}`);
    const air: TrueAir = {};
    header.forEach((h, j) => {
      if (j === timeCol || cells[j] === "") return;
      air[h as keyof TrueAir] = checkValue(h, Number(cells[j]), where);
    });
    return { t: parseTime(cells[timeCol]!, where), air };
  });
}

export function formatTrueAirJsonl(samples: readonly TrueAirSample[]): string {
  return samples.map((s) => JSON.stringify({ ts: formatIso(s.t), ...s.air })).join("\n") + (samples.length > 0 ? "\n" : "");
}

export function parseTrueAirJsonl(text: string): TrueAirSample[] {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line, where: `JSONL line ${i + 1}` }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, where }) => {
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        throw new Error(`${where}: not valid JSON`);
      }
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) throw new Error(`${where}: expected an object`);
      const { ts, t, ...rest } = obj as Record<string, unknown>;
      const time = ts ?? t;
      if (typeof time !== "string" && typeof time !== "number") throw new Error(`${where}: needs "ts"`);
      const air: TrueAir = {};
      for (const [k, v] of Object.entries(rest)) {
        if (!TRUE_AIR_KEYS.includes(k as keyof TrueAir)) throw new Error(`${where}: "${k}" is not one of ${TRUE_AIR_KEYS.join(", ")}`);
        if (v !== null) air[k as keyof TrueAir] = checkValue(k, v, where);
      }
      return { t: parseTime(time, where), air };
    });
}

/**
 * Readings with their ground-truth side channel, one JSON object per line: an analysis format
 * of this project, not a Kaiterra one.
 */
export function formatReadingsJsonl(readings: readonly Reading[]): string {
  return (
    readings
      .map((r) =>
        JSON.stringify({
          ts: formatIso(r.ts),
          param: r.param,
          value: r.value,
          ...(r.source === undefined ? {} : { source: r.source }),
          span: r.span,
          delivered_at: formatIso(r.deliveredAt),
          reference: r.reference,
          truth: r.truth,
          envelope: r.envelope,
          flags: r.flags,
        }),
      )
      .join("\n") + (readings.length > 0 ? "\n" : "")
  );
}
