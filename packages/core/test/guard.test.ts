// Constitution guard (docs/00 rule 2): the pure packages never read the wall clock, use
// Math.random, touch the filesystem or network, or read the environment.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const BANNED: [RegExp, string][] = [
  [/Math\.random/, "Math.random"],
  [/Date\.now/, "Date.now"],
  [/new Date\(/, "new Date("],
  [/performance\.now/, "performance.now"],
  [/\bsetTimeout\b|\bsetInterval\b/, "timers"],
  [/process\.env/, "process.env"],
  [/from "node:(fs|net|http|https|child_process|dgram)/, "Node I/O modules"],
  [/\bconsole\./, "console"],
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("determinism guard", () => {
  const packagesDir = join(ROOT, "packages");
  const files = readdirSync(packagesDir).flatMap((pkg) => {
    const src = join(packagesDir, pkg, "src");
    try {
      return tsFiles(src);
    } catch {
      return [];
    }
  });

  it("finds the pure packages' sources", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has no wall-clock time, Math.random, I/O or env in packages/*/src", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        for (const [re, label] of BANNED) {
          if (re.test(code)) hits.push(`${relative(ROOT, file)}:${i + 1} uses ${label}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
