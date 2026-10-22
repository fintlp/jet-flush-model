/* The savings calculator: "What would it save in your team?". Renders into every element with data-value-calc,
   on the simulator page and the why page. The reader enters the figures; a button fills in example values, each
   with its source. The iteration counts come from the stored races of the engineering challenge (value-core.js).
   Nothing entered here is stored or sent anywhere. */
(function () {
  'use strict';
  const V = window.FlushValue;
  if (!V) return;
  const st = V.stats();
  const hosts = Array.from(document.querySelectorAll('[data-value-calc]'));
  if (!st || !hosts.length) return;

  const css = `
.vc{display:grid;gap:14px;max-width:900px;margin-top:16px}
.vc-in{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:760px){.vc-in{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:460px){.vc-in{grid-template-columns:minmax(0,1fr)}}
.vc-in label{display:grid;grid-template-rows:1fr auto;gap:4px;font-size:13px;color:var(--muted)}
.vc-in input{font:inherit;font-size:15px;color:var(--ink);background:var(--raised);border:1px solid var(--line-strong);border-radius:8px;padding:7px 9px;min-width:0;width:100%;min-height:36px}
.vc-in input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.vc-in .opt{font-size:12px}
.vc-btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.vc-btns .btn{min-height:36px}
.vc-src{font-size:13px;color:var(--muted);margin:0;max-width:80ch}
.vc-src ul{margin:4px 0 0;padding-left:18px}
.vc-out{display:grid;gap:10px}
.vc-grp{background:var(--raised);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.vc-grp h4{margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500}
.vc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;padding:6px 0;border-top:1px solid var(--line);align-items:baseline}
.vc-row:first-of-type{border-top:0}
.vc-row b{font-variant-numeric:tabular-nums;font-size:17px;text-align:right;white-space:nowrap}
.vc-row .vc-f{grid-column:1 / -1;font-family:var(--f-mono);font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.vc-row.big b{font-size:22px;color:var(--accent)}
.vc-empty{font-size:13.5px;color:var(--muted);margin:0}
.vc-note{font-size:13px;color:var(--muted);margin:0;max-width:80ch}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const f1 = (v) => { const x = Math.round(v * 10) / 10; return x.toLocaleString('en', { maximumFractionDigits: 1 }); };
  const eur = (v) => `${Math.round(v).toLocaleString('en')} €`;
  const it = (v) => `${f1(v)} ${Math.abs(v) === 1 ? 'iteration' : 'iterations'}`;
  const dd = (v) => `${f1(v)} working ${Math.abs(v) === 1 ? 'day' : 'days'}`;
  const FIELDS = [
    { k: 'days', label: 'Working days per iteration', hint: 'set up, run, evaluate, decide', step: '0.5', max: 365 },
    { k: 'hours', label: 'Person hours per iteration', hint: 'all people together', step: '1', max: 10000 },
    { k: 'rate', label: 'Cost per person hour, €', hint: '', step: '1', max: 10000 },
    { k: 'run', label: 'Computing and licences per run, €', hint: 'optional, empty counts as 0', step: '10', max: 1e7 },
    { k: 'perYear', label: 'Design questions like this a year', hint: '', step: '1', max: 10000 },
    { k: 'weeks', label: 'Effort to build and calibrate a fast model, person weeks', hint: 'optional', step: '1', max: 10000 }
  ];
  const E = V.EXAMPLES;
  const EXLIST = [
    [`${E.days.v} working day per iteration`, E.days.src],
    [`${E.hours.v} person hours per iteration`, E.hours.src],
    [`${E.rate.v} € per person hour`, E.rate.src],
    ['Computing and licences left empty', E.run.src],
    [`${E.perYear.v} design questions a year`, E.perYear.src],
    ['Effort to build a fast model left empty', E.weeks.src]
  ];
  const insts = [];

  function render(host, n) {
    const p = `vc${n}-`;
    host.classList.add('vc');
    host.innerHTML = `
<div class="vc-in">${FIELDS.map((f) => `<label for="${p}${f.k}"><span>${f.label}${f.hint ? ` <span class="opt">(${f.hint})</span>` : ''}</span><input type="number" inputmode="decimal" id="${p}${f.k}" data-k="${f.k}" min="0" max="${f.max}" step="${f.step}"></label>`).join('')}</div>
<div class="vc-btns"><button class="btn primary" type="button" data-act="ex">Fill in example values</button><button class="btn" type="button" data-act="clear">Clear</button></div>
<div class="vc-src" data-role="src" hidden>Example values, replace them with your own:<ul>${EXLIST.map((x) => `<li><b>${x[0]}:</b> ${x[1]}.</li>`).join('')}</ul></div>
<div class="vc-out" data-role="out" aria-live="polite"></div>
<p class="vc-note">The iteration counts are fixed: they come from the <a href="${location.pathname.endsWith('why.html') ? './' : ''}#challenge">engineering challenge</a>, eight starts of one synthetic design task with five settings. The typical project needs ${f1(st.medClassic)} iterations with an automated one-change-at-a-time search and ${f1(st.medAi)} with the fast model and a learned correction, so the calculator counts <b>${f1(st.perProject)} fewer</b> per design question. Race by race the saving ranged from ${st.minSaved < 0 ? '−' + -st.minSaved : st.minSaved} to ${st.maxSaved} (median ${f1(st.medSaved)}, average ${Math.round(st.meanSaved * 100) / 100}). Time to market, which is often worth more than the hours, is not priced in. Nothing you enter leaves this browser.</p>`;
    const I = (k) => host.querySelector(`[data-k="${k}"]`);
    const vals = () => Object.fromEntries(FIELDS.map((f) => [f.k, I(f.k).value]));
    function update() {
      const o = V.compute(vals(), st), g = o.given, out = host.querySelector('[data-role="out"]');
      const row = (lab, val, fml, big) => `<div class="vc-row${big ? ' big' : ''}"><span>${lab}</span><b>${val}</b>${fml ? `<span class="vc-f">${fml}</span>` : ''}</div>`;
      let h = `<div class="vc-grp"><h4>Per design question</h4>${row('Expensive iterations saved', it(o.k), `${f1(st.medClassic)} − ${f1(st.medAi)} = ${f1(o.k)} (typical project of each route)`)}`;
      h += o.daysPerQ != null ? row('Working days saved', dd(o.daysPerQ), `${f1(o.k)} × ${f1(g.d)} ${g.d === 1 ? 'day' : 'days'} = ${f1(o.daysPerQ)}`, true) : '';
      h += o.costPerQ != null ? row('Cost saved', eur(o.costPerQ), o.partialCost ? `${f1(o.k)} × ${eur(g.c)} per run (no person hours entered)` : `${f1(o.k)} × (${f1(g.h)} h × ${eur(g.r)} + ${eur(g.c)}) = ${f1(o.k)} × ${eur(o.costPerIter)}`, true) : '';
      if (o.daysPerQ == null && o.costPerQ == null) h += `<p class="vc-empty">Enter working days, or person hours and a cost per hour, to see what one design question saves.</p>`;
      h += '</div>';
      if (g.q != null) {
        h += `<div class="vc-grp"><h4>Per year, ${f1(g.q)} design ${g.q === 1 ? 'question' : 'questions'}</h4>${row('Expensive iterations saved', it(o.itersPerYear), `${f1(o.k)} × ${f1(g.q)} = ${f1(o.itersPerYear)}`)}`;
        if (o.daysPerYear != null) h += row('Working days saved', dd(o.daysPerYear), `${f1(o.daysPerQ)} × ${f1(g.q)} = ${f1(o.daysPerYear)}, about ${f1(o.monthsPerYear)} months at ${V.DAYS_PER_MONTH} working days a month`, true);
        if (o.costPerYear != null) h += row('Cost saved', eur(o.costPerYear), `${eur(o.costPerQ)} × ${f1(g.q)} = ${eur(o.costPerYear)}`, true);
        h += '</div>';
      }
      if (o.breakEven != null) {
        h += `<div class="vc-grp"><h4>Break-even</h4>${row('A fast model pays for itself within a year if building and calibrating it costs less than', eur(o.breakEven), 'the cost saved per year', true)}`;
        if (o.buildCost != null) h += row(`Building and calibrating it, ${f1(g.w)} person ${g.w === 1 ? 'week' : 'weeks'}`, eur(o.buildCost), `${f1(g.w)} × ${V.HOURS_PER_WEEK} h × ${eur(g.r)} = ${eur(o.buildCost)}`) + (o.paybackMonths != null ? row('Paid back after', `${f1(o.paybackMonths)} months`, `${eur(o.buildCost)} ÷ (${eur(o.costPerYear)} ÷ 12 months)`, true) : '');
        h += '</div>';
      } else if (g.q == null && (o.costPerQ != null)) h += `<p class="vc-empty">Enter how many design questions like this you have a year to see the yearly saving and the break-even budget.</p>`;
      out.innerHTML = h;
    }
    host.addEventListener('input', update);
    host.querySelector('[data-act="ex"]').addEventListener('click', () => fill(true));
    host.querySelector('[data-act="clear"]').addEventListener('click', () => fill(false));
    function fill(ex) {
      FIELDS.forEach((f) => { const e = V.EXAMPLES[f.k]; I(f.k).value = ex && e.v ? e.v : ''; });
      host.querySelector('[data-role="src"]').hidden = !ex;
      update();
    }
    update();
    const api = { fill, update, values: vals, set: (k, v) => { I(k).value = v; update(); }, result: () => V.compute(vals(), st), el: host };
    insts.push(api);
  }
  hosts.forEach(render);
  // short figures in the text around a calculator (simulator page)
  const short = { cl: f1(st.medClassic), ai: f1(st.medAi), per: `${f1(st.perProject)} fewer`, days: `${f1(st.perProject)} working days` };
  document.querySelectorAll('[data-vv]').forEach((e) => { const t = short[e.dataset.vv]; if (t != null) e.textContent = t; });
  window.FlushValueUI = { stats: () => st, all: () => insts, first: () => insts[0] };
})();
