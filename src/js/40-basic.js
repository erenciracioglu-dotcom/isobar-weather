/* =====================================================================
   Basic mode: hero, alerts, nowcast, hourly, 15-day, outlook, details,
   activity planner, footer
   ===================================================================== */
function isobarSvg() {
  let paths = '';
  for (let k = 0; k < 8; k++) {
    const R = 60 + k * 44; let d = '';
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * Math.PI * 2, r = R * (1 + 0.07 * Math.sin(3 * a + k * 0.7) + 0.045 * Math.sin(5 * a - k * 1.3));
      d += (i ? 'L' : 'M') + (Math.cos(a) * r * 1.22).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1);
    }
    paths += `<path d="${d}Z"/>`;
  }
  return `<svg class="hero-iso" viewBox="-430 -430 860 860" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.3">${paths}</g><text x="0" y="6" text-anchor="middle" fill="rgba(255,255,255,.16)" font-size="26" font-weight="700" font-family="sans-serif">L</text></svg>`;
}

const HeroFX = {
  cv: null, ctx: null, kind: '', parts: [], raf: 0, visible: true, w: 0, h: 0, flash: 0,
  init() {
    this.cv = $('#heroFx'); this.ctx = this.cv.getContext('2d');
    if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe($('#hero'));
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { this.visible = es[0].isIntersecting; this.loop(); }).observe($('#hero'));
    document.addEventListener('visibilitychange', () => this.loop());
    this.resize();
  },
  resize() {
    const r = $('#hero').getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (Math.abs(r.width - this.w) < 1 && Math.abs(r.height - this.h) < 1) return;
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed(); this.loop();
  },
  set(kind) { if (kind === this.kind) return; this.kind = kind; this.seed(); this.loop(); },
  active() { return S.anim && !REDUCED && this.visible && !document.hidden && this.kind && this.kind !== 'loading'; },
  seed() {
    const { w, h, kind: k } = this, P = []; if (!w) return;
    const rnd = Math.random;
    if (k === 'rain' || k === 'storm') for (let i = 0; i < Math.round(w * h / 2400); i++) P.push({ x: rnd() * w, y: rnd() * h, l: 9 + rnd() * 13, v: 10 + rnd() * 8, a: 0.16 + rnd() * 0.3 });
    else if (k === 'snow') for (let i = 0; i < Math.round(w * h / 3600); i++) P.push({ x: rnd() * w, y: rnd() * h, r: 1 + rnd() * 2.3, v: 0.45 + rnd() * 1.1, ph: rnd() * 6.28, a: 0.5 + rnd() * 0.45 });
    else if (k === 'clear-night' || k === 'cloudy-night') for (let i = 0; i < Math.round(w * h / (k === 'clear-night' ? 1900 : 5200)); i++) P.push({ x: rnd() * w, y: rnd() * h * 0.8, r: 0.3 + rnd() * 1.25, ph: rnd() * 6.28, s: 0.5 + rnd() * 1.6 });
    else if (k === 'cloudy-day' || k === 'partly-day' || k === 'fog') for (let i = 0; i < (k === 'fog' ? 6 : 4); i++) P.push({ x: rnd() * w, y: (k === 'fog' ? h * 0.3 : -20) + rnd() * h * 0.55, r: 70 + rnd() * 100, v: 0.06 + rnd() * 0.14, a: k === 'fog' ? 0.15 : 0.1 });
    this.parts = P;
  },
  loop() {
    cancelAnimationFrame(this.raf);
    if (!this.active()) { this.frame(0, 0); return; }
    let last = performance.now();
    const step = now => { const dt = Math.min(50, now - last) / 16.67; last = now; this.frame(dt, now); if (this.active()) this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  },
  frame(dt, now) {
    const { ctx, w, h, kind } = this; if (!ctx || !w) return;
    ctx.clearRect(0, 0, w, h);
    if (kind === 'clear-day' || kind === 'partly-day') {
      const g = ctx.createRadialGradient(w * 0.86, h * 0.08, 0, w * 0.86, h * 0.08, Math.max(w, h) * 0.75);
      const pulse = 0.42 + 0.05 * Math.sin(now / 2400);
      g.addColorStop(0, `rgba(255,236,170,${pulse})`); g.addColorStop(0.35, 'rgba(255,220,140,.1)'); g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (kind === 'rain' || kind === 'storm') {
      ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      for (const p of this.parts) {
        p.y += p.v * dt; p.x -= p.v * 0.16 * dt;
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * (w + 40); }
        ctx.strokeStyle = `rgba(215,232,255,${p.a})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * 0.16, p.y + p.l); ctx.stroke();
      }
    } else if (kind === 'snow') {
      for (const p of this.parts) {
        p.y += p.v * dt; p.x += Math.sin(p.ph + now / 1300) * 0.35 * dt;
        if (p.y > h + 6) { p.y = -6; p.x = Math.random() * w; }
        ctx.fillStyle = `rgba(255,255,255,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
    } else if (kind === 'clear-night' || kind === 'cloudy-night') {
      for (const p of this.parts) { const a = 0.3 + 0.7 * Math.abs(Math.sin(p.ph + now * 0.0009 * p.s)); ctx.fillStyle = `rgba(255,255,240,${a * 0.85})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    } else if (kind === 'cloudy-day' || kind === 'partly-day' || kind === 'fog') {
      for (const p of this.parts) {
        p.x += p.v * dt; if (p.x - p.r > w) p.x = -p.r;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,255,255,${p.a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    if (kind === 'storm' && dt) {
      if (Math.random() < 0.0035 * dt) this.flash = 1;
      if (this.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${this.flash * 0.32})`; ctx.fillRect(0, 0, w, h); this.flash -= 0.07 * dt; }
    }
  }
};

function renderHero() {
  const el = $('#hero'), inner = $('#heroInner'), o = App.data;
  el.classList.toggle('compact', App.mode === 'advanced' && !!o);
  if (!o) {
    el.dataset.sky = 'loading';
    inner.innerHTML = `<div class="hero-loading">${esc(App.loc ? t('loading') : t('locating'))}</div>`;
    HeroFX.set('loading'); return;
  }
  const c = curOf(o), i0 = hourIdx(o), di = dayIdx(o), D = o.d;
  const code = isNum(c.code) ? c.code : o.h.code[i0], isDay = isNum(c.isDay) ? c.isDay : o.h.isDay[i0];
  const sky = skyFor(code, isDay); el.dataset.sky = sky;
  const compact = App.mode === 'advanced', fav = App.loc && Favs.has(App.loc);
  const src = o.provider + (o.provider === 'Open-Meteo' && o.model !== 'best_match' ? ' · ' + modelLabel(o.model) : '');
  const canSpeak = 'speechSynthesis' in window;
  const localTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
  const tzNote = o.tz && localTz && TZ.offsetMin(Date.now()) !== -new Date().getTimezoneOffset() ? ' · ' + t('localTime') : '';
  inner.innerHTML = `
    <div class="hero-top"><span>${esc(fmtDate(Date.now()))} · ${esc(fmtTime(Date.now()))}${esc(tzNote)}</span><span class="hero-src">${esc(src)} · ${esc(ago(o.fetchedAt))}</span></div>
    <div class="hero-main">
      <div class="hero-l">
        <div class="hero-temp num" aria-label="${esc(F.t(c.temp))}">${esc(fmtN(Units.t(c.temp), 0))}<span class="u">°${esc(S.units.temp)}</span></div>
        <div class="hero-cond">${esc(wmoText(code))}</div>
        <div class="hero-meta">${esc(t('feelsLike', { v: F.t(c.feels) }))} · ${esc(t('hiLo', { h: F.t(D.tmax[di]), l: F.t(D.tmin[di]) }))}</div>
      </div>
      <div class="hero-icon">${wxIcon(code, isDay, compact ? 88 : 140, true)}</div>
    </div>
    ${compact ? '' : `<p class="hero-sum">${esc(heroSummary(o))}</p>`}
    <div class="hero-foot">
      <span class="hero-coords">${esc(fmtN(o.lat, 3))}°, ${esc(fmtN(o.lon, 3))}°${isNum(o.elev) ? ' · ' + esc(F.ht(o.elev)) : ''}</span>
      <span class="hero-btns">
        ${canSpeak ? `<button class="hero-btn" type="button" data-act="speak" aria-label="${esc(t('readAloud'))}" title="${esc(t('readAloud'))}">${ui(App.speaking ? 'stop' : 'speaker')}</button>` : ''}
        <button class="hero-btn" type="button" data-act="share" aria-label="${esc(t('share'))}" title="${esc(t('share'))}">${ui('share')}</button>
        <button class="hero-btn${fav ? ' on' : ''}" type="button" data-act="fav" aria-pressed="${fav}" aria-label="${esc(t(fav ? 'unfav' : 'fav'))}" title="${esc(t(fav ? 'unfav' : 'fav'))}">${ui('star', 'i' + (fav ? ' fill' : ''))}</button>
      </span>
    </div>`;
  HeroFX.set(sky);
}

function renderAlerts() {
  const el = $('#alerts'), A = buildAlerts(App.data, App.aq); App.alerts = A;
  if (!A.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<div class="alerts" role="list" aria-label="${esc(t('headsUp'))}">${A.map((a, i) => `<button type="button" role="listitem" class="al s${a.sev}" data-alert="${i}"><span class="sev"></span>${ui(a.icon)}<span><b>${esc(a.title)}</b><small>${esc(a.when)}</small></span></button>`).join('')}</div>`;
}

/* Next-2-hours card. When no precipitation is expected the card is hidden and the
   message moves to the Outlook card instead (App.nc2h = 'dry'). */
function hourlyDry2h(o) {
  const H = o.h, i0 = hourIdx(o);
  const r = [i0 + 1, i0 + 2].filter(i => i < H.t.length);
  return r.length === 2 && r.every(i => !(H.precip[i] >= 0.1) && !(H.pop[i] >= 40) && !isPrecipCode(H.code[i]));
}
function renderNowcast() {
  const el = $('#nowcast'), o = App.data, m = o.m15;
  const hide = () => { el.hidden = true; el.innerHTML = ''; };
  App.nc2h = null;
  if (!m || Date.now() - o.fetchedAt > 45 * 60e3) { if (hourlyDry2h(o)) App.nc2h = 'dry'; hide(); return; }
  const now = Date.now(), idx = range(0, m.t.length).filter(i => m.t[i] > now - 15 * 60e3 && m.t[i] <= now + 2 * HOUR + 60e3);
  if (idx.length < 4) { if (hourlyDry2h(o)) App.nc2h = 'dry'; hide(); return; }
  const vals = idx.map(i => (isNum(m.precip[i]) ? m.precip[i] : 0)), wet = v => v >= 0.05;
  if (!vals.some(wet)) { App.nc2h = 'dry'; hide(); return; }
  App.nc2h = 'wet'; el.hidden = false;
  const isSnow = m.snow && idx.some(i => isNum(m.snow[i]) && m.snow[i] > 0), w = t(isSnow ? 'ncSnow' : 'ncRain');
  let text; const k0 = vals.findIndex(wet), start = m.t[idx[k0]] - 15 * 60e3;
  if (start <= now + 5 * 60e3) { const ke = vals.findIndex((v, k) => k > k0 && !wet(v) && m.t[idx[k]] > now); text = ke >= 0 ? t('ncUntil', { w, time: fmtTime(m.t[idx[ke]] - 15 * 60e3) }) : t('ncContinue', { w }); }
  else text = t('ncStart', { w, n: Math.max(5, Math.round((start - now) / 60e3 / 5) * 5), time: fmtTime(start) });
  const maxV = Math.max(0.4, ...vals);
  el.innerHTML = `<section class="card"><div class="card-h"><h2 class="card-t">${ui('drop')}${esc(t('next2h'))}</h2><span class="muted" style="font-size:12px">${esc(t('peakRate', { v: F.p(Math.max(...vals) * 4) + '/' + t('hShort') }))}</span></div>
    <p class="nc-text">${esc(text)}</p>
    <div class="nc-bars" style="--n:${vals.length}">${vals.map(v => `<i class="${wet(v) ? 'w' : ''}" style="height:${Math.max(4, v / maxV * 100).toFixed(0)}%"></i>`).join('')}</div>
    <div class="nc-axis"><span>${esc(t('now'))}</span><span>+30</span><span>+60</span><span>+90</span><span>+120 ${esc(t('minShort'))}</span></div></section>`;
}

/* A slot starting at index a covers the hours that end at a+1 … a+span (sums and codes describe the preceding hour). */
function slotStats(o, a, span) {
  const H = o.h, r = range(a + 1, Math.min(H.t.length, a + 1 + span));
  if (!r.length) return { code: H.code[a], pop: null, pr: null, ws: H.ws[a], wd: H.wd[a], wg: H.wg[a], isDay: H.isDay[a] };
  const inst = [a, ...r.slice(0, -1)];
  return { code: span === 1 ? H.code[r[0]] : worstCode(pick(H.code, r)), pop: maxOf(pick(H.pop, r)), pr: sumOf(pick(H.precip, r)), ws: meanOf(pick(H.ws, inst)), wd: vecMeanDir(pick(H.ws, inst), pick(H.wd, inst)), wg: maxOf(pick(H.wg, r)), isDay: H.isDay[r[Math.floor((r.length - 1) / 2)]] ?? H.isDay[a] };
}
function renderHourly() {
  const el = $('#hourly'), o = App.data, H = o.h, step = S.hourStep, i0 = hourIdx(o), c = curOf(o);
  const slots = [];
  if (step === 1) { for (let i = i0; i < H.t.length - 1 && slots.length < 49; i++) slots.push(i); }
  else {
    slots.push(i0); let i = i0 + 1;
    while (i < H.t.length && TZ.parts(H.t[i]).h % 3 !== 0) i++;
    for (; i < H.t.length - 1 && slots.length < 41; i += 3) slots.push(i);
  }
  const n = slots.length, W = 58;
  const tempAt = (a, k) => (k === 0 && isNum(c.temp) ? c.temp : H.temp[a]);
  const temps = slots.map(tempAt).filter(isNum);
  const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
  const Y = v => 46 - (v - lo) / span * 27;
  let path = ''; const labels = [], seps = [], rows = [[], [], [], []];
  slots.forEach((a, k) => {
    const tt = H.t[a], key = TZ.parts(tt).key, newDay = k > 0 && TZ.parts(H.t[slots[k - 1]]).key !== key;
    if (newDay) seps.push(k);
    const ds = newDay ? ' ds' : '';
    const len = k === 0 && step === 3 ? Math.max(1, (slots[1] ?? a + 1) - a) : step;
    const st = slotStats(o, a, len);
    const code = k === 0 && isNum(c.code) ? c.code : st.code, isDay = k === 0 && isNum(c.isDay) ? c.isDay : st.isDay;
    const wd = k === 0 && isNum(c.wd) ? c.wd : H.wd[a], ws = k === 0 && isNum(c.ws) ? c.ws : st.ws;
    rows[0].push(`<div class="hc${ds}">${newDay ? `<em>${esc(fmtWeekday(tt))}</em>` : ''}${esc(k === 0 ? t('now') : fmtHour(tt))}</div>`);
    rows[1].push(`<div class="hc${ds}" title="${esc(wmoText(code))}">${wxIcon(code, isDay ?? 1, 30)}</div>`);
    rows[2].push(`<div class="hc hp${ds}">${isNum(st.pop) && st.pop >= 10 ? `<b>${esc(fmtPct(st.pop))}</b>` : '<b class="z">·</b>'}${isNum(st.pr) && st.pr >= 0.1 ? `<small>${esc(F.p(st.pr, false))}</small>` : '<small>&nbsp;</small>'}</div>`);
    rows[3].push(`<div class="hc hw${ds}" title="${esc(compass(wd))}">${isNum(wd) ? windArrow(wd, 13) : ''}<span>${esc(F.w(ws, false))}</span></div>`);
    const v = tempAt(a, k);
    if (isNum(v)) { const x = k * W + W / 2, y = Y(v); path += (path ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); labels.push(`<circle cx="${x}" cy="${y.toFixed(1)}" r="2.7"/><text x="${x}" y="${(y - 7).toFixed(1)}" text-anchor="middle">${esc(F.t(v))}</text>`); }
  });
  const w = n * W;
  const svg = `<svg class="hs-svg" width="${w}" height="54" viewBox="0 0 ${w} 54" aria-hidden="true">${seps.map(k => `<line class="sep" x1="${k * W + 0.5}" x2="${k * W + 0.5}" y1="0" y2="54"/>`).join('')}<path class="tl" d="${path}"/>${labels.join('')}</svg>`;
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('clock')}${esc(step === 1 ? t('next48') : t('next5d3h'))}</h2>
    <div class="seg" role="group" aria-label="${esc(t('resolution'))}"><button type="button" data-hstep="1" aria-pressed="${step === 1}">${esc(t('step1h'))}</button><button type="button" data-hstep="3" aria-pressed="${step === 3}">${esc(t('step3h'))}</button></div></div>
    <div class="hs-scroll"><div class="hs" style="--n:${n};width:${w}px">
      <div class="hs-row">${rows[0].join('')}</div><div class="hs-row">${rows[1].join('')}</div>${svg}<div class="hs-row">${rows[2].join('')}</div><div class="hs-row">${rows[3].join('')}</div>
    </div></div>
    <div class="legend-row"><span>${esc(t('lgPop'))}</span><span>${esc(t('lgWind', { u: Units.label.w() }))}</span></div>`;
}

function renderDaily() {
  const el = $('#daily'), o = App.data, D = o.d, di = dayIdx(o);
  const idx = range(di, D.t.length).filter(i => isNum(D.tmax[i]) || isNum(D.tmin[i]));
  const view = S.dailyView;
  let note = '';
  if (o.filled && o.filled.days && o.filled.days.length) {
    const nums = o.filled.days.map(ms => idx.findIndex(i => D.t[i] === ms) + 1).filter(n => n > 0);
    if (nums.length) note = t('filledDays', { a: Math.min(...nums), b: Math.max(...nums) });
  } else if (idx.length < 15) note = t('daysAvailable', { n: idx.length, src: o.provider });
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('calendar')}${esc(t('forecast15'))}</h2>
    <div class="seg" role="group" aria-label="${esc(t('resolution'))}"><button type="button" data-dv="daily" aria-pressed="${view === 'daily'}">${esc(t('daily'))}</button><button type="button" data-dv="3h" aria-pressed="${view === '3h'}">${esc(t('threeHourly'))}</button></div></div>
    ${view === '3h' ? heatPicker() : ''}
    ${view === 'daily' ? dailyRows(o, idx) : matrix(o, idx)}
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <div class="trend-wrap"><div class="trend-h"><span class="card-t">${ui('chart')}${esc(t('trend15'))}</span><span class="trend-lg"><i class="lg-max"></i>${esc(t('maxShort'))}<i class="lg-min"></i>${esc(t('minShort2'))}<i class="lg-rain"></i>${esc(t('precipitation'))}</span></div><div class="trend" id="trendHost" role="img" aria-label="${esc(t('trend15'))}"></div></div>`;
  Trend.mount($('#trendHost'), o, idx);
}

/* 15-day trend: daily high/low band and daily precipitation, sized to fill the rest of the card */
const Trend = {
  ro: null, host: null, o: null, idx: null,
  mount(host, o, idx) {
    this.host = host; this.o = o; this.idx = idx;
    if (!this.ro && 'ResizeObserver' in window) this.ro = new ResizeObserver(debounce(() => this.draw(), 60));
    if (this.ro) { this.ro.disconnect(); this.ro.observe(host); }
    this.draw();
  },
  draw() {
    const host = this.host, o = this.o, idx = this.idx; if (!host || !host.isConnected || !o) return;
    const W = host.clientWidth, Hh = host.clientHeight; if (W < 60 || Hh < 60) return;
    const D = o.d, n = idx.length; if (n < 2) { host.innerHTML = ''; return; }
    const padL = 30, padR = 8, padT = 16, padB = 36, rainH = Math.min(70, Math.max(34, Hh * 0.24));
    const plotW = W - padL - padR, step = plotW / n, X = k => padL + step * (k + 0.5);
    const tTop = padT, tBot = Hh - padB - rainH - 14, rTop = tBot + 14, rBot = Hh - padB;
    const hi = maxOf(pick(D.tmax, idx)), lo = minOf(pick(D.tmin, idx));
    const ticks = niceTicks(Units.t(lo), Units.t(hi), Math.max(2, Math.floor((tBot - tTop) / 40)));
    const yLo = Math.min(Units.t(lo), ticks[0]), yHi = Math.max(Units.t(hi), ticks[ticks.length - 1]);
    const Y = v => tBot - (Units.t(v) - yLo) / Math.max(0.1, yHi - yLo) * (tBot - tTop);
    const Yu = u => tBot - (u - yLo) / Math.max(0.1, yHi - yLo) * (tBot - tTop);
    const pmax = Math.max(5, maxOf(pick(D.precip, idx)) || 0);
    const every = step >= 32 ? 1 : step >= 16 ? 2 : 3;
    let g = '';
    for (const tv of ticks) { const y = Yu(tv); if (y < tTop - 1 || y > tBot + 1) continue; g += `<line class="tr-grid" x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="tr-ax" x="${padL - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${esc(fmtN(tv, 0))}°</text>`; }
    idx.forEach((i, k) => { const wd = TZ.parts(D.t[i] + 12 * HOUR).wd; if (wd === 6 || wd === 0) g += `<rect class="tr-we" x="${(X(k) - step / 2).toFixed(1)}" y="${tTop - 6}" width="${step.toFixed(1)}" height="${(rBot - tTop + 6).toFixed(1)}"/>`; });
    const pts = (arr) => idx.map((i, k) => (isNum(arr[i]) ? [X(k), Y(arr[i])] : null)).filter(Boolean);
    const up = pts(D.tmax), dn = pts(D.tmin);
    if (up.length > 1 && dn.length > 1) g += `<path class="tr-band" d="M${up.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}L${dn.slice().reverse().map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}Z"/>`;
    g += `<polyline class="tr-max" points="${up.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/><polyline class="tr-min" points="${dn.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>`;
    idx.forEach((i, k) => {
      const x = X(k);
      if (isNum(D.tmax[i])) { g += `<circle class="tr-dmax" cx="${x.toFixed(1)}" cy="${Y(D.tmax[i]).toFixed(1)}" r="2.6"/>`; if (k % every === 0) g += `<text class="tr-v" x="${x.toFixed(1)}" y="${(Y(D.tmax[i]) - 7).toFixed(1)}" text-anchor="middle">${esc(F.t(D.tmax[i]))}</text>`; }
      if (isNum(D.tmin[i])) { g += `<circle class="tr-dmin" cx="${x.toFixed(1)}" cy="${Y(D.tmin[i]).toFixed(1)}" r="2.6"/>`; if (k % every === 0) g += `<text class="tr-v tr-vmin" x="${x.toFixed(1)}" y="${(Y(D.tmin[i]) + 14).toFixed(1)}" text-anchor="middle">${esc(F.t(D.tmin[i]))}</text>`; }
      const p = D.precip[i];
      if (isNum(p) && p > 0.05) {
        const bh = Math.max(2, p / pmax * (rBot - rTop - 16)), bw = Math.min(18, step * 0.55);
        g += `<rect class="tr-rain" x="${(x - bw / 2).toFixed(1)}" y="${(rBot - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2"/>`;
        if (p >= 1 && step >= 22) g += `<text class="tr-pv" x="${x.toFixed(1)}" y="${(rBot - bh - 3).toFixed(1)}" text-anchor="middle">${esc(fmtN(Units.p(p), S.units.precip === 'in' ? 1 : 0))}</text>`;
      }
      if (k % every === 0) {
        const ms = D.t[i] + 6 * HOUR, day = k === 0 && step * every >= 40 ? t('today') : step * every >= 30 ? fmtWeekday(ms) : wd2(ms);
        g += `<text class="tr-day" x="${x.toFixed(1)}" y="${Hh - 20}" text-anchor="middle">${esc(day)}</text><text class="tr-date" x="${x.toFixed(1)}" y="${Hh - 6}" text-anchor="middle">${esc(fmtDM(ms))}</text>`;
      }
    });
    g += `<line class="tr-base" x1="${padL}" x2="${W - padR}" y1="${rBot + 0.5}" y2="${rBot + 0.5}"/>`;
    host.innerHTML = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" aria-hidden="true">${g}</svg>`;
  }
};
function dailyRows(o, idx) {
  const D = o.d, di = dayIdx(o), gmin = minOf(pick(D.tmin, idx)), gmax = maxOf(pick(D.tmax, idx)), span = Math.max(1, gmax - gmin), nowT = curOf(o).temp;
  return `<div class="drows">${idx.map(i => {
    const a = isNum(D.tmin[i]) ? (D.tmin[i] - gmin) / span * 100 : 0, b = isNum(D.tmax[i]) ? (D.tmax[i] - gmin) / span * 100 : 100;
    const dot = i === di && isNum(nowT) ? `<b style="left:${clamp((nowT - gmin) / span * 100, 0, 100).toFixed(1)}%"></b>` : '';
    const pop = D.popMax[i], pr = D.precip[i];
    const popTxt = isNum(pop) && pop >= 20 ? fmtPct(pop) : (isNum(pr) && pr >= 1 ? F.p(pr, false) : '');
    return `<details class="dd" data-day="${i}"><summary>
      <span class="d-day"><b>${esc(dayName(D.t[i]))}</b><small>${esc(fmtDayMonth(D.t[i] + 6 * HOUR))}</small></span>
      <span class="d-ic" title="${esc(wmoText(D.code[i]))}">${wxIcon(D.code[i], 1, 32)}</span>
      <span class="d-pop">${esc(popTxt)}</span>
      <span class="d-min num">${esc(F.t(D.tmin[i]))}</span>
      <span class="tbar"><i style="left:${a.toFixed(1)}%;right:${(100 - b).toFixed(1)}%;background:linear-gradient(90deg,${rgbCss(scaleRGB('temp', D.tmin[i]))},${rgbCss(scaleRGB('temp', D.tmax[i]))})"></i>${dot}</span>
      <span class="d-max num">${esc(F.t(D.tmax[i]))}</span>${ui('chev', 'i chev')}
    </summary><div class="d-exp" data-exp="${i}"></div></details>`;
  }).join('')}</div>`;
}
function dayDetail(o, i) {
  const D = o.d, H = o.h, now = Date.now();
  const cells = [0, 3, 6, 9, 12, 15, 18, 21].map(hh => {
    const k = slotIndex(o, D.t[i], hh);
    if (k == null) return '<div class="ds-c empty"></div>';
    const st = slotStats(o, k, 3);
    return `<div class="ds-c${H.t[k] + 3 * HOUR <= now ? ' past' : ''}" title="${esc(wmoText(st.code))}"><span>${esc(fmtHour(H.t[k]))}</span>${wxIcon(st.code, st.isDay ?? 1, 28)}<b>${esc(F.t(H.temp[k]))}</b><small>${isNum(st.pr) && st.pr >= 0.1 ? esc(F.p(st.pr, false)) : ''}</small><em>${isNum(H.wd[k]) ? windArrow(H.wd[k], 11) : ''}${esc(F.w(st.ws, false))}</em></div>`;
  }).join('');
  const facts = [
    [t('condition'), wmoText(D.code[i])],
    [t('precipitation'), isNum(D.precip[i]) ? F.p(D.precip[i]) + (isNum(D.precipHours[i]) && D.precipHours[i] > 0 ? ' · ' + t('hoursN', { n: fmtN(D.precipHours[i], 0) }) : '') + (isNum(D.popMax[i]) ? ' · ' + fmtPct(D.popMax[i]) : '') : '–'],
    isNum(D.snow[i]) && D.snow[i] > 0 ? [t('snowfall'), F.sn(D.snow[i])] : null,
    [t('wind'), `${F.w(D.wsMax[i])} ${compass(D.wdDom[i])} · ${t('gustsV', { v: F.w(D.wgMax[i]) })}`],
    [t('feelsRange'), `${F.t(D.fmin[i])} … ${F.t(D.fmax[i])}`],
    [t('uvMax'), isNum(D.uvMax[i]) ? fmtN(D.uvMax[i], 0) + ' · ' + uvCat(D.uvMax[i]).k : '–'],
    [t('sunriseSunset'), `${isNum(D.sunrise[i]) ? fmtTime(D.sunrise[i]) : '–'} / ${isNum(D.sunset[i]) ? fmtTime(D.sunset[i]) : '–'}`],
    isNum(D.sunshine[i]) ? [t('sunshine'), fmtDur(D.sunshine[i])] : null
  ].filter(Boolean);
  return `<div class="ds-grid">${cells}</div><dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
function hourLabel(h) { if (S.units.time === '12') { const x = h % 12 || 12; return x + (h < 12 ? 'a' : 'p'); } return String(h).padStart(2, '0'); }
/* 3-hourly heatmap colouring: temperature, rain (3-hour total as an hourly rate) or mean wind speed */
const HEATMAPS = {
  temp: { scale: 'temp', val: (st, tv) => tv, alpha: 0.26, show: v => isNum(v) },
  rain: { scale: 'precip', val: st => (isNum(st.pr) ? st.pr / 3 : null), alpha: 0.42, show: v => isNum(v) && v >= 0.034 },
  wind: { scale: 'wind', val: st => st.ws, alpha: 0.34, show: v => isNum(v) }
};
/* shown only in the 3-hourly view: what the cell colours follow */
function heatPicker() {
  const cur = HEATMAPS[S.heatmap] ? S.heatmap : 'temp';
  return `<div class="hm-pick"><span>${esc(t('hmPick'))}</span><div class="seg" role="group" aria-label="${esc(t('heatmapLbl'))}">${['temp', 'rain', 'wind'].map(x => `<button type="button" data-heatmap="${x}" aria-pressed="${cur === x}">${esc(t('hm_' + x))}</button>`).join('')}</div></div>`;
}
function heatLegend(kind, vals) {
  const hm = HEATMAPS[kind], v = vals.filter(x => hm.show(x));
  if (!v.length) return `<span class="hm-none">${esc(t('hmNone_' + kind))}</span>`;
  const lo = kind === 'temp' ? Math.min(...v) : (kind === 'rain' ? 0.034 : 0), hi = Math.max(...v, lo + (kind === 'temp' ? 4 : kind === 'rain' ? 1 : 20));
  const stops = range(0, 7).map(k => { const x = lo + (hi - lo) * k / 6; return rgbCss(scaleRGB(hm.scale, x), Math.min(1, hm.alpha * 2.2)) + ' ' + (k / 6 * 100).toFixed(0) + '%'; });
  const fmt = x => (kind === 'temp' ? F.t(x) : kind === 'rain' ? F.p(x * 3) : F.w(x));
  return `<span class="hm-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></span><span class="hm-ticks"><span>${esc(fmt(lo))}</span><span>${esc(fmt((lo + hi) / 2))}</span><span>${esc(fmt(hi))}</span></span>`;
}
function matrix(o, idx) {
  const D = o.d, H = o.h, hours = [0, 3, 6, 9, 12, 15, 18, 21], now = Date.now(), di = dayIdx(o);
  const kind = HEATMAPS[S.heatmap] ? S.heatmap : 'temp', hm = HEATMAPS[kind], seen = [];
  const rows = idx.map(i => `<tr><th scope="row">${esc(i === di ? t('today') : fmtWeekday(D.t[i] + 6 * HOUR))}<small>${esc(fmtDayMonth(D.t[i] + 6 * HOUR))}</small></th>${hours.map(hh => {
    const k = slotIndex(o, D.t[i], hh); if (k == null) return '<td></td>';
    const st = slotStats(o, k, 3), tv = H.temp[k], hv = hm.val(st, tv);
    if (H.t[k] + 3 * HOUR > now) seen.push(hv);
    const bg = hm.show(hv) ? `background:${rgbCss(scaleRGB(hm.scale, hv), hm.alpha)}` : '';
    const rain = isNum(st.pr) && st.pr >= 0.05 ? `<span class="mx-r">${esc(F.p(st.pr, false))}</span>` : '<span class="mx-r z">0</span>';
    const wind = isNum(st.ws) ? `<span class="mx-w">${isNum(st.wd) ? windArrow(st.wd, 10) : ''}${esc(F.w(st.ws, false))}</span>` : '<span class="mx-w"></span>';
    const tip = `${fmtDate(H.t[k])} ${fmtTime(H.t[k])} · ${wmoText(st.code)} · ${F.t(tv)} · ${t('precipitation')} ${F.p(st.pr || 0)}${isNum(st.pop) ? ' (' + fmtPct(st.pop) + ')' : ''} · ${t('wind')} ${F.w(st.ws)} ${compass(st.wd)}, ${t('gustsV', { v: F.w(st.wg) })}`;
    return `<td class="${H.t[k] + 3 * HOUR <= now ? 'past' : ''}" style="${bg}" title="${esc(tip)}">${wxIcon(st.code, st.isDay ?? (hh >= 6 && hh < 18 ? 1 : 0), 22)}<b>${esc(F.t(tv))}</b>${rain}${wind}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="mx-scroll"><table class="mx"><thead><tr><th></th>${hours.map(hh => `<th scope="col">${esc(hourLabel(hh))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="hm-legend"><span class="hm-t">${esc(t('hmColours', { v: t('hm_' + kind).toLocaleLowerCase(LOCALE) }))}</span>${heatLegend(kind, seen)}</div>
    <p class="note">${esc(t('mxNote', { p: Units.label.p(), w: Units.label.w() }))}</p>`;
}

function renderOutlook() {
  const el = $('#outlook'), list = buildOutlook(App.data);
  el.hidden = !list.length;
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('chart')}${esc(t('outlook'))}</h2></div><ul class="ol">${list.map(x => `<li class="${x.tone}"><span class="oi">${ui(x.icon)}</span><span>${esc(x.text)}</span></li>`).join('')}</ul>`;
}

/* ---------- detail cards ---------- */
/* Compass: cardinal letters sit outside the tick ring so the arrow never crosses them.
   The arrow points where the wind is blowing to; its tail marks where it comes from. */
function compassSvg(deg) {
  const C = 44; let ticks = '';
  for (let k = 0; k < 36; k++) { const a = k * 10 * Math.PI / 180, r1 = k % 9 === 0 ? 24 : 27.5; ticks += `<line x1="${(C + Math.sin(a) * r1).toFixed(1)}" y1="${(C - Math.cos(a) * r1).toFixed(1)}" x2="${(C + Math.sin(a) * 31).toFixed(1)}" y2="${(C - Math.cos(a) * 31).toFixed(1)}"/>`; }
  const L = COMPASS[LANG], labels = [[0, L[0]], [90, L[4]], [180, L[8]], [270, L[12]]].map(([d, s]) => { const a = d * Math.PI / 180; return `<text x="${(C + Math.sin(a) * 39).toFixed(1)}" y="${(C - Math.cos(a) * 39 + 3.3).toFixed(1)}">${s}</text>`; }).join('');
  const arrow = isNum(deg) ? `<g transform="rotate(${((deg + 180) % 360).toFixed(0)} ${C} ${C})"><line class="cmp-shaft" x1="${C}" y1="${C - 15}" x2="${C}" y2="${C + 19}"/><path class="cmp-arr" d="M${C} ${C - 24}L${C + 6} ${C - 11}L${C} ${C - 14}L${C - 6} ${C - 11}Z"/><circle class="cmp-tail" cx="${C}" cy="${C + 20}" r="3.2"/></g>` : '';
  return `<svg class="cmp" viewBox="0 0 88 88" width="84" height="84" aria-hidden="true"><g class="cmp-ticks">${ticks}</g>${labels}${arrow}</svg>`;
}
function inkOn(hex) { if (!hex || hex[0] !== '#') return '#fff'; const [r, g, b] = hexRGB(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#14202a' : '#fff'; }
function sunArcSvg(rise, set, now) {
  const ok = isNum(rise) && isNum(set) && set > rise, f = ok ? clamp((now - rise) / (set - rise), 0, 1) : null, up = ok && now > rise && now < set;
  const ang = Math.PI * (1 - (f ?? 0)), x = 70 + Math.cos(ang) * 60, y = 56 - Math.sin(ang) * 46;
  return `<svg class="sunarc" viewBox="0 0 140 64" width="100%" height="60" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><line class="hz" x1="2" x2="138" y1="56.5" y2="56.5"/><path class="arc" d="M10 56A60 46 0 0 1 130 56"/>${ok && f > 0 ? `<path class="arc-done" d="M10 56A60 46 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}"/>` : ''}${up ? `<circle class="sun-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>` : ''}</svg>`;
}
function gaugeSvg(v, min, max, color) {
  const f = isNum(v) ? clamp((v - min) / (max - min), 0, 1) : null, a = Math.PI * (1 - (f ?? 0)), x = 50 + Math.cos(a) * 38, y = 48 - Math.sin(a) * 38;
  return `<svg class="gauge" viewBox="0 0 100 54" width="100%" height="52" aria-hidden="true"><path class="g-bg" d="M12 48A38 38 0 0 1 88 48"/>${f != null && f > 0.005 ? `<path class="g-fg" style="stroke:${color}" d="M12 48A38 38 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}"/>` : ''}${f != null ? `<circle class="g-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>` : ''}</svg>`;
}
const hbar = (f, color) => `<div class="hbar"><i style="width:${(clamp(f, 0, 1) * 100).toFixed(1)}%;background:${color}"></i></div>`;
const gradBar = (f, grad) => `<div class="gbar" style="background:${grad}">${isNum(f) ? `<b style="left:${(clamp(f, 0, 1) * 100).toFixed(1)}%"></b>` : ''}</div>`;
function dcard(icon, title, big, sub, viz = '', attrs = '', bigCls = '') {
  const tag = attrs ? 'button' : 'article';
  return `<${tag} class="dc"${attrs ? ' type="button" ' + attrs : ''}><span class="h3">${ui(icon)}${esc(title)}</span><span class="big${bigCls ? ' ' + bigCls : ''}">${big}</span>${sub ? `<span class="sub">${sub}</span>` : ''}${viz ? `<span class="viz">${viz}</span>` : ''}</${tag}>`;
}
function renderDetails() {
  const o = App.data, c = curOf(o), H = o.h, D = o.d, i0 = hourIdx(o), di = dayIdx(o), now = Date.now(), cards = [];
  const diff = isNum(c.feels) && isNum(c.temp) ? c.feels - c.temp : 0;
  cards.push(dcard('thermo', t('feelsLikeT'), esc(F.t(c.feels)), esc(diff <= -2 ? t('feelsWind') : diff >= 2 ? t('feelsHumid') : t('feelsSame')) + `<br>${esc(t('wetBulb'))}: ${esc(F.t1(H.wetbulb[i0]))}`, hbar((Units.t(c.feels) - Units.t(-20)) / (Units.t(45) - Units.t(-20)), rgbCss(scaleRGB('temp', c.feels)))));
  const b = isNum(c.ws) ? bft(c.ws) : null;
  cards.push(dcard('wind', t('wind'), `${esc(F.w(c.ws, false))}<small>${esc(Units.label.w())}</small>`, `${esc(t('fromDir', { d: compass(c.wd), deg: fmtN(c.wd, 0) }))}<br>${esc(t('gustsV', { v: F.w(c.wg) }))}${isNum(b) ? ' · ' + esc(t('bft' + b)) : ''}${LANG === 'tr' && isNum(c.wd) ? '<br>' + esc(trWind(c.wd)) : ''}`, `<div class="row2">${compassSvg(c.wd)}</div>`));
  cards.push(dcard('drop', t('humidity'), esc(fmtPct(c.rh)), `${esc(t('dewPoint'))}: ${esc(F.t(c.dew ?? H.dew[i0]))}<br>${esc(dewComfort(c.dew ?? H.dew[i0]))}`, hbar((c.rh || 0) / 100, 'var(--c-rh)')));
  const uvNow = H.uv[i0], uvc = uvCat(D.uvMax[di]);
  const uvHours = dayHours(o, D.t[di]).filter(j => isNum(H.uv[j]) && H.uv[j] >= 3);
  const uvTxt = uvHours.length ? t('uvProtect', { a: fmtTime(H.t[uvHours[0]] - HOUR), b: fmtTime(H.t[uvHours[uvHours.length - 1]]) }) : t('uvNone');
  cards.push(dcard('sun', t('uv'), `${esc(fmtN(uvNow, 0))}<small>${esc(uvCat(uvNow).k)}</small>`, `${esc(t('todayMax', { v: fmtN(D.uvMax[di], 0) }))} · ${esc(uvc.k)}<br>${esc(uvTxt)}`, gradBar((uvNow || 0) / 12, 'linear-gradient(90deg,#3a9d50,#c9a400 30%,#e8741c 55%,#d43a2b 75%,#9b3fb5)')));
  const rise = D.sunrise[di], set = D.sunset[di], dl = D.daylight[di], dlPrev = D.daylight[di - 1];
  const delta = isNum(dl) && isNum(dlPrev) ? Math.round(dl - dlPrev) : null;
  const deltaTxt = isNum(delta) ? t('dlChange', { v: (delta >= 0 ? '+' : '−') + (Math.abs(delta) >= 60 ? Math.floor(Math.abs(delta) / 60) + ' ' + t('minShort') + ' ' : '') + (Math.abs(delta) % 60) + ' s' }) : '';
  const nextIsSet = isNum(set) && now < set && isNum(rise) && now > rise;
  cards.push(dcard('sun', nextIsSet ? t('sunset') : t('sunrise'), esc(nextIsSet ? fmtTime(set) : (isNum(rise) && now < rise ? fmtTime(rise) : (isNum(D.sunrise[di + 1]) ? fmtTime(D.sunrise[di + 1]) : '–'))), `${esc(nextIsSet ? t('sunrise') : t('sunset'))}: ${esc(nextIsSet ? fmtTime(rise) : (isNum(set) ? fmtTime(set) : '–'))}<br>${esc(t('daylight'))}: ${esc(fmtDur(dl))}${deltaTxt ? ' · ' + esc(deltaTxt) : ''}`, sunArcSvg(rise, set, now)));
  const p0 = H.pmsl[Math.max(0, i0 - 3)], p1 = isNum(c.pmsl) ? c.pmsl : H.pmsl[i0], dp = isNum(p0) && isNum(p1) ? p1 - p0 : null;
  const trend = !isNum(dp) ? '' : dp > 1 ? t('pRising') : dp < -1 ? t('pFalling') : t('pSteady');
  cards.push(dcard('gauge', t('pressure'), `${esc(F.pr(p1, false))}<small>${esc(Units.label.pr())}</small>`, `${esc(trend)}${isNum(dp) ? ' (' + esc((dp >= 0 ? '+' : '−') + fmtN(Math.abs(Units.pr(1013 + dp) - Units.pr(1013)), Units.dec.pr() + 1)) + ' / 3 ' + esc(t('hShort')) + ')' : ''}`, gaugeSvg(p1, 970, 1050, 'var(--c-press)')));
  const vis = H.vis[i0];
  cards.push(dcard('eye', t('visibility'), `${esc(F.d(vis, false))}<small>${esc(Units.label.d())}</small>`, esc(visCat(vis)), hbar(isNum(vis) ? Math.log10(1 + vis / 100) / Math.log10(1 + 300) : 0, 'var(--c-cloud)')));
  const next24 = sumOf(pick(H.precip, range(i0 + 1, Math.min(H.t.length, i0 + 25)))), last24 = sumOf(pick(H.precip, range(Math.max(0, i0 - 23), i0 + 1)));
  cards.push(dcard('umbrella', t('precipitation'), esc(F.p(next24 ?? 0)), `${esc(t('next24'))}<br>${esc(t('last24', { v: F.p(last24 ?? 0) }))}`, hbar((next24 || 0) / 25, 'var(--c-rain)')));
  if (App.aq && App.aq.cur) {
    const v = S.aqi === 'us' ? App.aq.cur.us : App.aq.cur.eu, cat = aqiCat(v, S.aqi), mp = mainPollutant(App.aq.cur);
    cards.push(dcard('leaf', t('airQuality'), `${esc(fmtN(v, 0))}<small>${esc(S.aqi === 'us' ? 'US AQI' : 'EAQI')}</small>`, `<span class="pill" style="background:${cat.c};color:${inkOn(cat.c)}">${esc(cat.k)}</span>${mp ? '<br>' + esc(t('mainPoll', { p: POLL_NAMES[mp.k] })) : ''}`, gradBar(isNum(v) ? v / (S.aqi === 'us' ? 300 : 100) : null, S.aqi === 'us' ? 'linear-gradient(90deg,#4aa857,#d9b82a 33%,#e8862c 50%,#d43e2a 66%,#8e3fa6 85%,#7a1f32)' : 'linear-gradient(90deg,#4aa857,#93bf3a 20%,#d9b82a 40%,#e8862c 60%,#d43e2a 80%,#8e2d6e)'), 'data-open="aq"'));
  } else if (App.aqState === 'loading') cards.push(dcard('leaf', t('airQuality'), '…', esc(t('loadingShort'))));
  const ill = Astro.moonIllum(now), mt = Astro.moonTimes(TZ.dayStart(now), o.lat, o.lon);
  cards.push(dcard('moon', t('moon'), esc(t(moonPhaseKey(ill.phase))), `${esc(t('illum', { v: fmtPct(ill.fraction * 100) }))}<br>${mt.rise ? esc(t('moonrise')) + ' ' + esc(fmtTime(mt.rise)) : ''}${mt.rise && mt.set ? ' · ' : ''}${mt.set ? esc(t('moonset')) + ' ' + esc(fmtTime(mt.set)) : ''}${mt.alwaysUp ? esc(t('moonUp')) : ''}${mt.alwaysDown ? esc(t('moonDown')) : ''}`, `<span class="row2">${moonSvg(ill.fraction, ill.phase, 46, o.lat < 0)}</span>`, '', 'txt'));
  if (App.marine) {
    const m = App.marine, j = Math.max(0, m.t.findIndex(x => x > now) - 1), today = m.d.t.findIndex(x => TZ.parts(x + 6 * HOUR).key === TZ.parts(now).key);
    cards.push(dcard('wave', t('sea'), `${esc(F.wv(m.wave[j], false))}<small>${esc(Units.label.ht())}</small>`, `${esc(t('waves'))} · ${esc(t('periodS', { v: fmtN(m.wavePer[j], 0) }))} · ${esc(compass(m.waveDir[j]))}<br>${esc(t('seaTemp'))}: ${esc(F.t1(m.sst[j]))}${today >= 0 && isNum(m.d.hmax[today]) ? ' · ' + esc(t('todayMax', { v: F.wv(m.d.hmax[today]) })) : ''}`, hbar((m.wave[j] || 0) / 4, 'var(--c-rain)'), 'data-open="marine"'));
  }
  const cl = [[t('cHigh'), H.cloudH[i0]], [t('cMid'), H.cloudM[i0]], [t('cLow'), H.cloudL[i0]]];
  cards.push(dcard('cloud', t('clouds'), esc(fmtPct(c.cloud ?? H.cloud[i0])), '', hasData(cl.map(x => x[1])) ? `<div class="clbars">${cl.map(([k, v]) => `<div><span>${esc(k)}</span>${hbar((v || 0) / 100, 'var(--c-cloud)')}<span>${esc(fmtPct(v))}</span></div>`).join('')}</div>` : ''));
  $('#details').innerHTML = `<div class="dgrid">${cards.join('')}</div>`;
}

function renderActivities() {
  const el = $('#activities'), o = App.data, A = ACTIVITIES.find(a => a.id === S.activity) || ACTIVITIES[0];
  const oldRow = el.querySelector('.chips'), keepX = oldRow ? oldRow.scrollLeft : 0;
  const days = activityDays(o, A), scored = days.filter(d => isNum(d.score));
  const best = scored.length ? scored.reduce((x, y) => (y.score > x.score ? y : x)) : null;
  const bestTxt = best && best.score > 0 ? t('actBest', { day: dayDate(o.d.t[best.d]), a: fmtTime(best.start), b: fmtTime(best.end), s: best.score }) : t('actNone');
  el.innerHTML = `<div class="card-h"><h2 class="card-t">${ui('calendar')}${esc(t('activities'))}</h2></div>
    <div class="chips" role="group" aria-label="${esc(t('activities'))}">${ACTIVITIES.map(a => `<button type="button" class="chip" data-act-id="${a.id}" aria-pressed="${a.id === A.id}">${ui(a.icon)}${esc(t('act_' + a.id))}</button>`).join('')}</div>
    <p class="act-best">${best && best.score > 0 ? `<b>${esc(t('bestTime'))}:</b> ` : ''}${esc(bestTxt)}</p>
    <div class="ab-row" style="--n:${days.length}">${days.map(d => `<div class="ab${best && d.d === best.d && best.score > 0 ? ' best' : ''}" title="${esc(dayDate(o.d.t[d.d]))}: ${isNum(d.score) ? d.score + '/10' + (d.score > 0 ? ' · ' + fmtTime(d.start) + '–' + fmtTime(d.end) : '') : '–'}"><em>${isNum(d.score) ? d.score : ''}</em><i style="--s:${isNum(d.score) ? Math.max(0.04, d.score / 10) : 0.04};background:${scoreColor(d.score)}"></i><span>${esc(wd2(o.d.t[d.d] + 6 * HOUR))}</span><small>${esc(fmtDM(o.d.t[d.d] + 6 * HOUR))}</small></div>`).join('')}</div>
    <p class="act-note">${esc(t('actNote_' + A.id))}</p>`;
  ChipScroll.enhance(el.querySelector('.chips'), keepX);
}

function renderFooter() {
  const o = App.data;
  $('#foot').innerHTML = `<span><b>Isobar</b> · ${esc(t('footData'))} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0)${o && o.provider !== 'Open-Meteo' ? ' · ' + esc(t('footFallback', { p: o.provider })) : ''}</span><span>${esc(t('footNote'))} · v${APP_VERSION}</span>`;
}
