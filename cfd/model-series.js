// Writes the model's time series for a preset as JSON, used to drive and to compare the OpenFOAM reference case.
// node cfd/model-series.js washdown > cfd/washdown/model-series.json
// Options: --model FILE (another model.js, e.g. a read-only copy of a development branch), --set JSON (overrides of
// preset settings), e.g. node cfd/model-series.js washdown --model /tmp/model.js --set '{"dTrap":70,"crestRound":1,"Kpass":1.5}'
const { loadModel } = require('../checks/lib');
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const M = loadModel(opt('--model') || undefined);
const kind = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'washdown';
const set = opt('--set') ? JSON.parse(opt('--set')) : {};
const p = Object.assign(M.defaults(kind), set), g = M.buildGeom(p);
const out = { kind, set, model: opt('--model') ? require('path').basename(opt('--model')) : 'model.js', p, Vstatic: g.Vstatic, t: [], Qin: [], vj: [], z: [], Qout: [], Vtransit: [], Vrel: [], om: [], uMean: [], vs: [], Qarr: [] };
let last = -1;
const r = M.simulate(p, { Tend: 12, probe: (s) => {
  if (s.t - last < 0.005 - 1e-9) return; last = s.t;
  out.t.push(+s.t.toFixed(4)); out.Qin.push(s.Qin); out.vj.push(s.vj); out.z.push(s.z); out.Qout.push(s.Qout);
  out.Vtransit.push(s.Vtransit); out.Vrel.push(s.Vrel); out.om.push(s.om); out.uMean.push(2 / 3 * s.om * s.Rc); out.vs.push(s.om * s.Rc); out.Qarr.push(s.Qarr);   // area mean of a solid-body swirl
} });
out.result = { cleanPct: r.cleanPct, wetPct: r.wetPct, Qpeak: r.Qpeak, tEmpty: r.tEmpty, vsPeak: r.vsPeak, zPeak: r.zPeak, water: r.water };
process.stdout.write(JSON.stringify(out));
