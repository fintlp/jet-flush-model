/* AI lab: the tab row of all six tools, and four of them (the physics-informed network is in pinn.js, the field
   surrogate in field.js). Machine learning and optimisation working with the physics model:
   1. Evolutionary multi-objective design search (NSGA-II style)
   2. Neural surrogate trained in the browser on physics-model runs
   3. Hybrid calibration: Nelder-Mead coefficient fit plus a Gaussian-process correction,
      against synthetic reference data that stands in for high-fidelity solver runs
   4. Noise calibration: the five noise coefficients fitted to recorded flushes (or synthetic demo recordings)
   The tab row follows the ARIA tab pattern (arrow keys, Home, End) and announces the shown tool with 'flushaitab'. */
(function () {
  const A = window.FlushApp, M = window.FlushModel;
  if (!A || !M) return;
  const $ = (id) => document.getElementById(id);
  const TAU2 = Math.PI * 2;
  const SIM = { light: true, coarse: true, Tend: 12 };
  const SIM_FULL = { light: true, Tend: 12 };   // same resolution as the main simulator

  // design variables shared by the optimiser, the surrogate and the hybrid calibration
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
  function evalPhysics(base, design, coeff, opts) {
    const q = Object.assign({}, base, design, coeff || {}, { flushMode: 'full' });
    const r = M.simulate(q, opts || SIM);
    return { clean: r.cleanPct, solids: r.solidsPct, paper: r.paperPct, water: r.water, seal: r.sealEnd, sealOK: r.sealOK, overflow: r.overflow, incomplete: r.incomplete, noise: r.noise.peak, noiseV: r.noise.peakV };
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

  /* ---------------- stale results ---------------- */
  // A tool's results stay valid only while the settings it did not vary are unchanged.
  // the surrogate and the hybrid calibration always simulate a full flush, so the flush button and the partial volume do not matter to them
  const FULL_ONLY = ['flushMode', 'Vpart'];
  const fingerprint = (p, skip) => JSON.stringify(Object.keys(p).filter((k) => !skip.includes(k)).sort().map((k) => [k, p[k]]));
  function staleNote(id, isStale, what) {
    const el = $(id); if (!el) return;
    el.hidden = !isStale;
    if (isStale) el.innerHTML = `<b>Settings changed since this ${what}.</b> The results below are for the earlier configuration. Run it again to update them.`;
  }
  /* ---------------- tabs ---------------- */
  const tabs = document.querySelectorAll('[data-aitab]');
  tabs.forEach((b, i) => b.addEventListener('keydown', (e) => {
    // tab pattern: arrows move between the tools, Home and End go to the first and last; the panel follows
    const n = tabs.length, j = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (j == null) return; e.preventDefault(); e.stopPropagation(); tabs[j].click(); tabs[j].focus();
  }));
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => { x.setAttribute('aria-selected', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
    ['aiOpt', 'aiSur', 'aiHyb', 'aiNoise', 'aiPinn', 'aiField'].forEach((id) => { if ($(id)) $(id).hidden = id !== b.dataset.aitab; });
    document.dispatchEvent(new CustomEvent('flushaitab', { detail: b.dataset.aitab }));
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
    const { ctx, pad, d, w } = f; let x = pad.l + 8 * d, y = pad.t + 8 * d;
    ctx.font = A.font(10); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    items.forEach(([lab, col, dot]) => {
      const need = 14 * d + ctx.measureText(lab).width + 14 * d;
      if (x + need > pad.l + w - 4 * d && x > pad.l + 8 * d) { x = pad.l + 8 * d; y += 14 * d; }
      ctx.fillStyle = A.rgba(col);
      if (dot) { ctx.beginPath(); ctx.arc(x + 4 * d, y, 3.5 * d, 0, TAU2); ctx.fill(); } else ctx.fillRect(x, y - 1.5 * d, 10 * d, 3 * d);
      x += 14 * d; ctx.fillStyle = A.rgba(f.C.muted); ctx.fillText(lab, x, y); x += ctx.measureText(lab).width + 14 * d;
    });
  }
  const niceUp = (v) => { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };

  /* =====================================================================
     1. Evolutionary multi-objective design search
        - the user picks which settings may change (jets, flush, bowl geometry)
        - goal: weighted score vs. water, or targets (constraints) plus a criterion
        - constrained Pareto ranking in the style of NSGA-II
     ===================================================================== */
  const CAND = [
    { k: 'Anoz', grp: 'jets', on: true }, { k: 'alpha', grp: 'jets', on: true }, { k: 'jetPhase', grp: 'jets', on: true },
    { k: 'hNoz', grp: 'jets', on: true }, { k: 'nJets', grp: 'jets', on: false }, { k: 'Hcr', grp: 'jets', on: true },
    { k: 'VOL', grp: 'jets', on: true },
    { k: 'ovality', grp: 'bowl', on: false }, { k: 'Rrim', grp: 'bowl', on: false }, { k: 'Rpool', grp: 'bowl', on: false },
    { k: 'Dwall', grp: 'bowl', on: false }, { k: 'seal', grp: 'bowl', on: false }, { k: 'dTrap', grp: 'bowl', on: false }
  ];
  const optMode = () => ($('optFlush').value === 'partial' ? 'partial' : 'full');
  const volKey = () => (optMode() === 'partial' ? 'Vpart' : 'Vfull');
  function varSpec(k) {
    const key = k === 'VOL' ? volKey() : k, s = A.SPECK[key];
    return { k: key, l: k === 'VOL' ? (optMode() === 'partial' ? 'Partial flush volume' : 'Full flush volume') : s.l, u: s.u, min: s.min, max: s.max, st: s.st, dp: s.d, int: key === 'nJets' };
  }
  // build the checkbox lists once
  (function buildVarPick() {
    const wrap = { jets: $('optVarsJets'), bowl: $('optVarsBowl') };
    CAND.forEach((c) => {
      const id = 'ov_' + c.k, lab = document.createElement('label'); lab.className = 'chk';
      const name = c.k === 'VOL' ? 'Flush volume' : A.SPECK[c.k].l;
      lab.innerHTML = `<input type="checkbox" id="${id}" ${c.on ? 'checked' : ''}> <span>${name}</span>`;
      wrap[c.grp].appendChild(lab);
    });
  })();
  const chosenVars = () => CAND.filter((c) => $('ov_' + c.k).checked).map((c) => varSpec(c.k));
  const snapV = (d, v) => d.int ? Math.round(v) : +(Math.round(v / d.st) * d.st).toFixed(4);
  // The pool must stay at least 25 mm smaller than the rim. Each searched setting is mapped onto the part of its
  // slider range that keeps this gap, given the other settings, so no design needs correcting afterwards and a
  // setting that is not ticked is never altered. The rim is placed first, then the pool.
  const GAP = 25;
  const searched = (vars, k) => vars.some((d) => d.k === k);
  function feasible(d, vars, o) {
    let lo = d.min, hi = d.max;
    if (d.k === 'Rrim' && !searched(vars, 'Rpool')) lo = Math.max(lo, O.base.Rpool + GAP);
    if (d.k === 'Rpool') hi = Math.min(hi, (o.Rrim != null ? o.Rrim : O.base.Rrim) - GAP);
    return [lo, Math.max(lo, hi)];
  }
  const order = (vars) => vars.map((d, i) => [d, i]).sort((a, b) => (a[0].k === 'Rpool') - (b[0].k === 'Rpool'));
  const desOf = (vars, x) => {
    const o = {};
    order(vars).forEach(([d, i]) => { const [lo, hi] = feasible(d, vars, o); o[d.k] = snapV(d, lo + Math.min(1, Math.max(0, x[i])) * (hi - lo)); });
    return o;
  };
  const xOf = (vars, o) => { const x = new Array(vars.length); order(vars).forEach(([d, i]) => { const [lo, hi] = feasible(d, vars, o); x[i] = (o[d.k] - lo) / ((hi - lo) || 1); }); return x; };

  const O = { searchId: 0, pending: false, all: [], front: [], running: false, cur: null, hover: null, stop: null, vars: [], base: null, goal: 'weights', best: null, token: 0, final: false, incomplete: false };
  // once a search is finished, results are only ever taken from designs checked at full resolution
  const pool = () => (O.final ? O.all.filter((e) => e.full) : O.all);
  function weights() {
    const a = +$('wClean').value, b = +$('wSolids').value, c = +$('wPaper').value, s = a + b + c || 1;
    return [a / s, b / s, c / s];
  }
  const targets = () => { const nz = $('tNoise').value.trim(); return { water: +$('tWater').value, clean: +$('tClean').value, solids: +$('tSolids').value, paper: +$('tPaper').value, noise: nz === '' || !isFinite(+nz) ? null : +nz, pick: $('tPick').value }; };
  // noise relative to the current design, at the same resolution: a quick estimate is compared with the current
  // design's quick estimate, a design checked at full resolution with the current design at full resolution (F-08)
  const curFor = (e) => (e && !e.full && O.curC ? O.curC : O.cur);
  const nRel = (e) => { const c = curFor(e); return c && e.noise != null ? e.noise - c.noise : 0; };
  // range of the noise difference over the uncertain coefficients (each variant against the same variant of the current design)
  const nRng = (e) => { const c = curFor(e); return c && e.noiseV && c.noiseV ? A.nRange(e.noiseV, c.noiseV) : { lo: nRel(e), hi: nRel(e) }; };
  const pickCmp = (t) => (a, b) => t.pick === 'water' ? (a.water - b.water || b.score - a.score)
    : t.pick === 'noise' ? (nRng(a).hi - nRng(b).hi || nRel(a) - nRel(b) || b.score - a.score) : (b.score - a.score || a.water - b.water);
  const pickName = (t) => (t.pick === 'water' ? 'lowest water' : t.pick === 'noise' ? 'quietest at the upper end of the sampled noise range' : 'highest score');
  const goal = () => ($('goalTargets').getAttribute('aria-pressed') === 'true' ? 'targets' : 'weights');
  // score, and how far a design misses the constraints (0 = meets all)
  function rate(e) {
    const w = weights(); e.score = w[0] * e.clean + w[1] * e.solids + w[2] * e.paper;
    let v = e.sealOK ? 0 : 1; const miss = [];
    if (!e.sealOK) miss.push('water seal below 50 mm');
    if (e.overflow) { v += 2; miss.push('bowl overflows'); }
    if (e.incomplete) { v += 2; miss.push('flush not finished in 60 s'); }
    if (O.goal === 'targets') {
      const t = targets();
      if (e.water > t.water + 1e-9) { v += (e.water - t.water) / 0.5; miss.push(`water ${fmt(e.water - t.water, 1)} L over`); }
      [['clean', 'cleaned'], ['solids', 'solids'], ['paper', 'paper']].forEach(([k, lab]) => { if (e[k] < t[k] - 1e-9) { v += (t[k] - e[k]) / 5; const d = fmt(t[k] - e[k], t[k] - e[k] < 1 ? 1 : 0); miss.push(`${lab} ${d} point${d === '1' ? '' : 's'} short`); } });
      // a noise limit must hold over the whole uncertainty range, so the upper end counts
      if (t.noise != null && O.cur) {   // the current design counts too: against itself it reads 0 dB
        const over = nRng(e).hi - t.noise; if (over > 1e-9) { v += over / 3; miss.push(`${fmt(over, 1)} dB too loud at the upper end of the sampled noise range`); } }
    }
    e.viol = v; e.miss = miss; return e;
  }
  // constrained domination: meeting the constraints beats missing them; then Pareto on (score up, water down)
  function dominates(a, b) {
    if (a.viol === 0 && b.viol > 0) return true;
    if (a.viol > 0 && b.viol === 0) return false;
    if (a.viol > 0 && b.viol > 0) return a.viol < b.viol;
    return a.score >= b.score && a.water <= b.water && (a.score > b.score || a.water < b.water);
  }
  function ndSort(pop) {
    const fronts = [[]], S = pop.map(() => []), n = pop.map(() => 0);
    pop.forEach((p, i) => { pop.forEach((q, j) => { if (i === j) return; if (dominates(p, q)) S[i].push(j); else if (dominates(q, p)) n[i]++; }); if (n[i] === 0) { p.rank = 0; fronts[0].push(i); } });
    let k = 0;
    while (fronts[k].length) { const nx = []; fronts[k].forEach((i) => S[i].forEach((j) => { if (--n[j] === 0) { pop[j].rank = k + 1; nx.push(j); } })); k++; fronts.push(nx); }
    fronts.forEach((f) => {
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
    const ok = list.filter((a) => a.viol === 0);
    return ok.filter((a) => !ok.some((b) => b !== a && b.score >= a.score && b.water <= a.water && (b.score > a.score || b.water < a.water))).sort((a, b) => a.water - b.water);
  }
  function pickBest(list) {
    if (O.goal !== 'targets') return null;
    const ok = (list || pool()).filter((e) => e.viol === 0), t = targets();
    if (ok.length) return ok.slice().sort(pickCmp(t))[0];
    return null;
  }
  function closest(list) { const L = list || pool(); return L.length ? L.slice().sort((a, b) => a.viol - b.viol || b.score - a.score)[0] : null; }

  /* Progress of the search and its full-resolution check. Shown as a bar with a line of text under the run
     settings, and sent as a 'flushaiprogress' event so the Demo me card can show the same bar. */
  const PG = { phase: null };
  const secs = (ms) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`; };
  function progress(st) {
    if (!st) PG.phase = null; else Object.assign(PG, st);
    if (PG.phase) {
      const el = now() - PG.t0, f = PG.frac;
      const eta = PG.eta != null ? PG.eta : f > 0.04 && el > 1500 ? `, about ${secs(el * (1 - f) / f)} left` : (PG.etaHint ? `, ${PG.etaHint}` : '');
      PG.label = PG.text + eta;
    }
    const box = $('optProg');
    if (box) {
      box.hidden = !PG.phase;
      if (PG.phase) {
        const pc = Math.round(100 * Math.max(0, Math.min(1, PG.frac)));
        box.querySelector('.prog-fill').style.width = pc + '%';
        box.querySelector('.prog-bar').setAttribute('aria-valuenow', String(pc));
        box.querySelector('.prog-txt').textContent = PG.label;
        $('optStop').textContent = PG.phase === 'search' ? 'Cancel search' : 'Stop check, show checked designs';
      }
    }
    document.dispatchEvent(new CustomEvent('flushaiprogress', { detail: Object.assign({}, PG) }));
  }
  // Cancel during the search: nothing is reported. Stop during the check: only the designs checked so far are reported.
  function stopOpt() {
    if (PG.phase === 'search' && O.running && !O.checking) {
      if (O.stop) O.stop(); O.token++; O.cancelled = O.searchId;
      O.running = false; O.all = []; O.front = []; O.best = null; O.hover = null; O.final = false;
      $('optRun').disabled = false; progress(null);
      $('optStatus').textContent = 'Search cancelled. Nothing was changed; start a new search when you are ready.';
      $('optBest').innerHTML = '<p class="ai-note">Search cancelled.</p>';
      drawOpt(); fillOptTable();
    } else if (PG.phase === 'check') O.stopCheck = true;
  }

  // force: cancel whatever search or check is running and start a new one (used by the walkthrough)
  function runOpt(force) {
    if (O.running && !O.checking && !force) return null;   // a search is running; a re-check may be interrupted
    const vars = chosenVars();
    if (!vars.length) { $('optStatus').textContent = 'Tick at least one setting the search may change.'; return null; }
    const base = A.getP(), r = rng(1234), mode = optMode();
    // the simulator keeps this gap; a design that breaks it (for example one stored by an older version) is not searched around
    if (base.Rpool > base.Rrim - GAP + 1e-9 && !searched(vars, 'Rrim') && !searched(vars, 'Rpool')) { $('optStatus').textContent = `The current pool is less than ${GAP} mm smaller than the rim. Tick the rim or pool radius, or change them, then search again.`; return null; }
    const [POP, GENS] = $('optEffort').value === 'thorough' ? [60, 24] : [36, 14];
    if (O.stop) O.stop();   // cancel a search or re-check still running
    const tok = ++O.token, sid = ++O.searchId;
    O.all = []; O.front = []; O.running = true; O.hover = null; O.base = base; O.vars = vars; O.goal = goal(); O.mode = mode; O.best = null; O.final = false; O.incomplete = false; O.checking = false; O.pending = false;
    O.robust = !!($('optRobust') && $('optRobust').checked && window.FlushTol && window.FlushTol.active().length);
    O.cancelled = null;
    O.tolSig = O.robust ? window.FlushTol.signature() : null;
    O.fp = fingerprint(base, vars.map((d) => d.k).concat(['flushMode'])); staleNote('optStale', false);
    // every design carries the context of its search, so it can only be loaded the way it was computed
    const ctx = { sid, mode, fp: O.fp, keys: vars.map((d) => d.k), robust: O.robust };
    $('optRun').disabled = true;
    $('optBest').innerHTML = '<p class="ai-note">Searching. Results appear here when the search and its full-resolution check are finished.</p>';
    const nTot = (GENS + 1) * POP; let nProp = 0;
    $('optStatus').textContent = O.robust
      ? `Robust search: each of about ${nTot.toLocaleString('en')} designs is simulated nominally and with ${RK} varied copies, then the best are checked at full resolution. This takes ${POP > 40 ? 'several minutes' : 'about a minute or two'}.`
      : `Searching about ${nTot.toLocaleString('en')} designs, then checking the best at full resolution.`;
    const searchText = () => `Step 1 of 2, searching: generation ${Math.min(gen + 1, GENS + 1)} of ${GENS + 1}, ${nProp} of ${nTot.toLocaleString('en')} designs`;
    let lastPg = 0;
    $('optHover').textContent = 'Hover a point to read it, click to load that design.';
    setPending(false);
    const ND2 = vars.length;
    // identical designs (after snapping to the slider steps) are simulated once and listed once
    const seenDes = new Map();
    const ev = (x) => {
      nProp++;
      const des = desOf(vars, x), key = JSON.stringify(vars.map((d) => des[d.k])), hit = seenDes.get(key);
      if (hit) return Object.assign({}, hit);   // a copy for the population; the results list keeps one entry
      const e = rate(Object.assign({ x: xOf(vars, des), des, ctx }, evalAny(base, des, mode, SIM, false)));
      seenDes.set(key, e); O.all.push(e); return e;
    };
    O.cur = null; O.curC = null;
    O.cur = (() => { const des = {}; vars.forEach((d) => { des[d.k] = base[d.k]; }); return Object.assign({ des, ctx, full: true }, evalAny(base, des, mode, SIM_FULL, true)); })();
    // the current design at the search's quick resolution, so quick estimates are compared like with like
    O.curC = (() => { const des = {}; vars.forEach((d) => { des[d.k] = base[d.k]; }); return Object.assign({ des, ctx, full: false }, evalAny(base, des, mode, SIM, false)); })();
    rate(O.cur);   // rated once O.cur is set, so its own noise target check applies
    let pop = [], children = [], gen = 0, queue = lhsN(POP, ND2, r); const t0 = now();
    progress({ phase: 'search', t0, frac: 0, text: searchText(), eta: null, etaHint: O.robust ? 'about a minute or more' : 'about 10 seconds' });
    const tour = () => { const a = pop[Math.floor(r() * pop.length)], b = pop[Math.floor(r() * pop.length)]; return (a.rank < b.rank || (a.rank === b.rank && a.crowd > b.crowd)) ? a : b; };
    const breed = () => {
      const kids = [];
      for (let i = 0; i < POP; i++) {
        const p1 = tour(), p2 = tour();
        kids.push(p1.x.map((v, j) => { let c = v + (r() * 1.5 - 0.25) * (p2.x[j] - v); if (r() < 1.5 / ND2) c += gauss(r) * 0.12; return Math.min(1, Math.max(0, c)); }));
      }
      return kids;
    };
    O.stop = slices(() => {
      if (tok !== O.token) return false;
      if (queue.length) {
        (gen === 0 ? pop : children).push(ev(queue.shift()));
        if (now() - lastPg > 150) { lastPg = now(); progress({ frac: nProp / nTot, text: searchText() }); }
        return true;
      }
      if (gen > 0) { const merged = pop.concat(children); ndSort(merged); merged.sort((a, b) => a.rank - b.rank || b.crowd - a.crowd); pop = merged.slice(0, POP); children = []; }
      else ndSort(pop);
      O.front = paretoOf(O.all); O.best = pickBest();
      progress({ frac: nProp / nTot, text: searchText() });
      drawOpt(); fillOptTable();
      if (gen >= GENS) return false;
      gen++; queue = breed(); return true;
    }, () => {
      if (tok !== O.token) return;
      const tSearch = now() - t0, nSearch = O.all.length;
      $('optRun').disabled = false;   // a new search may start while the check runs; it cancels the check
      confirmReported(() => {
        O.running = false; progress(null);
        $('optStatus').textContent = `Done: ${nSearch} different designs simulated${O.robust ? `, each nominally and with ${RK} varied copies,` : ''} in ${(tSearch / 1000).toFixed(1)} s, ${(tSearch / nSearch).toFixed(1)} ms each. ${checkedLine()}${O.robust ? ` Robust: cleaning, solids and paper are the low end, water and noise the high end, of each design's spread under the tolerances. The full-resolution check uses the same copies.` : ''}`;
      });
    });
    return sid;
  }
  // while results are re-checked for new targets or weights, the published ones are marked as pending
  function setPending(on) {
    O.pending = !!on;
    ['optBest', 'optTable'].forEach((id) => { const el = $(id); if (el) el.classList.toggle('pending', O.pending); });
    const n = $('optPendingNote'); if (n) n.hidden = !O.pending;
  }
  function checkedLine() {
    const nOk = pool().filter((e) => e.viol === 0).length;
    const head = O.incomplete ? `${O.userStopped ? 'You stopped the full-resolution check' : 'The full-resolution check stopped'} after ${O.nChecked || 0} designs. The recommendations and table rows use only checked designs, so better ones may exist; the other points in the chart are quick estimates. Search again or tighten the targets.` : 'Every recommendation and table row is checked at full resolution; the other points in the chart are quick estimates.';
    return `${head} ${O.goal === 'targets' ? nOk + ' checked designs meet all targets.' : O.front.length + ' designs on the best trade-off curve.'}`;
  }
  // The search runs at coarse wall-film resolution for speed, which can be off by several points of cleaning in
  // short, strong flushes. Every design that can be reported (trade-off curve, best and closest candidates, table
  // rows) is re-run at the simulator's own resolution and re-rated before it is shown as a result. Re-checking can
  // change the ranking, so it repeats until all reported designs are checked.
  function confirmReported(done) {
    if (O.stop) O.stop();
    const tok = ++O.token, base = O.base, mode = O.mode, seen = new Set(), check = [];
    let nChecked = 0, nearN = 0;
    O.incomplete = false; O.stopCheck = false; O.userStopped = false;
    const tc = now(), within = O.running;   // within: the check that ends a search, otherwise a re-check for new targets or weights
    const cap = O.cap || 200;
    // How many designs the check needs is not known in advance: checking can move new designs into the ranking.
    // The bar runs against the limit of 200 and the time left is given as a range, from the designs waiting
    // now to the limit.
    const checkText = () => `${within ? 'Step 2 of 2, checking' : 'Re-checking for the new targets or weights'} at full resolution: ${nChecked} designs checked, ${check.length} waiting, at most ${cap}${O.robust ? `, each with ${RKF} varied copies` : ''}`;
    const checkEta = () => {
      if (nChecked < 3 || now() - tc < 1000) return '';
      const per = (now() - tc) / nChecked, lo = per * check.length, hi = per * Math.max(check.length, cap - nChecked);
      return hi - lo < 1500 ? `, about ${secs(lo)} left` : `, ${secs(lo)} to ${secs(hi)} left`;
    };
    // The published results (O.front, O.best, summary, table) stay as they are until the check is finished;
    // candidates are collected from all designs into local lists.
    const add = (e) => { if (e && !e.full && !seen.has(e)) { seen.add(e); check.push(e); } };
    const collect = () => {
      // always rate against the targets and weights as they are now, so edits during the check count
      O.goal = goal(); O.all.forEach(rate); if (O.cur) rate(O.cur);
      paretoOf(O.all).forEach(add); add(pickBest(O.all));
      if (O.goal === 'targets') {
        const t = targets(), ok = O.all.filter((e) => e.viol === 0);
        ok.sort(pickCmp(t)).slice(0, 12).forEach(add);
        if (!ok.length) O.all.slice().sort((a, b) => a.viol - b.viol || b.score - a.score).slice(0, 6).forEach(add);
        // designs that miss the targets only by about the quick estimate's error (up to 3 points in one result) may
        // meet them at full resolution, so the best of them are checked too (F-08)
        // (at most 24 in one check, so this cannot keep the check going)
        if (nearN < 24) O.all.filter((e) => !e.full && !seen.has(e) && e.viol > 0 && e.viol <= 0.6 && e.sealOK && !e.overflow && !e.incomplete)
          .sort((a, b) => a.viol - b.viol || b.score - a.score).slice(0, Math.min(8, 24 - nearN)).forEach((e) => { add(e); nearN++; });
      }
    };
    collect();
    O.checking = true;
    if (O.final) setPending(true);   // results already shown belong to the old targets until this check is done
    progress({ phase: 'check', t0: tc, frac: 0, text: checkText(), eta: '' });
    O.stop = slices(() => {
      if (tok !== O.token) return false;
      let e = check.shift();
      if (!e) {
        collect();   // the ranking or the targets may have moved: check the newcomers
        e = check.shift(); if (!e) return false;
      }
      if (O.stopCheck) { O.incomplete = true; O.userStopped = true; return false; }   // stopped by the user
      if (nChecked >= cap) { O.incomplete = true; return false; }   // stop; only checked designs are reported
      Object.assign(e, evalAny(base, e.des, mode, SIM_FULL, true), { full: true }); rate(e); nChecked++; O.nChecked = nChecked;
      progress({ frac: nChecked / cap, text: checkText(), eta: checkEta() });
      return true;
    }, () => {
      if (tok !== O.token) return;
      O.final = true; O.goal = goal(); O.all.forEach(rate); if (O.cur) rate(O.cur);
      O.front = paretoOf(pool()); O.best = pickBest(); O.checking = false; setPending(false); progress(null);
      drawOpt(); fillOptTable(); optSummary(); if (done) done();
      optStaleCheck();   // settings may have changed while the search ran
    });
  }
  function evalPhysicsMode(base, des, mode, opts) {
    const q = Object.assign({}, base, des, { flushMode: mode });
    const r = M.simulate(q, opts || SIM);
    return { clean: r.cleanPct, solids: r.solidsPct, paper: r.paperPct, water: r.water, seal: r.sealEnd, sealOK: r.sealOK, overflow: r.overflow, incomplete: r.incomplete, noise: r.noise.peak, noiseV: r.noise.peakV };
  }
  /* Robust rating: a design is simulated nominally and under K varied copies drawn from the tolerances of the
     tolerance study (window.FlushTol), in antithetic pairs and with the same random numbers for every design, so
     designs are compared under the same deviations. Cleaning, solids and paper are rated at the low end of their
     spread and water and noise at the high end, estimated as mean ∓ 1.28 standard deviations (the 10 % and 90 %
     points of a normal distribution). A design only counts as restoring the seal, not overflowing and finishing if
     all its copies do. */
  const RK = 6, RKF = 6, RSEED = 909, Z10 = 1.2816;
  function evalRobust(base, des, mode, opts, K) {
    const nom = evalPhysicsMode(base, des, mode, opts), T = window.FlushTol;
    const keep = { clean: nom.clean, solids: nom.solids, paper: nom.paper, water: nom.water, noise: nom.noise };
    if (!T || !T.active().length) return Object.assign(nom, { nom: keep, robust: true, nVar: 0 });
    const q = Object.assign({}, base, des, { flushMode: mode });
    const ss = T.samples(q, K, RSEED, true).map((sm) => { const r = M.simulate(sm.q, opts || SIM); return { clean: r.cleanPct, solids: r.solidsPct, paper: r.paperPct, water: r.water, noise: r.noise.peak, sealOK: r.sealOK, overflow: r.overflow, incomplete: r.incomplete }; });
    const st = (k) => { const v = ss.map((x) => x[k]), m = v.reduce((a, b) => a + b, 0) / v.length; return { m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)) }; };
    const lo = (k) => { const x = st(k); return Math.max(0, x.m - Z10 * x.sd); }, hi = (k) => { const x = st(k); return x.m + Z10 * x.sd; };
    const nz = hi('noise');
    return {
      clean: lo('clean'), solids: lo('solids'), paper: lo('paper'), water: hi('water'), noise: nz, noiseV: nom.noiseV.map((v) => v + nz - nom.noise),
      seal: nom.seal, sealOK: nom.sealOK && ss.every((x) => x.sealOK), overflow: nom.overflow || ss.some((x) => x.overflow), incomplete: nom.incomplete || ss.some((x) => x.incomplete),
      nom: keep, robust: true, nVar: K
    };
  }
  const evalAny = (base, des, mode, opts, full) => (O.robust ? evalRobust(base, des, mode, opts, full ? RKF : RK) : evalPhysicsMode(base, des, mode, opts));
  function lhsN(n, nd, r) {
    const cols = Array.from({ length: nd }, () => { const p = Array.from({ length: n }, (_, i) => (i + r()) / n); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
    return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
  }
  const sdb = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${fmt(Math.abs(v), 1)}`;
  const metricsLine = (e) => { const g = nRng(e); return (e.robust ? 'at the low end of its tolerance spread: ' : '') + `cleaned ${fmt(e.clean, 0)} %, solids ${fmt(e.solids, 0)} %, paper ${fmt(e.paper, 0)} %, ${fmt(e.water, 1)} L` + (O.cur && e !== O.cur ? `, noise ${sdb(nRel(e))} dB vs now (range ${sdb(g.lo)} to ${sdb(g.hi)})` : '') + (e.robust && e.nom ? ` (nominal: cleaned ${fmt(e.nom.clean, 0)} %, solids ${fmt(e.nom.solids, 0)} %, paper ${fmt(e.nom.paper, 0)} %, ${fmt(e.nom.water, 1)} L)` : ''); };
  function optSummary() {
    const c = O.cur; if (!c) return;
    let shown = null;   // the Load button always loads exactly the design described here
    const box = $('optBest'); let html = `<p><b>Current design:</b> ${metricsLine(c)}, score ${fmt(c.score, 1)}${c.viol > 0 ? ` (${c.miss.join(', ')})` : ''}.</p>`;
    if (O.goal === 'targets') {
      const b = O.best, t = targets();
      if (b) { shown = b; html += `<p><b>Best design meeting all targets</b> (${pickName(t)}): ${metricsLine(b)}, score ${fmt(b.score, 1)}.</p><p><button class="btn primary mini" type="button" id="optLoadBest">Load this design</button></p>`; }
      else { const cl = closest(); shown = cl; html += `<p><b>No design met all targets.</b>${cl ? ` Closest: ${metricsLine(cl)}; ${cl.miss.join(', ')}.` : ''} Try loosening a target, allowing more settings to change, or the thorough search.</p>` + (cl ? `<p><button class="btn mini" type="button" id="optLoadBest">Load the closest design</button></p>` : ''); }
    } else if (O.front.length) {
      const same = O.front.filter((e) => e.water <= c.water + 1e-9).sort((a, b) => b.score - a.score)[0];
      const lean = O.front.filter((e) => e.score >= c.score).sort((a, b) => a.water - b.water)[0];
      if (same) html += `<p>Best with the same or less water: score ${fmt(same.score, 1)} at ${fmt(same.water, 1)} L (${same.score >= c.score ? '+' : ''}${fmt(same.score - c.score, 1)} points).</p>`;
      if (lean && lean.water < c.water - 0.05) html += `<p>Same score with less water: ${fmt(lean.water, 1)} L, saving ${fmt(c.water - lean.water, 1)} L per flush.</p>`;
    }
    box.innerHTML = html;
    const btn = $('optLoadBest'); if (btn && shown) btn.addEventListener('click', () => loadOpt(shown));
  }
  let optGeom = null;
  function drawOpt() {
    const cv = $('cvOpt'); if ($('aiOpt').hidden) return;
    const pts = O.all, all = pts.concat(O.cur ? [O.cur] : []);
    const ys = all.map((e) => e.score), ws = all.map((e) => e.water);
    const lo = ys.length ? Math.max(0, Math.floor(Math.min(...ys) / 10) * 10) : 0, hi = ys.length ? Math.min(100, Math.ceil(Math.max(...ys) / 10) * 10) : 100;
    const wl = ws.length ? Math.floor(Math.min(2, ...ws)) : 2, wh = ws.length ? Math.ceil(Math.max(7, ...ws)) : 7;
    const xt = []; for (let v = wl; v <= wh; v++) xt.push(v);
    const f = frame(cv, { x: [wl, wh], y: [lo, Math.max(lo + 10, hi)], xt, xl: 'Water per flush, L', yl: 'Weighted score', yt: [lo, (lo + Math.max(lo + 10, hi)) / 2, Math.max(lo + 10, hi)] });
    const { ctx, X, Y, C, d } = f;
    if (O.goal === 'targets' && pts.length) { const t = targets(); ctx.strokeStyle = A.rgba(C.ink, 0.5); ctx.setLineDash([5 * d, 4 * d]); ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.moveTo(X(t.water), f.pad.t); ctx.lineTo(X(t.water), f.pad.t + f.h); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(10); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('water target', X(t.water) + 4 * d, f.pad.t + f.h - 4 * d); }
    pts.forEach((e) => {
      const x = X(e.water), y = Y(Math.max(lo, e.score));
      if (e.viol === 0) { ctx.fillStyle = A.rgba(C.lineStrong, 0.6); ctx.beginPath(); ctx.arc(x, y, 2.6 * d, 0, TAU2); ctx.fill(); }
      else { ctx.strokeStyle = A.rgba(C.bad, 0.55); ctx.lineWidth = 1 * d; ctx.beginPath(); ctx.arc(x, y, 2.4 * d, 0, TAU2); ctx.stroke(); }
    });
    if (O.front.length && !O.pending) {
      ctx.strokeStyle = A.rgba(C.accent); ctx.lineWidth = 2 * d; ctx.beginPath();
      O.front.forEach((e, i) => { const x = X(e.water), y = Y(e.score); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.fillStyle = A.rgba(C.accent); O.front.forEach((e) => { ctx.beginPath(); ctx.arc(X(e.water), Y(e.score), 4 * d, 0, TAU2); ctx.fill(); });
    }
    if (O.best && !O.pending) { const x = X(O.best.water), y = Y(O.best.score), s = 9 * d; ctx.fillStyle = A.rgba(C.clean); ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.45 : s; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } ctx.closePath(); ctx.fill(); }
    if (O.cur) { const x = X(O.cur.water), y = Y(Math.max(lo, O.cur.score)); ctx.strokeStyle = A.rgba(C.ink); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, 7 * d, 0, TAU2); ctx.stroke(); }
    if (O.hover) { const x = X(O.hover.water), y = Y(Math.max(lo, O.hover.score)); ctx.strokeStyle = A.rgba(C.accent); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, 8 * d, 0, TAU2); ctx.stroke(); }
    const leg = [['meets constraints', C.lineStrong, true], ['misses a target or the seal', C.bad, true], ['best trade-off', C.accent, true]];
    if (O.goal === 'targets') leg.push(['best meeting targets', C.clean, true]);
    leg.push(['current (ring)', C.ink, false]);
    legend(f, leg);
    if (!pts.length) { ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Choose what may change and start the search', f.pad.l + f.w / 2, f.pad.t + f.h / 2); }
    optGeom = { X, Y, lo };
  }
  function fillOptTable() {
    const vars = O.vars;
    let rows, title;
    if (O.goal === 'targets') {
      const t = targets(), ok = pool().filter((e) => e.viol === 0);
      rows = ok.sort(pickCmp(t)).slice(0, 10);
      title = rows.length ? `Designs meeting all targets, sorted by ${t.pick === 'water' ? 'water' : t.pick === 'noise' ? 'noise' : 'score'}` : 'No design meets all targets yet';
    } else { rows = O.front.slice(0, 12); title = rows.length ? 'Best trade-off designs, sorted by water' : ''; }
    if (O.robust && rows.length) title = 'Robust, rated at the low end of the tolerance spread. ' + title;
    if (!O.final && rows.length) title = 'Search running, quick estimates: ' + title.charAt(0).toLowerCase() + title.slice(1);
    $('optTableTitle').textContent = title;
    $('optTable').innerHTML = rows.length ? `<thead><tr><th></th><th>Water, L</th><th>Score</th><th>Cleaned, %</th><th>Solids, %</th><th>Paper, %</th><th>Noise, dB vs now</th>${vars.map((d) => `<th>${d.l}${d.u ? ', ' + d.u : ''}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((e, i) => `<tr${e === O.best ? ' class="best"' : ''}><td><button class="btn mini" type="button" data-opt="${i}">Load</button></td><td class="num">${fmt(e.water, 1)}</td><td class="num">${fmt(e.score, 1)}</td><td class="num">${fmt(e.clean, 0)}</td><td class="num">${fmt(e.solids, 0)}</td><td class="num">${fmt(e.paper, 0)}</td><td class="num">${sdb(nRel(e))} <span class="rng">(${sdb(nRng(e).lo)} to ${sdb(nRng(e).hi)})</span></td>${vars.map((d) => `<td class="num">${fmt(e.des[d.k], d.int ? 0 : d.dp)}</td>`).join('')}</tr>`).join('') + '</tbody>' : '';
    $('optTable').querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => loadOpt(rows[+b.dataset.opt])));
  }
  function loadOpt(e) {
    if (!e) return false;
    const c = e.ctx;
    if (!c || c.sid !== O.searchId) { $('optHover').textContent = 'That result belongs to an earlier search, so it was not loaded. Load one from the current results.'; return false; }
    if (fingerprint(A.getP(), c.keys.concat(['flushMode'])) !== c.fp) { $('optHover').textContent = 'Settings the search did not vary have changed since the search, so the result would not match. Run the search again.'; return false; }
    A.apply(Object.assign({ flushMode: c.mode }, e.des));
    $('optHover').innerHTML = `Loaded: ${metricsLine(e)}. <button class="btn mini" type="button" id="watchBtn">Watch this flush</button>`;
    $('watchBtn').addEventListener('click', () => { const el = document.getElementById('sim'); if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); A.play(0, 0.5); });
    return true;
  }
  function nearestOpt(ev) {
    if (!optGeom || !O.all.length) return null;
    const b = $('cvOpt').getBoundingClientRect(), x = (ev.clientX - b.left) * A.dpr(), y = (ev.clientY - b.top) * A.dpr();
    let best = null, bd = 14 * A.dpr();
    O.all.forEach((e) => { const dd = Math.hypot(optGeom.X(e.water) - x, optGeom.Y(Math.max(optGeom.lo, e.score)) - y); if (dd < bd) { bd = dd; best = e; } });
    return best;
  }
  $('cvOpt').addEventListener('mousemove', (ev) => {
    const e = nearestOpt(ev); O.hover = e; drawOpt();
    $('optHover').textContent = e ? `${metricsLine(e)} · score ${fmt(e.score, 1)}${e.viol > 0 ? ' · ' + e.miss.join(', ') : ''}${e.full ? '' : ' · quick estimate, the simulator may differ'}. Click to load.` : 'Hover a point to read it, click to load that design.';
  });
  $('cvOpt').addEventListener('click', (ev) => loadOpt(nearestOpt(ev)));
  $('optRun').addEventListener('click', () => runOpt());
  $('optStop').addEventListener('click', stopOpt);
  // re-rate existing results when weights or targets change, without re-running
  function rerate() {
    // during the search itself the final check re-rates everything with the latest targets
    if (!O.all.length || (O.running && !O.checking)) return;
    const wasRunning = O.running;
    // new targets or weights can promote designs that were only rated coarsely: check them before reporting
    confirmReported(() => {
      O.running = false;
      $('optStatus').textContent = `Re-rated for the new ${O.goal === 'targets' ? 'targets' : 'weights'}${wasRunning ? ' during the check' : ''}. ${checkedLine()}`;
    });
    drawOpt();
  }
  ['wClean', 'wSolids', 'wPaper'].forEach((id) => $(id).addEventListener('input', () => {
    const w = weights(); $('wOut').textContent = `Score weights: cleaning ${Math.round(w[0] * 100)} % · solids ${Math.round(w[1] * 100)} % · paper ${Math.round(w[2] * 100)} %`; rerate();
  }));
  ['tWater', 'tClean', 'tSolids', 'tPaper', 'tNoise', 'tPick'].forEach((id) => $(id).addEventListener('input', rerate));
  function setGoal(g) {
    $('goalWeights').setAttribute('aria-pressed', String(g === 'weights')); $('goalTargets').setAttribute('aria-pressed', String(g === 'targets'));
    $('optTargets').hidden = g !== 'targets'; rerate();
  }
  $('goalWeights').addEventListener('click', () => setGoal('weights'));
  $('goalTargets').addEventListener('click', () => setGoal('targets'));
  $('optFlush').addEventListener('change', () => { const lab = document.querySelector('label[for="ov_VOL"], #ov_VOL + span'); if (lab) lab.textContent = optMode() === 'partial' ? 'Flush volume (partial)' : 'Flush volume'; });

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
    S.fp = fingerprint(base, DV.map((d) => d.k).concat(FULL_ONLY)); staleNote('surStale', false);
    const Xtr = [], Ytr = [], Xte = [], Yte = [], trainX = lhs(n, r), testX = lhs(nTest, rng(999));
    let phase = 'data', k = 0, ep = 0, simMs = 0; const t0 = now();
    const yOf = (e) => OUT.map(([key]) => e[key] / 100);
    S.stop = slices(() => {
      if (phase === 'data') {
        const isTrain = k < n, x = isTrain ? trainX[k] : testX[k - n];
        const des = toDesign(x), ts = now(), e = evalPhysics(base, des, null, SIM_FULL); simMs += now() - ts;
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
    $('surSpeed').innerHTML = `<p><b>${fmt(S.simMs, 1)} ms</b> per flush with the physics model, <b>${fmt(nnUs, 1)} µs</b> with the network: about <b>${Math.round(speed).toLocaleString('en')} times faster</b>.</p><p class="muted">Both timings are measured in this browser. A high-fidelity run of a flush, SPH or VOF, takes minutes to hours, so a network trained on such runs could be faster still by a much larger factor. That is a rough expectation, not a benchmark, and the training runs would have to be paid for first.</p>`;
    surCurrent(); drawSurLoss(); drawSurParity();
  }
  function surCurrent() {
    if (!S.net || !S.metrics) return;
    const p = A.getP(), des = {}; DV.forEach((d) => { des[d.k] = p[d.k]; });
    const inRange = DV.every((d) => p[d.k] >= d.min && p[d.k] <= d.max);
    if (fingerprint(p, DV.map((d) => d.k).concat(FULL_ONLY)) !== S.fp) {
      $('surCur').innerHTML = '<p><b>Current design:</b> no prediction. The network was trained with different bowl or flush settings, so it does not apply to this configuration. Train it again.</p>';
      return;
    }
    const nn = predict(S.net, toX(des)), ph = evalPhysics(p, des, null, SIM_FULL);
    // the network learns full flushes only, so both numbers are for a full flush whatever the button above says
    $('surCur').innerHTML = `<p><b>Current design, full flush</b>${inRange ? '' : ' (outside the training range)'}: network ${OUT.map(([, l], j) => `${l.toLowerCase()} ${fmt(nn[j] * 100, 0)} %`).join(', ')}. Physics model ${OUT.map(([k, l]) => `${fmt(ph[k], 0)} %`).join(', ')}.</p>${p.flushMode === 'partial' ? '<p class="ai-note">The simulator is set to a partial flush, so its result cards differ from these full-flush numbers.</p>' : ''}`;
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
  function* nelderMead(f, x0, iters, sink) {
    sink = sink || H;
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
      sink.best = { x: simplex[0], f: fs[0], it: it + 1 };
    }
    const i0 = fs.indexOf(Math.min(...fs)); sink.best = { x: simplex[i0], f: fs[i0], it: iters };
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
    H.fp = fingerprint(base, DV.map((d) => d.k).concat(CAL.map((c) => c.k), FULL_ONLY)); staleNote('hybStale', false);
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
    say(`Generated ${nRef} reference runs and ${nHold} hold-out runs from the hidden reference model (stands in for high-fidelity solver runs).`);
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
      if (!R) { ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const t = 'Run the calibration to compare the three stages'; ctx.fillText(ctx.measureText(t).width > w - 16 ? 'Run the calibration first' : t, pad.l + w / 2, pad.t + h / 2); }
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

  /* =====================================================================
     4. Noise calibration
        - recordings of real flushes (audio files or sound level meter readings) per design, or synthetic
          recordings made from a hidden reference in the demo
        - audio is A-weighted and turned into a 'fast' level (125 ms), as a sound level meter does; the peak is used
        - each design is simulated once; its flow series are re-evaluated by FlushModel.noiseEval for any noise
          coefficients, so the fit costs almost nothing per step
        - the fit matches the model's peak differences between designs to the measured ones (a free offset absorbs
          microphone, room and distance), plus optional air core times from video, with a weak pull towards the
          current values so a few designs cannot drive coefficients to their limits
     ===================================================================== */
  const NZK = ['nUe', 'hFall', 'rCore', 'cCore', 'wTrap'];
  const NZB = { nUe: [0.4, 1.5], hFall: [40, 300], rCore: [0.3, 1], cCore: [0.003, 0.3], wTrap: [0.01, 1] };   // the slider ranges (cCore above 0 for the log scale)
  const NZ_HIDDEN = { nUe: 1.0, hFall: 170, rCore: 0.5, cCore: 0.1, wTrap: 0.22 };
  const NZ_STORE = 'tfs-noise-v1';
  const NZ = { mode: 'demo', demo: [], real: [], fit: null, running: false, sel: 0 };
  const nzList = () => (NZ.mode === 'demo' ? NZ.demo : NZ.real);
  const coefOf = (p) => ({ nUe: p.nUe, nExp: p.nExp, nK: p.nK, hFall: p.hFall, rCore: p.rCore, cCore: p.cCore, wTrap: p.wTrap });

  // ---- audio: A-weighting (IEC 61672 poles, bilinear with prewarping) and 'fast' exponential level ----
  function aWeightSections(sr) {
    const fs2 = 2 * sr, pw = (f) => fs2 * Math.tan(Math.PI * f / sr);
    const secs = [['h', 20.6], ['h', 20.6], ['h', 107.7], ['h', 737.9], ['l', 12194], ['l', 12194]].filter(([, f]) => f < 0.45 * sr).map(([k, f]) => ({ k, w: pw(f) }));
    // normalise to 0 dB at 1 kHz
    const Om = 2 * Math.PI * 1000 / sr, c = Math.cos(Om), sn = Math.sin(Om);
    let g = 1;
    for (const q of secs) {
      const den = Math.hypot(fs2 + q.w - (fs2 - q.w) * c, (fs2 - q.w) * sn);
      g *= (q.k === 'h' ? fs2 * 2 * Math.sin(Om / 2) : q.w * 2 * Math.cos(Om / 2)) / den;
    }
    return { secs, fs2, g };
  }
  // level over time in dB (relative to full scale for audio): A-weighted, 125 ms exponential, every 10 ms
  function analyzeSamples(x, sr) {
    const { secs, fs2, g } = aWeightSections(sr), y = Float64Array.from(x);
    for (const q of secs) {
      let xp = 0, yp = 0; const a = fs2 + q.w, b = fs2 - q.w;
      for (let i = 0; i < y.length; i++) { const xi = y[i], yi = q.k === 'h' ? (fs2 * (xi - xp) + b * yp) / a : (q.w * (xi + xp) + b * yp) / a; xp = xi; yp = yi; y[i] = yi; }
    }
    const aF = 1 - Math.exp(-1 / (sr * 0.125)), step = Math.max(1, Math.round(sr * 0.01)), t = [], L = [];
    let e = 0, emax = 0;
    for (let i = 0; i < y.length; i++) { const v = y[i] / g; e += (v * v - e) * aF; if (e > emax) emax = e; if (i % step === 0) { t.push(i / sr); L.push(10 * Math.log10(e + 1e-15)); } }
    return { t, L, peak: 10 * Math.log10(emax + 1e-15), dur: y.length / sr };
  }
  function decodeFile(file) {
    return file.arrayBuffer().then((buf) => new Promise((res, rej) => {
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Ctx) { rej(new Error('This browser cannot decode audio.')); return; }
      const ctx = new Ctx(1, 1, 44100);
      const done = (ab) => { const n = ab.length, x = new Float32Array(n); for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < n; i++) x[i] += d[i] / ab.numberOfChannels; } res({ x, sr: ab.sampleRate }); };
      const pr = ctx.decodeAudioData(buf, done, (e) => rej(e || new Error('The file could not be decoded.')));
      if (pr && pr.catch) pr.catch(() => { });
    }));
  }

  // ---- designs ----
  const DKEYS = ['Vfull', 'Vpart', 'Hcr', 'Kpath', 'nJets', 'Anoz', 'hNoz', 'alpha', 'jetPhase', 'ovality', 'Rrim', 'Rpool', 'Dwall', 'seal', 'dTrap', 'Hs', 'Ks', 'Qgrav', 'Vtrap', 'refill'];
  function nzLabel(p) {
    const d = M.defaults(p.type === 'siphonic' ? 'siphonic' : 'washdown');
    const ch = DKEYS.filter((k) => Math.abs((+p[k]) - (+d[k])) > 1e-9).map((k) => { const s = A.SPECK[k]; return `${s.l.toLowerCase()} ${fmt(p[k], s.d)}${s.u ? ' ' + s.u : ''}`; });
    return `${p.type === 'siphonic' ? 'Siphonic' : 'Washdown'}${p.flushMode === 'partial' ? ', partial flush' : ''}${ch.length ? ' · ' + ch.slice(0, 3).join(', ') + (ch.length > 3 ? ` and ${ch.length - 3} more` : '') : ' · preset'}`;
  }
  const sameDesign = (a, b) => DKEYS.concat(['type', 'flushMode']).every((k) => a[k] === b[k]);
  function nzSeries(d) { if (!d.ser) { const r = M.simulate(Object.assign({}, d.p), { light: true, Tend: 12, noiseSeries: true }); d.ser = r.noiseSeries; d.tEnd = r.tEnd; d.tEmpty = r.tEmpty; } return d.ser; }
  const nzMeas = (d) => { const v = d.recs.map((r) => r.peak); return v.length ? { m: v.reduce((a, b) => a + b, 0) / v.length, lo: Math.min(...v), hi: Math.max(...v) } : null; };
  function nzAirObs(d) { const s = String(d.air == null ? '' : d.air).trim().toLowerCase(); if (!s) return null; if (s === 'none' || s === 'no' || s === '-') return { none: true }; const v = parseFloat(s.replace(',', '.')); return isFinite(v) && v >= 0 ? { t: v } : null; }
  function nzSave() {
    try { localStorage.setItem(NZ_STORE, JSON.stringify(NZ.real.map((d) => ({ p: d.p, air: d.air, recs: d.recs.map((r) => ({ name: r.name, peak: r.peak, unit: r.unit })) })))); } catch (e) { }
  }
  try { const o = JSON.parse(localStorage.getItem(NZ_STORE) || '[]'); if (Array.isArray(o)) NZ.real = o.filter((d) => d && d.p && Array.isArray(d.recs)).map((d) => ({ p: d.p, air: d.air || '', recs: d.recs.filter((r) => r && isFinite(r.peak)) })); } catch (e) { }

  // ---- fit ----
  const nzTh = (k, v) => { const [lo, hi] = NZB[k], u = Math.min(0.999, Math.max(0.001, (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)))); return Math.log(u / (1 - u)); };
  const nzVal = (k, th) => { const [lo, hi] = NZB[k], u = 1 / (1 + Math.exp(-th)); return Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))); };
  function nzPredict(designs, coef) {
    return designs.map((d) => { const r = M.noiseEval(nzSeries(d), coef).noise; return { P: r.peak, airT: r.airT }; });
  }
  // squared error of the model's peak differences (free offset) plus air core timing, per design
  function nzErr(designs, coef, prior0, keys) {
    const pr = nzPredict(designs, coef), ms = designs.map((d) => nzMeas(d).m);
    const c = ms.reduce((s, m, i) => s + m - pr[i].P, 0) / ms.length;
    let e = 0;
    pr.forEach((q, i) => {
      e += (q.P + c - ms[i]) ** 2;
      const ob = nzAirObs(designs[i]);
      if (ob) { if (ob.none) e += q.airT == null ? 0 : 4; else e += q.airT == null ? 4 : Math.min(4, ((q.airT - ob.t) / 0.25) ** 2); }   // 0.25 s off counts like 1 dB off
    });
    if (prior0) keys.forEach((k) => { e += 0.1 * Math.log(coef[k] / prior0[k]) ** 2; });
    return { e: e / designs.length, c, pr };
  }
  // Nelder-Mead from several starts (the error has flat parts where a threshold such as the air core is not
  // crossed), as a generator that yields between objective evaluations so the page stays responsive
  function* nzFitGen(designs, base, keys, iters, starts, out) {
    const mk = (th) => { const c = Object.assign({}, base); keys.forEach((k, i) => { c[k] = nzVal(k, th[i]); }); return c; };
    const f = (th) => nzErr(designs, mk(th), base, keys).e;
    let best = null;
    for (const st of starts) {
      const x0 = keys.map((k) => nzTh(k, st[k])), sink = {};
      yield* nelderMead(f, x0, iters, sink);
      if (!best || sink.best.f < best.f) best = sink.best;
    }
    out.coef = mk(best.x);
  }
  const shifted = (base, keys, s) => { const o = Object.assign({}, base); keys.forEach((k) => { o[k] = nzVal(k, nzTh(k, base[k]) + s); }); return o; };
  function nzRunFit() {
    const designs = nzList().filter((d) => d.recs.length);
    const keys = NZK.filter((k) => $('nzv_' + k).checked);
    if (designs.length < 3) { $('nzStatus').textContent = 'At least three designs with recordings are needed: the fit uses the differences between them.'; return; }
    const units = new Set(designs.flatMap((d) => d.recs.map((r) => r.unit)));
    if (units.size > 1) { $('nzStatus').textContent = 'Audio files and meter readings have different zero points and cannot be mixed in one fit. Remove one kind.'; return; }
    const kinds = new Set(designs.map((d) => d.p.type));
    if (!keys.length) { $('nzStatus').textContent = 'Tick at least one coefficient to fit.'; return; }
    $('nzStatus').textContent = 'Simulating each design once…';
    NZ.running = true; $('nzFitRun').disabled = true; $('nzDemoRun').disabled = true;
    const t0 = now(), base = coefOf(A.getP()), m = designs.length;
    let di = 0, stage = 'sim', gen = null, j = -1, main = {}, cur = {}; const r0 = [], r1 = [];
    NZ.stop = slices(() => {
      if (stage === 'sim') { if (di < m) { nzSeries(designs[di++]); return true; } stage = 'fit'; gen = nzFitGen(designs, base, keys, 250, [base, shifted(base, keys, 0.7), shifted(base, keys, -0.7)], main); $('nzStatus').textContent = 'Fitting…'; return true; }
      if (stage === 'fit') { if (!gen.next().done) return true; stage = m >= 4 ? 'loo' : 'done'; return true; }
      if (stage === 'loo') {
        // leave one design out: fit on the others (started from the full fit), predict the one left out with the others' offset
        if (gen && j >= 0 && !gen.next().done) return true;
        if (j >= 0) {
          const d = designs[j], rest = designs.filter((_, i) => i !== j), mm = nzMeas(d).m;
          r0.push((nzErr(rest, base, null, keys).c + M.noiseEval(nzSeries(d), base).noise.peak - mm) ** 2);
          r1.push((nzErr(rest, cur.coef, null, keys).c + M.noiseEval(nzSeries(d), cur.coef).noise.peak - mm) ** 2);
        }
        j++;
        if (j >= m) { stage = 'done'; return true; }
        $('nzStatus').textContent = `Checking on designs left out of the fit: ${j + 1} of ${m}…`;
        cur = {}; gen = nzFitGen(designs.filter((_, i) => i !== j), base, keys, 150, [main.coef, base], cur);
        return true;
      }
      return false;
    }, () => {
      const fitted = main.coef, e0 = nzErr(designs, base, null, keys), e1 = nzErr(designs, fitted, null, keys);
      const loo = r0.length ? { def: Math.sqrt(r0.reduce((a, b) => a + b, 0) / r0.length), fit: Math.sqrt(r1.reduce((a, b) => a + b, 0) / r1.length) } : null;
      const rms = (E) => Math.sqrt(E.pr.reduce((sq, q, i) => sq + (q.P + E.c - nzMeas(designs[i]).m) ** 2, 0) / m);
      NZ.fit = { keys, base, fitted, designs, e0, e1, rms0: rms(e0), rms1: rms(e1), loo, mixed: kinds.size > 1, demo: NZ.mode === 'demo', ms: now() - t0, unit: [...units][0] };
      NZ.running = false; $('nzFitRun').disabled = false; $('nzDemoRun').disabled = false;
      $('nzStatus').textContent = `Fitted ${keys.length} coefficient${keys.length > 1 ? 's' : ''} to ${m} designs in ${(NZ.fit.ms / 1000).toFixed(1)} s${m >= 4 ? `, with ${m} leave-one-out fits` : '; the leave-one-out check needs four designs'}.`;
      nzRender();
    });
  }

  // ---- demo: synthetic recordings from a hidden reference ----
  function nzMakeDemo() {
    if (NZ.running) return;
    NZ.running = true; $('nzDemoRun').disabled = true; $('nzFitRun').disabled = true; NZ.fit = null;
    // the demo uses the siphonic preset with the current model coefficients: its gurgle separates the trap sources
    // from the splash sources, so the recordings carry information about all of them
    const cur = A.getP(), base = Object.assign(M.defaults('siphonic'), coefOf(cur)), n = +$('nzDemoN').value, r = rng(77), X = lhs(n, rng(78)), sr = 16000;
    const hid = Object.assign(coefOf(base), NZ_HIDDEN);
    NZ.demo = X.map((x) => ({ p: Object.assign({}, base, toDesign(x), { flushMode: 'full' }), air: '', recs: [] }));
    $('nzStatus').textContent = 'Simulating the designs…';
    let i = 0, rep = 0, Wref = null, gain = 1;
    NZ.stop = slices(() => {
      if (i >= NZ.demo.length) return false;
      const d = NZ.demo[i];
      nzSeries(d);
      const nz = M.noiseEval(d.ser, hid, { trace: true }), tr = nz.trace;
      if (Wref === null) { Wref = Math.pow(10, Math.max(...tr.L) / 10); gain = 0.18 / Math.sqrt(Wref); }
      // the 'video' sees the hidden reference's air core, with a little timing error
      if (rep === 0) d.air = nz.noise.airT == null ? 'none' : (nz.noise.airT + 0.08 * gauss(r)).toFixed(2);
      // one recording: random pre-roll, flush-to-flush scatter, splash as white noise, trap sources as a low-pitched
      // gurgle (300 Hz low-pass, so A-weighting takes about 7 dB off it, which the model does not know), a valve
      // click, fill valve noise after the valve closes and a noise floor
      const pre = 0.5 + r(), tEndS = tr.t[tr.t.length - 1], N = Math.round((pre + tEndS + 0.5) * sr), x = new Float32Array(N);
      const sc = Math.pow(10, gauss(r) * 0.5 / 20), aLP = Math.exp(-2 * Math.PI * 300 / sr), nLP = Math.sqrt((1 + aLP) / (1 - aLP));
      const tEmpty = d.tEmpty || 3;
      let lp = 0;
      for (let k = 0; k < N; k++) {
        const t = k / sr - pre, j = Math.min(tr.t.length - 1, Math.max(0, Math.floor(t / 0.02)));
        const Ws = t < 0 ? 0 : tr.pl[j] + tr.out[j], Wt = t < 0 ? 0 : tr.air[j] + tr.brk[j];
        const Wx = Wref * (1e-5 + (t >= 0 && t < 0.04 ? 0.1 : 0) + (t > tEmpty ? 1e-3 : 0));
        const u1 = (r() * 2 - 1) * 1.7320508, u2 = (r() * 2 - 1) * 1.7320508, u3 = (r() * 2 - 1) * 1.7320508;
        lp = aLP * lp + (1 - aLP) * u2;
        x[k] = gain * sc * (Math.sqrt(Ws) * u1 + Math.sqrt(Wt) * lp * nLP + Math.sqrt(Wx) * u3);
      }
      const an = analyzeSamples(x, sr);
      d.recs.push({ name: `synthetic recording ${rep + 1}`, peak: an.peak, unit: 'file', trace: { t: an.t, L: an.L } });
      $('nzStatus').textContent = `Making synthetic recordings: design ${i + 1} of ${NZ.demo.length}, recording ${rep + 1} of 3…`;
      rep++; if (rep === 3) { rep = 0; i++; }
      return true;
    }, () => {
      NZ.running = false; $('nzDemoRun').disabled = false; $('nzFitRun').disabled = false;
      $('nzv_rCore').checked = true;
      nzRender(); nzRunFit();
    }, 30);
  }

  // ---- adding real recordings ----
  function nzCurrentEntry() {
    const p = A.getP(); let d = NZ.real.find((x) => sameDesign(x.p, p));
    if (!d) { d = { p: JSON.parse(JSON.stringify(p)), air: '', recs: [] }; NZ.real.push(d); }
    return d;
  }
  $('nzFiles').addEventListener('change', async (ev) => {
    const files = [...ev.target.files]; if (!files.length) return;
    const d = nzCurrentEntry(); NZ.fit = null;
    for (const file of files) {
      $('nzStatus').textContent = `Analysing ${file.name}…`;
      try { const a = await decodeFile(file), an = analyzeSamples(a.x, a.sr); d.recs.push({ name: file.name, peak: an.peak, unit: 'file', trace: { t: an.t, L: an.L } }); }
      catch (e) { $('nzStatus').textContent = `${file.name} could not be read: ${e && e.message ? e.message : 'unknown format'}.`; }
    }
    ev.target.value = ''; nzSave(); nzRender();
    if (!/could not/.test($('nzStatus').textContent)) $('nzStatus').textContent = `Added ${files.length} recording${files.length > 1 ? 's' : ''} for this design. Audio is analysed in this browser and not kept; only the peak levels are remembered.`;
  });
  $('nzMeterAdd').addEventListener('click', () => {
    const v = parseFloat(String($('nzMeter').value).replace(',', '.'));
    if (!isFinite(v)) { $('nzStatus').textContent = 'Type the meter reading in dB(A) first.'; return; }
    const d = nzCurrentEntry(); d.recs.push({ name: 'meter reading', peak: v, unit: 'meter' }); NZ.fit = null;
    $('nzMeter').value = ''; nzSave(); nzRender();
  });
  $('nzClear').addEventListener('click', () => { NZ.real = []; NZ.fit = null; nzSave(); nzRender(); });
  const setMode = (m) => {
    NZ.mode = m; NZ.fit = null;
    $('nzModeDemo').setAttribute('aria-pressed', String(m === 'demo')); $('nzModeReal').setAttribute('aria-pressed', String(m === 'real'));
    $('nzDemoBox').hidden = m !== 'demo'; $('nzRealBox').hidden = m !== 'real';
    nzRender();
  };
  $('nzModeDemo').addEventListener('click', () => setMode('demo'));
  $('nzModeReal').addEventListener('click', () => setMode('real'));
  $('nzDemoRun').addEventListener('click', nzMakeDemo);
  $('nzFitRun').addEventListener('click', nzRunFit);
  $('nzFitVars').innerHTML = NZK.map((k) => `<label><input type="checkbox" id="nzv_${k}"${['nUe', 'cCore', 'wTrap'].includes(k) ? ' checked' : ''}> ${A.SPECK[k].l}</label>`).join('');
  $('nzTraceSel').addEventListener('change', (e) => { NZ.sel = +e.target.value; drawNz(); });

  // ---- output ----
  function nzRender() {
    const L = nzList(), F = NZ.fit, unit = F ? (F.unit === 'meter' ? 'dB(A)' : 'dB') : 'dB';
    const pred = F ? { d: new Map(F.designs.map((d, i) => [d, [F.e0.pr[i].P + F.e0.c, F.e1.pr[i].P + F.e1.c, F.e0.pr[i].airT, F.e1.pr[i].airT]])) } : null;
    const real = NZ.mode === 'real';
    $('nzTable').innerHTML = L.length ? `<thead><tr><th>Design</th><th>Recordings</th><th>Measured peak, ${unit}</th><th>Air core at, s</th><th>Model, current coefficients</th><th>Model, fitted</th>${real ? '<th></th>' : ''}</tr></thead><tbody>` +
      L.map((d, i) => {
        const m = nzMeas(d), q = pred && pred.d.get(d);
        const air = `<input type="text" data-nzair="${i}" value="${d.air == null ? '' : d.air}" aria-label="Air core time for design ${i + 1}"${real ? '' : ' readonly'}>`;
        const at = (v) => (v == null ? 'no air core' : `air core ${fmt(v, 2)} s`);
        return `<tr><td>${i + 1}. ${nzLabel(d.p)}</td><td class="num">${d.recs.length}</td><td class="num">${m ? `${fmt(m.m, 1)}${d.recs.length > 1 ? ` (${fmt(m.lo, 1)} to ${fmt(m.hi, 1)})` : ''}` : '–'}</td><td>${air}</td><td class="num">${q ? `${fmt(q[0], 1)}, ${at(q[2])}` : '–'}</td><td class="num">${q ? `${fmt(q[1], 1)}, ${at(q[3])}` : '–'}</td>${real ? `<td><button class="btn mini" type="button" data-nzdel="${i}">Remove</button></td>` : ''}</tr>`;
      }).join('') + '</tbody>' : `<tbody><tr><td>${real ? 'No recordings yet. Set a design up in the simulator and add its recordings above.' : 'Press "Make recordings and fit" to run the demo.'}</td></tr></tbody>`;
    $('nzTable').querySelectorAll('[data-nzair]').forEach((el) => el.addEventListener('change', () => { const d = L[+el.dataset.nzair]; d.air = el.value; NZ.fit = null; nzSave(); if (nzAirObs(d)) $('nzv_rCore').checked = true; nzRender(); }));
    $('nzTable').querySelectorAll('[data-nzdel]').forEach((el) => el.addEventListener('click', () => { NZ.real.splice(+el.dataset.nzdel, 1); NZ.fit = null; nzSave(); nzRender(); }));
    const sel = $('nzTraceSel'); sel.innerHTML = L.map((d, i) => `<option value="${i}"${i === NZ.sel ? ' selected' : ''}>Design ${i + 1}</option>`).join('');
    if (NZ.sel >= L.length) NZ.sel = 0;
    if (!F) { $('nzSum').innerHTML = ''; $('nzCoefTable').innerHTML = ''; drawNz(); return; }
    const better = F.loo ? F.loo.fit < F.loo.def - 0.1 : F.rms1 < F.rms0 - 0.1;
    $('nzSum').innerHTML = `<p>How well the model matches the measured differences between designs, root mean square in dB: current coefficients <b>${fmt(F.rms0, 2)}</b>, fitted <b>${fmt(F.rms1, 2)}</b>${F.loo ? `. On designs left out of the fit one at a time: current <b>${fmt(F.loo.def, 2)}</b>, fitted <b>${fmt(F.loo.fit, 2)}</b>` : ''}.</p>` +
      `<p>${better ? 'The fit improves the prediction for designs it did not see, so the fitted coefficients carry over.' : 'The fit does not clearly improve the prediction for designs it did not see. Add more designs, or fit fewer coefficients, before using the result.'}${F.mixed ? ' The designs mix both trap types; differences across trap types are not robust.' : ''}</p>` +
      `<p class="muted">Recordings can only show what differs between the designs. A coefficient that changes all designs alike, or none of them, cannot be fitted from them and stays close to its current value.${F.demo ? ' The hidden reference adds a valve click, fill valve noise and a low-pitched gurgle the model does not know about, so the fitted values need not equal the hidden ones; what counts is the error on designs left out. The gurgle, for example, is low-pitched, so A-weighting takes about 7 dB off it, and the fit lowers the trap weight to match: that is what a calibration against real recordings should do too.' : ''}</p>` +
      `<p><button class="btn primary mini" type="button" id="nzApply">Use fitted coefficients in the simulator</button></p>`;
    $('nzApply').addEventListener('click', () => { const v = {}; F.keys.forEach((k) => { const s = A.SPECK[k]; v[k] = +(Math.round(F.fitted[k] / s.st) * s.st).toFixed(4); }); A.apply(v); $('nzStatus').textContent = 'The fitted values are now set in the noise model sliders. Undo brings the previous ones back.'; });
    $('nzCoefTable').innerHTML = `<thead><tr><th>Coefficient</th><th>Current</th><th>Fitted</th>${F.demo ? '<th>Hidden reference</th>' : ''}</tr></thead><tbody>` +
      NZK.map((k) => { const s = A.SPECK[k], dp = s.d === 0 ? 0 : Math.max(2, s.d); return `<tr><td>${s.l}${s.u ? ', ' + s.u : ''}</td><td class="num">${fmt(F.base[k], dp)}</td><td class="num">${F.keys.includes(k) ? fmt(F.fitted[k], dp) : 'not fitted'}</td>${F.demo ? `<td class="num">${fmt(NZ_HIDDEN[k], dp)}</td>` : ''}</tr>`; }).join('') + '</tbody>';
    drawNz();
  }
  // best time shift of a measured level trace against a model trace (maximum correlation)
  function nzAlign(meas, mod) {
    const dtm = meas.t[1] - meas.t[0] || 0.01, top = Math.max(...mod.L), use = [];
    mod.t.forEach((t, i) => { if (mod.L[i] > top - 40) use.push(i); });
    let best = { s: 0, r: -Infinity };
    for (let s = 0; s <= meas.t[meas.t.length - 1] - 0.5; s += 0.02) {
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
      for (const i of use) { const k = Math.round((mod.t[i] + s) / dtm); if (k < 0 || k >= meas.L.length) continue; const x = mod.L[i], y = meas.L[k]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++; }
      if (n < 20) continue;
      const r = (n * sxy - sx * sy) / Math.sqrt(Math.max(1e-12, (n * sxx - sx * sx) * (n * syy - sy * sy)));
      if (r > best.r) best = { s, r };
    }
    return best.s;
  }
  function drawNz() {
    if ($('aiNoise').hidden) return;
    const F = NZ.fit, L = nzList();
    { // measured against model, relative to the mean of the measured peaks
      const cv = $('cvNzPar');
      let pts = [];
      if (F) { const mm = F.designs.reduce((s, d) => s + nzMeas(d).m, 0) / F.designs.length; pts = F.designs.map((d, i) => { const m = nzMeas(d); return { x: m.m - mm, lo: m.lo - mm, hi: m.hi - mm, y0: F.e0.pr[i].P + F.e0.c - mm, y1: F.e1.pr[i].P + F.e1.c - mm }; }); }
      const ext = Math.max(3, ...pts.flatMap((q) => [Math.abs(q.lo), Math.abs(q.hi), Math.abs(q.y0), Math.abs(q.y1)])), lim = Math.ceil(ext + 0.5);
      const f = frame(cv, { x: [-lim, lim], y: [-lim, lim], xt: [-lim, 0, lim], yt: [-lim, 0, lim], xl: 'Measured peak, dB against the mean', yl: 'Model peak, dB against the mean' });
      const { ctx, X, Y, C, d } = f;
      ctx.strokeStyle = A.rgba(C.muted, 0.7); ctx.setLineDash([4 * d, 4 * d]); ctx.beginPath(); ctx.moveTo(X(-lim), Y(-lim)); ctx.lineTo(X(lim), Y(lim)); ctx.stroke(); ctx.setLineDash([]);
      pts.forEach((q) => { ctx.strokeStyle = A.rgba(C.muted, 0.8); ctx.lineWidth = 1 * d; ctx.beginPath(); ctx.moveTo(X(q.lo), Y(q.y1)); ctx.lineTo(X(q.hi), Y(q.y1)); ctx.stroke(); });
      [['y0', C.lineStrong], ['y1', C.accent]].forEach(([k, col]) => { ctx.fillStyle = A.rgba(col, 0.9); pts.forEach((q) => { ctx.beginPath(); ctx.arc(X(q.x), Y(q[k]), 3.5 * d, 0, TAU2); ctx.fill(); }); });
      legend(f, [['current coefficients', C.lineStrong, true], ['fitted', C.accent, true]]);
      if (!F) { ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Fit the coefficients to compare', X(0), Y(0)); }
    }
    { // level over time for one design
      const cv = $('cvNzTrace'), dsg = L[NZ.sel];
      const rec = dsg && dsg.recs.find((r) => r.trace);
      let curves = [], tMax = 10, yTop = 0, yBot = -40;
      if (dsg && (rec || F)) {
        const coefNow = coefOf(A.getP());
        const tr0 = M.noiseEval(nzSeries(dsg), F ? F.base : coefNow, { trace: true }).trace;
        const tr1 = F ? M.noiseEval(nzSeries(dsg), F.fitted, { trace: true }).trace : null;
        const off0 = F ? F.e0.c : 0, off1 = F ? F.e1.c : 0;
        tMax = Math.min(14, tr0.t[tr0.t.length - 1]);
        if (rec) { const s = nzAlign(rec.trace, { t: tr1 ? tr1.t : tr0.t, L: (tr1 ? tr1.L : tr0.L).map((v) => v + (tr1 ? off1 : off0)) }); curves.push(['measured (' + rec.name + ')', A.readColors().ink, rec.trace.t.map((t) => t - s), rec.trace.L]); }
        if (F) { curves.push(['model, current coefficients', A.readColors().lineStrong, tr0.t, tr0.L.map((v) => v + off0)]); curves.push(['model, fitted', A.readColors().accent, tr1.t, tr1.L.map((v) => v + off1)]); }
        const all = curves.flatMap((c) => c[3].filter((_, i) => c[2][i] >= 0 && c[2][i] <= tMax));
        if (all.length) { yTop = Math.ceil((Math.max(...all) + 3) / 5) * 5; yBot = yTop - 45; }
      }
      const f = frame(cv, { x: [0, tMax], y: [yBot, yTop], xt: [0, tMax / 2, tMax].map((v) => +v.toFixed(1)), yt: [yBot, (yBot + yTop) / 2, yTop], xl: 'Time after the flush starts, s', yl: `Level, ${F && F.unit === 'meter' ? 'dB(A)' : 'dB'}` });
      const { ctx, X, Y, C, d, pad, w, h } = f;
      ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w, h); ctx.clip();
      curves.forEach(([, col, ts, Ls]) => { ctx.strokeStyle = A.rgba(col, 0.9); ctx.lineWidth = 1.6 * d; ctx.beginPath(); let on = false; ts.forEach((t, i) => { if (t < 0 || t > tMax) return; const x = X(t), y = Y(Math.max(yBot, Ls[i])); if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; } }); ctx.stroke(); });
      ctx.restore();
      legend(f, curves.map(([l, col]) => [l, col]));
      if (!curves.length) { ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dsg ? 'Meter readings have no level over time' : 'No recordings yet', pad.l + w / 2, pad.t + h / 2); }
    }
  }

  /* ---------------- redraw on resize, theme and design changes ---------------- */
  function redraw() { drawOpt(); drawSurLoss(); drawSurParity(); drawHyb(); drawNz(); }
  const ro = new ResizeObserver(() => requestAnimationFrame(redraw));
  ['cvOpt', 'cvSurLoss', 'cvSurPar', 'cvHybBars', 'cvHybPar', 'cvNzPar', 'cvNzTrace'].forEach((id) => ro.observe($(id)));
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  A.onChange(() => requestAnimationFrame(() => {
    const p = A.getP();
    optStaleCheck();
    if (S.fp && S.metrics) { staleNote('surStale', fingerprint(p, DV.map((d) => d.k).concat(FULL_ONLY)) !== S.fp, 'training'); surCurrent(); }
    if (H.fp && H.res) staleNote('hybStale', fingerprint(p, DV.map((d) => d.k).concat(CAL.map((c) => c.k), FULL_ONLY)) !== H.fp, 'calibration');
  }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  nzRender(); redraw();
  function optStaleCheck() { if (O.fp && O.all.length && !O.running) staleNote('optStale', fingerprint(A.getP(), O.vars.map((d) => d.k).concat(['flushMode'])) !== O.fp || (O.robust && window.FlushTol && window.FlushTol.signature() !== O.tolSig), 'search'); }
  document.addEventListener('flushtolchange', () => optStaleCheck());
  window.FlushAI = {
    busy: () => O.running || !!O.checking,
    // start a fresh search (cancelling any other) and resolve when it and its check are finished
    run: () => new Promise((resolve) => {
      const sid = runOpt(true); if (sid == null) { resolve({ ok: false, sid: null }); return; }
      const t0 = now();
      (function poll() { if (O.searchId !== sid || O.cancelled === sid) { resolve({ ok: false, sid }); return; } if (!O.running && !O.checking) { resolve({ ok: true, sid }); return; } if (now() - t0 > 1800000) { resolve({ ok: false, sid }); return; } setTimeout(poll, 200); })();
    }),
    // load the published recommendation of search sid; returns 'best', 'closest' or null
    loadResult: (sid) => {
      if (sid == null || O.searchId !== sid || !O.final || O.checking) return null;
      const e = O.best || closest(); if (!e) return null;
      return loadOpt(e) ? (O.best ? 'best' : 'closest') : null;
    },
    progress: () => Object.assign({}, PG),
    _test: { opt: () => O, noise: () => NZ, analyzeSamples }
  };
})();
