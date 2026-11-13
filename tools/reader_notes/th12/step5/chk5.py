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
    if b['type'] == 'tie_beam': a, e = N[b['i']], N[b['j']]; B.append(((a['x'], a['y']), (e['x'], e['y']), a['z']))
hit = []
for p in P:
    r = OD[p['dia']] / 2
    for s, t in zip(p['pts'], p['pts'][1:]):
        for k in range(21):
            q = [s[i] + (t[i] - s[i]) * k / 20 for i in range(3)]
            for (a, e, T) in B:   # คาน 0.20×0.40 หลังคานตามโมเดล
                if not (T - 0.40 - r + 0.002 < q[2] < T + r - 0.002): continue
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
import subprocess
js = "const v=require('/home/claude/UD-Total-Station/lib/viewer3d.js').BmViewer;const m=JSON.parse(require('fs').readFileSync(process.argv[1]));const g={};v.pipeFittings(m.mep.plumbing.pipes).forEach(f=>{const k=[f.system,f.label,f.size].join('|');g[k]=(g[k]||0)+1});console.log(JSON.stringify(Object.keys(g).sort().map(k=>[...k.split('|'),g[k]])))"
FC = json.loads(subprocess.run(['node', '-e', js, sys.argv[1] if len(sys.argv) > 1 else 'stage5a.bm.json'], capture_output=True, text=True).stdout)
json.dump(FC, open('fittings.json', 'w'), ensure_ascii=False)
print('ข้อต่อ (นับด้วยตัวเดียวกับเว็บ):', sum(f[3] for f in FC)); [print('  ', f) for f in FC]

# ตรวจด้วยตัวตรวจ Clash ของเว็บ (ท่อลอดเสา/ตอม่อ/ฐานราก · ท่อโผล่พ้นพื้นสำเร็จ ฯลฯ)
js2 = "const C=require('/home/claude/UD-Total-Station/lib/clash.js');const m=JSON.parse(require('fs').readFileSync(process.argv[1]));C.check(m,{buildingType:'public'}).filter(x=>x.sev!=='info').forEach(x=>console.log('  ',x.sev,x.code,x.title,'|',x.detail))"
print('Clash เว็บ (error/warn):'); print(subprocess.run(['node', '-e', js2, sys.argv[1] if len(sys.argv) > 1 else 'stage5a.bm.json'], capture_output=True, text=True).stdout)

# ---- ท่อ (รวมท่อฝังผนัง) กับ เสา ตอม่อ เสาเอ็น ทับหลัง · ปลอกท่อ · จุดทะลุพื้น/ผนัง
S = {s['id']: s for s in m['sections']}
def mbox(b):
    a, e = N[b['i']], N[b['j']]; s = S.get(b['section'], {}); bw, bh = s.get('b', 0.1), s.get('h', 0.1)
    if abs(a['x'] - e['x']) < 1e-6 and abs(a['y'] - e['y']) < 1e-6:   # แนวดิ่ง
        return (a['x'] - bw / 2, a['y'] - bh / 2, min(a['z'], e['z'])), (a['x'] + bw / 2, a['y'] + bh / 2, max(a['z'], e['z']))
    w = bw / 2; hz = abs(a['x'] - e['x']) > abs(a['y'] - e['y'])
    return (min(a['x'], e['x']) - (0 if hz else w), min(a['y'], e['y']) - (w if hz else 0), a['z'] - bh), (max(a['x'], e['x']) + (0 if hz else w), max(a['y'], e['y']) + (w if hz else 0), a['z'])
hits = collections.defaultdict(float)
MB = [(b, mbox(b)) for b in m['members'] if b['type'] in ('column', 'stiffener', 'lintel')]
for p in P:
    r = OD[p['dia']] / 2
    for s, t in zip(p['pts'], p['pts'][1:]):
        L = d3(s, t); n = max(1, int(L / 0.01))
        for k in range(n + 1):
            q = [s[i] + (t[i] - s[i]) * k / n for i in range(3)]
            for b, (lo, hi) in MB:
                if all(lo[i] - r + 0.003 < q[i] < hi[i] + r - 0.003 for i in range(3)): hits[(p['id'], b['id'], b['type'])] += L / n
print('ท่อผ่านเนื้อ เสา/ตอม่อ/เสาเอ็น/ทับหลัง:', len(hits))
for k, v in sorted(hits.items()): print('  ', k, round(v, 2))
# ปลอกท่อ: ท่อแนวนอนผ่านเนื้อคาน = ต้องฝังปลอก (ตรวจข้างบน = 0) · นับจุดลอดใต้คาน และจุดท่อแนวดิ่งทะลุพื้น
under = collections.Counter(); thru = collections.Counter()
def ccw(A, B_, C): return (C[1] - A[1]) * (B_[0] - A[0]) > (B_[1] - A[1]) * (C[0] - A[0])
def inpoly(pt, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > pt[1]) != (y2 > pt[1]) and pt[0] < (x2 - x1) * (pt[1] - y1) / (y2 - y1) + x1: c = not c
    return c
for p in P:
    for s, t in zip(p['pts'], p['pts'][1:]):
        if abs(s[2] - t[2]) < 0.02:   # แนวนอน: ตัดแนวศูนย์คาน และอยู่ใต้ท้องคาน
            for (a, e, T) in B:
                if ccw(s, a, e) != ccw(t, a, e) and ccw(s, t, a) != ccw(s, t, e) and max(s[2], t[2]) < T - 0.40 + 0.001: under[(p['system'], p['dia'])] += 1
        elif math.hypot(s[0] - t[0], s[1] - t[1]) < 0.02:   # แนวดิ่ง: ทะลุแผ่นพื้น
            for sl in m['slabs']:
                if sl.get('ramp') or sl['id'] == 'S-RB': continue
                if inpoly(s, sl['polygon']) and min(s[2], t[2]) < sl['top'] - sl['t'] + 0.001 and max(s[2], t[2]) > sl['top'] - 0.001: thru[(p['system'], p['dia'])] += 1
print('จุดท่อลอดใต้คานคอดิน:', sum(under.values()), dict(under)); print('จุดท่อแนวดิ่งทะลุพื้น:', sum(thru.values()), dict(thru))
json.dump({'under': [[*k, v] for k, v in sorted(under.items())], 'thru': [[*k, v] for k, v in sorted(thru.items())], 'member_hits': [[*k, round(v, 2)] for k, v in sorted(hits.items())]}, open('sleeve.json', 'w'), ensure_ascii=False)
