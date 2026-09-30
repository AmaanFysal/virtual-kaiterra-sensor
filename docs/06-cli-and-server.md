# 06 · CLI and server

**Purpose:** the two ways to run the virtual sensor outside the care home: files in and out (CLI), and a Kaiterra-compatible HTTP API (server).

> Status: `fixtures:fetch` built (M1); the rest planned (M6, M8).

## CLI (`pnpm vks <command>`)

| Command | Status | Does |
|---|---|---|
| `fixtures:fetch` | built | Fetches `/devices/{id}`, `/top`, `/history` (1 min and `group_by=1h`) and a `/batch` from the public test Sensedge into `test/fixtures/kaiterra-api/live/`, with `.source.json` sidecars (`provenance: "live"`). Reads `KAITERRA_API_KEY` from the environment or `.env`; without it, prints how to add one and exits 0. The key is redacted from every log line, saved body and sidecar URL, raw or URL-encoded. |
| `generate` | M5/M6 | Scenario → true-air file |
| `convert` | M6 | True-air file + device config → readings in a chosen format |
| `report` | M7 | True vs sensed report |

The CLI is the only place that reads files, the environment or the wall clock (for example the `retrieved` date on fixtures).

## Kaiterra-compatible server (M8)

Same paths, parameters, pagination, batch and errors as `https://api.kaiterra.com/v1`, with `?key=` auth. Software written for the real API reads from it by changing only the base URL. Its clock is injected (a replay clock, or the plug-in host's sim time); the core never reads the wall clock.
