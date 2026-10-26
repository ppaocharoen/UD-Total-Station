# Step 3 เหล็กเสริม — บ้านแนน (ต่อจาก stage2.bm.json)
# อ่าน: S-00 ข้อ 4 (ชนิดเหล็ก/ระยะฝัง-ทาบ) · S-09 ฐานราก F1–F3 · S-10 ตารางเสา/คาน · S-11 พื้น/บันได
# Earth 26 ต.ค.: F2 12-DB16 = เหล็กยาว · 23-DB16 = เหล็กสั้น · ปลอก "2ป" ตามตัวหนังสือ (มาร์ก) · B4 4-DB25 สองชั้น ชั้นละ 2
#                SC ตาม S-11 · GS เหล็กเส้น (มาร์กทางเลือกตะแกรง) · Topping พื้นสำเร็จรูป = ตะแกรงลวด · ระยะหุ้ม/ทาบตามมาตรฐานเว็บ
import json, sys, collections, datetime, math
sys.path.insert(0, '/home/claude/UD-Total-Station/tools')
import takeoff as T
from shapely.geometry import Polygon as SPoly, Point as SPt, LineString

FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage2.bm.json'))
d = m['design'] = {'members': {}, 'supports': {}, 'slabs': {}, 'plates': {}, 'stairs': {}}
rows = []
def row(*a): rows.append(a)
NODE = {n['id']: n for n in m['nodes']}; SECS = {c['id']: c for c in m['sections']}
R3 = lambda v: [round(c, 3) for c in v]
def xb(label, dia, a, b, n=1, step=None):
    it = {'label': label, 'dia': dia, 'a': R3(a), 'b': R3(b)}
    if n > 1: it['n'] = int(n); it['step'] = R3(step)
    return it
def add_x(sec, key, it):
    e = d[sec].setdefault(key, {'rebar': {}, 'status': FD, 'src': ''})
    (e['rebar'] if sec != 'stairs' else e).setdefault('extra_bars', []).append(it)
CV = 0.075   # ระยะหุ้มฐานราก (ตำแหน่งวาด)

# ---------------------------------------------------------------- ฐานราก (S-09)
for s in m['supports']:
    n_ = NODE[s['node']]; cx, cy = n_['x'], n_['y']; b, dd, h, z0 = s['b'], s['d'], s['h'], s['bottom']
    if s['mark'] == 'F1':
        rb = {'bars_x': [5, 16], 'bars_y': [5, 16], 'rings': [4, 9], 'dowel': [8, 20, h]}
        d['supports'][s['id']] = {'rebar': rb, 'status': FD, 'src': 'S-09 F1: ตะแกรง 5-DB16# · 16-DB12 รอบ · ปลอก 4 ชุด RB9 · เดือย C1 8-DB20'}
        # 16-DB12 เหล็กยืนรอบฐาน (5 เส้นต่อด้าน มุมใช้ร่วม)
        x0, x1, y0, y1 = cx - b / 2 + CV, cx + b / 2 - CV, cy - dd / 2 + CV, cy + dd / 2 - CV; za, zb = z0 + CV, z0 + h - CV; st = (x1 - x0) / 4
        for (a, stp) in (((x0, y0), (st, 0)), ((x1, y0), (0, st)), ((x1, y1), (-st, 0)), ((x0, y1), (0, -st))):
            add_x('supports', s['id'], xb('F1 16-DB12 เหล็กยืนรอบฐาน', 12, [a[0], a[1], za], [a[0], a[1], zb], 4, [stp[0], stp[1], 0]))
    elif s['mark'] == 'F2':
        rb = {'bars_x': [12, 16], 'bars_y': [23, 16], 'bend_up': round(h - 2 * CV, 3), 'rings': [1, 9], 'dowel': [8, 20, h]}
        d['supports'][s['id']] = {'rebar': rb, 'status': FD, 'src': 'S-09 F2: เหล็กยาว 12-DB16 · เหล็กสั้น 23-DB16 (ปลายหักขึ้น) · RB9 รัดรอบ · เดือย C1 8-DB20'}
    else:
        rb = {'bars_x': [6, 16], 'bars_y': [6, 16], 'rings': [1, 9], 'dowel': [4, 12, h]}
        d['supports'][s['id']] = {'rebar': rb, 'status': AS, 'src': 'S-09 F3: 6-DB16# · RB9 (ข้อความในแบบอ่านไม่ออก — สมมติรัดรอบ 1 วง) · เดือย CX2 4-DB12'}
row('ฐานราก F1 × 32', 'ตะแกรง 5-DB16# · 16-DB12 รอบฐาน · ปลอก 4 ชุด RB9', 'bars 5-DB16 x/y · 16-DB12 ยืนรอบฐาน (extra_bars) · ปลอก 4 วง RB9 · เดือย 8-DB20 ยาวเท่าความหนาฐาน', 'S-09', FD)
row('ฐานราก F2 × 9', 'เหล็กยาว 12-DB16 · เหล็กสั้น 23-DB16 ปลายหักขึ้น · RB9 รัดรอบ', 'bars_x 12-DB16 (แนว 1.60) · bars_y 23-DB16 (แนว 0.80) · หักขึ้น 0.55 สองด้าน · รัดรอบ 1 วง RB9', 'S-09', FD, 'Earth 26 ต.ค.: 12 = เหล็กยาว · 23 = เหล็กสั้น')
row('ฐานราก F3 × 12', 'ตะแกรง 6-DB16# · RB9 (ข้อความในแบบเป็น "?" อ่านไม่ออก)', 'bars 6-DB16 x/y · รัดรอบ 1 วง RB9 (สมมติ) · เดือย CX2 4-DB12', 'S-09', AS, '**แบบอ่านไม่ออก:** ข้อความ RB9 ใน F3 เป็นอักษรเสีย — สมมติเหล็กรัดรอบ 1 วง')

# ---------------------------------------------------------------- เสา (S-10)
COL = {'C1': ([8, 20], [9, 0.15]), 'CX': ([8, 20], [9, 0.15]), 'CX2': ([4, 12], [6, 0.15])}
for x in m['members']:
    if x['type'] != 'column': continue
    main, st = COL[x['mark']]
    a_, b_ = NODE[x['i']], NODE[x['j']]; top = x['j'] if b_['z'] >= a_['z'] else x['i']
    H = abs(b_['z'] - a_['z']); hb = max([SECS[y['section']]['h'] for y in m['members'] if y['type'] in ('beam', 'tie_beam') and top in (y['i'], y['j'])] or [0])
    sc = SECS[x['section']]; lo = round(min(max(sc['b'], sc['h'], max(H - hb, 0) / 6, 0.45), H / 2), 3)
    rb = {'main': main, 'stirrup': st + [0.075 if x['mark'] == 'CX2' else 0.10, [lo, round(min(lo + hb, H / 2), 3)]]}
    d['members'][x['id']] = {'rebar': rb, 'status': AS if x['id'].startswith('CXP') else FD, 'src': f"S-10 ตารางเสา {x['mark']}"}
row('เสา C1', '0.25×0.25 8-DB20 · ปลอก RB9 @0.15 ทุกช่วง (ตอม่อ–หลังคา)', 'main 8-DB20 · RB9 @0.15 · ช่วง lo หัว-โคน @0.10', 'S-10', FD, 'ปลอกถี่ช่วง lo = max(ด้านเสา, ช่วงว่าง/6, 0.45) ตามเกณฑ์ที่ใช้กับทุ่งสมอ · แบบไม่ระบุระยะถี่ — ใช้ @0.10 (สมมติ)')
row('เสา CX', '0.25×0.25 8-DB20 · ปลอก RB9 @0.15 (ชั้นบนรับหลังคา)', 'main 8-DB20 · RB9 @0.15', 'S-10', FD)
row('เสา CX2', '0.20×0.20 4-DB12 · ปลอก RB6 @0.15 (ตอม่อ + เสาห้องปั๊มที่เพิ่ม)', 'main 4-DB12 · RB6 @0.15', 'S-10', FD, 'เสาห้องปั๊มที่เพิ่มเอง (CXP) ใช้ CX2 — สมมติ')

# ---------------------------------------------------------------- คาน (S-10) — กลางคาน = หัวเสา ทุกตัว
B = {  # mark: (top, bot, stirrup, double, note)
    'B1': ([2, 16], [2, 16], [9, 0.15], False, ''),
    'B2': ([2, 20], [2, 20], [9, 0.15], False, ''),
    'B3': ([3, 25], [2, 20], [9, 0.15], True, 'บน 3-DB25 สองชั้น (2+1)'),
    'B4': ([4, 25], [4, 25], [9, 0.15], True, 'บน-ล่าง 4-DB25 สองชั้น ชั้นละ 2 (Earth 26 ต.ค.)'),
    'B5': ([4, 25], [3, 25], [9, 0.15], True, 'บน 4-DB25 สองชั้น ชั้นละ 2 · ล่าง 3-DB25 สองชั้น (2+1)'),
    "B1'": ([2, 12], [2, 12], [6, 0.15], True, '**มาร์ก:** ตัวหนังสือ "2ป-RB6" แต่รูปตัดวาดปลอกวงเดียว — ใช้ 2 วงตามตัวหนังสือ (Earth 26 ต.ค.)'),
    'BST': ([2, 16], [2, 16], [9, 0.15], True, '**มาร์ก:** ตัวหนังสือ "2ป-RB9" แต่รูปตัดวาดปลอกวงเดียว — ใช้ 2 วงตามตัวหนังสือ (Earth 26 ต.ค.)'),
}
miss = collections.Counter()
for x in m['members']:
    if x['type'] not in ('beam', 'tie_beam'): continue
    if x['mark'] not in B: miss[x['mark']] += 1; continue
    top, bot, st, dbl, note = B[x['mark']]
    rb = {'top': top, 'bot': bot, 'stirrup': st}
    if dbl: rb['double_stirrup'] = True
    e = {'rebar': rb, 'status': FD if x.get('status') != AS else AS, 'src': f'S-10 ขยายคาน {x["mark"]}'}
    if note: e['note'] = note
    d['members'][x['id']] = e
print('คานไม่มีข้อมูลเหล็ก:', dict(miss))
fmt = lambda b: f'{b[0]}-{"RB" if b[1] < 12 else "DB"}{b[1]}'
for mk, (top, bot, st, dbl, note) in B.items():
    row(f'คาน {mk}', f'บน {fmt(top)} · ล่าง {fmt(bot)} · ปลอก {"2" if dbl else "1"}ป-RB{st[0]} @{st[1]:g}', 'กลางคาน = หัวเสา (ไม่มีเหล็กเสริมพิเศษ)', 'S-10', FD, note)
row('คาน B4', 'ช่องไฟ', '4-DB25 วางสองชั้น ชั้นละ 2 → ช่องไฟในชั้นพอ', 'S-10', FD, 'Earth 26 ต.ค.')

# ---------------------------------------------------------------- พื้น (S-11)
def bbox(sl):
    xs = [p[0] for p in sl['polygon']]; ys = [p[1] for p in sl['polygon']]
    return min(xs), max(xs), min(ys), max(ys)
nS = collections.Counter()
for s in m['slabs']:
    mk = s['mark']; x0, x1, y0, y1 = bbox(s)
    if mk == 'PS':
        d['slabs'][s['id']] = {'rebar': {'wire_mesh': 'Ø4 มม. @0.20 ม.'}, 'status': FD, 'src': 'S-11 SP (Topping ตะแกรงลวด Ø4 @0.20#)'}
    elif mk in ('S1', 'SR'):
        d['slabs'][s['id']] = {'rebar': {'mesh': [9, 0.15, 1]}, 'status': FD, 'src': f'S-11 {mk} (ล่าง RB9 @0.15# · บนเหนือคาน S/3)'}
        # เหล็กบนเหนือคานทุกขอบ ยาว S/3 จากขอบ (+ ข้ามครึ่งคาน 0.125) @0.15
        S_ = min(x1 - x0, y1 - y0); Lb = round(S_ / 3 + 0.125, 3); z = s['top'] - 0.025
        for (ax, a, b, c, inward) in (('x', x0, x1, y0, 1), ('x', x0, x1, y1, -1), ('y', y0, y1, x0, 1), ('y', y0, y1, x1, -1)):
            n = int((b - a - 0.05) // 0.15) + 1
            if ax == 'x': A, Bp, stp = [a + 0.025, c - inward * 0.125, z], [a + 0.025, c + inward * (Lb - 0.125), z], [0.15, 0, 0]
            else: A, Bp, stp = [c - inward * 0.125, a + 0.025, z], [c + inward * (Lb - 0.125), a + 0.025, z], [0, 0.15, 0]
            add_x('slabs', s['id'], xb(f'{mk} เหล็กบนเหนือคาน RB9 @0.15 ยาว S/3', 9, A, Bp, n, stp))
    elif mk == 'SC':
        # พื้นยื่น: เหล็กบน DB12 @0.125 ตั้งฉากคานที่ยื่นออก ฝังในคาน ≥ 0.60 · เหล็กกระจาย RB9 @0.125
        longX = (x1 - x0) >= (y1 - y0); z = s['top'] - 0.025
        d['slabs'][s['id']] = {'rebar': {'mesh_xy': {('x' if longX else 'y'): [9, 0.125], 'layers': 1}}, 'status': AS if s['status'] == AS else FD,
                               'src': 'S-11 SC (บน DB12 @0.125 ฝังคาน ≥ 0.60 · กระจาย RB9 @0.125 · หนา 0.175)'}
        if longX:   # ยื่นตาม y — ฝั่งคาน = ขอบ y ที่ใกล้ตัวอาคาร (y มากกว่าสำหรับชายหน้า)
            yb = y1; n = int((x1 - x0 - 0.05) // 0.125) + 1
            add_x('slabs', s['id'], xb('SC เหล็กบน DB12 @0.125 (ฝังคาน 0.60)', 12, [x0 + 0.025, y0 + 0.025, z], [x0 + 0.025, yb + 0.60, z], n, [0.125, 0, 0]))
        else:
            n = int((y1 - y0 - 0.05) // 0.125) + 1
            add_x('slabs', s['id'], xb('SC เหล็กบน DB12 @0.125 (ฝังคาน 0.60)', 12, [x0 - 0.60, y0 + 0.025, z], [x1 - 0.025, y0 + 0.025, z], n, [0, 0.125, 0]))
    elif mk == 'GS':
        d['slabs'][s['id']] = {'rebar': {'mesh': [9, 0.25, 1]}, 'status': FD, 'src': 'S-11 GS (RB9 @0.25# หรือตะแกรงลวด Ø4 @0.20#)'}
    else:
        continue
    nS[mk] += 1
row('พื้นสำเร็จรูป PS (Topping)', 'S-11 SP: Topping ตะแกรงลวด Ø4 @0.20# · RB9 @0.25 คร่อมคาน ยาว 0.50 สองข้าง', f'wire_mesh Ø4 @0.20 ({nS["PS"]} ผืน) + RB9 คร่อมคาน (extra_bars ที่คาน)', 'S-11', FD, 'Earth 26 ต.ค.: ใช้ตะแกรงลวดตามแบบ')
row('พื้น S1 / SR', 'หนา 0.125 · ล่าง RB9 @0.15# · บนเหนือคาน RB9 @0.15 ยาว S/3', f'mesh RB9 @0.15 1 ชั้น ({nS["S1"] + nS["SR"]} ผืน) + เหล็กบนทุกขอบ S/3 + 0.125 (extra_bars)', 'S-11', FD)
row('พื้นยื่น SC', 'หนา 0.175 · บน DB12 @0.125 ฝังคาน ≥ 0.60 · กระจาย RB9 @0.125 · ยื่น ≤ 1.60', f'{nS["SC"]} ผืน: DB12 @0.125 ตั้งฉากขอบคาน (extra_bars) + RB9 @0.125 ตามแนวคาน', 'S-11', FD, 'พื้นใต้กล่องหุ้มเสาใช้ SC ด้วย (Earth 26 ต.ค.)')
row('พื้น GS', 'RB9 @0.25# หรือตะแกรงลวด Ø4 @0.20#', 'mesh RB9 @0.25 1 ชั้น', 'S-11', FD, '**หมายเหตุ:** แบบให้เลือกตะแกรงลวด Ø4 @0.20# ได้ — ใส่เหล็กเส้นไว้ (เหมือนทุ่งสมอ)')

# ---- RB9 @0.25 คร่อมคานใต้พื้นสำเร็จรูป (S-11 SP: "RBØ9 @0.25 ม. หันออกทั้ง 2 ข้าง" ยาว 0.50 แต่ละข้าง)
SLP = [(sl, SPoly(sl['polygon'])) for sl in m['slabs'] if sl['kind'] == 'precast']
def ps_at(x, y, ztop):
    for sl, pg in SLP:
        if pg.buffer(0.01).contains(SPt(x, y)) and abs(sl['top'] - 0.10 - ztop) < 0.03: return sl
nsp = 0
for x in m['members']:
    if x['type'] not in ('beam', 'tie_beam'): continue
    A, Bn = NODE[x['i']], NODE[x['j']]
    if abs(A['z'] - Bn['z']) > 1e-3: continue
    zt = A['z']; L = math.hypot(Bn['x'] - A['x'], Bn['y'] - A['y'])
    if L < 0.3: continue
    ux, uy = (Bn['x'] - A['x']) / L, (Bn['y'] - A['y']) / L; vx, vy = -uy, ux; hb = SECS[x['section']]['b'] / 2 + 0.15
    t = 0.10; run = []
    while t < L - 0.05:
        px, py = A['x'] + ux * t, A['y'] + uy * t
        l = ps_at(px + vx * hb, py + vy * hb, zt); r = ps_at(px - vx * hb, py - vy * hb, zt)
        if l or r: run.append((t, l, r))
        t += 0.25
    if not run: continue
    t0 = run[0][0]; n = len(run); sl = run[0][1] or run[0][2]; z = sl['top'] - 0.03
    lo = 0.50 if run[0][1] else -0.10; hi = 0.50 if run[0][2] else -0.10
    P = lambda t_, o: [A['x'] + ux * t_ + vx * o, A['y'] + uy * t_ + vy * o]
    add_x('members', x['id'], xb('SP RB9 @0.25 คร่อมคาน (0.50 สองข้าง)', 9, P(t0, lo) + [z], P(t0, -hi) + [z], n, [ux * 0.25, uy * 0.25, 0]))
    nsp += n
print('RB9 คร่อมคาน:', nsp)

# ---------------------------------------------------------------- บันได (S-11)
DIRV = {'+X': (1, 0), '-X': (-1, 0), '+Y': (0, 1), '-Y': (0, -1)}
for st in m['stairs']:
    fl = st['flights']
    for k, f in enumerate(fl):
        fid = st['id'] if len(fl) == 1 else f"{st['id']}#{k + 1}"
        d['stairs'][fid] = {'main_bar': [12, 0.15], 'dist_bar': [9, 0.15], 'waist': 0.15}
        dx, dy = DIRV[f['dir']]; lx, ly = -dy, dx
        W, n, g = f['width'], f['risers'], f['going']; rise = (f['top'] - f['bottom']) / n; sx, sy = f['start']; cv = 0.04
        a = [sx + lx * cv + dx * 0.03, sy + ly * cv + dy * 0.03, f['bottom'] + rise - 0.03]
        b = [sx + lx * (W - cv) + dx * 0.03, sy + ly * (W - cv) + dy * 0.03, f['bottom'] + rise - 0.03]
        add_x('stairs', fid, xb('มุมขั้น 1-RB9 ทุกมุม', 9, a, b, n, [dx * g, dy * g, rise]))
        nw = int((W - 2 * cv) // 0.20) + 1
        for j in range(nw):
            o = cv + 0.20 * j
            r0 = [sx + lx * o + dx * 0.03, sy + ly * o + dy * 0.03, f['bottom'] + 0.03]
            r1 = [r0[0], r0[1], f['bottom'] + rise - 0.03]
            t1_ = [sx + lx * o + dx * g, sy + ly * o + dy * g, f['bottom'] + rise - 0.03]
            add_x('stairs', fid, xb('เหล็กพับขั้น RB9 @0.20 (ลูกตั้ง)', 9, r0, r1, n, [dx * g, dy * g, rise]))
            add_x('stairs', fid, xb('เหล็กพับขั้น RB9 @0.20 (ลูกนอน)', 9, r1, t1_, n, [dx * g, dy * g, rise]))
row('บันได ST1 / ST2', 'ท้องเรียบหนา 0.15 · หลัก DB12 @0.15 · กันร้าว RB9 @0.15 · เหล็กพับขั้น RB9 @0.20 · 1-RB9 ทุกมุม · ชานพักต่อเนื่อง', 'main DB12 @0.15 · dist RB9 @0.15 · เหล็กพับขั้น + มุมขั้น (extra_bars)', 'S-11', FD,
    'ขั้นหน้าเฉลียง ST2 ใช้แบบเดียวกับบันไดหลัก (แบบไม่มีขยายแยก — สมมติ)')

m['meta'] = dict(m['meta'], name='บ้านแนน — Step 3 เหล็กเสริม', stage=3)
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 3)', 'sections': ['design'],
                     'note': 'เหล็กเสริมฐานราก เสา คาน พื้น บันได ตาม S-09…S-11'})
json.dump(m, open('stage3.bm.json', 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- สรุปน้ำหนักเหล็ก
tk = T.Takeoff(m, {}); tk.run()
kg = collections.defaultdict(float)
SUP = {x['id'] for x in m['supports']}; MEM = {x['id']: x for x in m['members']}; SL = {s['id'] for s in m['slabs']}
def grp(sid):
    if sid in SUP: return 'ฐานราก'
    if sid in MEM: return 'เสา' if MEM[sid]['type'] == 'column' else 'คาน'
    if sid in SL: return 'พื้น'
    if sid.startswith('ST'): return 'บันได'
    return 'อื่นๆ'
wm = 0
for it in tk.items.values():
    if it['group_code'] == '1.1.9' and 'by_src' in it:
        for sid, q in it['by_src'].items(): kg[(grp(sid), it['name'])] += q
    if it['group_code'] == '1.1.9' and 'wiremesh' in it.get('key', '') or 'ตะแกรงเหล็กสำเร็จรูป' in it.get('name', ''): wm += it.get('qty', 0)
summary = [(k[0], k[1], round(v, 2)) for k, v in sorted(kg.items())]
json.dump({'rows': rows, 'summary': summary}, open('stage3_rows.json', 'w'), ensure_ascii=False, indent=1)
for s in summary: print(s)
