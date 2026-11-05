#!/usr/bin/env node
/**
 * Deterministic Website & Design System Capture Tool
 *
 * Uses Playwright + Dembrandt to deterministically extract:
 * 1. DESIGN.md       -> W3C/Google design tokens (colors, typography, spacing, radii, components)
 * 2. content.md      -> Complete hierarchical content, navigation dropdowns, section-by-section layout flow, tables, and forms
 * 3. REPLICA_GUIDE.md-> Master implementation blueprint for AI agents (HTML skeleton, CSS rules, exact section layouts)
 * 4. rendered.html   -> Clean, hydrated DOM snapshot with sanitized ASP.NET ViewState
 * 5. screenshot.png  -> High-resolution full-page visual reference
 *
 * Optimized for modern sites AND legacy ASP.NET / ASPX WebForms websites.
 *
 * Usage:
 *   node tools/capture-bundle.mjs <url> [--slow] [--mobile]
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadBrowserEngines } from '../dist/lib/browser.js';

let rawArgs = process.argv.slice(2);
let targetUrl = rawArgs.find(a => !a.startsWith('--'));

if (!targetUrl) {
  console.error("Usage: node tools/capture-bundle.mjs <url> [--slow] [--mobile]");
  process.exit(1);
}

if (!/^https?:\/\//i.test(targetUrl)) {
  targetUrl = "https://" + targetUrl;
}

const isSlow = rawArgs.includes('--slow');
const isMobile = rawArgs.includes('--mobile');

const domain = new URL(targetUrl).hostname.replace(/^www\./, '');
const outputDir = join(process.cwd(), 'output', domain, 'bundle');
mkdirSync(outputDir, { recursive: true });

console.log(`\n=======================================================`);
console.log(`📦 Deterministic Exact-Replica Capture for: ${targetUrl}`);
console.log(`📁 Target bundle directory: ${outputDir}`);
console.log(`⚙️ Mode: ${isMobile ? 'Mobile' : 'Desktop'} (1920x1080) | ASP.NET & Legacy Ready`);
console.log(`=======================================================\n`);

// 1. Run Dembrandt CLI to generate DESIGN.md
console.log(`[1/5] Extracting design tokens via Dembrandt...`);
try {
  const flags = ['--design-md', '--no-headed-fallback'];
  if (isSlow) flags.push('--slow');
  if (isMobile) flags.push('--mobile');

  execSync(`node dist/index.js "${targetUrl}" ${flags.join(' ')}`, { stdio: 'ignore' });
  const rootDesignMd = join(process.cwd(), 'output', domain, 'DESIGN.md');
  if (existsSync(rootDesignMd)) {
    const tokens = readFileSync(rootDesignMd, 'utf8');
    writeFileSync(join(outputDir, 'DESIGN.md'), tokens, 'utf8');
    console.log(`  ✓ Saved DESIGN.md`);
  }
} catch (err) {
  console.warn(`  ! Note on token extraction:`, err.message);
}

// 2. Launch Playwright with ASP.NET & Legacy compatibility
console.log(`[2/5] Launching Playwright to render and hydrate DOM...`);
const { chromium } = await loadBrowserEngines();
const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({
  viewport: isMobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
  isMobile: isMobile,
  ignoreHTTPSErrors: true, // Essential for ASPX/intranet/legacy SSL certs
  userAgent: isMobile
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
  }
});

const page = await context.newPage();

try {
  const navTimeout = isSlow ? 60000 : 40000;
  console.log(`  → Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
  
  try { 
    await page.waitForLoadState('networkidle', { timeout: isSlow ? 20000 : 10000 }); 
  } catch {}

  // ASP.NET AJAX PostBack & Settlement Check
  await page.waitForFunction(() => {
    const prm = window?.Sys?.WebForms?.PageRequestManager?.getInstance?.();
    return !prm || !prm.get_isInAsyncPostBack();
  }, { timeout: 6000 }).catch(() => {});

  // Font loading settlement
  await page.evaluate(() => document.fonts?.ready).catch(() => {});

  // Adaptive auto-scroll to trigger lazy loading, ASPX controls, and animations
  console.log(`  → Scrolling page to trigger lazy-loaded sections...`);
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 350;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight || totalHeight > 14000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 80);
    });
  });
  await page.waitForTimeout(1000);

  // 3. Capture full-page screenshot
  console.log(`[3/5] Capturing full-page screenshot...`);
  const screenshotPath = join(outputDir, 'screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  ✓ Saved screenshot.png`);

  // 4. Capture rendered DOM and sanitize ASPX ViewState
  console.log(`[4/5] Capturing clean rendered DOM...`);
  const rawHtml = await page.content();
  const cleanedHtml = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    // Sanitize huge ASP.NET __VIEWSTATE, __EVENTVALIDATION, etc. to prevent bloating token contexts
    .replace(/(<input[^>]+name="__(?:VIEWSTATE|EVENTVALIDATION|VIEWSTATEGENERATOR|EVENTTARGET|EVENTARGUMENT|PREVIOUSPAGE)"[^>]+value=")[^"]+(")/gi, '$1[ASP.NET_VIEWSTATE_SANITIZED]$2')
    .replace(/(<input[^>]+value=")[^"]+("[^>]+name="__(?:VIEWSTATE|EVENTVALIDATION|VIEWSTATEGENERATOR|EVENTTARGET|EVENTARGUMENT|PREVIOUSPAGE)")/gi, '$1[ASP.NET_VIEWSTATE_SANITIZED]$2');

  writeFileSync(join(outputDir, 'rendered.html'), cleanedHtml, 'utf8');
  console.log(`  ✓ Saved rendered.html (sanitized of scripts & ASP.NET ViewState bloat)`);

  // 5. Deep In-DOM Extraction for Exact Replicas
  console.log(`[5/5] Extracting deep layout, navigation, section, and form hierarchy...`);
  const pageData = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      );
    };

    const cleanText = (str) => {
      if (!str) return '';
      return str.replace(/\s+/g, ' ').trim();
    };

    // Metadata & Google Fonts
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const fontLinks = Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"], link[rel="stylesheet"][href*="font"]'))
      .map(l => l.href);

    // ASP.NET Detection
    const isAspNet = Boolean(
      document.querySelector('#__VIEWSTATE, #__EVENTVALIDATION, [name*="ctl00"], form[action*=".aspx"]') ||
      Array.from(document.scripts || []).some(s => s.src && /WebResource\.axd|ScriptResource\.axd/i.test(s.src))
    );

    // 1. Hierarchical Navigation Extraction (supporting standard nav, ASP.NET Menu, table menus)
    const navTrees = [];
    const activeNavStyles = { text: '', bg: '', color: '', radius: '' };
    const navCandidates = Array.from(document.querySelectorAll(`
      nav,
      header,
      [role="navigation"],
      .nav,
      .navbar,
      .menu,
      .aspNetMenu,
      table.menu,
      [id*="Menu"],
      [id*="Nav"],
      [id*="TopMenu"]
    `)).filter(el => isVisible(el) && el.querySelectorAll('a').length >= 2);

    const seenNavLinks = new Set();

    navCandidates.slice(0, 3).forEach(navContainer => {
      const topItems = Array.from(navContainer.querySelectorAll('ul > li, table > tbody > tr > td, .nav-item, .menu-item'))
        .filter(item => {
          const parentItem = item.parentElement?.closest('li, td, .nav-item, .menu-item');
          return !parentItem;
        });

      topItems.forEach(topItem => {
        const primaryLink = topItem.querySelector(':scope > a, :scope > span > a, :scope > table a, a');
        if (!primaryLink) return;
        const text = cleanText(primaryLink.innerText || primaryLink.textContent);
        const href = primaryLink.href || '#';
        if (!text || text.length > 50) return;

        const isCurrent = Boolean(
          topItem.classList.contains('current-menu-item') ||
          topItem.classList.contains('active') ||
          primaryLink.classList.contains('active') ||
          topItem.classList.contains('rmp-menu-current-item')
        );

        if (isCurrent && !activeNavStyles.text) {
          const s = window.getComputedStyle(primaryLink);
          const itemStyle = window.getComputedStyle(topItem);
          activeNavStyles.text = text;
          activeNavStyles.bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : itemStyle.backgroundColor;
          activeNavStyles.color = s.color;
          activeNavStyles.radius = s.borderRadius !== '0px' ? s.borderRadius : itemStyle.borderRadius;
        }

        const key = `${text}|${href}`;
        if (seenNavLinks.has(key)) return;
        seenNavLinks.add(key);

        const childLinks = [];
        const submenu = topItem.querySelector('ul, .dropdown-menu, .sub-menu, div.dropdown, table');
        if (submenu) {
          Array.from(submenu.querySelectorAll('a')).forEach(subLink => {
            const subText = cleanText(subLink.innerText || subLink.textContent);
            const subHref = subLink.href || '#';
            if (subText && subText.length < 60 && subText !== text) {
              childLinks.push({ text: subText, href: subHref });
            }
          });
        }

        navTrees.push({
          text,
          href,
          isCurrent,
          hasDropdown: childLinks.length > 0,
          children: childLinks.slice(0, 25)
        });
      });
    });

    if (navTrees.length === 0) {
      Array.from(document.querySelectorAll('nav a, header a, .header a, .top-bar a'))
        .filter(isVisible)
        .slice(0, 30)
        .forEach(a => {
          const text = cleanText(a.innerText || a.textContent);
          if (text && text.length < 50 && !seenNavLinks.has(text)) {
            seenNavLinks.add(text);
            navTrees.push({ text, href: a.href, isCurrent: false, hasDropdown: false, children: [] });
          }
        });
    }

    const isTransparent = (colorStr) => {
      if (!colorStr) return true;
      if (colorStr === 'transparent') return true;
      return /rgba\([^)]*,\s*0(?:\.0+)?\)/i.test(colorStr);
    };

    // Header Social Links (Instagram, Facebook, YouTube, WhatsApp, etc.)
    const socialLinks = [];
    const socialAnchors = Array.from(document.querySelectorAll('header a, [class*="header"] a, [class*="social"] a, .top-bar a'))
      .filter(isVisible);
    socialAnchors.forEach(a => {
      const href = a.href || '';
      const aria = a.getAttribute('aria-label') || '';
      const title = a.getAttribute('title') || '';
      const cls = a.className || '';
      const text = cleanText(a.innerText);
      const combined = `${href} ${aria} ${title} ${cls} ${text}`.toLowerCase();
      
      let platform = null;
      if (combined.includes('facebook')) platform = 'Facebook';
      else if (combined.includes('instagram')) platform = 'Instagram';
      else if (combined.includes('youtube')) platform = 'YouTube';
      else if (combined.includes('whatsapp') || combined.includes('wa.me')) platform = 'WhatsApp';
      else if (combined.includes('twitter') || combined.includes('x.com')) platform = 'Twitter / X';
      else if (combined.includes('linkedin')) platform = 'LinkedIn';

      if (platform && !socialLinks.some(s => s.platform === platform)) {
        const s = window.getComputedStyle(a);
        const iconEl = a.querySelector('i, svg, img, span');
        const iconStyle = iconEl ? window.getComputedStyle(iconEl) : null;
        const effectiveColor = iconStyle && !isTransparent(iconStyle.color) ? iconStyle.color : s.color;
        const isCircle = parseInt(s.borderRadius, 10) >= 16;
        const isGlyphOnly = isTransparent(s.backgroundColor);

        socialLinks.push({
          platform,
          href,
          bg: isGlyphOnly ? 'transparent' : s.backgroundColor,
          color: effectiveColor,
          radius: s.borderRadius,
          isGlyphOnly,
          isCircle: !isGlyphOnly && isCircle
        });
      }
    });

    // Live Marquee / Ticker Strip Detection
    const tickerEl = document.querySelector('marquee, .ticker, [class*="ticker"], [class*="marquee"], [id*="ticker"], [id*="marquee"]');
    let tickerData = null;
    if (tickerEl && isVisible(tickerEl)) {
      const tStyle = window.getComputedStyle(tickerEl);
      const parentEl = tickerEl.closest('.elementor-section, .elementor-widget-container, div') || tickerEl.parentElement;
      const parentStyle = parentEl ? window.getComputedStyle(parentEl) : tStyle;
      const tItems = Array.from(tickerEl.querySelectorAll('a, span, li, p'))
        .map(el => cleanText(el.innerText))
        .filter(t => t.length > 4 && t.length < 80);
      
      const prefixEl = parentEl?.querySelector('strong, b, .badge, [class*="label"], [class*="title"]') || tickerEl.querySelector('strong');
      const prefix = cleanText(prefixEl?.innerText || 'Newsline');
      
      const bg = !isTransparent(tStyle.backgroundColor)
        ? tStyle.backgroundColor
        : (!isTransparent(parentStyle.backgroundColor) ? parentStyle.backgroundColor : 'transparent');

      tickerData = {
        prefix,
        items: Array.from(new Set(tItems)).slice(0, 10),
        bg,
        color: tStyle.color || '#000000'
      };
    }

    // 2. Robust Visual Band & Section Discovery Engine
    const totalDocHeight = document.documentElement.scrollHeight || document.body.scrollHeight;

    // Global Page Background (HTML / Body / Root Container)
    const bodyStyle = window.getComputedStyle(document.body);
    const htmlStyle = window.getComputedStyle(document.documentElement);
    let globalBgColor = !isTransparent(bodyStyle.backgroundColor) && bodyStyle.backgroundColor !== 'rgb(255, 255, 255)'
      ? bodyStyle.backgroundColor
      : (!isTransparent(htmlStyle.backgroundColor) ? htmlStyle.backgroundColor : '#ffffff');
    let globalBgImage = '';
    const bodyBgMatch = (bodyStyle.backgroundImage || '').match(/url\(['"]?([^'"]+)['"]?\)/);
    const htmlBgMatch = (htmlStyle.backgroundImage || '').match(/url\(['"]?([^'"]+)['"]?\)/);
    if (bodyBgMatch) globalBgImage = bodyBgMatch[1];
    else if (htmlBgMatch) globalBgImage = htmlBgMatch[1];
    else {
      const topWrap = document.querySelector('#page, #outer-wrap, .site, #wrapper, main, #main, .site-content');
      if (topWrap) {
        const wrapStyle = window.getComputedStyle(topWrap);
        const wrapBgMatch = (wrapStyle.backgroundImage || '').match(/url\(['"]?([^'"]+)['"]?\)/);
        if (wrapBgMatch) globalBgImage = wrapBgMatch[1];
      }
    }
    const globalBackground = {
      color: globalBgColor,
      image: globalBgImage
    };

    function unwrapToVisualBands(container) {
      const list = [];
      const children = Array.from(container.children).filter(isVisible);

      for (const child of children) {
        const rect = child.getBoundingClientRect();
        const tag = child.tagName.toLowerCase();
        const id = child.id ? `#${child.id}` : '';
        const cls = typeof child.className === 'string' ? child.className : '';
        const sig = `${id} ${cls} ${tag}`;

        const isProtected = (
          cls.includes('n2-section-smartslider') ||
          tag === 'header' ||
          tag === 'footer' ||
          tag === 'nav' ||
          cls.includes('ekit-template-content-header') ||
          cls.includes('ekit-template-content-footer')
        );

        // Standalone wrapper containers that should be unpacked into their children
        const isWrapperClass = (
          /(?:outer-wrap|site-content|site-main|site clr|aspnetForm|__next|page-wrap|site-wrap|entry-content)/i.test(sig) ||
          /(?:^|\s)(?:elementor|elementor-inner|elementor-section-wrap)(?:\s|$)/.test(cls)
        );

        const isWrapper = !isProtected && (
          isWrapperClass ||
          (rect.height > totalDocHeight * 0.35 && child.children.length > 0)
        );

        if (isWrapper && child.children.length > 0) {
          list.push(...unwrapToVisualBands(child));
        } else if (rect.height >= 25 && rect.width >= 200) {
          list.push(child);
        }
      }
      return list;
    }

    const rawSectionNodes = unwrapToVisualBands(document.body);

    const getDominantVisualBg = (el) => {
      if (!el) return globalBgColor;
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;

      // If element itself has a distinct colored background
      if (!isTransparent(bg) && bg !== 'rgb(255, 255, 255)' && bg !== '#ffffff') {
        return bg;
      }

      // Check inner children (e.g. inner elementor-section or header content)
      const innerKids = Array.from(el.querySelectorAll(':scope > div, :scope > section, :scope > header, :scope > nav, .elementor-section, .elementor-top-section'));
      for (const kid of innerKids) {
        const ks = window.getComputedStyle(kid);
        if (!isTransparent(ks.backgroundColor) && ks.backgroundColor !== 'rgb(255, 255, 255)' && ks.backgroundColor !== '#ffffff') {
          return ks.backgroundColor;
        }
      }

      if (!isTransparent(bg)) return bg;

      // Check parent chain
      let curr = el.parentElement;
      while (curr && curr !== document.documentElement) {
        const ps = window.getComputedStyle(curr);
        if (!isTransparent(ps.backgroundColor) && ps.backgroundColor !== 'rgb(255, 255, 255)') return ps.backgroundColor;
        if (ps.backgroundImage && ps.backgroundImage !== 'none') {
          const match = ps.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (match) return `image: ${match[1]}`;
        }
        curr = curr.parentElement;
      }
      return globalBgImage ? `image: ${globalBgImage}` : globalBgColor;
    };

    // Analyze each visual band
    const analyzedBands = rawSectionNodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const tag = node.tagName.toLowerCase();
      const id = node.id ? `#${node.id}` : '';
      const className = typeof node.className === 'string' ? node.className.trim() : '';

      let bg = style.backgroundColor;
      let bgImg = '';
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        const match = style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match) bgImg = match[1];
      }

      // Headings (including node itself if it is a heading tag)
      const rawHeadings = (node.tagName.match(/^H[1-6]$/i) ? [node] : []).concat(Array.from(node.querySelectorAll('h1, h2, h3, h4, h5, h6')));
      const headings = rawHeadings
        .filter(isVisible)
        .map(h => ({ level: h.tagName.toLowerCase(), text: cleanText(h.innerText), width: Math.round(h.getBoundingClientRect().width) }))
        .filter(h => h.text.length > 0);

      // Paragraphs
      const textBlocks = Array.from(node.querySelectorAll('p, li, .lead, blockquote, .desc, .text'))
        .filter(isVisible)
        .map(t => cleanText(t.innerText))
        .filter(t => t.length > 15 && !t.includes('{') && !t.includes('function('));

      // Buttons / CTAs with exact computed styles
      const buttons = Array.from(node.querySelectorAll('button, a.btn, a.button, input[type="submit"], input[type="button"], a[role="button"], .htmega-button a, .elementor-button'))
        .filter(isVisible)
        .map(b => {
          const bStyle = window.getComputedStyle(b);
          const rawText = b.tagName === 'INPUT' ? b.value : b.innerText;
          return {
            text: cleanText(rawText),
            href: b.href || '',
            bg: bStyle.backgroundColor,
            color: bStyle.color,
            radius: bStyle.borderRadius,
            border: bStyle.border,
            padding: bStyle.padding
          };
        })
        .filter(b => b.text.length > 0 && b.text.length < 50);

      // Media / Images
      const images = Array.from(node.querySelectorAll('img'))
        .filter(isVisible)
        .map(img => ({
          src: img.currentSrc || img.src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        }))
        .filter(img => img.src && !img.src.startsWith('data:') && img.width > 20);

      // Video Frames
      const videos = Array.from(node.querySelectorAll('iframe, video, .elementor-video'))
        .filter(isVisible)
        .map(v => {
          const vr = v.getBoundingClientRect();
          return {
            src: v.src || v.getAttribute('src') || '',
            width: Math.round(vr.width),
            height: Math.round(vr.height)
          };
        });

      // Counters / KPI stats with exact computed typography & palette
      const counters = Array.from(node.querySelectorAll('.elementor-counter, [class*="counter"], [class*="stat"]'))
        .filter(isVisible)
        .map(c => {
          const numEl = c.querySelector('.elementor-counter-number, [class*="number"], [class*="digit"], [class*="value"]');
          const titleEl = c.querySelector('.elementor-counter-title, [class*="title"], [class*="label"]');
          const num = cleanText(numEl?.innerText || '');
          const label = cleanText(titleEl?.innerText || c.innerText);
          const cStyle = window.getComputedStyle(c);
          const numStyle = numEl ? window.getComputedStyle(numEl) : null;
          const labelStyle = titleEl ? window.getComputedStyle(titleEl) : null;
          const hasDecorativeArrows = Boolean(
            c.querySelector('[class*="arrow"], [class*="chevron"], [class*="icon"], i, svg') ||
            /«|»|︽|︾|\^/.test(c.innerText)
          );
          return {
            number: num || '',
            label,
            numberColor: numStyle?.color || cStyle.color,
            numberFontSize: numStyle?.fontSize || '75px',
            numberFontWeight: numStyle?.fontWeight || '600',
            labelColor: labelStyle?.color || cStyle.color,
            bg: isTransparent(cStyle.backgroundColor) ? 'transparent' : cStyle.backgroundColor,
            borderRadius: cStyle.borderRadius,
            hasDecorativeArrows
          };
        }).filter(c => c.number.length > 0);

      // Cards and Carousel Slides inside this band (bind image URLs directly)
      const cards = Array.from(node.querySelectorAll('.card, [class*="card"], .htmega-postcarousel-item, .elementor-widget-image-box, .slick-slide, [class*="slide"], .col, [class*="column"], .item'))
        .filter(isVisible)
        .map(c => {
          const title = cleanText(c.querySelector('h1, h2, h3, h4, h5, h6, .title, strong, [class*="title"]')?.innerText || '');
          const desc = cleanText(c.querySelector('p, .desc, .text')?.innerText || '');
          const imgEl = c.querySelector('img');
          let img = imgEl?.currentSrc || imgEl?.src || '';
          if (!img) {
            const bgStyle = window.getComputedStyle(c).backgroundImage;
            const match = bgStyle?.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (match) img = match[1];
          }
          const cStyle = window.getComputedStyle(c);
          const isSolidActionBox = Boolean(
            !img &&
            (cStyle.backgroundColor.includes('rgb(0, 0, 0)') || cStyle.backgroundColor.includes('#000000') || cStyle.backgroundColor.includes('#111'))
          );
          let imgAspect = 1.77;
          if (imgEl && imgEl.naturalHeight && imgEl.naturalWidth) {
            imgAspect = imgEl.naturalWidth / imgEl.naturalHeight;
          }
          const isPortraitPoster = Boolean(img && imgAspect < 0.85);

          return {
            title,
            desc: desc.slice(0, 120),
            img,
            isSolidActionBox,
            isPortraitPoster,
            bg: isTransparent(cStyle.backgroundColor) ? 'transparent' : cStyle.backgroundColor,
            border: cStyle.border,
            borderRadius: cStyle.borderRadius
          };
        }).filter(c => (c.title.length > 0 || c.img.length > 0 || c.isSolidActionBox) && c.title.length < 80);

      // Section Title Ribbon / Pill Detection
      const isRibbon = (
        rect.height <= 140 &&
        rect.width >= 500 &&
        headings.length >= 1 &&
        (textBlocks.length === 0 || (textBlocks.length === 1 && textBlocks[0] === headings[0].text)) &&
        images.length === 0 &&
        videos.length === 0
      );

      let ribbonDetails = null;
      if (isRibbon && rawHeadings[0]) {
        const rawH = rawHeadings[0];
        const hStyle = window.getComputedStyle(rawH);
        const hRect = rawH.getBoundingClientRect();
        const isPill = parseInt(hStyle.borderRadius, 10) > 4 || parseInt(style.borderRadius, 10) > 4;
        let ribBg = '#202020';
        if (!isTransparent(hStyle.backgroundColor)) ribBg = hStyle.backgroundColor;
        else if (!isTransparent(style.backgroundColor)) ribBg = style.backgroundColor;
        else {
          const p = rawH.closest('.elementor-widget-container, .elementor-section, [class*="ribbon"]') || node;
          const ps = window.getComputedStyle(p);
          if (!isTransparent(ps.backgroundColor)) ribBg = ps.backgroundColor;
        }

        ribbonDetails = {
          text: headings[0].text,
          bg: ribBg,
          color: hStyle.color || '#ffffff',
          borderRadius: hStyle.borderRadius !== '0px' ? hStyle.borderRadius : (style.borderRadius !== '0px' ? style.borderRadius : '4px'),
          isPill,
          width: Math.round(hRect.width),
          alignment: hStyle.textAlign || 'center'
        };
      }

      // Floating / Absolute Overlays & Hero Floating Card
      const overlays = [];
      const overlayCandidates = Array.from(node.querySelectorAll('*')).filter(el => {
        if (!isVisible(el)) return false;
        const s = window.getComputedStyle(el);
        const er = el.getBoundingClientRect();
        const isAbsolute = (s.position === 'absolute' || s.position === 'fixed');
        const hasDarkCardBg = /rgba\(0,\s*0,\s*0,\s*0\.[5-9]\)/.test(s.backgroundColor);
        return (isAbsolute || hasDarkCardBg) && er.width >= 250 && er.width <= 750 && er.height >= 80;
      });
      overlayCandidates.slice(0, 2).forEach(el => {
        const er = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        const btn = el.querySelector('a, button');
        let btnInfo = null;
        if (btn) {
          const bs = window.getComputedStyle(btn);
          btnInfo = {
            text: cleanText(btn.innerText),
            bg: bs.backgroundColor,
            color: bs.color,
            radius: bs.borderRadius,
            border: bs.border
          };
        }
        overlays.push({
          width: Math.round(er.width),
          height: Math.round(er.height),
          right: Math.round(rect.right - er.right),
          top: Math.round(er.top - rect.top),
          bg: s.backgroundColor,
          fontFamily: s.fontFamily,
          text: cleanText(el.innerText).slice(0, 150),
          button: btnInfo
        });
      });

      // Two-column split check
      const directCols = Array.from(node.querySelectorAll('.elementor-column, .col, [class*="column"], td'))
        .filter(c => isVisible(c) && (c.parentElement === node || c.parentElement?.parentElement === node) && c.getBoundingClientRect().height > 50);

      let splitRatio = null;
      if (directCols.length === 2) {
        const w1 = Math.round(directCols[0].getBoundingClientRect().width);
        const w2 = Math.round(directCols[1].getBoundingClientRect().width);
        const total = w1 + w2;
        if (total > 0) {
          splitRatio = `${Math.round((w1 / total) * 100)}% / ${Math.round((w2 / total) * 100)}%`;
        }
      }

      // Role deduction
      let role = 'Content Section';
      if (isRibbon) role = `Section Title Ribbon [${headings[0]?.text || 'Banner'}]`;
      else if (tag === 'header' || className.includes('header') || index === 0) role = 'Header / Branding Bar';
      else if (tag === 'nav' || className.includes('nav') || className.includes('menu')) role = 'Navigation Bar';
      else if (className.includes('smartslider') || className.includes('hero') || overlays.length > 0) role = 'Hero Banner (with Floating Overlay Card)';
      else if (videos.length > 0) role = 'Media & Video Showcase Section';
      else if (counters.length > 0) role = 'Statistics & Placements Counters';
      else if (cards.length >= 2) role = `Feature Card Grid (${cards.length} cards)`;
      else if (splitRatio) role = `Two-Column Split Section (${splitRatio})`;
      else if (tag === 'footer' || className.includes('footer') || index === rawSectionNodes.length - 1) role = 'Footer';

      return {
        index: index + 1,
        role,
        isRibbon: Boolean(isRibbon),
        ribbonDetails,
        splitRatio,
        selector: `${tag}${id}${className ? '.' + className.split(' ')[0] : ''}`,
        dimensions: {
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          isFullWidth: rect.width >= window.innerWidth * 0.95
        },
        styles: {
          background: getDominantVisualBg(node),
          backgroundImage: bgImg,
          textColor: style.color,
          padding: style.padding,
          maxWidth: style.maxWidth !== 'none' ? style.maxWidth : '100%',
        },
        headings,
        textBlocks: Array.from(new Set(textBlocks)).slice(0, 8),
        buttons: buttons.slice(0, 6),
        images: images.slice(0, 10),
        videos,
        counters,
        cards: cards.slice(0, 15),
        overlays
      };
    });

    // Group adjacent bands into Macro Sections based on Title Ribbons and Major Breaks
    const sections = [];
    let currentMacro = null;

    analyzedBands.forEach(band => {
      if (band.isRibbon || !currentMacro) {
        currentMacro = {
          index: sections.length + 1,
          name: band.isRibbon ? band.headings[0]?.text || 'Section' : band.role,
          ribbon: band.isRibbon ? band : null,
          bands: [band]
        };
        sections.push(currentMacro);
      } else {
        currentMacro.bands.push(band);
      }
    });

    // 3. ASP.NET & Interactive Forms Extraction
    const forms = Array.from(document.querySelectorAll('form')).map((f, i) => {
      const action = f.getAttribute('action') || '';
      const method = (f.getAttribute('method') || 'GET').toUpperCase();
      const id = f.id || `form-${i + 1}`;

      const fields = Array.from(f.querySelectorAll('input:not([type="hidden"]), select, textarea')).map(input => {
        const inputType = input.tagName === 'SELECT' ? 'select' : input.tagName === 'TEXTAREA' ? 'textarea' : (input.type || 'text');
        const name = input.name || input.id || '';
        const placeholder = input.placeholder || '';
        const labelEl = f.querySelector(`label[for="${input.id}"]`) || input.closest('label');
        const label = cleanText(labelEl?.innerText || '');

        let options = [];
        if (input.tagName === 'SELECT') {
          options = Array.from(input.querySelectorAll('option')).map(o => cleanText(o.text)).slice(0, 15);
        }

        return { type: inputType, name, label, placeholder, options };
      });

      const submitBtns = Array.from(f.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])'))
        .map(b => cleanText(b.tagName === 'INPUT' ? b.value : b.innerText))
        .filter(Boolean);

      return { id, action, method, fields, submitBtns };
    }).filter(f => f.fields.length > 0 || f.submitBtns.length > 0);

    // 4. DataGrids & Tables Extraction
    const tables = Array.from(document.querySelectorAll('table')).filter(isVisible).map((t, i) => {
      const headers = Array.from(t.querySelectorAll('th')).map(th => cleanText(th.innerText)).filter(Boolean);
      const rows = Array.from(t.querySelectorAll('tr')).slice(0, 5).map(tr => {
        return Array.from(tr.querySelectorAll('td')).map(td => cleanText(td.innerText));
      }).filter(r => r.length > 0);

      const isDataGrid = headers.length > 0 || rows.length >= 2;
      return isDataGrid ? { id: t.id || `table-${i + 1}`, headers, sampleRows: rows } : null;
    }).filter(Boolean);

    // 5. Media & Assets Catalog
    const allImages = Array.from(document.querySelectorAll('img')).filter(isVisible).map(img => ({
      src: img.currentSrc || img.src,
      alt: img.alt || '',
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      isLogo: Boolean(
        /logo|crest|emblem|seal|brand/i.test(img.src) ||
        /logo|crest|emblem|seal/i.test(img.alt) ||
        /logo|crest|brand/i.test(img.className) ||
        img.closest('header, [class*="header"], [id*="header"]') && img.width < 400 && img.height < 150
      )
    })).filter(img => img.src && !img.src.startsWith('data:') && img.width > 20);

    const bgImages = [];
    Array.from(document.querySelectorAll('*')).forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        const match = style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match && match[1] && !match[1].startsWith('data:')) {
          bgImages.push(match[1]);
        }
      }
    });

    return {
      title,
      metaDesc,
      globalBackground,
      fontLinks: Array.from(new Set(fontLinks)),
      isAspNet,
      navTrees,
      activeNavStyles,
      socialLinks,
      tickerData,
      analyzedBands,
      macroSections: sections,
      forms,
      tables,
      images: Array.from(new Map(allImages.map(img => [img.src, img])).values()),
      bgImages: Array.from(new Set(bgImages))
    };
  });

  // =========================================================================
  // Generate content.md (Hierarchical, Section-Structured Content Specification)
  // =========================================================================
  console.log(`  → Writing content.md...`);
  let contentMd = `# Content & Structural Architecture: ${pageData.title}\n\n`;
  if (pageData.metaDesc) contentMd += `> **Site Description**: ${pageData.metaDesc}\n\n`;
  if (pageData.isAspNet) contentMd += `> **Platform**: ASP.NET / ASPX WebForms Detected. Interactive controls and forms mapped below.\n\n`;
  if (pageData.globalBackground?.image) {
    contentMd += `> **Global Page Canvas Background Image / Pattern**: [${pageData.globalBackground.image}](${pageData.globalBackground.image}) (Color: \`${pageData.globalBackground.color}\`)\n\n`;
  }

  // 1. Navigation Architecture
  contentMd += `## 1. Navigation Architecture & Menu Hierarchy\n\n`;
  if (pageData.activeNavStyles.text) {
    contentMd += `> **Active Menu State**: Item \`${pageData.activeNavStyles.text}\` is active with background \`${pageData.activeNavStyles.bg}\`, text color \`${pageData.activeNavStyles.color}\`, and border radius \`${pageData.activeNavStyles.radius}\`.\n\n`;
  }
  if (pageData.socialLinks.length > 0) {
    contentMd += `### Header Social Media Icons\n`;
    pageData.socialLinks.forEach(s => {
      const styleDesc = s.isGlyphOnly
        ? `direct outline/glyph icon (transparent background, color: \`${s.color}\`)`
        : `button (bg: \`${s.bg}\`, color: \`${s.color}\`, border-radius: \`${s.radius}\`)`;
      contentMd += `- **${s.platform}**: [Link](${s.href}) (Style: ${styleDesc})\n`;
    });
    contentMd += `\n`;
  }

  if (pageData.tickerData) {
    contentMd += `### Live Newsline Ticker Strip\n`;
    contentMd += `- **Prefix / Label**: \`${pageData.tickerData.prefix}\`\n`;
    contentMd += `- **Background**: \`${pageData.tickerData.bg}\` | **Text Color**: \`${pageData.tickerData.color}\`\n`;
    contentMd += `- **Items**: ${pageData.tickerData.items.map(it => `"${it}"`).join(', ')}\n\n`;
  }

  if (pageData.navTrees.length > 0) {
    contentMd += `### Navigation Links & Submenus\n`;
    pageData.navTrees.forEach(item => {
      const activeMark = item.isCurrent ? ' `[ACTIVE]`' : '';
      if (item.hasDropdown && item.children.length > 0) {
        contentMd += `- **[${item.text}](${item.href})**${activeMark} (Dropdown Menu):\n`;
        item.children.forEach(sub => {
          contentMd += `  - [${sub.text}](${sub.href})\n`;
        });
      } else {
        contentMd += `- [${item.text}](${item.href})${activeMark}\n`;
      }
    });
  }
  contentMd += `\n`;

  // 2. Section-by-Section Visual Flow
  contentMd += `## 2. Page Section Flow (Top to Bottom)\n\n`;
  contentMd += `This section breaks down the entire visual structure in exact render order for 1:1 replica generation:\n\n`;

  pageData.analyzedBands.forEach(sec => {
    contentMd += `### Section ${sec.index}: ${sec.role} (\`${sec.selector}\`)\n`;
    contentMd += `- **Dimensions**: Width: ${sec.dimensions.width}px (${sec.dimensions.isFullWidth ? 'Full Viewport Width' : 'Constrained Width'}), Height: ~${sec.dimensions.height}px (at Y=${sec.dimensions.y}px)\n`;
    contentMd += `- **Background**: \`${sec.styles.background}\`${sec.styles.backgroundImage ? ` | **Image**: [Background Asset](${sec.styles.backgroundImage})` : ''}\n`;
    if (sec.splitRatio) contentMd += `- **Multi-Column Split**: \`${sec.splitRatio}\` side-by-side\n`;

    if (sec.overlays.length > 0) {
      sec.overlays.forEach(ov => {
        contentMd += `- **Floating Overlay Card**: Anchored at right: ${ov.right}px, top: ${ov.top}px (${ov.width}x${ov.height}px, background: \`${ov.bg}\`)${ov.button ? ` [CTA Button: "${ov.button.text}" (bg: \`${ov.button.bg}\`, color: \`${ov.button.color}\`)]` : ''} -> "${ov.text}"\n`;
      });
    }

    if (sec.headings.length > 0) {
      contentMd += `- **Headings**:\n`;
      sec.headings.forEach(h => {
        contentMd += `  - \`<${h.level}>\` ${h.text}\n`;
      });
    }

    if (sec.textBlocks.length > 0) {
      contentMd += `- **Text Content**:\n`;
      sec.textBlocks.forEach(t => {
        contentMd += `  - "${t}"\n`;
      });
    }

    if (sec.counters.length > 0) {
      contentMd += `- **Key Performance Counters**:\n`;
      sec.counters.forEach(c => {
        contentMd += `  - **${c.number}** ${c.label} (Number color: \`${c.numberColor}\`, size: \`${c.numberFontSize}\`, label color: \`${c.labelColor}\`, bg: \`${c.bg}\`${c.hasDecorativeArrows ? ', with decorative arrows' : ''})\n`;
      });
    }

    if (sec.cards.length > 0) {
      contentMd += `- **Cards & Carousel Slides**:\n`;
      sec.cards.forEach((c, cIdx) => {
        if (c.isSolidActionBox) {
          contentMd += `  - Card ${cIdx + 1}: **Solid Action Box** - "${c.title || c.desc}" (Background: \`${c.bg}\`, text: centered bold white)\n`;
        } else if (c.isPortraitPoster) {
          contentMd += `  - Card ${cIdx + 1}: **Portrait Poster Card** (Image: [Asset](${c.img})) - ${c.title || c.desc || 'Recruitment Drive'}\n`;
        } else {
          contentMd += `  - Card ${cIdx + 1}:${c.title ? ` **${c.title}**` : ''}${c.img ? ` (Image: [Asset](${c.img}))` : ''}${c.desc ? ` - ${c.desc}` : ''}\n`;
        }
      });
    }

    if (sec.buttons.length > 0) {
      contentMd += `- **Buttons & CTAs**:\n`;
      sec.buttons.forEach(b => {
        contentMd += `  - **[${b.text}](${b.href || '#'})** (Background: \`${b.bg}\`, Text: \`${b.color}\`, Radius: \`${b.radius}\`, Border: \`${b.border}\`)\n`;
      });
    }

    if (sec.videos.length > 0) {
      contentMd += `- **Embedded Video Player**:\n`;
      sec.videos.forEach(v => {
        contentMd += `  - Video Frame (${v.width}x${v.height}px, source: \`${v.src}\`)\n`;
      });
    }

    if (sec.images.length > 0) {
      contentMd += `- **Section Media**:\n`;
      sec.images.forEach(img => {
        contentMd += `  - ![${img.alt || 'Asset'}](${img.src}) (${img.width}x${img.height})\n`;
      });
    }

    contentMd += `\n`;
  });

  // 3. Forms & Interactive Controls
  if (pageData.forms.length > 0) {
    contentMd += `## 3. Interactive Forms & ASP.NET Controls\n\n`;
    pageData.forms.forEach((f, idx) => {
      contentMd += `### Form ${idx + 1} (\`#${f.id}\` - Method: \`${f.method}\`, Action: \`${f.action || './'}\`)\n`;
      if (f.fields.length > 0) {
        contentMd += `| Field Type | Name / ID | Label | Options / Placeholder |\n`;
        contentMd += `|---|---|---|---|\n`;
        f.fields.forEach(fld => {
          const optStr = fld.options?.length ? fld.options.join(', ') : (fld.placeholder || '-');
          contentMd += `| \`${fld.type}\` | \`${fld.name}\` | ${fld.label || '-'} | ${optStr} |\n`;
        });
      }
      if (f.submitBtns.length > 0) {
        contentMd += `- **Action Buttons**: ${f.submitBtns.map(b => `\`${b}\``).join(', ')}\n`;
      }
      contentMd += `\n`;
    });
  }

  // 4. DataGrids & Tables
  if (pageData.tables.length > 0) {
    contentMd += `## 4. DataGrids & Data Tables\n\n`;
    pageData.tables.forEach((tbl, idx) => {
      contentMd += `### Table ${idx + 1} (\`#${tbl.id}\`)\n`;
      if (tbl.headers.length > 0) {
        contentMd += `| ${tbl.headers.join(' | ')} |\n`;
        contentMd += `| ${tbl.headers.map(() => '---').join(' | ')} |\n`;
        tbl.sampleRows.forEach(row => {
          contentMd += `| ${row.join(' | ')} |\n`;
        });
      }
      contentMd += `\n`;
    });
  }

  // 5. Complete Media Manifest
  contentMd += `## 5. Media & Asset Catalog\n\n`;
  const logos = pageData.images.filter(img => img.isLogo);
  if (logos.length > 0) {
    contentMd += `### Brand Logos & Emblems\n`;
    logos.forEach(img => {
      contentMd += `- **Logo**: [${img.src}](${img.src}) (${img.width}x${img.height}) - Alt: "${img.alt}"\n`;
    });
    contentMd += `\n`;
  }

  if (pageData.bgImages.length > 0) {
    contentMd += `### CSS Background Images & Hero Assets\n`;
    pageData.bgImages.forEach(src => {
      contentMd += `- **Background Asset**: [${src}](${src})\n`;
    });
    contentMd += `\n`;
  }

  contentMd += `### Content Images\n`;
  pageData.images.slice(0, 30).forEach(img => {
    contentMd += `- ![${img.alt || 'Asset'}](${img.src}) [${img.src}](${img.src}) (${img.width}x${img.height})\n`;
  });
  contentMd += `\n`;

  writeFileSync(join(outputDir, 'content.md'), contentMd, 'utf8');
  console.log(`  ✓ Saved content.md`);

  // =========================================================================
  // Generate REPLICA_GUIDE.md (Agent Implementation Blueprint for 100% Exact Replicas)
  // =========================================================================
  console.log(`  → Writing REPLICA_GUIDE.md...`);
  let replicaGuide = `# Master Replica Specification Guide: ${pageData.title}\n\n`;
  replicaGuide += `This document is specifically tailored for AI coding agents to construct a pixel-accurate, 1:1 replica of the target site.\n\n`;

  replicaGuide += `## 1. Quick Technical Specifications\n`;
  replicaGuide += `- **Target URL**: ${targetUrl}\n`;
  replicaGuide += `- **Platform Architecture**: ${pageData.isAspNet ? 'ASP.NET WebForms (.aspx) - Modern semantic HTML5/CSS3 conversion' : 'Standard Web Application'}\n`;
  replicaGuide += `- **Primary Viewport**: 1920px × 1080px (Standard Desktop Grid)\n`;
  if (pageData.fontLinks.length > 0) {
    replicaGuide += `- **External Font Imports**:\n`;
    pageData.fontLinks.forEach(link => {
      replicaGuide += `  \`\`\`html\n  <link rel="stylesheet" href="${link}">\n  \`\`\`\n`;
    });
  }
  replicaGuide += `\n`;

  replicaGuide += `## 2. Global Page Canvas & Body Background\n`;
  replicaGuide += `- **Body Background Color**: \`${pageData.globalBackground?.color || '#ffffff'}\`\n`;
  if (pageData.globalBackground?.image) {
    replicaGuide += `- **Body Background Texture / Pattern**: [Image Asset](${pageData.globalBackground.image})\n`;
    replicaGuide += `- **Mandatory Global Body CSS**:\n`;
    replicaGuide += `  \`\`\`css\n`;
    replicaGuide += `  body {\n`;
    replicaGuide += `    background-color: ${pageData.globalBackground.color};\n`;
    replicaGuide += `    background-image: url('${pageData.globalBackground.image}');\n`;
    replicaGuide += `    background-repeat: repeat;\n`;
    replicaGuide += `  }\n`;
    replicaGuide += `  \`\`\`\n\n`;
  } else {
    replicaGuide += `- **Body Background CSS**: \`body { background-color: ${pageData.globalBackground?.color || '#ffffff'}; }\`\n\n`;
  }

  replicaGuide += `## 3. Micro-Component & Key Aesthetic Contracts\n\n`;
  if (pageData.activeNavStyles.text) {
    replicaGuide += `### Active Navigation Pill\n`;
    replicaGuide += `- The active navigation item (\`${pageData.activeNavStyles.text}\`) MUST have:\n`;
    replicaGuide += `  \`\`\`css\n`;
    replicaGuide += `  .nav-item.active a {\n`;
    replicaGuide += `    background-color: ${pageData.activeNavStyles.bg};\n`;
    replicaGuide += `    color: ${pageData.activeNavStyles.color};\n`;
    replicaGuide += `    border-radius: ${pageData.activeNavStyles.radius};\n`;
    replicaGuide += `    padding: 6px 18px;\n`;
    replicaGuide += `    font-weight: bold;\n`;
    replicaGuide += `  }\n`;
    replicaGuide += `  \`\`\`\n\n`;
  }

  if (pageData.socialLinks.length > 0) {
    replicaGuide += `### Header Social Media Links\n`;
    const allGlyphs = pageData.socialLinks.every(s => s.isGlyphOnly);
    if (allGlyphs) {
      replicaGuide += `- Direct outline/glyph icons (transparent background, color: \`${pageData.socialLinks[0].color}\`, font-size: ~20px):\n`;
    } else {
      replicaGuide += `- Social buttons (background: \`${pageData.socialLinks[0].bg}\`, color: \`${pageData.socialLinks[0].color}\`, border-radius: \`${pageData.socialLinks[0].radius}\`):\n`;
    }
    replicaGuide += `  Platforms: ${pageData.socialLinks.map(s => `[${s.platform}](${s.href})`).join(', ')}\n\n`;
  }

  if (pageData.tickerData) {
    replicaGuide += `### Live Newsline Ticker Strip\n`;
    replicaGuide += `- **Background**: \`${pageData.tickerData.bg}\`\n`;
    replicaGuide += `- **Prefix Badge / Label**: \`${pageData.tickerData.prefix}\`\n`;
    replicaGuide += `- **Ticker Items**: ${pageData.tickerData.items.map(it => `"${it}"`).join(', ')}\n`;
    replicaGuide += `- **Layout**: Horizontal scrolling marquee ticker with continuous loop.\n\n`;
  }

  replicaGuide += `## 4. Section-by-Section Implementation Blueprint\n\n`;
  replicaGuide += `Implement the replica by coding each section container sequentially from top to bottom:\n\n`;

  pageData.analyzedBands.forEach((sec, idx) => {
    replicaGuide += `### Band ${sec.index}: ${sec.role}\n`;
    replicaGuide += `- **Container Width**: ${sec.dimensions.isFullWidth ? 'Full width (`width: 100%`)' : 'Constrained max-width (`max-width: 1200px; margin: 0 auto;`)'}\n`;
    replicaGuide += `- **Background**: \`${sec.styles.background}\`${sec.styles.backgroundImage ? ` (Image: \`${sec.styles.backgroundImage}\`)` : ''}\n`;

    if (sec.isRibbon) {
      const rib = sec.ribbonDetails || {};
      replicaGuide += `- **SECTION TITLE RIBBON SPEC**:\n`;
      replicaGuide += `  - Text: **"${rib.text || sec.headings[0]?.text}"**\n`;
      replicaGuide += `  - Variant: Centered Ribbon Bar\n`;
      replicaGuide += `  - CSS: \`background: ${rib.bg}; color: ${rib.color || '#ffffff'}; text-align: ${rib.alignment || 'center'}; padding: 10px 24px; border-radius: ${rib.borderRadius || '4px'}; font-size: 20px; font-weight: 700; max-width: 1400px; margin: 24px auto;\`\n`;
    }

    if (sec.splitRatio) {
      replicaGuide += `- **TWO-COLUMN SPLIT SPEC**:\n`;
      replicaGuide += `  - Layout: \`display: flex; gap: 24px;\` (Ratios: \`${sec.splitRatio}\`)\n`;
      replicaGuide += `  - Col 1 width: \`${sec.splitRatio.split('/')[0].trim()}\`\n`;
      replicaGuide += `  - Col 2 width: \`${sec.splitRatio.split('/')[1].trim()}\`\n`;
    }

    if (sec.overlays.length > 0) {
      replicaGuide += `- **FLOATING OVERLAY CARD SPEC**:\n`;
      sec.overlays.forEach(ov => {
        replicaGuide += `  - Floating card anchored over the banner.\n`;
        replicaGuide += `  - Positioning: \`position: absolute; right: ${ov.right}px; top: ${ov.top}px; width: ${ov.width}px;\`\n`;
        replicaGuide += `  - Styling: \`background: ${ov.bg}; padding: 32px; border-radius: 4px; color: #fff;\`\n`;
        replicaGuide += `  - Content: "${ov.text}"\n`;
        if (ov.button) {
          replicaGuide += `  - CTA Button: \`[${ov.button.text}]\` (Background: \`${ov.button.bg}\`, Color: \`${ov.button.color}\`, Border: \`${ov.button.border}\`)\n`;
        }
      });
    }

    if (sec.videos.length > 0) {
      replicaGuide += `- **EMBEDDED VIDEO FRAME SPEC**:\n`;
      sec.videos.forEach(v => {
        replicaGuide += `  - Width: ${v.width}px, Height: ${v.height}px, Source: \`${v.src}\`\n`;
        replicaGuide += `  - Aspect ratio container: \`width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; overflow: hidden;\`\n`;
      });
    }

    if (sec.counters.length > 0) {
      replicaGuide += `- **STATISTICS COUNTER CARDS**:\n`;
      sec.counters.forEach(c => {
        const arrowNote = c.hasDecorativeArrows ? ' (Decorative vertical chevrons ︽ / ︾ above and below number)' : '';
        replicaGuide += `  - **${c.number}** (${c.label}) -> Number Style: \`color: ${c.numberColor}; font-size: ${c.numberFontSize}; font-weight: ${c.numberFontWeight};\`${arrowNote} | Label Style: \`color: ${c.labelColor};\` | Card Background: \`${c.bg}\`\n`;
      });
    }

    if (sec.cards.length > 0) {
      replicaGuide += `- **CARDS & CAROUSEL SLIDES SPEC**:\n`;
      sec.cards.forEach((c, cIdx) => {
        if (c.isSolidActionBox) {
          replicaGuide += `  - Item ${cIdx + 1}: **Solid Action Box** (No Image): "${c.title || c.desc}" | Background: \`${c.bg}\` | Text: bold centered white\n`;
        } else if (c.isPortraitPoster) {
          replicaGuide += `  - Item ${cIdx + 1}: **Portrait Recruitment Poster Card**: ![Asset](${c.img}) (Aspect Ratio: 724 / 1024, Object-Fit: Cover) | Desc: "${c.desc || c.title || 'Recruitment Drive'}"\n`;
        } else {
          replicaGuide += `  - Item ${cIdx + 1}:${c.title ? ` **"${c.title}"**` : ''}${c.img ? ` | Image Asset: ![Asset](${c.img})` : ''}${c.desc ? ` | Desc: "${c.desc}"` : ''} | Background: \`${c.bg}\`\n`;
        }
      });
    }

    if (sec.buttons.length > 0) {
      replicaGuide += `- **Action Buttons**:\n`;
      sec.buttons.forEach(b => {
        replicaGuide += `  - \`[${b.text}]\`: background: \`${b.bg}\`, color: \`${b.color}\`, radius: \`${b.radius}\`, border: \`${b.border}\`\n`;
      });
    }

    replicaGuide += `\n`;
  });

  if (pageData.isAspNet) {
    replicaGuide += `## 5. Modernizing Legacy ASP.NET (.aspx) Controls\n`;
    replicaGuide += `1. **Replace \`<input type="submit" name="ctl00$..." value="X">\`** with modern semantic buttons: \`<button type="submit" class="btn-primary">X</button>\`.\n`;
    replicaGuide += `2. **Replace legacy \`<table>\` nested layout wrappers** with modern CSS Flexbox or CSS Grid.\n`;
    replicaGuide += `3. **DataGrids (\`<asp:GridView>\`)**: Replicate as clean \`<table class="data-table">\` with styled \`<thead>\` and zebra-striped \`tbody tr:nth-child(even)\`.\n\n`;
  }

  writeFileSync(join(outputDir, 'REPLICA_GUIDE.md'), replicaGuide, 'utf8');
  console.log(`  ✓ Saved REPLICA_GUIDE.md`);

  console.log(`\n🎉 COMPLETE CAPTURE BUNDLE CREATED!`);
  console.log(`Directory: output/${domain}/bundle/\n`);
  console.log(`  1. DESIGN.md        -> W3C design tokens (colors, typography scales, buttons)`);
  console.log(`  2. content.md       -> Complete hierarchical text copy, navigation dropdown trees, & layout flow`);
  console.log(`  3. REPLICA_GUIDE.md -> Actionable implementation blueprint for AI agents to code 1:1 replicas`);
  console.log(`  4. rendered.html    -> Sanitized DOM structure (ViewState & script bloat removed)`);
  console.log(`  5. screenshot.png   -> Full-page visual reference\n`);

} catch (err) {
  console.error("Capture bundle error:", err);
} finally {
  await browser.close();
}
