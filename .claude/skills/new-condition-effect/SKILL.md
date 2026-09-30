---
name: new-condition-effect
description: Use when adding or changing a condition-dependent error (e.g. PM humidity growth, MOx cross-sensitivity, NDIR ABC, warm-up, outliers, sensor faults).
---

# New or changed condition effect

1. Read docs/03 ("Condition-dependent effects") and ADR-0008. Find research for the effect; cite it, or mark each magnitude as an assumption in the ADR.
2. Add a config block to `ConditionsConfig` in `packages/core/src/model/config.ts` with `enabled: false` by default, and the pure maths to `packages/core/src/model/conditions.ts`.
3. Apply it in `closeInterval` in `packages/core/src/model/device.ts`. If it is random, give it its own stream and draw it every interval whatever `enabled` says.
4. Add a flag to `Flag` and `HEALTH_FLAGS` in `packages/core/src/model/types.ts`; flag readings it moves by more than the quantisation step.
5. Test it in `packages/core/test/conditions.test.ts`: off by default, the effect's size and direction when on, flags, and no change to other readings. The golden hashes must not change.
6. Add a scenario for it to the generator (docs/04) and a section to the report (docs/08) when those exist.
7. Run the `pre-pr` skill.
