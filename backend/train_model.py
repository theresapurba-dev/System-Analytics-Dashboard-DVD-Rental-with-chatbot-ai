"""
train_model.py — Train Random Forest Classifier for DVD Rental Popularity Prediction.
Run this script once before starting the backend:
    python train_model.py
"""

import os
import pickle
import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "dvd_fix"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "12345"),
    )

def main():
    print("Connecting to database...")
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT length, rental_rate, replacement_cost, rental_duration,
                       num_actors, is_popular
                FROM summary_film_features
                WHERE length IS NOT NULL
                  AND rental_rate IS NOT NULL
                  AND replacement_cost IS NOT NULL
                  AND rental_duration IS NOT NULL
                  AND num_actors IS NOT NULL
                  AND is_popular IS NOT NULL
            """)
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        print("ERROR: No data found in summary_film_features. Make sure the table is populated.")
        return

    print(f"Loaded {len(rows)} records from summary_film_features.")

    FEATURE_NAMES = ["length", "rental_rate", "replacement_cost", "rental_duration", "num_actors"]

    X = np.array([
        [
            float(r["length"]),
            float(r["rental_rate"]),
            float(r["replacement_cost"]),
            int(r["rental_duration"]),
            int(r["num_actors"]),
        ]
        for r in rows
    ])
    y = np.array([int(bool(r["is_popular"])) for r in rows])

    print(f"Class distribution — Popular: {y.sum()}, Not Popular: {(y == 0).sum()}")

    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import classification_report, accuracy_score
    except ImportError:
        print("ERROR: scikit-learn not installed. Run: pip install scikit-learn")
        return

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.sum() > 1 else None
    )

    print("Training Random Forest Classifier...")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nTest Accuracy: {acc:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["Not Popular", "Popular"]))

    feature_importance = model.feature_importances_

    MODEL_PATH = os.path.join(os.path.dirname(__file__), "random_forest_model.pkl")
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({
            "model": model,
            "feature_names": FEATURE_NAMES,
            "feature_importance": feature_importance.tolist(),
            "accuracy": acc,
        }, f)

    print(f"\nModel saved to: {MODEL_PATH}")
    print("\nFeature Importances:")
    for name, imp in zip(FEATURE_NAMES, feature_importance):
        print(f"  {name:20s}: {imp:.4f}")

if __name__ == "__main__":
    main()