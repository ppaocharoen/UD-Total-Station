# ห้องจากผนัง + พื้น: ระบายเซลล์ 0.025 ม. ที่อยู่บนพื้น (ระดับหลังพื้นเดียวกัน) แล้วตัดด้วยแนวผนัง → ป้ายห้องในแปลนชี้ว่าเป็นห้องไหน
import json, math, re, sys, os
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'st'))
import ext

H = 0.025
def raster(m, zlo, zhi):
    S = [s for s in m['slabs'] if zlo <= s['top'] <= zhi]
    xs = [p[0] for s in S for p in s['polygon']]; ys = [p[1] for s in S for p in s['polygon']]
    x0, y0 = min(xs) - 0.5, min(ys) - 0.5; nx, ny = int((max(xs) + 0.5 - x0) / H) + 1, int((max(ys) + 0.5 - y0) / H) + 1
    cx = x0 + (np.arange(nx) + 0.5) * H; cy = y0 + (np.arange(ny) + 0.5) * H
    X, Y = np.meshgrid(cx, cy)                       # [iy, ix]
    lev = np.full(X.shape, -1, int)                   # ดัชนีพื้นใต้เซลล์
    for k, s in enumerate(S):
        P = s['polygon']; inside = np.zeros(X.shape, bool)
        for i in range(len(P)):                       # even-odd
            (ax, ay), (bx, by) = P[i], P[(i + 1) % len(P)]
            c = ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / ((by - ay) or 1e-12) + ax)
            inside ^= c
        lev[inside] = k
    wall = np.zeros(X.shape, bool)
    for w in m['walls']:
        if w['bottom'] > zhi + 0.6 or w['top'] < zlo + 1.0: continue
        P = w['path']; ht = w['t'] / 2 + 0.005
        for (ax, ay), (bx, by) in zip(P, P[1:]):
            L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
            t = (X - ax) * ux + (Y - ay) * uy; d = np.abs((X - ax) * -uy + (Y - ay) * ux)
            wall |= (t >= -ht) & (t <= L + ht) & (d <= ht)
    nd = {n['id']: n for n in m['nodes']}; sc = {x['id']: x for x in m['sections']}
    for c in m['members']:   # เสาที่ผ่านระดับนี้ (ผนังตัดท่อนที่หน้าเสา)
        if c['type'] != 'column': continue
        a, b = nd[c['i']], nd[c['j']]
        if min(a['z'], b['z']) > zhi + 0.6 or max(a['z'], b['z']) < zlo + 1.0: continue
        s = sc[c['section']]; hx, hy = s.get('b', 0.25) / 2 + 0.005, s.get('h', 0.25) / 2 + 0.005
        if c.get('angle') in (90, -90, 270): hx, hy = hy, hx
        wall |= (np.abs(X - a['x']) <= hx) & (np.abs(Y - a['y']) <= hy)
    return dict(S=S, X=X, Y=Y, x0=x0, y0=y0, lev=lev, wall=wall)

def regions(R):
    """เซลล์ต่อกันที่ไม่ใช่ผนังและอยู่บนพื้นระดับเดียวกัน (ต่างระดับ = ขอบห้อง)"""
    S, lev, wall = R['S'], R['lev'], R['wall']
    tops = np.array([round(s['top'], 3) for s in S] + [np.nan])
    z = np.where(lev >= 0, tops[lev], np.nan)
    lab = np.zeros(lev.shape, int); n = 0
    for zt in sorted(set(t for t in tops if not np.isnan(t))):
        msk = (np.abs(z - zt) < 1e-6) & ~wall
        l, k = ndimage.label(msk); lab[l > 0] = l[l > 0] + n; n += k
    return lab, z

def cell(R, p):
    return int((p[1] - R['y0']) / H), int((p[0] - R['x0']) / H)

def rects(mask, x0, y0):
    """แบ่งเซลล์เป็นสี่เหลี่ยม: รวมแถวที่ช่วง x เหมือนกันต่อกัน"""
    out = []; open_ = {}
    for iy in range(mask.shape[0]):
        row = mask[iy]; runs = []
        if row.any():
            d = np.diff(np.concatenate([[0], row.astype(int), [0]])); a = np.where(d == 1)[0]; b = np.where(d == -1)[0]; runs = list(zip(a, b))
        nxt = {}
        for r in runs:
            if r in open_: nxt[r] = open_.pop(r)
            else: nxt[r] = iy
        for r, s in open_.items(): out.append((r, s, iy))
        open_ = nxt
    for r, s in open_.items(): out.append((r, s, mask.shape[0]))
    return [[round(x0 + a * H, 3), round(y0 + s * H, 3), round(x0 + b * H, 3), round(y0 + e * H, 3)] for (a, b), s, e in out]

def tags(num):
    s = ext.sheet(num); f = ext.P(num)
    T = [(q['text'].strip(),) + f(q['at']) for q in s['prims'] if q['kind'] == 'text']
    out = []
    for t in T:
        if not re.match(r'^F\d$', t[0]): continue
        nb = [u for u in T if abs(u[1] - t[1]) < 2.2 and -0.45 < u[2] - t[2] < 0.6 and u is not t]
        name = [u for u in nb if 0.25 < u[2] - t[2] < 0.6 and abs(u[1] - t[1]) < 1.2 and not re.match(r'^[A-Z+\-\d]', u[0])]
        lv = [u for u in nb if re.match(r'^[+-]\d', u[0]) and abs(u[2] - t[2]) < 0.1 and 0 < u[1] - t[1] < 1.0]
        cl = [u for u in nb if re.match(r'^CL\d$', u[0]) and abs(u[2] - t[2]) < 0.1 and 0.8 < u[1] - t[1] < 1.8]
        out.append(dict(F=t[0], at=(t[1], t[2]), name=name[0][0] if name else '?', lv=float(lv[0][0]) if lv else None, cl=cl[0][0] if cl else None))
    return out
