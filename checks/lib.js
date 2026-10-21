// Shared helpers for the checks: a seeded random generator and random designs.
// Every check is deterministic: the same seed gives the same designs and the same numbers.
const path = require('path');
function loadModel(file) {
  delete globalThis.FlushModel;
  const f = path.resolve(file || path.join(__dirname, '..', 'model.js')); delete require.cache[f];
  require(f);
  const M = globalThis.FlushModel; delete globalThis.FlushModel; return M;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// jets and flush settings uniform over the simulator's slider ranges; the bowl stays at the preset
function jetDesign(M, r, kind) {
  const p = M.defaults(kind || (r() < 0.5 ? 'washdown' : 'siphonic'));
  p.Anoz = 1.5 + 6.5 * r(); p.alpha = 35 * r(); p.jetPhase = 180 * r(); p.hNoz = 6 + 14 * r();
  p.Hcr = 50 + 550 * r(); p.Vfull = 3 + 4 * r(); p.nJets = 1 + Math.floor(3 * r());
  return p;
}
// jets, flush and bowl geometry, both flush buttons
function fullDesign(M, r) {
  const kind = r() < 0.5 ? 'washdown' : 'siphonic', p = M.defaults(kind);
  p.Anoz = 1.5 + 6.5 * r(); p.alpha = 35 * r(); p.jetPhase = 180 * r(); p.nJets = 1 + Math.floor(3 * r()); p.hNoz = 6 + 14 * r();
  p.ovality = 1 + 0.6 * r(); p.Hcr = 50 + 550 * r(); p.Vfull = 3 + 4 * r(); p.Rpool = 40 + 60 * r(); p.Rrim = Math.max(p.Rpool + 30, 110 + 80 * r());
  p.Dwall = 90 + 110 * r(); p.seal = 40 + 50 * r(); p.dTrap = 38 + 27 * r(); p.flushMode = r() < 0.3 ? 'partial' : 'full';
  return p;
}
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))]; };
module.exports = { loadModel, rng, jetDesign, fullDesign, q };
