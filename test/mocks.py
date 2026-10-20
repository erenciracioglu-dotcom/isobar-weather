"""Realistic mock responses for every external service Isobar calls."""
import json, math, random, time, struct, zlib, pathlib
from urllib.parse import urlparse, parse_qs

ROOT = pathlib.Path(__file__).resolve().parent.parent
TZ_OFF = 3 * 3600  # Europe/Istanbul
DAYSEC = 86400

def png(w=256, h=256, rgba=(0, 0, 0, 0)):
    raw = b''.join(b'\x00' + bytes(rgba) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

TILE_LIGHT = png(256, 256, (226, 230, 233, 255))
TILE_DARK = png(256, 256, (28, 34, 42, 255))
TILE_SAT = png(256, 256, (52, 78, 64, 255))
TILE_RADAR = png(256, 256, (0, 0, 0, 0))

def local_midnight(now):
    return ((now + TZ_OFF) // DAYSEC) * DAYSEC - TZ_OFF

def wmo(precip, cloud, temp, cape, vis):
    if precip >= 0.1:
        if cape > 600 and precip > 1.5: return 95
        if temp < 0.5: return 73 if precip > 0.5 else 71
        return 65 if precip >= 4 else 63 if precip >= 1 else 61 if precip >= 0.3 else 51
    if vis < 1000: return 45
    return 0 if cloud < 20 else 1 if cloud < 45 else 2 if cloud < 80 else 3

def series(lat=40.40, lon=27.30, n_days=17, step=1, seed=1, now=None):
    now = now or int(time.time())
    rnd = random.Random(seed)
    start = local_midnight(now) - DAYSEC
    T = list(range(start, start + n_days * DAYSEC, step * 3600))
    lat_off = (lat - 40.4) * -0.9
    rain_days = {1: (13, 21, 2.2), 2: (0, 6, 0.6), 5: (10, 16, 3.5), 9: (14, 20, 1.2), 12: (2, 10, 4.5)}
    H = {k: [] for k in ['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'rain', 'showers', 'snowfall', 'snow_depth', 'weather_code', 'pressure_msl', 'surface_pressure', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_80m', 'wind_direction_80m', 'is_day', 'cape', 'freezing_level_height', 'shortwave_radiation', 'et0_fao_evapotranspiration', 'vapour_pressure_deficit', 'soil_temperature_0cm', 'soil_moisture_0_to_1cm', 'uv_index', 'uv_index_clear_sky', 'sunshine_duration', 'lifted_index', 'convective_inhibition', 'wet_bulb_temperature_2m', 'boundary_layer_height']}
    for ts in T:
        lt = ts + TZ_OFF
        d = (ts - start) // DAYSEC
        hr = (lt % DAYSEC) / 3600
        trend = -0.25 * d + (2.5 if 6 <= d <= 8 else 0)
        rd = rain_days.get(d)
        wet = rd and rd[0] <= hr < rd[1]
        temp = 16 + trend + lat_off + 6.5 * math.sin(2 * math.pi * (hr - 9) / 24) - (3 if wet else 0) + rnd.uniform(-0.4, 0.4)
        precip = round(rd[2] * (0.5 + rnd.random()), 1) if wet else 0.0
        cloud = 95 if wet else max(0, min(100, 35 + 30 * math.sin(d * 1.3) + rnd.uniform(-15, 15)))
        rh = 92 if wet else max(35, min(95, 70 - 18 * math.sin(2 * math.pi * (hr - 9) / 24) + rnd.uniform(-5, 5)))
        a, b = 17.625, 243.04
        g = math.log(rh / 100) + a * temp / (b + temp)
        dew = b * g / (a - g)
        ws = max(2, 14 + 9 * math.sin(d * 0.9 + hr / 7) + (12 if wet else 0) + rnd.uniform(-3, 3))
        wd = (30 + d * 40 + hr * 3) % 360
        is_day = 1 if 7.6 <= hr < 18.4 else 0
        elev = max(0, math.sin(math.pi * (hr - 7.6) / 10.8)) if is_day else 0
        swr = round(620 * elev * (1 - 0.7 * cloud / 100))
        cape = round(900 * elev) if d in (5, 12) else round(60 * elev)
        vis = 24140 if not wet else 6000
        if d == 3 and 4 <= hr < 8: vis = 400; cloud = 100
        code = wmo(precip, cloud, temp, cape, vis)
        uvc = round(4.6 * elev ** 1.6, 2)
        vals = dict(temperature_2m=round(temp, 1), relative_humidity_2m=round(rh), dew_point_2m=round(dew, 1), apparent_temperature=round(temp - 0.12 * ws + 0.05 * rh - 3, 1),
                    precipitation_probability=min(100, round(85 if wet else (25 if rd else 5) + rnd.uniform(0, 10))), precipitation=precip, rain=precip if code not in (95,) else round(precip * 0.4, 1),
                    showers=0.0 if code != 95 else round(precip * 0.6, 1), snowfall=0.0, snow_depth=0.0, weather_code=code, pressure_msl=round(1013 + 7 * math.sin(d * 0.55) - (5 if wet else 0) + rnd.uniform(-0.3, 0.3), 1),
                    cloud_cover=round(cloud), cloud_cover_low=round(cloud * 0.7 if wet else cloud * 0.3), cloud_cover_mid=round(cloud * 0.5), cloud_cover_high=round(min(100, cloud * 0.8)), visibility=vis,
                    wind_speed_10m=round(ws, 1), wind_direction_10m=round(wd), wind_gusts_10m=round(ws * 1.7, 1), wind_speed_80m=round(ws * 1.45, 1), wind_direction_80m=round((wd + 12) % 360), is_day=is_day,
                    cape=cape, freezing_level_height=round(2900 + 300 * math.sin(d / 2)), shortwave_radiation=swr, et0_fao_evapotranspiration=round(0.25 * elev * (1 - cloud / 200), 2),
                    vapour_pressure_deficit=round(max(0.05, 1.6 * (1 - rh / 100)), 2), soil_temperature_0cm=round(temp + 2 * elev, 1), soil_moisture_0_to_1cm=round(0.24 + (0.1 if wet else 0), 3),
                    uv_index=round(uvc * (1 - 0.6 * (cloud / 100) ** 1.5), 2), uv_index_clear_sky=uvc, sunshine_duration=round(3600 * elev * (1 - cloud / 100)) if is_day else 0,
                    lifted_index=round(2 - cape / 300, 1), convective_inhibition=round(-20 * elev), wet_bulb_temperature_2m=round(temp - 3, 1), boundary_layer_height=round(300 + 1200 * elev))
        vals['surface_pressure'] = round(vals['pressure_msl'] - 5.5, 1)
        for k in H: H[k].append(vals[k])
    return T, H, start

def forecast(q, now=None):
    now = now or int(time.time())
    lat, lon = float(q['latitude'][0]), float(q['longitude'][0])
    T, H, start = series(lat, lon, now=now)
    hourly = q.get('hourly', [''])[0].split(',')
    daily = q.get('daily', [''])[0].split(',')
    cur = q.get('current', [''])[0].split(',')
    out = {'latitude': round(lat, 4), 'longitude': round(lon, 4), 'generationtime_ms': 1.2, 'utc_offset_seconds': TZ_OFF, 'timezone': 'Europe/Istanbul', 'timezone_abbreviation': 'GMT+3', 'elevation': 12.0}
    out['hourly'] = {'time': T, **{k: H[k] for k in hourly if k in H}}
    model = q.get('models', ['best_match'])[0]
    cut = start + 11 * DAYSEC
    if model == 'best_match':
        for k in list(out['hourly'].keys()):
            if k == 'time': continue
            if k == 'visibility': out['hourly'][k] = [None] * len(T)
            else: out['hourly'][k] = [None if ts > cut else v for ts, v in zip(T, out['hourly'][k])]
    days = [start + i * DAYSEC for i in range(17)]
    D = {'time': days}
    for di, ds in enumerate(days):
        idx = [i for i, ts in enumerate(T) if ds < ts <= ds + DAYSEC]
        g = lambda k: [H[k][i] for i in idx]
        rows = {
            'weather_code': max(g('weather_code'), key=lambda c: (c >= 95, c >= 61, c)), 'temperature_2m_max': max(g('temperature_2m')), 'temperature_2m_min': min(g('temperature_2m')),
            'apparent_temperature_max': max(g('apparent_temperature')), 'apparent_temperature_min': min(g('apparent_temperature')),
            'sunrise': ds + int(7.6 * 3600) + di * 60, 'sunset': ds + int(18.4 * 3600) - di * 90, 'daylight_duration': 10.8 * 3600 - di * 150, 'sunshine_duration': sum(g('sunshine_duration')),
            'uv_index_max': max(g('uv_index')), 'precipitation_sum': round(sum(g('precipitation')), 1), 'rain_sum': round(sum(g('rain')), 1), 'showers_sum': round(sum(g('showers')), 1), 'snowfall_sum': 0.0,
            'precipitation_hours': sum(1 for v in g('precipitation') if v >= 0.1), 'precipitation_probability_max': max(g('precipitation_probability')), 'wind_speed_10m_max': max(g('wind_speed_10m')),
            'wind_gusts_10m_max': max(g('wind_gusts_10m')), 'wind_direction_10m_dominant': g('wind_direction_10m')[12], 'shortwave_radiation_sum': round(sum(g('shortwave_radiation')) * 3600 / 1e6, 2),
            'et0_fao_evapotranspiration': round(sum(g('et0_fao_evapotranspiration')), 2)}
        for k in daily:
            if k in rows: D.setdefault(k, []).append(None if (model == 'best_match' and ds >= cut) else rows[k])
    out['daily'] = D
    if cur and cur[0]:
        i = max(i for i, ts in enumerate(T) if ts <= now)
        c = {'time': now - now % 900, 'interval': 900}
        for k in cur:
            if k in H: c[k] = H[k][i]
        out['current'] = c
    if 'minutely_15' in q:
        mt = list(range(start, start + 17 * DAYSEC, 900))
        pr = [0.4 if now + 40 * 60 <= ts <= now + 100 * 60 else 0.0 for ts in mt]
        if q.get('_dry'): pr = [0.0] * len(mt)
        out['minutely_15'] = {'time': mt, 'precipitation': pr, 'snowfall': [0.0] * len(mt)}
    return out

def grid(q):
    lats = [float(x) for x in q['latitude'][0].split(',')]
    lons = [float(x) for x in q['longitude'][0].split(',')]
    now = int(time.time())
    step = 3 if q.get('temporal_resolution', [''])[0] == 'hourly_3' else 1
    start = local_midnight(now)
    T = list(range(start, start + 16 * DAYSEC, step * 3600))
    res = []
    for la, lo in zip(lats, lons):
        coast = 40.42 + 0.06 * math.sin((lo - 27.0) * 4.0)          # wavy Marmara coastline
        sea = la > coast
        inland = max(0.0, coast - la)                                 # degrees south of the coast
        elev = min(1.0, inland / 0.6) * 700                           # hills towards Kaz Dağları
        hourly = {'time': T, 'temperature_2m': [], 'precipitation': [], 'wind_speed_10m': [], 'wind_direction_10m': [], 'wind_gusts_10m': [], 'cloud_cover': [], 'pressure_msl': [], 'relative_humidity_2m': []}
        for k, ts in enumerate(T):
            hr = ((ts + TZ_OFF) % DAYSEC) / 3600; d = (ts - start) / DAYSEC
            diurnal = math.sin(2 * math.pi * (hr - 9) / 24)
            base = 17.5 - 0.3 * d
            temp = base + (0.8 * diurnal if sea else 5.5 * diurnal - elev / 160) + 0.6 * math.sin(lo * 7)
            wd = 35 + 15 * math.sin(d / 2)                            # NE flow (Poyraz)
            ws = (24 if sea else 11 - elev / 140) + 6 * math.sin(d * 1.3) + 3 * math.sin(lo * 9 + la * 5)
            band = math.exp(-((la - 40.2 - 0.25 * math.sin(d * 2)) ** 2) / 0.02) if 1.0 < d < 2.4 else 0
            pr = round(max(0.0, 3.2 * band - 0.2) * step, 1)
            p = 1016 - 3.5 * (la - 39.9) + 1.5 * math.sin(d / 1.7) - 2 * band
            hourly['temperature_2m'].append(round(temp, 1)); hourly['precipitation'].append(pr)
            hourly['wind_speed_10m'].append(round(max(1, ws), 1)); hourly['wind_direction_10m'].append(round(wd))
            hourly['wind_gusts_10m'].append(round(max(2, ws) * 1.6, 1)); hourly['cloud_cover'].append(round(min(100, 25 + 70 * band + 20 * (not sea))))
            hourly['pressure_msl'].append(round(p, 1)); hourly['relative_humidity_2m'].append(round(min(100, (82 if sea else 64) - 12 * diurnal + 15 * band)))
        res.append({'latitude': la, 'longitude': lo, 'utc_offset_seconds': 0, 'timezone': 'GMT', 'hourly': hourly})
    return res

def air_quality(q):
    now = int(time.time()); start = local_midnight(now)
    T = list(range(start, start + 5 * DAYSEC, 3600))
    rnd = random.Random(3)
    eu = [round(22 + 18 * math.sin(i / 9) + rnd.uniform(0, 6)) for i in range(len(T))]
    us = [round(v * 1.4) for v in eu]
    h = {'time': T, 'european_aqi': eu, 'us_aqi': us, 'pm2_5': [round(v * 0.45, 1) for v in eu], 'pm10': [round(v * 0.8, 1) for v in eu], 'nitrogen_dioxide': [round(12 + v * 0.3, 1) for v in eu],
         'ozone': [round(60 + v, 1) for v in eu], 'sulphur_dioxide': [round(3 + v * 0.05, 1) for v in eu], 'carbon_monoxide': [round(180 + v * 2) for v in eu], 'dust': [round(v * 0.2, 1) for v in eu],
         'alder_pollen': [None] * len(T), 'birch_pollen': [0.0] * len(T), 'grass_pollen': [round(abs(math.sin(i / 7)) * 14, 1) for i in range(len(T))], 'mugwort_pollen': [0.2] * len(T), 'olive_pollen': [0.0] * len(T), 'ragweed_pollen': [round(abs(math.sin(i / 11)) * 4, 1) for i in range(len(T))]}
    i = max(k for k, ts in enumerate(T) if ts <= now)
    cur = {'time': now - now % 3600, 'european_aqi': eu[i], 'us_aqi': us[i], 'pm2_5': h['pm2_5'][i], 'pm10': h['pm10'][i], 'nitrogen_dioxide': h['nitrogen_dioxide'][i], 'ozone': h['ozone'][i], 'sulphur_dioxide': h['sulphur_dioxide'][i], 'carbon_monoxide': h['carbon_monoxide'][i], 'dust': h['dust'][i]}
    return {'latitude': float(q['latitude'][0]), 'longitude': float(q['longitude'][0]), 'hourly': h, 'current': cur}

def marine(q):
    now = int(time.time()); start = local_midnight(now)
    T = list(range(start, start + 8 * DAYSEC, 3600))
    wave = [round(0.6 + 0.5 * math.sin(i / 14) + (0.6 if 110 < i < 130 else 0), 2) for i in range(len(T))]
    h = {'time': T, 'wave_height': wave, 'wave_direction': [round((40 + i * 2) % 360) for i in range(len(T))], 'wave_period': [round(3.5 + w * 1.6, 1) for w in wave],
         'wind_wave_height': [round(w * 0.7, 2) for w in wave], 'swell_wave_height': [round(w * 0.35, 2) for w in wave], 'swell_wave_direction': [210] * len(T), 'swell_wave_period': [6.2] * len(T),
         'sea_surface_temperature': [round(19.4 - i * 0.004, 1) for i in range(len(T))]}
    days = [start + k * DAYSEC for k in range(8)]
    return {'latitude': float(q['latitude'][0]) + 0.05, 'longitude': float(q['longitude'][0]) + 0.04, 'hourly': h,
            'daily': {'time': days, 'wave_height_max': [max(wave[k * 24:(k + 1) * 24]) for k in range(8)], 'wave_direction_dominant': [45] * 8, 'wave_period_max': [5.5] * 8}}

def ensemble(q):
    now = int(time.time())
    T, H, start = series(now=now)
    T = T[24:24 + 15 * 24]
    base = H['temperature_2m'][24:24 + 15 * 24]
    pbase = H['precipitation'][24:24 + 15 * 24]
    h = {'time': T, 'temperature_2m': base}
    rnd = random.Random(7)
    for m in range(1, 51):
        drift = rnd.gauss(0, 1)
        h[f'temperature_2m_member{m:02d}'] = [round(v + drift * (0.15 + i / 90) + rnd.gauss(0, 0.3), 1) for i, v in enumerate(base)]
        h[f'precipitation_member{m:02d}'] = [round(max(0, v * rnd.uniform(0, 2) + (rnd.random() < 0.03) * rnd.uniform(0, 1.5)), 1) for v in pbase]
    h['precipitation'] = pbase
    return {'latitude': 40.4, 'longitude': 27.3, 'timezone': 'Europe/Istanbul', 'hourly': h}

def models(q):
    now = int(time.time())
    T, H, start = series(now=now)
    T = T[24:]; base = H['temperature_2m'][24:]; pb = H['precipitation'][24:]
    ms = q['models'][0].split(',')
    h = {'time': T}; d = {'time': [start + DAYSEC * (k + 1) for k in range(16)]}
    rnd = random.Random(11)
    for j, m in enumerate(ms):
        bias = rnd.uniform(-1.5, 1.5)
        temps = [round(v + bias * (1 + i / 120) + rnd.gauss(0, 0.4), 1) for i, v in enumerate(base)]
        if m == 'ukmo_seamless': temps = [t if i < 7 * 24 else None for i, t in enumerate(temps)]
        prec = [round(max(0, v * rnd.uniform(0.3, 1.8)), 1) for v in pb]
        h[f'temperature_2m_{m}'] = temps; h[f'precipitation_{m}'] = prec
        wsb = rnd.uniform(0.8, 1.25)
        ws = [round(max(0, v * wsb + rnd.gauss(0, 1.5)), 1) if temps[i] is not None else None for i, v in enumerate(H['wind_speed_10m'][24:])]
        h[f'wind_speed_10m_{m}'] = ws; h[f'wind_gusts_10m_{m}'] = [round(x * 1.6, 1) if x is not None else None for x in ws]
        tx, tn, ps = [], [], []
        for k in range(16):
            seg = [x for x in temps[k * 24:(k + 1) * 24] if x is not None]
            tx.append(max(seg) if seg else None); tn.append(min(seg) if seg else None); ps.append(round(sum(prec[k * 24:(k + 1) * 24]), 1) if seg else None)
        d[f'temperature_2m_max_{m}'] = tx; d[f'temperature_2m_min_{m}'] = tn; d[f'precipitation_sum_{m}'] = ps
        d[f'wind_speed_10m_max_{m}'] = [max([x for x in ws[k * 24:(k + 1) * 24] if x is not None], default=None) for k in range(16)]
        d[f'wind_gusts_10m_max_{m}'] = [round(x * 1.6, 1) if x is not None else None for x in d[f'wind_speed_10m_max_{m}']]
    return {'latitude': 40.4, 'longitude': 27.3, 'timezone': 'Europe/Istanbul', 'hourly': h, 'daily': d}

def archive(q):
    import datetime as dt
    s = dt.date.fromisoformat(q['start_date'][0]); e = dt.date.fromisoformat(q['end_date'][0])
    days = []; tx = []; tn = []; pr = []
    rnd = random.Random(s.year)
    d = s
    while d <= e:
        doy = d.timetuple().tm_yday
        seas = 15 + 10 * math.sin(2 * math.pi * (doy - 110) / 365)
        days.append(d.isoformat()); tx.append(round(seas + 4 + rnd.gauss(0, 2.5), 1)); tn.append(round(seas - 4 + rnd.gauss(0, 2.5), 1)); pr.append(round(max(0, rnd.gauss(0, 4)), 1))
        d += dt.timedelta(days=1)
    return {'latitude': 40.4, 'longitude': 27.3, 'daily': {'time': days, 'temperature_2m_max': tx, 'temperature_2m_min': tn, 'precipitation_sum': pr}}

def geocode(q):
    name = q.get('name', [''])[0].lower()
    places = [
        {'id': 1, 'name': 'Karabiga', 'latitude': 40.40306, 'longitude': 27.30306, 'elevation': 5, 'timezone': 'Europe/Istanbul', 'country_code': 'TR', 'country': 'Türkiye', 'admin1': 'Çanakkale', 'admin2': 'Biga'},
        {'id': 2, 'name': 'Karabük', 'latitude': 41.20, 'longitude': 32.62, 'elevation': 280, 'timezone': 'Europe/Istanbul', 'country_code': 'TR', 'country': 'Türkiye', 'admin1': 'Karabük'},
        {'id': 3, 'name': 'Karachi', 'latitude': 24.86, 'longitude': 67.01, 'elevation': 8, 'timezone': 'Asia/Karachi', 'country_code': 'PK', 'country': 'Pakistan', 'admin1': 'Sindh'},
        {'id': 4, 'name': 'Tromsø', 'latitude': 69.6496, 'longitude': 18.956, 'elevation': 10, 'timezone': 'Europe/Oslo', 'country_code': 'NO', 'country': 'Norway', 'admin1': 'Troms'},
    ]
    res = [p for p in places if p['name'].lower().startswith(name[:3])]
    return {'results': res} if res else {}

def metno(q):
    now = int(time.time())
    T, H, start = series(float(q['lat'][0]), float(q['lon'][0]), n_days=10, now=now)
    first = max(i for i, ts in enumerate(T) if ts <= now)
    ts_list = []
    for i in range(first, len(T)):
        hrs = i - first
        if hrs > 60 and (T[i] // 3600) % 6 != 0: continue
        iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(T[i]))
        sym = 'rain' if H['precipitation'][min(i + 1, len(T) - 1)] > 0 else ('partlycloudy_day' if H['cloud_cover'][i] > 40 else 'clearsky_day')
        e = {'time': iso, 'data': {'instant': {'details': {'air_pressure_at_sea_level': H['pressure_msl'][i], 'air_temperature': H['temperature_2m'][i], 'cloud_area_fraction': H['cloud_cover'][i], 'cloud_area_fraction_low': H['cloud_cover_low'][i],
            'cloud_area_fraction_medium': H['cloud_cover_mid'][i], 'cloud_area_fraction_high': H['cloud_cover_high'][i], 'dew_point_temperature': H['dew_point_2m'][i], 'fog_area_fraction': 0, 'relative_humidity': H['relative_humidity_2m'][i],
            'ultraviolet_index_clear_sky': H['uv_index_clear_sky'][i], 'wind_from_direction': H['wind_direction_10m'][i], 'wind_speed': round(H['wind_speed_10m'][i] / 3.6, 1), 'wind_speed_of_gust': round(H['wind_gusts_10m'][i] / 3.6, 1)}}}}
        if hrs <= 60:
            e['data']['next_1_hours'] = {'summary': {'symbol_code': sym}, 'details': {'precipitation_amount': H['precipitation'][min(i + 1, len(T) - 1)], 'probability_of_precipitation': H['precipitation_probability'][min(i + 1, len(T) - 1)]}}
        e['data']['next_6_hours'] = {'summary': {'symbol_code': sym}, 'details': {'precipitation_amount': round(sum(H['precipitation'][i + 1:i + 7]), 1), 'probability_of_precipitation': 30}}
        ts_list.append(e)
    return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [float(q['lon'][0]), float(q['lat'][0]), 12]}, 'properties': {'meta': {'updated_at': ''}, 'timeseries': ts_list}}

class Router:
    def __init__(self, fail=(), dry=False):
        self.dry = dry
        self.fail = set(fail); self.calls = []; self.rejected_once = False; self.unmocked = []; self.tiles = set(); self.models_seen = []
        self.leaflet = (ROOT / 'vendor/leaflet/leaflet.js').read_bytes()
        # Optional: put bricolage.woff2, bricolage-ext.woff2, hanken.woff2 and hanken-ext.woff2
        # (latin / latin-ext subsets from Fontsource) in vendor/fonts to mock Google Fonts.
        # Without them the page falls back to system fonts.
        fdir = ROOT / 'vendor' / 'fonts'
        self.fonts = {f.name: f.read_bytes() for f in fdir.glob('*.woff2')} if fdir.is_dir() else {}

    def handle(self, route):
        req = route.request
        url = req.url
        u = urlparse(url); q = parse_qs(u.query)
        host = u.netloc
        self.calls.append(host + u.path)
        J = lambda obj, status=200: route.fulfill(status=status, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(obj))
        if host in ('127.0.0.1:8765', 'localhost:8765'): return route.continue_()
        if 'all' in self.fail and host not in ('fonts.googleapis.com', 'fonts.gstatic.com'): return route.abort('internetdisconnected')
        if host == 'fonts.googleapis.com':
            css = '\n'.join([
                "@font-face{font-family:'Bricolage Grotesque';font-weight:200 800;font-display:swap;src:url(https://fonts.gstatic.com/x/bricolage-ext.woff2) format('woff2');unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}",
                "@font-face{font-family:'Bricolage Grotesque';font-weight:200 800;font-display:swap;src:url(https://fonts.gstatic.com/x/bricolage.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}",
                "@font-face{font-family:'Hanken Grotesk';font-weight:400 700;font-display:swap;src:url(https://fonts.gstatic.com/x/hanken-ext.woff2) format('woff2');unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}",
                "@font-face{font-family:'Hanken Grotesk';font-weight:400 700;font-display:swap;src:url(https://fonts.gstatic.com/x/hanken.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}"])
            return route.fulfill(status=200, content_type='text/css', headers={'access-control-allow-origin': '*'}, body=css)
        if host == 'fonts.gstatic.com':
            font = self.fonts.get(u.path.split('/')[-1])
            if font is None: return route.fulfill(status=404, body='')
            return route.fulfill(status=200, content_type='font/woff2', headers={'access-control-allow-origin': '*'}, body=font)
        if host == 'cdnjs.cloudflare.com' and 'leaflet' in u.path:
            return route.fulfill(status=200, content_type='application/javascript', body=self.leaflet)
        if host == 'api.open-meteo.com' and u.path == '/v1/forecast':
            self.models_seen.append(q.get('models', [''])[0][:40])
            if 'forecast' in self.fail: return J({'error': True, 'reason': 'Service unavailable'}, 503)
            lats = q['latitude'][0].split(',')
            if len(lats) > 1: return J(grid(q))
            if q.get('models', [''])[0].count(',') >= 2: return J(models(q))
            hourly = q.get('hourly', [''])[0].split(',')
            if 'boundary_layer_height' in hourly and not self.rejected_once:
                self.rejected_once = True
                return J({'error': True, 'reason': 'Cannot initialize ForecastVariable from invalid String value boundary_layer_height for key hourly'}, 400)
            if self.dry: q['_dry'] = True
            return J(forecast(q))
        if host == 'air-quality-api.open-meteo.com': return J(air_quality(q))
        if host == 'marine-api.open-meteo.com': return J(marine(q))
        if host == 'ensemble-api.open-meteo.com': return J(ensemble(q))
        if host == 'archive-api.open-meteo.com': return J(archive(q))
        if host == 'geocoding-api.open-meteo.com': return J(geocode(q))
        if host == 'api.met.no': return J(metno(q))
        if host == 'api.bigdatacloud.net': return J({'city': 'Biga', 'locality': 'Karabiga', 'principalSubdivision': 'Çanakkale', 'countryName': 'Türkiye', 'countryCode': 'TR'})
        if host == 'ipwho.is': return J({'success': True, 'latitude': 40.403, 'longitude': 27.303, 'city': 'Karabiga', 'region': 'Çanakkale', 'country': 'Türkiye', 'country_code': 'TR', 'timezone': {'id': 'Europe/Istanbul'}})
        if host == 'api.rainviewer.com':
            now = int(time.time()); now -= now % 600
            return J({'version': '2.0', 'generated': now, 'host': 'https://tilecache.rainviewer.com', 'radar': {'past': [{'time': now - k * 600, 'path': f'/v2/radar/{now - k * 600}'} for k in range(12, -1, -1)]}})
        if host == 'tilecache.rainviewer.com': return route.fulfill(status=200, content_type='image/png', body=TILE_RADAR)
        if 'basemaps.cartocdn.com' in host:
            return route.fulfill(status=200, content_type='image/png', body=TILE_DARK if 'dark' in u.path else TILE_LIGHT)
        if host == 'server.arcgisonline.com':
            self.tiles.add(u.path.split('/MapServer')[0].split('/services/')[-1])
            if 'Reference' in u.path: return route.fulfill(status=200, content_type='image/png', body=TILE_RADAR)
            if 'Dark_Gray' in u.path: return route.fulfill(status=200, content_type='image/png', body=TILE_DARK)
            if 'Imagery' in u.path: return route.fulfill(status=200, content_type='image/png', body=TILE_SAT)
            return route.fulfill(status=200, content_type='image/png', body=TILE_LIGHT)
        if host == 'gibs.earthdata.nasa.gov': return route.fulfill(status=200, content_type='image/png', body=TILE_SAT)
        if 'tile.openstreetmap.org' in host or 'opentopomap' in host: return route.fulfill(status=200, content_type='image/png', body=TILE_LIGHT)
        self.unmocked.append(url)
        return route.fulfill(status=404, body='not mocked')
