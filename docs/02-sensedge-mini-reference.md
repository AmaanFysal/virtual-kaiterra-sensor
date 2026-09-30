# 02 · Sensedge Mini reference

**Purpose:** everything the virtual device copies from the real one (specifications, API, BACnet, MQTT, modules), with a citation for every number. `packages/core/src/spec/` mirrors this doc; change both together.

> Status: researched 2026-09-30. No live API response or physical device yet: the API shapes rest on documentation and integration code (docs/09).

## Sources

| Id | Source | Notes |
|---|---|---|
| S1 | [Sensedge Mini (SE-200 & SE-200P) Technical Specifications](https://www.kaiterra.com/technical-specifications-sensedge-mini), web page | Current product page |
| S2 | [Sensedge Mini Technical Specifications (2024)](https://www.kaiterra.com/hubfs/Marketing%20Collateral/Technical%20Specifications/Sensedge%20Mini%20Technical%20Specifications%20(2024).pdf), PDF spec sheet | Disagrees with S1 on O3, NO2 and CO |
| S3 | [Kaiterra API documentation](https://dev.kaiterra.com), version 2025-02-26 | Endpoints, parameter names, units, examples |
| S4 | [Sensedge Mini BACnet PICS, February 2024](https://www.kaiterra.com/hubfs/CS%20Documentation/Kaiterra%20Sensedge%20Mini%20BACnet%20Protocol%20Implementation%20Conformance%20Statement%20-%20February%202024.pdf) | Firmware 2.4.5, models SE-200 and SE-200P |
| S5 | [Secondary MQTT Format Guide](https://support.kaiterra.com/secondary-mqtt-format) | Sensedge Mini Formats 1 and 2 |
| S6 | [When to replace your sensor modules (Sensedge Mini)](https://support.kaiterra.com/when-to-replace-your-sensor-modules-sensedge-mini) and [lifespan FAQ](https://support.kaiterra.com/how-often-do-i-need-to-change-the-sensedge-modules) | Module life, health percentage |
| S7 | KM-200 reseller listings (testmeter.sg, aetmos.com.au), as quoted in search results | **Secondary, unverified**: the pages returned 403 or did not resolve |

All retrieved 2026-09-30.

## Measurement specification

"±a ±b%" is read as additive: the allowed error at true value x is a + b·x. Bands are by true value.

| Parameter | API name, units (S3) | Technology | Range | Resolution | Accuracy S1 (web) | Accuracy S2 (PDF 2024) |
|---|---|---|---|---|---|---|
| PM2.5 | `rpm25c`, `µg/m³` | Laser scattering, 0.3–2.5 µm | 0–1,000 | 1 | ±3 (0–30); ±10% (30–1,000) | same |
| PM10 | `rpm10c`, `µg/m³` | Laser scattering, 0.3–10 µm | 0–1,000 | 1 | ±3 (0–30); ±15% (30–1,000) | same |
| PM1 | `rpm1c`, `µg/m³` | Laser scattering, 0.3–1.0 µm (S1) | not published | 1 | **not published**: PM2.5's accuracy is borrowed (ADR-0003) | not listed |
| CO2 | `rco2`, `ppm` | NDIR | 400–5,000; up to 10,000 extended | 1 | ±40 ppm ±3% | same (cites ASHRAE 62.1-2022) |
| TVOC | `tvoc` (`rtvoc` deprecated), `ppb` | Multi-pixel MOx, calibrated against ethanol, 22-VOC Mølhave mix | 0–1,382 ppb (0–5,482 µg/m³) | 1 µg/m³ | ±15% ±4 ppb (±15% ±18 µg/m³) | ±15% ±4 ppb |
| Temperature | `rtemp`, `C` | Digital | −40–125 °C | 0.01 | ±0.3 °C | same |
| Humidity | `rhumid`, `%` | Digital | 0–100 %RH | 0.01 | ±3 %RH | same |
| O3 | `ro3`, `ppb` | Electrochemical | S1 20–2,000; S2 0–2,000 | 1 | ±10% | ±10 ppb (0–100); ±10% (>100) |
| NO2 | `no2`, `ppb` | Electrochemical | 0–2,000 | 1 | ±20 ppb (0–100); ±20% (>100) | ±10 ppb (0–100); ±10% (>100) |
| CO | `co`, `ppm` | Electrochemical | 0–100 | 0.1 | ±1 ppm (0–10); ±10% (>10) | ±1 ppm (0–20); ±5% (>20) |

Notes:

- **TVOC is ±15% ±4 ppb** in both documents (not ±8). The ppb/µg/m³ factor 5,482/1,382 ≈ 3.967 comes from S1's paired ranges. S1's "±18 µg/m³" does not quite match ±4 ppb × 3.967 = 15.9 µg/m³; the model uses the ppb figure.
- **O3, NO2 and CO disagree** between S1 and S2. Both are kept; the spec profile chooses (ADR-0002): `web-page`, `pdf-2024`, `tighter` (smaller envelope and narrower range at each value), `looser` (larger and wider). **Default `looser`**, so downstream pipelines are tested against the worst documented accuracy.
- **Response times are not published**, except a secondary "typical 10 s" for the KM-200 PM module (S7). The rest are assumptions (ADR-0003): CO2 120 s (consistent with the Senseair S8 datasheet's "2 minutes by 90%", PSP0107 ed. 18), TVOC 60 s, electrochemical 60 s, humidity 300 s, temperature 600 s.
- **Resolution in the API.** The S3 examples show temperature and humidity with two decimals, TVOC with one (`435.6`), PM and CO2 as integers. TVOC is quantised to 1 µg/m³ and reported in ppb with one decimal.

## Device

| Item | Value | Source |
|---|---|---|
| Models | SE-200, SE-200P (PoE) | S1, S4 |
| Log intervals | 1 minute, 1 hour, 1 day | S1, S2 |
| Push interval | 1 minute | S1, S2 |
| Onboard memory | 1 hour of data | S1, S2 |
| Operating conditions | 0–50 °C, 5–95 %RH non-condensing | S1, S2 |
| Integrations | BACnet/IP, RS-485 Modbus/RTU, cloud MQTT, on-premise MQTT, open API | S1, S2 |

### Modules

Two hot-swappable bays (BACnet AI8/AI9 "KM20X Module Lifespan", S4). CO2, temperature and humidity are on the main board: Secondary MQTT Format 1 (S5) shows them without a module prefix.

| Module | Measures (S2) | API `source` | Life |
|---|---|---|---|
| KM-200 | PM2.5, PM10 (PM1 assumed, ADR-0003) | `km200` | 18–24 months (S6); 2 years below 100 µg/m³, 1.3 years above 200 µg/m³ (S7) |
| KM-201 | PM, TVOC | `km201` | not published: 21 months assumed |
| KM-203 | TVOC | `km203` | 18–24 months (S6) |
| KM-207 | TVOC, O3 | `km207` | 18–24 months (S6) |
| KM-208 | O3, NO2, CO | `km208` | not published: 21 months assumed |

S6: health is calculated from "hours of usage and concentration of pollutants"; replace below 10%; sensors "will continue to work, even if their sensor health is low (and even at 0%)" but lose their accuracy guarantee. RESET asks for annual recalibration or replacement; WELL, every 3 years.

S2 lists CO2 only on the "A/P" variants. The model's variants (`packages/core/src/spec/modules.ts`) are named by capability: `pm-tvoc` (no CO2), `pm-tvoc-co2` (default: KM-200 + KM-203), `well` (KM-201 + KM-208: adds O3, NO2, CO).

## Kaiterra API (S3)

- Base URL `https://api.kaiterra.com/v1`; auth by `?key=` (HTTPS only; keys must not be embedded in web pages or apps).
- `GET /devices/{id}`: `{id, name, model, firmware_version, home_region, handshake: {_device_ts, dmac_eth, dmac_wifi, dsn, modules: [{bay, serial, type, lifetime_pct}], ts}}`.
- `GET /devices/{id}/top`: latest reading per parameter.
- `GET /devices/{id}/history`: `begin`, `end` (RFC 3339, UTC), `limit`, `group_by` (`1m`, `5m`, `15m` or any divisor of 60 min; `1h`, `2h` or any divisor of 24 h; `1d`), `time_zone` (TZ database name, for hour/day boundaries), `aqi` (`us`, `in`, `cn`). Large results page with `_links.next`.
- `POST /batch`: up to 100 sub-requests `{method, relative_url}`; the response is `[{body: <JSON string>, code}]`.
- Reading series: `{param, source?, units, span, points: [{ts, value}]}`. `span` is the interval in seconds; `source` names the module.
- **Timestamps mark the end of the interval.** Hourly and daily averages appear only after their window closes. Fractional seconds are accepted and truncated. A time range more than an hour in the future is a 400.
- Errors: 400 bad request, 401 missing or rejected key, 403 not permitted, 404 device not found.
- Units: `ppm`, `ppb`, `µg/m³`, `mg/m³`, `C`, `F`, `x`, `%`, `lx`, `Pa`, `K`.
- `rtvoc` is deprecated in favour of `tvoc`, removal scheduled October 2027. The docs' own examples, and Home Assistant's integration, still use `rtvoc` (ADR-0004).
- Public test devices: Sensedge `00000000-0031-0101-0000-00007e57c0de` (an **SE-100**, not a Mini) and Laser Egg `00000000-0001-0101-0000-00007e57c0de`. Public Postman workspace: https://www.postman.com/kaiterra/workspace/demo.
- Integration code (not Kaiterra's docs) shows `?format=series_major`, a `units=` preference, an optional `aqi` inside points, and a legacy `/sensedges/{id}` endpoint whose `latest` object uses keys like `km100.rpm25c` and `rco2 (ppm)` (see `test/fixtures/kaiterra-api/README.md`).

## BACnet/IP (S4)

B-SS (Smart Sensor), BACnet protocol revision 14, IPv4, UDP 47808, foreign device supported, no segmentation, UTF-8. BIBBs: DS-RP-B, DS-WP-B, DS-RPM-B, DM-DDB-B, DM-DOB-B, DS-COV-B. Device object name "Kaiterra-SE-200", instance user-specified; optional properties Description, Location, Active_COV_Subscriptions.

| Object | Name |
|---|---|
| AI 1 | PM2.5 |
| AI 2 | PM10 |
| AI 3 | TVOC |
| AI 4 | Temperature |
| AI 5 | Humidity |
| AI 6 | CO2 |
| AI 7 | Unassigned |
| AI 8, AI 9 | KM20X Module Lifespan |
| AI 10 | O3 |

Analog inputs: optional Description, COV_Increment, Reliability; writable Units and COV_Increment. No NO2 or CO objects are listed.

## Secondary MQTT (S5)

Topic `kaiterra/device/history/+`; `ts` in Unix seconds; `dsn` and `dudid` identify the device.

- **Format 1** (raw): module-prefixed keys such as `km200.rpm25c`, `km200.rpm10c`, `km200.rgt03`, `km203.rtvocb (ppb)`, `km203.reco2 (ppm)`, `km207.r03`, plus `rco2 (ppm)`, `rhumid`, `rtemp`.
- **Format 2** (named): `data: {temperature, humidity, pm25, pm10, co2, tvoc, o3}` with `units: {C, %, ug/m3, ug/m3, ppm, ppb, ppb}`.

## Data export

The web app exports CSV at raw (1 per minute), hourly or daily frequency, emailed to the user ([support](https://support.kaiterra.com/how-can-i-view-and-export-the-data-on-the-sensedge-mini)). The column layout is not documented; a real sample is needed (docs/09).
