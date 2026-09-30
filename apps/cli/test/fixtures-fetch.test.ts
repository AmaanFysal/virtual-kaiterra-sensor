import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEnvFile } from "../src/env.js";
import { REDACTED, TARGETS, fetchFixtures, redact } from "../src/fixtures-fetch.js";

const KEY = "sk_test_Abc123-very+secret/value";

describe("fixtures:fetch", () => {
  it("does nothing, successfully, when no key is set", async () => {
    const lines: string[] = [];
    let fetched = false;
    const result = await fetchFixtures({
      key: undefined,
      outDir: "/nowhere",
      retrieved: "2026-09-30",
      log: (l) => lines.push(l),
      fetchImpl: (async () => {
        fetched = true;
        throw new Error("must not fetch");
      }) as typeof fetch,
      write: () => {
        throw new Error("must not write");
      },
    });
    expect(result).toEqual({ status: "skipped" });
    expect(fetched).toBe(false);
    expect(lines.join("\n")).toMatch(/KAITERRA_API_KEY/);
  });

  it("never logs or saves the key, even when the API echoes it back", async () => {
    const lines: string[] = [];
    const files = new Map<string, string>();
    const requested: string[] = [];
    const fakeFetch = (async (url: string) => {
      requested.push(url);
      const echoed = { _links: { next: `${url}&page=2` }, data: [{ param: "rco2", units: "ppm", span: 60, points: [{ ts: "2026-09-30T12:00:00Z", value: 612 }] }] };
      return new Response(JSON.stringify(echoed), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchFixtures({ key: KEY, outDir: "/out", retrieved: "2026-09-30", log: (l) => lines.push(l), fetchImpl: fakeFetch, write: (p, c) => files.set(p, c) });

    expect(result.status).toBe("fetched");
    expect(requested).toHaveLength(TARGETS.length);
    expect(requested.every((u) => u.includes(`key=${encodeURIComponent(KEY)}`))).toBe(true);
    expect(files.size).toBe(TARGETS.length * 2);
    for (const text of [...lines, ...files.values()]) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(encodeURIComponent(KEY));
    }
    expect([...files.values()].some((c) => c.includes(REDACTED))).toBe(true);
    const sidecar = JSON.parse(files.get("/out/devices-top.source.json")!);
    expect(sidecar).toMatchObject({ provenance: "live", provisional: false, retrieved: "2026-09-30" });
  });

  it("reports HTTP errors without saving and without leaking the key", async () => {
    const lines: string[] = [];
    const result = await fetchFixtures({
      key: KEY,
      outDir: "/out",
      retrieved: "2026-09-30",
      targets: [TARGETS[0]!],
      log: (l) => lines.push(l),
      fetchImpl: (async () => new Response(`bad key ${KEY}`, { status: 401 })) as unknown as typeof fetch,
      write: () => {
        throw new Error("must not write");
      },
    });
    expect(result).toEqual({ status: "failed", errors: ["devices-get: HTTP 401"] });
    expect(lines.join("\n")).not.toContain(KEY);
  });

  it("redacts raw and URL-encoded keys", () => {
    expect(redact(`a ${KEY} b ${encodeURIComponent(KEY)}`, KEY)).toBe(`a ${REDACTED} b ${REDACTED}`);
  });
});

describe(".env reading", () => {
  it("reads KEY=VALUE lines, strips quotes and ignores comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "vks-env-"));
    const path = join(dir, ".env");
    writeFileSync(path, `# comment\nKAITERRA_API_KEY="abc"\nEMPTY=\n OTHER = x y \n`);
    expect(readEnvFile(path)).toEqual({ KAITERRA_API_KEY: "abc", EMPTY: "", OTHER: "x y" });
    expect(readEnvFile(join(dir, "missing"))).toEqual({});
  });
});
