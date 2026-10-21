# ขั้น 4 วัสดุ — ต่อจาก stage3.bm.json
# อ่าน: A.2.01 (รายการวัสดุพื้น F1–F3 · ผนัง ①–⑦ · ฝ้า CL1 · ป้ายสามเหลี่ยมวัสดุผนังรายด้าน · สัญลักษณ์สุขภัณฑ์)
#       A.4.05 (ช่วงผนัง ④) · A.5.01 (ทางลาดทรายล้าง) · A.6.01–A.6.05 (สุขภัณฑ์ ราวจับ กระจก เคาน์เตอร์)
import json, math, pickle, datetime, collections
FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage3.bm.json'))
rows = []
def row(*a): rows.append(a)

DROP = {'F2': 0.05, 'F3': 0.02, 'F1': 0.0}     # ความหนาวัสดุผิว (กระเบื้อง+ปูนทราย / ทรายล้าง / ขัดหยาบในเนื้อ) — Earth ยืนยัน 22 ต.ค.
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
    F(f'FF-{s["id"]}', 'floor', FLOOR[k], 'A.2.01 รายการวัสดุพื้น ' + k, polygon=s['polygon'], z=s['top'], level='1F', **({'ramp': dict(s['ramp'])} if s.get('ramp') else {}))
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
# ก่ออิฐหุ้มต่อจากเสา A1 / A4 (A.2.01: กว้างเท่าเสา 0.20 ยื่นจากหน้าเสา 0.20 · ① ทั้งสองด้าน) — A1 ยื่นเข้าใน (+Y) · A4 ยื่นออกนอก (−Y) รับโคมกิ่ง
if not any(w['id'] == 'W-A1c' for w in m['walls']):
    m['walls'] += [
        {'id': 'W-A1c', 'kind': 'brick_mon_full', 't': 0.20, 'path': [[0.0, 0.10], [0.0, 0.30]], 'bottom': 0.20, 'top': 3.30, 'status': FD,
         'src': 'A.2.01 (ก่อต่อจากเสา A1 ยาว 0.20 ถึง +0.30 จากแนว A)', 'note': 'ก่ออิฐหุ้มต่อจากเสา'},
        {'id': 'W-A4c', 'kind': 'brick_mon_full', 't': 0.20, 'path': [[10.8, -0.10], [10.8, -0.30]], 'bottom': 0.05, 'top': 3.30, 'status': FD,
         'src': 'A.2.01 (ก่อต่อจากเสา A4 ยาว 0.20 ถึง −0.30 จากแนว A) + E.2.01 โคมกิ่ง WALL LED', 'note': 'ก่ออิฐหุ้มต่อจากเสา · ติดโคมกิ่งที่ปลาย'}]
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
    ('W-A1c', 'L'): [(0.0, 0.2, '1')], ('W-A1c', 'R'): [(0.0, 0.2, '1')], ('W-A4c', 'L'): [(0.0, 0.2, '1')], ('W-A4c', 'R'): [(0.0, 0.2, '1')],
    ('W-B1', 'R'): [(0.0, 1.2, '1'), (1.2, 2.3, '4')],   # กริด 1→ 1.30 ผนังโค้ง ① · 1.10 ผนัง ④ (ผนังเริ่ม x 0.10)
    ('W-B4', 'R'): [(0.0, 1.2, '4'), (1.2, 2.4, '1')],   # 1.20 ผนัง ④ · 1.30 ผนังโค้ง ① ถึงกริด 4
}
def oarea(o):
    t = OT[o['type']]; return t['w'] * t['h'] + (math.pi * (t['w'] / 2) ** 2 / 2 if t.get('shape') == 'arch' else 0)
ops = collections.defaultdict(list)
for o in m['openings']:
    ops[o['wall']].append(o)
wf = collections.defaultdict(float); untagged = []
pa = collections.defaultdict(lambda: {'int': 0.0, 'ext': 0.0})   # พื้นที่ฉาบ: เฉพาะด้านผิว ① (ด้านกรุกระเบื้อง/แผ่นอิฐไม่ฉาบ — Earth 22 ต.ค.)
def is_out(w, sd):   # ด้านนั้นหันออกนอกอาคาร (ห่างจากกึ่งกลางอาคาร)
    a, b = w['path']; L = math.dist(a, b); nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L   # ซ้ายของทิศผนัง
    if sd == 'R': nx, ny = -nx, -ny
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    return (mx - 5.4) * nx + (my - 2.9) * ny > 0
for w in WALLS:
    a, b = w['path']; L = math.dist(a, b); H = w['top'] - w['bottom']
    for sd in ('L', 'R'):
        key = (w['id'], sd)
        if key in ZONES:
            zones = ZONES[key]
        else:
            tg = sorted(side_tags.get(key, []))
            if not tg and w['id'] in ('W-B1', 'W-B4') and sd == 'L':   # ไม่มีป้ายในแปลน — รูปตัด A.4.05 เป็น ① ฉาบเรียบทาสี (Earth ยืนยัน)
                tg = [(0.0, '1')]
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
              wall=w['id'], height=round(H, 3), qty=round(area, 3), unit='ตร.ม.', room=sd, side=sd, u=[round(z0, 3), round(z1, 3)], tag=t)
            wf[t] += area
            if t == '1':
                ext_side = w.get('exterior') and is_out(w, sd)
                pa[w['id']]['ext' if ext_side else 'int'] += area
for t, q in sorted(wf.items()):
    row('ผนัง', f'ผิวผนัง {t}', f'{WALLF[t]} {q:.2f} ตร.ม. (เต็มความสูงผนัง หักช่องเปิด)', 'A.2.01 ป้ายรายด้าน', FD if t != '2' else US,
        'กระเบื้องเซรามิคเต็มความสูงผนัง — Earth ยืนยัน' if t == '2' else '')
row('ผนัง', 'ด้านที่ไม่มีป้าย', ', '.join(untagged) or '-', 'A.2.01', AS, 'ยังไม่ใส่วัสดุ — ขอให้ชี้')
row('ผนัง', 'ฉาบปูน', 'ฉาบเรียบเฉพาะด้านผิว ① (ทาสี) · ด้านกรุกระเบื้อง ② และแผ่นอิฐ ④ ไม่ฉาบ · ผนังบล็อกช่องลมไม่ฉาบ', 'A.2.01', US, 'Earth ยืนยัน 22 ต.ค.')
# ฉาบ: ผนังอิฐฉาบสองด้าน (ภายนอกตาม exterior) · ทาสีคิดจากผิวผนัง ① แทน (ปิด paint ในผนัง)
for w in m['walls']:
    if w['kind'] in ('brick_mon', 'brick_mon_full', 'aac'):
        p_ = pa.get(w['id'])
        w['plaster'] = bool(p_ and (p_['int'] + p_['ext']) > 0.01); w['finish_sides'] = 2; w['paint'] = False
        if w['plaster']:
            w['plaster_area'] = {'int': round(p_['int'], 3), 'ext': round(p_['ext'], 3)}
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
# ฝ้าเอียงตามท้องจันทัน: จันทันวิ่งแนว Y (สูงฝั่ง A ต่ำฝั่ง C) · โหนดจันทัน = แนวกึ่งกลาง → ท้องจันทัน = โหนด − h/2
_N = {n['id']: n for n in m['nodes']}
_rf = next(x for x in m['members'] if x['type'] == 'rafter')
_a, _b = sorted([_N[_rf['i']], _N[_rf['j']]], key=lambda n: n['y'])
_h = next(s_['dims']['h'] for s_ in m['sections'] if s_['id'] == _rf['section'])
_dz = (_b['z'] - _a['z']) / (_b['y'] - _a['y'])
CL_SLOPE = {'axis': 'Y', 'at': 0.0, 'z': round(_a['z'] + _dz * (0 - _a['y']) - _h / 2, 3), 'dz': round(_dz, 5)}
A_in = 10.8 * 5.8
F('CL1', 'ceiling', 'ฝ้าสมาร์ทบอร์ด หนา 6 มม. ฉาบเรียบรอยต่อทาสี ติดตั้งระดับท้องจันทันเหล็ก', 'A.2.01 รายการวัสดุฝ้า CL1 + รูปตัด A.4.x',
  rects=[[0, 0, 10.8, 5.8]], z=3.55, qty=round(A_in / math.cos(math.radians(pitch)), 3), unit='ตร.ม.', slope=CL_SLOPE)
row('ฝ้า', 'CL1', f'สมาร์ทบอร์ด 6 มม. ระดับท้องจันทัน (เอียง {pitch}° · +{CL_SLOPE["z"]:.2f} แนว A → +{CL_SLOPE["z"] + CL_SLOPE["dz"] * 5.8:.2f} แนว C) คลุมในอาคาร กริด 1–4 × A–C = {A_in / math.cos(math.radians(pitch)):.2f} ตร.ม. ตามแนวลาด', 'A.2.01, A.4.x', US,
    'ในอาคาร ไม่หักเสา/ผนัง — Earth ยืนยัน')
# ---- ฝ้าชายคา + เชิงชาย + ครอบข้าง (รูปตัด A.4.01/A.4.05: CL1 ใต้ชายคา · เชิงชายสำเร็จรูป 6" ปิดหัวท้ายจันทัน · ครอบหลังคาเมทัลชีทด้านข้าง)
RF = m['roofs'][0]
_xs = [p_[0] for p_ in RF['outline']]; _ys = [p_[1] for p_ in RF['outline']]
EX0, EX1, EY0, EY1 = min(_xs), max(_xs), min(_ys), max(_ys)
eave_rects = [[EX0, EY0, EX1, 0.0], [EX0, 5.8, EX1, EY1], [EX0, 0.0, 0.0, 5.8], [10.8, 0.0, EX1, 5.8]]
A_e = sum((r_[2] - r_[0]) * (r_[3] - r_[1]) for r_ in eave_rects)
F('CL1-E', 'ceiling', 'ฝ้าชายคา สมาร์ทบอร์ด หนา 6 มม. ฉาบเรียบรอยต่อทาสี ติดตั้งระดับท้องจันทันเหล็ก', 'รูปตัด A.4.01, A.4.05 (CL1 ใต้ชายคา)',
  rects=eave_rects, z=3.55, qty=round(A_e / math.cos(math.radians(pitch)), 3), unit='ตร.ม.', slope=CL_SLOPE, opacity=0.95)
row('ฝ้า', 'CL1 ชายคา', f'ฝ้าใต้ชายคารอบอาคาร ยื่น {-EY0:.2f} ม. ทุกด้าน เอียงตามท้องจันทัน = {A_e / math.cos(math.radians(pitch)):.2f} ตร.ม. ตามแนวลาด', 'A.4.01, A.4.05', FD,
    'รูปตัดมี CL1 ที่ชายคา (Earth ชี้)')
_tz = math.tan(math.radians(pitch))
roof_z = lambda y: RF['eave'] + (EY1 - y) * _tz if RF.get('low', 'y2') == 'y2' else RF['eave'] + (y - EY0) * _tz   # ผิวหลังคา (low = ฝั่ง y2)
FASCIA_H = 0.15
F('RF-FA', 'other', 'เชิงชายสำเร็จรูป ขนาด 6" ปิดหัว-ท้ายจันทัน', 'A.4.01, A.4.05, A.3.01', qty=round(2 * (EX1 - EX0), 2), unit='ม.',
  place=[{'shape': 'strip', 'w': 0.012, 'h': FASCIA_H, 'color': '#f1efe8',
          'segs': [[[EX0, y_ + sg * 0.006, round(roof_z(y_) - FASCIA_H / 2, 3)], [EX1, y_ + sg * 0.006, round(roof_z(y_) - FASCIA_H / 2, 3)]] for y_, sg in ((EY0, -1), (EY1, 1))]}])
L_side = (EY1 - EY0) / math.cos(math.radians(pitch))
F('RF-CAP', 'other', 'ครอบข้างหลังคาเมทัลชีท (ครอบหลังคาด้านข้าง)', 'A.4.01, A.3.01', qty=round(2 * L_side, 2), unit='ม.',
  place=[{'shape': 'strip', 'w': 0.12, 'h': 0.10, 'color': '#2f7d55',
          'segs': [[[x_, EY0, round(roof_z(EY0) - 0.03, 3)], [x_, EY1, round(roof_z(EY1) - 0.03, 3)]] for x_ in (EX0, EX1)]}])
row('หลังคา', 'เชิงชาย / ครอบข้าง', f'เชิงชายสำเร็จรูป 6" หน้า-หลัง {2 * (EX1 - EX0):.2f} ม. · ครอบข้างเมทัลชีท ซ้าย-ขวา {2 * L_side:.2f} ม. (ตามแนวลาด)', 'A.4.01, A.4.05, A.3.01', FD)

# ---------------------------------------------------------------- เคาน์เตอร์ (A.6.04): คสล. RB6@0.15 / RB9@0.15 กรุแกรนิตโต้
CT = [('CT-1', 1.6, 4.1, 1.5, 2.1), ('CT-2', 2.4, 4.1, 0.9, 1.4), ('CT-3', 6.6, 9.1, 1.5, 2.1), ('CT-4', 6.6, 8.3, 0.9, 1.4)]   # ระยะผิวผนัง/ผิวเสา จากเส้นเคาน์เตอร์ใน DWG
for cid, xa, xb, ya, yb in CT:
    F(cid, 'counter', 'เคาน์เตอร์ คสล. กรุกระเบื้องแกรนิตโต้ (RB6 @0.15 / RB9 @0.15)', 'A.6.04 + A.2.01 (เส้นเคาน์เตอร์)', rects=[[xa, ya, xb, yb]], z=1.0,
      qty=round(xb - xa, 2), unit='ม.')
row('เคาน์เตอร์', 'CT-1…CT-4', 'เคาน์เตอร์ คสล. กรุแกรนิตโต้ 4 ชุด: ด้านในห้องน้ำ 2 ชุด ยาว 2.50 · ด้านทางเข้า 2 ชุด ยาว 1.70 (ระยะสุทธิผิวผนัง/เสา) ลึก 0.60 · รวม 8.40 ม.', 'A.6.04, A.2.01', US,
    'ความยาวอ่านจากเส้นในแปลน — Earth ยืนยัน · คิดเป็น ม.')

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
# ---- วางสุขภัณฑ์ชิดผิวผนัง: จุดอ้างอิงจากบล็อกในแปลนบางตัวอยู่ในเนื้อผนัง → เลื่อนมาที่ผิวผนังใกล้สุด + rot = ทิศหันหน้า (องศา จากแกน +X)
FT_MOUNT = {'WC': 'wall', 'UR': 'wall', 'LAV1': 'wall', 'LAV2': 'counter', 'SP': 'wall', 'FF': 'wall'}
FIXZ = {'WC': None, 'UR': None, 'LAV1': 0.25 + 0.80, 'LAV2': 1.00, 'FC': 1.00, 'SP': None, 'FF': None, 'FD': None}   # LAV1 ขอบอ่างสูง 0.80 จากพื้น +0.25 (A.6.02) · LAV2/K.1 บนเคาน์เตอร์ +1.00 (A.6.04)
MASW = [w for w in m['walls'] if w['kind'] in ('brick_mon', 'brick_mon_full', 'aac', 'block') and len(w['path']) == 2]
def snap(x, y):
    best = None
    for w in MASW:
        a, b = w['path']; L = math.dist(a, b); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        u = (x - a[0]) * ux + (y - a[1]) * uy
        if not (-0.05 <= u <= L + 0.05):
            continue
        v = (x - a[0]) * -uy + (y - a[1]) * ux
        if best is None or abs(v) < best[0]:
            best = (abs(v), w, u, v, ux, uy)
    if not best or best[0] > 0.45:
        return None
    _, w, u, v, ux, uy = best
    sgn = 1 if v >= 0 else -1
    nx, ny = -uy * sgn, ux * sgn                     # ทิศหันหน้า = ออกจากผนังไปทางจุดเดิม
    a = w['path'][0]
    fx_, fy_ = a[0] + ux * u + nx * w['t'] / 2, a[1] + uy * u + ny * w['t'] / 2
    return round(fx_, 3), round(fy_, 3), round(math.degrees(math.atan2(ny, nx))) % 360, w['id']
for f in fx:
    if f['type'] in FT_MOUNT:
        r = snap(f['xyz'][0], f['xyz'][1])
        if r:
            f['xyz'][0], f['xyz'][1], f['rot'] = r[0], r[1], r[2]; f['wall'] = r[3]
    if FIXZ.get(f['type']) is not None:
        f['xyz'][2] = FIXZ[f['type']]
for k, v in FT_MOUNT.items():
    ft[k]['mount'] = v
m['mep']['plumbing']['fixtures'] = fx
cnt = collections.Counter(f['type'] for f in fx)
row('สุขภัณฑ์', 'นับจากสัญลักษณ์ในแปลน', ' · '.join(f'{ft[k]["desc"].split(" ")[0]} {k} {v}' for k, v in cnt.items()), 'A.2.01 + A.6.01', FD)
# ราวจับ + กระจก (A.6.01–A.6.04)
RZ = 0.25 + 0.70   # ราวจับสูง 0.70 จากพื้นห้องคนพิการ +0.25 (A.6.02 รูปตัด)
ACC = [   # (spec, จำนวน, ตำแหน่งสำหรับ 3D) — ห้องคนพิการผิวผนังใน x 4.30–6.40, y 1.00–3.00 (A.6.02) · เคาน์เตอร์/กระจก A.6.04
    ('ราวจับสแตนเลส 304 รูปตัว L 30x50 ซม. (RAL.1)', 1, [{'shape': 'rail', 'segs': [[[4.36, 1.85, RZ], [4.36, 2.15, RZ], [4.36, 2.15, RZ + 0.50]]]}]),
    ('ราวจับสแตนเลส 304 แบบพับได้ 20x58 ซม. (RAL.2)', 1, [{'shape': 'rail', 'segs': [[[5.25, 3.00, RZ], [5.25, 2.42, RZ], [5.45, 2.42, RZ], [5.45, 3.00, RZ]]]}]),
    ('ราวจับสแตนเลส 304 รูปตัว T 70x70 ซม. (RAL.3)', 1, [{'shape': 'rail', 'segs': [[[6.25, 3.00, RZ + 0.10], [6.25, 2.30, RZ + 0.10]], [[6.25, 2.30, RZ + 0.10], [6.25, 2.30, 0.25]]]}]),
    ('ราวจับสแตนเลส 304 แบบตรง 80 ซม. (RAL.4)', 2, [{'shape': 'rail', 'segs': [[[4.36, 1.25, RZ], [4.36, 2.05, RZ]]]},
                                                     {'shape': 'rail', 'segs': [[[4.40, 1.06, RZ], [5.20, 1.06, RZ]]]}]),
    ('กระจกเงาบานเปลือย 5 มม. 0.80x1.10 ม. (M.1)', 1, [{'shape': 'panel', 'xyz': [5.80, 2.98, 1.25 + 0.55], 'w': 0.80, 'h': 1.10, 'rot': 270}]),
    ('กระจกเงาบานเปลือย 5 มม. 2.20x1.10 ม. (M.2)', 2, [{'shape': 'panel', 'xyz': [2.90, 1.52, 1.16 + 0.55], 'w': 2.20, 'h': 1.10, 'rot': 90},
                                                      {'shape': 'panel', 'xyz': [7.80, 1.52, 1.16 + 0.55], 'w': 2.20, 'h': 1.10, 'rot': 90}]),
    ('กระจกเงาบานเปลือย 5 มม. 1.50x1.10 ม. (M.3)', 2, [{'shape': 'panel', 'xyz': [3.30, 1.38, 1.16 + 0.55], 'w': 1.50, 'h': 1.10, 'rot': 270},
                                                      {'shape': 'panel', 'xyz': [7.40, 1.38, 1.16 + 0.55], 'w': 1.50, 'h': 1.10, 'rot': 270}])]
for i, (spec, n, place) in enumerate(ACC, 1):
    F(f'AC-{i:02d}', 'other', spec, 'A.6.02' if 'RAL' in spec or 'M.1' in spec else 'A.6.04', qty=n, unit='ชุด', place=place,
      **({'status': AS, 'note': 'แปลน A.6.02 มี RAL.4 2 จุด (ผนังซ้ายและผนังประตู) — ขอยืนยัน'} if 'RAL.4' in spec else {}))
row('อุปกรณ์', 'ราวจับ RAL.1–4', 'ห้องน้ำคนพิการ: RAL.1–3 อย่างละ 1 · RAL.4 2 ชุด (ผนังซ้าย + ผนังประตู) — วางตำแหน่งใน 3D แล้ว', 'A.6.02', US, 'RAL.4 2 จุด — Earth ยืนยัน')
row('อุปกรณ์', 'กระจกเงา', 'M.1 0.80x1.10 ×1 (คนพิการ เหนือ LAV.1) · M.2 2.20x1.10 ×2 (เหนือเคาน์เตอร์ในห้องน้ำ) · M.3 1.50x1.10 ×2 (เหนือเคาน์เตอร์ทางเข้า) — ขอบล่าง +0.16 จากเคาน์เตอร์', 'A.6.01, A.6.04, A.4.05', US, 'Earth ยืนยันจำนวน')
row('อุปกรณ์', 'ป้ายสัญลักษณ์', 'ป้ายห้องน้ำชาย/หญิง 0.50x0.50 · คนพิการ 0.30x0.30 (A.7.01)', 'A.7.01', FD)
# ป้าย: ตำแหน่งประมาณจากรูปด้าน A.3.01 (D.1 ชาย x 2.17 / D.2 หญิง x 8.68 บนผนังอิฐโชว์ ④ ศูนย์กลางสูง +1.68 · D.3 คนพิการ บนบานเลื่อน D2 +1.91)
F('AC-08', 'other', 'ป้ายสัญลักษณ์ห้องน้ำ พลาสวูด 5 มม. 0.50x0.50 ม. (ชาย/หญิง)', 'A.7.01 + ตำแหน่ง A.3.01', qty=2, unit='ชุด',
  place=[{'shape': 'panel', 'xyz': [2.17, 1.38, 1.68], 'w': 0.50, 'h': 0.50, 'rot': 270, 'label': 'D.1 ชาย'},
         {'shape': 'panel', 'xyz': [8.68, 1.38, 1.68], 'w': 0.50, 'h': 0.50, 'rot': 270, 'label': 'D.2 หญิง'}])
F('AC-09', 'other', 'ป้ายสัญลักษณ์ห้องน้ำคนพิการ พลาสวูด 5 มม. 0.30x0.30 ม.', 'A.7.01 + ตำแหน่ง A.3.01', qty=1, unit='ชุด',
  place=[{'shape': 'panel', 'xyz': [5.79, 0.84, 1.91], 'w': 0.30, 'h': 0.30, 'rot': 270, 'label': 'D.3 คนพิการ'}])
# บัวโค้ง: ครึ่งวงกลมเหนือช่อง + ขาลงถึงพื้นสองข้าง (A.4.05) · ยาวตามแนวกึ่งกลางบัว r 0.50 + ขา 2 × 2.10
F('AC-10', 'other', 'บัวปูนปั้น 5x10 ซม. โค้งเหนือประตู ขาลงถึงพื้น', 'A.2.01, A.4.05', qty=round(2 * (math.pi * 0.5 + 2 * 2.10), 2), unit='ม.',
  place=[{'shape': 'arch_moulding', 'wall': 'W-B1', 'opening': 'W-B1-AR1', 'side': 'R', 'w': 0.10, 'd': 0.05, 'legs': True},
         {'shape': 'arch_moulding', 'wall': 'W-B4', 'opening': 'W-B4-AR1', 'side': 'R', 'w': 0.10, 'd': 0.05, 'legs': True}])
# รางตื้นหน้าห้องส้วม (A.4.01 แบบขยาย + A.2.01): กว้าง 0.15 ลึก 0.025 คสล.ปูแกรนิตโต้ ขอบคิ้วอลูมิเนียม · แนว FD-01→04 และ FD-06→09 (DWG WC-OUT)
CH = [[2.10, 3.95, 5.25, 4.10], [5.45, 3.95, 10.70, 4.10]]
chL = sum(c[2] - c[0] for c in CH)
F('CH-01', 'other', 'รางระบายน้ำตื้น คสล. กว้าง 0.15 ม. ลึก 0.025 ม. ปูกระเบื้องแกรนิตโต้ผิวหยาบ', 'A.4.01 แบบขยายรางตื้น + A.2.01', qty=round(chL, 2), unit='ม.',
  place=[{'shape': 'channel', 'rect': c, 'z': 0.20, 'depth': 0.025} for c in CH])
F('CH-02', 'other', 'คิ้วอลูมิเนียมขอบรางตื้น', 'A.4.01 แบบขยายรางตื้น', qty=round(2 * chL, 2), unit='ม.')
for f_ in fin:
    if f_['id'] == 'FF-FL-020':
        f_['holes'] = [[[c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]]] for c in CH]
row('พื้น', 'รางตื้นหน้าห้องส้วม', f'กว้าง 0.15 ลึก 0.025 ปูแกรนิตโต้ ขอบคิ้วอลูมิเนียม · 2 ช่วง (FD-01→04, FD-06→09) ยาวรวม {chL:.2f} ม. · คิ้ว {2 * chL:.2f} ม.', 'A.4.01, A.2.01', FD)
row('อุปกรณ์', 'บัวปูนปั้นโค้ง', 'บัว 5x10 ซม. โค้งเหนือช่องโค้ง 2 ช่อง ยาวรวม ~3.14 ม. (ครึ่งวงกลม r 0.50)', 'A.2.01, A.4.05', US, 'Earth ยืนยัน')
m['finishes'] = fin
# ---- รูปลักษณ์ใน 3D (ไม่กระทบปริมาณ): ผนังบล็อกช่องลม / ระแนง · แบบบานประตูหน้าต่าง A.7.01
for w in m['walls']:
    if w['id'] == 'W-A1':
        w['look'] = {'pattern': 'vent_block', 'cell': 0.20}
    elif w['id'] == 'W-A2':
        w['look'] = {'pattern': 'louver', 'bar': [0.075, 0.038], 'spacing': 0.10, 'angle': 45, 'dir': 'vertical'}
    elif w['kind'] == 'other' and w['id'].startswith('L-'):
        w['look'] = {'pattern': 'louver', 'bar': [0.025, 0.025], 'spacing': 0.05, 'angle': 0, 'dir': 'vertical'}
LOOK = {'D1': {'style': 'swing', 'frame': 0.05, 'leaf': [0.70, 2.00], 'material': 'UPVC'},
        'D2': {'style': 'slide_hung', 'panel': [1.10, 2.00], 'track': 2.10, 'panes': [0.40, 0.53, 0.53, 0.54], 'material': 'อลูมิเนียมอบขาว + กระจกฝ้า'},
        'VB': {'style': 'vent_block', 'cell': 0.20}, 'GB6': {'style': 'glass_block', 'cell': 0.20}, 'GB8': {'style': 'glass_block', 'cell': 0.20}}
for k, v in LOOK.items():
    if k in OT:
        OT[k]['look'] = v

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
row('ดรอป', 'พื้น F2 / คาน / ผนัง', f'หลังพื้นโครงสร้างภายในดรอปลง {d2} (แกรนิตโต้+ปูนทราย) · ทางลาด/ชานพักดรอป {d3} (ทรายล้าง) · ทางเดิน F1 ไม่ดรอป (ขัดหยาบในเนื้อ)', 'ตกลงกับ Earth (ขั้น 2) · ความหนา Earth ยืนยัน 22 ต.ค.', US,
    f'คาน/เสาเอ็น/ผนังที่หลังพื้นเลื่อนลงตาม ({moved} จุด) · ช่องเปิดคงระดับจริง')

m['meta'] = dict(m['meta'], name='ห้องสุขา รร.เทศบาล 4 — ขั้น 4 วัสดุ', stage=4)
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบขั้น 4)', 'sections': ['finishes', 'mep', 'slabs', 'walls', 'nodes'], 'note': 'วัสดุ ผิวพื้น ผนัง ฝ้า สุขภัณฑ์ เคาน์เตอร์ + ดรอปพื้น'})
json.dump(m, open('stage4.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'rows': rows, 'untagged': untagged, 'side_tags': {f'{k[0]}/{k[1]}': v for k, v in side_tags.items()}}, open('stage4_rows.json', 'w'), ensure_ascii=False, indent=1)
print(cnt, dict(wf), untagged)
