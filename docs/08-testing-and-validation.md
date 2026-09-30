# 08 · Testing and validation

**Purpose:** what the tests prove, the invariants they hold, and the planned validation report.

> Status: M0–M7 built (2026-09-30): 210 tests; validation reports in `docs/workstreams/v1-standalone-sensor/reports/`.

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
| `apps/cli/test/cli.test.ts` | M6: true-air CSV/JSONL round trips and errors with line numbers; `scenarios`, `generate` (reproducible), `convert` to every format; scenario device settings, `--seed`, device-file events, `--as-of` delivery; usage errors and exit codes |
| `packages/core/test/report.test.ts` | M7: in-spec shares, errors and missing intervals; flagged minutes merged into periods with their excess; lag near τ on a step; lag blank on flat air; device log counts |
| `apps/cli/test/report.test.ts` | M7: HTML and Markdown written; a section per condition effect; deterministic; **committed reports equal a fresh `report --all`**; escaping; chart bucketing with gaps; device events as spans |
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

`pnpm vks report --scenario <id>` (or `--all`) runs a scenario's true air through the device with the scenario's device settings. It writes `<id>.html` (charts) and `<id>.md` to `docs/workstreams/v1-standalone-sensor/reports/`, plus a `README.md` index for `--all`. Reports are deterministic, and a test fails when the committed ones differ from what the code generates, so regenerate them with `pnpm vks report --all` after any change that moves a number.

Each report has:

- **Header:** the scenario, the device (variant, seed, spec profile, condition effects on, module health, device log counts, undelivered readings), and headline tiles led by the share of healthy readings within the envelope.
- **Accuracy by parameter:** readings; missing intervals; healthy and all readings within the envelope; bias, MAE and RMSE against the truth; MAE against the reference; the worst healthy error as a share of E; the measured lag next to the expected τ = T90/ln 10.
- **Flags and condition effects:** one section per flag with what it means, the parameters, and the flagged periods with their mean and largest excess beyond the envelope.
- **Charts, one per parameter:**
  - sensed, true and reference lines, with the envelope as a wash around the reference;
  - flagged periods shaded, and scenario and device events (door, window, fan, cooking, cleaning, shower, hand gel, power cuts, outages, module swaps) in lanes above the plot;
  - a crosshair tooltip (mouse or arrow keys) and a data table.
  - Built with the dataviz method: one y-axis; the first three categorical slots, validated for all pairs in light and dark; light and dark themes; no horizontal scroll at phone width.
- **Scenario timeline and method notes.**

Definitions: the reference is the interval mean of the lagged true value (the target of the spec), the truth is the unlagged mean, and E is the envelope at the reference. The lag is the whole-minute shift of the truth, up to 30, that best matches the healthy readings; it is left blank when the truth moves less than the typical envelope. Runs longer than 360 minutes are averaged into buckets for the charts only; the statistics use every reading.

Current results (`reports/README.md`): every scenario has 100% of healthy readings within the envelope. The condition-effect scenarios flag exactly the effects they switch on. On `step-changes` the measured lags match τ: temperature 3 min against 4.3, humidity 2 against 2.2, CO2 1 against 0.9.
