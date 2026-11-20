#!/bin/sh
# Screenshots of the local page at phone, tablet and desktop sizes.
# Usage: sh tools/shots.sh <out-dir> <name> '<hash>'     (needs: python3 -m http.server 8791 --bind 127.0.0.1)
out=$1; name=$2; hash=$3
for dev in phone:390,844 tabp:820,1180 tabl:1180,820 desk:1440,900; do
  chromium --headless --disable-gpu --enable-logging=stderr --hide-scrollbars --screenshot="$out/$name-${dev%%:*}.png" --window-size="${dev##*:}" \
    --virtual-time-budget=${BUDGET:-7000} "http://127.0.0.1:8791/index.html$hash" 2>&1 | grep -E "CONSOLE.*(Uncaught|Error)" | head -3
done
