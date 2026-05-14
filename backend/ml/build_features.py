import json
import pandas as pd


PRODUCTS_PATH = "data/product_samples.json"

TOX_PATH = "data/toxicological_metadata.csv"

INTERACTION_PATH = (
    "data/additive_interactions.csv"
)


def load_data():

    with open(
        PRODUCTS_PATH,
        "r",
        encoding="utf-8",
    ) as file:

        products = json.load(file)

    tox = pd.read_csv(TOX_PATH)

    interactions = pd.read_csv(
        INTERACTION_PATH
    )

    return products, tox, interactions


def build_toxicology_lookup(tox):

    lookup = {}

    for _, row in tox.iterrows():

        e_number = str(
            row["e_number"]
        ).upper()

        lookup[e_number] = row.to_dict()

    return lookup


def interaction_score(
    additives,
    interactions,
):

    score = 0.0

    checked = set()

    for _, row in interactions.iterrows():

        a = str(
            row["additive_a"]
        ).upper()

        b = str(
            row["additive_b"]
        ).upper()

        pair = tuple(sorted([a, b]))

        if pair in checked:
            continue

        if (
            a in additives
            and b in additives
        ):

            score += float(
                row["confidence_score"]
            )

            checked.add(pair)

    return round(score, 2)


def compute_hazard_index(
    additives,
    tox_lookup,
):

    total = 0.0

    count = 0

    for additive in additives:

        if additive not in tox_lookup:
            continue

        row = tox_lookup[additive]

        carcinogenicity = float(
            row.get(
                "carcinogenicity_ord",
                0,
            )
        )

        allergenic = float(
            row.get(
                "allergenic_potential_ord",
                0,
            )
        )

        hyperactivity = float(
            row.get(
                "hyperactivity_risk_ord",
                0,
            )
        )

        hepatotoxicity = float(
            row.get(
                "hepatotoxicity_ord",
                0,
            )
        )

        reproductive = float(
            row.get(
                "reproductive_risk_ord",
                0,
            )
        )

        average_health = float(
            row.get(
                "average_health_impact",
                0,
            )
        )

        additive_score = (
            carcinogenicity * 0.25
            + allergenic * 0.15
            + hyperactivity * 0.15
            + hepatotoxicity * 0.15
            + reproductive * 0.10
            + average_health * 0.20
        )

        total += additive_score

        count += 1

    if count == 0:
        return 0.0

    return round(total / count, 2)


def build_feature_dataset():

    (
        products,
        tox,
        interactions,
    ) = load_data()

    tox_lookup = (
        build_toxicology_lookup(tox)
    )

    rows = []

    for product in products:

        additives = [
            additive.upper()
            for additive in product.get(
                "additives",
                []
            )
        ]

        hazard_index = (
            compute_hazard_index(
                additives,
                tox_lookup,
            )
        )

        interaction_strength = (
            interaction_score(
                additives,
                interactions,
            )
        )

        row = {
            "barcode":
                product.get("barcode"),

            "product_name":
                product.get(
                    "product_name"
                ),

            "additive_count":
                len(additives),

            "hazard_index":
                hazard_index,

            "interaction_score":
                interaction_strength,
        }

        rows.append(row)

    df = pd.DataFrame(rows)

    df.to_csv(
        "data/model_features.csv",
        index=False,
    )

    print(df.head())

    print()
    print(
        "Saved feature dataset:"
    )

    print(
        "data/model_features.csv"
    )


if __name__ == "__main__":
    build_feature_dataset()