import requests

from config import (
    LARAVEL_API_BASE,
    INTERNAL_API_TOKEN,
)


HEADERS = {
    "Accept": "application/json",
    "Authorization": f"Bearer {INTERNAL_API_TOKEN}"
}


def get_pending_brand_requests():

    url = f"{LARAVEL_API_BASE}/internal/brand-verification/pending"

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=60
    )

    response.raise_for_status()

    return response.json()


def claim_brand_request(request_id: str):

    url = f"{LARAVEL_API_BASE}/internal/brand-verification/{request_id}/claim"

    response = requests.post(
        url,
        headers=HEADERS,
        timeout=60
    )

    response.raise_for_status()

    return response.json()


def update_brand_request(request_id: str, payload: dict):

    url = f"{LARAVEL_API_BASE}/internal/brand-verification/{request_id}/status"

    response = requests.post(
        url,
        headers=HEADERS,
        json=payload,
        timeout=60
    )

    response.raise_for_status()

    return response.json()


def get_prompt(prompt_key: str):

    url = f"{LARAVEL_API_BASE}/internal/brand-ai-prompts/{prompt_key}"

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=60
    )

    response.raise_for_status()

    return response.json()