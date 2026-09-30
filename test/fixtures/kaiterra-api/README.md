# Kaiterra API fixtures

**Provisional.** No live API key or Sensedge Mini is available yet, so these files come from
Kaiterra's published documentation and from open-source code that parses real responses. They
pin the response *shape*; they are not verified against a live API (docs/09-risks-and-debt.md).

Each `<name>.json` has a `<name>.source.json` sidecar:
`{ provenance: "from docs" | "from integration code" | "live", url, retrieved, provisional, note }`.

| Fixture | Provenance | What it pins |
|---|---|---|
| `devices-get` | from docs | Device metadata: model, firmware, `handshake.modules[{bay, serial, type, lifetime_pct}]` |
| `devices-top` | from docs | Latest reading per parameter: `{param, source?, units, span, points[{ts, value}]}` |
| `devices-history` | from docs | History, 1-minute span |
| `devices-history-paginated` | from docs | `_links.next` pagination |
| `devices-history-1h` | from docs | `group_by=1h` averages (span 3600) |
| `batch-request`, `batch-response` | from docs | `POST /batch`: sub-responses are `{body: <JSON string>, code}` |
| `mqtt-secondary-format1`, `-format2` | from docs | Sensedge Mini Secondary MQTT payloads |
| `sensedges-legacy` | from integration code | Legacy `/sensedges/{id}` `latest` shape; values borrowed from the batch example |

Evidence from integration code that is not a fixture:

- Home Assistant's `kaiterra` integration (`homeassistant/components/kaiterra/api_data.py`) reads
  `points[0].value` and an optional `points[0].aqi` for `rpm25c`, `rpm10c`, `rtvoc` and `rco2`.
- `kaiterra-async-client` (`kaiterra_async_client/client.py`) sends batch sub-requests with
  `?format=series_major[&aqi=..][&units=..]`, reads `data` (or legacy `latest` / `info.aqi`),
  requires `param`, `units`, `points`, reads `source` when present, and knows the unit strings
  `?`, `x`, `%`, `C`, `F`, `mg/m³`, `µg/m³`, `ppm`, `ppb`.
- Kaiterra's public Postman workspace (https://www.postman.com/kaiterra/workspace/demo) needs a
  browser to read and was not used.

## Replacing them with live responses

Put `KAITERRA_API_KEY=...` in `.env` (gitignored) and run `pnpm vks fixtures:fetch`. It saves
responses from the public test Sensedge to `live/` with `provenance: "live"`, with the key
redacted everywhere. Without a key it does nothing and says so. Live fixtures take precedence.
