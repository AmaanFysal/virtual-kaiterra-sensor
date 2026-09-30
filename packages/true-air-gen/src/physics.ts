// Physical constants and source rates for the synthetic generator (docs/04, ADR-0009).
// CO2 generation follows Persily & de Jonge (2017): V_CO2 = BMR · M · 0.000484 L/s
// (Equation 4, RQ = 0.85), with BMR from their Table 2. Everything else is an assumption,
// chosen to give plausible curves; the generator is a test tool, not a room model for the sim.

import { TVOC_UGM3_PER_PPB } from "@vks/core";

/** Mean BMR (MJ/day), averaged over males and females, from Persily & de Jonge (2017) Table 2. */
export const BMR_MJ_PER_DAY = {
  /** Age ≥ 80: males 6.19, females 5.19. */
  resident: (6.19 + 5.19) / 2,
  /** Age 30 to < 50: males 7.83 and 8.00, females 6.08 and 6.16. */
  staff: (7.83 + 8.0 + 6.08 + 6.16) / 4,
  /** Age 50 to < 60: males 7.95, females 6.17. */
  visitor: (7.95 + 6.17) / 2,
} as const;
export type Who = keyof typeof BMR_MJ_PER_DAY;

/** Physical activity level M (met). Sleeping is taken as 1.0 (basal). */
export const MET = { sleeping: 1.0, seated: 1.2, light: 1.6, care: 2.0, active: 3.0 } as const;
export type Activity = keyof typeof MET;

/** CO2 generation per person, L/s (Persily & de Jonge 2017, Equation 4). */
export function co2LitresPerSecond(who: Who, activity: Activity): number {
  return BMR_MJ_PER_DAY[who] * MET[activity] * 0.000484;
}

/** Water vapour from a person, g/h (assumption). */
export const MOISTURE_G_PER_H: Record<Activity, number> = { sleeping: 30, seated: 45, light: 60, care: 80, active: 110 };

/** Resuspended coarse dust from a moving person, mg/h of PM10 (assumption); a tenth is PM2.5. */
export const RESUSPENSION_MG_PER_H: Record<Activity, number> = { sleeping: 0, seated: 0.05, light: 0.3, care: 0.6, active: 1 };

/** Bioeffluent TVOC per person, mg/h (assumption). */
export const BIOEFFLUENT_TVOC_MG_PER_H = 0.3;

/** Loss rates, 1/h, besides ventilation (assumptions from typical indoor values). */
export const DEPOSITION_PER_H = { co2: 0, pm1: 0.2, pm25: 0.4, pm10: 1.5, o3: 2.8, no2: 0.5, co: 0, tvoc: 0, ethanol: 0 } as const;

/** Fraction of outdoor particles that get through the building shell (assumption). */
export const PM_PENETRATION = 0.8;

/** Cooking particles relative to PM2.5 (fine-dominated; assumption). */
export const COOKING_PM1_OF_PM25 = 0.8;
export const COOKING_PM10_OF_PM25 = 1.15;

/** Time constant of the heating system pulling room temperature to its setpoint, hours (assumption). */
export const HEATING_TAU_H = 1;
/** Steady-state warming per occupant, °C (assumption). */
export const WARMING_PER_PERSON_C = 0.25;

/** Converts a TVOC mass concentration (µg/m³) to ppb, with Kaiterra's factor (S1). */
export const tvocPpbFromUgM3 = (ugm3: number) => ugm3 / TVOC_UGM3_PER_PPB;
/** Converts ethanol µg/m³ to ppb at 25 °C: ppb = µg/m³ × 24.45 / 46.07. */
export const ethanolPpbFromUgM3 = (ugm3: number) => (ugm3 * 24.45) / 46.07;

/** Saturation water vapour density, g/m³ (Magnus formula over water). */
export function saturationVapourDensity(tempC: number): number {
  const es = 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC)); // hPa
  return (216.7 * es) / (tempC + 273.15);
}

export function relativeHumidity(vapourDensity: number, tempC: number): number {
  return Math.min(100, (100 * vapourDensity) / saturationVapourDensity(tempC));
}

export function vapourDensity(rhPct: number, tempC: number): number {
  return (rhPct / 100) * saturationVapourDensity(tempC);
}

/**
 * Exact step of dC/dt = S − L·C over `dtH` hours with constant S and L (per hour):
 * the steady state is S/L and the gap closes by e^(−L·dt).
 */
export function relax(c: number, source: number, loss: number, dtH: number): number {
  if (loss <= 0) return c + source * dtH;
  const ss = source / loss;
  return ss + (c - ss) * Math.exp(-loss * dtH);
}
