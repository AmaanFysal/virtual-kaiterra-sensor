# 05 · Output formats

**Purpose:** how readings are written in the real device's formats.

> Status: planned (M4). Reference material is in docs/02; provisional fixtures in `test/fixtures/kaiterra-api/`.

## Planned formatters

| Format | Shape | Evidence |
|---|---|---|
| Kaiterra API `GET /devices/{id}` | `{id, name, model, firmware_version, home_region, handshake{dsn, modules[{bay, serial, type, lifetime_pct}], ts, ...}}` from `device.status()` | docs example (fixture `devices-get`) |
| Kaiterra API `top` and `history` | `{data: [{param, source?, units, span, points[{ts, value}]}]}`; `group_by` means labelled by interval end, windows closed only; `_links.next` pagination | docs examples (fixtures `devices-top`, `devices-history*`) |
| Kaiterra API `batch` | `[{body: <JSON string>, code}]` | docs example |
| Secondary MQTT Format 1 and 2 | docs/02 | Kaiterra support page (fixtures `mqtt-secondary-format*`) |
| BACnet object view | AI 1–10 per the PICS with Present_Value, Reliability (warm-up → unreliable), COV_Increment, Units | PICS (S4) |
| CSV | Own documented columns until a real export sample exists | none (docs/09) |

## Rules

- Values are exactly the device's reported values; the side channel (reference, truth, envelope, flags) never appears.
- Readings not yet delivered (`deliveredAt` in the future of the query time) are invisible to `top` and `history`.
- TVOC reading name(s) per ADR-0004: `tvoc` and `rtvoc` both, by default, with a per-device option.
- `source` is the module (`km200`, `km203`, …) for module parameters and absent for CO2, temperature and humidity.
