#!/usr/bin/env node
/**
 * Interactive Authentication Session Helper for Dembrandt
 *
 * Opens a visible browser for you to log in, complete 2FA or menu navigations,
 * and saves your session (cookies + localStorage) to a storageState JSON file.
 *
 * Usage:
 *   node tools/auth-login.mjs <start-url> [--save <output-file>]
 *   npm run login -- <start-url> [--save <output-file>]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as readline from 'node:readline';
import { loadBrowserEngines } from '../dist/lib/browser.js';

const rawArgs = process.argv.slice(2);

let savePath = 'auth.json';
const saveIndex = rawArgs.findIndex(a => a === '--save' || a === '-o');
if (saveIndex !== -1 && rawArgs[saveIndex + 1]) {
  savePath = rawArgs[saveIndex + 1];
} else {
  const saveArg = rawArgs.find(a => a.startsWith('--save='));
  if (saveArg) savePath = saveArg.split('=')[1];
}

let startUrl = null;
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--save' || arg === '-o') {
    i++;
    continue;
  }
  if (!arg.startsWith('--')) {
    startUrl = arg;
    break;
  }
}

if (!startUrl) {
  console.log(`\nUsage: npm run login -- <start-url> [--save <file.json>]`);
  console.log(`Example: npm run login -- https://gainwell/home --save auth.json\n`);
  process.exit(1);
}

if (!/^https?:\/\//i.test(startUrl)) {
  startUrl = 'https://' + startUrl;
}

const resolvedSavePath = resolve(process.cwd(), savePath);
mkdirSync(dirname(resolvedSavePath), { recursive: true });

function waitForEnter(promptMessage) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolvePrompt) => {
    rl.question(promptMessage, () => {
      rl.close();
      resolvePrompt();
    });
  });
}

async function main() {
  console.log(`\n=======================================================`);
  console.log(`🔑 Dembrandt Interactive Authentication Session Login`);
  console.log(`🌐 Navigating to: ${startUrl}`);
  console.log(`💾 Will save session to: ${resolvedSavePath}`);
  console.log(`=======================================================\n`);

  const { chromium } = await loadBrowserEngines();
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    console.log(`  → Opening ${startUrl} in browser...`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    console.warn(`  ! Note on initial navigation: ${err.message}`);
  }

  console.log(`\n👉 Browser window is open!`);
  console.log(`   1. Navigate to the login menu and enter your credentials.`);
  console.log(`   2. Complete sign-in (and verify you are on an authenticated screen).`);
  console.log(`   3. Return to this terminal and press [ENTER] when ready.\n`);

  await waitForEnter(`Press [ENTER] after you have logged in to capture the session... `);

  console.log(`\n⏳ Capturing authentication state (cookies & storage)...`);
  
  // Extract storageState (cookies & localStorage)
  const state = await context.storageState();

  // Also collect sessionStorage from all pages in case the app uses sessionStorage for tokens
  const originsWithSessionStorage = [];
  for (const p of context.pages()) {
    try {
      const pUrl = p.url();
      if (!pUrl || pUrl.startsWith('about:')) continue;
      const origin = new URL(pUrl).origin;
      const entries = await p.evaluate(() => {
        const out = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) out.push({ name: key, value: window.sessionStorage.getItem(key) || '' });
        }
        return out;
      });
      if (entries.length > 0) {
        originsWithSessionStorage.push({ origin, sessionStorage: entries });
      }
    } catch {}
  }

  const finalState = {
    cookies: state.cookies || [],
    origins: state.origins || [],
    sessionStorage: originsWithSessionStorage,
  };

  writeFileSync(resolvedSavePath, JSON.stringify(finalState, null, 2), 'utf8');

  console.log(`\n✅ Successfully saved authentication session!`);
  console.log(`   File: ${resolvedSavePath}`);
  console.log(`   Cookies captured: ${finalState.cookies.length}`);
  console.log(`   Storage origins:  ${finalState.origins.length}`);

  await browser.close();

  console.log(`\n=======================================================`);
  console.log(`🚀 Next Step: Capture the authenticated replica bundle!`);
  console.log(`Run:`);
  console.log(`   npm run capture -- <TARGET_PAGE_URL> --auth "${savePath}" --slow`);
  console.log(`=======================================================\n`);
}

main().catch((err) => {
  console.error(`\n❌ Error during login session capture:`, err);
  process.exit(1);
});

