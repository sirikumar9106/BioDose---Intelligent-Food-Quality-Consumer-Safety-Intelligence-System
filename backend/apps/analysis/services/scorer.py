import os
import pandas as pd
from utils.constants import BASE_DIR

# ─── Load datasets once at module import ───────────────────────────────────────

_TOX_PATH = BASE_DIR / "data" / "toxicological_metadata.csv"
_INT_PATH  = BASE_DIR / "data" / "additive_interactions.csv"

# Toxicological metadata keyed by E-number (uppercase)
_tox_df = pd.read_csv(_TOX_PATH)
_tox_df.columns = _tox_df.columns.str.strip().str.lower()
_tox_df["e_number"] = _tox_df["e_number"].astype(str).str.upper().str.strip()
_TOX_MAP = {row["e_number"]: row for _, row in _tox_df.iterrows()}

# Interaction pairs keyed by frozenset({A, B})
_int_df = pd.read_csv(_INT_PATH)
_int_df.columns = _int_df.columns.str.strip().str.lower()
_INTERACTION_MAP = {}
for _, row in _int_df.iterrows():
    key = frozenset([
        str(row["additive_a"]).upper().strip(),
        str(row["additive_b"]).upper().strip(),
    ])
    _INTERACTION_MAP[key] = {
        "impact_score": float(row.get("impact_score", 0)),
        "confidence_score": float(row.get("confidence_score", 0)),
        "interaction_type": str(row.get("interaction_type", "")),
    }


# ─── Toxicological enrichment ───────────────────────────────────────────────

def _toxicology_penalty(e_number: str) -> float:
    """
    Returns an additive-level toxicological penalty (0.0 – 0.3) based on:
    - carcinogenicity ordinal (0–4 mapped → 0.0–0.15)
    - allergenic potential ordinal (0–2 → 0.0–0.07)
    - hyperactivity risk ordinal (0–2 → 0.0–0.05)
    - regulatory conflict flag (banned in EU or FDA → +0.05)
    """
    row = _TOX_MAP.get(e_number.upper())
    if row is None:
        return 0.0

    try:
        carc_ord  = float(row.get("carcinogenicity_ord", 0) or 0)
        allerg_ord = float(row.get("allergenic_potential_ord", 0) or 0)
        hyper_ord = float(row.get("hyperactivity_risk_ord", 0) or 0)
        reg_conflict = int(row.get("regulatory_conflict", 0) or 0)
    except (ValueError, TypeError):
        return 0.0

    penalty = (
        (carc_ord  / 4.0) * 0.15 +
        (allerg_ord / 2.0) * 0.07 +
        (hyper_ord  / 2.0) * 0.05 +
        reg_conflict       * 0.05
    )
    return round(min(penalty, 0.32), 4)


# ─── Interaction penalty ────────────────────────────────────────────────────

def _interaction_penalty(detected_e_numbers: list) -> float:
    """
    Scans all pairs of detected additives against the interaction map.
    Returns cumulative interaction penalty capped at 0.35.
    """
    total = 0.0
    seen = set()
    for i, a in enumerate(detected_e_numbers):
        for b in detected_e_numbers[i + 1:]:
            key = frozenset([a.upper(), b.upper()])
            if key in seen:
                continue
            seen.add(key)
            interaction = _INTERACTION_MAP.get(key)
            if interaction:
                contrib = interaction["impact_score"] * interaction["confidence_score"]
                total += contrib
    return round(min(total, 0.35), 4)


# ─── Main scoring function ──────────────────────────────────────────────────

# ─── Main scoring function ──────────────────────────────────────────────────

def compute_synergistic_risk(user_profile: dict, product_ingredients: list, dataset_matrix: dict) -> float:
    """
    Computes cumulative food risk based on Single-Trigger Dominance and Synergistic Toxicity.
    
    Args:
        user_profile (dict): Mapping of condition ID (e.g., 'MDC01') to 1 (active) or 0 (inactive).
        product_ingredients (list): List of ingredient identifiers found in the product.
        dataset_matrix (dict): Nested dictionary dataset_matrix[ingredient_id][condition_id] -> float score.
    """
    weights = {
        "MDC04": 1.0, "MDC17": 1.0, "MDC18": 1.0, "MDC19": 1.0, "MDC21": 1.0,  # Tier 1
        "MDC01": 0.6, "MDC02": 0.6, "MDC06": 0.6, "MDC07": 0.6, "MDC08": 0.6, "MDC09": 0.6, "MDC11": 0.6,  # Tier 2
        "MDC03": 0.3, "MDC05": 0.3, "MDC10": 0.3, "MDC12": 0.3, "MDC13": 0.3, "MDC14": 0.3, "MDC15": 0.3, "MDC16": 0.3, "MDC20": 0.3  # Tier 3
    }
    
    alpha = 0.25
    beta = 0.15
    
    # Pre-compute all conditions
    all_conditions = set(user_profile.keys()) | set(weights.keys())
    
    cr_values = {}
    
    for condition in all_conditions:
        p_j = user_profile.get(condition, 0)
        if p_j == 0:
            continue
            
        # Count ingredients that flag this condition and sum their scores
        flagging_scores = []
        for ingredient in product_ingredients:
            score = dataset_matrix.get(ingredient, {}).get(condition, 0.0)
            if score > 0:
                flagging_scores.append(score)
                
        n_j = len(flagging_scores)
        if n_j == 0:
            continue
            
        s_avg_j = sum(flagging_scores) / n_j
        
        # Step 1: Intra-Condition Risk
        r_j = min(1.0, s_avg_j * (1 + alpha * (n_j - 1)))
        
        # Step 2: Apply User Profile & Tier Weights
        w_cj = weights.get(condition, 0.0)
        cr_j = r_j * w_cj * p_j
        cr_values[condition] = cr_j
        
    # Step 3: Cumulative Final Score with Cross-Talk Penalty
    if not cr_values:
        return 0.0
        
    cr_max = max(cr_values.values())
    sum_other_cr = sum(cr_values.values()) - cr_max
    
    final_score = min(1.0, cr_max + beta * sum_other_cr)
    return round(final_score, 4)


def calculate_risk_scores(match_results: dict, user_mdc_ids: list, product: dict = None) -> dict:
    from utils.condition_registry import mdc_to_column, mdc_to_display
    
    user_profile = {mdc.upper(): 1 for mdc in user_mdc_ids}
    product_ingredients = []
    dataset_matrix = {}
    
    detected_e_numbers = []
    additive_results = []
    
    # 1. Parse matched additives into dataset_matrix
    for item in match_results["matched"]:
        row = item["row"]
        raw_e = str(row.get("E NO.", "")).upper().strip()
        name = row.get("GENERAL NAME", "UNKNOWN")
        key = raw_e if raw_e else name
        
        if raw_e:
            detected_e_numbers.append(raw_e)

        if key not in dataset_matrix:
            dataset_matrix[key] = {}
            product_ingredients.append(key)
            
        condition_scores_for_additive = {}
        is_flagged = False

        for mdc in user_mdc_ids:
            col = mdc_to_column(mdc)
            if not col or col not in row:
                continue

            try:
                score = float(row[col])
                if score > 0:
                    dataset_matrix[key][mdc] = max(score, dataset_matrix[key].get(mdc, 0.0))
                    condition_scores_for_additive[mdc_to_display(mdc)] = score
                    is_flagged = True
            except (ValueError, TypeError):
                pass
                
        tox_penalty = _toxicology_penalty(raw_e) if raw_e else 0.0

        if is_flagged or tox_penalty > 0:
            additive_results.append({
                "name": name,
                "e_number": raw_e or "UNKNOWN",
                "scientific_name": str(row.get("SCIENTIFIC NAME", "")).strip() if pd.notna(row.get("SCIENTIFIC NAME")) else "",
                "condition_scores": condition_scores_for_additive,
                "match_type": item["match_type"],
                "tox_penalty": tox_penalty,
                "allergic_reactions": str(row.get("ALLERGIC REACTIONS", "")).strip() if pd.notna(row.get("ALLERGIC REACTIONS")) else "",
                "reaction_severity": str(row.get("REACTION SEVERITY", "")).strip() if pd.notna(row.get("REACTION SEVERITY")) else "",
                "carcinogenic_risk": str(row.get("CARCINOGENIC RISK", "")).strip() if pd.notna(row.get("CARCINOGENIC RISK")) else "",
                "medication_interactions": str(row.get("MEDICATION INTERACTIONS", "")).strip() if pd.notna(row.get("MEDICATION INTERACTIONS")) else "",
                "adi": str(row.get("ADI MG PER KG BW", "")).strip() if pd.notna(row.get("ADI MG PER KG BW")) else ""
            })

    # 2. Enrich with nutritional profiling (sugar, salt, sat fat, allergens) as virtual ingredients
    if product and user_mdc_ids:
        nutrition = product.get("nutrition_per_100g") or {}
        ingredients_lower = str(product.get("ingredients_text", "")).lower()
        categories_lower = str(product.get("categories", "")).lower()
        searchable_text = f"{ingredients_lower} {categories_lower}".strip()

        for mdc in user_mdc_ids:
            disp = mdc_to_display(mdc).upper()
            nutri_key = None
            score = 0.0
            
            if "DIABETES" in disp:
                sugars = nutrition.get("sugars_g")
                if sugars is not None:
                    if sugars > 15.0: score = 1.0
                    elif sugars > 5.0: score = 0.5
                elif any(kw in searchable_text for kw in ["sugar", "syrup", "dextrose", "fructose"]):
                    score = 0.5
                nutri_key = "NUTRI_SUGARS"
                    
            elif "HYPERTENSION" in disp:
                salt = nutrition.get("salt_g")
                if salt is not None and salt > 1.5: score = 1.0
                elif salt is not None and salt > 0.3: score = 0.5
                nutri_key = "NUTRI_SALT"
                
            elif "HEART" in disp:
                sat_fat = nutrition.get("saturated_fat_g")
                if sat_fat is not None and sat_fat > 5.0: score = 1.0
                elif sat_fat is not None and sat_fat > 1.5: score = 0.5
                nutri_key = "NUTRI_FAT"
            
            # Allergens check
            allergen_kws = []
            if "PEANUT" in disp: allergen_kws = ["peanut", "arachis"]; nutri_key = "ALLERGEN_PEANUT"
            elif "SHELLFISH" in disp: allergen_kws = ["shellfish", "shrimp", "crab"]; nutri_key = "ALLERGEN_SHELLFISH"
            elif "DAIRY" in disp: allergen_kws = ["milk", "cheese", "whey", "dairy"]; nutri_key = "ALLERGEN_DAIRY"
            elif "CELIAC" in disp or "GLUTEN" in disp: allergen_kws = ["wheat", "gluten", "barley"]; nutri_key = "ALLERGEN_GLUTEN"
            elif "SOY" in disp: allergen_kws = ["soy", "soya", "tofu"]; nutri_key = "ALLERGEN_SOY"

            if allergen_kws and any(kw in searchable_text for kw in allergen_kws):
                score = 1.0
                
            if nutri_key and score > 0:
                if nutri_key not in dataset_matrix:
                    dataset_matrix[nutri_key] = {}
                    product_ingredients.append(nutri_key)
                dataset_matrix[nutri_key][mdc] = max(score, dataset_matrix[nutri_key].get(mdc, 0.0))

    # 3. Calculate final Risk Score using the rigorous math algorithm
    final_risk_score = compute_synergistic_risk(user_profile, product_ingredients, dataset_matrix)

    # 4. Generate risk label
    if final_risk_score >= 0.75:
        risk_label = "Strictly Avoid"
    elif final_risk_score >= 0.50:
        risk_label = "Avoid"
    elif final_risk_score >= 0.25:
        risk_label = "Caution"
    else:
        risk_label = "Safe"

    # Compute interaction penalty (purely for reporting)
    interaction_penalty = _interaction_penalty(detected_e_numbers)
    tox_penalties = [a["tox_penalty"] for a in additive_results if a.get("tox_penalty", 0) > 0]
    tox_amplifier = (sum(tox_penalties) / len(tox_penalties)) if tox_penalties else 0.0

    # Ensure min score is 0.05 if no risk
    final_risk_score = max(final_risk_score, 0.05) if final_risk_score == 0 else final_risk_score

    # Compute a proxy final_scores dict for the frontend report UI
    final_scores_ui = {}
    for mdc in user_mdc_ids:
        # Sum of dataset_matrix scores for this mdc across all ingredients
        scores_for_mdc = [dataset_matrix[ing].get(mdc, 0) for ing in product_ingredients if dataset_matrix[ing].get(mdc, 0) > 0]
        if scores_for_mdc:
            disp = mdc_to_display(mdc)
            final_scores_ui[disp] = round(min(sum(scores_for_mdc) * 0.5, 1.0), 3) # simplified proxy just for UI bars

    return {
        "additives":            additive_results,
        "final_scores":         final_scores_ui,
        "final_risk_score":     final_risk_score,
        "risk_label":           risk_label,
        "interaction_penalty":  round(interaction_penalty, 3),
        "toxicology_penalty":   round(tox_amplifier, 3),
    }