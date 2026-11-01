# Step 2 โครงสร้าง — ห้องน้ำ ท12 (ต่อจาก Step 1)
# แผ่น: S.2.01 ฐานราก/ตอม่อ · S.2.02 คาน/เสา/พื้น · S.2.03 อะเส · S.2.04 อะเสรับโครงหลังคา + TRUSS T1 · S.2.05 โครงหลังคา · S.3.01 ฐานราก F1/F2 · S.3.02 เสา คาน พื้น GS ทางลาด
import json, math, datetime, collections
FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('../s1/stage1.bm.json'))
rows = []
def row(cat, id_, desc, src, st=FD, note=''): rows.append((cat, id_, desc, src, st, note))
GX = {g['name']: g['coord'] for g in m['grids'] if g['axis'] == 'X'}; GY = {g['name']: g['coord'] for g in m['grids'] if g['axis'] == 'Y'}
N = {n['id']: n for n in m['nodes']}
def node(x, y, z, pre='N'):
    x, y, z = round(x, 3), round(y, 3), round(z, 3)
    for n in m['nodes']:
        if abs(n['x'] - x) < 1e-4 and abs(n['y'] - y) < 1e-4 and abs(n['z'] - z) < 1e-4: return n['id']
    nid = f'{pre}-{x:.3f}_{y:.3f}_{z:.3f}'; n = {'id': nid, 'x': x, 'y': y, 'z': z}; m['nodes'].append(n); N[nid] = n; return nid
def mem(id_, mark, typ, a, b, sec, mat, src, st=FD, note='', **kw):
    d = {'id': id_, 'mark': mark, 'type': typ, 'i': node(*a), 'j': node(*b), 'section': sec, 'material': mat, 'status': st, 'src': src}
    if note: d['note'] = note
    d.update(kw); m['members'].append(d); return d

# ---------------------------------------------------------------- วัสดุ / หน้าตัด
m['materials'].append({'id': 'CF', 'kind': 'cold_formed', 'status': FD, 'src': 'S.2.03–S.2.05 (ขนาดเหล็กตามแบบ)', 'note': 'แบบไม่ระบุเกรดเหล็กรูปพรรณขึ้นรูปเย็น'})
def boxA(h, b, t): return 2 * t * (h + b) - 8.62 * t * t
SEC = m['sections']
SEC += [
    {'id': 'RC-30x30', 'kind': 'rc_rect', 'b': 0.30, 'h': 0.30, 'status': FD, 'src': 'S.3.01 เสาตอม่อ 0.30×0.30 · S.3.02 ตาราง C1 (ตอม่อ 8-DB16)'},
    {'id': 'RC-20x40', 'kind': 'rc_rect', 'b': 0.20, 'h': 0.40, 'status': FD, 'src': 'S.3.02 แบบขยายคาน B1 / B2 (0.20×0.40)'},
    {'id': 'C100x50x20x2.3', 'kind': 'cold_formed', 'shape': 'lipped_C', 'name': 'C-100x50x20x2.3', 'b': 0.05, 'h': 0.10, 'dims': {'h': 0.10, 'b': 0.05, 'c': 0.02, 't': 0.0023},
     'kg_m': 4.06, 'table': 'มอก. 1228', 'status': FD, 'src': 'S.2.03 ข้อ 2–3'},
    {'id': '2C100x50x20x2.3', 'kind': 'cold_formed', 'shape': 'box', 'name': '2C-100x50x20x2.3 (ประกบคู่)', 'b': 0.10, 'h': 0.10, 'dims': {'h': 0.10, 'b': 0.10, 't': 0.0023},
     'kg_m': 8.12, 'table': 'มอก. 1228', 'status': FD, 'src': 'S.2.03 ข้อ 1 · CX', 'note': 'C-100x50x20x2.3 ประกบคู่ 2 ตัว (4.06 × 2)'},
    {'id': 'BOX75x75x3.2', 'kind': 'cold_formed', 'shape': 'box', 'name': '[]-75x75x3.2', 'b': 0.075, 'h': 0.075, 'dims': {'h': 0.075, 'b': 0.075, 't': 0.0032},
     'kg_m': round(boxA(0.075, 0.075, 0.0032) * 7850, 2), 'table': 'มอก. 107', 'status': FD, 'src': 'S.2.04 แบบขยาย TRUSS T1 (คอร์ดบน/ล่าง ตั้งปลาย)', 'note': 'น้ำหนัก/ม. คำนวณจากหน้าตัดกล่องมุมโค้ง'},
    {'id': 'BOX38x38x1.6', 'kind': 'cold_formed', 'shape': 'box', 'name': '[]-38x38x1.6', 'b': 0.038, 'h': 0.038, 'dims': {'h': 0.038, 'b': 0.038, 't': 0.0016},
     'kg_m': round(boxA(0.038, 0.038, 0.0016) * 7850, 2), 'table': 'มอก. 107', 'status': FD, 'src': 'S.2.04 แบบขยาย TRUSS T1 (ท่อนกลาง)', 'note': 'น้ำหนัก/ม. คำนวณจากหน้าตัดกล่องมุมโค้ง'},
    {'id': 'BOX50x25x2.0', 'kind': 'cold_formed', 'shape': 'box', 'name': '[]-50x25x2.0', 'b': 0.05, 'h': 0.025, 'dims': {'h': 0.025, 'b': 0.05, 't': 0.002},
     'kg_m': round(boxA(0.05, 0.025, 0.002) * 7850, 2), 'table': 'มอก. 107', 'status': FD, 'src': 'S.2.05 ข้อ 4 แปเหล็กกล่อง @1.00', 'note': 'วางแบน (สูง 0.025) · น้ำหนัก/ม. คำนวณจากหน้าตัดกล่องมุมโค้ง'},
]

# ---------------------------------------------------------------- ฐานราก + ตอม่อ
FOOT = {'F1': 1.20, 'F2': 0.90}
sup = []
for gx in '1234':
    for gy in 'ABC':
        x, y = GX[gx], GY[gy]; fm = 'F2' if gy == 'A' else 'F1'; B = FOOT[fm]
        nb = node(x, y, -1.20)
        sup.append({'id': f'{fm}-{gx}{gy}', 'mark': fm, 'node': nb, 'kind': 'spread', 'b': B, 'd': B, 'h': 0.25, 'bottom': -1.45, 'material': 'C', 'sand': 0.10, 'lean': 0.05,
                    'fixity': 'fixed', 'status': FD, 'src': f'S.2.01 (ป้าย {fm},C1) + S.3.01 แบบขยายฐานราก {fm}',
                    'note': f'ฐาน {B:.2f}×{B:.2f}×0.25 ท้องฐาน −1.45 (ลึก 1.60 รวมทรายหยาบ 0.10 + คอนกรีตหยาบ 0.05) · ดินรับน้ำหนักไม่น้อยกว่า 10 ตัน/ตร.ม.'})
        top = 0.20 - 0.40   # ท้องคานคอดิน (Earth 1 พ.ย.: ตอม่อจบที่ท้องคาน)
        mem(f'PD-{gx}{gy}', 'C1(ตอม่อ)', 'column', (x, y, -1.20), (x, y, top), 'RC-30x30', 'C', 'S.3.01 เสาตอม่อ 0.30×0.30 (−1.20 → ท้องคานคอดิน −0.20)', US,
            note='ตอม่อ 0.30×0.30 จากหลังฐานราก −1.20 ถึงท้องคานคอดิน −0.20 (Earth 1 พ.ย.)' + ('' if not (gy == 'A' and gx in '23') else ' · **ตอม่ออย่างเดียว ไม่มีเสาต่อขึ้น** (S.2.01 สัญลักษณ์ทึบ · รับคานคอดินแถว A)'))
m['supports'] = sup
for w in m['walls']:
    if w['id'] in ('K-R', 'K-P1', 'K-P2'): w['attached'] = True; w['note'] += ' · หล่อเป็นเนื้อเดียวกับโครงทางลาด (S.3.02)'
for c in m['members']:   # เสา C1 เริ่มที่ท้องคาน −0.20 (ต่อจากตอม่อ ผ่านจุดต่อคานคอดิน) — ตัดเป็น 2 ชิ้นที่หลังคาน +0.20 ให้คานคอดินต่อเข้าจุดเดียวกัน
    if c['id'].startswith('C-') and c['type'] == 'column':
        n0 = N[c['i']]
        mem(c['id'] + 'j', c['mark'], 'column', (n0['x'], n0['y'], -0.20), (n0['x'], n0['y'], n0['z']), c['section'], 'C', 'S.3.02 ตาราง C1 + ตอม่อจบท้องคาน (Earth 1 พ.ย.)', US,
            note='เสา C1 ช่วงจุดต่อคานคอดิน −0.20 → +0.20 (ต่อจากตอม่อ)')
for c in m['members']:   # เสาเอ็นเป็นชิ้นส่วนงานก่อ (ไม่ใช่เสาโครงสร้าง) — นั่งบนคานคอดิน/พื้น
    if c['id'].startswith('ST-'): c['type'] = 'stiffener'
for c in m['members']:
    if c['id'].startswith('C-') and c['type'] == 'column':
        c['note'] = 'เสา C1 0.20×0.20 (4-DB16) จากหลังคานคอดิน +0.20 ถึงอะเส +3.30 · หัวเสาเพลท 200×200×9 มม. + J-Bolt ชุบกัลวาไนซ์ 10×300 มม. 4 ตัว รับอะเสเหล็ก (S.3.01)'
        c['src'] = 'A.2.01 + S.2.02 + S.3.02 ตาราง C1'
row('ฐานราก', 'F1-1B…4C (8 ฐาน)', 'F1 1.20×1.20×0.25 ท้อง −1.45 ใต้เสาแถว B และ C', 'S.2.01, S.3.01', FD, 'ทรายหยาบ 0.10 + คอนกรีตหยาบ 0.05 · ดินรับน้ำหนัก ≥ 10 ตัน/ตร.ม.')
row('ฐานราก', 'F2-1A…4A (4 ฐาน)', 'F2 0.90×0.90×0.25 ท้อง −1.45 แถว A (กริด 1 2 3 4)', 'S.2.01, S.3.01', FD, '**2A / 3A มีแต่ตอม่อรับคานคอดิน ไม่มีเสาต่อขึ้น** (ตรงกับแบบสถาปัตย์ที่แถว A มีเสาแค่ 1A / 4A)')
row('เสา', 'PD-… (12 ต้น)', 'ตอม่อ 0.30×0.30 จาก −1.20 ถึงท้องคานคอดิน −0.20', 'S.3.01, S.3.02', US, 'Earth 1 พ.ย.: ตอม่อจบที่ท้องคาน')
row('เสา', 'C-…j (10 ชิ้น)', 'เสา C1 ช่วงจุดต่อคานคอดิน −0.20 → +0.20 (ต่อจากตอม่อ แยกชิ้นที่หลังคานให้คานต่อเข้าจุดเดียวกัน)', 'S.3.02', US)
row('เสา', 'C-… (10 ต้น)', 'เสา C1 0.20×0.20 +0.20 → +3.30 · หัวเสาเพลท 200×200×9 + J-Bolt 10×300 ×4', 'S.3.01, S.3.02', FD)

# ---------------------------------------------------------------- คานคอดิน (หลังคาน +0.20)
BT = 0.20
BEAMS = [  # (mark, แกน, พิกัดแนว, จาก, ถึง) — จากช่องว่างระหว่างแผงพื้นใน S.2.02 (แผงพื้นห่างขอบคาน 0.10)
    ('B2', 'H', 0.00, 0.00, 10.80), ('B2', 'H', 0.90, 4.20, 6.50), ('B1', 'H', 1.50, 0.00, 4.20), ('B1', 'H', 1.50, 6.50, 10.80),
    ('B2', 'H', 3.10, 0.00, 2.00), ('B1', 'H', 3.10, 4.20, 6.50), ('B2', 'H', 3.10, 9.20, 10.80),
    ('B2', 'H', 4.20, 2.00, 4.20), ('B1', 'H', 4.20, 6.50, 10.80), ('B1', 'H', 5.80, 0.00, 10.80),
    ('B2', 'V', 0.00, 0.00, 1.50), ('B1', 'V', 0.00, 1.50, 5.80), ('B1', 'V', 2.00, 1.50, 5.80), ('B2', 'V', 3.10, 4.20, 5.80),
    ('B2', 'V', 4.20, 0.00, 1.50), ('B1', 'V', 4.20, 1.50, 5.80), ('B2', 'V', 5.35, 3.10, 5.80),
    ('B2', 'V', 6.50, 0.00, 1.50), ('B1', 'V', 6.50, 1.50, 5.80), ('B2', 'V', 7.50, 4.20, 5.80), ('B2', 'V', 8.60, 4.20, 5.80),
    ('B2', 'V', 9.20, 1.50, 4.20), ('B2', 'V', 9.70, 4.20, 5.80), ('B2', 'V', 10.80, 0.00, 1.50), ('B1', 'V', 10.80, 1.50, 5.80),
]
def gl(ax, c):   # ชื่อแนวกริดของพิกัด
    G = GY if ax == 'H' else GX
    for k, v in G.items():
        if abs(v - c) < 1e-6: return k
    k = min(G, key=lambda k: abs(G[k] - c)); d = c - G[k]
    return f'{k}{"+" if d > 0 else "−"}{abs(d):.2f}'
# จุดตัด → แบ่งช่วงคาน
pts = collections.defaultdict(set)
for mk, ax, c, a, b in BEAMS:
    for mk2, ax2, c2, a2, b2 in BEAMS:
        if ax2 != ax and a - 1e-6 <= c2 <= b + 1e-6 and a2 - 1e-6 <= c <= b2 + 1e-6: pts[(ax, c, a, b)].add(round(c2, 3))
    for gx in GX.values():
        for gy in GY.values():
            if (ax == 'H' and abs(gy - c) < 1e-6 and a - 1e-6 <= gx <= b + 1e-6) or (ax == 'V' and abs(gx - c) < 1e-6 and a - 1e-6 <= gy <= b + 1e-6):
                pts[(ax, c, a, b)].add(round(gx if ax == 'H' else gy, 3))
nb = 0
for mk, ax, c, a, b in BEAMS:
    ss = sorted(pts[(ax, c, a, b)] | {a, b})
    for u0, u1 in zip(ss, ss[1:]):
        if u1 - u0 < 1e-6: continue
        nb += 1
        p0 = (u0, c, BT) if ax == 'H' else (c, u0, BT); p1 = (u1, c, BT) if ax == 'H' else (c, u1, BT)
        where = f'แนว {gl(ax, c)} ช่วง {gl("V" if ax == "H" else "H", u0)} → {gl("V" if ax == "H" else "H", u1)}'
        mem(f'GB-{nb:02d}', mk, 'tie_beam', p0, p1, 'RC-20x40', 'C', 'S.2.02 แปลนคาน (ป้าย ' + mk + ') + S.3.02 แบบขยายคาน', level='WC',
            note=f'คานคอดิน {mk} 0.20×0.40 หลังคาน +0.20 · {where}')
row('คาน', f'GB-01…GB-{nb:02d}', 'คานคอดิน B1 / B2 0.20×0.40 หลังคาน +0.20 (B1 ล่าง 3-DB16 · B2 ล่าง 2-DB16 = Step 3) — ตามช่องว่างระหว่างแผงพื้นใน S.2.02', 'S.2.02, S.3.02', FD,
    'แบ่งช่วงที่จุดตัดคาน/เสา · หลังคานทุกตัว +0.20 · พื้น +0.25 เทหนาขึ้น 0.05 (Earth 1 พ.ย.)')

# ---------------------------------------------------------------- พื้น GS
for s in m['slabs']:
    s['mark'] = 'GS'; s['kind'] = 'ground'
    if s['id'].startswith('S-WK'):
        s['t'] = 0.12; s['src'] += ' + S.3.02 แบบขยายพื้น GS (ภายนอก)'
        s['edge_thicken'] = {'d': 0.12, 'w_top': 0.40, 'w_bot': 0.25, 'sides': {'S-WK-N': [1, 2, 3], 'S-WK-W': [0, 3], 'S-WK-E': [0, 1], 'S-WK-S1': [0], 'S-WK-S2': [0]}[s['id']]}
        s['note'] = 'พื้น GS ภายนอก หนา 0.12 บนทรายหยาบ 0.10 · ขอบนอกพับลงลึกเพิ่ม 0.12 (ความกว้างขอบพับวัดจากรูป ~0.25–0.40) · แยกจากคานด้วยร่อง 1–2.5 ซม. ยาแนวกันซึม'
    elif s['id'] in ('S-RAMP', 'S-LAND'):
        s['t'] = 0.10; s['src'] += ' + S.3.02 แบบขยายทางลาด'
        s['note'] = (s.get('note', '') + ' · ' if s.get('note') else '') + 'โครงทางลาด คสล. แบบกล่อง: พื้นบน 0.10 + ผนังข้าง 0.10 + พื้นล่าง 0.10 ใส่ทรายหยาบอัดแน่นข้างใน (S.3.02) — เหล็ก = Step 3'
    else:
        s['t'] = 0.12; s['src'] += ' + S.2.02 (GS) + S.3.02 แบบขยายพื้น GS (ภายใน)'
        if s['top'] > 0.21:
            s['t'] = 0.17; s['status'] = US
            s['note'] = 'พื้น GS ภายใน หนา 0.17 (0.12 + เพิ่ม 0.05 ให้ถึงระดับ +0.25 · หลังคานคอดินคงที่ +0.20 — Earth 1 พ.ย.) วางบนทรายหยาบอัดแน่น 0.10 · Wire Mesh Ø4 @0.20 = Step 3'
        else:
            s['note'] = 'พื้น GS ภายใน หนา 0.12 วางบนทรายหยาบอัดแน่น 0.10 ระหว่างคานคอดิน (หลังพื้นเท่าหลังคาน) · ตะแกรง Wire Mesh Ø4 @0.20 = Step 3'
row('พื้น', 'S-WCM / S-WCF', 'พื้น GS ภายใน หนา 0.12 บนทรายหยาบ 0.10 ระหว่างคานคอดิน (+0.20)', 'S.2.02, S.3.02', FD)
row('พื้น', 'S-DIS / S-ENT', 'พื้น GS +0.25 หนา 0.17 (เพิ่มพื้น 0.05 · หลังคานเท่ากัน +0.20)', 'S.2.02, S.3.02', US, 'Earth 1 พ.ย.')
row('พื้น', 'S-WK-…', 'พื้น GS ภายนอก (ทางเดินรอบอาคาร) หนา 0.12 ขอบนอกพับลง 0.12 แยกจากคานด้วยร่องยาแนว', 'S.3.02', FD, 'ความกว้างขอบพับวัดจากรูป (ไม่มีระยะ)')
row('พื้น', 'S-RAMP / S-LAND', 'ทางลาด คสล. แบบกล่อง พื้นบน/ผนัง/พื้นล่าง หนา 0.10 ใส่ทรายอัดแน่น', 'S.3.02', FD)

# ---------------------------------------------------------------- โครงหลังคาเหล็ก
t = 0.40 / 5.80
P = lambda y: 3.70 - y * t                 # ระนาบหลังโครง (หลังอะเส/คอร์ดบน) — แถว A +3.70 · แถว C +3.30
ROOF = m['roofs'][0]
STACK = 0.10 + 0.025                        # จันทัน C-100 (0.10) + แปกล่องวางแบน (0.025)
ROOF['eave'] = round(P(6.90) + STACK, 3)
ROOF['note'] = ROOF['note'].replace('ผิวแผ่นหลังคาสูงกว่าระนาบโครง 0.10 (จันทัน C-100 + แปกล่อง 50x25)', 'ผิวแผ่นหลังคาสูงกว่าระนาบโครง 0.125 (จันทัน C-100 สูง 0.10 + แปกล่อง 50x25 วางแบน 0.025 — Step 2)')
import re
ROOF['note'] = re.sub(r'ขอบต่ำ \+[\d.]+ ขอบสูง \+[\d.]+', f'ขอบต่ำ +{ROOF["eave"]:.3f} ขอบสูง +{ROOF["eave"] + 8.0 * t:.3f}', ROOF['note'])
ROOF['purlin'] = {'section': 'BOX50x25x2.0', 'spacing': 1.00}
ROOF['rafter'] = {'section': 'C100x50x20x2.3', 'spacing': 1.08}
X0, X1 = -1.10, 11.90
# อะเสแถว C (2C) ยื่นถึงชายคา · อะเสแถว B ระดับหัวเสา (2C) กริด 1–4
zc = 3.30 - 0.05
mem('RB-C', '1', 'steel_beam', (X0, 5.80, zc), (X1, 5.80, zc), '2C100x50x20x2.3', 'CF', 'S.2.03 ข้อ 1 อะเสเหล็ก 2C-100x50x20x2.3 (แนว C ยื่นถึงขอบชายคา)',
    note='อะเสแถว C หลัง +3.30 ยาวตลอดถึงขอบชายคาสองข้าง')
mem('RB-B', '1', 'steel_beam', (0.0, 1.50, zc), (10.80, 1.50, zc), '2C100x50x20x2.3', 'CF', 'S.2.03 ข้อ 1 (แนว B กริด 1–4 บนหัวเสา)', note='อะเสแถว B ระดับหัวเสา หลัง +3.30')
for k, x in ((1, -0.075), (4, 10.875)):
    mem(f'RB-{k}', '2', 'steel_beam', (x, 1.50, zc), (x, 5.80, zc), 'C100x50x20x2.3', 'CF', f'S.2.03 ข้อ 2 อะเสเหล็ก C-100x50x20x2.3 (แนวกริด {k} ระหว่าง B–C)', note=f'อะเสแนวกริด {k} B–C หลัง +3.30 (DXF เยื้องออกนอกกริด 0.075)')
# ดั้ง CX ที่แถว B + อะเสบนแถว B รับจันทัน
zb_top = P(1.50); zb = zb_top - 0.05
for gx in '1234':
    x = GX[gx]
    mem(f'CX-{gx}B', 'CX', 'steel_column', (x, 1.50, 3.30), (x, 1.50, round(zb - 0.05, 3)), '2C100x50x20x2.3', 'CF', 'S.2.03 สัญลักษณ์ CX ดั้งเหล็ก 2C-100x50x20x2.3',
        note=f'ดั้งบนหัวเสา {gx}B จาก +3.30 ถึงใต้อะเสบน ({zb - 0.05:+.3f})')
mem('RB-B2', '1', 'steel_beam', (X0, 1.50, round(zb, 3)), (X1, 1.50, round(zb, 3)), '2C100x50x20x2.3', 'CF', 'S.2.04 แปลนอะเสรับโครงหลังคา ข้อ 1 (แนว B ยื่นถึงขอบชายคา)',
    note=f'อะเสบนแถว B บนดั้ง CX หลัง {zb_top:+.3f} (ตามระนาบหลังคาลาด) รับจันทัน')
# TRUSS T1 แนว A: ลึก 0.40 (+3.30 → +3.70) · ช่อง 4EQ / 2EQ / 4EQ
zt, zbt = 3.70 - 0.0375, 3.30 + 0.0375
PX = [0.0] + [4.20 / 4 * k for k in range(1, 5)] + [4.20 + 2.30 / 2 * k for k in range(1, 3)] + [6.50 + 4.30 / 4 * k for k in range(1, 5)]
PX = [round(v, 4) for v in PX]
mem('T1-TC', 'T1', 'truss_chord', (X0, 0.0, zt), (X1, 0.0, zt), 'BOX75x75x3.2', 'CF', 'S.2.04 แบบขยายโครง TRUSS T1 (คอร์ดบนเหล็กกล่อง 75x75x3.2 ยื่นถึงขอบชายคา)', note='คอร์ดบน หลัง +3.70')
for k, (a, b) in enumerate(zip(PX, PX[1:]), 1):
    mem(f'T1-BC{k:02d}', 'T1', 'truss_chord', (a, 0.0, zbt), (b, 0.0, zbt), 'BOX75x75x3.2', 'CF', 'S.2.04 (คอร์ดล่าง 75x75x3.2)', note='คอร์ดล่าง ท้อง +3.30 บนหัวเสา 1A / 4A')
for k, x in enumerate(PX):
    end = k in (0, len(PX) - 1)
    mem(f'T1-V{k:02d}', 'T1', 'truss_web', (x, 0.0, zbt), (x, 0.0, zt), 'BOX75x75x3.2' if end else 'BOX38x38x1.6', 'CF', 'S.2.04 (ตั้ง' + ('ปลาย 75x75x3.2)' if end else ' 38x38x1.6)'))
mid = len(PX) // 2
for k, (a, b) in enumerate(zip(PX, PX[1:])):
    lo, hi = ((a, zbt), (b, zt)) if k % 2 == 0 else ((b, zbt), (a, zt))   # ฟันปลา: ช่องคี่ขึ้น ช่องคู่ลง (ล่างที่กริด 1 2 3 4)
    mem(f'T1-D{k + 1:02d}', 'T1', 'truss_web', (lo[0], 0.0, lo[1]), (hi[0], 0.0, hi[1]), 'BOX38x38x1.6', 'CF', 'S.2.04 แบบขยาย T1 (ทแยง 38x38x1.6 ฟันปลา)')
# จันทัน C-100 @1.08 (13 ตัว ตาม S.2.05) แบ่งช่วงที่จุดรองรับ
RX = [-1.0625] + [round(1.08 * k, 3) for k in range(11)] + [11.8625]
YS = [-1.10, 0.0, 1.50, 5.80, 6.90]
for i, x in enumerate(RX, 1):
    for k, (a, b) in enumerate(zip(YS, YS[1:]), 1):
        mem(f'RF-{i:02d}{"abcd"[k - 1]}', '3', 'rafter', (x, a, round(P(a) + 0.05, 3)), (x, b, round(P(b) + 0.05, 3)), 'C100x50x20x2.3', 'CF',
            'S.2.05 แปลนโครงสร้างหลังคา ข้อ 3 จันทันเหล็ก C-100x50x20x2.3 @1.08', note='จันทันวางบนอะเส/คอร์ดบน · ตัวริมสุดอยู่หลังเชิงชาย' if i in (1, len(RX)) else '')
row('หลังคา', 'RB-C / RB-B / RB-1 / RB-4', 'อะเส +3.30: แถว C 2C-100x50 ยื่นถึงชายคา · แถว B 2C บนหัวเสา · แนวกริด 1 / 4 C-100x50 (B–C)', 'S.2.03', FD)
row('หลังคา', 'CX-1B…4B + RB-B2', f'ดั้ง 2C-100x50 บนหัวเสาแถว B + อะเสบนแถว B 2C ยื่นถึงชายคา (หลัง {zb_top:+.3f} ตามลาดหลังคา)', 'S.2.03, S.2.04', FD)
row('หลังคา', 'T1-…', 'TRUSS T1 แนว A ช่วง 10.80 ลึก 0.40 (+3.30 → +3.70) ช่อง 4/2/4 · คอร์ด+ตั้งปลาย กล่อง 75x75x3.2 · ท่อนกลาง 38x38x1.6 · คอร์ดบนยื่นถึงชายคา', 'S.2.04', FD,
    'ทแยงฟันปลาสลับขึ้น-ลงทุกช่อง (มุมล่างตรงกริด 1 2 3 4) + ตั้งทุกจุดต่อ')
row('หลังคา', 'RF-…', f'จันทัน C-100x50x20x2.3 @1.08 จำนวน {len(RX)} ตัว (x −1.06 … 11.86) ยาวตลอด y −1.10 → 6.90 แบ่งช่วงที่ T1 / อะเสบน B / อะเส C', 'S.2.05', FD)
row('หลังคา', 'แป', 'แปเหล็กกล่อง 50x25x2.0 @1.00 (9 แถว) — สร้างจากข้อกำหนดหลังคา', 'S.2.05', FD)
row('หลังคา', 'R1', f'ระดับแผ่นหลังคาไล่จากโครง: ระนาบหลังอะเส/คอร์ดบน → จันทัน C-100 (+0.10) → แปกล่อง 50x25 วางแบน (+0.025) → แผ่นเมทัลชีทบนแป · ขอบชายคาต่ำ +{ROOF["eave"]:.3f}', 'S.2.03–S.2.05 + รูปขยายชายคา A.4.01', US,
    'Earth 1 พ.ย.: แผ่นหลังคาอยู่บนแป ต้องไล่ระดับจากจันทัน แป แล้วจึงเป็นแผ่น · รูปขยายชายคาเขียนแปกล่องวางแบนบนจันทัน')

# ---------------------------------------------------------------- ทับหลัง / คานเอ็น / เสาเอ็นเพิ่ม (มาตรฐาน Earth 21 ต.ค. — ใช้กับ ท12 ตามที่ยืนยัน 1 พ.ย.)
#  ทับหลัง/คานเอ็น คสล. 0.10 (หนาเท่าผนัง) × 0.10 · RB6 2 เส้น ปลอก RB6@0.20 · ยื่นเลยขอบช่องข้างละ 0.20 (ไม่เกินปลายผนัง)
#  ก. ปลายผนังลอยไม่ติดเสา → เสาเอ็น  ข. ผนังยาวเกิน 3 ม. → เสาเอ็นแบ่งช่วง ≤ 3 ม.  ค. ผนังสูงเกิน 3 ม. → คานเอ็นกลางความสูง (เว้นช่วงช่องเปิด)
SEC.append({'id': 'RC-10x10', 'kind': 'rc_rect', 'b': 0.10, 'h': 0.10, 'status': US, 'src': 'มาตรฐานเสาเอ็น/ทับหลังของ Earth (21 ต.ค.)'}) if not any(x['id'] == 'RC-10x10' for x in SEC) else None
MAS = ('brick_mon', 'brick_mon_full', 'aac', 'block', 'block_07')
OTs = m['opening_types']; opsw = collections.defaultdict(list)
for o in m['openings']: opsw[o['wall']].append(o)
vert = [(N[x['i']]['x'], N[x['i']]['y']) for x in m['members'] if x['type'] in ('stiffener', 'column') and abs(N[x['i']]['x'] - N[x['j']]['x']) < 1e-6 and N[x['j']]['z'] > 0.3]
STD = 'มาตรฐาน Earth (21 ต.ค. · ใช้กับ ท12 1 พ.ย.)'
nl = ns = nst = ne = nsp = nh = 0
def wgeo(w):
    a_, b_ = w['path']; L = math.dist(a_, b_); ux, uy = (b_[0] - a_[0]) / L, (b_[1] - a_[1]) / L
    return a_, L, ux, uy, (lambda u: (round(a_[0] + ux * u, 3), round(a_[1] + uy * u, 3)))
for w in m['walls']:
    if w['kind'] not in MAS or w['id'] not in opsw: continue
    a_, L, ux, uy, Pw = wgeo(w); ops = opsw[w['id']]
    for o in ops:
        t_ = OTs[o['type']]; u0, u1 = o['at'] - t_['w'] / 2, o['at'] + t_['w'] / 2
        sill = t_.get('sill', 0); ztop = w['bottom'] + sill + t_['h'] + (t_['w'] / 2 if t_.get('shape') == 'arch' else 0)
        e0, e1 = max(0, u0 - 0.20), min(L, u1 + 0.20)
        if w['top'] - ztop >= 0.10 - 1e-6:
            nl += 1; z = round(ztop + 0.10, 3)
            mem(f'LT-{nl:02d}', 'ทับหลัง', 'lintel', (*Pw(e0), z), (*Pw(e1), z), 'RC-10x10', 'C', f'{STD} · เหนือ {o["id"]}', US, note='ทับหลัง 0.10×0.10 หลังทับหลังอยู่ที่ระดับนี้ · เหล็ก RB6 2 เส้น ปลอก RB6@0.20')
        if sill > 1e-6:
            ns += 1; z = round(w['bottom'] + sill, 3)
            mem(f'LS-{ns:02d}', 'คานเอ็น', 'lintel', (*Pw(e0), z), (*Pw(e1), z), 'RC-10x10', 'C', f'{STD} · ใต้ {o["id"]}', US, note='คานเอ็นใต้ช่อง (ธรณี) 0.10×0.10 · เหล็ก RB6 2 เส้น ปลอก RB6@0.20')
        for u in (u0 - 0.05, u1 + 0.05):
            if u < 0.05 or u > L - 0.05: continue
            xy = Pw(u)
            if any(math.dist(xy, v) <= 0.15 for v in vert): continue
            nst += 1
            mem(f'SA-{nst:02d}', 'เสาเอ็น', 'stiffener', (*xy, w['bottom']), (*xy, w['top']), 'RC-10x10', 'C', f'{STD} · ข้าง {o["id"]}', US, note='เสาเอ็นข้างช่องเปิด (ไม่มีในแปลน)')
            vert.append(xy)
def in_open(w, u, z=None):
    for o in opsw.get(w['id'], []):
        t_ = OTs[o['type']]
        if o['at'] - t_['w'] / 2 - 0.05 <= u <= o['at'] + t_['w'] / 2 + 0.05:
            if z is None: return True
            z0 = w['bottom'] + t_.get('sill', 0); z1 = z0 + t_['h'] + (t_['w'] / 2 if t_.get('shape') == 'arch' else 0)
            if z0 - 0.05 <= z <= z1 + 0.05: return True
    return False
for w in m['walls']:
    if w['kind'] not in MAS or w.get('rise') or w['top'] - w['bottom'] < 0.5: continue
    a_, L, ux, uy, Pw = wgeo(w)
    for u in (0.05, L - 0.05):   # ก. ปลายลอย
        xy = Pw(u)
        if not any(math.dist(xy, v) <= 0.16 for v in vert):
            ne += 1
            mem(f'SE-{ne:02d}', 'เสาเอ็น', 'stiffener', (*xy, w['bottom']), (*xy, w['top']), 'RC-10x10', 'C', f'{STD} · ปลายผนัง {w["id"]} ไม่ติดเสา', US)
            vert.append(xy)
    us = sorted(min(max((v[0] - a_[0]) * ux + (v[1] - a_[1]) * uy, 0), L) for v in vert
                if abs((v[0] - a_[0]) * uy - (v[1] - a_[1]) * ux) <= 0.10 and -0.16 <= (v[0] - a_[0]) * ux + (v[1] - a_[1]) * uy <= L + 0.16)
    for u0, u1 in zip(us, us[1:]):   # ข. ช่วงยาวเกิน 3 ม.
        g = u1 - u0
        if g > 3.0 + 1e-6:
            n = math.ceil(g / 3.0)
            for k in range(1, n):
                u = u0 + g * k / n
                if in_open(w, u): continue
                nsp += 1; xy = Pw(u)
                mem(f'SM-{nsp:02d}', 'เสาเอ็น', 'stiffener', (*xy, w['bottom']), (*xy, w['top']), 'RC-10x10', 'C', f'{STD} · {w["id"]} ช่วงยาว {g:.2f} ม. > 3 ม.', US)
                vert.append(xy)
    H = w['top'] - w['bottom']
    if H > 3.0 + 1e-6:   # ค. สูงเกิน 3 ม.
        z = round((w['bottom'] + H / 2) * 20) / 20
        cuts = [0.0, L]
        for o in opsw.get(w['id'], []):
            t_ = OTs[o['type']]
            if in_open(w, o['at'], z): cuts += [max(0, o['at'] - t_['w'] / 2), min(L, o['at'] + t_['w'] / 2)]
        cuts = sorted(cuts)
        for u0, u1 in zip(cuts[0::2], cuts[1::2]):
            if u1 - u0 >= 0.20:
                nh += 1
                mem(f'LH-{nh:02d}', 'คานเอ็น', 'lintel', (*Pw(u0), z), (*Pw(u1), z), 'RC-10x10', 'C', f'{STD} · {w["id"]} สูง {H:.2f} ม. > 3 ม.', US, note='คานเอ็นกลางความสูง')
for x in m['members']:
    if x['type'] in ('stiffener', 'lintel') and 'RB6' not in (x.get('note') or ''):
        x['note'] = ((x.get('note') or '') + ' · เหล็ก RB6 2 เส้น ปลอก RB6@0.20 (มาตรฐาน Earth)').strip(' ·')
row('ทับหลัง', f'LT-01…LT-{nl:02d}', f'ทับหลัง คสล. 0.10×0.10 เหนือช่องเปิดในผนังก่อ {nl} ท่อน ยื่นเลยขอบช่องข้างละ 0.20', STD, US)
row('ทับหลัง', f'LS-01…LS-{ns:02d}', f'คานเอ็นใต้ช่องที่ยกจากพื้น (บล็อกช่องลม/บล็อกแก้ว) {ns} ท่อน', STD, US)
row('ทับหลัง', f'LH-01…LH-{nh:02d}' if nh else 'LH (ไม่มี)', f'ผนังสูงเกิน 3 ม. → คานเอ็นกลางความสูง {nh} ท่อน (เว้นช่วงช่องเปิด)', STD, US)
row('เสาเอ็น', 'SA / SE / SM', f'เสาเอ็นเพิ่ม: ข้างช่องเปิด {nst} · ปลายผนังลอย {ne} · แบ่งช่วงผนังยาวเกิน 3 ม. {nsp} ต้น — ทั้ง 4 ต้นตรงกับบล็อกเสาเอ็นแบบ dynamic ในแปลน (*U1149 ข้างช่องบล็อกกริด 1/4 · *U1150 ปลายผนังข้างเสา 1A/4A) ที่ Step 1 อ่านตกไป', STD, FD,
    '**มาร์ก:** รายการประกอบแบบ ท12 เขียนปลอกเอ็น RB6@0.15 — ใช้ตามมาตรฐาน Earth @0.20')
for x in m['members']:   # เสาเอ็นที่กฎเพิ่มให้ ตรงกับบล็อกเสาเอ็นแบบ dynamic ในแปลน (*U1149 / *U1150) ที่ Step 1 ไม่ได้นับ
    if x['id'] in ('SA-01', 'SA-02', 'SE-01', 'SE-02'):
        x['status'] = FD; x['src'] = 'A.2.01 (บล็อก clom_n แบบ dynamic *U1149 / *U1150) + ' + STD
        x['note'] = 'ตรงกับเสาเอ็นในแปลน (บล็อก dynamic ที่ Step 1 อ่านตกไป) · ' + x.get('note', '')
print('lintel', nl, 'sill', ns, 'side', nst, 'free-end', ne, 'span', nsp, 'mid', nh)

# ---------------------------------------------------------------- บันทึก
m['meta']['name'] = 'ห้องน้ำ ท12 — Step 2 โครงสร้าง'; m['meta']['stage'] = 2
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 2)', 'sections': ['supports', 'members', 'sections', 'slabs', 'roofs'],
                     'note': 'อ่านโครงสร้าง S.2.01–S.3.02: ฐานราก ตอม่อ คานคอดิน พื้น GS โครงหลังคาเหล็ก'})
json.dump(m, open('stage2.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage2_rows.json', 'w'), ensure_ascii=False, indent=1)
print(len(sup), 'footings', nb, 'beam spans', sum(1 for x in m['members'] if x['type'] == 'rafter'), 'rafter spans', len(m['members']), 'members', 'eave', ROOF['eave'])
