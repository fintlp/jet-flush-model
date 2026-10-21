/* Physics-informed neural network (PINN) for an inverse problem of the flush: find the weir coefficient and the
   time water spends on the wall from a noisy pool level trace, such as one read from a phone video of a ruler in
   the bowl. No page code here, so the checks can run it in Node.

   The physics is the model's pool balance, with the water on the wall as a smoothed delay of mean tau:
     A(z) dz/dt = Qarr(t) - Cw Lw max(z, 0)^1.5,   Qarr = Qin convolved with s/th^2 exp(-s/th),  th = tau/2
   (the same as two equal stores in series), with the inflow Qin(t) known (cistern), the pool area A(z) from the
   bowl, and Cw and tau unknown. A small network maps time t to the level z. Its loss is the misfit to the measured
   levels plus the residual of the balance at collocation points and the start value; Cw and tau are trained with
   the network.
   The time derivatives of the network are carried through the forward pass (value and d/dt per neuron), and the
   gradients of the loss come from a hand-written backward pass through both, so no library is needed.
   For comparison: the same network fitted to the data alone (no physics), and a classic least-squares fit that
   integrates the equations for trial values of Cw and tau (Nelder-Mead). */
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  // ---- the measured flush: the full flush model with a hidden weir coefficient, read like a phone video ----
  function makeData(M, o) {
    o = Object.assign({ Cw: 1.45, T: 8, fps: 10, noise: 0.0015, n: null, seed: 3 }, o || {});
    const p = Object.assign(M.defaults('washdown'), { flushMode: 'full', Cweir: o.Cw }), g = M.buildGeom(p);
    const tr = []; M.simulate(p, { Tend: o.T, Tmax: o.T, probe: (s) => tr.push({ t: s.t, z: s.z, Qin: s.Qin, W: s.Vtransit }) });
    const at = (t) => tr[Math.min(tr.length - 1, Math.max(0, Math.round(t / 0.01)))];
    // pool area against level: quadratic fit to the bowl's volume table, 0 to 70 mm above the crest
    const Af = (z) => { const dz = 0.0005; return (M.volAtLevel(g, z + dz) - M.volAtLevel(g, z - dz)) / (2 * dz); };
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (let z = 0; z <= 0.0701; z += 0.005) { const v = [1, z, z * z], a = Af(z); for (let i = 0; i < 3; i++) { b[i] += v[i] * a; for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j]; } }
    const A3 = solve(S, b);
    // readings: every 1/fps s, or n readings spread over the flush; noise as from reading a ruler
    const r = rng(o.seed), times = [];
    if (o.n) for (let i = 0; i < o.n; i++) times.push(+(o.T * (i + 0.5) / o.n).toFixed(2));
    else for (let t = 0; t <= o.T + 1e-9; t += 1 / o.fps) times.push(+t.toFixed(2));
    const obs = times.map((t) => ({ t, z: at(t).z + o.noise * gauss(r) }));
    const truth = tr.filter((_, i) => i % 5 === 0).map((s) => ({ t: s.t, z: s.z, W: s.W }));
    return { obs, truth, Qin: (t) => at(Math.max(0, Math.min(o.T, t))).Qin, A3, Lw: p.Lweir / 1000, T: o.T, Cw: o.Cw, CwModel: M.COEFFS.Cweir, noise: o.noise };
  }
  function solve(A, b) {
    A = A.map((r) => r.slice()); b = b.slice(); const n = b.length;
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q < n; q++) A[r][q] -= f * A[c][q]; b[r] -= f * b[c]; } }
    return b.map((v, i) => v / A[i][i]);
  }

  // ---- the network: t -> z, with d/dt carried along ----
  const NO = 1;
  function makeNet(seed, H) {
    const SIZES = [1, H, H, NO], r = rng(seed), L = [];
    for (let l = 0; l < SIZES.length - 1; l++) {
      const n = SIZES[l], m = SIZES[l + 1], sc = Math.sqrt(2 / (n + m));
      L.push({ n, m, W: Float64Array.from({ length: n * m }, () => gauss(r) * sc), b: new Float64Array(m) });
    }
    return L;
  }
  // buffers for one input point, allocated once: values a, time derivatives da, pre-activation derivatives dz
  const makeBuf = (L) => ({ a: [new Float64Array(1)].concat(L.map((ly) => new Float64Array(ly.m))), da: [new Float64Array(1)].concat(L.map((ly) => new Float64Array(ly.m))), dz: L.map((ly) => new Float64Array(ly.m)),
    g: L.map((ly) => new Float64Array(ly.m)), gd: L.map((ly) => new Float64Array(ly.m)), gi: [new Float64Array(1)].concat(L.map((ly) => new Float64Array(ly.m))), gdi: [new Float64Array(1)].concat(L.map((ly) => new Float64Array(ly.m))) });
  function forward(L, x, B) {
    B.a[0][0] = x; B.da[0][0] = 1;
    for (let l = 0; l < L.length; l++) {
      const { n, m, W, b } = L[l], last = l === L.length - 1, A0 = B.a[l], D0 = B.da[l], A1 = B.a[l + 1], D1 = B.da[l + 1], DZ = B.dz[l];
      for (let j = 0; j < m; j++) {
        let s = b[j], ds = 0; for (let i = 0; i < n; i++) { const w = W[i * m + j]; s += w * A0[i]; ds += w * D0[i]; }
        if (last) { A1[j] = s; D1[j] = ds; } else { const h = Math.tanh(s); A1[j] = h; DZ[j] = ds; D1[j] = (1 - h * h) * ds; }
      }
    }
    return B;
  }
  // backward: gy and gdy (length NO) are the loss gradients by the outputs and by their time derivatives
  function backward(L, B, gy, gdy, G) {
    let g = gy, gd = gdy;
    for (let l = L.length - 1; l >= 0; l--) {
      const { n, m, W } = L[l], last = l === L.length - 1;
      let gz = g, gdz = gd;
      if (!last) {
        const h = B.a[l + 1], dz = B.dz[l]; gz = B.g[l]; gdz = B.gd[l];
        for (let j = 0; j < m; j++) { const s = 1 - h[j] * h[j]; gz[j] = g[j] * s + gd[j] * (-2 * h[j] * s * dz[j]); gdz[j] = gd[j] * s; }
      }
      const A0 = B.a[l], D0 = B.da[l], GW = G[l].W, Gb = G[l].b, ga = B.gi[l], gda = B.gdi[l];
      for (let i = 0; i < n; i++) { let s = 0, sd = 0; for (let j = 0; j < m; j++) { const k = i * m + j; GW[k] += gz[j] * A0[i] + gdz[j] * D0[i]; s += W[k] * gz[j]; sd += W[k] * gdz[j]; } ga[i] = s; gda[i] = sd; }
      for (let j = 0; j < m; j++) Gb[j] += gz[j];
      g = ga; gd = gda;
    }
  }

  // ---- the wall as a smoothed delay: arrival = inflow convolved with a two-store kernel ----
  // k(s) = s / th^2 exp(-s / th), th = tau / 2 (two equal stores in series, mean delay tau); also d(arrival)/d(th)
  function arrival(D, th, times, dt) {
    const out = new Float64Array(times.length), dth = new Float64Array(times.length), nS = Math.ceil(Math.min(D.T, 12 * th) / dt);
    const k = new Float64Array(nS), dk = new Float64Array(nS);
    for (let j = 0; j < nS; j++) { const s = (j + 0.5) * dt, e = Math.exp(-s / th); k[j] = s / (th * th) * e * dt; dk[j] = e * (s * s / Math.pow(th, 4) - 2 * s / Math.pow(th, 3)) * dt; }
    times.forEach((t, i) => { let a = 0, b = 0; for (let j = 0; j < nS; j++) { const tt = t - (j + 0.5) * dt; if (tt < 0) break; const q = D.Qin(tt); a += q * k[j]; b += q * dk[j]; } out[i] = a; dth[i] = b; });
    return { q: out, dq: dth };
  }

  // ---- training, as a generator: yields every `every` epochs with the current state ----
  function* train(D, o) {
    o = Object.assign({ epochs: 2500, physics: true, seed: 11, lr: 5e-3, nColl: 120, every: 25, Cw0: 1.0, tau0: 0.25, H: 20, wD: 10 }, o || {});
    const T = D.T, Zs = 0.06, Q0 = 1.7e-3, Lw = D.Lw, [a0, a1, a2] = D.A3, dtK = 0.01;
    const L = makeNet(o.seed, o.H), th = { c: Math.log(o.Cw0), s: Math.log(o.tau0) };
    const X = (t) => 2 * t / T - 1, DX = 2 / T;   // input scaled to -1..1; d/dt = DX d/dx
    const coll = Array.from({ length: o.nColl }, (_, i) => { const t = T * i / (o.nColl - 1); return { t, x: X(t), B: makeBuf(L) }; });
    const ct = coll.map((c) => c.t);
    const obs = D.obs.map((q) => ({ x: X(q.t), y: q.z / Zs, B: makeBuf(L) })), B0 = makeBuf(L);
    const G = L.map((ly) => ({ W: new Float64Array(ly.W.length), b: new Float64Array(ly.b.length) }));
    const mW = L.map((ly) => ({ W: new Float64Array(ly.W.length), b: new Float64Array(ly.b.length) })), vW = L.map((ly) => ({ W: new Float64Array(ly.W.length), b: new Float64Array(ly.b.length) }));
    const mp = { c: 0, s: 0 }, vp = { c: 0, s: 0 };
    const wD = o.wD, wP = o.physics ? 1 : 0, wI = o.physics ? 10 : 0;
    const gy = new Float64Array(NO), gdy = new Float64Array(NO), hist = [];
    for (let ep = 1; ep <= o.epochs; ep++) {
      G.forEach((q) => { q.W.fill(0); q.b.fill(0); });
      let gc = 0, gs = 0, lossD = 0, lossP = 0;
      const Cw = Math.exp(th.c), tau = Math.exp(th.s), tq = tau / 2;
      for (const q of obs) {
        forward(L, q.x, q.B); const e = q.B.a[3][0] - q.y; lossD += e * e / obs.length;
        gy[0] = 2 * wD * e / obs.length; gdy[0] = 0; backward(L, q.B, gy, gdy, G);
      }
      if (o.physics) {
        const k = 2 * wP / coll.length, AR = arrival(D, tq, ct, dtK);
        coll.forEach((c, ci) => {
          forward(L, c.x, c.B); const y = c.B.a[3][0], dy = c.B.da[3][0];
          const z = y * Zs, dz = dy * Zs * DX, zp = Math.max(0, z), Az = a0 + a1 * z + a2 * z * z, dA = a1 + 2 * a2 * z, wf = Cw * Lw * Math.pow(zp, 1.5);
          const r = (Az * dz - AR.q[ci] + wf) / Q0;
          lossP += r * r / coll.length;
          const g = k * r / Q0;
          gdy[0] = g * Az * Zs * DX; gy[0] = g * (dA * dz + Cw * Lw * 1.5 * Math.sqrt(zp)) * Zs;
          backward(L, c.B, gy, gdy, G);
          gc += g * wf;                    // by c, where Cw = e^c
          gs += -g * AR.dq[ci] * tq;       // by s, where tq = e^s / 2
        });
        forward(L, X(0), B0); const y0 = B0.a[3][0]; lossP += wI * y0 * y0; gy[0] = 2 * wI * y0; gdy[0] = 0; backward(L, B0, gy, gdy, G);
      }
      const lr = o.lr * Math.pow(0.05, ep / o.epochs), b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, ep), c2 = 1 - Math.pow(b2, ep);
      const step = (P, Gr, Mm, V) => { for (let q = 0; q < P.length; q++) { Mm[q] = b1 * Mm[q] + (1 - b1) * Gr[q]; V[q] = b2 * V[q] + (1 - b2) * Gr[q] * Gr[q]; P[q] -= lr * (Mm[q] / c1) / (Math.sqrt(V[q] / c2) + 1e-8); } };
      L.forEach((ly, l) => { step(ly.W, G[l].W, mW[l].W, vW[l].W); step(ly.b, G[l].b, mW[l].b, vW[l].b); });
      if (o.physics) {
        const pr = 2 * lr;
        mp.c = b1 * mp.c + (1 - b1) * gc; vp.c = b2 * vp.c + (1 - b2) * gc * gc; th.c -= pr * (mp.c / c1) / (Math.sqrt(vp.c / c2) + 1e-8);
        mp.s = b1 * mp.s + (1 - b1) * gs; vp.s = b2 * vp.s + (1 - b2) * gs * gs; th.s -= pr * (mp.s / c1) / (Math.sqrt(vp.s / c2) + 1e-8);
      }
      if (ep % o.every === 0 || ep === o.epochs) {
        const st = { ep, epochs: o.epochs, lossD, lossP, Cw: Math.exp(th.c), tau: Math.exp(th.s) }; hist.push(st); yield st;
      }
    }
    // the network's level curve; the water on the wall follows from inflow minus arrival
    const Bc = makeBuf(L), n = 161, ts = Array.from({ length: n }, (_, i) => T * i / (n - 1)), AR = arrival(D, Math.exp(th.s) / 2, ts, dtK);
    let W = 0; const curve = ts.map((t, i) => { if (i) W += (D.Qin(t) - AR.q[i]) * (ts[i] - ts[i - 1]); const y = forward(L, X(t), Bc).a[3][0]; return { t, z: y * Zs, W: Math.max(0, W) }; });
    return { Cw: Math.exp(th.c), tau: Math.exp(th.s), curve, hist, physics: o.physics };
  }

  // ---- classic: integrate the same equations for trial values, Nelder-Mead on the squared misfit ----
  function simulateODE(D, Cw, tau, dt) {
    dt = dt || 0.002; const tq = tau / 2, [a0, a1, a2] = D.A3, out = []; let W1 = 0, W2 = 0, z = 0;
    for (let t = 0; t <= D.T + 1e-9; t += dt) {
      out.push({ t, z, W: W1 + W2 });
      const q1 = W1 / tq, q2 = W2 / tq, Az = a0 + a1 * z + a2 * z * z;
      W1 += dt * (D.Qin(t) - q1); W2 += dt * (q1 - q2); z = Math.max(0, z + dt * (q2 - Cw * D.Lw * Math.pow(Math.max(0, z), 1.5)) / Az);
    }
    return out;
  }
  function leastSquares(D) {
    let nEval = 0;
    const f = (x) => { nEval++; const Cw = Math.exp(x[0]), tau = Math.exp(x[1]), s = simulateODE(D, Cw, tau, 0.005); return D.obs.reduce((a, q) => a + (s[Math.min(s.length - 1, Math.round(q.t / 0.005))].z - q.z) ** 2, 0) / D.obs.length; };
    let S = [[Math.log(1.0), Math.log(0.25)], [Math.log(1.6), Math.log(0.25)], [Math.log(1.0), Math.log(0.6)]], F = S.map(f);
    for (let it = 0; it < 120; it++) {
      const o = [0, 1, 2].sort((a, b) => F[a] - F[b]); S = o.map((i) => S[i]); F = o.map((i) => F[i]);
      const c = [(S[0][0] + S[1][0]) / 2, (S[0][1] + S[1][1]) / 2], pt = (k) => [c[0] + k * (S[2][0] - c[0]), c[1] + k * (S[2][1] - c[1])];
      const xr = pt(-1), fr = f(xr);
      if (fr < F[0]) { const xe = pt(-2), fe = f(xe); if (fe < fr) { S[2] = xe; F[2] = fe; } else { S[2] = xr; F[2] = fr; } }
      else if (fr < F[1]) { S[2] = xr; F[2] = fr; }
      else { const xc = pt(fr < F[2] ? -0.5 : 0.5), fc = f(xc); if (fc < Math.min(fr, F[2])) { S[2] = xc; F[2] = fc; } else { for (let i = 1; i < 3; i++) { S[i] = [S[0][0] + 0.5 * (S[i][0] - S[0][0]), S[0][1] + 0.5 * (S[i][1] - S[0][1])]; F[i] = f(S[i]); } } }
    }
    const i0 = F.indexOf(Math.min(...F)), Cw = Math.exp(S[i0][0]), tau = Math.exp(S[i0][1]);
    return { Cw, tau, rms: Math.sqrt(F[i0]), nEval, curve: simulateODE(D, Cw, tau, 0.05) };
  }
  function runAll(gen) { let s = gen.next(); while (!s.done) s = gen.next(); return s.value; }
  root.FlushPINN = { makeData, train, leastSquares, simulateODE, runAll };
})(typeof window !== 'undefined' ? window : globalThis);
