// M4: output formats, checked against the provisional fixtures (test/fixtures/kaiterra-api).
// Shapes (keys, key order, types, unit strings, timestamp format, ordering) must match the
// fixtures; values must match the device's delivered readings.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bacnetView } from "../src/formats/bacnet.js";
import { csvColumns, csvExport } from "../src/formats/csv.js";
import { timeZoneOffset, windowEnd } from "../src/formats/grouping.js";
import { kaiterraApi, type ApiContext, type ApiDevice, type ApiSeries } from "../src/formats/kaiterra-api.js";
import { mqttMessages } from "../src/formats/mqtt.js";
import { simulate } from "../src/model/simulate.js";
import type { Reading } from "../src/model/types.js";
import { formatIso, parseIso } from "../src/time.js";
import { T0, TYPICAL, randomWalk, steady } from "./helpers.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "test", "fixtures", "kaiterra-api");
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
const MIN = 60;
const HOUR = 3600;
const UDID = "5e200000-0000-4000-8000-00000000c0de";
const SIDE_CHANNEL = ["reference", "truth", "envelope", "flags", "deliveredAt"];

/** Structural signature: object key order and value types, recursively; arrays by their first element. */
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length === 0 ? [] : [shape(v[0])];
  if (v !== null && typeof v === "object") return Object.entries(v).map(([k, x]) => [k, shape(x)]);
  return typeof v;
}
const withoutSource = (s: ApiSeries | Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "source"));

function run(opts: Parameters<typeof simulate>[0] = { deviceId: UDID, seed: "fmt" }, minutes = 6 * 60) {
  const result = simulate(opts, randomWalk("fmt", minutes).map((s) => ({ ...s, air: { ...s.air, co2: Math.max(450, s.air.co2!) } })));
  const device: ApiDevice = { config: result.config, readings: result.readings, status: result.status };
  const asOf = T0 + minutes * MIN;
  const ctx: ApiContext = { devices: [device], asOf, apiKeys: ["test-key"] };
  const get = (path: string, c: ApiContext = ctx) => kaiterraApi(c, { method: "GET", path: `${path}${path.includes("?") ? "&" : "?"}key=test-key` });
  return { result, device, asOf, ctx, get };
}

describe("GET /devices/{id}/top", () => {
  const { result, asOf, get } = run();
  const res = get(`/devices/${UDID}/top`);
  const data = (res.body as { data: ApiSeries[] }).data;

  it("has the fixture's series shape, sorted by parameter name", () => {
    expect(res.code).toBe(200);
    const fix = fixture("devices-top").data as ApiSeries[];
    const withSrc = fix.find((s) => "source" in s)!;
    for (const s of data) {
      expect(shape(s)).toEqual(shape(s.source === undefined ? withoutSource(withSrc) : withSrc));
      expect(s.points).toHaveLength(1);
      expect(s.points[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
    }
    const names = data.map((s) => s.param);
    expect(names).toEqual([...names].sort());
  });

  it("uses the API's names, units and sources, with TVOC under both names (ADR-0004)", () => {
    const byName = Object.fromEntries(data.map((s) => [s.param, s]));
    expect(Object.keys(byName)).toEqual(["rco2", "rhumid", "rpm10c", "rpm1c", "rpm25c", "rtemp", "rtvoc", "tvoc"]);
    expect(byName.rpm25c).toMatchObject({ source: "km200", units: "µg/m³", span: 60 });
    expect(byName.tvoc).toMatchObject({ source: "km203", units: "ppb" });
    expect(byName.rtvoc!.points).toEqual(byName.tvoc!.points);
    expect(byName.rco2!.source).toBeUndefined();
    expect(byName.rtemp).toMatchObject({ units: "C" });
    expect(byName.rhumid).toMatchObject({ units: "%" });
    const fixtureUnits = new Set((fixture("devices-top").data as ApiSeries[]).map((s) => s.units));
    for (const s of data) expect(fixtureUnits).toContain(s.units);
  });

  it("returns the latest delivered reading, and never the side channel", () => {
    const co2 = result.readings.filter((r) => r.param === "co2" && r.deliveredAt <= asOf).at(-1)!;
    const s = data.find((x) => x.param === "rco2")!;
    expect(s.points[0]).toEqual({ ts: formatIso(co2.ts), value: co2.value });
    const text = JSON.stringify(res.body);
    for (const k of SIDE_CHANNEL) expect(text).not.toContain(k);
  });

  it("can report TVOC under one name only", () => {
    const one = run({ deviceId: UDID, seed: "fmt", identity: { tvocNames: ["tvoc"] } }, 30);
    const names = (one.get(`/devices/${UDID}/top`).body as { data: ApiSeries[] }).data.map((s) => s.param);
    expect(names).toContain("tvoc");
    expect(names).not.toContain("rtvoc");
  });

  it("hides readings buffered offline until they are delivered", () => {
    const events = [
      { t: T0 + 60 * MIN, kind: "network" as const, online: false },
      { t: T0 + 90 * MIN, kind: "network" as const, online: true },
    ];
    const { ctx } = run({ deviceId: UDID, seed: "fmt", events }, 120);
    const topAt = (asOf: number) => (kaiterraApi({ ...ctx, asOf }, { method: "GET", path: `/devices/${UDID}/top?key=test-key` }).body as { data: ApiSeries[] }).data[0]!.points[0]!.ts;
    expect(topAt(T0 + 80 * MIN)).toBe(formatIso(T0 + 59 * MIN));
    expect(topAt(T0 + 90 * MIN)).toBe(formatIso(T0 + 90 * MIN));
  });

  it("serves what Home Assistant's integration and kaiterra-async-client read", () => {
    const byName = Object.fromEntries(data.map((s) => [s.param, s]));
    for (const name of ["rpm25c", "rpm10c", "rtvoc", "rco2"]) expect(typeof byName[name]!.points[0]!.value).toBe("number");
    const clientUnits = ["?", "x", "%", "C", "F", "mg/m³", "µg/m³", "ppm", "ppb"];
    for (const s of data) expect(clientUnits).toContain(s.units);
  });
});

describe("GET /devices/{id}/history", () => {
  const { result, asOf, ctx, get } = run();
  const minutes = (param: string) => result.readings.filter((r) => r.param === param && r.deliveredAt <= asOf);

  it("returns 1-minute points in time order, shaped like the fixture", () => {
    const res = get(`/devices/${UDID}/history?begin=${formatIso(T0 + HOUR)}&end=${formatIso(T0 + 2 * HOUR)}`);
    const data = (res.body as { data: ApiSeries[] }).data;
    const fix = fixture("devices-history").data[0];
    const co2 = data.find((s) => s.param === "rco2")!;
    expect(shape(co2)).toEqual(shape(fix));
    expect(co2.span).toBe(60);
    expect(co2.points.map((p) => p.ts)).toEqual(minutes("co2").filter((r) => r.ts >= T0 + HOUR && r.ts <= T0 + 2 * HOUR).map((r) => formatIso(r.ts)));
    expect(co2.points.map((p) => p.value)).toEqual(minutes("co2").filter((r) => r.ts >= T0 + HOUR && r.ts <= T0 + 2 * HOUR).map((r) => r.value));
  });

  it("averages closed hourly windows, labelled by their end, like the fixture", () => {
    const res = get(`/devices/${UDID}/history?group_by=1h`);
    const data = (res.body as { data: ApiSeries[] }).data;
    const pm = data.find((s) => s.param === "rpm25c")!;
    expect(shape(withoutSource(pm))).toEqual(shape(fixture("devices-history-1h").data[0]));
    expect(pm.span).toBe(3600);
    for (const p of pm.points) expect(parseIso(p.ts) % HOUR).toBe(0);
    expect(parseIso(pm.points.at(-1)!.ts)).toBeLessThanOrEqual(asOf);
    const first = pm.points[0]!;
    const window = minutes("pm25").filter((r) => r.ts > parseIso(first.ts) - HOUR && r.ts <= parseIso(first.ts));
    expect(first.value).toBeCloseTo(window.reduce((s, r) => s + r.value, 0) / window.length, 1);
    const temp = data.find((s) => s.param === "rtemp")!;
    expect(temp.points.every((p) => Math.abs(p.value * 100 - Math.round(p.value * 100)) < 1e-6)).toBe(true);
  });

  it("leaves out the hour that has not closed yet", () => {
    const mid = { ...ctx, asOf: T0 + 5 * HOUR + 30 * MIN };
    const data = (kaiterraApi(mid, { method: "GET", path: `/devices/${UDID}/history?group_by=1h&key=test-key` }).body as { data: ApiSeries[] }).data;
    expect(data[0]!.points.at(-1)!.ts).toBe(formatIso(T0 + 5 * HOUR));
  });

  it("pages backwards with _links.next and loses no points", () => {
    const first = get(`/devices/${UDID}/history?begin=${formatIso(T0)}&end=${formatIso(T0 + HOUR)}&limit=25`);
    const body = first.body as { _links?: { next: string }; data: ApiSeries[] };
    expect(Object.keys(body)).toEqual(Object.keys(fixture("devices-history-paginated")));
    expect(body._links!.next).toMatch(new RegExp(`^https://api\\.kaiterra\\.com/v1/devices/${UDID}/history\\?begin=.+%3A.+&end=`));
    const collected: string[] = [];
    let page: { _links?: { next: string }; data: ApiSeries[] } = body;
    for (let i = 0; i < 10; i++) {
      collected.unshift(...page.data.find((s) => s.param === "rco2")!.points.map((p) => p.ts));
      if (!page._links) break;
      const next = page._links.next.replace("https://api.kaiterra.com/v1", "");
      page = get(next).body as typeof page;
    }
    expect(collected).toEqual(minutes("co2").filter((r) => r.ts >= T0 && r.ts <= T0 + HOUR).map((r) => formatIso(r.ts)));
  });

  it("aligns days to the time zone, including British Summer Time", () => {
    expect(timeZoneOffset("Europe/London", parseIso("2027-07-01T12:00:00Z"))).toBe(3600);
    expect(timeZoneOffset("Europe/London", parseIso("2026-11-03T12:00:00Z"))).toBe(0);
    expect(formatIso(windowEnd(parseIso("2027-07-01T12:00:00Z"), 86_400, "Europe/London"))).toBe("2027-07-01T23:00:00Z");
    expect(formatIso(windowEnd(parseIso("2026-11-03T12:00:00Z"), 86_400, "Europe/London"))).toBe("2026-11-04T00:00:00Z");
    const t0 = parseIso("2027-07-01T00:00:00Z");
    const summer = simulate({ deviceId: UDID, seed: "tz", params: ["co2"] }, steady(TYPICAL, 3 * 24 * 60, 60, t0));
    const c: ApiContext = { devices: [{ config: summer.config, readings: summer.readings, status: summer.status }], asOf: t0 + 3 * 86_400 };
    const data = (kaiterraApi(c, { method: "GET", path: `/devices/${UDID}/history?group_by=1d&time_zone=Europe/London&key=k` }).body as { data: ApiSeries[] }).data;
    expect(data[0]!.points.map((p) => p.ts)).toEqual(["2027-07-01T23:00:00Z", "2027-07-02T23:00:00Z", "2027-07-03T23:00:00Z"]);
  });
});

describe("GET /devices/{id}", () => {
  const { device, get } = run();

  it("has exactly the fixture's structure", () => {
    const res = get(`/devices/${UDID}`);
    expect(res.code).toBe(200);
    expect(shape(res.body)).toEqual(shape(fixture("devices-get")));
  });

  it("reports the Mini's model, firmware and module health", () => {
    const body = get(`/devices/${UDID}`).body as { model: string; firmware_version: string; handshake: { dsn: string; modules: { type: string; lifetime_pct: number; bay: number }[]; ts: string } };
    expect(body.model).toBe("SE-200");
    expect(body.firmware_version).toBe("2.4.5");
    expect(body.handshake.dsn).toMatch(/^KG2\d{8}$/);
    expect(body.handshake.modules.map((m) => m.type)).toEqual(["KM-200", "KM-203"]);
    expect(body.handshake.modules[0]!.lifetime_pct).toBe(device.status.modules[0]!.lifetimePct);
    expect(body.handshake.ts).toBe(formatIso(T0));
  });

  it("matches UDIDs case-insensitively, with or without dashes", () => {
    expect(get(`/devices/${UDID.toUpperCase().replace(/-/g, "")}`).code).toBe(200);
  });
});

describe("errors", () => {
  const { ctx, get } = run(undefined, 30);
  it.each([
    ["no key", () => kaiterraApi(ctx, { method: "GET", path: `/devices/${UDID}/top` }), 401],
    ["wrong key", () => kaiterraApi(ctx, { method: "GET", path: `/devices/${UDID}/top?key=nope` }), 401],
    ["unknown device", () => get("/devices/00000000-0000-0000-0000-000000000000/top"), 404],
    ["unknown path", () => get("/sensors"), 404],
    ["bad group_by", () => get(`/devices/${UDID}/history?group_by=7m`), 400],
    ["bad time zone", () => get(`/devices/${UDID}/history?time_zone=Mars/Olympus`), 400],
    ["bad timestamp", () => get(`/devices/${UDID}/history?begin=yesterday`), 400],
    ["end over an hour ahead", () => get(`/devices/${UDID}/history?end=${formatIso(ctx.asOf + 2 * HOUR)}`), 400],
    ["wrong method", () => kaiterraApi(ctx, { method: "POST", path: `/devices/${UDID}/top?key=test-key` }), 405],
  ])("%s → %i", (_, call, code) => {
    expect(call().code).toBe(code);
  });
});

describe("POST /batch", () => {
  const { ctx } = run(undefined, 60);
  const post = (body: unknown, key = "test-key") => kaiterraApi(ctx, { method: "POST", path: `/batch?key=${key}`, body });

  it("answers each sub-request like the fixture: a JSON string body and a code", () => {
    const req = (fixture("batch-request") as { method: string; relative_url: string }[]).map((r) => ({ ...r, relative_url: r.relative_url.replace(/\/devices\/[^/]+/, `/devices/${UDID}`) }));
    const res = post([...req, { method: "GET", relative_url: `/devices/${UDID}?format=series_major` }]);
    expect(res.code).toBe(200);
    const subs = res.body as { body: string; code: number }[];
    expect(shape(subs)).toEqual(shape(fixture("batch-response")));
    expect(JSON.parse(subs[0]!.body)).toEqual(kaiterraApi(ctx, { method: "GET", path: `/devices/${UDID}/top?key=test-key` }).body);
    expect(subs[2]!.code).toBe(200);
  });

  it("inherits the parent's key, rejects other endpoints and caps at 100", () => {
    expect(post([], "").code).toBe(401);
    const bad = post([{ method: "GET", relative_url: "/batch" }]).body as { code: number }[];
    expect(bad[0]!.code).toBe(400);
    expect(post(Array.from({ length: 101 }, () => ({ method: "GET", relative_url: `/devices/${UDID}/top` }))).code).toBe(400);
  });
});

describe("Secondary MQTT (S5)", () => {
  const events = [
    { t: T0 + 30 * MIN, kind: "network" as const, online: false },
    { t: T0 + 40 * MIN, kind: "network" as const, online: true },
  ];
  const { result } = run({ deviceId: UDID, seed: "fmt", events }, 60);

  it("Format 1 uses the guide's top-level shape and module-prefixed keys", () => {
    const msgs = mqttMessages(result.config, result.readings, 1);
    const fix = fixture("mqtt-secondary-format1");
    const p = msgs[0]!.payload as { ts: number; dsn: string; dudid: string; data: Record<string, number> };
    expect(Object.keys(p)).toEqual(Object.keys(fix));
    expect(msgs[0]!.topic).toBe(`kaiterra/device/history/${UDID}`);
    expect(Number.isInteger(p.ts)).toBe(true);
    expect(p.dsn).toHaveLength(fix.dsn.length);
    for (const key of ["km200.rpm25c", "km200.rpm10c", "km203.rtvocb (ppb)", "rco2 (ppm)", "rhumid", "rtemp"]) {
      expect(fix.data).toHaveProperty([key]);
      expect(p.data).toHaveProperty([key]);
    }
    expect(Object.keys(p.data)).toEqual([...Object.keys(p.data)].sort());
  });

  it("Format 2 uses the guide's names, order and units", () => {
    const fix = fixture("mqtt-secondary-format2");
    const p = mqttMessages(result.config, result.readings, 2)[0]!.payload as { data: Record<string, number>; units: Record<string, string> };
    expect(Object.keys(p)).toEqual(Object.keys(fix));
    const shared = Object.keys(fix.data).filter((k) => k in p.data);
    expect(shared).toEqual(["temperature", "humidity", "pm25", "pm10", "co2", "tvoc"]);
    expect(Object.keys(p.data).slice(0, shared.length)).toEqual(shared);
    for (const k of shared) expect(p.units[k]).toBe(fix.units[k]);
  });

  it("publishes backfilled minutes on reconnect with their own timestamps", () => {
    const msgs = mqttMessages(result.config, result.readings, 2);
    const late = msgs.filter((m) => m.publishedAt === T0 + 40 * MIN).map((m) => m.payload.ts as number);
    expect(late).toEqual(Array.from({ length: 11 }, (_, i) => T0 + (30 + i) * MIN));
    expect(msgs.map((m) => m.publishedAt)).toEqual([...msgs.map((m) => m.publishedAt)].sort((a, b) => a - b));
  });
});

describe("BACnet object view (S4)", () => {
  it("lists the PICS analog inputs the variant has", () => {
    const { result, asOf } = run(undefined, 30);
    const view = bacnetView(result.config, result.status, result.readings, asOf);
    expect(view.device).toMatchObject({ objectName: "Kaiterra-SE-200", vendorName: "Kaiterra", protocolRevision: 14, firmwareRevision: "2.4.5" });
    expect(view.objects.map((o) => [o.objectIdentifier[1], o.objectName])).toEqual([
      [1, "PM2.5"],
      [2, "PM10"],
      [3, "TVOC"],
      [4, "Temperature"],
      [5, "Humidity"],
      [6, "CO2"],
      [7, "Unassigned"],
      [8, "KM20X Module Lifespan"],
      [9, "KM20X Module Lifespan"],
    ]);
    const well = run({ deviceId: UDID, seed: "fmt", variant: "well" }, 30);
    expect(bacnetView(well.result.config, well.result.status, well.result.readings, well.asOf).objects.at(-1)!.objectName).toBe("O3");
  });

  it("reads present values, units, lifespans and warm-up reliability", () => {
    const events = [{ t: T0 + 20 * MIN, kind: "replace-module" as const, bay: 1 as const }];
    const { result } = run({ deviceId: UDID, seed: "fmt", events, conditions: { warmUp: { enabled: true } } }, 30);
    const view = bacnetView(result.config, result.status, result.readings, T0 + 30 * MIN);
    const obj = (n: number) => view.objects.find((o) => o.objectIdentifier[1] === n)!;
    const co2 = result.readings.filter((r) => r.param === "co2").at(-1)!;
    expect(obj(6)).toMatchObject({ presentValue: co2.value, units: { name: "parts-per-million", id: 96 }, reliability: "no-fault-detected" });
    expect(obj(1).units).toEqual({ name: "micrograms-per-cubic-meter", id: 219 });
    expect(obj(3)).toMatchObject({ reliability: "unreliable-other", statusFlags: { fault: true } });
    expect(obj(9).presentValue).toBe(result.status.modules[1]!.lifetimePct);
    expect(obj(7).reliability).toBe("no-sensor");
  });
});

describe("CSV export", () => {
  const { result, asOf, get } = run(undefined, 3 * 60);

  it("has one row per minute and one column per parameter", () => {
    const csv = csvExport(result.config, result.readings, { asOf }).trim().split("\n");
    expect(csv[0]).toBe(csvColumns(result.config).join(","));
    expect(csv[0]).toBe("Timestamp (UTC),PM1 (µg/m³),PM2.5 (µg/m³),PM10 (µg/m³),CO2 (ppm),TVOC (ppb),Temperature (C),Relative humidity (%)");
    expect(csv).toHaveLength(1 + new Set(result.readings.map((r) => r.ts)).size);
  });

  it("gives the same hourly averages as the API", () => {
    const csv = csvExport(result.config, result.readings, { asOf, frequency: "hourly" }).trim().split("\n").slice(1);
    const api = (get(`/devices/${UDID}/history?group_by=1h`).body as { data: ApiSeries[] }).data.find((s) => s.param === "rco2")!;
    expect(csv.map((l) => [l.split(",")[0], Number(l.split(",")[4])])).toEqual(api.points.map((p) => [p.ts, p.value]));
  });

  it("leaves out readings not yet delivered", () => {
    const readings: Reading[] = result.readings.map((r, i) => (i === result.readings.length - 1 ? { ...r, deliveredAt: asOf + 60 } : r));
    const lines = csvExport(result.config, readings, { asOf }).trim().split("\n");
    expect(lines.at(-1)!.split(",").filter((c) => c === "").length).toBe(1);
  });
});

describe("side channel", () => {
  it("never appears in any format", () => {
    const { result, asOf, get } = run(undefined, 90);
    const outputs = [
      get(`/devices/${UDID}/top`).body,
      get(`/devices/${UDID}/history?limit=5`).body,
      get(`/devices/${UDID}`).body,
      mqttMessages(result.config, result.readings, 1),
      mqttMessages(result.config, result.readings, 2),
      csvExport(result.config, result.readings, { asOf }),
    ];
    for (const o of outputs) for (const k of SIDE_CHANNEL) expect(JSON.stringify(o)).not.toContain(k);
  });
});

describe("identity config", () => {
  it("rejects TVOC names other than tvoc and rtvoc, and out-of-range BACnet instances", async () => {
    const { resolveConfig } = await import("../src/model/config.js");
    expect(resolveConfig({ deviceId: "d", seed: "s" }).identity.tvocNames).toEqual(["tvoc", "rtvoc"]);
    expect(() => resolveConfig({ deviceId: "d", seed: "s", identity: { tvocNames: [] } })).toThrow(/tvocNames/);
    expect(() => resolveConfig({ deviceId: "d", seed: "s", identity: { tvocNames: ["voc" as "tvoc"] } })).toThrow(/tvocNames/);
    expect(() => resolveConfig({ deviceId: "d", seed: "s", identity: { bacnetInstance: 4_194_303 } })).toThrow(/bacnetInstance/);
  });
});
