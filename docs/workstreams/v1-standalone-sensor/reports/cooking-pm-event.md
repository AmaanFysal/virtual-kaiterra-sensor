# Validation report: cooking-pm-event

Lunch is plated and a batch of food fried at the Lounge servery for twenty minutes.

- Scenario: `data/scenarios/cooking-pm-event.json`, room Lounge, 2026-11-03 11:01Z to 2026-11-03 14:00Z, generator seed "cooking-pm-event"
- Device: Lounge (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "cooking-pm-event"
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
| PM1 (µg/m³) | 180 | 0 | 100% | 100% | -1.3 | 1.3 | 2.1 | 1.4 | 0.42 | 0 | 0.1 |
| PM2.5 (µg/m³) | 180 | 0 | 100% | 100% | 3.3 | 3.3 | 5.2 | 3.3 | 0.68 | 0 | 0.1 |
| PM10 (µg/m³) | 180 | 0 | 100% | 100% | -1.2 | 1.4 | 3.0 | 1.4 | 0.44 | 0 | 0.1 |
| CO2 (ppm) | 180 | 0 | 100% | 100% | 20.5 | 20.5 | 21.6 | 21.2 | 0.61 | 0 | 0.9 |
| TVOC (ppb) | 180 | 0 | 100% | 100% | 1.67 | 1.67 | 1.81 | 1.67 | 0.47 | – | 0.4 |
| Temperature (°C) | 180 | 0 | 100% | 100% | 0.014 | 0.037 | 0.045 | 0.047 | 0.40 | 1 | 4.3 |
| Relative humidity (%) | 180 | 0 | 100% | 100% | 0.678 | 0.680 | 0.747 | 0.583 | 0.43 | – | 2.2 |

## Flags and condition effects

No reading was flagged: every reading is covered by the spec envelope.
## Scenario timeline

- 2026-11-03 11:30Z to 2026-11-03 11:50Z: cooking
- 3 occupancy and other instantaneous events (see the HTML report's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
