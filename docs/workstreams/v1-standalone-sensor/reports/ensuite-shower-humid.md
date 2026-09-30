# Validation report: ensuite-shower-humid

Assisted shower in the Room 1 en-suite with the fan off: humidity saturates and the PM sensor over-reads (PM humidity growth on).

- Scenario: `data/scenarios/ensuite-shower-humid.json`, room Ensuite1, 2026-11-03 07:01Z to 2026-11-03 09:00Z, generator seed "ensuite-shower-humid"
- Device: Ensuite1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "ensuite-shower-humid"
- Spec profile: looser
- Condition effects on: pmHumidity
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (759 of 759)
- Flagged readings: 81 of 840; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 120 | 0 | 100% | 85.0% | 4.2 | 4.2 | 8.9 | 4.2 | 0.72 | – | 0.1 |
| PM2.5 (µg/m³) | 120 | 0 | 100% | 85.0% | 5.6 | 7.0 | 18.1 | 7.0 | 0.68 | – | 0.1 |
| PM10 (µg/m³) | 120 | 0 | 100% | 82.5% | 24.5 | 26.2 | 73.2 | 26.2 | 0.65 | 0 | 0.1 |
| CO2 (ppm) | 120 | 0 | 100% | 100% | -12.1 | 24.4 | 39.2 | 12.1 | 0.45 | 1 | 0.9 |
| TVOC (ppb) | 120 | 0 | 100% | 100% | -2.48 | 2.48 | 2.57 | 2.47 | 0.59 | – | 0.4 |
| Temperature (°C) | 120 | 0 | 100% | 100% | 0.051 | 0.070 | 0.075 | 0.055 | 0.39 | – | 4.3 |
| Relative humidity (%) | 120 | 0 | 100% | 100% | 1.439 | 3.120 | 4.801 | 1.292 | 0.70 | 2 | 2.2 |

## Flags and condition effects

### pm-humidity

Particles grow by taking up water at high humidity, so the PM sensor over-reads (κ-Köhler, Crilley et al. 2018).

- Parameters: PM2.5 (µg/m³), PM10 (µg/m³), PM1 (µg/m³)
- 81 readings in 3 periods; largest excess beyond the envelope: 265.06
  - PM2.5 (µg/m³): 2026-11-03 07:16Z to 2026-11-03 07:43Z (27 readings, mean excess 25.90)
  - PM10 (µg/m³): 2026-11-03 07:16Z to 2026-11-03 07:46Z (30 readings, mean excess 98.56)
  - PM1 (µg/m³): 2026-11-03 07:17Z to 2026-11-03 07:41Z (24 readings, mean excess 13.39)

## Scenario timeline

- 2026-11-03 07:00Z to 2026-11-03 08:10Z: door closed
- 2026-11-03 07:15Z to 2026-11-03 07:27Z: shower
- 2026-11-03 07:35Z to 2026-11-03 08:05Z: extract fan on
- 4 occupancy and other instantaneous events (see the HTML report's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
