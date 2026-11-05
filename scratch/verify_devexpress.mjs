import http from 'node:http';
import fs from 'node:fs';
import { join, extname } from 'node:path';
import { loadBrowserEngines } from '../dist/lib/browser.js';

const targetDir = join(process.cwd(), '..', 'devexpress-replica');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = join(targetDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexPath = join(targetDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexPath).pipe(res);
  }
});

server.listen(5188, async () => {
  console.log('🚀 Static server running on http://localhost:5188 serving:', targetDir);

  try {
    console.log('🌐 Launching Chromium at 1920x1080...');
    const { chromium } = await loadBrowserEngines();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    console.log('📸 Navigating to http://localhost:5188 ...');
    await page.goto('http://localhost:5188', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for fonts & images
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(1000);

    const targetPath = join(targetDir, 'replica_verify.png');
    console.log('💾 Capturing full-page screenshot to:', targetPath);
    await page.screenshot({ path: targetPath, fullPage: true });

    await browser.close();
    console.log('✅ Screenshot successfully captured to devexpress-replica/replica_verify.png!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
