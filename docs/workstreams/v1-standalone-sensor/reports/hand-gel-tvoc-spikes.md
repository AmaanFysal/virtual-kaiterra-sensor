# Validation report: hand-gel-tvoc-spikes

A carer visits Room 1 every hour and uses alcohol hand gel each time; the MOx TVOC sensor reads the ethanol (MOx effects on).

- Scenario: `data/scenarios/hand-gel-tvoc-spikes.json`, room Room1, 2026-11-03 08:01Z to 2026-11-03 16:00Z, generator seed "hand-gel-tvoc-spikes"
- Device: Room1 (5e200000-0000-4000-8000-000000000001), pm-tvoc-co2, seed "hand-gel-tvoc-spikes"
- Spec profile: looser
- Condition effects on: mox
- Module health at start: bay 0 100%, bay 1 100%
- Device log: nothing notable
- Undelivered at end: 0

## Summary

- **Healthy readings within the spec envelope: 100%** (2,880 of 2,880)
- Flagged readings: 480 of 3,360; backfilled after an outage: 0

## Accuracy by parameter

| Parameter | Readings | Missing | Healthy in spec | All in spec | Bias vs truth | MAE vs truth | RMSE vs truth | MAE vs reference | Worst healthy error / E | Lag (min) | Expected lag τ (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM1 (µg/m³) | 480 | 0 | 100% | 100% | 0.3 | 0.5 | 0.5 | 0.5 | 0.29 | – | 0.1 |
| PM2.5 (µg/m³) | 480 | 0 | 100% | 100% | 0.2 | 0.3 | 0.5 | 0.3 | 0.42 | – | 0.1 |
| PM10 (µg/m³) | 480 | 0 | 100% | 100% | 0.7 | 0.7 | 0.8 | 0.7 | 0.56 | – | 0.1 |
| CO2 (ppm) | 480 | 0 | 100% | 100% | 5.5 | 6.7 | 8.3 | 6.6 | 0.36 | – | 0.9 |
| TVOC (ppb) | 480 | 0 | 100% | 4.2% | 213.15 | 213.18 | 248.36 | 213.18 | 0.00 | – | 0.4 |
| Temperature (°C) | 480 | 0 | 100% | 100% | 0.135 | 0.135 | 0.138 | 0.138 | 0.71 | – | 4.3 |
| Relative humidity (%) | 480 | 0 | 100% | 100% | 0.038 | 0.250 | 0.312 | 0.230 | 0.26 | – | 2.2 |

## Flags and condition effects

### mox-baseline

The metal-oxide sensor's baseline wanders slowly.

- Parameters: TVOC (ppb)
- 438 readings in 22 periods; largest excess beyond the envelope: 532.10
  - TVOC (ppb): 2026-11-03 08:00Z to 2026-11-03 08:06Z (6 readings, mean excess 0.00)
  - TVOC (ppb): 2026-11-03 08:07Z to 2026-11-03 08:08Z (1 readings, mean excess 0.00)
  - TVOC (ppb): 2026-11-03 08:09Z to 2026-11-03 08:13Z (4 readings, mean excess 0.00)
  - TVOC (ppb): 2026-11-03 08:16Z to 2026-11-03 08:20Z (4 readings, mean excess 0.00)
  - TVOC (ppb): 2026-11-03 08:21Z to 2026-11-03 08:56Z (35 readings, mean excess 285.95)
  - TVOC (ppb): 2026-11-03 08:57Z to 2026-11-03 09:02Z (5 readings, mean excess 133.86)
  - TVOC (ppb): 2026-11-03 09:03Z to 2026-11-03 09:05Z (2 readings, mean excess 112.87)
  - TVOC (ppb): 2026-11-03 09:08Z to 2026-11-03 09:09Z (1 readings, mean excess 95.87)
  - …and 14 more periods

### mox-temperature

The metal-oxide TVOC sensor reads high in warm air.

- Parameters: TVOC (ppb)
- 39 readings in 1 period; largest excess beyond the envelope: 456.20
  - TVOC (ppb): 2026-11-03 08:00Z to 2026-11-03 08:39Z (39 readings, mean excess 167.77)

### mox-humidity

The metal-oxide TVOC sensor reads high in humid air and low in dry air.

- Parameters: TVOC (ppb)
- 454 readings in 2 periods; largest excess beyond the envelope: 532.10
  - TVOC (ppb): 2026-11-03 08:06Z to 2026-11-03 11:29Z (203 readings, mean excess 204.17)
  - TVOC (ppb): 2026-11-03 11:49Z to 2026-11-03 16:00Z (251 readings, mean excess 209.57)

### mox-ethanol

The TVOC sensor responds to ethanol, e.g. alcohol hand gel, which is not part of true TVOC.

- Parameters: TVOC (ppb)
- 460 readings in 1 period; largest excess beyond the envelope: 532.10
  - TVOC (ppb): 2026-11-03 08:20Z to 2026-11-03 16:00Z (460 readings, mean excess 215.29)

## Scenario timeline

- 2026-11-03 08:20Z to 2026-11-03 08:22Z: hand gel
- 2026-11-03 09:20Z to 2026-11-03 09:22Z: hand gel
- 2026-11-03 10:20Z to 2026-11-03 10:22Z: hand gel
- 2026-11-03 11:20Z to 2026-11-03 11:22Z: hand gel
- 2026-11-03 12:20Z to 2026-11-03 12:22Z: hand gel
- 2026-11-03 13:20Z to 2026-11-03 13:22Z: hand gel
- 2026-11-03 14:20Z to 2026-11-03 14:22Z: hand gel
- 2026-11-03 15:20Z to 2026-11-03 15:22Z: hand gel
- 17 occupancy and other instantaneous events (the HTML report, from `pnpm vks report`, shows them in each chart's event strip)

## Method

The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).
