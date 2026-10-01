// dist の HTML をヘッドレス Chromium で開いてスクリーンショットを撮る
// 使い方: node test/screenshot.mjs [出力先ディレクトリ]
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || join(here, '../dist/shots');
mkdirSync(outDir, { recursive: true });
const body = readFileSync(join(here, '../dist/haikaden-planner.html'), 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${body}</body></html>`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function shot(name, { width, height, scheme = 'light', act } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push(`${name}: ${m.text()}`);
  });
  await page.route('**/*', (route) => (route.request().url().startsWith('https://fonts.') ? route.abort() : route.continue()));
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (act) await act(page);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`${name}: 横スクロール ${overflow}px`);
  await page.close();
}

await shot('desktop-light', { width: 1600, height: 1000 });
await shot('desktop-dark', { width: 1600, height: 1000, scheme: 'dark' });
await shot('phone', { width: 400, height: 860 });
await shot('mid-play', {
  width: 1600,
  height: 1000,
  act: async (page) => {
    await page.fill('#stepRange', '20');
    await page.dispatchEvent('#stepRange', 'input');
    await page.waitForTimeout(400);
  },
});
await shot('cat-color-40ft', {
  width: 1600,
  height: 1000,
  act: async (page) => {
    await page.selectOption('#container', 'iso40');
    await page.click('[data-total="80"]');
    await page.waitForTimeout(1500);
    await page.click('[data-color="cat"]');
    await page.waitForTimeout(500);
  },
});
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
