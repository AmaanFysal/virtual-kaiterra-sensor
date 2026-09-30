// `vks fixtures:fetch` (docs/06): replaces the provisional API fixtures with live responses
// from Kaiterra's public test Sensedge. Works without a key (does nothing, says so). The key
// is redacted from every log line and every saved file.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const API_BASE = "https://api.kaiterra.com/v1";
/** Kaiterra's public test Sensedge (dev.kaiterra.com). */
export const TEST_SENSEDGE = "00000000-0031-0101-0000-00007e57c0de";

export interface FetchTarget {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

export const TARGETS: readonly FetchTarget[] = [
  { name: "devices-get", method: "GET", path: `/devices/${TEST_SENSEDGE}` },
  { name: "devices-top", method: "GET", path: `/devices/${TEST_SENSEDGE}/top` },
  { name: "devices-history", method: "GET", path: `/devices/${TEST_SENSEDGE}/history?limit=5` },
  { name: "devices-history-1h", method: "GET", path: `/devices/${TEST_SENSEDGE}/history?group_by=1h&limit=5` },
  {
    name: "batch-response",
    method: "POST",
    path: "/batch",
    body: [
      { method: "GET", relative_url: `/devices/${TEST_SENSEDGE}/top` },
      { method: "GET", relative_url: `/devices/${TEST_SENSEDGE}` },
    ],
  },
];

export const REDACTED = "REDACTED";

/** Replaces the key, raw or URL-encoded, wherever it appears. */
export function redact(text: string, key: string): string {
  if (key === "") return text;
  return text.split(key).join(REDACTED).split(encodeURIComponent(key)).join(REDACTED);
}

export interface FetchFixturesOptions {
  key: string | undefined;
  outDir: string;
  retrieved: string;
  targets?: readonly FetchTarget[];
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  write?: (path: string, content: string) => void;
}

export type FetchFixturesResult = { status: "skipped" } | { status: "fetched"; files: string[] } | { status: "failed"; errors: string[] };

export async function fetchFixtures(opts: FetchFixturesOptions): Promise<FetchFixturesResult> {
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const key = opts.key;
  if (key === undefined) {
    log("No KAITERRA_API_KEY set, so the provisional fixtures stay as they are.");
    log("To fetch live responses, add KAITERRA_API_KEY=... to .env (gitignored) and run this again.");
    return { status: "skipped" };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const write =
    opts.write ??
    ((path: string, content: string) => {
      mkdirSync(opts.outDir, { recursive: true });
      writeFileSync(path, content);
    });
  const files: string[] = [];
  const errors: string[] = [];
  for (const target of opts.targets ?? TARGETS) {
    const url = `${API_BASE}${target.path}${target.path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
    log(`${target.method} ${redact(url, key)}`);
    try {
      const res = await fetchImpl(url, {
        method: target.method,
        ...(target.body === undefined ? {} : { body: JSON.stringify(target.body), headers: { "Content-Type": "application/json" } }),
      });
      const text = redact(await res.text(), key);
      if (!res.ok) {
        errors.push(`${target.name}: HTTP ${res.status}`);
        log(`  HTTP ${res.status}, not saved`);
        continue;
      }
      const body = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
      const sidecar = {
        provenance: "live",
        url: redact(url, key),
        retrieved: opts.retrieved,
        provisional: false,
        note: `Live response from Kaiterra's public test Sensedge (${TEST_SENSEDGE}), key redacted.`,
      };
      const path = join(opts.outDir, `${target.name}.json`);
      write(path, body);
      write(join(opts.outDir, `${target.name}.source.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
      files.push(path);
      log(`  saved ${target.name}.json`);
    } catch (err) {
      const message = redact(err instanceof Error ? err.message : String(err), key);
      errors.push(`${target.name}: ${message}`);
      log(`  failed: ${message}`);
    }
  }
  return errors.length > 0 ? { status: "failed", errors } : { status: "fetched", files };
}

