---
name: pre-pr
description: Use when finishing a work session, before committing, or before opening a PR. Runs typecheck and tests, checks constitution invariants, and updates the affected numbered doc and PROGRESS.md.
---

# Pre-PR checklist

1. Run `pnpm typecheck` and `pnpm test` from the repo root. Fix failures; report any you cannot fix, with output.
2. Check the constitution (`docs/00-constitution.md`) on the diff:
   - The determinism guard (`packages/core/test/guard.test.ts`) passed: no wall clock, `Math.random`, env, console or Node I/O in `packages/*/src`.
   - The golden hashes in `packages/core/test/model.test.ts` are unchanged, or were re-recorded on purpose with the reason stated.
   - New published numbers cite a source in docs/02; new unpublished ones are marked `basis: "assumption"` and have an ADR.
   - Anything new that can leave the spec envelope flags the readings it touches, and is off by default.
   - No side-channel field (`reference`, `truth`, `envelope`, `flags`, `deliveredAt`) appears in an output format.
   - `git grep -n KAITERRA_API_KEY` shows no value, and no fixture contains `key=` other than `key=REDACTED`.
3. If a number moved (model, generator, scenarios, report), run `pnpm vks report --all` and commit the regenerated reports; the report test fails otherwise.
4. Run `sh .githooks/check-doc-attribution.sh`: no doc may credit Claude. Fix any it finds; normal mentions of Claude or CLAUDE.md are fine.
5. Update the numbered doc(s) in `docs/` affected by this change so they match the code. Record significant decisions as an ADR from `docs/adr/0000-template.md`.
6. Update the workstream's `PROGRESS.md` (done, in progress, next, blockers, session log row).
7. Summarise for the user: what changed, checks run and results, docs updated.
