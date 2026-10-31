import ext, sys, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
num=sys.argv[1]; X0,X1,Y0,Y1=map(float,sys.argv[2:6]); out=sys.argv[6]
x0,y0=1034.108,1455.664
s=ext.sheet(num); f=ext.P(x0,y0)
col={'hatch':'r','WALL':'k','SYMB_W':'b','P1':'m','0':'0.5','WC-OUT':'g','WC-OUTL':'g','DW_line':'c','clom_n':'orange','Floor_line':'y','8':'brown'}
fig,ax=plt.subplots(figsize=(16,16*(Y1-Y0)/(X1-X0)))
for q in s['prims']:
  if not q.get('p') or q['kind'] not in('line','poly'): continue
  pts=[f(p) for p in q['p']]+([f(q['p'][0])] if q.get('closed') else [])
  if not any(X0<x<X1 and Y0<y<Y1 for x,y in pts): continue
  c=col.get(q.get('layer'),'0.8')
  ax.plot([p[0] for p in pts],[p[1] for p in pts],c=c,lw=0.6)
for q in s['prims']:
  if q['kind']=='text' and q.get('p'):
    x,y=f(q['p'][0])
    if X0<x<X1 and Y0<y<Y1: ax.text(x,y,q.get('t',''),fontsize=6,color='navy')
ax.set_xlim(X0,X1); ax.set_ylim(Y0,Y1); ax.set_aspect('equal'); ax.grid(True,lw=0.2)
import numpy as np; ax.set_xticks(np.arange(round(X0,1),X1,0.1),minor=True)
plt.savefig(out,dpi=110,bbox_inches='tight')
