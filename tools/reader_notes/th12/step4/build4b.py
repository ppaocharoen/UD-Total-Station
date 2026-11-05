# Step 4 วัสดุ/ผิว — ห้องน้ำ ท12 · ส่วนที่ 2: ผิวผนังทีละด้าน + ผิวเสา + ระแนง/บล็อก/ประตู (ลาย 3D) + เชิงชาย/ครอบ (3D)
# แผ่น: A.2.01 ป้ายวัสดุผนัง ใน|นอก (1 ฉาบทาสี · 2 กระเบื้อง · 3 บล็อกช่องลม · 4 อิฐแดงโชว์ลาย · 5 บล็อกแก้ว · 6 ทรายล้าง · 7 ระแนง)
#       A.4.03 รูปตัด: ป้าย 2 เต็มความสูงผนัง · A.5.01 คันทางลาด · A.7.01 แบบประตู
# Earth 5 พ.ย.: ฉาบเสาแยก (ฉาบโครงสร้าง) · อิฐโชว์ลายไม่ฉาบ (เหมือนกระเบื้อง) · ด้านที่หันออกโถงทางเข้า/ทางเดิน = ภายนอก
import json, math, collections, datetime
FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage4.bm.json'))
F = m['finishes']; rows = json.load(open('stage4_rows.json'))
def row(cat, id_, desc, src, st=FD, note=''): rows.append((cat, id_, desc, src, st, note))
OT = m['opening_types']; WL = {w['id']: w for w in m['walls']}; N = {n['id']: n for n in m['nodes']}
OPS = collections.defaultdict(list)
for o in m['openings']: OPS[o['wall']].append(o)
def oarea(t): return t['w'] * t['h'] + (math.pi * (t['w'] / 2) ** 2 / 2 if t.get('shape') == 'arch' else 0)

# ---------------------------------------------------------------- พื้นที่ห้อง (จากผิวพื้น Step 4 ส่วนที่ 1)
FLOORS = [(f['polygon'], f['room']) for f in F if f['kind'] == 'floor']
FZ = {}
for f in F:
    if f['kind'] == 'floor': FZ.setdefault(f['room'], f['z'])   # ระดับผิวพื้นของพื้นที่ที่ผิวผนังหันไปหา (ทางลาดใช้ระดับชานพัก — คันมีผิวแยก)
def oband(o, wb, z0, z1):   # พื้นที่ช่องเปิดเฉพาะช่วงความสูง [z0, z1] (ระดับจริง) · ช่องโค้ง: ส่วนตรง + ครึ่งวงกลม (ตัดเป็นชิ้นบาง)
    t = OT[o['type']]; s0 = wb + (o.get('sill', t.get('sill')) or 0); s1 = s0 + t['h']
    a = t['w'] * max(0.0, min(s1, z1) - max(s0, z0))
    if t.get('shape') == 'arch':
        r = t['w'] / 2; n = 200
        for i in range(n):
            zz = s1 + (i + 0.5) * r / n
            if z0 <= zz <= z1: a += 2 * math.sqrt(max(0.0, r * r - (zz - s1) ** 2)) * r / n
    return a
def pip(P, x, y):
    c = False
    for i in range(len(P)):
        (x1, y1), (x2, y2) = P[i], P[(i + 1) % len(P)]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c
def space(x, y):
    for P, r in FLOORS:
        if pip(P, x, y): return r
    return 'ภายนอก'
ROOM = lambda r: r.startswith('ห้องน้ำ')   # ห้องน้ำ = ด้าน "ใน" · ทางเข้า/ทางเดิน/ทางลาด/นอกอาคาร = ด้าน "นอก" (ภายนอก)

SPEC = {'1': 'ผนังฉาบปูนเรียบทาสีน้ำอะคริลิก', '2': 'ผนังกรุกระเบื้องเซรามิค ผิวมัน', '4': 'ผนังกรุแผ่นตกแต่งอิฐแดงโชว์ลาย', '6': 'ผิวทรายล้าง'}
VENEER = {'W-B1': (1.20, 2.30), 'W-B6': (0.00, 1.20)}   # ป้าย 4 ด้านนอก: W-B1 x 1.30–2.40 · W-B6 x 8.30–9.50 (Step 1)

# ---------------------------------------------------------------- ผิวผนังรายด้าน (ผนังก่ออิฐ)
area = collections.defaultdict(lambda: {'int': 0.0, 'ext': 0.0})
SUM = collections.defaultdict(float); WT = []; k = 0; bad = []
for w in m['walls']:
    if w['kind'] != 'brick_mon': continue
    (ax, ay), (bx, by) = w['path']; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
    mk = w['mark']; inn, out = mk.split('|'); extra = None
    if '+' in out: out, extra = out.split('+')
    H = w['top'] - w['bottom']
    sides = {}
    for sd, sg in (('L', 1), ('R', -1)):
        nx, ny = -uy * sg, ux * sg; off = w['t'] / 2 + 0.06
        sp = [space(ax + ux * (i + 0.5) * L / 10 + nx * off, ay + uy * (i + 0.5) * L / 10 + ny * off) for i in range(10)]
        rm = collections.Counter(sp).most_common(1)[0][0]
        sides[sd] = rm
    if inn != out or extra:
        ins = [sd for sd, r in sides.items() if ROOM(r)]
        if len(ins) != 1: bad.append((w['id'], sides)); continue
    for sd, rm in sides.items():
        isin = ROOM(rm); tag = (inn if isin else out) if (inn != out or extra) else inn
        ext = not isin; ka = 'ext' if ext else 'int'
        zones = [(0.0, L, tag)]
        if extra and not isin and w['id'] in VENEER:
            v0, v1 = VENEER[w['id']]; zones = [z for z in [(0.0, v0, tag), (v0, v1, extra), (v1, L, tag)] if z[1] - z[0] > 1e-6]
        for u0, u1, tg in zones:
            zb = max(w['bottom'], FZ.get(rm, w['bottom'])); Hs = w['top'] - zb
            op = sum(oband(o, w['bottom'], zb, w['top']) for o in OPS[w['id']] if u0 - 1e-6 <= o['at'] <= u1 + 1e-6)
            net = round(max(0.0, (u1 - u0) * Hs - op), 3)
            k += 1
            f = {'id': f'WF-{w["id"][2:]}-{sd}{"-" + tg if len(zones) > 1 else ""}', 'kind': 'wall', 'spec': SPEC[tg] + (' ภายนอก' if tg == '1' and ext else ' ภายใน' if tg == '1' else ''),
                 'status': FD, 'src': f'A.2.01 ป้ายวัสดุผนัง {mk} (ใน|นอก) + A.4.03', 'wall': w['id'], 'side': sd, 'u': [round(u0, 3), round(u1, 3)], 'tag': tg,
                 'height': round(Hs, 3), 'qty': net, 'unit': 'ตร.ม.', 'room': rm, 'level': '1F'}
            if tg == '1':
                f['counted_by'] = 'wall'; area[w['id']][ka] += net
                f['note'] = f'ฉาบ + ทาสี{"ภายนอก" if ext else "ภายใน"} {net:.2f} ตร.ม. — ปริมาณอยู่ที่ผนัง {w["id"]} (plaster_area / paint_area)'
            else:
                f['note'] = f'{"บุ" if tg != "6" else "ผิว"}เต็มความสูงผนัง +{zb:.2f}…+{w["top"]:.2f} ไม่ฉาบ/ไม่ทาสี (Earth 30 ต.ค. · 5 พ.ย.)'
            if op: f['note'] += f' · หักช่องเปิด {op:.2f}'
            F.append(f); SUM[(tg, ka)] += net; WT.append(f)
    w['finish_sides'] = 2
    a_ = area.get(w['id'])
    w['plaster'] = w['paint'] = bool(a_ and a_['int'] + a_['ext'] > 0.01)
    if w['plaster']:
        w['plaster_area'] = {'int': round(a_['int'], 3), 'ext': round(a_['ext'], 3)}; w['paint_area'] = dict(w['plaster_area'])
    else:
        for kk in ('plaster_area', 'paint_area'): w.pop(kk, None)
assert not bad, bad

# ---------------------------------------------------------------- ผิวเสา คสล. ที่โผล่ (ฉาบโครงสร้าง — Earth 5 พ.ย.)
SEC = {s['id']: s for s in m['sections']}
COL = {}   # เสา C1 เหนือคานคอดิน (ชิ้น C-xx · ช่วงจุดต่อ C-xxj อยู่ใต้ดิน/ในคานไม่ต้องฉาบ)
for x in m['members']:
    if x['type'] != 'column' or not x['id'].startswith('C-') or x['id'].endswith('j'): continue
    a, b = N[x['i']], N[x['j']]
    COL[(round(a['x'], 3), round(a['y'], 3))] = [min(a['z'], b['z']), max(a['z'], b['z']), x['id'], SEC[x['section']]]
def cover(x, y, z0, z1):   # ผนังทุกชนิดที่ทับจุด (x, y) ในช่วงความสูง → [(bottom, top)]
    out = []
    for w in m['walls']:
        (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
        u = (x - ax) * ux + (y - ay) * uy; d = abs(-(x - ax) * uy + (y - ay) * ux)
        if -1e-6 <= u <= L + 1e-6 and d <= w['t'] / 2 + 1e-6 and w['top'] > z0 and w['bottom'] < z1: out.append((w['bottom'], w['top']))
    return out
CS = []; csum = collections.defaultdict(float)
for (cx, cy), c in sorted(COL.items()):
    z0, z1, cid, s = c; hb, hh = s['b'] / 2, s['h'] / 2
    faces = []
    for (nx, ny) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if nx: p0, p1 = (cx + nx * hb, cy - hh), (cx + nx * hb, cy + hh)
        else:  p0, p1 = (cx - hb, cy + ny * hh), (cx + hb, cy + ny * hh)
        n = 20; pts = [(p0[0] + (p1[0] - p0[0]) * (i + 0.5) / n + nx * 0.005, p0[1] + (p1[1] - p0[1]) * (i + 0.5) / n + ny * 0.005) for i in range(n)]
        cov = [cover(px, py, z0, z1) for px, py in pts]
        fz = {round(FZ.get(space(px + nx * 0.06, py + ny * 0.06), z0), 3) for px, py in pts}
        zs = sorted({z0, z1} | {max(z0, min(z1, v)) for cc in cov for bt in cc for v in bt} | {max(z0, min(z1, v)) for v in fz})
        for za, zb in zip(zs, zs[1:]):
            if zb - za < 0.01: continue
            zm = (za + zb) / 2; free = [not any(b_ <= zm <= t_ for b_, t_ in cc) for cc in cov]
            i = 0
            while i < n:
                if not free[i]: i += 1; continue
                j = i
                while j < n and free[j]: j += 1
                q0 = (p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n); q1 = (p0[0] + (p1[0] - p0[0]) * j / n, p0[1] + (p1[1] - p0[1]) * j / n)
                mx, my = (q0[0] + q1[0]) / 2 + nx * 0.06, (q0[1] + q1[1]) / 2 + ny * 0.06; rm = space(mx, my); isin = ROOM(rm)
                if za < FZ.get(rm, z0) - 1e-6: i = j; continue   # ต่ำกว่าผิวพื้นของพื้นที่นั้น = จมในพื้น
                tg = '2' if isin else '1'
                faces.append({'p': [[round(q0[0], 3), round(q0[1], 3)], [round(q1[0], 3), round(q1[1], 3)]], 'n': [nx, ny], 'z': [round(za, 3), round(zb, 3)], 'tag': tg, 'ext': not isin,
                              'spec': SPEC['2'] if isin else None, 'room': rm})
                csum[(tg, 'int' if isin else 'ext')] += math.dist(q0, q1) * (zb - za)
                i = j
    # รวมแถบต่อเนื่องแนวตั้ง (หน้าเดียวกัน ความกว้างเดียวกัน ผิวเดียวกัน)
    faces.sort(key=lambda f: (f['n'], f['p'], f['z'][0])); mg = []
    for f in faces:
        if mg and mg[-1]['n'] == f['n'] and mg[-1]['p'] == f['p'] and mg[-1]['tag'] == f['tag'] and abs(mg[-1]['z'][1] - f['z'][0]) < 1e-6: mg[-1]['z'][1] = f['z'][1]
        else: mg.append(f)
    for f in mg:
        if not f['spec']: f.pop('spec')
    F.append({'id': 'CS-' + cid[2:], 'kind': 'struct', 'spec': 'ฉาบปูนโครงสร้าง (เสา) ทาสีน้ำอะคริลิก', 'member': cid, 'faces': mg, 'status': FD,
              'src': 'A.2.01 ป้ายวัสดุผนัง + หลักเกณฑ์ 2569 (ฉาบโครงสร้างแยกจากฉาบผนัง)', 'level': '1F',
              'note': f'เสา {cid} +{z0:.2f}…+{z1:.2f} ผิวที่โผล่พ้นผนัง {len(mg)} แถบ · ด้านในห้องน้ำบุกระเบื้องตามผนัง (ไม่ฉาบ) · ด้านนอก ฉาบโครงสร้าง + ทาสีภายนอก (Earth 5 พ.ย.)'})
    CS.append(cid)

# ---------------------------------------------------------------- คันทางลาด ผิวทรายล้าง (6) · ระแนง (7) · แผงเหล็กกล่องเฉียง · บล็อกช่องลม (3)
for wid in ('K-R', 'K-P1', 'K-P2'):
    w = WL[wid]; L = math.dist(w['path'][0], w['path'][1])
    for sd in ('L', 'R'):
        F.append({'id': f'WF-{wid}-{sd}', 'kind': 'wall', 'spec': SPEC['6'] + ' คันทางลาด', 'status': AS, 'src': 'A.2.01 ป้าย 6 + A.5.01', 'wall': wid, 'side': sd, 'u': [0, round(L, 3)],
                  'tag': '6', 'height': 0.10, 'qty': round(L * 0.15, 3), 'unit': 'ตร.ม.', 'room': 'ทางลาด',
                  'note': 'คันกว้าง 0.10 สูง 0.10: ข้าง 0.10 + ครึ่งหลังคัน 0.05 ต่อด้าน (รวม 0.30 ตร.ม./ม.) · **ถาม:** หน้านอกกล่องทางลาดใต้คันลงถึงดิน ทำทรายล้างด้วยไหม'})
SL = {'SL-B3': 'เหนือผนังหลังเคาน์เตอร์ฝั่งชาย', 'SL-B4': 'เหนือผนังหลังเคาน์เตอร์ฝั่งหญิง', 'SL-D0': 'เหนือผนังหน้าห้องน้ำคนพิการ', 'SL-D1': 'ข้างช่องหน้าห้องน้ำคนพิการ (กริด 2)', 'SL-D2': 'ข้างช่องหน้าห้องน้ำคนพิการ (กริด 3)'}
for wid, where in SL.items():
    w = WL[wid]; L = math.dist(w['path'][0], w['path'][1]); H = w['top'] - w['bottom']
    w['look'] = {'pattern': 'louver', 'spacing': 0.05, 'bar': [0.025, 0.025]}
    F.append({'id': 'RL-' + wid[3:], 'kind': 'other', 'spec': 'ระแนงเหล็กกล่อง 25x25x1.0 มม. @0.05 ม. ทาสีน้ำมัน (7)', 'status': FD, 'src': 'A.2.01 ป้ายวัสดุผนัง 7', 'wall': wid,
              'qty': round(L * H, 3), 'unit': 'ตร.ม.', 'room': 'ทางเข้า', 'note': f'{where} ยาว {L:.2f} × สูง {H:.2f} (+{w["bottom"]:.2f}…+{w["top"]:.2f})'})
w = WL['W-A2S']; L = math.dist(w['path'][0], w['path'][1]); H = w['top'] - w['bottom']
w['look'] = {'pattern': 'louver', 'spacing': 0.10, 'bar': [0.075, 0.038], 'angle': 45}
F.append({'id': 'RL-A2', 'kind': 'other', 'spec': 'แผงเหล็กกล่อง 75x38x1.6 มม. @0.10 ม. ติดตั้งเฉียง 45° ทาสีน้ำมัน', 'status': FD, 'src': 'A.2.01 + A.3.01', 'wall': 'W-A2S',
          'qty': round(L * H, 3), 'unit': 'ตร.ม.', 'room': 'ทางเข้า', 'note': f'ด้านหน้าขวา กริด A ห่างกริด 4 0.10–1.60 ยาว {L:.2f} × สูง {H:.2f} บนฐานก่ออิฐ W-A2B'})
WL['W-A1']['look'] = {'pattern': 'vent_block', 'cell': 0.20}

# ---------------------------------------------------------------- ประตู / บล็อกแก้ว / บล็อกช่องลม (ลาย 3D ตาม A.7.01)
OT['DR1']['look'] = {'style': 'swing', 'leaf': [0.70, 2.00], 'frame': 0.05, 'handle_z': 1.0}
OT['DR2']['look'] = {'style': 'slide_hung', 'panel': [1.05, 2.00], 'track': 2.05, 'panes': [1.85, 0.15]}
for t in ('GB1', 'GB2'): OT[t]['look'] = {'style': 'glass_block', 'cell': 0.20}
OT['VB1']['look'] = {'style': 'vent_block', 'cell': 0.20}

# ---------------------------------------------------------------- เชิงชาย / ครอบ ใน 3D (แถบตามขอบหลังคา)
R1 = m['roofs'][0]; zs = lambda y: 3.70 - y * 0.40 / 5.80 + 0.125   # ผิวแผ่นหลังคา = ระนาบโครง + 0.125
X0, X1, YA, YC = -1.10, 11.90, -1.10, 6.90
FA = next(f for f in F if f['id'] == 'RF-FA'); CAP = next(f for f in F if f['id'] == 'RF-CAP')
FA['place'] = [{'shape': 'strip', 'w': 0.012, 'h': 0.20, 'color': '#f1efe8',
                'segs': [[[X0, YA - 0.006, round(zs(YA) - 0.10, 3)], [X1, YA - 0.006, round(zs(YA) - 0.10, 3)]], [[X0, YC + 0.006, round(zs(YC) - 0.10, 3)], [X1, YC + 0.006, round(zs(YC) - 0.10, 3)]]]}]
CAP['place'] = [{'shape': 'strip', 'w': 0.12, 'h': 0.06, 'color': '#1d6b48',
                 'segs': [[[X0, YA, round(zs(YA) + 0.01, 3)], [X1, YA, round(zs(YA) + 0.01, 3)]],
                          [[X0, YA, round(zs(YA) + 0.01, 3)], [X0, YC, round(zs(YC) + 0.01, 3)]], [[X1, YA, round(zs(YA) + 0.01, 3)], [X1, YC, round(zs(YC) + 0.01, 3)]]]}]

# ---------------------------------------------------------------- ตาราง
S = lambda t, s: SUM[(t, s)]
row('ผนัง', 'WF-… ฉาบทาสี (1)', f'ฉาบปูนเรียบ + ทาสีน้ำอะคริลิก ภายใน {S("1", "int"):.2f} · ภายนอก {S("1", "ext"):.2f} ตร.ม. (คิดที่ผนัง plaster_area / paint_area)', 'A.2.01', FD, 'ด้านโถงทางเข้า/ทางเดิน = ภายนอก (Earth 5 พ.ย.)')
row('ผนัง', 'WF-… กระเบื้อง (2)', f'กรุกระเบื้องเซรามิคผิวมัน เต็มความสูงผนัง {S("2", "int") + S("2", "ext"):.2f} ตร.ม. ไม่ฉาบ', 'A.2.01, A.4.03')
row('ผนัง', 'WF-B1-R-4 / WF-B6-R-4', f'แผ่นอิฐแดงโชว์ลาย ด้านนอกผนังซุ้มทางเข้า {S("4", "ext"):.2f} ตร.ม. ไม่ฉาบ', 'A.2.01, A.3.01', FD, 'ไม่ฉาบเหมือนกระเบื้อง (Earth 5 พ.ย.)')
cs1 = csum[('1', 'ext')]; cs2 = csum[('2', 'int')]
row('เสา', f'CS-… ({len(COL)} ต้น)', f'ผิวเสา คสล. ที่โผล่พ้นผนัง: ฉาบโครงสร้าง + ทาสีภายนอก {cs1:.2f} ตร.ม. · บุกระเบื้องในห้องน้ำ {cs2:.2f} ตร.ม.', 'A.2.01 + หลักเกณฑ์ 2569', FD, 'ฉาบเสาแยก (Earth 5 พ.ย.)')
row('ผนัง', 'WF-K-…', 'คันทางลาด ผิวทรายล้าง (6) ข้าง 2 ด้าน + หลังคัน 0.30 ตร.ม./ม. รวม ' + f'{sum(f["qty"] for f in F if f["id"].startswith("WF-K-")):.2f} ตร.ม.', 'A.2.01, A.5.01', AS, 'ถาม: หน้านอกกล่องทางลาด')
row('ผนัง', 'RL-B3 / B4 / D0 / D1 / D2', f'ระแนงเหล็กกล่อง 25x25 @0.05 ทาสีน้ำมัน {sum(f["qty"] for f in F if f["id"].startswith("RL-") and f["id"] != "RL-A2"):.2f} ตร.ม. (3D เป็นซี่)', 'A.2.01')
row('ผนัง', 'RL-A2', 'แผงเหล็กกล่อง 75x38 @0.10 เฉียง 45° ทาสีน้ำมัน 4.43 ตร.ม. (3D เป็นซี่เฉียง)', 'A.2.01, A.3.01')
row('ประตู', 'DR1 / DR2 / GB / VB', 'ลาย 3D: DR1 บานเปิด UPVC วงกบ + มือจับก้านโยกสองด้าน · DR2 บานเลื่อนรางแขวน กระจกฝ้า + มือจับ · บล็อกแก้ว / บล็อกช่องลมเป็นตาราง', 'A.7.01')
row('หลังคา', 'RF-FA / RF-CAP', 'แสดงใน 3D: เชิงชาย 8" ปลายจันทันแนว A / C · ครอบหน้า (แนว A) + ข้างสองด้าน', 'A.2.02, A.4.x')

m['meta']['name'] = 'ห้องน้ำ ท12 — Step 4 วัสดุ/ผิว (ส่วนที่ 1–2)'
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 4)', 'sections': ['finishes', 'walls', 'opening_types'],
                     'note': 'Step 4 ส่วนที่ 2: ผิวผนังทีละด้าน ผิวเสา คันทรายล้าง ระแนง ลายประตู/บล็อก เชิงชาย/ครอบ 3D'})
json.dump(m, open('stage4b.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage4b_rows.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'sum': {f'{a}|{b}': round(v, 3) for (a, b), v in SUM.items()}, 'col': {f'{a}|{b}': round(v, 3) for (a, b), v in csum.items()}}, open('qty4b.json', 'w'), ensure_ascii=False, indent=1)
print('wall faces', len(WT), {f'{a}|{b}': round(v, 2) for (a, b), v in SUM.items()}, 'cols', len(CS), {f'{a}|{b}': round(v, 2) for (a, b), v in csum.items()})
