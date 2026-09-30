# Research notes: sources

Everything consulted on 2026-09-30, with what each gave us and how far it can be trusted. docs/02 holds the numbers.

## Kaiterra

| Source | Used for | Trust |
|---|---|---|
| S1 web tech specs, https://www.kaiterra.com/technical-specifications-sensedge-mini | Ranges, resolution, accuracy, logging, modules | Primary, current |
| S2 2024 spec sheet PDF | Same, and variant availability (CO2 on A/P variants), module list | Primary, dated; disagrees with S1 on O3/NO2/CO |
| S3 https://dev.kaiterra.com (2025-02-26) | Endpoints, parameters, units, examples, test devices | Primary; examples predate the `tvoc` rename |
| S4 BACnet PICS, February 2024 | Object list, BIBBs, device profile | Primary (read as the PDF) |
| S5 https://support.kaiterra.com/secondary-mqtt-format | MQTT Formats 1 and 2 for the Mini | Primary |
| S6 support pages on module life | 18–24 months, health %, RESET/WELL intervals | Primary |
| S7 reseller listings for the KM-200 | 10 s response; 1.3 vs 2 years by exposure | Secondary: quoted by search results, pages not reachable |
| https://github.com/kaiterra/api | Example script: legacy `/sensedges/{id}` and `latest` keys | Primary, old |
| https://www.postman.com/kaiterra/workspace/demo | Not read: needs a browser | none |

## Integration code

| Source | Used for |
|---|---|
| Home Assistant `homeassistant/components/kaiterra/api_data.py` | Reads `points[0].value`, optional `aqi`; `rtvoc`, `rpm25c`, `rpm10c`, `rco2` |
| `kaiterra-async-client` (github.com/Michsior14/python-kaiterra-async-client) | Batch sub-requests with `format=series_major`, `aqi`, `units`; parses `data`/`latest`/`info.aqi`; unit enum |
| InnerCore.Api.Kaiterra (github.com/MadMonkey87/InnerCore.Api.Kaiterra) | `SenseEdgeData` keys for the legacy endpoint |

## Sensor behaviour literature

| Source | Used for |
|---|---|
| Senseair S8 Residential product specification PSP0107 ed. 18 | Response 2 min to 90% (a typical NDIR T90) |
