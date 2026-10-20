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
      label: 'Siphonic, 4.8 L + 0.6 L refill',
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
    rhoS: 1100, sealMin: 50, qRefill: 0.1,
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
    // polar moment of the pool per unit density and ovality factor: q4(z) = integral of pi r(z')^4 dz' from the bottom,
    // so a pool filled to level z rotating as a solid body has I = rho (e + 1/e) / 4 * q4(z) (elliptic sections)
    const q4t = new Float64Array(NZ);
    for (let i = 1; i < NZ; i++) { const a0 = Math.PI * rAtLevel(zt[i - 1]) ** 4, a1 = Math.PI * rAtLevel(zt[i]) ** 4; q4t[i] = q4t[i - 1] + 0.5 * (a0 + a1) * (zt[i] - zt[i - 1]); }
    return { Rr, Rp, D, ds, S, ur, udr, udz, uz, zt, vt, q4t, NZ, rAtLevel, Vstatic, Vrim, zMin, zMax };
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
  // pool volume relative to the weir crest at level z, and the polar moment table at level z
  function volAtLevel(g, z) { return tableAt(g, g.vt, z); }
  function q4AtLevel(g, z) { return tableAt(g, g.q4t, z); }
  function tableAt(g, tab, z) {
    const zt = g.zt; if (z <= zt[0]) return tab[0]; if (z >= zt[g.NZ - 1]) return tab[g.NZ - 1];
    const x = (z - zt[0]) / (zt[1] - zt[0]), i = Math.min(g.NZ - 2, x | 0), f = x - i;
    return tab[i] + f * (tab[i + 1] - tab[i]);
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
  const NTH0 = 90, NS0 = 40;   // wall grid: cells round the rim and down the wall

  function simulate(p, opts) {
    opts = opts || {};
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const g = buildGeom(p);
    const dt = opts.dt || 0.01, Tend = opts.Tend || 12, Tmax = Math.max(Tend, opts.Tmax || 60);   // run at least Tend (12 s, as the page), until settled, at most Tmax
    const light = !!opts.light;
    // wall grid, film step and footprint sample spacing; other values only for the convergence checks
    const NTH = opts.grid ? opts.grid[0] : NTH0, NS = opts.grid ? opts.grid[1] : NS0;
    // optional probes for the checks: called every time step and every film step; unused in the page
    const probe = typeof opts.probe === 'function' ? opts.probe : null, probeFilm = typeof opts.probeFilm === 'function' ? opts.probeFilm : null;
    // a dual-flush valve releases the partial volume from a full cistern: the head starts at the full level
    const Vfl = (p.flushMode === 'partial' ? Math.min(p.Vpart, p.Vfull) : p.Vfull) / 1000, Vcist0 = p.Vfull / 1000;
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
    // equivalent radius at depth z below the rim; below the static waterline the pool basin narrows as in the
    // level table (rAtLevel). The film centreline stays above the waterline, but a step can end slightly below it.
    const Rz = (z) => z <= Dw ? Rp + (Rr - Rp) * Math.cos(kz * z) : Rp * Math.max(0.35, 1 - 0.5 * (z - Dw) / g.ds);
    const dRz = (z) => z <= Dw ? -(Rr - Rp) * kz * Math.sin(kz * z) : (1 - 0.5 * (z - Dw) / g.ds > 0.35 ? -0.5 * Rp / g.ds : 0);   // dR/dz
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
    // map a point on (or near) the wall to its cell; the wall row at a depth comes from a table
    const NZR = 4096, rowZ = new Uint8Array(NZR + 1), zScale = NZR / g.D;
    const sZ = new Float64Array(NZR + 2);   // arc length down the wall at a depth, as a table
    for (let i = 0; i <= NZR + 1; i++) sZ[i] = sAtDepth(g, i / zScale);
    for (let i = 0; i <= NZR; i++) rowZ[i] = Math.min(NS - 1, (sZ[i] / dsb) | 0);
    const sOfZ = (z) => { const x = Math.max(0, Math.min(NZR, z * zScale)), i = x | 0; return sZ[i] + (x - i) * (sZ[i + 1] - sZ[i]); };
    const cellOf = (x, y, z) => {
      if (z < 0) return -1;
      const iz = z * zScale; const is = rowZ[iz >= NZR ? NZR : iz | 0];
      let a = Math.atan2(y * sE, x / sE); if (a < 0) a += TAU2;
      const it = Math.min(NTH - 1, (a / dth) | 0);
      return is * NTH + it;
    };
    const touched = [];
    let cur = 0;

    /* Wall film. Each jet is traced as a band along its centreline. The band's width lies across the flow in
       the wall's tangent plane and grows with the spreading rate ksp. Where the lower edge of the band meets
       the waterline, the submerged part of its width enters the pool there, with its flow, angular momentum
       and splash; only the part still above water goes on round the wall. Flow still on the wall when the
       film stalls or after 3 m of path counts as lost: it brings no swirl and no splash.
       The paths are retraced whenever jet speed or pool level has changed by more than a tolerance, and at
       least every tMaxR. In between, the flow, swirl and splash reaching the pool follow the nozzle flow at every
       time step (through the wall water store), and the shear dose of each interval is the mean of the footprints
       at its start and end. */
    const fixedEvery = opts.uEvery || 0;                              // fixed retrace interval in steps (checks only)
    // tolerance: jet speed change in %, pool level change in mm (filmTol 0 retraces every step, the reference)
    const tolS = opts.filmTol == null ? (opts.coarse ? 10 : 3) : opts.filmTol;
    const tolV = 0.01 * tolS, tolZ = 0.001 * tolS, tMaxR = opts.tMaxR || (opts.coarse ? 0.6 : 0.25);
    const film = { active: false, reach: 0, parcels: [], vjR: 0, zR: 0, tR: -1, nR: 0, lostQ: 0, allQ: 0, tStart: 0, tauMax: 0 };
    // parcels: where the flow leaving the nozzles now will reach the pool, and when. Each carries its share of the
    // total jet flow (q), its transit time on the wall (tau), its angular momentum per unit mass (L), and for the
    // splash term its entry velocity and position; flow lost on the wall has L = 0 and no splash.
    const lines = [];
    const dl = opts.filmStep || 0.006, samp = opts.sampleStep || 0.005, KMAX = Math.round(3 / dl);   // at most 3 m of path

    // stamp the film footprint: a segment of width w across the flow, centred at offset c from the point
    // centre of every wall cell (position on the wall, angle round the rim and depth), for the footprint test
    const ccx = new Float64Array(NC), ccy = new Float64Array(NC), ccz = new Float64Array(NC);
    for (let is = 0; is < NS; is++) {
      const zc = geomAt(g, (is + 0.5) * dsb).z, R = Rz(zc);
      for (let it = 0; it < NTH; it++) { const a = (it + 0.5) * dth, c = is * NTH + it; ccx[c] = R * sE * Math.cos(a); ccy[c] = R / sE * Math.sin(a); ccz[c] = zc; }
    }
    const stampCentres = opts.stamp !== 'samples';
    const angOf = (x, y) => { let a = Math.atan2(y * sE, x / sE); if (a < 0) a += TAU2; return a; };
    /* Footprint of one film step: the rectangle the band sweeps, from the current point along the flow (unit
       vector u) for one step length, and across the flow (unit vector d) over the band width. A wall cell counts
       as covered when its centre lies inside the rectangle and between the rim and the waterline. The covered
       area then converges as the wall grid is refined, and hardly depends on the film step. */
    // centre of the step in wall coordinates: xi round the rim (arc length), eta down the wall (arc length s)
    function markRect(x, y, z, ux, uy, uz, dx, dy, dz, w, len, tau, zStop) {
      const cx = x + 0.5 * len * ux, cy = y + 0.5 * len * uy, cz = Math.max(0, z + 0.5 * len * uz);
      const th = angOf(cx, cy), R = Rz(cz), sn = Math.sin(th), cs = Math.cos(th);
      const mt = R * Math.sqrt(E * sn * sn + cs * cs / E);                      // arc length per radian round the rim here
      let ex = -R * sE * sn, ey = R / sE * cs; const em = Math.hypot(ex, ey) || 1; ex /= em; ey /= em;   // along the rim
      wallNormal(cx, cy, cz, nrm);
      // down the wall, in the tangent plane: n x e_theta, pointing to greater depth
      let fx = nrm[1] * 0 - nrm[2] * ey, fy = nrm[2] * ex - nrm[0] * 0, fz = nrm[0] * ey - nrm[1] * ex;
      const fm = Math.hypot(fx, fy, fz) || 1; fx /= fm; fy /= fm; fz /= fm; if (fz < 0) { fx = -fx; fy = -fy; fz = -fz; }
      const uX = ux * ex + uy * ey, uE = ux * fx + uy * fy + uz * fz, dX = dx * ex + dy * ey, dE = dx * fx + dy * fy + dz * fz;
      const um = Math.hypot(uX, uE) || 1, dmn = Math.hypot(dX, dE) || 1;
      const u1 = uX / um, u2 = uE / um, d1 = dX / dmn, d2 = dE / dmn;
      const hl = 0.5 * len + 1e-9, hw = 0.5 * w + 1e-9, sc = sOfZ(cz);
      const ext = hl * Math.abs(u2) + hw * Math.abs(d2);
      const sStop = sOfZ(zStop);
      const r0 = Math.max(0, Math.floor((sc - ext) / dsb)), r1 = Math.min(NS - 1, Math.floor(Math.min(sc + ext, sStop) / dsb));
      for (let is = r0; is <= r1; is++) {
        const eta = (is + 0.5) * dsb - sc;
        if (ccz[is * NTH] >= zStop) continue;
        // xi range where the row cuts the rectangle {a u + b d : |a| <= hl, |b| <= hw}
        let xlo = Infinity, xhi = -Infinity;
        if (Math.abs(d2) > 1e-12) for (let k = -1; k <= 1; k += 2) { const a = k * hl, b = (eta - a * u2) / d2; if (b >= -hw && b <= hw) { const xi = a * u1 + b * d1; if (xi < xlo) xlo = xi; if (xi > xhi) xhi = xi; } }
        if (Math.abs(u2) > 1e-12) for (let k = -1; k <= 1; k += 2) { const b = k * hw, a = (eta - b * d2) / u2; if (a >= -hl && a <= hl) { const xi = a * u1 + b * d1; if (xi < xlo) xlo = xi; if (xi > xhi) xhi = xi; } }
        if (xlo > xhi) continue;
        const i0 = Math.ceil((th + xlo / mt) / dth - 0.5), i1 = Math.floor((th + xhi / mt) / dth - 0.5);
        for (let ii = i0; ii <= i1; ii++) {
          const it = ((ii % NTH) + NTH) % NTH, c = is * NTH + it;
          if (stamp[c] !== cur) { stamp[c] = cur; tauStep[c] = tau; touched.push(c); }
          else if (tau > tauStep[c]) tauStep[c] = tau;
        }
      }
    }
    function mark(x, y, z, dx, dy, dz, c, w, tau, zStop) {
      // only the part of the segment between the rim and the waterline is sampled
      let a0 = c - 0.5 * w, a1 = c + 0.5 * w;
      if (dz > 1e-9) { a0 = Math.max(a0, -z / dz); a1 = Math.min(a1, (zStop - 1e-9 - z) / dz); }
      else if (z < 0 || z >= zStop) return;
      if (a1 < a0) return;
      const n = Math.max(1, Math.ceil((a1 - a0) / samp));
      for (let i = 0; i <= n; i++) {
        const off = a0 + (a1 - a0) * i / n;
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
    const nrm = new Float64Array(5);

    function traceFilm(vj, Qj, z, t) {
      cur++; touched.length = 0; film.nR++;
      const rec = light ? null : { t, jets: [] };
      film.parcels.length = 0; film.reach = 0; film.tauMax = 0;
      film.vjR = vj; film.zR = z; film.tR = t;
      if (Qj < 2e-5 || vj < 0.05) { film.active = false; if (rec) lines.push(rec); return; }
      if (!film.active) film.tStart = t;   // the film front starts at the nozzles
      film.active = true;
      const front = t - film.tStart + 1e-9;   // how far (in travel time) the front has got since the film started
      const zStop = Math.max(0.002, Math.min(g.D, g.D - z));   // waterline depth below the rim
      const phase = (p.jetPhase || 0) * Math.PI / 180, qj = 1 / nJ;
      for (let j = 0; j < nJ; j++) {
        // nozzle on the rim ellipse, jet tangent to the rim and tilted down by alpha
        const th0 = phase + j * TAU2 / nJ, z0 = 0.004, R0 = Rz(z0);
        let x = R0 * sE * Math.cos(th0), y = R0 / sE * Math.sin(th0), zp = z0;
        let tx = -sE * Math.sin(th0), ty = Math.cos(th0) / sE; const tm = Math.hypot(tx, ty); tx /= tm; ty /= tm;
        let vx = vj * Math.cos(alpha) * tx, vy = vj * Math.cos(alpha) * ty, vz = vj * Math.sin(alpha);
        // the band starts on the wall only: a part of the nozzle width that would lie above the rim is folded
        // onto the wall, so the band is narrower and the film thicker, and no flow is lost
        wallNormal(x, y, zp, nrm);
        let dz0 = Math.abs(nrm[0] * vy - nrm[1] * vx) / vj;   // vertical part of the across-flow direction
        dz0 = Math.max(0.05, dz0);
        const top = Math.max(-0.5 * w0, (0.001 - z0) / dz0), wOn = 0.5 * w0 - top;
        zp = z0 + (top + 0.5 * wOn) * dz0;                    // centre of the band on the wall
        { const R1 = Rz(zp); x = R1 * sE * Math.cos(th0); y = R1 / sE * Math.sin(th0); }
        let w = wOn, f = 1;                                   // width of the band still on the wall; its share of the jet flow
        const pts = rec ? [] : null;
        const pushPt = () => { let a = Math.atan2(y * sE, x / sE); if (a < 0) a += TAU2; pts.push(x, y, a, sAtDepth(g, Math.max(0, zp))); };
        if (pts) pushPt();
        let drawnEnd = false, wDrawn = 0;
        // entering flow is gathered into a few parcels per jet for the splash term
        let eQ = 0, eL = 0, eT = 0, eVx = 0, eVy = 0, eVz = 0, eX = 0, eY = 0, tp = 0;   // tp: travel time from the nozzle
        const flush = () => { if (eQ > 0) { film.parcels.push({ q: eQ * qj, L: eL / eQ, tau: eT / eQ, splash: true, vx: eVx / eQ, vy: eVy / eQ, vz: eVz / eQ, x: eX / eQ, y: eY / eQ }); eQ = eL = eT = eVx = eVy = eVz = eX = eY = 0; } };
        for (let k = 0; k < KMAX; k++) {
          const U = Math.hypot(vx, vy, vz);
          if (U < 0.05) break;
          wallNormal(x, y, zp, nrm);
          let nx = nrm[0], ny = nrm[1], nz = nrm[2];
          const h = Math.min(hN, Qj * f / (U * w));
          const tau = 0.5 * RHO * p.cf * U * U;
          // across the flow: d = n x u_hat, pointing down the wall
          let dx = ny * vz - nz * vy, dy = nz * vx - nx * vz, dz = nx * vy - ny * vx;
          const dm = Math.hypot(dx, dy, dz) || 1; dx /= dm; dy /= dm; dz /= dm;
          if (dz < 0) { dx = -dx; dy = -dy; dz = -dz; }
          // share of the band's width below the waterline: that part enters the pool here, at the waterline radius,
          // and the band left on the wall is re-centred on what remains, so its centreline stays above the water
          const ez = Math.max(0.05, dz) * w, below = Math.min(1, Math.max(0, (zp + 0.5 * ez - zStop) / ez));
          if (below > 0) {
            const d = f * below, sc = Rz(zStop) / Rz(Math.min(zp, zStop)), Lz = Math.max(0, x * vy - y * vx) * sc;
            film.reach += qj * d;
            eQ += d; eL += d * Lz; eT += d * tp; eVx += d * vx; eVy += d * vy; eVz += d * vz; eX += d * x * sc; eY += d * y * sc;
            if (eQ >= 0.25) flush();
            f -= d;
            if (f < 0.02) {   // the last sliver enters with the rest
              film.reach += qj * f;
              eQ += f; eL += f * Lz; eT += f * tp; eVx += f * vx; eVy += f * vy; eVz += f * vz; eX += f * x * sc; eY += f * y * sc; f = 0; break;
            }
            const off = 0.5 * w * below;   // move the centreline up across the band to the middle of the part left
            x -= off * dx; y -= off * dy; zp = Math.max(0.001, zp - off * dz); w *= 1 - below;
            for (let it2 = 0; it2 < 2; it2++) { wallNormal(x, y, zp, nrm); const F = nrm[3], gm = nrm[4]; x -= F * nrm[0] / gm; y -= F * nrm[1] / gm; zp -= F * nrm[2] / gm; }
            wallNormal(x, y, zp, nrm);
            const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2]; vx -= vn * nrm[0]; vy -= vn * nrm[1]; vz -= vn * nrm[2];
            const Vm2 = Math.hypot(vx, vy, vz) || 1; vx *= U / Vm2; vy *= U / Vm2; vz *= U / Vm2;
            nx = nrm[0]; ny = nrm[1]; nz = nrm[2];
          }
          if (tp <= front) {   // only the wall the front has reached is wet
            if (stampCentres) markRect(x, y, zp, vx / U, vy / U, vz / U, dx, dy, dz, w, dl, tau, zStop);
            else mark(x, y, zp, dx, dy, dz, 0, w, tau, zStop);
          }
          const dtp = dl / U, af = p.cf * U / (2 * h);
          tp += dtp;
          // forces along the wall: gravity (+z is down) and wall friction against the velocity; the wall reaction
          // keeps the film on the wall and is taken into account by moving the velocity into the new tangent plane
          const ax0 = -af * vx, ay0 = -af * vy, az0 = G - af * vz, an = ax0 * nx + ay0 * ny + az0 * nz;
          const ax = ax0 - an * nx, ay = ay0 - an * ny, az = az0 - an * nz;
          const zOld = zp, dsStep = U * dtp, vx0 = vx, vy0 = vy, vz0 = vz;
          vx += ax * dtp; vy += ay * dtp; vz += az * dtp;
          // position with the mean of the old and new velocity (second order in the step)
          x += 0.5 * (vx0 + vx) * dtp; y += 0.5 * (vy0 + vy) * dtp; zp += 0.5 * (vz0 + vz) * dtp;
          // a film that climbs back to the rim meets the rim lip: its upward speed is lost there (inelastic)
          let hitRim = false;
          if (zp < 0.001) { zp = 0.001; if (vz < 0) { vz = 0; hitRim = true; } }
          // project back onto the wall (two Newton steps on F)
          for (let it2 = 0; it2 < 2; it2++) {
            wallNormal(x, y, zp, nrm);
            const F = nrm[3], gm = nrm[4];
            x -= F * nrm[0] / gm; y -= F * nrm[1] / gm; zp -= F * nrm[2] / gm;
          }
          // new speed from the energy balance over the step: work of gravity minus work of wall friction (the
          // wall reaction does no work)
          const Ut = Math.sqrt(Math.max(0, U * U + 2 * G * (zp - zOld) - 2 * af * U * dsStep));
          wallNormal(x, y, zp, nrm);
          // carry the velocity into the new tangent plane by the rotation that turns the old wall normal into the new one
          {
            let kx = ny * nrm[2] - nz * nrm[1], ky = nz * nrm[0] - nx * nrm[2], kz2 = nx * nrm[1] - ny * nrm[0];
            const sn = Math.hypot(kx, ky, kz2), cs = nx * nrm[0] + ny * nrm[1] + nz * nrm[2];
            if (sn > 1e-12) {
              kx /= sn; ky /= sn; kz2 /= sn;
              const kv = kx * vx + ky * vy + kz2 * vz, cx = ky * vz - kz2 * vy, cy = kz2 * vx - kx * vz, cz = kx * vy - ky * vx;
              vx = vx * cs + cx * sn + kx * kv * (1 - cs); vy = vy * cs + cy * sn + ky * kv * (1 - cs); vz = vz * cs + cz * sn + kz2 * kv * (1 - cs);
            }
          }
          const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];   // round-off only, and the rim lip
          vx -= vn * nrm[0]; vy -= vn * nrm[1]; vz -= vn * nrm[2];
          const Vm = Math.hypot(vx, vy, vz) || 1, Un = hitRim ? Math.min(Ut, Vm) : Ut;
          vx *= Un / Vm; vy *= Un / Vm; vz *= Un / Vm;
          if (probeFilm) probeFilm({ t, jet: j, k, x, y, z: zp, vx, vy, vz, f, w, zStop, cf: p.cf, h, hitRim });
          w += p.ksp * Un * dtp;
          // the drawn path is the centreline above water; it ends where the centreline meets the waterline
          if (pts && !drawnEnd) { if (zp >= zStop || tp > front) { pushPt(); drawnEnd = true; wDrawn = w; } else if (k % 3 === 0) pushPt(); }
        }
        flush();
        if (f > 0) film.parcels.push({ q: f * qj, L: 0, tau: tp, splash: false });   // lost on the wall: arrives without swirl or splash
        film.tauMax = Math.max(film.tauMax, tp);
        if (pts) { if (!drawnEnd) { pushPt(); wDrawn = w; } rec.jets.push({ pts, w: wDrawn }); }
      }
      if (rec) lines.push(rec);
    }
    /* Shear dose. Each interval between two traces gets the mean of the footprints at its start and end
       (trapezoidal rule in time), so the dose follows a moving film closely without tracing every step.
       When the film starts, the interval from the start counts the new footprint only from then on; when it
       stops (cistern empty), the last footprint counts for the whole last interval. */
    const pIdx = new Int32Array(NC), pTau = new Float32Array(NC); let pN = 0, pT = 0, pOn = false;
    function addDose(idx, tau, d, tA, tB) {
      if (tA < tWet[idx]) tWet[idx] = tA;
      const before = J[idx], add = Math.max(0, tau - p.tauC) * d;
      if (add <= 0) return;
      J[idx] = before + add;
      if (J[idx] >= p.Jcrit && tClean[idx] === Infinity) tClean[idx] = tA + (tB - tA) * Math.min(1, Math.max(0, (p.Jcrit - before) / add));
    }
    function doseInterval(t) {
      const D = t - pT;
      if (pOn && D > 0) {
        const wPrev = film.active ? 0.5 * D : D;
        for (let q = 0; q < pN; q++) addDose(pIdx[q], pTau[q], wPrev, pT, t);
        if (film.active) for (let q = 0; q < touched.length; q++) { const idx = touched[q]; addDose(idx, tauStep[idx], 0.5 * D, pT + 0.5 * D, t); }
      }
      // the new footprint becomes the start of the next interval
      pN = 0; pOn = film.active; pT = t;
      if (film.active) for (let q = 0; q < touched.length; q++) { const idx = touched[q]; pIdx[pN] = idx; pTau[pN] = tauStep[idx]; pN++; }
    }
    function needRetrace(n, t, vj, Qj, z) {
      if (film.tR < 0) return true;
      if (fixedEvery) return n % fixedEvery === 0;
      const on = !(Qj < 2e-5 || vj < 0.05);
      if (on !== film.active) return true;
      if (!on) return false;
      // while the film front is still growing along the path, trace more often so the wetted area follows it
      const tMx = t - film.tStart < film.tauMax ? Math.min(tMaxR, opts.coarse ? 0.2 : 0.1) : tMaxR;
      return Math.abs(vj / film.vjR - 1) > tolV || Math.abs(z - film.zR) > tolZ || t - film.tR >= tMx - 1e-9;
    }

    let Vc = Vcist0, Vgo = Vfl, Vrel = 0, L = 0, phi = 0;   // cistern content; volume still to be released
    let primed = false, Vt = 0, primeT = null, breakT = null, everPrimed = false, nPrimes = 0;
    // bowl refill (siphonic): after the valve has closed, the fill valve's refill tube runs into the bowl
    const Vref0 = siph ? Math.max(0, p.refill) / 1000 : 0, qRef = (p.qRefill || 0.1) / 1000;
    let VrefLeft = Vref0, Vref = 0;
    const Vbrk = volAtLevel(g, -ds);   // pool volume when the level reaches the trap inlet
    /* Film transit. The water on the wall is a store: it tends to the steady amount for the current paths (nozzle
       flow times travel time) with the flow-weighted mean travel time as time constant, and nothing reaches the
       pool before the film front has got there. When the pool rises and the paths get shorter, the store drains
       faster; when the cistern stops, it drains out. What arrives carries the current mean angular momentum and
       entry velocity of the films. */
    let Vtransit = 0, tauM = 0, tauMin = 0, Lm = 0, sShare = 0, mVx = 0, mVy = 0, mVz = 0, mX = 0, mY = 0;
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
      if (t > Tend && tEmpty !== null && t > tEmpty + 6 && VrefLeft <= 1e-9 && Vtransit <= 1e-9) break;
      if (t > Tmax) break;
      // cistern and jets
      const open = Vgo > 1e-7 ? Math.min(1, t / p.tOpen) : 0;
      const H = Vc / p.Acist + Hcr;
      const vj = open * Math.sqrt(2 * G * H / (1 + p.Kpath));
      let Qin = nJ * An * vj, capped = false;
      if (Qin * dt > Vgo) { Qin = Vgo / dt; capped = true; }   // last step of the flush: only what is left
      if (Vgo > 1e-7 && Vgo - Qin * dt <= 1e-7 && tEmpty === null) tEmpty = t + dt;   // valve closes: flush released
      Vgo = Math.max(0, Vgo - Qin * dt); Vc = Math.max(0, Vc - Qin * dt); Vin += Qin * dt;
      // refill into the bowl once the valve has closed
      let Qref = 0;
      if (VrefLeft > 0 && tEmpty !== null && t >= tEmpty) { Qref = Math.min(qRef, VrefLeft / dt); VrefLeft -= Qref * dt; Vref += Qref * dt; }

      if (Qin > Qpeak) Qpeak = Qin;

      const z = levelFromVol(g, Vrel);
      // the capped last step keeps the films traced at full flow (its small flow would give a slow, thin film)
      if (!capped && needRetrace(n, t, vj, Qin / nJ, z)) { traceFilm(vj, Qin / nJ, z, t); doseInterval(t); }
      if (film.active) { film.allQ += Qin * dt; film.lostQ += Qin * Math.max(0, 1 - film.reach) * dt; }
      // mean properties of the current films (kept from the last trace once the jets have stopped)
      if (film.active && film.tR === t) {
        let sq = 0, st = 0, sl = 0, ss = 0, vx_ = 0, vy_ = 0, vz_ = 0, x_ = 0, y_ = 0, tmin = Infinity;
        for (const pc of film.parcels) {
          sq += pc.q; st += pc.q * pc.tau; sl += pc.q * pc.L; if (pc.tau < tmin) tmin = pc.tau;
          if (pc.splash) { ss += pc.q; vx_ += pc.q * pc.vx; vy_ += pc.q * pc.vy; vz_ += pc.q * pc.vz; x_ += pc.q * pc.x; y_ += pc.q * pc.y; }
        }
        if (sq > 0) { tauM = st / sq; tauMin = tmin; Lm = sl / sq; sShare = ss / sq; }
        if (ss > 0) { mVx = vx_ / ss; mVy = vy_ / ss; mVz = vz_ / ss; mX = x_ / ss; mY = y_ / ss; }
      }
      let Qarr;
      if (!film.active && film.tR < 0) Qarr = Qin;                     // no film traced yet
      else if (film.active && t - film.tStart < tauMin) Qarr = 0;      // front not yet at the pool
      else {
        const Vtgt = film.active ? Qin * tauM : 0, T = Math.max(dt, tauM);
        Qarr = Math.max(0, Math.min(Qin + Vtransit / dt, Qin + (Vtransit - Vtgt) / T));
      }
      if (!film.active && Qin > 0 && film.tR >= 0 && tauM === 0) Qarr = Qin;   // a film too weak to trace delivers directly
      Vtransit = Math.max(0, Vtransit + (Qin - Qarr) * dt);
      const Larr = Qarr * Lm, Qs = Qarr * sShare, aVx = mVx, aVy = mVy, aVz = mVz, aX = mX, aY = mY;
      const Qpin = Qarr + Qref;   // flow reaching the pool this step

      // outflow, pool level and swirl. When a large share of the pool would leave within one step (a primed siphon
      // drawing a small pool down to the trap inlet), the step is split into sub-steps, so the level, the break
      // and the spin-up of the shrinking pool do not depend on the time step.
      const Tin = p.eta * RHO * Larr;   // swirl brought by the film arriving now (lost flow brings none)
      const Vp0 = Math.max(1e-9, g.Vstatic + Vrel), Qest = siph && primed ? At * Math.sqrt(2 * G * Math.max(0, z + Hs) / p.Ks) : 0;
      const nSub = Qest > 0 ? Math.min(40, Math.max(1, Math.ceil(Qest * dt / (0.02 * Vp0)))) : 1, hs = dt / nSub;
      let Qw = 0, Qout = 0, Qtrans = 0, Tout = 0, Tf = 0, Vpool = Vp0, Rc = g.rAtLevel(z), I = 1e-12, om = 0;
      for (let sb = 0; sb < nSub; sb++) {
        const zS = sb === 0 ? z : levelFromVol(g, Vrel), tS = t + sb * hs;
        const qw = zS > 0 ? p.Cweir * Lw * Math.pow(zS, 1.5) : 0;
        let qo, qt;
        if (!siph) {
          const Qcap = 0.6 * At * Math.sqrt(2 * G * (Math.max(zS, 0) + ds));
          qo = Math.min(qw, Qcap); qt = qo;
        } else if (!primed) {
          qo = qw; qt = qw;
          if (qw > Qg) Vt += (qw - Qg) * hs; else Vt = Math.max(0, Vt - (Qg - qw) * hs);
          if (Vt >= Vtrap) { primed = true; everPrimed = true; nPrimes++; if (primeT === null) primeT = tS; }
        } else {
          // primed siphon; a sub-step that would draw the pool below the trap inlet ends exactly at the inlet,
          // and the siphon breaks there (air enters the leg)
          const Qfull = At * Math.sqrt(2 * G * Math.max(0, zS + Hs) / p.Ks);
          qo = Qfull;
          if (Vrel + (Qpin - Qfull) * hs <= Vbrk) {
            qo = Math.max(0, Qpin + (Vrel - Vbrk) / hs);
            Qbrk = Qfull; tBrk = tS; breakT = tS; primed = false; Vt = 0;
          }
          qt = qo;
        }
        // the pool can never hold less than its basin: outflow is limited instead (no water is created)
        if (Vrel + (Qpin - qo) * hs < g.vt[0]) { qo = Math.max(0, Qpin + (Vrel - g.vt[0]) / hs); qt = Math.min(qt, qo); }
        Vrel += (Qpin - qo) * hs;
        if (Vrel > g.Vrim) { Vspill += Vrel - g.Vrim; Vrel = g.Vrim; if (overflowT === null) overflowT = tS; }   // water over the rim
        // swirl of the pool as a solid body, with the level after this sub-step's flows
        const zN = levelFromVol(g, Vrel);
        Vpool = Math.max(1e-9, g.Vstatic + Vrel); Rc = g.rAtLevel(zN);
        I = Math.max(1e-12, 0.25 * RHO * (E + 1 / E) * q4AtLevel(g, zN));   // integrated over the narrowing basin
        om = L / I;
        const to = (qo / Vpool) * L;
        const Awet = Math.PI * Rc * Rc + perimF * TAU2 * Rc * (ds + 0.03 + Math.max(zN, 0));
        const tf = 0.5 * RHO * p.cfp * ovPen * Awet * (om * Rc) ** 2 * Rc;
        L = Math.max(0, L + (Tin - to - tf) * hs);
        Qw += qw / nSub; Qout += qo / nSub; Qtrans += qt / nSub; Tout += to / nSub; Tf += tf / nSub;
      }
      om = L / I; phi += om * dt;
      const vs = om * Rc, dip = vs * vs / (2 * G);
      // peak swirl and vortex dip are taken while the trap carries flow: after a siphon break the sump left in the
      // bowl can spin up strongly while nothing drains, a state the solid-body pool does not describe well and in
      // which swirl affects neither waste transport nor the air core
      if (Qout > 1e-6) { if (vs > vsPeak) vsPeak = vs; if (dip > dipPeak) dipPeak = dip; }
      if (z > zPeak) zPeak = z;

      // noise indicator. Every source is written as a flow of air into the water (m3/s), weighted by the
      // sound it makes per unit of air: 1 for fine splash bubbles, wTrap for large air pockets in the trap.
      // The weighted sum stands for radiated sound power and is only used relative to a reference.
      // 1 jet films plunging into the pool, speed relative to the local surface velocity of the rotating pool
      s1L[0] = s1L[1] = s1L[2] = 0;
      if (Qs > 0) {   // film arriving now, with its flow-weighted mean entry velocity
        const ur = Math.hypot(aVx + om * aY, aVy - om * aX, aVz);   // pool surface moves at om x r
        for (let k = 0; k < 3; k++) s1L[k] += ent(Qs, ur, UeL[k]);
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
      const s4 = !primed && tBrk !== null && t >= tBrk ? Qbrk * Math.exp(-(t - tBrk) * Qbrk / Math.max(1e-9, Vtrap)) : 0;
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
      if (probe) probe({ n, t, dt, Vc, Vgo, vj, Qin, Qarr, Vtransit, tauM, Qref, Qpin, z, Vrel, Qw, Qout, Qtrans, primed, Vt, Vpool, Rc, I, L, Tin, Tout, Tf, om, Ms, Np, ut, fS, fP, Cs, Vspill });

      if (rec && n % 2 === 0) {
        rec.t.push(t); rec.Qin.push(Qin * 1000); rec.Qout.push(Qout * 1000); rec.z.push(z * 1000);
        rec.Vc.push(Vc * 1000); rec.vs.push(vs); rec.phi.push(phi); rec.Ms.push(Ms); rec.Np.push(Np);
        rec.primed.push(primed ? 1 : 0); rec.Vt.push(Vt / Math.max(1e-9, Vtrap));
        nrec.t.push(t); nrec.L.push(10 * Math.log10(WfV[0] + 1e-12)); nrec.pl.push(Wsrc[0]); nrec.out.push(Wsrc[1]); nrec.air.push(Wsrc[2]); nrec.brk.push(Wsrc[3]); nrec.core.push(core ? 1 : 0);
        for (let v = 0; v < NV; v++) nrec.Lv[v].push(10 * Math.log10(WfV[v] + 1e-12));
      }
    }

    if (pOn) { film.active = false; doseInterval(tEnd + dt); }   // a film still running at the end (unfinished flush)
    // seal after flush, including bowl refill
    // seal after the flush: the simulated level at the end, refill included
    const zEnd = levelFromVol(g, Vrel);
    const sealEnd = siph ? Math.max(0, Math.min(ds, ds + Math.min(0, zEnd))) * 1000 : ds * 1000;

    // cleaning metrics
    let Atot = 0, Aclean = 0, Awet = 0;
    for (let i = 0; i < NC; i++) { Atot += cellA[i]; if (J[i] >= p.Jcrit) Aclean += cellA[i]; if (tWet[i] < Infinity) Awet += cellA[i]; }
    // rim line: the share of the line exactly 25 mm below the rim (by length round the bowl) that is cleaned
    const lineRow = rowZ[Math.min(NZR, (0.025 * zScale) | 0)];
    let lineHit = 0, lineLen = 0;
    for (let it = 0; it < NTH; it++) {
      const a = (it + 0.5) * dth, wl = Math.sqrt(E * Math.sin(a) ** 2 + Math.cos(a) ** 2 / E);   // length per angle on the ellipse
      lineLen += wl; if (J[lineRow * NTH + it] >= p.Jcrit) lineHit += wl;
    }

    const incomplete = Vgo > 1e-6;   // flush still not released at Tmax
    const water = (Vin + Vref) * 1000;   // water actually released, plus the bowl refill that ran in
    const out = {
      p, geom: g, NTH, NS, dsb,
      cleanPct: 100 * Aclean / Atot, wetPct: 100 * Awet / Atot, linePct: 100 * lineHit / lineLen, lineDepthS: sAtDepth(g, 0.025),
      solidsPct: p.Ms > 0 ? 100 * (1 - Ms / p.Ms) : 100, paperPct: p.Np > 0 ? 100 * (1 - Np / p.Np) : 100,
      capS, water, flushVol: Vfl * 1000, Qpeak: Qpeak * 1000, tEmpty, vsPeak, zPeak: zPeak * 1000, dipPeak: dipPeak * 1000,
      primeT, breakT, everPrimed, sealEnd, sealOK: sealEnd >= p.sealMin - 0.5, zEnd: zEnd * 1000,
      tEnd, incomplete, cisternLeft: Vgo * 1000, nPrimes, refillIn: Vref * 1000, overflow: overflowT !== null, overflowT, spill: Vspill * 1000, valid: overflowT === null && !incomplete,
      cleanPerL: 100 * Aclean / Atot / water,
      filmLostPct: film.allQ > 0 ? 100 * film.lostQ / film.allQ : 0, filmRetraces: film.nR,
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
    if (!light) Object.assign(out, { J, tWet, tClean, lines, rec, nrec });
    out.runMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return out;
  }

  root.FlushModel = { simulate, defaults, PRESETS, COEFFS, buildGeom, geomAt, sAtDepth, levelFromVol, volAtLevel, q4AtLevel, coreFactor, rankineF, noiseCorners, NTH: NTH0, NS: NS0 };
})(typeof window !== 'undefined' ? window : globalThis);
