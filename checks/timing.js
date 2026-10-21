// Run time of this model against another version, for example the released one:
//   git show origin/main:model.js > /tmp/model-main.js && node checks/timing.js /tmp/model-main.js
// Both presets (full, light, light + coarse), then 60 random designs (seed 77; jets, flush and bowl geometry, both
// flush buttons) at full resolution with traces and in the coarse mode of the sweep and the search: median time per
// flush, the 10 and 90 % points, and the ratio of the total times, which is what the model description quotes.
// Absolute times depend on the machine; the ratio much less.
const { loadModel, rng, fullDesign, q } = require('./lib');
const other = process.argv[2]; if (!other) { console.log('usage: node checks/timing.js <other model.js>'); process.exit(1); }
const A = loadModel(other), B = loadModel();
for (const kind of ['washdown', 'siphonic']) for (const o of [{}, { light: true }, { light: true, coarse: true }]) {
  const t = (M) => { const p = M.defaults(kind); for (let i = 0; i < 5; i++) M.simulate(p, o); const t0 = performance.now(); for (let i = 0; i < 40; i++) M.simulate(p, o); return (performance.now() - t0) / 40; };
  const a = t(A), b = t(B);
  console.log(`${kind.padEnd(9)} ${JSON.stringify(o).padEnd(28)} other ${a.toFixed(1)} ms, this ${b.toFixed(1)} ms, ${b >= a ? '+' : ''}${Math.round(100 * (b / a - 1))} %`);
}
// random designs: only the drawn settings are passed on, the rest are each version's own defaults
const VARIED = ['Anoz', 'alpha', 'jetPhase', 'nJets', 'hNoz', 'ovality', 'Hcr', 'Vfull', 'Rpool', 'Rrim', 'Dwall', 'seal', 'dTrap', 'flushMode'];
const r = rng(77), D = Array.from({ length: 60 }, () => fullDesign(B, r));
const run = (M, p, o) => { const x = M.defaults(p.type); VARIED.forEach((k) => { x[k] = p[k]; }); const t0 = performance.now(); M.simulate(x, o); return performance.now() - t0; };
for (const [name, o] of [['full resolution, traces', {}], ['coarse (sweep, search)', { light: true, coarse: true }]]) {
  D.slice(0, 5).forEach((p) => { run(A, p, o); run(B, p, o); });
  const a = [], b = []; D.forEach((p) => { a.push(run(A, p, o)); b.push(run(B, p, o)); });
  const sum = (x) => x.reduce((u, v) => u + v, 0);
  console.log(`60 random designs, ${name.padEnd(24)} other median ${q(a, 0.5).toFixed(1)} ms, this median ${q(b, 0.5).toFixed(1)} ms (10 to 90 %: ${q(b, 0.1).toFixed(1)} to ${q(b, 0.9).toFixed(1)} ms), ratio of totals ${(sum(b) / sum(a)).toFixed(2)}`);
}
