// Writes the model's wall maps of a preset (shear dose J and first wetting time per cell, 90 x 40 grid) as JSON.
// node cfd/model-maps.js washdown > cfd/washdown/model-maps.json
const { loadModel } = require('../checks/lib');
const M = loadModel();
const kind = process.argv[2] || 'washdown', p = M.defaults(kind);
const r = M.simulate(p, { Tend: 12 });
process.stdout.write(JSON.stringify({ kind, NTH: r.NTH, NS: r.NS, tauC: p.tauC, Jcrit: p.Jcrit, cleanPct: r.cleanPct, wetPct: r.wetPct,
  J: Array.from(r.J, (x) => +x.toFixed(4)), tWet: Array.from(r.tWet, (x) => (x < 1e9 ? +x.toFixed(3) : 1e9)) }));
