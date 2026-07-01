from flask import Blueprint, jsonify, request
from services.db_service import get_film_features, get_film_features_by_id, get_all_genres
from services import ml_service

ml_bp = Blueprint("ml", __name__)


@ml_bp.get("/api/films/features")
def film_features():
    try:
        data = get_film_features()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@ml_bp.get("/api/genres")
def genres():
    try:
        data = get_all_genres()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@ml_bp.post("/api/predict")
def predict():
    """
    Accepts a film feature dict (or film_id) and returns a popularity prediction.
    AI may NOT call /api/retrain — there is no such endpoint by design.
    """
    body = request.get_json(silent=True) or {}

    # If film_id given, fetch features from DB
    film_id = body.get("film_id")
    if film_id:
        row = get_film_features_by_id(int(film_id))
        if not row:
            return jsonify({"ok": False, "error": "Film not found"}), 404
        body = dict(row)

    try:
        result = ml_service.predict(body)
        return jsonify({"ok": True, "data": result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
