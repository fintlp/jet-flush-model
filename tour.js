/* The guided story, in three parts that drive the page live: 1 the fast model ("Demo me": simulator and AI lab),
   2 the check against CFD, 3 AI in the engineering loop (the engineering challenge). Each part can be started on its
   own and ends by offering the next. Every part saves the visitor's design at the start and offers it back. */
(function () {
  const A = window.FlushApp, M = window.FlushModel;
  if (!A || !M) return;
  const $ = (id) => document.getElementById(id);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pct = (v) => Math.round(v);
  const signed = (v, dp = 0) => { const x = +v.toFixed(dp); return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(dp); };
  const noiseSrc = () => {
    const n = A.noise(); if (!n) return 'comes from the flush';
    const t = ['comes from the jet films entering the pool', 'comes from water falling into the outlet', 'comes from an air core in the trap', 'comes from the siphon break'];
    return t[n.share.indexOf(Math.max(...n.share))];
  };

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

  let idx = 0, active = false, session = 0, startSnap = null, startPin = null, busy = false, target = null, raf = 0, mem = {};

  async function runOptimiser() {
    document.querySelector('[data-aitab="aiOpt"]').click();
    // default variables, targets goal
    document.querySelectorAll('#optVarsJets input, #optVarsBowl input').forEach((c) => { c.checked = ['ov_Anoz', 'ov_alpha', 'ov_jetPhase', 'ov_hNoz', 'ov_Hcr', 'ov_VOL'].includes(c.id); });
    $('optFlush').value = 'full'; $('optEffort').value = 'quick'; if ($('optRobust')) $('optRobust').checked = false;
    $('goalTargets').click();
    const k = A.kpis(); mem.tClean = Math.min(95, Math.round(k.clean) + 2);
    $('tWater').value = '4.0'; $('tClean').value = String(mem.tClean); $('tSolids').value = '95'; $('tPaper').value = '80'; $('tPick').value = 'score'; if ($('tNoise')) $('tNoise').value = '0';
    $('tPaper').dispatchEvent(new Event('input'));
    // start the demo's own search, cancelling any other, and wait for it and its full-resolution check
    const ses = session, res = await window.FlushAI.run();
    if (ses !== session || !active) return false;   // the demo was closed or restarted meanwhile: change nothing
    mem.sid = res.ok ? res.sid : null;
    return true;
  }

  const DEMO = [
    {
      t: 'Welcome', el: () => document.querySelector('.top .title'),
      x: async () => { A.stop(); A.apply(Object.assign(M.defaults('washdown'), { flushMode: 'full' })); },
      h: () => `<p>This first part takes about a minute. It plays a flush, changes the bowl, and lets the AI lab find a better design, all live in the browser. Part 2 checks the fast model against a full CFD simulation; part 3 shows what AI does with it in an engineering project.</p><p>We start from the EU washdown preset. Your own design is saved, and you can bring it back at the end.</p>`
    },
    {
      t: 'Watch the flush', el: () => $('sim'), block: 'start',
      x: async () => { A.play(0, 0.5); },
      h: () => `<p>Two rim jets enter the bowl along the wall. The <b>white dashed lines</b> are the jet films sliding round and down the bowl.</p><p>Wall areas turn <b>green</b> once the film's shear has been strong enough for long enough to clean them. In the middle, the pool starts to swirl.</p><p class="tour-hint">${A.isPhone() ? 'Further down' : 'On the right'}, the section shows the cistern emptying and the water level in the bowl.</p>`
    },
    {
      t: 'Read the results', el: () => $('results'), block: 'center',
      x: async () => { await wait(reduce() ? 0 : 900); A.setTime(10); },
      h: () => { const k = A.kpis(); return `<p>For this bowl the model gives:</p><ul><li><b>${pct(k.clean)} %</b> of the wall cleaned</li><li><b>${pct(k.solids)} %</b> of the solid test load and <b>${pct(k.paper)} %</b> of the paper removed</li><li><b>${k.water.toFixed(1)} L</b> of water</li><li><b>${signed(k.noise - A.noiseRef().peak, 1)} dB</b> noise against the preset. It reads zero because this is the preset itself; most of its noise ${noiseSrc()}.</li></ul><p>These cards update on every change, with a green or red chip showing how much it helped or hurt. Noise is a relative indicator, not a sound level.</p>`; }
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
        if (!mem.sid) return '<p>The search did not finish, or another search replaced it. Go back one step and try again.</p>';
        return `<p>We asked the AI lab for a design that uses <b>at most 4.0 L</b>, less than now, and still cleans at least <b>${mem.tClean} %</b>, with 95 % solids and 80 % paper removed, and is <b>no louder</b> than now. It may change the nozzles, jet angle and position, valve height and flush volume, but not the bowl.</p><p class="tour-hint">${st}</p>${best ? `<p>${best.innerHTML}</p>` : '<p>No design met every target this time. The closest one is shown in the panel.</p>'}`;
      }
    },
    {
      t: 'Load the winner', el: () => $('results'), block: 'center',
      x: async () => {
        const ses = session;
        mem.before3 = A.kpis(); mem.rerun = false; mem.why = '';
        mem.loaded = window.FlushAI.loadResult(mem.sid);
        if (!mem.loaded) {
          // settings changed after the search, or another search replaced it: search again with the current settings
          mem.why = $('optHover').textContent; mem.rerun = true;
          if (!(await runOptimiser())) return;
          if (ses !== session || !active) return;   // closed during the search: never load into the restored design
          mem.before3 = A.kpis();
          mem.loaded = window.FlushAI.loadResult(mem.sid);
        }
        await wait(50);
      },
      h: () => { const k = A.kpis(), b = mem.before3 || k; if (!mem.loaded) return `<p>No design could be loaded, even after searching again with the current settings.</p><p class="tour-hint">${mem.why || 'The search did not finish.'}</p>`; return `${mem.rerun ? '<p class="tour-hint">Settings changed after the search, so the demo searched again with the current settings.</p>' : ''}<p>The ${mem.loaded === 'best' ? 'suggested' : 'closest'} design is now loaded in the simulator:</p><ul><li>Cleaning <b>${pct(k.clean)} %</b> (${signed(k.clean - b.clean)})</li><li>Solids <b>${pct(k.solids)} %</b> (${signed(k.solids - b.solids)})</li><li>Water <b>${k.water.toFixed(1)} L</b> (${signed(k.water - b.water, 1)} L)</li><li>Noise <b>${signed(k.noise - b.noise, 1)} dB</b> against the design before${(() => { const g = A.nRange(k.noiseV, b.noiseV); return g ? `, range ${signed(g.lo, 1)} to ${signed(g.hi, 1)} dB` : ''; })()}</li></ul><p class="tour-hint">The model is not calibrated yet, so a suggestion like this is a candidate for a CFD or rig check, not a final answer.</p>`; }
    },
    {
      t: 'Your turn', el: () => document.querySelector('.top .actions'), block: 'center', last: true,
      h: () => `<p><b>Undo</b> steps back one change at a time, <b>Reset</b> returns to the preset, and <b>Pin as reference</b> above the results compares every change with one fixed design.</p><p>Each slider has an <b>i</b> button that explains it.</p><p>Next: <b>can we trust a model that answers in milliseconds?</b> Part 2 puts it next to a full CFD simulation. Or end here: <b>Finish</b> brings your own design back.</p>`
    }
  ];

  // ---- the engineering challenge tour ----
  const U = () => window.FlushChallengeUI;
  const chDays = (n) => { const d = n / 3; return d < 1 ? `${Math.round(n * 8)} hours` : `${+d.toFixed(1)} ${+d.toFixed(1) === 1 ? 'day' : 'days'}`; };
  const firstLost = () => { const R = U().races(); const i = R.findIndex((r) => !r.routes.fast.toTarget && r.routes.ai.toTarget); return i < 0 ? 0 : i; };
  const CHALLENGE = [
    {
      t: 'An engineering problem', el: () => $('chTask'), block: 'center',
      x: async () => { U().reveal(false); U().select(0); },
      h: () => `<p>A bowl that works in the lab, made oval for a new product, now misses its targets: <b>74.5 %</b> of the wall cleaned with 4.5 L. It should reach <b>87 %</b> with at most <b>4.0 L</b>, without losing waste removal.</p><p>Every design candidate is checked with a high-fidelity simulation, and every such run costs <b>8 hours</b> of computing. So the question is: <b>how many runs until the design is done?</b></p>`
    },
    {
      t: 'Three ways to work', el: () => document.querySelector('.ch-routes'), block: 'center',
      h: () => `<p><b>Classic:</b> an experienced engineer changes one setting per run and keeps what helps.</p><p><b>Fast model alone:</b> our flush model screens hundreds of designs in seconds, and the best ones are sent to the expensive simulation.</p><p><b>AI route:</b> the same fast model, plus a correction that is learned from every expensive run, so the next run goes where success is most likely. The fast model is right on trends but off in places, as the CFD check showed; the correction learns where.</p>`
    },
    {
      t: 'Eight projects, one clock', el: () => $('cvChAll'), block: 'center',
      during: '<p>The clock runs ten virtual days. Each step of a curve is a project that met all targets.</p><p class="tour-hint">Watch the blue line.</p>',
      x: async () => { await U().play(); },
      h: () => { const S = U().stats(), n = U().races().length, aiDone = S.ai.max, clBy = S.classic.v.filter((v) => v != null && v <= aiDone).length;
        return `<p>The <b>AI route</b> finished all ${n} projects within <b>${chDays(aiDone)}</b>. By then the classic route had finished ${clBy}; it needed <b>${chDays(S.classic.max)}</b> for all ${n}.</p><p>The <b>fast model alone</b> finished ${n - S.fast.miss} quickly, then got stuck: ${S.fast.miss} projects never met the targets.</p>`; }
    },
    {
      t: 'Not luck: the numbers', el: () => $('chRep'), block: 'center',
      h: () => { const S = U().stats(); const fmtm = (v) => (v % 1 ? v.toFixed(1) : String(v));
        return `<p>Typical runs to target: <b>AI route ${fmtm(S.ai.med)}</b>, classic <b>${fmtm(S.classic.med)}</b>.</p><p>For all eight projects together, the AI route used <b>${S.ai.sum}</b> expensive runs, the classic route <b>${S.classic.sum}</b>. That is <b>${S.classic.sum - S.ai.sum} runs</b>, or about <b>${Math.round((S.classic.sum - S.ai.sum) / 3)} days</b> of computing, saved.</p>`; }
    },
    {
      t: 'When the fast model gets lost', el: () => $('cvCh'), block: 'center',
      x: async () => { U().select(firstLost()); },
      h: () => { const i = firstLost(), r = U().races()[i], fr = r.routes.fast.runs.slice(1), hi = fr.filter((q) => q.des.Hcr >= 300).length, over = fr.reduce((a, q) => a + q.f.clean - q.e.clean, 0) / Math.max(1, fr.length);
        return `<p>Race #${i + 1}. The fast model likes high valve heights: ${hi} of its ${fr.length} expensive runs had a valve height of 300 mm or more. In the reference, fast jets splash there and lose cleaning, so the fast model overestimated these designs by about <b>${Math.round(over)} points</b>. Alone, it never found out: <b>no success within 60 runs</b>.</p><p>The AI route ran into the same difference, learned it, and reached the targets after <b>${r.routes.ai.toTarget} runs</b>. The classic route needed ${r.routes.classic.toTarget}.</p>`; }
    },
    {
      t: 'How the AI learns', el: () => $('cvChPred'), block: 'center',
      h: () => `<p>Before each run, the AI route predicts the cleaning with an uncertainty: the <b>blue bars</b>. The <b>dots</b> are what the expensive run then gave.</p><p>Early on, the bars are wide and the dots miss. With every run the correction learns where the fast model is off; the predictions close in, and the run that meets the targets is no surprise.</p>`
    },
    {
      t: 'Computed, not animated', el: () => $('chVerify'), block: 'center',
      x: async () => { U().select(0); U().verify(0); },
      h: () => `<p>The races play from stored results so the demo starts at once. But they are not a film: the same code runs in your browser.</p><p>Race #1 is being <b>recomputed live</b> right now, without blocking the page. In about half a minute the line here says whether the result is identical.</p>`
    },
    {
      t: 'Your turn', el: () => document.querySelector('.ch-you'), block: 'center',
      x: async () => { U().youReset(); U().loadStart(); A.apply({ jetPhase: 90, Vfull: 4.0 }); mem.you = U().youRun(); },
      h: () => { const r = mem.you; return `<p>We loaded the start design into the simulator and made the move from the first demo: jets to the long sides, flush cut to 4.0 L. One expensive run says <b>${r.e.clean.toFixed(1)} %</b> cleaning: ${r.ok ? 'that already meets the targets.' : `<b>${(87 - r.e.clean).toFixed(1)} points short</b>.`}</p><p>Now it is your turn: change the settings in the simulator, watch the result cards, and send a design to the expensive run. <b>Can you beat the AI route's ${U().races()[0].routes.ai.toTarget} runs?</b></p>`; }
    },
    {
      t: 'What this means', el: () => $('chHead'), block: 'center', last: true,
      h: () => `<p>A physics model you can trust for the trends, a few expensive runs, and a correction learned from each of them: that is how AI shortens engineering loops. Not by replacing simulation, but by <b>deciding where the next expensive run is worth it</b>.</p>${(() => { const S = U().stats(); if (!S) return ''; const f = (v) => (v % 1 ? v.toFixed(1) : String(v)); return `<p>At one working day per iteration, as Geberit reported for its bowl development, the median project takes <b>${f(S.ai.med)} days instead of ${f(S.classic.med)}</b>; over the eight projects, <b>${S.classic.sum - S.ai.sum} working days</b> of iterations are saved. <a href="why.html#loop" target="_blank" rel="noopener">The timeline</a>.</p>`; })()}<p class="tour-hint">The reference here is synthetic and the task has five settings, so the numbers illustrate the principle. With real CFD at hours per run and more settings to change, every run saved counts more.</p><p>Do you want your own design back, or keep this one? <b>Finish</b> brings your own design back.</p>`
    }
  ];
  // ---- part 2: the check against CFD ----
  const F = () => window.FlushCFD;
  const cfdNum = () => { const S = F() && F().data(); if (!S || !S.cfd) return null; const t = S.cfd.case.end; return { S, t, wc: (S.cfd.case.wallClock_s || S.run.wallClock_s), cores: (S.cfd.case.cores || S.run.cores), ms: S.msModel }; };
  const waitCfd = async () => { for (let k = 0; k < 100 && !(F() && F().ready()); k++) await wait(100); };
  const CFD = [
    {
      t: 'Can we trust the fast model?', el: () => $('cfdHead'), block: 'center',
      x: async () => { await waitCfd(); F().setMode('wet'); },
      h: () => { const n = cfdNum(); if (!n) return '<p>The CFD results could not be loaded here, so this part cannot be shown.</p>';
        return `<p>The fast model simplifies to answer in milliseconds. To see what that costs, we simulated the same bowl with the same jets in <b>OpenFOAM</b>, a full CFD code that resolves water and air in about 160,000 cells.</p><p>For ${n.t.toFixed(1)} s of flush, the CFD needed ${n.wc ? `<b>about ${Math.round(n.wc / 60)} minutes on ${n.cores} processor cores</b>` : 'hours'}. The fast model: <b>${Math.round(n.ms)} ms</b>.</p>`; }
    },
    {
      t: 'When the water gets there', el: () => document.querySelector('.cfd-maps'), block: 'center',
      during: '<p>Both maps unroll the bowl wall: round the rim from left to right, rim at the top, waterline at the bottom. Watch the films spread from the two jets.</p><p class="tour-hint">Left CFD, right fast model.</p>',
      x: async () => { await waitCfd(); await F().play(); },
      h: () => { const n = cfdNum(); if (!n) return '<p>No CFD data.</p>'; const S = n.S, t1 = Math.min(0.5, n.t);
        const c1 = S.cWet(t1), m1 = S.mWet(t1), cE = S.cWet(n.t), mE = S.mWet(n.t);
        return `<p>Left the CFD, right the fast model, on the same colour scale. Dark means wetted early.</p><p>In the end both wet nearly the whole wall: <b>${Math.round(cE)} %</b> in the CFD, <b>${Math.round(mE)} %</b> in the fast model by ${n.t.toFixed(1)} s.${Math.abs(c1 - m1) >= 3 ? ` The ${c1 > m1 ? 'CFD' : 'fast model'} gets there sooner: by ${t1.toFixed(1)} s ${Math.round(c1)} % against ${Math.round(m1)} %.` : ''} The CFD wets most of the wall within half a second; the fast model reaches the lower wall later.</p>${n.wc && n.ms ? `<p>The fast model gets this picture about <b>${Math.round(n.wc * 1000 / n.ms / 1000).toLocaleString('en')} thousand times faster</b>.</p>` : ''}`; }
    },
    {
      t: 'What gets cleaned', el: () => document.querySelector('.cfd-maps'), block: 'center',
      x: async () => { await waitCfd(); F().setMode('clean'); },
      h: () => { const n = cfdNum(); if (!n) return '<p>No CFD data.</p>'; const S = n.S;
        const dC = S.mClean - S.cClean;
        return `<p>Green: where the water's shear was strong enough for long enough to clean, by ${n.t.toFixed(1)} s. CFD <b>${Math.round(S.cClean)} %</b>, fast model <b>${Math.round(S.mClean)} %</b>${Math.abs(dC) >= 2 ? `, the fast model about <b>${Math.round(Math.abs(dC))} points ${dC > 0 ? 'more optimistic' : 'more cautious'}</b>` : ''}.</p><p>The patterns differ more than the totals: the CFD leaves streaks behind each jet, and it also counts the swirling pool washing the wall near the waterline, which the fast model does not. After 1.3 s the CFD bowl also holds more water than the fast model's, which helps there.</p><p class="tour-hint">This is a second simulation, not a measurement of a real bowl, and thin films are smoothed at this mesh size. Agreement shows consistency, not truth.</p>`; }
    },
    {
      t: 'Where they differ', el: () => $('cfdDiff'), block: 'center',
      h: () => { const n = cfdNum(); if (!n) return '<p>No CFD data.</p>'; const S = n.S, first = S.arr && S.arr.arrivalTimes ? S.arr.arrivalTimes.first_1mLs : null;
        return `<p>So: close on the totals, different in the details.${first != null ? ` The first water reaches the pool after <b>${first.toFixed(2)} s</b> in the CFD, but only after <b>${S.mod.firstArr.toFixed(2)} s</b> in the fast model.` : ''} The CFD wets the lower wall sooner, its pool spins faster and washes the wall near the waterline.</p><p>That is what a fast model is: <b>right on the trends, off in places</b>. Two ways to correct that: calibrate the model from measurements of a real flush, next, or let a few expensive runs correct it during the design, in part 3.</p>`; }
    },
    {
      t: 'From a phone video to the model', el: () => $('aiPinn'), block: 'start', last: true, keepsDesign: true,
      during: '<p>A physics-informed neural network reads the pool level of one flush, as from a phone video of a ruler in the bowl, and learns the level curve and two model coefficients at the same time.</p><p class="tour-hint">Training live, one to three seconds.</p>',
      x: async () => { const P = window.FlushPinnUI; if (!P) return; P.show(); $('aiPinn').scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' }); $('pnData').value = 'dense'; await wait(400); await P.run(); },
      h: () => { const P = window.FlushPinnUI, S = P && P.result(); if (!S || !S.pinn) return '<p>The network could not be trained here.</p>';
        return `<p>The "measured" flush had a weir coefficient of <b>${S.D.Cw.toFixed(2)}</b>, hidden from the network; the model assumes ${S.D.CwModel.toFixed(1)}. From ${S.D.obs.length} noisy readings the network found <b>${S.pinn.Cw.toFixed(2)}</b>, and estimated the unmeasured water on the wall.</p><p class="tour-hint">For an equation this small, least squares is quicker (${S.ls.Cw.toFixed(2)}). PINNs pay off for expensive or partly unknown equations; for a full 3D flush, CFD plus surrogates is the realistic route.</p>`; }
    }
  ];
  const PARTS = [
    { k: 'demo', name: 'The fast model', steps: DEMO, btn: 'demoBtn', ok: () => true },
    { k: 'cfd', name: 'Checked against CFD', steps: CFD, btn: 'cfdTour', ok: () => !!window.FlushCFD },
    { k: 'challenge', name: 'AI in the engineering loop', steps: CHALLENGE, btn: 'chTour', ok: () => !!window.FlushChallengeUI }
  ];
  let PART = 0, STEPS = DEMO, KIND = 'demo';

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

  // the search step shows the AI lab's progress bar and its text in the card
  document.addEventListener('flushaiprogress', (e) => {
    const f = $('tourProgFill'), t = $('tourProgTxt'), d = e.detail; if (!f || !t || !d.phase) return;
    const pc = Math.round(100 * Math.max(0, Math.min(1, d.frac)));
    f.style.width = pc + '%'; f.parentNode.setAttribute('aria-valuenow', String(pc)); t.textContent = d.label;
  });
  async function show(i, fromBack) {
    const s = STEPS[i], ses = session; idx = i; busy = true;
    $('tourStep').textContent = `Part ${PART + 1} of ${PARTS.length} · ${PARTS[PART].name} · Step ${i + 1} of ${STEPS.length}`;
    $('tourTitle').textContent = s.t;
    $('tourDots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('tourBack').disabled = i === 0;
    const next = $('tourNext');
    next.disabled = true; next.textContent = s.last ? 'Finish' : (i === 0 ? 'Start' : 'Next');
    target = s.el ? s.el() : null;
    // on phones the card docks at the bottom, so the highlighted part goes to the top of the screen
    if (target) target.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: A.isPhone() && KIND !== 'demo' ? 'start' : (s.block || 'center') });
    $('tourText').innerHTML = s.slow ? '<p class="tour-hint" id="tourProgTxt">The AI lab searches about 540 designs and then checks the best ones at full resolution. This takes about 10 to 15 seconds.</p><div class="prog"><div class="prog-bar" role="progressbar" aria-label="Progress of the search" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="prog-fill" id="tourProgFill"></span></div></div>' : (s.during || '<p class="tour-hint">…</p>');
    if (s.x && !(fromBack && s.slow)) { try { await s.x(); } catch (e) { } }
    // the step may have revealed or moved its target (a tab shown, a panel filled): bring it into view again
    if (target && active) { const r = target.getBoundingClientRect(); if (r.height === 0 || r.top > window.innerHeight * 0.6 || r.bottom < 60) target.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: A.isPhone() && KIND !== 'demo' ? 'start' : (s.block || 'center') }); }
    await wait(reduce() ? 0 : 350);
    // let a smooth scroll finish, so the card has arrived before Next can be pressed
    for (let k = 0, last = -1, same = 0; k < 40 && same < 2; k++) { const y = window.scrollY; same = y === last ? same + 1 : 0; last = y; await wait(50); }
    if (ses !== session || idx !== i || !active) return;   // closed, or closed and reopened, meanwhile
    $('tourText').innerHTML = s.h();
    if (s.last) {
      const nxt = PARTS[PART + 1] && PARTS[PART + 1].ok() ? PARTS[PART + 1] : null;
      $('tourText').insertAdjacentHTML('beforeend', `<div class="tour-end">${s.keepsDesign ? '' : '<button class="btn" type="button" id="tourRestore">Bring my design back</button><button class="btn" type="button" id="tourKeep">Keep this design</button>'}${nxt ? `<button class="btn primary" type="button" id="tourNextTour">Continue with part ${PART + 2}: ${nxt.name}</button>` : ''}</div>`);
      if ($('tourRestore')) $('tourRestore').addEventListener('click', () => end(true));
      if ($('tourKeep')) $('tourKeep').addEventListener('click', () => { end(false); A.save(); });
      if ($('tourNextTour')) $('tourNextTour').addEventListener('click', () => { const k = nxt.k; end(true); start(k); });
      next.textContent = 'Finish';
    } else next.textContent = i === 0 ? 'Start' : 'Next';
    next.disabled = false; busy = false;
    card.focus({ preventScroll: true });
  }

  function start(kind) {
    if (active) return;
    PART = Math.max(0, PARTS.findIndex((q) => q.k === kind && q.ok())); KIND = PARTS[PART].k; STEPS = PARTS[PART].steps;
    session++; startSnap = A.histState(); mem = {}; active = true; ov.hidden = false; document.body.classList.add('touring');
    startPin = A.pin(); if (startPin) A.setPin(null);   // the demo compares with the preset; a pinned reference comes back at the end
    if (A.isPhone()) A.drawer(false);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(place);
    show(0);
  }
  function end(restore) {
    if (!active) return;
    session++; active = false; ov.hidden = true; document.body.classList.remove('touring'); cancelAnimationFrame(raf);
    A.stop();
    if (startSnap) A.restoreState(startSnap, !restore);   // undo history and deltas as before the walkthrough
    startSnap = null;
    if (startPin) { A.setPin(startPin); startPin = null; }
    const b = $(PARTS[PART].btn); if (b) b.focus({ preventScroll: true });
  }
  $('tourNext').addEventListener('click', () => { if (busy) return; if (idx >= STEPS.length - 1) end(true); else show(idx + 1); });
  $('tourBack').addEventListener('click', () => { if (busy || idx === 0) return; show(idx - 1, true); });
  $('tourX').addEventListener('click', () => end(true));
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); end(true); }
    else if (e.key === 'ArrowRight' && !busy) { e.preventDefault(); $('tourNext').click(); }
    else if (e.key === 'ArrowLeft' && !busy) { e.preventDefault(); $('tourBack').click(); }
  });
  ['demoBtn', 'demoBtn2'].forEach((id) => { const b = $(id); if (b) b.addEventListener('click', () => start('demo')); });
  if ($('chTour')) $('chTour').addEventListener('click', () => start('challenge'));
  if ($('cfdTour')) $('cfdTour').addEventListener('click', () => start('cfd'));
  // show the small menu button only once the big "Start here" button has scrolled out of view
  (function () {
    const strip = document.querySelector('.starthere'), small = $('demoBtn2');
    if (!strip || !small || !('IntersectionObserver' in window)) return;
    small.classList.add('away');
    new IntersectionObserver((es) => { es.forEach((e) => { const vis = e.isIntersecting; small.classList.toggle('away', vis); small.tabIndex = vis ? -1 : 0; small.setAttribute('aria-hidden', String(vis)); }); }, { threshold: 0 }).observe(strip);
  })();
  // deep link: …/#demo starts the walkthrough
  if (location.hash === '#demo') setTimeout(() => start('demo'), 600);
  if (location.hash === '#challenge-tour') setTimeout(() => start('challenge'), 600);
  if (location.hash === '#cfd-tour') setTimeout(() => start('cfd'), 600);
  window.FlushTour = { start, end, kind: () => KIND, step: () => idx, active: () => active };
})();
