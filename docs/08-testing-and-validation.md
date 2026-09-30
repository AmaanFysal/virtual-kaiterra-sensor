# 08 · Testing and validation

**Purpose:** what the tests prove, the invariants they hold, and the planned validation report.

> Status: M0–M1 tests built (2026-09-30). Report planned (M7).

## Test files

| File | Proves |
|---|---|
| `packages/core/test/guard.test.ts` | No `Math.random`, wall clock, timers, env, console or Node I/O in any `packages/*/src` (docs/00 rule 1) |
| `packages/core/test/time.test.ts` | Care home mapping: sim t = 0 → `2026-11-02T00:00:00Z` (Monday); t = 108000 → `2026-11-03T06:00:00Z` (Tuesday); 400-day sweep against a port of the sim's `simDate` and weekdays; RFC 3339 formatting and parsing |
| `packages/core/test/spec.test.ts` | Spec table values, the four profiles on O3/NO2/CO, `looser` default, PM1 borrowing, CO2 extended range, quantisation, API names and units, citations |
| `apps/cli/test/fixtures.test.ts` | Every fixture has a provenance sidecar and no key, and matches the documented API/MQTT shapes |
| `apps/cli/test/fixtures-fetch.test.ts` | `fixtures:fetch` skips without a key; with one it never logs or saves it (raw or URL-encoded), even when the API echoes it back |

## Validation report (M7)

Per parameter: bias, MAE, RMSE, largest error, % within envelope (healthy and overall), estimated lag, overlay charts of true, reference and sensed values; a section per condition effect with its flagged periods shaded. Saved to `docs/workstreams/v1-standalone-sensor/reports/`.
