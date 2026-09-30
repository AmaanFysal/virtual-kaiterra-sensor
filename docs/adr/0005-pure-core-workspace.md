# ADR 0005: A pnpm workspace with a pure core and I/O apps

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/01-system-and-repo.md

## Context

The sensor must be deterministic and must run in three hosts: batch file conversion (CLI), a Kaiterra-compatible HTTP server, and in-process inside the care home simulation. The care home repo uses a pnpm workspace with a pure `sim-engine` package and I/O apps.

## Decision

We will use the same layout: pure packages under `packages/` (`@vks/core`, and `@vks/true-air-gen` from M5) and I/O apps under `apps/` (`@vks/cli`, and `@vks/server` from M8). Packages export their TypeScript source directly. The core is a streaming state machine (`createDevice().step()`), so every host drives the same engine. A test scans every `packages/*/src` for banned calls.

## Consequences

- The care home can import `@vks/core` in-process without pulling in HTTP or file code.
- Determinism is checked mechanically, not by review alone (the care home still lists this as to be decided).
- Batch and live stepping are the same code path, tested to give identical readings.

## Alternatives considered

- A single package: simpler, but the purity boundary would be a convention instead of a package boundary.
- A batch-only core with a separate streaming wrapper: two code paths that could drift apart.
