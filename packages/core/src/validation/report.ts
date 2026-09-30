// Numbers for the validation report (docs/08): per-parameter accuracy against the truth and the
// reference, envelope compliance, response lag, availability, and the flagged periods that
// explain any excess error. Pure; the CLI renders them.

import type { LogEntry, Reading } from "../model/types.js";
import { HEALTH_FLAGS, type Flag } from "../model/types.js";
import { PARAMS, type ParamId } from "../params.js";
import { SENSEDGE_MINI } from "../spec/sensedge-mini.js";
import { isHealthy, withinEnvelope } from "./envelope.js";

export interface ParamStats {
  param: ParamId;
  readings: number;
  /** Intervals the device reported nothing for, between its first and last reading. */
  missing: number;
  healthy: number;
  /** Share of healthy readings within E(reference): 1 means the spec always held. */
  healthyWithinShare: number;
  /** Share of all readings within E(reference), flagged ones included. */
  withinShare: number;
  /** Mean of value − truth (the true, unlagged interval mean). */
  biasVsTruth: number;
  maeVsTruth: number;
  rmseVsTruth: number;
  maeVsReference: number;
  /** Largest |value − reference| / E among healthy readings (≤ 1 when in spec). */
  worstHealthyRatio: number;
  /** Shift (minutes) of the truth that best matches the readings; undefined when the truth barely moves. */
  lagMinutes: number | undefined;
  /** First-order time constant implied by the published or assumed T90, minutes. */
  expectedLagMinutes: number;
  flagCounts: Partial<Record<Flag, number>>;
}

export interface FlagSpan {
  flag: Flag;
  param: ParamId;
  /** First and last reading timestamps in the span (interval ends). */
  from: number;
  to: number;
  readings: number;
  /** How far readings went beyond the envelope: mean and largest of max(0, |value − reference| − E). */
  meanExcess: number;
  maxExcess: number;
}

export interface ReportData {
  from: number;
  to: number;
  params: ParamStats[];
  spans: FlagSpan[];
  totals: { readings: number; healthy: number; healthyWithin: number; flagged: number; backfilled: number };
  log: Record<LogEntry["kind"], number>;
}

const MAX_LAG_MINUTES = 30;

function estimateLag(list: readonly Reading[], span: number): number | undefined {
  const truthAt = new Map(list.map((r) => [r.ts, r.truth]));
  const truths = list.map((r) => r.truth);
  const mean = truths.reduce((s, x) => s + x, 0) / Math.max(1, truths.length);
  const sd = Math.sqrt(truths.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, truths.length));
  const typicalEnvelope = list.reduce((s, r) => s + r.envelope, 0) / Math.max(1, list.length);
  if (sd < typicalEnvelope) return undefined;
  let best: { k: number; mae: number } | undefined;
  for (let k = 0; k <= MAX_LAG_MINUTES; k++) {
    let sum = 0;
    let n = 0;
    for (const r of list) {
      const truth = truthAt.get(r.ts - k * span);
      if (truth === undefined || !isHealthy(r)) continue;
      sum += Math.abs(r.value - truth);
      n += 1;
    }
    if (n < list.length / 2) break;
    const mae = sum / n;
    if (best === undefined || mae < best.mae - 1e-9) best = { k, mae };
  }
  return best?.k;
}

function spansOf(list: readonly Reading[], param: ParamId): FlagSpan[] {
  const out: FlagSpan[] = [];
  for (const flag of HEALTH_FLAGS) {
    let current: FlagSpan | undefined;
    let excessSum = 0;
    const close = () => {
      if (current) out.push({ ...current, meanExcess: excessSum / current.readings });
      current = undefined;
      excessSum = 0;
    };
    let prevTs: number | undefined;
    for (const r of list) {
      if (!r.flags.includes(flag)) continue;
      const excess = Math.max(0, Math.abs(r.value - r.reference) - r.envelope);
      if (current !== undefined && prevTs !== undefined && r.ts - prevTs > r.span) close();
      if (current === undefined) current = { flag, param, from: r.ts, to: r.ts, readings: 0, meanExcess: 0, maxExcess: 0 };
      current.to = r.ts;
      current.readings += 1;
      current.maxExcess = Math.max(current.maxExcess, excess);
      excessSum += excess;
      prevTs = r.ts;
    }
    close();
  }
  return out;
}

export function reportData(readings: readonly Reading[], log: readonly LogEntry[] = []): ReportData {
  const byParam = new Map<ParamId, Reading[]>();
  for (const r of readings) {
    const list = byParam.get(r.param);
    if (list === undefined) byParam.set(r.param, [r]);
    else list.push(r);
  }
  const params: ParamStats[] = [];
  const spans: FlagSpan[] = [];
  for (const param of PARAMS) {
    const list = (byParam.get(param) ?? []).sort((a, b) => a.ts - b.ts);
    if (list.length === 0) continue;
    const span = list[0]!.span;
    const healthy = list.filter(isHealthy);
    const errsTruth = list.map((r) => r.value - r.truth);
    const flagCounts: Partial<Record<Flag, number>> = {};
    for (const r of list) for (const f of r.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
    params.push({
      param,
      readings: list.length,
      missing: (list[list.length - 1]!.ts - list[0]!.ts) / span + 1 - list.length,
      healthy: healthy.length,
      healthyWithinShare: healthy.length === 0 ? 1 : healthy.filter(withinEnvelope).length / healthy.length,
      withinShare: list.filter(withinEnvelope).length / list.length,
      biasVsTruth: errsTruth.reduce((s, e) => s + e, 0) / list.length,
      maeVsTruth: errsTruth.reduce((s, e) => s + Math.abs(e), 0) / list.length,
      rmseVsTruth: Math.sqrt(errsTruth.reduce((s, e) => s + e * e, 0) / list.length),
      maeVsReference: list.reduce((s, r) => s + Math.abs(r.value - r.reference), 0) / list.length,
      worstHealthyRatio: healthy.reduce((m, r) => Math.max(m, Math.abs(r.value - r.reference) / r.envelope), 0),
      lagMinutes: estimateLag(list, span),
      expectedLagMinutes: SENSEDGE_MINI[param].t90.seconds / Math.LN10 / 60,
      flagCounts,
    });
    spans.push(...spansOf(list, param));
  }
  spans.sort((a, b) => a.from - b.from || PARAMS.indexOf(a.param) - PARAMS.indexOf(b.param) || (a.flag < b.flag ? -1 : 1));
  const logCounts = {} as Record<LogEntry["kind"], number>;
  for (const e of log) logCounts[e.kind] = (logCounts[e.kind] ?? 0) + 1;
  let from = Infinity;
  let to = -Infinity;
  for (const r of readings) {
    from = Math.min(from, r.ts);
    to = Math.max(to, r.ts);
  }
  return {
    from,
    to,
    params,
    spans,
    totals: {
      readings: readings.length,
      healthy: readings.filter(isHealthy).length,
      healthyWithin: readings.filter((r) => isHealthy(r) && withinEnvelope(r)).length,
      flagged: readings.filter((r) => !isHealthy(r)).length,
      backfilled: readings.filter((r) => r.flags.includes("backfilled")).length,
    },
    log: logCounts,
  };
}
