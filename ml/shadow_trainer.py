"""
BioDose Shadow ML Training Pipeline
=====================================
Strategy: Champion-Challenger (same as Netflix/Amazon model bootstrap).

Architecture:
  - The Django backend risk scorer runs exclusively on the heuristic
    synergistic math logic. The shadow model training pipeline is fully
    decoupled from live scoring.
  - When sufficient real-world data accumulates (>= 1000 rows by default),
    this script trains two competing architectures (AttentionModelBase vs
    ShadowModelB) and saves both to ModelRegistry.
  - A future confidence-matrix ensemble step (heuristic score + ML weight)
    will be introduced once the model is validated.

Trigger Logic:
  - Gate 1: Total rows in analysis_scanlog >= MIN_ROWS_TO_TRAIN (default 1000)
  - Gate 2: New rows added since the last training run >= TRAIN_INTERVAL (default 1000)
  - Both gates must pass; if either fails, training is skipped gracefully.

Env overrides for local testing (use small numbers):
  MIN_ROWS_TO_TRAIN=3 TRAIN_INTERVAL=1 python shadow_trainer.py --now

Usage:
    python shadow_trainer.py          # start the scheduler daemon (runs every 24h)
    python shadow_trainer.py --now    # run one training cycle immediately
"""

import os
import sys
import uuid
import psycopg2
import torch
import torch.nn as nn
import torch.optim as optim
from datetime import datetime
from dotenv import load_dotenv

# ── Load environment ──────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_HERE, "..", ".env"))

DB_CONFIG = {
    "host":     os.environ.get("SUPABASE_DB_HOST"),
    "database": os.environ.get("SUPABASE_DB_NAME", "postgres"),
    "user":     os.environ.get("SUPABASE_DB_USER", "postgres"),
    "password": os.environ.get("SUPABASE_DB_PASSWORD"),
    "port":     os.environ.get("SUPABASE_DB_PORT", "5432"),
}

# ── Thresholds (overridable via environment variables) ────────────────────────
# MIN_ROWS_TO_TRAIN: minimum total rows needed before the FIRST model trains
# TRAIN_INTERVAL:    minimum NEW rows since last training to trigger a new cycle
MIN_ROWS_TO_TRAIN = int(os.environ.get("MIN_ROWS_TO_TRAIN", 1000))
TRAIN_INTERVAL    = int(os.environ.get("TRAIN_INTERVAL", 1000))

# ── MDC one-hot ordering (must match condition_registry.py) ──────────────────
MDC_IDS = [f"MDC{str(i).zfill(2)}" for i in range(1, 22)]  # MDC01 – MDC21


# ────────────────────────────────────────────────────────────────────────────
#  Model Architectures
# ────────────────────────────────────────────────────────────────────────────

class AttentionModelBase(nn.Module):
    """Transformer-based risk scorer — Architecture A."""
    INPUT_DIM = 23  # age + num_conditions + 21 one-hot MDC flags

    def __init__(self):
        super().__init__()
        self.fc_embed = nn.Linear(self.INPUT_DIM, 64)
        self.encoder_layer = nn.TransformerEncoderLayer(d_model=64, nhead=4, batch_first=True)
        self.transformer = nn.TransformerEncoder(self.encoder_layer, num_layers=2)
        self.fc_out = nn.Sequential(nn.Linear(64, 32), nn.ReLU(), nn.Linear(32, 1), nn.Sigmoid())

    def forward(self, x):          # x: (batch, INPUT_DIM)
        x = self.fc_embed(x)       # → (batch, 64)
        x = x.unsqueeze(1)         # → (batch, 1, 64)  sequence_len=1
        x = self.transformer(x)    # → (batch, 1, 64)
        x = x.squeeze(1)           # → (batch, 64)
        return self.fc_out(x)      # → (batch, 1)


class ShadowModelB(nn.Module):
    """Deeper MLP with dropout — Architecture B."""
    INPUT_DIM = 23

    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(self.INPUT_DIM, 128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, 64),  nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(64,  32),  nn.ReLU(),
            nn.Linear(32,  1),   nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)


# ────────────────────────────────────────────────────────────────────────────
#  Feature Engineering
# ────────────────────────────────────────────────────────────────────────────

def _row_to_features(row: tuple) -> list:
    """
    row = (user_age, num_conditions, condition_ids, product_id, confidence_score)
    Returns a flat float list of length 23.
    """
    user_age, num_conditions, condition_ids, product_id, confidence_score = row

    # Normalise age to 0-1
    age_norm = float(user_age) / 100.0 if user_age else 0.0
    # Normalise count to 0-1 (max 21 conditions)
    cond_norm = float(num_conditions) / 21.0 if num_conditions else 0.0

    # One-hot MDC flags
    present = set((condition_ids or "").split(","))
    one_hot = [1.0 if mdc in present else 0.0 for mdc in MDC_IDS]

    return [age_norm, cond_norm] + one_hot  # len = 23


# ────────────────────────────────────────────────────────────────────────────
#  Database helpers
# ────────────────────────────────────────────────────────────────────────────

def _get_conn():
    return psycopg2.connect(**DB_CONFIG)


def fetch_training_data():
    """Pull all rows from analysis_scanlog. Returns (rows, total_count)."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT user_age, num_conditions, condition_ids, product_id, confidence_score "
        "FROM analysis_scanlog ORDER BY id ASC;"
    )
    rows = cur.fetchall()
    conn.close()
    return rows, len(rows)


def get_last_trained_size() -> int:
    """
    Returns the training_data_size of the most recently registered model in
    analysis_modelregistry, or 0 if no model has been trained yet.

    Used to compute the delta (new rows added since last training) to decide
    whether a new training iteration should be triggered.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT training_data_size FROM analysis_modelregistry "
            "ORDER BY created_at DESC LIMIT 1;"
        )
        row = cur.fetchone()
        conn.close()
        return int(row[0]) if row else 0
    except Exception as e:
        print(f"[ShadowTrainer] Could not query ModelRegistry: {e}")
        return 0


def log_to_registry(model_name, version, weights_path, mae, data_size):
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO analysis_modelregistry
        (id, model_name, version, weights_path, mae_score, training_data_size, is_production, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (str(uuid.uuid4()), model_name, version, weights_path, float(mae), data_size, False, datetime.utcnow()),
    )
    conn.commit()
    conn.close()


# ────────────────────────────────────────────────────────────────────────────
#  Training
# ────────────────────────────────────────────────────────────────────────────

def _train_model(model, X_train, y_train, epochs=30, lr=0.001):
    model.train()
    opt = optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.L1Loss()
    for _ in range(epochs):
        opt.zero_grad()
        preds = model(X_train).squeeze()
        loss = loss_fn(preds, y_train)
        loss.backward()
        opt.step()
    return model


def _evaluate(model, X_val, y_val):
    model.eval()
    with torch.no_grad():
        preds = model(X_val).squeeze()
        mae = torch.mean(torch.abs(preds - y_val)).item()
    return mae


def train_and_evaluate():
    rows, total = fetch_training_data()

    # ── Gate 1: Not enough total rows to bootstrap the very first model ────────
    if total < MIN_ROWS_TO_TRAIN:
        print(
            f"[ShadowTrainer] Only {total} rows in ScanLog — "
            f"need at least {MIN_ROWS_TO_TRAIN} to bootstrap the first model. "
            f"Pipeline is ready and waiting. Skipping."
        )
        return

    # ── Gate 2: Not enough new rows since the last training run ───────────────
    last_trained_size = get_last_trained_size()
    delta = total - last_trained_size

    if last_trained_size > 0 and delta < TRAIN_INTERVAL:
        print(
            f"[ShadowTrainer] {total} total rows, last trained on {last_trained_size}. "
            f"Only {delta} new rows since last run — need {TRAIN_INTERVAL} new rows. "
            f"Pipeline is ready and waiting. Skipping."
        )
        return

    print(
        f"[ShadowTrainer] ✓ Training triggered — {total} total rows "
        f"({delta} new rows since last training on {last_trained_size} rows)."
    )

    # Build tensors
    features = [_row_to_features(r) for r in rows]
    targets  = [float(r[4]) for r in rows]

    X = torch.tensor(features, dtype=torch.float32)
    y = torch.tensor(targets,  dtype=torch.float32)

    # Train/val split (80/20)
    split = max(int(len(X) * 0.8), 1)
    X_tr, X_val = X[:split], X[split:]
    y_tr, y_val = y[:split], y[split:]

    # Handle tiny val set
    if len(X_val) == 0:
        X_val, y_val = X_tr, y_tr

    version = f"v{int(datetime.utcnow().timestamp())}"
    model_dir = os.path.join(_HERE, "models")
    os.makedirs(model_dir, exist_ok=True)

    results = []
    for ModelClass, tag in [(AttentionModelBase, "shadow_a"), (ShadowModelB, "shadow_b")]:
        model = ModelClass()
        model = _train_model(model, X_tr, y_tr)
        mae   = _evaluate(model, X_val, y_val)

        path = os.path.join(model_dir, f"{tag}_{version}.pt")
        torch.save(model.state_dict(), path)
        log_to_registry(tag, version, path, mae, total)
        results.append((tag, mae, path))
        print(f"[ShadowTrainer] {tag} — MAE: {mae:.4f} — saved to {path}")

    # Report best
    best = min(results, key=lambda r: r[1])
    print(f"[ShadowTrainer] Best model this cycle: {best[0]} (MAE={best[1]:.4f})")


# ────────────────────────────────────────────────────────────────────────────
#  Entry point
# ────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--now" in sys.argv:
        train_and_evaluate()
    else:
        import schedule
        import time

        schedule.every(24).hours.do(train_and_evaluate)
        print("[ShadowTrainer] Scheduler started. Runs every 24 hours.")

        # Run once immediately on start so Docker logs confirm it's working
        train_and_evaluate()

        while True:
            schedule.run_pending()
            time.sleep(60)
