/**
 * animation.js — чисті функції таймлайнів анімацій (ітерація 4).
 * Не залежать від DOM, тому тестуються в Node. Час — у мілісекундах від старту анімації.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabAnim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Тривалість «плавного переходу» кривої та «паузи» на крок інтерполяції при швидкості 1×. */
  const MORPH_MS = 700;
  const HOLD_MS = 450;
  /** Тривалість анімації МНК при швидкості 1×. */
  const MNK_MS = 3600;

  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  /** Плавність «ease-in-out» (кубічна). */
  function easeInOut(t) {
    t = clamp01(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function interpDuration(n, speed = 1) {
    return (n * (MORPH_MS + HOLD_MS)) / speed;
  }

  /**
   * Кадр анімації інтерполяції: на кроці s (0…n−1) додається вузол s.
   * Повертає { done, step, k, prevK, phi, active }:
   *  k — кількість уже доданих вузлів, prevK — на попередньому кроці,
   *  phi — прогрес переходу кривої prevK → k (0…1), active — індекс активного вузла (−1, якщо кінець).
   */
  function interpFrame(n, tMs, speed = 1) {
    const stepMs = (MORPH_MS + HOLD_MS) / speed;
    if (tMs >= n * stepMs) return { done: true, step: n - 1, k: n, prevK: n, phi: 1, active: -1 };
    const t = Math.max(0, tMs);
    const s = Math.floor(t / stepMs);
    const local = t - s * stepMs;
    return {
      done: false,
      step: s,
      k: s + 1,
      prevK: Math.max(1, s),
      phi: easeInOut(local / (MORPH_MS / speed)),
      active: s,
    };
  }

  /** Крива між двома кривими: (1 − φ)·a + φ·b. */
  function blend(a, b, phi) {
    const out = new Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * phi;
    return out;
  }

  /** Види точок на кроці: до активного — звичайні, активний — виділений, далі — «привиди». */
  function pointKinds(n, frame) {
    return Array.from({ length: n }, (_, i) => (frame.done ? 'normal' : i < frame.active ? 'normal' : i === frame.active ? 'active' : 'ghost'));
  }

  function mnkDuration(speed = 1) {
    return MNK_MS / speed;
  }

  /**
   * Кадр анімації МНК.
   * phi — «ріст» полінома від горизонтальної лінії (середнє ȳ) до остаточної кривої;
   * vis[i] — частка довжини відрізка залишку i (з'являються по черзі зліва направо).
   */
  function mnkFrame(n, tMs, speed = 1) {
    const T = MNK_MS / speed;
    const t = clamp01(tMs / T);
    const vis = new Array(n);
    for (let i = 0; i < n; i++) {
      const start = 0.12 + (0.5 * i) / Math.max(1, n - 1);
      vis[i] = clamp01((t - start) / 0.3);
    }
    return { done: tMs >= T, t, phi: easeInOut(t), vis };
  }

  return { MORPH_MS, HOLD_MS, MNK_MS, easeInOut, interpDuration, interpFrame, blend, pointKinds, mnkDuration, mnkFrame };
});
