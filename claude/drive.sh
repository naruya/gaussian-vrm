#!/usr/bin/env bash
# Run claude/drive.mjs with Windows node.exe against the preview Chrome (claude/chrome.sh open).
#
#   claude/drive.sh <url|-> <waitMs> <shot-name|-> [jsExpression]
#
# Screenshots are written to claude/shots/<shot-name>.png (gitignored). The driver and its
# puppeteer-core dependency live in C:/Windows/Temp/gvrm_driver on the Windows side; they are
# (re)installed automatically when missing or when drive.mjs changed.
#
# Examples:
#   claude/drive.sh 'http://localhost:8080/?gvrm=./assets/sample1.gvrm' 20000 viewer 'window.gvrm?.isReady'
#   claude/drive.sh 'http://localhost:8080/?gs=./assets/sample1.ply' 240000 convert \
#     "JSON.stringify({ready: window.gvrm?.isReady, load: document.getElementById('loaddisplay')?.textContent, err: document.getElementById('error-display')?.innerText})"
#   claude/drive.sh - 0 - 'document.getElementById("fpsdisplay")?.textContent'
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
NODE="/mnt/c/Program Files/nodejs/node.exe"
CMD=/mnt/c/Windows/System32/cmd.exe
DRV_WSL=/mnt/c/Windows/Temp/gvrm_driver
DRV_WIN='C:/Windows/Temp/gvrm_driver'

mkdir -p "$DRV_WSL" "$HERE/shots"
if [ ! -f "$DRV_WSL/package.json" ]; then
  echo '{"name":"gvrm-driver","private":true,"type":"module"}' > "$DRV_WSL/package.json"
fi
if [ ! -d "$DRV_WSL/node_modules/puppeteer-core" ]; then
  echo "installing puppeteer-core on the Windows side ($DRV_WIN)..." >&2
  (cd "$DRV_WSL" && "$CMD" /c "npm install puppeteer-core@25 --no-audit --no-fund --loglevel=error" >/dev/null 2>&1)
fi
if ! cmp -s "$HERE/drive.mjs" "$DRV_WSL/drive.mjs"; then
  cp "$HERE/drive.mjs" "$DRV_WSL/drive.mjs"
fi

url=${1:-}; wait=${2:-0}; shot=${3:--}; expr=${4:-}
shot_win='-'
if [ "$shot" != '-' ]; then
  shot_win="$(wslpath -w "$HERE/shots")/$shot.png"
  shot_win=${shot_win//\\//}
fi
cd "$DRV_WSL"
"$NODE" drive.mjs "$url" "$wait" "$shot_win" "$expr"
if [ "$shot" != '-' ]; then echo "screenshot: $HERE/shots/$shot.png" >&2; fi
