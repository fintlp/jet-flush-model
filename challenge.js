/* Engineering challenge panel: three routes race to the same targets, each high-fidelity run costing a virtual
   8 hours (computing part in challenge-core.js). The page runs the routes in time slices with a progress bar,
   then plays the race back on a virtual clock. "Your turn" lets the visitor use the simulator as their fast model
   and spend reference runs by hand. */
(function () {
  const A = window.FlushApp, M = window.FlushModel, CH = window.FlushChallenge;
  const $ = (id) => document.getElementById(id);
  if (!A || !M || !CH || !$('challenge')) return;
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));
  const now = () => performance.now();
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = CH.make(M);
  const LANES = [
    { k: 'classic', l: 'Classic: one change at a time', short: 'Classic', col: 'solid', dash: [] },
    { k: 'fast', l: 'Fast model alone', short: 'Fast model alone', col: 'lineStrong', dash: [5, 4] },
    { k: 'ai', l: 'Fast model + learned correction (AI)', short: 'AI route', col: 'accent', dash: [] },
    { k: 'you', l: 'You, with the simulator', short: 'You', col: 'clean', dash: [2, 3] }
  ];
  const DVL = C.DV.map((d) => Object.assign({}, d, A.SPECK[d.k]));
  const S = { res: {}, running: false, stop: null, play: 1, you: [], t0: 0 };
  const days = (n) => n * C.RUN_HOURS / 24;
  const daysTxt = (n) => { const d = days(n); if (d < 1) return `${Math.round(n * C.RUN_HOURS)} hours`; const v = +d.toFixed(d < 10 ? 1 : 0); return `${v} ${v === 1 ? 'day' : 'days'}`; };
  const desTxt = (des) => DVL.map((d) => `${d.l.replace(/ per jet| above jets| around rim/g, '').toLowerCase()} ${fmt(des[d.k], d.d)}${d.u === '°' ? '°' : d.u ? ' ' + d.u : ''}`).join(', ');
  const missTxt = (e) => {
    const m = [];
    if (e.water > C.T.water + 1e-9) m.push(`water ${fmt(e.water, 1)} L`);
    if (e.clean < C.T.clean) m.push(`cleaning ${fmt(C.T.clean - e.clean, 1)} points short`);
    if (e.solids < C.T.solids) m.push(`solids ${fmt(C.T.solids - e.solids, 1)} short`);
    if (e.paper < C.T.paper) m.push(`paper ${fmt(C.T.paper - e.paper, 1)} short`);
    if (!e.ok) m.push('seal not restored or flush not valid');
    return m.length ? 'misses: ' + m.join(', ') : 'meets all targets';
  };

  // ---- task text ----
  const s0 = C.ref(C.start);
  $('chTask').innerHTML = `<p><b>Start:</b> the EU washdown bowl made oval (1.35), jets at the ends of the long axis, ${fmt(C.base.Vfull, 1)} L. The reference gives ${fmt(s0.clean, 1)} % cleaning, ${fmt(s0.solids, 0)} % solids, ${fmt(s0.paper, 0)} % paper.</p>` +
    `<p><b>Targets:</b> at most ${fmt(C.T.water, 1)} L, cleaning at least ${C.T.clean} %, solids at least ${C.T.solids} %, paper at least ${C.T.paper} %, seal restored. <b>May change:</b> ${DVL.map((d) => d.l.toLowerCase()).join(', ')}.</p>` +
    `<p><b>Cost:</b> ${C.RUN_HOURS} hours of computing per high-fidelity run, one run at a time. The fast model costs milliseconds and is not counted.</p>`;

  // ---- progress ----
  function bar(f, txt) {
    const b = $('chProg'); if (!b) return;
    b.hidden = f == null; if (f == null) return;
    const pc = Math.round(100 * Math.max(0, Math.min(1, f)));
    b.querySelector('.prog-fill').style.width = pc + '%'; b.querySelector('.prog-bar').setAttribute('aria-valuenow', String(pc));
    b.querySelector('.prog-txt').textContent = txt;
  }

  // ---- the race: compute in time slices, then play back ----
  function race() {
    if (S.running) return;
    S.running = true; S.res = {}; S.play = 0; $('chRun').disabled = true; $('chHead').innerHTML = ''; $('chTable').innerHTML = ''; $('chLog').innerHTML = '';
    const est = 700; let nSim = 0; const c0 = C.count.fast + C.count.ref, t0 = now();
    const order = ['classic', 'fast', 'ai']; let li = 0, gen = C.routes[order[0]](C.start);
    const label = (k, ev) => {
      if (k === 'classic') return `Classic route: run ${ev && ev.r ? ev.r.n : 1}`;
      if (!C.pool()) return `The fast model screens ${300} designs (real computing time, not counted on the virtual clock)`;
      return k === 'fast' ? `Fast model alone: run ${ev && ev.r ? ev.r.n : 1}` : `AI route: run ${ev && ev.r ? ev.r.n : 1}, learning the correction and picking the next design`;
    };
    S.stop = slices(() => {
      const st = gen.next();
      if (st.done) {
        S.res[order[li]] = st.value; li++;
        if (li >= order.length) return false;
        gen = C.routes[order[li]](C.start); return true;
      }
      nSim = C.count.fast + C.count.ref - c0;
      const el = now() - t0, f = Math.min(0.99, nSim / est);
      bar(f, `${label(order[li], st.value)}${f > 0.05 && el > 1500 ? `, about ${Math.max(1, Math.round(el * (1 - f) / f / 1000))} s left` : ''}`);
      return true;
    }, () => {
      S.running = false; $('chRun').disabled = false; bar(null);
      $('chStatus').textContent = `Computed in ${((now() - t0) / 1000).toFixed(0)} s of real time in your browser: ${C.count.fast} fast-model flushes and ${C.count.ref} reference runs.`;
      playback();
    });
  }
  function slices(step, done) {
    let alive = true;
    (function tick() { if (!alive) return; const t0 = now(); while (now() - t0 < 14) { if (step() === false) { alive = false; done(); return; } } requestAnimationFrame(tick); })();
    return () => { alive = false; };
  }
  function maxRuns() { const r = Object.values(S.res).map((v) => v.toTarget || v.runs.length); if (S.you.length) r.push(S.you.length); return Math.max(6, ...r); }
  function playback() {
    const span = Math.min(C.MAXR, maxRuns()), T0 = now(), dur = reduce() ? 0 : 6000;
    (function tick() {
      S.play = dur ? Math.min(1, (now() - T0) / dur) : 1;
      draw();
      $('chClock').textContent = `Virtual clock: ${daysTxt(S.play * span)}`;
      if (S.play < 1) requestAnimationFrame(tick); else finish();
    })();
  }
  function finish() {
    const R = S.res, cl = R.classic, fa = R.fast, ai = R.ai;
    const line = (v) => (v.toTarget ? `${v.toTarget} runs (${daysTxt(v.toTarget)})` : `not within ${v.runs.length} runs`);
    const RP = C.REPEAT, med = (v) => fmt(v, v % 1 ? 1 : 0);
    $('chHead').innerHTML = `<p class="ch-big">This race: AI route <b>${line(ai)}</b>, classic route <b>${line(cl)}</b>, fast model alone <b>${line(fa)}</b>.</p>` +
      `<p>One race depends on the start design and on chance in the screening, so it was run ${RP.n} times with other start designs, other random choices and, for the classic route, another order of settings (<code>checks/challenge.js</code>). Typical runs to target: <b>AI route ${med(RP.ai[1])}</b> (never more than ${RP.ai[2]}), <b>classic ${med(RP.classic[1])}</b> (up to ${RP.classic[2]}). The fast model alone was sometimes the quickest, but missed the targets within ${C.MAXR} runs in ${RP.fastMiss} of ${RP.n}.</p>` +
      `<div class="tablewrap"><table class="compact ch-rep"><thead><tr><th>Runs to target</th>${RP.rows.ai.map((_, i) => `<th class="num">${i === 0 ? 'this race' : '#' + (i + 1)}</th>`).join('')}<th class="num">median</th></tr></thead><tbody>` +
      [['classic', 'Classic'], ['fast', 'Fast model alone'], ['ai', 'AI route']].map(([k, l]) => `<tr><td>${l}</td>${RP.rows[k].map((v) => `<td class="num">${v == null ? `> ${C.MAXR}` : v}</td>`).join('')}<td class="num">${k === 'fast' ? '–' : med(RP[k][1])}</td></tr>`).join('') + '</tbody></table></div>' +
      `<p class="muted">Why: the fast model is quick but off in places, here by about 3 points of cleaning on average and much more at high valve heights, where the reference loses cleaning to splash. When its best designs happen to lie where it is right, it wins; when not, it keeps sending the reference runs to designs that look good only in the fast model. The AI route learns the difference from every expensive run and corrects the fast model before choosing the next one, so it reached the targets every time, mostly within a few runs. The classic route needs no model, but tests only one change per run.</p>`;
    $('chTable').innerHTML = `<thead><tr><th>Route</th><th>Runs to target</th><th>Virtual time</th><th>Final design</th><th>Reference result</th></tr></thead><tbody>` +
      LANES.filter((l) => R[l.k]).map((l) => { const v = R[l.k], hit = v.runs.find((r) => r.ok) || best(v.runs); return `<tr><td>${l.l}</td><td class="num">${v.toTarget || '–'}</td><td class="num">${v.toTarget ? daysTxt(v.toTarget) : '–'}</td><td>${desTxt(hit.des)}</td><td>${fmt(hit.e.clean, 1)} % cleaning, ${fmt(hit.e.solids, 0)} % solids, ${fmt(hit.e.paper, 0)} % paper, ${fmt(hit.e.water, 1)} L${hit.ok ? '' : ' (' + missTxt(hit.e) + ')'}</td></tr>`; }).join('') + '</tbody>';
    $('chLog').innerHTML = `<summary>Every run of the three routes</summary><div class="tablewrap"><table class="compact"><thead><tr><th>Route</th><th>Run</th><th>Why this design</th><th>Fast model, cleaning</th><th>Predicted after correction</th><th>Reference: cleaning, solids, paper, water</th></tr></thead><tbody>` +
      ['classic', 'fast', 'ai'].map((k) => R[k].runs.map((r) => `<tr${r.ok ? ' class="ok"' : ''}><td>${LANES.find((l) => l.k === k).short}</td><td class="num">${r.n}</td><td>${r.why}${r.kept === false ? ', undone' : r.kept ? ', kept' : ''}</td><td class="num">${fmt(r.f.clean, 1)}</td><td class="num">${k === 'ai' && r.pred ? `${fmt(r.pred.m, 1)} ± ${fmt(r.pred.s, 1)}` : '–'}</td><td class="num">${fmt(r.e.clean, 1)}, ${fmt(r.e.solids, 0)}, ${fmt(r.e.paper, 0)}, ${fmt(r.e.water, 1)}${r.ok ? ' ✓' : ''}</td></tr>`).join('')).join('') + '</tbody></table></div>';
    document.dispatchEvent(new Event('flushchallengedone'));
  }
  const best = (runs) => runs.slice().sort((a, b) => a.g - b.g)[0];

  // ---- chart: best cleaning so far among runs that meet the other targets, over virtual days ----
  function draw() {
    const cv = $('cvCh'); A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), Cc = A.readColors();
    ctx.clearRect(0, 0, W, H);
    const narrow = cv.clientWidth < 520, lanesN = LANES.filter((l) => (l.k === 'you' ? S.you.length : S.res[l.k])).length;
    const padL = 46 * d, padR = 14 * d, padT = (narrow && lanesN > 2 ? 44 : 30) * d, padB = 40 * d, w = W - padL - padR, h = H - padT - padB;
    const span = Math.min(C.MAXR, Object.keys(S.res).length || S.you.length ? maxRuns() : 30), yLo = 60, yHi = 95;
    const X = (n) => padL + n / span * w, Y = (v) => padT + (1 - (Math.max(yLo, Math.min(yHi, v)) - yLo) / (yHi - yLo)) * h;
    ctx.fillStyle = A.rgba(Cc.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(Cc.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(Cc.muted); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = yLo; v <= yHi; v += 5) { ctx.fillText(String(v), padL - 6 * d, Y(v)); ctx.strokeStyle = A.rgba(Cc.line, 0.6); ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + w, Y(v)); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const stepD = span <= 15 ? 1 : span <= 30 ? 2 : 5;   // ticks in days
    for (let dd = 0; dd * 3 <= span; dd += stepD) ctx.fillText(String(dd), X(dd * 24 / C.RUN_HOURS), padT + h + 5 * d);
    ctx.fillText(narrow ? 'Virtual days (3 runs a day)' : 'Virtual days of high-fidelity computing (3 runs a day)', padL + w / 2, padT + h + 20 * d);
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Best cleaning so far, %', 0, 0); ctx.restore();
    // target
    ctx.strokeStyle = A.rgba(Cc.bad); ctx.setLineDash([6 * d, 4 * d]); ctx.lineWidth = 1.4 * d; ctx.beginPath(); ctx.moveTo(padL, Y(C.T.clean)); ctx.lineTo(padL + w, Y(C.T.clean)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = A.rgba(Cc.bad); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(narrow ? `target ${C.T.clean} %` : `target ${C.T.clean} %, with ≤ ${C.T.water} L and the solids, paper and seal targets met`, padL + 6 * d, Y(C.T.clean) + 3 * d);
    const lim = S.play * span;
    const lanes = LANES.map((l) => Object.assign({}, l, { runs: l.k === 'you' ? S.you : S.res[l.k] ? S.res[l.k].runs : null })).filter((l) => l.runs && l.runs.length);
    const placed = [];
    lanes.forEach((l) => {
      const col = Cc[l.col], vis = l.k === 'you' ? l.runs : l.runs.filter((r) => r.n <= lim + 1e-9);
      // every run as a dot: filled when it meets the other targets, open when not
      vis.forEach((r) => {
        const other = r.e.water <= C.T.water + 1e-9 && r.e.solids >= C.T.solids && r.e.paper >= C.T.paper && r.e.ok;
        ctx.beginPath(); ctx.arc(X(r.n), Y(r.e.clean), (r.ok ? 4.5 : 2.6) * d, 0, 2 * Math.PI);
        if (other) { ctx.fillStyle = A.rgba(col, 0.85); ctx.fill(); } else { ctx.strokeStyle = A.rgba(col, 0.8); ctx.lineWidth = 1.2 * d; ctx.stroke(); }
      });
      // best-so-far step line among runs meeting the other targets
      let bestV = null; ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2.2 * d; ctx.setLineDash(l.dash.map((v) => v * d)); ctx.beginPath(); let started = false;
      vis.forEach((r) => {
        const other = r.e.water <= C.T.water + 1e-9 && r.e.solids >= C.T.solids && r.e.paper >= C.T.paper && r.e.ok;
        if (other && (bestV == null || r.e.clean > bestV)) {
          if (started) ctx.lineTo(X(r.n), Y(bestV));
          bestV = r.e.clean;
          if (!started) { ctx.moveTo(X(r.n), Y(bestV)); started = true; } else ctx.lineTo(X(r.n), Y(bestV));
        }
      });
      if (started) { const endN = l.k === 'you' ? l.runs.length : Math.min(lim, l.runs[l.runs.length - 1].n); ctx.lineTo(X(endN), Y(bestV)); }
      ctx.stroke(); ctx.setLineDash([]);
      const hit = vis.find((r) => r.ok);
      if (hit && !narrow) {   // label where the route meets the targets, moved up while it would overlap another label
        ctx.font = A.font(10.5, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const txt = `${l.short}: ${hit.n} runs`, tw = ctx.measureText(txt).width, x0 = Math.min(X(hit.n) + 6 * d, padL + w - tw - 4 * d);
        let y0 = Y(hit.e.clean) - 6 * d; const lh = 13 * d;
        while (placed.some((b) => x0 < b.x + b.w && b.x < x0 + tw && y0 > b.y - lh && y0 - lh < b.y)) y0 -= lh;
        placed.push({ x: x0, y: y0, w: tw }); ctx.fillStyle = A.rgba(col); ctx.fillText(txt, x0, y0); ctx.font = A.font(10);
      }
    });
    // legend
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; let lx = padL; let ly = 12 * d;
    lanes.forEach((l) => {
      const lw = (30 + ctx.measureText(l.short).width / d) * d;
      if (lx > padL && lx + lw > padL + w) { lx = padL; ly += 14 * d; }   // wrap on narrow screens
      ctx.strokeStyle = A.rgba(Cc[l.col]); ctx.lineWidth = 2.2 * d; ctx.setLineDash(l.dash.map((v) => v * d)); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18 * d, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = A.rgba(Cc.ink); ctx.fillText(l.short, lx + 22 * d, ly); lx += lw;
    });
    if (!lanes.length) { ctx.fillStyle = A.rgba(Cc.muted); ctx.textAlign = 'center'; ctx.font = A.font(11); ctx.fillText('Run the race to see how many high-fidelity runs each route needs', padL + w / 2, padT + h / 2); }
  }

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
    $('chYouSum').innerHTML = hit ? `<p class="ch-big">You met the targets after <b>${hit.n} runs (${daysTxt(hit.n)})</b>.${S.res.ai ? ` The AI route needed ${S.res.ai.toTarget || 'more than ' + S.res.ai.runs.length}, the classic route ${S.res.classic.toTarget || 'more than ' + S.res.classic.runs.length}.` : ' Run the race above to compare.'}</p>` : '';
    if (!S.res.classic) S.play = 1;
    draw();
  }
  $('chRun').addEventListener('click', race);
  $('chLoad').addEventListener('click', () => { const v = {}; ['ovality', 'jetPhase', 'nJets', 'Rrim', 'Rpool', 'Dwall', 'seal', 'dTrap', 'Kpath', 'Hcr', 'Vfull', 'Anoz', 'hNoz', 'alpha', 'flushMode'].forEach((k) => { v[k] = C.base[k]; }); A.apply(v); $('chYouNote').textContent = 'The start design is loaded into the simulator. Change the six settings, watch the result cards, then send the design to the reference.'; });
  $('chYouRun').addEventListener('click', youRun);
  $('chYouReset').addEventListener('click', () => { S.you = []; $('chYouLog').innerHTML = ''; $('chYouSum').innerHTML = ''; draw(); });
  $('chReveal').addEventListener('click', () => {
    const box = $('chHidden'), open = box.hidden; box.hidden = !open; $('chReveal').setAttribute('aria-expanded', String(open));
    if (open) box.innerHTML = `<p>The reference is the same flush model with other coefficients, plus effects the fast model does not have:</p><ul>` +
      Object.keys(C.HID).map((k) => `<li>${A.SPECK[k] ? A.SPECK[k].l : k}: ${M.COEFFS[k]} in the fast model, ${C.HID[k]} in the reference.</li>`).join('') +
      `<li>Cleaning lost at high valve heights, as fast jets splash and break up (up to about 5 points at the top of the range).</li><li>Cleaning lost away from a best nozzle size and for steep jets.</li><li>Less solids removal for small nozzles at low volume.</li></ul><p class="muted">These stand in for what a CFD run or a rig shows and a fast model misses. When the OpenFOAM reference runs are in (method section 13), they will anchor this reference.</p>`;
  });
  new ResizeObserver(() => requestAnimationFrame(draw)).observe($('cvCh'));
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
  window.FlushChallengeUI = { race, busy: () => S.running, result: () => S.res, you: () => S.you, core: C };
  if (location.hash === '#challenge') setTimeout(() => { $('challenge').scrollIntoView(); race(); }, 600);
})();
