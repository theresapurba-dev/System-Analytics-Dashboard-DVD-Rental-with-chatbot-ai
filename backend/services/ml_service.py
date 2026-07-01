"""
services/ml_service.py — Loads the pre-trained Random Forest model at startup.
AI may NOT retrain the model. Prediction only.
"""
import os
import pickle
import numpy as np

FEATURE_NAMES = [
    "length", "rental_rate", "replacement_cost",
    "rental_duration", "num_actors",
    "has_behind_scenes", "has_commentaries",
    "has_deleted_scenes", "has_trailers",
    "genre_enc", "rating_enc",
]

GENRE_MAP = {
    "Action":1,"Animation":2,"Children":3,"Classics":4,"Comedy":5,
    "Documentary":6,"Drama":7,"Family":8,"Foreign":9,"Games":10,
    "Horror":11,"Music":12,"New":13,"Sci-Fi":14,"Sports":15,"Travel":16,
}
RATING_MAP = {"G":1,"PG":2,"PG-13":3,"R":4,"NC-17":5}

_model = None


def load_model(path: str):
    global _model
    if not os.path.exists(path):
        print(f"[WARN] ML model not found at {path}. Predictions will return defaults.")
        return
    try:
        with open(path, "rb") as f:
            _model = pickle.load(f)
        print(f"[OK] ML model loaded from {path}")
    except Exception as e:
        print(f"[ERR] Failed to load ML model: {e}")


def _build_features(row: dict) -> list:
    sf = str(row.get("special_features", "") or "").lower()
    genre  = row.get("genre_name", "Drama")
    rating = row.get("rating", "PG")
    return [
        float(row.get("length")           or 90),
        float(row.get("rental_rate")      or 2.99),
        float(row.get("replacement_cost") or 19.99),
        float(row.get("rental_duration")  or 3),
        float(row.get("num_actors")       or 5),
        1.0 if "behind"   in sf else 0.0,
        1.0 if "comment"  in sf else 0.0,
        1.0 if "deleted"  in sf else 0.0,
        1.0 if "trailer"  in sf else 0.0,
        float(GENRE_MAP.get(genre, 7)),
        float(RATING_MAP.get(rating, 2)),
    ]


def predict(row: dict) -> dict:
    """
    Returns:
        score         float  0-100
        label         str    'Popular 🔥' | 'Moderate 📊' | 'Niche 💤'
        color         str    hex
        feature_importance  list of [name, importance] pairs
    """
    if _model is None:
        return {
            "score": 50.0,
            "label": "Moderate 📊",
            "color": "#E6A341",
            "feature_importance": [[n, 1/len(FEATURE_NAMES)] for n in FEATURE_NAMES],
            "error": "Model not loaded",
        }

    try:
        X = np.array([_build_features(row)])

        if hasattr(_model, "predict_proba"):
            proba = _model.predict_proba(X)[0]
            score = float(proba[1]) * 100 if len(proba) >= 2 else float(proba[0]) * 100
        else:
            pred  = _model.predict(X)[0]
            score = 65.0 if pred == 1 else 35.0

        clf = _model.named_steps.get("clf") if hasattr(_model, "named_steps") else _model
        if hasattr(clf, "feature_importances_"):
            pairs = sorted(
                zip(FEATURE_NAMES, clf.feature_importances_),
                key=lambda x: x[1], reverse=True
            )
            feat_imp = [[n, round(float(v), 4)] for n, v in pairs[:8]]
        else:
            feat_imp = [[n, round(1/len(FEATURE_NAMES), 4)] for n in FEATURE_NAMES]

        score = round(score, 1)
        return {
            "score": score,
            "label": "Popular 🔥"  if score >= 60
                else "Moderate 📊" if score >= 40
                else "Niche 💤",
            "color": "#059669" if score >= 60 else "#E6A341" if score >= 40 else "#B14A36",
            "feature_importance": feat_imp,
        }

    except Exception as e:
        return {
            "score": 50.0,
            "label": "Moderate 📊",
            "color": "#E6A341",
            "feature_importance": [],
            "error": str(e),
        }
