/* TeachBoard app shell: tabs, split view, tool rail, popovers, shortcuts. */
(function () {
  const { Tools, Board, SHAPES, SHAPE_GROUPS } = TB;
  const { HomeTab, BoardTab, PdfTab, WebTab } = Tabs;
  const $ = (s) => document.querySelector(s);

  const COLORS = ['#1d1d1f', '#ffffff', '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#fdd835', '#00acc1', '#6d4c41'];
  const SIZES = [2, 4, 8, 16];
  const TOOL_LIST = [
    { id: 'select', icon: 'select', title: 'Select & move (V)' },
    { id: 'hand', icon: 'hand', title: 'Pan / scroll (H, or hold Space)' },
    { id: 'pen', icon: 'pen', title: 'Pen (P) — click again for options' },
    { id: 'highlighter', icon: 'highlighter', title: 'Highlighter (M)' },
    { id: 'eraser', icon: 'eraser', title: 'Eraser (E) — click again for options' },
    { id: 'laser', icon: 'laser', title: 'Laser pointer (L)' },
    { id: 'text', icon: 'text', title: 'Text, sticky notes & code (T)' },
    { id: 'shape', icon: 'shapes', title: 'Shapes: flowchart, logic gates, network, UML, cloud, AI (S)' },
    { id: 'connector', icon: 'connector', title: 'Connector (C) — drag from one shape to another; the arrow follows when you move them' },
  ];
  // Tool settings remembered between sessions.
  const SAVED_TOOLS = ['tool', 'color', 'size', 'shape', 'fill', 'dash', 'font', 'textStyle', 'fontSize', 'eraserMode', 'smoothing', 'snap', 'route', 'startArrow', 'endArrow', 'minimap'];

  const App = (window.App = {
    tabs: [],
    split: false,
    panes: [null, null],
    focusPane: 0,
    ratio: 0.5,
    lastBoardTab: null,

    get focusedTab() { return this.split ? this.panes[this.focusPane] : this.panes[0]; },
    get currentBoard() { const t = this.focusedTab; return t ? t.board : null; },

    async init() {
      this.stage = $('#stage');
      this.divider = $('#divider');
      $('#newTabBtn').innerHTML = icon('plus', 18);
      $('#newTabBtn').onclick = () => this.addTab(new HomeTab());
      this.buildTopActions();
      this.buildRail();
      this.setupDivider();
      this.setupShortcuts();
      this.setupIpc();
      Tools.on((patch) => this.onToolsChanged(patch));
      window.addEventListener('resize', () => this.layout());
      // Boards auto-save and the session is restored on the next start, so closing never loses work.
      window.addEventListener('beforeunload', () => {
        this.tabs.forEach((t) => {
          if (t instanceof PdfTab) t.saveAnnotations();
          if (t instanceof BoardTab) t.autosaveNow();
        });
        window.api.sessionSaveSync(this.sessionData());
      });
      let restored = false;
      try { restored = await this.restoreSession(); } catch (err) { console.error('session restore failed', err); }
      if (!restored) this.addTab(new HomeTab());
      setInterval(() => this.saveSession(), 4000);
    },

    // ---------------- Session (open tabs survive crashes, reloads and restarts) ----------------
    sessionData() {
      const tools = {};
      SAVED_TOOLS.forEach((k) => { tools[k] = Tools[k]; });
      return {
        version: 2,
        tabs: this.tabs.map((t) => t.sessionInfo()),
        panes: this.panes.map((p) => this.tabs.indexOf(p)),
        split: this.split,
        focusPane: this.focusPane,
        ratio: this.ratio,
        tools,
      };
    },
    saveSession() {
      const data = this.sessionData();
      const json = JSON.stringify(data);
      if (json === this.lastSession) return;
      this.lastSession = json;
      window.api.sessionSave(data);
    },
    async restoreSession() {
      const s = await window.api.sessionLoad();
      if (!s || !Array.isArray(s.tabs) || !s.tabs.length) return false;
      if (s.tools) Tools.set(Object.fromEntries(Object.entries(s.tools).filter(([k]) => SAVED_TOOLS.includes(k))));
      const made = [];
      for (const info of s.tabs) {
        let t = null;
        try { t = await this.tabFromInfo(info); } catch (err) { console.error('could not restore tab', info, err); }
        made.push(t);
        if (t) { this.tabs.push(t); this.stage.appendChild(t.el); }
      }
      if (!this.tabs.length) return false;
      const pick = (i) => (i >= 0 && made[i]) || null;
      this.panes = [pick(s.panes && s.panes[0]) || this.tabs[0], pick(s.panes && s.panes[1])];
      this.split = !!(s.split && this.panes[1] && this.panes[1] !== this.panes[0]);
      if (!this.split) this.panes[1] = null;
      this.focusPane = this.split ? s.focusPane || 0 : 0;
      this.ratio = s.ratio || 0.5;
      this.afterShow(this.focusedTab);
      if (this.split) this.panes[1 - this.focusPane].onShown();
      return true;
    },
    async tabFromInfo(info) {
      if (info.type === 'home') return new HomeTab();
      if (info.type === 'web') return new WebTab(info.url);
      if (info.type === 'pdf') return new PdfTab(info.path, { page: info.page, zoom: info.zoom });
      if (info.type === 'board') {
        let text = await window.api.autosaveRead(info.autosaveId);
        if (!text && info.filePath) text = (await window.api.readText(info.filePath)).text;
        if (!text) return null;
        const data = JSON.parse(text);
        const tab = new BoardTab({
          doc: { bg: data.bg || 'white', pages: data.pages },
          filePath: info.filePath, title: info.title, autosaveId: info.autosaveId, dirty: info.dirty,
        });
        if (info.page) tab.board.setPage(Math.min(info.page, tab.board.doc.pages.length - 1));
        if (info.view) tab.board.setView(info.view);
        tab.updateBar();
        return tab;
      }
      return null;
    },
    // Reloads the window; everything open comes back through the session.
    reloadApp() {
      this.tabs.forEach((t) => {
        if (t instanceof PdfTab) t.saveAnnotations();
        if (t instanceof BoardTab) t.autosaveNow();
      });
      window.api.sessionSaveSync(this.sessionData());
      window.api.reloadWindow();
    },

    // ---------------- Tabs ----------------
    addTab(tab, { activate = true } = {}) {
      this.tabs.push(tab);
      this.stage.appendChild(tab.el);
      if (activate || !this.panes[0]) this.showTab(tab);
      else { this.layout(); this.renderTabs(); }
      return tab;
    },

    replaceTab(oldTab, newTab) {
      const i = this.tabs.indexOf(oldTab);
      this.tabs.splice(i + 1, 0, newTab);
      this.stage.appendChild(newTab.el);
      this.panes = this.panes.map((p) => (p === oldTab ? newTab : p));
      this.tabs = this.tabs.filter((t) => t !== oldTab);
      oldTab.destroy();
      this.afterShow(newTab);
    },

    showTab(tab) {
      if (this.split) {
        const other = 1 - this.focusPane;
        if (this.panes[other] === tab) this.panes[other] = this.panes[this.focusPane];
        this.panes[this.focusPane] = tab;
      } else this.panes[0] = tab;
      this.afterShow(tab);
    },

    afterShow(tab) {
      if (tab instanceof BoardTab) this.lastBoardTab = tab;
      this.layout();
      this.renderTabs();
      this.refreshRail();
      tab.onShown();
      document.title = tab.title + ' — TeachBoard';
    },

    focusTab(tab) {
      if (!this.split) return;
      const i = this.panes.indexOf(tab);
      if (i < 0 || i === this.focusPane) return;
      this.focusPane = i;
      if (tab instanceof BoardTab) this.lastBoardTab = tab;
      this.layout();
      this.renderTabs();
      this.refreshRail();
    },

    async closeTab(tab) {
      if (!(await tab.canClose())) return;
      const idx = this.tabs.indexOf(tab);
      this.tabs.splice(idx, 1);
      tab.destroy();
      if (this.lastBoardTab === tab) this.lastBoardTab = null;
      if (!this.tabs.length) {
        this.split = false;
        this.panes = [null, null];
        this.addTab(new HomeTab());
        return;
      }
      const pi = this.panes.indexOf(tab);
      if (pi >= 0) {
        const free = this.tabs.filter((t) => !this.panes.includes(t));
        const next = free.length ? free[Math.min(idx, free.length) - 1] || free[0] : null;
        if (next) this.panes[pi] = next;
        else { this.split = false; this.panes = [this.panes[1 - pi] || this.tabs[0], null]; this.focusPane = 0; }
        if (!this.split) this.panes[1] = null;
      }
      const shown = this.focusedTab || this.tabs[0];
      this.afterShow(shown);
    },

    cycleTab(dir) {
      const i = this.tabs.indexOf(this.focusedTab);
      this.showTab(this.tabs[(i + dir + this.tabs.length) % this.tabs.length]);
    },

    renderTabs() {
      const bar = $('#tabs');
      bar.innerHTML = '';
      const focused = this.focusedTab;
      for (const t of this.tabs) {
        const el = document.createElement('div');
        el.className = 'tab';
        if (t === focused) el.classList.add('active');
        if (this.split && t === this.panes[0]) el.classList.add('in-pane-a', 'split');
        if (this.split && t === this.panes[1]) el.classList.add('in-pane-b');
        el.draggable = true;
        el.title = t.title;
        el.innerHTML = `<span class="tab-icon">${t.iconHtml}</span><span class="tab-title"></span><button class="tab-close" title="Close (Ctrl W)">${icon('close', 14)}</button>`;
        el.querySelector('.tab-title').textContent = (t.dirty ? '● ' : '') + t.title;
        el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); this.closeTab(t); } });
        el.addEventListener('click', (e) => {
          if (e.target.closest('.tab-close')) this.closeTab(t);
          else this.showTab(t);
        });
        el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('tb-tab', String(t.id)); el.classList.add('dragging'); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('tb-tab')) e.preventDefault(); });
        el.addEventListener('drop', (e) => {
          const id = +e.dataTransfer.getData('tb-tab');
          const moving = this.tabs.find((x) => x.id === id);
          if (!moving || moving === t) return;
          this.tabs.splice(this.tabs.indexOf(moving), 1);
          this.tabs.splice(this.tabs.indexOf(t) + (e.offsetX > el.offsetWidth / 2 ? 1 : 0), 0, moving);
          this.renderTabs();
        });
        bar.appendChild(el);
        if (t === focused) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      }
      if (focused) document.title = focused.title + ' — TeachBoard';
      const sw = $('#topActions [data-act=swap]');
      if (sw) sw.hidden = !this.split;
      const sp = $('#topActions [data-act=split]');
      if (sp) sp.classList.toggle('on', this.split);
    },

    // ---------------- Split view ----------------
    setSplit(a, b) {
      this.split = true;
      this.panes = [a, b];
      this.focusPane = 0;
      this.afterShow(a);
      b.onShown();
    },

    toggleSplit() {
      if (this.split) {
        this.split = false;
        this.panes = [this.focusedTab, null];
        this.focusPane = 0;
        this.afterShow(this.panes[0]);
        return;
      }
      const cur = this.focusedTab;
      // Right side: another open tab (prefer a whiteboard), or a new whiteboard.
      let other = this.tabs.find((t) => t !== cur && t instanceof BoardTab) || this.tabs.find((t) => t !== cur && !(t instanceof HomeTab));
      if (!other) { other = new BoardTab(); this.tabs.push(other); this.stage.appendChild(other.el); }
      this.setSplit(cur, other);
      this.toast('Split view: click a side, then click a tab to show it there');
    },

    swapPanes() {
      if (!this.split) return;
      this.panes.reverse();
      this.focusPane = 1 - this.focusPane;
      this.layout();
      this.renderTabs();
    },

    layout() {
      const W = this.stage.clientWidth;
      const split = this.split && this.panes[1];
      const cut = Math.round(W * this.ratio);
      for (const t of this.tabs) {
        const pane = this.panes.indexOf(t);
        const visible = pane === 0 || (split && pane === 1);
        t.el.classList.toggle('hidden', !visible);
        t.el.classList.toggle('focused-pane', !!split && pane === this.focusPane);
        t.el.classList.toggle('pane-b', pane === 1);
        if (!visible) { t.el.style.left = '0'; t.el.style.width = '100%'; continue; }
        if (!split) { t.el.style.left = '0'; t.el.style.width = '100%'; }
        else if (pane === 0) { t.el.style.left = '0'; t.el.style.width = cut - 4 + 'px'; }
        else { t.el.style.left = cut + 4 + 'px'; t.el.style.width = W - cut - 4 + 'px'; }
      }
      this.divider.hidden = !split;
      this.divider.style.left = cut + 'px';
    },

    setupDivider() {
      this.divider.addEventListener('pointerdown', (e) => {
        this.divider.setPointerCapture(e.pointerId);
        this.divider.classList.add('dragging');
        this.stage.classList.add('resizing');
        const move = (ev) => {
          const r = this.stage.getBoundingClientRect();
          this.ratio = Math.min(0.85, Math.max(0.15, (ev.clientX - r.left) / r.width));
          this.layout();
        };
        const up = () => {
          this.divider.removeEventListener('pointermove', move);
          this.divider.removeEventListener('pointerup', up);
          this.divider.classList.remove('dragging');
          this.stage.classList.remove('resizing');
        };
        this.divider.addEventListener('pointermove', move);
        this.divider.addEventListener('pointerup', up);
      });
      this.divider.addEventListener('dblclick', () => { this.ratio = 0.5; this.layout(); });
    },

    // ---------------- Opening things ----------------
    async openPath(p, replacing) {
      const existing = this.tabs.find((t) => t.filePath && t.filePath.toLowerCase() === p.toLowerCase());
      if (existing) { if (replacing) this.closeTab(replacing); this.showTab(existing); return; }
      try {
        const tab = /\.pdf$/i.test(p) ? new PdfTab(p) : await BoardTab.fromFile(p);
        if (replacing && this.tabs.includes(replacing)) this.replaceTab(replacing, tab);
        else this.addTab(tab);
      } catch (err) {
        this.toast('Could not open file: ' + err.message, 'error');
      }
    },

    async openPdf() {
      const files = await window.api.openPdfDialog();
      files.forEach((f) => this.openPath(f));
    },

    async openBoard() {
      const p = await window.api.openBoardDialog();
      if (p) this.openPath(p);
    },

    // The whiteboard that receives images / snapshots from the browser and PDFs.
    targetBoardTab() {
      if (this.split) {
        const other = this.panes[1 - this.focusPane];
        if (other instanceof BoardTab) return other;
        if (this.focusedTab instanceof BoardTab) return this.focusedTab;
      }
      if (this.focusedTab instanceof BoardTab) return this.focusedTab;
      if (this.lastBoardTab && this.tabs.includes(this.lastBoardTab)) return this.lastBoardTab;
      const t = this.tabs.find((x) => x instanceof BoardTab);
      if (t) return t;
      return this.addTab(new BoardTab(), { activate: false });
    },

    async sendImageToBoard(dataUrl, prefix = 'Image added to') {
      const tab = this.targetBoardTab();
      await tab.board.addImage(dataUrl);
      const visible = this.panes.includes(tab);
      this.toast(`${prefix} “${tab.title}”`, 'info', visible ? null : { label: 'Show', run: () => this.showTab(tab) });
    },

    // Called when the user starts drawing on a board; drops a stale selection on other boards.
    setActiveBoard(b) {
      if (this.activeBoard && this.activeBoard !== b) this.activeBoard.clearSelection();
      this.activeBoard = b;
    },

    // ---------------- Tool rail ----------------
    buildRail() {
      const rail = $('#toolrail');
      rail.innerHTML = '';
      for (const t of TOOL_LIST) {
        const b = document.createElement('button');
        b.className = 'tool-btn' + (['pen', 'highlighter', 'eraser', 'text', 'shape', 'connector'].includes(t.id) ? ' has-menu' : '');
        b.dataset.tool = t.id;
        b.title = t.title;
        b.innerHTML = icon(t.icon, 22);
        b.onclick = () => {
          if (t.id === 'shape') { this.selectTool('shape'); this.showToolOptions('shape', b); return; }
          if (Tools.tool === t.id && b.classList.contains('has-menu')) this.showToolOptions(t.id, b);
          else this.selectTool(t.id);
        };
        b.oncontextmenu = (e) => { e.preventDefault(); this.selectTool(t.id); if (b.classList.contains('has-menu')) this.showToolOptions(t.id, b); };
        rail.appendChild(b);
      }
      const tpl = document.createElement('button');
      tpl.className = 'tool-btn';
      tpl.title = 'Templates — ready-made diagrams (web app, microservices, RAG, AI agent, LAN)';
      tpl.innerHTML = icon('template', 22);
      tpl.onclick = () => this.showTemplates(tpl);
      rail.appendChild(tpl);
      const img = document.createElement('button');
      img.className = 'tool-btn';
      img.title = 'Insert image from computer (I) — you can also paste (Ctrl V) or drag & drop';
      img.innerHTML = icon('image', 22);
      img.onclick = () => this.insertImageFromFile();
      rail.appendChild(img);

      rail.appendChild(Object.assign(document.createElement('div'), { className: 'rail-sep' }));
      const sw = document.createElement('div');
      sw.className = 'swatches';
      COLORS.forEach((c, i) => {
        const s = document.createElement('button');
        s.className = 'swatch';
        s.style.background = c;
        s.dataset.color = c;
        s.title = `Colour (${(i + 1) % 10})`;
        s.onclick = () => this.setColor(c);
        sw.appendChild(s);
      });
      const custom = document.createElement('label');
      custom.className = 'swatch custom';
      custom.title = 'Pick any colour';
      custom.innerHTML = '<input type="color" />';
      custom.querySelector('input').addEventListener('input', (e) => this.setColor(e.target.value));
      sw.appendChild(custom);
      rail.appendChild(sw);

      rail.appendChild(Object.assign(document.createElement('div'), { className: 'rail-sep' }));
      const sizes = document.createElement('div');
      sizes.className = 'sizes';
      SIZES.forEach((s) => {
        const b = document.createElement('button');
        b.className = 'size-btn';
        b.dataset.size = s;
        b.title = `Thickness ${s}  ( [ and ] keys )`;
        const d = Math.min(18, 3 + s);
        b.innerHTML = `<span style="width:${d}px;height:${d}px"></span>`;
        b.onclick = () => this.setSize(s);
        sizes.appendChild(b);
      });
      rail.appendChild(sizes);

      rail.appendChild(Object.assign(document.createElement('div'), { className: 'rail-sep' }));
      const mk = (ic, title, fn) => {
        const b = document.createElement('button');
        b.className = 'tool-btn';
        b.title = title;
        b.innerHTML = icon(ic, 22);
        b.onclick = fn;
        rail.appendChild(b);
        return b;
      };
      mk('undo', 'Undo (Ctrl Z)', () => this.focusedTab && this.focusedTab.undo());
      mk('redo', 'Redo (Ctrl Y)', () => this.focusedTab && this.focusedTab.redo());
      mk('trash', 'Clear this page', () => {
        const b = this.currentBoard;
        if (b && b.els.length && confirm('Clear everything on this page? (You can Undo.)')) this.focusedTab.clear();
      });
      this.refreshRail();
    },

    refreshRail() {
      const rail = $('#toolrail');
      rail.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === Tools.tool));
      rail.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color.toLowerCase() === Tools.color.toLowerCase()));
      rail.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('active', +b.dataset.size === Tools.size));
      const t = this.focusedTab;
      rail.classList.toggle('disabled', !t || t instanceof HomeTab);
      const shapeBtn = rail.querySelector('[data-tool=shape]');
      if (shapeBtn) {
        const c = document.createElement('canvas');
        TB.drawShapeIcon(c, Tools.shape, Tools.tool === 'shape' ? '#ffffff' : '#e8e9ee');
        c.style.width = c.style.height = '26px';
        shapeBtn.innerHTML = '';
        shapeBtn.appendChild(c);
      }
    },

    selectTool(id) {
      const t = this.focusedTab;
      if (t instanceof WebTab && !t.inkOn && !['hand', 'select'].includes(id)) t.toggleInk(true);
      Tools.set({ tool: id });
    },

    setColor(c) {
      Tools.set({ color: c });
      if (Tools.tool === 'select' && this.currentBoard) this.currentBoard.applyStyle({ color: c });
      if (['select', 'hand', 'eraser', 'laser'].includes(Tools.tool)) return;
    },
    setSize(s) {
      Tools.set({ size: s });
      if (Tools.tool === 'select' && this.currentBoard) this.currentBoard.applyStyle({ size: s });
    },

    adaptColorToBackground(bg) {
      if (bg.dark && TB.isDarkColor(Tools.color)) this.setColor('#ffffff');
      else if (!bg.dark && Tools.color.toLowerCase() === '#ffffff') this.setColor('#1d1d1f');
    },

    onToolsChanged(patch) {
      if ('tool' in patch) Board.all.forEach((b) => b.updateCursor());
      if ('snap' in patch || 'minimap' in patch) this.tabs.forEach((t) => { if (t instanceof BoardTab) { t.updateBar(); t.updateOverview(); } });
      this.refreshRail();
    },

    showTemplates(anchor) {
      const pop = this.popover(anchor, 'right');
      pop.innerHTML = `<div class="pop-title">Templates — click to insert</div><div class="menu tpl-menu">${TB.TEMPLATES.map((t) =>
        `<button data-tpl="${t.id}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
        <div class="pop-title" style="text-transform:none;letter-spacing:0">Everything stays editable: move boxes and the arrows follow, double-click to rename.</div>`;
      pop.onclick = (e) => {
        const b = e.target.closest('[data-tpl]');
        if (!b) return;
        this.closePopover();
        this.insertTemplate(b.dataset.tpl);
      };
    },
    insertTemplate(id) {
      const tpl = TB.TEMPLATES.find((t) => t.id === id);
      let tab = this.focusedTab;
      if (!(tab instanceof BoardTab)) tab = this.targetBoardTab();
      if (!this.panes.includes(tab)) this.showTab(tab);
      tab.board.resize(); // a board that was just shown may not know its size yet
      tab.board.insertElements(tpl.build());
      Tools.set({ tool: 'select' });
      // Make sure the whole template is visible.
      requestAnimationFrame(() => {
        const b = tab.board, sb = b.selBox();
        if (b.cssW < 200 || b.cssH < 200) return; // not laid out yet
        if (sb && (sb.w * b.view.zoom > b.cssW - 60 || sb.h * b.view.zoom > b.cssH - 100)) {
          const z = Math.min((b.cssW - 80) / sb.w, (b.cssH - 140) / sb.h);
          b.setView({ zoom: z, x: sb.x + sb.w / 2 - b.cssW / 2 / z, y: sb.y + sb.h / 2 - b.cssH / 2 / z });
        }
      });
    },

    showToolOptions(tool, anchor) {
      const pop = this.popover(anchor, 'right');
      const chips = (key, options, onPick) =>
        `<div class="pop-row">${options.map(([v, label]) => `<button class="chip ${Tools[key] === v ? 'active' : ''}" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
      const slider = (key, min, max, label) =>
        `<div class="pop-title">${label}</div><div class="slider-row"><input type="range" min="${min}" max="${max}" value="${Tools[key]}" data-range="${key}"/><output>${Tools[key]}</output></div>`;
      let html = '';
      if (tool === 'pen' || tool === 'highlighter') {
        html = `${slider('size', 1, 40, 'Thickness')}${slider('smoothing', 0, 100, 'Smoothing (steadier handwriting)')}
          <div class="pop-title" style="text-transform:none;letter-spacing:0">Higher smoothing removes touchpad shake. 0 = exactly as drawn.</div>`;
      }
      if (tool === 'connector') {
        html = `<div class="pop-title">Line style</div>${chips('route', [['elbow', 'Elbow ┐'], ['straight', 'Straight ╱'], ['curve', 'Curved ⌒']])}
          <div class="pop-title">Arrows</div><div class="pop-row">
            <button class="chip ${Tools.startArrow ? 'active' : ''}" data-toggle="startArrow">◀ Start</button>
            <button class="chip ${Tools.endArrow ? 'active' : ''}" data-toggle="endArrow">End ▶</button>
            <button class="chip ${Tools.dash ? 'active' : ''}" data-toggle="dash">Dashed</button></div>
          ${slider('size', 1, 12, 'Thickness')}
          <div class="pop-title" style="text-transform:none;letter-spacing:0">Drag from one shape to another — it turns green when it will attach.
            Moved shapes keep their arrows. Double-click an arrow (with Select) to add a label like "HTTPS".</div>`;
      }
      if (tool === 'eraser') {
        html = `<div class="pop-title">Eraser</div>${chips('eraserMode', [['partial', 'Rub out (part of a line)'], ['object', 'Whole object']])}
          ${slider('size', 1, 40, 'Eraser size')}
          <div class="pop-title">Page</div><div class="pop-row"><button class="chip" data-clear>Clear whole page</button></div>`;
      }
      if (tool === 'text') {
        html = `<div class="pop-title">Style</div>${chips('textStyle', [['plain', 'Plain text'], ['sticky', 'Sticky note'], ['code', 'Code block']])}
          <div class="pop-title">Font</div>${chips('font', [['sans', 'Normal'], ['hand', 'Handwriting'], ['serif', 'Serif'], ['mono', 'Monospace']])}
          ${slider('fontSize', 12, 120, 'Text size')}
          <div class="pop-title" style="text-transform:none;letter-spacing:0">Click on the board to type. Ctrl+Enter or Esc to finish. Code blocks get colour highlighting.</div>`;
      }
      if (tool === 'shape') {
        html = `<div class="pop-row" style="margin-bottom:4px"><button class="chip" data-templates>${icon('template', 14)} Templates…</button></div>`;
        html += SHAPE_GROUPS.map((g) => `<div class="pop-title">${g.name}</div><div class="shape-grid">${g.items
          .map((k) => `<button class="shape-cell ${Tools.shape === k ? 'active' : ''}" data-shape="${k}" title="${SHAPES[k].name}"><canvas></canvas></button>`).join('')}</div>`).join('');
        html += `<div class="pop-row" style="margin-top:6px;gap:10px"><span style="color:var(--muted);font-size:12px">Table</span>
            <input class="num" type="number" min="1" max="20" value="${Tools.tableRows}" data-num="tableRows" title="Rows"/> ×
            <input class="num" type="number" min="1" max="20" value="${Tools.tableCols}" data-num="tableCols" title="Columns"/></div>
          <div class="pop-title">Fill</div>${chips('fill', [['none', 'No fill'], ['light', 'Light'], ['solid', 'Solid']])}
          <div class="pop-title">Line</div><div class="pop-row"><button class="chip ${!Tools.dash ? 'active' : ''}" data-dash="0">Solid</button><button class="chip ${Tools.dash ? 'active' : ''}" data-dash="1">Dashed</button></div>
          ${slider('size', 1, 30, 'Thickness')}
          <div class="pop-title" style="text-transform:none;letter-spacing:0">Drag to draw, or click once for default size. Hold Shift for square / straight. Double-click a shape (with Select) to type inside it.</div>`;
      }
      pop.innerHTML = html;
      pop.querySelectorAll('.shape-cell').forEach((c) => TB.drawShapeIcon(c.querySelector('canvas'), c.dataset.shape, '#e8e9ee'));

      pop.onclick = (e) => {
        const chip = e.target.closest('[data-k]');
        if (chip) {
          const patch = { [chip.dataset.k]: chip.dataset.v };
          Tools.set(patch);
          if (this.currentBoard && this.currentBoard.sel.length) this.currentBoard.applyStyle(patch);
          chip.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === chip));
        }
        const sh = e.target.closest('[data-shape]');
        if (sh) { Tools.set({ shape: sh.dataset.shape, tool: 'shape' }); this.closePopover(); }
        const dash = e.target.closest('[data-dash]');
        if (dash) {
          Tools.set({ dash: dash.dataset.dash === '1' });
          if (this.currentBoard && this.currentBoard.sel.length) this.currentBoard.applyStyle({ dash: Tools.dash });
          dash.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === dash));
        }
        const tog = e.target.closest('[data-toggle]');
        if (tog) {
          const k = tog.dataset.toggle;
          Tools.set({ [k]: !Tools[k] });
          tog.classList.toggle('active', Tools[k]);
          if (this.currentBoard && this.currentBoard.sel.length) this.currentBoard.applyStyle({ [k]: Tools[k] });
        }
        if (e.target.closest('[data-templates]')) { this.showTemplates(anchor); return; }
        if (e.target.closest('[data-clear]')) { this.closePopover(); if (this.focusedTab) this.focusedTab.clear(); }
      };
      pop.querySelectorAll('[data-range]').forEach((r) => r.addEventListener('input', () => {
        const k = r.dataset.range, v = +r.value;
        r.nextElementSibling.textContent = v;
        Tools.set({ [k]: v });
        if (this.currentBoard && this.currentBoard.sel.length) this.currentBoard.applyStyle({ [k]: v });
      }));
      pop.querySelectorAll('[data-num]').forEach((n) => {
        n.addEventListener('keydown', (e) => e.stopPropagation());
        n.addEventListener('input', () => Tools.set({ [n.dataset.num]: Math.max(1, Math.min(20, +n.value || 1)), shape: 'table', tool: 'shape' }));
      });
    },

    async insertImageFromFile() {
      const t = this.focusedTab;
      if (!(t instanceof BoardTab)) {
        const imgs = await window.api.openImageDialog();
        for (const src of imgs) await this.sendImageToBoard(src);
        return;
      }
      const imgs = await window.api.openImageDialog();
      for (const src of imgs) await t.board.addImage(src);
      if (imgs.length) Tools.set({ tool: 'select' });
    },

    // ---------------- Top actions ----------------
    buildTopActions() {
      const box = $('#topActions');
      const items = [
        ['split', 'split', 'Split screen — two tabs side by side (Ctrl \\)', 'Split'],
        ['swap', 'swap', 'Swap left and right', ''],
        ['ink', 'ink', 'Draw on screen — over any program', 'Screen ink'],
        ['timer', 'timer', 'Countdown timer / stopwatch', ''],
        ['picker', 'dice', 'Pick a random student', ''],
        ['spot', 'spotlight', 'Spotlight — focus attention on one area', ''],
        ['reload', 'reload', 'Reload TeachBoard (Ctrl Shift R) — fixes a blank screen; your tabs come back', ''],
        ['help', 'help', 'Shortcuts, version and updates', ''],
        ['full', 'fullscreen', 'Full screen (F11)', ''],
      ];
      box.innerHTML = items.map(([a, ic, title, lbl]) => `<button class="icon-btn" data-act="${a}" title="${title}">${icon(ic, 18)}${lbl ? `<span class="lbl">${lbl}</span>` : ''}</button>`).join('');
      box.querySelector('[data-act=swap]').hidden = true;
      box.onclick = (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        switch (b.dataset.act) {
          case 'split': this.toggleSplit(); break;
          case 'swap': this.swapPanes(); break;
          case 'ink': window.api.inkOpen(); break;
          case 'timer': Widgets.openTimer(); break;
          case 'picker': Widgets.openPicker(); break;
          case 'spot': Widgets.toggleSpotlight(); break;
          case 'help': this.showHelp(b); break;
          case 'reload': this.reloadApp(); break;
          case 'full': window.api.toggleFullscreen(); break;
        }
      };
    },

    async showHelp(anchor) {
      const pop = this.popover(anchor, 'down');
      const version = await window.api.appVersion();
      const rows = [
        ['V  H  P  M  E  L  T', 'Select, Pan, Pen, Highlighter, Eraser, Laser, Text'],
        ['C', 'Connector (arrow that sticks to shapes)'],
        ['S / R / O / A', 'Shapes / Rectangle / Ellipse / Arrow'],
        ['1 … 0', 'Pick colour'], ['[  ]', 'Thinner / thicker'],
        ['Space + drag', 'Pan the board'], ['Ctrl + wheel / pinch', 'Zoom'], ['Two-finger scroll', 'Move around the board'],
        ['Shift 1  or  Home', 'Show all your drawings (lost them? press this)'],
        ['Ctrl Z / Ctrl Y', 'Undo / Redo'], ['Delete', 'Delete selected'], ['Ctrl C / Ctrl V / Ctrl D', 'Copy / Paste / Duplicate'],
        ['Ctrl V (image)', 'Paste a screenshot or copied image'], ['Shift + drag', 'Straight line / perfect square'],
        ['Page Up / Down', 'Previous / next board page'],
        ['Ctrl T / Ctrl W', 'New tab / Close tab'], ['Ctrl Tab', 'Next tab'], ['Ctrl N', 'New whiteboard'], ['Ctrl O', 'Open PDF'],
        ['Ctrl S', 'Save whiteboard'], ['Ctrl \\', 'Split screen on/off'], ['F11', 'Full screen'],
        ['Ctrl Shift R', 'Reload (fixes a blank screen; tabs come back)'], ['Esc', 'Cancel / close'],
      ];
      pop.innerHTML = `<div class="pop-title">About</div>
        <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)">
          <img src="assets/app-icon-64.png" width="32" height="32" style="border-radius:7px" />
          <div style="flex:1">TeachBoard ${version} — developed by <b style="color:var(--text)">Sahan Silva</b></div>
          <button class="chip" data-update>${icon('update', 14)} Check for updates</button>
        </div>
        <div class="pop-title" style="margin-top:14px">Keyboard shortcuts</div><table class="help-table">${rows.map(([k, d]) => `<tr><td>${k}</td><td>${d}</td></tr>`).join('')}</table>`;
      pop.querySelector('[data-update]').onclick = async () => {
        this.updateAsked = true;
        const r = await window.api.updateCheck();
        if (r.state === 'dev') this.toast('Updates work in the installed app (not when running with npm start)');
        else if (r.state === 'error') this.toast('Could not check for updates: ' + r.message, 'error');
        else this.toast('Checking for updates…');
      };
    },

    // Messages from the auto-updater in the main process.
    onUpdateStatus(s) {
      if (s.state === 'downloading' && s.version) this.toast(`Downloading TeachBoard ${s.version} in the background…`);
      if (s.state === 'latest' && this.updateAsked) this.toast(`You have the latest version (${s.version})`);
      if (s.state === 'ready') {
        this.toast(`TeachBoard ${s.version} is ready.`, 'info', { label: 'Restart & update', run: () => this.installUpdate() }, 0);
      }
      if (s.state === 'error' && this.updateAsked) this.toast('Update failed: ' + s.message, 'error');
    },
    installUpdate() {
      this.tabs.forEach((t) => {
        if (t instanceof PdfTab) t.saveAnnotations();
        if (t instanceof BoardTab) t.autosaveNow();
      });
      window.api.sessionSaveSync(this.sessionData());
      window.api.updateInstall();
    },

    // ---------------- Popover & toasts ----------------
    popover(anchor, dir = 'right') {
      const pop = $('#popover');
      pop.hidden = false;
      pop.innerHTML = '';
      pop.onclick = null;
      const r = anchor.getBoundingClientRect();
      pop.style.left = pop.style.top = pop.style.right = pop.style.bottom = 'auto';
      requestAnimationFrame(() => {
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        let x, y;
        if (dir === 'right') { x = r.right + 8; y = Math.min(r.top, innerHeight - ph - 8); }
        else if (dir === 'up') { x = Math.min(r.left, innerWidth - pw - 8); y = r.top - ph - 8; }
        else { x = Math.min(r.right - pw, innerWidth - pw - 8); y = r.bottom + 6; }
        pop.style.left = Math.max(8, x) + 'px';
        pop.style.top = Math.max(8, y) + 'px';
      });
      this.popAnchor = anchor;
      return pop;
    },
    closePopover() { $('#popover').hidden = true; this.popAnchor = null; },

    // duration: ms before it disappears; 0 keeps it until removed (returned element) or clicked.
    toast(msg, type = 'info', action, duration) {
      const t = document.createElement('div');
      t.className = 'toast' + (type === 'error' ? ' error' : '');
      const span = document.createElement('span');
      span.textContent = msg;
      t.appendChild(span);
      if (action) {
        const b = document.createElement('button');
        b.textContent = action.label;
        b.onclick = () => { action.run(); t.remove(); };
        t.appendChild(b);
      }
      $('#toasts').appendChild(t);
      const ms = duration ?? (type === 'error' ? 7000 : action ? 6000 : 3000);
      if (ms) setTimeout(() => t.remove(), ms);
      else if (!action) t.onclick = () => t.remove();
      return t;
    },

    // ---------------- Keyboard ----------------
    setupShortcuts() {
      document.addEventListener('pointerdown', (e) => {
        const pop = $('#popover');
        if (!pop.hidden && !pop.contains(e.target) && !(this.popAnchor && this.popAnchor.contains(e.target))) this.closePopover();
      }, true);

      window.addEventListener('keydown', (e) => {
        if (e.key === ' ' && !this.isTyping(e)) Board.all.forEach((b) => { b.spaceDown = true; b.canvas.style.cursor = 'grab'; });
        this.handleKey(e);
      });
      window.addEventListener('keyup', (e) => {
        if (e.key === ' ') Board.all.forEach((b) => { b.spaceDown = false; b.updateCursor(); });
      });

      document.addEventListener('copy', (e) => {
        if (this.isTyping(e)) return;
        const b = this.currentBoard;
        if (b && b.copySelection()) { e.clipboardData.setData('text/plain', '[TeachBoard shapes]'); e.preventDefault(); }
      });
      document.addEventListener('paste', async (e) => {
        if (this.isTyping(e)) return;
        const t = this.focusedTab;
        if (!t || !t.board) return;
        const items = [...e.clipboardData.items];
        const imgItem = items.find((i) => i.type.startsWith('image/'));
        const text = e.clipboardData.getData('text/plain');
        e.preventDefault();
        if (text === '[TeachBoard shapes]') { t.board.pasteElements(); return; }
        if (imgItem) {
          const file = imgItem.getAsFile();
          const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
          await t.board.addImage(url);
          Tools.set({ tool: 'select' });
        } else if (text) {
          if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(text.trim())) {
            try { await t.board.addImage(await window.api.fetchImage(text.trim())); return; } catch {}
          }
          t.board.addText(text);
        }
      });
    },

    isTyping(e) {
      const el = e.target;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    },

    // Shared by keydown and shortcuts forwarded from inside web pages.
    handleKey(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const tab = this.focusedTab;
      const board = this.currentBoard;
      const prevent = () => e.preventDefault && e.preventDefault();

      if (k === 'F11') { prevent(); window.api.toggleFullscreen(); return; }
      if (ctrl && e.shiftKey && (k === 'r' || k === 'R')) { prevent(); this.reloadApp(); return; }
      if (ctrl && (k === 't' || k === 'T')) { prevent(); this.addTab(new HomeTab()); return; }
      if (ctrl && (k === 'w' || k === 'W')) { prevent(); if (tab) this.closeTab(tab); return; }
      if (ctrl && k === 'Tab') { prevent(); this.cycleTab(e.shiftKey ? -1 : 1); return; }
      if (ctrl && k === '\\') { prevent(); this.toggleSplit(); return; }
      if (ctrl && (k === 'n' || k === 'N')) { prevent(); this.addTab(new BoardTab()); return; }
      if (ctrl && (k === 'o' || k === 'O')) { prevent(); this.openPdf(); return; }
      if (k === 'F5' && tab instanceof WebTab) { prevent(); tab.wv.reload(); return; }
      if (e.altKey && tab instanceof WebTab && (k === 'ArrowLeft' || k === 'ArrowRight')) { prevent(); tab.act(k === 'ArrowLeft' ? 'back' : 'forward'); return; }

      if (this.isTyping(e)) return;

      if (k === 'Escape') {
        if (!$('#popover').hidden) return this.closePopover();
        if (Widgets.spotlightOn()) return Widgets.toggleSpotlight();
        if (tab instanceof WebTab && tab.inkOn) return tab.toggleInk(false);
        if (board) board.clearSelection();
        return;
      }
      if (ctrl && (k === 's' || k === 'S')) { prevent(); if (tab instanceof BoardTab) tab.save(e.shiftKey); else if (tab instanceof PdfTab) tab.exportPdf(); return; }
      if (ctrl && (k === 'z' || k === 'Z')) { prevent(); if (tab) e.shiftKey ? tab.redo() : tab.undo(); return; }
      if (ctrl && (k === 'y' || k === 'Y')) { prevent(); if (tab) tab.redo(); return; }
      if (ctrl && (k === '=' || k === '+' || k === '-' || k === '0')) {
        prevent();
        const f = k === '-' ? 0.8 : 1.25;
        if (tab instanceof BoardTab) k === '0' ? board.resetView() : board.zoomBy(f);
        else if (tab instanceof PdfTab) k === '0' ? tab.fitWidth() : tab.setZoom(tab.zoom * f);
        else if (tab instanceof WebTab) tab.setZoom(k === '0' ? 1 : tab.zoomFactor + (k === '-' ? -0.1 : 0.1));
        return;
      }
      if (!board && !(tab instanceof WebTab) && !(tab instanceof PdfTab)) return;

      if (ctrl && (k === 'a' || k === 'A') && board) { prevent(); Tools.set({ tool: 'select' }); board.selectAll(); return; }
      if (ctrl && (k === 'd' || k === 'D') && board) { prevent(); board.duplicateSelection(); return; }
      if ((k === 'Delete' || k === 'Backspace') && board) { if (board.deleteSelection()) prevent(); return; }
      if (k.startsWith('Arrow') && board && board.sel.length) {
        prevent();
        const d = e.shiftKey ? 20 : 2;
        board.nudgeSelection(k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0);
        return;
      }
      if ((k === 'PageDown' || k === 'PageUp') && tab instanceof BoardTab) { prevent(); tab.act(k === 'PageDown' ? 'next' : 'prev'); return; }
      // Shift+1 / Home: show all drawings (the key is "!" with Shift on most layouts, so check the code too).
      if (tab instanceof BoardTab && (k === 'Home' || (e.shiftKey && (e.code === 'Digit1' || k === '!')))) { prevent(); tab.board.fitContent(); return; }
      if (ctrl || e.altKey) return;

      const toolKeys = { v: 'select', h: 'hand', p: 'pen', m: 'highlighter', e: 'eraser', l: 'laser', t: 'text', s: 'shape', c: 'connector' };
      const lk = k.toLowerCase();
      if (toolKeys[lk]) { this.selectTool(toolKeys[lk]); return; }
      if (lk === 'r' || lk === 'o' || lk === 'a') { Tools.set({ shape: { r: 'rect', o: 'ellipse', a: 'arrow' }[lk] }); this.selectTool('shape'); return; }
      if (lk === 'i') { this.insertImageFromFile(); return; }
      if (/^[0-9]$/.test(k)) { this.setColor(COLORS[(+k + 9) % 10]); return; }
      if (k === '[') { this.setSize(Math.max(1, Tools.size - (Tools.size > 8 ? 2 : 1))); return; }
      if (k === ']') { this.setSize(Math.min(40, Tools.size + (Tools.size >= 8 ? 2 : 1))); return; }
    },

    // ---------------- IPC from main ----------------
    setupIpc() {
      const api = window.api;
      api.onOpenPath((p) => this.openPath(p));
      api.onOpenUrlInTab((url) => this.addTab(new WebTab(url)));
      api.onWebImageToBoard(async (url) => {
        try { await this.sendImageToBoard(await api.fetchImage(url)); }
        catch { this.toast('Could not download that image', 'error'); }
      });
      api.onWebTextToBoard((text) => {
        const tab = this.targetBoardTab();
        tab.board.addText(text);
        this.toast(`Text added to “${tab.title}”`, 'info', this.panes.includes(tab) ? null : { label: 'Show', run: () => this.showTab(tab) });
      });
      api.onWebSnapshotRequest(async (id) => {
        const data = await api.captureWebContents(id);
        if (data) this.sendImageToBoard(data, 'Snapshot added to');
      });
      api.onShortcut((s) => this.handleKey({ key: s.key, ctrlKey: s.control, shiftKey: s.shift, altKey: s.alt, target: document.body }));
      api.onUpdateStatus((s) => this.onUpdateStatus(s));
      api.onFullscreenChanged((on) => {
        const b = $('#topActions [data-act=full]');
        b.innerHTML = icon(on ? 'exitfull' : 'fullscreen', 18);
        b.title = on ? 'Exit full screen (F11)' : 'Full screen (F11)';
      });
    },
  });

  window.addEventListener('DOMContentLoaded', () => App.init());
})();
