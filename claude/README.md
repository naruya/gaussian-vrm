# claude/ — development helper scripts

Scripts used by Claude (and anyone else) to run and check this project from WSL with the
browser on the Windows desktop. Not part of the library or the demo pages.

| script | purpose |
|---|---|
| `serve.sh start\|stop\|status` | dev server, `node server.js` → http://localhost:8080 |
| `chrome.sh open [url]\|status\|close` | throwaway Windows Chrome (profile `C:/Windows/Temp/gvrm_preview`, DevTools on 9222) |
| `drive.sh <url\|-> <waitMs> <shot\|-> [js]` | open a page, wait, evaluate JS, page screenshot to `claude/shots/`, dump console logs |
| `shot.sh <name> [title] [index]` | capture the Chrome *window* (incl. infobars/dialogs) via `grab.ps1`, without raising it |
| `gpu.sh [samples]` | VRAM / utilization check before running the conversion |

Typical check of both sides:

```bash
claude/gpu.sh                      # make sure the GPU is not saturated by another job
claude/serve.sh start
claude/chrome.sh open
# viewer side
claude/drive.sh 'http://localhost:8080/?gvrm=./assets/sample1.gvrm' 20000 viewer \
  "JSON.stringify({ready: window.gvrm?.isReady, fps: document.getElementById('fpsdisplay')?.textContent})"
# conversion side (PLY -> GVRM, ~1.5 min; the .gvrm is downloaded to C:\Users\<user>\Downloads)
claude/drive.sh 'http://localhost:8080/?gs=./assets/sample1.ply' 240000 convert \
  "JSON.stringify({ready: window.gvrm?.isReady, load: document.getElementById('loaddisplay')?.textContent, err: document.getElementById('error-display')?.innerText})"
claude/chrome.sh close
```

Why it is built this way:

- **http, not https.** Chrome treats `http://localhost` as a secure context, so WebGL, WebXR and
  downloads work without a certificate and without `--ignore-certificate-errors` (which shows a
  permanent warning bar). `server.js` still serves https on 8443 when `.server/*.pem` exist, for
  headsets on the LAN.
- **Headed Chrome on Windows, not headless.** Headless Chrome in WSL only gets a software
  rasterizer and `requestAnimationFrame` barely runs, so WebGL pages render black. The desktop
  Chrome uses the real GPU.
- **Own profile, forward slashes.** Without `--user-data-dir` the URL is handed to the user's
  running Chrome and tabs pile up there. Backslashes in the path are eaten by the shells that
  `mtask bg` runs the command through.
- **CDP client on Windows.** WSL is in NAT mode and Windows Firewall blocks WSL → Windows
  connections, while headed Chrome only listens on 127.0.0.1. So `drive.sh` copies `drive.mjs` to
  `C:/Windows/Temp/gvrm_driver` and runs it with the Windows `node.exe` + `puppeteer-core`.
