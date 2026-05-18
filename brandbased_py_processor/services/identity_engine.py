"""
Brand Verify AI Engine — client spec (Brand Verify Module PDF).

Dual-AI identity validation:
  1. Trained AI (strict) — prompt from Admin / Laravel, with PDF default fallback
  2. Non-trained AI (natural check) — hard-coded prompt (not editable in admin)
  3. Final decision — BB Trust Core rules (does not trust either AI alone)
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Client PDF §2.2 — non-trained prompt (hard-coded in backend Python)
# ---------------------------------------------------------------------------
NON_TRAINED_PROMPT_TEMPLATE = (
    "Hi, could you check whether the attached logo and the brand {brand_name} "
    "are genuinely associated with {domain}?\n"
    "Please confirm whether this is:\n"
    "● official brand website\n"
    "● authorised retailer\n"
    "● unrelated\n\n"
    "End your reply with exactly one line:\n"
    "Final classification: OFFICIAL_BRAND | AUTHORIZED_RETAILER | UNRELATED | UNKNOWN"
)

# ---------------------------------------------------------------------------
# Client PDF §2.1 — default trained prompt (Admin can override via Laravel)
# ---------------------------------------------------------------------------
DEFAULT_TRAINED_PROMPT_TEMPLATE = """You are a brand identity verification engine.
Your task is to determine whether a claimed brand, domain, and uploaded logo all represent the SAME legitimate real-world entity.

INPUT:
● Brand Name: {brand_name}
● Domain: {domain}
● Logo: (attached image)

INSTRUCTIONS:
1. Identify the real-world company that operates the domain.
2. Identify what brand the uploaded logo represents.
3. Compare both against the claimed brand name.
4. Classify relationship:
   ● OFFICIAL_BRAND
   ● AUTHORIZED_RETAILER
   ● UNRELATED
   ● FRAUD
5. Apply strict fraud logic:
   If logo represents a globally recognized brand AND domain is not owned by that brand AND no authorization exists → FRAUD

OUTPUT (JSON ONLY):
{
  "domain_owner": "",
  "logo_represents": "",
  "claimed_brand": "{brand_name}",
  "classification": "",
  "is_valid_association": true/false,
  "confidence": 0-1,
  "reasoning": "",
  "red_flags": []
}"""

TRAINED_PROMPT_KEY = "TRAINED_BRAND_VALIDATION"


def fill_prompt(prompt_template: str, brand_name: str, domain: str) -> str:
    return (
        prompt_template.replace("{brand_name}", brand_name).replace("{domain}", domain)
    )


def map_non_trained(text: str) -> str:
    """PDF §2.3 Step 1 — normalize non-trained natural language to a category."""
    value = text.strip().upper()

    allowed = [
        "OFFICIAL_BRAND",
        "AUTHORIZED_RETAILER",
        "UNRELATED",
        "UNKNOWN",
    ]

    if value in allowed:
        return value

    lower = text.lower()

    final_line = re.search(
        r"final\s+classification\s*:\s*"
        r"(official_brand|authorized_retailer|authorised_retailer|unrelated|unknown)",
        lower,
    )
    if final_line:
        token = final_line.group(1).replace("authorised", "authorized")
        if token == "official_brand":
            return "OFFICIAL_BRAND"
        if token == "authorized_retailer":
            return "AUTHORIZED_RETAILER"
        if token == "unrelated":
            return "UNRELATED"
        if token == "unknown":
            return "UNKNOWN"

    if "cannot verify" in lower or "cannot confirm" in lower:
        return "UNKNOWN"

    if "unable to verify" in lower or "unable to confirm" in lower:
        return "UNKNOWN"

    if "not official" in lower or "not the official" in lower:
        return "UNRELATED"

    if "not associated" in lower or "unrelated" in lower:
        return "UNRELATED"

    if "authorized retailer" in lower or "authorised retailer" in lower:
        return "AUTHORIZED_RETAILER"

    if "official" in lower:
        return "OFFICIAL_BRAND"

    return "UNKNOWN"


def _trained_is_valid_association(trained_result: dict) -> bool:
    value = trained_result.get("is_valid_association")
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    return bool(value)


def final_decision(trained_result: dict, non_trained_text: str) -> str:
    """
    PDF §2.3 Step 2 — Final Decision Logic (BB Trust Core).

    The trained engine (§2.1) is authoritative. The non-trained check is a
    fallback sanity check — it should not force REVIEW when trained returns
    high-confidence OFFICIAL_BRAND with a valid association.

    Returns: VERIFIED | REVIEW | REJECTED
    """
    trained_class = str(trained_result.get("classification", "")).strip().upper()
    trained_conf = float(trained_result.get("confidence", 0) or 0)
    non_trained_class = map_non_trained(non_trained_text)
    valid_association = _trained_is_valid_association(trained_result)

    if trained_class == "FRAUD":
        return "REJECTED"

    if trained_class == non_trained_class and trained_conf > 0.75:
        return "VERIFIED"

    if (
        trained_class == "OFFICIAL_BRAND"
        and trained_conf >= 0.75
        and valid_association
        and non_trained_class in ("UNKNOWN", "UNRELATED")
    ):
        return "VERIFIED"

    if trained_class == "AUTHORIZED_RETAILER":
        return "REVIEW"

    if (
        trained_class == "OFFICIAL_BRAND"
        and non_trained_class == "AUTHORIZED_RETAILER"
    ):
        return "REVIEW"

    if trained_class != non_trained_class:
        return "REVIEW"

    return "REVIEW"
