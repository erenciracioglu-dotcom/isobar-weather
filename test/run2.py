"""Round-2 checks for the 12 requested changes, centred on Karabiga / Biga."""
import sys, json, time, subprocess, pathlib, contextlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from mocks import Router

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'test' / 'shots2'; SHOTS.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'
GEO = {'latitude': 40.4031, 'longitude': 27.3040}
only = set(sys.argv[1:])
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
R = {}

@contextlib.contextmanager
def session(p, name, viewport=(390, 844), dpr=2, geo=True, mobile=True, storage=None, color='light', router_opts=None):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile,
                        geolocation=GEO if geo else None, permissions=['geolocation'] if geo else [], locale='en-GB', timezone_id='Europe/Istanbul', color_scheme=color)
    r = Router(**(router_opts or {})); ctx.route('**/*', r.handle)
    if storage: ctx.add_init_script('try{' + ''.join(f'localStorage.setItem({json.dumps("isobar:" + k)}, {json.dumps(json.dumps(v))});' for k, v in storage.items()) + '}catch(e){}')
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    try: yield page, r, errs
    finally:
        R[name + '_errors'] = errs
        b.close()

def want(n): return not only or n in only
def shot(page, name, full=True): page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)

with sync_playwright() as p:
    if want('tr'):
        with session(p, 'tr') as (page, r, errs):
            page.goto(URL); page.wait_for_selector('#details .dc', timeout=20000); page.wait_for_timeout(1200)
            R['tr'] = page.evaluate("""() => ({ lang: document.documentElement.lang, flag: document.querySelector('#langBtn').getAttribute('lang'), loc: document.querySelector('#locName').textContent,
              sub: document.querySelector('#locSub').textContent, days: document.querySelectorAll('.dd').length, note: [...document.querySelectorAll('#daily .note')].map(n => n.textContent),
              vis: [...document.querySelectorAll('.dc')].find(d => d.textContent.includes('Görüş'))?.querySelector('.big')?.textContent,
              nowcastShown: !document.querySelector('#nowcast').hidden, outlook0: document.querySelector('.ol li')?.textContent,
              trendSvg: !!document.querySelector('#trendHost svg'), filled: App.data.filled, sea: [...document.querySelectorAll('.dc')].find(d => d.textContent.includes('Deniz'))?.querySelector('.big')?.textContent,
              models: null })""")
            R['tr']['models'] = r.models_seen
            shot(page, 'tr-phone')
            page.click('#langBtn'); page.wait_for_timeout(500)
            R['tr_switched'] = page.evaluate("() => ({ lang: document.documentElement.lang, flag: document.querySelector('#langBtn').getAttribute('lang'), daily: document.querySelector('#daily .card-t').textContent, saved: JSON.parse(localStorage.getItem('isobar:settings')).lang })")
            page.click('#langBtn'); page.wait_for_timeout(300)
            R['tr_back'] = page.evaluate("document.documentElement.lang")

    if want('dry'):
        with session(p, 'dry', router_opts={'dry': True}) as (page, r, errs):
            page.goto(URL); page.wait_for_selector('#details .dc', timeout=20000); page.wait_for_timeout(800)
            R['dry'] = page.evaluate("() => ({ nowcastShown: !document.querySelector('#nowcast').hidden, outlook0: document.querySelector('.ol li')?.textContent })")

    if want('denied'):
        with session(p, 'denied', geo=False) as (page, r, errs):
            page.goto(URL); page.wait_for_selector('.hero-temp', timeout=20000); page.wait_for_timeout(800)
            R['denied'] = page.evaluate("() => ({ loc: document.querySelector('#locName').textContent, sub: document.querySelector('#locSub').textContent, toast: document.querySelector('#toast').hidden ? null : document.querySelector('#toast').textContent, lat: App.loc.lat, lon: App.loc.lon })")
            shot(page, 'denied', full=False)

    if want('migrate'):
        old = {'units': {'temp': 'C', 'wind': 'kmh', 'precip': 'mm', 'pressure': 'hPa', 'dist': 'km', 'time': '24'}, 'aqi': 'us', 'theme': 'auto', 'lang': 'auto', 'anim': True, 'mode': 'basic', 'hourStep': 1, 'dailyView': 'daily', 'activity': 'running',
               'adv': {'range': '7d', 'step': 1, 'model': 'best_match', 'panels': ['temp', 'precip', 'cloud', 'wind', 'pressure'], 'layer': 'temp', 'base': 'light', 'particles': True, 'labels': True}}
        with session(p, 'migrate', storage={'settings': old, 'lastLoc': {'name': 'Biga', 'admin': 'Canakkale', 'country': 'Turkiye', 'cc': 'TR', 'lat': 40.4025, 'lon': 27.31, 'tz': 'Europe/Istanbul'}}) as (page, r, errs):
            page.goto(URL); page.wait_for_selector('#details .dc', timeout=20000)
            R['migrate'] = page.evaluate("() => ({ lang: S.lang, panels: S.adv.panels, base: S.adv.base, aqi: S.aqi, v: S.v, htmlLang: document.documentElement.lang })")

    if want('desk'):
        with session(p, 'desk', viewport=(1366, 900), dpr=1, mobile=False) as (page, r, errs):
            page.goto(URL); page.wait_for_selector('#details .dc', timeout=20000); page.wait_for_timeout(1500)
            R['desk_bottoms'] = page.evaluate("() => ({ daily: Math.round(document.querySelector('#daily').getBoundingClientRect().bottom), act: Math.round(document.querySelector('#activities').getBoundingClientRect().bottom), trendH: document.querySelector('#trendHost').clientHeight })")
            shot(page, 'desk-basic')
            R['hm_pick_daily'] = page.evaluate("() => !!document.querySelector('#daily .hm-pick')")
            page.click('[data-dv="3h"]'); page.wait_for_timeout(500)
            R['hm_pick_3h'] = page.evaluate("() => [...document.querySelectorAll('#daily .hm-pick button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''))")
            R['desk_bottoms_3h'] = page.evaluate("() => ({ daily: Math.round(document.querySelector('#daily').getBoundingClientRect().bottom), act: Math.round(document.querySelector('#activities').getBoundingClientRect().bottom) })")
            page.locator('#daily').screenshot(path=str(SHOTS / 'desk-matrix-temp.png'))
            page.click('#settingsBtn'); page.wait_for_timeout(300)
            page.locator('#setSheet').screenshot(path=str(SHOTS / 'settings.png'))
            R['settings_has_heatmap'] = page.evaluate("() => !!document.querySelector('#setSheet [data-heatmap]')")
            page.click('[data-close]'); page.wait_for_timeout(300)
            page.click('#daily [data-heatmap="wind"]'); page.wait_for_timeout(400)
            page.locator('#daily').screenshot(path=str(SHOTS / 'desk-matrix-wind.png'))
            R['heat_wind'] = page.evaluate("() => ({ legend: document.querySelector('.hm-legend').textContent, cellBg: getComputedStyle(document.querySelector('.mx td:not(.past)')).backgroundColor })")
            page.click('#daily [data-heatmap="rain"]'); page.wait_for_timeout(400)
            R['hm_saved'] = page.evaluate("() => JSON.parse(localStorage.getItem('isobar:settings')).heatmap")
            page.locator('#daily').screenshot(path=str(SHOTS / 'desk-matrix-rain.png'))

    if want('adv'):
        with session(p, 'adv', viewport=(1366, 900), dpr=1, mobile=False) as (page, r, errs):
            page.goto(URL); page.wait_for_selector('#details .dc', timeout=20000)
            page.click('#langBtn'); page.wait_for_timeout(300)
            page.click('#modeSegTop [data-mode="advanced"]')
            page.wait_for_selector('#meteoHost canvas', timeout=10000)
            page.locator('#advMap').scroll_into_view_if_needed()
            page.wait_for_function('typeof MapView !== "undefined" && !!MapView.map && !!MapView.grid', timeout=20000)
            page.wait_for_timeout(1500)
            R['adv'] = page.evaluate("""() => ({ order: [...document.querySelectorAll('.adv-grid > section')].map(s => s.id), panels: S.adv.panels,
              groups: [...document.querySelectorAll('.ng-h')].map(h => h.textContent), base: MapView.baseKind, tiles: null,
              ticks: [...document.querySelectorAll('.tk-day')].map(b => b.textContent).slice(0, 6), nTicks: document.querySelectorAll('.tk-day').length,
              legend: document.querySelector('#mapLegend').innerText.replace(/\\n/g, ' | '), zoom: MapView.map.getZoom(), grid: [MapView.grid.nx, MapView.grid.ny] })""")
            R['adv']['tiles'] = sorted(r.tiles)
            page.locator('#advNow').screenshot(path=str(SHOTS / 'adv-now.png'))
            page.locator('#advMap').screenshot(path=str(SHOTS / 'map-temp-local.png'))
            box = page.locator('#mapEl').bounding_box(); page.mouse.move(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.65); page.wait_for_timeout(300)
            R['hover'] = page.evaluate("() => { const h = document.querySelector('#lgHere'); return h && !h.hidden ? h.textContent : null }")
            page.click('[data-mscale="fixed"]'); page.wait_for_timeout(500)
            page.locator('#advMap').screenshot(path=str(SHOTS / 'map-temp-fixed.png'))
            page.click('[data-mscale="local"]')
            for layer in ['wind', 'pmsl', 'precip']:
                page.click(f'[data-layer="{layer}"]'); page.wait_for_timeout(700)
                page.locator('#advMap').screenshot(path=str(SHOTS / f'map-{layer}.png'))
            page.click('[data-layer="temp"]')
            page.select_option('#mapBase', 'satellite'); page.wait_for_timeout(700)
            page.locator('#advMap').screenshot(path=str(SHOTS / 'map-sat.png'))
            page.click('#greyChip'); page.wait_for_timeout(500)
            R['grey'] = page.evaluate("() => ({ cls: document.querySelector('#mapEl').className, chipHidden: document.querySelector('#greyChip').hidden })")
            page.locator('#advMap').screenshot(path=str(SHOTS / 'map-sat-grey.png'))
            page.select_option('#mapBase', 'grey'); page.wait_for_timeout(300)
            day = page.locator('.tk-day').nth(3); lbl = day.text_content(); day.click(); page.wait_for_timeout(400)
            R['jump'] = {'clicked': lbl, 'label': page.evaluate("document.querySelector('#mapTimeLabel').textContent")}
            page.click('#mapNext'); page.wait_for_timeout(200)
            R['step'] = page.evaluate("document.querySelector('#mapTimeLabel').textContent")
            page.locator('#advModels').scroll_into_view_if_needed()
            page.wait_for_selector('#modelsHost canvas', timeout=15000)
            for v in ['wind', 'gust', 'precip']:
                page.select_option('#cmpVar', v); page.wait_for_timeout(400)
                page.locator('#advModels').screenshot(path=str(SHOTS / f'models-{v}.png'))
            R['models_note'] = page.evaluate("document.querySelector('#advModels .note').textContent")
            shot(page, 'adv-desktop')

    if want('advphone'):
        with session(p, 'advphone') as (page, r, errs):
            page.goto(URL); page.wait_for_selector('#details .dc', timeout=20000)
            page.click('#modeSegMob [data-mode="advanced"]')
            page.wait_for_selector('#advMap', timeout=10000)
            page.locator('#advMap').scroll_into_view_if_needed()
            page.wait_for_function('typeof MapView !== "undefined" && !!MapView.map && !!MapView.grid', timeout=20000)
            page.wait_for_timeout(1500)
            page.locator('#advMap').screenshot(path=str(SHOTS / 'phone-map.png'))
            page.locator('#advNow').screenshot(path=str(SHOTS / 'phone-now.png'))
            R['advphone'] = page.evaluate("() => ({ overflow: document.documentElement.scrollWidth - innerWidth, ticks: [...document.querySelectorAll('.tk-day')].map(b => b.textContent) })")

server.terminate()
pathlib.Path(__file__).with_name('report2.json').write_text(json.dumps(R, indent=1, ensure_ascii=False))
print(json.dumps(R, indent=1, ensure_ascii=False))
