// Browser checks of the simulator page: presets, rim gap, undo and demo history, pinned reference, AI lab details.
// Needs Playwright with Chromium (not a dependency of the page itself):
//   npm install --no-save playwright && npx playwright install chromium
//   node checks/browser.js            serves this repository on a free local port and tests it
//   node checks/browser.js <url>      tests a running copy instead, for example the live site
// Check names starting with F-numbers or Open refer to the findings of the independent review of 1.3.0, fixed in 1.3.1.
// Takes about two minutes (the demo, an optimiser search and a surrogate training run). Exits with code 1 on any failure.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let f = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([\\/]*\.\.)+/, '');
      if (f.endsWith('/')) f += 'index.html';
      const full = path.join(ROOT, f);
      if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(full, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' }); res.end(d); });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const out = [];
const ok = (name, cond, info) => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' :: ' + JSON.stringify(info) : ''}`); };

(async () => {
  let srv = null, base = process.argv[2];
  if (!base) { srv = await serve(); base = `http://127.0.0.1:${srv.address().port}/`; }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // an error from another host (web fonts behind a firewall, say) is not a page error
  page.on('console', (m) => { if (m.type() === 'error' && !(m.text().startsWith('Failed to load resource') && !(m.location().url || '').startsWith(base))) errs.push(m.text()); });
  const fresh = async () => { await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForTimeout(400); };
  const P = () => page.evaluate(() => FlushApp.getP());
  const slide = (k, v) => page.evaluate(([k, v]) => { const i = document.getElementById('p_' + k); i.value = v; i.dispatchEvent(new Event('input')); }, [k, v]);
  const undoInfo = () => page.evaluate(() => ({ dis: document.getElementById('undoBtn').disabled, title: document.getElementById('undoBtn').title }));
  const chips = () => page.evaluate(() => document.querySelectorAll('#results .delta').length);

  // F-04 preset sync
  await fresh();
  await page.selectOption('#preset', 'siphonic'); await page.waitForTimeout(100);
  await page.click('#undoBtn'); await page.waitForTimeout(100);
  ok('F04 undo returns dropdown to washdown', (await page.inputValue('#preset')) === 'washdown' && (await P()).type === 'washdown', await page.inputValue('#preset'));
  await page.selectOption('#preset', 'siphonic'); await page.waitForTimeout(100);
  ok('F04 siphonic can be picked again', (await P()).type === 'siphonic');
  await page.click('#undoBtn'); await page.waitForTimeout(100);
  await page.click('#resetBtn'); await page.waitForTimeout(100);
  ok('F04 reset after undo gives washdown', (await P()).type === 'washdown');
  await page.click('[data-type="siphonic"]'); await page.waitForTimeout(150);
  const p1 = await P(), seal = await page.textContent('#kSeal');
  ok('F04 trap button to siphonic sets refill and dropdown', p1.refill === 0.6 && (await page.inputValue('#preset')) === 'siphonic', { refill: p1.refill, seal });
  await page.click('[data-type="washdown"]'); await page.waitForTimeout(150);
  ok('F04 trap button back to washdown sets dropdown', (await page.inputValue('#preset')) === 'washdown');
  ok('F10 preset label', (await page.textContent('#preset option[value=siphonic]')).includes('0.6 L refill'));

  // F-06 rim gap
  await fresh();
  await slide('Rpool', 110); let q = await P();
  ok('F06 pool slider stops 25 mm below rim', q.Rpool === q.Rrim - 25 || q.Rpool <= q.Rrim - 25, { Rrim: q.Rrim, Rpool: q.Rpool });
  await slide('Rrim', 110); q = await P();
  ok('F06 rim slider stops 25 mm above pool', q.Rrim >= q.Rpool + 25, { Rrim: q.Rrim, Rpool: q.Rpool, slider: await page.inputValue('#p_Rrim') });
  ok('F06 slider shows clamped value', +(await page.inputValue('#p_Rrim')) === q.Rrim && +(await page.inputValue('#p_Rpool')) === q.Rpool);
  // stored design that breaks the gap
  await page.evaluate(() => { const p = FlushApp.getP(); p.Rrim = 110; p.Rpool = 110; localStorage.setItem('tfs-params-v1', JSON.stringify(p)); });
  await page.goto(base); await page.waitForTimeout(300); q = await P();
  ok('F06 stored violating design is corrected on load', q.Rpool === 85, { Rrim: q.Rrim, Rpool: q.Rpool });
  await fresh();
  // sweep rim x pool
  await page.selectOption('#swX', 'Rrim'); await page.selectOption('#swY', 'Rpool');
  await page.click('#swRun'); await page.waitForFunction(() => FlushApp._test.sweep() && FlushApp._test.sweep().done === 144, null, { timeout: 60000 });
  const sw = await page.evaluate(() => document.getElementById('swBest').textContent);
  ok('F06 sweep finishes and reports a best cell', sw.length > 0, sw.slice(0, 120));
  // the top-left cell (smallest rim, largest pool) breaks the 25 mm gap
  const box = await page.locator('#cvSweep').boundingBox();
  const before = await P();
  await page.mouse.move(box.x + 54 + 5, box.y + 8 + 5); await page.waitForTimeout(50);
  const hov = await page.textContent('#swHov');
  await page.mouse.click(box.x + 54 + 5, box.y + 8 + 5); await page.waitForTimeout(100);
  const after = await P();
  ok('F06 blocked sweep cell explains and does not load', hov.includes('25 mm') && before.Rrim === after.Rrim && before.Rpool === after.Rpool, hov);

  // F-05 burst + applyNow
  await fresh();
  await slide('alpha', 20); await page.waitForTimeout(100);
  await page.click('#resetBtn'); await page.waitForTimeout(100);
  ok('F05 reset right after slider gives 2 undo steps', (await undoInfo()).title.includes('2 steps'), await undoInfo());
  await page.click('#undoBtn'); await page.waitForTimeout(100);
  ok('F05 first undo returns slider state', (await P()).alpha === 20, (await P()).alpha);

  // F-05 demo leaves nothing behind
  await fresh();
  const preChips = await chips(), preUndo = await undoInfo();
  await page.click('#demoBtn');
  const next = async () => { await page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 60000 }); await page.click('#tourNext'); };
  for (let i = 0; i < 7; i++) await next();
  await page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 60000 });
  const step7 = await page.evaluate(() => document.getElementById('tourText').innerText);
  ok('Demo still loads a winner', /Cleaning \d+ %/.test(step7), step7.replace(/\s+/g, ' ').slice(0, 400));
  await next(); await page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 60000 });
  await page.click('#tourNext'); await page.waitForTimeout(300);   // Finish
  ok('F05 finish leaves no undo steps', (await undoInfo()).dis === preUndo.dis, await undoInfo());
  ok('F05 finish leaves no delta chips', (await chips()) === preChips, { before: preChips, after: await chips() });
  ok('F05 finish restores washdown preset', (await P()).ovality === 1 && (await page.inputValue('#preset')) === 'washdown');
  // keep this design
  await page.click('#demoBtn');
  for (let i = 0; i < 8; i++) await next();
  await page.waitForFunction(() => !!document.getElementById('tourKeep'), null, { timeout: 60000 });
  await page.click('#tourKeep'); await page.waitForTimeout(300);
  const kept = await P();
  ok('F05 keep: one undo step', (await undoInfo()).title.includes('(1 step)'), { u: await undoInfo(), ovality: kept.ovality });
  await page.click('#undoBtn'); await page.waitForTimeout(150);
  ok('F05 keep then undo returns own design', (await P()).ovality === 1);

  // open item 1: close during step 7 and reopen
  await fresh();
  await page.click('#demoBtn');
  for (let i = 0; i < 6; i++) await next();
  await page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 60000 });
  await page.click('#tourNext');   // step 7 starts the search
  await page.waitForTimeout(150);
  await page.click('#tourX'); await page.click('#demoBtn');
  await page.waitForTimeout(6000);
  const txt = await page.evaluate(() => ({ step: document.getElementById('tourStep').textContent, text: document.getElementById('tourText').innerText }));
  ok('Open1 reopened demo shows its own step', txt.step === 'Step 1 of 9' && !txt.text.includes('did not finish'), txt.step + ' | ' + txt.text.slice(0, 80));
  await page.click('#tourX');

  // F-17 pin vs coefficients
  await fresh();
  await page.click('#pinBtn'); await page.waitForTimeout(100);
  await slide('nExp', 2.5); await page.waitForTimeout(200);
  const nz = await page.evaluate(() => document.getElementById('kNoise').innerText);
  ok('F17 pinned design reads 0 dB after a coefficient change', /^[±+−-]?0\.0/.test(nz.trim()), nz);
  const cmp = await page.textContent('#cmpLine');
  ok('F17 compare line says recomputed', cmp.includes('recomputed'), cmp);
  await slide('Vfull', 3.0); await page.waitForTimeout(200);
  const ck = await page.evaluate(() => document.getElementById('kWater').innerText);
  ok('F17 design change still shows a delta', /[+−]/.test(ck), ck);

  // F-08.3 noise target counts for the current design
  await fresh();
  await page.evaluate(() => document.querySelector('[data-aitab="aiOpt"]').click());
  await page.click('#goalTargets');
  await page.fill('#tWater', '9'); await page.fill('#tClean', '0'); await page.fill('#tSolids', '0'); await page.fill('#tPaper', '0'); await page.fill('#tNoise', '-2');
  await page.evaluate(() => document.getElementById('tPaper').dispatchEvent(new Event('input')));
  await page.evaluate(() => FlushAI.run());
  const curLine = await page.evaluate(() => document.querySelector('#optBest p').innerText);
  ok('F08 current design flagged as too loud', curLine.includes('too loud'), curLine);

  // F-07 surrogate and partial flush
  await fresh();
  await page.evaluate(() => document.querySelector('[data-aitab="aiSur"]').click());
  await page.click('#surRun');
  await page.waitForFunction(() => !document.getElementById('surRun').disabled && document.getElementById('surCur').innerText.length > 10, null, { timeout: 180000 });
  await page.click('#mPart'); await page.waitForTimeout(300);
  const sc = await page.evaluate(() => ({ cur: document.getElementById('surCur').innerText, stale: document.getElementById('surStale').hidden }));
  ok('F07 surrogate readout says full flush and notes partial', sc.cur.includes('full flush') && sc.cur.includes('partial flush'), sc.cur.slice(0, 200));
  await page.click('#mFull'); await slide('Vpart', 3.5); await page.waitForTimeout(300);
  ok('F07 Vpart change does not mark surrogate stale', await page.evaluate(() => document.getElementById('surStale').hidden));
  await slide('Dwall', 120); await page.waitForTimeout(300);
  ok('F07 bowl depth change still marks surrogate stale', !(await page.evaluate(() => document.getElementById('surStale').hidden)));

  // F-15 links
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h && h.includes('fintlp.github.io/jet-flush-model')));
  ok('F15 no absolute self links', hrefs.length === 0, hrefs);

  ok('No page errors', errs.length === 0, errs.slice(0, 5));
  console.log(out.join('\n'));
  const failed = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`${out.length} checks: ${failed} failed`);
  console.log(failed ? 'FAILED' : 'passed');
  await browser.close(); if (srv) srv.close();
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(1); });
