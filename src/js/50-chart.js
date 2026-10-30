/* =====================================================================
   TimeChart: multi-panel canvas time-series (meteogram) with a pinned
   y-axis, night shading, day separators and a shared crosshair tooltip
   ===================================================================== */
const TC = { padL: 46, padR: 46, top: 22, bottom: 20, gap: 14, title: 18 };
function cssVars() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  return { g, text: g('--text'), text2: g('--text-2'), muted: g('--muted'), grid: g('--grid'), grid2: g('--grid-2'), night: g('--night'), accent: g('--accent-fill'), surface: g('--surface'), bar: g('--bar'), font: g('--font-body') || 'sans-serif' };
}
function colorOf(c, css) { return c && c.startsWith('--') ? (css.g(c) || '#888') : (c || '#888'); }
function withAlpha(c, a) {
  if (!c) return `rgba(128,128,128,${a})`;
  if (c[0] === '#') { const h = c.length === 4 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1, 7); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(',').map(s => s.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
  return c;
}
function niceTicks(lo, hi, count) {
  const span = hi - lo || 1, raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), nrm = raw / mag;
  const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}
const CLOUD_P2D = typeof Path2D !== 'undefined' ? new Path2D(IC.cloud) : null;
const MOON_P2D = typeof Path2D !== 'undefined' ? new Path2D(IC.moon) : null;
function drawWx(ctx, code, isDay, cx, cy, size) {
  if (!CLOUD_P2D) return;
  const k = iconKind(code), night = isDay === 0, s = size / 64;
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(s, s);
  const sun = (x, y, r) => { ctx.fillStyle = '#f6b73c'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#f6b73c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 3.5), y + Math.sin(a) * (r + 3.5)); ctx.lineTo(x + Math.cos(a) * (r + 7.5), y + Math.sin(a) * (r + 7.5)); ctx.stroke(); } };
  const moon = (tx, ty, sc) => { ctx.save(); ctx.translate(tx, ty); ctx.scale(sc, sc); ctx.fillStyle = '#e6d9a6'; ctx.fill(MOON_P2D); ctx.restore(); };
  const cloud = (tx, ty, sc, dark) => { ctx.save(); ctx.translate(tx, ty); ctx.scale(sc, sc); ctx.fillStyle = dark ? '#8a9aac' : '#eef2f6'; ctx.fill(CLOUD_P2D); ctx.lineWidth = 2 / sc; ctx.strokeStyle = 'rgba(60,80,104,.55)'; ctx.stroke(CLOUD_P2D); ctx.restore(); };
  const drops = (xs, y, color = '#3a8edb') => { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (const x of xs) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.4, y + 7); ctx.stroke(); } };
  const flakes = pts => { ctx.fillStyle = '#7fb0e4'; for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.283); ctx.fill(); } };
  const lum = (x, y, r, mx, my, ms) => (night ? moon(mx, my, ms) : sun(x, y, r));
  switch (k) {
    case 'clear': lum(32, 32, 12, 2, 2, 1); break;
    case 'mostly': lum(26, 26, 11, 1, 1, 0.85); cloud(26, 30, 0.6); break;
    case 'partly': lum(22, 22, 9, -3, -3, 0.8); cloud(14, 17, 0.78); break;
    case 'overcast': cloud(20, 4, 0.72, true); cloud(-1, 8, 0.95); break;
    case 'fog': cloud(1, -4, 0.85); ctx.strokeStyle = '#8c9cab'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; [[13, 44, 49], [18, 50, 55], [11, 56, 43]].forEach(([a, y, b]) => { ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke(); }); break;
    case 'snow': case 'heavysnow': case 'snowshowers': cloud(1, -5, 0.9, k === 'heavysnow'); flakes([[22, 47], [34, 52], [46, 47]]); break;
    case 'sleet': case 'freezing': cloud(1, -5, 0.9); drops([22, 42], 41); flakes([[32, 50]]); break;
    case 'thunder': case 'hail': cloud(1, -6, 0.9, true); ctx.fillStyle = '#ffc93a'; ctx.beginPath(); ctx.moveTo(33, 36); ctx.lineTo(25, 49); ctx.lineTo(31.5, 49); ctx.lineTo(27.5, 60); ctx.lineTo(41, 45); ctx.lineTo(34.5, 45); ctx.lineTo(38.5, 36); ctx.closePath(); ctx.fill(); break;
    case 'drizzle': cloud(1, -5, 0.9); drops([24, 40], 42); break;
    case 'na': break;
    default: cloud(1, -5, 0.9, k === 'heavyrain' || k === 'heavyshowers'); drops([22, 32, 42], 41);
  }
  ctx.restore();
}

class TimeChart {
  constructor(host, cfg) {
    this.host = host; this.cfg = cfg; this.pickIdx = null;
    host.innerHTML = '<div class="tc"><div class="tc-scroll"><div class="tc-inner"><canvas class="tc-main"></canvas><canvas class="tc-over"></canvas></div></div><canvas class="tc-axis"></canvas><div class="tc-tip" hidden></div></div>';
    this.wrap = host.firstElementChild; this.scroll = $('.tc-scroll', host); this.inner = $('.tc-inner', host);
    this.cv = $('.tc-main', host); this.over = $('.tc-over', host); this.axis = $('.tc-axis', host); this.tip = $('.tc-tip', host);
    this.ctx = this.cv.getContext('2d'); this.octx = this.over.getContext('2d'); this.actx = this.axis.getContext('2d');
    const move = e => { if (e.pointerType === 'touch' && e.type === 'pointermove') return; this.pointer(e); };
    this.scroll.addEventListener('pointermove', move);
    this.scroll.addEventListener('pointerdown', e => this.pointer(e));
    this.scroll.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this.clearPick(); });
    this.scroll.addEventListener('scroll', () => { if (this.pickIdx != null) this.placeTip(); });
    if ('ResizeObserver' in window) { this.ro = new ResizeObserver(debounce(() => this.layout(), 100)); this.ro.observe(host); }
    this.layout();
  }
  destroy() { if (this.ro) this.ro.disconnect(); }
  ph(P) { return P.h >= 60 ? Math.round(P.h * (this.hk || 1)) : P.h; }
  scalableH() { return this.cfg.panels.reduce((s, P) => s + (P.h >= 60 ? P.h : 0), 0); }
  update(cfg) { this.cfg = cfg; this.layout(); if (this.host.closest('.card.is-full')) FullCard.scheduleFit(); }
  layout() {
    const cw = this.host.clientWidth; if (!cw) return;
    const n = this.cfg.times.length, ppx = this.cfg.pxPerStep || 0;
    this.W = Math.max(cw, Math.round(n * ppx) + TC.padL + TC.padR); this.CW = cw;
    this.hk = this.host.closest('.card.is-full') ? (this.fitK || 1) : 1;   /* full screen: FullCard.fit() sets fitK so the card fills the screen */
    this.H = TC.top + this.cfg.panels.reduce((s, p) => s + TC.title + this.ph(p) + TC.gap, 0) - TC.gap + TC.bottom;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const [c, w] of [[this.cv, this.W], [this.over, this.W], [this.axis, cw]]) { c.width = Math.round(w * dpr); c.height = Math.round(this.H * dpr); c.style.width = w + 'px'; c.style.height = this.H + 'px'; }
    this.inner.style.width = this.W + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.octx.setTransform(dpr, 0, 0, dpr, 0, 0); this.actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
    if (this.cfg.scrollTo != null && !this._scrolled) { this._scrolled = true; const x = this.X(this.cfg.scrollTo) - 60; this.scroll.scrollLeft = Math.max(0, x); }
  }
  draw() {
    const { ctx, W, cfg } = this, css = cssVars(), T = cfg.times, n = T.length; this.css = css;
    ctx.clearRect(0, 0, W, this.H);
    if (n < 2) return;
    const t0 = T[0], t1 = T[n - 1], plotW = W - TC.padL - TC.padR;
    const X = tt => TC.padL + (tt - t0) / (t1 - t0) * plotW; this.X = X;
    const stepPx = plotW / (n - 1);
    const days = [];
    for (let i = 0; i < n; i++) { const p = TZ.parts(T[i]); if (i === 0 || p.key !== TZ.parts(T[i - 1]).key) days.push({ i, x: X(T[i]), tt: T[i], h: p.h }); }
    let y = TC.top; this.rects = [];
    for (const P of cfg.panels) {
      const top = y + TC.title, bot = top + this.ph(P), ptop = top + (P.topPad || 4);
      let lo = Infinity, hi = -Infinity;
      for (const s of P.series) { if (s.axis === 'right' || s.type === 'strip' || s.type === 'icons' || s.type === 'arrows' || s.noScale) continue; for (const arr of [s.data, s.data2, s.stackOn && s.data ? s.data.map((v, i) => (isNum(v) ? v + (s.stackOn[i] || 0) : null)) : null]) if (arr) for (const v of arr) if (isNum(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (lo === Infinity) { lo = 0; hi = 1; }
      if (P.include) for (const v of P.include) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (P.fixed) { lo = P.fixed[0]; hi = P.fixed[1]; }
      else { const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1; if (!P.zeroBase || lo < 0) lo -= pad; hi += pad; if (P.zeroBase && lo > 0) lo = 0; }
      const ticks = niceTicks(lo, hi, Math.max(2, Math.floor(this.ph(P) / 32)));
      const Y = v => bot - (v - lo) / (hi - lo) * (bot - ptop);
      let Y2 = null, ticks2 = null, r2 = null;
      if (P.right) {
        r2 = P.right.range ? P.right.range.slice() : null;
        if (!r2) { const vals = P.series.filter(s => s.axis === 'right').flatMap(s => (s.data || []).filter(isNum)); const a = vals.length ? Math.min(...vals) : 0, b = vals.length ? Math.max(...vals) : 1, pd = (b - a) * 0.1 || 1; r2 = [a - pd, b + pd]; }
        ticks2 = niceTicks(r2[0], r2[1], 3); Y2 = v => bot - (v - r2[0]) / (r2[1] - r2[0]) * (bot - ptop);
      }
      if (cfg.isDay) {
        ctx.fillStyle = css.night; let st = null;
        for (let i = 0; i <= n; i++) {
          const nt = i < n && cfg.isDay[i] === 0;
          if (nt && st === null) st = i;
          if (!nt && st !== null) { const xa = Math.max(TC.padL, X(T[st]) - stepPx / 2), xb = Math.min(W - TC.padR, X(T[i - 1]) + stepPx / 2); ctx.fillRect(xa, top, xb - xa, bot - top); st = null; }
        }
      }
      if (!P.noGrid) { ctx.strokeStyle = css.grid; ctx.lineWidth = 1; ctx.beginPath(); for (const tv of ticks) { const yy = Math.round(Y(tv)) + 0.5; if (yy < top || yy > bot + 1) continue; ctx.moveTo(TC.padL, yy); ctx.lineTo(W - TC.padR, yy); } ctx.stroke(); }
      ctx.strokeStyle = css.grid2; ctx.lineWidth = 1; ctx.beginPath();
      for (const d of days) { if (d.i === 0) continue; const xx = Math.round(d.x) + 0.5; ctx.moveTo(xx, top); ctx.lineTo(xx, bot); }
      ctx.stroke();
      ctx.strokeStyle = css.grid2; ctx.beginPath(); ctx.moveTo(TC.padL, bot + 0.5); ctx.lineTo(W - TC.padR, bot + 0.5); ctx.stroke();
      for (const s of P.series) {
        if (s.hidden) continue;
        const YY = s.axis === 'right' ? Y2 : Y, color = colorOf(s.color, css);
        if (s.type === 'line') this.line(T, s.data, X, YY, color, s.width || 2, s.dash);
        else if (s.type === 'area') { this.area(T, s.data, X, YY, color, s.alpha ?? 0.18, YY(Math.max(P.fixed ? P.fixed[0] : lo, 0))); this.line(T, s.data, X, YY, color, s.width || 1.5); }
        else if (s.type === 'band') this.band(T, s.data, s.data2, X, YY, color, s.alpha ?? 0.2);
        else if (s.type === 'bar') {
          const bw = Math.max(1.5, Math.min(16, stepPx * (s.frac || 0.72))), sh = s.shift || 0;
          for (let i = 0; i < n; i++) { const v = s.data[i]; if (!isNum(v) || v <= 0) continue; const base = s.stackOn && isNum(s.stackOn[i]) ? s.stackOn[i] : 0; const y1 = YY(base + v), y0 = YY(base); ctx.fillStyle = s.colorFn ? s.colorFn(v) : color; ctx.fillRect(X(T[i] + sh) - bw / 2, y1, bw, Math.max(1, y0 - y1)); }
        } else if (s.type === 'strip') {
          const rows = s.rows, rh = (bot - top) / rows.length;
          rows.forEach((r, ri) => { for (let i = 0; i < n; i++) { const v = r.data[i]; if (!isNum(v) || v <= 1) continue; ctx.fillStyle = withAlpha(color, clamp(v / 100, 0, 1) * 0.9); ctx.fillRect(X(T[i]) - stepPx / 2, top + ri * rh + 1, stepPx + 0.6, rh - 2); } });
        } else if (s.type === 'arrows') {
          const every = Math.max(1, Math.ceil(24 / stepPx));
          ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4;
          for (let i = 0; i < n; i += every) { const d = s.data[i]; if (!isNum(d)) continue; const yv = s.yData && isNum(s.yData[i]) ? YY(s.yData[i]) : bot - 10; this.arrow(X(T[i]), clamp(yv - 12, ptop + 6, bot - 6), d); }
        } else if (s.type === 'icons') {
          const every = Math.max(1, Math.ceil(34 / stepPx));
          for (let i = 0; i < n; i += every) drawWx(ctx, s.data[i], s.isDay ? s.isDay[i] : 1, X(T[i]), top + 13, 24);
        }
      }
      if (cfg.now && cfg.now > t0 && cfg.now < t1) { const xx = Math.round(X(cfg.now)) + 0.5; ctx.save(); ctx.strokeStyle = css.accent; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, bot); ctx.stroke(); ctx.restore(); }
      this.rects.push({ P, top, bot, Y, Y2, ticks, ticks2, r2, lo, hi, y0: y });
      y = bot + TC.gap;
    }
    ctx.font = `700 11.5px ${css.font}`; ctx.fillStyle = css.text2; ctx.textBaseline = 'alphabetic';
    if (!cfg.daily) days.forEach((d, k) => {
      const label = dayLabel(d.tt) + ' ' + TZ.parts(d.tt).d, x0 = Math.max(TC.padL + 3, d.x + 4), x1 = k + 1 < days.length ? days[k + 1].x : W - TC.padR;
      if (x1 - x0 >= ctx.measureText(label).width + 6) ctx.fillText(label, x0, 14);
    });
    const lastBot = this.H - TC.bottom; ctx.font = `11px ${css.font}`; ctx.fillStyle = css.muted; ctx.textAlign = 'center';
    if (cfg.daily) {
      const lab = i => fmtWeekday(T[i]).slice(0, 3) + ' ' + TZ.parts(T[i]).d, every = Math.max(1, Math.ceil((ctx.measureText('Wed 30').width + 10) / stepPx));
      for (let i = 0; i < n; i += every) ctx.fillText(lab(i), clamp(X(T[i]), TC.padL + 18, W - TC.padR - 18), lastBot + 14);
    }
    else {
      const hrs = [1, 2, 3, 6, 12, 24].find(hh => (hh * HOUR) / (t1 - t0) * plotW >= 42) || 24;
      for (let i = 0; i < n; i++) { const p = TZ.parts(T[i]); if (p.mi !== 0 || p.h % hrs !== 0 || (hrs === 24 && p.h !== 0)) continue; if (p.h === 0 && hrs < 24) continue; ctx.fillText(hrs >= 24 ? fmtWeekday(T[i] + 6 * HOUR) : fmtHour(T[i]), X(T[i]), lastBot + 14); }
    }
    ctx.textAlign = 'left';
    this.drawAxis();
    if (this.pickIdx != null) this.drawPick();
  }
  drawAxis() {
    const a = this.actx, css = this.css, w = this.CW; a.clearRect(0, 0, w, this.H);
    for (const r of this.rects) {
      a.fillStyle = withAlpha(css.surface, 0.82); a.fillRect(0, r.top, TC.padL - 4, r.bot - r.top + 1);
      if (r.P.right) a.fillRect(w - TC.padR + 4, r.top, TC.padR - 4, r.bot - r.top + 1);
      a.font = `700 10.5px ${css.font}`; a.fillStyle = css.muted; a.textBaseline = 'alphabetic';
      const title = (r.P.title || '').toUpperCase() + (r.P.unit ? '  ' + r.P.unit : '');
      a.fillStyle = withAlpha(css.surface, 0.9); const tw = a.measureText(title).width; a.fillRect(0, r.y0 + 2, tw + 10, 14);
      a.fillStyle = css.muted; a.fillText(title, 4, r.y0 + 13);
      a.font = `10.5px ${css.font}`; a.textBaseline = 'middle';
      if (r.P.series.some(s => s.type === 'strip')) {
        const rows = r.P.series.find(s => s.type === 'strip').rows, rh = (r.bot - r.top) / rows.length;
        rows.forEach((row, i) => { a.fillStyle = css.text2; a.fillText(row.label, 4, r.top + rh * (i + 0.5)); });
      } else {
        a.fillStyle = css.text2; const fmt = r.P.tickFmt || (v => fmtN(v, Math.abs(r.hi - r.lo) < 4 ? 1 : 0));
        for (const tv of r.ticks) { const yy = r.Y(tv); if (yy < r.top + 4 || yy > r.bot - 2) continue; a.fillText(fmt(tv), 4, yy); }
      }
      if (r.P.right && r.ticks2) { a.textAlign = 'right'; a.fillStyle = css.text2; const f2 = r.P.right.fmt || (v => fmtN(v, Math.abs(r.r2[1] - r.r2[0]) < 4 ? 1 : 0)); for (const tv of r.ticks2) { const yy = r.Y2(tv); if (yy < r.top + 4 || yy > r.bot - 2) continue; a.fillText(f2(tv), w - 4, yy); } a.textAlign = 'left'; }
    }
  }
  line(T, D, X, Y, color, w, dash) {
    const c = this.ctx; c.save(); c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; if (dash) c.setLineDash(dash);
    c.beginPath(); let pen = false;
    for (let i = 0; i < T.length; i++) { const v = D[i]; if (!isNum(v)) { pen = false; continue; } const x = X(T[i]), y = Y(v); if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y); }
    c.stroke(); c.restore();
  }
  area(T, D, X, Y, color, alpha, base) {
    const c = this.ctx; let seg = [];
    const flush = () => { if (seg.length > 1) { c.beginPath(); c.moveTo(X(T[seg[0]]), base); for (const i of seg) c.lineTo(X(T[i]), Y(D[i])); c.lineTo(X(T[seg[seg.length - 1]]), base); c.closePath(); c.fillStyle = withAlpha(color, alpha); c.fill(); } seg = []; };
    for (let i = 0; i < T.length; i++) { if (isNum(D[i])) seg.push(i); else flush(); } flush();
  }
  band(T, A, B, X, Y, color, alpha) {
    const c = this.ctx; let seg = [];
    const flush = () => { if (seg.length > 1) { c.beginPath(); seg.forEach((i, k) => (k ? c.lineTo(X(T[i]), Y(B[i])) : c.moveTo(X(T[i]), Y(B[i])))); for (let k = seg.length - 1; k >= 0; k--) c.lineTo(X(T[seg[k]]), Y(A[seg[k]])); c.closePath(); c.fillStyle = withAlpha(color, alpha); c.fill(); } seg = []; };
    for (let i = 0; i < T.length; i++) { if (isNum(A[i]) && isNum(B[i])) seg.push(i); else flush(); } flush();
  }
  arrow(x, y, deg) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(((deg + 180) % 360) * Math.PI / 180);
    c.beginPath(); c.moveTo(0, 6); c.lineTo(0, -5); c.stroke(); c.beginPath(); c.moveTo(0, -7); c.lineTo(3.5, -1.5); c.lineTo(-3.5, -1.5); c.closePath(); c.fill(); c.restore();
  }
  pointer(e) {
    const r = this.inner.getBoundingClientRect(), x = e.clientX - r.left, n = this.cfg.times.length; if (n < 2 || !this.X) return;
    const t0 = this.cfg.times[0], t1 = this.cfg.times[n - 1], plotW = this.W - TC.padL - TC.padR;
    const tt = t0 + (x - TC.padL) / plotW * (t1 - t0);
    let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.abs(this.cfg.times[i] - tt); if (d < bd) { bd = d; best = i; } }
    this.pickIdx = best; this.drawPick();
    if (this.cfg.onPick) this.cfg.onPick(best);
  }
  clearPick() { this.pickIdx = null; this.octx.clearRect(0, 0, this.W, this.H); this.tip.hidden = true; }
  drawPick() {
    const i = this.pickIdx, o = this.octx, css = this.css, T = this.cfg.times; if (i == null || !this.rects) return;
    o.clearRect(0, 0, this.W, this.H);
    const x = Math.round(this.X(T[i])) + 0.5;
    o.strokeStyle = css.text2; o.lineWidth = 1; o.beginPath(); o.moveTo(x, TC.top); o.lineTo(x, this.H - TC.bottom); o.stroke();
    let html = `<h4>${esc(this.cfg.daily ? fmtDate(T[i] + 6 * HOUR) : fmtDate(T[i]) + ' ' + fmtTime(T[i]))}</h4>`;
    for (const r of this.rects) {
      for (const s of r.P.series) {
        if (s.type === 'icons') { if (isNum(s.data[i])) html += `<div class="r"><i style="background:transparent"></i><span>${esc(wmoText(s.data[i]))}</span></div>`; continue; }
        if (s.type === 'strip') { for (const row of s.rows) html += `<div class="r"><i style="background:${withAlpha(colorOf(s.color, css), clamp((row.data[i] || 0) / 100, 0.15, 1))}"></i><span>${esc(row.label)}</span><b>${esc(fmtPct(row.data[i]))}</b></div>`; continue; }
        if (s.noTip) continue;
        const v = s.data[i]; if (!isNum(v) && !s.tipFmt) continue;
        const col = colorOf(s.color, css), YY = s.axis === 'right' ? r.Y2 : r.Y;
        if ((s.type === 'line' || s.type === 'area') && !s.hidden && isNum(v) && YY) { o.fillStyle = col; o.beginPath(); o.arc(x, YY(v), 3.5, 0, 6.283); o.fill(); o.strokeStyle = css.surface; o.lineWidth = 1.5; o.stroke(); }
        const txt = s.tipFmt ? s.tipFmt(i) : (s.fmt ? s.fmt(v) : fmtN(v, 1));
        if (txt == null || txt === '') continue;
        html += `<div class="r"><i style="background:${col}"></i><span>${esc(s.label || '')}</span><b>${esc(txt)}</b></div>`;
      }
    }
    this.tip.innerHTML = html; this.tip.hidden = false; this.placeTip();
  }
  placeTip() {
    if (this.pickIdx == null) return;
    const x = this.X(this.cfg.times[this.pickIdx]) - this.scroll.scrollLeft, tw = this.tip.offsetWidth, cw = this.CW;
    let left = x + 14; if (left + tw > cw - 4) left = x - tw - 14; if (left < 4) left = 4;
    this.tip.style.left = left + 'px'; this.tip.style.top = TC.top + 'px';
  }
}
