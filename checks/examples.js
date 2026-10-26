// The example scripts in examples/ (2.1.1): they run, write what they promise, and their ranges are the page's.
//   node checks/examples.js
// Runs batch-csv.js on 12 designs into a temporary file and coef-sensitivity.js on the washdown preset, and checks
// that every range in both scripts equals the slider range in app.js. About 5 seconds.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), EX = path.join(ROOT, 'examples');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };

// slider ranges from app.js: { g: '…', k: 'key', l: '…', u: '…', min: a, max: b, … }
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const SPEC = {}; for (const m of app.matchAll(/\{ g: '(\w+)', k: '(\w+)'[^}]*?min: ([\d.]+), max: ([\d.]+)/g)) SPEC[m[2]] = { g: m[1], min: +m[3], max: +m[4] };
ok('app.js: slider ranges read for all 41 settings', Object.keys(SPEC).length === 41, Object.keys(SPEC).length);

// batch-csv.js
const bsrc = fs.readFileSync(path.join(EX, 'batch-csv.js'), 'utf8');
const vary = {}; for (const m of bsrc.slice(bsrc.indexOf('const VARY'), bsrc.indexOf('};', bsrc.indexOf('const VARY'))).matchAll(/(\w+): \[([\d.]+), ([\d.]+)\]/g)) vary[m[1]] = [+m[2], +m[3]];
ok('batch-csv.js: every varied setting uses the slider range of the page', Object.keys(vary).length > 0 && Object.entries(vary).every(([k, [lo, hi]]) => SPEC[k] && SPEC[k].min === lo && SPEC[k].max === hi), vary);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jf-ex-')), out = path.join(tmp, 'b.csv');
const log = execFileSync('node', [path.join(EX, 'batch-csv.js'), '12', out], { encoding: 'utf8' });
const lines = fs.readFileSync(out, 'utf8').trim().split('\n'), head = lines[0].split(',');
const row = (i) => Object.fromEntries(lines[i].split(',').map((v, j) => [head[j], v]));
const rows = lines.slice(1).map((_, i) => row(i + 1));
ok('batch-csv.js: writes a header and 12 rows with results', lines.length === 13 && head.includes('cleanPct') && head.includes('Qpeak_Ls') && log.includes('12 designs'), { n: lines.length, head });
ok('batch-csv.js: varied settings stay inside their ranges and results are plausible (peak flow in L/s)', rows.every((r) => Object.entries(vary).every(([k, [lo, hi]]) => +r[k] >= lo - 1e-9 && +r[k] <= hi + 1e-9) && +r.cleanPct >= 0 && +r.cleanPct <= 100 && +r.Qpeak_Ls > 0.2 && +r.Qpeak_Ls < 6), rows[0]);
const again = path.join(tmp, 'c.csv'); execFileSync('node', [path.join(EX, 'batch-csv.js'), '12', again]);
ok('batch-csv.js: the same command gives the same file', fs.readFileSync(again, 'utf8') === fs.readFileSync(out, 'utf8'));
// the first row equals a direct simulation of the same settings
global.window = global; require(path.join(ROOT, 'model.js')); const M = globalThis.FlushModel;
const p = M.defaults('washdown'); Object.keys(vary).forEach((k) => { p[k] = +rows[0][k]; });
const d = M.simulate(p, { light: true });
ok('batch-csv.js: a row equals a direct run of the model with its settings', Math.abs(d.cleanPct - +rows[0].cleanPct) < 0.02 && Math.abs(d.water - +rows[0].water_L) < 0.002, { direct: d.cleanPct, csv: rows[0].cleanPct });
fs.rmSync(tmp, { recursive: true, force: true });

// coef-sensitivity.js
const csrc = fs.readFileSync(path.join(EX, 'coef-sensitivity.js'), 'utf8');
const coef = {}; for (const m of csrc.matchAll(/(\w+): \['[^']*', ([\d.]+), ([\d.]+)\]/g)) coef[m[1]] = [+m[2], +m[3]];
const pageCoef = Object.keys(SPEC).filter((k) => SPEC[k].g === 'coef');
ok('coef-sensitivity.js: covers exactly the 13 model coefficients of the page, with their slider ranges', pageCoef.length === 13 && pageCoef.every((k) => coef[k] && coef[k][0] === SPEC[k].min && coef[k][1] === SPEC[k].max) && Object.keys(coef).length === 13, { page: pageCoef, script: Object.keys(coef) });
const sens = execFileSync('node', [path.join(EX, 'coef-sensitivity.js')], { encoding: 'utf8' }).trim().split('\n');
const table = sens.slice(4);
ok('coef-sensitivity.js: prints the base result and one row per coefficient, largest effect on cleaning first', sens[0].startsWith('washdown preset: cleaned 86.5 %') && table.length === 13 && /^Jcrit|^tauC/.test(table[0]), sens.slice(0, 6));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
