from fastapi import APIRouter, HTTPException
from typing import Optional
from db import query

router = APIRouter()

@router.get("/film")
def recommend_film(genre: Optional[str] = None, rating: Optional[str] = None):
    try:
        conditions = ["is_popular = true"]
        params = []
        if genre:
            conditions.append("genre_name = %s")
            params.append(genre)
        if rating:
            conditions.append("rating = %s")
            params.append(rating)

        where = " AND ".join(conditions)
        rows = query(f"""
            SELECT film_id, title, genre_name, rating, total_rental, total_revenue,
                rental_rate, length
            FROM summary_film_features
            WHERE {where}
            ORDER BY total_revenue DESC
            LIMIT 5
        """, params if params else None)

        return [
            {
                "film_id": r["film_id"],
                "title": r["title"],
                "genre_name": r["genre_name"],
                "rating": r["rating"],
                "total_rental": r["total_rental"],
                "total_revenue": float(r["total_revenue"]) if r["total_revenue"] else 0,
                "rental_rate": float(r["rental_rate"]) if r["rental_rate"] else 0,
                "length": r["length"],
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/best-combination")
def best_combination():
    try:
        rows = query("""
            SELECT
                dg.genre_name,
                df.rating,
                COUNT(fr.sk_rental) AS rentals,
                SUM(fr.amount) AS revenue
            FROM fact_rental fr
            JOIN dim_genre dg ON fr.sk_genre = dg.sk_genre
            JOIN dim_film df ON fr.sk_film = df.sk_film
            GROUP BY dg.genre_name, df.rating
            ORDER BY revenue DESC
            LIMIT 5
        """)
        return [
            {
                "genre_name": r["genre_name"],
                "rating": r["rating"],
                "rentals": int(r["rentals"]),
                "revenue": float(r["revenue"]),
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))