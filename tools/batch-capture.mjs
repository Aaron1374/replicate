#!/usr/bin/env node
/**
 * Batch & Guarded-Crawl Bundle Extractor for Dembrandt
 *
 * Supports two modes:
 * 1. Curated List: Captures bundles for a list of URLs (or a urls.txt file).
 * 2. Guarded Crawler: Automatically discovers internal links from a starting page
 *    while safely blocking logout, destructive actions, and non-HTML assets.
 *
 * Each page is saved into its own isolated directory:
 *   output/<domain>/<page-slug>/bundle/
 *
 * Usage:
 *   npm run batch -- urls.txt --auth auth.json --slow
 *   npm run batch -- https://site/page1 https://site/page2 --auth auth.json --slow
 *   npm run batch -- https://site/home --crawl 5 --auth auth.json --slow
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadBrowserEngines } from '../dist/lib/browser.js';

const rawArgs = process.argv.slice(2);

// Parse flags
let authFile = null;
const authIndex = rawArgs.findIndex(a => a === '--auth' || a === '--cookie-file');
if (authIndex !== -1 && rawArgs[authIndex + 1]) {
  authFile = rawArgs[authIndex + 1];
} else {
  const authArg = rawArgs.find(a => a.startsWith('--auth=') || a.startsWith('--cookie-file='));
  if (authArg) authFile = authArg.split('=')[1];
}

const isSlow = rawArgs.includes('--slow');
const isMobile = rawArgs.includes('--mobile');

let crawlLimit = null;
const crawlIndex = rawArgs.findIndex(a => a === '--crawl');
if (crawlIndex !== -1) {
  const nextVal = rawArgs[crawlIndex + 1];
  if (nextVal && !nextVal.startsWith('--') && !isNaN(Number(nextVal))) {
    crawlLimit = parseInt(nextVal, 10);
  } else {
    crawlLimit = 5; // Default max 5 pages if not specified
  }
}

// Extract targets (URLs or filenames)
const targets = [];
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--auth' || arg === '--cookie-file') {
    i++;
    continue;
  }
  if (arg === '--crawl') {
    const nextVal = rawArgs[i + 1];
    if (nextVal && !nextVal.startsWith('--') && !isNaN(Number(nextVal))) i++;
    continue;
  }
  if (!arg.startsWith('--')) {
    targets.push(arg);
  }
}

if (targets.length === 0) {
  console.log(`\nUsage:`);
  console.log(`  1. From a file:    npm run batch -- urls.txt [--auth auth.json] [--slow]`);
  console.log(`  2. Multiple URLs:  npm run batch -- <url1> <url2> [--auth auth.json] [--slow]`);
  console.log(`  3. Guarded crawl:  npm run batch -- <start-url> --crawl 5 [--auth auth.json] [--slow]\n`);
  process.exit(1);
}

// Resolve list of initial URLs
let urlsToCapture = [];
for (const target of targets) {
  if (existsSync(target) && !/^https?:\/\//i.test(target)) {
    const content = readFileSync(target, 'utf8');
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    urlsToCapture.push(...lines);
  } else {
    let u = target;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    urlsToCapture.push(u);
  }
}

// Clean and deduplicate
urlsToCapture = Array.from(new Set(urlsToCapture.map(u => normalizeUrl(u))));

const DANGEROUS_PATTERNS = [
  /log[-_]?out/i,
  /sign[-_]?out/i,
  /exit/i,
  /auth/i,
  /delete/i,
  /remove/i,
  /cancel/i,
  /destroy/i,
  /download/i,
  /export/i,
  /\.(pdf|zip|xlsx|xls|csv|docx|doc|exe|tar|gz|mp4|png|jpg|jpeg|gif|svg)$/i,
  /javascript:/i,
  /mailto:/i,
  /tel:/i,
];

function isSafeUrl(urlStr, baseHost) {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== baseHost && !u.hostname.endsWith('.' + baseHost)) return false;
    for (const pat of DANGEROUS_PATTERNS) {
      if (pat.test(u.pathname) || pat.test(u.search)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = ''; // Strip hash anchors (#section)
    return u.toString();
  } catch {
    return urlStr;
  }
}

function getSlug(urlStr) {
  try {
    const u = new URL(urlStr);
    let path = u.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
    return path || 'root';
  } catch {
    return 'page';
  }
}

async function discoverLinks(startUrl, authPath, maxLinks) {
  console.log(`\n🔎 [Guarded Crawler] Discovering safe links on ${startUrl}...`);
  const { chromium } = await loadBrowserEngines();
  const browser = await chromium.launch({ headless: true });
  
  const ctxOpts = {
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  };
  if (authPath && existsSync(authPath)) {
    ctxOpts.storageState = resolve(process.cwd(), authPath);
  }
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  const baseHost = new URL(startUrl).hostname;
  const discovered = new Set([startUrl]);

  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const hrefs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(Boolean);
    });

    for (const href of hrefs) {
      const norm = normalizeUrl(href);
      if (isSafeUrl(norm, baseHost) && !discovered.has(norm)) {
        discovered.add(norm);
        if (discovered.size >= maxLinks) break;
      }
    }
  } catch (err) {
    console.warn(`  ! Link discovery warning: ${err.message}`);
  } finally {
    await browser.close();
  }

  return Array.from(discovered);
}

async function main() {
  if (crawlLimit && urlsToCapture.length > 0) {
    const startUrl = urlsToCapture[0];
    const crawled = await discoverLinks(startUrl, authFile, crawlLimit);
    urlsToCapture = crawled;
  }

  console.log(`\n=======================================================`);
  console.log(`📋 Dembrandt Batch Capture Queue (${urlsToCapture.length} page(s)):`);
  urlsToCapture.forEach((u, i) => console.log(`   [${i + 1}/${urlsToCapture.length}] ${u}`));
  console.log(`=======================================================\n`);

  let successCount = 0;
  for (let i = 0; i < urlsToCapture.length; i++) {
    const pageUrl = urlsToCapture[i];
    const u = new URL(pageUrl);
    const domain = u.hostname.replace(/^www\./, '');
    const slug = getSlug(pageUrl);
    const targetOutputDir = join('output', domain, slug, 'bundle');

    console.log(`\n-------------------------------------------------------`);
    console.log(`🚀 [${i + 1}/${urlsToCapture.length}] Capturing: ${pageUrl}`);
    console.log(`📁 Destination: ${targetOutputDir}`);
    console.log(`-------------------------------------------------------`);

    const flags = [];
    if (authFile) flags.push(`--auth "${authFile}"`);
    if (isSlow) flags.push('--slow');
    if (isMobile) flags.push('--mobile');
    flags.push(`--output-dir "${targetOutputDir}"`);

    try {
      execSync(`node tools/capture-bundle.mjs "${pageUrl}" ${flags.join(' ')}`, {
        stdio: 'inherit',
      });
      successCount++;
    } catch (err) {
      console.error(`\n❌ Failed to capture ${pageUrl}: ${err.message}\n`);
    }
  }

  console.log(`\n=======================================================`);
  console.log(`🏁 Batch capture complete: ${successCount}/${urlsToCapture.length} succeeded!`);
  console.log(`=======================================================\n`);
}

main().catch(err => {
  console.error(`❌ Batch error:`, err);
  process.exit(1);
});

