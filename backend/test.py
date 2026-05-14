from apps.products.services.barcode import fetch_product

from apps.products.services.extractor import (
    extract_additives,
)

from apps.analysis.services.matcher import (
    match_additives,
)

from apps.analysis.services.scorer import (
    calculate_risk_scores,
)

from apps.analysis.services.report import (
    generate_report,
)


user_profile = {
    "conditions": [
        "DIABETES TYPE 2",
        "IBS",
        "PREGNANCY",
    ]
}


barcode = "7622210449283"


product = fetch_product(barcode)

print(product)

print()

if product:
    extracted = extract_additives(product)

    matched = match_additives(extracted)

    scored = calculate_risk_scores(
        matched,
        user_profile["conditions"],
    )

    report = generate_report(scored)

    print(report)