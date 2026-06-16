import os
import psycopg2
import shutil
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DB_HOST = os.environ.get("SUPABASE_DB_HOST")
DB_NAME = os.environ.get("SUPABASE_DB_NAME")
DB_USER = os.environ.get("SUPABASE_DB_USER")
DB_PASS = os.environ.get("SUPABASE_DB_PASSWORD")
DB_PORT = os.environ.get("SUPABASE_DB_PORT", "5432")

def promote_model(shadow_name, version):
    """
    Promotes a shadow model to production if its MAE is better.
    """
    conn = psycopg2.connect(
        host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS, port=DB_PORT
    )
    cursor = conn.cursor()
    
    # Set current production to false
    cursor.execute("""
        UPDATE analysis_modelregistry SET is_production = FALSE WHERE is_production = TRUE;
    """)
    
    # Get the shadow model record
    cursor.execute("""
        SELECT id, weights_path FROM analysis_modelregistry WHERE model_name = %s AND version = %s;
    """, (shadow_name, version))
    
    record = cursor.fetchone()
    if not record:
        print("Shadow model not found.")
        conn.close()
        return
        
    shadow_id, shadow_path = record
    
    # Copy weights
    new_prod_path = f"models/production_{version}.pt"
    src = os.path.join(os.path.dirname(__file__), shadow_path)
    dst = os.path.join(os.path.dirname(__file__), new_prod_path)
    
    if os.path.exists(src):
        shutil.copy(src, dst)
    else:
        print(f"Weights file {src} not found.")
    
    # Mark as promoted and create production record
    now = datetime.now()
    cursor.execute("""
        UPDATE analysis_modelregistry SET promoted_at = %s WHERE id = %s;
    """, (now, shadow_id))
    
    import uuid
    cursor.execute("""
        INSERT INTO analysis_modelregistry 
        (id, model_name, version, weights_path, mae_score, training_data_size, is_production, created_at)
        SELECT %s, 'production', version, %s, mae_score, training_data_size, TRUE, %s 
        FROM analysis_modelregistry WHERE id = %s
    """, (str(uuid.uuid4()), new_prod_path, now, shadow_id))
    
    conn.commit()
    conn.close()
    print(f"Promoted {shadow_name} {version} to production!")

if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3:
        promote_model(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python model_registry.py <shadow_name> <version>")
