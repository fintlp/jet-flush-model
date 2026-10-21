/* AI lab tab "Field surrogate": learns the whole cleaning map from expensive runs (field-core.js) and compares a
   pure data surrogate, the fast model alone, and the fast model with a learned map correction. */
(function () {
  const A = window.FlushApp, M = window.FlushModel, CH = window.FlushChallenge, FF = window.FlushField;
  const $ = (id) => document.getElementById(id);
  if (!A || !M || !CH || !FF || !$('aiField')) return;
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));
  const now = () => performance.now();
  const NS_ = [10, 20, 40, 80];
  const S = { F: null, running: false, res: null, sel: 0, models: null, ms: {} };

  function bar(f, txt) { const b = $('fsProg'); b.hidden = f == null; if (f == null) return; const pc = Math.round(100 * f); b.querySelector('.prog-fill').style.width = pc + '%'; b.querySelector('.prog-bar').setAttribute('aria-valuenow', String(pc)); b.querySelector('.prog-txt').textContent = txt; }
  function run() {
    if (S.running) return Promise.resolve(null);
    S.running = true; $('fsRun').disabled = true; S.res = null; S.models = null;
    const C = CH.make(M), F = FF.make(M, C); S.F = F;
    const gen = F.generate(), t0 = now();
    return new Promise((resolve) => {
      (function tick() {
        const t1 = now(); let st = null;
        while (now() - t1 < 14) { st = gen.next(); if (st.done) break; }
        if (!st.done) { const v = st.value; bar(0.9 * v.done / v.total, `Simulating ${v.done} of ${v.total} designs, each with the reference (the "expensive run") and the fast model`); requestAnimationFrame(tick); return; }
        S.ms.data = now() - t0; bar(0.95, 'Training: proper orthogonal decomposition and Gaussian processes for 10, 20, 40 and 80 runs');
        setTimeout(() => {
          const t2 = now(); S.res = { fast: F.score(null), data: [], corr: [] }; S.models = {};
          NS_.forEach((N) => { const d = F.fit(N, false), c = F.fit(N, true); S.models[N] = { d, c }; S.res.data.push(Object.assign({ N, energy: d.energy }, F.score(d))); S.res.corr.push(Object.assign({ N }, F.score(c))); });
          S.ms.fit = now() - t2;
          const m = S.models[80].d, x = F.D.Xte[0], tp = now(); for (let k = 0; k < 200; k++) m.predict(x); S.ms.pred = (now() - tp) / 200;
          const tf = now(); for (let k = 0; k < 5; k++) M.simulate(Object.assign({}, C.base, C.toDesign(x)), { light: true, Tend: 12 }); S.ms.fast = (now() - tf) / 5;
          S.running = false; $('fsRun').disabled = false; bar(null); fillSel(); summary(); draw(); resolve(S);
        }, 30);
      })();
    });
  }
  function fillSel() { $('fsSel').innerHTML = S.F.D.Xte.map((_, i) => `<option value="${i}"${i === S.sel ? ' selected' : ''}>Unseen design ${i + 1}</option>`).join(''); $('fsSel').disabled = false; }
  function summary() {
    const R = S.res, d80 = R.data[3], d10 = R.data[0], c80 = R.corr[3];
    $('fsSum').innerHTML = `<p class="ch-big">Trained on 80 expensive runs, about ${Math.round(80 / 3)} virtual days of CFD, the pure data surrogate matches the cleaned area of unseen designs to <b>${fmt(100 * d80.overlap, 0)} %</b> and misses the cleaned share by <b>${fmt(d80.err, 1)} points</b>. The fast physics model, with no expensive runs at all: <b>${fmt(100 * R.fast.overlap, 0)} %</b> and <b>${fmt(R.fast.err, 1)} points</b>. With a learned correction of its map: ${fmt(100 * c80.overlap, 0)} % and ${fmt(c80.err, 1)} points.</p>` +
      `<p>The data surrogate is the quickest to ask, about <b>${fmt(S.ms.pred * 1000, 0)} µs</b> for a whole map against ${fmt(S.ms.fast, 0)} ms for the fast model, and it gets better with more runs, slowly (${fmt(100 * d10.overlap, 0)} % with 10 runs). But it has to learn the physics from examples, and here even 80 runs are not enough to catch up with a model that already knows it.</p>` +
      `<p class="muted">Why the correction adds little here: the synthetic reference is the same flush model with other coefficients, so its maps differ from the fast model's mostly in level, not in pattern. The CFD check shows real pattern differences (streaks behind the jets, the pool washing the wall near the waterline); against real CFD runs, a learned map correction would have more to learn. Field surrogates such as SimAI, Simcenter PhysicsAI or PhysicsNeMo are trained on hundreds of CFD runs; they pay off when there is no fast physics model, or when every design study reuses the same run database.</p>`;
    $('fsTable').innerHTML = `<thead><tr><th>Expensive runs for training</th><th>Virtual time</th><th>Data surrogate: overlap</th><th>Data surrogate: cleaned share error</th><th>Fast model + correction: overlap</th><th>Fast model + correction: error</th></tr></thead><tbody>` +
      R.data.map((d, i) => `<tr><td class="num">${d.N}</td><td class="num">${fmt(d.N / 3, d.N < 30 ? 1 : 0)} days</td><td class="num">${fmt(100 * d.overlap, 1)} %</td><td class="num">${fmt(d.err, 1)} points</td><td class="num">${fmt(100 * R.corr[i].overlap, 1)} %</td><td class="num">${fmt(R.corr[i].err, 1)} points</td></tr>`).join('') +
      `<tr><td>none (fast model alone)</td><td class="num">–</td><td class="num">–</td><td class="num">–</td><td class="num">${fmt(100 * R.fast.overlap, 1)} %</td><td class="num">${fmt(R.fast.err, 1)} points</td></tr></tbody>`;
  }

  // ---- charts ----
  function curve() {
    const cv = $('cvFsCurve'); A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors(); ctx.clearRect(0, 0, W, H);
    const padL = 44 * d, padR = 12 * d, padT = (cv.clientWidth < 420 ? 44 : 30) * d, padB = 36 * d, w = W - padL - padR, h = H - padT - padB;
    const lx = (N) => Math.log(N), X = (N) => padL + (lx(N) - lx(8)) / (lx(100) - lx(8)) * w, Y = (v) => padT + (1 - (v - 75) / 25) * h;
    ctx.fillStyle = A.rgba(C.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(C.muted); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [75, 80, 85, 90, 95, 100].forEach((v) => { ctx.fillText(String(v), padL - 5 * d, Y(v)); ctx.strokeStyle = A.rgba(C.line, 0.6); ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + w, Y(v)); ctx.stroke(); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; NS_.forEach((N) => ctx.fillText(`${N} (${fmt(N / 3, 0)} d)`, X(N), padT + h + 4 * d));
    ctx.fillText('Expensive runs for training (virtual days)', padL + w / 2, padT + h + 18 * d);
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Cleaned area matched, %', 0, 0); ctx.restore();
    const items = [['data surrogate', C.bad, []], ['fast model alone', C.solid, [6, 4]], ['fast model + correction', C.accent, []]];
    if (S.res) {
      const pts = (arr) => arr.map((q) => [X(q.N), Y(100 * q.overlap)]);
      const line = (p, col, dash) => { ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2.4 * d; ctx.setLineDash(dash.map((v) => v * d)); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = A.rgba(col); p.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3 * d, 0, 2 * Math.PI); ctx.fill(); }); };
      line(pts(S.res.data), C.bad, []); line([[X(8), Y(100 * S.res.fast.overlap)], [X(100), Y(100 * S.res.fast.overlap)]], C.solid, [6, 4]); line(pts(S.res.corr), C.accent, []);
    } else { ctx.fillStyle = A.rgba(C.muted); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = A.font(11); { const t = 'Run the comparison to see the learning curves'; ctx.fillText(ctx.measureText(t).width > w - 16 ? 'Run the comparison first' : t, padL + w / 2, padT + h / 2); } }
    ctx.font = A.font(10); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; let x0 = padL, y0 = 12 * d;
    items.forEach(([l, col, dash]) => { const lw = (30 + ctx.measureText(l).width / d) * d; if (x0 > padL && x0 + lw > padL + w) { x0 = padL; y0 += 14 * d; } ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2.4 * d; ctx.setLineDash(dash.map((v) => v * d)); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 18 * d, y0); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = A.rgba(C.ink); ctx.fillText(l, x0 + 22 * d, y0); x0 += lw; });
  }
  function mapTile(cv, f, title, sub) {
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors(); ctx.clearRect(0, 0, W, H);
    const padT = 30 * d, pad = 4 * d, w = W - 2 * pad, h = H - padT - pad, NTH = 90, NS = 40, cw = w / NTH, ch = h / NS;
    if (f) for (let k = 0; k < NS; k++) for (let i = 0; i < NTH; i++) { const v = f[k * NTH + i]; ctx.fillStyle = A.rgba(v >= 1 ? C.clean : v > 0.05 ? A.mix(C.dry, C.wet, Math.min(1, v)) : C.dry); ctx.fillRect(pad + i * cw, padT + k * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5); }
    ctx.strokeStyle = A.rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(pad + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.fillStyle = A.rgba(C.ink); ctx.font = A.font(11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(title, pad, 2 * d);
    ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(10); ctx.fillText(sub, pad, 16 * d);
  }
  function draw() {
    if ($('aiField').hidden) return;
    curve();
    const F = S.F, ok = S.res && F;
    const i = S.sel, x = ok ? F.D.Xte[i] : null;
    const ref = ok ? F.D.Rte[i] : null, fast = ok ? F.D.Fte[i] : null, ds = ok ? S.models[80].d.predict(x, fast) : null, cs = ok ? S.models[80].c.predict(x, fast) : null;
    const sh = (f) => (f ? `${fmt(F.share(f), 0)} % cleaned` + (f !== ref ? `, ${fmt(100 * F.overlap(f, ref), 0)} % matched` : '') : '');
    mapTile($('cvFsRef'), ref, 'Reference (an expensive run)', ok ? sh(ref) : 'not run yet');
    mapTile($('cvFsData'), ds, 'Data surrogate, 80 runs', ok ? sh(ds) : '');
    mapTile($('cvFsFast'), fast, 'Fast model alone', ok ? sh(fast) : '');
    mapTile($('cvFsCorr'), cs, 'Fast model + correction', ok ? sh(cs) : '');
  }
  $('fsRun').addEventListener('click', () => run());
  $('fsSel').addEventListener('change', (e) => { S.sel = +e.target.value; draw(); });
  document.addEventListener('flushaitab', (e) => { if (e.detail === 'aiField') requestAnimationFrame(draw); });
  ['cvFsCurve', 'cvFsRef', 'cvFsData', 'cvFsFast', 'cvFsCorr'].forEach((id) => new ResizeObserver(() => requestAnimationFrame(draw)).observe($(id)));
  new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.FlushFieldUI = { run, busy: () => S.running, result: () => S, show: () => { const b = document.querySelector('[data-aitab="aiField"]'); if (b) b.click(); } };
})();
