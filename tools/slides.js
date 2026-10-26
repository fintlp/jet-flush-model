// Builds slides/jet-flush-model.pptx: thirteen slides that tell the story on their own, with speaker notes on every
// slide, for presenting and for reading without a presenter. Images and videos come from media/ and
// cfd/washdown/media/; page figures from slides/figures.json (written by tools/media.js from the live page); the
// challenge and savings figures from challenge-data.js through value-core.js, the same code the pages use.
// Run media.js first.
//   node tools/slides.js
// The PDF: node tools/slides.js --pdf writes slides/jet-flush-model-pdf.pptx with the posters instead of the videos
// (LibreOffice would embed the videos in the PDF), then
//   soffice --headless --convert-to pdf --outdir slides slides/jet-flush-model-pdf.pptx
// and rename the result to slides/jet-flush-model.pdf; the -pdf.pptx is not kept.
// media/qr-live.png (the link to the live page) was made once with Python's qrcode package.
// Fonts: Ubuntu (Capgemini-inspired look, as the page). PowerPoint on a computer without Ubuntu substitutes a font.
const path = require('path'), fs = require('fs');
const pptxgen = require('pptxgenjs');
const ROOT = path.join(__dirname, '..'), M = (f) => path.join(ROOT, 'media', f), CM = (f) => path.join(ROOT, 'cfd', 'washdown', 'media', f);
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'slides', 'figures.json'), 'utf8'));
global.window = global; require(path.join(ROOT, 'challenge-data.js'));
const V = require(path.join(ROOT, 'value-core.js')), S = V.stats();
const VERSION = 'v2.1.1', DATE = '26 October 2026', PDF = process.argv.includes('--pdf');
// the story video was recorded with 2.1.0 and is unchanged in 2.1.1
const REC = 'v2.1.0', REC_DATE = '22 October 2026';
const LIVE = 'https://fintlp.github.io/jet-flush-model/', CONTACT = 'https://fintlp.github.io/latest-news/#contact';
// a video, or for the PDF its poster image
const video = (sl, o) => (PDF ? sl.addImage({ data: o.cover, x: o.x, y: o.y, w: o.w, h: o.h, objectName: o.objectName }) : sl.addMedia(o));
const FOOT = `Peter Fintl   ·   github.com/fintlp/jet-flush-model   ·   ${VERSION}   ·   ${DATE}`;
const NAVY = '0F2538', NIGHT = '08131D', BLUE = '0070AD', CYAN = '12ABDB', MUTED = '52667A', LINE = 'D8E0E8', TINT = 'F3F5F8', BROWN = '8A5A2B', GREEN = '17876C', WHITE = 'FFFFFF', PALE = 'C9D6E2', DIM = '8FA3B5';
const THEME = { name: 'Jet Flush 2.1', headFontFace: 'Ubuntu', bodyFontFace: 'Ubuntu',
  colors: { dk1: NAVY, lt1: WHITE, dk2: BLUE, lt2: TINT, accent1: BLUE, accent2: CYAN, accent3: GREEN, accent4: BROWN, accent5: MUTED, accent6: 'B0341D', hlink: BLUE, folHlink: '005A8C' } };
const pct = (v) => `${Math.round(v)} %`;
const f1 = (v) => { const x = Math.round(v * 10) / 10; return x.toLocaleString('en', { maximumFractionDigits: 1 }); };
const eur = (v) => `${Math.round(v).toLocaleString('en')} €`;
// '≈', '→' and '−' are not in every copy of Ubuntu: set them in Arial so they never fall back to an unknown font
const sym = (t) => (typeof t !== 'string' ? t : t.split(/([≈→−×÷])/).filter((x) => x).map((x) => (/[≈→−×÷]/.test(x) ? { text: x, options: { fontFace: 'Arial' } } : { text: x })));
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const imgSize = (f) => { const b = fs.readFileSync(f); if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; let i = 2; while (i < b.length) { const m = b[i + 1], L = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + L; } return null; };
const fit = (f, w, h) => { const s = imgSize(f), r = Math.min(w / s.w, h / s.h); return { w: s.w * r, h: s.h * r }; };

// figures from the guided story (slides/figures.json, demo: the text of every step)
const step = (t) => (F.demo || []).find((s) => s.title === t) || { text: '' };
const num = (txt, re) => { const m = txt.match(re); return m ? m[1] : null; };
const ovalTo = num(step('Make the bowl oval').text, /(\d+) %/), jetsTo = num(step('Move the jets').text, /recovers to (\d+) %/);
const win = step('Load the winner').text, winClean = num(win, /Cleaning (\d+) %/), winWater = num(win, /Water ([\d.]+) L/), winNoise = num(win, /Noise ([−-][\d.]+) dB/);
const C = F.cfd, hours = Math.round(C.wallClock_s / 1800) / 2, pre = Math.round(F.preset.clean);
// the worked example of the savings calculator, with its example values
const EX = V.EXAMPLES, ex = V.compute({ days: EX.days.v, hours: EX.hours.v, rate: EX.rate.v, run: '', perYear: EX.perYear.v }, S);

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';   // 13.33 x 7.5 in
pres.author = 'Peter Fintl'; pres.title = 'Tangential Jet Flush Model 2.1: faster design loops with a fast physics model and AI';
pres.theme = { headFontFace: 'Ubuntu', bodyFontFace: 'Ubuntu' };
const footer = (dark) => [{ text: { text: FOOT, options: { x: 0.6, y: 7.02, w: 10.5, h: 0.3, fontSize: 10, color: dark ? DIM : MUTED, margin: 0 } } }];
pres.defineSlideMaster({ title: 'Title dark', background: { color: NIGHT },
  objects: [...footer(true), { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.95, w: 6.7, h: 1.9, fontSize: 38, bold: true, color: WHITE, align: 'left', valign: 'top', margin: 0 }, text: '' } }],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: DIM } });
pres.defineSlideMaster({ title: 'Message', background: { color: WHITE },
  objects: [...footer(false), { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.62, w: 12.1, h: 0.95, fontSize: 30, bold: true, color: NAVY, align: 'left', valign: 'top', margin: 0 }, text: '' } }],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: MUTED } });

// the motif: blue circles with a number, as the story parts and steps on the page
const dot = (sl, x, y, d, n, o) => { o = o || {};
  sl.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: o.fill || BLUE }, line: { color: o.fill || BLUE }, objectName: `${o.name || 'Marker'} circle` });
  sl.addText(String(n), { x, y, w: d, h: d, align: 'center', valign: 'middle', fontSize: o.size || 16, bold: true, color: o.color || WHITE, margin: 0, isTextBox: true, objectName: `${o.name || 'Marker'} number` }); };
// small label above the title: where we are in the story
const kicker = (sl, t, dark) => sl.addText(t, { x: 0.6, y: 0.28, w: 10, h: 0.3, fontSize: 12, bold: true, color: dark ? CYAN : BLUE, charSpacing: 1.5, margin: 0, isTextBox: true, objectName: 'Kicker' });
const text = (sl, t, o) => sl.addText(sym(t), Object.assign({ fontSize: 15, color: NAVY, margin: 0, valign: 'top', isTextBox: true }, o));
const stat = (sl, i, x, y, w, v, l, o) => { o = o || {};
  sl.addText(sym(v), { x, y, w, h: o.vh || 0.65, fontSize: o.size || 30, bold: true, color: o.color || BLUE, margin: 0, valign: 'bottom', isTextBox: true, objectName: `Stat ${i} value` });
  sl.addText(sym(l), { x, y: y + (o.vh || 0.65) + 0.08, w, h: o.lh || 0.75, fontSize: o.ls || 14, color: o.lc || NAVY, margin: 0, valign: 'top', isTextBox: true, objectName: `Stat ${i} label` }); };
const caveat = (sl, t, dark, y) => sl.addText(t, { x: 0.6, y: y || 6.42, w: 12.1, h: 0.5, fontSize: 10.5, italic: true, color: dark ? DIM : MUTED, margin: 0, valign: 'top', isTextBox: true, objectName: 'Caveat' });
const card = (sl, x, y, w, h, name, o) => { o = o || {}; sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: o.fill || TINT }, line: { color: o.line || LINE, width: 0.75 }, objectName: name }); };
const caption = (sl, t, x, y, w, dark) => sl.addText(t, { x, y, w, h: 0.4, fontSize: 10.5, color: dark ? DIM : MUTED, margin: 0, valign: 'top', isTextBox: true, objectName: 'Caption' });
const arrow = (sl, x1, y1, x2, y2, name, col, noHead) => sl.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: x2 < x1, flipV: y2 < y1, line: noHead ? { color: col || MUTED, width: 1.5 } : { color: col || MUTED, width: 1.5, endArrowType: 'triangle' }, objectName: name });
const add = (master, section) => pres.addSlide({ masterName: master, sectionTitle: section });

// ---------- 1 · title and the message in one slide ----------
pres.addSection({ title: 'Opening' });
{
  const sl = add('Title dark', 'Opening');
  kicker(sl, 'TANGENTIAL JET FLUSH MODEL 2.1', true);
  sl.addText('Faster design loops with a fast physics model and AI', { placeholder: 'title' });
  text(sl, 'A rimless toilet flush as a worked example: answer most design questions in seconds, and spend expensive simulation only where it decides.', { x: 0.6, y: 2.95, w: 6.5, h: 0.9, fontSize: 16, color: PALE, objectName: 'Subtitle' });
  const v = fit(M('playback.png'), 5.2, 3.7);
  video(sl, { type: 'video', path: M('flush-playback.mp4'), cover: b64(M('playback.png')), x: 12.73 - v.w, y: 0.75, w: v.w, h: v.h, objectName: 'Flush playback video' });
  caption(sl, 'The fast model on the page: one flush, computed in 20 to 40 ms. Films on the wall, pool swirl, waste.', 12.73 - v.w, 0.82 + v.h, v.w, true);
  card(sl, 0.6, 4.05, 6.5, 1.45, 'Key message card', { fill: '122333', line: '1C3044' });
  stat(sl, 1, 0.85, 4.12, 6.0, `${f1(S.perProject)} fewer expensive iterations`, `per design question in the typical project of our challenge: ${f1(S.medClassic)} → ${f1(S.medAi)}, about ${f1(S.perProject)} working days (synthetic reference, see slide 7)`, { color: CYAN, lc: WHITE, size: 24, vh: 0.5, lh: 0.75, ls: 13.5 });
  card(sl, 0.6, 5.68, 6.5, 0.55, 'Live link card', { fill: '122333', line: '1C3044' });
  sl.addText([{ text: 'Try it live   ', options: { bold: true, color: WHITE } }, { text: 'fintlp.github.io/jet-flush-model', options: { color: CYAN, hyperlink: { url: LIVE } } }], { x: 0.85, y: 5.68, w: 6.1, h: 0.55, fontSize: 15, valign: 'middle', margin: 0, isTextBox: true, objectName: 'Live link' });
  caveat(sl, 'A demonstrator: the model is physics-based but not yet calibrated against real bowls; the challenge uses a synthetic reference; the CFD is a second simulation of one design. Each slide says what is measured and what is assumed.', true);
  sl.addNotes(`This deck shows, on a concrete example, how a fast physics model with AI on top can shorten engineering design loops.

The example is a rimless toilet flush: rim jets wash the bowl, the pool swirls, waste leaves through the trap. Everyone understands the result, but the physics is hard: free surfaces, thin films, swirl and solids.

The main message: in our engineering challenge, the typical design question needed ${f1(S.perProject)} fewer expensive iterations when a fast model learned from every expensive run, ${f1(S.medClassic)} against ${f1(S.medAi)}. At about one working day per iteration that is about ${f1(S.perProject)} working days per design question. The challenge uses a synthetic reference instead of real CFD, so read this as a demonstration of the mechanism, not as a result from a real project.

The deck goes: the problem (slide 2), the approach (3), where it fits in the development of a sanitary product (4), three proofs on the page (5 to 7), what it is worth and how to calculate it for your own team (8), where else it applies (9), what is and is not shown (10), what changes on each level of a development (11), how a team would start and who does what (12), and what to do next (13).

Everything shown runs live at fintlp.github.io/jet-flush-model.`);
}

// ---------- 2 · the problem ----------
pres.addSection({ title: 'Problem and approach' });
{
  const sl = add('Message', 'Problem and approach');
  kicker(sl, 'THE PROBLEM');
  sl.addText('Design loops wait for expensive answers', { placeholder: 'title' });
  const pts = [
    ['Every design question waits.', 'Each candidate goes through a high-fidelity simulation or a prototype: set it up, run it, evaluate it, decide.'],
    ['About one working day per iteration.', 'Geberit reported this for its CFD-led bowl development, with more than 100 virtual drafts before the first prototype.'],
    ['So teams ask few questions.', 'Many design decisions are still made on experience, before any number exists.'],
    ['Late answers are expensive.', 'A weak decision found late costs most to change: in the tool, the mould, the production line.']];
  const runs = []; pts.forEach(([h, d], i) => { runs.push({ text: h + ' ', options: { bold: true, color: NAVY } }); runs.push({ text: d, options: { color: NAVY, breakLine: i < pts.length - 1 } }); });
  sl.addText(runs, { x: 0.6, y: 1.85, w: 5.6, h: 4.3, fontSize: 16, margin: 0, valign: 'top', paraSpaceAfter: 14, isTextBox: true, objectName: 'Problem points' });
  // the loop: four boxes in a cycle around the clock
  const cx = 9.67, cy = 3.95, bh = 0.85, tw = 2.4, sw = 2.0, xl = 6.6, xr = 12.73 - sw, yt = 1.85, yb = 5.2;
  const boxes = [['Design idea', cx - tw / 2, yt, tw], ['Set up the run', xr, cy - bh / 2, sw], ['CFD run or prototype', cx - tw / 2, yb, tw], ['Evaluate and decide', xl, cy - bh / 2, sw]];
  boxes.forEach(([t, x, y, w], i) => { card(sl, x, y, w, bh, `Loop step ${i + 1}`, { fill: i === 2 ? 'F4ECE4' : TINT, line: i === 2 ? BROWN : LINE });
    sl.addText(t, { x, y, w, h: bh, fontSize: 15, bold: true, color: i === 2 ? BROWN : NAVY, align: 'center', valign: 'middle', margin: 0.05, isTextBox: true, objectName: `Loop step ${i + 1} text` }); });
  arrow(sl, cx + tw / 2 + 0.05, yt + bh / 2, xr + sw / 2, cy - bh / 2 - 0.08, 'Loop arrow 1');
  arrow(sl, xr + sw / 2, cy + bh / 2 + 0.08, cx + tw / 2 + 0.05, yb + bh / 2, 'Loop arrow 2');
  arrow(sl, cx - tw / 2 - 0.05, yb + bh / 2, xl + sw / 2, cy + bh / 2 + 0.08, 'Loop arrow 3');
  arrow(sl, xl + sw / 2, cy - bh / 2 - 0.08, cx - tw / 2 - 0.05, yt + bh / 2, 'Loop arrow 4');
  sl.addText(sym('≈ 1 day'), { x: cx - 1.0, y: cy - 0.45, w: 2.0, h: 0.5, fontSize: 24, bold: true, color: BLUE, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'Loop time' });
  sl.addText('one working day per turn of the loop', { x: cx - 1.0, y: cy + 0.06, w: 2.0, h: 0.5, fontSize: 12, color: MUTED, align: 'center', valign: 'top', margin: 0, isTextBox: true, objectName: 'Loop time label' });
  caveat(sl, 'Source: CADFEM Journal, "Simulation leads Geberit to design a toilet bowl with asymmetrical geometry". The same pattern holds wherever design decisions wait for CFD, crash, rig or prototype tests.');
  sl.addNotes(`Engineering rarely slows down because people run out of ideas. It slows down because every idea waits for an answer.

In a typical product development, each design candidate goes through an expensive step: a high-fidelity simulation such as CFD, or a physical prototype. Someone sets up the run, it runs overnight, someone evaluates it, and the team decides on the next candidate. That is one iteration.

Geberit, in a published account of its CFD-led bowl development, put this at about one working day per iteration, with more than a hundred virtual drafts before the first prototype. That is fast compared with physical testing. But it still means a team can only afford a limited number of questions. Many decisions are made on experience before any number exists, and a weak decision found late costs the most to change: in the tool, the mould or the production line.

The question for a manager is therefore not how fast the solver is. It is how many iterations a design question needs.`);
}

// ---------- 3 · the approach ----------
{
  const sl = add('Message', 'Problem and approach');
  kicker(sl, 'THE APPROACH');
  sl.addText('Fast physics explores, AI narrows, high fidelity decides', { placeholder: 'title' });
  const tiers = [
    ['Fast physics model', 'thousands of variants, milliseconds each', 'E3EEF5', NAVY],
    ['AI on top', 'optimise, learn surrogates, correct the model: tens of candidates', 'D7E8F2', NAVY],
    ['High fidelity: CFD, rig, prototype', 'a few finalists, hours to days each', 'DCEFE9', GREEN]];
  tiers.forEach(([t, d, fill, col], i) => {
    const x = 0.6 + i * 0.45, w = 7.4 - i * 0.9, y = 1.9 + i * 1.3;
    card(sl, x, y, w, 1.1, `Tier ${i + 1}`, { fill, line: fill });
    dot(sl, x + 0.25, y + 0.27, 0.56, i + 1, { name: `Tier ${i + 1}`, fill: i === 2 ? GREEN : BLUE });
    sl.addText([{ text: t, options: { bold: true, color: col, breakLine: true, fontSize: 17 } }, { text: d, options: { color: NAVY, fontSize: 14 } }], { x: x + 1.0, y: y + 0.1, w: w - 1.2, h: 0.9, valign: 'middle', margin: 0, isTextBox: true, objectName: `Tier ${i + 1} text` });
  });
  // every expensive run feeds back
  arrow(sl, 7.55, 4.95, 8.15, 4.95, 'Feedback arrow 1', BLUE, true);
  arrow(sl, 8.15, 4.95, 8.15, 2.45, 'Feedback arrow 2', BLUE, true);
  arrow(sl, 8.15, 2.45, 8.02, 2.45, 'Feedback arrow 3', BLUE);
  text(sl, 'every expensive run also calibrates the fast model', { x: 8.3, y: 3.25, w: 1.6, h: 1.1, fontSize: 12.5, color: BLUE, objectName: 'Feedback label' });
  card(sl, 10.05, 1.9, 2.68, 4.3, 'Example card');
  text(sl, 'On the toilet flush', { x: 10.25, y: 2.05, w: 2.3, h: 0.35, fontSize: 14, bold: true, objectName: 'Example heading' });
  stat(sl, 1, 10.25, 2.35, 2.35, '20–40 ms', 'per flush, fast model, in a browser', { size: 22, vh: 0.45, lh: 0.5, ls: 12.5 });
  stat(sl, 2, 10.25, 3.6, 2.35, sym('≈ 540'), 'designs searched by the AI in about 10 s', { size: 22, vh: 0.45, lh: 0.5, ls: 12.5 });
  stat(sl, 3, 10.25, 4.85, 2.35, sym(`≈ ${hours} hours`), `for ${C.end} s of the same flush in OpenFOAM CFD, ${C.cores} cores`, { size: 22, vh: 0.45, lh: 0.7, ls: 12.5, color: GREEN });
  caveat(sl, 'The answer is not to replace CFD or tests. It is to put the right tool at each stage and connect them, so that the slow tools are spent only on the designs that deserve them.');
  sl.addNotes(`The approach uses three speeds of simulation together.

First, a fast physics model. It keeps only the main mechanisms in a few equations: here the cistern, the jet films on the wall, the pool swirl, the trap and the waste. One flush takes 20 to 40 milliseconds in a browser. Because it is physics, engineers can argue with it, and it points the right way even before it is calibrated.

Second, AI on top. Optimisation searches the design space for targets and trade-offs: about 540 designs in about ten seconds. Surrogates learn expensive models, and a correction learned from expensive runs fixes what the fast model gets wrong.

Third, high fidelity where it counts. CFD, the test rig or a prototype check the few designs that survive. The same flush took about ${hours} hours in OpenFOAM on ${C.cores} cores.

The loop closes because every expensive run is used twice: for the decision, and to improve the fast model for the next question.`);
}

// ---------- 4 · where it fits: the development chain ----------
{
  const sl = add('Message', 'Problem and approach');
  kicker(sl, 'WHERE IT FITS');
  sl.addText('CFD is one of six steps, and the fast model helps in two', { placeholder: 'title' });
  text(sl, 'A new toilet goes through six steps. Each can send a design back; the costly loops are often in moulds and firing.', { x: 0.6, y: 1.5, w: 12.1, h: 0.45, fontSize: 15, color: MUTED, objectName: 'Lead' });
  const steps = [
    ['Industrial design', 'Shape, look and user needs; sketches, renderings, market feedback', 'Not in the model', 'off'],
    ['Product engineering', 'Hydraulics, structure, interfaces, ceramic design rules', 'Helps today: hydraulics', 'now'],
    ['Prototypes and tests', 'Prototypes, flush tests on the rig, EN 997 type tests', 'Helps today: fewer rounds', 'now'],
    ['Moulds and firing', 'Moulds, pilot casting, firing, mould correction; about 10\u00a0% shrinkage in firing', 'Possible next step', 'next'],
    ['Series production', 'Slip and glaze, casting, drying, glazing, firing, sorting', 'Not in the model', 'off'],
    ['Certification', 'Type tests, factory production control, CE marking', 'Not in the model', 'off']];
  const gw = 0.15, W = (12.13 - gw * 5) / 6, y0 = 2.1, H = 2.45;
  steps.forEach(([h, d, st, k], i) => {
    const x = 0.6 + i * (W + gw);
    sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y0, w: W, h: H, rectRadius: 0.1, fill: { color: k === 'now' ? 'DCEFE9' : k === 'next' ? 'E3EEF5' : TINT }, line: { color: k === 'now' ? GREEN : k === 'next' ? BLUE : LINE, width: k === 'off' ? 0.75 : 1.25, dashType: k === 'next' ? 'dash' : 'solid' }, objectName: `Chain step ${i + 1} card` });
    dot(sl, x + 0.12, y0 + 0.12, 0.42, i + 1, { name: `Chain step ${i + 1}`, size: 13, fill: k === 'now' ? GREEN : k === 'next' ? BLUE : MUTED });
    sl.addText([{ text: h, options: { bold: true, color: NAVY, fontSize: 13.5, breakLine: true } }, { text: d, options: { color: NAVY, fontSize: 11.5 } }], { x: x + 0.12, y: y0 + 0.65, w: W - 0.24, h: 1.25, margin: 0, valign: 'top', isTextBox: true, objectName: `Chain step ${i + 1} text` });
    sl.addText(st, { x: x + 0.12, y: y0 + H - 0.42, w: W - 0.24, h: 0.34, fontSize: 11, bold: true, color: k === 'now' ? GREEN : k === 'next' ? BLUE : MUTED, margin: 0, valign: 'bottom', isTextBox: true, objectName: `Chain step ${i + 1} status` });
  });
  card(sl, 0.6, 4.8, 12.13, 1.5, 'Where it fits card', { fill: 'D7E8F2', line: BLUE });
  sl.addText([{ text: 'Today ', options: { bold: true, color: BLUE } }, { text: 'the fast model helps with the hydraulics in product engineering, and saves prototype rounds in testing. ', options: { color: NAVY, breakLine: true } },
    { text: 'Next ', options: { bold: true, color: BLUE } }, { text: 'it could be linked with the firing: a flush optimised in simulation only reaches the bathroom if the mould allows for shrinkage and sagging in the kiln. Published finite element work predicts the fired shape to within a few percent.', options: { color: NAVY } }],
  { x: 0.85, y: 4.85, w: 11.65, h: 1.4, fontSize: 14.5, valign: 'middle', margin: 0, paraSpaceAfter: 6, isTextBox: true, objectName: 'Where it fits text' });
  caveat(sl, 'Shrinkage and sagging from published work on sanitary ware firing (sources page, section 11). The fast model covers the hydraulics only; the other steps are not part of it.', false, 6.42);
  sl.addNotes(`Before the proofs, a word on where this fits. CFD is only one step in the development of a sanitary product.

A new toilet goes through six steps. Industrial design sets the shape and the look. Product engineering covers the hydraulics, the structure of a wall-hung pan, the interfaces to cistern, frame and seat, and the design rules of ceramics. Prototypes are milled or printed and tested on the rig, and type tests follow EN 997. Then the moulds: mould design and making, pilot casting, drying and firing, and correcting the mould. The piece shrinks about 3 percent in drying and about 10 percent in firing, and it sags under its own weight in the kiln. After that come series production, and certification and quality.

Each step can send a design back to an earlier one, and the most expensive loops are often in moulds and firing, not in simulation.

The fast model helps today in two steps: in product engineering, for the hydraulics, and in prototypes and tests, because fewer designs need a prototype. A possible next step links the hydraulics with the firing. A flush optimised in simulation only reaches the bathroom if the mould allows for the shrinkage and sagging, and published work shows that finite element models can predict the fired shape to within a few percent. Industrial design, structure and production are not part of the fast model.`);
}

// ---------- 5 · proof 1, the fast model ----------
pres.addSection({ title: 'Three proofs on the page' });
{
  const sl = add('Message', 'Three proofs on the page');
  kicker(sl, '1 · THE FAST MODEL');
  sl.addText('Design changes are tested while the meeting is still on', { placeholder: 'title' });
  text(sl, 'Change the bowl or the jets and see cleaning, waste removal, water use and noise at once. The AI lab searches for designs that meet set targets.', { x: 0.6, y: 1.55, w: 12.1, h: 0.55, fontSize: 15, color: MUTED, objectName: 'Lead' });
  const img = M('ai-optimiser-chart.png'), s = fit(img, 6.5, 3.7);
  sl.addImage({ path: img, x: 0.6, y: 2.2, w: s.w, h: s.h, objectName: 'Optimiser chart' });
  caption(sl, 'AI lab: each dot is one simulated flush; the curve is the best trade-off between score and water.', 0.6, 2.25 + s.h, s.w);
  text(sl, 'From the guided demo, part 1', { x: 7.75, y: 2.2, w: 5.0, h: 0.35, fontSize: 14, bold: true, objectName: 'Moments heading' });
  const mo = [[`${pre} % → ${ovalTo} %`, 'wall cleaned when the bowl turns oval, jets at the ends of the long axis'], [`→ ${jetsTo} %`, 'after moving the jets to the long sides'], [`${winClean} % at ${winWater} L`, `design found by the AI lab: 0.5 L less water than the start, ${winNoise ? winNoise.replace('-', '−') + ' dB, no louder' : 'no louder'}`]];
  mo.forEach(([v, l], i) => { dot(sl, 7.75, 2.75 + i * 1.2 + 0.12, 0.42, i + 1, { name: `Moment ${i + 1}`, size: 13 }); stat(sl, i + 1, 8.35, 2.7 + i * 1.2, 4.4, v, l, { size: 24, vh: 0.5, lh: 0.55, ls: 13 }); });
  caveat(sl, 'Illustrative estimates from the uncalibrated model, for comparing designs. Noise is a relative, experimental indicator. AI suggestions are candidates for a CFD or rig check, not final answers.');
  sl.addNotes(`The first proof: a fast model makes design questions cheap enough to ask in the meeting.

In part 1 of the guided demo we take the standard washdown bowl, ${pre} percent of the wall cleaned. Real bowls are oval, so we make it oval, with the jets at the ends of the long axis: cleaning drops to ${ovalTo} percent, because the film is pushed hard against the tight ends and misses the flat sides. Moving the jets to the long sides brings it back to ${jetsTo} percent. Each of these answers takes milliseconds.

Then we give the AI lab targets: at most 4.0 litres, at least one point more cleaning, no louder. It searches about 540 designs in about ten seconds and checks the best ones at full resolution. It finds a design with ${winClean} percent cleaning at ${winWater} litres.

The chart shows the search: each dot is one simulated flush, the curve the best trade-off between score and water.

The numbers are estimates from a model that is not calibrated yet. The point is the speed of the loop, and that the result is a candidate for an expensive check, not a final answer.`);
}

// ---------- 6 · proof 2, checked against CFD ----------
{
  const sl = add('Message', 'Three proofs on the page');
  kicker(sl, '2 · CHECKED AGAINST CFD');
  sl.addText('Against full CFD: close on the totals, different in the details', { placeholder: 'title' });
  text(sl, `The same bowl and jets in OpenFOAM: about ${hours} hours on ${C.cores} cores for ${C.end} s of flush, against about 30 ms for the fast model.`, { x: 0.6, y: 1.55, w: 12.1, h: 0.55, fontSize: 15, color: MUTED, objectName: 'Lead' });
  const maps = M('cfd-maps.png'), s = fit(maps, 7.9, 2.35);
  sl.addImage({ path: maps, x: 0.6, y: 2.2, w: s.w, h: s.h, objectName: 'Wall maps' });
  caption(sl, 'What gets cleaned, wall unrolled: CFD left, fast model right (green cleaned, grey wetted only).', 0.6, 2.25 + s.h, s.w);
  const still = CM('cutaway_1.0s.jpg'), s2 = fit(still, 3.9, 2.35);
  sl.addImage({ path: still, x: 12.73 - s2.w, y: 2.2, w: s2.w, h: s2.h, objectName: 'CFD still' });
  caption(sl, 'CFD water surface at 1.0 s, front half removed.', 12.73 - s2.w, 2.25 + s2.h, s2.w);
  const st = [[`${pct(C.cClean)} vs ${pct(C.mClean)}`, 'of the wall cleaned, CFD vs fast model: close totals'],
    [`${C.firstCfd.toFixed(2)} s vs ${C.firstModel.toFixed(2)} s`, 'first water in the pool: in the model it arrives later'],
    [pct(C.iouCM), 'overlap of the uncleaned areas: the model gets the total, not where the gaps are']];
  st.forEach(([v, l], i) => stat(sl, i + 1, 0.6 + i * 4.1, 4.95, 3.8, v, l, { size: 26, vh: 0.55, lh: 0.65 }));
  caveat(sl, `A second simulation of one design, not a measurement or a validation. Trap outflow taken from the model; after 1.3 s the CFD outlet draws air. On two CFD meshes the totals agree and the uncleaned areas overlap ${pct(C.sens.iouU)}: a sensitivity, not mesh independence.`);
  sl.addNotes(`The second proof: we checked the fast model against a full flow simulation, and we show where it differs.

We simulated the same bowl with the same jets in OpenFOAM, a full CFD code that simulates water and air in about ${(Math.round(C.cells / 10000) * 10000).toLocaleString('en')} cells. ${C.end} seconds of flush took about ${hours} hours on ${C.cores} processor cores. The fast model needs about 30 milliseconds.

On the totals they are close: the CFD cleans ${pct(C.cClean)} of the wall, the fast model ${pct(C.mClean)}. In the details they differ: the first water reaches the pool after ${C.firstCfd.toFixed(2)} seconds in the CFD and ${C.firstModel.toFixed(2)} seconds in the model, the CFD pool swirls faster, and the areas each leaves uncleaned overlap only ${pct(C.iouCM)}. On a second, coarser CFD mesh the totals stay the same, and the uncleaned areas of the two meshes overlap ${pct(C.sens.iouU)}, so the exact pattern is uncertain in the CFD too.

This is a second simulation of one design, not a measurement and not a validation. Whether the fast model gets the effect of design changes right needs CFD runs of several designs. That is why the next step matters: let the expensive runs correct the fast model during the design.`);
}

// ---------- 7 · proof 3, AI in the loop ----------
{
  const sl = add('Message', 'Three proofs on the page');
  kicker(sl, '3 · AI IN THE ENGINEERING LOOP');
  sl.addText('Learning from each run: less than half the iterations', { placeholder: 'title' });
  text(sl, `The same design task, worked eight times: an oval bowl must reach 4.0 L and 87 % cleaning. Every candidate is checked with an expensive run.`, { x: 0.6, y: 1.55, w: 12.1, h: 0.55, fontSize: 15, color: MUTED, objectName: 'Lead' });
  sl.addChart(pres.charts.BAR, [
    { name: 'Classic: one change at a time', labels: S.classic.map((_, i) => `Race ${i + 1}`), values: S.classic },
    { name: 'AI-assisted: fast model + learned correction', labels: S.ai.map((_, i) => `Race ${i + 1}`), values: S.ai }],
  { x: 0.6, y: 2.2, w: 7.3, h: 3.95, barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 60, chartColors: [BROWN, BLUE],
    showTitle: true, title: 'Expensive iterations to reach the targets', titleFontSize: 13, titleColor: NAVY, titleFontFace: '+mn-lt',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10, dataLabelColor: NAVY, dataLabelFontFace: '+mn-lt',
    showLegend: true, legendPos: 'b', legendFontSize: 11, legendFontFace: '+mn-lt', legendColor: NAVY,
    catAxisLabelColor: MUTED, catAxisLabelFontSize: 10.5, catAxisLabelFontFace: '+mn-lt', valAxisLabelColor: MUTED, valAxisLabelFontSize: 10, valAxisLabelFontFace: '+mn-lt',
    valGridLine: { color: LINE, size: 0.5 }, catGridLine: { style: 'none' }, valAxisMaxVal: 30, valAxisMajorUnit: 10, objectName: 'Races chart' });
  const x = 8.4;
  stat(sl, 1, x, 2.15, 4.3, `${f1(S.medClassic)} → ${f1(S.medAi)}`, 'iterations in the typical project (median of the eight races), classic against AI-assisted', { size: 30, vh: 0.6, lh: 0.75 });
  stat(sl, 2, x, 3.6, 4.3, `${S.fewer} of ${S.n}`, `races with fewer iterations for the AI route${S.tie ? `; ${S.tie} tie` : ''}${S.more ? `, ${S.more} with ${-S.minSaved} more` : ''}`, { size: 30, vh: 0.6, lh: 0.55 });
  stat(sl, 3, x, 4.85, 4.3, `${S.fastMiss} of ${S.n}`, 'races the fast model alone never finished: without learning from the expensive runs it gets stuck', { size: 30, vh: 0.6, lh: 0.75, color: BROWN });
  caveat(sl, 'The expensive runs come from a synthetic reference (the fast model with other coefficients and effects it does not have), not from real CFD. The task has five settings; the classic route is a simple automated search, and design of experiments would need fewer runs.');
  sl.addNotes(`The third proof: AI in the engineering loop. This is the engineering challenge on the page.

The task: an oval bowl misses its targets. It should clean 87 percent of the wall with at most 4.0 litres, without losing waste removal. Every candidate design must be checked with an expensive, high-fidelity run, which here costs 8 hours of computing. We worked the same task eight times from different starts, with three ways of working.

Classic: an automated search that changes one setting per run and keeps what helps. It needed ${f1(S.medClassic)} iterations in the typical race, between ${Math.min(...S.classic)} and ${Math.max(...S.classic)}.

Fast model alone: it screens hundreds of designs in seconds and sends its best to the expensive run. It is quick when it is right, but in ${S.fastMiss} of ${S.n} races it never met the targets, because it never learns where it is wrong.

AI-assisted: the same fast model, plus a correction learned after every expensive run, so the next run goes where success is most likely. ${f1(S.medAi)} iterations in the typical race. It needed fewer iterations than the classic route in ${S.fewer} of ${S.n} races${S.tie ? `, the same in ${S.tie}` : ''}${S.more ? `, and ${-S.minSaved} more in ${S.more}` : ''}.

Important: the expensive runs here come from a synthetic reference, the fast model with other coefficients and effects, not real CFD. It shows the mechanism, not a measured result. A hold-out set of eight more races, never used for tuning, gives the same picture.`);
}

// ---------- 8 · what it is worth ----------
pres.addSection({ title: 'What it means' });
{
  const sl = add('Message', 'What it means');
  kicker(sl, 'WHAT IT IS WORTH');
  sl.addText(`About ${f1(S.perProject)} working days saved on every design question`, { placeholder: 'title' });
  text(sl, 'The calculation, step by step, with example values. The calculator on the page takes your own figures.', { x: 0.6, y: 1.55, w: 12.1, h: 0.45, fontSize: 15, color: MUTED, objectName: 'Lead' });
  // a chain of boxes: value, then what it means, joined by the operation
  const chain = (y, items, name) => {
    const gap = 0.42, W = (12.13 - gap * (items.length - 1)) / items.length;
    items.forEach(([v, l, hi], i) => {
      const x = 0.6 + i * (W + gap);
      card(sl, x, y, W, 1.55, `${name} box ${i + 1}`, hi ? { fill: 'D7E8F2', line: BLUE } : {});
      sl.addText(sym(v), { x: x + 0.12, y: y + 0.1, w: W - 0.24, h: 0.6, fontSize: hi ? 24 : 22, bold: true, color: hi ? BLUE : NAVY, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `${name} value ${i + 1}` });
      sl.addText(sym(l), { x: x + 0.12, y: y + 0.7, w: W - 0.24, h: 0.8, fontSize: 12, color: MUTED, align: 'center', valign: 'top', margin: 0, isTextBox: true, objectName: `${name} label ${i + 1}` });
      if (i < items.length - 1) sl.addText(sym(items[i + 1][3]), { x: x + W, y: y + 0.4, w: gap, h: 0.5, fontSize: 22, bold: true, color: MUTED, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `${name} operator ${i + 1}` });
    });
  };
  chain(2.15, [[f1(S.medClassic), 'iterations, classic (typical project)'], [f1(S.medAi), 'iterations, AI-assisted', false, '−'], [f1(S.perProject), 'iterations fewer per design question', false, '='], [`${EX.days.v} day`, 'per iteration (example: Geberit)', false, '×'], [`${f1(ex.daysPerQ)} days`, 'working days saved per design question', true, '=']], 'Time');
  chain(4.0, [[`${EX.hours.v} h × ${EX.rate.v} €`, 'person hours per iteration × cost per hour (examples)'], [eur(ex.costPerQ), `per design question: ${f1(S.perProject)} × ${eur(ex.costPerIter)}`, false, '→'], [`${EX.perYear.v} a year`, 'design questions like this (example only)', false, '×'], [`${eur(ex.breakEven)} a year`, 'the break-even budget for building and calibrating a fast model', true, '=']], 'Money');
  caveat(sl, `Iteration counts from the challenge (synthetic reference, eight races; race by race the saving ranged from ${S.minSaved < 0 ? '−' + -S.minSaved : S.minSaved} to ${S.maxSaved}, median ${f1(S.medSaved)}, average ${Math.round(S.meanSaved * 100) / 100}). Examples: 1 working day per iteration from the Geberit report (CADFEM); 95 € per hour, average rate of freelance engineers in Germany (freelancermap, Feb 2026); 10 questions a year is an example only. Time to market is not priced in.`, false, 5.85);
  sl.addNotes(`What is that worth? Here is the calculation, step by step, so you can redo it.

Time first. The typical project of the challenge needed ${f1(S.medClassic)} expensive iterations with the classic route and ${f1(S.medAi)} with the AI route: ${f1(S.perProject)} fewer. At about one working day per iteration, the figure Geberit reported, that is ${f1(ex.daysPerQ)} working days saved on one design question.

Then money, with example values. Say one engineer works the whole day on an iteration, 8 hours, at 95 euros an hour, the average rate of freelance engineers in Germany. One iteration then costs ${eur(ex.costPerIter)}, and ${f1(S.perProject)} fewer iterations save ${eur(ex.costPerQ)} per design question. With 10 such questions a year, which is only an example, that is ${eur(ex.breakEven)} a year.

So the break-even: a fast model pays for itself within a year if building and calibrating it costs less than ${eur(ex.breakEven)}. We do not put a number on the building effort, because we have no measured figure for it; the calculator on the page takes your own estimate and gives the payback time.

Two cautions. The iteration counts come from a synthetic challenge, and race by race the saving varied from ${S.minSaved} to ${S.maxSaved}. And the money is only the people time. Finding a weak design weeks earlier, and getting to market sooner, is often worth much more.`);
}

// ---------- 9 · beyond the toilet ----------
{
  const sl = add('Message', 'What it means');
  kicker(sl, 'BEYOND THE TOILET');
  sl.addText('The toilet is the example, not the limit', { placeholder: 'title' });
  text(sl, 'The same pattern fits wherever design loops wait for simulation or tests. Read the calculator\'s words for your product:', { x: 0.6, y: 1.55, w: 12.1, h: 0.45, fontSize: 15, color: MUTED, objectName: 'Lead' });
  const hd = (t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 13 } });
  const rows = [
    ['Sanitary ware (this demo)', 'Reduced-order flush model: jets, wall film, pool, trap', 'Free-surface CFD, or a ceramic prototype on the rig'],
    ['Vehicle water management', 'Film and droplet paths over body, seals and drains', 'Full-vehicle CFD of rain or wading; climatic wind tunnel'],
    ['Lubrication and cooling', 'Network model of oil flow and splash in gearbox or e-motor', 'Particle (SPH) simulation of oil splash; rig with a transparent housing'],
    ['Appliances', 'Spray and drainage model of dishwasher or washing machine', 'CFD of spray arms or drum flow; wash test with a soiled load'],
    ['Sensors and ADAS', 'Droplets and airflow over camera and lidar covers', 'CFD of droplets in airflow; wind tunnel spray test']];
  sl.addTable([[hd('Product area'), hd('Fast model'), hd('Expensive run')], ...rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: j === 0, color: NAVY, fill: { color: i % 2 ? WHITE : TINT }, fontSize: 13 } })))],
    { x: 0.6, y: 2.15, w: 12.1, colW: [3.0, 4.55, 4.55], rowH: 0.62, border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0.06, 0.12, 0.06, 0.12], fontFace: 'Ubuntu', objectName: 'Product areas table' });
  caveat(sl, 'One iteration is one variant through the expensive run and its evaluation. These rows are examples of where the pattern fits, not results: none of these fast models is part of the demo.', false, 6.1);
  sl.addNotes(`A flush is a good showcase because it combines free-surface flow, thin films, swirl and transport of solids, and everyone understands the result. But the toilet is the example, not the limit.

The same pattern fits wherever design decisions wait for expensive simulations or tests. In vehicle water management, rain, spray and wading are checked with full-vehicle CFD or in the climatic wind tunnel. In gearboxes and e-motors, oil splash is simulated with particle methods or watched through a transparent housing on a rig. In appliances, spray arms and drum flows; in sensors and driver assistance, keeping cameras and lidar clean and dry.

In each case the three words of the calculator translate directly: a fast model of the main mechanisms, an expensive run that decides, and an iteration that costs a day or more. These rows are examples of where the pattern applies; none of these fast models is part of this demo.`);
}

// ---------- 10 · what is shown, and what is not yet ----------
{
  const sl = add('Message', 'What it means');
  kicker(sl, 'HONEST ABOUT THE LIMITS');
  sl.addText('What the demo shows, and what it does not show yet', { placeholder: 'title' });
  const col = (x, head, colr, items, name) => {
    card(sl, x, 1.8, 5.85, 3.9, `${name} card`, { fill: TINT });
    text(sl, head, { x: x + 0.3, y: 1.98, w: 5.3, h: 0.4, fontSize: 18, bold: true, color: colr, objectName: `${name} heading` });
    const runs = []; items.forEach(([h, d], i) => { runs.push({ text: h + ' ', options: { bold: true, color: NAVY } }); runs.push({ text: d, options: { color: NAVY, breakLine: i < items.length - 1 } }); });
    sl.addText(runs, { x: x + 0.3, y: 2.5, w: 5.3, h: 3.5, fontSize: 14, margin: 0, valign: 'top', paraSpaceAfter: 10, isTextBox: true, objectName: `${name} points` });
  };
  col(0.6, 'Shown', GREEN, [
    ['The model solves its own equations correctly:', '61 physics checks, from energy and water balance to grid and time-step convergence.'],
    ['One check against full CFD:', 'the same bowl in OpenFOAM on two meshes, with where the two differ.'],
    ['The AI workflow end to end:', 'search, surrogates, calibration and learning from expensive runs, all live in the browser.'],
    ['Every figure is traceable:', 'to a check script or to data stored with the page.']], 'Shown');
  col(6.88, 'Not shown yet', BROWN, [
    ['Calibration against real bowls:', 'the coefficients are physics-based but not fitted to rig data.'],
    ['Design trends against CFD:', 'one design was checked; trends need CFD runs of several designs.'],
    ['Real CFD in the challenge:', 'the expensive runs come from a synthetic reference.'],
    ['Noise against recordings:', 'noise is a relative indicator, fitted so far only to synthetic recordings.']], 'Not yet');
  caveat(sl, 'Use the demo to compare designs and to decide what to test, not as validated values. The presets are generic EU washdown and siphonic bowls, not any manufacturer\'s product.', false, 5.95);
  sl.addNotes(`A demo like this is only useful if it is honest about what it shows.

What it shows: the fast model solves its own equations correctly, checked by 61 automated physics checks, from energy and water balance to convergence with grid and time step. It has been compared with one full CFD simulation of the same bowl, on two meshes, including where the two differ. The AI workflow runs end to end in the browser: optimisation, surrogates, calibration, and the loop that learns from expensive runs. And every figure on the page and in this deck is traceable to a check script or to stored data.

What it does not show yet: the coefficients have not been calibrated against real bowls on a rig. Only one design was compared with CFD, so whether the fast model gets design trends right is open. The expensive runs in the challenge come from a synthetic reference, not real CFD. And noise is a relative indicator that has not been fitted to real recordings.

That is exactly the work a real project would do first. The next two slides show what changes in a team, and how it would start.`);
}

// ---------- 11 · what changes on each level ----------
{
  const sl = add('Message', 'What it means');
  kicker(sl, 'WHAT CHANGES ON EACH LEVEL');
  sl.addText('A new tool alone is not enough: six levels have to change', { placeholder: 'title' });
  text(sl, 'Today as questions, since every company starts elsewhere. Step 1 is how a team starts; step 2 is where it can lead.', { x: 0.6, y: 1.5, w: 12.1, h: 0.45, fontSize: 15, color: MUTED, objectName: 'Lead' });
  const hd = (t, c) => ({ text: t, options: { bold: true, color: c || WHITE, fill: { color: NAVY }, fontSize: 12.5 } });
  const rows = [
    ['Value', 'How long does a new variant take, and what does it cost?', 'More variants per year, fewer prototypes and mould corrections', 'Quicker reaction to market needs, know-how kept in models'],
    ['Organization and people', 'Where do projects wait: design, CFD, test rig, mould shop?', 'Design, hydraulics and mould teams work on one shared model', 'New roles, clear rules on when to trust AI results'],
    ['Process', 'How many loops from design to the first good fired piece?', 'Variants screened early, physical trials only to confirm', 'Agents run studies, engineers review and decide'],
    ['Method', 'Is each step checked on its own, one design at a time?', 'Fast flush model calibrated with CFD and test data', 'Physics-informed networks, firing distortion prediction, designs derived from targets'],
    ['Tool', 'Which CAD, CFD, FEM and test tools are in use?', 'Fast model next to the existing tools', 'Agent platform connecting CAD, simulation and mould design'],
    ['Data', 'Are test, pilot casting and scan data reused?', 'Existing CFD and test results used for calibration', 'Each test, pilot casting and scan improves the models']];
  sl.addTable([[hd('Level'), hd('Today: questions to ask'), hd('Step 1: faster variants', '9FE3C9'), hd('Step 2: AI methods and agents', CYAN)],
    ...rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: j === 0, italic: j === 1, color: j === 1 ? MUTED : NAVY, fill: { color: i % 2 ? WHITE : TINT }, fontSize: 12 } })))],
  { x: 0.6, y: 2.05, w: 12.1, colW: [2.3, 3.2, 3.3, 3.3], rowH: 0.58, border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1], fontFace: 'Ubuntu', objectName: 'Levels table' });
  caveat(sl, 'Step 1 starts small: one design question, in the four steps on the next slide. Step 2 needs step 1 first: agents and AI methods only work well on calibrated models and clean data.', false, 6.4);
  sl.addNotes(`A fast model is a tool, and a new tool on its own changes little. Faster development needs six levels to move together, from the value for the business down to the data underneath.

The first column holds questions, not answers, because every company starts from a different place. In a workshop we fill it in together: how long a new variant takes and what it costs, where projects wait, how many loops it takes to the first good fired piece, how each step is checked, which tools are in use, and whether test, pilot and scan data are reused.

This is not a reason to change everything at once. Step 1 is what this demo shows, faster variants, and it is also how a team starts. More variants per year with fewer prototypes and mould corrections; design, hydraulics and mould teams working on one shared model; variants screened early and physical trials only to confirm; a fast flush model calibrated with CFD and test data; the fast model next to the existing tools; and existing results used for calibration.

Step 2 is where the same work can lead: AI methods and agents. A quicker reaction to market needs, with know-how kept in models; new roles and clear rules on when to trust AI results; agents that run studies while engineers review and decide; physics-informed networks, prediction of firing distortion, and designs derived from targets; an agent platform connecting CAD, simulation and mould design; and models that get better with every test, pilot casting and scan.

Step 2 needs step 1 first. Agents and AI methods only work well on calibrated models and clean data. And step 1 does not mean changing everything at once: it starts with one design question, in the four steps on the next slide.`);
}

// ---------- 12 · how a team would start ----------
pres.addSection({ title: 'Next steps' });
{
  const sl = add('Message', 'Next steps');
  kicker(sl, 'HOW A TEAM WOULD START');
  sl.addText('Start with one design question, in four steps', { placeholder: 'title' });
  const steps = [
    ['Pick one question', 'one recurring design question that today waits for CFD or tests'],
    ['Build a fast model', 'of its main mechanisms, with the people who know them'],
    ['Calibrate it', 'with CFD or test data you already have, and check it on cases it has not seen'],
    ['Close the loop', 'optimisation on top, and every new expensive run correcting the model']];
  const W = 2.78, gap = 0.33;
  steps.forEach(([h, d], i) => {
    const x = 0.6 + i * (W + gap), y = 1.75;
    card(sl, x, y, W, 2.1, `Step ${i + 1} card`);
    dot(sl, x + 0.2, y + 0.2, 0.5, i + 1, { name: `Step ${i + 1}`, size: 16 });
    text(sl, h, { x: x + 0.85, y: y + 0.22, w: W - 1.0, h: 0.45, fontSize: 17, bold: true, valign: 'middle', objectName: `Step ${i + 1} heading` });
    text(sl, d, { x: x + 0.2, y: y + 0.85, w: W - 0.4, h: 1.15, fontSize: 14, objectName: `Step ${i + 1} text` });
    if (i < steps.length - 1) arrow(sl, x + W + 0.04, y + 1.05, x + W + gap - 0.04, y + 1.05, `Step arrow ${i + 1}`, BLUE);
  });
  text(sl, 'Who does what', { x: 0.6, y: 4.05, w: 6, h: 0.3, fontSize: 14, bold: true, objectName: 'Roles heading' });
  const roles = [
    ['You, the manufacturer', 'Own the product, the know-how and the data, and make the decisions.'],
    ['Software vendors and AI platforms', 'CAD, CFD and FEM tools; agents that connect tools and run studies.'],
    ['Equipment and plant suppliers', 'Machines and plants, moulds, ceramic process know-how, pilot trials.'],
    ['Us, the engineering partner', 'Fast models on your data, connecting your tools, method change, extra capacity.', 'us']];
  const RW = (12.13 - 0.15 * 3) / 4;
  roles.forEach(([h, d, us], i) => {
    const x = 0.6 + i * (RW + 0.15), y = 4.4;
    card(sl, x, y, RW, 0.95, `Role ${i + 1} card`, us ? { fill: 'D7E8F2', line: BLUE } : {});
    sl.addText([{ text: h, options: { bold: true, color: us ? BLUE : NAVY, fontSize: 12.5, breakLine: true } }, { text: d, options: { color: NAVY, fontSize: 11 } }], { x: x + 0.12, y: y + 0.07, w: RW - 0.24, h: 0.83, margin: 0, valign: 'top', isTextBox: true, objectName: `Role ${i + 1} text` });
  });
  card(sl, 0.6, 5.55, 12.13, 1.05, 'Workshop card', { fill: 'D7E8F2', line: BLUE });
  sl.addText([{ text: 'In a workshop ', options: { bold: true, color: BLUE } }, { text: 'we take one of your design questions through these steps on paper: where the loop waits, which mechanisms a fast model needs, which data you already have to calibrate it, and what it would save with your own figures.', options: { color: NAVY } }], { x: 0.85, y: 5.55, w: 11.65, h: 1.05, fontSize: 15, valign: 'middle', margin: 0, isTextBox: true, objectName: 'Workshop text' });
  sl.addNotes(`How would a team start? Not with a platform, but with one design question.

One: pick a recurring design question that today waits for CFD or tests. Recurring matters, because the fast model pays off over many questions.

Two: write down the main mechanisms with the people who know them, and build a fast model around them. It does not need to be perfect; it needs to point the right way and be explainable.

Three: calibrate it with CFD or test data the team already has, and check it on cases it has not seen.

Four: close the loop. Put optimisation on top, and let every new expensive run correct the model, as in the challenge.

Who does what in this? You, the manufacturer, own the product, the know-how and the data, and make the decisions. Software vendors and AI platforms bring the CAD, CFD and FEM tools, and agents that connect them. Equipment and plant suppliers bring the machines and plants, the moulds, the ceramic process know-how and the pilot trials. Our role is the engineering partner: we build the fast models on your data, connect the tools you already use, change methods and processes together with your engineers, and add capacity when it is needed. We don't build machines, and we don't add one more tool.

In a workshop we take one of your design questions through these steps: where your loop waits, which mechanisms the fast model needs, which data you already have, and what it would save with your own figures in the calculator.`);
}

// ---------- 13 · next step ----------
{
  const sl = add('Title dark', 'Next steps');
  kicker(sl, 'NEXT STEP', true);
  sl.addText('Try it, then bring us one of your design questions', { placeholder: 'title' });
  const acts = [
    ['Try the page', 'The guided story in four parts, the calculator and every tool, live in the browser.', 'fintlp.github.io/jet-flush-model', LIVE],
    ['Watch the story', 'All four parts, recorded at reading pace.', PDF ? 'The video is in the PowerPoint version of this deck.' : 'The video is on the right.', null],
    ['Contact Peter Fintl', 'Ask for a workshop on one of your own design questions.', 'fintlp.github.io/latest-news/#contact', CONTACT]];
  acts.forEach(([h, d, l, url], i) => {
    const y = 3.05 + i * 1.08;
    dot(sl, 0.6, y + 0.05, 0.55, i + 1, { name: `Action ${i + 1}`, fill: CYAN, color: NIGHT });
    sl.addText([{ text: h, options: { bold: true, color: WHITE, breakLine: true, fontSize: 17 } }, { text: d + ' ', options: { color: PALE, fontSize: 13 } }, url ? { text: l, options: { color: CYAN, fontSize: 13, hyperlink: { url } } } : { text: l, options: { color: DIM, fontSize: 13 } }], { x: 1.35, y: y - 0.05, w: 4.6, h: 1.0, margin: 0, valign: 'top', isTextBox: true, objectName: `Action ${i + 1} text` });
  });
  const v = fit(M('demo-poster.png'), 5.0, 3.2);
  video(sl, { type: 'video', path: M('demo-walkthrough.mp4'), cover: b64(M('demo-poster.png')), x: 12.73 - v.w, y: 0.75, w: v.w, h: v.h, objectName: 'Guided story video' });
  caption(sl, `The guided story, recorded from the page (${REC}) on ${REC_DATE}.`, 12.73 - v.w, 0.82 + v.h, v.w, true);
  sl.addImage({ path: M('qr-live.png'), x: 12.73 - 1.45, y: 4.85, w: 1.45, h: 1.45, objectName: 'QR code to the live page' });
  text(sl, 'Scan to open the live page', { x: 12.73 - 1.45 - 2.3, y: 5.3, w: 2.15, h: 0.6, fontSize: 12, color: PALE, align: 'right', objectName: 'QR label' });
  caveat(sl, 'A demonstrator with a physics model that is not yet calibrated; synthetic references are labelled on the page; the CFD is a second simulation of one design, not a measurement.', true);
  sl.addNotes(`Three things to do next.

Try the page. The guided story walks through all four parts: the fast model, the check against CFD, AI in the engineering loop, and what it means for your team, with the calculator. Every tool runs live in the browser, nothing is installed.

Watch the story. The video is the whole guided story, recorded at reading pace.

And contact me, Peter Fintl, to look at one of your own design questions in a workshop: where your loop waits, what a fast model would need, and what it would save with your own figures.

The link is fintlp.github.io/jet-flush-model; the QR code opens it on a phone.`);
}

(async () => {
  const out = path.join(ROOT, 'slides', PDF ? 'jet-flush-model-pdf.pptx' : 'jet-flush-model.pptx');
  await pres.writeFile({ fileName: out });
  const theme = process.env.APPLY_THEME;   // path to the pptx skill's apply_theme.js, when available
  if (theme && fs.existsSync(theme)) { await require(theme).applyTheme(out, THEME); }
  console.log('wrote', path.relative(process.cwd(), out));
})();
