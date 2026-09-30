// Sensor modules and device variants (docs/02). The Mini has two hot-swappable module bays
// (BACnet AI8 and AI9 are "KM20X Module Lifespan", S4); CO2, temperature and humidity are
// on the main board (no module prefix in Secondary MQTT Format 1, S5).

import type { ParamId } from "../params.js";

export type ModuleType = "KM-200" | "KM-201" | "KM-203" | "KM-207" | "KM-208";

export interface ModuleSpec {
  type: ModuleType;
  /** Kaiterra API `source` value for readings from this module (lower case, no dash). */
  source: string;
  params: readonly ParamId[];
  /** Nominal life in days at low exposure (S6: 18–24 months; S7: KM-200 2 years below 100 µg/m³). */
  lifeDays: number;
  /** Life at high exposure, days, where published (S7: KM-200 1.3 years above 200 µg/m³ PM2.5). */
  highExposureLifeDays?: number;
}

const YEAR = 365;

export const MODULES: Readonly<Record<ModuleType, ModuleSpec>> = {
  // S2 lists KM-200 as PM2.5 and PM10; PM1 is assumed from S1's PM1 size range (ADR-0003).
  "KM-200": { type: "KM-200", source: "km200", params: ["pm1", "pm25", "pm10"], lifeDays: 2 * YEAR, highExposureLifeDays: 1.3 * YEAR },
  "KM-201": { type: "KM-201", source: "km201", params: ["pm1", "pm25", "pm10", "tvoc"], lifeDays: 1.75 * YEAR },
  "KM-203": { type: "KM-203", source: "km203", params: ["tvoc"], lifeDays: 1.75 * YEAR },
  "KM-207": { type: "KM-207", source: "km207", params: ["tvoc", "o3"], lifeDays: 1.75 * YEAR },
  "KM-208": { type: "KM-208", source: "km208", params: ["o3", "no2", "co"], lifeDays: 1.75 * YEAR },
};

/** Parameters measured on the main board, with no module and no API `source`. */
export const ONBOARD_PARAMS: readonly ParamId[] = ["co2", "temp", "rh"];

export type Variant = "pm-tvoc" | "pm-tvoc-co2" | "well";

export interface VariantSpec {
  variant: Variant;
  /** Model string for GET /devices/{id} (S4: SE-200, SE-200P). */
  model: string;
  bays: readonly [ModuleType, ModuleType];
  onboard: readonly ParamId[];
  description: string;
}

export const VARIANTS: Readonly<Record<Variant, VariantSpec>> = {
  "pm-tvoc": {
    variant: "pm-tvoc",
    model: "SE-200",
    bays: ["KM-200", "KM-203"],
    onboard: ["temp", "rh"],
    description: "PM and TVOC modules, temperature and humidity; no CO2",
  },
  "pm-tvoc-co2": {
    variant: "pm-tvoc-co2",
    model: "SE-200",
    bays: ["KM-200", "KM-203"],
    onboard: ["co2", "temp", "rh"],
    description: "PM and TVOC modules with CO2, temperature and humidity (S2: CO2 on the A/P variants)",
  },
  well: {
    variant: "well",
    model: "SE-200",
    bays: ["KM-201", "KM-208"],
    onboard: ["co2", "temp", "rh"],
    description: "PM+TVOC and O3/NO2/CO modules with CO2, temperature and humidity (WELL set)",
  },
};

/** Which module (by bay) measures each parameter of a variant; undefined for on-board ones. */
export function moduleForParam(bays: readonly ModuleType[], param: ParamId): { bay: number; module: ModuleSpec } | undefined {
  for (let bay = 0; bay < bays.length; bay++) {
    const module = MODULES[bays[bay]!];
    if (module.params.includes(param)) return { bay, module };
  }
  return undefined;
}

export function variantParams(v: VariantSpec): ParamId[] {
  const fromModules = v.bays.flatMap((type) => MODULES[type].params);
  return [...new Set([...fromModules, ...v.onboard])];
}
