#!/usr/bin/env node
/**
 * Генерує звіт report/Звіт_ЛР1_Лагранж_МНК.docx (бібліотека docx, npm i docx).
 *   NODE_PATH=$(npm root -g) node tools/build-report.js
 * Джерела: docs/*, src/*, docs/analysis-results.json, docs/diagrams/*.png, docs/screenshots/*.png.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Footer, Header,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType, PageNumber, LevelFormat, PageBreak,
  VerticalAlign,
} = require('docx');

const root = path.resolve(__dirname, '..');
const R = (...p) => path.join(root, ...p);
const results = JSON.parse(fs.readFileSync(R('docs', 'analysis-results.json'), 'utf8'));
const M = require('../src/math.js');
const D = require('../src/datasets.js');

const FONT = 'Times New Roman';
const MONO = 'Courier New';
const BODY = 28; // 14 pt
const SMALL = 22; // 11 pt
const CONTENT_W = 9639; // DXA (A4, поля 2.5 / 1.5 см)

const f = (v, d = 4) => M.fmt(v, d);
const exp2 = (v) => v.toExponential(2);

// ----------------------------------------------------------------- Тест-раннер
let testPass = '37';
try {
  const out = execSync('node --test', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = out.match(/# pass (\d+)/);
  const fl = out.match(/# fail (\d+)/);
  if (m && fl && fl[1] === '0') testPass = m[1];
  else throw new Error('Автотести не пройшли — звіт не формується');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// ------------------------------------------------------------------ Хелпери

function runs(text, o = {}) {
  // **жирний** та `код` у тексті
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((s) => s !== '');
  return parts.map((s) => {
    if (s.startsWith('**')) return new TextRun({ text: s.slice(2, -2), bold: true, font: FONT, size: o.size || BODY, italics: o.italics });
    if (s.startsWith('`')) return new TextRun({ text: s.slice(1, -1), font: MONO, size: (o.size || BODY) - 4 });
    return new TextRun({ text: s, font: FONT, size: o.size || BODY, bold: o.bold, italics: o.italics, color: o.color });
  });
}

const para = (text, o = {}) =>
  new Paragraph({
    children: runs(text, o),
    alignment: o.align || AlignmentType.JUSTIFIED,
    spacing: { line: o.line || 340, after: o.after == null ? 120 : o.after, before: o.before || 0 },
    indent: o.noIndent ? undefined : { firstLine: o.firstLine == null ? 567 : o.firstLine },
    keepNext: o.keepNext,
    pageBreakBefore: o.pageBreakBefore,
  });

const h1 = (t, pb = false) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT, bold: true, size: 32 })], spacing: { before: 240, after: 160 }, pageBreakBefore: pb, keepNext: true });
const h2 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT, bold: true, size: 28 })], spacing: { before: 200, after: 120 }, keepNext: true });
const h3 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT, bold: true, italics: true, size: 26 })], spacing: { before: 140, after: 100 }, keepNext: true });

const bullets = (items) =>
  items.map(
    (t) =>
      new Paragraph({
        numbering: { reference: 'bul', level: 0 },
        children: runs(t),
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 320, after: 60 },
      })
  );
const numbered = (items, ref = 'num') =>
  items.map(
    (t) =>
      new Paragraph({
        numbering: { reference: ref, level: 0 },
        children: runs(t),
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 320, after: 80 },
      })
  );

const formula = (text, num) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 120 },
    children: [new TextRun({ text, font: FONT, italics: true, size: BODY }), ...(num ? [new TextRun({ text: `        (${num})`, font: FONT, size: BODY })] : [])],
  });

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Зображення, вписане в ширину widthCm та висоту maxHeightCm. */
function img(file, widthCm, maxHeightCm = 22) {
  const { w, h } = pngSize(file);
  let wpx = Math.round((widthCm / 2.54) * 96);
  let hpx = Math.round((wpx * h) / w);
  const maxH = Math.round((maxHeightCm / 2.54) * 96);
  if (hpx > maxH) {
    wpx = Math.round((wpx * maxH) / hpx);
    hpx = maxH;
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 80, after: 60 },
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width: wpx, height: hpx }, altText: { title: path.basename(file), description: path.basename(file), name: path.basename(file) } })],
  });
}

let figN = 0;
let tabN = 0;
const caption = (text) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `Рис. ${++figN} — ${text}`, font: FONT, size: 24, italics: true })] });
const figure = (file, text, widthCm = 15.5, maxH = 20) => [img(file, widthCm, maxH), caption(text)];
const shot = (name, text, w, mh) => figure(R('docs', 'screenshots', name + '.png'), text, w, mh);
const diagram = (name, text, w, mh) => figure(R('docs', 'diagrams', name + '.png'), text, w, mh);

const bd = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: bd, bottom: bd, left: bd, right: bd };

/**
 * Таблиця: widths у DXA (сума = CONTENT_W), header — масив рядків, rows — масив масивів.
 * Комірка може бути рядком або { t, align, bold, fill }.
 */
function table(widths, header, rows, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (c, i, isHead) => {
    const spec = typeof c === 'object' && c !== null ? c : { t: c };
    return new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders,
      verticalAlign: VerticalAlign.CENTER,
      shading: isHead ? { type: ShadingType.CLEAR, fill: 'D9E2F3' } : spec.fill ? { type: ShadingType.CLEAR, fill: spec.fill } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: String(spec.t)
        .split('\n')
        .map(
          (line) =>
            new Paragraph({
              alignment: spec.align || (isHead ? AlignmentType.CENTER : i === 0 || o.leftAll ? AlignmentType.LEFT : o.align || AlignmentType.CENTER),
              spacing: { after: 0, line: 252 },
              children: runs(line, { size: o.size || SMALL, bold: isHead || spec.bold }),
            })
        ),
    });
  };
  const cap = o.caption
    ? [new Paragraph({ alignment: AlignmentType.LEFT, keepNext: true, spacing: { before: 120, after: 80 }, children: [new TextRun({ text: `Таблиця ${++tabN} — ${o.caption}`, font: FONT, size: 24, italics: true })] })]
    : [];
  return [
    ...cap,
    new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}

/** Блок коду (моноширинний, з рамкою-фоном). */
function code(text, size = 17) {
  return text
    .replace(/\t/g, '  ')
    .split('\n')
    .map(
      (line, i, arr) =>
        new Paragraph({
          spacing: { after: 0, line: 232 },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          indent: { left: 120, right: 120 },
          keepLines: true,
          children: [new TextRun({ text: line === '' ? ' ' : line, font: MONO, size })],
        })
    )
    .concat([new Paragraph({ spacing: { after: 160 }, children: [] })]);
}

function extractFn(file, name, indent = '  ') {
  const src = fs.readFileSync(R(file), 'utf8');
  const startRe = new RegExp(`^${indent}(?:async )?(?:function )?${name}\\(`, 'm');
  const m = startRe.exec(src);
  if (!m) throw new Error(`Функцію ${name} не знайдено у ${file}`);
  let start = m.index;
  // захопити попередній коментар: JSDoc-блок або рядки //
  const before = src.slice(0, start);
  const trimmed = before.replace(/[ \t]*$/, '');
  if (trimmed.endsWith('*/\n')) {
    const open = trimmed.lastIndexOf('/**');
    const body = trimmed.slice(open, trimmed.length - 3);
    if (open >= 0 && !body.includes('*/')) start = trimmed.lastIndexOf('\n', open) + 1;
  } else {
    const lines = trimmed.split('\n');
    lines.pop(); // порожній хвіст після останнього \n
    let k = lines.length;
    while (k > 0 && /^\s*\/\//.test(lines[k - 1])) k--;
    if (k < lines.length) start = lines.slice(0, k).join('\n').length + (k > 0 ? 1 : 0);
  }
  const end = src.indexOf(`\n${indent}}\n`, m.index);
  const text = src.slice(start, end + indent.length + 2);
  // зняти зайвий відступ
  return text
    .split('\n')
    .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
    .join('\n')
    .trim();
}

// ----------------------------------------------------------------- Контент

const S = results.sets;
const children = [];
const add = (...x) => x.forEach((e) => (Array.isArray(e) ? children.push(...e) : children.push(e)));

// ---- Титульна сторінка
const center = (t, o = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after == null ? 120 : o.after, before: o.before || 0, line: 320 }, children: [new TextRun({ text: t, font: FONT, size: o.size || BODY, bold: o.bold, italics: o.italics })] });
add(
  center('МІНІСТЕРСТВО ОСВІТИ І НАУКИ УКРАЇНИ', { bold: true }),
  center('Ужгородський національний університет'),
  center('Факультет інформаційних технологій', { after: 1800 }),
  center('ЗВІТ', { bold: true, size: 40, after: 80 }),
  center('з лабораторної роботи № 1', { size: 32, after: 200 }),
  center('«АПРОКСИМАЦІЯ ФУНКЦІЙ МЕТОДАМИ ІНТЕРПОЛЯЦІЇ ТА МНК»', { bold: true, size: 32, after: 200 }),
  center('Варіант № 6', { size: 32, after: 1800 })
);
add(
  new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 4800 }, spacing: { after: 60, line: 320 }, children: [new TextRun({ text: 'Виконав:', font: FONT, size: BODY })] }),
  new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 4800 }, spacing: { after: 60, line: 320 }, children: [new TextRun({ text: 'студент 4 курсу групи ІПЗ-1', font: FONT, size: BODY })] }),
  new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 4800 }, spacing: { after: 60, line: 320 }, children: [new TextRun({ text: 'спеціальність «Інженерія програмного забезпечення»', font: FONT, size: BODY })] }),
  new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 4800 }, spacing: { after: 360, line: 320 }, children: [new TextRun({ text: 'Белеканич Максим Олександрович', font: FONT, size: BODY, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 4800 }, spacing: { after: 60, line: 320 }, children: [new TextRun({ text: 'Перевірив:', font: FONT, size: BODY })] }),
  new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 4800 }, spacing: { after: 1500, line: 320 }, children: [new TextRun({ text: '______________________________', font: FONT, size: BODY })] }),
  center('Ужгород — 2026')
);

// ---- 1. Мета
add(h1('1. Мета роботи', true));
add(
  para('Засвоїти підходи до апроксимації даних — інтерполяційний поліном Лагранжа та метод найменших квадратів (МНК); набути практичних навичок їх реалізації мовою JavaScript та візуалізації результатів (графіки, залишки, анімація побудови).')
);
add(para('Постановка завдання: за варіантом № 6 розробити програмний продукт, що виконує обчислення для наборів із 5, 10 та 20 точок, будує 6 графіків (3 для Лагранжа та 3 для МНК) з обов’язковим автоматичним масштабуванням осей X та Y і можливістю миттєвого перемикання між наборами. Роботу виконано за вісьмома кроками алгоритму, наведеного в завданні: ТЗ → методологія → проєктування логіки → програмна реалізація → аналітичне тестування → моделювання взаємодії → документування → звіт про використання AI.'));

// ---- 2. Варіант
add(h1('2. Вхідні дані (варіант № 6)'));
add(para('У таблиці варіантів для № 6 задано 5 точок. Набори з 10 і 20 точок сформовано як вкладені (5 ⊂ 10 ⊂ 20) продовження тієї ж закономірності — спадного майже лінійного тренду `y ≈ 5.55 − 0.35·x` з похибкою вимірювання до ±0.1 (**припущення A1**, зафіксоване в `src/datasets.js`). Перші п’ять точок збігаються з варіантом. Якщо викладач надасть інші дані для 10/20 точок, їх достатньо замінити в масиві `POINTS_20`.'));
const pts = D.POINTS_20;
add(
  table(
    [900, 1000, 1000, 900, 1000, 1000, 900, 1000, 1000],
    ['№', 'x', 'y', '№', 'x', 'y', '№', 'x', 'y'].map((h) => h),
    [0, 1, 2, 3, 4, 5, 6].map((r) => {
      const row = [];
      for (let c = 0; c < 3; c++) {
        const i = c * 7 + r;
        if (i < 20) row.push({ t: String(i + 1) }, { t: String(pts[i][0]) }, { t: String(pts[i][1]), fill: i < 5 ? 'E2F0D9' : i < 10 ? 'FFF2CC' : undefined });
        else row.push('', '', '');
      }
      return row;
    }),
    { caption: 'Набір точок варіанта № 6 (зелений — задано варіантом, жовтий — додано для 10 точок, без заливки — для 20 точок)', align: AlignmentType.CENTER }
  )
);

// ---- 3. ТЗ
add(h1('3. Технічне завдання (крок 1)'));
add(para('Повний текст — у `docs/01-tz.md`. Нижче наведено стислий виклад.'));
add(h2('3.1. Функціональні вимоги'));
add(
  table(
    [1000, 8639],
    ['ID', 'Вимога'],
    [
      ['FR-1', 'Вибір набору: 5 / 10 / 20 точок (варіант 6) або власний набір, введений у форму.'],
      ['FR-2', 'Інтерполяційний поліном Лагранжа; контроль формою Ньютона (таблиця поділених різниць у інтерфейсі).'],
      ['FR-3', 'МНК-апроксимація поліномом ступеня m ∈ {2, 3, 4}: дизайн-матриця, QR-розклад Хаусхолдера (без нормальних рівнянь), розрахункові значення та залишки rᵢ = yᵢ − ŷᵢ.'],
      ['FR-4', 'Графік: точки, крива інтерполяції, крива МНК; діаграма залишків (штрихи, маркери, підписана нульова лінія).'],
      ['FR-5', 'Перемикач «Інтерполяція / МНК / Усі».'],
      ['FR-6', 'Анімація інтерполяції: покрокове додавання вузлів, плавне оновлення кривої, виділення активного вузла.'],
      ['FR-7', 'Анімація МНК: поліном «росте» від горизонтальної лінії до остаточної кривої, залишки з’являються відрізками.'],
      ['FR-8', '**Автомасштабування осей X та Y** за min/max функції (також під час анімації).'],
      ['FR-9', 'Обчислення для 5, 10 і 20 точок; 6 графіків (3 Лагранж + 3 МНК).'],
      ['FR-10', 'Миттєве перемикання наборів 5/10/20; режим порівняння; таблиця метрик.'],
      ['FR-11', 'Екстраполяція ±20 % для демонстрації ризиків.'],
    ],
    { caption: 'Функціональні вимоги', leftAll: true }
  )
);
add(h2('3.2. Інтерфейс та обмеження'));
add(
  ...bullets([
    'Адаптивне полотно Canvas (HiDPI), осі з підписами й «гарними» позначками, сітка, легенда, підказки при наведенні (координати, значення кривих, похибка в точці), контрастні кольори, світла й темна теми.',
    'JavaScript без бібліотек; відкривається з `index.html` без сервера; тести — `node:test`.',
    'Вузли xᵢ попарно різні; m ≤ n − 1; власний набір — від 2 до 60 точок.',
    'Критерії приймання: усі шість графіків без виходу кривої за видиму область; |p(xᵢ) − yᵢ| < 10⁻⁹; ‖Aᵀr‖ ≈ 0 для МНК; автотести проходять.',
  ])
);

// ---- 4. Методологія
add(h1('4. Вибір методології (крок 2)'));
add(para('Обрано **Agile** (спрощений Scrum із короткими ітераціями та Kanban-дошкою «To do / In progress / Done»). Проєкт малий, виконується одним розробником; математичне ядро відоме заздалегідь, а візуальна частина (масштабування, анімації, підказки) найкраще допрацьовується ітераційно, маючи після кожного кроку працюючий результат. Waterfall і V-model дають зайві накладні витрати на документи, Spiral орієнтований на великі ризикові системи.'));
add(
  table(
    [1000, 3300, 3039, 2300],
    ['Ітерація', 'Мета', 'Результат (DoD)', 'Коміт'],
    [
      ['0', 'ТЗ, методологія, план', 'docs/01-tz.md, 02-methodology.md', 'docs: ТЗ та вибір методології'],
      ['1', 'Проєктування', 'блок-схеми, таблиці ідентифікаторів', 'docs: блок-схеми…'],
      ['2', 'Математичне ядро', 'math.js, datasets.js, 30 тестів', 'feat(core): …'],
      ['3', 'Візуалізація', 'Chart, UI, автомасштаб, залишки, підказки', 'feat(ui): …'],
      ['4', 'Анімація та порівняння', '2 анімації, 6 графіків, перемикачі', 'feat(anim): …'],
      ['5', 'Тестування, документація', 'аналіз, діаграми, звіт, AI-лог', 'test: … / docs: …'],
    ],
    { caption: 'Ітерації розробки та відповідні коміти', leftAll: true, size: 21 }
  )
);

// ---- 5. Теорія
add(h1('5. Теоретичні відомості'));
add(h2('5.1. Інтерполяційний поліном Лагранжа'));
add(para('Для n + 1 різних вузлів x₀, …, xₙ існує єдиний поліном pₙ(x) степеня не вище n, що приймає значення yᵢ у вузлах:'));
add(formula('pₙ(x) = Σₖ yₖ·Lₖ(x),   Lₖ(x) = Πⱼ≠ₖ (x − xⱼ) / (xₖ − xⱼ)', '1'));
add(para('Форма Ньютона використовує поділені різниці f[xᵢ, …, xᵢ₊ⱼ] і схему Горнера; обидві форми задають один і той самий поліном, що використано для взаємної перевірки.'));
add(formula('pₙ(x) = a₀ + a₁(x − x₀) + a₂(x − x₀)(x − x₁) + … + aₙ Πⱼ (x − xⱼ)', '2'));
add(h2('5.2. Метод найменших квадратів'));
add(para('МНК шукає поліном g(x; θ) ступеня m ≪ n, що мінімізує суму зважених квадратів відхилень:'));
add(formula('min_θ Σᵢ ωᵢ (yᵢ − g(xᵢ; θ))²,   ωᵢ > 0', '3'));
add(para('У матричній формі це задача min ‖A·a − y‖₂ з матрицею Вандермонда Aᵢⱼ = tᵢʲ. Нормальні рівняння AᵀA·a = Aᵀy підносять число обумовленості до квадрата, тому розв’язок виконано **QR-розкладом методом відображень Хаусхолдера**: A = Q·R, R·a = Qᵀy. Змінну x нормовано до t = (x − c)/s ∈ [−1; 1].'));
add(formula('rᵢ = yᵢ − ŷᵢ,   SSE = Σ rᵢ²,   R² = 1 − SSE / Σ(yᵢ − ȳ)²', '4'));

// ---- 6. Проєктування
add(h1('6. Проєктування логіки (крок 3)', true));
add(para('Застосунок складається з чотирьох незалежних модулів: ядро (`math.js`, `datasets.js`), таймлайни анімацій (`animation.js`), відображення (`chart.js`) і контролер (`app.js`). Математичне ядро не залежить від DOM і тестується в Node.'));
add(diagram('architecture', 'Архітектура застосунку (компонентна діаграма)', 16, 10));
add(h2('6.1. Блок-схеми алгоритмів'));
add(diagram('flow-main', 'Блок-схема головного сценарію', 13, 20));
add(diagram('flow-lagrange', 'Блок-схема обчислення полінома Лагранжа', 10.5, 21));
add(diagram('flow-mnk', 'Блок-схема МНК через QR-розклад', 10.5, 21));
add(diagram('flow-autoscale', 'Блок-схема автомасштабування осей', 13, 21));
add(diagram('flow-anim', 'Блок-схема циклу анімації', 13, 21));

add(h2('6.2. Таблиці ідентифікаторів'));
add(
  table(
    [2200, 1800, 5639],
    ['Ідентифікатор', 'Тип', 'Призначення'],
    [
      ['xs, ys', 'number[]', 'Вузли та значення функції'],
      ['n, m', 'number', 'Кількість вузлів; ступінь полінома МНК (2, 3, 4)'],
      ['center, scale', 'number', 'Параметри нормування t = (x − center)/scale'],
      ['coef', 'number[]', 'Коефіцієнти МНК-полінома в змінній t'],
      ['fitted, residuals', 'number[]', 'Розрахункові значення ŷᵢ та залишки rᵢ'],
      ['A, R, qtb', 'number[][]', 'Дизайн-матриця, трикутна матриця QR, вектор Qᵀb'],
      ['table, coefs', 'number[][]', 'Поділені різниці та коефіцієнти Ньютона'],
      ['state.setKey', "'5'|'10'|'20'|'custom'", 'Поточний набір точок'],
      ['state.mode', "'interp'|'mnk'|'all'", 'Режим відображення кривих'],
      ['state.view', "'single'|'compare'", 'Один набір чи порівняння 5·10·20'],
      ['state.degree, extrap, focus', 'number, boolean', 'Ступінь m; екстраполяція ±20 %; фокус на вузлах'],
      ['state.anim', 'object | null', 'Активна анімація (тип, час старту, швидкість, кеш кривих)'],
      ['view, target', '{xmin,xmax,ymin,ymax}', 'Поточні та цільові межі осей (автомасштаб)'],
      ['hover', 'object | null', 'Позиція курсору для підказки'],
      ['TREND', '{a, b}', 'Опорна лінія y = a + b·x (для аналізу)'],
    ],
    { caption: 'Змінні', leftAll: true, size: 20 }
  )
);
add(
  table(
    [3000, 1500, 5139],
    ['Функція', 'Модуль', 'Призначення'],
    [
      ['lagrangeBasis(xs, k, x)', 'math.js', 'Базисний многочлен Lₖ(x)'],
      ['lagrangeEval(xs, ys, x)', 'math.js', 'Значення полінома Лагранжа'],
      ['dividedDifferences(xs, ys)', 'math.js', 'Таблиця поділених різниць, коефіцієнти Ньютона'],
      ['newtonEval(xs, coefs, x)', 'math.js', 'Значення полінома Ньютона (Горнер)'],
      ['designMatrix(ts, m)', 'math.js', 'Матриця Вандермонда tᵢʲ'],
      ['solveLeastSquares(A, b)', 'math.js', 'Задача найменших квадратів, QR Хаусхолдера'],
      ['fitPolynomial(xs, ys, m, w)', 'math.js', 'Модель МНК: predict, fitted, residuals'],
      ['metrics(ys, fitted)', 'math.js', 'sse, rmse, mae, maxAbs, r2'],
      ['autoScale(values, opts)', 'math.js', 'Межі осі за min/max із відступом'],
      ['niceTicks(min, max, n)', 'math.js', '«Гарні» позначки осі'],
      ['parsePoints(text)', 'datasets.js', 'Розбір власного набору'],
      ['interpFrame, mnkFrame', 'animation.js', 'Стан кадру анімації за часом'],
      ['Chart.computeTarget()', 'chart.js', 'Автомасштабування осей'],
      ['Chart.draw()', 'chart.js', 'Малювання: осі, сітка, шари, легенда, підказка'],
      ['App.render(), startAnim()', 'app.js', 'Побудова моделей, запуск анімацій'],
    ],
    { caption: 'Функції', leftAll: true, size: 20 }
  )
);
add(
  table(
    [2200, 7439],
    ['Об’єкт / клас', 'Призначення'],
    [
      ['LabMath', 'Простір імен математичного ядра (UMD: window.LabMath / module.exports)'],
      ['LabData', 'Набори даних варіанта 6, parsePoints'],
      ['LabAnim', 'Допоміжні функції анімації: easeInOut, interpFrame, blend, mnkFrame'],
      ['Chart', 'Клас графіка на Canvas (модель → пікселі)'],
      ['model', 'Опис шарів графіка: points, curves, segments, shade, zeroLine, legend'],
    ],
    { caption: 'Об’єкти та класи', leftAll: true, size: 20 }
  )
);

// ---- 7. Реалізація
add(h1('7. Програмна реалізація (крок 4)', true));
add(para('Код розміщено в репозиторії; структура проєкту: `index.html`, `src/` (math, datasets, animation, chart, app, style), `tests/`, `tools/`, `docs/`, `report/`. Нижче наведено ключові фрагменти.'));
add(h2('7.1. Інтерполяція Лагранжа та форма Ньютона'));
add(...code(extractFn('src/math.js', 'lagrangeEval')));
add(...code(extractFn('src/math.js', 'dividedDifferences')));
add(...code(extractFn('src/math.js', 'newtonEval')));
add(h2('7.2. МНК через QR-розклад Хаусхолдера'));
add(...code(extractFn('src/math.js', 'solveLeastSquares'), 16));
add(...code(extractFn('src/math.js', 'fitPolynomial'), 16));
add(h2('7.3. Автомасштабування осей'));
add(para('Межі осі Y обчислюються щокадру за min/max усіх значень, що мають бути видимі: вузлів, вибірки кривих (400 точок) і відрізків залишків; нескінченні значення ігноруються, для пласких даних діапазон розширюється, додається відступ 8 %. Для графіка залишків завжди включається нуль. Під час анімації межі плавно наближаються до цільових.'));
add(...code(extractFn('src/math.js', 'autoScale')));
add(...code(extractFn('src/chart.js', 'computeTarget', '    '), 16));
add(h2('7.4. Анімації'));
add(para('Анімації керуються часом (`performance.now()`), а не лічильником кадрів, тому тривалість не залежить від частоти монітора. Інтерполяція: на кроці k додається вузол k, крива плавно переходить від pₖ₋₁(x) до pₖ(x) (700 мс) і тримається 450 мс; активний вузол виділено кольором і збільшеним маркером, ще не додані вузли показано порожніми колами. МНК: ŷ_φ(x) = ȳ + φ·(ŷ(x) − ȳ), φ: 0 → 1; відрізки залишків від (xᵢ, ŷ_φ(xᵢ)) до (xᵢ, yᵢ) з’являються по черзі зліва направо.'));
add(...code(extractFn('src/animation.js', 'interpFrame') + '\n\n' + extractFn('src/animation.js', 'mnkFrame'), 16));
add(h2('7.5. Інтерфейс користувача'));
add(...shot('ui-full-10', 'Загальний вигляд застосунку (набір із 10 точок, режим «Усі»)', 14, 22));
add(...shot('tooltip-node', 'Підказка при наведенні на вузол: y, p(x), ŷ та залишок r', 15.5, 10));
add(para('Перемикач «Інтерполяція / МНК / Усі» керує відображенням кривих; кнопки 5/10/20 миттєво перемикають набір; прапорець «Фокус на вузлах» обмежує масштаб за вузлами (корисно для 20 точок, де Лагранж виходить за ±350); прапорець «Екстраполяція ±20 %» розширює область за межі вузлів із заштрихованими зонами.'));
add(...shot('single-5', 'Набір із 5 точок: Лагранж і МНК (m = 2), діаграма залишків', 15.5, 12));
add(...shot('single-10', 'Набір із 10 точок: Лагранж коливається біля країв інтервалу', 15.5, 12));
add(...shot('single-20', 'Набір із 20 точок: ефект Рунге — автомасштаб показує розмах ±350, МНК лишається поруч із вузлами', 15.5, 12));
add(...shot('single-20-focus', 'Той самий набір у режимі «Фокус на вузлах»: видно поведінку Лагранжа навколо вузлів', 15.5, 12));
add(...shot('single-20-extrap', 'Екстраполяція ±20 % для 20 точок: поліном Лагранжа різко «злітає» за межами вузлів', 15.5, 12));
const FIG_EXTRAP = figN;
add(h2('7.6. Шість графіків і порівняння 5·10·20'));
add(...shot('compare-6-charts', 'Подання «Порівняння 5·10·20»: верхній ряд — Лагранж, нижній — МНК (6 графіків, у кожного свій автомасштаб)', 16, 12));
add(...shot('compare-6-charts-focus', 'Те саме з увімкненим «Фокусом на вузлах»', 16, 12));
add(h2('7.7. Анімації'));
add(...shot('anim-interp-step2', 'Анімація інтерполяції, крок 2 з 10 (активний вузол виділено)', 14, 11));
add(...shot('anim-interp-step5', 'Анімація інтерполяції, крок 5 з 10: крива переходить до нового вузла, масштаб осей підлаштовується', 14, 11));
add(...shot('anim-interp-step9', 'Анімація інтерполяції, крок 9 з 10', 14, 11));
add(...shot('anim-mnk-early', 'Анімація МНК: поліном «росте» від горизонтальної лінії ȳ, залишки з’являються зліва направо', 14, 11));
add(...shot('anim-mnk-late', 'Анімація МНК: поліном майже досяг остаточної форми, залишки зменшилися', 14, 11));

// ---- 8. Тестування
add(h1('8. Аналітичне тестування та порівняльний аналіз (крок 5)', true));
add(h2('8.1. Автоматичні тести'));
add(para(`Реалізовано ${testPass} автотестів (\`npm test\`, вбудований \`node:test\`) — усі проходять. Вони перевіряють: проходження полінома через вузли (через базисні многочлени без ярлика), властивості Lₖ(xⱼ) = δₖⱼ та ΣLₖ = 1, точне відтворення многочлена степеня ≤ n − 1, збіжність форм Лагранжа й Ньютона, ортогональність залишків МНК стовпцям матриці (‖Aᵀr‖ ≈ 0), збіг із розв’язком нормальних рівнянь як еталоном, випадок m = n − 1 (МНК = інтерполяція), стійкість при зсуві вузлів, ваги ωᵢ, коректні помилки для вироджених даних, межі autoScale (пласкі дані, нескінченності, нуль для залишків), «гарні» позначки осей, парсер власного набору, таймлайни анімацій.`));
add(h2('8.2. Методика порівняльного аналізу'));
add(para('Опорною функцією для оцінки похибки **між вузлами** є лінія тренду `y = 5.55 − 0.35·x`, за якою згенеровано точки 6…20. Похибки обчислено на сітці з 2001 точки всередині [x₁; xₙ]; екстраполяцію оцінено на відстані 10 % довжини інтервалу за його межами; узагальнювальну здатність — перехресною перевіркою «виключи один» (LOO) за внутрішніми вузлами. Таблиці згенеровано скриптом `tools/analysis.js`.'));

const LG = (fn) => D.SIZES.map((n) => fn(S[n]));
add(
  table(
    [4239, 1800, 1800, 1800],
    ['Показник (Лагранж)', '5 точок', '10 точок', '20 точок'],
    [
      ['Похибка у вузлах', '0', '0', '0'],
      ['min p(x) на [x₁; xₙ]', ...LG((s) => f(s.lagrange.min, 3))],
      ['max p(x) на [x₁; xₙ]', ...LG((s) => f(s.lagrange.max, 3))],
      ['Розмах даних y', ...LG((s) => f(s.dataRange, 3))],
      ['Константа Лебега Λ', ...LG((s) => f(s.lagrange.lebesgue, 5))],
      ['RMSE відносно тренду між вузлами', ...LG((s) => f(s.lagrange.rmse, 4))],
      ['max |p − тренд| між вузлами', ...LG((s) => f(s.lagrange.maxErr, 4))],
      ['Похибка екстраполяції, +10 %', ...LG((s) => f(s.lagrange.extrapRight, 4))],
      ['LOO RMSE', ...LG((s) => f(s.lagrange.loo.rmse, 4))],
      ['max |Лагранж − Ньютон|', ...LG((s) => exp2(s.lagrange.newtonDiff))],
      ['Час кривої з 400 точок, мс', ...LG((s) => f(s.lagrange.msPerCurve, 3))],
    ],
    { caption: 'Інтерполяція Лагранжа: показники для 5, 10 та 20 точок', size: 21 }
  )
);
for (const m of [2, 3, 4]) {
  add(
    table(
      [4239, 1800, 1800, 1800],
      [`Показник (МНК, m = ${m})`, '5 точок', '10 точок', '20 точок'],
      [
        ['SSE = Σ rᵢ²', ...LG((s) => (s.mnk[m].sse < 1e-12 ? exp2(s.mnk[m].sse) : f(s.mnk[m].sse, 4)))],
        ['RMSE у вузлах', ...LG((s) => (s.mnk[m].rmse < 1e-9 ? exp2(s.mnk[m].rmse) : f(s.mnk[m].rmse, 4)))],
        ['max |rᵢ|', ...LG((s) => (s.mnk[m].maxAbs < 1e-9 ? exp2(s.mnk[m].maxAbs) : f(s.mnk[m].maxAbs, 4)))],
        ['R²', ...LG((s) => f(s.mnk[m].r2, 5))],
        ['RMSE відносно тренду між вузлами', ...LG((s) => f(s.mnk[m].trend.rmse, 4))],
        ['max |ŷ − тренд| між вузлами', ...LG((s) => f(s.mnk[m].trend.maxErr, 4))],
        ['Похибка екстраполяції, +10 %', ...LG((s) => f(s.mnk[m].trend.extrapRight, 4))],
        ['LOO RMSE', ...LG((s) => f(s.mnk[m].loo.rmse, 4))],
      ],
      { caption: `МНК, ступінь m = ${m}: показники для 5, 10 та 20 точок`, size: 21 }
    )
  );
}
add(h2('8.3. Стійкість: QR проти нормальних рівнянь'));
add(para('Для 20 точок із вузлами, зсунутими на 999 (x = 1000…1019), коефіцієнти знайдено у «сирій» змінній x. Еталон — QR із нормуванням x. Показано максимальне абсолютне відхилення значень функції у вузлах.'));
add(
  table(
    [1500, 4069, 4070],
    ['m', 'QR без нормування', 'Нормальні рівняння (Гаус)'],
    results.stability.map((r) => [String(r.m), exp2(r.qrRaw), Number.isFinite(r.normalEq) ? exp2(r.normalEq) : 'збій']),
    { caption: 'Точність розв’язку МНК на зсунутих вузлах', size: 21 }
  )
);
const TAB_STAB = tabN;
add(h2('8.4. Висновки за результатами аналізу'));
const s5 = S[5], s10 = S[10], s20 = S[20];
add(
  ...numbered([
    `**Лагранж** точно відтворює вузли, але між ними поводиться дедалі гірше: розмах полінома відносно розмаху даних — ${((s5.lagrange.max - s5.lagrange.min) / s5.dataRange).toFixed(2)}× (5 точок), ${((s10.lagrange.max - s10.lagrange.min) / s10.dataRange).toFixed(2)}× (10) та **${((s20.lagrange.max - s20.lagrange.min) / s20.dataRange).toFixed(1)}×** (20 точок), крива виходить за межі [${f(s20.lagrange.min, 1)}; ${f(s20.lagrange.max, 1)}] при діапазоні даних ${f(s20.dataRange, 1)}. Це **ефект Рунге**; константа Лебега зростає з ${f(s5.lagrange.lebesgue, 3)} до ${f(s20.lagrange.lebesgue, 5)}, тобто похибки вимірювання (±0.1) підсилюються в тисячі разів.`,
    `**МНК** (m = 2) зберігає стабільну якість при зростанні кількості точок: R² = ${f(s5.mnk[2].r2, 5)} / ${f(s10.mnk[2].r2, 5)} / ${f(s20.mnk[2].r2, 5)}; RMSE між вузлами відносно тренду — ${f(s5.mnk[2].trend.rmse, 3)} / ${f(s10.mnk[2].trend.rmse, 3)} / ${f(s20.mnk[2].trend.rmse, 3)}, тоді як у Лагранжа — ${f(s5.lagrange.rmse, 3)} / ${f(s10.lagrange.rmse, 3)} / ${f(s20.lagrange.rmse, 1)}.`,
    `**Екстраполяція** (+10 %): похибка Лагранжа ${f(s5.lagrange.extrapRight, 3)} / ${f(s10.lagrange.extrapRight, 3)} / ${exp2(s20.lagrange.extrapRight)} проти ${f(s5.mnk[2].trend.extrapRight, 3)} / ${f(s10.mnk[2].trend.extrapRight, 3)} / ${f(s20.mnk[2].trend.extrapRight, 3)} у МНК; поліном високого ступеня для екстраполяції непридатний.`,
    `**Узагальнення (LOO):** RMSE Лагранжа — ${f(s5.lagrange.loo.rmse, 3)} / ${f(s10.lagrange.loo.rmse, 3)} / ${f(s20.lagrange.loo.rmse, 1)}; МНК (m = 2) — ${f(s5.mnk[2].loo.rmse, 3)} / ${f(s10.mnk[2].loo.rmse, 3)} / ${f(s20.mnk[2].loo.rmse, 3)}.`,
    `**Ступінь m:** для майже лінійних даних підвищення m з 2 до 4 майже не зменшує SSE (20 точок: ${f(s20.mnk[2].sse, 4)} → ${f(s20.mnk[4].sse, 4)}), а для 5 точок при m = 4 МНК вироджується в інтерполяцію (SSE = ${exp2(s5.mnk[4].sse)}) і втрачає згладжувальну властивість.`,
    `**Числова стійкість:** нормування x і QR-розклад суттєво точніші за нормальні рівняння на зсунутих вузлах (табл. ${TAB_STAB}: ${exp2(results.stability[2].qrRaw)} проти ${exp2(results.stability[2].normalEq)} для m = 4). Форми Лагранжа й Ньютона збігаються (для 20 точок розбіжність ${exp2(s20.lagrange.newtonDiff)} відображає погану обумовленість задачі).`,
    `**Швидкодія:** побудова кривої з 400 точок — ${f(s5.lagrange.msPerCurve, 2)} / ${f(s10.lagrange.msPerCurve, 2)} / ${f(s20.lagrange.msPerCurve, 2)} мс, що набагато менше за кадр анімації (16 мс).`,
  ])
);

// ---- 9. Взаємодія
add(h1('9. Моделювання взаємодії компонентів (крок 6)', true));
add(para('Діаграми послідовності показують, як модулі взаємодіють у ключових сценаріях; компонентну діаграму наведено в розділі 6 (рис. 1).'));
add(diagram('seq-select', 'Діаграма послідовності: вибір набору точок і побудова графіків', 16, 11));
add(diagram('seq-anim', 'Діаграма послідовності: анімація інтерполяції', 16, 12));
add(diagram('seq-hover', 'Діаграма послідовності: підказка при наведенні', 16, 9));

// ---- 10. AI
add(h1('10. Звіт про використання AI (крок 8)', true));
add(h2('10.1. Декларація ролей'));
add(para('Інструмент: Claude Code (Anthropic), модель Claude Sonnet 5.5. **Рівень залучення AI — високий**: AI виконав практично всю розробку (код, тести, діаграми, документи) за запитом студента; студент отримав варіант № 6, надав завдання та скріншоти, ставив вимоги, перевіряє роботу запуском застосунку й автотестів, публікує репозиторій та відповідає за захист роботи.'));
add(
  table(
    [1700, 7939],
    ['Хто', 'Що робив'],
    [
      ['Студент', 'Отримав варіант № 6 і текст завдання; надав скріншоти таблиці варіантів та зразка AI-логу; сформулював запит; перевіряє результат (index.html, npm test); створює публічне посилання на чат, скріншоти діалогу та публікує репозиторій на GitHub.'],
      ['AI (Claude Code)', 'ТЗ і вибір методології; блок-схеми й таблиці ідентифікаторів; інтерполяція Лагранжа (+ Ньютон); МНК через QR Хаусхолдера; автомасштабування; Canvas-графіки, анімації, подання з шести графіків; автотести та скрипт аналізу; діаграми взаємодії; звіт, README, локальна історія git-комітів.'],
      ['Спільно', 'ТЗ (вимоги — з методички студента, формулювання — AI); припущення A1 про набори 10/20 точок (запропонував AI, студент підтверджує або замінює даними викладача).'],
    ],
    { caption: 'Декларація ролей', leftAll: true, size: 21 }
  )
);
add(h2('10.2. Промт-інжиніринг'));
add(
  table(
    [700, 5239, 3700],
    ['№', 'Запит', 'Результат'],
    [
      ['P1', '«Розробити програмний продукт відповідно до варіанту завдання лабораторної роботи № 1. Алгоритм виконання: 1. ТЗ … 8. AI Interaction Log … Примітка: обчислення для 5, 10 та 20 точок; 6 графіків; автоматичне масштабування осей X та Y (самостійне обчислення min та max функції); перемикання між наборами 5/10/20. Я 6 варіант» (+ файл методички та два скріншоти)', 'Повний комплект: ТЗ, методологія, діаграми, застосунок, тести, аналіз, звіт, лог'],
      ['P2', '«Це буде папка для навчання, зараз скину лабки»', 'Підключено робочу папку study'],
      ['P3', '«…новий чат з контекстом (або підчат) і виконує хай в ньому» / «так само як і минулий чат»', 'Завдання виконано окремим підчатом із повним контекстом'],
      ['P4', 'Вимога методички: «обчислити оцінки коефіцієнтів через стійкий метод лінійної алгебри, не використовувати нормальні рівняння»', 'QR Хаусхолдера з нормуванням x; нормальні рівняння лише як еталон у тесті та в аналізі'],
      ['P5', 'Вимога до анімації МНК: «плавно “виростити” поліном від горизонтальної лінії до остаточної кривої; поступово відображати залишки відрізками»', 'ŷ_φ = ȳ + φ(ŷ − ȳ), поступова поява відрізків'],
    ],
    { caption: 'Найзначущі запити до AI', leftAll: true, size: 20 }
  )
);
add(h2('10.3. Скріншоти та посилання'));
add(para('Публічне посилання на чат: **[вставте посилання: Share → Create public link]**', { noIndent: true }));
add(para('Скріншоти ключових фрагментів діалогу з AI (вставити нижче):', { noIndent: true }));
for (const t of ['початковий запит (P1) із прикладеними файлами та скріншотами', 'план виконання, створення ТЗ та вибір методології', 'запуск автотестів і результат порівняльного аналізу', 'виявлення та виправлення помилок (п. 10.4)']) {
  add(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 160 },
      border: { top: { style: BorderStyle.DASHED, size: 6, color: '808080' }, bottom: { style: BorderStyle.DASHED, size: 6, color: '808080' }, left: { style: BorderStyle.DASHED, size: 6, color: '808080' }, right: { style: BorderStyle.DASHED, size: 6, color: '808080' } },
      children: [new TextRun({ text: `[Місце для скріншота: ${t}]`, font: FONT, size: 24, italics: true, color: '808080' })],
    })
  );
}
add(h2('10.4. Критичний аналіз: помилки AI та їх виправлення'));
add(
  ...numbered(
    [
      '**Тест, який не міг впасти (основний випадок).** AI написав тест «поліном Лагранжа проходить через вузли» через `lagrangeEval(xs, ys, xs[i])`, але в цій функції є «ярлик»: при `x === xₖ` повертається `yₖ` без обчислень. Тест перевіряв ярлик, а не алгоритм. Помилку виявлено під час розробки таблиці вузлів: щоб показати нетривіальне `p(xᵢ) − yᵢ`, його довелося рахувати за формою Ньютона, бо Лагранж із ярликом завжди дає 0. **Виправлення:** перевірку переписано через базисні многочлени без ярлика (Σ yₖ·Lₖ(xᵢ) = yᵢ); справжню перевірку алгоритму забезпечують тести на відтворення многочлена та на збіжність форм Лагранжа й Ньютона.',
      '**Колізія ключів у скрипті аналізу.** Вираз `{...trendErrors(...), max: Math.max(...inner)}` мав два поля `max`: друге мовчки перезаписало похибку відносно тренду максимумом самого полінома. У таблиці «max |p − тренд|» для 5 точок з’явилось 5.2 — рівно max p(x). Підозру викликав збіг похибки зі значенням функції. **Виправлення:** поле перейменовано в `maxErr`, таблицю згенеровано заново (0.067 / 0.746 / 365.3).',
      '**Округлення, що приховало похибку.** `fmt(v, 2)` округлював малі числа до «0»: у порівнянні QR та нормальних рівнянь вийшло, що нормальні рівняння мають відхилення 0, тобто кращі за QR, — що суперечить теорії. Прямий запуск показав справжні значення 5.7·10⁻⁴ і 2.3·10⁻³. **Виправлення:** експоненціальний формат; висновок про стійкість тепер спирається на правильні числа.',
      '**Дрібні помилки.** Команда `node --test tests/` не працює у Node 22 (каталог трактується як файл) — замінено на `node --test`; Mermaid не прийняв `;` у підписі повідомлення діаграми послідовності — замінено на кому.',
    ],
    'num2'
  )
);
add(para('**Висновок.** AI швидко створює працюючий код, але тести та числові звіти потребують критичного перегляду: помилки були «тихими» (тест, що проходить завжди; таблиця з правдоподібними, але хибними числами) і виявлялися лише перевіркою результату на відповідність здоровому глузду й теорії.'));
add(h2('10.5. Таблиця внеску'));
add(para('Повна таблиця — у файлі `AI-Interaction-Log.xlsx` (аркуш «AI Interaction Log» за зразком із методички, аркуш «Підсумок» — частки формулами). Скорочена версія:'));
const log = [
  ['Завдання', 'Отримання варіанта та вимог', 'Самостійно'],
  ['ТЗ', 'Опис технічного завдання', 'Спільно'],
  ['Вибір методології', 'Agile, 5 ітерацій', 'AI'],
  ['Проєктування логіки', 'Блок-схеми, таблиці ідентифікаторів', 'AI'],
  ['Проєктування логіки', 'Алгоритм Лагранжа (+ Ньютон)', 'AI'],
  ['Програмна реалізація', 'МНК: QR Хаусхолдера, нормування x', 'AI'],
  ['Програмна реалізація', 'Автомасштабування осей X, Y', 'AI'],
  ['Програмна реалізація', 'Canvas-графіки, підказки, адаптивність', 'AI'],
  ['Програмна реалізація', 'Анімації інтерполяції та МНК', 'AI'],
  ['Програмна реалізація', '6 графіків, перемикач 5/10/20', 'AI'],
  ['Тестування', 'Автотести та порівняльний аналіз', 'AI'],
  ['Моделювання взаємодії', 'Діаграми послідовності', 'AI'],
  ['Документування', 'Звіт, README, git-коміти', 'AI'],
  ['Контроль якості', 'Запуск, перевірка результатів', 'Самостійно'],
  ['Публікація', 'GitHub, публічне посилання на чат', 'Самостійно'],
];
add(
  table(
    [600, 2700, 4039, 2300],
    ['№п.п', 'Компонент системи', 'Назва задачі', 'Хто розробляв'],
    log.map((r, i) => [String(i + 1), r[0], r[1], { t: r[2], fill: r[2] === 'AI' ? 'DDEBF7' : r[2] === 'Спільно' ? 'FFF2CC' : 'E2F0D9' }]),
    { caption: 'Внесок у розробку (скорочена версія Excel-таблиці)', size: 20, leftAll: false }
  )
);

// ---- 11. Контрольні запитання
add(h1('11. Відповіді на контрольні запитання', true));
const QA = [
  ['1. У чому різниця між інтерполяцією та апроксимацією МНК для табличних даних?', 'Інтерполяція будує функцію, яка проходить точно через усі вузли (g(xᵢ) = yᵢ); її ступінь n − 1 зростає з кількістю точок, а похибки вимірювань відтворюються й підсилюються (ефект Рунге, Λ = 5889 для 20 вузлів). МНК шукає функцію невисокого ступеня m ≪ n, яка не обов’язково проходить через точки, але мінімізує суму квадратів відхилень; вона згладжує шум. У роботі: SSE Лагранжа в вузлах = 0, але між вузлами для 20 точок він відхиляється від тренду на сотні одиниць, тоді як МНК — на соті.'],
  ['2. У чому різниця між інтерполяцією та екстраполяцією? Приклади.', 'Інтерполяція — обчислення значень усередині інтервалу [x₀; xₙ] (відновлення проміжних значень таблиці, масштабування зображень, проміжні кадри анімації). Екстраполяція — оцінка поза інтервалом (прогноз попиту, траєкторії руху, рівня забруднення). Екстраполяція ненадійна: у роботі при виході на 10 % за межі 20 вузлів похибка Лагранжа — ' + exp2(S[20].lagrange.extrapRight) + '.'],
  ['3. Як реалізувати інтерполяцію Лагранжа на JavaScript? Які труднощі?', 'Подвійний цикл: зовнішній за k, внутрішній множить (x − xⱼ)/(xₖ − xⱼ) для j ≠ k (див. розділ 7.1), складність O(n²) на точку. Труднощі: ділення на нуль при збігу вузлів (перевіряється валідатором), втрата точності при великих n та рівновіддалених вузлах (константа Лебега росте експоненціально), повторні обчислення при зміні вузлів. Покращення: барицентрична форма (O(n) на точку), вузли Чебишова, кускова (сплайнова) інтерполяція.'],
  ['4. Як використати екстраполяцію для прогнозування (економіка, фізика)?', 'Підібрати за історичними даними просту модель (лінійну або поліном низького ступеня за МНК), обчислити її значення для наступних періодів (динаміка продажів, ВВП, температура, шлях тіла за відомою кінематикою) і супроводжувати прогноз довірчим інтервалом. Поліноми високого ступеня для цього не годяться — див. результати аналізу.'],
  ['5. Реалізуйте код інтерполяційного полінома Ньютона.', 'Реалізовано у `src/math.js` (функції dividedDifferences та newtonEval):\n' + extractFn('src/math.js', 'dividedDifferences') + '\n\n' + extractFn('src/math.js', 'newtonEval') + '\nВикористання: `const {coefs} = dividedDifferences(xs, ys); const y = newtonEval(xs, coefs, 2.5);`'],
  ['6. Які елементи HTML і прийоми CSS зручні для побудови та анімації графіків?', 'Елемент `<canvas>` (малювання кривих, точок, відрізків; кілька шарів — окремі канвас або порядок малювання), `devicePixelRatio` для чіткості на HiDPI, CSS Grid/Flex і `aspect-ratio` для адаптивної сітки графіків, медіа-запити, CSS-змінні для тем і кольорів, `ResizeObserver` для перерахунку розміру. Альтернатива — SVG (для невеликої кількості елементів). Виділення точок — колір, радіус і «ореол», залишки — відрізки.'],
  ['7. Які події або механізми JavaScript доцільні для покрокової анімації?', '`requestAnimationFrame` (синхронізація з частотою екрана, пауза у фоновій вкладці) разом із `performance.now()`: стан кадру обчислюється за часом від старту, а не за лічильником кадрів (функції interpFrame, mnkFrame); `setTimeout`/`setInterval` менш точні. Покроковість — таймлайн із фаз «перехід» і «пауза», плавність — функція easeInOut, черги оновлень — масив попередньо обчислених кривих.'],
  ['8. Як масштабування та нормалізація x впливають на числову стійкість?', 'Матриця Вандермонда для x ≈ 10³ має майже колінеарні стовпці (xʲ), число обумовленості дуже велике; нормування t = (x − c)/s ∈ [−1; 1] робить стовпці порівнянними. У роботі (табл. ' + TAB_STAB + ') для m = 4 на вузлах 1000…1019 QR без нормування дає відхилення ' + exp2(results.stability[2].qrRaw) + ', нормальні рівняння — ' + exp2(results.stability[2].normalEq) + '; з нормуванням і QR значення збігаються з еталоном.'],
  ['9. Які ризики виникають під час екстраполяції та як їх показати візуально?', 'Поліном високого ступеня різко зростає за межами вузлів, немає гарантій адекватності моделі, похибка накопичується. У застосунку: прапорець «Екстраполяція ±20 %» додає заштриховані зони з підписом «екстраполяція», підказка позначає такі точки, а автомасштаб показує масштаб відхилення (рис. ' + FIG_EXTRAP + ').'],
];
for (const [q, a] of QA) {
  add(para(q, { bold: true, noIndent: true, after: 60, keepNext: true }));
  if (q.startsWith('5.')) {
    const [intro, ...rest] = a.split('\n');
    add(para(intro, { noIndent: true }));
    const codeText = rest.slice(0, -1).join('\n');
    add(...code(codeText, 16));
    add(para(rest[rest.length - 1], { noIndent: true }));
  } else add(para(a, { noIndent: true }));
}

// ---- 12. Висновки
add(h1('12. Висновки'));
add(
  para('У лабораторній роботі розроблено веб-застосунок, що реалізує інтерполяцію Лагранжа (з контролем формою Ньютона) та МНК-апроксимацію поліномами ступеня 2–4 за стійким QR-розкладом Хаусхолдера, будує шість графіків для наборів із 5, 10 та 20 точок із автоматичним масштабуванням осей X та Y, діаграму залишків, анімації інтерполяції та МНК, підказки при наведенні, режим екстраполяції та перемикання між наборами.')
);
add(
  para(`Порівняльний аналіз показав, що інтерполяція Лагранжа точна у вузлах, але для 20 рівновіддалених точок демонструє ефект Рунге (розмах полінома у ${((s20.lagrange.max - s20.lagrange.min) / s20.dataRange).toFixed(0)} разів більший за розмах даних, Λ = ${f(s20.lagrange.lebesgue, 5)}) і непридатна для екстраполяції; МНК низького ступеня згладжує похибки вимірювань і дає стабільну якість (R² > 0.997) для всіх наборів. Нормування змінної та QR-розклад забезпечують числову стійкість. Роботу виконано за Agile-методологією в п’ять ітерацій із окремим комітом на кожну; ${testPass} автотестів проходять.`)
);
add(para('Звіт про використання AI, критичний аналіз помилок і таблицю внеску наведено в розділі 10.'));

add(h1('13. Посилання'));
add(para('Репозиторій GitHub: **[вставте посилання після публікації]**', { noIndent: true }));
add(para('Публічне посилання на чат з AI: **[вставте посилання]**', { noIndent: true }));
add(para('Структура репозиторію та інструкція з публікації — у `README.md`.', { noIndent: true }));

// ---- Додаток
add(h1('Додаток А. Повний текст математичного ядра (src/math.js)', true));
add(...code(fs.readFileSync(R('src', 'math.js'), 'utf8'), 15));

// ------------------------------------------------------------------ Документ

const doc = new Document({
  creator: 'Белеканич Максим Олександрович',
  title: 'ЛР № 1. Апроксимація функцій методами інтерполяції та МНК (варіант 6)',
  description: 'Звіт з лабораторної роботи № 1',
  styles: {
    default: { document: { run: { font: FONT, size: BODY } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true, italics: true }, paragraph: { spacing: { before: 140, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'num2', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    {
      properties: {
        titlePage: true,
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1417, right: 850 } },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24 })] })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children,
    },
  ],
});

const outDir = R('report');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'Звіт_ЛР1_Лагранж_МНК_варіант6.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outFile, buf);
  console.log('✓', outFile, (buf.length / 1024).toFixed(0) + ' КБ');
});
