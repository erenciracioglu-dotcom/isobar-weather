/* =====================================================================
   Data: network with logging, Open-Meteo + fallbacks, normalisation,
   astronomy, caching, places
   ===================================================================== */
const Net = {
  log: [], listeners: new Set(),
  record(service, url, ok, ms, note) {
    let host = ''; try { host = new URL(url).host; } catch (e) { /* ignore */ }
    this.log.unshift({ service, host, ok, ms, note: note || '', at: Date.now() });
    if (this.log.length > 80) this.log.length = 80;
    this.listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  },
  async json(url, { timeout = 12000, service = '' } = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ctrl && ctrl.abort(), timeout);
    const t0 = performance.now();
    let res;
    try { res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' }); }
    catch (e) {
      clearTimeout(tm);
      const err = new Error(e && e.name === 'AbortError' ? t('errTimeout') : t('errNetwork'));
      err.network = true; this.record(service, url, false, Math.round(performance.now() - t0), err.message); throw err;
    }
    let text = '';
    try { text = await res.text(); } catch (e) { text = ''; }
    clearTimeout(tm);
    const ms = Math.round(performance.now() - t0);
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (!res.ok) {
      const reason = body && (body.reason || body.message || body.error_description);
      const err = new Error(reason ? String(reason) : 'HTTP ' + res.status);
      err.status = res.status; err.body = body;
      this.record(service, url, false, ms, 'HTTP ' + res.status + (reason ? ': ' + String(reason).slice(0, 140) : ''));
      throw err;
    }
    if (body == null) { const err = new Error(t('errFormat')); this.record(service, url, false, ms, err.message); throw err; }
    this.record(service, url, true, ms);
    return body;
  }
};
const qs = p => Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v).replace(/%2C/gi, ',')).join('&');
/* Open-Meteo request that repairs itself when the API rejects a variable, model or option name */
async function omGet(base, params, service, opts = {}) {
  const p = { ...params };
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const j = await Net.json(base + '?' + qs(p), { service, ...opts });
      if (j && typeof j === 'object') Object.defineProperty(j, '_req', { value: p, enumerable: false });
      return j;
    } catch (e) {
      if (e.status === 400 && e.body && typeof e.body.reason === 'string') {
        const reason = e.body.reason;
        const m = reason.match(/invalid String value\s*['"]?([A-Za-z0-9_]+)/i);
        let changed = false;
        if (m) {
          for (const k of ['hourly', 'daily', 'current', 'minutely_15', 'models']) {
            if (typeof p[k] !== 'string') continue;
            const arr = p[k].split(','), f = arr.filter(x => x !== m[1]);
            if (f.length !== arr.length) { changed = true; if (f.length) p[k] = f.join(','); else delete p[k]; }
          }
        }
        if (!changed && p.temporal_resolution && /temporal/i.test(reason)) { delete p.temporal_resolution; changed = true; }
        if (!changed && p.cell_selection && /cell/i.test(reason)) { delete p.cell_selection; changed = true; }
        if (!changed && p.minutely_15 && /minutely/i.test(reason)) { delete p.minutely_15; changed = true; }
        if (changed) continue;
      }
      throw e;
    }
  }
  throw new Error(t('errFormat'));
}

/* ---------- normalised data model ---------- */
const OM_HOURLY = {
  temp: 'temperature_2m', rh: 'relative_humidity_2m', dew: 'dew_point_2m', feels: 'apparent_temperature',
  pop: 'precipitation_probability', precip: 'precipitation', rain: 'rain', showers: 'showers', snow: 'snowfall', snowDepth: 'snow_depth',
  code: 'weather_code', pmsl: 'pressure_msl', psfc: 'surface_pressure', cloud: 'cloud_cover', cloudL: 'cloud_cover_low', cloudM: 'cloud_cover_mid', cloudH: 'cloud_cover_high',
  vis: 'visibility', ws: 'wind_speed_10m', wd: 'wind_direction_10m', wg: 'wind_gusts_10m', ws80: 'wind_speed_80m', wd80: 'wind_direction_80m',
  isDay: 'is_day', cape: 'cape', fzl: 'freezing_level_height', swr: 'shortwave_radiation', et0: 'et0_fao_evapotranspiration', vpd: 'vapour_pressure_deficit',
  soilT: 'soil_temperature_0cm', soilM: 'soil_moisture_0_to_1cm', uv: 'uv_index', uvClear: 'uv_index_clear_sky', sun: 'sunshine_duration',
  li: 'lifted_index', cin: 'convective_inhibition', wetbulb: 'wet_bulb_temperature_2m', pbl: 'boundary_layer_height'
};
const OM_UNSURE = ['uv_index', 'uv_index_clear_sky', 'sunshine_duration', 'lifted_index', 'convective_inhibition', 'wet_bulb_temperature_2m', 'boundary_layer_height'];
const H_KEYS = Object.keys(OM_HOURLY);
const OM_DAILY = {
  code: 'weather_code', tmax: 'temperature_2m_max', tmin: 'temperature_2m_min', fmax: 'apparent_temperature_max', fmin: 'apparent_temperature_min',
  sunrise: 'sunrise', sunset: 'sunset', daylight: 'daylight_duration', sunshine: 'sunshine_duration', uvMax: 'uv_index_max',
  precip: 'precipitation_sum', rain: 'rain_sum', showers: 'showers_sum', snow: 'snowfall_sum', precipHours: 'precipitation_hours', popMax: 'precipitation_probability_max',
  wsMax: 'wind_speed_10m_max', wgMax: 'wind_gusts_10m_max', wdDom: 'wind_direction_10m_dominant', swrSum: 'shortwave_radiation_sum', et0: 'et0_fao_evapotranspiration'
};
const D_KEYS = Object.keys(OM_DAILY);
const OM_CURRENT = { temp: 'temperature_2m', rh: 'relative_humidity_2m', feels: 'apparent_temperature', isDay: 'is_day', precip: 'precipitation', code: 'weather_code', cloud: 'cloud_cover', pmsl: 'pressure_msl', psfc: 'surface_pressure', ws: 'wind_speed_10m', wd: 'wind_direction_10m', wg: 'wind_gusts_10m' };
const MODELS = [
  ['best_match', 'mBest', 16], ['ecmwf_ifs025', 'ECMWF IFS 0.25°', 15], ['ecmwf_aifs025_single', 'ECMWF AIFS', 15], ['gfs_seamless', 'NOAA GFS', 16], ['icon_seamless', 'DWD ICON', 7.5],
  ['gem_seamless', 'GEM (Canada)', 10], ['meteofrance_seamless', 'Météo-France', 4], ['ukmo_seamless', 'UK Met Office', 7], ['jma_seamless', 'JMA (Japan)', 11]
];
const modelLabel = id => { const m = MODELS.find(x => x[0] === id); return m ? (m[1].startsWith('m') && !m[1].includes(' ') ? t(m[1]) : m[1]) : id; };

function emptyHourly(T) { const h = { t: T }; for (const k of H_KEYS) h[k] = new Array(T.length).fill(null); return h; }
function emptyDaily(n) { const d = { t: new Array(n).fill(null) }; for (const k of D_KEYS) d[k] = new Array(n).fill(null); return d; }
function interpGaps(a, maxGap = 12) {
  let last = -1;
  for (let i = 0; i < a.length; i++) {
    if (!isNum(a[i])) continue;
    if (last >= 0 && i - last > 1 && i - last <= maxGap) { const v0 = a[last], v1 = a[i]; for (let k = last + 1; k < i; k++) a[k] = v0 + (v1 - v0) * (k - last) / (i - last); }
    last = i;
  }
  return a;
}
function interpDir(a, maxGap = 12) {
  let last = -1;
  for (let i = 0; i < a.length; i++) {
    if (!isNum(a[i])) continue;
    if (last >= 0 && i - last > 1 && i - last <= maxGap) { const d0 = a[last], diff = ((a[i] - d0 + 540) % 360) - 180; for (let k = last + 1; k < i; k++) a[k] = (d0 + diff * (k - last) / (i - last) + 360) % 360; }
    last = i;
  }
  return a;
}
const Phys = {
  dew(T, RH) { if (!isNum(T) || !isNum(RH) || RH <= 0) return null; const a = 17.625, b = 243.04, g = Math.log(RH / 100) + a * T / (b + T); return b * g / (a - g); },
  apparent(T, RH, wsKmh) { if (!isNum(T)) return null; const e = isNum(RH) ? RH / 100 * 6.105 * Math.exp(17.27 * T / (237.7 + T)) : 0; const ws = isNum(wsKmh) ? wsKmh / 3.6 : 0; return T + 0.33 * e - 0.70 * ws - 4.0; },
  wetBulb(T, RH) { if (!isNum(T) || !isNum(RH)) return null; return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331) + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035; },
  uvClear(ms, lat, lon) { const alt = Astro.sunPos(ms, lat, lon).altitude; return alt <= 0 ? 0 : 12.5 * Math.pow(Math.sin(alt), 2.42); }
};

/* ---------- Open-Meteo forecast ---------- */
function omForecast(loc, model, safe) {
  const hourly = Object.values(OM_HOURLY).filter(v => !safe || !OM_UNSURE.includes(v));
  const p = {
    latitude: loc.lat.toFixed(4), longitude: loc.lon.toFixed(4), hourly: hourly.join(','), daily: Object.values(OM_DAILY).join(','),
    current: Object.values(OM_CURRENT).join(','), timezone: 'auto', timeformat: 'unixtime', forecast_days: 16, past_days: 1, models: model || 'best_match'
  };
  if (!safe) p.minutely_15 = 'precipitation,snowfall';
  return omGet('https://api.open-meteo.com/v1/forecast', p, 'Open-Meteo', { timeout: 15000 });
}
function normOM(j, loc, model) {
  const H = j.hourly || {}, T = (H.time || []).map(s => s * 1000), n = T.length;
  if (!n) throw new Error(t('errFormat'));
  const h = { t: T };
  for (const k of H_KEYS) { const a = H[OM_HOURLY[k]]; h[k] = Array.isArray(a) && a.length === n ? a.map(num) : null; }
  if (!hasData(h.temp)) throw new Error(t('errNoData'));
  const Dd = j.daily || {}, DT = (Dd.time || []).map(s => s * 1000);
  const d = { t: DT };
  for (const k of D_KEYS) { const a = Dd[OM_DAILY[k]]; d[k] = Array.isArray(a) && a.length === DT.length ? a.map(v => (v == null ? null : ((k === 'sunrise' || k === 'sunset') ? +v * 1000 : +v))) : null; }
  let cur = null;
  if (j.current && isNum(j.current.time)) { cur = { t: j.current.time * 1000 }; for (const k of Object.keys(OM_CURRENT)) cur[k] = num(j.current[OM_CURRENT[k]]); }
  let m15 = null;
  const M = j.minutely_15;
  if (M && Array.isArray(M.time) && M.time.length && Array.isArray(M.precipitation) && M.precipitation.some(isNum)) {
    const now = Date.now(), keep = M.time.map((s, i) => [s * 1000, i]).filter(([ms]) => ms > now - HOUR && ms < now + 4 * HOUR).map(([, i]) => i);
    if (keep.length) m15 = { t: keep.map(i => M.time[i] * 1000), precip: keep.map(i => num(M.precipitation[i])), snow: Array.isArray(M.snowfall) ? keep.map(i => num(M.snowfall[i])) : null };
  }
  return finalize({ provider: 'Open-Meteo', model: model || 'best_match', lat: num(j.latitude) ?? loc.lat, lon: num(j.longitude) ?? loc.lon, elev: num(j.elevation), tz: j.timezone, h, d: DT.length ? d : null, cur, m15 }, loc);
}

/* ---------- MET Norway (fallback 1) ---------- */
function metnoForecast(loc) { return Net.json(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${loc.lat.toFixed(4)}&lon=${loc.lon.toFixed(4)}`, { service: 'MET Norway', timeout: 10000 }); }
function symToWmo(sym) {
  if (!sym) return null;
  const s = String(sym).replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  const M = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45, lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82, lightsleet: 68, sleet: 69, heavysleet: 69, lightsleetshowers: 68, sleetshowers: 69, heavysleetshowers: 69, lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86 };
  return M[s] != null ? M[s] : 3;
}
function normMetNo(j, loc) {
  const ts = j && j.properties && j.properties.timeseries;
  if (!Array.isArray(ts) || !ts.length) throw new Error(t('errNoData'));
  const t0 = Date.parse(ts[0].time), tN = Date.parse(ts[ts.length - 1].time);
  const n = Math.round((tN - t0) / HOUR) + 7;
  const T = range(0, n).map(i => t0 + i * HOUR), h = emptyHourly(T), fog = new Array(n).fill(null);
  let lastInst = 0;
  for (const s of ts) {
    const i = Math.round((Date.parse(s.time) - t0) / HOUR); if (i < 0 || i >= n) continue;
    const D = (s.data && s.data.instant && s.data.instant.details) || {};
    h.temp[i] = num(D.air_temperature); h.pmsl[i] = num(D.air_pressure_at_sea_level); h.cloud[i] = num(D.cloud_area_fraction);
    h.cloudL[i] = num(D.cloud_area_fraction_low); h.cloudM[i] = num(D.cloud_area_fraction_medium); h.cloudH[i] = num(D.cloud_area_fraction_high);
    h.dew[i] = num(D.dew_point_temperature); h.rh[i] = num(D.relative_humidity); h.wd[i] = num(D.wind_from_direction);
    h.ws[i] = isNum(+D.wind_speed) ? D.wind_speed * 3.6 : null; h.wg[i] = isNum(+D.wind_speed_of_gust) ? D.wind_speed_of_gust * 3.6 : null;
    h.uvClear[i] = num(D.ultraviolet_index_clear_sky); fog[i] = num(D.fog_area_fraction);
    if (isNum(h.temp[i])) lastInst = i;
    const n1 = s.data && s.data.next_1_hours, n6 = s.data && s.data.next_6_hours;
    if (n1) {
      if (i + 1 < n) { h.code[i + 1] = symToWmo(n1.summary && n1.summary.symbol_code); h.precip[i + 1] = num(n1.details && n1.details.precipitation_amount); h.pop[i + 1] = num(n1.details && n1.details.probability_of_precipitation); }
    } else if (n6) {
      const c = symToWmo(n6.summary && n6.summary.symbol_code), p = num(n6.details && n6.details.precipitation_amount), pp = num(n6.details && n6.details.probability_of_precipitation);
      for (let k = 1; k <= 6 && i + k < n; k++) if (h.code[i + k] == null) { h.code[i + k] = c; h.precip[i + k] = p == null ? null : p / 6; h.pop[i + k] = pp; }
    }
  }
  ['temp', 'pmsl', 'cloud', 'cloudL', 'cloudM', 'cloudH', 'dew', 'rh', 'ws', 'wg', 'uvClear'].forEach(k => interpGaps(h[k]));
  interpDir(h.wd); interpGaps(fog);
  h.code[0] = h.code[0] ?? h.code[1];
  for (let i = 0; i < n; i++) if (isNum(fog[i]) && fog[i] > 50 && (h.code[i] == null || h.code[i] <= 3)) h.code[i] = 45;
  const keep = lastInst + 1;
  for (const k of Object.keys(h)) h[k] = h[k].slice(0, keep);
  const geo = j.geometry && j.geometry.coordinates;
  return finalize({ provider: 'MET Norway', model: 'metno', lat: loc.lat, lon: loc.lon, elev: geo ? num(geo[2]) : null, tz: loc.tz, h, d: null, cur: null, m15: null }, loc);
}

/* ---------- wttr.in (fallback 2) ---------- */
function wttrForecast(loc) { return Net.json(`https://wttr.in/${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}?format=j1`, { service: 'wttr.in', timeout: 10000 }); }
const WWO = { 113: 0, 116: 2, 119: 3, 122: 3, 143: 45, 248: 45, 260: 48, 176: 80, 179: 85, 182: 68, 185: 56, 200: 95, 227: 73, 230: 75, 263: 51, 266: 53, 281: 56, 284: 57, 293: 61, 296: 61, 299: 63, 302: 63, 305: 65, 308: 65, 311: 66, 314: 67, 317: 68, 320: 69, 323: 71, 326: 71, 329: 73, 332: 73, 335: 75, 338: 75, 350: 77, 353: 80, 356: 81, 359: 82, 362: 68, 365: 69, 368: 85, 371: 86, 374: 77, 377: 77, 386: 95, 389: 95, 392: 95, 395: 95 };
function normWttr(j, loc) {
  const days = j && j.weather; if (!Array.isArray(days) || !days.length) throw new Error(t('errNoData'));
  TZ.set(loc.tz || tzFromLon(loc.lon));
  const pts = [];
  for (const day of days) {
    const [Y, M, D] = String(day.date).split('-').map(Number);
    for (const hr of day.hourly || []) { const hh = Math.floor((+hr.time || 0) / 100); pts.push({ t: TZ.toUTC(Y, M, D, hh, 0), hr }); }
  }
  pts.sort((a, b) => a.t - b.t);
  const t0 = pts[0].t, n = Math.round((pts[pts.length - 1].t - t0) / HOUR) + 4;
  const T = range(0, n).map(i => t0 + i * HOUR), h = emptyHourly(T);
  for (const { t: tt, hr } of pts) {
    const i = Math.round((tt - t0) / HOUR); if (i < 0 || i >= n) continue;
    h.temp[i] = num(hr.tempC); h.feels[i] = num(hr.FeelsLikeC); h.dew[i] = num(hr.DewPointC); h.rh[i] = num(hr.humidity); h.pmsl[i] = num(hr.pressure);
    h.cloud[i] = num(hr.cloudcover); h.vis[i] = isNum(+hr.visibility) ? hr.visibility * 1000 : null; h.ws[i] = num(hr.windspeedKmph); h.wd[i] = num(hr.winddirDegree);
    h.wg[i] = num(hr.WindGustKmph); h.uv[i] = num(hr.uvIndex);
    const c = WWO[+hr.weatherCode] != null ? WWO[+hr.weatherCode] : null, p = num(hr.precipMM);
    const pp = Math.max(num(hr.chanceofrain) || 0, num(hr.chanceofsnow) || 0, num(hr.chanceofthunder) || 0);
    for (let k = 1; k <= 3 && i + k < n; k++) { h.code[i + k] = c; h.precip[i + k] = p == null ? null : p / 3; h.pop[i + k] = pp; }
    if (i === 0) { h.code[0] = c; h.pop[0] = pp; }
  }
  ['temp', 'feels', 'dew', 'rh', 'pmsl', 'cloud', 'vis', 'ws', 'wg', 'uv'].forEach(k => interpGaps(h[k]));
  interpDir(h.wd);
  let cur = null; const cc = j.current_condition && j.current_condition[0];
  if (cc) cur = { t: Date.now(), temp: num(cc.temp_C), feels: num(cc.FeelsLikeC), rh: num(cc.humidity), code: WWO[+cc.weatherCode] ?? null, precip: num(cc.precipMM), cloud: num(cc.cloudcover), pmsl: num(cc.pressure), ws: num(cc.windspeedKmph), wd: num(cc.winddirDegree), wg: null, isDay: null };
  return finalize({ provider: 'wttr.in', model: 'wwo', lat: loc.lat, lon: loc.lon, elev: null, tz: loc.tz, h, d: null, cur, m15: null }, loc);
}

/* ---------- 7Timer! (fallback 3) ---------- */
function sevenTimerForecast(loc) { return Net.json(`https://www.7timer.info/bin/api.pl?lon=${loc.lon.toFixed(3)}&lat=${loc.lat.toFixed(3)}&product=civil&output=json`, { service: '7Timer!', timeout: 10000 }); }
function norm7Timer(j, loc) {
  const ds = j && j.dataseries; if (!Array.isArray(ds) || !ds.length || !j.init) throw new Error(t('errNoData'));
  const s = String(j.init), t00 = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10));
  const pts = ds.map(r => ({ t: t00 + r.timepoint * HOUR, r })).sort((a, b) => a.t - b.t);
  const t0 = pts[0].t, n = Math.round((pts[pts.length - 1].t - t0) / HOUR) + 4;
  const T = range(0, n).map(i => t0 + i * HOUR), h = emptyHourly(T);
  const CC = [0, 3, 12, 25, 37, 50, 62, 75, 87, 97], WS = [0, 0.2, 1.8, 5.7, 9.4, 14, 21, 28.5, 35], PR = [0, 0.1, 0.6, 2.5, 7, 13, 23, 40, 62, 80];
  const DIRS = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  const WX = w => { const s2 = String(w || '').replace(/(day|night)$/, ''); return ({ clear: 0, pcloudy: 2, mcloudy: 3, cloudy: 3, humid: 45, lightrain: 61, oshower: 80, ishower: 80, lightsnow: 71, rain: 63, snow: 73, rainsnow: 68, ts: 95, tsrain: 95 })[s2] ?? 3; };
  for (const { t: tt, r } of pts) {
    const i = Math.round((tt - t0) / HOUR); if (i < 0 || i >= n) continue;
    h.temp[i] = num(r.temp2m); h.rh[i] = num(String(r.rh2m || '').replace('%', '')); h.cloud[i] = CC[r.cloudcover] ?? null; h.li[i] = num(r.lifted_index);
    if (r.wind10m) { h.ws[i] = (WS[r.wind10m.speed] ?? null) != null ? WS[r.wind10m.speed] * 3.6 : null; h.wd[i] = DIRS[r.wind10m.direction] ?? null; }
    const c = WX(r.weather), rate = r.prec_type === 'none' ? 0 : (PR[r.prec_amount] ?? 0);
    for (let k = 1; k <= 3 && i + k < n; k++) { h.code[i + k] = c; h.precip[i + k] = rate; }
    if (i === 0) h.code[0] = c;
  }
  ['temp', 'rh', 'cloud', 'ws', 'li'].forEach(k => interpGaps(h[k]));
  interpDir(h.wd);
  return finalize({ provider: '7Timer!', model: '7timer', lat: loc.lat, lon: loc.lon, elev: null, tz: loc.tz, h, d: null, cur: null, m15: null }, loc);
}

/* ---------- fill gaps, derive what a provider left out ---------- */
function finalize(o, loc) {
  const H = o.h, n = H.t.length;
  for (const k of H_KEYS) if (!Array.isArray(H[k]) || H[k].length !== n) H[k] = new Array(n).fill(null);
  if (!TZ.valid(o.tz)) o.tz = (loc && TZ.valid(loc.tz)) ? loc.tz : tzFromLon(o.lon ?? loc.lon);
  TZ.set(o.tz);
  const lat = o.lat ?? loc.lat, lon = o.lon ?? loc.lon;
  const noRainSplit = !hasData(H.rain) && !hasData(H.snow);
  for (let i = 0; i < n; i++) {
    const T = H.temp[i], RH = H.rh[i];
    if (H.dew[i] == null && isNum(T) && isNum(RH)) H.dew[i] = Phys.dew(T, RH);
    if (H.rh[i] == null && isNum(T) && isNum(H.dew[i])) H.rh[i] = clamp(100 * Math.exp(17.625 * H.dew[i] / (243.04 + H.dew[i])) / Math.exp(17.625 * T / (243.04 + T)), 0, 100);
    if (H.feels[i] == null && isNum(T)) H.feels[i] = Phys.apparent(T, H.rh[i], H.ws[i]);
    if (H.wetbulb[i] == null && isNum(T) && isNum(H.rh[i])) H.wetbulb[i] = Phys.wetBulb(T, H.rh[i]);
    if (H.isDay[i] == null) H.isDay[i] = Astro.sunPos(H.t[i] - 1800e3, lat, lon).altitude > -0.0145 ? 1 : 0;
    if (H.uv[i] == null) {
      const uc = isNum(H.uvClear[i]) ? H.uvClear[i] : Phys.uvClear(H.t[i] - 1800e3, lat, lon);
      const c = H.cloud[i]; H.uv[i] = Math.round(uc * (isNum(c) ? 1 - 0.6 * Math.pow(c / 100, 1.5) : 1) * 10) / 10;
    }
    if (H.code[i] == null && isNum(H.cloud[i])) {
      const c = H.cloud[i], p = H.precip[i];
      H.code[i] = isNum(p) && p >= 0.1 ? (T != null && T < 1 ? 71 : p >= 4 ? 65 : p >= 1 ? 63 : 61) : c < 20 ? 0 : c < 45 ? 1 : c < 80 ? 2 : 3;
    }
    if (noRainSplit && isNum(H.precip[i])) {
      const c = H.code[i], p = H.precip[i];
      if (isSnowCode(c)) { H.snow[i] = p; H.rain[i] = 0; }
      else if (c === 68 || c === 69) { H.snow[i] = p / 2 * 0.7; H.rain[i] = p / 2; }
      else { H.rain[i] = p; H.snow[i] = 0; }
    }
  }
  if (!o.d || !o.d.t || !o.d.t.length) o.d = deriveDaily(o, lat, lon);
  else {
    const D = o.d; const m = D.t.length;
    for (const k of D_KEYS) if (!Array.isArray(D[k]) || D[k].length !== m) D[k] = new Array(m).fill(null);
    for (let i = 0; i < m; i++) {
      if (!isNum(D.sunrise[i]) || !isNum(D.sunset[i])) { const st = Astro.sunTimes(D.t[i] + 12 * HOUR, lat, lon); D.sunrise[i] = st.sunrise; D.sunset[i] = st.sunset; }
      if (!isNum(D.daylight[i]) && isNum(D.sunrise[i]) && isNum(D.sunset[i])) D.daylight[i] = (D.sunset[i] - D.sunrise[i]) / 1000;
      if (!isNum(D.uvMax[i])) D.uvMax[i] = maxOf(dayHours(o, D.t[i]).map(j => H.uv[j]));
    }
  }
  if (!o.cur || !isNum(o.cur.temp)) o.cur = currentFromHourly(o);
  else { const c = currentFromHourly(o); for (const k of Object.keys(c)) if (o.cur[k] == null) o.cur[k] = c[k]; }
  o.fetchedAt = o.fetchedAt || Date.now();
  o.v = 3;
  const di = dayIdx(o); o.days = o.d.t.filter((tt, i) => i >= di && isNum(o.d.tmax[i])).length;
  return o;
}
function dayHours(o, dayStartMs) { const out = []; const H = o.h; for (let i = 0; i < H.t.length; i++) if (H.t[i] >= dayStartMs && H.t[i] < dayStartMs + 24 * HOUR) out.push(i); return out; }
function dailyCode(codes) {
  const v = codes.filter(isNum); if (!v.length) return null;
  const th = v.filter(c => c >= 95); if (th.length) return worstCode(th);
  const pr = v.filter(c => c >= 51);
  if (pr.length >= 3) return worstCode(pr);
  if (pr.length >= 1) { const w = worstCode(pr); return isSnowCode(w) ? 85 : ((w >= 56 && w <= 57) || (w >= 66 && w <= 69)) ? w : 80; }
  const fog = v.filter(c => c === 45 || c === 48).length; if (fog >= Math.max(3, v.length / 3)) return 45;
  const cl = v.filter(c => c <= 3); if (!cl.length) return worstCode(v);
  return Math.round(meanOf(cl));
}
function deriveDaily(o, lat, lon) {
  const H = o.h, groups = new Map();
  H.t.forEach((tt, i) => { const k = TZ.parts(tt).key; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const keys = [...groups.keys()];
  const D = emptyDaily(0);
  keys.forEach((k, gi) => {
    const idx = groups.get(k);
    if (!idx.length || (gi === keys.length - 1 && idx.length < 12) || (gi > 0 && idx.length < 4)) return;
    const ds = TZ.dayStart(H.t[idx[0]]);
    const dayIdx2 = idx.filter(i => { const hh = TZ.parts(H.t[i]).h; return hh >= 6 && hh <= 21; });
    const st = Astro.sunTimes(ds + 12 * HOUR, lat, lon);
    const sunSum = sumOf(pick(H.sun, idx));
    const row = {
      t: ds, code: dailyCode(pick(H.code, dayIdx2.length >= 3 ? dayIdx2 : idx)), tmax: maxOf(pick(H.temp, idx)), tmin: minOf(pick(H.temp, idx)),
      fmax: maxOf(pick(H.feels, idx)), fmin: minOf(pick(H.feels, idx)), sunrise: st.sunrise, sunset: st.sunset,
      daylight: isNum(st.sunrise) && isNum(st.sunset) ? (st.sunset - st.sunrise) / 1000 : null, sunshine: sunSum,
      uvMax: maxOf(pick(H.uv, idx)), precip: sumOf(pick(H.precip, idx)), rain: sumOf(pick(H.rain, idx)), showers: sumOf(pick(H.showers, idx)), snow: sumOf(pick(H.snow, idx)),
      precipHours: pick(H.precip, idx).filter(v => isNum(v) && v >= 0.1).length, popMax: maxOf(pick(H.pop, idx)),
      wsMax: maxOf(pick(H.ws, idx)), wgMax: maxOf(pick(H.wg, idx)), wdDom: vecMeanDir(pick(H.ws, idx), pick(H.wd, idx)),
      swrSum: hasData(pick(H.swr, idx)) ? sumOf(pick(H.swr, idx)) * 3600 / 1e6 : null, et0: sumOf(pick(H.et0, idx))
    };
    D.t.push(row.t); for (const key of D_KEYS) D[key].push(row[key] ?? null);
  });
  return D;
}
function currentFromHourly(o) {
  const H = o.h, now = Date.now(), i = hourIdx(o, now), j = Math.min(H.t.length - 1, i + 1);
  const f = H.t[j] > H.t[i] ? clamp((now - H.t[i]) / (H.t[j] - H.t[i]), 0, 1) : 0;
  const lerp = k => (isNum(H[k][i]) && isNum(H[k][j]) ? H[k][i] + (H[k][j] - H[k][i]) * f : H[k][i]);
  return { t: now, temp: lerp('temp'), feels: lerp('feels'), rh: lerp('rh'), dew: lerp('dew'), code: H.code[f > 0.5 ? j : i] ?? H.code[i], isDay: H.isDay[i], precip: H.precip[j], cloud: lerp('cloud'), pmsl: lerp('pmsl'), psfc: lerp('psfc'), ws: lerp('ws'), wd: H.wd[i], wg: H.wg[j] ?? H.wg[i] };
}
/* current conditions; recomputed from the hourly series when the saved "current" block is old (offline cache) */
function curOf(o) { return o.cur && isNum(o.cur.temp) && Date.now() - (o.cur.t || 0) < 90 * 60e3 ? o.cur : currentFromHourly(o); }
function hourIdx(o, ms = Date.now()) {
  const T = o.h.t; let lo = 0, hi = T.length - 1;
  if (!T.length || ms <= T[0]) return 0; if (ms >= T[hi]) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= ms) lo = mid; else hi = mid; }
  return lo;
}
function dayIdx(o, ms = Date.now()) {
  const D = o.d; if (!D || !D.t.length) return 0;
  const k = TZ.parts(ms).key;
  for (let i = 0; i < D.t.length; i++) if (TZ.parts(D.t[i] + 6 * HOUR).key === k) return i;
  let best = 0; for (let i = 0; i < D.t.length; i++) if (D.t[i] <= ms) best = i; return best;
}
function slotMap(o) {
  if (o._slot && o._slotTz === TZ.zone) return o._slot;
  const m = new Map(); o.h.t.forEach((tt, i) => { const p = TZ.parts(tt); m.set(p.key + '|' + p.h, i); });
  Object.defineProperty(o, '_slot', { value: m, enumerable: false, writable: true, configurable: true });
  Object.defineProperty(o, '_slotTz', { value: TZ.zone, enumerable: false, writable: true, configurable: true });
  return m;
}
function slotIndex(o, dayMs, h) { const k = TZ.parts(dayMs + 12 * HOUR).key; const v = slotMap(o).get(k + '|' + h); return v == null ? null : v; }

/* ---------- forecast with fallback chain ---------- */
/* The best-match blend can end before day 16 and leave some variables empty for a place
   (for Karabiga it stops after 10 days and has no visibility). Those gaps are filled value by
   value from NOAA GFS, which runs 16 days and carries every variable the app uses. */
const FILL_CHECK = ['temperature_2m', 'visibility', 'precipitation_probability', 'uv_index', 'cape', 'freezing_level_height'];
function hasGaps(j) {
  const H = j.hourly || {}, D = j.daily || {}, now = Date.now() / 1000;
  if (!Array.isArray(H.time)) return false;
  const dayGap = Array.isArray(D.time) && D.time.some((tt, i) => tt >= now - 86400 && (!Array.isArray(D.temperature_2m_max) || D.temperature_2m_max[i] == null));
  const varGap = FILL_CHECK.some(k => !Array.isArray(H[k]) || H[k].some((v, i) => v == null && H.time[i] >= now - 3600));
  return dayGap || varGap;
}
async function fillFromGfs(j) {
  const p = { ...(j._req || {}), models: 'gfs_seamless' }; delete p.minutely_15; delete p.current;
  const g = await omGet('https://api.open-meteo.com/v1/forecast', p, 'NOAA GFS', { timeout: 15000 });
  const filled = { days: [], vars: new Set() };
  for (const sec of ['hourly', 'daily']) {
    const A = j[sec], B = g[sec]; if (!A || !B || !Array.isArray(A.time) || !Array.isArray(B.time)) continue;
    const at = new Map(B.time.map((tt, i) => [tt, i]));
    for (const k of Object.keys(B)) {
      if (k === 'time' || !Array.isArray(B[k])) continue;
      if (!Array.isArray(A[k]) || A[k].length !== A.time.length) A[k] = new Array(A.time.length).fill(null);
      const wasEmpty = !A[k].some(v => v != null);
      let n = 0;
      for (let i = 0; i < A.time.length; i++) {
        if (A[k][i] != null) continue;
        const bi = at.get(A.time[i]); if (bi == null || B[k][bi] == null) continue;
        A[k][i] = B[k][bi]; n++;
        if (sec === 'daily' && k === 'temperature_2m_max') filled.days.push(A.time[i] * 1000);
      }
      if (n && wasEmpty && sec === 'hourly') filled.vars.add(k);
    }
  }
  return filled;
}
async function fetchOM(loc, model, safe) {
  const j = await omForecast(loc, model, safe);
  let filled = null;
  if ((model || 'best_match') === 'best_match' && hasGaps(j)) { try { filled = await fillFromGfs(j); } catch (e) { /* keep what best match gave */ } }
  const r = normOM(j, loc, model);
  if (filled && (filled.days.length || filled.vars.size)) r.filled = { days: filled.days.filter(ms => ms >= TZ.dayStart(Date.now())), vars: [...filled.vars] };
  return r;
}
async function getForecast(loc, model, onStep) {
  const errs = [];
  const step = name => { try { onStep && onStep(name); } catch (e) { /* ignore */ } };
  step('Open-Meteo');
  try { return await fetchOM(loc, model, false); }
  catch (e) {
    errs.push(['Open-Meteo', e.message]);
    if (!e.network && e.status !== 429) {
      try { return await fetchOM(loc, model, true); } catch (e2) { errs.push(['Open-Meteo', e2.message]); }
      if (model !== 'best_match') { try { const r = normOM(await omForecast(loc, 'best_match', true), loc, 'best_match'); r.modelFallback = model; return r; } catch (e3) { errs.push(['Open-Meteo', e3.message]); } }
    }
  }
  for (const [name, fetcher, norm] of [['MET Norway', metnoForecast, normMetNo], ['wttr.in', wttrForecast, normWttr], ['7Timer!', sevenTimerForecast, norm7Timer]]) {
    step(name);
    try { const r = norm(await fetcher(loc), loc); r.fallback = true; r.fallbackErrors = errs.slice(); return r; }
    catch (e) { errs.push([name, e.message]); }
  }
  const err = new Error(t('errAll')); err.errors = errs; throw err;
}

/* ---------- air quality ---------- */
async function getAirQuality(loc) {
  const vars = 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,european_aqi,us_aqi';
  const j = await omGet('https://air-quality-api.open-meteo.com/v1/air-quality', {
    latitude: loc.lat.toFixed(4), longitude: loc.lon.toFixed(4), current: vars,
    hourly: vars + ',alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen',
    timezone: 'auto', timeformat: 'unixtime', forecast_days: 5
  }, 'Open-Meteo Air Quality', { timeout: 12000 });
  const H = j.hourly || {}, T = (H.time || []).map(s => s * 1000), g = k => (Array.isArray(H[k]) ? H[k].map(num) : new Array(T.length).fill(null));
  const C = j.current || {};
  const aq = { t: T, eu: g('european_aqi'), us: g('us_aqi'), pm25: g('pm2_5'), pm10: g('pm10'), no2: g('nitrogen_dioxide'), o3: g('ozone'), so2: g('sulphur_dioxide'), co: g('carbon_monoxide'), dust: g('dust'), pollen: {} };
  for (const p of ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed']) { const a = g(p + '_pollen'); if (hasData(a)) aq.pollen[p] = a; }
  aq.cur = { eu: num(C.european_aqi), us: num(C.us_aqi), pm25: num(C.pm2_5), pm10: num(C.pm10), no2: num(C.nitrogen_dioxide), o3: num(C.ozone), so2: num(C.sulphur_dioxide), co: num(C.carbon_monoxide), dust: num(C.dust) };
  if (!isNum(aq.cur.eu) && !isNum(aq.cur.us) && !hasData(aq.eu)) return null;
  if (!isNum(aq.cur.eu)) { const i = T.findIndex(x => x > Date.now()) - 1; aq.cur.eu = aq.eu[Math.max(0, i)]; aq.cur.us = aq.us[Math.max(0, i)]; }
  return aq;
}
/* ---------- marine ---------- */
async function getMarine(loc) {
  const j = await omGet('https://marine-api.open-meteo.com/v1/marine', {
    latitude: loc.lat.toFixed(4), longitude: loc.lon.toFixed(4),
    hourly: 'wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature',
    daily: 'wave_height_max,wave_direction_dominant,wave_period_max', timezone: 'auto', timeformat: 'unixtime', forecast_days: 7
  }, 'Open-Meteo Marine', { timeout: 12000 });
  const H = j.hourly || {}, T = (H.time || []).map(s => s * 1000), g = k => (Array.isArray(H[k]) ? H[k].map(num) : new Array(T.length).fill(null));
  const m = { t: T, wave: g('wave_height'), waveDir: g('wave_direction'), wavePer: g('wave_period'), windWave: g('wind_wave_height'), swell: g('swell_wave_height'), swellDir: g('swell_wave_direction'), swellPer: g('swell_wave_period'), sst: g('sea_surface_temperature') };
  const Dd = j.daily || {};
  m.d = { t: (Dd.time || []).map(s => s * 1000), hmax: (Dd.wave_height_max || []).map(num), dir: (Dd.wave_direction_dominant || []).map(num), pmax: (Dd.wave_period_max || []).map(num) };
  m.dist = isNum(+j.latitude) ? haversine(loc.lat, loc.lon, +j.latitude, +j.longitude) : null;
  if (!hasData(m.wave) && !hasData(m.sst)) return null;
  if (isNum(m.dist) && m.dist > 35) return null;
  return m;
}
/* ---------- ensemble ---------- */
async function getEnsemble(loc) {
  let last;
  for (const model of ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless']) {
    try {
      const j = await omGet('https://ensemble-api.open-meteo.com/v1/ensemble', { latitude: loc.lat.toFixed(4), longitude: loc.lon.toFixed(4), hourly: 'temperature_2m,precipitation', models: model, forecast_days: 15, timezone: 'auto', timeformat: 'unixtime' }, 'Open-Meteo Ensemble', { timeout: 25000 });
      const r = normEnsemble(j, model); if (r) return r;
    } catch (e) { last = e; }
  }
  throw last || new Error(t('errNoData'));
}
function normEnsemble(j, model) {
  const H = j.hourly || {}, T = (H.time || []).map(s => s * 1000), n = T.length;
  const tk = Object.keys(H).filter(k => k.startsWith('temperature_2m') && Array.isArray(H[k]));
  const pk = Object.keys(H).filter(k => k.startsWith('precipitation') && Array.isArray(H[k]));
  if (tk.length < 5 || !n) return null;
  const MT = tk.map(k => H[k]), MP = pk.map(k => H[k]);
  const out = { model, n: tk.length, t: [], p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let i = 0; i < n; i++) {
    const v = MT.map(a => a[i]).filter(isNum).sort((a, b) => a - b);
    if (v.length < 3) continue;
    out.t.push(T[i]); out.p10.push(quantile(v, 0.1)); out.p25.push(quantile(v, 0.25)); out.p50.push(quantile(v, 0.5)); out.p75.push(quantile(v, 0.75)); out.p90.push(quantile(v, 0.9));
  }
  const groups = new Map();
  T.forEach((tt, i) => { const k = TZ.parts(tt).key; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  out.days = { t: [], prob1: [], prob10: [], p50: [], p90: [] };
  for (const idx of groups.values()) {
    if (idx.length < 20) continue;
    const sums = MP.map(a => sumOf(pick(a, idx))).filter(isNum).sort((a, b) => a - b);
    if (sums.length < 3) continue;
    out.days.t.push(TZ.dayStart(T[idx[0]])); out.days.prob1.push(100 * sums.filter(s => s >= 1).length / sums.length); out.days.prob10.push(100 * sums.filter(s => s >= 10).length / sums.length);
    out.days.p50.push(quantile(sums, 0.5)); out.days.p90.push(quantile(sums, 0.9));
  }
  return out.t.length ? out : null;
}
/* ---------- model comparison ---------- */
const COMPARE = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'meteofrance_seamless', 'ukmo_seamless', 'jma_seamless'];
async function getModels(loc) {
  const j = await omGet('https://api.open-meteo.com/v1/forecast', {
    latitude: loc.lat.toFixed(4), longitude: loc.lon.toFixed(4), hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
    models: COMPARE.join(','), timezone: 'auto', timeformat: 'unixtime', forecast_days: 16
  }, 'Open-Meteo models', { timeout: 20000 });
  const used = (j._req && j._req.models ? j._req.models.split(',') : COMPARE);
  const H = j.hourly || {}, D = j.daily || {};
  const out = { t: (H.time || []).map(s => s * 1000), dt: (D.time || []).map(s => s * 1000), models: [] };
  const arr = (o, k, id) => (o[k + '_' + id] || (used.length === 1 ? o[k] : null) || []).map(num);
  for (const id of used) {
    const temp = arr(H, 'temperature_2m', id); if (!temp.some(isNum)) continue;
    out.models.push({
      id, label: modelLabel(id), temp, precip: arr(H, 'precipitation', id), ws: arr(H, 'wind_speed_10m', id), wg: arr(H, 'wind_gusts_10m', id),
      tmax: arr(D, 'temperature_2m_max', id), tmin: arr(D, 'temperature_2m_min', id), psum: arr(D, 'precipitation_sum', id), wsMax: arr(D, 'wind_speed_10m_max', id), wgMax: arr(D, 'wind_gusts_10m_max', id)
    });
  }
  if (!out.models.length) throw new Error(t('errNoData'));
  return out;
}
/* ---------- climate normals 1991–2020 (ERA5) ----------
   One small request per year for a 52-day window around today keeps each
   call light under Open-Meteo's free rate limits (a single 30-year request
   would count as hundreds of calls). Cached on the device for 14 days. */
const doyLeap = (m, d) => [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335][m - 1] + d - 1;
async function getNormals(loc) {
  const key = 'clim:' + (Math.round(loc.lat * 4) / 4) + ',' + (Math.round(loc.lon * 4) / 4);
  const c = Store.get(key, null); if (c && c.v === 2 && Date.now() - c.at < 14 * DAY) return c;
  const s0 = new Date(Date.now() - 12 * DAY), M0 = s0.getUTCMonth(), D0 = s0.getUTCDate();
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const sx = new Float64Array(366), sn = new Float64Array(366), sp = new Float64Array(366), cnt = new Float64Array(366), cp = new Float64Array(366);
  const rx = new Array(366).fill(-Infinity), rn = new Array(366).fill(Infinity);
  const queue = range(1991, 2021); let ok = 0, lastErr = null;
  const add = j => {
    const D = j.daily || {}, T = D.time || [];
    for (let i = 0; i < T.length; i++) {
      const [, mm, dd] = String(T[i]).split('-').map(Number), base = doyLeap(mm, dd);
      const tx = num(D.temperature_2m_max && D.temperature_2m_max[i]), tn = num(D.temperature_2m_min && D.temperature_2m_min[i]), pr = num(D.precipitation_sum && D.precipitation_sum[i]);
      for (let w = -7; w <= 7; w++) {
        const k = (base + w + 366) % 366;
        if (isNum(tx) && isNum(tn)) { sx[k] += tx; sn[k] += tn; cnt[k]++; if (tx > rx[k]) rx[k] = tx; if (tn < rn[k]) rn[k] = tn; }
        if (isNum(pr)) { sp[k] += pr; cp[k]++; }
      }
    }
  };
  const worker = async () => {
    while (queue.length) {
      const y = queue.shift(), st = Date.UTC(y, M0, D0);
      try {
        add(await omGet('https://archive-api.open-meteo.com/v1/archive', { latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3), start_date: iso(st), end_date: iso(st + 51 * DAY), daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum', timezone: 'GMT' }, 'Open-Meteo Historical', { timeout: 20000 }));
        ok++;
      } catch (e) { lastErr = e; if (e.status === 429) queue.length = 0; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (ok < 10 || !cnt.some(v => v > 0)) throw lastErr || new Error(t('errNoData'));
  const r1 = v => Math.round(v * 10) / 10;
  const out = { v: 2, at: Date.now(), years: ok, tmax: [], tmin: [], prcp: [], rmax: [], rmin: [] };
  for (let k = 0; k < 366; k++) { out.tmax.push(cnt[k] ? r1(sx[k] / cnt[k]) : null); out.tmin.push(cnt[k] ? r1(sn[k] / cnt[k]) : null); out.prcp.push(cp[k] ? Math.round(sp[k] / cp[k] * 100) / 100 : null); out.rmax.push(isFinite(rx[k]) ? r1(rx[k]) : null); out.rmin.push(isFinite(rn[k]) ? r1(rn[k]) : null); }
  Store.set(key, out);
  return out;
}
/* ---------- forecast grid for the map ---------- */
async function getGrid(b, nx, ny) {
  const lats = [], lons = [];
  for (let iy = 0; iy < ny; iy++) {
    const la = b.n - (b.n - b.s) * iy / (ny - 1);
    for (let ix = 0; ix < nx; ix++) { let lo = b.w + (b.e - b.w) * ix / (nx - 1); lo = ((lo + 540) % 360) - 180; lats.push(la.toFixed(3)); lons.push(lo.toFixed(3)); }
  }
  const j = await omGet('https://api.open-meteo.com/v1/forecast', {
    latitude: lats.join(','), longitude: lons.join(','), hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,relative_humidity_2m',
    forecast_days: 16, timeformat: 'unixtime', timezone: 'GMT', temporal_resolution: 'hourly_3', cell_selection: 'nearest', models: 'best_match'
  }, 'Open-Meteo map grid', { timeout: 30000 });
  const arr = Array.isArray(j) ? j : [j];
  if (arr.length !== nx * ny) throw new Error(t('errFormat'));
  let times = (arr[0].hourly.time || []).map(s => s * 1000), sel = null;
  const native3 = times.length > 1 && times[1] - times[0] >= 3 * HOUR;
  if (!native3) { sel = []; times.forEach((tt, i) => { if (new Date(tt).getUTCHours() % 3 === 0) sel.push(i); }); times = sel.map(i => times[i]); }
  const nt = times.length, np = nx * ny, vars = {};
  const MAP = { temp: 'temperature_2m', precip: 'precipitation', ws: 'wind_speed_10m', wd: 'wind_direction_10m', wg: 'wind_gusts_10m', cloud: 'cloud_cover', pmsl: 'pressure_msl', rh: 'relative_humidity_2m' };
  for (const k of Object.keys(MAP)) {
    const A = new Float32Array(nt * np).fill(NaN);
    for (let p = 0; p < np; p++) { const src = arr[p].hourly[MAP[k]] || []; for (let it = 0; it < nt; it++) { const v = src[sel ? sel[it] : it]; A[it * np + p] = v == null ? NaN : v; } }
    vars[k] = A;
  }
  return { nx, ny, n: b.n, s: b.s, w: b.w, e: b.e, times, vars, precipDiv: native3 ? 3 : 1, at: Date.now() };
}

/* ---------- astronomy (port of SunCalc by V. Agafonkin, BSD-2) ---------- */
const Astro = (() => {
  const PI = Math.PI, rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toJulian = ms => ms / dayMs - 0.5 + J1970, fromJulian = j => (j + 0.5 - J1970) * dayMs, toDays = ms => toJulian(ms) - J2000;
  const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const refraction = h => { if (h < 0) h = 0; return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)); };
  const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = M => { const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); return M + C + rad * 102.9372 + PI; };
  const sunCoords = d => { const L = eclipticLongitude(solarMeanAnomaly(d)); return { dec: declination(L, 0), ra: rightAscension(L, 0) }; };
  function sunPos(ms, lat, lng) { const lw = rad * -lng, phi = rad * lat, d = toDays(ms), c = sunCoords(d), H = siderealTime(d, lw) - c.ra; return { azimuth: azimuth(H, phi, c.dec), altitude: altitude(H, phi, c.dec) }; }
  const J0 = 0.0009;
  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
  const TIMES = [[-0.833, 'sunrise', 'sunset'], [-0.3, 'sunriseEnd', 'sunsetStart'], [-6, 'dawn', 'dusk'], [-12, 'nauticalDawn', 'nauticalDusk'], [-18, 'nightEnd', 'night'], [6, 'goldenHourEnd', 'goldenHour']];
  function sunTimes(ms, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(ms), n = julianCycle(d, lw), ds = approxTransit(0, lw, n), M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0), Jnoon = solarTransitJ(ds, M, L);
    const r = { solarNoon: fromJulian(Jnoon), nadir: fromJulian(Jnoon - 0.5) };
    for (const [ang, rise, set] of TIMES) {
      const w = hourAngle(ang * rad, phi, dec);
      if (isNaN(w)) { r[rise] = null; r[set] = null; continue; }
      const Jset = solarTransitJ(approxTransit(w, lw, n), M, L), Jrise = Jnoon - (Jset - Jnoon);
      r[rise] = fromJulian(Jrise); r[set] = fromJulian(Jset);
    }
    return r;
  }
  function moonCoords(d) { const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F2 = rad * (93.272 + 13.229350 * d), l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F2), dt = 385001 - 20905 * Math.cos(M); return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt }; }
  function moonPos(ms, lat, lng) { const lw = rad * -lng, phi = rad * lat, d = toDays(ms), c = moonCoords(d), H = siderealTime(d, lw) - c.ra; let h = altitude(H, phi, c.dec); h += refraction(h); return { azimuth: azimuth(H, phi, c.dec), altitude: h, distance: c.dist }; }
  function moonIllum(ms) {
    const d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI, angle };
  }
  function moonTimes(start, lat, lng) {
    const hc = 0.133 * rad; let h0 = moonPos(start, lat, lng).altitude - hc, rise = null, set = null, ye = 0;
    for (let i = 1; i <= 24; i += 2) {
      const h1 = moonPos(start + i * HOUR, lat, lng).altitude - hc, h2 = moonPos(start + (i + 1) * HOUR, lat, lng).altitude - hc;
      const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a); ye = (a * xe + b) * xe + h1;
      const dd = b * b - 4 * a * h1; let roots = 0, x1 = 0, x2 = 0;
      if (dd >= 0) { const dx = Math.sqrt(dd) / (Math.abs(a) * 2); x1 = xe - dx; x2 = xe + dx; if (Math.abs(x1) <= 1) roots++; if (Math.abs(x2) <= 1) roots++; if (x1 < -1) x1 = x2; }
      if (roots === 1) { if (h0 < 0) rise = i + x1; else set = i + x1; }
      else if (roots === 2) { rise = i + (ye < 0 ? x2 : x1); set = i + (ye < 0 ? x1 : x2); }
      if (rise !== null && set !== null) break;
      h0 = h2;
    }
    const r = {}; if (rise !== null) r.rise = start + rise * HOUR; if (set !== null) r.set = start + set * HOUR;
    if (rise === null && set === null) r[ye > 0 ? 'alwaysUp' : 'alwaysDown'] = true;
    return r;
  }
  function nextPhase(from, target) {
    let prev = moonIllum(from).phase;
    for (let k = 1; k <= 24 * 31; k++) { const ms = from + k * HOUR, p = moonIllum(ms).phase; if (target === 0 ? p < prev - 0.5 : (prev < 0.5 && p >= 0.5)) return ms; prev = p; }
    return null;
  }
  return { sunPos, sunTimes, moonPos, moonIllum, moonTimes, nextPhase };
})();
function moonPhaseKey(p) { if (p < 0.033 || p > 0.967) return 'mNew'; if (p < 0.216) return 'mWaxC'; if (p < 0.283) return 'mFirstQ'; if (p < 0.466) return 'mWaxG'; if (p < 0.533) return 'mFull'; if (p < 0.716) return 'mWanG'; if (p < 0.783) return 'mLastQ'; return 'mWanC'; }
function moonSvg(fraction, phase, size = 56, south = false) {
  const r = 22, cx = 28, cy = 28, waxing = phase < 0.5, rx = Math.abs(1 - 2 * fraction) * r, flip = waxing === south;
  let d = '';
  if (fraction > 0.985) d = `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;
  else if (fraction > 0.015) d = `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx.toFixed(2)} ${r} 0 0 ${fraction < 0.5 ? 0 : 1} ${cx} ${cy - r}Z`;
  return `<svg viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" class="moon-dark"/>${d ? `<path class="moon-lit" d="${d}"${flip ? ' transform="translate(56 0) scale(-1 1)"' : ''}/>` : ''}<circle cx="${cx}" cy="${cy}" r="${r}" class="moon-rim"/></svg>`;
}

/* ---------- cache ---------- */
const Cache = {
  key: (loc, model) => 'fc:' + loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2) + ':' + model,
  get(loc, model) {
    const c = Store.get(this.key(loc, model), null);
    if (!c || c.v !== 3 || !c.h || !c.h.t) return null;
    const n = c.h.t.length; for (const k of H_KEYS) if (!Array.isArray(c.h[k])) c.h[k] = new Array(n).fill(null);
    if (c.d) { const m = c.d.t.length; for (const k of D_KEYS) if (!Array.isArray(c.d[k])) c.d[k] = new Array(m).fill(null); }
    return c;
  },
  put(loc, model, data) {
    const k = this.key(loc, model), o = { ...data, h: { ...data.h }, d: data.d ? { ...data.d } : null };
    for (const key of Object.keys(o.h)) if (key !== 't' && !hasData(o.h[key])) delete o.h[key];
    if (o.d) for (const key of Object.keys(o.d)) if (key !== 't' && !hasData(o.d[key])) delete o.d[key];
    let ok = Store.set(k, o);
    if (!ok) { this.evict(3); ok = Store.set(k, o); }
    const idx = Store.get('fcIndex', []).filter(x => x !== k); idx.unshift(k);
    while (idx.length > 6) Store.del(idx.pop());
    Store.set('fcIndex', idx);
  },
  evict(n) { const idx = Store.get('fcIndex', []); for (let i = 0; i < n && idx.length; i++) Store.del(idx.pop()); Store.set('fcIndex', idx); },
  clearAll() { for (const k of Store.keys('fc')) Store.del(k); for (const k of Store.keys('clim:')) Store.del(k); Store.del('fcIndex'); }
};
const sameLoc = (a, b) => a && b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
const Favs = {
  list() { return Store.get('favs', []); },
  has(loc) { return this.list().some(f => sameLoc(f, loc)); },
  toggle(loc) { let l = this.list(); if (this.has(loc)) l = l.filter(f => !sameLoc(f, loc)); else l.unshift(slimLoc(loc)); Store.set('favs', l.slice(0, 24)); return this.has(loc); },
  remove(loc) { Store.set('favs', this.list().filter(f => !sameLoc(f, loc))); }
};
const Recents = {
  list() { return Store.get('recents', []); },
  add(loc) { const l = this.list().filter(f => !sameLoc(f, loc)); l.unshift(slimLoc(loc)); Store.set('recents', l.slice(0, 8)); }
};
const slimLoc = l => ({ name: l.name, admin: l.admin || '', country: l.country || '', cc: l.cc || '', lat: +(+l.lat).toFixed(4), lon: +(+l.lon).toFixed(4), tz: l.tz || null, approx: !!l.approx });

/* ---------- places ---------- */
function parseCoords(q) {
  const m = q.match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1].replace(',', '.'), lon = +m[2].replace(',', '.');
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, admin: t('coordinates'), country: '', lat, lon, coords: true };
}
async function searchPlaces(q) {
  q = q.trim(); if (q.length < 2) return [];
  const c = parseCoords(q); if (c) return [c];
  let res = [];
  try {
    const j = await Net.json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${LANG}&format=json`, { service: 'Open-Meteo Geocoding', timeout: 8000 });
    res = (j.results || []).map(r => ({ name: r.name, admin: [r.admin2, r.admin1].filter((v, i, a) => v && v !== r.name && a.indexOf(v) === i).join(', '), country: r.country || '', cc: r.country_code || '', lat: r.latitude, lon: r.longitude, tz: r.timezone || null, elev: r.elevation }));
  } catch (e) { /* fall through */ }
  if (res.length < 3) {
    let extra = [];
    try {
      const j = await Net.json(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8${LANG === 'en' ? '&lang=en' : ''}`, { service: 'Photon', timeout: 8000 });
      extra = (j.features || []).map(f => { const p = f.properties || {}, g = f.geometry && f.geometry.coordinates; return g ? { name: p.name || p.city || p.county || q, admin: [p.city !== p.name ? p.city : '', p.county, p.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(', '), country: p.country || '', cc: p.countrycode || '', lat: g[1], lon: g[0], tz: null } : null; }).filter(Boolean);
    } catch (e) {
      try {
        const j = await Net.json(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=8&addressdetails=1&accept-language=${LANG}`, { service: 'Nominatim', timeout: 9000 });
        extra = (Array.isArray(j) ? j : []).map(r => { const a = r.address || {}; return { name: r.name || a.city || a.town || a.village || q, admin: [a.county, a.state || a.province].filter(Boolean).join(', '), country: a.country || '', cc: (a.country_code || '').toUpperCase(), lat: +r.lat, lon: +r.lon, tz: null }; });
      } catch (e2) { /* nothing more to try */ }
    }
    for (const x of extra) if (!res.some(r => haversine(r.lat, r.lon, x.lat, x.lon) < 3)) res.push(x);
  }
  return res.slice(0, 12);
}
async function reverseName(lat, lon) {
  try {
    const j = await Net.json(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=${LANG}`, { service: 'BigDataCloud', timeout: 7000 });
    /* prefer the town ("Karabiga") over the district ("Biga"); the district goes to the second line */
    const name = j.locality || j.city || j.principalSubdivision;
    const admin = [j.city, j.principalSubdivision].filter((v, i, a) => v && v !== name && a.indexOf(v) === i).join(', ');
    if (name) return { name, admin, country: j.countryName || '', cc: j.countryCode || '' };
  } catch (e) { /* next */ }
  try {
    const j = await Net.json(`https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&format=jsonv2&zoom=10&accept-language=${LANG}`, { service: 'Nominatim', timeout: 8000 });
    const a = j.address || {}, name = a.city || a.town || a.village || a.municipality || a.county || j.name;
    if (name) return { name, admin: a.state || a.province || '', country: a.country || '', cc: (a.country_code || '').toUpperCase() };
  } catch (e) { /* none */ }
  return null;
}
async function ipLocate() {
  const tries = [
    ['https://ipwho.is/', j => (j.success !== false && isNum(+j.latitude) ? { lat: +j.latitude, lon: +j.longitude, name: j.city, admin: j.region, country: j.country, cc: j.country_code, tz: j.timezone && j.timezone.id } : null), 'ipwho.is'],
    ['https://get.geojs.io/v1/ip/geo.json', j => (isNum(+j.latitude) ? { lat: +j.latitude, lon: +j.longitude, name: j.city, admin: j.region, country: j.country, cc: j.country_code, tz: j.timezone } : null), 'GeoJS'],
    ['https://ipapi.co/json/', j => (isNum(+j.latitude) ? { lat: +j.latitude, lon: +j.longitude, name: j.city, admin: j.region, country: j.country_name, cc: j.country_code, tz: j.timezone } : null), 'ipapi.co']
  ];
  for (const [u, f, s] of tries) { try { const r = f(await Net.json(u, { service: s, timeout: 6000 })); if (r && isNum(r.lat) && r.name) { r.approx = true; return r; } } catch (e) { /* next */ } }
  return null;
}
function geolocate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('unsupported')); return; }
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), e => rej(e), { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60e3 });
  });
}
