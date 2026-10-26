# Step 2 โครงสร้าง — บ้านแนน (ต่อจาก Step 1)
# อ่าน S-04 ฐานราก · S-05/S-06/S-07 แปลนคาน (เส้นชั้น BEAM ใน DXF) · S-09 ฐานราก F1–F3 · S-10 ตารางเสา/คาน · S-11 พื้น · A-18 บันได · S-08 โครงหลังคา
import json, math, sys, re, datetime, collections
sys.path[:0] = ['../st', '.']
from shapely.geometry import Polygon, LineString, Point, box, MultiLineString
from shapely.ops import polygonize, unary_union
import ext, beams as BM

FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage1.bm.json'))
rows = []
def row(cat, id_, desc, src, st, note=''): rows.append((cat, id_, desc, src, st, note))
def snap(v, grid=(), tol=0.012):
    for g in grid:
        if abs(v - g) < tol: return g
    return round(v, 3)
GXV = sorted(set(ext.GX.values()) | {-1.20, 1.80, 8.20}); GYV = sorted(set(ext.GY.values()) | {13.0, 4.80, 15.725})
SX = lambda v: snap(v, GXV); SY = lambda v: snap(v, GYV)

# ---------------------------------------------------------------- ระดับ
Z1, Z2, ZR = 0.45, 4.60, 8.65          # หลังคานชั้นล่าง (ใต้พื้น PS +0.55) · ชั้นบน/หลังคา SLAB · คานหลังคา (อะเส)
row('ระดับ', 'หลังคาน', f'ชั้นล่าง +{Z1:.2f} (พื้นสำเร็จรูป PS 0.05 + Topping 0.05 → +0.55) · ชั้นบน +{Z2:.2f} (PS → +4.70 · SR/ห้องน้ำหลังคานพอดี) · หลังคา +{ZR:.2f}', 'S-05/S-06/S-07 + S-11 + A-11 (แถบคาน 0.70 / 0.60)', FD,
    'ใต้คานชั้นบน +4.00 และใต้คานหลังคา +8.05 ตรงกับแถบคานในรูปตัด A-11')

# ---------------------------------------------------------------- หน้าตัด
SEC = {'B1': (0.25, 0.60), 'B2': (0.25, 0.60), 'B3': (0.25, 0.60), 'B4': (0.25, 0.60), 'B5': (0.25, 0.60), "B1'": (0.20, 0.40), 'BST': (0.25, 0.40)}
sections = {s['id']: s for s in m['sections']}
def rsec(b, h):
    sid = f'RC-{round(b*100)}x{round(h*100)}'
    if sid not in sections:
        sections[sid] = {'id': sid, 'kind': 'rc_rect', 'b': b, 'h': h, 'status': FD, 'src': 'S-10 ตารางเสา/คาน'}
    return sid
for b, h in [(0.25, 0.25), (0.20, 0.20)] + list(SEC.values()): rsec(b, h)

nodes, members, supports = [], [], []
NI = {}
NCNT = [0]
def node(x, y, z, lv=None):
    k = (round(x, 3), round(y, 3), round(z, 3))
    if k in NI: return NI[k]
    NCNT[0] += 1; nid = f'N{NCNT[0]:04d}'; NI[k] = nid
    n = {'id': nid, 'x': k[0], 'y': k[1], 'z': k[2]}
    if lv: n['level'] = lv
    nodes.append(n); return nid
NODE = lambda nid: next(n for n in nodes if n['id'] == nid)

# ---------------------------------------------------------------- ฐานราก (S-04 + S-09)
f4 = ext.P('S-04'); foots = []
T4 = [(q['text'].strip(), f4(q['at'])) for q, _ in ext.prims('S-04', kinds={'text'}) if re.match(r'^F\d', q['text'].strip())]
for q, _ in ext.prims('S-04', layers={'15'}, kinds={'poly'}):
    p = [f4(a) for a in q['p']]; xs = [a[0] for a in p]; ys = [a[1] for a in p]
    w, h = round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3); cx, cy = SX((max(xs) + min(xs)) / 2), SY((max(ys) + min(ys)) / 2)
    if w < 0.5: continue
    t = min(T4, key=lambda t: (t[1][0] - cx) ** 2 + (t[1][1] - cy) ** 2)[0]
    foots.append((t.split(',')[0], t.split(',')[1], cx, cy, w, h))
PILE = {'type': 'สี่เหลี่ยมตัน 0.26x0.26', 'size': 0.26, 'length': 12.0, 'note': 'ความยาวสมมติ — แบบไม่ได้กำหนดความยาวเข็ม (ให้ตอกเข็มสุ่มก่อน)', 'capacity': 35000, 'kind': 'driven'}
FT = {'F1': dict(b=0.60, d=0.60, h=0.60, bottom=-2.10, n=1, at=[[0, 0]]),
      'F2': dict(b=1.60, d=0.80, h=0.70, bottom=-2.20, n=2, at=[[-0.40, 0], [0.40, 0]]),
      'F3': dict(b=1.20, d=1.20, h=0.25, bottom=-1.75, n=0, at=[])}
FOOT_TOP = {}
C1pre = sorted({(SX(ext.P('S-05')(q['at'])[0] + 0.125 * (q.get('sx') or 1)), SY(ext.P('S-05')(q['at'])[1] + 0.125)) for q, _ in ext.prims('S-05', layers={'C'}, kinds={'insert'})})
for k, (mk, cm, cx, cy, w, h) in enumerate(sorted(foots, key=lambda f: (f[3], f[2])), 1):
    ft = FT[mk]; fx0, fy0 = cx, cy
    if cm != 'CX2':
        cc = min(C1pre, key=lambda q: (q[0] - cx) ** 2 + (q[1] - cy) ** 2)
        if math.dist(cc, (cx, cy)) < 0.3: cx, cy = cc
    nid = node(cx, cy, round(ft['bottom'] + ft['h'], 3), 'FDN')
    s = {'id': f'{mk}-{k:02d}', 'mark': mk, 'node': nid, 'kind': 'pile_cap' if ft['n'] else 'spread', 'b': ft['b'], 'd': ft['d'], 'h': ft['h'], 'bottom': ft['bottom'],
         'sand': 0.10, 'lean': 0.05, 'material': 'C', 'fixity': 'fixed', 'status': FD, 'src': f'S-04 ({mk},{cm}) + S-09'}
    if ft['n']:
        s['piles'] = dict(PILE, n=ft['n'], at=ft['at'], top=round(ft['bottom'] + 0.05, 3))
    if (fx0, fy0) != (cx, cy):
        s['note'] = f'ศูนย์ฐานในแปลน S-04 ({fx0:.3f}, {fy0:.3f}) ไม่ตรงสัญลักษณ์เสา — วางฐานใต้เสา' + (' (**แบบขัดแย้ง** ถาม)' if math.dist((fx0, fy0), (cx, cy)) > 0.1 else '')
    if mk == 'F3':
        s['note'] = (s.get('note', '') + ' · ' if s.get('note') else '') + 'แปลน S-04 เขียนฐาน 1.00×1.00 แต่แบบขยาย S-09 เขียน 1.20×1.20 — ใช้แบบขยาย'
    supports.append(s); FOOT_TOP[(cx, cy)] = (s, round(ft['bottom'] + ft['h'], 3), cm)
cnt = collections.Counter(f[0] for f in foots)
row('ฐานราก', f'F1 × {cnt["F1"]}', 'ฐานเข็ม 1 ต้น 0.60×0.60×0.60 · เข็มสี่เหลี่ยมตัน 0.26×0.26 รับน้ำหนักปลอดภัย ≥ 35 ตัน/ต้น', 'S-04, S-09', FD,
    'หลังฐาน −1.50 ทุกฐาน (Earth 26 ต.ค.) → ท้องฐาน F1 −2.10 · **เข็มยาว 12.0 ม. สมมติ — แบบไม่ได้กำหนดความยาว** (ให้ตอกเข็มสุ่มก่อน)')
row('ฐานราก', f'F2 × {cnt["F2"]}', 'ฐานเข็ม 2 ต้น 1.60×0.80×0.70 เข็มห่าง 0.80 วางตามแนว X', 'S-04, S-09', FD, 'หลังฐาน −1.50 ท้องฐาน −2.20 · **เข็มยาว 12.0 ม. สมมติ — แบบไม่ได้กำหนดความยาว**')
row('ฐานราก', f'F3 × {cnt["F3"]}', 'ฐานแผ่ ไม่มีเข็ม 1.20×1.20×0.25 หลังฐาน −1.50 (ใต้ดิน 1.50) · ตอม่อ CX2 0.20×0.20', 'S-04, S-09', FD,
    '**แบบขัดแย้ง:** แปลน S-04 วาดฐาน F3 ขนาด 1.00×1.00 แต่แบบขยาย S-09 เขียน 1.20×1.20 — ใช้แบบขยาย (Earth ยืนยัน 26 ต.ค.)')

# ---------------------------------------------------------------- เสา
def cols(num):
    f = ext.P(num)
    return sorted({(SX(f(q['at'])[0] + 0.125 * (q.get('sx') or 1)), SY(f(q['at'])[1] + 0.125)) for q, _ in ext.prims(num, layers={'C'}, kinds={'insert'})})   # sx −1 = บล็อกกลับด้าน
C1 = cols('S-05'); C2 = cols('S-06'); CR = cols('S-07')
near = lambda p, L, tol=0.05: next((q for q in L if abs(q[0] - p[0]) < tol and abs(q[1] - p[1]) < tol), None)
FTPOS = list(FOOT_TOP)
def column(id_, mark, x, y, z0, z1, sec, src, note='', lv0=None, lv1=None):
    i = node(x, y, z0, lv0); j = node(x, y, z1, lv1)
    c = {'id': id_, 'mark': mark, 'type': 'column', 'i': i, 'j': j, 'section': sec, 'material': 'C', 'status': FD, 'src': src}
    if note: c['note'] = note
    members.append(c); return c
# ระดับหลังคานรอบตอม่อ CX2 (คาน B1' รับพื้นภายนอก)
def cx2_top(x, y):
    if x > 17 and 18.5 < y < 21: return 0.35   # ห้องปั๊ม
    return 0.25
ecc = []
for (fx, fy), (s, ztop, cm) in sorted(FOOT_TOP.items(), key=lambda t: (t[0][1], t[0][0])):
    if cm == 'CX2':
        column(f'P-{s["id"]}', 'CX2', fx, fy, ztop, cx2_top(fx, fy), rsec(0.20, 0.20), 'S-04 + S-10 (CX2 0.20×0.20 4-DB12)', lv0='FDN', lv1='1F')
        continue
    c = near((fx, fy), C1, 0.3)
    if c is None: print('!! ฐานไม่มีเสา', s['id'], fx, fy); continue
    if abs(c[0] - fx) > 0.01 or abs(c[1] - fy) > 0.01: ecc.append((s['id'], c, (fx, fy)))
    g = f'{c[0]:.2f}_{c[1]:.2f}'
    column(f'P-{s["id"]}', 'C1', c[0], c[1], ztop, Z1, rsec(0.25, 0.25), 'S-04 + S-10 (C1 ตอม่อ 0.25×0.25 8-DB20)', lv0='FDN', lv1='1F',
           note=(f'ศูนย์เสาเยื้องจากศูนย์ฐาน {c[0] - fx:+.3f}, {c[1] - fy:+.3f} (S-04)' if (c[0], c[1]) != (fx, fy) else ''))
    column(f'C1-{s["id"]}', 'C1', c[0], c[1], Z1, Z2, rsec(0.25, 0.25), 'S-05 + S-10 (C1 ชั้น 1–2)', lv0='1F', lv1='2F')
for c in C2:
    if near(c, C1):
        column(f'C2-{c[0]:.2f}_{c[1]:.2f}', 'C1', c[0], c[1], Z2, ZR, rsec(0.25, 0.25), 'S-06/S-07 + S-10 (C1 รับหลังคา)', lv0='2F', lv1='ROOF')
    else:
        column(f'CX-{c[0]:.2f}_{c[1]:.2f}', 'CX', c[0], c[1], Z2, ZR, rsec(0.25, 0.25), 'S-06/S-07 + S-10 (CX รับหลังคา 0.25×0.25 8-DB20)', lv0='2F', lv1='ROOF',
               note='เสาตั้งบนคานชั้นบน (ไม่มีเสาชั้นล่างรองรับ)')
nC1 = sum(1 for x in members if x['mark'] == 'C1' and x['id'].startswith('P-')); nCX = sum(1 for x in members if x['mark'] == 'CX'); nCX2 = sum(1 for x in members if x['mark'] == 'CX2')
row('เสา', f'C1 × {nC1}', 'ตอม่อ + ชั้นล่าง 0.25×0.25 จากหลังฐาน → +0.45 → +4.60 · ต้นที่ขึ้นชั้นบนต่อถึง +8.65', 'S-04, S-05, S-10', FD)
row('เสา', f'CX × {nCX}', 'เสาชั้นบน 0.25×0.25 ตั้งบนคานชั้นบน +4.60 → +8.65 (แนว A1, A2, E1/5A, G/5A, I/5A ฯลฯ)', 'S-06, S-07, S-10', FD)
row('เสา', f'CX2 × {nCX2}', 'ตอม่อ 0.20×0.20 บนฐาน F3 → หลังคาน B1\' (+0.25 ทางเดินข้างบ้าน/ลานหลังบ้าน · +0.35 ห้องปั๊ม)', 'S-04, S-10', FD, 'ระดับหลังคาน B1\' = ระดับพื้นภายนอก (สมมติ)')
for s_ in []:
        row('ฐานราก', f'{s_["id"]} (เสาเฉลียง F/9)', s_['note'].split(' · ')[0], 'S-04, A-04', AS,
            '**แบบขัดแย้ง:** สัญลักษณ์เสาอยู่ x 10.554 (A-04 สถาปัตย์ก็ 10.545) แต่ฐาน F1 วาดศูนย์ที่ 10.304 — วางฐานใต้เสา (ถาม)')

# ---------------------------------------------------------------- คาน
def beam_segments(num, z):
    R = BM.labeled(num); out = []
    for ax, c, w, a, b, lab in R:
        c = SY(c) if ax == 'H' else SX(c)
        if b - a <= 0.27 or w < 0.1: continue   # ชิ้นในเสา / เส้นเดี่ยว
        out.append([ax, c, w, a, b, lab])
    # รูปซ้ำ (เส้นขอบซ้อนคานที่มีป้าย) → ตัดชิ้นไม่มีป้ายที่ทับชิ้นมีป้าย
    keep = []
    for s_ in out:
        if s_[5] == '?' and any(o is not s_ and o[0] == s_[0] and abs(o[1] - s_[1]) < 0.02 and o[5] != '?' and min(o[4], s_[4]) - max(o[3], s_[3]) > 0.5 * (s_[4] - s_[3]) for o in out):
            continue
        keep.append(s_)
    return keep
def build_level(num, z, lv, colset, extra=(), override=None):
    segs = beam_segments(num, z) + [list(e) for e in extra]
    override = override or {}
    # ป้ายหลายตัวในคานยาว → แบ่งตามตำแหน่งป้าย
    T = BM.labels(num)
    pts_cut = collections.defaultdict(set)
    for ax, c, w, a, b, lab in segs:
        for ax2, c2, w2, a2, b2, _ in segs:
            if ax2 == ax: continue
            if a - 0.15 <= c2 <= b + 0.15 and a2 - 0.15 <= c <= b2 + 0.15:
                pts_cut[(ax, c)].add(round(c2, 3))
        for (x, y) in colset:
            u, v = (x, y) if ax == 'H' else (y, x)
            if abs(v - c) < 0.15 and a - 0.15 <= u <= b + 0.15: pts_cut[(ax, c)].add(round(u, 3))
    made = []
    for ax, c, w, a, b, lab in segs:
        cuts = sorted(u for u in pts_cut[(ax, c)] if a - 0.15 <= u <= b + 0.15)
        ends = [a] + [u for u in cuts if a + 0.05 < u < b - 0.05] + [b]
        # ปลายคาน: ถ้าใกล้จุดตัด/เสา ให้วิ่งถึงศูนย์
        e0 = min(cuts, key=lambda u: abs(u - a)) if cuts and min(abs(u - a) for u in cuts) < 0.2 else a
        e1 = min(cuts, key=lambda u: abs(u - b)) if cuts and min(abs(u - b) for u in cuts) < 0.2 else b
        ends[0], ends[-1] = e0, e1
        labs = lab.split('/') if lab != '?' else []
        mylabs = [(t, (p[0] if ax == 'H' else p[1])) for t, p, _ in T if t in labs and abs((p[1] if ax == 'H' else p[0]) - c) < 0.6]
        for u0, u1 in zip(ends, ends[1:]):
            if u1 - u0 < 0.05: continue
            mid = (u0 + u1) / 2
            key = (ax, c, round(u0, 2), round(u1, 2))
            if key in override: mk = override[key]
            elif len(labs) == 1: mk = labs[0]
            elif mylabs: mk = min(mylabs, key=lambda t: abs(t[1] - mid))[0]
            else: mk = '?'
            made.append((ax, c, w, u0, u1, mk))
    return made
def emit(made, num, z, lv, prefix, defaults):
    k = collections.Counter(); out = []
    for ax, c, w, u0, u1, mk in made:
        st, note = FD, ''
        if mk == '?':
            mk = defaults(ax, c, u0, u1, w)
            if mk is None: continue
            if mk == "B1'": note = "แบบไม่มีป้าย — คานกว้าง 0.20 มีแบบเดียวคือ B1'"
            else: note, st = 'แบบไม่มีป้ายชื่อคาน — สมมติตามคานข้างเคียง', AS
        if mk == 'B1/BST': mk = 'B1'
        b, h = SEC.get(mk, (w, 0.60))
        p0 = (u0, c) if ax == 'H' else (c, u0); p1 = (u1, c) if ax == 'H' else (c, u1)
        zz = z
        if lv == '1F' and mk == "B1'":   # คานรับพื้นภายนอก: หลังคาน = ระดับพื้น
            zz = 0.35 if min(p0[0], p1[0]) > 17.5 and 18.9 < (p0[1] + p1[1]) / 2 < 20.7 else 0.25
        if lv == '1F' and ax == 'V' and abs(c) < 0.05 and 15.70 <= u0 and u1 <= 17.45:   # แนว A ช่วงห้องน้ำ 3 (พื้น +0.25) — Earth 26 ต.ค. ให้ลดระดับคาน
            zz = 0.25; note = (note + ' · ' if note else '') + 'ลดระดับหลังคานเป็น +0.25 เท่าพื้นห้องน้ำ 3 (Earth 26 ต.ค.) — แบบโครงสร้างไม่ได้ระบุ'; st = AS
        k[mk] += 1
        x = {'id': f'{prefix}{mk.replace(chr(39), "p")}-{k[mk]:02d}', 'mark': mk, 'type': 'tie_beam' if lv == '1F' else 'beam',
             'i': node(*p0, zz, lv), 'j': node(*p1, zz, lv), 'section': rsec(b, h), 'material': 'C', 'status': st,
             'src': f'{num} + S-10 ({mk} {b:.2f}×{h:.2f})', 'level': lv}
        if abs(w - b) > 0.01: note = (note + ' · ' if note else '') + f'ความกว้างในแปลน {w:.2f}'
        if note: x['note'] = note
        members.append(x); out.append(x)
    return out
def dflt1(ax, c, u0, u1, w):
    if w < 0.22: return "B1'"
    if ax == 'H' and abs(c - 11.4) < 0.05 and u0 > 17.5: return 'B1'   # ใต้ส่วนยื่นห้องน้ำ 1 (ป้าย B1 แนวเดียวกันอีกช่วง)
    return 'B2'
b1 = emit(build_level('S-05', Z1, '1F', C1), 'S-05', Z1, '1F', '1B', dflt1)
b2 = emit(build_level('S-06', Z2, '2F', C1 + C2), 'S-06', Z2, '2F', '2B', lambda *a: 'B1')
b3 = emit(build_level('S-07', ZR, 'ROOF', CR), 'S-07', ZR, 'ROOF', 'RB', lambda *a: 'B1')
# ปลายคานที่ห่างจุดต่อไม่เกิน 0.15 ตามแนวคาน → ย้ายไปจุดต่อนั้น (เส้นคานในแปลนหยุดที่หน้าคาน/หน้าเสา)
def snap_ends():
    NN = {n['id']: n for n in nodes}
    pts = collections.defaultdict(list)
    for x in members:
        for e in ('i', 'j'): n = NN[x[e]]; pts[round(n['z'], 3)].append(n)
    for x in members:
        if 'beam' not in x['type']: continue
        for e in ('i', 'j'):
            n = NN[x[e]]; o = NN[x['j' if e == 'i' else 'i']]
            hor = abs(n['y'] - o['y']) < 1e-6
            cnt_ = sum(1 for y in members for f in ('i', 'j') if y[f] == x[e])
            if cnt_ > 1: continue
            best = None
            for q in pts[round(n['z'], 3)]:
                if q['id'] == n['id']: continue
                along = abs(q['x'] - n['x']) if hor else abs(q['y'] - n['y']); perp = abs(q['y'] - n['y']) if hor else abs(q['x'] - n['x'])
                if perp < 0.02 and 0.001 < along < 0.15 and (best is None or along < best[0]): best = (along, q)
            if best: x[e] = best[1]['id']
# คาน B1' (ภายนอก) เขียนชิดขอบผนัง เยื้องกริด ≤0.035 → ย้ายเข้ากริด แล้วรวมจุดต่อซ้ำ
def snap_grid():
    G = [list(ext.GX.values()) + [-1.20, 1.80, 6.25, 8.20, 19.425], list(ext.GY.values()) + [4.80, 13.00, 19.125]]
    remap = {}
    for n in nodes:
        if not (0.2 < n['z'] < 0.4): continue
        for k, ax in ((0, 'x'), (1, 'y')):
            g = min(G[k], key=lambda v: abs(v - n[ax]))
            if 0.001 < abs(g - n[ax]) <= 0.035: n[ax] = round(g, 3)
    seen = {}
    for n in nodes:
        k = (n['x'], n['y'], n['z'])
        if k in seen: remap[n['id']] = seen[k]
        else: seen[k] = n['id']
    for x in members:
        for e in ('i', 'j'): x[e] = remap.get(x[e], x[e])
    for s_ in supports: s_['node'] = remap.get(s_['node'], s_['node'])
    nodes[:] = [n for n in nodes if n['id'] not in remap]
    NI.clear(); NI.update({(n['x'], n['y'], n['z']): n['id'] for n in nodes})
snap_grid()
# ปลายคานลอยที่หยุดหน้าเสา (≤0.15 ตามแนวคาน) → ต่อเข้าแกนเสาที่ระดับเดียวกับคาน
def snap_to_cols():
    NN = {n['id']: n for n in nodes}
    used = collections.Counter(x[e] for x in members for e in ('i', 'j'))
    cols_ = [(NN[x['i']], NN[x['j']]) for x in members if x['type'] == 'column']
    for x in members:
        if 'beam' not in x['type']: continue
        for e in ('i', 'j'):
            n = NN[x[e]]
            if used[x[e]] > 1 or any(abs(a['x'] - n['x']) < 1e-3 and abs(a['y'] - n['y']) < 1e-3 and a['z'] - 1e-3 <= n['z'] <= b['z'] + 1e-3 for a, b in cols_): continue
            o = NN[x['j' if e == 'i' else 'i']]; hor = abs(n['y'] - o['y']) < 1e-6
            for a, b in cols_:
                if not (a['z'] < n['z'] < b['z'] + 1e-3): continue
                along = abs(a['x'] - n['x']) if hor else abs(a['y'] - n['y']); perp = abs(a['y'] - n['y']) if hor else abs(a['x'] - n['x'])
                if perp < 0.02 and along <= 0.15:
                    x[e] = node(a['x'], a['y'], n['z']); NN = {q['id']: q for q in nodes}; break
# ห้องปั๊มน้ำ: ต่อเสา CX2 มุมนอกขึ้นถึง +4.60 + คานรอบรับหลังคา SLAB (Earth 26 ต.ค.: เสาน่าจะมี ไม่มีคาน ให้เพิ่มคาน)
def split_beam_at(px, py, z):
    NN = {n_['id']: n_ for n_ in nodes}
    for x_ in list(members):
        if 'beam' not in x_['type']: continue
        a_, b_ = NN[x_['i']], NN[x_['j']]
        if abs(a_['z'] - z) > 1e-3 or abs(b_['z'] - z) > 1e-3: continue
        L_ = math.dist((a_['x'], a_['y']), (b_['x'], b_['y'])); t_ = ((px - a_['x']) * (b_['x'] - a_['x']) + (py - a_['y']) * (b_['y'] - a_['y'])) / L_ ** 2
        q_ = (a_['x'] + t_ * (b_['x'] - a_['x']), a_['y'] + t_ * (b_['y'] - a_['y']))
        if 0.02 < t_ < 0.98 and math.dist(q_, (px, py)) < 0.05:
            mid_ = node(round(q_[0], 3), round(q_[1], 3), z); j0 = x_['j']; x_['j'] = mid_
            members.append(dict(x_, id=x_['id'] + 'b', i=mid_, j=j0)); return mid_
    return node(px, py, z)
PMP = [(19.425, 19.125), (19.425, 20.5)]
for x_, y_ in PMP:
    column(f'CXP-{x_:.2f}_{y_:.2f}', 'CX2', x_, y_, 0.35, Z2, rsec(0.20, 0.20), 'A-04 (ห้องปั๊ม) — ต่อจากตอม่อ CX2', note='**สมมติ:** เสา 0.20×0.20 ต่อจากตอม่อ CX2 ขึ้นรับหลังคา SLAB ห้องปั๊ม (แบบไม่แสดงเสา — Earth 26 ต.ค.)', lv0='1F', lv1='2F')
    members[-1]['status'] = AS
ia = split_beam_at(17.6, 19.125, Z2); ib = split_beam_at(17.6, 20.5, Z2)
for k_, (p_, q_) in enumerate(((ia, node(19.425, 19.125, Z2)), (node(19.425, 19.125, Z2), node(19.425, 20.5, Z2)), (node(19.425, 20.5, Z2), ib)), 1):
    members.append({'id': f'2BPMP-{k_:02d}', 'mark': "B1'", 'type': 'beam', 'i': p_, 'j': q_, 'section': rsec(0.20, 0.40), 'material': 'C', 'status': AS, 'level': '2F',
                    'src': 'A-05 (หลังคา SLAB ห้องปั๊ม)', 'note': "**เพิ่มเอง:** คานรับหลังคา SLAB ห้องปั๊ม — แบบไม่มี (Earth 26 ต.ค. ให้เพิ่ม) หน้าตัดสมมติเท่า B1' 0.20×0.40"})
row('คาน', 'ห้องปั๊มน้ำ', "เพิ่มเสา 0.20×0.20 ต่อจากตอม่อ CX2 มุมนอก 2 ต้น (+0.35 → +4.60) + คาน 0.20×0.40 รอบหลังคา SLAB 3 ช่วง", 'A-04, A-05', AS,
    "**เพิ่มเอง** ตาม Earth 26 ต.ค. — แบบโครงสร้างไม่มี · หน้าตัดสมมติเท่า B1'")
snap_ends()
snap_to_cols()
# คานแนวเดียวกันที่ถูกตัดที่จุดไม่มีอะไรมาต่อ (เดิมเป็นจุดที่คาน B1' มาชน ก่อนย้าย B1' ลง +0.25) → ต่อกลับเป็นท่อนเดียว
def rejoin():
    while True:
        NN = {n['id']: n for n in nodes}; deg = collections.defaultdict(list)
        for x in members:
            for e in ('i', 'j'): deg[x[e]].append(x)
        hit = None
        for nid, xs in deg.items():
            if len(xs) != 2 or any('beam' not in x['type'] for x in xs) or any(sp['node'] == nid for sp in supports): continue
            p_, q_ = xs
            if p_['section'] != q_['section'] or p_.get('mark') != q_.get('mark'): continue
            o1 = NN[p_['j'] if p_['i'] == nid else p_['i']]; o2 = NN[q_['j'] if q_['i'] == nid else q_['i']]; n = NN[nid]
            v1 = (n['x'] - o1['x'], n['y'] - o1['y'], n['z'] - o1['z']); v2 = (o2['x'] - n['x'], o2['y'] - n['y'], o2['z'] - n['z'])
            cr = (v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0])
            if max(map(abs, cr)) < 1e-6 and v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2] > 0: hit = (nid, p_, q_, o1, o2); break
        if not hit: break
        nid, p_, q_, o1, o2 = hit
        p_['i'], p_['j'] = o1['id'], o2['id']; members.remove(q_); rejoined.append(f"{p_['id']}+{q_['id']}")
rejoined = []
rejoin()
# แยกเสาที่จุดคานมาชนกลางต้น (คาน B1' หลังคาน +0.25 ต่อเข้าเสาที่หลังคาน +0.45)
def split_cols():
    NN = {n['id']: n for n in nodes}
    ends = collections.defaultdict(set)
    for x in members:
        if 'beam' in x['type']:
            for e in ('i', 'j'): n = NN[x[e]]; ends[(round(n['x'], 3), round(n['y'], 3))].add(round(n['z'], 3))
    for x in list(members):
        if x['type'] != 'column': continue
        a_, b_ = NN[x['i']], NN[x['j']]; zs = sorted(z for z in ends.get((round(a_['x'], 3), round(a_['y'], 3)), ()) if a_['z'] + 0.05 < z < b_['z'] - 0.05)
        if not zs: continue
        prev = x['i']; parts = []
        for z in zs:
            mid = node(a_['x'], a_['y'], z); parts.append((prev, mid)); prev = mid
        parts.append((prev, x['j']))
        x['j'] = parts[0][1]
        for k, (i, j) in enumerate(parts[1:], 2):
            y = dict(x, id=f"{x['id']}-{k}", i=i, j=j); members.append(y)
split_cols()
for lv, bb in (('ชั้นล่าง (S-05)', b1), ('ชั้นบน/หลังคา SLAB (S-06)', b2), ('หลังคา/อะเส (S-07)', b3)):
    c = collections.Counter(x['mark'] for x in bb); un = sum(1 for x in bb if x['status'] == AS)
    row('คาน', lv, ' · '.join(f'{k} {v}' for k, v in sorted(c.items())) + f' (รวม {len(bb)} ช่วง)', lv.split('(')[1][:-1] + ', S-10', FD,
        f'ช่วงที่ไม่มีป้าย {un} ช่วง ใส่ตามคานข้างเคียง (สมมติ)' if un else '')
row('คาน', 'หน้าตัด', 'B1–B5 0.25×0.60 · B1\' 0.20×0.40 · BST 0.25×0.40 (S-10)', 'S-10', FD)

json.dump({'nodes': nodes, 'members': members, 'supports': supports, 'sections': list(sections.values())}, open('stage2_struct.json', 'w'), ensure_ascii=False, indent=0)
print(len(supports), 'supports', sum(1 for x in members if x['type'] == 'column'), 'columns', sum(1 for x in members if 'beam' in x['type']), 'beams')
for x in members:
    if x['status'] == AS: print('?', x['id'], NODE(x['i'])['x'], NODE(x['i'])['y'], NODE(x['j'])['x'], NODE(x['j'])['y'])

# ---------------------------------------------------------------- พื้น (S-05/S-06/S-07 + S-11)
NODEm = {n['id']: n for n in nodes}
st1 = {s['id']: s for s in m['slabs']}
def zone_top(x, y, ids):
    for sid in ids:
        s = st1.get(sid)
        if s and Polygon(s['polygon']).buffer(0.05).contains(Point(x, y)): return s['top'], sid
    return None, None
def bays(lv):
    L = []
    for x in members:
        if x.get('level') != lv or 'beam' not in x['type']: continue
        a, b = NODEm[x['i']], NODEm[x['j']]; L.append(LineString([(a['x'], a['y']), (b['x'], b['y'])]))
    return [p for p in polygonize(unary_union(L)) if p.area > 0.05]
def stexts(num):
    f = ext.P(num)
    return [(q['text'].strip(), f(q['at'])) for q, _ in ext.prims(num, kinds={'text'}) if re.match(r'^(PS|S\d|SR|SC|GS|ST)$', q['text'].strip())]
slabs = []
def addslab(id_, mark, kind, t, top, poly, use, src, st=FD, note='', **kw):
    pts = [[round(x, 3), round(y, 3)] for x, y in list(poly.exterior.coords)[:-1]]
    s = {'id': id_, 'mark': mark, 'kind': kind, 't': t, 'top': round(top, 3), 'polygon': pts, 'use': use, 'material': 'C', 'status': st, 'src': src}
    s.update(kw)
    if note: s['note'] = note
    slabs.append(s); return s
WET1 = ['S1-WC3', 'S1-WC2', 'S1-WC1', 'S1-KIT', 'S1-LAU', 'G-BK1', 'G-BK2', 'G-PMP', 'G-SIDE', 'G-PCH', 'S1-MAIN', 'S1-MAID', 'S1-FOY']
cntS = collections.Counter(); unl = []
for lv, num, ztop in (('1F', 'S-05', Z1), ('2F', 'S-06', Z2), ('ROOF', 'S-07', ZR)):
    T = stexts(num)
    for p in bays(lv):
        lab = [t for t, q in T if p.contains(Point(q))]
        if not lab:
            unl.append((lv, round(p.centroid.x, 2), round(p.centroid.y, 2), round(p.area, 2))); continue
        mk = lab[0]; cntS[(lv, mk)] += 1; sid = f'{lv[0] if lv != "ROOF" else "R"}{mk}-{cntS[(lv, mk)]:02d}'
        cx, cy = p.representative_point().x, p.representative_point().y
        if mk == 'ST': continue
        if mk == 'PS':
            addslab(sid, 'PS', 'precast', 0.10, ztop + 0.10, p, 'พื้นสำเร็จรูป + Topping', f'{num} (PS) + S-11', topping=0.05,
                    note='แผ่นพื้นสำเร็จรูป (หนาสมมติ 0.05) + Topping 0.05 Wire mesh Ø4 @0.20 · วางบนคานไม่น้อยกว่า 0.05')
        elif mk in ('S1', 'SR'):
            top = ztop
            if lv == '1F':
                z, src_ = zone_top(cx, cy, WET1)
                top = z if z is not None else ztop
            addslab(sid, mk, 'cast', 0.125, top, p, {'S1': 'พื้นหล่อในที่', 'SR': 'หลังคา SLAB'}[mk], f'{num} ({mk}) + S-11 (หนา 0.125)',
                    note=('' if abs(top - ztop) < 0.005 else f'หลังพื้น +{top:.2f} ตามระดับห้อง (หลังคาน +{ztop:.2f})'))
print('พื้นไม่มีป้าย', unl)
g = st1['G-GAR']; addslab('G-GS', 'GS', 'ground', 0.15, 0.05, Polygon(g['polygon']), 'จอดรถ (พื้นวางบนดิน GS)', 'S-05 (GS) + S-11 (หนา 0.15 ทรายรอง 0.10)')
for sid in ('G-FRT', 'G-SIDE-S1', 'G-SIDE-S2'):
    s = dict(st1[sid]); s['status'] = s.get('status', FD); s['note'] = (s.get('note', '') + ' · ไม่มีในแบบโครงสร้าง — ใช้ขอบเขตสถาปัตย์').strip(' ·'); slabs.append(s)
# พื้นยื่นหน้าอาคาร (เห็นในแบบสถาปัตย์ — แบบโครงสร้างมีแต่คานยื่นแนว I ไม่มีดีเทลพื้นยื่น) รับกรอบปูนปั้นใต้หน้าต่าง
addslab('1SC-01', 'SC', 'cast', 0.125, 0.55, box(10.795, 5.576, 17.729, 5.875), 'พื้นยื่นหน้าอาคารชั้นล่าง (รับกรอบปูนปั้นใต้หน้าต่าง W2)',
        'A-04 (ขอบพื้นยื่น y 5.576) + S-05 (คานยื่นแนว I y 5.579)', AS, '**แบบไม่มีดีเทลพื้นยื่น** — ความหนา 0.125 ระดับ +0.55 สมมติ ยื่นจากคานแนว 8 (Earth 26 ต.ค.)')
addslab('2SC-01', 'SC', 'cast', 0.125, 4.70, box(10.77, 4.379, 17.729, 4.672), 'พื้นยื่นหน้าอาคารชั้นบน (รับกรอบหน้าต่างหน้าแนว 8A)',
        'A-05 (ขอบพื้นยื่น y 4.379) + S-06 (คานยื่นแนว I y 4.372)', AS, '**แบบไม่มีดีเทลพื้นยื่น** — ความหนา 0.125 ระดับ +4.70 สมมติ ยื่นจากคานแนว 8A (Earth 26 ต.ค.)')
# พื้นใต้กล่องหุ้มเสาเฉลียง E/9 F/9 และกล่องข้างประตู D1 (Earth 26 ต.ค.: มีพื้น — แบบสถาปัตย์ · ไม่มีในแบบโครงสร้าง)
BOXSLAB = [('1SC-02', 0.45, (6.62, 3.08, 7.225, 3.88), 'กล่องหุ้มเสาเฉลียง E/9 ชั้นล่าง'), ('1SC-03', 0.45, (10.175, 3.08, 10.77, 3.88), 'กล่องหุ้มเสาเฉลียง F/9 ชั้นล่าง'),
           ('1SC-04', 0.55, (6.59, 5.08, 7.40, 5.93), 'กล่องข้างประตู D1 ด้านแนว E'), ('1SC-05', 0.55, (9.995, 5.08, 10.79, 5.93), 'กล่องข้างประตู D1 ด้านแนว F'),
           ('2SC-02', 4.70, (6.67, 2.88, 7.225, 3.88), 'กล่องหุ้มเสาเฉลียง E/9 ชั้นบน'), ('2SC-03', 4.70, (10.175, 2.88, 10.77, 4.73), 'กล่องหุ้มเสาเฉลียง F/9 ชั้นบน')]
for sid, zt, bb, use in BOXSLAB:
    addslab(sid, 'SC', 'cast', 0.125, zt, box(*bb), 'พื้นใต้' + use, 'A-04/A-05 (ขอบกล่อง)', AS, '**ไม่มีในแบบโครงสร้าง** — พื้นตามแบบสถาปัตย์ (Earth 26 ต.ค.) หนา 0.125 ระดับสมมติ')
# หลังคา SLAB ชั้นล่างส่วนยื่นที่แบบสถาปัตย์มี แต่ S-06 ไม่มี (ห้องน้ำ 1 ยื่นแนว I · ห้องปั๊มน้ำ)
addslab('2SR-X1', 'SR', 'cast', 0.125, 4.60, box(17.6, 11.35, 18.39, 14.16), 'หลังคา SLAB เหนือห้องน้ำ 1 ส่วนยื่น', 'A-05 (หลังคา SLAB +4.60)', AS,
        '**ไม่มีในแบบโครงสร้าง S-06** — ใส่ตามแบบสถาปัตย์ ยื่นจากคานแนว I หนา 0.125 สมมติ')
addslab('2SR-X2', 'SR', 'cast', 0.125, 4.60, box(17.6, 19.025, 19.525, 20.625), 'หลังคา SLAB เหนือห้องปั๊มน้ำ', 'A-05 (หลังคา SLAB +4.60)', AS,
        '**ไม่มีในแบบโครงสร้าง S-06** — ใส่ตามแบบสถาปัตย์ หนา 0.125 สมมติ · คานรอบเพิ่มเอง (Earth 26 ต.ค.)')
row('พื้น', 'SR ส่วนยื่น', 'หลังคา SLAB +4.60 เหนือห้องน้ำ 1 ส่วนยื่นแนว I (x 17.60–18.39) และเหนือห้องปั๊มน้ำ (x 17.60–19.52 y 19.03–20.63)', 'A-05', AS,
    '**ไม่มีในแบบโครงสร้าง** — แบบสถาปัตย์มี S-06 ไม่มี · หนา 0.125 สมมติ · ห้องน้ำ 1 ส่วนยื่นเป็นพื้นยื่นจากคานแนว I · ห้องปั๊มเพิ่มเสา+คาน')
row('พื้น', 'SC ใต้กล่อง', 'พื้นใต้กล่องหุ้มเสาเฉลียง E/9 F/9 (ชั้นล่าง +0.45 · ชั้นบน +4.70) และกล่องข้างประตู D1 (+0.55)', 'A-04, A-05', AS,
    '**ไม่มีในแบบโครงสร้าง** — Earth ยืนยันว่ามีพื้น · ความหนา/ระดับสมมติ · ฐานผนังกล่องปรับให้วางบนพื้นนี้')
row('พื้น', 'SC (พื้นยื่น)', 'ชั้นล่าง x 10.80–17.73 ยื่นถึง y 5.576 · ชั้นบน x 10.77–17.73 ยื่นถึง y 4.379 หนา 0.125 (สมมติ) ปลายแนว I มีคานยื่นรับ', 'A-04, A-05, S-05, S-06', AS,
    '**แบบไม่มีดีเทลพื้นยื่น** — แบบสถาปัตย์เห็นพื้นยื่นวิ่งตลอดแนว แบบโครงสร้างมีแต่คานยื่นแนว I (Earth 26 ต.ค.) · ส่วนชั้นบน x < 6.75 วางบนหลังคา SLAB อยู่แล้ว')
c = collections.Counter((s['mark'], s['kind']) for s in slabs)
row('พื้น', 'PS', f'พื้นสำเร็จรูป + Topping 0.05 {c[("PS", "precast")]} ช่อง (ชั้นล่าง +0.55 · ชั้นบน +4.70)', 'S-05, S-06, S-11', FD, 'ความหนาแผ่นพื้นสำเร็จรูปไม่ระบุ — สมมติ 0.05 (รวม 0.10)')
row('พื้น', 'S1', f'พื้นหล่อในที่หนา 0.125 {c[("S1", "cast")]} ช่อง: ห้องน้ำ ครัว ซักรีด เฉลียง ลานหลังบ้าน ทางเดินข้างบ้าน ห้องปั๊ม (หลังพื้นตามระดับห้อง)', 'S-05, S-06, S-11', FD,
    'พื้นภายนอก (ทางเดินข้างบ้าน/ลานหลังบ้าน/ห้องปั๊ม) เป็นพื้นบนคาน B1\' ไม่ใช่พื้นวางบนดิน')
row('พื้น', 'SR', f'หลังคา SLAB หนา 0.125 {c[("SR", "cast")]} ช่อง (+4.60 รอบชั้นบน · +8.65 เหนือทางเข้า)', 'S-06, S-07, S-11', FD)
row('พื้น', 'GS', 'พื้นวางบนดินจอดรถหนา 0.15 ทรายรอง 0.10 +0.05', 'S-05, S-11', FD)

# ---------------------------------------------------------------- บันได (A-18 + S-11)
stairs = [
    {'id': 'ST1', 'mark': 'ST', 'material': 'C', 'status': FD, 'src': 'A-04/A-05 (เส้นลูกตั้งใน DXF) + A-18 แบบขยาย + S-11 (บันไดท้องเรียบ หนา 0.15)',
     'flights': [{'start': [4.76, 15.75], 'dir': '-X', 'width': 1.525, 'bottom': 0.55, 'top': 2.856, 'risers': 15, 'going': 0.24, 'waist': 0.15},
                 {'start': [1.09, 15.75], 'dir': '+X', 'width': 1.525, 'bottom': 2.856, 'top': 4.70, 'risers': 12, 'going': 0.2436, 'waist': 0.15}],
     'landings': [{'rect': [0.125, 14.225, 1.40, 15.75], 'top': 2.856, 't': 0.15}, {'rect': [0.125, 15.75, 1.09, 17.275], 'top': 2.856, 't': 0.15}],
     'note': '**เสา C/4 ล้ำความกว้างช่วงล่าง 0.15 — คงตามแบบ (Earth 26 ต.ค.)** · บันไดท้องเรียบ (S-11) · ลูกตั้ง 27 × 0.153 · ช่วงล่าง 15 ลูกตั้ง 14 ลูกนอน × 0.24 (x 4.76→1.40 ตรงกันทุกแผ่น) · ชานพัก +2.856 · ช่วงบน 12 ลูกตั้ง 11 ลูกนอน x 1.09→3.77 ตาม A-05 (ลูกนอน 0.24 × 10 + ขั้นบนสุด 0.28) · ช่วงบนใส่ลูกนอนเฉลี่ย 2.68 ÷ 11 = 0.2436 · **แบบขัดแย้ง:** ช่วงบนใน A-18 แปลนขยายเริ่ม 1.43 ยาว 2.37 · รูปตัด X-X เริ่ม 1.405 ยาว 2.495 · แปลน A-05 เริ่ม 1.09 ยาว 2.68 — ใช้ A-05 เพราะลูกนอน 0.24 ตรงแบบขยายขั้น'},
    {'id': 'ST2', 'mark': 'ST', 'material': 'C', 'status': FD, 'src': 'A-04 (ลูกตั้ง y 3.076 / 3.476 · ขอบเฉลียง 3.876) + S-05 (ป้าย ST) · Earth 26 ต.ค.: หน้าคานมี 2 ขั้น ขั้นบนสุด = คาน',
     'flights': [{'start': [10.175, 3.076], 'dir': '+Y', 'width': 2.95, 'bottom': 0.05, 'top': 0.45, 'risers': 2, 'going': 0.40, 'waist': 0.15}],
     'note': 'ลูกตั้ง 2 × 0.20 ที่ y 3.076 (กว้าง 3.00 — ในโมเดลใช้ 2.95 ระหว่างหน้าเสา E/9–F/9) และ 3.476 (กว้าง 2.60) · ขั้นบนสุด 3.476–3.876 = หลังคานแนว 9 (+0.45) · **แบบขัดแย้ง:** ลูกตั้งที่ 2 (y 3.476) อยู่หลังหน้าคาน (3.379) 0.10 — ขั้นแรกทับหน้าคาน 0.10 (Earth ให้คงตามแบบ)'}]
row('บันได', 'ST1', 'บันไดหลักท้องเรียบ 2 ช่วง + ชานพัก (แนว A–C แถว 5–3) ลูกตั้ง 27 × 0.153 กว้าง 1.525 ท้อง 0.15 · ช่วงล่าง x 4.76→1.40 ลูกนอน 0.24 · ช่วงบน x 1.09→3.77', 'A-04, A-05, A-18, S-11', FD,
    '**แบบขัดแย้ง:** ช่วงบน แปลน A-05 เริ่ม x 1.09 ยาว 2.68 (ลูกนอน 0.24 + ขั้นบน 0.28) · แปลนขยาย A-18 เริ่ม 1.43 ยาว 2.37 · รูปตัด X-X เริ่ม 1.405 ยาว 2.495 — ใช้ A-05 · ชานพักจึงเป็นรูปตัว L (ฝั่งช่วงล่างถึง 1.40 ฝั่งช่วงบนถึง 1.09)')
row('บันได', 'ST2', 'ขั้นหน้าเฉลียง 2 ขั้น ลูกตั้ง 0.20 ที่ y 3.076 และ 3.476 ลูกนอน 0.40 · ขั้นบนสุด = หลังคานแนว 9 +0.45 (ถึงขอบเฉลียง 3.876)', 'A-04, S-05', FD,
    '**แบบขัดแย้ง:** ลูกตั้งที่ 2 อยู่หลังหน้าคาน 0.10 (ขั้นแรกทับหน้าคาน) · ความกว้าง 2.95 ระหว่างหน้าเสา (ขั้นล่างในแปลน 3.00 ล้อมเสา · ขั้นบน 2.60)')
# คานชานพัก BST (S-05 ป้าย B1/BST แนว A แถว 5–4)
i_ = node(0.0, 14.1, 2.856, 'LAND'); j_ = node(0.0, 17.4, 2.856, 'LAND')
members.append({'id': 'BST-01', 'mark': 'BST', 'type': 'beam', 'i': i_, 'j': j_, 'section': rsec(0.25, 0.40), 'material': 'C', 'status': AS, 'level': 'LAND',
                'src': 'S-05 (ป้าย B1/BST แนว A) + S-10 (BST 0.25×0.40)', 'note': 'คานรับชานพักแนว A ระหว่างเสา A/5–A/3 ที่ระดับชานพัก — ตำแหน่ง/ช่วงสมมติจากป้าย B1/BST'})
for a_, b_ in ((i_, None), (j_, None)): pass

# ---------------------------------------------------------------- ผนัง: ยอดชนท้องคาน
NODEm = {n['id']: n for n in nodes}
BEAMS = [(x, NODEm[x['i']], NODEm[x['j']], sections[x['section']]) for x in members if 'beam' in x['type']]
def beam_over(w, zmin, zmax):
    (x0, y0), (x1, y1) = w['path']; hor = abs(y0 - y1) < 1e-6; c = y0 if hor else x0; a, b = sorted((x0, x1) if hor else (y0, y1))
    best = None
    for x, p, q, sec in BEAMS:
        if not (zmin < p['z'] <= zmax) or abs(p['z'] - q['z']) > 1e-6: continue
        if hor != (abs(p['y'] - q['y']) < 1e-6): continue
        cc = p['y'] if hor else p['x']
        if abs(cc - c) > sec['b'] / 2 + w['t'] / 2 + 0.02: continue
        u0, u1 = sorted((p['x'], q['x']) if hor else (p['y'], q['y']))
        if min(b, u1) - max(a, u0) > 0.5 * (b - a) or (u0 - 0.01 <= a and b <= u1 + 0.01):
            zb = p['z'] - sec['h']
            if best is None or zb < best: best = zb
    return best
def beam_under(w):
    (x0, y0), (x1, y1) = w['path']; hor = abs(y0 - y1) < 1e-6; c = y0 if hor else x0; a, b = sorted((x0, x1) if hor else (y0, y1))
    best = None; cov_ = collections.Counter()
    for x, p, q, sec in BEAMS:
        if abs(p['z'] - q['z']) > 1e-6 or not (w['bottom'] - 0.35 <= p['z'] <= w['bottom'] + 0.45): continue
        if hor != (abs(p['y'] - q['y']) < 1e-6): continue
        cc = p['y'] if hor else p['x']
        if abs(cc - c) > sec['b'] / 2 + 0.01: continue
        u0, u1 = sorted((p['x'], q['x']) if hor else (p['y'], q['y']))
        cov_[round(p['z'], 3)] += max(0, min(b, u1) - max(a, u0))
    for z_, L_ in cov_.items():
        if L_ > 0.5 * (b - a) and (best is None or z_ > best): best = z_
    return best
def side_floors(w):
    (x0, y0), (x1, y1) = w['path']; hor = abs(y0 - y1) < 1e-6; mx, my = (x0 + x1) / 2, (y0 + y1) / 2; d = w['t'] / 2 + 0.10
    out = []
    for sg in (1, -1):
        pt = Point(mx, my + sg * d) if hor else Point(mx + sg * d, my)
        zs_ = [s_['top'] for s_ in slabs if abs(s_['top'] - w['bottom']) < 1.0 and Polygon(s_['polygon']).contains(pt)]
        if zs_: out.append(max(zs_))
    return out
# ผนังท่อนเดียวที่ผ่านห้องต่างระดับ (เช่น แนว A: ห้องเก็บของใต้บันได +0.55 / ห้องน้ำ 3 +0.25) → แยกท่อนที่ขอบห้อง
def maxfloor_at(w, u):
    (x0, y0), (x1, y1) = w['path']; L = math.dist((x0, y0), (x1, y1)); ux, uy = (x1 - x0) / L, (y1 - y0) / L
    px, py = x0 + ux * u, y0 + uy * u; d = w['t'] / 2 + 0.10; zs_ = []
    for sg in (1, -1):
        pt = Point(px - uy * d * sg, py + ux * d * sg)
        zs_ += [s_['top'] for s_ in slabs if abs(s_['top'] - w['bottom']) < 1.0 and Polygon(s_['polygon']).contains(pt)]
    return max(zs_) if zs_ else None
split_log = []
for w in list(m['walls']):
    if w['kind'] != 'brick_mon': continue
    (x0, y0), (x1, y1) = w['path']; L = math.dist((x0, y0), (x1, y1))
    if L < 0.8: continue
    us = [0.15 + k * 0.05 for k in range(int((L - 0.3) / 0.05) + 1)]; fz = [maxfloor_at(w, u) for u in us]
    cut = None
    for (ua, za), (ub, zb) in zip(zip(us, fz), zip(us[1:], fz[1:])):
        if za is not None and zb is not None and abs(za - zb) > 0.02:
            lo, hi = ua, ub
            for _ in range(20):
                mid = (lo + hi) / 2
                zm = maxfloor_at(w, mid)
                if zm is not None and abs(zm - za) < 0.02: lo = mid
                else: hi = mid
            cut = round((lo + hi) / 2, 3); break
    if cut is None or cut < 0.3 or L - cut < 0.3: continue
    ops_ = [o for o in m['openings'] if o['wall'] == w['id']]
    if any(abs(o['at'] - cut) < m['opening_types'][o['type']]['w'] / 2 + 0.05 for o in ops_): continue
    ux, uy = (x1 - x0) / L, (y1 - y0) / L; pc = [round(x0 + ux * cut, 3), round(y0 + uy * cut, 3)]
    w2 = dict(w, id=w['id'] + 'b', path=[pc, [x1, y1]]); w['path'] = [[x0, y0], pc]
    w2['note'] = (w.get('note', '') + f' · แยกจาก {w["id"]} ที่ขอบห้องต่างระดับ').strip(' ·')
    m['walls'].insert(m['walls'].index(w) + 1, w2)
    for o in ops_:
        if o['at'] > cut: o['at'] = round(o['at'] - cut, 3); o['wall'] = w2['id']; o['id'] = w2['id'] + o['id'][len(w['id']):]
    split_log.append(f"{w['id']} | {w2['id']} ที่ ({pc[0]:.2f}, {pc[1]:.2f})")
if split_log: row('ผนัง', 'แยกท่อนที่ขอบห้องต่างระดับ', ' · '.join(split_log), 'A-04', FD, 'ฐานผนังแต่ละท่อนตามพื้นห้องของท่อนนั้น')
# ปลายผนังหยุดก่อนหน้าเสา/หน้าผนังอีกแนว (ช่องว่าง ≤ 0.20 ตามแนวผนัง) → ยืดให้ชน
def extend_ends():
    NNc = {n_['id']: n_ for n_ in nodes}
    colsq = [(NNc[x_['i']]['x'], NNc[x_['i']]['y'], min(NNc[x_['i']]['z'], NNc[x_['j']]['z']), max(NNc[x_['i']]['z'], NNc[x_['j']]['z']), sections[x_['section']].get('b', 0.25) / 2)
             for x_ in members if x_['type'] == 'column']
    log = 0
    for w in m['walls']:
        if w['kind'] != 'brick_mon': continue
        (x0, y0), (x1, y1) = w['path']; L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L
        for k, sg in ((0, -1), (1, 1)):
            ex, ey = w['path'][k]; best = None
            for cx, cy, z0, z1, hb in colsq:
                if not (z0 < w['top'] and z1 > w['bottom']): continue
                along = (cx - ex) * ux * sg + (cy - ey) * uy * sg; perp = abs(-(cx - ex) * uy + (cy - ey) * ux)
                if perp <= hb + 0.02 and 0.005 < along - hb <= 0.20 and (best is None or along - hb < best): best = along - hb
            for u in m['walls']:
                if u is w or u['top'] <= w['bottom'] or u['bottom'] >= w['top']: continue
                (a0, b0), (a1, b1) = u['path']; Lu = math.hypot(a1 - a0, b1 - b0); vx, vy = (a1 - a0) / Lu, (b1 - b0) / Lu
                if abs(vx * ux + vy * uy) > 0.1: continue   # ตั้งฉากเท่านั้น
                tproj = (ex - a0) * vx + (ey - b0) * vy
                if not (-0.05 <= tproj <= Lu + 0.05): continue
                dist = (a0 - ex) * ux * sg + (b0 - ey) * uy * sg   # ระยะจากปลายถึงแกนผนังตั้งฉาก
                gap = dist - u['t'] / 2
                if 0.005 < gap <= 0.20 and (best is None or gap < best): best = gap
            if best:
                w['path'][k] = [round(ex + ux * sg * best, 3), round(ey + uy * sg * best, 3)]
                if k == 0:
                    for o in m['openings']:
                        if o['wall'] == w['id']: o['at'] = round(o['at'] + best, 3)
                log += 1
    return log
n_ext = extend_ends()
row('ผนัง', 'ต่อปลายผนัง', f'ปลายผนังที่หยุดก่อนหน้าเสา/หน้าผนังอีกแนว (ช่องว่าง ≤ 0.20) ยืดให้ชน {n_ext} ปลาย', 'A-04, A-05', FD, 'เส้นแกนผนังใน DXF หยุดที่ขอบปูนฉาบ ไม่ถึงหน้าเสา')
for w in m['walls']:   # ผนังหน้าต่าง W5 ห้องพักผ่อน: ชุดหน้าต่าง + หลังคากระจกลาดขึ้นไป (A-16) — ไม่มีผนังเหนือหน้าต่าง
    for o in m['openings']:
        if o['wall'] == w['id'] and o['type'] == 'W5':
            t_ = m['opening_types']['W5']; w['top'] = round(w['bottom'] + t_.get('sill', 0) + t_['h'], 3); w['fixed_top'] = True
            w['note'] = (w.get('note', '') + ' · ยอดผนัง = หัวหน้าต่าง W5 · เหนือขึ้นไปเป็นหลังคากระจกลามิเนตลาด 0.68 ถึงคานแนว y 18.35 (A-16 — รวมในชุด W5)').strip(' ·')
row('ผนัง', 'W5 ห้องพักผ่อน ชั้น 1 (+0.55) GL 2 D–F', 'ผนังใต้ขอบหน้าต่าง 0.65 + ชุดหน้าต่าง W5 สูง 2.05 · เหนือหน้าต่างเป็นหลังคากระจกลามิเนตลาด 0.68 ขึ้นไปชนแนวคาน y 18.35 (ช่วง y 18.35–19.80 ไม่มีหลังคา SLAB)', 'A-16, A-04, S-06', FD,
    'หลังคากระจกนับรวมในชุดหน้าต่าง W5 (ยังไม่วาดเป็นชิ้นในโมเดล)')
for w in m['walls']:   # ผนังกล่องวางบนพื้นใต้กล่อง
    (x0, y0), (x1, y1) = w['path']; mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    for sid, zt, bb, use in BOXSLAB:
        if bb[0] - 0.01 <= mx <= bb[2] + 0.01 and bb[1] - 0.01 <= my <= bb[3] + 0.01 and abs(w['bottom'] - zt) < 1.0 and abs(w['bottom'] - zt) > 0.001 and not any(o['wall'] == w['id'] for o in m['openings']):
            w['note'] = (w.get('note', '') + f' · ฐานผนังวางบนพื้นใต้กล่อง {sid} +{zt:.2f} (เดิม +{w["bottom"]:.2f})').strip(' ·'); w['bottom'] = zt
beam_up = []
nb = collections.Counter()
for w in m['walls']:
    zu = beam_under(w)
    sf = side_floors(w)
    if zu is not None and zu > w['bottom'] + 0.001 and sf and max(sf) < zu - 0.01:   # พื้นทั้งสองข้างต่ำกว่าหลังคาน → คงฐานผนังที่พื้น (คานโผล่เหนือพื้น = แบบขัดแย้ง)
        ops_ = [o['type'] for o in m['openings'] if o['wall'] == w['id']]
        w['note'] = (w.get('note', '') + f' · **แบบขัดแย้ง:** พื้นสองข้าง +{max(sf):.2f} ต่ำกว่าหลังคานใต้ผนัง +{zu:.2f}' + (f' — ประตู/ช่องเปิด {", ".join(ops_)} ชนคาน {zu - w["bottom"]:.2f} ม.' if ops_ else '')).strip(' ·')
        beam_up.append((w['id'], max(sf), zu, ops_))
    elif zu is not None and zu > w['bottom'] + 0.001:   # ด้านนอกต่ำกว่าหลังคาน → ฐานผนังขึ้นมาที่หลังคาน (ช่องเปิดวัดจากพื้นในห้อง) · ต่ำกว่าไม่เกิน 0.13 = ชั้นพื้น/Topping คงฐานไว้ที่ระดับพื้นห้อง
        w['note'] = (w.get('note', '') + f' · ฐานผนังยกขึ้นที่หลังคาน +{zu:.2f} (พื้นด้านนอก +{w["bottom"]:.2f})').strip(' ·'); w['bottom'] = round(zu, 3); nb['base'] += 1
    elif zu is None and not any(o['wall'] == w['id'] for o in m['openings']):   # วางบนพื้นที่ต่ำกว่าฐานผนังไม่เกิน 0.15 (เช่น ผนังชั้นบนบนหลังคา SLAB +4.60)
        mid_ = Point((w['path'][0][0] + w['path'][1][0]) / 2, (w['path'][0][1] + w['path'][1][1]) / 2)
        zs = [s_['top'] for s_ in slabs if w['bottom'] - 0.15 <= s_['top'] < w['bottom'] - 0.001 and Polygon(s_['polygon']).contains(mid_)]
        if zs:
            w['note'] = (w.get('note', '') + f' · ฐานผนังวางบนพื้น +{max(zs):.2f}').strip(' ·'); w['bottom'] = round(max(zs), 3); nb['slab'] += 1
    if w['kind'] == 'other': continue
    fl1 = w['bottom'] < 2
    if w.pop('fixed_top', False): continue
    zb = beam_over(w, w['bottom'] + 0.5, 6.0 if fl1 else 9.5)
    if zb is not None:
        w['top'] = round(zb, 3); nb['beam'] += 1
    else:
        mid_ = Point((w['path'][0][0] + w['path'][1][0]) / 2, (w['path'][0][1] + w['path'][1][1]) / 2)
        zu_ = [s_['top'] - s_['t'] for s_ in slabs if w['bottom'] + 1.5 < s_['top'] - s_['t'] < w['bottom'] + 5 and Polygon(s_['polygon']).buffer(0.06).contains(mid_)]
        w['top'] = round(min(zu_) if zu_ else ((Z2 - 0.125) if fl1 else (ZR - 0.60)), 3); nb['none'] += 1
        w['note'] = (w.get('note', '') + ' · ไม่มีคานเหนือผนัง — ยอดใต้พื้น/ระดับแถบคาน').strip(' ·')
row('ผนัง', 'ฐานผนัง', f'ผนังภายนอกที่พื้นด้านนอกต่ำกว่าหลังคาน {nb["base"]} ท่อน → ฐานผนังยกขึ้นที่หลังคาน (ช่องเปิดวัดจากพื้นห้อง) · ผนังอื่นคงฐานที่ระดับพื้นห้อง วางบนคานที่ต่ำกว่า 0.05–0.10 (Topping/ปรับระดับ)', 'S-05, S-06', FD)
for wid, fz, zu, ops_ in beam_up:
    row('ผนัง', wid, f'พื้นสองข้าง +{fz:.2f} แต่หลังคานใต้ผนัง +{zu:.2f} — คงฐานผนังที่ระดับพื้น', 'A-04, S-05', FD,
        '**แบบขัดแย้ง:** คานโผล่เหนือพื้น ' + f'{zu - fz:.2f} ม.' + (f' · ช่องเปิด {", ".join(ops_)} ชนคาน (ต้องลดคานช่วงประตู?)' if ops_ else ''))
row('ผนัง', 'ยอดผนัง', f'ปรับยอดชนท้องคาน {nb["beam"]} ท่อน (ชั้นล่าง +4.00 · ชั้นบน +8.05) · ไม่มีคานเหนือ {nb["none"]} ท่อน → ชนท้องพื้นที่อยู่เหนือ (พื้นสำเร็จรูป +4.60 · หล่อในที่/หลังคา SLAB +4.475) ไม่มีพื้นเหนือ → +8.05', 'S-05, S-06, S-07', FD)

# ---------------------------------------------------------------- โครงหลังคาเหล็ก (S-07 ดั้ง · S-08)
import roofsteel as RS
HIPS, RAF, PURL = RS.secs_def(sections, AS, FD)
tmk = collections.Counter()
def smem(mk, tp, a, b, sec, src, st=FD, note=None):
    tmk[mk] += 1
    x = {'id': f'{mk}-{tmk[mk]:03d}', 'mark': mk, 'type': tp, 'i': node(*a, 'ROOF'), 'j': node(*b, 'ROOF'), 'section': sec, 'material': 'ST',
         'status': st, 'src': src, 'group': 'roof_frame', 'level': 'ROOF'}
    if note: x['note'] = note
    members.append(x); return x
def zline(p, depth):   # ศูนย์ชิ้นใต้ผิว: ผิว − ชั้นมุง/แป − ครึ่งลึก/cos
    return round(RS.surf(*p)[0] - RS.STACK - depth / 2 / RS.COS, 3)
def zl(p, depth, d=None):
    return round(RS.surf(*p, d)[0] - RS.STACK - depth / 2 / RS.COS, 3)
def drape(p, q, mk, tp, sec, depth, src, st=FD, note=None):
    if tp != 'rafter':   # อกไก่/ตะเข้ อยู่บนรอยต่อระนาบ = เส้นตรงระหว่างปลาย
        smem(mk, tp, (p[0], p[1], zl(p, depth)), (q[0], q[1], zl(q, depth)), sec, src, st, note); return
    L = math.dist(p, q); d = ((q[0] - p[0]) / L, (q[1] - p[1]) / L); n = max(2, int(L / 0.05))
    P_ = lambda t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    cuts = [0.0]; prev = RS.surf(*P_(0.5 / n), d)[1]
    for k in range(1, n):
        cur = RS.surf(*P_((k + 0.5) / n), d)[1]
        if cur != prev: cuts.append(k / n)
        prev = cur
    cuts.append(1.0)
    for t0, t1 in zip(cuts, cuts[1:]):
        A, B = P_(t0), P_(t1)
        if math.dist(A, B) < 0.05: continue
        smem(mk, tp, (round(A[0], 3), round(A[1], 3), zl(A, depth, d)), (round(B[0], 3), round(B[1], 3), zl(B, depth, d)), sec, src, st, note)
# 1 อกไก่ · 2 ตะเข้สัน (ป้าย 2 "สะพานรับจันทัน" ชี้ที่ตะเข้สัน) · ตะเข้ราง (เส้นคู่ขนาบรางแนว −0.55/11.95 → 3.30/8.10)
RIDGE = [((6.3, 11.1), (11.3, 11.1)), ((2.1, 8.1), (3.3, 8.1))]
HIP = [((-0.55, 17.95), (6.3, 11.1)), ((18.15, 17.95), (11.3, 11.1)), ((18.15, 4.25), (11.3, 11.1)), ((3.3, 8.1), (6.3, 11.1)),
       ((-1.75, 4.25), (2.1, 8.1)), ((-1.75, 11.95), (2.1, 8.1))]
VAL = [((-0.55, 12.17), (3.415, 8.205)), ((-0.76, 11.95), (3.09, 8.1))]
for p, q in RIDGE: drape(p, q, 'RG', 'ridge', HIPS, 0.10, 'S-08 ข้อ 1 อกไก่ 2[]-100x50x2.3')
for p, q in HIP: drape(p, q, 'HP', 'hip', HIPS, 0.10, 'S-08 ตะเข้สัน 2[]-100x50x2.3')
for p, q in VAL: drape(p, q, 'VL', 'valley', HIPS, 0.10, 'S-08 (เส้นคู่ขนาบตะเข้ราง ชั้น C) 2[]-100x50x2.3', AS, 'หน้าตัดสมมติเท่าตะเข้สัน — แบบไม่ระบุ')
# 4 จันทัน []-150x50x2.3 ตามเส้นคู่ใน DXF (ชั้น 1) @1.00
cl, _ = RS.rafters()
for p, q in cl:
    p, q = RS.snap_top(p, q, RIDGE + HIP + VAL)
    drape(p, q, 'RF', 'rafter', RAF, 0.15, 'S-08 ข้อ 4 จันทัน []-150x50x2.3 @0.50–1.00 (เส้นใน DXF @1.00)')
# 2 สะพานรับจันทัน 2[]-100x50x2.3 บนดั้งตามแนวคานหลังคา (Earth 26 ต.ค.: ดั้งแนวนี้รับสะพานรับจันทัน จันทันวางบนสะพานอีกที)
RING = [(3.304, 8.101), (14.304, 8.101), (14.304, 14.101), (3.304, 14.101)]
zr = round(RS.EAVE + 3.85 * RS.TAN - RS.STACK - 0.15 / RS.COS - 0.05, 3)
for a_, b_ in zip(RING, RING[1:] + RING[:1]):
    smem('RB', 'steel_beam', (a_[0], a_[1], zr), (b_[0], b_[1], zr), HIPS, 'S-07 (แนวดั้ง) + S-08 ข้อ 2 สะพานรับจันทัน 2[]-100x50x2.3', FD,
         'แบบ S-08 ไม่ได้วาดเส้น — วางตามแนวดั้งใน S-07 ใต้จันทัน (Earth 26 ต.ค.) · ทุกด้านห่างชายคา 3.85 จึงอยู่ระดับเดียวกันทั้งกรอบ')
# 3 ดั้ง 2[]-100x50x2.3 บนคานหลังคา +8.65 (ตำแหน่งจากสัญลักษณ์ใน S-07) ถึงท้องชิ้นที่รับ
mid_posts = []; moved_posts = []; off_posts = []
RS_RAF = [RS.snap_top(p, q, RIDGE + HIP + VAL) for p, q in cl]
POST = [(2.104, 8.101), (3.304, 8.101), (7.104, 8.101), (10.304, 8.101), (14.304, 8.101), (3.304, 11.101), (6.304, 11.101), (8.804, 11.101),
        (11.304, 11.101), (14.304, 11.101), (3.304, 14.101), (7.104, 14.101), (10.304, 14.101), (14.304, 14.101)]
for x, y in POST:
    def _dseg(p, a_, b_):
        L2 = (b_[0] - a_[0]) ** 2 + (b_[1] - a_[1]) ** 2; t = max(0, min(1, ((p[0] - a_[0]) * (b_[0] - a_[0]) + (p[1] - a_[1]) * (b_[1] - a_[1])) / L2))
        return math.dist(p, (a_[0] + t * (b_[0] - a_[0]), a_[1] + t * (b_[1] - a_[1])))
    onring = any(_dseg((x, y), a_, b_) < 0.02 for a_, b_ in zip(RING, RING[1:] + RING[:1]))
    if onring:
        smem('DT', 'steel_column', (x, y, ZR), (x, y, round(zr - 0.05, 3)), HIPS, 'S-07 ข้อ 3 ดั้งเหล็กกล่อง 2[]-100x50x2.3 (สัญลักษณ์ 3) รับสะพานรับจันทัน')
        continue
    under = any(_dseg((x, y), a_, b_) < 0.06 for a_, b_ in RIDGE + HIP)
    if not under:   # ดั้งใต้จันทัน: เลื่อนเข้าแนวจันทันที่ใกล้สุด (≤ 0.25 ตามแนวคานที่ตั้ง)
        rf_ = None
        for p_, q_ in RS_RAF:
            d_ = _dseg((x, y), p_, q_)
            if d_ <= 0.25 and (rf_ is None or d_ < rf_[0]): rf_ = (d_, p_, q_)
        if rf_:
            d_, p_, q_ = rf_
            nx, ny = (p_[0], y) if abs(p_[0] - q_[0]) < 1e-6 else (x, p_[1])
            NNr = {n_['id']: n_ for n_ in nodes}
            onbeam = any(abs(NNr[m_['i']]['z'] - ZR) < 1e-3 and abs(NNr[m_['j']]['z'] - ZR) < 1e-3 and 'beam' in m_['type'] and m_['id'].startswith('RB')
                         and _dseg((nx, ny), (NNr[m_['i']]['x'], NNr[m_['i']]['y']), (NNr[m_['j']]['x'], NNr[m_['j']]['y'])) <= 0.125 for m_ in members)
            if not onbeam:   # เลื่อนแล้วตกคาน → คงตำแหน่งตามสัญลักษณ์ (บนคาน) มาร์กระยะห่างจากจันทัน
                smem('DT', 'steel_column', (x, y, ZR), (x, y, round(RS.surf(x, y)[0] - RS.STACK - 0.15 / RS.COS, 3)), HIPS, 'S-07 ข้อ 3 ดั้งเหล็กกล่อง 2[]-100x50x2.3 (สัญลักษณ์ 3)', AS,
                     f'**แบบขัดแย้ง:** ดั้งตั้งบนคานแนว E แต่จันทันที่ใกล้สุดอยู่ x {nx:.2f} ห่าง {d_:.2f} — ดั้งไม่ได้รับจันทัน')
                off_posts.append(f'({x:.2f}, {y:.2f}) ห่างจันทัน {d_:.2f}')
                continue
            if d_ > 0.01: moved_posts.append(f'({x:.2f}, {y:.2f}) → ({nx:.2f}, {ny:.2f})')
            smem('DT', 'steel_column', (nx, ny, ZR), (nx, ny, round(RS.surf(nx, ny)[0] - RS.STACK - 0.15 / RS.COS, 3)), HIPS, 'S-07 ข้อ 3 ดั้งเหล็กกล่อง 2[]-100x50x2.3 (สัญลักษณ์ 3) ใต้จันทัน',
                 note=(f'สัญลักษณ์ใน S-07 ห่างแนวจันทัน {d_:.2f} — วางใต้จันทัน' if d_ > 0.01 else None))
            continue
    if under:
        smem('DT', 'steel_column', (x, y, ZR), (x, y, round(RS.surf(x, y)[0] - RS.STACK - 0.10, 3)), HIPS, 'S-07 ข้อ 3 ดั้งเหล็กกล่อง 2[]-100x50x2.3 (สัญลักษณ์ 3)')
    else:   # ไม่มีอกไก่/ตะเฆ่อยู่เหนือ — ยกถึงท้องจันทัน
        smem('DT', 'steel_column', (x, y, ZR), (x, y, round(RS.surf(x, y)[0] - RS.STACK - 0.15 / RS.COS, 3)), HIPS, 'S-07 ข้อ 3 ดั้งเหล็กกล่อง 2[]-100x50x2.3 (สัญลักษณ์ 3)', AS,
             '**แบบขัดแย้ง:** ดั้งตำแหน่งนี้ไม่มีอกไก่/ตะเฆ่อยู่เหนือ และไม่ตรงแนวจันทัน (จันทันห่าง 0.20) — ยกถึงระดับท้องจันทัน (ถาม)')
        mid_posts.append(f'({x:.2f}, {y:.2f})')
roof = m['roofs'][0]
roof['purlin'] = {'section': PURL, 'spacing': 0.30}
roof['note'] = roof.get('note', '') + ' · โครงเหล็ก S-07/S-08: แป []-25x25x2.3 @0.30 (คิดจากระนาบหลังคา) · **แบบขัดแย้ง:** ขอบชายคา S-08 ยื่น 0.55 รอบ (หน้า y 4.25 · หลัง 17.95 · สัน y 11.10) ต่างจาก A-06 (หน้า 4.02 · หลัง 17.87 · สัน 10.945) — โครงเหล็กวางตาม S-08 ผิวมุงตาม A-06'
m.setdefault('materials', []).append({'id': 'ST', 'kind': 'steel', 'fy': 2500, 'status': FD, 'src': 'S-00 ข้อ 5.1 (มอก. 1227 กำลังคลาก ≥ 2,500 กก./ตร.ซม.) · ลวดเชื่อม E70 (ข้อ 5.3)'})
row('หลังคา', 'RG / HP / VL', 'อกไก่ 2[]-100x50x2.3 (สัน x 6.30–11.30 ที่ y 11.10 + สันผืนเล็ก x 2.10–3.30 ที่ y 8.10) · ตะเข้สัน 6 เส้นจากมุมชายคา · ตะเข้รางผืนเล็ก/ผืนหลัก ชิ้นคู่ขนาบราง', 'S-08', FD,
    'ระดับ = ผิวหลังคา 5° − ชั้นมุง 0.04 (ชิงเกิ้ล+แผ่นรอง+แป · สมมติ) − ครึ่งลึก · ตะเข้รางหน้าตัดสมมติเท่าตะเข้สัน')
row('หลังคา', 'RF', f'จันทัน []-150x50x2.3 {len(cl)} เส้น ตามเส้นคู่ใน DXF S-08 (@1.00 ม. — ป้ายเขียน @0.50–1.00) จากชายคาถึงตะเข้/อกไก่', 'S-08', FD)
row('หลังคา', 'DT', f'ดั้ง 2[]-100x50x2.3 {len(POST)} ต้น บนคานหลังคา +8.65 (สัญลักษณ์ 3 ใน S-07) — 10 ต้นรับสะพานรับจันทัน · 4 ต้นรับอกไก่', 'S-07', FD, 'ไม่มีแบบขยายแผ่นรองเหล็ก/การยึดกับคาน')
row('หลังคา', 'RB', 'สะพานรับจันทัน 2[]-100x50x2.3 กรอบ 3.30–14.30 × 8.10–14.10 บนดั้ง จันทันวางบนสะพาน (ระดับเดียวกันทั้งกรอบ)', 'S-07, S-08', FD,
    'S-08 ไม่ได้วาดเส้นสะพาน — วางตามแนวดั้ง (Earth 26 ต.ค.)')
row('หลังคา', 'แป', 'แปเหล็กกล่อง []-25x25x2.3 @0.30 ม. — คิดความยาวจากระนาบหลังคา (ไม่วาดทีละเส้น)', 'S-08 ข้อ 5', FD)
row('หลังคา', 'ขอบชายคา', 'S-08 ยื่น 0.55 รอบ (x −0.55/−1.75…18.15 · y 4.25…17.95 · สัน y 11.10) ≠ A-06 (x −0.48/−1.68…18.07 · y 4.02…17.87 · สัน y 10.945)', 'S-08, A-06', FD,
    '**แบบขัดแย้ง:** ด้านหน้า A-06 ยื่นถึง 4.02 (คลุมกรอบปูนปั้นชั้นบน y 4.43) ส่วน S-08 ถึง 4.25 · โครงเหล็กตาม S-08 ผิวมุงตาม A-06 (ถาม)')

# ---------------------------------------------------------------- รวมโมเดล
m['nodes'] = nodes; m['members'] = members; m['supports'] = supports; m['sections'] = list(sections.values())
m['slabs'] = slabs; m['stairs'] = stairs
m['levels'] = [l for l in m['levels'] if l['name'] not in ('FDN', 'LAND')] + [
    {'name': 'FDN', 'z': -1.50, 'desc': 'หลังฐานราก −1.50 ทุกฐาน (ท้องฐาน F1 −2.10 · F2 −2.20 · F3 −1.75)'},
    {'name': 'LAND', 'z': 2.856, 'desc': '+2.856 ชานพักบันได (A-18: 15 × 0.153 จาก +0.55)'},
    {'name': 'ROOF', 'z': ZR, 'desc': '+8.65 หลังคานหลังคา (อะเส)'}]
m['meta'] = dict(m['meta'], name='บ้านแนน — Step 2 โครงสร้าง', stage=2, building_type='residential')
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 2)', 'sections': ['nodes', 'members', 'supports', 'slabs', 'stairs', 'walls'],
                     'note': 'โครงสร้างจาก S-04…S-11 (DXF ชั้น BEAM / C / 15) + A-18'})
# ผนังสั้นด้านนอกที่ไม่มีคาน/พื้นรับ = กรอบปูนปั้นหน้าต่างยื่น / กล่องหุ้มเสาเฉลียง → ส่วนตกแต่งยึดกับผนัง/เสา (attached)
import subprocess
json.dump(m, open('_tmp.bm.json', 'w'), ensure_ascii=False)
JS = "const C=require('/home/claude/UD-Total-Station/lib/clash.js');const m=JSON.parse(require('fs').readFileSync('_tmp.bm.json'));console.log(JSON.stringify(C.check(m).filter(x=>x.code==='C3'&&x.sev==='error').map(x=>x.ids[0])))"
bad = set(json.loads(subprocess.run(['node', '-e', JS], capture_output=True, text=True).stdout))
att = []
for w in m['walls']:
    if w['id'] not in bad: continue
    (x0, y0), (x1, y1) = w['path']
    if math.hypot(x1 - x0, y1 - y0) <= 1.6:
        w['attached'] = True; att.append(w['id'])
        w['note'] = (w.get('note', '') + ' · ส่วนตกแต่ง (กรอบปูนปั้น/กล่องหุ้มเสา) ยื่นพ้นแนวคาน ~0.37 — ไม่มีคาน/พื้นรับ ยึดกับผนัง/เสา (ถาม)').strip(' ·')
if att: row('ผนัง', 'กล่องหุ้มเสาเฉลียง / กล่องข้างประตู D1', f'{len(att)} ท่อน: ' + ', '.join(att), 'A-04, A-05, S-05, S-06', AS,
    '**ถาม:** กล่องหุ้มเสาเฉลียง E/9 F/9 (ชั้นล่าง-ชั้นบน) และกล่องข้างประตู D1 ไม่มีคาน/พื้นรับในแบบโครงสร้าง — ตั้งเป็น "ยึดกับเสา/ผนังข้างเคียง" · กรอบปูนปั้นใต้หน้าต่างด้านหน้าย้ายไปวางบนพื้นยื่น SC แล้ว')
left = sorted(bad - set(att))
if left: row('ผนัง', 'ผนังไม่มีที่รับ', ', '.join(left), 'A-04, A-05', AS, '**ถาม:** ผนังเหล่านี้ไม่มีคาน/พื้นรับ')
json.dump(m, open('stage2.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage2_rows.json', 'w'), ensure_ascii=False, indent=1)
print(len(nodes), 'nodes', len(members), 'members', len(supports), 'supports', len(slabs), 'slabs', len(stairs), 'stairs')
