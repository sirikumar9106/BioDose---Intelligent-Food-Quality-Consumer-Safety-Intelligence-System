from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATASET_PATH = BASE_DIR / "data" / "IDP.csv"

SIMILARITY_THRESHOLD = 75

SAFE_SCORE = 0.0
CAUTION_SCORE = 0.33
AVOID_SCORE = 0.67
STRICT_AVOID_SCORE = 1.0

RISK_LABELS = {
    0.0: "SAFE",
    0.33: "CAUTION",
    0.67: "AVOID",
    1.0: "STRICTLY AVOID",
}