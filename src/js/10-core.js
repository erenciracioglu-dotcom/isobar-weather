'use strict';
/* =====================================================================
   Isobar Weather — single-file app
   Core: helpers, storage, settings, i18n, units, time zones, icons
   ===================================================================== */
const APP_VERSION = '1.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(+v)) ? null : +v;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
const HOUR = 3600e3, DAY = 864e5;
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const sumOf = a => { let s = 0, n = 0; for (const v of a || []) if (isNum(v)) { s += v; n++; } return n ? s : null; };
const maxOf = a => { let m = -Infinity; for (const v of a || []) if (isNum(v) && v > m) m = v; return m === -Infinity ? null : m; };
const minOf = a => { let m = Infinity; for (const v of a || []) if (isNum(v) && v < m) m = v; return m === Infinity ? null : m; };
const meanOf = a => { let s = 0, n = 0; for (const v of a || []) if (isNum(v)) { s += v; n++; } return n ? s / n : null; };
const pick = (a, idx) => idx.map(i => (a ? a[i] : null));
const range = (a, b) => { const out = []; for (let i = a; i < b; i++) out.push(i); return out; };
const hasData = a => Array.isArray(a) && a.some(isNum);
function quantile(sorted, p) { const n = sorted.length; if (!n) return null; const x = (n - 1) * p, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); }
function haversine(la1, lo1, la2, lo2) { const r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (over && typeof over === 'object' && !Array.isArray(over)) {
    for (const k of Object.keys(over)) {
      const bv = base ? base[k] : undefined, ov = over[k];
      out[k] = (bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov)) ? deepMerge(bv, ov) : ov;
    }
  }
  return out;
}
function vecMeanDir(speeds, dirs) {
  let u = 0, v = 0, n = 0;
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]; if (!isNum(d)) continue;
    const s = speeds && isNum(speeds[i]) ? Math.max(speeds[i], 0.1) : 1;
    u += s * Math.sin(d * Math.PI / 180); v += s * Math.cos(d * Math.PI / 180); n++;
  }
  return n ? (Math.atan2(u, v) * 180 / Math.PI + 360) % 360 : null;
}

/* ---------- storage ---------- */
const Store = {
  p: 'isobar:',
  get(k, d) { try { const v = localStorage.getItem(this.p + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(this.p + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(this.p + k); } catch (e) { /* ignore */ } },
  keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(this.p + prefix)) out.push(k.slice(this.p.length)); } } catch (e) { /* ignore */ } return out; }
};

/* ---------- settings ---------- */
const SETTINGS_VERSION = 4;
const DEFAULTS = {
  v: SETTINGS_VERSION,
  units: { temp: 'C', wind: 'kmh', precip: 'mm', pressure: 'hPa', dist: 'km', time: '24' },
  aqi: 'eu', theme: 'auto', lang: 'tr', anim: true, mode: 'basic',
  hourStep: 1, dailyView: 'daily', activity: 'running', heatmap: 'temp',
  adv: { range: '7d', step: 1, model: 'best_match', panels: ['temp', 'precip', 'wind'], layer: 'temp', base: 'auto', particles: true, labels: true, scale: 'local', grey: false, cmpVar: 'temp', playMs: 1500, fade: 30, autoGrid: true }
};
/* time per frame when the map plays (ms), chosen in Settings */
const PLAY_STEPS = [300, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000];
/* Default place when the user does not share a location */
const HOME = { name: 'Karabiga', admin: 'Biga, Çanakkale', country: 'Türkiye', cc: 'TR', lat: 40.4036, lon: 27.3032, tz: 'Europe/Istanbul' };
const UNIT_PRESETS = {
  metric: { temp: 'C', wind: 'kmh', precip: 'mm', pressure: 'hPa', dist: 'km' },
  imperial: { temp: 'F', wind: 'mph', precip: 'in', pressure: 'inHg', dist: 'mi' },
  uk: { temp: 'C', wind: 'mph', precip: 'mm', pressure: 'hPa', dist: 'mi' },
  nautical: { temp: 'C', wind: 'kn', precip: 'mm', pressure: 'hPa', dist: 'km' }
};
let S = (() => {
  const saved = Store.get('settings', null);
  if (saved) {
    const s = deepMerge(DEFAULTS, saved);
    if ((saved.v || 1) < 2) {                      /* v1 → v2: new defaults the user asked for */
      s.adv.panels = DEFAULTS.adv.panels.slice();
      if (!saved.lang || saved.lang === 'auto') s.lang = 'tr';
      s.adv.base = ({ light: 'grey', dark: 'dark', streets: 'streets', satellite: 'satellite', terrain: 'terrain' })[saved.adv && saved.adv.base] || 'auto';
    }
    if ((saved.v || 1) < 3 && s.adv.playMs === 700) s.adv.playMs = 1500;   /* v2 → v3: playback default went from 0.7 s to 1.5 s */
    if ((saved.v || 1) < 4 && !s.adv.fade) s.adv.fade = 30;                 /* v3 → v4: heatmap transparency default went from 0 % to 30 % */
    if (s.lang !== 'en') s.lang = 'tr';
    s.v = SETTINGS_VERSION;
    return s;
  }
  const s = deepMerge(DEFAULTS, {});
  const nl = (navigator.language || '').toLowerCase();
  if (/^en-(us|lr)/.test(nl)) Object.assign(s.units, UNIT_PRESETS.imperial);
  if (/^en-(us|ca|au|nz|in|ph)/.test(nl)) s.units.time = '12';
  return s;
})();
function saveSettings() { Store.set('settings', S); }

/* ---------- i18n ---------- */
let LANG = 'en', LOCALE = 'en-GB';
function t(key, vars) {
  const d = I18N[LANG] || I18N.en;
  let s = d[key];
  if (s == null) s = I18N.en[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
function applyLang() {
  const nav = (navigator.language || 'en').toLowerCase();
  LANG = S.lang === 'en' ? 'en' : 'tr';
  LOCALE = LANG === 'tr' ? 'tr-TR' : (nav.startsWith('en') ? navigator.language : 'en-GB');
  try { new Intl.DateTimeFormat(LOCALE); } catch (e) { LOCALE = 'en-GB'; }
  document.documentElement.lang = LANG;
  NF.clear(); TZ.reset();
}

/* ---------- numbers & units ---------- */
const NF = new Map();
function fmtN(v, d = 0) {
  if (!isNum(v)) return '–';
  const p = 10 ** d; let r = Math.round(v * p) / p; if (r === 0) r = 0;
  let f = NF.get(d);
  if (!f) { f = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }); NF.set(d, f); }
  return f.format(r).replace('-', '−');
}
const fmtPct = v => (isNum(v) ? (LANG === 'tr' ? '%' + fmtN(v, 0) : fmtN(v, 0) + '%') : '–');
function bft(kmh) { const ms = kmh / 3.6, th = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]; for (let i = 0; i < th.length; i++) if (ms < th[i]) return i; return 12; }
const Units = {
  t: c => (isNum(c) ? (S.units.temp === 'F' ? c * 9 / 5 + 32 : c) : null),
  dt: c => (isNum(c) ? (S.units.temp === 'F' ? c * 9 / 5 : c) : null),
  w: k => { if (!isNum(k)) return null; switch (S.units.wind) { case 'ms': return k / 3.6; case 'mph': return k / 1.609344; case 'kn': return k / 1.852; case 'bft': return bft(k); default: return k; } },
  p: mm => (isNum(mm) ? (S.units.precip === 'in' ? mm / 25.4 : mm) : null),
  sn: cm => (isNum(cm) ? (S.units.precip === 'in' ? cm / 2.54 : cm) : null),
  sd: m => (isNum(m) ? (S.units.precip === 'in' ? m * 39.3701 : m * 100) : null),
  pr: h => { if (!isNum(h)) return null; switch (S.units.pressure) { case 'inHg': return h * 0.0295300; case 'mmHg': return h * 0.750062; case 'kPa': return h / 10; default: return h; } },
  d: m => (isNum(m) ? (S.units.dist === 'mi' ? m / 1609.344 : m / 1000) : null),
  ht: m => (isNum(m) ? (S.units.dist === 'mi' ? m * 3.28084 : m) : null),
  label: {
    t: () => '°' + S.units.temp,
    w: () => ({ kmh: 'km/h', ms: 'm/s', mph: 'mph', kn: 'kn', bft: 'Bft' })[S.units.wind],
    p: () => (S.units.precip === 'in' ? 'in' : 'mm'),
    sn: () => (S.units.precip === 'in' ? 'in' : 'cm'),
    pr: () => S.units.pressure,
    d: () => (S.units.dist === 'mi' ? 'mi' : 'km'),
    ht: () => (S.units.dist === 'mi' ? 'ft' : 'm')
  },
  dec: { w: () => (S.units.wind === 'ms' ? 1 : 0), p: v => (S.units.precip === 'in' ? 2 : (Math.abs(v) < 10 ? 1 : 0)), pr: () => ({ inHg: 2, kPa: 1 })[S.units.pressure] || 0 }
};
const NB = ' ';
const F = {
  t: c => (isNum(c) ? fmtN(Units.t(c), 0) + '°' : '–'),
  t1: c => (isNum(c) ? fmtN(Units.t(c), 1) + '°' : '–'),
  dtAbs: c => (isNum(c) ? fmtN(Math.abs(Units.dt(c)), 0) + '°' : '–'),
  w: (k, unit = true) => (isNum(k) ? fmtN(Units.w(k), Units.dec.w()) + (unit ? NB + Units.label.w() : '') : '–'),
  p: (mm, unit = true) => {
    if (!isNum(mm)) return '–';
    const v = Units.p(mm), inch = S.units.precip === 'in';
    const s = (v > 0 && v < (inch ? 0.005 : 0.05)) ? '<' + fmtN(inch ? 0.01 : 0.1, inch ? 2 : 1) : fmtN(v, Units.dec.p(v));
    return s + (unit ? NB + Units.label.p() : '');
  },
  sn: (cm, unit = true) => (isNum(cm) ? fmtN(Units.sn(cm), S.units.precip === 'in' ? 1 : (cm < 10 ? 1 : 0)) + (unit ? NB + Units.label.sn() : '') : '–'),
  sd: (m, unit = true) => (isNum(m) ? fmtN(Units.sd(m), 0) + (unit ? NB + Units.label.sn() : '') : '–'),
  pr: (h, unit = true) => (isNum(h) ? fmtN(Units.pr(h), Units.dec.pr()) + (unit ? NB + Units.label.pr() : '') : '–'),
  d: (m, unit = true) => { if (!isNum(m)) return '–'; const v = Units.d(m); return fmtN(v, v < 10 ? 1 : 0) + (unit ? NB + Units.label.d() : ''); },
  ht: (m, unit = true) => (isNum(m) ? fmtN(Units.ht(m), 0) + (unit ? NB + Units.label.ht() : '') : '–'),
  /* wave heights need decimals: 0.3 m, and 0.02 m on a calm sea, never "0 m" */
  wv: (m, unit = true) => { if (!isNum(m)) return '–'; const v = Units.ht(m); return fmtN(v, v > 0 && v < 0.095 ? 2 : v < 10 ? 1 : 0) + (unit ? NB + Units.label.ht() : ''); },
  pct: v => fmtPct(v)
};
const COMPASS = {
  en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
  tr: ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB']
};
const compass = deg => (isNum(deg) ? COMPASS[LANG][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : '–');
/* traditional Turkish wind names (Mediterranean wind rose) */
const TR_WINDS = ['Yıldız', 'Poyraz', 'Gündoğusu', 'Keşişleme', 'Kıble', 'Lodos', 'Batı (Günbatısı)', 'Karayel'];
const trWind = deg => (isNum(deg) ? TR_WINDS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] : '');

/* ---------- time zones ---------- */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TZ = {
  zone: 'UTC', fmts: new Map(), pc: new Map(),
  valid(z) { if (!z) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } },
  set(z) { const nz = this.valid(z) ? z : 'UTC'; if (nz !== this.zone) { this.zone = nz; this.reset(); } },
  reset() { this.fmts.clear(); this.pc.clear(); },
  f(opts) {
    const k = JSON.stringify(opts); let f = this.fmts.get(k);
    if (!f) { try { f = new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: this.zone }); } catch (e) { f = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: this.zone }); } this.fmts.set(k, f); }
    return f;
  },
  parts(ms) {
    let p = this.pc.get(ms); if (p) return p;
    let pf = this.fmts.get('#p');
    if (!pf) { pf = new Intl.DateTimeFormat('en-US', { timeZone: this.zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }); this.fmts.set('#p', pf); }
    const o = {}; for (const x of pf.formatToParts(new Date(ms))) o[x.type] = x.value;
    p = { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, wd: WD.indexOf(o.weekday) };
    p.key = p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
    if (this.pc.size > 6000) this.pc.clear();
    this.pc.set(ms, p); return p;
  },
  offsetMin(ms) { const p = this.parts(ms); return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000) / 60000); },
  toUTC(y, m, d, h = 0, mi = 0) { const g = Date.UTC(y, m - 1, d, h, mi); const o1 = this.offsetMin(g); let r = g - o1 * 60000; const o2 = this.offsetMin(r); if (o2 !== o1) r = g - o2 * 60000; return r; },
  dayStart(ms) { const p = this.parts(ms); return this.toUTC(p.y, p.m, p.d); }
};
function tzFromLon(lon) { const h = Math.round(lon / 15); return h === 0 ? 'UTC' : 'Etc/GMT' + (h > 0 ? '-' : '+') + Math.abs(h); }
function fmtTime(ms) { return S.units.time === '12' ? TZ.f({ hour: 'numeric', minute: '2-digit', hour12: true }).format(ms) : TZ.f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms); }
function fmtHour(ms) { return S.units.time === '12' ? TZ.f({ hour: 'numeric', hour12: true }).format(ms).replace(/\s+/g, NB) : TZ.f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms); }
const fmtWeekday = (ms, long) => TZ.f({ weekday: long ? 'long' : 'short' }).format(ms);
/* unambiguous two-letter weekdays (Turkish calendar style: Pz Pt Sa Ça Pe Cu Ct) */
const WD2 = { en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], tr: ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'] };
const wd2 = ms => WD2[LANG][TZ.parts(ms).wd];
const fmtDayMonth = ms => TZ.f({ day: 'numeric', month: 'short' }).format(ms);
/* numeric day/month, e.g. 20/10, for chart axes */
const fmtDM = ms => { const p = TZ.parts(ms); return String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0'); };
const fmtDate = ms => TZ.f({ weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
const fmtDateLong = ms => TZ.f({ weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
/* dayLabel: the local day that contains instant ms. dayName/dayDate: for a day-start instant (local midnight). */
function dayLabel(ms) {
  const k = TZ.parts(ms).key, now = Date.now(), s0 = TZ.dayStart(now);
  if (k === TZ.parts(now).key) return t('today');
  if (k === TZ.parts(s0 + 36 * HOUR).key) return t('tomorrow');
  if (k === TZ.parts(s0 - 12 * HOUR).key) return t('yesterday');
  return fmtWeekday(ms);
}
const dayName = dayStart => dayLabel(dayStart + 6 * HOUR);
function dayDate(ms) { const n = dayName(ms); return (n === t('today') || n === t('tomorrow')) ? n : fmtWeekday(ms + 6 * HOUR) + ' ' + TZ.parts(ms + 6 * HOUR).d; }
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return t('justNow'); if (m < 60) return t('minAgo', { n: m });
  const h = Math.round(m / 60); if (h < 48) return t('hAgo', { n: h });
  return t('dAgo', { n: Math.round(h / 24) });
}
function fmtDur(sec) { if (!isNum(sec)) return '–'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? t('durHM', { h, m }) : t('durM', { m }); }

/* ---------- weather codes ---------- */
const WMO_SEV = { 0: 0, 1: 1, 2: 2, 3: 3, 45: 4, 48: 4, 51: 5, 53: 5, 55: 6, 56: 8, 57: 9, 61: 6, 63: 7, 65: 9, 66: 9, 67: 10, 68: 7, 69: 8, 71: 7, 73: 8, 75: 10, 77: 7, 80: 6, 81: 7, 82: 9, 85: 7, 86: 9, 95: 11, 96: 12, 99: 13 };
const sevOf = c => (isNum(c) ? (WMO_SEV[c] != null ? WMO_SEV[c] : (c >= 95 ? 11 : c >= 50 ? 6 : 3)) : -1);
const isSnowCode = c => [71, 73, 75, 77, 85, 86].includes(c);
const isThunderCode = c => isNum(c) && c >= 95;
const isPrecipCode = c => isNum(c) && c >= 51;
function worstCode(codes) { let best = null, bs = -1; for (const c of codes) { const s = sevOf(c); if (s > bs) { bs = s; best = c; } } return best; }
const wmoText = c => (isNum(c) ? t('w' + c) : '–');
function iconKind(c) {
  if (!isNum(c)) return 'na';
  switch (c) {
    case 0: return 'clear'; case 1: return 'mostly'; case 2: return 'partly'; case 3: return 'overcast';
    case 45: case 48: return 'fog';
    case 51: case 53: case 55: return 'drizzle';
    case 56: case 57: case 66: case 67: return 'freezing';
    case 61: case 63: return 'rain'; case 65: return 'heavyrain';
    case 68: case 69: return 'sleet';
    case 71: case 73: case 77: return 'snow'; case 75: return 'heavysnow';
    case 80: case 81: return 'showers'; case 82: return 'heavyshowers';
    case 85: case 86: return 'snowshowers';
    case 95: return 'thunder'; case 96: case 99: return 'hail';
    default: return c > 3 ? 'rain' : 'partly';
  }
}
function skyFor(c, isDay) {
  const k = iconKind(c), night = isDay === 0;
  if (k === 'thunder' || k === 'hail') return 'storm';
  if (['snow', 'heavysnow', 'snowshowers', 'sleet'].includes(k)) return 'snow';
  if (['drizzle', 'rain', 'heavyrain', 'showers', 'heavyshowers', 'freezing'].includes(k)) return 'rain';
  if (k === 'fog') return 'fog';
  if (k === 'overcast') return night ? 'cloudy-night' : 'cloudy-day';
  if (k === 'partly') return night ? 'cloudy-night' : 'partly-day';
  return night ? 'clear-night' : 'clear-day';
}

/* ---------- weather icons (SVG, 64×64) ---------- */
const IC = {
  cloud: 'M22 46A10 10 0 0 1 21.15 26.04A13 13 0 0 1 46.85 26.04A10 10 0 0 1 46 46Z',
  moon: 'M28.55 15.07A15 15 0 1 0 43.93 35.57A13 13 0 0 1 28.55 15.07Z'
};
function svgSun(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); d += `M${(cx + c * (r + 3.5)).toFixed(1)} ${(cy + s * (r + 3.5)).toFixed(1)}L${(cx + c * (r + 7.5)).toFixed(1)} ${(cy + s * (r + 7.5)).toFixed(1)}`; }
  return `<path class="ib-rays" d="${d}"/><circle class="ib-sun" cx="${cx}" cy="${cy}" r="${r}"/>`;
}
const svgMoon = (tx, ty, s) => `<path class="ib-moon" transform="translate(${tx} ${ty}) scale(${s})" d="${IC.moon}"/>`;
const svgCloud = (tx, ty, s, dark) => `<g class="ib-fl"><path class="ib-cl${dark ? ' ib-cd' : ''}" transform="translate(${tx} ${ty}) scale(${s})" d="${IC.cloud}"/></g>`;
const svgDrops = (xs, y, cls = 'ib-drop') => xs.map((x, i) => `<path class="${cls}" style="animation-delay:${((i * 0.37) % 1.1).toFixed(2)}s" d="M${x} ${y}l-2.4 7"/>`).join('');
const svgDots = pts => pts.map(([x, y], i) => `<circle class="ib-dz" style="animation-delay:${(i * 0.3).toFixed(1)}s" cx="${x}" cy="${y}" r="1.7"/>`).join('');
const svgFlakes = pts => pts.map(([x, y], i) => `<g transform="translate(${x} ${y})"><path class="ib-flake" style="animation-delay:${(i * 0.45).toFixed(2)}s" d="M0 -3.6V3.6M-3.1 -1.8L3.1 1.8M-3.1 1.8L3.1 -1.8"/></g>`).join('');
const SVG_BOLT = '<path class="ib-bolt" d="M33 36L25 49H31.5L27.5 60L41 45H34.5L38.5 36Z"/>';
const SVG_STARS = '<path class="ib-star" d="M48 12l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"/><path class="ib-star" style="animation-delay:.9s" d="M54 27l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>';
function wxIcon(code, isDay = 1, size = 32, anim = false) {
  const k = iconKind(code), night = isDay === 0;
  const body = dark => svgCloud(1, -5, 0.9, dark);
  const peek = () => (night ? svgMoon(-3, -4, 0.62) : svgSun(18, 16, 7.5));
  let g;
  switch (k) {
    case 'clear': g = night ? svgMoon(2, 2, 1) + SVG_STARS : svgSun(32, 32, 12); break;
    case 'mostly': g = (night ? svgMoon(1, 1, 0.85) : svgSun(26, 26, 11)) + svgCloud(26, 30, 0.6); break;
    case 'partly': g = (night ? svgMoon(-3, -3, 0.8) : svgSun(22, 22, 9)) + svgCloud(14, 17, 0.78); break;
    case 'overcast': g = svgCloud(20, 4, 0.72, true) + svgCloud(-1, 8, 0.95); break;
    case 'fog': g = svgCloud(1, -4, 0.85) + '<path class="ib-fog" d="M13 44H49M18 50H55M11 56H43"/>'; break;
    case 'drizzle': g = body() + svgDots([[22, 45], [32, 50], [42, 45], [27, 56], [37, 57]]); break;
    case 'rain': g = body() + svgDrops([22, 32, 42], 41); break;
    case 'heavyrain': g = body(true) + svgDrops([18, 27, 36, 45], 40) + svgDrops([23, 32, 41], 50); break;
    case 'freezing': g = body() + svgDrops([22, 42], 41, 'ib-drop ib-ice') + svgFlakes([[32, 49]]); break;
    case 'sleet': g = body() + svgDrops([20, 40], 41) + svgFlakes([[30, 48], [48, 50]]); break;
    case 'snow': g = body() + svgFlakes([[22, 46], [34, 52], [46, 46]]); break;
    case 'heavysnow': g = body(true) + svgFlakes([[18, 45], [30, 50], [42, 45], [24, 57], [38, 58], [50, 55]]); break;
    case 'showers': g = peek() + svgCloud(9, 4, 0.82) + svgDrops([26, 35, 44], 45); break;
    case 'heavyshowers': g = peek() + svgCloud(9, 4, 0.82, true) + svgDrops([22, 30, 38, 46], 45); break;
    case 'snowshowers': g = peek() + svgCloud(9, 4, 0.82) + svgFlakes([[26, 50], [38, 54], [48, 49]]); break;
    case 'thunder': g = svgCloud(1, -6, 0.9, true) + SVG_BOLT + svgDrops([17, 49], 42); break;
    case 'hail': g = svgCloud(1, -6, 0.9, true) + SVG_BOLT + '<circle class="ib-hail" cx="18" cy="49" r="2.4"/><circle class="ib-hail" cx="49" cy="51" r="2.4"/><circle class="ib-hail" cx="20" cy="58" r="2.2"/>'; break;
    default: g = svgCloud(-1, 8, 0.95);
  }
  return `<svg class="wx${anim && S.anim && !REDUCED ? ' ib-anim' : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${g}</svg>`;
}

/* ---------- UI line icons (24×24) ---------- */
const UI = {
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  chev: 'M6 9l6 6 6-6',
  chevL: 'M15 6l-6 6 6 6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  chevR: 'M9 6l6 6-6 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  sliders: 'M4 7h9M17 7h3M15 4.5v5M4 17h3M11 17h9M9 14.5v5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  locate: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12 2v3M12 19v3M2 12h3M19 12h3M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  speaker: 'M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  stop: 'M7 7h10v10H7Z',
  close: 'M6 6l12 12M18 6L6 18',
  play: 'M8 5v14l11-7Z',
  pause: 'M8 5v14M16 5v14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  warn: 'M12 3l9.5 16.5h-19ZM12 10v4.5M12 17.5v.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.01',
  drop: 'M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11Z',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1.5v2M12 20.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6',
  thermo: 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z',
  wave: 'M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M7 9c1.5-3 4-4 7-3-2 1-3 2-3 4',
  leaf: 'M5 19c0-8 5-13 15-14-1 10-6 15-14 15ZM5 19l7-7',
  layers: 'M12 3l9 5-9 5-9-5ZM3 13l9 5 9-5',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14',
  chart: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6',
  table: 'M4 5h16v14H4ZM4 10h16M4 15h16M10 5v14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  calendar: 'M4 6h16v14H4ZM4 10h16M8 3v5M16 3v5',
  run: 'M13 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 21l3-6 3 2v5M10 15l2-5 4 3h3M12 10L8.5 9 6 12',
  bike: 'M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15l4-7h5l3 7M10 8l2 7h-6M14 5h2',
  hike: 'M3 20l6-10 4 6 3-4 5 8ZM9 10l2-3',
  beach: 'M12 12v9M4 12a8 8 0 0 1 16 0ZM3 21h18',
  bbq: 'M5 10h14a7 7 0 0 1-14 0ZM8 17l-2 4M16 17l2 4M10 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2',
  laundry: 'M8 4l-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3a3 3 0 0 1-8 0Z',
  stars: 'M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4ZM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z',
  tent: 'M12 5L3 20h18ZM12 12.5L8.5 20M12 12.5l3.5 7.5M12 5l-1.8-2.5M12 5l1.8-2.5',
  backpack: 'M6 20V9.5A4.5 4.5 0 0 1 10.5 5h3A4.5 4.5 0 0 1 18 9.5V20ZM10 5V3h4v2M9 20v-5h6v5M9.5 10h5',
  drone: 'M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.5 7.5l3 3M16.5 7.5l-3 3M7.5 16.5l3-3M16.5 16.5l-3-3M10 10h4v4h-4Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M7 17L17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
  steady: 'M4 12h16M14 6l6 6-6 6',
  umbrella: 'M12 4a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9ZM12 13v6a2 2 0 0 0 4 0',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
  flame: 'M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.9 3.3-5.8 4-9.8 3 1.8 4.5 4.5 4.5 7 1-.6 1.7-1.7 2-3 1.6 1.6 2.5 3.7 2.5 5.8 0 3.6-2.5 6.2-6.5 6.2Z',
  frost: 'M12 3v18M3 12h18M6 6l12 12M18 6L6 18',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7Z',
  basic: 'M4 5h16v6H4ZM4 15h7v4H4ZM15 15h5v4h-5Z',
  adv: 'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3M20 16V6'
};
const ui = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${UI[name] || UI.info}"/></svg>`;
/* Full-screen cards: a corner button (shown on hover; always faintly on touch screens) opens a card on its own.
   Uses the Fullscreen API where it exists, otherwise (iPhone) the card covers the window. A MutationObserver puts the
   button back whenever a card re-renders its contents. */
const FullCard = {
  IDS: ['hourly', 'daily', 'activities', 'advNow', 'advMap', 'advMeteo', 'advAstro', 'advMarine', 'advModels', 'advAQ', 'advEns', 'advClimate', 'advTable'],
  card: null,
  init() {
    const mo = new MutationObserver(list => { for (const m of list) { const c = m.target; if (c.nodeType === 1 && c.classList.contains('card') && this.IDS.includes(c.id)) { this.ensure(c); if (c === this.card) this.scheduleFit(); } } });
    mo.observe(document.body, { childList: true, subtree: true });
    this.IDS.forEach(id => { const c = document.getElementById(id); if (c) this.ensure(c); });
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { if (this.card && !(document.fullscreenElement || document.webkitFullscreenElement)) this.exit(true); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.card && $('#backdrop').hidden) this.exit(); });
    window.addEventListener('resize', debounce(() => { if (this.card) this.relayout(this.card); }, 120));
  },
  ensure(c) {
    const on = c.classList.contains('is-full');
    let b = c.querySelector(':scope > .fs-btn');
    if (!b) { c.insertAdjacentHTML('beforeend', '<button class="fs-btn" type="button" data-fs></button>'); b = c.lastElementChild; }
    const lbl = t(on ? 'fsExit' : 'fsEnter');
    if (b.dataset.on !== String(on) || b.title !== lbl) { b.dataset.on = String(on); b.innerHTML = ui(on ? 'shrink' : 'expand'); b.title = lbl; b.setAttribute('aria-label', lbl); }
  },
  toggle(c) { if (!c) return; if (this.card) { const same = this.card === c; this.exit(); if (same) return; } this.enter(c); },
  enter(c) {
    this.card = c; c.classList.add('is-full'); document.documentElement.classList.add('fs-open'); this.ensure(c);
    const req = c.requestFullscreen || c.webkitRequestFullscreen;
    if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) { try { const r = req.call(c); if (r && r.catch) r.catch(() => {}); } catch (e) { /* stay in the window-filling mode */ } }
    c.scrollTop = 0; this.relayout(c);
  },
  exit(fromBrowser) {
    const c = this.card; if (!c) return; this.card = null;
    c.classList.remove('is-full'); document.documentElement.classList.remove('fs-open'); this.ensure(c);
    if (!fromBrowser && (document.fullscreenElement || document.webkitFullscreenElement)) { const x = document.exitFullscreen || document.webkitExitFullscreen; try { const r = x.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
    this.relayout(c);
    if (c.isConnected) c.scrollIntoView({ block: 'nearest' });
  },
  /* charts and the map size themselves to the card */
  /* charts in a full-screen card grow until the card's content fills the screen (up to 8x their usual height) */
  fit(c) {
    if (typeof Charts === 'undefined') return;
    const list = []; Charts.forEach(ch => { if (ch.host.isConnected && c.contains(ch.host)) list.push(ch); });
    if (!list.length) return;
    list.forEach(ch => { ch.fitK = 1; ch.layout(); });
    if (!c.classList.contains('is-full')) return;
    const cs = getComputedStyle(c), padB = parseFloat(cs.paddingBottom) || 0;
    let bottom = 0;
    for (const el of c.children) { const ps = getComputedStyle(el); if (ps.position === 'absolute' || ps.position === 'fixed' || el.offsetParent === null) continue; bottom = Math.max(bottom, el.offsetTop + el.offsetHeight + (parseFloat(ps.marginBottom) || 0)); }
    const free = c.clientHeight - padB - bottom - 6, S = list.reduce((s, ch) => s + ch.scalableH(), 0);
    if (free > 8 && S > 0) { const k = Math.min(8, 1 + free / S); list.forEach(ch => { ch.fitK = k; ch.layout(); }); }
  },
  scheduleFit() { clearTimeout(this._fitT); this._fitT = setTimeout(() => { if (this.card) this.fit(this.card); }, 60); },
  relayout(c) {
    const run = () => {
      this.fit(c);
      if (c.id === 'advMap') {
        /* full screen: the map and its time bar fill the screen; the forecast strip and note follow below */
        const box = c.querySelector('.map-box'), tb = c.querySelector('.timebar');
        if (box) {
          if (c.classList.contains('is-full')) {
            const top = box.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop;
            box.style.height = Math.max(360, Math.round(c.clientHeight - top - (tb ? tb.offsetHeight + 14 : 0) - 18)) + 'px';
          } else box.style.height = '';
        }
        if (typeof MapView !== 'undefined' && MapView.map) { MapView.map.invalidateSize(); MapView.renderTicks(); MapView.selectStrip(); }
      }
    };
    requestAnimationFrame(run); setTimeout(run, 250);
  }
};
/* Chip rows scroll sideways with a finger, but a mouse can't reach the hidden chips.
   Arrow buttons appear at an end while chips are hidden on that side. */
const ChipScroll = {
  ro: 'ResizeObserver' in window ? new ResizeObserver(list => list.forEach(e => ChipScroll.sync(e.target))) : null,
  enhance(row, keepX) {
    if (!row || row.parentElement.classList.contains('chips-wrap')) return;
    const wrap = document.createElement('div'); wrap.className = 'chips-wrap';
    row.parentNode.insertBefore(wrap, row); wrap.appendChild(row);
    wrap.insertAdjacentHTML('beforeend', `<button type="button" class="chips-nav prev" data-chips="-1" aria-label="${esc(t('scrollLeft'))}" hidden>${ui('chevL')}</button><button type="button" class="chips-nav next" data-chips="1" aria-label="${esc(t('scrollRight'))}" hidden>${ui('chevR')}</button>`);
    if (isNum(keepX)) row.scrollLeft = keepX;
    const on = row.querySelector('[aria-pressed="true"]'), r = row.getBoundingClientRect();
    if (on && r.width > 0) { const c = on.getBoundingClientRect(); if (c.right > r.right - 36) row.scrollLeft += c.right - r.right + 44; else if (c.left < r.left + 36 && row.scrollLeft > 0) row.scrollLeft -= r.left - c.left + 44; }
    row.addEventListener('scroll', () => this.sync(row), { passive: true });
    if (this.ro) this.ro.observe(row);
    this.sync(row);
  },
  sync(row) {
    const wrap = row.parentElement; if (!wrap || !wrap.classList.contains('chips-wrap')) return;
    const max = row.scrollWidth - row.clientWidth;
    wrap.querySelector('.chips-nav.prev').hidden = !(max > 2 && row.scrollLeft > 2);
    wrap.querySelector('.chips-nav.next').hidden = !(max > 2 && row.scrollLeft < max - 2);
  },
  step(btn) {
    const row = btn.parentElement.querySelector('.chips'); if (!row) return;
    row.scrollBy({ left: Math.sign(+btn.dataset.chips) * Math.max(120, row.clientWidth * 0.7), behavior: REDUCED ? 'auto' : 'smooth' });
  }
};
const windArrow = (deg, size = 14) => `<svg class="warr" viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${((deg + 180) % 360).toFixed(0)}deg)" aria-hidden="true"><path d="M12 4v17M6 10l6-6 6 6"/></svg>`;
/* National flags as inline SVG (emoji flags show as letters on Windows) */
const FLAGS = {
  en: '<svg class="flag" viewBox="0 0 60 30" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice"><clipPath id="fl-uk-s"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="fl-uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#fl-uk-s)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#fl-uk-t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>',
  tr: '<svg class="flag" viewBox="0 -30000 90000 60000" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice"><path fill="#e30a17" d="m0-30000h90000v60000H0z"/><path fill="#fff" d="m41750 0 13568-4408-8386 11541V-7133l8386 11541zm925 8021a15000 15000 0 1 1 0-16042 12000 12000 0 1 0 0 16042z"/></svg>'
};

/* ---------- colour scales (base units) ---------- */
const SCALES = {
  temp: [[-30, '#4a2a85'], [-20, '#5a4ea8'], [-10, '#3a6cc4'], [-5, '#3b8ad9'], [0, '#4fb2d9'], [5, '#5ec8b2'], [10, '#8dd27b'], [15, '#d4de58'], [20, '#f5c142'], [25, '#f49235'], [30, '#e4532e'], [35, '#c0293d'], [40, '#8c1747'], [46, '#5c0d3e']],
  precip: [[0, '#9fd3f7'], [0.3, '#7cc0f2'], [1, '#3f93e3'], [2, '#2e66cc'], [4, '#5a3fc0'], [8, '#a23fb8'], [16, '#e0427a'], [32, '#f2902b'], [60, '#f7d14a']],
  wind: [[0, '#5b6cc2'], [10, '#3d9ec4'], [20, '#3fbf8a'], [30, '#a6cf3f'], [40, '#f2c12e'], [55, '#f0812e'], [70, '#e0452f'], [90, '#b0245a'], [120, '#7a1f78'], [160, '#3d0f45']],
  pmsl: [[970, '#5e3c99'], [985, '#3f6fc2'], [1000, '#4fb2d9'], [1008, '#8dd27b'], [1014, '#e6df5a'], [1020, '#f5b443'], [1028, '#ec6e34'], [1040, '#c0293d']],
  rh: [[0, '#a0622d'], [25, '#d9a443'], [45, '#e7dc8c'], [60, '#8fd4a0'], [75, '#4fb2d9'], [90, '#2f6fc4'], [100, '#273f99']],
  cloud: [[0, '#ffffff'], [100, '#ffffff']]
};
const _scaleCache = {};
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function scaleRGB(name, v) {
  let st = _scaleCache[name];
  if (!st) st = _scaleCache[name] = SCALES[name].map(([x, c]) => [x, hexRGB(c)]);
  if (!isNum(v)) return [128, 128, 128];
  if (v <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) {
    if (v <= st[i][0]) { const [x0, c0] = st[i - 1], [x1, c1] = st[i], f = (v - x0) / (x1 - x0); return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]; }
  }
  return st[st.length - 1][1];
}
const rgbCss = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
