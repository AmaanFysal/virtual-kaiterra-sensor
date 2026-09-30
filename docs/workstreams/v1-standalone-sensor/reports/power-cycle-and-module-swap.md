# Validation report: power-cycle-and-module-swap

The sensor in Room 1 loses power for 15 minutes, then both modules are swapped an hour apart (warm-up on).

- Scenario: `data/scenarios/power-cycle-and-module-swap.json`, room Room1, 2026-11-03 09:01Z to 2026-11-03 15:00Z, generator seed "power-cycle-and-module-swap"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "power-cycle-and-module-swap"
- Spec profile: looser
- Condition effects on: warmUp
- Module health at start: bay 0 6%, bay 1 9%
- Device log: power-off 1, power-on 1, no-input 7, module-replaced 2
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (2,252 of 2,252)
- Flagged readings: 163 of 2,415; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 345 | 15 | 100% | 99.7% | -0.2 | 0.6 | 0.7 | 0.6 | 0.56 | – | 0.1 |
| PM2.5 (µg/m³) | 345 | 15 | 100% | 99.7% | -0.5 | 0.5 | 0.7 | 0.5 | 0.47 | – | 0.1 |
| PM10 (µg/m³) | 345 | 15 | 100% | 99.7% | -1.1 | 1.1 | 1.2 | 1.1 | 0.66 | – | 0.1 |
| CO2 (ppm) | 345 | 15 | 100% | 100% | 18.6 | 18.7 | 19.5 | 18.9 | 0.58 | – | 0.9 |
| TVOC (ppb) | 345 | 15 | 100% | 100% | 1.33 | 2.41 | 2.80 | 2.41 | 0.69 | – | 0.4 |
| Temperature (°C) | 345 | 15 | 100% | 99.4% | 0.017 | 0.035 | 0.051 | 0.037 | 0.34 | – | 4.3 |
| Relative humidity (%) | 345 | 15 | 100% | 100% | -1.107 | 1.121 | 1.161 | 1.174 | 0.64 | – | 2.2 |

## Flags and condition effects

### warm-up

The sensor is settling after power-on or a module swap.

- Parameters: PM1 (µg/m³), PM2.5 (µg/m³), PM10 (µg/m³), CO2 (ppm), TVOC (ppb), Temperature (°C), Relative humidity (%)
- 163 readings in 11 periods; largest excess beyond the envelope: 2.48
  - PM1 (µg/m³): 2026-11-03 10:15Z to 2026-11-03 10:16Z (1 readings, mean excess 0.00)
  - PM2.5 (µg/m³): 2026-11-03 10:15Z to 2026-11-03 10:16Z (1 readings, mean excess 0.00)
  - PM10 (µg/m³): 2026-11-03 10:15Z to 2026-11-03 10:16Z (1 readings, mean excess 0.00)
  - CO2 (ppm): 2026-11-03 10:15Z to 2026-11-03 10:18Z (3 readings, mean excess 0.00)
  - TVOC (ppb): 2026-11-03 10:15Z to 2026-11-03 11:15Z (60 readings, mean excess 0.00)
  - Temperature (°C): 2026-11-03 10:15Z to 2026-11-03 10:30Z (15 readings, mean excess 0.00)
  - Relative humidity (%): 2026-11-03 10:15Z to 2026-11-03 10:30Z (15 readings, mean excess 0.00)
  - PM1 (µg/m³): 2026-11-03 11:59Z to 2026-11-03 12:01Z (2 readings, mean excess 0.03)
  - …and 3 more periods

## Scenario timeline

- 2026-11-03 10:00Z to 2026-11-03 10:15Z: power off
- 3 occupancy and other instantaneous events (see the HTML report's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
