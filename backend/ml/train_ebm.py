import joblib
import pandas as pd

from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

from interpret.glassbox import (
    ExplainableBoostingClassifier,
)


DATASET_PATH = "data/training_dataset.csv"


def main():

    df = pd.read_csv(DATASET_PATH)

    X = df[
        [
            "additive_count",
            "hazard_index",
            "interaction_score",
            "combined_score",
        ]
    ]

    y = df["risk_label"]

    X_train, X_test, y_train, y_test = (
        train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
        )
    )

    model = ExplainableBoostingClassifier(
        interactions=3,
        random_state=42,
    )

    model.fit(
        X_train,
        y_train,
    )

    predictions = model.predict(X_test)

    print()

    print(
        classification_report(
            y_test,
            predictions,
        )
    )

    joblib.dump(
        model,
        "models/ebm_model.pkl",
    )

    print()

    print("Saved model:")

    print(
        "models/ebm_model.pkl"
    )


if __name__ == "__main__":
    main()