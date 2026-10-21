// Regression check of the model results.
//   node checks/regression.js            compares with the stored 2.0 baseline (checks/baseline-2.0.json)
//   node checks/regression.js --write    writes a new baseline; only after a deliberate change to the model,
//                                         and say in the change log why the results moved
//   node checks/regression.js <model.js> compares with another version of model.js, for example the released one:
//     git fetch origin main && git show origin/main:model.js > /tmp/model-main.js && node checks/regression.js /tmp/model-main.js
// 200 random designs (seed 12345) over jets, flush, bowl geometry and both flush buttons; every main result and
// the noise peak and energy. Against the baseline a result may differ by 1e-7 relative (rounding across Node
// versions); against another model.js any difference counts. Exits with code 1 on a difference or a non-finite value.
const fs = require('fs'), path = require('path');
const { loadModel, rng, fullDesign } = require('./lib');
const KEYS = ['cleanPct', 'wetPct', 'linePct', 'solidsPct', 'paperPct', 'capS', 'water', 'flushVol', 'Qpeak', 'tEmpty', 'vsPeak', 'zPeak', 'dipPeak',
  'primeT', 'breakT', 'everPrimed', 'sealEnd', 'sealOK', 'zEnd', 'tEnd', 'incomplete', 'cisternLeft', 'overflow', 'overflowT', 'spill', 'valid', 'cleanPerL'];
const N = 200, SEED = 12345, FILE = path.join(__dirname, 'baseline-2.0.json');
const arg = process.argv[2], B = loadModel();
// only the settings drawn at random are passed on; everything else comes from each model's own defaults,
// so a changed default coefficient shows up as a difference too
const VARIED = ['Anoz', 'alpha', 'jetPhase', 'nJets', 'hNoz', 'ovality', 'Hcr', 'Vfull', 'Rpool', 'Rrim', 'Dwall', 'seal', 'dTrap', 'flushMode'];
const row = (M, p) => { const q = M.defaults(p.type); VARIED.forEach((k) => { q[k] = p[k]; }); const r = M.simulate(q, { light: true }), o = {}; KEYS.forEach((k) => { o[k] = r[k]; }); if (r.noise) { o.noisePeak = r.noise.peak; o.noiseEnergy = r.noise.energy; } return o; };
const designs = () => { const r = rng(SEED); return Array.from({ length: N }, () => fullDesign(B, r)); };
const rnd = (v) => (typeof v === 'number' && isFinite(v) ? Number(v.toPrecision(12)) : v);
let diffs = 0, nonFinite = 0, n = 0;
const cmp = (a, b, tol, i) => {
  Object.keys(b).forEach((k) => {
    n++; const x = a[k], y = b[k];
    if (typeof y === 'number' && !Number.isFinite(y) && !(k === 'primeT' || k === 'breakT' || k === 'overflowT')) nonFinite++;
    const same = typeof x === 'number' && typeof y === 'number' ? (x === y || Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y))) : x === y;
    if (!same) { diffs++; if (diffs <= 8) console.log(`design ${i}: ${k} was ${x}, now ${y}`); }
  });
};
if (arg === '--write') {
  const rows = designs().map((p) => { const o = row(B, p); Object.keys(o).forEach((k) => { o[k] = rnd(o[k]); }); return o; });
  fs.writeFileSync(FILE, JSON.stringify({ version: '2.0', seed: SEED, n: N, written: new Date().toISOString().slice(0, 10), keys: KEYS.concat(['noisePeak', 'noiseEnergy']), rows }) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), FILE)}: ${N} designs`); process.exit(0);
} else if (!arg) {
  if (!fs.existsSync(FILE)) { console.log('no baseline; run node checks/regression.js --write'); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  designs().forEach((p, i) => cmp(base.rows[i], row(B, p), 1e-7, i));
  console.log(`${N} random designs (seed ${SEED}) against the ${base.version} baseline of ${base.written}, ${n} values: ${diffs} differences, ${nonFinite} non-finite values`);
} else {
  const A = loadModel(arg);
  designs().forEach((p, i) => { const a = row(A, p), b = row(B, p); delete a.noisePeak; delete a.noiseEnergy; delete b.noisePeak; delete b.noiseEnergy; cmp(a, b, 0, i); });
  console.log(`${N} random designs (seed ${SEED}) against ${arg}, ${n} values: ${diffs} differences, ${nonFinite} non-finite values`);
}
process.exitCode = diffs || nonFinite ? 1 : 0;
console.log(process.exitCode ? 'FAILED' : 'passed');
