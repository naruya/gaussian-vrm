#!/usr/bin/env bash
# Open / close a throwaway Windows Chrome (own profile, DevTools port) from WSL.
#
#   claude/chrome.sh open [url]   launch Chrome on the Windows desktop with its own profile and
#                                 --remote-debugging-port=9222 (default url: http://localhost:8080/)
#   claude/chrome.sh status       number of chrome.exe processes using this profile, and whether 9222 listens
#   claude/chrome.sh close        kill only this profile's Chrome (never the user's own session)
#
# Notes (learned the hard way, see also claude/README.md):
# - Profile path uses forward slashes. Backslashes are eaten by the shell layers of `mtask bg` and Chrome
#   then silently joins the user's running session instead of starting its own.
# - Do not create the profile directory from WSL; let Chrome create it.
# - Launched via `mtask bg --silent` so it survives the end of a tool call and `close` does not post a
#   "failed" report. Outside MultiTasker, falls back to nohup.
# - Pages must be http://localhost (secure context without certificates), so no --ignore-certificate-errors.
set -u
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
NETSTAT=/mnt/c/Windows/System32/netstat.exe
PROFILE_WIN='C:/Windows/Temp/gvrm_preview'
PORT=9222

case ${1:-} in
  open)
    URL=${2:-http://localhost:8080/}
    CMD="'$CHROME' --user-data-dir=$PROFILE_WIN --remote-debugging-port=$PORT --no-first-run --no-default-browser-check --hide-crash-restore-bubble --new-window --window-size=1400,900 '$URL'"
    if command -v mtask >/dev/null 2>&1; then
      mtask bg --silent "$CMD" "gvrm preview chrome"
    else
      nohup bash -c "$CMD" >/dev/null 2>&1 &
    fi
    for i in $(seq 1 20); do
      sleep 1
      if "$NETSTAT" -an 2>/dev/null | grep -q "127.0.0.1:$PORT .*LISTENING"; then
        echo "chrome up, DevTools on 127.0.0.1:$PORT (Windows side), url=$URL"
        exit 0
      fi
    done
    echo "chrome did not open port $PORT within 20 s; run 'claude/chrome.sh status'" >&2
    exit 1 ;;
  status)
    n=$("$PS" -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'chrome.exe' -and \$_.CommandLine -like '*gvrm_preview*' }).Count" 2>/dev/null | tr -d '\r\n ')
    echo "chrome.exe processes with this profile: ${n:-?}"
    if "$NETSTAT" -an 2>/dev/null | grep -q "127.0.0.1:$PORT .*LISTENING"; then echo "port $PORT: LISTENING"; else echo "port $PORT: closed"; fi ;;
  close)
    "$PS" -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'chrome.exe' -and \$_.CommandLine -like '*gvrm_preview*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
    sleep 2
    "$0" status ;;
  *) echo "usage: claude/chrome.sh open [url] | status | close"; exit 2 ;;
esac
