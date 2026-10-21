#!/usr/bin/env python3
"""Reduce the output of an OpenFOAM reference run to a small summary that the flush model can be compared with.

    python3 cfd/post.py [CASE]        (run inside the case folder, or give it)

Writes CASE/summary.json with
  - time series: inflow per jet, water out of the trap, water in the domain, pool level, mean swirl of the pool,
    wetted share of the bowl wall, mean wall shear under the water;
  - maps on the model's wall grid (90 sectors around, 40 rows from the rim to the waterline): time of first
    wetting and shear dose J = integral of max(0, tau - tauC) dt, with the model's tauC and Jcrit, and the
    resulting cleaned share.
Standard library only, so it runs on a plain macOS python3.
"""
import glob, json, math, os, re, sys

case = sys.argv[1] if len(sys.argv) > 1 else '.'
info = json.load(open(os.path.join(case, 'case-info.json')))
D, Rr, Rp = info['D'], info['Rr'], info['Rp']
RHO = 998.0
TAUC, JCRIT = 3.0, 1.5          # the model's coefficients (Pa, Pa s)
NTH, NS = 90, 40                # the model's wall grid
PP = os.path.join(case, 'postProcessing')

def times_of(fo):
    out = []
    for d in glob.glob(os.path.join(PP, fo, '*')):
        try: out.append((float(os.path.basename(d)), d))
        except ValueError: pass
    return sorted(out)

def dat_series(fo):
    """concatenate a function object's .dat files over restarts: list of (t, value)"""
    rows = {}
    for _, d in times_of(fo):
        for f in glob.glob(os.path.join(d, '*.dat')):
            for line in open(f):
                if line.startswith('#') or not line.strip(): continue
                v = line.split()
                try: rows[float(v[0])] = float(v[1])
                except (ValueError, IndexError): pass
    return sorted(rows.items())

def raw_rows(path):
    out = []
    for line in open(path):
        if line.startswith('#') or not line.strip(): continue
        try: out.append([float(x) for x in line.replace('(', ' ').replace(')', ' ').split()])
        except ValueError: pass
    return out

def find(d, *keys):
    """a file under d whose path contains all keys"""
    for f in sorted(glob.glob(os.path.join(d, '**', '*'), recursive=True)):
        if os.path.isfile(f) and all(k in f for k in keys): return f
    return None

# ---------- wall grid of the model: rows by arc length from the rim to the waterline ----------
def r_of_z(z):
    ze = (D - min(max(z, 0), D)) / D
    return Rp + (Rr - Rp) * math.cos(math.pi / 2 * ze)
NP_ = 2000
zs = [D * (1 - i / NP_) for i in range(NP_ + 1)]          # from the rim down
ss = [0.0]
for i in range(1, NP_ + 1): ss.append(ss[-1] + math.hypot(r_of_z(zs[i]) - r_of_z(zs[i - 1]), zs[i] - zs[i - 1]))
S = ss[-1]
def s_of_z(z):
    if z >= D: return 0.0
    if z <= 0: return S
    i = min(NP_ - 1, int((D - z) / D * NP_))
    f = ((D - z) / D * NP_) - i
    return ss[i] + f * (ss[i + 1] - ss[i])
cellA = []
for k in range(NS):
    s0, s1 = S * k / NS, S * (k + 1) / NS
    # radius at the row middle: invert s(z) by bisection
    lo, hi, sm = 0.0, D, 0.5 * (s0 + s1)
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if s_of_z(mid) > sm: lo = mid
        else: hi = mid
    cellA.append(2 * math.pi * r_of_z(0.5 * (lo + hi)) * (s1 - s0) / NTH)
Atot = NTH * sum(cellA)

def cell_of(x, y, z):
    if z <= 0 or z >= D: return None
    th = math.atan2(y, x) % (2 * math.pi)
    i = min(NTH - 1, int(th / (2 * math.pi) * NTH)); k = min(NS - 1, int(s_of_z(z) / S * NS))
    return k * NTH + i

# ---------- wall data: alpha and wall shear on the wall patch ----------
J = [0.0] * (NTH * NS); tWet = [None] * (NTH * NS)
wall_series, tau_unit, prev = [], None, None
for t, d in times_of('wallData'):
    fa, ft = find(d, 'alpha.water'), find(d, 'wallShearStress')
    if not fa or not ft: continue
    A, T = raw_rows(fa), raw_rows(ft)
    if len(A) != len(T): continue
    # per model cell: share of wet faces and mean shear of the wet faces
    n = [0] * (NTH * NS); nw = [0] * (NTH * NS); tw = [0.0] * (NTH * NS)
    for a_, t_ in zip(A, T):
        c = cell_of(a_[0], a_[1], a_[2])
        if c is None: continue
        mag = math.sqrt(t_[3] ** 2 + t_[4] ** 2 + t_[5] ** 2)
        n[c] += 1
        if a_[3] > 0.5: nw[c] += 1; tw[c] += mag
    # wallShearStress of interFoam is kinematic (m2/s2) in some versions: decide once from the magnitudes
    if tau_unit is None:
        mags = sorted(tw[c] / nw[c] for c in range(len(n)) if nw[c])
        tau_unit = 'kinematic' if mags and mags[len(mags) // 2] < 0.05 else 'Pa'
    fac = RHO if tau_unit == 'kinematic' else 1.0
    wetA = shearA = 0.0
    dt = 0.0 if prev is None else t - prev
    for c in range(len(n)):
        if not n[c]: continue
        share = nw[c] / n[c]; A_c = cellA[c // NTH]
        tau = fac * tw[c] / nw[c] if nw[c] else 0.0
        wetA += share * A_c; shearA += share * A_c * tau
        if share > 0.5:
            if tWet[c] is None: tWet[c] = t
            J[c] += max(0.0, tau - TAUC) * dt
    wall_series.append({'t': t, 'wetPct': 100 * wetA / Atot, 'tauWet': shearA / wetA if wetA else 0.0})
    prev = t
clean = sum(cellA[c // NTH] for c in range(len(J)) if J[c] >= JCRIT)
wet = sum(cellA[c // NTH] for c in range(len(J)) if tWet[c] is not None)

# ---------- pool level from the sample lines: bottom + integral of alpha up to the first long dry stretch ----------
level = []
for t, d in times_of('levels'):
    hs = []
    for f in glob.glob(os.path.join(d, '*level*')):
        R = raw_rows(f)
        if len(R) < 3: continue
        z0, h = R[0][0], 0.0
        for i in range(1, len(R)):
            h += 0.5 * (R[i][1] + R[i - 1][1]) * (R[i][0] - R[i - 1][0])
        hs.append(z0 + h)
    if hs: level.append({'t': t, 'z': sum(hs) / len(hs), 'zMin': min(hs), 'zMax': max(hs)})

# ---------- pool swirl from horizontal planes: area-weighted mean tangential speed of the water ----------
swirl = []
for t, d in times_of('poolPlanes'):
    num = den = 0.0
    tok = re.compile(r'(^|[_.])U([_.]|$)')
    files = [f for f in glob.glob(os.path.join(d, '**', '*'), recursive=True) if os.path.isfile(f) and tok.search(os.path.basename(f))]
    for fu in files:
        bn = os.path.basename(fu)
        fa = os.path.join(os.path.dirname(fu), tok.sub(lambda m: m.group(1) + 'alpha.water' + m.group(2), bn, count=1))
        if not os.path.exists(fa): continue
        U, A = raw_rows(fu), raw_rows(fa)
        if len(U) != len(A): continue
        bins = {}
        for u, a_ in zip(U, A):
            x, y = u[0], u[1]; r = math.hypot(x, y)
            if r < 1e-4: continue
            ut = (-y * u[3] + x * u[4]) / r
            key = (int(r / 0.004), int((math.atan2(y, x) % (2 * math.pi)) / (2 * math.pi) * 36))
            b = bins.setdefault(key, [0.0, 0.0, 0])
            b[0] += a_[3] * ut; b[1] += a_[3]; b[2] += 1
        for (ir, _), (sut, sa, cnt) in bins.items():
            area = 2 * math.pi * (ir + 0.5) * 0.004 * 0.004 / 36
            num += area * sut / cnt; den += area * sa / cnt
    if den: swirl.append({'t': t, 'uTheta': num / den})

out = {
    'case': info, 'tauUnit': tau_unit, 'tauC': TAUC, 'Jcrit': JCRIT,
    'inflow': {k: dat_series('flow_' + k) for k in info['jets']},
    'outflow': dat_series('flowRates'), 'water': dat_series('water'),
    'level': level, 'swirl': swirl, 'wall': wall_series,
    'cleanPct': 100 * clean / Atot, 'wetPct': 100 * wet / Atot,
    'map': {'NTH': NTH, 'NS': NS, 'J': [round(x, 4) for x in J], 'tWet': tWet},
}
json.dump(out, open(os.path.join(case, 'summary.json'), 'w'), separators=(',', ':'))
print('summary: cleaned %.1f %%, wetted %.1f %%, %d wall samples, %d level samples, %d swirl samples, shear unit %s'
      % (out['cleanPct'], out['wetPct'], len(wall_series), len(level), len(swirl), tau_unit))
