/* Screen ink: a transparent always-on-top window for writing over any program. */
(function () {
  const { Board, Tools } = TB;
  const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#1d1d1f', '#ffffff'];
  Tools.set({ tool: 'pen', color: COLORS[0], size: 4 });

  const board = new Board(document.getElementById('ink'), {
    mode: 'fixed',
    doc: { bg: 'transparent', pages: [{ elements: [] }] },
  });

  const bar = document.getElementById('bar');
  const hint = document.getElementById('mouseHint');
  let mouseMode = false;
  let backdrop = 'tint';

  const b = (act, ic, title) => `<button class="b" data-act="${act}" title="${title}">${icon(ic, 20)}</button>`;
  bar.innerHTML = `
    <div id="grip" title="Drag to move">⋮⋮</div>
    ${b('mouse', 'mouse', 'Mouse mode — click through to programs underneath')}
    ${b('pen', 'pen', 'Pen')}
    ${b('highlighter', 'highlighter', 'Highlighter')}
    ${b('eraser', 'eraser', 'Eraser')}
    ${b('laser', 'laser', 'Laser pointer')}
    ${b('text', 'text', 'Text')}
    ${b('arrow', 'forward', 'Arrow')}
    ${b('rect', 'shapes', 'Rectangle')}
    <div class="sep"></div>
    ${COLORS.map((c) => `<button class="sw" data-color="${c}" style="background:${c}"></button>`).join('')}
    <div class="sep"></div>
    ${b('thin', 'minus', 'Thinner')}
    ${b('thick', 'plus', 'Thicker')}
    ${b('undo', 'undo', 'Undo (Ctrl Z)')}
    ${b('clear', 'trash', 'Clear all')}
    ${b('backdrop', 'board', 'Background: transparent / white / dark')}
    <div class="sep"></div>
    <button class="b close" data-act="close" title="Close screen ink (Esc)">${icon('close', 20)}</button>`;

  function setMouseMode(on) {
    mouseMode = on;
    hint.hidden = !on;
    document.getElementById('ink').style.pointerEvents = on ? 'none' : 'auto';
    window.api.inkPassthrough(on);
    refresh();
  }

  function refresh() {
    const shapeTool = Tools.tool === 'shape' ? (Tools.shape === 'arrow' ? 'arrow' : 'rect') : null;
    bar.querySelectorAll('[data-act]').forEach((el) => {
      const a = el.dataset.act;
      el.classList.toggle('on', mouseMode ? a === 'mouse' : a === Tools.tool || a === shapeTool);
    });
    bar.querySelectorAll('[data-color]').forEach((el) => el.classList.toggle('on', el.dataset.color === Tools.color));
  }

  bar.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) { Tools.set({ color: sw.dataset.color }); if (mouseMode) setMouseMode(false); refresh(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    const tool = (t, extra = {}) => { Tools.set({ tool: t, ...extra }); if (mouseMode) setMouseMode(false); };
    switch (a) {
      case 'mouse': setMouseMode(!mouseMode); break;
      case 'pen': case 'highlighter': case 'eraser': case 'laser': case 'text': tool(a); break;
      case 'arrow': tool('shape', { shape: 'arrow' }); break;
      case 'rect': tool('shape', { shape: 'rect' }); break;
      case 'thin': Tools.set({ size: Math.max(1, Tools.size - 2) }); break;
      case 'thick': Tools.set({ size: Math.min(40, Tools.size + 2) }); break;
      case 'undo': board.undo(); break;
      case 'clear': board.clearPage(); break;
      case 'backdrop': {
        const order = ['tint', 'whiteboard', 'blackboard'];
        backdrop = order[(order.indexOf(backdrop) + 1) % order.length];
        document.body.className = backdrop;
        if (backdrop === 'blackboard' && Tools.color === '#1d1d1f') Tools.set({ color: '#ffffff' });
        if (backdrop === 'whiteboard' && Tools.color === '#ffffff') Tools.set({ color: '#1d1d1f' });
        break;
      }
      case 'close': window.api.inkClose(); break;
    }
    refresh();
  });
  Tools.on((p) => { if ('tool' in p) board.updateCursor(); refresh(); });

  // In mouse mode the window ignores clicks; re-enable them while the pointer is over the toolbar.
  bar.addEventListener('mouseenter', () => { if (mouseMode) window.api.inkPassthrough(false); });
  bar.addEventListener('mouseleave', () => { if (mouseMode) window.api.inkPassthrough(true); });

  // Drag the toolbar.
  const grip = document.getElementById('grip');
  grip.addEventListener('pointerdown', (e) => {
    const r = bar.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => {
      bar.style.transform = 'none';
      bar.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + 'px';
      bar.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + 'px';
    };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') window.api.inkClose();
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) board.undo();
    if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) board.redo();
    if (e.key === 'Delete') board.clearPage();
  });

  refresh();
})();
