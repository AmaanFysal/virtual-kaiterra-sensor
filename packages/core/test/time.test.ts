import { describe, expect, it } from "vitest";
import {
  SECONDS_PER_DAY,
  SIM_DEFAULT_START_T,
  SIM_EPOCH_UNIX,
  SIM_TICK_SECONDS,
  civilFromDays,
  daysFromCivil,
  formatIso,
  parseIso,
  simToUnix,
  unixToSim,
} from "../src/time.js";

// A port of the care home's simDate (virtual-care-home packages/shared-types/src/time.ts),
// kept verbatim in logic so the mapping is checked against the sim's own calendar.
function careHomeSimDate(t: number): { year: number; month: number; day: number } {
  const daysInMonth = (year: number, month: number) => {
    if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
  };
  let rest = Math.floor(t / SECONDS_PER_DAY) + 1;
  let year = 2026;
  let month = 11;
  while (rest >= daysInMonth(year, month)) {
    rest -= daysInMonth(year, month);
    month += 1;
    if (month > 12) (month = 1), (year += 1);
  }
  return { year, month, day: rest + 1 };
}
const CARE_HOME_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UNIX_WEEKDAYS = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]; // 1970-01-01 was a Thursday

describe("care home time mapping", () => {
  it("sim t = 0 is Monday 2026-11-02 00:00 UTC", () => {
    expect(SIM_EPOCH_UNIX).toBe(1_793_577_600);
    expect(formatIso(simToUnix(0))).toBe("2026-11-02T00:00:00Z");
    expect(UNIX_WEEKDAYS[Math.floor(simToUnix(0) / SECONDS_PER_DAY) % 7]).toBe("Mon");
  });

  it("the care home's default start is Tuesday 2026-11-03 06:00", () => {
    expect(SIM_DEFAULT_START_T).toBe(108_000);
    expect(formatIso(simToUnix(SIM_DEFAULT_START_T))).toBe("2026-11-03T06:00:00Z");
    expect(simToUnix(SIM_DEFAULT_START_T)).toBe(1_793_685_600);
    expect(UNIX_WEEKDAYS[Math.floor(simToUnix(SIM_DEFAULT_START_T) / SECONDS_PER_DAY) % 7]).toBe("Tue");
  });

  it("agrees with the care home's calendar and weekdays for 400 days", () => {
    for (let day = 0; day < 400; day++) {
      const t = day * SECONDS_PER_DAY + 13 * 3600;
      const unix = simToUnix(t);
      const ours = civilFromDays(Math.floor(unix / SECONDS_PER_DAY));
      expect(ours).toEqual(careHomeSimDate(t));
      expect(UNIX_WEEKDAYS[Math.floor(unix / SECONDS_PER_DAY) % 7]).toBe(CARE_HOME_WEEKDAYS[day % 7]);
    }
  });

  it("round-trips and keeps the 5 s tick on the sampling grid", () => {
    expect(unixToSim(simToUnix(123_456))).toBe(123_456);
    expect(SIM_TICK_SECONDS).toBe(5);
    expect(simToUnix(SIM_DEFAULT_START_T) % SIM_TICK_SECONDS).toBe(0);
    expect(simToUnix(SIM_DEFAULT_START_T) % 60).toBe(0);
  });
});

describe("civil dates and RFC 3339", () => {
  it("round-trips days across leap years and centuries", () => {
    for (let days = -800_000; days <= 800_000; days += 997) {
      const { year, month, day } = civilFromDays(days);
      expect(daysFromCivil(year, month, day)).toBe(days);
    }
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(civilFromDays(daysFromCivil(2028, 2, 29))).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("formats and parses the API's timestamps", () => {
    expect(parseIso("2020-06-17T06:40:00Z")).toBe(1_592_376_000);
    expect(formatIso(1_592_376_000)).toBe("2020-06-17T06:40:00Z");
    for (let unix = 0; unix < 4_000_000_000; unix += 86_413_777) expect(parseIso(formatIso(unix))).toBe(unix);
  });

  it("truncates fractions and honours offsets", () => {
    expect(parseIso("2020-06-17T06:40:00.999Z")).toBe(parseIso("2020-06-17T06:40:00Z"));
    expect(parseIso("2020-06-17T08:40:00+02:00")).toBe(parseIso("2020-06-17T06:40:00Z"));
    expect(parseIso("2020-06-17T01:10:00-05:30")).toBe(parseIso("2020-06-17T06:40:00Z"));
  });

  it("rejects malformed input", () => {
    expect(() => parseIso("2020-06-17 06:40:00")).toThrow();
    expect(() => parseIso("2020-13-01T00:00:00Z")).toThrow();
    expect(() => formatIso(1.5)).toThrow();
  });
});
