import sys; sys.path.insert(0,'/home/claude/th12work/s1')
import ext, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
num=sys.argv[1]; x0,y0=float(sys.argv[2]),float(sys.argv[3]); X0,X1,Y0,Y1=map(float,sys.argv[4:8]); out=sys.argv[8]
s=ext.sheet(num); f=ext.P(x0,y0)
cols=['r','b','g','m','c','orange','brown','k','olive','purple','teal','navy']; L={}
fig,ax=plt.subplots(figsize=(18,18*(Y1-Y0)/(X1-X0)))
for q in s['prims']:
  if not q.get('p') or q['kind'] not in('line','poly'): continue
  lay=q.get('layer'); 
  if lay in ('DIMS','DEFPOINTS','L-DIM','DIM'): continue
  c=L.setdefault(lay,cols[len(L)%len(cols)])
  pts=[f(p) for p in q['p']]+([f(q['p'][0])] if q.get('closed') else [])
  if not any(X0<x<X1 and Y0<y<Y1 for x,y in pts): continue
  ax.plot([p[0] for p in pts],[p[1] for p in pts],c=c,lw=0.7)
for q in s['prims']:
  if q['kind']=='text' and q.get('at'):
    x,y=f(q['at'])
    if X0<x<X1 and Y0<y<Y1: ax.text(x,y,q.get('text',''),fontsize=7,color='navy')
ax.set_xlim(X0,X1); ax.set_ylim(Y0,Y1); ax.set_aspect('equal'); ax.grid(True,lw=0.2)
import numpy as np; ax.set_xticks(np.arange(np.ceil(X0),X1,0.5)); ax.set_yticks(np.arange(np.ceil(Y0),Y1,0.5))
ax.legend(handles=[plt.Line2D([],[],c=c,label=str(k)) for k,c in L.items()],fontsize=7,loc='upper right')
plt.savefig(out,dpi=90,bbox_inches='tight')
