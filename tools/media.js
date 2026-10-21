// Regenerates the stills and videos in media/ from the live page, and writes the figures the slides quote to
// slides/figures.json. Needs Playwright with Chromium and ffmpeg:
//   npm install --no-save playwright && npx playwright install chromium
//   node tools/media.js              all: stills, flush video, guided story video
//   node tools/media.js stills       only the stills and figures
//   node tools/media.js flush        only media/flush-playback.mp4
//   node tools/media.js story        only media/demo-walkthrough.mp4 (the three-part guided story)
// Serves this repository on a free local port, like checks/browser.js. Deterministic apart from timings.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), MEDIA = path.join(ROOT, 'media'), FIG = path.join(ROOT, 'slides', 'figures.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const what = process.argv[2] || 'all';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
const readFig = () => { try { return JSON.parse(fs.readFileSync(FIG, 'utf8')); } catch (e) { return {}; } };
const writeFig = (f) => fs.writeFileSync(FIG, JSON.stringify(f, null, 1) + '\n');

async function stills(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await ctx.newPage();
  const shot = async (sel, name) => { const el = await page.$(sel); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await el.screenshot({ path: path.join(MEDIA, name) }); console.log('  ' + name); };
  const done = (fn, ms) => page.waitForFunction(fn, null, { timeout: ms || 180000 });
  await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForTimeout(1200);
  const fig = readFig(); fig.generated = new Date().toISOString().slice(0, 10);
  fig.preset = await page.evaluate(() => { const k = FlushApp.kpis(); return { clean: k.clean, solids: k.solids, paper: k.paper, water: k.water }; });
  await page.evaluate(() => FlushApp.setTime(1.6));
  await shot('#sim', 'playback.png'); await shot('#results', 'results.png'); await shot('#traces', 'traces.png'); await shot('#wallmap', 'wall-map.png');
  await page.click('#swRun'); await done(() => { const s = FlushApp._test.sweep(); return s && s.done === s.total && !s.stale; });
  await shot('#sweep', 'sweep.png');
  // CFD check: the cleaning view
  await done(() => window.FlushCFD && FlushCFD.ready(), 60000);
  await page.evaluate(() => FlushCFD.setMode('clean'));
  await shot('.cfd-maps', 'cfd-maps.png');
  fig.cfd = await page.evaluate(() => { const S = FlushCFD.data(); return { mesh: S.cfd.case.mesh, cells: S.cfd.case.cells, wallClock_s: S.cfd.case.wallClock_s, cores: S.cfd.case.cores, end: S.cfd.case.end, msModel: S.msModel, cClean: S.cClean, mClean: S.mClean, cWet: S.cWet(S.cfd.case.end), mWet: S.mWet(S.cfd.case.end), firstCfd: S.arr && S.arr.arrivalTimes ? S.arr.arrivalTimes.first_1mLs : null, firstModel: S.mod.firstArr, sens: S.sens, coarseWallClock_s: S.cfd2 ? S.cfd2.case.wallClock_s : null }; });
  // engineering challenge: play the clock to the end
  await page.evaluate(() => FlushChallengeUI.play()); await done(() => !FlushChallengeUI.playing());
  await page.waitForTimeout(500); await shot('#cvChAll', 'challenge.png');
  fig.challenge = await page.evaluate(() => FlushChallengeUI.stats());
  // AI lab: optimiser with targets from the washdown preset, surrogate, hybrid calibration, PINN, field surrogate
  await page.evaluate(() => { document.querySelector('[data-aitab="aiOpt"]').click(); document.getElementById('goalTargets').click();
    const v = (id, x) => { const e = document.getElementById(id); if (e) e.value = x; };
    v('tWater', '4.0'); v('tClean', '88'); v('tSolids', '95'); v('tPaper', '80'); v('optEffort', 'quick'); v('optFlush', 'full'); if (document.getElementById('tNoise')) v('tNoise', '0');
    document.getElementById('optRun').click(); });
  await done(() => /meeting all targets|No design met/.test(document.getElementById('optBest').innerText) && !document.getElementById('optRun').disabled);
  fig.optimiser = await page.evaluate(() => document.getElementById('optBest').innerText.replace(/\s+/g, ' ').trim());
  await shot('#aiOpt', 'ai-optimiser.png'); await shot('#cvOpt', 'ai-optimiser-chart.png');
  await page.evaluate(() => { document.querySelector('[data-aitab="aiSur"]').click(); document.getElementById('surRun').click(); });
  await done(() => /times faster/.test(document.getElementById('surSpeed').innerText) && !document.getElementById('surRun').disabled);
  fig.surrogate = await page.evaluate(() => document.getElementById('surSpeed').innerText.split('\n')[0]);
  await shot('#aiSur', 'ai-surrogate.png');
  await page.evaluate(() => { document.querySelector('[data-aitab="aiHyb"]').click(); document.getElementById('hybRun').click(); });
  await done(() => !document.getElementById('hybRun').disabled && document.getElementById('hybSum').innerText.trim().length > 20);
  await shot('#aiHyb', 'ai-hybrid.png');
  await page.evaluate(() => { FlushPinnUI.show(); FlushPinnUI.run(); }); await page.waitForTimeout(300); await done(() => !FlushPinnUI.busy() && document.getElementById('pnSum').innerText.trim().length > 20);
  await shot('#aiPinn', 'ai-pinn.png');
  await page.evaluate(() => { FlushFieldUI.show(); FlushFieldUI.run(); }); await page.waitForTimeout(300); await done(() => !FlushFieldUI.busy() && document.getElementById('fsSum').innerText.trim().length > 20);
  await shot('#aiField', 'ai-field.png');
  writeFig(fig); console.log('  slides/figures.json');
  await ctx.close();
}

// the flush from above and in section, drawn frame by frame with the page's own playback, 30 frames per second
async function flush(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForTimeout(1200);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-')), el = await page.$('#sim'); await el.scrollIntoViewIfNeeded();
  const T = await page.evaluate(() => +document.getElementById('scrub').max), N = Math.round(T * 30);
  for (let i = 0; i <= N; i++) { await page.evaluate((t) => FlushApp.setTime(t), i / 30); await el.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) }); }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%04d.png'), '-vf', 'scale=1920:-2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', path.join(MEDIA, 'flush-playback.mp4')]);
  fs.rmSync(dir, { recursive: true, force: true }); console.log(`  flush-playback.mp4 (${N + 1} frames, ${T} s)`);
  await ctx.close();
}

// the guided story, all three parts, as a visitor sees it: each step stays on screen long enough to read
async function story(browser, base) {
  const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-'));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', recordVideo: { dir: vdir, size: { width: 1440, height: 900 } } });
  const page = await ctx.newPage(), t0 = Date.now();
  await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto(base);
  await page.waitForFunction(() => window.FlushCFD && FlushCFD.ready(), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const start = (Date.now() - t0) / 1000 - 1.2;
  await page.screenshot({ path: path.join(MEDIA, 'demo-poster.png') });
  const fig = readFig(); fig.demo = [];
  const ready = () => page.waitForFunction(() => !document.getElementById('tourNext').disabled, null, { timeout: 180000 });
  const read = async () => { const n = await page.evaluate(() => document.getElementById('tourText').innerText.split(/\s+/).length); await page.waitForTimeout(Math.min(9000, Math.max(4000, 2000 + n * 60))); };
  await page.click('#demoBtn');
  for (let part = 1; part <= 3; part++) {
    for (;;) {
      await ready(); await read();
      const st = await page.evaluate(() => ({ step: document.getElementById('tourStep').textContent, title: document.getElementById('tourTitle').textContent, text: document.getElementById('tourText').innerText.replace(/\s+/g, ' ').trim(), cont: !!document.getElementById('tourNextTour') }));
      fig.demo.push(st);
      if (st.cont) { await page.click('#tourNextTour'); break; }
      if (/Step (\d+) of \1$/.test(st.step)) { await page.click('#tourNext'); part = 4; break; }
      await page.click('#tourNext');
    }
  }
  await page.waitForTimeout(1500);
  const vpath = await page.video().path(); await ctx.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, start)), '-i', vpath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-r', '30', '-movflags', '+faststart', path.join(MEDIA, 'demo-walkthrough.mp4')]);
  fs.rmSync(vdir, { recursive: true, force: true });
  writeFig(fig); console.log(`  demo-walkthrough.mp4, demo-poster.png (${fig.demo.length} steps)`);
}

(async () => {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/`, browser = await chromium.launch();
  try {
    if (what === 'all' || what === 'stills') { console.log('stills'); await stills(browser, base); }
    if (what === 'all' || what === 'flush') { console.log('flush video'); await flush(browser, base); }
    if (what === 'all' || what === 'story') { console.log('story video'); await story(browser, base); }
  } finally { await browser.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
