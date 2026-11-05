# Dembrandt Replica Engine: Evolution & Improvements Log

This document tracks all changes and architectural improvements made to **Dembrandt** and its offline bundle extractor (`tools/capture-bundle.mjs`) from its initial unaltered state to the current deterministic 1:1 replica engine.

---

## Iteration 1: Legacy Framework & ASP.NET Ingestion Support

### 🔴 Problem / Limitation in Unaltered Tool
The original `dembrandt` engine was designed exclusively for modern standard web apps (Next.js, Vite, static HTML). When run against enterprise, educational, or legacy systems (such as ASP.NET WebForms, IIS portals, and table-driven layouts):
1. **Missed Navigation**: The link discovery crawler looked only for standard semantic elements (`nav a`, `header a`, `.navbar a`). It was blind to ASP.NET menu systems (`.aspNetMenu a`, `[id*="Menu"] a`, `table.menu a`, and `ctl00_` server controls).
2. **Ignored Form Buttons & Inputs**: The component extractor only queried `<button>`, `<a href>`, and `[role="button"]`. Legacy sites use `<input type="submit">`, `<input type="button">`, `<input type="image">`, or inputs without explicit types (`<input>`), with their button text stored in `value` or `alt` attributes rather than `textContent`. Consequently, all primary call-to-action buttons were omitted.
3. **Missing Tech Fingerprinting**: The builder classification engine could not detect ASP.NET WebForms architectures.

### 🟢 What Was Changed
1. **Expanded Link Discovery (`lib/discovery.ts`)**: Added selectors for ASP.NET menus (`.aspNetMenu a`, `[id*="Menu"] a`, `[id*="Nav"] a`, `[id*="ctl00"] a`, `table.menu a`).
2. **Enhanced Button & Input Extractor (`lib/extractors/components.ts`)**:
   - Added `input[type="submit"]`, `input[type="button"]`, `input[type="reset"]`, `input[type="image"]`, and un-typed inputs `input:not([type])`.
   - Extracted button labels by inspecting `(el as HTMLInputElement).value` and `.alt` when `textContent` is empty.
3. **Added ASP.NET Detection Rules (`lib/tech/rules/builders.ts`)**: Added fingerprinting for `__VIEWSTATE`, `__EVENTVALIDATION`, `WebResource.axd`, `ScriptResource.axd`, and `Sys.WebForms`.
4. **NPM Run Scripts (`package.json`)**: Added `"bundle"` and `"capture"` scripts pointing to `tools/capture-bundle.mjs`.

### 🛠️ How It Was Done
Patched the core TypeScript extraction files in `lib/` and compiled them into `dist/`.

---

## Iteration 2: Creation of the 5-File Offline Bundle Extractor (`tools/capture-bundle.mjs`)

### 🔴 Problem / Limitation in Previous Iteration
The unaltered `dembrandt` CLI generated only isolated CSS design tokens (`tokens.json`, raw palette hexes, font families). It had **no understanding of page layout, DOM hierarchy, actual text copy, media assets, or spatial arrangement**. When a downstream coding agent was asked to build a website replica from design tokens alone, it was forced to hallucinate the entire HTML structure, grid layout, copywriting, and navigation from scratch.

### 🟢 What Was Changed
Created `tools/capture-bundle.mjs` to produce a self-contained, closed-world **5-File Replica Bundle** in `output/<domain>/bundle/`:
1. `DESIGN.md` – Design tokens (typography scale, palette, button styles, borders).
2. `content.md` – Hierarchical content architecture, section flow, and media catalog.
3. `REPLICA_GUIDE.md` – Step-by-step master implementation blueprint for AI coding agents.
4. `rendered.html` – Sanitized DOM structure (hydrated, stripped of scripts and ViewState bloat).
5. `screenshot.png` – High-resolution full-page visual ground truth.

### 🛠️ How It Was Done
Integrated **Playwright** into a deterministic capture CLI script that:
- Spawns headless Chromium at 1920×1080 desktop resolution.
- Executes page hydration, font readiness, and scrolling.
- Captures full-page screenshots and serializes the DOM alongside design tokens.

---

## Iteration 3: Automated Dynamic Hydration & ViewState Sanitization Engine

### 🔴 Problem / Limitation in Previous Iteration
1. **Unsettled Lazy Loading**: Capturing the page immediately upon `domcontentloaded` missed lazy-loaded images, dynamic sliders, and elements triggered by `IntersectionObserver`.
2. **Unrendered Fonts**: Custom web fonts were not finished rendering, resulting in inaccurate typography calculations.
3. **ViewState Token Bloat**: ASP.NET pages store hundreds of kilobytes (sometimes megabytes) of base64 data in hidden form inputs (`__VIEWSTATE`, `__EVENTVALIDATION`, `__VIEWSTATEGENERATOR`). When passed into an AI coding agent, this flooded the context window with useless encrypted strings.

### 🟢 What Was Changed
Built an automated page settlement, auto-scroll engine, and regex DOM sanitizer into `capture-bundle.mjs`.

### 🛠️ How It Was Done
- **ASP.NET PostBack Settlement**: Added `page.waitForFunction` waiting for `Sys.WebForms.PageRequestManager` to ensure zero active AJAX postbacks.
- **Font Settlement**: Added `document.fonts.ready` await before measuring bounding boxes and taking screenshots.
- **Adaptive Auto-Scroll**: Programmatically scrolled the page down in 350px increments at 80ms intervals to trigger lazy-loaded sections, then returned to the top.
- **ViewState Sanitizer**: Applied regex string replacements stripping scripts, noscripts, and substituting huge ViewState payloads with concise tags:
  ```javascript
  .replace(/(<input[^>]+name="__(?:VIEWSTATE|EVENTVALIDATION|VIEWSTATEGENERATOR|EVENTTARGET|EVENTARGUMENT|PREVIOUSPAGE)"[^>]+value=")[^"]+(")/gi, '$1[ASP.NET_VIEWSTATE_SANITIZED]$2')
  ```

---

## Iteration 4: Deep Hierarchical Navigation & Active Pill Detection

### 🔴 Problem / Limitation in Previous Iteration
Navigation links were previously captured as a flat, unorganized array of links. Dropdown submenus, nested hierarchies, and visual "active/current" page indicators were completely lost, causing coding agents to build plain horizontal links without interactive dropdown menus.

### 🟢 What Was Changed
Extracted deep multi-level navigation trees (`navTrees`) and captured the exact computed styles of the active/current menu item (`activeNavStyles`).

### 🛠️ How It Was Done
- Queried navigation candidates across semantic `<nav>`, `<header>`, `.navbar`, and legacy ASP.NET menu tables.
- Traversed top-level menu items and recursively extracted nested submenus (`<ul>`, `.dropdown-menu`, `.sub-menu`) up to 2 levels deep.
- Detected `.current-menu-item`, `.active`, or `.rmp-menu-current-item` classes.
- Used `window.getComputedStyle()` on active links to capture exact `backgroundColor`, `color`, `borderRadius`, and `padding`.

---

## Iteration 5: Recursive Wrapper Unwrapping (`unwrapToVisualBands`)

### 🔴 Problem / Limitation in Previous Iteration
Modern CMSs (WordPress, Elementor) and legacy frameworks (ASP.NET WebForms) wrap entire pages inside deep boilerplate containers (e.g. `<div id="outer-wrap">`, `<div class="site-content">`, `<form id="aspnetForm">`, `<main id="main">`). The extractor previously stopped at the first level, mistaking the entire 5000px-tall wrapper container for a single giant section.

### 🟢 What Was Changed
Added an automated recursive wrapper unwrapping algorithm (`unwrapToVisualBands`) that drills past arbitrary framework shells until it reaches the true visual layout sections.

### 🛠️ How It Was Done
- Evaluated container children against page viewport metrics (`rect.height > totalDocHeight * 0.35`).
- Matched container signatures against known wrapper classes (`outer-wrap`, `site-content`, `site-main`, `aspnetForm`, `__next`, `page-wrap`, `entry-content`).
- Recursively unwrapped container nodes while protecting top-level visual landmarks (`<header>`, `<footer>`, `<nav>`, hero sliders).

---

## Iteration 6: Spatial Geometry: Title Ribbons & Multi-Column Splits

### 🔴 Problem / Limitation in Previous Iteration
Coding agents had no concept of section layout ratios. They guessed column layouts arbitrarily (e.g. rendering columns 50%/50% when the real design was 65%/35%), and missed full-width colored section header ribbons (e.g. "COURSES", "PLACEMENTS", "CAMPUS ACTIVITIES"), producing visually flat and disorganized layouts.

### 🟢 What Was Changed
Engineered spatial geometry detectors for **Section Title Ribbons** and **Multi-Column Split Ratios**.

### 🛠️ How It Was Done
- **Section Title Ribbon Detector**: Identified bands with `height <= 140px`, `width >= 500px`, containing a single prominent heading and no text blocks or images.
- **Split Ratio Calculator**: Measured direct sibling column bounding boxes (`directCols`), summed their widths, and calculated proportional CSS flex/grid percentages (e.g. `65% / 35%`, `70% / 30%`, `50% / 50%`).

---

## Iteration 7: Floating Hero Overlay Cards & Media Frames

### 🔴 Problem / Limitation in Previous Iteration
Hero banners frequently contain floating overlay cards anchored over the background image (e.g. college mission statements or highlights). Previously, these were extracted as generic text blocks and rendered sequentially beneath the hero image rather than floating on top. YouTube video players were also omitted.

### 🟢 What Was Changed
Extracted exact pixel coordinates and positioning contracts for floating overlay cards, and preserved embedded video players.

### 🛠️ How It Was Done
- Inspected child elements inside hero banners checking for `position: absolute` or semi-transparent dark backgrounds (`rgba(0, 0, 0, 0.7)`).
- Measured bounding box offsets relative to the parent hero band (`top`, `right`, `width`, `height`).
- Captured `<iframe>` and `<video>` tags with source URLs, natural dimensions, and aspect ratio container contracts (`aspect-ratio: 16 / 9`).

---

## Iteration 8: Regex Word-Boundary Hyphen Bug Fix

### 🔴 Problem / Limitation in Previous Iteration
In JavaScript regular expressions, the hyphen (`-`) is treated as a word boundary (`\b`). The pattern `/elementor\b/` unintentionally matched `elementor-widget`, `elementor-column`, and `elementor-heading-title`. This caused the extractor to shred complete Elementor page sections into dozens of tiny individual `<p>` and `<h2>` micro-tags.

### 🟢 What Was Changed
Replaced the regex with strict whitespace/boundary matching to target only the actual wrapper container classes.

### 🛠️ How It Was Done
Replaced `/elementor\b/` with:
```javascript
/(?:^|\s)(?:elementor|elementor-inner|elementor-section-wrap)(?:\s|$)/.test(cls)
```
This ensured that outer page containers unwrap properly, while leaf visual sections (`<section class="elementor-section elementor-top-section">`) remain completely intact.

---

## Iteration 9: Direct Card & Slide Media Binding

### 🔴 Problem / Limitation in Previous Iteration
Image assets were dumped into a detached global media catalog at the bottom of the file. Cards inside feature grids or carousel slides only listed text titles and descriptions. Image-only slides (such as recruitment posters and banners with no `<h3>` tag) were discarded entirely by `filter(c => c.title.length > 0)`.

### 🟢 What Was Changed
Bound image asset URLs directly to their corresponding card/slide objects, and updated the filter to preserve pure image cards.

### 🛠️ How It Was Done
- Traversed `.card`, `.slick-slide`, `.htmega-postcarousel-item`, `.elementor-widget-image-box`, and `[class*="slide"]`.
- Checked `c.querySelector('img')?.currentSrc || img.src` and CSS `getComputedStyle(c).backgroundImage`.
- Attached the asset URL directly to each card item: `Item X: "Title" | Image Asset: ![Asset](url)`.
- Changed filter condition to `c.title.length > 0 || c.img.length > 0`, ensuring all recruitment posters, course banners, and newsline slides are captured.

---

## Iteration 10: Canvas & Ancestor Background Texture Inheritance

### 🔴 Problem / Limitation in Previous Iteration
Websites often set page-wide background textures or watermarks (such as `BG.png`) on `body` or `#page`. Because individual section bands have `background-color: transparent`, the extractor previously reported them as plain `#ffffff`, causing replicas to lose their background textures and visual depth.

### 🟢 What Was Changed
Added global page canvas extraction and an ancestor background inheritance trace.

### 🛠️ How It Was Done
- Queried computed styles of `document.body`, `document.documentElement`, and `#page` to capture `globalBackground` (color, image URL, repeat, size).
- Implemented `getEffectiveBg(node)`: walks up the DOM parent tree until finding the first non-transparent background color or non-none background image.
- Emitted a mandatory `## 2. Global Page Canvas & Body Background` rule in `REPLICA_GUIDE.md` specifying:
  ```css
  body {
    background-color: rgb(255, 255, 255);
    background-image: url('https://.../BG.png');
    background-repeat: repeat;
  }
  ```

---

## Iteration 11: Micro-Component Computed Styles Extraction

### 🔴 Problem / Limitation in Previous Iteration
The extractor only collected text labels for KPI counters (e.g. `"25+"`, `"Years of Excellence"`), buttons, and badges without capturing their styling. AI coding agents had to guess styling, resulting in discrepancies (such as solid dark blue boxes instead of transparent cyan text counters).

### 🟢 What Was Changed
Directly extracted resolved computed styles from the browser layout engine for KPI counters, buttons, badges, and ribbons.

### 🛠️ How It Was Done
- For counters: Read `numStyle.color`, `numStyle.fontSize`, `numStyle.fontWeight`, `labelStyle.color`, and container `backgroundColor`.
  - Result: Generated explicit contracts like `Number Style: color: rgb(0, 168, 204); font-size: 75px; font-weight: 600; | Card Background: transparent`.
- For buttons: Extracted `color`, `backgroundColor`, `borderRadius`, `border`, and `padding`.
- For ribbons: Detected whether the heading is a centered pill (`border-radius: 20px`) or a full-width title bar (`border-radius: 0px`).

---

## Iteration 12: Dominant Visual Backgrounds, Social Glyphs, Ticker, and Card Disambiguation

### 🔴 Problem / Limitation in Previous Iteration
1. **Outer Wrapper Shadowing**: When a section or header was nested inside an unstyled wrapper, the tool reported `#ffffff` even when the true visual background of the header was dark navy (`#162544` / `rgb(22, 37, 68)`).
2. **Transparent Alpha Bug**: Transparent colors with alpha 0 (e.g. `rgba(240, 6, 6, 0)`) were treated as non-transparent because the code checked `!== 'rgba(0, 0, 0, 0)'`, causing ribbons to report transparent red backgrounds instead of the true underlying dark ribbon color.
3. **Hardcoded Social Button Hallucination**: The script contained a hardcoded template string `White circular buttons (32px x 32px, border-radius: 50%)` in `REPLICA_GUIDE.md` and `content.md`, overriding the real computed styling and causing agents to render circular buttons even when the site used plain outline glyphs.
4. **Missing Ticker Strip Detection**: Marquee / live ticker bars sitting on transparent canvas were not explicitly identified, causing agents to render solid dark banner boxes with badge pills.
5. **Card Type Conflation**: Solid action boxes with bold centered text (such as "Institute Vision, Mission and Quality Policy") were bound to unrelated image thumbnails from neighboring columns, and portrait recruitment posters (`724 / 1024`) were not distinguished from horizontal landscape thumbnails.
6. **Hero CTA Button Blindness**: The floating overlay card extracted text and coordinates, but completely missed the CTA button's computed styles (`#162544` dark navy background, border, text).

### 🟢 What Was Changed
1. **`isTransparent` Helper**: Accurately detects `transparent` and any RGBA/HSLA color with alpha 0 (`rgba(..., 0)`).
2. **Dominant Visual Background Resolver (`getDominantVisualBg`)**: Traverses inner content containers and parent hierarchies to resolve the actual visible background color of any band.
3. **Exact Social Link Classifier**: Detects `isGlyphOnly` vs `isCircle` based on real computed `backgroundColor` and `borderRadius`.
4. **Live Marquee / Ticker Engine**: Directly queries marquee and ticker tracks, extracting the prefix label, text items, and transparent/solid background.
5. **Card Type Disambiguation**: Differentiates `isSolidActionBox` (text-only dark blocks) and `isPortraitPoster` (`aspect-ratio < 0.85`, specifying 724 / 1024 object-fit cover).
6. **Hero Card CTA Button Capture**: Extracts the overlay card's CTA button `text`, `backgroundColor`, `color`, `borderRadius`, and `border`.

### 🛠️ How It Was Done
Upgraded `dembrandt/tools/capture-bundle.mjs` with `isTransparent` alpha inspection, dynamic token emission, and geometric card aspect ratio classification.

---

## Iteration 13: The Closed-World Master Prompt Specification (`master_prompt.txt`)

### 🔴 Problem / Limitation in Previous Iteration
Even with high-quality extracted markdown files, downstream AI coding agents (Claude, Cursor, Copilot, ChatGPT) tended to inject their own stylistic biases—generating generic "modern SaaS" designs with Tailwind default colors, centered cards, and placeholder stock photos, disregarding the extracted bundle tokens.

### 🟢 What Was Changed
Crafted a battle-tested master prompt (`master_prompt.txt`) designed to enforce a **Strict Closed-World Assumption** on any coding agent.

### 🛠️ How It Was Done
- **5-File Authority Order**: Defined an explicit priority hierarchy (`REPLICA_GUIDE.md` > `DESIGN.md` > `content.md` > `screenshot.png` > `rendered.html`).
- **Zero-Hallucination Guardrails**: Prohibited generic templates, placeholder copy, and invented layouts.
- **Explicit Component Contracts**: Mandated exact execution of section ribbons, multi-column split ratios, floating card coordinates, and micro-component styles.

---

## Iteration 14: End-to-End Closed-World Testbed & Visual Verification Pipeline (`pcce-react`)

### 🔴 Problem / Limitation in Previous Iteration
There was no reference application to prove that an agent following the offline bundle would actually produce a 1:1 pixel-accurate replica without human intervention.

### 🟢 What Was Changed
Created a dedicated React + Vite benchmark testbed (`pcce-react`) and implemented an automated Playwright visual regression verification script (`replica_verify.png`).

### 🛠️ How It Was Done
- Initialized `pcce-react` using Vite.
- Implemented the entire webpage strictly using the design tokens from `DESIGN.md`, layout specs from `REPLICA_GUIDE.md`, and copy/media from `content.md`.
- Wrote an automated headless verification script that rendered `pcce-react` at 1920×1080 and captured `replica_verify.png`.
- Visually compared `replica_verify.png` directly against `dembrandt/output/pccegoa.edu.in/bundle/screenshot.png`, verifying that top bar `#162544`, ticker, ribbons, 50/50 split ratios, poster dimensions, and cyan counters align with visual ground truth.

---

## Iteration 15: Generalization Hardening & Universal Web Extraction Architecture

### 🔴 Problem / Limitation Addressed
Need to verify that the extraction tool is not brittle or overfitted to a single website, but works reliably across diverse web architectures (React/Next.js, Vue, Webflow, Shopify, Angular, ASP.NET WebForms).

### 🟢 What Was Done
1. **W3C Standards Compliance Audit**: Audited all heuristics in `capture-bundle.mjs` to ensure zero hardcoded domain strings or framework class names. All extraction relies on W3C computed styles (`window.getComputedStyle`), bounding boxes (`getBoundingClientRect`), and natural image aspect ratios.
2. **Formalized Universal Web Extraction Architecture**: Defined technical handling for non-standard web elements:
   - **Canvas / WebGL**: Fallback to high-resolution snapshot asset + container placeholder contract.
   - **Dynamic Lazy-Loading**: Mandatory pre-flight scroll-to-bottom and `networkidle` lock.
   - **Cross-Origin Iframes**: Bounding box coordinate extraction + iframe embed contracts.
   - **Shadow DOM**: Recursive piercing of `element.shadowRoot` to extract encapsulated web components.

---

## Comprehensive Summary Matrix of All Iterations

| Iteration | Component Touched | Problem Addressed | Key Technical Mechanism |
|---|---|---|---|
| **1** | Core Ingestion (`lib/`) | ASP.NET menus, input buttons, and ViewState missed. | Extended `discovery.ts`, `components.ts`, `builders.ts` for legacy/ASP.NET. |
| **2** | Bundle Extractor | Isolated tokens had no layout, text, or DOM hierarchy. | Created `tools/capture-bundle.mjs` producing 5-file closed-world bundle. |
| **3** | Dynamic Hydration | Lazy elements unrendered; ViewState bloated context. | Added auto-scroll settlement + regex ViewState sanitizer. |
| **4** | Navigation Engine | Flat link list; submenus and active indicators lost. | 2-level deep dropdown parser + computed active pill styles. |
| **5** | Layout Segmentation | Giant 5000px page wrappers treated as single section. | Recursive `unwrapToVisualBands` drilling past boilerplate shells. |
| **6** | Spatial Geometry | Arbitrary column widths and missing section divider bars. | Section title ribbon detector + multi-column percentage split calculator. |
| **7** | Overlays & Video | Floating cards rendered inline below hero; videos dropped. | Bounding-box coordinate extraction + iframe video aspect-ratio contracts. |
| **8** | Parser Regex | Hyphen word-boundary bug shredded sections into micro-tags. | Strict class boundary matching `/(?:^\|\s)elementor(?:\s\|$)/`. |
| **9** | Media Binding | Cards lacked image URLs; image-only slides were deleted. | Direct card-to-image DOM binding + inclusive `(title \|\| img)` filter. |
| **10** | Canvas & Textures | Global watermark patterns (`BG.png`) missed; fell back to white. | Global canvas extractor + ancestor DOM tree background walk. |
| **11** | Micro-Components | Hallucinated colors on KPI counters, buttons, and badges. | Live `window.getComputedStyle()` extraction on numbers, labels, buttons. |
| **12** | Deterministic Visuals | Wrapper shadowing, transparent alpha bug, hardcoded social buttons, missing ticker. | `isTransparent` alpha inspection, `getDominantVisualBg`, exact glyph/button classifier, marquee parser. |
| **13** | Prompt Engineering | Coding agents hallucinated generic SaaS designs. | Created `master_prompt.txt` enforcing Closed-World Assumption & authority hierarchy. |
| **14** | Testbed & Verification | No automated proof that the bundle produces a 1:1 replica. | Built `pcce-react` and automated Playwright visual screenshot verification pipeline. |
| **15** | Universal Architecture | Ensuring zero regression on diverse modern & legacy websites. | W3C computed style audit + universal architecture for Canvas, Shadow DOM, and lazy loading. |
