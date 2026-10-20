/* =====================================================================
   Advanced mode: readout, meteogram, ensemble, model comparison,
   climate normals, air quality, marine, astronomy, data table, sources
   ===================================================================== */
const Charts = new Map();
function mountChart(id, host, cfg) { const old = Charts.get(id); if (old && old.host === host && host.isConnected && host.firstElementChild) { old.update(cfg); return old; } if (old) old.destroy(); const c = new TimeChart(host, cfg); Charts.set(id, c); return c; }
const cvT = v => Units.t(v), cvW = v => Units.w(v), cvP = v => Units.p(v), cvPr = v => Units.pr(v), cvH = v => Units.ht(v);
const SUM_KEYS = new Set(['precip', 'rain', 'showers', 'snow', 'sun', 'et0']);
const MAX_KEYS = new Set(['pop', 'wg', 'uv', 'uvClear', 'cape']);

function ensureAdvSkeleton() {
  const v = $('#advView'); if (v.dataset.built === LANG) return;
  v.dataset.built = LANG;
  v.innerHTML = `<div class="adv-grid">
    <section class="card span2" id="advNow"></section>
    <section class="card span2" id="advMap"></section>
    <section class="card span2" id="advMeteo"></section>
    <section class="card" id="advAstro"></section>
    <section class="card" id="advMarine"></section>
    <section class="card" id="advModels"></section>
    <section class="card" id="advAQ"></section>
    <section class="card" id="advEns"></section>
    <section class="card" id="advClimate"></section>
    <section class="card span2" id="advTable"></section>
    <section class="card span2" id="advSources"></section></div>`;
  Lazy.observe();
}
function renderAdvanced() {
  ensureAdvSkeleton();
  renderAdvNow(); MapView.renderCard(); renderMeteogram();
  renderEnsemble(); renderModels(); renderClimate(); renderAQCard(); renderMarineCard(); renderAstro(); renderTable(); renderSources();
  Lazy.observe();
}

/* lazy loaders for heavier extras */
const Lazy = {
  io: null,
  observe() {
    if (!('IntersectionObserver' in window)) { ['advEns', 'advModels'].forEach(id => this.trigger(id)); return; }
    if (this.io) this.io.disconnect();
    this.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) this.trigger(e.target.id); }), { rootMargin: '200px' });
    ['advEns', 'advModels', 'advMap'].forEach(id => { const el = document.getElementById(id); if (el) this.io.observe(el); });
  },
  trigger(id) {
    if (App.mode !== 'advanced' || !App.data || App.data.provider !== 'Open-Meteo') { if (id === 'advMap') MapView.activate(); return; }
    if (id === 'advEns') loadExtra('ens');
    else if (id === 'advModels') loadExtra('models');
    else if (id === 'advMap') MapView.activate();
  }
};
async function loadExtra(kind) {
  const key = kind + 'For', locKey = App.loc ? App.loc.lat.toFixed(3) + ',' + App.loc.lon.toFixed(3) : '';
  if (App[key] === locKey && (App[kind] || App[kind + 'State'] === 'loading')) return;
  App[key] = locKey; App[kind + 'State'] = 'loading'; App[kind] = null;
  const render = { ens: renderEnsemble, models: renderModels, normals: renderClimate }[kind];
  render();
  try {
    const fn = { ens: getEnsemble, models: getModels, normals: getNormals }[kind];
    const r = await fn(App.loc);
    if (App[key] !== locKey) return;
    App[kind] = r; App[kind + 'State'] = 'ok';
  } catch (e) { if (App[key] !== locKey) return; App[kind + 'State'] = 'error'; App[kind + 'Err'] = e.message; }
  if (App.mode === 'advanced') render();
}

/* Current conditions, grouped by theme. Each group has a coloured icon, one lead value and
   smaller supporting values, so the panel reads at a glance instead of as a wall of numbers. */
function renderAdvNow() {
  const o = App.data, c = curOf(o), H = o.h, i0 = hourIdx(o), D = o.d, di = dayIdx(o);
  const p3 = H.pmsl[Math.max(0, i0 - 3)], dp = isNum(p3) && isNum(c.pmsl) ? c.pmsl - p3 : null;
  const trend = !isNum(dp) ? '' : dp > 1 ? '↑ ' + t('pRising') : dp < -1 ? '↓ ' + t('pFalling') : '→ ' + t('pSteady');
  const capeCat = v => (!isNum(v) ? '' : v < 300 ? t('capeLow') : v < 1000 ? t('capeMod') : v < 2500 ? t('capeHigh') : t('capeExt'));
  const b = isNum(c.ws) ? bft(c.ws) : null, uvc = uvCat(H.uv[i0]), dew = c.dew ?? H.dew[i0];
  const has = v => v != null && v !== '' && v !== '–';
  const lmh = hasData([H.cloudL[i0], H.cloudM[i0], H.cloudH[i0]]) ? `${t('cLow')} ${fmtPct(H.cloudL[i0])} · ${t('cMid')} ${fmtPct(H.cloudM[i0])} · ${t('cHigh')} ${fmtPct(H.cloudH[i0])}` : '';
  /* item: [label, value, note]; the first item of a group is its lead value */
  const groups = [
    { k: 'grpTemp', icon: 'thermo', col: '--c-temp', items: [[t('temperature'), F.t1(c.temp), t('feelsLike', { v: F.t1(c.feels) })], [t('dewPoint'), F.t1(dew), dewComfort(dew)], [t('humidity'), fmtPct(c.rh)], [t('wetBulb'), F.t1(H.wetbulb[i0])]] },
    { k: 'grpWind', icon: 'wind', col: '--c-wind', lead: isNum(c.wd) ? windArrow(c.wd, 22) : '', items: [[t('wind'), F.w(c.ws), isNum(c.wd) ? t('fromDir', { d: compass(c.wd), deg: fmtN(c.wd, 0) }) + (LANG === 'tr' ? ' · ' + trWind(c.wd) : '') : ''], [t('gusts'), F.w(c.wg)], [t('wind80'), isNum(H.ws80[i0]) ? F.w(H.ws80[i0]) : null], [t('beaufort'), isNum(b) ? String(b) : null, isNum(b) ? t('bft' + b) : '']] },
    { k: 'grpPress', icon: 'gauge', col: '--c-press', items: [[t('pressureMsl'), F.pr(c.pmsl), trend], [t('pressureSfc'), isNum(c.psfc) ? F.pr(c.psfc) : null], [t('clouds'), fmtPct(c.cloud ?? H.cloud[i0]), lmh], [t('visibility'), isNum(H.vis[i0]) ? F.d(H.vis[i0]) : null, visCat(H.vis[i0])]] },
    { k: 'grpRain', icon: 'umbrella', col: '--c-rain', items: [[t('precipNow'), F.p(c.precip ?? H.precip[i0] ?? 0), ''], [t('nextHourChance'), fmtPct(H.pop[i0 + 1])], [t('uv'), isNum(H.uv[i0]) ? fmtN(H.uv[i0], 1) : null, isNum(H.uv[i0]) ? uvc.k : ''], [t('radiation'), isNum(H.swr[i0]) ? fmtN(H.swr[i0], 0) + NB + 'W/m²' : null], [t('snowDepth'), isNum(H.snowDepth[i0]) && H.snowDepth[i0] > 0 ? F.sd(H.snowDepth[i0]) : null]] },
    { k: 'grpAtmos', icon: 'bolt', col: '--c-cape', items: [['CAPE', isNum(H.cape[i0]) ? fmtN(H.cape[i0], 0) + NB + 'J/kg' : null, capeCat(H.cape[i0])], [t('liftedIndex'), isNum(H.li[i0]) ? fmtN(H.li[i0], 1) : null], ['CIN', isNum(H.cin[i0]) ? fmtN(H.cin[i0], 0) + NB + 'J/kg' : null], [t('freezingLevel'), isNum(H.fzl[i0]) ? F.ht(H.fzl[i0]) : null], [t('boundaryLayer'), isNum(H.pbl[i0]) ? F.ht(H.pbl[i0]) : null]] },
    { k: 'grpGround', icon: 'leaf', col: '--c-dew', items: [[t('soilTemp'), isNum(H.soilT[i0]) ? F.t1(H.soilT[i0]) : null], [t('soilMoist'), isNum(H.soilM[i0]) ? fmtN(H.soilM[i0], 3) + NB + 'm³/m³' : null], ['ET₀ ' + t('today'), isNum(D.et0[di]) ? F.p(D.et0[di]) : null], ['VPD', isNum(H.vpd[i0]) ? fmtN(H.vpd[i0], 2) + NB + 'kPa' : null], [t('elevation'), isNum(o.elev) ? F.ht(o.elev) : null]] }
  ];
  const html = groups.map(g => {
    const items = g.items.filter(x => x && has(x[1])); if (!items.length) return '';
    const [lead, ...rest] = items;
    return `<section class="ng" style="--gc:var(${g.col})"><h3 class="ng-h"><span class="ng-i">${ui(g.icon)}</span>${esc(t(g.k))}</h3>
      <div class="ni-lead"><b class="ni-v">${esc(lead[1])}</b>${g.lead && lead[0] === t('wind') ? `<span class="ni-arrow">${g.lead}</span>` : ''}<span class="ni-ls"><span class="ni-l">${esc(lead[0])}</span>${lead[2] ? `<span class="ni-s">${esc(lead[2])}</span>` : ''}</span></div>
      ${rest.length ? `<dl class="ni-grid">${rest.map(([l, v, s]) => `<div class="ni"><dt>${esc(l)}</dt><dd>${esc(v)}${s ? `<small>${esc(s)}</small>` : ''}</dd></div>`).join('')}</dl>` : ''}</section>`;
  }).join('');
  $('#advNow').innerHTML = `<div class="card-h"><h2 class="card-t">${ui('gauge')}${esc(t('nowDetail'))}</h2><span class="muted" style="font-size:12.5px">${esc(o.provider)}${o.provider === 'Open-Meteo' ? ' · ' + esc(modelLabel(o.model)) : ''} · ${esc(fmtTime(c.t || Date.now()))}</span></div><div class="ngrid">${html}</div>`;
}

/* ---------- series for the chosen range and step ---------- */
function advRangeIdx(o) {
  const H = o.h, i0 = hourIdx(o), r = S.adv.range; let a, b;
  if (r === '48h') { a = Math.max(0, i0 - 6); b = Math.min(H.t.length, i0 + 49); }
  else { const ds = TZ.dayStart(Date.now()); a = H.t.findIndex(x => x >= ds); if (a < 0) a = 0; b = r === '7d' ? Math.min(H.t.length, a + 7 * 24 + 1) : H.t.length; }
  while (b > a + 2 && !isNum(H.temp[b - 1])) b--;
  return [a, b];
}
/* Every row at time T describes the period that starts at T: instant values are read at T,
   sums/maxima/codes come from the following hour(s) (Open-Meteo stores them on the hour they end). */
const FWD_KEYS = new Set(['precip', 'rain', 'showers', 'snow', 'sun', 'et0', 'pop', 'wg', 'code']);
function aggregate(o, a, b, step) {
  const H = o.h, n = H.t.length, out = { t: [], idx: [] }; for (const k of H_KEYS) out[k] = [];
  let s = a; if (step === 3) while (s < b && TZ.parts(H.t[s]).h % 3 !== 0) s++;
  for (let i = s; i < b; i += step) {
    out.t.push(H.t[i]); out.idx.push(i);
    const fw = range(i + 1, Math.min(n, i + 1 + step));
    for (const k of H_KEYS) {
      if (FWD_KEYS.has(k)) { const arr = pick(H[k], fw); out[k].push(!fw.length ? null : k === 'code' ? worstCode(arr) : SUM_KEYS.has(k) ? sumOf(arr) : maxOf(arr)); }
      else if (step === 3 && MAX_KEYS.has(k)) out[k].push(maxOf(pick(H[k], range(i, Math.min(n, i + 3)))));
      else out[k].push(H[k][i]);
    }
  }
  return out;
}
function advSeries(o) { const [a, b] = advRangeIdx(o); return aggregate(o, a, b, S.adv.step); }

const PANEL_ORDER = ['temp', 'precip', 'cloud', 'wind', 'pressure', 'humidity', 'uv', 'vis', 'instab', 'freezing', 'solar', 'soil', 'et'];
function panelDefs(A) {
  const step = S.adv.step, n = A.t.length;
  const rainD = A.precip.map((v, i) => { const r = (A.rain[i] ?? 0) + (A.showers[i] ?? 0); return isNum(v) ? cvP(Math.min(v, hasData([A.rain[i], A.showers[i]]) ? r : v)) : null; });
  const snowD = A.precip.map((v, i) => { if (!isNum(v)) return null; const r = (A.rain[i] ?? 0) + (A.showers[i] ?? 0); return hasData([A.rain[i], A.showers[i]]) ? cvP(Math.max(0, v - r)) : 0; });
  const fT = v => fmtN(v, 1) + '°', fW = v => fmtN(v, Units.dec.w()) + NB + Units.label.w(), fP = v => fmtN(v, S.units.precip === 'in' ? 2 : 1) + NB + Units.label.p();
  const defs = {
    temp: { title: t('pTemp'), unit: Units.label.t(), h: 160, topPad: 30, need: A.temp, series: [
      { type: 'icons', data: A.code, isDay: A.isDay },
      { type: 'line', label: t('dewPoint'), color: '--c-dew', width: 1.5, data: A.dew.map(cvT), fmt: fT },
      { type: 'line', label: t('feelsShort'), color: '--c-feels', width: 1.5, dash: [4, 3], data: A.feels.map(cvT), fmt: fT },
      { type: 'line', label: t('temperature'), color: '--c-temp', width: 2.4, data: A.temp.map(cvT), fmt: fT }] },
    precip: { title: t('precipitation'), unit: Units.label.p() + ' · %', h: 110, zeroBase: true, include: [0, cvP(step === 3 ? 1.5 : 0.5)], right: { range: [0, 100], fmt: v => fmtN(v, 0) + '%' }, need: A.precip, series: [
      { type: 'bar', label: t('rain'), color: '--c-rain', data: rainD, fmt: fP, shift: step * HOUR / 2 },
      { type: 'bar', label: t('snowWater'), color: '--c-snow', data: snowD, stackOn: rainD, fmt: fP, shift: step * HOUR / 2 },
      { type: 'line', axis: 'right', label: t('probability'), color: '--c-pop', width: 1.4, data: A.pop, fmt: v => fmtPct(v) },
      { type: 'line', hidden: true, noScale: true, label: t('snowfall'), color: '--c-snow', data: A.snow.map(v => (isNum(v) && v > 0 ? Units.sn(v) : null)), fmt: v => fmtN(v, 1) + NB + Units.label.sn() }] },
    cloud: { title: t('clouds'), unit: '%', h: 66, fixed: [0, 100], noGrid: true, need: [...A.cloudL, ...A.cloud], series: [
      { type: 'strip', color: '--c-cloud', rows: [{ label: t('cHigh'), data: A.cloudH }, { label: t('cMid'), data: A.cloudM }, { label: t('cLow'), data: A.cloudL }] },
      { type: 'line', hidden: true, label: t('cTotal'), color: '--c-cloud', data: A.cloud, fmt: v => fmtPct(v) }] },
    wind: { title: t('wind'), unit: Units.label.w(), h: 115, zeroBase: true, include: [0], need: A.ws, series: [
      { type: 'area', label: t('gusts'), color: '--c-gust', alpha: 0.13, width: 1.2, data: A.wg.map(cvW), fmt: fW },
      { type: 'line', label: t('wind'), color: '--c-wind', width: 2.2, data: A.ws.map(cvW), fmt: fW },
      { type: 'arrows', label: t('direction'), color: '--text-2', data: A.wd, yData: A.ws.map(cvW), tipFmt: i => (isNum(A.wd[i]) ? compass(A.wd[i]) + ' ' + fmtN(A.wd[i], 0) + '°' : '') }] },
    pressure: { title: t('pressureMsl'), unit: Units.label.pr(), h: 90, need: A.pmsl, tickFmt: v => fmtN(v, Units.dec.pr()), series: [{ type: 'line', label: t('pressure'), color: '--c-press', width: 2, data: A.pmsl.map(cvPr), fmt: v => fmtN(v, Units.dec.pr() + (S.units.pressure === 'hPa' ? 1 : 0)) + NB + Units.label.pr() }] },
    humidity: { title: t('humidity'), unit: '%', h: 80, fixed: [0, 100], need: A.rh, series: [{ type: 'line', label: t('humidity'), color: '--c-rh', width: 1.8, data: A.rh, fmt: v => fmtPct(v) }] },
    uv: { title: t('uv'), unit: '', h: 80, zeroBase: true, include: [0, 3], need: A.uv, series: [{ type: 'bar', label: t('uv'), color: '--c-uv', colorFn: v => uvCat(v).c, data: A.uv, fmt: v => fmtN(v, 1) + ' · ' + uvCat(v).k }] },
    vis: { title: t('visibility'), unit: Units.label.d(), h: 75, zeroBase: true, include: [0], need: A.vis, series: [{ type: 'area', label: t('visibility'), color: '--c-cloud', alpha: 0.15, width: 1.6, data: A.vis.map(m => Units.d(m)), fmt: v => fmtN(v, 1) + NB + Units.label.d() }] },
    instab: { title: 'CAPE · ' + t('liftedIndex'), unit: 'J/kg · °C', h: 90, zeroBase: true, include: [0, 100], right: { fmt: v => fmtN(v, 0) }, need: A.cape, series: [
      { type: 'bar', label: 'CAPE', color: '--c-cape', data: A.cape, fmt: v => fmtN(v, 0) + NB + 'J/kg' },
      { type: 'line', axis: 'right', label: t('liftedIndex'), color: '--c-li', width: 1.5, data: A.li, fmt: v => fmtN(v, 1) }] },
    freezing: { title: t('freezingLevel'), unit: Units.label.ht(), h: 80, zeroBase: true, need: A.fzl, series: [{ type: 'line', label: t('freezingLevel'), color: '--c-snow', width: 2, data: A.fzl.map(cvH), fmt: v => fmtN(v, 0) + NB + Units.label.ht() }] },
    solar: { title: t('radiation'), unit: 'W/m²', h: 80, zeroBase: true, include: [0], need: A.swr, series: [{ type: 'area', label: t('radiation'), color: '--c-sun', alpha: 0.22, width: 1.5, data: A.swr, fmt: v => fmtN(v, 0) + NB + 'W/m²' }] },
    soil: { title: t('soil'), unit: Units.label.t() + ' · m³/m³', h: 80, right: { fmt: v => fmtN(v, 2) }, need: A.soilT, series: [
      { type: 'line', label: t('soilTemp'), color: '--c-temp', width: 1.8, data: A.soilT.map(cvT), fmt: fT },
      { type: 'line', axis: 'right', label: t('soilMoist'), color: '--c-rain', width: 1.6, data: A.soilM, fmt: v => fmtN(v, 3) }] },
    et: { title: 'ET₀ · VPD', unit: Units.label.p() + ' · kPa', h: 80, zeroBase: true, include: [0], right: { fmt: v => fmtN(v, 1) }, need: A.et0, series: [
      { type: 'bar', label: 'ET₀', color: '--c-dew', data: A.et0.map(cvP), fmt: v => fmtN(v, 2) + NB + Units.label.p(), shift: step * HOUR / 2 },
      { type: 'line', axis: 'right', label: 'VPD', color: '--c-feels', width: 1.5, data: A.vpd, fmt: v => fmtN(v, 2) + NB + 'kPa' }] }
  };
  void n;
  return defs;
}
function renderMeteogram() {
  const o = App.data, el = $('#advMeteo');
  const A = advSeries(o), defs = panelDefs(A), avail = PANEL_ORDER.filter(k => hasData(defs[k].need));
  const panels = S.adv.panels.filter(k => avail.includes(k));
  const modelOpts = MODELS.map(([id, , days]) => `<option value="${id}"${id === S.adv.model ? ' selected' : ''}>${esc(modelLabel(id))}${id === 'best_match' ? '' : ' · ' + days + ' ' + t('daysShort')}</option>`).join('');
  const isOM = o.provider === 'Open-Meteo';
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('chart')}${esc(t('meteogram'))}</h2>
    <div class="toolbar">
      <label class="fld" for="advModel">${esc(t('model'))}<select id="advModel">${modelOpts}</select></label>
      <div class="seg" role="group" aria-label="${esc(t('range'))}">${['48h', '7d', '15d'].map(r => `<button type="button" data-range="${r}" aria-pressed="${S.adv.range === r}">${esc(t('r' + r))}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="${esc(t('resolution'))}"><button type="button" data-astep="1" aria-pressed="${S.adv.step === 1}">${esc(t('step1h'))}</button><button type="button" data-astep="3" aria-pressed="${S.adv.step === 3}">${esc(t('step3h'))}</button></div>
    </div></div>
    ${o.modelFallback ? `<p class="card-sub">${esc(t('modelFell', { m: modelLabel(o.modelFallback) }))}</p>` : ''}
    ${!isOM ? `<p class="card-sub">${esc(t('fallbackLimited', { p: o.provider }))}</p>` : ''}
    <div class="pchips" role="group" aria-label="${esc(t('panels'))}">${PANEL_ORDER.map(k => `<button type="button" class="chip" data-panel="${k}" aria-pressed="${panels.includes(k)}"${avail.includes(k) ? '' : ' disabled'}>${esc(t('pn_' + k))}</button>`).join('')}</div>
    <div id="meteoHost"></div>
    <p class="note">${esc(t('meteoNote'))}</p>`;
  const ppx = S.adv.range === '48h' ? 0 : (S.adv.step === 1 ? 5 : 15);
  mountChart('meteo', $('#meteoHost'), { times: A.t, isDay: A.isDay, now: Date.now(), pxPerStep: ppx, panels: panels.map(k => defs[k]), scrollTo: Date.now() - 6 * HOUR });
}

/* ---------- ensemble ---------- */
function renderEnsemble() {
  const el = $('#advEns'); if (!el) return;
  const head = `<div class="card-h"><h2 class="card-t">${ui('layers')}${esc(t('ensemble'))}</h2>${App.ens ? `<span class="muted" style="font-size:12px">${esc(modelLabel(App.ens.model))} · ${App.ens.n} ${esc(t('members'))}</span>` : ''}</div>`;
  if (App.data.provider !== 'Open-Meteo') { el.innerHTML = head + `<div class="empty-state">${esc(t('needOM'))}</div>`; return; }
  if (!App.ens) { el.innerHTML = head + lazyBody(App.ensState, App.ensErr, 'ens'); return; }
  const E = App.ens, o = App.data, det = E.t.map(tt => { const i = o.h.t.indexOf(tt); return i >= 0 ? o.h.temp[i] : null; });
  const days = E.days;
  el.innerHTML = head + `<p class="card-sub">${esc(t('ensIntro'))}</p><div id="ensHost"></div>
    <div class="lgd"><span><i style="background:${withAlpha(cssVars().g('--c-temp'), 0.25)};height:8px"></i>${esc(t('ens1090'))}</span><span><i style="background:${withAlpha(cssVars().g('--c-temp'), 0.5)};height:8px"></i>${esc(t('ens2575'))}</span><span><i style="background:var(--c-temp)"></i>${esc(t('median'))}</span><span><i style="background:var(--text-2)"></i>${esc(t('thisForecast'))}</span></div>
    <h3 class="sec-t">${esc(t('ensRainChance'))}</h3>
    <div class="prob-row" style="--n:${days.t.length}">${days.t.map((tt, i) => `<div title="${esc(fmtDate(tt + 6 * HOUR))}: ≥1 mm ${esc(fmtPct(days.prob1[i]))} · ≥10 mm ${esc(fmtPct(days.prob10[i]))}"><em>${esc(fmtN(days.prob1[i], 0))}</em><i style="height:${Math.max(2, days.prob1[i])}%;opacity:${0.35 + days.prob1[i] / 160}"></i><span>${esc(wd2(tt + 6 * HOUR))}</span></div>`).join('')}</div>
    <p class="note">${esc(t('ensNote'))}</p>`;
  const fT = v => fmtN(v, 1) + '°';
  mountChart('ens', $('#ensHost'), { times: E.t, now: Date.now(), pxPerStep: 0, panels: [{ title: t('pTemp'), unit: Units.label.t(), h: 170, series: [
    { type: 'band', label: '10–90 %', color: '--c-temp', alpha: 0.18, data: E.p10.map(cvT), data2: E.p90.map(cvT), noTip: true },
    { type: 'band', label: '25–75 %', color: '--c-temp', alpha: 0.32, data: E.p25.map(cvT), data2: E.p75.map(cvT), noTip: true },
    { type: 'line', label: t('median'), color: '--c-temp', width: 2, data: E.p50.map(cvT), fmt: fT },
    { type: 'line', label: t('thisForecast'), color: '--text-2', width: 1.3, dash: [3, 3], data: det.map(cvT), fmt: fT },
    { type: 'line', hidden: true, label: '10–90 %', color: '--c-temp', data: E.p10.map(cvT), tipFmt: i => fT(cvT(E.p10[i])) + ' … ' + fT(cvT(E.p90[i])) }] }] });
}
function lazyBody(state, err, kind) {
  if (state === 'loading' || state === '' || state == null) return '<div class="skel"></div>';
  if (state === 'error') return `<div class="empty-state">${esc(t('loadFailed'))} ${esc(err || '')}<button class="btn small" type="button" data-load="${kind}">${esc(t('retry'))}</button></div>`;
  return `<div class="empty-state"><button class="btn small" type="button" data-load="${kind}">${esc(t('load'))}</button></div>`;
}

/* ---------- model comparison ---------- */
/* Model comparison for temperature, wind speed, gusts or precipitation (accumulated from now). */
const CMP_VARS = ['temp', 'wind', 'gust', 'precip'];
function renderModels() {
  const el = $('#advModels'); if (!el) return;
  const v = CMP_VARS.includes(S.adv.cmpVar) ? S.adv.cmpVar : 'temp';
  const sel = `<label class="fld" for="cmpVar">${esc(t('cmpVar'))}<select id="cmpVar">${CMP_VARS.map(k => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t('cv_' + k))}</option>`).join('')}</select></label>`;
  const head = `<div class="card-h"><h2 class="card-t">${ui('chart')}${esc(t('models'))}</h2>${sel}</div>`;
  if (App.data.provider !== 'Open-Meteo') { el.innerHTML = head + `<div class="empty-state">${esc(t('needOM'))}</div>`; return; }
  if (!App.models) { el.innerHTML = head + lazyBody(App.modelsState, App.modelsErr, 'models'); return; }
  const M = App.models, cols = ['--m1', '--m2', '--m3', '--m4', '--m5', '--m6', '--m7', '--m8'], css = cssVars();
  const di0 = Math.max(0, M.dt.findIndex(x => TZ.parts(x + 6 * HOUR).key === TZ.parts(Date.now()).key));
  const days = range(di0, M.dt.length);
  const now = Date.now(), n = M.t.length, idx = range(0, n).filter(i => i % 3 === 0), T = pick(M.t, idx);
  /* per variable: daily value for the table, chart series, formatting and agreement thresholds (km/h, mm, °C) */
  const cfg = {
    temp: { day: m => m.tmax, series: m => pick(m.temp, idx).map(cvT), unit: Units.label.t(), title: t('pTemp'), fmtTip: x => fmtN(x, 1) + '°', cell: x => F.t(x), spread: x => fmtN(Units.dt(x), 0) + '°', ok: 2, warn: 4 },
    wind: { day: m => m.wsMax, series: m => pick(m.ws, idx).map(cvW), unit: Units.label.w(), title: t('cv_wind'), fmtTip: x => fmtN(x, Units.dec.w()) + NB + Units.label.w(), cell: x => F.w(x, false), spread: x => F.w(x, false), ok: 8, warn: 15, tint: x => rgbCss(scaleRGB('wind', x), 0.3) },
    gust: { day: m => m.wgMax, series: m => idx.map(i => cvW(maxOf(m.wg.slice(Math.max(0, i - 2), i + 1)))), unit: Units.label.w(), title: t('cv_gust'), fmtTip: x => fmtN(x, Units.dec.w()) + NB + Units.label.w(), cell: x => F.w(x, false), spread: x => F.w(x, false), ok: 10, warn: 20, tint: x => rgbCss(scaleRGB('wind', x), 0.3) },
    precip: {
      day: m => m.psum,
      series: m => { let acc = 0; const out = new Array(n).fill(null); for (let i = 0; i < n; i++) { if (M.t[i] <= now || !isNum(m.precip[i])) continue; acc += m.precip[i]; out[i] = cvP(acc); } return pick(out, idx); },
      unit: Units.label.p(), title: t('accPrecip'), fmtTip: x => fmtN(x, S.units.precip === 'in' ? 2 : 1) + NB + Units.label.p(), cell: x => F.p(x, false), spread: x => F.p(x, false), ok: 3, warn: 10, tint: x => (x >= 0.5 ? withAlpha(css.g('--c-rain'), clamp(0.12 + x / 25, 0.12, 0.6)) : '')
    }
  }[v];
  const spread = days.map(i => { const vals = M.models.map(m => cfg.day(m)[i]).filter(isNum); return vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null; });
  const agree = s => (!isNum(s) ? '' : s < cfg.ok ? 'var(--ok)' : s < cfg.warn ? 'var(--warn)' : 'var(--bad)');
  const tbl = `<div class="tblwrap" style="margin-top:12px"><table class="dt mtbl"><thead><tr><th>${esc(t('model'))}</th>${days.map(i => `<th>${esc(fmtWeekday(M.dt[i] + 6 * HOUR).slice(0, 3))}<br>${TZ.parts(M.dt[i] + 6 * HOUR).d}</th>`).join('')}</tr></thead><tbody>
    ${M.models.map((m, k) => `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(${cols[k % 8]});margin-right:6px"></span>${esc(m.label)}</td>${days.map(i => { const x = cfg.day(m)[i], bg = isNum(x) && cfg.tint ? cfg.tint(x) : ''; const tip = v === 'temp' ? `${t('maxMin')}: ${F.t(m.tmax[i])} / ${F.t(m.tmin[i])}` : ''; return `<td${tip ? ` title="${esc(tip)}"` : ''} style="${bg ? 'background:' + bg : ''}">${isNum(x) ? esc(cfg.cell(x)) : '–'}</td>`; }).join('')}</tr>`).join('')}
    <tr><td><b>${esc(t('spread'))}</b></td>${spread.map(s => `<td style="color:${agree(s)};font-weight:700">${isNum(s) ? esc(cfg.spread(s)) : '–'}</td>`).join('')}</tr></tbody></table></div>`;
  el.innerHTML = head + `<p class="card-sub">${esc(t('modelsIntro'))}</p><div id="modelsHost"></div><div class="lgd">${M.models.map((m, k) => `<span><i style="background:var(${cols[k % 8]})"></i>${esc(m.label)}</span>`).join('')}</div>${tbl}<p class="note">${esc(t('modelsNote_' + v))}</p>`;
  mountChart('models', $('#modelsHost'), { times: T, now, pxPerStep: 9, scrollTo: now - 12 * HOUR, panels: [{ title: cfg.title, unit: cfg.unit, h: 190, zeroBase: v !== 'temp', include: v === 'temp' ? null : [0], series: M.models.map((m, k) => ({ type: 'line', label: m.label, color: cols[k % 8], width: 1.6, data: cfg.series(m), fmt: cfg.fmtTip })) }] });
}

/* ---------- climate normals ---------- */
function renderClimate() {
  const el = $('#advClimate'); if (!el) return;
  const head = `<div class="card-h"><h2 class="card-t">${ui('calendar')}${esc(t('climate'))}</h2></div>`;
  if (!App.normals) {
    el.innerHTML = head + `<p class="card-sub">${esc(t('climIntro'))}</p>` + (App.normalsState === 'loading' ? '<div class="skel"></div>' : App.normalsState === 'error' ? `<div class="empty-state">${esc(t('loadFailed'))} ${esc(App.normalsErr || '')}<button class="btn small" type="button" data-load="normals">${esc(t('retry'))}</button></div>` : `<div class="empty-state"><button class="btn primary small" type="button" data-load="normals">${ui('download')}${esc(t('climLoad'))}</button><span>${esc(t('climLoadNote'))}</span></div>`);
    return;
  }
  const N = App.normals, o = App.data, D = o.d, di = dayIdx(o), idx = range(di, D.t.length).filter(i => isNum(D.tmax[i]));
  const doy = i => { const p = TZ.parts(D.t[i] + 6 * HOUR); return doyLeap(p.m, p.d); };
  const nx = idx.map(i => N.tmax[doy(i)]), nn = idx.map(i => N.tmin[doy(i)]);
  const anomMax = meanOf(idx.map((i, k) => (isNum(D.tmax[i]) && isNum(nx[k]) ? D.tmax[i] - nx[k] : null)));
  const anomMin = meanOf(idx.map((i, k) => (isNum(D.tmin[i]) && isNum(nn[k]) ? D.tmin[i] - nn[k] : null)));
  const fcP = sumOf(pick(D.precip, idx)), nP = sumOf(idx.map(i => N.prcp[doy(i)]));
  const sign = v => (v >= 0 ? '+' : '−') + fmtN(Math.abs(Units.dt(v)), 1) + '°';
  const recs = idx.filter((i, k) => isNum(N.rmax[doy(i)]) && D.tmax[i] >= N.rmax[doy(i)]).map(i => dayDate(D.t[i]));
  const fT = v => fmtN(v, 1) + '°';
  el.innerHTML = head + `<dl class="kv"><div><dt>${esc(t('climAnomMax'))}</dt><dd>${esc(sign(anomMax))}</dd></div><div><dt>${esc(t('climAnomMin'))}</dt><dd>${esc(sign(anomMin))}</dd></div><div><dt>${esc(t('climPrecip'))}</dt><dd>${esc(F.p(fcP))} / ${esc(F.p(nP))}</dd></div></dl>
    ${recs.length ? `<p class="card-sub" style="margin-top:10px;color:var(--bad)">${esc(t('climRecord', { d: recs.join(', ') }))}</p>` : ''}
    <div id="climHost" style="margin-top:10px"></div>
    <div class="lgd"><span><i style="background:var(--c-cloud);height:8px;opacity:.35"></i>${esc(t('climBand'))}</span><span><i style="background:var(--c-temp)"></i>${esc(t('fcMax'))}</span><span><i style="background:var(--c-rain)"></i>${esc(t('fcMin'))}</span><span><i style="background:var(--bad);opacity:.6"></i>${esc(t('climRecords'))}</span></div>
    <p class="note">${esc(t('climNote'))}${N.years && N.years < 30 ? ' ' + esc(t('climYears', { n: N.years })) : ''}</p>`;
  mountChart('clim', $('#climHost'), { times: idx.map(i => D.t[i] + 12 * HOUR), daily: true, pxPerStep: 0, panels: [{ title: t('pTemp'), unit: Units.label.t(), h: 190, series: [
    { type: 'band', label: t('climBand'), color: '--c-cloud', alpha: 0.28, data: nn.map(cvT), data2: nx.map(cvT), noTip: true },
    { type: 'line', label: t('climRecMax'), color: '--bad', width: 1, dash: [2, 3], data: idx.map(i => cvT(N.rmax[doy(i)])), fmt: fT },
    { type: 'line', label: t('climRecMin'), color: '--c-pop', width: 1, dash: [2, 3], data: idx.map(i => cvT(N.rmin[doy(i)])), fmt: fT },
    { type: 'line', label: t('normMax'), hidden: true, color: '--c-cloud', data: nx.map(cvT), fmt: fT },
    { type: 'line', label: t('normMin'), hidden: true, color: '--c-cloud', data: nn.map(cvT), fmt: fT },
    { type: 'line', label: t('fcMax'), color: '--c-temp', width: 2.3, data: pick(D.tmax, idx).map(cvT), fmt: fT },
    { type: 'line', label: t('fcMin'), color: '--c-rain', width: 2.3, data: pick(D.tmin, idx).map(cvT), fmt: fT }] }] });
}

/* ---------- air quality ---------- */
function renderAQCard() {
  const el = $('#advAQ'); if (!el) return;
  const head = `<div class="card-h"><h2 class="card-t">${ui('leaf')}${esc(t('airQuality'))}</h2><div class="seg" role="group"><button type="button" data-aqi="eu" aria-pressed="${S.aqi === 'eu'}">EAQI</button><button type="button" data-aqi="us" aria-pressed="${S.aqi === 'us'}">US AQI</button></div></div>`;
  const aq = App.aq;
  if (!aq) { el.innerHTML = head + `<div class="empty-state">${esc(App.aqState === 'loading' ? t('loadingShort') : t('aqNone'))}</div>`; return; }
  const v = S.aqi === 'us' ? aq.cur.us : aq.cur.eu, cat = aqiCat(v, S.aqi), mp = mainPollutant(aq.cur);
  const pol = ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co', 'dust'].filter(k => isNum(aq.cur[k]));
  const now = Date.now(), pIdx = range(0, aq.t.length).filter(i => TZ.parts(aq.t[i]).key === TZ.parts(now).key);
  const pollen = Object.keys(aq.pollen).map(k => ({ k, v: maxOf(pick(aq.pollen[k], pIdx)) })).filter(x => isNum(x.v)).sort((a, b) => b.v - a.v);
  el.innerHTML = head + `<div class="row2" style="justify-content:flex-start;gap:14px;align-items:center"><div class="big" style="font:500 40px/1 var(--font-display)">${esc(fmtN(v, 0))}</div><div><span class="pill" style="background:${cat.c};color:${inkOn(cat.c)}">${esc(cat.k)}</span>${mp ? `<div class="sub" style="margin-top:4px">${esc(t('mainPoll', { p: POLL_NAMES[mp.k] }))} · ${esc(t('whoRatio', { v: fmtN(mp.ratio, 1) }))}</div>` : ''}</div></div>
    <div class="pol">${pol.map(k => `<div><span>${esc(POLL_NAMES[k])}</span><b>${esc(fmtN(aq.cur[k], k === 'co' ? 0 : 1))}</b> <small>µg/m³</small></div>`).join('')}</div>
    <div id="aqHost" style="margin-top:12px"></div>
    ${pollen.length ? `<h3 class="sec-t">${esc(t('pollenToday'))}</h3><div class="pol">${pollen.map(p => `<div><span>${esc(t('pol_' + p.k))}</span><b>${esc(fmtN(p.v, 0))}</b> <small>${esc(pollenLevel(p.v))}</small></div>`).join('')}</div>` : ''}
    <p class="note">${esc(t('aqNote'))}</p>`;
  const series = S.aqi === 'us' ? aq.us : aq.eu;
  mountChart('aq', $('#aqHost'), { times: aq.t, now, pxPerStep: 0, panels: [{ title: S.aqi === 'us' ? 'US AQI' : 'EAQI', unit: '', h: 110, zeroBase: true, include: [0], series: [
    { type: 'bar', label: S.aqi === 'us' ? 'US AQI' : 'EAQI', color: '--c-cloud', colorFn: x => aqiCat(x, S.aqi).c, data: series, fmt: x => fmtN(x, 0) + ' · ' + aqiCat(x, S.aqi).k, frac: 0.9 },
    { type: 'line', hidden: true, label: 'PM2.5', color: '--c-temp', data: aq.pm25, fmt: x => fmtN(x, 1) + NB + 'µg/m³' },
    { type: 'line', hidden: true, label: 'O₃', color: '--c-pop', data: aq.o3, fmt: x => fmtN(x, 0) + NB + 'µg/m³' }] }] });
}

/* ---------- marine ---------- */
function renderMarineCard() {
  const el = $('#advMarine'); if (!el) return;
  const head = `<div class="card-h"><h2 class="card-t">${ui('wave')}${esc(t('marine'))}</h2></div>`;
  const m = App.marine;
  if (!m) { el.innerHTML = head + `<div class="empty-state">${esc(App.marineState === 'loading' ? t('loadingShort') : t('marineNone'))}</div>`; return; }
  const now = Date.now(), j = Math.max(0, m.t.findIndex(x => x > now) - 1);
  const fH = v => fmtN(v, 1) + NB + Units.label.ht();
  el.innerHTML = head + `<dl class="kv"><div><dt>${esc(t('waves'))}</dt><dd>${esc(F.wv(m.wave[j]))} · ${esc(compass(m.waveDir[j]))}</dd></div><div><dt>${esc(t('period'))}</dt><dd>${esc(fmtN(m.wavePer[j], 1))} s</dd></div><div><dt>${esc(t('swell'))}</dt><dd>${esc(F.wv(m.swell[j]))} · ${esc(compass(m.swellDir[j]))}</dd></div><div><dt>${esc(t('windWaves'))}</dt><dd>${esc(F.wv(m.windWave[j]))}</dd></div><div><dt>${esc(t('seaTemp'))}</dt><dd>${esc(F.t1(m.sst[j]))}</dd></div>${isNum(m.dist) ? `<div><dt>${esc(t('gridDist'))}</dt><dd>${esc(fmtN(m.dist, 0))} km</dd></div>` : ''}</dl>
    <div id="marineHost" style="margin-top:12px"></div><p class="note">${esc(t('marineNote'))}</p>`;
  const cvHt = v => (isNum(v) ? (S.units.dist === 'mi' ? v * 3.28084 : v) : null);
  mountChart('marine', $('#marineHost'), { times: m.t, now, pxPerStep: 4, scrollTo: now - 6 * HOUR, panels: [{ title: t('waves'), unit: Units.label.ht() + ' · s', h: 130, zeroBase: true, include: [0], right: { fmt: v => fmtN(v, 0) + ' s' }, series: [
    { type: 'area', label: t('waves'), color: '--c-rain', alpha: 0.2, width: 2, data: m.wave.map(cvHt), fmt: fH },
    { type: 'line', label: t('swell'), color: '--c-press', width: 1.5, data: m.swell.map(cvHt), fmt: fH },
    { type: 'arrows', label: t('direction'), color: '--text-2', data: m.waveDir, yData: m.wave.map(cvHt), tipFmt: i => compass(m.waveDir[i]) },
    { type: 'line', axis: 'right', label: t('period'), color: '--c-gust', width: 1.2, dash: [3, 3], data: m.wavePer, fmt: v => fmtN(v, 1) + ' s' }] }] });
}

/* ---------- sun & moon ---------- */
function renderAstro() {
  const el = $('#advAstro'); if (!el) return;
  const o = App.data, now = Date.now(), ds = TZ.dayStart(now), st = Astro.sunTimes(ds + 12 * HOUR, o.lat, o.lon), pos = Astro.sunPos(now, o.lat, o.lon), noon = Astro.sunPos(st.solarNoon, o.lat, o.lon);
  const ill = Astro.moonIllum(now), mt = Astro.moonTimes(ds, o.lat, o.lon), mp = Astro.moonPos(now, o.lat, o.lon);
  const nf = Astro.nextPhase(now, 0.5), nn = Astro.nextPhase(now, 0), deg = r => fmtN(r * 180 / Math.PI, 1) + '°';
  const ft = v => (isNum(v) ? fmtTime(v) : '–');
  const age = ill.phase * 29.53;
  const seg = [['night', ds, st.nightEnd], ['astro', st.nightEnd, st.nauticalDawn], ['naut', st.nauticalDawn, st.dawn], ['civil', st.dawn, st.sunrise], ['day', st.sunrise, st.sunset], ['civil', st.sunset, st.dusk], ['naut', st.dusk, st.nauticalDusk], ['astro', st.nauticalDusk, st.night], ['night', st.night, ds + 24 * HOUR]];
  const COL = { night: '#0b1430', astro: '#1d2c58', naut: '#2f4b86', civil: '#5b80bf', day: '#9fcaf0' };
  const segHtml = seg.filter(([, a, b]) => isNum(a) && isNum(b) && b > a).map(([k, a, b]) => `<span style="width:${((b - a) / DAY * 100).toFixed(2)}%;background:${COL[k]}" title="${esc(t('tw_' + k))}: ${esc(ft(a))}–${esc(ft(b))}"></span>`).join('');
  const nowPct = ((now - ds) / DAY * 100).toFixed(2);
  const golden = isNum(st.goldenHour) ? `${ft(st.goldenHour)}–${ft(st.sunset)}` : '–', goldenAm = isNum(st.goldenHourEnd) ? `${ft(st.sunrise)}–${ft(st.goldenHourEnd)}` : '–';
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('sun')}${esc(t('astro'))}</h2></div>
    <dl class="kv">
      <div><dt>${esc(t('dawnCivil'))}</dt><dd>${esc(ft(st.dawn))}</dd></div><div><dt>${esc(t('sunrise'))}</dt><dd>${esc(ft(st.sunrise))}</dd></div>
      <div><dt>${esc(t('solarNoon'))}</dt><dd>${esc(ft(st.solarNoon))} · ${esc(deg(noon.altitude))}</dd></div><div><dt>${esc(t('sunset'))}</dt><dd>${esc(ft(st.sunset))}</dd></div>
      <div><dt>${esc(t('duskCivil'))}</dt><dd>${esc(ft(st.dusk))}</dd></div><div><dt>${esc(t('goldenHour'))}</dt><dd>${esc(goldenAm)}<br>${esc(golden)}</dd></div>
      <div><dt>${esc(t('sunNow'))}</dt><dd>${esc(deg(pos.altitude))} · ${esc(compass((pos.azimuth * 180 / Math.PI + 180) % 360))}</dd></div><div><dt>${esc(t('nautAstro'))}</dt><dd>${esc(ft(st.nauticalDawn))} / ${esc(ft(st.nightEnd))}</dd></div>
    </dl>
    <div class="dbar" role="img" aria-label="${esc(t('twilightBar'))}">${segHtml}<b style="left:${nowPct}%"></b></div>
    <div class="dbar-ax"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    <div class="row2" style="margin-top:14px;justify-content:flex-start;gap:14px">${moonSvg(ill.fraction, ill.phase, 64, o.lat < 0)}
      <dl class="kv" style="flex:1"><div><dt>${esc(t('moon'))}</dt><dd>${esc(t(moonPhaseKey(ill.phase)))}</dd></div><div><dt>${esc(t('illumShort'))}</dt><dd>${esc(fmtPct(ill.fraction * 100))} · ${esc(t('ageDays', { v: fmtN(age, 1) }))}</dd></div>
      <div><dt>${esc(t('moonrise'))} / ${esc(t('moonset'))}</dt><dd>${esc(mt.rise ? ft(mt.rise) : '–')} / ${esc(mt.set ? ft(mt.set) : '–')}</dd></div><div><dt>${esc(t('moonNow'))}</dt><dd>${esc(deg(mp.altitude))} · ${esc(fmtN(mp.distance, 0))} km</dd></div>
      <div><dt>${esc(t('nextFull'))}</dt><dd>${esc(nf ? fmtDate(nf) : '–')}</dd></div><div><dt>${esc(t('nextNew'))}</dt><dd>${esc(nn ? fmtDate(nn) : '–')}</dd></div></dl></div>`;
}

/* ---------- data table & CSV ---------- */
function tableCols(A) {
  const P = Units.label.p(), d1 = v => fmtN(v, 1), d0 = v => fmtN(v, 0);
  const cols = [
    { k: 'code', h: t('weather'), cell: (i) => wxIcon(A.code[i], A.isDay[i], 18) + esc(wmoText(A.code[i])), csv: i => wmoText(A.code[i]), cls: 'wxc' },
    { k: 'temp', h: t('temperature') + ' ' + Units.label.t(), v: i => cvT(A.temp[i]), f: d1 },
    { k: 'feels', h: t('feelsShort') + ' ' + Units.label.t(), v: i => cvT(A.feels[i]), f: d1 },
    { k: 'dew', h: t('dewPoint') + ' ' + Units.label.t(), v: i => cvT(A.dew[i]), f: d1 },
    { k: 'wetbulb', h: t('wetBulb') + ' ' + Units.label.t(), v: i => cvT(A.wetbulb[i]), f: d1 },
    { k: 'rh', h: t('humidity') + ' %', v: i => A.rh[i], f: d0 },
    { k: 'precip', h: t('precipitation') + ' ' + P, v: i => cvP(A.precip[i]), f: v => fmtN(v, S.units.precip === 'in' ? 2 : 1) },
    { k: 'pop', h: t('probability') + ' %', v: i => A.pop[i], f: d0 },
    { k: 'snow', h: t('snowfall') + ' ' + Units.label.sn(), v: i => Units.sn(A.snow[i]), f: d1 },
    { k: 'snowDepth', h: t('snowDepth') + ' ' + Units.label.sn(), v: i => Units.sd(A.snowDepth[i]), f: d0 },
    { k: 'cloud', h: t('clouds') + ' %', v: i => A.cloud[i], f: d0 },
    { k: 'cloudL', h: t('cLow') + ' %', v: i => A.cloudL[i], f: d0 },
    { k: 'cloudM', h: t('cMid') + ' %', v: i => A.cloudM[i], f: d0 },
    { k: 'cloudH', h: t('cHigh') + ' %', v: i => A.cloudH[i], f: d0 },
    { k: 'vis', h: t('visibility') + ' ' + Units.label.d(), v: i => Units.d(A.vis[i]), f: d1 },
    { k: 'ws', h: t('wind') + ' ' + Units.label.w(), v: i => cvW(A.ws[i]), f: v => fmtN(v, Units.dec.w()) },
    { k: 'wg', h: t('gusts') + ' ' + Units.label.w(), v: i => cvW(A.wg[i]), f: v => fmtN(v, Units.dec.w()) },
    { k: 'wd', h: t('direction'), v: i => A.wd[i], f: v => compass(v) + ' ' + fmtN(v, 0) + '°' },
    { k: 'ws80', h: t('wind80') + ' ' + Units.label.w(), v: i => cvW(A.ws80[i]), f: v => fmtN(v, Units.dec.w()) },
    { k: 'pmsl', h: t('pressureMsl') + ' ' + Units.label.pr(), v: i => cvPr(A.pmsl[i]), f: v => fmtN(v, Units.dec.pr() + (S.units.pressure === 'hPa' ? 1 : 0)) },
    { k: 'psfc', h: t('pressureSfc') + ' ' + Units.label.pr(), v: i => cvPr(A.psfc[i]), f: v => fmtN(v, Units.dec.pr()) },
    { k: 'uv', h: t('uv'), v: i => A.uv[i], f: d1 },
    { k: 'cape', h: 'CAPE J/kg', v: i => A.cape[i], f: d0 },
    { k: 'li', h: t('liftedIndex'), v: i => A.li[i], f: d1 },
    { k: 'cin', h: 'CIN J/kg', v: i => A.cin[i], f: d0 },
    { k: 'fzl', h: t('freezingLevel') + ' ' + Units.label.ht(), v: i => cvH(A.fzl[i]), f: d0 },
    { k: 'pbl', h: t('boundaryLayer') + ' ' + Units.label.ht(), v: i => cvH(A.pbl[i]), f: d0 },
    { k: 'swr', h: t('radiation') + ' W/m²', v: i => A.swr[i], f: d0 },
    { k: 'sun', h: t('sunshine') + ' min', v: i => (isNum(A.sun[i]) ? A.sun[i] / 60 : null), f: d0 },
    { k: 'et0', h: 'ET₀ ' + P, v: i => cvP(A.et0[i]), f: v => fmtN(v, 2) },
    { k: 'vpd', h: 'VPD kPa', v: i => A.vpd[i], f: v => fmtN(v, 2) },
    { k: 'soilT', h: t('soilTemp') + ' ' + Units.label.t(), v: i => cvT(A.soilT[i]), f: d1 },
    { k: 'soilM', h: t('soilMoist') + ' m³/m³', v: i => A.soilM[i], f: v => fmtN(v, 3) }
  ];
  const allZero = k => !(A[k] || []).some(v => isNum(v) && v !== 0);
  return cols.filter(c => c.k === 'code' || (hasData(A[c.k]) && !(['snow', 'snowDepth', 'showers'].includes(c.k) && allZero(c.k))));
}
function renderTable() {
  const el = $('#advTable'); if (!el) return;
  const o = App.data, A = advSeries(o), cols = tableCols(A), now = Date.now();
  let rows = '', prevKey = '';
  for (let i = 0; i < A.t.length; i++) {
    const key = TZ.parts(A.t[i]).key;
    if (key !== prevKey) { rows += `<tr class="dsep"><td colspan="${cols.length + 1}">${esc(fmtDateLong(A.t[i]))}</td></tr>`; prevKey = key; }
    rows += `<tr${A.t[i] < now - HOUR * S.adv.step ? ' style="opacity:.55"' : ''}><td>${esc(fmtTime(A.t[i]))}</td>${cols.map(c => (c.cell ? `<td class="${c.cls || ''}">${c.cell(i)}</td>` : `<td>${esc(isNum(c.v(i)) ? c.f(c.v(i)) : '–')}</td>`)).join('')}</tr>`;
  }
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('table')}${esc(t('dataTable'))}</h2><div class="toolbar"><span class="muted" style="font-size:12.5px">${esc(t('tableInfo', { n: A.t.length, s: S.adv.step }))}</span><button class="btn small" type="button" id="csvBtn">${ui('download')}${esc(t('exportCsv'))}</button></div></div>
    <div class="tblwrap dt-big"><table class="dt"><thead><tr><th>${esc(t('time'))}</th>${cols.map(c => `<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function exportCSV() {
  const o = App.data, A = advSeries(o), cols = tableCols(A);
  const commaDec = fmtN(1.5, 1).includes(','), sep = commaDec ? ';' : ',';
  const q = s => { s = String(s == null ? '' : s); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const nf = (v, d) => (isNum(v) ? (commaDec ? v.toFixed(d).replace('.', ',') : v.toFixed(d)) : '');
  const lines = [[t('time') + ' (' + o.tz + ')', ...cols.map(c => c.h)].map(q).join(sep)];
  for (let i = 0; i < A.t.length; i++) {
    const p = TZ.parts(A.t[i]);
    const ts = `${p.key} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
    lines.push([ts, ...cols.map(c => (c.csv ? c.csv(i) : c.k === 'wd' ? (isNum(c.v(i)) ? Math.round(c.v(i)) : '') : nf(c.v(i), ['rh', 'pop', 'cloud', 'cloudL', 'cloudM', 'cloudH', 'cape', 'cin', 'fzl', 'pbl', 'swr', 'sun'].includes(c.k) ? 0 : (['soilM'].includes(c.k) ? 3 : 2))))].map(q).join(sep));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'), name = (App.loc && App.loc.name ? App.loc.name : 'forecast').toLocaleLowerCase(LOCALE).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  a.href = URL.createObjectURL(blob); a.download = `isobar-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(t('csvDone'));
}

/* ---------- sources & status ---------- */
function renderSources() {
  const el = $('#advSources'); if (!el) return;
  const latest = new Map(); for (const r of Net.log) if (!latest.has(r.service)) latest.set(r.service, r);
  const o = App.data;
  const links = [['Open-Meteo', 'https://open-meteo.com/'], ['MET Norway', 'https://api.met.no/'], ['wttr.in', 'https://wttr.in/'], ['7Timer!', 'https://www.7timer.info/'], ['RainViewer', 'https://www.rainviewer.com/api.html'], ['NASA GIBS', 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api'], ['OpenStreetMap', 'https://www.openstreetmap.org/copyright'], ['CARTO', 'https://carto.com/attributions'], ['Esri', 'https://www.esri.com/']];
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('info')}${esc(t('sources'))}</h2><button class="btn small" type="button" data-act="clearcache">${ui('trash')}${esc(t('clearCache'))}</button></div>
    <p class="card-sub">${esc(t('chainNote'))}</p>
    <ul class="src-list">${[...latest.values()].map(r => `<li><span><b>${esc(r.service)}</b> <small>${esc(r.host)}</small>${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</span><span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✕'} ${esc(r.ms + ' ms')}</span></li>`).join('') || `<li>${esc(t('noRequests'))}</li>`}</ul>
    <p class="note">${esc(t('dataFor', { lat: fmtN(o.lat, 4), lon: fmtN(o.lon, 4), tz: o.tz }))}${o.fallbackErrors ? ' · ' + esc(t('fallbackWhy', { e: o.fallbackErrors.map(x => x[0] + ': ' + x[1]).join('; ') })) : ''}${o.filled && o.filled.vars && o.filled.vars.length ? ' · ' + esc(t('filledVars', { v: o.filled.vars.join(', ') })) : ''}</p>
    <p class="note">${links.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join(' · ')}</p>`;
}
