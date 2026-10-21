// What a faster design loop is worth (2.1): the figures of the why page, the savings calculator and the slides,
// recomputed from the stored races of the engineering challenge (challenge-data.js) with value-core.js.
//   node checks/value.js
// Checks the arithmetic of every step, the example values, that the numbers written into why.html (shown when
// the data cannot load) match the data, and that slides/figures.json holds the same figures. About a second.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global; require(path.join(ROOT, 'challenge-data.js'));
const V = require(path.join(ROOT, 'value-core.js'));
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9);

const S = V.stats();
const D = window.FlushChallengeData.races;
ok('Eight races, every route of classic and AI reaches the targets', S && S.n === 8 && D.every((r) => r.routes.classic.toTarget != null && r.routes.ai.toTarget != null), S && S.n);
// medians by hand: sorted lists, middle pair
const mid = (v) => { const s = v.slice().sort((a, b) => a - b); return (s[3] + s[4]) / 2; };
ok('Typical project: medians computed as the middle of the sorted eight', near(S.medClassic, mid(S.classic)) && near(S.medAi, mid(S.ai)), { c: S.medClassic, a: S.medAi });
ok('Per design question: the difference of the two typical projects', near(S.perProject, S.medClassic - S.medAi), S.perProject);
ok('Race by race: saved = classic − AI, totals add up', S.saved.every((s, i) => s === S.classic[i] - S.ai[i]) && S.sumSaved === S.sumClassic - S.sumAi && S.sumClassic === S.classic.reduce((a, b) => a + b, 0), { saved: S.saved, sum: S.sumSaved });
ok('Race by race: fewer, tie and more add up to eight', S.fewer + S.tie + S.more === S.n, { fewer: S.fewer, tie: S.tie, more: S.more });
ok('Headline sits between the median and the mean of the race-by-race savings', S.perProject >= Math.min(S.medSaved, S.meanSaved) - 1e-9 && S.perProject <= Math.max(S.medSaved, S.meanSaved) + 1e-9, { per: S.perProject, med: S.medSaved, mean: S.meanSaved });
ok('Fast model alone: misses counted from the stored races', S.fastMiss === D.filter((r) => r.routes.fast.toTarget == null).length, S.fastMiss);

// the calculator with the example values
const E = V.EXAMPLES, ex = V.compute({ days: E.days.v, hours: E.hours.v, rate: E.rate.v, run: '', perYear: E.perYear.v }, S);
ok('Example: working days per design question = iterations saved × days per iteration', near(ex.daysPerQ, S.perProject * E.days.v), ex.daysPerQ);
ok('Example: cost per design question = iterations saved × (person hours × rate + run cost)', near(ex.costPerQ, S.perProject * (E.hours.v * E.rate.v)), ex.costPerQ);
ok('Example: per year and break-even budget = per question × questions a year', near(ex.costPerYear, ex.costPerQ * E.perYear.v) && near(ex.breakEven, ex.costPerYear) && near(ex.monthsPerYear, ex.daysPerYear / V.DAYS_PER_MONTH), ex);
const pb = V.compute({ days: 1, hours: 8, rate: 95, run: 200, perYear: 10, weeks: 12 }, S);
ok('Payback: build effort in person weeks × 40 h × rate, divided by the monthly saving', near(pb.buildCost, 12 * 40 * 95) && near(pb.costPerQ, S.perProject * (8 * 95 + 200)) && near(pb.paybackMonths, pb.buildCost / (pb.costPerYear / 12)), pb);
const empty = V.compute({}, S);
ok('Calculator: nothing entered gives no days, cost or break-even', empty.daysPerQ == null && empty.costPerQ == null && empty.breakEven == null, empty);
const neg = V.compute({ days: -1, hours: 'x', rate: 95, perYear: 10 }, S);
ok('Calculator: negative or non-numeric input is ignored, not used', neg.daysPerQ == null && neg.costPerQ == null, neg);
ok('Example values carry a source, and the hourly rate names freelancermap', Object.values(E).every((e) => e.src && e.src.length > 10) && E.rate.src.includes('freelancermap') && E.days.src.includes('Geberit'));

// why.html: the numbers written into the page (shown before or without the data) match the data
const why = fs.readFileSync(path.join(ROOT, 'why.html'), 'utf8');
const pv = (k) => { const m = why.match(new RegExp(`data-v="${k}">([^<]*)<`)); return m ? m[1] : null; };
const fmt = (v) => (v % 1 ? v.toFixed(1) : String(v));
ok('why.html: written figures match the data (timeline, headline, races, fast alone)', pv('classic') === `${fmt(S.medClassic)} days` && pv('ai') === `${fmt(S.medAi)} days` && pv('per') === `${fmt(S.perProject)} fewer` && pv('fewer') === `${S.fewer} of ${S.n}` && pv('miss') === `${S.fastMiss} of ${S.n}`, { classic: pv('classic'), ai: pv('ai'), per: pv('per'), fewer: pv('fewer'), miss: pv('miss') });
ok('why.html: no statement of the setter is hidden in a comment (the 2.0 "3 of 8" bug)', !/\/\/[^\n]*set\('/.test(why));

// slides/figures.json, written by tools/media.js from the page
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'slides', 'figures.json'), 'utf8'));
ok('slides/figures.json: the page reported the same per-project figure and example', F.value && near(F.value.stats.perProject, S.perProject) && near(F.value.example.costPerQ, ex.costPerQ) && near(F.value.example.breakEven, ex.breakEven), F.value && { per: F.value.stats.perProject, cost: F.value.example.costPerQ });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
