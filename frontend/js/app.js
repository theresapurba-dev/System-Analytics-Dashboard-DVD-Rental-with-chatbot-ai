/**
 * app.js — SPA router.
 * Loads page HTML into #page-content and runs the page's JS module.
 * Uses the hash (#home, #movie, #ml, #inventory) for navigation.
 */

import { ChartRegistry } from "./chart_registry.js";

const PAGES = {
  home:      { title: "Home",                   html: "./pages/home.html",              js: "./js/pages/home.js" },
  movie:     { title: "Movie Performance",       html: "./pages/movie_performance.html", js: "./js/pages/movie_performance.js" },
  ml:        { title: "Next Big Hit Predictor",  html: "./pages/next_big_hit.html",      js: "./js/pages/next_big_hit.js" },
  inventory: { title: "Inventory Forecast",      html: "./pages/inventory.html",         js: "./js/pages/inventory.js" },
};

let _currentPage = null;
let _currentModule = null;

async function navigate(pageKey) {
  const page = PAGES[pageKey];
  if (!page) { navigate("home"); return; }

  // Destroy all charts from previous page
  ChartRegistry.destroyAll();

  // Cleanup previous module
  if (_currentModule && typeof _currentModule.cleanup === "function") {
    _currentModule.cleanup();
  }

  // Load HTML
  const content = document.getElementById("page-content");
  content.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading…</div>`;

  try {
    const res = await fetch(page.html);
    if (!res.ok) throw new Error("Page HTML not found");
    content.innerHTML = await res.text();
  } catch (e) {
    content.innerHTML = `<div class="error-state">Failed to load page: ${e.message}</div>`;
    return;
  }

  // Update topbar title
  document.getElementById("topbar-title").textContent = page.title;

  // Update sidebar active state
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === pageKey);
  });

  // Load and run page module (cache-bust in dev)
  try {
    _currentModule = await import(`${page.js}?v=${Date.now()}`);
    if (typeof _currentModule.init === "function") {
      await _currentModule.init();
    }
  } catch (e) {
    console.error(`[Router] Failed to init page module ${pageKey}:`, e);
  }

  _currentPage = pageKey;
  // Update hash without triggering popstate
  history.replaceState(null, "", `#${pageKey}`);

  // Let AI popup know which page + charts are active
  window._currentPageKey = pageKey;
}

// ── Entry point ──────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Sidebar nav clicks
  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    el.addEventListener("click", () => navigate(el.dataset.page));
  });

  // Back/forward
  window.addEventListener("popstate", () => {
    const hash = location.hash.replace("#", "") || "home";
    navigate(hash);
  });

  // Initial load from hash or default
  const initial = location.hash.replace("#", "") || "home";
  navigate(initial);
});

// Expose for AI popup context
export { navigate };
