from fastapi import APIRouter, HTTPException
from db import query

router = APIRouter()

@router.get("/cross")
def get_cross_analysis():
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
            ORDER BY dg.genre_name, df.rating
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

@router.get("/top-films")
def get_top_films():
    try:
        rows = query("""
            SELECT
                dg.genre_name,
                df.rating,
                df.title,
                COUNT(fr.sk_rental) AS rentals,
                SUM(fr.amount) AS revenue
            FROM fact_rental fr
            JOIN dim_genre dg ON fr.sk_genre = dg.sk_genre
            JOIN dim_film df ON fr.sk_film = df.sk_film
            GROUP BY dg.genre_name, df.rating, df.title
            ORDER BY dg.genre_name, df.rating, rentals DESC
        """)

        # Group by genre+rating, keep top 1
        seen = {}
        result = []
        for r in rows:
            key = (r["genre_name"], r["rating"])
            if key not in seen:
                seen[key] = True
                result.append({
                    "genre_name": r["genre_name"],
                    "rating": r["rating"],
                    "title": r["title"],
                    "rentals": int(r["rentals"]),
                    "revenue": float(r["revenue"]),
                })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))