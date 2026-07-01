/**
 * ai_controller.js — Receives a structured JSON command from the AI service
 * and executes it against the Chart.js registry.
 *
 * ALLOWED ACTIONS ONLY:
 *   change_chart_type · sort_chart · filter_chart · highlight_segment
 *   toggle_series · explain_chart · reset_chart
 *
 * AI CANNOT: modify SQL, access the DB, retrain models, or run arbitrary code.
 */

import { ChartRegistry } from "./chart_registry.js";

const CHART_COLORS = [
  "#E6A341","#B14A36","#8C0902","#FECE79","#210100",
  "#D4845A","#A0522D","#C0392B","#E67E22","#6C3483",
];

function getChart(target) {
  if (!target || target === "all") return null;
  const entry = ChartRegistry.get(target);
  if (!entry) {
    console.warn(`[AI] Chart not found in registry: ${target}`);
    return null;
  }
  return entry;
}

// ── Action handlers ──────────────────────────────────────────

function changeChartType(entry, params) {
  const { chart } = entry;
  const newType = params.type;
  const allowed = ["bar","line","doughnut","pie","radar","polarArea","horizontalBar"];
  if (!allowed.includes(newType)) return `Chart type '${newType}' is not supported.`;
  chart.config.type = newType;
  chart.update();
  return `Chart type changed to ${newType}.`;
}

function sortChart(entry, params) {
  const { chart } = entry;
  const dir = params.direction === "asc" ? 1 : -1;
  const key = params.key || "value";  // "value" | "label"

  chart.data.datasets.forEach(ds => {
    const pairs = chart.data.labels.map((lbl, i) => ({
      label: lbl,
      value: ds.data[i],
    }));
    pairs.sort((a, b) => {
      const av = key === "label" ? a.label : a.value;
      const bv = key === "label" ? b.label : b.value;
      return typeof av === "string"
        ? av.localeCompare(bv) * dir
        : (av - bv) * dir;
    });
    chart.data.labels   = pairs.map(p => p.label);
    ds.data              = pairs.map(p => p.value);
  });

  chart.update();
  return `Chart sorted ${params.direction === "asc" ? "ascending" : "descending"}.`;
}

function filterChart(entry, params) {
  const { chart, originalData } = entry;
  // Restore from original first
  chart.data.labels = [...originalData.labels];
  chart.data.datasets.forEach((ds, i) => {
    ds.data = [...originalData.datasets[i].data];
  });

  if (params.top_n) {
    const n = parseInt(params.top_n);
    // Take top N by first dataset value (descending)
    const indices = chart.data.labels
      .map((_, i) => i)
      .sort((a, b) => chart.data.datasets[0].data[b] - chart.data.datasets[0].data[a])
      .slice(0, n);

    chart.data.labels = indices.map(i => chart.data.labels[i]);
    chart.data.datasets.forEach(ds => {
      ds.data = indices.map(i => ds.data[i]);
    });
  } else if (params.segments && Array.isArray(params.segments)) {
    const keep = new Set(params.segments.map(s => s.toLowerCase()));
    const indices = chart.data.labels
      .map((lbl, i) => ({ lbl: lbl.toLowerCase(), i }))
      .filter(({ lbl }) => keep.has(lbl))
      .map(({ i }) => i);

    chart.data.labels = indices.map(i => chart.data.labels[i]);
    chart.data.datasets.forEach(ds => {
      ds.data = indices.map(i => ds.data[i]);
    });
  }

  chart.update();
  return params.top_n
    ? `Showing top ${params.top_n} entries.`
    : `Showing ${params.segments?.length} selected segments.`;
}

function highlightSegment(entry, params) {
  const { chart } = entry;
  const target = (params.segment || "").toLowerCase();

  chart.data.datasets.forEach(ds => {
    const colors = chart.data.labels.map((lbl, i) => {
      const match = lbl.toLowerCase() === target;
      if (Array.isArray(ds.backgroundColor)) {
        return match ? CHART_COLORS[0] : "rgba(150,140,130,0.3)";
      }
      return match ? CHART_COLORS[0] : "rgba(150,140,130,0.3)";
    });
    ds.backgroundColor = colors;
  });

  chart.update();
  return `Highlighted segment: ${params.segment}.`;
}

function toggleSeries(entry, params) {
  const { chart } = entry;
  const targetName = (params.series || "").toLowerCase();
  let found = false;

  chart.data.datasets.forEach((ds, i) => {
    if (ds.label && ds.label.toLowerCase().includes(targetName)) {
      const meta = chart.getDatasetMeta(i);
      meta.hidden = params.visible === false ? true : !meta.hidden;
      found = true;
    }
  });

  chart.update();
  return found
    ? `Series '${params.series}' ${params.visible === false ? "hidden" : "toggled"}.`
    : `Series '${params.series}' not found.`;
}

function explainChart(entry, params) {
  // The explanation text comes from Gemini; we just surface it
  return params.text || "No explanation available.";
}

function resetChart(entry) {
  if (!entry) return;
  const { chart, originalData, originalOptions } = entry;
  chart.data = JSON.parse(JSON.stringify(originalData));
  chart.options = JSON.parse(JSON.stringify(originalOptions));
  chart.update();
}

function resetAll() {
  for (const id of ChartRegistry.ids()) {
    const entry = ChartRegistry.get(id);
    if (entry) resetChart(entry);
  }
}

// ── Main executor ─────────────────────────────────────────────

/**
 * Execute a command object returned by the AI service.
 * Returns { success: bool, message: str }
 */
export function executeCommand(command) {
  const { action, target, params = {} } = command;

  if (action === "error") {
    return { success: false, message: command.message || "AI error." };
  }

  if (action === "reset_chart") {
    if (!target || target === "all") {
      resetAll();
      return { success: true, message: "All charts reset to original state." };
    }
    const entry = getChart(target);
    if (!entry) return { success: false, message: `Chart '${target}' not found.` };
    resetChart(entry);
    return { success: true, message: `Chart '${target}' reset.` };
  }

  const entry = getChart(target);
  if (!entry) {
    return { success: false, message: `Chart '${target}' is not visible on this page.` };
  }

  try {
    let msg;
    switch (action) {
      case "change_chart_type":  msg = changeChartType(entry, params);  break;
      case "sort_chart":         msg = sortChart(entry, params);         break;
      case "filter_chart":       msg = filterChart(entry, params);       break;
      case "highlight_segment":  msg = highlightSegment(entry, params);  break;
      case "toggle_series":      msg = toggleSeries(entry, params);      break;
      case "explain_chart":      msg = explainChart(entry, params);      break;
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
    return { success: true, message: msg };
  } catch (err) {
    console.error("[AI Controller]", err);
    return { success: false, message: `Execution error: ${err.message}` };
  }
}
