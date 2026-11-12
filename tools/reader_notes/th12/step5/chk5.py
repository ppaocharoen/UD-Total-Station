# ตรวจท่อชนกัน / ท่อชนคาน / ข้อต่อ — ใช้กับ stage5a.bm.json
import json, math, sys, collections, itertools
m = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'stage5a.bm.json')); P = m['mep']['plumbing']['pipes']
OD = {'1/2"': 0.0213, '1"': 0.0334, '2"': 0.0603, '4"': 0.1143}
def segdist(p1, q1, p2, q2):
    import numpy as np
    p1, q1, p2, q2 = map(np.array, (p1, q1, p2, q2)); d1, d2, r = q1 - p1, q2 - p2, p1 - p2
    a, e, f = d1 @ d1, d2 @ d2, d2 @ r
    if a < 1e-12 and e < 1e-12: return float(np.linalg.norm(r))
    if a < 1e-12: s, t = 0.0, min(max(f / e, 0), 1)
    else:
        c = d1 @ r
        if e < 1e-12: t, s = 0.0, min(max(-c / a, 0), 1)
        else:
            b = d1 @ d2; den = a * e - b * b
            s = min(max((b * f - c * e) / den, 0), 1) if den > 1e-12 else 0.0
            t = (b * s + f) / e
            if t < 0: t, s = 0.0, min(max(-c / a, 0), 1)
            elif t > 1: t, s = 1.0, min(max((b - c) / a, 0), 1)
    return float(np.linalg.norm((p1 + d1 * s) - (p2 + d2 * t)))
d3 = lambda a, b: math.dist(a, b)
def touches(a, b):   # ท่อ a กับ b ต่อกัน (ปลายของตัวหนึ่งอยู่บนอีกตัว)
    J = []
    for x, y in ((a, b), (b, a)):
        for e in (x['pts'][0], x['pts'][-1]):
            if any(segdist(e, e, s, t) < 0.012 for s, t in zip(y['pts'], y['pts'][1:])): J.append(e)
    return J
clash = []
for a, b in itertools.combinations(P, 2):
    J = touches(a, b); ra, rb = OD[a['dia']] / 2, OD[b['dia']] / 2
    for s1, t1 in zip(a['pts'], a['pts'][1:]):
        for s2, t2 in zip(b['pts'], b['pts'][1:]):
            if any(min(segdist(j, j, s1, t1), segdist(j, j, s2, t2)) < 0.25 for j in J): continue
            g = segdist(s1, t1, s2, t2) - ra - rb
            if g < 0.005: clash.append((round(g, 3), a['id'], b['id'], [round(c, 2) for c in s1], [round(c, 2) for c in s2]))
print('ท่อชน/เบียดกัน (ช่องว่าง < 5 มม.):', len(clash))
for c in sorted(clash)[:40]: print('  ', c)
# ท่อผ่านเนื้อคานคอดิน (0.20×0.40 หลัง +0.20)
N = {n['id']: n for n in m['nodes']}; B = []
for b in m['members']:
    if b['type'] == 'tie_beam': a, e = N[b['i']], N[b['j']]; B.append(((a['x'], a['y']), (e['x'], e['y'])))
hit = []
for p in P:
    r = OD[p['dia']] / 2
    for s, t in zip(p['pts'], p['pts'][1:]):
        for k in range(21):
            q = [s[i] + (t[i] - s[i]) * k / 20 for i in range(3)]
            if not (-0.20 - r + 0.002 < q[2] < 0.20 + r - 0.002): continue
            for (a, e) in B:
                lo = (min(a[0], e[0]) - 0.10, min(a[1], e[1]) - 0.10); hi = (max(a[0], e[0]) + 0.10, max(a[1], e[1]) + 0.10)
                if lo[0] - r + 0.002 < q[0] < hi[0] + r - 0.002 and lo[1] - r + 0.002 < q[1] < hi[1] + r - 0.002: hit.append((p['id'], [round(c, 2) for c in q])); break
            else: continue
            break
print('ท่อผ่านเนื้อคานคอดิน:', len({h[0] for h in hit})); [print('  ', h) for h in hit[:25]]

# ท่อน้ำดีทุกเส้นต้องต่อกับท่อน้ำดีเส้นอื่น (ต้นทาง) · ข้อต่อ
cw = [p for p in P if p['system'] == 'cw']; loose = []
for p in cw:
    if not any(q is not p and any(segdist(p['pts'][0], p['pts'][0], s, t) < 0.012 for s, t in zip(q['pts'], q['pts'][1:])) for q in cw): loose.append(p['id'])
print('ท่อน้ำดีที่ต้นทางไม่ต่อกับท่ออื่น:', loose)
def fittings(P):
    out, seen = [], set(); grp = lambda s: 0 if s in ('cw', 'hw') else 1
    def push(p, pp, kind, dia=None):
        k = tuple(round(c, 2) for c in p) + (grp(pp['system']),)
        if k in seen: return
        seen.add(k); out.append((pp['system'], dia or pp['dia'], kind))
    for i, pp in enumerate(P):
        pts = pp['pts']
        for a, b, c in zip(pts, pts[1:], pts[2:]):
            u = [b[k] - a[k] for k in range(3)]; v = [c[k] - b[k] for k in range(3)]; lu, lv = math.hypot(*u), math.hypot(*v)
            if lu > 1e-6 and lv > 1e-6 and sum(x * y for x, y in zip(u, v)) / lu / lv < 0.985: push(b, pp, 'ข้องอ')
        for e in (pts[0], pts[-1]):
            done = False
            for j, q in enumerate(P):
                if j == i or grp(q['system']) != grp(pp['system']) or done: continue
                for s, t in zip(q['pts'], q['pts'][1:]):
                    if segdist(e, e, s, t) < 0.012:
                        end = d3(e, q['pts'][0]) < 0.012 or d3(e, q['pts'][-1]) < 0.012; big = q['dia'] if OD[q['dia']] >= OD[pp['dia']] else pp['dia']
                        push(e, pp, ('ข้อลด' if q['dia'] != pp['dia'] else 'ข้อต่อ') if end else 'สามทาง', big); done = True; break
    return collections.Counter(out)
FC = fittings(P)
json.dump([[*k, v] for k, v in sorted(FC.items())], open('fittings.json', 'w'), ensure_ascii=False)
print('ข้อต่อ:', dict(sorted(FC.items())))
