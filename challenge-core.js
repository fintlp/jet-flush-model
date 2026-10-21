/* Engineering challenge, the computing part (no page code, so the checks can run it in Node).
   A hidden reference model stands in for high-fidelity runs (CFD), each costing a virtual 8 hours. Three routes
   start from the same design and must reach the same targets; the count of reference runs each needs is the result.
     classic: one change at a time, as in a test series. The volume is set to the water target first, then each
       setting in turn (jet position first, see classicOrder) is moved by a step; a step that brings the design closer to the targets is kept and repeated, one
       that does not is undone and the other direction tried; after a full round without progress all steps halve.
     fast:    the fast flush model alone. It screens a few hundred designs, refines around its best ones, and the
       reference runs its best designs in turn. It never learns from the reference runs.
     ai:      the fast model plus a learned correction. After every reference run, a Gaussian process learns the
       difference between reference and fast model for cleaning, solids and paper. The next run goes to the design
       most likely to meet all targets under the corrected model, uncertainty included, chosen among the screened
       designs and fresh ones around the best of them. While no design is likely to, this favours designs whose
       correction is still uncertain, so the route explores instead of circling one spot.
   All three use the full water budget: after the start design, the volume is set to the water target and kept there,
   so the search is over the five other settings. All three are deterministic: the same inputs give the same runs.
   The reference is synthetic: the flush model with different coefficients plus two effects the fast model does not
   have (cleaning lost at high jet speed, from splash and jet break-up, and away from a best nozzle size), and a
   loss of solids removal for small nozzles at low volume. It is labelled synthetic on the page. */
(function (root) {
  function make(M, opts) {
    opts = opts || {};
    const DV = [
      { k: 'Anoz', min: 1.5, max: 8, st: 0.1 }, { k: 'alpha', min: 0, max: 35, st: 1 }, { k: 'jetPhase', min: 0, max: 180, st: 5 },
      { k: 'hNoz', min: 6, max: 20, st: 1 }, { k: 'Hcr', min: 50, max: 600, st: 10 }, { k: 'Vfull', min: 3, max: 7, st: 0.1 }
    ];
    const IV = 5;   // index of the flush volume
    const T = { clean: 87, solids: 95, paper: 80, water: 4.0 };
    const RUN_HOURS = 8, MAXR = opts.maxRuns || 60, NPOOL = opts.pool || 300, NLOC = opts.local || 10, NTOP = 4, SEED = opts.seed || 0;
    // the start: the EU washdown preset made oval (1.35) with the jets at the ends of the long axis, as in Demo me
    const base = Object.assign(M.defaults('washdown'), { ovality: 1.35, jetPhase: 0, flushMode: 'full' });
    // hidden reference: other coefficients, and effects the fast model does not have
    const HID = { cf: 0.010, tauC: 3.3, Jcrit: 1.6, ucS: 0.38, cmax: 0.11 };
    const SIM = { light: true, Tend: 12 };
    const xMaxV = (T.water - DV[IV].min) / (DV[IV].max - DV[IV].min);
    // the classic engineer's order of settings after the volume: on an oval bowl the jet position first (the lesson of
    // Demo me), then valve height, nozzle area, jet angle and nozzle height; repeats with seed > 0 use a random order
    const classicOrder = opts.classicOrder || (() => {
      const o = [2, 4, 0, 1, 3]; if (SEED > 0) { const r = rng(500 + SEED); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } }
      return o;
    })();

    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const snapX = (x) => x.map((v, i) => { const d = DV[i], val = Math.round((d.min + clamp01(v) * (d.max - d.min)) / d.st) * d.st; return (Math.min(d.max, Math.max(d.min, val)) - d.min) / (d.max - d.min); });
    const toDesign = (x) => { const o = {}; DV.forEach((d, i) => { o[d.k] = +(d.min + x[i] * (d.max - d.min)).toFixed(4); }); return o; };
    const toX = (o) => DV.map((d) => (o[d.k] - d.min) / (d.max - d.min));
    const key = (x) => x.map((v) => v.toFixed(4)).join(',');
    const count = { fast: 0, ref: 0 };
    const sim = (x, coef) => {
      const r = M.simulate(Object.assign({}, base, toDesign(x), coef || {}), SIM);
      return { clean: r.cleanPct, solids: r.solidsPct, paper: r.paperPct, water: r.water, ok: !!(r.sealOK && r.valid) };
    };
    const fc = new Map(), rc = new Map();
    function fast(x) { const k = key(x); let e = fc.get(k); if (!e) { e = sim(x); fc.set(k, e); count.fast++; } return e; }
    function ref(x) {
      const k = key(x); let e = rc.get(k);
      if (!e) {
        e = sim(x, HID);
        e.clean = Math.max(0, Math.min(100, e.clean - 12 * (x[0] - 0.35) ** 2 - 8 * Math.max(0, x[1] - 0.45) ** 2 - 60 * Math.max(0, x[4] - 0.45) ** 2));
        e.solids = Math.max(0, Math.min(100, e.solids - 3 * (1 - x[IV]) * (1 - x[0])));
        rc.set(k, e); count.ref++;
      }
      return e;
    }
    // distance to the targets, in points (water counts 10 points per litre over; a seal not restored 20 points)
    const gapOf = (e) => Math.max(0, T.clean - e.clean) + Math.max(0, T.solids - e.solids) + Math.max(0, T.paper - e.paper) + 10 * Math.max(0, e.water - T.water - 1e-9) + (e.ok ? 0 : 20);
    const meets = (e) => gapOf(e) === 0;
    const start = snapX(toX(base));

    // ---- screening pool of the fast model, shared by the two model-based routes ----
    let POOL = null;
    function* screen() {
      if (POOL) return POOL;
      const r = rng(31 + 17 * SEED), P = [];
      for (let i = 0; i < NPOOL; i++) { const x = DV.map(() => r()); x[IV] = xMaxV; const xs = snapX(x); fast(xs); P.push(xs); yield { kind: 'fast' }; }
      POOL = P; return P;
    }
    const around = (x, r, sd) => snapX(x.map((v, i) => (i === IV ? xMaxV : v + gauss(r) * sd)));

    // ---- Gaussian process on the reference minus fast model difference ----
    function gpFit(X, y, ell, sf2, noise) {
      const n = X.length, mean = y.reduce((a, b) => a + b, 0) / n, yc = y.map((v) => v - mean);
      const k = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return sf2 * Math.exp(-0.5 * s / (ell * ell)); };
      const L = [];
      for (let i = 0; i < n; i++) { L.push(new Array(n).fill(0)); for (let j = 0; j <= i; j++) { let s = k(X[i], X[j]) + (i === j ? noise * noise : 0); for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q]; L[i][j] = i === j ? Math.sqrt(Math.max(1e-9, s)) : s / L[j][j]; } }
      const solve = (b) => { const z = new Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let q = 0; q < i; q++) s -= L[i][q] * z[q]; z[i] = s / L[i][i]; } const xx = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let q = i + 1; q < n; q++) s -= L[q][i] * xx[q]; xx[i] = s / L[i][i]; } return xx; };
      const al = solve(yc);
      return (x) => { const ks = X.map((a) => k(a, x)); let m = mean; ks.forEach((v, i) => { m += v * al[i]; }); const v = solve(ks); let vr = sf2; ks.forEach((kv, i) => { vr -= kv * v[i]; }); return { m, s: Math.sqrt(Math.max(1e-6, vr)) }; };
    }
    // length scale by leave-one-out error once there are five runs; signal variance at least (2 points)^2; noise 1 point,
    // about the fast model's own numerical scatter in cleaning, which the difference of two runs contains
    const GPN = 1.0;
    // linear trend by ridge regression (penalty LAM on the slopes, in points per full slider range), then the GP on what is left
    const LAM = +(opts.lam == null ? 1 : opts.lam);
    function ridge(X, y) {
      const n = X.length, d = X[0].length, k = d + 1, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
      X.forEach((x, i) => { const z = [1].concat(x); for (let p = 0; p < k; p++) { b[p] += z[p] * y[i]; for (let q = 0; q < k; q++) A[p][q] += z[p] * z[q]; } });
      for (let p = 1; p < k; p++) A[p][p] += LAM;
      A[0][0] += 1e-6;
      for (let c = 0; c < k; c++) { let pv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r; [A[c], A[pv]] = [A[pv], A[c]]; [b[c], b[pv]] = [b[pv], b[c]]; for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q < k; q++) A[r][q] -= f * A[c][q]; b[r] -= f * b[c]; } }
      const beta = b.map((v, i) => v / A[i][i]);
      return (x) => beta[0] + x.reduce((s, v, i) => s + beta[i + 1] * v, 0);
    }
    function fitOut(X, y) {
      if (LAM > 0 && X.length >= 2) { const tr = ridge(X, y), g = fitGP(X, y.map((v, i) => v - tr(X[i]))); return (x) => { const o = g(x); o.m += tr(x); return o; }; }
      return fitGP(X, y);
    }
    function fitGP(X, y) {
      const n = X.length, mean = y.reduce((a, b) => a + b, 0) / n, sf2 = Math.max(4, y.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
      let ell = 0.5;
      if (n >= 5) {
        let best = Infinity;
        for (const l of [0.25, 0.4, 0.6, 0.9]) { let e = 0; for (let i = 0; i < n; i++) { const g = gpFit(X.filter((_, j) => j !== i), y.filter((_, j) => j !== i), l, sf2, GPN); e += (g(X[i]).m - y[i]) ** 2; } if (e < best) { best = e; ell = l; } }
      }
      return gpFit(X, y, ell, sf2, GPN);
    }
    function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
    const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2)), phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    // log of the probability that a normal value with mean m and spread s exceeds thr, accurate far into the tail
    const logPgt = (thr, m, s) => { const z = (thr - m) / s; if (z < 5) return Math.log(Math.max(1e-300, 1 - Phi(z))); return -0.5 * z * z - Math.log(z * Math.sqrt(2 * Math.PI)) + Math.log(1 - 1 / (z * z)); };

    // ---- the routes, as generators: they yield after every simulation, so the page can run them in time slices ----
    function rec(route, runs, x, extra) {
      const e = ref(x), f = fast(x), g = gapOf(e);
      const r = Object.assign({ n: runs.length + 1, x, des: toDesign(x), e, f, g, ok: g === 0, hours: (runs.length + 1) * RUN_HOURS }, extra || {});
      runs.push(r); return r;
    }
    const result = (route, runs) => { const hit = runs.find((r) => r.ok); return { route, runs, toTarget: hit ? hit.n : null }; };

    function* classic(x0) {
      const runs = []; let x = x0.slice(), cur = rec('classic', runs, x, { why: 'start design' }); yield { kind: 'run', r: cur };
      if (cur.ok) return result('classic', runs);
      const step = [0.25, 0.25, 0.25, 0.25, 0.25, 0.1], dir = [1, 1, 1, 1, 1, -1], order = classicOrder;
      if (Math.abs(x[IV] - xMaxV) > 1e-6) {   // the water budget first
        const xv = x.slice(); xv[IV] = xMaxV; const r = rec('classic', runs, snapX(xv), { why: `flush volume to ${T.water.toFixed(1)} L` }); yield { kind: 'run', r };
        x = r.x; cur = r; if (r.ok) return result('classic', runs);
      }
      while (runs.length < MAXR) {
        let progress = false;
        for (const i of order) {
          let moved = false;
          for (const sgn of [dir[i], -dir[i]]) {
            while (runs.length < MAXR) {
              const xn = x.slice(); xn[i] = x[i] + sgn * step[i]; if (i === IV) xn[i] = Math.min(xn[i], xMaxV);
              const xs = snapX(xn); if (key(xs) === key(x)) break;
              const d = DV[i], dv = (xs[i] - x[i]) * (d.max - d.min);
              const r = rec('classic', runs, xs, { why: `${d.k} ${dv > 0 ? '+' : '−'}${Math.abs(dv).toFixed(d.st < 1 ? 1 : 0)}`, kVar: d.k });
              yield { kind: 'run', r };
              if (r.g < cur.g - 1e-9) { r.kept = true; x = xs; cur = r; dir[i] = sgn; moved = progress = true; if (r.ok) return result('classic', runs); }
              else { r.kept = false; break; }
            }
            if (moved || runs.length >= MAXR) break;
          }
          if (runs.length >= MAXR) break;
        }
        if (!progress) { for (let i = 0; i < step.length; i++) step[i] /= 2; if (step[0] < 0.01) break; }
      }
      return result('classic', runs);
    }

    function* fastOnly(x0) {
      const runs = []; let r = rec('fast', runs, x0, { why: 'start design' }); yield { kind: 'run', r };
      if (r.ok) return result('fast', runs);
      const P = yield* screen(), rr = rng(7 + SEED);
      const fg = (x) => { const f = fast(x); return f.ok ? gapOf(f) : 1e9; };
      let sc = P.map((x) => ({ x, g: fg(x), c: fast(x).clean })), seen = new Set(P.map(key));
      const order = () => sc.sort((a, b) => a.g - b.g || b.c - a.c);
      order();
      for (let it = 0; it < 3; it++) {   // refine around the model's best designs, as an engineer with the simulator would
        const loc = [];
        sc.slice(0, NTOP).forEach((o) => { for (let k = 0; k < NLOC; k++) { const xn = around(o.x, rr, 0.05); if (!seen.has(key(xn))) { seen.add(key(xn)); loc.push(xn); } } });
        for (const xn of loc) { sc.push({ x: xn, g: fg(xn), c: fast(xn).clean }); yield { kind: 'fast' }; }
        order();
      }
      const done = new Set([key(x0)]);
      for (const o of sc) {
        if (runs.length >= MAXR) break;
        if (done.has(key(o.x))) continue; done.add(key(o.x));
        r = rec('fast', runs, o.x, { why: `fast model's next best: ${fast(o.x).clean.toFixed(1)} % predicted`, pred: { m: fast(o.x).clean, s: 0 } });
        yield { kind: 'run', r };
        if (r.ok) break;
      }
      return result('fast', runs);
    }

    function* ai(x0) {
      const runs = []; let r = rec('ai', runs, x0, { why: 'start design' }); yield { kind: 'run', r };
      if (r.ok) return result('ai', runs);
      const P = yield* screen(), rr = rng(7 + SEED); let cand = P.slice(); const seen = new Set(P.map(key));
      while (runs.length < MAXR) {
        const X = runs.map((q) => q.x), gps = ['clean', 'solids', 'paper'].map((k) => fitOut(X, runs.map((q) => q.e[k] - q.f[k])));
        const done = new Set(X.map(key));
        const score = (x) => {
          const f = fast(x); if (!f.ok || f.water > T.water + 1e-9) return { lp: -Infinity, p: 0 };
          const a = gps[0](x), b = gps[1](x), c = gps[2](x), mc = f.clean + a.m, ms = f.solids + b.m, mp = f.paper + c.m;
          const lp = logPgt(T.clean, mc, a.s) + logPgt(T.solids, ms, b.s) + logPgt(T.paper, mp, c.s);
          return { lp, p: Math.exp(lp), m: mc, s: a.s };
        };
        let sc = cand.filter((x) => !done.has(key(x))).map((x) => Object.assign({ x }, score(x)));
        const cmp = (a, b) => b.lp - a.lp;
        sc.sort(cmp);
        const loc = [];
        sc.slice(0, NTOP).forEach((o) => { for (let k = 0; k < NLOC; k++) { const xn = around(o.x, rr, 0.05); if (!seen.has(key(xn))) { seen.add(key(xn)); loc.push(xn); } } });
        for (const xn of loc) { fast(xn); yield { kind: 'fast' }; }
        cand = cand.concat(loc);
        sc = sc.concat(loc.filter((x) => !done.has(key(x))).map((x) => Object.assign({ x }, score(x)))).sort(cmp);
        const b = sc[0];
        r = rec('ai', runs, b.x, { why: `most likely to meet all targets (${b.p >= 0.01 ? Math.round(100 * b.p) + ' %' : 'below 1 %'})`, pred: { m: b.m, s: b.s, p: b.p } });
        yield { kind: 'run', r };
        if (r.ok) break;
      }
      return result('ai', runs);
    }

    // other start designs for the repeat: random jets and valve height, the start's volume
    function starts(n) { const r = rng(99), S = []; for (let i = 0; i < n; i++) { const x = DV.map(() => r()); x[IV] = start[IV]; S.push(snapX(x)); } return S; }

    // Repeated with seeds 0 to 7 (screening and refinement) and start designs: the start above for seed 0, starts(7) for 1 to 7.
    // Runs to target, minimum, median and maximum; the fast model alone missed within MAXR runs this many times.
    // checks/challenge.js recomputes these and fails if they differ.
    const REPEAT = {
      n: 8, ai: [2, 4.5, 13], classic: [2, 12, 27], fastMiss: 3,
      rows: { classic: [11, 11, 27, 9, 2, 13, 14, 24], fast: [3, 2, null, null, 10, null, 2, 2], ai: [5, 3, 5, 9, 2, 13, 4, 2] }
    };
    return {
      REPEAT, DV, IV, T, base, start, RUN_HOURS, MAXR, HID, count, toDesign, toX, snapX, fast, ref, gapOf, meets, screen, starts,
      routes: { classic, fast: fastOnly, ai }, pool: () => POOL
    };
  }
  // run a generator to its end (for the checks)
  function runAll(gen) { let s = gen.next(); while (!s.done) s = gen.next(); return s.value; }
  root.FlushChallenge = { make, runAll };
})(typeof window !== 'undefined' ? window : globalThis);
