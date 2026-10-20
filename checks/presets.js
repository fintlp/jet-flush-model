// Figures quoted for the presets in section 10 of the model description (node checks/presets.js)
const { loadModel } = require('./lib');
const M = loadModel();
console.log('G(a): ' + [1, 0.8, 0.6, 0.45, 0.3].map((a) => `G(${a}) = ${M.coreFactor(a).toFixed(3)}`).join(', '));
const R = {};
for (const k of ['washdown', 'siphonic']) {
  const p = M.defaults(k), r = M.simulate(p, {}), rc = r.rec, G = M.coreFactor(p.rCore), n = r.noise; R[k] = r;
  let maxD = 0, iD = 0, minM = Infinity, iM = 0;
  for (let i = 0; i < rc.t.length; i++) {
    const dip = rc.vs[i] ** 2 / (2 * 9.81) * 1000 * G, S = rc.z[i] + p.seal;
    if (dip > maxD) { maxD = dip; iD = i; }
    if (rc.Qout[i] > 0.001 && S - dip < minM) { minM = S - dip; iM = i; }
  }
  const pct = (a) => a.map((x) => Math.round(100 * x) + ' %').join(' / ');
  console.log(`${k}: largest vortex dip ${maxD.toFixed(1)} mm at ${rc.t[iD].toFixed(2)} s, trap inlet then ${(rc.z[iD] + p.seal).toFixed(1)} mm below the surface; smallest margin while water flows out ${minM.toFixed(1)} mm at ${rc.t[iM].toFixed(2)} s`);
  console.log(`  air core from ${n.airT == null ? 'none' : n.airT.toFixed(2) + ' s'}, in ${n.coreCorners} of ${n.nCorners} combinations; siphon break ${r.breakT == null ? 'none' : r.breakT.toFixed(2) + ' s'}`);
  console.log(`  share at the peak (films / outlet / air core / break): ${pct(n.peakShare)}; share of energy: ${pct(n.share)}`);
  let iq = 0; for (let i = 0; i < rc.t.length; i++) if (rc.Qout[i] > rc.Qout[iq]) iq = i;
  const D = p.dTrap / 1000, V = rc.Qout[iq] / 1000 / (Math.PI * D * D / 4);
  console.log(`  Gordon check at peak outflow ${rc.Qout[iq].toFixed(2)} L/s, ${rc.t[iq].toFixed(2)} s: S_c = 0.543 V √d = ${(0.543 * V * Math.sqrt(D) * 1000).toFixed(0)} mm, available ${(rc.z[iq] + p.seal).toFixed(0)} mm`);
}
const w = R.washdown.noise, s = R.siphonic.noise, d = s.peakV.map((v, i) => v - w.peakV[i]);
console.log(`siphonic against washdown peak: ${(s.peak - w.peak).toFixed(2)} dB, sampled range ${Math.min(...d).toFixed(2)} to ${Math.max(...d).toFixed(2)} dB`);
