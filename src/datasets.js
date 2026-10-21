/**
 * datasets.js — набори точок варіанта № 6 та розбір користувацького набору.
 *
 * У таблиці варіантів задано лише 5 точок. Набори з 10 і 20 точок — вкладені
 * (5 ⊂ 10 ⊂ 20) продовження тієї ж закономірності: спадний майже лінійний
 * тренд y ≈ 5.55 − 0.35·x з невеликою похибкою вимірювання (див. docs/01-tz.md, припущення A1).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VARIANT = 6;

  /** Опорна лінія, за якою згенеровано точки 6…20 (використовується в аналізі). */
  const TREND = { a: 5.55, b: -0.35 };

  /** Повний набір 20 точок; перші 5 — із таблиці варіантів, перші 10 — проміжний набір. */
  const POINTS_20 = [
    [1, 5.2], [2, 4.8], [3, 4.5], [4, 4.1], [5, 3.8],
    [6, 3.4], [7, 3.15], [8, 2.7], [9, 2.5], [10, 2.0],
    [11, 1.75], [12, 1.3], [13, 1.1], [14, 0.6], [15, 0.35],
    [16, -0.1], [17, -0.3], [18, -0.8], [19, -1.05], [20, -1.5],
  ];

  function toSet(points) {
    return { xs: points.map((p) => p[0]), ys: points.map((p) => p[1]) };
  }

  /** Набір із перших n точок (n = 5, 10, 20). */
  function getSet(n) {
    if (![5, 10, 20].includes(n)) throw new Error('Підтримуються набори 5, 10 та 20 точок');
    return toSet(POINTS_20.slice(0, n));
  }

  const SIZES = [5, 10, 20];
  const MAX_CUSTOM_POINTS = 60;

  /**
   * Розбір тексту «x y» (по рядку на точку; роздільники: пробіл, табуляція, «,» або «;»;
   * десятковий роздільник — крапка). Повертає { xs, ys } або { error }.
   */
  function parsePoints(text) {
    const xs = [];
    const ys = [];
    const lines = String(text || '').split(/\r?\n/);
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li].replace(/[()]/g, ' ').trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/[\s,;]+/).filter(Boolean);
      if (parts.length !== 2) return { error: `Рядок ${li + 1}: потрібно рівно два числа «x y»` };
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: `Рядок ${li + 1}: «${line}» — не числа` };
      xs.push(x);
      ys.push(y);
    }
    if (xs.length < 2) return { error: 'Потрібно щонайменше 2 точки' };
    if (xs.length > MAX_CUSTOM_POINTS) return { error: `Забагато точок (максимум ${MAX_CUSTOM_POINTS})` };
    if (new Set(xs).size !== xs.length) return { error: 'Значення x мають бути різними' };
    // сортуємо за x (вузли інтерполяції впорядковані)
    const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    return { xs: idx.map((i) => xs[i]), ys: idx.map((i) => ys[i]) };
  }

  /** Текст набору для поля введення. */
  function toText(set) {
    return set.xs.map((x, i) => `${x} ${set.ys[i]}`).join('\n');
  }

  return { VARIANT, TREND, SIZES, MAX_CUSTOM_POINTS, POINTS_20, getSet, parsePoints, toText };
});
