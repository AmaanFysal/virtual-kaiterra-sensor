// Measured parameters and the "true air" input (docs/04).

export const PARAMS = ["pm1", "pm25", "pm10", "co2", "tvoc", "temp", "rh", "o3", "no2", "co"] as const;
export type ParamId = (typeof PARAMS)[number];

/** Interferents: present in the air, not part of any reported quantity, but some sensors respond to them. */
export const INTERFERENTS = ["ethanol"] as const;
export type InterferentId = (typeof INTERFERENTS)[number];

/**
 * True air at one location and instant, in the units the device reports:
 * PM µg/m³, CO2 ppm, TVOC ppb (the Mølhave 22-VOC mix, ethanol excluded), temp °C,
 * RH %, O3 and NO2 ppb, CO ppm, ethanol ppb. Missing keys mean "not known".
 */
export type TrueAir = Partial<Record<ParamId | InterferentId, number>>;

/** One true-air sample. `t` is Unix seconds, UTC. */
export interface TrueAirSample {
  t: number;
  air: TrueAir;
}

export function isParamId(value: string): value is ParamId {
  return (PARAMS as readonly string[]).includes(value);
}
