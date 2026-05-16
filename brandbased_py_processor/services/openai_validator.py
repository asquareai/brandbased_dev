import json

from openai import OpenAI

from config import OPENAI_API_KEY
from services.api_client import get_prompt
from services.logo_converter import svg_url_to_png_data_url


client = OpenAI(api_key=OPENAI_API_KEY)


def load_prompt(prompt_key: str) -> str:
    response = get_prompt(prompt_key)
    prompt = response.get("prompt")

    if not prompt:
        raise Exception(f"Prompt not found: {prompt_key}")

    return prompt["prompt_content"]


def fill_prompt(prompt_template: str, brand_name: str, domain: str) -> str:
    return (
        prompt_template
        .replace("{brand_name}", brand_name)
        .replace("{domain}", domain)
    )


def build_vision_message(final_prompt: str, logo_png_data_url: str):
    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": final_prompt
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": logo_png_data_url
                    }
                }
            ]
        }
    ]


def extract_json(text: str) -> dict:
    cleaned = text.strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned.replace("```json", "", 1).strip()

    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```", "", 1).strip()

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()

    return json.loads(cleaned)


def run_trained_ai_validation(
    brand_name: str,
    domain: str,
    logo_url: str,
):
    prompt_template = load_prompt("TRAINED_BRAND_VALIDATION")

    final_prompt = fill_prompt(
        prompt_template,
        brand_name,
        domain
    )

    logo_png_data_url = svg_url_to_png_data_url(logo_url)

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
):
    prompt_template = load_prompt("NON_TRAINED_BRAND_VALIDATION")

    final_prompt = fill_prompt(
        prompt_template,
        brand_name,
        domain
    )

    logo_png_data_url = svg_url_to_png_data_url(logo_url)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=build_vision_message(final_prompt, logo_png_data_url),
        temperature=0.4,
    )

    return response.choices[0].message.content.strip()


def map_non_trained(text: str):
    value = text.strip().upper()

    allowed = [
        "OFFICIAL_BRAND",
        "AUTHORIZED_RETAILER",
        "UNRELATED",
        "UNKNOWN"
    ]

    if value in allowed:
        return value

    lower = text.lower()

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


def final_decision(
    trained_result: dict,
    non_trained_text: str,
):
    trained_class = str(
        trained_result.get("classification", "")
    ).strip().upper()

    trained_conf = float(
        trained_result.get("confidence", 0)
    )

    logo_represents = str(
        trained_result.get("logo_represents", "")
    ).lower()

    non_trained_class = map_non_trained(non_trained_text)

    if trained_class == "FRAUD":
        return "REJECTED"

    if "generic" in logo_represents:
        return "REVIEW"

    if (
        trained_class == "OFFICIAL_BRAND"
        and non_trained_class == "OFFICIAL_BRAND"
        and trained_conf >= 0.75
    ):
        return "VERIFIED"

    if trained_class == "AUTHORIZED_RETAILER":
        return "REVIEW"

    if non_trained_class in ["UNRELATED", "UNKNOWN"]:
        return "REVIEW"

    if trained_class != non_trained_class:
        return "REVIEW"

    return "REVIEW"