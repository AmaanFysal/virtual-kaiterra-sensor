// The committed API fixtures (M1): every one has a provenance sidecar, none holds a key,
// and each has the shape the Kaiterra docs describe, so later format work (M4) builds on
// checked ground.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIso } from "@vks/core";
import { describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "..", "..", "..", "test", "fixtures", "kaiterra-api");
const UNITS = ["?", "x", "%", "C", "F", "mg/m³", "µg/m³", "ppm", "ppb", "lx", "Pa", "K"];
const dirs = [DIR, join(DIR, "live")].filter(existsSync);
const fixtures = dirs.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".source.json"))
    .map((f) => ({ dir: d, name: f.replace(/\.json$/, "") })),
);
const load = (dir: string, name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));

interface ReadingSeries {
  param: string;
  source?: string;
  units: string;
  span: number;
  points: { ts: string; value: number }[];
}

function checkSeriesList(data: ReadingSeries[]) {
  expect(Array.isArray(data)).toBe(true);
  for (const s of data) {
    expect(typeof s.param).toBe("string");
    expect(UNITS).toContain(s.units);
    expect(Number.isInteger(s.span)).toBe(true);
    if ("source" in s) expect(s.source).toMatch(/^km\d{3}$/);
    for (const p of s.points) {
      expect(p.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(() => parseIso(p.ts)).not.toThrow();
      expect(typeof p.value).toBe("number");
    }
  }
}

describe("Kaiterra API fixtures", () => {
  it("exist", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures)("$name has a provenance sidecar", ({ dir, name }) => {
    const side = JSON.parse(readFileSync(join(dir, `${name}.source.json`), "utf8"));
    expect(["from docs", "from integration code", "live"]).toContain(side.provenance);
    expect(side.url).toMatch(/^https:\/\//);
    expect(side.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof side.provisional).toBe("boolean");
    expect(side.provisional).toBe(side.provenance !== "live");
  });

  it.each(fixtures)("$name holds no API key", ({ dir, name }) => {
    for (const file of [`${name}.json`, `${name}.source.json`]) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text).not.toMatch(/[?&]key=(?!REDACTED)/);
    }
  });

  it("device, top and history responses have the documented shape", () => {
    for (const d of dirs) {
      for (const name of ["devices-top", "devices-history", "devices-history-1h", "devices-history-paginated"]) {
        if (existsSync(join(d, `${name}.json`))) checkSeriesList(load(d, name).data);
      }
      if (existsSync(join(d, "devices-get.json"))) {
        const dev = load(d, "devices-get");
        expect(dev.id).toMatch(/^[0-9a-f-]{36}$/);
        for (const m of dev.handshake.modules) {
          expect(Number.isInteger(m.bay)).toBe(true);
          expect(m.type).toMatch(/^KM-\d{3}$/);
          expect(m.lifetime_pct).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("labels hourly averages with span 3600, and pages with _links.next", () => {
    expect(load(DIR, "devices-history-1h").data[0].span).toBe(3600);
    expect(load(DIR, "devices-history-paginated")._links.next).toMatch(/^https:\/\/api\.kaiterra\.com\/v1\/devices\/.+\/history\?/);
  });

  it("batch sub-responses carry a JSON string body and a status code", () => {
    for (const sub of load(DIR, "batch-response")) {
      expect(sub.code).toBe(200);
      checkSeriesList(JSON.parse(sub.body).data);
    }
  });

  it("MQTT payloads use Unix-second timestamps and the Mini's module prefixes", () => {
    const f1 = load(DIR, "mqtt-secondary-format1");
    const f2 = load(DIR, "mqtt-secondary-format2");
    expect(Number.isInteger(f1.ts)).toBe(true);
    expect(Object.keys(f1.data).filter((k) => k.includes(".")).map((k) => k.split(".")[0])).toEqual(expect.arrayContaining(["km200", "km203"]));
    expect(Object.keys(f2.data).sort()).toEqual(Object.keys(f2.units).sort());
  });
});
