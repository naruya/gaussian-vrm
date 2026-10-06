// Drive the preview Chrome over CDP. Runs on *Windows* node.exe (see claude/drive.sh), because
// Windows Firewall blocks WSL -> Windows connections to 127.0.0.1:9222 and headed Chrome only
// listens on loopback.
//
//   node drive.mjs <url|-> <waitMs> <screenshot.png|-> [jsExpression]
//
//   url            page to open ("-" = stay on the current tab)
//   waitMs         time to wait after load (e.g. 20000 for a GVRM load, 240000 for a conversion)
//   screenshot.png Windows path for a page screenshot ("-" = none)
//   jsExpression   evaluated in the page after the wait; its value is printed as "result"
//
// Prints JSON: { url, result, logs } where logs are the page's console output, page errors and
// failed requests collected while this command was attached. Handy expressions:
//   window.gvrm?.isReady
//   document.getElementById('loaddisplay')?.textContent
//   document.getElementById('error-display')?.innerText
import puppeteer from 'puppeteer-core';

const [, , url, waitMs, out, expr] = process.argv;

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  let page = pages.find(p => !p.url().startsWith('chrome://') && !p.url().startsWith('devtools://'));
  if (!page) page = await browser.newPage();

  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

  if (url && url !== '-') {
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  }
  await new Promise(r => setTimeout(r, Number(waitMs || 0)));

  let result;
  if (expr) {
    try { result = await page.evaluate(expr); }
    catch (e) { result = 'EVAL ERROR: ' + e.message; }
  }
  if (out && out !== '-') await page.screenshot({ path: out });

  console.log(JSON.stringify({ url: page.url(), result, logs: logs.slice(-100) }, null, 1));
  browser.disconnect();
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
