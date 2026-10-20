// Physics checks (node checks/physics.js). Each check prints what it compares and a limit; the script exits
// with code 1 if any check fails. These checks show that the model implements its own equations correctly
// and integrates them accurately. They do not show that the equations describe a real bowl: that needs
// calibration against CFD or rig data.
//
// A  Conservation and balance: energy and angular momentum of a frictionless film, water balance, physical
//    ranges of all state variables, and smoothness of results under small design changes.
// B  Closed-form cases: cistern drain, steady pool level at constant inflow, level table, film on a vertical
//    cylinder, waste removal at constant trap flow.
// C  Independent re-integration: the pool volume and the pool swirl equations integrated again with a
//    fourth-order Runge-Kutta scheme at a twenty times finer step, from the model's own inputs.
const { loadModel, rng, fullDesign, q } = require('./lib');
const M = loadModel(), G = 9.81, RHO = 1000;
const results = [], known = [], STRICT = process.argv.includes('--strict');
// known: a reference to a documented, open model issue; such a check is reported but does not fail the run,
// except with --strict (to be used before a release, so that an open issue cannot pass unnoticed)
function check(name, value, limit, unit, detail, knownIssue) {
  const ok = Number.isFinite(value) && Math.abs(value) <= limit;
  if (!ok && knownIssue) known.push(name); else results.push(ok);
  console.log(`${ok ? 'PASS' : knownIssue ? 'KNOWN' : 'FAIL'} ${name}: ${fmt(value)} ${unit} (limit ${limit} ${unit})${detail ? ' · ' + detail : ''}${!ok && knownIssue ? ' · open issue: ' + knownIssue : ''}`);
}
const fmt = (v) => (Math.abs(v) >= 100 || v === 0 ? v.toFixed(1) : v.toPrecision(3));
const sim = (p, o) => M.simulate(p, Object.assign({ light: true, Tend: 12 }, o));
const design = (kind, extra) => Object.assign(M.defaults(kind), extra || {});

console.log('A · Conservation and balance');
// A1 frictionless film in a round bowl: speed from gravity alone, angular momentum about the axis constant.
// Checked while the whole band is still on the wall: once part of it enters the pool, the band is re-centred on
// what is left, and the traced point is no longer one water particle. A deep bowl and a narrow nozzle keep
// the band on the wall for a long path.
for (const alpha of [0, 10, 25]) {
  let rec = [], tPick = null;
  sim(design('washdown', { cf: 1e-9, ovality: 1, alpha, Dwall: 200, Anoz: 1.5, hNoz: 15, ksp: 0.05, Ms: 0, Np: 0 }), { Tend: 2, Tmax: 2, probeFilm: (s) => {
    if (s.jet !== 0 || s.t < 0.5) return;
    if (tPick === null) tPick = s.t;
    if (s.t === tPick && s.f >= 1 - 1e-12) rec.push(s);
  } });
  // energy is checked up to the first contact with the rim lip, where the film loses its upward speed by design
  const firstHit = rec.findIndex((s) => s.hitRim), recE = firstHit < 0 ? rec : rec.slice(0, firstHit);
  const E = (s) => 0.5 * (s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) - G * s.z, L = (s) => s.x * s.vy - s.y * s.vx;
  const KE0 = 0.5 * (rec[0].vx ** 2 + rec[0].vy ** 2 + rec[0].vz ** 2);
  const dE = Math.max(...recE.map((s) => Math.abs(E(s) - E(rec[0])))) / KE0, dL = Math.max(...rec.map((s) => Math.abs(L(s) / L(rec[0]) - 1)));
  check(`A1 frictionless film, round bowl, jet angle ${alpha}°: energy drift`, 100 * dE, 0.1, '% of kinetic energy', `${recE.length} steps${firstHit >= 0 ? ', up to the first rim contact' : ''}`);
  check(`A1 frictionless film, round bowl, jet angle ${alpha}°: angular momentum drift`, 100 * dL, 0.5, '%', `${(rec.length * 0.006).toFixed(2)} m of path`);
}
// A2 water balance: released water = water out of the trap + change of the pool + spilled water
{
  const r0 = rng(21); let worst = 0, n = 0;
  const cases = [design('washdown'), design('siphonic'), design('washdown', { flushMode: 'partial' }), design('washdown', { Vfull: 7, Anoz: 8, dTrap: 38, nJets: 3 })];
  for (let i = 0; i < 60; i++) cases.push(fullDesign(M, r0));
  for (const p of cases) {
    let vin = 0, vout = 0, V0 = null, V1 = 0, spill = 0;
    sim(p, { probe: (s) => { if (V0 === null) V0 = s.Vrel - (s.Qpin - s.Qout) * s.dt; vin += s.Qpin * s.dt; vout += s.Qout * s.dt; V1 = s.Vrel; spill = s.Vspill; } });
    worst = Math.max(worst, Math.abs(vin - vout - (V1 - V0) - spill) * 1e6); n++;
  }
  check('A2 water balance, worst of ' + n + ' designs (incl. an overflowing one)', worst, 1, 'mL');
}
// A3 every state variable stays in its physical range, over random designs
{
  const r0 = rng(22); let bad = 0, n = 0, what = '';
  for (let i = 0; i < 80; i++) {
    const p = fullDesign(M, r0); let Ms0 = Infinity, Np0 = Infinity;
    sim(p, { probe: (s) => {
      n++;
      const tests = [['cistern volume', s.Vc >= -1e-12], ['inflow', s.Qin >= 0], ['outflow', s.Qout >= 0], ['swirl', s.L >= 0 && s.om >= 0], ['solids left', s.Ms >= 0 && s.Ms <= Ms0 + 1e-9], ['paper left', s.Np >= 0 && s.Np <= Np0 + 1e-9], ['finite', [s.z, s.L, s.Qout, s.Tf].every(Number.isFinite)]];
      for (const [k, okk] of tests) if (!okk) { bad++; what = k; }
      Ms0 = s.Ms; Np0 = s.Np;
    } });
  }
  check(`A3 state variables out of range, ${n} time steps of 80 random designs`, bad, 0, 'steps', bad ? 'first problem: ' + what : 'cistern, flows, swirl, waste, finiteness');
}
// A4, A5 smoothness: small design changes give small result changes. A large step between neighbouring designs
// is resampled 10 and then 100 times finer: if the change stays concentrated in one tiny interval it is a jump
// (discontinuity); if it spreads out, the result is steep but continuous there and the step is not counted.
// A jump that remains is run again with a 2 ms time step: if it then shrinks to less than half, it is time-step
// jitter (two events, such as the valve closing and the siphon breaking, falling into the same 10 ms step) and
// is checked against its own limit. Steps where a siphon switches between priming and not priming are left out,
// since the bowl really behaves differently there.
function smoothScan(kind, metric, lim, scans, extra) {
  const run = (k, v, o) => sim(design(kind, Object.assign({ [k]: v }, extra ? extra(k) : {})), o);
  const val = (k, v, o) => { const r = run(k, v, o); return [metric(r), r.everPrimed]; };
  const refined = (k, a, b) => {
    let lo = a, hi = b;
    for (let lev = 0; lev < 2; lev++) {
      let best = -1, ba = lo, bb = hi, prev = val(k, lo);
      for (let i = 1; i <= 10; i++) { const x = lo + (hi - lo) * i / 10, fx = val(k, x); if (fx[1] === prev[1]) { const d = Math.abs(fx[0] - prev[0]); if (d > best) { best = d; ba = lo + (hi - lo) * (i - 1) / 10; bb = x; } } prev = fx; }
      if (best < 0) return { jump: 0, jitter: 0 };   // the interval only holds a priming switch
      lo = ba; hi = bb;
    }
    const a10 = val(k, lo), b10 = val(k, hi), j10 = Math.abs(b10[0] - a10[0]);
    const j2 = Math.abs(val(k, hi, { dt: 0.002 })[0] - val(k, lo, { dt: 0.002 })[0]);
    return j10 <= lim ? { jump: j10, jitter: 0 } : j2 < 0.5 * j10 ? { jump: 0, jitter: j10 } : { jump: j10, jitter: 0 };
  };
  let worst = 0, where = '', steep = 0, jit = 0, jitWhere = '';
  for (const [k, a, b, st] of scans) {
    let pv = null, px = null;
    for (let v = a; v <= b + 1e-9; v += st) {
      const x = +v.toFixed(4), r = val(k, x);
      if (pv !== null && pv[1] === r[1]) {
        const d = Math.abs(r[0] - pv[0]);
        if (d > lim) {
          const rf = refined(k, px, x);
          if (rf.jump > worst) { worst = rf.jump; where = `${k} ${px} to ${x}`; }
          if (rf.jitter > jit) { jit = rf.jitter; jitWhere = `${k} ${px} to ${x}`; }
          if (rf.jump <= lim && rf.jitter === 0) steep++;
        } else if (d > worst) { worst = d; where = `${k} ${x}`; }
      }
      pv = r; px = x;
    }
  }
  return { worst, where, steep, jit, jitWhere };
}
{
  const scans = [['Hcr', 100, 600, 2], ['alpha', 0, 35, 0.2], ['Anoz', 1.5, 8, 0.05], ['jetPhase', 0, 180, 1]];
  for (const kind of ['washdown', 'siphonic']) {
    const r = smoothScan(kind, (x) => x.vsPeak, 0.03, scans, (k) => ({ ovality: k === 'jetPhase' ? 1.3 : 1 }));
    const kn = null;   // no open issue: the siphonic jumps found earlier came from the capped last flush step
    check(`A4 ${kind}: largest jump in peak pool swirl between neighbouring designs`, r.worst, 0.03, 'm/s', `at ${r.where}; ${r.steep} steep but continuous step${r.steep === 1 ? '' : 's'} resolved by refining`, kn);
    check(`A4 ${kind}: largest time-step jitter in peak pool swirl`, r.jit, 0.05, 'm/s', r.jit > 0 ? `at ${r.jitWhere}; it shrinks to less than half with a 2 ms step` : 'none found', kn);
  }
}
{
  const scans = [['Anoz', 1.5, 8, 0.05], ['Hcr', 100, 600, 2], ['Vfull', 3, 7, 0.05], ['dTrap', 38, 65, 0.5]];
  const M5 = [['cleaning', (x) => x.cleanPct, 3, 'points'], ['solids removed', (x) => x.solidsPct, 3, 'points'], ['paper removed', (x) => x.paperPct, 3, 'points'], ['seal after flush', (x) => x.sealEnd, 3, 'mm'], ['noise peak', (x) => x.noise.peak, 1, 'dB']];
  for (const kind of ['washdown', 'siphonic']) for (const [lab, fn, lim, u] of M5) {
    if (kind === 'washdown' && lab === 'seal after flush') continue;   // a washdown seal is always full
    const r = smoothScan(kind, fn, lim, scans);
    check(`A5 ${kind}: largest jump in ${lab} between neighbouring designs`, r.worst, lim, u, `at ${r.where}; ${r.steep} steep but continuous step${r.steep === 1 ? '' : 's'} resolved by refining`);
    check(`A5 ${kind}: largest time-step jitter in ${lab}`, r.jit, 2 * lim, u, r.jit > 0 ? `at ${r.jitWhere}` : 'none found');
  }
}

console.log('\nB · Closed-form cases');
// B1 cistern drain. With head h = V/A + Hcr and jet speed sqrt(2 g h / (1 + K)) times the valve opening s(t) = t / t_open,
// sqrt(h) falls as c t² / (4 A t_open) while the valve opens and linearly as c t / (2 A) after, with c = n A_noz sqrt(2 g / (1 + K)).
{
  const p = design('washdown', { Ms: 0, Np: 0 }), A = p.Acist, c = p.nJets * p.Anoz * 1e-4 * Math.sqrt(2 * G / (1 + p.Kpath)), tO = p.tOpen;
  const h0 = p.Vfull / 1000 / A + p.Hcr / 1000, sq1 = Math.sqrt(h0) - c * tO / (4 * A);
  const sqh = (t) => (t <= tO ? Math.sqrt(h0) - c * t * t / (4 * A * tO) : sq1 - c * (t - tO) / (2 * A));
  const tEmptyA = tO + 2 * A * (sq1 - Math.sqrt(p.Hcr / 1000)) / c;
  let worst = 0; const r = sim(p, { probe: (s) => { const t = s.t + s.dt, Va = Math.max(0, (sqh(t) ** 2 - p.Hcr / 1000) * A); if (s.Vc > 0) worst = Math.max(worst, Math.abs(s.Vc - Va) * 1e6); } });
  check('B1 cistern drain: volume against the closed form, worst', worst, 15, 'mL', `of ${p.Vfull} L`);
  check('B1 cistern drain: time to empty against the closed form', r.tEmpty - tEmptyA, 0.02, 's', `closed form ${tEmptyA.toFixed(3)} s, model ${r.tEmpty.toFixed(3)} s`);
}
// B2 steady pool level at constant inflow (cistern made very large): weir flow C L z^1.5 = Q gives z = (Q / (C L))^(2/3)
for (const Hcr of [100, 200]) {
  const p = design('washdown', { Acist: 1000, Hcr, Vfull: 400, Ms: 0, Np: 0 }); let last = null;   // a very large cistern: constant head and flow
  sim(p, { Tend: 30, Tmax: 30, probe: (s) => { if (s.t >= 25 && !last) last = s; } });
  const zA = Math.pow(last.Qin / (p.Cweir * p.Lweir / 1000), 2 / 3), cap = 0.6 * Math.PI * (p.dTrap / 2000) ** 2 * Math.sqrt(2 * G * (zA + p.seal / 1000));
  if (cap < last.Qin) console.log(`  (B2 at valve height ${Hcr} mm: trapway limits the flow, weir case not applicable)`);
  else check(`B2 steady pool level at ${(last.Qin * 1000).toFixed(2)} L/s inflow, valve height ${Hcr} mm`, (last.z - zA) * 1000, 0.1, 'mm', `closed form ${(zA * 1000).toFixed(2)} mm, model ${(last.z * 1000).toFixed(2)} mm`);
}
// B3 level table: pool volume above and below the weir crest against the closed-form integral of π r(z)²
{
  const p = design('washdown'), g = M.buildGeom(p), Rp = g.Rp, dR = g.Rr - g.Rp, D = g.D, k = Math.PI / (2 * D), ds = g.ds, cc = 0.5 / ds;
  const F = (u) => Rp * Rp * u + 2 * Rp * dR * Math.sin(k * u) / k + dR * dR * (u / 2 + Math.sin(2 * k * u) / (4 * k));
  const zf = -1.3 * ds;   // below this the basin keeps 0.35 of the pool radius
  const Vabove = (z) => Math.PI * (F(D) - F(D - z));
  const Vbelow = (z) => { const z1 = Math.max(z, zf); let V = -Math.PI * Rp * Rp * (1 - (1 + cc * z1) ** 3) / (3 * cc); if (z < zf) V -= Math.PI * (0.35 * Rp) ** 2 * (zf - z); return V; };
  let worst = 0;
  for (let z = g.zMin + 0.002; z < D - 0.002; z += 0.001) { const V = z >= 0 ? Vabove(z) : Vbelow(z); worst = Math.max(worst, Math.abs(M.levelFromVol(g, V) - z) * 1000); }
  check('B3 level table: level from volume against the closed-form volume, worst', worst, 0.05, 'mm', `trap inlet to rim, washdown preset`);
}
// B4 frictionless film on a vertical cylinder (rim and pool radius equal, flat jet): it circles at constant speed round
// the bowl and falls freely, depth z = z0 + vz0 t + g t² / 2 with t = arc length round the wall / tangential speed
{
  let rec = [], tPick = null;
  sim(design('washdown', { Rrim: 150, Rpool: 150, Dwall: 200, cf: 1e-9, alpha: 0, ovality: 1, Anoz: 1.5, hNoz: 15, ksp: 0.01, Ms: 0, Np: 0 }), { Tend: 1, Tmax: 1, probeFilm: (s) => {
    if (s.jet !== 0 || s.t < 0.3) return; if (tPick === null) tPick = s.t; if (s.t === tPick && s.f >= 1 - 1e-12) rec.push(s);
  } });
  const s0 = rec[0], R = Math.hypot(s0.x, s0.y), ut = Math.abs(s0.x * s0.vy - s0.y * s0.vx) / R; let worst = 0, wu = 0, phi = 0, a0 = Math.atan2(s0.y, s0.x);
  for (const s of rec) { let a = Math.atan2(s.y, s.x), da = a - a0; while (da < -Math.PI) da += 2 * Math.PI; while (da > Math.PI) da -= 2 * Math.PI; phi += da; a0 = a;
    const t = R * Math.abs(phi) / ut, zA = s0.z + s0.vz * t + 0.5 * G * t * t; worst = Math.max(worst, Math.abs(s.z - zA) * 1000);
    wu = Math.max(wu, Math.abs(Math.abs(s.x * s.vy - s.y * s.vx) / Math.hypot(s.x, s.y) / ut - 1)); }
  check('B4 film on a vertical cylinder: depth against free fall, worst', worst, 0.3, 'mm', `${rec.length} steps, ${(s0.z * 1000).toFixed(0)} to ${(rec[rec.length - 1].z * 1000).toFixed(0)} mm deep`);
  check('B4 film on a vertical cylinder: tangential speed change', 100 * wu, 0.5, '%');
}
// B5 waste removal at constant trap flow: with the transport factor and swirl term constant, paper decays as
// exp(-k_P f_P (phi0 + (1 - phi0) C_s) t); the model's per-step decay is compared with the exact exponential
{
  const p = design('washdown', { Acist: 1000, Hcr: 400, Vfull: 400, Np: 10, Ms: 50 }); let worst = 0, prev = null;
  sim(p, { Tend: 20, Tmax: 20, probe: (s) => {
    if (prev && prev.Np > 1e-6 && s.Np > 1e-9) { const rate = p.kP * s.fP * (p.phi0 + (1 - p.phi0) * s.Cs); const exact = prev.Np * Math.exp(-rate * s.dt); worst = Math.max(worst, Math.abs(s.Np - exact) / prev.Np); }
    prev = s;
  } });
  check('B5 paper removal per step against the exact exponential, worst', 100 * worst, 0.1, '% of the paper left');
}

console.log('\nC · Independent re-integration (RK4, step 20 times finer)');
// C1 pool volume: dV/dt = Q_in(t) - Q_out(z(V)), with the model's inflow and the washdown outflow law
// C2 pool swirl: dL/dt = T_in(t) - (Q_out / V) L - b(t) L², with b = T_f / L² taken from the model at each step
for (const kind of ['washdown', 'siphonic']) {
  const p = design(kind, { Ms: 0, Np: 0 }), g = M.buildGeom(p), steps = [];
  sim(p, { probe: (s) => steps.push(s) });
  const Lw = p.Lweir / 1000, At = Math.PI * (p.dTrap / 2000) ** 2, ds = g.ds;
  const Qo = (z) => { const Qw = z > 0 ? p.Cweir * Lw * Math.pow(z, 1.5) : 0; return Math.min(Qw, 0.6 * At * Math.sqrt(2 * G * (Math.max(z, 0) + ds))); };
  if (kind === 'washdown') {
    let V = 0, worst = 0;
    for (const s of steps) {
      const h = s.dt / 20;
      for (let i = 0; i < 20; i++) {
        const f = (v) => s.Qpin - Qo(M.levelFromVol(g, v));
        const k1 = f(V), k2 = f(V + h / 2 * k1), k3 = f(V + h / 2 * k2), k4 = f(V + h * k3);
        V += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      }
      worst = Math.max(worst, Math.abs(M.levelFromVol(g, V) - M.levelFromVol(g, s.Vrel)) * 1000);
    }
    check('C1 washdown pool level against RK4 re-integration, worst', worst, 1, 'mm');
  }
  let L = 0, worstL = 0, peak = 0;
  for (const s of steps) {
    const a = s.Qout / s.Vpool, b = s.L > 1e-12 ? s.Tf / (s.L * s.L) : (s.om > 0 ? s.Tf / (s.om * s.I) ** 2 : 0);
    const bb = Number.isFinite(b) ? b : 0, h = s.dt / 20;
    for (let i = 0; i < 20; i++) {
      const f = (l) => s.Tin - a * l - bb * l * l;
      const k1 = f(L), k2 = f(L + h / 2 * k1), k3 = f(L + h / 2 * k2), k4 = f(L + h * k3);
      L = Math.max(0, L + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4));
    }
    peak = Math.max(peak, s.L); worstL = Math.max(worstL, Math.abs(L - s.L));
  }
  check(`C2 ${kind} pool swirl against RK4 re-integration, worst`, 100 * worstL / peak, 2, '% of peak angular momentum');
}

console.log('\nD · Checks proposed by the independent physics review of 852170c');
// D1 spatial convergence: cleaning with the simulator's grid and film step against a 4 x 4 times finer grid and a 1 mm step
{
  const fx = design('washdown', { ovality: 1.35, Anoz: 6.8, alpha: 35, jetPhase: 25, hNoz: 19, Hcr: 390, Vfull: 5.4 });
  for (const [lab, p] of [['washdown preset', design('washdown')], ['siphonic preset', design('siphonic')], ['oval short strong flush', fx]]) {
    const a = sim(p).cleanPct, b = sim(p, { grid: [360, 160], filmStep: 0.001 }).cleanPct;
    check(`D1 ${lab}: cleaning against a 360 x 160 grid and 1 mm film step`, a - b, 1, 'points', `${a.toFixed(2)} % against ${b.toFixed(2)} %`);
  }
}
// D2 siphon break: the level stops at the trap inlet; a strong siphon keeps the water balance; the seal without
// refill does not depend on the time step
{
  const r0 = rng(23); let worst = 0, n = 0;
  for (let i = 0; i < 120; i++) {
    const p = design('siphonic'); p.Anoz = 1.5 + 6.5 * r0(); p.Hcr = 50 + 550 * r0(); p.Vfull = 3 + 4 * r0(); p.dTrap = 38 + 27 * r0(); p.Hs = 120 + 280 * r0(); p.Ks = 1.5 + 4.5 * r0(); p.seal = 40 + 50 * r0(); p.Rpool = 40 + 70 * r0(); p.Rrim = Math.max(p.Rrim, p.Rpool + 25);
    const ds = p.seal / 1000; let zmin = Infinity;
    sim(p, { probe: (s) => { if (s.z < zmin) zmin = s.z; } });
    if (zmin < Infinity) { worst = Math.max(worst, (-ds - zmin) * 1000); n++; }
  }
  check(`D2 lowest pool level below the trap inlet, ${n} random siphonic designs`, Math.max(0, worst), 1, 'mm');
  const p = design('siphonic', { dTrap: 65, Hs: 400, Ks: 1.5, seal: 40, Rpool: 40 });
  let vin = 0, vout = 0, V0 = null, V1 = 0;
  sim(p, { probe: (s) => { if (V0 === null) V0 = s.Vrel - (s.Qpin - s.Qout) * s.dt; vin += s.Qpin * s.dt; vout += s.Qout * s.dt; V1 = s.Vrel; } });
  check('D2 water balance of a strong siphon (trapway 65 mm, drop 400 mm, loss 1.5, seal 40 mm, pool 40 mm)', Math.abs(vin - vout - (V1 - V0)) * 1e6, 1, 'mL');
  const q = design('siphonic', { refill: 0 });
  check('D2 seal after flush without refill, 10 ms against 1 ms time step', sim(q).sealEnd - sim(q, { dt: 0.001 }).sealEnd, 1, 'mm');
}
// D3 time-step convergence down to 1 ms for peak swirl, vortex dip and seal, with the siphon settings varied too
{
  const r0 = rng(24); let wv = 0, wd = 0, ws = 0;
  const cases = [design('washdown'), design('siphonic'), design('siphonic', { flushMode: 'partial' })];
  for (let i = 0; i < 6; i++) { const p = design(r0() < 0.5 ? 'washdown' : 'siphonic'); p.Anoz = 1.5 + 6.5 * r0(); p.Hcr = 100 + 500 * r0(); p.Vfull = 3 + 4 * r0(); p.Hs = 120 + 280 * r0(); p.Ks = 1.5 + 4.5 * r0(); p.dTrap = 38 + 27 * r0(); cases.push(p); }
  for (const p of cases) { const a = sim(p), b = sim(p, { dt: 0.001 }); if (a.everPrimed !== b.everPrimed) continue; wv = Math.max(wv, Math.abs(a.vsPeak / b.vsPeak - 1)); wd = Math.max(wd, Math.abs(a.dipPeak - b.dipPeak)); ws = Math.max(ws, Math.abs(a.sealEnd - b.sealEnd)); }
  check(`D3 peak swirl, 10 ms against 1 ms time step, worst of ${cases.length} designs`, 100 * wv, 3, '%');
  check(`D3 vortex dip, 10 ms against 1 ms time step, worst`, wd, 3, 'mm');
  check(`D3 seal after flush, 10 ms against 1 ms time step, worst`, ws, 1, 'mm');
}
// D4 a partial flush starts from the full cistern: the jet speed at full opening equals that of a full flush
for (const kind of ['washdown', 'siphonic']) {
  const vjAt = (fm) => { let v = null; sim(design(kind, { flushMode: fm }), { probe: (s) => { if (v === null && s.t >= 0.2) v = s.vj; } }); return v; };
  check(`D4 ${kind}: jet speed at 0.2 s, partial against full flush`, 100 * (vjAt('partial') / vjAt('full') - 1), 0.1, '%');
}
// D5 film transit: nothing reaches the pool before the film front does, and all water released arrives
{
  let first = null, vin = 0, varr = 0;
  sim(design('washdown'), { probe: (s) => { if (first === null && s.Qarr > 0) first = s.t; vin += s.Qin * s.dt; varr += s.Qarr * s.dt; } });
  check('D5 washdown preset: first water reaches the pool no earlier than 0.3 s after the valve opens', Math.max(0, 0.3 - first), 0, 's', `first arrival at ${first.toFixed(2)} s`);
  check('D5 washdown preset: water released at the nozzles minus water arrived in the pool', Math.abs(vin - varr) * 1e6, 1, 'mL');
}
// D6 monotone trends: more flush volume, valve height or nozzle area never removes less waste (washdown bowl)
{
  let worst = 0, where = '';
  for (const [k, a, b, st] of [['Vfull', 3, 7, 0.1], ['Hcr', 100, 600, 10], ['Anoz', 1.5, 8, 0.1]]) {
    let prev = null;
    for (let v = a; v <= b + 1e-9; v += st) {
      const r = sim(design('washdown', { [k]: +v.toFixed(3) }));
      if (prev) for (const m of ['solidsPct', 'paperPct']) { const drop = prev[m] - r[m]; if (drop > worst) { worst = drop; where = `${m} at ${k} ${v.toFixed(2)}`; } }
      prev = r;
    }
  }
  check('D6 washdown: largest drop in solids or paper removed when flush volume, valve height or nozzle area rises', worst, 0.5, 'points', where ? `at ${where}` : 'no drop');
}
// D7 round bowl: where the jets sit round the rim must not matter
{
  const cl = [], sw = [];
  for (let ph = 0; ph <= 180; ph += 15) { const r = sim(design('washdown', { ovality: 1, jetPhase: ph })); cl.push(r.cleanPct); sw.push(r.vsPeak); }
  check('D7 round bowl: spread of cleaning over jet positions 0 to 180°', Math.max(...cl) - Math.min(...cl), 0.5, 'points');
  check('D7 round bowl: spread of peak swirl over jet positions', Math.max(...sw) - Math.min(...sw), 0.005, 'm/s');
}
// D8 rim line: measured at 25 mm depth, also on a flat, shallow wall
{
  const p = design('washdown', { Rrim: 190, Rpool: 40, Dwall: 90 }), r = M.simulate(p, { light: false, Tend: 12 }), g = M.buildGeom(p);
  const row = Math.floor(M.sAtDepth(g, 0.025) / r.dsb), zTop = M.geomAt(g, row * r.dsb).z, zBot = M.geomAt(g, (row + 1) * r.dsb).z;
  check('D8 rim line row on a flat wall (rim 190 mm, pool 40 mm, depth 90 mm): 25 mm depth lies inside the row', (zTop <= 0.025 && zBot >= 0.025) ? 0 : 1, 0, '', `row from ${(zTop * 1000).toFixed(1)} to ${(zBot * 1000).toFixed(1)} mm deep`);
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length + known.length} checks: ${failed} failed${known.length ? `, ${known.length} known open issue${known.length > 1 ? 's' : ''}` : ''}`);
const bad = failed || (STRICT && known.length);
console.log(bad ? 'FAILED' + (!failed ? ' (--strict: known open issues count as failures)' : '') : 'passed' + (known.length ? ' with known open issues (run with --strict before a release)' : ''));
process.exitCode = bad ? 1 : 0;
