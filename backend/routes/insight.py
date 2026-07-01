from fastapi import APIRouter, HTTPException
from db import query

router = APIRouter()

@router.get("/insight/{scope}")
def get_insight(scope: str):
    try:
        if scope == "genre":
            rows = query("""
                SELECT genre_name, total_rental, total_revenue, revenue_pct
                FROM summary_genre
                ORDER BY total_revenue DESC
            """)
            if not rows:
                return {"insight": "Tidak ada data genre tersedia."}
            top = rows[0]
            bottom = rows[-1]
            total_rev = sum(float(r["total_revenue"]) for r in rows)
            insight = (
                f"Genre terlaris adalah '{top['genre_name']}' dengan revenue "
                f"${float(top['total_revenue']):,.2f} ({float(top['revenue_pct']):.1f}% dari total). "
                f"Genre terendah adalah '{bottom['genre_name']}' dengan revenue "
                f"${float(bottom['total_revenue']):,.2f}. "
                f"Total revenue dari {len(rows)} genre adalah ${total_rev:,.2f}."
            )
            return {"insight": insight, "data": [dict(r) for r in rows[:5]]}

        elif scope == "rating":
            rows = query("""
                SELECT rating, total_rental, total_revenue, num_films, rental_pct
                FROM summary_rating
                ORDER BY total_revenue DESC
            """)
            if not rows:
                return {"insight": "Tidak ada data rating tersedia."}
            top = rows[0]
            insight = (
                f"Rating '{top['rating']}' mendominasi dengan {int(top['total_rental'])} rental "
                f"({float(top['rental_pct']):.1f}% dari total) dan revenue ${float(top['total_revenue']):,.2f}. "
                f"Terdapat {int(top['num_films'])} film dengan rating ini."
            )
            return {"insight": insight, "data": [dict(r) for r in rows]}

        elif scope == "inventory":
            critical = query("""
                SELECT COUNT(*) AS cnt FROM summary_inventory WHERE stock_status = 'CRITICAL'
            """)
            warning = query("""
                SELECT COUNT(*) AS cnt FROM summary_inventory WHERE stock_status = 'WARNING'
            """)
            urgent = query("""
                SELECT title, days_to_empty FROM summary_inventory
                WHERE stock_status = 'CRITICAL'
                ORDER BY days_to_empty ASC
                LIMIT 3
            """)
            crit_cnt = int(critical[0]["cnt"]) if critical else 0
            warn_cnt = int(warning[0]["cnt"]) if warning else 0
            urgent_titles = ", ".join([f"'{r['title']}'" for r in urgent])
            insight = (
                f"Terdapat {crit_cnt} film dalam status CRITICAL dan {warn_cnt} film WARNING. "
            )
            if urgent_titles:
                insight += f"Film yang paling mendesak untuk direstok: {urgent_titles}."
            return {"insight": insight}

        elif scope == "overall":
            genre_stats = query("""
                SELECT SUM(total_rental) AS t_rental, SUM(total_revenue) AS t_revenue,
                    COUNT(*) AS n_genre
                FROM summary_genre
            """)
            top_genre = query("""
                SELECT genre_name FROM summary_genre ORDER BY total_revenue DESC LIMIT 1
            """)
            critical_cnt = query("""
                SELECT COUNT(*) AS cnt FROM summary_inventory WHERE stock_status = 'CRITICAL'
            """)
            s = genre_stats[0] if genre_stats else {}
            tg = top_genre[0]["genre_name"] if top_genre else "N/A"
            cc = int(critical_cnt[0]["cnt"]) if critical_cnt else 0
            insight = (
                f"Dashboard mencakup {int(s.get('n_genre', 0))} genre dengan total "
                f"{int(s.get('t_rental', 0)):,} rental dan revenue ${float(s.get('t_revenue', 0)):,.2f}. "
                f"Genre terbaik adalah '{tg}'. "
                f"Saat ini terdapat {cc} film dengan stok kritis yang membutuhkan perhatian segera."
            )
            return {"insight": insight}

        else:
            return {"insight": f"Scope '{scope}' tidak dikenali. Gunakan: genre, rating, inventory, overall."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))