// Writes the model's time series for a preset as JSON, used to drive and to compare the OpenFOAM reference case.
// node cfd/model-series.js washdown > cfd/washdown/model-series.json
const { loadModel } = require('../checks/lib');
const M = loadModel();
const kind = process.argv[2] || 'washdown', p = M.defaults(kind), g = M.buildGeom(p);
const out = { kind, p, Vstatic: g.Vstatic, t: [], Qin: [], vj: [], z: [], Qout: [], Vtransit: [], Vrel: [], om: [] };
let last = -1;
const r = M.simulate(p, { Tend: 12, probe: (s) => {
  if (s.t - last < 0.005 - 1e-9) return; last = s.t;
  out.t.push(+s.t.toFixed(4)); out.Qin.push(s.Qin); out.vj.push(s.vj); out.z.push(s.z); out.Qout.push(s.Qout);
  out.Vtransit.push(s.Vtransit); out.Vrel.push(s.Vrel); out.om.push(s.om);
} });
out.result = { cleanPct: r.cleanPct, wetPct: r.wetPct, Qpeak: r.Qpeak, tEmpty: r.tEmpty, vsPeak: r.vsPeak, zPeak: r.zPeak, water: r.water };
process.stdout.write(JSON.stringify(out));
