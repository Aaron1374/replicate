import { join } from 'node:path';
import { loadBrowserEngines } from '../dist/lib/browser.js';

async function main() {
  try {
    console.log('🌐 Launching Chromium at 1920x1080...');
    const { chromium } = await loadBrowserEngines();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    console.log('📸 Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(1000);

    const targetPath = join(process.cwd(), '..', 'devexpress-replica', 'replica_verify.png');
    console.log('💾 Capturing full-page screenshot to:', targetPath);
    await page.screenshot({ path: targetPath, fullPage: true });

    await browser.close();
    console.log('✅ Visual verification screenshot saved to devexpress-replica/replica_verify.png');
  } catch (err) {
    console.error('❌ Verification capture error:', err);
  }
}

main();
