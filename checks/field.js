// Field surrogate (field-core.js): learning curves of a pure data surrogate of the cleaning map against the fast model.
//   node checks/field.js     about 10 seconds. Exits with code 1 on any failure.
// The figures quoted on the page and in the method description: with 80 training runs of the synthetic reference,
// the data surrogate matches 80 to 88 % (now 84 %) of the cleaned area of 20 unseen designs, the fast model alone more than 93 %,
// and the fast model with a learned correction at least as much as the fast model alone (within half a point).
const { loadModel } = require('./lib');
const M = loadModel();
require('../challenge-core.js'); require('../field-core.js');
const C = globalThis.FlushChallenge.make(M), FF = globalThis.FlushField; delete globalThis.FlushChallenge; delete globalThis.FlushField;
const out = [], ok = (name, cond, info) => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' :: ' + JSON.stringify(info) : ''}`); };
const t0 = Date.now(), F = FF.make(M, C); for (const _ of F.generate());
const fast = F.score(null), r = (v) => +(100 * v).toFixed(1);
const res = [10, 20, 40, 80].map((N) => ({ N, d: F.score(F.fit(N, false)), c: F.score(F.fit(N, true)) }));
// a map's cleaned share is the simulator's own cleaning for that run: reference maps at the reference's cleaning dose
// (1.6 Pa s), fast maps at 1.5, both weighted with the simulator's cell areas on the oval wall (review findings R-02, R-03)
{ let worst = 0; F.D.Xte.forEach((x, j) => { const d = C.toDesign(x);
    const cr = M.simulate(Object.assign({}, C.base, d, C.HID), { light: true }).cleanPct, cf = M.simulate(Object.assign({}, C.base, d), { light: true }).cleanPct;
    worst = Math.max(worst, Math.abs(F.share(F.D.Rte[j]) - cr), Math.abs(F.share(F.D.Fte[j]) - cf)); });
  ok('Maps agree with the simulator: cleaned share of every test map equals its run\'s cleaning (reference and fast)', worst < 1e-6, { worst: +worst.toExponential(2) }); }
ok('Fast model alone matches more than 93 % of the cleaned area', fast.overlap > 0.93, { overlap: r(fast.overlap), err: +fast.err.toFixed(2) });
ok('Data surrogate with 80 runs matches 80 to 88 %', res[3].d.overlap > 0.80 && res[3].d.overlap < 0.88, res.map((q) => [q.N, r(q.d.overlap), +q.d.err.toFixed(1)]));
ok('Data surrogate gets better from 10 to 80 runs', res[3].d.overlap > res[0].d.overlap);
ok('Learned correction is at least as good as the fast model alone (within half a point)', res.every((q) => q.c.overlap > fast.overlap - 0.005), res.map((q) => [q.N, r(q.c.overlap)]));
const F2 = FF.make(M, C); for (const _ of F2.generate()); const again = F2.score(F2.fit(40, false));
ok('Deterministic: the same data and fit give the same score', again.overlap === res[2].d.overlap);
console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`${out.length} checks: ${failed} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`); console.log(failed ? 'FAILED' : 'passed');
process.exitCode = failed ? 1 : 0;
