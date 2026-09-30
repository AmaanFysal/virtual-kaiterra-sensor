# 09 · Risks, assumptions and debt

**Purpose:** what could make the virtual sensor wrong, and what we are knowingly carrying.

> Status: updated 2026-09-30 (end of M5).

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
| History page size | At most 1,440 points per series before `_links.next` | S3 says large results are paginated but not at what size |
| `begin`/`end` | Both inclusive, applied to interval-end timestamps | Not documented |
| Pagination | Newest points first; `next` ends one span before the page, keeps the window length and carries the remaining `limit` | Inferred from one example; with several series of different lengths a later page may repeat points |
| Averages | Plain mean of the minute values, one decimal (two for temperature and humidity) | Only PM2.5 hourly examples exist |
| `source` in history | Included, as in `top` | The docs' history example (probably a Laser Egg) has none |
| Error bodies and 405 | `{message}`; 405 for a wrong method | Not documented |
| `format`, `units`, `aqi` | Accepted and ignored: no unit conversion, no AQI values in points | Documented (`aqi`) or seen in integration code; not implemented |
| Legacy `/sensedges/{id}` | Not served | Only in old example code |
| MQTT Format 1 | TVOC as `km203.rtvocb (ppb)`, O3 as `km207.r03` (copied from the guide); `rpm1c`, `rno2 (ppb)`, `rco (ppm)` guessed | Whether `rtvocb` is the reported TVOC is not stated |
| MQTT Format 2 | `pm1`, `no2`, `co` appended | Not in the guide |
| BACnet | COV increments; AI 7 present as `no-sensor`; objects for missing parameters omitted | PICS lists names only |
| CSV | Own layout | Export columns undocumented (R6) |
| Time zones | `time_zone` grouping uses the runtime's time zone data (`Intl`), so a future tz-rule change in Node could shift local windows | Only affects `time_zone` queries |

## Settled since M4

- **Hourly windows at :15 (settled 2026-09-30).** The docs' hourly example looked misaligned with clock hours. S3 explains it: the example uses `time_zone=Asia/Kathmandu` (UTC+5:45), and "the hourly divisions happen on the hour in local time, which in UTC time is not 45 but 15 minutes after the hour". So windows are clock-aligned in the requested time zone, which is what the model does; a test reproduces the example's timestamps exactly. Nothing supports aligning to the request's `begin`, so there is no such option.
- **History defaults and `limit` (settled 2026-09-30).** S3: `begin` defaults to 168 hours before `end`, `end` to now, and `limit` "retrieves only the latest N data points", with pagination only for results too large for one response. The first M4 version wrongly paginated whenever `limit` truncated; fixed.
- **BACnet unit and reliability codes (settled 2026-09-30).** Verified against bacnet-stack and @bacnet-js/client (docs/02 S8, S9) and pinned by a test.

## Generator assumptions (M5, ADR-0009)

The generator is a test tool, so these only shape test data, never the sensor model: PM deposition 0.2/0.4/1.5 per h, 0.8 penetration, cooking size split, dust stirred up by moving people, TVOC from people 0.3 mg/h, hand gel evaporating in 2 minutes, O3 and NO2 indoor loss 2.8 and 0.5 per h, moisture 30–110 g/h per person, shower water rates, heating time constant 1 h, +0.25 °C per person. Door exchange is modelled as exchange with outdoor air. Only CO2 generation is from a published method (Persily & de Jonge 2017).

## Debt

- Contract tests compare shapes with provisional fixtures; they cannot catch a difference the fixtures themselves get wrong (R1).
