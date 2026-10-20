# Checks

Deterministic scripts behind the figures quoted in the model description. Run them from the repository root with Node.js 18 or later. Each script uses a fixed seed, so the numbers are the same on every run; the random designs are drawn uniformly over the simulator's slider ranges, as described in `lib.js`.

To compare with the released model, first get its code:

```bash
git fetch origin main
git show origin/main:model.js > /tmp/model-main.js
```

| Script | What it checks |
|---|---|
| `node checks/regression.js /tmp/model-main.js` | All results except noise are identical to the other model version. Exits with code 1 on any difference. The wall film changed in 2.0, so against a 1.x model this check fails by design; it is for comparing versions that should agree. |
| `node checks/resolution.js` | How much cleaning, rim line and noise depend on how often the jet films are retraced: simulator and coarse settings against retracing at every step, including the short, strong flush that was the worst case in 1.3 (section 11). Takes about two minutes. |
| `node checks/timestep.js` | How much results change when the time step is halved (section 11) |
| `node checks/presets.js` | Preset figures quoted in section 10: vortex dips, margins, air core and siphon break times, source shares, Gordon cross-check, siphonic against washdown |
| `node checks/noise-range.js` | Width of the sampled noise range, and interior coefficient values outside the corner range (section 10) |
| `node checks/timing.js /tmp/model-main.js` | Run time against the other model version; the quoted overhead is the ratio (section 11) |
| `node checks/browser.js` | The simulator page in a headless browser: presets and trap type, the 25 mm rim gap in sliders and sweep, undo and Demo me history, pinned reference, and AI lab details (30 checks, about two minutes). Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`. Exits with code 1 on any failure. |
