from flask import Blueprint, jsonify
from services.db_service import refresh_all_summaries

summary_bp = Blueprint("summary", __name__)


@summary_bp.post("/api/summary/refresh")
def refresh():
    try:
        ok = refresh_all_summaries()
        if ok:
            return jsonify({"ok": True, "message": "All summary tables refreshed."})
        else:
            return jsonify({"ok": False, "error": "Refresh failed — check server logs."}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
