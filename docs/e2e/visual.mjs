/* eslint-disable */
// Real-browser check against the running dev stack (web :5173 with VITE_USE_MOCKS=false, API :4000).
// Needs Playwright, which is not a project dependency: see docs/manual-test-checklist.md for the --no-save install.
// Output (screenshots, results.json) goes to $E2E_OUT or the system temp folder, never into the repo.
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:5173';
const OUT = (process.env.E2E_OUT ?? join(tmpdir(), 'bingemate-e2e')) + '/';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const out = [];
for (const [label, width, height] of [
  ['desktop', 1280, 900],
  ['phone', 320, 700],
]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/40[14]/.test(m.text())) errors.push(m.text());
  });
  const apiCalls = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) apiCalls.push(r.url().replace(BASE, ''));
  });

  await page.goto(`${BASE}/`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}home-${label}.png` });
  out.push([
    `home ${label}: trending requested`,
    apiCalls.some((u) => u.startsWith('/api/trending')),
  ]);
  out.push([
    `home ${label}: no horizontal overflow`,
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ]);

  apiCalls.length = 0;
  await page.goto(`${BASE}/browse`);
  await page.waitForLoadState('networkidle');
  out.push([
    `browse ${label}: genres requested`,
    apiCalls.some((u) => u.startsWith('/api/genres')),
  ]);
  const genre = page.getByLabel(/genre/i).first();
  const sort = page.getByLabel(/sort/i).first();
  out.push([`browse ${label}: genre select present`, (await genre.count()) > 0]);
  out.push([`browse ${label}: sort select present`, (await sort.count()) > 0]);
  if (await sort.count()) {
    const gotSort = page
      .waitForRequest((r) => /\/api\/titles\?.*sort=/.test(r.url()), { timeout: 5000 })
      .then(
        (r) => r.url().replace(BASE, ''),
        () => null,
      );
    await sort.selectOption({ index: 1 });
    const sortUrl = await gotSort;
    out.push([`browse ${label}: sort change reaches the API`, !!sortUrl, sortUrl]);
    out.push([
      `browse ${label}: sort in the URL`,
      /sort=/.test(page.url()),
      page.url().replace(BASE, ''),
    ]);
  }
  if (await genre.count()) {
    const opts = await genre.locator('option').allTextContents();
    out.push([`browse ${label}: genre options`, opts.length > 1, opts.slice(0, 5).join(' | ')]);
    if (opts.length > 1) {
      const gotGenre = page
        .waitForRequest((r) => /\/api\/titles\?.*genre=/.test(r.url()), { timeout: 5000 })
        .then(
          (r) => r.url().replace(BASE, ''),
          () => null,
        );
      await genre.selectOption({ index: 1 });
      const genreUrl = await gotGenre;
      out.push([`browse ${label}: genre change reaches the API`, !!genreUrl, genreUrl]);
      await page.waitForLoadState('networkidle');
    }
  }
  await page.screenshot({ path: `${OUT}browse-${label}.png` });
  out.push([
    `browse ${label}: no horizontal overflow`,
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ]);
  out.push([
    `${label}: no console errors`,
    errors.length === 0,
    errors.slice(0, 2).join(' || ').slice(0, 200),
  ]);
  await ctx.close();
}
await browser.close();
let bad = 0;
for (const [n, ok, extra] of out) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' :: ' + extra : ''}`);
  if (!ok) bad++;
}
process.exitCode = bad ? 1 : 0;
