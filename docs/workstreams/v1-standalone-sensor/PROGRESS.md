# Progress: v1 (a standalone virtual Sensedge Mini)

> Updated at the end of every session (see the `pre-pr` skill).

## Status

M0 built (2026-09-30). Tests pass; typecheck clean.

## Done

- **M0 scaffold and governance:** pnpm workspace (`@vks/core`); TypeScript 7 and Vitest 5 as in the care home; `.claude/settings.json` attribution off; `.githooks/` (commit-msg, patterns, docs checker) and `no-ai-attribution.yml` copied from the care home; new `ci.yml` (typecheck, test, key grep); determinism guard test over `packages/*/src`; CLAUDE.md, docs 00–09, ADR template, skills and rules.
- **ADRs:** 0005 workspace.

## In progress

Nothing.

## Next

- M1 reference and provisional fixtures.

## Blockers

- None for M4–M9. A live API response or a Sensedge Mini sample (API or CSV export) would resolve docs/09 R1, R2, R5 and R6.

## Session log

| Date | Session | Outcome |
|---|---|---|
| 2026-09-30 | Design, M0–M3 | Plan approved with condition effects, time-mapping check and no-key fixtures; M0–M3b built; 107 tests pass |
