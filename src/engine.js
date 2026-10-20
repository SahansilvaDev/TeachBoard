/* TeachBoard drawing engine.
 * One Board instance drives one <canvas>. It is used for the infinite whiteboard,
 * for each annotated PDF page ("fixed" mode) and for transparent overlays (web / screen ink).
 * Elements are plain JSON objects and are treated as immutable: any change replaces the
 * element with a copy, so undo snapshots can be cheap array copies.
 */
(function () {
  const TAU = Math.PI * 2;

  const FONTS = {
    sans: '"Segoe UI", Arial, sans-serif',
    mono: '"Cascadia Code", Consolas, "Courier New", monospace',
    hand: '"Segoe Print", "Comic Sans MS", cursive',
    serif: 'Georgia, "Times New Roman", serif',
  };

  const BACKGROUNDS = [
    { id: 'white', name: 'White', color: '#ffffff', pattern: null, dark: false },
    { id: 'grid', name: 'Grid', color: '#ffffff', pattern: 'grid', line: '#dfe5ee', dark: false },
    { id: 'dots', name: 'Dots', color: '#ffffff', pattern: 'dots', line: '#b9c3d1', dark: false },
    { id: 'lines', name: 'Ruled', color: '#fffef7', pattern: 'lines', line: '#c4d7ef', dark: false },
    { id: 'dark', name: 'Dark', color: '#1b1e24', pattern: null, dark: true },
    { id: 'darkgrid', name: 'Dark grid', color: '#1b1e24', pattern: 'grid', line: '#2d333d', dark: true },
    { id: 'chalk', name: 'Chalkboard', color: '#24402f', pattern: null, dark: true },
    { id: 'blueprint', name: 'Blueprint', color: '#163a66', pattern: 'grid', line: '#24508a', dark: true },
    { id: 'transparent', name: 'None', color: null, pattern: null, dark: false, hidden: true },
  ];
  const bgById = (id) => BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];

  // ---------- Shared tool state ----------
  const Tools = {
    tool: 'pen',
    color: '#1d1d1f',
    size: 4,
    shape: 'rect',
    fill: 'none', // none | light | solid
    dash: false,
    font: 'sans',
    textStyle: 'plain', // plain | sticky | code
    fontSize: 28,
    eraserMode: 'partial', // partial | object
    tableRows: 3,
    tableCols: 3,
    _listeners: [],
    set(patch) {
      Object.assign(this, patch);
      this._listeners.forEach((f) => f(patch));
    },
    on(f) { this._listeners.push(f); },
  };

  // ---------- Geometry helpers ----------
  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  const LINE_KINDS = new Set(['line', 'arrow', 'dblarrow']);

  const bboxCache = new WeakMap();
  function bbox(el) {
    let b = bboxCache.get(el);
    if (b) return b;
    if (el.type === 'stroke') {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of el.pts) {
        if (p[0] < x0) x0 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[0] > x1) x1 = p[0];
        if (p[1] > y1) y1 = p[1];
      }
      const r = el.size / 2;
      b = { x: x0 - r, y: y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
    } else if (el.type === 'shape') {
      const r = el.size / 2;
      const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
      b = { x: x - r, y: y - r, w: Math.abs(el.x2 - el.x1) + 2 * r, h: Math.abs(el.y2 - el.y1) + 2 * r };
    } else {
      b = { x: el.x, y: el.y, w: el.w, h: el.h };
    }
    bboxCache.set(el, b);
    return b;
  }
  function unionBox(els) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) {
      const b = bbox(el);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const inBox = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
  const boxesOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // strict=true (eraser): unfilled shapes only hit near their outline.
  function hitEl(el, x, y, tol, strict) {
    const b = bbox(el);
    if (!inBox(b, x, y, tol)) return false;
    if (el.type === 'stroke') {
      const r = el.size / 2 + tol, p = el.pts;
      if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= r;
      for (let i = 1; i < p.length; i++) if (distToSeg(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= r) return true;
      return false;
    }
    if (el.type === 'shape') {
      if (LINE_KINDS.has(el.kind)) return distToSeg(x, y, el.x1, el.y1, el.x2, el.y2) <= el.size / 2 + tol;
      if (!strict || el.fill !== 'none' || el.label) return true;
      const r = el.size / 2 + tol;
      return x < b.x + r || x > b.x + b.w - r || y < b.y + r || y > b.y + b.h - r;
    }
    return true;
  }

  // Returns a transformed copy of an element. f maps a world point, s is the size scale.
  function mapEl(el, f, s) {
    const c = { ...el };
    if (el.type === 'stroke') {
      c.pts = el.pts.map((p) => { const q = f(p[0], p[1]); return [q[0], q[1], p[2]]; });
    } else if (el.type === 'shape') {
      [c.x1, c.y1] = f(el.x1, el.y1);
      [c.x2, c.y2] = f(el.x2, el.y2);
      if (el.labelSize) c.labelSize = el.labelSize * s;
    } else if (el.type === 'text') {
      [c.x, c.y] = f(el.x, el.y);
      c.fontSize = el.fontSize * s; c.w = el.w * s; c.h = el.h * s;
    } else if (el.type === 'image') {
      const a = f(el.x, el.y), b = f(el.x + el.w, el.y + el.h);
      c.x = Math.min(a[0], b[0]); c.y = Math.min(a[1], b[1]);
      c.w = Math.abs(b[0] - a[0]); c.h = Math.abs(b[1] - a[1]);
    }
    return c;
  }

  function hexA(color, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(color);
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function isDarkColor(color) {
    const m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 110;
  }

  // ---------- Images ----------
  const imgCache = new Map();
  function getImage(src, onload) {
    let rec = imgCache.get(src);
    if (!rec) {
      const img = new Image();
      rec = { img, ready: false, waiters: [] };
      img.onload = () => { rec.ready = true; rec.waiters.forEach((f) => f()); rec.waiters = []; };
      img.src = src;
      imgCache.set(src, rec);
    }
    if (!rec.ready && onload) rec.waiters.push(onload);
    return rec;
  }
  function loadImage(src) {
    return new Promise((res, rej) => {
      const rec = getImage(src);
      if (rec.ready) return res(rec.img);
      rec.waiters.push(() => res(rec.img));
      rec.img.addEventListener('error', rej, { once: true });
    });
  }

  // ---------- Element drawing ----------
  function drawStroke(ctx, el) {
    const p = el.pts;
    ctx.save();
    ctx.globalAlpha = el.alpha ?? 1;
    ctx.strokeStyle = ctx.fillStyle = el.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], el.size / 2, 0, TAU);
      ctx.fill();
    } else if (el.pressure) {
      // Pen with pressure: draw each segment with its own width.
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i];
        ctx.lineWidth = el.size * (0.35 + ((a[2] + b[2]) / 2) * 1.3);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = el.size;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length - 1; i++) {
        ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
      }
      ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function arrowHead(ctx, x1, y1, x2, y2, size) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const L = Math.max(12, size * 3.5);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45));
    ctx.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  // Shape library. Each entry draws inside the box g = {x, y, w, h, cx, cy}.
  // g.shape(build) builds a closed path and fills + strokes it; g.lines(...) strokes open segments.
  const SHAPES = {
    rect: { name: 'Rectangle', draw: (c, g) => g.shape(() => c.rect(g.x, g.y, g.w, g.h)) },
    roundrect: { name: 'Rounded rectangle', draw: (c, g) => g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.18)) },
    ellipse: { name: 'Ellipse', draw: (c, g) => g.shape(() => c.ellipse(g.cx, g.cy, g.w / 2, g.h / 2, 0, 0, TAU)) },
    triangle: { name: 'Triangle', draw: (c, g) => g.poly([[g.cx, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]) },
    rtriangle: { name: 'Right triangle', draw: (c, g) => g.poly([[g.x, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]) },
    diamond: { name: 'Diamond', draw: (c, g) => g.poly([[g.cx, g.y], [g.x + g.w, g.cy], [g.cx, g.y + g.h], [g.x, g.cy]]) },
    pentagon: { name: 'Pentagon', draw: (c, g) => g.regular(5, -Math.PI / 2) },
    hexagon: { name: 'Hexagon', draw: (c, g) => g.regular(6, 0) },
    star: {
      name: 'Star',
      draw: (c, g) => {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.42 : 1;
          pts.push([g.cx + (Math.cos(a) * g.w * r) / 2, g.cy + (Math.sin(a) * g.h * r) / 2 + g.h * 0.05]);
        }
        g.poly(pts);
      },
    },
    callout: {
      name: 'Speech bubble',
      draw: (c, g) => g.shape(() => {
        const bh = g.h * 0.75, r = Math.min(g.w, bh) * 0.2;
        c.roundRect(g.x, g.y, g.w, bh, r);
        c.moveTo(g.x + g.w * 0.2, g.y + bh);
        c.lineTo(g.x + g.w * 0.12, g.y + g.h);
        c.lineTo(g.x + g.w * 0.38, g.y + bh);
      }),
    },
    line: { name: 'Line', line: true },
    arrow: { name: 'Arrow', line: true },
    dblarrow: { name: 'Double arrow', line: true },

    // Flowchart
    terminator: { name: 'Start / End', draw: (c, g) => g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, g.h / 2)) },
    process: { name: 'Process', draw: (c, g) => g.shape(() => c.rect(g.x, g.y, g.w, g.h)) },
    decision: { name: 'Decision', draw: (c, g) => g.poly([[g.cx, g.y], [g.x + g.w, g.cy], [g.cx, g.y + g.h], [g.x, g.cy]]) },
    io: {
      name: 'Input / Output',
      draw: (c, g) => { const k = Math.min(g.w * 0.2, g.h * 0.5); g.poly([[g.x + k, g.y], [g.x + g.w, g.y], [g.x + g.w - k, g.y + g.h], [g.x, g.y + g.h]]); },
    },
    predefined: {
      name: 'Subroutine',
      draw: (c, g) => { g.shape(() => c.rect(g.x, g.y, g.w, g.h)); const k = g.w * 0.1; g.lines([g.x + k, g.y, g.x + k, g.y + g.h], [g.x + g.w - k, g.y, g.x + g.w - k, g.y + g.h]); },
    },
    document: {
      name: 'Document',
      draw: (c, g) => g.shape(() => {
        const wy = g.y + g.h * 0.85, a = g.h * 0.12;
        c.moveTo(g.x, g.y); c.lineTo(g.x + g.w, g.y); c.lineTo(g.x + g.w, wy);
        c.bezierCurveTo(g.x + g.w * 0.75, wy - a * 1.5, g.x + g.w * 0.5, wy - a, g.x + g.w * 0.5, wy);
        c.bezierCurveTo(g.x + g.w * 0.5, wy + a, g.x + g.w * 0.25, wy + a * 1.5, g.x, wy);
        c.closePath();
      }),
    },
    preparation: {
      name: 'Preparation',
      draw: (c, g) => { const k = Math.min(g.w * 0.2, g.h * 0.5); g.poly([[g.x + k, g.y], [g.x + g.w - k, g.y], [g.x + g.w, g.cy], [g.x + g.w - k, g.y + g.h], [g.x + k, g.y + g.h], [g.x, g.cy]]); },
    },
    connector: { name: 'Connector', draw: (c, g) => g.shape(() => c.ellipse(g.cx, g.cy, g.w / 2, g.h / 2, 0, 0, TAU)) },
    database: {
      name: 'Database',
      draw: (c, g) => {
        const ry = Math.min(g.h * 0.15, g.w * 0.25);
        g.shape(() => {
          c.ellipse(g.cx, g.y + ry, g.w / 2, ry, 0, Math.PI, 0);
          c.lineTo(g.x + g.w, g.y + g.h - ry);
          c.ellipse(g.cx, g.y + g.h - ry, g.w / 2, ry, 0, 0, Math.PI);
          c.closePath();
        });
        c.beginPath(); c.ellipse(g.cx, g.y + ry, g.w / 2, ry, 0, 0, Math.PI); c.stroke();
      },
    },

    // Logic gates (inputs on the left, output on the right)
    and: { name: 'AND gate', draw: (c, g) => gate(c, g, 'and', false) },
    or: { name: 'OR gate', draw: (c, g) => gate(c, g, 'or', false) },
    not: { name: 'NOT gate', draw: (c, g) => gate(c, g, 'not', true) },
    nand: { name: 'NAND gate', draw: (c, g) => gate(c, g, 'and', true) },
    nor: { name: 'NOR gate', draw: (c, g) => gate(c, g, 'or', true) },
    xor: { name: 'XOR gate', draw: (c, g) => gate(c, g, 'xor', false) },
    xnor: { name: 'XNOR gate', draw: (c, g) => gate(c, g, 'xor', true) },

    // Network / ICT
    computer: {
      name: 'Computer',
      draw: (c, g) => {
        const mh = g.h * 0.72;
        g.shape(() => c.roundRect(g.x, g.y, g.w, mh, Math.min(g.w, mh) * 0.06));
        c.beginPath(); c.rect(g.x + g.w * 0.07, g.y + mh * 0.1, g.w * 0.86, mh * 0.74); c.stroke();
        g.lines([g.cx, g.y + mh, g.cx, g.y + g.h * 0.92], [g.x + g.w * 0.28, g.y + g.h, g.x + g.w * 0.72, g.y + g.h],
          [g.x + g.w * 0.28, g.y + g.h, g.x + g.w * 0.36, g.y + g.h * 0.92], [g.x + g.w * 0.72, g.y + g.h, g.x + g.w * 0.64, g.y + g.h * 0.92],
          [g.x + g.w * 0.36, g.y + g.h * 0.92, g.x + g.w * 0.64, g.y + g.h * 0.92]);
      },
    },
    laptop: {
      name: 'Laptop',
      draw: (c, g) => {
        const sh = g.h * 0.75;
        g.shape(() => c.roundRect(g.x + g.w * 0.1, g.y, g.w * 0.8, sh, Math.min(g.w, sh) * 0.05));
        c.beginPath(); c.rect(g.x + g.w * 0.16, g.y + sh * 0.1, g.w * 0.68, sh * 0.8); c.stroke();
        g.poly([[g.x + g.w * 0.1, g.y + sh], [g.x + g.w * 0.9, g.y + sh], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]);
      },
    },
    server: {
      name: 'Server',
      draw: (c, g) => {
        g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.05));
        for (let i = 1; i < 3; i++) g.lines([g.x, g.y + (g.h * i) / 3, g.x + g.w, g.y + (g.h * i) / 3]);
        for (let i = 0; i < 3; i++) {
          const yy = g.y + (g.h * (i + 0.5)) / 3, r = Math.max(1.5, Math.min(g.w, g.h) * 0.035);
          c.beginPath(); c.arc(g.x + g.w * 0.82, yy, r, 0, TAU); c.fill();
          g.lines([g.x + g.w * 0.12, yy, g.x + g.w * 0.55, yy]);
        }
      },
    },
    router: {
      name: 'Router / Wi-Fi',
      draw: (c, g) => {
        const top = g.y + g.h * 0.5;
        g.shape(() => c.roundRect(g.x, top, g.w, g.h * 0.5, g.h * 0.08));
        g.lines([g.x + g.w * 0.2, top, g.x + g.w * 0.12, g.y], [g.x + g.w * 0.8, top, g.x + g.w * 0.88, g.y]);
        for (let i = 0; i < 4; i++) {
          c.beginPath(); c.arc(g.x + g.w * (0.2 + i * 0.12), top + g.h * 0.25, Math.max(1.5, g.h * 0.035), 0, TAU); c.fill();
        }
        for (let i = 1; i <= 2; i++) {
          c.beginPath(); c.arc(g.cx, top - g.h * 0.02, g.h * 0.14 * i, -Math.PI * 0.75, -Math.PI * 0.25); c.stroke();
        }
      },
    },
    switch: {
      name: 'Switch / Hub',
      draw: (c, g) => {
        g.shape(() => c.roundRect(g.x, g.y + g.h * 0.25, g.w, g.h * 0.5, g.h * 0.06));
        const n = 6, pw = g.w / (n * 1.6);
        for (let i = 0; i < n; i++) {
          c.beginPath(); c.rect(g.x + g.w * 0.08 + i * pw * 1.45, g.y + g.h * 0.42, pw, g.h * 0.16); c.stroke();
        }
      },
    },
    firewall: {
      name: 'Firewall',
      draw: (c, g) => {
        g.shape(() => c.rect(g.x, g.y, g.w, g.h));
        const rows = 4, rh = g.h / rows;
        for (let r = 1; r < rows; r++) g.lines([g.x, g.y + r * rh, g.x + g.w, g.y + r * rh]);
        for (let r = 0; r < rows; r++) {
          const off = r % 2 ? 0.25 : 0.5;
          for (let k = off; k < 1; k += 0.5) g.lines([g.x + g.w * k, g.y + r * rh, g.x + g.w * k, g.y + (r + 1) * rh]);
        }
      },
    },
    cloud: {
      name: 'Cloud / Internet',
      draw: (c, g) => g.shape(() => {
        const { x, y, w, h } = g;
        c.moveTo(x + w * 0.22, y + h * 0.9);
        c.bezierCurveTo(x - w * 0.05, y + h * 0.9, x - w * 0.02, y + h * 0.45, x + w * 0.2, y + h * 0.48);
        c.bezierCurveTo(x + w * 0.18, y + h * 0.1, x + w * 0.52, y - h * 0.02, x + w * 0.6, y + h * 0.28);
        c.bezierCurveTo(x + w * 0.72, y + h * 0.1, x + w * 0.98, y + h * 0.25, x + w * 0.88, y + h * 0.5);
        c.bezierCurveTo(x + w * 1.05, y + h * 0.55, x + w * 1.02, y + h * 0.92, x + w * 0.8, y + h * 0.9);
        c.closePath();
      }),
    },
    user: {
      name: 'User',
      draw: (c, g) => {
        const r = Math.min(g.w * 0.22, g.h * 0.22);
        g.shape(() => c.ellipse(g.cx, g.y + r, r, r, 0, 0, TAU));
        g.shape(() => {
          c.moveTo(g.x + g.w * 0.08, g.y + g.h);
          c.bezierCurveTo(g.x + g.w * 0.08, g.y + g.h * 0.5, g.x + g.w * 0.92, g.y + g.h * 0.5, g.x + g.w * 0.92, g.y + g.h);
          c.closePath();
        });
      },
    },
    phone: {
      name: 'Mobile phone',
      draw: (c, g) => {
        g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.14));
        c.beginPath(); c.rect(g.x + g.w * 0.1, g.y + g.h * 0.1, g.w * 0.8, g.h * 0.75); c.stroke();
        c.beginPath(); c.arc(g.cx, g.y + g.h * 0.925, Math.max(1.5, Math.min(g.w, g.h) * 0.04), 0, TAU); c.stroke();
      },
    },
    printer: {
      name: 'Printer',
      draw: (c, g) => {
        g.shape(() => c.rect(g.x + g.w * 0.22, g.y, g.w * 0.56, g.h * 0.3));
        g.shape(() => c.roundRect(g.x, g.y + g.h * 0.28, g.w, g.h * 0.45, g.h * 0.06));
        g.shape(() => c.rect(g.x + g.w * 0.22, g.y + g.h * 0.6, g.w * 0.56, g.h * 0.4));
        g.lines([g.x + g.w * 0.3, g.y + g.h * 0.75, g.x + g.w * 0.7, g.y + g.h * 0.75], [g.x + g.w * 0.3, g.y + g.h * 0.87, g.x + g.w * 0.6, g.y + g.h * 0.87]);
      },
    },
    chip: {
      name: 'CPU / Chip',
      draw: (c, g) => {
        const m = 0.2;
        g.shape(() => c.rect(g.x + g.w * m, g.y + g.h * m, g.w * (1 - 2 * m), g.h * (1 - 2 * m)));
        for (let i = 0; i < 4; i++) {
          const t = m + 0.08 + (i * (1 - 2 * m - 0.16)) / 3;
          g.lines([g.x + g.w * t, g.y, g.x + g.w * t, g.y + g.h * m], [g.x + g.w * t, g.y + g.h * (1 - m), g.x + g.w * t, g.y + g.h],
            [g.x, g.y + g.h * t, g.x + g.w * m, g.y + g.h * t], [g.x + g.w * (1 - m), g.y + g.h * t, g.x + g.w, g.y + g.h * t]);
        }
      },
    },
    table: { name: 'Table', draw: (c, g, el) => drawTable(c, g, el) },
  };

  const SHAPE_GROUPS = [
    { name: 'Basic', items: ['rect', 'roundrect', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'star', 'callout'] },
    { name: 'Lines', items: ['line', 'arrow', 'dblarrow'] },
    { name: 'Flowchart', items: ['terminator', 'process', 'decision', 'io', 'predefined', 'document', 'preparation', 'connector', 'database'] },
    { name: 'Logic gates', items: ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'] },
    { name: 'Network / ICT', items: ['computer', 'laptop', 'server', 'router', 'switch', 'firewall', 'cloud', 'user', 'phone', 'printer', 'chip'] },
    { name: 'Table', items: ['table'] },
  ];
  // Default box for a shape placed with a single click (world units at zoom 1).
  const DEFAULT_SIZE = {
    and: [140, 90], or: [140, 90], not: [130, 80], nand: [150, 90], nor: [150, 90], xor: [150, 90], xnor: [160, 90],
    computer: [120, 110], laptop: [130, 90], server: [90, 120], router: [120, 90], switch: [150, 70], firewall: [110, 90],
    cloud: [170, 110], user: [80, 100], phone: [60, 110], printer: [110, 100], chip: [100, 100], database: [100, 120],
    connector: [60, 60], terminator: [170, 70], decision: [170, 110], line: [160, 0], arrow: [160, 0], dblarrow: [160, 0],
  };

  function gate(c, g, kind, bubble) {
    const { x, y, w, h, cy } = g;
    const r = bubble ? Math.max(3, Math.min(w, h) * 0.07) : 0;
    const bx = x + w * 0.2, ex = x + w * 0.82 - (bubble ? 2 * r : 0);
    const in1 = y + h * 0.3, in2 = y + h * 0.7;
    if (kind === 'and') {
      const mid = bx + (ex - bx) * 0.45;
      g.shape(() => {
        c.moveTo(bx, y); c.lineTo(mid, y);
        c.ellipse(mid, cy, ex - mid, h / 2, 0, -Math.PI / 2, Math.PI / 2);
        c.lineTo(bx, y + h); c.closePath();
      });
      g.lines([x, in1, bx, in1], [x, in2, bx, in2]);
    } else if (kind === 'not') {
      g.poly([[bx, y + h * 0.1], [ex, cy], [bx, y + h * 0.9]]);
      g.lines([x, cy, bx, cy]);
    } else {
      const back = w * 0.1, ctl = bx + (ex - bx) * 0.55;
      g.shape(() => {
        c.moveTo(bx, y);
        c.quadraticCurveTo(ctl, y, ex, cy);
        c.quadraticCurveTo(ctl, y + h, bx, y + h);
        c.quadraticCurveTo(bx + back, cy, bx, y);
        c.closePath();
      });
      const touch = bx + back * 0.42; // where input lines meet the curved back
      g.lines([x, in1, touch, in1], [x, in2, touch, in2]);
      if (kind === 'xor') {
        c.beginPath();
        c.moveTo(bx - w * 0.07, y);
        c.quadraticCurveTo(bx - w * 0.07 + back, cy, bx - w * 0.07, y + h);
        c.stroke();
      }
    }
    if (bubble) { c.beginPath(); c.arc(ex + r, cy, r, 0, TAU); c.stroke(); }
    g.lines([ex + 2 * r, cy, x + w, cy]);
  }

  function drawTable(c, g, el) {
    const rows = el.rows || 3, cols = el.cols || 3;
    if (el.fill !== 'none') {
      c.save(); c.fillStyle = hexA(el.color, 0.12); c.fillRect(g.x, g.y, g.w, g.h / rows); c.restore();
    }
    c.beginPath(); c.rect(g.x, g.y, g.w, g.h); c.stroke();
    const segs = [];
    for (let i = 1; i < rows; i++) segs.push([g.x, g.y + (g.h * i) / rows, g.x + g.w, g.y + (g.h * i) / rows]);
    for (let j = 1; j < cols; j++) segs.push([g.x + (g.w * j) / cols, g.y, g.x + (g.w * j) / cols, g.y + g.h]);
    g.lines(...segs);
  }

  function drawShape(ctx, el) {
    const def = SHAPES[el.kind] || SHAPES.rect;
    ctx.save();
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.size;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (el.dash) ctx.setLineDash([el.size * 3, el.size * 2.5]);

    if (def.line) {
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (el.kind !== 'line') arrowHead(ctx, el.x1, el.y1, el.x2, el.y2, el.size);
      if (el.kind === 'dblarrow') arrowHead(ctx, el.x2, el.y2, el.x1, el.y1, el.size);
      ctx.restore();
      return;
    }

    const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
    const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
    const fill = el.fill === 'solid' ? el.color : el.fill === 'light' ? hexA(el.color, 0.18) : null;
    const g = {
      x, y, w, h, cx: x + w / 2, cy: y + h / 2,
      shape(build) {
        ctx.beginPath(); build();
        if (fill) { ctx.save(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); }
        ctx.stroke();
      },
      poly(pts) { this.shape(() => { ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); }); },
      regular(n, rot) {
        const pts = [];
        for (let i = 0; i < n; i++) {
          const a = rot + (i * TAU) / n;
          pts.push([this.cx + (Math.cos(a) * w) / 2, this.cy + (Math.sin(a) * h) / 2]);
        }
        this.poly(pts);
      },
      lines(...segs) {
        ctx.beginPath();
        for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
        ctx.stroke();
      },
    };
    def.draw(ctx, g, el);

    if (el.label) {
      const fs = el.labelSize || 20;
      ctx.setLineDash([]);
      ctx.font = `${fs}px ${FONTS.sans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = el.fill === 'solid' ? (isDarkColor(el.color) ? '#ffffff' : '#111111') : el.color;
      const lines = el.label.split('\n');
      const lh = fs * 1.25;
      lines.forEach((ln, i) => ctx.fillText(ln, g.cx, g.cy + (i - (lines.length - 1) / 2) * lh));
    }
    ctx.restore();
  }

  // ----- Text (with a small syntax highlighter for code blocks) -----
  const KEYWORDS = new Set((
    'def class return if elif else for while in import from as try except finally with lambda pass break continue ' +
    'True False None and or not is global yield raise print input range len int float str bool list dict ' +
    'void public private protected static final new function var let const this null true false switch case default ' +
    'do include using namespace struct char double long short unsigned extends implements interface package ' +
    'echo require async await typeof instanceof foreach end then begin procedure program writeln readln ' +
    'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ALTER PRIMARY KEY FOREIGN REFERENCES ' +
    'JOIN INNER LEFT RIGHT ON GROUP BY ORDER HAVING AND OR NOT NULL DISTINCT COUNT SUM AVG MIN MAX AS LIKE BETWEEN'
  ).split(' '));
  const TOKEN_RE = /(#.*$|\/\/.*$|--.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+|.)/g;
  const CODE_COLORS = { comment: '#6a9955', string: '#ce9178', number: '#b5cea8', keyword: '#569cd6', func: '#dcdcaa', plain: '#d4d4d4' };

  function textMetrics(el) {
    return {
      pad: el.style === 'plain' ? 2 : Math.round(el.fontSize * 0.45),
      lh: el.fontSize * 1.3,
      font: `${el.style === 'code' ? 'normal' : el.bold ? 'bold' : 'normal'} ${el.fontSize}px ${FONTS[el.style === 'code' ? 'mono' : el.font] || FONTS.sans}`,
    };
  }
  function measureText(ctx, el) {
    const m = textMetrics(el);
    ctx.save();
    ctx.font = m.font;
    const lines = el.text.split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width), el.fontSize * 0.5);
    ctx.restore();
    return { w: w + m.pad * 2, h: lines.length * m.lh + m.pad * 2 };
  }

  function drawText(ctx, el) {
    const m = textMetrics(el);
    ctx.save();
    if (el.style === 'sticky') {
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = el.fontSize * 0.4;
      ctx.shadowOffsetY = el.fontSize * 0.12;
      ctx.fillStyle = el.bg || '#fff3a3';
      ctx.fillRect(el.x, el.y, el.w, el.h);
      ctx.shadowColor = 'transparent';
    } else if (el.style === 'code') {
      ctx.fillStyle = '#1e2430';
      ctx.beginPath(); ctx.roundRect(el.x, el.y, el.w, el.h, el.fontSize * 0.3); ctx.fill();
    }
    ctx.font = m.font;
    ctx.textBaseline = 'top';
    const lines = el.text.split('\n');
    lines.forEach((ln, i) => {
      const ty = el.y + m.pad + i * m.lh + el.fontSize * 0.12;
      if (el.style !== 'code') {
        ctx.fillStyle = el.color;
        ctx.fillText(ln, el.x + m.pad, ty);
        if (el.underline) {
          const tw = ctx.measureText(ln).width;
          ctx.fillRect(el.x + m.pad, ty + el.fontSize * 1.05, tw, Math.max(1, el.fontSize / 14));
        }
        return;
      }
      let tx = el.x + m.pad, mt;
      TOKEN_RE.lastIndex = 0;
      while ((mt = TOKEN_RE.exec(ln))) {
        if (!mt[0]) { TOKEN_RE.lastIndex++; continue; }
        let col = CODE_COLORS.plain;
        if (mt[1]) col = CODE_COLORS.comment;
        else if (mt[2]) col = CODE_COLORS.string;
        else if (mt[3]) col = CODE_COLORS.number;
        else if (mt[4]) {
          if (KEYWORDS.has(mt[4])) col = CODE_COLORS.keyword;
          else if (ln[TOKEN_RE.lastIndex] === '(') col = CODE_COLORS.func;
        }
        ctx.fillStyle = col;
        ctx.fillText(mt[0], tx, ty);
        tx += ctx.measureText(mt[0]).width;
      }
    });
    ctx.restore();
  }

  function drawElement(ctx, el, onImageLoad) {
    if (el.type === 'stroke') drawStroke(ctx, el);
    else if (el.type === 'shape') drawShape(ctx, el);
    else if (el.type === 'text') drawText(ctx, el);
    else if (el.type === 'image') {
      const rec = getImage(el.src, onImageLoad);
      if (rec.ready) ctx.drawImage(rec.img, el.x, el.y, el.w, el.h);
      else { ctx.save(); ctx.fillStyle = 'rgba(128,128,128,0.15)'; ctx.fillRect(el.x, el.y, el.w, el.h); ctx.restore(); }
    }
  }

  // Draws a background in screen space (ctx transform = dpr only).
  function drawBackground(ctx, bgId, view, w, h) {
    const bg = bgById(bgId);
    if (!bg.color) return;
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
    if (!bg.pattern) return;
    let step = 40 * view.zoom;
    while (step < 14) step *= 2;
    const ox = (-view.x * view.zoom) % step, oy = (-view.y * view.zoom) % step;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = bg.line;
    ctx.lineWidth = 1;
    if (bg.pattern === 'dots') {
      const r = Math.max(1, Math.min(2, step / 25));
      for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    } else {
      ctx.beginPath();
      if (bg.pattern === 'grid') for (let x = ox; x < w; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      for (let y = oy; y < h; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Board ----------
  let clipboardEls = null;

  class Board {
    /**
     * @param canvas  target canvas (its parent must be position:relative, used for the text editor)
     * @param opts.mode       'infinite' (pan/zoom whiteboard) | 'fixed' (PDF page / overlay)
     * @param opts.doc        { bg, pages: [{ elements: [] }] }
     * @param opts.onChange   called after any committed change
     * @param opts.onActivate called when the user starts interacting with this board
     * @param opts.onPanBy    fixed mode: hand-tool drag (dx, dy in screen px)
     * @param opts.onView     infinite mode: view changed (zoom display)
     */
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts;
      this.mode = opts.mode || 'infinite';
      this.doc = opts.doc || { bg: 'white', pages: [{ elements: [] }] };
      this.pageIndex = 0;
      this.view = { x: 0, y: 0, zoom: 1 };
      this.undoStack = [];
      this.redoStack = [];
      this.sel = [];
      this.temp = null;
      this.laser = [];
      this.hover = null;
      this.action = null;
      this.pointers = new Map();
      this.base = document.createElement('canvas');
      this.dirty = true;
      this.dpr = window.devicePixelRatio || 1;
      this.cssW = 0;
      this.cssH = 0;

      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', (e) => this.onDown(e));
      canvas.addEventListener('pointermove', (e) => this.onMove(e));
      canvas.addEventListener('pointerup', (e) => this.onUp(e));
      canvas.addEventListener('pointercancel', (e) => this.onUp(e));
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.requestDraw(); });
      canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      if (this.mode === 'infinite') canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
      Board.all.add(this);
      this.updateCursor();
    }

    destroy() { this.ro.disconnect(); this.cancelText(); Board.all.delete(this); }

    get page() { return this.doc.pages[this.pageIndex]; }
    get els() { return this.page.elements; }

    // ----- view -----
    toWorld(sx, sy) { return [sx / this.view.zoom + this.view.x, sy / this.view.zoom + this.view.y]; }
    toScreen(wx, wy) { return [(wx - this.view.x) * this.view.zoom, (wy - this.view.y) * this.view.zoom]; }
    applyView(ctx) {
      const k = this.dpr * this.view.zoom;
      ctx.setTransform(k, 0, 0, k, -this.view.x * k, -this.view.y * k);
    }
    setView(v) {
      Object.assign(this.view, v);
      this.dirty = true;
      this.requestDraw();
      if (this.opts.onView) this.opts.onView(this.view);
    }
    zoomAt(sx, sy, factor) {
      const z = Math.min(8, Math.max(0.1, this.view.zoom * factor));
      const [wx, wy] = this.toWorld(sx, sy);
      this.setView({ zoom: z, x: wx - sx / z, y: wy - sy / z });
    }
    zoomBy(factor) { this.zoomAt(this.cssW / 2, this.cssH / 2, factor); }
    resetView() { this.setView({ x: 0, y: 0, zoom: 1 }); }
    fitContent() {
      const b = unionBox(this.els);
      if (!b) return this.resetView();
      const z = Math.min(4, Math.max(0.1, Math.min((this.cssW - 80) / b.w, (this.cssH - 80) / b.h)));
      this.setView({ zoom: z, x: b.x + b.w / 2 - this.cssW / 2 / z, y: b.y + b.h / 2 - this.cssH / 2 / z });
    }

    resize() {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.dpr = window.devicePixelRatio || 1;
      this.cssW = w; this.cssH = h;
      const pw = Math.round(w * this.dpr), ph = Math.round(h * this.dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = this.base.width = pw;
        this.canvas.height = this.base.height = ph;
      }
      this.dirty = true;
      this.renderNow();
    }

    // ----- pages -----
    setPage(i) {
      if (i < 0 || i >= this.doc.pages.length) return;
      this.commitText();
      this.pageIndex = i;
      this.sel = [];
      this.invalidate();
    }
    addPage() {
      this.doc.pages.splice(this.pageIndex + 1, 0, { elements: [] });
      this.undoStack = []; this.redoStack = [];
      this.setPage(this.pageIndex + 1);
      this.resetView();
      this.changed();
    }
    deletePage() {
      if (this.doc.pages.length === 1) { this.clearPage(); return; }
      this.doc.pages.splice(this.pageIndex, 1);
      this.undoStack = []; this.redoStack = [];
      this.setPage(Math.min(this.pageIndex, this.doc.pages.length - 1));
      this.changed();
    }
    setBackground(id) { this.doc.bg = id; this.invalidate(); this.changed(); }

    // ----- history -----
    pushHistory() {
      this.undoStack.push({ page: this.pageIndex, els: this.els.slice() });
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack = [];
    }
    undo() { this.swapHistory(this.undoStack, this.redoStack); }
    redo() { this.swapHistory(this.redoStack, this.undoStack); }
    swapHistory(from, to) {
      this.commitText();
      const s = from.pop();
      if (!s || !this.doc.pages[s.page]) return;
      to.push({ page: s.page, els: this.doc.pages[s.page].elements });
      this.doc.pages[s.page].elements = s.els;
      if (s.page !== this.pageIndex) this.pageIndex = s.page;
      this.sel = [];
      this.invalidate();
      this.changed();
    }
    clearPage() {
      if (!this.els.length) return;
      this.pushHistory();
      this.page.elements = [];
      this.sel = [];
      this.invalidate();
      this.changed();
    }
    changed() { if (this.opts.onChange) this.opts.onChange(this); }
    invalidate() { this.dirty = true; this.requestDraw(); }

    // ----- adding content -----
    viewCenter() { return this.toWorld(this.cssW / 2, this.cssH / 2); }

    async addImage(src, at) {
      const img = await loadImage(src);
      const z = this.view.zoom;
      const maxW = (this.cssW * 0.6) / z, maxH = (this.cssH * 0.6) / z;
      const s = Math.min(1 / z, maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      const [cx, cy] = at || this.viewCenter();
      const el = { type: 'image', src, x: cx - w / 2, y: cy - h / 2, w, h };
      this.pushHistory();
      this.els.push(el);
      this.sel = [el];
      this.invalidate();
      this.changed();
      return el;
    }

    addText(text, extra = {}) {
      const [cx, cy] = this.viewCenter();
      const el = this.makeText(text, cx, cy, extra);
      el.x -= el.w / 2; el.y -= el.h / 2;
      this.pushHistory();
      this.els.push(el);
      this.sel = [el];
      this.invalidate();
      this.changed();
    }

    makeText(text, x, y, extra = {}) {
      const el = {
        type: 'text', x, y, text,
        color: Tools.textStyle === 'code' ? '#d4d4d4' : Tools.color,
        fontSize: Tools.fontSize / this.view.zoom,
        font: Tools.font,
        style: Tools.textStyle,
        ...extra,
      };
      Object.assign(el, measureText(this.ctx, el));
      return el;
    }

    // ----- selection operations -----
    selectAll() { this.sel = this.els.slice(); this.requestDraw(); }
    clearSelection() { if (this.sel.length) { this.sel = []; this.requestDraw(); } }
    deleteSelection() {
      if (!this.sel.length) return false;
      this.pushHistory();
      const s = new Set(this.sel);
      this.page.elements = this.els.filter((e) => !s.has(e));
      this.sel = [];
      this.invalidate();
      this.changed();
      return true;
    }
    copySelection() {
      if (!this.sel.length) return false;
      clipboardEls = this.sel.map((e) => ({ ...e }));
      return true;
    }
    pasteElements(offset = 24) {
      if (!clipboardEls) return false;
      const d = offset / this.view.zoom;
      const copies = clipboardEls.map((e) => mapEl(e, (x, y) => [x + d, y + d], 1));
      this.pushHistory();
      this.els.push(...copies);
      this.sel = copies;
      clipboardEls = copies.map((e) => ({ ...e }));
      this.invalidate();
      this.changed();
      return true;
    }
    duplicateSelection() { if (this.copySelection()) this.pasteElements(); }
    reorderSelection(toFront) {
      if (!this.sel.length) return;
      this.pushHistory();
      const s = new Set(this.sel);
      const rest = this.els.filter((e) => !s.has(e));
      const picked = this.els.filter((e) => s.has(e));
      this.page.elements = toFront ? rest.concat(picked) : picked.concat(rest);
      this.invalidate();
      this.changed();
    }
    nudgeSelection(dx, dy) {
      if (!this.sel.length) return;
      this.pushHistory();
      this.replaceSel((e) => mapEl(e, (x, y) => [x + dx / this.view.zoom, y + dy / this.view.zoom], 1));
      this.changed();
    }
    // Apply tool style changes (colour, size, fill...) to the current selection.
    applyStyle(patch) {
      if (!this.sel.length) return false;
      this.pushHistory();
      this.replaceSel((e) => {
        const c = { ...e };
        if (patch.color && e.type !== 'image' && !(e.type === 'text' && e.style === 'code')) c.color = patch.color;
        if (patch.size && (e.type === 'stroke' || e.type === 'shape')) c.size = (patch.size / this.view.zoom) * (e.alpha < 1 ? 4 : 1);
        if (patch.fill && e.type === 'shape') c.fill = patch.fill;
        if ('dash' in patch && e.type === 'shape') c.dash = patch.dash;
        if (e.type === 'text') {
          if (patch.fontSize) c.fontSize = patch.fontSize / this.view.zoom;
          if (patch.font) c.font = patch.font;
          if (patch.textStyle) { c.style = patch.textStyle; if (patch.textStyle === 'code') c.color = '#d4d4d4'; }
          Object.assign(c, measureText(this.ctx, c));
        }
        return c;
      });
      this.changed();
      return true;
    }
    replaceSel(fn) {
      const els = this.els;
      this.sel = this.sel.map((e) => {
        const i = els.indexOf(e);
        const c = fn(e);
        if (i >= 0) els[i] = c;
        return c;
      });
      this.invalidate();
    }

    // ----- hit testing -----
    hitTest(wx, wy, tol) {
      for (let i = this.els.length - 1; i >= 0; i--) if (hitEl(this.els[i], wx, wy, tol, false)) return this.els[i];
      return null;
    }
    selBox() { return unionBox(this.sel); }
    handleHit(sx, sy) {
      const b = this.selBox();
      if (!b) return false;
      const [hx, hy] = this.toScreen(b.x + b.w, b.y + b.h);
      return Math.abs(sx - hx - 6) < 12 && Math.abs(sy - hy - 6) < 12;
    }

    // ----- pointer handling -----
    currentTool(e) {
      if (e.button === 1 || this.spaceDown) return 'hand';
      if (e.button === 5 || e.buttons === 32) return 'eraser'; // pen eraser end
      return Tools.tool;
    }

    onDown(e) {
      if (this.textEditor) { this.commitText(); if (Tools.tool === 'text') return; }
      if (this.opts.onActivate) this.opts.onActivate(this);
      if (e.button === 2) return;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      this.pointers.set(e.pointerId, { x: sx, y: sy });

      if (e.pointerType === 'touch' && this.pointers.size === 2 && this.mode === 'infinite') {
        this.temp = null;
        const [a, b] = [...this.pointers.values()];
        this.action = {
          tool: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: this.view.zoom,
          c0: this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2),
        };
        this.requestDraw();
        return;
      }
      if (this.pointers.size > 1) return;

      const tool = this.currentTool(e);
      const [wx, wy] = this.toWorld(sx, sy);
      const z = this.view.zoom;
      this.action = { tool, sx, sy, lx: sx, ly: sy, wx, wy, cx: e.clientX, cy: e.clientY };

      switch (tool) {
        case 'pen':
        case 'highlighter': {
          const hl = tool === 'highlighter';
          this.temp = {
            type: 'stroke',
            pts: [[wx, wy, e.pressure || 0.5]],
            color: Tools.color,
            size: (hl ? Tools.size * 4 : Tools.size) / z,
            alpha: hl ? 0.35 : 1,
          };
          if (!hl && e.pointerType === 'pen') this.temp.pressure = true;
          break;
        }
        case 'eraser':
          this.action.erased = false;
          this.eraseAt(wx, wy, wx, wy);
          break;
        case 'laser':
          this.laser.push({ x: wx, y: wy, t: performance.now(), start: true });
          this.animateLaser();
          break;
        case 'shape':
          this.temp = {
            type: 'shape', kind: Tools.shape, x1: wx, y1: wy, x2: wx, y2: wy,
            color: Tools.color, size: Math.max(1, Tools.size) / z, fill: Tools.fill, dash: Tools.dash,
          };
          if (Tools.shape === 'table') { this.temp.rows = Tools.tableRows; this.temp.cols = Tools.tableCols; }
          break;
        case 'text': {
          const hit = this.hitTest(wx, wy, 4 / z);
          if (hit && hit.type === 'text') this.openTextEditor(hit);
          else if (hit && hit.type === 'shape' && !LINE_KINDS.has(hit.kind) && hit.kind !== 'table') this.openLabelEditor(hit);
          else this.openTextEditor(null, wx, wy);
          this.action = null;
          break;
        }
        case 'select': {
          if (this.handleHit(sx, sy)) {
            this.action.mode = 'resize';
            this.action.b0 = this.selBox();
          } else {
            const hit = this.hitTest(wx, wy, 6 / z);
            if (hit) {
              if (e.shiftKey) this.sel = this.sel.includes(hit) ? this.sel.filter((s) => s !== hit) : [...this.sel, hit];
              else if (!this.sel.includes(hit)) this.sel = [hit];
              this.action.mode = 'move';
            } else {
              if (!e.shiftKey) this.sel = [];
              this.action.mode = 'rubber';
              this.action.rect = null;
            }
          }
          this.requestDraw();
          break;
        }
      }
    }

    onMove(e) {
      // Positions come from clientX/Y: offsetX is unreliable on coalesced pointer events.
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      this.hover = { x: sx, y: sy };
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
      const a = this.action;
      if (!a) {
        if (Tools.tool === 'eraser' || Tools.tool === 'laser') this.requestDraw();
        if (Tools.tool === 'select') this.canvas.style.cursor = this.handleHit(sx, sy) ? 'nwse-resize' : 'default';
        return;
      }

      if (a.tool === 'pinch') {
        const [p, q] = [...this.pointers.values()];
        if (!q) return;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        const z = Math.min(8, Math.max(0.1, (a.z0 * d) / a.d0));
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        this.setView({ zoom: z, x: a.c0[0] - mx / z, y: a.c0[1] - my / z });
        return;
      }

      const [wx, wy] = this.toWorld(sx, sy);
      const z = this.view.zoom;
      switch (a.tool) {
        case 'hand': {
          const dx = sx - a.lx, dy = sy - a.ly;
          if (this.mode === 'infinite') {
            this.setView({ x: this.view.x - dx / z, y: this.view.y - dy / z });
          } else if (this.opts.onPanBy) {
            // The page scrolls under the pointer, so use window coordinates for the delta.
            this.opts.onPanBy(-(e.clientX - a.cx), -(e.clientY - a.cy));
            a.cx = e.clientX; a.cy = e.clientY;
            return;
          }
          break;
        }
        case 'pen':
        case 'highlighter': {
          if (!this.temp) break;
          const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
          for (const ce of evs.length ? evs : [e]) {
            const [x, y] = this.toWorld(ce.clientX - rect.left, ce.clientY - rect.top);
            const last = this.temp.pts[this.temp.pts.length - 1];
            if (Math.hypot(x - last[0], y - last[1]) * z < 1.2) continue;
            this.temp.pts.push([x, y, ce.pressure || 0.5]);
          }
          if (e.shiftKey && this.temp.pts.length > 1) this.temp.pts = [this.temp.pts[0], [wx, wy, 0.5]]; // straight line
          break;
        }
        case 'eraser': {
          const [px, py] = this.toWorld(a.lx, a.ly);
          this.eraseAt(px, py, wx, wy);
          break;
        }
        case 'laser':
          this.laser.push({ x: wx, y: wy, t: performance.now() });
          break;
        case 'shape': {
          if (!this.temp) break;
          let x2 = wx, y2 = wy;
          if (e.shiftKey) {
            const dx = wx - this.temp.x1, dy = wy - this.temp.y1;
            if (LINE_KINDS.has(this.temp.kind)) {
              const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
              x2 = this.temp.x1 + Math.cos(ang) * len; y2 = this.temp.y1 + Math.sin(ang) * len;
            } else {
              const m = Math.max(Math.abs(dx), Math.abs(dy));
              x2 = this.temp.x1 + Math.sign(dx || 1) * m; y2 = this.temp.y1 + Math.sign(dy || 1) * m;
            }
          }
          this.temp = { ...this.temp, x2, y2 };
          break;
        }
        case 'select':
          if (a.mode === 'move') this.dragMove(a, wx, wy);
          else if (a.mode === 'resize') this.dragResize(a, wx, wy, e.shiftKey);
          else if (a.mode === 'rubber') {
            a.rect = { x: Math.min(a.wx, wx), y: Math.min(a.wy, wy), w: Math.abs(wx - a.wx), h: Math.abs(wy - a.wy) };
          }
          break;
      }
      a.lx = sx; a.ly = sy;
      this.requestDraw();
    }

    beginTransform(a) {
      if (a.originals) return;
      this.pushHistory();
      a.originals = this.sel.slice();
      a.indexes = this.sel.map((el) => this.els.indexOf(el));
    }
    applyTransform(a, f, s) {
      const els = this.els;
      this.sel = a.originals.map((el, k) => {
        const c = mapEl(el, f, s);
        if (a.indexes[k] >= 0) els[a.indexes[k]] = c;
        return c;
      });
      this.dirty = true;
    }
    dragMove(a, wx, wy) {
      if (!this.sel.length) return;
      if (!a.originals && Math.hypot(wx - a.wx, wy - a.wy) * this.view.zoom < 2) return;
      this.beginTransform(a);
      const dx = wx - a.wx, dy = wy - a.wy;
      this.applyTransform(a, (x, y) => [x + dx, y + dy], 1);
    }
    dragResize(a, wx, wy, free) {
      this.beginTransform(a);
      const b = a.b0;
      let sx = Math.max(0.05, (wx - b.x) / b.w), sy = Math.max(0.05, (wy - b.y) / b.h);
      const keepAspect = !free && a.originals.some((e) => e.type === 'image' || e.type === 'text');
      if (keepAspect) sx = sy = Math.max(sx, sy);
      const s = keepAspect ? sx : Math.sqrt(sx * sy);
      this.applyTransform(a, (x, y) => [b.x + (x - b.x) * sx, b.y + (y - b.y) * sy], s);
    }

    onUp(e) {
      this.pointers.delete(e.pointerId);
      const a = this.action;
      if (!a) return;
      if (a.tool === 'pinch') { if (this.pointers.size === 0) this.action = null; return; }
      this.action = null;

      switch (a.tool) {
        case 'pen':
        case 'highlighter':
          if (this.temp) {
            this.pushHistory();
            this.els.push(this.temp);
            this.temp = null;
            this.invalidate();
            this.changed();
          }
          break;
        case 'shape': {
          const t = this.temp;
          this.temp = null;
          if (!t) break;
          const z = this.view.zoom;
          if (Math.abs(t.x2 - t.x1) * z < 6 && Math.abs(t.y2 - t.y1) * z < 6) {
            // single click: drop a default-sized shape
            let [dw, dh] = DEFAULT_SIZE[t.kind] || [160, 110];
            if (t.kind === 'table') { dw = t.cols * 90; dh = t.rows * 44; }
            t.x2 = t.x1 + dw / z; t.y2 = t.y1 + dh / z;
          }
          this.pushHistory();
          this.els.push(t);
          this.invalidate();
          this.changed();
          break;
        }
        case 'eraser':
          if (a.erased) this.changed();
          this.requestDraw();
          break;
        case 'select':
          if (a.mode === 'rubber' && a.rect) {
            const picked = this.els.filter((el) => boxesOverlap(bbox(el), a.rect));
            this.sel = e.shiftKey ? [...new Set([...this.sel, ...picked])] : picked;
          }
          if (a.originals) this.changed();
          this.invalidate();
          break;
        default:
          this.requestDraw();
      }
    }

    onDblClick(e) {
      if (Tools.tool !== 'select') return;
      const rect = this.canvas.getBoundingClientRect();
      const [wx, wy] = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = this.hitTest(wx, wy, 4 / this.view.zoom);
      if (!hit) return;
      if (hit.type === 'text') this.openTextEditor(hit);
      else if (hit.type === 'shape' && !LINE_KINDS.has(hit.kind) && hit.kind !== 'table') this.openLabelEditor(hit);
    }

    onWheel(e) {
      e.preventDefault();
      if (e.ctrlKey) {
        // Ctrl+wheel, and touchpad pinch (reported as ctrl+wheel), zooms around the cursor.
        const rect = this.canvas.getBoundingClientRect();
        this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025) * (Math.abs(e.deltaY) < 50 ? 3 : 1)));
      } else {
        const k = e.deltaMode ? 30 : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * k, dy = (e.shiftKey ? 0 : e.deltaY) * k;
        this.setView({ x: this.view.x + dx / this.view.zoom, y: this.view.y + dy / this.view.zoom });
      }
    }

    eraseAt(x0, y0, x1, y1) {
      const z = this.view.zoom;
      const r = (Tools.size * 2 + 10) / z;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r / 2)));
      const samples = [];
      for (let i = 0; i <= steps; i++) samples.push([x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]);

      const objectMode = Tools.eraserMode === 'object';
      const out = [];
      let changed = false;
      for (const el of this.els) {
        const b = bbox(el);
        if (!samples.some(([x, y]) => inBox(b, x, y, r))) { out.push(el); continue; }
        if (el.type === 'stroke' && !objectMode) {
          // Partial erase: drop points under the eraser and split the stroke.
          const segs = [];
          let cur = [];
          for (const p of el.pts) {
            if (samples.some(([x, y]) => Math.hypot(p[0] - x, p[1] - y) <= r + el.size / 2)) {
              if (cur.length) segs.push(cur);
              cur = [];
            } else cur.push(p);
          }
          if (cur.length) segs.push(cur);
          if (segs.length === 1 && segs[0].length === el.pts.length) { out.push(el); continue; }
          changed = true;
          for (const s of segs) if (s.length > 1 || el.pts.length === 1) out.push({ ...el, pts: s });
          continue;
        }
        if (el.type === 'image' && !objectMode) { out.push(el); continue; }
        if (samples.some(([x, y]) => hitEl(el, x, y, r, true))) { changed = true; continue; }
        out.push(el);
      }
      if (changed) {
        if (!this.action.erased) { this.pushHistory(); this.action.erased = true; }
        this.page.elements = out;
        this.sel = [];
        this.dirty = true;
      }
      this.requestDraw();
    }

    animateLaser() {
      if (this.laserRaf) return;
      const tick = () => {
        const now = performance.now();
        this.laser = this.laser.filter((p) => now - p.t < 900);
        this.renderNow();
        this.laserRaf = this.laser.length ? requestAnimationFrame(tick) : 0;
      };
      this.laserRaf = requestAnimationFrame(tick);
    }

    // ----- text editing -----
    openTextEditor(el, wx, wy) {
      this.cancelText();
      const z = this.view.zoom;
      const proto = el || {
        type: 'text', x: wx, y: wy - (Tools.fontSize / z) * 0.7, text: '',
        color: Tools.textStyle === 'code' ? '#d4d4d4' : Tools.color,
        fontSize: Tools.fontSize / z, font: Tools.font, style: Tools.textStyle,
      };
      const m = textMetrics(proto);
      const ta = document.createElement('textarea');
      ta.className = 'tb-text-editor';
      ta.value = proto.text;
      ta.spellcheck = false;
      const [sx, sy] = this.toScreen(proto.x, proto.y);
      Object.assign(ta.style, {
        left: this.canvas.offsetLeft + sx + 'px',
        top: this.canvas.offsetTop + sy + 'px',
        font: m.font.replace(/[\d.]+px/, proto.fontSize * z + 'px'),
        lineHeight: m.lh * z + 'px',
        padding: m.pad * z + 'px',
        color: proto.color,
        background: proto.style === 'sticky' ? proto.bg || '#fff3a3' : proto.style === 'code' ? '#1e2430' : 'transparent',
        borderRadius: proto.style === 'code' ? proto.fontSize * 0.3 * z + 'px' : '0',
      });
      const autosize = () => {
        this.ctx.save();
        this.ctx.font = ta.style.font;
        const w = Math.max(...ta.value.split('\n').map((l) => this.ctx.measureText(l + 'M').width), proto.fontSize * z * 2);
        this.ctx.restore();
        ta.style.width = w + m.pad * 2 * z + 4 + 'px';
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      };
      ta.addEventListener('input', autosize);
      ta.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape' || (ev.key === 'Enter' && ev.ctrlKey)) { ev.preventDefault(); this.commitText(); }
        if (ev.key === 'Tab') {
          ev.preventDefault();
          const s = ta.selectionStart;
          ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = s + 4;
          autosize();
        }
      });
      ta.addEventListener('blur', () => setTimeout(() => this.commitText(), 0));
      this.canvas.parentElement.appendChild(ta);
      this.textEditor = { ta, el, proto, kind: 'text' };
      if (el) { this.editingEl = el; this.invalidate(); }
      autosize();
      setTimeout(() => ta.focus(), 0);
    }

    openLabelEditor(shape) {
      this.cancelText();
      const z = this.view.zoom;
      const x = Math.min(shape.x1, shape.x2), y = Math.min(shape.y1, shape.y2);
      const w = Math.abs(shape.x2 - shape.x1), h = Math.abs(shape.y2 - shape.y1);
      const fs = shape.labelSize || Math.min(Tools.fontSize * 0.8, 24) / z;
      const ta = document.createElement('textarea');
      ta.className = 'tb-text-editor tb-label-editor';
      ta.value = shape.label || '';
      const [sx, sy] = this.toScreen(x, y);
      Object.assign(ta.style, {
        left: this.canvas.offsetLeft + sx + 'px', top: this.canvas.offsetTop + sy + 'px',
        width: w * z + 'px', height: h * z + 'px',
        font: `${fs * z}px ${FONTS.sans}`, color: shape.color,
        paddingTop: Math.max(0, (h * z) / 2 - fs * z * 0.7) + 'px',
      });
      ta.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape' || (ev.key === 'Enter' && ev.ctrlKey)) { ev.preventDefault(); this.commitText(); }
      });
      ta.addEventListener('blur', () => setTimeout(() => this.commitText(), 0));
      this.canvas.parentElement.appendChild(ta);
      this.textEditor = { ta, el: shape, kind: 'label', fs };
      setTimeout(() => ta.focus(), 0);
    }

    commitText() {
      const ed = this.textEditor;
      if (!ed) return;
      this.textEditor = null;
      this.editingEl = null;
      const value = ed.ta.value.replace(/\s+$/, '');
      ed.ta.remove();
      const els = this.els;
      if (ed.kind === 'label') {
        if ((ed.el.label || '') !== value) {
          const i = els.indexOf(ed.el);
          if (i >= 0) {
            this.pushHistory();
            els[i] = { ...ed.el, label: value, labelSize: ed.fs };
            this.changed();
          }
        }
      } else if (ed.el) {
        const i = els.indexOf(ed.el);
        if (i >= 0 && value !== ed.el.text) {
          this.pushHistory();
          if (!value.trim()) els.splice(i, 1);
          else { const c = { ...ed.el, text: value }; Object.assign(c, measureText(this.ctx, c)); els[i] = c; }
          this.sel = [];
          this.changed();
        }
      } else if (value.trim()) {
        const el = { ...ed.proto, text: value };
        Object.assign(el, measureText(this.ctx, el));
        this.pushHistory();
        els.push(el);
        this.changed();
      }
      this.invalidate();
    }
    cancelText() {
      if (!this.textEditor) return;
      this.textEditor.ta.remove();
      this.textEditor = null;
      this.editingEl = null;
      this.invalidate();
    }

    updateCursor() {
      const map = { select: 'default', hand: 'grab', pen: 'crosshair', highlighter: 'crosshair', eraser: 'none', laser: 'none', text: 'text', shape: 'crosshair' };
      this.canvas.style.cursor = map[Tools.tool] || 'default';
      if (Tools.tool !== 'select' && this.sel.length) { this.sel = []; }
      this.requestDraw();
    }

    // ----- rendering -----
    requestDraw() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.renderNow(); });
    }

    renderBase() {
      const b = this.base.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, this.base.width, this.base.height);
      b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawBackground(b, this.doc.bg, this.view, this.cssW, this.cssH);
      this.applyView(b);
      const onImg = () => this.invalidate();
      // Skip elements fully outside the visible area.
      const vis = { x: this.view.x, y: this.view.y, w: this.cssW / this.view.zoom, h: this.cssH / this.view.zoom };
      for (const el of this.els) {
        if (el === this.editingEl) continue;
        if (!boxesOverlap(bbox(el), vis)) continue;
        drawElement(b, el, onImg);
      }
    }

    renderNow() {
      if (!this.cssW) return;
      const { ctx, canvas } = this;
      if (this.dirty) { this.renderBase(); this.dirty = false; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(this.base, 0, 0);
      this.applyView(ctx);
      if (this.temp) drawElement(ctx, this.temp);
      this.drawLaser(ctx);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const z = this.view.zoom;
      if (this.sel.length) {
        const b = this.selBox();
        const [x, y] = this.toScreen(b.x, b.y);
        ctx.save();
        ctx.strokeStyle = '#2f80ed';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x - 4, y - 4, b.w * z + 8, b.h * z + 8);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.rect(x + b.w * z, y + b.h * z, 12, 12);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      const a = this.action;
      if (a && a.mode === 'rubber' && a.rect) {
        const [x, y] = this.toScreen(a.rect.x, a.rect.y);
        ctx.save();
        ctx.fillStyle = 'rgba(47,128,237,0.08)';
        ctx.strokeStyle = '#2f80ed';
        ctx.fillRect(x, y, a.rect.w * z, a.rect.h * z);
        ctx.strokeRect(x, y, a.rect.w * z, a.rect.h * z);
        ctx.restore();
      }
      if (this.hover && (Tools.tool === 'eraser' || (a && a.tool === 'eraser'))) {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,120,120,0.9)';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(this.hover.x, this.hover.y, Tools.size * 2 + 10, 0, TAU);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (this.hover && Tools.tool === 'laser') {
        ctx.save();
        ctx.fillStyle = '#ff2d2d';
        ctx.shadowColor = '#ff2d2d';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(this.hover.x, this.hover.y, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawLaser(ctx) {
      if (this.laser.length < 1) return;
      const now = performance.now();
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#ff2020';
      ctx.shadowBlur = 12;
      for (let i = 1; i < this.laser.length; i++) {
        const p = this.laser[i - 1], q = this.laser[i];
        if (q.start) continue;
        const life = 1 - (now - q.t) / 900;
        if (life <= 0) continue;
        ctx.strokeStyle = `rgba(255,40,40,${life})`;
        ctx.lineWidth = (5 * life + 1) / this.view.zoom;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ----- export -----
    // Renders one page's content (cropped to content) to a new canvas.
    async exportPage(pageIndex = this.pageIndex, scale = 2, withBg = true) {
      const els = this.doc.pages[pageIndex].elements;
      const b = unionBox(els);
      if (!b) return null;
      await Promise.all(els.filter((e) => e.type === 'image').map((e) => loadImage(e.src).catch(() => null)));
      const pad = 40;
      const c = document.createElement('canvas');
      c.width = Math.ceil((b.w + pad * 2) * scale);
      c.height = Math.ceil((b.h + pad * 2) * scale);
      const ctx = c.getContext('2d');
      const view = { x: b.x - pad, y: b.y - pad, zoom: scale };
      if (withBg) drawBackground(ctx, this.doc.bg, view, c.width, c.height);
      ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
      els.forEach((el) => drawElement(ctx, el));
      return c;
    }
  }

  Board.all = new Set();

  // Draws a list of elements onto a canvas at a given world->pixel scale (used for PDF export).
  async function renderElementsTo(canvas, els, scale) {
    await Promise.all(els.filter((e) => e.type === 'image').map((e) => loadImage(e.src).catch(() => null)));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    els.forEach((el) => drawElement(ctx, el));
  }

  // Small preview of a shape for the shape picker.
  function drawShapeIcon(canvas, kind, color) {
    const dpr = window.devicePixelRatio || 1;
    const s = 34;
    canvas.width = canvas.height = s * dpr;
    canvas.style.width = canvas.style.height = s + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const el = { type: 'shape', kind, color, size: 1.6, fill: 'none', rows: 3, cols: 3 };
    if (SHAPES[kind].line) Object.assign(el, { x1: 5, y1: s - 7, x2: s - 5, y2: 7 });
    else {
      const [dw, dh] = DEFAULT_SIZE[kind] || [160, 110];
      const k = Math.min((s - 8) / dw, (s - 8) / dh);
      const w = dw * k, h = dh * k;
      Object.assign(el, { x1: (s - w) / 2, y1: (s - h) / 2, x2: (s + w) / 2, y2: (s + h) / 2 });
    }
    drawShape(ctx, el);
  }

  window.TB = {
    Board, Tools, BACKGROUNDS, bgById, SHAPES, SHAPE_GROUPS, FONTS,
    drawShapeIcon, renderElementsTo, loadImage, isDarkColor,
  };
})();
