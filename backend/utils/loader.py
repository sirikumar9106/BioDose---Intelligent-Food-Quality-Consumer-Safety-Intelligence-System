import pandas as pd

from utils.constants import DATASET_PATH


def load_dataset():
    df = pd.read_csv(DATASET_PATH)

    df.columns = df.columns.str.strip().str.upper()

    return df