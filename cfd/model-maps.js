// Writes the model's wall maps of a preset (shear dose J and first wetting time per cell, 90 x 40 grid) as JSON.
// node cfd/model-maps.js washdown > cfd/washdown/model-maps.json
// Options: --model FILE (another model.js, e.g. a read-only copy of a development branch), --set JSON (overrides of
// preset settings), e.g. node cfd/model-series.js washdown --model /tmp/model.js --set '{"dTrap":70,"crestRound":1,"Kpass":1.5}'
const { loadModel } = require('../checks/lib');
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const M = loadModel(opt('--model') || undefined);
const kind = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'washdown';
const set = opt('--set') ? JSON.parse(opt('--set')) : {};
const p = Object.assign(M.defaults(kind), set);
const r = M.simulate(p, { Tend: 12 });
process.stdout.write(JSON.stringify({ kind, set, NTH: r.NTH, NS: r.NS, tauC: p.tauC, Jcrit: p.Jcrit, cleanPct: r.cleanPct, wetPct: r.wetPct,
  J: Array.from(r.J, (x) => +x.toFixed(4)), tWet: Array.from(r.tWet, (x) => (x < 1e9 ? +x.toFixed(3) : 1e9)) }));
