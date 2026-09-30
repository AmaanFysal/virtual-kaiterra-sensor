# Progress: v1 (a standalone virtual Sensedge Mini)

> Updated at the end of every session (see the `pre-pr` skill).

## Status

M0 and M1 built (2026-09-30). Tests pass; typecheck clean.

## Done

- **M0 scaffold and governance:** pnpm workspace (`@vks/core`, `@vks/cli`); TypeScript 7 and Vitest 5 as in the care home; `.claude/settings.json` attribution off; `.githooks/` (commit-msg, patterns, docs checker) and `no-ai-attribution.yml` copied from the care home; new `ci.yml` (typecheck, test, key grep); determinism guard test over `packages/*/src`; CLAUDE.md, docs 00–09, ADR template, skills and rules.
- **M1 reference and fixtures:** docs/02 with sources S1–S7; `core/spec` (spec table, four profiles, envelope, ranges, quantisation, modules, variants, citations); care home time mapping verified against its `time.ts`; ten provisional fixtures with provenance sidecars and a README; `vks fixtures:fetch` (skips without a key; redacts the key everywhere).
- **ADRs:** 0001 time and cadence; 0002 bounded error and profiles; 0003 unpublished values; 0004 TVOC as both names (Accepted); 0005 workspace; 0006 sim owns the air (Proposed); 0007 BACnet view first.

## In progress

Nothing.

## Next

- M2 core sensor model.

## Blockers

- None for M4–M9. A live API response or a Sensedge Mini sample (API or CSV export) would resolve docs/09 R1, R2, R5 and R6.

## Session log

| Date | Session | Outcome |
|---|---|---|
| 2026-09-30 | Design, M0–M3 | Plan approved with condition effects, time-mapping check and no-key fixtures; M0–M3b built; 107 tests pass |
