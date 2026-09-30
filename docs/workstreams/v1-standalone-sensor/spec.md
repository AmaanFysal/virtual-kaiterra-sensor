# Workstream spec: v1 (a standalone virtual Sensedge Mini)

**Goal:** a deterministic virtual Kaiterra Sensedge Mini that turns true air into what the real device would report, in its real formats, runnable standalone now and pluggable into the care home simulation later.

Source: the approved plan (discussion of 2026-09-30); references in docs/02.
Status: **agreed 2026-09-30**

## In scope

- The Sensedge Mini's published specification, cited, with both documents where they disagree.
- A bounded error model (bias, drift with module-replacement resets, noise), sensor lag, 1-minute reporting, dropouts, offline periods with the 1-hour buffer; all seeded and configurable per device.
- Optional condition-dependent errors (PM humidity, MOx humidity/temperature/ethanol and baseline, NDIR ABC), warm-up and outliers.
- Output formats: Kaiterra API JSON, Secondary MQTT Formats 1 and 2, a BACnet object view, CSV.
- A CLI (convert, generate, report, fixtures:fetch) and a Kaiterra-compatible HTTP server.
- A synthetic true-air generator as a standalone test tool.
- A validation report comparing true and sensed values.
- The plug-in interface design for the care home, with an in-process adapter and a mock host.

## Decisions (2026-09-30)

1. Spec profiles `web-page | pdf-2024 | tighter | looser`, default `looser`; TVOC ±15% ±4 ppb (ADR-0002).
2. The TVOC name follows the best available evidence: both `tvoc` and `rtvoc` until a live response shows otherwise (ADR-0004).
3. The sim owns the air model; the sensor measures host-supplied air; the generator is a test tool only (ADR-0006).
4. BACnet: object view now, UDP server as the M10 stretch (ADR-0007).
5. Condition effects and outliers are optional and off by default, flagged in a side channel; the healthy default stays in envelope (ADR-0008).
6. No API key or device for now: fixtures are provisional (docs, integration code), each tagged with its provenance; the format is unverified against a live API (docs/09 R1).
7. Care home time: sim t = 0 = Unix 1793577600; t = 108000 = Tue 2026-11-03 06:00 (ADR-0001).

## Acceptance for each sub-milestone

| # | Done when |
|---|---|
| M0 | `pnpm install` sets the hooks path; the hook rejects an attribution message; CI and attribution workflows exist; the determinism guard passes; CLAUDE.md, docs 00–09, ADR template and workstream files exist |
| M1 | docs/02 spec table with citations mirrored in `core/spec`; provisional fixtures with provenance sidecars; `fixtures:fetch` works without a key (tested) and never leaks one (tested); docs/09 records the unverified format |
| M2 | Sample → lag → bounded error → mean → clamp → quantise; in-envelope property test for every profile; lag follows T90; golden hashes |
| M3a | Module aging and replacement, dropouts, offline buffering with backfill, power; seeded and configurable |
| M3b | Each condition effect, warm-up and outliers off by default, cited or in an ADR, tested with inline series; the envelope property test stays green |
| M4 | API JSON validated against the fixtures; MQTT F1/F2; BACnet view; CSV |
| M5 | Generator scenarios give plausible curves; sanity tests; golden output per seed |
| M6 | `vks generate`, `convert`, `report` end to end |
| M7 | HTML and Markdown report, including a section per condition effect |
| M8 | Kaiterra-compatible server passes contract tests against the fixtures |
| M9 | Plug-in adapter and mock host on the care home clock |
| M10 (stretch) | BACnet/IP UDP server |

## Out of scope

- A room air model for the care home (the sim owns it).
- Kaiterra's cloud features beyond the public API (dashboards, alerts, AQI calculation beyond passing `aqi` through, if at all).
- Modbus/RTU.
