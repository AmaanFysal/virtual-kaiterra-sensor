// `vks report` (docs/08): a scenario through the device, as HTML and Markdown.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { UsageError, type CliIo } from "../commands.js";
import { deviceConfig, listScenarios, loadScenario, userPath } from "../inputs.js";
import { buildReport } from "./model.js";
import { renderHtml, renderIndex, renderMarkdown } from "./render.js";

export const REPORTS_DIR = join("docs", "workstreams", "v1-standalone-sensor", "reports");

export function reportCommand(io: CliIo, argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { scenario: { type: "string" }, all: { type: "boolean" }, seed: { type: "string" }, device: { type: "string" }, "out-dir": { type: "string" } },
    strict: true,
  });
  if (!values.all && !values.scenario) throw new UsageError("report needs --scenario <id|path> or --all");
  if (values.all && values.scenario) throw new UsageError("use either --scenario or --all");
  const outDir = values["out-dir"] === undefined ? join(io.repoRoot, REPORTS_DIR) : userPath(io.cwd, values["out-dir"]);
  mkdirSync(outDir, { recursive: true });
  const scenarios = values.all ? listScenarios(io.repoRoot) : [loadScenario(io.repoRoot, io.cwd, values.scenario!)];
  const rows = [];
  for (const scenario of scenarios) {
    const seed = values.seed ?? scenario.id;
    const config = deviceConfig({
      scenario,
      seed,
      ...(values.device === undefined ? {} : { devicePath: userPath(io.cwd, values.device) }),
    });
    const model = buildReport(scenario, seed, config);
    writeFileSync(join(outDir, `${scenario.id}.html`), renderHtml(model));
    writeFileSync(join(outDir, `${scenario.id}.md`), renderMarkdown(model));
    const t = model.data.totals;
    io.stderr(`${scenario.id}: ${t.healthyWithin}/${t.healthy} healthy readings in spec, ${t.flagged} flagged\n`);
    rows.push({ id: scenario.id, description: scenario.description, model });
  }
  if (values.all) writeFileSync(join(outDir, "README.md"), renderIndex(rows));
  io.stderr(`wrote ${values.all ? rows.length * 2 + 1 : 2} files to ${outDir}\n`);
  return 0;
}
