# Tangential Jet Flush Model

A fast model of how a rimless toilet flushes. Rim jets wash the bowl, swirl the pool and carry waste through the trap. Each flush computes in milliseconds in the browser, so you can change the design and see the effect on cleaning, waste removal, water use and relative noise right away. An AI lab searches for better designs and shows how the model would be trained and calibrated with PreonLab.

- **Live simulator:** https://fintlp.github.io/jet-flush-model/
- **Guided demo:** https://fintlp.github.io/jet-flush-model/#demo
- **How the model works:** https://fintlp.github.io/jet-flush-model/method.html
- **Sources and references:** https://fintlp.github.io/jet-flush-model/sources.html
- **Why we built this:** https://fintlp.github.io/jet-flush-model/why.html
- **Slides:** [PowerPoint](slides/jet-flush-model.pptx) (with videos) · [PDF](slides/jet-flush-model.pdf)

![Flush playback: bowl from above and section](media/playback.png)

> **Status.** The model is physics-based, but its coefficients are not yet calibrated against CFD or rig data. Use the results to compare designs and to see which way a change pushes the result, not as validated values.
>
> **Scope.** Splashing, jets hitting each other and spill-over are not modelled, so the model cannot say whether a design splashes; it only flags a pool that reaches the rim. The AI lab uses a conventional neural surrogate, not a physics-informed network (PINN), and its calibration demo runs on synthetic data. The presets are generic EU washdown and siphonic bowls, not modelled on any manufacturer's product. Nothing here replaces CFD or tests.

## What it does

The simulator answers three questions for a given bowl and flush design, in this order:

1. **Cleaning:** how much of the bowl wall above the waterline gets enough wall shear from the jet films to count as cleaned.
2. **Waste removal:** how much of a solid test load and of floating paper leaves through the trap.
3. **Water use:** how much water the flush takes, and whether the water seal is restored.

A fourth result, **noise**, is an experimental, relative indicator in dB against a reference design: louder or quieter, and which part of the flush makes the noise (jet films entering the pool, water falling into the outlet, an air core reaching the trap, or the siphon break). Every noise result comes with a sampled range over five assumed coefficients, and a direction is only shown when the whole sampled range agrees. It is not a sound level, it is not yet checked against recordings, and it leaves out the cistern, valves, pipes and building. See [section 10 of the model description](https://fintlp.github.io/jet-flush-model/method.html#noise).

It splits the flush into simple physical sub-models: cistern, rim jets, wall film on an oval bowl, pool level and swirl, washdown or siphonic trap, and waste transport. One flush takes about 5 to 20 ms in a browser; a free-surface CFD case of a flush typically runs for hours.

## Quick start

1. Open the [live simulator](https://fintlp.github.io/jet-flush-model/) and press **Demo me** for a one-minute guided tour.
2. Pick a preset (EU washdown 4.5/3 L, or siphonic 4.8 L plus 0.6 L bowl refill) and change the bowl and jets with the sliders. Each slider has an **i** button that explains it.
3. Press **Play flush** and read the result cards. Green and red chips show how much each change helped or hurt.
4. Use **Undo**, **Reset** and **Pin as reference** to compare designs.
5. In the **AI lab**, let the optimiser find better settings, or give it targets such as "at most 4.0 L and at least 90 % cleaned".

On a phone, the sliders open from the **Adjust design** button at the bottom.

## Page tools

| Tool | What it shows |
|---|---|
| Bowl from above | Jet films, cleaned wall areas, pool swirl and waste media during the flush |
| Section | Cistern, bowl level, weir and trap, with vertical positions to scale |
| Result cards | Cleaning, waste removal, water use and relative noise, with changes against the previous design or a pinned reference |
| Flush traces | Flow in and out, bowl level, pool swirl, load left and noise level over time, with air core and siphon events; click to jump to a moment |
| Wall cleaning map | The bowl wall unrolled, showing dry, wetted and cleaned areas |
| Design sweep | A 12 × 12 heat map of one result over two settings; click a cell to load that design |
| AI lab | Design optimiser, neural surrogate and hybrid calibration, all running in the browser |

## AI lab

- **Design optimiser:** an evolutionary multi-objective search (NSGA-II style). You choose which jet, flush and bowl geometry settings may change, then either trade a weighted score against water or set targets it must meet, including an optional noise limit such as "no louder than now". About 540 designs take about 4 to 7 seconds, and every recommendation and table row it reports is re-checked at the simulator's own resolution; the other points in its chart are quick estimates.
- **Neural surrogate:** a small neural network trained in the browser on a few hundred flushes. It answers about 1,000 to 2,000 times faster than the physics model. This stands in for training a network on PreonLab runs.
- **Hybrid calibration:** the calibration workflow end to end. Six coefficients are fitted with Nelder-Mead to a few reference runs, a Gaussian process corrects what is left, and all versions are checked on hold-out designs. The reference data is synthetic and labelled as such.

![Design optimiser: simulated designs, best trade-off and best design meeting the targets](media/ai-optimiser-chart.png)

Details are in [section 14 of the model description](https://fintlp.github.io/jet-flush-model/method.html#ailab).

## Run it locally

The page is static HTML and JavaScript with no build step and no dependencies apart from web fonts.

```bash
git clone https://github.com/fintlp/jet-flush-model.git
cd jet-flush-model
python3 -m http.server 8000
# open http://localhost:8000
```

The model also runs on its own in Node.js:

```js
require('./model.js');
const M = globalThis.FlushModel;
const p = M.defaults('washdown');      // or 'siphonic'
p.ovality = 1.3; p.jetPhase = 90;
const r = M.simulate(p, { light: true });
console.log(r.cleanPct, r.solidsPct, r.paperPct, r.water);
```

`simulate(p, opts)` takes the same parameters as the sliders. Options: `light` skips the time traces, `coarse` uses the looser wall film retrace tolerance of the sweep and the optimiser search, `filmTol` sets that tolerance (0 retraces at every time step, the reference for the checks), `Tend` sets the simulated time in seconds.

## Files

| File | Contents |
|---|---|
| `index.html` | The simulator page |
| `model.js` | The physics model: geometry, cistern, wall film, pool, trap, waste |
| `app.js` | Drawing, controls, sweep, undo and change tracking; no physics |
| `ai.js` | AI lab: optimiser, neural network, Nelder-Mead, Gaussian process |
| `checks/` | Deterministic scripts: regression against another model version, film update resolution, noise range |
| `tour.js` | The Demo me walkthrough |
| `method.html` | Full model description: equations, numerics, coefficients, calibration |
| `sources.html` | Sources and references |
| `why.html` | Why we built this: faster loops from idea to engineering to manufacturing |
| `media/` | Video of a flush (`flush-playback.mp4`), a recorded Demo me walkthrough (`demo-walkthrough.mp4`) and stills of each view and of the AI lab |
| `slides/jet-flush-model.pptx`, `.pdf` | Three slides with embedded videos, key results and links; each slide carries the author, the repository link and the date |

## Calibration

The coefficients that describe physics the model does not resolve (film friction, spreading, soil shear threshold, swirl transfer, transport thresholds and others) are fitted to a few reference runs. The procedure, the order of fitting and which measurement or CFD output to use for each coefficient are in [section 13 of the model description](https://fintlp.github.io/jet-flush-model/method.html#calibration). PreonLab is a good candidate for the reference runs; its fit for paper and other flexible media should be checked in a benchmark first.

## Change log

### 2.0.0 · in preparation

Version 2.0 changes model results. Work in progress on branch `dev-2.0`; this entry grows with each phase. Many of the changes come from an independent physics review of the branch.

**Wall film**

- **Film enters the pool where its lower edge meets the waterline.** Each jet is still one spreading band, but the share of its width below the waterline now enters the pool there, with its flow, swirl and splash; the band left on the wall is re-centred on what remains. Before, the whole film entered where its centreline reached the waterline, so a tiny change in jet speed or pool level could switch the film between entering on its first dip and circling once more, and the pool swirl jumped (in the washdown preset by about 15 % at 2.7 s). Flow that stalls on the wall or is still there after 3 m of path counts as lost and brings no swirl or splash (`filmLostPct`).
- **Film tracer integrates correctly.** The speed comes from the energy balance over each step (gravity work minus friction work), the position uses the mean of old and new velocity, and the velocity is turned into the new tangent plane instead of being cut and rescaled. Without friction a film now keeps its energy and its angular momentum about the bowl axis; in 1.3 it lost up to about a fifth of its kinetic energy over 3 m and was steered downwards. A film that climbs back to the rim loses its upward speed at the rim lip.
- **Film takes time to reach the pool.** Water on the wall is a store that tends to nozzle flow times the films' mean travel time; nothing arrives before the film front, and the wetted area grows with the front when the flush starts. In the washdown preset about 1 L is on the wall during the flush and the first water reaches the pool after about 0.5 s. Before, all jet flow reached the pool in the step it left the nozzle.
- **Film traced when the flow changes, not on a fixed clock**, when jet speed or pool level has changed by more than 3 % or 3 mm, and at least every 0.25 s (10 %, 10 mm, 0.6 s in the sweep and the optimiser search). The shear dose of each interval is the mean of the footprints at its start and end. Against retracing at every step, cleaning differs by 0.7 points at the 95th percentile (1.3: 1.8 points at 100 ms); the worst known case, a short strong flush, gives 51.2 % against 49.9 % (1.3: 43 % against 35 %) (`checks/resolution.js`).
- **Cleaning map counts cells by their centres.** A wall cell counts as covered when its centre lies inside the rectangle a film step sweeps, worked out in wall coordinates. Cleaning now converges as the grid is refined: on the 90 × 40 grid it is within about 0.2 points (median) and 0.9 points (worst) of a grid four times finer with a 1 mm film step. The old any-touch counting overstated cleaning by about 2 points on average and up to about 5.
- **Rim line measured at exactly 25 mm depth**, weighted by length round the bowl on oval bowls. Before, the row was chosen 25 mm along the wall.
- Nozzle width above the rim is folded onto the wall, so a wide nozzle loses no flow above the rim.

**Cistern, pool and siphon**

- **Partial flush from a full cistern.** A partial flush now releases its volume from a full cistern, as a dual-flush valve does, so its head and jet speed start at the full-flush values (siphonic partial flush: 70.5 to 85.1 % cleaned).
- **Siphon break.** The pool level stops exactly at the trap inlet when the siphon breaks (before, it overshot by up to 29 mm and a floor clamp could create water); the draw-down is sub-stepped, so level, break time and spin-up do not depend on the time step. The siphon may prime again, and the break gurgle only sounds while it is broken.
- **Refill simulated.** The bowl refill runs in at 0.1 L/s once the valve has closed, so the pool level trace ends at the reported seal.
- **Pool inertia integrated over the narrowing basin.** It was 1.6 to 1.8 times too high, so swirl came out too low and the vortex dip too small. Peak swirl and dip are reported while the trap carries flow.
- The last, capped step of a flush no longer triggers a film trace with its arbitrary small flow; that trace had set how fast the wall water drained and made siphonic results depend on the time step.

**Checks**

- **New `checks/physics.js`, 58 checks with pass limits:** conservation and balance (energy and angular momentum of a frictionless film, water balance, physical ranges, smoothness of swirl and main results with refinement that tells jumps, steep slopes and time-step jitter apart); closed-form cases (cistern drain, steady weir level, level table, film on a vertical cylinder, paper decay); Runge-Kutta re-integration of pool level and swirl; and the checks proposed by the review (spatial convergence, siphon break, time step down to 1 ms, partial flush head, film front, monotone waste trends, round-bowl symmetry, rim line depth). `--strict` makes known open issues fail. All pass.

**Effect on results**, 300 random designs against 1.3.1: cleaning +1.9 points in the median (5 % lose more than 4.8 points, 5 % gain more than 20, mostly short, strong flushes); peak pool swirl +28 % in the median and the vortex dip about 12 mm deeper, mainly from the corrected pool inertia; solids and paper change little in most designs. Presets:

| Preset | Cleaned | Solids | Paper | Peak swirl | Vortex dip | Seal |
|---|---|---|---|---|---|---|
| Washdown, full | 87.6 → 86.5 % | 99.4 → 99.2 % | 90.0 → 89.9 % | 0.64 → 0.84 m/s | 21 → 36 mm | 55 mm |
| Washdown, partial | 87.5 → 86.5 % | 93.3 → 93.4 % | 71.4 → 73.0 % | 0.57 → 0.84 m/s | 16 → 36 mm | 55 mm |
| Siphonic, full | 96.1 → 89.9 % | 98.9 → 98.7 % | 87.3 → 89.5 % | 0.77 → 1.09 m/s | 30 → 60 mm | 54 → 60 mm |
| Siphonic, partial | 70.5 → 85.1 % | 93.5 → 95.0 % | 69.2 → 78.7 % | 0.65 → 0.84 m/s | 22 → 36 mm | 55 → 48 mm |

Model description: corrected angular momentum statement; new subsections on integration, film entry and transit; partial flush, siphon break, refill, pool inertia, cleaning map, numerics and resolution notes; noise figures for the presets updated; published bowl data (water surface, volume at rest, seal) compared with the presets; new limits.

### 1.3.1 · 20 October 2026

Patch release with fixes from an independent review of 1.3.0. Model results are unchanged.

- The preset menu always matches the trap type, also after Undo, the demo or the trap type buttons, so Reset returns to the right preset. Switching a washdown design to siphonic sets a bowl refill when none was set, so the seal is restored.
- The pool radius now always stays at least 25 mm smaller than the rim radius, as in the AI lab: the slider being moved stops at that gap, and design sweep cells that break it are hatched and not simulated. Before, an equal rim and pool radius made the bowl wall vanish from the top view.
- Demo me leaves no undo steps or changed comparison chips behind. Keep this design adds one undo step back to your own design. A demo closed and reopened during the AI search no longer shows the old search message.
- Loading a sweep cell, Reset or an AI result right after moving a slider keeps the slider change as its own undo step.
- The pinned reference is recomputed with the current model and noise coefficients, so changing a coefficient no longer shows a change for an unchanged design.
- AI lab: the optimiser checks a noise limit against the current design too (it reads 0 dB against itself), and refuses to start from a design that breaks the rim gap when neither radius is searched. The surrogate readout says it is for a full flush and notes when the simulator is set to a partial flush; the partial flush volume no longer marks the surrogate or the calibration as out of date.
- Links from the simulator page to the other pages and the slides are relative, so a local or branch copy opens its own pages. The siphonic preset is labelled 4.8 L + 0.6 L refill, matching the 5.4 L water use it reports. Page descriptions mention relative noise.
- Slides, walkthrough video and stills are unchanged from 1.3.0 and still carry that version; the results they show, including the Demo me result of 87 % cleaning at 4.0 L, are the same in 1.3.1.

### 1.3.0 · 20 October 2026

- Noise indicator, experimental: a fourth result card with the peak noise in dB against the preset, or against the pinned reference when one is set, its range over five assumed coefficients, sound energy, which source makes the peak and which makes most of the energy, when an air core reaches the trap and the siphon break gurgle.
- Four sources, each written as a flow of air into the water: jet films entering the swirling pool, water falling into the outlet, an air core at the trap (Rankine vortex with the pool's angular momentum) and the siphon break.
- Noise trace with uncertainty band and air core shading, noise in the design sweep, and a noise limit (upper end of the range) and "quietest" pick in the optimiser. The Demo me walkthrough reports noise and asks for "no louder than now".
- Fixes from four external reviews, including two in 1.2.0: the optimiser's finished recommendations come only from designs checked at full resolution, also after targets or weights change (results being re-checked are greyed out meanwhile); while a search runs, its table shows quick estimates, labelled as such; a new search cancels any running search or check; each result can only be loaded with the settings of the search it came from. A sweep is marked out of date when settings change while it runs. Pinning updates the noise trace too, and the demo sets a pinned reference aside and runs its own search.
- `checks/` folder with deterministic scripts behind the quoted check figures: regression against another model version, film update resolution, time step, preset figures, noise range and run time.
- Model description: section 10 on noise, and a note on the resolution of the film updates. New sources on bubble acoustics, air entrainment and intake vortices.

### 1.2.0 · 20 October 2026

Includes all of 1.1.0, which was not published as a separate release.

- The Demo me walkthrough no longer leaves its oval demo bowl behind. **Finish** now brings your own design back; only **Keep this design** keeps the demo result. Nothing is remembered while the walkthrough runs, so closing the tab mid-demo is safe too.
- When the page opens with a remembered design that differs from its preset, a note says so and offers **Reset to preset**.

### 1.1.0 · 19 October 2026

Fixes from an external review, and clearer scope. Not published as a separate release; included in 1.2.0.

- Slow flushes now run to completion, up to 60 s, and the playback follows; a flush that does not finish is marked incomplete. Water use counts the water actually released.
- A pool that reaches the rim is detected as an overflow; spilled water is counted and the results are marked not valid.
- A water seal below 50 mm is now always flagged, also when the seal depth itself is set below 50 mm, as the documentation says.
- AI lab results notice when settings they did not vary have changed, say they are for the earlier configuration, and compare against the current settings. The optimiser never counts overflowing or unfinished designs as solutions; the sweep marks them with a red cross. The optimiser re-checks the designs it reports at the simulator's own resolution, so its numbers match the page.
- Every result card is labelled as an estimate. Scope statements on splashing, the kind of AI used and generic presets added to all pages. Calibration and speed claims softened to what is actually shown.

### 1.0.0 · 19 October 2026

First public release.

- Interactive simulator of a rimless WC flushed by tangential rim jets: oval bowl, jet films, pool swirl, washdown or siphonic trap, waste transport, design sweep.
- AI lab: design optimiser with free choice of variables and targets, neural surrogate trained in the browser, hybrid calibration demo.
- Usability: Start here strip, section menu, Undo, Reset, Pin as reference, change chips, help for every slider, phone drawer, and the Demo me walkthrough (`#demo` link).
- Documentation: model description, sources and references, "Why we built this" page, this README.
- Media and slides: flush video, recorded walkthrough, stills, three slides as PowerPoint and PDF.

### Development history, 19 October 2026

- **0.9** "Why we built this" page; slide links on all pages.
- **0.8** Full documentation: README, page tools, version history, new stills, walkthrough video, two more slides, author line on every slide.
- **0.7** Usability features and the Demo me walkthrough.
- **0.6** Optimiser: choose what may change, meet targets, thorough search.
- **0.5** AI lab with optimiser, neural surrogate and hybrid calibration; new intro.
- **0.4** Sources and references page.
- **0.3** Oval bowls and jet position; model description page.
- **0.2** Contact link.
- **0.1** First version: simulator, flush video, stills and slide.

## Name

"Tornado Flush" is a TOTO trademark. This project uses the neutral, descriptive name "tangential jet flush" and is not affiliated with any manufacturer.

## Licence

MIT, see [LICENSE](LICENSE). Copyright 2026 Peter Fintl.

Contact: [fintlp.github.io](https://fintlp.github.io/latest-news/#contact)
