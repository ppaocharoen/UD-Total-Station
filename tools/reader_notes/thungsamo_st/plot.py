import ext,sys,matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
i=int(sys.argv[1]); x0,x1,y0,y1=map(float,sys.argv[2].split(',')); out=sys.argv[3]
COL={'ST_Beam_คสล.':'k','ST_SLAP':'tab:blue','ST_Colum_คสล.':'r','ST_Line ปีกกา':'tab:orange','1':'tab:green','ST_Stair':'m','ST_Steel':'tab:brown','ST_Roof_แป':'tab:cyan','ST_Roof_จันทัน':'tab:purple','ST_Roof_ตะเข่':'tab:pink','0':'0.5','ST_Footing':'k','ST_Pile':'r','4':'0.6'}
fig,ax=plt.subplots(figsize=((x1-x0)*1.1,(y1-y0)*1.1))
for lay,c in COL.items():
    for p in ext.L(i,(lay,)):
        xs=[a[0] for a in p]; ys=[a[1] for a in p]
        if max(xs)<x0 or min(xs)>x1 or max(ys)<y0 or min(ys)>y1: continue
        ax.plot(xs,ys,color=c,lw=0.8)
for t,x,y,_ in ext.texts(i):
    if x0<=x<=x1 and y0<=y<=y1: ax.text(x,y,t,fontsize=7,color='m')
ax.set_xlim(x0,x1); ax.set_ylim(y0,y1); ax.set_aspect('equal')
import numpy as np
ax.set_xticks(np.arange(np.ceil(x0*2)/2,x1,0.5)); ax.set_yticks(np.arange(np.ceil(y0*2)/2,y1,0.5)); ax.grid(lw=0.3); ax.tick_params(labelsize=6)
plt.savefig(out,dpi=110,bbox_inches='tight')
