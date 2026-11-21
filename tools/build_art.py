#!/usr/bin/env python3
"""Prepares the constellation figures for the night sky.

Usage: python3 -I tools/build_art.py <stellarium-dir> <hyg.csv> <repo-dir>

<stellarium-dir> holds Stellarium's "modern" sky culture: index.json and illustrations/*.png
(https://github.com/Stellarium/stellarium/tree/master/skycultures/modern).
The figures were drawn by Johan Meuris and are published under the Free Art License 1.3.
Each figure is tied to the sky by three anchor stars (Hipparcos numbers); their positions come from the HYG catalogue.
Output: art/<name>.webp (smaller copies) and data/art.json.
"""
import csv, json, os, sys
from PIL import Image

src, hyg, repo = sys.argv[1:4]
SIZE = 400
pos = {r['hip']: (round(float(r['ra']) * 15, 3), round(float(r['dec']), 3)) for r in csv.DictReader(open(hyg, encoding='utf-8')) if r['hip']}
out = {}
os.makedirs(os.path.join(repo, 'art'), exist_ok=True)
for c in json.load(open(os.path.join(src, 'index.json')))['constellations']:
    img = c.get('image')
    path = img and os.path.join(src, img['file'])
    if not img or not os.path.exists(path) or any(str(a['hip']) not in pos for a in img['anchors']):
        continue
    name = os.path.splitext(os.path.basename(img['file']))[0]
    im = Image.open(path).convert('RGB')
    im.thumbnail((SIZE, SIZE))
    im.save(os.path.join(repo, 'art', name + '.webp'), 'WEBP', quality=62, method=6)
    w, h = img['size']
    out[c['id'].split()[-1]] = dict(f=f'art/{name}.webp', a=[[round(a['pos'][0] / w, 4), round(a['pos'][1] / h, 4), *pos[str(a['hip'])]] for a in img['anchors']])
json.dump(out, open(os.path.join(repo, 'data', 'art.json'), 'w'), separators=(',', ':'))
print(len(out), 'figures')
