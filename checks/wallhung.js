// The 2.2 extensions for a European wall-hung pan: off-centre pool, round crest with passage loss, and the preset.
//   node checks/wallhung.js
// That the extensions are off by default is checked by regression.js (0 differences against 2.1.1). Here: the
// off-centre wall is the surface it should be, it obeys the bowl's symmetry, the round crest follows critical
// flow in a part-full round bore, the water balance closes, and the wall-hung preset runs. About 20 seconds.
const { loadModel } = require('./lib');
const M = loadModel();
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const G = 9.81;
const run = (kind, o, opts) => M.simulate(Object.assign(M.defaults(kind), o), Object.assign({ light: true }, opts || {}));
const KEYS = ['cleanPct', 'wetPct', 'linePct', 'solidsPct', 'paperPct', 'zPeak', 'vsPeak', 'water'];
const near = (a, b, tol) => KEYS.every((k) => Math.abs(a[k] - b[k]) <= tol * Math.max(1, Math.abs(a[k])));

// ---- off-centre pool ----
// a turn of the bowl by 180° about its axis moves the pool to the other side and the jets by 180°: same results
const a = run('washdown', { nJets: 3, ovality: 1.2, poolShift: 25, jetPhase: 0 }), b = run('washdown', { nJets: 3, ovality: 1.2, poolShift: -25, jetPhase: 180 });
ok('Pool offset: offset +25 mm equals -25 mm with the jets turned by 180° (3 jets, oval bowl)', near(a, b, 1e-9) && Math.abs(a.noise.peak - b.noise.peak) < 1e-9, KEYS.map((k) => [k, a[k], b[k]]));
// the wall area from the cells equals a fine triangulation of the shifted surface x = R(z) sE cos + C(z)
const wallArea = (e) => {
  const p = M.defaults('washdown'), Rr = p.Rrim / 1000, Rp = p.Rpool / 1000, D = p.Dwall / 1000, sE = Math.sqrt(1.2), kz = Math.PI / (2 * D), es = e / 1000;
  const P = (th, z) => { const R = Rp + (Rr - Rp) * Math.cos(kz * z); return [R * sE * Math.cos(th) + es * (1 - Math.cos(kz * z)), R / sE * Math.sin(th), z]; };
  const tri = (u, v, w) => { const x1 = v[0] - u[0], y1 = v[1] - u[1], z1 = v[2] - u[2], x2 = w[0] - u[0], y2 = w[1] - u[1], z2 = w[2] - u[2]; return 0.5 * Math.hypot(y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2); };
  let A = 0; const NT = 360, NZ = 300;
  for (let i = 0; i < NT; i++) for (let j = 0; j < NZ; j++) {
    const t0 = 2 * Math.PI * i / NT, t1 = 2 * Math.PI * (i + 1) / NT, z0 = D * j / NZ, z1 = D * (j + 1) / NZ;
    const q0 = P(t0, z0), q1 = P(t1, z0), q2 = P(t1, z1), q3 = P(t0, z1); A += tri(q0, q1, q2) + tri(q0, q2, q3);
  }
  return A;
};
const areas = [0, 25, 40].map((e) => { const r = run('washdown', { ovality: 1.2, poolShift: e }, { light: false }); return [r.cellA.reduce((s, x) => s + x, 0), wallArea(e)]; });
ok('Pool offset: the wall cells add up to the area of the shifted wall (0, 25 and 40 mm, within 0.1 %)', areas.every(([c, t]) => Math.abs(c / t - 1) < 1e-3) && areas[2][0] > areas[0][0], areas);
// levels and volumes do not depend on the offset: a shifted section has the same area
const g0 = M.buildGeom(M.defaults('washdown')), g1 = M.buildGeom(Object.assign(M.defaults('washdown'), { poolShift: 30 }));
ok('Pool offset: the level table and the water at rest do not change', g0.Vstatic === g1.Vstatic && g0.vt.every((v, i) => v === g1.vt[i]));
// cleaning falls as the pool moves off centre (2 jets at the ends of the long axis); with 2 jets +e and -e are the same bowl
const sweep = [0, 10, 25, 40].map((e) => run('washdown', { ovality: 1.2, poolShift: e }).cleanPct);
const mirror = run('washdown', { ovality: 1.2, poolShift: -25 }).cleanPct;
ok('Pool offset: cleaning falls as the pool moves off centre, the same either way with two opposite jets', sweep.every((v, i) => i === 0 || v < sweep[i - 1]) && Math.abs(mirror - sweep[2]) < 1e-9, { sweep, mirror });
// the offset is limited: the pool stays 25 mm inside the rim
const pl = M.defaults('wallhung'), lim = (pl.Rrim - 25 - pl.Rpool) / 1000 * Math.sqrt(pl.ovality);
ok('Pool offset: limited to keep the pool 25 mm inside the rim, in the model and for the page', Math.abs(M.poolX(Object.assign({}, pl, { poolShift: 500 })) - lim) < 1e-12 && run('wallhung', { poolShift: 500 }).cleanPct === run('wallhung', { poolShift: lim * 1000 }).cleanPct && M.poolX(pl) === 0.025);

// ---- round crest ----
const D = 0.07, At = Math.PI * D * D / 4, rc = M.roundCrest(D, 0);
// half full: y = D/2, A = At/2, T = D
const yh = D / 2, Ah = At / 2, Hh = yh + Ah / (2 * D), Qh = Ah * Math.sqrt(G * Ah / D);
ok('Round crest: half-full bore gives the critical flow of a half circle', Math.abs(rc.q(Hh) / Qh - 1) < 2e-3, [rc.q(Hh), Qh]);
// at small heads a round bore passes less than a flat crest of its width (critical flow, coefficient 1.705); at half full they are close
const flat = (H) => Math.sqrt(G) * Math.pow(2 / 3, 1.5) * D * Math.pow(H, 1.5);
ok('Round crest: less than a flat crest of the same width at low heads (30 % at 5 mm), about 80 % near the preset peak', rc.q(0.005) / flat(0.005) < 0.35 && Math.abs(rc.q(0.0581) / flat(0.0581) - 0.81) < 0.02, [rc.q(0.005) / flat(0.005), rc.q(0.0581) / flat(0.0581)]);
// monotonic, continuous at 90 % full, and the passage loss adds K velocity heads
const zs = Array.from({ length: 400 }, (_, i) => 0.0005 * (i + 1)), qs = zs.map((z) => rc.q(z));
const H9 = (() => { const y = 0.9 * D, th = 2 * Math.acos(1 - 2 * y / D), A = D * D / 8 * (th - Math.sin(th)), T = D * Math.sin(th / 2); return y + A / (2 * T); })();
ok('Round crest: outflow rises with the level, without a step at 90 % full', qs.every((q, i) => i === 0 || q > qs[i - 1]) && Math.abs(rc.q(H9 + 1e-4) - rc.q(H9 - 1e-4)) < 0.01 * rc.q(H9), H9);
const rk = M.roundCrest(D, 1.5), qk = rk.q(0.0714);
ok('Round crest: with Kpass the level is the crest head plus Kpass velocity heads', Math.abs(rk.head(qk) + 1.5 * (qk / At) ** 2 / (2 * G) - 0.0714) < 2e-4, [rk.head(qk), qk]);

// ---- water balance and the preset ----
for (const kind of ['wallhung']) {
  let out = 0, last = null; const r = run(kind, {}, { probe: (o) => { out += o.Qout * o.dt; last = o; } });
  const bal = r.water / 1000 - out - last.Vrel - last.Vtransit;
  ok(`Water balance closes for the ${kind} preset (released = out + stored above the crest + on the wall, within 1 mL)`, Math.abs(bal) < 1e-6, bal);
}
const w = run('wallhung', {}), wp = run('wallhung', { flushMode: 'partial' });
ok('Wall-hung preset: a valid run with a round crest and an off-centre pool; cleans less than the round EU washdown bowl', w.valid && !w.incomplete && wp.valid && w.cleanPct < run('washdown', {}).cleanPct && w.zPeak > 60 && w.solidsPct > 95, { clean: w.cleanPct, zPeak: w.zPeak, solids: w.solidsPct, paper: w.paperPct });
ok('Preset family: siphonic by trap type, wall-hung by round crest or pool offset, else EU washdown', M.presetOf(M.defaults('wallhung')) === 'wallhung' && M.presetOf(M.defaults('washdown')) === 'washdown' && M.presetOf(M.defaults('siphonic')) === 'siphonic' && M.presetOf(Object.assign(M.defaults('washdown'), { poolShift: 5 })) === 'wallhung');
// swirl loss at the trap (kSw, 2.2): off by default; on, the bowl holds more water and the trap starts later
const sw = [0, 1, 2, 3].map((k) => { let t0 = null; const r = run('washdown', { dTrap: 70, crestRound: 1, Kpass: 1.5, kSw: k }, { probe: (o) => { if (t0 === null && o.Qout > 5e-5) t0 = o.t; } }); return { z: r.zPeak, t0 }; });
ok('Swirl loss at the trap: the peak level rises and the outflow starts later as kSw grows (70 mm round crest)', sw.every((v, i) => i === 0 || (v.z > sw[i - 1].z && v.t0 > sw[i - 1].t0)), sw);
ok('Swirl loss at the trap is ignored by a siphonic bowl', run('siphonic', { kSw: 3 }).zPeak === run('siphonic', {}).zPeak);
// share of the pool's spin the outflow takes (kLout, 2.2): 1 by default; less keeps the pool swirling longer
const spin = [1, 0.5, 0].map((k) => { const S = []; M.simulate(Object.assign(M.defaults('washdown'), { dTrap: 70, crestRound: 1, Kpass: 1.5, kSw: 2, kLout: k }), { light: true, Tend: 6, probe: (o) => S.push(o.om) }); return S[600] / S[290]; });
ok('Outflow spin share: the less spin the outflow takes, the more swirl is left 3 s after the valve closes', spin[0] < spin[1] && spin[1] < spin[2] && run('washdown', { kLout: 1 }).cleanPct === run('washdown', {}).cleanPct, spin);
ok('Round crest is ignored by a siphonic bowl', run('siphonic', { crestRound: 1, Kpass: 2 }).zPeak === run('siphonic', {}).zPeak);

console.log(`${pass + fail} checks: ${fail} failed`);
process.exitCode = fail ? 1 : 0;
