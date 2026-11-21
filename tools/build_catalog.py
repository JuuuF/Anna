#!/usr/bin/env python3
"""Builds data/stars.json and data/sky.json from public catalogues.

Usage: python3 -I tools/build_catalog.py <raw-dir> <out-dir>

<raw-dir> must contain:
  hyg.csv      HYG database v4.0 (astronexus/HYG-Database, CC BY-SA 4.0)
               -> Hipparcos, Yale Bright Star and Gliese catalogues, IAU star names
  exo.csv      NASA Exoplanet Archive, table pscomppars, sy_dist < 34 pc
               columns: hostname,pl_name,sy_dist,ra,dec,pl_rade,pl_bmasse,pl_insol,sy_pnum,sy_vmag,st_teff
  lines.json   constellation lines  (ofrohn/d3-celestial, BSD-3)
  cons.json    constellation names  (ofrohn/d3-celestial, BSD-3)
"""
import csv, json, math, sys, os

raw, out = sys.argv[1], sys.argv[2]
LY = 3.26156
MAX_LY = 110          # stars the light of a lifetime can reach, plus some room for the future
SKY_MAG = 4.9         # background stars of the night-sky map

GREEK = dict(Alp='Alpha', Bet='Beta', Gam='Gamma', Del='Delta', Eps='Epsilon', Zet='Zeta', Eta='Eta', The='Theta',
             Iot='Iota', Kap='Kappa', Lam='Lambda', Mu='My', Nu='Ny', Xi='Xi', Omi='Omikron', Pi='Pi', Rho='Rho',
             Sig='Sigma', Tau='Tau', Ups='Ypsilon', Phi='Phi', Chi='Chi', Psi='Psi', Ome='Omega')
GERMAN = {'Vega': 'Wega', 'Arcturus': 'Arktur', 'Procyon': 'Prokyon', 'Altair': 'Atair', 'Capella': 'Kapella',
          "Barnard's Star": 'Barnards Stern', "Kapteyn's Star": 'Kapteyns Stern', "Luyten's Star": 'Luytens Stern',
          "Van Maanen's Star": 'Van Maanens Stern', 'Rigil Kentaurus': 'Alpha Centauri', 'Betelgeuse': 'Beteigeuze',
          'Polaris': 'Polarstern', "Teegarden's Star": 'Teegardens Stern',
          'Ran': 'Epsilon Eridani', 'Helvetios': '51 Pegasi', 'Copernicus': '55 Cancri'}
SKIP = {'Sol', 'Toliman', 'Struve 2398 B'}

cons = {f['id']: f['properties'] for f in json.load(open(os.path.join(raw, 'cons.json')))['features']}
rows = list(csv.DictReader(open(os.path.join(raw, 'hyg.csv'), encoding='utf-8')))


def designation(x):
    con = cons.get(x['con'])
    if not con:
        return ''
    if x['bayer']:
        letter, _, idx = x['bayer'].partition('-')
        if letter in GREEK:
            return f"{GREEK[letter]}{'-' + idx if idx else ''} {con['gen']}"
    if x['flam']:
        return f"{x['flam']} {con['gen']}"
    return ''


def entry(x):
    return dict(n='', d=round(float(x['dist']) * LY, 3), ra=round(float(x['ra']) * 15, 3), dec=round(float(x['dec']), 3),
                mag=round(float(x['mag']), 2), ci=round(float(x['ci']), 2) if x['ci'] else 0.6,
                con=cons.get(x['con'], {}).get('de', '').replace('\u2005', ' '))


def sep(a, b):
    return math.hypot((a['ra'] - b['ra']) * math.cos(math.radians(a['dec'])), a['dec'] - b['dec'])


near = []          # every HYG star within reach, used to match exoplanet hosts
stars = []
for x in rows:
    dist = float(x['dist'])
    if x['proper'] in SKIP or dist <= 0 or dist * LY > MAX_LY:
        continue
    e = entry(x)
    e['_pick'] = False
    if x['proper']:
        e['n'], e['_pick'], e['_rank'] = GERMAN.get(x['proper'], x['proper']), True, 0
    elif designation(x) and e['mag'] <= (6 if e['d'] <= 30 else 4.6):
        e['n'], e['_pick'], e['_rank'] = designation(x), True, 1
    else:
        e['n'], e['_rank'] = designation(x), 2
    near.append(e)

# exoplanets: annotate hosts, and add hosts of potentially habitable planets
hosts = {}
for p in csv.DictReader(open(os.path.join(raw, 'exo.csv'), encoding='utf-8')):
    h = hosts.setdefault(p['hostname'], dict(ra=float(p['ra']), dec=float(p['dec']), d=float(p['sy_dist']) * LY,
                                             mag=float(p['sy_vmag'] or 15), teff=float(p['st_teff'] or 3500), pl=0, hz=[]))
    h['pl'] += 1
    insol = float(p['pl_insol']) if p['pl_insol'] else None
    small = (p['pl_rade'] and float(p['pl_rade']) <= 1.8) or (p['pl_bmasse'] and float(p['pl_bmasse']) <= 8)
    if insol is not None and 0.2 <= insol <= 1.7 and small:
        h['hz'].append(p['pl_name'])
for name, h in hosts.items():
    if h['d'] > MAX_LY:
        continue
    match = [e for e in near if sep(e, h) < 0.03 or (sep(e, h) < 0.15 and abs(e['d'] - h['d']) / h['d'] < 0.15)]
    match.sort(key=lambda e: e['mag'])
    if match:
        e = match[0]
        if e['_rank'] == 2:
            e['d'] = round(h['d'], 3)       # faint star: the archive distance (Gaia) is the better one
    elif h['hz']:
        ci = 1.6 if h['teff'] < 3800 else 1.0 if h['teff'] < 5000 else 0.65
        e = dict(n='', d=round(h['d'], 3), ra=round(h['ra'], 3), dec=round(h['dec'], 3), mag=round(h['mag'], 2), ci=ci,
                 con='', _pick=False, _rank=2)
        near.append(e)
    else:
        continue
    e['pl'] = h['pl']
    if h['hz']:
        e['hz'] = h['hz']
        if not e['_pick']:
            e['_pick'] = True
            e['n'] = e['n'] or GERMAN.get(name, name)

# one entry per star system position
picked = sorted([e for e in near if e['_pick']], key=lambda e: (e['_rank'], e['mag']))
for e in picked:
    if not any(sep(e, s) < 0.03 and abs(e['d'] - s['d']) / s['d'] < 0.05 for s in stars):
        stars.append(e)
for e in stars:
    del e['_pick'], e['_rank']
stars.sort(key=lambda e: e['d'])

# night sky background
sky = []
for x in rows:
    if x['proper'] == 'Sol' or float(x['mag']) > SKY_MAG:
        continue
    dist = float(x['dist'])
    name = GERMAN.get(x['proper'], x['proper']) if x['proper'] and float(x['mag']) < 2.1 else ''
    sky.append([round(float(x['ra']) * 15, 2), round(float(x['dec']), 2), round(float(x['mag']), 1),
                round(float(x['ci']), 1) if x['ci'] else 0.6, round(dist * LY, 1) if dist < 90000 else 0, name])
# constellations: id, German name, position of the name, figure lines
lines = {f['id']: [[[round(lon % 360, 2), round(lat, 2)] for lon, lat in seg] for seg in f['geometry']['coordinates']]
         for f in json.load(open(os.path.join(raw, 'lines.json')))['features']}
figures = [[f['id'], f['properties']['de'].replace('\u2005', ' '), round(f['geometry']['coordinates'][0] % 360, 1), round(f['geometry']['coordinates'][1], 1), lines.get(f['id'], [])]
           for f in json.load(open(os.path.join(raw, 'cons.json')))['features']]

os.makedirs(out, exist_ok=True)
json.dump(stars, open(os.path.join(out, 'stars.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(dict(stars=sky, cons=figures), open(os.path.join(out, 'sky.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(stars), 'stars,', len(sky), 'sky stars,', len(figures), 'constellations')
print('habitable:', [(e['n'], e['d'], e['hz']) for e in stars if e.get('hz')])
print('within 57 ly:', len([e for e in stars if e['d'] < 57]))
