// The bounded error model (docs/03, ADR-0002). Every component is a fraction of the usable
// envelope Eq = E(r) − q, where q is the most rounding can add. With the fractions summing to
// at most 1 and drift at most its full share (module within its life), the reported value
// can never be further than E(r) from the reference r:
//   |bias + drift + noise| + q ≤ (fb + fd + fn)·Eq + q ≤ E(r).

import type { ErrorBudget } from "./config.js";

export interface ErrorDraws {
  /** Per-device (or per-module) bias direction and size, in [−1, 1]. */
  bias: number;
  /** Per-module drift direction and size at end of life, in [−1, 1]. */
  drift: number;
  /** This minute's standardised noise (AR(1), unit variance). */
  noiseZ: number;
}

/** Noise is a truncated normal with σ = 1/NOISE_SIGMAS of its budget. */
export const NOISE_SIGMAS = 2.5;

export function usableEnvelope(envelope: number, quantisation: number): number {
  return Math.max(0, envelope - quantisation);
}

/**
 * Total error for one reading. `used` is the fraction of module life (or on-board calibration
 * horizon) consumed; above 1 the drift keeps growing past its budget, which is the one way a
 * healthy-config device leaves the envelope (flagged `module-expired`/`calibration-overdue`).
 */
export function boundedError(eq: number, budget: ErrorBudget, draws: ErrorDraws, used: number): number {
  const noise = Math.max(-1, Math.min(1, draws.noiseZ / NOISE_SIGMAS));
  return (draws.bias * budget.bias + draws.drift * budget.drift * Math.max(0, used) + noise * budget.noise) * eq;
}

/** Next AR(1) state with unit stationary variance. */
export function ar1(previous: number, phi: number, epsilon: number): number {
  return phi * previous + Math.sqrt(1 - phi * phi) * epsilon;
}
