# Validation report: cleaning-tvoc-spike

A carer cleans Room 1 with a spray cleaner for ten minutes, then the window is opened for half an hour.

- Scenario: `data/scenarios/cleaning-tvoc-spike.json`, room Room1, 2026-11-03 10:01Z to 2026-11-03 13:00Z, generator seed "cleaning-tvoc-spike"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "cleaning-tvoc-spike"
- Spec profile: looser
- Condition effects on: none (healthy default)
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (1,260 of 1,260)
- Flagged readings: 0 of 1,260; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 180 | 0 | 100% | 100% | 0.7 | 0.7 | 0.8 | 0.7 | 0.53 | – | 0.1 |
| PM2.5 (µg/m³) | 180 | 0 | 100% | 100% | 0.5 | 0.6 | 0.6 | 0.6 | 0.40 | – | 0.1 |
| PM10 (µg/m³) | 180 | 0 | 100% | 100% | 0.7 | 0.7 | 0.8 | 0.7 | 0.51 | – | 0.1 |
| CO2 (ppm) | 180 | 0 | 100% | 100% | -4.2 | 5.1 | 6.3 | 5.2 | 0.31 | – | 0.9 |
| TVOC (ppb) | 180 | 0 | 100% | 100% | 1.45 | 3.00 | 5.27 | 1.83 | 0.34 | 0 | 0.4 |
| Temperature (°C) | 180 | 0 | 100% | 100% | -0.052 | 0.336 | 0.437 | 0.092 | 0.54 | 4 | 4.3 |
| Relative humidity (%) | 180 | 0 | 100% | 100% | 0.823 | 0.893 | 0.977 | 0.737 | 0.49 | 4 | 2.2 |

## Flags and condition effects

No reading was flagged: every reading is covered by the spec envelope.
## Scenario timeline

- 2026-11-03 10:30Z to 2026-11-03 10:40Z: cleaning
- 2026-11-03 11:00Z to 2026-11-03 11:30Z: window open
- 2 occupancy and other instantaneous events (the HTML report, from `pnpm vks report`, shows them in each chart's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
