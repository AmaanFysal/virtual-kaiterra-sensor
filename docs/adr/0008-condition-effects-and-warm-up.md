# ADR 0008: Condition-dependent errors, warm-up and outliers: opt-in and flagged

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/03-sensor-model.md, docs/08-testing-and-validation.md, docs/09-risks-and-debt.md

## Context

Low-cost sensors err in ways that depend on conditions, which matters in a care home: PM over-reads after en-suite showers, MOx TVOC reads alcohol hand gel, NDIR CO2 self-calibration drifts in rooms that never get fresh air, and sensors are unsettled after power-on or a module swap. Kaiterra publishes none of these behaviours for the Sensedge Mini. The default device must still stay within spec (ADR-0002).

## Decision

We will model five effects, each **off by default** with its own switch and random stream, each flagging the readings it moves:

| Effect | Model | Basis |
|---|---|---|
| PM hygroscopic growth | PM × C(RH)/C(40 %RH), C = 1 + (κ/1.65)/(1/aw − 1), κ = 0.3, aw ≤ 0.98 | κ-Köhler correction and κ = 0.3 from Crilley et al. 2018, *Atmos. Meas. Tech.* 11, 709–720, doi:10.5194/amt-11-709-2018 (OPC-N2 read 2.5–3.9× high at high RH, with large artefacts above ~85 %RH). Normalising at a 40 %RH calibration humidity is an assumption. |
| MOx humidity and temperature | + r·0.008·(RH − 45) + r·0.01·(T − 22) | Direction: MOx resistance falls with rising humidity and temperature, so reported VOC rises (Abdullah et al. 2022, *Sensors* 22(9), 3301, doi:10.3390/s22093301). Magnitudes are assumptions. |
| MOx ethanol | + 1.0 × lagged ethanol (ppb) | The TVOC sensor is calibrated against ethanol (S1), so it reads ethanol about 1:1. Ethanol is an input interferent, not part of true TVOC. |
| MOx baseline drift | Ornstein–Uhlenbeck, SD 15 ppb, time constant 3 days | Assumption. |
| NDIR ABC | Every 192 powered hours, offset += clamp(400 − lowest reading, ±50 ppm) | Senseair S8 Residential PSP0107 ed. 18: ABC period 8 days, lowest reading taken as 400 ppm, "tuning speed limited to about 30–50 ppm/ABC period". Sensirion SCD4x uses a similar scheme (44 h initial, 156 h standard). The Mini's CO2 component is not published. |
| Warm-up | Offset ±(0.5–1)×1.5 E, decaying by e⁻³ over PM 30 s, CO2 180 s, MOx 3,600 s, electrochemical 3,600 s, temperature/humidity 900 s. Intervals overlapping the warm-up are flagged, or dropped with `suppress`. | PM 30 s: Plantower PMS5003 datasheet ("stable data … at least 30 seconds after the sensor wakeup"). The rest are assumptions. |
| Outliers | With probability `perReading`, value = r ± (E + q + Exp(1)·E) | Assumption; exists so pipelines see occasional impossible values. |

Flags live in the reading's side channel only; the real output formats have no such fields. With every switch off, no reading carries these flags and the envelope property test holds.

## Consequences

- Scenarios for each effect (M5) and a report section each (M7) can show them against the truth.
- ABC switched on biases a well-ventilated room by about −20 ppm (outdoor air is ~420 ppm, not 400). That is real ABC behaviour, documented in docs/09.
- Magnitudes marked as assumptions are single config values, replaceable when real-device data arrives.

## Alternatives considered

- Always on: breaks the in-spec guarantee of the default device.
- Folding them into the noise term: invisible, and not attributable in the report.
