/* Recomputes one race of the engineering challenge off the page's main thread, so the page stays smooth.
   Message in: { race: i, v: version string for the script URLs }. Messages out: { progress: simulations so far },
   then { done: packed result, ms } or { error }. */
self.onmessage = (ev) => {
  const v = ev.data.v ? '?v=' + ev.data.v : '';
  try {
    if (!self.FlushModel) importScripts('model.js' + v, 'challenge-core.js' + v);
    const CH = self.FlushChallenge, M = self.FlushModel, t0 = Date.now();
    const g = CH.race(M, ev.data.race); let n = 0, s = g.next();
    while (!s.done) { n++; if (n % 20 === 0) self.postMessage({ progress: n }); s = g.next(); }
    self.postMessage({ done: s.value, ms: Date.now() - t0, sims: n });
  } catch (e) { self.postMessage({ error: String(e && e.message || e) }); }
};
