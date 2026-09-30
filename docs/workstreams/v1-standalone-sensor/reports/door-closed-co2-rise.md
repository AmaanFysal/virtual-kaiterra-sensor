# Validation report: door-closed-co2-rise

Two visitors with a resident in Room 1; the door is shut for three hours and CO2 climbs.

- Scenario: `data/scenarios/door-closed-co2-rise.json`, room Room1, 2026-11-03 14:01Z to 2026-11-03 19:00Z, generator seed "door-closed-co2-rise"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "door-closed-co2-rise"
- Spec profile: looser
- Condition effects on: none (healthy default)
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (2,100 of 2,100)
- Flagged readings: 0 of 2,100; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 300 | 0 | 100% | 100% | -0.9 | 0.9 | 1.0 | 0.9 | 0.65 | – | 0.1 |
| PM2.5 (µg/m³) | 300 | 0 | 100% | 100% | 0.5 | 0.5 | 0.6 | 0.5 | 0.54 | – | 0.1 |
| PM10 (µg/m³) | 300 | 0 | 100% | 100% | -0.2 | 0.4 | 0.5 | 0.4 | 0.39 | – | 0.1 |
| CO2 (ppm) | 300 | 0 | 100% | 100% | 14.2 | 15.0 | 18.7 | 15.1 | 0.43 | 0 | 0.9 |
| TVOC (ppb) | 300 | 0 | 100% | 100% | -1.26 | 1.29 | 1.45 | 1.28 | 0.41 | – | 0.4 |
| Temperature (°C) | 300 | 0 | 100% | 100% | -0.089 | 0.089 | 0.095 | 0.082 | 0.52 | – | 4.3 |
| Relative humidity (%) | 300 | 0 | 100% | 100% | 0.070 | 0.370 | 0.485 | 0.227 | 0.26 | 2 | 2.2 |

## Flags and condition effects

No reading was flagged: every reading is covered by the spec envelope.
## Scenario timeline

- 2026-11-03 14:30Z to 2026-11-03 17:30Z: door closed
- 3 occupancy and other instantaneous events (see the HTML report's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
