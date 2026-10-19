/* "Demo me": a guided walkthrough that drives the simulator live.
   It saves the visitor's design at the start and offers it back at the end. */
(function () {
  const A = window.FlushApp, M = window.FlushModel;
  if (!A || !M) return;
  const $ = (id) => document.getElementById(id);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pct = (v) => Math.round(v);
  const signed = (v, dp = 0) => { const x = +v.toFixed(dp); return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(dp); };

  const ov = document.createElement('div');
  ov.className = 'tour'; ov.hidden = true;
  ov.innerHTML = `<div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tourTitle" tabindex="-1">
      <div class="tour-top"><span class="tour-step" id="tourStep"></span><button class="tour-x" type="button" id="tourX" aria-label="End the demo">×</button></div>
      <h3 id="tourTitle"></h3>
      <div class="tour-text" id="tourText"></div>
      <div class="tour-nav"><button class="btn" type="button" id="tourBack">Back</button><span class="tour-dots" id="tourDots" aria-hidden="true"></span><button class="btn primary" type="button" id="tourNext">Next</button></div>
    </div>`;
  document.body.appendChild(ov);
  const spot = ov.querySelector('.tour-spot'), card = ov.querySelector('.tour-card');

  let idx = 0, active = false, startSnap = null, busy = false, target = null, raf = 0, mem = {};

  async function runOptimiser() {
    document.querySelector('[data-aitab="aiOpt"]').click();
    // default variables, targets goal
    document.querySelectorAll('#optVarsJets input, #optVarsBowl input').forEach((c) => { c.checked = ['ov_Anoz', 'ov_alpha', 'ov_jetPhase', 'ov_hNoz', 'ov_Hcr', 'ov_VOL'].includes(c.id); });
    $('optFlush').value = 'full'; $('optEffort').value = 'quick';
    $('goalTargets').click();
    const k = A.kpis(); mem.tClean = Math.min(95, Math.round(k.clean) + 3);
    $('tWater').value = '4.0'; $('tClean').value = String(mem.tClean); $('tSolids').value = '95'; $('tPaper').value = '80'; $('tPick').value = 'score';
    $('tPaper').dispatchEvent(new Event('input'));
    $('optRun').click();
    await wait(400);
    const t0 = Date.now();
    while ($('optRun').disabled && Date.now() - t0 < 60000) await wait(250);
  }

  const STEPS = [
    {
      t: 'Welcome', el: () => document.querySelector('.top .title'),
      x: async () => { A.stop(); A.apply(Object.assign(M.defaults('washdown'), { flushMode: 'full' })); },
      h: () => `<p>This demo takes about a minute. It plays a flush, changes the bowl, and lets the AI lab find a better design, all live in the browser.</p><p>We start from the EU washdown preset. Your own design is saved, and you can bring it back at the end.</p>`
    },
    {
      t: 'Watch the flush', el: () => $('sim'), block: 'start',
      x: async () => { A.play(0, 0.5); },
      h: () => `<p>Two rim jets enter the bowl along the wall. The <b>white dashed lines</b> are the jet films sliding round and down the bowl.</p><p>Wall areas turn <b>green</b> once the film's shear has been strong enough for long enough to clean them. In the middle, the pool starts to swirl.</p><p class="tour-hint">${A.isPhone() ? 'Further down' : 'On the right'}, the section shows the cistern emptying and the water level in the bowl.</p>`
    },
    {
      t: 'Read the results', el: () => $('results'), block: 'center',
      x: async () => { await wait(reduce() ? 0 : 900); A.setTime(10); },
      h: () => { const k = A.kpis(); return `<p>For this bowl the model gives:</p><ul><li><b>${pct(k.clean)} %</b> of the wall cleaned</li><li><b>${pct(k.solids)} %</b> of the solid test load and <b>${pct(k.paper)} %</b> of the paper removed</li><li><b>${k.water.toFixed(1)} L</b> of water</li></ul><p>These cards update on every change, with a green or red chip showing how much it helped or hurt.</p>`; }
    },
    {
      t: 'Make the bowl oval', el: () => $('results'), block: 'center',
      x: async () => { mem.before = A.kpis(); A.apply({ ovality: 1.35, jetPhase: 0 }); },
      h: () => { const k = A.kpis(), b = mem.before || k; return `<p>Real bowls are oval. We set the ovality to <b>1.35</b> and kept the jets at the ends of the long axis.</p><p>Cleaning drops to <b>${pct(k.clean)} %</b> (${signed(k.clean - b.clean)} points). The film is pushed hard against the tight ends and misses parts of the flat sides.</p>`; }
    },
    {
      t: 'Move the jets', el: () => $('results'), block: 'center',
      x: async () => { mem.before2 = A.kpis(); A.apply({ jetPhase: 90 }); },
      h: () => { const k = A.kpis(), b = mem.before2 || k; return `<p>Now the jets sit on the long sides instead (jet position 90°).</p><p>Cleaning recovers to <b>${pct(k.clean)} %</b> (${signed(k.clean - b.clean)} points). In an oval bowl, where the jets sit matters as much as how strong they are.</p>`; }
    },
    {
      t: 'Where it cleans', el: () => $('wallmap'), block: 'center',
      h: () => `<p>The wall map unrolls the bowl: left to right is the way round the rim, top to bottom is the depth below the rim.</p><p><b>Green</b> is cleaned, <b>grey-blue</b> got wet but not enough shear, <b>beige</b> stayed dry. Gaps like these are what a designer would fix next.</p>`
    },
    {
      t: 'Let the AI find a better design', el: () => $('ai-lab'), block: 'start', slow: true,
      x: runOptimiser,
      h: () => {
        const st = $('optStatus').textContent, best = $('optBest').querySelectorAll('p')[1];
        return `<p>We asked the AI lab for a design that uses <b>at most 4.0 L</b>, less than now, and still cleans at least <b>${mem.tClean} %</b>, with 95 % solids and 80 % paper removed. It may change the nozzles, jet angle and position, valve height and flush volume, but not the bowl.</p><p class="tour-hint">${st}</p>${best ? `<p>${best.innerHTML}</p>` : '<p>No design met every target this time. The closest one is shown in the panel.</p>'}`;
      }
    },
    {
      t: 'Load the winner', el: () => $('results'), block: 'center',
      x: async () => { mem.before3 = A.kpis(); mem.hadBest = !!$('optLoadBest') && /meeting all targets/.test($('optBest').textContent); const b = $('optLoadBest'); if (b) b.click(); await wait(50); },
      h: () => { const k = A.kpis(), b = mem.before3 || k; return `<p>The ${mem.hadBest ? 'suggested' : 'closest'} design is now loaded in the simulator:</p><ul><li>Cleaning <b>${pct(k.clean)} %</b> (${signed(k.clean - b.clean)})</li><li>Solids <b>${pct(k.solids)} %</b> (${signed(k.solids - b.solids)})</li><li>Water <b>${k.water.toFixed(1)} L</b> (${signed(k.water - b.water, 1)} L)</li></ul><p class="tour-hint">The model is not calibrated yet, so a suggestion like this is a candidate for a CFD or rig check, not a final answer.</p>`; }
    },
    {
      t: 'Your turn', el: () => document.querySelector('.top .actions'), block: 'center', last: true,
      h: () => `<p><b>Undo</b> steps back one change at a time, <b>Reset</b> returns to the preset, and <b>Pin as reference</b> above the results compares every change with one fixed design.</p><p>Each slider has an <b>i</b> button that explains it.</p><p>Do you want your own design back, or keep this one?</p>`
    }
  ];

  function place() {
    if (!active) return;
    const el = target, vw = window.innerWidth, vh = window.innerHeight, phone = vw <= 640;
    if (el) {
      const r = el.getBoundingClientRect(), pad = 8;
      Object.assign(spot.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
      if (phone) { card.classList.add('dock'); card.style.left = card.style.top = ''; }
      else {
        card.classList.remove('dock');
        const cw = card.offsetWidth, ch = card.offsetHeight, m = 14;
        let left = Math.min(Math.max(m, r.left), vw - cw - m), top;
        if (r.bottom + ch + 2 * m < vh) top = r.bottom + m + pad;
        else if (r.top - ch - 2 * m > 0) top = r.top - ch - m - pad;
        else { top = vh - ch - m; left = vw - cw - m; }
        card.style.left = `${left}px`; card.style.top = `${Math.max(m, top)}px`;
      }
    } else spot.style.display = 'none';
    raf = requestAnimationFrame(place);
  }

  async function show(i, fromBack) {
    const s = STEPS[i]; idx = i; busy = true;
    $('tourStep').textContent = `Step ${i + 1} of ${STEPS.length}`;
    $('tourTitle').textContent = s.t;
    $('tourDots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('tourBack').disabled = i === 0;
    const next = $('tourNext');
    next.disabled = true;
    target = s.el ? s.el() : null;
    if (target) target.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: s.block || 'center' });
    $('tourText').innerHTML = s.slow ? '<p class="tour-hint">Searching about 540 designs, this takes a few seconds…</p>' : '<p class="tour-hint">…</p>';
    if (s.x && !(fromBack && s.slow)) { try { await s.x(); } catch (e) { } }
    await wait(reduce() ? 0 : 350);
    if (idx !== i || !active) return;
    $('tourText').innerHTML = s.h();
    if (s.last) {
      $('tourText').insertAdjacentHTML('beforeend', `<div class="tour-end"><button class="btn" type="button" id="tourRestore">Bring my design back</button><button class="btn primary" type="button" id="tourKeep">Keep this design</button></div>`);
      $('tourRestore').addEventListener('click', () => end(true));
      $('tourKeep').addEventListener('click', () => end(false));
      next.textContent = 'Finish';
    } else next.textContent = i === 0 ? 'Start' : 'Next';
    next.disabled = false; busy = false;
    card.focus({ preventScroll: true });
  }

  function start() {
    if (active) return;
    startSnap = A.snapshot(); mem = {}; active = true; ov.hidden = false; document.body.classList.add('touring');
    if (A.isPhone()) A.drawer(false);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(place);
    show(0);
  }
  function end(restore) {
    if (!active) return;
    active = false; ov.hidden = true; document.body.classList.remove('touring'); cancelAnimationFrame(raf);
    A.stop();
    if (restore && startSnap) A.apply(startSnap);
    const b = $('demoBtn'); if (b) b.focus({ preventScroll: true });
  }
  $('tourNext').addEventListener('click', () => { if (busy) return; if (idx >= STEPS.length - 1) end(false); else show(idx + 1); });
  $('tourBack').addEventListener('click', () => { if (busy || idx === 0) return; show(idx - 1, true); });
  $('tourX').addEventListener('click', () => end(true));
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); end(true); }
    else if (e.key === 'ArrowRight' && !busy) { e.preventDefault(); $('tourNext').click(); }
    else if (e.key === 'ArrowLeft' && !busy) { e.preventDefault(); $('tourBack').click(); }
  });
  ['demoBtn', 'demoBtn2'].forEach((id) => { const b = $(id); if (b) b.addEventListener('click', start); });
  // deep link: …/#demo starts the walkthrough
  if (location.hash === '#demo') setTimeout(start, 600);
  window.FlushTour = { start, end };
})();
