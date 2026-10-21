/**
 * chart.js — клас Chart: малювання графіка на Canvas (ітерація 3).
 *
 * Chart отримує «модель» (точки, криві, відрізки, зони екстраполяції) і сам:
 *  - обчислює межі осей X та Y за min/max даних (АВТОМАСШТАБУВАННЯ, FR-8);
 *  - малює сітку, осі з «гарними» позначками, легенду;
 *  - показує підказку при наведенні (координати, значення кривих, дані вузла);
 *  - адаптується до розміру та devicePixelRatio.
 *
 * model = {
 *   xDomain: {min, max},                // діапазон X (вузли + екстраполяція)
 *   points:   [{x, y, i, kind: 'normal'|'active'|'ghost'}],
 *   curves:   [{label, color, xs, ys, width?, dash?}],
 *   segments: [{x, y0, y1, color, marker?, i?, alpha?, width?}],
 *   shade:    [{x0, x1, label}],        // зони екстраполяції
 *   legend:   [{label, color, kind: 'line'|'dot'|'bar'}],
 *   zeroLine: bool, zeroLabel: string,
 *   yIncludeZero: bool, focus: bool,
 * }
 */
(function (root) {
  'use strict';
  const M = root.LabMath;

  const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const FONT = `12px ${FAMILY}`;

  class Chart {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign(
        { title: '', xLabel: 'x', yLabel: 'y', compact: false, smooth: false, nodeLines: null, onRequestDraw: null },
        options || {}
      );
      this.model = { xDomain: { min: 0, max: 1 }, points: [], curves: [], segments: [], shade: [], legend: [] };
      this.view = null;
      this.target = null;
      this.hover = null;
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.plot = { x: 0, y: 0, w: 1, h: 1 };

      const onMove = (e) => {
        const r = canvas.getBoundingClientRect();
        this.hover = { px: e.clientX - r.left, py: e.clientY - r.top };
        this.requestDraw();
      };
      const onLeave = () => {
        this.hover = null;
        this.requestDraw();
      };
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerdown', onMove);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointercancel', onLeave);
    }

    requestDraw() {
      if (this.opts.onRequestDraw) this.opts.onRequestDraw();
      else this.draw();
    }

    setModel(model) {
      this.model = model;
    }

    setLabel(text) {
      this.canvas.setAttribute('aria-label', text);
    }

    /** Підганяє розмір буфера під CSS-розмір полотна та devicePixelRatio. */
    resize() {
      const r = this.canvas.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w < 20 || h < 20) {
        this.w = 0;
        return;
      }
      const dpr = root.devicePixelRatio || 1;
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
      }
    }

    snapView() {
      this.view = null;
    }

    readTheme() {
      const cs = root.getComputedStyle(this.canvas);
      const g = (n, d) => cs.getPropertyValue(n).trim() || d;
      this.theme = {
        bg: g('--chart-bg', '#ffffff'),
        text: g('--text', '#1b1f24'),
        muted: g('--muted', '#59636e'),
        grid: g('--grid', '#e3e7eb'),
        axis: g('--axis', '#8c959f'),
        point: g('--point', '#1b1f24'),
        active: g('--active', '#d6246e'),
        ghost: g('--ghost', '#9aa4ae'),
        zero: g('--zero', '#2f9e44'),
        shade: g('--shade', 'rgba(255,170,0,0.10)'),
        tipBg: g('--tip-bg', 'rgba(255,255,255,0.96)'),
        tipBorder: g('--tip-border', '#c7ced6'),
      };
    }

    // ---------------------------------------------------- Автомасштабування

    /** Цільові межі осей за min/max даних моделі. */
    computeTarget() {
      const m = this.model;
      const dom = m.xDomain;
      const span = dom.max - dom.min || 1;
      const xpad = span * 0.03;
      const vals = [];
      for (const p of m.points) vals.push(p.y);
      for (const s of m.segments) vals.push(s.y0, s.y1);
      if (!m.focus) {
        for (const c of m.curves) {
          for (let i = 0; i < c.xs.length; i++) {
            if (c.xs[i] >= dom.min - 1e-9 && c.xs[i] <= dom.max + 1e-9) vals.push(c.ys[i]);
          }
        }
      }
      const ys = M.autoScale(vals, { pad: m.focus ? 0.35 : 0.08, includeZero: !!m.yIncludeZero });
      return { xmin: dom.min - xpad, xmax: dom.max + xpad, ymin: ys.min, ymax: ys.max };
    }

    /** Оновлює поточні межі: миттєво або плавно (під час анімації). Повертає true, якщо потрібен ще кадр. */
    updateView() {
      const t = (this.target = this.computeTarget());
      if (!this.view || !this.opts.smooth) {
        this.view = Object.assign({}, t);
        return false;
      }
      const v = this.view;
      const k = 0.22;
      let moving = false;
      for (const key of ['xmin', 'xmax', 'ymin', 'ymax']) {
        const scale = Math.max(1e-9, Math.abs(t.ymax - t.ymin), Math.abs(t.xmax - t.xmin));
        if (Math.abs(t[key] - v[key]) > scale * 1e-4) {
          v[key] += (t[key] - v[key]) * k;
          moving = true;
        } else v[key] = t[key];
      }
      return moving;
    }

    // ------------------------------------------------------------ Малювання

    draw() {
      this.resize();
      if (!this.w) return false;
      this.readTheme();
      const { ctx, w, h, dpr, theme: th, model: m } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, w, h);

      const compact = this.opts.compact;
      const hasLegend = m.legend && m.legend.length > 0;
      const left = compact ? 46 : 58;
      const top = (this.opts.title ? 26 : 8) + (hasLegend ? 22 : 0);
      const bottom = compact ? 32 : 40;
      const right = 14;
      const plot = (this.plot = { x: left, y: top, w: Math.max(10, w - left - right), h: Math.max(10, h - top - bottom) });

      const needFrame = this.updateView();
      const v = this.view;
      const sx = (this.sx = (x) => plot.x + ((x - v.xmin) / (v.xmax - v.xmin)) * plot.w);
      const sy = (this.sy = (y) => plot.y + plot.h - ((y - v.ymin) / (v.ymax - v.ymin)) * plot.h);
      const clampPx = (p) => Math.max(-1e5, Math.min(1e5, p));

      // заголовок
      ctx.font = `600 ${compact ? 13 : 14}px ${FAMILY}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = th.text;
      if (this.opts.title) ctx.fillText(this.opts.title, left, 18);

      // легенда
      if (hasLegend) this.drawLegend(left, top - 8);

      // сітка та підписи осей
      ctx.font = FONT;
      const xt = M.niceTicks(v.xmin, v.xmax, Math.max(3, Math.floor(plot.w / (compact ? 60 : 75))));
      const yt = M.niceTicks(v.ymin, v.ymax, Math.max(3, Math.floor(plot.h / (compact ? 34 : 42))));
      ctx.lineWidth = 1;
      ctx.strokeStyle = th.grid;
      ctx.fillStyle = th.muted;
      ctx.beginPath();
      for (const t of xt.ticks) {
        const px = Math.round(sx(t)) + 0.5;
        ctx.moveTo(px, plot.y);
        ctx.lineTo(px, plot.y + plot.h);
      }
      for (const t of yt.ticks) {
        const py = Math.round(sy(t)) + 0.5;
        ctx.moveTo(plot.x, py);
        ctx.lineTo(plot.x + plot.w, py);
      }
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const t of xt.ticks) ctx.fillText(M.formatTick(t, xt.step), sx(t), plot.y + plot.h + 5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const t of yt.ticks) ctx.fillText(M.formatTick(t, yt.step), plot.x - 6, sy(t));

      // зони екстраполяції
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      for (const z of m.shade || []) {
        const a = sx(z.x0);
        const b = sx(z.x1);
        ctx.fillStyle = th.shade;
        ctx.fillRect(Math.min(a, b), plot.y, Math.abs(b - a), plot.h);
        if (z.label && !compact) {
          ctx.fillStyle = th.muted;
          ctx.font = `italic 11px ${FAMILY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(z.label, (a + b) / 2, plot.y + 4);
        }
      }

      // нульова лінія
      if (m.zeroLine) {
        const y0 = sy(0);
        ctx.strokeStyle = th.zero;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(plot.x, y0);
        ctx.lineTo(plot.x + plot.w, y0);
        ctx.stroke();
        ctx.fillStyle = th.zero;
        ctx.font = `600 11px ${FAMILY}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(m.zeroLabel || 'r = 0', plot.x + plot.w - 6, y0 - 3);
      }

      // відрізки (залишки)
      for (const s of m.segments) {
        ctx.globalAlpha = s.alpha == null ? 1 : s.alpha;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width || 2;
        ctx.beginPath();
        ctx.moveTo(sx(s.x), clampPx(sy(s.y0)));
        ctx.lineTo(sx(s.x), clampPx(sy(s.y1)));
        ctx.stroke();
        if (s.marker) {
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(sx(s.x), clampPx(sy(s.y1)), 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // криві
      for (const c of m.curves) {
        ctx.strokeStyle = c.color;
        ctx.lineWidth = c.width || 2.6;
        ctx.setLineDash(c.dash || []);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < c.xs.length; i++) {
          const y = c.ys[i];
          if (!Number.isFinite(y)) {
            pen = false;
            continue;
          }
          const px = sx(c.xs[i]);
          const py = clampPx(sy(y));
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // точки
      for (const p of m.points) {
        const px = sx(p.x);
        const py = clampPx(sy(p.y));
        if (p.kind === 'ghost') {
          ctx.strokeStyle = th.ghost;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(px, py, 3.8, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === 'active') {
          ctx.fillStyle = th.active;
          ctx.globalAlpha = 0.22;
          ctx.beginPath();
          ctx.arc(px, py, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = th.bg;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = th.point;
          ctx.beginPath();
          ctx.arc(px, py, compact ? 3.6 : 4.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = th.bg;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.restore();

      // рамка осей та підписи
      ctx.strokeStyle = th.axis;
      ctx.lineWidth = 1;
      ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w, plot.h);
      ctx.fillStyle = th.muted;
      ctx.font = `italic 12px ${FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      if (!compact) ctx.fillText(this.opts.xLabel, plot.x + plot.w / 2, h - 5);
      else ctx.fillText(this.opts.xLabel, plot.x + plot.w - 6, h - 4);
      ctx.save();
      ctx.translate(13, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      if (!compact) ctx.fillText(this.opts.yLabel, 0, 0);
      ctx.restore();

      if (this.hover) this.drawHover();
      return needFrame;
    }

    drawLegend(x, y) {
      const { ctx, theme: th } = this;
      ctx.font = `12px ${FAMILY}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      let cx = x;
      for (const e of this.model.legend) {
        ctx.strokeStyle = e.color;
        ctx.fillStyle = e.color;
        ctx.lineWidth = 2.6;
        if (e.kind === 'dot') {
          ctx.beginPath();
          ctx.arc(cx + 6, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          cx += 18;
        } else if (e.kind === 'bar') {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + 6, y - 6);
          ctx.lineTo(cx + 6, y + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + 6, y - 6, 3.4, 0, Math.PI * 2);
          ctx.fill();
          cx += 18;
        } else {
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + 20, y);
          ctx.stroke();
          cx += 26;
        }
        ctx.fillStyle = th.text;
        ctx.fillText(e.label, cx, y);
        cx += ctx.measureText(e.label).width + 16;
      }
    }

    /** Значення кривої в точці x (лінійна інтерполяція за вибіркою). */
    static valueAt(c, x) {
      const xs = c.xs;
      if (x < xs[0] || x > xs[xs.length - 1]) return NaN;
      let lo = 0;
      let hi = xs.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] <= x) lo = mid;
        else hi = mid;
      }
      const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
      return c.ys[lo] + t * (c.ys[hi] - c.ys[lo]);
    }

    drawHover() {
      const { ctx, plot, theme: th, model: m } = this;
      const { px, py } = this.hover;
      if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return;
      const v = this.view;
      const dx = v.xmin + ((px - plot.x) / plot.w) * (v.xmax - v.xmin);
      const dy = v.ymin + ((plot.y + plot.h - py) / plot.h) * (v.ymax - v.ymin);

      // найближчий вузол (у пікселях)
      let best = null;
      let bestD = 16;
      const consider = (x, y, i) => {
        const d = Math.hypot(this.sx(x) - px, this.sy(y) - py);
        if (d < bestD) {
          bestD = d;
          best = { x, y, i };
        }
      };
      for (const p of m.points) if (p.kind !== 'ghost') consider(p.x, p.y, p.i);
      if (!m.points.length) for (const s of m.segments) if (s.marker) consider(s.x, s.y1, s.i);

      // перехрестя
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      ctx.strokeStyle = th.axis;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const cxp = best ? this.sx(best.x) : px;
      ctx.beginPath();
      ctx.moveTo(cxp, plot.y);
      ctx.lineTo(cxp, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (best) {
        ctx.strokeStyle = th.active;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.sx(best.x), this.sy(best.y), 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // зміст підказки
      const lines = [];
      const f = (n) => M.fmt(n, 4);
      if (best) {
        lines.push({ t: `Вузол ${best.i + 1}: x = ${f(best.x)}`, c: th.text, b: true });
        if (this.opts.nodeLines) for (const l of this.opts.nodeLines(best.i)) lines.push(l);
        else lines.push({ t: `y = ${f(best.y)}`, c: th.text });
      } else {
        lines.push({ t: `x = ${f(dx)}`, c: th.text, b: true });
        let any = false;
        for (const c of m.curves) {
          const val = Chart.valueAt(c, dx);
          if (Number.isFinite(val)) {
            lines.push({ t: `${c.label}: ${f(val)}`, c: c.color });
            any = true;
          }
        }
        if (!any && !m.curves.length) lines.push({ t: `y = ${f(dy)}`, c: th.muted });
        for (const z of m.shade || []) {
          if (dx >= Math.min(z.x0, z.x1) && dx <= Math.max(z.x0, z.x1)) lines.push({ t: 'екстраполяція — поза вузлами', c: th.muted });
        }
      }

      ctx.font = `12px ${FAMILY}`;
      const padd = 8;
      const lh = 16;
      let tw = 0;
      for (const l of lines) tw = Math.max(tw, ctx.measureText(l.t).width + (l.b ? 8 : 0));
      const bw = tw + padd * 2;
      const bh = lines.length * lh + padd * 2 - 4;
      let bx = px + 14;
      let by = py + 14;
      if (bx + bw > this.w - 4) bx = px - 14 - bw;
      if (by + bh > this.h - 4) by = py - 14 - bh;
      bx = Math.max(4, bx);
      by = Math.max(4, by);
      ctx.fillStyle = th.tipBg;
      ctx.strokeStyle = th.tipBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 6) : ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      lines.forEach((l, i) => {
        ctx.fillStyle = l.c || th.text;
        ctx.font = `${l.b ? '600 ' : ''}12px ${FAMILY}`;
        ctx.fillText(l.t, bx + padd, by + padd - 2 + lh * i + lh / 2);
      });
    }
  }

  root.Chart = Chart;
})(typeof self !== 'undefined' ? self : this);
