# Validation report: poorly-ventilated-weeks

Four weeks in a poorly ventilated Room 1 with the door mostly shut: CO2 never gets near outdoor levels, so NDIR automatic baseline calibration drifts low (ABC on).

- Scenario: `data/scenarios/poorly-ventilated-weeks.json`, room Room1, 2026-11-03 00:01Z to 2026-12-01 00:00Z, generator seed "poorly-ventilated-weeks"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "poorly-ventilated-weeks"
- Spec profile: looser
- Condition effects on: abc
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (253,440 of 253,440)
- Flagged readings: 28,800 of 282,240; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 40,320 | 0 | 100% | 100% | 0.6 | 0.6 | 0.7 | 0.6 | 0.58 | – | 0.1 |
| PM2.5 (µg/m³) | 40,320 | 0 | 100% | 100% | 0.5 | 0.5 | 0.6 | 0.5 | 0.53 | – | 0.1 |
| PM10 (µg/m³) | 40,320 | 0 | 100% | 100% | -0.2 | 0.3 | 0.4 | 0.3 | 0.43 | – | 0.1 |
| CO2 (ppm) | 40,320 | 0 | 100% | 74.3% | -47.8 | 57.3 | 71.0 | 57.3 | 0.45 | – | 0.9 |
| TVOC (ppb) | 40,320 | 0 | 100% | 100% | -0.25 | 0.66 | 0.82 | 0.66 | 0.29 | – | 0.4 |
| Temperature (°C) | 40,320 | 0 | 100% | 100% | 0.148 | 0.148 | 0.151 | 0.148 | 0.76 | – | 4.3 |
| Relative humidity (%) | 40,320 | 0 | 100% | 100% | 0.503 | 0.515 | 0.587 | 0.514 | 0.42 | 2 | 2.2 |

## Flags and condition effects

### abc-offset

NDIR automatic baseline calibration assumes the lowest reading of each 8-day period is 400 ppm; in rooms that never get fresh air it drifts low.

- Parameters: CO2 (ppm)
- 28,800 readings in 1 period; largest excess beyond the envelope: 75.77
  - CO2 (ppm): 2026-11-11 00:00Z to 2026-12-01 00:00Z (28800 readings, mean excess 10.59)

## Scenario timeline

- 2026-11-03 00:00Z to 2026-12-01 00:00Z: door closed
- 169 occupancy and other instantaneous events (the HTML report, from `pnpm vks report`, shows them in each chart's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
