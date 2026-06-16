import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

class Config:
    """
    Configuration settings for the ML pipeline.
    """
    DB_HOST = os.environ.get("SUPABASE_DB_HOST")
    DB_NAME = os.environ.get("SUPABASE_DB_NAME", "postgres")
    DB_USER = os.environ.get("SUPABASE_DB_USER", "postgres")
    DB_PASS = os.environ.get("SUPABASE_DB_PASSWORD")
    DB_PORT = os.environ.get("SUPABASE_DB_PORT", "5432")
    
    EMBED_DIM = 64
    NUM_HEADS = 4
    NUM_LAYERS = 2
    DROPOUT = 0.2
    
    MIN_SAMPLES_TO_TRAIN = 100
    PROMOTION_THRESHOLD_IMPROVEMENT = 0.05
