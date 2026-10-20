/* =====================================================================
   Insights: plain-language summary, derived alerts, outlook, activities
   ===================================================================== */
function isWetHour(o, i) {
  const H = o.h, p = H.precip[i], pp = H.pop[i], c = H.code[i];
  if (i < 0 || i >= H.t.length) return false;
  if (isNum(p) && p >= 0.2) return !isNum(pp) || pp >= 25;
  if (isNum(pp) && pp >= 65) return true;
  return isPrecipCode(c) && (!isNum(pp) || pp >= 45) && (!isNum(p) || p > 0);
}
function wetKind(o, i) {
  const H = o.h, c = H.code[i];
  if (isThunderCode(c)) return 'thunder';
  if (isSnowCode(c) || (isNum(H.snow[i]) && H.snow[i] > 0.05 && !(H.rain[i] > H.snow[i]))) return 'snow';
  if (c === 68 || c === 69) return 'sleet';
  return 'rain';
}
/* Hourly sums and codes at index j describe the hour that ends at H.t[j]. */
function heroSummary(o) {
  const H = o.h, i0 = hourIdx(o), end = Math.min(H.t.length, i0 + 14), s = [], c = curOf(o);
  const curWet = (isNum(c.precip) && c.precip >= 0.1 && isPrecipCode(c.code)) || isWetHour(o, i0 + 1);
  if (curWet) {
    let j = i0 + 2; while (j < end && isWetHour(o, j)) j++;
    const k = isWetHour(o, i0 + 1) ? wetKind(o, i0 + 1) : (isSnowCode(c.code) ? 'snow' : isThunderCode(c.code) ? 'thunder' : 'rain');
    s.push(j >= end ? t('sumWetAll_' + k) : t('sumWetUntil_' + k, { time: fmtTime(H.t[j - 1]) }));
  } else {
    let j = i0 + 1; while (j < end && !isWetHour(o, j)) j++;
    if (j < end) { const k = wetKind(o, j); s.push(t('sumWetFrom_' + k, { time: fmtTime(H.t[j - 1]) })); if (k === 'rain' || k === 'thunder') s.push(t('sumUmbrella')); }
    else s.push(t('sumDry12'));
  }
  const D = o.d, di = dayIdx(o), g = maxOf(pick(H.wg, range(i0, end))), hr = TZ.parts(Date.now()).h;
  if (isNum(g) && g >= 50) s.push(t('sumGusty', { v: F.w(g) }));
  else if (isNum(D.uvMax[di]) && D.uvMax[di] >= 6 && hr < 16 && !curWet) s.push(t('sumUV', { v: fmtN(D.uvMax[di], 0) }));
  else if (isNum(D.tmax[di + 1]) && isNum(D.tmax[di]) && Math.abs(D.tmax[di + 1] - D.tmax[di]) >= 4) s.push(t(D.tmax[di + 1] > D.tmax[di] ? 'sumTomWarmer' : 'sumTomCooler', { d: F.dtAbs(D.tmax[di + 1] - D.tmax[di]) }));
  else if (isNum(D.tmin[di + 1]) && D.tmin[di + 1] <= 0 && hr >= 12) s.push(t('sumFrostTonight'));
  return s.slice(0, 3).join(' ');
}

/* Derived heads-ups — computed from the forecast, not official warnings */
function buildAlerts(o, aq) {
  if (!o) return [];
  const H = o.h, D = o.d, now = Date.now(), i0 = hourIdx(o), di = dayIdx(o), out = [];
  const add = (type, sev, icon, title, when, detail) => { const ex = out.find(a => a.type === type); if (ex) { if (!ex.when.includes(when)) ex.when += ', ' + when; ex.sev = Math.max(ex.sev, sev); return; } out.push({ type, sev, icon, title, when, detail }); };
  for (let i = i0 + 1; i < H.t.length && H.t[i] <= now + 48 * HOUR; i++) {
    const c = H.code[i];
    if (isThunderCode(c)) { add('thunder', c >= 96 ? 3 : 2, 'bolt', t('alThunder'), dayLabel(H.t[i] - HOUR) + ' ' + fmtTime(H.t[i] - HOUR), t(c >= 96 ? 'alThunderHailD' : 'alThunderD')); break; }
  }
  for (let i = i0 + 1; i < H.t.length && H.t[i] <= now + 48 * HOUR; i++) {
    const c = H.code[i];
    if ([56, 57, 66, 67].includes(c)) { add('ice', 3, 'frost', t('alIce'), dayLabel(H.t[i] - HOUR) + ' ' + fmtTime(H.t[i] - HOUR), t('alIceD')); break; }
  }
  for (let i = i0; i < H.t.length && H.t[i] <= now + 24 * HOUR; i++) {
    if (isNum(H.vis[i]) && H.vis[i] < 1000) { add('fog', H.vis[i] < 200 ? 2 : 1, 'eye', t('alFog'), dayLabel(H.t[i]) + ' ' + fmtTime(H.t[i]), t('alFogD', { v: F.d(H.vis[i]) })); break; }
  }
  for (let k = 0; k < 3; k++) {
    const i = di + k; if (i >= D.t.length) break;
    const day = dayName(D.t[i]);
    if (isNum(D.precip[i]) && D.precip[i] >= 20) add('rain', D.precip[i] >= 50 ? 3 : 2, 'drop', t('alRain'), day, t('alRainD', { v: F.p(D.precip[i]) }));
    if (isNum(D.snow[i]) && D.snow[i] >= 2) add('snow', D.snow[i] >= 10 ? 3 : 2, 'snow', t('alSnow'), day, t('alSnowD', { v: F.sn(D.snow[i]) }));
    if (isNum(D.wgMax[i]) && D.wgMax[i] >= 60) add('wind', D.wgMax[i] >= 90 ? 3 : 2, 'wind', t('alWind'), day, t('alWindD', { v: F.w(D.wgMax[i]), b: t('bft' + bft(D.wgMax[i])) }));
    const hot = maxOf([D.fmax[i], D.tmax[i]]);
    if (isNum(hot) && hot >= 35) add('heat', hot >= 40 ? 3 : 2, 'flame', t('alHeat'), day, t('alHeatD', { v: F.t(hot) }));
    if (isNum(D.tmin[i]) && D.tmin[i] <= 0) add('frost', D.tmin[i] <= -10 ? 2 : 1, 'frost', t('alFrost'), day, t('alFrostD', { v: F.t(D.tmin[i]) }));
    if (isNum(D.uvMax[i]) && D.uvMax[i] >= 8) add('uv', D.uvMax[i] >= 11 ? 2 : 1, 'sun', t('alUV'), day, t('alUVD', { v: fmtN(D.uvMax[i], 0) }));
  }
  if (aq && aq.cur) {
    const eu = aq.cur.eu, us = aq.cur.us;
    if ((S.aqi === 'eu' && isNum(eu) && eu > 80) || (S.aqi === 'us' && isNum(us) && us > 150)) add('aq', 2, 'leaf', t('alAQ'), t('now'), t('alAQD', { v: fmtN(S.aqi === 'us' ? us : eu, 0), c: aqiCat(S.aqi === 'us' ? us : eu, S.aqi).k }));
  }
  return out.sort((a, b) => b.sev - a.sev);
}

function buildOutlook(o) {
  const out = buildOutlookDays(o);
  if (App.nc2h === 'dry') out.unshift({ icon: 'umbrella', tone: 'dry', text: t('ncNone') });
  return out;
}
function buildOutlookDays(o) {
  const D = o.d, di = dayIdx(o), out = [];
  const fut = range(di + 1, D.t.length).filter(i => isNum(D.tmax[i]));
  if (fut.length < 2) return out;
  let wi = fut[0], ci = fut[0];
  for (const i of fut) { if (D.tmax[i] > D.tmax[wi]) wi = i; if (D.tmax[i] < D.tmax[ci]) ci = i; }
  out.push({ icon: 'thermo', tone: 'warm', text: t('olWarmest', { day: dayDate(D.t[wi]), v: F.t(D.tmax[wi]) }) });
  if (ci !== wi) out.push({ icon: 'thermo', tone: 'cool', text: t('olCoolest', { day: dayDate(D.t[ci]), v: F.t(D.tmax[ci]) }) });
  let pi = null; for (const i of fut) if (isNum(D.precip[i]) && (pi === null || D.precip[i] > D.precip[pi])) pi = i;
  const dry = fut.filter(i => !(D.precip[i] >= 1)).length;
  if (pi !== null && D.precip[pi] >= 2) out.push({ icon: 'drop', tone: 'wet', text: t('olWettest', { day: dayDate(D.t[pi]), v: F.p(D.precip[pi]), dry, n: fut.length }) });
  else out.push({ icon: 'sun', tone: 'dry', text: t('olDry', { n: fut.length }) });
  let gi = null; for (const i of fut) if (isNum(D.wgMax[i]) && (gi === null || D.wgMax[i] > D.wgMax[gi])) gi = i;
  if (gi !== null && D.wgMax[gi] >= 40) out.push({ icon: 'wind', tone: 'wind', text: t('olWindiest', { day: dayDate(D.t[gi]), v: F.w(D.wgMax[gi]), d: compass(D.wdDom[gi]) }) });
  const wdOf = i => TZ.parts(D.t[i] + 12 * HOUR).wd, first = fut.find(i => wdOf(i) === 6 || wdOf(i) === 0);
  const wk = first == null ? [] : (wdOf(first) === 6 && fut.includes(first + 1) ? [first, first + 1] : [first]);
  if (wk.length) {
    const worst = worstCode(pick(D.code, wk));
    out.push({ icon: 'calendar', tone: 'neutral', text: t('olWeekend', { cond: wmoText(worst).toLocaleLowerCase(LOCALE), lo: F.t(minOf(pick(D.tmin, wk))), hi: F.t(maxOf(pick(D.tmax, wk))) }) });
  }
  if (fut.length >= 10) {
    const h = Math.floor(fut.length / 2), a = meanOf(pick(D.tmax, fut.slice(0, h))), b = meanOf(pick(D.tmax, fut.slice(h)));
    if (Math.abs(b - a) >= 2.5) out.push({ icon: b > a ? 'up' : 'down', tone: b > a ? 'warm' : 'cool', text: t(b > a ? 'olTrendWarm' : 'olTrendCool', { d: F.dtAbs(b - a) }) });
  }
  return out;
}

/* ---------- comfort & category helpers ---------- */
function dewComfort(dp) { if (!isNum(dp)) return ''; if (dp < 10) return t('cDry'); if (dp < 16) return t('cComf'); if (dp < 18) return t('cSlHumid'); if (dp < 21) return t('cHumid'); if (dp < 24) return t('cMuggy'); return t('cOppr'); }
function uvCat(u) { if (!isNum(u)) return { k: '–', c: 'var(--muted)' }; if (u < 3) return { k: t('uvLow'), c: '#3a9d50' }; if (u < 6) return { k: t('uvMod'), c: '#c9a400' }; if (u < 8) return { k: t('uvHigh'), c: '#e8741c' }; if (u < 11) return { k: t('uvVHigh'), c: '#d43a2b' }; return { k: t('uvExt'), c: '#9b3fb5' }; }
function visCat(m) { if (!isNum(m)) return ''; if (m >= 20000) return t('vExc'); if (m >= 10000) return t('vGood'); if (m >= 4000) return t('vMod'); if (m >= 1000) return t('vPoor'); return t('vFog'); }
const AQ_EU = [[20, 'aqGood', '#4aa857'], [40, 'aqFair', '#93bf3a'], [60, 'aqMod', '#d9b82a'], [80, 'aqPoor', '#e8862c'], [100, 'aqVPoor', '#d43e2a'], [Infinity, 'aqExt', '#8e2d6e']];
const AQ_US = [[50, 'aqGood', '#4aa857'], [100, 'aqMod', '#d9b82a'], [150, 'aqUSG', '#e8862c'], [200, 'aqUnh', '#d43e2a'], [300, 'aqVUnh', '#8e3fa6'], [Infinity, 'aqHaz', '#7a1f32']];
function aqiCat(v, std) { if (!isNum(v)) return { k: '–', c: 'var(--muted)' }; for (const [lim, k, c] of (std === 'us' ? AQ_US : AQ_EU)) if (v <= lim) return { k: t(k), c }; return { k: '–', c: 'var(--muted)' }; }
/* main pollutant = highest ratio to the WHO 2021 guideline */
function mainPollutant(cur) {
  const G = { pm25: 15, pm10: 45, no2: 25, o3: 100, so2: 40 }; let best = null, r = 0;
  for (const k of Object.keys(G)) if (isNum(cur[k]) && cur[k] / G[k] > r) { r = cur[k] / G[k]; best = k; }
  return best ? { k: best, ratio: r } : null;
}
const POLL_NAMES = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO₂', o3: 'O₃', so2: 'SO₂', co: 'CO', dust: 'Dust' };
function pollenLevel(v) { if (!isNum(v)) return '–'; if (v < 1) return t('plNone'); if (v < 10) return t('plLow'); if (v < 50) return t('plMod'); if (v < 200) return t('plHigh'); return t('plVHigh'); }

/* ---------- activity planner ---------- */
const ACTIVITIES = [
  { id: 'running', icon: 'run', hours: [6, 21], temp: [-3, 6, 18, 28], wind: [20, 45], gust: [45, 70], dry: true, uv: [6, 10], win: 2 },
  { id: 'cycling', icon: 'bike', hours: [7, 20], temp: [2, 12, 25, 33], wind: [15, 35], gust: [35, 55], dry: true, win: 3 },
  { id: 'hiking', icon: 'hike', hours: [7, 18], temp: [0, 9, 22, 31], wind: [25, 50], gust: [50, 75], dry: true, vis: [3000, 10000], win: 4 },
  /* a long trail with a pack: six dry hours, less heat and sun than a day hike */
  { id: 'backpacking', icon: 'backpack', hours: [7, 19], temp: [0, 8, 21, 29], wind: [25, 50], gust: [45, 70], dry: true, vis: [3000, 10000], uv: [6, 10], win: 6 },
  /* the night out: best 12 hours between 18:00 and 09:00; one wet hour halves the score */
  { id: 'camping', icon: 'tent', overnight: [18, 9], temp: [-2, 8, 22, 30], wind: [15, 35], gust: [35, 60], dry: true, strictDry: true, win: 12 },
  { id: 'beach', icon: 'beach', hours: [9, 19], temp: [19, 25, 34, 40], wind: [20, 40], dry: true, cloud: [30, 85], win: 3 },
  { id: 'bbq', icon: 'bbq', hours: [11, 22], temp: [12, 19, 30, 36], wind: [18, 38], dry: true, win: 3 },
  { id: 'laundry', icon: 'laundry', hours: [8, 19], temp: [4, 15, 40, 45], dry: true, rh: [55, 90], dryAhead: 2, win: 5 },
  { id: 'stars', icon: 'stars', night: true, temp: [-25, -5, 30, 40], cloud: [15, 60], rh: [85, 98], moon: true, win: 2 },
  { id: 'drone', icon: 'drone', hours: [7, 19], temp: [-5, 5, 32, 40], wind: [15, 30], gust: [25, 40], dry: true, vis: [3000, 8000], win: 2 }
];
const trap = (v, [a, b, c, d]) => (!isNum(v) ? 1 : v <= a || v >= d ? 0 : v < b ? (v - a) / (b - a) : v > c ? (d - v) / (d - c) : 1);
const lessIsBetter = (v, [good, bad]) => (!isNum(v) ? 1 : v <= good ? 1 : v >= bad ? 0 : 1 - (v - good) / (bad - good));
const moreIsBetter = (v, [bad, good]) => (!isNum(v) ? 1 : v >= good ? 1 : v <= bad ? 0 : (v - bad) / (good - bad));
function hourScore(o, i, A) {
  const H = o.h; let s = trap(A.night || A.overnight ? H.temp[i] : (isNum(H.feels[i]) ? H.feels[i] : H.temp[i]), A.temp);
  if (A.wind) s *= lessIsBetter(H.ws[i], A.wind);
  if (A.gust) s *= lessIsBetter(H.wg[i], A.gust);
  if (A.dry) { if (isNum(H.precip[i]) && H.precip[i] >= 0.3) return 0; if (isThunderCode(H.code[i])) return 0; if (isNum(H.pop[i])) s *= 1 - clamp((H.pop[i] - 20) / 100, 0, 0.75); }
  if (A.cloud) s *= lessIsBetter(H.cloud[i], A.cloud);
  if (A.rh) s *= lessIsBetter(H.rh[i], A.rh);
  if (A.vis) s *= moreIsBetter(H.vis[i], A.vis);
  if (A.uv) s *= 0.5 + 0.5 * lessIsBetter(H.uv[i], A.uv);
  return s;
}
function activityDays(o, A) {
  const D = o.d, H = o.h, di = dayIdx(o), now = Date.now(), res = [];
  for (let d = di; d < D.t.length; d++) {
    if (!isNum(D.tmax[d])) continue;
    const ds = D.t[d]; let cand = [];
    for (let i = 0; i < H.t.length; i++) {
      const tt = H.t[i];
      if (A.night) { if (tt < ds + 18 * HOUR || tt > ds + 30 * HOUR || H.isDay[i] === 1) continue; }
      else if (A.overnight) { if (tt <= ds + A.overnight[0] * HOUR || tt > ds + (24 + A.overnight[1]) * HOUR) continue; }
      else { if (tt <= ds || tt > ds + 24 * HOUR) continue; const hh = TZ.parts(tt - HOUR).h; if (hh < A.hours[0] || hh >= A.hours[1]) continue; }
      if (tt <= now) continue;
      cand.push(i);
    }
    if (cand.length < A.win) { res.push({ d, score: null }); continue; }
    const sc = cand.map(i => hourScore(o, i, A));
    let best = -1, bi = 0;
    for (let k = 0; k + A.win <= cand.length; k++) {
      if (H.t[cand[k + A.win - 1]] - H.t[cand[k]] > A.win * HOUR) continue;
      let m = 0; for (let q = 0; q < A.win; q++) m += sc[k + q]; m /= A.win;
      if (A.strictDry) for (let q = 0; q < A.win; q++) { const j = cand[k + q]; if ((isNum(H.precip[j]) && H.precip[j] >= 0.3) || isThunderCode(H.code[j])) { m *= 0.5; break; } }
      if (A.dryAhead) { const j = cand[k + A.win - 1]; for (let q = 1; q <= A.dryAhead; q++) { const p = H.precip[j + q]; if (isNum(p) && p >= 0.3) { m *= 0.4; break; } } }
      if (m > best) { best = m; bi = k; }
    }
    if (best < 0) { res.push({ d, score: null }); continue; }
    if (A.moon) best *= 1 - 0.55 * Astro.moonIllum(H.t[cand[bi]]).fraction;
    res.push({ d, score: Math.round(best * 10), start: H.t[cand[bi]] - HOUR, end: H.t[cand[bi + A.win - 1]] });
  }
  return res;
}
const scoreColor = s => (!isNum(s) ? 'var(--surface-3)' : s >= 7 ? 'var(--ok)' : s >= 4 ? 'var(--warn)' : 'var(--bad)');
