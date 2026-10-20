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
