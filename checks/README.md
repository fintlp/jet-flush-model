# Checks

Deterministic scripts behind the figures quoted in the model description. Run them from the repository root with Node.js 18 or later.

| Script | What it checks |
|---|---|
| `node checks/regression.js <other model.js>` | All results except noise are identical to another version of the model, for example the released one: `git show main:model.js > /tmp/model-main.js` first |
| `node checks/resolution.js` | How much cleaning depends on how often the jet films are re-traced (model description, section 11) |
| `node checks/noise-range.js` | Width of the sampled noise range, siphonic against washdown, and interior coefficient values outside the corner range (section 10) |

Each script uses a fixed seed, so the numbers are the same on every run. The random designs are drawn uniformly over the simulator's slider ranges, as described in `lib.js`.
