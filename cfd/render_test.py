# Render stills of a finished run with ParaView (pvbatch): water surface in the bowl, three views.
#
#   /Applications/ParaView-*.app/Contents/bin/pvbatch ~/Downloads/jetflush-cfd/tools/render_test.py [case] [time]
#
# Default case: cases/washdown-coarse-modelout, time 1.0 s. Writes into ~/Downloads/jetflush-cfd/renders/:
#   <case>_<t>s_oblique.png   whole bowl from the front, bowl wall see-through
#   <case>_<t>s_cutaway.png   front half of the bowl removed, view into the back wall and the pool
#   <case>_<t>s_top.png       from above
#   <case>_<t>s_cutaway_rt.png  same as cutaway with ray tracing (only if this ParaView build has OSPRay)
# and render.log next to them.
#
# Version 3: bowl drawn with jet and outlet patches, camera fitted with ResetCamera, fixed colour scale 0 to 2.5 m/s.
# Version 2: the decomposed case is merged before the surface is drawn (version 1 showed seams at the borders of the
# 12 processor parts), the surface is lightly smoothed for display, the camera is fitted to the bowl, and the colour
# scale runs from light blue (slow) to dark blue (fast).
import os, sys, math, traceback
from paraview.simple import *

ROOT = os.path.expanduser('~/Downloads/jetflush-cfd')
case = sys.argv[1] if len(sys.argv) > 1 else 'washdown-coarse-modelout'
want = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
cdir = os.path.join(ROOT, 'cases', case)
out = os.path.join(ROOT, 'renders'); os.makedirs(out, exist_ok=True)
log = open(os.path.join(out, 'render.log'), 'a')
def say(*a):
    msg = ' '.join(str(x) for x in a); print(msg); log.write(msg + '\n'); log.flush()

MESH = {'coarse': '3 mm', 'medium': '2 mm', 'fine': '1 mm'}
mesh = next((m for m in MESH if m in case), None)
VMAX = 2.5   # top of the colour scale, m/s

def merged(src):
    """One block with coincident points merged, so data is averaged across processor borders."""
    m = MergeBlocks(Input=src)
    try: m.MergePoints = 1
    except Exception: pass
    try: return CleantoGrid(Input=m)
    except Exception: return m

try:
    say('== render v2', case, 'wanted t =', want)
    foam = os.path.join(cdir, 'case.foam'); open(foam, 'a').close()
    def reader(regions):
        r = OpenFOAMReader(FileName=foam)
        r.CaseType = 'Decomposed Case' if os.path.isdir(os.path.join(cdir, 'processor0')) else 'Reconstructed Case'
        r.UpdatePipelineInformation()
        avail = list(r.GetProperty('MeshRegions').Available) if hasattr(r.GetProperty('MeshRegions'), 'Available') else []
        pick = [x for x in avail if x in regions or x.split('/')[-1] in regions] or regions
        r.MeshRegions = pick
        r.CellArrays = ['alpha.water', 'U']
        return r
    fluid = reader(['internalMesh'])
    times = list(fluid.TimestepValues) if fluid.TimestepValues else []
    t = min(times, key=lambda x: abs(x - want)) if times else 0.0
    say('time used:', t)
    # bowl: wall plus the jet and outlet patches, so the bowl has no holes
    bowl = merged(reader(['patch/wall', 'wall', 'patch/jet1', 'patch/jet2', 'patch/outlet']))
    bowl.UpdatePipeline(t)
    x0, x1, y0, y1, z0, z1 = bowl.GetDataInformation().GetBounds()
    R = max(x1 - x0, y1 - y0) / 2; zc = (z0 + z1) / 2
    say('bowl bounds:', [round(v, 3) for v in (x0, x1, y0, y1, z0, z1)])

    # water surface: merge the processor parts, cell -> point data, alpha = 0.5, light smoothing for display
    pts = CellDatatoPointData(Input=merged(fluid))
    iso = Contour(Input=pts); iso.ContourBy = ['POINTS', 'alpha.water']; iso.Isosurfaces = [0.5]
    iso.ComputeScalars = 0
    surf = iso
    try:
        sm = Smooth(Input=ExtractSurface(Input=iso)); sm.NumberofIterations = 15; surf = sm
    except Exception: say('smoothing not available, unsmoothed surface')
    try: surf = GenerateSurfaceNormals(Input=surf)
    except Exception: pass

    # front half removed, for the cut-away view (camera looks along +y)
    def cut(src):
        c = Clip(Input=src); c.ClipType = 'Plane'; c.ClipType.Origin = [0, 0.0, 0]; c.ClipType.Normal = [0, 1, 0]
        try: c.Invert = 0
        except Exception: pass
        return c
    bowl_cut = cut(bowl); surf_cut = cut(surf)

    view = CreateView('RenderView')
    view.ViewSize = [1920, 1080]; view.ViewTime = t
    view.Background = [1, 1, 1]
    try: view.UseColorPaletteForBackground = 0
    except Exception: pass
    view.OrientationAxesVisibility = 0
    try: view.UseFXAA = 1
    except Exception: pass

    lut = GetColorTransferFunction('U')
    try: lut.AutomaticRescaleRangeMode = 'Never'
    except Exception: pass
    lut.VectorMode = 'Magnitude'
    def fix_lut():
        lut.RGBPoints = [0.0, 0.78, 0.90, 0.98,  0.35 * VMAX, 0.42, 0.68, 0.90,  0.6 * VMAX, 0.20, 0.50, 0.82,  VMAX, 0.03, 0.19, 0.45]
        lut.RescaleTransferFunction(0.0, VMAX)

    def show_water(src):
        d = Show(src, view); ColorBy(d, ('POINTS', 'U', 'Magnitude')); d.LookupTable = lut
        fix_lut()   # ColorBy rescales to the data range; put the fixed scale back
        d.Specular = 0.4; d.SpecularPower = 40
        return d
    def show_bowl(src, opacity):
        d = Show(src, view); ColorBy(d, None)
        d.DiffuseColor = [0.95, 0.95, 0.94]; d.AmbientColor = [0.95, 0.95, 0.94]
        d.Opacity = opacity; d.Specular = 0.25
        return d

    bar = GetScalarBar(lut, view); bar.Title = 'Water speed (m/s)'; bar.ComponentTitle = ''
    bar.TitleColor = [0.2, 0.2, 0.2]; bar.LabelColor = [0.2, 0.2, 0.2]
    bar.TitleFontSize = 18; bar.LabelFontSize = 16
    try:
        v = GetParaViewVersion(); fmt = '{:.1f}' if (v.major, v.minor) >= (6, 0) else '%.1f'
    except Exception: fmt = '{:.1f}'
    try: bar.AutomaticLabelFormat = 0; bar.LabelFormat = fmt; bar.RangeLabelFormat = fmt
    except Exception: pass
    bar.WindowLocation = 'Any Location'; bar.Position = [0.89, 0.28]; bar.ScalarBarLength = 0.44

    title = Text(Text='Water on the bowl wall, %.2f s after the flush starts' % t)
    td = Show(title, view); td.FontSize = 28; td.Color = [0.12, 0.12, 0.12]; td.WindowLocation = 'Upper Left Corner'
    note = Text(Text='CFD reference: OpenFOAM interFoam (VOF), washdown preset, %s cells at the wall. '
                     'Surface at water fraction 0.5, lightly smoothed for display. Simulation, not a measurement.'
                     % (MESH.get(mesh, '?')))
    nd = Show(note, view); nd.FontSize = 15; nd.Color = [0.35, 0.35, 0.35]; nd.WindowLocation = 'Lower Left Corner'

    base = os.path.join(out, '%s_%.2fs' % (case, t))
    def cam(pos, up, angle=30):
        # set the viewing direction, then let ParaView fit the visible bowl into the picture with a margin
        view.CameraPosition = pos; view.CameraFocalPoint = [0.0, 0.0, zc]; view.CameraViewUp = up
        view.CameraViewAngle = angle; view.CameraParallelProjection = 0
        try: view.ResetCamera(False)
        except Exception: view.ResetCamera()
        try: view.GetActiveCamera().Dolly(1.05)
        except Exception: pass
    def shoot(name):
        Render(view); SaveScreenshot(base + name, view, ImageResolution=[1920, 1080]); say('wrote', base + name)
    def only(*reps):
        for s in (bowl, surf, bowl_cut, surf_cut):
            Hide(s, view)
        for r in reps: r()

    # 1 oblique, whole bowl see-through
    only(lambda: show_bowl(bowl, 0.30), lambda: show_water(surf))
    GetDisplayProperties(surf, view).SetScalarBarVisibility(view, True)
    el = math.radians(38); d = 3.4 * R
    cam([0.0, -d * math.cos(el), zc + d * math.sin(el)], [0, 0, 1])
    shoot('_oblique.png')

    # 2 cut-away: front half removed, slightly lower camera
    only(lambda: show_bowl(bowl_cut, 1.0), lambda: show_water(surf_cut))
    GetDisplayProperties(surf_cut, view).SetScalarBarVisibility(view, True)
    el = math.radians(28); d = 3.2 * R
    cam([0.0, -d * math.cos(el), zc + d * math.sin(el)], [0, 0, 1])
    shoot('_cutaway.png')

    # 3 top view, whole bowl, room for title and caption
    only(lambda: show_bowl(bowl, 0.30), lambda: show_water(surf))
    GetDisplayProperties(surf, view).SetScalarBarVisibility(view, True)
    cam([0.0, 0.0, z1 + 1.45 * R / math.tan(math.radians(15))], [0, 1, 0])
    shoot('_top.png')

    # 4 optional: ray-traced cut-away (soft shadows), if OSPRay is in this build
    try:
        only(lambda: show_bowl(bowl_cut, 1.0), lambda: show_water(surf_cut))
        GetDisplayProperties(surf_cut, view).SetScalarBarVisibility(view, True)
        el = math.radians(28); d = 3.2 * R
        cam([0.0, -d * math.cos(el), zc + d * math.sin(el)], [0, 0, 1])
        view.EnableRayTracing = 1; view.BackEnd = 'OSPRay raycaster'; view.Shadows = 1
        view.SamplesPerPixel = 16; view.AmbientSamples = 4
        shoot('_cutaway_rt.png')
        view.EnableRayTracing = 0
    except Exception as e:
        say('ray tracing skipped:', e)
    say('done')
except Exception:
    say('FAILED'); say(traceback.format_exc())
