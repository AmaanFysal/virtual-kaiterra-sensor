// CSV export (docs/05). Kaiterra's web app exports raw (1 per minute), hourly or daily CSV,
// but the column layout is undocumented (docs/09 R6), so this is our own documented layout:
// one row per interval end, one column per parameter with its API units.

import type { DeviceConfig } from "../model/config.js";
import type { Reading } from "../model/types.js";
import { PARAMS } from "../params.js";
import { SENSEDGE_MINI } from "../spec/sensedge-mini.js";
import { SECONDS_PER_DAY, formatIso } from "../time.js";
import { groupReadings } from "./grouping.js";

export type CsvFrequency = "raw" | "hourly" | "daily";

export interface CsvOptions {
  asOf: number;
  frequency?: CsvFrequency;
  timeZone?: string;
}

const WIDTH: Record<Exclude<CsvFrequency, "raw">, number> = { hourly: 3600, daily: SECONDS_PER_DAY };

export function csvColumns(config: DeviceConfig): string[] {
  return ["Timestamp (UTC)", ...PARAMS.filter((p) => config.params.includes(p)).map((p) => `${SENSEDGE_MINI[p].label} (${SENSEDGE_MINI[p].units})`)];
}

export function csvExport(config: DeviceConfig, readings: readonly Reading[], opts: CsvOptions): string {
  const params = PARAMS.filter((p) => config.params.includes(p));
  const frequency = opts.frequency ?? "raw";
  const rows = new Map<number, Map<string, number>>();
  for (const p of params) {
    const list = readings.filter((r) => r.param === p && r.deliveredAt <= opts.asOf).sort((a, b) => a.ts - b.ts);
    const points = frequency === "raw" ? list.map((r) => ({ ts: r.ts, value: r.value })) : groupReadings(list, WIDTH[frequency], opts.timeZone ?? "UTC", opts.asOf);
    for (const pt of points) {
      const row = rows.get(pt.ts) ?? new Map<string, number>();
      row.set(p, pt.value);
      rows.set(pt.ts, row);
    }
  }
  const lines = [csvColumns(config).join(",")];
  for (const ts of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(ts)!;
    lines.push([formatIso(ts), ...params.map((p) => (row.has(p) ? String(row.get(p)) : ""))].join(","));
  }
  return `${lines.join("\n")}\n`;
}
