# Premium BB Modal — standalone developer bundle

Self-contained copy of **Premium BB Modal** (based on `ui-demo-CORRECT-BACKUP/Premium-BB-Modal.html`) with everything needed to run **smart logo sizing**, the **modal popup**, and **Swiper** demos without touching `Brand-Theme-Settings-Module.html` or `Brand-Settings-Module.html`.

## Contents

| Item | Role |
|------|------|
| `Premium-BB-Modal.html` | Page + inline note / run instructions |
| `premium-bb-mobile-popup-chrome.css` | Standalone-only mobile sheet header: B top-left, gallery-style X top-right |
| `bb-shared-ui.css` | **From `ui-demo-CORRECT-BACKUP/`** — valid CSS (repo-root `bb-shared-ui.css` wrongly begins with an HTML `<style>` tag and breaks layout / modal proportions). |
| `bb-smart-ui.js` | **From `ui-demo-CORRECT-BACKUP/`** — pairs with that stylesheet for the reference popup shape. |
| `bb_smart_sizing_server.py` | FastAPI engine: `/api/bb/smart-size`, `/api/bb/ping`, `/docs` |
| `bb_trim_svg_viewbox.py` | SVG viewBox / ink helpers used by the server |
| `test_golden_smart_size.py` | Smoke test against a running API |
| `requirements.txt` | Python dependencies |
| `swagger-ui.css`, `BB-Full-Logo-Blue.svg` | API docs branding (served under `/static`) |
| `content/brandbased.svg` | Example brand file for `load_svg_file_for_brand` |
| `favicons/` | Icons + manifest |
| Media | `brandbased-logo.svg`, placeholders, `add-sample.mp4`, `vide-product-placeholder2.mp4`, `explore icon.svg` |

`bb-smart-ui.js` expects the API at **`http://localhost:8001/api/bb/smart-size`** (same as the main repo).

## Quick start

```bash
cd premium-bb-modal-standalone
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Optional OpenAI paths: copy `.env.example` to `.env` and set `OPENAI_API_KEY`.

**Terminal A — API**

```bash
uvicorn bb_smart_sizing_server:app --port 8001
```

**Terminal B — static site** (avoids `file://` issues with `fetch`)

```bash
python3 -m http.server 8090
```

Open **http://localhost:8090/Premium-BB-Modal.html**

- API docs: http://localhost:8001/docs  
- Ping: http://localhost:8001/api/bb/ping  

## Tests

```bash
export BB_TEST_SMART_SIZE_URL="http://127.0.0.1:8001/api/bb/smart-size"
python3 test_golden_smart_size.py
```

## Copying this folder elsewhere

Keep all files together. If you move only this directory out of the monorepo, update or remove the `../…` nav links in `Premium-BB-Modal.html`; smart sizing still works as long as the API runs and static assets sit beside the HTML.
