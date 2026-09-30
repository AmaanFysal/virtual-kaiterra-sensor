// The Sensedge Mini's published specification, mirrored from docs/02 (keep them in step).
// Two Kaiterra documents disagree on O3, NO2 and CO; both are kept and a spec profile
// picks between them (ADR-0002). Values Kaiterra does not publish are marked as
// assumptions (ADR-0003).

import type { ParamId } from "../params.js";
import type { CitationId } from "./sources.js";

/** Which document a number comes from: S1 web page or S2 2024 PDF. */
export type SpecDocument = "web" | "pdf2024";

/** "web-page" and "pdf-2024" use one document; "tighter"/"looser" combine both, value by value. */
export type SpecProfile = "web-page" | "pdf-2024" | "tighter" | "looser";
export const SPEC_PROFILES: readonly SpecProfile[] = ["web-page", "pdf-2024", "tighter", "looser"];
export const DEFAULT_SPEC_PROFILE: SpecProfile = "looser";

/** Allowed error for a true value x in [from, to]: abs + rel·x ("±a ±b%" is additive). */
export interface AccuracyBand {
  from: number;
  to: number;
  abs: number;
  rel: number;
}

export interface DocumentSpec {
  /** Measurement range the accuracy applies to. */
  range: readonly [number, number];
  accuracy: readonly AccuracyBand[];
  cite: CitationId;
}

export type Basis = "published" | "published-secondary" | "assumption";

export interface ParamSpec {
  id: ParamId;
  label: string;
  /** Unit string exactly as the Kaiterra API writes it (S3). */
  units: string;
  technology: string;
  /** Reported resolution, in `units`. TVOC is quantised in µg/m³ instead (see `tvocQuantise`). */
  resolution: number;
  /** Decimal places in reported values. */
  decimals: number;
  /** Per-document spec. Missing: not published by that document. */
  documents: Partial<Record<SpecDocument, DocumentSpec>>;
  /** For parameters with no published accuracy: the parameter whose spec is borrowed (ADR-0003). */
  borrowedFrom?: ParamId;
  /** Highest value the device can report, when above the accuracy range (CO2 "extended range"). */
  reportMax?: number;
  /** Time to reach 90% of a step change, seconds. */
  t90: { seconds: number; basis: Basis; note: string };
  /** Kaiterra API reading name(s) (S3). */
  apiParams: readonly string[];
}

const band = (from: number, to: number, abs: number, rel: number): AccuracyBand => ({ from, to, abs, rel });

/** TVOC unit conversion implied by S1's paired ranges: 0–1,382 ppb = 0–5,482 µg/m³. */
export const TVOC_UGM3_PER_PPB = 5482 / 1382;

const PM25_DOCS = {
  web: { range: [0, 1000], accuracy: [band(0, 30, 3, 0), band(30, 1000, 0, 0.1)], cite: "S1" },
  pdf2024: { range: [0, 1000], accuracy: [band(0, 30, 3, 0), band(30, 1000, 0, 0.1)], cite: "S2" },
} as const satisfies Partial<Record<SpecDocument, DocumentSpec>>;

export const SENSEDGE_MINI: Readonly<Record<ParamId, ParamSpec>> = {
  pm1: {
    id: "pm1",
    label: "PM1",
    units: "µg/m³",
    technology: "Laser particle sensor (light scattering), 0.3–1.0 µm",
    resolution: 1,
    decimals: 0,
    documents: PM25_DOCS,
    borrowedFrom: "pm25",
    t90: { seconds: 10, basis: "published-secondary", note: "KM-200 typical response time 10 s (S7)" },
    apiParams: ["rpm1c"],
  },
  pm25: {
    id: "pm25",
    label: "PM2.5",
    units: "µg/m³",
    technology: "Laser particle sensor (light scattering), 0.3–2.5 µm",
    resolution: 1,
    decimals: 0,
    documents: PM25_DOCS,
    t90: { seconds: 10, basis: "published-secondary", note: "KM-200 typical response time 10 s (S7)" },
    apiParams: ["rpm25c"],
  },
  pm10: {
    id: "pm10",
    label: "PM10",
    units: "µg/m³",
    technology: "Laser particle sensor (light scattering), 0.3–10 µm",
    resolution: 1,
    decimals: 0,
    documents: {
      web: { range: [0, 1000], accuracy: [band(0, 30, 3, 0), band(30, 1000, 0, 0.15)], cite: "S1" },
      pdf2024: { range: [0, 1000], accuracy: [band(0, 30, 3, 0), band(30, 1000, 0, 0.15)], cite: "S2" },
    },
    t90: { seconds: 10, basis: "published-secondary", note: "KM-200 typical response time 10 s (S7)" },
    apiParams: ["rpm10c"],
  },
  co2: {
    id: "co2",
    label: "CO2",
    units: "ppm",
    technology: "Non-dispersive infrared (NDIR)",
    resolution: 1,
    decimals: 0,
    documents: {
      web: { range: [400, 5000], accuracy: [band(400, 5000, 40, 0.03)], cite: "S1" },
      pdf2024: { range: [400, 5000], accuracy: [band(400, 5000, 40, 0.03)], cite: "S2" },
    },
    reportMax: 10_000,
    t90: { seconds: 120, basis: "assumption", note: "Diffusion NDIR in a wall enclosure; not published (ADR-0003)" },
    apiParams: ["rco2"],
  },
  tvoc: {
    id: "tvoc",
    label: "TVOC",
    units: "ppb",
    technology: "Multi-pixel metal oxide sensor (MOx), calibrated against ethanol",
    resolution: 1 / TVOC_UGM3_PER_PPB,
    decimals: 1,
    documents: {
      web: { range: [0, 1382], accuracy: [band(0, 1382, 4, 0.15)], cite: "S1" },
      pdf2024: { range: [0, 1382], accuracy: [band(0, 1382, 4, 0.15)], cite: "S2" },
    },
    t90: { seconds: 60, basis: "assumption", note: "MOx, passive sampling; not published (ADR-0003)" },
    apiParams: ["tvoc", "rtvoc"],
  },
  temp: {
    id: "temp",
    label: "Temperature",
    units: "C",
    technology: "Digital sensor",
    resolution: 0.01,
    decimals: 2,
    documents: {
      web: { range: [-40, 125], accuracy: [band(-40, 125, 0.3, 0)], cite: "S1" },
      pdf2024: { range: [-40, 125], accuracy: [band(-40, 125, 0.3, 0)], cite: "S2" },
    },
    t90: { seconds: 600, basis: "assumption", note: "Thermal mass of the enclosure dominates; not published (ADR-0003)" },
    apiParams: ["rtemp"],
  },
  rh: {
    id: "rh",
    label: "Relative humidity",
    units: "%",
    technology: "Digital sensor",
    resolution: 0.01,
    decimals: 2,
    documents: {
      web: { range: [0, 100], accuracy: [band(0, 100, 3, 0)], cite: "S1" },
      pdf2024: { range: [0, 100], accuracy: [band(0, 100, 3, 0)], cite: "S2" },
    },
    t90: { seconds: 300, basis: "assumption", note: "Follows the enclosure temperature; not published (ADR-0003)" },
    apiParams: ["rhumid"],
  },
  o3: {
    id: "o3",
    label: "O3",
    units: "ppb",
    technology: "Electrochemical",
    resolution: 1,
    decimals: 0,
    documents: {
      web: { range: [20, 2000], accuracy: [band(20, 2000, 0, 0.1)], cite: "S1" },
      pdf2024: { range: [0, 2000], accuracy: [band(0, 100, 10, 0), band(100, 2000, 0, 0.1)], cite: "S2" },
    },
    t90: { seconds: 60, basis: "assumption", note: "Electrochemical cell; not published (ADR-0003)" },
    apiParams: ["ro3"],
  },
  no2: {
    id: "no2",
    label: "NO2",
    units: "ppb",
    technology: "Electrochemical",
    resolution: 1,
    decimals: 0,
    documents: {
      web: { range: [0, 2000], accuracy: [band(0, 100, 20, 0), band(100, 2000, 0, 0.2)], cite: "S1" },
      pdf2024: { range: [0, 2000], accuracy: [band(0, 100, 10, 0), band(100, 2000, 0, 0.1)], cite: "S2" },
    },
    t90: { seconds: 60, basis: "assumption", note: "Electrochemical cell; not published (ADR-0003)" },
    apiParams: ["no2"],
  },
  co: {
    id: "co",
    label: "CO",
    units: "ppm",
    technology: "Electrochemical",
    resolution: 0.1,
    decimals: 1,
    documents: {
      web: { range: [0, 100], accuracy: [band(0, 10, 1, 0), band(10, 100, 0, 0.1)], cite: "S1" },
      pdf2024: { range: [0, 100], accuracy: [band(0, 20, 1, 0), band(20, 100, 0, 0.05)], cite: "S2" },
    },
    t90: { seconds: 60, basis: "assumption", note: "Electrochemical cell; not published (ADR-0003)" },
    apiParams: ["co"],
  },
};

function documentsFor(profile: SpecProfile, spec: ParamSpec): DocumentSpec[] {
  const { web, pdf2024 } = spec.documents;
  const both = [web, pdf2024].filter((d): d is DocumentSpec => d !== undefined);
  if (profile === "web-page") return web ? [web] : both;
  if (profile === "pdf-2024") return pdf2024 ? [pdf2024] : both;
  return both;
}

/** Allowed error in one document at true value x; outside the range the nearest band is extended. */
function documentEnvelope(doc: DocumentSpec, x: number): number {
  const bands = doc.accuracy;
  const hit = bands.find((b) => x >= b.from && x <= b.to) ?? (x < bands[0]!.from ? bands[0]! : bands[bands.length - 1]!);
  return hit.abs + hit.rel * Math.abs(x);
}

/** The spec envelope E(x): the largest error the profile allows at true value x. */
export function envelope(param: ParamId, profile: SpecProfile, x: number): number {
  const values = documentsFor(profile, SENSEDGE_MINI[param]).map((d) => documentEnvelope(d, x));
  return profile === "looser" ? Math.max(...values) : Math.min(...values);
}

/** The range the profile's accuracy applies to: intersection for "tighter", union for "looser". */
export function specRange(param: ParamId, profile: SpecProfile): readonly [number, number] {
  const ranges = documentsFor(profile, SENSEDGE_MINI[param]).map((d) => d.range);
  const lows = ranges.map((r) => r[0]);
  const highs = ranges.map((r) => r[1]);
  return profile === "looser" ? [Math.min(...lows), Math.max(...highs)] : [Math.max(...lows), Math.min(...highs)];
}

/** What the device can output: the spec range, extended at the top where published (CO2). */
export function reportRange(param: ParamId, profile: SpecProfile): readonly [number, number] {
  const [lo, hi] = specRange(param, profile);
  return [lo, Math.max(hi, SENSEDGE_MINI[param].reportMax ?? hi)];
}

/** Rounds a value to what the device reports (resolution, then decimals). */
export function quantise(param: ParamId, value: number): number {
  const spec = SENSEDGE_MINI[param];
  if (param === "tvoc") {
    // TVOC resolution is 1 µg/m³ (S1, S2); the API reports ppb with one decimal (S3 examples).
    const ugm3 = Math.round(value * TVOC_UGM3_PER_PPB);
    return roundTo(ugm3 / TVOC_UGM3_PER_PPB, spec.decimals);
  }
  return roundTo(Math.round(value / spec.resolution) * spec.resolution, spec.decimals);
}

/** Largest rounding error `quantise` can add, in `units`. */
export function quantisationError(param: ParamId): number {
  const spec = SENSEDGE_MINI[param];
  return spec.resolution / 2 + (param === "tvoc" ? 0.05 : 0);
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const rounded = Math.round(value * f) / f;
  return Object.is(rounded, -0) ? 0 : rounded;
}
