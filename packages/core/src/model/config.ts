// Device configuration (docs/03). Everything that makes one virtual device differ from
// another lives here: seed, variant, spec profile, error budget, module state, schedules
// and the optional condition-dependent effects. `resolveConfig` fills defaults and validates.

import type { ParamId } from "../params.js";
import { DEFAULT_SPEC_PROFILE, SPEC_PROFILES, type SpecProfile } from "../spec/sensedge-mini.js";
import { VARIANTS, variantParams, type Variant } from "../spec/modules.js";

/** Scheduled or injected device events. `t` is Unix seconds. */
export type DeviceEvent =
  | { t: number; kind: "power"; on: boolean }
  | { t: number; kind: "network"; online: boolean }
  | { t: number; kind: "replace-module"; bay: 0 | 1 }
  | { t: number; kind: "recalibrate" };

/** Fractions of the spec envelope each error component may use (ADR-0002). Sum ≤ 1. */
export interface ErrorBudget {
  bias: number;
  drift: number;
  noise: number;
}

export interface AvailabilityConfig {
  /** Chance a whole minute is missing from every parameter. */
  deviceDropoutPerMinute: number;
  /** Chance one parameter's minute is missing. */
  paramDropoutPerMinute: number;
  /** Random network outages: expected count per day and mean length. */
  randomOfflinePerDay: number;
  randomOfflineMeanMinutes: number;
  /** Onboard memory while offline, in minutes of readings (S1, S2: "1 hour of data"). */
  bufferMinutes: number;
}

/** PM over-reading at high humidity (hygroscopic growth, κ-Köhler form; ADR-0008). */
export interface PmHumidityConfig {
  enabled: boolean;
  /** Hygroscopicity κ of the indoor aerosol. */
  kappa: number;
  /** Relative humidity at which the sensor was calibrated (no correction there), %. */
  rhRef: number;
  /** Water activity cap, so the growth factor stays finite near saturation. */
  maxWaterActivity: number;
}

/** Metal-oxide TVOC cross-sensitivities and baseline drift (ADR-0008). */
export interface MoxConfig {
  enabled: boolean;
  /** Relative gain per %RH away from `rhRef`. */
  humidityPerPct: number;
  rhRef: number;
  /** Relative gain per °C away from `tempRef`. */
  temperaturePerDegC: number;
  tempRef: number;
  /** Reported TVOC ppb per ppb of ethanol (the sensor is calibrated against ethanol, S1). */
  ethanolResponse: number;
  /** Baseline wander: Ornstein-Uhlenbeck with this stationary standard deviation (ppb) and time constant. */
  baselineSdPpb: number;
  baselineTauDays: number;
}

/** NDIR automatic baseline calibration (ADR-0008). */
export interface AbcConfig {
  enabled: boolean;
  /** Length of one ABC period; the lowest reading in a period is taken to be `targetPpm`. */
  periodHours: number;
  targetPpm: number;
  /** Largest correction applied at the end of one period, ppm. */
  maxStepPpm: number;
}

/** Settling after power-on or module replacement; readings flagged until stable (ADR-0008). */
export interface WarmUpConfig {
  enabled: boolean;
  /** Warm-up length per sensor technology, seconds. */
  seconds: { pm: number; co2: number; mox: number; electrochemical: number; climate: number };
  /** Initial offset as a multiple of the spec envelope (decays exponentially over the warm-up). */
  initialEnvelopes: number;
  /** Drop readings during warm-up instead of reporting them flagged. */
  suppress: boolean;
  /** Treat the start of the run as a power-on. */
  atStart: boolean;
}

/** Occasional readings outside the envelope, flagged. */
export interface OutlierConfig {
  enabled: boolean;
  perReading: number;
  /** Mean extra size beyond the envelope, as a multiple of the envelope. */
  meanExcessEnvelopes: number;
}

export interface ConditionsConfig {
  pmHumidity: PmHumidityConfig;
  mox: MoxConfig;
  abc: AbcConfig;
  warmUp: WarmUpConfig;
  outliers: OutlierConfig;
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
  events: DeviceEvent[];
  availability: AvailabilityConfig;
  conditions: ConditionsConfig;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type DeviceConfigInput = DeepPartial<DeviceConfig> & { deviceId: string; seed: string };

export const DEFAULT_CONDITIONS: ConditionsConfig = {
  pmHumidity: { enabled: false, kappa: 0.3, rhRef: 40, maxWaterActivity: 0.98 },
  mox: {
    enabled: false,
    humidityPerPct: 0.008,
    rhRef: 45,
    temperaturePerDegC: 0.01,
    tempRef: 22,
    ethanolResponse: 1,
    baselineSdPpb: 15,
    baselineTauDays: 3,
  },
  abc: { enabled: false, periodHours: 192, targetPpm: 400, maxStepPpm: 50 },
  warmUp: {
    enabled: false,
    seconds: { pm: 30, co2: 180, mox: 3600, electrochemical: 3600, climate: 900 },
    initialEnvelopes: 1.5,
    suppress: false,
    atStart: false,
  },
  outliers: { enabled: false, perReading: 0.001, meanExcessEnvelopes: 1 },
};

export function resolveConfig(input: DeviceConfigInput): DeviceConfig {
  const variant = input.variant ?? "pm-tvoc-co2";
  if (!(variant in VARIANTS)) throw new Error(`Unknown variant "${variant}"`);
  const available = variantParams(VARIANTS[variant]);
  const params = input.params ?? available;
  for (const p of params) {
    if (!available.includes(p)) throw new Error(`Variant "${variant}" does not measure "${p}"`);
  }
  const c = input.conditions ?? {};
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
    events: [...(input.events ?? [])] as DeviceEvent[],
    availability: {
      deviceDropoutPerMinute: 0,
      paramDropoutPerMinute: 0,
      randomOfflinePerDay: 0,
      randomOfflineMeanMinutes: 30,
      bufferMinutes: 60,
      ...input.availability,
    },
    conditions: {
      pmHumidity: { ...DEFAULT_CONDITIONS.pmHumidity, ...c.pmHumidity },
      mox: { ...DEFAULT_CONDITIONS.mox, ...c.mox },
      abc: { ...DEFAULT_CONDITIONS.abc, ...c.abc },
      warmUp: {
        ...DEFAULT_CONDITIONS.warmUp,
        ...c.warmUp,
        seconds: { ...DEFAULT_CONDITIONS.warmUp.seconds, ...c.warmUp?.seconds },
      },
      outliers: { ...DEFAULT_CONDITIONS.outliers, ...c.outliers },
    },
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
  if (c.availability.bufferMinutes < 0) fail("bufferMinutes must be ≥ 0");
  for (const e of c.events) {
    if (!Number.isInteger(e.t)) fail(`event times must be whole seconds (got ${e.t})`);
  }
}
