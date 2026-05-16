#!/usr/bin/env python3
"""
Smoke test for Post /api/bb/smart-size with brandAiSmartSize + goldenReference.
Uses a portrait viewBox to exercise wide-golden vs tall-mark path.

Set OPENAI_API_KEY in ui-demo/.env (see .env.example) and run the API first:
  cd ui-demo && .venv/bin/uvicorn bb_smart_sizing_server:app --port 8001
Then: python3 test_golden_smart_size.py
"""
from __future__ import annotations

import os
import sys
from typing import Any, Dict

try:
    import httpx
except ImportError as e:  # pragma: no cover
    print("Install httpx: pip install -r requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

# Same directory as this script (ui-demo/)
_ROOT = os.path.dirname(os.path.abspath(__file__))

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_ROOT, ".env"))
except Exception:
    pass

API = os.environ.get("BB_TEST_SMART_SIZE_URL", "http://127.0.0.1:8001/api/bb/smart-size")

# Portrait "other" mark (w/h < 1), similar to your Porsche example
PORTRAIT_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.001 0 265.65 340.75">'
    "<path d='M20 20 L20 300 L200 300 Z' fill='currentColor' /></svg>"
)

BODY: Dict[str, Any] = {
    "brand": "porsche-probe",
    "context": {"fontSize": "16px", "lineHeight": "24px", "textLength": 42},
    "rules": "",
    "brandAiSmartSize": True,
    "goldenReference": {
        "currentUpload": "golden-lab.svg",
        "logoRatio": 2.728,
        "logoRatioText": "30:11 (2.728)",
        "trimViewBox": "0 65.2 192.7 70.6",
    },
    "svg": PORTRAIT_SVG,
}


def main() -> None:
    # Key must be available to the **uvicorn process** (ui-demo/.env is loaded in bb_smart_sizing_server.py).
    print(f"POST {API!r} … (X-BB-SmartSize-Source: expect openai:golden)")

    with httpx.Client(timeout=60.0) as client:
        try:
            r = client.post(API, json=BODY, headers={"Content-Type": "application/json"})
        except httpx.ConnectError as e:
            print("Cannot connect. Start the API from ui-demo/:\n  uvicorn bb_smart_sizing_server:app --port 8001", file=sys.stderr)
            raise SystemExit(2) from e

    src = r.headers.get("X-BB-SmartSize-Source", "")
    err = (r.headers.get("X-BB-SmartSize-Error") or "").strip()
    if err:
        print("X-BB-SmartSize-Error:", err[:200])

    print("Status:", r.status_code, "|", "X-BB-SmartSize-Source:", src or "(empty)")

    if r.status_code != 200:
        print("Body (truncated):", (r.text or "")[:500])
        raise SystemExit(1)

    j = r.json()
    print(
        "sizeMul", j.get("sizeMul"),
        "| maxWMul", j.get("maxWMul"),
        "| viewBoxRatio", j.get("viewBoxRatio"),
        "| ratioBand", j.get("ratioBand") or "—",
    )
    if src == "openai:golden":
        print("OK: OpenAI + golden path returned.")
    elif "fallback" in (src or ""):
        print(
            "Not using the model. Put OPENAI_API_KEY=... in ui-demo/.env (one line), restart the API process."
        )


if __name__ == "__main__":
    main()
