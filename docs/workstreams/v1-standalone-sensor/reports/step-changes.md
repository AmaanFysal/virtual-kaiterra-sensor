# Validation report: step-changes

Held step changes in every quantity, without jitter, to measure the sensor's response time against T90.

- Scenario: `data/scenarios/step-changes.json`, room Room1, 2026-11-03 12:01Z to 2026-11-03 16:00Z, generator seed "step-changes"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "step-changes"
- Spec profile: looser
- Condition effects on: none (healthy default)
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (1,680 of 1,680)
- Flagged readings: 0 of 1,680; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 240 | 0 | 100% | 100% | 2.2 | 2.2 | 2.9 | 2.2 | 0.53 | 0 | 0.1 |
| PM2.5 (µg/m³) | 240 | 0 | 100% | 100% | -3.4 | 3.4 | 4.7 | 3.4 | 0.67 | 0 | 0.1 |
| PM10 (µg/m³) | 240 | 0 | 100% | 100% | 1.1 | 1.4 | 2.8 | 1.3 | 0.33 | 0 | 0.1 |
| CO2 (ppm) | 240 | 0 | 100% | 100% | 33.7 | 42.8 | 76.6 | 33.7 | 0.70 | 1 | 0.9 |
| TVOC (ppb) | 240 | 0 | 100% | 100% | 4.70 | 7.91 | 19.68 | 5.91 | 0.31 | 0 | 0.4 |
| Temperature (°C) | 240 | 0 | 100% | 100% | 0.042 | 0.249 | 0.759 | 0.045 | 0.40 | 3 | 4.3 |
| Relative humidity (%) | 240 | 0 | 100% | 100% | -0.085 | 0.755 | 2.516 | 0.244 | 0.29 | 2 | 2.2 |

## Flags and condition effects

No reading was flagged: every reading is covered by the spec envelope.
## Scenario timeline

- 3 occupancy and other instantaneous events (the HTML report, from `pnpm vks report`, shows them in each chart's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
