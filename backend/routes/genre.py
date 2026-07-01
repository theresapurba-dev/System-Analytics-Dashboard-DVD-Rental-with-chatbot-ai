from flask import Blueprint, jsonify
from services.db_service import get_genre_summary, get_genre_weekly, get_genre_rating_distribution

genre_bp = Blueprint("genre", __name__)


@genre_bp.get("/api/genre")
def genre_summary():
    try:
        data = get_genre_summary()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@genre_bp.get("/api/genre/weekly")
def genre_weekly():
    try:
        data = get_genre_weekly()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@genre_bp.get("/api/genre-rating")
def genre_rating():
    try:
        data = get_genre_rating_distribution()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
