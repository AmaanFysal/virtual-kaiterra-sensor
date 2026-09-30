# ADR 0001: Unix seconds, a 5 s sampling grid and 1-minute reports labelled by their end

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/03-sensor-model.md, docs/07-plugin-interface.md

## Context

The Kaiterra API writes RFC 3339 UTC timestamps and labels every interval by its end, with `span` in seconds (S3). The Sensedge Mini logs and pushes every minute (S1, S2). The care home simulation counts integer seconds from Mon 2026-11-02 00:00 and ticks every 5 s. The core must not read the wall clock, and `Date` is banned there.

## Decision

We will represent time in the core as integer Unix seconds, UTC, and format and parse RFC 3339 with pure civil-date arithmetic (`packages/core/src/time.ts`).

We will map care home time as `unix = 1793577600 + t` (`SIM_EPOCH_UNIX`). UK clocks are on GMT on 2026-11-02, so local time equals UTC. Sim t = 108000 is Tue 2026-11-03 06:00 = Unix 1793685600. Tests check both points and a 400-day calendar sweep against a port of the sim's `simDate`.

We will sample every 5 s (the care home tick) and report the mean of each 60 s interval at its end (`ts` = end, `span` = 60), needing at least half the interval's samples.

## Consequences

- Stepping the device on the sim's tick needs no resampling, and the sim's default start is on a minute boundary.
- The API's "interval end" convention holds everywhere, including `group_by` averages later (M4).
- The sim clock has no DST, so local-time labels drift from UK time after 28 Mar 2027 (docs/09).
- Events at exactly a minute boundary apply before that minute closes.

## Alternatives considered

- Milliseconds or `Date` objects: need `Date` in the core, and the API truncates to seconds anyway.
- Sampling every 1 s or 2 s (NDIR modules often measure every 2 s): 2.5–5× the work with no visible difference in 1-minute means, and off the care home grid.
- Labelling by interval start: contradicts the API.
