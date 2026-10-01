// Shared by the content script and the popup.
(() => {
  const KT = {
    api: globalThis.browser ?? globalThis.chrome,
    keyFor: (origin) => 'kt:site:' + origin,
    EMPTY: () => ({
      since: Date.now(), pages: 0, clicks: 0, rage: 0, dead: 0, uturns: 0,
      slowFields: 0, activeMs: 0, movingMs: 0, stoppedMs: 0, depthSum: 0, clsSum: 0, loadSum: 0, loadN: 0
    }),
    // 100 = smooth. Friction events cost points, averaged per page view.
    score(s) {
      const pv = Math.max(1, s.pages || 1);
      let loss = ((s.rage || 0) * 10 + (s.dead || 0) * 4 + (s.uturns || 0) * 2 + (s.slowFields || 0) * 3) / pv;
      const cls = (s.clsSum || 0) / pv;
      loss += cls > 0.25 ? 10 : cls > 0.1 ? 5 : 0;
      const load = s.loadN ? s.loadSum / s.loadN : 0;
      loss += load > 4000 ? 10 : load > 2500 ? 5 : 0;
      return Math.max(0, Math.min(100, Math.round(100 - loss)));
    },
    fmtTime(ms) {
      const s = Math.round(ms / 1000);
      return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    }
  };
  // ---- cursor heatmap helpers (viewport split into a 32 x 18 grid) ----
  KT.HEAT = { COLS: 32, ROWS: 18 };
  KT.heatKey = (origin, path) => 'kt:heat:' + origin + path;
  KT.emptyHeat = () => ({ dwell: new Array(576).fill(0), visits: new Array(576).fill(0) });
  // t = 0 -> red (rarely here), 0.5 -> dark mahogany, 1 -> black (stays long)
  KT.heatColor = (t) => {
    const A = [214, 40, 40], B = [120, 32, 16], C = [8, 5, 5];
    const [from, to, k] = t < 0.5 ? [A, B, t / 0.5] : [B, C, (t - 0.5) / 0.5];
    return from.map((v, i) => Math.round(v + (to[i] - v) * k));
  };
  KT.paintHeat = (cv, heat) => {
    const { COLS, ROWS } = KT.HEAT;
    cv.width = COLS; cv.height = ROWS;
    const g = cv.getContext('2d'), img = g.createImageData(COLS, ROWS);
    const max = Math.max(1, ...heat.dwell), lm = Math.log(1 + max / 500);
    for (let i = 0; i < COLS * ROWS; i++) {
      if (!(heat.visits[i] > 0 || heat.dwell[i] > 0)) continue;       // never visited: left clear
      const t = Math.min(1, Math.log(1 + heat.dwell[i] / 500) / lm);
      const [r, gr, b] = KT.heatColor(t);
      img.data.set([r, gr, b, 215], i * 4);
    }
    g.putImageData(img, 0, 0);
  };
  KT.heatStats = (heat) => {
    const { COLS, ROWS } = KT.HEAT, N = COLS * ROWS;
    let mi = 0, seen = 0;
    for (let i = 0; i < N; i++) {
      if (heat.dwell[i] > heat.dwell[mi]) mi = i;
      if (heat.visits[i] > 0 || heat.dwell[i] > 0) seen++;
    }
    const col = mi % COLS, row = Math.floor(mi / COLS);
    const h = col < COLS / 3 ? 'left' : col < (2 * COLS) / 3 ? '' : 'right';
    const v = row < ROWS / 3 ? 'top' : row < (2 * ROWS) / 3 ? '' : 'bottom';
    return { maxMs: heat.dwell[mi], area: [v, h].filter(Boolean).join(' ') || 'center', seenPct: Math.round((seen / N) * 100) };
  };

  globalThis.KT = KT;
})();
