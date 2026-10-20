// How much cleaning depends on how often the jet films are re-traced (node checks/resolution.js)
const { loadModel, rng, jetDesign, q } = require('./lib');
const M = loadModel(), r = rng(7), U = [20, 10, 5, 2, 1], rows = [];
for (let i = 0; i < 300; i++) { const p = jetDesign(M, r); rows.push(U.map((u) => M.simulate(p, { light: true, uEvery: u }).cleanPct)); }
console.log('300 random jet and flush designs (seed 7), cleaned % against 10 ms film updates:');
U.slice(0, 4).forEach((u, j) => {
  const e = rows.map((c) => Math.abs(c[j] - c[4]));
  console.log(`  every ${u * 10} ms: median ${q(e, 0.5).toFixed(2)}, 95th percentile ${q(e, 0.95).toFixed(2)}, max ${Math.max(...e).toFixed(2)} points`);
});
['washdown', 'siphonic'].forEach((k) => console.log(`  ${k} preset at 200/100/50/20/10 ms: ` + U.map((u) => M.simulate(M.defaults(k), { light: true, uEvery: u }).cleanPct.toFixed(2)).join(' / ')));
// a short, strong flush in the demo's oval bowl, found by a search of 3,000 designs
const fx = Object.assign(M.defaults('washdown'), { ovality: 1.35, Anoz: 6.8, alpha: 35, jetPhase: 25, hNoz: 19, Hcr: 390, Vfull: 5.4 });
console.log('  short, strong flush (oval 1.35, nozzle 6.8 cm², angle 35°, position 25°, height 19 mm, valve 390 mm, 5.4 L) at 200/100/10 ms: ' +
  [20, 10, 1].map((u) => M.simulate(fx, { light: true, uEvery: u }).cleanPct.toFixed(2)).join(' / ') + ` (flush lasts ${M.simulate(fx, { light: true }).tEmpty.toFixed(2)} s)`);
