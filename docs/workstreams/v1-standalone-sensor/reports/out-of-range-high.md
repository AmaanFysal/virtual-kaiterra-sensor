# Validation report: out-of-range-high

Air beyond the sensor's ranges: a PM2.5 of 1,500, CO2 in the extended range, TVOC over 1,382 ppb.

- Scenario: `data/scenarios/out-of-range-high.json`, room Room1, 2026-11-03 12:01Z to 2026-11-03 15:00Z, generator seed "out-of-range-high"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "out-of-range-high"
- Spec profile: looser
- Condition effects on: none (healthy default)
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (1,200 of 1,200)
- Flagged readings: 60 of 1,260; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 180 | 0 | 100% | 98.9% | -7.4 | 7.4 | 20.6 | 7.4 | 0.55 | 0 | 0.1 |
| PM2.5 (µg/m³) | 180 | 0 | 100% | 95.6% | -18.3 | 18.3 | 65.7 | 18.3 | 0.56 | 0 | 0.1 |
| PM10 (µg/m³) | 180 | 0 | 100% | 96.1% | -15.6 | 25.2 | 101.5 | 25.0 | 0.54 | 0 | 0.1 |
| CO2 (ppm) | 180 | 0 | 100% | 100% | 12.6 | 67.3 | 243.9 | 14.3 | 0.38 | 1 | 0.9 |
| TVOC (ppb) | 180 | 0 | 100% | 89.4% | -93.82 | 98.90 | 309.37 | 94.70 | 0.34 | 0 | 0.4 |
| Temperature (°C) | 180 | 0 | 100% | 100% | 0.016 | 0.027 | 0.034 | 0.027 | 0.30 | – | 4.3 |
| Relative humidity (%) | 180 | 0 | 100% | 100% | -0.827 | 0.828 | 0.886 | 0.902 | 0.54 | – | 2.2 |

## Flags and condition effects

### out-of-range

The true air was outside the sensor's range: the reading is clamped and no accuracy is promised.

- Parameters: PM1 (µg/m³), PM2.5 (µg/m³), PM10 (µg/m³), TVOC (ppb)
- 49 readings in 4 periods; largest excess beyond the envelope: 1,036.47
  - PM1 (µg/m³): 2026-11-03 12:30Z to 2026-11-03 12:35Z (5 readings, mean excess 16.26)
  - PM2.5 (µg/m³): 2026-11-03 12:30Z to 2026-11-03 12:40Z (10 readings, mean excess 124.66)
  - PM10 (µg/m³): 2026-11-03 12:30Z to 2026-11-03 12:40Z (10 readings, mean excess 179.90)
  - TVOC (ppb): 2026-11-03 14:00Z to 2026-11-03 14:24Z (24 readings, mean excess 404.30)

### extended-range

CO2 between 5,000 and 10,000 ppm: reported, but outside the published accuracy range.

- Parameters: CO2 (ppm)
- 11 readings in 1 period; largest excess beyond the envelope: 0.00
  - CO2 (ppm): 2026-11-03 13:31Z to 2026-11-03 13:42Z (11 readings, mean excess 0.00)

## Scenario timeline

- 3 occupancy and other instantaneous events (the HTML report, from `pnpm vks report`, shows them in each chart's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
