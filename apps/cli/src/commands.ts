// The CLI commands (docs/06): scenarios, generate, convert. `report` is in report.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { parseArgs } from "node:util";
import {
  bacnetView,
  csvExport,
  formatIso,
  formatReadingsJsonl,
  formatTrueAirCsv,
  formatTrueAirJsonl,
  kaiterraApi,
  mqttMessages,
  parseIso,
  simulate,
  type ApiContext,
  type CsvFrequency,
} from "@vks/core";
import { generate } from "@vks/true-air-gen";
import { deviceConfig, listScenarios, loadScenario, loadTrueAir, userPath } from "./inputs.js";

export interface CliIo {
  /** Where relative paths resolve (where `pnpm vks` was run). */
  cwd: string;
  repoRoot: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export class UsageError extends Error {}

export function writeOutput(io: CliIo, out: string | undefined, text: string): void {
  if (out === undefined) {
    io.stdout(text);
    return;
  }
  const path = userPath(io.cwd, out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  io.stderr(`wrote ${out}\n`);
}

export function scenariosCommand(io: CliIo): number {
  const rows = listScenarios(io.repoRoot).map((s) => `${s.id.padEnd(30)} ${s.room.id.padEnd(9)} ${String(s.durationMinutes / 60).padStart(5)} h  ${s.description}`);
  io.stdout(`${rows.join("\n")}\n`);
  return 0;
}

export function generateCommand(io: CliIo, argv: string[]): number {
  const { values } = parseArgs({ args: argv, options: { scenario: { type: "string" }, seed: { type: "string" }, out: { type: "string" }, format: { type: "string" } }, strict: true });
  if (!values.scenario) throw new UsageError("generate needs --scenario <id|path>");
  const scenario = loadScenario(io.repoRoot, io.cwd, values.scenario);
  const g = generate(scenario, values.seed ?? scenario.id);
  const format = values.format ?? (values.out && extname(values.out) === ".jsonl" ? "jsonl" : "csv");
  if (format !== "csv" && format !== "jsonl") throw new UsageError("--format must be csv or jsonl");
  writeOutput(io, values.out, format === "csv" ? formatTrueAirCsv(g.samples) : formatTrueAirJsonl(g.samples));
  return 0;
}

export const CONVERT_FORMATS = ["readings", "kaiterra-top", "kaiterra-history", "kaiterra-device", "mqtt1", "mqtt2", "bacnet", "csv"] as const;
type ConvertFormat = (typeof CONVERT_FORMATS)[number];

export function convertCommand(io: CliIo, argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: "string" },
      scenario: { type: "string" },
      device: { type: "string" },
      seed: { type: "string" },
      format: { type: "string", default: "readings" },
      "as-of": { type: "string" },
      "group-by": { type: "string" },
      "time-zone": { type: "string" },
      begin: { type: "string" },
      end: { type: "string" },
      limit: { type: "string" },
      frequency: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  const format = values.format as ConvertFormat;
  if (!CONVERT_FORMATS.includes(format)) throw new UsageError(`--format must be one of ${CONVERT_FORMATS.join(", ")}`);
  const scenario = values.scenario === undefined ? undefined : loadScenario(io.repoRoot, io.cwd, values.scenario);
  let samples;
  if (values.input !== undefined) samples = loadTrueAir(userPath(io.cwd, values.input));
  else if (scenario !== undefined) samples = generate(scenario, values.seed ?? scenario.id).samples;
  else throw new UsageError("convert needs --input <true-air.csv|jsonl> or --scenario <id|path>");
  if (samples.length === 0) throw new UsageError("the true-air input is empty");

  const config = deviceConfig({
    ...(values.device === undefined ? {} : { devicePath: userPath(io.cwd, values.device) }),
    ...(scenario === undefined ? {} : { scenario }),
    ...(values.seed === undefined ? {} : { seed: values.seed }),
  });
  const result = simulate(config, samples);
  const asOf = values["as-of"] === undefined ? samples[samples.length - 1]!.t : parseIso(values["as-of"]);
  const device = { config: result.config, readings: [...result.readings, ...result.undelivered], status: result.status };
  const ctx: ApiContext = { devices: [device], asOf };
  const api = (path: string) => {
    const res = kaiterraApi(ctx, { method: "GET", path, query: { key: "cli" } });
    if (res.code !== 200) throw new UsageError(`API ${res.code}: ${JSON.stringify(res.body)}`);
    return `${JSON.stringify(res.body, null, 2)}\n`;
  };
  const id = result.config.deviceId;

  let text: string;
  switch (format) {
    case "readings":
      text = formatReadingsJsonl(result.readings.filter((r) => r.deliveredAt <= asOf));
      break;
    case "kaiterra-top":
      text = api(`/devices/${id}/top`);
      break;
    case "kaiterra-device":
      text = api(`/devices/${id}`);
      break;
    case "kaiterra-history": {
      const q = new URLSearchParams();
      if (values["group-by"]) q.set("group_by", values["group-by"]);
      if (values["time-zone"]) q.set("time_zone", values["time-zone"]);
      if (values.begin) q.set("begin", values.begin);
      if (values.end) q.set("end", values.end);
      if (values.limit) q.set("limit", values.limit);
      text = api(`/devices/${id}/history${q.size > 0 ? `?${q.toString()}` : ""}`);
      break;
    }
    case "mqtt1":
    case "mqtt2":
      text = mqttMessages(result.config, result.readings.filter((r) => r.deliveredAt <= asOf), format === "mqtt1" ? 1 : 2)
        .map((m) => JSON.stringify({ topic: m.topic, published_at: formatIso(m.publishedAt), payload: m.payload }))
        .join("\n")
        .concat("\n");
      break;
    case "bacnet":
      text = `${JSON.stringify(bacnetView(result.config, result.status, result.readings, asOf), null, 2)}\n`;
      break;
    case "csv": {
      const frequency = (values.frequency ?? "raw") as CsvFrequency;
      if (!["raw", "hourly", "daily"].includes(frequency)) throw new UsageError("--frequency must be raw, hourly or daily");
      text = csvExport(result.config, result.readings, { asOf, frequency, ...(values["time-zone"] ? { timeZone: values["time-zone"] } : {}) });
      break;
    }
  }
  writeOutput(io, values.out, text);
  return 0;
}
