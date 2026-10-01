(async () => {
  const api = KT.api;
  const $ = (id) => document.getElementById(id);
  let origin = null;

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) origin = u.origin; } catch (_) {}
  $('site').textContent = origin ? origin.replace(/^https?:\/\//, '') : 'Open a website to see data';

  const set = await api.storage.local.get(['kt:enabled', 'kt:hud', 'kt:trail']);
  $('enabled').checked = !!set['kt:enabled'];
  $('hud').checked = set['kt:hud'] !== false;
  $('enabled').onchange = (e) => api.storage.local.set({ 'kt:enabled': e.target.checked }).then(render);
  $('trail').checked = !!set['kt:trail'];
  $('trail').onchange = (e) => api.storage.local.set({ 'kt:trail': e.target.checked });
  $('hud').onchange = (e) => api.storage.local.set({ 'kt:hud': e.target.checked });

  async function render() {
    const on = $('enabled').checked;
    const key = origin && KT.keyFor(origin);
    const s = key ? (await api.storage.local.get(key))[key] : null;
    const rows = [
      ['Rage clicks', s?.rage ?? 0, (s?.rage ?? 0) > 0],
      ['Dead clicks', s?.dead ?? 0, (s?.dead ?? 0) > 0],
      ['Scroll U-turns', s?.uturns ?? 0, (s?.uturns ?? 0) > 2],
      ['Slow fields', s?.slowFields ?? 0, (s?.slowFields ?? 0) > 0],
      ['Mouse moving', KT.fmtTime(s?.movingMs ?? 0), false],
      ['Mouse stopped', KT.fmtTime(s?.stoppedMs ?? 0), false],
      ['Page views', s?.pages ?? 0, false],
      ['Active time', KT.fmtTime(s?.activeMs ?? 0), false]
    ];
    $('stats').innerHTML = rows.map(([k, v, hot]) =>
      `<div class="${hot ? 'hot' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    // cursor map for this page
    const hk = tab && origin ? KT.heatKey(origin, new URL(tab.url).pathname) : null;
    const hv = hk ? (await api.storage.local.get([hk, 'kt:heatmap']))[hk] : null;
    const heat = hv ? { dwell: hv.dwell, visits: hv.visits } : KT.emptyHeat();
    KT.paintHeat($('pmap'), heat);
    const hs = KT.heatStats(heat);
    $('pmapEmpty').style.display = hs.seenPct ? 'none' : 'grid';
    $('mapnote').textContent = hs.maxMs ? 'Longest stay: ' + hs.area + ' (' + KT.fmtTime(hs.maxMs) + '). Screen visited: ' + hs.seenPct + '%.' : 'No cursor data for this page yet.';
    const hm = (await api.storage.local.get('kt:heatmap'))['kt:heatmap'];
    $('showheat').textContent = hm ? 'Hide heatmap on page' : 'Show heatmap on page';

    if (!s) {
      $('score').textContent = '–';
      $('verdict').textContent = on ? 'Waiting for activity' : 'Tracking is off';
      return;
    }
    const sc = KT.score(s);
    $('score').textContent = sc;
    $('verdict').textContent = !on ? 'Paused' : sc >= 85 ? 'Smooth' : sc >= 60 ? 'Some friction' : 'Frustrating';
  }

  const tf = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const df = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const clock = () => { const n = new Date(); $('ptime').textContent = tf.format(n); $('pdate').textContent = df.format(n); };
  clock(); setInterval(clock, 1000);

  api.storage.onChanged.addListener(render);
  render();

  $('export').onclick = async () => {
    if (!origin) return;
    const key = KT.keyFor(origin);
    const data = (await api.storage.local.get(key))[key] || {};
    const out = { site: origin, exportedAt: new Date().toISOString(), score: KT.score(data), ...data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'koanyx-trac-' + origin.replace(/\W+/g, '-') + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('showheat').onclick = async () => {
    const cur = (await api.storage.local.get('kt:heatmap'))['kt:heatmap'];
    await api.storage.local.set({ 'kt:heatmap': !cur });
  };
  $('reset').onclick = async () => {
    if (!origin) return;
    const all = await api.storage.local.get(null);
    const heatKeys = Object.keys(all).filter((k) => k.startsWith('kt:heat:' + origin + '/'));
    await api.storage.local.remove([KT.keyFor(origin), ...heatKeys]);
    render();
  };
})();
