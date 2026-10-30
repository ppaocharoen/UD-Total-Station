# Step 4c บ้านแนน: แผ่นปิดขอบ 0.70 (ขอบพื้น/หลังคา SLAB ชั้นบน +4.00–4.70 ยกเหนือหลังคา SLAB เป็นขอบกันน้ำ) · แผ่นปิดขอบ 0.60 ใต้ชายคา (+8.05–8.65) · เชิงชาย
import json, math
from shapely.geometry import Polygon, LineString, MultiLineString, box, Point
from shapely.ops import unary_union, linemerge
m = json.load(open('stage4b.bm.json'))
AS = 'assumed'
SPEC = {'B70': 'บัวปูนปั้นภายนอก แถบสูง 0.70 ม. ขอบพื้น/หลังคา SLAB ชั้นบน (ยกเหนือหลังคา SLAB เป็นขอบกันน้ำ)',
        'B60': 'บัวปูนปั้นภายนอก แถบสูง 0.60 ม. ใต้ชายคา (ระดับคานหลังคา)',
        'FAS': 'เชิงชายไม้สำเร็จรูป Conwood'}
US = 'user'
def segs_of(geom):
    out = []
    gs = getattr(geom, 'geoms', [geom])
    for g in gs:
        cs = list(g.coords)
        for a, b in zip(cs, cs[1:]):
            if math.dist(a, b) > 0.02: out.append((a, b))
    return out
# 1) ขอบพื้นระดับชั้นบน (+4.60/+4.70): ขอบนอกของพื้นทั้งหมดที่ระดับนี้ ยกเว้นช่วงโถงทางเข้า E–F ด้านหน้า (เสา/ช่องโล่ง)
S2 = [Polygon(s['polygon']) for s in m['slabs'] if 4.5 <= s['top'] <= 4.75]
U = unary_union([p.buffer(0.02, join_style=2) for p in S2]).buffer(-0.02, join_style=2)
edge = MultiLineString([list(p.exterior.coords) for p in getattr(U, 'geoms', [U])])   # ขอบนอกเท่านั้น (ไม่รวมช่องบันได/ช่องโล่ง)
skip = box(6.9, -5, 10.5, 6.2)
e70 = edge.difference(skip)
s70 = segs_of(e70); L70 = sum(math.dist(a, b) for a, b in s70)
# 2) บัวใต้ชายคา +8.05–8.65: เรียบรอบอาคารตามแนวผิวนอกสุดของผนังชั้นบน (Earth 30 ต.ค.) — ไม่หยักตามผนัง
#    footprint ชั้นบน (ภายในผนังนอก + เสาเฉลียง + หลังคา SLAB เหนือทางเข้า) → ปิดร่อง < 1.0 ม. (closing) → ขอบ = แนวบัว
import numpy as np
from scipy import ndimage
H = 0.025; x0, y0 = -4.0, 1.0; nx, ny = int(27 / H), int(21 / H)
X, Y = np.meshgrid(x0 + (np.arange(nx) + 0.5) * H, y0 + (np.arange(ny) + 0.5) * H)
WM = np.zeros(X.shape, bool)
for w in m['walls']:
    if w['kind'] == 'other' or w['top'] < 7.5 or w['bottom'] > 4.9: continue
    for (ax, ay), (bx, by) in zip(w['path'], w['path'][1:]):
        Ln = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / Ln, (by - ay) / Ln; ht = w['t'] / 2
        t = (X - ax) * ux + (Y - ay) * uy; d = np.abs((X - ax) * -uy + (Y - ay) * ux); WM |= (t >= -ht - 0.13) & (t <= Ln + ht + 0.13) & (d <= ht)
lab, n = ndimage.label(~WM); out = np.isin(lab, np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
fp = ~out
rsr = next(x for x in m['slabs'] if x['id'] == 'RSR-01'); P_ = Polygon(rsr['polygon'])
xs_, ys_ = zip(*rsr['polygon']); fp |= (X >= min(xs_)) & (X <= max(xs_)) & (Y >= min(ys_)) & (Y <= max(ys_))
k = int(1.0 / H); pad = np.pad(fp, k); fpc = ndimage.binary_closing(pad, structure=np.ones((k, k)))[k:-k, k:-k]
def mask_poly(msk):
    rs = []
    for iy in range(msk.shape[0]):
        row = msk[iy]
        if not row.any(): continue
        d = np.diff(np.concatenate([[0], row.astype(int), [0]])); a_ = np.where(d == 1)[0]; b_ = np.where(d == -1)[0]
        rs += [box(x0 + i * H, y0 + iy * H, x0 + j * H, y0 + (iy + 1) * H) for i, j in zip(a_, b_)]
    return unary_union(rs)
BP = mask_poly(fpc).simplify(0.03)
BP = max(getattr(BP, 'geoms', [BP]), key=lambda g: g.area)
s60 = segs_of(BP.exterior); L60 = BP.exterior.length
roof = Polygon(m['roofs'][0]['outline'])
# ฝ้าชายคา Conwood = ขอบหลังคา − (แนวบัว + บัวยื่น 0.15)
SOF = roof.difference(BP.buffer(0.15, join_style=2))
sof = next(f for f in m['finishes'] if f['id'] == 'SOF-01')
def poly_rects(g):
    rs = []
    for p in getattr(g, 'geoms', [g]):
        if p.area < 0.01: continue
        msk = np.zeros(X.shape, bool); from shapely import contains_xy
        msk = contains_xy(p, X, Y)
        for iy in range(msk.shape[0]):
            row = msk[iy]
            if not row.any(): continue
            d = np.diff(np.concatenate([[0], row.astype(int), [0]])); a_ = np.where(d == 1)[0]; b_ = np.where(d == -1)[0]
            rs += [[x0 + i * H, y0 + iy * H, x0 + j * H, y0 + (iy + 1) * H] for i, j in zip(a_, b_)]
    # รวมแถวที่ช่วง x เหมือนกัน
    rs.sort(key=lambda r: (round(r[0], 3), round(r[2], 3), r[1])); out_ = []
    for r in rs:
        if out_ and abs(out_[-1][0] - r[0]) < 1e-6 and abs(out_[-1][2] - r[2]) < 1e-6 and abs(out_[-1][3] - r[1]) < 1e-6: out_[-1][3] = r[3]
        else: out_.append(list(r))
    return [[round(v, 3) for v in r] for r in out_]
sof['rects'] = poly_rects(SOF)
sof['note'] = 'ขอบเขต = ขอบหลังคา A-06 ถึงหน้าบัวปูนปั้น 0.60 (แนวบัวเรียบรอบอาคาร + ยื่น 0.15) · ระดับ +8.65 — Earth 30 ต.ค.'
# 3) เชิงชาย: ขอบหลังคา A-06
sF = segs_of(roof.exterior); LF = roof.exterior.length
P = lambda S, z: [[[round(a[0], 3), round(a[1], 3), z], [round(b[0], 3), round(b[1], 3), z]] for a, b in S]
m['finishes'] += [
    dict(id='BD-70', kind='other', spec=SPEC['B70'], room='ขอบพื้น/หลังคา SLAB ชั้นบน', level='2F', qty=round(L70, 2), unit='ม.', status=US,
         src='A-07…A-11 (แถบ 0.70 = 0.50 + 0.20) · Earth 30 ต.ค.', note='ตามขอบนอกพื้นระดับ +4.60/+4.70 ยกเว้นช่วงโถงทางเข้า E–F · ปูนปั้น (Earth 30 ต.ค.)',
         place=[dict(shape='strip', segs=P(s70, 4.35), w=0.12, h=0.70, color='#e8e2d6')]),
    dict(id='BD-60', kind='other', spec=SPEC['B60'], room='ใต้ชายคาหลังคาชั้นบน', level='EAVE', qty=round(L60, 2), unit='ม.', status=US,
         src='A-07…A-11 (แถบ 0.60 = 0.10 + 0.35 + 0.15) · Earth 30 ต.ค.', note='เรียบรอบอาคารตามแนวผิวนอกสุดของผนังชั้นบน (รวมเสาเฉลียงหน้า) ไม่หยักตามผนัง · ปูนปั้น (Earth 30 ต.ค.)',
         place=[dict(shape='strip', segs=P(s60, 8.35), w=0.15, h=0.60, color='#e8e2d6')]),
    dict(id='FAS-01', kind='other', spec=SPEC['FAS'], room='ขอบหลังคา', level='EAVE', qty=round(LF, 2), unit='ม.', status=AS,
         src='A-06 ขอบหลังคา · Earth 30 ต.ค. (ขาดเชิงชาย)', note='รอบขอบหลังคา A-06 · **แบบไม่ระบุวัสดุ/ขนาด** — ใช้ Conwood ชุดเดียวกับฝ้าชายคาไปก่อน (Earth 30 ต.ค.) · ปลายจันทันตัด/ต่อถึงหลังเชิงชาย',
         place=[dict(shape='strip', segs=P(sF, 8.72), w=0.025, h=0.15, color='#d9cbb5')]),
]
# ---------------------------------------------------------------- บันได (A-18): ลูกนอนไม้สักหนา 3 ซม. · ราวไม้ (ราวจับ 1x2" ลูกกรง 1x1")
st1 = next(x for x in m['stairs'] if x['id'] == 'ST1'); st2 = next(x for x in m['stairs'] if x['id'] == 'ST2')
tread = sum((f['risers'] - 1) * f['going'] * f['width'] for f in st1['flights'])
land = sum(abs(l['rect'][2] - l['rect'][0]) * abs(l['rect'][3] - l['rect'][1]) for l in st1['landings'])
riser = sum(f['risers'] * (f['top'] - f['bottom']) / f['risers'] * f['width'] for f in st1['flights'])
rail_f = [math.hypot(f['risers'] * f['going'], f['top'] - f['bottom']) for f in st1['flights']]
rail_2f = 3.90 + 1.60
m['finishes'] += [
    dict(id='STF-01', kind='floor', spec='ลูกนอนบันไดไม้สักหนา 3 ซม.', room='บันได ST1', level='1F', qty=round(tread + land, 3), unit='ตร.ม.', status='from_drawing', src='A-18 (TOP บันไดไม้สักหนา 3 ซม.)',
         note=f'ลูกนอน {tread:.2f} + ชานพัก {land:.2f} ตร.ม. (ชานพักไม้สัก — Earth 30 ต.ค.)'),
    dict(id='STF-02', kind='other', spec='ลูกตั้งบันไดไม้สักหนา 3 ซม.', room='บันได ST1', level='1F', qty=round(riser, 3), unit='ตร.ม.', status=US, src='A-18',
         note='แบบไม่ระบุวัสดุลูกตั้ง — ไม้สักเหมือนลูกนอน (Earth 30 ต.ค.)'),
    dict(id='STR-01', kind='railing', spec='ราวบันไดไม้ (ราวจับ 1x2 นิ้ว ลูกกรง 1x1 นิ้ว)', room='บันได ST1', level='1F', qty=round(sum(rail_f) + rail_2f, 2), unit='ม.', status=AS, src='A-18 + A-11',
         note=f'ด้านในช่วงบันได 2 ช่วง (ตามแนวลาด {rail_f[0]:.2f} + {rail_f[1]:.2f}) + กันตกขอบช่องบันไดชั้นบน {rail_2f:.2f} ม. (สมมติตามแปลน A-05)'),
    dict(id='STF-03', kind='floor', spec='พื้น F5 กระเบื้องเซรามิค 60×120 ซม. ผิวหยาบ', room='ขั้นบันไดหน้าเฉลียง ST2', level='1F', qty=round(st2['flights'][0]['width'] * (2 * 0.40 + 2 * 0.20), 3), unit='ตร.ม.',
         status=AS, src='A-04 (เฉลียง F5)', note='ลูกนอน 2 × 0.40 + ลูกตั้ง 2 × 0.20 กว้าง 2.95 — สมมติวัสดุเดียวกับเฉลียง'),
]
# ---------------------------------------------------------------- ปลายจันทัน/ตะเฆ่ที่ชายคา → ถึงหลังเชิงชาย (ขอบหลังคา A-06 หด 0.025) — Earth 30 ต.ค.: จันทันโผล่นอกเชิงชาย
INS = roof.buffer(-0.025, join_style=2); ND = {n['id']: n for n in m['nodes']}
use = {}
for x in m['members']:
    for e in ('i', 'j'): use[x[e]] = use.get(x[e], 0) + 1
moved = []
for x in m['members']:
    if x['type'] not in ('rafter', 'hip', 'valley'): continue
    a, b = ND[x['i']], ND[x['j']]; lo_e = 'i' if a['z'] < b['z'] else 'j'; lo, hi = (a, b) if lo_e == 'i' else (b, a)
    if lo['z'] > 8.8 or roof.exterior.distance(Point(lo['x'], lo['y'])) > 0.4: continue   # เฉพาะปลายที่ชายคา (ไม่ใช่จุดต่อกลางจันทัน)
    dx, dy, dz = lo['x'] - hi['x'], lo['y'] - hi['y'], lo['z'] - hi['z']; L = math.hypot(dx, dy)
    ray = LineString([(hi['x'], hi['y']), (hi['x'] + dx / L * (L + 2.0), hi['y'] + dy / L * (L + 2.0))])
    ip = ray.intersection(INS.exterior)
    pts = [p for p in getattr(ip, 'geoms', [ip]) if not p.is_empty]
    if not pts: continue
    p = min(pts, key=lambda q: abs(math.hypot(q.x - hi['x'], q.y - hi['y']) - L))
    t = math.hypot(p.x - hi['x'], p.y - hi['y']) / L
    if abs(t - 1) * L < 0.005: continue
    nz = round(hi['z'] + dz * t, 3); nxy = (round(p.x, 3), round(p.y, 3))
    if use[lo['id']] > 1:
        nid = f'N-EAVE-{len(moved) + 1:03d}'; m['nodes'].append(dict(lo, id=nid, x=nxy[0], y=nxy[1], z=nz)); x[lo_e] = nid
    else: lo['x'], lo['y'], lo['z'] = nxy[0], nxy[1], nz
    moved.append((x['id'], round((t - 1) * L, 3)))
    x['note'] = ((x.get('note') or '') + ' · ' if x.get('note') else '') + f'ปลายชายคา{"ตัดสั้น" if t < 1 else "ต่อยาว"} {abs(t - 1) * L:.2f} ม. ถึงหลังเชิงชาย (ขอบหลังคา A-06) — Earth 30 ต.ค.'
print('eave ends adjusted', len(moved), 'trim', sum(1 for _, d in moved if d < 0), 'extend', sum(1 for _, d in moved if d > 0), 'max', max((abs(d) for _, d in moved), default=0))
# ---------------------------------------------------------------- หลังคากระจก W5 (A-16): กระจกนิรภัยลามิเนต Temper 6+6 มม. ลาดจากหัวหน้าต่าง +0.68 เข้าหาคานแนว y 18.35
ow = next(o for o in m['openings'] if o['type'] == 'W5'); ww = next(w for w in m['walls'] if w['id'] == ow['wall'])
(ax, ay), (bx, by) = ww['path'][0], ww['path'][-1]; Lw = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / Lw, (by - ay) / Lw
cx, cy = ax + ux * ow['at'], ay + uy * ow['at']; W5 = m['opening_types']['W5']
z0 = ww['bottom'] + W5['sill'] + W5['h']; run = abs(cy - 18.35); rise = 0.68; Lg = math.hypot(run, rise)
W5['desc'] = 'W5 หน้าต่างบานเปิด 5 บาน + FIX วงกบอลูมิเนียม 2x6 นิ้ว สีดำ (A-16) — หลังคากระจกแยกรายการ W5-GR'
m['finishes'].append(dict(id='W5-GR', kind='other', spec='หลังคากระจกนิรภัยลามิเนต Temper 6+6 มม. (ชุดหน้าต่าง W5)', room='พักผ่อน ชั้น 1 แนว 2', level='1F',
    qty=round(W5['w'] * Lg, 3), unit='ตร.ม.', status='from_drawing', src='A-16 (W5 รูปตัด: ลาดขึ้น 0.68 · กระจกนิรภัยลามิเนต Temper 6+6 มม.)',
    note=f'กว้าง {W5["w"]:.2f} × ยาวตามลาด {Lg:.2f} ม. (ราบ {run:.2f} สูงขึ้น {rise:.2f}) จากหัวหน้าต่าง +{z0:.2f} ถึง +{z0 + rise:.2f} · ใต้หลังคากระจกไม่มีฝ้า',
    place=[dict(shape='strip', segs=[[[round(cx, 3), round(cy, 3), round(z0, 3)], [round(cx, 3), 18.35, round(z0 + rise, 3)]]], w=W5['w'], h=0.012, color='#bfe3ea')]))
json.dump(m, open('stage4c.bm.json', 'w'), ensure_ascii=False)
print('stair tread+land', round(tread + land, 2), 'riser', round(riser, 2), 'rail', round(sum(rail_f) + rail_2f, 2))
print('band70', round(L70, 2), len(s70), 'band60', round(L60, 2), len(s60), 'fascia', round(LF, 2))
