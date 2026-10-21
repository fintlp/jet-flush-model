// Engineering challenge (challenge-core.js): the eight races the page shows, stored in challenge-data.js.
//   node checks/challenge.js          recompute all 8 races and compare them with challenge-data.js (about four minutes)
//   node checks/challenge.js --quick  race 1 only (about 30 s)
//   node checks/challenge.js --write  recompute all 8 and write challenge-data.js (after a change to the model or the core)
// Race 1 (seed 0) starts from the page's start design with the informed classic order; races 2 to 8 from other start
// designs, with other random choices in the screening and refinement and a random classic order.
// Exits with code 1 on any failure.
const fs = require('fs'), path = require('path');
const { loadModel } = require('./lib');
const M = loadModel();
require('../challenge-core.js'); const CH = globalThis.FlushChallenge; delete globalThis.FlushChallenge;
const quick = process.argv.includes('--quick'), write = process.argv.includes('--write');
const FILE = path.join(__dirname, '..', 'challenge-data.js');
const out = [];
const ok = (name, cond, info) => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' :: ' + JSON.stringify(info) : ''}`); };
const t0 = Date.now();

const C = CH.make(M);
const s0 = C.ref(C.start), f0 = C.fast(C.start);
ok('Start design misses the targets in the reference', !C.meets(s0), { clean: +s0.clean.toFixed(1), water: s0.water });
ok('Reference and fast model differ at the start (synthetic discrepancy present)', Math.abs(s0.clean - f0.clean) > 1, { ref: +s0.clean.toFixed(1), fast: +f0.clean.toFixed(1) });

const n = quick ? 1 : CH.REPEATS, races = [];
for (let i = 0; i < n; i++) {
  const r = CH.runAll(CH.race(M, i)); races.push(r);
  console.log(`race ${i + 1}: ${CH.ROUTES.map((k) => `${k} ${r.routes[k].toTarget || '-'}`).join(', ')}`);
}
const R0 = races[0];
const T = C.T, meets = (e) => e[3] <= T.water + 1e-9 && e[0] >= T.clean && e[1] >= T.solids && e[2] >= T.paper && e[4] === 1;
ok('Race 1: a route that reports success ends with a run meeting all targets', CH.ROUTES.every((k) => { const v = R0.routes[k]; return !v.toTarget || (v.runs.length === v.toTarget && meets(v.runs[v.toTarget - 1].e)); }));
ok('Race 1: the AI route reaches the target in fewer runs than the classic route', R0.routes.ai.toTarget && (!R0.routes.classic.toTarget || R0.routes.ai.toTarget < R0.routes.classic.toTarget), { ai: R0.routes.ai.toTarget, classic: R0.routes.classic.toTarget, fast: R0.routes.fast.toTarget });
ok('All races: no route runs the same design twice', races.every((r) => CH.ROUTES.every((k) => new Set(r.routes[k].runs.map((q) => q.d.join())).size === r.routes[k].runs.length)));
ok('All races: designs within the slider ranges and on their steps', races.every((r) => CH.ROUTES.every((k) => r.routes[k].runs.every((q) => C.DV.every((d, j) => { const v = q.d[j]; return v >= d.min - 1e-9 && v <= d.max + 1e-9 && Math.abs(v / d.st - Math.round(v / d.st)) < 1e-6; })))));
const again = CH.runAll(CH.race(M, 0));
ok('Deterministic: race 1 computed twice gives the same result', JSON.stringify(again) === JSON.stringify(R0));
if (!quick) ok('All races: the AI route reaches the target every time', races.every((r) => r.routes.ai.toTarget), races.map((r) => r.routes.ai.toTarget));

if (write && !quick) {
  fs.writeFileSync(FILE, '// The eight races of the engineering challenge, written by: node checks/challenge.js --write\n// The page shows them and can recompute any one live; checks/challenge.js compares them with a fresh computation.\nwindow.FlushChallengeData = ' + JSON.stringify({ version: 1, races }) + ';\n');
  console.log(`wrote ${FILE} (${(fs.statSync(FILE).size / 1024).toFixed(0)} kB)`);
} else {
  let stored = null;
  try { const g = {}; new Function('window', fs.readFileSync(FILE, 'utf8'))(g); stored = g.FlushChallengeData; } catch (e) { stored = null; }
  ok('challenge-data.js exists and holds 8 races', !!stored && stored.races.length === CH.REPEATS);
  if (stored) {
    const diff = races.map((r, i) => JSON.stringify(r) === JSON.stringify(stored.races[i]) ? null : i + 1).filter((v) => v);
    ok(`challenge-data.js matches a fresh computation (${races.length} race${races.length > 1 ? 's' : ''})`, diff.length === 0, diff.length ? { differ: diff } : undefined);
  }
}

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`${out.length} checks: ${failed} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(failed ? 'FAILED' : 'passed');
process.exitCode = failed ? 1 : 0;
