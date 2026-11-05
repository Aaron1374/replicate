# Quick Setup & Run Guide: Deterministic 1:1 Web Replica Engine

This guide walks any new engineer or contributor through the end-to-end workflow: capturing an offline design bundle from any website, generating a deterministic 1:1 pixel-accurate replica, and running/verifying the replica locally.

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Initial Setup (One-Time)](#2-initial-setup-one-time)
3. [Step 1: Capture an Offline 5-File Bundle](#3-step-1-capture-an-offline-5-file-bundle)
4. [Step 2: Build the 1:1 Replica using the Master Prompt](#4-step-2-build-the-11-replica-using-the-master-prompt)
5. [Step 3: Run & Preview the Replicas Locally](#5-step-3-run--preview-the-replicas-locally)
6. [Step 4: Automated Visual Verification](#6-step-4-automated-visual-verification)
7. [Troubleshooting & Pro Tips](#7-troubleshooting--pro-tips)

---

## 1. Prerequisites

Before starting, ensure you have:
- **Node.js**: version `18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **npm**: version `9.0.0` or higher (bundled with Node.js)
- Supported OS: Windows (PowerShell/CMD), macOS, or Linux

Verify your installation:
```bash
node -v
npm -v
```

---

## 2. Initial Setup (One-Time)

Navigate to the `dembrandt` root directory and install dependencies:

```bash
cd dembrandt
npm install
```

Install the required Playwright Chromium browser binary:
```bash
npx playwright install chromium
```

Compile TypeScript source files:
```bash
npm run build
```

---

## 3. Step 1: Capture an Offline 5-File Bundle

The extractor launches headless Chromium at 1920×1080, handles dynamic hydration, auto-scrolls to trigger lazy elements, sanitizes framework bloat (like ASP.NET ViewState), and saves a self-contained **5-File Replica Bundle**.

### Running the Extractor

```bash
# Standard capture
npm run capture -- <TARGET_URL>

# Recommended for heavy/ASP.NET/AJAX sites (adds extra settlement time)
npm run capture -- <TARGET_URL> --slow
```

### Examples

**DevExpress ASP.NET CardView Demo:**
```bash
npm run capture -- https://demos.devexpress.com/ASPxCardViewDemos/Default.aspx --slow
```

**Padre Conceicao College of Engineering (PCCE):**
```bash
npm run capture -- https://pccegoa.edu.in/ --slow
```

### What Gets Generated
All output files are saved under `output/<domain>/bundle/`:

| File | Purpose | Authority Level |
|---|---|---|
| **`REPLICA_GUIDE.md`** | Band-by-band spatial contracts, ribbons, split ratios, and layout blueprint | **Priority 1** (Highest) |
| **`DESIGN.md`** | W3C/Google design tokens (colors, typography, radii, spacing, shadows) | **Priority 2** |
| **`content.md`** | Verbatim text copy, navigation trees, and media asset URLs | **Priority 3** |
| **`screenshot.png`** | 1920×1080 full-page visual ground truth for pixel cross-checking | **Priority 4** |
| **`rendered.html`** | Cleaned, hydrated DOM snapshot with ViewState sanitized | **Priority 5** |

---

## 4. Step 2: Build the 1:1 Replica using the Master Prompt

Once a bundle is captured, an AI coding agent (or human developer) constructs the replica under a **Strict Closed-World Assumption**:

1. Open [`dembrandt/master_prompt.txt`](./master_prompt.txt).
2. Copy the prompt and point your coding agent to the generated bundle folder, e.g.:
   ```text
   @output/demos.devexpress.com/bundle
   [Paste contents of master_prompt.txt here]
   ```
3. **Core Rules Enforced**:
   - **Zero Invented Copy**: Use only exact copy and media URLs cataloged in `content.md`.
   - **No Generic Templates**: Follow the section flow in `REPLICA_GUIDE.md`.
   - **Strict Micro-Components**: Exact button pill radii, active navigation pills, and overlay positions.

---

## 5. Step 3: Run & Preview the Replicas Locally

Each replica project contains its own standalone structure and server.

### A. DevExpress Replica (`devexpress-replica/`)

```bash
cd ../devexpress-replica
npm start
```
Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

Features to test:
- **Interactive Tree Navigation**: Click any category with an arrow to expand/collapse submenus.
- **Search Demos**: Type into the sidebar search bar to filter demos in real-time.
- **Video Overlay**: Hover over the overview card to see the orange play button hover interaction.

### B. PCCE Replica (`pcce-replica/` or `pcce-react/`)

```bash
# Static HTML replica
cd ../pcce-replica
# Double click index.html or serve using any static server:
npx --yes serve .

# React + Vite replica
cd ../pcce-react
npm install
npm run dev
```

---

## 6. Step 4: Automated Visual Verification

To verify that your replica is a true 1:1 match against the original ground truth screenshot:

1. Ensure the replica server is running (`http://localhost:3000`).
2. Run the headless verification capture script from the `dembrandt` folder:
   ```bash
   cd dembrandt
   node scratch/capture_localhost.mjs
   ```
3. This captures `devexpress-replica/replica_verify.png` at 1920×1080.
4. Compare side-by-side:
   - Original Ground Truth: `output/demos.devexpress.com/bundle/screenshot.png`
   - Rendered Replica: `devexpress-replica/replica_verify.png`

---

## 7. Troubleshooting & Pro Tips

- **Playwright Browser Missing?**
  Run: `npx playwright install chromium`
- **Page Not Settling or Elements Missing in Capture?**
  Add the `--slow` flag: `npm run capture -- <URL> --slow`. This grants additional hydration, networkidle wait, and auto-scroll settlement time.
- **Port 3000 in Use?**
  Edit `const PORT = 3000;` at the top of `devexpress-replica/server.js` to any open port (e.g. `3001` or `5173`).
- **Need to Rebuild TypeScript?**
  If you modify any files in `lib/` or `tools/`, run `npm run build` in `dembrandt`.
