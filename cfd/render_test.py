# Quick render test with ParaView (pvbatch): water surface and bowl of a finished run, two stills.
#
#   /Applications/ParaView-*.app/Contents/bin/pvbatch ~/Downloads/jetflush-cfd/tools/render_test.py [case] [time]
#
# Default case: cases/washdown-coarse-modelout (written every 0.25 s), time 1.0 s. Writes
# ~/Downloads/jetflush-cfd/renders/<case>_<time>_oblique.png and _top.png, and render.log next to them.
import os, sys, traceback
from paraview.simple import *

ROOT = os.path.expanduser('~/Downloads/jetflush-cfd')
case = sys.argv[1] if len(sys.argv) > 1 else 'washdown-coarse-modelout'
want = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
cdir = os.path.join(ROOT, 'cases', case)
out = os.path.join(ROOT, 'renders'); os.makedirs(out, exist_ok=True)
log = open(os.path.join(out, 'render.log'), 'a')
def say(*a):
    msg = ' '.join(str(x) for x in a); print(msg); log.write(msg + '\n'); log.flush()

try:
    foam = os.path.join(cdir, 'case.foam'); open(foam, 'a').close()
    def reader(regions):
        r = OpenFOAMReader(FileName=foam)
        r.CaseType = 'Decomposed Case' if os.path.isdir(os.path.join(cdir, 'processor0')) else 'Reconstructed Case'
        r.UpdatePipelineInformation()
        avail = list(r.GetProperty('MeshRegions').Available) if hasattr(r.GetProperty('MeshRegions'), 'Available') else []
        pick = [x for x in avail if x in regions or x.split('/')[-1] in regions] or regions
        r.MeshRegions = pick
        r.CellArrays = ['alpha.water', 'U']
        return r, avail
    fluid, avail = reader(['internalMesh'])
    say('regions available:', avail)
    times = list(fluid.TimestepValues) if fluid.TimestepValues else []
    say('times:', times)
    t = min(times, key=lambda x: abs(x - want)) if times else 0.0
    bowl, _ = reader(['patch/wall', 'wall'])

    view = CreateView('RenderView') if not GetActiveView() else GetActiveView()
    view.ViewSize = [1920, 1080]
    view.ViewTime = t
    view.Background = [1, 1, 1]
    try: view.UseColorPaletteForBackground = 0
    except Exception: pass
    view.OrientationAxesVisibility = 0
    try: view.UseFXAA = 1
    except Exception: pass

    # bowl wall: white ceramic, slightly transparent so the water shows through
    bd = Show(bowl, view)
    ColorBy(bd, None)
    bd.DiffuseColor = [0.93, 0.93, 0.92]; bd.AmbientColor = [0.93, 0.93, 0.92]
    bd.Opacity = 0.35; bd.Specular = 0.3

    # water surface: alpha = 0.5, coloured by speed
    pts = CellDatatoPointData(Input=fluid)
    iso = Contour(Input=pts); iso.ContourBy = ['POINTS', 'alpha.water']; iso.Isosurfaces = [0.5]
    iso.ComputeScalars = 0
    try: iso.ComputeNormals = 1
    except Exception: pass
    wd = Show(iso, view)
    ColorBy(wd, ('POINTS', 'U', 'Magnitude'))
    lut = GetColorTransferFunction('U')
    try: lut.ApplyPreset('Blues', True); lut.InvertTransferFunction()
    except Exception: pass
    lut.RescaleTransferFunction(0.0, 2.5)
    wd.Specular = 0.5
    bar = GetScalarBar(lut, view); bar.Title = 'Water speed (m/s)'; bar.ComponentTitle = ''
    bar.TitleColor = [0.2, 0.2, 0.2]; bar.LabelColor = [0.2, 0.2, 0.2]; bar.WindowLocation = 'Any Location'
    bar.Position = [0.88, 0.25]; bar.ScalarBarLength = 0.5
    wd.SetScalarBarVisibility(view, True)

    title = Text(Text='CFD reference: water surface at t = %.2f s after the flush starts' % t)
    td = Show(title, view); td.FontSize = 26; td.Color = [0.15, 0.15, 0.15]; td.WindowLocation = 'Upper Left Corner'
    note = Text(Text='OpenFOAM interFoam (VOF), washdown preset, coarse mesh (3 mm at the wall). Simulation, not a measurement.')
    nd = Show(note, view); nd.FontSize = 16; nd.Color = [0.35, 0.35, 0.35]; nd.WindowLocation = 'Lower Left Corner'

    base = os.path.join(out, '%s_%.2fs' % (case, t))
    # oblique view from the front, above the rim
    view.CameraPosition = [0.0, -0.42, 0.40]; view.CameraFocalPoint = [0.0, 0.0, 0.03]; view.CameraViewUp = [0, 0, 1]
    view.CameraViewAngle = 30
    Render(view); SaveScreenshot(base + '_oblique.png', view, ImageResolution=[1920, 1080])
    say('wrote', base + '_oblique.png')
    # top view
    view.CameraPosition = [0.0, 0.0, 0.75]; view.CameraFocalPoint = [0.0, 0.0, 0.0]; view.CameraViewUp = [0, 1, 0]
    Render(view); SaveScreenshot(base + '_top.png', view, ImageResolution=[1920, 1080])
    say('wrote', base + '_top.png')
    say('done')
except Exception:
    say('FAILED'); say(traceback.format_exc())
