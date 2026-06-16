# Hardcoded Medical Condition Registry
# MDC IDs are backend identifiers; display names are shown in the frontend.
# IDP columns come from IDP.csv score columns.

CONDITION_REGISTRY = {
    "MDC01": {"display": "Diabetes Type 2",        "idp_col": "DIABETES TYPE 2 (SCORE)"},
    "MDC02": {"display": "Hypertension",            "idp_col": "HYPERTENSION (SCORE)"},
    "MDC03": {"display": "Asthma",                  "idp_col": "ASTHMA (SCORE)"},
    "MDC04": {"display": "Celiac Disease",          "idp_col": "CELIAC DISEASE (SCORE)"},
    "MDC05": {"display": "IBS",                     "idp_col": "IBS (SCORE)"},
    "MDC06": {"display": "Chronic Kidney Disease",  "idp_col": "CHRONIC KIDNEY DISEASE (SCORE)"},
    "MDC07": {"display": "Liver Disease",           "idp_col": "LIVER DISEASE (SCORE)"},
    "MDC08": {"display": "Thyroid Disorders",       "idp_col": "THYROID DISORDERS (SCORE)"},
    "MDC09": {"display": "Autoimmune Conditions",   "idp_col": "AUTOIMMUNE CONDITIONS (SCORE)"},
    "MDC10": {"display": "ADHD",                    "idp_col": "ADHD (SCORE)"},
    "MDC11": {"display": "Heart Disease",           "idp_col": "HEART DISEASE (SCORE)"},
    "MDC12": {"display": "Pregnancy",               "idp_col": "PREGNANCY (SCORE)"},
    "MDC13": {"display": "Lactation",               "idp_col": "LACTATION (SCORE)"},
    "MDC14": {"display": "Infants (0–2 yrs)",       "idp_col": "INFANTS O TO 2 YRS (SCORE)"},
    "MDC15": {"display": "Children (3–12 yrs)",     "idp_col": "CHILDREN 3 TO 12 YRS (SCORE)"},
    "MDC16": {"display": "Elderly (60+)",           "idp_col": "ELDERLY 60+ (SCORE)"},
    "MDC17": {"display": "Peanut Allergy",          "idp_col": "PEANUT ALLERGY (SCORE)"},
    "MDC18": {"display": "Shellfish Allergy",       "idp_col": "SHELFISH ALLERGY (SCORE)"},
    "MDC19": {"display": "Dairy Allergy",           "idp_col": "DAIRY ALLERGY (SCORE)"},
    "MDC20": {"display": "Gluten Sensitivity",      "idp_col": "GLUTEN SENSITIVITY (SCORE)"},
    "MDC21": {"display": "Soy Allergy",             "idp_col": "SOY ALLERGY (SCORE)"},
}

# Reverse: display name → MDC ID (case-insensitive lookup)
_DISPLAY_TO_MDC = {v["display"].lower(): k for k, v in CONDITION_REGISTRY.items()}

# Also map the raw IDP column names → MDC ID
_COLUMN_TO_MDC = {v["idp_col"].upper(): k for k, v in CONDITION_REGISTRY.items()}


def name_to_mdc(display_name: str) -> str:
    """Convert a display condition name to its MDC ID. Returns None if not found."""
    return _DISPLAY_TO_MDC.get(display_name.strip().lower())


def mdc_to_column(mdc_id: str) -> str:
    """Convert an MDC ID to the IDP.csv column name for score lookup."""
    entry = CONDITION_REGISTRY.get(mdc_id.upper())
    return entry["idp_col"] if entry else None


def mdc_to_display(mdc_id: str) -> str:
    """Convert an MDC ID to the human-readable display name."""
    entry = CONDITION_REGISTRY.get(mdc_id.upper())
    return entry["display"] if entry else mdc_id


def conditions_to_mdc_string(condition_names: list) -> str:
    """Convert a list of display names to a comma-separated MDC ID string."""
    ids = []
    for name in condition_names:
        mdc = name_to_mdc(name)
        if mdc:
            ids.append(mdc)
    return ",".join(ids)


def mdc_string_to_columns(mdc_string: str) -> list:
    """Convert comma-separated MDC IDs to IDP.csv column names."""
    if not mdc_string:
        return []
    return [mdc_to_column(m.strip()) for m in mdc_string.split(",") if mdc_to_column(m.strip())]


def all_display_names() -> list:
    """Return all 21 condition display names (for frontend rendering)."""
    return [v["display"] for v in CONDITION_REGISTRY.values()]
