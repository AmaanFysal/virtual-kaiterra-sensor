---
name: new-scenario
description: Use when adding or changing a synthetic true-air scenario in data/scenarios (e.g. a new room, activity or condition to exercise the sensor), or the generator's physics.
---

# New or changed scenario

1. Read docs/04 (model, file format, event types) and ADR-0009. The generator is a test tool: don't grow it into a room model for the care home (ADR-0006).
2. Use the care home's rooms (`virtual-care-home/data/floorplan.json`: Room1–6 19 m², en-suites 3 m², Lounge 52.25 m², ceilings 2.4 m) and its clock (default start Tue 2026-11-03 06:00 UTC).
3. Write `data/scenarios/<id>.json`. Put any device settings the scenario needs (conditions, device events in minutes) under `device`. Keep magnitudes plausible, and note any new assumption in docs/04 and docs/09.
4. Add a test to `packages/true-air-gen/test/generate.test.ts` proving the scenario makes its point, and re-record the golden hashes on purpose.
5. Add the scenario to the table in docs/04; if it shows a condition effect, check its section in the report (docs/08).
6. Run the `pre-pr` skill.
