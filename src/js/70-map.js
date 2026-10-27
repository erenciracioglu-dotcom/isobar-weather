/* =====================================================================
   Map (Advanced): keyless base maps (Esri canvases, streets, topo and
   imagery; OpenTopoMap) with place names drawn above the weather layers,
   forecast fields from an Open-Meteo grid (local or fixed colours,
   isotherms, isobars, values, wind particles), RainViewer radar and NASA
   GIBS daily satellite imagery, and a dated time slider.
   ===================================================================== */
const LEAFLET_SRC = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('load failed: ' + src)); }; document.head.appendChild(s); }); }
let _leafletP = null;
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve();
  if (_leafletP) return _leafletP;
  _leafletP = (async () => { for (const s of LEAFLET_SRC) { try { const t0 = performance.now(); await loadScript(s); Net.record('Leaflet (map library)', s, true, Math.round(performance.now() - t0)); if (window.L && window.L.map) return; } catch (e) { Net.record('Leaflet (map library)', s, false, 0, e.message); } } _leafletP = null; throw new Error('Leaflet unavailable'); })();
  return _leafletP;
}

/* Base maps that need no API key. CARTO now stamps "API key required" on keyless tiles and
   OpenStreetMap refuses pages opened from a file, so neither is used. */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const ESRI_ATTR = 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>';
const PLACES = ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const BASES = {
  grey: { url: ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', labels: ESRI + 'Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', max: 16, tone: 'light', attr: ESRI_ATTR + ' — Esri, HERE, Garmin, &copy; OpenStreetMap contributors' },
  dark: { url: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', labels: ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', max: 16, tone: 'dark', attr: ESRI_ATTR + ' — Esri, HERE, Garmin, &copy; OpenStreetMap contributors' },
  streets: { url: ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', labels: PLACES, max: 18, tone: 'light', colorful: true, attr: ESRI_ATTR + ' — Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors' },
  topo: { url: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', labels: PLACES, max: 18, tone: 'light', colorful: true, attr: ESRI_ATTR + ' — Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', sub: 'abc', labels: PLACES, max: 17, tone: 'light', colorful: true, attr: 'Map data &copy; OpenStreetMap contributors, SRTM · Style &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)' },
  satellite: { url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', labels: PLACES, max: 18, tone: 'dark', colorful: true, attr: ESRI_ATTR + ' — Maxar, Earthstar Geographics' }
};
const BASE_CHOICES = ['auto', 'grey', 'dark', 'streets', 'topo', 'terrain', 'satellite'];
const BASE_FALLBACK = ['grey', 'topo', 'terrain', 'satellite', 'streets', 'dark'];
const FIELD_LAYERS = ['temp', 'precip', 'wind', 'gust', 'cloud', 'pmsl', 'rh'];
const MAP_ZOOM = 9;

/* Local colours: an evenly spaced ramp stretched over the values on screen, so small differences
   (a few degrees across the Biga peninsula) still show clearly. Fixed colours keep one meaning everywhere. */
const RAMPS = {
  temp: ['#2c3e9e', '#3b6fd6', '#45a5df', '#5ccbc0', '#9bdc78', '#e6dd55', '#f6b13d', '#ef7a31', '#d6402c', '#9e1b3f'],
  wind: ['#5b6cc2', '#3d9ec4', '#3fbf8a', '#a6cf3f', '#f2c12e', '#f0812e', '#e0452f', '#b0245a'],
  pmsl: ['#5e3c99', '#3f6fc2', '#4fb2d9', '#8dd27b', '#e6df5a', '#f5b443', '#ec6e34', '#c0293d'],
  rh: ['#a0622d', '#d9a443', '#e7dc8c', '#8fd4a0', '#4fb2d9', '#2f6fc4', '#273f99']
};
const _rampCache = {};
function rampRGB(name, f) {
  const st = _rampCache[name] || (_rampCache[name] = RAMPS[name].map(hexRGB));
  f = clamp(isNum(f) ? f : 0, 0, 1) * (st.length - 1);
  const i = Math.min(st.length - 2, Math.floor(f)), r = f - i, a = st[i], b = st[i + 1];
  return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r];
}
const LOCAL_SCALE = { temp: 'temp', wind: 'wind', gust: 'wind', pmsl: 'pmsl', rh: 'rh' };
const FIXED_SCALE = { temp: 'temp', wind: 'wind', gust: 'wind', pmsl: 'pmsl', rh: 'rh', precip: 'precip' };
const isDarkTheme = () => { const th = document.documentElement.dataset.theme; return th === 'dark' || (!th && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)); };
/* position on the custom range track (18 px thumb) */
const sliderPos = f => `calc(9px + (100% - 18px) * ${clamp(f, 0, 1).toFixed(4)})`;

/* Catmull-Rom bicubic sample of a grid, clamped to the local value range so it never overshoots
   (no negative rain, no invented extremes); falls back to bilinear near missing values. */
function bicubic(A, off, nx, ny, fx, fy) {
  const x1 = Math.floor(fx), y1 = Math.floor(fy), tx = fx - x1, ty = fy - y1;
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const rows = [];
  let lo = Infinity, hi = -Infinity;
  for (let j = -1; j <= 2; j++) {
    const yy = clamp(y1 + j, 0, ny - 1), p = [];
    for (let i = -1; i <= 2; i++) {
      const v = A[off + yy * nx + clamp(x1 + i, 0, nx - 1)];
      if (v !== v) return bilinear(A, off, nx, ny, fx, fy);
      p.push(v);
      if (j >= 0 && j <= 1 && i >= 0 && i <= 1) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    rows.push(cr(p[0], p[1], p[2], p[3], tx));
  }
  const v = cr(rows[0], rows[1], rows[2], rows[3], ty);
  return v < lo ? lo : v > hi ? hi : v;
}
function bilinear(A, off, nx, ny, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1), dx = fx - x0, dy = fy - y0;
  const a = A[off + y0 * nx + x0], b = A[off + y0 * nx + x1], c = A[off + y1 * nx + x0], d = A[off + y1 * nx + x1];
  if (a !== a || b !== b || c !== c || d !== d) { const vals = [a, b, c, d].filter(v => v === v); return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : NaN; }
  return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
}

const MapView = {
  map: null, loading: false, failed: false, grid: null, gridKey: '', gridLoading: false, gridErr: null, tIdx: 0,
  playing: false, playTimer: null, radarFrames: [], radarIdx: 0, radarLayer: null, radarHost: '', radarAt: 0, satLayer: null,
  base: null, baseKind: '', baseFails: new Set(), labelsLayer: null, marker: null, field: null, visible: true, praf: 0, _frame: null,

  renderCard() {
    const el = $('#advMap'); if (!el) return;
    if (el.dataset.built !== LANG) {
      el.dataset.built = LANG;
      const layers = [...FIELD_LAYERS, 'radar', 'sat'];
      el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('map')}${esc(t('mapTitle'))}</h2>
        <label class="fld" for="mapBase">${esc(t('baseMap'))}<select id="mapBase">${BASE_CHOICES.map(k => `<option value="${k}"${S.adv.base === k ? ' selected' : ''}>${esc(t('base_' + k))}</option>`).join('')}</select></label></div>
        <div class="chips" id="mapLayers" role="group" aria-label="${esc(t('layer'))}">${layers.map(k => `<button type="button" class="chip" data-layer="${k}" aria-pressed="${S.adv.layer === k}">${esc(t('ly_' + k))}</button>`).join('')}</div>
        <div class="map-ctrl">
          <button type="button" class="chip" data-mtoggle="particles" aria-pressed="${S.adv.particles}">${ui('wind')}${esc(t('windFlow'))}</button>
          <button type="button" class="chip" data-mtoggle="labels" aria-pressed="${S.adv.labels}">${ui('info')}${esc(t('values'))}</button>
          <button type="button" class="chip" data-mtoggle="grey" id="greyChip" aria-pressed="${!!S.adv.grey}">${ui('layers')}${esc(t('greyMap'))}</button>
          <div class="seg" id="scaleSeg" role="group" aria-label="${esc(t('colours'))}"><button type="button" data-mscale="local" aria-pressed="${S.adv.scale !== 'fixed'}">${esc(t('scale_local'))}</button><button type="button" data-mscale="fixed" aria-pressed="${S.adv.scale === 'fixed'}">${esc(t('scale_fixed'))}</button></div>
          <button type="button" class="chip" id="mapRecenter">${ui('locate')}${esc(t('recenter'))}</button>
        </div>
        <div class="map-wrap"><div class="map-box"><div class="map-el" id="mapEl"></div><div class="map-msg" id="mapMsg" hidden></div><button class="btn small primary map-upd" type="button" id="mapUpd" hidden>${ui('refresh')}${esc(t('updateArea'))}</button></div><div class="map-legend" id="mapLegend" hidden></div></div>
        <div class="timebar">
          <div class="tbtns"><button class="icon-btn" type="button" id="mapPrev" aria-label="${esc(t('stepBack'))}" title="${esc(t('stepBack'))}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button class="icon-btn play" type="button" id="mapPlay" aria-label="${esc(t('play'))}" title="${esc(t('play'))}">${ui('play', 'i fill')}</button><button class="icon-btn" type="button" id="mapNext" aria-label="${esc(t('stepFwd'))}" title="${esc(t('stepFwd'))}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>
          <span class="tlabel" id="mapTimeLabel">–</span>
          <div class="tslider" id="mapSlider"><input type="range" id="mapTime" min="0" max="0" value="0" step="1" aria-label="${esc(t('mapTime'))}"><div class="tticks" id="mapTicks"></div></div>
        </div>
        <div class="mstrip" id="mapStrip" hidden>
          <div class="mstrip-h"><span class="mstrip-t">${ui('table')}<span id="mapStripTitle"></span></span><span class="mstrip-hint">${esc(t('stripHint'))}</span>
            <span class="mstrip-nav"><button class="icon-btn" type="button" data-strip="-1" aria-label="${esc(t('stripPrev'))}" title="${esc(t('stripPrev'))}">${ui('chevL')}</button><button class="icon-btn" type="button" data-strip="1" aria-label="${esc(t('stripNext'))}" title="${esc(t('stripNext'))}">${ui('chevR')}</button></span></div>
          <div class="mstrip-scroll" id="mapStripScroll"></div>
        </div>
        <p class="note">${esc(t('mapNote'))}</p>`;
      ChipScroll.enhance($('#mapLayers'));
      this.stripKey = ''; this.bindStrip();
      if (this.map) { this.stopParticles(); this.stopPlay(); try { this.map.remove(); } catch (e) { /* ignore */ } this.map = null; this.field = null; this.base = null; this.baseKind = ''; this.labelsLayer = null; this.radarLayer = null; this.satLayer = null; this.marker = null; }
      if (!this._io && 'IntersectionObserver' in window) { this._io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this.restartParticles(); else this.stopParticles(); }); this._io.observe(el); }
      if ('ResizeObserver' in window) { if (this._sro) this._sro.disconnect(); this._sro = new ResizeObserver(debounce(() => this.renderTicks(), 80)); this._sro.observe($('#mapSlider')); }
    }
    this.syncControls(); this.renderLegend(); this.updateTimebar();
  },
  syncControls() {
    $$('#mapLayers .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === S.adv.layer)));
    const B = BASES[this.baseKind] || BASES[this.wantedBase()];
    const gc = $('#greyChip'); if (gc) { gc.hidden = !(B && B.colorful); gc.setAttribute('aria-pressed', String(!!S.adv.grey)); }
    const sc = $('#scaleSeg'); if (sc) { sc.hidden = !LOCAL_SCALE[S.adv.layer]; $$('[data-mscale]', sc).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mscale === (S.adv.scale === 'fixed' ? 'fixed' : 'local')))); }
    const mb = $('#mapBase'); if (mb && mb.value !== S.adv.base) mb.value = BASE_CHOICES.includes(S.adv.base) ? S.adv.base : 'auto';
  },
  msg(s) { const m = $('#mapMsg'); if (!m) return; m.textContent = s || ''; m.hidden = !s; },
  async activate() {
    if (App.mode !== 'advanced' || !App.data || !$('#mapEl')) return;
    if (!this.map) { await this.init(); if (!this.map) return; }
    else { this.map.invalidateSize(); this.sync(); }
    this.applyLayer();
  },
  async init() {
    if (this.loading) return; this.loading = true; this.msg(t('mapLoading'));
    try { await loadLeaflet(); } catch (e) { this.failed = true; this.loading = false; this.msg(t('mapLibFail')); return; }
    const el = $('#mapEl'); if (!el || this.map) { this.loading = false; return; }
    const L = window.L, o = App.data;
    this.map = L.map(el, { zoomControl: true, attributionControl: true, worldCopyJump: true, minZoom: 3, maxZoom: 14, zoomSnap: 0.5 });
    this.map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    this.map.setView([o.lat, o.lon], MAP_ZOOM);
    this.map.createPane('sat').style.zIndex = 250;
    this.map.createPane('radar').style.zIndex = 420;
    const pp = this.map.createPane('particles'); pp.style.zIndex = 450; pp.style.pointerEvents = 'none';
    const lp = this.map.createPane('labels'); lp.style.zIndex = 470; lp.style.pointerEvents = 'none';
    this.setBase();
    const FieldLayer = L.Layer.extend({
      onAdd(map) {
        this._map = map;
        this._c = L.DomUtil.create('canvas', 'field-canvas'); map.getPanes().overlayPane.appendChild(this._c);
        this._p = L.DomUtil.create('canvas', 'particle-canvas'); map.getPane('particles').appendChild(this._p);
        map.on('moveend zoomend resize viewreset', this._reset, this); map.on('movestart zoomstart', this._hide, this);
        this._reset();
      },
      onRemove(map) { L.DomUtil.remove(this._c); L.DomUtil.remove(this._p); map.off('moveend zoomend resize viewreset', this._reset, this); map.off('movestart zoomstart', this._hide, this); MapView.stopParticles(); },
      _hide() { this._c.style.visibility = 'hidden'; this._p.style.visibility = 'hidden'; MapView.stopParticles(); },
      _reset() {
        const map = this._map, size = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]), dpr = Math.min(2, window.devicePixelRatio || 1);
        for (const c of [this._c, this._p]) { L.DomUtil.setPosition(c, tl); c.width = Math.round(size.x * dpr); c.height = Math.round(size.y * dpr); c.style.width = size.x + 'px'; c.style.height = size.y + 'px'; c.style.visibility = 'visible'; }
        MapView._frame = null; MapView.drawField(); MapView.restartParticles(); MapView.renderLegend();
      }
    });
    this.field = new FieldLayer(); this.field.addTo(this.map);
    this.marker = L.marker([o.lat, o.lon], { icon: L.divIcon({ className: '', html: '<div class="loc-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, interactive: false, pane: 'labels' }).addTo(this.map);
    this.map.on('click', e => this.pointPopup(e.latlng));
    this.map.on('moveend', () => this.checkCoverage());
    if (window.matchMedia && matchMedia('(hover: hover)').matches) {
      this.map.on('mousemove', e => { if (this._hv) return; this._hv = requestAnimationFrame(() => { this._hv = 0; this.hover(e.latlng); }); });
      this.map.on('mouseout', () => { const h = $('#lgHere'); if (h) h.hidden = true; });
    }
    this.loading = false; this.msg('');
  },
  sync() {
    if (!this.map || !App.data) return;
    const o = App.data, ll = [o.lat, o.lon];
    if (this.marker) this.marker.setLatLng(ll);
    const key = o.lat.toFixed(2) + ',' + o.lon.toFixed(2);
    if (this.gridKey && this.gridKey !== key) { this.map.setView(ll, MAP_ZOOM); this.grid = null; this.gridKey = ''; this._frame = null; }
    this.setBase();
  },
  wantedBase() { return BASES[S.adv.base] ? S.adv.base : (isDarkTheme() ? 'dark' : 'grey'); },
  setBase() {
    if (!this.map) return;
    let kind = this.wantedBase();
    if (this.baseFails.has(kind)) kind = BASE_FALLBACK.find(k => !this.baseFails.has(k)) || 'terrain';
    const B = BASES[kind], box = $('#mapEl');
    if (box) box.classList.toggle('map-grey', !!(S.adv.grey && B.colorful));
    if (this.baseKind === kind && this.base) { this.syncControls(); this.drawField(); this.restartParticles(); return; }
    const L = window.L;
    if (this.base) this.map.removeLayer(this.base);
    if (this.labelsLayer) { this.map.removeLayer(this.labelsLayer); this.labelsLayer = null; }
    const layer = L.tileLayer(B.url, { attribution: B.attr, subdomains: B.sub || 'abc', maxZoom: 19, maxNativeZoom: B.max, className: 'base-tiles' });
    let errs = 0, oks = 0; const t0 = performance.now();
    layer.on('tileload', () => { if (!oks++) Net.record(t('baseMap') + ': ' + t('base_' + kind), B.url.replace('{s}', 'a'), true, Math.round(performance.now() - t0)); });
    layer.on('tileerror', () => { errs++; if (errs >= 6 && oks === 0 && this.base === layer) { this.baseFails.add(kind); Net.record(t('baseMap') + ': ' + t('base_' + kind), B.url.replace('{s}', 'a'), false, 0, 'tiles failed'); toast(t('baseFallback')); this.baseKind = ''; this.setBase(); } });
    layer.addTo(this.map); this.base = layer; this.baseKind = kind;
    if (B.labels) this.labelsLayer = L.tileLayer(B.labels, { pane: 'labels', maxZoom: 19, maxNativeZoom: Math.min(B.max, 16), className: 'label-tiles' }).addTo(this.map);
    this.syncControls(); this.drawField(); this.restartParticles(); this.renderLegend();
  },
  applyLayer() {
    if (!this.map) return;
    const L = window.L, k = S.adv.layer;
    this.stopPlay(); this._frame = null;
    if (k !== 'radar' && this.radarLayer) { this.map.removeLayer(this.radarLayer); this.radarLayer = null; }
    if (k !== 'sat' && this.satLayer) { this.map.removeLayer(this.satLayer); this.satLayer = null; }
    if (k === 'radar') this.showRadar();
    else if (k === 'sat') this.showSat(L);
    this.ensureGrid();
    this.syncControls(); this.drawField(); this.restartParticles(); this.renderLegend(); this.updateTimebar();
  },
  async ensureGrid(force, auto) {
    if (!this.map || this.gridLoading || !App.loc) return;
    const key = App.data.lat.toFixed(2) + ',' + App.data.lon.toFixed(2);
    if (!force && this.grid && this.gridKey === key && Date.now() - this.grid.at < 90 * 60e3) return;
    const b = this.map.getBounds().pad(0.12), c = this.map.getCenter();
    let n = clamp(b.getNorth(), -84, 84), s = clamp(b.getSouth(), -84, 84), w = b.getWest(), e = b.getEast();
    if (e - w > 36) { w = c.lng - 18; e = c.lng + 18; }
    if (n - s > 28) { n = clamp(c.lat + 14, -84, 84); s = clamp(c.lat - 14, -84, 84); }
    const size = this.map.getSize(), aspect = size.x / Math.max(1, size.y);
    const nx = clamp(Math.round(Math.sqrt(96 * aspect)), 6, 14), ny = clamp(Math.round(96 / nx), 6, 12);
    clearTimeout(this.autoTimer);
    const keepT = this.grid && this.gridKey === key ? this.grid.times[clamp(this.tIdx, 0, this.grid.times.length - 1)] : null;
    this.gridLoading = true; this.msg(t('mapGridLoading')); this.updateTimebar();
    let failed = false;
    try {
      this.grid = await getGrid({ n, s, w, e }, nx, ny); this.gridKey = key; this.gridErr = null; this.msg(''); this._frame = null;
      const i = keepT == null ? -1 : this.grid.times.indexOf(keepT);   /* a new area keeps the time on screen */
      if (i >= 0) this.tIdx = i; else this.setTimeToNow();
    }
    catch (err) { failed = true; this.gridErr = err.message; this.msg(t('mapGridFail', { e: err.message })); if (auto) this.autoPause = Date.now() + 60e3; }
    finally { this.gridLoading = false; const u = $('#mapUpd'); if (u) u.hidden = true; this.drawField(); this.restartParticles(); this.renderLegend(); this.updateTimebar(); this.checkCoverage(); }
  },
  /* the grid no longer fits the view: less than 3/4 of the view covered, or zoomed far into it */
  needsGrid() {
    if (!this.grid || !this.map) return false;
    const b = this.map.getBounds(), g = this.grid;
    const ow = Math.max(0, Math.min(b.getEast(), g.e) - Math.max(b.getWest(), g.w)), oh = Math.max(0, Math.min(b.getNorth(), g.n) - Math.max(b.getSouth(), g.s));
    const vw = b.getEast() - b.getWest(), vh = b.getNorth() - b.getSouth(), cover = (ow * oh) / Math.max(1e-6, vw * vh);
    return cover < 0.75 || vw / (g.e - g.w) < 0.3;
  },
  /* Each grid is ~100 points, which Open-Meteo's free API counts as ~100 calls (limits: 600 a minute, 5,000 an hour).
     So automatic loads wait until the map is still, keep 20 s apart, stop after 20 an hour, and pause a minute after
     a failure; in those cases the "Load this area" button appears instead. */
  checkCoverage() {
    const u = $('#mapUpd'); if (!u || !this.grid || !this.map) return;
    clearTimeout(this.autoTimer);
    if (!this.needsGrid()) { u.hidden = true; return; }
    const now = Date.now(); this.autoLog = (this.autoLog || []).filter(x => now - x < 3600e3);
    const can = S.adv.autoGrid !== false && !this.gridErr && now >= (this.autoPause || 0) && this.autoLog.length < 20;
    if (!can) { u.hidden = false; return; }
    const wait = Math.max(900, (this.autoLog[this.autoLog.length - 1] || 0) + 20e3 - now);
    u.hidden = wait <= 2000;   /* a longer wait: offer the button too, so it can load right away */
    this.autoTimer = setTimeout(() => {
      if (!this.needsGrid() || this.gridLoading || S.adv.autoGrid === false) return;
      this.autoLog.push(Date.now()); this.ensureGrid(true, true);
    }, wait);
  },
  setTimeToNow() { const g = this.grid; if (!g) return; const now = Date.now(); let bi = 0, bd = Infinity; g.times.forEach((tt, i) => { const d = Math.abs(tt - now); if (d < bd) { bd = d; bi = i; } }); this.tIdx = bi; },
  fieldValues(layer, it) {
    const g = this.grid, np = g.nx * g.ny, off = it * np, out = new Float32Array(np), V = g.vars;
    const src = { temp: V.temp, precip: V.precip, wind: V.ws, gust: V.wg, cloud: V.cloud, pmsl: V.pmsl, rh: V.rh }[layer];
    for (let p = 0; p < np; p++) out[p] = src ? (layer === 'precip' ? src[off + p] / g.precipDiv : src[off + p]) : NaN;
    return out;
  },
  /* values and colour range of the frame on screen (cached until the layer, time, grid or scale changes) */
  frameInfo() {
    const g = this.grid, layer = S.adv.layer; if (!g || !FIELD_LAYERS.includes(layer)) return null;
    const it = clamp(this.tIdx, 0, g.times.length - 1), key = [layer, it, g.at, S.adv.scale].join('|');
    if (this._frame && this._frame.key === key) return this._frame;
    const vals = this.fieldValues(layer, it), v = []; for (const x of vals) if (x === x) v.push(x);
    v.sort((a, b) => a - b);
    let rng = null;
    if (v.length) {
      const min = v[0], max = v[v.length - 1];
      if (S.adv.scale !== 'fixed' && LOCAL_SCALE[layer]) {
        let lo = quantile(v, 0.02), hi = quantile(v, 0.98);
        const span = { temp: 4, pmsl: 6, rh: 30, wind: 15, gust: 20 }[layer];
        if (layer === 'wind' || layer === 'gust') { lo = 0; hi = Math.max(hi, span); }
        else if (hi - lo < span) { const c = (hi + lo) / 2; lo = c - span / 2; hi = c + span / 2; }
        if (layer === 'rh') { lo = Math.max(0, lo); hi = Math.min(100, Math.max(hi, lo + span)); }
        rng = [lo, hi];
      }
      this._frame = { key, vals, rng, min, max, it };
    } else this._frame = { key, vals, rng: null, min: NaN, max: NaN, it };
    return this._frame;
  },
  fieldAlpha() { const B = BASES[this.baseKind] || BASES.grey; if (B.tone === 'dark') return 0.8; return B.colorful && !S.adv.grey ? 0.7 : 0.78; },
  lightBase() { const B = BASES[this.baseKind]; return !B || B.tone === 'light'; },
  colorFor(layer, v, rng, a) {
    if (layer === 'precip') { if (v < 0.05) return null; return [...scaleRGB('precip', v), Math.min(0.9, a + 0.08) * clamp((v - 0.05) / 0.3, 0.4, 1)]; }
    if (layer === 'cloud') { if (v < 5) return null; const f = clamp(v / 100, 0, 1); return this.lightBase() ? [52, 66, 86, f * 0.62] : [236, 241, 246, f * 0.78]; }
    if (rng && LOCAL_SCALE[layer]) return [...rampRGB(LOCAL_SCALE[layer], (v - rng[0]) / Math.max(1e-6, rng[1] - rng[0])), a];
    return [...scaleRGB(FIXED_SCALE[layer], v), a];
  },
  drawField() {
    const f = this.field; if (!f || !f._c || !this.map) return;
    const c = f._c, ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    const g = this.grid, layer = S.adv.layer; if (!g || !FIELD_LAYERS.includes(layer)) return;
    const map = this.map, size = map.getSize(), dpr = c.width / Math.max(1, size.x), step = 4;
    if (!size.x || !size.y || !c.width) return;
    const fr = this.frameInfo(); if (!fr) return;
    const W = Math.ceil(size.x / step), H = Math.ceil(size.y / step), lons = new Float64Array(W), lats = new Float64Array(H);
    for (let x = 0; x < W; x++) lons[x] = map.containerPointToLatLng([x * step + step / 2, 0]).lng;
    for (let y = 0; y < H; y++) lats[y] = map.containerPointToLatLng([0, y * step + step / 2]).lat;
    const vals = fr.vals, a = this.fieldAlpha(), fade = 1 - clamp(+S.adv.fade || 0, 0, 90) / 100; /* transparency chosen in Settings */
    const img = ctx.createImageData(W, H), data = img.data;
    for (let y = 0; y < H; y++) {
      let fy = (g.n - lats[y]) / (g.n - g.s) * (g.ny - 1); if (fy < -0.6 || fy > g.ny - 0.4) continue; fy = clamp(fy, 0, g.ny - 1);
      for (let x = 0; x < W; x++) {
        let lo = lons[x]; while (lo < g.w - 180) lo += 360; while (lo > g.w + 180) lo -= 360;
        let fx = (lo - g.w) / (g.e - g.w) * (g.nx - 1); if (fx < -0.6 || fx > g.nx - 0.4) continue; fx = clamp(fx, 0, g.nx - 1);
        const v = bicubic(vals, 0, g.nx, g.ny, fx, fy); if (v !== v) continue;
        const col = this.colorFor(layer, v, fr.rng, a); if (!col) continue;
        const k = (y * W + x) * 4; data[k] = col[0]; data[k + 1] = col[1]; data[k + 2] = col[2]; data[k + 3] = col[3] * 255 * fade;
      }
    }
    const off = this._off || (this._off = document.createElement('canvas')); off.width = W; off.height = H; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W * step * dpr, H * step * dpr);
    const lb = this.lightBase() || ['temp', 'wind', 'gust', 'pmsl', 'rh'].includes(layer);
    if (layer === 'pmsl') {
      const stp = fr.max - fr.min > 24 ? 4 : 2, lv = []; for (let L0 = Math.ceil(fr.min / stp) * stp; L0 <= fr.max; L0 += stp) lv.push(L0);
      this._placed = this.drawContours(ctx, vals, dpr, lv, L0 => fmtN(Units.pr(L0), Units.dec.pr()), lb, 1.3);
    } else if (layer === 'temp' && isNum(fr.min)) {
      /* isotherms at a round step in the user's unit */
      const uMin = Units.t(fr.min), uMax = Units.t(fr.max), span = uMax - uMin;
      const stp = span <= 3 ? 0.5 : span <= 8 ? 1 : span <= 18 ? 2 : 5, lv = [];
      for (let u = Math.ceil(uMin / stp) * stp; u <= uMax; u += stp) lv.push(S.units.temp === 'F' ? (u - 32) * 5 / 9 : u);
      this._placed = this.drawContours(ctx, vals, dpr, lv, L0 => fmtN(Units.t(L0), stp < 1 ? 1 : 0) + '°', lb, 1);
    } else this._placed = [];
    if (S.adv.labels && layer !== 'pmsl') this.drawLabels(ctx, vals, layer, dpr, lb, this._placed || []);
  },
  gridToPt(fx, fy, dpr) { const g = this.grid, lat = g.n - fy / (g.ny - 1) * (g.n - g.s), lon = g.w + fx / (g.nx - 1) * (g.e - g.w), p = this.map.latLngToContainerPoint([lat, lon]); return [p.x * dpr, p.y * dpr]; },
  /* marching squares on a bicubic up-sampled grid; one label per line, spread over the map */
  /* screen boxes of controls that sit over the map; labels keep clear of them */
  ctlBoxes(dpr) {
    const m = this.map; if (!m) return [];
    const mr = m.getContainer().getBoundingClientRect(), out = [];
    [m.zoomControl && m.zoomControl.getContainer(), $('#mapLegend'), $('#mapUpd')].forEach(el => {
      if (!el || el.hidden) return; const r = el.getBoundingClientRect();
      if (!r.width || r.top >= mr.bottom || r.bottom <= mr.top) return;
      out.push([(r.left - mr.left - 18) * dpr, (r.top - mr.top - 10) * dpr, (r.right - mr.left + 18) * dpr, (r.bottom - mr.top + 10) * dpr]);
    });
    return out;
  },
  drawContours(ctx, vals, dpr, levels, labelFn, lb, width) {
    const g = this.grid, U = 8, nxu = (g.nx - 1) * U + 1, nyu = (g.ny - 1) * U + 1, up = new Float32Array(nxu * nyu);
    for (let y = 0; y < nyu; y++) for (let x = 0; x < nxu; x++) up[y * nxu + x] = bicubic(vals, 0, g.nx, g.ny, x / U, y / U);
    const ink = lb ? 'rgba(22,32,46,.62)' : 'rgba(255,255,255,.8)', halo = lb ? 'rgba(255,255,255,.88)' : 'rgba(10,15,25,.75)';
    const P = (fx, fy) => this.gridToPt(fx / U, fy / U, dpr), size = this.map.getSize(), placed = [], boxes = this.ctlBoxes(dpr);
    ctx.font = `700 ${10.5 * dpr}px ${cssVars().font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    levels.forEach((L0, li) => {
      ctx.beginPath(); ctx.lineWidth = width * dpr; ctx.strokeStyle = ink;
      const rx = size.x * dpr * (0.2 + 0.6 * ((li * 0.618) % 1)), ry = size.y * dpr * (0.25 + 0.5 * ((li * 0.382 + 0.3) % 1));
      let label = null, bestD = Infinity;
      for (let y = 0; y < nyu - 1; y++) for (let x = 0; x < nxu - 1; x++) {
        const a = up[y * nxu + x], b = up[y * nxu + x + 1], c = up[(y + 1) * nxu + x + 1], d = up[(y + 1) * nxu + x];
        if (a !== a || b !== b || c !== c || d !== d) continue;
        const id = (a > L0 ? 8 : 0) | (b > L0 ? 4 : 0) | (c > L0 ? 2 : 0) | (d > L0 ? 1 : 0); if (id === 0 || id === 15) continue;
        const T_ = () => [x + (L0 - a) / (b - a), y], R_ = () => [x + 1, y + (L0 - b) / (c - b)], B_ = () => [x + (L0 - d) / (c - d), y + 1], Lf = () => [x, y + (L0 - a) / (d - a)];
        const segs = { 1: [[Lf, B_]], 2: [[B_, R_]], 3: [[Lf, R_]], 4: [[T_, R_]], 5: [[T_, R_], [Lf, B_]], 6: [[T_, B_]], 7: [[T_, Lf]], 8: [[T_, Lf]], 9: [[T_, B_]], 10: [[T_, Lf], [B_, R_]], 11: [[T_, R_]], 12: [[Lf, R_]], 13: [[B_, R_]], 14: [[Lf, B_]] }[id];
        for (const [p1, p2] of segs) {
          const A1 = p1(), A2 = p2(), s1 = P(A1[0], A1[1]), s2 = P(A2[0], A2[1]);
          ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]);
          const mxp = (s1[0] + s2[0]) / 2, myp = (s1[1] + s2[1]) / 2, dd = Math.hypot(mxp - rx, myp - ry);
          if (dd < bestD && mxp > 34 * dpr && mxp < (size.x - 34) * dpr && myp > 30 * dpr && myp < (size.y - 46) * dpr && !placed.some(([px, py]) => Math.hypot(px - mxp, py - myp) < 70 * dpr) && !boxes.some(b => mxp > b[0] && mxp < b[2] && myp > b[1] && myp < b[3])) { bestD = dd; label = [mxp, myp]; }
        }
      }
      ctx.stroke();
      if (label) { placed.push(label); const txt = labelFn(L0); ctx.lineWidth = 3 * dpr; ctx.strokeStyle = halo; ctx.strokeText(txt, label[0], label[1]); ctx.fillStyle = ink.replace(/[\d.]+\)$/, '1)'); ctx.fillText(txt, label[0], label[1]); }
    });
    ctx.textAlign = 'left';
    return placed;
  },
  fmtVal(layer, v) {
    switch (layer) {
      case 'temp': return fmtN(Units.t(v), 0) + '°';
      case 'precip': return v < 0.05 ? '' : fmtN(Units.p(v), S.units.precip === 'in' ? 2 : 1);
      case 'wind': case 'gust': return fmtN(Units.w(v), 0);
      case 'cloud': case 'rh': return fmtN(v, 0);
      case 'pmsl': return fmtN(Units.pr(v), Units.dec.pr());
      default: return '';
    }
  },
  fmtHere(layer, v) {
    switch (layer) {
      case 'temp': return F.t1(v);
      case 'precip': return F.p(v) + '/' + t('hShort');
      case 'wind': case 'gust': return F.w(v);
      case 'cloud': case 'rh': return fmtPct(v);
      case 'pmsl': return F.pr(v);
      default: return '';
    }
  },
  drawLabels(ctx, vals, layer, dpr, lb, avoid) {
    const g = this.grid, size = this.map.getSize(), placed = (avoid || []).slice(), minD = 56 * dpr, boxes = this.ctlBoxes(dpr);
    ctx.font = `700 ${11.5 * dpr}px ${cssVars().font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    const ink = lb ? '#13202b' : '#ffffff', halo = lb ? 'rgba(255,255,255,.9)' : 'rgba(5,10,18,.8)';
    for (let iy = 0; iy < g.ny; iy++) for (let ix = 0; ix < g.nx; ix++) {
      const v = vals[iy * g.nx + ix]; if (v !== v) continue;
      const [x, y] = this.gridToPt(ix, iy, dpr); if (x < 14 * dpr || y < 14 * dpr || x > (size.x - 14) * dpr || y > (size.y - 14) * dpr) continue;
      if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < minD) || boxes.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3])) continue;
      const s = this.fmtVal(layer, v); if (!s) continue;
      placed.push([x, y]); ctx.lineWidth = 3.2 * dpr; ctx.strokeStyle = halo; ctx.strokeText(s, x, y); ctx.fillStyle = ink; ctx.fillText(s, x, y);
    }
    ctx.textAlign = 'left';
  },
  /* ---- wind particles ---- */
  stopParticles() { cancelAnimationFrame(this.praf); this.praf = 0; },
  restartParticles() {
    this.stopParticles();
    const f = this.field; if (!f || !f._p || !this.map) return;
    const c = f._p, ctx = c.getContext('2d'), size = this.map.getSize(), dpr = c.width / Math.max(1, size.x);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    const g = this.grid;
    if (!g || !size.x || !size.y || !S.adv.particles || App.mode !== 'advanced' || !this.visible || document.hidden || !S.anim || REDUCED) return;
    const it = clamp(this.tIdx, 0, g.times.length - 1), np = g.nx * g.ny, off = it * np, uA = new Float32Array(np), vA = new Float32Array(np);
    for (let p = 0; p < np; p++) { const s = g.vars.ws[off + p], d = g.vars.wd[off + p] * Math.PI / 180; uA[p] = -s * Math.sin(d); vA[p] = -s * Math.cos(d); }
    const cs = 10, cw = Math.ceil(size.x / cs) + 1, chh = Math.ceil(size.y / cs) + 1, U = new Float32Array(cw * chh).fill(NaN), V = new Float32Array(cw * chh).fill(NaN);
    const lons = [], lats = [];
    for (let x = 0; x < cw; x++) lons.push(this.map.containerPointToLatLng([x * cs, 0]).lng);
    for (let y = 0; y < chh; y++) lats.push(this.map.containerPointToLatLng([0, y * cs]).lat);
    for (let y = 0; y < chh; y++) {
      const fy = (g.n - lats[y]) / (g.n - g.s) * (g.ny - 1); if (fy < 0 || fy > g.ny - 1) continue;
      for (let x = 0; x < cw; x++) {
        let lo = lons[x]; while (lo < g.w - 180) lo += 360; while (lo > g.w + 180) lo -= 360;
        const fx = (lo - g.w) / (g.e - g.w) * (g.nx - 1); if (fx < 0 || fx > g.nx - 1) continue;
        U[y * cw + x] = bilinear(uA, 0, g.nx, g.ny, fx, fy); V[y * cw + x] = bilinear(vA, 0, g.nx, g.ny, fx, fy);
      }
    }
    const N = Math.round(clamp(size.x * size.y / 650, 250, 2400)), maxAge = 90, P = [];
    const spawn = p => { p.x = Math.random() * size.x; p.y = Math.random() * size.y; p.age = Math.floor(Math.random() * maxAge); return p; };
    for (let i = 0; i < N; i++) P.push(spawn({}));
    /* dark streaks over coloured fields and light maps, light streaks over dark maps and satellite imagery */
    const L0 = S.adv.layer, onField = ['temp', 'wind', 'gust', 'pmsl', 'rh'].includes(L0);
    const darkInk = onField || (L0 !== 'sat' && this.lightBase());
    const color = darkInk ? 'rgba(14,24,34,.6)' : 'rgba(255,255,255,.85)', k = 0.05;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = () => {
      ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0, 0, size.x, size.y);
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = color; ctx.lineWidth = 1.15; ctx.beginPath();
      for (const p of P) {
        const gx = Math.round(p.x / cs), gy = Math.round(p.y / cs), u = U[gy * cw + gx], v = V[gy * cw + gx];
        if (p.age++ > maxAge || u !== u || gx < 0 || gy < 0 || gx >= cw || gy >= chh) { spawn(p); p.age = 0; continue; }
        const nx = p.x + u * k, ny = p.y - v * k;
        ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); p.x = nx; p.y = ny;
        if (nx < 0 || ny < 0 || nx > size.x || ny > size.y) { spawn(p); p.age = 0; }
      }
      ctx.stroke();
      if (this.visible && !document.hidden && App.mode === 'advanced') this.praf = requestAnimationFrame(frame); else this.praf = 0;
    };
    this.praf = requestAnimationFrame(frame);
  },
  /* ---- radar & satellite ---- */
  async showRadar() {
    if (!this.radarFrames.length || Date.now() - this.radarAt > 5 * 60e3) {
      try { const j = await Net.json('https://api.rainviewer.com/public/weather-maps.json', { service: 'RainViewer', timeout: 8000 }); this.radarHost = j.host || 'https://tilecache.rainviewer.com'; this.radarFrames = ((j.radar && j.radar.past) || []).slice(-6); this.radarAt = Date.now(); }
      catch (e) { this.msg(t('radarFail')); return; }
    }
    if (S.adv.layer !== 'radar') return;
    if (!this.radarFrames.length) { this.msg(t('radarNone')); return; }
    this.radarIdx = this.radarFrames.length - 1; this.setRadarFrame(this.radarIdx); this.updateTimebar(); this.renderLegend();
  },
  setRadarFrame(i) {
    const f = this.radarFrames[i]; if (!f || !this.map) return;
    const url = `${this.radarHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`;
    if (!this.radarLayer) this.radarLayer = window.L.tileLayer(url, { pane: 'radar', opacity: 0.85, maxNativeZoom: 7, maxZoom: 19, tileSize: 256, attribution: 'Radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>' }).addTo(this.map);
    else this.radarLayer.setUrl(url);
  },
  showSat(L) {
    if (this.satLayer) return;
    const day = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    const mk = layer => L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, { pane: 'sat', maxNativeZoom: 9, maxZoom: 19, attribution: 'Imagery &copy; NASA EOSDIS GIBS' });
    let errs = 0, oks = 0;
    this.satLayer = mk('VIIRS_NOAA20_CorrectedReflectance_TrueColor');
    this.satLayer.on('tileload', () => oks++);
    this.satLayer.on('tileerror', () => { errs++; if (errs >= 5 && oks === 0 && this.satLayer && !this.satLayer._fb) { this.map.removeLayer(this.satLayer); this.satLayer = mk('MODIS_Terra_CorrectedReflectance_TrueColor'); this.satLayer._fb = true; this.satLayer.addTo(this.map); } });
    this.satLayer.addTo(this.map); this.satDay = day;
  },
  /* ---- time bar with dates ---- */
  updateTimebar() {
    const r = $('#mapTime'), lab = $('#mapTimeLabel'), play = $('#mapPlay'); if (!r) return;
    const k = S.adv.layer, setDis = d => { r.disabled = d; play.disabled = d; $('#mapPrev').disabled = d; $('#mapNext').disabled = d; };
    if (k === 'radar') { r.max = Math.max(0, this.radarFrames.length - 1); r.value = this.radarIdx; setDis(this.radarFrames.length < 2); const f = this.radarFrames[this.radarIdx]; lab.textContent = f ? t('radarAt', { t: fmtTime(f.time * 1000) }) : '–'; this.renderTicks(); this.renderStrip(); return; }
    if (k === 'sat') { r.max = 0; r.value = 0; setDis(true); lab.textContent = this.satDay ? t('satDay', { d: this.satDay }) : '–'; this.renderTicks(); this.renderStrip(); return; }
    const g = this.grid; setDis(!g);
    if (!g) { r.max = 0; lab.textContent = this.gridLoading ? t('loadingShort') : '–'; this.renderTicks(); this.renderStrip(); return; }
    r.max = g.times.length - 1; r.value = this.tIdx; const tt = g.times[this.tIdx]; lab.textContent = fmtDate(tt) + ' · ' + fmtTime(tt);
    this.renderTicks(); this.renderStrip();
  },
  /* ---- forecast strip under the time bar: the chosen place, one column per map time step ---- */
  renderStrip() {
    const box = $('#mapStrip'), sc = $('#mapStripScroll'); if (!box || !sc) return;
    const g = this.grid, o = App.data, k = S.adv.layer, show = !!(g && o && o.h && k !== 'radar' && k !== 'sat');
    box.hidden = !show; if (!show) return;
    const key = [g.times[0], g.times.length, o.lat, o.lon, o.h.t.length, o.h.t[0], LANG, JSON.stringify(S.units)].join('|');
    if (key !== this.stripKey) { this.stripKey = key; this.buildStrip(); this.stripPlaced = false; }
    if (box.offsetParent !== null) this.selectStrip();
  },
  buildStrip() {
    const sc = $('#mapStripScroll'), g = this.grid, o = App.data, H = o.h, T = g.times, now = Date.now();
    $('#mapStripTitle').textContent = t('stripTitle', { p: (App.loc && App.loc.name) || '' });
    const near = tt => {
      let lo = 0, hi = H.t.length - 1; if (hi < 0) return -1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (H.t[m] < tt) lo = m + 1; else hi = m; }
      if (lo > 0 && Math.abs(H.t[lo - 1] - tt) < Math.abs(H.t[lo] - tt)) lo--;
      return Math.abs(H.t[lo] - tt) <= 45 * 60e3 ? lo : -1;
    };
    const cols = T.map((tt, i) => { const kk = near(tt); return { i, tt, k: kk, st: kk >= 0 ? slotStats(o, kk, 3) : null, p: TZ.parts(tt) }; });
    const days = []; cols.forEach(c => { const d = days[days.length - 1]; if (!d || d.key !== c.p.key) days.push({ key: c.p.key, n: 1, tt: c.tt, wd: c.p.wd, first: c.i }); else d.n++; });
    const firsts = new Set(days.map(d => d.first));
    const ink = rgb => (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 150 ? '#13202b' : '#fff');
    const td = (c, inner = '', style = '') => `<td class="${c.tt + 3 * HOUR <= now ? 'past' : ''}${firsts.has(c.i) && c.i ? ' d0' : ''}" data-col="${c.i}"${style ? ` style="${style}"` : ''}>${inner}</td>`;
    const shade = (c, v, scale, alpha) => { if (!isNum(v)) return td(c); const rgb = scaleRGB(scale, v); return td(c, esc(fmtN(Units.w(v), 0)), `background:${rgbCss(rgb, alpha)};color:${ink(rgb)}`); };
    const lab = (name, unit) => `<th class="lab" scope="row">${esc(name)}${unit ? `<small>${esc(unit)}</small>` : ''}</th>`;
    const pDec = S.units.precip === 'in' ? 2 : 1;
    const row = (cls, head, f) => `<tr class="${cls}">${head}${cols.map(c => (c.st ? f(c, c.st, c.k) : td(c))).join('')}</tr>`;
    const html = `<table class="mst">
      <tr class="r-day"><th class="lab"></th>${days.map((d, j) => `<th colspan="${d.n}" class="${d.wd === 0 || d.wd === 6 ? 'we' : ''}${j ? ' d0' : ''}"><span>${esc(d.n >= 4 ? fmtWeekday(d.tt, true) + ' ' + TZ.parts(d.tt).d : wd2(d.tt) + ' ' + TZ.parts(d.tt).d)}</span></th>`).join('')}</tr>
      ${row('r-hour', lab(t('time')), (c, st, kk) => td(c, esc(c.p.mi ? fmtTime(c.tt) : hourLabel(c.p.h))).replace('<td ', `<td title="${esc(`${fmtDate(c.tt)} ${fmtTime(c.tt)} · ${wmoText(st.code)} · ${F.t(H.temp[kk])} · ${t('precipitation')} ${F.p(st.pr || 0)}${isNum(st.pop) ? ' (' + fmtPct(st.pop) + ')' : ''} · ${t('wind')} ${F.w(st.ws)} ${compass(st.wd)}, ${t('gustsV', { v: F.w(st.wg) })}`)}" `))}
      ${row('r-icon', lab(t('weather')), (c, st) => td(c, wxIcon(st.code, st.isDay ?? (c.p.h >= 6 && c.p.h < 18 ? 1 : 0), 22)))}
      ${row('r-temp', lab(t('temperature'), Units.label.t()), (c, st, kk) => td(c, esc(F.t(H.temp[kk]))))}
      ${row('r-feel', lab(t('feelsShort'), Units.label.t()), (c, st, kk) => td(c, esc(F.t(H.feels[kk]))))}
      ${row('r-rain', lab(t('precipitation'), Units.label.p()), (c, st) => (isNum(st.pr) && st.pr >= 0.05 ? td(c, esc(fmtN(Units.p(st.pr), Units.p(st.pr) >= 10 ? 0 : pDec)), `background:${rgbCss(scaleRGB('precip', st.pr / 3), 0.55)}`) : td(c)))}
      ${row('r-wind', lab(t('wind'), Units.label.w()), (c, st) => shade(c, st.ws, 'wind', 0.9))}
      ${row('r-gust', lab(t('gusts'), Units.label.w()), (c, st) => shade(c, st.wg, 'wind', 0.9))}
      ${row('r-dir', lab(t('direction')), (c, st) => td(c, isNum(st.wd) ? windArrow(st.wd, 14) : '').replace('<td ', `<td title="${esc(compass(st.wd))}" `))}
    </table><div class="mstrip-sel" id="mapStripSel"></div><div class="mstrip-now" id="mapStripNow" hidden></div>`;
    sc.innerHTML = html;
  },
  /* highlight the map's time step; scroll it into view (the first time: now, with a little of the past showing) */
  selectStrip() {
    const sc = $('#mapStripScroll'), sel = $('#mapStripSel'), g = this.grid; if (!sc || !sel || !g) return;
    const i = clamp(this.tIdx, 0, g.times.length - 1), c = sc.querySelector(`.r-hour td[data-col="${i}"]`); if (!c) return;
    const top = sc.querySelector('.r-day').offsetHeight, tbl = sc.querySelector('table');
    sel.style.left = c.offsetLeft + 'px'; sel.style.width = c.offsetWidth + 'px'; sel.style.top = top + 'px'; sel.style.height = (tbl.offsetHeight - top) + 'px';
    sc.querySelectorAll('.r-hour td.sel').forEach(e => e.classList.remove('sel')); c.classList.add('sel');
    const nowEl = $('#mapStripNow'), now = Date.now(), T = g.times, i0 = T.findIndex(tt => tt <= now && now < tt + 3 * HOUR), cn = i0 >= 0 && sc.querySelector(`.r-hour td[data-col="${i0}"]`);
    nowEl.hidden = !cn; if (cn) { nowEl.style.left = (cn.offsetLeft + cn.offsetWidth * (now - T[i0]) / (3 * HOUR)).toFixed(1) + 'px'; nowEl.style.top = top + 'px'; nowEl.title = t('now'); }
    const labW = sc.querySelector('th.lab').offsetWidth, x0 = c.offsetLeft - labW, view = sc.clientWidth - labW;
    if (!this.stripPlaced) { sc.scrollLeft = Math.max(0, x0 - 3 * c.offsetWidth); this.stripPlaced = true; return; }
    if (x0 < sc.scrollLeft + 2 || x0 + c.offsetWidth > sc.scrollLeft + view - 2) sc.scrollTo({ left: Math.max(0, x0 - view / 3), behavior: this.playing || REDUCED ? 'auto' : 'smooth' });
  },
  stripPage(d) { const sc = $('#mapStripScroll'); if (!sc) return; const labW = (sc.querySelector('th.lab') || {}).offsetWidth || 0; sc.scrollBy({ left: d * (sc.clientWidth - labW) * 0.85, behavior: REDUCED ? 'auto' : 'smooth' }); },
  /* a click picks that time; with a mouse, dragging pans the strip instead */
  bindStrip() {
    const sc = $('#mapStripScroll'); if (!sc) return;
    let drag = null, dragged = false;
    sc.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; drag = { x: e.clientX, left: sc.scrollLeft, moved: false }; dragged = false; });
    sc.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; sc.classList.add('dragging'); try { sc.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      if (drag.moved) sc.scrollLeft = drag.left - dx;
    });
    const end = () => { if (drag && drag.moved) dragged = true; drag = null; sc.classList.remove('dragging'); };
    sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
    sc.addEventListener('click', e => { if (dragged) { dragged = false; return; } const cell = e.target.closest('[data-col]'); if (cell) this.jumpTo(+cell.dataset.col); });
  },
  renderTicks() {
    const box = $('#mapTicks'); if (!box) return;
    const k = S.adv.layer; let html = '';
    if (k === 'radar') {
      const n = this.radarFrames.length;
      if (n > 1) this.radarFrames.forEach((fr, i) => { const p = sliderPos(i / (n - 1)); html += `<span class="tk-sep" style="left:${p}"></span><button type="button" class="tk-day${i === this.radarIdx ? ' cur' : ''}" data-tjump="${i}" style="left:${p}">${esc(fmtTime(fr.time * 1000))}</button>`; });
      box.innerHTML = html; return;
    }
    const g = this.grid; if (k === 'sat' || !g || g.times.length < 2) { box.innerHTML = ''; return; }
    const T = g.times, max = T.length - 1, starts = [];
    T.forEach((tt, i) => { if (i === 0 || TZ.parts(tt).key !== TZ.parts(T[i - 1]).key) starts.push(i); });
    const W = Math.max(100, box.clientWidth - 18), perDay = W / Math.max(1, (T[max] - T[0]) / DAY);
    const longLbl = perDay >= 52, every = perDay >= 22 ? 1 : perDay >= 12 ? 2 : 3, curKey = TZ.parts(T[clamp(this.tIdx, 0, max)]).key;
    starts.forEach((s, j) => {
      const e = j + 1 < starts.length ? starts[j + 1] : max + 1;
      if (s > 0) html += `<span class="tk-sep" style="left:${sliderPos(s / max)}"></span>`;
      if (e - s < 3 || j % every) return;
      let best = s, bd = 99; for (let i = s; i < e && i <= max; i++) { const d = Math.abs(TZ.parts(T[i]).h - 12); if (d < bd) { bd = d; best = i; } }
      const p = TZ.parts(T[best]), we = p.wd === 0 || p.wd === 6, lbl = longLbl ? fmtWeekday(T[best]) + ' ' + p.d : String(p.d);
      html += `<button type="button" class="tk-day${we ? ' we' : ''}${p.key === curKey ? ' cur' : ''}" data-tjump="${best}" style="left:${sliderPos(((s + e - 1) / 2) / max)}" title="${esc(fmtDateLong(T[best]))}">${esc(lbl)}</button>`;
    });
    const now = Date.now();
    if (now >= T[0] && now <= T[max]) { let i = 0; while (i < max && T[i + 1] <= now) i++; const fpos = (i + (now - T[i]) / Math.max(1, T[Math.min(max, i + 1)] - T[i])) / max; html += `<span class="tk-now" style="left:${sliderPos(fpos)}" title="${esc(t('now'))}"></span>`; }
    box.innerHTML = html;
  },
  onTime(v) {
    if (S.adv.layer === 'radar') { this.radarIdx = v; this.setRadarFrame(v); }
    else { this.tIdx = v; this.drawField(); this.restartParticles(); this.renderLegend(); }
    this.updateTimebar();
  },
  stepTime(d) { const r = $('#mapTime'); if (!r || r.disabled) return; this.stopPlay(); const v = clamp(+r.value + d, 0, +r.max); r.value = v; this.onTime(v); },
  jumpTo(i) { const r = $('#mapTime'); if (!r || r.disabled) return; this.stopPlay(); r.value = i; this.onTime(+i); },
  togglePlay() { if (this.playing) this.stopPlay(); else this.startPlay(); },
  startPlay() {
    const r = $('#mapTime'); if (!r || r.disabled) return;
    this.playing = true; $('#mapPlay').innerHTML = ui('pause');
    this.playTimer = setInterval(() => { const max = +r.max; let v = +r.value + 1; if (v > max) v = 0; r.value = v; this.onTime(v); }, clamp(+S.adv.playMs || 1500, 150, 5000));
  },
  stopPlay() { this.playing = false; clearInterval(this.playTimer); const b = $('#mapPlay'); if (b) b.innerHTML = ui('play', 'i fill'); },
  /* ---- legend: what the colours mean, the range on screen and the value under the cursor ---- */
  fmtLegend(k, v) {
    switch (k) {
      case 'temp': return fmtN(Units.t(v), 0) + '°';
      case 'wind': case 'gust': return fmtN(Units.w(v), 0);
      case 'pmsl': return fmtN(Units.pr(v), Units.dec.pr());
      case 'rh': case 'cloud': return fmtN(v, 0) + '%';
      case 'precip': return fmtN(Units.p(v), S.units.precip === 'in' ? 2 : (v < 1 ? 1 : 0));
      default: return '';
    }
  },
  renderLegend() {
    const el = $('#mapLegend'); if (!el) return;
    const k = S.adv.layer;
    if (k === 'radar') { el.hidden = false; el.innerHTML = `<div class="lg-t">${esc(t('ly_radar'))}</div><div class="lg-cap">${esc(t('lgCap_radar'))}</div><div class="grad" style="background:linear-gradient(90deg,#88ddee,#0099cc,#0077aa,#005588,#ffee00,#ffaa00,#ff4400,#c10000)"></div><div class="ticks"><span>${esc(t('light'))}</span><span>${esc(t('heavy'))}</span></div>`; return; }
    if (k === 'sat') { el.hidden = false; el.innerHTML = `<div class="lg-t">${esc(t('ly_sat'))}</div><div class="lg-cap">${esc(t('satNote'))}</div>`; return; }
    const fr = this.frameInfo(); if (!fr) { el.hidden = true; return; }
    const unit = { temp: Units.label.t(), precip: Units.label.p() + '/' + t('hShort'), wind: Units.label.w(), gust: Units.label.w(), pmsl: Units.label.pr(), rh: '%', cloud: '%' }[k];
    let grad, ticks, mode = '';
    if (k === 'cloud') { grad = this.lightBase() ? 'linear-gradient(90deg,rgba(52,66,86,.05),rgba(52,66,86,.62))' : 'linear-gradient(90deg,rgba(236,241,246,.05),rgba(236,241,246,.85))'; ticks = ['0%', '50%', '100%']; }
    else if (k === 'precip') {
      const st = SCALES.precip.filter(([x]) => x <= 16), n = st.length;
      grad = 'linear-gradient(90deg,' + st.map(([, c], i) => `${c} ${(i / (n - 1) * 100).toFixed(1)}%`).join(',') + ')';
      ticks = [0.1, 1, 4, 16].map(v => this.fmtLegend('precip', v)); ticks[3] += '+';
    } else if (fr.rng && LOCAL_SCALE[k]) {
      const st = RAMPS[LOCAL_SCALE[k]];
      grad = 'linear-gradient(90deg,' + st.map((c, i) => `${c} ${(i / (st.length - 1) * 100).toFixed(1)}%`).join(',') + ')';
      const [lo, hi] = fr.rng; ticks = [lo, lo + (hi - lo) / 3, lo + (hi - lo) * 2 / 3, hi].map(v => this.fmtLegend(k, v));
      mode = t('scaleLocalNote');
    } else {
      const st = SCALES[FIXED_SCALE[k]], n = st.length;
      grad = 'linear-gradient(90deg,' + st.map(([, c], i) => `${c} ${(i / (n - 1) * 100).toFixed(1)}%`).join(',') + ')';
      ticks = [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1].map(i => this.fmtLegend(k === 'gust' ? 'wind' : k, st[i][0]));
      mode = t('scaleFixedNote');
    }
    const span = !isNum(fr.min) ? '' : k === 'precip' && fr.max < 0.05 ? t('lgDry') : t('lgSpan', { a: this.fmtLegend(k, fr.min), b: this.fmtLegend(k, fr.max) });
    el.hidden = false;
    el.innerHTML = `<div class="lg-t">${esc(t('ly_' + k))} · ${esc(unit)}</div><div class="lg-cap">${esc(t('lgCap_' + k))}${mode ? ' · ' + esc(mode) : ''}</div><div class="grad" style="background:${grad}"></div><div class="ticks">${ticks.map(x => `<span>${esc(x)}</span>`).join('')}</div>${span ? `<div class="lg-span">${esc(span)}</div>` : ''}<div class="lg-here" id="lgHere" hidden></div>`;
  },
  valueAt(ll) {
    const g = this.grid, k = S.adv.layer; if (!g || !FIELD_LAYERS.includes(k)) return null;
    const fr = this.frameInfo(); if (!fr) return null;
    let lo = ll.lng; while (lo < g.w - 180) lo += 360; while (lo > g.w + 180) lo -= 360;
    const fx = (lo - g.w) / (g.e - g.w) * (g.nx - 1), fy = (g.n - ll.lat) / (g.n - g.s) * (g.ny - 1);
    if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return null;
    const v = bicubic(fr.vals, 0, g.nx, g.ny, fx, fy); return v === v ? v : null;
  },
  hover(ll) {
    const el = $('#lgHere'); if (!el) return;
    const v = this.valueAt(ll);
    if (v == null) { el.hidden = true; return; }
    el.hidden = false; el.textContent = t('hereVal', { v: this.fmtHere(S.adv.layer, v) });
  },
  pointPopup(ll) {
    const L = window.L, g = this.grid, rows = [];
    let when = '';
    if (g) {
      const it = clamp(this.tIdx, 0, g.times.length - 1); when = fmtDate(g.times[it]) + ' ' + fmtTime(g.times[it]);
      let lo = ll.lng; while (lo < g.w - 180) lo += 360; while (lo > g.w + 180) lo -= 360;
      const fx = (lo - g.w) / (g.e - g.w) * (g.nx - 1), fy = (g.n - ll.lat) / (g.n - g.s) * (g.ny - 1);
      if (fx >= 0 && fy >= 0 && fx <= g.nx - 1 && fy <= g.ny - 1) {
        const np = g.nx * g.ny, off = it * np, V = g.vars, b = k => bicubic(V[k], off, g.nx, g.ny, fx, fy);
        const ws = b('ws'), wd = (() => { const u = [], v = []; for (let p = 0; p < np; p++) { const s = V.ws[off + p], d = V.wd[off + p] * Math.PI / 180; u.push(-s * Math.sin(d)); v.push(-s * Math.cos(d)); } const uu = bilinear(u, 0, g.nx, g.ny, fx, fy), vv = bilinear(v, 0, g.nx, g.ny, fx, fy); return (Math.atan2(-uu, -vv) * 180 / Math.PI + 360) % 360; })();
        rows.push([t('temperature'), F.t1(b('temp'))], [t('precipitation'), F.p(b('precip') / g.precipDiv) + '/' + t('hShort')], [t('wind'), F.w(ws) + ' ' + compass(wd)], [t('gusts'), F.w(b('wg'))], [t('clouds'), fmtPct(b('cloud'))], [t('pressureMsl'), F.pr(b('pmsl'))], [t('humidity'), fmtPct(b('rh'))]);
      }
    }
    const html = `<h4>${esc(fmtN(ll.lat, 3))}°, ${esc(fmtN(((ll.lng + 540) % 360) - 180, 3))}°</h4>${when ? `<div class="muted" style="font-size:12px">${esc(when)}</div>` : ''}${rows.length ? `<table class="pop-tbl">${rows.map(([a, v]) => `<tr><td>${esc(a)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : `<p class="muted" style="font-size:12px;margin:6px 0">${esc(t('popupNoGrid'))}</p>`}<button class="btn small primary" type="button" data-goto="${ll.lat.toFixed(4)},${(((ll.lng + 540) % 360) - 180).toFixed(4)}">${ui('pin')}${esc(t('forecastHere'))}</button>`;
    L.popup({ maxWidth: 280, autoPanPadding: [20, 20] }).setLatLng(ll).setContent(html).openOn(this.map);
  },
  recenter() { if (this.map && App.data) this.map.setView([App.data.lat, App.data.lon], MAP_ZOOM); },
  themeChanged() { if (this.map) { this.setBase(); this.drawField(); this.restartParticles(); this.renderLegend(); } }
};
