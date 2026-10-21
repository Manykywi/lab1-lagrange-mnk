#!/usr/bin/env node
/**
 * Знімає скріншоти застосунку (для звіту) через Playwright + Chromium.
 *   NODE_PATH=$(npm root -g) node tools/screenshots.js
 * Результат: docs/screenshots/*.png. Повідомляє про помилки консолі сторінки.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(root, 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(url);
  await page.waitForTimeout(300);

  const shot = async (name, sel) => {
    const file = path.join(out, name + '.png');
    if (sel) await (await page.$(sel)).screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: true });
    console.log('✓', name);
  };

  const set = async (n) => { await page.click(`#setButtons [data-set="${n}"]`); await page.waitForTimeout(150); };
  const mode = async (m) => { await page.click(`#modeButtons [data-mode="${m}"]`); await page.waitForTimeout(150); };

  await set(10);
  await mode('all');
  await shot('ui-full-10', null);
  for (const n of [5, 10, 20]) {
    await set(n);
    await shot(`single-${n}`, '.charts');
  }
  await set(20);
  await page.check('#focus');
  await page.waitForTimeout(150);
  await shot('single-20-focus', '.charts');
  await page.uncheck('#focus');
  await page.check('#extrap');
  await page.waitForTimeout(150);
  await shot('single-20-extrap', '.charts');
  await page.uncheck('#extrap');

  console.log('Помилки/попередження консолі:', errors.length ? errors : 'немає');
  await browser.close();
})();
