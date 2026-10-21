// Engineering challenge (challenge-core.js): the race on the page and the repeat quoted on the page.
//   node checks/challenge.js          main race, determinism and the repeat (about four minutes)
//   node checks/challenge.js --quick  main race and determinism only (about 30 s)
// The repeat runs the three routes 8 times: seed 0 with the page's start design and the informed classic order,
// seeds 1 to 7 with other start designs, other random screening and refinement, and a random classic order.
// It fails if the minimum, median and maximum runs to target, or the fast model's misses, differ from the REPEAT
// figures in challenge-core.js, which the page quotes. Exits with code 1 on any failure.
const { loadModel, q } = require('./lib');
const M = loadModel();
require('../challenge-core.js'); const CH = globalThis.FlushChallenge; delete globalThis.FlushChallenge;
const quick = process.argv.includes('--quick');
const out = [];
const ok = (name, cond, info) => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' :: ' + JSON.stringify(info) : ''}`); };
const t0 = Date.now();

const C = CH.make(M);
const s0 = C.ref(C.start), f0 = C.fast(C.start);
ok('Start design misses the targets in the reference', !C.meets(s0), { clean: +s0.clean.toFixed(1), water: s0.water });
ok('Reference and fast model differ at the start (synthetic discrepancy present)', Math.abs(s0.clean - f0.clean) > 1, { ref: +s0.clean.toFixed(1), fast: +f0.clean.toFixed(1) });
const main = {}; ['classic', 'fast', 'ai'].forEach((k) => { main[k] = CH.runAll(C.routes[k](C.start)); });
const tt = (v) => v.toTarget || null;
ok('Main race: every route that reports success ends with a run meeting all targets', ['classic', 'fast', 'ai'].every((k) => !main[k].toTarget || C.meets(main[k].runs[main[k].toTarget - 1].e)));
ok('Main race: the AI route reaches the target', !!tt(main.ai), tt(main.ai));
ok('Main race: the AI route needs fewer reference runs than the classic route', tt(main.ai) && (!tt(main.classic) || tt(main.ai) < tt(main.classic)), { ai: tt(main.ai), classic: tt(main.classic), fast: tt(main.fast) });
ok('Main race: no route runs the same design twice', ['classic', 'fast', 'ai'].every((k) => new Set(main[k].runs.map((r) => r.x.join())).size === main[k].runs.length));
ok('Main race: all designs within the slider ranges and on their steps', ['classic', 'fast', 'ai'].every((k) => main[k].runs.every((r) => C.DV.every((d) => { const v = r.des[d.k]; return v >= d.min - 1e-9 && v <= d.max + 1e-9 && Math.abs(v / d.st - Math.round(v / d.st)) < 1e-6; }))));
// determinism: a fresh core gives the same runs
const C2 = CH.make(M), again = {}; ['classic', 'fast', 'ai'].forEach((k) => { again[k] = CH.runAll(C2.routes[k](C2.start)); });
ok('Deterministic: a second race gives the same runs', ['classic', 'fast', 'ai'].every((k) => JSON.stringify(again[k].runs.map((r) => r.des)) === JSON.stringify(main[k].runs.map((r) => r.des))));
console.log(`main race: classic ${tt(main.classic)}, fast model alone ${tt(main.fast) || 'not within ' + main.fast.runs.length}, AI ${tt(main.ai)}; ${C.count.fast} fast flushes, ${C.count.ref} reference runs`);

if (!quick) {
  const starts = [C.start].concat(C.starts(7)), rows = [];
  for (let s = 0; s < 8; s++) {
    const Cs = CH.make(M, { seed: s }), row = {};
    ['classic', 'fast', 'ai'].forEach((k) => { row[k] = tt(CH.runAll(Cs.routes[k](starts[s]))); });
    rows.push(row); console.log(`repeat ${s}: classic ${row.classic || '-'}, fast ${row.fast || '-'}, ai ${row.ai || '-'}`);
  }
  const stat = (k) => { const v = rows.map((r) => r[k] || C.MAXR); const srt = v.slice().sort((a, b) => a - b); return [srt[0], (srt[3] + srt[4]) / 2, srt[7]]; };
  const got = { n: 8, ai: stat('ai'), classic: stat('classic'), fastMiss: rows.filter((r) => !r.fast).length,
    rows: { classic: rows.map((r) => r.classic), fast: rows.map((r) => r.fast), ai: rows.map((r) => r.ai) } };
  ok('Repeat matches the figures quoted on the page (REPEAT in challenge-core.js)', JSON.stringify(got) === JSON.stringify(C.REPEAT), { computed: got, quoted: C.REPEAT });
  ok('Repeat: the AI route reaches the target every time', rows.every((r) => r.ai), rows.map((r) => r.ai));
}

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`${out.length} checks: ${failed} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(failed ? 'FAILED' : 'passed');
process.exitCode = failed ? 1 : 0;
