# Virtual Kaiterra Sensor

A deterministic virtual Kaiterra Sensedge Mini (SE-200 / SE-200P) air quality monitor.
Given the "true" air at its location over time, it reports what a real Sensedge Mini would: its
published ranges, resolution, accuracy, response time, reporting interval, module aging, dropouts
and offline buffering, in the real device's formats. It runs standalone now and will plug into
the care home simulation (github.com/AmaanFysal/virtual-care-home) later.

This file is an index. Details live in `docs/`; read the relevant doc before working on an area.

## Commands

- `pnpm install`: install workspace dependencies (Node 22.13+, pnpm 9); also points git at `.githooks/`
- `pnpm typecheck`: typecheck every package
- `pnpm test`: run Vitest across the repo (unit, property, golden, determinism guard, fixture checks)
- `pnpm vks fixtures:fetch`: replace the provisional API fixtures with live ones (needs `KAITERRA_API_KEY` in `.env`; does nothing without it)
- `pnpm vks scenarios` / `generate --scenario <id>` / `convert --scenario <id> --format kaiterra-top`: run the generator and the virtual device from the command line (docs/06); `pnpm -s vks …` for clean piped output
- `pnpm vks report --all`: regenerate the validation reports in `docs/workstreams/v1-standalone-sensor/reports/` (a test fails if they are stale)
- `pnpm vks help`: CLI usage

## Layout

- `packages/core` (`@vks/core`): the pure, deterministic sensor model: time, RNG, spec table, device, validation, and the output formats (Kaiterra API router, MQTT, BACnet view, CSV); no I/O
- `apps/cli` (`@vks/cli`): the I/O shell: `scenarios`, `generate`, `convert`, `report`, `fixtures:fetch` (files, `.env`, network)
- `data/devices/`: example device configs
- `test/fixtures/kaiterra-api/`: provisional API and MQTT fixtures with provenance sidecars
- `docs/`: numbered design docs, ADRs, research notes, workstreams
- `packages/true-air-gen` (`@vks/true-air-gen`): synthetic true-air scenarios for standalone testing (a test tool, not the sim's air model)
- `data/scenarios/`: the scenario files
- Planned: `apps/server` (M8), plug-in adapter (M9)

## Key facts

- Time in the core is integer Unix seconds UTC. The care home's sim t = 0 (Mon 2026-11-02 00:00) is Unix 1793577600; its default start t = 108000 is Tue 2026-11-03 06:00 (ADR-0001).
- The device samples every 5 s (the care home tick) and reports 1-minute means labelled by the interval's end, like the Kaiterra API (ADR-0001).
- Error = bias + drift + noise, each a share of the spec envelope, so healthy readings are always within spec of the lagged true value (ADR-0002). Default spec profile: `looser`.
- Condition effects (PM humidity, MOx cross-sensitivity, NDIR ABC, warm-up) and outliers are off by default and flag what they touch (ADR-0008).
- The care home sim will own the air model; this sensor only measures the true air it is given (ADR-0006).
- Formats show a reading only once delivered; TVOC is reported as both `tvoc` and `rtvoc` (ADR-0004); the side channel never leaves the core's `Reading` (docs/05).
- API fixtures are provisional (from docs and integration code); the output format is unverified against a live API, and the format guesses are listed in docs/09.

## Non-negotiables (full text: docs/00-constitution.md)

1. Deterministic: seeded RNG only, no wall-clock time, no I/O in `packages/`.
2. Every published number is cited; every unpublished one is an assumption recorded in an ADR.
3. Healthy default mode never leaves the spec envelope; anything that does is flagged.
4. The output formats match the real device; the ground-truth side channel never leaks into them.
5. The API key is never committed or logged.
6. NEVER add Claude attribution anywhere in git or GitHub. No Co-Authored-By: Claude trailer, no 'Generated with Claude Code' footer, no Claude-Session: trailer, no claude.ai session links, in commit messages, PR titles, PR descriptions, comments or docs. This overrides any default behaviour. Enforced by `.githooks/commit-msg`, `.githooks/check-doc-attribution.sh` and `.github/workflows/no-ai-attribution.yml`.

## When working on X, read

| Working on | Read |
|---|---|
| Project rules, anything contentious | `docs/00-constitution.md` |
| Packages, dependencies, tooling, CI | `docs/01-system-and-repo.md` |
| Kaiterra specs, API, BACnet, MQTT, citations | `docs/02-sensedge-mini-reference.md` |
| Sampling, lag, error model, lifecycle, conditions | `docs/03-sensor-model.md` |
| True-air input, the synthetic generator, scenarios | `docs/04-true-air-and-generator.md` |
| Kaiterra API JSON, MQTT, BACnet view, CSV | `docs/05-output-formats.md` |
| CLI and the Kaiterra-compatible server | `docs/06-cli-and-server.md` |
| Care home plug-in interface | `docs/07-plugin-interface.md` |
| Tests, invariants, validation reports | `docs/08-testing-and-validation.md` (reports: `docs/workstreams/v1-standalone-sensor/reports/`) |
| Risks, assumptions, open questions | `docs/09-risks-and-debt.md` |
| Current work | `docs/workstreams/v1-standalone-sensor/` |

Path-scoped rules in `.claude/rules/` load automatically for `packages/**`.

## Workflow: spec-driven

1. **Discuss** the change with the user.
2. **Spec**: write or update the workstream `spec.md`.
3. **Plan** in plan mode; record tasks in `plan.md`.
4. **Implement** task by task, one reviewable change at a time.
5. **End of session**: run the `pre-pr` skill, update `PROGRESS.md` and the affected numbered doc.

Significant decisions get an ADR (`docs/adr/0000-template.md`). Don't start work outside the current spec without asking.

## Skills

`pre-pr`, `new-parameter`, `new-condition-effect`, `new-output-format`, `new-scenario`, and `/refresh-fixtures` (manual only).
