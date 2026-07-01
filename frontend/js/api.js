/**
 * api.js — Centralised API layer.
 * All fetch() calls go through here. No fetch() elsewhere in the frontend.
 */

const BASE = "http://localhost:5000";

async function _get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function _post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Health ──────────────────────────────────────────────────
export const getHealth    = ()        => _get("/api/health");
export const getHomeKPIs  = ()        => _get("/api/home/kpis");

// ── Genre ───────────────────────────────────────────────────
export const getGenre         = () => _get("/api/genre");
export const getGenreWeekly   = () => _get("/api/genre/weekly");
export const getGenreRating   = () => _get("/api/genre-rating");

// ── Rating ──────────────────────────────────────────────────
export const getRating        = () => _get("/api/rating");

// ── Inventory ───────────────────────────────────────────────
export const getInventory         = ()         => _get("/api/inventory");
export const getInventoryFilms    = ()         => _get("/api/inventory/films");
export const getWeeklyRentals     = (filmId)   => _get(`/api/inventory/weekly/${filmId}`);
export const postRestock          = (body)     => _post("/api/restock", body);

// ── ML ──────────────────────────────────────────────────────
export const getFilmFeatures  = () => _get("/api/films/features");
export const getGenres        = () => _get("/api/genres");
export const postPredict      = (body) => _post("/api/predict", body);

// ── Transactions ─────────────────────────────────────────────
export const getCustomers     = () => _get("/api/customers");
export const getFilms         = () => _get("/api/films");
export const postRental       = (body) => _post("/api/rental", body);

// ── Summary ──────────────────────────────────────────────────
export const postRefresh      = () => _post("/api/summary/refresh", {});

// ── AI ───────────────────────────────────────────────────────
export const postAICommand    = (message, context) =>
  _post("/api/ai", { message, context });
