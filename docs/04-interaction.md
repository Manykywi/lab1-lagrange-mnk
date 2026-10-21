# 4. Моделювання взаємодії компонентів

Діаграми послідовності описують, як модулі взаємодіють при ключових сценаріях. Архітектурну
(компонентну) діаграму див. у `docs/03-design.md`, п. 3.1.

## 4.1. Вибір набору точок і побудова графіків

<!-- diagram: seq-select -->
```mermaid
sequenceDiagram
    actor U as Користувач
    participant A as app.js (App)
    participant D as datasets.js
    participant M as math.js
    participant C as chart.js (Chart)
    U->>A: клік «20» (набір точок)
    A->>D: getSet(20)
    D-->>A: {xs, ys}
    A->>M: lagrangeEval × 400, dividedDifferences
    A->>M: fitPolynomial(xs, ys, m)
    M-->>A: модель МНК {coef, predict, fitted, residuals}
    A->>M: metrics(ys, fitted)
    A->>C: setModel(модель: точки, криві, відрізки)
    A->>C: requestDraw() → requestAnimationFrame
    C->>M: autoScale(значення Y), niceTicks(...)
    M-->>C: межі осей, позначки
    C-->>U: перемальований Canvas (сітка, осі, криві, легенда)
```

## 4.2. Анімація інтерполяції

<!-- diagram: seq-anim -->
```mermaid
sequenceDiagram
    actor U as Користувач
    participant A as app.js (App)
    participant N as animation.js
    participant M as math.js
    participant C as chart.js (Chart)
    U->>A: клік «▶ Інтерполяція»
    A->>M: lagrangeEval для перших k вузлів (k = 1…n) на 400 абсцисах
    M-->>A: partial[k] — криві p_k(x)
    A->>C: smooth = true (плавний автомасштаб)
    loop кожен кадр requestAnimationFrame
        A->>N: interpFrame(n, t, speed)
        N-->>A: {k, prevK, phi, active}
        A->>N: blend(partial[prevK], partial[k], phi)
        A->>C: setModel(крива, види точок: active/normal/ghost)
        C->>C: autoScale + згладжування меж, малювання
    end
    N-->>A: done
    A->>C: smooth = false, render() — фінальний стан
    C-->>U: повна крива Лагранжа, вузли без виділення
```

## 4.3. Підказка при наведенні

<!-- diagram: seq-hover -->
```mermaid
sequenceDiagram
    actor U as Користувач
    participant C as chart.js (Chart)
    participant A as app.js (App)
    U->>C: pointermove (px, py)
    C->>C: перетворення пікселів у координати даних
    C->>C: пошук найближчого вузла (≤ 16 px)
    alt курсор біля вузла
        C->>A: nodeLines(i)
        A-->>C: y, p(x), ŷ, r = y − ŷ
    else між вузлами
        C->>C: valueAt(крива, x) — лінійна інтерполяція вибірки
    end
    C-->>U: перехрестя, виділення вузла, підказка з координатами та похибкою
```
