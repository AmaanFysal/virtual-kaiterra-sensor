---
name: new-parameter
description: Use when adding or changing a measured parameter (e.g. noise, light, pressure, dew point), its spec values, API name, units, module or response time.
---

# New or changed parameter

1. Read docs/02 (reference) and docs/03 (model). Find the parameter in Kaiterra's sources (S1–S5); if Kaiterra does not publish a value, it is an assumption and needs an ADR (extend ADR-0003 or write a new one).
2. Add it to `PARAMS` in `packages/core/src/params.ts` (order matters: it fixes stream draw order, so adding one re-records the golden hashes; say so).
3. Add its `ParamSpec` in `packages/core/src/spec/sensedge-mini.ts`: units exactly as the API writes them, resolution, decimals, per-document range and accuracy bands with citations, T90 with its basis, API names.
4. Map it to a module or the main board in `packages/core/src/spec/modules.ts`, and to the variants that have it.
5. Update docs/02's tables and the tests in `packages/core/test/spec.test.ts`; make sure the envelope property test covers it (`test/helpers.ts` RANGES).
6. Run the `pre-pr` skill.
