# Physics review of dev-2.0 commit 852170c (20 October 2026)

Reviewer: a separate AI agent that had not seen the work; scope: model.js physics against method.html and sources.html. Verdict: fit for trend-level exploration of cleaning and jet layout in washdown bowls; not yet for siphonic swirl and seal, partial flushes, very short flushes, or washdown trapway size. Core mechanics (film integrator, cistern, weir, level table, wall cell areas, vortex factor, symmetry, units) confirmed solid.

Decisions by Peter Fintl (20 October): F5 try the coverage approach first, may cost more than 1.5x run time; F2 yes; F4 as proposed; F7 no data, search the web.

| ID | Severity | Finding | What was done (commits e7f7dff and 044b86b, 21 October 2026) |
|---|---|---|---|
| F1 | Major | Siphon break a step late, overshoot, water created by a floor clamp, 0.1 L inertia floor, spin-up | Fixed: outflow limited so the level stops at the inlet; floor clamp replaced by the outflow limit; sub-steps for the primed draw-down; refill simulated (0.1 L/s after the valve closes); re-prime bookkeeping; gurgle only while broken. The remaining siphonic swirl jitter came from the capped last flush step triggering a film trace; fixed |
| F2 | Major | Quasi-steady film feeds the pool instantly | Fixed: wall water store (tends to nozzle flow times mean travel time, none before the front), growing wetted front. A per-parcel delay buffer was tried first and dropped: retrace jumps in travel time made arrivals bunch |
| F3 | Major | Partial flush from a cistern holding only the partial volume | Fixed: full cistern, valve closes after the partial volume (siphonic partial 70.5 to 85.1 % cleaned against 1.3.1) |
| F4 | Major | Washdown waste transport uses full-bore velocity | Not changed: the rising trap leg up to the weir runs full in both bowl types, so Q/A_t is the right transport velocity there; only behind the weir does a washdown trapway run part full. Missing: the benefit of a larger passage for bulky waste. Documented in method section 9 |
| F5 | Major | Cleaning map not converged | Fixed: a cell counts when its centre lies inside the rectangle swept by a film step, in wall coordinates. The 90 x 40 grid is within 0.2 (median) and 0.9 (worst) points of 360 x 160 with a 1 mm step (old scheme 2.2 and 4.7 high) |
| F6 | Minor | Rim line row by arc length | Fixed: exact 25 mm depth, length-weighted on oval bowls |
| F7 | Minor | Pool inertia too high; pool volume looks low | Inertia fixed (integrated over the basin). Volume: US 8,438,670 B2 gives water surfaces of 115 to 131 cm2 for washdown (preset 121 cm2), 349 and 528 cm2 for siphonic (preset 201 cm2), and 1.5 L at rest in one washdown bowl incl. trapway (model 0.44 L). Geometry not changed; documented as a calibration item (method sections 4, 12, 16) |
| F8 | Minor | Folded band "thicker" text | Text fixed |
| F9 | Minor | Shear dose wording | Fixed (method section 3, numerics, model comment, README) |
| F10 | Minor | Stale preset figures in section 10 | Updated from checks/presets.js and checks/noise-range.js |
| F11 | Note | Oval-bowl swirl trend set by the assumed coefficient kov | Stated in method section 8 |
| F12 | Note | Various assumptions | Documented in method section 16 |

The reviewer's proposed checks were all added to checks/physics.js, section D (spatial convergence, siphon break, 1 ms time step, partial flush head, film front, monotone waste trends, round-bowl symmetry, rim line depth), plus --strict for known open issues.

Effect on results (300 random designs against 1.3.1): cleaning median +1.9 points (5th percentile -4.8, 95th +20); peak swirl +28 % in the median, vortex dip about 12 mm deeper (mainly the inertia fix); solids and paper change little in most designs.
