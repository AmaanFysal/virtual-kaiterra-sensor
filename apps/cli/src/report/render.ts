// Renders a validation report as a self-contained HTML page and as Markdown (docs/08).
// Deterministic: no generation time or environment in the output, so reports diff cleanly.

import { SENSEDGE_MINI, formatIso, type Flag, type FlagSpan, type ParamId } from "@vks/core";
import { CHART_SCRIPT, chartHtml, esc, fmt } from "./chart.js";
import { paramLabel, type ReportModel } from "./model.js";

export const FLAG_MEANING: Record<Exclude<Flag, "backfilled">, string> = {
  "out-of-range": "The true air was outside the sensor's range: the reading is clamped and no accuracy is promised.",
  "extended-range": "CO2 between 5,000 and 10,000 ppm: reported, but outside the published accuracy range.",
  "module-expired": "The sensor module is past 0% health; its drift has outgrown the error budget.",
  "calibration-overdue": "An on-board sensor is past its drift horizon without recalibration.",
  "warm-up": "The sensor is settling after power-on or a module swap.",
  outlier: "An occasional reading outside the spec envelope (outlier switch on).",
  "pm-humidity": "Particles grow by taking up water at high humidity, so the PM sensor over-reads (κ-Köhler, Crilley et al. 2018).",
  "mox-humidity": "The metal-oxide TVOC sensor reads high in humid air and low in dry air.",
  "mox-temperature": "The metal-oxide TVOC sensor reads high in warm air.",
  "mox-ethanol": "The TVOC sensor responds to ethanol, e.g. alcohol hand gel, which is not part of true TVOC.",
  "mox-baseline": "The metal-oxide sensor's baseline wanders slowly.",
  "abc-offset": "NDIR automatic baseline calibration assumes the lowest reading of each 8-day period is 400 ppm; in rooms that never get fresh air it drifts low.",
};

const pct = (x: number) => `${fmt(100 * x, x === 1 || x === 0 ? 0 : 1)}%`;
const time = (t: number) => formatIso(t).replace("T", " ").replace(":00Z", "Z");
const dec = (p: ParamId) => SENSEDGE_MINI[p].decimals + (SENSEDGE_MINI[p].decimals === 0 ? 1 : 1);

interface FlagGroup {
  flag: Flag;
  params: ParamId[];
  spans: FlagSpan[];
  readings: number;
  maxExcess: number;
}

function flagGroups(spans: FlagSpan[]): FlagGroup[] {
  const groups = new Map<Flag, FlagGroup>();
  for (const s of spans) {
    const g = groups.get(s.flag) ?? { flag: s.flag, params: [], spans: [], readings: 0, maxExcess: 0 };
    if (!g.params.includes(s.param)) g.params.push(s.param);
    g.spans.push(s);
    g.readings += s.readings;
    g.maxExcess = Math.max(g.maxExcess, s.maxExcess);
    groups.set(s.flag, g);
  }
  return [...groups.values()];
}

function statsRows(m: ReportModel): string[][] {
  return m.data.params.map((s) => [
    paramLabel(s.param),
    fmt(s.readings, 0),
    fmt(s.missing, 0),
    pct(s.healthyWithinShare),
    pct(s.withinShare),
    fmt(s.biasVsTruth, dec(s.param)),
    fmt(s.maeVsTruth, dec(s.param)),
    fmt(s.rmseVsTruth, dec(s.param)),
    fmt(s.maeVsReference, dec(s.param)),
    fmt(s.worstHealthyRatio, 2),
    s.lagMinutes === undefined ? "–" : fmt(s.lagMinutes, 0),
    fmt(s.expectedLagMinutes, 1),
  ]);
}

const STATS_HEAD = ["Parameter", "Readings", "Missing", "Healthy in spec", "All in spec", "Bias vs truth", "MAE vs truth", "RMSE vs truth", "MAE vs reference", "Worst healthy error / E", "Lag (min)", "Expected lag τ (min)"];

function deviceFacts(m: ReportModel): [string, string][] {
  const c = m.config;
  const on = Object.entries(c.conditions).filter(([, v]) => v.enabled).map(([k]) => k);
  const log = Object.entries(m.data.log).map(([k, v]) => `${k} ${v}`).join(", ");
  return [
    ["Device", `${c.name} (${c.deviceId}), ${c.variant}, seed "${c.seed}"`],
    ["Spec profile", c.specProfile],
    ["Condition effects on", on.length ? on.join(", ") : "none (healthy default)"],
    ["Module health at start", c.moduleLifetimePct.map((p, i) => `bay ${i} ${p}%`).join(", ")],
    ["Device log", log || "nothing notable"],
    ["Undelivered at end", String(m.undelivered)],
  ];
}

export function renderMarkdown(m: ReportModel): string {
  const s = m.scenario;
  const d = m.data;
  const out: string[] = [];
  out.push(`# Validation report: ${s.id}`, "", s.description, "");
  out.push(`- Scenario: \`data/scenarios/${s.id}.json\`, room ${s.room.id}, ${time(d.from)} to ${time(d.to)}, generator seed "${m.seed}"`);
  for (const [k, v] of deviceFacts(m)) out.push(`- ${k}: ${v}`);
  out.push("", "## Summary", "");
  out.push(`- **Healthy readings within the spec envelope: ${pct(d.totals.healthy === 0 ? 1 : d.totals.healthyWithin / d.totals.healthy)}** (${fmt(d.totals.healthyWithin, 0)} of ${fmt(d.totals.healthy, 0)})`);
  out.push(`- Flagged readings: ${fmt(d.totals.flagged, 0)} of ${fmt(d.totals.readings, 0)}; backfilled after an outage: ${fmt(d.totals.backfilled, 0)}`);
  out.push("", "## Accuracy by parameter", "");
  out.push(`| ${STATS_HEAD.join(" | ")} |`, `|${STATS_HEAD.map(() => "---").join("|")}|`);
  for (const r of statsRows(m)) out.push(`| ${r.join(" | ")} |`);
  const groups = flagGroups(d.spans);
  out.push("", "## Flags and condition effects", "");
  if (groups.length === 0) out.push("No reading was flagged: every reading is covered by the spec envelope.");
  for (const g of groups) {
    out.push(`### ${g.flag}`, "", FLAG_MEANING[g.flag as Exclude<Flag, "backfilled">], "");
    out.push(`- Parameters: ${g.params.map(paramLabel).join(", ")}`);
    out.push(`- ${fmt(g.readings, 0)} readings in ${g.spans.length} period${g.spans.length === 1 ? "" : "s"}; largest excess beyond the envelope: ${fmt(g.maxExcess, 2)}`);
    for (const sp of g.spans.slice(0, 8)) out.push(`  - ${paramLabel(sp.param)}: ${time(sp.from - 60)} to ${time(sp.to)} (${sp.readings} readings, mean excess ${fmt(sp.meanExcess, 2)})`);
    if (g.spans.length > 8) out.push(`  - …and ${g.spans.length - 8} more periods`);
    out.push("");
  }
  out.push("## Scenario timeline", "");
  const spans = m.annotations.filter((a) => a.to > a.from);
  const points = m.annotations.filter((a) => a.to === a.from);
  for (const a of spans.slice(0, 30)) out.push(`- ${time(a.from)} to ${time(a.to)}: ${a.label}`);
  if (spans.length > 30) out.push(`- …and ${spans.length - 30} more periods`);
  if (points.length) out.push(`- ${points.length} occupancy and other instantaneous events (the HTML report, from \`pnpm vks report\`, shows them in each chart's event strip)`);
  out.push("", "## Method", "", METHOD_MD, "");
  return out.join("\n");
}

const METHOD_MD = `The scenario's true air runs through the virtual Sensedge Mini with the device settings above. **Reference** is the interval mean of the lagged true value: the target of the accuracy spec, so response time is not counted as inaccuracy. **Truth** is the interval mean without lag. **E** is the spec envelope at the reference. A reading is **healthy** when no flag excuses it; healthy readings must be within E (docs/08). **Lag** is the shift of the truth, in whole minutes up to 30, that best matches the readings; it is left blank when the truth barely moves. **Expected lag τ** is T90/ln 10 from the spec table (docs/02).`;

const CSS = `
:root { color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7;
  --border: rgba(11,11,11,0.10); --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --flag: rgba(137,135,129,0.16); --event: #c3c2b7; --good: #006300; }
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835;
  --border: rgba(255,255,255,0.10); --s1: #3987e5; --s2: #d95926; --s3: #199e70; --flag: rgba(195,194,183,0.12); --event: #383835; --good: #0ca30c; } }
:root[data-theme="dark"] { color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835;
  --border: rgba(255,255,255,0.10); --s1: #3987e5; --s2: #d95926; --s3: #199e70; --flag: rgba(195,194,183,0.12); --event: #383835; --good: #0ca30c; }
* { box-sizing: border-box; }
body { overflow-wrap: break-word; margin: 0; background: var(--page); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 32px 0 8px; } h3 { font-size: 15px; margin: 0; }
p, li, dd { color: var(--ink-2); }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 12px 0 0; }
.facts dt { color: var(--muted); } .facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
@media (max-width: 600px) { .facts { grid-template-columns: 1fr; } .facts dd { margin-bottom: 6px; } }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
.tile .label { color: var(--muted); font-size: 13px; } .tile .value { font-size: 28px; font-weight: 600; }
.tile.hero .value { font-size: 48px; line-height: 1.1; }
.scroll { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { padding: 6px 10px; text-align: right; border-bottom: 1px solid var(--grid); white-space: nowrap; font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; } th { color: var(--muted); font-weight: 500; white-space: normal; vertical-align: bottom; min-width: 64px; }
.chart { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
.legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 0; margin: 6px 0 0; font-size: 13px; }
.legend li { display: flex; align-items: center; gap: 6px; color: var(--ink-2); }
.key { display: inline-block; width: 16px; height: 2px; border-radius: 1px; }
.key-sensed { background: var(--s1); } .key-truth { background: var(--s2); } .key-ref { background: var(--s3); }
.swatch { display: inline-block; width: 14px; height: 10px; border-radius: 2px; }
.swatch-env { background: var(--s3); opacity: 0.2; } .swatch-flag { background: var(--flag); outline: 1px solid var(--border); }
.plot { position: relative; } svg { width: 100%; height: auto; display: block; outline: none; }
svg:focus-visible { box-shadow: 0 0 0 2px var(--s1); border-radius: 4px; }
.grid { stroke: var(--grid); stroke-width: 1; } .axis { stroke: var(--axis); stroke-width: 1; }
.tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line-sensed { stroke: var(--s1); } .line-truth { stroke: var(--s2); } .line-ref { stroke: var(--s3); }
.env { fill: var(--s3); opacity: 0.1; }
.flag { fill: var(--flag); } .flag-label { fill: var(--ink-2); font-size: 11px; }
.event, .event-tick { fill: var(--event); } .event-label { fill: var(--ink-2); font-size: 10px; }
.crosshair { stroke: var(--muted); stroke-width: 1; pointer-events: none; }
.tooltip { position: absolute; top: 40px; min-width: 170px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 12px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.tip-time { color: var(--muted); margin-bottom: 4px; } .tip-row { display: flex; align-items: center; gap: 6px; } .tip-row strong { color: var(--ink); min-width: 56px; }
.muted { color: var(--muted); }
details { margin-top: 8px; } summary { cursor: pointer; color: var(--ink-2); font-size: 13px; }
details .note { font-size: 12px; } details table { margin-top: 4px; }
.flag-group { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
.flag-group h3 code { font-size: 14px; }
`;

export function renderHtml(m: ReportModel): string {
  const s = m.scenario;
  const d = m.data;
  const inSpec = d.totals.healthy === 0 ? 1 : d.totals.healthyWithin / d.totals.healthy;
  const groups = flagGroups(d.spans);
  const table = (head: string[], rows: string[][]) =>
    `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const charts = m.charts
    .map((c) =>
      chartHtml({
        id: `chart-${c.param}`,
        param: c.param,
        points: c.points,
        bucketSeconds: c.bucketSeconds,
        from: d.from,
        to: d.to,
        spans: d.spans.filter((sp) => sp.param === c.param),
        annotations: m.annotations,
      }),
    )
    .join("\n");
  const flagHtml =
    groups.length === 0
      ? `<p>No reading was flagged: every reading is covered by the spec envelope.</p>`
      : groups
          .map(
            (g) => `<div class="flag-group"><h3><code>${esc(g.flag)}</code></h3><p>${esc(FLAG_MEANING[g.flag as Exclude<Flag, "backfilled">])}</p>
<p>${esc(`${fmt(g.readings, 0)} readings in ${g.spans.length} period${g.spans.length === 1 ? "" : "s"} (${g.params.map(paramLabel).join(", ")}); largest excess beyond the envelope ${fmt(g.maxExcess, 2)}. Shaded in the charts below.`)}</p>
${table(["Parameter", "From", "To", "Readings", "Mean excess", "Largest excess"], g.spans.slice(0, 12).map((sp) => [paramLabel(sp.param), time(sp.from - 60), time(sp.to), String(sp.readings), fmt(sp.meanExcess, 2), fmt(sp.maxExcess, 2)]))}${g.spans.length > 12 ? `<p class="muted">…and ${g.spans.length - 12} more periods.</p>` : ""}</div>`,
          )
          .join("\n");

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`Validation: ${s.id}`)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Validation report: ${esc(s.id)}</h1>
<p>${esc(s.description)}</p>
<dl class="facts">
<dt>Scenario</dt><dd>${esc(`data/scenarios/${s.id}.json · room ${s.room.id} · ${time(d.from)} to ${time(d.to)} · generator seed "${m.seed}"`)}</dd>
${deviceFacts(m).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n")}
</dl>
<div class="tiles">
<div class="tile hero"><div class="label">Healthy readings within the spec envelope</div><div class="value">${esc(pct(inSpec))}</div></div>
<div class="tile"><div class="label">Readings</div><div class="value">${esc(fmt(d.totals.readings, 0))}</div></div>
<div class="tile"><div class="label">Flagged readings</div><div class="value">${esc(fmt(d.totals.flagged, 0))}</div></div>
<div class="tile"><div class="label">Backfilled after an outage</div><div class="value">${esc(fmt(d.totals.backfilled, 0))}</div></div>
</div>
<h2>Accuracy by parameter</h2>
${table(STATS_HEAD, statsRows(m))}
<h2>Flags and condition effects</h2>
${flagHtml}
<h2>Sensed against true air</h2>
<p>Each chart shows what the device reported, the true air, and the reference (the lagged true value the accuracy spec applies to) with its spec envelope. Flagged periods are shaded; the strip above each plot marks scenario events (hover for details). Times are UTC.</p>
${charts}
<h2>Method</h2>
<p>${esc(METHOD_MD.replace(/\*\*/g, ""))}</p>
</main>
${CHART_SCRIPT}
</body>
</html>
`;
}

/** Rounds to 6 significant digits so the committed statistics don't churn on floating-point noise. */
const sig = (x: number) => (x === 0 || !Number.isFinite(x) ? x : Number(x.toPrecision(6)));

/** The report's numbers as stable JSON: what the committed drift check compares. */
export function renderStatsJson(m: ReportModel): string {
  const c = m.config;
  const d = m.data;
  const stats = {
    scenario: m.scenario.id,
    seed: m.seed,
    device: {
      deviceId: c.deviceId,
      variant: c.variant,
      seed: c.seed,
      specProfile: c.specProfile,
      conditionsOn: Object.entries(c.conditions).filter(([, v]) => v.enabled).map(([k]) => k),
      moduleLifetimePct: c.moduleLifetimePct,
    },
    from: formatIso(d.from),
    to: formatIso(d.to),
    totals: d.totals,
    params: d.params.map((p) => ({
      param: p.param,
      readings: p.readings,
      missing: p.missing,
      healthy: p.healthy,
      healthyWithinShare: sig(p.healthyWithinShare),
      withinShare: sig(p.withinShare),
      biasVsTruth: sig(p.biasVsTruth),
      maeVsTruth: sig(p.maeVsTruth),
      rmseVsTruth: sig(p.rmseVsTruth),
      maeVsReference: sig(p.maeVsReference),
      worstHealthyRatio: sig(p.worstHealthyRatio),
      lagMinutes: p.lagMinutes ?? null,
      expectedLagMinutes: sig(p.expectedLagMinutes),
      flagCounts: p.flagCounts,
    })),
    flags: flagGroups(d.spans).map((g) => ({
      flag: g.flag,
      params: g.params,
      periods: g.spans.length,
      readings: g.readings,
      maxExcess: sig(g.maxExcess),
      firstFrom: formatIso(g.spans[0]!.from - 60),
      lastTo: formatIso(g.spans[g.spans.length - 1]!.to),
    })),
    log: d.log,
    undelivered: m.undelivered,
  };
  return `${JSON.stringify(stats, null, 2)}\n`;
}

export function renderIndex(rows: { id: string; description: string; model: ReportModel }[]): string {
  const out = [
    "# Validation reports",
    "",
    "One report per scenario, from `pnpm vks report --all`. The Markdown summaries and `<id>.stats.json` statistics are committed, and a test fails if they drift from the code. The HTML reports with charts are generated on demand (gitignored) and attached to every CI run as the `validation-reports` artifact. Do not edit by hand.",
    "",
  ];
  out.push("| Scenario | Healthy in spec | Readings | Flagged | Flags | Report |", "|---|---|---|---|---|---|");
  for (const r of rows) {
    const t = r.model.data.totals;
    const flags = [...new Set(r.model.data.spans.map((s) => s.flag))].join(", ") || "none";
    out.push(`| ${r.id} | ${pct(t.healthy === 0 ? 1 : t.healthyWithin / t.healthy)} | ${fmt(t.readings, 0)} | ${fmt(t.flagged, 0)} | ${flags} | [Markdown](${r.id}.md) · [stats](${r.id}.stats.json) |`);
  }
  return `${out.join("\n")}\n`;
}

