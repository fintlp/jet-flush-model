// Run time of this model against another version, for example the released one without noise:
//   node checks/timing.js /tmp/model-main.js
// Timings depend on the machine; the ratio is what the model description quotes.
const { loadModel } = require('./lib');
const other = process.argv[2]; if (!other) { console.log('usage: node checks/timing.js <other model.js>'); process.exit(1); }
const A = loadModel(other), B = loadModel();
for (const kind of ['washdown', 'siphonic']) for (const o of [{}, { light: true }, { light: true, coarse: true }]) {
  const t = (M) => { const p = M.defaults(kind); for (let i = 0; i < 5; i++) M.simulate(p, o); const t0 = performance.now(); for (let i = 0; i < 40; i++) M.simulate(p, o); return (performance.now() - t0) / 40; };
  const a = t(A), b = t(B);
  console.log(`${kind.padEnd(9)} ${JSON.stringify(o).padEnd(28)} other ${a.toFixed(1)} ms, this ${b.toFixed(1)} ms, +${Math.round(100 * (b / a - 1))} %`);
}
