#!/usr/bin/env python3
"""Gives all files of the page a new version and refreshes the fingerprint of the import map.

Run from the repository root before committing a change to the page:  python3 tools/bump.py   (or: sh tools/bump.sh)

1. Every "?v=..." in index.html gets the current time, so that browsers load the new files together.
2. The page's Content-Security-Policy only lets the one inline script run whose fingerprint (SHA-256) it names:
   the import map. That fingerprint changes with the versions, so it is recomputed here.
"""
import base64, hashlib, re, time

path = 'index.html'
html = open(path, encoding='utf-8').read()
version = time.strftime('%Y%m%d%H%M%S')
html = re.sub(r'\?v=[0-9a-z]+', '?v=' + version, html)
inline = re.search(r'<script type="importmap">(.*?)</script>', html, re.S).group(1)
digest = base64.b64encode(hashlib.sha256(inline.encode('utf-8')).digest()).decode()
html, n = re.subn(r"'sha256-[A-Za-z0-9+/=]+'", f"'sha256-{digest}'", html)
assert n == 1, 'the Content-Security-Policy line with the sha256 fingerprint is missing from index.html'
open(path, 'w', encoding='utf-8').write(html)
print('version', version)
