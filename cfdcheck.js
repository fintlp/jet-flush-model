/* "Checked against CFD": the fast model next to an OpenFOAM simulation of the same bowl and the same jets.
   The CFD data are produced by the CFD work in cfd/ (cfd-status in the project, cfd/post.py) and read here from
   cfd/washdown/runs/<run>.json; the model is computed live with the current code for the same flush window.
   Both are shown on the model's wall grid (90 sectors round the rim, 40 rows from the rim to the waterline),
   area-weighted. It is a comparison of two simulations, not a validation against a real bowl. */
(function () {
  const A = window.FlushApp, M = window.FlushModel;
  const $ = (id) => document.getElementById(id);
  if (!A || !M || !$('cfd')) return;
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));
  const now = () => performance.now();
  // computing time in words: minutes up to 90, then hours to the half hour
  const dur = (s) => (s < 5400 ? `${Math.round(s / 60)} minutes` : `${fmt(Math.round(s / 1800) / 2, Math.round(s / 1800) % 2 ? 1 : 0)} hours`);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Runs in order of preference; the first one that loads is used. Only runs that exist are listed, so the page
  // asks for no missing file. Wall-clock times come from the run file (case.wallClock_s: computing time, without
  // the time the Mac was asleep; case.cores). The medium run is the main dataset; the coarse run of the same set-up
  // is loaded as the second mesh, to show how much the results move with the mesh (a sensitivity, not mesh
  // independence).
  const NOTE32 = 'Pool and trap flow match the fast model up to 1.3 s; after that the trap outlet of this run draws air from the swirling pool, so the bowl holds more water than in the fast model. The wall data run to 3.2 s.';
  const RUNS = [
    { file: 'medium-3.2s.json', label: 'medium mesh, 2 mm cells at the wall, 428,584 cells', note: NOTE32, second: 1 },
    { file: 'coarse-full-3.2s.json', label: 'coarse mesh, 3 mm cells at the wall, 157,596 cells', note: NOTE32 },
    { file: 'coarse-modelout-1.5s.json', label: 'coarse mesh, 3 mm cells at the wall, 157,596 cells',
      note: 'Pool and trap flow are valid to 1.3 s; after that the vortex air core reaches the outlet. The wall data run to 1.5 s.' }
  ];
  const ARRIVAL = 'coarse-arrival-1s.json';
  const BASE = 'cfd/washdown/runs/';
  const S = { run: null, cfd: null, cfd2: null, run2: null, sens: null, arr: null, mod: null, t: 0, mode: 'wet', playing: false, msModel: null };

  async function load() {
    const get = async (f) => { try { const res = await fetch(BASE + f, { cache: 'no-cache' }); return res.ok ? await res.json() : null; } catch (e) { return null; } };
    for (const r of RUNS) { const d = await get(r.file); if (d) { S.cfd = d; S.run = r; break; } }
    // the second mesh, for the sensitivity
    if (S.run && S.run.second != null) { const r2 = RUNS[S.run.second], d2 = await get(r2.file); if (d2) { S.cfd2 = d2; S.run2 = r2; } }
    // first water in the pool: from the run itself when it has an arrival plane, else from the arrival run
    S.arr = S.cfd && S.cfd.arrivalTimes && S.cfd.arrivalTimes.first_1mLs != null ? S.cfd : await get(ARRIVAL);
    media();
    if (!S.cfd) { $('cfdStatus').textContent = 'The CFD data could not be loaded. They are read from the cfd/ folder, so the page has to be served over http, as on the live site.'; return; }
    compute();
  }

  // ---- stills and video of the CFD run, when the CFD work has rendered them ----
  // cfd/washdown/media/manifest.json: { "video": { "file", "poster", "caption" }, "stills": [ { "file", "caption" } ] },
  // file names relative to cfd/washdown/media/. MEDIA is switched on once the manifest is in the repository.
  const MEDIA = true;
  async function media() {
    const box = $('cfdMedia'); if (!box || !MEDIA) return;
    let m = null; try { const res = await fetch('cfd/washdown/media/manifest.json', { cache: 'no-cache' }); if (res.ok) m = await res.json(); } catch (e) { m = null; }
    if (!m) return;
    const P = 'cfd/washdown/media/', esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const short = (q) => `${q.view === 'top' ? 'From above' : 'Front half removed'}, ${fmt(q.t, 1)} s`;
    box.innerHTML = (m.video ? `<figure class="cfd-fig cfd-video"><video controls muted playsinline preload="none" ${m.video.poster ? `poster="${P + esc(m.video.poster)}"` : ''} src="${P + esc(m.video.file)}"></video><figcaption>${esc(m.video.caption)} Simulation, not a measurement.</figcaption></figure>` : '') +
      (m.stills && m.stills.length ? `<div class="cfd-stills">${m.stills.map((q) => `<figure class="cfd-fig"><a href="${P + esc(q.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${P + esc(q.file)}" alt="${esc(q.caption)}"></a><figcaption>${esc(short(q))}</figcaption></figure>`).join('')}</div><p class="ai-note">Stills of the same CFD run: the water surface, coloured by water speed. Simulation, not a measurement.</p>` : '');
    box.hidden = false;
  }

  // ---- the model for the same window, and the grid's cell areas ----
  function compute() {
    const p = Object.assign(M.defaults('washdown'), { flushMode: 'full' }), tEnd = S.cfd.case.end;
    const series = [];
    const ts = [];
    for (let k = 0; k < 5; k++) { const t0 = now(); M.simulate(p, { light: true, Tend: tEnd, Tmax: tEnd }); ts.push(now() - t0); }
    const r = M.simulate(p, { Tend: tEnd, Tmax: tEnd });   // full result, with the wall maps
    ts.sort((a, b) => a - b); S.msModel = ts[2];
    const tf = []; for (let k = 0; k < 5; k++) { const t0 = now(); M.simulate(p, { light: true, Tend: 12 }); tf.push(now() - t0); } tf.sort((a, b) => a - b); S.msFull = tf[2];
    let firstArr = null, last = -1;
    M.simulate(p, { light: true, Tend: tEnd, Tmax: tEnd, probe: (s) => { if (firstArr == null && s.Qarr > 1e-6) firstArr = s.t; if (s.t - last >= 0.05 - 1e-9) { last = s.t; series.push({ t: s.t, uMean: 2 / 3 * s.om * s.Rc }); } } });
    const g = M.buildGeom(p), NTH = r.NTH, NS = r.NS, rowA = [];
    for (let k = 0; k < NS; k++) { const f = (k + 0.5) / NS * (g.ur.length - 1), i = Math.floor(f), w = f - i, rr = g.ur[i] * (1 - w) + g.ur[Math.min(g.ur.length - 1, i + 1)] * w; rowA.push(2 * Math.PI * rr * (g.S / NS) / NTH); }
    S.mod = { J: r.J, tWet: r.tWet, NTH, NS, Jcrit: p.Jcrit, firstArr, series, rowA };
    const Atot = rowA.reduce((a, b) => a + b, 0) * NTH;
    S.share = (pred) => { let a = 0; for (let k = 0; k < NS; k++) for (let i = 0; i < NTH; i++) if (pred(k * NTH + i)) a += rowA[k]; return 100 * a / Atot; };
    const c = S.cfd.map, m = S.mod;
    S.cWet = (t) => S.share((j) => c.tWet[j] != null && c.tWet[j] <= t + 1e-9);
    S.mWet = (t) => S.share((j) => m.tWet[j] <= t + 1e-9);
    S.cClean = S.share((j) => c.J[j] >= S.cfd.Jcrit); S.mClean = S.share((j) => m.J[j] >= m.Jcrit);
    // where the wall stays uncleaned: overlap of the two maps' uncleaned areas (intersection over union). With most of
    // the wall cleaned, agreement cell by cell is high even by chance, so this says more about matching patterns.
    const iouU = (a, b) => { const I = S.share((j) => !a(j) && !b(j)), U = S.share((j) => !a(j) || !b(j)); return U > 0 ? 100 * I / U : 100; };
    const cC = (j) => c.J[j] >= S.cfd.Jcrit, mC = (j) => m.J[j] >= m.Jcrit;
    S.iouCM = iouU(cC, mC);
    if (S.cfd2) {   // two meshes: totals, and the share of the wall where both give the same cleaned verdict
      const c2 = S.cfd2.map, tE = Math.min(S.cfd.case.end, S.cfd2.case.end);
      S.sens = { clean2: S.share((j) => c2.J[j] >= S.cfd2.Jcrit), wet1: S.share((j) => c.tWet[j] != null && c.tWet[j] <= tE + 1e-9), wet2: S.share((j) => c2.tWet[j] != null && c2.tWet[j] <= tE + 1e-9),
        same: S.share((j) => (c.J[j] >= S.cfd.Jcrit) === (c2.J[j] >= S.cfd2.Jcrit)), tE };
      const p1 = S.cClean / 100, p2 = S.sens.clean2 / 100;
      S.sens.chance = 100 * (p1 * p2 + (1 - p1) * (1 - p2));   // agreement expected by chance from the two totals
      S.sens.iouU = iouU(cC, (j) => c2.J[j] >= S.cfd2.Jcrit);
    }
    const sl = $('cfdT'); sl.max = String(tEnd); sl.value = String(tEnd); S.t = tEnd;
    head(); diff(); draw(); curves();
    document.dispatchEvent(new Event('flushcfdready'));
  }

  function head() {
    const cs = S.cfd.case, run = S.run, wc = cs.wallClock_s || run.wallClock_s, cores = cs.cores || run.cores, tEnd = cs.end;
    const speed = wc && S.msModel ? wc * 1000 / S.msModel : null;
    $('cfdCaveat').innerHTML = `<b>CFD reference:</b> OpenFOAM (interFoam, volume of fluid), the model's own bowl and inflow, ${run.label}. It is a second simulation, not a measurement of a real bowl. Thin films and fine spray are smoothed at this resolution. The trap outflow is taken from the model, so the CFD checks the wall and the pool, not the trap. The jets enter through a patch on the wall, 36 by 37.5 mm (about three times the nozzle area), at the model's jet speed along the rim with an inward part set so that the patch delivers the model's flow; the film close to the jets is therefore not that of a real nozzle. This run covers 0 to ${fmt(tEnd, 1)} s of the flush.${run.note ? ' ' + run.note : ''} Agreement between two simulations shows consistency, not truth.`;
    $('cfdHead').innerHTML = `<p class="ch-big">Same bowl, same jets, ${fmt(tEnd, 1)} s of flush: OpenFOAM needed ${wc ? `about <b>${dur(wc)} on ${cores} CPU cores</b>` : 'hours of computing'}; the fast model needs <b>${fmt(S.msModel, 0)} ms</b> in your browser${speed ? `, about <b>${Math.round(speed / 1000).toLocaleString('en')} thousand times faster</b>` : ''}.</p>` +
      `<p>By ${fmt(tEnd, 1)} s, the CFD has wetted <b>${fmt(S.cWet(tEnd), 0)} %</b> of the wall and the fast model <b>${fmt(S.mWet(tEnd), 0)} %</b>; cleaned so far: CFD <b>${fmt(S.cClean, 0)} %</b>, fast model <b>${fmt(S.mClean, 0)} %</b>. The fast model's whole 12 s flush takes about as long (${fmt(S.msFull, 0)} ms): nearly all of its work is in the first seconds, while the water moves.</p>`;
  }
  function diff() {
    const sw = (arr, t) => { const q = (arr || []).filter((x) => x.t <= t + 1e-9); return q.length ? q[q.length - 1] : null; };
    const tq = Math.min(1.0, S.run.validTo || S.cfd.case.end), cs = sw(S.cfd.swirl, tq), ms = sw(S.mod.series, tq), cs2 = S.cfd2 ? sw(S.cfd2.swirl, tq) : null;
    const first = S.arr && S.arr.arrivalTimes ? S.arr.arrivalTimes.first_1mLs : null;
    $('cfdDiff').innerHTML = `<p><b>Where they differ.</b></p><ul>` +
      (first != null ? `<li><b>First water in the pool:</b> CFD after <b>${fmt(first, 2)} s</b>, as a thin edge running down the steep upper wall; the fast model after <b>${fmt(S.mod.firstArr, 2)} s</b>, when its film front arrives, and then all at once. A real arrival is more gradual than the model's jump.</li>` : '') +
      (cs && ms ? `<li><b>Pool swirl at ${fmt(tq, 1)} s:</b> CFD <b>${fmt(cs.uTheta, 2)} m/s</b>, fast model <b>${fmt(ms.uMean, 2)} m/s</b>. The CFD pool spins faster and forms a deep air core. The two numbers are not defined in quite the same way, so compare the trend.</li>` : '') +
      `<li><b>Wetting:</b> the CFD wets most of the wall within half a second; the fast model reaches the lower wall later. The wetted totals end up close.</li>` +
      `<li><b>Near the waterline:</b> the CFD also counts the swirling pool washing the wall as it rises; the fast model cleans only with the films, so it leaves the band just above the waterline. Higher up, the CFD leaves streaks behind each jet that are wetted but not cleaned. The cleaned totals (${fmt(S.cClean, 0)} % against ${fmt(S.mClean, 0)} %) hide these different patterns: of the wall that stays uncleaned in either, the two agree on only <b>${fmt(S.iouCM, 0)} %</b>. The fast model gets the total about right, but not where the gaps are.${(S.cfd.case.validTo || S.run.validTo) && (S.cfd.case.validTo || S.run.validTo) < S.cfd.case.end - 1e-9 ? ` From ${fmt(S.cfd.case.validTo || S.run.validTo, 1)} s on, the CFD bowl holds more water than the fast model's, which adds to its cleaning near the waterline.` : ''}</li></ul>` +
      (S.sens ? `<p><b>How much depends on the CFD mesh.</b> The same CFD set-up on a coarser mesh (${S.run2.label}, about ${dur(S.cfd2.case.wallClock_s)}${S.cfd2.case.cores ? ` on ${S.cfd2.case.cores} cores` : ''}) gives <b>${fmt(S.sens.clean2, 0)} %</b> cleaned against <b>${fmt(S.cClean, 0)} %</b> here${fmt(S.sens.wet2, 0) === fmt(S.sens.wet1, 0) ? `, both wet ${fmt(S.sens.wet1, 0)} % of the wall` : ` and ${fmt(S.sens.wet2, 0)} % against ${fmt(S.sens.wet1, 0)} % wetted`}${S.cfd2.arrivalTimes && S.arr && S.arr.arrivalTimes ? `, and first water in the pool after ${fmt(S.cfd2.arrivalTimes.first_1mLs, 2)} s against ${fmt(S.arr.arrivalTimes.first_1mLs, 2)} s` : ''}. Cell by cell, the two meshes agree on cleaned or not on ${fmt(S.sens.same, 0)} % of the wall, but ${fmt(S.sens.chance, 0)} % would agree by chance, because most of the wall is cleaned; of the wall that stays uncleaned in either, they agree on <b>${fmt(S.sens.iouU, 0)} %</b>. Pool swirl at ${fmt(tq, 1)} s is ${cs2 ? fmt(cs2.uTheta, 2) : '–'} m/s on the coarser mesh against ${cs ? fmt(cs.uTheta, 2) : '–'} m/s here, still well above the fast model's. So the totals hardly move with the mesh and the differences from the fast model stay, while the places where the wall stays uncleaned depend clearly on the mesh: the CFD does not resolve single film paths reliably either. Two meshes show how much results move; they do not prove that a finer mesh would not change them further.</p>` : '') +
      `<p class="muted">For this one design: close on the totals, off in the details. Whether the fast model gets the effect of a design change right is not shown here; that needs CFD runs of several designs. The next part, the engineering challenge, shows how a few expensive runs can correct such differences during a design.</p>`;
  }

  // ---- wall maps: CFD left, fast model right ----
  function drawMap(cv, title, J, tWet, never, Jcrit, cmp) {
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors();
    ctx.clearRect(0, 0, W, H);
    const padL = 40 * d, padR = 10 * d, padT = 24 * d, padB = 36 * d, w = W - padL - padR, h = H - padT - padB, NTH = 90, NS = 40, cw = w / NTH, chh = h / NS;
    const tEnd = S.cfd.case.end, tt = S.t;
    for (let k = 0; k < NS; k++) for (let i = 0; i < NTH; i++) {
      const j = k * NTH + i; let col;
      if (S.mode === 'wet') {
        const tw = tWet[j];
        if (tw == null || tw >= never || tw > tt + 1e-9) col = C.dry;
        else col = A.mix(C.seq1, C.seq0, Math.min(1, tw / Math.min(1.5, tEnd)) * 0.85);
      } else col = J[j] >= Jcrit ? C.clean : (tWet[j] != null && tWet[j] < never ? C.wet : C.dry);
      ctx.fillStyle = A.rgba(col); ctx.fillRect(padL + i * cw, padT + k * chh, Math.ceil(cw) + 0.5, Math.ceil(chh) + 0.5);
    }
    ctx.strokeStyle = A.rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    // jets at 0 and 180 degrees
    ctx.fillStyle = A.rgba(C.accent); [0, 45].forEach((i) => { const x = padL + i * cw; ctx.beginPath(); ctx.moveTo(x, padT - 2 * d); ctx.lineTo(x + 6 * d, padT - 8 * d); ctx.lineTo(x - 6 * d, padT - 8 * d); ctx.fill(); });
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(C.muted); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, 90, 180, 270, 360].forEach((a) => { ctx.textAlign = a === 360 ? 'right' : 'center'; ctx.fillText(`${a}°`, padL + a / 360 * w, padT + h + 4 * d); }); ctx.textAlign = 'center';
    ctx.fillText('Round the rim, jets at 0° and 180°', padL + w / 2, padT + h + 18 * d);
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Rim to waterline', 0, 0); ctx.restore();
    ctx.font = A.font(11, 600); ctx.fillStyle = A.rgba(C.ink); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(title, padL + 14 * d, padT - 6 * d);
    ctx.textAlign = 'right'; ctx.font = A.font(10.5, 600); ctx.fillText(cmp, padL + w, padT - 6 * d);
  }
  function draw() {
    if (!S.cfd || !S.mod || !S.cWet) return;
    const c = S.cfd.map, m = S.mod, t = S.t;
    const cmpC = S.mode === 'wet' ? `${fmt(S.cWet(t), 0)} % wetted` : `${fmt(S.cClean, 0)} % cleaned`, cmpM = S.mode === 'wet' ? `${fmt(S.mWet(t), 0)} % wetted` : `${fmt(S.mClean, 0)} % cleaned`;
    drawMap($('cvCfdC'), `CFD, OpenFOAM (${S.cfd.case.mesh} mesh)`, c.J, c.tWet, Infinity, S.cfd.Jcrit, cmpC);
    drawMap($('cvCfdM'), 'Fast model', m.J, m.tWet, 1e8, m.Jcrit, cmpM);
    $('cfdTOut').textContent = S.mode === 'wet' ? `t = ${fmt(t, 2)} s` : `0 to ${fmt(S.cfd.case.end, 1)} s`;
    $('cfdT').disabled = S.mode !== 'wet';
    $('cfdLegend').innerHTML = S.mode === 'wet' ? `<span class="sw" style="background:var(--seq1)"></span> wetted early <span class="sw" style="background:var(--seq0)"></span> wetted late <span class="sw" style="background:var(--dry)"></span> still dry` : `<span class="sw" style="background:var(--clean)"></span> cleaned (shear dose at least ${S.cfd.Jcrit} Pa s) <span class="sw" style="background:var(--wet)"></span> wetted, not cleaned <span class="sw" style="background:var(--dry)"></span> dry`;
  }
  // ---- curves over time ----
  function curves() {
    const cv = $('cvCfdCurves'); if (!cv || !S.cfd || !S.cWet) return;
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors(); ctx.clearRect(0, 0, W, H);
    const padL = 44 * d, padR = 44 * d, padT = 26 * d, padB = 34 * d, w = W - padL - padR, h = H - padT - padB, tEnd = S.cfd.case.end;
    const X = (t) => padL + t / tEnd * w, Y = (v) => padT + (1 - v / 100) * h, Y2 = (v) => padT + (1 - v / 1.2) * h;
    ctx.fillStyle = A.rgba(C.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(C.line); ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(C.muted); ctx.textBaseline = 'middle';
    [0, 50, 100].forEach((v) => { ctx.textAlign = 'right'; ctx.fillText(String(v), padL - 5 * d, Y(v)); });
    [0, 0.6, 1.2].forEach((v) => { ctx.textAlign = 'left'; ctx.fillText(v.toFixed(1), padL + w + 5 * d, Y2(v)); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= tEnd + 1e-9; t += 0.5) ctx.fillText(t.toFixed(1), X(t), padT + h + 4 * d);
    ctx.fillText('Time, s', padL + w / 2, padT + h + 17 * d);
    const line = (pts, col, dash) => { ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2 * d; ctx.setLineDash(dash.map((v) => v * d)); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]); };
    const ts = []; for (let t = 0; t <= tEnd + 1e-9; t += 0.025) ts.push(t);
    line(ts.map((t) => [X(t), Y(S.cWet(t))]), C.solid, []); line(ts.map((t) => [X(t), Y(S.mWet(t))]), C.solid, [5, 4]);
    line(S.cfd.swirl.filter((q) => q.t <= tEnd).map((q) => [X(q.t), Y2(q.uTheta)]), C.accent, []); line(S.mod.series.map((q) => [X(q.t), Y2(q.uMean)]), C.accent, [5, 4]);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; let lx = padL; const ly = 12 * d;
    [['wetted wall, % (left)', C.solid], ['pool swirl, m/s (right)', C.accent], ['solid: CFD, dashed: fast model', C.muted]].forEach(([l, col]) => { ctx.fillStyle = A.rgba(col); ctx.fillRect(lx, ly - 1.5 * d, 14 * d, 3 * d); ctx.fillStyle = A.rgba(C.ink); ctx.fillText(l, lx + 18 * d, ly); lx += (26 + ctx.measureText(l).width / d) * d; });
  }

  // ---- time slider and playback ----
  function setT(t) { S.t = Math.max(0, Math.min(S.cfd ? S.cfd.case.end : 0, t)); $('cfdT').value = String(S.t); draw(); }
  function play() {
    if (!S.cfd || S.playing) return Promise.resolve();
    S.mode = 'wet'; modeButtons(); S.playing = true; $('cfdPlay').disabled = true;
    const tEnd = Math.min(1.5, S.cfd.case.end), dur = reduce() ? 0 : 6000, T0 = now();   // the wetting happens in the first second or so
    return new Promise((res) => { (function tick() { const f = dur ? Math.min(1, (now() - T0) / dur) : 1; setT(f * tEnd); if (f < 1) requestAnimationFrame(tick); else { S.playing = false; $('cfdPlay').disabled = false; res(); } })(); });
  }
  function setMode(m) { S.mode = m; modeButtons(); draw(); }
  function modeButtons() { document.querySelectorAll('[data-cfdmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cfdmode === S.mode))); }
  $('cfdT').addEventListener('input', (e) => setT(+e.target.value));
  $('cfdPlay').addEventListener('click', () => play());
  document.querySelectorAll('[data-cfdmode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.cfdmode)));
  ['cvCfdC', 'cvCfdM', 'cvCfdCurves'].forEach((id) => new ResizeObserver(() => requestAnimationFrame(() => { draw(); curves(); })).observe($(id)));
  new MutationObserver(() => { draw(); curves(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.FlushCFD = { play, setMode, setT, ready: () => !!(S.cfd && S.mod && S.cWet), data: () => S };
  load();
})();
