// Spec-compliance checks (docs/08). A reading is "in envelope" when it is within E(reference)
// of its reference; it is "healthy" when none of its flags excuses it from that.

import { HEALTH_FLAGS, type Reading } from "../model/types.js";

/** Floating-point slack for comparisons, far below any resolution. */
const EPS = 1e-9;

export function withinEnvelope(r: Reading): boolean {
  return Math.abs(r.value - r.reference) <= r.envelope + EPS;
}

export function isHealthy(r: Reading): boolean {
  return !r.flags.some((f) => HEALTH_FLAGS.includes(f));
}

export interface EnvelopeSummary {
  total: number;
  healthy: number;
  healthyWithin: number;
  flaggedOutside: number;
  /** Largest |value − reference| / envelope over healthy readings. */
  worstHealthyRatio: number;
}

export function summarise(readings: readonly Reading[]): EnvelopeSummary {
  let healthy = 0;
  let healthyWithin = 0;
  let flaggedOutside = 0;
  let worst = 0;
  for (const r of readings) {
    if (isHealthy(r)) {
      healthy += 1;
      if (withinEnvelope(r)) healthyWithin += 1;
      worst = Math.max(worst, Math.abs(r.value - r.reference) / r.envelope);
    } else if (!withinEnvelope(r)) {
      flaggedOutside += 1;
    }
  }
  return { total: readings.length, healthy, healthyWithin, flaggedOutside, worstHealthyRatio: worst };
}
