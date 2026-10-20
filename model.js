/* Reduced-order model of an idealised rimless WC flushed by tangential rim jets.
   Units inside: SI (m, s, kg, Pa). UI parameters use mm, L, cm2, deg.
   Bowl wall: an oval surface whose plan section at every depth is an ellipse with
   axis ratio `ovality` and the same area as a circle of the equivalent radius r(z). */
(function (root) {
  const G = 9.81, RHO = 1000, TAU2 = Math.PI * 2;

  const PRESETS = {
    washdown: {
      label: 'EU washdown, 4.5/3 L',
      type: 'washdown', Vfull: 4.5, Vpart: 3.0, Hcr: 250, Kpath: 1.0,
      nJets: 2, Anoz: 4.5, hNoz: 12, alpha: 10, jetPhase: 0,
      Rrim: 150, Rpool: 62, ovality: 1.0, Dwall: 150, seal: 55, dTrap: 48,
      Hs: 250, Ks: 3.0, Qgrav: 0.6, Vtrap: 0.5, refill: 0.0
    },
    siphonic: {
      label: 'Siphonic, 4.8 L',
      type: 'siphonic', Vfull: 4.8, Vpart: 3.0, Hcr: 200, Kpath: 1.0,
      nJets: 2, Anoz: 4.5, hNoz: 12, alpha: 10, jetPhase: 0,
      Rrim: 150, Rpool: 80, ovality: 1.0, Dwall: 130, seal: 60, dTrap: 50,
      Hs: 250, Ks: 3.0, Qgrav: 0.6, Vtrap: 0.5, refill: 0.6
    }
  };

  const COEFFS = {
    Acist: 0.035, tOpen: 0.15, Lweir: 70, Cweir: 1.7,
    cf: 0.008, ksp: 0.22, tauC: 3.0, Jcrit: 1.5, cfp: 0.02, eta: 0.5, kov: 2.0,
    ucS: 0.35, ucP: 0.45, cmax: 0.12, kS: 2.0, kP: 1.2, beta: 0.2, phi0: 0.2, Fr0: 0.1,
    rhoS: 1100, sealMin: 50,
    // noise indicator (relative): sound from air bubbles, written as air flow into the water
    nUe: 0.8, nExp: 1.8, nK: 0.04, hFall: 120, rCore: 0.6, cCore: 0.05, wTrap: 0.1
  };
  // Centre depression of a Rankine vortex below the mean surface, in units of vs^2/(2g), where vs is the
  // edge speed of a solid-body pool with the same angular momentum. Core radius a = rc/R.
  // F(a): depression for an edge speed ve; ve = vs / (2 - a^2) keeps the angular momentum of the pool
  // (cylinder of uniform depth). a = 1 gives the solid body, 0.5.
  function rankineF(a) { return (2 / (a * a) - 1) * (1 - a * a) + 0.5 + 2 * Math.log(a) + 1 - a * a; }
  function coreFactor(a) {
    a = Math.min(1, Math.max(0.15, a));
    return rankineF(a) / ((2 - a * a) * (2 - a * a));
  }
  // uncertain noise coefficients: every combination of a low and a high value around the current setting
  function noiseCorners(p) {
    const lo = { nUe: Math.max(0.3, p.nUe - 0.15), hFall: p.hFall / 1.5, rCore: Math.max(0.3, p.rCore - 0.15), cCore: p.cCore / 2.5, wTrap: p.wTrap / 3 };
    const hi = { nUe: p.nUe + 0.15, hFall: p.hFall * 1.5, rCore: Math.min(1, p.rCore + 0.2), cCore: Math.min(0.5, p.cCore * 2.5), wTrap: Math.min(1, p.wTrap * 3) };
    const keys = ['nUe', 'hFall', 'rCore', 'cCore', 'wTrap'];
    const out = [{ nUe: p.nUe, hFall: p.hFall, rCore: p.rCore, cCore: p.cCore, wTrap: p.wTrap }];   // index 0: the setting itself
    for (let m = 0; m < 32; m++) { const c = {}; keys.forEach((k, j) => { c[k] = (m >> j) & 1 ? hi[k] : lo[k]; }); out.push(c); }
    return { lo, hi, list: out };
  }

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
    const zMin = -ds - 0.03, zMax = D, NZ = 800;   // up to the rim; above it the bowl overflows
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
    const Vrim = vt[NZ - 1]; // volume above the crest when the bowl is full to the rim
    return { Rr, Rp, D, ds, S, ur, udr, udz, uz, zt, vt, NZ, rAtLevel, Vstatic, Vrim, zMin, zMax };
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
    const dt = 0.01, Tend = opts.Tend || 14, Tmax = Math.max(Tend, opts.Tmax || 60);   // run at least Tend, until settled, at most Tmax
    const uEvery = opts.uEvery || (opts.coarse ? 20 : 10), dtu = uEvery * dt;   // film update every uEvery steps of 10 ms
    const light = !!opts.light;
    const Vfl = (p.flushMode === 'partial' ? p.Vpart : p.Vfull) / 1000;
    const An = p.Anoz * 1e-4, nJ = Math.max(1, Math.round(p.nJets));
    const hN = p.hNoz / 1000, w0 = An / hN;
    const At = Math.PI * (p.dTrap / 2000) ** 2;
    const alpha = p.alpha * Math.PI / 180;
    const Hcr = p.Hcr / 1000, Lw = p.Lweir / 1000, ds = g.ds;
    const Hs = p.Hs / 1000, Qg = p.Qgrav / 1000, Vtrap = p.Vtrap / 1000;
    const siph = p.type === 'siphonic';
    // oval pool: perimeter factor (Ramanujan) and extra swirl loss on non-circular walls
    const Eo = Math.max(1, p.ovality || 1), ea = Math.sqrt(Eo), eb = 1 / Math.sqrt(Eo);
    const perimF = Math.PI * (3 * (ea + eb) - Math.sqrt((3 * ea + eb) * (ea + 3 * eb))) / TAU2;
    const ovPen = 1 + (p.kov == null ? 2 : p.kov) * (Eo - 1);

    // wall grid
    const NC = NTH * NS, dth = TAU2 / NTH, dsb = g.S / NS;
    const J = new Float32Array(NC), tWet = new Float32Array(NC).fill(Infinity), tClean = new Float32Array(NC).fill(Infinity);
    const tauStep = new Float32Array(NC), stamp = new Int32Array(NC).fill(-1);
    const cellA = new Float32Array(NC);
    const E = Math.max(1, p.ovality || 1), sE = Math.sqrt(E);
    const Rr = g.Rr, Rp = g.Rp, Dw = g.D, kz = Math.PI / (2 * Dw);
    const Rz = (z) => Rp + (Rr - Rp) * Math.cos(kz * z);          // equivalent radius at depth z
    const dRz = (z) => -(Rr - Rp) * kz * Math.sin(kz * z);        // dR/dz
    for (let is = 0; is < NS; is++) {
      const z0 = geomAt(g, is * dsb).z, z1 = geomAt(g, (is + 1) * dsb).z, zc = 0.5 * (z0 + z1);
      const R = Rz(zc), dR = dRz(zc);
      for (let it = 0; it < NTH; it++) {
        const th = (it + 0.5) * dth, c = Math.cos(th), sn = Math.sin(th);
        // |dX/dtheta x dX/dz| for X = (R sE cos, R/sE sin, z)
        const ax = -R * sE * sn, ay = R / sE * c, bx = dR * sE * c, by = dR / sE * sn;
        const cx = ay * 1 - 0 * by, cy = 0 * bx - ax * 1, cz = ax * by - ay * bx;
        cellA[is * NTH + it] = Math.hypot(cx, cy, cz) * dth * (z1 - z0);
      }
    }
    // map a point on (or near) the wall to its cell
    const cellOf = (x, y, z) => {
      if (z < 0) return -1;
      const s = sAtDepth(g, z);
      let a = Math.atan2(y * sE, x / sE); if (a < 0) a += TAU2;
      const it = Math.min(NTH - 1, (a / dth) | 0), is = Math.min(NS - 1, (s / dsb) | 0);
      return is * NTH + it;
    };
    const touched = [];
    let cur = 0;

    const film = { uthArr: 0, rArr: g.Rp, active: false, end: [] };   // end: per jet [Q, vx, vy, vz, x, y] where the film meets the pool
    const lines = [];
    const dl = 0.006, samp = 0.005;

    // stamp the film footprint: a segment of width w across the flow, in the tangent plane
    function mark(x, y, z, dx, dy, dz, w, tau, zStop) {
      const n = Math.max(1, Math.ceil(w / samp));
      for (let i = 0; i <= n; i++) {
        const off = (i / n - 0.5) * w;
        const zz = z + off * dz;
        if (zz < 0 || zz >= zStop) continue;
        const idx = cellOf(x + off * dx, y + off * dy, zz);
        if (idx < 0) continue;
        if (stamp[idx] !== cur) { stamp[idx] = cur; tauStep[idx] = tau; touched.push(idx); }
        else if (tau > tauStep[idx]) tauStep[idx] = tau;
      }
    }
    // wall surface F(x,y,z) = rho(x,y) - R(z) = 0, rho = sqrt(x^2/E + E y^2); F < 0 inside the bowl
    function wallNormal(x, y, z, out) {
      const rho = Math.max(1e-9, Math.sqrt(x * x / E + E * y * y));
      let nx = x / (E * rho), ny = E * y / rho, nz = -dRz(z);
      const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      out[0] = nx; out[1] = ny; out[2] = nz; out[3] = rho - Rz(z); out[4] = m;
    }

    function computeFilm(vj, Qj, z, t) {
      cur++; touched.length = 0;
      const rec = light ? null : { t, jets: [] };
      film.end.length = 0;
      if (Qj < 2e-5 || vj < 0.05) { film.active = false; if (rec) lines.push(rec); return; }
      film.active = true;
      const zStop = Math.max(0.002, Math.min(g.D, g.D - z));   // waterline depth below the rim
      const nrm = new Float64Array(5), phase = (p.jetPhase || 0) * Math.PI / 180;
      let sumL = 0;
      for (let j = 0; j < nJ; j++) {
        // nozzle on the rim ellipse, jet tangent to the rim and tilted down by alpha
        const th0 = phase + j * TAU2 / nJ, z0 = 0.004, R0 = Rz(z0);
        let x = R0 * sE * Math.cos(th0), y = R0 / sE * Math.sin(th0), zp = z0;
        let tx = -sE * Math.sin(th0), ty = Math.cos(th0) / sE; const tm = Math.hypot(tx, ty); tx /= tm; ty /= tm;
        let vx = vj * Math.cos(alpha) * tx, vy = vj * Math.cos(alpha) * ty, vz = vj * Math.sin(alpha);
        let w = w0;
        const pts = rec ? [] : null;
        const pushPt = () => { let a = Math.atan2(y * sE, x / sE); if (a < 0) a += TAU2; pts.push(x, y, a, sAtDepth(g, Math.max(0, zp))); };
        if (pts) pushPt();
        for (let k = 0; k < 500; k++) {
          const U = Math.hypot(vx, vy, vz);
          if (U < 0.05) break;
          wallNormal(x, y, zp, nrm);
          const nx = nrm[0], ny = nrm[1], nz = nrm[2];
          const h = Math.min(hN, Qj / (U * w));
          const tau = 0.5 * RHO * p.cf * U * U;
          // footprint across the flow: d = n x u_hat
          let dx = ny * vz - nz * vy, dy = nz * vx - nx * vz, dz = nx * vy - ny * vx;
          const dm = Math.hypot(dx, dy, dz) || 1; dx /= dm; dy /= dm; dz /= dm;
          mark(x, y, zp, dx, dy, dz, w, tau, zStop);
          const dtp = dl / U, af = p.cf * U / (2 * h);
          // forces: gravity (+z is down) and wall friction against the velocity
          const ax = -af * vx, ay = -af * vy, az = G - af * vz;
          // tangential part of the force sets the speed change; the wall reaction does no work
          const an = ax * nx + ay * ny + az * nz;
          const atx = ax - an * nx, aty = ay - an * ny, atz = az - an * nz;
          const Ut = Math.max(0, U + (atx * vx + aty * vy + atz * vz) / U * dtp);
          vx += ax * dtp; vy += ay * dtp; vz += az * dtp;
          x += vx * dtp; y += vy * dtp; zp += vz * dtp;
          if (zp < 0.001) { zp = 0.001; if (vz < 0) vz = 0; }
          // project back onto the wall (two Newton steps on F)
          for (let it2 = 0; it2 < 2; it2++) {
            wallNormal(x, y, zp, nrm);
            const F = nrm[3], gm = nrm[4];
            x -= F * nrm[0] / gm; y -= F * nrm[1] / gm; zp -= F * nrm[2] / gm;
          }
          wallNormal(x, y, zp, nrm);
          const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];
          vx -= vn * nrm[0]; vy -= vn * nrm[1]; vz -= vn * nrm[2];
          const Vm = Math.hypot(vx, vy, vz) || 1;
          vx *= Ut / Vm; vy *= Ut / Vm; vz *= Ut / Vm;
          w += p.ksp * dl;
          if (pts && (k % 3 === 0)) pushPt();
          if (zp >= zStop) break;
        }
        if (pts) { pushPt(); rec.jets.push({ pts, w }); }
        sumL += Math.max(0, x * vy - y * vx);   // angular momentum per unit mass about the bowl axis
        film.end.push([Qj, vx, vy, vz, x, y]);   // where and how fast the film meets the pool
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

    let tEnd = 0, Vspill = 0, overflowT = null;
    // noise indicator state. Variant 0 uses the current coefficients; variants 1..32 are the corners of the
    // uncertainty box from noiseCorners(). Each uncertain value takes one of three levels (setting, low, high).
    const nX = p.nExp, tauF = 0.125, aF = 1 - Math.exp(-dt / tauF);   // exact 125 ms exponential smoothing
    const NCo = noiseCorners(p), VAR = NCo.list, NV = VAR.length;
    const lev = (k, v) => (v[k] === NCo.lo[k] ? 1 : 2);
    const UeL = [p.nUe, NCo.lo.nUe, NCo.hi.nUe], hFL = [p.hFall, NCo.lo.hFall, NCo.hi.hFall].map((h) => h / 1000);
    const CvL = [p.rCore, NCo.lo.rCore, NCo.hi.rCore].map(coreFactor);
    const vUe = VAR.map((v, i) => (i === 0 ? 0 : lev('nUe', v))), vhF = VAR.map((v, i) => (i === 0 ? 0 : lev('hFall', v))), vCv = VAR.map((v, i) => (i === 0 ? 0 : lev('rCore', v)));
    const ent = (Q, U, Ue) => (U > Ue ? p.nK * Q * Math.pow(U - Ue, nX) : 0);   // air entrained by plunging water, m3/s
    const WfV = new Float64Array(NV), peakV = new Float64Array(NV), EV = new Float64Array(NV), coreV = [false, false, false];
    let tPeakN = 0, airT = null, airDur = 0, tBrk = null, Qbrk = 0;
    const Esrc = [0, 0, 0, 0], Wsrc = [0, 0, 0, 0], WfS = [0, 0, 0, 0];
    let peakShare = [0, 0, 0, 0];
    const s1L = [0, 0, 0], s2L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], coreL = [false, false, false];
    const nrec = light ? null : { t: [], L: [], pl: [], out: [], air: [], brk: [], core: [], Lv: Array.from({ length: NV }, () => []) };
    for (let n = 0; ; n++) {
      const t = n * dt; tEnd = t;
      // stop once the flush is over: cistern empty and 6 s of settling, but never before Tend or after Tmax
      if (t > Tend && tEmpty !== null && t > tEmpty + 6) break;
      if (t > Tmax) break;
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
        if (z <= -ds) { Qbrk = Qout; tBrk = t; primed = false; Vt = 0; Qout = 0; Qtrans = 0; breakT = t; }
      }
      Vrel += (Qin - Qout) * dt;
      if (Vrel < g.vt[0] + 1e-6) Vrel = g.vt[0] + 1e-6;
      if (Vrel > g.Vrim) { Vspill += Vrel - g.Vrim; Vrel = g.Vrim; if (overflowT === null) overflowT = t; }   // water over the rim

      // swirl (angular momentum of pool, solid-body)
      const Vpool = Math.max(1e-4, g.Vstatic + Vrel);
      const Rc = g.rAtLevel(z);
      const I = 0.25 * RHO * Vpool * Rc * Rc * (E + 1 / E);   // elliptic pool, same area as circle of radius Rc
      let om = L / I;
      const Tin = film.active ? p.eta * RHO * Qin * film.uthArr : 0;
      const Tout = (Qout / Vpool) * L;
      const Awet = Math.PI * Rc * Rc + perimF * TAU2 * Rc * (ds + 0.03 + Math.max(z, 0));
      const Tf = 0.5 * RHO * p.cfp * ovPen * Awet * (om * Rc) ** 2 * Rc;
      L = Math.max(0, L + (Tin - Tout - Tf) * dt);
      om = L / I; phi += om * dt;
      const vs = om * Rc, dip = vs * vs / (2 * G);
      if (vs > vsPeak) vsPeak = vs; if (z > zPeak) zPeak = z; if (dip > dipPeak) dipPeak = dip;

      // noise indicator. Every source is written as a flow of air into the water (m3/s), weighted by the
      // sound it makes per unit of air: 1 for fine splash bubbles, wTrap for large air pockets in the trap.
      // The weighted sum stands for radiated sound power and is only used relative to a reference.
      // 1 jet films plunging into the pool, speed relative to the local surface velocity of the rotating pool
      s1L[0] = s1L[1] = s1L[2] = 0;
      if (film.active) for (const e of film.end) {
        const ur = Math.hypot(e[1] + om * e[5], e[2] - om * e[4], e[3]);   // pool surface moves at om x r
        for (let k = 0; k < 3; k++) s1L[k] += ent(e[0], ur, UeL[k]);
      }
      // 2 water falling from the trap weir into the outlet (free surface flow only)
      const Qfree = siph && primed ? 0 : Qout;
      for (let k = 0; k < 3; k++) for (let h = 0; h < 3; h++) s2L[k][h] = Qfree > 0 ? ent(Qfree, Math.sqrt(2 * G * Math.max(z, 0) / 3 + 2 * G * hFL[h]), UeL[k]) : 0;
      // 3 air core: the vortex centre dips down to the top of the trap inlet while water flows out
      const subm = z + ds;
      for (let k = 0; k < 3; k++) { coreL[k] = Qout > 1e-6 && CvL[k] * dip >= subm; if (coreL[k]) coreV[k] = true; }
      const core = coreL[0];
      if (core) { airDur += dt; if (airT === null) airT = t; }
      // 4 siphon break: air replaces the water in the trap leg at the rate the siphon was carrying it out,
      // decaying once the leg's volume has been replaced (time constant Vtrap / Qbrk)
      const s4 = tBrk !== null && t >= tBrk ? Qbrk * Math.exp(-(t - tBrk) * Qbrk / Math.max(1e-9, Vtrap)) : 0;
      Wsrc[0] = s1L[0]; Wsrc[1] = s2L[0][0]; Wsrc[2] = p.wTrap * (core ? p.cCore * Qout : 0); Wsrc[3] = p.wTrap * s4;
      for (let k = 0; k < 4; k++) { Esrc[k] += Wsrc[k] * dt; WfS[k] += (Wsrc[k] - WfS[k]) * aF; }
      for (let v = 0; v < NV; v++) {
        const c = VAR[v], ku = vUe[v];
        const Wv = s1L[ku] + s2L[ku][vhF[v]] + c.wTrap * ((coreL[vCv[v]] ? c.cCore * Qout : 0) + s4);
        EV[v] += Wv * dt;
        WfV[v] += (Wv - WfV[v]) * aF;                  // 'fast' time weighting, 125 ms
        if (WfV[v] > peakV[v]) { peakV[v] = WfV[v]; if (v === 0) { tPeakN = t; const sw = WfS[0] + WfS[1] + WfS[2] + WfS[3]; peakShare = WfS.map((x) => (sw > 0 ? x / sw : 0)); } }
      }

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
        nrec.t.push(t); nrec.L.push(10 * Math.log10(WfV[0] + 1e-12)); nrec.pl.push(Wsrc[0]); nrec.out.push(Wsrc[1]); nrec.air.push(Wsrc[2]); nrec.brk.push(Wsrc[3]); nrec.core.push(core ? 1 : 0);
        for (let v = 0; v < NV; v++) nrec.Lv[v].push(10 * Math.log10(WfV[v] + 1e-12));
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

    const incomplete = Vc > 1e-6;   // cistern still not empty at Tmax
    const water = Vin * 1000 + (siph ? p.refill : 0);   // water actually released, plus bowl refill
    const out = {
      p, geom: g, NTH, NS, dsb,
      cleanPct: 100 * Aclean / Atot, wetPct: 100 * Awet / Atot, linePct: 100 * lineHit / NTH,
      solidsPct: p.Ms > 0 ? 100 * (1 - Ms / p.Ms) : 100, paperPct: p.Np > 0 ? 100 * (1 - Np / p.Np) : 100,
      capS, water, flushVol: Vfl * 1000, Qpeak: Qpeak * 1000, tEmpty, vsPeak, zPeak: zPeak * 1000, dipPeak: dipPeak * 1000,
      primeT, breakT, everPrimed, sealEnd, sealOK: sealEnd >= p.sealMin - 0.5, zEnd: zEnd * 1000,
      tEnd, incomplete, cisternLeft: Vc * 1000, overflow: overflowT !== null, overflowT, spill: Vspill * 1000, valid: overflowT === null && !incomplete,
      cleanPerL: 100 * Aclean / Atot / water,
      noise: (() => {
        const dB = (x) => 10 * Math.log10(x + 1e-12), Es = Esrc[0] + Esrc[1] + Esrc[2] + Esrc[3];
        const nCore = VAR.reduce((s, v, i) => s + (i > 0 && coreV[vCv[i]] ? 1 : 0), 0);
        return {
          peak: dB(peakV[0]), energy: dB(EV[0]), tPeak: tPeakN,
          share: Esrc.map((e) => (Es > 0 ? e / Es : 0)), peakShare, airT, airDur, coreFactor: CvL[0],
          peakV: Array.from(peakV, dB), energyV: Array.from(EV, dB), coreCorners: nCore, nCorners: NV - 1
        };
      })(),
      runMs: 0
    };
    if (!light) Object.assign(out, { J, tWet, tClean, lines, rec, nrec, dtu });
    out.runMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return out;
  }

  root.FlushModel = { simulate, defaults, PRESETS, COEFFS, buildGeom, geomAt, sAtDepth, coreFactor, rankineF, noiseCorners, NTH, NS };
})(typeof window !== 'undefined' ? window : globalThis);
