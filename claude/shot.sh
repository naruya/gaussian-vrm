#!/usr/bin/env bash
# Capture the preview Chrome *window* (including Chrome's own UI such as infobars) to claude/shots/<name>.png.
# Does not bring the window to the front. For a page-only screenshot use drive.sh instead.
#   claude/shot.sh <name> [title-substring] [index]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
name=${1:?name}; match=${2:-Google Chrome}; index=${3:-0}
mkdir -p "$HERE/shots"
out_win=$(wslpath -w "$HERE/shots/$name.png")
"$PS" -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$HERE/grab.ps1")" -Match "$match" -Out "$out_win" -Index "$index" | tr -d '\r'
echo "screenshot: $HERE/shots/$name.png" >&2
