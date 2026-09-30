# Validation report: lounge-afternoon

The Lounge after lunch: residents and staff, family visitors from 14:00, tea and toast at 15:00.

- Scenario: `data/scenarios/lounge-afternoon.json`, room Lounge, 2026-11-03 12:01Z to 2026-11-03 18:00Z, generator seed "lounge-afternoon"
- Device: Lounge (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "lounge-afternoon"
- Spec profile: looser
- Condition effects on: none (healthy default)
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (2,520 of 2,520)
- Flagged readings: 0 of 2,520; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 360 | 0 | 100% | 100% | 0.0 | 0.3 | 0.4 | 0.3 | 0.32 | 0 | 0.1 |
| PM2.5 (µg/m³) | 360 | 0 | 100% | 100% | 1.2 | 1.2 | 1.3 | 1.2 | 0.64 | 1 | 0.1 |
| PM10 (µg/m³) | 360 | 0 | 100% | 100% | 1.1 | 1.1 | 1.1 | 1.1 | 0.63 | 0 | 0.1 |
| CO2 (ppm) | 360 | 0 | 100% | 100% | -7.2 | 8.1 | 9.9 | 7.6 | 0.37 | 2 | 0.9 |
| TVOC (ppb) | 360 | 0 | 100% | 100% | 1.20 | 1.22 | 1.39 | 1.22 | 0.40 | – | 0.4 |
| Temperature (°C) | 360 | 0 | 100% | 100% | -0.156 | 0.156 | 0.165 | 0.138 | 0.72 | 13 | 4.3 |
| Relative humidity (%) | 360 | 0 | 100% | 100% | 1.295 | 1.295 | 1.334 | 1.269 | 0.67 | – | 2.2 |

## Flags and condition effects

No reading was flagged: every reading is covered by the spec envelope.
## Scenario timeline

- 2026-11-03 15:00Z to 2026-11-03 15:10Z: cooking
- 6 occupancy and other instantaneous events (the HTML report, from `pnpm vks report`, shows them in each chart's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
