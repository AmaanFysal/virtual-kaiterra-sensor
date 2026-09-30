// Test inputs: seeded true-air series. (The full scenario generator is M5's @vks/true-air-gen.)

import { createHash } from "node:crypto";
import type { ParamId, TrueAir, TrueAirSample } from "../src/params.js";
import { createRng } from "../src/rng.js";
import { SIM_DEFAULT_START_T, simToUnix } from "../src/time.js";

export const T0 = simToUnix(SIM_DEFAULT_START_T);

export const TYPICAL: Required<Pick<TrueAir, ParamId>> = {
  pm1: 5,
  pm25: 8,
  pm10: 12,
  co2: 650,
  tvoc: 120,
  temp: 21.5,
  rh: 45,
  o3: 25,
  no2: 15,
  co: 0.6,
};

/** Constant air, sampled every `dt` seconds for `minutes`. */
export function steady(air: TrueAir, minutes: number, dt = 5, t0 = T0): TrueAirSample[] {
  const out: TrueAirSample[] = [];
  for (let t = t0; t <= t0 + minutes * 60; t += dt) out.push({ t, air });
  return out;
}

/** Air from a function of seconds since t0. */
export function series(fn: (s: number) => TrueAir, minutes: number, dt = 5, t0 = T0): TrueAirSample[] {
  const out: TrueAirSample[] = [];
  for (let s = 0; s <= minutes * 60; s += dt) out.push({ t: t0 + s, air: fn(s) });
  return out;
}

const RANGES: Record<ParamId, [number, number]> = {
  pm1: [0, 300],
  pm25: [0, 500],
  pm10: [0, 800],
  co2: [400, 5000],
  tvoc: [0, 1382],
  temp: [5, 40],
  rh: [10, 90],
  o3: [20, 300],
  no2: [0, 400],
  co: [0, 60],
};

/**
 * A seeded random walk per parameter within its spec range, sampled irregularly
 * (every 3–40 s), so tests exercise interpolation and the whole range.
 */
export function randomWalk(seed: string, minutes: number, t0 = T0): TrueAirSample[] {
  const rng = createRng(`walk/${seed}`);
  const state = Object.fromEntries(
    (Object.keys(RANGES) as ParamId[]).map((p) => {
      const [lo, hi] = RANGES[p];
      return [p, lo + rng.next() * (hi - lo)];
    }),
  ) as Record<ParamId, number>;
  const out: TrueAirSample[] = [];
  for (let t = t0; t <= t0 + minutes * 60; t += rng.int(3, 40)) {
    for (const p of Object.keys(RANGES) as ParamId[]) {
      const [lo, hi] = RANGES[p];
      const jump = rng.chance(0.01) ? (rng.next() - 0.5) * (hi - lo) * 0.5 : 0;
      state[p] = Math.min(hi, Math.max(lo, state[p] + (rng.next() - 0.5) * (hi - lo) * 0.01 + jump));
    }
    out.push({ t, air: { ...state } });
  }
  return out;
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
