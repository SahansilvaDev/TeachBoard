/* Starter diagrams for architects and ICT lessons. Each build() returns plain elements in local
 * coordinates; Board.insertElements() centres them in the view and gives them fresh ids.
 */
(function () {
  const COLORS = { app: '#2563eb', ai: '#7c3aed', data: '#059669', infra: '#ea580c', user: '#334155', line: '#475569', frame: '#64748b' };

  function kit() {
    const els = [];
    const S = (kind, x, y, w, h, color, extra = {}) => {
      const def = TB.SHAPES[kind] || {};
      const el = {
        type: 'shape', id: TB.uid(), kind, x1: x, y1: y, x2: x + w, y2: y + h,
        color, size: 2.5, fill: def.labelBelow || kind === 'frame' ? 'none' : 'light', dash: false,
        label: def.defaultLabel, labelSize: kind === 'frame' ? 20 : def.labelBelow ? 15 : 17, ...extra,
      };
      els.push(el);
      return el;
    };
    const C = (a, b, label, extra = {}) => {
      els.push({
        type: 'connector', id: TB.uid(), from: { id: a.id }, to: { id: b.id }, x1: 0, y1: 0, x2: 0, y2: 0,
        route: 'elbow', startArrow: false, endArrow: true, color: COLORS.line, size: 2.5, dash: false,
        label: label || '', labelSize: 14, ...extra,
      });
    };
    const F = (title, x, y, w, h) => S('frame', x, y, w, h, COLORS.frame, { label: title });
    return { els, S, C, F };
  }

  const TEMPLATES = [
    {
      id: 'threetier',
      name: '3-tier web app',
      desc: 'Users → web app → load balancer → app servers → database + cache',
      build() {
        const { els, S, C, F } = kit();
        F('Backend (private network / VPC)', 330, 20, 700, 400);
        const user = S('actor', 20, 160, 50, 90, COLORS.user, { label: 'Users' });
        const web = S('webclient', 150, 165, 100, 76, COLORS.app, { label: 'Web app' });
        const lb = S('loadbalancer', 380, 165, 90, 76, COLORS.infra);
        const s1 = S('server', 560, 70, 80, 100, COLORS.app, { label: 'App server 1' });
        const s2 = S('server', 560, 250, 80, 100, COLORS.app, { label: 'App server 2' });
        const db = S('database', 860, 70, 100, 110, COLORS.data, { label: 'Database' });
        const cache = S('cache', 875, 260, 70, 80, COLORS.data);
        C(user, web, 'uses');
        C(web, lb, 'HTTPS');
        C(lb, s1); C(lb, s2);
        C(s1, db, 'SQL'); C(s2, db, 'SQL');
        C(s2, cache, '', { dash: true });
        return els;
      },
    },
    {
      id: 'microservices',
      name: 'Microservices',
      desc: 'Clients → API gateway → services, each with its own database, plus a queue',
      build() {
        const { els, S, C, F } = kit();
        F('Kubernetes cluster', 300, 10, 760, 520);
        const web = S('webclient', 20, 120, 100, 76, COLORS.app, { label: 'Web app' });
        const mob = S('phone', 40, 300, 60, 100, COLORS.app, { label: 'Mobile app', labelSize: 15 });
        const gw = S('gateway', 330, 220, 90, 70, COLORS.infra);
        const jwt = S('lock', 343, 60, 64, 80, COLORS.infra, { label: 'Check JWT' });
        const auth = S('microservice', 580, 50, 150, 100, COLORS.app, { label: 'Auth service' });
        const orders = S('microservice', 580, 205, 150, 100, COLORS.app, { label: 'Order service' });
        const pay = S('microservice', 580, 370, 150, 100, COLORS.app, { label: 'Payment service' });
        const q = S('queue', 850, 395, 120, 60, COLORS.infra, { label: 'Events queue' });
        const dbA = S('database', 860, 45, 90, 100, COLORS.data, { label: 'Users DB' });
        const dbO = S('database', 860, 200, 90, 100, COLORS.data, { label: 'Orders DB' });
        C(web, gw, 'HTTPS'); C(mob, gw, 'HTTPS');
        C(gw, jwt, '', { dash: true, route: 'straight' });
        C(gw, auth, 'REST'); C(gw, orders, 'REST'); C(gw, pay, 'REST');
        C(auth, dbA); C(orders, dbO);
        C(orders, q, 'OrderPlaced', { dash: true }); C(q, pay, '', { dash: true });
        return els;
      },
    },
    {
      id: 'rag',
      name: 'RAG pipeline (AI)',
      desc: 'Index documents into a vector DB, then retrieve context for the LLM',
      build() {
        const { els, S, C, F } = kit();
        F('1. Indexing (offline)', 0, 0, 760, 200);
        F('2. Answering a question (online)', 0, 250, 1080, 260);
        const docs = S('document', 30, 70, 130, 80, COLORS.data, { label: 'Documents\n(PDF, web)', labelSize: 15 });
        const chunk = S('process', 220, 75, 130, 70, COLORS.app, { label: 'Split into\nchunks', labelSize: 15 });
        const emb = S('embeddings', 420, 80, 100, 60, COLORS.ai);
        const vdb = S('vectordb', 620, 60, 76, 86, COLORS.data);
        const user = S('actor', 40, 340, 50, 90, COLORS.user, { label: 'User' });
        const prompt = S('prompt', 170, 340, 86, 76, COLORS.ai, { label: 'Question' });
        const ret = S('retriever', 400, 340, 86, 80, COLORS.ai);
        const llm = S('llm', 650, 340, 80, 72, COLORS.ai);
        const ans = S('terminator', 860, 345, 170, 64, COLORS.app, { label: 'Answer + sources' });
        C(docs, chunk); C(chunk, emb); C(emb, vdb, 'store vectors');
        C(user, prompt); C(prompt, ret, 'embed query');
        C(ret, vdb, 'top-k search', { dash: true });
        C(ret, llm, 'question + context'); C(llm, ans);
        return els;
      },
    },
    {
      id: 'agent',
      name: 'AI agent with tools',
      desc: 'An agent loop: the LLM plans, calls tools, and keeps memory',
      build() {
        const { els, S, C, F } = kit();
        F('Agent runtime', 200, 0, 760, 520);
        const user = S('actor', 20, 185, 50, 90, COLORS.user, { label: 'User' });
        const agent = S('agent', 290, 190, 80, 80, COLORS.ai);
        const llm = S('llm', 540, 194, 80, 72, COLORS.ai, { label: 'LLM (reasoning)' });
        const mem = S('vectordb', 292, 370, 76, 86, COLORS.data, { label: 'Memory' });
        const t1 = S('tool', 820, 40, 72, 72, COLORS.infra, { label: 'Web search' });
        const t2 = S('function', 820, 194, 72, 72, COLORS.infra, { label: 'Run code' });
        const t3 = S('api', 816, 360, 80, 64, COLORS.infra, { label: 'Company API' });
        C(user, agent, 'goal', { startArrow: true });
        C(agent, llm, 'plan / next step', { startArrow: true, route: 'straight' });
        C(agent, mem, 'remember', { startArrow: true, dash: true });
        C(llm, t1, 'tool calls'); C(llm, t2); C(llm, t3);
        return els;
      },
    },
    {
      id: 'lan',
      name: 'School LAN (ICT)',
      desc: 'Internet → router → firewall → switch → computers, server and printer',
      build() {
        const { els, S, C, F } = kit();
        F('Computer lab (LAN)', 220, 180, 760, 420);
        const net = S('cloud', 20, 20, 170, 110, COLORS.infra, { label: 'Internet' });
        const router = S('router', 260, 40, 120, 90, COLORS.app, { label: 'Router' });
        const fw = S('firewall', 470, 40, 110, 90, '#dc2626', { label: 'Firewall' });
        const sw = S('switch', 520, 240, 150, 70, COLORS.app, { label: 'Switch' });
        const pcs = [0, 1, 2].map((i) => S('computer', 260 + i * 170, 430, 120, 110, COLORS.user, { label: 'PC ' + (i + 1) }));
        const srv = S('server', 820, 220, 90, 120, COLORS.data, { label: 'File server' });
        const prn = S('printer', 810, 430, 110, 100, COLORS.user, { label: 'Printer' });
        C(net, router, '', { endArrow: false, route: 'straight' });
        C(router, fw, '', { endArrow: false, route: 'straight' });
        C(fw, sw, '', { endArrow: false });
        pcs.forEach((pc) => C(sw, pc, '', { endArrow: false, route: 'straight' }));
        C(sw, srv, '', { endArrow: false }); C(sw, prn, '', { endArrow: false, route: 'straight' });
        return els;
      },
    },
  ];

  TB.TEMPLATES = TEMPLATES;
})();
