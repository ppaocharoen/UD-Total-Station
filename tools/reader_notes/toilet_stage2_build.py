# ขั้น 2 โครงสร้าง — ต่อจากขั้น 1 (stage1_final.bm.json)
# อ่าน: S.2.01 แปลนฐานราก · S.2.02 แปลนคาน/พื้น · S.2.03 แปลนอะเส · S.2.04 แปลนอะเสรับโครงหลังคา + Truss · S.2.05 จันทัน/แป
#       S.3.01 ฐานราก F1/F2 + แผ่นเหล็กหัวเสา · S.3.02 เสา C1 / คาน B1–B3 / พื้น GS / ทางลาด · รูปตัด A.4.x (ระดับ)
# หลักวาง: เหล็กวางบนหัวเสา (ท้องอะเส/คอร์ดล่าง = +3.30) — แนวศูนย์ชิ้นส่วน = ท้อง + ครึ่งความลึก
import json, math, datetime, sys
sys.path.insert(0, '/home/claude/UD-Total-Station/tools')

FD, AS = 'from_drawing', 'assumed'
m = json.load(open('stage1_final.bm.json'))
rows = []
def row(cat, id_, desc, src, st, note=''):
    rows.append((cat, id_, desc, src, st, note))

nodes = {n['id']: n for n in m['nodes']}
members = [x for x in m['members'] if x['type'] == 'stiffener']   # เสาเอ็นจากขั้น 1 คงไว้ · เสาสร้างใหม่ทั้งต้น
secs = {s['id']: s for s in m['sections']}
design = {'members': {}, 'supports': {}, 'slabs': {}}
GX = {'1': 0.0, '2': 4.2, '3': 6.5, '4': 10.8}; GY = {'A': 0.0, 'B': 1.5, 'C': 5.8}

def node(x, y, z, lv=None, grid=None):
    k = (round(x, 3), round(y, 3), round(z, 3))
    for n in nodes.values():
        if (round(n['x'], 3), round(n['y'], 3), round(n['z'], 3)) == k:
            return n['id']
    nid = f'N{len(nodes) + 1:03d}'
    nodes[nid] = dict({'id': nid, 'x': k[0], 'y': k[1], 'z': k[2]}, **({'level': lv} if lv else {}), **({'grid': grid} if grid else {}))
    return nid
def mem(id_, mark, tp, a, b, sec, src, st=FD, mat='C240', note=None, **kw):
    x = dict({'id': id_, 'mark': mark, 'type': tp, 'i': node(*a), 'j': node(*b), 'section': sec, 'material': mat, 'status': st, 'src': src}, **kw)
    if note: x['note'] = note
    members.append(x); return x
def rc(b, h, src):
    k = f'RC-{round(b * 100)}x{round(h * 100)}'
    secs.setdefault(k, {'id': k, 'kind': 'rc_rect', 'b': b, 'h': h, 'status': FD, 'src': src}); return k

mats = [{'id': 'C240', 'kind': 'concrete', 'fc': 240, 'unit_weight': 2400, 'status': 'user', 'note': "แบบไม่ระบุ f'c — 240 ksc ตามที่ Earth กำหนด"},
        {'id': 'SSC400', 'kind': 'cold_formed', 'grade': 'SSC400 (มอก.1228)', 'fy': 2450, 'status': AS, 'note': 'แบบไม่ระบุเกรดเหล็กรูปพรรณ'}]
for x in members:
    x['material'] = 'C240'

# ---------------------------------------------------------------- ฐานราก (S.2.01 + S.3.01)
FT = {'F1': {'b': 1.2, 'h': 0.2, 'bottom': -1.50}, 'F2': {'b': 0.8, 'h': 0.2, 'bottom': -1.45}}
supports = []
for gy in ('C', 'B', 'A'):
    for g in ('1', '2', '3', '4'):
        mk = 'F2' if gy == 'A' else 'F1'; f = FT[mk]
        nb = node(GX[g], GY[gy], f['bottom'] + f['h'], None, f'{g}/{gy}')
        supports.append({'id': f'{mk}-{g}{gy}', 'mark': mk, 'node': nb, 'kind': 'spread', 'b': f['b'], 'd': f['b'], 'h': f['h'], 'bottom': f['bottom'],
                         'sand': 0.10, 'lean': 0.05, 'material': 'C240', 'fixity': 'fixed', 'status': FD, 'src': 'S.2.01 + S.3.01'})
row('ฐานราก', 'F1 × 8', 'F1 1.20×1.20 หนา 0.20 ท้องฐาน −1.50 ใต้ GL · คอนกรีตหยาบ 0.05 · ทรายอัดแน่น 0.10 — แถว C และ B', 'S.2.01, S.3.01', FD)
row('ฐานราก', 'F2 × 4', 'F2 0.80×0.80 หนา 0.20 ท้องฐาน −1.45 · คอนกรีตหยาบ 0.05 · ทราย 0.10 — แถว A ทั้ง 4 จุด (A2/A3 รับแค่คาน)', 'S.2.01, S.3.01', FD, 'ดินรับน้ำหนักได้ ≥ 10 ตัน/ตร.ม. (หมายเหตุแบบ)')

# ---------------------------------------------------------------- เสา: ตอม่อ (หัวฐาน → หลังคานคอดิน) + C1 เหนือพื้น (→ +3.30)
c20 = rc(0.2, 0.2, 'S.3.01 / S.3.02 (C1 0.20×0.20)')
TB = 0.20          # หลังคานคอดินทั่วไป
for s in supports:
    n = nodes[s['node']]; g = n['grid'].split('/'); x, y = n['x'], n['y']
    top_pier = 0.25 if g[1] == 'A' else TB
    mem(f'P-{g[0]}{g[1]}', 'C1', 'column', (x, y, n['z']), (x, y, top_pier), c20, 'S.2.01 + S.3.01 + S.3.02 (ตาราง C1 แถว "ตอม่อ")', level='GL')
    if not (g[1] == 'A' and g[0] in ('2', '3')):
        mem(f'C-{g[0]}{g[1]}', 'C1', 'column', (x, y, top_pier), (x, y, 3.30), c20, 'A.2.01 + S.3.02 (ตาราง C1 แถว "อะเส")', level='1F')
row('เสา', 'P-1C…P-4A (ตอม่อ 12 ต้น)', 'ตอม่อ 0.20×0.20 จากหลังฐานรากถึงหลังคานคอดิน (+0.20; แถว A ถึง +0.25)', 'S.2.01, S.3.01, S.3.02', FD)
row('เสา', 'C-1C…C-4A (10 ต้น)', 'เสา C1 0.20×0.20 จากหลังคานคอดินถึง +3.30 (ท้องอะเส) — A2/A3 ไม่มีเสาเหนือพื้น', 'A.2.01, S.3.02, รูปตัด', FD)

# ---------------------------------------------------------------- คานคอดิน (S.2.02 + S.3.02) 0.20×0.40 ทุกตัว
b40 = rc(0.2, 0.4, 'S.3.02 (B1/B2/B3 0.20×0.40)')
X = {'0': 0.0, '2.0': 2.0, '3.1': 3.1, '4.2': 4.2, '5.35': 5.35, '6.5': 6.5, '7.5': 7.5, '8.6': 8.6, '9.2': 9.2, '9.7': 9.7, '10.8': 10.8}
beams = [  # (mark, แกน, ตำแหน่ง, จาก, ถึง)
    ('B1', 'H', 5.8, 0.0, 10.8), ('B2', 'H', 4.2, 2.0, 4.2), ('B1', 'H', 4.2, 6.5, 10.8),
    ('B2', 'H', 3.1, 0.0, 2.0), ('B1', 'H', 3.1, 4.2, 6.5), ('B2', 'H', 3.1, 9.2, 10.8),
    ('B1', 'H', 1.5, 0.0, 4.2), ('B1', 'H', 1.5, 6.5, 10.8), ('B2', 'H', 0.9, 4.2, 6.5),
    ('B2', 'H', 0.0, 0.0, 10.8),
    ('B1', 'V', 0.0, 1.5, 5.8), ('B2', 'V', 0.0, 0.0, 1.5), ('B1', 'V', 2.0, 1.5, 5.8), ('B2', 'V', 3.1, 4.2, 5.8),
    ('B1', 'V', 4.2, 1.5, 5.8), ('B2', 'V', 4.2, 0.0, 1.5), ('B2', 'V', 5.35, 3.1, 5.8), ('B1', 'V', 6.5, 1.5, 5.8), ('B2', 'V', 6.5, 0.0, 1.5),
    ('B2', 'V', 7.5, 4.2, 5.8), ('B2', 'V', 8.6, 4.2, 5.8), ('B2', 'V', 9.7, 4.2, 5.8), ('B2', 'V', 9.2, 1.5, 4.2),
    ('B1', 'V', 10.8, 1.5, 5.8), ('B2', 'V', 10.8, 0.0, 1.5),
]
# ระดับหลังคาน: ใต้พื้น +0.25 (ทางเข้า/คนพิการ) = +0.25 · ที่เหลือ +0.20
hi_zone = lambda x, y: (y <= 1.5 + 1e-6 and not (abs(y - 1.5) < 1e-6)) or (4.2 - 1e-6 <= x <= 6.5 + 1e-6 and 0.9 - 1e-6 <= y <= 3.1 + 1e-6 and not (abs(y - 3.1) < 1e-6 or abs(x - 4.2) < 1e-6 and y > 1.5 or abs(x - 6.5) < 1e-6 and y > 1.5))
cuts_all = {'H': {}, 'V': {}}
for mk, ax, c, a, b in beams:
    cuts_all[ax].setdefault(c, []).append((a, b))
def crossings(ax, c, a, b):
    pts = {a, b}
    for mk2, ax2, c2, a2, b2 in beams:
        if ax2 != ax and a - 1e-6 <= c2 <= b + 1e-6 and a2 - 1e-6 <= c <= b2 + 1e-6:
            pts.add(c2)
    for g in GX.values() if ax == 'H' else GY.values():
        if a < g < b and any(abs(c - (GY if ax == 'H' else GX)[k]) < 1e-6 for k in (GY if ax == 'H' else GX)):
            pts.add(g)
    return sorted(pts)
cnt = {}
for mk, ax, c, a, b in beams:
    pts = crossings(ax, c, a, b)
    for u, v in zip(pts, pts[1:]):
        if v - u < 0.05:
            continue
        P = (lambda t: (t, c)) if ax == 'H' else (lambda t: (c, t))
        mid = P((u + v) / 2)
        z = 0.25 if (ax == 'H' and c < 1.5 - 1e-6) or (ax == 'V' and v <= 1.5 + 1e-6) or (ax == 'H' and abs(c - 0.9) < 1e-6) else TB
        cnt[mk] = cnt.get(mk, 0) + 1
        x = mem(f'{mk}-{cnt[mk]:02d}', mk, 'tie_beam', (*P(u), z), (*P(v), z), b40, 'S.2.02 + S.3.02', level='1F')
        if z == 0.25:
            x['note'] = 'หลังคานใต้พื้น +0.25 (ทางเข้า/คนพิการ) — Earth ยืนยัน · จะดรอปลงตามความหนาวัสดุผิวพื้นในขั้น 4'
            x['status'] = 'user'
row('คาน', 'B1', 'คานคอดิน B1 0.20×0.40: แนว C, แนว B (1–2, 3–4), x 2.00/4.20/6.50 และกริด 1/4 ช่วง C→B, y 4.20 (6.50–10.80), y 3.10 (4.20–6.50)', 'S.2.02, S.3.02', FD)
row('คาน', 'B2', 'คานคอดิน B2 0.20×0.40: แนว A ตลอด, กริด 1/2/3/4 ช่วง B→A, y 0.90 (หน้าห้องคนพิการ), ใต้ผนังกั้นห้องส้วม x 3.10/7.50/8.60/9.70 (C→4.20), x 5.35 (C→3.10), x 9.20 (4.20→B), y 3.10 (0–2.00 และ 9.20–10.80), y 4.20 (2.00–4.20)', 'S.2.02, S.3.02', FD)
row('คาน', 'ระดับหลังคาน', 'หลังคาน +0.20 ทั่วไป · คานใต้พื้น +0.25 (แนว A, กริด 1–4 ช่วง B→A, y 0.90) ใส่ +0.25', 'S.3.02 (หลังคานเสมอหลังพื้น), A.2.01', 'user', 'Earth ยืนยัน · พื้นและคานจะดรอปลงเท่าความหนาวัสดุผิวพื้นในขั้น 4')
# คาน B3 รอบทางลาด: หลังคานไล่ตามผิวทางลาด
ramp_z = lambda x: 0.05 + 0.20 * min(1, max(0, (x - 3.0) / 2.4))
b3 = [('H', -0.2, 3.1, 5.5), ('H', -0.2, 5.5, 6.5), ('H', -1.0, 3.1, 5.5), ('H', -1.0, 5.5, 6.5), ('V', 3.1, -1.0, -0.2), ('V', 5.5, -1.0, -0.2), ('V', 6.5, -1.0, -0.2)]
for k, (ax, c, a, b) in enumerate(b3, 1):
    pa, pb = ((a, c), (b, c)) if ax == 'H' else ((c, a), (c, b))
    mem(f'B3-{k:02d}', 'B3', 'tie_beam', (*pa, round(ramp_z(pa[0]), 3)), (*pb, round(ramp_z(pb[0]), 3)), b40, 'S.2.02 (B3 รอบทางลาด) + S.3.02', level='1F',
        note='หลังคานไล่ตามผิวทางลาด/ชานพัก')
row('คาน', 'B3 × 7', 'คาน B3 0.20×0.40 รอบทางลาด: แนว y −0.20 / −1.00 และ x 3.10 / 5.50 / 6.50 หลังคานไล่ตามผิวทางลาด', 'S.2.02, S.3.02, A.5.01', FD, 'แบบขยายทางลาด S.3.02 วาดขอบเป็นแผ่นพับลง — ใช้ตามแปลน S.2.02 (คาน B3)')

# ---------------------------------------------------------------- พื้น (S.3.02): GS ภายใน 0.12 / GS ภายนอก 0.12 + ขอบหนา 0.24 / ทางลาด 0.10
for s in m['slabs']:
    s['material'] = 'C240'
    if s['mark'] == 'F2':
        s['t'] = 0.12; s['status'] = FD; s['src'] += ' + S.3.02 (GS ภายใน หนา 0.12 ทรายอัด 0.10)'
        design['slabs'][s['id']] = {'rebar': {'wire_mesh': 'WM-4@0.20'}, 'status': FD, 'src': 'S.3.02 (Wire mesh Ø4 @0.20)'}
    elif s['mark'] == 'F1':
        s['t'] = 0.12; s['src'] += ' + S.3.02 (GS ภายนอก หนา 0.12 ขอบนอกหนา 0.24)'
        OB = lambda p: abs(p[0] + 1.1) < 1e-6 or abs(p[0] - 11.9) < 1e-6 or abs(p[1] + 1.1) < 1e-6 or abs(p[1] - 6.9) < 1e-6
        pg = s['polygon']
        sides = [i for i in range(len(pg)) if (abs(pg[i][0] - pg[(i + 1) % len(pg)][0]) < 1e-6 and abs(abs(pg[i][0]) - (1.1 if pg[i][0] < 0 else 0)) < 1e-6 and pg[i][0] < 0
                 or abs(pg[i][0] - 11.9) < 1e-6 and abs(pg[(i + 1) % len(pg)][0] - 11.9) < 1e-6
                 or abs(pg[i][1] + 1.1) < 1e-6 and abs(pg[(i + 1) % len(pg)][1] + 1.1) < 1e-6
                 or abs(pg[i][1] - 6.9) < 1e-6 and abs(pg[(i + 1) % len(pg)][1] - 6.9) < 1e-6)]
        s['edge_thicken'] = {'d': 0.12, 'w_top': 0.25, 'w_bot': 0.12, 'sides': sides}
        s['note'] = (s.get('note', '') + ' · ขอบนอกพับลงลึก 0.12 คางหมูกว้างบน 0.25 ล่าง 0.12 (S.3.02)').strip(' ·')
        design['slabs'][s['id']] = {'rebar': {'mesh': [6, 0.25, 1]}, 'status': FD, 'src': 'S.3.02 (RB6 @0.25)'}
    elif s['mark'] == 'F3':
        s['t'] = 0.10; s['src'] += ' + S.3.02 (ทางลาด หนา 0.10)'
        design['slabs'][s['id']] = {'rebar': {'mesh': [9, 0.30, 2]}, 'status': FD, 'src': 'S.3.02 (RB9 @0.30 สองทาง)'}
row('พื้น', 'FL-020, FL-025', 'พื้นวางบนดิน GS ภายใน หนา 0.12 · Wire mesh Ø4 @0.20 · ทรายอัดแน่น 0.10 · เซาะร่องรอยต่อกับคาน', 'S.3.02, S.2.02', FD)
row('พื้น', 'WK-01…05', 'ทางเดินรอบอาคาร GS ภายนอก หนา 0.12 RB6 @0.25 · ขอบนอกพับลงลึกเพิ่ม 0.12 (หนารวม 0.24) หน้าตัดคางหมูกว้างบน 0.25 ล่าง 0.12 รอบขอบนอก · ไม่มีคาน', 'S.3.02, S.2.02', FD, 'ความกว้างคางหมูวัดจากแบบขยาย 1:15')
row('พื้น', 'RP-01, PF-01', 'ทางลาด/ชานพัก หนา 0.10 RB9 @0.30 สองทาง', 'S.3.02', FD)

# ---------------------------------------------------------------- โครงหลังคาเหล็ก
def cf(id_, name, shape, d, double=False):
    t = d['t']
    per = (d['h'] + 2 * d['b'] + 2 * d.get('lip', 0) - 4 * t) if shape == 'lipped_C' else 2 * (d['h'] + d['b'] - 2 * t)
    secs[id_] = {'id': id_, 'kind': 'cold_formed', 'shape': shape, 'name': name, 'kg_m': round(per * t * 7850 * (2 if double else 1), 2),
                 'dims': {k: (v * 2 if (double and k == 'b') else v) for k, v in d.items()}, 'status': FD, 'src': 'S.2.03–S.2.05',
                 'note': 'น้ำหนัก/ม. คิดจากเส้นกลางแผ่น (ยังไม่ใช่ตาราง มอก.)'}
    return id_
CH = cf('BOX75x75x3.2', '□75x75x3.2', 'box', {'h': 0.075, 'b': 0.075, 't': 0.0032})
WB = cf('BOX38x38x1.6', '□38x38x1.6', 'box', {'h': 0.038, 'b': 0.038, 't': 0.0016})
P2C = cf('2C100x50x20x2.3', '2C-100x50x20x2.3', 'lipped_C', {'h': 0.1, 'b': 0.05, 'lip': 0.02, 't': 0.0023}, True)
P1C = cf('C100x50x20x2.3', 'C-100x50x20x2.3', 'lipped_C', {'h': 0.1, 'b': 0.05, 'lip': 0.02, 't': 0.0023})
RF = cf('C75x45x15x3.2', 'C-75x45x15x3.2', 'lipped_C', {'h': 0.075, 'b': 0.045, 'lip': 0.015, 't': 0.0032})
PL = cf('BOX50x25x2.0', '□50x25x2.0', 'box', {'h': 0.025, 'b': 0.05, 't': 0.002})   # แปวางแบน สูง 25
TOPA, PLATE = 3.70, 3.30          # หลัง Truss / ท้องอะเส (หลังเสา)
hc = 0.075
# ระนาบท้องจันทัน: ฝั่ง A = หลัง Truss +3.70 · ฝั่ง C = หลังอะเส 2C ที่วางบนหัวเสา (+3.30 + 0.10)
zA, zC = TOPA, PLATE + 0.10
zr = lambda y: zA + (zC - zA) * y / 5.8
tm = {}
def st(mk, tp, a, b, sec, src, stt=FD, note=None):
    tm[mk] = tm.get(mk, 0) + 1
    return mem(f'{mk}-{tm[mk]:02d}', mk, tp, a, b, sec, src, stt, 'SSC400', note, level='PLATE', group='roof_frame')
# Truss T1 แนว A: คอร์ดล่างวางบนหัวเสา A1/A4 (ท้อง +3.30) · คอร์ดบนหลัง +3.70 ยื่นชายคา 1.10 สองข้าง · 4EQ/2EQ/4EQ
yb, yt = PLATE + hc / 2, TOPA - hc / 2
pts = [0.0]
for a, b, n in ((0.0, 4.2, 4), (4.2, 6.5, 2), (6.5, 10.8, 4)):
    pts += [round(a + (b - a) * k / n, 4) for k in range(1, n + 1)]
for u, v in zip(pts, pts[1:]):
    st('T1', 'truss_chord', (u, 0, yb), (v, 0, yb), CH, 'S.2.04 แบบขยาย Truss T1')
ends = [-1.1] + pts + [11.9]
for u, v in zip(ends, ends[1:]):
    st('T1', 'truss_chord', (u, 0, yt), (v, 0, yt), CH, 'S.2.04 (คอร์ดบนยื่นชายคา 1.10)')
for x in pts:
    st('T1', 'truss_web', (x, 0, yb), (x, 0, yt), WB, 'S.2.04')
for k, (u, v) in enumerate(zip(pts, pts[1:])):
    a, b = ((u, 0, yb), (v, 0, yt)) if k % 2 == 0 else ((u, 0, yt), (v, 0, yb))
    st('T1', 'truss_web', a, b, WB, 'S.2.04 (ทแยงฟันปลาตามรูปขยาย)')
row('หลังคา', 'T1', 'Truss T1 แนว A: คอร์ด □75x75x3.2 ล่าง (ท้อง +3.30 บนหัวเสา A1/A4) ยาว 10.80 · บน (หลัง +3.70) ยื่นชายคา 1.10 สองข้าง · ค้ำ □38x38x1.6 ตั้ง+ทแยง 4EQ/2EQ/4EQ', 'S.2.04, S.2.03, A.4.x', FD)
# อะเส: แนว C 2C บนหัวเสา ยาวเต็มชายคา −1.10→11.90 (S.2.03/04) · แนว B ล่าง 2C บนหัวเสา 0→10.80 (S.2.03) · ดั้ง 2C ที่หัวเสา B · แนว B บน 2C ยาวเต็มชายคา (S.2.04)
zp = PLATE + 0.05
cxs = [-1.1, 0.0, 4.2, 6.5, 10.8, 11.9]
for u, v in zip(cxs, cxs[1:]):
    st('P1', 'steel_beam', (u, 5.8, zp), (v, 5.8, zp), P2C, 'S.2.03/S.2.04 อะเส ① แนว C (ยาวเต็มชายคา)')
for u, v in zip([0.0, 4.2, 6.5], [4.2, 6.5, 10.8]):
    st('P1', 'steel_beam', (u, 1.5, zp), (v, 1.5, zp), P2C, 'S.2.03 อะเส ① แนว B บนหัวเสา')
zb_top = zr(1.5) - 0.05          # อะเสบนแนว B: หลังอะเส = ท้องจันทัน
for x in (0.0, 4.2, 6.5, 10.8):
    st('CX', 'steel_column', (x, 1.5, zp), (x, 1.5, round(zb_top, 3)), P2C, 'S.2.03 ดั้ง CX บนอะเสแนว B (ตรงหัวเสา)')
for u, v in zip(cxs, cxs[1:]):
    st('P3', 'steel_beam', (u, 1.5, round(zb_top, 3)), (v, 1.5, round(zb_top, 3)), P2C, 'S.2.04 อะเส ① แนว B บนดั้ง (ยาวเต็มชายคา)')
for x in (0.0, 10.8):
    for u, v in ((5.8, 1.5), (1.5, 0.0)):
        st('P2', 'steel_beam', (x, u, zp), (x, v, zp), P2C, 'รูปตัด A.4.01/A.4.06 (2C ราบบนหัวเสา วิ่งชนโครงถักแนว A)', 'user',
           'แบบขัดกัน: แปลน S.2.03/04 เขียน C เดี่ยว ช่วง C→B · รูปตัด A เป็น 2C วิ่งถึงโครงถัก — Earth ให้ใช้ 2C ถึงแนว A')
row('หลังคา', 'P1 แนว C', 'อะเส 2C-100x50x20x2.3 แนว C วางบนหัวเสา (ท้อง +3.30) ยาวเต็มชายคา −1.10→11.90', 'S.2.03, S.2.04', FD)
row('หลังคา', 'P1 แนว B (ล่าง) + CX + P3 (บน)', f'แนว B: อะเส 2C บนหัวเสา (ท้อง +3.30) x 0→10.80 · ดั้ง 2C ที่ B1–B4 · อะเส 2C บนดั้ง ยาวเต็มชายคา หลัง +{zb_top:.2f}', 'S.2.03, S.2.04, A.4.01/02', FD, 'ความสูงดั้งคิดจากแนวท้องจันทัน')
row('หลังคา', 'P2', 'อะเส 2C-100x50x20x2.3 กริด 1 / 4 วางบนหัวเสาราบ (ท้อง +3.30) จาก C ถึงโครงถักแนว A', 'A.4.01, A.4.06 (แปลน S.2.03/04 ผิด)', 'user', 'แบบขัดกัน — แปลน S เขียน C เดี่ยว C→B · Earth ให้ตามรูปตัด A: 2C ถึงแนว A')
# จันทัน 13 ตัว (S.2.05) แบ่งช่วงที่ A / B / C · แป 9 แนว แบ่งที่จันทัน
RX = [-1.1, 0.0, 1.06, 2.14, 3.22, 4.3, 5.38, 6.5, 7.54, 8.62, 9.7, 10.8, 11.9]
PY = [-1.1, -0.09, 0.91, 1.89, 2.89, 3.89, 4.88, 5.88, 6.9]
zrc = lambda y: round(zr(y) + hc / 2, 4)
for x in RX:
    for u, v in zip([-1.1, 0.0, 1.5, 5.8], [0.0, 1.5, 5.8, 6.9]):
        st('RF', 'rafter', (x, u, zrc(u)), (x, v, zrc(v)), RF, 'S.2.05 (ลูกศรชี้ทีละตัว) + S.2.03')
zpc = lambda y: round(zr(y) + hc + 0.0125, 4)
for y in PY:
    for u, v in zip(RX, RX[1:]):
        st('PL', 'purlin', (u, y, zpc(y)), (v, y, zpc(y)), PL, 'S.2.05')
pitch = math.degrees(math.atan((zA - zC) / 5.8))
row('หลังคา', 'RF × 13', 'จันทัน C-75x45x15x3.2 13 ตัว x −1.10…11.90 ยาวเต็มชายคา วางบน Truss (A) อะเสบน (B) อะเส (C)', 'S.2.05, S.2.03', FD)
row('หลังคา', 'PL × 9 แนว', 'แป □50x25x2.0 9 แนว y −1.10…6.90 ยาว −1.10→11.90', 'S.2.05', FD)
row('หลังคา', 'ความลาด', f'ท้องจันทัน: ฝั่ง A +{zA:.2f} (หลัง Truss) → ฝั่ง C +{zC:.2f} (หลังอะเส) = ลาด {pitch:.2f}°', 'A.4.x, S.2.03', 'user', '"+3.30 ระดับอะเส" = ท้องอะเส (Earth ยืนยัน) · เดิม 3.95°')
for r in m['roofs']:
    stack = hc + 0.025
    r['eave'] = round(zr(6.9) + stack, 3); r['pitch'] = round(pitch, 2)
    r['rafter'] = {'section': RF, 'spacing': 1.08}; r['purlin'] = {'section': PL, 'spacing': 1.0}
    r['note'] = f'แผ่นหลังคาบนแป: ท้องจันทัน + จันทัน 0.075 + แป 0.025'
# แผ่นเหล็กหัวเสา (S.3.01): ทุกเสาที่รับเหล็ก
row('หลังคา', 'แผ่นเหล็กหัวเสา × 10', 'Plate 200x200x9 มม. + J-Bolt ชุบกัลวาไนซ์ 10x300 มม. 4 ตัว ที่หัวเสา C1 ทุกต้น (รับ Truss / อะเส)', 'S.3.01', FD, 'ยังไม่ได้ใส่เป็นชิ้นในโมเดล — คิดปริมาณในขั้น BOQ')
row('อื่นๆ', 'ขอบคันกั้นทางลาด', 'ขอบ ⑥ จากขั้น 1 เป็นคอนกรีตต่อกับพื้นทางลาด (S.3.02 แบบขยายทางลาด)', 'A.5.01, S.3.02', FD, 'เก็บเป็นผนัง other — ปริมาณคอนกรีตยังไม่รวม')

bm = dict(m)
bm['meta'] = dict(m['meta'], name='ห้องสุขา รร.เทศบาล 4 — ขั้น 2 โครงสร้าง', stage=2)
bm['materials'] = mats
bm['sections'] = list(secs.values())
bm['nodes'] = [n for n in nodes.values() if n['id'] in {v for x in members for v in (x['i'], x['j'])} | {s['node'] for s in supports}]
bm['members'] = members
bm['supports'] = supports
bm['design'] = design
bm['history'] = m['history'] + [{'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบขั้น 2)', 'sections': ['*'], 'note': 'โครงสร้าง: ฐานราก ตอม่อ คาน พื้น โครงหลังคา'}]
json.dump(bm, open('stage2.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage2_rows.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(x['mark'] for x in members))
