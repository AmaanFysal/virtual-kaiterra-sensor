// Condition-dependent effects (docs/03, ADR-0008). All are off by default. Each function is
// pure; the device decides when to apply them and flags the readings they change.

import type { ParamId } from "../params.js";
import type { MoxConfig, PmHumidityConfig, WarmUpConfig } from "./config.js";

/**
 * κ-Köhler growth of the particle signal at relative humidity `rh`, relative to the
 * calibration humidity: C(aw) = 1 + (κ/1.65)/(1/aw − 1) (Crilley et al. 2018), divided by
 * C at `rhRef`. 1 at the calibration humidity, steep above ~80 %RH.
 */
export function pmHumidityGrowth(rh: number, cfg: PmHumidityConfig): number {
  const c = (rhPct: number) => {
    const aw = Math.min(cfg.maxWaterActivity, Math.max(0.01, rhPct / 100));
    return 1 + cfg.kappa / 1.65 / (1 / aw - 1);
  };
  return c(rh) / c(cfg.rhRef);
}

export interface MoxTerms {
  humidity: number;
  temperature: number;
  ethanol: number;
}

/** Additive MOx cross-sensitivity terms, ppb, for reference TVOC `r`. */
export function moxTerms(r: number, rh: number | undefined, temp: number | undefined, ethanol: number | undefined, cfg: MoxConfig): MoxTerms {
  return {
    humidity: rh === undefined ? 0 : r * cfg.humidityPerPct * (rh - cfg.rhRef),
    temperature: temp === undefined ? 0 : r * cfg.temperaturePerDegC * (temp - cfg.tempRef),
    ethanol: ethanol === undefined ? 0 : cfg.ethanolResponse * ethanol,
  };
}

/** One Ornstein-Uhlenbeck step for the MOx baseline, `dtDays` long. */
export function ouStep(previous: number, sd: number, tauDays: number, dtDays: number, epsilon: number): number {
  const decay = Math.exp(-dtDays / tauDays);
  return previous * decay + sd * Math.sqrt(1 - decay * decay) * epsilon;
}

export type Technology = keyof WarmUpConfig["seconds"];

export function technologyOf(param: ParamId): Technology {
  switch (param) {
    case "pm1":
    case "pm25":
    case "pm10":
      return "pm";
    case "co2":
      return "co2";
    case "tvoc":
      return "mox";
    case "o3":
    case "no2":
    case "co":
      return "electrochemical";
    case "temp":
    case "rh":
      return "climate";
  }
}

/** Warm-up offset, decaying to 5% of its start by the end of the warm-up. */
export function warmUpOffset(initial: number, elapsedS: number, durationS: number): number {
  return initial * Math.exp((-3 * elapsedS) / durationS);
}
