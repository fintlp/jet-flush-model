// Plausibility against published figures (node checks/literature.js).
//
// Compares the presets with numbers from published toilet studies, patents and test reports. This is not a
// validation: the published bowls are not the presets, most figures come from CFD rather than measurement, and
// the model's coefficients are uncalibrated. It answers a weaker question: does the model land in the range that
// real bowls and their simulations report?
//
// RANGE    a range backed by more than one source and comparable with the model. Outside it the script fails
//          (exit code 1).
// COMPARE  a single source, a different bowl type, or a figure whose definition differs from the model's.
//          Reported with a verdict (inside, outside, differs) and the reason, but never fails the run.
//
// Sources (full references in sources.html, section 5 and 1):
//   [G] CADFEM journal, Geberit TurboFlush: free-outlet cisterns up to 2.4 L/s; TurboFlush guides about 2.0 L/s;
//       some bowls below 1.0 L/s through geometry or scale.
//   [V] Manav, Kemaneci, Simsir 2023 (Vitra), CFX VOF, 6 L flush: peak inflow 1.3 L/s (rimless, three outlets)
//       and 1.5 L/s (side-jet vortex); inflow ends at 6.5 s and 5.4 s; water rotates about three times on the
//       bowl surface; up to 1.6 and 3.1 L in the bowl; 1.0 to 1.3 L at rest; outflow starts at 0.5 s and 1.75 s;
//       peak wall shear 1.75 and 2.95 Pa (averaging not stated; the paper also says the wall was frictionless).
//   [L] Lopes and Costa 2019, CFX: flushes simulated at 0.85 and 0.58 L/s.
//   [S] SBZ and Hochschule Esslingen practical flush test: flush water calibrated to 2.1 L/s.
//   [P1] US 8,438,670 B2: trapway diameters about 47 to 54 mm; 1.5 L at rest in one washdown toilet.
//   [P2] US 9,353,512: CFD of a jet-driven siphonic toilet with a 60 mm trapway, siphon peak 4.4 L/s at 0.58 s.
//   [T] Study on the influence of toilet siphon pipe shape on flushing performance (VOF, with tests): performance
//       peaks for siphon pipe diameters of 50 to 53 mm.
const { loadModel, rng, fullDesign, q } = require('./lib');
const M = loadModel();
const results = [];
const sim = (p, o) => M.simulate(p, Object.assign({ Tend: 12 }, o));
const f2 = (v) => v.toFixed(2), f1 = (v) => v.toFixed(1);

function range(name, value, lo, hi, unit, src) {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'OUTSIDE'} ${name}: ${typeof value === 'number' ? f2(value) : value} ${unit} (range ${lo} to ${hi} ${unit}) · ${src}`);
}
function compare(name, model, lit, verdict, why) {
  console.log(`COMPARE ${name}: model ${model}; published ${lit} · ${verdict}${why ? ' · ' + why : ''}`);
}

// one detailed run per preset and flush button, with the extra quantities the comparisons need
function run(kind, extra) {
  const p = Object.assign(M.defaults(kind), extra || {}), g = M.buildGeom(p);
  let Vmax = 0, tOut = null;
  const traces = new Map();
  const r = sim(p, {
    probe: (s) => {
      const V = g.Vstatic + s.Vrel + s.Vtransit; if (V > Vmax) Vmax = V;
      if (tOut === null && s.Qout > 5e-5) tOut = s.t;
    },
    probeFilm: (s) => {
      const key = s.t + '|' + s.jet, a = Math.atan2(s.y, s.x), U = Math.hypot(s.vx, s.vy, s.vz), tau = 0.5 * 1000 * s.cf * U * U;
      let tr = traces.get(key);
      if (!tr) { tr = { last: a, turn: 0, tw: 0, w: 0, tmax: 0 }; traces.set(key, tr); }
      else { let d = a - tr.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; tr.turn += d; tr.last = a; }
      tr.tw += tau * s.w; tr.w += s.w; tr.tmax = Math.max(tr.tmax, tau);
    }
  });
  const tr = [...traces.values()];
  let qo = 0, tq = 0; r.rec.Qout.forEach((v, i) => { if (v > qo) { qo = v; tq = r.rec.t[i]; } });
  return {
    p, r, g, Vmax: Vmax * 1000, tOut, QoutPeak: qo, tQoutPeak: tq,
    turns: Math.max(...tr.map((x) => Math.abs(x.turn) / (2 * Math.PI))),
    tauBand: Math.max(...tr.map((x) => x.tw / x.w)), tauLocal: Math.max(...tr.map((x) => x.tmax))
  };
}
const R = {
  washdown: run('washdown'), siphonic: run('siphonic'),
  washdownPart: run('washdown', { flushMode: 'partial' }), siphonicPart: run('siphonic', { flushMode: 'partial' })
};
const W = R.washdown, S = R.siphonic;

console.log('Ranges (fail the run when outside)');
for (const [k, x] of Object.entries(R)) range(`peak flow into the bowl, ${k}`, x.r.Qpeak, 1.0, 2.4, 'L/s', '[G] [V] [S]');
for (const [k, x] of Object.entries(R)) range(`mean flow while the flush is released, ${k}`, x.r.flushVol / x.r.tEmpty, 0.55, 2.1, 'L/s', `${f1(x.r.flushVol)} L in ${f2(x.r.tEmpty)} s · [L] [V] [S]`);
for (const k of ['washdown', 'siphonic']) range(`trap diameter of the preset, ${k}`, R[k].p.dTrap, 47, 54, 'mm', '[P1]');

console.log('\nComparisons (never fail the run)');
{
  const lo = Math.min(W.turns, S.turns), hi = Math.max(W.turns, S.turns);
  compare('turns of the jet film on the bowl wall (longest trace)', `${f1(W.turns)} (washdown), ${f1(S.turns)} (siphonic)`, 'about 3 for a side-jet vortex bowl [V]',
    lo >= 1.5 && hi <= 4 ? 'inside 1.5 to 4' : 'outside 1.5 to 4', 'one bowl in one CFD study; the turns depend strongly on jet angle and bowl depth');
}
{
  const a = W.Vmax / W.r.flushVol, b = S.Vmax / S.r.flushVol;
  compare('most water in the bowl during the flush, per litre flushed (at rest + wall + pool)', `${f2(W.Vmax)} L, ${f2(a)} per L (washdown); ${f2(S.Vmax)} L, ${f2(b)} per L (siphonic)`,
    '3.1 L or 0.52 per L (vortex bowl), 1.6 L or 0.27 per L (rimless, three outlets), both for 6 L [V]',
    Math.abs(a - 0.52) < 0.1 && Math.abs(b - 0.52) < 0.1 ? 'close to the vortex bowl' : 'differs', 'scaling by flush volume is an assumption');
}
compare('water at rest (pool up to the weir crest)', `${f2(W.g.Vstatic * 1000)} L (washdown), ${f2(S.g.Vstatic * 1000)} L (siphonic)`, '1.0 to 1.3 L [V], 1.5 L in one washdown toilet [P1]',
  'outside: the presets hold too little', 'the published figures may include water in the trap leg that the model does not count here; known calibration item (method section 4), bowl geometry left unchanged in 2.0');
compare('start of outflow from the bowl', `${f2(W.tOut)} s (washdown), ${f2(S.tOut)} s (siphonic)`, '0.5 s (rimless, part of the flow aimed at the pool), 1.75 s (vortex bowl) [V]',
  'differs: the model drains as early as a bowl that feeds the pool directly', 'the water held in the model bowl is similar to the vortex bowl, so the difference lies in how early the pool spills over the weir; not explained yet');
compare('wall shear under the film (largest band mean, largest local value)', `${f1(W.tauBand)} and ${f1(W.tauLocal)} Pa (washdown), ${f1(S.tauBand)} and ${f1(S.tauLocal)} Pa (siphonic)`,
  'peak 1.75 and 2.95 Pa [V]', `differs: band mean ${f1(W.tauBand / 2.95)} and ${f1(S.tauBand / 2.95)} times the vortex bowl figure`,
  'not directly comparable: averaging not stated and the paper describes the wall as frictionless. The model cleans where shear exceeds τc = ' + M.defaults().tauC +
  ' Pa, so the shear level and τc must be calibrated together from one reference run');
{
  const rows = [38, 46, 50, 53, 60, 65].map((d) => { const r = sim(Object.assign(M.defaults('siphonic'), { dTrap: d }), { light: true }); return { d, sol: r.solidsPct, pap: r.paperPct, prime: r.primeT }; });
  const mono = rows.every((x, i) => i === 0 || (x.sol <= rows[i - 1].sol + 0.05 && x.pap <= rows[i - 1].pap + 0.05));
  const primes = [...new Set(rows.map((x) => x.prime == null ? 'none' : f2(x.prime)))];
  compare('trap diameter with the best waste removal, siphonic preset', rows.map((x) => `${x.d} mm: solids ${f1(x.sol)} %, paper ${f1(x.pap)} %`).join('; '),
    'best at 50 to 53 mm [T]', mono ? 'differs: removal falls steadily with diameter, no optimum' : 'has an optimum',
    `siphon primes at ${primes.join(', ')} s for every diameter, so a large trap is never penalised for priming late, and a narrow one carries waste faster; see review findings F4 and F11`);
}
{
  const x = run('siphonic', { dTrap: 60 });
  compare('siphon peak outflow with a 60 mm trap', `${f2(x.QoutPeak)} L/s at ${f2(x.tQoutPeak)} s`, '4.4 L/s at 0.58 s (jet-driven siphonic toilet, CFD) [P2]',
    'peak of the same order, reached much later', 'not like for like: in [P2] a jet aimed into the trapway starts the siphon; the preset has no such jet');
}
{
  const r0 = rng(31), Qp = [];
  for (let i = 0; i < 300; i++) Qp.push(sim(fullDesign(M, r0), { light: true }).Qpeak);
  const inside = Qp.filter((v) => v >= 1.0 && v <= 2.4).length, above = Qp.filter((v) => v > 2.4).length;
  compare('peak flow into the bowl, 300 random designs over the slider ranges', `P5 ${f2(q(Qp, 0.05))}, median ${f2(q(Qp, 0.5))}, P95 ${f2(q(Qp, 0.95))} L/s; ${inside} inside 1.0 to 2.4 L/s, ${above} above`,
    'up to 2.4 L/s from a free-outlet cistern [G]', 'information', 'the sliders allow valve heights and nozzle areas that give more flow than a real cistern delivers');
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} of ${results.length} ranges inside${failed ? `, ${failed} outside` : ''}`);
process.exit(failed ? 1 : 0);
