// Which uncalibrated model coefficient matters most for a design? Each of the 13 model coefficients is moved
// down and up by a share of its default (25 % unless you say otherwise), one at a time, and the change in the
// main results is printed, largest effect on cleaning first.
//   node examples/coef-sensitivity.js                          washdown preset, ±25 %
//   node examples/coef-sensitivity.js siphonic 0.5             siphonic preset, ±50 %
//   node examples/coef-sensitivity.js washdown 0.25 ovality=1.35 jetPhase=90    a design of your own
// The shift is kept inside the slider range of each coefficient. This is a local, one-at-a-time study: it shows
// which coefficients to calibrate first for this design, not how they interact. Section 12 of method.html says
// what each coefficient controls and what to fit it against.
const path = require('path');
require(path.join(__dirname, '..', 'model.js'));
const M = globalThis.FlushModel;

const PRESET = process.argv[2] || 'washdown', SHARE = +(process.argv[3] || 0.25);
// the model coefficients of the page (group "Model coefficients · advanced"), with their slider ranges
const COEF = {
  cf: ['Film friction factor', 0.002, 0.03], ksp: ['Film spreading rate', 0.05, 0.6], tauC: ['Critical soil shear, Pa', 0.5, 15],
  Jcrit: ['Shear dose to clean, Pa·s', 0.2, 10], eta: ['Swirl transfer efficiency', 0.1, 1], kov: ['Extra swirl loss per ovality', 0, 6],
  cfp: ['Pool wall friction', 0.005, 0.06], ucS: ['Transport threshold, solids, m/s', 0.1, 1.2], ucP: ['Transport threshold, paper, m/s', 0.1, 1.2],
  cmax: ['Max solids concentration', 0.03, 0.3], kS: ['Solids removal rate, 1/s', 0.2, 6], kP: ['Paper removal rate, 1/s', 0.2, 6],
  Cweir: ['Weir coefficient, m½/s', 1.2, 2.2]
};
const base = M.defaults(PRESET);
process.argv.slice(4).forEach((a) => { const [k, v] = a.split('='); if (!(k in base)) { console.error(`unknown setting ${k}`); process.exit(1); } base[k] = +v; });
const run = (p) => M.simulate(p, { light: true });
const r0 = run(base);
const OUTS = [['cleanPct', 'cleaned %'], ['solidsPct', 'solids %'], ['paperPct', 'paper %'], ['sealEnd', 'seal mm']];
const rows = Object.entries(COEF).map(([k, [label, lo, hi]]) => {
  const d = base[k], down = Math.max(lo, d * (1 - SHARE)), up = Math.min(hi, d * (1 + SHARE));
  const a = run({ ...base, [k]: down }), b = run({ ...base, [k]: up });
  return { k, label, d, down, up, eff: OUTS.map(([o]) => [a[o] - r0[o], b[o] - r0[o]]) };
});
rows.sort((x, y) => Math.max(Math.abs(y.eff[0][0]), Math.abs(y.eff[0][1])) - Math.max(Math.abs(x.eff[0][0]), Math.abs(x.eff[0][1])));
const s = (v) => (Math.abs(v) < 0.05 ? '±' : v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);
console.log(`${PRESET} preset${process.argv.length > 4 ? ' with ' + process.argv.slice(4).join(' ') : ''}: cleaned ${r0.cleanPct.toFixed(1)} %, solids ${r0.solidsPct.toFixed(1)} %, paper ${r0.paperPct.toFixed(1)} %, seal ${r0.sealEnd.toFixed(0)} mm`);
console.log(`Each coefficient moved by ${Math.round(SHARE * 100)} % down / up (within its slider range); change in points (mm for the seal):\n`);
console.log('coefficient'.padEnd(36) + 'default'.padStart(9) + OUTS.map(([, l]) => l.padStart(16)).join(''));
rows.forEach((q) => console.log((`${q.k}  ${q.label}`).padEnd(36) + String(+q.d.toPrecision(3)).padStart(9) + q.eff.map(([a, b]) => `${s(a)} / ${s(b)}`.padStart(16)).join('')));
