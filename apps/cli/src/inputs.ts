// Loading the CLI's inputs from disk: scenarios, device configs and true-air files (docs/06).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { parseIso, parseTrueAirCsv, parseTrueAirJsonl, type DeviceConfigInput, type DeviceEvent, type TrueAirSample } from "@vks/core";
import { scenarioDeviceConfig, validateScenario, type Scenario } from "@vks/true-air-gen";

export const DEFAULT_DEVICE_ID = "5e200000-0000-4000-8000-000000000001";

/** Resolves a user path against where `pnpm vks` was run (pnpm sets INIT_CWD). */
export function userPath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

export function scenarioDir(repoRoot: string): string {
  return join(repoRoot, "data", "scenarios");
}

export function listScenarios(repoRoot: string): Scenario[] {
  const dir = scenarioDir(repoRoot);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => loadScenarioFile(join(dir, f)));
}

function loadScenarioFile(path: string): Scenario {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return validateScenario(json);
  } catch (err) {
    throw new Error(`${basename(path)}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** A scenario by id (from data/scenarios) or by path. */
export function loadScenario(repoRoot: string, cwd: string, idOrPath: string): Scenario {
  const byId = join(scenarioDir(repoRoot), `${idOrPath}.json`);
  if (/^[a-z0-9-]+$/.test(idOrPath) && existsSync(byId)) return loadScenarioFile(byId);
  const path = userPath(cwd, idOrPath);
  if (!existsSync(path)) throw new Error(`No scenario "${idOrPath}" (not in data/scenarios, and no such file)`);
  return loadScenarioFile(path);
}

export function loadTrueAir(path: string): TrueAirSample[] {
  if (!existsSync(path)) throw new Error(`No such file: ${path}`);
  const text = readFileSync(path, "utf8");
  const ext = extname(path).toLowerCase();
  if (ext === ".csv") return parseTrueAirCsv(text);
  if (ext === ".jsonl" || ext === ".ndjson") return parseTrueAirJsonl(text);
  throw new Error(`${path}: use a .csv or .jsonl true-air file`);
}

/**
 * The device config: defaults, then the scenario's device settings, then the device file,
 * then --seed. Device-file event times may be RFC 3339 strings or Unix seconds.
 */
export function deviceConfig(opts: { devicePath?: string; scenario?: Scenario; seed?: string }): DeviceConfigInput {
  let config: DeviceConfigInput = { deviceId: DEFAULT_DEVICE_ID, name: "Virtual Sensedge Mini", seed: "1" };
  if (opts.scenario) {
    const fromScenario = scenarioDeviceConfig(opts.scenario, config.deviceId, config.seed);
    config = { ...config, ...fromScenario, name: opts.scenario.room.id };
  }
  if (opts.devicePath) {
    if (!existsSync(opts.devicePath)) throw new Error(`No such device file: ${opts.devicePath}`);
    const file = JSON.parse(readFileSync(opts.devicePath, "utf8")) as Partial<DeviceConfigInput> & { events?: (Omit<DeviceEvent, "t"> & { t: number | string })[] };
    const events = file.events?.map((e) => ({ ...e, t: typeof e.t === "string" ? parseIso(e.t) : e.t }) as DeviceEvent);
    config = {
      ...config,
      ...file,
      conditions: { ...config.conditions, ...file.conditions },
      events: [...(config.events ?? []), ...(events ?? [])],
    } as DeviceConfigInput;
  }
  if (opts.seed !== undefined) config = { ...config, seed: opts.seed };
  return config;
}
