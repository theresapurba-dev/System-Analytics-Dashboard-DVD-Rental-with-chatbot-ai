/**
 * pages/inventory.js — Inventory Forecast page.
 * Stock chart, SMA forecast, velocity, restock form.
 */
import { getInventory, getInventoryFilms, getWeeklyRentals, postRestock } from "../api.js";
import { ChartRegistry } from "../chart_registry.js";

let _allInventory = [];
let _smaChart = null;

// ── Helpers ──────────────────────────────────────────────────

function colorByDays(d) {
  if (d <= 3)  return "#8C0902";
  if (d <= 7)  return "#E6A341";
  return "#2563eb";
}

function buildInventoryKPIs(data) {
  const critical = data.filter(d => d.stock_status === "CRITICAL").length;
  const warning  = data.filter(d => d.stock_status === "WARNING").length;
  const ok       = data.filter(d => d.stock_status === "OK").length;
  const avg      = data.filter(d => d.rental_per_day > 0)
                       .reduce((s, d) => s + parseFloat(d.rental_per_day), 0) /
                   (data.filter(d => d.rental_per_day > 0).length || 1);

  const el = document.getElementById("inventory-kpis");
  el.innerHTML = [
    { label: "Films Tracked",  value: data.length },
    { label: "Critical (≤1)",  value: critical, accent: "#8C0902" },
    { label: "Warning (≤3)",   value: warning,  accent: "#E6A341" },
    { label: "OK",             value: ok,       accent: "#059669" },
    { label: "Avg Velocity",   value: avg.toFixed(3) + "/day" },
  ].map(k => `
    <div class="kpi-card" style="--accent:${k.accent || "var(--clr-gold)"}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>`).join("");
}

function buildStockChart(data) {
  const filtered = data
    .filter(d => d.days_to_empty < 999)
    .sort((a, b) => a.days_to_empty - b.days_to_empty)
    .slice(0, 25);

  ChartRegistry.destroy("stock_chart");
  const ctx = document.getElementById("stock_chart")?.getContext("2d");
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels:   filtered.map(d => d.title),
      datasets: [{
        label:           "Days to Empty",
        data:            filtered.map(d => d.days_to_empty),
        backgroundColor: filtered.map(d => colorByDays(d.days_to_empty)),
        borderRadius:    5,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Days" }, grid: { color: "rgba(0,0,0,.05)" } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });
  ChartRegistry.register("stock_chart", chart);
}

function buildVelocityChart(data) {
  const top20 = data
    .filter(d => d.rental_per_day > 0)
    .sort((a, b) => b.rental_per_day - a.rental_per_day)
    .slice(0, 20);

  ChartRegistry.destroy("velocity_chart");
  const ctx = document.getElementById("velocity_chart")?.getContext("2d");
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels:   top20.map(d => d.title),
      datasets: [{
        label:           "Rentals/Day",
        data:            top20.map(d => parseFloat(d.rental_per_day)),
        backgroundColor: "#059669",
        borderRadius:    5,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Rentals / day" }, grid: { color: "rgba(0,0,0,.05)" } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });
  ChartRegistry.register("velocity_chart", chart);
}

function buildInventoryTable(data) {
  const el = document.getElementById("inventory-table");
  if (!el) return;
  el.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Film</th><th>Stock</th><th>Rentals/Day</th><th>Days to Empty</th><th>Status</th></tr></thead>
        <tbody>${data.map(d => `<tr>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.title}</td>
          <td>${d.current_stock}</td>
          <td>${parseFloat(d.rental_per_day).toFixed(3)}</td>
          <td>${d.days_to_empty >= 999 ? "∞" : d.days_to_empty}</td>
          <td><span class="badge ${d.stock_status.toLowerCase()}">${d.stock_status}</span></td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function buildAlerts(data) {
  const critical = data.filter(d => d.stock_status === "CRITICAL");
  const warning  = data.filter(d => d.stock_status === "WARNING");
  const el = document.getElementById("inventory-alerts");
  el.innerHTML = "";
  if (critical.length) {
    el.innerHTML += `
      <div class="alert error">
        <div class="alert-icon">🚨</div>
        <div class="alert-body">
          <div class="alert-title">${critical.length} films at CRITICAL stock (≤1 copy)</div>
          <div class="alert-detail">${critical.slice(0,5).map(d => `<b>${d.title}</b> (${d.current_stock} left)`).join(" · ")}</div>
        </div>
      </div>`;
  }
  if (warning.length) {
    el.innerHTML += `
      <div class="alert warning">
        <div class="alert-icon">⚠️</div>
        <div class="alert-body">
          <div class="alert-title">${warning.length} films at WARNING level (≤3 copies)</div>
        </div>
      </div>`;
  }
}

// ── SMA forecast ──────────────────────────────────────────────

async function loadSMAForecast() {
  const filmId = document.getElementById("sma-film-select")?.value;
  const window_ = parseInt(document.getElementById("sma-window")?.value || 4);
  if (!filmId) return;

  const res = await getWeeklyRentals(filmId).catch(() => null);
  if (!res?.ok || !res.data.length) {
    document.getElementById("sma-kpis").innerHTML =
      `<div class="alert info"><div class="alert-body">No rental history for this film.</div></div>`;
    return;
  }

  const raw = res.data.sort((a, b) =>
    new Date(a.week_start_date) - new Date(b.week_start_date));

  const labels  = raw.map(d => d.week_start_date.slice(0, 10));
  const actuals = raw.map(d => parseInt(d.weekly_rental));

  // Compute SMA
  const sma = actuals.map((_, i) => {
    if (i < window_ - 1) return null;
    const slice = actuals.slice(i - window_ + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / window_;
  });

  const lastSMA = sma.filter(v => v !== null).at(-1) || 0;
  const lastDate = new Date(labels.at(-1));
  const forecastLabels = [];
  const forecastVals   = [];
  for (let i = 1; i <= 4; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + 7 * i);
    forecastLabels.push(d.toISOString().slice(0, 10));
    forecastVals.push(+(lastSMA * (1 + (Math.random() - 0.5) * 0.06)).toFixed(1));
  }

  const allLabels = [...labels, ...forecastLabels];

  // SMA padded to allLabels length
  const smaPadded  = [...sma, ...forecastLabels.map(() => null)];
  const forecastFull = [...labels.map(() => null), ...forecastVals];

  if (_smaChart) { _smaChart.destroy(); ChartRegistry.destroy("sma_chart"); }
  const ctx = document.getElementById("sma_chart")?.getContext("2d");
  if (!ctx) return;

  _smaChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allLabels,
      datasets: [
        {
          label: "Actual Rentals",
          data:  [...actuals, ...forecastLabels.map(() => null)],
          borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,.1)",
          tension: .3, pointRadius: 3, fill: false,
        },
        {
          label: `SMA-${window_}`,
          data: smaPadded,
          borderColor: "#2563eb", borderWidth: 2.5,
          tension: .3, pointRadius: 0, fill: false,
        },
        {
          label: "Forecast (4 wks)",
          data: forecastFull,
          borderColor: "#059669", borderDash: [5,5], borderWidth: 2,
          pointRadius: 5, pointStyle: "diamond", fill: false,
        },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } },
        y: { title: { display: true, text: "Rentals" }, grid: { color: "rgba(0,0,0,.05)" } },
      }
    }
  });
  ChartRegistry.register("sma_chart", _smaChart);

  // SMA KPIs
  document.getElementById("sma-kpis").innerHTML = [
    { label: "SMA Trend",      value: lastSMA.toFixed(1) + " /wk" },
    { label: "Forecast Week 1", value: forecastVals[0].toFixed(0) + " rentals", accent: "#2563eb" },
    { label: "Forecast Week 4", value: forecastVals[3].toFixed(0) + " rentals", accent: "#059669" },
  ].map(k => `
    <div class="kpi-card" style="--accent:${k.accent || "var(--clr-gold)"}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>`).join("");
}

// ── Tabs ─────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

// ── Init ──────────────────────────────────────────────────────

export async function init() {
  initTabs();

  // Load main inventory data
  const res = await getInventory().catch(() => null);
  if (!res?.ok) {
    document.getElementById("inventory-alerts").innerHTML =
      `<div class="error-state">Failed to load inventory data.</div>`;
    return;
  }

  _allInventory = res.data;
  buildAlerts(_allInventory);
  buildInventoryKPIs(_allInventory);
  buildStockChart(_allInventory);
  buildVelocityChart(_allInventory);
  buildInventoryTable(_allInventory);

  // Filter select
  document.getElementById("inv-filter")?.addEventListener("change", e => {
    const filtered = e.target.value === "ALL"
      ? _allInventory
      : _allInventory.filter(d => d.stock_status === e.target.value);
    buildStockChart(filtered);
    buildInventoryTable(filtered);
  });

  // Load films for SMA + restock selects
  const filmsRes = await getInventoryFilms().catch(() => null);
  if (filmsRes?.ok) {
    const smaSelect     = document.getElementById("sma-film-select");
    const restockSelect = document.getElementById("restock-film");

    filmsRes.data.forEach(f => {
      [smaSelect, restockSelect].forEach(sel => {
        if (!sel) return;
        const opt = document.createElement("option");
        opt.value = f.film_id;
        opt.textContent = f.title;
        sel.appendChild(opt);
      });
    });
  }

  // SMA window slider
  document.getElementById("sma-window")?.addEventListener("input", e => {
    document.getElementById("sma-window-label").textContent = e.target.value + " weeks";
  });

  document.getElementById("btn-load-sma")?.addEventListener("click", loadSMAForecast);

  // Restock form
  document.getElementById("btn-restock")?.addEventListener("click", async () => {
    const film_id  = parseInt(document.getElementById("restock-film")?.value);
    const store_id = parseInt(document.getElementById("restock-store")?.value || 1);
    const qty      = parseInt(document.getElementById("restock-qty")?.value || 5);
    const msgEl    = document.getElementById("restock-msg");

    msgEl.innerHTML = `<div class="loading-state" style="padding:.5rem"><div class="spinner"></div> Restocking…</div>`;

    try {
      const res = await postRestock({ film_id, store_id, qty });
      if (res.ok) {
        msgEl.innerHTML = `<div class="alert success"><div class="alert-icon">✓</div><div class="alert-body">${res.message}</div></div>`;
        // Reload inventory data
        const fresh = await getInventory();
        if (fresh.ok) {
          _allInventory = fresh.data;
          buildAlerts(_allInventory);
          buildInventoryKPIs(_allInventory);
          buildStockChart(_allInventory);
          buildVelocityChart(_allInventory);
          buildInventoryTable(_allInventory);
        }
      } else {
        msgEl.innerHTML = `<div class="alert error"><div class="alert-icon">!</div><div class="alert-body">${res.error}</div></div>`;
      }
    } catch (e) {
      msgEl.innerHTML = `<div class="alert error"><div class="alert-icon">!</div><div class="alert-body">${e.message}</div></div>`;
    }
  });
}

export function cleanup() {
  if (_smaChart) _smaChart.destroy();
}
