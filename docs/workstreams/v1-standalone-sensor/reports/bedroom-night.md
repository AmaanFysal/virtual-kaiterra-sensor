# Validation report: bedroom-night

A resident's evening and night in Room 1: awake, a carer's bedtime visit, door closed for sleep, a 02:00 check, morning care.

- Scenario: `data/scenarios/bedroom-night.json`, room Room1, 2026-11-03 20:01Z to 2026-11-04 08:00Z, generator seed "bedroom-night"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "bedroom-night"
- Spec profile: looser
- Condition effects on: none (healthy default)
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (5,040 of 5,040)
- Flagged readings: 0 of 5,040; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 720 | 0 | 100% | 100% | 0.7 | 0.7 | 0.8 | 0.7 | 0.59 | – | 0.1 |
| PM2.5 (µg/m³) | 720 | 0 | 100% | 100% | 0.7 | 0.7 | 0.8 | 0.7 | 0.57 | – | 0.1 |
| PM10 (µg/m³) | 720 | 0 | 100% | 100% | -0.3 | 0.4 | 0.5 | 0.4 | 0.46 | – | 0.1 |
| CO2 (ppm) | 720 | 0 | 100% | 100% | -30.9 | 30.9 | 31.7 | 30.5 | 0.70 | 13 | 0.9 |
| TVOC (ppb) | 720 | 0 | 100% | 100% | 2.75 | 2.75 | 2.84 | 2.75 | 0.62 | – | 0.4 |
| Temperature (°C) | 720 | 0 | 100% | 100% | 0.012 | 0.025 | 0.031 | 0.026 | 0.30 | – | 4.3 |
| Relative humidity (%) | 720 | 0 | 100% | 100% | 0.856 | 0.857 | 0.914 | 0.854 | 0.54 | 3 | 2.2 |

## Flags and condition effects

No reading was flagged: every reading is covered by the spec envelope.
## Scenario timeline

- 2026-11-03 22:00Z to 2026-11-04 02:00Z: door closed
- 2026-11-04 02:05Z to 2026-11-04 07:00Z: door closed
- 9 occupancy and other instantaneous events (see the HTML report's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
