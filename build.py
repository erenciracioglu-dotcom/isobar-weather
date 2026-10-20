#!/usr/bin/env python3
"""Assemble Isobar into one self-contained HTML file and run static checks."""
import re, sys, json, subprocess, pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
BUILD = ROOT / 'build'
BUILD.mkdir(exist_ok=True)

js_files = sorted((SRC / 'js').glob('*.js'))
js = '\n'.join(f.read_text(encoding='utf-8') for f in js_files)

leaflet_css = (ROOT / 'vendor/leaflet/leaflet.css').read_text(encoding='utf-8')
leaflet_css = re.sub(r'/\*.*?\*/', '', leaflet_css, flags=re.S)
leaflet_css = re.sub(r'[^{}]*\{[^{}]*url\((?:images/|#default)[^{}]*\}', '', leaflet_css)
leaflet_css = re.sub(r'\n\s*\n+', '\n', leaflet_css).strip()

css = (SRC / 'style.css').read_text(encoding='utf-8').replace('/*LEAFLET_CSS*/', leaflet_css)
shell = (SRC / 'shell.html').read_text(encoding='utf-8')
html = shell.replace('/*STYLE*/', css).replace('/*SCRIPT*/', js)
if '</script' in js.replace('</script>\n</body>', ''):
    sys.exit('script contains a closing script tag')

out = ROOT / 'index.html'
out.write_text(html, encoding='utf-8')
(BUILD / 'app.js').write_text(js, encoding='utf-8')
print(f'wrote {out} ({out.stat().st_size/1024:.1f} KB)')

# --- syntax check
r = subprocess.run(['node', '--check', str(BUILD / 'app.js')], capture_output=True, text=True)
if r.returncode:
    print(r.stderr); sys.exit('syntax error')
print('syntax ok')

# --- i18n key check
i18n_src = (SRC / 'js/00-i18n.js').read_text(encoding='utf-8')
node = subprocess.run(['node', '-e', i18n_src + '\nconsole.log(JSON.stringify({en:Object.keys(I18N.en),tr:Object.keys(I18N.tr)}))'], capture_output=True, text=True)
keys = json.loads(node.stdout)
en, tr = set(keys['en']), set(keys['tr'])
code = '\n'.join(f.read_text(encoding='utf-8') for f in js_files if f.name != '00-i18n.js')
used = set(re.findall(r"\bt\('([A-Za-z0-9_]+)'\s*[,)]", code))
dyn_prefixes = ['w', 'bft', 'act_', 'actNote_', 'pn_', 'ly_', 'base_', 'preset_', 'theme_', 'tw_', 'pol_', 'r', 'sumWetAll_', 'sumWetUntil_', 'sumWetFrom_', 'aq', 'uv', 'v', 'c', 'm', 'pl']
problems = []
for k in sorted(used):
    if k not in en: problems.append(f'missing en: {k}')
    if k not in tr: problems.append(f'missing tr: {k}')
for k in sorted(en - tr): problems.append(f'en only: {k}')
for k in sorted(tr - en): problems.append(f'tr only: {k}')
# dynamic families that must be complete
fams = {
  'w': [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,68,69,71,73,75,77,80,81,82,85,86,95,96,99],
  'bft': list(range(13)),
  'act_': ['running','cycling','hiking','backpacking','camping','beach','bbq','laundry','stars','drone'],
  'actNote_': ['running','cycling','hiking','backpacking','camping','beach','bbq','laundry','stars','drone'],
  'pn_': ['temp','precip','cloud','wind','pressure','humidity','uv','vis','instab','freezing','solar','soil','et'],
  'ly_': ['temp','precip','wind','gust','cloud','pmsl','rh','radar','sat'],
  'base_': ['auto','dark','light','streets','satellite','terrain'],
  'preset_': ['metric','imperial','uk','nautical'], 'theme_': ['auto','light','dark'],
  'tw_': ['night','astro','naut','civil','day'], 'pol_': ['alder','birch','grass','mugwort','olive','ragweed'],
  'r': ['48h','7d','15d'],
  'sumWetAll_': ['rain','snow','thunder','sleet'], 'sumWetUntil_': ['rain','snow','thunder','sleet'], 'sumWetFrom_': ['rain','snow','thunder','sleet'],
}
for p, items in fams.items():
    for it in items:
        k = f'{p}{it}'
        if k not in en or k not in tr: problems.append(f'missing family key: {k}')
static_extra = ['mNew','mWaxC','mFirstQ','mWaxG','mFull','mWanG','mLastQ','mWanC','aqGood','aqFair','aqMod','aqPoor','aqVPoor','aqExt','aqUSG','aqUnh','aqVUnh','aqHaz','mBest']
for k in static_extra:
    if k not in en or k not in tr: problems.append(f'missing: {k}')
# placeholder parity
en_d = json.loads(subprocess.run(['node', '-e', i18n_src + '\nconsole.log(JSON.stringify(I18N))'], capture_output=True, text=True).stdout)
for k in en & tr:
    a = set(re.findall(r'\{(\w+)\}', en_d['en'][k])); b = set(re.findall(r'\{(\w+)\}', en_d['tr'][k]))
    if a != b: problems.append(f'placeholder mismatch {k}: en {sorted(a)} tr {sorted(b)}')
print('\n'.join(problems) if problems else f'i18n ok ({len(en)} keys, {len(used)} static uses)')
