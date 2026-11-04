# Step 3 เหล็กเสริม — ห้องน้ำ ท12 (ต่อจาก Step 2)
# แผ่น: S.3.01 แบบขยายฐานราก F1 / F2 + แผ่นเหล็กหัวเสา · S.3.02 ตารางเสา C1/ตอม่อ · คาน B1/B2 · พื้น GS ใน/นอก · ทางลาด
# เสาเอ็น/ทับหลัง/คานเอ็น: คิดเป็นเมตร (ราคาวัสดุมวลรวม) ไม่ใส่เหล็ก (Earth 4 พ.ย.) — รายละเอียด 2-RB9 ปลอก RB9@0.20 อยู่ใน note ชิ้น
import json, math, datetime
FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('../s2/stage2.bm.json'))
d = m['design'] = {'members': {}, 'supports': {}, 'slabs': {}, 'walls': {}, 'plates': {}, 'stairs': {}}
N = {n['id']: n for n in m['nodes']}
rows = []
def row(cat, id_, desc, src, st=FD, note=''): rows.append((cat, id_, desc, src, st, note))
R3 = lambda v: [round(c, 3) for c in v]

# ---------------------------------------------------------------- ฐานราก (S.3.01)
# F1 1.20×1.20×0.25: 9-DB12 @0.15 สองทาง · F2 0.90×0.90×0.25: 5-DB12 @0.20 สองทาง · RB9 รัดรอบ 1 วง
# DOWEL BAR 4-DB16 ระยะทาบ 0.65: ขางอบนตะแกรง 0.25 + ในฐาน (0.25 − 0.075) + ทาบเหนือหลังฐาน 0.65 = 1.075 ม./เส้น
DOWEL_L = round(0.25 + (0.25 - 0.075) + 0.65, 3)
for s in m['supports']:
    if s['mark'] == 'F1':
        rb = {'bars_x': [9, 12], 'bars_y': [9, 12], 'bend_up': s['h'], 'rings': [1, 9], 'dowel': [4, 16, DOWEL_L]}
        src = 'S.3.01 F1: 9-DB12 @0.15 สองทาง · RB9 รัดรอบ · DOWEL 4-DB16 ทาบ 0.65'
    else:
        rb = {'bars_x': [5, 12], 'bars_y': [5, 12], 'bend_up': s['h'], 'rings': [1, 9], 'dowel': [4, 16, DOWEL_L]}
        src = 'S.3.01 F2: 5-DB12 @0.20 สองทาง · RB9 รัดรอบ · DOWEL 4-DB16 ทาบ 0.65'
    d['supports'][s['id']] = {'rebar': rb, 'status': FD, 'src': src,
                              'note': f'เหล็กเดือยยาว {DOWEL_L:.3f} ม./เส้น (ขางอ 0.25 + ในฐาน 0.175 + ทาบ 0.65 — ความยาวขางอวัดจากรูป) · ปลายตะแกรงงอขึ้นเท่าความหนาฐาน 0.25 ต่อปลาย (หลักเกณฑ์: คำนวณเหล็กเสริมตามขนาดของฐานราก — Earth 4 พ.ย.) · RB9 รัดรอบ 1 วงที่มุมบนในขอ'}
row('ฐานราก', 'F1-1B…4C (8 ฐาน)', '9-DB12 @0.15 สองทาง ปลายงอขึ้นเท่าความหนาฐาน 0.25 · RB9 รัดรอบ 1 วง · เดือย 4-DB16 ยาว 1.075', 'S.3.01', US, 'ปลายงอ = ความหนาฐาน (Earth 4 พ.ย.) · ความยาวขาเดือยวัดจากรูป')
row('ฐานราก', 'F2-1A…4A (4 ฐาน)', '5-DB12 @0.20 สองทาง ปลายงอขึ้นเท่าความหนาฐาน 0.25 · RB9 รัดรอบ 1 วง · เดือย 4-DB16 ยาว 1.075', 'S.3.01', US, 'ปลายงอ = ความหนาฐาน (Earth 4 พ.ย.) · ความยาวขาเดือยวัดจากรูป')

# ---------------------------------------------------------------- เสา / ตอม่อ (S.3.02 แบบขยายเสา C1)
nped = ncol = 0
for x in m['members']:
    if x['type'] != 'column': continue
    if x['id'].startswith('PD-'):
        nped += 1
        d['members'][x['id']] = {'rebar': {'main': [8, 16], 'stirrup': [6, 0.25]}, 'status': FD, 'src': 'S.3.02 C1 ช่วงตอม่อ 0.30×0.30: 8-DB16 · RB6 @0.25'}
    else:
        ncol += 1
        d['members'][x['id']] = {'rebar': {'main': [4, 16], 'stirrup': [6, 0.20]}, 'status': FD,
                                 'src': 'S.3.02 C1 ช่วงพื้นห้องน้ำ–อะเส 0.20×0.20: 4-DB16 · RB6 @0.20' + (' (ช่วงจุดต่อคานคอดิน)' if x['id'].endswith('j') else '')}
row('เสา', f'PD-… ({nped} ต้น)', 'ตอม่อ 0.30×0.30: 8-DB16 · ปลอก RB6 @0.25', 'S.3.02')
row('เสา', f'C-… / C-…j ({ncol} ชิ้น)', 'เสา C1 0.20×0.20: 4-DB16 · ปลอก RB6 @0.20 (รวมช่วงจุดต่อคานคอดิน)', 'S.3.02')

# ---------------------------------------------------------------- คานคอดิน (S.3.02 แบบขยายคาน)
BM = {'B1': {'top': [2, 16], 'bot': [3, 16], 'stirrup': [6, 0.15]}, 'B2': {'top': [2, 16], 'bot': [2, 16], 'stirrup': [6, 0.15]}}
nb = {'B1': 0, 'B2': 0}
for x in m['members']:
    if x['type'] == 'tie_beam' and x['mark'] in BM:
        nb[x['mark']] += 1
        d['members'][x['id']] = {'rebar': dict(BM[x['mark']]), 'status': FD, 'src': f"S.3.02 แบบขยายคาน {x['mark']}"}
row('คาน', f'GB B1 ({nb["B1"]} ช่วง)', '0.20×0.40: บน 2-DB16 · ล่าง 3-DB16 · ปลอก RB6 @0.15', 'S.3.02')
row('คาน', f'GB B2 ({nb["B2"]} ช่วง)', '0.20×0.40: บน 2-DB16 · ล่าง 2-DB16 · ปลอก RB6 @0.15', 'S.3.02')

# ---------------------------------------------------------------- พื้น GS (S.3.02)
for s in m['slabs']:
    sid = s['id']
    if sid.startswith('S-WK'):   # ภายนอก: RB6 @0.25 # ชั้นเดียว · ปลายงอลงที่ขอบพับ
        d['slabs'][sid] = {'rebar': {'mesh': [6, 0.25, 1], 'bend': {'L': 0.17, 'sides': s['edge_thicken']['sides']}}, 'status': FD,
                           'src': 'S.3.02 แบบขยายพื้น GS (ภายนอก): RB6 @0.25 · ปลายงอลงในขอบพับ', 'note': 'ปลายงอยาว 0.17 วัดจากรูป (หนา 0.12 + ขอบพับ 0.12 − ระยะหุ้ม)'}
    elif sid in ('S-RAMP', 'S-LAND'):
        d['slabs'][sid] = {'rebar': {'wire_mesh': 'WM-4@0.20'}, 'status': FD, 'src': 'S.3.02 แบบขยายทางลาด: พื้นบน WIRE MESH Ø4.00 มม. @0.20#'}
    elif sid == 'S-RB':
        pass   # กล่องทางลาด — ด้านล่าง
    else:
        d['slabs'][sid] = {'rebar': {'wire_mesh': 'WM-4@0.20'}, 'status': FD, 'src': 'S.3.02 แบบขยายพื้น GS (ภายใน): WIRE MESH Ø4.00 มม. @0.20#'}
row('พื้น', 'S-WCM / S-WCF / S-DIS / S-ENT', 'Wire Mesh Ø4 มม. @0.20 (ตร.ม.)', 'S.3.02')
row('พื้น', 'S-WK-… (5 ผืน)', 'RB6 @0.25 ตะแกรงชั้นเดียว · ปลายงอลงขอบพับ 0.17', 'S.3.02', FD, 'ความยาวงอวัดจากรูป')

# ---------------------------------------------------------------- กล่องทางลาด (S.3.02 แบบขยายทางลาด) — ผูกกับพื้นล่าง S-RB เป็น extra_bars (วาด 3D + ถอดปริมาณ)
# ปลอกตามขวาง RB9 @0.20 สองวง: วงนอก (พื้นบน–ผนังนอก–พื้นล่าง–ผนังใน) · วงใน (รอบช่องทราย) · เหล็กตามยาวพื้นล่าง RB12 @0.20
RX0, RX1, RXL = 3.0, 6.6, 5.4
ztop = lambda x: 0.05 + (min(x, RXL) - RX0) / 12
CV = 0.03
YO, YI = -1.10 + CV, -0.15 - CV + 0.0        # วงนอก: ผิวนอกผนังนอก / ผิวนอกผนังใน
YO2, YI2 = -1.00 - CV, -0.25 + CV            # วงใน: ผิวในผนัง
ex = []
def bar(label, dia, a, b, kind=None): ex.append(dict({'label': label, 'dia': dia, 'a': R3(a), 'b': R3(b)}, **({'kind': kind} if kind else {})))
xk = RX0 + 0.10
nho = nhi = 0
while xk < RX1 - 0.05:
    zt = ztop(xk) - CV; zb = -0.10 + CV
    nho += 1
    for a, b in (((xk, YI, zt), (xk, YO, zt)), ((xk, YO, zt), (xk, YO, zb)), ((xk, YO, zb), (xk, YI, zb)), ((xk, YI, zb), (xk, YI, zt))):
        if math.dist(a, b) > 0.02: bar('ทางลาด ปลอกวงนอก RB9 @0.20', 9, a, b)
    zt2 = ztop(xk) - 0.10 + CV; zb2 = 0.0 - CV
    if zt2 - zb2 >= 0.04 and xk < RX1 - 0.10:   # วงใน: มีช่องทรายพอ (x > 3.6)
        nhi += 1
        for a, b in (((xk, YI2, zt2), (xk, YO2, zt2)), ((xk, YO2, zt2), (xk, YO2, zb2)), ((xk, YO2, zb2), (xk, YI2, zb2)), ((xk, YI2, zb2), (xk, YI2, zt2))):
            bar('ทางลาด ปลอกวงใน RB9 @0.20', 9, a, b)
    xk = round(xk + 0.20, 3)
ys = [round(YO + k * 0.20, 3) for k in range(0, 5)]
for y in ys:
    bar('ทางลาด เหล็กตามยาวพื้นล่าง RB12 @0.20', 12, (RX0 + CV, y, -0.10 + CV + 0.012), (RX1 - CV, y, -0.10 + CV + 0.012), kind='RB')
d['slabs']['S-RB'] = {'rebar': {'extra_bars': ex}, 'status': FD,
                     'src': 'S.3.02 แบบขยายทางลาด: ปลอก RB9 @0.20 (2 วง) · RB12 @0.20 พื้นล่าง',
                     'note': f'เหล็กกล่องทางลาดทั้งหมดผูกที่พื้นล่าง: ปลอกวงนอก {nho} วง · วงใน {nhi} วง (เฉพาะช่วงที่มีช่องทราย x > 3.60) · ตามยาว RB12 {len(ys)} เส้น · ระยะหุ้ม 0.03 · ไม่รวมเหล็กในคันทางลาด (2 เส้น + ปลอก ในรูป — คันถอดเป็นผนัง other)'}
for w in m['walls']:
    if w['kind'] == 'rc':
        d['walls'][w['id']] = {'status': FD, 'src': 'S.3.02 — เหล็กผนังกล่องทางลาดรวมอยู่ในปลอก RB9 ที่ผูกกับพื้นล่าง S-RB'}
row('ทางลาด', 'S-RB (กล่องทางลาด)', f'ปลอก RB9 @0.20 วงนอก {nho} วง + วงใน {nhi} วง · RB12 @0.20 ตามยาวพื้นล่าง {len(ys)} เส้น · พื้นบน Wire Mesh Ø4 @0.20', 'S.3.02', FD,
    'ตำแหน่ง RB9 2 ป้ายในรูป = ปลอกสองวง (ตีความจากรูปตัด) · คันทางลาดไม่คิดเหล็ก')

# ---------------------------------------------------------------- เสาเอ็น / ทับหลัง / คานเอ็น
nl = sum(1 for x in m['members'] if x['type'] in ('stiffener', 'lintel'))
row('เสาเอ็น/ทับหลัง', f'ST / SA / SE / SM / LT / LS / LH ({nl} ชิ้น)', 'คิดเป็นเมตร (เสาเอ็น-ทับหลัง คสล. ราคาวัสดุมวลรวม) ไม่ใส่เหล็ก · รายละเอียดก่อสร้าง 2-RB9 ปลอกลูกโซ่ RB9@0.20', 'A-19 / A-20', US, 'Earth 4 พ.ย.')

# ---------------------------------------------------------------- แผ่นเหล็กหัวเสา (S.3.01) — ยังไม่มีในการถอดปริมาณ
for x in m['members']:
    if x['type'] == 'column' and x['id'].startswith('C-') and not x['id'].endswith('j'):
        top = x['j'] if N[x['j']]['z'] >= N[x['i']]['z'] else x['i']
        d['plates'][top] = {'plate': [200, 200, 9], 'bolts': [4, 10, 30], 'status': FD, 'src': 'S.3.01 แบบขยายแผ่นเหล็กหัวเสา: Plate 200×200×9 มม. + J-Bolt ชุบกัลวาไนซ์ 10×300 มม. 4 ตัว'}
row('เพลทหัวเสา', f'{len(d["plates"])} จุด (หัวเสา C1)', 'Plate 200×200×9 มม. + J-Bolt 10×300 มม. ×4', 'S.3.01', FD, 'ใส่ใน design.plates')

m['meta']['name'] = 'ห้องน้ำ ท12 — Step 3 เหล็กเสริม'; m['meta']['stage'] = 3
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 3)', 'sections': ['design'],
                     'note': 'อ่านเหล็กเสริม S.3.01–S.3.02: ฐานราก เสา/ตอม่อ คานคอดิน พื้น GS กล่องทางลาด แผ่นเหล็กหัวเสา'})
json.dump(m, open('stage3.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage3_rows.json', 'w'), ensure_ascii=False, indent=1)
print('supports', len(d['supports']), 'members', len(d['members']), 'slabs', len(d['slabs']), 'walls', len(d['walls']), 'plates', len(d['plates']), 'ramp bars', len(ex), 'hoops', nho, nhi)
