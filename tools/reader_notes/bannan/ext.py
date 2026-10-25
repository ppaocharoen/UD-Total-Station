# ตัวช่วยอ่าน DXF บ้านแนน: พิกัดโมเดล X = จากกริด A (ไปทาง I) · Y = จากกริด 10 (ขึ้นไปทาง 1) · หน่วย ม.
import pickle, os, math, collections
S = pickle.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dwg', 'sheets.pkl'), 'rb'))
IDX = {s['num']: i for i, s in enumerate(S)}
GX = {'A0': -2.50, 'A': 0.0, 'B': 3.20, 'C': 3.90, 'D': 5.20, 'D1': 6.25, 'E': 7.10, 'F': 10.30, 'G': 12.90, 'H': 15.20, 'I': 17.60, 'J': 19.425}
GY = {'10': 0.0, '9': 3.50, '8': 6.00, '7': 8.70, '6': 11.40, '5': 14.10, '4': 15.70, '3': 17.40, '2': 19.80, '1': 20.50}
def sheet(num): return S[IDX[num]]
def _labels(s):
    return [(q['text'].strip(), q['at'][0], q['at'][1]) for q in s['prims'] if q['kind'] == 'text']
def origin(num):
    """หาจุดกริด A/10 ในแผ่น จากบล็อกหัวกริด (กริดเสา/กริดเสา2) กับป้ายตัวอักษรใกล้สุด"""
    s = sheet(num); L = _labels(s); xs, ys = [], []
    for q in s['prims']:
        if q['kind'] == 'insert' and q.get('name') in ('กริดเสา', 'กริดเสา2'):
            x, y = q['at'][0], q['at'][1]
            near = min(L, key=lambda t: (t[1] - x) ** 2 + (t[2] - y) ** 2)
            if (near[1] - x) ** 2 + (near[2] - y) ** 2 > 1.0: continue
            if near[0] in GX and q['name'] == 'กริดเสา2': xs.append(x - GX[near[0]])
            elif near[0] in GY and q['name'] == 'กริดเสา': ys.append(y - GY[near[0]])
    cx = collections.Counter(round(v, 2) for v in xs).most_common(1); cy = collections.Counter(round(v, 2) for v in ys).most_common(1)
    return (cx[0][0] if cx else None, cy[0][0] if cy else None, len(xs), len(ys))
def P(num, o=None):
    o = o or origin(num); x0, y0 = o[0], o[1]
    return lambda p: (round(p[0] - x0, 3), round(p[1] - y0, 3))
def prims(num, layers=None, kinds=None):
    s = sheet(num); f = P(num)
    for q in s['prims']:
        if layers and q.get('layer') not in layers: continue
        if kinds and q['kind'] not in kinds: continue
        yield q, f
