# 04 · True air and the synthetic generator

**Purpose:** the input the sensor measures, and the test tool that makes such input without the care home.

> Status: input type built (M1); generator built (M5, 2026-09-30). Code: `packages/true-air-gen`. Decision: ADR-0009.

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

A missing key means "not known"; the device skips intervals without enough samples. Samples may be irregular: batch mode interpolates linearly onto the 5 s grid and treats gaps over 600 s as unknown.

Files (`packages/core/src/io/files.ts`; pure, so a plug-in host can reuse them):

- **CSV**: header `timestamp,pm1,pm25,pm10,co2,tvoc,temp,rh,o3,no2,co,ethanol` (any subset, any order; `ts` also accepted); blank cells are unknown; `#` lines are comments.
- **JSON Lines**: `{"ts": "2026-11-03T06:00:00Z", "co2": 650, …}`.

Timestamps are RFC 3339 or Unix seconds. Errors name the line.

## Synthetic generator (test tool only)

`@vks/true-air-gen` exists only so the sensor can be run and validated standalone. It is **not** a room model for the care home: the sim owns the air (ADR-0006), and the plug-in path never uses the generator.

`generate(scenario, seed)` returns the true-air samples, the scenario, and annotations (door-closed and window-open spans, cooking, cleaning, showers, hand gel, occupancy changes) that the report shades.

### Model (ADR-0009)

One well-mixed room exchanging air with outdoors. Every quantity follows dC/dt = S − L·C and is stepped exactly (`C_ss + (C − C_ss)·e^(−L·dt)`) every 5 s, so month-long runs stay stable.

| Quantity | Sources S | Losses L |
|---|---|---|
| CO2 (ppm) | λ·C_out + people: V_CO2 = BMR·M·0.000484 L/s (Persily & de Jonge 2017, Eq. 4). BMR is the mean of the sexes from their Table 2: residents ≥ 80 (5.69 MJ/day), staff 30–50 (7.02), visitors 50–60 (7.06). M = 1.0 sleeping, 1.2 seated, 1.6 light, 2.0 care, 3.0 active | λ |
| PM1, PM2.5, PM10 (µg/m³) | λ·0.8·C_out (penetration); cooking (mg/min of PM2.5; PM1 ×0.8, PM10 ×1.15); dust stirred up by moving people (PM10, a tenth PM2.5) | λ + deposition 0.2 / 0.4 / 1.5 per h |
| TVOC (ppb) | λ·C_out; cleaning (mg/min); people 0.3 mg/h; µg/m³ → ppb with Kaiterra's factor 3.967 | λ |
| Ethanol (ppb) | Hand gel: the dose (mg) evaporates over 2 minutes; ppb = µg/m³ × 24.45/46.07 | λ |
| O3, NO2, CO | λ·C_out | λ + 2.8 / 0.5 / 0 per h |
| Humidity | Absolute humidity: λ·W_out, people 30–110 g/h by activity, showers (g/min); capped at saturation (Magnus) | λ |
| Temperature | Heating pulls to the setpoint (τ = 1 h), +0.25 °C per person, +2 °C while showering; an open window pulls towards outdoors | |

λ = base + door open + window open + extract fan (air changes per hour, per room). Door exchange is treated as exchange with outdoor air, a simplification. With `jitter` on, source strengths vary by seed (people ±10%, events ±20%) and outdoor CO2, PM and temperature drift (Ornstein–Uhlenbeck). With it off, curves are exact textbook exponentials.

### Scenario files (`data/scenarios/*.json`)

```jsonc
{
  "id": "door-closed-co2-rise",            // kebab-case, matches the file name
  "description": "…",
  "start": "2026-11-03T14:00:00Z",         // default: the care home's default start, Tue 06:00
  "durationMinutes": 300,
  "sampleIntervalS": 60,                   // multiple of 5
  "room": { "id": "Room1", "floorAreaM2": 19, "ceilingHeightM": 2.4, "baseAch": 0.5,
            "doorOpenAch": 1.5, "windowOpenAch": 4, "fanAch": 8, "tempSetpointC": 21 },
  "outdoor": { "co2": 420, "pm25": 8, "temp": 8, "rh": 80 },   // partial; defaults for the rest
  "initial": { "doorOpen": true, "windowOpen": false, "fanOn": false, "air": { "co2": 800 } },
  "timeline": [ { "atMinutes": 30, "type": "door", "open": false },
                { "atMinutes": 20, "type": "hand-gel", "ethanolMg": 40, "repeat": { "everyMinutes": 60, "times": 8 } } ],
  "daily": [ { "at": "21:30", "type": "occupants", "group": "resident", "who": "resident", "activity": "sleeping", "count": 1 } ],
  "jitter": true,
  "device": { "conditions": { "abc": { "enabled": true } }, "events": [ { "atMinutes": 60, "kind": "power", "on": false } ] }
}
```

Event types:
- `occupants` (group, who: resident, staff or visitor, activity, count; 0 removes the group)
- `door`, `window`, `fan` (`open`)
- `cooking` (minutes, pm25MgPerMin), `cleaning` (minutes, tvocMgPerMin), `shower` (minutes, waterGPerMin), `hand-gel` (ethanolMg)
- `set` (values, optional `hold` to pin them until `release`)
- `outdoor` (values)

`daily` times are UTC clock times, which are UK times in November. `device` holds the settings that make the scenario's point; its event times are minutes from the start.

| Scenario | Room | Shows |
|---|---|---|
| `bedroom-night` | Room 1 | CO2 building overnight behind a closed door; carer visits |
| `lounge-afternoon` | Lounge | Residents, staff, visitors; tea and toast |
| `door-closed-co2-rise` | Room 1 | Three visitors, door shut for 3 h |
| `cleaning-tvoc-spike` | Room 1 | Spray cleaning, then a window opened |
| `cooking-pm-event` | Lounge | Frying at the servery |
| `ensuite-shower-humid` | En-suite 1 | Saturated air; PM humidity growth on |
| `hand-gel-tvoc-spikes` | Room 1 | Hourly hand gel; MOx effects on |
| `poorly-ventilated-weeks` | Room 1 | 4 weeks never near outdoor CO2; NDIR ABC on |
| `power-cycle-and-module-swap` | Room 1 | Power loss and both modules swapped; warm-up on |
| `out-of-range-high` | Room 1 | PM, CO2 and TVOC beyond range |
| `step-changes` | Room 1 | Held steps, no jitter, for response times |
