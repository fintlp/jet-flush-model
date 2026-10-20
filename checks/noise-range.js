// Noise indicator: widths of the sampled range, a comparison across trap types, and how far
// interior coefficient values can fall outside the range of the 32 corners (node checks/noise-range.js)
const { loadModel, rng, q } = require('./lib');
const M = loadModel();
const rangeOf = (a, b) => { const d = a.map((v, i) => v - b[i]); return [Math.min(...d), Math.max(...d)]; };
const pre = { washdown: M.simulate(M.defaults('washdown'), { light: true }).noise, siphonic: M.simulate(M.defaults('siphonic'), { light: true }).noise };
const [lo, hi] = rangeOf(pre.siphonic.peakV, pre.washdown.peakV);
console.log(`siphonic preset against washdown preset: ${(pre.siphonic.peak - pre.washdown.peak).toFixed(2)} dB, sampled range ${lo.toFixed(2)} to ${hi.toFixed(2)} dB`);
// designs varied around each preset: jets, flush and ovality
const r = rng(3);
for (const k of ['washdown', 'siphonic']) {
  const w = [], unclear = [];
  for (let i = 0; i < 200; i++) {
    const p = M.defaults(k); p.Anoz = 1.5 + 6.5 * r(); p.alpha = 35 * r(); p.Hcr = 50 + 550 * r(); p.Vfull = 3 + 4 * r(); p.nJets = 1 + Math.floor(3 * r()); p.ovality = 1 + 0.6 * r();
    const [a, b] = rangeOf(M.simulate(p, { light: true }).noise.peakV, pre[k].peakV);
    w.push(b - a); unclear.push(!(b <= -0.5 || a >= 0.5 || (a > -0.5 && b < 0.5)));
  }
  console.log(`200 ${k} designs (seed 3) against the ${k} preset: range width median ${q(w, 0.5).toFixed(2)} dB, 90th percentile ${q(w, 0.9).toFixed(2)} dB, Unclear ${Math.round(100 * unclear.filter(Boolean).length / 200)} %`);
}
// interior samples: draw coefficients inside the box and compare design and reference with the same values
const r2 = rng(11), keys = ['nUe', 'hFall', 'rCore', 'cCore', 'wTrap'], logk = { hFall: 1, cCore: 1, wTrap: 1 };
let outside = 0, worst = 0;
for (let i = 0; i < 40; i++) {
  const kind = r2() < 0.5 ? 'washdown' : 'siphonic', p = M.defaults(kind), ref = M.defaults(kind);
  p.Anoz = 2 + 5 * r2(); p.alpha = 30 * r2(); p.Hcr = 100 + 400 * r2(); p.Vfull = 3.5 + 3 * r2(); p.ovality = 1 + 0.4 * r2();
  const [a, b] = rangeOf(M.simulate(p, { light: true }).noise.peakV, M.simulate(ref, { light: true }).noise.peakV);
  const C = M.noiseCorners(p); let ex = 0;
  for (let s = 0; s < 30; s++) {
    const c = {}; keys.forEach((k) => { const u = r2(), l = C.lo[k], h = C.hi[k]; c[k] = logk[k] ? l * Math.pow(h / l, u) : l + (h - l) * u; });
    const d = M.simulate(Object.assign({}, p, c), { light: true }).noise.peak - M.simulate(Object.assign({}, ref, c), { light: true }).noise.peak;
    ex = Math.max(ex, d - b, a - d);
  }
  if (ex > 0.01) outside++; worst = Math.max(worst, ex);
}
console.log(`40 designs (seed 11) x 30 interior coefficient samples: ${outside} designs had interior values outside the corner range, by at most ${worst.toFixed(2)} dB`);
