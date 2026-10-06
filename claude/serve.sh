#!/usr/bin/env bash
# Start / stop / check the dev server (node server.js -> http://localhost:8080).
#   claude/serve.sh start | stop | status
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
PORT=${PORT:-8080}

case ${1:-} in
  start)
    if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then
      echo "already serving http://localhost:$PORT/"; exit 0
    fi
    [ -d "$HERE/node_modules/express" ] || (cd "$HERE" && npm install --no-audit --no-fund >/dev/null)
    if command -v mtask >/dev/null 2>&1; then
      mtask bg --silent "cd $HERE && node server.js" "gvrm dev server http://localhost:$PORT"
    else
      (cd "$HERE" && nohup node server.js >/dev/null 2>&1 &)
    fi
    for i in $(seq 1 10); do
      sleep 1
      if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then echo "serving http://localhost:$PORT/"; exit 0; fi
    done
    echo "server did not come up on $PORT" >&2; exit 1 ;;
  stop)
    # "[n]ode" so the pattern does not match this script's own command line
    pkill -f "[n]ode server\.js" && echo "stopped" || echo "not running" ;;
  status)
    if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then echo "up: http://localhost:$PORT/"; else echo "down"; fi
    pgrep -af "[n]ode server\.js" || true ;;
  *) echo "usage: claude/serve.sh start | stop | status"; exit 2 ;;
esac
