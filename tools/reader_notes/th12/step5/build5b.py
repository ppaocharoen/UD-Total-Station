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

# ================= แนวท่อร้อยสายจริง (Earth 13 พ.ย.: เขียนแนวจริง ตามแนวทางที่ตกลงไว้ตอนทำแบบห้องสุขาชุดก่อน 22 ต.ค.)
# เส้นสายไฟในแบบ (ชั้น EL_wire) = สายจากสวิตช์ไปโคม (เส้นโค้ง/เฉียง = สัญลักษณ์โยงจุด) → เดินท่อมุมฉากเลียบแนวผนัง/คาน
# ระดับ: แสงสว่างเดินลอยใต้ท้องฝ้า (หมายเหตุ E.2.01) · ลงสวิตช์/เต้ารับ/แผงฝังในผนัง · สายป้อนจากแผง LC แบบไม่เขียน → มุมฉาก จุดใกล้สุดทีละจุด (คิดเอง)
import math, collections, sys
sys.path.insert(0, H); from ex5 import sheet, loc
ESH = sheet('E.2.01'); EL = loc('E.2.01')
PTS = {p['id']: p for p in pts}
RAWE = {}   # จุดที่เส้นสายในแบบมาจับ: ปลายหลอดทั้งสอง + กึ่งกลาง / ตำแหน่งสัญลักษณ์สวิตช์
for p in pts:
    x, y = p['xyz'][:2]
    if p['type'] in ('L18', 'L9'):
        h = 0.60 if p['type'] == 'L18' else 0.35
        d = (0, h) if p.get('rot') == 90 else (h, 0)
        RAWE[p['id']] = [(x - d[0], y - d[1]), (x + d[0], y + d[1]), (x, y)]
SYMSW = {f'S-{n}': (sx if sx is not None else x, (2.007 if n in ('02', '11') else y) if r != 90 else 3.32) for n, x, y, r, sx, room, ctl in SW}
for k, v in SYMSW.items(): RAWE[k] = [v]
RAWE['WL-01'] = [(-0.002, -0.096)]; RAWE['WL-02'] = [(10.798, -0.296)]
def near_pt(pt):
    best = min(((math.dist(pt, e), pid, e) for pid, es in RAWE.items() for e in es), default=(9, None, None))
    return (best[1], best[2]) if best[0] < 0.45 else (None, None)
WALL2 = [w['path'] for w in m['walls'] if w['kind'] in ('brick_mon', 'block', 'aac') and len(w['path']) == 2 and not w['id'].startswith('W-ST')]
def wdist(px, py):
    best = 9
    for a, b in WALL2:
        dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)); best = min(best, math.hypot(px - a[0] - t * dx, py - a[1] - t * dy))
    return best
def hug(a, b, n=10): return sum(wdist(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n + 1)) / (n + 1) * math.dist(a, b)
def Lp(a, b):
    c1, c2 = (b[0], a[1]), (a[0], b[1])
    return [a, c1, b] if hug(a, c1) + hug(c1, b) <= hug(a, c2) + hug(c2, b) else [a, c2, b]
def ortho(xy, arc):
    if arc: return Lp(xy[0], xy[-1])
    out = [xy[0]]
    for b in xy[1:]:
        a = out[-1]
        if math.dist(a, b) < 0.01: continue
        out += [b] if abs(a[0] - b[0]) < 0.02 or abs(a[1] - b[1]) < 0.02 else Lp(a, b)[1:]
    return out
ZOFF = 0.015   # ท่อ 1/2" เดินลอยแนบใต้ฝ้า (ศูนย์ท่อต่ำกว่าผิวฝ้า)
zt = lambda x, y: round(zc(y) - ZOFF, 3)
def into_wall(p):   # จุดในแนวศูนย์ผนังหลังกล่องสวิตช์/เต้ารับ/แผง (ฝังผนัง)
    r = math.radians(p.get('rot', 0)); return (round(p['xyz'][0] - 0.03 * math.cos(r), 3), round(p['xyz'][1] - 0.03 * math.sin(r), 3))   # ท่อฝังในเนื้อผนัง ลึกจากผิว 0.03
def drop(p, top=True):   # จากใต้ฝ้า ลงในผนังถึงกล่อง
    wx, wy = into_wall(p); z = p['xyz'][2]
    return [[wx, wy, zt(wx, wy)], [wx, wy, z]]
cond = []
def C(cid, circ, pts3, st, note):
    q = [[round(a, 3) for a in p] for p in pts3]; out = [q[0]]
    for p in q[1:]:
        if math.dist(p, out[-1]) > 0.005: out.append(p)
    cond.append({'id': cid, 'circuit': circ, 'pts': out, 'status': st, 'src': SRC, 'note': note})
HEADS = []
for p in sorted([p for p in pts if p['type'] in ('S1', 'P1')], key=lambda p: p['id']):
    if not any(h['circuit'] == p['circuit'] and h['type'] == p['type'] and math.dist(into_wall(p), into_wall(h)) < 0.45 for h in HEADS): HEADS.append(p)   # สวิตช์ติดกันใช้กล่องรวม/ท่อลงเส้นเดียว
HEAD_OF = {p['id']: next(h for h in HEADS if h['circuit'] == p['circuit'] and h['type'] == p['type'] and math.dist(into_wall(p), into_wall(h)) < 0.45) for p in pts if p['type'] in ('S1', 'P1')}
wires = []
for qd in ESH['prims']:
    if qd.get('layer') != 'EL_wire' or qd.get('parent') is not None: continue
    if qd['kind'] == 'poly': xy = [EL(p) for p in qd['p']]
    elif qd['kind'] == 'arc':
        c = EL(qd['c']); a0, a1 = math.radians(qd['a0']), math.radians(qd['a1'])
        if a1 < a0: a1 += 2 * math.pi
        xy = [(c[0] + qd['r'] * math.cos(a0 + (a1 - a0) * k / 12), c[1] + qd['r'] * math.sin(a0 + (a1 - a0) * k / 12)) for k in range(13)]
    else: continue
    xy = [(float(x), float(y)) for x, y in xy]
    if max(x for x, _ in xy) > 11.8: continue   # ตารางสัญลักษณ์
    (A, ea), (B, eb) = near_pt(xy[0]), near_pt(xy[-1])
    wires.append((ortho(xy, qd['kind'] == 'arc'), A, B, ea, eb))
LAMP = ('L18', 'L9', 'WL')
for k, (xy, A, B, ea, eb) in enumerate(wires, 1):
    p3 = [[x, y, zt(x, y)] for x, y in xy]
    for end, pid in ((0, A), (1, B)):
        if not pid: continue
        p = PTS[pid]
        if p['type'] == 'S1':
            seg = drop(HEAD_OF[pid]); h = [[seg[0][0], p3[0 if end == 0 else -1][1], seg[0][2]]] if False else []
            # จากปลายเส้นในแบบ เดินมุมฉากถึงเหนือจุดลงผนัง แล้วลงในผนัง
            tip = p3[0] if end == 0 else p3[-1]
            via = [[q[0], q[1], zt(q[0], q[1])] for q in Lp(tuple(tip[:2]), tuple(seg[0][:2]))[1:]]
            add_ = via + [seg[1]]
            p3 = (add_[::-1] + p3) if end == 0 else (p3 + add_)
        elif p['type'] == 'WL':   # โคมกิ่งติดผนังภายนอก: ลงตามผิวเสา/ผนังถึงโคม
            tip = p3[0] if end == 0 else p3[-1]
            ox, oy = p['xyz'][0], p['xyz'][1] - 0.012   # ท่อลอยแนบผิวเสา/ผนังด้านนอก
            add_ = [[ox, oy, tip[2]], [ox, oy, p['xyz'][2] + 0.11]]
            p3 = (add_[::-1] + p3) if end == 0 else (p3 + add_)
        else:   # โคม: ปลายท่อเข้ากล่องโคมที่ระดับใต้ฝ้า
            tip = p3[0] if end == 0 else p3[-1]
            if math.dist(tip[:2], p['xyz'][:2]) > 0.02 and pid in RAWE and not any(math.dist(tip[:2], e) < 0.02 for e in RAWE[pid]):
                e = min(RAWE[pid], key=lambda e: math.dist(e, tip[:2])); add_ = [[e[0], e[1], zt(*e)]]
                p3 = (add_ + p3) if end == 0 else (p3 + add_)
    C(f'EW-{k:02d}', 'L1', p3, 'from_drawing', f'แนวสายตาม E.2.01 ({A or "?"} ↔ {B or "?"}) · เส้นในแบบปรับเป็นมุมฉากเลียบแนวผนัง · เดินลอยใต้ฝ้า ลงสวิตช์ฝังผนัง')
# ตรวจ: สวิตช์ → โคม จากเส้นในแบบ เทียบกับที่อ่านไว้
par = {p: p for p in PTS}
def fnd(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
for xy, A, B, ea, eb in wires:
    if A and B: par[fnd(A)] = fnd(B)
grp = collections.defaultdict(set)
for pid in PTS:
    if PTS[pid]['type'] in LAMP + ('S1',): grp[fnd(pid)].add(pid)
CHK = []
for p in pts:
    if p['type'] == 'S1':
        g = {q for q in grp[fnd(p['id'])] if PTS[q]['type'] in LAMP}
        CHK.append((p['id'], sorted(g), sorted(p['controls']), g == set(p['controls'])))
# สายป้อน: แผง LC → กลุ่มสวิตช์ (L1) / เต้ารับ (P1, P2) มุมฉากใต้ฝ้า จุดใกล้สุดทีละจุด ลงผนังที่ปลาย
pn = panel; pw = into_wall(pn)
def feeders(circ, targets):
    cur = pw; first = True; k = 0
    while targets:
        nx = min(targets, key=lambda q: abs(into_wall(q)[0] - cur[0]) + abs(into_wall(q)[1] - cur[1])); targets.remove(nx); k += 1
        tw = into_wall(nx)
        p3 = ([[pw[0], pw[1], pn['xyz'][2] + 0.20]] if first else []) + [[q[0], q[1], zt(*q)] for q in Lp(cur, tw)] + [[tw[0], tw[1], nx['xyz'][2]]]
        C(f'EF-{circ}-{k:02d}', circ, p3, 'assumed', f'สายป้อนจากแผง LC ถึง {nx["id"]} — แบบไม่เขียนแนว: เดินมุมฉากใต้ฝ้า ขึ้น/ลงฝังผนัง (คิดเอง)')
        cur = tw; first = False
feeders('L1', [h for h in HEADS if h['type'] == 'S1']); feeders('P1', [h for h in HEADS if h['circuit'] == 'P1']); feeders('P2', [h for h in HEADS if h['circuit'] == 'P2'])
# สวิตช์ติดกัน (กล่องข้างกัน) ต่อถึงกันในผนัง
for p in pts:
    if p['type'] in ('S1', 'P1') and HEAD_OF[p['id']] is not p:
        h = HEAD_OF[p['id']]; a, b = into_wall(h), into_wall(p)
        if math.dist(a, b) > 0.01: C(f'EJ-{p["id"]}', p['circuit'], [[a[0], a[1], h['xyz'][2] + 0.10], [b[0], b[1], p['xyz'][2] + 0.10], [b[0], b[1], p['xyz'][2]]], 'assumed', f'ต่อกล่อง {h["id"]} → {p["id"]} ในผนัง')
# สายเมน: เข้าที่เสา GL 4/C (Earth 13 พ.ย. สมมติ) → แผง LC
mx, my = 10.915, 5.62   # ผิวนอกผนัง GL 4 ข้างเสา 4/C (ท่อลอยแนบผิว)
zin = 3.00
mpts = [[mx, my, 0.05 + 1.50], [mx, my, zin], [10.70, my, zin], [10.70, my, zt(10.70, my)]] + [[q[0], q[1], zt(*q)] for q in Lp((10.70, my), pw)[1:]] + [[pw[0], pw[1], pn['xyz'][2] + 0.20]]
Lm = sum(math.dist(mpts[i], mpts[i + 1]) for i in range(len(mpts) - 1))
m['mep']['electrical']['service'] = {'length': round(Lm, 2), 'conduit': 'PVC สีขาว 1"', 'wire_type': 'IEC 01 (THW)', 'wire_size': 10, 'conductors': 3, 'pts': mpts, 'status': 'user',
    'note': 'สายเมนเข้าที่ GL 4/C (Earth 13 พ.ย. ให้สมมติ): ลอยขึ้นตามผิวนอกผนัง GL 4 ข้างเสา 4/C ถึง +3.00 ลอดผนังอิฐเข้าใน ขึ้นใต้ฝ้า เดินมุมฉากใต้ฝ้าถึงเหนือแผง LC แล้วลงฝังผนัง · จุดรับไฟสูง 1.50 จากทางเดิน · สาย 3×10 ตร.มม. ท่อ 1" (เมน 2P 32A) — Earth 13 พ.ย. ยืนยัน'}
used = set()   # ท่อลงผนังที่ตำแหน่งเดียวกันใช้เส้นเดียว (สายหลายวงจร/หลายสวิตช์ร้อยรวม) — เส้นที่มาทีหลังจบที่จุดเหนือท่อลง
for c in cond:
    P = c['pts']
    for end in (0, -1):
        a_, b_ = (P[0], P[1]) if end == 0 else (P[-1], P[-2])
        if len(P) > 2 and math.dist(a_[:2], b_[:2]) < 0.005 and abs(a_[2] - b_[2]) > 0.3 and a_[2] < 2.5:
            k_ = (round(a_[0], 2), round(a_[1], 2))
            if k_ in used: P.pop(end); c['note'] += ' · ใช้ท่อลงผนังร่วมกับเส้นอื่น'
            else: used.add(k_)
HITS_OK = {'EW-02': 'LH-03', 'EW-09': 'LH-04', 'EW-04': 'LT-01', 'EF-P1-01': 'LH-05', 'EF-P1-02': 'LH-06'}
for c in cond:
    if c['id'] in HITS_OK: c['note'] += f" · ท่อลงผนังผ่าน{'ทับหลัง' if HITS_OK[c['id']].startswith('LT') else 'คานเอ็นกลางผนัง'} {HITS_OK[c['id']]} — ฝังท่อก่อนเท (Earth 13 พ.ย. ให้ผ่านได้)"
m['mep']['electrical']['conduits'] = cond
m['mep']['electrical']['note'] = m['mep']['electrical']['note'].replace(' · ยังไม่ได้เขียนแนวท่อร้อยสาย (ปริมาณท่อ/สายประมาณจากตำแหน่งจุด เดินระดับฝ้าแบบมุมฉาก)', ' · แนวท่อร้อยสายเขียนจริง: สวิตช์→โคมตามเส้นในแบบ (ปรับมุมฉาก) · สายป้อนจากแผงคิดเอง')
json.dump({'chk': CHK, 'unmatched': [(k, A, B) for k, (xy, A, B, ea, eb) in enumerate(wires, 1) if not (A and B)]}, open(os.path.join(H, 'elchk.json'), 'w'), ensure_ascii=False)
json.dump(m, open(os.path.join(H, 'stage5b.bm.json'), 'w'), ensure_ascii=False, indent=1)
import collections; print(collections.Counter(p['type'] for p in pts)); [print(p['id'], p['xyz'], p.get('rot')) for p in pts if p['type'] in ('S1', 'P1')]; print(panel['xyz'])
