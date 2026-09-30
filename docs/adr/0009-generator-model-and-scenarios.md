# ADR 0009: A single-zone, exactly stepped generator driven by JSON scenarios

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/04-true-air-and-generator.md, docs/08-testing-and-validation.md, docs/09-risks-and-debt.md

## Context

The sensor must be testable before the care home sim has an air model, and the condition effects (ADR-0008) need realistic situations to show against: showers, hand gel, weeks without fresh air. ADR-0006 rules that the sim owns the real air model, so the generator only has to give plausible, reproducible curves, and must not grow into a second room model.

## Decision

We will generate true air with one well-mixed room exchanging air with outdoors. Every quantity follows dC/dt = S − L·C and is stepped exactly every 5 s. CO2 generation comes from Persily & de Jonge (2017) (Equation 4 and Table 2: residents ≥ 80, staff 30–50, visitors 50–60, M from 1.0 sleeping to 3.0 active). Other source and loss rates are assumptions, listed in docs/04 and docs/09. Scenarios are JSON files in `data/scenarios/`, validated by `validateScenario`, with one-off, repeating and daily events. Each file can carry the device settings that make its point. Seeded jitter is on by default and off for the step-change scenario.

## Consequences

- Every scenario is reproducible from its file and a seed, and golden hashes pin them.
- The CO2 curves rest on a published method; the PM, TVOC, humidity and temperature magnitudes are plausible, not validated.
- Door exchange is treated as exchange with outdoor air, which exaggerates how fast an open door clears a room.
- The model stays deliberately simple, so nobody mistakes it for the sim's air model.

## Alternatives considered

- Multi-zone airflow (e.g. CONTAM-style): far more realistic, but it duplicates the sim's future model (ADR-0006).
- Recorded real-world traces: realistic, but there are none for care homes to hand, and they can't be tuned to exercise each effect.
- Explicit Euler steps: simpler, but unstable at high air-change rates with long runs.
