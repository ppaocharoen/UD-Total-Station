# ตัวช่วยอ่าน DXF ห้องน้ำ ท12: พิกัด X จากกริด 1 · Y จากกริด A · หน่วย ม.
import pickle, os, collections
S = pickle.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dwg', 'sheets.pkl'), 'rb'))
def sheet(num): return next(s for s in S if s['num'] == num)
def origin(num):
    s = sheet(num); g = [q for q in s['prims'] if q.get('layer') == 'grid' and q['kind'] in ('poly', 'line')]
    V = sorted({round(q['p'][0][0], 3) for q in g if abs(q['p'][0][0] - q['p'][-1][0]) < 1e-3})
    Hh = sorted({round(q['p'][0][1], 3) for q in g if abs(q['p'][0][1] - q['p'][-1][1]) < 1e-3})
    return V, Hh
def P(x0, y0): return lambda p: (round(p[0] - x0, 3), round(p[1] - y0, 3))
def cores(num, x0, y0, layer='hatch'):
    """กล่องแกนผนัง (เส้นลายผนังกว้าง 0.06 ในผนังหนา 0.10) → (แกน H/V, พิกัดศูนย์, ต้น, ปลาย)"""
    f = P(x0, y0); segs = []
    for q in sheet(num)['prims']:
        if q.get('layer') != layer or q['kind'] not in ('line', 'poly'): continue
        pts = [f(p) for p in q['p']] + ([f(q['p'][0])] if q.get('closed') else [])
        segs += list(zip(pts, pts[1:]))
    Hs = collections.defaultdict(list); Vs = collections.defaultdict(list)
    for a, b in segs:
        if abs(a[1] - b[1]) < 1e-3 and abs(a[0] - b[0]) > 1e-3: Hs[round(a[1], 3)].append((min(a[0], b[0]), max(a[0], b[0])))
        if abs(a[0] - b[0]) < 1e-3 and abs(a[1] - b[1]) > 1e-3: Vs[round(a[0], 3)].append((min(a[1], b[1]), max(a[1], b[1])))
    out = []
    for D, ax in ((Hs, 'H'), (Vs, 'V')):
        for c in sorted(D):
            c2 = round(c + 0.06, 3)
            if c2 not in D: continue
            for a, b in D[c]:
                if any(abs(a - a2) < 0.005 and abs(b - b2) < 0.005 for a2, b2 in D[c2]): out.append((ax, round(c + 0.03, 3), a, b))
    return sorted(set(out))
