'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/math.js');
const D = require('../src/datasets.js');

const close = (a, b, tol = 1e-9, msg) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), msg || `${a} ≉ ${b} (tol ${tol})`);

// ------------------------------------------------------------------ Лагранж

test('Лагранж: поліном проходить через усі вузли (5/10/20 точок)', () => {
  // lagrangeEval має «ярлик» для x === xₖ, тому перевірку виконуємо через базисні многочлени
  // (без ярлика): Σ yₖ·Lₖ(xᵢ) має дорівнювати yᵢ.
  for (const n of D.SIZES) {
    const { xs, ys } = D.getSet(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += ys[k] * M.lagrangeBasis(xs, k, xs[i]);
      close(s, ys[i], 1e-12);
    }
  }
});

test('Лагранж: базисні многочлени мають властивість Lₖ(xⱼ) = δₖⱼ та Σ Lₖ(x) = 1', () => {
  const xs = [0, 1, 2.5, 4, 7];
  for (let k = 0; k < xs.length; k++) {
    for (let j = 0; j < xs.length; j++) close(M.lagrangeBasis(xs, k, xs[j]), k === j ? 1 : 0, 1e-12);
  }
  for (const x of [-1, 0.3, 3.3, 9]) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += M.lagrangeBasis(xs, k, x);
    close(s, 1, 1e-12);
  }
});

test('Лагранж: точно відтворює многочлен степеня ≤ n−1 (єдиність, теорема 4.2.2)', () => {
  const f = (x) => 0.5 * x ** 4 - 2 * x ** 3 + x - 7;
  const xs = [-2, -1, 0.5, 2, 3.5];
  const ys = xs.map(f);
  for (const x of [-3, -1.7, 0, 1.2, 2.9, 5]) close(M.lagrangeEval(xs, ys, x), f(x), 1e-10);
});

test('Лагранж = Ньютон (поділені різниці) для всіх наборів варіанта 6', () => {
  for (const n of D.SIZES) {
    const { xs, ys } = D.getSet(n);
    const { coefs } = M.dividedDifferences(xs, ys);
    for (const x of M.linspace(xs[0], xs[n - 1], 37)) {
      const a = M.lagrangeEval(xs, ys, x);
      const b = M.newtonEval(xs, coefs, x);
      close(a, b, 1e-6 * (n === 20 ? 1e3 : 1), `n=${n}, x=${x}: ${a} vs ${b}`);
    }
  }
});

test('Таблиця поділених різниць: розміри та перші різниці', () => {
  const xs = [1, 2, 3, 4];
  const ys = [1, 4, 9, 16]; // y = x²
  const { table, coefs } = M.dividedDifferences(xs, ys);
  assert.deepEqual(table.map((c) => c.length), [4, 3, 2, 1]);
  assert.deepEqual(table[1], [3, 5, 7]); // f[xᵢ,xᵢ₊₁]
  assert.deepEqual(coefs, [1, 3, 1, 0]); // 1 + 3(x−1) + 1(x−1)(x−2)
});

test('assertValidNodes відхиляє повтори, NaN та різну довжину', () => {
  assert.throws(() => M.assertValidNodes([1, 1], [2, 3]), /різними/);
  assert.throws(() => M.assertValidNodes([1, NaN], [2, 3]), /скінченними/);
  assert.throws(() => M.assertValidNodes([1, 2], [2]), /однакової довжини/);
  assert.doesNotThrow(() => M.assertValidNodes([1, 2], [2, 3]));
});

test('Константа Лебега для рівновіддалених вузлів швидко зростає з n', () => {
  const l5 = M.lebesgueConstant(D.getSet(5).xs, 500);
  const l10 = M.lebesgueConstant(D.getSet(10).xs, 500);
  const l20 = M.lebesgueConstant(D.getSet(20).xs, 500);
  assert.ok(l5 < l10 && l10 < l20);
  assert.ok(l20 > 1e3, `Λ₂₀ = ${l20}`);
});

// ---------------------------------------------------------------------- МНК

test('МНК: точно відновлює коефіцієнти квадратичної залежності', () => {
  const xs = M.linspace(0, 9, 10);
  const ys = xs.map((x) => 2 - 3 * x + 0.5 * x * x);
  const fit = M.fitPolynomial(xs, ys, 2);
  for (const x of [-1, 2.5, 11]) close(fit.predict(x), 2 - 3 * x + 0.5 * x * x, 1e-10);
  fit.residuals.forEach((r) => close(r, 0, 1e-10));
});

test('МНК: залишки ортогональні стовпцям дизайн-матриці (‖Aᵀr‖ ≈ 0)', () => {
  for (const n of D.SIZES) {
    for (const m of [2, 3, 4]) {
      const { xs, ys } = D.getSet(n);
      const fit = M.fitPolynomial(xs, ys, m);
      const ts = xs.map((x) => (x - fit.center) / fit.scale);
      const A = M.designMatrix(ts, m);
      for (let j = 0; j <= m; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += A[i][j] * fit.residuals[i];
        assert.ok(Math.abs(s) < 1e-10, `n=${n} m=${m} стовпець ${j}: Aᵀr = ${s}`);
      }
    }
  }
});

test('МНК: збігається з розв’язком нормальних рівнянь на добре обумовленій задачі', () => {
  const { xs, ys } = D.getSet(10);
  const m = 2;
  const fit = M.fitPolynomial(xs, ys, m);
  // еталон: нормальні рівняння (AᵀA)a = Aᵀy методом Гауса — лише для перевірки
  const ts = xs.map((x) => (x - fit.center) / fit.scale);
  const A = M.designMatrix(ts, m);
  const k = m + 1;
  const N = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0))
  );
  const rhs = Array.from({ length: k }, (_, i) => A.reduce((s, row, r) => s + row[i] * ys[r], 0));
  for (let c = 0; c < k; c++) {
    for (let r = c + 1; r < k; r++) {
      const f = N[r][c] / N[c][c];
      for (let j = c; j < k; j++) N[r][j] -= f * N[c][j];
      rhs[r] -= f * rhs[c];
    }
  }
  const a = new Array(k);
  for (let i = k - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let j = i + 1; j < k; j++) s -= N[i][j] * a[j];
    a[i] = s / N[i][i];
  }
  fit.coef.forEach((c, i) => close(c, a[i], 1e-9));
});

test('МНК при m = n−1 збігається з інтерполяцією (залишки = 0)', () => {
  const { xs, ys } = D.getSet(5);
  const fit = M.fitPolynomial(xs, ys, 4);
  fit.residuals.forEach((r) => close(r, 0, 1e-10));
  for (const x of [1.5, 2.2, 3.7, 4.9]) close(fit.predict(x), M.lagrangeEval(xs, ys, x), 1e-9);
});

test('МНК: нормування x дає стійкість при великому зсуві вузлів', () => {
  const xs = M.linspace(0, 9, 10).map((x) => 1e6 + x);
  const f = (x) => 3 + 0.002 * (x - 1e6) - 0.01 * (x - 1e6) ** 2;
  const ys = xs.map(f);
  const fit = M.fitPolynomial(xs, ys, 2);
  fit.fitted.forEach((v, i) => close(v, ys[i], 1e-9));
});

test('МНК: ваги ωᵢ зміщують криву до точок із великою вагою', () => {
  const xs = [0, 1, 2, 3, 4];
  const ys = [0, 1, 2, 3, 10]; // викид у кінці
  const plain = M.fitPolynomial(xs, ys, 1);
  const weighted = M.fitPolynomial(xs, ys, 1, [1, 1, 1, 1, 1000]);
  assert.ok(Math.abs(weighted.residuals[4]) < Math.abs(plain.residuals[4]));
  assert.throws(() => M.fitPolynomial(xs, ys, 1, [1, 1, 1, 1, 0]), /додатними/);
});

test('МНК: помилки для завеликого ступеня та виродкових вхідних даних', () => {
  const { xs, ys } = D.getSet(5);
  assert.throws(() => M.fitPolynomial(xs, ys, 5), /завеликий/);
  assert.throws(() => M.fitPolynomial(xs, ys, -1), /невід/);
  assert.throws(() => M.solveLeastSquares([[1, 1], [2, 2], [3, 3]], [1, 2, 3]), /Виродкова/);
  assert.equal(M.clampDegree(4, 3), 2);
  assert.equal(M.clampDegree(2, 10), 2);
});

test('Метрики: SSE, RMSE, MAE, R² для відомого прикладу', () => {
  const ys = [1, 2, 3, 4];
  const fitted = [1, 2, 3, 5];
  const q = M.metrics(ys, fitted);
  close(q.sse, 1);
  close(q.rmse, 0.5);
  close(q.mae, 0.25);
  close(q.maxAbs, 1);
  close(q.r2, 1 - 1 / 5);
});

test('Для варіанта 6 МНК (m=2) має малі залишки на лінійному тренді', () => {
  const { xs, ys } = D.getSet(20);
  const fit = M.fitPolynomial(xs, ys, 2);
  const q = M.metrics(ys, fit.fitted);
  assert.ok(q.r2 > 0.998, `R² = ${q.r2}`);
  assert.ok(q.maxAbs < 0.2, `max|r| = ${q.maxAbs}`);
});

// ------------------------------------------------------ Автомасштабування осей

test('autoScale: межі містять усі значення та мають відступ', () => {
  const vals = [3, -2, 7.5, 0.1];
  const { min, max } = M.autoScale(vals);
  assert.ok(min < -2 && max > 7.5);
  for (const v of vals) assert.ok(v > min && v < max);
});

test('autoScale: пласкі дані, порожній вхід і нескінченні значення', () => {
  const flat = M.autoScale([5, 5, 5]);
  assert.ok(flat.max > flat.min && flat.min < 5 && flat.max > 5);
  assert.deepEqual(M.autoScale([]), { min: -1, max: 1 });
  const r = M.autoScale([1, 2, Infinity, NaN, -Infinity]);
  assert.ok(Number.isFinite(r.min) && Number.isFinite(r.max) && r.min < 1 && r.max > 2);
});

test('autoScale: includeZero гарантує видимість нульової лінії (залишки)', () => {
  const r = M.autoScale([0.2, 0.5, 0.3], { includeZero: true });
  assert.ok(r.min <= 0 && r.max >= 0.5);
  const r2 = M.autoScale([-0.4, -0.1], { includeZero: true });
  assert.ok(r2.max >= 0);
});

test('autoScale: крива Лагранжа 20 вузлів повністю лежить у межах', () => {
  const { xs, ys } = D.getSet(20);
  const curve = M.sampleFunction((x) => M.lagrangeEval(xs, ys, x), xs[0], xs[19], 400);
  const { min, max } = M.autoScale([...curve.ys, ...ys]);
  for (const v of curve.ys) assert.ok(v >= min && v <= max);
  for (const v of ys) assert.ok(v >= min && v <= max);
});

test('niceTicks: «гарні» кроки та позначки в межах діапазону', () => {
  const t = M.niceTicks(0, 10, 5);
  assert.equal(t.step, 2);
  assert.deepEqual(t.ticks, [0, 2, 4, 6, 8, 10]);
  const u = M.niceTicks(-1.03, 5.87, 6);
  for (const v of u.ticks) assert.ok(v >= -1.03 - 1e-9 && v <= 5.87 + 1e-9);
  assert.ok([1, 2, 5].includes(u.step / 10 ** Math.floor(Math.log10(u.step))));
  const tiny = M.niceTicks(0.001, 0.004, 6);
  assert.ok(tiny.ticks.length >= 3);
});

test('formatTick та fmt', () => {
  assert.equal(M.formatTick(2, 0.5), '2.0');
  assert.equal(M.formatTick(-0.0000001, 0.5), '0.0');
  assert.equal(M.formatTick(50, 10), '50');
  assert.equal(M.fmt(0), '0');
  assert.equal(M.fmt(1.23456789), '1.2346');
  assert.equal(M.fmt(123456), '1.23e+5');
});

test('linspace / sampleFunction', () => {
  assert.deepEqual(M.linspace(0, 1, 3), [0, 0.5, 1]);
  const s = M.sampleFunction((x) => x * x, 0, 2, 3);
  assert.deepEqual(s.ys, [0, 1, 4]);
});
