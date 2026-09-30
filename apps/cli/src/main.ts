// `pnpm vks <command>` (docs/06). The CLI is the I/O shell around @vks/core; wall-clock
// time and the environment are allowed here, never in packages/.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSetting } from "./env.js";
import { fetchFixtures } from "./fixtures-fetch.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const HELP = `Usage: pnpm vks <command>

Commands:
  fixtures:fetch   Save live API responses from Kaiterra's public test Sensedge as fixtures
                   (needs KAITERRA_API_KEY in the environment or .env; does nothing without it)

Planned (docs/workstreams/v1-standalone-sensor/plan.md):
  generate         Synthetic true-air scenario → true-air file (M5/M6)
  convert          True-air file + device config → sensor readings (M6)
  report           True vs sensed validation report (M7)
`;

async function main(argv: string[]): Promise<number> {
  const [command] = argv;
  switch (command) {
    case "fixtures:fetch": {
      const result = await fetchFixtures({
        key: getSetting("KAITERRA_API_KEY", join(REPO_ROOT, ".env")),
        outDir: join(REPO_ROOT, "test", "fixtures", "kaiterra-api", "live"),
        retrieved: new Date().toISOString().slice(0, 10),
      });
      if (result.status === "failed") {
        for (const e of result.errors) process.stderr.write(`${e}\n`);
        return 1;
      }
      return 0;
    }
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(HELP);
      return 0;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
