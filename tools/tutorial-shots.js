// Runs every AI lab tool the way tutorials.html describes it, takes annotated screenshots and records the results.
//   node tools/tutorial-shots.js
// Writes media/tutorial/*.png and media/tutorial/results.json, which tutorials.html quotes and checks/browser.js
// compares with the page. Needs Playwright with Chromium, like tools/media.js. The tools use fixed seeds, so the
// numbers repeat; only measured times (speed-ups, seconds) vary with the machine. Takes a few minutes, most of it
// the robust optimiser search.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'media', 'tutorial');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let f = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([\\/]*\.\.)+/, ''); if (f.endsWith('/')) f += 'index.html';
      const full = path.join(ROOT, f); if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(full, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' }); res.end(d); });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/`, browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
  const page = await ctx.newPage(), R = { generated: new Date().toISOString().slice(0, 10) };
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForTimeout(1200);
  // numbered markers next to controls; [selector, number] pairs
  await page.addStyleTag({ content: '.tut-mark{position:absolute;width:26px;height:26px;border-radius:50%;background:#c2410c;color:#fff;font:700 14px Ubuntu,sans-serif;display:grid;place-items:center;z-index:9999;box-shadow:0 0 0 2px #fff;pointer-events:none}' });
  const mark = (list) => page.evaluate((L) => {
    document.querySelectorAll('.tut-mark').forEach((e) => e.remove());
    L.forEach(([sel, n]) => { const el = document.querySelector(sel); if (!el) return; const r = el.getBoundingClientRect(); const d = document.createElement('div'); d.className = 'tut-mark'; d.textContent = n; d.style.left = `${r.left + scrollX - 13}px`; d.style.top = `${r.top + scrollY - 13}px`; document.body.appendChild(d); });
  }, list);
  const shot = async (sel, name) => { const el = await page.$(sel); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await el.screenshot({ path: path.join(OUT, name) }); console.log('  ' + name); };
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/[ \t]+/g, ' ').trim() : null; }, sel);
  const tab = (id) => page.evaluate((t) => document.querySelector(`[data-aitab="${t}"]`).click(), id);
  const done = (fn, ms) => page.waitForFunction(fn, null, { timeout: ms || 300000 });
  const kpis = () => page.evaluate(() => { const k = FlushApp.kpis(); return { clean: +k.clean.toFixed(1), solids: +k.solids.toFixed(1), paper: +k.paper.toFixed(1), water: +k.water.toFixed(2) }; });

  // 1 · design optimiser: the oval bowl to targets
  console.log('optimiser');
  await page.evaluate(() => FlushApp.apply({ ovality: 1.35 })); await page.waitForTimeout(400);
  R.optStart = await kpis();
  await tab('aiOpt');
  await page.evaluate(() => { document.getElementById('goalTargets').click(); const v = (id, x) => { document.getElementById(id).value = x; document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true })); document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true })); };
    v('tWater', '4.0'); v('tClean', '87'); v('tSolids', '95'); v('tPaper', '80'); v('tNoise', '0'); v('optEffort', 'quick'); v('optFlush', 'full'); });
  R.optVars = await page.evaluate(() => [...document.querySelectorAll('#optVarsJets input:checked, #optVarsBowl input:checked')].map((i) => i.nextElementSibling.textContent));
  await mark([['#aiOpt .opt-box:nth-of-type(1) legend', 1], ['#optFlush', 2], ['#goalTargets', 3], ['#tWater', 4], ['#tNoise', 5], ['#tPick', 6], ['#optEffort', 7], ['#optRobust', 8], ['#optRun', 9]]);
  await shot('#aiOpt .opt-setup', 'opt-setup.png'); await mark([]);
  let t0 = Date.now();
  await page.click('#optRun');
  await done(() => /meeting all targets|No design met/.test(document.getElementById('optBest').innerText) && !document.getElementById('optRun').disabled);
  R.optSeconds = Math.round((Date.now() - t0) / 1000);
  R.optBest = await text('#optBest'); R.optStatus = await text('#optStatus'); R.optTable = await text('#optTable');
  R.optTableTitle = await text('#optTableTitle');
  await mark([['#cvOpt', 1], ['#optBest', 2], ['#optTable', 3]]);
  await shot('#aiOpt .ai-grid', 'opt-result.png'); await mark([]);
  await shot('#optTable', 'opt-table.png');
  // the same search, robust to the tolerances of the tolerance study
  console.log('robust optimiser');
  await page.evaluate(() => { document.getElementById('optRobust').checked = true; document.getElementById('optRobust').dispatchEvent(new Event('change', { bubbles: true })); });
  t0 = Date.now();
  await page.click('#optRun');
  await page.waitForTimeout(500);
  await done(() => /meeting all targets|No design met/.test(document.getElementById('optBest').innerText) && !document.getElementById('optRun').disabled, 900000);
  R.robSeconds = Math.round((Date.now() - t0) / 1000);
  R.robBest = await text('#optBest');
  await page.evaluate(() => { document.getElementById('optRobust').checked = false; document.getElementById('optRobust').dispatchEvent(new Event('change', { bubbles: true })); });

  // 2 · neural surrogate
  console.log('neural surrogate');
  await tab('aiSur'); await page.selectOption('#surN', '300');
  await page.click('#surRun');
  await done(() => /times faster/.test(document.getElementById('surSpeed').innerText) && !document.getElementById('surRun').disabled);
  R.surTable = await text('#surTable'); R.surSpeed = await text('#surSpeed'); R.surStatus = await text('#surStatus');
  await mark([['#surN', 1], ['#surRun', 2], ['#cvSurLoss', 3], ['#cvSurPar', 4], ['#surTable', 5]]);
  await shot('#aiSur', 'surrogate.png'); await mark([]);

  // 3 · hybrid calibration
  console.log('hybrid calibration');
  await tab('aiHyb'); await page.selectOption('#hybN', '6');
  await page.click('#hybRun');
  await done(() => !document.getElementById('hybRun').disabled && document.getElementById('hybSum').innerText.trim().length > 20);
  R.hybSum = await text('#hybSum'); R.hybLog = await text('#hybLog'); R.hybTable = await text('#hybTable');
  await mark([['#hybN', 1], ['#hybRun', 2], ['#cvHybBars', 3], ['#cvHybPar', 4], ['#hybLog', 5]]);
  await shot('#aiHyb', 'hybrid.png'); await mark([]);

  // 4 · noise calibration, demo with synthetic recordings
  console.log('noise calibration');
  await tab('aiNoise'); await page.selectOption('#nzDemoN', '6');
  await page.click('#nzDemoRun');
  await done(() => document.getElementById('nzSum').innerText.trim().length > 20 && !document.getElementById('nzFitRun').disabled, 300000);
  R.nzSum = await text('#nzSum'); R.nzCoef = await text('#nzCoefTable'); R.nzTable = await text('#nzTable'); R.nzStatus = await text('#nzStatus');
  await mark([['#nzModeDemo', 1], ['#nzModeReal', 2], ['#nzDemoN', 3], ['#nzFitVars', 4], ['#nzFitRun', 5], ['#cvNzPar', 6], ['#nzCoefTable', 7]]);
  await shot('#aiNoise', 'noise.png'); await mark([]);

  // 5 · physics-informed network: whole flush, then a video that stops after 3 s
  console.log('physics-informed network');
  await page.evaluate(() => FlushPinnUI.show()); await page.selectOption('#pnData', 'dense');
  await page.evaluate(() => FlushPinnUI.run()); await page.waitForTimeout(300);
  await done(() => !FlushPinnUI.busy() && document.getElementById('pnSum').innerText.trim().length > 40);
  R.pnDense = await text('#pnSum'); R.pnDenseTable = await text('#pnTable');
  await mark([['#pnData', 1], ['#pnRun', 2], ['#cvPnLevel', 3], ['#cvPnCoef', 4], ['#pnTable', 5]]);
  await shot('#aiPinn', 'pinn.png'); await mark([]);
  await page.selectOption('#pnData', 'cut');
  await page.evaluate(() => FlushPinnUI.run()); await page.waitForTimeout(300);
  await done(() => !FlushPinnUI.busy() && document.getElementById('pnSum').innerText.trim().length > 40);
  R.pnCut = await text('#pnSum'); R.pnCutTable = await text('#pnTable');
  await shot('#cvPnLevel', 'pinn-cut.png');

  // 6 · field surrogate
  console.log('field surrogate');
  await page.evaluate(() => FlushFieldUI.show());
  await page.evaluate(() => FlushFieldUI.run()); await page.waitForTimeout(300);
  await done(() => !FlushFieldUI.busy() && document.getElementById('fsSum').innerText.trim().length > 40);
  R.fsSum = await text('#fsSum'); R.fsTable = await text('#fsTable');
  await mark([['#fsRun', 1], ['#cvFsCurve', 2], ['#fsSel', 3], ['.fs-maps', 4], ['#fsTable', 5]]);
  await shot('#aiField', 'field.png'); await mark([]);

  R.pageErrors = errs;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 1) + '\n');
  console.log('  results.json' + (errs.length ? `, page errors: ${errs.join(' | ')}` : ''));
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
