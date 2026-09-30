---
paths:
  - "packages/**"
---

# Pure package rules

These packages must be deterministic: same config and seed + same true air → same readings. See docs/00-constitution.md and docs/03-sensor-model.md.

- Never use `Math.random()`. Use `stream(seed, ...parts)` from `packages/core/src/rng.ts`, one named stream per random component.
- Draw every stream a fixed number of times per reporting interval, whatever the switches say, so one feature never shifts another's numbers.
- Never read wall-clock time: no `Date.now()`, `new Date()`, `performance.now()`, `setTimeout`/`setInterval`. Time is the Unix seconds you are given.
- No I/O: no filesystem, network, `process.env` or `console`. Apps under `apps/` do I/O.
- Iterate parameters in `PARAMS` order, never object-key or Set order from external data.
- Every published number cites its source (docs/02); every unpublished one is `basis: "assumption"` with an ADR.
- Anything that can put a reading outside its spec envelope must flag it.
- `packages/core/test/guard.test.ts` checks the first four rules.
