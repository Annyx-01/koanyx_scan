// Koanyx Trac: runs on every page, does nothing until switched on.
(() => {
  if (window.__koanyxTrac) return;
  window.__koanyxTrac = true;

  const api = KT.api;
  const KEY = KT.keyFor(location.origin);
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[tabindex],[contenteditable]';
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let on = false, showHud = true, trailOn = false, started = false;
  let page = KT.EMPTY(), pending = KT.EMPTY(), dirty = false;
  let hud = null, timers = [], cleanups = [], depth = 0;

  // live mouse state
  const M = { x: null, y: null, lastMove: 0, lastT: 0, speed: 0, state: 'idle', since: Date.now(), over: 'nothing yet', outside: false, hist: [] };
  let trail = [], raf = 0;

  const bump = (k, n = 1) => { page[k] += n; pending[k] += n; dirty = true; };
  const dur = (ms) => ms < 10000 ? (ms / 1000).toFixed(1) + 's' : KT.fmtTime(ms);
  const friendly = (el) => {
    if (!(el instanceof Element)) return 'nothing';
    const t = el.tagName.toLowerCase();
    if (t === 'a') return 'a link';
    if (t === 'button' || el.getAttribute('role') === 'button') return 'a button';
    if (/^(input|textarea|select)$/.test(t)) return 'a form field';
    if (t === 'img' || t === 'svg' || t === 'video') return 'media';
    if (/^(p|h[1-6]|span|li|td|th|label|strong|em)$/.test(t)) return 'text';
    return 'empty space';
  };

  // ---------- heatmap data ----------
  let heatOn = false, heat = KT.emptyHeat(), heatPend = {}, heatPath = location.pathname;
  const cellOf = (x, y) => {
    const { COLS, ROWS } = KT.HEAT;
    const c = Math.min(COLS - 1, Math.max(0, Math.floor((x / window.innerWidth) * COLS)));
    const r = Math.min(ROWS - 1, Math.max(0, Math.floor((y / window.innerHeight) * ROWS)));
    return r * COLS + c;
  };
  const heatAdd = (i, dwell, visits) => {
    heat.dwell[i] += dwell; heat.visits[i] += visits;
    const p = heatPend[i] || (heatPend[i] = [0, 0]); p[0] += dwell; p[1] += visits; dirty = true;
  };
  async function loadHeat() {
    const k = KT.heatKey(location.origin, heatPath);
    try {
      const s = (await api.storage.local.get(k))[k], h = KT.emptyHeat();
      if (s) for (let i = 0; i < h.dwell.length; i++) { h.dwell[i] = s.dwell?.[i] || 0; h.visits[i] = s.visits?.[i] || 0; }
      for (const i of Object.keys(heatPend)) { h.dwell[i] += heatPend[i][0]; h.visits[i] += heatPend[i][1]; }
      heat = h;
    } catch (_) {}
  }

  // ---------- storage ----------
  async function flush() {
    if (!dirty) return;
    const add = pending; pending = KT.EMPTY();
    const hAdd = heatPend, hKey = KT.heatKey(location.origin, heatPath); heatPend = {};
    dirty = false;
    try {
      const got = await api.storage.local.get([KEY, hKey]);
      const cur = got[KEY] || KT.EMPTY();
      for (const k of Object.keys(add)) if (k !== 'since') cur[k] = (cur[k] || 0) + add[k];
      const out = { [KEY]: cur };
      const ids = Object.keys(hAdd);
      if (ids.length) {
        const h = got[hKey] || KT.emptyHeat();
        for (const i of ids) { h.dwell[i] += hAdd[i][0]; h.visits[i] += hAdd[i][1]; }
        out[hKey] = h;
      }
      await api.storage.local.set(out);
    } catch (e) { /* extension reloaded; ignore */ }
  }

  // ---------- overlay ----------
  function buildHud() {
    const host = document.createElement('div');
    host.id = 'koanyx-trac-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host{all:initial}
        *{box-sizing:border-box}
        .hud{font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#F1DCCB;background:#2A0E09;
          border:1px solid #5A2316;border-radius:12px;width:252px;box-shadow:0 10px 32px rgba(20,4,2,.6);overflow:hidden}
        .bar{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;background:#3B1710;cursor:grab;user-select:none;touch-action:none}
        .bar:active{cursor:grabbing}
        .dot{width:9px;height:9px;border-radius:50%;background:#7a3a26;flex:none}
        .dot.moving{background:#C04000;box-shadow:0 0 0 3px rgba(192,64,0,.35);animation:pulse 1s ease-in-out infinite}
        .name{font-weight:600;flex:1}
        .score{font:600 18px Georgia,"Times New Roman",serif;color:#E9B26A}
        button{all:unset;cursor:pointer;border-radius:6px;padding:3px 8px;font-weight:600;color:#F1DCCB}
        button:hover{background:#5A2316}
        button:focus-visible{outline:2px solid #E9B26A}
        .clock{padding:12px 14px 10px}
        .time{font:600 30px/1 Georgia,"Times New Roman",serif;font-variant-numeric:tabular-nums;letter-spacing:.5px}
        .date{margin-top:4px;color:#C9A58F}
        .mouse{padding:10px 14px 12px;border-top:1px solid #4a1d13}
        .mrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .pill{padding:3px 11px;border-radius:999px;font-weight:600;border:1px solid #7a3a26;color:#C9A58F;transition:background .15s,color .15s}
        .pill.moving{background:#C04000;border-color:#C04000;color:#fff}
        .pill.stopped{border-color:#E9B26A;color:#E9B26A}
        #mfor{color:#C9A58F;font-variant-numeric:tabular-nums}
        .spark{display:block;width:100%;height:36px;background:#3B1710;border-radius:6px}
        .spark polyline{fill:none;stroke:#E0702E;stroke-width:1.6;stroke-linejoin:round;vector-effect:non-scaling-stroke}
        .grid{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin-top:9px}
        .grid span:nth-child(odd){color:#C9A58F}
        .grid span:nth-child(even){text-align:right;font-variant-numeric:tabular-nums}
        .stats{padding:10px 14px;border-top:1px solid #4a1d13}
        .foot{padding:6px 8px 8px;border-top:1px solid #4a1d13;display:flex;justify-content:flex-end;gap:4px;flex-wrap:wrap}
        .hud.min .spark,.hud.min .grid,.hud.min .stats,.hud.min .foot{display:none}
        .hud.min .mouse{padding-bottom:10px}.hud.min .mrow{margin-bottom:0}
        .ring{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;pointer-events:none;
          border:2px solid #C04000;animation:ring 1.4s ease-out forwards}
        .ring.dead{border-style:dashed;border-color:#E9B26A}
        [hidden]{display:none!important}
        #cv{position:fixed;left:0;top:0;pointer-events:none}
        .veil{position:fixed;inset:0;background:rgba(255,246,238,.55);pointer-events:none}
        .hm{position:fixed;inset:0;width:100%;height:100%;image-rendering:auto;pointer-events:none}
        .legend{position:fixed;left:16px;bottom:16px;width:244px;padding:12px 14px;background:#2A0E09;color:#F1DCCB;
          border:1px solid #5A2316;border-radius:12px;box-shadow:0 10px 32px rgba(20,4,2,.6);pointer-events:none;font:13px/1.35 system-ui,sans-serif}
        .lt{font:600 15px Georgia,"Times New Roman",serif;margin-bottom:8px}
        .gradbar{height:10px;border-radius:5px;background:linear-gradient(90deg,#D62828,#782010,#080505);border:1px solid #5A2316}
        .lab{display:flex;justify-content:space-between;margin:4px 0 8px;color:#C9A58F;font-size:12px}
        .ln{color:#F1DCCB}
        @keyframes ring{from{opacity:1;transform:scale(.6)}to{opacity:0;transform:scale(1.8)}}
        @keyframes pulse{50%{box-shadow:0 0 0 6px rgba(192,64,0,.05)}}
        @media (prefers-reduced-motion:reduce){.ring{animation:none;display:none}.dot.moving{animation:none}}
      </style>
      <div class="veil" id="veil" hidden></div>
      <canvas class="hm" id="hm" hidden></canvas>
      <canvas id="cv"></canvas>
      <div class="legend" id="legend" hidden>
        <div class="lt">Cursor map</div>
        <div class="gradbar"></div>
        <div class="lab"><span>Rarely here</span><span>Stays long</span></div>
        <div class="ln" id="lg1"></div>
        <div class="ln" id="lg2"></div>
      </div>
      <div class="hud" id="hud">
        <div class="bar" id="bar">
          <i class="dot" id="dot"></i><span class="name">Koanyx Trac</span>
          <span class="score" id="sc" title="Usability score for this page">100</span>
          <button id="min" aria-label="Collapse panel">&minus;</button>
        </div>
        <div class="clock"><div class="time" id="time">--:--:--</div><div class="date" id="date"></div></div>
        <div class="mouse">
          <div class="mrow"><span class="pill" id="pill">Idle</span><span id="mfor">0.0s</span></div>
          <svg class="spark" viewBox="0 0 240 36" preserveAspectRatio="none" aria-hidden="true"><polyline id="line" points=""/></svg>
          <div class="grid">
            <span>Speed</span><span id="spd">0 px/s</span>
            <span>Position</span><span id="pos">&ndash;</span>
            <span>Over</span><span id="over">&ndash;</span>
            <span>Time moving</span><span id="tm">0s</span>
            <span>Time stopped</span><span id="ts">0s</span>
          </div>
        </div>
        <div class="stats"><div class="grid" style="margin:0">
          <span>Rage clicks</span><span id="r">0</span>
          <span>Dead clicks</span><span id="d">0</span>
          <span>Scroll U-turns</span><span id="u">0</span>
          <span>Slow fields</span><span id="f">0</span>
          <span>Scrolled</span><span id="s">0%</span>
          <span>Active time</span><span id="t">0s</span>
        </div></div>
        <div class="foot"><button id="heat" aria-pressed="false">Heatmap: off</button><button id="trail" aria-pressed="false">Cursor trail: off</button></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const hudEl = $('hud'), bar = $('bar'), cv = $('cv');

    $('min').addEventListener('click', () => {
      const m = hudEl.classList.toggle('min');
      $('min').innerHTML = m ? '+' : '&minus;';
      $('min').setAttribute('aria-label', m ? 'Expand panel' : 'Collapse panel');
    });
    $('trail').addEventListener('click', () => api.storage.local.set({ 'kt:trail': !trailOn }));
    $('heat').addEventListener('click', () => api.storage.local.set({ 'kt:heatmap': !heatOn }));

    // drag by the title bar; position is remembered
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = host.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto' });
      bar.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        host.style.left = Math.min(Math.max(0, ev.clientX - ox), window.innerWidth - r.width) + 'px';
        host.style.top = Math.min(Math.max(0, ev.clientY - oy), window.innerHeight - 40) + 'px';
      };
      const up = () => {
        bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up);
        api.storage.local.set({ 'kt:pos': { left: parseFloat(host.style.left), top: parseFloat(host.style.top) } });
      };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
    });

    const sizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = window.innerWidth * dpr; cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px';
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    const LABEL = { moving: 'Moving', stopped: 'Stopped', idle: 'Idle', outside: 'Left the page' };
    let lastSec = '';
    return {
      host, cv, sizeCanvas,
      setHeat(v) {
        $('heat').textContent = 'Heatmap: ' + (v ? 'on' : 'off'); $('heat').setAttribute('aria-pressed', v);
        ['veil', 'hm', 'legend'].forEach((id) => { $(id).hidden = !v; });
        if (v) this.drawHeat();
      },
      drawHeat() {
        KT.paintHeat($('hm'), heat);
        const st = KT.heatStats(heat);
        $('lg1').textContent = st.maxMs ? 'Longest stay: ' + st.area + ' (' + KT.fmtTime(st.maxMs) + ')' : 'Keep browsing to build the map';
        $('lg2').textContent = 'Screen visited: ' + st.seenPct + '%';
      },
      setTrail(v) { $('trail').textContent = 'Cursor trail: ' + (v ? 'on' : 'off'); $('trail').setAttribute('aria-pressed', v); },
      update() {
        const now = new Date(), t = timeFmt.format(now);
        if (t !== lastSec) { lastSec = t; $('time').textContent = t; $('date').textContent = dateFmt.format(now); }
        $('sc').textContent = KT.score({ ...page, pages: 1 });
        $('pill').textContent = LABEL[M.state]; $('pill').className = 'pill ' + M.state;
        $('dot').className = 'dot' + (M.state === 'moving' ? ' moving' : '');
        $('mfor').textContent = (M.state === 'moving' ? 'for ' : 'for ') + dur(Date.now() - M.since);
        $('spd').textContent = Math.round(M.speed) + ' px/s';
        $('pos').textContent = M.x == null ? '\u2013' : M.x + ', ' + M.y;
        $('over').textContent = M.over;
        $('tm').textContent = KT.fmtTime(page.movingMs); $('ts').textContent = KT.fmtTime(page.stoppedMs);
        $('r').textContent = page.rage; $('d').textContent = page.dead;
        $('u').textContent = page.uturns; $('f').textContent = page.slowFields;
        $('s').textContent = Math.round(depth * 100) + '%'; $('t').textContent = KT.fmtTime(page.activeMs);
        const h = M.hist, mx = Math.max(600, ...h), step = 240 / 59;
        $('line').setAttribute('points', h.map((v, i) => ((60 - h.length + i) * step).toFixed(1) + ',' + (33 - (v / mx) * 30).toFixed(1)).join(' '));
      },
      ring(x, y, kind) {
        const el = document.createElement('div');
        el.className = 'ring ' + kind; el.style.left = x + 'px'; el.style.top = y + 'px';
        root.appendChild(el); setTimeout(() => el.remove(), 1500);
      }
    };
  }

  // ---------- cursor trail ----------
  function drawTrail() {
    raf = 0;
    if (!hud || !trailOn) return;
    const g = hud.cv.getContext('2d'), now = performance.now(), LIFE = 1200;
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    trail = trail.filter((p) => now - p.t < LIFE);
    g.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = 1 - (now - trail[i].t) / LIFE;
      g.strokeStyle = `rgba(224,112,46,${(a * 0.85).toFixed(2)})`; g.lineWidth = 1.5 + a * 3.5;
      g.beginPath(); g.moveTo(trail[i - 1].x, trail[i - 1].y); g.lineTo(trail[i].x, trail[i].y); g.stroke();
    }
    if (trail.length) raf = requestAnimationFrame(drawTrail);
  }

  // ---------- trackers ----------
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  function start() {
    if (started) return; started = true;
    page = KT.EMPTY(); pending = KT.EMPTY(); bump('pages');
    M.lastMove = 0; M.state = 'idle'; M.since = Date.now();

    heatPath = location.pathname; heat = KT.emptyHeat(); loadHeat();
    let lastCell = -1;

    // Mouse movement
    listen(document, 'mousemove', (e) => {
      const now = performance.now();
      if (M.lastT) {
        const dt = now - M.lastT;
        if (dt > 0) M.speed = M.speed * 0.7 + (Math.hypot(e.movementX || 0, e.movementY || 0) / dt * 1000) * 0.3;
      }
      M.lastT = now; M.lastMove = Date.now(); M.outside = false;
      M.x = Math.round(e.clientX); M.y = Math.round(e.clientY);
      M.over = friendly(e.target);
      const ci = cellOf(e.clientX, e.clientY);
      if (ci !== lastCell) { lastCell = ci; heatAdd(ci, 0, 1); }
      if (trailOn && hud) { trail.push({ x: e.clientX, y: e.clientY, t: now }); if (!raf) raf = requestAnimationFrame(drawTrail); }
    }, { passive: true });
    listen(document.documentElement, 'mouseleave', () => { M.outside = true; M.speed = 0; });
    listen(document.documentElement, 'mouseenter', () => { M.outside = false; });

    // Clicks: rage + dead
    let recent = [], lastRage = 0;
    listen(document, 'click', (e) => {
      if (!e.isTrusted || (hud && e.composedPath().includes(hud.host))) return;
      const now = Date.now();
      bump('clicks');
      recent = recent.filter((c) => now - c.t < 1000);
      recent.push({ t: now, x: e.clientX, y: e.clientY });
      const near = recent.filter((c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) < 50);
      if (near.length >= 3 && now - lastRage > 1500) {
        lastRage = now; bump('rage'); hud && hud.ring(e.clientX, e.clientY, 'rage');
      }
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest(INTERACTIVE) || getComputedStyle(el).cursor === 'pointer') return;
      if (window.getSelection && String(window.getSelection()).length) return;
      let changed = false;
      const mo = new MutationObserver(() => { changed = true; });
      mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      setTimeout(() => {
        mo.disconnect();
        if (!changed && on) { bump('dead'); hud && hud.ring(e.clientX, e.clientY, 'dead'); }
      }, 600);
    }, true);

    // Scroll depth + U-turns
    let lastY = window.scrollY, lastDir = 0, lastTurn = Date.now(), run = 0;
    listen(window, 'scroll', () => {
      const y = window.scrollY, dy = y - lastY;
      const h = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      depth = Math.max(depth, Math.min(1, y / h));
      if (Math.abs(dy) > 2) {
        const dir = Math.sign(dy);
        if (dir === lastDir) run += Math.abs(dy);
        else {
          if (lastDir !== 0 && run > 250 && Date.now() - lastTurn < 1500) bump('uturns');
          lastDir = dir; run = Math.abs(dy); lastTurn = Date.now();
        }
        lastY = y;
      }
    }, { passive: true });

    // Fields: time spent in a field, never what was typed
    let focusAt = 0;
    listen(document, 'focusin', (e) => { if (e.target.matches?.('input,textarea,select')) focusAt = Date.now(); });
    listen(document, 'focusout', (e) => {
      if (focusAt && e.target.matches?.('input,textarea,select')) {
        if (Date.now() - focusAt > 15000) bump('slowFields');
        focusAt = 0;
      }
    });
    listen(window, 'resize', () => hud && hud.sizeCanvas());

    // Performance
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.loadEventEnd > 0) { bump('loadSum', Math.round(nav.loadEventEnd)); bump('loadN'); }
    } catch (_) {}
    try {
      let cls = 0;
      const po = new PerformanceObserver((list) => {
        for (const en of list.getEntries()) if (!en.hadRecentInput) cls += en.value;
      });
      po.observe({ type: 'layout-shift', buffered: true });
      timers.push(setInterval(() => { if (cls) { bump('clsSum', +cls.toFixed(4)); cls = 0; } }, 5000));
      cleanups.push(() => po.disconnect());
    } catch (_) {}

    // One 100ms heartbeat: mouse state, clock, time accounting
    let lastActivity = Date.now(), tick = 0, accMove = 0, accStop = 0;
    ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach((t) =>
      listen(window, t, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
    timers.push(setInterval(() => {
      tick++;
      const now = Date.now(), since = M.lastMove ? now - M.lastMove : Infinity;
      const st = M.outside ? 'outside' : since < 250 ? 'moving' : since < 5000 ? 'stopped' : 'idle';
      if (st !== M.state) { M.state = st; M.since = now; }
      if (since > 150) M.speed = 0;
      if (location.pathname !== heatPath) { flush(); heatPath = location.pathname; heat = KT.emptyHeat(); loadHeat(); lastCell = -1; }
      // time the cursor spends parked: counts toward the cell it is sitting in
      if (!document.hidden && M.x != null && (st === 'stopped' || st === 'idle') && now - lastActivity < 30000) heatAdd(cellOf(M.x, M.y), 100, 0);
      if (!document.hidden) { if (st === 'moving') accMove += 100; else if (st !== 'outside') accStop += 100; }
      if (tick % 5 === 0) { M.hist.push(M.speed); if (M.hist.length > 60) M.hist.shift(); }
      if (tick % 10 === 0) {
        if (!document.hidden && now - lastActivity < 30000) bump('activeMs', 1000);
        if (accMove) { bump('movingMs', accMove); accMove = 0; }
        if (accStop) { bump('stoppedMs', accStop); accStop = 0; }
      }
      if (hud && !document.hidden) { hud.update(); if (heatOn && tick % 10 === 0) hud.drawHeat(); }
    }, 100));
    timers.push(setInterval(flush, 2000));
    listen(window, 'pagehide', flush);
  }

  function stop() {
    started = false; flush();
    timers.forEach(clearInterval); timers = [];
    cleanups.forEach((f) => f()); cleanups = [];
    trail = []; M.hist = [];
  }

  async function applyHud() {
    if (on && showHud && !hud) {
      hud = buildHud(); document.documentElement.appendChild(hud.host);
      const { 'kt:pos': pos } = await api.storage.local.get('kt:pos');
      if (pos && hud) Object.assign(hud.host.style, {
        left: Math.min(pos.left, window.innerWidth - 260) + 'px', top: Math.min(pos.top, window.innerHeight - 60) + 'px', right: 'auto', bottom: 'auto'
      });
      hud && (hud.setTrail(trailOn), hud.setHeat(heatOn), hud.update());
    }
    if ((!on || !showHud) && hud) { hud.host.remove(); hud = null; trail = []; }
  }

  function apply() { on ? start() : stop(); applyHud(); }

  // ---------- settings ----------
  api.storage.local.get(['kt:enabled', 'kt:hud', 'kt:trail', 'kt:heatmap']).then((v) => {
    on = !!v['kt:enabled']; showHud = v['kt:hud'] !== false; trailOn = !!v['kt:trail']; heatOn = !!v['kt:heatmap']; apply();
  });
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch['kt:enabled']) on = !!ch['kt:enabled'].newValue;
    if (ch['kt:hud']) showHud = ch['kt:hud'].newValue !== false;
    if (ch['kt:trail']) { trailOn = !!ch['kt:trail'].newValue; hud && hud.setTrail(trailOn); }
    if (ch['kt:heatmap']) { heatOn = !!ch['kt:heatmap'].newValue; hud && hud.setHeat(heatOn); }
    if (ch['kt:enabled'] || ch['kt:hud']) apply();
  });
})();
