/* =====================================================================
   App controller: state, loading, modes, sheets, events, start-up
   ===================================================================== */
const App = {
  loc: null, data: null, aq: null, aqState: '', marine: null, marineState: '', ens: null, ensState: '', models: null, modelsState: '', normals: null, normalsState: '',
  alerts: [], mode: S.mode === 'advanced' ? 'advanced' : 'basic', reqId: 0, speaking: false, extrasFor: '', extrasAt: 0
};
const keyOf = l => (l ? (+l.lat).toFixed(2) + ',' + (+l.lon).toFixed(2) : '');
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } };

function setProgress(on) { $('#progress').hidden = !on; $('#refreshBtn').classList.toggle('spin', !!on); }
let _toastT = 0;
function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(_toastT); _toastT = setTimeout(() => { el.hidden = true; }, ms); }
function showBanner(text, kind = '', action = null) {
  const el = $('#banner'); el.className = 'banner' + (kind === 'err' ? ' err' : '');
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button class="btn small" type="button" id="bannerAct">${esc(action.label)}</button>` : ''}`;
  el.hidden = false; if (action) $('#bannerAct').onclick = action.fn;
}
const hideBanner = () => { $('#banner').hidden = true; };

function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = S.theme;
  r.classList.toggle('no-anim', !S.anim);
  const dark = isDarkTheme();
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#090f15' : '#e7ecf0'));
}
function setStaticTexts() {
  $('#locPin').innerHTML = ui('pin'); $('#locChev').innerHTML = ui('chev');
  $('#refreshBtn').innerHTML = ui('refresh'); $('#refreshBtn').setAttribute('aria-label', t('refresh')); $('#refreshBtn').title = t('refresh');
  $('#settingsBtn').innerHTML = ui('sliders'); $('#settingsBtn').setAttribute('aria-label', t('settings')); $('#settingsBtn').title = t('settings');
  $('#unitBtn').textContent = '°' + S.units.temp; $('#unitBtn').setAttribute('aria-label', t('switchUnit')); $('#unitBtn').title = t('switchUnit');
  $('#locBtn').setAttribute('aria-label', t('changeLoc'));
  /* the flag shows the language you can switch to */
  const other = LANG === 'tr' ? 'en' : 'tr';
  $('#langBtn').innerHTML = FLAGS[other];
  $('#langBtn').setAttribute('aria-label', t('switchLang')); $('#langBtn').title = t('switchLang');
  $('#langBtn').setAttribute('lang', other);
  const seg = `<button type="button" data-mode="basic" aria-pressed="${App.mode === 'basic'}">${ui('basic')}${esc(t('basic'))}</button><button type="button" data-mode="advanced" aria-pressed="${App.mode === 'advanced'}">${ui('adv')}${esc(t('advanced'))}</button>`;
  $('#modeSegTop').innerHTML = seg; $('#modeSegMob').innerHTML = seg;
  $('#modeSegTop').setAttribute('aria-label', t('mode')); $('#modeSegMob').setAttribute('aria-label', t('mode'));
}
function renderLocName() {
  const l = App.loc;
  $('#locName').textContent = l ? l.name : 'Isobar';
  $('#locSub').textContent = l ? [l.admin, l.country].filter(Boolean).join(', ') + (l.approx ? ' · ' + t('approx') : '') : t('changeLoc');
  document.title = l ? `${l.name} · Isobar Weather` : 'Isobar Weather';
}
function updateHash() {
  if (!App.loc) return;
  const h = `#l=${(+App.loc.lat).toFixed(4)},${(+App.loc.lon).toFixed(4)}&n=${encodeURIComponent(App.loc.name || '')}${App.mode === 'advanced' ? '&m=adv' : ''}`;
  try { history.replaceState(null, '', h); } catch (e) { /* not allowed here */ }
}
function parseHash() {
  try {
    const h = location.hash.replace(/^#/, ''); if (!h) return null;
    const p = new URLSearchParams(h), l = p.get('l'); if (!l) return null;
    const [lat, lon] = l.split(',').map(Number); if (!isNum(lat) || !isNum(lon)) return null;
    if (p.get('m') === 'adv') App.mode = 'advanced';
    return { lat, lon, name: p.get('n') || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, admin: '', country: '' };
  } catch (e) { return null; }
}

/* ---------- loading ---------- */
async function setLocation(loc, opts = {}) {
  const prev = keyOf(App.loc);
  App.loc = { ...loc, lat: +loc.lat, lon: +loc.lon };
  Store.set('lastLoc', slimLoc(App.loc));
  if (!opts.noRecent && !loc.approx) Recents.add(App.loc);
  if (keyOf(App.loc) !== prev) {
    Object.assign(App, { aq: null, aqState: '', marine: null, marineState: '', ens: null, ensState: '', models: null, modelsState: '', normals: null, normalsState: '', ensFor: '', modelsFor: '', normalsFor: '', extrasFor: '' });
    if (MapView.map) MapView.grid = null;
  }
  renderLocName(); updateHash();
  const cached = Cache.get(App.loc, S.adv.model);
  App.data = cached || null;
  renderAll();
  if (cached && Date.now() - cached.fetchedAt < 10 * 60e3) { loadExtras(); if (App.mode === 'advanced') MapView.activate(); return; }
  await refresh();
  if (!loc.name || loc.coords || (!loc.admin && !loc.country)) {
    const nm = await reverseName(App.loc.lat, App.loc.lon);
    if (nm && keyOf(App.loc) === keyOf(loc)) {
      if (!loc.name || loc.coords) Object.assign(App.loc, nm); else Object.assign(App.loc, { admin: nm.admin, country: nm.country, cc: nm.cc });
      App.loc.coords = false; Store.set('lastLoc', slimLoc(App.loc)); if (!loc.approx) Recents.add(App.loc); renderLocName(); updateHash();
    }
  }
}
async function refresh() {
  if (!App.loc) return;
  const id = ++App.reqId; setProgress(true);
  try {
    const d = await getForecast(App.loc, S.adv.model, name => { if (!App.data && id === App.reqId) { const el = $('.hero-loading'); if (el) el.textContent = t('contacting', { p: name }); } });
    if (id !== App.reqId) return;
    App.data = d;
    if (!App.loc.tz && d.tz) { App.loc.tz = d.tz; Store.set('lastLoc', slimLoc(App.loc)); }
    Cache.put(App.loc, S.adv.model, d);
    if (d.fallback) showBanner(t('fallbackUsed', { q: d.provider, n: d.days }), '', { label: t('retry'), fn: () => refresh() });
    else if (d.modelFallback) showBanner(t('modelFell', { m: modelLabel(d.modelFallback) }));
    else hideBanner();
    renderAll(); loadExtras();
    if (App.mode === 'advanced') MapView.activate();
  } catch (e) {
    if (id !== App.reqId) return;
    if (App.data) { showBanner(navigator.onLine === false ? t('offlineStale', { t: ago(App.data.fetchedAt) }) : t('staleData', { t: ago(App.data.fetchedAt) }), 'err', { label: t('retry'), fn: () => refresh() }); renderAll(); }
    else renderError(e);
  } finally { if (id === App.reqId) setProgress(false); }
}
async function loadExtras() {
  const loc = App.loc, key = keyOf(loc); if (!loc) return;
  if (App.extrasFor === key && Date.now() - App.extrasAt < 20 * 60e3) return;
  App.extrasFor = key; App.extrasAt = Date.now(); App.aqState = 'loading'; App.marineState = 'loading';
  const [aq, mar] = await Promise.allSettled([getAirQuality(loc), getMarine(loc)]);
  if (keyOf(App.loc) !== key) return;
  App.aq = aq.status === 'fulfilled' ? aq.value : null; App.aqState = App.aq ? 'ok' : 'none';
  App.marine = mar.status === 'fulfilled' ? mar.value : null; App.marineState = App.marine ? 'ok' : 'none';
  if (!App.data) return;
  if (App.mode === 'basic') { renderDetails(); renderAlerts(); } else { renderAQCard(); renderMarineCard(); }
}
function renderError(e) {
  const el = $('#hero'); el.dataset.sky = 'loading'; HeroFX.set('loading');
  const list = (e.errors || []).map(([p, m]) => `<li><b>${esc(p)}</b>: ${esc(m)}</li>`).join('');
  $('#heroInner').innerHTML = `<div class="hero-loading" style="text-align:center;gap:12px;display:grid">${esc(t('fetchFailed'))}<div><button class="btn primary" type="button" id="retryBtn">${ui('refresh')}${esc(t('retry'))}</button></div>${list ? `<details style="font:400 13px var(--font-body);text-align:left;max-width:520px;margin:0 auto"><summary>${esc(t('whatFailed'))}</summary><ul>${list}</ul></details>` : ''}</div>`;
  $('#retryBtn').onclick = () => refresh();
  ['#hourly', '#daily', '#outlook', '#activities'].forEach(s => { $(s).innerHTML = ''; });
  $('#details').innerHTML = ''; $('#alerts').hidden = true; $('#nowcast').hidden = true;
}

/* ---------- rendering ---------- */
function applyModeUI() {
  $('#basicView').hidden = App.mode !== 'basic'; $('#advView').hidden = App.mode !== 'advanced';
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === App.mode)));
}
function renderSkeleton() {
  ['#hourly', '#daily'].forEach(s => { $(s).innerHTML = '<div class="skel"></div>'; });
  $('#outlook').innerHTML = '<div class="skel" style="height:90px"></div>'; $('#outlook').hidden = false;
  $('#details').innerHTML = ''; $('#activities').innerHTML = ''; $('#alerts').hidden = true; $('#nowcast').hidden = true;
}
function renderAll() {
  if (App.data) TZ.set(App.data.tz);
  applyModeUI(); renderHero();
  if (!App.data) { renderSkeleton(); renderFooter(); return; }
  if (App.mode === 'basic') { renderAlerts(); renderNowcast(); renderHourly(); renderDaily(); renderOutlook(); renderDetails(); renderActivities(); }
  else renderAdvanced();
  renderFooter();
}
function setMode(m) {
  if (App.mode === m) return;
  App.mode = m; S.mode = m; saveSettings(); updateHash();
  if (m !== 'advanced') { MapView.stopParticles(); MapView.stopPlay(); }
  renderAll();
  window.scrollTo(0, 0);
}
function onUnitsChanged() {
  saveSettings(); $('#unitBtn').textContent = '°' + S.units.temp;
  renderAll();
  if (MapView.map) { MapView.drawField(); MapView.renderLegend(); MapView.updateTimebar(); }
}

/* ---------- sheets ---------- */
let _lastFocus = null;
function openSheet(sh) {
  if ($('#backdrop').hidden) _lastFocus = document.activeElement;
  $$('.sheet').forEach(s => { if (s !== sh) s.hidden = true; });
  sh.hidden = false; $('#backdrop').hidden = false; document.documentElement.style.overflow = 'hidden';
  const f = sh.querySelector('input,select,button:not([data-close])'); if (f && !matchMedia('(pointer: coarse)').matches) setTimeout(() => f.focus(), 30);
}
function closeSheets() {
  $$('.sheet').forEach(s => { s.hidden = true; }); $('#backdrop').hidden = true; document.documentElement.style.overflow = '';
  if (_lastFocus && _lastFocus.focus) try { _lastFocus.focus(); } catch (e) { /* ignore */ }
}
const sheetHead = (id, title) => `<div class="sheet-h"><h2 id="${id}">${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="${esc(t('close'))}">${ui('close')}</button></div>`;
let _results = [], _resIdx = -1;
function openLocSheet() {
  const sh = $('#locSheet');
  sh.innerHTML = sheetHead('locTitle', t('chooseLoc')) + `<div class="sheet-b">
    <div class="search">${ui('search')}<input id="q" type="search" placeholder="${esc(t('searchPh'))}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="${esc(t('searchPh'))}" aria-controls="results"></div>
    <ul class="rlist" id="results" role="listbox" aria-label="${esc(t('results'))}"></ul>
    <ul class="rlist"><li><button class="rbtn" type="button" id="useMyLoc">${ui('locate')}<span><b>${esc(t('useMyLoc'))}</b><small>${esc(t('useMyLocSub'))}</small></span></button></li></ul>
    <h3 class="sec-t">${esc(t('saved'))}</h3><ul class="rlist" id="favList"></ul>
    <h3 class="sec-t">${esc(t('recent'))}</h3><ul class="rlist" id="recList"></ul></div>`;
  _results = []; _resIdx = -1; renderLocLists(); openSheet(sh);
  const q = $('#q');
  const run = debounce(async v => {
    const ul = $('#results'); if (!ul) return;
    if (v.trim().length < 2) { ul.innerHTML = ''; _results = []; return; }
    ul.innerHTML = `<li class="muted" style="padding:10px 8px">${esc(t('searching'))}</li>`;
    const r = await searchPlaces(v); if ($('#q') !== q || q.value !== v) return;
    _results = r; _resIdx = -1;
    ul.innerHTML = r.length ? r.map((p, i) => locItem(p, 'r' + i)).join('') : `<li class="muted" style="padding:10px 8px">${esc(t('noResults'))}</li>`;
  }, 300);
  q.addEventListener('input', () => run(q.value));
  q.addEventListener('keydown', e => {
    const items = $$('#results .rbtn');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; _resIdx = clamp(_resIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1); items.forEach((b, i) => b.classList.toggle('act', i === _resIdx)); items[_resIdx].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); const b = items[_resIdx >= 0 ? _resIdx : 0]; if (b) b.click(); }
  });
}
function locItem(p, ref, removable) {
  const sub = [p.admin, p.country].filter(Boolean).join(', ');
  const fav = Favs.has(p);
  return `<li><button class="rbtn" type="button" data-pick="${ref}" role="option">${ui(ref[0] === 'h' ? 'clock' : 'pin')}<span><b>${esc(p.name)}</b><small>${esc(sub || (fmtN(p.lat, 3) + '°, ' + fmtN(p.lon, 3) + '°'))}</small></span></button><button class="icon-btn" type="button" data-favref="${ref}" aria-pressed="${fav}" aria-label="${esc(t(fav ? 'unfav' : 'fav'))}" title="${esc(t(fav ? 'unfav' : 'fav'))}">${ui(removable ? 'trash' : 'star', 'i' + (fav && !removable ? ' fill' : ''))}</button></li>`;
}
function renderLocLists() {
  const f = Favs.list(), r = Recents.list();
  if ($('#favList')) $('#favList').innerHTML = f.length ? f.map((p, i) => locItem(p, 'f' + i, true)).join('') : `<li class="muted" style="padding:6px 8px;font-size:13px">${esc(t('noSaved'))}</li>`;
  if ($('#recList')) $('#recList').innerHTML = r.length ? r.map((p, i) => locItem(p, 'h' + i)).join('') : `<li class="muted" style="padding:6px 8px;font-size:13px">${esc(t('noRecent'))}</li>`;
}
function resolveRef(ref) { const i = +ref.slice(1); return ref[0] === 'r' ? _results[i] : ref[0] === 'f' ? Favs.list()[i] : Recents.list()[i]; }
async function useMyLocation() {
  toast(t('locating'));
  try {
    const p = await geolocate(); closeSheets();
    const nm = await reverseName(p.lat, p.lon);
    setLocation({ lat: p.lat, lon: p.lon, name: nm ? nm.name : t('myLocation'), admin: nm ? nm.admin : '', country: nm ? nm.country : '', cc: nm ? nm.cc : '', tz: localZone() });
  } catch (e) {
    const ip = await ipLocate();
    if (ip) { closeSheets(); setLocation(ip); toast(t('approxLoc'), 4000); } else toast(t('locFailed'), 4000);
  }
}
function presetOn(p) { const P = UNIT_PRESETS[p]; return Object.keys(P).every(k => S.units[k] === P[k]); }
function openSettings() {
  const sh = $('#setSheet'), U = S.units;
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  sh.innerHTML = sheetHead('setTitle', t('settings')) + `<div class="sheet-b">
    <h3 class="sec-t" style="margin-top:0">${esc(t('units'))}</h3>
    <div class="seg wide" role="group" aria-label="${esc(t('units'))}">${['metric', 'imperial', 'uk', 'nautical'].map(p => `<button type="button" data-preset="${p}" aria-pressed="${presetOn(p)}">${esc(t('preset_' + p))}</button>`).join('')}</div>
    <div class="set-grid">
      <label for="uTemp">${esc(t('temperature'))}${sel('uTemp', U.temp, [['C', '°C'], ['F', '°F']])}</label>
      <label for="uWind">${esc(t('wind'))}${sel('uWind', U.wind, [['kmh', 'km/h'], ['ms', 'm/s'], ['mph', 'mph'], ['kn', t('knots')], ['bft', 'Beaufort']])}</label>
      <label for="uPrecip">${esc(t('precipitation'))}${sel('uPrecip', U.precip, [['mm', 'mm · cm'], ['in', 'in']])}</label>
      <label for="uPress">${esc(t('pressure'))}${sel('uPress', U.pressure, [['hPa', 'hPa (mbar)'], ['mmHg', 'mmHg'], ['inHg', 'inHg'], ['kPa', 'kPa']])}</label>
      <label for="uDist">${esc(t('distance'))}${sel('uDist', U.dist, [['km', 'km · m'], ['mi', 'mi · ft']])}</label>
      <label for="uTime">${esc(t('timeFmt'))}${sel('uTime', U.time, [['24', t('h24')], ['12', t('h12')]])}</label>
    </div>
    <h3 class="sec-t">${esc(t('display'))}</h3>
    <div class="set-row"><span>${esc(t('theme'))}</span><div class="seg" role="group">${['auto', 'light', 'dark'].map(x => `<button type="button" data-theme-set="${x}" aria-pressed="${S.theme === x}">${esc(t('theme_' + x))}</button>`).join('')}</div></div>
    <div class="set-row"><label for="sAqi">${esc(t('aqiStd'))}</label>${sel('sAqi', S.aqi, [['eu', t('aqiEu')], ['us', t('aqiUs')]])}</div>
    <div class="set-row"><label for="sAnim">${esc(t('animations'))}</label><span class="switch"><input type="checkbox" id="sAnim"${S.anim ? ' checked' : ''}><span></span></span></div>
    <div class="set-row"><label for="sFade">${esc(t('fadeLbl'))}<br><small class="muted">${esc(t('fadeSub'))}</small></label><span class="set-range"><input type="range" id="sFade" min="0" max="90" step="10" value="${clamp(+S.adv.fade || 0, 0, 90)}"><output id="sFadeV" for="sFade">${esc(fmtPct(clamp(+S.adv.fade || 0, 0, 90)))}</output></span></div>
    <div class="set-row"><label for="sPlay">${esc(t('playSpeed'))}<br><small class="muted">${esc(t('playSpeedSub'))}</small></label>${sel('sPlay', String(S.adv.playMs), PLAY_STEPS.map(ms => [String(ms), fmtN(ms / 1000, ms % 1000 ? 1 : 0) + ' ' + t('secShort')]))}</div>
    <h3 class="sec-t">${esc(t('data'))}</h3>
    <div class="set-row"><label for="sModel">${esc(t('model'))}</label>${sel('sModel', S.adv.model, MODELS.map(([id]) => [id, modelLabel(id)]))}</div>
    <div class="set-row"><span>${esc(t('clearData'))}<br><small class="muted">${esc(t('clearDataSub'))}</small></span><button class="btn small" type="button" data-act="clearcache">${ui('trash')}${esc(t('clear'))}</button></div>
    <h3 class="sec-t">${esc(t('about'))}</h3>
    <div class="about"><p>${esc(t('about1'))}</p><p>${esc(t('about2'))}</p><p>${esc(t('about3'))}</p><p>${esc(t('about4'))}</p><p class="muted">Isobar v${APP_VERSION} · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · <a href="https://api.met.no/" target="_blank" rel="noopener">MET Norway</a> · <a href="https://wttr.in/" target="_blank" rel="noopener">wttr.in</a> · <a href="https://www.7timer.info/" target="_blank" rel="noopener">7Timer!</a> · <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a></p></div>
  </div>`;
  openSheet(sh);
}
function openAlerts(focusIdx) {
  const sh = $('#infoSheet'), A = App.alerts || [];
  sh.innerHTML = sheetHead('infoTitle', t('headsUp')) + `<div class="sheet-b"><div class="al-list">${A.map((a, i) => `<div class="al-item s${a.sev}"${i === focusIdx ? ' style="background:var(--surface-2);border-radius:0 8px 8px 0"' : ''}><h3>${esc(a.title)}</h3><p><b>${esc(a.when)}</b> · ${esc(a.detail)}</p></div>`).join('')}</div><p class="note">${esc(t('alDisclaimer'))}</p></div>`;
  openSheet(sh);
}

/* ---------- actions ---------- */
function switchLang() {
  S.lang = LANG === 'tr' ? 'en' : 'tr'; saveSettings();
  applyLang(); setStaticTexts(); renderLocName(); renderAll();
  toast(t('langSwitched'), 1800);
}
function speak() {
  if (!('speechSynthesis' in window) || !App.data) return;
  if (App.speaking) { speechSynthesis.cancel(); App.speaking = false; renderHero(); return; }
  const o = App.data, di = dayIdx(o), c = curOf(o), deg = v => fmtN(Units.t(v), 0) + ' ' + t('degrees');
  const text = t('speech', { place: App.loc.name, cond: wmoText(c.code), temp: deg(c.temp), feels: deg(c.feels), hi: deg(o.d.tmax[di]), lo: deg(o.d.tmin[di]) }) + ' ' + heroSummary(o).replace(/°/g, ' ' + t('degrees'));
  const u = new SpeechSynthesisUtterance(text.replace('−', '-')); u.lang = LANG === 'tr' ? 'tr-TR' : 'en-GB';
  const v = (speechSynthesis.getVoices() || []).find(x => x.lang && x.lang.toLowerCase().startsWith(LANG)); if (v) u.voice = v;
  u.onend = u.onerror = () => { App.speaking = false; renderHero(); };
  App.speaking = true; renderHero(); speechSynthesis.speak(u);
}
async function share() {
  const o = App.data; if (!o) return;
  const di = dayIdx(o), c = curOf(o), text = `${App.loc.name}: ${F.t(c.temp)}, ${wmoText(c.code)}. ${t('hiLo', { h: F.t(o.d.tmax[di]), l: F.t(o.d.tmin[di]) })}. ${heroSummary(o)}`;
  const url = /^https?:/.test(location.protocol) ? location.href : '';
  if (navigator.share) { try { await navigator.share({ title: 'Isobar · ' + App.loc.name, text, url: url || undefined }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + (url ? '\n' + url : '')); toast(t('copied')); } catch (e) { toast(t('shareFail')); }
}
function clearCache() { Cache.clearAll(); App.normals = null; App.normalsState = ''; toast(t('cacheCleared')); if (App.mode === 'advanced') renderClimate(); }
function makeTouchIcon() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, '#16324f'); g.addColorStop(1, '#0b1620'); x.fillStyle = g; x.fillRect(0, 0, 180, 180);
    x.strokeStyle = 'rgba(240,160,51,.95)'; x.lineWidth = 7; x.lineCap = 'round';
    for (const [r, a] of [[78, 0.9], [56, 0.75], [34, 0.6]]) { x.globalAlpha = a; x.beginPath(); x.ellipse(108, 112, r * 1.15, r, -0.2, Math.PI * 0.95, Math.PI * 2.05); x.stroke(); }
    x.globalAlpha = 1; x.fillStyle = '#fff'; x.beginPath(); x.arc(108, 112, 9, 0, 6.283); x.fill();
    const png = c.toDataURL('image/png');
    $('#touchIcon').setAttribute('href', png);
    /* installable on Android/desktop when served over http(s): a generated manifest */
    if (/^https?:$/.test(location.protocol)) {
      const base = location.href.split('#')[0];
      const man = { name: 'Isobar Weather', short_name: 'Isobar', start_url: base, scope: base.replace(/[^/]*$/, ''), display: 'standalone', background_color: '#090f15', theme_color: '#0f1d27', icons: [{ src: png, sizes: '180x180', type: 'image/png', purpose: 'any' }] };
      const link = document.createElement('link'); link.rel = 'manifest';
      link.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' }));
      document.head.appendChild(link);
    }
  } catch (e) { /* ignore */ }
}

/* ---------- events ---------- */
function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('button,[data-close],a'); if (!el) { if (e.target.id === 'backdrop') closeSheets(); return; }
    const d = el.dataset;
    if (el.id === 'locBtn') return openLocSheet();
    if (el.id === 'settingsBtn') return openSettings();
    if (el.id === 'langBtn') return switchLang();
    if (el.id === 'refreshBtn') { App.extrasFor = ''; return refresh(); }
    if (el.id === 'unitBtn') { S.units.temp = S.units.temp === 'C' ? 'F' : 'C'; return onUnitsChanged(); }
    if (el.id === 'useMyLoc') return useMyLocation();
    if (el.id === 'csvBtn') return exportCSV();
    if (el.id === 'mapPlay') return MapView.togglePlay();
    if (el.id === 'mapPrev') return MapView.stepTime(-1);
    if (el.id === 'mapNext') return MapView.stepTime(1);
    if (el.id === 'mapUpd') return MapView.ensureGrid(true);
    if (el.id === 'mapRecenter') return MapView.recenter();
    if (d.close !== undefined) return closeSheets();
    if (d.mode) return setMode(d.mode);
    if (d.hstep) { S.hourStep = +d.hstep; saveSettings(); return renderHourly(); }
    if (d.dv) { S.dailyView = d.dv; saveSettings(); return renderDaily(); }
    if (d.chips) return ChipScroll.step(el);
    if (d.strip) return MapView.stripPage(+d.strip);
    if (d.actId) { S.activity = d.actId; saveSettings(); return renderActivities(); }
    if (d.alert !== undefined) return openAlerts(+d.alert);
    if (d.pick) { const p = resolveRef(d.pick); if (p) { closeSheets(); setLocation(p); } return; }
    if (d.favref) { const p = resolveRef(d.favref); if (!p) return; if (d.favref[0] === 'f') Favs.remove(p); else Favs.toggle(p); renderLocLists(); const ul = $('#results'); if (ul && _results.length) ul.innerHTML = _results.map((r, i) => locItem(r, 'r' + i)).join(''); if (App.data) renderHero(); return; }
    if (d.act === 'speak') return speak();
    if (d.act === 'share') return share();
    if (d.act === 'fav') { if (App.loc) { const on = Favs.toggle(App.loc); toast(t(on ? 'savedPlace' : 'removedPlace')); renderHero(); } return; }
    if (d.act === 'clearcache') return clearCache();
    if (d.open) { setMode('advanced'); setTimeout(() => { const card = $(d.open === 'aq' ? '#advAQ' : '#advMarine'); if (card) card.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }, 120); return; }
    if (d.range) { S.adv.range = d.range; saveSettings(); renderMeteogram(); return renderTable(); }
    if (d.astep) { S.adv.step = +d.astep; saveSettings(); renderMeteogram(); return renderTable(); }
    if (d.panel) { const p = S.adv.panels; S.adv.panels = p.includes(d.panel) ? p.filter(x => x !== d.panel) : PANEL_ORDER.filter(k => k === d.panel || p.includes(k)); saveSettings(); return renderMeteogram(); }
    if (d.load) { if (d.load === 'normals') App.normalsFor = ''; else App[d.load + 'For'] = ''; return loadExtra(d.load); }
    if (d.aqi) { S.aqi = d.aqi; saveSettings(); renderAQCard(); return renderFooter(); }
    if (d.layer) { S.adv.layer = d.layer; saveSettings(); MapView.renderCard(); return MapView.applyLayer(); }
    if (d.mtoggle) { S.adv[d.mtoggle] = !S.adv[d.mtoggle]; saveSettings(); el.setAttribute('aria-pressed', String(S.adv[d.mtoggle])); if (d.mtoggle === 'grey') return MapView.setBase(); MapView.drawField(); return MapView.restartParticles(); }
    if (d.mscale) { S.adv.scale = d.mscale; saveSettings(); MapView._frame = null; MapView.syncControls(); MapView.drawField(); return MapView.renderLegend(); }
    if (d.tjump !== undefined) return MapView.jumpTo(+d.tjump);
    if (d.goto) { const [lat, lon] = d.goto.split(',').map(Number); if (MapView.map) MapView.map.closePopup(); return setLocation({ lat, lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, coords: true }); }
    if (d.preset) { Object.assign(S.units, UNIT_PRESETS[d.preset]); onUnitsChanged(); return openSettings(); }
    if (d.themeSet) { S.theme = d.themeSet; saveSettings(); applyTheme(); renderAll(); MapView.themeChanged(); return openSettings(); }
    if (d.heatmap) { S.heatmap = d.heatmap; saveSettings(); $$('[data-heatmap]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.heatmap === S.heatmap))); if (App.data && App.mode === 'basic') renderDaily(); return; }
  });
  $('#backdrop').addEventListener('click', closeSheets);
  document.addEventListener('change', e => {
    const el = e.target, v = el.value;
    const unitMap = { uTemp: 'temp', uWind: 'wind', uPrecip: 'precip', uPress: 'pressure', uDist: 'dist', uTime: 'time' };
    if (unitMap[el.id]) { S.units[unitMap[el.id]] = v; onUnitsChanged(); $$('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(presetOn(b.dataset.preset)))); return; }
    if (el.id === 'sAqi') { S.aqi = v; saveSettings(); return renderAll(); }
    if (el.id === 'sFade') { S.adv.fade = +v; saveSettings(); return MapView.drawField(); }
    if (el.id === 'sPlay') { S.adv.playMs = +v; saveSettings(); if (MapView.playing) { MapView.stopPlay(); MapView.startPlay(); } return; }
    if (el.id === 'sAnim') { S.anim = el.checked; saveSettings(); applyTheme(); renderAll(); HeroFX.loop(); return MapView.restartParticles(); }
    if (el.id === 'sModel' || el.id === 'advModel') { S.adv.model = v; saveSettings(); const c = Cache.get(App.loc, v); if (c) { App.data = c; renderAll(); } return refresh(); }
    if (el.id === 'mapBase') { S.adv.base = v; saveSettings(); return MapView.setBase(); }
    if (el.id === 'cmpVar') { S.adv.cmpVar = v; saveSettings(); return renderModels(); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'mapTime') MapView.onTime(+e.target.value);
    if (e.target.id === 'sFade') { S.adv.fade = +e.target.value; const o = $('#sFadeV'); if (o) o.textContent = fmtPct(S.adv.fade); MapView.drawField(); }
  });
  document.addEventListener('toggle', e => {
    const dd = e.target; if (!dd.classList || !dd.classList.contains('dd') || !dd.open) return;
    const box = dd.querySelector('.d-exp'); if (box && !box.dataset.done && App.data) { box.innerHTML = dayDetail(App.data, +dd.dataset.day); box.dataset.done = '1'; }
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#backdrop').hidden) { e.preventDefault(); return closeSheets(); }
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey || !$('#backdrop').hidden) return;
    if (e.key === '/') { e.preventDefault(); openLocSheet(); }
    else if (e.key === 'r') refresh();
    else if (e.key === 'm') setMode(App.mode === 'basic' ? 'advanced' : 'basic');
    else if (e.key === 'u') { S.units.temp = S.units.temp === 'C' ? 'F' : 'C'; onUnitsChanged(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { MapView.stopParticles(); return; }
    if (App.data && Date.now() - App.data.fetchedAt > 15 * 60e3) refresh(); else if (App.data) renderHero();
    if (App.mode === 'advanced') MapView.restartParticles();
  });
  window.addEventListener('online', () => { if (App.loc) refresh(); });
  window.addEventListener('offline', () => { if (App.data) showBanner(t('offlineStale', { t: ago(App.data.fetchedAt) }), 'err'); });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'auto') { applyTheme(); renderAll(); MapView.themeChanged(); } });
  setInterval(() => { if (document.hidden || !App.data) return; if (Date.now() - App.data.fetchedAt > 30 * 60e3) refresh(); else renderHero(); }, 5 * 60e3);
}

/* ---------- start ---------- */
/* First visit: show Karabiga straight away, then move to the device location if the user shares it. */
async function firstRun() {
  setLocation({ ...HOME }, { noRecent: true });
  let p;
  try { p = await geolocate(); } catch (e) { toast(t('locDenied'), 5500); return; }
  if (haversine(p.lat, p.lon, HOME.lat, HOME.lon) < 2) return;
  const nm = await reverseName(p.lat, p.lon);
  setLocation({ lat: p.lat, lon: p.lon, name: nm ? nm.name : t('myLocation'), admin: nm ? nm.admin : '', country: nm ? nm.country : '', cc: nm ? nm.cc : '', tz: localZone() });
}
function init() {
  applyLang(); applyTheme(); setStaticTexts();
  $('#heroIso').innerHTML = isobarSvg();
  HeroFX.init(); makeTouchIcon(); bindEvents();
  const fromHash = parseHash(), last = Store.get('lastLoc', null);
  Net.listeners.add(debounce(() => { if (App.mode === 'advanced' && App.data && $('#advSources')) renderSources(); }, 600));
  if (fromHash) {
    const known = [last, ...Favs.list(), ...Recents.list()].find(l => l && isNum(l.lat) && sameLoc(l, fromHash));
    setLocation(known ? { ...known } : fromHash, { noRecent: true });
  }
  else if (last && isNum(last.lat)) setLocation(last, { noRecent: true });
  else firstRun();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
