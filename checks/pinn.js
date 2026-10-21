// Physics-informed network (pinn-core.js): finds the hidden weir coefficient of a simulated flush.
//   node checks/pinn.js     about 15 seconds. Exits with code 1 on any failure.
// The "measured" flush is the full flush model with a weir coefficient of 1.45 (the model uses 1.7), read every
// 0.1 s or 13 times with 1.5 mm of noise. The network and a classic least-squares fit must both land within 6 %
// of 1.45; the network must be deterministic; with the record cut at 3 s the coefficient is not identifiable,
// which the page says, so the check only asks that the physics keeps the level after the cut closer to the truth
// than the same network without physics.
const { loadModel } = require('./lib');
const M = loadModel();
require('../pinn-core.js'); const P = globalThis.FlushPINN; delete globalThis.FlushPINN;
const out = [], ok = (name, cond, info) => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' :: ' + JSON.stringify(info) : ''}`); };
const t0 = Date.now(), r2 = (v) => +v.toFixed(3);
for (const [label, o] of [['10 readings a second', { fps: 10 }], ['13 readings', { fps: 1.5 }]]) {
  const D = P.makeData(M, o), pi = P.runAll(P.train(D, { epochs: 1000 })), ls = P.leastSquares(D);
  ok(`${label}: network finds the weir coefficient within 6 %`, Math.abs(pi.Cw - 1.45) / 1.45 < 0.06, { network: r2(pi.Cw), tau: r2(pi.tau) });
  ok(`${label}: least squares finds it within 6 %`, Math.abs(ls.Cw - 1.45) / 1.45 < 0.06, { leastSquares: r2(ls.Cw), tau: r2(ls.tau) });
}
const D = P.makeData(M, { fps: 10 }), a = P.runAll(P.train(D, { epochs: 300 })), b = P.runAll(P.train(D, { epochs: 300 }));
ok('Deterministic: the same training twice gives the same coefficients', a.Cw === b.Cw && a.tau === b.tau);
const Dc = P.makeData(M, { fps: 10 }); Dc.obs = Dc.obs.filter((q) => q.t <= 3);
const pc = P.runAll(P.train(Dc, { epochs: 1000 })), pn = P.runAll(P.train(Dc, { epochs: 1000, physics: false }));
const err = (c) => { let s = 0, k = 0; c.forEach((q) => { if (q.t <= 3) return; const tr = Dc.truth.reduce((x, y) => (Math.abs(y.t - q.t) < Math.abs(x.t - q.t) ? y : x)); s += (q.z - tr.z) ** 2; k++; }); return Math.sqrt(s / k) * 1000; };
ok('Record cut at 3 s: with physics the level after the cut stays closer to the truth', err(pc.curve) < err(pn.curve), { physicsMm: +err(pc.curve).toFixed(1), readingsOnlyMm: +err(pn.curve).toFixed(1) });
console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`${out.length} checks: ${failed} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`); console.log(failed ? 'FAILED' : 'passed');
process.exitCode = failed ? 1 : 0;
