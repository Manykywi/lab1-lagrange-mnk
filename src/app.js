/**
 * app.js — контролер застосунку: стан, обчислення, побудова моделей графіків, події UI.
 * Ітерація 3: один набір, перемикач режимів, залишки, підказки, таблиці.
 */
(function () {
  'use strict';
  const M = window.LabMath;
  const D = window.LabData;
  const $ = (id) => document.getElementById(id);

  const state = {
    setKey: '10', // '5' | '10' | '20' | 'custom'
    mode: 'all', // 'interp' | 'mnk' | 'all'
    degree: 2,
    extrap: false,
    focus: false,
    custom: null,
  };

  // ------------------------------------------------------------ Обчислення

  const cache = new Map();

  function getSet(key) {
    return key === 'custom' ? state.custom : D.getSet(Number(key));
  }

  /** Усі обчислення для набору: Лагранж, Ньютон, МНК, метрики, вибірки кривих. */
  function compute(key, degree, extrap) {
    const ck = `${key}|${degree}|${extrap}|${key === 'custom' ? state.custom.xs.join() + state.custom.ys.join() : ''}`;
    if (cache.has(ck)) return cache.get(ck);
    const set = getSet(key);
    const { xs, ys } = set;
    const n = xs.length;
    const m = M.clampDegree(degree, n);
    const x0 = xs[0];
    const xn = xs[n - 1];
    const ext = extrap ? (xn - x0) * 0.2 : 0;
    const dom = { min: x0 - ext, max: xn + ext };
    const lagFn = (x) => M.lagrangeEval(xs, ys, x);
    const lag = M.sampleFunction(lagFn, dom.min, dom.max, 400);
    const dd = M.dividedDifferences(xs, ys);
    const fit = M.fitPolynomial(xs, ys, m);
    const mnk = M.sampleFunction(fit.predict, dom.min, dom.max, 400);
    const newtonAtNodes = xs.map((x) => M.newtonEval(xs, dd.coefs, x));
    const inner = M.sampleFunction(lagFn, x0, xn, 800).ys;
    const lagMin = Math.min(...inner);
    const lagMax = Math.max(...inner);
    const out = {
      key, n, m, xs, ys, dom, ext,
      lag, mnk, dd, fit, lagFn, newtonAtNodes,
      mLag: M.metrics(ys, xs.map(lagFn)),
      mMnk: M.metrics(ys, fit.fitted),
      lagMin, lagMax,
      yRange: Math.max(...ys) - Math.min(...ys),
      nodeDelta: Math.max(...newtonAtNodes.map((v, i) => Math.abs(v - ys[i]))),
    };
    cache.set(ck, out);
    return out;
  }

  // ---------------------------------------------------------------- Кольори

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return { lag: g('--lagrange'), mnk: g('--mnk'), zero: g('--zero'), point: g('--point') };
  }

  // ----------------------------------------------------------- Моделі графіків

  /**
   * Модель основного графіка.
   * o: { mode, focus, curves (перевизначення), pointKinds[], segments, showSegments }.
   */
  function buildMainModel(d, o) {
    const c = colors();
    const mode = o.mode;
    const curves = o.curves || [];
    if (!o.curves) {
      if (mode !== 'mnk') curves.push({ label: 'Лагранж', color: c.lag, xs: d.lag.xs, ys: d.lag.ys });
      if (mode !== 'interp') curves.push({ label: `МНК (m = ${d.m})`, color: c.mnk, xs: d.mnk.xs, ys: d.mnk.ys });
    }
    const points = d.xs.map((x, i) => ({ x, y: d.ys[i], i, kind: (o.pointKinds && o.pointKinds[i]) || 'normal' }));
    let segments = o.segments;
    if (!segments) {
      segments =
        mode !== 'interp'
          ? d.xs.map((x, i) => ({ x, y0: d.fit.fitted[i], y1: d.ys[i], color: c.mnk, alpha: 0.55, width: 1.6, i }))
          : [];
    }
    const legend = [{ label: 'вузли', color: c.point, kind: 'dot' }];
    if (curves.some((k) => k.label === 'Лагранж')) legend.push({ label: 'Лагранж', color: c.lag, kind: 'line' });
    if (curves.some((k) => k.label.startsWith('МНК'))) legend.push({ label: `МНК (m = ${d.m})`, color: c.mnk, kind: 'line' });
    return {
      xDomain: d.dom,
      points,
      curves,
      segments,
      shade: d.ext > 0 ? [{ x0: d.dom.min, x1: d.xs[0], label: 'екстраполяція' }, { x0: d.xs[d.n - 1], x1: d.dom.max, label: 'екстраполяція' }] : [],
      legend,
      focus: o.focus,
    };
  }

  /** Модель діаграми залишків rᵢ = yᵢ − ŷᵢ (штрихи + маркери + нульова лінія). */
  function buildResidualModel(d, o) {
    const c = colors();
    const segments = [];
    const legend = [];
    if (o.mode !== 'mnk') {
      d.xs.forEach((x, i) => segments.push({ x, y0: 0, y1: d.newtonAtNodes[i] - d.ys[i], color: c.lag, marker: true, i, width: 1.4 }));
      legend.push({ label: 'Лагранж: rᵢ ≈ 0 у вузлах', color: c.lag, kind: 'bar' });
    }
    if (o.mode !== 'interp') {
      const res = o.residuals || d.fit.residuals;
      d.xs.forEach((x, i) => segments.push({ x, y0: 0, y1: res[i], color: c.mnk, marker: true, i, width: 2.2 }));
      legend.push({ label: `МНК: rᵢ = yᵢ − ŷᵢ`, color: c.mnk, kind: 'bar' });
    }
    return {
      xDomain: d.dom,
      points: [],
      curves: [],
      segments,
      shade: d.ext > 0 ? [{ x0: d.dom.min, x1: d.xs[0] }, { x0: d.xs[d.n - 1], x1: d.dom.max }] : [],
      legend,
      zeroLine: true,
      zeroLabel: 'r = 0',
      yIncludeZero: true,
    };
  }

  // ------------------------------------------------------------- Графіки

  const charts = {};
  let rafId = 0;

  function requestDraw() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop() {
    rafId = 0;
    let more = false;
    for (const ch of Object.values(charts)) {
      if (ch.canvas.offsetParent !== null && ch.draw()) more = true;
    }
    if (more) requestDraw();
  }

  function makeCharts() {
    const common = { onRequestDraw: requestDraw };
    charts.main = new window.Chart($('mainChart'), Object.assign({ title: '', xLabel: 'x', yLabel: 'y', nodeLines: (i) => nodeLinesMain(i) }, common));
    charts.res = new window.Chart($('resChart'), Object.assign({ xLabel: 'x', yLabel: 'r = y − ŷ', nodeLines: (i) => nodeLinesRes(i) }, common));
    const ro = new ResizeObserver(requestDraw);
    for (const ch of Object.values(charts)) ro.observe(ch.canvas);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  }

  function nodeLinesMain(i) {
    const d = current();
    const c = colors();
    const f = (v) => M.fmt(v, 4);
    const lines = [{ t: `y = ${f(d.ys[i])}`, c: c.point }];
    if (state.mode !== 'mnk') lines.push({ t: `p(x) = ${f(d.newtonAtNodes[i])}  (Лагранж, r ≈ 0)`, c: c.lag });
    if (state.mode !== 'interp') {
      lines.push({ t: `ŷ = ${f(d.fit.fitted[i])}  (МНК)`, c: c.mnk });
      lines.push({ t: `r = y − ŷ = ${f(d.fit.residuals[i])}`, c: c.mnk });
    }
    return lines;
  }

  function nodeLinesRes(i) {
    const d = current();
    const c = colors();
    const f = (v) => M.fmt(v, 4);
    const lines = [{ t: `y = ${f(d.ys[i])}`, c: c.point }];
    if (state.mode !== 'interp') lines.push({ t: `МНК: r = ${f(d.fit.residuals[i])}`, c: c.mnk });
    if (state.mode !== 'mnk') lines.push({ t: `Лагранж: r = ${M.fmt(d.newtonAtNodes[i] - d.ys[i], 2)}`, c: c.lag });
    return lines;
  }

  function current() {
    return compute(state.setKey, state.degree, state.extrap);
  }

  // --------------------------------------------------------------- Рендер

  function render() {
    const d = current();
    const modeName = { interp: 'інтерполяція Лагранжа', mnk: `МНК, m = ${d.m}`, all: 'Лагранж і МНК' }[state.mode];
    charts.main.setModel(buildMainModel(d, { mode: state.mode, focus: state.focus }));
    charts.res.setModel(buildResidualModel(d, { mode: state.mode }));
    charts.main.opts.title = `Набір: ${d.n} точок — ${modeName}`;
    charts.main.setLabel(`Графік апроксимації для ${d.n} точок, режим: ${modeName}`);
    charts.res.setLabel(`Діаграма залишків для ${d.n} точок`);
    charts.main.snapView();
    charts.res.snapView();
    renderPanels(d);
    renderMetrics();
    renderStatus(d);
    requestDraw();
  }

  function renderStatus(d) {
    const parts = [`Набір: ${d.n} точок`, `m = ${d.m}`];
    if (d.m !== state.degree) parts.push(`(ступінь зменшено до n − 1)`);
    if (state.focus) parts.push('автомасштаб за вузлами');
    $('status').textContent = parts.join(' · ');
  }

  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (n) => String(n).split('').map((ch) => SUB[+ch]).join('');
  const SUP = { 2: '²', 3: '³', 4: '⁴' };

  function renderPanels(d) {
    const f = (v) => M.fmt(v, 4);
    // формула МНК
    const terms = d.fit.coef.map((a, j) => (j === 0 ? `a${sub(0)}` : j === 1 ? `a${sub(1)}·t` : `a${sub(j)}·t${SUP[j] || '^' + j}`));
    const coefs = d.fit.coef.map((a, j) => `a${sub(j)} = ${f(a)}`).join(', ');
    $('mnkFormula').innerHTML =
      `<div>ŷ(x) = ${terms.join(' + ')}</div>` +
      `<div>t = (x − c)/s, c = ${f(d.fit.center)}, s = ${f(d.fit.scale)}</div>` +
      `<div>${coefs}</div>` +
      `<div>SSE = ${f(d.mMnk.sse)}, RMSE = ${f(d.mMnk.rmse)}, R² = ${f(d.mMnk.r2)}</div>`;

    // таблиця вузлів
    const rows = d.xs
      .map(
        (x, i) =>
          `<tr><td>${i + 1}</td><td>${f(x)}</td><td>${f(d.ys[i])}</td><td class="mnk">${f(d.fit.fitted[i])}</td><td class="mnk">${f(d.fit.residuals[i])}</td><td class="lag">${M.fmt(d.newtonAtNodes[i] - d.ys[i], 2)}</td></tr>`
      )
      .join('');
    $('nodeTable').innerHTML =
      `<thead><tr><th>i</th><th>xᵢ</th><th>yᵢ</th><th class="mnk">ŷᵢ</th><th class="mnk">rᵢ</th><th class="lag" title="за формою Ньютона">p(xᵢ)−yᵢ</th></tr></thead><tbody>${rows}</tbody>`;

    // таблиця поділених різниць
    const n = d.n;
    let head = '<th>i</th><th>xᵢ</th><th>f[xᵢ]</th>';
    for (let j = 1; j < n; j++) head += `<th>${j}-а</th>`;
    let body = '';
    for (let i = 0; i < n; i++) {
      body += `<tr><td>${i}</td><td>${f(d.xs[i])}</td>`;
      for (let j = 0; j < n; j++) body += `<td>${i < n - j ? f(d.dd.table[j][i]) : ''}</td>`;
      body += '</tr>';
    }
    $('newtonTable').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  function renderMetrics() {
    const f = (v, dg) => M.fmt(v, dg == null ? 4 : dg);
    const sets = D.SIZES.map((s) => compute(String(s), state.degree, false));
    const col = (fn) => sets.map((d) => `<td class="${'c' + d.n}${state.setKey === String(d.n) ? ' cur' : ''}">${fn(d)}</td>`).join('');
    const hdr = sets.map((d) => `<th>${d.n} точок</th>`).join('');
    const lebesgue = sets.map((d) => M.lebesgueConstant(d.xs, 1500));
    const g = (title, cls) => `<tr><td colspan="4" class="${cls}"><strong>${title}</strong></td></tr>`;
    $('metricsTable').innerHTML =
      `<thead><tr><th>Метрика</th>${hdr}</tr></thead><tbody>` +
      g('Інтерполяція Лагранжа', 'lag') +
      `<tr><td>max |p(xᵢ) − yᵢ| у вузлах</td>${col((d) => f(d.nodeDelta, 2))}</tr>` +
      `<tr><td>min p(x) на [x₁; xₙ]</td>${col((d) => f(d.lagMin, 3))}</tr>` +
      `<tr><td>max p(x) на [x₁; xₙ]</td>${col((d) => f(d.lagMax, 3))}</tr>` +
      `<tr><td>розмах p / розмах y</td>${col((d) => f((d.lagMax - d.lagMin) / d.yRange, 3))}</tr>` +
      `<tr><td>константа Лебега Λ</td>${sets.map((d, i) => `<td>${f(lebesgue[i], 3)}</td>`).join('')}</tr>` +
      g(`МНК, ступінь m = ${state.degree}`, 'mnk') +
      `<tr><td>SSE = Σ rᵢ²</td>${col((d) => f(d.mMnk.sse))}</tr>` +
      `<tr><td>RMSE</td>${col((d) => f(d.mMnk.rmse))}</tr>` +
      `<tr><td>max |rᵢ|</td>${col((d) => f(d.mMnk.maxAbs))}</tr>` +
      `<tr><td>R²</td>${col((d) => f(d.mMnk.r2, 5))}</tr>` +
      '</tbody>';
    $('metricsNote').textContent =
      'Лагранж точно проходить через вузли, але для 20 рівновіддалених вузлів між ними з’являються великі коливання (ефект Рунге); МНК згладжує похибки вимірювань.';
  }

  // ----------------------------------------------------------------- Події

  function setPressed(container, attr, value) {
    container.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
  }

  function selectSet(key) {
    if (key === 'custom' && !state.custom) {
      $('customBox').open = true;
      applyCustom();
      return;
    }
    state.setKey = key;
    setPressed($('setButtons'), 'set', key);
    render();
  }

  function applyCustom() {
    const r = D.parsePoints($('customText').value);
    if (r.error) {
      $('customError').textContent = r.error;
      return;
    }
    $('customError').textContent = '';
    state.custom = { xs: r.xs, ys: r.ys };
    cache.clear();
    state.setKey = 'custom';
    setPressed($('setButtons'), 'set', 'custom');
    render();
  }

  function bind() {
    $('setButtons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) selectSet(b.dataset.set);
    });
    $('modeButtons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state.mode = b.dataset.mode;
      setPressed($('modeButtons'), 'mode', state.mode);
      render();
    });
    $('degree').addEventListener('change', (e) => {
      state.degree = Number(e.target.value);
      render();
    });
    $('extrap').addEventListener('change', (e) => {
      state.extrap = e.target.checked;
      render();
    });
    $('focus').addEventListener('change', (e) => {
      state.focus = e.target.checked;
      render();
    });
    $('customApply').addEventListener('click', applyCustom);
  }

  function init() {
    $('customText').value = D.toText(D.getSet(10));
    makeCharts();
    bind();
    render();
    window.__lab = { state, compute, render, charts, selectSet }; // для налагодження та автотестів у браузері
  }

  init();
})();
