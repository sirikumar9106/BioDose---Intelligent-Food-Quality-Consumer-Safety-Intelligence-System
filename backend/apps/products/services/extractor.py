from utils.cleaner import (
    tokenize_ingredients,
    extract_e_numbers,
)


def extract_additives(product_data):
    additives_tags = product_data.get("additives_tags", [])

    e_numbers = []

    for additive in additives_tags:
        cleaned = additive.replace("en:", "").upper()

        e_numbers.append(cleaned)

    ingredients_text = product_data.get(
        "ingredients_text",
        "",
    )

    ingredient_names = tokenize_ingredients(
        ingredients_text
    )

    fallback_e_numbers = extract_e_numbers(
        ingredients_text
    )

    e_numbers.extend(fallback_e_numbers)

    e_numbers = list(set(e_numbers))

    ingredient_names = list(set(ingredient_names))

    return {
        "e_numbers": e_numbers,
        "ingredient_names": ingredient_names,
    }