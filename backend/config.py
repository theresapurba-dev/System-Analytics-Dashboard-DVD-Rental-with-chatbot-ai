"""
config.py — Centralised configuration loaded from .env
"""
import os
from dotenv import load_dotenv

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(_ROOT, ".env"))
load_dotenv()  # optional backend/.env override


class Config:
    # ── Database ──────────────────────────────────────────────
    DB_NAME     = os.getenv("DB_NAME",     "dvd_fix")
    DB_USER     = os.getenv("DB_USER",     "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "12345")
    DB_HOST     = os.getenv("DB_HOST",     "localhost")
    DB_PORT     = int(os.getenv("DB_PORT", "5432"))

    DB_CONFIG = {
        "dbname":   DB_NAME,
        "user":     DB_USER,
        "password": DB_PASSWORD,
        "host":     DB_HOST,
        "port":     DB_PORT,
    }

    # ── Gemini ────────────────────────────────────────────────
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    # ── ML ────────────────────────────────────────────────────
    ML_MODEL_PATH = os.path.join(os.path.dirname(__file__), "ml", "nbh_model.pkl")

    # ── Flask ─────────────────────────────────────────────────
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
