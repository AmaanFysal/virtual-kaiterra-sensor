# 01 · System and repo

**Purpose:** how the repo is laid out, what each package may depend on, and the tooling around it.

> Status: M0–M3 built (2026-09-30). Source: the approved plan in `docs/workstreams/v1-standalone-sensor/plan.md`; conventions copied from virtual-care-home.

## Packages

| Package | Kind | May depend on | Does |
|---|---|---|---|
| `@vks/core` (`packages/core`) | pure | nothing | Time and RNG, the Sensedge Mini spec table, the device model, validation helpers |
| `@vks/cli` (`apps/cli`) | I/O | `@vks/core` | Command line: `fixtures:fetch` now; `generate`, `convert`, `report` later |
| `@vks/true-air-gen` (planned, M5) | pure | `@vks/core` | Synthetic true-air scenarios for standalone testing (not a room model for the sim) |
| `@vks/server` (planned, M8–M9) | I/O | `@vks/core` | Kaiterra-compatible HTTP API; plug-in adapter host |

Pure packages live under `packages/` and follow docs/00 rule 1 (checked by `packages/core/test/guard.test.ts`, which scans every `packages/*/src`). Apps live under `apps/` and may use the filesystem, network, environment and wall clock.

Packages export `./src/index.ts` directly; there is no build step. Scripts run with `tsx`.

## Tooling

- Node ≥ 22.13, pnpm 9.15.4 (`packageManager`), TypeScript 7 (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext modules), Vitest 5 run from the root with defaults. Same versions as the care home repo.
- `pnpm install` runs `prepare`, which sets `git config core.hooksPath .githooks`.
- `.env` is gitignored; `.env.example` documents `KAITERRA_API_KEY` (optional).

## Git hooks and CI

| File | Checks |
|---|---|
| `.githooks/commit-msg` | Rejects commit messages matching `.githooks/attribution-patterns.txt` (case-insensitive) |
| `.githooks/check-doc-attribution.sh` | Fails if a tracked doc credits Claude (deciders/authors lines, "written by" prose) |
| `.github/workflows/no-ai-attribution.yml` | On PRs: title, description, every commit message, and the docs check |
| `.github/workflows/ci.yml` | On pushes to main and PRs: `pnpm typecheck`, `pnpm test`, and a grep for committed API keys |

The hook, patterns file, docs checker and attribution workflow are copied from virtual-care-home so both repos enforce the same rule the same way. The CI workflow is new here: the care home has none yet.

## Claude Code settings

- `.claude/settings.json`: `{"attribution": {"commit": "", "pr": ""}}`.
- `.claude/rules/core.md`: determinism rules, loaded for `packages/**`.
- `.claude/skills/`: `pre-pr`, `new-parameter`, `new-condition-effect`, `new-output-format`, `refresh-fixtures` (manual only).
