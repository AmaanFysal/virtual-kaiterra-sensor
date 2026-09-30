# 08 · Testing and validation

**Purpose:** what the tests prove, the invariants they hold, and the planned validation report.

> Status: M0–M5 tests built (2026-09-30): 188 tests. Report planned (M7).

## Test files

| File | Proves |
|---|---|
| `packages/core/test/guard.test.ts` | No `Math.random`, wall clock, timers, env, console or Node I/O in any `packages/*/src` (docs/00 rule 1) |
| `packages/core/test/time.test.ts` | Care home mapping: sim t = 0 → `2026-11-02T00:00:00Z` (Monday); t = 108000 → `2026-11-03T06:00:00Z` (Tuesday); 400-day sweep against a port of the sim's `simDate` and weekdays; RFC 3339 formatting and parsing |
| `packages/core/test/spec.test.ts` | Spec table values, the four profiles on O3/NO2/CO, `looser` default, PM1 borrowing, CO2 extended range, quantisation, API names and units, citations |
| `packages/core/test/model.test.ts` | M2: the envelope property test, reporting cadence and labels, sources, grid and range, gaps, lag (the reference follows the closed-form first-order response), determinism, stream independence, golden hashes, config validation |
| `packages/core/test/lifecycle.test.ts` | M3a: module aging (exposure-dependent), expiry, recalibration, replacement, dropouts, offline buffering and backfill, buffer overflow, random outages, power, stepping on the care home clock, live equals batch |
| `packages/core/test/conditions.test.ts` | M3b: each effect off by default, then PM humidity (shower), MOx ethanol (hand gel), humidity and temperature, baseline, ABC (four weeks, poorly ventilated vs daily fresh air), warm-up (power-on, decay, per module, suppression), outliers |
| `packages/core/test/formats.test.ts` | M4: API `top`, `history` (raw, hourly, open hour left out, `limit` as latest-N, pagination without gaps, BST day windows, Kaiterra's Kathmandu :15 example reproduced), `devices/{id}` and `batch` match the fixtures' shapes and the delivered readings; errors; MQTT Formats 1/2 match the guide, backfill published on reconnect; BACnet objects per the PICS with verified unit and reliability codes; CSV equals the API's averages; no side channel in any format |
| `packages/true-air-gen/test/generate.test.ts` | M5: all eleven scenarios valid and plausible; CO2 steady state and first-order rise against the closed form (Persily & de Jonge rates); decay at ventilation plus deposition; each scenario makes its point; timeline expansion; validation errors; determinism and golden hashes; every scenario through the default device stays in spec |
| `apps/cli/test/fixtures.test.ts` | Every fixture has a provenance sidecar and no key, and matches the documented API/MQTT shapes |
| `apps/cli/test/fixtures-fetch.test.ts` | `fixtures:fetch` skips without a key; with one it never logs or saves it (raw or URL-encoded), even when the API echoes it back |

## Invariants

1. **In envelope.** Every healthy reading (no health flag) satisfies |value − reference| ≤ E(reference). Property-tested for every spec profile: 24 seeds × 3 variants × 3 h of random irregular air, module health from 0 to 100% and on-board age up to 700 days, with more than 10,000 readings checked per profile. A second test checks that the model uses most of the envelope (worst ratio > 0.6) rather than a sliver.
2. **Flagged or fine.** Whatever can leave the envelope (end-of-life drift, out-of-range air, condition effects, warm-up, outliers) flags the reading. With every switch off and in-range air, no reading carries a health flag.
3. **Deterministic.** Same config and input give byte-identical readings; golden sha256 hashes pin two configurations. Re-record them only on purpose, and say why in the commit.
4. **Independent streams.** Turning dropouts or outliers on, or reporting fewer parameters, never changes any other reading's value.
5. **Real cadence.** One reading per parameter per minute, `ts` = interval end, `span` = 60, values on the resolution grid and inside the reportable range.
6. **Real formats.** Every output has the fixture's structure, shows only delivered readings (BACnet: produced readings), and never contains the side channel.

Health flags: `out-of-range`, `extended-range`, `module-expired`, `calibration-overdue`, `warm-up`, `outlier`, `pm-humidity`, `mox-humidity`, `mox-temperature`, `mox-ethanol`, `mox-baseline`, `abc-offset`. `backfilled` is not a health flag.

## Validation report (M7)

Per parameter: bias, MAE, RMSE, largest error, % within envelope (healthy and overall), estimated lag, overlay charts of true, reference and sensed values; a section per condition effect with its flagged periods shaded. Saved to `docs/workstreams/v1-standalone-sensor/reports/`.
