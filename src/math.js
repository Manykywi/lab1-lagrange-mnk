/**
 * math.js — математичне ядро ЛР №1 (ітерація 2).
 *
 * Інтерполяція (Лагранж, Ньютон), МНК через QR-розклад Хаусхолдера,
 * автомасштабування осей та допоміжні функції. Не залежить від DOM:
 * працює і в браузері (window.LabMath), і в Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = Number.EPSILON;

  // ---------------------------------------------------------------- Перевірки

  /** Перевіряє вузли: однакова довжина, скінченні числа, попарно різні x. */
  function assertValidNodes(xs, ys) {
    if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length) {
      throw new Error('xs та ys мають бути масивами однакової довжини');
    }
    if (xs.length < 1) throw new Error('Потрібна щонайменше одна точка');
    for (let i = 0; i < xs.length; i++) {
      if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
        throw new Error(`Точка ${i + 1}: координати мають бути скінченними числами`);
      }
    }
    const sorted = xs.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) throw new Error(`Вузли xᵢ мають бути різними (повтор x = ${sorted[i]})`);
    }
  }

  // ------------------------------------------------------- Інтерполяція (4.3)

  /** Базисний многочлен Лагранжа Lₖ(x) = Π_{j≠k} (x − xⱼ)/(xₖ − xⱼ). */
  function lagrangeBasis(xs, k, x) {
    let l = 1;
    for (let j = 0; j < xs.length; j++) {
      if (j !== k) l *= (x - xs[j]) / (xs[k] - xs[j]);
    }
    return l;
  }

  /** pₙ(x) = Σ yₖ·Lₖ(x). У вузлі повертає точне yₖ (без накопичення похибки). */
  function lagrangeEval(xs, ys, x) {
    const n = xs.length;
    for (let k = 0; k < n; k++) if (x === xs[k]) return ys[k];
    let sum = 0;
    for (let k = 0; k < n; k++) {
      let term = ys[k];
      for (let j = 0; j < n; j++) {
        if (j !== k) term *= (x - xs[j]) / (xs[k] - xs[j]);
      }
      sum += term;
    }
    return sum;
  }

  /**
   * Таблиця поділених різниць (форма Ньютона, 4.4).
   * table[j][i] = f[xᵢ, …, xᵢ₊ⱼ]; coefs[j] = table[j][0] = aⱼ.
   */
  function dividedDifferences(xs, ys) {
    const n = xs.length;
    const table = [ys.slice()];
    for (let j = 1; j < n; j++) {
      const prev = table[j - 1];
      const col = new Array(n - j);
      for (let i = 0; i < n - j; i++) col[i] = (prev[i + 1] - prev[i]) / (xs[i + j] - xs[i]);
      table.push(col);
    }
    return { table, coefs: table.map((c) => c[0]) };
  }

  /** Значення полінома Ньютона схемою Горнера. */
  function newtonEval(xs, coefs, x) {
    const n = coefs.length;
    let r = coefs[n - 1];
    for (let k = n - 2; k >= 0; k--) r = r * (x - xs[k]) + coefs[k];
    return r;
  }

  /** Константа Лебега Λ = max_x Σ|Lₖ(x)| на [x₀; xₙ] (оцінка за вибіркою). */
  function lebesgueConstant(xs, samples = 2000) {
    const a = Math.min(...xs);
    const b = Math.max(...xs);
    let best = 0;
    for (let i = 0; i <= samples; i++) {
      const x = a + ((b - a) * i) / samples;
      let s = 0;
      for (let k = 0; k < xs.length; k++) s += Math.abs(lagrangeBasis(xs, k, x));
      if (s > best) best = s;
    }
    return best;
  }

  // ------------------------------------------------------------- МНК (4.1–4.6)

  /** Нормування x → t ∈ [−1; 1]: t = (x − center)/scale. */
  function normalizeX(xs) {
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const center = (lo + hi) / 2;
    const scale = (hi - lo) / 2 || 1;
    return { center, scale };
  }

  /** Дизайн-матриця Вандермонда A[i][j] = tᵢʲ, j = 0…m. */
  function designMatrix(ts, m) {
    return ts.map((t) => {
      const row = new Array(m + 1);
      let p = 1;
      for (let j = 0; j <= m; j++) {
        row[j] = p;
        p *= t;
      }
      return row;
    });
  }

  /**
   * Розв'язок min‖A·a − b‖₂ QR-розкладом Хаусхолдера (без нормальних рівнянь).
   * A — масив рядків розміру rows × cols (rows ≥ cols).
   * Повертає { x, residualNorm }.
   */
  function solveLeastSquares(A, b) {
    const rows = A.length;
    const cols = A[0].length;
    if (rows < cols) throw new Error('Система недовизначена: точок менше, ніж коефіцієнтів');
    const R = A.map((r) => r.slice());
    const qtb = b.slice();
    let diagMax = 0;

    for (let k = 0; k < cols; k++) {
      let norm = 0;
      for (let i = k; i < rows; i++) norm = Math.hypot(norm, R[i][k]);
      if (norm === 0) throw new Error('Виродкова матриця (нульовий стовпець)');
      const alpha = R[k][k] > 0 ? -norm : norm; // знак обирається проти втрати значущих цифр
      const v = new Array(rows - k);
      for (let i = k; i < rows; i++) v[i - k] = R[i][k];
      v[0] -= alpha;
      let vv = 0;
      for (const e of v) vv += e * e;
      if (vv > 0) {
        for (let j = k; j < cols; j++) {
          let s = 0;
          for (let i = k; i < rows; i++) s += v[i - k] * R[i][j];
          const f = (2 * s) / vv;
          for (let i = k; i < rows; i++) R[i][j] -= f * v[i - k];
        }
        let s = 0;
        for (let i = k; i < rows; i++) s += v[i - k] * qtb[i];
        const f = (2 * s) / vv;
        for (let i = k; i < rows; i++) qtb[i] -= f * v[i - k];
      }
      diagMax = Math.max(diagMax, Math.abs(R[k][k]));
    }

    const tol = Math.max(rows, cols) * EPS * diagMax;
    const x = new Array(cols);
    for (let k = cols - 1; k >= 0; k--) {
      if (Math.abs(R[k][k]) <= tol) throw new Error('Виродкова матриця (ранг менший за кількість коефіцієнтів)');
      let s = qtb[k];
      for (let j = k + 1; j < cols; j++) s -= R[k][j] * x[j];
      x[k] = s / R[k][k];
    }
    let rn = 0;
    for (let i = cols; i < rows; i++) rn = Math.hypot(rn, qtb[i]);
    return { x, residualNorm: rn };
  }

  /** Схема Горнера: a₀ + a₁t + … + a_m tᵐ. */
  function horner(coef, t) {
    let r = 0;
    for (let j = coef.length - 1; j >= 0; j--) r = r * t + coef[j];
    return r;
  }

  /** Допустимий ступінь для n точок: не більший за n − 1. */
  function clampDegree(m, n) {
    return Math.max(0, Math.min(m, n - 1));
  }

  /**
   * МНК-апроксимація поліномом ступеня m (необов'язкові ваги ωᵢ > 0, 4.2).
   * Повертає модель: { degree, center, scale, coef, predict(x), fitted, residuals, residualNorm }.
   */
  function fitPolynomial(xs, ys, m, weights) {
    assertValidNodes(xs, ys);
    const n = xs.length;
    if (!Number.isInteger(m) || m < 0) throw new Error('Ступінь m має бути невід’ємним цілим');
    if (m > n - 1) throw new Error(`Ступінь m = ${m} завеликий для ${n} точок (потрібно m ≤ ${n - 1})`);
    if (weights) {
      if (weights.length !== n || weights.some((w) => !(w > 0))) throw new Error('Ваги ωᵢ мають бути додатними (4.2)');
    }
    const { center, scale } = normalizeX(xs);
    const ts = xs.map((x) => (x - center) / scale);
    let A = designMatrix(ts, m);
    let b = ys.slice();
    if (weights) {
      const sw = weights.map(Math.sqrt);
      A = A.map((row, i) => row.map((v) => v * sw[i]));
      b = b.map((v, i) => v * sw[i]);
    }
    const { x: coef, residualNorm } = solveLeastSquares(A, b);
    const predict = (x) => horner(coef, (x - center) / scale);
    const fitted = xs.map(predict);
    const residuals = ys.map((y, i) => y - fitted[i]);
    return { degree: m, center, scale, coef, predict, fitted, residuals, residualNorm };
  }

  /** Метрики якості наближення. */
  function metrics(ys, fitted) {
    const n = ys.length;
    let sse = 0;
    let mae = 0;
    let maxAbs = 0;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += ys[i];
    mean /= n;
    let sst = 0;
    for (let i = 0; i < n; i++) {
      const r = ys[i] - fitted[i];
      sse += r * r;
      mae += Math.abs(r);
      maxAbs = Math.max(maxAbs, Math.abs(r));
      sst += (ys[i] - mean) * (ys[i] - mean);
    }
    return { n, sse, rmse: Math.sqrt(sse / n), mae: mae / n, maxAbs, r2: sst > 0 ? 1 - sse / sst : 1, mean };
  }

  // -------------------------------------------------------------- Допоміжні

  function linspace(a, b, n) {
    if (n < 2) return [a];
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
    return out;
  }

  /** Вибірка функції у n точках відрізка [a; b]. */
  function sampleFunction(fn, a, b, n) {
    const xs = linspace(a, b, n);
    return { xs, ys: xs.map(fn) };
  }

  // -------------------------------------------------------- Автомасштабування

  /**
   * Межі осі за min/max значень (лише скінченних) із відступом.
   * opts: { pad = 0.08, includeZero = false }.
   */
  function autoScale(values, opts) {
    const { pad = 0.08, includeZero = false } = opts || {};
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of values) {
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (includeZero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: -1, max: 1 };
    if (hi - lo <= 1e-12 * Math.max(1, Math.abs(lo), Math.abs(hi))) {
      const d = Math.max(Math.abs(lo) * 0.1, 1);
      lo -= d;
      hi += d;
    }
    const span = hi - lo;
    return { min: lo - span * pad, max: hi + span * pad };
  }

  /** «Гарні» позначки осі (кратні 1, 2, 5 · 10ⁿ). Повертає { ticks, step }. */
  function niceTicks(min, max, target = 6) {
    const span = max - min;
    if (!(span > 0) || !Number.isFinite(span)) return { ticks: [min], step: 1 };
    const raw = span / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const first = Math.ceil(min / step - 1e-9);
    const last = Math.floor(max / step + 1e-9);
    const ticks = [];
    for (let i = first; i <= last; i++) ticks.push(parseFloat((i * step).toPrecision(12)));
    return { ticks, step };
  }

  /** Підпис позначки з потрібною кількістю знаків після коми. */
  function formatTick(v, step) {
    const decimals = Math.min(8, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
    const s = v.toFixed(decimals);
    return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s;
  }

  /** Число для таблиць: компактно, з потрібною точністю. */
  function fmt(v, digits = 4) {
    if (!Number.isFinite(v)) return String(v);
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-4) return v.toExponential(2);
    return parseFloat(v.toFixed(digits)).toString();
  }

  return {
    EPS,
    assertValidNodes,
    lagrangeBasis,
    lagrangeEval,
    dividedDifferences,
    newtonEval,
    lebesgueConstant,
    normalizeX,
    designMatrix,
    solveLeastSquares,
    horner,
    clampDegree,
    fitPolynomial,
    metrics,
    linspace,
    sampleFunction,
    autoScale,
    niceTicks,
    formatTick,
    fmt,
  };
});
