// Stable per-device identifiers derived from the seed (docs/05): serial number, MAC addresses
// and BACnet instance. Formats follow the evidence: DSN "KG200104631" (S5, a Mini), module
// serials "VH21110009" (S3).

import type { DeviceConfig } from "../model/config.js";
import { hashString } from "../rng.js";

const digits = (text: string, n: number) => String(parseInt(hashString(text), 16) % 10 ** n).padStart(n, "0");

/** Device serial number, e.g. "KG212345678". */
export function deviceSerial(config: DeviceConfig): string {
  return `KG2${digits(`${config.seed}/dsn`, 8)}`;
}

/** A locally administered unicast MAC ("02:…"), different for Ethernet and Wi-Fi. */
export function macAddress(config: DeviceConfig, which: "eth" | "wifi"): string {
  const h = hashString(`${config.seed}/mac/${which}`) + hashString(`${config.seed}/mac/${which}/2`);
  const bytes = [0x02, ...[0, 2, 4, 6, 8].map((i) => parseInt(h.slice(i, i + 2), 16))];
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

/** BACnet device instance: configured, or derived from the seed (valid range 0–4,194,302). */
export function bacnetInstance(config: DeviceConfig): number {
  return config.identity.bacnetInstance ?? parseInt(hashString(`${config.seed}/bacnet`), 16) % 4_194_303;
}

/** Normalises a device id the way the API matches UDIDs: case-insensitive, dashes optional (S3). */
export function normaliseUdid(id: string): string {
  return id.toLowerCase().replace(/-/g, "");
}
