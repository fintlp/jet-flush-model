#!/usr/bin/env python3
"""Stills and a short video of a CFD run for the page, from the free-surface frames (postProcessing/frames).

    python3 cfd/render_media.py FRAMES_DIR BOWL_STL OUT_DIR --mesh coarse [--stills 0.3,0.6,1.0,2.0] [--fps 20]

FRAMES_DIR holds <t>/freeSurface.vtp (water fraction 0.5 surface with the velocity U), written by the run every
0.02 s. BOWL_STL is the case's constant/triSurface/bowl.stl (cfd/make_case.py). Renders off screen with VTK through
PyVista (pip install vtk pyvista), so it runs in the cloud workspace; ffmpeg makes the H.264 video.

Writes into OUT_DIR: cutaway_<t>s.jpg and top_<t>s.jpg (1280 x 720), flush.mp4 (cut-away view, the flush slowed
down 2.5 times), flush.jpg (poster) and manifest.json in the form the page reads.
"""
import argparse, glob, json, os, shutil, subprocess, sys
import numpy as np
import pyvista as pv

ap = argparse.ArgumentParser()
ap.add_argument('frames'); ap.add_argument('stl'); ap.add_argument('out')
ap.add_argument('--mesh', default='coarse'); ap.add_argument('--run', default='')
ap.add_argument('--stills', default='0.3,0.6,1.0,2.0'); ap.add_argument('--fps', type=int, default=20)
ap.add_argument('--vmax', type=float, default=2.5); ap.add_argument('--rim', type=float, default=0.15)
ap.add_argument('--no-video', action='store_true')
ap.add_argument('--valid-to', type=float, default=None, help='validTo of the run (s); captions after it say so')
a = ap.parse_args()
pv.OFF_SCREEN = True
os.makedirs(a.out, exist_ok=True)
CELLS = {'coarse': '3 mm', 'medium': '2 mm', 'fine': '1 mm'}.get(a.mesh, a.mesh)
W, H = 1280, 720

# bowl: the case surface below the rim (drops the air region above the rim and the open top)
stl = pv.read(a.stl).clean()
bowl = stl.extract_points(stl.points[:, 2] <= a.rim + 1e-4, adjacent_cells=False).extract_surface().clean()
bowl = bowl.compute_normals(auto_orient_normals=False, split_vertices=True, feature_angle=60)
bowl_cut = bowl.clip(normal=(0, -1, 0), origin=(0, 0, 0), invert=True)   # keeps y >= 0, the back half

times = sorted(float(os.path.basename(d)) for d in glob.glob(os.path.join(a.frames, '*')) if os.path.isfile(os.path.join(d, 'freeSurface.vtp')))
def tdir(t): return min(glob.glob(os.path.join(a.frames, '*')), key=lambda d: abs(float(os.path.basename(d)) - t) if os.path.basename(d).replace('.', '', 1).isdigit() else 1e9)

def water(t, cut):
    m = pv.read(os.path.join(tdir(t), 'freeSurface.vtp'))
    if m.n_points == 0: return None
    m = m.extract_points(m.points[:, 2] <= a.rim + 0.002, adjacent_cells=False).extract_surface() if m.points[:, 2].max() > a.rim + 0.002 else m
    m = m.smooth(n_iter=15, relaxation_factor=0.1)
    m['speed'] = np.linalg.norm(m.point_data['U'], axis=1) if 'U' in m.point_data else np.zeros(m.n_points)
    m = m.compute_normals(auto_orient_normals=False)
    return m.clip(normal=(0, -1, 0), origin=(0, 0, 0), invert=True) if cut else m

# light blue (slow) to dark blue (fast), as in the ParaView stills
from matplotlib.colors import LinearSegmentedColormap
CMAP = LinearSegmentedColormap.from_list('water', [(0.0, (0.78, 0.90, 0.98)), (0.35, (0.42, 0.68, 0.90)),
                                                    (0.6, (0.20, 0.50, 0.82)), (1.0, (0.03, 0.19, 0.45))])

def frame(t, view, path, title=True):
    p = pv.Plotter(off_screen=True, window_size=(W, H))
    p.set_background('white')
    cut = view == 'cutaway'
    p.add_mesh(bowl_cut if cut else bowl, color=(0.95, 0.95, 0.94), smooth_shading=True, specular=0.25,
               opacity=1.0 if cut else 0.30)
    w = water(t, cut)
    if w is not None and w.n_points:
        p.add_mesh(w, scalars='speed', cmap=CMAP, clim=(0, a.vmax), smooth_shading=True, specular=0.4,
                   specular_power=40, show_scalar_bar=True,
                   scalar_bar_args=dict(title='', vertical=True, position_x=0.885, position_y=0.22,
                                        height=0.5, width=0.05, color='#333333', fmt='%.1f', n_labels=6,
                                        title_font_size=16, label_font_size=14))
    # viewing direction, then fit the bowl into the picture and leave room for the title and the caption
    if cut:
        p.camera_position = [(0, -0.60, 0.33), (0, 0, 0.03), (0, 0, 1)]
    else:
        p.camera_position = [(0, 0, 0.9), (0, 0, 0.0), (0, 1, 0)]
    p.camera.view_angle = 30
    p.reset_camera(bounds=(bowl_cut if cut else bowl).bounds)
    p.camera.zoom(1.22 if cut else 1.15)
    if w is not None and w.n_points:
        p.add_text('Water speed (m/s)', position=(int(W * 0.84), int(H * 0.75)), font_size=10, color='#333333')
    if title:
        p.add_text('Water on the bowl wall, %.2f s after the flush starts' % t, position=(18, H - 42), font_size=15, color='#1f1f1f')
        p.add_text('CFD reference: OpenFOAM interFoam (VOF), washdown preset, %s cells at the wall. Simulation, not a measurement.' % CELLS,
                   position=(18, 12), font_size=9, color='#595959')
    p.enable_anti_aliasing('ssaa')
    p.screenshot(path, return_img=False)
    p.close()

def to_jpg(png, jpg, q=85):
    from PIL import Image
    Image.open(png).convert('RGB').save(jpg, quality=q, optimize=True, progressive=True)
    os.remove(png)

def LATE(t):
    return ('' if a.valid_to is None or t <= a.valid_to + 1e-9 else
            ' After %.1f s the trap outlet in this run draws air, so the bowl holds more water than in the fast model.' % a.valid_to)

stills = []
for t in [float(x) for x in a.stills.split(',') if x]:
    tt = min(times, key=lambda x: abs(x - t))
    for view, what in (('cutaway', 'front half of the bowl removed'), ('top', 'seen from above, bowl wall see-through')):
        name = '%s_%.1fs.jpg' % (view, tt)
        frame(tt, view, os.path.join(a.out, '_tmp.png')); to_jpg(os.path.join(a.out, '_tmp.png'), os.path.join(a.out, name))
        stills.append({'file': name, 't': tt, 'view': view,
                       'caption': 'Water surface %.1f s after the flush starts, %s; colour shows the water speed. OpenFOAM CFD, %s mesh (%s cells at the wall).'
                                  % (tt, what, a.mesh, CELLS) + LATE(tt)})
        print('still', name, os.path.getsize(os.path.join(a.out, name)) // 1024, 'kB')

video = None
if not a.no_video:
    tmp = os.path.join(a.out, '_frames'); os.makedirs(tmp, exist_ok=True)
    for i, t in enumerate(times):
        frame(t, 'cutaway', os.path.join(tmp, 'f%04d.png' % i))
    vid = os.path.join(a.out, 'flush.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', os.path.join(tmp, 'f%04d.png'),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', vid], check=True)
    pick = min(range(len(times)), key=lambda i: abs(times[i] - 1.0))
    to_jpg(os.path.join(tmp, 'f%04d.png' % pick), os.path.join(a.out, 'flush.jpg'))
    shutil.rmtree(tmp)
    slow = 1 / (0.02 * a.fps)
    video = {'file': 'flush.mp4', 'poster': 'flush.jpg', 'fps': a.fps, 'slowdown': round(slow, 2), 't0': times[0], 't1': times[-1],
             'caption': 'The first %.1f s of the flush, slowed down %.1f times, front half of the bowl removed; colour shows the water speed. OpenFOAM CFD, %s mesh (%s cells at the wall).'
                        % (times[-1], slow, a.mesh, CELLS) + LATE(times[-1])}
    print('video', os.path.getsize(vid) // 1024, 'kB')

man = {'run': a.run, 'mesh': a.mesh, 'video': video, 'stills': stills}
json.dump(man, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
print('manifest with', len(stills), 'stills', 'and a video' if video else 'no video')
