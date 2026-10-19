# Tangential Jet Flush Model

A fast model of how a rimless toilet flushes. Rim jets wash the bowl, swirl the pool and carry waste through the trap. Each flush computes in milliseconds in the browser, so you can change the design and see the effect on cleaning, waste removal and water use right away. An AI lab searches for better designs and shows how the model would be trained and calibrated with PreonLab.

**Live simulator:** https://fintlp.github.io/jet-flush-model/
**Guided demo:** https://fintlp.github.io/jet-flush-model/#demo
**How the model works:** https://fintlp.github.io/jet-flush-model/method.html
**Sources and references:** https://fintlp.github.io/jet-flush-model/sources.html

![Flush playback: bowl from above and section](media/playback.png)

> **Status.** The model is physics-based, but its coefficients are not yet calibrated against CFD or rig data. Use the results to compare designs and to see which way a change pushes the result, not as validated values.

## What it does

The simulator answers three questions for a given bowl and flush design, in this order:

1. **Cleaning:** how much of the bowl wall above the waterline gets enough wall shear from the jet films to count as cleaned.
2. **Waste removal:** how much of a solid test load and of floating paper leaves through the trap.
3. **Water use:** how much water the flush takes, and whether the water seal is restored.

It splits the flush into simple physical sub-models: cistern, rim jets, wall film on an oval bowl, pool level and swirl, washdown or siphonic trap, and waste transport. One flush takes about 5 to 20 ms in a browser, thousands of times faster than a free-surface CFD case.

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
| Result cards | Cleaning, waste removal and water use, with changes against the previous design or a pinned reference |
| Flush traces | Flow in and out, bowl level, pool swirl and load left over time; click to jump to a moment |
| Wall cleaning map | The bowl wall unrolled, showing dry, wetted and cleaned areas |
| Design sweep | A 12 × 12 heat map of one result over two settings; click a cell to load that design |
| AI lab | Design optimiser, neural surrogate and hybrid calibration, all running in the browser |

## AI lab

- **Design optimiser:** an evolutionary multi-objective search (NSGA-II style). You choose which jet, flush and bowl geometry settings may change, then either trade a weighted score against water or set targets it must meet. About 540 designs take 3 to 5 seconds.
- **Neural surrogate:** a small neural network trained in the browser on a few hundred flushes. It answers about 1,000 to 2,000 times faster than the physics model. This stands in for training a network on PreonLab runs.
- **Hybrid calibration:** the calibration workflow end to end. Six coefficients are fitted with Nelder-Mead to a few reference runs, a Gaussian process corrects what is left, and all versions are checked on hold-out designs. The reference data is synthetic and labelled as such.

![Design optimiser: simulated designs, best trade-off and best design meeting the targets](media/ai-optimiser-chart.png)

Details are in [section 13 of the model description](https://fintlp.github.io/jet-flush-model/method.html#ailab).

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
| `media/` | Video of a flush (`flush-playback.mp4`), a recorded Demo me walkthrough (`demo-walkthrough.mp4`) and stills of each view and of the AI lab |
| `slides/jet-flush-model.pptx` | Three slides with embedded videos, key results and links; each slide carries the author, the repository link and the date |

## Calibration

The coefficients that describe physics the model does not resolve (film friction, spreading, soil shear threshold, swirl transfer, transport thresholds and others) are fitted to a few reference runs. The procedure, the order of fitting and which measurement or CFD output to use for each coefficient are in [section 12 of the model description](https://fintlp.github.io/jet-flush-model/method.html#calibration). PreonLab is a good candidate for the reference runs; its fit for paper and other flexible media should be checked in a benchmark first.

## Change log

All changes on 19 October 2026.

- **4.1** Full documentation: this README, a section on the page tools, version history, new stills, a recorded Demo me walkthrough, two more slides, and your name, the repository link and the date on every slide.
- **4.0** Usability: Start here strip, section menu, Undo, Reset, Pin as reference, change chips on all results, help for every slider, phone drawer, and the Demo me walkthrough with a `#demo` link.
- **3.1** Optimiser: choose which settings may change, including bowl geometry, number of jets and partial flush; meet targets; thorough search option.
- **3.0** AI lab with design optimiser, neural surrogate and hybrid calibration; new intro text.
- **2.1** Sources and references page.
- **2.0** Oval bowls and jet position, wall film traced on the oval wall, full model description page.
- **1.1** Contact link.
- **1.0** First release: simulator, flush video, stills and slide.

## Name

"Tornado Flush" is a TOTO trademark. This project uses the neutral, descriptive name "tangential jet flush" and is not affiliated with any manufacturer.

## Licence

MIT, see [LICENSE](LICENSE). Copyright 2026 Peter Fintl.

Contact: [fintlp.github.io](https://fintlp.github.io/latest-news/#contact)
