import joblib
import pandas as pd


MODEL_PATH = "models/ebm_model.pkl"


model = joblib.load(MODEL_PATH)


def predict_risk(
    additive_count,
    hazard_index,
    interaction_score,
    combined_score,
):

    input_df = pd.DataFrame(
        [
            {
                "additive_count":
                    additive_count,

                "hazard_index":
                    hazard_index,

                "interaction_score":
                    interaction_score,

                "combined_score":
                    combined_score,
            }
        ]
    )

    prediction = model.predict(
        input_df
    )[0]

    probabilities = (
        model.predict_proba(
            input_df
        )[0]
    )

    probability_map = dict(
        zip(
            model.classes_,
            probabilities,
        )
    )

    return {
        "prediction":
            prediction,

        "confidence":
            probability_map,
    }