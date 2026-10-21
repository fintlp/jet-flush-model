#!/usr/bin/env python3
"""Reduce the output of an OpenFOAM reference run to a small summary that the flush model can be compared with.

    python3 cfd/post.py [CASE] [--valid-to T]        (run inside the case folder, or give it)

Writes CASE/summary.json with
  - time series: inflow per jet, water out of the trap, water in the domain, pool level, mean swirl of the pool,
    wetted share of the bowl wall, mean wall shear under the water;
  - maps on the model's wall grid (90 sectors around, 40 rows from the rim to the waterline): time of first
    wetting and shear dose J = integral of max(0, tau - tauC) dt, with the model's tauC and Jcrit, and the
    resulting cleaned share.
Standard library only, so it runs on a plain macOS python3.
"""
import glob, json, math, os, re, sys

_args = sys.argv[1:]
VALID_TO = float(_args[_args.index('--valid-to') + 1]) if '--valid-to' in _args else None   # by hand (pressure-outlet runs)
_pos = [x for i, x in enumerate(_args) if not x.startswith('--') and (i == 0 or _args[i - 1] != '--valid-to')]
case = _pos[0] if _pos else '.'
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
wall_series, prev = [], None
# unit of wallShearStress from the dimensions in a written field file: [0 2 -2 ...] is kinematic (m2/s2),
# [1 -1 -2 ...] is Pa. The surface samples carry no units, so the field files are the only source.
tau_unit, tau_dims = 'not found', None
for f in sorted(glob.glob(os.path.join(case, 'processor0', '*', 'wallShearStress')) + glob.glob(os.path.join(case, '[0-9]*', 'wallShearStress'))):
    with open(f, 'rb') as fh: head = fh.read(4000).decode('latin-1')
    m = re.search(r'dimensions\s*\[([^\]]*)\]', head)
    if m:
        tau_dims = [float(x) for x in m.group(1).split()]
        tau_unit = 'kinematic' if tau_dims[:3] == [0, 2, -2] else 'Pa' if tau_dims[:3] == [1, -1, -2] else 'other ' + m.group(1)
        break
fac = RHO if tau_unit == 'kinematic' else 1.0
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

# ---------- first water in the pool: downward water flux through the plane 3 mm above the crest ----------
def read_vtk_polys(path):
    """legacy ascii VTK polydata (or XML ascii .vtp): polygon areas, centres and cell arrays"""
    txt = open(path, encoding='latin-1').read()
    if txt.lstrip().startswith('<'):
        import xml.etree.ElementTree as ET
        root = ET.fromstring(txt); pd = root.find('.//Piece')
        pts = [float(x) for x in pd.find('Points/DataArray').text.split()]
        conn = [int(x) for x in pd.find(".//Polys/DataArray[@Name='connectivity']").text.split()]
        offs = [int(x) for x in pd.find(".//Polys/DataArray[@Name='offsets']").text.split()]
        polys, prev_ = [], 0
        for o_ in offs: polys.append(conn[prev_:o_]); prev_ = o_
        arrays = {}
        for da in pd.findall('CellData/DataArray'):
            arrays[da.get('Name')] = ([float(x) for x in da.text.split()], int(da.get('NumberOfComponents', '1')))
    else:
        tok = txt.split(); i = tok.index('POINTS'); n = int(tok[i + 1]); pts = [float(x) for x in tok[i + 3:i + 3 + 3 * n]]
        j = tok.index('POLYGONS'); m = int(tok[j + 1]); k = j + 3; polys = []
        if tok[k] == 'OFFSETS':                       # VTK 5.1 layout
            k += 2; offs = [int(x) for x in tok[k:k + m]]; k += m
            k += 2; nconn = offs[-1]; conn = [int(x) for x in tok[k:k + nconn]]; k += nconn
            polys = [conn[offs[q]:offs[q + 1]] for q in range(m - 1)]
        else:
            for _ in range(m): c = int(tok[k]); polys.append([int(x) for x in tok[k + 1:k + 1 + c]]); k += 1 + c
        arrays = {}
        c0 = tok.index('CELL_DATA', k); k = c0 + 2
        while k < len(tok):
            w = tok[k]
            if w == 'FIELD': k += 3; continue
            if w in ('SCALARS', 'VECTORS'):
                name, nc_ = tok[k + 1], (3 if w == 'VECTORS' else 1); k += 3
                if tok[k] == 'LOOKUP_TABLE': k += 2
                cnt = len(polys) * nc_; arrays[name] = ([float(x) for x in tok[k:k + cnt]], nc_); k += cnt; continue
            if w in ('POINT_DATA', 'CELL_DATA'): break
            name, nc_, cnt_ = w, int(tok[k + 1]), int(tok[k + 2]); k += 4
            arrays[name] = ([float(x) for x in tok[k:k + nc_ * cnt_]], nc_); k += nc_ * cnt_
    P_ = [(pts[3 * q], pts[3 * q + 1], pts[3 * q + 2]) for q in range(len(pts) // 3)]
    areas, cents = [], []
    for poly in polys:
        q = [P_[v] for v in poly]; A2 = 0.0
        for r_ in range(len(q)): A2 += q[r_][0] * q[(r_ + 1) % len(q)][1] - q[(r_ + 1) % len(q)][0] * q[r_][1]
        areas.append(abs(0.5 * A2)); cents.append((sum(v[0] for v in q) / len(q), sum(v[1] for v in q) / len(q)))
    return areas, cents, arrays

arrival, arr_err = [], None
rw = info.get('rWallArrival', 0.0647)
for t, d in times_of('arrival'):
    f = None
    for cand in sorted(glob.glob(os.path.join(d, '**', '*'), recursive=True)):
        if os.path.isfile(cand) and cand.endswith(('.vtk', '.vtp')): f = cand; break
    if not f: continue
    try:
        areas, cents, arr = read_vtk_polys(f)
        al = arr['alpha.water'][0]; U = arr['U'][0]
        tot = wallb = 0.0; sub = 0.0
        for q, A_ in enumerate(areas):
            fl = -al[q] * U[3 * q + 2] * A_           # downward water flux through this face, m3/s
            tot += fl
            if math.hypot(*cents[q]) >= rw - 0.008: wallb += fl
            sub += al[q] * A_
        arrival.append({'t': t, 'total': tot, 'wall': wallb, 'interior': tot - wallb, 'wetArea': sub, 'area': sum(areas)})
    except Exception as e:   # keep the rest of the summary if the plane format is unexpected
        arr_err = '%s: %s' % (os.path.basename(f), e); break
def inflow_at(t):
    tot = 0.0
    for k in info['jets']:
        ser = dat_series('flow_' + k)
        if not ser: return float('nan')
        q = min(ser, key=lambda r_: abs(r_[0] - t))[1]; tot += -q
    return tot
arrival_times = {}
if arrival:
    first = next((a_['t'] for a_ in arrival if a_['total'] > 1e-6), None)
    t10 = next((a_['t'] for a_ in arrival if a_['total'] >= 0.1 * inflow_at(a_['t']) > 0), None)
    t50 = next((a_['t'] for a_ in arrival if a_['total'] >= 0.5 * inflow_at(a_['t']) > 0), None)
    # the plane is no longer above the pool once most of it is covered by water
    sub_t = next((a_['t'] for a_ in arrival if a_['wetArea'] > 0.5 * a_['area']), None)
    arrival_times = {'first_1mLs': first, 't10': t10, 't50': t50, 'planeSubmerged': sub_t}

# ---------- run metadata for the page: wall clock, cores, valid window ----------
def run_meta(case_dir, log_text=None):
    """Wall clock (meshing plus solver) and cores from the runner's job log; the runner keeps logs in ../../logs."""
    meta = {}
    try:
        if log_text is None:
            root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            name = os.path.basename(os.path.abspath(case_dir))
            jobs = []
            for ln in open(os.path.join(root, 'logs', 'runner.log')):
                m = re.match(r'== job (\S+) in cases/([^,]+),', ln)
                if m and m.group(2) == name: jobs.append(m.group(1))
            # the newest job of this case that ran the solver (a later job may only have rerun this script)
            for job in reversed(jobs):
                lf = os.path.join(root, 'logs', job + '.log')
                if not os.path.exists(lf): continue
                txt = open(lf, errors='replace').read()
                if re.search(r'^== \d\d:\d\d:\d\d (mpirun|interFoam)', txt, re.M): log_text = txt; break
            if log_text is None: return meta
        mesh = solver = 0; cores = None; cmd = None
        for ln in log_text.splitlines():
            m = re.match(r'== \d\d:\d\d:\d\d (.*)', ln)
            if m: cmd = m.group(1); continue
            m = re.match(r'== exit \d+ after (\d+) s', ln)
            if m and cmd:
                w = cmd.split()
                if w[0] == 'mpirun' or w[0] == 'interFoam':
                    solver += int(m.group(1))
                    if w[0] == 'mpirun': cores = int(w[2])
                elif w[0] in ('blockMesh', 'snappyHexMesh', 'checkMesh', 'setFields', 'decomposePar', 'foamDictionary'):
                    mesh += int(m.group(1))
                cmd = None
        meta = {'wallClock_s': mesh + solver, 'solver_s': solver, 'mesh_s': mesh, 'cores': cores or 1}
    except Exception as e:
        meta = {'wallClockError': str(e)}
    return meta

def valid_to(info, outflow, end):
    """With the model's outflow prescribed: the time from which the water outflow stays below 90 % of the prescribed
    flow (air at the outlet), rounded down to 0.05 s. Pool level and outflow are comparable with the model up to there."""
    q = info.get('qout')
    if not q and info.get('outlet_kind') == 'model':   # cases made before make_case stored the table
        f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'washdown', 'inflow.json')
        if os.path.exists(f):
            Q = json.load(open(f)); q = [[t, v] for t, v in zip(Q['tq'], Q['Qout'])]
    if info.get('outlet_kind') != 'model' or not q or not outflow: return None
    qt = [r_[0] for r_ in q]; qv = [r_[1] for r_ in q]
    def presc(t):
        if t <= qt[0]: return qv[0]
        for i in range(1, len(qt)):
            if t <= qt[i]: return qv[i - 1] + (qv[i] - qv[i - 1]) * (t - qt[i - 1]) / (qt[i] - qt[i - 1])
        return qv[-1]
    bad = None
    for t, w in outflow:
        p_ = presc(t)
        if p_ > 1e-4 and w < 0.9 * p_:
            if bad is None: bad = t
            if t - bad >= 0.05: return math.floor(bad * 20 + 1e-9) / 20
        else:
            bad = None
    return end

meta = run_meta(case)
info.update(meta)
_vt = VALID_TO if VALID_TO is not None else valid_to(info, dat_series('flowRates'), info.get('end'))
info['validTo'] = _vt if _vt is not None else info.get('end')
info['validNote'] = ('pool level and outflow comparable with the model up to validTo; the wall data run to the end, '
                     'with more water in the bowl than the model after validTo') if _vt is not None and _vt < (info.get('end') or 0) else ''
info.pop('qout', None)

out = {
    'case': info, 'tauUnit': tau_unit, 'tauDims': tau_dims, 'tauC': TAUC, 'Jcrit': JCRIT,
    'wetRule': 'wall face wet when alpha.water > 0.5; model cell wet when more than half of its wall faces are wet; same rule at every sample (0.05 s); shares area-weighted with model cell areas',
    'arrival': arrival, 'arrivalTimes': arrival_times, 'arrivalError': arr_err,
    'inflow': {k: dat_series('flow_' + k) for k in info['jets']},
    'outflow': dat_series('flowRates'), 'water': dat_series('water'),
    'level': level, 'swirl': swirl, 'wall': wall_series,
    'cleanPct': 100 * clean / Atot, 'wetPct': 100 * wet / Atot,
    'map': {'NTH': NTH, 'NS': NS, 'J': [round(x, 4) for x in J], 'tWet': tWet},
}
json.dump(out, open(os.path.join(case, 'summary.json'), 'w'), separators=(',', ':'))
print('summary: cleaned %.1f %%, wetted %.1f %%, %d wall samples, %d level samples, %d swirl samples, %d arrival samples, shear unit %s %s'
      % (out['cleanPct'], out['wetPct'], len(wall_series), len(level), len(swirl), len(arrival), tau_unit, tau_dims))
print('arrival times', arrival_times, arr_err or '')
w0 = out['water'][0][1] if out['water'] else None
print('water at start %s L, model %s L' % (w0 and round(w0 * 1000, 4), info.get('Vstatic_model') and round(info['Vstatic_model'] * 1000, 4)))
