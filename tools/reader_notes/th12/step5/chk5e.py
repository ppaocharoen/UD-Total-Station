# ตรวจท่อร้อยสายกับโครงสร้าง (เสา คาน เสาเอ็น ทับหลัง อะเส/คานเหล็ก) และกับท่อประปา
import json, math, sys, collections
m = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'stage5b.bm.json'))
N = {n['id']: n for n in m['nodes']}; S = {s['id']: s for s in m['sections']}
def mbox(b):
    a, e = N[b['i']], N[b['j']]; s = S.get(b['section'], {})
    bw = s.get('b') or s.get('w') or 0.1; bh = s.get('h') or s.get('d') or 0.1
    if abs(a['x'] - e['x']) < 1e-6 and abs(a['y'] - e['y']) < 1e-6:
        return (a['x'] - bw / 2, a['y'] - bh / 2, min(a['z'], e['z'])), (a['x'] + bw / 2, a['y'] + bh / 2, max(a['z'], e['z']))
    hz = abs(a['x'] - e['x']) > abs(a['y'] - e['y']); w = bw / 2
    return (min(a['x'], e['x']) - (0 if hz else w), min(a['y'], e['y']) - (w if hz else 0), min(a['z'], e['z']) - bh), (max(a['x'], e['x']) + (0 if hz else w), max(a['y'], e['y']) + (w if hz else 0), max(a['z'], e['z']))
STEEL = ('steel_beam', 'steel_column', 'rafter', 'truss_chord', 'truss_web')
MB = [(b, mbox(b)) for b in m['members'] if b['type'] in ('column', 'stiffener', 'lintel', 'tie_beam')]
MS = []   # เหล็กรูปพรรณ: ศูนย์ชิ้น = แกนชิ้น · ตรวจแบบแกนเอียงได้ (จันทันลาด)
for b in m['members']:
    if b['type'] not in STEEL: continue
    a_, e_ = N[b['i']], N[b['j']]; s_ = S.get(b['section'], {})
    MS.append((b, (a_['x'], a_['y'], a_['z']), (e_['x'], e_['y'], e_['z']), (s_.get('b') or 0.05) / 2, (s_.get('h') or 0.1) / 2))
def in_steel(q, A, B, hb, hh):
    d = [B[i] - A[i] for i in range(3)]; L = math.sqrt(sum(c * c for c in d))
    u = [c / L for c in d]; w = [q[i] - A[i] for i in range(3)]; t = sum(w[i] * u[i] for i in range(3))
    if t < -R or t > L + R: return False
    p = [w[i] - t * u[i] for i in range(3)]
    if abs(u[2]) > 0.9: return abs(p[0]) < hb * 2 + R - 0.002 and abs(p[1]) < hh + R - 0.002 if False else (abs(p[0]) < 0.05 + R - 0.002 and abs(p[1]) < 0.05 + R - 0.002)
    hz = [-u[1], u[0], 0]; hn = math.hypot(*hz[:2]) or 1; hz = [c / hn for c in hz]
    off_h = abs(sum(p[i] * hz[i] for i in range(3))); off_v = abs(p[2] / (math.hypot(u[0], u[1]) or 1))
    return off_h < hb + R - 0.002 and off_v < hh + R - 0.002
el = m['mep']['electrical']; R = 0.01
hits = collections.defaultdict(float)
lines = [(c['id'], c['pts']) for c in el['conduits']] + [('SERVICE', el['service']['pts'])]
for cid, P in lines:
    for s, t in zip(P, P[1:]):
        L = math.dist(s, t); n = max(1, int(L / 0.01))
        for k in range(n + 1):
            q = [s[i] + (t[i] - s[i]) * k / n for i in range(3)]
            for b, (lo, hi) in MB:
                if all(lo[i] - R + 0.002 < q[i] < hi[i] + R - 0.002 for i in range(3)): hits[(cid, b['id'], b['type'])] += L / n
            for b, A_, B_, hb, hh in MS:
                if in_steel(q, A_, B_, hb, hh): hits[(cid, b['id'], b['type'])] += L / n
print('ท่อร้อยสายผ่านเนื้อโครงสร้าง:', len(hits))
for k, v in sorted(hits.items()): print('  ', k, round(v, 2))
tot = sum(math.dist(P[i], P[i + 1]) for _, P in lines[:-1] for i in range(len(P) - 1))
print('ความยาวท่อวงจรย่อยรวม', round(tot, 2), '· สายเมน', el['service']['length'])
json.dump([[*k, round(v, 2)] for k, v in sorted(hits.items())], open('elhits.json', 'w'), ensure_ascii=False)
# ท่อร้อยสาย กับ ท่อประปา/ระบาย
OD = {'1/2"': 0.022, '3/4"': 0.026, '1"': 0.034, '1 1/2"': 0.048, '2"': 0.060, '3"': 0.089, '4"': 0.114}
def sd(p1, q1, p2, q2):
    import numpy as np
    p1, q1, p2, q2 = map(np.array, (p1, q1, p2, q2)); d1, d2, r = q1 - p1, q2 - p2, p1 - p2
    a, e, f = d1 @ d1, d2 @ d2, d2 @ r
    if a < 1e-12 or e < 1e-12: return 9
    c = d1 @ r; b = d1 @ d2; den = a * e - b * b
    s = min(max((b * f - c * e) / den, 0), 1) if den > 1e-12 else 0
    t = (b * s + f) / e
    if t < 0: t = 0; s = min(max(-c / a, 0), 1)
    elif t > 1: t = 1; s = min(max((b - c) / a, 0), 1)
    return float(np.linalg.norm(p1 + d1 * s - p2 - d2 * t))
bad = []
for cid, P in lines:
    for p in m['mep']['plumbing']['pipes']:
        g = min(sd(a, b, c, d) for a, b in zip(P, P[1:]) for c, d in zip(p['pts'], p['pts'][1:])) - R - OD[p['dia']] / 2
        if g < 0.01: bad.append((cid, p['id'], round(g, 3)))
print('ท่อร้อยสายชิด/ชนท่อน้ำ (< 1 ซม.):', bad)
