#!/usr/bin/env node
/**
 * Витягує Mermaid-діаграми з docs/*.md і рендерить їх у PNG (docs/diagrams/<name>.png).
 * Блок має вигляд:
 *   <!-- diagram: назва -->
 *   ```mermaid
 *   ...
 *   ```
 * Потрібен @mermaid-js/mermaid-cli (команда mmdc) і Chromium.
 *
 * Запуск: node tools/build-diagrams.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');
const outDir = path.join(docsDir, 'diagrams');
fs.mkdirSync(outDir, { recursive: true });

const puppeteerConfig = path.join(__dirname, 'puppeteer-config.json');
const re = /<!--\s*diagram:\s*([\w-]+)\s*-->\s*```mermaid\n([\s\S]*?)```/g;

let count = 0;
for (const file of fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(path.join(docsDir, file), 'utf8');
  let m;
  while ((m = re.exec(text))) {
    const [, name, code] = m;
    const mmd = path.join(outDir, `${name}.mmd`);
    const png = path.join(outDir, `${name}.png`);
    fs.writeFileSync(mmd, code);
    execFileSync(
      'mmdc',
      ['-i', mmd, '-o', png, '-p', puppeteerConfig, '-b', 'white', '-s', '2', '-w', '1200'],
      { stdio: 'inherit' }
    );
    console.log(`✓ ${file} → diagrams/${name}.png`);
    count++;
  }
}
console.log(`Готово: ${count} діаграм(и).`);
