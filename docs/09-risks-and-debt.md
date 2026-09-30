# 09 · Risks, assumptions and debt

**Purpose:** what could make the virtual sensor wrong, and what we are knowingly carrying.

> Status: updated 2026-09-30 (end of M4).

## Open risks

| # | Risk | Why it matters | Resolves when |
|---|---|---|---|
| R1 | **The output format is unverified against a live API.** The fixtures come from Kaiterra's documentation examples and from integration code, not from real responses or a real device. | Software that works against the virtual API might not work against the real one. | A real API response (`pnpm vks fixtures:fetch` with a key) or a device sample is available. |
| R2 | The public test device is a Sensedge **SE-100**, not a Mini. Even live fixtures from it pin the API shape, not Mini-specific `source` values or parameters. | `source` values for the Mini (`km200`, `km203`, …) come from the MQTT guide, and it is unknown whether the Mini reports `rpm1c`. | A Mini response or export sample. |
| R3 | S1 and S2 disagree on O3, NO2 and CO. | The envelope depends on which is right. | Kaiterra clarifies; until then the `looser` profile is the default (ADR-0002). |
| R4 | Response times other than PM are assumptions, and the PM one (10 s) is from a reseller listing we could not open. | Lag and the reference used for accuracy depend on them. | Published T90s, or a step test on a real device. |
| R5 | TVOC name: the 2025-02-26 docs make `tvoc` current and `rtvoc` deprecated, but every example and Home Assistant use `rtvoc`. | A client reading only one name misses TVOC. | Live responses show what the API returns today. Until then both names are returned (ADR-0004). |
| R6 | CSV export columns are undocumented. | The CSV formatter (M4) cannot match the real export. | The user provides an export sample. |
| R7 | Kaiterra's accuracy figures are treated as hard bounds. Real specifications are usually typical or statistical. | The default device may be more accurate than real ones. The `looser` profile, condition effects and outliers exist to widen it. | Real-device comparison data. |

## Assumptions (each in an ADR)

- PM1 borrows PM2.5's accuracy; the KM-200 is assumed to report PM1 (ADR-0003).
- T90: CO2 120 s, TVOC 60 s, electrochemical 60 s, humidity 300 s, temperature 600 s (ADR-0003).
- KM-201 and KM-208 life 21 months; on-board drift horizon 730 days (ADR-0003).
- The bias/drift/noise split 0.5/0.25/0.25 and AR(1) 0.5 noise (ADR-0002).
- Condition-effect magnitudes: MOx humidity 0.8%/%RH, temperature 1%/°C, baseline SD 15 ppb over 3 days; PM calibration humidity 40 %RH; warm-up durations (ADR-0008).
- Online readings arrive at the cloud at the interval's end (no upload latency).

## Known modelling limits

- ABC, when enabled, assumes the lowest reading of each 8-day period is 400 ppm. Outdoor CO2 is now about 420 ppm, so a well-ventilated room gets an offset of about −20 ppm. That is how real ABC sensors behave, and the reason it is off by default.
- Warm-up behaviour of the real device (whether it reports during warm-up at all) is unknown; `suppress` covers both cases.
- The sim clock has no DST, so from 28 Mar 2027 the care home's clock times are GMT, not UK local time. The Unix mapping stays exact; only local-time labels would drift. Relevant if `time_zone` grouping (M4) is used with `Europe/London`.
- Temperature and humidity use one first-order lag each; the real enclosure's thermal response is more complex.

## Format guesses (M4)

Choices the evidence does not settle. Each is one place in `packages/core/src/formats/`; a live response or device sample decides them.

| Area | Our choice | Evidence gap |
|---|---|---|
| History default window | `end` = now, `begin` = `end` − 7 days | Not documented; 7 days is the span of the docs' pagination example |
| History page size | At most 1,440 points per series (and `limit`) before `_links.next` | Not documented |
| `begin`/`end` | Both inclusive, applied to interval-end timestamps | Not documented |
| Pagination | Newest points first; `next` ends one span before the page and keeps the window length | Inferred from one example; with several series of different lengths a later page may repeat points |
| `group_by` alignment | Clock-aligned in `time_zone` (UTC by default) | The docs' hourly example labels windows at :15, which clock alignment would not |
| Averages | Plain mean of the minute values, one decimal (two for temperature and humidity) | Only PM2.5 hourly examples exist |
| `source` in history | Included, as in `top` | The docs' history example (probably a Laser Egg) has none |
| Error bodies and 405 | `{message}`; 405 for a wrong method | Not documented |
| `format`, `units`, `aqi` | Accepted and ignored: no unit conversion, no AQI values in points | Documented (`aqi`) or seen in integration code; not implemented |
| Legacy `/sensedges/{id}` | Not served | Only in old example code |
| MQTT Format 1 | TVOC as `km203.rtvocb (ppb)`, O3 as `km207.r03` (copied from the guide); `rpm1c`, `rno2 (ppb)`, `rco (ppm)` guessed | Whether `rtvocb` is the reported TVOC is not stated |
| MQTT Format 2 | `pm1`, `no2`, `co` appended | Not in the guide |
| BACnet | COV increments; AI 7 present as `no-sensor`; objects for missing parameters omitted; EngineeringUnits numbers from ASHRAE 135 as recalled, to be checked against a BACnet stack in M10 | PICS lists names only |
| CSV | Own layout | Export columns undocumented (R6) |
| Time zones | `time_zone` grouping uses the runtime's time zone data (`Intl`), so a future tz-rule change in Node could shift local windows | Only affects `time_zone` queries |

## Debt

- Contract tests compare shapes with provisional fixtures; they cannot catch a difference the fixtures themselves get wrong (R1).
