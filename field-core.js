/* Field surrogate for the cleaning map: predicts the whole wall map (90 x 40 cells) from the six design settings of
   the engineering challenge, trained on runs of the synthetic reference ("expensive runs"). No page code here, so the
   checks can run it in Node.
   Two kinds are compared with the fast flush model alone:
     data:       proper orthogonal decomposition (POD) of the training maps, and a Gaussian process per POD coefficient;
                 the idea behind field surrogates such as SimAI or Simcenter PhysicsAI, which learn from CFD runs alone.
     corrected:  the fast model's map plus a learned correction: POD and Gaussian processes on the difference
                 between reference and fast model maps.
   The field is the shear dose over the cleaning threshold, J / Jcrit, capped at 3; a cell counts as cleaned at 1.
   Scores on unseen designs, area-weighted: the overlap of the cleaned areas (intersection over union) and the error
   of the cleaned share. */
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function lhs(n, d, r) { const cols = Array.from({ length: d }, () => { const p = Array.from({ length: n }, (_, i) => (i + r()) / n); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; }); return Array.from({ length: n }, (_, i) => cols.map((c) => c[i])); }
  function chol(K) { const n = K.length, L = K.map(() => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = K[i][j]; for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q]; L[i][j] = i === j ? Math.sqrt(Math.max(1e-12, s)) : s / L[j][j]; } return L; }
  function cs(L, b) { const n = L.length, z = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let q = 0; q < i; q++) s -= L[i][q] * z[q]; z[i] = s / L[i][i]; } const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let q = i + 1; q < n; q++) s -= L[q][i] * x[q]; x[i] = s / L[i][i]; } return x; }
  // symmetric eigenproblem by cyclic Jacobi rotations; eigenvalues sorted largest first
  function jacobi(A0) {
    const N = A0.length, A = A0.map((r) => Float64Array.from(r)), V = A0.map((_, i) => Float64Array.from(A0, (__, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = 0; for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) off += A[p][q] * A[p][q]; if (off < 1e-14) break;
      for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < N; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
        for (let k = 0; k < N; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
        for (let k = 0; k < N; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
      }
    }
    const ev = A.map((r, i) => r[i]), idx = ev.map((_, i) => i).sort((a, b) => ev[b] - ev[a]);
    return { val: idx.map((i) => ev[i]), vec: idx.map((i) => V.map((r) => r[i])) };
  }
  // Gaussian process with a squared-exponential kernel; length scale by leave-one-out error
  function gp(X, y) {
    const n = X.length, mu = y.reduce((a, b) => a + b, 0) / n, yc = y.map((v) => v - mu), sf2 = Math.max(1e-9, yc.reduce((a, b) => a + b * b, 0) / n);
    const d2 = X.map((a) => X.map((b) => a.reduce((s, v, q) => s + (v - b[q]) ** 2, 0)));
    let best = null;
    for (const ell of [0.25, 0.4, 0.6, 0.9, 1.4]) {
      const K = d2.map((r, i) => r.map((v, j) => sf2 * Math.exp(-0.5 * v / (ell * ell)) + (i === j ? sf2 * 1e-3 : 0))), L = chol(K), al = cs(L, yc);
      let loo = 0; for (let i = 0; i < n; i++) { const e = new Float64Array(n); e[i] = 1; const ki = cs(L, e)[i]; loo += (al[i] / ki) ** 2; }
      if (!best || loo < best.loo) best = { loo, ell, al };
    }
    return (x) => { let m = mu; for (let i = 0; i < n; i++) { const a = X[i]; let s = 0; for (let q = 0; q < a.length; q++) s += (a[q] - x[q]) ** 2; m += best.al[i] * sf2 * Math.exp(-0.5 * s / (best.ell * best.ell)); } return m; };
  }

  function make(M, C, o) {
    o = Object.assign({ nTrain: 80, nTest: 20, modes: 10, seed: 5 }, o || {});
    const NTH = M.NTH, NS = M.NS, n = NTH * NS, CAP = 3;
    const g = M.buildGeom(C.base), rowA = [];
    for (let k = 0; k < NS; k++) { const f = (k + 0.5) / NS * (g.ur.length - 1), i = Math.floor(f), w = f - i, rr = g.ur[i] * (1 - w) + g.ur[Math.min(g.ur.length - 1, i + 1)] * w; rowA.push(2 * Math.PI * rr * (g.S / NS) / NTH); }
    const cellA = Float64Array.from({ length: n }, (_, j) => rowA[Math.floor(j / NTH)]), Atot = cellA.reduce((a, b) => a + b, 0);
    const field = (x, coef) => { const r = M.simulate(Object.assign({}, C.base, C.toDesign(x), coef || {}), { Tend: 12 }); return Float64Array.from(r.J, (v) => Math.min(v / C.base.Jcrit, CAP)); };
    const share = (f) => { let a = 0; for (let j = 0; j < n; j++) if (f[j] >= 1) a += cellA[j]; return 100 * a / Atot; };
    const overlap = (a, b) => { let I = 0, U = 0; for (let j = 0; j < n; j++) { const p = a[j] >= 1, q = b[j] >= 1; if (p && q) I += cellA[j]; if (p || q) U += cellA[j]; } return U ? I / U : 1; };
    const D = { Xtr: lhs(o.nTrain, 6, rng(o.seed)).map(C.snapX), Xte: lhs(o.nTest, 6, rng(o.seed + 1)).map(C.snapX), Rtr: [], Ftr: [], Rte: [], Fte: [] };
    // the runs: reference ("expensive") and fast model for the training and the test designs
    function* generate() {
      for (const x of D.Xtr) { D.Rtr.push(field(x, C.HID)); D.Ftr.push(field(x)); yield { done: D.Rtr.length + D.Rte.length, total: o.nTrain + o.nTest }; }
      for (const x of D.Xte) { D.Rte.push(field(x, C.HID)); D.Fte.push(field(x)); yield { done: D.Rtr.length + D.Rte.length, total: o.nTrain + o.nTest }; }
    }
    // POD of the target fields of the first N training runs, a GP per coefficient
    function fit(N, corrected) {
      const X = D.Xtr.slice(0, N), T = D.Rtr.slice(0, N).map((r, j) => (corrected ? r.map((v, i) => v - D.Ftr[j][i]) : r));
      const mean = new Float64Array(n); T.forEach((f) => { for (let i = 0; i < n; i++) mean[i] += f[i] / N; });
      const Yc = T.map((f) => Float64Array.from(f, (v, i) => v - mean[i]));
      const G = Yc.map((a) => Yc.map((b) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }));
      const E = jacobi(G), R = Math.min(o.modes, N - 1), modes = [];
      const tot = E.val.reduce((a, b) => a + Math.max(0, b), 0);
      for (let k = 0; k < R; k++) { const m = new Float64Array(n); Yc.forEach((y, j) => { const w = E.vec[k][j]; for (let i = 0; i < n; i++) m[i] += w * y[i]; }); const nr = Math.sqrt(m.reduce((a, b) => a + b * b, 0)) || 1; for (let i = 0; i < n; i++) m[i] /= nr; modes.push(m); }
      const coef = (f) => modes.map((m) => { let s = 0; for (let i = 0; i < n; i++) s += m[i] * (f[i] - mean[i]); return s; });
      const A = Yc.map((y) => coef(Float64Array.from(y, (v, i) => v + mean[i])));
      const gps = modes.map((_, k) => gp(X, A.map((a) => a[k])));
      const energy = E.val.slice(0, R).reduce((a, b) => a + Math.max(0, b), 0) / (tot || 1);
      const predict = (x, fast) => { const c = gps.map((h) => h(x)), f = Float64Array.from(mean); c.forEach((a, k) => { const m = modes[k]; for (let i = 0; i < n; i++) f[i] += a * m[i]; }); if (corrected) for (let i = 0; i < n; i++) f[i] += fast[i]; return f; };
      return { predict, modes, mean, energy, R, N };
    }
    function score(model) {
      let ov = 0, er = 0;
      D.Xte.forEach((x, j) => { const p = model ? model.predict(x, D.Fte[j]) : D.Fte[j]; ov += overlap(p, D.Rte[j]) / D.Xte.length; er += Math.abs(share(p) - share(D.Rte[j])) / D.Xte.length; });
      return { overlap: ov, err: er };
    }
    return { D, generate, fit, score, share, overlap, field, NTH, NS, o };
  }
  root.FlushField = { make };
})(typeof window !== 'undefined' ? window : globalThis);
