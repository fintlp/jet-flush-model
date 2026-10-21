#!/usr/bin/env python3
"""Add wall clock, cores and the valid window to run summaries written before post.py recorded them.

    python3 cfd/add_runmeta.py RUN.json [JOB.log | --wall-clock S --cores N] [--qout cfd/washdown/inflow.json] [--valid-to T] [--note TEXT]

JOB.log is the runner's job log (logs/<job>.log on the Mac). With --qout the valid window is found as in post.py
(prescribed model outflow); --valid-to sets it by hand (pressure-outlet runs). The same functions as in post.py.
"""
import json, math, os, re, sys

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

if __name__ == '__main__':
    args = sys.argv[1:]
    run = args[0]
    S = json.load(open(run)); info = S['case']
    if len(args) > 1 and not args[1].startswith('--'):
        info.update(run_meta(None, open(args[1]).read()))
    if '--wall-clock' in args:   # by hand, from the status notes, when the job log is not at hand
        info.update({'wallClock_s': int(args[args.index('--wall-clock') + 1]), 'cores': int(args[args.index('--cores') + 1]) if '--cores' in args else 12})
    if '--qout' in args:
        Q = json.load(open(args[args.index('--qout') + 1]))
        info['qout'] = [[t, q] for t, q in zip(Q['tq'], Q['Qout'])]
    vt = float(args[args.index('--valid-to') + 1]) if '--valid-to' in args else valid_to(info, S['outflow'], info.get('end'))
    info['validTo'] = vt if vt is not None else info.get('end')
    info['validNote'] = args[args.index('--note') + 1] if '--note' in args else (
        'pool level and outflow comparable with the model up to validTo; the wall data run to the end, '
        'with more water in the bowl than the model after validTo' if vt is not None and vt < (info.get('end') or 0) else '')
    info.pop('qout', None)
    json.dump(S, open(run, 'w'), separators=(',', ':'))
    print(run, {k: info.get(k) for k in ('wallClock_s', 'solver_s', 'mesh_s', 'cores', 'validTo', 'end')})
