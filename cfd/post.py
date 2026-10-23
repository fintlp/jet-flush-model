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
# oval, off-centre bowl (wall-hung preset): sections are ellipses (semi-axes r/sE across, r sE along the long axis y),
# centred at y = c(z); the case frame is the model's turned by frameRot (90 degrees: model x = case y, model y = -case x)
OVAL = info.get('ovality', 1.0) or 1.0; sE = math.sqrt(OVAL); SHIFT = info.get('poolShift', 0.0) or 0.0
ROT = math.radians(info.get('frameRot_deg', 0.0) or 0.0)
WALLHUNG = abs(OVAL - 1) > 1e-9 or abs(SHIFT) > 1e-12
def c_of_z(z):
    if SHIFT == 0 or z >= D: return 0.0
    if z <= 0: return SHIFT
    return SHIFT * (1 - math.cos(math.pi / 2 * (D - z) / D))
def to_model(x, y):
    """case coordinates to the model's frame (wall at model +x)"""
    c, s_ = math.cos(ROT), math.sin(ROT)
    return c * x + s_ * y, -s_ * x + c * y
def z_of_s(sv):
    lo, hi = 0.0, D
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if s_of_z(mid) > sv: lo = mid
        else: hi = mid
    return 0.5 * (lo + hi)
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
# per-cell areas (index k * NTH + i): the round bowl's rows; for the oval, off-centre bowl the model's own formula
# (model.js, cell areas: |dX/dtheta x dX/dzd| dtheta dzd for X = (R sE cos + C, R/sE sin, zd), zd depth below the rim)
CELLA = [cellA[k] for k in range(NS) for _ in range(NTH)]
if WALLHUNG:
    kz = math.pi / (2 * D); dth_ = 2 * math.pi / NTH; CELLA = []
    for k in range(NS):
        d0, d1 = D - z_of_s(S * k / NS), D - z_of_s(S * (k + 1) / NS); dc = 0.5 * (d0 + d1)
        R = Rp + (Rr - Rp) * math.cos(kz * dc); dR = -(Rr - Rp) * kz * math.sin(kz * dc); dC = SHIFT * kz * math.sin(kz * dc)
        for i in range(NTH):
            th_ = (i + 0.5) * dth_; c, sn = math.cos(th_), math.sin(th_)
            ax_, ay_ = -R * sE * sn, R / sE * c; bx_, by_ = dR * sE * c + dC, dR / sE * sn
            CELLA.append(math.sqrt(ay_ ** 2 + ax_ ** 2 + (ax_ * by_ - ay_ * bx_) ** 2) * dth_ * (d1 - d0))
Atot = sum(CELLA)

def r_bowl(z):
    """bowl radius at height z, as make_case builds it (pool profile above the crest, sump below)"""
    return r_of_z(z) if z >= 0 else Rp * max(0.35, 1 + 0.5 * z / DS)
WELL_SHIFT = (info.get('trap') or {}).get('wellShift', 0.0) if TRAP else 0.0
def sect_centre(z):
    """centre (y) of the bowl section at height z; below the crest the well of a trapway case (back plate vertical)"""
    if z >= 0 or not WELL_SHIFT: return c_of_z(z)
    return SHIFT + WELL_SHIFT * sE * (Rp - r_bowl(z))
def rnorm(x, y, z):
    """normalised radius of (x, y) in the section at height z: 1 on the wall"""
    r = r_bowl(z); return math.hypot(x / (r / sE), (y - sect_centre(z)) / (r * sE))
def in_bowl(x, y, z, tol):
    """inside the bowl (not the trapway), with a tolerance tol (m) measured on the short semi-axis"""
    return (rnorm(x, y, z) - 1) * r_bowl(z) / sE <= tol

def cell_of(x, y, z):
    if z <= 0 or z >= D: return None
    if not in_bowl(x, y, z, 0.004): return None               # trapway wall above the crest, not the bowl
    xm, ym = to_model(x, y); cm, _ = to_model(0.0, c_of_z(z))
    th = math.atan2(ym * sE, (xm - cm) / sE) % (2 * math.pi)    # the model's cell angle (round bowl: atan2(y, x))
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
        share = nw[c] / n[c]; A_c = CELLA[c]
        tau = fac * tw[c] / nw[c] if nw[c] else 0.0
        wetA += share * A_c; shearA += share * A_c * tau
        if share > 0.5:
            if tWet[c] is None: tWet[c] = t
            J[c] += max(0.0, tau - TAUC) * dt
    wall_series.append({'t': t, 'wetPct': 100 * wetA / Atot, 'tauWet': shearA / wetA if wetA else 0.0})
    prev = t
clean = sum(CELLA[c] for c in range(len(J)) if J[c] >= JCRIT)
wet = sum(CELLA[c] for c in range(len(J)) if tWet[c] is not None)

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
    files = [f for f in glob.glob(os.path.join(d, '**', '*'), recursive=True) if os.path.isfile(f) and tok.search(os.path.basename(f))
             and not (TRAP and 'z-030' in f)]   # the extra well plane of trapway cases has its own swirl (swirlWell)
    for fu in files:
        bn = os.path.basename(fu)
        fa = os.path.join(os.path.dirname(fu), tok.sub(lambda m: m.group(1) + 'alpha.water' + m.group(2), bn, count=1))
        if not os.path.exists(fa): continue
        U, A = raw_rows(fu), raw_rows(fa)
        if len(U) != len(A): continue
        bins = {}
        for u, a_ in zip(U, A):
            x, y = u[0], u[1] - SHIFT; r = math.hypot(x, y)      # about the pool axis
            if r < 1e-4: continue
            if not in_bowl(u[0], u[1], u[2], 0.003): continue    # plane cuts through the trapway: not part of the pool
            ut = (-y * u[3] + x * u[4]) / r
            key = (int(r / 0.004), int((math.atan2(y, x) % (2 * math.pi)) / (2 * math.pi) * 36))
            b = bins.setdefault(key, [0.0, 0.0, 0])
            b[0] += a_[3] * ut; b[1] += a_[3]; b[2] += 1
        for (ir, _), (sut, sa, cnt) in bins.items():
            area = 2 * math.pi * (ir + 0.5) * 0.004 * 0.004 / 36
            num += area * sut / cnt; den += area * sa / cnt
    if den: swirl.append({'t': t, 'uTheta': num / den})

# ---------- first water in the pool: downward water flux through the plane 3 mm above the crest ----------
LAST_NORMALS = []   # unit normals of the polygons read last (polygon order, i.e. OpenFOAM's outward face normals)
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
    areas, cents, norms = [], [], []
    for poly in polys:
        q = [P_[v] for v in poly]; A2 = 0.0
        for r_ in range(len(q)): A2 += q[r_][0] * q[(r_ + 1) % len(q)][1] - q[(r_ + 1) % len(q)][0] * q[r_][1]
        # area of the polygon projected onto its own plane (Newell normal), centre as the vertex mean (x, y, z)
        nx_ = sum((q[r_][1] - q[(r_ + 1) % len(q)][1]) * (q[r_][2] + q[(r_ + 1) % len(q)][2]) for r_ in range(len(q)))
        ny_ = sum((q[r_][2] - q[(r_ + 1) % len(q)][2]) * (q[r_][0] + q[(r_ + 1) % len(q)][0]) for r_ in range(len(q)))
        nz_ = sum((q[r_][0] - q[(r_ + 1) % len(q)][0]) * (q[r_][1] + q[(r_ + 1) % len(q)][1]) for r_ in range(len(q)))
        nn = math.sqrt(nx_ ** 2 + ny_ ** 2 + nz_ ** 2) or 1.0
        areas.append(0.5 * nn); norms.append((nx_ / nn, ny_ / nn, nz_ / nn))
        cents.append(tuple(sum(v[k] for v in q) / len(q) for k in range(3)))
    LAST_NORMALS[:] = norms
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
            if not in_bowl(cents[q][0], cents[q][1], 0.003, 0.005): continue   # trapway bend above the crest, not the pool
            fl = -al[q] * U[3 * q + 2] * A_           # downward water flux through this face, m3/s
            tot += fl
            if (1 - rnorm(cents[q][0], cents[q][1], 0.003)) * r_bowl(0.003) / sE <= 0.008: wallb += fl
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

# ---------- trapway cases: water by region, balance, crest and dip sections, well swirl and level, CFD and model ----------
FLUSH_VOLUME = 4.5e-3     # m3, the preset's full flush; validTo tolerance is 1 % of it
RIM_TOL = 5e-6            # m3: "nothing over the rim" means less than 5 mL in total (spray)
AIR_TOL = 1e-6            # m3/s: air "passes" the dip when its flux towards the rising leg exceeds 1 mL/s
def model_series(which=0):
    """the model series to compare with: washdown trapway cases the 70 mm round-crest variant; the wall-hung bowl the
    wall-hung preset (which=0) and the fitted variant { cfp: 0.005, kSw: 2.5 } (which=1)"""
    here = os.path.dirname(os.path.abspath(__file__))
    if WALLHUNG: cands = [[('wallhung', 'model-series.json')], [('wallhung', 'model-series-fit.json')]][which]
    elif which: return None
    else: cands = ([('washdown', 'model-series-trap70.json')] if TRAP else []) + [('washdown', 'model-series.json')]
    for d, name in cands:
        f = os.path.join(here, d, name)
        if os.path.exists(f):
            M_ = json.load(open(f)); M_['file'] = d + '/' + name; return M_
    return None

def lin(ts, ys, t):
    if not ts: return float('nan')
    if t <= ts[0]: return ys[0]
    for i in range(1, len(ts)):
        if t <= ts[i]: return ys[i - 1] + (ys[i] - ys[i - 1]) * (t - ts[i - 1]) / (ts[i] - ts[i - 1])
    return ys[-1]

def seg_depth(frac, r):
    """water depth in a round bore of radius r whose cross-section is the share frac full of water"""
    frac = min(1.0, max(0.0, frac)); A = frac * math.pi * r * r; lo, hi = 0.0, 2 * r
    for _ in range(50):
        h = 0.5 * (lo + hi); a_ = r * r * math.acos((r - h) / r) - (r - h) * math.sqrt(max(0.0, 2 * r * h - h * h))
        if a_ < A: lo = h
        else: hi = h
    return 0.5 * (lo + hi)

def plane_fluxes(fo, name, select, normal_comp, sign):
    """water and air flux (m3/s) through one cutting plane of the trapway, positive along sign * the plane normal; the
    air share and the mean water fraction of the selected cross-section; its area-mean p_rgh (Pa) if sampled"""
    out = []
    for t, d in times_of(fo):
        f = next((c for c in sorted(glob.glob(os.path.join(d, '**', '*'), recursive=True))
                  if os.path.isfile(c) and os.path.basename(c).startswith(name) and c.endswith(('.vtk', '.vtp'))), None)
        if not f: continue
        try:
            areas, cents, arr = read_vtk_polys(f)
        except Exception:
            continue
        al = arr['alpha.water'][0]; U = arr['U'][0]; P_ = arr.get('p_rgh', (None,))[0]
        qw = qa = A = Aw = pA = 0.0
        for q, A_ in enumerate(areas):
            if not select(cents[q]): continue
            un = sign * U[3 * q + normal_comp]
            a_ = min(1.0, max(0.0, al[q]))
            qw += a_ * un * A_; qa += (1 - a_) * un * A_; A += A_; Aw += a_ * A_
            if P_ is not None: pA += P_[q] * A_
        if A:
            r_ = {'t': t, 'water': qw, 'air': qa, 'airShare': 1 - Aw / A, 'alphaMean': Aw / A}
            if P_ is not None: r_['pRgh'] = pA / A; r_['headLevel'] = pA / A / (RHO * 9.81)
            out.append(r_)
    return out

def line_level(name):
    """level from a vertical sample line: lowest valid point plus the integral of the water fraction above it"""
    out = []
    for t, d in times_of('levels'):
        f = next((c for c in glob.glob(os.path.join(d, '*' + name + '*'))), None)
        if not f: continue
        R = raw_rows(f)
        if len(R) < 3: continue
        h = 0.0
        for i in range(1, len(R)): h += 0.5 * (R[i][1] + R[i - 1][1]) * (R[i][0] - R[i - 1][0])
        out.append({'t': t, 'z': R[0][0] + h})
    return out

def well_swirl(zp=-0.030):
    """water-weighted area mean of the tangential speed about the well's own centre, in the plane zp"""
    out = []; tag = 'z%+04d' % int(round(zp * 1000)); tok = re.compile(r'(^|[_.])U([_.]|$)')
    r = r_bowl(zp); yc = sect_centre(zp)
    for t, d in times_of('poolPlanes'):
        for fu in glob.glob(os.path.join(d, '**', '*'), recursive=True):
            bn = os.path.basename(fu)
            if not (os.path.isfile(fu) and tag in fu and tok.search(bn)): continue
            fa = os.path.join(os.path.dirname(fu), tok.sub(lambda m: m.group(1) + 'alpha.water' + m.group(2), bn, count=1))
            if not os.path.exists(fa): continue
            U, A = raw_rows(fu), raw_rows(fa)
            if len(U) != len(A): continue
            num = den = 0.0
            for u, a_ in zip(U, A):
                x, y = u[0], u[1] - yc; rr = math.hypot(x, y)
                if rr < 1e-4 or not in_bowl(u[0], u[1], zp, 0.003): continue
                num += a_[3] * (-y * u[3] + x * u[4]) / rr; den += a_[3]
            if den: out.append({'t': t, 'uTheta': num / den})
            break
    return out

trap_out = None
if TRAP:
    tr = info.get('trap') or {}
    rT = 0.5 * tr.get('d', 0.048); zB = info.get('zBot', -DS); zDip = tr.get('zDip', -DS)
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
        va, vt = above.get(t), trapw.get(t)
        bal.append({'t': round(t, 5), 'Qin': cur[0], 'QoutWater': cur[1], 'QoutAir': cur[3], 'Qrim': cur[2],
                    'Vin': cin, 'VoutWater': cout, 'Vrim': crim, 'VoutAir': cair,
                    'Vdomain': dom[t], 'VaboveCrest': va, 'Vtrap': vt,
                    'VbelowCrest': dom[t] - va - vt if va is not None and vt is not None else None,
                    'residual': dom[t] - W0 - cin + cout + crim})
    # thin to 0.01 s steps for the summary (the integrals use every solver step)
    thin, last = [], -1.0
    for r_ in bal:
        if r_['t'] - last >= 0.0099 or r_ is bal[-1]: thin.append(r_); last = r_['t']
    # crest section y = yCrest (start of the horizontal bore, circle around x 0, z rT); dip section y = yDip (under the
    # back plate, circle around x 0, z zU); both with flux towards +y (on towards the outlet)
    crest = plane_fluxes('trapPlanes', 'crest', lambda c: math.hypot(c[0], c[2] - rT) < rT + 0.003, 1, +1)
    for r_ in crest: r_['depth'] = seg_depth(r_['alphaMean'], rT)
    zU = tr.get('zU', zB - 0.024)
    dip = plane_fluxes('trapPlanes', 'dip', lambda c: math.hypot(c[0], c[2] - zU) < rT + 0.003, 1, +1)
    swW = well_swirl(-0.030)
    wellL, riseL = line_level('wellLine'), line_level('riseLine')
    endt = info.get('end') or (ts[-1] if ts else 0)
    def tail_mean(ser, key='z', span=0.5):
        if not ser: return None
        t1 = ser[-1]['t']; v = [r_[key] for r_ in ser if r_['t'] >= t1 - span - 1e-9]
        return sum(v) / len(v) if v else None
    wl, rl_ = tail_mean(wellL), tail_mean(riseL)
    flowing = bal and max(abs(r_['QoutWater']) for r_ in bal if r_['t'] >= bal[-1]['t'] - 0.5) > 2e-5
    seal = {'levelWell': wl, 'levelRisingLeg': rl_, 'zDip': zDip,
            'sealWell_mm': (wl - zDip) * 1000 if wl is not None else None,
            'window': [round((wellL[-1]['t'] if wellL else 0) - 0.5, 3), wellL[-1]['t'] if wellL else None],
            'flowStopped': not flowing,
            'note': 'mean level over the last 0.5 s of the run, from a vertical line through the well (25 mm behind the axis) '
                    'and one through the rising leg; seal = well level minus the dip (z = %.1f mm)' % (zDip * 1000)}
    M = model_series(); M2 = model_series(1)
    # level table of the bowl above the crest (the model's round profile, the same as the model's own table for
    # ovality 1): volume V(z) = integral of pi r(z)^2 from the crest up to z, to the rim
    mz = [D * k / 600 for k in range(601)]; mv = [0.0]
    for k in range(1, 601): mv.append(mv[-1] + math.pi * r_of_z(0.5 * (mz[k] + mz[k - 1])) ** 2 * (mz[k] - mz[k - 1]))
    cmp_ = []
    ot = [r_['t'] for r_ in bal]; oq = [r_['QoutWater'] for r_ in bal]; oa = [r_['VaboveCrest'] or 0 for r_ in bal]
    ct = [r_['t'] for r_ in crest]; cq = [r_['water'] for r_ in crest]; cd = [r_['depth'] for r_ in crest]
    lt = [x['t'] for x in level]; lz = [x['z'] for x in level]
    for k in range(1, int(round(endt / 0.1)) + 1):
        t = round(0.1 * k, 3)
        if ts and t > ts[-1] + 1e-9: break
        va = lin(ot, oa, t)
        row = {'t': t, 'QoutCFD': lin(ot, oq, t), 'QcrestCFD': lin(ct, cq, t) if crest else None,
               'crestDepthCFD': lin(ct, cd, t) if crest else None, 'VaboveCrestCFD': va,
               'zLinesCFD': lin(lt, lz, t) if level else None, 'zFromVolumeCFD': lin(mv, mz, va)}
        if M2: row.update({'QoutModelFit': lin(M2['t'], M2['Qout'], t), 'zModelFit': lin(M2['t'], M2['z'], t),
                           'VrelModelFit': lin(M2['t'], M2['Vrel'], t), 'vsModelFit': lin(M2['t'], M2['vs'], t) if 'vs' in M2 else None})
        if M: row.update({'QoutModel': lin(M['t'], M['Qout'], t), 'zModel': lin(M['t'], M['z'], t),
                          'VrelModel': lin(M['t'], M['Vrel'], t), 'vsModel': lin(M['t'], M['vs'], t) if 'vs' in M else None})
        cmp_.append(row)
    def first_above(tt, qq, thr):
        return next((t for t, q in zip(tt, qq) if q > thr), None)
    starts = {'outletCFD': first_above(ot, oq, 5e-5), 'crestCFD': first_above(ct, cq, 5e-5) if crest else None,
              'model': first_above(M['t'], M['Qout'], 5e-5) if M else None,
              'modelFit': first_above(M2['t'], M2['Qout'], 5e-5) if M2 else None, 'threshold_Ls': 0.05}
    peak = max(bal, key=lambda r_: r_['QoutWater']) if bal else None
    cpeak = max(crest, key=lambda r_: r_['water']) if crest else None
    apeak = max(bal, key=lambda r_: r_['VaboveCrest'] or 0) if bal else None
    mpk = max(range(len(M['Qout'])), key=lambda k: M['Qout'][k]) if M else None
    airIn = [r_ for r_ in dip if r_['air'] > AIR_TOL]
    trap_out = {
        'regions': [{'t': r_['t'], 'VaboveCrest': r_['VaboveCrest'], 'VbelowCrest': r_['VbelowCrest'], 'Vtrap': r_['Vtrap'],
                     'Vdomain': r_['Vdomain']} for r_ in thin],
        'regionNote': 'water (m3) in the bowl above the crest without the trapway (cell zone bowlAbove), in the bowl and well '
                      'below the crest (the rest, including the first quarter of the half bend), and in the trapway from the dip '
                      'section on, including the outlet bend and bore above the crest (cell zone trap)',
        'balance': thin,
        'balanceNote': 'Qin = water from both jets, QoutWater/QoutAir = water and air through the outlet face (air negative when '
                       'the outlet breathes in), Qrim = water out through the open top above the rim (m3/s); V* the same integrated '
                       'from 0 over every solver step (m3); residual = Vdomain - Vdomain(0) - Vin + VoutWater + Vrim',
        'crest': crest, 'dip': dip, 'swirlWell': swW, 'wellLevel': wellL, 'risingLegLevel': riseL,
        'sectionNote': 'crest: section y = yCrest at the start of the horizontal bore, flux towards the outlet, depth = water depth '
                       'in the round bore from the water share of the section; dip: section y = yDip under the back plate, flux '
                       'on towards the rising leg, airShare = 1 - alphaMean, pRgh = area mean (Pa; p_rgh = p - rho g z with z = 0 '
                       'at the crest), headLevel = pRgh / (998 g), the piezometric level of the water there (m above the crest); '
                       'swirlWell: water-weighted mean tangential speed about the well centre in the plane z = -30 mm',
        'airAtDip': {'first': airIn[0]['t'] if airIn else None, 'threshold_Ls': AIR_TOL * 1000, 'samples': len(airIn),
                     'maxAirFlux_Ls': max((r_['air'] for r_ in dip), default=0) * 1000,
                     'maxAirShare': max((r_['airShare'] for r_ in dip), default=0)},
        'seal': seal,
        'compare': cmp_, 'outflowStart': starts,
        'model': {'file': M.get('file'), 'set': M.get('set'), 'source': M.get('model')} if M else None,
        'modelFit': {'file': M2.get('file'), 'set': M2.get('set'), 'source': M2.get('model')} if M2 else None,
        'peak': {'outlet': {'t': peak['t'], 'Q': peak['QoutWater']} if peak else None,
                 'crest': {'t': cpeak['t'], 'Q': cpeak['water'], 'depth': cpeak['depth']} if cpeak else None,
                 'VaboveCrest': {'t': apeak['t'], 'V': apeak['VaboveCrest']} if apeak else None,
                 'model': {'t': M['t'][mpk], 'Q': M['Qout'][mpk], 'zPeak': max(M['z']), 'VrelPeak': max(M['Vrel'])} if M else None,
                 'modelFit': (lambda k: {'t': M2['t'][k], 'Q': M2['Qout'][k], 'zPeak': max(M2['z']), 'VrelPeak': max(M2['Vrel'])})(
                     max(range(len(M2['Qout'])), key=lambda k: M2['Qout'][k])) if M2 else None},
        'start': {'Vdomain': W0, 'Vtrap': trapw.get(ts[0]) if ts else None, 'VaboveCrest': above.get(ts[0]) if ts else None,
                  'VbelowCrest': (W0 - (trapw.get(ts[0]) or 0) - (above.get(ts[0]) or 0)) if ts else None,
                  'VstaticModel': info.get('Vstatic_model')},
        'end': bal[-1] if bal else None,
    }

def angular_momentum(tb):
    """Angular momentum of the water about the pool axis (vertical through the pool centre at the waterline): in the
    bowl above and below the crest without the trapway, the flux entering
    through the jet patches, the flux leaving through the dip section, and the torque of the walls on the water
    (forces function objects: pressure and viscous parts, bowl above the crest, well, trapway); and the balance
    dL/dt = jets - walls - dip flux"""
    ax, ay = (info.get('poolAxis') or [0.0, 0.0])[:2]
    def torque(fo):
        out = {}
        for _, d in times_of(fo):
            f = os.path.join(d, 'moment.dat')
            if not os.path.exists(f): continue
            for line in open(f):
                if line.startswith('#') or not line.strip(): continue
                v = line.split()
                try: out[float(v[0])] = (-float(v[3]), -float(v[6]), -float(v[9]))   # on the water: total, pressure, viscous
                except (ValueError, IndexError): pass
        return out
    def lz(fo):
        """water angular momentum about the pool axis from the integrals of alpha (x uy - y ux), alpha ux, alpha uy (origin
        at x = y = 0): L = 998 (I0 - ax Iy + ay Ix)"""
        out = {}
        for _, d in times_of(fo):
            for f in glob.glob(os.path.join(d, '*.dat')):
                for line in open(f):
                    if line.startswith('#') or not line.strip(): continue
                    v = line.split()
                    try: out[float(v[0])] = RHO * (float(v[1]) - ax * float(v[3]) + ay * float(v[2]))
                    except (ValueError, IndexError): pass
        return out
    LA, LB = lz('LzAbove'), lz('LzBelow')
    TB, TW, TT = torque('torqueBowl'), torque('torqueWell'), torque('torqueTrap')
    if not LA: return None
    jets = []
    for t, d in times_of('jetPatches'):
        Lin = Qin = 0.0; ok = False
        for f in glob.glob(os.path.join(d, '**', '*.vtk'), recursive=True):
            try: areas, cents, arr = read_vtk_polys(f)
            except Exception: continue
            nrm = list(LAST_NORMALS); U = arr['U'][0]; al = arr.get('alpha.water', ([1.0] * len(areas),))[0]; ok = True
            for q, A_ in enumerate(areas):
                ux, uy, uz = U[3 * q:3 * q + 3]; un = ux * nrm[q][0] + uy * nrm[q][1] + uz * nrm[q][2]
                x, y = cents[q][0] - ax, cents[q][1] - ay
                Lin += -RHO * al[q] * (x * uy - y * ux) * un * A_; Qin += -al[q] * un * A_
        if ok: jets.append({'t': t, 'LdotIn': Lin, 'Qin': Qin})
    dipL = []
    for t, d in times_of('trapPlanes'):
        f = next((c for c in sorted(glob.glob(os.path.join(d, '**', '*'), recursive=True))
                  if os.path.isfile(c) and os.path.basename(c).startswith('dip') and c.endswith('.vtk')), None)
        if not f: continue
        try: areas, cents, arr = read_vtk_polys(f)
        except Exception: continue
        tr = info.get('trap') or {}; rT = 0.5 * tr.get('d', 0.07); zU = tr.get('zU', -0.09)
        al = arr['alpha.water'][0]; U = arr['U'][0]; F = 0.0
        for q, A_ in enumerate(areas):
            if math.hypot(cents[q][0], cents[q][2] - zU) >= rT + 0.003: continue
            ux, uy, uz = U[3 * q:3 * q + 3]; x, y = cents[q][0] - ax, cents[q][1] - ay
            F += RHO * min(1.0, max(0.0, al[q])) * (x * uy - y * ux) * uy * A_     # dip section normal +y
        dipL.append({'t': t, 'LdotOut': F})
    ts_ = sorted(LA)
    series = []
    for t in ts_:
        def near(dct):
            if not dct: return None
            k = min(dct, key=lambda x: abs(x - t)); return dct[k] if abs(k - t) < 0.006 else None
        b, w, tt = near(TB), near(TW), near(TT)
        series.append({'t': t, 'Labove': LA[t], 'Lbelow': LB.get(t),
                       'torqueBowl': b, 'torqueWell': w, 'torqueTrap': tt})
    # balance over 0.05 s steps: change of L (above + below) against the integrals of the jets, the walls and the dip
    jt = [r['t'] for r in jets]; jl = [r['LdotIn'] for r in jets]
    dt_ = [r['t'] for r in dipL]; dl = [r['LdotOut'] for r in dipL]
    tw_t = sorted(set(TB) & set(TW)); tw_v = [TB[t][0] + TW[t][0] for t in tw_t]
    def integ(tt, vv, a_, b_):
        if not tt: return 0.0
        n = 50; h = (b_ - a_) / n
        return sum(lin(tt, vv, a_ + (i + 0.5) * h) for i in range(n)) * h
    bal = []
    for i in range(1, len(series)):
        a_, b_ = series[i - 1]['t'], series[i]['t']
        if series[i]['Lbelow'] is None or series[i - 1]['Lbelow'] is None: continue
        dL = series[i]['Labove'] + series[i]['Lbelow'] - series[i - 1]['Labove'] - series[i - 1]['Lbelow']
        Jin, Wall, Out = integ(jt, jl, a_, b_), integ(tw_t, tw_v, a_, b_), integ(dt_, dl, a_, b_)
        bal.append({'t0': a_, 't1': b_, 'dL': dL, 'jets': Jin, 'walls': Wall, 'dip': Out, 'residual': dL - Jin - Wall + Out})
    return {'axis': [ax, ay], 'series': series, 'jets': jets, 'dip': dipL, 'balance': bal,
            'note': 'L in kg m2/s about the vertical pool axis through (axis x, axis y): Labove / Lbelow = integral of 998 alpha '
                    '((x - axis x) uy - (y - axis y) ux) dV in the bowl above / below the crest without the trapway, every 5 solver steps; torque* = (total, pressure, viscous) z-torque of the wall patch on the '
                    'fluid in N m, positive in the direction of positive L (wall: bowl above the crest; well: below the crest down '
                    'to the half bend; trap: the trapway), every solver step; jets.LdotIn = angular momentum entering through the '
                    'jet patches (N m), every 0.01 s; dip.LdotOut = water angular momentum leaving through the dip section towards '
                    'the rising leg (N m), every 0.01 s; balance per 0.05 s: dL = change of Labove + Lbelow, jets, walls (bowl '
                    'plus well, total torque) and dip as integrals over the step; residual = dL - jets - walls + dip (it also '
                    'holds the angular momentum leaving over the rim and the torque of the air on the water surface)'}

def valid_to_trap(tb, end):
    """Trapway runs: valid while the water balance closes within 1 % of the flush volume (45 mL) and less than 5 mL has
    left over the rim, rounded down to 0.05 s"""
    if not tb or not tb['balance']: return end, ''
    for r_ in tb['balance']:
        if r_['Vrim'] > RIM_TOL:
            return math.floor(r_['t'] * 20 + 1e-9) / 20, 'water leaves over the rim'
        if abs(r_['residual']) > 0.01 * FLUSH_VOLUME:
            return math.floor(r_['t'] * 20 + 1e-9) / 20, 'water balance does not close within 1 % of the flush volume'
    return end, ''

if trap_out is not None:
    try: trap_out['angularMomentum'] = angular_momentum(trap_out)
    except Exception as e: trap_out['angularMomentumError'] = str(e)
meta = run_meta(case)
info.update(meta)
if TRAP:
    _vt, _why = valid_to_trap(trap_out, info.get('end')) if VALID_TO is None else (VALID_TO, 'set by hand')
else:
    _vt = VALID_TO if VALID_TO is not None else valid_to(info, dat_series('flowRates'), info.get('end'))
info['validTo'] = _vt if _vt is not None else info.get('end')
_late = _vt is not None and _vt < (info.get('end') or 0)
if TRAP:
    info['validNote'] = (('the run is valid up to validTo (%s after it)' % _why) if _late else
                         'valid to the end of the run: the water balance closes within 1 % of the flush volume (45 mL) and '
                         'less than 5 mL leaves over the rim')
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
    'map': {'NTH': NTH, 'NS': NS, 'J': [round(x, 4) for x in J], 'tWet': tWet, 'A': [round(x, 9) for x in CELLA],
            'frame': 'cells in the model frame (wall at model +x); case frame turned by frameRot_deg' if WALLHUNG else 'model frame'},
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
    print('outflow start', trap_out['outflowStart'], 'air at the dip', trap_out['airAtDip'], 'seal', trap_out['seal']['sealWell_mm'], 'validTo', info['validTo'])
print('water at start %s L, model %s L' % (w0 and round(w0 * 1000, 4), info.get('Vstatic_model') and round(info['Vstatic_model'] * 1000, 4)))
