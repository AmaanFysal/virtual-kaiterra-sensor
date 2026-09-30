# 06 · CLI and server

**Purpose:** the two ways to run the virtual sensor outside the care home: files in and out (CLI), and a Kaiterra-compatible HTTP API (server).

> Status: CLI built (M1 `fixtures:fetch`; M6 `scenarios`, `generate`, `convert`; M7 `report`); server planned (M8).

## CLI (`pnpm vks <command>`)

The CLI is the only place that reads files, the environment or the wall clock. Relative paths resolve against the directory `pnpm` was run from. Output goes to stdout unless `--out` is given; use `pnpm -s vks …` to keep pnpm's banner out of piped output. Exit codes: 0 success, 1 failure, 2 usage error.

| Command | Does |
|---|---|
| `scenarios` | Lists `data/scenarios` with room, length and description |
| `generate --scenario <id\|path> [--seed S] [--out f.csv\|f.jsonl] [--format csv\|jsonl]` | Runs the generator; the seed defaults to the scenario id |
| `convert (--input <true-air file> \| --scenario <id\|path>) [--device <config.json>] [--seed S] [--as-of T] [--format F] [--out f]` | Runs the virtual device over the true air and writes format F |
| `report --scenario <id\|path> [--seed S] [--device f] [--out-dir d]` or `report --all` | True vs sensed validation report, HTML with charts and Markdown (docs/08); `--all` writes every scenario and an index to `docs/workstreams/v1-standalone-sensor/reports/` |
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

## Kaiterra-compatible server (M8)

Same paths, parameters, pagination, batch and errors as `https://api.kaiterra.com/v1`, with `?key=` auth. The routing and every response body are already built and tested in the core (`kaiterraApi`, docs/05); the server adds HTTP, keys and the clock. Software written for the real API reads from it by changing only the base URL. Its clock is injected (a replay clock, or the plug-in host's sim time); the core never reads the wall clock.
