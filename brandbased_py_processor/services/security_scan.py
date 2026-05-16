import re
import requests
from typing import Dict, Any


DANGEROUS_PATTERNS = [
    r"<\s*script\b",
    r"onload\s*=",
    r"onclick\s*=",
    r"onerror\s*=",
    r"onmouseover\s*=",
    r"onfocus\s*=",
    r"javascript\s*:",
    r"data:text/html",
    r"<\s*iframe\b",
    r"<\s*object\b",
    r"<\s*embed\b",
    r"<\s*foreignObject\b",
]


def download_svg(svg_url: str) -> str:
    response = requests.get(svg_url, timeout=30)
    response.raise_for_status()
    return response.text


def scan_svg_security(svg_text: str) -> Dict[str, Any]:
    issues = []

    if not svg_text or "<svg" not in svg_text.lower():
        issues.append("File does not appear to be a valid SVG.")

    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, svg_text, flags=re.IGNORECASE):
            issues.append(f"Unsafe SVG pattern detected: {pattern}")

    external_links = re.findall(
        r'(href|xlink:href)\s*=\s*["\'](http[^"\']+)["\']',
        svg_text,
        flags=re.IGNORECASE
    )

    if external_links:
        issues.append("External linked resources detected inside SVG.")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
    }


def scan_logo_urls(light_logo_url: str, dark_logo_url: str) -> Dict[str, Any]:
    light_svg = download_svg(light_logo_url)
    dark_svg = download_svg(dark_logo_url)

    light_scan = scan_svg_security(light_svg)
    dark_scan = scan_svg_security(dark_svg)

    return {
        "passed": light_scan["passed"] and dark_scan["passed"],
        "light": light_scan,
        "dark": dark_scan,
        "light_svg": light_svg,
        "dark_svg": dark_svg,
    }