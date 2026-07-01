import traceback

from flask import Blueprint, jsonify, request

from services.ai_service import process_command

ai_bp = Blueprint("ai", __name__)


@ai_bp.post("/api/ai")
def ai_command():
    body    = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()
    context = body.get("context")

    if not message:
        return jsonify({"ok": False, "error": "Pesan tidak boleh kosong"}), 400

    try:
        command = process_command(message, context)
        return jsonify({"ok": True, "command": command})

    except Exception as e:
        print("\n" + "=" * 50)
        print("LOG ERROR BACKEND AI:")
        traceback.print_exc()
        print("=" * 50 + "\n")

        return jsonify({
            "ok": False,
            "error": str(e),
            "hint": "Cek terminal Python untuk detail error",
        }), 500
