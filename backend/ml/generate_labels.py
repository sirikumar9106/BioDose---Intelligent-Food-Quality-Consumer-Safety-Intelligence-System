import pandas as pd


FEATURES_PATH = (
    "data/model_features.csv"
)


def assign_risk_label(score):

    if score < 1.5:
        return "LOW"

    elif score < 4:
        return "MODERATE"

    elif score < 7:
        return "HIGH"

    return "SEVERE"


def build_labels():

    df = pd.read_csv(
        FEATURES_PATH
    )

    combined_score = (
        df["hazard_index"] * 0.7
        + df["interaction_score"] * 0.3
    )

    df["combined_score"] = (
        combined_score.round(2)
    )

    df["risk_label"] = (
        df["combined_score"]
        .apply(assign_risk_label)
    )

    df.to_csv(
        "data/training_dataset.csv",
        index=False,
    )

    print(df.head())

    print()
    print(
        "Saved:"
    )

    print(
        "data/training_dataset.csv"
    )


if __name__ == "__main__":
    build_labels()