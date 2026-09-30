// M8: the Kaiterra-compatible HTTP server (docs/06), over real HTTP on a random port.

import type { AddressInfo } from "node:net";
import { createReplayDevice, formatIso, kaiterraApi, parseIso, type TrueAirSample } from "@vks/core";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock, replayClock, type SimClock } from "../src/clock.js";
import { apiContext, createKaiterraServer, type ServerOptions } from "../src/server.js";

const T0 = parseIso("2026-11-03T06:00:00Z");
const ROOM1 = "5e200000-0000-4000-8000-000000000001";
const LOUNGE = "5e200000-0000-4000-8000-000000000002";

function air(hours: number, co2 = (m: number) => 600 + 400 * Math.sin(m / 60)): TrueAirSample[] {
  const out: TrueAirSample[] = [];
  for (let m = 0; m <= hours * 60; m++) out.push({ t: T0 + m * 60, air: { pm1: 5, pm25: 8, pm10: 12, co2: co2(m), tvoc: 120, temp: 21.5, rh: 45, o3: 25, no2: 15, co: 0.6 } });
  return out;
}

// Response bodies are whatever JSON the API returns; the tests assert on their shape.
type Json = any;

const open: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

async function start(clock: SimClock, extra: Partial<ServerOptions> = {}) {
  const devices = [
    createReplayDevice({ deviceId: ROOM1, name: "Room 1", seed: "room1" }, air(6)),
    createReplayDevice({ deviceId: LOUNGE, name: "Lounge", seed: "lounge", variant: "well" }, air(6, () => 900)),
  ];
  const opts: ServerOptions = { devices, clock, apiKeys: ["test-key"], ...extra };
  const server = createKaiterraServer(opts);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  open.push({ close: () => new Promise((resolve) => server.close(() => resolve())) });
  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, headers: res.headers, body: (await res.json()) as Json };
  };
  const post = async (path: string, body: string) => {
    const res = await fetch(`${base}${path}`, { method: "POST", body, headers: { "Content-Type": "application/json" } });
    return { status: res.status, body: (await res.json()) as Json };
  };
  return { base, get, post, opts, devices };
}

describe("the server speaks the Kaiterra API", () => {
  it("serves exactly what the pure router returns", async () => {
    const asOf = T0 + 6 * 3600;
    const s = await start(fixedClock(asOf));
    for (const path of [`/devices/${ROOM1}`, `/devices/${ROOM1}/top`, `/devices/${ROOM1}/history?group_by=1h`, `/devices/${LOUNGE}/history?limit=5`]) {
      const res = await s.get(`/v1${path}${path.includes("?") ? "&" : "?"}key=test-key`);
      expect(res.status, path).toBe(200);
      const direct = kaiterraApi(apiContext(s.opts, asOf, `${s.base}/v1`), { method: "GET", path: `${path}${path.includes("?") ? "&" : "?"}key=test-key` });
      expect(res.body).toEqual(direct.body);
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("x-vks-as-of")).toBe(formatIso(asOf));
    }
  });

  it("checks the key like the real API", async () => {
    const s = await start(fixedClock(T0 + 3600));
    expect((await s.get(`/v1/devices/${ROOM1}/top`)).status).toBe(401);
    expect((await s.get(`/v1/devices/${ROOM1}/top?key=nope`)).status).toBe(401);
    expect((await s.get(`/v1/devices/${ROOM1}/top?key=test-key`)).status).toBe(200);
  });

  it("returns the API's errors", async () => {
    const s = await start(fixedClock(T0 + 3600));
    expect((await s.get("/v1/devices/00000000-0000-0000-0000-000000000000/top?key=test-key")).status).toBe(404);
    expect((await s.get(`/v1/devices/${ROOM1}/history?group_by=7m&key=test-key`)).status).toBe(400);
    expect((await s.get("/nope")).status).toBe(404);
    expect((await s.post("/v1/batch?key=test-key", "{not json")).status).toBe(400);
    const tooBig = await fetch(`${s.base}/v1/batch?key=test-key`, { method: "POST", body: "x".repeat(2 * 1024 * 1024) });
    expect(tooBig.status).toBe(413);
  });

  it("answers batches, with sub-requests inheriting the key", async () => {
    const s = await start(fixedClock(T0 + 3600));
    const res = await s.post("/v1/batch?key=test-key", JSON.stringify([
      { method: "GET", relative_url: `/devices/${ROOM1}/top?format=series_major` },
      { method: "GET", relative_url: `/devices/${LOUNGE}/top` },
    ]));
    expect(res.status).toBe(200);
    expect(res.body.map((x: { code: number }) => x.code)).toEqual([200, 200]);
    expect(JSON.parse(res.body[1].body).data.map((x: { param: string }) => x.param)).toContain("ro3");
  });

  it("paginates with absolute links back to itself", async () => {
    const s = await start(fixedClock(T0 + 6 * 3600));
    const res = await s.get(`/v1/devices/${ROOM1}/history?key=test-key&limit=2000`);
    expect(res.body.data[0].points).toHaveLength(360);
    expect(res.body._links).toBeUndefined();
  });

  it("lists its devices at / (not part of the Kaiterra API)", async () => {
    const s = await start(fixedClock(T0 + 3600));
    const res = await s.get("/");
    expect(res.body.devices.map((d: { id: string }) => d.id)).toEqual([ROOM1, LOUNGE]);
    expect(res.body.as_of).toBe(formatIso(T0 + 3600));
  });

  it("adds CORS headers only when asked", async () => {
    const plain = await start(fixedClock(T0 + 3600));
    expect((await plain.get(`/v1/devices/${ROOM1}/top?key=test-key`)).headers.get("access-control-allow-origin")).toBeNull();
    const cors = await start(fixedClock(T0 + 3600), { cors: true });
    expect((await cors.get(`/v1/devices/${ROOM1}/top?key=test-key`)).headers.get("access-control-allow-origin")).toBe("*");
    expect((await fetch(`${cors.base}/v1/batch`, { method: "OPTIONS" })).status).toBe(204);
  });

  it("refuses two devices with the same id", () => {
    const a = createReplayDevice({ deviceId: ROOM1, seed: "a" }, air(1));
    const b = createReplayDevice({ deviceId: ROOM1.toUpperCase(), seed: "b" }, air(1));
    expect(() => createKaiterraServer({ devices: [a, b], clock: fixedClock(T0) })).toThrow(/share the id/);
  });
});

describe("the replay clock", () => {
  it("reveals readings as simulated time passes, at the chosen speed", async () => {
    let wall = 1_000_000;
    const s = await start(replayClock({ start: T0 + 3600, end: T0 + 6 * 3600, speed: 60, wallNow: () => wall }));
    const top = async () => (await s.get(`/v1/devices/${ROOM1}/top?key=test-key`)).body.data[0].points[0].ts;
    expect(await top()).toBe(formatIso(T0 + 3600));
    wall += 30_000; // 30 s of wall time = 30 simulated minutes
    expect(await top()).toBe(formatIso(T0 + 3600 + 30 * 60));
    wall += 10 * 3_600_000; // far past the end: holds at the end of the data
    expect(await top()).toBe(formatIso(T0 + 6 * 3600));
  });

  it("ages the modules with simulated time", async () => {
    let wall = 0;
    const s = await start(replayClock({ start: T0 + 60, end: T0 + 6 * 3600, speed: 3600, wallNow: () => wall }));
    const pct = async () => (await s.get(`/v1/devices/${ROOM1}?key=test-key`)).body.handshake.modules[0].lifetime_pct;
    const early = await pct();
    wall += 5_000;
    expect(await pct()).toBeLessThan(early);
  });
});

describe("a client written for api.kaiterra.com", () => {
  // The request and parsing steps of kaiterra-async-client's get_latest_sensor_readings,
  // pointed at this server by changing only the base URL.
  it("reads the latest readings unchanged", async () => {
    const s = await start(fixedClock(T0 + 2 * 3600));
    const ids = [`/devices/${ROOM1}/top`, `/devices/${LOUNGE}/top`];
    const res = await fetch(`${s.base}/v1/batch?key=test-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids.map((id) => ({ method: "GET", relative_url: `${id}?format=series_major&aqi=us&units=x` }))),
    });
    expect(res.ok).toBe(true);
    const parsed = ((await res.json()) as { body: string; code: number }[]).map((r) => {
      expect(r.code).toBeGreaterThanOrEqual(200);
      const params = JSON.parse(r.body).data as { param: string; units: string; source?: string; points: { ts: string; value: number }[] }[];
      return Object.fromEntries(params.filter((p) => p.points.length > 0).map((p) => [p.param, { units: p.units, source: p.source, ts: parseIso(p.points[0]!.ts), value: p.points[0]!.value }]));
    });
    for (const device of parsed) {
      // Home Assistant's integration reads these four (homeassistant/components/kaiterra/api_data.py).
      for (const name of ["rpm25c", "rpm10c", "rtvoc", "rco2"]) expect(typeof device[name]!.value).toBe("number");
      expect(["?", "x", "%", "C", "F", "mg/m³", "µg/m³", "ppm", "ppb"]).toEqual(expect.arrayContaining(Object.values(device).map((d) => d.units)));
    }
    expect(parsed[0]!.rpm25c!.source).toBe("km200");
  });
});
