// Browser checks of the simulator page: presets, rim gap, undo and demo history, pinned reference, AI lab details.
// Needs Playwright with Chromium (not a dependency of the page itself):
//   npm install --no-save playwright && npx playwright install chromium
//   node checks/browser.js            serves this repository on a free local port and tests it
//   node checks/browser.js <url>      tests a running copy instead, for example the live site
// Check names starting with F-numbers or Open refer to the findings of the independent review of 1.3.0, fixed in 1.3.1.
// Takes about seven minutes (the demo, normal and robust optimiser searches, the CFD check, the engineering challenge and its tour, a surrogate training run, a noise fit and two tolerance studies). Exits with code 1 on any failure.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
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
  ok('F04 trap button to siphonic sets refill and dropdown', p1.refill === 0.8 && (await page.inputValue('#preset')) === 'siphonic', { refill: p1.refill, seal });
  await page.click('[data-type="washdown"]'); await page.waitForTimeout(150);
  ok('F04 trap button back to washdown sets dropdown', (await page.inputValue('#preset')) === 'washdown');
  ok('F10 preset label', (await page.textContent('#preset option[value=siphonic]')).includes('0.8 L refill'));

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
  ok('Demo me: the last step offers part 2 of the story, the CFD check', await page.evaluate(() => (document.getElementById('tourNextTour') || {}).textContent === 'Continue with part 2: Checked against CFD'));
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

  // the search step of the demo shows the AI lab's progress
  await fresh();
  await page.click('#demoBtn');
  for (let i = 0; i < 6; i++) await next();   // the sixth Next opens step 7, which starts the search
  await page.waitForTimeout(2500);
  const tp = await page.evaluate(() => ({ step: document.getElementById('tourStep').textContent, t: document.getElementById('tourProgTxt') && document.getElementById('tourProgTxt').textContent, w: document.getElementById('tourProgFill') && parseFloat(document.getElementById('tourProgFill').style.width) }));
  ok('Demo search step shows a progress bar with what is happening', !!tp.t && /Step [12] of 2/.test(tp.t) && tp.w > 0, tp);
  await page.click('#tourX');

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
  ok('Open1 reopened demo shows its own step', txt.step.endsWith('Step 1 of 9') && !txt.text.includes('did not finish'), txt.step + ' | ' + txt.text.slice(0, 80));
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

  // Noise calibration (2.0): A-weighting of the audio analysis, the demo fit, applying the result, real recordings
  {
    const tones = await page.evaluate(() => { const an = FlushAI._test.analyzeSamples, sr = 44100, out = {}; for (const f of [100, 1000, 4000]) { const x = new Float32Array(sr * 2); for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr); out[f] = an(x, sr).peak - 20 * Math.log10(0.5 / Math.SQRT2); } return out; });
    // IEC 61672 A-weighting: -19.1 dB at 100 Hz, 0 at 1 kHz, +1.0 at 4 kHz
    ok('Noise: A-weighting of a 100 Hz, 1 kHz and 4 kHz tone within 0.5 dB', Math.abs(tones[100] + 19.1) < 0.5 && Math.abs(tones[1000]) < 0.05 && Math.abs(tones[4000] - 1.0) < 0.5, tones);
    await fresh();
    await page.evaluate(() => document.querySelector('[data-aitab="aiNoise"]').click());
    await page.click('#nzDemoRun');
    await page.waitForFunction(() => FlushAI._test.noise().fit && !FlushAI._test.noise().running, null, { timeout: 180000 });
    const F = await page.evaluate(() => { const f = FlushAI._test.noise().fit; return { loo: f.loo, rms0: f.rms0, rms1: f.rms1, rCore: f.fitted.rCore }; });
    ok('Noise demo: the fit lowers the error on designs left out', F.loo && F.loo.fit < F.loo.def - 0.2, F);
    await page.click('#nzApply'); await page.waitForTimeout(200);
    const after = await P();
    ok('Noise demo: applying sets the fitted values in the simulator', Math.abs(after.rCore - Math.round(F.rCore / 0.05) * 0.05) < 1e-9, { rCore: after.rCore, fitted: F.rCore });
    // real recordings: three designs, a generated recording each, then meter readings must not be mixed in
    await fresh();
    await page.evaluate(() => document.querySelector('[data-aitab="aiNoise"]').click());
    await page.click('#nzModeReal');
    const wav = (amp) => { const sr = 8000, n = sr * 3, b = Buffer.alloc(44 + 2 * n); b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(2 * sr, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * n, 40);
      for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(32767 * amp * Math.sin(2 * Math.PI * 1000 * i / sr)), 44 + 2 * i); return b; };
    for (const [k, v, amp] of [['Vfull', 4.0, 0.2], ['Vfull', 5.0, 0.3], ['Vfull', 6.0, 0.4]]) {
      await slide(k, v); await page.waitForTimeout(100);
      await page.setInputFiles('#nzFiles', { name: `tone-${v}.wav`, mimeType: 'audio/wav', buffer: wav(amp) });
      await page.waitForFunction((n) => FlushAI._test.noise().real.length === n && FlushAI._test.noise().real[n - 1].recs.length === 1, [['4', 1], ['5', 2], ['6', 3]].find((x) => +x[0] === v)[1], { timeout: 20000 });
    }
    const peaks = await page.evaluate(() => FlushAI._test.noise().real.map((d) => d.recs[0].peak));
    ok('Noise recordings: a 1 kHz tone file reads its level within 0.2 dB', Math.abs(peaks[0] - (20 * Math.log10(0.2) - 3.01)) < 0.2 && Math.abs(peaks[2] - (20 * Math.log10(0.4) - 3.01)) < 0.2, peaks);
    await page.click('#nzFitRun');
    await page.waitForFunction(() => FlushAI._test.noise().fit && !FlushAI._test.noise().running, null, { timeout: 120000 });
    ok('Noise recordings: three designs can be fitted', await page.evaluate(() => !!FlushAI._test.noise().fit));
    await page.fill('#nzMeter', '70'); await page.click('#nzMeterAdd'); await page.click('#nzFitRun'); await page.waitForTimeout(200);
    ok('Noise recordings: files and meter readings are not mixed in one fit', (await page.textContent('#nzStatus')).includes('cannot be mixed'));
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('tfs-noise-v1') || '[]').length);
    ok('Noise recordings: the peak levels are remembered in this browser', kept === 3, kept);
  }

  // Tolerance study (2.0): spread around the nominal design, one tolerance alone explains all of the spread,
  // all tolerances zero is refused, a changed tolerance marks the result out of date
  await fresh();
  const tolBar = [];
  const setTol = (k, v) => page.evaluate(([k, v]) => { const i = document.getElementById('tol_' + k); i.value = v; i.dispatchEvent(new Event('change')); }, [k, v]);
  const tolRun = async () => { await page.click('#tolRun'); await page.waitForTimeout(150); tolBar.push(await page.evaluate(() => !document.getElementById('tolProg').hidden)); await page.waitForFunction(() => FlushTol._test.result() && !document.getElementById('tolRun').disabled, null, { timeout: 120000 }); };
  await page.selectOption('#tolN', '40'); await tolRun();
  const T1 = await page.evaluate(() => { const r = FlushTol._test.result(), c = r.stat.clean; return { n: r.n, nom: r.nom.clean, p10: c.p10, p90: c.p90, rows: document.querySelectorAll('#tolTable tbody tr').length }; });
  ok('Tolerance study: 40 varied designs, cleaning spreads around the nominal design', T1.n === 40 && T1.p10 < T1.p90 && T1.p10 <= T1.nom + 0.5 && T1.p90 >= T1.nom - 0.5 && T1.rows === 7, T1);
  const keys = await page.evaluate(() => FlushTol.active().map((d) => d.k));
  for (const k of keys) if (k !== 'Hcr') await setTol(k, 0);
  ok('Tolerance study: a changed tolerance marks the result out of date', !(await page.evaluate(() => document.getElementById('tolStale').hidden)));
  await tolRun();
  const T2 = await page.evaluate(() => { const r = FlushTol._test.result(); return { act: r.act.map((d) => d.k), share: r.stat.clean.drv.share, r2: r.stat.clean.drv.r2, stale: document.getElementById('tolStale').hidden }; });
  ok('Tolerance study: with only the valve height varied, it explains all of the cleaning spread', T2.act.length === 1 && T2.act[0] === 'Hcr' && T2.share[0] > 0.999 && T2.stale, T2);
  await setTol('Hcr', 0); await page.click('#tolRun'); await page.waitForTimeout(200);
  ok('Tolerance study: all tolerances zero is refused', (await page.textContent('#tolStatus')).includes('All tolerances are zero'));
  await page.click('#tolReset');
  ok('Tolerance study: a progress bar shows while it runs and hides after', tolBar.length === 2 && tolBar.every(Boolean) && (await page.evaluate(() => document.getElementById('tolProg').hidden)), tolBar);
  ok('Tolerance study: Reset restores the default tolerances', (await page.evaluate(() => FlushTol.active().length)) === keys.length);

  // Robust optimiser search (2.0): rated at the low end of each design's spread, labelled, and out of date when a tolerance changes
  await page.evaluate(() => document.querySelector('[data-aitab="aiOpt"]').click());
  await page.check('#optRobust');
  await page.evaluate(() => FlushAI.run());
  const R = await page.evaluate(() => { const o = FlushAI._test.opt(); return { robust: o.robust, incomplete: o.incomplete, cur: o.cur && { clean: o.cur.clean, nom: o.cur.nom && o.cur.nom.clean, water: o.cur.water, nomW: o.cur.nom && o.cur.nom.water }, best: document.querySelector('#optBest p').innerText, status: document.getElementById('optStatus').innerText }; });
  ok('Robust search: completes, checked at full resolution and labelled', R.robust && !R.incomplete && R.best.includes('low end of its tolerance spread') && R.status.includes('varied copies'), { status: R.status.slice(0, 160), best: R.best.slice(0, 160) });
  ok('Robust search: the current design is rated no better than nominal', R.cur && R.cur.clean <= R.cur.nom + 1e-9 && R.cur.water >= R.cur.nomW - 1e-9, R.cur);
  await setTol('Anoz', 0.6); await page.waitForTimeout(200);
  ok('Robust search: a changed tolerance marks the search out of date', !(await page.evaluate(() => document.getElementById('optStale').hidden)));
  await page.click('#tolReset'); await page.uncheck('#optRobust');

  // Progress, cancel and stop (2.0)
  await page.click('#optRun'); await page.waitForTimeout(1500);
  const pg1 = await page.evaluate(() => ({ shown: !document.getElementById('optProg').hidden, txt: document.querySelector('#optProg .prog-txt').textContent, now: +document.querySelector('#optProg .prog-bar').getAttribute('aria-valuenow'), btn: document.getElementById('optStop').textContent }));
  ok('Optimiser: progress bar shows step, generation and time left while searching', pg1.shown && pg1.txt.startsWith('Step 1 of 2, searching: generation') && pg1.btn === 'Cancel search', pg1);
  await page.click('#optStop'); await page.waitForTimeout(300);
  const pg2 = await page.evaluate(() => ({ busy: FlushAI.busy(), n: FlushAI._test.opt().all.length, hidden: document.getElementById('optProg').hidden, st: document.getElementById('optStatus').textContent, run: document.getElementById('optRun').disabled }));
  ok('Optimiser: Cancel search stops it and reports nothing', !pg2.busy && pg2.n === 0 && pg2.hidden && pg2.st.startsWith('Search cancelled') && !pg2.run, pg2);
  await page.click('#optRun'); await page.waitForFunction(() => FlushAI.progress().phase === 'check', null, { timeout: 60000 });
  const pg3 = await page.evaluate(() => ({ txt: document.querySelector('#optProg .prog-txt').textContent, btn: document.getElementById('optStop').textContent }));
  await page.waitForTimeout(400); await page.click('#optStop');
  await page.waitForFunction(() => !FlushAI.busy(), null, { timeout: 60000 });
  const pg4 = await page.evaluate(() => ({ st: document.getElementById('optStatus').textContent, inc: FlushAI._test.opt().incomplete, fin: FlushAI._test.opt().final, hidden: document.getElementById('optProg').hidden }));
  ok('Optimiser: Stop during the check reports only checked designs and says so', pg3.txt.startsWith('Step 2 of 2, checking') && pg3.btn.startsWith('Stop check') && pg4.inc && pg4.fin && pg4.hidden && pg4.st.includes('You stopped the full-resolution check'), { pg3, st: pg4.st.slice(0, 120) });

  // CFD check (2.0): the OpenFOAM run next to the fast model, playback, modes, and part 2 of the story
  await fresh();
  await page.waitForFunction(() => window.FlushCFD && FlushCFD.ready(), null, { timeout: 30000 }).catch(() => {});
  const cf0 = await page.evaluate(() => ({ ready: FlushCFD.ready(), head: document.getElementById('cfdHead').innerText, cav: document.getElementById('cfdCaveat').innerText }));
  ok('CFD check: the OpenFOAM run loads and the headline compares time and results', cf0.ready && cf0.head.includes('OpenFOAM needed') && /wetted \d+ %/.test(cf0.head), cf0.head.slice(0, 200));
  ok('CFD check: the caveat names the mesh and says it is not a measurement', cf0.cav.includes('mm cells at the wall') && cf0.cav.includes('not a measurement'), cf0.cav.slice(0, 160));
  await page.evaluate(() => FlushCFD.play());
  const cf1 = await page.evaluate(() => { const S = FlushCFD.data(); return { t: S.t, end: S.cfd.case.end, cw: S.cWet(S.cfd.case.end), mw: S.mWet(S.cfd.case.end), out: document.getElementById('cfdTOut').textContent }; });
  ok('CFD check: playback runs the wall maps to the end of the CFD run', Math.abs(cf1.t - cf1.end) < 1e-9 && cf1.cw > 50 && cf1.mw > 50 && cf1.out.startsWith('t ='), cf1);
  await page.click('[data-cfdmode="clean"]'); await page.waitForTimeout(100);
  ok('CFD check: the cleaning view disables the time slider', await page.evaluate(() => document.getElementById('cfdT').disabled && document.getElementById('cfdLegend').innerText.includes('cleaned')));
  await page.evaluate(() => document.getElementById('cfdTour').click());
  const t2 = [];
  for (let i = 0; i < 5; i++) { await page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 60000 }); t2.push(await page.textContent('#tourStep')); if (i < 4) await page.click('#tourNext'); }
  const cont = await page.evaluate(() => (document.getElementById('tourNextTour') || {}).textContent || '');
  ok('Story part 2: five steps, the CFD check and the physics-informed network, then an offer to continue with part 3', t2[0].startsWith('Part 2 of 3') && t2[4].includes('Step 5 of 5') && cont.includes('part 3') && (await page.evaluate(() => !!FlushPinnUI.result().pinn)), { t2, cont });
  await page.click('#tourNextTour'); await page.waitForTimeout(800);
  ok('Story: continuing starts part 3, the engineering challenge', (await page.textContent('#tourStep')).startsWith('Part 3 of 3'));
  await page.click('#tourX');

  // Physics-informed network (2.0): trains in the browser and finds the hidden weir coefficient
  await fresh();
  await page.evaluate(() => FlushPinnUI.show()); await page.selectOption('#pnData', 'sparse');
  await page.evaluate(() => FlushPinnUI.run());
  const pn = await page.evaluate(() => { const S = FlushPinnUI.result(); return { cw: S.pinn.Cw, ls: S.ls.Cw, n: S.D.obs.length, rows: document.querySelectorAll('#pnTable tbody tr').length, sum: document.getElementById('pnSum').innerText.slice(0, 120) }; });
  ok('Physics-informed network: from 13 readings it finds the hidden weir coefficient within 6 %, next to least squares', pn.n === 13 && Math.abs(pn.cw - 1.45) / 1.45 < 0.06 && pn.rows === 4 && pn.sum.includes('found a weir coefficient'), pn);

  // Engineering challenge (2.0): eight stored races on one clock, a chosen race, live recomputation, your turn, guided tour
  await fresh();
  await page.evaluate(() => document.getElementById('challenge').scrollIntoView());
  const ch0 = await page.evaluate(() => ({ races: FlushChallengeUI.races().length, picks: document.querySelectorAll('#chRep .ch-pick').length, rows: document.querySelectorAll('#chRep tbody tr').length }));
  ok('Challenge: eight stored races, one button and one column each', ch0.races === 8 && ch0.picks === 8 && ch0.rows === 3, ch0);
  await page.evaluate(() => FlushChallengeUI.play());
  const ch1 = await page.evaluate(() => ({ clock: document.getElementById('chClock').textContent, head: document.getElementById('chHead').innerText.slice(0, 160), st: FlushChallengeUI.stats() }));
  ok('Challenge: Play runs the clock to day 10 and states the result over all races', ch1.clock.includes('day 10.0') && ch1.head.startsWith('Across 8 design projects') && ch1.st.ai.miss === 0, { clock: ch1.clock, head: ch1.head });
  ok('Challenge: race #1 is AI 5, classic 11, fast model alone 3 (checks/challenge.js)', (await page.evaluate(() => { const r = FlushChallengeUI.races()[0].routes; return [r.ai.toTarget, r.classic.toTarget, r.fast.toTarget].join(); })) === '5,11,3');
  await page.click('#chRep .ch-pick[data-race="2"]'); await page.waitForTimeout(150);
  const ch2 = await page.evaluate(() => ({ title: document.getElementById('chRaceTitle').textContent, sel: FlushChallengeUI.sel(), log: document.querySelector('#chLog summary').textContent }));
  ok('Challenge: picking race #3 shows it below', ch2.sel === 2 && ch2.title.includes('#3') && ch2.log.includes('#3'), ch2);
  await page.evaluate(() => FlushChallengeUI.select(0));
  await page.waitForFunction(() => { const v = FlushChallengeUI.verified(0); return v && typeof v.same === 'boolean'; }, null, { timeout: 180000 });
  const ch3 = await page.evaluate(() => ({ v: FlushChallengeUI.verified(0), line: document.getElementById('chVerify').innerText }));
  ok('Challenge: race #1 recomputed live in the browser is identical to the stored race', ch3.v.same && ch3.line.includes('identical'), ch3);
  await page.click('#chReveal');
  ok('Challenge: the hidden reference can be shown', await page.evaluate(() => !document.getElementById('chHidden').hidden && document.getElementById('chHidden').innerText.includes('in the reference')));
  await page.click('#chLoad'); await page.waitForTimeout(200);
  const chl = await P();
  ok('Challenge: Load the start design puts the oval start into the simulator', chl.ovality === 1.35 && chl.jetPhase === 0 && chl.Vfull === 4.5, { ovality: chl.ovality, jetPhase: chl.jetPhase, Vfull: chl.Vfull });
  await page.click('#chYouRun'); await page.evaluate(() => FlushApp.apply({ Vfull: 4.0, jetPhase: 90 })); await page.click('#chYouRun');
  const chy = await page.evaluate(() => ({ n: FlushChallengeUI.you().length, items: document.querySelectorAll('#chYouLog li').length, txt: document.getElementById('chYouLog').innerText }));
  ok('Challenge: your turn counts reference runs and says what each misses', chy.n === 2 && chy.items >= 2 && chy.txt.includes('misses'), chy);
  await page.click('#chYouReset');
  ok('Challenge: Start over clears your runs', await page.evaluate(() => FlushChallengeUI.you().length === 0));
  // the guided tour of the challenge: nine steps, leaves the visitor's design as it was
  await fresh();
  const pBefore = await P();
  await page.evaluate(() => document.getElementById('chTour').click());
  const titles = [];
  for (let i = 0; i < 9; i++) {
    await page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 60000 });
    titles.push(await page.textContent('#tourTitle'));
    if (i < 8) await page.click('#tourNext');
  }
  const lastTxt = await page.evaluate(() => document.getElementById('tourText').innerText);
  ok('Challenge tour: nine steps from the problem to what it means', titles.length === 9 && titles[0] === 'An engineering problem' && titles[8] === 'What this means' && lastTxt.includes('Bring my design back'), titles);
  ok('Challenge tour: the your-turn step ran one reference run', (await page.evaluate(() => FlushChallengeUI.you().length)) === 1);
  await page.click('#tourNext'); await page.waitForTimeout(300);   // Finish
  const pAfter = await P();
  ok('Challenge tour: Finish brings the visitor\'s design back', pAfter.ovality === pBefore.ovality && pAfter.jetPhase === pBefore.jetPhase && pAfter.Vfull === pBefore.Vfull && (await page.evaluate(() => document.querySelector('.tour').hidden)), { ovality: pAfter.ovality, Vfull: pAfter.Vfull });

  ok('No page errors', errs.length === 0, errs.slice(0, 5));
  console.log(out.join('\n'));
  const failed = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`${out.length} checks: ${failed} failed`);
  console.log(failed ? 'FAILED' : 'passed');
  await browser.close(); if (srv) srv.close();
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(1); });
