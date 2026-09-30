// The synthetic true-air generator (docs/04, ADR-0009): one well-mixed room exchanging air
// with outdoors, driven by a scenario timeline. Every quantity follows dC/dt = S − L·C with
// sources S (people, cooking, cleaning, showers, hand gel, infiltration) and losses L
// (ventilation, deposition, reaction), stepped exactly every 5 s. A test tool only: the care
// home sim owns the real air model (ADR-0006).

import { parseIso, stream, type Rng, type TrueAir, type TrueAirSample } from "@vks/core";
import {
  BIOEFFLUENT_TVOC_MG_PER_H,
  COOKING_PM10_OF_PM25,
  COOKING_PM1_OF_PM25,
  DEPOSITION_PER_H,
  HEATING_TAU_H,
  MOISTURE_G_PER_H,
  PM_PENETRATION,
  RESUSPENSION_MG_PER_H,
  WARMING_PER_PERSON_C,
  co2LitresPerSecond,
  ethanolPpbFromUgM3,
  relativeHumidity,
  relax,
  saturationVapourDensity,
  tvocPpbFromUgM3,
  vapourDensity,
  type Activity,
  type Who,
} from "./physics.js";
import { expandTimeline, type Outdoor, type Scenario } from "./scenario.js";

export const GENERATOR_STEP_S = 5;

export interface Annotation {
  /** Unix seconds; `from === to` for instantaneous events. */
  from: number;
  to: number;
  label: string;
}

export interface GeneratedScenario {
  scenario: Scenario;
  seed: string;
  samples: TrueAirSample[];
  annotations: Annotation[];
}

type Species = "co2" | "pm1" | "pm25" | "pm10" | "tvoc" | "ethanol" | "o3" | "no2" | "co";
const SPECIES: readonly Species[] = ["co2", "pm1", "pm25", "pm10", "tvoc", "ethanol", "o3", "no2", "co"];

interface Emission {
  until: number;
  kind: "cooking" | "cleaning" | "shower" | "hand-gel";
  /** Per minute: mg (cooking PM2.5, cleaning TVOC, hand-gel ethanol) or g (shower water). */
  perMin: number;
}

const DECIMALS: Record<keyof TrueAir, number> = { co2: 2, pm1: 3, pm25: 3, pm10: 3, tvoc: 2, ethanol: 2, temp: 3, rh: 3, o3: 3, no2: 3, co: 4 };
const round = (key: keyof TrueAir, v: number) => {
  const f = 10 ** DECIMALS[key];
  return Math.round(Math.max(0, v) * f) / f;
};

const clamp = (x: number, lim: number) => Math.max(-lim, Math.min(lim, x));

export function generate(scenario: Scenario, seed: string): GeneratedScenario {
  const t0 = parseIso(scenario.start);
  const end = t0 + scenario.durationMinutes * 60;
  const V = scenario.room.floorAreaM2 * scenario.room.ceilingHeightM;
  const dtH = GENERATOR_STEP_S / 3600;
  const events = expandTimeline(scenario);
  const rng = (part: string): Rng => stream(seed, "true-air", scenario.id, part);
  const occupantRng = rng("occupants");
  const emissionRng = rng("emissions");
  const outdoorRng = rng("outdoor");
  const jitter = (r: Rng, sd: number, lim: number) => {
    const z = r.normal();
    return scenario.jitter ? 1 + clamp(sd * z, lim) : 1;
  };

  // --- state ------------------------------------------------------------------------------
  let doorOpen = scenario.initial.doorOpen;
  let windowOpen = scenario.initial.windowOpen;
  let fanOn = scenario.initial.fanOn;
  let outdoor: Outdoor = { ...scenario.outdoor };
  const outdoorOffset = { co2: 0, pm: 0, temp: 0 };
  const occupants = new Map<string, { who: Who; activity: Activity; count: number; factor: number }>();
  const emissions: Emission[] = [];
  const held: TrueAir = {};

  const ach = () => scenario.room.baseAch + (doorOpen ? scenario.room.doorOpenAch : 0) + (windowOpen ? scenario.room.windowOpenAch : 0) + (fanOn ? scenario.room.fanAch : 0);
  const lambda0 = ach();
  const c: Record<Species, number> = {
    co2: outdoor.co2,
    pm1: outdoor.pm1 * PM_PENETRATION * (lambda0 / (lambda0 + DEPOSITION_PER_H.pm1)),
    pm25: outdoor.pm25 * PM_PENETRATION * (lambda0 / (lambda0 + DEPOSITION_PER_H.pm25)),
    pm10: outdoor.pm10 * PM_PENETRATION * (lambda0 / (lambda0 + DEPOSITION_PER_H.pm10)),
    tvoc: outdoor.tvoc,
    ethanol: 0,
    o3: outdoor.o3 * (lambda0 / (lambda0 + DEPOSITION_PER_H.o3)),
    no2: outdoor.no2 * (lambda0 / (lambda0 + DEPOSITION_PER_H.no2)),
    co: outdoor.co,
  };
  let temp = scenario.room.tempSetpointC;
  let vapour = vapourDensity(45, temp);
  for (const [k, v] of Object.entries(scenario.initial.air) as [keyof TrueAir, number][]) {
    if (k === "temp") temp = v;
    else if (k === "rh") vapour = vapourDensity(v, temp);
    else c[k as Species] = v;
  }

  // --- annotations --------------------------------------------------------------------------
  const annotations: Annotation[] = [];
  const openSpans = new Map<string, number>();
  const span = (key: string, on: boolean, t: number, label: string) => {
    if (on && !openSpans.has(key)) openSpans.set(key, t);
    if (!on && openSpans.has(key)) {
      annotations.push({ from: openSpans.get(key)!, to: t, label });
      openSpans.delete(key);
    }
  };
  span("door", !doorOpen, t0, "door closed");
  span("window", windowOpen, t0, "window open");
  span("fan", fanOn, t0, "extract fan on");

  const apply = (t: number, e: (typeof events)[number]["spec"]) => {
    switch (e.type) {
      case "occupants": {
        const factor = jitter(occupantRng, 0.1, 0.3);
        if (e.count === 0) occupants.delete(e.group);
        else occupants.set(e.group, { who: e.who, activity: e.activity, count: e.count, factor });
        annotations.push({ from: t, to: t, label: `${e.group}: ${e.count} ${e.activity}` });
        return;
      }
      case "door":
        doorOpen = e.open;
        span("door", !e.open, t, "door closed");
        return;
      case "window":
        windowOpen = e.open;
        span("window", e.open, t, "window open");
        return;
      case "fan":
        fanOn = e.open;
        span("fan", e.open, t, "extract fan on");
        return;
      case "cooking":
      case "cleaning":
      case "shower": {
        const perMin = (e.type === "cooking" ? e.pm25MgPerMin : e.type === "cleaning" ? e.tvocMgPerMin : e.waterGPerMin) * jitter(emissionRng, 0.2, 0.5);
        emissions.push({ until: t + e.minutes * 60, kind: e.type, perMin });
        annotations.push({ from: t, to: t + e.minutes * 60, label: e.type });
        return;
      }
      case "hand-gel": {
        // Most of the ethanol in a dose of gel evaporates within about two minutes (assumption).
        emissions.push({ until: t + 120, kind: "hand-gel", perMin: (e.ethanolMg / 2) * jitter(emissionRng, 0.2, 0.5) });
        annotations.push({ from: t, to: t + 120, label: "hand gel" });
        return;
      }
      case "set":
        for (const [k, v] of Object.entries(e.values) as [keyof TrueAir, number][]) {
          if (k === "temp") temp = v;
          else if (k === "rh") vapour = vapourDensity(v, temp);
          else c[k as Species] = v;
          if (e.hold) held[k] = v;
        }
        annotations.push({ from: t, to: t, label: `set ${Object.entries(e.values).map(([k, v]) => `${k}=${v}`).join(", ")}${e.hold ? " (held)" : ""}` });
        return;
      case "release":
        for (const k of Object.keys(held)) delete held[k as keyof TrueAir];
        annotations.push({ from: t, to: t, label: "release" });
        return;
      case "outdoor":
        outdoor = { ...outdoor, ...e.values };
        annotations.push({ from: t, to: t, label: "outdoor air changed" });
        return;
    }
  };

  // --- one 5 s step ------------------------------------------------------------------------
  const step = (t: number) => {
    const lambda = ach();
    let co2PpmPerH = 0;
    let moistureGPerH = 0;
    let coarseMgPerH = 0;
    let people = 0;
    for (const o of occupants.values()) {
      people += o.count;
      co2PpmPerH += ((o.count * co2LitresPerSecond(o.who, o.activity) * o.factor * 3.6) / V) * 1e6;
      moistureGPerH += o.count * MOISTURE_G_PER_H[o.activity] * o.factor;
      coarseMgPerH += o.count * RESUSPENSION_MG_PER_H[o.activity];
    }
    let cookingMgPerH = 0;
    let cleaningMgPerH = 0;
    let showerGPerH = 0;
    let ethanolMgPerH = 0;
    for (const e of emissions) {
      if (t > e.until) continue;
      if (e.kind === "cooking") cookingMgPerH += e.perMin * 60;
      if (e.kind === "cleaning") cleaningMgPerH += e.perMin * 60;
      if (e.kind === "shower") showerGPerH += e.perMin * 60;
      if (e.kind === "hand-gel") ethanolMgPerH += e.perMin * 60;
    }
    const perV = (mgPerH: number) => (mgPerH * 1000) / V; // µg/m³ per hour
    const out = {
      co2: outdoor.co2 + outdoorOffset.co2,
      pm1: Math.max(0, outdoor.pm1 * (1 + outdoorOffset.pm)),
      pm25: Math.max(0, outdoor.pm25 * (1 + outdoorOffset.pm)),
      pm10: Math.max(0, outdoor.pm10 * (1 + outdoorOffset.pm)),
    };
    const sources: Record<Species, number> = {
      co2: lambda * out.co2 + co2PpmPerH,
      pm1: lambda * PM_PENETRATION * out.pm1 + perV(cookingMgPerH * COOKING_PM1_OF_PM25),
      pm25: lambda * PM_PENETRATION * out.pm25 + perV(cookingMgPerH + coarseMgPerH * 0.1),
      pm10: lambda * PM_PENETRATION * out.pm10 + perV(cookingMgPerH * COOKING_PM10_OF_PM25 + coarseMgPerH),
      tvoc: lambda * outdoor.tvoc + tvocPpbFromUgM3(perV(cleaningMgPerH + people * BIOEFFLUENT_TVOC_MG_PER_H)),
      ethanol: ethanolPpbFromUgM3(perV(ethanolMgPerH)),
      o3: lambda * outdoor.o3,
      no2: lambda * outdoor.no2,
      co: lambda * outdoor.co,
    };
    for (const s of SPECIES) c[s] = relax(c[s], sources[s], lambda + DEPOSITION_PER_H[s], dtH);

    const outdoorTemp = outdoor.temp + outdoorOffset.temp;
    vapour = relax(vapour, lambda * vapourDensity(outdoor.rh, outdoorTemp) + (moistureGPerH + showerGPerH) / V, lambda, dtH);
    const showering = showerGPerH > 0;
    const target = scenario.room.tempSetpointC + WARMING_PER_PERSON_C * people + (showering ? 2 : 0);
    const windowLoss = windowOpen ? scenario.room.windowOpenAch * 0.5 : 0;
    temp = relax(temp, target / HEATING_TAU_H + windowLoss * outdoorTemp, 1 / HEATING_TAU_H + windowLoss, dtH);
    vapour = Math.min(vapour, saturationVapourDensity(temp)); // condensation

    for (const [k, v] of Object.entries(held) as [keyof TrueAir, number][]) {
      if (k === "temp") temp = v;
      else if (k === "rh") vapour = vapourDensity(v, temp);
      else c[k as Species] = v;
    }
  };

  const snapshot = (t: number): TrueAirSample => {
    const a: TrueAir = {};
    for (const s of SPECIES) a[s] = round(s, c[s]);
    a.temp = round("temp", temp);
    a.rh = round("rh", relativeHumidity(vapour, temp));
    return { t, air: a };
  };

  // --- run --------------------------------------------------------------------------------
  const samples: TrueAirSample[] = [];
  let next = 0;
  for (let t = t0; t <= end; t += GENERATOR_STEP_S) {
    while (next < events.length && events[next]!.t <= t) apply(t, events[next++]!.spec);
    if ((t - t0) % 60 === 0) {
      // Outdoor drift: Ornstein-Uhlenbeck, drawn every minute whether jitter is on or not.
      const zs = [outdoorRng.normal(), outdoorRng.normal(), outdoorRng.normal()];
      if (scenario.jitter) {
        const a = (tauH: number) => Math.exp(-1 / 60 / tauH);
        outdoorOffset.co2 = outdoorOffset.co2 * a(6) + 8 * Math.sqrt(1 - a(6) ** 2) * zs[0]!;
        outdoorOffset.pm = outdoorOffset.pm * a(12) + 0.25 * Math.sqrt(1 - a(12) ** 2) * zs[1]!;
        outdoorOffset.temp = outdoorOffset.temp * a(12) + 1.5 * Math.sqrt(1 - a(12) ** 2) * zs[2]!;
      }
    }
    if ((t - t0) % scenario.sampleIntervalS === 0) samples.push(snapshot(t));
    step(t);
  }
  for (const [key, from] of openSpans) annotations.push({ from, to: end, label: key === "door" ? "door closed" : key === "window" ? "window open" : "extract fan on" });
  annotations.sort((a, b) => a.from - b.from || a.to - b.to || (a.label < b.label ? -1 : 1));
  return { scenario, seed, samples, annotations };
}
