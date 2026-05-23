#!/usr/bin/env python3
"""Merge in-text light/dark logo logic from logo-merge-source into Downloads-base bb-smart-ui.js."""
from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE / "bb-smart-ui.js"
DONOR = HERE / "bb-smart-ui.logo-merge-source.js"
OUT = BASE


def extract_function(src: str, name: str) -> str:
    pat = re.compile(rf"(  function {re.escape(name)}\s*\([^)]*\)\s*\{{)", re.M)
    m = pat.search(src)
    if not m:
        raise SystemExit(f"function {name} not found")
    start = m.start()
    i = m.end() - 1
    depth = 0
    while i < len(src):
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
        i += 1
    raise SystemExit(f"unclosed function {name}")


def replace_function(src: str, name: str, body: str) -> str:
    pat = re.compile(rf"  function {re.escape(name)}\s*\(")
    if not pat.search(src):
        raise SystemExit(f"function {name} not in target")
    old = extract_function(src, name)
    if old == body:
        return src
    return src.replace(old, body, 1)


def insert_before_function(src: str, anchor: str, block: str) -> str:
    pat = re.compile(rf"(  function {re.escape(anchor)}\s*\()")
    m = pat.search(src)
    if not m:
        raise SystemExit(f"anchor {anchor} not found")
    if block.strip() in src:
        return src
    return src[: m.start()] + block.rstrip() + "\n\n" + src[m.start() :]


def extract_pre_iife_helpers(donor: str) -> str:
    start = donor.find("  /** In-text marks need")
    end = donor.find('document.addEventListener("DOMContentLoaded"')
    if start < 0 or end < 0:
        raise SystemExit("pre-IIFE helpers not found in donor")
    return donor[start:end].rstrip() + "\n\n"


def extract_block(donor: str, start_marker: str, end_marker: str) -> str:
    a = donor.find(start_marker)
    b = donor.find(end_marker, a)
    if a < 0 or b < 0:
        raise SystemExit(f"block not found: {start_marker!r} .. {end_marker!r}")
    return donor[a:b]


def main() -> None:
    base = BASE.read_text(encoding="utf-8")
    donor = DONOR.read_text(encoding="utf-8")

    # 1) Pre-DOM helpers (standalone appearance / upload token)
    helpers = extract_pre_iife_helpers(donor)
    anchor = "  function bbBrandClass(brand) {\n    if (!brand) return \"\";\n    const slug = String(brand).trim().toLowerCase();\n    if (!/^[a-z0-9_-]+$/.test(slug)) return \"\";\n    return `bb-${slug}`;\n  }\n\n"
    if "function bbEnsureUploadMarkBrandToken" not in base:
        base = base.replace(anchor, anchor + helpers, 1)

    # 2) LU constants + blob state
    if "BB_LU_LIGHT_LOGO_KEY" not in base:
        base = base.replace(
            '  const BB_ASSET_LAB_STYLE_ID = "bb-asset-lab-style";\n',
            '  const BB_ASSET_LAB_STYLE_ID = "bb-asset-lab-style";\n'
            '  const BB_LU_DUAL_STYLE_ID = "bb-lu-dual-logo-style";\n',
            1,
        )
        base = base.replace(
            '  const BB_ASSET_LAB_CROP_SAVED_KEY = "bbAssetLab:cropSaved:v1";\n',
            '  const BB_ASSET_LAB_CROP_SAVED_KEY = "bbAssetLab:cropSaved:v1";\n'
            '  /** Logo upload page: separate marks for light / dark UI (data URLs). */\n'
            '  const BB_LU_LIGHT_LOGO_KEY = "bbLuLightLogoData";\n'
            '  const BB_LU_DARK_LOGO_KEY = "bbLuDarkLogoData";\n'
            '  const BB_LU_LAST_UPLOAD_MODE_KEY = "bbLuLastUploadMode";\n\n'
            '  function bbPersistLuLogoSlotFromSvg(svgText) {\n'
            '    const s = String(svgText || "").trim();\n'
            '    if (!s || !/<\\s*svg\\b/i.test(s)) return;\n'
            '    let mode = "light";\n'
            '    try {\n'
            '      mode = localStorage.getItem(BB_LU_LAST_UPLOAD_MODE_KEY) || "light";\n'
            '    } catch (_e) {}\n'
            '    const key = mode === "dark" ? BB_LU_DARK_LOGO_KEY : BB_LU_LIGHT_LOGO_KEY;\n'
            '    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;\n'
            '    try {\n'
            '      localStorage.setItem(key, dataUrl);\n'
            '      window.dispatchEvent(new CustomEvent("bb-lu-logo-updated"));\n'
            '    } catch (_e) {}\n'
            '  }\n',
            1,
        )
        base = base.replace(
            "  let bbAssetLabTrimViewBox = \"\";\n",
            "  let bbAssetLabTrimViewBox = \"\";\n"
            "  let bbLuLightBlobUrl = \"\";\n"
            "  let bbLuDarkBlobUrl = \"\";\n"
            "  let bbLuLightRatio = 1;\n"
            "  let bbLuDarkRatio = 1;\n"
            "  let bbLuDualLogoSig = \"\";\n",
            1,
        )

    # 3) Logo helper block (after bbGetAssetLabStyleEl, before bbInitAssetLabUi)
    if "function bbGetLuDualStyleEl" not in base:
        logo_block = extract_block(
            donor,
            "  function bbGetLuDualStyleEl()",
            "  function bbInitAssetLabUi()",
        )
        base = base.replace(
            extract_function(base, "bbGetAssetLabStyleEl") + "\n\n",
            extract_function(base, "bbGetAssetLabStyleEl") + "\n\n" + logo_block,
            1,
        )

    # 4) Replace / insert key functions from donor
    for fn in ("bbApplyUploadedSvgToCss", "bbSyncStandaloneMarksToThemeSim", "enhanceBrandMarks"):
        base = replace_function(base, fn, extract_function(donor, fn))

    standalone_fns = (
        extract_function(donor, "bbInitStandaloneAppearanceToggle")
        + "\n\n"
        + extract_function(donor, "bbPrepareStandaloneLogoCssOnly")
        + "\n\n"
        + extract_function(donor, "bbBootstrapStandaloneInTextMarks")
        + "\n\n"
    )
    base = insert_before_function(base, "enhanceBrandMarks", standalone_fns)

    # 5) Asset lab restore + crop persist
    if "bbPersistLuLogoSlotFromSvg(finalSvg)" not in base:
        base = base.replace(
            '        localStorage.setItem(BB_ASSET_LAB_CROP_SAVED_KEY, "1");\n      } catch {}\n      updateApplyButtonVisibility();',
            '        localStorage.setItem(BB_ASSET_LAB_CROP_SAVED_KEY, "1");\n      } catch {}\n      bbPersistLuLogoSlotFromSvg(finalSvg);\n      updateApplyButtonVisibility();',
            1,
        )

    restore_old = """    // Restore last uploaded SVG (if any) — runs on all pages (including Brand-Settings-Module.html).
    try {
      const cached = localStorage.getItem(BB_ASSET_LAB_STORAGE_KEY) || "";
      if (cached && /<\\s*svg\\b/i.test(cached)) {"""
    if restore_old in base and "bbSyncAppearanceAwareUploadLogo" not in base[
        base.find(restore_old) : base.find(restore_old) + 800
    ]:
        restore_new = extract_block(
            donor,
            "    // Restore last uploaded SVG (if any) — runs on all pages",
            "    updateApplyButtonVisibility();\n  }\n\n  bbInitAssetLabUi();",
        )
        base = base.replace(
            extract_block(
                base,
                "    // Restore last uploaded SVG (if any) — runs on all pages",
                "    updateApplyButtonVisibility();\n  }\n\n  bbInitAssetLabUi();",
            ),
            restore_new,
            1,
        )

    # 6) Init calls
    if "bbInitStandaloneAppearanceToggle();" not in base:
        base = base.replace(
            "  bbInitAssetLabUi();\n  bbInitPlacementPanelUi();",
            "  bbInitAssetLabUi();\n  bbInitStandaloneAppearanceToggle();\n  bbInitAppearanceAwareUploadLogo();\n  bbInitPlacementPanelUi();",
            1,
        )

    # 7) global exports
    old_try = """  try {
    globalThis.bbSyncStandaloneMarksToThemeSim = bbSyncStandaloneMarksToThemeSim;
    globalThis.bbRefreshStandaloneInTextSmartSizing = bbRefreshStandaloneInTextSmartSizing;
    globalThis.bbRefreshThemeSimSmartSizing = bbRefreshThemeSimSmartSizing;
  } catch {}"""
    new_try = (
        "  try {\n"
        "    globalThis.bbSyncStandaloneMarksToThemeSim = bbSyncStandaloneMarksToThemeSim;\n"
        "    globalThis.bbRefreshStandaloneInTextSmartSizing = bbRefreshStandaloneInTextSmartSizing;\n"
        "    globalThis.bbPaintUploadMarksForScheme = bbPaintUploadMarksForScheme;\n"
        "    globalThis.bbResolveAppearanceScheme = bbResolveAppearanceScheme;\n"
        "    globalThis.bbEnsurePopupUploadBrandSurfaces = bbEnsurePopupUploadBrandSurfaces;\n"
        "  } catch {}\n"
    )
    if old_try in base:
        base = base.replace(old_try, new_try, 1)
    elif "globalThis.bbPaintUploadMarksForScheme" not in base:
        base = base.replace(
            "  } catch {}\n\n  function bbGetGuidancePadTargetMarks()",
            new_try + "\n  function bbGetGuidancePadTargetMarks()",
            1,
        )

    # 8) openModal: theme console sync only (keep Downloads timing)
    if "BBThemeConsoleSync.sync" not in base:
        base = base.replace(
            "    popup.style.pointerEvents = \"auto\";\n\n    // Restore original behavior:",
            "    popup.style.pointerEvents = \"auto\";\n\n    try {\n"
            "      if (window.BBThemeConsoleSync && typeof window.BBThemeConsoleSync.sync === \"function\") {\n"
            "        window.BBThemeConsoleSync.sync();\n"
            "      }\n    } catch (_e) {}\n\n    // Restore original behavior:",
            1,
        )

    # 9) End init + click safety net
    old_init = extract_block(
        base,
        " // Delay before brand layers + popups",
        "}, 2000); // delay before additive BB layers + popups",
    )
    new_init = extract_block(
        donor,
        " // Delay before brand layers + popups",
        "}, _bbInitDelayMs); // delay before additive BB layers + popups",
    )
    base = base.replace(old_init, new_init, 1)

    old_click = """document.addEventListener(
  "click",
  (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const el = t.closest(".brandbased-dynamic-logo-slot");
    if (!el || el.closest(".popup")) return;
    openModalForBrandMark(el);
  },
  true
);"""
    new_click = """// Safety net: ensure Brand Settings marks always open a popup even if enhancements haven’t run yet.
document.addEventListener(
  "click",
  (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const el = t.closest(".brandbased-dynamic-logo-slot");
    if (!el || el.closest(".popup")) return;
    if (!el.classList.contains("bb-enhanced")) return;
    if (bbIsStandaloneDemoPage() && !el.classList.contains("slide-up")) return;
    openModalForBrandMark(el);
  },
  true
);"""
    if old_click in base:
        base = base.replace(old_click, new_click, 1)

    # 10) Remove bbSyncStandalone from enhanceBrandMarks if donor version lacks it
    base = base.replace(
        "  function enhanceBrandMarks() {\n    try {\n      bbSyncStandaloneMarksToThemeSim();\n    } catch {}\n    const isStandalone",
        "  function enhanceBrandMarks() {\n    const isStandalone",
        1,
    )

    OUT.write_text(base, encoding="utf-8")
    print(f"Wrote {OUT} ({len(base.splitlines())} lines)")


if __name__ == "__main__":
    main()
