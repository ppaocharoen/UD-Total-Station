# ห้องน้ำ ท12 · Step 5 ส่วนที่ 2 ไฟฟ้า (E.2.01) — ต่อจาก stage5a (สุขาภิบาล) → stage5b.bm.json
import json, os
H = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(H, 'stage5a.bm.json')))
SRC = 'E.2.01'
def inpoly(pt, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > pt[1]) != (y2 > pt[1]) and pt[0] < (x2 - x1) * (pt[1] - y1) / (y2 - y1) + x1: c = not c
    return c
def floor(x, y):   # ระดับพื้นสำเร็จ ณ จุด (หลังพื้นโครงสร้าง + ฟินิช)
    c = [round(s['top'] + s.get('finish_t', 0), 3) for s in m['slabs'] if not s.get('ramp') and s['id'] != 'S-RB' and inpoly((x, y), s['polygon'])]
    assert c, (x, y); return max(c)
CEIL = 3.70   # ฝ้า CL1 / ฝ้าชายคา CL1-E (Step 4) — ฝ้าเอียงตามท้องจันทัน +3.70 (แนว A) → +3.30 (แนว C)
_cl = next(f for f in m['finishes'] if f['id'] == 'CL1')
zc = lambda y: round(_cl['slope']['z'] + _cl['slope']['dz'] * (y - _cl['slope']['at']), 3)
PT = {
    'L18': {'kind': 'light', 'desc': 'โคมหลอด LED T8 18W พร้อมอุปกรณ์ครบชุด', 'dims': [1.22, 0.06, 0.07], 'watt': 18, 'src': SRC, 'status': 'from_drawing'},
    'L9': {'kind': 'light', 'desc': 'โคมหลอด LED T8 9W พร้อมอุปกรณ์ครบชุด', 'dims': [0.62, 0.06, 0.07], 'watt': 9, 'src': SRC, 'status': 'from_drawing'},
    'WL': {'kind': 'lamp', 'desc': 'โคมไฟกิ่งติดผนังภายนอก LED พร้อมอุปกรณ์ครบชุด', 'dims': [0.14, 0.12, 0.22], 'src': SRC, 'status': 'from_drawing'},
    'S1': {'kind': 'switch', 'desc': 'สวิตช์เปิด-ปิด 1 ทาง สูงจากพื้น 1.20', 'dims': [0.07, 0.012, 0.12], 'src': SRC, 'status': 'from_drawing'},
    'P1': {'kind': 'outlet', 'desc': 'เต้ารับขากลม-ขาแบน มีสายดิน มีฝาปิดกันน้ำ', 'dims': [0.07, 0.03, 0.12], 'src': SRC, 'status': 'from_drawing'},
}
pts = []
GX = [('1', 0.0), ('2', 4.2), ('3', 6.5), ('4', 10.8)]; GY = [('A', 0.0), ('B', 1.5), ('C', 5.8)]
def gl(v, G):
    if v < G[0][1] - 0.05: return f'นอก GL {G[0][0]} {G[0][1] - v:.2f}'
    if v > G[-1][1] + 0.05: return f'นอก GL {G[-1][0]} {v - G[-1][1]:.2f}'
    for (a, va), (b, vb) in zip(G, G[1:]):
        if abs(v - va) <= 0.05: return f'GL {a}'
        if abs(v - vb) <= 0.05: return f'GL {b}'
        if va < v < vb: return f'GL {a}–{b} ห่าง {a} {v - va:.2f}'
def where(x, y, hint=''):   # ชื่อห้อง (จากผิวพื้น Step 4) ระดับ แล้วแนวกริด
    fx, fy = hint if hint else (x, y)
    f = next(q for q in m['finishes'] if q.get('kind') == 'floor' and q.get('polygon') and inpoly((fx, fy), q['polygon']))
    return f"{f['room']} ({floor(fx, fy):+.2f}) {gl(x, GX)} · {gl(y, GY)}"
def P(i, t, x, y, z, c, room, note, rot=None, st='from_drawing', **kw):
    side = {0: (x + 0.1, y), 90: (x, y + 0.1), 180: (x - 0.1, y), 270: (x, y - 0.1)}.get(rot) if t in ('S1', 'P1', 'WL') else None
    room = where(x, y, side) + (' — ' + room if room else '')
    d = {'id': i, 'type': t, 'xyz': [round(x, 3), round(y, 3), round(z, 3)], 'circuit': c, 'room': room, 'src': SRC, 'status': st, 'note': note}
    if rot is not None: d['rot'] = rot
    d.update(kw); pts.append(d)
NZ = 'ติดใต้ฝ้าเอียง (ระดับฝ้า ณ ตำแหน่งโคม จาก Step 4)'
# ---- โคม 18W (บล็อกยาว 1.20 จุดแทรก = ปลายซ้าย/ปลายบน) — ศูนย์กลางโคม
L18 = [('01', 0.973, 4.504, 90, 'โซนโถปัสสาวะ', 'S-05'), ('02', 3.698, 4.779, 0, 'เหนือแนวประตูห้องส้วม', 'S-01'), ('03', 3.698, 3.579, 0, '', 'S-02'),
       ('04', 2.098, 2.379, 0, 'หน้าเคาน์เตอร์อ่าง', 'S-02'), ('05', 7.548, 4.779, 0, 'เหนือแนวประตูห้องส้วม', 'S-10'), ('06', 9.748, 4.779, 0, 'เหนือแนวประตูห้องส้วม', 'S-10'),
       ('07', 8.648, 3.579, 0, '', 'S-11'), ('08', 8.648, 2.379, 0, 'หน้าเคาน์เตอร์อ่าง', 'S-11'), ('09', 5.348, 1.979, 0, '', 'S-08'),
       ('10', 2.098, 0.679, 0, '', 'S-06'), ('11', 5.348, 0.379, 0, '', 'S-06'), ('12', 8.648, 0.679, 0, '', 'S-06')]
for n, x, y, r, room, sw in L18: P(f'L18-{n}', 'L18', x, y, zc(y), 'L1', room, NZ + f' · ควบคุมด้วยสวิตช์ {sw} (ตามเส้นเดินสายในแบบ)', r, switch=sw)
L9 = [('01', 3.148, 6.379, 0, 'ใต้ชายคาด้านหลัง', 'S-04'), ('02', 7.548, 6.379, 0, 'ใต้ชายคาด้านหลัง', 'S-04'),
      ('03', -0.577, 2.904, 90, 'ใต้ชายคาด้านข้าง', 'S-03'), ('04', 11.373, 2.904, 90, 'ใต้ชายคาด้านข้าง', 'S-09')]
for n, x, y, r, room, sw in L9: P(f'L9-{n}', 'L9', x, y, zc(y), 'L1', room, 'ติดใต้ฝ้าชายคาเอียง · ควบคุมด้วยสวิตช์ ' + sw, r, switch=sw)
ZW = 0.05 + 2.50
P('WL-01', 'WL', 0.0, -0.10, ZW, 'L1', 'หน้าเสา C1 ด้านนอกอาคาร', 'ติดหน้าเสา C1 · **ความสูง 2.50 จากพื้นทางเดิน สมมติ** (แบบไม่ระบุ) · ควบคุมด้วยสวิตช์ S-07', 270, 'assumed', switch='S-07')
P('WL-02', 'WL', 10.8, -0.30, ZW, 'L1', 'ปลายผนังปีก W-4A ด้านนอกอาคาร', 'ติดปลายผนังปีก W-4A · **ความสูง 2.50 จากพื้นทางเดิน สมมติ** · ควบคุมด้วยสวิตช์ S-07', 270, 'assumed', switch='S-07')
# ---- สวิตช์ (ศูนย์สัญลักษณ์ → ผิวผนังที่ใกล้สุด) สูงจากพื้นสำเร็จ 1.20
SW = [('01', 1.50, 1.807, 180, 1.397, 'ผนังปลายเคาน์เตอร์อ่างชาย (W-B1R) ด้านทางเข้าห้องน้ำชาย', ['L18-02']), ('02', 1.50, 1.93, 180, 1.397, 'ผนังปลายเคาน์เตอร์อ่างชาย (W-B1R) ด้านทางเข้าห้องน้ำชาย', ['L18-03', 'L18-04']),
      ('03', 0.0, 1.907, 0, 0.113, 'ผนังกริด 1 (W-G1) ด้านใน ใกล้ทางเข้าห้องน้ำชาย', ['L9-03']), ('04', 0.128, 3.20, 90, None, 'ผนังกั้นเตี้ยโซนปัสสาวะ (W-U1) ด้านโซนปัสสาวะ', ['L9-01', 'L9-02']),
      ('05', 0.315, 3.20, 90, None, 'ผนังกั้นเตี้ยโซนปัสสาวะ (W-U1) ด้านโซนปัสสาวะ', ['L18-01']), ('06', 4.20, 1.065, 180, 4.096, 'ผนังข้างประตูห้องคนพิการ (W-D0L) ด้านโถงหน้า', ['L18-10', 'L18-11', 'L18-12']),
      ('07', 4.20, 1.265, 180, 4.096, 'ผนังข้างประตูห้องคนพิการ (W-D0L) ด้านโถงหน้า', ['WL-01', 'WL-02']), ('08', 6.40, 1.165, 180, 6.296, 'ในห้องน้ำคนพิการ ผนังข้างประตู (W-D0R)', ['L18-09']),
      ('09', 9.20, 1.607, 0, 9.325, 'ผนังปลายเคาน์เตอร์อ่างหญิง (W-B6R) ด้านทางเข้าห้องน้ำหญิง', ['L9-04']), ('10', 9.20, 1.807, 0, 9.325, 'ผนังปลายเคาน์เตอร์อ่างหญิง (W-B6R) ด้านทางเข้าห้องน้ำหญิง', ['L18-05', 'L18-06']),
      ('11', 9.20, 1.93, 0, 9.325, 'ผนังปลายเคาน์เตอร์อ่างหญิง (W-B6R) ด้านทางเข้าห้องน้ำหญิง', ['L18-07', 'L18-08'])]
for n, x, y, r, sx, room, ctl in SW:
    fx, fy = (sx if sx is not None else x), (y + 0.12 if r == 90 else y); f = floor(fx, fy)
    P(f'S-{n}', 'S1', x, y, f + 1.20, 'L1', room, 'ฝังผนัง สูงจากพื้น 1.20 · ควบคุม ' + ' '.join(ctl), r, controls=ctl)
# ---- เต้ารับ
for n, x, y, r, room in [('01', 4.20, 2.91, 180, 'ผนังห้องคนพิการด้านห้องน้ำชาย (W-DL)'), ('02', 4.20, 2.71, 180, 'ผนังห้องคนพิการด้านห้องน้ำชาย (W-DL)'),
                         ('03', 6.50, 2.91, 0, 'ผนังห้องคนพิการด้านห้องน้ำหญิง (W-DR)'), ('04', 6.50, 2.71, 0, 'ผนังห้องคนพิการด้านห้องน้ำหญิง (W-DR)')]:
    f = floor(x + (-0.1 if r == 180 else 0.1), y); P(f'P-{n}', 'P1', x, y, f + 0.90, 'P1', room, 'ฝังผนัง ระดับ +0.90 จากพื้น (ตามแบบ)', r)
P('P-PUMP', 'P1', 4.36, 5.90, 0.05 + 0.90, 'P2', 'ผนังด้านหลังข้างเสา GL 2/C ด้านนอกอาคาร ข้างปั๊มน้ำ PM-1', 'เต้ารับปั๊มน้ำ (ป้าย PUMP) · **ความสูง 0.90 จากทางเดิน สมมติ** (แบบไม่ระบุ) · **มาร์ก:** สัญลักษณ์อยู่บนหน้าเสา GL 2/C — เลื่อนมาที่ผนัง W-C3 ข้างเสา (x 4.36) ให้ท่อลงฝังในผนัง ไม่ผ่านเนื้อเสา', 90, 'assumed')
# ---- แผงควบคุมไฟฟ้า
fl = floor(4.77, 3.3)
panel = {'id': 'LC', 'xyz': [4.773, 3.10, round(fl + 1.80, 3)], 'rot': 90, 'dims': [0.30, 0.10, 0.40], 'ways': 6, 'main': 'MCB 2P 32A', 'src': SRC, 'status': 'assumed', 'room': where(4.773, 3.10, (4.773, 3.3)) + ' — ผนังหลังห้องน้ำคนพิการ (W-DB) ด้านห้องน้ำชาย',
         'note': 'ตำแหน่งและความสูง 1.80 ตามแบบ (คิดถึงกึ่งกลางตู้) · **ขนาดตู้ 6 ช่อง เมน 2P 32A สมมติ** — แบบไม่มีตารางโหลด/ไดอะแกรมเส้นเดียว'}
AS = '**สมมติ** — แบบไม่มีตารางโหลด'
circuits = [
    {'id': 'L1', 'panel': 'LC', 'desc': 'แสงสว่างทั้งอาคาร (LED 18W 12 ชุด · 9W 4 ชุด · โคมกิ่ง 2 ชุด ≈ 0.3 kW) สวิตช์ 11 จุด', 'breaker': 'MCB 1P 16A', 'wire_size': 2.5, 'conductors': 3, 'status': 'assumed', 'note': AS},
    {'id': 'P1', 'panel': 'LC', 'desc': 'เต้ารับในอาคาร 4 จุด (ผนังห้องน้ำคนพิการ ด้านห้องน้ำชาย 2 · ด้านห้องน้ำหญิง 2)', 'breaker': 'RCBO 1P+N 20A 30mA', 'wire_size': 2.5, 'conductors': 3, 'status': 'assumed', 'note': AS + ' · พื้นที่เปียกใช้เครื่องตัดไฟรั่ว'},
    {'id': 'P2', 'panel': 'LC', 'desc': 'เต้ารับปั๊มน้ำ 1 จุด', 'breaker': 'RCBO 1P+N 20A 30mA', 'wire_size': 2.5, 'conductors': 3, 'status': 'assumed', 'note': AS},
]
m['mep']['electrical'] = {'route_height': CEIL, 'wire_type': 'IEC 01 (THW)', 'conduit': 'PVC สีขาว 1/2"', 'panels': [panel], 'point_types': PT, 'circuits': circuits, 'points': pts,
                          'note': 'E.2.01: เดินสายร้อยท่อ PVC สีขาว — แสงสว่างเดินลอยใต้ฝ้าเพดาน · ปลั๊ก/สวิตช์ฝังท่อในผนัง ใส่บล็อกฝังผนัง · ระดับ/ตำแหน่งเป็นแนวทางเบื้องต้น ปรับได้ตามหน้างาน · ยังไม่ได้เขียนแนวท่อร้อยสาย (ปริมาณท่อ/สายประมาณจากตำแหน่งจุด เดินระดับฝ้าแบบมุมฉาก)'}

# ================= แนวท่อร้อยสาย รอบ 3 (Earth 13 พ.ย. 16:17/16:28)
# - ท่อเดินเหนือฝ้า ในช่องโครงคร่าว C-Line ใต้ท้องจันทัน (A.4.01: ฝ้าไม่ติดจันทัน มี C-Line ขวางก่อน · ผ่าน C-Line เจาะรู)
# - ลงสวิตช์/เต้ารับ/แผง: ฝังผนังขึ้นถึงหลังผนัง → ลากบนหลังผนังไปเสาที่ใกล้สุด → ขึ้นตามผิวเสาเข้าเหนือฝ้า (ไม่ลอยขึ้นจากผนังตรงไปฝ้า)
# - แนวเหนือฝ้าตรง หักน้อย: ท่อหลักแนวแถว B ชิดหน้าเสา · กิ่งเข้าโคมเป็นตัว L เส้นเดียว · กล่องต่อสายที่หัวเสา/ที่โคม (นับจำนวนได้)
# - ข้ามแนวคานใต้ท้องจันทัน (โครง TRUSS แถว A · อะเสบน RB-B2 แถว B · อะเส RB-C แถว C): ยกท่อข้ามหลังคานระหว่างจันทัน
# - กลุ่มสวิตช์ → โคม ใช้ตามเส้นสายในแบบ E.2.01 (ตรวจด้วยโปรแกรมด้านล่าง)
import math, collections, sys, heapq
sys.path.insert(0, H); from ex5 import sheet, loc
ESH = sheet('E.2.01'); EL = loc('E.2.01')
PTS = {p['id']: p for p in pts}
# ---- ตรวจกลุ่มสวิตช์ → โคม จากเส้นสายในแบบ
RAWE = {}
for p in pts:
    x, y = p['xyz'][:2]
    if p['type'] in ('L18', 'L9'):
        h = 0.60 if p['type'] == 'L18' else 0.35
        d = (0, h) if p.get('rot') == 90 else (h, 0)
        RAWE[p['id']] = [(x - d[0], y - d[1]), (x + d[0], y + d[1]), (x, y)]
for n, x, y, r, sx, room, ctl in SW: RAWE[f'S-{n}'] = [(sx if sx is not None else x, (2.007 if n in ('02', '11') else y) if r != 90 else 3.32)]
RAWE['WL-01'] = [(-0.002, -0.096)]; RAWE['WL-02'] = [(10.798, -0.296)]
def near_pt(pt):
    b = min(((math.dist(pt, e), pid) for pid, es in RAWE.items() for e in es), default=(9, None))
    return b[1] if b[0] < 0.45 else None
par = {p: p for p in PTS}
def fnd(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
nw = 0
for qd in ESH['prims']:
    if qd.get('layer') != 'EL_wire' or qd.get('parent') is not None: continue
    if qd['kind'] == 'poly': xy = [EL(p) for p in qd['p']]
    elif qd['kind'] == 'arc':
        c = EL(qd['c']); a0, a1 = math.radians(qd['a0']), math.radians(qd['a1'])
        if a1 < a0: a1 += 2 * math.pi
        xy = [(c[0] + qd['r'] * math.cos(a0), c[1] + qd['r'] * math.sin(a0)), (c[0] + qd['r'] * math.cos(a1), c[1] + qd['r'] * math.sin(a1))]
    else: continue
    if max(float(x) for x, _ in xy) > 11.8: continue
    A, B = near_pt(tuple(map(float, xy[0]))), near_pt(tuple(map(float, xy[-1]))); nw += 1
    if A and B: par[fnd(A)] = fnd(B)
LAMP = ('L18', 'L9', 'WL')
grp = collections.defaultdict(set)
for pid in PTS:
    if PTS[pid]['type'] in LAMP + ('S1',): grp[fnd(pid)].add(pid)
CHK = [(p['id'], sorted(q for q in grp[fnd(p['id'])] if PTS[q]['type'] in LAMP), sorted(p['controls'])) for p in pts if p['type'] == 'S1']
assert all(a == b for _, a, b in CHK), CHK

# ---- เรขาคณิต
PL = lambda y: 3.70 - 0.06897 * y          # ท้องจันทัน (ระนาบโครงหลังคา)
ZC = lambda y: round(PL(y) - 0.0175, 3)    # ศูนย์ท่อในช่อง C-Line (สูง 0.035 — Earth 13 พ.ย.) ใต้ท้องจันทัน
ZH = lambda y: round(PL(y) + 0.035, 3)     # ยกข้ามหลังคานระหว่างจันทัน
BEAMS = [(0.0, 0.0375 + 0.03, 'โครง TRUSS แถว A'), (1.5, 0.05 + 0.03, 'อะเสบน RB-B2 แถว B'), (5.8, 0.05 + 0.03, 'อะเส RB-C แถว C')]
RAFX = [-1.062 + 1.0771 * k for k in range(13)]
raf_ok = lambda x: all(abs(x - r) > 0.05 for r in RAFX)
def into_wall(p, d=0.03):
    r = math.radians(p.get('rot', 0)); return (round(p['xyz'][0] - d * math.cos(r), 3), round(p['xyz'][1] - d * math.sin(r), 3))
WSEG = [(w['id'], tuple(w['path'][0]), tuple(w['path'][1]), w['top']) for w in m['walls']
        if w['kind'] in ('brick_mon', 'block', 'aac') and len(w['path']) == 2 and w['top'] >= 2.5 and not w['id'].startswith(('W-ST', 'KW'))]
COLS = {c['id']: (N_[c['i']]['x'], N_[c['i']]['y']) for N_ in [{n['id']: n for n in m['nodes']}] for c in m['members'] if c['type'] == 'column' and c['id'].startswith('C-') and not c['id'].endswith('j')}
def proj(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); q = (a[0] + t * dx, a[1] + t * dy)
    return q, math.dist(p, q)
# กราฟหลังผนัง: จุด = ปลายผนัง + จุดต่อแบบ T · เส้น = ช่วงผนัง (ระดับหลังผนังนั้น)
G = collections.defaultdict(list); NODES = {}
def nid(p): k = (round(p[0], 3), round(p[1], 3)); NODES[k] = p; return k
segpts = {wid: [a, b] for wid, a, b, t in WSEG}
for wid, a, b, t in WSEG:
    for wid2, a2, b2, t2 in WSEG:
        if wid2 == wid: continue
        for e in (a2, b2):
            q, dd = proj(e, a, b)
            if dd < 0.08: segpts[wid].append(q)
for wid, a, b, t in WSEG:
    ps = sorted({nid(p) for p in segpts[wid]}, key=lambda k: math.dist(k, a))
    for u, v in zip(ps, ps[1:]):
        G[u].append((v, math.dist(u, v), t, wid)); G[v].append((u, math.dist(u, v), t, wid))
    for wid2, a2, b2, t2 in WSEG:   # ปลายผนังต่อกับจุดบนผนังอีกเส้น (ขาตัว T)
        pass
for k in list(NODES):   # รวมจุดที่ใกล้กัน (ผนังชนกันที่ศูนย์ห่าง ≤ 0.08)
    for k2 in list(NODES):
        if k != k2 and math.dist(k, k2) < 0.08:
            G[k].append((k2, math.dist(k, k2), None, 'J'))
_Nn = {n['id']: n for n in m['nodes']}; _Ss = {x['id']: x for x in m['sections']}
STB = []   # อะเสเหล็กที่วางบนหลังผนัง (ใช้หาฝั่งว่างบนหลังผนังให้ท่อวาง)
for b_ in m['members']:
    if b_['type'] != 'steel_beam': continue
    A_, B_ = _Nn[b_['i']], _Nn[b_['j']]; sec = _Ss[b_['section']]
    STB.append(((A_['x'], A_['y']), (B_['x'], B_['y']), (A_['z'] + B_['z']) / 2 - (sec.get('h') or 0.1) / 2, (sec.get('b') or 0.05) / 2))
WT = {w['id']: w['t'] for w in m['walls']}
def ledge(wid, a, b, top):
    """ระยะเยื้องจากศูนย์ผนังไปฝั่งที่ว่างบนหลังผนัง (ถ้ามีอะเสเหล็กวางทับ) · ไม่มีอะเสทับ = กลางผนัง"""
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
    for (p, q, zb, hb) in STB:
        if abs(zb - top) > 0.03: continue
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        ex, ey = q[0] - p[0], q[1] - p[1]
        if abs(ex * dy - ey * dx) > 1e-3 * math.hypot(ex, ey) * L: continue   # ต้องขนานกับผนัง
        off = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny
        if abs(off) > WT[wid] / 2 + hb: continue
        lo = max(min(p[0], q[0]), min(a[0], b[0])) - 0.01 if abs(dx) > abs(dy) else max(min(p[1], q[1]), min(a[1], b[1])) - 0.01
        hi = min(max(p[0], q[0]), max(a[0], b[0])) + 0.01 if abs(dx) > abs(dy) else min(max(p[1], q[1]), max(a[1], b[1])) + 0.01
        if hi <= lo: continue
        d = -math.copysign(WT[wid] / 2 - 0.02, off)
        return (nx * d, ny * d)
    return (0.0, 0.0)
def wall_route(p):
    """จากกล่องในผนัง → ขึ้นในผนังถึงหลังผนัง → ลากบนหลังผนังไปเสาที่ใกล้สุด → คืน (จุด 3D, เสา, ผิวเสาที่ขึ้น)"""
    w0 = into_wall(p)
    best = min(((proj(w0, a, b)[1], wid, a, b, t) for wid, a, b, t in WSEG), key=lambda r: r[0])
    _, wid, a, b, top = best
    q, _ = proj(w0, a, b)
    start = ('S',)
    dist = {start: 0}; prev = {}; prevw = {}; pq = [(0, start)]; tops = {start: top}
    nbr = lambda u: ([(nid(e), math.dist(q, e), top, wid) for e in ([a, b] + [pp for pp in segpts[wid]])] if u == start else G[u])
    goal = None
    while pq:
        d0, u = heapq.heappop(pq)
        if d0 > dist.get(u, 1e9): continue
        up = q if u == start else u
        cc = [(cid, c) for cid, c in COLS.items() if math.dist(up, c) < 0.17]
        if cc: goal = (u, cc[0]); break
        for v, L, t, w in nbr(u):
            nd = d0 + L
            if nd < dist.get(v, 1e9): dist[v] = nd; prev[v] = u; prevw[v] = w; tops[v] = t if t is not None else tops[u]; heapq.heappush(pq, (nd, v))
    u, (cid, c) = goal
    chain = [u]
    while chain[-1] != start: chain.append(prev[chain[-1]])
    chain = chain[::-1]
    # แนวดิ่งในผนัง: จากกล่องขึ้นถึงหลังผนัง · แนวราบ: วางบนหลังผนัง (ฝั่งที่ว่างถ้ามีอะเสทับ) — Earth 13 พ.ย. ห้ามเดินแนวราบในผนัง
    WS = {wid_: (a_, b_, t_) for wid_, a_, b_, t_ in WSEG}
    o = ledge(wid, a, b, top)
    v0 = (q[0] + o[0], q[1] + o[1])
    pts3 = [[w0[0], w0[1], p['xyz'][2]]]
    if math.dist(w0, v0) > 0.005: pts3.append([v0[0], v0[1], p['xyz'][2]])
    pts3.append([v0[0], v0[1], top + 0.011])
    cur_w = wid
    for k in chain[1:]:
        w_ = prevw.get(k, cur_w)
        if w_ == 'J' or w_ not in WS: w_ = cur_w
        a2, b2, t2 = WS[w_]; o2 = ledge(w_, a2, b2, t2); zt = t2 + 0.011
        if abs(zt - pts3[-1][2]) > 0.005: pts3.append([pts3[-1][0], pts3[-1][1], zt])
        if w_ != cur_w:   # เปลี่ยนแนวผนัง: ต่อจากแนวเดิมถึงจุดต่อ แล้วเข้าแนวใหม่
            pts3.append([k[0] + o2[0], k[1] + o2[1], zt]) if False else None
        pts3.append([k[0] + o2[0], k[1] + o2[1], zt]); cur_w = w_
    # แนวบนหลังผนังที่ต้องลอดใต้อะเสเหล็ก (ผนังสองฝั่งแนวคาน) → หยุดก่อนถึงอะเส แล้วขึ้นแนบข้างอะเสเข้าเหนือฝ้า (มาร์ก)
    def under_beam(x, y, z):
        for (p_, q_, zb, hb) in STB:
            if z + 0.011 < zb - 0.001: continue
            ex, ey = q_[0] - p_[0], q_[1] - p_[1]; L2 = ex * ex + ey * ey
            t_ = ((x - p_[0]) * ex + (y - p_[1]) * ey) / L2
            if -0.01 <= t_ <= 1.01 and abs((x - p_[0]) * ey - (y - p_[1]) * ex) / math.sqrt(L2) < hb + 0.011: return True
        return False
    for i_ in range(2, len(pts3)):
        A3, B3 = pts3[i_ - 1], pts3[i_]
        if abs(A3[2] - B3[2]) > 0.005: continue
        n_ = max(2, int(math.dist(A3, B3) / 0.005))
        hit = next((k_ for k_ in range(n_ + 1) if under_beam(A3[0] + (B3[0] - A3[0]) * k_ / n_, A3[1] + (B3[1] - A3[1]) * k_ / n_, A3[2])), None)
        if hit is None: continue
        k_ = max(0, hit - 2); px, py = A3[0] + (B3[0] - A3[0]) * k_ / n_, A3[1] + (B3[1] - A3[1]) * k_ / n_
        out = pts3[:i_] + [[round(px, 3), round(py, 3), A3[2]], [round(px, 3), round(py, 3), ZC(py)]]
        key = f'B{round(px, 2)}_{round(py, 2)}'; COLS.setdefault(key, (px, py))
        return out, key, (round(px, 3), round(py, 3))
    # ตัดปลายที่เข้าไปในเนื้อเสา (เสา 0.20×0.20) ถอยกลับตามแนวผนังให้พ้นผิวเสา
    while len(pts3) > 2 and max(abs(pts3[-1][0] - c[0]), abs(pts3[-1][1] - c[1])) < 0.10 + 0.012:
        a_, b_ = pts3[-2], pts3[-1]; dx_, dy_ = b_[0] - a_[0], b_[1] - a_[1]; L_ = math.hypot(dx_, dy_)
        if L_ < 1e-6: pts3.pop(); continue
        for tt in [i / 100 for i in range(100, -1, -1)]:
            px, py = a_[0] + dx_ * tt, a_[1] + dy_ * tt
            if max(abs(px - c[0]), abs(py - c[1])) >= 0.112: break
        pts3[-1] = [round(px, 3), round(py, 3), b_[2]]; break
    # ผิวเสาที่ขึ้น: ด้านที่หันมาทางผนังที่มาถึง (ถ้าผ่านแนวคานแถว B/C ให้ขึ้นด้านนอกแนวคาน) — เลี่ยงแนวจันทัน
    end = pts3[-1]; dx, dy = end[0] - c[0], end[1] - c[1]
    # จุดขึ้นข้างเสา: พ้นแนวอะเสเหล็ก (แถว B/C วิ่งแนว x · กริด 1/4 วิ่งแนว y บนหลังผนัง) และอยู่ฝั่งในอาคาร
    if abs(c[0]) < 0.01: fx = c[0] + 0.112
    elif abs(c[0] - 10.8) < 0.01: fx = c[0] - 0.112
    else: fx = c[0] + math.copysign(0.112, dx) if abs(dx) >= abs(dy) else end[0]
    if abs(c[1] - 1.5) < 0.01: fy = 1.388 if end[1] < 1.5 else 1.612   # แถว B: ขึ้นฝั่งเดียวกับที่ท่อมาถึง ไม่ลอดใต้อะเส
    elif abs(c[1] - 5.8) < 0.01: fy = c[1] - 0.112
    else: fy = c[1] + math.copysign(0.112, dy) if abs(dy) > abs(dx) else end[1]
    sg = 1 if fx >= c[0] else -1   # เลื่อนหนีแนวจันทันไปทางนอกเสาเท่านั้น
    for dxx in (0, 0.06, 0.12, 0.18):
        if raf_ok(fx + sg * dxx) and abs(fx + sg * dxx - c[0]) >= 0.112 - 1e-6 or (abs(fx - c[0]) < 0.112 and raf_ok(fx + sg * dxx)): fx += sg * dxx; break
    pts3 += [[round(fx, 3), round(end[1], 3), end[2]]] if abs(fx - end[0]) > 0.005 else []
    pts3 += [[round(fx, 3), round(fy, 3), end[2]]] if abs(fy - pts3[-1][1]) > 0.005 else []
    pts3.append([round(fx, 3), round(fy, 3), ZC(fy)])
    return pts3, cid, (round(fx, 3), round(fy, 3))
def hopify(P):
    """ช่วงท่อแนว y ที่ข้ามแนวคาน → ยกข้ามหลังคาน (ระหว่างจันทัน)"""
    out = [P[0]]
    for a, b in zip(P, P[1:]):
        if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) > 1e-6 and abs(a[2] - ZC(a[1])) < 0.01 and abs(b[2] - ZC(b[1])) < 0.01:
            s = 1 if b[1] > a[1] else -1
            for yb, hw, nm in sorted(BEAMS, key=lambda r: s * r[0]):
                if min(a[1], b[1]) < yb - hw and max(a[1], b[1]) > yb + hw:
                    y1, y2 = yb - s * hw, yb + s * hw
                    out += [[a[0], y1, ZC(y1)], [a[0], y1, ZH(y1)], [a[0], y2, ZH(y2)], [a[0], y2, ZC(y2)]]
        out.append(b)
    return out
def Lroute(a, b, prefer=None):
    """จาก a ไป b เหนือฝ้า: ตัว L เส้นเดียว · เลือกทางที่ข้ามคานน้อย และช่วงแนว y ไม่ทับแนวจันทันตอนยกข้ามคาน"""
    opts = []
    for corner in ((b[0], a[1]), (a[0], b[1])):
        legs = [(a[:2], corner), (corner, b[:2])]
        cross = sum(1 for p, q in legs if abs(p[0] - q[0]) < 1e-6 for yb, hw, nm in BEAMS if min(p[1], q[1]) < yb - hw and max(p[1], q[1]) > yb + hw)
        bad = sum(1 for p, q in legs if abs(p[0] - q[0]) < 1e-6 and not raf_ok(p[0]) and any(min(p[1], q[1]) < yb < max(p[1], q[1]) for yb, hw, nm in BEAMS))
        onbeam = sum(1 for p, q in legs if abs(p[1] - q[1]) < 1e-6 and math.dist(p, q) > 0.01 and any(abs(p[1] - yb) < hw for yb, hw, nm in BEAMS))
        opts.append((bad * 10 + onbeam * 10 + cross, 0 if (prefer and corner == prefer) else 1, corner))
    best = min(opts); corner = best[2]
    P = [[a[0], a[1], ZC(a[1])], [corner[0], corner[1], ZC(corner[1])], [b[0], b[1], ZC(b[1])]]
    if best[0] >= 10:   # ช่วงแนว y ที่ต้องยกข้ามคานอยู่ใต้แนวจันทัน → เยื้องแนวออกจากจันทัน (ตัว Z)
        k = 0 if abs(P[0][0] - P[1][0]) < 1e-6 else 1
        xa = P[k][0]; xs = next(xa + d for d in (0.07, -0.07, 0.12, -0.12) if raf_ok(xa + d))
        p0, p1 = P[k], P[k + 1]
        if k == 0: P = [p0, [xs, p0[1], p0[2]], [xs, p1[1], p1[2]], [p1[0], p1[1], p1[2]]] + P[2:]
        else: P = P[:1] + [p0, [xs, p0[1], p0[2]], [xs, p1[1], p1[2]], p1]
    P = [p for k, p in enumerate(P) if k == 0 or math.dist(p, P[k - 1]) > 0.005]
    return hopify(P)
cond = []; boxes = {}
def C(cid, circ, pts3, st, note):
    q = [[round(a, 3) for a in p] for p in pts3]; out = [q[0]]
    for p in q[1:]:
        if math.dist(p, out[-1]) > 0.004: out.append(p)
    # ตัดจุดกลางที่อยู่บนเส้นตรงเดียวกัน
    o2 = [out[0]]
    for k in range(1, len(out) - 1):
        a, b, c = o2[-1], out[k], out[k + 1]
        u = [b[i] - a[i] for i in range(3)]; v = [c[i] - b[i] for i in range(3)]
        cr = math.dist([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], [0, 0, 0])
        if cr > 1e-6 * (math.hypot(*u) * math.hypot(*v) + 1e-9): o2.append(b)
    o2.append(out[-1])
    cond.append({'id': cid, 'circuit': circ, 'pts': o2, 'status': st, 'src': SRC, 'note': note})
def BOX(bid, xyz, kind, note):
    boxes.setdefault(bid, {'id': bid, 'xyz': [round(c, 3) for c in xyz], 'kind': kind, 'note': note})
    return boxes[bid]['xyz']
# ---- กลุ่มกล่องในผนังที่ติดกัน → ท่อลงเส้นเดียว
HEADS = []
for p in sorted([p for p in pts if p['type'] in ('S1', 'P1')], key=lambda p: p['id']):
    if not any(h['circuit'] == p['circuit'] and h['type'] == p['type'] and math.dist(into_wall(p), into_wall(h)) < 0.45 for h in HEADS): HEADS.append(p)
HEAD_OF = {p['id']: next(h for h in HEADS if h['circuit'] == p['circuit'] and h['type'] == p['type'] and math.dist(into_wall(p), into_wall(h)) < 0.45) for p in pts if p['type'] in ('S1', 'P1')}
for p in pts:
    if p['type'] in ('S1', 'P1') and HEAD_OF[p['id']] is not p:
        h = HEAD_OF[p['id']]; a, b = into_wall(h), into_wall(p)
        C(f'EJ-{p["id"]}', p['circuit'], [[a[0], a[1], h['xyz'][2] + 0.10], [b[0], b[1], p['xyz'][2] + 0.10], [b[0], b[1], p['xyz'][2]]], 'assumed', f'ต่อกล่อง {h["id"]} → {p["id"]} ในผนัง')
# ---- จากกล่องในผนัง (หัวกลุ่ม) ขึ้นเสา → กล่องพักสายหัวเสา
COLTOP = {}
def rise(dev, cid_conduit, circ, note):
    P3, col, f = wall_route(dev)
    bid = f'JB-{col}' if col not in COLTOP else f'JB-{col}-{len([b for b in boxes if b.startswith("JB-" + col)])}'
    same = next((b for b in boxes.values() if b['id'].startswith('JB-' + col) and math.dist(b['xyz'][:2], P3[-1][:2]) < 0.02), None)
    top = same['xyz'] if same else BOX(bid, P3[-1], 'pull', f'กล่องพักสายหัวเสา {col} เหนือฝ้า' if col.startswith('C-') else 'กล่องพักสายเหนือฝ้า ที่ท่อขึ้นแนบข้างอะเสเหล็ก')
    C(cid_conduit, circ, P3, 'user', note + ('' if col.startswith('C-') else ' · **มาร์ก:** ผนังแนวนี้ต่อกับผนังใต้อะเสเหล็ก ท่อวางบนหลังผนังลอดอะเสไม่ได้ → ขึ้นแนบข้างอะเสเข้าเหนือฝ้า'))
    if col not in COLTOP: COLTOP[col] = top
    elif not same:   # กล่องอีกด้านของเสา → ต่อเข้ากล่องหลักของเสา (ข้ามแนวคานยกข้ามหลังคาน)
        C(f'EB-{bid}', circ, Lroute(top, COLTOP[col]), 'user', f'ต่อกล่องหัวเสา {col} สองด้านเสา เหนือฝ้า')
    return col, top
GCOL = {}
for h in HEADS:
    ctl = sorted({l for p in pts if p['type'] == 'S1' and HEAD_OF[p['id']] is h for l in p['controls']})
    col, top = rise(h, f'ED-{h["id"]}', h['circuit'], f'จาก{"กล่องสวิตช์" if h["type"] == "S1" else "กล่องเต้ารับ"} {h["id"]} ขึ้นในผนังถึงหลังผนัง → ลากบนหลังผนังไปเสา → ขึ้นตามผิวเสาเข้าเหนือฝ้า (Earth 13 พ.ย.)')
    GCOL[h['id']] = (col, top, ctl)
pcol, ptop = rise(panel, 'ED-LC', 'L1', 'จากแผง LC ขึ้นในผนังถึงหลังผนัง → ลากบนหลังผนังไปเสา → ขึ้นตามผิวเสาเข้าเหนือฝ้า')
# ---- กิ่งเข้าโคม: จากกล่องหัวเสาไล่โคมใกล้สุดทีละดวง (กล่องต่อสายที่โคม)
def lamp_box(l):
    if l['type'] == 'WL':   # โคมกิ่งติดผนังภายนอก: กล่องเหนือฝ้าชายคาตรงแนวผิวเสา/ผนัง แล้วลงตามผิวถึงโคม
        x, y = l['xyz'][0], l['xyz'][1] - 0.012
        return BOX(f'JB-{l["id"]}', (x, y, ZC(y)), 'lamp', f'กล่องต่อสายเหนือฝ้าชายคา ลงโคม {l["id"]}')
    x, y = l['xyz'][:2]
    return BOX(f'JB-{l["id"]}', (x, y, ZC(y)), 'lamp', f'กล่องต่อสายเหนือฝ้าที่โคม {l["id"]}')
k_ = 0
for hid, (col, top, ctl) in GCOL.items():
    left = [PTS[l] for l in ctl]; cur = top
    while left:
        nx = min(left, key=lambda l: abs(lamp_box(l)[0] - cur[0]) + abs(lamp_box(l)[1] - cur[1])); left.remove(nx); k_ += 1
        bx = lamp_box(nx)
        C(f'EL-{k_:02d}', 'L1', Lroute(cur, bx), 'user', f'กิ่งเข้าโคม {nx["id"]} (สวิตช์ {hid}) เหนือฝ้า')
        if nx['type'] == 'WL':
            C(f'EL-{k_:02d}d', 'L1', [bx, [bx[0], bx[1], nx['xyz'][2] + 0.11]], 'user', f'ลงตามผิวเสา/ผนังด้านนอกถึงโคม {nx["id"]}')
        cur = bx
# ---- สายป้อน: แผง LC → กล่องหัวเสาของแต่ละกลุ่ม (ท่อหลักเลียบแนวแถว B ชิดหน้าเสา)
cols_need = sorted({c for c, t, l in GCOL.values()} - {pcol}, key=lambda c: abs(COLS[c][0] - COLS[pcol][0]))
done = {pcol: ptop}; kf = 0
for c in cols_need:
    src_c = min(done, key=lambda d: abs(COLS[d][0] - COLS[c][0]) + abs(COLS[d][1] - COLS[c][1]) * 3)   # ต่อจากหัวเสาที่ใกล้สุด (ท่อหลักไล่ต่อกัน)
    kf += 1; a, b = done[src_c], COLTOP[c]
    C(f'EF-{kf:02d}', 'L1', Lroute(a, b), 'assumed', f'สายป้อนเหนือฝ้า กล่องหัวเสา {src_c} → {c} (แบบไม่เขียนแนว — คิดเอง)')
    done[c] = b
# ---- สายเมน: เข้าที่ GL 4/C (Earth 13 พ.ย.) ลอยตามผิวเสาด้านนอกขึ้นเหนือฝ้าชายคา → เหนือฝ้าเข้าอาคารช่วงที่พ้นอะเส RB-4 → กล่องหัวเสาที่แผง
mx, my = 10.912, 5.70
y_in = 3.60
mpts = [[mx, my, 0.05 + 1.50], [mx, my, ZC(my)], [10.96, my, ZC(my)], [10.96, y_in, ZC(y_in)]] + Lroute([10.96, y_in], ptop)[1:]
Lm = sum(math.dist(mpts[i], mpts[i + 1]) for i in range(len(mpts) - 1))
m['mep']['electrical']['service'] = {'length': round(Lm, 2), 'conduit': 'PVC สีขาว 1"', 'wire_type': 'IEC 01 (THW)', 'wire_size': 10, 'conductors': 3, 'pts': [[round(c, 3) for c in p] for p in mpts], 'status': 'user',
    'note': 'สายเมนเข้าที่ GL 4/C (Earth 13 พ.ย.): ลอยขึ้นตามผิวนอกเสา 4/C จากจุดรับไฟ +1.55 → เหนือฝ้าชายคา เลียบนอกแนวอะเส RB-4 ถึงช่วงที่ท่อพ้นหลังอะเส → เข้าเหนือฝ้าในอาคารถึงกล่องหัวเสาเหนือแผง LC · สาย 3×10 ตร.มม. ท่อ 1" (Earth 13 พ.ย. ยืนยัน)'}
m['mep']['electrical']['conduits'] = cond
m['mep']['electrical']['boxes'] = list(boxes.values())
m['mep']['electrical']['route_height'] = 3.50   # ใช้เมื่อไม่มีแนวท่อ (มีแนวท่อแล้ว เว็บใช้ความยาวตามแนว)
m['mep']['electrical']['note'] = m['mep']['electrical']['note'].split(' · แนวท่อร้อยสาย')[0].split(' · ยังไม่ได้เขียน')[0] + ' · แนวท่อร้อยสาย (Earth 13 พ.ย.): เหนือฝ้าในช่อง C-Line ใต้ท้องจันทัน · ลงสวิตช์/เต้ารับ/แผงฝังผนัง ขึ้นถึงหลังผนัง ลากบนหลังผนังไปเสา ขึ้นตามผิวเสาเข้าเหนือฝ้า · กล่องต่อสายหัวเสา/ที่โคม (boxes) · ข้ามแนวคานใต้จันทันยกข้ามหลังคาน'
json.dump({'chk': CHK, 'wires': nw}, open(os.path.join(H, 'elchk.json'), 'w'), ensure_ascii=False)
json.dump(m, open(os.path.join(H, 'stage5b.bm.json'), 'w'), ensure_ascii=False, indent=1)
import collections; print(collections.Counter(p['type'] for p in pts)); [print(p['id'], p['xyz'], p.get('rot')) for p in pts if p['type'] in ('S1', 'P1')]; print(panel['xyz'])
