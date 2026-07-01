"""
services/db_service.py — All SQL queries live here.
Routes call these functions; no SQL in routes.
"""
from db import query, execute, execute_many


# ── Genre ─────────────────────────────────────────────────────────────────────

def get_genre_summary() -> list[dict]:
    return query("SELECT * FROM summary_genre ORDER BY total_revenue DESC")


def get_genre_weekly() -> list[dict]:
    return query("""
        SELECT genre_name, week_start_date, week_number, year, weekly_rental
        FROM summary_weekly_genre
        ORDER BY week_start_date, genre_name
    """)


# ── Rating ────────────────────────────────────────────────────────────────────

def get_rating_summary() -> list[dict]:
    return query("SELECT * FROM summary_rating ORDER BY total_revenue DESC")


# ── Movie Performance (combined genre + rating) ───────────────────────────────

def get_genre_rating_distribution() -> list[dict]:
    """Rental counts broken down by genre × rating combination."""
    return query("""
        SELECT
            dg.genre_name,
            df.rating,
            COUNT(fr.sk_rental)  AS rental_count,
            SUM(fr.amount)        AS revenue
        FROM fact_rental fr
        JOIN dim_genre dg ON fr.sk_genre = dg.sk_genre
        JOIN dim_film  df ON fr.sk_film  = df.sk_film
        GROUP BY dg.genre_name, df.rating
        ORDER BY dg.genre_name, df.rating
    """)


# ── Inventory ─────────────────────────────────────────────────────────────────

def get_inventory_summary() -> list[dict]:
    return query("SELECT * FROM summary_inventory ORDER BY days_to_empty ASC")


def get_weekly_rentals_for_film(film_id: int) -> list[dict]:
    return query("""
        SELECT df.title, dd.week_start_date,
               COUNT(fr.sk_rental) AS weekly_rental
        FROM fact_rental fr
        JOIN dim_film df ON fr.sk_film = df.sk_film
        JOIN dim_date dd ON fr.sk_date = dd.sk_date
        WHERE fr.sk_film = %s
        GROUP BY df.title, dd.week_start_date
        ORDER BY dd.week_start_date
    """, (film_id,))


def get_films_with_inventory() -> list[dict]:
    return query("""
        SELECT DISTINCT f.film_id, f.title
        FROM film f
        INNER JOIN inventory i ON f.film_id = i.film_id
        ORDER BY f.title
    """)


# ── ML / Next Big Hit ─────────────────────────────────────────────────────────

def get_film_features() -> list[dict]:
    return query("SELECT * FROM summary_film_features ORDER BY total_rental DESC")


def get_film_features_by_id(film_id: int) -> dict | None:
    rows = query(
        "SELECT * FROM summary_film_features WHERE film_id = %s",
        (film_id,)
    )
    return rows[0] if rows else None


def get_all_genres() -> list[str]:
    rows = query("SELECT genre_name FROM dim_genre ORDER BY genre_name")
    return [r["genre_name"] for r in rows]


# ── Customers / Staff ─────────────────────────────────────────────────────────

def get_customers() -> list[dict]:
    return query("""
        SELECT customer_id,
               first_name || ' ' || last_name AS name
        FROM customer
        ORDER BY name
        LIMIT 500
    """)


def get_staff_id() -> int | None:
    rows = query("SELECT staff_id FROM staff LIMIT 1")
    return rows[0]["staff_id"] if rows else None


# ── Films for rental form ─────────────────────────────────────────────────────

def get_films_for_rental() -> list[dict]:
    return query("""
        SELECT DISTINCT f.film_id, f.title, c.name AS genre
        FROM film f
        JOIN film_category fc ON f.film_id = fc.film_id
        JOIN category c       ON fc.category_id = c.category_id
        JOIN inventory i      ON f.film_id = i.film_id
        ORDER BY f.title
        LIMIT 500
    """)


def get_inventory_for_film(film_id: int) -> int | None:
    rows = query(
        "SELECT inventory_id FROM inventory WHERE film_id = %s LIMIT 1",
        (film_id,)
    )
    return rows[0]["inventory_id"] if rows else None


# ── Write operations ──────────────────────────────────────────────────────────

def add_rental(inventory_id: int, customer_id: int,
               staff_id: int, amount: float) -> int:
    """Insert rental + payment, return new rental_id."""
    rental = execute(
        """
        INSERT INTO rental (rental_date, inventory_id, customer_id, staff_id)
        VALUES (NOW(), %s, %s, %s)
        RETURNING rental_id
        """,
        (inventory_id, customer_id, staff_id),
        fetch=True,
    )
    rental_id = rental[0][0]

    execute(
        """
        INSERT INTO payment (customer_id, staff_id, rental_id, amount, payment_date)
        VALUES (%s, %s, %s, %s, NOW())
        """,
        (customer_id, staff_id, rental_id, amount),
    )
    return rental_id


def restock_film(film_id: int, store_id: int, qty: int) -> bool:
    """Add qty copies to inventory and update fact_inventory."""
    stmts = [(
        "INSERT INTO inventory (film_id, store_id, last_update) VALUES (%s, %s, NOW())",
        (film_id, store_id),
    )] * qty

    execute_many(stmts)

    existing = query(
        "SELECT sk_inventory FROM fact_inventory WHERE sk_film = %s AND store_id = %s",
        (film_id, store_id),
    )
    if existing:
        execute(
            "UPDATE fact_inventory SET total_copies = total_copies + %s "
            "WHERE sk_film = %s AND store_id = %s",
            (qty, film_id, store_id),
        )
    else:
        execute(
            "INSERT INTO fact_inventory (sk_film, store_id, total_copies) VALUES (%s, %s, %s)",
            (film_id, store_id, qty),
        )
    return True


# ── Summary refresh ───────────────────────────────────────────────────────────

def refresh_all_summaries() -> bool:
    """
    Re-run all summary table ETL queries.
    Ported 1:1 from the original Streamlit db.py refresh_summaries().
    """
    from db import get_conn
    with get_conn() as conn:
        try:
            cur = conn.cursor()

            # ── summary_genre ─────────────────────────────────
            cur.execute("TRUNCATE TABLE summary_genre;")
            cur.execute("""
                INSERT INTO summary_genre (genre_name, total_rental, total_revenue, best_film, revenue_pct)
                WITH base AS (
                    SELECT c.name AS genre_name,
                           COUNT(r.rental_id) AS total_rental,
                           COALESCE(SUM(p.amount), 0) AS total_revenue
                    FROM rental r
                    JOIN inventory i   ON r.inventory_id = i.inventory_id
                    JOIN film f        ON i.film_id = f.film_id
                    JOIN film_category fc ON f.film_id = fc.film_id
                    JOIN category c    ON fc.category_id = c.category_id
                    LEFT JOIN payment p ON r.rental_id = p.rental_id
                    GROUP BY c.name
                ),
                best AS (
                    SELECT DISTINCT ON (c.name)
                           c.name AS genre_name,
                           f.title AS best_film,
                           COUNT(r.rental_id) AS rental_count
                    FROM rental r
                    JOIN inventory i   ON r.inventory_id = i.inventory_id
                    JOIN film f        ON i.film_id = f.film_id
                    JOIN film_category fc ON f.film_id = fc.film_id
                    JOIN category c    ON fc.category_id = c.category_id
                    GROUP BY c.name, f.title
                    ORDER BY c.name, rental_count DESC
                )
                SELECT base.genre_name, base.total_rental, base.total_revenue, best.best_film,
                       ROUND(base.total_revenue / NULLIF(SUM(base.total_revenue) OVER (), 0) * 100, 2)
                FROM base JOIN best ON base.genre_name = best.genre_name
                WHERE base.total_rental > 0;
            """)

            # ── summary_rating ────────────────────────────────
            cur.execute("TRUNCATE TABLE summary_rating;")
            cur.execute("""
                INSERT INTO summary_rating (rating, total_rental, total_revenue, num_films, avg_rental_per_film, rental_pct)
                SELECT
                    f.rating,
                    COUNT(r.rental_id)::INTEGER,
                    COALESCE(SUM(p.amount), 0),
                    COUNT(DISTINCT f.film_id),
                    ROUND(COUNT(r.rental_id)::DECIMAL / NULLIF(COUNT(DISTINCT f.film_id), 0), 2),
                    ROUND(COUNT(r.rental_id)::DECIMAL / NULLIF(SUM(COUNT(r.rental_id)) OVER (), 0) * 100, 2)
                FROM film f
                LEFT JOIN inventory i  ON f.film_id = i.film_id
                LEFT JOIN rental r     ON i.inventory_id = r.inventory_id
                LEFT JOIN payment p    ON r.rental_id = p.rental_id
                GROUP BY f.rating
                HAVING COUNT(r.rental_id) > 0;
            """)

            # ── summary_inventory ─────────────────────────────
            cur.execute("TRUNCATE TABLE summary_inventory;")
            cur.execute("""
                WITH rental_velocity AS (
                    SELECT i.film_id,
                           COUNT(r.rental_id)::DECIMAL /
                           GREATEST(EXTRACT(DAY FROM (COALESCE(MAX(r.rental_date), NOW())
                                                    - COALESCE(MIN(r.rental_date), NOW()))), 1) AS rental_per_day
                    FROM inventory i
                    LEFT JOIN rental r ON i.inventory_id = r.inventory_id
                    GROUP BY i.film_id
                ),
                stock_count AS (
                    SELECT film_id, COUNT(*) AS total_copies FROM inventory GROUP BY film_id
                ),
                rented_out AS (
                    SELECT i.film_id, COUNT(*) AS rented_count
                    FROM rental r
                    JOIN inventory i ON r.inventory_id = i.inventory_id
                    WHERE r.return_date IS NULL
                    GROUP BY i.film_id
                )
                INSERT INTO summary_inventory
                    (sk_film, title, current_stock, rental_per_day, days_to_empty, stock_status)
                SELECT
                    f.film_id, f.title,
                    GREATEST(COALESCE(sc.total_copies, 0) - COALESCE(ro.rented_count, 0), 0),
                    COALESCE(rv.rental_per_day, 0),
                    CASE
                        WHEN COALESCE(rv.rental_per_day, 0) = 0 THEN 9999
                        WHEN GREATEST(COALESCE(sc.total_copies,0)-COALESCE(ro.rented_count,0),0)=0 THEN 9999
                        ELSE (GREATEST(COALESCE(sc.total_copies,0)-COALESCE(ro.rented_count,0),0)
                              / NULLIF(rv.rental_per_day,0))::INTEGER
                    END,
                    CASE
                        WHEN GREATEST(COALESCE(sc.total_copies,0)-COALESCE(ro.rented_count,0),0)=0 THEN 'OUT OF STOCK'
                        WHEN GREATEST(COALESCE(sc.total_copies,0)-COALESCE(ro.rented_count,0),0)<=1 THEN 'CRITICAL'
                        WHEN GREATEST(COALESCE(sc.total_copies,0)-COALESCE(ro.rented_count,0),0)<=3 THEN 'WARNING'
                        ELSE 'OK'
                    END
                FROM film f
                INNER JOIN stock_count sc ON f.film_id = sc.film_id
                LEFT JOIN  rented_out  ro ON f.film_id = ro.film_id
                LEFT JOIN  rental_velocity rv ON f.film_id = rv.film_id
                WHERE sc.total_copies > 0;
            """)

            # ── summary_film_features ─────────────────────────
            cur.execute("TRUNCATE TABLE summary_film_features;")
            cur.execute("""
                INSERT INTO summary_film_features
                SELECT
                    f.film_id, f.title,
                    c.name AS genre_name,
                    f.rating, f.length, f.rental_rate, f.replacement_cost,
                    f.rental_duration,
                    COALESCE(actor_count.num_actors, 0),
                    f.special_features,
                    COALESCE(rental_stats.total_rental, 0),
                    COALESCE(rental_stats.total_revenue, 0),
                    COALESCE(rental_stats.total_rental, 0) >= (
                        SELECT PERCENTILE_CONT(0.6) WITHIN GROUP (ORDER BY rental_count)
                        FROM (
                            SELECT COUNT(r.rental_id) AS rental_count
                            FROM rental r
                            JOIN inventory i ON r.inventory_id = i.inventory_id
                            GROUP BY i.film_id
                        ) sub
                    ) AS is_popular
                FROM film f
                LEFT JOIN film_category fc ON f.film_id = fc.film_id
                LEFT JOIN category c       ON fc.category_id = c.category_id
                LEFT JOIN (
                    SELECT film_id, COUNT(actor_id) AS num_actors
                    FROM film_actor GROUP BY film_id
                ) actor_count ON f.film_id = actor_count.film_id
                LEFT JOIN (
                    SELECT i.film_id,
                           COUNT(r.rental_id) AS total_rental,
                           COALESCE(SUM(p.amount), 0) AS total_revenue
                    FROM inventory i
                    LEFT JOIN rental r  ON i.inventory_id = r.inventory_id
                    LEFT JOIN payment p ON r.rental_id = p.rental_id
                    GROUP BY i.film_id
                ) rental_stats ON f.film_id = rental_stats.film_id
                WHERE EXISTS (SELECT 1 FROM inventory i WHERE i.film_id = f.film_id);
            """)

            conn.commit()
            cur.close()
            return True

        except Exception as e:
            conn.rollback()
            print(f"[ERR] refresh_all_summaries error: {e}")
            import traceback; traceback.print_exc()
            return False


# ── Movie Performance — dedicated endpoints ────────────────────────────────────

def get_mp_kpis() -> dict:
    """All KPI numbers for the Movie Performance page in one query batch."""
    genre_rows  = query("SELECT * FROM summary_genre ORDER BY total_revenue DESC")
    rating_rows = query("SELECT * FROM summary_rating ORDER BY total_revenue DESC")

    total_rev     = sum(float(r["total_revenue"]) for r in genre_rows)
    total_rentals = sum(int(r["total_rental"])    for r in genre_rows)
    total_films   = sum(int(r["num_films"])        for r in rating_rows)

    top_genre  = genre_rows[0]  if genre_rows  else {}
    low_genre  = genre_rows[-1] if genre_rows  else {}
    top_rating = rating_rows[0] if rating_rows else {}

    avg_rev_per_rental = round(total_rev / total_rentals, 4) if total_rentals else 0

    return {
        "total_genres":        len(genre_rows),
        "total_ratings":       len(rating_rows),
        "total_rentals":       total_rentals,
        "total_revenue":       round(total_rev, 2),
        "total_films":         total_films,
        "avg_rev_per_rental":  avg_rev_per_rental,
        "top_genre_name":      top_genre.get("genre_name", "—"),
        "top_genre_revenue":   float(top_genre.get("total_revenue", 0)),
        "top_genre_rentals":   int(top_genre.get("total_rental", 0)),
        "low_genre_name":      low_genre.get("genre_name", "—"),
        "low_genre_revenue":   float(low_genre.get("total_revenue", 0)),
        "top_rating":          top_rating.get("rating", "—"),
        "top_rating_revenue":  float(top_rating.get("total_revenue", 0)),
        "top_rating_pct":      float(top_rating.get("rental_pct", 0)),
    }


def get_genre_revenue_by_rating() -> list[dict]:
    """Revenue broken down by genre AND rating — for stacked bar chart."""
    rows = query("""
        SELECT
            dg.genre_name,
            df.rating,
            SUM(fr.amount) AS revenue
        FROM fact_rental fr
        JOIN dim_genre dg ON fr.sk_genre = dg.sk_genre
        JOIN dim_film  df ON fr.sk_film  = df.sk_film
        GROUP BY dg.genre_name, df.rating
        ORDER BY dg.genre_name, df.rating
    """)
    return [
        {**r, "revenue": round(float(r["revenue"]), 2)}
        for r in rows
    ]


def get_rental_frequency() -> list[dict]:
    """Avg rentals per day per genre — for horizontal frequency bar chart."""
    rows = query("""
        SELECT
            dg.genre_name,
            COUNT(fr.sk_rental)                              AS total_rentals,
            COUNT(DISTINCT fr.sk_film)                       AS total_films,
            ROUND(COUNT(fr.sk_rental)::DECIMAL /
                  NULLIF(COUNT(DISTINCT fr.sk_film), 0), 2)  AS avg_per_film,
            ROUND(COUNT(fr.sk_rental)::DECIMAL /
                  GREATEST(
                      (SELECT MAX(rental_date::DATE) - MIN(rental_date::DATE) FROM rental), 1
                  ), 4)                                       AS rentals_per_day
        FROM fact_rental fr
        JOIN dim_genre dg ON fr.sk_genre = dg.sk_genre
        GROUP BY dg.genre_name
        ORDER BY avg_per_film DESC
    """)
    return [
        {
            **r,
            "total_rentals":  int(r["total_rentals"]),
            "total_films":    int(r["total_films"]),
            "avg_per_film":   float(r["avg_per_film"]),
            "rentals_per_day": float(r["rentals_per_day"]),
        }
        for r in rows
    ]


def get_rental_share() -> list[dict]:
    """Revenue & rental share percentages for the doughnut chart."""
    rows = query("SELECT genre_name, total_rental, total_revenue, revenue_pct FROM summary_genre ORDER BY revenue_pct DESC")
    total_rent = sum(int(r["total_rental"]) for r in rows)
    return [
        {
            "genre_name":   r["genre_name"],
            "total_rental": int(r["total_rental"]),
            "total_revenue": float(r["total_revenue"]),
            "revenue_pct":  float(r["revenue_pct"]),
            "rental_pct":   round(int(r["total_rental"]) / total_rent * 100, 2) if total_rent else 0,
        }
        for r in rows
    ]


def get_top_combinations() -> list[dict]:
    """Top genre×rating combos by revenue — for the treemap/heatmap chart."""
    rows = query("""
        SELECT
            dg.genre_name,
            df.rating,
            COUNT(fr.sk_rental)    AS rental_count,
            SUM(fr.amount)          AS revenue,
            COUNT(DISTINCT fr.sk_film) AS film_count
        FROM fact_rental fr
        JOIN dim_genre dg ON fr.sk_genre = dg.sk_genre
        JOIN dim_film  df ON fr.sk_film  = df.sk_film
        GROUP BY dg.genre_name, df.rating
        ORDER BY revenue DESC
        LIMIT 30
    """)
    return [
        {
            "genre_name":   r["genre_name"],
            "rating":       r["rating"],
            "rental_count": int(r["rental_count"]),
            "revenue":      round(float(r["revenue"]), 2),
            "film_count":   int(r["film_count"]),
            "label":        f"{r['genre_name']} / {r['rating']}",
        }
        for r in rows
    ]
