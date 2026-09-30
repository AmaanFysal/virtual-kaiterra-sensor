// M6: the CLI end to end, in-process, in a temporary directory.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatTrueAirCsv, formatTrueAirJsonl, parseTrueAirCsv, parseTrueAirJsonl } from "@vks/core";
import { describe, expect, it } from "vitest";
import type { CliIo } from "../src/commands.js";
import { runCli } from "../src/main.js";

const REPO = join(import.meta.dirname, "..", "..", "..");

function cli() {
  const cwd = mkdtempSync(join(tmpdir(), "vks-cli-"));
  let out = "";
  let err = "";
  const io: CliIo = { cwd, repoRoot: REPO, stdout: (t) => (out += t), stderr: (t) => (err += t) };
  const run = async (...argv: string[]) => {
    out = "";
    err = "";
    const code = await runCli(argv, io);
    return { code, out, err };
  };
  return { cwd, run };
}

describe("true-air files", () => {
  it("round-trip through CSV and JSON Lines", () => {
    const samples = [
      { t: 1_793_685_600, air: { co2: 650, pm25: 8.5, temp: 21.25, rh: 45, ethanol: 0 } },
      { t: 1_793_685_660, air: { co2: 655 } },
    ];
    expect(parseTrueAirCsv(formatTrueAirCsv(samples))).toEqual(samples);
    expect(parseTrueAirJsonl(formatTrueAirJsonl(samples))).toEqual(samples);
  });

  it("accept Unix seconds and reject unknown columns or bad values, with the line", () => {
    expect(parseTrueAirCsv("timestamp,co2\n1793685600,650\n")).toEqual([{ t: 1_793_685_600, air: { co2: 650 } }]);
    expect(() => parseTrueAirCsv("timestamp,radon\n1793685600,1\n")).toThrow(/radon/);
    expect(() => parseTrueAirCsv("timestamp,co2\n2026-11-03T06:00:00Z,abc\n")).toThrow(/line 2/);
    expect(() => parseTrueAirJsonl('{"ts":"yesterday","co2":1}\n')).toThrow(/line 1/);
    expect(() => parseTrueAirJsonl('{"co2":1}\n')).toThrow(/"ts"/);
  });
});

describe("vks", () => {
  it("lists the scenarios", async () => {
    const { run } = cli();
    const r = await run("scenarios");
    expect(r.code).toBe(0);
    expect(r.out.split("\n").filter(Boolean)).toHaveLength(11);
  });

  it("generates a scenario to CSV and JSONL, reproducibly", async () => {
    const { run, cwd } = cli();
    expect((await run("generate", "--scenario", "cleaning-tvoc-spike", "--out", "a.csv")).code).toBe(0);
    expect((await run("generate", "--scenario", "cleaning-tvoc-spike", "--out", "b.jsonl")).code).toBe(0);
    const csv = parseTrueAirCsv(readFileSync(join(cwd, "a.csv"), "utf8"));
    expect(csv).toHaveLength(181);
    expect(parseTrueAirJsonl(readFileSync(join(cwd, "b.jsonl"), "utf8"))).toEqual(csv);
    const again = await run("generate", "--scenario", "cleaning-tvoc-spike");
    expect(again.out).toBe(readFileSync(join(cwd, "a.csv"), "utf8"));
  });

  it("converts true air to every output format", async () => {
    const { run, cwd } = cli();
    await run("generate", "--scenario", "door-closed-co2-rise", "--out", "air.csv");
    const device = join(REPO, "data", "devices", "room1.json");
    const formats: Record<string, (out: string) => void> = {
      readings: (o) => expect(JSON.parse(o.split("\n")[0]!)).toHaveProperty("reference"),
      "kaiterra-top": (o) => expect(JSON.parse(o).data.map((s: { param: string }) => s.param)).toContain("rco2"),
      "kaiterra-history": (o) => expect(JSON.parse(o).data[0].points.length).toBeGreaterThan(200),
      "kaiterra-device": (o) => expect(JSON.parse(o)).toMatchObject({ id: "5e200000-0000-4000-8000-000000000001", name: "Room 1", model: "SE-200" }),
      mqtt1: (o) => expect(JSON.parse(o.split("\n")[0]!).topic).toBe("kaiterra/device/history/5e200000-0000-4000-8000-000000000001"),
      mqtt2: (o) => expect(JSON.parse(o.split("\n")[0]!).payload.units.co2).toBe("ppm"),
      bacnet: (o) => expect(JSON.parse(o).device.objectName).toBe("Kaiterra-SE-200"),
      csv: (o) => expect(o.split("\n")[0]).toMatch(/^Timestamp \(UTC\),PM1/),
    };
    for (const [format, check] of Object.entries(formats)) {
      const r = await run("convert", "--input", "air.csv", "--device", device, "--format", format);
      expect(r.code, `${format}: ${r.err}`).toBe(0);
      check(r.out);
    }
    const hourly = await run("convert", "--input", "air.csv", "--format", "kaiterra-history", "--group-by", "1h", "--out", "h.json");
    expect(hourly.code).toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "h.json"), "utf8")).data[0].span).toBe(3600);
  });

  it("applies a scenario's device settings, and --seed changes the device", async () => {
    const { run } = cli();
    const shower = await run("convert", "--scenario", "ensuite-shower-humid", "--format", "readings");
    expect(shower.out).toContain('"pm-humidity"');
    const a = await run("convert", "--scenario", "step-changes", "--format", "readings", "--seed", "a");
    const b = await run("convert", "--scenario", "step-changes", "--format", "readings", "--seed", "b");
    expect(a.out).not.toBe(b.out);
  });

  it("merges a device file's events given as RFC 3339 times", async () => {
    const { run, cwd } = cli();
    writeFileSync(join(cwd, "dev.json"), JSON.stringify({ deviceId: "d", seed: "s", events: [{ t: "2026-11-03T12:30:00Z", kind: "replace-module", bay: 0 }] }));
    const r = await run("convert", "--scenario", "step-changes", "--device", "dev.json", "--format", "kaiterra-device");
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out).handshake.modules[0].lifetime_pct).toBeGreaterThan(99.9);
  });

  it("honours --as-of: readings not yet delivered are not reported", async () => {
    const { run } = cli();
    const r = await run("convert", "--scenario", "cleaning-tvoc-spike", "--format", "kaiterra-top", "--as-of", "2026-11-03T11:00:00Z");
    expect(JSON.parse(r.out).data[0].points[0].ts).toBe("2026-11-03T11:00:00Z");
  });

  it("fails clearly on bad input", async () => {
    const { run, cwd } = cli();
    expect((await run("convert")).code).toBe(2);
    expect((await run("convert", "--scenario", "step-changes", "--format", "xml")).code).toBe(2);
    expect((await run("generate", "--scenario", "no-such-scenario")).err).toMatch(/No scenario/);
    expect((await run("convert", "--input", "missing.csv")).err).toMatch(/No such file/);
    expect((await run("generate", "--bogus")).code).toBe(2);
    writeFileSync(join(cwd, "bad.json"), JSON.stringify({ id: "bad", durationMinutes: 5, room: { id: "Room1" } }));
    expect((await run("generate", "--scenario", "bad.json")).err).toMatch(/room\.floorAreaM2/);
    expect((await run("frobnicate")).code).toBe(2);
  });
});
