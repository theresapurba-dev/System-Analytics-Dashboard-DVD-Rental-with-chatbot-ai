from flask import Blueprint, jsonify, request
from services.db_service import (
    get_customers,
    get_staff_id,
    get_films_for_rental,
    get_inventory_for_film,
    add_rental,
    refresh_all_summaries,
)

transactions_bp = Blueprint("transactions", __name__)


@transactions_bp.get("/api/customers")
def customers():
    try:
        data = get_customers()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@transactions_bp.get("/api/films")
def films():
    try:
        data = get_films_for_rental()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@transactions_bp.post("/api/rental")
def add_rental_route():
    body = request.get_json(silent=True) or {}
    film_id     = body.get("film_id")
    customer_id = body.get("customer_id")
    amount      = body.get("amount", 2.99)

    if not film_id or not customer_id:
        return jsonify({"ok": False, "error": "film_id and customer_id required"}), 400

    try:
        staff_id = get_staff_id()
        if not staff_id:
            return jsonify({"ok": False, "error": "No staff found in database"}), 500

        inventory_id = get_inventory_for_film(int(film_id))
        if not inventory_id:
            return jsonify({"ok": False, "error": "No inventory available for this film"}), 409

        rental_id = add_rental(inventory_id, int(customer_id), staff_id, float(amount))
        refresh_all_summaries()

        return jsonify({
            "ok": True,
            "data": {"rental_id": rental_id},
            "message": "Rental added and summaries refreshed."
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
