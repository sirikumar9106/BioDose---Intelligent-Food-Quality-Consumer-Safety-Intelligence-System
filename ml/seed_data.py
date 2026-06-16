"""
Seed Script — inserts 4 mock rows into analysis_scanlog.
Run once at deploy time. Idempotent: skips if rows already exist.

Usage:
    python seed_data.py
"""

import os
import psycopg2
from dotenv import load_dotenv

_HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_HERE, "..", ".env"))

DB_CONFIG = {
    "host":     os.environ.get("SUPABASE_DB_HOST"),
    "database": os.environ.get("SUPABASE_DB_NAME", "postgres"),
    "user":     os.environ.get("SUPABASE_DB_USER", "postgres"),
    "password": os.environ.get("SUPABASE_DB_PASSWORD"),
    "port":     os.environ.get("SUPABASE_DB_PORT", "5432"),
}

MOCK_DATA = [
    # (user_age, num_conditions, condition_ids, product_id, confidence_score)
    (28, 2, "MDC01,MDC02",       "8901058001029", 0.673),
    (45, 3, "MDC05,MDC06,MDC11", "5000159484695", 0.412),
    (62, 1, "MDC16",             "7622210449283", 0.251),
    (19, 2, "MDC03,MDC09",       "0737628064502", 0.889),
]


def seed():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM analysis_scanlog;")
    count = cur.fetchone()[0]

    if count >= len(MOCK_DATA):
        print(f"[Seed] Skipping — {count} rows already present.")
        conn.close()
        return

    print(f"[Seed] Inserting {len(MOCK_DATA)} mock rows into analysis_scanlog…")
    for row in MOCK_DATA:
        cur.execute(
            """
            INSERT INTO analysis_scanlog
                (user_age, num_conditions, condition_ids, product_id, confidence_score, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT DO NOTHING;
            """,
            row,
        )

    conn.commit()
    conn.close()
    print("[Seed] Done.")


if __name__ == "__main__":
    seed()
