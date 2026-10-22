#!/usr/bin/env python3
"""Section drawing of the trapway case (make_case --outlet trap): run inside the generated case folder.
Writes the PNG path given as the first argument (default trap-design.png)."""
import sys
import json, numpy as np, pyvista as pv, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
info = json.load(open('case-info.json')); T = info['trap']
stl = pv.read('constant/triSurface/bowl.stl')
sec = stl.slice(normal=(1, 0, 0), origin=(0, 0, 0))
# water at rest: inside the surface, z < 0, before the weir (y < yCrest)
ys = np.arange(-0.16, 0.27, 0.0008); zs = np.arange(-0.13, 0.0, 0.0008)
Y, Z = np.meshgrid(ys, zs); pts = pv.PolyData(np.c_[np.zeros(Y.size), Y.ravel(), Z.ravel()])
ins = pts.select_enclosed_points(stl, tolerance=1e-6, check_surface=False)['SelectedPoints'].reshape(Y.shape).astype(bool)
ins &= (Y < T['yCrest'])
fig, ax = plt.subplots(figsize=(12, 7.2), dpi=130)
ax.contourf(Y * 1000, Z * 1000, ins.astype(float), levels=[0.5, 1.5], colors=['#9cc8ec'])
lines = sec.lines; i = 0; P = sec.points
while i < len(lines):
    n = lines[i]; idx = lines[i + 1:i + 1 + n]; i += 1 + n
    q = P[idx]
    if q[:, 2].max() > 0.151: continue
    ax.plot(q[:, 1] * 1000, q[:, 2] * 1000, color='#333333', lw=1.4)
g = '#b03030'
def hl(z, x0, x1, txt, ha='left'):
    ax.plot([x0, x1], [z, z], ls='--', color=g, lw=0.9); ax.text(x1 + 3 if ha == 'left' else x0 - 3, z, txt, color=g, va='center', ha=ha, fontsize=9)
hl(0, -170, 300, 'crest = bottom of the outlet bore = static waterline  z = 0')
hl(T['zDip'] * 1000, 20, 300, 'dip under the back plate  z = -%.0f mm  (water seal %.0f mm)' % (-T['zDip'] * 1000, -T['zDip'] * 1000))
yo = T['yOutlet'] * 1000
ax.annotate('', xy=(yo + 6, 0), xytext=(yo + 6, T['d'] * 1000), arrowprops=dict(arrowstyle='<->', color=g))
ax.text(yo + 10, T['d'] * 500, 'bore Ø %.0f mm' % (T['d'] * 1000), color=g, va='center', fontsize=9)
ax.plot([yo, yo], [-5, T['d'] * 1000 + 5], color='#1f6fb5', lw=3)
ax.text(yo, T['d'] * 1000 + 10, 'atmospheric outlet\n(towards the wall)', color='#1f6fb5', ha='center', va='bottom', fontsize=8.5)
yr = (T['yDip'] + T['uBend_R'] + T['bottomStraight']) * 1000
ax.text(yr + 22, -40, 'rising leg', color='#333', rotation=90, fontsize=9, va='center')
ax.text(T['yDip'] * 1000 + 10, T['zU'] * 1000 - 50, 'half bend (180°)', color='#333', ha='center', fontsize=9)
ax.text(40, -12, 'back\nplate', color='#333', fontsize=8.5, ha='left', va='center')
ax.text(-60, -20, 'well', color='#333', fontsize=9, ha='center')
ax.text(-110, 90, 'bowl (front)', color='#333', fontsize=9); ax.text(60, 125, 'rear (wall side)', color='#333', fontsize=9)
ax.set_aspect('equal'); ax.set_xlim(-175, 330); ax.set_ylim(-150, 160)
ax.set_xlabel('y, front to rear (mm)'); ax.set_ylabel('z (mm)')
ax.set_title('Wall-hung washdown pan for the CFD case: section through the bowl centre, water at rest (blue)', fontsize=11)
ax.grid(alpha=0.25)
plt.tight_layout(); plt.savefig((sys.argv[1] if len(sys.argv) > 1 else 'trap-design.png'))
print('ok')
