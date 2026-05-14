from rapidfuzz import process, fuzz

from utils.loader import load_dataset
from utils.cleaner import normalize_text
from utils.constants import SIMILARITY_THRESHOLD


df = load_dataset()

dataset_names = []

name_to_row = {}

e_number_to_row = {}


for _, row in df.iterrows():
    e_number = str(row.get("E NO.", "")).upper().strip()

    packaging_name = normalize_text(
        row.get("PACKAGING NAME", "")
    )

    general_name = normalize_text(
        row.get("GENERAL NAME", "")
    )

    if e_number:
        e_number_to_row[e_number] = row

    if packaging_name:
        dataset_names.append(packaging_name)
        name_to_row[packaging_name] = row

    if general_name:
        dataset_names.append(general_name)
        name_to_row[general_name] = row


def match_additives(extracted_data):
    matched = []

    unmatched = []

    e_numbers = extracted_data.get(
        "e_numbers",
        [],
    )

    ingredient_names = extracted_data.get(
        "ingredient_names",
        [],
    )

    for e_number in e_numbers:
        cleaned = e_number.upper().strip()

        row = e_number_to_row.get(cleaned)

        if row is not None:
            matched.append({
                "query": cleaned,
                "match_type": "e_number",
                "row": row,
            })
        else:
            unmatched.append(cleaned)

    for ingredient in ingredient_names:
        cleaned = normalize_text(ingredient)

        if cleaned in name_to_row:
            matched.append({
                "query": cleaned,
                "match_type": "exact_name",
                "row": name_to_row[cleaned],
            })

            continue

        result = process.extractOne(
            cleaned,
            dataset_names,
            scorer=fuzz.ratio,
        )

        if result:
            best_match, score, _ = result

            if score >= SIMILARITY_THRESHOLD:
                matched.append({
                    "query": cleaned,
                    "match_type": "fuzzy",
                    "similarity": score,
                    "row": name_to_row[best_match],
                })

            else:
                unmatched.append(cleaned)

        else:
            unmatched.append(cleaned)

    return {
        "matched": matched,
        "unmatched": unmatched,
    }