/**
 * ai_context.js
 *
 * Builds a safe AI-readable context object
 * from the currently visible dashboard state.
 *
 * Used by:
 * - AI popup/chat
 * - /api/ai requests
 */

import { ChartRegistry } from "./chart_registry.js";

/**
 * Limit labels/data sent to AI
 * Prevents huge prompts.
 */
const MAX_LABELS = 20;

/**
 * Safely truncate arrays
 */
function truncate(arr = [], limit = MAX_LABELS) {
  return Array.isArray(arr)
    ? arr.slice(0, limit)
    : [];
}

/**
 * Build AI-ready dashboard context.
 */
export function buildAIContext() {

  const charts = ChartRegistry.all().map(entry => {

    const chart = entry.chart;

    return {
      id: entry.id,

      title: entry.meta.title,

      description: entry.meta.description,

      entity: entry.meta.entity,

      metric: entry.meta.metric,

      page: entry.meta.page,

      chartType: chart.config.type,

      labels: truncate(chart.data.labels),

      datasets: chart.data.datasets.map(ds => ({
        label: ds.label || null,
        data: truncate(ds.data),
      })),

      totalLabels: chart.data.labels?.length || 0,

      visibleDatasets: chart.data.datasets.length,
    };
  });

  return {
    currentPage: window._currentPageKey || "unknown",

    timestamp: new Date().toISOString(),

    visibleCharts: charts.length,

    charts,
  };
}

/**
 * Human-readable summary
 * Useful for debugging + prompt injection into Gemini.
 */
export function buildContextSummary() {

  const ctx = buildAIContext();

  if (!ctx.charts.length) {
    return "No visible charts.";
  }

  return ctx.charts.map(chart => `
Chart ID: ${chart.id}
Title: ${chart.title}
Type: ${chart.chartType}
Labels: ${chart.labels.join(", ")}
Datasets: ${chart.datasets.map(d => d.label).join(", ")}
`.trim()).join("\n\n");
}