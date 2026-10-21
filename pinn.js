/* AI lab tab "Physics-informed network": trains the PINN of pinn-core.js on a simulated pool level record and
   compares it with the same network trained on the readings alone and with a classic least-squares fit. */
(function () {
  const A = window.FlushApp, M = window.FlushModel, P = window.FlushPINN;
  const $ = (id) => document.getElementById(id);
  if (!A || !M || !P || !$('aiPinn')) return;
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));
  const now = () => performance.now();
  const S = { running: false, D: null, pinn: null, plain: null, ls: null, hist: [], kind: 'dense', ms: {} };
  const DATA = { dense: { fps: 10 }, sparse: { fps: 1.5 }, cut: { fps: 10, cut: 3 } };
  const EPOCHS = 1000;

  function bar(f, txt) {
    const b = $('pnProg'); b.hidden = f == null; if (f == null) return;
    const pc = Math.round(100 * f); b.querySelector('.prog-fill').style.width = pc + '%'; b.querySelector('.prog-bar').setAttribute('aria-valuenow', String(pc)); b.querySelector('.prog-txt').textContent = txt;
  }
  function run() {
    if (S.running) return Promise.resolve(null);
    S.running = true; $('pnRun').disabled = true; S.kind = $('pnData').value;
    const o = DATA[S.kind], D = P.makeData(M, { fps: o.fps });
    if (o.cut) D.obs = D.obs.filter((q) => q.t <= o.cut + 1e-9);
    S.D = D; S.pinn = S.plain = S.ls = null; S.hist = [];
    let t0 = now(); S.ls = P.leastSquares(D); S.ms.ls = now() - t0;
    const gP = P.train(D, { epochs: EPOCHS, every: 20 }), gN = P.train(D, { epochs: EPOCHS, physics: false, every: 20 });
    let stage = 'pinn', tP = now(), tN = 0;
    return new Promise((resolve) => {
      (function tick() {
        const t1 = now();
        while (now() - t1 < 14) {
          if (stage === 'pinn') {
            const s = gP.next();
            if (s.done) { S.pinn = s.value; S.ms.pinn = now() - tP; stage = 'plain'; tN = now(); }
            else { S.hist.push(s.value); bar(0.8 * s.value.ep / EPOCHS, `Training the physics-informed network: epoch ${s.value.ep} of ${EPOCHS}, weir coefficient ${fmt(s.value.Cw, 2)}, time on the wall ${fmt(s.value.tau, 2)} s`); }
          } else {
            const s = gN.next();
            if (s.done) { S.plain = s.value; S.ms.plain = now() - tN; stage = 'done'; break; }
            bar(0.8 + 0.2 * s.value.ep / EPOCHS, `Training the same network on the readings alone: epoch ${s.value.ep} of ${EPOCHS}`);
          }
        }
        draw();
        if (stage !== 'done') requestAnimationFrame(tick);
        else { S.running = false; $('pnRun').disabled = false; bar(null); summary(); draw(); resolve(S); }
      })();
    });
  }

  const at = (curve, t) => curve.reduce((b, q) => (Math.abs(q.t - t) < Math.abs(b.t - t) ? q : b));
  const rms = (curve, lo, hi) => { let s = 0, k = 0; curve.forEach((c) => { if (c.t < lo - 1e-9 || c.t > hi + 1e-9) return; s += (c.z - at(S.D.truth, c.t).z) ** 2; k++; }); return k ? Math.sqrt(s / k) * 1000 : null; };
  function summary() {
    const D = S.D, pi = S.pinn, ls = S.ls, pl = S.plain, cut = DATA[S.kind].cut, T = D.T;
    const wT = at(D.truth, 1).W * 1000, wP = at(pi.curve, 1).W * 1000, errP = 100 * (pi.Cw - D.Cw) / D.Cw, errL = 100 * (ls.Cw - D.Cw) / D.Cw;
    const z5 = (c) => at(c, 5).z * 1000;
    $('pnSum').innerHTML = (cut
      ? `<p class="ch-big">With the video stopping after ${cut} s, the network finds a weir coefficient of <b>${fmt(pi.Cw, 2)}</b> against the hidden <b>${fmt(D.Cw, 2)}</b>: the filling phase alone cannot tell a slow drain from a long time on the wall. Least squares does no better (${fmt(ls.Cw, 2)}).</p><p>The physics still helps beyond the readings: at 5 s the physics-informed network says ${fmt(z5(pi.curve), 0)} mm, the network without physics ${fmt(z5(pl.curve), 0)} mm; the true level is ${fmt(z5(D.truth), 0)} mm. To pin down the drain, the record must include the draining.</p>`
      : `<p class="ch-big">From ${D.obs.length} noisy readings, the network found a weir coefficient of <b>${fmt(pi.Cw, 2)}</b>; the hidden value is <b>${fmt(D.Cw, 2)}</b> (${errP >= 0 ? '+' : '−'}${fmt(Math.abs(errP), 0)} %). The model's default of ${fmt(D.CwModel, 1)} would have been ${fmt(100 * (D.CwModel - D.Cw) / D.Cw, 0)} % off.</p><p>It also estimates what was never measured: about <b>${fmt(wP, 1)} L</b> of water on the wall at 1 s; the full model holds ${fmt(wT, 2)} L there.</p>`) +
      `<p class="muted">Honest comparison: classic least squares, which integrates the same equation for trial values, finds ${fmt(ls.Cw, 2)} (${errL >= 0 ? '+' : '−'}${fmt(Math.abs(errL), 0)} %) in ${fmt(S.ms.ls, 0)} ms; the network takes ${fmt(S.ms.pinn / 1000, 1)} s. For a small equation like this one, the classic fit is the better tool. PINNs pay off when the equations are expensive to solve over and over, partly unknown, or the data are scattered in space and time. For a full three-dimensional flush with turbulence and free surfaces, CFD plus surrogate models is the realistic route. Both fits differ from 1.45 by a few percent because the simple pool equation does not capture every detail of the full model's wall flow.</p>`;
    $('pnTable').innerHTML = `<thead><tr><th>Method</th><th>Weir coefficient</th><th>Time on the wall, s</th><th>Level error, readings span, mm</th><th>Level error, after the readings, mm</th><th>Time</th></tr></thead><tbody>` +
      `<tr><td>Physics-informed network</td><td class="num">${fmt(pi.Cw, 2)}</td><td class="num">${fmt(pi.tau, 2)}</td><td class="num">${fmt(rms(pi.curve, 0, cut || T), 1)}</td><td class="num">${cut ? fmt(rms(pi.curve, cut, T), 1) : '–'}</td><td class="num">${fmt(S.ms.pinn / 1000, 1)} s</td></tr>` +
      `<tr><td>Same network, readings only</td><td class="num">–</td><td class="num">–</td><td class="num">${fmt(rms(pl.curve, 0, cut || T), 1)}</td><td class="num">${cut ? fmt(rms(pl.curve, cut, T), 1) : '–'}</td><td class="num">${fmt(S.ms.plain / 1000, 1)} s</td></tr>` +
      `<tr><td>Least squares on the equation</td><td class="num">${fmt(ls.Cw, 2)}</td><td class="num">${fmt(ls.tau, 2)}</td><td class="num">${fmt(rms(ls.curve, 0, cut || T), 1)}</td><td class="num">${cut ? fmt(rms(ls.curve, cut, T), 1) : '–'}</td><td class="num">${fmt(S.ms.ls, 0)} ms</td></tr>` +
      `<tr><td>Hidden truth</td><td class="num">${fmt(D.Cw, 2)}</td><td class="num">–</td><td class="num">0</td><td class="num">${cut ? '0' : '–'}</td><td class="num">–</td></tr></tbody>`;
  }

  // ---- charts ----
  function axes(cv, o) {
    A.sizeCanvas(cv);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = A.dpr(), C = A.readColors(); ctx.clearRect(0, 0, W, H);
    const padL = 44 * d, padR = 12 * d, padT = (cv.clientWidth < 420 ? 44 : 30) * d, padB = 36 * d, w = W - padL - padR, h = H - padT - padB;
    const X = (v) => padL + (v - o.x[0]) / (o.x[1] - o.x[0]) * w, Y = (v) => padT + (1 - (Math.max(o.y[0], Math.min(o.y[1], v)) - o.y[0]) / (o.y[1] - o.y[0])) * h;
    ctx.fillStyle = A.rgba(C.raised); ctx.fillRect(padL, padT, w, h); ctx.strokeStyle = A.rgba(C.line); ctx.lineWidth = 1 * d; ctx.strokeRect(padL + 0.5, padT + 0.5, w - 1, h - 1);
    ctx.font = A.font(10); ctx.fillStyle = A.rgba(C.muted); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    o.yt.forEach((v) => { ctx.fillText(o.yf ? o.yf(v) : String(v), padL - 5 * d, Y(v)); ctx.strokeStyle = A.rgba(C.line, 0.6); ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + w, Y(v)); ctx.stroke(); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; o.xt.forEach((v) => ctx.fillText(String(v), X(v), padT + h + 4 * d));
    ctx.fillText(o.xl, padL + w / 2, padT + h + 18 * d);
    ctx.save(); ctx.translate(12 * d, padT + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yl, 0, 0); ctx.restore();
    return { ctx, d, C, X, Y, padL, padT, w, h };
  }
  function legend(f, items) {
    const { ctx, d, C, padL, w } = f; ctx.font = A.font(10); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; let lx = padL, ly = 12 * d;
    items.forEach(([l, col, dash, dot]) => {
      const lw = (30 + ctx.measureText(l).width / d) * d; if (lx > padL && lx + lw > padL + w) { lx = padL; ly += 14 * d; }
      if (dot) { ctx.fillStyle = A.rgba(col); ctx.beginPath(); ctx.arc(lx + 9 * d, ly, 2.6 * d, 0, 2 * Math.PI); ctx.fill(); }
      else { ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2 * d; ctx.setLineDash((dash || []).map((v) => v * d)); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18 * d, ly); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = A.rgba(C.ink); ctx.fillText(l, lx + 22 * d, ly); lx += lw;
    });
  }
  function draw() {
    if ($('aiPinn').hidden) return;
    const D = S.D, T = D ? D.T : 8;
    { // level
      const f = axes($('cvPnLevel'), { x: [0, T], y: [-5, 70], xt: [0, 2, 4, 6, 8], yt: [0, 20, 40, 60], xl: 'Time, s', yl: 'Pool level above the crest, mm' });
      const { ctx, d, C, X, Y } = f;
      const line = (pts, col, dash, wdt) => { ctx.strokeStyle = A.rgba(col); ctx.lineWidth = (wdt || 2) * d; ctx.setLineDash((dash || []).map((v) => v * d)); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(X(q.t), Y(q.z * 1000)) : ctx.moveTo(X(q.t), Y(q.z * 1000)))); ctx.stroke(); ctx.setLineDash([]); };
      if (D) {
        line(D.truth, C.muted, [3, 3], 1.5);
        if (DATA[S.kind].cut) { ctx.fillStyle = A.rgba(C.muted, 0.12); ctx.fillRect(X(DATA[S.kind].cut), f.padT, X(T) - X(DATA[S.kind].cut), f.h); }
        ctx.fillStyle = A.rgba(C.ink, 0.75); D.obs.forEach((q) => { ctx.beginPath(); ctx.arc(X(q.t), Y(q.z * 1000), 2.4 * d, 0, 2 * Math.PI); ctx.fill(); });
        if (S.ls) line(S.ls.curve, C.solid, [6, 4]);
        if (S.plain) line(S.plain.curve, C.bad, [2, 3]);
        if (S.pinn) line(S.pinn.curve, C.accent, [], 2.6);
      } else { ctx.fillStyle = A.rgba(C.muted); ctx.textAlign = 'center'; ctx.font = A.font(11); ctx.fillText('Train the network to see the readings and the fits', f.padL + f.w / 2, f.padT + f.h / 2); }
      legend(f, [['readings', C.ink, null, true], ['truth (hidden)', C.muted, [3, 3]], ['physics-informed', C.accent], ['readings only', C.bad, [2, 3]], ['least squares', C.solid, [6, 4]]]);
    }
    { // coefficients during training
      const f = axes($('cvPnCoef'), { x: [0, EPOCHS], y: [0, 2.2], xt: [0, 250, 500, 750, 1000], yt: [0, 0.5, 1, 1.5, 2], yf: (v) => v.toFixed(1), xl: 'Training epoch', yl: 'Coefficient' });
      const { ctx, d, C, X, Y, padL, w } = f;
      const hl = (v, col, txt) => { ctx.strokeStyle = A.rgba(col, 0.8); ctx.setLineDash([5 * d, 4 * d]); ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + w, Y(v)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = A.rgba(col); ctx.font = A.font(10); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, padL + w - 4 * d, Y(v) - 2 * d); };
      if (D) { hl(D.Cw, C.bad, `hidden weir coefficient ${fmt(D.Cw, 2)}`); hl(D.CwModel, C.muted, `model default ${fmt(D.CwModel, 1)}`); }
      const H = S.hist; if (H.length) {
        [['Cw', C.accent], ['tau', C.clean]].forEach(([k, col]) => { ctx.strokeStyle = A.rgba(col); ctx.lineWidth = 2.4 * d; ctx.beginPath(); H.forEach((q, i) => (i ? ctx.lineTo(X(q.ep), Y(q[k])) : ctx.moveTo(X(q.ep), Y(q[k])))); ctx.stroke(); });
      }
      legend(f, [['weir coefficient', C.accent], ['time on the wall, s', C.clean]]);
    }
  }
  $('pnRun').addEventListener('click', () => run());
  document.addEventListener('flushaitab', (e) => { if (e.detail === 'aiPinn') requestAnimationFrame(draw); });
  ['cvPnLevel', 'cvPnCoef'].forEach((id) => new ResizeObserver(() => requestAnimationFrame(draw)).observe($(id)));
  new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.FlushPinnUI = { run, busy: () => S.running, result: () => S, show: () => { const b = document.querySelector('[data-aitab="aiPinn"]'); if (b) b.click(); } };
})();
