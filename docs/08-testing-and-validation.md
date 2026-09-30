# 08 · Testing and validation

**Purpose:** what the tests prove, the invariants they hold, and the planned validation report.

> Status: M0 tests built (2026-09-30). Report planned (M7).

## Test files

| File | Proves |
|---|---|
| `packages/core/test/guard.test.ts` | No `Math.random`, wall clock, timers, env, console or Node I/O in any `packages/*/src` (docs/00 rule 1) |

## Validation report (M7)

Per parameter: bias, MAE, RMSE, largest error, % within envelope (healthy and overall), estimated lag, overlay charts of true, reference and sensed values; a section per condition effect with its flagged periods shaded. Saved to `docs/workstreams/v1-standalone-sensor/reports/`.
