# Tangential Jet Flush Model

A fast model of how a rimless toilet flushes. Rim jets wash the bowl, swirl the pool and carry waste through the trap. Each flush computes in milliseconds in the browser, so you can change the design and see the effect on cleaning, waste removal and water use right away. An AI lab searches for better designs and shows how the model would be trained and calibrated with PreonLab.

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

A fourth result, **noise**, is an experimental, relative indicator in dB against a reference design: louder or quieter, and which part of the flush makes the noise (jet films entering the pool, water falling into the outlet, an air core reaching the trap, or the siphon break). Every noise result comes with a range over five assumed coefficients, and a direction is only shown when the whole range agrees. It is not a sound level, it is not yet checked against recordings, and it leaves out the cistern, valves, pipes and building. See [section 10 of the model description](https://fintlp.github.io/jet-flush-model/method.html#noise).

It splits the flush into simple physical sub-models: cistern, rim jets, wall film on an oval bowl, pool level and swirl, washdown or siphonic trap, and waste transport. One flush takes about 5 to 20 ms in a browser; a free-surface CFD case of a flush typically runs for hours.

## Quick start

1. Open the [live simulator](https://fintlp.github.io/jet-flush-model/) and press **Demo me** for a one-minute guided tour.
2. Pick a preset (EU washdown 4.5/3 L, or siphonic 4.8 L) and change the bowl and jets with the sliders. Each slider has an **i** button that explains it.
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

- **Design optimiser:** an evolutionary multi-objective search (NSGA-II style). You choose which jet, flush and bowl geometry settings may change, then either trade a weighted score against water or set targets it must meet, including an optional noise limit such as "no louder than now". About 540 designs take about 4 to 7 seconds, and every design it reports is re-checked at the simulator's own resolution.
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

`simulate(p, opts)` takes the same parameters as the sliders. Options: `light` skips the time traces, `coarse` updates the wall film every 200 ms instead of 100 ms, `Tend` sets the simulated time in seconds.

## Files

| File | Contents |
|---|---|
| `index.html` | The simulator page |
| `model.js` | The physics model: geometry, cistern, wall film, pool, trap, waste |
| `app.js` | Drawing, controls, sweep, undo and change tracking; no physics |
| `ai.js` | AI lab: optimiser, neural network, Nelder-Mead, Gaussian process |
| `tour.js` | The Demo me walkthrough |
| `method.html` | Full model description: equations, numerics, coefficients, calibration |
| `sources.html` | Sources and references |
| `why.html` | Why we built this: faster loops from idea to engineering to manufacturing |
| `media/` | Video of a flush (`flush-playback.mp4`), a recorded Demo me walkthrough (`demo-walkthrough.mp4`) and stills of each view and of the AI lab |
| `slides/jet-flush-model.pptx`, `.pdf` | Three slides with embedded videos, key results and links; each slide carries the author, the repository link and the date |

## Calibration

The coefficients that describe physics the model does not resolve (film friction, spreading, soil shear threshold, swirl transfer, transport thresholds and others) are fitted to a few reference runs. The procedure, the order of fitting and which measurement or CFD output to use for each coefficient are in [section 13 of the model description](https://fintlp.github.io/jet-flush-model/method.html#calibration). PreonLab is a good candidate for the reference runs; its fit for paper and other flexible media should be checked in a benchmark first.

## Change log

### 1.3.0 · preview, not released yet

- Noise indicator, experimental: a fourth result card with the peak noise in dB against the preset, or against the pinned reference when one is set, its range over five assumed coefficients, sound energy, which source makes the peak and which makes most of the energy, when an air core reaches the trap and the siphon break gurgle.
- Four sources, each written as a flow of air into the water: jet films entering the swirling pool, water falling into the outlet, an air core at the trap (Rankine vortex with the pool's angular momentum) and the siphon break.
- Noise trace with uncertainty band and air core shading, noise in the design sweep, and a noise limit (upper end of the range) and "quietest" pick in the optimiser. The Demo me walkthrough reports noise and asks for "no louder than now".
- Fixes from an external review, including two in 1.2.0: the optimiser re-checks every design it reports at full resolution, also after targets or weights change; a sweep is marked out of date when settings change while it runs. Pinning updates the noise trace too, and the demo sets a pinned reference aside.
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
