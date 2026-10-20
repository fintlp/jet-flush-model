(function () {
  const M = window.FlushModel;
  const $ = (id) => document.getElementById(id);
  const TAU2 = Math.PI * 2, SIM_T = 12;
  let TVIEW = 10;   // playback length, follows the flush: at least 10 s, up to 60 s

  const SPEC = [
    { g: 'flush', k: 'Vfull', l: 'Full flush volume', u: 'L', min: 3, max: 7, st: 0.1, d: 1 },
    { g: 'flush', k: 'Vpart', l: 'Partial flush volume', u: 'L', min: 2, max: 4.5, st: 0.1, d: 1 },
    { g: 'flush', k: 'Hcr', l: 'Valve height above jets', u: 'mm', min: 50, max: 600, st: 10, d: 0 },
    { g: 'flush', k: 'Kpath', l: 'Supply path loss K', u: '', min: 0.2, max: 3, st: 0.1, d: 1 },
    { g: 'jets', k: 'nJets', l: 'Number of jets', u: '', min: 1, max: 3, st: 1, d: 0 },
    { g: 'jets', k: 'Anoz', l: 'Nozzle area per jet', u: 'cm²', min: 1.5, max: 8, st: 0.1, d: 1 },
    { g: 'jets', k: 'hNoz', l: 'Nozzle height', u: 'mm', min: 6, max: 20, st: 1, d: 0 },
    { g: 'jets', k: 'alpha', l: 'Downward jet angle', u: '°', min: 0, max: 35, st: 1, d: 0 },
    { g: 'jets', k: 'jetPhase', l: 'Jet position around rim', u: '°', min: 0, max: 180, st: 5, d: 0 },
    { g: 'bowl', k: 'ovality', l: 'Ovality, long ÷ short axis', u: '', min: 1, max: 1.6, st: 0.01, d: 2 },
    { g: 'bowl', k: 'Rrim', l: 'Rim radius, equivalent', u: 'mm', min: 110, max: 190, st: 1, d: 0 },
    { g: 'bowl', k: 'Rpool', l: 'Pool radius at waterline, equivalent', u: 'mm', min: 40, max: 110, st: 1, d: 0 },
    { g: 'bowl', k: 'Dwall', l: 'Rim to waterline depth', u: 'mm', min: 90, max: 200, st: 1, d: 0 },
    { g: 'bowl', k: 'seal', l: 'Water seal depth', u: 'mm', min: 40, max: 90, st: 1, d: 0 },
    { g: 'bowl', k: 'dTrap', l: 'Trapway diameter', u: 'mm', min: 38, max: 65, st: 1, d: 0 },
    { g: 'siph', k: 'Hs', l: 'Siphon drop below weir', u: 'mm', min: 120, max: 400, st: 5, d: 0 },
    { g: 'siph', k: 'Ks', l: 'Siphon loss coefficient', u: '', min: 1.5, max: 6, st: 0.1, d: 1 },
    { g: 'siph', k: 'Qgrav', l: 'Trapway capacity before priming', u: 'L/s', min: 0.2, max: 1.5, st: 0.05, d: 2 },
    { g: 'siph', k: 'Vtrap', l: 'Water needed to prime', u: 'L', min: 0.2, max: 1.2, st: 0.05, d: 2 },
    { g: 'siph', k: 'refill', l: 'Bowl refill after flush', u: 'L', min: 0, max: 1.5, st: 0.05, d: 2 },
    { g: 'load', k: 'Ms', l: 'Solid test media', u: 'g', min: 0, max: 1000, st: 10, d: 0 },
    { g: 'load', k: 'Np', l: 'Paper', u: 'sheets', min: 0, max: 20, st: 1, d: 0 },
    { g: 'coef', k: 'cf', l: 'Film friction factor c_f', u: '', min: 0.002, max: 0.03, st: 0.001, d: 3 },
    { g: 'coef', k: 'ksp', l: 'Film spreading rate', u: 'm/m', min: 0.05, max: 0.6, st: 0.01, d: 2 },
    { g: 'coef', k: 'tauC', l: 'Critical soil shear τc', u: 'Pa', min: 0.5, max: 15, st: 0.5, d: 1 },
    { g: 'coef', k: 'Jcrit', l: 'Shear dose to clean', u: 'Pa·s', min: 0.2, max: 10, st: 0.1, d: 1 },
    { g: 'coef', k: 'eta', l: 'Swirl transfer efficiency', u: '', min: 0.1, max: 1, st: 0.05, d: 2 },
    { g: 'coef', k: 'kov', l: 'Extra swirl loss per unit ovality', u: '', min: 0, max: 6, st: 0.1, d: 1 },
    { g: 'coef', k: 'cfp', l: 'Pool wall friction', u: '', min: 0.005, max: 0.06, st: 0.001, d: 3 },
    { g: 'coef', k: 'ucS', l: 'Transport threshold, solids', u: 'm/s', min: 0.1, max: 1.2, st: 0.01, d: 2 },
    { g: 'coef', k: 'ucP', l: 'Transport threshold, paper', u: 'm/s', min: 0.1, max: 1.2, st: 0.01, d: 2 },
    { g: 'coef', k: 'cmax', l: 'Max solids concentration', u: 'vol.', min: 0.03, max: 0.3, st: 0.01, d: 2 },
    { g: 'coef', k: 'kS', l: 'Solids removal rate', u: '1/s', min: 0.2, max: 6, st: 0.1, d: 1 },
    { g: 'coef', k: 'kP', l: 'Paper removal rate', u: '1/s', min: 0.2, max: 6, st: 0.1, d: 1 },
    { g: 'coef', k: 'Cweir', l: 'Weir coefficient', u: 'm½/s', min: 1.2, max: 2.2, st: 0.05, d: 2 },
    { g: 'noise', k: 'hFall', l: 'Fall from trap weir into outlet', u: 'mm', min: 40, max: 300, st: 5, d: 0 },
    { g: 'noise', k: 'rCore', l: 'Vortex core size, share of pool radius', u: '', min: 0.3, max: 1, st: 0.05, d: 2 },
    { g: 'noise', k: 'cCore', l: 'Air drawn in by an air core', u: 'of trap flow', min: 0, max: 0.3, st: 0.01, d: 2 },
    { g: 'noise', k: 'wTrap', l: 'Sound per unit of air, trap vs splash', u: '', min: 0.01, max: 1, st: 0.01, d: 2 },
    { g: 'noise', k: 'nUe', l: 'Air entrainment onset speed', u: 'm/s', min: 0.4, max: 1.5, st: 0.05, d: 2 },
    { g: 'noise', k: 'nExp', l: 'Air entrainment exponent', u: '', min: 1, max: 3, st: 0.1, d: 1 }
  ];
  const HELP = {
    Vfull: 'Water released by the big button. Less water saves, but leaves less for cleaning and carrying waste.',
    Vpart: 'Water released by the small button.',
    Hcr: 'How far the cistern outlet sits above the rim jets. More height gives faster jets.',
    Kpath: 'Losses in the flush valve, pipe and nozzles. A higher value means slower jets.',
    nJets: 'How many rim nozzles feed the swirl.',
    Anoz: 'Opening of each nozzle. Bigger means more flow and a shorter flush.',
    hNoz: 'Height of the nozzle opening. A tall, narrow nozzle makes a thick, narrow film.',
    alpha: 'Tilt of the jets below horizontal. Flat jets wash the rim zone, steep jets dive to the pool faster.',
    jetPhase: 'Where jet 1 sits around the rim. Only matters in an oval bowl: 0° is the end of the long axis, 90° the middle of the side.',
    ovality: 'Long axis divided by short axis of the bowl opening. 1.00 is round; many bowls are around 1.2 to 1.3.',
    Rrim: 'Size of the bowl opening, given as the radius of a circle with the same area.',
    Rpool: 'Size of the water surface at rest, given as an equivalent radius.',
    Dwall: 'Height of the wall the jets have to clean, from the rim down to the water surface.',
    seal: 'Depth of the water seal that keeps sewer gases out. 50 mm or more is usual.',
    dTrap: 'Diameter of the passage behind the bowl. Wider passes more waste but needs more flow for the same speed.',
    Hs: 'How far the siphon leg drops below the weir. More drop pulls harder.',
    Ks: 'Flow losses in the siphon leg.',
    Qgrav: 'Flow the trapway can drain before it fills up and the siphon starts.',
    Vtrap: 'Water that must collect in the trapway before the siphon starts.',
    refill: 'Water added to the bowl after the flush to restore the seal.',
    Ms: 'Mass of soft solid test media in the pool before the flush.',
    Np: 'Number of paper sheets floating in the pool before the flush.',
    cf: 'How strongly the wall slows the jet film. Higher means more shear, but the film stops sooner.',
    ksp: 'How fast the film widens as it travels round the bowl.',
    tauC: 'Wall shear needed before soil starts to come off.',
    Jcrit: 'How long the extra shear must act before a spot counts as cleaned.',
    kov: 'Extra loss of swirl in an oval pool.',
    eta: 'Share of the jets\' swirl that survives entering the pool.',
    cfp: 'Friction that slows the swirling pool.',
    ucS: 'Trap flow speed needed to start moving solids.',
    ucP: 'Trap flow speed needed to start pulling paper down.',
    cmax: 'Largest share of solids the trap flow can carry.',
    kS: 'How quickly solids leave once they start moving.',
    kP: 'How quickly paper leaves once it starts moving.',
    Cweir: 'Sets how high the pool rises before water spills over the weir.',
    hFall: 'Height the water drops after passing the trap weir before it lands in the outlet. A bigger drop splashes harder.',
    rCore: 'How tightly the pool swirl concentrates over the trap. Smaller means a deeper vortex dip and an earlier air core. 1.00 is plain solid-body rotation.',
    cCore: 'Air pulled into the trap through an air core, as a share of the water flowing out.',
    wTrap: 'Sound made by a litre of air drawn into the trap in large pockets, compared with a litre entrained as fine splash bubbles.',
    nUe: 'Speed at which falling water starts to pull air under the surface. About 0.8 to 1 m/s for turbulent jets.',
    nExp: 'How fast entrained air grows with speed above the onset. Published plunging-jet data give about 1.8 below 4 m/s.'
  };
  SPEC.forEach((s) => { s.h = HELP[s.k] || ''; });
  const SPECK = Object.fromEntries(SPEC.map((s) => [s.k, s]));
  const GROUPS = [
    ['flush', 'Cistern and flush', true, ''],
    ['jets', 'Tangential jets', true, 'Jets sit at the rim, evenly spaced, all pointing the same way round the bowl. At 0° jet 1 sits at the end of the long axis, at 90° on the side.'],
    ['bowl', 'Bowl and trap', true, 'An oval bowl keeps the area of a round bowl with the equivalent radius, so volumes and levels do not change with ovality. The pool radius always stays at least 25 mm smaller than the rim radius.'],
    ['siph', 'Siphon', false, 'Used only when the trap type is siphonic.'],
    ['load', 'Test load', false, 'Media placed in the pool before the flush.'],
    ['coef', 'Model coefficients · advanced', false, 'Uncalibrated defaults. Fit them to CFD or rig data, see Calibrating it below.'],
    ['noise', 'Noise model · advanced', false, 'Uncalibrated defaults for the relative noise indicator. See the noise section in How the model works.']
  ];

  let P = M.defaults('washdown');
  // the pool must stay at least GAP smaller than the rim, or the bowl wall has no width (same rule as the AI lab)
  const GAP = 25;
  const gapOK = (q) => q.Rpool <= q.Rrim - GAP + 1e-9;
  const STORE = 'tfs-params-v1';
  try { const s = localStorage.getItem(STORE); if (s) { const o = JSON.parse(s); if (o && typeof o === 'object') for (const k in o) if (k in P) P[k] = o[k]; } } catch (e) { }
  if (!gapOK(P)) P.Rpool = Math.max(40, P.Rrim - GAP);   // a design saved before the rule existed
  // a returning visitor gets their last design back; say so when it differs from its preset
  const restoredDiffers = (() => { const d = M.defaults(P.type === 'siphonic' ? 'siphonic' : 'washdown'); return Object.keys(d).some((k) => typeof d[k] === 'number' ? Math.abs((+P[k]) - d[k]) > 1e-9 : P[k] !== d[k]); })();
  // settings are remembered in this browser, except while the Demo me walkthrough drives the page
  function save() { if (document.body.classList.contains('touring')) return; try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) { } }

  let R = null, T = 1.6, playing = false, speed = 0.5, lastTs = 0, firstRun = true;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  /* ---------------- controls ---------------- */
  const rail = $('rail'), ctl = {};
  const fmt = (v, d) => Number(v).toFixed(d);
  let typeBtns = null;
  GROUPS.forEach(([g, title, open, note]) => {
    const det = document.createElement('details');
    det.className = 'grp'; if (open) det.open = true; det.id = 'grp_' + g;
    det.innerHTML = `<summary><h3>${title}</h3></summary><div class="body"></div>`;
    const body = det.querySelector('.body');
    if (note) { const n = document.createElement('p'); n.className = 'note'; n.textContent = note; body.appendChild(n); }
    if (g === 'bowl') {
      const w = document.createElement('div'); w.className = 'ctl';
      w.innerHTML = `<div class="row"><span style="font-size:13px">Trap type</span></div><div class="seg" role="group" aria-label="Trap type"><button type="button" data-type="washdown">Washdown</button><button type="button" data-type="siphonic">Siphonic</button></div>`;
      body.appendChild(w);
      typeBtns = w.querySelectorAll('button');
      typeBtns.forEach((b) => b.addEventListener('click', () => {
        if (P.type === b.dataset.type) return;
        P.type = b.dataset.type;
        // a siphon empties the trap, so a siphonic bowl without refill would end with no water seal
        if (P.type === 'siphonic' && !(P.refill > 0)) P.refill = M.PRESETS.siphonic.refill;
        syncControls(); changed();
      }));
    }
    SPEC.filter((s) => s.g === g).forEach((s) => {
      const id = 'p_' + s.k, w = document.createElement('div');
      w.className = 'ctl';
      w.innerHTML = `<div class="row"><span class="lab"><label for="${id}">${s.l}</label>${s.h ? `<button type="button" class="info" aria-expanded="false" aria-controls="h_${s.k}" aria-label="What is ${s.l}?">i</button>` : ''}</span><output id="o_${s.k}" for="${id}"></output></div><p class="help" id="h_${s.k}" hidden>${s.h}</p><input type="range" id="${id}" min="${s.min}" max="${s.max}" step="${s.st}">`;
      body.appendChild(w);
      const inp = w.querySelector('input'), ib = w.querySelector('.info');
      if (ib) ib.addEventListener('click', () => { const hp = w.querySelector('.help'), open = hp.hidden; hp.hidden = !open; ib.setAttribute('aria-expanded', String(open)); });
      inp.addEventListener('input', () => {
        let v = parseFloat(inp.value);
        // the slider being moved stops at the gap; the other radius is never changed
        if (s.k === 'Rrim' && v < P.Rpool + GAP) { v = P.Rpool + GAP; inp.value = v; }
        if (s.k === 'Rpool' && v > P.Rrim - GAP) { v = P.Rrim - GAP; inp.value = v; }
        if (v === P[s.k]) return;
        P[s.k] = v; setOut(s); changed();
      });
      ctl[s.k] = { inp, w, s };
    });
    rail.appendChild(det);
  });
  function setOut(s) { $('o_' + s.k).innerHTML = fmt(P[s.k], s.d) + (s.u ? `<span class="u">${s.u}</span>` : ''); }
  function syncControls() {
    for (const k in ctl) { ctl[k].inp.value = P[k]; setOut(ctl[k].s); }
    typeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === P.type)));
    const siph = P.type === 'siphonic';
    SPEC.filter((s) => s.g === 'siph').forEach((s) => ctl[s.k].w.classList.toggle('off', !siph));
    $('mFull').setAttribute('aria-pressed', String(P.flushMode !== 'partial'));
    $('mPart').setAttribute('aria-pressed', String(P.flushMode === 'partial'));
    ctl.Vfull.w.classList.toggle('off', P.flushMode === 'partial');
    ctl.Vpart.w.classList.toggle('off', P.flushMode !== 'partial');
    $('preset').value = P.type === 'siphonic' ? 'siphonic' : 'washdown';   // the preset family always matches the trap type
  }
  $('mFull').addEventListener('click', () => { P.flushMode = 'full'; syncControls(); changed(); });
  $('mPart').addEventListener('click', () => { P.flushMode = 'partial'; syncControls(); changed(); });
  $('preset').value = P.type;
  $('preset').addEventListener('change', (e) => {
    const pre = M.PRESETS[e.target.value];
    for (const k in pre) if (k !== 'label') P[k] = pre[k];
    syncControls(); changed();
  });
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', resetPreset);
  document.addEventListener('keydown', (e) => {
    const ae = document.activeElement, typing = ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || (ae.tagName === 'INPUT' && ae.type !== 'range' && ae.type !== 'checkbox'));
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !document.body.classList.contains('touring')) { e.preventDefault(); undo(); }
  });
  $('pinBtn').addEventListener('click', () => {
    if (pinned) { pinned = null; } else { const d = new Date(); pinned = { k: kpis(), p: snapP(), t: d.toTimeString().slice(0, 5) }; }
    refreshReference();
  });
  // everything that depends on the reference: cards, noise trace and its scale
  function refreshReference() { if (!R) return; noiseTrace(); updateKPIs(); draw(); }

  const changeHooks = [];
  // history: each burst of edits becomes one undo step; deltas compare with the state before the burst
  const snapP = () => JSON.parse(JSON.stringify(P));
  const kpis = () => (R ? { clean: R.cleanPct, solids: R.solidsPct, paper: R.paperPct, water: R.water, noise: R.noise.peak, noiseE: R.noise.energy, noiseV: R.noise.peakV, noiseEV: R.noise.energyV } : null);
  // range of a noise difference over the uncertain coefficients: each variant is compared with the same variant of the reference
  function nRange(a, b) {
    if (!a || !b) return null;
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < a.length; v++) { const x = a[v] - b[v]; if (x < lo) lo = x; if (x > hi) hi = x; }
    return { lo, hi };
  }
  /* noise reference: the pinned design, or else the preset of the same trap type and flush button,
     computed with the current model coefficients so that only the design differs */
  let refCache = { key: null, val: null };
  function presetNoise() {
    const kind = P.type === 'siphonic' ? 'siphonic' : 'washdown', d = M.defaults(kind);
    Object.keys(M.COEFFS).forEach((k) => { d[k] = P[k]; }); d.flushMode = P.flushMode;
    const key = JSON.stringify(d);
    if (refCache.key !== key) { const r = M.simulate(d, { light: true, Tend: SIM_T }); refCache = { key, val: { peak: r.noise.peak, energy: r.noise.energy, peakV: r.noise.peakV, energyV: r.noise.energyV, kind, mode: P.flushMode } }; }
    return refCache.val;
  }
  /* the pinned design, evaluated with the current model and noise coefficients: changing a coefficient
     then shifts the reference and the current design alike, and an unchanged design still reads zero */
  let pinCache = { key: null, k: null };
  const kpisOf = (r) => ({ clean: r.cleanPct, solids: r.solidsPct, paper: r.paperPct, water: r.water, noise: r.noise.peak, noiseE: r.noise.energy, noiseV: r.noise.peakV, noiseEV: r.noise.energyV });
  function pinnedK() {
    if (!pinned) return null;
    if (!pinned.p) return pinned.k;
    const q = Object.assign({}, pinned.p); Object.keys(M.COEFFS).forEach((k) => { q[k] = P[k]; });
    if (Object.keys(M.COEFFS).every((k) => q[k] === pinned.p[k])) return pinned.k;
    const key = JSON.stringify(q);
    if (pinCache.key !== key) pinCache = { key, k: kpisOf(M.simulate(q, { Tend: SIM_T })) };
    return pinCache.k;
  }
  function noiseRef() {
    const pk = pinnedK();
    if (pk && pk.noise != null) return { peak: pk.noise, energy: pk.noiseE, peakV: pk.noiseV, energyV: pk.noiseEV, pin: true, label: `pinned reference from ${pinned.t}` };
    const v = presetNoise();
    return { peak: v.peak, energy: v.energy, peakV: v.peakV, energyV: v.energyV, pin: false, label: `${v.kind === 'siphonic' ? 'Siphonic' : 'EU washdown'} preset, ${v.mode === 'partial' ? 'partial' : 'full'} flush` };
  }
  let hist = [], committed = null, committedK = null, burst = false, burstT = null, baseline = null, pinned = null;
  function beginChange() {
    if (!burst) { if (committed) { hist.push(committed); if (hist.length > 60) hist.shift(); } baseline = committedK; burst = true; updateHistUI(); }
    clearTimeout(burstT); burstT = setTimeout(endChange, 1200);
  }
  function endChange() { clearTimeout(burstT); burst = false; committed = snapP(); committedK = kpis(); updateHistUI(); }
  function setAll(vals) { for (const k in vals) if (k in P) P[k] = vals[k]; syncControls(); }
  function applyNow(vals) { if (burst) endChange(); beginChange(); setAll(vals); T = TVIEW; playing = false; setPlay(); run(); markSweepStale(); endChange(); changeHooks.forEach((f) => { try { f(); } catch (e) { } }); }
  function undo() {
    if (!hist.length) return;
    clearTimeout(burstT); burst = false;
    const prev = hist.pop(); baseline = kpis(); setAll(prev);
    T = TVIEW; playing = false; setPlay(); run(); markSweepStale();
    committed = snapP(); committedK = kpis(); updateHistUI(); changeHooks.forEach((f) => { try { f(); } catch (e) { } });
  }
  // the walkthrough takes the whole history state and puts it back, so it leaves no undo steps or deltas behind
  function histState() { if (burst) endChange(); return { p: snapP(), hist: hist.slice(), committed, committedK, baseline }; }
  function restoreState(st, keep) {
    clearTimeout(burstT); burst = false;
    if (keep) {
      // keep the design on screen: it becomes one change, and Undo goes back to the design from before the walkthrough
      hist = st.hist.concat(st.committed ? [st.committed] : []); if (hist.length > 60) hist.shift();
      baseline = st.committedK; committed = snapP(); committedK = kpis(); refreshReference();
    } else {
      hist = st.hist.slice(); baseline = st.baseline; setAll(st.p);
      T = TVIEW; playing = false; setPlay(); run(); markSweepStale();
      committed = st.committed; committedK = st.committedK;
    }
    updateHistUI(); changeHooks.forEach((f) => { try { f(); } catch (e) { } });
  }
  function resetPreset() { const d = M.defaults($('preset').value); applyNow(d); hideRestored(); }
  function hideRestored() { const n = $('restoredNote'); if (n) n.hidden = true; }
  (function () {
    const n = $('restoredNote'); if (!n) return;
    if (restoredDiffers && location.hash !== '#demo') n.hidden = false;
    $('restoredReset').addEventListener('click', resetPreset);
    $('restoredHide').addEventListener('click', hideRestored);
    $('preset').addEventListener('change', hideRestored);
  })();
  function updateHistUI() { const u = $('undoBtn'); if (u) { u.disabled = !hist.length; u.title = hist.length ? `Undo (${hist.length} step${hist.length > 1 ? 's' : ''})` : 'Nothing to undo yet'; } }
  let pend = false;
  function changed() {
    beginChange();
    changeHooks.forEach((f) => { try { f(); } catch (e) { } });
    if (pend) return; pend = true;
    requestAnimationFrame(() => { pend = false; if (!playing) T = TVIEW; run(); markSweepStale(); });
  }

  /* ---------------- colours ---------------- */
  function hex(h) {
    h = h.trim();
    if (h[0] === '#') { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    const m = h.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  const TOK = ['bg', 'surface', 'raised', 'ink', 'muted', 'line', 'line-strong', 'accent', 'water', 'water-soft', 'water-deep', 'dry', 'wet', 'clean', 'clean-strong', 'lip', 'solid', 'paper', 'paper-edge', 'seq0', 'seq1', 'tracer', 'bad'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement), C = {};
    TOK.forEach((t) => { C[t.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = hex(cs.getPropertyValue('--' + t) || '#888'); });
    return C;
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a == null ? 1 : a})`;
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

  /* ---------------- canvases ---------------- */
  const cvTop = $('cvTop'), cvSec = $('cvSec'), cvChart = $('cvChart'), cvWall = $('cvWall'), cvSweep = $('cvSweep');
  function sizeCanvas(cv) {
    const d = dpr(), w = Math.max(1, Math.round(cv.clientWidth * d)), h = Math.max(1, Math.round(cv.clientHeight * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
    return false;
  }
  const font = (px, w) => `${w || 400} ${px * dpr()}px "IBM Plex Mono", ui-monospace, monospace`;

  // seeded random for stable tracer layouts
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const TR = (() => { const r = rng(7), a = []; for (let i = 0; i < 64; i++) a.push({ rf: 0.12 + 0.84 * Math.sqrt(r()), a: r() * TAU2 }); return a; })();
  const SD = (() => { const r = rng(11), a = []; for (let i = 0; i < 20; i++) a.push({ rf: 0.15 + 0.55 * r(), a: r() * TAU2, s: 0.8 + 0.5 * r() }); return a; })();
  const PP = (() => { const r = rng(23), a = []; for (let i = 0; i < 20; i++) a.push({ rf: 0.3 + 0.55 * r(), a: r() * TAU2, rot: r() * 3 }); return a; })();

  const recIdx = (t) => Math.max(0, Math.min(R.rec.t.length - 1, Math.round(t / 0.02)));
  const lineAt = (t) => R.lines[Math.max(0, Math.min(R.lines.length - 1, Math.floor(t / R.dtu + 1e-6)))];

  /* ---------------- top view ---------------- */
  let topMap = null;
  function buildTopMap() {
    const W = cvTop.width, H = cvTop.height, g = R.geom, lip = 0.014;
    const E = Math.max(1, P.ovality || 1), sE = Math.sqrt(E);
    const sc = (Math.min(W, H) / 2 - 4 * dpr()) / ((g.Rr + lip) * sE), cx = W / 2, cy = H / 2;
    const idx = new Int32Array(W * H), shade = new Float32Array(W * H);
    const ur = g.ur, NU = ur.length, NTH = R.NTH, NS = R.NS;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = (x + 0.5 - cx) / sc, dy = (y + 0.5 - cy) / sc, rho = Math.sqrt(dx * dx / E + E * dy * dy);
        if (rho > g.Rr + lip) { idx[i] = -3; continue; }
        if (rho > g.Rr) { idx[i] = -2; continue; }
        if (rho <= g.Rp) { idx[i] = -1; shade[i] = 1; continue; }
        let lo = 0, hi = NU - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ur[m] >= rho) lo = m; else hi = m; }
        const f = (ur[lo] - rho) / Math.max(1e-12, ur[lo] - ur[hi]);
        const s = g.S * (lo + f) / (NU - 1);
        const is = Math.min(NS - 1, Math.floor(s / R.dsb));
        let th = Math.atan2(dy * sE, dx / sE); if (th < 0) th += TAU2;
        const it = Math.min(NTH - 1, Math.floor(th / (TAU2 / NTH)));
        idx[i] = is * NTH + it; shade[i] = 1 - 0.16 * s / g.S;
      }
    }
    topMap = { W, H, sc, cx, cy, idx, shade, img: cvTop.getContext('2d').createImageData(W, H), key: geomKey() };
  }
  const geomKey = () => [P.Rrim, P.Rpool, P.Dwall, P.seal, P.ovality].join('|');

  function cellColor(c, t, C) {
    if (R.tClean[c] <= t) return R.J[c] >= 3 * P.Jcrit ? C.cleanStrong : C.clean;
    return R.tWet[c] <= t ? C.wet : C.dry;
  }

  function drawTop(t, C) {
    const ctx = cvTop.getContext('2d');
    if (!topMap || topMap.W !== cvTop.width || topMap.H !== cvTop.height || topMap.key !== geomKey()) buildTopMap();
    const { idx, shade, img, sc, cx, cy } = topMap, data = img.data, g = R.geom, d = dpr();
    const sE = Math.sqrt(Math.max(1, P.ovality || 1));
    const basin = mix(C.dry, C.ink, 0.12);
    for (let i = 0, n = idx.length; i < n; i++) {
      const c = idx[i], o = i * 4;
      if (c === -3) { data[o + 3] = 0; continue; }
      let col, sh = 1;
      if (c >= 0) { col = cellColor(c, t, C); sh = shade[i]; }
      else if (c === -1) col = basin; else col = C.lip;
      data[o] = col[0] * sh; data[o + 1] = col[1] * sh; data[o + 2] = col[2] * sh; data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // rim outlines
    ctx.lineWidth = 1 * d; ctx.strokeStyle = rgba(C.lineStrong, 0.9);
    const ell = (r) => { ctx.beginPath(); ctx.ellipse(cx, cy, r * sE, r / sE, 0, 0, TAU2); };
    ell((g.Rr + 0.014) * sc - 0.5 * d); ctx.stroke();
    ell(g.Rr * sc); ctx.stroke();

    const i = recIdx(t), rec = R.rec, z = rec.z[i] / 1000, vs = rec.vs[i], phi = rec.phi[i];
    const Rc = g.rAtLevel(z), rp = Rc * sc, om = vs / Rc, dip = vs * vs / (2 * 9.81) * 1000;
    // pool water, swirl and media are drawn in a frame stretched to the oval
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sE, 1 / sE); ctx.translate(-cx, -cy);
    const df = Math.min(1, dip / 40);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rp);
    gr.addColorStop(0, rgba(C.waterDeep, 0.55 + 0.35 * df));
    gr.addColorStop(0.55, rgba(mix(C.water, C.waterDeep, 0.3 * df), 0.6));
    gr.addColorStop(1, rgba(C.water, 0.5));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rp, 0, TAU2); ctx.fill();
    ctx.strokeStyle = rgba(C.waterDeep, 0.6); ctx.lineWidth = 1 * d; ctx.stroke();
    // swirl tracers
    const trail = Math.min(1.1, om * 0.16 + 0.03);
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba(C.tracer, 0.55); ctx.lineWidth = 1.4 * d;
    for (const q of TR) {
      const a = q.a + phi, r = q.rf * rp * 0.96;
      ctx.beginPath(); ctx.arc(cx, cy, r, a - trail, a); ctx.stroke();
    }
    // waste media
    const ms0 = P.Ms, nd = ms0 > 0 ? Math.round(SD.length * rec.Ms[i] / ms0) : 0;
    ctx.fillStyle = rgba(C.solid, 0.95);
    for (let k = 0; k < nd; k++) {
      const q = SD[k], a = q.a + 0.85 * phi, r = q.rf * rp;
      ctx.beginPath(); ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), 3.2 * d * q.s, 0, TAU2); ctx.fill();
    }
    const np = Math.min(PP.length, Math.ceil(rec.Np[i] - 0.02));
    for (let k = 0; k < np; k++) {
      const q = PP[k], a = q.a + phi, r = q.rf * rp, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), s = 4.5 * d;
      ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot + a);
      ctx.fillStyle = rgba(C.paper, 0.95); ctx.strokeStyle = rgba(C.paperEdge, 0.9); ctx.lineWidth = 0.8 * d;
      ctx.fillRect(-s, -s * 0.8, 2 * s, 1.6 * s); ctx.strokeRect(-s, -s * 0.8, 2 * s, 1.6 * s); ctx.restore();
    }
    ctx.restore();
    // jet films
    const L = lineAt(t), w0 = (P.Anoz * 1e-4) / (P.hNoz / 1000);
    if (L && L.jets.length && rec.Qin[i] > 0.01) {
      for (const jt of L.jets) {
        const pts = jt.pts, n = pts.length / 4, xy = [];
        for (let k = 0; k < n; k++) xy.push(cx + pts[4 * k] * sc, cy + pts[4 * k + 1] * sc);
        // film band drawn in three widening stretches so the wall colours stay readable underneath
        ctx.strokeStyle = rgba(C.water, 0.3); ctx.lineJoin = 'round';
        for (let part = 0; part < 3; part++) {
          const k0 = Math.floor(part * (n - 1) / 3), k1 = Math.floor((part + 1) * (n - 1) / 3);
          const w = w0 + (jt.w - w0) * (part + 0.5) / 3;
          ctx.lineWidth = Math.max(2 * d, w * sc * 0.3);
          ctx.beginPath(); ctx.moveTo(xy[2 * k0], xy[2 * k0 + 1]); for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(xy[2 * k], xy[2 * k + 1]); ctx.stroke();
        }
        ctx.setLineDash([5 * d, 9 * d]); ctx.lineDashOffset = -t * 140 * d;
        ctx.strokeStyle = rgba(C.tracer, 0.95); ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.moveTo(xy[0], xy[1]); for (let k = 1; k < n; k++) ctx.lineTo(xy[2 * k], xy[2 * k + 1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // nozzles
    const nJ = Math.round(P.nJets);
    for (let j = 0; j < nJ; j++) {
      const a = (P.jetPhase || 0) * Math.PI / 180 + j * TAU2 / nJ, r = (g.Rr + 0.004) * sc;
      const x = cx + r * sE * Math.cos(a), y = cy + r / sE * Math.sin(a);
      let tx = -sE * Math.sin(a), ty = Math.cos(a) / sE; const tm = Math.hypot(tx, ty); tx /= tm; ty /= tm;
      const nx = ty, ny = -tx, s = 7 * d;
      ctx.fillStyle = rgba(C.accent, 1);
      ctx.beginPath(); ctx.moveTo(x + tx * s, y + ty * s); ctx.lineTo(x - tx * s * 0.6 + nx * s * 0.6, y - ty * s * 0.6 + ny * s * 0.6); ctx.lineTo(x - tx * s * 0.6 - nx * s * 0.6, y - ty * s * 0.6 - ny * s * 0.6); ctx.closePath(); ctx.fill();
    }
    const vj = rec.Qin[i] / 1000 / (nJ * P.Anoz * 1e-4);
    $('roTop').innerHTML = `<span>Jets <b>${vj.toFixed(2)} m/s</b></span><span>Pool swirl <b>${vs.toFixed(2)} m/s</b></span><span>Dip <b>${dip.toFixed(0)} mm</b></span>`;
  }

  /* ---------------- section view ---------------- */
  function drawSec(t, C) {
    const ctx = cvSec.getContext('2d'), W = cvSec.width, H = cvSec.height, d = dpr();
    ctx.clearRect(0, 0, W, H);
    const g = R.geom, p = R.p, i = recIdx(t), rec = R.rec;
    const sE = Math.sqrt(Math.max(1, p.ovality || 1));   // section taken along the long axis
    const Rr = g.Rr * sE, Rp = g.Rp * sE, D = g.D, ds = g.ds, dt = p.dTrap / 1000, Hcr = p.Hcr / 1000, siph = p.type === 'siphonic';
    const Ac = p.Acist, hf = Math.max(p.Vfull, p.Vpart) / 1000 / Ac;
    const rWall = (dep) => dep <= D ? Rp + (Rr - Rp) * Math.cos(Math.PI / 2 * dep / D) : g.rAtLevel(D - dep) * sE;
    const yb = D + ds + dt + 0.006, ycIn = yb - dt / 2;
    const xr = Rp + dt / 2 + 0.014, xd = xr + dt * 1.5;
    const outY = siph ? D + p.Hs / 1000 : D + 0.07, outX = siph ? xd : xd + 0.15;
    const xmin = -Rr - 0.23, xmax = Math.max(Rr + 0.04, outX + 0.05), ymin = -(Hcr + hf + 0.06), ymax = Math.max(yb, outY) + 0.04;
    const sc = Math.min(W / (xmax - xmin), H / (ymax - ymin)) * 0.97;
    const ox = (W - (xmax - xmin) * sc) / 2, oy = (H - (ymax - ymin) * sc) / 2;
    const X = (x) => ox + (x - xmin) * sc, Y = (y) => oy + (y - ymin) * sc;

    // ceramic body
    const steps = 50, body = [], inner = [];
    for (let k = 0; k <= steps; k++) { const dep = yb * k / steps; body.push([-(rWall(dep) + 0.02), dep]); inner.push([-rWall(dep), dep]); }
    const bodyPath = new Path2D();
    bodyPath.moveTo(X(-(Rr + 0.02)), Y(-0.012));
    body.forEach(([x, y]) => bodyPath.lineTo(X(x), Y(y)));
    bodyPath.lineTo(X(-(rWall(yb) + 0.02)), Y(yb + 0.02)); bodyPath.lineTo(X(xd + dt), Y(yb + 0.02));
    bodyPath.lineTo(X(xd + dt), Y(D - dt - 0.012)); bodyPath.lineTo(X(Rr + 0.02), Y(-0.012)); bodyPath.closePath();
    ctx.fillStyle = rgba(C.lip); ctx.fill(bodyPath); ctx.strokeStyle = rgba(C.lineStrong); ctx.lineWidth = 1.2 * d; ctx.stroke(bodyPath);
    const inPath = new Path2D();
    inPath.moveTo(X(-Rr), Y(-0.013));
    inner.forEach(([x, y]) => inPath.lineTo(X(x), Y(y)));
    for (let k = steps; k >= 0; k--) { const dep = yb * k / steps; inPath.lineTo(X(rWall(dep)), Y(dep)); }
    inPath.lineTo(X(Rr), Y(-0.013)); inPath.closePath();
    ctx.fillStyle = rgba(C.surface); ctx.fill(inPath); ctx.stroke(inPath);

    // trapway
    const trapPts = [[rWall(yb) * 0.2, ycIn], [xr, ycIn], [xr, D - dt / 2], [xd, D - dt / 2], [xd, outY]];
    if (!siph) trapPts.push([outX, outY]);
    const poly = (pts) => { ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let k = 1; k < pts.length; k++) ctx.lineTo(X(pts[k][0]), Y(pts[k][1])); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    poly(trapPts); ctx.strokeStyle = rgba(C.lineStrong); ctx.lineWidth = dt * sc + 2.4 * d; ctx.stroke();
    poly(trapPts); ctx.strokeStyle = rgba(C.surface); ctx.lineWidth = dt * sc; ctx.stroke();

    const z = rec.z[i] / 1000, yl = D - z, Qin = rec.Qin[i], Qout = rec.Qout[i], primed = rec.primed[i] === 1;
    const water = rgba(C.water, 0.75);
    // seal water in inlet and rising leg
    const legTop = primed ? D - dt / 2 : Math.max(Math.min(yl, ycIn), D - dt / 2);
    ctx.strokeStyle = water; ctx.lineWidth = dt * sc;
    poly([[rWall(yb) * 0.2, ycIn], [xr, ycIn], [xr, legTop]]); ctx.stroke();
    // crest and down leg
    const downLen = outY - (D - dt / 2);
    if (primed) {
      poly([[xr, D - dt / 2], [xd, D - dt / 2], [xd, outY]]); ctx.stroke();
    } else if (siph && rec.Vt[i] > 0.01) {
      const f = Math.min(1, rec.Vt[i]);
      poly([[xd, outY - downLen * f], [xd, outY]]); ctx.stroke();
    }
    if (!primed && Qout > 0.02) {
      ctx.lineWidth = Math.max(1.5 * d, dt * sc * Math.min(0.8, 0.15 + Qout / 3));
      const pts = [[xr, D - dt / 2 + 0.002], [xd, D - dt / 2 + 0.004], [xd, outY]]; if (!siph) pts.push([outX, outY]);
      poly(pts); ctx.stroke();
    }
    // pool
    const dipM = Math.min(rec.vs[i] ** 2 / (2 * 9.81), 0.8 * (yb - yl));
    const rl = rWall(Math.max(0, yl));
    ctx.beginPath();
    const n2 = 40;
    for (let k = 0; k <= n2; k++) { const dep = yl + (yb - yl) * k / n2; ctx.lineTo(X(-rWall(dep)), Y(dep)); }
    for (let k = n2; k >= 0; k--) { const dep = yl + (yb - yl) * k / n2; ctx.lineTo(X(rWall(dep)), Y(dep)); }
    for (let k = 0; k <= 30; k++) { const x = rl - 2 * rl * k / 30; ctx.lineTo(X(x), Y(yl + dipM * (1 - (x / rl) ** 2))); }
    ctx.closePath(); ctx.fillStyle = water; ctx.fill();
    // wall film
    if (Qin > 0.02) {
      ctx.strokeStyle = rgba(C.water, 0.9); ctx.lineWidth = (1.2 + 1.6 * Qin / 2) * d;
      for (const sgn of [-1, 1]) { ctx.beginPath(); for (let k = 0; k <= 30; k++) { const dep = 0.004 + (Math.max(0.01, yl) - 0.004) * k / 30; ctx.lineTo(X(sgn * (rWall(dep) - 0.002)), Y(dep)); } ctx.stroke(); }
    }
    // weir line
    ctx.setLineDash([4 * d, 4 * d]); ctx.strokeStyle = rgba(C.muted, 0.8); ctx.lineWidth = 1 * d;
    ctx.beginPath(); ctx.moveTo(X(-rWall(D) - 0.05), Y(D)); ctx.lineTo(X(xd + dt * 0.5), Y(D)); ctx.stroke(); ctx.setLineDash([]);
    // seal bracket on the left
    const bx = X(-rWall(D) - 0.045);
    ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 1 * d;
    ctx.beginPath(); ctx.moveTo(bx - 4 * d, Y(D)); ctx.lineTo(bx + 4 * d, Y(D)); ctx.moveTo(bx, Y(D)); ctx.lineTo(bx, Y(D + ds)); ctx.moveTo(bx - 4 * d, Y(D + ds)); ctx.lineTo(bx + 4 * d, Y(D + ds)); ctx.stroke();
    ctx.fillStyle = rgba(C.muted); ctx.font = font(10.5); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`seal ${p.seal} mm`, bx - 6 * d, Y(D + ds / 2));
    ctx.textAlign = 'left';
    ctx.fillText('weir crest', X(xd + dt * 0.5) + 4 * d, Y(D));

    // cistern
    const xL = -Rr - 0.2, xR = -Rr - 0.07, yC = -Hcr, yT = -Hcr - hf - 0.03, xc = (xL + xR) / 2;
    const pipe = [[xc, yC], [xc, -0.006], [-Rr + 0.002, -0.006]];
    poly(pipe); ctx.strokeStyle = rgba(C.lineStrong); ctx.lineWidth = 7 * d; ctx.stroke();
    poly(pipe); ctx.strokeStyle = Qin > 0.02 ? water : rgba(C.surface); ctx.lineWidth = 4 * d; ctx.stroke();
    const hw = rec.Vc[i] / 1000 / Ac;
    ctx.fillStyle = rgba(C.surface); ctx.fillRect(X(xL), Y(yT), (xR - xL) * sc, (yC - yT) * sc);
    ctx.fillStyle = water; ctx.fillRect(X(xL), Y(yC - hw), (xR - xL) * sc, hw * sc);
    ctx.strokeStyle = rgba(C.lineStrong); ctx.lineWidth = 1.4 * d; ctx.strokeRect(X(xL), Y(yT), (xR - xL) * sc, (yC - yT) * sc);
    ctx.fillStyle = rgba(C.muted); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('cistern', X(xc), Y(yT) - 4 * d);
    // nozzle marker
    ctx.fillStyle = rgba(C.accent); ctx.beginPath(); ctx.arc(X(-Rr + 0.004), Y(-0.006), 3 * d, 0, TAU2); ctx.fill();
    // siphon / outlet label
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.fillStyle = primed ? rgba(C.accent) : rgba(C.muted);
    if (siph) ctx.fillText(primed ? 'siphon primed' : 'to drain', X(xd), Y(outY) + 4 * d);
    else { ctx.textAlign = 'right'; ctx.fillText('to drain', X(outX), Y(outY) + dt * sc / 2 + 4 * d); }

    const lvl = rec.z[i];
    $('roSec').innerHTML = `<span>Level <b>${lvl >= 0 ? '+' : ''}${lvl.toFixed(0)} mm</b></span><span>Cistern <b>${rec.Vc[i].toFixed(1)} L</b></span><span>Out <b>${Qout.toFixed(2)} L/s</b></span>`;
  }

  /* ---------------- traces ---------------- */
  const niceMax = (v) => { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
  let chartGeom = null;
  function drawCharts(t, C) {
    const ctx = cvChart.getContext('2d'), W = cvChart.width, H = cvChart.height, d = dpr(), rec = R.rec, p = R.p;
    ctx.clearRect(0, 0, W, H);
    const padL = 46 * d, padR = 12 * d, padT = 4 * d, padB = 22 * d, gap = 12 * d;
    const siph = p.type === 'siphonic';
    const qmax = niceMax(Math.max(...rec.Qin, ...rec.Qout) * 1.05);
    const zmax = Math.max(10, Math.ceil((R.zPeak + 6) / 10) * 10), zmin = siph ? -Math.ceil((p.seal + 8) / 10) * 10 : -10;
    const vmax = niceMax(Math.max(0.1, R.vsPeak) * 1.1);
    const panels = [
      { t: 'Flow, L/s', min: 0, max: qmax, s: [['Qin', 'into bowl', C.accent], ['Qout', 'out of trap', C.water]] },
      { t: 'Bowl level vs. weir, mm', min: zmin, max: zmax, s: [['z', 'level', C.waterDeep]], ref: siph ? [0, -p.seal] : [0] },
      { t: 'Pool swirl, m/s', min: 0, max: vmax, s: [['vs', 'rim speed', C.accent]] },
      { t: 'Load left, %', min: 0, max: 100, s: [['MsP', 'solids', C.solid], ['NpP', 'paper', C.paperEdge]] },
      { t: 'Noise level, dB vs reference peak', min: R.nmin, max: R.nmax, s: [['nRel', 'fast level (grey band: range)', C.ink]], ref: [0], noise: true }
    ];
    const NP = panels.length, ph = (H - padT - padB - gap * (NP - 1)) / NP, pw = W - padL - padR;
    const Xt = (tt) => padL + tt / TVIEW * pw;
    const lstep = TVIEW <= 12 ? 2 : TVIEW <= 30 ? 5 : 10, gstep = TVIEW <= 12 ? 1 : 5;
    chartGeom = { padL, pw };
    const n = Math.min(rec.t.length, Math.round(TVIEW / 0.02) + 1);
    panels.forEach((pn, k) => {
      const y0 = padT + k * (ph + gap), Yv = (v) => y0 + ph - (v - pn.min) / (pn.max - pn.min) * ph;
      ctx.fillStyle = rgba(C.raised); ctx.fillRect(padL, y0, pw, ph);
      ctx.strokeStyle = rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, y0 + 0.5, pw - 1, ph - 1);
      ctx.beginPath(); for (let s = gstep; s < TVIEW - 1e-6; s += gstep) { ctx.moveTo(Xt(s), y0); ctx.lineTo(Xt(s), y0 + ph); } ctx.stroke();
      if (pn.noise) { // band over the uncertain coefficients
        ctx.fillStyle = rgba(C.ink, 0.1); ctx.beginPath();
        const cl = (v) => Yv(Math.max(pn.min, Math.min(pn.max, v)));
        for (let q = 0; q < n; q++) { const x = Xt(rec.t[q]); q ? ctx.lineTo(x, cl(rec.nHi[q])) : ctx.moveTo(x, cl(rec.nHi[q])); }
        for (let q = n - 1; q >= 0; q--) ctx.lineTo(Xt(rec.t[q]), cl(rec.nLo[q]));
        ctx.closePath(); ctx.fill();
      }
      if (pn.noise) { // shade the time the air core reaches the trap
        const nr = R.nrec; ctx.fillStyle = rgba(C.bad, 0.13);
        for (let q = 0; q < n; q++) {
          if (!nr.core[q]) continue;
          let q1 = q; while (q1 + 1 < n && nr.core[q1 + 1]) q1++;
          const x0 = Xt(nr.t[q]), x1 = Xt(nr.t[q1] + 0.02); ctx.fillRect(x0, y0, Math.max(1, x1 - x0), ph); q = q1;
        }
      }
      (pn.ref || []).forEach((v) => { ctx.setLineDash([3 * d, 3 * d]); ctx.strokeStyle = rgba(C.muted, 0.7); ctx.beginPath(); ctx.moveTo(padL, Yv(v)); ctx.lineTo(padL + pw, Yv(v)); ctx.stroke(); ctx.setLineDash([]); });
      ctx.fillStyle = rgba(C.muted); ctx.font = font(10); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(String(+pn.max.toFixed(2)), padL - 5 * d, y0); ctx.textBaseline = 'bottom'; ctx.fillText(String(+pn.min.toFixed(2)), padL - 5 * d, y0 + ph);
      pn.s.forEach(([key, , col]) => {
        const arr = rec[key];
        ctx.strokeStyle = rgba(col); ctx.lineWidth = 1.7 * d; ctx.beginPath();
        for (let q = 0; q < n; q++) { const x = Xt(rec.t[q]), y = Yv(Math.max(pn.min, Math.min(pn.max, arr[q]))); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      });
      // title + legend
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = font(10.5, 500);
      let x = padL + 8 * d; const ty = y0 + 5 * d;
      ctx.fillStyle = rgba(C.ink); ctx.fillText(pn.t, x, ty); x += ctx.measureText(pn.t).width + 12 * d;
      ctx.font = font(10);
      pn.s.forEach(([, lab, col]) => { ctx.fillStyle = rgba(col); ctx.fillRect(x, ty + 4 * d, 10 * d, 2.5 * d); x += 14 * d; ctx.fillStyle = rgba(C.muted); ctx.fillText(lab, x, ty); x += ctx.measureText(lab).width + 12 * d; });
      // event markers
      const ev = [];
      if (k === 0 && R.tEmpty) ev.push([R.tEmpty, 'cistern empty']);
      if (k === 1 && R.primeT != null) ev.push([R.primeT, 'siphon primes']);
      if (k === 1 && R.breakT != null) ev.push([R.breakT, 'siphon breaks']);
      if (pn.noise && R.noise.airT != null) ev.push([R.noise.airT, 'air core at trap', true]);
      if (pn.noise && R.breakT != null) ev.push([R.breakT, 'siphon gurgle']);
      ev.forEach(([te, lab, top]) => {
        if (te > TVIEW) return;
        ctx.strokeStyle = rgba(C.ink, 0.45); ctx.setLineDash([2 * d, 3 * d]); ctx.beginPath(); ctx.moveTo(Xt(te), y0); ctx.lineTo(Xt(te), y0 + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = rgba(C.muted); ctx.textAlign = top ? 'right' : 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(lab, Xt(te) + (top ? -4 : 4) * d, y0 + ph - 3 * d);
      });
    });
    // x axis
    ctx.fillStyle = rgba(C.muted); ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let s = 0; s <= TVIEW + 1e-6; s += lstep) ctx.fillText(s + (Math.abs(s - TVIEW) < 1e-6 ? ' s' : ''), Xt(s), H - padB + 6 * d);
    // playhead
    ctx.strokeStyle = rgba(C.accent); ctx.lineWidth = 1.5 * d; ctx.beginPath(); ctx.moveTo(Xt(t), padT); ctx.lineTo(Xt(t), H - padB); ctx.stroke();
  }
  cvChart.addEventListener('click', (e) => {
    if (!chartGeom) return;
    const b = cvChart.getBoundingClientRect(), x = (e.clientX - b.left) * dpr();
    T = Math.max(0, Math.min(TVIEW, (x - chartGeom.padL) / chartGeom.pw * TVIEW)); playing = false; setPlay(); draw();
  });

  /* ---------------- wall map ---------------- */
  function drawWall(t, C) {
    const ctx = cvWall.getContext('2d'), W = cvWall.width, H = cvWall.height, d = dpr(), g = R.geom;
    ctx.clearRect(0, 0, W, H);
    const padL = 44 * d, padR = 8 * d, padT = 14 * d, padB = 22 * d, w = W - padL - padR, h = H - padT - padB;
    const NTH = R.NTH, NS = R.NS, cw = w / NTH, ch = h / NS;
    for (let is = 0; is < NS; is++) for (let it = 0; it < NTH; it++) {
      const c = is * NTH + it; ctx.fillStyle = rgba(cellColor(c, t, C));
      ctx.fillRect(padL + it * cw, padT + is * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
    }
    const Ys = (s) => padT + s / g.S * h, Xa = (a) => padL + (((a % TAU2) + TAU2) % TAU2) / TAU2 * w;
    // pool above static waterline
    const i = recIdx(t), z = R.rec.z[i] / 1000;
    if (z > 0.001) { const s0 = M.sAtDepth(g, g.D - z); ctx.fillStyle = rgba(C.water, 0.55); ctx.fillRect(padL, Ys(s0), w, padT + h - Ys(s0)); }
    // rim line
    ctx.setLineDash([4 * d, 4 * d]); ctx.strokeStyle = rgba(C.ink, 0.55); ctx.lineWidth = 1 * d;
    ctx.beginPath(); ctx.moveTo(padL, Ys(0.025)); ctx.lineTo(padL + w, Ys(0.025)); ctx.stroke(); ctx.setLineDash([]);
    // films
    const L = lineAt(t);
    if (L && L.jets.length && R.rec.Qin[i] > 0.01) {
      ctx.strokeStyle = rgba(C.tracer, 0.95); ctx.lineWidth = 1.6 * d;
      ctx.setLineDash([5 * d, 8 * d]); ctx.lineDashOffset = -t * 120 * d;
      for (const jt of L.jets) {
        const pts = jt.pts; ctx.beginPath(); let px = null;
        for (let k = 0; k < pts.length; k += 4) { const x = Xa(pts[k + 2]), y = Ys(pts[k + 3]); if (px === null || Math.abs(x - px) > w / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y); px = x; }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // nozzles
    const nJ = Math.round(P.nJets);
    ctx.fillStyle = rgba(C.accent);
    for (let j = 0; j < nJ; j++) { const a0 = (P.jetPhase || 0) * Math.PI / 180 + j * TAU2 / nJ; const x = Xa(a0) + (Math.abs(((a0 % TAU2) + TAU2) % TAU2) < 0.05 ? 5 * d : 0); ctx.beginPath(); ctx.moveTo(x - 5 * d, padT - 10 * d); ctx.lineTo(x + 6 * d, padT - 5 * d); ctx.lineTo(x - 5 * d, padT); ctx.closePath(); ctx.fill(); }
    // axes
    ctx.fillStyle = rgba(C.muted); ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, 90, 180, 270, 360].forEach((a) => ctx.fillText(a + '°', padL + a / 360 * w, padT + h + 6 * d));
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let dep = 0; dep <= g.D * 1000 + 0.1; dep += 50) ctx.fillText(String(dep), padL - 6 * d, Ys(M.sAtDepth(g, dep / 1000)));
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('mm', 2 * d, padT - 2 * d);
    ctx.textAlign = 'right'; ctx.fillStyle = rgba(C.ink, 0.7);
    ctx.fillText('rim line, 25 mm', padL + w - 4 * d, Ys(0.025) - 2 * d);
  }

  /* ---------------- KPIs ---------------- */
  function chip(el, cls, txt) { el.className = 'chip ' + cls; el.textContent = txt; }
  function deltaHTML(v, ref, dp, unit, lowerIsBetter) {
    if (ref == null) return '';
    const dlt = v - ref, lim = dp === 0 ? 0.5 : 0.05;
    if (Math.abs(dlt) < lim) return `<span class="delta zero" title="No change">±0</span>`;
    const good = lowerIsBetter ? dlt < 0 : dlt > 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${dlt > 0 ? '+' : '−'}${Math.abs(dlt).toFixed(dp)}${unit}</span>`;
  }
  function flash(id, on) { const el = $(id); if (!el || !on) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function updateKPIs() {
    const r = R, p = R.p;
    const ref = pinned ? pinnedK() : baseline;
    $('kClean').innerHTML = `${r.cleanPct.toFixed(0)}<small>%</small>${deltaHTML(r.cleanPct, ref && ref.clean, 0, '')}`;
    $('kWet').textContent = r.wetPct.toFixed(0) + ' %';
    $('kLine').textContent = r.linePct.toFixed(0) + ' % washed';
    $('kPerL').textContent = r.cleanPerL.toFixed(1) + ' %/L';
    chip($('cClean'), r.cleanPct >= 90 ? 'good' : r.cleanPct >= 75 ? 'warn' : 'bad', r.cleanPct >= 90 ? 'Good' : r.cleanPct >= 75 ? 'Fair' : 'Poor');

    $('kSolids').innerHTML = p.Ms > 0 ? `${r.solidsPct.toFixed(0)}<small>%</small>${deltaHTML(r.solidsPct, ref && ref.solids, 0, '')}` : '–';
    $('kSolidsCap').textContent = p.Ms > 0 ? `of the ${p.Ms} g solid test load removed` : 'no solid test load set';
    $('kPaper').innerHTML = p.Np > 0 ? `${r.paperPct.toFixed(0)} % of ${p.Np} ${deltaHTML(r.paperPct, ref && ref.paper, 0, '')}` : '–';
    $('kCap').textContent = r.capS.toFixed(0) + ' g';
    $('kSiph').textContent = p.type !== 'siphonic' ? 'none, washdown' : r.everPrimed ? `primed ${r.primeT.toFixed(1)} s` + (r.breakT != null ? `, broke ${r.breakT.toFixed(1)} s` : '') : 'did not prime';
    const wm = Math.min(p.Ms > 0 ? r.solidsPct : 100, p.Np > 0 ? r.paperPct : 100);
    if (p.type === 'siphonic' && !r.everPrimed) chip($('cWaste'), 'bad', 'No siphon');
    else chip($('cWaste'), wm >= 95 ? 'good' : wm >= 80 ? 'warn' : 'bad', wm >= 95 ? 'Clear' : wm >= 80 ? 'Partial' : 'Poor');

    $('kWater').innerHTML = `${r.water.toFixed(1)}<small>L</small>${deltaHTML(r.water, ref && ref.water, 1, '', true)}`;
    $('kQ').textContent = r.Qpeak.toFixed(2) + ' L/s';
    $('kDur').textContent = r.tEmpty ? r.tEmpty.toFixed(1) + ' s' : '–';
    $('kSeal').textContent = r.sealEnd.toFixed(0) + ' mm' + (r.sealOK ? '' : ', low');
    if (!r.sealOK) chip($('cWater'), 'bad', 'Seal low');
    else chip($('cWater'), r.water <= 4.0 ? 'good' : r.water <= 6.0 ? 'neutral' : 'warn', r.water <= 4.0 ? 'Low use' : r.water <= 6.0 ? 'Moderate' : 'High use');

    // noise, relative to the preset or the pinned reference
    const nr = noiseRef(), nd = r.noise.peak - nr.peak, ne = r.noise.energy - nr.energy;
    const sdb = (v) => (v < -40 ? 'below −40' : `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${Math.abs(v).toFixed(1)}`);
    $('kNoise').innerHTML = `${sdb(nd)}<small>dB</small>${!pinned && baseline && baseline.noise != null ? deltaHTML(r.noise.peak, baseline.noise, 1, '', true) : ''}`;
    const rg = nRange(r.noise.peakV, nr.peakV) || { lo: nd, hi: nd }, rgE = nRange(r.noise.energyV, nr.energyV) || { lo: ne, hi: ne };
    const span = (q) => (Math.abs(q.hi - q.lo) < 0.05 ? '' : ` (${sdb(q.lo)} to ${sdb(q.hi)})`);
    $('kNoiseCap').innerHTML = `peak level vs <span class="reftag${nr.pin ? ' pin' : ''}">${nr.pin ? '📌 ' : ''}${nr.label}</span><br>sampled range over uncertain coefficients: <b>${sdb(rg.lo)} to ${sdb(rg.hi)} dB</b>`;
    $('kNoiseE').textContent = `${sdb(ne)} dB${span(rgE)}`;
    const SRC = ['jet films hitting the pool', 'fall into the outlet', 'air core in the trap', 'siphon break'];
    const top = (sh) => { const im = sh.indexOf(Math.max(...sh)); return sh[im] > 0 ? `${SRC[im]}, ${Math.round(sh[im] * 100)} %` : '–'; };
    $('kNoisePk').textContent = top(r.noise.peakShare);
    $('kNoiseSrc').textContent = top(r.noise.share);
    $('kAirCore').textContent = r.noise.airT != null ? `from ${r.noise.airT.toFixed(1)} s, ${r.noise.airDur.toFixed(1)} s in all`
      : r.noise.coreCorners > 0 ? `none; possible with other coefficients (${r.noise.coreCorners} of ${r.noise.nCorners})` : 'none';
    $('kGurgle').textContent = p.type !== 'siphonic' ? 'none, washdown' : r.breakT != null ? `at ${r.breakT.toFixed(1)} s` : r.everPrimed ? 'none' : 'no siphon';
    // a direction is shown only when the whole range agrees
    const cls = rg.hi <= -0.5 ? ['good', 'Quieter'] : rg.lo >= 0.5 ? ['warn', 'Louder'] : rg.lo > -0.5 && rg.hi < 0.5 ? ['neutral', 'Similar'] : ['neutral', 'Unclear'];
    chip($('cNoise'), cls[0], cls[1]);

    // validity: overflow or unfinished flush make the numbers meaningless
    const vb = $('validity');
    if (r.overflow) {
      vb.hidden = false; vb.innerHTML = `<b>This design overflows the bowl.</b> About ${r.spill.toFixed(1)} L spill over the rim from ${r.overflowT.toFixed(1)} s on. The model is not valid beyond that point, so the results below are not meaningful. Try less flow, a wider trapway or a deeper bowl.`;
      chip($('cClean'), 'bad', 'Overflow'); chip($('cWaste'), 'bad', 'Overflow'); chip($('cWater'), 'bad', 'Spills'); chip($('cNoise'), 'bad', 'Overflow');
    } else if (r.incomplete) {
      vb.hidden = false; vb.innerHTML = `<b>The flush did not finish within 60 s.</b> ${r.cisternLeft.toFixed(1)} L were still in the cistern. The results only cover the water that flowed. Try a larger nozzle area or a higher valve.`;
      chip($('cClean'), 'bad', 'Incomplete'); chip($('cWaste'), 'bad', 'Incomplete'); chip($('cWater'), 'bad', 'Incomplete'); chip($('cNoise'), 'bad', 'Incomplete');
    } else vb.hidden = true;
    if (r.incomplete) $('kDur').textContent = 'over 60 s';
    // comparison line, flash on change, phone mini bar
    const cmp = $('cmpLine');
    if (pinned) cmp.innerHTML = `Changes compared with your <b>pinned reference</b> from ${pinned.t}${pinnedK() !== pinned.k ? ', recomputed with the current model coefficients' : ''}.`;
    else if (baseline) cmp.innerHTML = 'Changes compared with the design <b>before your last edit</b>.';
    else cmp.textContent = 'Change a setting and the results show how much it helped or hurt.';
    $('pinBtn').textContent = pinned ? 'Clear reference' : 'Pin as reference';
    if (ref) {
      flash('kpiClean', Math.abs(r.cleanPct - ref.clean) >= 0.5);
      flash('kpiWaste', Math.abs(r.solidsPct - ref.solids) >= 0.5 || Math.abs(r.paperPct - ref.paper) >= 0.5);
      flash('kpiWater', Math.abs(r.water - ref.water) >= 0.05);
      flash('kpiNoise', ref.noise != null && Math.abs(r.noise.peak - ref.noise) >= 0.05);
    }
    const mb = $('mobarK');
    if (mb) mb.innerHTML = `<span>Clean <b>${r.cleanPct.toFixed(0)} %</b>${deltaHTML(r.cleanPct, ref && ref.clean, 0, '')}</span><span>Solids <b>${r.solidsPct.toFixed(0)} %</b>${deltaHTML(r.solidsPct, ref && ref.solids, 0, '')}</span><span>Water <b>${r.water.toFixed(1)} L</b>${deltaHTML(r.water, ref && ref.water, 1, '', true)}</span>`;
    const over = r.zPeak > 0.8 * p.Dwall;
    $('strip').innerHTML = [
      `Peak bowl rise <b>+${r.zPeak.toFixed(0)} mm</b>`,
      `Peak pool swirl <b>${r.vsPeak.toFixed(2)} m/s</b>`,
      `Vortex dip, solid-body <b>${r.dipPeak.toFixed(0)} mm</b>`,
      over && !r.overflow ? `<span style="color:var(--bad)">Bowl close to overflowing</span>` : '',
      r.tEmpty && r.tEmpty > 10 && !r.incomplete ? `Slow flush, <b>${r.tEmpty.toFixed(0)} s</b>: playback extended` : '',
      `This flush computed in <b>${r.runMs.toFixed(1)} ms</b>`
    ].filter(Boolean).map((s) => `<span>${s}</span>`).join('');
  }

  /* ---------------- main loop ---------------- */
  function run() {
    const wasEnd = T >= TVIEW - 0.01;
    R = M.simulate(P, { Tend: SIM_T });
    const need = Math.max(10, Math.ceil(((R.tEmpty || R.tEnd) + 5) / 5) * 5);
    TVIEW = Math.min(need, Math.floor(R.tEnd * 10) / 10);
    const sc = $('scrub'); sc.max = String(TVIEW);
    T = wasEnd ? TVIEW : Math.min(T, TVIEW);
    const rec = R.rec;
    rec.MsP = rec.Ms.map((v) => P.Ms > 0 ? 100 * v / P.Ms : 0);
    rec.NpP = rec.Np.map((v) => P.Np > 0 ? 100 * v / P.Np : 0);
    noiseTrace();
    save();
    updateKPIs();
    if (firstRun) { firstRun = false; }
    draw();
  }
  // noise trace against the reference peak, with the band spanned by the uncertain coefficients
  function noiseTrace() {
    const rec = R.rec, nr = noiseRef(), Lv = R.nrec.Lv, nS = R.nrec.L.length;
    rec.nRel = R.nrec.L.map((v) => v - nr.peak);
    rec.nLo = new Array(nS); rec.nHi = new Array(nS);
    for (let i = 0; i < nS; i++) {
      let lo = Infinity, hi = -Infinity;
      for (let v = 0; v < Lv.length; v++) { const x = Lv[v][i] - (nr.peakV ? nr.peakV[v] : nr.peak); if (x < lo) lo = x; if (x > hi) hi = x; }
      rec.nLo[i] = lo; rec.nHi[i] = hi;
    }
    const nTop = Math.max(...rec.nHi.slice(0, Math.round(TVIEW / 0.02) + 1));
    R.nmax = Math.max(10, Math.ceil((nTop + 4) / 5) * 5); R.nmin = R.nmax - 40;
  }
  function draw() {
    if (!R) return;
    [cvTop, cvSec, cvChart, cvWall].forEach(sizeCanvas);
    const C = readColors();
    drawTop(T, C); drawSec(T, C); drawCharts(T, C); drawWall(T, C);
    $('scrub').value = T; $('tnow').textContent = T.toFixed(2) + ' s';
  }
  function setPlay() { $('play').textContent = playing ? 'Pause' : (T >= TVIEW - 0.01 ? 'Replay flush' : 'Play flush'); }
  function tick(ts) {
    if (!playing) return;
    const dw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
    T += dw * speed;
    if (T >= TVIEW) { T = TVIEW; playing = false; }
    draw(); setPlay();
    if (playing) requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', () => {
    if (playing) { playing = false; setPlay(); return; }
    if (T >= TVIEW - 0.01) T = 0;
    playing = true; lastTs = 0; setPlay(); requestAnimationFrame(tick);
  });
  $('scrub').addEventListener('input', (e) => { T = parseFloat(e.target.value); playing = false; setPlay(); draw(); });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speed = parseFloat(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  /* ---------------- sweep ---------------- */
  const SW_P = ['Anoz', 'alpha', 'jetPhase', 'hNoz', 'nJets', 'ovality', 'Hcr', 'Kpath', 'Vfull', 'Vpart', 'Rrim', 'Rpool', 'Dwall', 'dTrap', 'seal'];
  const SW_M = [
    ['cleanPct', 'Wall area cleaned', '%', 1, 1], ['solidsPct', 'Solids removed', '%', 1, 1], ['paperPct', 'Paper removed', '%', 1, 1],
    ['capS', 'Solids transport capacity', 'g', 0, 1], ['cleanPerL', 'Cleaned per litre', '%/L', 1, 1],
    ['water', 'Water per flush', 'L', 2, -1], ['sealEnd', 'Seal after flush', 'mm', 0, 1], ['Qpeak', 'Peak flow', 'L/s', 2, 1],
    ['noisePeak', 'Noise peak vs reference', 'dB', 1, -1], ['noiseEnergy', 'Sound energy vs reference', 'dB', 1, -1]
  ];
  const swX = $('swX'), swY = $('swY'), swM = $('swM');
  SW_P.forEach((k) => { const s = SPECK[k]; [swX, swY].forEach((sel) => { const o = document.createElement('option'); o.value = k; o.textContent = `${s.l}${s.u ? ', ' + s.u : ''}`; sel.appendChild(o); }); });
  SW_M.forEach(([k, l, u]) => { const o = document.createElement('option'); o.value = k; o.textContent = `${l}, ${u}`; swM.appendChild(o); });
  swX.value = 'Anoz'; swY.value = 'alpha'; swM.value = 'cleanPct';
  let SW = null, swRunning = false;
  const N = 12;
  function axisVals(k) {
    const s = SPECK[k];
    if (k === 'nJets') return [1, 2, 3];
    const out = [];
    for (let i = 0; i < N; i++) { const v = s.min + (s.max - s.min) * i / (N - 1); out.push(Math.round(v / s.st) * s.st); }
    return out.map((v) => +v.toFixed(4));
  }
  function runSweep() {
    if (swRunning) return;
    const xk = swX.value, yk = swY.value;
    if (xk === yk) { $('swHov').textContent = 'Pick two different parameters for the axes.'; return; }
    const xs = axisVals(xk), ys = axisVals(yk), total = xs.length * ys.length;
    SW = { xk, yk, xs, ys, res: new Array(total).fill(null), done: 0, stale: false, ms: 0, mode: P.flushMode, type: P.type, nref: noiseRef() };
    swRunning = true; $('swRun').disabled = true;
    const base = Object.assign({}, P); let k = 0; const t0 = performance.now();
    (function chunk() {
      const c0 = performance.now();
      while (k < total && performance.now() - c0 < 14) {
        const q = Object.assign({}, base); q[xk] = xs[k % xs.length]; q[yk] = ys[Math.floor(k / xs.length)];
        if (!gapOK(q)) { SW.res[k] = { blocked: true }; k++; continue; }   // pool not 25 mm smaller than the rim: not a bowl
        const r = M.simulate(q, { light: true, coarse: true, Tend: SIM_T });
        SW.res[k] = { valid: r.valid }; SW_M.forEach(([m]) => { SW.res[k][m] = r[m]; });
        SW.res[k].noisePeak = r.noise.peak - SW.nref.peak; SW.res[k].noiseEnergy = r.noise.energy - SW.nref.energy;
        k++;
      }
      SW.done = k; SW.ms = performance.now() - t0;
      $('swInfo').textContent = `${k} of ${total} flushes · ${(SW.ms / 1000).toFixed(1)} s`;
      drawSweep();
      if (k < total) requestAnimationFrame(chunk);
      else {
        swRunning = false; $('swRun').disabled = false;
        if (SW.dirty) SW.stale = true;   // settings changed while the sweep ran
        $('swInfo').textContent = `${total} flushes in ${(SW.ms / 1000).toFixed(1)} s, ${(SW.ms / total).toFixed(1)} ms each`;
        drawSweep();
      }
    })();
  }
  $('swRun').addEventListener('click', runSweep);
  swM.addEventListener('change', drawSweep);
  [swX, swY].forEach((s) => s.addEventListener('change', () => { if (SW) { SW.stale = true; drawSweep(); } }));
  function markSweepStale() { if (!SW) return; if (swRunning) { SW.dirty = true; return; } SW.stale = true; drawSweep(); }

  let swGeom = null;
  function drawSweep() {
    sizeCanvas(cvSweep);
    const ctx = cvSweep.getContext('2d'), W = cvSweep.width, H = cvSweep.height, d = dpr(), C = readColors();
    ctx.clearRect(0, 0, W, H);
    const padL = 54 * d, padR = 56 * d, padT = 8 * d, padB = 40 * d, w = W - padL - padR, h = H - padT - padB;
    ctx.fillStyle = rgba(C.raised); ctx.fillRect(padL, padT, w, h);
    ctx.strokeStyle = rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    if (!SW) {
      ctx.fillStyle = rgba(C.muted); ctx.font = font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Choose two parameters and run the sweep', padL + w / 2, padT + h / 2);
      swGeom = null; return;
    }
    const mk = swM.value, md = SW_M.find((m) => m[0] === mk), nx = SW.xs.length, ny = SW.ys.length, cw = w / nx, chh = h / ny;
    let lo = Infinity, hi = -Infinity;
    SW.res.forEach((r) => { if (r && !r.blocked && r.valid !== false) { lo = Math.min(lo, r[mk]); hi = Math.max(hi, r[mk]); } });
    if (hi - lo < 1e-9) { hi = lo + 1; }
    let best = -1, bv = md[4] > 0 ? -Infinity : Infinity;
    const ix0 = (k) => k % nx, iy0 = (k) => Math.floor(k / nx);
    SW.res.forEach((r, k) => {
      if (!r) return;
      if (r.blocked) { // excluded by the rim gap rule: hatched, no value
        const x0 = padL + ix0(k) * cw, y0 = padT + h - (iy0(k) + 1) * chh;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, cw, chh); ctx.clip();
        ctx.strokeStyle = rgba(C.muted, 0.45); ctx.lineWidth = 1 * d; ctx.beginPath();
        for (let o = -chh; o < cw; o += 6 * d) { ctx.moveTo(x0 + o, y0 + chh); ctx.lineTo(x0 + o + chh, y0); }
        ctx.stroke(); ctx.restore();
        return;
      }
      const v = r[mk], f = (v - lo) / (hi - lo), ix = k % nx, iy = Math.floor(k / nx);
      ctx.fillStyle = rgba(mix(C.seq0, C.seq1, f));
      ctx.fillRect(padL + ix * cw, padT + h - (iy + 1) * chh, Math.ceil(cw) + 0.5, Math.ceil(chh) + 0.5);
      if (r.valid === false) { // overflow or unfinished flush: not a usable result
        const x0 = padL + ix * cw, y0 = padT + h - (iy + 1) * chh, m = Math.min(cw, chh) * 0.28;
        ctx.strokeStyle = rgba(C.bad, 0.9); ctx.lineWidth = 1.5 * d; ctx.beginPath();
        ctx.moveTo(x0 + cw / 2 - m, y0 + chh / 2 - m); ctx.lineTo(x0 + cw / 2 + m, y0 + chh / 2 + m); ctx.moveTo(x0 + cw / 2 + m, y0 + chh / 2 - m); ctx.lineTo(x0 + cw / 2 - m, y0 + chh / 2 + m); ctx.stroke();
        return;
      }
      if ((md[4] > 0 && v > bv) || (md[4] < 0 && v < bv)) { bv = v; best = k; }
    });
    if (best >= 0 && SW.done === SW.res.length) {
      const ix = best % nx, iy = Math.floor(best / nx);
      ctx.strokeStyle = rgba(C.ink); ctx.lineWidth = 2 * d;
      ctx.strokeRect(padL + ix * cw + 2 * d, padT + h - (iy + 1) * chh + 2 * d, cw - 4 * d, chh - 4 * d);
      $('swBest').textContent = `${md[4] > 0 ? 'Highest' : 'Lowest'} ${md[1].toLowerCase()}: ${bv.toFixed(md[3])} ${md[2]} at ${SPECK[SW.xk].l.toLowerCase()} ${SW.xs[ix]} ${SPECK[SW.xk].u}, ${SPECK[SW.yk].l.toLowerCase()} ${SW.ys[iy]} ${SPECK[SW.yk].u} (outlined).${mk.startsWith('noise') ? ` Noise is relative to the ${SW.nref.label}.` : ''}`;
    }
    // current design marker
    const xs = SW.xs, ys = SW.ys;
    const fx = (v, arr) => { const i0 = arr[0], i1 = arr[arr.length - 1]; return (v - i0) / ((i1 - i0) || 1) * (arr.length - 1); };
    const mx = padL + (fx(P[SW.xk], xs) + 0.5) * cw, my = padT + h - (fx(P[SW.yk], ys) + 0.5) * chh;
    if (mx >= padL && mx <= padL + w && my >= padT && my <= padT + h) {
      ctx.strokeStyle = rgba(C.bad); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(mx, my, 6 * d, 0, TAU2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 10 * d, my); ctx.lineTo(mx - 6 * d, my); ctx.moveTo(mx + 6 * d, my); ctx.lineTo(mx + 10 * d, my); ctx.moveTo(mx, my - 10 * d); ctx.lineTo(mx, my - 6 * d); ctx.moveTo(mx, my + 6 * d); ctx.lineTo(mx, my + 10 * d); ctx.stroke();
    }
    // axes labels
    ctx.fillStyle = rgba(C.muted); ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, Math.floor((nx - 1) / 2), nx - 1].forEach((i) => ctx.fillText(String(xs[i]), padL + (i + 0.5) * cw, padT + h + 5 * d));
    ctx.fillStyle = rgba(C.ink); ctx.fillText(`${SPECK[SW.xk].l}${SPECK[SW.xk].u ? ', ' + SPECK[SW.xk].u : ''}`, padL + w / 2, padT + h + 20 * d);
    ctx.fillStyle = rgba(C.muted); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, Math.floor((ny - 1) / 2), ny - 1].forEach((i) => ctx.fillText(String(ys[i]), padL - 6 * d, padT + h - (i + 0.5) * chh));
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = rgba(C.ink);
    ctx.fillText(`${SPECK[SW.yk].l}${SPECK[SW.yk].u ? ', ' + SPECK[SW.yk].u : ''}`, 0, 0); ctx.restore();
    // colour bar
    const bx = padL + w + 16 * d, bw = 10 * d;
    for (let k = 0; k < 40; k++) { ctx.fillStyle = rgba(mix(C.seq0, C.seq1, 1 - k / 39)); ctx.fillRect(bx, padT + k * h / 40, bw, h / 40 + 1); }
    ctx.strokeStyle = rgba(C.line); ctx.strokeRect(bx + 0.5, padT + 0.5, bw - 1, h - 1);
    ctx.fillStyle = rgba(C.muted); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(hi.toFixed(md[3]), bx + bw + 4 * d, padT);
    ctx.textBaseline = 'bottom'; ctx.fillText(lo.toFixed(md[3]), bx + bw + 4 * d, padT + h); ctx.textBaseline = 'middle'; ctx.fillText(md[2], bx + bw + 4 * d, padT + h / 2);
    if (SW.stale) { ctx.fillStyle = rgba(C.surface, 0.72); ctx.fillRect(padL, padT, w, h); ctx.fillStyle = rgba(C.ink); ctx.font = font(11, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Inputs changed. Run the sweep again to update.', padL + w / 2, padT + h / 2); }
    swGeom = { padL, padT, w, h, cw, chh, nx, ny };
  }
  function swCell(e) {
    if (!swGeom || !SW) return null;
    const b = cvSweep.getBoundingClientRect(), x = (e.clientX - b.left) * dpr(), y = (e.clientY - b.top) * dpr();
    const ix = Math.floor((x - swGeom.padL) / swGeom.cw), iy = Math.floor((swGeom.padT + swGeom.h - y) / swGeom.chh);
    if (ix < 0 || iy < 0 || ix >= swGeom.nx || iy >= swGeom.ny) return null;
    return { ix, iy, k: iy * swGeom.nx + ix };
  }
  cvSweep.addEventListener('mousemove', (e) => {
    const c = swCell(e); if (!c || !SW.res[c.k]) return;
    if (SW.res[c.k].blocked) { $('swHov').textContent = `${SPECK[SW.xk].l} ${SW.xs[c.ix]} ${SPECK[SW.xk].u}, ${SPECK[SW.yk].l.toLowerCase()} ${SW.ys[c.iy]} ${SPECK[SW.yk].u}: not simulated, the pool must stay at least 25 mm smaller than the rim.`; return; }
    const md = SW_M.find((m) => m[0] === swM.value), sx = SPECK[SW.xk], sy = SPECK[SW.yk];
    $('swHov').textContent = `${sx.l} ${SW.xs[c.ix]} ${sx.u}, ${sy.l.toLowerCase()} ${SW.ys[c.iy]} ${sy.u}: ${md[1].toLowerCase()} ${SW.res[c.k][md[0]].toFixed(md[3])} ${md[2]}${SW.res[c.k].valid === false ? ' (not valid: overflow or unfinished flush)' : ''}`;
  });
  cvSweep.addEventListener('click', (e) => {
    const c = swCell(e); if (!c || SW.stale || (SW.res[c.k] && SW.res[c.k].blocked)) return;
    applyNow({ [SW.xk]: SW.xs[c.ix], [SW.yk]: SW.ys[c.iy] }); drawSweep();
  });

  /* ---------------- API for the AI lab (ai.js) ---------------- */
  window.FlushApp = {
    getP: () => Object.assign({}, P),
    apply: (vals) => applyNow(vals),
    onChange: (fn) => changeHooks.push(fn),
    kpis, undo,
    play: (t0, spd) => { if (spd) { speed = spd; document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.speed === spd))); } T = t0 || 0; playing = true; lastTs = 0; setPlay(); requestAnimationFrame(tick); },
    stop: () => { playing = false; setPlay(); },
    setTime: (t) => { T = t; playing = false; setPlay(); draw(); },
    snapshot: () => snapP(),
    histState, restoreState,
    save, noiseRef, nRange, noise: () => (R ? R.noise : null),
    pin: () => pinned, setPin: (v) => { pinned = v || null; refreshReference(); },
    _test: { result: () => R, sweep: () => (SW ? { stale: SW.stale, done: SW.done, total: SW.res.length, dirty: !!SW.dirty } : null) },
    drawer: (open) => toggleDrawer(open),
    isPhone: () => window.matchMedia('(max-width: 940px)').matches,
    SPECK, readColors, rgba, mix, sizeCanvas, dpr, font
  };
  /* ---------------- phone drawer ---------------- */
  function toggleDrawer(open) {
    const rl = $('rail'), b = $('mobarBtn'); if (!rl || !b) return;
    const isOpen = open == null ? !rl.classList.contains('open') : !!open;
    rl.classList.toggle('open', isOpen); b.setAttribute('aria-expanded', String(isOpen));
    b.textContent = isOpen ? 'Close' : 'Adjust design';
  }
  $('mobarBtn').addEventListener('click', () => toggleDrawer());
  /* ---------------- boot ---------------- */
  const ro = new ResizeObserver(() => requestAnimationFrame(() => { draw(); drawSweep(); }));
  [cvTop, cvSec, cvChart, cvWall, cvSweep].forEach((c) => ro.observe(c));
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const redrawAll = () => { draw(); drawSweep(); };
  if (mq.addEventListener) mq.addEventListener('change', redrawAll);
  new MutationObserver(redrawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncControls();
  M.simulate(P, { Tend: SIM_T }); // warm up the JIT so the reported run time is representative
  run(); setPlay(); drawSweep(); committed = snapP(); committedK = kpis(); updateHistUI();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawAll);
})();
