def calculate_risk_scores(
    match_results,
    user_conditions,
):
    additive_results = []

    product_condition_scores = {}

    for condition in user_conditions:
        product_condition_scores[condition] = []

    for item in match_results["matched"]:
        row = item["row"]

        condition_scores = {}

        for condition in user_conditions:
            column = f"{condition} (SCORE)"

            if column not in row:
                continue

            try:
                score = float(row[column])

                condition_scores[condition] = score

                product_condition_scores[
                    condition
                ].append(score)

            except:
                continue

        if not condition_scores:
            continue

        additive_results.append({
            "name": row.get(
                "GENERAL NAME",
                "UNKNOWN",
            ),
            "e_number": row.get(
                "E NO.",
                "UNKNOWN",
            ),
            "condition_scores": condition_scores,
            "match_type": item["match_type"],
        })

    final_scores = {}

    for condition, scores in product_condition_scores.items():
        if not scores:
            continue

        max_score = max(scores)

        mean_score = sum(scores) / len(scores)

        burden_factor = min(
            len(scores) * 0.1,
            1.0,
        )

        final_score = (
            0.5 * max_score
            + 0.3 * mean_score
            + 0.2 * burden_factor
        )

        final_score = round(
            min(final_score, 1.0),
            2,
        )

        final_scores[condition] = final_score

    return {
        "additives": additive_results,
        "final_scores": final_scores,
    }