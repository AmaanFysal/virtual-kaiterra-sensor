// `pnpm vks <command>` (docs/06). The CLI is the I/O shell around @vks/core; wall-clock
// time and the environment are allowed here, never in packages/.

import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { UsageError, convertCommand, generateCommand, scenariosCommand, type CliIo } from "./commands.js";
import { getSetting } from "./env.js";
import { fetchFixtures } from "./fixtures-fetch.js";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const HELP = `Usage: pnpm vks <command> [options]

Commands:
  scenarios        List the synthetic true-air scenarios in data/scenarios
  generate         Scenario → true-air file
                     --scenario <id|path>  [--seed S]  [--out file.csv|file.jsonl]
  convert          True air → what the virtual Sensedge Mini reports
                     --input <true-air.csv|jsonl> or --scenario <id|path>
                     [--device data/devices/room1.json]  [--seed S]  [--as-of RFC3339]
                     [--format readings|kaiterra-top|kaiterra-history|kaiterra-device|mqtt1|mqtt2|bacnet|csv]
                     [--group-by 1h] [--time-zone Europe/London] [--begin/--end RFC3339] [--limit N]
                     [--frequency raw|hourly|daily]  [--out file]
  fixtures:fetch   Save live API responses from Kaiterra's public test Sensedge as fixtures
                   (needs KAITERRA_API_KEY in the environment or .env; does nothing without it)

Relative paths are relative to where you run pnpm. Output goes to stdout unless --out is given.
`;

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "scenarios":
        return scenariosCommand(io);
      case "generate":
        return generateCommand(io, rest);
      case "convert":
        return convertCommand(io, rest);
      case "fixtures:fetch": {
        const result = await fetchFixtures({
          key: getSetting("KAITERRA_API_KEY", join(io.repoRoot, ".env")),
          outDir: join(io.repoRoot, "test", "fixtures", "kaiterra-api", "live"),
          retrieved: new Date().toISOString().slice(0, 10),
          log: (line) => io.stdout(`${line}\n`),
        });
        if (result.status === "failed") {
          for (const e of result.errors) io.stderr(`${e}\n`);
          return 1;
        }
        return 0;
      }
      case undefined:
      case "help":
      case "--help":
        io.stdout(HELP);
        return 0;
      default:
        io.stderr(`Unknown command "${command}".\n\n${HELP}`);
        return 2;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`vks ${command}: ${message}\n`);
    return err instanceof UsageError || (err instanceof Error && err.name === "TypeError" && "code" in err) ? 2 : 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) {
  process.exitCode = await runCli(process.argv.slice(2), {
    cwd: process.env.INIT_CWD ?? process.cwd(),
    repoRoot: REPO_ROOT,
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
  });
}
