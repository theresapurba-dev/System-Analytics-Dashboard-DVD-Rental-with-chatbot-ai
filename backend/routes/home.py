from fastapi import APIRouter, HTTPException
from db import query

router = APIRouter()

@router.get("/home")
def get_home():
    try:
        # Total number of genres
        genre_count = query("SELECT COUNT(*) AS total_genres FROM summary_genre")

        # Top genre by revenue — rentals & revenue come from THIS genre only
        top_genre = query("""
            SELECT genre_name, total_rental, total_revenue, revenue_pct
            FROM summary_genre
            ORDER BY total_revenue DESC
            LIMIT 1
        """)

        # All genres ranked (for sparkline/mini chart)
        all_genres = query("""
            SELECT genre_name, total_rental, total_revenue
            FROM summary_genre
            ORDER BY total_revenue DESC
        """)

        # Stock alerts
        stock_alerts = query("""
            SELECT title, current_stock, days_to_empty, stock_status
            FROM summary_inventory
            WHERE stock_status IN ('CRITICAL', 'WARNING')
            ORDER BY
                CASE stock_status WHEN 'CRITICAL' THEN 1 ELSE 2 END,
                days_to_empty ASC
        """)

        top = top_genre[0] if top_genre else {}
        cnt = genre_count[0] if genre_count else {}

        return {
            "kpi": {
                "total_genres": int(cnt.get("total_genres", 0)),
                # Rentals & Revenue = top performing genre only
                "total_rentals": int(top.get("total_rental", 0)),
                "total_revenue": float(top.get("total_revenue", 0)),
                "top_genre": top.get("genre_name", "N/A"),
                "top_genre_revenue_pct": float(top.get("revenue_pct", 0)),
            },
            "all_genres": [
                {
                    "genre_name": r["genre_name"],
                    "total_rental": int(r["total_rental"]),
                    "total_revenue": float(r["total_revenue"]),
                }
                for r in all_genres
            ],
            "stock_alerts": [
                {
                    "title": r["title"],
                    "current_stock": r["current_stock"],
                    "days_to_empty": float(r["days_to_empty"]) if r["days_to_empty"] is not None else None,
                    "stock_status": r["stock_status"],
                }
                for r in stock_alerts
            ],
            "system_status": "online",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))