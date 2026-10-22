#!/usr/bin/env python3
"""Reduce the output of an OpenFOAM reference run to a small summary that the flush model can be compared with.

    python3 cfd/post.py [CASE] [--valid-to T]        (run inside the case folder, or give it)

Writes CASE/summary.json with
  - for a trapway case (make_case --outlet trap): the water balance over time (inflow, water and air out of the trap
    outlet, water over the rim, water in the domain, the balance residual), water above the crest and in the trap,
    water and air through the crest and the trap inlet, and the CFD outflow and pool level next to the model's;
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
TRAP = info.get('outlet_at') == 'trap'
DS = info.get('ds', 0.055)
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

def r_bowl(z):
    """bowl radius at height z, as make_case builds it (pool profile above the crest, sump below)"""
    return r_of_z(z) if z >= 0 else Rp * max(0.35, 1 + 0.5 * z / DS)

def cell_of(x, y, z):
    if z <= 0 or z >= D: return None
    if math.hypot(x, y) > r_of_z(z) + 0.004: return None      # trapway wall above the crest, not the bowl
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
            if r > r_bowl(u[2]) + 0.003: continue          # plane cuts through the trapway: not part of the pool
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
        # area of the polygon projected onto its own plane (Newell normal), centre as the vertex mean (x, y, z)
        nx_ = sum((q[r_][1] - q[(r_ + 1) % len(q)][1]) * (q[r_][2] + q[(r_ + 1) % len(q)][2]) for r_ in range(len(q)))
        ny_ = sum((q[r_][2] - q[(r_ + 1) % len(q)][2]) * (q[r_][0] + q[(r_ + 1) % len(q)][0]) for r_ in range(len(q)))
        nz_ = sum((q[r_][0] - q[(r_ + 1) % len(q)][0]) * (q[r_][1] + q[(r_ + 1) % len(q)][1]) for r_ in range(len(q)))
        areas.append(0.5 * math.sqrt(nx_ ** 2 + ny_ ** 2 + nz_ ** 2))
        cents.append(tuple(sum(v[k] for v in q) / len(q) for k in range(3)))
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
        tot = wallb = 0.0; sub = 0.0; area = 0.0
        for q, A_ in enumerate(areas):
            if math.hypot(cents[q][0], cents[q][1]) > rw + 0.005: continue   # trapway bend above the crest, not the pool
            fl = -al[q] * U[3 * q + 2] * A_           # downward water flux through this face, m3/s
            tot += fl
            if math.hypot(cents[q][0], cents[q][1]) >= rw - 0.008: wallb += fl
            sub += al[q] * A_; area += A_
        arrival.append({'t': t, 'total': tot, 'wall': wallb, 'interior': tot - wallb, 'wetArea': sub, 'area': area})
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
                elif w[0] in ('blockMesh', 'snappyHexMesh', 'checkMesh', 'setFields', 'decomposePar', 'foamDictionary', 'topoSet'):
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

# ---------- trapway cases: water balance, trap planes, CFD next to the model ----------
def model_series():
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'washdown', 'model-series.json')
    return json.load(open(f)) if os.path.exists(f) else None

def lin(ts, ys, t):
    if not ts: return float('nan')
    if t <= ts[0]: return ys[0]
    for i in range(1, len(ts)):
        if t <= ts[i]: return ys[i - 1] + (ys[i] - ys[i - 1]) * (t - ts[i - 1]) / (ts[i] - ts[i - 1])
    return ys[-1]

def plane_fluxes(fo, name, select, normal_comp, sign):
    """water and air flux (m3/s) through one cutting plane of the trapway, positive along sign * the plane normal,
    and the air share of the selected cross-section"""
    out = []
    for t, d in times_of(fo):
        f = next((c for c in sorted(glob.glob(os.path.join(d, '**', '*'), recursive=True))
                  if os.path.isfile(c) and os.path.basename(c).startswith(name) and c.endswith(('.vtk', '.vtp'))), None)
        if not f: continue
        try:
            areas, cents, arr = read_vtk_polys(f)
        except Exception:
            continue
        al = arr['alpha.water'][0]; U = arr['U'][0]
        qw = qa = A = Aair = 0.0
        for q, A_ in enumerate(areas):
            if not select(cents[q]): continue
            un = sign * U[3 * q + normal_comp]
            a_ = min(1.0, max(0.0, al[q]))
            qw += a_ * un * A_; qa += (1 - a_) * un * A_; A += A_; Aair += (1 - a_) * A_
        if A: out.append({'t': t, 'water': qw, 'air': qa, 'airShare': Aair / A})
    return out

trap_out = None
if TRAP:
    tr = info.get('trap') or {}
    rT = 0.5 * tr.get('d', 0.048); yC = tr.get('yCrest', 0.165); zB = info.get('zBot', -DS)
    inflow_s = {}
    for k in info['jets']:
        for t, q in dat_series('flow_' + k): inflow_s[t] = inflow_s.get(t, 0.0) - q
    wout = dict(dat_series('flowRates')); tout = dict(dat_series('outletTotal'))
    rim = dict(dat_series('rimLoss')); dom = dict(dat_series('water'))
    above = dict(dat_series('bowlAboveWater')); trapw = dict(dat_series('trapWater'))
    ts = sorted(t for t in dom if t in inflow_s and t in wout and t in rim)
    bal = []; cin = cout = crim = cair = 0.0; prev_t = None; prev = None
    W0 = dom[ts[0]] if ts else 0.0
    for t in ts:
        cur = (inflow_s[t], wout[t], rim[t], tout.get(t, wout[t]) - wout[t])
        if prev is not None:
            dt = t - prev_t
            cin += 0.5 * (cur[0] + prev[0]) * dt; cout += 0.5 * (cur[1] + prev[1]) * dt
            crim += 0.5 * (cur[2] + prev[2]) * dt; cair += 0.5 * (cur[3] + prev[3]) * dt
        prev, prev_t = cur, t
        bal.append({'t': round(t, 5), 'Qin': cur[0], 'QoutWater': cur[1], 'QoutAir': cur[3], 'Qrim': cur[2],
                    'Vin': cin, 'VoutWater': cout, 'Vrim': crim, 'VoutAir': cair,
                    'Vdomain': dom[t], 'VaboveCrest': above.get(t), 'Vtrap': trapw.get(t),
                    'residual': dom[t] - W0 - cin + cout + crim})
    # thin the balance to about 0.01 s steps for the summary
    thin, last = [], -1.0
    for r_ in bal:
        if r_['t'] - last >= 0.0099 or r_ is bal[-1]: thin.append(r_); last = r_['t']
    # crest plane y = yCrest: the weir bend's cross-section is the circle around (x 0, z rT); inlet plane: around the axis
    crest = plane_fluxes('trapPlanes', 'crest', lambda c: math.hypot(c[0], c[2] - rT) < rT + 0.003, 1, +1)
    inlet = plane_fluxes('trapPlanes', 'inlet', lambda c: math.hypot(c[0], c[1]) < rT + 0.003, 2, -1)
    M = model_series()
    cmp_ = []
    lt = [x['t'] for x in level]; lz = [x['z'] for x in level]
    ot = [r_['t'] for r_ in bal]; oq = [r_['QoutWater'] for r_ in bal]
    ct = [r_['t'] for r_ in crest]; cq = [r_['water'] for r_ in crest]
    endt = info.get('end') or (ts[-1] if ts else 0)
    for k in range(1, int(round(endt / 0.1)) + 1):
        t = round(0.1 * k, 3)
        if ts and t > ts[-1] + 1e-9: break
        row = {'t': t, 'QoutCFD': lin(ot, oq, t), 'QcrestCFD': lin(ct, cq, t) if crest else None,
               'zCFD': lin(lt, lz, t) if level else None}
        if M: row.update({'QoutModel': lin(M['t'], M['Qout'], t), 'zModel': lin(M['t'], M['z'], t)})
        cmp_.append(row)
    def first_above(tt, qq, thr):
        return next((t for t, q in zip(tt, qq) if q > thr), None)
    starts = {'outletCFD': first_above(ot, oq, 5e-5), 'crestCFD': first_above(ct, cq, 5e-5) if crest else None,
              'model': first_above(M['t'], M['Qout'], 5e-5) if M else None, 'threshold_Ls': 0.05}
    peak = max(bal, key=lambda r_: r_['QoutWater']) if bal else None
    airIn = [r_ for r_ in inlet if r_['air'] > 1e-5]
    trap_out = {
        'balance': thin,
        'balanceNote': 'Qin = water from both jets, QoutWater/QoutAir = water and air out of the trap outlet (air negative '
                       'when the outlet breathes in), Qrim = water out through the open top above the rim (m3/s); V* the same '
                       'integrated from 0 (m3); Vdomain = water in the domain, VaboveCrest = water above z = 0 in the bowl, '
                       'Vtrap = water in the trapway; residual = Vdomain - Vdomain(0) - Vin + VoutWater + Vrim',
        'crestPlane': crest, 'inletPlane': inlet,
        'planeNote': 'crest: plane y = yCrest across the weir bend, flux towards the down-leg; inlet: plane 5 mm below the '
                     'trap inlet, flux downwards into the trap; airShare = air share of the tube cross-section',
        'airIntoTrap': {'first': airIn[0]['t'] if airIn else None, 'samples': len(airIn),
                        'maxAirFlux_Ls': max((r_['air'] for r_ in inlet), default=0) * 1000,
                        'maxAirShareInlet': max((r_['airShare'] for r_ in inlet), default=0)},
        'compare': cmp_, 'outflowStart': starts,
        'peak': {'t': peak['t'], 'QoutWater': peak['QoutWater']} if peak else None,
        'start': {'Vdomain': W0, 'Vtrap': trapw.get(ts[0]) if ts else None, 'VaboveCrest': above.get(ts[0]) if ts else None,
                  'VbowlBelowCrest': (W0 - (trapw.get(ts[0]) or 0) - (above.get(ts[0]) or 0)) if ts else None,
                  'VstaticModel': info.get('Vstatic_model')},
        'end': bal[-1] if bal else None,
    }

def valid_to_trap(tb, end, rim_tol=5.0, res_tol=5.0):
    """Trapway runs: valid while the water leaving over the rim stays below 5 mL and the balance closes within 5 mL
    (tolerances in mL), rounded down to 0.05 s."""
    if not tb or not tb['balance']: return end, ''
    for r_ in tb['balance']:
        if r_['Vrim'] > rim_tol * 1e-6:
            return math.floor(r_['t'] * 20 + 1e-9) / 20, 'water leaves over the rim'
        if abs(r_['residual']) > res_tol * 1e-6:
            return math.floor(r_['t'] * 20 + 1e-9) / 20, 'water balance does not close'
    return end, ''

meta = run_meta(case)
info.update(meta)
if TRAP:
    _vt, _why = valid_to_trap(trap_out, info.get('end')) if VALID_TO is None else (VALID_TO, 'set by hand')
else:
    _vt = VALID_TO if VALID_TO is not None else valid_to(info, dat_series('flowRates'), info.get('end'))
info['validTo'] = _vt if _vt is not None else info.get('end')
_late = _vt is not None and _vt < (info.get('end') or 0)
if TRAP:
    info['validNote'] = ('the run is valid up to validTo (%s after it)' % _why) if _late else ''
else:
    info['validNote'] = ('pool level and outflow comparable with the model up to validTo; the wall data run to the end, '
                         'with more water in the bowl than the model after validTo') if _late else ''
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
if trap_out: out['trap'] = trap_out
json.dump(out, open(os.path.join(case, 'summary.json'), 'w'), separators=(',', ':'))
print('summary: cleaned %.1f %%, wetted %.1f %%, %d wall samples, %d level samples, %d swirl samples, %d arrival samples, shear unit %s %s'
      % (out['cleanPct'], out['wetPct'], len(wall_series), len(level), len(swirl), len(arrival), tau_unit, tau_dims))
print('arrival times', arrival_times, arr_err or '')
w0 = out['water'][0][1] if out['water'] else None
if trap_out:
    e = trap_out['end'] or {}
    print('trap: start %.3f L in the domain (%.3f L in the trap), end %.3f L; in %.3f L, out %.3f L water %+.3f L air, over the rim %.4f L, residual %+.4f L'
          % (trap_out['start']['Vdomain'] * 1e3, (trap_out['start']['Vtrap'] or 0) * 1e3, e.get('Vdomain', 0) * 1e3, e.get('Vin', 0) * 1e3,
             e.get('VoutWater', 0) * 1e3, e.get('VoutAir', 0) * 1e3, e.get('Vrim', 0) * 1e3, e.get('residual', 0) * 1e3))
    print('outflow start', trap_out['outflowStart'], 'air into the trap', trap_out['airIntoTrap'], 'validTo', info['validTo'])
print('water at start %s L, model %s L' % (w0 and round(w0 * 1000, 4), info.get('Vstatic_model') and round(info['Vstatic_model'] * 1000, 4)))
