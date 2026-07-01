from flask import Blueprint, jsonify
from services.db_service import get_rating_summary

rating_bp = Blueprint("rating", __name__)


@rating_bp.get("/api/rating")
def rating_summary():
    try:
        data = get_rating_summary()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
