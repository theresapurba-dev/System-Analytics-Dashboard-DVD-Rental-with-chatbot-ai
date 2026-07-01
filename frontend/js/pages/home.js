/**
 * pages/home.js — Home dashboard page module.
 * Loads KPIs, shows critical stock alerts, wires navigate event.
 */
import { getHomeKPIs } from "../api.js";

export async function init() {
  // Wire feature card navigation events
  window.addEventListener("navigate", e => {
    document.querySelectorAll(`.nav-item[data-page="${e.detail}"]`)[0]?.click();
  });

  try {
    const res = await getHomeKPIs();
    if (!res.ok) { showError(res.error); return; }
    const d = res.data;

    document.getElementById("kpi-genres").textContent   = d.total_genres;
    document.getElementById("kpi-rentals").textContent  = d.total_rentals.toLocaleString();
    document.getElementById("kpi-revenue").textContent  = "$" + d.total_revenue.toLocaleString("en-US", { minimumFractionDigits: 2 });
    document.getElementById("kpi-top-genre").textContent = d.top_genre;
    document.getElementById("kpi-critical").textContent = d.critical_count;

    const alertBox = document.getElementById("home-alerts");

    if (d.critical_count > 0) {
      alertBox.innerHTML += `
        <div class="alert error">
          <div class="alert-icon">🚨</div>
          <div class="alert-body">
            <div class="alert-title">${d.critical_count} film(s) at CRITICAL stock level</div>
            <div class="alert-detail">${d.critical_films.join(" · ")}</div>
          </div>
        </div>`;
    }

    if (d.warning_count > 0) {
      alertBox.innerHTML += `
        <div class="alert warning">
          <div class="alert-icon">⚠️</div>
          <div class="alert-body">
            <div class="alert-title">${d.warning_count} film(s) at WARNING stock level</div>
            <div class="alert-detail">Navigate to Inventory Forecast for details.</div>
          </div>
        </div>`;
    }

  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
  document.getElementById("home-alerts").innerHTML =
    `<div class="error-state">Failed to load dashboard data: ${msg}</div>`;
}

export function cleanup() {
  window.removeEventListener("navigate", () => {});
}
