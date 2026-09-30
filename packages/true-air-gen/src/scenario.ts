// Scenario files (docs/04, ADR-0009): a room, outdoor air, a timeline of what happens, and
// optionally the device settings that make the scenario's point (e.g. PM humidity growth on
// for the shower). `validateScenario` turns untrusted JSON into a checked Scenario.

import { PARAMS, SIM_DEFAULT_START_T, formatIso, parseIso, simToUnix, type DeviceConfigInput, type DeviceEvent, type TrueAir } from "@vks/core";
import { MET, BMR_MJ_PER_DAY, type Activity, type Who } from "./physics.js";

export interface RoomSpec {
  /** Care home room id, e.g. "Room1", "Ensuite1", "Lounge". */
  id: string;
  floorAreaM2: number;
  ceilingHeightM: number;
  /** Air changes per hour with door and window shut and no fan. */
  baseAch: number;
  /** Extra air changes per hour while the door, window or extract fan is open/on. */
  doorOpenAch: number;
  windowOpenAch: number;
  fanAch: number;
  tempSetpointC: number;
}

/** Outdoor air; indoor air exchanges with it. */
export type Outdoor = Required<Pick<TrueAir, "co2" | "pm1" | "pm25" | "pm10" | "tvoc" | "temp" | "rh" | "o3" | "no2" | "co">>;

export type EventSpec =
  | { type: "occupants"; group: string; who: Who; activity: Activity; count: number }
  | { type: "door" | "window" | "fan"; open: boolean }
  | { type: "cooking"; minutes: number; pm25MgPerMin: number }
  | { type: "cleaning"; minutes: number; tvocMgPerMin: number }
  | { type: "shower"; minutes: number; waterGPerMin: number }
  | { type: "hand-gel"; ethanolMg: number }
  | { type: "set"; values: TrueAir; hold?: boolean }
  | { type: "release" }
  | { type: "outdoor"; values: Partial<Outdoor> };

export type TimelineEvent = EventSpec & { atMinutes: number; repeat?: { everyMinutes: number; times: number } };
export type DailyEvent = EventSpec & { at: string };

/** Device settings a scenario asks for; event times are minutes from the scenario start. */
export type ScenarioDevice = Omit<DeviceConfigInput, "deviceId" | "seed" | "events"> & {
  events?: (Omit<DeviceEvent, "t"> & { atMinutes: number })[];
};

export interface Scenario {
  id: string;
  description: string;
  /** RFC 3339 start; defaults to the care home's default start, Tue 2026-11-03 06:00 UTC. */
  start: string;
  durationMinutes: number;
  /** Output spacing, seconds (a multiple of 5). */
  sampleIntervalS: number;
  room: RoomSpec;
  outdoor: Outdoor;
  initial: { doorOpen: boolean; windowOpen: boolean; fanOn: boolean; air: TrueAir };
  timeline: TimelineEvent[];
  daily: DailyEvent[];
  /** Seeded variation of source strengths and outdoor air; off gives exact textbook curves. */
  jitter: boolean;
  device: ScenarioDevice;
}

export const DEFAULT_OUTDOOR: Outdoor = { co2: 420, pm1: 5, pm25: 8, pm10: 14, tvoc: 20, temp: 8, rh: 80, o3: 30, no2: 20, co: 0.3 };

export const DEFAULT_ROOM: Omit<RoomSpec, "id" | "floorAreaM2"> = {
  ceilingHeightM: 2.4,
  baseAch: 0.5,
  doorOpenAch: 1.5,
  windowOpenAch: 4,
  fanAch: 8,
  tempSetpointC: 21,
};

class ScenarioError extends Error {}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function num(obj: Json, key: string, where: string, opts: { min?: number; def?: number } = {}): number {
  const v = obj[key] ?? opts.def;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ScenarioError(`${where}.${key} must be a number`);
  if (opts.min !== undefined && v < opts.min) throw new ScenarioError(`${where}.${key} must be ≥ ${opts.min}`);
  return v;
}

function bool(obj: Json, key: string, where: string, def?: boolean): boolean {
  const v = obj[key] ?? def;
  if (typeof v !== "boolean") throw new ScenarioError(`${where}.${key} must be true or false`);
  return v;
}

function air(v: unknown, where: string, allowed: readonly string[] = [...PARAMS, "ethanol"]): TrueAir {
  if (v === undefined) return {};
  if (!isObj(v)) throw new ScenarioError(`${where} must be an object`);
  for (const [k, x] of Object.entries(v)) {
    if (!allowed.includes(k)) throw new ScenarioError(`${where}.${k} is not a known quantity (${allowed.join(", ")})`);
    if (typeof x !== "number" || !Number.isFinite(x) || x < -50) throw new ScenarioError(`${where}.${k} must be a number`);
  }
  return v as TrueAir;
}

function eventSpec(e: Json, where: string): EventSpec {
  switch (e.type) {
    case "occupants": {
      if (typeof e.who !== "string" || !(e.who in BMR_MJ_PER_DAY)) throw new ScenarioError(`${where}.who must be one of ${Object.keys(BMR_MJ_PER_DAY).join(", ")}`);
      if (typeof e.activity !== "string" || !(e.activity in MET)) throw new ScenarioError(`${where}.activity must be one of ${Object.keys(MET).join(", ")}`);
      const count = num(e, "count", where, { min: 0 });
      if (!Number.isInteger(count)) throw new ScenarioError(`${where}.count must be a whole number`);
      return { type: "occupants", group: typeof e.group === "string" ? e.group : e.who, who: e.who as Who, activity: e.activity as Activity, count };
    }
    case "door":
    case "window":
    case "fan":
      return { type: e.type, open: bool(e, "open", where) };
    case "cooking":
      return { type: "cooking", minutes: num(e, "minutes", where, { min: 0 }), pm25MgPerMin: num(e, "pm25MgPerMin", where, { min: 0 }) };
    case "cleaning":
      return { type: "cleaning", minutes: num(e, "minutes", where, { min: 0 }), tvocMgPerMin: num(e, "tvocMgPerMin", where, { min: 0 }) };
    case "shower":
      return { type: "shower", minutes: num(e, "minutes", where, { min: 0 }), waterGPerMin: num(e, "waterGPerMin", where, { min: 0 }) };
    case "hand-gel":
      return { type: "hand-gel", ethanolMg: num(e, "ethanolMg", where, { min: 0 }) };
    case "set":
      return { type: "set", values: air(e.values, `${where}.values`), hold: e.hold === true };
    case "release":
      return { type: "release" };
    case "outdoor":
      return { type: "outdoor", values: air(e.values, `${where}.values`, Object.keys(DEFAULT_OUTDOOR)) as Partial<Outdoor> };
    default:
      throw new ScenarioError(`${where}.type "${String(e.type)}" is not a known event`);
  }
}

/** Checks untrusted JSON and fills defaults. Throws with the path of the first problem. */
export function validateScenario(input: unknown): Scenario {
  if (!isObj(input)) throw new ScenarioError("scenario must be an object");
  if (typeof input.id !== "string" || !/^[a-z0-9-]+$/.test(input.id)) throw new ScenarioError("scenario.id must be kebab-case");
  const start = input.start ?? formatIso(simToUnix(SIM_DEFAULT_START_T));
  if (typeof start !== "string") throw new ScenarioError("scenario.start must be an RFC 3339 string");
  try {
    parseIso(start);
  } catch {
    throw new ScenarioError("scenario.start must be an RFC 3339 string");
  }
  const durationMinutes = num(input, "durationMinutes", "scenario", { min: 1 });
  const sampleIntervalS = num(input, "sampleIntervalS", "scenario", { min: 5, def: 60 });
  if (sampleIntervalS % 5 !== 0) throw new ScenarioError("scenario.sampleIntervalS must be a multiple of 5");

  if (!isObj(input.room)) throw new ScenarioError("scenario.room must be an object");
  const r = input.room;
  if (typeof r.id !== "string") throw new ScenarioError("scenario.room.id must be a string");
  const room: RoomSpec = {
    id: r.id,
    floorAreaM2: num(r, "floorAreaM2", "scenario.room", { min: 0.5 }),
    ceilingHeightM: num(r, "ceilingHeightM", "scenario.room", { min: 1, def: DEFAULT_ROOM.ceilingHeightM }),
    baseAch: num(r, "baseAch", "scenario.room", { min: 0, def: DEFAULT_ROOM.baseAch }),
    doorOpenAch: num(r, "doorOpenAch", "scenario.room", { min: 0, def: DEFAULT_ROOM.doorOpenAch }),
    windowOpenAch: num(r, "windowOpenAch", "scenario.room", { min: 0, def: DEFAULT_ROOM.windowOpenAch }),
    fanAch: num(r, "fanAch", "scenario.room", { min: 0, def: DEFAULT_ROOM.fanAch }),
    tempSetpointC: num(r, "tempSetpointC", "scenario.room", { def: DEFAULT_ROOM.tempSetpointC }),
  };
  const outdoor = { ...DEFAULT_OUTDOOR, ...(air(input.outdoor, "scenario.outdoor", Object.keys(DEFAULT_OUTDOOR)) as Partial<Outdoor>) };
  const ini = isObj(input.initial) ? input.initial : {};
  const initial = {
    doorOpen: bool(ini, "doorOpen", "scenario.initial", true),
    windowOpen: bool(ini, "windowOpen", "scenario.initial", false),
    fanOn: bool(ini, "fanOn", "scenario.initial", false),
    air: air(ini.air, "scenario.initial.air"),
  };

  const timeline = (Array.isArray(input.timeline) ? input.timeline : []).map((e: unknown, i: number): TimelineEvent => {
    const where = `scenario.timeline[${i}]`;
    if (!isObj(e)) throw new ScenarioError(`${where} must be an object`);
    const atMinutes = num(e, "atMinutes", where, { min: 0 });
    let repeat: TimelineEvent["repeat"];
    if (e.repeat !== undefined) {
      if (!isObj(e.repeat)) throw new ScenarioError(`${where}.repeat must be an object`);
      repeat = { everyMinutes: num(e.repeat, "everyMinutes", `${where}.repeat`, { min: 1 }), times: num(e.repeat, "times", `${where}.repeat`, { min: 1 }) };
    }
    return { ...eventSpec(e, where), atMinutes, ...(repeat ? { repeat } : {}) };
  });
  const daily = (Array.isArray(input.daily) ? input.daily : []).map((e: unknown, i: number): DailyEvent => {
    const where = `scenario.daily[${i}]`;
    if (!isObj(e)) throw new ScenarioError(`${where} must be an object`);
    if (typeof e.at !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.at)) throw new ScenarioError(`${where}.at must be "HH:MM"`);
    return { ...eventSpec(e, where), at: e.at };
  });
  if (input.device !== undefined && !isObj(input.device)) throw new ScenarioError("scenario.device must be an object");

  return {
    id: input.id,
    description: typeof input.description === "string" ? input.description : "",
    start,
    durationMinutes,
    sampleIntervalS,
    room,
    outdoor,
    initial,
    timeline,
    daily,
    jitter: input.jitter === undefined ? true : bool(input, "jitter", "scenario"),
    device: (input.device as ScenarioDevice | undefined) ?? {},
  };
}

export interface ScheduledEvent {
  /** Unix seconds. */
  t: number;
  spec: EventSpec;
}

/** Every event with its absolute time, in time order (stable for equal times). */
export function expandTimeline(s: Scenario): ScheduledEvent[] {
  const t0 = parseIso(s.start);
  const end = t0 + s.durationMinutes * 60;
  const out: ScheduledEvent[] = [];
  for (const e of s.timeline) {
    const { atMinutes, repeat, ...spec } = e;
    const times = repeat?.times ?? 1;
    for (let k = 0; k < times; k++) out.push({ t: t0 + Math.round((atMinutes + k * (repeat?.everyMinutes ?? 0)) * 60), spec: spec as EventSpec });
  }
  const firstDay = Math.floor(t0 / 86_400);
  for (let day = firstDay; day * 86_400 < end; day++) {
    for (const e of s.daily) {
      const { at, ...spec } = e;
      const t = day * 86_400 + Number(at.slice(0, 2)) * 3600 + Number(at.slice(3, 5)) * 60;
      if (t >= t0 && t < end) out.push({ t, spec: spec as EventSpec });
    }
  }
  return out.filter((e) => e.t <= end).map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map(({ e }) => e);
}

/** The scenario's device settings with event times converted to Unix seconds. */
export function scenarioDeviceConfig(s: Scenario, deviceId: string, seed: string): DeviceConfigInput {
  const t0 = parseIso(s.start);
  const { events, ...rest } = s.device;
  return {
    ...rest,
    deviceId,
    seed,
    events: (events ?? []).map(({ atMinutes, ...e }) => ({ ...e, t: t0 + Math.round(atMinutes * 60) }) as DeviceEvent),
  };
}

export { ScenarioError };
