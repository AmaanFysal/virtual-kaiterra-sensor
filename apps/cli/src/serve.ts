// `vks serve` (docs/06): the Kaiterra-compatible API over HTTP, replaying scenarios or true-air
// files through virtual devices.

import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { createReplayDevice, formatIso, hashString, parseIso, type ReplayDevice } from "@vks/core";
import { createKaiterraServer, fixedClock, replayClock, type SimClock } from "@vks/server";
import { generate } from "@vks/true-air-gen";
import { UsageError, type CliIo } from "./commands.js";
import { deviceConfig, loadScenario, loadTrueAir, userPath } from "./inputs.js";

export const DEFAULT_PORT = 8788;

/** A stable UUID-shaped device id for a scenario that has no device file. */
export function scenarioDeviceId(scenarioId: string): string {
  return `5e200000-0000-4000-8000-${(hashString(scenarioId) + hashString(`${scenarioId}/2`)).slice(0, 12)}`;
}

export interface ServeHandle {
  url: string;
  devices: ReplayDevice[];
  close(): Promise<void>;
}

export async function startServe(io: CliIo, argv: string[]): Promise<ServeHandle> {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: "string", multiple: true },
      input: { type: "string" },
      device: { type: "string" },
      seed: { type: "string" },
      port: { type: "string" },
      host: { type: "string", default: "127.0.0.1" },
      key: { type: "string", multiple: true },
      clock: { type: "string", default: "fixed" },
      speed: { type: "string", default: "60" },
      start: { type: "string" },
      cors: { type: "boolean", default: false },
    },
    strict: true,
  });
  const scenarios = values.scenario ?? [];
  if (scenarios.length === 0 && values.input === undefined) throw new UsageError("serve needs --scenario <id> (repeatable) or --input <true-air file> --device <config>");
  if (values.device !== undefined && scenarios.length + (values.input === undefined ? 0 : 1) > 1) throw new UsageError("--device applies to a single scenario or input; give each scenario its own run, or omit --device");
  const devicePath = values.device === undefined ? undefined : userPath(io.cwd, values.device);

  const devices: ReplayDevice[] = [];
  for (const id of scenarios) {
    const scenario = loadScenario(io.repoRoot, io.cwd, id);
    const seed = values.seed ?? scenario.id;
    const config = deviceConfig({ scenario, seed, ...(devicePath === undefined ? {} : { devicePath }) });
    if (devicePath === undefined) {
      config.deviceId = scenarioDeviceId(scenario.id);
      config.name = `${scenario.room.id} (${scenario.id})`;
    }
    devices.push(createReplayDevice(config, generate(scenario, seed).samples));
  }
  if (values.input !== undefined) {
    const samples = loadTrueAir(userPath(io.cwd, values.input));
    if (samples.length === 0) throw new UsageError("the true-air input is empty");
    devices.push(createReplayDevice(deviceConfig({ ...(devicePath === undefined ? {} : { devicePath }), ...(values.seed === undefined ? {} : { seed: values.seed }) }), samples));
  }

  const first = Math.min(...devices.map((d) => d.first));
  const last = Math.max(...devices.map((d) => d.last));
  let clock: SimClock;
  if (values.clock === "fixed") clock = fixedClock(values.start === undefined ? last : parseIso(values.start));
  else if (values.clock === "replay") {
    const speed = Number(values.speed);
    if (!(speed > 0)) throw new UsageError("--speed must be a positive number");
    clock = replayClock({ start: values.start === undefined ? first : parseIso(values.start), end: last, speed });
  } else throw new UsageError("--clock must be fixed or replay");

  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new UsageError("--port must be 0–65535");
  const server = createKaiterraServer({ devices, clock, cors: values.cors, ...(values.key === undefined ? {} : { apiKeys: values.key }) });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, values.host, resolve);
  });
  const url = `http://${values.host}:${(server.address() as AddressInfo).port}`;
  const key = values.key?.[0] ?? "any-key";
  io.stdout(
    [
      `Virtual Kaiterra API on ${url}/v1  (clock: ${clock.describe()})`,
      values.key === undefined ? "Keys: any non-empty ?key= is accepted (use --key to restrict)." : `Keys: ${values.key.length} accepted.`,
      "",
      ...devices.map((d) => `  ${d.config.deviceId}  ${d.config.name}  ${d.config.variant}  ${formatIso(d.first)} → ${formatIso(d.last)}`),
      "",
      `Try: curl '${url}/v1/devices/${devices[0]!.config.deviceId}/top?key=${key}'`,
      "",
    ].join("\n"),
  );
  return {
    url,
    devices,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
