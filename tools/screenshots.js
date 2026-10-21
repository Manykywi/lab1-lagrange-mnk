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

  // --- порівняння 5·10·20 (6 графіків)
  await page.click('#viewButtons [data-view="compare"]');
  await page.waitForTimeout(250);
  await shot('compare-6-charts', '#viewCompare');
  await page.check('#focus');
  await page.waitForTimeout(200);
  await shot('compare-6-charts-focus', '#viewCompare');
  await page.uncheck('#focus');
  await page.click('#viewButtons [data-view="single"]');

  // --- підказка при наведенні на вузол
  await set(10);
  await mode('all');
  const pos = await page.evaluate(() => {
    const ch = window.__lab.charts.main;
    const r = ch.canvas.getBoundingClientRect();
    return { x: r.left + ch.sx(7), y: r.top + ch.sy(3.15) };
  });
  await page.mouse.move(pos.x + 2, pos.y + 1);
  await page.waitForTimeout(200);
  await shot('tooltip-node', '#mainChart');
  await page.mouse.move(5, 5);

  // --- анімація інтерполяції (10 точок, швидкість 1×): кадри на кроках
  await set(10);
  await page.click('#btnAnimInterp');
  await page.waitForTimeout(1350);
  await shot('anim-interp-step2', '.charts');
  await page.waitForTimeout(3300);
  await shot('anim-interp-step5', '.charts');
  await page.waitForTimeout(5200);
  await shot('anim-interp-step9', '.charts');
  await page.waitForTimeout(2500);
  console.log('після інтерполяції: anim =', await page.evaluate(() => window.__lab.state.anim));

  // --- анімація МНК
  await page.click('#btnAnimMnk');
  await page.waitForTimeout(900);
  await shot('anim-mnk-early', '.charts');
  await page.waitForTimeout(1500);
  await shot('anim-mnk-late', '.charts');
  await page.waitForTimeout(1800);
  console.log('після МНК: anim =', await page.evaluate(() => window.__lab.state.anim));

  console.log('Помилки/попередження консолі:', errors.length ? errors : 'немає');
  await browser.close();
})();
