// BACnet object view (docs/05; S4, ADR-0007): the Device object and the analog inputs listed in
// the Sensedge Mini PICS, with the property values a BACnet client would read. BACnet is local,
// so Present_Value is the latest reading produced, whether or not the cloud has received it.
// Engineering-unit numbers are from the BACnet EngineeringUnits enumeration (ASHRAE 135).

import type { DeviceConfig } from "../model/config.js";
import type { DeviceStatus, Reading } from "../model/types.js";
import type { ParamId } from "../params.js";
import { VARIANTS } from "../spec/modules.js";
import { bacnetInstance } from "./identity.js";

export interface EngineeringUnits {
  name: string;
  id: number;
}

export const UNITS = {
  microgramsPerCubicMeter: { name: "micrograms-per-cubic-meter", id: 219 },
  partsPerBillion: { name: "parts-per-billion", id: 97 },
  partsPerMillion: { name: "parts-per-million", id: 96 },
  degreesCelsius: { name: "degrees-celsius", id: 62 },
  percentRelativeHumidity: { name: "percent-relative-humidity", id: 29 },
  percent: { name: "percent", id: 98 },
  noUnits: { name: "no-units", id: 95 },
} as const satisfies Record<string, EngineeringUnits>;

export type Reliability = "no-fault-detected" | "unreliable-other" | "no-sensor";

export interface AnalogInput {
  objectIdentifier: ["analog-input", number];
  objectName: string;
  description: string;
  presentValue: number;
  units: EngineeringUnits;
  statusFlags: { inAlarm: boolean; fault: boolean; overridden: boolean; outOfService: boolean };
  reliability: Reliability;
  outOfService: boolean;
  covIncrement: number;
}

export interface BacnetDevice {
  objectIdentifier: ["device", number];
  objectName: string;
  vendorName: string;
  modelName: string;
  firmwareRevision: string;
  protocolRevision: number;
  description: string;
  location: string;
}

/** The PICS analog inputs (S4). COV increments are assumptions. */
const INPUTS: readonly { instance: number; name: string; param?: ParamId; bay?: 0 | 1; units: EngineeringUnits; cov: number }[] = [
  { instance: 1, name: "PM2.5", param: "pm25", units: UNITS.microgramsPerCubicMeter, cov: 1 },
  { instance: 2, name: "PM10", param: "pm10", units: UNITS.microgramsPerCubicMeter, cov: 1 },
  { instance: 3, name: "TVOC", param: "tvoc", units: UNITS.partsPerBillion, cov: 1 },
  { instance: 4, name: "Temperature", param: "temp", units: UNITS.degreesCelsius, cov: 0.1 },
  { instance: 5, name: "Humidity", param: "rh", units: UNITS.percentRelativeHumidity, cov: 1 },
  { instance: 6, name: "CO2", param: "co2", units: UNITS.partsPerMillion, cov: 10 },
  { instance: 7, name: "Unassigned", units: UNITS.noUnits, cov: 1 },
  { instance: 8, name: "KM20X Module Lifespan", bay: 0, units: UNITS.percent, cov: 1 },
  { instance: 9, name: "KM20X Module Lifespan", bay: 1, units: UNITS.percent, cov: 1 },
  { instance: 10, name: "O3", param: "o3", units: UNITS.partsPerBillion, cov: 1 },
];

export function bacnetView(config: DeviceConfig, status: DeviceStatus, readings: readonly Reading[], asOf: number): { device: BacnetDevice; objects: AnalogInput[] } {
  const model = VARIANTS[config.variant].model;
  const device: BacnetDevice = {
    objectIdentifier: ["device", bacnetInstance(config)],
    objectName: `Kaiterra-${model}`,
    vendorName: "Kaiterra",
    modelName: model,
    firmwareRevision: config.identity.firmwareVersion,
    protocolRevision: 14,
    description: config.name,
    location: config.identity.location,
  };

  const latest = new Map<ParamId, Reading>();
  for (const r of readings) {
    if (r.ts > asOf) continue;
    const prev = latest.get(r.param);
    if (prev === undefined || r.ts > prev.ts) latest.set(r.param, r);
  }

  const objects: AnalogInput[] = [];
  for (const input of INPUTS) {
    if (input.param !== undefined && !config.params.includes(input.param)) continue;
    let presentValue = 0;
    let reliability: Reliability = "no-sensor";
    let description = input.name;
    if (input.param !== undefined) {
      const r = latest.get(input.param);
      if (r !== undefined) {
        presentValue = r.value;
        reliability = r.flags.includes("warm-up") ? "unreliable-other" : "no-fault-detected";
      }
    } else if (input.bay !== undefined) {
      const m = status.modules[input.bay]!;
      presentValue = m.lifetimePct;
      reliability = "no-fault-detected";
      description = `${m.type} module lifespan (bay ${input.bay})`;
    }
    objects.push({
      objectIdentifier: ["analog-input", input.instance],
      objectName: input.name,
      description,
      presentValue,
      units: input.units,
      statusFlags: { inAlarm: false, fault: reliability !== "no-fault-detected", overridden: false, outOfService: false },
      reliability,
      outOfService: false,
      covIncrement: input.cov,
    });
  }
  return { device, objects };
}
