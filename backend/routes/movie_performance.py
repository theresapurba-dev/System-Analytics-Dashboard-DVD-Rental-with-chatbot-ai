"""
routes/movie_performance.py — Movie Performance page API.
Six dedicated endpoints, all reading from existing summary/fact tables.
SQL is NEVER modified here; all queries live in db_service.py.
"""
from flask import Blueprint, jsonify
from services.db_service import (
    get_mp_kpis,
    get_genre_summary,
    get_rating_summary,
    get_genre_revenue_by_rating,
    get_genre_rating_distribution,
    get_rental_frequency,
    get_rental_share,
    get_top_combinations,
)

mp_bp = Blueprint("movie_performance", __name__)


# ── 1. KPIs ───────────────────────────────────────────────────────────────────
@mp_bp.get("/api/mp/kpis")
def mp_kpis():
    try:
        return jsonify({"ok": True, "data": get_mp_kpis()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 2. Genre vs Rating Distribution  (grouped bar) ────────────────────────────
@mp_bp.get("/api/mp/genre-rating-distribution")
def genre_rating_distribution():
    try:
        return jsonify({"ok": True, "data": get_genre_rating_distribution()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 3. Revenue by Genre + Rating  (stacked bar) ───────────────────────────────
@mp_bp.get("/api/mp/revenue-by-genre-rating")
def revenue_by_genre_rating():
    try:
        return jsonify({"ok": True, "data": get_genre_revenue_by_rating()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 4. Rental Frequency Comparison  (horizontal bar) ─────────────────────────
@mp_bp.get("/api/mp/rental-frequency")
def rental_frequency():
    try:
        return jsonify({"ok": True, "data": get_rental_frequency()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 5. Rental Share Percentage  (doughnut) ────────────────────────────────────
@mp_bp.get("/api/mp/rental-share")
def rental_share():
    try:
        return jsonify({"ok": True, "data": get_rental_share()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 6. Top Combinations  (heatmap grid) ──────────────────────────────────────
@mp_bp.get("/api/mp/top-combinations")
def top_combinations():
    try:
        return jsonify({"ok": True, "data": get_top_combinations()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 7. Genre summary (reused by genre tab) ────────────────────────────────────
@mp_bp.get("/api/mp/genre-summary")
def genre_summary():
    try:
        return jsonify({"ok": True, "data": get_genre_summary()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── 8. Rating summary (reused by rating tab) ─────────────────────────────────
@mp_bp.get("/api/mp/rating-summary")
def rating_summary():
    try:
        return jsonify({"ok": True, "data": get_rating_summary()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
