from models.predictor import (
    predict_risk,
)

from utils.constants import (
    RISK_LABELS,
)


def nearest_label(score):

    closest = min(
        RISK_LABELS.keys(),
        key=lambda x: abs(x - score),
    )

    return RISK_LABELS[closest]


def normalize_percentage(score):

    normalized = min(
        max(
            (score / 7) * 100,
            0,
        ),
        100,
    )

    return round(normalized, 1)


def generate_report(scored_results):

    final_report = []

    final_scores = scored_results["final_scores"]
    additives = scored_results["additives"]

    # Guard: if no conditions were scored, return a minimal safe report
    if not final_scores:
        return {
            "overall_risk": "SAFE",
            "overall_risk_percentage": 0.0,
            "hazard_index": 0.0,
            "interaction_score": 0.0,
            "ebm_amplification": 0.0,
            "final_system_score": 0.0,
            "final_risk_score": scored_results.get("final_risk_score", 0.1),
            "risk_label": scored_results.get("risk_label", "Safe"),
            "product_risk_summary": [],
            "additives": additives,
            "final_scores": {},
        }

    average_score = sum(final_scores.values()) / len(final_scores)

    additive_count = len(additives)

    interaction_score = round(
        additive_count * 0.15,
        2,
    )

    hazard_index = round(
        average_score * 10,
        2,
    )

    combined_score = round(
        (
            hazard_index * 0.7
        )
        +
        (
            interaction_score * 0.3
        ),
        2,
    )

    ml_result = predict_risk(
        additive_count=additive_count,
        hazard_index=hazard_index,
        interaction_score=interaction_score,
        combined_score=combined_score,
    )

    high_probability = (
        ml_result["confidence"]
        .get("HIGH", 0)
    )

    moderate_probability = (
        ml_result["confidence"]
        .get("MODERATE", 0)
    )

    ebm_amplification = round(
        (
            high_probability * 1.5
        )
        +
        (
            moderate_probability * 0.7
        ),
        2,
    )

    final_system_score = round(
        combined_score
        +
        ebm_amplification,
        2,
    )

    overall_risk_percentage = (
        normalize_percentage(
            final_system_score
        )
    )

    overall_label = nearest_label(
        average_score
    )

    for condition, score in (
        final_scores.items()
    ):

        label = nearest_label(score)

        final_report.append(
            {
                "condition":
                    condition,

                "score":
                    round(score * 100, 1),

                "risk_label":
                    label,
            }
        )

    return {
        "overall_risk": overall_label,
        "overall_risk_percentage": overall_risk_percentage,
        "hazard_index": hazard_index,
        "interaction_score": interaction_score,
        "ebm_amplification": ebm_amplification,
        "final_system_score": final_system_score,
        "final_risk_score": scored_results.get("final_risk_score", round(combined_score / 10, 2)),
        "risk_label": scored_results.get("risk_label", overall_label),
        "product_risk_summary": final_report,
        "additives": additives,
        "final_scores": final_scores,
    }