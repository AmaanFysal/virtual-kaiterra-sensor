# 06 · CLI and server

**Purpose:** the two ways to run the virtual sensor outside the care home: files in and out (CLI), and a Kaiterra-compatible HTTP API (server).

> Status: CLI built (M1 `fixtures:fetch`; M6 `scenarios`, `generate`, `convert`; M7 `report`; M8 `serve`); server built (M8, 2026-09-30).

## CLI (`pnpm vks <command>`)

The CLI is the only place that reads files, the environment or the wall clock. Relative paths resolve against the directory `pnpm` was run from. Output goes to stdout unless `--out` is given; use `pnpm -s vks …` to keep pnpm's banner out of piped output. Exit codes: 0 success, 1 failure, 2 usage error.

| Command | Does |
|---|---|
| `scenarios` | Lists `data/scenarios` with room, length and description |
| `generate --scenario <id\|path> [--seed S] [--out f.csv\|f.jsonl] [--format csv\|jsonl]` | Runs the generator; the seed defaults to the scenario id |
| `convert (--input <true-air file> \| --scenario <id\|path>) [--device <config.json>] [--seed S] [--as-of T] [--format F] [--out f]` | Runs the virtual device over the true air and writes format F |
| `report --scenario <id\|path> [--seed S] [--device f] [--out-dir d]` or `report --all` | True vs sensed validation report (docs/08): HTML with charts (gitignored), Markdown and a statistics JSON (committed); `--all` writes every scenario and an index to `docs/workstreams/v1-standalone-sensor/reports/` |
| `serve …` | Kaiterra-compatible HTTP server (below) |
| `fixtures:fetch` | Replaces the provisional API fixtures with live ones when `KAITERRA_API_KEY` is set (M1). Without a key it prints how to add one and exits 0; with one, the key is redacted from every log line and saved file. |

`convert` formats:
- `readings`: JSON Lines with the side channel (this project's analysis format)
- `kaiterra-top`, `kaiterra-device`, `kaiterra-history` (with `--group-by`, `--time-zone`, `--begin`, `--end`, `--limit`)
- `mqtt1`, `mqtt2`: JSON Lines of `{topic, published_at, payload}`
- `bacnet`
- `csv` (with `--frequency raw|hourly|daily`)

`--as-of` (default: the last true-air timestamp) is the query time: readings delivered later are not shown, as with the real API.

Device config comes from, in order: defaults (id `5e200000-0000-4000-8000-000000000001`, seed `1`), the scenario's `device` settings, the `--device` file (a `DeviceConfigInput` whose event `t` may be RFC 3339 or Unix seconds), then `--seed`. Examples: `data/devices/room1.json`, `data/devices/lounge-well.json`.

```sh
pnpm vks generate --scenario door-closed-co2-rise --out out/door.csv
pnpm -s vks convert --input out/door.csv --device data/devices/room1.json --format kaiterra-history --group-by 1h
pnpm -s vks convert --scenario hand-gel-tvoc-spikes --format mqtt2 > out/gel.jsonl
```

## Kaiterra-compatible server (M8, ADR-0010)

`pnpm -s vks serve` starts an HTTP server with the same paths, parameters, pagination, batch, errors and `?key=` auth as `https://api.kaiterra.com/v1`. Software written for the real API reads from it by changing only the base URL. Checked with the unmodified `kaiterra-async-client` (the library Home Assistant's integration uses): `tools/kaiterra-client-check/check.py`.

```sh
pnpm -s vks serve --scenario door-closed-co2-rise --scenario ensuite-shower-humid --key demo
curl 'http://127.0.0.1:8790/v1/devices/<id>/top?key=demo'
curl 'http://127.0.0.1:8790/v1/devices/<id>/history?key=demo&group_by=1h&time_zone=Europe/London'
curl -X POST 'http://127.0.0.1:8790/v1/batch?key=demo' -H 'Content-Type: application/json' -d '[{"method":"GET","relative_url":"/devices/<id>/top"}]'
```

| Option | Meaning |
|---|---|
| `--scenario <id\|path>` (repeatable) | One virtual device per scenario, with the scenario's device settings. The id is derived from the scenario (`5e200000-0000-4000-8000-…`, printed at start) |
| `--input <true-air file> [--device <config>]` | One device replaying a true-air file; the id comes from the config |
| `--key K` (repeatable) | Accepted keys; without it, any non-empty `?key=` is accepted |
| `--clock fixed` (default) `[--start T]` | "Now" is fixed: the end of the data, or `T` |
| `--clock replay [--speed 60] [--start T]` | "Now" runs from the start of the data (or `T`) at `speed`× real time, and holds at the end |
| `--port 8790 --host 127.0.0.1` | Where to listen (8790 by default, clear of the care home's server on 8787 and its test servers on 8788) |
| `--cors` | Adds `Access-Control-Allow-*` headers for browser dashboards |

Behaviour:

- **Replay:** each request replays the devices up to "now" (`ReplayDevice`, never backwards). A reading appears only once delivered, and `GET /devices/{id}` shows module health and the handshake as of that moment.
- **Bodies:** `POST /v1/batch` bodies over 1 MiB get a 413; invalid JSON gets a 400.
- **Extras outside the Kaiterra API:** `GET /` lists the devices and the current simulated time; every `/v1` response carries `X-Vks-As-Of`.
- **Library use:** `@vks/server` exports `createKaiterraServer({devices, clock, apiKeys, cors})`, `fixedClock` and `replayClock`, for embedding (e.g. the care home adapter, M9, which is on hold).
