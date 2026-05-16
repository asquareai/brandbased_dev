from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

# Preferred approach (accurate, handles <g transform>, strokes, etc.):
# rasterize with CairoSVG and measure the ink bounds.
#
# On macOS you may need: `brew install cairo`
try:  # pragma: no cover
    import cairosvg  # type: ignore
    from PIL import Image  # type: ignore
    from PIL import ImageChops  # type: ignore
except Exception:  # pragma: no cover
    cairosvg = None
    Image = None
    ImageChops = None

# Fallback (pure-Python) is intentionally not used by default because it often misses
# group transforms (common in real-world logo SVGs), producing incorrect bounds.
#
# We include a stronger pure-Python fallback below that *does* apply common SVG transforms
# (matrix/translate/scale) and estimates bounds by sampling points along paths. This is
# good enough for whitespace trimming for most logo SVGs.
from xml.etree import ElementTree as ET

from svgpathtools import parse_path  # type: ignore


_VIEWBOX_RE = re.compile(r"""\bviewBox\s*=\s*(['"])\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s*\1""", re.IGNORECASE)


@dataclass(frozen=True)
class ViewBox:
    x: float
    y: float
    w: float
    h: float

    @property
    def ratio(self) -> float:
        return self.w / self.h if self.h else 1.0


def parse_viewbox(svg_text: str) -> Optional[ViewBox]:
    m = _VIEWBOX_RE.search(svg_text)
    if not m:
        return None
    try:
        x = float(m.group(2))
        y = float(m.group(3))
        w = float(m.group(4))
        h = float(m.group(5))
    except Exception:
        return None
    if w <= 0 or h <= 0:
        return None
    return ViewBox(x=x, y=y, w=w, h=h)


def _mat_mul(m1: Tuple[float, float, float, float, float, float], m2: Tuple[float, float, float, float, float, float]) -> Tuple[float, float, float, float, float, float]:
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    # SVG matrix is:
    # [a c e]
    # [b d f]
    # [0 0 1]
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def _apply_mat(m: Tuple[float, float, float, float, float, float], x: float, y: float) -> Tuple[float, float]:
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


_TRANSFORM_CMD_RE = re.compile(r"([a-zA-Z]+)\s*\(([^)]*)\)")


def parse_transform(transform: str) -> Tuple[float, float, float, float, float, float]:
    """
    Parse a subset of SVG transforms into an affine matrix (a,b,c,d,e,f).
    Supports: matrix(a,b,c,d,e,f), translate(x[,y]), scale(x[,y]).
    """
    m: Tuple[float, float, float, float, float, float] = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    t = (transform or "").strip()
    if not t:
        return m

    for name, args in _TRANSFORM_CMD_RE.findall(t):
        name_l = name.strip().lower()
        nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", args)]
        if name_l == "matrix" and len(nums) == 6:
            tm = (nums[0], nums[1], nums[2], nums[3], nums[4], nums[5])
            m = _mat_mul(m, tm)
        elif name_l == "translate" and len(nums) >= 1:
            tx = nums[0]
            ty = nums[1] if len(nums) >= 2 else 0.0
            tm = (1.0, 0.0, 0.0, 1.0, tx, ty)
            m = _mat_mul(m, tm)
        elif name_l == "scale" and len(nums) >= 1:
            sx = nums[0]
            sy = nums[1] if len(nums) >= 2 else sx
            tm = (sx, 0.0, 0.0, sy, 0.0, 0.0)
            m = _mat_mul(m, tm)
        else:
            # ignore rotate/skew for now (rare in logo marks)
            continue
    return m


def compute_ink_bbox_in_viewbox_pure(svg_text: str) -> Optional[ViewBox]:
    """
    Pure-Python ink bounds: parses <path d="..."> and applies ancestor transforms.
    Bounds are estimated by sampling points along curves.
    """
    vb = parse_viewbox(svg_text)
    if not vb:
        return None

    try:
        root = ET.fromstring(svg_text)
    except Exception:
        return None

    xmin = ymin = float("inf")
    xmax = ymax = float("-inf")
    any_pt = False

    def _is_white_background_path(node: ET.Element, path_bbox: Tuple[float, float, float, float]) -> bool:
        """
        Heuristic: skip full-bleed white background rectangles that some logo SVGs include.
        If we don't skip these, the "ink" bbox becomes the full viewBox and trimming does nothing.
        """
        fill = (node.attrib.get("fill") or "").strip().lower()
        stroke = (node.attrib.get("stroke") or "").strip().lower()
        if stroke and stroke not in ("none", "transparent"):
            return False
        if fill not in ("#fff", "#ffffff", "white", "rgb(255,255,255)", "rgba(255,255,255,1)"):
            return False
        x0, x1, y0, y1 = path_bbox
        # If it covers ~the whole viewBox, it's likely a background.
        eps_w = vb.w * 0.02
        eps_h = vb.h * 0.02
        return (abs(x0 - vb.x) <= eps_w and abs(x1 - (vb.x + vb.w)) <= eps_w and abs(y0 - vb.y) <= eps_h and abs(y1 - (vb.y + vb.h)) <= eps_h)

    def walk(node: ET.Element, mat: Tuple[float, float, float, float, float, float]) -> None:
        nonlocal xmin, ymin, xmax, ymax, any_pt
        node_mat = mat
        tr = node.attrib.get("transform")
        if tr:
            node_mat = _mat_mul(mat, parse_transform(tr))

        tag = node.tag.split("}")[-1].lower()
        if tag == "path":
            d = node.attrib.get("d") or ""
            if d.strip():
                try:
                    path = parse_path(d)
                except Exception:
                    path = None
                if path is not None and len(path) > 0:
                    # Sample points: endpoints + uniform samples per segment.
                    # If we identified it as background above, skip sampling.
                    try:
                        px0, px1, py0, py1 = path.bbox()
                        is_bg = _is_white_background_path(node, (float(px0), float(px1), float(py0), float(py1)))
                    except Exception:
                        is_bg = False
                    if not is_bg:
                        for seg in path:
                            for i in range(0, 21):
                                t = i / 20.0
                                p = seg.point(t)
                                x, y = float(p.real), float(p.imag)
                                tx, ty = _apply_mat(node_mat, x, y)
                                xmin = min(xmin, tx)
                                xmax = max(xmax, tx)
                                ymin = min(ymin, ty)
                                ymax = max(ymax, ty)
                                any_pt = True

        for child in list(node):
            walk(child, node_mat)

    walk(root, (1.0, 0.0, 0.0, 1.0, 0.0, 0.0))
    if not any_pt:
        return None

    return ViewBox(x=xmin, y=ymin, w=max(0.001, xmax - xmin), h=max(0.001, ymax - ymin))


def render_png(svg_text: str, out_px: int) -> "Image.Image":
    if cairosvg is None or Image is None:
        raise RuntimeError(
            "CairoSVG/Pillow not available. Install deps (`pip install cairosvg pillow`) "
            "and ensure system Cairo is installed (macOS: `brew install cairo`)."
        )
    png_bytes = cairosvg.svg2png(bytestring=svg_text.encode("utf-8"), output_width=out_px, output_height=out_px)
    im = Image.open(__import__("io").BytesIO(png_bytes)).convert("RGBA")
    return im


def ink_bbox_px(im: "Image.Image", alpha_threshold: int = 8) -> Optional[Tuple[int, int, int, int]]:
    a = im.split()[-1]
    mask = a.point(lambda v: 255 if v > alpha_threshold else 0, mode="L")
    return mask.getbbox()

def ink_bbox_px_alpha(svg_text: str, out_px: int, alpha_threshold: int = 10) -> Optional[Tuple[int, int, int, int]]:
    """
    Rasterize with transparent background and use alpha channel to find ink bounds.
    This is usually the tightest/cleanest crop *after* background shapes are removed.
    """
    if cairosvg is None or Image is None:
        return None
    im = render_png(svg_text, out_px=out_px)  # RGBA
    return ink_bbox_px(im, alpha_threshold=alpha_threshold)

def _inject_bg_rect(svg_text: str, fill: str) -> str:
    """
    Insert a background rect into the root <svg> so the raster has a known background color.
    This helps detect white ink vs whitespace reliably when combined with multiple backgrounds.
    """
    s = str(svg_text or "")
    m = re.search(r"<\s*svg\b[^>]*>", s, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return s
    tag = m.group(0)
    insert_at = m.end()
    rect = f'<rect x="0" y="0" width="100%" height="100%" fill="{fill}"/>'
    # Avoid double-injecting if already present (best-effort)
    if rect in s:
        return s
    return s[:insert_at] + rect + s[insert_at:]


def ink_bbox_px_multibg(svg_text: str, out_px: int, threshold: int = 12) -> Optional[Tuple[int, int, int, int]]:
    """
    Rasterize the SVG on multiple solid backgrounds and union the ink masks.
    This is robust against white ink and background rectangles.
    """
    if cairosvg is None or Image is None or ImageChops is None:
        return None

    # A small set of backgrounds covers nearly all logos.
    bgs = ["#ffffff", "#000000", "#ff00ff"]
    union_mask = None

    for bg in bgs:
        svg_bg = _inject_bg_rect(svg_text, bg)
        im = render_png(svg_bg, out_px=out_px).convert("RGB")
        bg_img = Image.new("RGB", (out_px, out_px), bg)
        diff = ImageChops.difference(im, bg_img).convert("L")
        mask = diff.point(lambda v: 255 if v > threshold else 0, mode="L")
        union_mask = mask if union_mask is None else ImageChops.lighter(union_mask, mask)

    if union_mask is None:
        return None
    bbox = union_mask.getbbox()
    if not bbox:
        return None

    # Tighten bbox by requiring "runs" of ink-free rows/cols.
    # This avoids single stray pixels at edges keeping the bbox too large.
    def tighten(mask_img: "Image.Image", b: Tuple[int, int, int, int]) -> Tuple[int, int, int, int]:
        l, t, r, btm = b
        if r - l <= 2 or btm - t <= 2:
            return b
        cropped = mask_img.crop((l, t, r, btm))
        w, h = cropped.size
        px = list(cropped.getdata())  # 0 or 255

        # Row/col ink thresholds (fraction of length). Tune conservative.
        # Slightly stricter thresholds -> tighter crops (but still safe).
        min_row = max(3, int(w * 0.004))  # 0.4% of row
        min_col = max(3, int(h * 0.004))  # 0.4% of col
        run = max(6, int(min(w, h) * 0.003))  # scales with resolution; ~6-9

        def row_count(y: int) -> int:
            start = y * w
            return sum(1 for v in px[start : start + w] if v)

        def col_count(x: int) -> int:
            return sum(1 for y in range(h) if px[y * w + x])

        # Find top
        top = 0
        while top < h:
            # Require at least one "ink row" within the next run rows
            if any(row_count(y) >= min_row for y in range(top, min(h, top + run))):
                break
            top += 1
        # Find bottom
        bottom = h
        while bottom > top:
            if any(row_count(y) >= min_row for y in range(max(top, bottom - run), bottom)):
                break
            bottom -= 1
        # Find left
        left = 0
        while left < w:
            if any(col_count(x) >= min_col for x in range(left, min(w, left + run))):
                break
            left += 1
        # Find right
        right = w
        while right > left:
            if any(col_count(x) >= min_col for x in range(max(left, right - run), right)):
                break
            right -= 1

        # Map back
        nl = l + left
        nt = t + top
        nr = l + right
        nb = t + bottom
        # Ensure valid
        if nr <= nl + 1 or nb <= nt + 1:
            return b
        return (nl, nt, nr, nb)

    return tighten(union_mask, bbox)


def compute_ink_bbox_in_viewbox(svg_text: str, vb: ViewBox, out_px: int, threshold: int = 12) -> Optional[ViewBox]:
    """
    Compute tight bounds in viewBox coordinates by rasterizing.
    This trims whitespace inside the viewBox even when the SVG uses group transforms.
    """
    # 1) Strip full-bleed white backgrounds first (common in logo packs).
    cleaned = strip_full_bleed_white_background(svg_text)

    # 2) Prefer alpha-based bounds (tightest) on the cleaned SVG.
    bbox = ink_bbox_px_alpha(cleaned, out_px=out_px, alpha_threshold=max(6, int(threshold)))

    # 3) Fallback: multi-background diff bounds (robust against weird rendering).
    if not bbox:
        bbox = ink_bbox_px_multibg(cleaned, out_px=out_px, threshold=int(threshold))
    if not bbox:
        return None
    l, t, r, b = bbox
    sx = vb.w / float(out_px)
    sy = vb.h / float(out_px)
    x0 = vb.x + l * sx
    y0 = vb.y + t * sy
    x1 = vb.x + r * sx
    y1 = vb.y + b * sy
    return ViewBox(x=float(x0), y=float(y0), w=max(0.001, float(x1 - x0)), h=max(0.001, float(y1 - y0)))


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def compute_trimmed_viewbox(vb: ViewBox, ink: ViewBox, margin_ratio: float) -> ViewBox:
    # Add safety margin (helps keep strokes from clipping).
    mx = ink.w * margin_ratio
    my = ink.h * margin_ratio
    nx0 = ink.x - mx
    ny0 = ink.y - my
    nx1 = ink.x + ink.w + mx
    ny1 = ink.y + ink.h + my

    # Clamp to original viewBox extents (never expand beyond original artboard).
    nx0 = clamp(nx0, vb.x, vb.x + vb.w)
    ny0 = clamp(ny0, vb.y, vb.y + vb.h)
    nx1 = clamp(nx1, vb.x, vb.x + vb.w)
    ny1 = clamp(ny1, vb.y, vb.y + vb.h)

    return ViewBox(x=nx0, y=ny0, w=max(0.001, nx1 - nx0), h=max(0.001, ny1 - ny0))


def replace_viewbox(svg_text: str, new_vb: ViewBox) -> str:
    def fmt(n: float) -> str:
        # Keep output deterministic but not overly long.
        return f"{n:.6f}".rstrip("0").rstrip(".")

    new_attr = f'viewBox="{fmt(new_vb.x)} {fmt(new_vb.y)} {fmt(new_vb.w)} {fmt(new_vb.h)}"'
    if _VIEWBOX_RE.search(svg_text):
        return _VIEWBOX_RE.sub(new_attr, svg_text, count=1)
    # If missing, inject into root <svg ...>
    m = re.search(r"<\s*svg\b", svg_text, flags=re.IGNORECASE)
    if not m:
        raise ValueError("Not an SVG (missing <svg)")
    i = m.end()
    return svg_text[:i] + " " + new_attr + svg_text[i:]


def strip_full_bleed_white_background(svg_text: str) -> str:
    """
    Remove common exporter-added full-bleed white background shapes (rect/path)
    that make trimmed SVGs still appear as white boxes.

    This is intentionally conservative: it only strips shapes that appear to cover
    ~the entire (original) viewBox and have a white fill with no stroke.
    """
    s = str(svg_text or "")
    vb = parse_viewbox(s)
    if not vb:
        return s
    try:
        root = ET.fromstring(s)
    except Exception:
        return s

    def is_white(fill: str) -> bool:
        f = (fill or "").strip().lower().replace(" ", "")
        return f in ("#fff", "#ffffff", "white", "rgb(255,255,255)", "rgba(255,255,255,1)")

    def stroke_none(stroke: str) -> bool:
        st = (stroke or "").strip().lower()
        return st in ("", "none", "transparent")

    eps_w = vb.w * 0.03
    eps_h = vb.h * 0.03

    def covers_or_contains_viewbox(x0: float, x1: float, y0: float, y1: float) -> bool:
        """
        Background rects/paths often cover the *original* artboard, and after trimming
        the viewBox becomes a sub-rectangle inside that. Treat shapes that fully contain
        the current viewBox as background too.
        """
        return (
            x0 <= vb.x + eps_w
            and x1 >= (vb.x + vb.w) - eps_w
            and y0 <= vb.y + eps_h
            and y1 >= (vb.y + vb.h) - eps_h
        )

    # ElementTree doesn't give parent pointers; walk and filter children.
    def filter_children(node: ET.Element) -> None:
        children = list(node)
        for ch in children:
            tag = ch.tag.split("}")[-1].lower()
            fill = ch.attrib.get("fill", "")
            stroke = ch.attrib.get("stroke", "")
            remove = False

            if tag == "rect" and is_white(fill) and stroke_none(stroke):
                w = (ch.attrib.get("width") or "").strip()
                h = (ch.attrib.get("height") or "").strip()
                x = float(ch.attrib.get("x") or "0")
                y = float(ch.attrib.get("y") or "0")
                # Common patterns: width/height = 100% or match vb size.
                if (w == "100%" and h == "100%") or (
                    w and h and w.replace(".", "", 1).isdigit() and h.replace(".", "", 1).isdigit()
                ):
                    try:
                        ww = vb.w if w == "100%" else float(w)
                        hh = vb.h if h == "100%" else float(h)
                        remove = covers_or_contains_viewbox(x, x + ww, y, y + hh)
                    except Exception:
                        remove = False

            if tag == "path" and is_white(fill) and stroke_none(stroke):
                d = (ch.attrib.get("d") or "").strip()
                if d:
                    try:
                        p = parse_path(d)
                        x0, x1, y0, y1 = p.bbox()
                        remove = covers_or_contains_viewbox(float(x0), float(x1), float(y0), float(y1))
                    except Exception:
                        remove = False

            if remove:
                node.remove(ch)
                continue

            filter_children(ch)

    filter_children(root)
    try:
        return ET.tostring(root, encoding="unicode")
    except Exception:
        return s


def trim_svg_file(in_path: Path, out_path: Path, out_px: int, margin_ratio: float) -> None:
    svg_text = in_path.read_text(encoding="utf-8", errors="replace")
    vb = parse_viewbox(svg_text)
    if not vb:
        raise ValueError(f"{in_path.name}: missing/invalid viewBox (required for trimming)")

    ink: Optional[ViewBox] = None
    # Prefer raster approach when Cairo is available; otherwise fall back to pure-Python.
    if cairosvg is not None and Image is not None:
        try:
            ink = compute_ink_bbox_in_viewbox(svg_text, vb=vb, out_px=out_px)
        except OSError:
            ink = None
        except Exception:
            ink = None

    if ink is None:
        ink = compute_ink_bbox_in_viewbox_pure(svg_text)

    if not ink:
        raise ValueError(
            f"{in_path.name}: could not detect ink bounds. "
            "If this SVG uses complex transforms, install system Cairo (macOS: `brew install cairo`) "
            "so CairoSVG can rasterize it accurately."
        )

    new_vb = compute_trimmed_viewbox(vb, ink=ink, margin_ratio=margin_ratio)
    out_text = replace_viewbox(svg_text, new_vb)
    out_path.write_text(out_text, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Trim SVG whitespace by tightening viewBox using rasterized ink bounds.")
    ap.add_argument("svg", type=str, help="Input SVG path (e.g. nike.svg)")
    ap.add_argument("--out", type=str, default="", help="Output SVG path (default: <name>.trim.svg)")
    ap.add_argument("--px", type=int, default=2000, help="Raster size used for ink detection (square).")
    ap.add_argument("--margin", type=float, default=0.02, help="Safety margin as fraction of trimmed bounds.")
    args = ap.parse_args()

    in_path = Path(args.svg).expanduser().resolve()
    if not in_path.exists():
        raise SystemExit(f"Input not found: {in_path}")
    out_path = Path(args.out).expanduser().resolve() if args.out else in_path.with_suffix(".trim.svg")
    trim_svg_file(in_path, out_path, out_px=int(args.px), margin_ratio=float(args.margin))
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()

