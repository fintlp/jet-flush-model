/* Reduced-order model of an idealised rimless WC flushed by tangential rim jets.
   Units inside: SI (m, s, kg, Pa). UI parameters use mm, L, cm2, deg. */
(function (root) {
  const G = 9.81, RHO = 1000, TAU2 = Math.PI * 2;

  const PRESETS = {
    washdown: {
      label: 'EU washdown, 4.5/3 L',
      type: 'washdown', Vfull: 4.5, Vpart: 3.0, Hcr: 250, Kpath: 1.0,
      nJets: 2, Anoz: 4.5, hNoz: 12, alpha: 10,
      Rrim: 150, Rpool: 62, Dwall: 150, seal: 55, dTrap: 48,
      Hs: 250, Ks: 3.0, Qgrav: 0.6, Vtrap: 0.5, refill: 0.0
    },
    siphonic: {
      label: 'Siphonic, 4.8 L',
      type: 'siphonic', Vfull: 4.8, Vpart: 3.0, Hcr: 200, Kpath: 1.0,
      nJets: 2, Anoz: 4.5, hNoz: 12, alpha: 10,
      Rrim: 150, Rpool: 80, Dwall: 130, seal: 60, dTrap: 50,
      Hs: 250, Ks: 3.0, Qgrav: 0.6, Vtrap: 0.5, refill: 0.6
    }
  };

  const COEFFS = {
    Acist: 0.035, tOpen: 0.15, Lweir: 70, Cweir: 1.7,
    cf: 0.008, ksp: 0.22, tauC: 3.0, Jcrit: 1.5, cfp: 0.02, eta: 0.5,
    ucS: 0.35, ucP: 0.45, cmax: 0.12, kS: 2.0, kP: 1.2, beta: 0.2, phi0: 0.2, Fr0: 0.1,
    rhoS: 1100, sealMin: 50
  };

  function defaults(kind) {
    const pre = PRESETS[kind || 'washdown'];
    const p = Object.assign({}, COEFFS, pre, { flushMode: 'full', Ms: 250, Np: 8 });
    delete p.label;
    return p;
  }

  /* ---------- geometry: axisymmetric bowl wall from rim to static waterline ---------- */
  const NU = 400;
  function buildGeom(p) {
    const Rr = p.Rrim / 1000, Rp = p.Rpool / 1000, D = p.Dwall / 1000, ds = p.seal / 1000;
    // parametric profile r(zeta) = Rp + (Rr-Rp) cos(pi/2 zeta), depth z = zeta D
    const N = 600, rr = new Float64Array(N), zz = new Float64Array(N), ss = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const ze = i / (N - 1);
      rr[i] = Rp + (Rr - Rp) * Math.cos(Math.PI / 2 * ze);
      zz[i] = ze * D;
      if (i > 0) ss[i] = ss[i - 1] + Math.hypot(rr[i] - rr[i - 1], zz[i] - zz[i - 1]);
    }
    const S = ss[N - 1];
    // resample uniformly in arc length s
    const ur = new Float64Array(NU), udr = new Float64Array(NU), udz = new Float64Array(NU), uz = new Float64Array(NU);
    let j = 0;
    for (let k = 0; k < NU; k++) {
      const s = S * k / (NU - 1);
      while (j < N - 2 && ss[j + 1] < s) j++;
      const f = (s - ss[j]) / Math.max(1e-12, ss[j + 1] - ss[j]);
      ur[k] = rr[j] + f * (rr[j + 1] - rr[j]);
      uz[k] = zz[j] + f * (zz[j + 1] - zz[j]);
      const dl = Math.max(1e-12, ss[j + 1] - ss[j]);
      udr[k] = (rr[j + 1] - rr[j]) / dl;
      udz[k] = (zz[j + 1] - zz[j]) / dl;
    }
    // pool area vs level z (relative to weir crest = static waterline, +up)
    const zMin = -ds - 0.03, zMax = 0.9 * D, NZ = 800;
    const zt = new Float64Array(NZ), vt = new Float64Array(NZ);
    const rAtLevel = (z) => {
      if (z >= 0) { const ze = Math.max(0, (D - Math.min(z, D)) / D); return Rp + (Rr - Rp) * Math.cos(Math.PI / 2 * ze); }
      return Rp * Math.max(0.35, 1 + 0.5 * z / ds);
    };
    let i0 = 0;
    for (let i = 0; i < NZ; i++) { zt[i] = zMin + (zMax - zMin) * i / (NZ - 1); }
    for (let i = 1; i < NZ; i++) {
      const a0 = Math.PI * rAtLevel(zt[i - 1]) ** 2, a1 = Math.PI * rAtLevel(zt[i]) ** 2;
      vt[i] = vt[i - 1] + 0.5 * (a0 + a1) * (zt[i] - zt[i - 1]);
    }
    // shift so V(0)=0
    for (let i = 0; i < NZ; i++) if (zt[i] <= 0) i0 = i;
    const f0 = (0 - zt[i0]) / (zt[i0 + 1] - zt[i0]);
    const v0 = vt[i0] + f0 * (vt[i0 + 1] - vt[i0]);
    for (let i = 0; i < NZ; i++) vt[i] -= v0;
    const Vstatic = -vt[0]; // pool water below weir crest
    return { Rr, Rp, D, ds, S, ur, udr, udz, uz, zt, vt, NZ, rAtLevel, Vstatic, zMin, zMax };
  }

  function geomAt(g, s) {
    let x = s / g.S * (NU - 1);
    if (x < 0) x = 0; if (x > NU - 1.001) x = NU - 1.001;
    const k = x | 0, f = x - k;
    return {
      r: g.ur[k] + f * (g.ur[k + 1] - g.ur[k]),
      drds: g.udr[k] + f * (g.udr[k + 1] - g.udr[k]),
      dzds: g.udz[k] + f * (g.udz[k + 1] - g.udz[k]),
      z: g.uz[k] + f * (g.uz[k + 1] - g.uz[k])
    };
  }
  // arc length s at a given depth below rim
  function sAtDepth(g, depth) {
    if (depth >= g.D) return g.S;
    if (depth <= 0) return 0;
    let lo = 0, hi = NU - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.uz[m] < depth) lo = m; else hi = m; }
    const f = (depth - g.uz[lo]) / Math.max(1e-12, g.uz[hi] - g.uz[lo]);
    return g.S * (lo + f) / (NU - 1);
  }
  function levelFromVol(g, V) {
    const vt = g.vt, zt = g.zt;
    if (V <= vt[0]) return zt[0];
    if (V >= vt[g.NZ - 1]) return zt[g.NZ - 1];
    let lo = 0, hi = g.NZ - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (vt[m] < V) lo = m; else hi = m; }
    return zt[lo] + (V - vt[lo]) / (vt[hi] - vt[lo]) * (zt[hi] - zt[lo]);
  }

  /* ---------- main simulation ---------- */
  const NTH = 90, NS = 40;

  function simulate(p, opts) {
    opts = opts || {};
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const g = buildGeom(p);
    const dt = 0.01, Tend = opts.Tend || 14;
    const uEvery = opts.coarse ? 20 : 10, dtu = uEvery * dt;
    const light = !!opts.light;
    const Vfl = (p.flushMode === 'partial' ? p.Vpart : p.Vfull) / 1000;
    const An = p.Anoz * 1e-4, nJ = Math.max(1, Math.round(p.nJets));
    const hN = p.hNoz / 1000, w0 = An / hN;
    const At = Math.PI * (p.dTrap / 2000) ** 2;
    const alpha = p.alpha * Math.PI / 180;
    const Hcr = p.Hcr / 1000, Lw = p.Lweir / 1000, ds = g.ds;
    const Hs = p.Hs / 1000, Qg = p.Qgrav / 1000, Vtrap = p.Vtrap / 1000;
    const siph = p.type === 'siphonic';

    // wall grid
    const NC = NTH * NS, dth = TAU2 / NTH, dsb = g.S / NS;
    const J = new Float32Array(NC), tWet = new Float32Array(NC).fill(Infinity), tClean = new Float32Array(NC).fill(Infinity);
    const tauStep = new Float32Array(NC), stamp = new Int32Array(NC).fill(-1);
    const cellA = new Float32Array(NC);
    for (let is = 0; is < NS; is++) {
      const r = geomAt(g, (is + 0.5) * dsb).r;
      for (let it = 0; it < NTH; it++) cellA[is * NTH + it] = r * dth * dsb;
    }
    const touched = [];
    let cur = 0;

    const film = { uthArr: 0, rArr: g.Rp, active: false };
    const lines = [];
    const dl = 0.006, samp = 0.005;

    function mark(th, s, r, uth, um, U, w, tau, sStop) {
      const px = -um / U, py = uth / U;
      const n = Math.max(1, Math.ceil(w / samp));
      for (let i = 0; i <= n; i++) {
        const off = (i / n - 0.5) * w;
        const ys = s + off * py;
        if (ys < 0 || ys >= sStop) continue;
        let a = th + off * px / r;
        a = ((a % TAU2) + TAU2) % TAU2;
        const it = Math.min(NTH - 1, (a / dth) | 0), is = Math.min(NS - 1, (ys / dsb) | 0);
        const idx = is * NTH + it;
        if (stamp[idx] !== cur) { stamp[idx] = cur; tauStep[idx] = tau; touched.push(idx); }
        else if (tau > tauStep[idx]) tauStep[idx] = tau;
      }
    }

    function computeFilm(vj, Qj, z, t) {
      cur++; touched.length = 0;
      const rec = light ? null : { t, jets: [] };
      if (Qj < 2e-5 || vj < 0.05) { film.active = false; if (rec) lines.push(rec); return; }
      film.active = true;
      const sStop = Math.min(g.S, sAtDepth(g, g.D - z));
      let sumL = 0;
      for (let j = 0; j < nJ; j++) {
        let th = j * TAU2 / nJ, s = 0.004, uth = vj * Math.cos(alpha), um = vj * Math.sin(alpha), w = w0;
        const pts = rec ? [th, s] : null;
        let r = g.Rr, k = 0;
        for (; k < 500; k++) {
          const gm = geomAt(g, s); r = gm.r;
          const U = Math.hypot(uth, um);
          if (U < 0.05) break;
          const h = Math.min(hN, Qj / (U * w));
          const tau = 0.5 * RHO * p.cf * U * U;
          mark(th, s, r, uth, um, U, w, tau, sStop);
          const dtp = dl / U;
          const af = p.cf * U / (2 * h);
          const duth = -(um * uth / r) * gm.drds - af * uth;
          const dum = G * gm.dzds + (uth * uth / r) * gm.drds - af * um;
          uth += duth * dtp; um += dum * dtp;
          th += uth / r * dtp; s += um * dtp;
          if (s < 0) { s = 0; if (um < 0) um = 0; }
          w += p.ksp * dl;
          if (pts && (k % 3 === 0)) pts.push(th, s);
          if (s >= sStop) break;
        }
        if (pts) { pts.push(th, Math.min(s, sStop)); rec.jets.push({ pts, w }); }
        sumL += Math.max(0, uth) * r;
      }
      film.uthArr = sumL / nJ; film.rArr = 1;
      // apply shear impulse for this update interval
      for (let q = 0; q < touched.length; q++) {
        const idx = touched[q];
        if (t < tWet[idx]) tWet[idx] = t;
        J[idx] += Math.max(0, tauStep[idx] - p.tauC) * dtu;
        if (J[idx] >= p.Jcrit && tClean[idx] === Infinity) tClean[idx] = t + dtu;
      }
      if (rec) lines.push(rec);
    }

    let Vc = Vfl, Vrel = 0, L = 0, phi = 0;
    let primed = false, Vt = 0, primeT = null, breakT = null, everPrimed = false;
    let Ms = p.Ms, Np = p.Np, capS = 0, Vin = 0;
    let tEmpty = null, Qpeak = 0, vsPeak = 0, zPeak = 0, dipPeak = 0;
    const rec = light ? null : { t: [], Qin: [], Qout: [], z: [], Vc: [], vs: [], phi: [], Ms: [], Np: [], primed: [], Vt: [] };

    const nSteps = Math.round(Tend / dt);
    for (let n = 0; n <= nSteps; n++) {
      const t = n * dt;
      // cistern and jets
      const open = Vc > 1e-7 ? Math.min(1, t / p.tOpen) : 0;
      const H = Vc / p.Acist + Hcr;
      const vj = open * Math.sqrt(2 * G * H / (1 + p.Kpath));
      let Qin = nJ * An * vj;
      if (Qin * dt > Vc) Qin = Vc / dt;
      if (Vc > 1e-7 && Vc - Qin * dt <= 1e-7 && tEmpty === null) tEmpty = t + dt;
      Vc = Math.max(0, Vc - Qin * dt); Vin += Qin * dt;
      if (Qin > Qpeak) Qpeak = Qin;

      const z = levelFromVol(g, Vrel);
      if (n % uEvery === 0) computeFilm(vj, Qin / nJ, z, t);

      // outflow
      const Qw = z > 0 ? p.Cweir * Lw * Math.pow(z, 1.5) : 0;
      let Qout, Qtrans;
      if (!siph) {
        const Qcap = 0.6 * At * Math.sqrt(2 * G * (Math.max(z, 0) + ds));
        Qout = Math.min(Qw, Qcap); Qtrans = Qout;
      } else if (!primed) {
        Qout = Qw; Qtrans = Qw;
        if (Qw > Qg) Vt += (Qw - Qg) * dt; else Vt = Math.max(0, Vt - (Qg - Qw) * dt);
        if (Vt >= Vtrap) { primed = true; everPrimed = true; if (primeT === null) primeT = t; }
      } else {
        Qout = At * Math.sqrt(2 * G * Math.max(0, z + Hs) / p.Ks); Qtrans = Qout;
        if (z <= -ds) { primed = false; Vt = 0; Qout = 0; Qtrans = 0; breakT = t; }
      }
      Vrel += (Qin - Qout) * dt;
      if (Vrel < g.vt[0] + 1e-6) Vrel = g.vt[0] + 1e-6;

      // swirl (angular momentum of pool, solid-body)
      const Vpool = Math.max(1e-4, g.Vstatic + Vrel);
      const Rc = g.rAtLevel(z);
      const I = 0.5 * RHO * Vpool * Rc * Rc;
      let om = L / I;
      const Tin = film.active ? p.eta * RHO * Qin * film.uthArr : 0;
      const Tout = (Qout / Vpool) * L;
      const Awet = Math.PI * Rc * Rc + TAU2 * Rc * (ds + 0.03 + Math.max(z, 0));
      const Tf = 0.5 * RHO * p.cfp * Awet * (om * Rc) ** 2 * Rc;
      L = Math.max(0, L + (Tin - Tout - Tf) * dt);
      om = L / I; phi += om * dt;
      const vs = om * Rc, dip = vs * vs / (2 * G);
      if (vs > vsPeak) vsPeak = vs; if (z > zPeak) zPeak = z; if (dip > dipPeak) dipPeak = dip;

      // waste transport
      const ut = Qtrans / At;
      const Fr = vs * vs / (G * Rc), Cs = Fr / (Fr + p.Fr0);
      const fS = Math.min(1, Math.max(0, (ut / p.ucS - 1) / 0.5));
      const capRate = p.cmax * p.rhoS * Qtrans * 1000; // g/s
      const rS = fS * Math.min(capRate, p.kS * Ms * (1 + p.beta * Cs));
      Ms = Math.max(0, Ms - rS * dt); capS += fS * capRate * dt;
      const fP = Math.min(1, Math.max(0, (ut / p.ucP - 1) / 0.5));
      Np = Math.max(0, Np - fP * p.kP * Np * (p.phi0 + (1 - p.phi0) * Cs) * dt);

      if (rec && n % 2 === 0) {
        rec.t.push(t); rec.Qin.push(Qin * 1000); rec.Qout.push(Qout * 1000); rec.z.push(z * 1000);
        rec.Vc.push(Vc * 1000); rec.vs.push(vs); rec.phi.push(phi); rec.Ms.push(Ms); rec.Np.push(Np);
        rec.primed.push(primed ? 1 : 0); rec.Vt.push(Vt / Math.max(1e-9, Vtrap));
      }
    }

    // seal after flush, including bowl refill
    const zEnd = levelFromVol(g, Vrel);
    const zFinal = Math.min(0, levelFromVol(g, Vrel + p.refill / 1000 * (siph ? 1 : 0)));
    const sealEnd = siph ? Math.max(0, Math.min(ds, ds + zFinal)) * 1000 : ds * 1000;

    // cleaning metrics
    let Atot = 0, Aclean = 0, Awet = 0;
    for (let i = 0; i < NC; i++) { Atot += cellA[i]; if (J[i] >= p.Jcrit) Aclean += cellA[i]; if (tWet[i] < Infinity) Awet += cellA[i]; }
    const lineRow = Math.min(NS - 1, Math.floor(0.025 / dsb));
    let lineHit = 0;
    for (let it = 0; it < NTH; it++) if (J[lineRow * NTH + it] >= p.Jcrit) lineHit++;

    const water = Vfl * 1000 + (siph ? p.refill : 0);
    const out = {
      p, geom: g, NTH, NS, dsb,
      cleanPct: 100 * Aclean / Atot, wetPct: 100 * Awet / Atot, linePct: 100 * lineHit / NTH,
      solidsPct: p.Ms > 0 ? 100 * (1 - Ms / p.Ms) : 100, paperPct: p.Np > 0 ? 100 * (1 - Np / p.Np) : 100,
      capS, water, flushVol: Vfl * 1000, Qpeak: Qpeak * 1000, tEmpty, vsPeak, zPeak: zPeak * 1000, dipPeak: dipPeak * 1000,
      primeT, breakT, everPrimed, sealEnd, sealOK: sealEnd >= Math.min(p.sealMin, p.seal) - 0.5, zEnd: zEnd * 1000,
      cleanPerL: 100 * Aclean / Atot / water,
      runMs: 0
    };
    if (!light) Object.assign(out, { J, tWet, tClean, lines, rec, dtu });
    out.runMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return out;
  }

  root.FlushModel = { simulate, defaults, PRESETS, COEFFS, buildGeom, geomAt, sAtDepth, NTH, NS };
})(typeof window !== 'undefined' ? window : globalThis);
