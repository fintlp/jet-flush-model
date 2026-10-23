#!/usr/bin/env python3
"""Drawing of a trapway case (make_case --outlet trap): section along the long axis through the bowl centre (front on
the left, wall on the right, as seen from the user's position) with the water at rest, and, for the wall-hung bowl,
a plan view. Run inside the generated case folder:

    python3 draw_trap.py [OUT.png]

Needs numpy, matplotlib and pyvista (cloud workspace)."""
import sys, json, math
import numpy as np, pyvista as pv, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
info = json.load(open('case-info.json')); T = info['trap']
D, Rr, Rp = info['D'], info['Rr'], info['Rp']
E = info.get('ovality', 1.0) or 1.0; sE = math.sqrt(E); e = info.get('poolShift', 0.0) or 0.0
WALLHUNG = abs(E - 1) > 1e-9 or abs(e) > 1e-12
stl = pv.read('constant/triSurface/bowl.stl')
sec = stl.slice(normal=(1, 0, 0), origin=(0, 0, 0))
y0, y1 = -Rr * sE - 0.02, T['yMax'] + 0.06
ys = np.arange(y0, y1, 0.0008); zs = np.arange(T['zLowest'] - 0.005, 0.0, 0.0008)
Y, Z = np.meshgrid(ys, zs); pts = pv.PolyData(np.c_[np.zeros(Y.size), Y.ravel(), Z.ravel()])
ins = pts.select_enclosed_points(stl, tolerance=1e-6, check_surface=False)['SelectedPoints'].reshape(Y.shape).astype(bool)
ins &= (Y < T['yCrest'])

def r_of_z(z):
    return Rp + (Rr - Rp) * math.cos(math.pi / 2 * (D - min(max(z, 0), D)) / D)
def c_of_z(z):
    return 0.0 if e == 0 or z >= D else e if z <= 0 else e * (1 - math.cos(math.pi / 2 * (D - z) / D))

if WALLHUNG:
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(15, 7.4), dpi=120, gridspec_kw={'width_ratios': [1.55, 1]})
else:
    fig, ax = plt.subplots(figsize=(12, 7.2), dpi=130); bx = None
ax.contourf(Y * 1000, Z * 1000, ins.astype(float), levels=[0.5, 1.5], colors=['#9cc8ec'])
lines = sec.lines; i = 0; P = sec.points
while i < len(lines):
    n = lines[i]; idx = lines[i + 1:i + 1 + n]; i += 1 + n
    q = P[idx]
    if q[:, 2].max() > D + 0.001: continue
    ax.plot(q[:, 1] * 1000, q[:, 2] * 1000, color='#333333', lw=1.4)
g = '#b03030'; xr = (y1 + 0.005) * 1000
def hl(z, x0, txt):
    ax.plot([x0, xr], [z, z], ls='--', color=g, lw=0.9); ax.text(xr + 3, z, txt, color=g, va='center', ha='left', fontsize=8.5)
hl(0, y0 * 1000, 'crest = bottom of the outlet bore\n= static waterline, z = 0')
hl(T['zDip'] * 1000, 20, 'dip under the back plate, z = -%.0f mm\n(water seal %.0f mm)' % (-T['zDip'] * 1000, -T['zDip'] * 1000))
hl(D * 1000, y0 * 1000, 'rim, %.0f mm above the water' % (D * 1000))
yo = T['yOutlet'] * 1000
ax.annotate('', xy=(yo + 6, 0), xytext=(yo + 6, T['d'] * 1000), arrowprops=dict(arrowstyle='<->', color=g))
ax.text(yo + 10, T['d'] * 500, 'bore\nØ %.0f mm' % (T['d'] * 1000), color=g, va='center', fontsize=8.5)
ax.plot([yo, yo], [-5, T['d'] * 1000 + 5], color='#1f6fb5', lw=3)
ax.text(yo, T['d'] * 1000 + 10, 'atmospheric\noutlet', color='#1f6fb5', ha='center', va='bottom', fontsize=8.5)
ax.text(T['yRise'] * 1000 + T['d'] * 500 + 4, -40, 'rising leg', color='#333', rotation=90, fontsize=9, va='center')
ax.text(T['yDip'] * 1000, T['zU'] * 1000 - T['d'] * 500 - 22, 'half bend (180°)', color='#333', ha='center', fontsize=9)
ax.text(-Rr * sE * 1000 * 0.75, D * 1000 * 0.55, 'front (user)', color='#333', fontsize=9)
ax.text(Rr * sE * 1000 * 0.35, D * 1000 * 0.85, 'wall side', color='#333', fontsize=9)
if e:
    ax.plot([0, 0], [-10, D * 1000 + 8], color='#888', lw=0.8, ls=':'); ax.text(2, D * 1000 + 10, 'bowl axis', color='#666', fontsize=8)
    ax.plot([e * 1000, e * 1000], [-60, 25], color='#1f6fb5', lw=0.8, ls=':'); ax.text(e * 1000 + 2, 27, 'pool axis\n(+%.0f mm)' % (e * 1000), color='#1f6fb5', fontsize=8)
ax.set_aspect('equal'); ax.set_xlim(y0 * 1000 - 5, xr + 125); ax.set_ylim(T['zLowest'] * 1000 - 15, D * 1000 + 35)
ax.set_xlabel('front to wall (mm)'); ax.set_ylabel('height above the static waterline (mm)')
ax.set_title('Section along the long axis, seen from the side; water at rest in blue', fontsize=10.5)
ax.grid(alpha=0.25)

if bx is not None:
    # plan view: rim, waterline, well bottom, trapway outline, jets; front at the bottom, wall at the top
    tt = np.linspace(0, 2 * np.pi, 361)
    def ell(r, c, **kw):
        bx.plot((r / sE) * np.cos(tt) * 1000, (c + r * sE * np.sin(tt)) * 1000, **kw)
    ell(Rr, 0.0, color='#333', lw=1.4, label='rim (330 x 275 mm)' if abs(E - 1.2) < 1e-6 else 'rim')
    ell(Rp, e, color='#1f6fb5', lw=1.2, label='static waterline')
    zb = T['wellBottom']; rw = Rp * (1 + 0.5 * zb / T['seal'])
    ell(rw, e + sE * (Rp - rw), color='#1f6fb5', lw=0.9, ls='--', label='well bottom')
    for zz in (0.05, 0.1, 0.15, 0.2):
        if zz < D: ell(r_of_z(zz), c_of_z(zz), color='#bbb', lw=0.6)
    rT = T['d'] / 2
    bx.fill_between([-rT * 1000, rT * 1000], T['yDip'] * 1000, T['yOutlet'] * 1000, color='#9cc8ec', alpha=0.35, label='trapway (Ø %.0f mm)' % (T['d'] * 1000))
    bx.plot([-rT * 1000, rT * 1000], [T['yOutlet'] * 1000] * 2, color='#1f6fb5', lw=3)
    for jn, J in info['jets'].items():
        a_ = math.radians(J['th0_deg']); px, py = (Rr / sE) * math.cos(a_) * 1000, (Rr * sE) * math.sin(a_) * 1000
        bx.plot(px, py, 'o', color=g); bx.annotate(jn, (px, py), textcoords='offset points', xytext=(8, -4 if py > 0 else 6), color=g, fontsize=9)
    bx.text(0, -Rr * sE * 1000 - 18, 'front (user)', ha='center', fontsize=9); bx.text(0, T['yOutlet'] * 1000 + 12, 'wall', ha='center', fontsize=9)
    bx.set_aspect('equal'); bx.set_xlabel('across (mm)'); bx.set_ylabel('front to wall (mm)')
    bx.set_title('Plan view', fontsize=10.5); bx.grid(alpha=0.25); bx.legend(fontsize=8, loc='lower right')
    bx.set_ylim(-Rr * sE * 1000 - 30, T['yOutlet'] * 1000 + 30)
fig.suptitle(('Wall-hung washdown pan for the CFD case: ovality %.1f, pool %.0f mm towards the wall, %.0f mm from rim to water'
              % (E, e * 1000, D * 1000)) if WALLHUNG else 'Washdown bowl with the wall-hung trap layout for the CFD case', fontsize=12)
plt.tight_layout(); plt.savefig(sys.argv[1] if len(sys.argv) > 1 else 'trap-design.png')
print('ok')
