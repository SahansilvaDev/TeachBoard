/* Tab types: Home (new tab page), Board (whiteboard), Pdf (tute viewer + ink), Web (browser + ink). */
(function () {
  const { Board, Tools, BACKGROUNDS } = TB;
  let tabSeq = 0;
  let boardSeq = 0;

  const h = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const btn = (act, ic, title, label) =>
    `<button class="icon-btn" data-act="${act}" title="${title}">${icon(ic, 18)}${label ? `<span class="lbl">${label}</span>` : ''}</button>`;

  const GOOGLE = 'https://www.google.com/';
  const searchUrl = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);
  const imagesUrl = (q) => (q ? 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q) : 'https://images.google.com/');
  const youtubeUrl = (q) => (q ? 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) : 'https://www.youtube.com/');

  function toUrl(text) {
    const t = text.trim();
    if (!t) return GOOGLE;
    if (/^(https?|file|about|data):/i.test(t)) return t;
    if (/^localhost(:\d+)?(\/.*)?$/i.test(t) || /^[^\s]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t)) return 'https://' + t;
    return searchUrl(t);
  }

  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // ======================================================================
  class TabBase {
    constructor(type, title) {
      this.id = ++tabSeq;
      this.type = type;
      this.title = title;
      this.dirty = false;
      this.el = document.createElement('div');
      this.el.className = `tab-content ${type}-tab hidden`;
      this.el.addEventListener('pointerdown', () => App.focusTab(this), true);
    }
    get iconHtml() { return icon('board', 16); }
    get board() { return null; }
    sessionInfo() { return { type: 'home' }; }
    get usesTools() { return !!this.board; }
    setTitle(t) { this.title = t; App.renderTabs(); }
    setDirty(d) { if (this.dirty !== d) { this.dirty = d; App.renderTabs(); } }
    undo() { if (this.board) this.board.undo(); }
    redo() { if (this.board) this.board.redo(); }
    clear() { if (this.board) this.board.clearPage(); }
    onShown() {}
    async canClose() { return true; }
    destroy() { this.el.remove(); }
  }

  // ======================================================================
  class HomeTab extends TabBase {
    constructor() {
      super('home', 'New tab');
      this.el.innerHTML = `
        <div class="home-inner">
          <h1>TeachBoard</h1>
          <p class="sub">Whiteboard, PDF tutes, Google and YouTube for your class — all in one window.</p>
          <form class="home-search">
            <input placeholder="Search Google or type a website address" autocomplete="off" />
            <button type="submit" data-q="google">${icon('google', 18)}Google</button>
            <button type="button" data-q="images">${icon('image', 18)}Images</button>
            <button type="button" data-q="youtube">${icon('youtube', 18)}YouTube</button>
          </form>
          <div class="tiles">
            ${this.tile('board', 'board', '#3b82f6', 'New whiteboard', 'Blank board with pens, shapes, flowcharts, logic gates and network icons.')}
            ${this.tile('pdf', 'pdf', '#ef4444', 'Open tute / PDF', 'Read your notes full screen and write on the pages.')}
            ${this.tile('pdfboard', 'split', '#a855f7', 'PDF + Whiteboard', 'PDF on the left, a whiteboard on the right, side by side.')}
            ${this.tile('open', 'folder', '#10b981', 'Open saved board', 'Continue a whiteboard you saved before (.tboard).')}
            ${this.tile('youtube', 'youtube', '#ff0033', 'YouTube', 'Play videos for your class. You can draw on top of them.')}
            ${this.tile('images', 'image', '#f59e0b', 'Google Images', 'Find images and right-click → “Add image to whiteboard”.')}
            ${this.tile('google', 'globe', '#14b8a6', 'Google / Web', 'Browse the web in a tab, like Edge.')}
            ${this.tile('ink', 'ink', '#ec4899', 'Draw on screen', 'Write over any program — PowerPoint, VS Code, Packet Tracer…')}
          </div>
          <div class="home-section">
            <h2>Recent files</h2>
            <div class="recent"><div class="empty">Loading…</div></div>
          </div>
        </div>
        <div class="dev-credit">
          <span>Developed by</span>
          <img src="assets/developed-by.png" alt="Sahan Silva" />
        </div>`;
      const input = this.el.querySelector('.home-search input');
      this.el.querySelector('.home-search').addEventListener('submit', (e) => {
        e.preventDefault();
        App.replaceTab(this, new WebTab(toUrl(input.value)));
      });
      this.el.querySelector('[data-q=images]').onclick = () => App.replaceTab(this, new WebTab(imagesUrl(input.value.trim())));
      this.el.querySelector('[data-q=youtube]').onclick = () => App.replaceTab(this, new WebTab(youtubeUrl(input.value.trim())));
      this.el.querySelector('.tiles').addEventListener('click', (e) => {
        const t = e.target.closest('.tile');
        if (t) this.run(t.dataset.act);
      });
      this.input = input;
      this.loadRecent();
    }
    get iconHtml() { return icon('home', 16); }
    tile(act, ic, color, title, desc) {
      return `<button class="tile" data-act="${act}"><div class="tile-icon" style="background:${color}">${icon(ic, 22)}</div><b>${title}</b><span>${desc}</span></button>`;
    }
    onShown() { setTimeout(() => this.input.focus(), 50); this.loadRecent(); }
    async loadRecent() {
      const list = await window.api.recentList();
      const box = this.el.querySelector('.recent');
      if (!list.length) { box.innerHTML = '<div class="empty">Files you open will appear here.</div>'; return; }
      box.innerHTML = '';
      for (const f of list) {
        const b = h(`<button>${icon(/\.pdf$/i.test(f.name) ? 'pdf' : 'board', 18)}<span></span><small></small></button>`);
        b.querySelector('span').textContent = f.name;
        b.querySelector('small').textContent = f.path;
        b.onclick = () => App.openPath(f.path, this);
        box.appendChild(b);
      }
    }
    async run(act) {
      switch (act) {
        case 'board': App.replaceTab(this, new BoardTab()); break;
        case 'pdf': {
          const files = await window.api.openPdfDialog();
          files.forEach((f, i) => (i === 0 ? App.replaceTab(this, new PdfTab(f)) : App.addTab(new PdfTab(f))));
          break;
        }
        case 'pdfboard': {
          const files = await window.api.openPdfDialog();
          if (!files.length) return;
          const pdf = new PdfTab(files[0]);
          App.replaceTab(this, pdf);
          const board = new BoardTab();
          App.addTab(board, { activate: false });
          App.setSplit(pdf, board);
          break;
        }
        case 'open': {
          const p = await window.api.openBoardDialog();
          if (p) App.openPath(p, this);
          break;
        }
        case 'youtube': App.replaceTab(this, new WebTab(youtubeUrl())); break;
        case 'images': App.replaceTab(this, new WebTab(imagesUrl())); break;
        case 'google': App.replaceTab(this, new WebTab(GOOGLE)); break;
        case 'ink': window.api.inkOpen(); break;
      }
    }
  }

  // ======================================================================
  class BoardTab extends TabBase {
    constructor({ doc, filePath, title, autosaveId, dirty } = {}) {
      super('board', title || `Whiteboard ${++boardSeq}`);
      this.filePath = filePath || null;
      // Every board is also auto-saved to the app data folder so a crash or reload loses nothing.
      this.autosaveId = autosaveId || TB.uid();
      this.dirty = !!dirty;
      this.el.innerHTML = `
        <div class="canvas-wrap">
          <canvas class="board"></canvas>
          <div class="board-bars">
          <div class="floating-bar bar-bottom-left">
            ${btn('bg', 'background', 'Background / page style')}
            ${btn('snap', 'magnet', 'Snap to grid (keeps diagrams neat)')}
            <div class="bar-sep"></div>
            ${btn('zoomout', 'minus', 'Zoom out (Ctrl -)')}
            <span class="readout zoom" data-act="zoomreset" title="Reset zoom (Ctrl 0)">100%</span>
            ${btn('zoomin', 'plus', 'Zoom in (Ctrl +)')}
            ${btn('fit', 'fit', 'Show all your drawings (Shift+1 or Home)', 'Show all')}
            ${btn('minimap', 'map', 'Show / hide the board overview (minimap)')}
          </div>
          <div class="floating-bar bar-bottom-center">
            ${btn('prev', 'chevleft', 'Previous page (Page Up)')}
            <span class="readout pages">1 / 1</span>
            ${btn('next', 'chevright', 'Next page (Page Down)')}
            <div class="bar-sep"></div>
            ${btn('addpage', 'plus', 'Add new page', 'Page')}
            ${btn('delpage', 'trash', 'Delete this page')}
          </div>
          <div class="floating-bar bar-bottom-right">
            ${btn('save', 'save', 'Save (Ctrl S)')}
            ${btn('export', 'download', 'Export as image / PDF')}
          </div>
          </div>
          <div class="minimap" title="Board overview — click or drag to move there, double-click to show all">
            <canvas></canvas>
          </div>
          <div class="offscreen-hint" hidden>
            ${icon('fit', 16)}<span>Your drawings are off screen</span><button data-act="fit">Show all</button>
          </div>
        </div>`;
      const canvas = this.el.querySelector('canvas.board');
      this.board = new Board(canvas, {
        mode: 'infinite',
        doc: doc || { bg: 'white', pages: [{ elements: [] }] },
        onChange: () => { this.setDirty(true); this.updateBar(); this.scheduleAutosave(); },
        onActivate: (b) => App.setActiveBoard(b),
        onView: () => this.updateBar(),
        onRedraw: () => this.scheduleOverview(),
        // Keep "Show all" clear of the minimap (bottom-right) and the bottom bars.
        fitInsets: () => ({ right: Tools.minimap ? 260 : 40, bottom: 80 }),
      });
      this.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) this.act(b.dataset.act, b);
      });
      this.setupDrop(this.el.querySelector('.canvas-wrap'));
      this.setupMinimap();
      this.updateBar();
    }

    // ----- Board overview: minimap + "your drawings are off screen" hint -----
    setupMinimap() {
      this.mini = this.el.querySelector('.minimap');
      this.miniCanvas = this.mini.querySelector('canvas');
      this.hint = this.el.querySelector('.offscreen-hint');
      const toWorld = (e) => {
        const reg = this.miniDrag || this.miniRegion;
        if (!reg) return null;
        const r = this.miniCanvas.getBoundingClientRect();
        return [reg.r.x + (e.clientX - r.left) / reg.scale, reg.r.y + (e.clientY - r.top) / reg.scale];
      };
      this.miniCanvas.addEventListener('pointerdown', (e) => {
        if (!this.miniRegion) return;
        // Keep the overview still while dragging, otherwise it would shift under the pointer.
        this.miniDrag = this.miniRegion;
        this.miniCanvas.setPointerCapture(e.pointerId);
        const p = toWorld(e);
        if (p) this.board.centerOn(p[0], p[1]);
      });
      this.miniCanvas.addEventListener('pointermove', (e) => {
        if (!this.miniDrag) return;
        const p = toWorld(e);
        if (p) this.board.centerOn(p[0], p[1]);
      });
      const end = () => { this.miniDrag = null; this.scheduleOverview(); };
      this.miniCanvas.addEventListener('pointerup', end);
      this.miniCanvas.addEventListener('pointercancel', end);
      this.miniCanvas.addEventListener('dblclick', () => this.board.fitContent());
      this.miniCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.board.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2);
      }, { passive: false });
    }

    scheduleOverview() {
      if (this.overviewRaf) return;
      this.overviewRaf = requestAnimationFrame(() => { this.overviewRaf = 0; this.updateOverview(); });
    }

    updateOverview() {
      const b = this.board;
      if (!b.cssW) return;
      const els = b.els;
      const vis = b.visibleRect();
      const content = TB.unionBox(els);

      // Off-screen hint: there is something on this page, but none of it is visible.
      const lost = !!content && !els.some((e) => TB.boxesOverlap(TB.bbox(e), vis));
      this.hint.hidden = !lost;

      this.mini.hidden = !Tools.minimap;
      if (!Tools.minimap) return;
      const W = 220, H = 140, dpr = window.devicePixelRatio || 1;
      const c = this.miniCanvas;
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      let reg = this.miniDrag;
      if (!reg) {
        // Show everything drawn plus where you are now, with a little margin, in the minimap's shape.
        let r = vis;
        if (content) {
          const x0 = Math.min(content.x, vis.x), y0 = Math.min(content.y, vis.y);
          const x1 = Math.max(content.x + content.w, vis.x + vis.w), y1 = Math.max(content.y + content.h, vis.y + vis.h);
          r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        const m = Math.max(r.w, r.h) * 0.06;
        r = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
        if (r.w / r.h > W / H) { const nh = (r.w * H) / W; r.y -= (nh - r.h) / 2; r.h = nh; }
        else { const nw = (r.h * W) / H; r.x -= (nw - r.w) / 2; r.w = nw; }
        reg = { r, scale: W / r.w };
        this.miniRegion = reg;
      }
      const bg = TB.bgById(b.doc.bg).color ? b.doc.bg : 'white';
      TB.drawThumb(ctx, els, bg, reg.r, reg.scale, () => this.scheduleOverview());
      // Drawings far apart become smaller than a pixel: mark each one so it can always be found.
      for (const el of els.length > 3000 ? els.slice(-3000) : els) {
        const bb = TB.bbox(el);
        const w = bb.w * reg.scale, h = bb.h * reg.scale;
        if (w >= 4 && h >= 4) continue;
        const cx = (bb.x - reg.r.x) * reg.scale + w / 2, cy = (bb.y - reg.r.y) * reg.scale + h / 2;
        ctx.fillStyle = el.type === 'image' ? '#64748b' : el.color || '#64748b';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dim everything outside the visible area and outline where you are.
      const vx = (vis.x - reg.r.x) * reg.scale, vy = (vis.y - reg.r.y) * reg.scale;
      const vw = vis.w * reg.scale, vh = vis.h * reg.scale;
      ctx.fillStyle = 'rgba(15,23,42,0.12)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(vx, vy, vw, vh);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(vx, vy, Math.max(4, vw), Math.max(4, vh));
      if (!content) {
        ctx.fillStyle = TB.bgById(bg).dark ? '#cbd5e1' : '#64748b';
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Empty board', W / 2, H / 2 + 4);
      }
    }
    get board() { return this._board; }
    set board(b) { this._board = b; }
    get iconHtml() { return icon('board', 16); }

    static async fromFile(filePath) {
      const f = await window.api.readText(filePath);
      const data = JSON.parse(f.text);
      if (!data.pages) throw new Error('Not a TeachBoard file');
      return new BoardTab({ doc: { bg: data.bg || 'white', pages: data.pages }, filePath, title: f.name.replace(/\.tboard$/i, '') });
    }

    serialize() {
      return JSON.stringify({ app: 'TeachBoard', version: 2, bg: this.board.doc.bg, pages: this.board.doc.pages });
    }
    scheduleAutosave() {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => this.autosaveNow(), 1500);
    }
    autosaveNow() {
      clearTimeout(this.autosaveTimer);
      return window.api.autosaveWrite(this.autosaveId, this.serialize());
    }
    // What session restore needs to bring this tab back.
    sessionInfo() {
      return { type: 'board', autosaveId: this.autosaveId, filePath: this.filePath, title: this.title, dirty: this.dirty, page: this.board.pageIndex, view: { ...this.board.view } };
    }

    updateBar() {
      const b = this.board;
      this.el.querySelector('.pages').textContent = `${b.pageIndex + 1} / ${b.doc.pages.length}`;
      this.el.querySelector('.zoom').textContent = Math.round(b.view.zoom * 100) + '%';
      this.el.querySelector('[data-act=snap]').classList.toggle('on', !!Tools.snap);
      this.el.querySelector('[data-act=minimap]').classList.toggle('on', !!Tools.minimap);
    }

    async act(act, el) {
      const b = this.board;
      switch (act) {
        case 'zoomin': b.zoomBy(1.25); break;
        case 'zoomout': b.zoomBy(0.8); break;
        case 'zoomreset': b.resetView(); break;
        case 'fit': b.fitContent(); break;
        case 'minimap': Tools.set({ minimap: !Tools.minimap }); break;
        case 'prev': this.gotoPage(b.pageIndex - 1); break;
        case 'next': this.gotoPage(b.pageIndex + 1); break;
        case 'addpage': b.addPage(); this.updateBar(); break;
        case 'delpage':
          if (b.els.length && !confirm('Delete this page and everything on it?')) return;
          b.deletePage(); this.updateBar();
          break;
        case 'save': this.save(); break;
        case 'snap':
          Tools.set({ snap: !Tools.snap });
          App.toast(Tools.snap ? 'Snap to grid ON — shapes line up neatly' : 'Snap to grid OFF');
          break;
        case 'bg': this.showBgMenu(el); break;
        case 'export': this.showExportMenu(el); break;
      }
    }
    gotoPage(i) {
      if (i >= this.board.doc.pages.length) { this.board.addPage(); }
      else this.board.setPage(i);
      this.updateBar();
    }

    showBgMenu(anchor) {
      const pop = App.popover(anchor, 'up');
      pop.innerHTML = `<div class="pop-title">Page style</div><div class="pop-row"></div>`;
      const row = pop.querySelector('.pop-row');
      for (const bg of BACKGROUNDS.filter((x) => !x.hidden)) {
        const c = h(`<button class="chip ${this.board.doc.bg === bg.id ? 'active' : ''}"></button>`);
        c.textContent = bg.name;
        c.onclick = () => { this.board.setBackground(bg.id); App.adaptColorToBackground(bg); App.closePopover(); };
        row.appendChild(c);
      }
    }

    showExportMenu(anchor) {
      const pop = App.popover(anchor, 'up');
      pop.innerHTML = `<div class="menu">
        <button data-x="png">${icon('image', 18)}Save this page as PNG image</button>
        <button data-x="view">${icon('fullscreen', 18)}Save what's on screen as PNG</button>
        <button data-x="pdf">${icon('pdf', 18)}Save all pages as PDF</button>
        <button data-x="clip">${icon('copy', 18)}Copy this page (paste in Word / PowerPoint)</button>
        <hr/>
        <button data-x="saveas">${icon('save', 18)}Save board as…</button>
      </div>`;
      pop.onclick = (e) => {
        const x = e.target.closest('[data-x]');
        if (!x) return;
        App.closePopover();
        if (x.dataset.x === 'png') this.exportPng();
        if (x.dataset.x === 'view') this.exportPng(true);
        if (x.dataset.x === 'pdf') this.exportPdf();
        if (x.dataset.x === 'clip') this.copyPage();
        if (x.dataset.x === 'saveas') this.save(true);
      };
    }

    async save(saveAs = false) {
      this.board.commitText();
      const r = await window.api.saveText({ filePath: this.filePath, text: this.serialize(), defaultName: this.title + '.tboard', saveAs });
      if (!r) return false;
      this.filePath = r.path;
      this.setTitle(r.name.replace(/\.tboard$/i, ''));
      this.setDirty(false);
      this.autosaveNow();
      App.saveSession();
      App.toast('Saved ' + r.name);
      return true;
    }

    // Runs an export with a progress toast; any failure is shown instead of silently doing nothing.
    async runExport(what, fn) {
      this.board.commitText();
      const busy = App.toast(`Preparing ${what}…`, 'info', null, 0);
      try {
        await fn();
      } catch (err) {
        console.error(err);
        App.toast(`Could not save the ${what}: ${err.message || err}`, 'error');
      } finally {
        busy.remove();
      }
    }

    exportPng(viewOnly = false) {
      return this.runExport('image', async () => {
        const c = viewOnly ? await this.board.exportView() : await this.board.exportPage();
        if (!c) { App.toast('This page is empty — draw something first', 'error'); return; }
        const blob = await TB.canvasToPng(c);
        const p = await window.api.saveBinary({
          data: new Uint8Array(await blob.arrayBuffer()),
          defaultName: `${this.title} - page ${this.board.pageIndex + 1}.png`, filterName: 'PNG image', ext: 'png',
        });
        if (p) App.toast('Image saved: ' + p);
      });
    }

    copyPage() {
      return this.runExport('copy', async () => {
        const c = await this.board.exportPage();
        if (!c) { App.toast('This page is empty', 'error'); return; }
        const blob = await TB.canvasToPng(c);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        App.toast('Page copied — paste it with Ctrl+V');
      });
    }

    exportPdf() {
      return this.runExport('PDF', async () => {
        const { PDFDocument } = window.PDFLib;
        const pdf = await PDFDocument.create();
        let count = 0;
        for (let i = 0; i < this.board.doc.pages.length; i++) {
          const c = await this.board.exportPage(i, 2);
          if (!c) continue;
          const png = await pdf.embedPng(new Uint8Array(await (await TB.canvasToPng(c)).arrayBuffer()));
          // Every page is A4-landscape wide; height follows the drawing.
          const w = 842, ph = Math.min(14400, (c.height * w) / c.width);
          const page = pdf.addPage([w, ph]);
          page.drawImage(png, { x: 0, y: 0, width: w, height: ph });
          count++;
        }
        if (!count) { App.toast('The board is empty — draw something first', 'error'); return; }
        const p = await window.api.saveBinary({ data: await pdf.save(), defaultName: this.title + '.pdf', filterName: 'PDF document', ext: 'pdf' });
        if (p) App.toast(`PDF saved (${count} page${count > 1 ? 's' : ''}): ${p}`);
      });
    }

    setupDrop(wrap) {
      let hint = null;
      const showHint = (on) => {
        if (on && !hint) { hint = h('<div class="drop-hint">Drop to add to the whiteboard</div>'); wrap.appendChild(hint); }
        if (!on && hint) { hint.remove(); hint = null; }
      };
      wrap.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; showHint(true); });
      wrap.addEventListener('dragleave', (e) => { if (!wrap.contains(e.relatedTarget)) showHint(false); });
      wrap.addEventListener('drop', async (e) => {
        e.preventDefault();
        showHint(false);
        const rect = this.board.canvas.getBoundingClientRect();
        const at = this.board.toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const files = [...e.dataTransfer.files];
        if (files.length) {
          for (const f of files) {
            const p = window.api.getPathForFile(f);
            if (/\.(pdf|tboard)$/i.test(f.name) && p) App.openPath(p);
            else if (f.type.startsWith('image/')) await this.board.addImage(await readAsDataURL(f), at);
          }
          return;
        }
        let url = e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'));
        const html = e.dataTransfer.getData('text/html');
        const m = html && /<img[^>]+src="([^"]+)"/i.exec(html);
        if (m) url = m[1].replace(/&amp;/g, '&');
        if (url) {
          try { await this.board.addImage(await window.api.fetchImage(url), at); }
          catch { App.toast('Could not load that image', 'error'); }
          return;
        }
        const text = e.dataTransfer.getData('text/plain');
        if (text) this.board.addText(text);
      });
    }

    async canClose() {
      const hasContent = this.board.doc.pages.some((p) => p.elements.length);
      if (!this.dirty || !hasContent) return true;
      return confirm(`"${this.title}" has unsaved changes.\n\nClose it without saving?`);
    }
    destroy() {
      clearTimeout(this.autosaveTimer);
      window.api.autosaveDelete(this.autosaveId);
      this.board.destroy();
      super.destroy();
    }
  }

  // At most this many PDF pages keep their rendered images; pages further away are freed
  // (long tutes used to fill memory until the window went white).
  const PDF_MAX_RENDERED = 8;
  const PDF_MAX_PAGE_PIXELS = 6e6;

  // ======================================================================
  class PdfTab extends TabBase {
    constructor(filePath, restore = {}) {
      super('pdf', filePath.split(/[\\/]/).pop());
      this.filePath = filePath;
      this.restoreState = restore;
      this.zoom = 1;
      this.pages = [];
      this.pageDocs = [];
      this.lastBoard = null;
      this.visible = new Set();
      this.rendered = new Set();
      this.el.innerHTML = `
        <div class="pdf-bar">
          ${btn('prev', 'chevleft', 'Previous page')}
          <span class="readout"><input class="page-input" value="1" /> / <span class="page-count">–</span></span>
          ${btn('next', 'chevright', 'Next page')}
          <div class="bar-sep"></div>
          ${btn('zoomout', 'minus', 'Zoom out (Ctrl + mouse wheel)')}
          <span class="readout zoom" style="min-width:48px;justify-content:center">100%</span>
          ${btn('zoomin', 'plus', 'Zoom in')}
          ${btn('fitwidth', 'fit', 'Fit width', 'Width')}
          ${btn('fitpage', 'board', 'Fit whole page', 'Page')}
          ${btn('refresh', 'reload', 'Refresh the pages (if they look blank)', 'Refresh')}
          <div class="spacer"></div>
          ${btn('toboard', 'copy', 'Copy this page (with your writing) to a whiteboard', 'To board')}
          ${btn('clearpage', 'trash', 'Remove all writing on this page')}
          ${btn('export', 'download', 'Save a copy of the PDF with your writing', 'Save PDF')}
        </div>
        <div class="pdf-scroll" tabindex="0"><div class="pdf-pages"><div class="pdf-loading">Opening…</div></div></div>`;
      this.scroll = this.el.querySelector('.pdf-scroll');
      this.pagesEl = this.el.querySelector('.pdf-pages');
      this.el.querySelector('.pdf-bar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) this.act(b.dataset.act);
      });
      const pin = this.el.querySelector('.page-input');
      pin.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { this.gotoPage(+pin.value - 1); pin.blur(); } });
      this.scroll.addEventListener('scroll', () => this.onScroll());
      this.scroll.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.004));
      }, { passive: false });
      this.load();
    }
    get iconHtml() { return icon('pdf', 16); }
    get board() {
      if (this.lastBoard && this.pages.some((p) => p.board === this.lastBoard)) return this.lastBoard;
      const p = this.pages[this.current || 0];
      return p ? this.ensureBoard(this.current || 0) : null;
    }
    get usesTools() { return true; }

    async load() {
      try {
        const f = await window.api.readFile(this.filePath);
        this.bytes = f.data.slice();
        pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';
        this.pdf = await pdfjsLib.getDocument({ data: f.data }).promise;
        const saved = await window.api.annotLoad(this.filePath);
        this.pagesEl.innerHTML = '';
        this.io = new IntersectionObserver((entries) => this.onIntersect(entries), { root: this.scroll, rootMargin: '50% 0px' });
        for (let i = 0; i < this.pdf.numPages; i++) {
          const page = await this.pdf.getPage(i + 1);
          const vp = page.getViewport({ scale: 1 });
          const div = h(`<div class="pdf-page" data-i="${i}"><canvas class="pdf-canvas" width="0" height="0"></canvas><canvas class="ink" width="0" height="0"></canvas><div class="page-num">${i + 1}</div></div>`);
          this.pagesEl.appendChild(div);
          this.pages.push({ i, page, w: vp.width, h: vp.height, div, pdfCanvas: div.children[0], inkCanvas: div.children[1], board: null, renderedZoom: 0 });
          const els = (saved && saved.pages && saved.pages[i]) || [];
          this.pageDocs.push({ bg: 'transparent', pages: [{ elements: els }] });
        }
        this.el.querySelector('.page-count').textContent = this.pdf.numPages;
        const r = this.restoreState;
        if (r.zoom) { this.zoom = r.zoom; this.layoutPages(); } else this.fitWidth();
        if (r.page) this.gotoPage(r.page);
        this.pages.forEach((p) => this.io.observe(p.div));
        if (saved && saved.pages && saved.pages.some((p) => p && p.length) && !r.page) App.toast('Your earlier writing on this PDF was restored');
      } catch (err) {
        console.error(err);
        this.pagesEl.innerHTML = `<div class="pdf-loading">Could not open this PDF: ${String(err.message || err).replace(/</g, '&lt;')}</div>`;
      }
    }

    layoutPages() {
      for (const p of this.pages) {
        p.div.style.width = Math.round(p.w * this.zoom) + 'px';
        p.div.style.height = Math.round(p.h * this.zoom) + 'px';
        if (p.board) p.board.setView({ x: 0, y: 0, zoom: this.zoom });
      }
      this.el.querySelector('.zoom').textContent = Math.round(this.zoom * 100) + '%';
      this.visible.forEach((i) => this.renderPage(i));
    }

    setZoom(z) {
      z = Math.min(5, Math.max(0.25, z));
      const s = this.scroll;
      const ry = (s.scrollTop + s.clientHeight / 2) / (s.scrollHeight || 1);
      const rx = (s.scrollLeft + s.clientWidth / 2) / (s.scrollWidth || 1);
      this.zoom = z;
      this.layoutPages();
      s.scrollTop = ry * s.scrollHeight - s.clientHeight / 2;
      s.scrollLeft = rx * s.scrollWidth - s.clientWidth / 2;
    }
    fitWidth() {
      if (!this.pages.length) return;
      const maxW = Math.max(...this.pages.map((p) => p.w));
      const avail = (this.scroll.clientWidth || 900) - 40;
      this.zoom = Math.min(5, Math.max(0.25, avail / maxW));
      this.layoutPages();
    }
    fitPage() {
      const p = this.pages[this.current || 0];
      if (!p) return;
      const z = Math.min((this.scroll.clientWidth - 40) / p.w, (this.scroll.clientHeight - 30) / p.h);
      this.zoom = Math.min(5, Math.max(0.25, z));
      this.layoutPages();
      this.gotoPage(p.i);
    }

    onIntersect(entries) {
      for (const e of entries) {
        const i = +e.target.dataset.i;
        if (e.isIntersecting) { this.visible.add(i); this.renderPage(i); this.ensureBoard(i); }
        else this.visible.delete(i);
      }
      this.trimPages();
    }

    // Frees the pages furthest from the screen once too many are held in memory.
    trimPages() {
      if (this.rendered.size <= PDF_MAX_RENDERED) return;
      const cur = this.current || 0;
      const far = [...this.rendered].filter((i) => !this.visible.has(i)).sort((a, b) => Math.abs(b - cur) - Math.abs(a - cur));
      while (this.rendered.size > PDF_MAX_RENDERED && far.length) this.freePage(far.shift());
    }
    freePage(i) {
      const p = this.pages[i];
      if (p.task) { try { p.task.cancel(); } catch {} p.task = null; }
      p.pdfCanvas.width = p.pdfCanvas.height = 0;
      p.renderedZoom = 0;
      if (p.board) {
        if (p.board === this.lastBoard) this.lastBoard = null;
        p.board.release();
      }
      try { p.page.cleanup(); } catch {}
      this.rendered.delete(i);
    }
    // Re-draws every page from scratch (for when something looks blank or wrong).
    refresh() {
      [...this.rendered].forEach((i) => this.freePage(i));
      this.visible.forEach((i) => { this.renderPage(i); this.ensureBoard(i); });
      App.toast('Pages refreshed');
    }

    async renderPage(i) {
      const p = this.pages[i];
      const dpr = window.devicePixelRatio || 1;
      const z = this.zoom;
      if (p.renderedZoom === z) return;
      p.renderedZoom = z;
      this.rendered.add(i);
      if (p.task) { try { p.task.cancel(); } catch {} }
      // Very high zoom renders at a capped resolution; CSS stretches it to the page size.
      const scale = Math.min(z * dpr, Math.sqrt(PDF_MAX_PAGE_PIXELS / (p.w * p.h)));
      const vp = p.page.getViewport({ scale });
      const off = document.createElement('canvas');
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      p.task = p.page.render({ canvasContext: off.getContext('2d'), viewport: vp });
      try {
        await p.task.promise;
        if (p.renderedZoom !== z) return;
        // Swap in the finished render to avoid flashing a blank page while zooming.
        p.pdfCanvas.width = off.width;
        p.pdfCanvas.height = off.height;
        p.pdfCanvas.getContext('2d').drawImage(off, 0, 0);
      } catch (err) {
        if (err && err.name !== 'RenderingCancelledException') console.error(err);
      } finally {
        off.width = off.height = 0;
        p.task = null;
      }
    }

    ensureBoard(i) {
      const p = this.pages[i];
      if (p.board) { p.board.restore(); return p.board; }
      p.board = new Board(p.inkCanvas, {
        mode: 'fixed',
        doc: this.pageDocs[i],
        onChange: () => this.scheduleSave(),
        onActivate: (b) => { this.lastBoard = b; App.setActiveBoard(b); },
        onPanBy: (dx, dy) => { this.scroll.scrollLeft += dx; this.scroll.scrollTop += dy; },
      });
      p.board.setView({ x: 0, y: 0, zoom: this.zoom });
      return p.board;
    }

    scheduleSave() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveAnnotations(), 700);
    }
    saveAnnotations() {
      clearTimeout(this.saveTimer);
      if (!this.pageDocs.length) return;
      return window.api.annotSave(this.filePath, { version: 1, pages: this.pageDocs.map((d) => d.pages[0].elements) });
    }

    onScroll() {
      if (this.scrollRaf) return;
      this.scrollRaf = requestAnimationFrame(() => {
        this.scrollRaf = 0;
        const mid = this.scroll.scrollTop + this.scroll.clientHeight / 3;
        let cur = 0;
        for (const p of this.pages) { if (p.div.offsetTop <= mid) cur = p.i; else break; }
        this.current = cur;
        const pin = this.el.querySelector('.page-input');
        if (document.activeElement !== pin) pin.value = cur + 1;
      });
    }
    gotoPage(i) {
      const p = this.pages[Math.max(0, Math.min(this.pages.length - 1, i))];
      if (!p) return;
      this.scroll.scrollTop = p.div.offsetTop - 12;
      this.current = p.i;
      this.el.querySelector('.page-input').value = p.i + 1;
    }

    act(a) {
      switch (a) {
        case 'prev': this.gotoPage((this.current || 0) - 1); break;
        case 'next': this.gotoPage((this.current || 0) + 1); break;
        case 'zoomin': this.setZoom(this.zoom * 1.2); break;
        case 'zoomout': this.setZoom(this.zoom / 1.2); break;
        case 'fitwidth': this.fitWidth(); break;
        case 'fitpage': this.fitPage(); break;
        case 'refresh': this.refresh(); break;
        case 'clearpage': { const b = this.ensureBoard(this.current || 0); b.clearPage(); break; }
        case 'toboard': this.copyPageToBoard(); break;
        case 'export': this.exportPdf(); break;
      }
    }
    clear() { this.act('clearpage'); }

    sessionInfo() { return { type: 'pdf', path: this.filePath, page: this.current || 0, zoom: this.zoom }; }

    async renderPageImage(i, scale = 2) {
      const p = this.pages[i];
      const vp = p.page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      await p.page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      await TB.renderElementsTo(c, this.pageDocs[i].pages[0].elements, scale);
      return c;
    }
    async copyPageToBoard() {
      const c = await this.renderPageImage(this.current || 0, 2);
      App.sendImageToBoard(c.toDataURL('image/png'), `Page ${(this.current || 0) + 1} copied to`);
    }

    async exportPdf() {
      const { PDFDocument } = window.PDFLib;
      try {
        const doc = await PDFDocument.load(this.bytes, { ignoreEncryption: true });
        const pages = doc.getPages();
        for (let i = 0; i < this.pages.length; i++) {
          const els = this.pageDocs[i].pages[0].elements;
          if (!els.length || !pages[i]) continue;
          const p = this.pages[i];
          const c = document.createElement('canvas');
          c.width = Math.ceil(p.w * 2);
          c.height = Math.ceil(p.h * 2);
          await TB.renderElementsTo(c, els, 2);
          const png = await doc.embedPng(new Uint8Array(await (await TB.canvasToPng(c)).arrayBuffer()));
          c.width = c.height = 0;
          const box = pages[i].getCropBox();
          pages[i].drawImage(png, { x: box.x, y: box.y, width: box.width, height: box.height });
        }
        const name = this.title.replace(/\.pdf$/i, '') + ' (annotated).pdf';
        const out = await window.api.saveBinary({ data: await doc.save(), defaultName: name, filterName: 'PDF document', ext: 'pdf' });
        if (out) App.toast('Annotated PDF saved');
      } catch (err) {
        console.error(err);
        App.toast('Could not save PDF: ' + err.message, 'error');
      }
    }

    destroy() {
      this.saveAnnotations();
      if (this.io) this.io.disconnect();
      this.pages.forEach((p) => p.board && p.board.destroy());
      if (this.pdf) this.pdf.destroy();
      super.destroy();
    }
  }

  // ======================================================================
  class WebTab extends TabBase {
    constructor(url) {
      super('web', 'Loading…');
      this.favicon = null;
      this.el.innerHTML = `
        <div class="web-bar">
          ${btn('back', 'back', 'Back (Alt ←)')}
          ${btn('forward', 'forward', 'Forward (Alt →)')}
          ${btn('reload', 'reload', 'Reload (F5)')}
          <input class="address" spellcheck="false" placeholder="Search Google or type a web address" />
          ${btn('zoomout', 'minus', 'Make page smaller')}
          <span class="readout zoom" style="min-width:44px;text-align:center;color:var(--muted);font-size:13px" title="Page zoom">100%</span>
          ${btn('zoomin', 'plus', 'Make page bigger (good for projector)')}
          <div class="bar-sep"></div>
          ${btn('google', 'google', 'Google search', '')}
          ${btn('images', 'image', 'Google Images (search what is typed in the address bar)', '')}
          ${btn('youtube', 'youtube', 'YouTube (search what is typed in the address bar)', '')}
          <div class="bar-sep"></div>
          ${btn('annotate', 'pen', 'Draw on top of this page / video', 'Draw')}
          ${btn('snapshot', 'camera', 'Snapshot this page to the whiteboard', 'To board')}
        </div>
        <div class="web-body">
          <div class="web-progress" style="width:0"></div>
          <webview partition="persist:web" allowpopups></webview>
          <canvas class="web-ink" hidden></canvas>
        </div>`;
      this.wv = this.el.querySelector('webview');
      this.addr = this.el.querySelector('.address');
      this.progress = this.el.querySelector('.web-progress');
      this.inkCanvas = this.el.querySelector('.web-ink');
      this.url = url || GOOGLE;
      this.wv.setAttribute('src', this.url);
      this.zoomFactor = 1;
      this.ready = false;

      this.el.querySelector('.web-bar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) this.act(b.dataset.act);
      });
      this.addr.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { this.navigate(toUrl(this.addr.value)); this.wv.focus(); }
        if (e.key === 'Escape') { this.addr.value = this.url || ''; this.addr.blur(); }
      });
      this.addr.addEventListener('focus', () => this.addr.select());

      const wv = this.wv;
      wv.addEventListener('dom-ready', () => { this.ready = true; wv.setZoomFactor(this.zoomFactor); this.updateNav(); });
      wv.addEventListener('did-start-loading', () => { this.progress.style.opacity = 1; this.progress.style.width = '30%'; });
      wv.addEventListener('did-stop-loading', () => {
        this.progress.style.width = '100%';
        setTimeout(() => { this.progress.style.opacity = 0; this.progress.style.width = '0'; }, 300);
        this.updateNav();
      });
      wv.addEventListener('page-title-updated', (e) => this.setTitle(e.title));
      wv.addEventListener('page-favicon-updated', (e) => { this.favicon = e.favicons && e.favicons[0]; App.renderTabs(); });
      const onNav = (e) => { if (e.isMainFrame === false) return; this.url = e.url; if (document.activeElement !== this.addr) this.addr.value = e.url; this.updateNav(); };
      wv.addEventListener('did-navigate', onNav);
      wv.addEventListener('did-navigate-in-page', onNav);
      wv.addEventListener('focus', () => App.focusTab(this));
      wv.addEventListener('did-fail-load', (e) => {
        if (e.errorCode === -3 || !e.isMainFrame) return; // -3 = aborted (normal on redirects)
        this.setTitle('Page not available');
      });
    }
    get iconHtml() { return this.favicon ? `<img src="${this.favicon.replace(/"/g, '')}" onerror="this.replaceWith(document.createTextNode(''))">` : icon('globe', 16); }
    get board() { return this.inkOn ? this.inkBoard : null; }
    get usesTools() { return !!this.inkOn; }
    sessionInfo() { return { type: 'web', url: this.url, title: this.title }; }

    navigate(url) { this.ready ? this.wv.loadURL(url) : this.wv.setAttribute('src', url); }
    updateNav() {
      if (!this.ready) return;
      this.el.querySelector('[data-act=back]').disabled = !this.wv.canGoBack();
      this.el.querySelector('[data-act=forward]').disabled = !this.wv.canGoForward();
    }
    setZoom(f) {
      this.zoomFactor = Math.min(3, Math.max(0.5, Math.round(f * 10) / 10));
      if (this.ready) this.wv.setZoomFactor(this.zoomFactor);
      this.el.querySelector('.zoom').textContent = Math.round(this.zoomFactor * 100) + '%';
    }

    act(a) {
      const q = this.addr.value.trim();
      const typed = q && q !== this.url ? q : '';
      switch (a) {
        case 'back': this.wv.goBack(); break;
        case 'forward': this.wv.goForward(); break;
        case 'reload': this.wv.reload(); break;
        case 'zoomin': this.setZoom(this.zoomFactor + 0.1); break;
        case 'zoomout': this.setZoom(this.zoomFactor - 0.1); break;
        case 'google': this.navigate(typed ? searchUrl(typed) : GOOGLE); break;
        case 'images': this.navigate(imagesUrl(typed)); break;
        case 'youtube': this.navigate(youtubeUrl(typed)); break;
        case 'annotate': this.toggleInk(); break;
        case 'snapshot': this.snapshot(); break;
      }
    }

    toggleInk(on = !this.inkOn) {
      this.inkOn = on;
      this.inkCanvas.hidden = !on;
      this.el.querySelector('[data-act=annotate]').classList.toggle('on', on);
      const body = this.el.querySelector('.web-body');
      if (on) {
        if (!this.inkBoard) {
          this.inkBoard = new Board(this.inkCanvas, {
            mode: 'fixed',
            doc: { bg: 'transparent', pages: [{ elements: [] }] },
            onActivate: (b) => App.setActiveBoard(b),
          });
        }
        this.inkBoard.resize();
        if (!['pen', 'highlighter', 'eraser', 'laser', 'shape', 'text', 'select'].includes(Tools.tool) || Tools.tool === 'select') Tools.set({ tool: 'pen' });
        this.hint = h(`<div class="web-ink-hint">${icon('pen', 16)} Drawing mode — the page is paused for clicks <button>Clear</button><button>Done</button></div>`);
        const [clearBtn, doneBtn] = this.hint.querySelectorAll('button');
        clearBtn.onclick = () => this.inkBoard.clearPage();
        doneBtn.onclick = () => this.toggleInk(false);
        body.appendChild(this.hint);
        App.setActiveBoard(this.inkBoard);
      } else {
        if (this.inkBoard) { this.inkBoard.cancelText(); this.inkBoard.doc.pages[0].elements = []; this.inkBoard.undoStack = []; this.inkBoard.invalidate(); }
        if (this.hint) { this.hint.remove(); this.hint = null; }
      }
      App.refreshRail();
    }

    async snapshot() {
      if (!this.ready) return;
      const data = await window.api.captureWebContents(this.wv.getWebContentsId());
      if (!data) return;
      let url = data;
      if (this.inkOn && this.inkBoard && this.inkBoard.els.length) {
        const img = await TB.loadImage(data);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.drawImage(this.inkCanvas, 0, 0, c.width, c.height);
        url = c.toDataURL('image/png');
      }
      App.sendImageToBoard(url, 'Snapshot added to');
    }

    destroy() { if (this.inkBoard) this.inkBoard.destroy(); super.destroy(); }
  }

  window.Tabs = { HomeTab, BoardTab, PdfTab, WebTab, toUrl, imagesUrl, youtubeUrl };
})();
