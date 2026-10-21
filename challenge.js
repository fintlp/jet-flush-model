/* Engineering challenge panel. Three routes race to the same targets; every high-fidelity run costs a virtual 8 hours
   (the computing is in challenge-core.js). The eight races of the repeat come from challenge-data.js, so the race
   plays at once; any race can be recomputed live in a web worker and is compared with the stored one.
   Three charts share one virtual clock: how many of the 8 projects each route has finished, the best cleaning
   reached in one chosen race, and what the AI route expected before each of its runs. "Your turn" lets the visitor
   use the simulator as the fast model and spend reference runs by hand. The guided tour (tour.js) drives the panel
   through window.FlushChallengeUI. */
(function () {
  const A = window.FlushApp, M = window.FlushModel, CH = window.FlushChallenge, DATA = window.FlushChallengeData;
  const $ = (id) => document.getElementById(id);
  if (!A || !M || !CH || !$('challenge')) return;
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));
  const now = () => performance.now();
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = CH.make(M);
  const LANES = [
    { k: 'classic', l: 'Classic: one change at a time', short: 'Classic', col: 'solid', dash: [] },
    { k: 'fast', l: 'Fast model alone', short: 'Fast model alone', col: 'lineStrong', dash: [6, 4] },
    { k: 'ai', l: 'Fast model + learned correction (AI)', short: 'AI route', col: 'accent', dash: [] },
    { k: 'you', l: 'You, with the simulator', short: 'You', col: 'clean', dash: [2, 3] }
  ];
  const RUNS_PER_DAY = 24 / C.RUN_HOURS, SPAN_DAYS = 10, SPAN = SPAN_DAYS * RUNS_PER_DAY;   // the clock runs to 10 days
  const days = (n) => n / RUNS_PER_DAY;
  const daysTxt = (n) => { const d = days(n); if (d < 1) return `${Math.round(n * C.RUN_HOURS)} hours`; const v = +d.toFixed(d < 10 ? 1 : 0); return `${v} ${v === 1 ? 'day' : 'days'}`; };
  const desTxt = (des) => C.DV.map((d) => `${d.n} ${fmt(des[d.k], d.st < 1 ? 1 : 0)}${d.u}`).join(', ');
  const otherOK = (e) => e.water <= C.T.water + 1e-9 && e.solids >= C.T.solids && e.paper >= C.T.paper && e.ok;
  const missTxt = (e) => {
    const m = [];
    if (e.water > C.T.water + 1e-9) m.push(`water ${fmt(e.water, 1)} L`);
    if (e.clean < C.T.clean) m.push(`cleaning ${fmt(C.T.clean - e.clean, 1)} points short`);
    if (e.solids < C.T.solids) m.push(`solids ${fmt(C.T.solids - e.solids, 1)} short`);
    if (e.paper < C.T.paper) m.push(`paper ${fmt(C.T.paper - e.paper, 1)} short`);
    if (!e.ok) m.push('seal not restored or flush not valid');
    return m.length ? 'misses: ' + m.join(', ') : 'meets all targets';
  };
  // stored runs to the form the page uses
  const unpack = (q, i) => ({
    n: i + 1, des: Object.fromEntries(C.DV.map((d, j) => [d.k, q.d[j]])), why: q.why, ok: !!q.ok, kept: q.kept == null ? null : !!q.kept,
    e: { clean: q.e[0], solids: q.e[1], paper: q.e[2], water: q.e[3], ok: !!q.e[4] }, f: { clean: q.f[0], solids: q.f[1], paper: q.f[2] },
    pred: q.pred ? { m: q.pred[0], s: q.pred[1], p: q.pred[2] } : null
  });
  const RACES = DATA && DATA.races ? DATA.races.map((r) => ({ seed: r.seed, start: r.start, routes: Object.fromEntries(CH.ROUTES.map((k) => [k, { toTarget: r.routes[k].toTarget, runs: r.routes[k].runs.map(unpack) }])) })) : [];
  const S = { sel: 0, clock: null, playing: false, you: [], verified: {}, verifying: null, worker: null };

  // ---- figures over the eight races ----
  const median = (v) => { const s = v.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const stat = (k) => { const v = RACES.map((r) => r.routes[k].toTarget); const hit = v.filter((x) => x != null); return { v, hit, miss: v.length - hit.length, med: hit.length === v.length ? median(hit) : null, min: Math.min(...hit), max: Math.max(...hit), sum: hit.reduce((a, b) => a + b, 0) }; };
  const ST = RACES.length ? { classic: stat('classic'), fast: stat('fast'), ai: stat('ai') } : null;
  const medTxt = (v) => fmt(v, v % 1 ? 1 : 0);

  // ---- task text ----
  const s0 = C.ref(C.start);
  $('chTask').innerHTML = `<p><b>Start:</b> the EU washdown bowl made oval (1.35), jets at the ends of the long axis, ${fmt(C.base.Vfull, 1)} L. The reference gives ${fmt(s0.clean, 1)} % cleaning, ${fmt(s0.solids, 0)} % solids, ${fmt(s0.paper, 0)} % paper.</p>` +
    `<p><b>Targets:</b> at most ${fmt(C.T.water, 1)} L, cleaning at least ${C.T.clean} %, solids at least ${C.T.solids} %, paper at least ${C.T.paper} %, seal restored. <b>May change:</b> ${C.DV.map((d) => d.n).join(', ')}.</p>` +
    `<p><b>Cost:</b> ${C.RUN_HOURS} hours of computing per high-fidelity run, one run at a time. The fast model costs milliseconds and is not counted.</p>`;

  // ---- the clock: one playback drives all three charts ----
  function play() {
    if (!RACES.length) return Promise.resolve();
    S.playing = true; $('chPlay').disabled = true;
    const T0 = now(), dur = reduce() ? 0 : 9000;
    return new Promise((resolve) => {
      (function tick() {
        const f = dur ? Math.min(1, (now() - T0) / dur) : 1;
        S.clock = f * SPAN; drawAll();
        if (f < 1 && S.playing) requestAnimationFrame(tick);
        else { S.playing = false; S.clock = SPAN; drawAll(); $('chPlay').disabled = false; $('chPlay').textContent = 'Play again'; summary(); if (!S.verified[0] && !S.verifying) verify(0); resolve(); }
      })();
    });
  }
  function clockTxt() { const el = $('chClock'); if (el) el.textContent = S.clock == null ? '' : `Virtual clock: day ${fmt(days(S.clock), 1)} of ${SPAN_DAYS}`; }

  // ---- headline and tables ----
  function summary() {
    if (!ST) return;
    const doneBy = (k, n) => ST[k].v.filter((x) => x != null && x <= n).length;
    const dAI = days(ST.ai.max), cl = ST.classic;
    $('chHead').innerHTML = `<p class="ch-big">Across ${RACES.length} design projects, the AI route reached the targets in <b>${medTxt(ST.ai.med)} runs</b> typically (${ST.ai.min} to ${ST.ai.max}), the classic route in <b>${medTxt(cl.med)}</b> (${cl.min} to ${cl.max}). The AI route finished all ${RACES.length} within ${daysTxt(ST.ai.max)}; by then the classic route had finished ${doneBy('classic', ST.ai.max)}. The fast model alone was sometimes quickest, but missed the targets within ${C.MAXR} runs in ${ST.fast.miss} of ${RACES.length}.</p>` +
      `<p>In total the AI route used ${ST.ai.sum} high-fidelity runs for the ${RACES.length} projects, the classic route ${cl.sum}: ${cl.sum - ST.ai.sum} runs or about ${Math.round(days(cl.sum - ST.ai.sum))} days of computing less.</p>`;
    $('chWhy').innerHTML = `<p class="muted">Why: the fast model is quick but off in places, here by about 3 points of cleaning on average and more at high valve heights, where the reference loses cleaning to splash. When its best designs lie where it is right, it wins; when not, it keeps sending the reference to designs that only look good in the fast model. The AI route learns that difference from every expensive run and corrects the fast model before choosing the next one. The classic route needs no model, but tests one change per run. The reference is synthetic and the task has five settings, so these numbers illustrate the principle; they are not a benchmark.</p>`;
  }
  function repTable() {
    if (!ST) return;
    $('chRep').innerHTML = `<thead><tr><th>Runs to target</th>${RACES.map((_, i) => `<th class="num"><button type="button" class="ch-pick${i === S.sel ? ' on' : ''}" data-race="${i}" aria-pressed="${i === S.sel}" title="Show race ${i + 1} below">#${i + 1}</button></th>`).join('')}<th class="num">median</th></tr></thead><tbody>` +
      [['classic', 'Classic'], ['fast', 'Fast model alone'], ['ai', 'AI route']].map(([k, l]) => `<tr><td>${l}</td>${ST[k].v.map((v, i) => `<td class="num${i === S.sel ? ' sel' : ''}">${v == null ? `> ${C.MAXR}` : v}</td>`).join('')}<td class="num">${ST[k].med == null ? '–' : medTxt(ST[k].med)}</td></tr>`).join('') + '</tbody>';
    $('chRep').querySelectorAll('.ch-pick').forEach((b) => b.addEventListener('click', () => select(+b.dataset.race)));
  }
  function raceDetails() {
    const R = RACES[S.sel]; if (!R) return;
    $('chRaceTitle').textContent = `Inside race #${S.sel + 1}${S.sel === 0 ? ', from the start design above' : ', from another start design'}`;
    $('chTable').innerHTML = `<thead><tr><th>Route</th><th>Runs to target</th><th>Virtual time</th><th>Final design</th><th>Reference result</th></tr></thead><tbody>` +
      ['classic', 'fast', 'ai'].map((k) => { const l = LANES.find((x) => x.k === k), v = R.routes[k], hit = v.runs.find((r) => r.ok) || v.runs.slice().sort((a, b) => (otherOK(b.e) - otherOK(a.e)) || b.e.clean - a.e.clean)[0]; return `<tr><td data-l="Route">${l.l}</td><td class="num" data-l="Runs to target">${v.toTarget || `> ${C.MAXR}`}</td><td class="num" data-l="Virtual time">${v.toTarget ? daysTxt(v.toTarget) : `> ${daysTxt(C.MAXR)}`}</td><td data-l="Final design">${desTxt(hit.des)}</td><td data-l="Reference result">${fmt(hit.e.clean, 1)} % cleaning, ${fmt(hit.e.solids, 0)} % solids, ${fmt(hit.e.paper, 0)} % paper, ${fmt(hit.e.water, 1)} L${hit.ok ? '' : ' (best run, ' + missTxt(hit.e) + ')'}</td></tr>`; }).join('') + '</tbody>';
    $('chLog').innerHTML = `<summary>Every run of race #${S.sel + 1}</summary><div class="tablewrap"><table class="compact"><thead><tr><th>Route</th><th>Run</th><th>Why this design</th><th>Fast model, cleaning</th><th>AI expected</th><th>Reference: cleaning, solids, paper, water</th></tr></thead><tbody>` +
      ['classic', 'fast', 'ai'].map((k) => R.routes[k].runs.map((r) => `<tr${r.ok ? ' class="ok"' : ''}><td>${LANES.find((l) => l.k === k).short}</td><td class="num">${r.n}</td><td>${r.why}${r.kept === false ? ', undone' : r.kept ? ', kept' : ''}</td><td class="num">${fmt(r.f.clean, 1)}</td><td class="num">${k === 'ai' && r.pred ? `${fmt(r.pred.m, 1)} ± ${fmt(2 * r.pred.s, 1)}` : '–'}</td><td class="num">${fmt(r.e.clean, 1)}, ${fmt(r.e.solids, 0)}, ${fmt(r.e.paper, 0)}, ${fmt(r.e.water, 1)}${r.ok ? ' ✓' : ''}</td></tr>`).join('')).join('') + '</tbody></table></div>';
    verifyLine();
  }
  function select(i) { if (!RACES[i]) return; S.sel = i; repTable(); raceDetails(); drawAll(); }

  // ---- live recomputation in a worker (or in time slices where workers are not available) ----
  function verifyLine() {
    const el = $('chVerify'); if (!el) return;
    const i = S.sel, v = S.verified[i];
    $('chVerifyBtn').disabled = !!S.verifying;
    if (S.verifying && S.verifying.i === i) el.innerHTML = `Recomputing race #${i + 1} live in your browser: ${S.verifying.n} simulations so far…`;
    else if (v) el.innerHTML = v.same ? `<b>Race #${i + 1} recomputed live in your browser: identical ✓</b> (${v.sims} simulations in ${fmt(v.ms / 1000, 0)} s).` : `<b>Race #${i + 1} recomputed live differs from the stored race.</b> The stored races may be out of date (<code>node checks/challenge.js --write</code>).`;
    else el.innerHTML = `The races play from stored results so the demo starts at once. Each can be recomputed live with the same code: about 20 to 40 s.`;
  }
  function verify(i) {
    if (S.verifying || !DATA) return Promise.resolve(null);
    S.verifying = { i, n: 0 }; verifyLine();
    const want = JSON.stringify(DATA.races[i]);
    return new Promise((resolve) => {
      const finish = (res, ms, sims) => { S.verifying = null; S.verified[i] = { same: JSON.stringify(res) === want, ms, sims }; verifyLine(); resolve(S.verified[i]); };
      let w = null;
      try { w = new Worker('challenge-worker.js?v=22'); } catch (e) { w = null; }
      if (w) {
        w.onmessage = (ev) => { const d = ev.data; if (d.progress) { S.verifying.n = d.progress; if (S.sel === i) verifyLine(); } else if (d.done) { w.terminate(); finish(d.done, d.ms, d.sims); } else if (d.error) { w.terminate(); slicesVerify(i, finish); } };
        w.onerror = () => { w.terminate(); slicesVerify(i, finish); };
        w.postMessage({ race: i, v: '22' });
      } else slicesVerify(i, finish);
    });
  }
  function slicesVerify(i, finish) {
    const g = CH.race(M, i), t0 = now(); let n = 0;
    (function tick() { const t = now(); let s; while (now() - t < 12) { s = g.next(); n++; if (s.done) { finish(s.value, now() - t0, n); return; } } S.verifying.n = n; if (S.sel === i) verifyLine(); requestAnimationFrame(tick); })();
  }

  // ---- charts ----
  function frame(cv, o) {
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), Cc = A.readColors(), narrow = cv.clientWidth < 420;
    ctx.clearRect(0, 0, W, H);
    const padL = 46 * d, padR = 14 * d, padT = (o.top || 30) * d, padB = 40 * d, w = W - padL - padR, h = H - padT - padB;
    const X = (n) => padL + Math.min(SPAN, n) / SPAN * w, Y = (v) => padT + (1 - (Math.max(o.y[0], Math.min(o.y[1], v)) - o.y[0]) / (o.y[1] - o.y[0])) * h;
    ctx.fillStyle = A.rgba(Cc.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(Cc.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(Cc.muted); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    o.yt.forEach((v) => { ctx.fillText(String(v), padL - 6 * d, Y(v)); ctx.strokeStyle = A.rgba(Cc.line, 0.6); ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + w, Y(v)); ctx.stroke(); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let dd = 0; dd <= SPAN_DAYS; dd += narrow ? 2 : 1) ctx.fillText(String(dd), X(dd * RUNS_PER_DAY), padT + h + 5 * d);
    ctx.fillText(o.xl || (narrow ? 'Virtual days (3 runs a day)' : 'Virtual days of high-fidelity computing (3 runs a day)'), padL + w / 2, padT + h + 20 * d);
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yl, 0, 0); ctx.restore();
    // the clock
    if (S.clock != null && S.clock < SPAN) { ctx.strokeStyle = A.rgba(Cc.ink, 0.35); ctx.lineWidth = 1 * d; ctx.beginPath(); ctx.moveTo(X(S.clock), padT); ctx.lineTo(X(S.clock), padT + h); ctx.stroke(); }
    return { ctx, W, H, d, Cc, narrow, padL, padT, w, h, X, Y };
  }
  function legend(f, lanes) {
    const { ctx, d, Cc, padL, w } = f; ctx.font = A.font(10); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; let lx = padL, ly = 12 * d;
    lanes.forEach((l) => {
      const lw = (30 + ctx.measureText(l.short).width / d) * d;
      if (lx > padL && lx + lw > padL + w) { lx = padL; ly += 14 * d; }
      ctx.strokeStyle = A.rgba(Cc[l.col]); ctx.lineWidth = 2.4 * d; ctx.setLineDash(l.dash.map((v) => v * d)); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18 * d, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = A.rgba(Cc.ink); ctx.fillText(l.short, lx + 22 * d, ly); lx += lw;
    });
  }
  const lim = () => (S.clock == null ? 0 : S.clock);
  // A: how many of the 8 projects each route has finished
  function drawAll3() {
    const cv = $('cvChAll'); if (!cv) return;
    const n = RACES.length || 8, f = frame(cv, { y: [0, n], yt: Array.from({ length: n / 2 + 1 }, (_, i) => 2 * i), yl: 'Projects that met the targets', top: 30 });
    const { ctx, d, Cc, X, Y, padL, w } = f, L = lim();
    LANES.slice(0, 3).forEach((l) => {
      if (!ST) return;
      const hits = ST[l.k].v.filter((x) => x != null).sort((a, b) => a - b);
      ctx.strokeStyle = A.rgba(Cc[l.col]); ctx.lineWidth = 3 * d; ctx.setLineDash(l.dash.map((v) => v * d)); ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      let c = 0; for (const t of hits) { if (t > L) break; ctx.lineTo(X(t), Y(c)); c++; ctx.lineTo(X(t), Y(c)); }
      ctx.lineTo(X(L), Y(c)); ctx.stroke(); ctx.setLineDash([]);
      if (L > 0) { ctx.fillStyle = A.rgba(Cc[l.col]); ctx.beginPath(); ctx.arc(X(L), Y(c), 3.5 * d, 0, 2 * Math.PI); ctx.fill(); }
      if (S.clock >= SPAN && !f.narrow) { ctx.font = A.font(10.5, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`${c} of ${n}`, padL + w - 6 * d, Y(c) - 3 * d - (l.k === 'fast' && c === ST.ai.hit.length ? 13 * d : 0)); ctx.font = A.font(10); }
    });
    legend(f, LANES.slice(0, 3));
    if (S.clock == null) { ctx.fillStyle = A.rgba(Cc.muted); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = A.font(11); ctx.fillText('Press Play to run the clock', padL + w / 2, Y(n / 2)); }
  }
  // B: best cleaning so far in the chosen race
  function drawRace() {
    const cv = $('cvCh'); if (!cv) return;
    const R = RACES[S.sel], lanes = LANES.map((l) => Object.assign({}, l, { runs: l.k === 'you' ? S.you : R ? R.routes[l.k].runs : [] })).filter((l) => l.runs.length);
    const narrow = cv.clientWidth < 380;
    const f = frame(cv, { y: [60, 95], yt: [60, 65, 70, 75, 80, 85, 90, 95], yl: 'Best cleaning so far, %', top: narrow && lanes.length > 2 ? 44 : 30 });
    const { ctx, d, Cc, X, Y, padL, padT, w } = f, L = lim();
    ctx.strokeStyle = A.rgba(Cc.bad); ctx.setLineDash([6 * d, 4 * d]); ctx.lineWidth = 1.4 * d; ctx.beginPath(); ctx.moveTo(padL, Y(C.T.clean)); ctx.lineTo(padL + w, Y(C.T.clean)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = A.rgba(Cc.bad); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(cv.clientWidth < 640 ? `target ${C.T.clean} %` : `target ${C.T.clean} %, with ≤ ${C.T.water} L and the solids, paper and seal targets met`, padL + 6 * d, Y(C.T.clean) + 3 * d);
    const placed = [];
    lanes.forEach((l) => {
      const col = Cc[l.col], vis = l.k === 'you' ? l.runs : l.runs.filter((r) => r.n <= L + 1e-9);
      vis.forEach((r) => {
        if (r.n > SPAN) return;
        ctx.beginPath(); ctx.arc(X(r.n), Y(r.e.clean), (r.ok ? 4.5 : 2.6) * d, 0, 2 * Math.PI);
        if (otherOK(r.e)) { ctx.fillStyle = A.rgba(col, 0.85); ctx.fill(); } else { ctx.strokeStyle = A.rgba(col, 0.8); ctx.lineWidth = 1.2 * d; ctx.stroke(); }
      });
      let best = null, started = false; ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2.4 * d; ctx.setLineDash(l.dash.map((v) => v * d)); ctx.beginPath();
      vis.forEach((r) => { if (otherOK(r.e) && (best == null || r.e.clean > best)) { if (started) ctx.lineTo(X(r.n), Y(best)); best = r.e.clean; if (!started) { ctx.moveTo(X(r.n), Y(best)); started = true; } else ctx.lineTo(X(r.n), Y(best)); } });
      if (started) ctx.lineTo(X(l.k === 'you' ? l.runs.length : Math.min(L, l.runs[l.runs.length - 1].n)), Y(best));
      ctx.stroke(); ctx.setLineDash([]);
      const hit = vis.find((r) => r.ok);
      if (hit && !narrow) {
        ctx.font = A.font(10.5, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const txt = `${l.short}: ${hit.n} runs`, tw = ctx.measureText(txt).width, x0 = Math.min(X(hit.n) + 6 * d, padL + w - tw - 4 * d); let y0 = Y(hit.e.clean) - 6 * d; const lh = 13 * d;
        while (placed.some((b) => x0 < b.x + b.w && b.x < x0 + tw && y0 > b.y - lh && y0 - lh < b.y)) y0 -= lh;
        placed.push({ x: x0, y: y0, w: tw }); ctx.fillStyle = A.rgba(col); ctx.fillText(txt, x0, y0); ctx.font = A.font(10);
      }
      if (l.k !== 'you' && !l.runs.some((r) => r.ok) && L >= Math.min(SPAN, l.runs.length) && !narrow) {
        ctx.font = A.font(10.5, 600); ctx.fillStyle = A.rgba(col); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`${l.short}: no success within ${C.MAXR} runs`, padL + w - 6 * d, padT + 6 * d); ctx.font = A.font(10);
      }
    });
    legend(f, lanes);
  }
  // C: what the AI route expected before each run, against what the reference gave
  function drawPred() {
    const cv = $('cvChPred'); if (!cv) return;
    const R = RACES[S.sel], runs = R ? R.routes.ai.runs.filter((r) => r.pred) : [], L = lim();
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), Cc = A.readColors();
    ctx.clearRect(0, 0, W, H);
    const padL = 46 * d, padR = 14 * d, padT = (cv.clientWidth < 420 ? 44 : 30) * d, padB = 40 * d, w = W - padL - padR, h = H - padT - padB, nMax = Math.max(6, runs.length + 1);
    const X = (n) => padL + (n - 0.5) / nMax * w, y0 = 60, y1 = 95, Y = (v) => padT + (1 - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0)) * h;
    ctx.fillStyle = A.rgba(Cc.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(Cc.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(Cc.muted); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = y0; v <= y1; v += 5) { ctx.fillText(String(v), padL - 6 * d, Y(v)); ctx.strokeStyle = A.rgba(Cc.line, 0.6); ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + w, Y(v)); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let n = 1; n < nMax; n++) ctx.fillText(String(n + 1), X(n), padT + h + 5 * d);
    ctx.fillText('AI route, run number', padL + w / 2, padT + h + 20 * d);
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Cleaning, %', 0, 0); ctx.restore();
    ctx.strokeStyle = A.rgba(Cc.bad); ctx.setLineDash([6 * d, 4 * d]); ctx.lineWidth = 1.4 * d; ctx.beginPath(); ctx.moveTo(padL, Y(C.T.clean)); ctx.lineTo(padL + w, Y(C.T.clean)); ctx.stroke(); ctx.setLineDash([]);
    runs.forEach((r, i) => {
      if (r.n > L + 1e-9) return;
      const x = X(i + 1), col = Cc.accent;
      ctx.strokeStyle = A.rgba(col, 0.55); ctx.lineWidth = 6 * d; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, Y(r.pred.m - 2 * r.pred.s)); ctx.lineTo(x, Y(r.pred.m + 2 * r.pred.s)); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(x - 7 * d, Y(r.pred.m)); ctx.lineTo(x + 7 * d, Y(r.pred.m)); ctx.stroke();
      ctx.fillStyle = A.rgba(r.ok ? Cc.clean : Cc.ink); ctx.beginPath(); ctx.arc(x, Y(r.e.clean), (r.ok ? 5 : 3.5) * d, 0, 2 * Math.PI); ctx.fill();
    });
    // legend
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; let lx = padL; const ly = 12 * d;
    ctx.strokeStyle = A.rgba(Cc.accent, 0.55); ctx.lineWidth = 6 * d; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(lx + 4 * d, ly); ctx.lineTo(lx + 14 * d, ly); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = A.rgba(Cc.ink); ctx.fillText('expected, with uncertainty', lx + 20 * d, ly); lx += (20 + ctx.measureText('expected, with uncertainty').width / d + 18) * d;
    let ly2 = ly; if (lx + (14 + ctx.measureText('reference gave').width / d) * d > padL + w) { lx = padL; ly2 = ly + 14 * d; }
    ctx.beginPath(); ctx.arc(lx + 5 * d, ly2, 3.5 * d, 0, 2 * Math.PI); ctx.fill(); ctx.fillText('reference gave', lx + 12 * d, ly2);
    if (!runs.length) { ctx.fillStyle = A.rgba(Cc.muted); ctx.textAlign = 'center'; ctx.fillText('No predictions in this race', padL + w / 2, padT + h / 2); }
  }
  function drawAll() { drawAll3(); drawRace(); drawPred(); clockTxt(); }

  // ---- your turn ----
  function youRun() {
    const p = A.getP(), des = {}; C.DV.forEach((d) => { des[d.k] = p[d.k]; });
    const x = C.snapX(C.toX(des));
    const other = ['ovality', 'nJets', 'Rrim', 'Rpool', 'Dwall', 'seal', 'dTrap', 'Kpath', 'type'].filter((k) => p[k] !== C.base[k]);
    const e = C.ref(x), f = C.fast(x), g = C.gapOf(e), r = { n: S.you.length + 1, x, des: C.toDesign(x), e, f, g, ok: g === 0 };
    S.you.push(r);
    const hit = S.you.find((q) => q.ok);
    $('chYouLog').innerHTML = S.you.map((q) => `<li><b>Run ${q.n}</b> (${daysTxt(q.n)}): fast model ${fmt(q.f.clean, 1)} %, reference ${fmt(q.e.clean, 1)} % cleaning, ${fmt(q.e.solids, 0)} % solids, ${fmt(q.e.paper, 0)} % paper, ${fmt(q.e.water, 1)} L: ${missTxt(q.e)}.</li>`).join('') +
      (other.length ? `<li class="muted">Only the six challenge settings were taken from the simulator; ${other.join(', ')} come from the challenge's start design.</li>` : '');
    $('chYouSum').innerHTML = hit ? `<p class="ch-big">You met the targets after <b>${hit.n} runs (${daysTxt(hit.n)})</b>. In race #1 the AI route needed ${RACES[0] ? RACES[0].routes.ai.toTarget : '–'}, the classic route ${RACES[0] ? RACES[0].routes.classic.toTarget : '–'}.</p>` : '';
    if (S.clock == null) S.clock = SPAN;
    if (S.sel !== 0) select(0); else drawAll();
    return r;
  }
  function loadStart() {
    const v = {}; ['ovality', 'jetPhase', 'nJets', 'Rrim', 'Rpool', 'Dwall', 'seal', 'dTrap', 'Kpath', 'Hcr', 'Vfull', 'Anoz', 'hNoz', 'alpha', 'flushMode'].forEach((k) => { v[k] = C.base[k]; });
    A.apply(v); $('chYouNote').textContent = 'The start design is loaded into the simulator. Change the six settings, watch the result cards, then send the design to the reference.';
  }
  function youReset() { S.you = []; $('chYouLog').innerHTML = ''; $('chYouSum').innerHTML = ''; drawAll(); }
  function reveal(open) {
    const box = $('chHidden'); open = open == null ? box.hidden : open; box.hidden = !open; $('chReveal').setAttribute('aria-expanded', String(open));
    if (open) box.innerHTML = `<p>The reference is the same flush model with other coefficients, plus effects the fast model does not have:</p><ul>` +
      Object.keys(C.HID).map((k) => `<li>${A.SPECK[k] ? A.SPECK[k].l : k}: ${M.COEFFS[k]} in the fast model, ${C.HID[k]} in the reference.</li>`).join('') +
      `<li>Cleaning lost at high valve heights, as fast jets splash and break up (up to about 5 points at the top of the range).</li><li>Cleaning lost away from a best nozzle size and for steep jets.</li><li>Less solids removal for small nozzles at low volume.</li></ul><p class="muted">These stand in for what a CFD run or a rig shows and a fast model misses. When the OpenFOAM reference runs are in (method section 13), they will anchor this reference.</p>`;
  }

  $('chPlay').addEventListener('click', () => { if (!S.playing) play(); });
  $('chVerifyBtn').addEventListener('click', () => verify(S.sel));
  $('chLoad').addEventListener('click', loadStart);
  $('chYouRun').addEventListener('click', youRun);
  $('chYouReset').addEventListener('click', youReset);
  $('chReveal').addEventListener('click', () => reveal());
  ['cvChAll', 'cvCh', 'cvChPred'].forEach((id) => new ResizeObserver(() => requestAnimationFrame(drawAll)).observe($(id)));
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', drawAll);
  new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (!RACES.length) $('chVerify').textContent = 'The stored races (challenge-data.js) did not load.';
  repTable(); raceDetails(); drawAll();
  window.FlushChallengeUI = {
    play, select, verify, reveal, loadStart, youRun, youReset, races: () => RACES, stats: () => ST, sel: () => S.sel,
    playing: () => S.playing, busy: () => S.playing || !!S.verifying, verified: (i) => S.verified[i == null ? S.sel : i], you: () => S.you, core: C
  };
  if (location.hash === '#challenge') setTimeout(() => { $('challenge').scrollIntoView(); play(); }, 600);
})();
