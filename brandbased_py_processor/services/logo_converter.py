import base64
import tempfile
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright


def svg_url_to_png_data_url(svg_url: str) -> str:
    response = requests.get(svg_url, timeout=30)
    response.raise_for_status()

    svg_text = response.text

    with tempfile.TemporaryDirectory() as tmpdir:
        html_path = Path(tmpdir) / "logo.html"
        png_path = Path(tmpdir) / "logo.png"

        html_path.write_text(
            f"""
            <!DOCTYPE html>
            <html>
            <body style="margin:0;width:512px;height:512px;display:flex;align-items:center;justify-content:center;background:white;">
                <div style="width:420px;height:420px;display:flex;align-items:center;justify-content:center;">
                    {svg_text}
                </div>
            </body>
            </html>
            """,
            encoding="utf-8"
        )

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 512, "height": 512})
            page.goto(html_path.as_uri())
            page.screenshot(path=str(png_path), full_page=True)
            browser.close()

        png_bytes = png_path.read_bytes()
        encoded = base64.b64encode(png_bytes).decode("utf-8")

        return f"data:image/png;base64,{encoded}"