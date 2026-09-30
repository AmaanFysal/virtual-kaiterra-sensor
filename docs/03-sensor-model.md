# 03 · Sensor model

**Purpose:** how true air becomes a Sensedge Mini reading: sampling, lag, the bounded error model, module lifecycle, availability, and the optional condition effects.

> Status: built in M2–M3 (2026-09-30). Code: `packages/core/src/model/`. Decisions: ADR-0001, 0002, 0003, 0008.

## One engine, two drivers

`createDevice(config)` returns a streaming state machine stepped on the sampling grid: `device.step(t, air)` with `t` a multiple of the sampling interval (Unix seconds) and `air` the true air at `t` (or `null`). It returns the readings delivered during that step and a log. `device.apply(event)` queues power, network, module-replacement and recalibration events; `device.status()` gives module health and connectivity (for `GET /devices/{id}` later).

- **Batch** (`simulate(config, samples)`): resamples an irregular true-air series onto the grid by linear interpolation (gaps over `maxGapS`, default 600 s, count as unknown) and steps through it.
- **Replay** (`createReplayDevice`): steps a recorded series lazily up to a query time. Batch `simulate` and the HTTP server (M8) both use it.
- **Plug-in** (M9, on hold): the host steps the device on its own 5 s tick. Stepping live and in batch give identical readings (tested).

Steps may skip ahead; the skipped ticks are processed with no air. Events apply at the first tick at or after their time, before that tick closes its interval.

## Pipeline

For each reported parameter, every sampling tick (5 s) while powered:

1. **Sample** the true value x.
2. **Lag**: first-order response, `y += (x − y)·α`, `α = 1 − exp(−dt/τ)`, `τ = T90 / ln 10`. T90 per parameter in docs/02; a step reaches 90% after exactly T90. The lag restarts from the current air at power-on and module replacement.

At each reporting boundary (every 60 s, `ts` = the interval's end):

3. **Coverage**: at least `minCoverage` (half) of the interval's samples must exist, or the interval is skipped (`no-input` in the log).
4. **Reference** r = mean of the lagged samples; **truth** = mean of the raw samples.
5. **Error** (below), then condition effects, warm-up and outliers if switched on.
6. **Clamp** to the reportable range (the profile's spec range, extended to 10,000 ppm for CO2) and **quantise** to the resolution.
7. **Availability**: dropouts, offline buffering and backfill (below).

Each reading carries the reported `value`, `ts`, `span` and API `source`, plus a side channel: `reference`, `truth`, `envelope` = E(r) and `flags`. Formatters strip the side channel.

## The bounded error model (ADR-0002)

E(r) is the spec envelope at the reference under the device's profile. q is the most quantisation can add. Eq = E(r) − q is what the error may use.

error = (β·f_bias + δ·f_drift·u + clamp(z/2.5, −1, 1)·f_noise) · Eq

| Term | Draw | Scope |
|---|---|---|
| β ∈ [−1, 1] | uniform | Per module install (module parameters) or per calibration (on-board parameters) |
| δ ∈ [−1, 1] | uniform | Same scope as β: the drift direction and size at end of life |
| u | module life used (1 − lifetime_pct/100), or on-board age / `onboardDriftHorizonDays` (730 days, assumed) | Grows with use; resets on replacement or recalibration |
| z | AR(1) normal, coefficient 0.5 | Per parameter per interval |

Default budget: bias 0.5, drift 0.25, noise 0.25 (must sum to at most 1). Because the fractions sum to at most 1 and u ≤ 1 for a module within its life, |error| + q ≤ E(r), so **the reported value is always within E(r) of r**. Clamping to a range that contains r never moves the value further away. Past end of life (u > 1) the drift keeps growing: flagged `module-expired` or `calibration-overdue`.

The reference is the lagged, interval-averaged truth, so the sensor's response time is not counted as an accuracy violation. The raw truth is kept for the report.

Readings whose reference is outside the spec range are flagged `out-of-range`, and CO2 between 5,000 and 10,000 ppm `extended-range`. No accuracy is promised for either.

## Module lifecycle (M3a)

- Each bay holds a module with `used` life. It starts at `1 − moduleLifetimePct/100` and grows while powered at 1/(life in days) per day. The KM-200's life shortens linearly from 2 years at PM2.5 ≤ 100 µg/m³ to 1.3 years at ≥ 200 µg/m³ (S7). `lifetime_pct` = 100·(1 − used), floored at 0.
- `replace-module` resets the bay: new serial, `used` 0, new β and δ for its parameters, lag reset and (if enabled) warm-up.
- On-board sensors (CO2, temperature, humidity) age with time; `recalibrate` resets their age, redraws their β and δ, and clears the ABC offset.

## Availability (M3a)

- **Dropouts**: `deviceDropoutPerMinute` (a whole interval missing from every parameter) and `paramDropoutPerMinute` (one parameter). Dropped readings never exist; each is logged.
- **Network**: scheduled `network` events and random outages (`randomOfflinePerDay`, exponential lengths with mean `randomOfflineMeanMinutes`). While offline, readings go to the onboard buffer, which holds `bufferMinutes` (60, "1 hour of data", S1/S2) intervals; older intervals are lost (`buffer-overflow`). On reconnect the buffer is delivered with `deliveredAt` = reconnect time and flag `backfilled`. Online readings have `deliveredAt = ts`.
- **Power**: while off, nothing is sampled, reported or aged (except on-board calibration age).

## Condition-dependent effects (M3b, ADR-0008)

All off by default; each flags the readings it moves by more than the quantisation step.

| Effect | Model | Flag |
|---|---|---|
| PM hygroscopic growth | PM × C(RH)/C(rhRef), with C = 1 + (κ/1.65)/(1/aw − 1) (Crilley et al. 2018), κ = 0.3, rhRef = 40 %RH, aw capped at 0.98 | `pm-humidity` |
| MOx humidity and temperature | + r·0.008·(RH − 45) + r·0.01·(T − 22) (assumed; direction per Abdullah et al. 2022) | `mox-humidity`, `mox-temperature` |
| MOx ethanol (hand gel) | + 1.0 × lagged ethanol ppb (the sensor is calibrated against ethanol, S1) | `mox-ethanol` |
| MOx baseline | Ornstein–Uhlenbeck, SD 15 ppb, time constant 3 days (assumed) | `mox-baseline` |
| NDIR ABC | Every 192 powered hours, offset += clamp(400 − lowest reading, ±50 ppm) (Senseair S8 PSP0107: 8-day period, 30–50 ppm per period) | `abc-offset` |
| Warm-up | After power-on (all parameters) or module replacement (its parameters): offset ±(0.5–1)×1.5 E decaying ×e⁻³ over the warm-up (PM 30 s, CO2 180 s, MOx 3,600 s, electrochemical 3,600 s, temperature/humidity 900 s). Any interval overlapping the warm-up is flagged; `suppress` drops those readings instead | `warm-up` |
| Outliers | With probability `perReading`, value = r ± (E + q + Exp·E) | `outlier` |

Ethanol is an interferent in the true-air input (`ethanol`, ppb): it is not part of true TVOC, so it moves the reading but not the reference.

## Random streams

Streams are `createRng([seed, ...parts].join("/"))` (sfc32 seeded by xmur3, ported from the care home):

`bay{n}/install{k}/bias|drift/{param}`, `onboard/cal{k}/bias|drift/{param}`, `noise/{param}`, `outlier/{param}`, `dropout/{param}`, `dropout/device`, `offline`, `mox-baseline`, `warm-up/{param}/{count}`.

Every interval draws: one normal per parameter (noise), three uniforms per parameter (outlier), one uniform per parameter (dropout), one for device dropout, two for outages and one normal for the MOx baseline, whatever the switches say. So a switch never shifts another stream (tested for dropouts, outliers and parameter subsets).
