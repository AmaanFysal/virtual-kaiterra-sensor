// Reads optional settings from the environment or a repo-root `.env` (gitignored).
// Values are returned, never printed.

import { existsSync, readFileSync } from "node:fs";

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** The process environment wins over `.env`; an empty value counts as unset. */
export function getSetting(name: string, envFile: string): string | undefined {
  const value = process.env[name] ?? readEnvFile(envFile)[name];
  return value === undefined || value === "" ? undefined : value;
}
