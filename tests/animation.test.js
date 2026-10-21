'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/animation.js');

test('easeInOut: межі, монотонність, симетрія', () => {
  assert.equal(A.easeInOut(0), 0);
  assert.equal(A.easeInOut(1), 1);
  assert.equal(A.easeInOut(-5), 0);
  assert.equal(A.easeInOut(7), 1);
  assert.ok(Math.abs(A.easeInOut(0.5) - 0.5) < 1e-12);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const v = A.easeInOut(i / 100);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('interpFrame: вузли додаються по одному, активний вузол = поточний крок', () => {
  const n = 10;
  const step = A.MORPH_MS + A.HOLD_MS;
  for (let s = 0; s < n; s++) {
    const f = A.interpFrame(n, s * step + 10);
    assert.equal(f.k, s + 1);
    assert.equal(f.active, s);
    assert.equal(f.done, false);
    assert.equal(f.prevK, Math.max(1, s));
  }
  const end = A.interpFrame(n, n * step + 1);
  assert.equal(end.done, true);
  assert.equal(end.k, n);
  assert.equal(end.active, -1);
});

test('interpFrame: phi зростає в межах кроку і «тримається» на 1 під час паузи', () => {
  const f0 = A.interpFrame(5, 0);
  const fMid = A.interpFrame(5, A.MORPH_MS / 2);
  const fHold = A.interpFrame(5, A.MORPH_MS + 100);
  assert.equal(f0.phi, 0);
  assert.ok(fMid.phi > 0.4 && fMid.phi < 0.6);
  assert.equal(fHold.phi, 1);
});

test('interpFrame: швидкість 2× вдвічі скорочує тривалість', () => {
  assert.equal(A.interpDuration(10, 2), A.interpDuration(10, 1) / 2);
  assert.equal(A.interpFrame(5, A.interpDuration(5, 2) + 1, 2).done, true);
  assert.equal(A.interpFrame(5, A.interpDuration(5, 1) - 1, 2).done, true);
});

test('pointKinds: нормальні → активний → «привиди»', () => {
  const f = A.interpFrame(5, 2 * (A.MORPH_MS + A.HOLD_MS) + 5);
  assert.deepEqual(A.pointKinds(5, f), ['normal', 'normal', 'active', 'ghost', 'ghost']);
  assert.deepEqual(A.pointKinds(3, A.interpFrame(3, 1e9)), ['normal', 'normal', 'normal']);
});

test('blend: інтерполяція між кривими', () => {
  assert.deepEqual(A.blend([0, 10], [10, 20], 0), [0, 10]);
  assert.deepEqual(A.blend([0, 10], [10, 20], 1), [10, 20]);
  assert.deepEqual(A.blend([0, 10], [10, 20], 0.5), [5, 15]);
});

test('mnkFrame: φ від 0 до 1, відрізки залишків з’являються по черзі й досягають 1', () => {
  const n = 10;
  const a = A.mnkFrame(n, 0);
  assert.equal(a.phi, 0);
  assert.ok(a.vis.every((v) => v === 0));
  const mid = A.mnkFrame(n, A.MNK_MS * 0.5);
  for (let i = 1; i < n; i++) assert.ok(mid.vis[i] <= mid.vis[i - 1], 'ліві відрізки з’являються раніше');
  assert.ok(mid.vis[0] > 0);
  const end = A.mnkFrame(n, A.MNK_MS);
  assert.equal(end.done, true);
  assert.equal(end.phi, 1);
  assert.ok(end.vis.every((v) => v === 1));
});
