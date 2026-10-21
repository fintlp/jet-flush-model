// Builds slides/jet-flush-model.pptx from the stills and videos in media/, the CFD stills in cfd/washdown/media/
// and the figures in slides/figures.json (written by tools/media.js from the live page). Run media.js first.
//   node tools/slides.js
// The PDF: node tools/slides.js --pdf writes slides/jet-flush-model-pdf.pptx with the posters instead of the videos
// (LibreOffice would embed the videos in the PDF), then
//   soffice --headless --convert-to pdf --outdir slides slides/jet-flush-model-pdf.pptx
// and rename the result to slides/jet-flush-model.pdf; the -pdf.pptx is not kept.
// Fonts: Ubuntu (Capgemini-inspired look, as the page). PowerPoint on a computer without Ubuntu substitutes a font.
const path = require('path'), fs = require('fs');
const pptxgen = require('pptxgenjs');
const ROOT = path.join(__dirname, '..'), M = (f) => path.join(ROOT, 'media', f), CM = (f) => path.join(ROOT, 'cfd', 'washdown', 'media', f);
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'slides', 'figures.json'), 'utf8'));
const VERSION = 'v2.0.0', DATE = '21 October 2026', PDF = process.argv.includes('--pdf');
// a video, or for the PDF its poster image
const video = (sl, o) => (PDF ? sl.addImage({ data: o.cover, x: o.x, y: o.y, w: o.w, h: o.h, objectName: o.objectName }) : sl.addMedia(o));
const FOOT = `Peter Fintl   ·   github.com/fintlp/jet-flush-model   ·   ${VERSION}   ·   ${DATE}`;
const NAVY = '0F2538', NIGHT = '08131D', BLUE = '0070AD', CYAN = '12ABDB', MUTED = '52667A', LINE = 'D8E0E8', TINT = 'F3F5F8', BROWN = '8A5A2B', WHITE = 'FFFFFF';
const THEME = { name: 'Jet Flush 2.0', headFontFace: 'Ubuntu', bodyFontFace: 'Ubuntu',
  colors: { dk1: NAVY, lt1: WHITE, dk2: BLUE, lt2: TINT, accent1: BLUE, accent2: CYAN, accent3: '17876C', accent4: BROWN, accent5: MUTED, accent6: 'B0341D', hlink: BLUE, folHlink: '005A8C' } };
const pct = (v) => `${Math.round(v)} %`;
// '≈' and '→' are not in every copy of Ubuntu: set them in Arial so they never fall back to an unknown font
const sym = (t) => (typeof t !== 'string' ? t : t.split(/([≈→])/).filter((x) => x).map((x) => (/[≈→]/.test(x) ? { text: x, options: { fontFace: 'Arial' } } : { text: x })));
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const imgSize = (f) => { const b = fs.readFileSync(f); if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; let i = 2; while (i < b.length) { const m = b[i + 1], L = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + L; } return null; };
const fit = (f, w, h) => { const s = imgSize(f), r = Math.min(w / s.w, h / s.h); return { w: s.w * r, h: s.h * r }; };

// figures from the guided story (slides/figures.json, demo: the text of every step)
const step = (t) => (F.demo || []).find((s) => s.title === t) || { text: '' };
const num = (txt, re) => { const m = txt.match(re); return m ? m[1] : null; };
const ovalTo = num(step('Make the bowl oval').text, /(\d+) %/), jetsTo = num(step('Move the jets').text, /recovers to (\d+) %/);
const win = step('Load the winner').text, winClean = num(win, /Cleaning (\d+) %/), winWater = num(win, /Water ([\d.]+) L/), winNoise = num(win, /Noise ([−-][\d.]+) dB/);
const C = F.cfd, CH = F.challenge, hours = Math.round(C.wallClock_s / 1800) / 2;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';   // 13.33 x 7.5 in
pres.author = 'Peter Fintl'; pres.title = 'Tangential Jet Flush Model 2.0';
pres.theme = { headFontFace: 'Ubuntu', bodyFontFace: 'Ubuntu' };
const footer = (dark) => [
  { text: { text: FOOT, options: { x: 0.6, y: 7.02, w: 10.5, h: 0.3, fontSize: 10, color: dark ? '8FA3B5' : MUTED, margin: 0 } } }];
pres.defineSlideMaster({ title: 'Title dark', background: { color: NIGHT },
  objects: [...footer(true), { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.55, w: 6.9, h: 1.4, fontSize: 40, bold: true, color: WHITE, align: 'left', valign: 'top', margin: 0 }, text: '' } }],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: '8FA3B5' } });
pres.defineSlideMaster({ title: 'Content', background: { color: WHITE },
  objects: [...footer(false), { placeholder: { options: { name: 'title', type: 'title', x: 1.45, y: 0.45, w: 11.25, h: 0.75, fontSize: 32, bold: true, color: NAVY, align: 'left', valign: 'middle', margin: 0 }, text: '' } }],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: MUTED } });
pres.defineSlideMaster({ title: 'Content plain', background: { color: WHITE },
  objects: [...footer(false), { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.45, w: 12.1, h: 0.75, fontSize: 32, bold: true, color: NAVY, align: 'left', valign: 'middle', margin: 0 }, text: '' } }],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: MUTED } });

// the motif: the story part in a blue circle, as on the page
const badge = (sl, n) => { sl.addShape(pres.shapes.OVAL, { x: 0.6, y: 0.5, w: 0.62, h: 0.62, fill: { color: BLUE }, line: { color: BLUE }, objectName: `Part ${n} badge` });
  sl.addText(String(n), { x: 0.6, y: 0.5, w: 0.62, h: 0.62, align: 'center', valign: 'middle', fontSize: 20, bold: true, color: WHITE, margin: 0, isTextBox: true, objectName: `Part ${n} number` }); };
const lead = (sl, t, x) => sl.addText(sym(t), { x: x || 1.45, y: 1.2, w: 12.73 - (x || 1.45), h: 0.5, fontSize: 16, color: MUTED, margin: 0, isTextBox: true, objectName: 'Lead' });
const stat = (sl, i, x, y, w, v, l, o) => {
  sl.addText(sym(v), { x, y, w, h: 0.7, fontSize: (o && o.size) || 30, bold: true, color: (o && o.color) || BLUE, margin: 0, valign: 'bottom', isTextBox: true, objectName: `Stat ${i} value` });
  sl.addText(sym(l), { x, y: y + 0.75, w, h: (o && o.lh) || 0.75, fontSize: 13, color: (o && o.lc) || NAVY, margin: 0, valign: 'top', isTextBox: true, objectName: `Stat ${i} label` }); };
const caveat = (sl, t, y, dark) => sl.addText(t, { x: 0.6, y: y || 6.45, w: 12.1, h: 0.45, fontSize: 10.5, italic: true, color: dark ? '8FA3B5' : MUTED, margin: 0, valign: 'top', isTextBox: true, objectName: 'Caveat' });
const card = (sl, x, y, w, h, name, dark) => sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: dark ? '122333' : TINT }, line: { color: dark ? '1C3044' : LINE, width: 0.75 }, objectName: name });

// 1 · title
{
  const sl = pres.addSlide({ masterName: 'Title dark' });
  sl.addText('Tangential Jet Flush Model 2.0', { placeholder: 'title' });
  sl.addText('A fast physics model of a rimless toilet flush, checked against CFD, with AI in the engineering loop', { x: 0.6, y: 2.1, w: 6.9, h: 0.9, fontSize: 18, color: 'C9D6E2', margin: 0, valign: 'top', isTextBox: true, objectName: 'Subtitle' });
  const v = fit(M('playback.png'), 5.0, 3.6);
  video(sl, { type: 'video', path: M('flush-playback.mp4'), cover: b64(M('playback.png')), x: 12.73 - v.w, y: 0.6, w: v.w, h: v.h, objectName: 'Flush playback video' });
  sl.addText('Flush playback from the page: films on the wall, pool swirl, waste. Washdown preset.', { x: 12.73 - v.w, y: 0.65 + v.h, w: v.w, h: 0.5, fontSize: 10.5, color: '8FA3B5', margin: 0, isTextBox: true, objectName: 'Video caption' });
  const st = [['20–40 ms', 'per flush with the fast model, in the browser'], [`≈ ${hours} hours`, `for ${C.end} s of the same flush in OpenFOAM CFD, on ${C.cores} cores`], [`${CH.ai.med} vs ${CH.classic.med}`, 'expensive runs to reach the targets, AI-assisted vs automated one change at a time (median of 8 synthetic projects)']];
  st.forEach(([v2, l], i) => stat(sl, i + 1, 0.6 + i * 2.4, 3.55, 2.2, v2, l, { color: CYAN, lc: WHITE, lh: 1.0, size: 28 }));
  card(sl, 0.6, 5.55, 6.9, 0.75, 'Live link card', true);
  sl.addText([{ text: 'Try it live   ', options: { bold: true, color: WHITE } }, { text: 'fintlp.github.io/jet-flush-model', options: { color: CYAN, hyperlink: { url: 'https://fintlp.github.io/jet-flush-model/' } } }], { x: 0.85, y: 5.55, w: 6.5, h: 0.75, fontSize: 16, valign: 'middle', margin: 0, isTextBox: true, objectName: 'Live link' });
  caveat(sl, 'Reduced-order model, not yet calibrated or validated: results are for comparing designs, not measured values. The CFD is a second simulation of one design, not a measurement.', 6.45, true);
}

// 2 · part 1, the fast model
{
  const sl = pres.addSlide({ masterName: 'Content' }); badge(sl, 1);
  sl.addText('The fast model: one flush in milliseconds', { placeholder: 'title' });
  lead(sl, 'Change the bowl or the jets and see cleaning, waste removal, water and noise at once; the AI lab searches for better designs.');
  const img = M('ai-optimiser-chart.png'), s = fit(img, 6.4, 3.85);
  sl.addImage({ path: img, x: 0.6, y: 1.95, w: s.w, h: s.h, objectName: 'Optimiser chart' });
  sl.addText('AI lab: each dot is one simulated flush; the curve is the best trade-off between score and water.', { x: 0.6, y: 2.0 + s.h, w: s.w, h: 0.45, fontSize: 10.5, color: MUTED, margin: 0, isTextBox: true, objectName: 'Chart caption' });
  sl.addText('From the guided demo, part 1', { x: 7.75, y: 1.95, w: 5.0, h: 0.4, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: 'Moments heading' });
  const pre = Math.round(F.preset.clean);
  const mo = [[`${pre} % → ${ovalTo} %`, 'cleaning when the bowl turns oval, jets at the ends of the long axis'], [`→ ${jetsTo} %`, 'after moving the jets to the long sides'], [`${winClean} % at ${winWater} L`, `AI lab design: 0.5 L less water than the oval start, ${winNoise ? winNoise.replace('-', '−') + ' dB, no louder' : 'no louder'}`]];
  mo.forEach(([v, l], i) => stat(sl, i + 1, 7.75, 2.45 + i * 1.3, 5.0, v, l, { size: 26, lh: 0.5 }));
  caveat(sl, 'Illustrative estimates from the uncalibrated model; noise is a relative, experimental indicator. AI suggestions are candidates for a CFD or rig check, not final answers.');
}

// 3 · part 2, checked against CFD
{
  const sl = pres.addSlide({ masterName: 'Content' }); badge(sl, 2);
  sl.addText('Checked against CFD', { placeholder: 'title' });
  lead(sl, `The same bowl and jets in OpenFOAM: about ${hours} hours on ${C.cores} cores for ${C.end} s of flush, against about 30 ms for the fast model.`);
  const maps = M('cfd-maps.png'), s = fit(maps, 7.9, 2.3);
  sl.addImage({ path: maps, x: 0.6, y: 1.95, w: s.w, h: s.h, objectName: 'Wall maps' });
  sl.addText('What gets cleaned, wall unrolled: CFD left, fast model right (green cleaned, grey wetted only).', { x: 0.6, y: 2.0 + s.h, w: s.w, h: 0.4, fontSize: 10.5, color: MUTED, margin: 0, isTextBox: true, objectName: 'Maps caption' });
  const still = CM('cutaway_1.0s.jpg'), s2 = fit(still, 3.9, 2.4);
  sl.addImage({ path: still, x: 12.73 - s2.w, y: 1.95, w: s2.w, h: s2.h, objectName: 'CFD still' });
  sl.addText('CFD water surface at 1.0 s, front half removed.', { x: 12.73 - s2.w, y: 2.0 + s2.h, w: s2.w, h: 0.4, fontSize: 10.5, color: MUTED, margin: 0, isTextBox: true, objectName: 'Still caption' });
  const st = [[`${pct(C.cClean)} vs ${pct(C.mClean)}`, 'of the wall cleaned, CFD vs fast model: close totals, different patterns'],
    [`${C.firstCfd.toFixed(2)} s vs ${C.firstModel.toFixed(2)} s`, 'first water in the pool, CFD vs fast model: in the model it arrives later and all at once'],
    [pct(C.iouCM), 'overlap of the uncleaned areas, CFD vs fast model: the model gets the total, not where the gaps are']];
  st.forEach(([v, l], i) => stat(sl, i + 1, 0.6 + i * 4.1, 4.75, 3.8, v, l, { size: 26, lh: 0.65 }));
  caveat(sl, `A second simulation of one design, not a measurement or a validation. Trap outflow taken from the model; after 1.3 s the CFD outlet draws air. On two CFD meshes the totals agree, the uncleaned areas overlap ${pct(C.sens.iouU)}: a sensitivity, not mesh independence.`);
}

// 4 · part 3, AI in the engineering loop
{
  const sl = pres.addSlide({ masterName: 'Content' }); badge(sl, 3);
  sl.addText('AI in the engineering loop', { placeholder: 'title' });
  lead(sl, 'Eight design projects, each run of the expensive reference costs 8 hours: how many runs until the targets are met?');
  const img = M('challenge.png'), s = fit(img, 7.6, 4.0);
  sl.addImage({ path: img, x: 0.6, y: 1.95, w: s.w, h: s.h, objectName: 'Projects chart' });
  sl.addText('Projects that met the targets over virtual days, for the three routes.', { x: 0.6, y: 2.0 + s.h, w: s.w, h: 0.4, fontSize: 10.5, color: MUTED, margin: 0, isTextBox: true, objectName: 'Chart caption' });
  const x = 8.75;
  stat(sl, 1, x, 1.95, 4.0, `${CH.ai.med} vs ${CH.classic.med}`, 'expensive runs per project (median): fast model + learned correction vs automated one change at a time', { lh: 0.7 });
  stat(sl, 2, x, 3.45, 4.0, `${CH.ai.sum} vs ${CH.classic.sum}`, 'runs for all eight projects', { lh: 0.4 });
  stat(sl, 3, x, 4.65, 4.0, `${CH.fast.miss} of 8`, 'projects the fast model alone never finished: it cannot learn from the expensive runs', { color: BROWN, lh: 0.7 });
  caveat(sl, 'The expensive runs come from a synthetic reference (the model with other coefficients and extra effects), labelled as such on the page. It shows the workflow, not real accuracy.');
}

// 5 · what it means
{
  const sl = pres.addSlide({ masterName: 'Content plain' });
  sl.addText('One design loop, two clocks', { placeholder: 'title' });
  lead(sl, 'The median synthetic project of the challenge, counting each expensive iteration as a working day (set up, run, evaluate), as Geberit reported; the challenge itself counts 8 hours of computing per run.', 0.6);
  const days = [['One change at a time (automated)', CH.classic.med, BROWN], ['AI-assisted', CH.ai.med, BLUE]], X0 = 0.6, W = 6.4, scale = W / 13;
  days.forEach(([l, d, col], i) => {
    const y = 2.2 + i * 1.15;
    sl.addText(l, { x: X0, y, w: 3.5, h: 0.35, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: `Clock ${i + 1} label` });
    sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y: y + 0.42, w: d * scale, h: 0.42, rectRadius: 0.08, fill: { color: col }, line: { color: col }, objectName: `Clock ${i + 1} bar` });
    sl.addText(`${d} days`, { x: X0 + d * scale + 0.15, y: y + 0.42, w: 1.6, h: 0.42, fontSize: 16, bold: true, color: col, valign: 'middle', margin: 0, isTextBox: true, objectName: `Clock ${i + 1} value` });
  });
  const saved = CH.classic.sum - CH.ai.sum;   // assumed working days, 21 a month, to the half month
  stat(sl, 1, X0, 4.6, 3.0, `≈ ${Math.round(saved / 21 * 2) / 2} months`, `${saved} assumed working days of iterations, over eight synthetic projects`, { lh: 0.5 });
  stat(sl, 2, X0 + 3.3, 4.6, 3.1, `${CH.classic.sum} → ${CH.ai.sum}`, 'expensive iterations in total', { lh: 0.5 });
  // the six AI lab tools
  card(sl, 7.55, 1.95, 5.18, 4.3, 'AI lab card');
  sl.addText('Also in the AI lab, all in the browser', { x: 7.8, y: 2.1, w: 4.8, h: 0.4, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: 'AI lab heading' });
  const tools = [['Design optimiser', 'about 540 quick estimates in about 10 s, then the recommended designs checked at full resolution'], ['Neural surrogate', 'a few thousand times faster than the physics model'], ['Hybrid calibration', 'fit plus a learned correction, tested on unseen designs'], ['Noise calibration', 'fits the noise model to recordings (shown with synthetic ones)'], ['Physics-informed network', 'finds a model coefficient from a level record'], ['Field surrogate', 'whole cleaning maps from expensive runs, shown honestly']];
  const runs = []; tools.forEach(([t, d], i) => { runs.push({ text: `${t}: `, options: { bold: true, color: BLUE } }); runs.push({ text: d, options: { color: NAVY, breakLine: i < tools.length - 1 } }); });
  sl.addText(runs, { x: 7.8, y: 2.55, w: 4.75, h: 3.55, fontSize: 13, margin: 0, valign: 'top', paraSpaceAfter: 7, isTextBox: true, objectName: 'AI lab tools' });
  caveat(sl, 'Iteration counts from the challenge against a synthetic reference (checks/challenge.js), not from real projects; one day per iteration is an assumption from the Geberit report by CADFEM. Sources on the page.');
}

// 6 · the whole story
{
  const sl = pres.addSlide({ masterName: 'Title dark' });
  sl.addText('See the whole story', { placeholder: 'title' });
  sl.addText('The guided story drives the live page in three parts. Each part can be started on its own.', { x: 0.6, y: 1.45, w: 4.9, h: 0.9, fontSize: 16, color: 'C9D6E2', margin: 0, valign: 'top', isTextBox: true, objectName: 'Lead' });
  const parts = [['1', 'The fast model', '#demo'], ['2', 'Checked against CFD', '#cfd-tour'], ['3', 'AI in the engineering loop', '#challenge-tour']];
  parts.forEach(([n, t, h], i) => {
    const y = 2.6 + i * 0.95;
    sl.addShape(pres.shapes.OVAL, { x: 0.6, y, w: 0.55, h: 0.55, fill: { color: CYAN }, line: { color: CYAN }, objectName: `Part ${n} badge` });
    sl.addText(n, { x: 0.6, y, w: 0.55, h: 0.55, align: 'center', valign: 'middle', fontSize: 17, bold: true, color: NIGHT, margin: 0, isTextBox: true, objectName: `Part ${n} number` });
    sl.addText([{ text: t, options: { bold: true, color: WHITE, breakLine: true } }, { text: 'fintlp.github.io/jet-flush-model/' + h, options: { color: CYAN, fontSize: 12, hyperlink: { url: 'https://fintlp.github.io/jet-flush-model/' + h } } }], { x: 1.35, y: y - 0.05, w: 4.2, h: 0.7, fontSize: 15, margin: 0, valign: 'middle', isTextBox: true, objectName: `Part ${n} link` });
  });
  const v = fit(M('demo-poster.png'), 6.6, 4.1);
  video(sl, { type: 'video', path: M('demo-walkthrough.mp4'), cover: b64(M('demo-poster.png')), x: 12.73 - v.w, y: 1.75, w: v.w, h: v.h, objectName: 'Guided story video' });
  sl.addText(`Recorded from the page (${VERSION}) on ${DATE}: all three parts, at reading pace.`, { x: 12.73 - v.w, y: 1.8 + v.h, w: v.w, h: 0.4, fontSize: 10.5, color: '8FA3B5', margin: 0, isTextBox: true, objectName: 'Video caption' });
  caveat(sl, 'Physics model, not yet calibrated or validated. Synthetic references are labelled on the page; the CFD is a second simulation of one design, not a measurement.', 6.45, true);
}

(async () => {
  const out = path.join(ROOT, 'slides', PDF ? 'jet-flush-model-pdf.pptx' : 'jet-flush-model.pptx');
  await pres.writeFile({ fileName: out });
  const theme = process.env.APPLY_THEME;   // path to the pptx skill's apply_theme.js, when available
  if (theme && fs.existsSync(theme)) { await require(theme).applyTheme(out, THEME); }
  console.log('wrote', path.relative(process.cwd(), out));
})();
