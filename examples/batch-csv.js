// Run many designs with the flush model and write the results as CSV, for Excel, Python or your own tools.
//   node examples/batch-csv.js                     200 designs of the washdown preset to batch.csv
//   node examples/batch-csv.js 1000 out.csv        1000 designs to out.csv
//   node examples/batch-csv.js 300 sip.csv siphonic
// Edit VARY below to choose which settings change and over which range. The designs are spread evenly over every
// range (Latin hypercube) with a fixed seed, so the same command gives the same file. One design takes a few
// tens of milliseconds; 1000 designs take about a minute. The settings and their units are the sliders of the page; method.html section 12 explains them.
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', 'model.js'));
const M = globalThis.FlushModel;

const N = +(process.argv[2] || 200), OUT = process.argv[3] || 'batch.csv', PRESET = process.argv[4] || 'washdown';
// setting: [low, high], in the page's units; the ranges here are the slider ranges
const VARY = {
  Anoz: [1.5, 8],        // nozzle area per jet, cm²
  alpha: [0, 35],        // downward jet angle, °
  jetPhase: [0, 180],    // jet position around rim, °
  Vfull: [3, 7],         // full flush volume, L
  Hcr: [50, 600]         // valve height above jets, mm
};
const INTEGER = new Set(['nJets']);

// seeded random numbers and a Latin hypercube: each range split into N strips, one design per strip, shuffled
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const r = rng(2026), keys = Object.keys(VARY);
const strata = keys.map(() => { const a = Array.from({ length: N }, (_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });

const cols = ['id', 'preset', ...keys, 'cleanPct', 'rimLinePct', 'wetPct', 'solidsPct', 'paperPct', 'water_L', 'sealEnd_mm', 'Qpeak_Ls', 'noisePeak_dB', 'valid', 'note'];
const rows = [cols.join(',')];
const t0 = Date.now();
for (let n = 0; n < N; n++) {
  const p = M.defaults(PRESET);
  keys.forEach((k, j) => { const [lo, hi] = VARY[k]; let v = lo + (hi - lo) * (strata[j][n] + r()) / N; if (INTEGER.has(k)) v = Math.round(v); p[k] = v; });
  if (p.Rpool > p.Rrim - 25) p.Rpool = p.Rrim - 25;   // the page keeps the pool at least 25 mm inside the rim
  const res = M.simulate(p, { light: true });
  const note = res.overflow ? 'overflow' : res.incomplete ? 'incomplete' : '';
  const f = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d));
  rows.push([n + 1, PRESET, ...keys.map((k) => f(p[k], 3)), f(res.cleanPct, 2), f(res.linePct, 2), f(res.wetPct, 2), f(res.solidsPct, 2), f(res.paperPct, 2),
    f(res.water, 3), f(res.sealEnd, 1), f(res.Qpeak, 3), f(res.noise && res.noise.peak, 2), res.valid ? 1 : 0, note].join(','));
}
fs.writeFileSync(OUT, rows.join('\n') + '\n');
console.log(`${N} designs of the ${PRESET} preset in ${((Date.now() - t0) / 1000).toFixed(1)} s, written to ${OUT}`);
console.log('noisePeak_dB is the model\'s internal peak level: compare differences between designs only, as on the page.');
