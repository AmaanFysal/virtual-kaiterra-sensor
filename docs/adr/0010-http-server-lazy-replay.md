# ADR 0010: The HTTP server wraps the pure router and replays devices lazily to a clock

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/06-cli-and-server.md, docs/03-sensor-model.md, docs/09-risks-and-debt.md

## Context

M8 must serve the Kaiterra API over HTTP so software written for api.kaiterra.com works against the virtual sensor by changing only the base URL. The routing and every response body already exist as the pure `kaiterraApi` (M4). The API answers "as of now". A reading exists only once delivered, and `GET /devices/{id}` reports module health and the last handshake at that moment. The core must never read a clock.

## Decision

We will build `@vks/server` on `node:http` with no framework. It strips `/v1` and hands the request to `kaiterraApi`. A `SimClock` supplies "now" for each request:

- `fixed`: the end of the data, or `--start`.
- `replay`: runs from the start of the data at `--speed`× real time and holds at the end.

Devices are `ReplayDevice`s (core): each request steps them lazily up to "now" and never backwards. Readings, module health, the offline buffer and handshake times are therefore exactly as of that moment. Batch `simulate` uses the same replay path, so both give identical readings (the golden hashes did not move). `vks serve` builds the devices from scenarios or true-air files and starts the server.

## Consequences

- One implementation of the API: the HTTP layer adds only transport, body limits (413), optional CORS, a non-Kaiterra index at `/` and an `X-Vks-As-Of` header.
- Lazy replay makes memory grow with the data served so far (about 280,000 readings for a four-week scenario), which is fine for a test server.
- The replay clock uses wall time, which is allowed in `apps/` and injectable for tests.
- The care home adapter (M9, on hold) can drive the same devices from its own clock instead of a replay clock.

## Alternatives considered

- Fastify, as in the care home server: more than a single-route JSON wrapper needs.
- Precomputing every reading at start-up: simpler, but device status would always show the end of the run rather than "now".
