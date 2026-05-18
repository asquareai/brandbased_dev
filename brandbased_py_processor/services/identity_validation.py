"""
Runs the client Brand Verify AI pipeline (trained + non-trained + decision).
"""

from __future__ import annotations

import json
from typing import Any, Callable, Dict, Optional

from openai import OpenAI

from config import OPENAI_API_KEY
from services.api_client import get_prompt
from services.identity_engine import (
    DEFAULT_TRAINED_PROMPT_TEMPLATE,
    NON_TRAINED_PROMPT_TEMPLATE,
    TRAINED_PROMPT_KEY,
    fill_prompt,
    final_decision,
    map_non_trained,
)
from services.logo_converter import svg_text_to_png_data_url, svg_url_to_png_data_url


# Per vision call — two calls per job; avoid hanging the worker indefinitely.
client = OpenAI(api_key=OPENAI_API_KEY, timeout=120.0)


def extract_json(text: str) -> dict:
    cleaned = text.strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned.replace("```json", "", 1).strip()

    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```", "", 1).strip()

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()

    return json.loads(cleaned)


def build_vision_message(final_prompt: str, logo_png_data_url: str):
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": final_prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": logo_png_data_url},
                },
            ],
        }
    ]


def load_trained_prompt_template() -> str:
    try:
        response = get_prompt(TRAINED_PROMPT_KEY)
        prompt = response.get("prompt")
        content = prompt.get("prompt_content") if prompt else None
        if content and str(content).strip():
            return str(content)
    except Exception:
        pass

    return DEFAULT_TRAINED_PROMPT_TEMPLATE


def _logo_data_url(logo_url: str, logo_svg_text: Optional[str]) -> str:
    if logo_svg_text and "<svg" in logo_svg_text.lower():
        return svg_text_to_png_data_url(logo_svg_text)
    return svg_url_to_png_data_url(logo_url)


def run_trained_ai_validation(
    brand_name: str,
    domain: str,
    logo_url: str,
    logo_svg_text: Optional[str] = None,
    logo_png_data_url: Optional[str] = None,
) -> dict:
    prompt_template = load_trained_prompt_template()
    final_prompt = fill_prompt(prompt_template, brand_name, domain)
    if not logo_png_data_url:
        logo_png_data_url = _logo_data_url(logo_url, logo_svg_text)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=build_vision_message(final_prompt, logo_png_data_url),
        temperature=0.1,
    )

    text = response.choices[0].message.content.strip()
    return extract_json(text)


def run_non_trained_ai_validation(
    brand_name: str,
    domain: str,
    logo_url: str,
    logo_svg_text: Optional[str] = None,
    logo_png_data_url: Optional[str] = None,
) -> str:
    final_prompt = fill_prompt(
        NON_TRAINED_PROMPT_TEMPLATE,
        brand_name,
        domain,
    )
    if not logo_png_data_url:
        logo_png_data_url = _logo_data_url(logo_url, logo_svg_text)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=build_vision_message(final_prompt, logo_png_data_url),
        temperature=0.4,
    )

    return response.choices[0].message.content.strip()


def run_identity_validation(
    brand_name: str,
    domain: str,
    logo_url: str,
    logo_svg_text: Optional[str] = None,
    on_stage: Optional[Callable[[str, int], None]] = None,
) -> Dict[str, Any]:
    """
    Full client identity pipeline. Optional on_stage(name, progress) for worker UI updates.
    """
    logo_png_data_url = _logo_data_url(logo_url, logo_svg_text)

    if on_stage:
        on_stage("trained_ai", 40)

    trained_result = run_trained_ai_validation(
        brand_name=brand_name,
        domain=domain,
        logo_url=logo_url,
        logo_svg_text=logo_svg_text,
        logo_png_data_url=logo_png_data_url,
    )

    if on_stage:
        on_stage("non_trained_ai", 70)

    non_trained_text = run_non_trained_ai_validation(
        brand_name=brand_name,
        domain=domain,
        logo_url=logo_url,
        logo_svg_text=logo_svg_text,
        logo_png_data_url=logo_png_data_url,
    )

    if on_stage:
        on_stage("decision", 90)

    non_trained_mapped = map_non_trained(non_trained_text)

    decision = final_decision(
        trained_result=trained_result,
        non_trained_text=non_trained_text,
    )

    return {
        "trained_ai": trained_result,
        "non_trained_ai": non_trained_text,
        "non_trained_ai_mapped": non_trained_mapped,
        "final_decision": decision,
    }


def map_decision_to_status(decision: str) -> Dict[str, str]:
    if decision == "VERIFIED":
        return {
            "identity_status": "verified",
            "final_status": "verified",
        }

    if decision == "REJECTED":
        return {
            "identity_status": "rejected",
            "final_status": "rejected",
        }

    return {
        "identity_status": "under_review",
        "final_status": "review",
    }
