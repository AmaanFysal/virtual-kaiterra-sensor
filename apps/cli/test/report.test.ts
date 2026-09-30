// M7: the validation report (docs/08).

import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CliIo } from "../src/commands.js";
import { runCli } from "../src/main.js";
import { REPORTS_DIR } from "../src/report/command.js";
import { esc } from "../src/report/chart.js";
import { bucket, deviceAnnotations } from "../src/report/model.js";

const REPO = join(import.meta.dirname, "..", "..", "..");

async function report(...args: string[]) {
  const outDir = mkdtempSync(join(tmpdir(), "vks-report-"));
  let err = "";
  const io: CliIo = { cwd: outDir, repoRoot: REPO, stdout: () => {}, stderr: (t) => (err += t) };
  const code = await runCli(["report", ...args, "--out-dir", outDir], io);
  return { code, outDir, err, read: (f: string) => readFileSync(join(outDir, f), "utf8") };
}

describe("vks report", () => {
  it("writes an HTML and a Markdown report for a scenario", async () => {
    const r = await report("--scenario", "ensuite-shower-humid");
    expect(r.code, r.err).toBe(0);
    const md = r.read("ensuite-shower-humid.md");
    const html = r.read("ensuite-shower-humid.html");
    expect(md).toContain("# Validation report: ensuite-shower-humid");
    expect(md).toContain("**Healthy readings within the spec envelope: 100%**");
    expect(md).toContain("### pm-humidity");
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<meta name="viewport"');
    expect((html.match(/<figure class="chart"/g) ?? []).length).toBe(7);
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("Data table");
  });

  it("gives every condition effect its own section, with its periods", async () => {
    const cases: [string, string[]][] = [
      ["hand-gel-tvoc-spikes", ["mox-ethanol"]],
      ["poorly-ventilated-weeks", ["abc-offset"]],
      ["power-cycle-and-module-swap", ["warm-up"]],
      ["out-of-range-high", ["out-of-range", "extended-range"]],
    ];
    for (const [id, flags] of cases) {
      const r = await report("--scenario", id);
      const md = r.read(`${id}.md`);
      for (const f of flags) expect(md, id).toContain(`### ${f}`);
      expect(md).toContain("**Healthy readings within the spec envelope: 100%**");
    }
  });

  it("is deterministic", async () => {
    const a = await report("--scenario", "cleaning-tvoc-spike");
    const b = await report("--scenario", "cleaning-tvoc-spike");
    expect(a.read("cleaning-tvoc-spike.html")).toBe(b.read("cleaning-tvoc-spike.html"));
    expect(a.read("cleaning-tvoc-spike.md")).toBe(b.read("cleaning-tvoc-spike.md"));
  });

  it("keeps the committed reports in step with the code (regenerate with `pnpm vks report --all`)", async () => {
    const r = await report("--all");
    expect(r.code, r.err).toBe(0);
    const committed = join(REPO, REPORTS_DIR);
    const files = readdirSync(r.outDir).sort();
    expect(readdirSync(committed).sort()).toEqual(files);
    for (const f of files) expect(readFileSync(join(committed, f), "utf8"), `${f} is stale: run pnpm vks report --all`).toBe(r.read(f));
  }, 60_000);

  it("rejects missing or conflicting options", async () => {
    expect((await report()).code).toBe(2);
    expect((await report("--all", "--scenario", "step-changes")).code).toBe(2);
  });
});

describe("report pieces", () => {
  it("escapes text from scenario files", () => {
    expect(esc(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;'");
  });

  it("buckets long runs to at most 360 points and leaves gaps as gaps", () => {
    const readings = Array.from({ length: 1000 }, (_, i) => ({ param: "co2" as const, ts: 60 * (i + 1), span: 60, value: i, deliveredAt: 0, reference: i, truth: i, envelope: 1, flags: [] })).filter((x) => x.ts < 20_000 || x.ts > 30_000);
    const b = bucket(readings, 60, 60_000, 60);
    expect(b.points.length).toBeLessThanOrEqual(360);
    expect(b.points.some((p) => p.value === null)).toBe(true);
    expect(b.bucketSeconds).toBe(180);
  });

  it("turns the device log into event spans", () => {
    const a = deviceAnnotations(
      [
        { t: 100, kind: "power-off" },
        { t: 200, kind: "power-on" },
        { t: 300, kind: "module-replaced", bay: 1, module: "KM-203", serial: "VH1" },
        { t: 400, kind: "offline" },
      ],
      1000,
    );
    expect(a).toEqual([
      { from: 100, to: 200, label: "power off" },
      { from: 300, to: 300, label: "module swapped: bay 1 (KM-203)" },
      { from: 400, to: 1000, label: "offline" },
    ]);
  });
});
