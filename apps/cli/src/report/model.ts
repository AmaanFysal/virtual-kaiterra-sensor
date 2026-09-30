// Builds everything a validation report shows (docs/08): the scenario run through the device,
// the statistics, and chart series bucketed to a readable number of points.

import { PARAMS, SENSEDGE_MINI, reportData, simulate, type DeviceConfig, type DeviceConfigInput, type LogEntry, type ParamId, type Reading, type ReportData } from "@vks/core";
import { generate, type Annotation, type Scenario } from "@vks/true-air-gen";

export interface ChartPoint {
  /** Bucket midpoint, Unix seconds. */
  t: number;
  value: number | null;
  truth: number | null;
  reference: number | null;
  envelope: number | null;
}

export interface ReportModel {
  scenario: Scenario;
  seed: string;
  config: DeviceConfig;
  data: ReportData;
  charts: { param: ParamId; bucketSeconds: number; points: ChartPoint[] }[];
  annotations: Annotation[];
  /** Readings not yet delivered at the end of the run (offline at the end). */
  undelivered: number;
}

/** Most points a chart line carries; longer runs are averaged into buckets. */
export const MAX_CHART_POINTS = 360;

export function bucket(list: readonly Reading[], from: number, to: number, span: number, maxPoints = MAX_CHART_POINTS): { bucketSeconds: number; points: ChartPoint[] } {
  const minutes = Math.max(1, Math.round((to - from) / span) + 1);
  const per = Math.max(1, Math.ceil(minutes / maxPoints));
  const width = per * span;
  const n = Math.ceil(minutes / per);
  const acc = Array.from({ length: n }, () => ({ k: 0, value: 0, truth: 0, reference: 0, envelope: 0 }));
  for (const r of list) {
    const i = Math.min(n - 1, Math.floor((r.ts - from) / width));
    const a = acc[i]!;
    a.k += 1;
    a.value += r.value;
    a.truth += r.truth;
    a.reference += r.reference;
    a.envelope += r.envelope;
  }
  const points = acc.map((a, i) => {
    const t = from + i * width + (per === 1 ? 0 : (width - span) / 2);
    if (a.k === 0) return { t, value: null, truth: null, reference: null, envelope: null };
    return { t, value: a.value / a.k, truth: a.truth / a.k, reference: a.reference / a.k, envelope: a.envelope / a.k };
  });
  return { bucketSeconds: width, points };
}

/** Power cuts, outages, module swaps and recalibrations from the device log, for the event strip. */
export function deviceAnnotations(log: readonly LogEntry[], end: number): Annotation[] {
  const out: Annotation[] = [];
  let powerOff: number | undefined;
  let offline: number | undefined;
  for (const e of log) {
    if (e.kind === "power-off") powerOff = e.t;
    if (e.kind === "power-on" && powerOff !== undefined) {
      out.push({ from: powerOff, to: e.t, label: "power off" });
      powerOff = undefined;
    }
    if (e.kind === "offline") offline = e.t;
    if (e.kind === "online" && offline !== undefined) {
      out.push({ from: offline, to: e.t, label: "offline" });
      offline = undefined;
    }
    if (e.kind === "module-replaced") out.push({ from: e.t, to: e.t, label: `module swapped: bay ${e.bay} (${e.module})` });
    if (e.kind === "recalibrated") out.push({ from: e.t, to: e.t, label: "recalibrated" });
  }
  if (powerOff !== undefined) out.push({ from: powerOff, to: end, label: "power off" });
  if (offline !== undefined) out.push({ from: offline, to: end, label: "offline" });
  return out;
}

export function buildReport(scenario: Scenario, seed: string, config: DeviceConfigInput): ReportModel {
  const g = generate(scenario, seed);
  const result = simulate(config, g.samples);
  const data = reportData(result.readings, result.log);
  const charts = PARAMS.filter((p) => result.config.params.includes(p)).flatMap((param) => {
    const list = result.readings.filter((r) => r.param === param);
    if (list.length === 0) return [];
    return [{ param, ...bucket(list, data.from, data.to, list[0]!.span) }];
  });
  const annotations = [...g.annotations, ...deviceAnnotations(result.log, data.to)].sort((a, b) => a.from - b.from || a.to - b.to || (a.label < b.label ? -1 : 1));
  return { scenario, seed, config: result.config, data, charts, annotations, undelivered: result.undelivered.length };
}

export const paramLabel = (p: ParamId) => `${SENSEDGE_MINI[p].label} (${SENSEDGE_MINI[p].units === "C" ? "°C" : SENSEDGE_MINI[p].units})`;
