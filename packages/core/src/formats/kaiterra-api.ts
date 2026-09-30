// Kaiterra API v1 responses (docs/05; S3). Pure: the caller supplies each device's readings and
// status and the query time `asOf`; a reading exists only once delivered (`deliveredAt <= asOf`).
// `kaiterraApi` routes a request exactly as api.kaiterra.com/v1 would, so the HTTP server (M8)
// only has to wrap it. Where the docs are silent, the choice is listed in docs/09.

import type { DeviceConfig } from "../model/config.js";
import type { DeviceStatus, Reading } from "../model/types.js";
import type { ParamId } from "../params.js";
import { VARIANTS } from "../spec/modules.js";
import { SENSEDGE_MINI } from "../spec/sensedge-mini.js";
import { SECONDS_PER_DAY, formatIso, parseIso } from "../time.js";
import { groupReadings, isTimeZone, parseGroupBy } from "./grouping.js";
import { deviceSerial, macAddress, normaliseUdid } from "./identity.js";

export const KAITERRA_API_BASE = "https://api.kaiterra.com/v1";

export interface ApiPoint {
  ts: string;
  value: number;
}

export interface ApiSeries {
  param: string;
  source?: string;
  units: string;
  span: number;
  points: ApiPoint[];
}

export interface ApiDevice {
  config: DeviceConfig;
  /** Every reading the device has produced; delivery is checked against `asOf`. */
  readings: readonly Reading[];
  status: DeviceStatus;
}

/** API reading names for a parameter; TVOC per ADR-0004. */
export function apiNames(config: DeviceConfig, param: ParamId): string[] {
  return param === "tvoc" ? [...config.identity.tvocNames] : [...SENSEDGE_MINI[param].apiParams];
}

function delivered(readings: readonly Reading[], asOf: number): Reading[] {
  return readings.filter((r) => r.deliveredAt <= asOf);
}

function byParam(readings: readonly Reading[]): Map<ParamId, Reading[]> {
  const out = new Map<ParamId, Reading[]>();
  for (const r of readings) {
    const list = out.get(r.param) ?? [];
    list.push(r);
    out.set(r.param, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.ts - b.ts);
  return out;
}

/** One series per API name, sorted by name as in the docs' examples. */
function seriesFor(config: DeviceConfig, param: ParamId, source: string | undefined, span: number, points: ApiPoint[]): ApiSeries[] {
  return apiNames(config, param).map((name) => ({
    param: name,
    ...(source === undefined ? {} : { source }),
    units: SENSEDGE_MINI[param].units,
    span,
    points: points.map((p) => ({ ...p })),
  }));
}

const sortSeries = (series: ApiSeries[]) => series.sort((a, b) => (a.param < b.param ? -1 : a.param > b.param ? 1 : 0));

/** `GET /devices/{id}/top`: the latest delivered reading of each parameter. */
export function topResponse(device: ApiDevice, asOf: number): { data: ApiSeries[] } {
  const series: ApiSeries[] = [];
  for (const [param, list] of byParam(delivered(device.readings, asOf))) {
    const last = list[list.length - 1]!;
    series.push(...seriesFor(device.config, param, last.source, last.span, [{ ts: formatIso(last.ts), value: last.value }]));
  }
  return { data: sortSeries(series) };
}

export interface HistoryQuery {
  begin?: number;
  end?: number;
  limit?: number;
  /** Window width in seconds (from `parseGroupBy`); undefined for the raw 1-minute series. */
  groupBy?: number;
  groupByText?: string;
  timeZone?: string;
}

/** Default window when neither `begin` nor `end` is given (assumption, docs/09). */
export const DEFAULT_HISTORY_SECONDS = 7 * SECONDS_PER_DAY;
/** Largest page per series before `_links.next` (assumption, docs/09). */
export const MAX_PAGE_POINTS = 1440;

/** `GET /devices/{id}/history`. Pages go back in time: each page holds the latest points, and `next` covers the earlier ones. */
export function historyResponse(device: ApiDevice, asOf: number, q: HistoryQuery, baseUrl = KAITERRA_API_BASE): { _links?: { next: string }; data: ApiSeries[] } {
  const end = q.end ?? asOf;
  const begin = q.begin ?? end - DEFAULT_HISTORY_SECONDS;
  const limit = Math.min(q.limit ?? MAX_PAGE_POINTS, MAX_PAGE_POINTS);
  const timeZone = q.timeZone ?? "UTC";
  const series: ApiSeries[] = [];
  let nextEnd: number | undefined;

  for (const [param, list] of byParam(delivered(device.readings, asOf))) {
    const span = q.groupBy ?? list[0]!.span;
    let points =
      q.groupBy === undefined || q.groupBy === list[0]!.span
        ? list.map((r) => ({ ts: r.ts, value: r.value }))
        : groupReadings(list, q.groupBy, timeZone, asOf);
    points = points.filter((p) => p.ts >= begin && p.ts <= end);
    if (points.length === 0) continue;
    if (points.length > limit) {
      points = points.slice(points.length - limit);
      const candidate = points[0]!.ts - span;
      nextEnd = nextEnd === undefined ? candidate : Math.max(nextEnd, candidate);
    }
    const source = list[list.length - 1]!.source;
    series.push(...seriesFor(device.config, param, source, span, points.map((p) => ({ ts: formatIso(p.ts), value: p.value }))));
  }

  const data = sortSeries(series);
  if (nextEnd === undefined) return { data };
  // The docs' example keeps the window length and moves it back to end just before this page.
  const params = new URLSearchParams();
  params.set("begin", formatIso(q.begin ?? nextEnd - (end - begin)));
  params.set("end", formatIso(nextEnd));
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.groupByText !== undefined) params.set("group_by", q.groupByText);
  if (q.timeZone !== undefined) params.set("time_zone", q.timeZone);
  return { _links: { next: `${baseUrl}/devices/${device.config.deviceId}/history?${params.toString()}` }, data };
}

/** `GET /devices/{id}`: metadata, with module health from the device's status. */
export function deviceResponse(device: ApiDevice): Record<string, unknown> {
  const { config, status } = device;
  const out: Record<string, unknown> = {
    id: config.deviceId,
    name: config.name,
    model: VARIANTS[config.variant].model,
    firmware_version: config.identity.firmwareVersion,
    home_region: config.identity.homeRegion,
  };
  if (status.handshakeT !== undefined) {
    out.handshake = {
      _device_ts: formatIso(status.handshakeT),
      dmac_eth: macAddress(config, "eth"),
      dmac_wifi: macAddress(config, "wifi"),
      dsn: deviceSerial(config),
      modules: status.modules.map((m) => ({ bay: m.bay, serial: m.serial, type: m.type, lifetime_pct: m.lifetimePct })),
      ts: formatIso(status.handshakeT),
    };
  }
  return out;
}

// --- routing -----------------------------------------------------------------------------------

export interface ApiContext {
  devices: readonly ApiDevice[];
  /** The query time: now, in the simulation's clock. */
  asOf: number;
  /** Accepted keys; when absent, any non-empty key is accepted. */
  apiKeys?: readonly string[];
  baseUrl?: string;
}

export interface ApiRequest {
  method: string;
  /** Path after `/v1`, with or without a query string, e.g. `/devices/abc/top?limit=5`. */
  path: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface ApiResponse {
  code: number;
  body: unknown;
}

const MAX_BATCH = 100;
const error = (code: number, message: string): ApiResponse => ({ code, body: { message } });

function splitPath(req: ApiRequest): { path: string; query: Record<string, string> } {
  const [path, qs] = req.path.split("?", 2) as [string, string | undefined];
  const query: Record<string, string> = { ...(req.query ?? {}) };
  if (qs !== undefined) for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  return { path: path.replace(/\/+$/, "") || "/", query };
}

function parseTime(text: string | undefined): number | undefined | "invalid" {
  if (text === undefined) return undefined;
  try {
    return parseIso(text);
  } catch {
    return "invalid";
  }
}

/** Routes one request against the virtual devices, like api.kaiterra.com/v1 (S3). */
export function kaiterraApi(ctx: ApiContext, req: ApiRequest, authorised = false): ApiResponse {
  const { path, query } = splitPath(req);
  if (!authorised) {
    const key = query.key;
    if (key === undefined || key === "" || (ctx.apiKeys !== undefined && !ctx.apiKeys.includes(key))) return error(401, "API key missing or not accepted");
  }

  if (path === "/batch") {
    if (req.method !== "POST") return error(405, "Use POST for /batch");
    if (!Array.isArray(req.body)) return error(400, "Batch body must be an array of requests");
    if (req.body.length > MAX_BATCH) return error(400, `At most ${MAX_BATCH} requests per batch`);
    const results = req.body.map((sub: unknown) => {
      const s = sub as { method?: unknown; relative_url?: unknown };
      if (typeof s.relative_url !== "string" || (s.method ?? "GET") !== "GET" || !/^\/devices\/[^/?]+(\/(top|history))?(\?|$)/.test(s.relative_url)) {
        const r = error(400, "Batch requests may only GET /devices/{id}, /devices/{id}/top or /devices/{id}/history");
        return { body: JSON.stringify(r.body), code: r.code };
      }
      const r = kaiterraApi(ctx, { method: "GET", path: s.relative_url }, true);
      return { body: JSON.stringify(r.body), code: r.code };
    });
    return { code: 200, body: results };
  }

  const m = /^\/devices\/([^/]+)(?:\/(top|history))?$/.exec(path);
  if (!m) return error(404, "Not found");
  if (req.method !== "GET") return error(405, `Use GET for ${path}`);
  const wanted = normaliseUdid(decodeURIComponent(m[1]!));
  const device = ctx.devices.find((d) => normaliseUdid(d.config.deviceId) === wanted);
  if (device === undefined) return error(404, "Device not found");

  if (m[2] === undefined) return { code: 200, body: deviceResponse(device) };
  if (m[2] === "top") return { code: 200, body: topResponse(device, ctx.asOf) };

  const begin = parseTime(query.begin);
  const end = parseTime(query.end);
  if (begin === "invalid" || end === "invalid") return error(400, "begin and end must be RFC 3339 timestamps");
  if (end !== undefined && end > ctx.asOf + 3600) return error(400, "The time range ends more than an hour in the future");
  if (begin !== undefined && end !== undefined && begin > end) return error(400, "begin is after end");
  let limit: number | undefined;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit <= 0) return error(400, "limit must be a positive integer");
  }
  let groupBy: number | undefined;
  if (query.group_by !== undefined) {
    groupBy = parseGroupBy(query.group_by);
    if (groupBy === undefined) return error(400, `Unsupported group_by "${query.group_by}"`);
  }
  if (query.time_zone !== undefined && !isTimeZone(query.time_zone)) return error(400, `Unknown time_zone "${query.time_zone}"`);
  const q: HistoryQuery = {
    ...(begin === undefined ? {} : { begin }),
    ...(end === undefined ? {} : { end }),
    ...(limit === undefined ? {} : { limit }),
    ...(groupBy === undefined ? {} : { groupBy, groupByText: query.group_by! }),
    ...(query.time_zone === undefined ? {} : { timeZone: query.time_zone }),
  };
  return { code: 200, body: historyResponse(device, ctx.asOf, q, ctx.baseUrl ?? KAITERRA_API_BASE) };
}
