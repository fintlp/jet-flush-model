// Compares every result except noise with another version of model.js, for example the released one:
//   git fetch origin main && git show origin/main:model.js > /tmp/model-main.js && node checks/regression.js /tmp/model-main.js
// Exits with code 1 if any result differs or any noise value is not finite.
const { loadModel, rng, fullDesign } = require('./lib');
const other = process.argv[2]; if (!other) { console.log('usage: node checks/regression.js <other model.js>'); process.exit(1); }
const A = loadModel(other), B = loadModel();
const KEYS = ['cleanPct', 'wetPct', 'linePct', 'solidsPct', 'paperPct', 'capS', 'water', 'flushVol', 'Qpeak', 'tEmpty', 'vsPeak', 'zPeak', 'dipPeak',
  'primeT', 'breakT', 'everPrimed', 'sealEnd', 'sealOK', 'zEnd', 'tEnd', 'incomplete', 'cisternLeft', 'overflow', 'overflowT', 'spill', 'valid', 'cleanPerL'];
const r = rng(12345); let diffs = 0, nonFinite = 0;
for (let i = 0; i < 400; i++) {
  const p = fullDesign(A, r), a = A.simulate(p, { light: true }), b = B.simulate(Object.assign(B.defaults(p.type), p), { light: true });
  KEYS.forEach((k) => { if (a[k] !== b[k]) { diffs++; if (diffs <= 5) console.log('differs:', k, a[k], b[k]); } });
  if (b.noise && ![b.noise.peak, b.noise.energy, ...b.noise.peakV, ...b.noise.energyV].every(Number.isFinite)) nonFinite++;
}
console.log(`400 random designs (seed 12345), ${KEYS.length} results each: ${diffs} differences, ${nonFinite} designs with non-finite noise values`);
process.exitCode = diffs || nonFinite ? 1 : 0;
console.log(process.exitCode ? 'FAILED' : 'passed');
