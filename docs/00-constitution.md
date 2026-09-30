# 00 · Constitution

**Purpose:** the non-negotiable rules of this project. Every other doc, spec and PR must respect them.

Changing anything here needs an ADR in `docs/adr/` and an explicit decision, not a drive-by edit.

## Non-negotiables

1. **Deterministic runs.** A device config (with its seed) plus a true-air input reproduces every reading exactly.
   - All randomness comes from the seeded RNG (`packages/core/src/rng.ts`). No `Math.random()`.
   - No wall-clock time in `packages/`: no `Date.now()`, `new Date()`, `performance.now()` or timers. The core only knows the timestamps it is given.
   - No I/O in `packages/`: no filesystem, network, environment or console. The apps do I/O.
   - Each random component draws from its own named stream a fixed number of times per reporting interval, so switching one feature on never shifts another's numbers.
   - Enforced by `packages/core/test/guard.test.ts`, the golden-hash test and the `pre-pr` skill.
2. **Cited or declared.** Every published number in the model cites its source (docs/02). Every number Kaiterra does not publish is an assumption, recorded in an ADR and marked in code (`basis: "assumption"`).
3. **Healthy means in spec.** With every condition switch off and modules within their life, every reading is within the spec envelope of its reference (the lagged true value). Anything that can leave the envelope is opt-in or end-of-life, and flags the readings it touches.
4. **Real formats, unchanged.** Output formats match the real device's as closely as the evidence allows, so software written for the real Kaiterra API works against this one unchanged. The ground-truth side channel (reference, truth, envelope, flags) never appears in them.
5. **Secrets stay secret.** `KAITERRA_API_KEY` lives only in `.env` (gitignored) or the environment. It is never committed, logged or written into a fixture.
6. **The host owns the air.** When plugged into the care home simulation, the sensor measures the true air the host sends. It has no room model and no occupancy logic of its own (ADR-0006).
7. **No Claude attribution** in commits, PRs, comments or docs (see CLAUDE.md for the full rule and its enforcement).

## Guiding principles

- Match the real device first; make it convenient second.
- Prefer a documented, testable approximation over an undocumented realistic-looking one.
- When sources disagree, keep both and let a setting choose (ADR-0002), rather than silently picking.
- Provisional evidence is labelled provisional, everywhere it is used.
