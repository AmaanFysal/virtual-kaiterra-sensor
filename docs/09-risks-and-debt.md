# 09 · Risks, assumptions and debt

**Purpose:** what could make the virtual sensor wrong, and what we are knowingly carrying.

> Status: updated 2026-09-30 (end of M2).

## Open risks

| # | Risk | Why it matters | Resolves when |
|---|---|---|---|
| R1 | **The output format is unverified against a live API.** The fixtures come from Kaiterra's documentation examples and from integration code, not from real responses or a real device. | Software that works against the virtual API might not work against the real one. | A real API response (`pnpm vks fixtures:fetch` with a key) or a device sample is available. |
| R2 | The public test device is a Sensedge **SE-100**, not a Mini. Even live fixtures from it pin the API shape, not Mini-specific `source` values or parameters. | `source` values for the Mini (`km200`, `km203`, …) come from the MQTT guide, and it is unknown whether the Mini reports `rpm1c`. | A Mini response or export sample. |
| R3 | S1 and S2 disagree on O3, NO2 and CO. | The envelope depends on which is right. | Kaiterra clarifies; until then the `looser` profile is the default (ADR-0002). |
| R4 | Response times other than PM are assumptions, and the PM one (10 s) is from a reseller listing we could not open. | Lag and the reference used for accuracy depend on them. | Published T90s, or a step test on a real device. |
| R5 | TVOC name: the 2025-02-26 docs make `tvoc` current and `rtvoc` deprecated, but every example and Home Assistant use `rtvoc`. | A client reading only one name misses TVOC. | Live responses show what the API returns today. Until then both names are returned (ADR-0004). |
| R6 | CSV export columns are undocumented. | The CSV formatter (M4) cannot match the real export. | The user provides an export sample. |
| R7 | Kaiterra's accuracy figures are treated as hard bounds. Real specifications are usually typical or statistical. | The default device may be more accurate than real ones. The `looser` profile widens it; condition effects and outliers are planned (M3b). | Real-device comparison data. |

## Assumptions (each in an ADR)

- PM1 borrows PM2.5's accuracy; the KM-200 is assumed to report PM1 (ADR-0003).
- T90: CO2 120 s, TVOC 60 s, electrochemical 60 s, humidity 300 s, temperature 600 s (ADR-0003).
- KM-201 and KM-208 life 21 months; on-board drift horizon 730 days (ADR-0003).
- The bias/drift/noise split 0.5/0.25/0.25 and AR(1) 0.5 noise (ADR-0002).

## Known modelling limits

- The sim clock has no DST, so from 28 Mar 2027 the care home's clock times are GMT, not UK local time. The Unix mapping stays exact; only local-time labels would drift. Relevant if `time_zone` grouping (M4) is used with `Europe/London`.
- Temperature and humidity use one first-order lag each; the real enclosure's thermal response is more complex.

## Debt

- The fixtures README lists evidence from integration code that is not yet enforced by any test beyond shape checks (M4 contract tests will).
