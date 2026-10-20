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
    constructor({ doc, filePath, title } = {}) {
      super('board', title || `Whiteboard ${++boardSeq}`);
      this.filePath = filePath || null;
      this.el.innerHTML = `
        <div class="canvas-wrap">
          <canvas class="board"></canvas>
          <div class="board-bars">
          <div class="floating-bar bar-bottom-left">
            ${btn('bg', 'background', 'Background / page style')}
            <div class="bar-sep"></div>
            ${btn('zoomout', 'minus', 'Zoom out (Ctrl -)')}
            <span class="readout zoom" data-act="zoomreset" title="Reset zoom (Ctrl 0)">100%</span>
            ${btn('zoomin', 'plus', 'Zoom in (Ctrl +)')}
            ${btn('fit', 'fit', 'Fit everything on screen')}
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
        </div>`;
      const canvas = this.el.querySelector('canvas');
      this.board = new Board(canvas, {
        mode: 'infinite',
        doc: doc || { bg: 'white', pages: [{ elements: [] }] },
        onChange: () => { this.setDirty(true); this.updateBar(); },
        onActivate: (b) => App.setActiveBoard(b),
        onView: () => this.updateBar(),
      });
      this._board = this.board;
      this.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) this.act(b.dataset.act, b);
      });
      this.setupDrop(this.el.querySelector('.canvas-wrap'));
      this.updateBar();
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

    updateBar() {
      const b = this.board;
      this.el.querySelector('.pages').textContent = `${b.pageIndex + 1} / ${b.doc.pages.length}`;
      this.el.querySelector('.zoom').textContent = Math.round(b.view.zoom * 100) + '%';
    }

    async act(act, el) {
      const b = this.board;
      switch (act) {
        case 'zoomin': b.zoomBy(1.25); break;
        case 'zoomout': b.zoomBy(0.8); break;
        case 'zoomreset': b.resetView(); break;
        case 'fit': b.fitContent(); break;
        case 'prev': this.gotoPage(b.pageIndex - 1); break;
        case 'next': this.gotoPage(b.pageIndex + 1); break;
        case 'addpage': b.addPage(); this.updateBar(); break;
        case 'delpage':
          if (b.els.length && !confirm('Delete this page and everything on it?')) return;
          b.deletePage(); this.updateBar();
          break;
        case 'save': this.save(); break;
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
        if (x.dataset.x === 'pdf') this.exportPdf();
        if (x.dataset.x === 'clip') this.copyPage();
        if (x.dataset.x === 'saveas') this.save(true);
      };
    }

    async save(saveAs = false) {
      this.board.commitText();
      const text = JSON.stringify({ app: 'TeachBoard', version: 1, bg: this.board.doc.bg, pages: this.board.doc.pages });
      const r = await window.api.saveText({ filePath: this.filePath, text, defaultName: this.title + '.tboard', saveAs });
      if (!r) return false;
      this.filePath = r.path;
      this.setTitle(r.name.replace(/\.tboard$/i, ''));
      this.setDirty(false);
      App.toast('Saved ' + r.name);
      return true;
    }

    async exportPng() {
      const c = await this.board.exportPage();
      if (!c) return App.toast('This page is empty', 'error');
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const p = await window.api.saveBinary({
        data: new Uint8Array(await blob.arrayBuffer()),
        defaultName: `${this.title} - page ${this.board.pageIndex + 1}.png`, filterName: 'PNG image', ext: 'png',
      });
      if (p) App.toast('Image saved');
    }

    async copyPage() {
      const c = await this.board.exportPage();
      if (!c) return App.toast('This page is empty', 'error');
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      App.toast('Page copied to clipboard');
    }

    async exportPdf() {
      const { PDFDocument } = window.PDFLib;
      const pdf = await PDFDocument.create();
      let count = 0;
      for (let i = 0; i < this.board.doc.pages.length; i++) {
        const c = await this.board.exportPage(i, 2);
        if (!c) continue;
        const png = await pdf.embedPng(c.toDataURL('image/png'));
        const page = pdf.addPage([c.width / 2, c.height / 2]);
        page.drawImage(png, { x: 0, y: 0, width: c.width / 2, height: c.height / 2 });
        count++;
      }
      if (!count) return App.toast('The board is empty', 'error');
      const p = await window.api.saveBinary({ data: await pdf.save(), defaultName: this.title + '.pdf', filterName: 'PDF document', ext: 'pdf' });
      if (p) App.toast(`PDF saved (${count} page${count > 1 ? 's' : ''})`);
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
    destroy() { this.board.destroy(); super.destroy(); }
  }

  // ======================================================================
  class PdfTab extends TabBase {
    constructor(filePath) {
      super('pdf', filePath.split(/[\\/]/).pop());
      this.filePath = filePath;
      this.zoom = 1;
      this.pages = [];
      this.pageDocs = [];
      this.lastBoard = null;
      this.visible = new Set();
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
        this.io = new IntersectionObserver((entries) => this.onIntersect(entries), { root: this.scroll, rootMargin: '600px 0px' });
        for (let i = 0; i < this.pdf.numPages; i++) {
          const page = await this.pdf.getPage(i + 1);
          const vp = page.getViewport({ scale: 1 });
          const div = h(`<div class="pdf-page" data-i="${i}"><canvas class="pdf-canvas"></canvas><canvas class="ink"></canvas><div class="page-num">${i + 1}</div></div>`);
          this.pagesEl.appendChild(div);
          this.pages.push({ i, page, w: vp.width, h: vp.height, div, pdfCanvas: div.children[0], inkCanvas: div.children[1], board: null, renderedZoom: 0 });
          const els = (saved && saved.pages && saved.pages[i]) || [];
          this.pageDocs.push({ bg: 'transparent', pages: [{ elements: els }] });
        }
        this.el.querySelector('.page-count').textContent = this.pdf.numPages;
        this.fitWidth();
        this.pages.forEach((p) => this.io.observe(p.div));
        if (saved && saved.pages && saved.pages.some((p) => p && p.length)) App.toast('Your earlier writing on this PDF was restored');
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
    }

    async renderPage(i) {
      const p = this.pages[i];
      const dpr = window.devicePixelRatio || 1;
      const z = this.zoom;
      if (p.renderedZoom === z) return;
      p.renderedZoom = z;
      if (p.task) { try { p.task.cancel(); } catch {} }
      const vp = p.page.getViewport({ scale: z * dpr });
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
      }
    }

    ensureBoard(i) {
      const p = this.pages[i];
      if (p.board) return p.board;
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
        case 'clearpage': { const b = this.ensureBoard(this.current || 0); b.clearPage(); break; }
        case 'toboard': this.copyPageToBoard(); break;
        case 'export': this.exportPdf(); break;
      }
    }
    clear() { this.act('clearpage'); }

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
          const png = await doc.embedPng(c.toDataURL('image/png'));
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
      this.wv.setAttribute('src', url || GOOGLE);
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
