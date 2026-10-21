# Review of release candidate 2.0.0 (commit 37dc418, 21 October 2026)

Three independent reviews of the same commit, each read-only and given the same brief. Every finding was checked against the code and data before anything was changed; "holds" means the check confirmed it.

| Reviewer | Verdict | Checks run by the reviewer |
|---|---|---|
| ChatGPT, GPT-6.1 Sol, extra-high effort, in Codex (C) | yes, after named fixes; no blocker | regression, challenge (quick and full), pinn, field, physics --strict, literature, browser (82 checks, 1 failed: favicon) |
| Grok Bot (G) | yes, after named fixes; no blocker, 7 major | regression, challenge (quick and full), pinn, field, literature, physics --strict, browser (82 checks, 0 failed) |
| Grok web, "Expert" (W) | yes, fit to publish | regression, literature, pinn, field, challenge (full), physics |

All check results the reviewers reported matched our own runs on that commit.

## Findings and what was done

Found by more than one reviewer: C-07 = G-04 = W-01 (classic route), C-09 = G-08 (stale AI lab text), C-05 = G-02 (synthetic labels), C-04 relates to G-06 (CFD agreement).

| ID | Severity (reviewer) | Finding | Verdict | What was done |
|---|---|---|---|---|
| C-01 | Major | Splash noise averaged the velocities and entry points of all entering film parts before the nonlinear entrainment law; opposite jets cancelled | holds: at 1.00 s in the siphonic preset 0.274 m/s used against parcels up to 0.956 m/s; peak noise up to 3.75 dB off in 100 designs | Each entering part counts at its own speed relative to the pool; new physics checks D10a and D10b; noise figures in method section 10 updated; regression baseline renewed (only noise values changed) |
| C-02 | Major | Field surrogate divided reference maps by the fast model's cleaning dose (1.5, not 1.6 Pa s) | holds | Each map uses its own run's dose; new field check: every map's cleaned share equals the simulator's cleaning |
| C-03 | Minor | Field scores used round-bowl areas on the oval bowl | holds | The simulator's own cell areas are used (simulate now returns cellA) |
| C-04 | Major | "Right on the trends" is not shown by one CFD design on two meshes | holds | Wording changed on the page, the tour, the method page, the README, the why page and the slides: close totals for one design; design trends need CFD runs of several designs |
| C-05 | Major | Slides 1 and 5 show challenge figures without "synthetic" | holds | Labelled on every slide; the saving given as assumed working days |
| C-06 | Minor | Slide 5 implies all searched designs are checked at full resolution | holds | "about 540 quick estimates, then the recommended designs checked at full resolution" |
| C-07 | Minor | "Experienced engineer" overstates the classic route; random order in races 2 to 8 | holds | Called an automated one-change-at-a-time search; the same sensible order in all races (decision by Peter Fintl): classic median 12 to 10.5, total 110 to 97; AI unchanged at 4.5 and 43 |
| C-08 | Minor | Warning text colour 4.4:1 on white | holds | Darkened to 5.7:1 |
| C-09 | Minor | "Four tools", "not a PINN" on the simulator page | holds | Six tools; limits rewritten |
| C-10 | Minor | Missing favicon makes Chrome log a 404 | holds | Icon declared inline on all pages |
| C (claims) | | Hold-out seeds claim not reproducible | holds | `node checks/challenge.js --holdout` (seeds 8 to 15) reproduces it: AI 4, classic 10.5 with the fixed order (11.5 with the old random order) |
| G-01 | Major | Two time bases: 8 h of computing per run on the challenge panel, one working day per iteration on the why page and slides | holds as a clarity issue | Both clocks explained on the why page and slide 5; "eight starts of the same synthetic design task" |
| G-02 | Major | Synthetic labels missing next to challenge figures | holds | See C-05; also the why page tiles and the first step of the challenge tour |
| G-03 | Major | "Reference cleans about 3 points less, spread about 2" | holds: 6.1 ± 4.9 points over 300 random designs, worst 23 | Method section 14 and the panel corrected; a challenge check pins it |
| G-04 | Major | Classic route framing and random order | holds | See C-07 |
| G-05 | Major | CFD jets enter through a 36 by 37.5 mm wall patch, about three times the nozzle area | holds (CFD set-up) | Disclosed in the CFD caveat and method section 16; passed to the CFD work |
| G-06 | Major | CFD and model maps agree cell by cell at chance level; 92 % mesh agreement against 79 % by chance | holds: kappa 0.08 (CFD vs model), 0.62 (mesh vs mesh); overlap of uncleaned areas 11 % and 50 % | The panel and slide 3 now show the overlap of the uncleaned areas and the chance level; "92 %" removed from the slides |
| G-07 | Major | Field surrogate test near-circular: reference maps come from the same model with other coefficients | holds | Stated on the field panel, in the method page and the README |
| G-08 | Minor | Stale AI lab text | holds | See C-09 |
| G-09 | Minor | Timings disagree between pages | holds | 20 to 40 ms, sweep one to two seconds, CFD minutes to hours, everywhere |
| G-10 | Minor | Full-resolution re-check does not cover designs that miss by more than about 3 points | holds | Method section 14 says so |
| G-11 | Minor | Hold-out set not reproducible | holds | See above; also "in 2 of 8 the AI route needed more runs" |
| G-12 | Minor | Calibration demos are an "inverse crime" (same model family) | holds | Method section 14 says so |
| G-13 | Minor | "Phone recordings are enough" without any real recording fitted | holds | "should be enough; shown with synthetic recordings" on the why page and slides |
| G-14 | Minor | PINN step says "measured" for simulated data | holds | "The measured flush is simulated" |
| G-15 | Minor | Code map names computeFilm; slide 6 says "live page"; links point to main | partly: links will be right after the release merge | traceFilm; "Recorded from the page" |
| G-16 | Minor | Orifice coefficient 0.6 sets the washdown peak level and is unlisted; D5 bound vs CFD | holds: cap binds from 2.22 to 3.08 s | Documented in method section 7; D5 label says it checks internal consistency only |
| G-17 | Note | Washdown full and partial flush clean the same area | holds | Stated in method section 16 |
| G-18 | Note | Swirl bookkeeping (clamp, outflow, floor friction) | holds | Stated in method section 16 |
| G-19 | Note | Siphonic partial flush seal 59 of 60 mm | holds | Method section 2 corrected |
| G-20 | Note | PINN kernel truncation makes the loss step-discontinuous in τ | holds, no effect seen | Noted here; gradients confirmed by both reviewers |
| G-21 | Note | Review IDs inconsistent, earlier review not in the repository | holds | This folder |
| G-22 | Note | Tap targets under 24 px on phones | holds | Tap areas of at least 24 px for small controls on touch screens |
| G-23 | Note | Font licence file without copyright line | holds | Copyright and origin of the files added to fonts/LICENCE.txt |
| G (claims) | | "Can we trust the fast model?", "resolves the water and the air"; PINN wall water "about 0.8 L" | holds: 0.74 to 0.78 L over five draws | "How far can we trust...", "simulates"; method says about 0.75 L, about a fifth too little |
| W-01 | Note | Classic route weaker than design of experiments | holds | The panel and the why page say a team using design of experiments would need fewer runs |
