# ADR 0002: A bounded error budget, and spec profiles defaulting to "looser"

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/02-sensedge-mini-reference.md, docs/03-sensor-model.md, docs/08-testing-and-validation.md

## Context

The virtual device must add realistic error (a fixed per-device bias, drift over module life, random noise) while tests prove that healthy readings always stay within the published accuracy. Kaiterra's web specification page (S1) and 2024 spec sheet (S2) disagree on O3, NO2 and CO accuracy (and O3's lower range). The readings will be used to test data pipelines and ML models, which should see the worst documented accuracy.

## Decision

We will make every error component a fraction of the usable envelope Eq = E(r) − q, where E(r) is the allowed error at the reference r under the chosen profile and q is the most quantisation can add. Bias (0.5), drift at end of life (0.25) and truncated AR(1) noise (0.25) must sum to at most 1, so |value − r| ≤ E(r) holds for every healthy reading. Bias and drift are drawn per module install (or per on-board calibration); drift grows with life used and exceeds its share only past end of life, which is flagged.

The reference is the lagged, interval-averaged true value, so response time is tested separately rather than counted as inaccuracy.

We will keep both documents' figures and offer four spec profiles: `web-page`, `pdf-2024`, `tighter` (the smaller envelope and narrower range at each value) and `looser` (the larger and wider). The default is **`looser`**. TVOC is ±15% ±4 ppb in every profile, as both documents say.

## Consequences

- "Always within spec" is a proof plus a property test, not a hope.
- Error scales with the envelope, so piecewise specs (absolute at low values, relative at high) give offset-like error at low values and gain-like error at high values.
- At band edges (for example PM10 at 30 µg/m³, ±3 then ±4.5) the error scale jumps with the envelope.
- Real devices can exceed their specification occasionally; that is modelled by opt-in, flagged effects (ADR-0008), not by the default.

## Alternatives considered

- Statistical accuracy (for example 95% within spec): realistic, but contradicts the requirement that readings always stay within spec.
- Independent offset and gain terms: more physical, but they cannot be bounded by a piecewise envelope without clipping.
- Picking one document: hides a real disagreement; the profile makes it a visible, testable choice.
