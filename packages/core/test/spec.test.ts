import { describe, expect, it } from "vitest";
import { PARAMS } from "../src/params.js";
import { CITATIONS } from "../src/spec/sources.js";
import { MODULES, VARIANTS, moduleForParam, variantParams } from "../src/spec/modules.js";
import {
  SENSEDGE_MINI,
  SPEC_PROFILES,
  TVOC_UGM3_PER_PPB,
  envelope,
  quantisationError,
  quantise,
  reportRange,
  specRange,
} from "../src/spec/sensedge-mini.js";

describe("Sensedge Mini spec table", () => {
  it("has the published accuracy for the core parameters (S1, S2)", () => {
    for (const profile of SPEC_PROFILES) {
      expect(envelope("pm25", profile, 10)).toBeCloseTo(3);
      expect(envelope("pm25", profile, 100)).toBeCloseTo(10);
      expect(envelope("pm10", profile, 100)).toBeCloseTo(15);
      expect(envelope("co2", profile, 1000)).toBeCloseTo(70); // ±40 ppm ±3%
      expect(envelope("tvoc", profile, 100)).toBeCloseTo(19); // ±15% ±4 ppb, not ±8
      expect(envelope("temp", profile, 21)).toBeCloseTo(0.3);
      expect(envelope("rh", profile, 50)).toBeCloseTo(3);
    }
  });

  it("keeps both documents where they disagree, and profiles pick between them", () => {
    expect(envelope("no2", "web-page", 50)).toBe(20);
    expect(envelope("no2", "pdf-2024", 50)).toBe(10);
    expect(envelope("no2", "tighter", 50)).toBe(10);
    expect(envelope("no2", "looser", 50)).toBe(20);
    expect(envelope("no2", "looser", 500)).toBeCloseTo(100);
    expect(envelope("co", "web-page", 15)).toBeCloseTo(1.5);
    expect(envelope("co", "pdf-2024", 15)).toBe(1);
    expect(envelope("co", "looser", 50)).toBeCloseTo(5);
    expect(envelope("co", "tighter", 50)).toBeCloseTo(2.5);
    expect(envelope("o3", "web-page", 50)).toBeCloseTo(5);
    expect(envelope("o3", "pdf-2024", 50)).toBe(10);
    expect(specRange("o3", "web-page")).toEqual([20, 2000]);
    expect(specRange("o3", "tighter")).toEqual([20, 2000]);
    expect(specRange("o3", "looser")).toEqual([0, 2000]);
  });

  it("defaults to the looser profile", async () => {
    const { DEFAULT_SPEC_PROFILE } = await import("../src/spec/sensedge-mini.js");
    expect(DEFAULT_SPEC_PROFILE).toBe("looser");
  });

  it("borrows PM2.5's accuracy for PM1 and says so", () => {
    expect(SENSEDGE_MINI.pm1.borrowedFrom).toBe("pm25");
    expect(envelope("pm1", "looser", 50)).toBe(envelope("pm25", "looser", 50));
  });

  it("extends CO2 to 10,000 ppm for reporting only", () => {
    expect(specRange("co2", "looser")).toEqual([400, 5000]);
    expect(reportRange("co2", "looser")).toEqual([400, 10_000]);
  });

  it("quantises to the published resolution", () => {
    expect(quantise("pm25", 12.49)).toBe(12);
    expect(quantise("co2", 812.5)).toBe(813);
    expect(quantise("temp", 21.23456)).toBe(21.23);
    expect(quantise("rh", 55.816)).toBe(55.82);
    expect(quantise("co", 1.26)).toBe(1.3);
    expect(quantise("pm25", -0.2)).toBe(0);
    // TVOC: 1 µg/m³ steps, reported in ppb with one decimal.
    const q = quantise("tvoc", 100);
    expect(Math.abs(q * TVOC_UGM3_PER_PPB - Math.round(q * TVOC_UGM3_PER_PPB))).toBeLessThan(0.2);
    expect(Math.abs(q - 100)).toBeLessThanOrEqual(quantisationError("tvoc"));
  });

  it("never rounds further than quantisationError", () => {
    for (const p of PARAMS) {
      for (let x = 0; x < 3000; x += 0.137) expect(Math.abs(quantise(p, x) - x)).toBeLessThanOrEqual(quantisationError(p) + 1e-9);
    }
  });

  it("uses the API's reading names and unit strings (S3)", () => {
    expect(SENSEDGE_MINI.pm25.apiParams).toEqual(["rpm25c"]);
    expect(SENSEDGE_MINI.pm10.apiParams).toEqual(["rpm10c"]);
    expect(SENSEDGE_MINI.co2.apiParams).toEqual(["rco2"]);
    expect(SENSEDGE_MINI.tvoc.apiParams).toEqual(["tvoc", "rtvoc"]);
    expect(SENSEDGE_MINI.temp.apiParams).toEqual(["rtemp"]);
    expect(SENSEDGE_MINI.rh.apiParams).toEqual(["rhumid"]);
    expect(SENSEDGE_MINI.pm25.units).toBe("µg/m³");
    expect(SENSEDGE_MINI.temp.units).toBe("C");
    expect(SENSEDGE_MINI.rh.units).toBe("%");
  });

  it("cites a document for every published number", () => {
    for (const p of PARAMS) {
      for (const doc of Object.values(SENSEDGE_MINI[p].documents)) expect(CITATIONS[doc.cite]).toBeDefined();
    }
  });
});

describe("modules and variants", () => {
  it("maps each variant's parameters to a module bay or the main board", () => {
    const v = VARIANTS["pm-tvoc-co2"];
    expect(variantParams(v).sort()).toEqual(["co2", "pm1", "pm10", "pm25", "rh", "temp", "tvoc"]);
    expect(moduleForParam(v.bays, "pm25")?.module.source).toBe("km200");
    expect(moduleForParam(v.bays, "tvoc")?.module.source).toBe("km203");
    expect(moduleForParam(v.bays, "co2")).toBeUndefined();
    expect(variantParams(VARIANTS.well)).toEqual(expect.arrayContaining(["o3", "no2", "co"]));
  });

  it("gives the KM-200 a shorter life at high exposure (S7)", () => {
    expect(MODULES["KM-200"].highExposureLifeDays).toBeLessThan(MODULES["KM-200"].lifeDays);
  });
});
