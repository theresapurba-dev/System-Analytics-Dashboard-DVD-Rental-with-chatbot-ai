from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import pickle
import numpy as np
from db import query

router = APIRouter()

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "random_forest_model.pkl")

def load_model():
    if not os.path.exists(MODEL_PATH):
        raise HTTPException(
            status_code=503,
            detail="Model not trained yet. Run train_model.py first."
        )
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)

class PredictRequest(BaseModel):
    rating: str
    genre_name: str
    length: float
    num_actors: int
    rental_rate: float
    replacement_cost: Optional[float] = 19.99
    rental_duration: Optional[int] = 5

RATING_MAP = {"G": 0, "PG": 1, "PG-13": 2, "R": 3, "NC-17": 4}

@router.get("/films")
def get_all_films():
    try:
        rows = query("""
            SELECT film_id, title, genre_name, rating, length,
                rental_rate, replacement_cost, rental_duration,
                num_actors, special_features, total_rental,
                total_revenue, is_popular
            FROM summary_film_features
            ORDER BY title
        """)
        return [
            {
                "film_id": r["film_id"],
                "title": r["title"],
                "genre_name": r["genre_name"],
                "rating": r["rating"],
                "length": r["length"],
                "rental_rate": float(r["rental_rate"]) if r["rental_rate"] else 0,
                "replacement_cost": float(r["replacement_cost"]) if r["replacement_cost"] else 0,
                "rental_duration": r["rental_duration"],
                "num_actors": r["num_actors"],
                "special_features": r["special_features"],
                "total_rental": r["total_rental"],
                "total_revenue": float(r["total_revenue"]) if r["total_revenue"] else 0,
                "is_popular": r["is_popular"],
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/film/{film_id}")
def get_film_detail(film_id: int):
    try:
        rows = query("""
            SELECT film_id, title, genre_name, rating, length,
                rental_rate, replacement_cost, rental_duration,
                num_actors, special_features, total_rental,
                total_revenue, is_popular
            FROM summary_film_features
            WHERE film_id = %s
        """, (film_id,))
        if not rows:
            raise HTTPException(status_code=404, detail="Film not found")
        r = rows[0]
        return {
            "film_id": r["film_id"],
            "title": r["title"],
            "genre_name": r["genre_name"],
            "rating": r["rating"],
            "length": r["length"],
            "rental_rate": float(r["rental_rate"]) if r["rental_rate"] else 0,
            "replacement_cost": float(r["replacement_cost"]) if r["replacement_cost"] else 0,
            "rental_duration": r["rental_duration"],
            "num_actors": r["num_actors"],
            "special_features": r["special_features"],
            "total_rental": r["total_rental"],
            "total_revenue": float(r["total_revenue"]) if r["total_revenue"] else 0,
            "is_popular": bool(r["is_popular"]),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/genres")
def get_genres():
    try:
        rows = query("SELECT genre_name FROM summary_genre ORDER BY genre_name")
        return [r["genre_name"] for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict")
def predict(req: PredictRequest):
    try:
        model_data = load_model()
        model = model_data["model"]
        feature_names = model_data["feature_names"]
        feature_importance = model_data["feature_importance"]

        rating_enc = RATING_MAP.get(req.rating, 2)
        features = np.array([[
            req.length,
            req.rental_rate,
            req.replacement_cost,
            req.rental_duration,
            req.num_actors,
        ]])

        proba = model.predict_proba(features)[0]
        # proba[1] = probability of being popular
        prob_popular = float(proba[1]) if len(proba) > 1 else float(proba[0])
        popularity_score = round(prob_popular * 100, 1)

        if popularity_score <= 33:
            classification = "Low"
        elif popularity_score <= 66:
            classification = "Medium"
        else:
            classification = "High"

        # Radar chart averages for popular films
        popular_avg = query("""
            SELECT
                AVG(length) AS avg_length,
                AVG(rental_rate) AS avg_rental_rate,
                AVG(replacement_cost) AS avg_replacement_cost,
                AVG(rental_duration) AS avg_rental_duration,
                AVG(num_actors) AS avg_num_actors
            FROM summary_film_features
            WHERE is_popular = true
        """)
        avg = popular_avg[0] if popular_avg else {}

        radar_input = {
            "length": req.length,
            "rental_rate": req.rental_rate,
            "replacement_cost": req.replacement_cost,
            "rental_duration": req.rental_duration,
            "num_actors": req.num_actors,
        }
        radar_avg = {
            "length": float(avg.get("avg_length") or 0),
            "rental_rate": float(avg.get("avg_rental_rate") or 0),
            "replacement_cost": float(avg.get("avg_replacement_cost") or 0),
            "rental_duration": float(avg.get("avg_rental_duration") or 0),
            "num_actors": float(avg.get("avg_num_actors") or 0),
        }

        # Top popular films
        top_popular = query("""
            SELECT film_id, title, genre_name, rating, total_rental, total_revenue
            FROM summary_film_features
            WHERE is_popular = true
            ORDER BY total_revenue DESC
            LIMIT 10
        """)

        return {
            "popularity_score": popularity_score,
            "classification": classification,
            "probability": prob_popular,
            "feature_importance": [
                {"feature": name, "importance": round(float(imp), 4)}
                for name, imp in zip(feature_names, feature_importance)
            ],
            "radar_input": radar_input,
            "radar_avg_popular": radar_avg,
            "top_popular_films": [
                {
                    "film_id": r["film_id"],
                    "title": r["title"],
                    "genre_name": r["genre_name"],
                    "rating": r["rating"],
                    "total_rental": r["total_rental"],
                    "total_revenue": float(r["total_revenue"]) if r["total_revenue"] else 0,
                }
                for r in top_popular
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))