# 04 · True air and the synthetic generator

**Purpose:** the input the sensor measures, and the test tool that makes such input without the care home.

> Status: input type built (M1); generator planned (M5).

## True-air input

`TrueAirSample = { t: number; air: TrueAir }`, `t` in Unix seconds UTC. `TrueAir` is a partial record in the units the device reports:

| Key | Units | Notes |
|---|---|---|
| `pm1`, `pm25`, `pm10` | µg/m³ | |
| `co2` | ppm | |
| `tvoc` | ppb | The Mølhave 22-VOC mix; excludes ethanol |
| `temp` | °C | |
| `rh` | % | |
| `o3`, `no2` | ppb | WELL variant only |
| `co` | ppm | WELL variant only |
| `ethanol` | ppb | Interferent, e.g. hand gel: moves MOx TVOC readings when that effect is on, never the reference |

A missing key means "not known"; the device skips intervals without enough samples. Samples may be irregular: batch mode interpolates linearly onto the 5 s grid and treats gaps over 600 s as unknown. File formats (CSV and JSON Lines) come with the CLI in M6.

## Synthetic generator (M5, test tool only)

`@vks/true-air-gen` exists only so the sensor can be run and validated standalone. It is **not** a room model for the care home: the sim owns the air (ADR-0006) and the plug-in path never uses the generator.

Planned model: a scenario timeline (people arriving and leaving, door closing and opening, cleaning, cooking, showers, hand gel, power cycles) driving a single-zone mass balance, `dC/dt = G·N/V − λ(C − C_out) − k·C`, so curves are physically plausible. Seeded jitter.

Planned scenarios: `bedroom-night`, `lounge-afternoon`, `door-closed-co2-rise`, `cleaning-tvoc-spike`, `cooking-pm-event`, `ensuite-shower-humid`, `hand-gel-tvoc-spikes`, `poorly-ventilated-weeks`, `power-cycle-and-module-swap`, `out-of-range-high`, `step-changes`. Room geometry follows the care home floor plan (19 m² bedrooms, 3 m² en-suites, 2.4 m ceilings).

Until M5, tests use seeded inline series (`packages/core/test/helpers.ts`); the M3b tests use inline versions of the shower, hand-gel, poorly-ventilated and power-cycle scenarios.
