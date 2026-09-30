// One chart per parameter (docs/08), following the dataviz method: one y-axis, three series in
// the first three categorical slots (sensed, true, reference), the spec envelope as a 10% wash
// around the reference, flagged periods as neutral washes, scenario events in a strip above the
// plot, a legend, a crosshair tooltip, and a data table so no value needs the hover.

import { SENSEDGE_MINI, formatIso, type FlagSpan, type ParamId } from "@vks/core";
import type { Annotation } from "@vks/true-air-gen";
import { paramLabel, type ChartPoint } from "./model.js";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const W = 960;
const PH = 236;
const M = { left: 60, right: 16, bottom: 30 };
const PW = W - M.left - M.right;
const STRIP_Y = 6;
const LANE = 15;

/** Puts overlapping event spans in separate lanes; instantaneous events share lane 0. */
function lanes(events: Annotation[]): { a: Annotation; lane: number }[] {
  const ends: number[] = [];
  return events.map((a) => {
    if (a.to <= a.from) return { a, lane: 0 };
    let lane = ends.findIndex((end) => end <= a.from);
    if (lane === -1) lane = ends.length;
    ends[lane] = a.to;
    return { a, lane };
  });
}

export function fmt(x: number, decimals: number): string {
  if (Object.is(Math.round(x * 10 ** decimals), -0) || Math.round(x * 10 ** decimals) === 0) x = 0;
  return x.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

function timeTicks(from: number, to: number): { t: number; label: string }[] {
  const span = to - from;
  const steps = [600, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400, 172_800, 604_800];
  const step = steps.find((s) => span / s <= 8) ?? 604_800;
  const out: { t: number; label: string }[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const iso = formatIso(t);
    out.push({ t, label: step >= 86_400 ? iso.slice(5, 10) : iso.slice(11, 16) });
  }
  return out;
}

const path = (pts: ChartPoint[], key: "value" | "truth" | "reference", x: (t: number) => number, y: (v: number) => number) => {
  let d = "";
  let pen = false;
  for (const p of pts) {
    const v = p[key];
    if (v === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  }
  return d;
};

function band(pts: ChartPoint[], x: (t: number) => number, y: (v: number) => number, floor: number): string {
  // One closed polygon per run of points with data.
  const runs: ChartPoint[][] = [];
  let run: ChartPoint[] = [];
  for (const p of pts) {
    if (p.reference === null || p.envelope === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(p);
  }
  if (run.length) runs.push(run);
  return runs
    .map((r) => {
      const top = r.map((p) => `${x(p.t).toFixed(1)},${y(p.reference! + p.envelope!).toFixed(1)}`);
      const bottom = [...r].reverse().map((p) => `${x(p.t).toFixed(1)},${y(Math.max(floor, p.reference! - p.envelope!)).toFixed(1)}`);
      return `M${top.join("L")}L${bottom.join("L")}Z`;
    })
    .join("");
}

export interface ChartInput {
  id: string;
  param: ParamId;
  points: ChartPoint[];
  bucketSeconds: number;
  from: number;
  to: number;
  spans: FlagSpan[];
  annotations: Annotation[];
}

export function chartHtml(c: ChartInput): string {
  const decimals = SENSEDGE_MINI[c.param].decimals;
  const floor = c.param === "temp" ? -Infinity : 0;
  const vals = c.points.flatMap((p) => [p.value, p.truth, p.reference === null ? null : p.reference + p.envelope!, p.reference === null ? null : Math.max(floor, p.reference - p.envelope!)]).filter((v): v is number => v !== null);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.06;
  const nonNegative = c.param !== "temp";
  if (nonNegative) lo = Math.max(0, lo);
  lo = nonNegative ? Math.max(0, lo - pad) : lo - pad; // never pad a non-negative quantity below zero
  hi += pad;
  const visible = c.annotations.filter((a) => a.to >= c.from - c.bucketSeconds && a.from <= c.to + c.bucketSeconds);
  const laid = lanes(visible);
  const laneCount = Math.max(1, ...laid.map((l) => l.lane + 1));
  const top = STRIP_Y + laneCount * LANE + 10;
  const H = top + PH + M.bottom;
  const ticks = niceTicks(lo, hi);
  lo = Math.min(lo, ticks[0]!);
  hi = Math.max(hi, ticks[ticks.length - 1]!);
  const t0 = c.from - c.bucketSeconds / 2;
  const t1 = c.to + c.bucketSeconds / 2;
  const x = (t: number) => M.left + ((t - t0) / (t1 - t0 || 1)) * PW;
  const y = (v: number) => top + PH - ((v - lo) / (hi - lo || 1)) * PH;

  const spanRects = c.spans
    .map((s) => {
      const x0 = x(s.from - 60);
      const w = Math.max(2, x(s.to) - x0);
      const label = w > 70 ? `<text class="flag-label" x="${(x0 + 4).toFixed(1)}" y="${top + 12}">${esc(s.flag)}</text>` : "";
      return `<g><rect class="flag" x="${x0.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${PH}"><title>${esc(`${s.flag}: ${formatIso(s.from - 60)} to ${formatIso(s.to)}, ${s.readings} readings`)}</title></rect>${label}</g>`;
    })
    .join("");
  const strip = laid
    .map(({ a, lane }) => {
      const x0 = x(Math.max(a.from, t0));
      const w = x(Math.min(a.to, t1)) - x0;
      const ly = STRIP_Y + lane * LANE;
      const title = `<title>${esc(`${a.label}: ${formatIso(a.from)}${a.to > a.from ? ` to ${formatIso(a.to)}` : ""}`)}</title>`;
      if (w < 2) return `<g><rect class="event-tick" x="${(x0 - 1).toFixed(1)}" y="${ly}" width="2" height="12">${title}</rect></g>`;
      const text = w > a.label.length * 6.5 + 8 ? `<text class="event-label" x="${(x0 + 4).toFixed(1)}" y="${ly + 9}">${esc(a.label)}</text>` : "";
      return `<g><rect class="event" x="${x0.toFixed(1)}" y="${ly}" width="${w.toFixed(1)}" height="12" rx="2">${title}</rect>${text}</g>`;
    })
    .join("");
  const tickStep = ticks.length > 1 ? ticks[1]! - ticks[0]! : 1;
  const tickDecimals = [0, 1, 2, 3, 4].find((d) => Math.abs(Math.round(tickStep * 10 ** d) - tickStep * 10 ** d) < 1e-6) ?? 4;
  const yTicks = ticks.map((v) => `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="tick" x="${M.left - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(v, tickDecimals))}</text>`).join("");
  const xTicks = timeTicks(t0, t1).map((tk) => `<text class="tick" x="${x(tk.t).toFixed(1)}" y="${H - 10}" text-anchor="middle">${esc(tk.label)}</text>`).join("");

  const data = { d: decimals, x0: t0, x1: t1, p: c.points.map((p) => [p.t, p.value, p.truth, p.reference, p.envelope].map((v) => (v === null ? null : Math.round(v * 1000) / 1000))) };
  const tableStep = Math.max(1, Math.ceil(c.points.length / 48));
  const rows = c.points
    .filter((_, i) => i % tableStep === 0)
    .map((p) => `<tr><td>${esc(formatIso(Math.round(p.t)))}</td>${[p.value, p.truth, p.reference, p.envelope].map((v) => `<td>${v === null ? "–" : esc(fmt(v, decimals + (decimals === 0 ? 1 : 0)))}</td>`).join("")}</tr>`)
    .join("");
  const bucketNote = c.bucketSeconds > 60 ? ` Each point is a ${Math.round(c.bucketSeconds / 60)}-minute mean.` : "";

  return `<figure class="chart" id="${esc(c.id)}">
<figcaption><h3>${esc(paramLabel(c.param))}</h3>
<ul class="legend"><li><span class="key key-sensed"></span>Sensed (reported)</li><li><span class="key key-truth"></span>True air</li><li><span class="key key-ref"></span>Reference (lagged truth)</li><li><span class="swatch swatch-env"></span>Spec envelope</li><li><span class="swatch swatch-flag"></span>Flagged period</li></ul></figcaption>
<div class="plot"><svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(`${paramLabel(c.param)}: sensed, true and reference values over time`)}">
<g class="strip">${strip}</g>
${yTicks}
<line class="axis" x1="${M.left}" x2="${W - M.right}" y1="${top + PH}" y2="${top + PH}"/>
${spanRects}
<path class="env" d="${band(c.points, x, y, floor)}"/>
<path class="line line-ref" d="${path(c.points, "reference", x, y)}"/>
<path class="line line-truth" d="${path(c.points, "truth", x, y)}"/>
<path class="line line-sensed" d="${path(c.points, "value", x, y)}"/>
${xTicks}
<line class="crosshair" x1="0" x2="0" y1="${top}" y2="${top + PH}" visibility="hidden"/>
<rect class="hit" x="${M.left}" y="${top}" width="${PW}" height="${PH}" fill="transparent"/>
</svg><div class="tooltip" hidden></div></div>
<script type="application/json" class="chart-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<details><summary>Data table</summary><p class="note">Times are UTC.${esc(bucketNote)}</p><div class="scroll"><table><thead><tr><th>Time</th><th>Sensed</th><th>True</th><th>Reference</th><th>± Envelope</th></tr></thead><tbody>${rows}</tbody></table></div></details>
</figure>`;
}

/** Crosshair and tooltip for every chart; values go in with textContent. */
export const CHART_SCRIPT = `<script>
(() => {
  const W = ${W}, L = ${M.left}, PW = ${PW};
  const fmt = (v, d) => v === null ? "–" : v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
  for (const fig of document.querySelectorAll("figure.chart")) {
    const data = JSON.parse(fig.querySelector(".chart-data").textContent);
    const svg = fig.querySelector("svg"), line = fig.querySelector(".crosshair"), tip = fig.querySelector(".tooltip");
    let index = -1;
    const show = (i) => {
      index = Math.max(0, Math.min(data.p.length - 1, i));
      const [t, v, tr, ref, env] = data.p[index];
      const px = L + ((t - data.x0) / (data.x1 - data.x0)) * PW;
      line.setAttribute("x1", px); line.setAttribute("x2", px); line.setAttribute("visibility", "visible");
      tip.replaceChildren();
      const head = document.createElement("div"); head.className = "tip-time";
      head.textContent = new Date(Math.round(t) * 1000).toISOString().replace(".000Z", "Z").replace("T", " ");
      tip.append(head);
      for (const [cls, label, val] of [["key-sensed", "Sensed", v], ["key-truth", "True air", tr], ["key-ref", "Reference", ref]]) {
        const row = document.createElement("div"); row.className = "tip-row";
        const key = document.createElement("span"); key.className = "key " + cls;
        const num = document.createElement("strong"); num.textContent = fmt(val, data.d);
        const name = document.createElement("span"); name.textContent = label;
        row.append(key, num, name); tip.append(row);
      }
      const e = document.createElement("div"); e.className = "tip-row muted";
      e.textContent = "Envelope ± " + fmt(env, data.d + 1); tip.append(e);
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const left = (px / W) * rect.width;
      tip.style.left = Math.min(Math.max(0, left + 12), rect.width - 190) + "px";
    };
    const hide = () => { line.setAttribute("visibility", "hidden"); tip.hidden = true; };
    svg.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const t = data.x0 + ((x - L) / PW) * (data.x1 - data.x0);
      let best = 0;
      for (let i = 1; i < data.p.length; i++) if (Math.abs(data.p[i][0] - t) < Math.abs(data.p[best][0] - t)) best = i;
      show(best);
    });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("focus", () => show(index < 0 ? 0 : index));
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight") { show(index + 1); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { show(index - 1); ev.preventDefault(); }
    });
  }
})();
</script>`;
