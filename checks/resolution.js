// How much results depend on how often the jet films are retraced (node checks/resolution.js).
// The reference retraces the films at every 10 ms time step (filmTol: 0). The simulator retraces when jet speed
// or pool level has changed by more than its tolerance; the design sweep and the optimiser search use a looser one.
const { loadModel, rng, jetDesign, fullDesign, q } = require('./lib');
const M = loadModel();
const MODES = [['simulator (standard)', {}], ['sweep and search (coarse)', { coarse: true }], ['reference, every step', { filmTol: 0 }]];
const run = (p, o) => M.simulate(p, Object.assign({ light: true, Tend: 12 }, o));
function report(title, designs) {
  const res = designs.map((p) => MODES.map(([, o]) => run(p, o))), ref = res.map((x) => x[2]);
  console.log(`${title}, against the reference:`);
  MODES.slice(0, 2).forEach(([lab], j) => {
    const e = (k) => res.map((x, i) => Math.abs(x[j][k] - ref[i][k]));
    const f = (a, d) => `median ${q(a, 0.5).toFixed(d)}, 95th percentile ${q(a, 0.95).toFixed(d)}, max ${Math.max(...a).toFixed(d)}`;
    const nr = res.reduce((s, x) => s + x[j].filmRetraces, 0) / res.length;
    console.log(`  ${lab}: cleaned ${f(e('cleanPct'), 2)} points; rim line ${f(e('linePct'), 1)} points; noise peak ${f(res.map((x, i) => Math.abs(x[j].noise.peak - ref[i].noise.peak)), 2)} dB; ${nr.toFixed(0)} film traces per flush`);
  });
  console.log(`  reference: ${(ref.reduce((s, x) => s + x.filmRetraces, 0) / ref.length).toFixed(0)} film traces per flush`);
}
let r = rng(7); report('300 random jet and flush designs (seed 7)', Array.from({ length: 300 }, () => jetDesign(M, r)));
r = rng(11); report('300 random designs with bowl geometry, both trap types and both buttons (seed 11)', Array.from({ length: 300 }, () => fullDesign(M, r)));
['washdown', 'siphonic'].forEach((k) => console.log(`  ${k} preset, cleaned % standard / coarse / reference: ` + MODES.map(([, o]) => run(M.defaults(k), o).cleanPct.toFixed(2)).join(' / ')));
// a short, strong flush in the demo's oval bowl: in 1.3 it differed by 34 points between 200 ms and 10 ms film updates
const fx = Object.assign(M.defaults('washdown'), { ovality: 1.35, Anoz: 6.8, alpha: 35, jetPhase: 25, hNoz: 19, Hcr: 390, Vfull: 5.4 });
console.log('  short, strong flush (oval 1.35, nozzle 6.8 cm², angle 35°, position 25°, height 19 mm, valve 390 mm, 5.4 L), standard / coarse / reference: ' +
  MODES.map(([, o]) => run(fx, o).cleanPct.toFixed(2)).join(' / ') + ` (flush lasts ${run(fx, {}).tEmpty.toFixed(2)} s)`);
