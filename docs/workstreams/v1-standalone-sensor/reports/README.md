# Validation reports

One report per scenario, from `pnpm vks report --all`. The Markdown summaries and `<id>.stats.json` statistics are committed, and a test fails if they drift from the code. The HTML reports with charts are generated on demand (gitignored) and attached to every CI run as the `validation-reports` artifact. Do not edit by hand.

| Scenario | Healthy in spec | Readings | Flagged | Flags | Report |
|---|---|---|---|---|---|
| bedroom-night | 100% | 5,040 | 0 | none | [Markdown](bedroom-night.md) · [stats](bedroom-night.stats.json) |
| cleaning-tvoc-spike | 100% | 1,260 | 0 | none | [Markdown](cleaning-tvoc-spike.md) · [stats](cleaning-tvoc-spike.stats.json) |
| cooking-pm-event | 100% | 1,260 | 0 | none | [Markdown](cooking-pm-event.md) · [stats](cooking-pm-event.stats.json) |
| door-closed-co2-rise | 100% | 2,100 | 0 | none | [Markdown](door-closed-co2-rise.md) · [stats](door-closed-co2-rise.stats.json) |
| ensuite-shower-humid | 100% | 840 | 81 | pm-humidity | [Markdown](ensuite-shower-humid.md) · [stats](ensuite-shower-humid.stats.json) |
| hand-gel-tvoc-spikes | 100% | 3,360 | 480 | mox-baseline, mox-temperature, mox-humidity, mox-ethanol | [Markdown](hand-gel-tvoc-spikes.md) · [stats](hand-gel-tvoc-spikes.stats.json) |
| lounge-afternoon | 100% | 2,520 | 0 | none | [Markdown](lounge-afternoon.md) · [stats](lounge-afternoon.stats.json) |
| out-of-range-high | 100% | 1,260 | 60 | out-of-range, extended-range | [Markdown](out-of-range-high.md) · [stats](out-of-range-high.stats.json) |
| poorly-ventilated-weeks | 100% | 282,240 | 28,800 | abc-offset | [Markdown](poorly-ventilated-weeks.md) · [stats](poorly-ventilated-weeks.stats.json) |
| power-cycle-and-module-swap | 100% | 2,415 | 163 | warm-up | [Markdown](power-cycle-and-module-swap.md) · [stats](power-cycle-and-module-swap.stats.json) |
| step-changes | 100% | 1,680 | 0 | none | [Markdown](step-changes.md) · [stats](step-changes.stats.json) |
