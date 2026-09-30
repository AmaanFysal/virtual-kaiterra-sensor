// Device configuration (docs/03). Everything that makes one virtual device differ from
// another lives here: seed, variant, spec profile, error budget and module state.
// `resolveConfig` fills defaults and validates.

import type { ParamId } from "../params.js";
import { DEFAULT_SPEC_PROFILE, SPEC_PROFILES, type SpecProfile } from "../spec/sensedge-mini.js";
import { VARIANTS, variantParams, type Variant } from "../spec/modules.js";

/** Fractions of the spec envelope each error component may use (ADR-0002). Sum ≤ 1. */
export interface ErrorBudget {
  bias: number;
  drift: number;
  noise: number;
}

export interface DeviceConfig {
  deviceId: string;
  name: string;
  seed: string;
  variant: Variant;
  /** Subset of the variant's parameters to report (default: all of them). */
  params: ParamId[];
  specProfile: SpecProfile;
  /** Internal sampling cadence, seconds (ADR-0001; matches the care home's 5 s tick). */
  sampleIntervalS: number;
  /** Reporting interval and API `span`, seconds (S1, S2: 1 minute). */
  reportIntervalS: number;
  /** Minimum fraction of samples in a report interval needed to report it. */
  minCoverage: number;
  errorBudget: ErrorBudget;
  /** AR(1) coefficient of the minute-to-minute noise. */
  noiseAutocorrelation: number;
  /** Module health at the start, per bay, as the API's lifetime_pct (100 = new). */
  moduleLifetimePct: [number, number];
  /** Age of the on-board sensors' calibration at the start, days. */
  onboardAgeDays: number;
  /** On-board drift reaches its full budget after this many days (ADR-0003 assumption). */
  onboardDriftHorizonDays: number;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type DeviceConfigInput = DeepPartial<DeviceConfig> & { deviceId: string; seed: string };

export function resolveConfig(input: DeviceConfigInput): DeviceConfig {
  const variant = input.variant ?? "pm-tvoc-co2";
  if (!(variant in VARIANTS)) throw new Error(`Unknown variant "${variant}"`);
  const available = variantParams(VARIANTS[variant]);
  const params = input.params ?? available;
  for (const p of params) {
    if (!available.includes(p)) throw new Error(`Variant "${variant}" does not measure "${p}"`);
  }
  const config: DeviceConfig = {
    deviceId: input.deviceId,
    name: input.name ?? input.deviceId,
    seed: input.seed,
    variant,
    params,
    specProfile: input.specProfile ?? DEFAULT_SPEC_PROFILE,
    sampleIntervalS: input.sampleIntervalS ?? 5,
    reportIntervalS: input.reportIntervalS ?? 60,
    minCoverage: input.minCoverage ?? 0.5,
    errorBudget: { bias: 0.5, drift: 0.25, noise: 0.25, ...input.errorBudget },
    noiseAutocorrelation: input.noiseAutocorrelation ?? 0.5,
    moduleLifetimePct: (input.moduleLifetimePct as [number, number] | undefined) ?? [100, 100],
    onboardAgeDays: input.onboardAgeDays ?? 0,
    onboardDriftHorizonDays: input.onboardDriftHorizonDays ?? 730,
  };
  validateConfig(config);
  return config;
}

function validateConfig(c: DeviceConfig): void {
  const fail = (msg: string): never => {
    throw new Error(`Device "${c.deviceId}": ${msg}`);
  };
  if (!SPEC_PROFILES.includes(c.specProfile)) fail(`unknown spec profile "${c.specProfile}"`);
  const { bias, drift, noise } = c.errorBudget;
  if ([bias, drift, noise].some((f) => f < 0)) fail("error budget fractions must be ≥ 0");
  if (bias + drift + noise > 1 + 1e-12) fail(`error budget sums to ${bias + drift + noise}, must be ≤ 1`);
  if (!Number.isInteger(c.sampleIntervalS) || c.sampleIntervalS <= 0) fail("sampleIntervalS must be a positive integer");
  if (c.reportIntervalS % c.sampleIntervalS !== 0) fail("reportIntervalS must be a multiple of sampleIntervalS");
  if (c.noiseAutocorrelation < 0 || c.noiseAutocorrelation >= 1) fail("noiseAutocorrelation must be in [0, 1)");
  if (c.moduleLifetimePct.length !== 2 || c.moduleLifetimePct.some((p) => p < 0 || p > 100)) fail("moduleLifetimePct needs two values in [0, 100]");
  if (c.minCoverage <= 0 || c.minCoverage > 1) fail("minCoverage must be in (0, 1]");
}
