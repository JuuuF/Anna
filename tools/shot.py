#!/usr/bin/env python3
"""Real-time screenshots of the local page, through Chromium's remote debugging protocol.

Usage: python3 tools/shot.py <out.png> '<hash>' [width height] [seconds] [javascript to run before the picture]
Needs a running headless Chromium:  chromium --headless --remote-debugging-port=9333
and the local server:               python3 -m http.server 8791 --bind 127.0.0.1
Prints the page title afterwards (with '#messen' in the hash that is the drawing time per picture).
"""
import base64, json, sys, time, urllib.request
from websocket import create_connection

out, hash_ = sys.argv[1], sys.argv[2]
w, h = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1440, 900)
wait = float(sys.argv[5]) if len(sys.argv) > 5 else 6
script = sys.argv[6] if len(sys.argv) > 6 else ''

tab = json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:9333/json/new?about:blank', method='PUT')))
ws = create_connection(tab['webSocketDebuggerUrl'], suppress_origin=True)
n = 0
def call(method, **params):
    global n
    n += 1
    ws.send(json.dumps(dict(id=n, method=method, params=params)))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n:
            return m.get('result', m)
call('Emulation.setDeviceMetricsOverride', width=w, height=h, deviceScaleFactor=1, mobile=w < 700)
call('Page.navigate', url='http://127.0.0.1:8791/index.html' + hash_)
time.sleep(wait)
if script:
    call('Runtime.evaluate', expression=script)
    time.sleep(2.5)
png = call('Page.captureScreenshot', format='png')['data']
open(out, 'wb').write(base64.b64decode(png))
print(call('Runtime.evaluate', expression='document.title')['result'].get('value'))
urllib.request.urlopen(f"http://127.0.0.1:9333/json/close/{tab['id']}")
