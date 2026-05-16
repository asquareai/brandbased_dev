from __future__ import annotations

import json
import math
import os
import re
from typing import Any, Dict, Optional

# Load ui-demo/.env so OPENAI_API_KEY is set when using Start-BrandBased-API.command (no shell profile).
_bb_root = os.path.dirname(os.path.abspath(__file__))
_DOTENV_PATH = os.path.join(_bb_root, ".env")
try:
    from dotenv import load_dotenv  # type: ignore

    # Primary: .env next to this file. Secondary: search from cwd (finds .env in parent folders).
    load_dotenv(_DOTENV_PATH, override=True)
    load_dotenv(override=True)
except ImportError:  # pragma: no cover
    # Install python-dotenv (see requirements.txt) or set OPENAI_API_KEY in the shell.
    pass
except Exception:  # pragma: no cover
    pass

from pydantic import BaseModel as _PydanticBaseModel

try:
    from bb_trim_svg_viewbox import parse_viewbox as _trim_parse_viewbox  # type: ignore
    from bb_trim_svg_viewbox import compute_ink_bbox_in_viewbox as _trim_ink_bbox_raster  # type: ignore
    from bb_trim_svg_viewbox import compute_ink_bbox_in_viewbox_pure as _trim_ink_bbox_pure  # type: ignore
    from bb_trim_svg_viewbox import compute_trimmed_viewbox as _trim_compute_trimmed_viewbox  # type: ignore
    from bb_trim_svg_viewbox import replace_viewbox as _trim_replace_viewbox  # type: ignore
    from bb_trim_svg_viewbox import strip_full_bleed_white_background as _trim_strip_bg  # type: ignore
except Exception:  # pragma: no cover
    _trim_parse_viewbox = None
    _trim_ink_bbox_raster = None
    _trim_ink_bbox_pure = None
    _trim_compute_trimmed_viewbox = None
    _trim_replace_viewbox = None
    _trim_strip_bg = None

from fastapi import FastAPI, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel, Field
import httpx


class BrandContext(BaseModel):
    fontSize: str
    lineHeight: str
    textLength: int = Field(ge=0)


class GoldenReference(BaseModel):
    """User's Asset Lab (trimmed) mark — the 'Golden Size' in-text feel other logos should match."""

    currentUpload: str
    logoRatio: Optional[float] = None
    logoRatioText: Optional[str] = None
    trimViewBox: str


class SmartSizeRequest(BaseModel):
    brand: str
    context: BrandContext
    rules: Optional[str] = None
    # Optional inline SVG (same origin fetch from page). If omitted, server tries ./{brand}.svg
    svg: Optional[str] = None
    # When true + goldenReference, the model also outputs sizeMul / maxWMul to match the golden "vibe".
    brandAiSmartSize: bool = False
    goldenReference: Optional[GoldenReference] = None
    # Local testing only: non-empty value overrides OPENAI_API_KEY from .env for this request.
    devOpenaiKey: Optional[str] = None


class SmartSizeResponse(BaseModel):
    scale: float = Field(ge=0.7, le=1.2)
    offsetY: float = Field(ge=-0.1, le=0.1)  # em
    offsetX: float = Field(ge=-0.1, le=0.1)  # em
    # Pixel box for .brandbased-dynamic-logo-slot (from viewBox / width×height, not AI guesswork)
    slotW: float = Field(default=35.0, ge=8.0, le=200.0)
    slotH: float = Field(default=35.0, ge=8.0, le=200.0)
    shape: str = "square"  # wide | tall | square
    viewBoxRatio: Optional[float] = None  # intrinsic width/height
    sizeMul: float = Field(default=1.0, ge=0.8, le=1.9)
    ratioBand: Optional[str] = None
    maxWMul: float = Field(default=2.0, ge=1.5, le=4.0)  # cap width relative to slot height


class TrimSvgRequest(_PydanticBaseModel):
    svg: str
    margin: float = Field(default=0.02, ge=0.0, le=0.2)
    threshold: int = Field(default=20, ge=0, le=80)


class TrimSvgResponse(_PydanticBaseModel):
    svg: str
    ratio: float
    viewBox: str


class SaveCroppedRequest(_PydanticBaseModel):
    filename: str = Field(default="upload.svg", min_length=1, max_length=200)
    svg: str
    expectedViewBox: Optional[str] = None
    # Preferred: numeric check (avoids string-format mismatches)
    viewBoxX: Optional[float] = None
    viewBoxY: Optional[float] = None
    viewBoxW: Optional[float] = None
    viewBoxH: Optional[float] = None


class SaveCroppedResponse(_PydanticBaseModel):
    path: str
    filename: str
    viewBox: Optional[str] = None
    savedAbsPath: Optional[str] = None


app = FastAPI(title="BrandBased Smart Logo Sizing Engine", docs_url=None, redoc_url=None)


def _openai_key_present() -> bool:
    raw = os.getenv("OPENAI_API_KEY")
    if not raw:
        return False
    s = str(raw).strip().strip('"').strip("'")
    return bool(s)


def _dotenv_import_ok() -> bool:
    try:
        import importlib.util

        return importlib.util.find_spec("dotenv") is not None
    except Exception:
        return False


def _refresh_dotenv_from_file() -> None:
    """
    Re-apply .env for this process. uvicorn --reload only watches .py, so .env edits
    otherwise require a full restart; this makes ping + smart-size pick up a new key in dev.
    """
    if not _dotenv_import_ok():
        return
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(_DOTENV_PATH, override=True)
    except Exception:
        pass


def _openai_key_in_dotenv_file() -> tuple[str, int]:
    """
    Whether .env *appears* to set OPENAI (never the value). Returns (status, value_char_len).
    value_char_len is len after strip/quotes, never the secret itself.
    """
    if not os.path.isfile(_DOTENV_PATH):
        return "missing", 0
    try:
        with open(_DOTENV_PATH, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return "missing", 0
    has_line = False
    last_val = ""
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"^(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*)\s*$", s, re.IGNORECASE)
        if m:
            has_line = True
            last_val = m.group(1).strip().strip('"').strip("'")
    n = len(last_val) if has_line else 0
    if not has_line:
        return "no_line", 0
    if not last_val:
        return "empty", 0
    return "set", n


def _strip_key(s: Optional[str]) -> str:
    if not s:
        return ""
    return str(s).strip().strip('"').strip("'")


def _openai_key_source_flags(
    env_ok: bool, dev_header_ok: bool
) -> str:
    if env_ok and dev_header_ok:
        return "both"
    if env_ok:
        return "env"
    if dev_header_ok:
        return "dev_header"
    return "none"


@app.get("/api/bb/ping", include_in_schema=False)
def bb_ping(
    x_bb_dev_openai_key: Optional[str] = Header(None, alias="X-BB-Dev-OpenAI-Key"),
) -> Dict[str, str]:
    _refresh_dotenv_from_file()
    in_file, value_chars = _openai_key_in_dotenv_file()
    env_ok = _openai_key_present()
    dev_ok = bool(_strip_key(x_bb_dev_openai_key))
    effective = env_ok or dev_ok
    # Safe preflight: never expose the key, only whether the running process can call OpenAI.
    return {
        "ok": "true",
        "openaiKeyLoaded": "yes" if effective else "no",
        "openaiKeySource": _openai_key_source_flags(env_ok, dev_ok),
        "openaiKeyInEnvFile": in_file,  # no_line | empty | set | missing
        "openaiKeyInEnvValueChars": str(value_chars),  # length of value on OPENAI line (0 = nothing after =)
        "pythonDotenvInstalled": "yes" if _dotenv_import_ok() else "no",
        "dotenvFilePath": _DOTENV_PATH,
        "dotenvFileExists": "yes" if os.path.isfile(_DOTENV_PATH) else "no",
    }

# Serve local static assets (logo + Swagger custom CSS)
_STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
        description=app.description,
    )
    # Replace Swagger's "default" server with a named server entry.
    schema["servers"] = [{"url": "/", "description": "BrandBased Smart Logo Sizing Engine"}]
    app.openapi_schema = schema
    return app.openapi_schema

app.openapi = custom_openapi  # type: ignore


@app.get("/docs", include_in_schema=False)
def custom_docs():
    # Use FastAPI's generated Swagger HTML, but prepend a stable BrandBased header
    # so the logo shows even if Swagger UI assets are blocked/cached.
    base = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="BrandBased Smart Logo Sizing Engine — API Docs",
        swagger_css_url="/static/swagger-ui.css",
        swagger_favicon_url="/static/BB-Full-Logo-Blue.svg",
        swagger_ui_parameters={"docExpansion": "none"},
    )
    html = base.body.decode("utf-8", errors="ignore")
    header = """
<div style="position:sticky;top:0;z-index:9999;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:18px 18px;display:flex;align-items:center;gap:18px">
  <img src="/static/BB-Full-Logo-Blue.svg" alt="BrandBased" style="height:156px;width:auto" />
</div>
"""
    html = html.replace("<body>", "<body>" + header, 1)
    return HTMLResponse(html)

# Local prototype convenience: allow this HTML file to call the API directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    # Browsers can preflight + call GET/POST/OPTIONS/HEAD to different origins/ports
    # (e.g. page on :5173, API on :8001) — keep this permissive for the prototype.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=[
        "X-BB-SmartSize-Source",
        "X-BB-SmartSize-Error",
        "X-BB-SmartSize-OpenAI",
        "X-BB-SmartSize-KeySource",
    ],
)


def _trim_svg_viewbox_best(svg_text: str, margin: float, out_px: int = 2400, threshold: int = 20) -> Optional[Dict[str, Any]]:
    if not svg_text or "<svg" not in svg_text.lower():
        return None
    if not (_trim_parse_viewbox and _trim_compute_trimmed_viewbox and _trim_replace_viewbox):
        return None
    vb = _trim_parse_viewbox(svg_text)
    if not vb:
        return None
    # Prefer raster/pixel trim when CairoSVG is available (most accurate).
    ink = None
    if _trim_ink_bbox_raster is not None:
        try:
            # Prefer raster trim; threshold is tuned to ignore faint anti-alias noise at edges.
            ink = _trim_ink_bbox_raster(svg_text, vb=vb, out_px=int(out_px), threshold=int(threshold))
        except Exception:
            ink = None
    if ink is None and _trim_ink_bbox_pure is not None:
        ink = _trim_ink_bbox_pure(svg_text)
    if not ink:
        return None
    new_vb = _trim_compute_trimmed_viewbox(vb, ink=ink, margin_ratio=float(margin))
    # Guardrails: avoid degenerate trims (e.g. single hairline stroke becomes ~0 height).
    if new_vb.w < vb.w * 0.05 or new_vb.h < vb.h * 0.05:
        return None
    out_svg = _trim_replace_viewbox(svg_text, new_vb)
    if _trim_strip_bg is not None:
        try:
            out_svg = _trim_strip_bg(out_svg)
        except Exception:
            pass
    ratio = float(new_vb.w / new_vb.h) if new_vb.h else 1.0
    ratio = _clamp(ratio, 0.1, 10.0)
    return {
        "svg": out_svg,
        "ratio": ratio,
        "viewBox": f"{new_vb.x} {new_vb.y} {new_vb.w} {new_vb.h}",
    }


@app.post("/api/bb/trim-svg", response_model=TrimSvgResponse)
def trim_svg(req: TrimSvgRequest) -> TrimSvgResponse:
    """
    Trims whitespace INSIDE the SVG by tightening the viewBox to ink bounds.
    This is what makes uploads behave like your curated `*.trim.svg` assets.
    Pure-python (transform-aware sampling) implementation for portability.
    """
    out = _trim_svg_viewbox_best(req.svg, margin=req.margin, out_px=2400, threshold=req.threshold)
    if not out:
        # Return original if we can't trim (still useful to get ratio).
        vb = extract_viewbox(req.svg) or {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
        ratio = float(vb["width"] / vb["height"]) if vb["height"] else 1.0
        return TrimSvgResponse(svg=req.svg, ratio=ratio, viewBox=f'{vb["x"]} {vb["y"]} {vb["width"]} {vb["height"]}')
    return TrimSvgResponse(svg=out["svg"], ratio=float(out["ratio"]), viewBox=str(out["viewBox"]))


@app.post("/api/bb/save-cropped", response_model=SaveCroppedResponse)
def save_cropped(req: SaveCroppedRequest) -> SaveCroppedResponse:
    """
    Saves a user-cropped SVG into `content/processed-content/`.
    This is for local dev + the Asset Lab flow (served by your static server).
    """
    svg_text = (req.svg or "").strip()
    if not svg_text.lower().startswith("<svg"):
        raise HTTPException(status_code=400, detail="Expected raw SVG text starting with <svg")

    def _close(a: float, b: float, *, tol: float) -> bool:
        return math.isclose(a, b, rel_tol=0.0, abs_tol=tol)

    def _viewbox_all_present() -> bool:
        return all(v is not None for v in (req.viewBoxX, req.viewBoxY, req.viewBoxW, req.viewBoxH))

    # Validate croppped viewBox before writing (tolerant to formatting differences).
    if _viewbox_all_present():
        vb0 = extract_viewbox(svg_text)
        if not vb0:
            raise HTTPException(status_code=400, detail="SVG missing viewBox after client crop (cannot validate)")
        tol = 0.5  # user units; good enough to ignore float formatting + tiny diffs
        ex, ey, ew, eh = float(req.viewBoxX or 0.0), float(req.viewBoxY or 0.0), float(req.viewBoxW or 0.0), float(req.viewBoxH or 0.0)
        if not (
            _close(float(vb0["x"]), ex, tol=tol)
            and _close(float(vb0["y"]), ey, tol=tol)
            and _close(float(vb0["width"]), ew, tol=tol)
            and _close(float(vb0["height"]), eh, tol=tol)
        ):
            raise HTTPException(
                status_code=400,
                detail="server viewBox does not match client crop (saved SVG is not the cropped one)",
            )
    else:
        # Back-compat: substring check (brittle) if numeric fields are absent.
        if req.expectedViewBox:
            exp = req.expectedViewBox.strip()
            if exp and exp not in svg_text:
                raise HTTPException(status_code=400, detail="expectedViewBox not found in SVG (cropping not applied)")

    name = os.path.basename(req.filename.strip()) or "upload.svg"
    # keep it simple + safe: lowercase, no spaces, allow a-z 0-9 _ - .
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-").lower()
    if not safe.endswith(".svg"):
        safe = safe + ".svg"

    out_dir = os.path.join(_STATIC_DIR, "content", "processed-content")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, safe)
    print(f"[bb] save-cropped filename={safe} out_path={out_path}")

    # Ensure viewBox exists (Konva crop relies on it, but users might upload without).
    if extract_viewbox(svg_text) is None:
        dims = extract_svg_root_width_height(svg_text)
        if dims:
            svg_text = re.sub(r"<\s*svg\b", f'<svg viewBox="0 0 {dims["width"]} {dims["height"]}"', svg_text, count=1, flags=re.IGNORECASE)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(svg_text)

    rel = f"content/processed-content/{safe}"
    vb = extract_viewbox(svg_text)
    vb_str = f'{vb["x"]} {vb["y"]} {vb["width"]} {vb["height"]}' if vb else None
    return SaveCroppedResponse(path=rel, filename=safe, viewBox=vb_str, savedAbsPath=out_path)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def extract_viewbox(svg: str) -> Optional[Dict[str, float]]:
    """
    Extracts SVG viewBox as floats.
    Returns {x, y, width, height} or None if missing/unparseable.
    """
    # Handles both single and double quotes; tolerant spacing.
    m = re.search(r'\bviewBox\s*=\s*["\']\s*([-0-9.\s]+)\s*["\']', svg, flags=re.IGNORECASE)
    if not m:
        return None
    parts = m.group(1).split()
    if len(parts) != 4:
        return None
    try:
        x, y, w, h = map(float, parts)
    except Exception:
        return None
    if h == 0 or w == 0:
        return None
    return {"x": x, "y": y, "width": w, "height": h}


def compute_ratio(viewbox: Dict[str, float]) -> float:
    w = float(viewbox["width"])
    h = float(viewbox["height"])
    return w / h if h != 0 else 1.0


def classify_shape(ratio: float) -> str:
    if ratio > 1.4:
        return "wide"
    if ratio < 0.75:
        return "tall"
    return "square"


def extract_svg_root_width_height(svg: str) -> Optional[Dict[str, float]]:
    """When viewBox is missing, try numeric width/height on the root <svg> (ignores %)."""
    m = re.search(r"<\s*svg\b[^>]*>", svg, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    tag = m.group(0)

    def grab(name: str) -> Optional[str]:
        mm = re.search(rf"\b{name}\s*=\s*['\"]([^'\"]+)['\"]", tag, flags=re.IGNORECASE)
        return mm.group(1).strip() if mm else None

    def to_px(s: str) -> Optional[float]:
        s = s.strip()
        if not s or s.endswith("%"):
            return None
        mm = re.match(r"^([-0-9.]+)", s)
        if not mm:
            return None
        v = float(mm.group(1))
        return v if v > 0 else None

    ws, hs = grab("width"), grab("height")
    if not ws or not hs:
        return None
    w, h = to_px(ws), to_px(hs)
    if w is None or h is None:
        return None
    return {"width": w, "height": h}


def get_intrinsic_dimensions(svg: str) -> Optional[Dict[str, float]]:
    """Union of viewBox and root width/height. Prefers viewBox (authoritative for aspect)."""
    vb = extract_viewbox(svg)
    if vb and vb["width"] > 0 and vb["height"] > 0:
        return {"width": float(vb["width"]), "height": float(vb["height"])}
    wh = extract_svg_root_width_height(svg)
    if wh:
        return {"width": float(wh["width"]), "height": float(wh["height"])}
    return None


SLOT_DEFAULT_BASE_PX = 35.0
SLOT_MIN_PX = 8.0

# "Glyph-like" caps: logos should behave like characters, not images.
# Cap the long side relative to the chosen base (roughly em-sized).
SLOT_MAX_MAJOR_EM = 2.0  # max long side as multiple of base height/width
SLOT_MAX_ABS_PX = 160.0  # hard stop regardless of font size


def _parse_css_px(v: str) -> Optional[float]:
    s = str(v or "").strip().lower()
    if not s or s == "normal":
        return None
    m = re.match(r"^([-+]?[0-9]*\.?[0-9]+)\s*px\b", s)
    if not m:
        return None
    try:
        n = float(m.group(1))
    except Exception:
        return None
    return n if n > 0 else None


def compute_slot_base_px(ctx: BrandContext) -> float:
    """
    Pick a slot "glyph height" based on typography.
    Goal: logo behaves like a character: height tracks line-height, clamped for sanity.
    """
    font_px = _parse_css_px(ctx.fontSize) or 16.0
    lh_px = _parse_css_px(ctx.lineHeight)
    # If line-height is 'normal', approximate ~1.2em.
    if lh_px is None:
        lh_px = font_px * 1.2

    # We want "glyph-like" behaviour: height should mostly track font size.
    # On many pages line-height can be very large (layout spacing), which would make logos huge.
    # So we bound the glyph height between:
    # - at least ~0.95em
    # - at most ~1.35em
    glyph_from_font = font_px * 0.96
    glyph_cap = font_px * 1.08
    glyph_from_line = lh_px * 0.92
    base = min(glyph_from_line, glyph_cap)
    base = max(base, glyph_from_font)
    # Keep reasonable absolute bounds for the demo.
    return _clamp(base, 12.0, 44.0)


def compute_shape_multipliers(ratio: float) -> Dict[str, float]:
    """
    Hard sizing rules:
    - Square-ish logos should be slightly larger than surrounding text (glyph height > 1em).
    - Very wide/panoramic logos (e.g. script wordmarks) should be both taller and wider than text.

    Returns multipliers applied to glyph sizing:
    - h_mul: multiplies slot height (so the mark is taller than text when desired)
    """
    r = float(ratio) if ratio and ratio > 0 else 1.0

    # Ratio band table (easy to tweak). These multipliers are INTENTIONAL "optical" choices,
    # aiming for glyph-like behavior in text, not strict geometric fitting.
    #
    # Format: (min_inclusive, max_exclusive, h_mul, band_name)
    bands = [
        (0.00, 0.80, 1.12, "tall"),
        (0.80, 0.95, 1.18, "near_square_tallish"),
        (0.95, 1.15, 1.32, "square_strong"),  # includes ~31:29 (1.07)
        (1.15, 1.35, 1.22, "near_square_wideish"),
        (1.35, 2.40, 1.12, "wide"),
        # Reference-friendly: many classic wordmarks (e.g. Nike swoosh ratio ~2.73) already look perfect
        # at glyph size. Keep this band neutral and use the special boost list for the cases that need it.
        (2.40, 3.60, 1.00, "wordmark_neutral"),
        (3.60, 999.0, 1.08, "panoramic"),
    ]

    h_mul = 1.00
    band = "default"
    for lo, hi, mul, name in bands:
        if lo <= r < hi:
            h_mul = float(mul)
            band = name
            break

    # Reference lock: Nike swoosh trimmed ratio (~30:11 ≈ 2.728) is our known-good baseline.
    # Keep this stable and slightly boosted (+5%) as our "perfect" benchmark.
    if 2.65 <= r <= 2.80:
        return {"h_mul": 1.05, "band": "reference_nike", "ratio": r, "max_w_mul": 2.0}

    # Default width cap (relative to slot height). This prevents extremely long wordmarks
    # from taking over a line, but it can also create the illusion of "extra whitespace"
    # if the cap is smaller than the logo's intrinsic ratio (because `contain` must scale down).
    #
    # Rule: allow wider slots for wide ratios so trimmed marks *look* trimmed.
    # Still cap to keep paragraphs readable.
    max_w_mul = 2.0
    if r >= 2.0:
        # Give most of the intrinsic width back, but not all of it.
        # Example: r=4.2 → cap ≈ 3.8 (helps YSL-like wordmarks).
        max_w_mul = _clamp(r * 0.9, 2.0, 4.0)

    # Special hard rules: ratio-specific tweaks (in addition to band sizing).
    # We implement this by boosting (or shrinking) height (sizeMul) and, for very wide marks,
    # optionally relaxing width cap so the change is actually visible.
    special_boost = 1.0

    # Match the user's listed ratios with small tolerances.
    # 1:1-ish + near-square
    if 0.95 <= r <= 1.25:
        special_boost = 1.25
    # 5:3-ish
    elif 1.58 <= r <= 1.74:
        special_boost = 1.25
    # 40:13-ish (≈3.076) — user wants 10% wider + 10% higher (e.g. Coke logo)
    elif 2.95 <= r <= 3.20:
        special_boost = 1.10

    # For very wide marks that are boosted, allow more width so the change is visible.
    if special_boost > 1.0 and r > 2.2:
        max_w_mul = _clamp(r * 1.15, 2.0, 4.0)

    return {"h_mul": float(h_mul) * float(special_boost), "band": band, "ratio": r, "max_w_mul": float(max_w_mul)}


def compute_slot_pixels(intrinsic_w: float, intrinsic_h: float, base_px: float) -> tuple[float, float, str, float]:
    """
    Map intrinsic SVG size to a CSS box: one 'reference' side is base_px, the other follows aspect.
    - Wide: height = base, width = min(base * aspect, cap)
    - Tall:  width  = base, height = min(base / aspect, cap)
    - ~Square: both = base
    """
    if intrinsic_w <= 0 or intrinsic_h <= 0:
        r = 1.0
    else:
        r = intrinsic_w / intrinsic_h
    shape = classify_shape(r)

    # Apply hard rules based on aspect ratio bands.
    mult = compute_shape_multipliers(r)
    base_eff = base_px * mult["h_mul"]
    major_cap = min(SLOT_MAX_ABS_PX, base_px * SLOT_MAX_MAJOR_EM)
    if r >= 1.0:
        h = base_eff
        w = min(base_eff * r, major_cap)
    else:
        w = base_eff
        h = min(base_eff / r, major_cap)
    w = max(SLOT_MIN_PX, w)
    h = max(SLOT_MIN_PX, h)
    return (round(w, 2), round(h, 2), shape, float(r))


def _golden_aware_size_adjust(
    golden_ratio: Optional[float],
    this_ratio: Optional[float],
    size_mul: float,
    max_w_mul: float,
) -> tuple[float, float, str]:
    """
    Compare golden (Asset Lab) vs this mark’s intrinsic width/height. Very different ratios
    create different *along-the-line* footprints: a portrait mark’s slot is narrow, so it can
    look like a speck next to a wide golden wordmark. Lift sizeMul (and sometimes max_w_mul) so
    the result still feels "as readable" in context.
    """
    if golden_ratio is None or this_ratio is None:
        return (size_mul, max_w_mul, "")
    gr = float(golden_ratio)
    tr = float(this_ratio)
    if not (gr > 0 and tr > 0):
        return (size_mul, max_w_mul, "")

    out_s = float(size_mul)
    out_w = float(max_w_mul)
    tag: list[str] = []

    # Golden is landscape / wordmark-ish; this is portrait / tall — this usually reads “too small”.
    if gr >= 1.15 and tr < 0.95:
        presence_gap = gr / max(tr, 0.25)  # e.g. 2.73 / 0.78 ≈ 3.5
        if presence_gap > 1.5:
            # Slight lift: undersized inline marks (vs a wide golden) are a common complaint.
            floor = 1.12 + min(0.75, (presence_gap - 1.5) * 0.22)
            if out_s < floor:
                out_s = floor
                tag.append("golden_portrait_min")
            if out_w < 2.2:
                out_w = min(3.4, out_w + 0.15 + min(0.4, (presence_gap - 1.5) * 0.12))
                tag.append("golden_portrait_wcap")

    # This mark is much wider than the golden (panoramic) — can feel “flat”; allow a wider run.
    elif tr > gr * 1.45 and tr >= 1.8:
        out_s = max(out_s, 1.04)
        target_w = _clamp(float(tr) * 0.88, 2.0, 4.0)
        if out_w < target_w:
            out_w = min(4.0, max(out_w, target_w * 0.95))
            tag.append("golden_panoramic_wcap")

    return (out_s, out_w, "+".join(tag) if tag else "")


def _parse_viewbox_fours(s: Optional[str]) -> Optional[tuple[float, float, float, float]]:
    if not s or not str(s).strip():
        return None
    parts = re.split(r"[\s,]+", str(s).strip())
    if len(parts) < 4:
        return None
    try:
        return (float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]))
    except ValueError:
        return None


def _golden_mark_archetype(ratio: float) -> str:
    """Coarse label so the model can reason about the Asset Lab (golden) mark."""
    r = float(ratio)
    if r >= 2.0:
        return "wide_wordmark"
    if r >= 1.2:
        return "landscape"
    if r <= 0.82:
        return "portrait_or_tall"
    if r < 0.95:
        return "slightly_tall"
    return "compact_squareish"


def _golden_openai_system_message(logo_ratio: Optional[float]) -> str:
    base = (
        "You are a strict typography + visual alignment engine for inline brand logos. "
        "The user set a Golden reference in Asset Lab (name + intrinsic width/height ratio from its trim). "
        "For EVERY other logo you must pick scale, offsetX, offsetY, sizeMul, and maxWMul so the mark’s "
        "perceived size and line presence feels comparable to that Golden — not the same pixel box, but "
        "similar legibility. "
        "GLOBAL: In body text, a timid/undersized mark is a worse failure than a slightly assertive one. "
        "When you hesitate between two defensible sizeMul values, pick the HIGHER unless openaiGuidance says otherwise. "
        "TALL / PORTRAIT MARKS (this mark’s W/H < 1.0): These almost always need to run LARGER in-line: use a high "
        "sizeMul and assertive scale; they are a broad category that reads ‘too small’ if you are conservative. "
        "The nearer W/H is to 0.5–0.75, the more you should push sizeMul toward the top of 0.8–1.9. "
        "CRITICAL: intrinsicRatio is width/height. If the Golden is a wide/horizontal wordmark (ratio >> 1) "
        "and THIS mark is portrait or tall (ratio < 0.95), the rendered slot is much narrower along the line; "
        "those marks look ‘too small’ unless you return a SUBSTANTIALLY HIGHER sizeMul (very often 1.25–1.85) "
        "and sometimes a bit higher maxWMul. Do NOT be conservative. "
        "If this mark is far wider than the Golden, increase maxWMul so the wordmark can run. "
        "If this mark is already loud vs the Golden, you may use a lower sizeMul. "
        "If openaiGuidance.userText is present, treat it as high-priority design intent. "
        "Output only valid JSON with all five numeric fields (scale, offsetX, offsetY, sizeMul, maxWMul)."
    )
    if logo_ratio is None or not (float(logo_ratio) > 0):
        return base
    rg = float(logo_ratio)
    if rg >= 2.0:
        return base + (
            f" The Golden’s W/H is about {rg:.2f} (very wide). Match perceived CAP-HEIGHT or STEM/ICON weight to "
            "the body text and to how that wide wordmark reads in-line — not its full left-to-right span. "
            "Narrower/taller marks often need a clearly higher sizeMul to avoid looking like a small favicon. "
        )
    if rg < 0.9:
        return base + " The Golden is already tall or portrait: be careful not to over-shrink wide targets."
    return base


def compute_slot_from_svg(svg: Optional[str], base_px: float) -> tuple[float, float, str, Optional[float]]:
    if not (svg and svg.strip()) or "<svg" not in svg.lower():
        return base_px, base_px, "square", None
    dim = get_intrinsic_dimensions(svg.strip())
    if not dim:
        return base_px, base_px, "square", None
    w, h = dim["width"], dim["height"]
    sw, sh, shp, ratio = compute_slot_pixels(w, h, base_px=base_px)
    return (sw, sh, shp, ratio)


def load_svg_file_for_brand(brand: str) -> Optional[str]:
    safe = re.sub(r"[^a-z0-9_-]+", "", brand.lower().strip())[:64] or "unknown"
    root = os.path.dirname(os.path.abspath(__file__))
    # Prefer trimmed assets when available.
    for name in (f"{safe}.trim.svg", f"{safe}.svg"):
        # New local layout: ui-demo/content/<brand>.svg
        path = os.path.join(root, "content", name)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                t = f.read()
                if "svg" in t.lower():
                    return t
        except OSError:
            pass
    return None


def resolve_svg(req: SmartSizeRequest) -> Optional[str]:
    s = (req.svg or "").strip() or None
    if s:
        return s
    return load_svg_file_for_brand(req.brand)


def estimate_density(svg: str) -> Dict[str, float]:
    """
    Very rough "visual weight" heuristic. Useful as a signal, not truth.
    """
    fill_count = len(re.findall(r"\bfill\s*=", svg, flags=re.IGNORECASE))
    path_count = len(re.findall(r"<\s*path\b", svg, flags=re.IGNORECASE))
    density = path_count / (fill_count + 1)
    return {
        "fill_count": float(fill_count),
        "path_count": float(path_count),
        "density": float(density),
    }


def analyze_svg(svg: str) -> Dict[str, Any]:
    vb = extract_viewbox(svg)
    if not vb:
        return {"viewBox": None, "ratio": None, "shape": None, "density": estimate_density(svg)["density"]}
    ratio = compute_ratio(vb)
    dens = estimate_density(svg)
    return {
        "viewBox": {"width": vb["width"], "height": vb["height"]},
        "ratio": float(ratio),
        "shape": classify_shape(ratio),
        "density": float(dens["density"]),
    }


def _fallback(context: BrandContext, req: SmartSizeRequest) -> SmartSizeResponse:
    svg = resolve_svg(req)
    base_px = compute_slot_base_px(context)
    sw, sh, shp, ratio = compute_slot_from_svg(svg, base_px=base_px)
    mm = compute_shape_multipliers(ratio or 1.0)
    mul = mm["h_mul"]
    max_w_mul = mm.get("max_w_mul", 2.0)
    # Simple heuristic fallback: slight downscale for long text.
    scale = 1.0
    if context.textLength >= 10:
        scale = 0.92
    elif context.textLength >= 6:
        scale = 0.96
    size_out = _clamp(float(mul), 0.8, 1.9)
    w_out = _clamp(float(max_w_mul), 1.5, 4.0)
    gtag = ""
    if (
        req.brandAiSmartSize
        and req.goldenReference
        and req.goldenReference.logoRatio is not None
        and ratio is not None
    ):
        size_out, w_out, gtag = _golden_aware_size_adjust(
            float(req.goldenReference.logoRatio), float(ratio), size_out, w_out
        )
        size_out = _clamp(size_out, 0.8, 1.9)
    band0 = str(mm.get("band") or "")
    band = f"{band0},{gtag}" if (band0 and gtag) else (band0 or gtag)
    return SmartSizeResponse(
        scale=scale,
        offsetX=0.0,
        offsetY=0.0,
        slotW=sw,
        slotH=sh,
        shape=shp,
        viewBoxRatio=ratio,
        sizeMul=size_out,
        ratioBand=band,
        maxWMul=w_out,
    )


@app.post("/api/bb/smart-size", response_model=SmartSizeResponse)
def smart_size(req: SmartSizeRequest, response: Response) -> SmartSizeResponse:
    """
    Returns logo scale + offsets in em for a (brand, typography context) tuple.
    Slot width/height come from SVG viewBox (or root width/height) — not from the model.
    Uses OpenAI when configured; otherwise returns a safe fallback.
    """
    svg = resolve_svg(req)
    base_px = compute_slot_base_px(req.context)
    slot_w, slot_h, shape, vb_ratio = compute_slot_from_svg(svg, base_px=base_px)
    mm = compute_shape_multipliers(vb_ratio or 1.0)
    mul = mm["h_mul"]
    max_w_mul = mm.get("max_w_mul", 2.0)

    _refresh_dotenv_from_file()
    dev_k = _strip_key(req.devOpenaiKey)
    api_key_raw = dev_k or os.getenv("OPENAI_API_KEY")
    if not api_key_raw:
        response.headers["X-BB-SmartSize-Source"] = "fallback:no_api_key"
        return _fallback(req.context, req)
    # Avoid illegal header values from trailing newlines/quotes/spaces
    api_key = api_key_raw.strip().strip('"').strip("'")
    if dev_k:
        response.headers["X-BB-SmartSize-KeySource"] = "dev_request"
    else:
        response.headers["X-BB-SmartSize-KeySource"] = "env"

    use_golden = bool(req.brandAiSmartSize and req.goldenReference)
    rules = (req.rules or "").strip()
    g = req.goldenReference

    if use_golden and g is not None:
        system = _golden_openai_system_message(g.logoRatio)
    else:
        system = (
            "You are a typography + visual alignment assistant for inline brand logos. "
            "Your job is to propose a scale and small x/y offsets so an SVG logo visually aligns "
            "with surrounding text. In body copy, a slightly large mark is usually better than a timid one. "
            "When logoSlot.intrinsicRatio is below 1.0 (tall or portrait mark), the slot is width-limited; prefer a "
            "higher scale in the 0.7–1.2 range so the mark is not a tiny vertical sliver. "
            "If the JSON includes openaiGuidance.userText, follow it. Output must be ONLY valid JSON."
        )

    try:
        model = os.getenv("BB_SMART_SIZE_MODEL", "gpt-4.1-mini")
        user: Dict[str, Any] = {
            "task": "Return ONLY valid JSON for inline logo alignment.",
            "constraints": {
                "scale": "float between 0.7 and 1.2",
                "offsetY": "float between -0.1 and 0.1 (in em)",
                "offsetX": "float between -0.1 and 0.1 (in em)",
            },
            "input": {
                "brand": req.brand,
                "context": req.context.model_dump(),
                "rules": rules,
            },
            "logoSlot": {
                "widthPx": slot_w,
                "heightPx": slot_h,
                "shape": shape,
                "intrinsicRatio": vb_ratio,
                "source": "SVG viewBox or width/height (computed server-side, not your output)",
            },
            "output_format": {"scale": 1.0, "offsetY": 0.0, "offsetX": 0.0},
            "notes": [
                "This is about optical alignment, not mathematical centering.",
                "Logo is rendered via CSS background-image; the slot may be non-square (see logoSlot).",
            ],
        }
        if vb_ratio is not None and float(vb_ratio) > 0 and float(vb_ratio) < 1.0:
            user["portraitOrTallMark"] = {
                "intrinsicWOverH": float(vb_ratio),
                "defaultPolicy": (
                    "This mark is taller than it is wide. Bias it LARGER: high sizeMul in golden mode; "
                    "higher scale when only scale/offset are in play. Portrait marks are often set too small by default."
                ),
            }
        if rules:
            # Same source as input.rules, but the model is trained to take explicit keys seriously.
            user["openaiGuidance"] = {
                "userText": rules,
                "whatThisIs": "Optional product/designer notes, not a fixed script. You still return numeric JSON; these lines steer look/presence.",
                "howToUse": (
                    "Treat userText as high-priority intent for scale, offsets, and (in golden mode) sizeMul / maxWMul. "
                    "Phrases like ‘bigger’, ‘more present’, or ‘louder’ should increase size within allowed bounds. "
                    "If userText is missing in a different request, ignore openaiGuidance."
                ),
            }
        if use_golden and g is not None:
            user["constraints"]["sizeMul"] = (
                "float 0.8–1.9; overall vertical scale in the line. For portrait/tall vs a wide golden, use HIGH values; "
                "for marks that are already huge, go lower"
            )
            user["constraints"]["maxWMul"] = (
                "float 1.5–4.0: max allowed width of the slot as a multiple of its height. "
                "Wider intrinsics / panoramic marks need more headroom; portrait marks are usually height-limited"
            )
            user["goldenReference"] = {
                "label": "Current upload (Asset Lab)",
                "name": g.currentUpload,
                "logoRatio": g.logoRatio,
                "logoRatioText": g.logoRatioText,
                "trimViewBox": g.trimViewBox,
            }
            if g.logoRatio is not None:
                user["goldenStrategy"] = {
                    "archetype": _golden_mark_archetype(float(g.logoRatio)),
                    "coaching": (
                        "For wide_wordmark, compare x-height / stroke weight in context; do not require similar "
                        "total logo width. For compact_squareish, match overall visual mass."
                    ),
                }
            vbp = _parse_viewbox_fours(g.trimViewBox)
            if vbp and vbp[2] > 0 and vbp[3] > 0:
                user["goldenFromTrimViewBox"] = {
                    "w": vbp[2],
                    "h": vbp[3],
                    "wOverH": vbp[2] / vbp[3],
                }
            u_g = g.logoRatio
            u_t = vb_ratio
            if u_g is not None and u_t is not None and float(u_t) > 0:
                g_f = float(u_g)
                t_f = float(u_t)
                pres = g_f / max(t_f, 0.2)
                user["ratioComparison"] = {
                    "goldenIntrinsicRatioWidthOverHeight": g_f,
                    "thisMarkIntrinsicRatioWidthOverHeight": t_f,
                    "linePresenceIndex": pres,
                    "howToRead": (
                        "linePresenceIndex is golden/this. Large values (e.g. 3+) mean the golden is much wider than "
                        "this; portrait/tall `this` will look like a small patch unless sizeMul is raised a lot"
                    ),
                }
            try:
                if svg and "<svg" in svg.lower():
                    user["analyzedThisMark"] = analyze_svg(svg)
            except Exception:
                pass
            user["output_format"] = {
                "scale": 1.0,
                "offsetY": 0.0,
                "offsetX": 0.0,
                "sizeMul": 1.0,
                "maxWMul": 2.0,
            }
            g_notes = [
                "If portraitOrTallMark is present, treat tall/portrait marks as a class that should almost always be larger: push sizeMul toward the upper part of 0.8–1.9 (unless clearly dominant on the line).",
                "Use ratioComparison: if linePresenceIndex is high and thisMark ratio is < 0.95, this mark is portrait; boost sizeMul strongly (often >= 1.35).",
                "Never match ratios numerically; match human visibility next to a typical sentence.",
                "If this mark’s density is very low (sparse paths), you may add a bit more sizeMul.",
            ]
            if g.logoRatio is not None and float(g.logoRatio) >= 2.0:
                g_notes.append(
                    "Golden is very wide: align perceived cap-height / mark ‘body’ in the line to body text, "
                    "not the golden’s full horizontal extent."
                )
            user["notes"] = list(user["notes"]) + g_notes
        _dft_temp = "0.27" if use_golden and g is not None else "0.32"
        temperature = float(os.getenv("BB_SMART_SIZE_TEMP", _dft_temp))
        payload = {
            "model": model,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user)},
            ],
        }

        with httpx.Client(timeout=20.0) as client:
            r = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            r.raise_for_status()
            j = r.json()
            content = (j["choices"][0]["message"]["content"] or "").strip()
            data = json.loads(content)

        scale = float(data.get("scale", 1.0))
        offset_y = float(data.get("offsetY", 0.0))
        offset_x = float(data.get("offsetX", 0.0))
        if use_golden and g is not None:
            out_size = float(data.get("sizeMul", mul))
            out_max_w = float(data.get("maxWMul", max_w_mul))
        else:
            out_size = float(mul)
            out_max_w = float(max_w_mul)
        gtag = ""
        if use_golden and g is not None and g.logoRatio is not None and vb_ratio is not None:
            out_size, out_max_w, gtag = _golden_aware_size_adjust(
                g.logoRatio, float(vb_ratio), out_size, out_max_w
            )
        band0 = str(mm.get("band") or "")
        band = f"{band0},{gtag}" if (band0 and gtag) else (band0 or gtag)
        response.headers["X-BB-SmartSize-Source"] = "openai" + (":golden" if use_golden else "")
        return SmartSizeResponse(
            scale=_clamp(scale, 0.7, 1.2),
            offsetY=_clamp(offset_y, -0.1, 0.1),
            offsetX=_clamp(offset_x, -0.1, 0.1),
            slotW=slot_w,
            slotH=slot_h,
            shape=shape,
            viewBoxRatio=vb_ratio,
            sizeMul=_clamp(out_size, 0.8, 1.9),
            ratioBand=band,
            maxWMul=_clamp(out_max_w, 1.5, 4.0),
        )
    except Exception as e:
        # Any OpenAI error / non-JSON: degrade gracefully.
        msg = f"{e.__class__.__name__}: {str(e) or ''}".strip()
        msg = re.sub(r"\s+", " ", msg).strip()
        # Redact any accidental secrets from error strings.
        msg = re.sub(r"Bearer\s+[A-Za-z0-9_\-\.]+", "Bearer [REDACTED]", msg)
        msg = re.sub(r"\bsk-[A-Za-z0-9_\-]{10,}\b", "sk-[REDACTED]", msg)
        # Keep the header short (avoid leaking anything sensitive).
        response.headers["X-BB-SmartSize-Source"] = "fallback:openai_error"
        response.headers["X-BB-SmartSize-Error"] = msg[:160]
        if isinstance(e, httpx.HTTPStatusError):
            try:
                body = (e.response.text or "").strip()
                body = re.sub(r"\s+", " ", body).strip()
                body = re.sub(r"Bearer\s+[A-Za-z0-9_\-\.]+", "Bearer [REDACTED]", body)
                body = re.sub(r"\bsk-[A-Za-z0-9_\-]{10,}\b", "sk-[REDACTED]", body)
                response.headers["X-BB-SmartSize-OpenAI"] = body[:200]
            except Exception:
                pass
        return _fallback(req.context, req)

