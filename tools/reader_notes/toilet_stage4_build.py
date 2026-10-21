# ขั้น 4 วัสดุ — ต่อจาก stage3.bm.json
# อ่าน: A.2.01 (รายการวัสดุพื้น F1–F3 · ผนัง ①–⑦ · ฝ้า CL1 · ป้ายสามเหลี่ยมวัสดุผนังรายด้าน · สัญลักษณ์สุขภัณฑ์)
#       A.4.05 (ช่วงผนัง ④) · A.5.01 (ทางลาดทรายล้าง) · A.6.01–A.6.05 (สุขภัณฑ์ ราวจับ กระจก เคาน์เตอร์)
import json, math, pickle, datetime, collections
FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage3.bm.json'))
rows = []
def row(*a): rows.append(a)

DROP = {'F2': 0.03, 'F3': 0.02, 'F1': 0.0}     # ความหนาวัสดุผิว (กระเบื้อง+ปูนทราย / ทรายล้าง / ขัดหยาบในเนื้อ) — ขอยืนยัน
FLOOR = {'F1': 'พื้นคอนกรีตผิวขัดหยาบ', 'F2': 'พื้นปูกระเบื้องแกรนิตโต้ผิวหยาบ', 'F3': 'พื้นผิวทรายล้าง'}
WALLF = {'1': 'ผนังฉาบเรียบทาสี', '2': 'ผนังกรุกระเบื้องเซรามิค ผิวมัน', '4': 'ผนังกรุแผ่นตกแต่งอิฐแดงโชว์ลาย', '6': 'ผนังผิวทรายล้าง'}
OT = m['opening_types']
fin = []
def F(id_, kind, spec, src, st=FD, **kw):
    fin.append(dict({'id': id_, 'kind': kind, 'spec': spec, 'status': st, 'src': src}, **kw))

# ---------------------------------------------------------------- พื้น (พื้นที่ตามแผ่นพื้น — ก่อนดรอป)
fa = collections.defaultdict(float)
def parea(pg):
    return abs(sum(pg[i][0] * pg[(i + 1) % len(pg)][1] - pg[(i + 1) % len(pg)][0] * pg[i][1] for i in range(len(pg)))) / 2
for s in m['slabs']:
    k = s['mark']
    F(f'FF-{s["id"]}', 'floor', FLOOR[k], 'A.2.01 รายการวัสดุพื้น ' + k, polygon=s['polygon'], z=s['top'], level='1F')
    fa[k] += parea(s['polygon'])
row('พื้น', 'F2 ภายใน', f'{FLOOR["F2"]} — ห้องน้ำชาย/หญิง/คนพิการ/ทางเข้า {fa["F2"]:.2f} ตร.ม.', 'A.2.01', FD, 'พื้นที่ตามแผ่นพื้น (ยังไม่หักผนัง/เสา)')
row('พื้น', 'F1 ทางเดิน', f'{FLOOR["F1"]} {fa["F1"]:.2f} ตร.ม.', 'A.2.01', FD)
row('พื้น', 'F3 ทางลาด/ชานพัก', f'{FLOOR["F3"]} {fa["F3"]:.2f} ตร.ม.', 'A.2.01, A.5.01', FD)

# ---------------------------------------------------------------- ผนังรายด้าน จากป้ายสามเหลี่ยมในแปลน A.2.01
sheets = pickle.load(open('../dwg/sheets.pkl', 'rb'))
sh = [s for s in sheets if s['num'] == 'A.2.01' and s['scale'] == 50][0]
segs, GX, GY, x0, y0 = pickle.load(open('../dwg/a201segs.pkl', 'rb'))
ins = [q for q in sh['prims'] if q['kind'] == 'insert' and q['name'] == 'A$C73884B84']
tx = [q for q in sh['prims'] if q['kind'] == 'text' and q.get('parent') == 'A$C73884B84']
tags = []
for i in ins:
    t = [q['text'] for q in tx if math.dist(q['at'], i['at']) < 0.3]
    x, y = i['at'][0] - x0, i['at'][1] - y0
    if t and x < 12:
        tags.append((x, y, t[0], abs(round(i['rot'])) % 180 == 90))   # ป้ายหมุน ±90 = ผนังแนวตั้ง
MAS = ('brick_mon', 'brick_mon_full', 'aac', 'block', 'block_07')
WALLS = [w for w in m['walls'] if w['kind'] in MAS and w['top'] - w['bottom'] > 0.5]
side_tags = collections.defaultdict(list)      # (wall, side) -> [(u, tag)]
for x, y, t, vert in tags:
    best = None
    for w in WALLS:
        a, b = w['path']; L = math.dist(a, b); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        if (abs(ux) < 0.5) != vert:
            continue
        u = (x - a[0]) * ux + (y - a[1]) * uy; v = (x - a[0]) * -uy + (y - a[1]) * ux   # v > 0 = ด้านซ้ายของทิศผนัง
        if -0.05 <= u <= L + 0.05 and 0.08 <= abs(v) <= 0.35 and (best is None or abs(v) < best[0]):
            best = (abs(v), w['id'], 'L' if v > 0 else 'R', u)
    if best and t not in ('3', '5'):   # ③ ⑤ = ป้ายแผงบล็อก (ช่องเปิด) ไม่ใช่ผิวผนัง
        side_tags[(best[1], best[2])].append((best[3], t))
ZONES = {   # ด้านที่มีหลายวัสดุ: แบ่งช่วงตามรูปตัด A.4.05 (ระยะจากจุดเริ่มผนัง)
    ('W-B1', 'R'): [(0.0, 1.2, '1'), (1.2, 2.3, '4')],   # กริด 1→ 1.30 ผนังโค้ง ① · 1.10 ผนัง ④ (ผนังเริ่ม x 0.10)
    ('W-B4', 'R'): [(0.0, 1.2, '4'), (1.2, 2.4, '1')],   # 1.20 ผนัง ④ · 1.30 ผนังโค้ง ① ถึงกริด 4
}
def oarea(o):
    t = OT[o['type']]; return t['w'] * t['h'] + (math.pi * (t['w'] / 2) ** 2 / 2 if t.get('shape') == 'arch' else 0)
ops = collections.defaultdict(list)
for o in m['openings']:
    ops[o['wall']].append(o)
wf = collections.defaultdict(float); untagged = []
for w in WALLS:
    a, b = w['path']; L = math.dist(a, b); H = w['top'] - w['bottom']
    for sd in ('L', 'R'):
        key = (w['id'], sd)
        if key in ZONES:
            zones = ZONES[key]
        else:
            tg = sorted(side_tags.get(key, []))
            if not tg and w['id'] in ('W-B1', 'W-B4') and sd == 'L':   # ด้านในห้องน้ำ ไม่มีป้าย — ใช้ ② ตามผนังข้างเคียง W-B2/W-B3
                tg = [(0.0, '2')]; untagged.append(f'{w["id"]}/{sd} (ใส่ ② ตามผนังข้างเคียง)')
            if not tg:
                untagged.append(f'{w["id"]}/{sd}'); continue
            tset = sorted({t for _, t in tg})
            if len(tset) == 1:
                zones = [(0.0, L, tset[0])]
            else:   # แบ่งที่กึ่งกลางระหว่างป้าย
                cut = [0.0] + [(tg[k][0] + tg[k + 1][0]) / 2 for k in range(len(tg) - 1)] + [L]
                zones = [(cut[k], cut[k + 1], tg[k][1]) for k in range(len(tg))]
        for z0, z1, t in zones:
            if t not in WALLF:
                continue
            area = (z1 - z0) * H - sum(oarea(o) for o in ops.get(w['id'], []) if z0 - 1e-6 <= o['at'] <= z1 + 1e-6)
            if area <= 0.01:
                continue
            F(f'WF-{w["id"]}-{sd}-{t}-{round(z0, 2)}', 'wall', WALLF[t], 'A.2.01 ป้ายวัสดุผนัง ' + t + (' + ช่วงตาม A.4.05' if key in ZONES else ''),
              wall=w['id'], height=round(H, 3), qty=round(area, 3), unit='ตร.ม.', room=sd)
            wf[t] += area
for t, q in sorted(wf.items()):
    row('ผนัง', f'ผิวผนัง {t}', f'{WALLF[t]} {q:.2f} ตร.ม. (เต็มความสูงผนัง หักช่องเปิด)', 'A.2.01 ป้ายรายด้าน', FD if t != '2' else AS,
        'กระเบื้องเซรามิคเต็มความสูงผนัง — ขอยืนยัน' if t == '2' else '')
row('ผนัง', 'ด้านที่ไม่มีป้าย', ', '.join(untagged) or '-', 'A.2.01', AS, 'ยังไม่ใส่วัสดุ — ขอให้ชี้')
row('ผนัง', 'ฉาบปูน', 'ผนังก่ออิฐทุกด้านฉาบเรียบ (รองพื้นกระเบื้อง/ทาสี/แผ่นตกแต่ง) · ผนังบล็อกช่องลมไม่ฉาบ', 'A.2.01', AS)
# ฉาบ: ผนังอิฐฉาบสองด้าน (ภายนอกตาม exterior) · ทาสีคิดจากผิวผนัง ① แทน (ปิด paint ในผนัง)
for w in m['walls']:
    if w['kind'] in ('brick_mon', 'brick_mon_full', 'aac'):
        w['plaster'] = True; w['finish_sides'] = 2; w['paint'] = False
    elif w['kind'] == 'block':
        w['plaster'] = False

# ระแนง ⑦ (ผนัง other หนา 0.05) และระแนงเหล็กกล่อง 75x38 (W-A2)
for w in m['walls']:
    if w['kind'] == 'other' and w['id'].startswith('L-'):
        L = math.dist(*w['path']); H = w['top'] - w['bottom']
        F(f'RL-{w["id"]}', 'other', 'ระแนงเหล็กกล่อง 25x25x1.0 มม. ทาสีน้ำมัน ⑦', 'A.2.01 รายการวัสดุผนัง ⑦', qty=round(L * H, 3), unit='ตร.ม.', wall=w['id'])
w = next(w for w in m['walls'] if w['id'] == 'W-A2')
F('RL-W-A2', 'other', 'ระแนงเหล็กกล่อง 75x38x1.6 มม. @0.10 ม. ติดตั้งเฉียง 45°', 'A.2.01', qty=round(math.dist(*w['path']) * (w['top'] - w['bottom']), 3), unit='ตร.ม.', wall='W-A2')
row('ผนัง', 'ระแนง', 'ระแนง ⑦ 25x25 เหนือผนังเคาน์เตอร์/หน้าห้องคนพิการ · ระแนงเหล็กกล่อง 75x38 แนว A — คิดเป็น ตร.ม.', 'A.2.01', FD)

# ---------------------------------------------------------------- ฝ้า CL1: สมาร์ทบอร์ด 6 มม. ระดับท้องจันทัน (เอียงตามหลังคา)
pitch = next(r['pitch'] for r in m['roofs'])
A_in = 10.8 * 5.8
F('CL1', 'ceiling', 'ฝ้าสมาร์ทบอร์ด หนา 6 มม. ฉาบเรียบรอยต่อทาสี ติดตั้งระดับท้องจันทันเหล็ก', 'A.2.01 รายการวัสดุฝ้า CL1 + รูปตัด A.4.x',
  rects=[[0, 0, 10.8, 5.8]], z=3.55, qty=round(A_in / math.cos(math.radians(pitch)), 3), unit='ตร.ม.')
row('ฝ้า', 'CL1', f'สมาร์ทบอร์ด 6 มม. ระดับท้องจันทัน (เอียง {pitch}°) คลุมในอาคาร กริด 1–4 × A–C = {A_in / math.cos(math.radians(pitch)):.2f} ตร.ม. ตามแนวลาด', 'A.2.01, A.4.x', AS,
    'ไม่รวมชายคา · ไม่หักเสา/ผนัง — ขอยืนยัน')

# ---------------------------------------------------------------- เคาน์เตอร์ (A.6.04): คสล. RB6@0.15 / RB9@0.15 กรุแกรนิตโต้
CT = [('CT-1', 1.6, 4.1, 1.5, 2.1), ('CT-2', 2.4, 4.1, 0.9, 1.4), ('CT-3', 6.6, 9.1, 1.5, 2.1), ('CT-4', 6.6, 8.3, 0.9, 1.4)]   # ระยะผิวผนัง/ผิวเสา จากเส้นเคาน์เตอร์ใน DWG
for cid, xa, xb, ya, yb in CT:
    F(cid, 'counter', 'เคาน์เตอร์ คสล. กรุกระเบื้องแกรนิตโต้ (RB6 @0.15 / RB9 @0.15)', 'A.6.04 + A.2.01 (เส้นเคาน์เตอร์)', rects=[[xa, ya, xb, yb]], z=1.0,
      qty=round(xb - xa, 2), unit='ม.')
row('เคาน์เตอร์', 'CT-1…CT-4', 'เคาน์เตอร์ คสล. กรุแกรนิตโต้ 4 ชุด: ด้านในห้องน้ำ 2 ชุด ยาว 2.50 · ด้านทางเข้า 2 ชุด ยาว 1.70 (ระยะสุทธิผิวผนัง/เสา) ลึก 0.60 · รวม 8.40 ม.', 'A.6.04, A.2.01', AS,
    'ความยาวอ่านจากเส้นในแปลน — ขอยืนยัน · คิดเป็น ม.')

# ---------------------------------------------------------------- สุขภัณฑ์/อุปกรณ์ (สัญลักษณ์ในแปลน A.2.01 + รายการ A.6.01)
ft = {
    'WC': {'kind': 'wc', 'desc': 'โถส้วมนั่งราบพร้อมหม้อน้ำ COTTO C13443(SOFT) หรือเทียบเท่า'},
    'UR': {'kind': 'urinal', 'desc': 'โถปัสสาวะชาย TF-6401-WT-0 + ฟลัชวาล์ว FFAS9859 + ท่อน้ำทิ้ง CT6809(HM)'},
    'LAV1': {'kind': 'lavatory', 'desc': 'LAV.1 อ่างล้างหน้าแขวนผนัง C014 + ท่อน้ำทิ้ง CT6809(HM)'},
    'LAV2': {'kind': 'lavatory', 'desc': 'LAV.2 อ่างล้างหน้าบนเคาน์เตอร์ C003817 + ท่อ PVC 2"'},
    'FC': {'kind': 'faucet', 'desc': 'ก๊อกน้ำอ่างล้างหน้า CT1276A(SA)(HM)'},
    'FF': {'kind': 'faucet', 'desc': 'ก๊อกน้ำล้างพื้น Sanwa หรือเทียบเท่า'},
    'SP': {'kind': 'spray', 'desc': 'สายชำระ สแตนเลส 304 CT9902SAHM'},
    'FD': {'kind': 'floor_drain', 'desc': 'ตะแกรงดักกลิ่น สแตนเลส 304 ท่อ Ø2" FUVHU-W002AS'},
}
fx = []
blk = collections.defaultdict(list)
for q in sh['prims']:
    if q['kind'] == 'insert' and q.get('parent') in (None, 'M PLAN'):
        x, y = q['at'][0] - x0, q['at'][1] - y0
        if -1.5 < x < 12.5 and -1.5 < y < 7.5:
            blk[q['name']].append((round(x, 2), round(y, 2)))
def add(t, pts, z):
    for k, (x, y) in enumerate(pts, 1):
        fx.append({'id': f'{t}-{k:02d}', 'type': t, 'xyz': [x, y, z]})
add('WC', [p for n, v in blk.items() if n.startswith('COTTO Toilet') for p in v], 0.20)
add('UR', blk['U2-P'], 0.20)
fau = [p for n, v in blk.items() if n.startswith('Sanitary_Taps') for p in v]
add('LAV2', blk['A$Ceaccfaa9'], 0.85); add('LAV1', [p for p in fau if abs(p[0] - 5.8) < 0.2 and p[1] > 2.5], 0.85)
add('FC', fau, 0.90)
add('SP', blk['A$C3e8bf91a'] + blk['CT667P'], 0.60)
add('FF', blk['Ts103bxp'], 0.45)
# ตะแกรงดักกลิ่น: จุดฐานบล็อกไม่อยู่ที่ตัวตะแกรง → ใช้กึ่งกลางเส้นในบล็อก
fdc = sorted({(round(q['c'][0] - x0, 2), round(q['c'][1] - y0, 2)) for q in sh['prims']
              if q.get('parent') == 'A$C50e6cda8' and q['kind'] in ('circle', 'arc') and abs(q['r'] - 0.044) < 0.002})   # วงนอกของตะแกรง
add('FD', fdc, 0.20)
m.setdefault('mep', {}).setdefault('plumbing', {})
m['mep']['plumbing']['fixture_types'] = ft
m['mep']['plumbing']['fixtures'] = fx
cnt = collections.Counter(f['type'] for f in fx)
row('สุขภัณฑ์', 'นับจากสัญลักษณ์ในแปลน', ' · '.join(f'{ft[k]["desc"].split(" ")[0]} {k} {v}' for k, v in cnt.items()), 'A.2.01 + A.6.01', FD)
# ราวจับ + กระจก (A.6.01–A.6.04)
for i, (spec, n) in enumerate([('ราวจับสแตนเลส 304 รูปตัว L 30x50 ซม. (RAL.1)', 1), ('ราวจับสแตนเลส 304 แบบพับได้ 20x58 ซม. (RAL.2)', 1),
                               ('ราวจับสแตนเลส 304 รูปตัว T 70x70 ซม. (RAL.3)', 1), ('ราวจับสแตนเลส 304 แบบตรง 80 ซม. (RAL.4)', 1),
                               ('กระจกเงาบานเปลือย 5 มม. 0.80x1.10 ม.', 1), ('กระจกเงาบานเปลือย 5 มม. 2.20x1.10 ม.', 2), ('กระจกเงาบานเปลือย 5 มม. 1.50x1.10 ม.', 2)], 1):
    F(f'AC-{i:02d}', 'other', spec, 'A.6.01–A.6.04', qty=n, unit='ชุด')
row('อุปกรณ์', 'ราวจับ RAL.1–4', 'ห้องน้ำคนพิการ อย่างละ 1 ชุด', 'A.6.02', AS, 'แผ่น A.6.02 มีป้าย RAL.4 หลายจุดในหลายรูป — ผมนับ 1 · ขอยืนยัน')
row('อุปกรณ์', 'กระจกเงา', '0.80x1.10 ×1 (คนพิการ) · 2.20x1.10 ×2 · 1.50x1.10 ×2 (เหนือเคาน์เตอร์ 2 ข้าง)', 'A.6.01, A.6.04, A.4.05', AS, 'ขอยืนยันจำนวน')
row('อุปกรณ์', 'ป้ายสัญลักษณ์', 'ป้ายห้องน้ำชาย/หญิง 0.50x0.50 · คนพิการ 0.30x0.30 (A.7.01)', 'A.7.01', FD)
F('AC-08', 'other', 'ป้ายสัญลักษณ์ห้องน้ำ พลาสวูด 5 มม. 0.50x0.50 ม. (ชาย/หญิง)', 'A.7.01', qty=2, unit='ชุด')
F('AC-09', 'other', 'ป้ายสัญลักษณ์ห้องน้ำคนพิการ พลาสวูด 5 มม. 0.30x0.30 ม.', 'A.7.01', qty=1, unit='ชุด')
F('AC-10', 'other', 'บัวปูนปั้น 5x10 ซม. โค้งเหนือประตู', 'A.2.01, A.4.05', qty=round(2 * math.pi * 0.5, 2), unit='ม.')
row('อุปกรณ์', 'บัวปูนปั้นโค้ง', 'บัว 5x10 ซม. โค้งเหนือช่องโค้ง 2 ช่อง ยาวรวม ~3.14 ม. (ครึ่งวงกลม r 0.50)', 'A.2.01, A.4.05', AS)
m['finishes'] = fin

# ---------------------------------------------------------------- ดรอปพื้น/คาน/ผนังลงตามความหนาวัสดุผิวพื้น (ระดับผิวพื้นสำเร็จคงเดิม)
d2, d3 = DROP['F2'], DROP['F3']
N = {n['id']: n for n in m['nodes']}
inside = lambda x, y: -0.15 <= x <= 10.95 and -0.15 <= y <= 5.95
moved = 0
for n in m['nodes']:
    if inside(n['x'], n['y']) and min(abs(n['z'] - 0.20), abs(n['z'] - 0.25)) < 1e-6:
        n['z'] = round(n['z'] - d2, 3); moved += 1
ramp_ids = {x['i'] for x in m['members'] if x['mark'] == 'B3'} | {x['j'] for x in m['members'] if x['mark'] == 'B3'}
for nid in ramp_ids:
    if not inside(N[nid]['x'], N[nid]['y']) or N[nid]['y'] < -0.15:
        N[nid]['z'] = round(N[nid]['z'] - d3, 3)
for s in m['slabs']:
    dd = DROP.get(s['mark'], 0)
    if dd:
        s['top'] = round(s['top'] - dd, 3)
        if s.get('ramp'):
            s['ramp'] = {**s['ramp'], 'low': round(s['ramp']['low'] - dd, 3), 'high': round(s['ramp']['high'] - dd, 3)}
        s['note'] = (s.get('note', '') + f' · ดรอป {dd:g} รับวัสดุผิว {FLOOR[s["mark"]]} (ผิวสำเร็จคงระดับเดิม)').strip(' ·')
for w in m['walls']:
    if min(abs(w['bottom'] - 0.20), abs(w['bottom'] - 0.25)) < 1e-6 and inside(*w['path'][0]):
        w['bottom'] = round(w['bottom'] - d2, 3)
    elif w['id'].startswith('K-'):
        w['bottom'] = round(w['bottom'] - d3, 3); w['top'] = round(w['top'] - d3, 3) + d3   # ขอบคันกั้น: ยอดคงเดิม (สูงจากผิวสำเร็จ 0.10)
for t in OT.values():   # ช่องเปิดอ้างจากท้องผนัง → ขยับขึ้นเท่าที่ดรอป ให้ระดับจริงคงเดิม
    t['sill'] = round(t.get('sill', 0) + d2, 3)
row('ดรอป', 'พื้น F2 / คาน / ผนัง', f'หลังพื้นโครงสร้างภายในดรอปลง {d2} (แกรนิตโต้+ปูนทราย) · ทางลาด/ชานพักดรอป {d3} (ทรายล้าง) · ทางเดิน F1 ไม่ดรอป (ขัดหยาบในเนื้อ)', 'ตกลงกับ Earth (ขั้น 2) · ความหนาคิดเอง', AS,
    f'คาน/เสาเอ็น/ผนังที่หลังพื้นเลื่อนลงตาม ({moved} จุด) · ช่องเปิดคงระดับจริง — ขอยืนยันความหนา')

m['meta'] = dict(m['meta'], name='ห้องสุขา รร.เทศบาล 4 — ขั้น 4 วัสดุ', stage=4)
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบขั้น 4)', 'sections': ['finishes', 'mep', 'slabs', 'walls', 'nodes'], 'note': 'วัสดุ ผิวพื้น ผนัง ฝ้า สุขภัณฑ์ เคาน์เตอร์ + ดรอปพื้น'})
json.dump(m, open('stage4.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'rows': rows, 'untagged': untagged, 'side_tags': {f'{k[0]}/{k[1]}': v for k, v in side_tags.items()}}, open('stage4_rows.json', 'w'), ensure_ascii=False, indent=1)
print(cnt, dict(wf), untagged)
