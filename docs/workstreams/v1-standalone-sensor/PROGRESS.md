# Progress: v1 (a standalone virtual Sensedge Mini)

> Updated at the end of every session (see the `pre-pr` skill).

## Status

M0–M4 merged to main (PR #1). M0–M7 merged to main (PRs #1, #2). M8 built on branch `v1-server` (2026-09-30), awaiting the owner's review. 227 tests pass; typecheck clean. M9 on hold (see Blockers).

## Done

- **M0 scaffold and governance:** pnpm workspace (`@vks/core`, `@vks/cli`); TypeScript 7 and Vitest 5 as in the care home; `.claude/settings.json` attribution off; `.githooks/` (commit-msg, patterns, docs checker) and `no-ai-attribution.yml` copied from the care home; new `ci.yml` (typecheck, test, key grep); determinism guard test over `packages/*/src`; CLAUDE.md, docs 00–09, ADR template, skills and rules.
- **M1 reference and fixtures:** docs/02 with sources S1–S7; `core/spec` (spec table, four profiles, envelope, ranges, quantisation, modules, variants, citations); care home time mapping verified against its `time.ts`; ten provisional fixtures with provenance sidecars and a README; `vks fixtures:fetch` (skips without a key; redacts the key everywhere).
- **M2 core model:** streaming `createDevice` and batch `simulate`; 5 s sampling, first-order lag from T90, 1-minute means labelled by their end, bounded bias/drift/noise, clamp, quantise, side channel and flags.
- **M3a lifecycle:** module aging by runtime and PM exposure, replacement (new serial, bias, drift), on-board recalibration, dropouts, network outages with the 1-hour buffer and backfill, power.
- **M3b condition effects:** PM hygroscopic growth, MOx humidity/temperature/ethanol and baseline, NDIR ABC, warm-up (flag or suppress), outliers; all off by default.
- **M4 output formats:** pure Kaiterra API router (`/devices/{id}`, `/top`, `/history` with `group_by`, `time_zone` and pagination, `/batch`, errors) with TVOC as both names; Secondary MQTT Formats 1 and 2; BACnet object view per the PICS; CSV. Contract tests against the fixtures; format guesses listed in docs/09. Review fixes: BACnet codes verified against bacnet-stack and @bacnet-js/client; hourly :15 explained by the docs (Asia/Kathmandu, on the hour in local time) and reproduced in a test; `limit` now means latest N as documented.
- **M5 generator:** `@vks/true-air-gen`: single-zone model stepped exactly every 5 s, CO2 from Persily & de Jonge (2017); JSON scenarios with one-off, repeating and daily events and device settings; eleven scenarios including shower, hand gel, four poorly ventilated weeks, power cycle and module swap, out of range, and step changes.
- **M6 CLI:** `pnpm vks scenarios`, `generate`, `convert` (readings, Kaiterra top/history/device, MQTT 1/2, BACnet, CSV; `--as-of` delivery); true-air CSV/JSONL formats in core; example device configs.
- **M7 validation report:** `pnpm vks report` (HTML with charts, and Markdown) per scenario: accuracy table (bias, MAE, RMSE, in-spec shares, worst error / E, measured lag against τ), a section per flag and condition effect, charts of sensed, true and reference values with the envelope, flagged periods and events; Markdown summaries and statistics JSON for all eleven scenarios committed, with a drift test; HTML generated on demand and attached to CI runs. All scenarios: 100% of healthy readings in spec.
- **M8 server:** `@vks/server` (`node:http` around `kaiterraApi`, fixed and replay clocks, 413 limit, optional CORS, `/` index); core `createReplayDevice` (lazy stepping up to 'now'; batch `simulate` now uses it, golden hashes unchanged); `vks serve` for scenarios and true-air files. The unmodified `kaiterra-async-client` reads it correctly (`tools/kaiterra-client-check`).
- **ADRs:** 0001 time and cadence; 0002 bounded error and profiles; 0003 unpublished values; 0004 TVOC as both names (Accepted); 0005 workspace; 0006 sim owns the air (Proposed); 0007 BACnet view first; 0008 condition effects; 0009 generator model and scenarios; 0010 HTTP server with lazy replay.

## In progress

Nothing.

## Next

- Owner review of M8; push `v1-server` and open a PR when asked.
- M9 when the care home's plug-in API contract exists.

## Blockers

- **M9 (care home adapter) is on hold** until the care home's plug-in API contract exists (part of its `v1.0-testbed` milestone); M9 will follow that contract (docs/09, "On hold").
- A live API response or a Sensedge Mini sample (API or CSV export) would resolve docs/09 R1, R2, R5 and R6.

## Session log

| Date | Session | Outcome |
|---|---|---|
| 2026-09-30 | M8 | Kaiterra-compatible HTTP server and `vks serve`; replay device in core; checked with the real `kaiterra-async-client`; 227 tests pass |
| 2026-09-30 | M5–M7 review | HTML reports no longer committed (Markdown and statistics JSON are; HTML is a CI artifact); M9 on hold until the care home's plug-in API contract |
| 2026-09-30 | M5–M7 | Generator (11 scenarios, Persily & de Jonge CO2), CLI (scenarios, generate, convert), validation reports for every scenario (100% healthy in spec; lags match τ); 210 tests pass |
| 2026-09-30 | M4 review fixes | BACnet codes verified; :15 hourly windows explained and tested; `limit` semantics fixed; 147 tests pass |
| 2026-09-30 | Commits, M4 | ADR-0004 accepted; M0 on main, M1–M3b as separate commits in PR #1 (no-attribution and CI checks pass); M4 built; 142 tests pass |
| 2026-09-30 | Design, M0–M3 | Plan approved with condition effects, time-mapping check and no-key fixtures; M0–M3b built; 107 tests pass |
