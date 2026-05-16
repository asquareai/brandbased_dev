# BrandBased — Settings Export

This folder contains a self-contained dev tool for exporting everything the
Brand Console front-end has persisted for a brand — **logo uploads, Theme
Styles / Theme Settings (7 slots), Products (7 slots)** — into a single JSON
or PHP file your backend can ingest.

Use this when you need to mirror a customer's last-saved Brand Console state
into the database so the **standalone Premium** and **standalone Freemium**
popup modals render with the right colours, video background, typography,
buy-now label, products, etc.

---

## Quick start

1. Open the Brand Console dashboard in your browser and set everything you
   want exported (upload light/dark logos, pick Theme Styles, configure
   Products, choose an active slot, etc.).
2. In the **same browser session**, open
   [`export-settings.html`](./export-settings.html)
   (e.g. `file:///.../brand-modules-bundle/dev/export-settings.html`).
3. Click **Download `brandbased-settings.json`**
   (or **Download `brandbased-settings.php`** if you'd rather have a PHP
   array file you can `require()`).
4. Hand the file to the backend / drop it into a seeder / store the values
   in the relevant DB columns.

The export page also shows a live preview of every value and a per-slot
breakdown so you can sanity-check before downloading.

> The page reads from `localStorage` on whatever origin you opened it
> at — usually `file://`. It must be opened in the same browser
> profile / tab session as the dashboard so it can see the same storage.

---

## What gets exported

### 1. Brand assets — `brand`
Used by **both** Premium and Freemium modals.

| Key                          | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `bbLuLightLogoData`          | Light-mode logo, `data:` URL (SVG / PNG).                     |
| `bbLuDarkLogoData`           | Dark-mode logo, `data:` URL (SVG / PNG).                      |
| `bbLuMode`                   | Last viewed upload mode, `"light"` or `"dark"`.               |
| `bbAssetLab:svg:v1`          | Asset-Lab–processed logo SVG (post-crop / clean-up).          |
| `bbAssetLab:filename:v1`     | Original filename the user uploaded.                          |
| `bbAssetLab:cropSaved:v1`    | `"1"` once the user has confirmed the crop step.              |

### 2. Theme Styles / Theme Settings — `themes`
Used by **both** Premium and Freemium modals. Same data drives both — the
only difference between Premium and Freemium is how the popup renders
those same values.

`themes.activeSlot` is the slot the customer was last on (0–6).
`themes.slots[]` is an array of 7 entries, each one containing the
persisted values for that slot:

| Field             | Source key (scoped per slot)                              | Notes                                  |
| ----------------- | --------------------------------------------------------- | -------------------------------------- |
| `accent`          | `bbTheme:accent:v1:themeSlot:<n>:v1`                      | Brand fill colour + accents.           |
| `background`      | `bbTheme:background:v1:themeSlot:<n>:v1`                  | Solid colour / gradient / image / video pointer. |
| `video`           | `bbTheme:video:v1:themeSlot:<n>:v1`                       | Theme video selection + on/off.        |
| `customBgPersist` | `bbTheme:customBgPersist:v1:themeSlot:<n>:v1`             | Custom uploaded background (data URL). |
| `buyNowLabel`     | `bbTheme:buyNowLabel:v1:themeSlot:<n>:v1`                 | CTA button label string.               |
| `typography`      | `bbTheme:typography:v1:themeSlot:<n>:v1`                  | Font choice + tracking + weights.      |
| `adsPreview`      | `bbTheme:adsPreview:v1:themeSlot:<n>:v1`                  | Ads/Theme preview state.               |
| `adminGallery`    | `bbTheme:adminGallery:v1:themeSlot:<n>:v1`                | Admin-curated background gallery.      |
| `recentColours`   | `bbTheme:recentColours:v1:themeSlot:<n>:v1`               | User's recently-picked accent colours. |

Slots that the user never touched get `_populated: false` and an otherwise
empty object — safe to skip on the backend.

### 3. Products — `premium.products`
**Premium only.** The Freemium modal ignores this block.

`premium.products.activeSlot` mirrors the active theme slot (Theme Styles
and Products share the same slot index by design).

`premium.products.slots[]` is an array of 7 entries:

| Field        | Source key                       |
| ------------ | -------------------------------- |
| `data`       | `bbProducts:slot:<n>:v1` parsed  |
| `_populated` | `true` if the slot has product data, `false` if untouched. |

Each `data` payload is whatever the Products page wrote — typically an
array of products with name, price, image, hotspots, etc.

### 4. Other — `other`
Anything else starting with `bb*` that we don't explicitly track lands
here for auditing. Backend dev should review before deciding whether to
persist or ignore.

The exporter intentionally **drops** transient prefixes:
`bbSync:*`, `bbSmartSize:*`, `bbReplaceThreshold:*`, `bbPreview:*`,
`bbPlacement:*` — these are cross-tab heartbeats / preview-tool dev
knobs and do not belong in the production DB.

---

## Bundle schema

```jsonc
{
  "exportedAt": "2026-05-13T06:45:00.000Z",
  "exportVersion": 1,
  "origin": "file://",
  "brand": {
    "bbLuLightLogoData": "data:image/svg+xml;base64,…",
    "bbLuDarkLogoData":  "data:image/svg+xml;base64,…",
    "bbLuMode":          "light",
    "bbAssetLab:svg:v1": "<svg …>",
    "bbAssetLab:filename:v1": "acme-logo.svg",
    "bbAssetLab:cropSaved:v1": "1"
  },
  "themes": {
    "activeSlot": 2,
    "slots": [
      { "slot": 0, "_populated": true,  "accent": {…}, "background": {…}, "video": {…}, "typography": {…}, … },
      { "slot": 1, "_populated": true,  "accent": {…}, … },
      { "slot": 2, "_populated": true,  "accent": {…}, … },
      { "slot": 3, "_populated": false },
      { "slot": 4, "_populated": false },
      { "slot": 5, "_populated": false },
      { "slot": 6, "_populated": false }
    ]
  },
  "premium": {
    "products": {
      "activeSlot": 2,
      "slots": [
        { "slot": 0, "_populated": true,  "data": [ … ] },
        { "slot": 1, "_populated": false, "data": null },
        …
      ]
    }
  },
  "freemium": {
    "notes": "Freemium popup renders themes[activeSlot] + brand. Products N/A."
  },
  "other": { "…": "…" }
}
```

---

## Premium vs Freemium — what the backend needs to render

| Modal                 | Reads from the bundle                              |
| --------------------- | -------------------------------------------------- |
| **Standalone Premium** popup   | `brand` + `themes.slots[themes.activeSlot]` + `premium.products.slots[premium.products.activeSlot]` |
| **Standalone Freemium** popup  | `brand` + `themes.slots[themes.activeSlot]` (products ignored) |

If you want a customer to have multiple themes available (e.g. theme
switcher), persist all 7 slots — the active slot is just the default.

---

## Consuming the exports

### PHP file
```php
<?php
$settings = require __DIR__ . '/brandbased-settings.php';

$brand        = $settings['brand'];
$activeTheme  = $settings['themes']['slots'][ $settings['themes']['activeSlot'] ];
$activeProds  = $settings['premium']['products']['slots'][ $settings['premium']['products']['activeSlot'] ];

$accentJson   = $activeTheme['accent'] ?? null;   // already a PHP array
$logoLightUrl = $brand['bbLuLightLogoData'] ?? null;
```

### JSON file
```php
<?php
$settings = json_decode(
    file_get_contents(__DIR__ . '/brandbased-settings.json'),
    true
);
```

### Storing logos
`bbLuLightLogoData` and `bbLuDarkLogoData` are `data:` URLs. Either:
- store the data URL as-is (easy, slightly bloats the row), or
- strip the `data:image/…;base64,` prefix, base64-decode, save to disk /
  S3, and store the resulting URL in your column.

---

## Brand Verification preview state (dev override)

The export page also includes a small **"Brand Verification — preview
state"** toggle. It controls whether the **Brand Verification** page
(`Meta-Verification.html` for Premium, `Freemium-Meta-Verification.html`
for Freemium) renders in its normal **Verified** state or in a red
**Not Verified** failure state.

| Toggle      | What the verification page shows                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Pass Verify | Default. Green badges + tick, "Brand Successfully Verified" pill, "Verified Brand Identity" title.                              |
| Not Verified | Red badges + cross, "Brand Not Verified" pill under each Light/Dark preview, title swaps to **"Unable to Verify Brand. Please contact support@brandbased.ai"** in red. |

Mechanism:

- The toggle writes `localStorage["bbDevVerifyState"]`:
  - `"fail"` → failure state.
  - removed (no entry) → default Verified state.
- `meta-verification-page.js` reads this key on load and listens for
  `storage` events, so flipping the toggle in the dev tab applies
  instantly to any open Brand Verification iframes / windows.
- This is **purely a presentation override** — it doesn't write to the
  exported settings JSON or affect what the backend receives.

Use this when you need to show the design / backend team what the
"Verification failed → contact support" screen looks like, without
having to actually break the real verify flow.

---

## Brand Console — Freemium dashboard simulation (dev override)

The export page includes a **"Brand Console — dashboard tier preview"**
control with **Premium** (default) and **Freemium mode**.

When **Freemium mode** is on, `brand-console-dashboard.html` (in another
tab on the same origin) covers **the entire viewport** with a frosted
glass blur — same layering vocabulary as the shared sync popups — and
centres a large white BrandBased-typeface message:

> Upgrade to Premium to power your BrandBased account with AI-driven
> Content Commerce, intelligent automation, advanced metrics and more.

Dashboard chrome (header, sidebar, mobile footer) still paints above
the blur so navigation stays usable.

**Exclusions — the gate is hidden on:**

- Any iframe URL whose path contains a `freemium` folder segment.
  That covers every "Free" version: Upload Brand Assets, Brand
  Verification, Brand Settings, Theme Styles, Hotspots, etc.
- The **Start Now** page (`start-now/Start-Now.html`) — the upgrade
  entry point itself shouldn't be hidden behind an upgrade prompt.
- The **Brands** page (`brands/Brands.html`) — Freemium users still
  need to see / manage their own brand entries.

Mechanism:

- Toggle writes `localStorage["bbDevDashSimulateFreemium"]`:
  - `"1"` → Freemium simulation (gate visible on non-freemium routes).
  - removed → Premium (normal dashboard).
- `brand-console-final/js/bb-dev-freemium-gate.js` reads this key,
  listens for `storage` events, iframe `load`, and `postMessage`
  (`bb-dash-route`) so internal iframe navigation updates the overlay.
- Dev-only keys (`bbDevVerifyState`, `bbDevDashSimulateFreemium`) are
  **omitted** from the exported JSON / PHP bundle.

## Re-exporting / iterating

If you change Theme Styles or Products and want a fresh export, switch
back to the export tab and hit **Reload from localStorage** (the page also
auto-refreshes when it sees a `storage` event from another tab).

---

## Where this lives

- `BB-Entire-Frontend-Modals-and-Brand-Dashbaord/brand-modules-bundle/dev/export-settings.html` — export UI + dev toggles.
- `BB-Entire-Frontend-Modals-and-Brand-Dashbaord/brand-console-final/js/bb-dev-freemium-gate.js` — dashboard iframe gate logic.
- `BB-Entire-Frontend-Modals-and-Brand-Dashbaord/brand-console-final/brand-console-dashboard.html` — gate markup + script include.
- `BB-Entire-Frontend-Modals-and-Brand-Dashbaord/brand-console-final/css/brand-console-styles.css` — gate + dialog styles.

---

## FAQ

**Why is my theme slot empty when I just set it?**
Open the Theme Styles page once and let the inline scripts settle —
they hydrate the scoped slot key only after the page mounts. Refresh
the export page after.

**The logo data URLs are huge — is that expected?**
Yes. SVGs base64-encode to a few KB; PNGs can be hundreds of KB. The
PHP file will reflect that. Strip + store on disk if it matters.

**Does this work over `http://localhost`?**
Yes — `localStorage` is per-origin, so as long as the dashboard and the
export page share the same origin (e.g. both served from
`http://localhost:8080`), the export sees the same data.

**Can the backend write back to this bundle?**
Yes — the schema is stable as long as `exportVersion` matches.
Bump `exportVersion` if the front-end ever changes the structure.
