// M8: `vks serve` end to end.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatTrueAirCsv } from "@vks/core";
import { afterEach, describe, expect, it } from "vitest";
import type { CliIo } from "../src/commands.js";
import { runCli } from "../src/main.js";
import { scenarioDeviceId, startServe, type ServeHandle } from "../src/serve.js";

const REPO = join(import.meta.dirname, "..", "..", "..");
const handles: ServeHandle[] = [];
afterEach(async () => {
  await Promise.all(handles.splice(0).map((h) => h.close()));
});

function io() {
  let out = "";
  let err = "";
  const cli: CliIo = { cwd: REPO, repoRoot: REPO, stdout: (t) => (out += t), stderr: (t) => (err += t) };
  return { cli, out: () => out, err: () => err };
}

async function serve(...argv: string[]) {
  const i = io();
  const h = await startServe(i.cli, ["--port", "0", ...argv]);
  handles.push(h);
  return { h, out: i.out() };
}

describe("vks serve", () => {
  it("serves several scenarios, each as its own device", async () => {
    const { h, out } = await serve("--scenario", "door-closed-co2-rise", "--scenario", "hand-gel-tvoc-spikes", "--key", "k1");
    const ids = [scenarioDeviceId("door-closed-co2-rise"), scenarioDeviceId("hand-gel-tvoc-spikes")];
    expect(out).toContain(`${h.url}/v1`);
    expect(out).toContain(ids[0]);
    const index = (await (await fetch(`${h.url}/`)).json()) as { devices: { id: string }[] };
    expect(index.devices.map((d) => d.id)).toEqual(ids);
    const top = await fetch(`${h.url}/v1/devices/${ids[1]}/top?key=k1`);
    expect(top.status).toBe(200);
    const body = (await top.json()) as { data: { param: string }[] };
    expect(body.data.map((s) => s.param)).toEqual(expect.arrayContaining(["rco2", "rtvoc", "tvoc"]));
    expect((await fetch(`${h.url}/v1/devices/${ids[1]}/top?key=other`)).status).toBe(401);
  });

  it("uses the end of the data as 'now' by default, and --start to pick another time", async () => {
    const end = await serve("--scenario", "cleaning-tvoc-spike");
    const id = scenarioDeviceId("cleaning-tvoc-spike");
    const ts = async (url: string) => ((await (await fetch(`${url}/v1/devices/${id}/top?key=x`)).json()) as { data: { points: { ts: string }[] }[] }).data[0]!.points[0]!.ts;
    expect(await ts(end.h.url)).toBe("2026-11-03T13:00:00Z");
    const mid = await serve("--scenario", "cleaning-tvoc-spike", "--start", "2026-11-03T11:00:00Z");
    expect(await ts(mid.h.url)).toBe("2026-11-03T11:00:00Z");
  });

  it("serves a true-air file with a device config", async () => {
    const { h } = await serve("--input", writeAir(), "--device", "data/devices/room1.json");
    const res = await fetch(`${h.url}/v1/devices/5e200000-0000-4000-8000-000000000001?key=x`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe("Room 1");
  });

  it("replays in real time when asked", async () => {
    const { h, out } = await serve("--scenario", "step-changes", "--clock", "replay", "--speed", "600");
    expect(out).toContain("replay from 2026-11-03T12:00:00.000Z at 600×");
    const id = scenarioDeviceId("step-changes");
    const first = (await (await fetch(`${h.url}/`)).json()) as { as_of: string };
    expect(first.as_of.startsWith("2026-11-03T12:0")).toBe(true); // just after the scenario start
    expect((await fetch(`${h.url}/v1/devices/${id}/history?key=x`)).status).toBe(200);
  });

  it("rejects bad options with usage errors", async () => {
    const run = async (...argv: string[]) => {
      const i = io();
      return { code: await runCli(["serve", ...argv], i.cli), err: i.err() };
    };
    expect((await run()).code).toBe(2);
    expect((await run("--scenario", "step-changes", "--clock", "sundial")).code).toBe(2);
    expect((await run("--scenario", "step-changes", "--scenario", "bedroom-night", "--device", "data/devices/room1.json")).code).toBe(2);
    expect((await run("--scenario", "step-changes", "--scenario", "step-changes", "--port", "0")).err).toMatch(/share the id/);
  });
});

function writeAir(): string {
  const path = join(mkdtempSync(join(tmpdir(), "vks-serve-")), "air.csv");
  const t0 = 1_793_685_600;
  writeFileSync(path, formatTrueAirCsv(Array.from({ length: 61 }, (_, m) => ({ t: t0 + m * 60, air: { co2: 600 + m, pm25: 8, pm10: 12, pm1: 5, tvoc: 100, temp: 21, rh: 45 } }))));
  return path;
}
