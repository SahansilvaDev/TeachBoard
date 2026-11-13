/* Architecture shape libraries: Software / UML, Cloud & infrastructure, AI / LLM.
 * Generic line icons (no vendor logos). Icons carry a default label drawn underneath;
 * double-click a shape to rename it. Each draw(c, g, el) works inside the box g = {x, y, w, h, cx, cy}.
 */
(function () {
  const TAU = Math.PI * 2;
  const icon = (name, defaultLabel, draw) => ({ name, defaultLabel, labelBelow: true, draw });
  const box = (name, defaultLabel, draw) => ({ name, defaultLabel, draw });

  function cylinder(c, g, x, y, w, h) {
    const ry = Math.min(h * 0.14, w * 0.22);
    g.shape(() => {
      c.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, 0);
      c.lineTo(x + w, y + h - ry);
      c.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI);
      c.closePath();
    });
    c.beginPath(); c.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI); c.stroke();
    return ry;
  }

  // UML class / interface: name band, then attributes and operations split by "---".
  function umlClass(c, g, el, stereotype) {
    const fs = el.labelSize || 16;
    const parts = (el.label || '').split(/\n?-{3,}\n?/);
    const name = parts[0] || '';
    const rest = parts.slice(1);
    const head = fs * (stereotype ? 2.9 : 2);
    g.shape(() => c.rect(g.x, g.y, g.w, g.h));
    if (rest.length) g.lines([g.x, g.y + head, g.x + g.w, g.y + head]);
    c.save();
    c.setLineDash([]);
    c.fillStyle = el.fill === 'solid' ? '#ffffff' : el.color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (stereotype) {
      c.font = `italic ${fs * 0.8}px "Segoe UI", Arial, sans-serif`;
      c.fillText('«interface»', g.cx, g.y + fs * 0.95);
    }
    c.font = `600 ${fs}px "Segoe UI", Arial, sans-serif`;
    c.fillText(name, g.cx, g.y + head - fs * 0.95);
    c.font = `${fs * 0.9}px "Cascadia Code", Consolas, monospace`;
    c.textAlign = 'left';
    const bandH = rest.length ? (g.h - head) / rest.length : 0;
    rest.forEach((sec, i) => {
      const top = g.y + head + i * bandH;
      if (i > 0) g.lines([g.x, top, g.x + g.w, top]);
      sec.split('\n').filter(Boolean).forEach((ln, j) => c.fillText(ln, g.x + fs * 0.5, top + fs * (0.9 + j * 1.25)));
    });
    c.restore();
  }

  const SHAPES = {
    // ---------------- Software / UML ----------------
    umlclass: { name: 'Class (UML)', ownLabel: true, defaultLabel: 'User\n---\n- id: int\n- name: str\n---\n+ login()', draw: (c, g, el) => umlClass(c, g, el, false) },
    umlinterface: { name: 'Interface (UML)', ownLabel: true, defaultLabel: 'IRepository\n---\n+ save()\n+ find(id)', draw: (c, g, el) => umlClass(c, g, el, true) },
    component: box('Component', 'Component', (c, g) => {
      g.shape(() => c.rect(g.x + g.w * 0.08, g.y, g.w * 0.92, g.h));
      const tw = g.w * 0.16, th = Math.min(g.h * 0.16, 16);
      g.shape(() => c.rect(g.x, g.y + g.h * 0.25, tw, th));
      g.shape(() => c.rect(g.x, g.y + g.h * 0.6, tw, th));
    }),
    package: box('Package / module', 'package', (c, g) => {
      const th = Math.min(g.h * 0.2, 22);
      g.shape(() => { c.rect(g.x, g.y, g.w * 0.4, th); });
      g.shape(() => c.rect(g.x, g.y + th, g.w, g.h - th));
    }),
    actor: icon('Actor', 'Actor', (c, g) => {
      const r = Math.min(g.w * 0.16, g.h * 0.13);
      g.shape(() => c.arc(g.cx, g.y + r + 1, r, 0, TAU));
      g.lines([g.cx, g.y + 2 * r, g.cx, g.y + g.h * 0.62], [g.x + g.w * 0.18, g.y + g.h * 0.38, g.x + g.w * 0.82, g.y + g.h * 0.38],
        [g.cx, g.y + g.h * 0.62, g.x + g.w * 0.22, g.y + g.h], [g.cx, g.y + g.h * 0.62, g.x + g.w * 0.78, g.y + g.h]);
    }),
    usecase: box('Use case', 'Use case', (c, g) => g.shape(() => c.ellipse(g.cx, g.cy, g.w / 2, g.h / 2, 0, 0, TAU))),
    note: box('Note', 'Note', (c, g) => {
      const k = Math.min(g.w, g.h) * 0.2;
      g.poly([[g.x, g.y], [g.x + g.w - k, g.y], [g.x + g.w, g.y + k], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]);
      g.lines([g.x + g.w - k, g.y, g.x + g.w - k, g.y + k], [g.x + g.w - k, g.y + k, g.x + g.w, g.y + k]);
    }),
    microservice: box('Microservice', 'Service', (c, g) => g.regular(6, 0)),
    api: icon('API (REST / GraphQL)', 'API', (c, g) => {
      g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.18));
      g.text('{ }', g.cx, g.cy, Math.min(g.w, g.h) * 0.45, 700);
    }),
    queue: icon('Message queue', 'Queue', (c, g) => {
      const rx = Math.min(g.w * 0.12, g.h * 0.3);
      g.shape(() => {
        c.ellipse(g.x + rx, g.cy, rx, g.h / 2, 0, Math.PI / 2, Math.PI * 1.5);
        c.lineTo(g.x + g.w - rx, g.y);
        c.ellipse(g.x + g.w - rx, g.cy, rx, g.h / 2, 0, -Math.PI / 2, Math.PI / 2);
        c.closePath();
      });
      c.beginPath(); c.ellipse(g.x + g.w - rx, g.cy, rx, g.h / 2, 0, Math.PI / 2, Math.PI * 1.5); c.stroke();
      for (let i = 1; i <= 3; i++) {
        const xx = g.x + rx + ((g.w - 3 * rx) * i) / 4;
        g.lines([xx, g.y + g.h * 0.25, xx, g.y + g.h * 0.75]);
      }
    }),
    cache: icon('Cache (e.g. Redis)', 'Cache', (c, g) => {
      cylinder(c, g, g.x, g.y, g.w, g.h);
      const s = Math.min(g.w, g.h);
      c.beginPath();
      c.moveTo(g.cx + s * 0.08, g.y + g.h * 0.3);
      c.lineTo(g.cx - s * 0.14, g.y + g.h * 0.6);
      c.lineTo(g.cx + s * 0.02, g.y + g.h * 0.6);
      c.lineTo(g.cx - s * 0.08, g.y + g.h * 0.88);
      c.lineTo(g.cx + s * 0.16, g.y + g.h * 0.52);
      c.lineTo(g.cx, g.y + g.h * 0.52);
      c.closePath();
      c.fill();
    }),
    webclient: icon('Web app / browser', 'Web app', (c, g) => {
      g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.08));
      const bar = g.h * 0.2;
      g.lines([g.x, g.y + bar, g.x + g.w, g.y + bar]);
      for (let i = 0; i < 3; i++) g.dot(g.x + bar * (0.55 + i * 0.5), g.y + bar / 2, Math.max(1.5, bar * 0.13));
    }),

    // ---------------- Cloud & infrastructure ----------------
    loadbalancer: icon('Load balancer', 'Load balancer', (c, g) => {
      const r = Math.min(g.w, g.h) * 0.3;
      g.shape(() => c.arc(g.cx, g.cy, r, 0, TAU));
      g.lines([g.x, g.cy, g.cx - r, g.cy]);
      [-0.8, 0, 0.8].forEach((t) => g.lines([g.cx + r * Math.cos(t * 0.6), g.cy + r * Math.sin(t * 0.6), g.x + g.w, g.cy + t * g.h * 0.45]));
      g.lines([g.cx - r * 0.5, g.cy, g.cx + r * 0.5, g.cy], [g.cx, g.cy - r * 0.5, g.cx, g.cy + r * 0.5]);
    }),
    gateway: icon('API gateway', 'API gateway', (c, g) => {
      g.shape(() => c.roundRect(g.x + g.w * 0.25, g.y, g.w * 0.5, g.h, Math.min(g.w, g.h) * 0.1));
      g.lines([g.x, g.cy, g.x + g.w, g.cy]);
      const a = Math.min(g.w, g.h) * 0.12;
      g.lines([g.x + g.w - a, g.cy - a, g.x + g.w, g.cy], [g.x + g.w - a, g.cy + a, g.x + g.w, g.cy]);
    }),
    container: icon('Container (Docker)', 'Container', (c, g) => {
      const d = Math.min(g.w, g.h) * 0.28;
      g.poly([[g.x, g.y + d], [g.x + g.w - d, g.y + d], [g.x + g.w - d, g.y + g.h], [g.x, g.y + g.h]]);
      g.poly([[g.x, g.y + d], [g.x + d, g.y], [g.x + g.w, g.y], [g.x + g.w - d, g.y + d]]);
      g.poly([[g.x + g.w - d, g.y + d], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h - d], [g.x + g.w - d, g.y + g.h]]);
    }),
    k8s: icon('Kubernetes cluster', 'Kubernetes', (c, g) => {
      const pts = [];
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 7;
        pts.push([g.cx + (Math.cos(a) * g.w) / 2, g.cy + (Math.sin(a) * g.h) / 2]);
      }
      g.poly(pts);
      const r = Math.min(g.w, g.h) * 0.22;
      c.beginPath(); c.arc(g.cx, g.cy, r, 0, TAU); c.stroke();
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 7;
        g.lines([g.cx, g.cy, g.cx + Math.cos(a) * r * 1.5, g.cy + Math.sin(a) * r * 1.5]);
      }
    }),
    function: icon('Serverless function', 'Function', (c, g) => {
      g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.2));
      g.text('λ', g.cx, g.cy, Math.min(g.w, g.h) * 0.62, 700);
    }),
    bucket: icon('Object storage / bucket', 'Storage', (c, g) => {
      const ry = g.h * 0.12;
      g.shape(() => {
        c.ellipse(g.cx, g.y + ry, g.w / 2, ry, 0, Math.PI, 0);
        c.lineTo(g.x + g.w * 0.82, g.y + g.h - ry * 0.6);
        c.ellipse(g.cx, g.y + g.h - ry * 0.6, g.w * 0.32, ry * 0.6, 0, 0, Math.PI);
        c.closePath();
      });
      c.beginPath(); c.ellipse(g.cx, g.y + ry, g.w / 2, ry, 0, 0, Math.PI); c.stroke();
    }),
    cdn: icon('CDN / edge', 'CDN', (c, g) => {
      const r = Math.min(g.w, g.h) * 0.42;
      g.shape(() => c.arc(g.cx, g.cy, r, 0, TAU));
      c.beginPath(); c.ellipse(g.cx, g.cy, r * 0.45, r, 0, 0, TAU); c.stroke();
      g.lines([g.cx - r, g.cy, g.cx + r, g.cy]);
      [[-0.75, -0.6], [0.8, -0.45], [0.55, 0.75], [-0.6, 0.7]].forEach(([dx, dy]) => g.dot(g.cx + dx * r, g.cy + dy * r, Math.max(2, r * 0.1)));
    }),
    monitor: icon('Monitoring / logs', 'Monitoring', (c, g) => {
      g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.08));
      c.beginPath();
      c.moveTo(g.x + g.w * 0.1, g.y + g.h * 0.7);
      c.lineTo(g.x + g.w * 0.3, g.y + g.h * 0.45);
      c.lineTo(g.x + g.w * 0.5, g.y + g.h * 0.6);
      c.lineTo(g.x + g.w * 0.7, g.y + g.h * 0.25);
      c.lineTo(g.x + g.w * 0.9, g.y + g.h * 0.4);
      c.stroke();
    }),
    lock: icon('Auth / security', 'Auth', (c, g) => {
      const bw = g.w * 0.7, bh = g.h * 0.55, bx = g.cx - bw / 2, by = g.y + g.h - bh;
      c.beginPath(); c.arc(g.cx, by, bw * 0.3, Math.PI, 0); c.stroke();
      g.shape(() => c.roundRect(bx, by, bw, bh, bh * 0.12));
      g.dot(g.cx, by + bh * 0.42, Math.max(2, bh * 0.1));
      g.lines([g.cx, by + bh * 0.42, g.cx, by + bh * 0.72]);
    }),

    // ---------------- AI / LLM ----------------
    llm: icon('Large language model', 'LLM', (c, g) => {
      g.shape(() => c.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.2));
      // sparkle
      const s = Math.min(g.w, g.h) * 0.32, x = g.cx, y = g.cy;
      c.beginPath();
      c.moveTo(x, y - s);
      c.quadraticCurveTo(x, y, x + s, y);
      c.quadraticCurveTo(x, y, x, y + s);
      c.quadraticCurveTo(x, y, x - s, y);
      c.quadraticCurveTo(x, y, x, y - s);
      c.fill();
      g.dot(g.x + g.w * 0.8, g.y + g.h * 0.22, Math.max(1.5, s * 0.12));
    }),
    agent: icon('AI agent', 'AI agent', (c, g) => {
      const top = g.y + g.h * 0.2;
      g.shape(() => c.roundRect(g.x + g.w * 0.08, top, g.w * 0.84, g.h * 0.8, Math.min(g.w, g.h) * 0.18));
      g.lines([g.cx, g.y, g.cx, top]);
      g.dot(g.cx, g.y + 2, Math.max(2, g.h * 0.05));
      const e = Math.max(2, Math.min(g.w, g.h) * 0.08);
      g.dot(g.x + g.w * 0.35, top + g.h * 0.32, e);
      g.dot(g.x + g.w * 0.65, top + g.h * 0.32, e);
      g.lines([g.x + g.w * 0.35, top + g.h * 0.58, g.x + g.w * 0.65, top + g.h * 0.58]);
    }),
    vectordb: icon('Vector database', 'Vector DB', (c, g) => {
      const ry = cylinder(c, g, g.x, g.y, g.w, g.h);
      const r = Math.max(1.6, Math.min(g.w, g.h) * 0.045);
      [[0.3, 0.5], [0.5, 0.42], [0.7, 0.55], [0.4, 0.72], [0.62, 0.78]].forEach(([dx, dy]) => g.dot(g.x + g.w * dx, g.y + ry + (g.h - 2 * ry) * dy, r));
      g.lines([g.x + g.w * 0.3, g.y + ry + (g.h - 2 * ry) * 0.5, g.x + g.w * 0.5, g.y + ry + (g.h - 2 * ry) * 0.42],
        [g.x + g.w * 0.5, g.y + ry + (g.h - 2 * ry) * 0.42, g.x + g.w * 0.7, g.y + ry + (g.h - 2 * ry) * 0.55]);
    }),
    embeddings: icon('Embeddings', 'Embeddings', (c, g) => {
      const k = g.w * 0.12;
      g.lines([g.x + k, g.y, g.x, g.y], [g.x, g.y, g.x, g.y + g.h], [g.x, g.y + g.h, g.x + k, g.y + g.h],
        [g.x + g.w - k, g.y, g.x + g.w, g.y], [g.x + g.w, g.y, g.x + g.w, g.y + g.h], [g.x + g.w, g.y + g.h, g.x + g.w - k, g.y + g.h]);
      const vals = [0.8, 0.3, 0.6, 0.15, 0.9, 0.45];
      const cw = (g.w * 0.72) / vals.length;
      vals.forEach((v, i) => {
        c.save();
        c.globalAlpha = 0.25 + v * 0.75;
        c.fillRect(g.x + g.w * 0.14 + i * cw, g.y + g.h * 0.3, cw * 0.8, g.h * 0.4);
        c.restore();
      });
    }),
    retriever: icon('Retriever (RAG search)', 'Retriever', (c, g) => {
      const dw = g.w * 0.62, dh = g.h * 0.78;
      g.poly([[g.x, g.y], [g.x + dw * 0.75, g.y], [g.x + dw, g.y + dh * 0.22], [g.x + dw, g.y + dh], [g.x, g.y + dh]]);
      for (let i = 0; i < 3; i++) g.lines([g.x + dw * 0.15, g.y + dh * (0.4 + i * 0.17), g.x + dw * 0.75, g.y + dh * (0.4 + i * 0.17)]);
      const r = Math.min(g.w, g.h) * 0.2, mx = g.x + g.w * 0.68, my = g.y + g.h * 0.62;
      g.shape(() => c.arc(mx, my, r, 0, TAU));
      g.lines([mx + r * 0.7, my + r * 0.7, g.x + g.w, g.y + g.h]);
    }),
    gpu: icon('GPU', 'GPU', (c, g) => {
      const bh = g.h * 0.8;
      g.shape(() => c.roundRect(g.x, g.y, g.w, bh, Math.min(g.w, bh) * 0.08));
      const r = Math.min(g.w * 0.2, bh * 0.32);
      [0.3, 0.7].forEach((t) => {
        c.beginPath(); c.arc(g.x + g.w * t, g.y + bh / 2, r, 0, TAU); c.stroke();
        g.dot(g.x + g.w * t, g.y + bh / 2, Math.max(1.5, r * 0.2));
      });
      for (let i = 0; i < 6; i++) g.lines([g.x + g.w * (0.15 + i * 0.12), g.y + bh, g.x + g.w * (0.15 + i * 0.12), g.y + g.h]);
    }),
    dataset: icon('Dataset', 'Dataset', (c, g) => {
      const o = Math.min(g.w, g.h) * 0.12;
      g.shape(() => c.rect(g.x + o * 2, g.y, g.w - o * 2, g.h - o * 2));
      g.shape(() => c.rect(g.x + o, g.y + o, g.w - o * 2, g.h - o * 2));
      g.shape(() => c.rect(g.x, g.y + o * 2, g.w - o * 2, g.h - o * 2));
      const tx = g.x, ty = g.y + o * 2, tw = g.w - o * 2, th = g.h - o * 2;
      g.lines([tx, ty + th / 3, tx + tw, ty + th / 3], [tx, ty + (th * 2) / 3, tx + tw, ty + (th * 2) / 3], [tx + tw / 2, ty, tx + tw / 2, ty + th]);
    }),
    prompt: icon('Prompt', 'Prompt', (c, g) => {
      const bh = g.h * 0.78;
      g.shape(() => {
        c.roundRect(g.x, g.y, g.w, bh, Math.min(g.w, bh) * 0.18);
        c.moveTo(g.x + g.w * 0.22, g.y + bh);
        c.lineTo(g.x + g.w * 0.15, g.y + g.h);
        c.lineTo(g.x + g.w * 0.4, g.y + bh);
      });
      g.text('>_', g.cx, g.y + bh / 2, Math.min(g.w, bh) * 0.42, 700);
    }),
    model: icon('ML model / neural network', 'ML model', (c, g) => {
      const layers = [3, 4, 2];
      const nodes = layers.map((n, li) => Array.from({ length: n }, (_, i) => [g.x + g.w * (0.12 + li * 0.38), g.y + (g.h * (i + 0.5)) / n]));
      c.save(); c.globalAlpha = 0.5;
      for (let li = 0; li < nodes.length - 1; li++) for (const a of nodes[li]) for (const b of nodes[li + 1]) g.lines([a[0], a[1], b[0], b[1]]);
      c.restore();
      const r = Math.max(2.5, Math.min(g.w, g.h) * 0.08);
      for (const layer of nodes) for (const [nx, ny] of layer) g.shape(() => c.arc(nx, ny, r, 0, TAU));
    }),
    tool: icon('Tool / plugin', 'Tool', (c, g) => {
      const s = Math.min(g.w, g.h);
      c.save();
      c.translate(g.cx, g.cy);
      c.rotate(-Math.PI / 4);
      g.shape(() => {
        c.rect(-s * 0.08, -s * 0.05, s * 0.16, s * 0.5);
        c.moveTo(-s * 0.22, -s * 0.22);
        c.arc(0, -s * 0.22, s * 0.22, Math.PI, 0);
        c.lineTo(s * 0.1, -s * 0.22);
        c.lineTo(s * 0.1, -s * 0.36);
        c.lineTo(-s * 0.1, -s * 0.36);
        c.lineTo(-s * 0.1, -s * 0.22);
        c.closePath();
      });
      c.restore();
    }),
  };

  const GROUPS = [
    { name: 'Software / UML', items: ['umlclass', 'umlinterface', 'component', 'package', 'actor', 'usecase', 'note', 'microservice', 'api', 'queue', 'cache', 'webclient'] },
    { name: 'Cloud & infrastructure', items: ['loadbalancer', 'gateway', 'container', 'k8s', 'function', 'bucket', 'cdn', 'monitor', 'lock'] },
    { name: 'AI / LLM', items: ['llm', 'agent', 'vectordb', 'embeddings', 'retriever', 'gpu', 'dataset', 'prompt', 'model', 'tool'] },
  ];

  const SIZES = {
    umlclass: [200, 170], umlinterface: [200, 130], component: [180, 90], package: [180, 120], actor: [50, 90],
    usecase: [180, 80], note: [170, 100], microservice: [150, 110], api: [80, 64], queue: [120, 60], cache: [70, 80],
    webclient: [100, 76], loadbalancer: [90, 76], gateway: [90, 70], container: [80, 76], k8s: [84, 84], function: [72, 72],
    bucket: [76, 80], cdn: [80, 80], monitor: [96, 70], lock: [64, 80], llm: [80, 72], agent: [80, 80], vectordb: [76, 86],
    embeddings: [100, 60], retriever: [86, 80], gpu: [100, 70], dataset: [86, 80], prompt: [86, 76], model: [96, 76], tool: [72, 72],
  };

  TB.registerShapes(SHAPES, GROUPS, SIZES);
})();
