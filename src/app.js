/**
 * app.js — контролер застосунку: стан, обчислення, побудова моделей графіків, події UI.
 * Ітерація 3: один набір, перемикач режимів, залишки, підказки, таблиці.
 * Ітерація 4: анімації інтерполяції та МНК, подання «Порівняння 5·10·20» (6 графіків).
 */
(function () {
  'use strict';
  const M = window.LabMath;
  const D = window.LabData;
  const A = window.LabAnim;
  const $ = (id) => document.getElementById(id);

  const state = {
    setKey: '10', // '5' | '10' | '20' | 'custom'
    mode: 'all', // 'interp' | 'mnk' | 'all'
    degree: 2,
    extrap: false,
    focus: false,
    custom: null,
    view: 'single', // 'single' | 'compare'
    anim: null, // { kind, t0, speed, d, partial, mean }
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
    const limit = o.limit == null ? d.n : o.limit;
    if (o.mode !== 'mnk') {
      d.xs.forEach((x, i) => i < limit && segments.push({ x, y0: 0, y1: d.newtonAtNodes[i] - d.ys[i], color: c.lag, marker: true, i, width: 1.4 }));
      legend.push({ label: 'Лагранж: rᵢ ≈ 0 у вузлах', color: c.lag, kind: 'bar' });
    }
    if (o.mode !== 'interp') {
      const res = o.residuals || d.fit.residuals;
      d.xs.forEach((x, i) => i < limit && res[i] != null && segments.push({ x, y0: 0, y1: res[i], color: c.mnk, marker: true, i, width: 2.2 }));
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

  function loop(now) {
    rafId = 0;
    let more = false;
    if (state.anim) {
      stepAnimation(now == null ? performance.now() : now);
      more = !!state.anim;
    }
    for (const ch of Object.values(charts)) {
      if (ch.canvas.offsetParent !== null && ch.draw()) more = true;
    }
    if (more) requestDraw();
  }

  function makeCharts() {
    const common = { onRequestDraw: requestDraw };
    charts.main = new window.Chart($('mainChart'), Object.assign({ title: '', xLabel: 'x', yLabel: 'y', nodeLines: (i) => nodeLinesMain(i) }, common));
    charts.res = new window.Chart($('resChart'), Object.assign({ xLabel: 'x', yLabel: 'r = y − ŷ', nodeLines: (i) => nodeLinesRes(i) }, common));
    for (const s of D.SIZES) {
      charts['cmpL' + s] = new window.Chart($('cmpL' + s), Object.assign({ compact: true, xLabel: 'x', yLabel: 'y' }, common));
      charts['cmpM' + s] = new window.Chart($('cmpM' + s), Object.assign({ compact: true, xLabel: 'x', yLabel: 'y' }, common));
    }
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
    renderCompare();
    renderPanels(d);
    renderMetrics();
    renderStatus(d);
    requestDraw();
  }

  /** Шість графіків: Лагранж та МНК для 5, 10 і 20 точок. */
  function renderCompare() {
    for (const s of D.SIZES) {
      const d = compute(String(s), state.degree, state.extrap);
      const lag = charts['cmpL' + s];
      const mnk = charts['cmpM' + s];
      lag.opts.title = `Лагранж · ${s} точок`;
      mnk.opts.title = `МНК (m = ${d.m}) · ${s} точок`;
      lag.setModel(buildMainModel(d, { mode: 'interp', focus: state.focus }));
      mnk.setModel(buildMainModel(d, { mode: 'mnk', focus: state.focus }));
      lag.snapView();
      mnk.snapView();
    }
    $('rowLag').style.display = state.mode === 'mnk' ? 'none' : '';
    $('rowMnk').style.display = state.mode === 'interp' ? 'none' : '';
  }

  // -------------------------------------------------------------- Анімації

  function mean(a) {
    return a.reduce((s, v) => s + v, 0) / a.length;
  }

  /** Лагранж через перші k вузлів, k = 1…n, на тих самих 400 абсцисах (для плавних переходів). */
  function partialCurves(d) {
    const out = [null];
    for (let k = 1; k <= d.n; k++) {
      const xs = d.xs.slice(0, k);
      const ys = d.ys.slice(0, k);
      out.push(d.lag.xs.map((x) => M.lagrangeEval(xs, ys, x)));
    }
    return out;
  }

  function startAnim(kind) {
    if (state.view !== 'single') setView('single');
    const d = current();
    state.mode = kind === 'interp' ? 'interp' : 'mnk';
    setPressed($('modeButtons'), 'mode', state.mode);
    state.anim = {
      kind,
      d,
      speed: Number($('speed').value),
      t0: performance.now(),
      partial: kind === 'interp' ? partialCurves(d) : null,
      mean: mean(d.ys),
    };
    charts.main.opts.smooth = true;
    charts.res.opts.smooth = true;
    charts.main.snapView();
    charts.res.snapView();
    $('btnStop').disabled = false;
    requestDraw();
  }

  function stopAnim() {
    if (!state.anim) return;
    state.anim = null;
    charts.main.opts.smooth = false;
    charts.res.opts.smooth = false;
    $('btnStop').disabled = true;
    render();
  }

  /** Один кадр анімації: оновлює моделі основного графіка та графіка залишків. */
  function stepAnimation(now) {
    const an = state.anim;
    const d = an.d;
    const c = colors();
    const t = now - an.t0;
    if (an.kind === 'interp') {
      const f = A.interpFrame(d.n, t, an.speed);
      if (f.done) return finishAnim();
      const ys = A.blend(an.partial[f.prevK], an.partial[f.k], f.phi);
      charts.main.setModel(
        buildMainModel(d, {
          mode: 'interp',
          focus: state.focus,
          curves: [{ label: 'Лагранж', color: c.lag, xs: d.lag.xs, ys }],
          pointKinds: A.pointKinds(d.n, f),
          segments: [],
        })
      );
      charts.main.opts.title = `Інтерполяція Лагранжа: крок ${f.k} з ${d.n}`;
      charts.res.setModel(buildResidualModel(d, { mode: 'interp', limit: f.k }));
      $('status').textContent = `Анімація інтерполяції: крок ${f.k} з ${d.n} — додано вузол (${M.fmt(d.xs[f.active])}; ${M.fmt(d.ys[f.active])}), степінь полінома ${f.k - 1}`;
    } else {
      const f = A.mnkFrame(d.n, t, an.speed);
      if (f.done) return finishAnim();
      const ys = d.mnk.ys.map((y) => an.mean + f.phi * (y - an.mean));
      const yhat = d.fit.fitted.map((y) => an.mean + f.phi * (y - an.mean));
      const segments = d.xs.map((x, i) => ({ x, y0: yhat[i], y1: yhat[i] + f.vis[i] * (d.ys[i] - yhat[i]), color: c.mnk, width: 1.8, i }));
      const residuals = d.ys.map((y, i) => f.vis[i] * (y - yhat[i]));
      charts.main.setModel(buildMainModel(d, { mode: 'mnk', focus: state.focus, curves: [{ label: `МНК (m = ${d.m})`, color: c.mnk, xs: d.mnk.xs, ys }], segments }));
      charts.main.opts.title = `МНК: поліном «росте» від горизонтальної лінії ȳ = ${M.fmt(an.mean)}`;
      charts.res.setModel(buildResidualModel(d, { mode: 'mnk', residuals }));
      $('status').textContent = `Анімація МНК: ${Math.round(f.t * 100)} % — від ȳ до полінома ступеня ${d.m}`;
    }
  }

  function finishAnim() {
    state.anim = null;
    charts.main.opts.smooth = false;
    charts.res.opts.smooth = false;
    $('btnStop').disabled = true;
    render();
  }

  function setView(v) {
    state.view = v;
    setPressed($('viewButtons'), 'view', v);
    $('viewSingle').classList.toggle('off', v === 'compare');
    $('viewCompare').classList.toggle('on', v === 'compare');
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

  /** Зупиняє анімацію без перерендеру (його виконає обробник зміни параметра). */
  function dropAnim() {
    if (!state.anim) return;
    state.anim = null;
    charts.main.opts.smooth = false;
    charts.res.opts.smooth = false;
    $('btnStop').disabled = true;
  }

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
      if (b) {
        dropAnim();
        selectSet(b.dataset.set);
      }
    });
    $('modeButtons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      dropAnim();
      state.mode = b.dataset.mode;
      setPressed($('modeButtons'), 'mode', state.mode);
      render();
    });
    $('degree').addEventListener('change', (e) => {
      dropAnim();
      state.degree = Number(e.target.value);
      render();
    });
    $('extrap').addEventListener('change', (e) => {
      dropAnim();
      state.extrap = e.target.checked;
      render();
    });
    $('focus').addEventListener('change', (e) => {
      dropAnim();
      state.focus = e.target.checked;
      render();
    });
    $('customApply').addEventListener('click', () => {
      dropAnim();
      applyCustom();
    });
    $('viewButtons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      dropAnim();
      setView(b.dataset.view);
    });
    $('btnAnimInterp').addEventListener('click', () => startAnim('interp'));
    $('btnAnimMnk').addEventListener('click', () => startAnim('mnk'));
    $('btnStop').addEventListener('click', stopAnim);
  }

  function init() {
    $('customText').value = D.toText(D.getSet(10));
    makeCharts();
    bind();
    render();
    window.__lab = { state, compute, render, charts, selectSet, startAnim, stopAnim, setView }; // для налагодження та автотестів у браузері
  }

  init();
})();
