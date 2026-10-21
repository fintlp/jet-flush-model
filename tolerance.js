/* Tolerance study: how much the results of the current design spread when the bowl, the jets and the installation
   deviate from their nominal values, as they do in production. Each setting with a tolerance deviates at random,
   normally distributed with the tolerance as two standard deviations and cut off at the tolerance. The samples are
   drawn as a Latin hypercube, so a modest number covers each setting's range evenly. The same random numbers are
   used for every design, so two designs are compared under the same deviations; the robust option of the AI lab's
   optimiser uses them too (window.FlushTol). */
(function () {
  const A = window.FlushApp, M = window.FlushModel;
  if (!A || !M) return;
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d).replace(/^-(0\.?0*)$/, '$1'));
  const now = () => performance.now();
  const GAP = 25;   // the pool stays at least 25 mm smaller than the rim, as in the simulator

  // assumed production and installation tolerances, ± limit; the user can change or switch off each one
  const DEF = [
    { k: 'Anoz', g: 'Jets', tol: 0.3 }, { k: 'hNoz', g: 'Jets', tol: 1 }, { k: 'alpha', g: 'Jets', tol: 3 }, { k: 'jetPhase', g: 'Jets', tol: 5 },
    { k: 'ovality', g: 'Bowl', tol: 0.02 }, { k: 'Rrim', g: 'Bowl', tol: 2 }, { k: 'Rpool', g: 'Bowl', tol: 2 }, { k: 'Dwall', g: 'Bowl', tol: 3 },
    { k: 'seal', g: 'Bowl', tol: 2 }, { k: 'dTrap', g: 'Bowl', tol: 1 },
    { k: 'Hcr', g: 'Cistern and installation', tol: 20 }, { k: 'Kpath', g: 'Cistern and installation', tol: 0.1 }, { k: 'VOL', g: 'Cistern and installation', tol: 0.2 }
  ];
  const STORE = 'tfs-tol-v1';
  const T = DEF.map((d) => Object.assign({}, d));
  try { const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o && typeof o === 'object') T.forEach((d) => { if (isFinite(o[d.k]) && o[d.k] >= 0) d.tol = +o[d.k]; }); } catch (e) { }
  const save = () => { try { const o = {}; T.forEach((d) => { o[d.k] = d.tol; }); localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { } };
  const specOf = (k) => (k === 'VOL' ? Object.assign({}, A.SPECK.Vfull, { l: 'Flush volume, both buttons' }) : A.SPECK[k]);
  const active = () => T.filter((d) => d.tol > 0);
  const signature = () => JSON.stringify(T.map((d) => [d.k, d.tol]));

  // ---- sampling ----
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // inverse of the standard normal distribution (Acklam's rational approximation, relative error below 1.2e-9)
  function invNorm(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const P2 = 0.022750131948179195;   // share of a normal distribution below -2 standard deviations
  // n standard-normal vectors (one value per active tolerance) cut off at ±2, as a Latin hypercube; with antithetic,
  // half of them are drawn and each is also used mirrored, which halves the noise of a mean
  function zSamples(n, seed, nd, antithetic) {
    const r = rng(seed), m = antithetic ? Math.ceil(n / 2) : n;
    const cols = Array.from({ length: nd }, () => { const p = Array.from({ length: m }, (_, i) => (i + r()) / m); for (let i = m - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
    const Z = Array.from({ length: m }, (_, i) => cols.map((c) => invNorm(P2 + c[i] * (1 - 2 * P2))));
    return antithetic ? Z.flatMap((z) => [z, z.map((v) => -v)]).slice(0, n) : Z;
  }
  // the designs a nominal design p turns into under the active tolerances
  function samples(p, n, seed, antithetic, tols) {
    const act = (tols || active()), Z = zSamples(n, seed, act.length, antithetic);
    return Z.map((z) => {
      const q = Object.assign({}, p);
      act.forEach((d, j) => {
        const dev = z[j] * d.tol / 2;
        const keys = d.k === 'VOL' ? ['Vfull', 'Vpart'] : [d.k];
        keys.forEach((k) => { const s = A.SPECK[k]; q[k] = Math.min(s.max, Math.max(s.min, p[k] + dev)); });
      });
      if (q.Rpool > q.Rrim - GAP) q.Rpool = q.Rrim - GAP;   // keep the bowl a bowl
      return { q, z };
    });
  }

  // ---- the panel ----
  const box = $('tolList');
  if (!box) return;
  const groups = [...new Set(T.map((d) => d.g))];
  box.innerHTML = groups.map((g) => `<fieldset class="tol-grp"><legend>${g}</legend>${T.filter((d) => d.g === g).map((d) => { const s = specOf(d.k), id = 'tol_' + d.k; return `<label class="tol-f" for="${id}"><span>${s.l}</span><span class="tol-in">± <input type="number" id="${id}" min="0" step="${s.st}" value="${d.tol}"> ${s.u || ''}</span></label>`; }).join('')}</fieldset>`).join('');
  T.forEach((d) => $('tol_' + d.k).addEventListener('change', (e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); d.tol = isFinite(v) && v >= 0 ? v : 0; e.target.value = d.tol; save(); stale(); }));
  $('tolReset').addEventListener('click', () => { T.forEach((d, i) => { d.tol = DEF[i].tol; $('tol_' + d.k).value = d.tol; }); save(); stale(); });

  const METRICS = [
    { k: 'clean', l: 'Wall area cleaned', u: '%', d: 1, good: 1 }, { k: 'line', l: 'Line 25 mm below rim', u: '%', d: 0, good: 1 },
    { k: 'solids', l: 'Solids removed', u: '%', d: 1, good: 1 }, { k: 'paper', l: 'Paper removed', u: '%', d: 1, good: 1 },
    { k: 'water', l: 'Water per flush', u: 'L', d: 2, good: -1 }, { k: 'seal', l: 'Seal after flush', u: 'mm', d: 1, good: 1 },
    { k: 'noise', l: 'Noise peak vs nominal', u: 'dB', d: 1, good: -1 }
  ];
  const S = { res: null, running: false, stop: null, fp: null };
  const metricsOf = (r) => ({ clean: r.cleanPct, line: r.linePct, solids: r.solidsPct, paper: r.paperPct, water: r.water, seal: r.sealEnd, noise: r.noise.peak, sealOK: r.sealOK, valid: r.valid });
  const q = (a, f) => { const s = a.slice().sort((x, y) => x - y), x = f * (s.length - 1), i = Math.floor(x); return s[i] + (x - i) * ((s[Math.min(s.length - 1, i + 1)] - s[i]) || 0); };
  const fpNow = () => JSON.stringify(A.getP()) + signature();
  function stale() { document.dispatchEvent(new Event('flushtolchange')); const el = $('tolStale'); if (!el || !S.res) return; const st = fpNow() !== S.fp; el.hidden = !st; if (st) el.innerHTML = '<b>Settings or tolerances changed since this study.</b> The results below are for the earlier ones. Run it again to update them.'; }
  A.onChange(() => requestAnimationFrame(stale));

  // least squares: which tolerances drive the spread of a metric (squared standardised coefficients)
  function drivers(Z, y) {
    const n = y.length, d = Z[0].length, my = y.reduce((s, v) => s + v, 0) / n;
    const X = Z.map((z) => [1].concat(z)), k = d + 1;
    const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
    X.forEach((x, i) => { for (let a = 0; a < k; a++) { Xty[a] += x[a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += x[a] * x[b]; } });
    for (let a = 0; a < k; a++) XtX[a][a] += 1e-9;
    // Gauss-Jordan
    const Mx = XtX.map((row, i) => row.concat([Xty[i]]));
    for (let c = 0; c < k; c++) {
      let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[piv][c])) piv = r;
      [Mx[c], Mx[piv]] = [Mx[piv], Mx[c]];
      const pv = Mx[c][c] || 1e-12; for (let j = c; j <= k; j++) Mx[c][j] /= pv;
      for (let r = 0; r < k; r++) if (r !== c) { const f = Mx[r][c]; if (f) for (let j = c; j <= k; j++) Mx[r][j] -= f * Mx[c][j]; }
    }
    const beta = Mx.map((row) => row[k]);
    const sz = Z[0].map((_, j) => Math.sqrt(Z.reduce((s, z) => s + z[j] * z[j], 0) / n));
    const contrib = beta.slice(1).map((b, j) => (b * sz[j]) ** 2), tot = contrib.reduce((s, v) => s + v, 0);
    const ss = y.reduce((s, v) => s + (v - my) ** 2, 0), res = X.reduce((s, x, i) => s + (x.reduce((t, v, j) => t + v * beta[j], 0) - y[i]) ** 2, 0);
    return { share: contrib.map((c) => (tot > 0 ? c / tot : 0)), r2: ss > 1e-12 ? 1 - res / ss : 1 };
  }

  function bar(f) {
    const b = $('tolProg'); if (!b) return;
    b.hidden = f == null; if (f == null) return;
    const pc = Math.round(100 * f); b.querySelector('.prog-fill').style.width = pc + '%'; b.querySelector('.prog-bar').setAttribute('aria-valuenow', String(pc));
  }
  function run() {
    if (S.running) return;
    const act = active();
    if (!act.length) { $('tolStatus').textContent = 'All tolerances are zero: set at least one.'; return; }
    const n = +$('tolN').value, p = A.getP(), smp = samples(p, n, 2027, false, act), t0 = now();
    S.running = true; $('tolRun').disabled = true; bar(0); S.fp = fpNow(); $('tolStale').hidden = true;
    const nom = metricsOf(M.simulate(p, { light: true, Tend: 12 })), out = []; let i = 0;
    S.stop = slices(() => {
      if (i >= smp.length) return false;
      out.push(metricsOf(M.simulate(smp[i].q, { light: true, Tend: 12 }))); i++;
      const el = now() - t0; bar(i / smp.length);
      $('tolStatus').textContent = `Simulating ${i} of ${smp.length} varied designs${i > 4 && el > 1000 ? `, about ${Math.max(1, Math.round(el * (smp.length - i) / i / 1000))} s left` : ''}…`;
      return true;
    }, () => {
      S.running = false; $('tolRun').disabled = false; bar(null);
      out.forEach((m) => { m.noise -= nom.noise; }); nom.noise = 0;
      const Z = smp.map((s) => s.z), stat = {};
      METRICS.forEach((m) => {
        const v = out.map((o) => o[m.k]), dv = drivers(Z, v);
        stat[m.k] = { p10: q(v, 0.1), p50: q(v, 0.5), p90: q(v, 0.9), lo: Math.min(...v), hi: Math.max(...v), drv: dv, v };
      });
      S.res = { nom, out, stat, act, n: smp.length, sealFail: out.filter((o) => !o.sealOK).length, invalid: out.filter((o) => !o.valid).length, ms: now() - t0, mode: p.flushMode };
      $('tolStatus').textContent = `${smp.length} varied designs simulated in ${((now() - t0) / 1000).toFixed(1)} s.`;
      render();
    });
  }
  function slices(step, done) {
    let alive = true;
    (function tick() { if (!alive) return; const t0 = now(); while (now() - t0 < 14) { if (step() === false) { alive = false; done(); return; } } requestAnimationFrame(tick); })();
    return () => { alive = false; };
  }
  function render() {
    const R = S.res; if (!R) return;
    const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
    const top = (dv) => dv.share.map((s, j) => [s, j]).sort((a, b) => b[0] - a[0]).filter((x) => x[0] >= 0.1).slice(0, 2).map(([s, j]) => `${lc(specOf(R.act[j].k).l)} ${Math.round(100 * s)} %`).join(', ') || 'no single tolerance';
    $('tolTable').innerHTML = `<thead><tr><th>Result</th><th>Nominal</th><th>10 % of designs below</th><th>Median</th><th>10 % of designs above</th><th>Range</th><th>Spread mostly from</th></tr></thead><tbody>` +
      METRICS.map((m) => { const s = R.stat[m.k]; return `<tr><td>${m.l}, ${m.u}</td><td class="num">${fmt(R.nom[m.k], m.d)}</td><td class="num">${fmt(s.p10, m.d)}</td><td class="num">${fmt(s.p50, m.d)}</td><td class="num">${fmt(s.p90, m.d)}</td><td class="num">${fmt(s.lo, m.d)} to ${fmt(s.hi, m.d)}</td><td>${s.hi - s.lo < Math.pow(10, -m.d) ? 'no spread' : top(s.drv) + (s.drv.r2 < 0.6 ? ' (not linear: thresholds or interactions)' : '')}</td></tr>`; }).join('') + '</tbody>';
    const c = R.stat.clean, w = R.stat.water;
    $('tolSum').innerHTML = `<p>Under these tolerances, one design in ten cleans less than <b>${fmt(c.p10, 1)} %</b> of the wall (nominal ${fmt(R.nom.clean, 1)} %), and one in ten uses more than <b>${fmt(w.p90, 2)} L</b> (nominal ${fmt(R.nom.water, 2)} L).` +
      `${R.sealFail ? ` <b>${R.sealFail} of ${R.n}</b> varied designs end with a seal below 50 mm.` : ' Every varied design restores the seal.'}${R.invalid ? ` ${R.invalid} overflow or do not finish.` : ''}</p>` +
      (c.p90 - c.p10 < 1.6 ? `<p>The cleaning spread of ${fmt(c.p90 - c.p10, 1)} points is about as small as the model's own resolution error for cleaning (up to about 0.8 points for most designs, see <a href="method.html#numerics">numerics</a>). Read it as "these tolerances hardly matter for cleaning here", and its drivers as rough.</p>` : '') +
      `<p class="muted">Each setting deviates at random, normally distributed with the tolerance as two standard deviations and cut off at the tolerance, all independently. "Spread mostly from" is a linear fit of each result on the deviations; it names the tolerances that explain most of the spread, so tightening them helps most. Noise is relative to the nominal design with the current coefficients. The tolerances are assumptions; set your own.</p>`;
    draw();
  }
  function draw() {
    const R = S.res, mk = $('tolM').value, m = METRICS.find((x) => x.k === mk);
    { // distribution of the chosen result
      const cv = $('cvTolHist'); A.sizeCanvas(cv);
      const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors();
      ctx.clearRect(0, 0, W, H);
      const padL = 44 * d, padR = 12 * d, padT = 22 * d, padB = 36 * d, w = W - padL - padR, h = H - padT - padB;
      ctx.fillStyle = A.rgba(C.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
      ctx.font = A.font(10); ctx.fillStyle = A.rgba(C.muted);
      if (!R) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Run the study to see the spread', padL + w / 2, padT + h / 2); }
      else {
        const s = R.stat[mk], v = s.v.concat([R.nom[mk]]); let lo = Math.min(...v), hi = Math.max(...v); if (hi - lo < 1e-6) { lo -= 0.5; hi += 0.5; } const padv = (hi - lo) * 0.05; lo -= padv; hi += padv;
        const NB = 20, bins = new Array(NB).fill(0); s.v.forEach((x) => { bins[Math.min(NB - 1, Math.floor((x - lo) / (hi - lo) * NB))]++; });
        const mx = Math.max(...bins), X = (x) => padL + (x - lo) / (hi - lo) * w;
        ctx.fillStyle = A.rgba(C.water, 0.75);
        bins.forEach((b, i) => { const bh = b / mx * (h - 16 * d); ctx.fillRect(padL + i * w / NB + 1, padT + h - bh, w / NB - 2, bh); });
        [['p10', '10 %'], ['p90', '90 %']].forEach(([k, lab]) => { const x = X(s[k]); ctx.strokeStyle = A.rgba(C.ink, 0.6); ctx.setLineDash([3 * d, 3 * d]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + h); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = A.rgba(C.ink); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(lab, x, padT - 3 * d); });
        const xn = X(R.nom[mk]); ctx.strokeStyle = A.rgba(C.accent); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(xn, padT); ctx.lineTo(xn, padT + h); ctx.stroke();
        ctx.fillStyle = A.rgba(C.accent); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('nominal', xn + 3 * d, padT + 3 * d);
        ctx.fillStyle = A.rgba(C.muted); ctx.textBaseline = 'top'; ctx.textAlign = 'center';
        [lo, (lo + hi) / 2, hi].forEach((x) => ctx.fillText(fmt(x, m.d), X(x), padT + h + 5 * d));
        ctx.fillStyle = A.rgba(C.ink); ctx.font = A.font(10.5, 500); ctx.fillText(`${m.l}, ${m.u}`, padL + w / 2, padT + h + 20 * d);
        ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = A.font(10.5, 500); ctx.fillText('Varied designs', 0, -2 * d); ctx.restore();
      }
    }
    { // which tolerances drive it
      const cv = $('cvTolDrv'); A.sizeCanvas(cv);
      const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors();
      ctx.clearRect(0, 0, W, H);
      ctx.font = A.font(10); ctx.fillStyle = A.rgba(C.muted);
      if (!R) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Which tolerances drive the spread', W / 2, H / 2); return; }
      const dv = R.stat[mk].drv, rows = R.act.map((t, j) => [specOf(t.k).l, dv.share[j]]).sort((a, b) => b[1] - a[1]);
      // labels get the room they need, up to half the width; longer ones are shortened to fit
      const maxL = W * 0.5, fit = (t) => { if (ctx.measureText(t).width <= maxL - 14 * d) return t; let u = t; while (u.length > 4 && ctx.measureText(u + '…').width > maxL - 14 * d) u = u.slice(0, -1); return u + '…'; };
      const labs = rows.map((r) => fit(r[0])), padL = Math.min(maxL, Math.max(...labs.map((t) => ctx.measureText(t).width)) + 14 * d);
      const padR = 40 * d, padT = 22 * d, padB = 14 * d, w = W - padL - padR, h = H - padT - padB, bh = Math.min(18 * d, h / rows.length);
      ctx.fillStyle = A.rgba(C.ink); ctx.font = A.font(10.5, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`Share of the spread in ${m.l.toLowerCase()} (linear fit, R² ${fmt(dv.r2, 2)})`, 8 * d, padT - 6 * d);
      rows.forEach(([lab, sh], i) => {
        const y = padT + i * bh;
        ctx.fillStyle = A.rgba(C.muted); ctx.font = A.font(10); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(labs[i], padL - 6 * d, y + bh / 2);
        ctx.fillStyle = A.rgba(C.accent, 0.85); ctx.fillRect(padL, y + 2 * d, Math.max(1, sh * w), bh - 4 * d);
        ctx.fillStyle = A.rgba(C.ink); ctx.textAlign = 'left'; ctx.fillText(`${Math.round(100 * sh)} %`, padL + sh * w + 4 * d, y + bh / 2);
      });
    }
  }
  METRICS.forEach((m) => { const o = document.createElement('option'); o.value = m.k; o.textContent = `${m.l}, ${m.u}`; $('tolM').appendChild(o); });
  $('tolM').addEventListener('change', draw);
  $('tolRun').addEventListener('click', run);
  const ro = new ResizeObserver(() => requestAnimationFrame(draw)); ['cvTolHist', 'cvTolDrv'].forEach((id) => ro.observe($(id)));
  new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();

  window.FlushTol = { samples, active, signature, specOf, _test: { result: () => S.res, invNorm } };
})();
