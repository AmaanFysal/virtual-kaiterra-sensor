# 03 · Sensor model

**Purpose:** how true air becomes a Sensedge Mini reading: sampling, lag, the bounded error model, module lifecycle, availability, and the optional condition effects.

> Status: built in M2 (2026-09-30); condition effects planned (M3b). Code: `packages/core/src/model/`. Decisions: ADR-0001, 0002, 0003.

## One engine, two drivers

`createDevice(config)` returns a streaming state machine stepped on the sampling grid: `device.step(t, air)` with `t` a multiple of the sampling interval (Unix seconds) and `air` the true air at `t` (or `null`). It returns the readings delivered during that step and a log. `device.status()` gives module health (for `GET /devices/{id}` later).

- **Batch** (`simulate(config, samples)`): resamples an irregular true-air series onto the grid by linear interpolation (gaps over `maxGapS`, default 600 s, count as unknown) and steps through it.
- **Plug-in** (M9): the host steps the device on its own 5 s tick. Stepping live and in batch give identical readings (tested).

Steps may skip ahead; the skipped ticks are processed with no air.

## Pipeline

For each reported parameter, every sampling tick (5 s) while powered:

1. **Sample** the true value x.
2. **Lag**: first-order response, `y += (x − y)·α`, `α = 1 − exp(−dt/τ)`, `τ = T90 / ln 10`. T90 per parameter in docs/02; a step reaches 90% after exactly T90.

At each reporting boundary (every 60 s, `ts` = the interval's end):

3. **Coverage**: at least `minCoverage` (half) of the interval's samples must exist, or the interval is skipped (`no-input` in the log).
4. **Reference** r = mean of the lagged samples; **truth** = mean of the raw samples.
5. **Error** (below).
6. **Clamp** to the reportable range (the profile's spec range, extended to 10,000 ppm for CO2) and **quantise** to the resolution.

Each reading carries the reported `value`, `ts`, `span` and API `source`, plus a side channel: `reference`, `truth`, `envelope` = E(r) and `flags`. Formatters strip the side channel.

## The bounded error model (ADR-0002)

E(r) is the spec envelope at the reference under the device's profile. q is the most quantisation can add. Eq = E(r) − q is what the error may use.

error = (β·f_bias + δ·f_drift·u + clamp(z/2.5, −1, 1)·f_noise) · Eq

| Term | Draw | Scope |
|---|---|---|
| β ∈ [−1, 1] | uniform | Per module install (module parameters) or per calibration (on-board parameters) |
| δ ∈ [−1, 1] | uniform | Same scope as β: the drift direction and size at end of life |
| u | module life used (1 − lifetime_pct/100), or on-board age / `onboardDriftHorizonDays` (730 days, assumed) | Fixed from the config for now; aging comes in M3a |
| z | AR(1) normal, coefficient 0.5 | Per parameter per interval |

Default budget: bias 0.5, drift 0.25, noise 0.25 (must sum to at most 1). Because the fractions sum to at most 1 and u ≤ 1 for a module within its life, |error| + q ≤ E(r), so **the reported value is always within E(r) of r**. Clamping to a range that contains r never moves the value further away. Past end of life (u > 1) the drift keeps growing: flagged `module-expired` or `calibration-overdue`.

The reference is the lagged, interval-averaged truth, so the sensor's response time is not counted as an accuracy violation. The raw truth is kept for the report.

Readings whose reference is outside the spec range are flagged `out-of-range`, and CO2 between 5,000 and 10,000 ppm `extended-range`. No accuracy is promised for either.

## Random streams

Streams are `createRng([seed, ...parts].join("/"))` (sfc32 seeded by xmur3, ported from the care home):

`bay{n}/install{k}/bias|drift/{param}`, `onboard/cal{k}/bias|drift/{param}`, `noise/{param}`.

Every interval draws one normal per parameter (noise), whatever the switches say. So a switch never shifts another stream (tested for parameter subsets).
