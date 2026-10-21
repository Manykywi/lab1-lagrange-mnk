'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/datasets.js');

test('Варіант 6: перші 5 точок збігаються з таблицею варіантів', () => {
  const s = D.getSet(5);
  assert.deepEqual(s.xs, [1, 2, 3, 4, 5]);
  assert.deepEqual(s.ys, [5.2, 4.8, 4.5, 4.1, 3.8]);
});

test('Набори вкладені: 5 ⊂ 10 ⊂ 20 і мають потрібну довжину', () => {
  const s5 = D.getSet(5), s10 = D.getSet(10), s20 = D.getSet(20);
  assert.equal(s5.xs.length, 5);
  assert.equal(s10.xs.length, 10);
  assert.equal(s20.xs.length, 20);
  assert.deepEqual(s10.ys.slice(0, 5), s5.ys);
  assert.deepEqual(s20.ys.slice(0, 10), s10.ys);
});

test('Точки 6…20 відхиляються від тренду y = 5.55 − 0.35x не більше ніж на 0.1', () => {
  const s = D.getSet(20);
  s.xs.forEach((x, i) => {
    const dev = Math.abs(s.ys[i] - (D.TREND.a + D.TREND.b * x));
    assert.ok(dev <= 0.1 + 1e-9, `x=${x}: відхилення ${dev}`);
  });
});

test('getSet відхиляє непідтримувані розміри', () => {
  assert.throws(() => D.getSet(7), /5, 10 та 20/);
});

test('parsePoints: різні роздільники, дужки, коментарі, сортування', () => {
  const r = D.parsePoints('# дані\n(3, 1.5)\n1 2\n2;4.5\n');
  assert.deepEqual(r.xs, [1, 2, 3]);
  assert.deepEqual(r.ys, [2, 4.5, 1.5]);
});

test('parsePoints: помилки — мало точок, повтор x, не числа, зайві значення', () => {
  assert.match(D.parsePoints('1 2').error, /щонайменше 2/);
  assert.match(D.parsePoints('1 2\n1 3').error, /різними/);
  assert.match(D.parsePoints('1 2\nabc 3').error, /Рядок 2/);
  assert.match(D.parsePoints('1 2 3\n4 5').error, /Рядок 1/);
  assert.match(D.parsePoints('').error, /щонайменше 2/);
  const many = Array.from({ length: 61 }, (_, i) => `${i} ${i}`).join('\n');
  assert.match(D.parsePoints(many).error, /Забагато/);
});

test('toText ↔ parsePoints круговий перехід', () => {
  const s = D.getSet(10);
  const back = D.parsePoints(D.toText(s));
  assert.deepEqual(back.xs, s.xs);
  assert.deepEqual(back.ys, s.ys);
});
