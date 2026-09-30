# Plan: v1 (a standalone virtual Sensedge Mini)

> Written in plan mode after the design discussion of 2026-09-30. One commit per sub-milestone on branch `v1-standalone-sensor` (M0 on main).

## Approach

One pure, streaming device engine (`createDevice().step()`) that every host drives: batch conversion, the HTTP server and the care home plug-in. The error model is bounded by construction so "always within spec" is provable and property-tested. Everything Kaiterra publishes is cited; everything else is an ADR'd assumption. Each random component has its own stream so features are independent. Formats come after the model so they are tested against provisional fixtures, which live responses can later replace.

## Tasks

| # | Task | Docs affected | Done when |
|---|------|---------------|-----------|
| M0 (built) | **Scaffold and governance:** workspace, TypeScript, Vitest; `.claude/settings.json` attribution off; commit-msg hook, patterns, docs checker and attribution workflow copied from the care home; CI workflow; determinism guard test; CLAUDE.md, docs 00–09, ADR template, workstream files, skills, rules | CLAUDE.md, 00, 01 | Hooks installed by `pnpm install`; the hook rejects an attribution message; guard passes |
| M1 (built) | **Reference and provisional fixtures:** research S1–S7; spec table (`core/spec`) with four profiles; modules and variants; time mapping to the care home; fixtures from docs and integration code with sidecars; `fixtures:fetch` (no-key path, redaction) | 02, 09, ADR-0001, 0003, 0004 | Spec and time tests pass; fixture and fetch tests pass |
| M2 (built) | **Core sensor model:** sampling, lag, bounded error, interval mean, clamp, quantise, flags; batch `simulate` | 03, 08, ADR-0002, 0005 | Envelope property test for every profile; lag test; golden hashes |
| M3a (built) | **Lifecycle and availability:** module aging (exposure-dependent), replacement, recalibration, dropouts, network outages and the 1-hour buffer, power | 03, 08 | Lifecycle tests pass |
| M3b | **Condition effects:** PM humidity, MOx cross-sensitivity and baseline, NDIR ABC, warm-up, outliers; research citations | 03, 08, 09, ADR-0008 | Condition tests pass; defaults unchanged (golden hashes) |
| M4 | **Output formats:** API JSON (device, top, history with `group_by` and pagination, batch), TVOC names per ADR-0004, MQTT F1/F2, BACnet view, CSV | 05, ADR-0004 | Contract tests against the fixtures |
| M5 | **Synthetic true-air generator** (test tool) and scenarios including shower, hand gel, poorly ventilated weeks, power cycle | 04 | Sanity and golden tests |
| M6 | **CLI** `generate`, `convert`, `report`; true-air CSV/JSONL files | 06 | End to end on the scenarios |
| M7 | **Validation report** (HTML and Markdown) | 08 | Report in `reports/` |
| M8 | **Kaiterra-compatible server** | 06 | Contract tests |
| M9 | **Plug-in interface**: adapter, mock host, ADR-0006 accepted or revised | 07 | Mock host run on the care home clock |
| M10 | **BACnet/IP server** (stretch) | 05 | Who-Is, ReadProperty(Multiple), COV |

## Risks

- Provisional fixtures may be wrong in detail (docs/09 R1, R2); keep formatters data-driven so a live sample is a small change.
- Golden hashes pin behaviour; re-record only on purpose and say why.
- The ABC and MOx magnitudes are assumptions; keep them in config.
