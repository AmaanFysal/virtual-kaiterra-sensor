# ADR 0004: Report TVOC as both `tvoc` and `rtvoc` until a live response settles it

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/02-sensedge-mini-reference.md, docs/05-output-formats.md, docs/09-risks-and-debt.md

## Context

The owner first decided that the TVOC reading name should follow the fixture: `tvoc` by default, with an option for `rtvoc`, until a fixture shows otherwise. No live fixture exists, and the provisional evidence conflicts:

- The API documentation version 2025-02-26 lists `tvoc` as the current name and `rtvoc` as deprecated, with removal scheduled for October 2027.
- Every response example in the same documentation, and so every provisional fixture, uses `rtvoc`.
- Home Assistant's Kaiterra integration reads only `rtvoc`.

A deprecation period normally means the API returns both names.

## Decision

We will report TVOC under both `tvoc` and `rtvoc` by default (same value, units `ppb` and source), with a per-device setting to return only one. This applies to every Kaiterra API response (top, history, batch). When a live response shows what the API actually returns, we will match it and supersede this ADR. (Accepted by the owner on 2026-09-30 after reviewing the evidence above.)

## Consequences

- Clients written for either name work against the virtual API, which is the goal of the Kaiterra-compatible server.
- If the real API returns only one name, a client iterating over `data` sees one extra series until this is corrected.

## Alternatives considered

- `tvoc` only (the original default): breaks Home Assistant and any client following the docs' examples.
- `rtvoc` only: contradicts the current documentation, and fails after October 2027.
