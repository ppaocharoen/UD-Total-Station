import pickle,collections,sys,math,json
import os
S=pickle.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','dwg','sheets.pkl'),'rb'))
X0={13:6939.663,14:7009.663,15:7079.663,16:7149.663,17:7219.663}; Y0=-810.89
def L(i,layers,kinds=('poly','line')):
    out=[]
    for q in S[i]['prims']:
        if q.get('layer') in layers and q['kind'] in kinds:
            p=[(round(a[0]-X0[i],3),round(a[1]-Y0,3)) for a in q['p']]
            if q.get('closed'): p=p+[p[0]]
            out.append(p)
    return out
def texts(i,layers=None):
    return [(q['text'],round(q['at'][0]-X0[i],2),round(q['at'][1]-Y0,2),q.get('rot',0)) for q in S[i]['prims'] if q['kind']=='text' and (layers is None or q.get('layer') in layers)]
def cols(i):
    r=[]
    for p in L(i,('ST_Colum_คสล.',)):
        xs=[a[0] for a in p]; ys=[a[1] for a in p]
        r.append((round((min(xs)+max(xs))/2,3),round((min(ys)+max(ys))/2,3),round(max(xs)-min(xs),3),round(max(ys)-min(ys),3)))
    return sorted(set(r))
def segs(i,layers):
    H=[];V=[];O=[]
    for p in L(i,layers):
        for a,b in zip(p,p[1:]):
            if math.dist(a,b)<0.02: continue
            if abs(a[1]-b[1])<1e-3: H.append((a[1],min(a[0],b[0]),max(a[0],b[0])))
            elif abs(a[0]-b[0])<1e-3: V.append((a[0],min(a[1],b[1]),max(a[1],b[1])))
            else: O.append((a,b))
    return H,V,O
if __name__=='__main__':
    i=int(sys.argv[1])
    print('COLS',cols(i))
    H,V,O=segs(i,('ST_Beam_คสล.',))
    print('H'); [print(' ',h) for h in sorted(set(H))]
    print('V'); [print(' ',v) for v in sorted(set(V))]
    print('O',O)
    print('T',[t for t in texts(i,('ST_Text','ST_SYMBOL','arch_Text'))])
