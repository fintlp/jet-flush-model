#!/usr/bin/env python3
"""Full-height section along the long axis through the pool axis (frames/*/section.vtp of make_case --frames): top row water
fraction, bottom row the speed through the section in the water (the swirl). Run in the case folder:

    python3 plot_sections.py 0.5,1,2,2.9,4,5.5 OUT.png [bowl.stl]
"""
import sys, json, numpy as np, pyvista as pv, matplotlib, glob, os
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.tri import Triangulation
info=json.load(open('case-info.json')); D=info['D']
stl=pv.read(sys.argv[3] if len(sys.argv) > 3 else 'constant/triSurface/bowl.stl')
sec=stl.slice(normal=(1,0,0),origin=(0.001,0,0))
segs=[]; L=sec.lines; i=0
while i<len(L):
    n=L[i]; segs.append(sec.points[L[i+1:i+1+n]]); i+=1+n
S=json.load(open('summary.json')); bal=S['trap']['balance']
def near(t): return min(bal,key=lambda r:abs(r['t']-t))
times=[float(x) for x in sys.argv[1].split(',')]
fig,axs=plt.subplots(2,len(times),figsize=(3.1*len(times),8.2),dpi=130,sharey=True, squeeze=False)
for k,t in enumerate(times):
    d=min(glob.glob('frames/*'),key=lambda p:abs(float(os.path.basename(p))-t))
    m=pv.read(os.path.join(d,'section.vtp')).triangulate()
    if 'alpha.water' not in m.point_data: m=m.cell_data_to_point_data()
    P=m.points; tri=m.faces.reshape(-1,4)[:,1:]
    a=np.clip(m.point_data['alpha.water'],0,1); U=m.point_data['U']
    T=Triangulation(P[:,1]*1000,P[:,2]*1000,tri)
    ax=axs[0,k]; c1=ax.tripcolor(T,a,cmap='Blues',vmin=0,vmax=1,shading='gouraud')
    bx=axs[1,k]; ut=np.abs(U[:,0]); ut=np.where(a>0.5,ut,np.nan)
    tm=np.isnan(ut[tri]).any(axis=1); T2=Triangulation(P[:,1]*1000,P[:,2]*1000,tri,mask=tm)
    c2=bx.tripcolor(T2,np.nan_to_num(ut),cmap='magma_r',vmin=0,vmax=1.5,shading='gouraud')
    r=near(t)
    for x in (ax,bx):
        for q in segs: x.plot(q[:,1]*1000,q[:,2]*1000,color='#222',lw=0.8)
        x.axhline(0,color='#b03030',lw=0.6,ls='--'); x.set_aspect('equal'); x.set_xlim(-170,230); x.set_ylim(-130,295)
    ax.set_title('t = %.1f s\nabove crest %.2f L, over rim %.2f L'%(float(os.path.basename(d)),r['VaboveCrest']*1000,r['Vrim']*1000),fontsize=8.5)
    if k==0: ax.set_ylabel('height above the static waterline (mm)'); bx.set_ylabel('height (mm)')
    bx.set_xlabel('front to wall (mm)',fontsize=8)
fig.colorbar(c1,ax=axs[0,:].tolist(),shrink=0.8,label='water fraction (1 = water)')
fig.colorbar(c2,ax=axs[1,:].tolist(),shrink=0.8,label='swirl speed in the water (m/s)\n(speed through the section)')
fig.suptitle((info.get('label') or 'CFD run') + ': section along the long axis through the pool axis. Top: where the water is. Bottom: how fast it swirls. Red dashed line: crest (z = 0).',fontsize=10)
plt.savefig(sys.argv[2],bbox_inches='tight'); print('ok')
