// Sensitivity to the time step: halve it; the film retrace tolerance stays the same (node checks/timestep.js)
const { loadModel, rng, q } = require('./lib');
const M = loadModel(), r = rng(5);
const K = ['cleanPct', 'solidsPct', 'paperPct', 'water', 'zPeak', 'dipPeak', 'sealEnd'], d = {}; K.forEach((k) => { d[k] = []; }); const nd = [];
for (let i = 0; i < 150; i++) {
  const p = M.defaults(r() < 0.5 ? 'washdown' : 'siphonic');
  p.Anoz = 1.5 + 6.5 * r(); p.alpha = 35 * r(); p.jetPhase = 180 * r(); p.hNoz = 6 + 14 * r(); p.Hcr = 50 + 550 * r(); p.Vfull = 3 + 4 * r(); p.nJets = 1 + Math.floor(3 * r()); p.ovality = 1 + 0.6 * r();
  const a = M.simulate(p, { light: true, Tend: 12 }), b = M.simulate(p, { light: true, dt: 0.005, Tend: 12 });
  K.forEach((k) => d[k].push(Math.abs((a[k] || 0) - (b[k] || 0)))); nd.push(Math.abs(a.noise.peak - b.noise.peak));
}
console.log('150 random designs (seed 5), change when the time step is halved from 10 ms to 5 ms:');
K.forEach((k) => console.log(`  ${k.padEnd(10)} median ${q(d[k], 0.5).toFixed(3)}, 95th percentile ${q(d[k], 0.95).toFixed(3)}, max ${Math.max(...d[k]).toFixed(3)}`));
console.log(`  noise peak median ${q(nd, 0.5).toFixed(3)}, 95th percentile ${q(nd, 0.95).toFixed(3)}, max ${Math.max(...nd).toFixed(3)} dB`);
