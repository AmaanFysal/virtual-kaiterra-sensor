# 05 · Output formats

**Purpose:** how readings are written in the real device's formats.

> Status: built in M4 (2026-09-30). Code: `packages/core/src/formats/`. Evidence: docs/02 and the provisional fixtures in `test/fixtures/kaiterra-api/` (docs/09 R1). Every choice the evidence does not settle is listed in docs/09 ("Format guesses").

## Rules for every format

- Values are exactly the device's reported values. The side channel (`reference`, `truth`, `envelope`, `flags`, `deliveredAt`) never appears; a test checks every format.
- Cloud formats (API, MQTT, CSV) see a reading only once it is delivered (`deliveredAt <= asOf`). BACnet is local, so it sees every reading produced up to `asOf`.
- TVOC is reported as both `tvoc` and `rtvoc` by default (ADR-0004); `identity.tvocNames` narrows it.
- `source` is the module (`km200`, `km203`, …) for module parameters and absent for CO2, temperature and humidity.
- Formatters are pure functions of the device config, its readings, its status and `asOf`.

## Kaiterra API (`kaiterra-api.ts`)

`kaiterraApi(ctx, request)` routes a request exactly as `https://api.kaiterra.com/v1` would, with no HTTP: the M8 server only wraps it. `ctx` holds the devices (config, readings, status), `asOf` and optionally the accepted keys.

| Request | Response |
|---|---|
| `GET /devices/{id}` | `{id, name, model: "SE-200", firmware_version: "2.4.5", home_region, handshake: {_device_ts, dmac_eth, dmac_wifi, dsn, modules: [{bay, serial, type, lifetime_pct}], ts}}`. Same key order and types as the fixture. `handshake` time is the last start, power-on or reconnect. |
| `GET /devices/{id}/top` | `{data: [{param, source?, units, span, points: [{ts, value}]}]}`: the latest delivered reading per API name, series sorted by name as in the docs' examples |
| `GET /devices/{id}/history` | Same series shape. Raw 1-minute points by default. `group_by` averages closed windows labelled by their end, rounded to one decimal (two for temperature and humidity). `time_zone` aligns hour and day windows, including DST. `begin`/`end` bound point timestamps (inclusive). Pages go back in time: a page holds the latest `limit` points, and `_links.next` has the same window length ending one span before them. |
| `POST /batch` | `[{body: <JSON string>, code}]`. Up to 100 GETs of `/devices/{id}`, `/top` or `/history`; sub-requests inherit the parent's key. |

Errors: 401 missing or rejected key; 404 unknown device or path; 405 wrong method; 400 for bad `begin`/`end`/`limit`/`group_by`/`time_zone`, `end` more than an hour ahead of `asOf`, or a bad batch. Error bodies are `{message}`. UDIDs match case-insensitively, with or without dashes. `format`, `units` and `aqi` are accepted and ignored.

Identifiers are stable per seed (`identity.ts`): DSN `KG2` + 8 digits (as in the Mini's MQTT example), locally administered MACs, module serials `VH` + 8 digits.

## Secondary MQTT (`mqtt.ts`)

`mqttMessages(config, readings, 1 | 2)` returns one message per interval, `{topic, publishedAt, payload}`, in publishing order. The topic is `kaiterra/device/history/{udid}`. Backfilled intervals are published on reconnect with their own `ts`.

- **Format 1**: `{ts, dsn, dudid, data}`. `data` keys are sorted, as in the guide: `km200.rpm25c`, `km200.rpm10c`, `km203.rtvocb (ppb)`, `km207.r03`, `rco2 (ppm)`, `rhumid`, `rtemp` (from S5). `rpm1c`, `rno2 (ppb)` and `rco (ppm)` are guesses.
- **Format 2**: `{ts, dsn, dudid, data, units}` with the guide's names and order (`temperature`, `humidity`, `pm25`, `pm10`, `co2`, `tvoc`, `o3`) and units (`C`, `%`, `ug/m3`, `ppm`, `ppb`). `pm1`, `no2` and `co` are appended as guesses.

## BACnet object view (`bacnet.ts`, ADR-0007)

`bacnetView(config, status, readings, asOf)` gives:

- **Device object**: `Kaiterra-SE-200`, vendor Kaiterra, firmware 2.4.5, protocol revision 14, instance from config or seed.
- **Analog inputs from the PICS**: AI 1 PM2.5, 2 PM10, 3 TVOC, 4 Temperature, 5 Humidity, 6 CO2, 7 Unassigned, 8–9 KM20X Module Lifespan (bays 0 and 1, `lifetime_pct`), 10 O3. Objects for parameters the variant lacks are left out (the PICS marks AIs as dynamically creatable and deletable).

Properties: Present_Value (the latest reading), Units (EngineeringUnits name and number), Status_Flags, Reliability (`unreliable-other` during warm-up, `no-sensor` for AI 7 or before the first reading), Out_Of_Service false, COV_Increment. PM1, NO2 and CO have no PICS object and are not exposed.

## CSV (`csv.ts`)

`csvExport(config, readings, {asOf, frequency: raw | hourly | daily, timeZone})`: our own layout until a real export is seen (docs/09 R6). The header is `Timestamp (UTC)` then `<Label> (<API units>)` per parameter. Each row is an interval end; hourly and daily values equal the API's `group_by` averages.
