#!/usr/bin/env python3
"""Compare an OpenFOAM reference run (summary.json from cfd/post.py) with the flush model.

    python3 cfd/compare.py SUMMARY.json MODEL-SERIES.json MODEL-MAPS.json [--json OUT]

MODEL-SERIES.json comes from cfd/model-series.js, MODEL-MAPS.json from cfd/model-maps.js. Prints a table and, with
--json, writes the comparison for the docs.
"""
import json, math, sys

S = json.load(open(sys.argv[1])); M = json.load(open(sys.argv[2])); MM = json.load(open(sys.argv[3]))
out = {}
NTH, NS = S['map']['NTH'], S['map']['NS']
info = S['case']; D, Rr, Rp = info['D'], info['Rr'], info['Rp']

def interp(ts, ys, t):
    if not ts: return float('nan')
    if t <= ts[0]: return ys[0]
    for i in range(1, len(ts)):
        if t <= ts[i]: return ys[i - 1] + (ys[i] - ys[i - 1]) * (t - ts[i - 1]) / (ts[i] - ts[i - 1])
    return ys[-1]

# row areas of the shared wall grid (same formula as post.py)
def r_of_z(z):
    ze = (D - min(max(z, 0), D)) / D
    return Rp + (Rr - Rp) * math.cos(math.pi / 2 * ze)
N = 2000; zs = [D * (1 - i / N) for i in range(N + 1)]; ss = [0.0]
for i in range(1, N + 1): ss.append(ss[-1] + math.hypot(r_of_z(zs[i]) - r_of_z(zs[i - 1]), zs[i] - zs[i - 1]))
Stot = ss[-1]; rowA = []
for k in range(NS):
    sm = Stot * (k + 0.5) / NS; i = min(N, next(j for j in range(N + 1) if ss[j] >= sm))
    rowA.append(2 * math.pi * r_of_z(zs[i]) * Stot / NS / NTH)
Atot = NTH * sum(rowA)
CA = S['map'].get('A')            # per-cell areas from post.py (the oval bowl's differ from the round rows)
def cellArea(i): return CA[i] if CA else rowA[i // NTH]
if CA: Atot = sum(CA)

tEnd = max([w['t'] for w in S['wall']] or [0])
print(f"reference run: mesh {info['mesh']}, simulated to {tEnd:.2f} s, wall shear unit {S['tauUnit']}")
rows = []
def row(name, cfd, model, unit, note=''):
    rows.append((name, cfd, model, unit, note)); print(f"  {name:<44} CFD {cfd:>9}   model {model:>9} {unit:<5} {note}")

# inflow actually delivered by the jet patches (phi is negative for inflow)
for k, ser in S['inflow'].items():
    ts = [t for t, _ in ser]; qs = [-q * 1000 for _, q in ser]
    for t in (0.1, 0.5, 1.0, 2.0):
        if t <= tEnd:
            row(f'inflow {k} at {t} s', f'{interp(ts, qs, t):.3f}', f"{interp(M['t'], [q * 1000 / 2 for q in M['Qin']], t):.3f}", 'L/s')
# pool level (CFD: mean over four sample lines; model: level above the crest)
lt = [x['t'] for x in S['level']]; lz = [x['z'] * 1000 for x in S['level']]
for t in (0.5, 1.0, 2.0, 2.9, 4.0):
    if lt and t <= lt[-1]:
        row(f'pool level above the crest at {t} s', f'{interp(lt, lz, t):.1f}', f"{interp(M['t'], [z * 1000 for z in M['z']], t):.1f}", 'mm')
# outflow
ot = [t for t, _ in S['outflow']]; oq = [q * 1000 for _, q in S['outflow']]
for t in (0.5, 1.0, 2.0, 2.9, 4.0):
    if ot and t <= ot[-1]:
        row(f'outflow at {t} s', f'{interp(ot, oq, t):.3f}', f"{interp(M['t'], [q * 1000 for q in M['Qout']], t):.3f}", 'L/s')
if ot:
    t0 = next((t for t, q in zip(ot, oq) if q > 0.05), None)
    tm = next((t for t, q in zip(M['t'], M['Qout']) if q * 1000 > 0.05), None)
    row('start of outflow (> 0.05 L/s)', f'{t0:.2f}' if t0 is not None else 'none', f'{tm:.2f}' if tm is not None else 'none', 's')
# wetted share of the bowl wall over time, on the shared grid
tw = S['map']['tWet']
for t in (0.1, 0.2, 0.3, 0.5, 1.0):
    if t <= tEnd:
        c = sum(cellArea(i) for i in range(NTH * NS) if tw[i] is not None and tw[i] <= t + 1e-9) / Atot
        m = sum(cellArea(i) for i in range(NTH * NS) if MM['tWet'][i] <= t + 1e-9) / Atot
        row(f'wetted share of the wall by {t} s', f'{100 * c:.1f}', f'{100 * m:.1f}', '%')
# mean shear under the water
wt = [w['t'] for w in S['wall']]; wv = [w['tauWet'] for w in S['wall']]
for t in (0.5, 1.0, 2.0):
    if wt and t <= wt[-1]: row(f'mean wall shear where wet at {t} s', f'{interp(wt, wv, t):.2f}', '', 'Pa')
# cleaning over the whole run, same tauC and Jcrit
if tEnd > 2.5:
    mclean = sum(cellArea(i) for i in range(NTH * NS) if MM['J'][i] >= MM['Jcrit']) / Atot
    row('cleaned share (J >= Jcrit)', f"{S['cleanPct']:.1f}", f'{100 * mclean:.1f}', '%')
# pool swirl
st = [x['t'] for x in S['swirl']]; sv = [x['uTheta'] for x in S['swirl']]
for t in (1.0, 2.0, 2.9):
    if st and t <= st[-1]:
        row(f'mean swirl speed of the pool water at {t} s', f'{interp(st, sv, t):.3f}', f"{interp(M['t'], M.get('uMean', [float('nan')] * len(M['t'])), t):.3f}", 'm/s')

# trapway runs: outflow, crest, water above the crest, dip, swirl in the well, seal, water balance
TR = S.get('trap')
if TR:
    print('  model for the trap rows: %s %s' % ((TR.get('model') or {}).get('file'), (TR.get('model') or {}).get('set')))
    C = TR['compare']; ctt = [r['t'] for r in C]
    def ser(key, f=1000): return [(r[key] if r.get(key) is not None else float('nan')) * f for r in C]
    for t in (0.5, 1.0, 2.0, 2.9, 4.0, 6.0):
        if ctt and t <= ctt[-1] + 1e-9:
            row(f'outflow at the outlet face at {t} s', f"{interp(ctt, ser('QoutCFD'), t):.3f}", f"{interp(ctt, ser('QoutModel'), t):.3f}", 'L/s')
            row(f'flow over the crest at {t} s', f"{interp(ctt, ser('QcrestCFD'), t):.3f}", '', 'L/s', f"depth {interp(ctt, ser('crestDepthCFD'), t):.1f} mm")
            row(f'water above the crest at {t} s', f"{interp(ctt, ser('VaboveCrestCFD'), t):.3f}", f"{interp(ctt, ser('VrelModel'), t):.3f}", 'L')
            row(f'level from that volume (bowl table) at {t} s', f"{interp(ctt, ser('zFromVolumeCFD'), t):.1f}", f"{interp(ctt, ser('zModel'), t):.1f}", 'mm')
    st_ = TR['outflowStart']
    f2 = lambda v: f'{v:.2f}' if v is not None else 'none'
    row('start of outflow at the outlet (> 0.05 L/s)', f2(st_['outletCFD']), f2(st_['model']), 's')
    row('start of flow over the crest (> 0.05 L/s)', f2(st_['crestCFD']), f2(st_['model']), 's')
    pk = TR['peak']
    if pk.get('outlet') and pk.get('model'):
        row('peak outflow', f"{pk['outlet']['Q'] * 1000:.3f}", f"{pk['model']['Q'] * 1000:.3f}", 'L/s', f"at {pk['outlet']['t']:.2f} s (model {pk['model']['t']:.2f} s)")
    if pk.get('VaboveCrest') and pk.get('model'):
        row('most water above the crest', f"{pk['VaboveCrest']['V'] * 1000:.3f}", f"{pk['model']['VrelPeak'] * 1000:.3f}", 'L', f"at {pk['VaboveCrest']['t']:.2f} s")
    a_ = TR['airAtDip']
    row('air passes the dip (> 1 mL/s)', 'from %.2f s' % a_['first'] if a_['first'] is not None else 'never', '', '',
        'peak air flux %.3f L/s, air share up to %.0f %%' % (a_['maxAirFlux_Ls'], 100 * a_['maxAirShare']))
    sw = TR['swirlWell']; swt = [r['t'] for r in sw]; swv = [r['uTheta'] for r in sw]
    for t in (1.0, 2.0, 2.9):
        if swt and t <= swt[-1]: row(f'swirl in the well (z = -30 mm) at {t} s', f'{interp(swt, swv, t):.3f}', '', 'm/s')
    se = TR['seal']
    if se.get('sealWell_mm') is not None:
        row('seal after the flush (well level above the dip)', f"{se['sealWell_mm']:.1f}", f"{-se['zDip'] * 1000:.1f}", 'mm',
            'flow stopped' if se['flowStopped'] else 'still flowing at the end')
    e = TR['balance'][-1]
    row(f'water in, by {e["t"]:.2f} s', f"{e['Vin'] * 1000:.3f}", '', 'L')
    row(f'water out at the outlet face, by {e["t"]:.2f} s', f"{e['VoutWater'] * 1000:.3f}", '', 'L')
    row(f'water over the rim, by {e["t"]:.2f} s', f"{e['Vrim'] * 1000:.4f}", '', 'L')
    row('largest water balance residual', f"{max(abs(r['residual']) for r in TR['balance']) * 1e6:.1f}", '', 'mL')

if '--json' in sys.argv:
    json.dump({'rows': rows}, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
