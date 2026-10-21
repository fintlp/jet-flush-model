#!/usr/bin/env python3
"""Build an OpenFOAM (interFoam, VOF) reference case of a jet flush model preset.

    python3 cfd/make_case.py --series cfd/washdown/model-series.json --out CASE [--mesh coarse|medium|fine] [--end 5]

The bowl wall is the model's own profile (method section 4): r(z) = Rp + (Rr - Rp) cos(pi/2 (D - z)/D) above the
static waterline, narrowing cone and sump below it. Coordinates: z up, z = 0 at the static waterline (the trap weir
crest), rim at z = D. The case is driven by the model's inflow: each jet enters through a patch on the wall just
upstream of its nozzle point, with the model's jet speed along the rim (tilted down by the jet angle) and an
inward component that gives the model's flow. The trap outlet is either a pressure outlet held at the hydrostatic
pressure of a water column up to the crest (an orifice law), or the model's trap outflow prescribed (--outlet model).
It sits on the sump wall, on the pool wall, or at the end of a short trap leg with a swirl breaker (--outlet-at).

Only the Python standard library is used, so the script also runs on a plain macOS python3.
"""
import argparse, json, math, os

ap = argparse.ArgumentParser()
ap.add_argument('--series', required=True, help='model inflow (cfd/<preset>/inflow.json from cfd/model-series.js)')
ap.add_argument('--out', required=True)
ap.add_argument('--mesh', default='coarse', choices=['coarse', 'medium', 'fine'])
ap.add_argument('--end', type=float, default=5.0)
ap.add_argument('--procs', type=int, default=0, help='number of subdomains (0: set by the run script)')
ap.add_argument('--frames', type=float, default=0.0,
                help='write the free surface (alpha = 0.5) as VTK every FRAMES seconds for visualisation (0: off)')
ap.add_argument('--outlet-at', default='sump', choices=['sump', 'ring', 'leg'],
                help='sump: rear sump wall from the bottom up to the seal depth; ring: rear pool wall 10 to 35 mm below '
                     'the crest (both draw air once the vortex core reaches them); leg: a straight trap leg below the sump '
                     'with a cross-shaped swirl breaker, outlet at its lower end (as a trapway, it stops the swirl first)')
ap.add_argument('--outlet', default='pressure', choices=['pressure', 'model'],
                help="pressure: total-pressure outlet at crest level (orifice law; blocked by a strong swirl, see cfd-status); "
                     "model: the model's trap outflow Qout(t) prescribed at the outlet")
a = ap.parse_args()
if not os.path.exists(a.series):   # also look relative to this script's folder (the runner keeps both in tools/)
    a.series = os.path.join(os.path.dirname(os.path.abspath(__file__)), a.series)
S = json.load(open(a.series))
# resample the inflow to 10 ms steps by linear interpolation (the input may be a short list of knots)
def _interp(ts, ys, t):
    if t <= ts[0]: return ys[0]
    for i in range(1, len(ts)):
        if t <= ts[i]: return ys[i - 1] + (ys[i] - ys[i - 1]) * (t - ts[i - 1]) / (ts[i] - ts[i - 1])
    return ys[-1]
_tt = [round(0.01 * i, 4) for i in range(int(round(S['t'][-1] / 0.01)) + 1)]
S['Qin'] = [_interp(S['t'], S['Qin'], t) for t in _tt]; S['vj'] = [_interp(S['t'], S['vj'], t) for t in _tt]; S['t'] = _tt
p = S['p']

# ---------- geometry ----------
Rr, Rp, D, ds = p['Rrim'] / 1000, p['Rpool'] / 1000, p['Dwall'] / 1000, p['seal'] / 1000
if abs(p.get('ovality', 1) - 1) > 1e-9:
    raise SystemExit('only round bowls are supported (ovality 1)')
zBot = -ds - 0.03                      # sump bottom, as the model's level table
zTop = D + 0.06                        # air above the rim, open at the top
nJ = max(1, round(p['nJets']))
An, hN = p['Anoz'] * 1e-4, p['hNoz'] / 1000
w0 = An / hN                           # band width of a jet along the wall
alpha = math.radians(p['alpha'])
phase = math.radians(p.get('jetPhase', 0))
ARC = 0.036                            # arc length of each inlet patch upstream of the nozzle point

def r_of_z(z):
    if z >= 0:
        ze = (D - min(z, D)) / D
        return Rp + (Rr - Rp) * math.cos(math.pi / 2 * ze)
    return Rp * max(0.35, 1 + 0.5 * z / ds)

# profile points, bottom to top, with breaks at the region edges
jetTop, jetBot = D - 0.001, D - 0.001 - w0     # band from 1 mm below the rim, as the model folds it onto the wall
# trap opening: on the rear sump wall from the bottom up to the seal depth, or on the rear pool wall higher up
outBot, outTop = {'sump': (zBot, -ds), 'ring': (-0.035, -0.010), 'leg': (zBot, zBot)}[a.outlet_at]
LEG = 0.08                             # trap leg length below the sump bottom (outlet-at leg)
zLeg = zBot - LEG if a.outlet_at == 'leg' else zBot
zs = set()
def add_range(z0, z1, dz):
    n = max(1, int(math.ceil((z1 - z0) / dz)))
    for i in range(n + 1): zs.add(round(z0 + (z1 - z0) * i / n, 7))
_br = sorted({zBot, outBot, outTop, 0.0})
for z0_, z1_ in zip(_br[:-1], _br[1:]): add_range(z0_, z1_, 0.002)
add_range(0.0, jetBot, 0.002)
add_range(jetBot, jetTop, 0.001)
add_range(jetTop, D, 0.0005)
zs = sorted(zs)
prof = [(r_of_z(z), z) for z in zs]
NT = 720
th = [2 * math.pi * i / NT for i in range(NT + 1)]

jets = []
for j in range(nJ):
    t0 = (phase + j * 2 * math.pi / nJ) % (2 * math.pi)
    jets.append({'name': 'jet%d' % (j + 1), 'th0': t0, 'dth': ARC / r_of_z(0.5 * (jetTop + jetBot))})
outlet = (math.radians(40), math.radians(140))  # rear of the sump (+y)

def ang_in(t, lo, hi):
    t, lo, hi = t % (2 * math.pi), lo % (2 * math.pi), hi % (2 * math.pi)
    return lo <= t <= hi if lo <= hi else (t >= lo or t <= hi)

def wall_region(tm, zm):
    if outBot < zm < outTop and ang_in(tm, *outlet): return 'outlet'
    if jetBot < zm < jetTop:
        for J in jets:
            if ang_in(tm, J['th0'] - J['dth'], J['th0']): return J['name']
    return 'wall'

tris = {}
def tri(reg, a_, b_, c_): tris.setdefault(reg, []).append((a_, b_, c_))
def P(r, t, z): return (r * math.cos(t), r * math.sin(t), z)
# bowl and pool wall
for k in range(len(prof) - 1):
    (r0, z0), (r1, z1) = prof[k], prof[k + 1]
    for i in range(NT):
        t0, t1 = th[i], th[i + 1]
        reg = wall_region(0.5 * (t0 + t1), 0.5 * (z0 + z1))
        A, B, C, Dd = P(r0, t0, z0), P(r0, t1, z0), P(r1, t1, z1), P(r1, t0, z1)
        tri(reg, A, B, C); tri(reg, A, C, Dd)
# sump bottom, or the trap leg: a cylinder of the sump-bottom radius down to zLeg, outlet disk at its end, and a
# cross of two plates (swirl breaker) from the outlet up into the sump. The plates cut through the cylinder wall; the
# cells inside them are cut off from the fluid by snappyHexMesh.
rb = prof[0][0]
if a.outlet_at == 'leg':
    nL = int(math.ceil(LEG / 0.002))
    zl = [zLeg + LEG * k / nL for k in range(nL + 1)]
    for k in range(nL):
        for i in range(NT):
            t0, t1 = th[i], th[i + 1]
            A, B, C, Dd = P(rb, t0, zl[k]), P(rb, t1, zl[k]), P(rb, t1, zl[k + 1]), P(rb, t0, zl[k + 1])
            tri('wall', A, B, C); tri('wall', A, C, Dd)
    for i in range(NT):
        tri('outlet', (0, 0, zLeg), P(rb, th[i], zLeg), P(rb, th[i + 1], zLeg))
    hW = {'coarse': 0.006, 'medium': 0.004, 'fine': 0.004}[a.mesh] / 2 ** {'coarse': 1, 'medium': 1, 'fine': 2}[a.mesh]
    tP = max(0.004, 2 * hW)            # plate thickness: two wall cells
    zP1 = zBot + 0.02                  # plates reach 20 mm up into the sump
    rx = r_of_z(zP1) + 0.003
    def box(x0, x1, y0, y1, z0, z1):
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            tri('wall', v[q[0]], v[q[1]], v[q[2]]); tri('wall', v[q[0]], v[q[2]], v[q[3]])
    box(-rx, rx, -tP / 2, tP / 2, zLeg - 0.002, zP1)
    box(-tP / 2, tP / 2, -rx, rx, zLeg - 0.002, zP1)
else:
    for i in range(NT):
        tri('wall', (0, 0, zBot), P(rb, th[i + 1], zBot), P(rb, th[i], zBot))
# lid (air above the rim) and open top
for i in range(NT):
    t0, t1 = th[i], th[i + 1]
    A, B, C, Dd = P(Rr, t0, D), P(Rr, t1, D), P(Rr, t1, zTop), P(Rr, t0, zTop)
    tri('lid', A, B, C); tri('lid', A, C, Dd)
    tri('atmosphere', (0, 0, zTop), P(Rr, t0, zTop), P(Rr, t1, zTop))

os.makedirs(os.path.join(a.out, 'constant', 'triSurface'), exist_ok=True)
for d in ('system', '0.orig'): os.makedirs(os.path.join(a.out, d), exist_ok=True)

def normal(t):
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
    ux, uy, uz, vx, vy, vz = bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    m = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
    return nx / m, ny / m, nz / m, 0.5 * m
with open(os.path.join(a.out, 'constant', 'triSurface', 'bowl.stl'), 'w') as f:
    for reg, L in tris.items():
        f.write('solid %s\n' % reg)
        for t in L:
            nx, ny, nz, _ = normal(t)
            f.write(' facet normal %g %g %g\n  outer loop\n' % (nx, ny, nz))
            for v in t: f.write('   vertex %.7f %.7f %.7f\n' % v)
            f.write('  endloop\n endfacet\n')
        f.write('endsolid %s\n' % reg)

# ---------- jet velocity tables ----------
# For a uniform velocity U = a*t0 - b*ez + c*nin on the patch, the inflow is sum over faces of A_f (U . n_f), with n_f
# the inward face normal. a and b follow from the model's jet speed; c is chosen so that the inflow is the model's.
def patch_sums(name):
    sT = sZ = sN = area = 0.0
    J = [x for x in jets if x['name'] == name][0]
    t0 = (-math.sin(J['th0']), math.cos(J['th0']), 0.0)
    n0 = (-math.cos(J['th0']), -math.sin(J['th0']), 0.0)
    for t in tris[name]:
        nx, ny, nz, A = normal(t)
        cxm = sum(v[0] for v in t) / 3; cym = sum(v[1] for v in t) / 3
        if nx * cxm + ny * cym > 0: nx, ny, nz = -nx, -ny, -nz   # point into the bowl
        sT += A * (t0[0] * nx + t0[1] * ny); sZ += A * (-nz); sN += A * (n0[0] * nx + n0[1] * ny); area += A
    return t0, n0, sT, sZ, sN, area
tabs, info = {}, {}
for J in jets:
    t0, n0, sT, sZ, sN, area = patch_sums(J['name'])
    rows = []
    for t, Q, vj in zip(S['t'], S['Qin'], S['vj']):
        if t > a.end + 1e-9: break
        if rows and t - rows[-1][0] < 0.01 - 1e-9: continue
        Qj = Q / nJ
        aT, bZ = vj * math.cos(alpha), vj * math.sin(alpha)
        c = (Qj - aT * sT - bZ * sZ) / sN if Q > 0 else 0.0
        U = tuple(aT * t0[i] + c * n0[i] for i in range(3)); U = (U[0], U[1], -bZ)
        rows.append((t, U))
    tabs[J['name']] = rows
    info[J['name']] = {'area_cm2': area * 1e4, 'th0_deg': math.degrees(J['th0'])}

# ---------- OpenFOAM dictionaries ----------
HDR = 'FoamFile\n{\n    version 2.0;\n    format ascii;\n    class %s;\n    object %s;\n}\n'
def write(path, cls, obj, body):
    with open(os.path.join(a.out, path), 'w') as f: f.write(HDR % (cls, obj) + body)

h0 = {'coarse': 0.006, 'medium': 0.004, 'fine': 0.004}[a.mesh]
lvl = {'coarse': 1, 'medium': 1, 'fine': 2}[a.mesh]          # wall cells: coarse 3 mm, medium 2 mm, fine 1 mm
jl = lvl
X = Rr + 0.01
# the background mesh has a face plane at z = 0 (the crest): whole cells from zLo up, so setFields fills the pool
# exactly to the crest and no water flows in through the outlet at the start
zLo = -math.ceil((0.005 - zLeg) / h0 - 1e-9) * h0; zHi = math.ceil((zTop + 0.005) / h0 - 1e-9) * h0
nx_ = int(math.ceil(2 * X / h0)); nz_ = int(round((zHi - zLo) / h0))
write('system/blockMeshDict', 'dictionary', 'blockMeshDict', f'''scale 1;
vertices ( ({-X} {-X} {zLo:.6f}) ({X} {-X} {zLo:.6f}) ({X} {X} {zLo:.6f}) ({-X} {X} {zLo:.6f})
           ({-X} {-X} {zHi:.6f}) ({X} {-X} {zHi:.6f}) ({X} {X} {zHi:.6f}) ({-X} {X} {zHi:.6f}) );
blocks ( hex (0 1 2 3 4 5 6 7) ({nx_} {nx_} {nz_}) simpleGrading (1 1 1) );
edges ();
boundary ( box {{ type patch; faces ( (0 3 2 1) (4 5 6 7) (0 1 5 4) (2 3 7 6) (1 2 6 5) (0 4 7 3) ); }} );
''')
regs = ['wall', 'lid', 'atmosphere', 'outlet'] + [J['name'] for J in jets]
regnames = '\n'.join(f'            {r} {{ name {r}; }}' for r in regs)
d1, d2 = 2 * (h0 / 2 ** lvl) * 2, 3 * h0
write('system/snappyHexMeshDict', 'dictionary', 'snappyHexMeshDict', f'''castellatedMesh true;
snap true;
addLayers false;
geometry
{{
    bowl.stl
    {{
        type triSurfaceMesh;
        name bowl;
        regions
        {{
{regnames}
        }}
    }}
}}
castellatedMeshControls
{{
    maxLocalCells 4000000;
    maxGlobalCells 20000000;
    minRefinementCells 10;
    maxLoadUnbalance 0.10;
    nCellsBetweenLevels 3;
    features ();
    refinementSurfaces
    {{
        bowl
        {{
            level ({lvl} {lvl});
            patchInfo {{ type wall; }}
            regions
            {{
                atmosphere {{ level (0 0); patchInfo {{ type patch; }} }}
                lid {{ level (0 0); patchInfo {{ type wall; }} }}
                outlet {{ level ({lvl} {lvl}); patchInfo {{ type patch; }} }}
{chr(10).join(f"                {J['name']} {{ level ({jl} {jl}); patchInfo {{ type patch; }} }}" for J in jets)}
            }}
        }}
    }}
    resolveFeatureAngle 30;
    refinementRegions
    {{
        bowl {{ mode distance; levels (({d1:.4f} {lvl}) ({d2:.4f} {max(0, lvl - 1)})); }}
    }}
    locationInMesh (0.001 0.002 {0.5 * D:.4f});
    allowFreeStandingZoneFaces true;
}}
snapControls
{{
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 50;
    nRelaxIter 5;
    nFeatureSnapIter 10;
    implicitFeatureSnap true;
    explicitFeatureSnap false;
    multiRegionFeatureSnap false;
}}
addLayersControls
{{
    relativeSizes true; layers {{}}; expansionRatio 1.0; finalLayerThickness 0.3; minThickness 0.1; nGrow 0;
    featureAngle 60; nRelaxIter 3; nSmoothSurfaceNormals 1; nSmoothNormals 3; nSmoothThickness 10;
    maxFaceThicknessRatio 0.5; maxThicknessToMedialRatio 0.3; minMedianAxisAngle 90; nBufferCellsNoExtrude 0;
    nLayerIter 50;
}}
meshQualityControls
{{
    maxNonOrtho 65; maxBoundarySkewness 20; maxInternalSkewness 4; maxConcave 80; minVol 1e-13;
    minTetQuality 1e-15; minArea -1; minTwist 0.02; minDeterminant 0.001; minFaceWeight 0.05; minVolRatio 0.01;
    minTriangleTwist -1; nSmoothScale 4; errorReduction 0.75;
}}
mergeTolerance 1e-6;
''')

def vec_table(rows):
    return 'table\n        (\n' + '\n'.join(f'            ({t:.4f} ({u[0]:.5f} {u[1]:.5f} {u[2]:.5f}))' for t, u in rows) + '\n        )'
jetU = '\n'.join(f'''    {J['name']}
    {{
        type            uniformFixedValue;
        uniformValue    {vec_table(tabs[J['name']])};
        value           uniform (0 0 0);
    }}''' for J in jets)
JETS = '|'.join(J['name'] for J in jets)
FRAMES_FO = '' if a.frames <= 0 else f'''    frames
    {{
        type surfaces; libs (sampling);
        writeControl adjustableRunTime; writeInterval {a.frames};
        surfaceFormat vtk;
        formatOptions {{ vtk {{ format binary; legacy false; }} }}
        interpolationScheme cellPoint;
        fields (U);
        surfaces
        {{
            freeSurface {{ type isoSurface; isoField alpha.water; isoValue 0.5; interpolate true; regularise true; }}
        }}
    }}
'''
if a.outlet == 'model':
    if 'Qout' not in S: raise SystemExit('--outlet model needs Qout in the series file')
    qrows = [(t, q) for t, q in zip(S['tq'], S['Qout']) if t <= a.end + 0.05]
    OUTLET_U = ('        type            flowRateOutletVelocity;\n        volumetricFlowRate table\n        (\n'
                + '\n'.join(f'            ({t:.3f} {q:.8f})' for t, q in qrows) + '\n        );\n        value           uniform (0 0 0);')
    OUTLET_P = 'type fixedFluxPressure; value uniform 0;'
else:
    OUTLET_U = '        type            pressureInletOutletVelocity;\n        value           uniform (0 0 0);'
    OUTLET_P = 'type totalPressure; p0 uniform 0; value uniform 0;'
write('0.orig/U', 'volVectorField', 'U', f'''dimensions [0 1 -1 0 0 0 0];
internalField uniform (0 0 0);
boundaryField
{{
    "(wall|lid)" {{ type noSlip; }}
{jetU}
    outlet
    {{
{OUTLET_U}
    }}
    atmosphere {{ type pressureInletOutletVelocity; value uniform (0 0 0); }}
}}
''')
write('0.orig/alpha.water', 'volScalarField', 'alpha.water', f'''dimensions [0 0 0 0 0 0 0];
internalField uniform 0;
boundaryField
{{
    "(wall|lid)" {{ type zeroGradient; }}
    "({JETS})" {{ type fixedValue; value uniform 1; }}
    outlet {{ type inletOutlet; inletValue uniform 1; value uniform 1; }}
    atmosphere {{ type inletOutlet; inletValue uniform 0; value uniform 0; }}
}}
''')
write('0.orig/p_rgh', 'volScalarField', 'p_rgh', f'''dimensions [1 -1 -2 0 0 0 0];
internalField uniform 0;
boundaryField
{{
    "(wall|lid|{JETS})" {{ type fixedFluxPressure; value uniform 0; }}
    outlet {{ {OUTLET_P} }}
    atmosphere {{ type totalPressure; p0 uniform 0; value uniform 0; }}
}}
''')
for fld, dim, val, wf in (('k', '[0 2 -2 0 0 0 0]', '1e-4', 'kqRWallFunction'), ('omega', '[0 0 -1 0 0 0 0]', '1', 'omegaWallFunction'),
                          ('nut', '[0 2 -1 0 0 0 0]', '0', 'nutkWallFunction')):
    other = (f'"({JETS})" {{ type fixedValue; value uniform {"1e-3" if fld == "k" else "100" if fld == "omega" else "0"}; }}\n    '
             if fld != 'nut' else f'"({JETS})" {{ type calculated; value uniform 0; }}\n    ')
    rest = ('"(outlet|atmosphere)" { type inletOutlet; inletValue uniform %s; value uniform %s; }' % (val, val)) if fld != 'nut' \
        else '"(outlet|atmosphere)" { type calculated; value uniform 0; }'
    write('0.orig/' + fld, 'volScalarField', fld, f'''dimensions {dim};
internalField uniform {val};
boundaryField
{{
    "(wall|lid)" {{ type {wf}; value uniform {val}; }}
    {other}{rest}
}}
''')
write('constant/g', 'uniformDimensionedVectorField', 'g', 'dimensions [0 1 -2 0 0 0 0];\nvalue (0 0 -9.81);\n')
write('constant/transportProperties', 'dictionary', 'transportProperties', '''phases (water air);
water { transportModel Newtonian; nu 1e-06; rho 998; }
air { transportModel Newtonian; nu 1.48e-05; rho 1.2; }
sigma 0.072;
''')
write('constant/turbulenceProperties', 'dictionary', 'turbulenceProperties', 'simulationType RAS;\nRAS { RASModel kOmegaSST; turbulence on; printCoeffs off; }\n')
write('system/setFieldsDict', 'dictionary', 'setFieldsDict', f'''defaultFieldValues ( volScalarFieldValue alpha.water 0 );
regions ( boxToCell {{ box (-1 -1 -1) (1 1 0); fieldValues ( volScalarFieldValue alpha.water 1 ); }} );
''')
# sample lines for the pool level (four points at 70 % of the pool radius) and planes for the swirl
rl = 0.7 * Rp
lines = '\n'.join(f'''            level{i} {{ type uniform; axis z; start ({rl*math.cos(t):.4f} {rl*math.sin(t):.4f} {zBot+0.002:.4f}); end ({rl*math.cos(t):.4f} {rl*math.sin(t):.4f} {D:.4f}); nPoints 240; }}'''
                  for i, t in enumerate([0.25 * math.pi, 0.75 * math.pi, 1.25 * math.pi, 1.75 * math.pi]))
planes = '\n'.join(f'''            z{int(round(z*1000)):+04d} {{ type cuttingPlane; planeType pointAndNormal; pointAndNormalDict {{ point (0 0 {z:.4f}); normal (0 0 1); }} interpolate false; }}'''
                   for z in [zBot + 0.005 + 0.01 * i for i in range(int((0.06 - zBot) / 0.01) + 1)])
wdt = 0.05
write('system/controlDict', 'dictionary', 'controlDict', f'''application interFoam;
startFrom latestTime;
startTime 0;
stopAt endTime;
endTime {a.end};
deltaT 1e-4;
writeControl adjustableRunTime;
writeInterval 0.5;
purgeWrite 0;
writeFormat binary;
writePrecision 8;
writeCompression off;
timeFormat general;
timePrecision 6;
runTimeModifiable yes;
adjustTimeStep yes;
maxCo 1.0;
maxAlphaCo 1.0;
maxDeltaT 0.002;
functions
{{
    flowRates
    {{
        type surfaceFieldValue; libs (fieldFunctionObjects);
        writeControl timeStep; writeInterval 5;
        log false; writeFields false;
        regionType patch; name outlet;
        operation weightedSum; weightField alpha.water;
        fields (phi);
    }}
{chr(10).join(f"""    flow_{J['name']}
    {{
        type surfaceFieldValue; libs (fieldFunctionObjects);
        writeControl timeStep; writeInterval 5;
        log false; writeFields false;
        regionType patch; name {J['name']};
        operation sum;
        fields (phi);
    }}""" for J in jets)}
    water
    {{
        type volFieldValue; libs (fieldFunctionObjects);
        writeControl timeStep; writeInterval 5;
        log false; writeFields false;
        regionType all;
        operation volIntegrate;
        fields (alpha.water);
    }}
    wallShearStress
    {{
        type wallShearStress; libs (fieldFunctionObjects);
        writeControl adjustableRunTime; writeInterval {wdt};
        log false; patches (wall);
    }}
    wallData
    {{
        type surfaces; libs (sampling);
        writeControl adjustableRunTime; writeInterval {wdt};
        surfaceFormat raw;
        fields (alpha.water wallShearStress);
        surfaces
        {{
            wall {{ type patch; patches (wall); interpolate false; }}
        }}
    }}
    poolPlanes
    {{
        type surfaces; libs (sampling);
        writeControl adjustableRunTime; writeInterval {wdt};
        surfaceFormat raw;
        fields (alpha.water U);
        surfaces
        {{
{planes}
        }}
    }}
    arrival
    {{
        type surfaces; libs (sampling);
        writeControl adjustableRunTime; writeInterval 0.01;
        timeEnd 1.0;
        surfaceFormat vtk;
        formatOptions {{ vtk {{ format ascii; legacy true; precision 8; }} }}
        fields (alpha.water U);
        surfaces
        {{
            z003 {{ type cuttingPlane; planeType pointAndNormal; pointAndNormalDict {{ point (0 0 0.003); normal (0 0 1); }} interpolate false; }}
        }}
    }}
{FRAMES_FO}    levels
    {{
        type sets; libs (sampling);
        writeControl adjustableRunTime; writeInterval {wdt};
        setFormat raw;
        interpolationScheme cellPoint;
        fields (alpha.water);
        sets
        {{
{lines}
        }}
    }}
}}
''')
write('system/fvSchemes', 'dictionary', 'fvSchemes', '''ddtSchemes { default Euler; }
gradSchemes { default Gauss linear; }
divSchemes
{
    default none;
    div(rhoPhi,U) Gauss linearUpwind grad(U);
    div(phi,alpha) Gauss vanLeer;
    div(phirb,alpha) Gauss linear;
    "div\\(phi,(k|omega)\\)" Gauss upwind;
    div(((rho*nuEff)*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear limited corrected 0.5; }
interpolationSchemes { default linear; }
snGradSchemes { default limited corrected 0.5; }
wallDist { method meshWave; }
''')
write('system/fvSolution', 'dictionary', 'fvSolution', '''solvers
{
    "alpha.water.*"
    {
        nAlphaCorr 2; nAlphaSubCycles 1; cAlpha 1; MULESCorr yes; nLimiterIter 3;
        solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0;
    }
    "pcorr.*" { solver PCG; preconditioner { preconditioner GAMG; tolerance 1e-5; relTol 0; smoother GaussSeidel; } tolerance 1e-5; relTol 0; maxIter 50; }
    p_rgh { solver GAMG; tolerance 1e-7; relTol 0.01; smoother GaussSeidel; maxIter 50; }
    p_rghFinal { $p_rgh; relTol 0; }
    "(U|k|omega).*" { solver smoothSolver; smoother symGaussSeidel; nSweeps 1; tolerance 1e-6; relTol 0.1; }
}
PIMPLE { momentumPredictor no; nOuterCorrectors 1; nCorrectors 3; nNonOrthogonalCorrectors 1; }
relaxationFactors { equations { ".*" 1; } }
''')
write('system/decomposeParDict', 'dictionary', 'decomposeParDict', f'numberOfSubdomains {a.procs or 4};\nmethod scotch;\n')
import shutil
if os.path.isdir(os.path.join(a.out, '0')): shutil.rmtree(os.path.join(a.out, '0'))
shutil.copytree(os.path.join(a.out, '0.orig'), os.path.join(a.out, '0'))   # setFields then fills the pool in 0/
json.dump({'mesh': a.mesh, 'h0': h0, 'zLo': zLo, 'Vstatic_model': S.get('Vstatic'), 'arrivalPlane': 0.003, 'rWallArrival': r_of_z(0.003), 'level': lvl, 'end': a.end, 'jets': info, 'outlet_deg': [40, 140], 'outlet_z': [outBot, outTop] if a.outlet_at != 'leg' else [zLeg, zLeg], 'outlet_kind': a.outlet, 'outlet_at': a.outlet_at,
           'qout': [[t, q] for t, q in zip(S['tq'], S['Qout']) if t <= a.end + 0.05] if a.outlet == 'model' else None, 'zLeg': zLeg,
           'legVolume_est': (math.pi * rb ** 2 * (zBot - zLeg)) if a.outlet_at == 'leg' else 0.0, 'zBot': zBot, 'zTop': zTop,
           'D': D, 'Rr': Rr, 'Rp': Rp, 'ds': ds, 'triangles': {k: len(v) for k, v in tris.items()}}, open(os.path.join(a.out, 'case-info.json'), 'w'), indent=1)
print(json.dumps(json.load(open(os.path.join(a.out, 'case-info.json')))))
