// Sensedge Mini Secondary MQTT payloads (docs/05; S5). One message per reporting interval,
// published when the interval's readings are delivered (backfilled intervals on reconnect,
// with their original `ts`). Keys the Kaiterra guide shows are copied exactly, including
// `km203.rtvocb (ppb)` and `km207.r03`; keys it does not show are marked as guesses (docs/09).

import type { DeviceConfig } from "../model/config.js";
import type { Reading } from "../model/types.js";
import { PARAMS, type ParamId } from "../params.js";
import { deviceSerial } from "./identity.js";

export const MQTT_TOPIC_PREFIX = "kaiterra/device/history";

export interface MqttMessage {
  topic: string;
  /** When the device publishes it (the delivery time); not part of the payload. */
  publishedAt: number;
  payload: Record<string, unknown>;
}

/** Format 1 keys: module-prefixed raw names (S5). */
function format1Key(param: ParamId, source: string | undefined): string {
  const m = source ?? "";
  switch (param) {
    case "pm25":
      return `${m}.rpm25c`;
    case "pm10":
      return `${m}.rpm10c`;
    case "pm1":
      return `${m}.rpm1c`; // guess
    case "tvoc":
      return `${m}.rtvocb (ppb)`;
    case "o3":
      return `${m}.r03`;
    case "no2":
      return `${m}.rno2 (ppb)`; // guess
    case "co":
      return `${m}.rco (ppm)`; // guess
    case "co2":
      return "rco2 (ppm)";
    case "rh":
      return "rhumid";
    case "temp":
      return "rtemp";
  }
}

/** Format 2 names and units, in the guide's order; PM1, NO2 and CO are guesses. */
const FORMAT2: readonly [ParamId, string, string][] = [
  ["temp", "temperature", "C"],
  ["rh", "humidity", "%"],
  ["pm25", "pm25", "ug/m3"],
  ["pm10", "pm10", "ug/m3"],
  ["co2", "co2", "ppm"],
  ["tvoc", "tvoc", "ppb"],
  ["o3", "o3", "ppb"],
  ["pm1", "pm1", "ug/m3"],
  ["no2", "no2", "ppb"],
  ["co", "co", "ppm"],
];

function groups(readings: readonly Reading[]): Reading[][] {
  const byTs = new Map<number, Reading[]>();
  for (const r of readings) byTs.set(r.ts, [...(byTs.get(r.ts) ?? []), r]);
  return [...byTs.values()]
    .map((g) => g.sort((a, b) => PARAMS.indexOf(a.param) - PARAMS.indexOf(b.param)))
    .sort((a, b) => a[0]!.deliveredAt - b[0]!.deliveredAt || a[0]!.ts - b[0]!.ts);
}

/** Messages for delivered readings, in publishing order. */
export function mqttMessages(config: DeviceConfig, readings: readonly Reading[], format: 1 | 2): MqttMessage[] {
  const topic = `${MQTT_TOPIC_PREFIX}/${config.deviceId}`;
  const head = { dsn: deviceSerial(config), dudid: config.deviceId };
  return groups(readings).map((g) => {
    const ts = g[0]!.ts;
    if (format === 1) {
      const data = Object.fromEntries(g.map((r) => [format1Key(r.param, r.source), r.value]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1)));
      return { topic, publishedAt: g[0]!.deliveredAt, payload: { ts, ...head, data } };
    }
    const present = FORMAT2.filter(([p]) => g.some((r) => r.param === p));
    const data = Object.fromEntries(present.map(([p, name]) => [name, g.find((r) => r.param === p)!.value]));
    const units = Object.fromEntries(present.map(([, name, unit]) => [name, unit]));
    return { topic, publishedAt: g[0]!.deliveredAt, payload: { ts, ...head, data, units } };
  });
}
