/* Floating classroom widgets: countdown timer / stopwatch, spotlight, random student picker. */
(function () {
  function makeWidget(title, iconName, bodyHtml, onClose) {
    const w = document.createElement('div');
    w.className = 'widget';
    w.innerHTML = `<div class="widget-head">${icon(iconName, 16)}<span>${title}</span><button class="icon-btn" title="Close">${icon('close', 16)}</button></div>${bodyHtml}`;
    w.style.right = '24px';
    w.style.top = '90px';
    document.body.appendChild(w);
    w.querySelector('.widget-head .icon-btn').onclick = () => { w.remove(); if (onClose) onClose(); };

    // drag by the header
    const head = w.querySelector('.widget-head');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = w.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev) => {
        w.style.right = 'auto';
        w.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox)) + 'px';
        w.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + 'px';
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
    return w;
  }

  function beep() {
    try {
      const ac = new AudioContext();
      [0, 0.35, 0.7].forEach((t) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880;
        o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.3);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.32);
      });
    } catch {}
  }

  // ---------------- Timer ----------------
  let timerEl = null;
  function openTimer() {
    if (timerEl) { timerEl.remove(); timerEl = null; return; }
    let mode = 'countdown', total = 5 * 60, remain = total, elapsed = 0, running = false, last = 0, raf = 0;
    timerEl = makeWidget('Timer', 'timer', `
      <div class="timer-body">
        <div class="pop-row"><button class="chip active" data-m="countdown">Countdown</button><button class="chip" data-m="stopwatch">Stopwatch</button></div>
        <div class="timer-display">05:00</div>
        <div class="pop-row presets">
          <button class="chip" data-p="60">1m</button><button class="chip" data-p="180">3m</button><button class="chip" data-p="300">5m</button>
          <button class="chip" data-p="600">10m</button><button class="chip" data-p="900">15m</button><button class="chip" data-p="1800">30m</button>
        </div>
        <div class="pop-row presets">
          <button class="chip" data-add="-60">− 1 min</button><button class="chip" data-add="60">+ 1 min</button>
        </div>
        <div class="pop-row">
          <button class="icon-btn on" data-a="start" style="width:90px">${icon('play', 18)}<span class="lbl">Start</span></button>
          <button class="icon-btn" data-a="reset" title="Reset">${icon('reset', 18)}</button>
        </div>
      </div>`, () => { cancelAnimationFrame(raf); timerEl = null; });
    const disp = timerEl.querySelector('.timer-display');
    const startBtn = timerEl.querySelector('[data-a=start]');
    const fmt = (s) => {
      s = Math.max(0, Math.ceil(s));
      const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
      return (hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm).padStart(2, '0')) + ':' + String(ss).padStart(2, '0');
    };
    const show = () => {
      disp.textContent = mode === 'countdown' ? fmt(remain) : fmt(elapsed);
      disp.classList.toggle('done', mode === 'countdown' && remain <= 0);
      startBtn.innerHTML = running ? `${icon('pause', 18)}<span class="lbl">Pause</span>` : `${icon('play', 18)}<span class="lbl">Start</span>`;
    };
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (mode === 'countdown') {
        remain -= dt;
        if (remain <= 0) { remain = 0; running = false; show(); beep(); return; }
      } else elapsed += dt;
      show();
      raf = requestAnimationFrame(tick);
    };
    timerEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.m) {
        mode = b.dataset.m;
        timerEl.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('active', x === b));
        timerEl.querySelectorAll('.presets').forEach((x) => (x.hidden = mode !== 'countdown'));
        running = false; cancelAnimationFrame(raf);
      }
      if (b.dataset.p) { total = remain = +b.dataset.p; }
      if (b.dataset.add) { remain = Math.max(0, remain + +b.dataset.add); total = Math.max(total, remain); }
      if (b.dataset.a === 'start') {
        if (mode === 'countdown' && remain <= 0) remain = total;
        running = !running;
        cancelAnimationFrame(raf);
        if (running) { last = performance.now(); raf = requestAnimationFrame(tick); }
      }
      if (b.dataset.a === 'reset') { running = false; cancelAnimationFrame(raf); remain = total; elapsed = 0; }
      show();
    });
    show();
  }

  // ---------------- Random student picker ----------------
  let pickerEl = null;
  function openPicker() {
    if (pickerEl) { pickerEl.remove(); pickerEl = null; return; }
    pickerEl = makeWidget('Pick a student', 'dice', `
      <div class="picker-body">
        <textarea placeholder="Type or paste student names, one per line"></textarea>
        <div class="picker-name"></div>
        <div class="pop-row">
          <button class="icon-btn on" data-a="pick" style="flex:1">${icon('dice', 18)}<span class="lbl">Pick random</span></button>
          <label style="font-size:12px;color:var(--muted);display:flex;gap:4px;align-items:center"><input type="checkbox" class="norepeat" checked/>No repeats</label>
        </div>
      </div>`, () => { pickerEl = null; });
    const ta = pickerEl.querySelector('textarea');
    const out = pickerEl.querySelector('.picker-name');
    try { ta.value = localStorage.getItem('tb-students') || ''; } catch {}
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    ta.addEventListener('input', () => { try { localStorage.setItem('tb-students', ta.value); } catch {} used.clear(); });
    const used = new Set();
    pickerEl.querySelector('[data-a=pick]').onclick = () => {
      const names = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!names.length) { out.textContent = 'Add names first'; return; }
      const noRep = pickerEl.querySelector('.norepeat').checked;
      let pool = noRep ? names.filter((n) => !used.has(n)) : names;
      if (!pool.length) { used.clear(); pool = names; }
      let n = 0;
      const spin = setInterval(() => {
        out.textContent = names[Math.floor(Math.random() * names.length)];
        if (++n > 14) {
          clearInterval(spin);
          const pick = pool[Math.floor(Math.random() * pool.length)];
          used.add(pick);
          out.textContent = '🎉 ' + pick;
        }
      }, 70);
    };
  }

  // ---------------- Spotlight ----------------
  let spot = null;
  function toggleSpotlight() {
    if (spot) { spot.remove(); spot = null; return; }
    let r = 160, x = innerWidth / 2, y = innerHeight / 2;
    spot = document.createElement('div');
    spot.id = 'spotlight';
    spot.innerHTML = '<button class="spot-close">Close spotlight (Esc) · scroll to resize</button>';
    const paint = () => {
      spot.style.background = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, rgba(0,0,0,.88) ${r + 3}px)`;
    };
    spot.addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; paint(); });
    spot.addEventListener('wheel', (e) => { r = Math.max(50, Math.min(700, r - e.deltaY * 0.4)); paint(); });
    spot.querySelector('.spot-close').onclick = toggleSpotlight;
    document.body.appendChild(spot);
    paint();
  }
  const spotlightOn = () => !!spot;

  window.Widgets = { openTimer, openPicker, toggleSpotlight, spotlightOn };
})();
