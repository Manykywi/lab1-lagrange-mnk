#!/usr/bin/env node
/**
 * Порівняльний аналіз Лагранж vs МНК для 5, 10 та 20 точок (ітерація 5).
 * Генерує docs/05-analysis.md та docs/analysis-results.json.
 *
 * Опорна функція («істина») — лінія тренду y = 5.55 − 0.35·x, за якою згенеровано
 * точки 6…20 (припущення A1 у ТЗ). Вона дозволяє виміряти похибку МІЖ вузлами.
 *
 * Запуск: node tools/analysis.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../src/math.js');
const D = require('../src/datasets.js');

const trend = (x) => D.TREND.a + D.TREND.b * x;
const f = (v, d = 4) => M.fmt(v, d);
const DEGREES = [2, 3, 4];
const results = { sets: {}, stability: [], timing: {} };

/** Похибка наближення p відносно тренду на щільній сітці всередині та поза інтервалом. */
function trendErrors(p, xs) {
  const a = xs[0];
  const b = xs[xs.length - 1];
  const span = b - a;
  const grid = M.linspace(a, b, 2001);
  let se = 0;
  let mx = 0;
  for (const x of grid) {
    const e = p(x) - trend(x);
    se += e * e;
    mx = Math.max(mx, Math.abs(e));
  }
  const extra = (x) => Math.abs(p(x) - trend(x));
  return {
    rmse: Math.sqrt(se / grid.length),
    maxErr: mx,
    extrapRight: extra(b + 0.1 * span),
    extrapLeft: extra(a - 0.1 * span),
  };
}

/** Перехресна перевірка «виключи один» за внутрішніми вузлами. */
function leaveOneOut(xs, ys, build) {
  let se = 0;
  let mx = 0;
  let cnt = 0;
  for (let i = 1; i < xs.length - 1; i++) {
    const x2 = xs.filter((_, j) => j !== i);
    const y2 = ys.filter((_, j) => j !== i);
    const p = build(x2, y2);
    const e = p(xs[i]) - ys[i];
    se += e * e;
    mx = Math.max(mx, Math.abs(e));
    cnt++;
  }
  return { rmse: Math.sqrt(se / cnt), max: mx };
}

/** Середній час виконання (мс). */
function bench(fn, runs = 200) {
  for (let i = 0; i < 20; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / runs;
}

// ----------------------------------------------------------------- Основний цикл

for (const n of D.SIZES) {
  const { xs, ys } = D.getSet(n);
  const dd = M.dividedDifferences(xs, ys);
  const lag = (x) => M.lagrangeEval(xs, ys, x);
  const inner = M.sampleFunction(lag, xs[0], xs[n - 1], 2001).ys;
  const entry = {
    n,
    lagrange: {
      ...trendErrors(lag, xs),
      min: Math.min(...inner),
      max: Math.max(...inner),
      lebesgue: M.lebesgueConstant(xs, 3000),
      loo: leaveOneOut(xs, ys, (x2, y2) => (x) => M.lagrangeEval(x2, y2, x)),
      newtonDiff: Math.max(...M.linspace(xs[0], xs[n - 1], 500).map((x) => Math.abs(M.newtonEval(xs, dd.coefs, x) - lag(x)))),
      msPerCurve: bench(() => M.sampleFunction(lag, xs[0], xs[n - 1], 400)),
    },
    mnk: {},
    dataRange: Math.max(...ys) - Math.min(...ys),
  };
  for (const m of DEGREES) {
    const fit = M.fitPolynomial(xs, ys, m);
    entry.mnk[m] = {
      ...M.metrics(ys, fit.fitted),
      trend: trendErrors(fit.predict, xs),
      loo: leaveOneOut(xs, ys, (x2, y2) => M.fitPolynomial(x2, y2, M.clampDegree(m, x2.length)).predict),
      msFit: bench(() => M.fitPolynomial(xs, ys, m)),
      coef: fit.coef,
    };
  }
  results.sets[n] = entry;
}

// ---- Стійкість: QR проти нормальних рівнянь на «сирому» x (без нормування), n = 20
function gauss(Aug) {
  const n = Aug.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(Aug[r][c]) > Math.abs(Aug[p][c])) p = r;
    [Aug[c], Aug[p]] = [Aug[p], Aug[c]];
    for (let r = c + 1; r < n; r++) {
      const k = Aug[r][c] / Aug[c][c];
      for (let j = c; j <= n; j++) Aug[r][j] -= k * Aug[c][j];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = Aug[i][n];
    for (let j = i + 1; j < n; j++) s -= Aug[i][j] * x[j];
    x[i] = s / Aug[i][i];
  }
  return x;
}
{
  // зсунуті вузли x = 1000…1019 (типова ситуація «рік», «номер вимірювання»), m = 4
  const base = D.getSet(20);
  const xs = base.xs.map((x) => x + 999);
  const ys = base.ys;
  for (const m of DEGREES) {
    const ref = M.fitPolynomial(xs, ys, m); // нормування + QR — еталон
    const A = M.designMatrix(xs, m); // сирий x
    const qr = M.solveLeastSquares(A, ys).x;
    const k = m + 1;
    const N = Array.from({ length: k }, (_, i) => [
      ...Array.from({ length: k }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0)),
      A.reduce((s, row, r) => s + row[i] * ys[r], 0),
    ]);
    let ne;
    try { ne = gauss(N); } catch (e) { ne = null; }
    const pred = (c) => (x) => M.horner(c, x);
    const dev = (c) => (c && c.every(Number.isFinite) ? Math.max(...xs.map((x) => Math.abs(pred(c)(x) - ref.predict(x)))) : NaN);
    results.stability.push({ m, qrRaw: dev(qr), normalEq: dev(ne) });
  }
}

// ------------------------------------------------------------- Формування звіту

const S = results.sets;
const row = (label, fn) => `| ${label.replace(/\|/g, '\\|')} | ${D.SIZES.map((n) => fn(S[n])).join(' | ')} |`;
const hdr = '| Показник | 5 точок | 10 точок | 20 точок |\n|---|---:|---:|---:|';

let md = `# 5. Тестування та порівняльний аналіз

> Файл згенеровано скриптом \`tools/analysis.js\` (запуск: \`npm run analysis\`). Не редагувати вручну.

## 5.1. Методика

- Дані: варіант 6, набори 5 ⊂ 10 ⊂ 20 точок (\`src/datasets.js\`).
- Опорна функція для оцінки похибки **між** вузлами — лінія тренду \`y = ${D.TREND.a} − ${-D.TREND.b}·x\`, за якою згенеровано точки 6…20 (припущення A1). Похибки обчислюються на сітці з 2001 точки всередині \`[x₁; xₙ]\`; екстраполяція — на відстані 10 % довжини інтервалу за його межами.
- МНК: ступені m = 2, 3, 4; розв'язок QR-розкладом Хаусхолдера з нормуванням x.
- «Виключи один» (LOO): по черзі видаляється внутрішній вузол, модель будується за рештою й передбачає значення у видаленому вузлі — оцінка здатності до узагальнення.
- Автотести (\`npm test\`) перевіряють ядро, набори даних та таймлайни анімацій; результат прогону наведено у звіті.

## 5.2. Інтерполяція Лагранжа

${hdr}
${row('Похибка в вузлах (max |p(xᵢ) − yᵢ|, через базисні Lₖ)', () => '0 (за побудовою)')}
${row('min p(x) на [x₁; xₙ]', (s) => f(s.lagrange.min, 3))}
${row('max p(x) на [x₁; xₙ]', (s) => f(s.lagrange.max, 3))}
${row('розмах даних y', (s) => f(s.dataRange, 3))}
${row('константа Лебега Λ (рівновіддалені вузли)', (s) => f(s.lagrange.lebesgue, 4))}
${row('RMSE відносно тренду між вузлами', (s) => f(s.lagrange.rmse, 4))}
${row('max |p − тренд| між вузлами', (s) => f(s.lagrange.maxErr, 4))}
${row('похибка екстраполяції праворуч (+10 %)', (s) => f(s.lagrange.extrapRight, 4))}
${row('похибка екстраполяції ліворуч (−10 %)', (s) => f(s.lagrange.extrapLeft, 4))}
${row('LOO RMSE (внутрішні вузли)', (s) => f(s.lagrange.loo.rmse, 4))}
${row('max |Лагранж − Ньютон| на 500 точках', (s) => s.lagrange.newtonDiff.toExponential(2))}
${row('час побудови кривої з 400 точок, мс', (s) => f(s.lagrange.msPerCurve, 3))}
`;

for (const m of DEGREES) {
  md += `
## 5.${2 + DEGREES.indexOf(m) + 1}. МНК, ступінь m = ${m}

${hdr}
${row('SSE = Σ rᵢ²', (s) => f(s.mnk[m].sse))}
${row('RMSE у вузлах', (s) => f(s.mnk[m].rmse))}
${row('max |rᵢ|', (s) => f(s.mnk[m].maxAbs))}
${row('R²', (s) => f(s.mnk[m].r2, 5))}
${row('RMSE відносно тренду між вузлами', (s) => f(s.mnk[m].trend.rmse, 4))}
${row('max |ŷ − тренд| між вузлами', (s) => f(s.mnk[m].trend.maxErr, 4))}
${row('похибка екстраполяції праворуч (+10 %)', (s) => f(s.mnk[m].trend.extrapRight, 4))}
${row('похибка екстраполяції ліворуч (−10 %)', (s) => f(s.mnk[m].trend.extrapLeft, 4))}
${row('LOO RMSE (внутрішні вузли)', (s) => f(s.mnk[m].loo.rmse, 4))}
${row('час побудови моделі, мс', (s) => f(s.mnk[m].msFit, 3))}
`;
}

md += `
## 5.6. Стійкість: QR проти нормальних рівнянь

Набір із 20 точок, вузли зсунуто на 999 (x = 1000…1019), коефіцієнти знайдено у «сирій» змінній x
(без нормування). Показано max |ŷ − ŷ_еталон| на вузлах, де еталон — нормування + QR (абсолютна похибка значення функції).

| m | QR без нормування | Нормальні рівняння (Гаус) |
|---:|---:|---:|
${results.stability.map((r) => `| ${r.m} | ${r.qrRaw.toExponential(2)} | ${Number.isFinite(r.normalEq) ? r.normalEq.toExponential(2) : 'збій'} |`).join('\n')}

## 5.7. Висновки

`;
const s5 = S[5], s10 = S[10], s20 = S[20];
md += `1. **Інтерполяція Лагранжа** точно відтворює вузли, але між ними поводиться дедалі гірше: розмах полінома відносно розмаху даних — ${((s5.lagrange.max - s5.lagrange.min) / s5.dataRange).toFixed(2)}× (5 точок), ${((s10.lagrange.max - s10.lagrange.min) / s10.dataRange).toFixed(2)}× (10) та **${((s20.lagrange.max - s20.lagrange.min) / s20.dataRange).toFixed(2)}×** (20 точок): крива виходить за межі [${f(s20.lagrange.min, 3)}; ${f(s20.lagrange.max, 3)}] при даних у діапазоні ${f(s20.dataRange, 3)}. Це **ефект Рунге**; константа Лебега зростає з ${f(s5.lagrange.lebesgue, 3)} до ${f(s20.lagrange.lebesgue, 5)}, тобто малі похибки вимірювання (±0.1) підсилюються в тисячі разів.
2. **МНК** (m = 2) зберігає стабільну якість при збільшенні кількості точок: R² = ${f(s5.mnk[2].r2, 5)} / ${f(s10.mnk[2].r2, 5)} / ${f(s20.mnk[2].r2, 5)}, RMSE між вузлами відносно тренду — ${f(s5.mnk[2].trend.rmse, 3)} / ${f(s10.mnk[2].trend.rmse, 3)} / ${f(s20.mnk[2].trend.rmse, 3)}, тоді як у Лагранжа — ${f(s5.lagrange.rmse, 3)} / ${f(s10.lagrange.rmse, 3)} / ${f(s20.lagrange.rmse, 3)}.
3. **Екстраполяція** (+10 % за межі інтервалу): похибка Лагранжа ${f(s5.lagrange.extrapRight, 3)} / ${f(s10.lagrange.extrapRight, 3)} / ${f(s20.lagrange.extrapRight, 3)} проти ${f(s5.mnk[2].trend.extrapRight, 3)} / ${f(s10.mnk[2].trend.extrapRight, 3)} / ${f(s20.mnk[2].trend.extrapRight, 3)} у МНК (m = 2) — поліном високого ступеня для екстраполяції непридатний.
4. **Узагальнення (LOO):** RMSE Лагранжа — ${f(s5.lagrange.loo.rmse, 3)} / ${f(s10.lagrange.loo.rmse, 3)} / ${f(s20.lagrange.loo.rmse, 3)}; МНК (m = 2) — ${f(s5.mnk[2].loo.rmse, 3)} / ${f(s10.mnk[2].loo.rmse, 3)} / ${f(s20.mnk[2].loo.rmse, 3)}.
5. **Ступінь m:** для майже лінійних даних підвищення m з 2 до 4 майже не зменшує SSE (для 20 точок: ${f(s20.mnk[2].sse, 4)} → ${f(s20.mnk[4].sse, 4)}), але для 5 точок при m = 4 МНК перетворюється на інтерполяцію (SSE = ${s5.mnk[4].sse.toExponential(1)}) і втрачає згладжувальну властивість.
6. **Числова стійкість:** нормування x та QR-розклад дають точність, недосяжну для нормальних рівнянь на зсунутих вузлах (див. 5.6); форми Лагранжа й Ньютона збігаються (макс. розбіжність для 20 точок — ${s20.lagrange.newtonDiff.toExponential(2)}, що відображає погану обумовленість задачі, а не помилку коду).
7. **Швидкодія:** побудова кривої з 400 точок — ${f(s5.lagrange.msPerCurve, 2)} / ${f(s10.lagrange.msPerCurve, 2)} / ${f(s20.lagrange.msPerCurve, 2)} мс (Лагранж, O(n²) на точку), що значно менше за кадр анімації (16 мс).
`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', '05-analysis.md'), md);
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'analysis-results.json'), JSON.stringify(results, null, 2));
console.log(md);
