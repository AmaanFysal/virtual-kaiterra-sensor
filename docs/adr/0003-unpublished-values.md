# ADR 0003: Assumed values for what Kaiterra does not publish

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/02-sensedge-mini-reference.md, docs/03-sensor-model.md, docs/09-risks-and-debt.md

## Context

The model needs values Kaiterra does not publish: response times (only a secondary "typical 10 s" exists for the KM-200), PM1 accuracy (S1 lists only the PM1 size range), the life of the KM-201 and KM-208 modules, and how fast on-board sensors drift.

## Decision

We will use these values, marked `basis: "assumption"` in `packages/core/src/spec/sensedge-mini.ts`:

| Value | Assumed | Reasoning |
|---|---|---|
| PM T90 | 10 s | KM-200 "typical response time 10 s" (reseller listing, S7; marked `published-secondary`) |
| CO2 T90 | 120 s | Diffusion NDIR; the Senseair S8 datasheet (PSP0107 ed. 18) gives "2 minutes by 90%" |
| TVOC T90 | 60 s | MOx with passive sampling behind a grille |
| O3, NO2, CO T90 | 60 s | Typical electrochemical cells |
| Humidity T90 | 300 s | Follows the enclosure temperature |
| Temperature T90 | 600 s | Thermal mass of a 370 g wall-mounted enclosure |
| PM1 accuracy | PM2.5's bands | Same optical channel; S1 lists PM1's size range, so the KM-200 is assumed to report `rpm1c` |
| KM-201, KM-208 life | 21 months | The middle of S6's 18–24 months |
| On-board drift horizon | 730 days | Drift reaches its full share after two years without recalibration (RESET asks for annual recalibration, WELL every 3 years; S6) |

All T90s are multiples of the 5 s sampling interval, so a step reaches exactly 90% at T90.

## Consequences

- Every assumption is one constant, easy to replace when better evidence arrives (docs/09 R2, R4).
- The PM1 envelope and the Mini's `rpm1c` output stay provisional.

## Alternatives considered

- Instant response: simpler, but it hides a real effect that matters for short events (hand gel, door opening).
- Omitting PM1: the user's input includes PM1, and S1 lists a PM1 channel.
