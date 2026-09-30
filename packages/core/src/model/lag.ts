// First-order sensor response (docs/03). A step change reaches 90% after T90:
// y += (x − y)·α with α = 1 − exp(−dt/τ) and τ = T90 / ln 10.

export function lagAlpha(t90Seconds: number, dtSeconds: number): number {
  if (t90Seconds <= 0) return 1;
  const tau = t90Seconds / Math.LN10;
  return 1 - Math.exp(-dtSeconds / tau);
}

export function lagStep(previous: number | undefined, input: number, alpha: number): number {
  return previous === undefined ? input : previous + (input - previous) * alpha;
}
