import ext,math,collections,sys,re
WID=(0.15,0.2,0.25)
def pairs(L):
    L=sorted(set(L)); out=[]
    for k,(c,a0,a1) in enumerate(L):
        for (c2,b0,b1) in L[k+1:]:
            d=round(c2-c,3)
            if d>0.26: break
            if not any(abs(d-w)<0.006 for w in WID): continue
            o0,o1=max(a0,b0),min(a1,b1)
            if o1-o0>0.05: out.append((round((c+c2)/2,4),d,o0,o1))
    return out
def merge(P):
    by=collections.defaultdict(list)
    for c,w,a,b in P: by[(c,w)].append([a,b])
    out=[]
    for (c,w),iv in by.items():
        iv.sort(); cur=None
        for a,b in iv:
            if cur and a<=cur[1]+0.32: cur[1]=max(cur[1],b); continue
            if cur: out.append((c,w,*cur))
            cur=[a,b]
        out.append((c,w,*cur))
    return out
def beams(i,layers=('ST_Beam_คสล.',)):
    H,V,O=ext.segs(i,layers)
    res=[]
    for ax,L in (('H',H),('V',V)):
        for c,w,a,b in merge(pairs(L)):
            # drop pairs that are the inside of a wider pair? keep all, review later
            res.append((ax,c,w,round(a,3),round(b,3)))
    return res
def label(i,res,pat=r'^(B|BR|BS|BX|BY)'):
    T=[t for t in ext.texts(i,('ST_Text',)) if re.match(pat,t[0])]
    out=[]
    for ax,c,w,a,b in res:
        best=None
        for t,x,y,_ in T:
            u,v=(x,y) if ax=='H' else (y,x)
            if a-0.3<=u<=b+0.3:
                d=abs(v-c)
                if d<0.75 and (best is None or d<best[0]): best=(d,t)
        out.append((ax,c,w,a,b,best[1] if best else '?'))
    return out
if __name__=='__main__':
    i=int(sys.argv[1])
    for r in sorted(label(i,beams(i))): print(r)
