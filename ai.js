/* AI lab: three ways machine learning and optimisation work with the physics model.
   1. Evolutionary multi-objective design search (NSGA-II style)
   2. Neural surrogate trained in the browser on physics-model runs
   3. Hybrid calibration: Nelder-Mead coefficient fit plus a Gaussian-process correction,
      against synthetic reference data that stands in for PreonLab runs */
(function () {
  const A = window.FlushApp, M = window.FlushModel;
  if (!A || !M) return;
  const $ = (id) => document.getElementById(id);
  const TAU2 = Math.PI * 2;
  const SIM = { light: true, coarse: true, Tend: 12 };

  // design variables shared by all three tools
  const DV = [
    { k: 'Anoz', min: 1.5, max: 8 }, { k: 'alpha', min: 0, max: 35 }, { k: 'jetPhase', min: 0, max: 180 },
    { k: 'hNoz', min: 6, max: 20 }, { k: 'Hcr', min: 50, max: 600 }, { k: 'Vfull', min: 3, max: 7 }
  ];
  DV.forEach((d) => { const s = A.SPECK[d.k]; d.l = s.l; d.u = s.u; d.st = s.st; d.dp = s.d; });
  const ND = DV.length;
  const snap = (d, v) => +(Math.round(v / d.st) * d.st).toFixed(4);
  const toDesign = (x) => { const o = {}; DV.forEach((d, i) => { o[d.k] = snap(d, d.min + Math.min(1, Math.max(0, x[i])) * (d.max - d.min)); }); return o; };
  const toX = (o) => DV.map((d) => (o[d.k] - d.min) / (d.max - d.min));
  const now = () => performance.now();

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU2 * v); }
  function lhs(n, r) { // Latin hypercube in [0,1]^ND
    const cols = DV.map(() => { const p = Array.from({ length: n }, (_, i) => (i + r()) / n); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
    return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
  }
  function evalPhysics(base, design, coeff) {
    const q = Object.assign({}, base, design, coeff || {}, { flushMode: 'full' });
    const r = M.simulate(q, SIM);
    return { clean: r.cleanPct, solids: r.solidsPct, paper: r.paperPct, water: r.water, seal: r.sealEnd, sealOK: r.sealOK };
  }
  // run a list of jobs in time slices so the page stays responsive
  function slices(step, done, budget = 14) {
    let alive = true;
    (function tick() {
      if (!alive) return;
      const t0 = now();
      while (now() - t0 < budget) { if (step() === false) { alive = false; done && done(); return; } }
      requestAnimationFrame(tick);
    })();
    return () => { alive = false; };
  }
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));
  const designCells = (o) => DV.map((d) => `<td class="num">${fmt(o[d.k], d.dp)}</td>`).join('');
  const designHead = () => DV.map((d) => `<th>${d.l}${d.u ? ', ' + d.u : ''}</th>`).join('');

  /* ---------------- tabs ---------------- */
  const tabs = document.querySelectorAll('[data-aitab]');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => { x.setAttribute('aria-selected', String(x === b)); x.setAttribute('aria-pressed', String(x === b)); });
    ['aiOpt', 'aiSur', 'aiHyb'].forEach((id) => { $(id).hidden = id !== b.dataset.aitab; });
    redraw();
  }));

  /* ---------------- small chart kit ---------------- */
  function frame(cv, opt) {
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors();
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 52 * d, r: 14 * d, t: 12 * d, b: 40 * d }, w = W - pad.l - pad.r, h = H - pad.t - pad.b;
    const [x0, x1] = opt.x, [y0, y1] = opt.y;
    const lx = opt.logy ? (v) => Math.log10(Math.max(1e-12, v)) : (v) => v;
    const Y0 = lx(y0), Y1 = lx(y1);
    const X = (v) => pad.l + (v - x0) / ((x1 - x0) || 1) * w, Y = (v) => pad.t + h - (lx(v) - Y0) / ((Y1 - Y0) || 1) * h;
    ctx.fillStyle = A.rgba(C.raised); ctx.fillRect(pad.l, pad.t, w, h);
    ctx.strokeStyle = A.rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, w - 1, h - 1);
    ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(10);
    const xt = opt.xt || [x0, (x0 + x1) / 2, x1], yt = opt.yt || [y0, (y0 + y1) / 2, y1];
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach((v) => { ctx.fillText(opt.xf ? opt.xf(v) : String(+v.toFixed(2)), X(v), pad.t + h + 5 * d); ctx.strokeStyle = A.rgba(C.line, 0.6); ctx.beginPath(); ctx.moveTo(X(v), pad.t); ctx.lineTo(X(v), pad.t + h); ctx.stroke(); });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach((v) => { ctx.fillText(opt.yf ? opt.yf(v) : String(+v.toFixed(2)), pad.l - 6 * d, Y(v)); ctx.strokeStyle = A.rgba(C.line, 0.6); ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(pad.l + w, Y(v)); ctx.stroke(); });
    ctx.fillStyle = A.rgba(C.ink); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = A.font(10.5, 500);
    if (opt.xl) ctx.fillText(opt.xl, pad.l + w / 2, pad.t + h + 21 * d);
    if (opt.yl) { ctx.save(); ctx.translate(12 * d, pad.t + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(opt.yl, 0, -2 * d); ctx.restore(); }
    return { ctx, X, Y, C, d, pad, w, h };
  }
  function legend(f, items) {
    const { ctx, pad, d } = f; let x = pad.l + 8 * d; const y = pad.t + 8 * d;
    ctx.font = A.font(10); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    items.forEach(([lab, col, dot]) => {
      ctx.fillStyle = A.rgba(col);
      if (dot) { ctx.beginPath(); ctx.arc(x + 4 * d, y, 3.5 * d, 0, TAU2); ctx.fill(); } else ctx.fillRect(x, y - 1.5 * d, 10 * d, 3 * d);
      x += 14 * d; ctx.fillStyle = A.rgba(f.C.muted); ctx.fillText(lab, x, y); x += ctx.measureText(lab).width + 14 * d;
    });
  }
  const niceUp = (v) => { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };

  /* =====================================================================
     1. Evolutionary multi-objective design search
     ===================================================================== */
  const O = { all: [], front: [], running: false, cur: null, hover: null, stop: null };
  function weights() {
    const a = +$('wClean').value, b = +$('wSolids').value, c = +$('wPaper').value, s = a + b + c || 1;
    return [a / s, b / s, c / s];
  }
  function scoreOf(e, w) { return w[0] * e.clean + w[1] * e.solids + w[2] * e.paper - (e.sealOK ? 0 : 40); }
  function dominates(a, b) { return a.score >= b.score && a.water <= b.water && (a.score > b.score || a.water < b.water); }
  function ndSort(pop) {
    const fronts = [[]], S = pop.map(() => []), n = pop.map(() => 0);
    pop.forEach((p, i) => { pop.forEach((q, j) => { if (i === j) return; if (dominates(p, q)) S[i].push(j); else if (dominates(q, p)) n[i]++; }); if (n[i] === 0) { p.rank = 0; fronts[0].push(i); } });
    let k = 0;
    while (fronts[k].length) { const nx = []; fronts[k].forEach((i) => S[i].forEach((j) => { if (--n[j] === 0) { pop[j].rank = k + 1; nx.push(j); } })); k++; fronts.push(nx); }
    fronts.forEach((f) => { // crowding distance on the two objectives
      f.forEach((i) => { pop[i].crowd = 0; });
      ['score', 'water'].forEach((key) => {
        const s = f.slice().sort((a, b) => pop[a][key] - pop[b][key]);
        if (s.length < 3) { s.forEach((i) => { pop[i].crowd = Infinity; }); return; }
        const span = (pop[s[s.length - 1]][key] - pop[s[0]][key]) || 1;
        pop[s[0]].crowd = pop[s[s.length - 1]].crowd = Infinity;
        for (let m = 1; m < s.length - 1; m++) pop[s[m]].crowd += (pop[s[m + 1]][key] - pop[s[m - 1]][key]) / span;
      });
    });
  }
  function paretoOf(list) {
    const f = list.filter((a) => a.sealOK && !list.some((b) => b !== a && b.sealOK && dominates(b, a)));
    return f.sort((a, b) => a.water - b.water);
  }
  function runOpt() {
    if (O.running) return;
    const base = A.getP(), w = weights(), r = rng(1234);
    const POP = 36, GENS = 14;
    O.all = []; O.front = []; O.running = true; O.hover = null; O.base = base;
    $('optRun').disabled = true;
    const ev = (x) => { const des = toDesign(x), e = Object.assign({ x: toX(des), des }, evalPhysics(base, des)); e.score = scoreOf(e, w); O.all.push(e); return e; };
    O.cur = (() => { const des = {}; DV.forEach((d) => { des[d.k] = base[d.k]; }); const e = Object.assign({ des }, evalPhysics(base, des)); e.score = scoreOf(e, w); return e; })();
    let pop = [], children = [], gen = 0, queue = lhs(POP, r).map((x) => x); const t0 = now();
    const tour = () => { const a = pop[Math.floor(r() * pop.length)], b = pop[Math.floor(r() * pop.length)]; return (a.rank < b.rank || (a.rank === b.rank && a.crowd > b.crowd)) ? a : b; };
    const breed = () => {
      const kids = [];
      for (let i = 0; i < POP; i++) {
        const p1 = tour(), p2 = tour();
        kids.push(p1.x.map((v, j) => { let c = v + (r() * 1.5 - 0.25) * (p2.x[j] - v); if (r() < 1.5 / ND) c += gauss(r) * 0.12; return Math.min(1, Math.max(0, c)); }));
      }
      return kids;
    };
    O.stop = slices(() => {
      if (queue.length) { (gen === 0 ? pop : children).push(ev(queue.shift())); return true; }
      if (gen > 0) { // environmental selection
        const merged = pop.concat(children); ndSort(merged);
        merged.sort((a, b) => a.rank - b.rank || b.crowd - a.crowd); pop = merged.slice(0, POP); children = [];
      } else ndSort(pop);
      O.front = paretoOf(O.all);
      $('optStatus').textContent = `Generation ${gen + 1} of ${GENS + 1} · ${O.all.length} designs evaluated · ${((now() - t0) / 1000).toFixed(1)} s`;
      drawOpt(); fillOptTable();
      if (gen >= GENS) return false;
      gen++; queue = breed(); return true;
    }, () => {
      O.running = false; $('optRun').disabled = false;
      $('optStatus').textContent = `Done: ${O.all.length} designs in ${((now() - t0) / 1000).toFixed(1)} s, ${((now() - t0) / O.all.length).toFixed(1)} ms each. ${O.front.length} designs on the best trade-off curve.`;
      drawOpt(); fillOptTable(); optSummary();
    });
  }
  function optSummary() {
    const c = O.cur; if (!c || !O.front.length) return;
    const same = O.front.filter((e) => e.water <= c.water + 1e-9).sort((a, b) => b.score - a.score)[0];
    const lean = O.front.filter((e) => e.score >= c.score).sort((a, b) => a.water - b.water)[0];
    const lines = [`Current design: score ${fmt(c.score, 1)} at ${fmt(c.water, 1)} L.`];
    if (same) lines.push(`Best found with the same or less water: score ${fmt(same.score, 1)} at ${fmt(same.water, 1)} L (${same.score >= c.score ? '+' : ''}${fmt(same.score - c.score, 1)} points).`);
    if (lean && lean.water < c.water - 0.05) lines.push(`Same score with less water: ${fmt(lean.water, 1)} L, saving ${fmt(c.water - lean.water, 1)} L per flush.`);
    $('optBest').innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
  }
  let optGeom = null;
  function drawOpt() {
    const cv = $('cvOpt'); if ($('aiOpt').hidden) return;
    const pts = O.all, all = pts.concat(O.cur ? [O.cur] : []);
    const ys = all.map((e) => e.score), lo = Math.max(0, Math.floor(Math.min(...(ys.length ? ys : [0])) / 10) * 10), hi = Math.min(100, Math.ceil(Math.max(...(ys.length ? ys : [100])) / 10) * 10 || 100);
    const f = frame(cv, { x: [3, 7], y: [lo, Math.max(lo + 10, hi)], xt: [3, 4, 5, 6, 7], xl: 'Water per flush, L', yl: 'Weighted score', yt: [lo, (lo + hi) / 2, hi] });
    const { ctx, X, Y, C, d } = f;
    ctx.fillStyle = A.rgba(C.lineStrong, 0.55);
    pts.forEach((e) => { if (!e.sealOK) return; ctx.beginPath(); ctx.arc(X(e.water), Y(e.score), 2.6 * d, 0, TAU2); ctx.fill(); });
    ctx.strokeStyle = A.rgba(C.bad, 0.7); ctx.lineWidth = 1 * d;
    pts.forEach((e) => { if (e.sealOK) return; const x = X(e.water), y = Y(Math.max(lo, e.score)); ctx.beginPath(); ctx.moveTo(x - 2.5 * d, y - 2.5 * d); ctx.lineTo(x + 2.5 * d, y + 2.5 * d); ctx.moveTo(x + 2.5 * d, y - 2.5 * d); ctx.lineTo(x - 2.5 * d, y + 2.5 * d); ctx.stroke(); });
    if (O.front.length) {
      ctx.strokeStyle = A.rgba(C.accent); ctx.lineWidth = 2 * d; ctx.beginPath();
      O.front.forEach((e, i) => { const x = X(e.water), y = Y(e.score); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.fillStyle = A.rgba(C.accent); O.front.forEach((e) => { ctx.beginPath(); ctx.arc(X(e.water), Y(e.score), 4 * d, 0, TAU2); ctx.fill(); });
    }
    if (O.cur) { const x = X(O.cur.water), y = Y(O.cur.score); ctx.strokeStyle = A.rgba(C.ink); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, 7 * d, 0, TAU2); ctx.stroke(); }
    if (O.hover) { const x = X(O.hover.water), y = Y(O.hover.score); ctx.strokeStyle = A.rgba(C.accent); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, 8 * d, 0, TAU2); ctx.stroke(); }
    legend(f, [['evaluated', C.lineStrong, true], ['best trade-off', C.accent, true], ['seal not restored', C.bad, true], ['current design (ring)', C.ink, false]]);
    if (!pts.length) { ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Set the weights and start the search', f.pad.l + f.w / 2, f.pad.t + f.h / 2); }
    optGeom = { X, Y, d };
  }
  function fillOptTable() {
    const rows = O.front.slice(0, 10);
    $('optTable').innerHTML = `<thead><tr><th></th><th>Water, L</th><th>Score</th><th>Cleaned, %</th><th>Solids, %</th><th>Paper, %</th>${designHead()}</tr></thead><tbody>` +
      rows.map((e, i) => `<tr><td><button class="btn mini" type="button" data-opt="${i}">Load</button></td><td class="num">${fmt(e.water, 1)}</td><td class="num">${fmt(e.score, 1)}</td><td class="num">${fmt(e.clean, 0)}</td><td class="num">${fmt(e.solids, 0)}</td><td class="num">${fmt(e.paper, 0)}</td>${designCells(e.des)}</tr>`).join('') + '</tbody>';
    $('optTable').querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => loadOpt(rows[+b.dataset.opt])));
  }
  function loadOpt(e) { if (!e) return; A.apply(Object.assign({ flushMode: 'full' }, e.des)); $('optHover').textContent = `Loaded: ${fmt(e.water, 1)} L, score ${fmt(e.score, 1)}. Scroll up to see the flush.`; }
  function nearestOpt(ev) {
    if (!optGeom || !O.all.length) return null;
    const b = $('cvOpt').getBoundingClientRect(), x = (ev.clientX - b.left) * A.dpr(), y = (ev.clientY - b.top) * A.dpr();
    let best = null, bd = 14 * A.dpr();
    O.all.forEach((e) => { const dd = Math.hypot(optGeom.X(e.water) - x, optGeom.Y(e.score) - y); if (dd < bd) { bd = dd; best = e; } });
    return best;
  }
  $('cvOpt').addEventListener('mousemove', (ev) => {
    const e = nearestOpt(ev); O.hover = e; drawOpt();
    $('optHover').textContent = e ? `${fmt(e.water, 1)} L · score ${fmt(e.score, 1)} · cleaned ${fmt(e.clean, 0)} % · solids ${fmt(e.solids, 0)} % · paper ${fmt(e.paper, 0)} %. Click to load.` : 'Hover a point to read it, click to load that design.';
  });
  $('cvOpt').addEventListener('click', (ev) => loadOpt(nearestOpt(ev)));
  $('optRun').addEventListener('click', runOpt);
  ['wClean', 'wSolids', 'wPaper'].forEach((id) => $(id).addEventListener('input', () => {
    const w = weights(); $('wOut').textContent = `cleaning ${Math.round(w[0] * 100)} % · solids ${Math.round(w[1] * 100)} % · paper ${Math.round(w[2] * 100)} %`;
    if (O.all.length && !O.running) { O.all.forEach((e) => { e.score = scoreOf(e, w); }); if (O.cur) O.cur.score = scoreOf(O.cur, w); O.front = paretoOf(O.all); drawOpt(); fillOptTable(); optSummary(); }
  }));

  /* =====================================================================
     2. Neural surrogate (MLP 6-32-32-3, tanh, Adam), trained in the browser
     ===================================================================== */
  const OUT = [['clean', 'Cleaned'], ['solids', 'Solids removed'], ['paper', 'Paper removed']];
  function makeNet(sizes, r) {
    const L = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const n = sizes[i], m = sizes[i + 1], s = Math.sqrt(2 / (n + m));
      const W = new Float64Array(n * m).map(() => gauss(r) * s), b = new Float64Array(m);
      L.push({ n, m, W, b, mW: new Float64Array(n * m), vW: new Float64Array(n * m), mb: new Float64Array(m), vb: new Float64Array(m) });
    }
    return { L, t: 0 };
  }
  function forward(net, x) { // returns activations per layer
    const acts = [x];
    net.L.forEach((ly, li) => {
      const a = acts[acts.length - 1], z = new Float64Array(ly.m), last = li === net.L.length - 1;
      for (let j = 0; j < ly.m; j++) { let s = ly.b[j]; for (let i = 0; i < ly.n; i++) s += a[i] * ly.W[i * ly.m + j]; z[j] = last ? s : Math.tanh(s); }
      acts.push(z);
    });
    return acts;
  }
  function trainEpoch(net, X, Y, lr) {
    const gW = net.L.map((ly) => new Float64Array(ly.W.length)), gb = net.L.map((ly) => new Float64Array(ly.m));
    let loss = 0; const N = X.length;
    for (let s = 0; s < N; s++) {
      const acts = forward(net, X[s]), out = acts[acts.length - 1];
      let delta = new Float64Array(out.length);
      for (let j = 0; j < out.length; j++) { const e = out[j] - Y[s][j]; loss += e * e; delta[j] = 2 * e / N; }
      for (let li = net.L.length - 1; li >= 0; li--) {
        const ly = net.L[li], a = acts[li];
        for (let i = 0; i < ly.n; i++) for (let j = 0; j < ly.m; j++) gW[li][i * ly.m + j] += a[i] * delta[j];
        for (let j = 0; j < ly.m; j++) gb[li][j] += delta[j];
        if (li > 0) { const nd = new Float64Array(ly.n); for (let i = 0; i < ly.n; i++) { let sum = 0; for (let j = 0; j < ly.m; j++) sum += ly.W[i * ly.m + j] * delta[j]; nd[i] = sum * (1 - a[i] * a[i]); } delta = nd; }
      }
    }
    net.t++; const b1 = 0.9, b2 = 0.999, eps = 1e-8, c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
    net.L.forEach((ly, li) => {
      const upd = (P, G, Mm, V) => { for (let k = 0; k < P.length; k++) { Mm[k] = b1 * Mm[k] + (1 - b1) * G[k]; V[k] = b2 * V[k] + (1 - b2) * G[k] * G[k]; P[k] -= lr * (Mm[k] / c1) / (Math.sqrt(V[k] / c2) + eps); } };
      upd(ly.W, gW[li], ly.mW, ly.vW); upd(ly.b, gb[li], ly.mb, ly.vb);
    });
    return loss / N;
  }
  const predict = (net, x) => { const a = forward(net, x), o = a[a.length - 1]; for (let j = 0; j < o.length; j++) o[j] = Math.min(1, Math.max(0, o[j])); return o; };
  const mseOf = (net, X, Y) => { let s = 0; X.forEach((x, i) => { const o = predict(net, x); o.forEach((v, j) => { s += (v - Y[i][j]) ** 2; }); }); return s / X.length; };
  const S = { running: false, net: null, hist: [], test: null, metrics: null };
  function runSur() {
    if (S.running) return;
    const base = A.getP(), n = +$('surN').value, nTest = 150, r = rng(777), EPOCHS = 1500;
    S.running = true; S.hist = []; S.net = null; S.metrics = null; S.base = base; $('surRun').disabled = true;
    const Xtr = [], Ytr = [], Xte = [], Yte = [], trainX = lhs(n, r), testX = lhs(nTest, rng(999));
    let phase = 'data', k = 0, ep = 0, simMs = 0; const t0 = now();
    const yOf = (e) => OUT.map(([key]) => e[key] / 100);
    S.stop = slices(() => {
      if (phase === 'data') {
        const isTrain = k < n, x = isTrain ? trainX[k] : testX[k - n];
        const des = toDesign(x), ts = now(), e = evalPhysics(base, des); simMs += now() - ts;
        (isTrain ? Xtr : Xte).push(toX(des)); (isTrain ? Ytr : Yte).push(yOf(e)); k++;
        if (k % 10 === 0) $('surStatus').textContent = `Step 1 of 2: running the physics model for training data · ${k} of ${n + nTest} flushes`;
        if (k >= n + nTest) { phase = 'train'; S.net = makeNet([ND, 32, 32, OUT.length], rng(42)); S.simMs = simMs / (n + nTest); S.data = { Xtr, Ytr, Xte, Yte }; }
        return true;
      }
      const lr = 0.01 * Math.pow(0.1, ep / EPOCHS);
      const l = trainEpoch(S.net, Xtr, Ytr, lr); ep++;
      if (ep % 10 === 0 || ep === 1) { S.hist.push([ep, l, mseOf(S.net, Xte, Yte)]); $('surStatus').textContent = `Step 2 of 2: training the network · epoch ${ep} of ${EPOCHS}`; drawSurLoss(); }
      if (ep >= EPOCHS) return false;
      return true;
    }, () => {
      S.running = false; $('surRun').disabled = false; finishSur((now() - t0) / 1000);
    });
  }
  function finishSur(secs) {
    const { Xte, Yte } = S.data, net = S.net;
    const P = Xte.map((x) => predict(net, x));
    const m = OUT.map((_, j) => {
      const y = Yte.map((v) => v[j] * 100), p = P.map((v) => v[j] * 100), mean = y.reduce((a, b) => a + b, 0) / y.length;
      let ss = 0, st = 0, ae = 0; y.forEach((v, i) => { ss += (v - p[i]) ** 2; st += (v - mean) ** 2; ae += Math.abs(v - p[i]); });
      return { mae: ae / y.length, r2: 1 - ss / (st || 1) };
    });
    // timing: surrogate predictions per second
    const reps = 20000, x = Xte[0]; let t = now(); for (let i = 0; i < reps; i++) predict(net, x); const nnUs = (now() - t) / reps * 1000;
    S.metrics = { m, nnUs, simMs: S.simMs, secs, P };
    const speed = S.simMs * 1000 / nnUs;
    $('surStatus').textContent = `Trained in ${secs.toFixed(1)} s on ${S.data.Xtr.length} physics runs, tested on ${Xte.length} unseen designs.`;
    $('surTable').innerHTML = `<thead><tr><th>Output</th><th>Mean abs. error</th><th>R² on unseen designs</th></tr></thead><tbody>` +
      OUT.map(([, lab], j) => `<tr><td>${lab}</td><td class="num">${fmt(m[j].mae, 1)} points</td><td class="num">${fmt(m[j].r2, 3)}</td></tr>`).join('') + '</tbody>';
    $('surSpeed').innerHTML = `<p><b>${fmt(S.simMs, 1)} ms</b> per flush with the physics model, <b>${fmt(nnUs, 1)} µs</b> with the network: about <b>${Math.round(speed).toLocaleString('en')} times faster</b>.</p><p class="muted">Against a PreonLab run of minutes to hours, the same network would answer roughly 10⁶ to 10⁸ times faster, once its training runs exist.</p>`;
    surCurrent(); drawSurLoss(); drawSurParity();
  }
  function surCurrent() {
    if (!S.net || !S.metrics) return;
    const p = A.getP(), des = {}; DV.forEach((d) => { des[d.k] = p[d.k]; });
    const inRange = DV.every((d) => p[d.k] >= d.min && p[d.k] <= d.max);
    const nn = predict(S.net, toX(des)), ph = evalPhysics(S.base, des);
    $('surCur').innerHTML = `<p><b>Current design</b>${inRange ? '' : ' (outside the training range)'}: network ${OUT.map(([, l], j) => `${l.toLowerCase()} ${fmt(nn[j] * 100, 0)} %`).join(', ')}. Physics model ${OUT.map(([k, l]) => `${fmt(ph[k], 0)} %`).join(', ')}.</p>`;
  }
  function drawSurLoss() {
    const cv = $('cvSurLoss'); if ($('aiSur').hidden) return;
    const h = S.hist, yMax = h.length ? niceUp(Math.max(...h.map((v) => Math.max(v[1], v[2])))) : 1, yMin = h.length ? Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, Math.min(...h.map((v) => Math.min(v[1], v[2]))))))) : 1e-4;
    const f = frame(cv, { x: [0, 1500], y: [yMin, yMax], logy: true, xt: [0, 500, 1000, 1500], yt: [yMin, yMax], yf: (v) => v.toExponential(0), xl: 'Training epoch', yl: 'Error (mean squared, scaled)' });
    const { ctx, X, Y, C, d } = f;
    [[1, C.accent], [2, C.water]].forEach(([j, col]) => { if (!h.length) return; ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 1.8 * d; ctx.beginPath(); h.forEach((v, i) => { const x = X(v[0]), y = Y(v[j]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
    legend(f, [['training designs', C.accent], ['unseen test designs', C.water]]);
  }
  function drawSurParity() {
    const cv = $('cvSurPar'); if ($('aiSur').hidden) return;
    const f = frame(cv, { x: [0, 100], y: [0, 100], xt: [0, 50, 100], yt: [0, 50, 100], xl: 'Physics model, %', yl: 'Neural network, %' });
    const { ctx, X, Y, C, d } = f;
    ctx.strokeStyle = A.rgba(C.muted, 0.7); ctx.setLineDash([4 * d, 4 * d]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(100), Y(100)); ctx.stroke(); ctx.setLineDash([]);
    if (S.metrics) {
      const cols = [C.clean, C.solid, C.paperEdge];
      OUT.forEach((_, j) => { ctx.fillStyle = A.rgba(cols[j], 0.75); S.data.Yte.forEach((y, i) => { ctx.beginPath(); ctx.arc(X(y[j] * 100), Y(Math.max(0, Math.min(100, S.metrics.P[i][j] * 100))), 2.6 * d, 0, TAU2); ctx.fill(); }); });
    }
    legend(f, [['cleaned', C.clean, true], ['solids', C.solid, true], ['paper', C.paperEdge, true]]);
  }
  $('surRun').addEventListener('click', runSur);

  /* =====================================================================
     3. Hybrid calibration against synthetic reference data
     ===================================================================== */
  // hidden "truth": different coefficients plus effects the reduced model cannot represent
  const HIDDEN = { cf: 0.011, ksp: 0.16, tauC: 4.0, Jcrit: 2.0, ucS: 0.42, cmax: 0.09 };
  const CAL = [ // coefficients fitted, in log space, with bounds
    { k: 'cf', lo: 0.003, hi: 0.03 }, { k: 'ksp', lo: 0.05, hi: 0.6 }, { k: 'tauC', lo: 0.5, hi: 15 },
    { k: 'Jcrit', lo: 0.2, hi: 10 }, { k: 'ucS', lo: 0.1, hi: 1.2 }, { k: 'cmax', lo: 0.03, hi: 0.3 }
  ];
  function truth(base, des, r) {
    const e = evalPhysics(base, des, HIDDEN), x = toX(des);
    const dClean = -24 * (x[0] - 0.3) ** 2 + 5 * (x[2] - 0.5);   // e.g. jet break-up away from the best nozzle size, rim asymmetry
    const dSolids = -5 * (1 - x[5]) * (1 - x[0]);                                     // e.g. trap geometry effects at low flow
    return { clean: Math.min(100, Math.max(0, e.clean + dClean + gauss(r) * 0.7)), solids: Math.min(100, Math.max(0, e.solids + dSolids + gauss(r) * 0.7)) };
  }
  const thetaToCoef = (th) => { const o = {}; CAL.forEach((c, i) => { const u = 1 / (1 + Math.exp(-th[i])); o[c.k] = Math.exp(Math.log(c.lo) + u * (Math.log(c.hi) - Math.log(c.lo))); }); return o; };
  const coefToTheta = (o) => CAL.map((c) => { const u = (Math.log(o[c.k]) - Math.log(c.lo)) / (Math.log(c.hi) - Math.log(c.lo)); const uu = Math.min(0.999, Math.max(0.001, u)); return Math.log(uu / (1 - uu)); });
  // Nelder-Mead as a generator, so it can run in time slices
  function* nelderMead(f, x0, iters) {
    const n = x0.length; let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += 0.8; simplex.push(p); }
    let fs = []; for (const p of simplex) { fs.push(f(p)); yield; }
    for (let it = 0; it < iters; it++) {
      const idx = fs.map((v, i) => i).sort((a, b) => fs[a] - fs[b]); simplex = idx.map((i) => simplex[i]); fs = idx.map((i) => fs[i]);
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      const w = simplex[n], pt = (a) => c.map((v, j) => v + a * (w[j] - v));
      const xr = pt(-1), fr = f(xr); yield;
      if (fr < fs[0]) { const xe = pt(-2), fe = f(xe); yield; if (fe < fr) { simplex[n] = xe; fs[n] = fe; } else { simplex[n] = xr; fs[n] = fr; } }
      else if (fr < fs[n - 1]) { simplex[n] = xr; fs[n] = fr; }
      else { const xc = pt(fr < fs[n] ? -0.5 : 0.5), fc = f(xc); yield; if (fc < Math.min(fr, fs[n])) { simplex[n] = xc; fs[n] = fc; } else { for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); fs[i] = f(simplex[i]); yield; } } }
      H.best = { x: simplex[0], f: fs[0], it: it + 1 };
    }
    const i0 = fs.indexOf(Math.min(...fs)); H.best = { x: simplex[i0], f: fs[i0], it: iters };
  }
  // Gaussian process regression with an RBF kernel on the design inputs
  function gpFit(X, y, ell, noise) {
    const n = X.length, mean = y.reduce((a, b) => a + b, 0) / n, yc = y.map((v) => v - mean);
    const sf2 = Math.max(1, yc.reduce((a, b) => a + b * b, 0) / n);
    const k = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return sf2 * Math.exp(-0.5 * s / (ell * ell)); };
    const K = X.map((a, i) => X.map((b, j) => k(a, b) + (i === j ? noise * noise : 0)));
    // Cholesky
    const L = K.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = K[i][j]; for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q]; L[i][j] = i === j ? Math.sqrt(Math.max(1e-9, s)) : s / L[j][j]; }
    const solve = (b) => { const z = new Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let q = 0; q < i; q++) s -= L[i][q] * z[q]; z[i] = s / L[i][i]; } const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let q = i + 1; q < n; q++) s -= L[q][i] * x[q]; x[i] = s / L[i][i]; } return x; };
    const alpha = solve(yc);
    return { predict: (x) => { const ks = X.map((a) => k(a, x)); let m = mean; ks.forEach((v, i) => { m += v * alpha[i]; }); const v = solve(ks); let varr = sf2; ks.forEach((kv, i) => { varr -= kv * v[i]; }); return { m, s: Math.sqrt(Math.max(0, varr)) }; } };
  }
  const H = { running: false, res: null, best: null, ell: null };
  function runHyb() {
    if (H.running) return;
    const base = A.getP(), nRef = +$('hybN').value, r = rng(2026), nHold = 24;
    H.running = true; H.res = null; H.ell = null; H.best = null; $('hybRun').disabled = true;
    const refX = lhs(nRef, rng(5)), holdX = lhs(nHold, rng(6));
    const refD = refX.map(toDesign), holdD = holdX.map(toDesign);
    const log = []; const say = (s) => { log.push(s); $('hybLog').innerHTML = log.map((l) => `<li>${l}</li>`).join(''); };
    const t0 = now(); let refT = null, holdT = null, gen = null, step = 'truth', evals = 0;
    const defaults = {}; CAL.forEach((c) => { defaults[c.k] = base[c.k]; });
    const obj = (th) => {
      const coef = thetaToCoef(th); let s = 0; evals++;
      refD.forEach((des, i) => { const e = evalPhysics(base, des, coef); s += (e.clean - refT[i].clean) ** 2 + (e.solids - refT[i].solids) ** 2; });
      return s / refD.length;
    };
    say(`Generated ${nRef} reference runs and ${nHold} hold-out runs from the hidden reference model (stands in for PreonLab).`);
    H.stop = slices(() => {
      if (step === 'truth') { refT = refD.map((d) => truth(base, d, r)); holdT = holdD.map((d) => truth(base, d, r)); step = 'fit'; gen = nelderMead(obj, coefToTheta(defaults), 60); $('hybStatus').textContent = 'Fitting coefficients with Nelder-Mead…'; return true; }
      if (step === 'fit') {
        const g = gen.next();
        if (H.best) $('hybStatus').textContent = `Fitting coefficients with Nelder-Mead · iteration ${H.best.it} of 60 · error ${fmt(Math.sqrt(H.best.f), 2)} points`;
        if (g.done) { step = 'gp'; say(`Fitted 6 coefficients in ${evals} evaluations (${evals * nRef} model runs).`); }
        return true;
      }
      // GP on residuals of the calibrated model, then score everything on the hold-out set
      const coef = thetaToCoef(H.best.x);
      const refCal = refD.map((d) => evalPhysics(base, d, coef));
      const Xr = refD.map(toX);
      const gps = ['clean', 'solids'].map((key) => {
        const y = refT.map((t, i) => t[key] - refCal[i][key]);
        // pick the kernel length scale by leave-one-out error
        let best = null;
        [0.8, 1.2, 1.8].forEach((ell) => {
          let e = 0; for (let i = 0; i < Xr.length; i++) { const g = gpFit(Xr.filter((_, j) => j !== i), y.filter((_, j) => j !== i), ell, 1.0); e += (g.predict(Xr[i]).m - y[i]) ** 2; }
          if (!best || e < best.e) best = { e, ell };
        });
        const loo0 = y.reduce((a, b) => a + b * b, 0);   // error of "no correction"
        H.ell = H.ell || {}; H.ell[key] = best.ell;
        return best.e < loo0 ? gpFit(Xr, y, best.ell, 1.0) : { predict: () => ({ m: 0, s: 0 }) };
      });
      const stage = (fn) => holdD.map(fn);
      const unc = stage((d) => evalPhysics(base, d)), cal = stage((d) => evalPhysics(base, d, coef));
      const hyb = cal.map((e, i) => { const x = toX(holdD[i]), a = gps[0].predict(x), b = gps[1].predict(x); return { clean: e.clean + a.m, solids: e.solids + b.m, sc: a.s, ss: b.s }; });
      const mae = (pred, key) => pred.reduce((s, e, i) => s + Math.abs(e[key] - holdT[i][key]), 0) / pred.length;
      H.res = { coef, unc, cal, hyb, holdT, mae: { unc: [mae(unc, 'clean'), mae(unc, 'solids')], cal: [mae(cal, 'clean'), mae(cal, 'solids')], hyb: [mae(hyb, 'clean'), mae(hyb, 'solids')] }, defaults };
      say(`Trained a Gaussian-process correction on what the calibrated model still gets wrong (length scale chosen by leave-one-out: ${H.ell.clean} for cleaning, ${H.ell.solids} for solids; the correction is dropped where it would not help).`);
      say(`Scored all three on ${nHold} hold-out designs the fit never saw.`);
      return false;
    }, () => {
      H.running = false; $('hybRun').disabled = false;
      $('hybStatus').textContent = `Done in ${((now() - t0) / 1000).toFixed(1)} s.`;
      const R = H.res;
      $('hybTable').innerHTML = `<thead><tr><th>Coefficient</th><th>Default</th><th>Fitted</th><th>Hidden value</th></tr></thead><tbody>` +
        CAL.map((c) => `<tr><td>${A.SPECK[c.k] ? A.SPECK[c.k].l : c.k}</td><td class="num">${fmt(R.defaults[c.k], 3)}</td><td class="num">${fmt(R.coef[c.k], 3)}</td><td class="num">${fmt(HIDDEN[c.k], 3)}</td></tr>`).join('') + '</tbody>';
      $('hybSum').innerHTML = `<p>Mean error on unseen designs, cleaned and solids removed, in percentage points: uncalibrated <b>${fmt(R.mae.unc[0], 1)} / ${fmt(R.mae.unc[1], 1)}</b>, calibrated <b>${fmt(R.mae.cal[0], 1)} / ${fmt(R.mae.cal[1], 1)}</b>, hybrid <b>${fmt(R.mae.hyb[0], 1)} / ${fmt(R.mae.hyb[1], 1)}</b>.</p><p>${R.mae.hyb[0] < R.mae.cal[0] - 0.2 || R.mae.hyb[1] < R.mae.cal[1] - 0.2 ? 'Calibration removes most of the error; the correction takes off a little more.' : 'Calibration removes most of the error. With this few reference runs the correction adds little, which is typical: it needs enough runs to see a pattern in what is left.'}</p><p class="muted">Fitted coefficients need not match the hidden values exactly: several coefficient sets can explain the same few runs, and the hidden effects push the fit away from them. That is why the hold-out error, not the coefficient match, is the test.</p>`;
      drawHyb();
    });
  }
  function drawHyb() {
    if ($('aiHyb').hidden) return;
    const R = H.res;
    { // bars
      const cv = $('cvHybBars'), mx = R ? niceUp(Math.max(...R.mae.unc, ...R.mae.cal, ...R.mae.hyb) * 1.1) : 10;
      const f = frame(cv, { x: [0, 2], y: [0, mx], xt: [], yt: [0, mx / 2, mx], yl: 'Mean error, points', xl: '' });
      const { ctx, X, Y, C, d, pad, w, h } = f;
      const groups = ['Cleaned', 'Solids removed'], stages = [['uncalibrated', C.lineStrong], ['calibrated', C.water], ['hybrid', C.accent]];
      ctx.font = A.font(10.5, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      groups.forEach((g, gi) => {
        const gx = pad.l + w * (gi + 0.5) / 2; ctx.fillStyle = A.rgba(C.ink); ctx.fillText(g, gx, pad.t + h + 6 * d);
        stages.forEach(([key, col], si) => {
          const bw = w / 10, x = gx + (si - 1) * bw * 1.15 - bw / 2;
          if (!R) return; const v = R.mae[key.slice(0, 3)][gi];
          ctx.fillStyle = A.rgba(col); ctx.fillRect(x, Y(v), bw, Y(0) - Y(v));
          ctx.fillStyle = A.rgba(C.ink); ctx.font = A.font(10); ctx.textBaseline = 'bottom'; ctx.fillText(fmt(v, 1), x + bw / 2, Y(v) - 2 * d); ctx.textBaseline = 'top'; ctx.font = A.font(10.5, 500);
        });
      });
      legend(f, stages.map(([l, c]) => [l, c]));
      if (!R) { ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Run the calibration to compare the three stages', pad.l + w / 2, pad.t + h / 2); }
    }
    { // parity for cleaning
      const cv = $('cvHybPar');
      const f = frame(cv, { x: [0, 100], y: [0, 100], xt: [0, 50, 100], yt: [0, 50, 100], xl: 'Reference (hold-out), cleaned %', yl: 'Model, cleaned %' });
      const { ctx, X, Y, C, d } = f;
      ctx.strokeStyle = A.rgba(C.muted, 0.7); ctx.setLineDash([4 * d, 4 * d]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(100), Y(100)); ctx.stroke(); ctx.setLineDash([]);
      if (R) [['unc', C.lineStrong], ['cal', C.water], ['hyb', C.accent]].forEach(([key, col]) => { ctx.fillStyle = A.rgba(col, 0.85); R[key].forEach((e, i) => { ctx.beginPath(); ctx.arc(X(R.holdT[i].clean), Y(Math.max(0, Math.min(100, e.clean))), 3 * d, 0, TAU2); ctx.fill(); }); });
      if (R) { ctx.strokeStyle = A.rgba(C.accent, 0.5); ctx.lineWidth = 1 * d; R.hyb.forEach((e, i) => { const x = X(R.holdT[i].clean); ctx.beginPath(); ctx.moveTo(x, Y(Math.max(0, e.clean - 2 * e.sc))); ctx.lineTo(x, Y(Math.min(100, e.clean + 2 * e.sc))); ctx.stroke(); }); }
      legend(f, [['uncalibrated', C.lineStrong, true], ['calibrated', C.water, true], ['hybrid ± 2σ', C.accent, true]]);
    }
  }
  $('hybRun').addEventListener('click', runHyb);

  /* ---------------- redraw on resize, theme and design changes ---------------- */
  function redraw() { drawOpt(); drawSurLoss(); drawSurParity(); drawHyb(); }
  const ro = new ResizeObserver(() => requestAnimationFrame(redraw));
  ['cvOpt', 'cvSurLoss', 'cvSurPar', 'cvHybBars', 'cvHybPar'].forEach((id) => ro.observe($(id)));
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  A.onChange(() => { if (S.net && S.metrics) requestAnimationFrame(surCurrent); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  redraw();
})();
