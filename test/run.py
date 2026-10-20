"""Drive Isobar in headless Chromium with mocked services; save screenshots and report errors."""
import sys, json, time, subprocess, pathlib, contextlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from mocks import Router

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'test' / 'shots'; SHOTS.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'
GEO = {'latitude': 40.403, 'longitude': 27.303}
only = set(sys.argv[1:])

server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
report = {}

@contextlib.contextmanager
def session(p, name, viewport=(390, 844), dpr=2, fail=(), storage=None, geo=True, mobile=True, color='light'):
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile,
                              geolocation=GEO if geo else None, permissions=['geolocation'] if geo else [], locale='en-GB', timezone_id='Europe/Istanbul', color_scheme=color)
    router = Router(fail=fail)
    ctx.route('**/*', router.handle)
    if storage:
        ctx.add_init_script('try{' + ''.join(f'localStorage.setItem({json.dumps("isobar:" + k)}, {json.dumps(json.dumps(v))});' for k, v in storage.items()) + '}catch(e){}')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    try:
        yield page, router, errs
    finally:
        report[name] = {'errors': errs, 'calls': len(router.calls), 'unmocked': router.unmocked[:8]}
        browser.close()

def shot(page, name, full=True):
    page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)

def want(name): return not only or name in only

with sync_playwright() as p:
    if want('phone'):
        with session(p, 'phone') as (page, r, errs):
            page.goto(URL)
            page.wait_for_selector('.hero-temp', timeout=15000)
            page.wait_for_selector('#details .dc', timeout=10000)
            page.wait_for_timeout(1200)
            shot(page, 'phone-basic')
            info = page.evaluate("""() => ({
              loc: document.querySelector('#locName').textContent,
              temp: document.querySelector('.hero-temp').textContent,
              summary: (document.querySelector('.hero-sum')||{}).textContent,
              alerts: [...document.querySelectorAll('.al b')].map(b=>b.textContent),
              nowcast: (document.querySelector('.nc-text')||{}).textContent || (document.querySelector('.nc-dry')||{}).textContent,
              days: document.querySelectorAll('.dd').length,
              hourCells: document.querySelectorAll('#hourly .hs-row:first-child .hc').length,
              outlook: [...document.querySelectorAll('.ol li')].map(l=>l.textContent),
              cards: [...document.querySelectorAll('.dc h3')].map(h=>h.textContent),
              act: document.querySelector('.act-best').textContent,
              scrollW: document.documentElement.scrollWidth, vw: innerWidth,
              hash: location.hash
            })""")
            report['phone_info'] = info
            page.click('.dd:nth-child(2) > summary')
            page.click('[data-hstep="3"]')
            page.wait_for_timeout(300)
            shot(page, 'phone-expanded')
            page.click('[data-dv="3h"]')
            page.wait_for_timeout(300)
            page.locator('#daily').screenshot(path=str(SHOTS / 'phone-matrix.png'))
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            shot(page, 'phone-settings', full=False)
            page.click('[data-preset="imperial"]')
            page.click('[data-close]')
            page.wait_for_timeout(300)
            report['imperial'] = page.evaluate("() => ({temp: document.querySelector('.hero-temp').textContent, wind: document.querySelector('.dc:nth-child(2) .big').textContent, unitBtn: document.querySelector('#unitBtn').textContent})")
            page.click('#locBtn')
            page.fill('#q', 'Tromsø')
            page.wait_for_selector('[data-pick="r0"]', timeout=5000)
            shot(page, 'phone-search', full=False)
            page.click('[data-pick="r0"]')
            page.wait_for_function("document.querySelector('#locName').textContent === 'Tromsø'")
            page.wait_for_timeout(800)
            report['tromso'] = page.evaluate("() => ({hero: document.querySelector('.hero-top').textContent, hash: location.hash})")
            report['phone_overflow'] = page.evaluate("() => document.documentElement.scrollWidth - innerWidth")

    if want('adv'):
        with session(p, 'adv', viewport=(1366, 900), dpr=1, mobile=False) as (page, r, errs):
            page.goto(URL)
            page.wait_for_selector('.hero-temp', timeout=15000)
            page.click('#modeSegTop [data-mode="advanced"]')
            page.wait_for_selector('#meteoHost canvas', timeout=10000)
            page.wait_for_function("window.MapView_ready = !!document.querySelector('.leaflet-container')", timeout=15000)
            page.wait_for_function("!document.querySelector('#mapUpd') || document.querySelector('#mapTimeLabel').textContent.length > 3", timeout=15000)
            page.wait_for_timeout(2500)
            shot(page, 'adv-desktop')
            page.locator('#advMap').screenshot(path=str(SHOTS / 'adv-map-temp.png'))
            for layer in ['pmsl', 'precip', 'wind', 'radar']:
                page.click(f'[data-layer="{layer}"]'); page.wait_for_timeout(900)
                page.locator('#advMap').screenshot(path=str(SHOTS / f'adv-map-{layer}.png'))
            page.click('[data-load="normals"]')
            page.wait_for_selector('#climHost canvas', timeout=15000)
            page.locator('#advClimate').screenshot(path=str(SHOTS / 'adv-climate.png'))
            page.wait_for_selector('#ensHost canvas', timeout=10000)
            page.locator('#advEns').screenshot(path=str(SHOTS / 'adv-ens.png'))
            page.wait_for_selector('#modelsHost canvas', timeout=10000)
            page.locator('#advModels').screenshot(path=str(SHOTS / 'adv-models.png'))
            page.locator('#meteoHost').scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            box = page.locator('#meteoHost .tc-scroll').bounding_box()
            page.mouse.move(box['x'] + 420, box['y'] + 140)
            page.wait_for_timeout(300)
            page.screenshot(path=str(SHOTS / 'adv-meteo-tip.png'))
            report['tip'] = page.evaluate("() => { const t = document.querySelector('#meteoHost .tc-tip'); return t && !t.hidden ? t.textContent.slice(0, 160) : null }")
            report['adv_info'] = page.evaluate("""() => ({
              readout: document.querySelectorAll('.ro').length,
              panels: [...document.querySelectorAll('[data-panel]')].filter(b=>!b.disabled).length,
              tableRows: document.querySelectorAll('.dt tbody tr').length,
              tableCols: document.querySelectorAll('.dt thead th').length,
              sources: [...document.querySelectorAll('.src-list li')].map(l=>l.textContent.replace(/\\s+/g,' ').trim()),
              mapLabel: document.querySelector('#mapTimeLabel').textContent,
              legend: document.querySelector('#mapLegend').textContent,
              climate: document.querySelector('#advClimate .kv').textContent
            })""")
            page.select_option('#advModel', 'icon_seamless')
            page.wait_for_timeout(1200)
            report['model_switch'] = page.evaluate("() => document.querySelector('#advNow .card-h span').textContent")

    if want('desk'):
        with session(p, 'desk', viewport=(1366, 900), dpr=1, mobile=False, geo=False) as (page, r, errs):
            page.goto(URL)
            page.wait_for_selector('#details .dc', timeout=20000)
            page.wait_for_timeout(1200)
            shot(page, 'desk-basic')
            report['desk_info'] = page.evaluate("() => ({loc: document.querySelector('#locName').textContent, sub: document.querySelector('#locSub').textContent, toast: document.querySelector('#toast').hidden ? null : document.querySelector('#toast').textContent})")

    if want('fallback'):
        with session(p, 'fallback', fail={'forecast'}) as (page, r, errs):
            page.goto(URL)
            page.wait_for_selector('.hero-temp', timeout=20000)
            page.wait_for_timeout(800)
            report['fallback_info'] = page.evaluate("() => ({banner: document.querySelector('#banner').hidden ? null : document.querySelector('#banner').textContent, src: document.querySelector('.hero-src').textContent, days: document.querySelectorAll('.dd').length})")
            shot(page, 'phone-fallback', full=False)

    if want('tr'):
        with session(p, 'tr', storage={'settings': {'lang': 'tr', 'theme': 'dark'}}, color='dark') as (page, r, errs):
            page.goto(URL)
            page.wait_for_selector('#details .dc', timeout=15000)
            page.wait_for_timeout(1000)
            shot(page, 'phone-tr-dark')
            page.click('#modeSegMob [data-mode="advanced"]')
            page.wait_for_selector('#meteoHost canvas', timeout=10000)
            page.wait_for_timeout(2500)
            shot(page, 'phone-tr-adv')
            report['tr_overflow'] = page.evaluate("() => document.documentElement.scrollWidth - innerWidth")

    if want('offline'):
        with session(p, 'offline') as (page, r, errs):
            page.goto(URL)
            page.wait_for_selector('#details .dc', timeout=15000)
            page.evaluate("""() => { for (const k of Object.keys(localStorage)) if (k.startsWith('isobar:fc:')) { const o = JSON.parse(localStorage.getItem(k)); o.fetchedAt -= 2*3600e3; if (o.cur) o.cur.t -= 2*3600e3; localStorage.setItem(k, JSON.stringify(o)); } }""")
            r.fail.add('all')
            page.reload()
            page.wait_for_selector('.hero-temp', timeout=15000)
            page.wait_for_selector('#banner:not([hidden])', timeout=20000)
            page.wait_for_timeout(500)
            shot(page, 'phone-offline', full=False)
            report['offline_info'] = page.evaluate("() => ({temp: document.querySelector('.hero-temp').textContent, banner: document.querySelector('#banner').hidden ? null : document.querySelector('#banner').textContent})")

server.terminate()
print(json.dumps(report, indent=1, ensure_ascii=False))
