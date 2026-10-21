/* What a faster design loop is worth: the figures of the why page and the savings calculator, computed from the
   eight stored races of the engineering challenge (challenge-data.js). No page code, so the checks and the slide
   builder use the same numbers as the pages.

   Units: an iteration is one high-fidelity run with everything around it (set up, run, evaluate, decide);
   8 working hours a day, 40 a week, 21 working days a month. */
(function (root) {
  'use strict';
  const HOURS_PER_DAY = 8, HOURS_PER_WEEK = 40, DAYS_PER_MONTH = 21;

  const median = (v) => { const s = v.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const sum = (v) => v.reduce((a, b) => a + b, 0);

  // figures of the challenge: iterations to target per race and route
  function stats(D) {
    D = D || root.FlushChallengeData;
    if (!D || !D.races || !D.races.length) return null;
    const tt = (k) => D.races.map((r) => r.routes[k].toTarget);
    const cl = tt('classic'), ai = tt('ai'), fa = tt('fast');
    if (cl.some((v) => v == null) || ai.some((v) => v == null)) return null;
    const saved = cl.map((c, i) => c - ai[i]);
    const mc = median(cl), ma = median(ai);
    return {
      n: cl.length, classic: cl, ai, fast: fa, saved,
      medClassic: mc, medAi: ma,
      perProject: mc - ma,                       // the headline: the typical project of each route
      medSaved: median(saved), meanSaved: sum(saved) / saved.length,
      minSaved: Math.min(...saved), maxSaved: Math.max(...saved),
      fewer: saved.filter((s) => s > 0).length, tie: saved.filter((s) => s === 0).length, more: saved.filter((s) => s < 0).length,
      sumClassic: sum(cl), sumAi: sum(ai), sumSaved: sum(saved),
      fastMiss: fa.filter((v) => v == null).length,
      challengeHoursPerRun: 8
    };
  }

  // example values for the calculator, each with where it comes from
  const EXAMPLES = {
    days: { v: 1, src: 'about one working day per design iteration in Geberit\'s CFD-led bowl development (CADFEM Journal)' },
    hours: { v: 8, src: 'one engineer for that working day' },
    rate: { v: 95, src: 'average hourly rate of freelance engineers in Germany, 95.07 € (freelancermap, February 2026); your internal cost per hour may be higher or lower' },
    run: { v: 0, src: 'no example, because these costs depend on your licences; for scale, the CFD run on this page took about 2 hours on 12 cores' },
    perYear: { v: 10, src: 'an example only, not a figure we measured' },
    weeks: { v: null, src: 'no example, because we have no measured figure for it; enter your own estimate, or leave it empty and use the break-even budget' }
  };

  const num = (x) => { if (x === '' || x == null) return null; const v = +x; return Number.isFinite(v) && v >= 0 ? v : null; };

  /* inp: days (working days per iteration), hours (person hours per iteration), rate (€ per person hour),
     run (€ computing and licence per run, empty = 0), perYear (design questions a year), weeks (person weeks to build
     and calibrate a fast model, optional). Returns what can be computed from what is given. */
  function compute(inp, st) {
    const d = num(inp.days), h = num(inp.hours), r = num(inp.rate), c = num(inp.run) || 0, q = num(inp.perYear), w = num(inp.weeks);
    const k = st.perProject;
    const out = { k, given: { d, h, r, c, q, w } };
    if (d != null) out.daysPerQ = k * d;
    if (h != null && r != null) { out.costPerIter = h * r + c; out.costPerQ = k * out.costPerIter; }
    else if (c) { out.costPerIter = c; out.costPerQ = k * c; out.partialCost = true; }
    if (q != null) {
      out.itersPerYear = k * q;
      if (out.daysPerQ != null) { out.daysPerYear = out.daysPerQ * q; out.monthsPerYear = out.daysPerYear / DAYS_PER_MONTH; }
      if (out.costPerQ != null) out.costPerYear = out.costPerQ * q;
    }
    if (out.costPerYear != null) out.breakEven = out.costPerYear;
    if (w != null && r != null) {
      out.buildCost = w * HOURS_PER_WEEK * r;
      if (out.costPerYear > 0) out.paybackMonths = out.buildCost / (out.costPerYear / 12);
    }
    return out;
  }

  const api = { HOURS_PER_DAY, HOURS_PER_WEEK, DAYS_PER_MONTH, median, stats, compute, EXAMPLES };
  root.FlushValue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
