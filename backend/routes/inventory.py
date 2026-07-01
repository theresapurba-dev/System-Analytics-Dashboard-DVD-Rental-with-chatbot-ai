from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import query, execute

router = APIRouter()

class AddStockRequest(BaseModel):
    film_id: int
    store_id: int
    quantity: int

@router.get("/summary")
def get_inventory_summary():
    try:
        rows = query("""
            SELECT sk_film, title, current_stock, rental_per_day,
                   days_to_empty, stock_status
            FROM summary_inventory
            ORDER BY days_to_empty ASC NULLS LAST
        """)
        return [
            {
                "sk_film": r["sk_film"],
                "title": r["title"],
                "current_stock": r["current_stock"],
                "rental_per_day": float(r["rental_per_day"]) if r["rental_per_day"] is not None else 0,
                "days_to_empty": float(r["days_to_empty"]) if r["days_to_empty"] is not None else None,
                "stock_status": r["stock_status"],
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weekly/{film_id}")
def get_weekly_rentals(film_id: int):
    try:
        rows = query("""
            SELECT dd.week_start_date, COUNT(fr.sk_rental) AS weekly_rentals
            FROM fact_rental fr
            JOIN dim_date dd ON fr.sk_date = dd.sk_date
            WHERE fr.sk_film = %s
            GROUP BY dd.week_start_date
            ORDER BY dd.week_start_date
        """, (film_id,))
        return [
            {
                "week_start_date": str(r["week_start_date"]),
                "weekly_rentals": int(r["weekly_rentals"]),
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/films")
def get_films_for_dropdown():
    try:
        rows = query("""
            SELECT DISTINCT df.film_id, df.title
            FROM dim_film df
            JOIN inventory i ON df.film_id = i.film_id
            ORDER BY df.title
        """)
        return [{"film_id": r["film_id"], "title": r["title"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/add-stock")
def add_stock(req: AddStockRequest):
    try:
        if req.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        if req.store_id not in [1, 2]:
            raise HTTPException(status_code=400, detail="Store ID must be 1 or 2")

        for _ in range(req.quantity):
            execute("""
                INSERT INTO inventory (film_id, store_id, last_update)
                VALUES (%s, %s, NOW())
            """, (req.film_id, req.store_id))

        # Fetch updated stock for this film
        updated = query("""
            SELECT title, current_stock, stock_status
            FROM summary_inventory
            WHERE sk_film = (
                SELECT sk_film FROM dim_film WHERE film_id = %s LIMIT 1
            )
        """, (req.film_id,))

        return {
            "success": True,
            "message": f"Added {req.quantity} copies successfully",
            "updated_stock": updated[0] if updated else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))