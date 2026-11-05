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
for wid in ('W-D0L', 'W-D0R'):   # Earth 5 พ.ย.: รูปตัด A.4.01 ด้านในห้องคนพิการเป็นป้าย 2 (แปลนเขียน 1|1)
    w = WL[wid]; w['mark'] = '2|1'; w['status'] = US
    w['note'] = w.get('note', '') + ' · ป้ายผนังแก้เป็น 2|1: ด้านในห้องน้ำคนพิการกระเบื้องตามรูปตัด A.4.01 (Earth 5 พ.ย. · แปลน A.2.01 เขียน 1|1 — **มาร์ก**)'
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
def exposed(cx, cy, hb, hh, z0, z1, tagf):   # ผิวที่โผล่ของชิ้นตั้ง (เสา/เสาเอ็น) ทีละหน้า → faces
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
                mx, my = (q0[0] + q1[0]) / 2 + nx * 0.06, (q0[1] + q1[1]) / 2 + ny * 0.06; rm = space(mx, my)
                if za < FZ.get(rm, z0) - 1e-6: i = j; continue   # ต่ำกว่าผิวพื้นของพื้นที่นั้น = จมในพื้น
                tg, ext = tagf(rm)
                faces.append({'p': [[round(q0[0], 3), round(q0[1], 3)], [round(q1[0], 3), round(q1[1], 3)]], 'n': [nx, ny], 'z': [round(za, 3), round(zb, 3)], 'tag': tg, 'ext': ext,
                              'spec': SPEC[tg] if tg != '1' else None, 'room': rm})
                i = j
    faces.sort(key=lambda f: (f['n'], f['p'], f['z'][0])); mg = []   # รวมแถบต่อเนื่องแนวตั้ง (หน้าเดียวกัน ความกว้างเดียวกัน ผิวเดียวกัน)
    for f in faces:
        if mg and mg[-1]['n'] == f['n'] and mg[-1]['p'] == f['p'] and mg[-1]['tag'] == f['tag'] and abs(mg[-1]['z'][1] - f['z'][0]) < 1e-6: mg[-1]['z'][1] = f['z'][1]
        else: mg.append(f)
    for f in mg:
        if not f['spec']: f.pop('spec')
    return mg
fa = lambda fc: math.dist(*fc['p']) * (fc['z'][1] - fc['z'][0])
for (cx, cy), c in sorted(COL.items()):
    z0, z1, cid, s = c
    mg = exposed(cx, cy, s['b'] / 2, s['h'] / 2, z0, z1, lambda rm: ('2', False) if ROOM(rm) else ('1', True))
    for fc in mg: csum[(fc['tag'], 'ext' if fc['ext'] else 'int')] += fa(fc)
    F.append({'id': 'CS-' + cid[2:], 'kind': 'struct', 'spec': 'ฉาบปูนโครงสร้าง (เสา) ทาสีน้ำอะคริลิก', 'member': cid, 'faces': mg, 'status': FD,
              'src': 'A.2.01 ป้ายวัสดุผนัง + หลักเกณฑ์ 2569 (ฉาบโครงสร้างแยกจากฉาบผนัง)', 'level': '1F',
              'note': f'เสา {cid} +{z0:.2f}…+{z1:.2f} ผิวที่โผล่พ้นผนัง {len(mg)} แถบ · ด้านในห้องน้ำบุกระเบื้องเต็มถึงหัวเสา (A.4.03 · Earth 5 พ.ย.) · ด้านนอก ฉาบโครงสร้าง + ทาสีภายนอก'})
    CS.append(cid)

# ---------------------------------------------------------------- เสาเอ็นที่โผล่ทั้งต้น (หน้าห้องส้วม ไม่มีผนังก่อ) — ฉาบ + ทาสี (Earth 5 พ.ย.: ราคาเสาเอ็นต่อเมตรยังไม่รวมฉาบ)
def in_brick(x, y):
    for w in m['walls']:
        if w['kind'] != 'brick_mon': continue
        (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
        u = (x - ax) * ux + (y - ay) * uy; d = abs(-(x - ax) * uy + (y - ay) * ux)
        if -0.06 <= u <= L + 0.06 and d <= w['t'] / 2 + 1e-6: return True
    return False
STF = []; ssum = 0.0
for x in m['members']:
    if x['type'] != 'stiffener': continue
    a, b = N[x['i']], N[x['j']]
    if in_brick(a['x'], a['y']): continue
    s_ = SEC[x['section']]; z0, z1 = min(a['z'], b['z']), max(a['z'], b['z'])
    mg = exposed(a['x'], a['y'], s_['b'] / 2, s_['h'] / 2, z0, z1, lambda rm: ('1', not ROOM(rm)))
    if not mg: continue
    ssum += sum(fa(fc) for fc in mg)
    F.append({'id': 'SS-' + x['id'], 'kind': 'struct', 'spec': 'ฉาบปูนโครงสร้าง (เสาเอ็น) ทาสีน้ำอะคริลิก', 'member': x['id'], 'faces': mg, 'status': US,
              'src': 'A.2.01 + Earth 5 พ.ย.', 'level': '1F', 'room': space(a['x'], a['y'] - 0.1),
              'note': f'เสาเอ็น {x["id"]} ห่างกริด 1 {a["x"]:.2f} ห่าง A {a["y"]:.2f} ไม่มีผนังก่อ (ข้างวงกบประตูห้องส้วม) · ฉาบ + ทาสีภายใน (Earth 5 พ.ย.)'})
    STF.append(x['id'])

# ---------------------------------------------------------------- คานคอดินที่โผล่รอบนอก (ผิวทางเดิน/ทางลาด ถึงท้องผนังหรือผิวพื้นใน) — ฉาบโครงสร้าง + ทาสีภายนอก (Earth 5 พ.ย.)
SLB = [(sl['polygon'], sl['top'], sl) for sl in m['slabs']]
def slab_top(x, y):
    for P, t, sl in SLB:
        if pip(P, x, y):
            r = sl.get('ramp')
            if r: xs = [p[0] for p in P]; return r['low'] + (r['high'] - r['low']) * (x - min(xs)) / (max(xs) - min(xs))
            return t
    return 0.0   # นอกพื้น = ดินเดิม ±0.00
def wall_at(x, y):
    for w in m['walls']:
        if w['kind'] in ('brick_mon', 'block'):
            (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
            u = (x - ax) * ux + (y - ay) * uy; d = abs(-(x - ax) * uy + (y - ay) * ux)
            if -1e-6 <= u <= L + 1e-6 and d <= w['t'] / 2 + 0.02: return w
    return None
TB = [x for x in m['members'] if x['type'] == 'tie_beam']
def beam_at(x, y):
    for b in TB:
        p, q = N[b['i']], N[b['j']]
        if abs(p['x'] - q['x']) < 1e-6 and abs(x - p['x']) < 0.11 and min(p['y'], q['y']) - 0.11 <= y <= max(p['y'], q['y']) + 0.11: return b['id']
        if abs(p['y'] - q['y']) < 1e-6 and abs(y - p['y']) < 0.11 and min(p['x'], q['x']) - 0.11 <= x <= max(p['x'], q['x']) + 0.11: return b['id']
    return None
LINES = [((-0.10, -0.10), (10.90, -0.10), (0, -1), 'แนว A'), ((-0.10, 5.90), (10.90, 5.90), (0, 1), 'แนว C'),
         ((-0.10, -0.10), (-0.10, 5.90), (-1, 0), 'กริด 1'), ((10.90, -0.10), (10.90, 5.90), (1, 0), 'กริด 4')]
TBF = collections.defaultdict(list); tsum = 0.0; ds = 0.05
for (x0, y0), (x1, y1), (nx, ny), nm in LINES:
    L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L; run = None
    for i in range(int(round(L / ds))):
        u0, u1 = i * ds, (i + 1) * ds; px, py = x0 + ux * (u0 + u1) / 2, y0 + uy * (u0 + u1) / 2
        zo = slab_top(px + nx * 0.06, py + ny * 0.06)   # ผิวภายนอก (ทางเดิน/ทางลาด/ดิน)
        ix, iy = px - nx * 0.12, py - ny * 0.12
        w = wall_at(px - nx * 0.05, py - ny * 0.05)
        col = any(abs(px - cx) <= 0.1 + 1e-6 and abs(py - cy) <= 0.1 + 1e-6 for (cx, cy) in COL)
        zt = 0.20 if (w or col) else slab_top(ix, iy)   # ท้องผนัง/โคนเสา +0.20 · ช่วงเปิดโล่ง = ผิวพื้นใน (ขอบพื้นโผล่ด้วย)
        zo = round(zo, 3); zt = round(zt, 3); bid = beam_at(px - nx * 0.1, py - ny * 0.1) or nm
        if zt - zo < 0.005: run = None; continue
        key = (bid, zo, zt)
        if run and run['key'] == key and abs(run['u1'] - u0) < 1e-6: run['u1'] = u1
        else:
            run = {'key': key, 'u0': u0, 'u1': u1}; TBF[bid].append(run)
        run['geo'] = (x0, y0, ux, uy, nx, ny)
for bid, runs in sorted(TBF.items()):
    faces = []
    for r in runs:
        x0, y0, ux, uy, nx, ny = r['geo']; (_, zo, zt) = r['key']
        faces.append({'p': [[round(x0 + ux * r['u0'], 3), round(y0 + uy * r['u0'], 3)], [round(x0 + ux * r['u1'], 3), round(y0 + uy * r['u1'], 3)]], 'n': [nx, ny], 'z': [zo, zt], 'tag': '1', 'ext': True})
    a_ = sum(fa(fc) for fc in faces); tsum += a_
    F.append({'id': 'TS-' + bid, 'kind': 'struct', 'spec': 'ฉาบปูนโครงสร้าง (คานคอดิน) ทาสีน้ำอะคริลิก', 'member': bid, 'faces': faces, 'status': US, 'src': 'รูปตัด A.4.x + Earth 5 พ.ย.', 'level': '1F',
              'note': f'หน้านอกคานคอดิน {bid} ที่โผล่เหนือผิวทางเดิน/ทางลาด/ดิน ถึงท้องผนัง +0.20 (ช่วงไม่มีผนังถึงผิวพื้นใน — รวมขอบพื้น) {a_:.2f} ตร.ม. · ฉาบโครงสร้าง + ทาสีภายนอก (Earth 5 พ.ย.)'})

# ---------------------------------------------------------------- คันทางลาด ผิวทรายล้าง (6) · ระแนง (7) · แผงเหล็กกล่องเฉียง · บล็อกช่องลม (3)
for wid in ('K-R', 'K-P1', 'K-P2'):
    w = WL[wid]; L = math.dist(w['path'][0], w['path'][1])
    for sd in ('L', 'R'):
        F.append({'id': f'WF-{wid}-{sd}', 'kind': 'wall', 'spec': SPEC['6'] + ' คันและกล่องทางลาด', 'status': FD, 'src': 'A.2.01 ป้าย 6 + A.5.01', 'wall': wid, 'side': sd, 'u': [0, round(L, 3)],
                  'tag': '6', 'height': 0.10, 'qty': round(L * 0.15, 3), 'unit': 'ตร.ม.', 'room': 'ทางลาด',
                  'note': 'คันกว้าง 0.10 สูง 0.10: ข้าง 0.10 + ครึ่งหลังคัน 0.05 ต่อด้าน (รวม 0.30 ตร.ม./ม.)'})
# หน้านอกกล่องทางลาดใต้คัน ลงถึงดิน/ทางเดิน — ทรายล้าง (Earth 5 พ.ย.)
RS = []
for x0, x1 in [(round(3.0 + 0.1 * k, 2), round(3.1 + 0.1 * k, 2)) for k in range(24)] + [(5.4, 6.6)]:   # ช่วงลาดแบ่งท่อน 0.10 (ภาพ 3D เรียบ · พื้นที่ = สี่เหลี่ยมคางหมูพอดี)
    zt = (slab_top(x0 + 1e-3, -0.6) + slab_top(x1 - 1e-3, -0.6)) / 2
    RS.append({'p': [[x0, -1.10], [x1, -1.10]], 'n': [0, -1], 'z': [0.0, round(zt, 3)], 'tag': '6', 'ext': True, 'spec': SPEC['6'] + ' คันและกล่องทางลาด'})
RS.append({'p': [[6.60, -1.10], [6.60, -0.10]], 'n': [1, 0], 'z': [0.05, 0.25], 'tag': '6', 'ext': True, 'spec': SPEC['6'] + ' คันและกล่องทางลาด'})
F.append({'id': 'RS-RAMP', 'kind': 'struct', 'spec': SPEC['6'] + ' คันและกล่องทางลาด', 'member': 'S-RAMP', 'faces': RS, 'status': US, 'src': 'A.5.01 + Earth 5 พ.ย.', 'level': '1F', 'room': 'ทางลาด',
          'note': f'หน้านอกกล่องทางลาด (นอกแนว A กริด 2–3) จากดิน ±0.00 ถึงผิวทางลาด/ชานพัก ยาว 3.60 · ปลายชานพัก (ด้านทางเดิน S-WK-S2) จาก +0.05 ถึง +0.25 · รวม {sum(fa(f) for f in RS):.2f} ตร.ม. (Earth 5 พ.ย.)'})
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
row('ผนัง', 'WF-K-… / RS-RAMP', 'ผิวทรายล้าง (6): คันทางลาด (ข้าง 2 ด้าน + หลังคัน) ' + f'{sum(f["qty"] for f in F if f["id"].startswith("WF-K-")):.2f} + หน้านอกกล่องทางลาด {sum(fa(f) for f in RS):.2f} ตร.ม.', 'A.2.01, A.5.01', US, 'หน้านอกกล่องลงถึงดิน (Earth 5 พ.ย.)')
row('เสาเอ็น', f'SS-… ({len(STF)} ต้น)', f'เสาเอ็นหน้าห้องส้วมที่ไม่มีผนังก่อ: ฉาบโครงสร้าง + ทาสีภายใน {ssum:.2f} ตร.ม.', 'A.2.01', US, 'ราคาเสาเอ็นต่อเมตรยังไม่รวมฉาบ (Earth 5 พ.ย.)')
row('คาน', f'TS-… ({len(TBF)} ช่วง)', f'หน้านอกคานคอดินที่โผล่รอบอาคาร: ฉาบโครงสร้าง + ทาสีภายนอก {tsum:.2f} ตร.ม.', 'รูปตัด A.4.x', US, 'Earth 5 พ.ย.')
row('ผนัง', 'W-D0L / W-D0R', 'เสาอิฐข้างช่องหน้าห้องน้ำคนพิการ ป้ายแก้เป็น 2|1: ด้านในห้องกระเบื้อง', 'A.4.01', US, '**มาร์ก:** แปลน A.2.01 เขียน 1|1 · รูปตัด A.4.01 เป็น 2 (Earth 5 พ.ย.)')
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
