# ขั้น 3 เหล็กเสริม — ต่อจาก stage2.bm.json
# อ่าน: S.3.01 (ฐานราก F1/F2 + แผ่นเหล็กหัวเสา) · S.3.02 (เสา C1 / คาน B1–B3 / พื้น GS / ทางลาด) · A.0.01 (เสาเอ็น-ทับหลัง ตกลงกับ Earth)
import json, sys, subprocess, collections
sys.path.insert(0, '/home/claude/UD-Total-Station/tools')
import takeoff as T

FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage2.bm.json'))
d = m['design'] = {'members': {}, 'supports': {}, 'slabs': dict(m['design'].get('slabs', {})), 'plates': {}}
rows = []   # (ชิ้น, แบบเขียนว่า, โมเดลมี, แผ่น, สถานะ, หมายเหตุ)
def row(*a): rows.append(a)

# ---------------------------------------------------------------- ฐานราก (S.3.01)
for s in m['supports']:
    n = 7 if s['mark'] == 'F1' else 5
    bend = 0.30 if s['mark'] == 'F1' else 0.25
    d['supports'][s['id']] = {'rebar': {'bars_x': [n, 12], 'bars_y': [n, 12], 'bend_up': s['h'], 'dowel': [4, 16, round(bend + 0.13 + 0.64, 2)], 'rings': [1, 9]},
                              'status': FD, 'src': 'S.3.01 รูปตัด (DB12 — Earth ยืนยัน) · Dowel 4-DB16 · RB9 รัดรอบ'}
row('ฐานราก F1 × 8', 'ตะแกรง 7-DB12 @0.20 สองทาง ปลายหักขึ้นสองด้าน (รูปตัด) · Dowel 4-DB16 งอฉาก 0.30 · RB9 รัดรอบ', 'bars_x/y 7-DB12 + หักขึ้น 2×0.20 (ความหนาฐาน) · dowel 4-DB16 ยาว 1.07 ต่อเส้น · RB9 1 วง',
    'S.3.01', US, 'แปลนขยายเขียน 7-DB16 แต่รูปตัดเขียน DB12 → ใช้ DB12 (Earth ยืนยัน)')
row('ฐานราก F2 × 4', 'ตะแกรง 5-DB12 @0.20 สองทาง ปลายหักขึ้นสองด้าน · Dowel 4-DB16 งอฉาก 0.25 · RB9 รัดรอบ', 'bars_x/y 5-DB12 + หักขึ้น 2×0.20 · dowel 4-DB16 ยาว 1.02 · RB9 1 วง', 'S.3.01', US, 'เหมือน F1')
row('ความยาว Dowel', 'งอฉากในฐาน 0.30 (F1) / 0.25 (F2) + ในฐาน + ระยะทาบขึ้นตอม่อ (แบบไม่เขียนตัวเลข)', 'F1 1.07 / F2 1.02 ม./เส้น = งอ + ในฐาน 0.13 + ทาบ 40d 0.64', 'S.3.01', US, 'Earth ยืนยัน')

# ---------------------------------------------------------------- เสา (S.3.02 ตาราง C1)
for x in m['members']:
    if x['type'] != 'column':
        continue
    pier = x['id'].startswith('P-')
    d['members'][x['id']] = {'rebar': {'main': [8 if pier else 4, 16], 'stirrup': [6, 0.20]}, 'status': FD,
                             'src': 'S.3.02 ตาราง C1 แถว "' + ('ตอม่อ' if pier else 'อะเส') + '"'}
row('ตอม่อ P × 12', 'C1 แถว "ตอม่อ": 8-DB16 · ปลอก 1-RB6 @0.20', 'main 8-DB16 · stirrup RB6 @0.20 (หัวฐาน → หลังคาน)', 'S.3.02', FD)
row('เสา C × 10', 'C1 แถว "อะเส" (พื้นห้องน้ำ → อะเส): 4-DB16 · ปลอก 1-RB6 @0.20', 'main 4-DB16 · stirrup RB6 @0.20 (หลังคาน → +3.30)', 'S.3.02', FD)

# ---------------------------------------------------------------- คาน (S.3.02)
BR = {'B1': ([2, 16], [3, 16]), 'B2': ([2, 16], [2, 16]), 'B3': ([2, 12], [2, 12])}
for x in m['members']:
    if x['type'] == 'tie_beam':
        t, b = BR[x['mark']]
        d['members'][x['id']] = {'rebar': {'top': t, 'bot': b, 'stirrup': [6, 0.15]}, 'status': FD, 'src': 'S.3.02 แบบขยายคาน ' + x['mark']}
row('คาน B1', 'บน 2-DB16 · ล่าง 3-DB16 · St.-1RB6 @0.15', 'top 2-DB16 · bot 3-DB16 · stirrup RB6 @0.15', 'S.3.02', FD)
row('คาน B2', 'บน 2-DB16 · ล่าง 2-DB16 · St.-1RB6 @0.15', 'top 2-DB16 · bot 2-DB16 · stirrup RB6 @0.15', 'S.3.02', FD)
row('คาน B3', 'บน 2-DB12 · ล่าง 2-DB12 · St.-1RB6 @0.15', 'top 2-DB12 · bot 2-DB12 · stirrup RB6 @0.15', 'S.3.02', FD)

# ---------------------------------------------------------------- พื้น (S.3.02)
for s in m['slabs']:
    if s['mark'] == 'F2':
        d['slabs'][s['id']] = {'rebar': {'wire_mesh': 'WM-4@0.20'}, 'status': FD, 'src': 'S.3.02 พื้น GS ภายใน (Wire mesh Ø4 @0.20)'}
    elif s['mark'] == 'F1':   # ปลายงอลงขอบพับ: ลึกรวม 0.24 − หุ้มบน 0.025 − หุ้มล่าง 0.05 ≈ 0.17
        d['slabs'][s['id']] = {'rebar': {'mesh': [6, 0.25, 1], 'bend': {'L': 0.17, 'sides': s['edge_thicken']['sides']}}, 'status': FD, 'src': 'S.3.02 พื้น GS ภายนอก (RB6 @0.25 งอลงขอบพับ)'}
    elif s['mark'] == 'F3':   # ปลายงอลงคานล้อม B3 ทุกด้าน: ลึกคาน 0.40 − หุ้ม 0.025 − หุ้มล่าง 0.05 ≈ 0.33
        d['slabs'][s['id']] = {'rebar': {'mesh': [9, 0.30, 1], 'bend': {'L': 0.33, 'sides': list(range(len(s['polygon'])))}}, 'status': FD, 'src': 'S.3.02 ทางลาด (RB9 @0.30 สองทาง งอลงคานล้อม)'}
row('พื้นในอาคาร FL-020/025', 'Wire mesh Ø4.00 มม. @0.20# วางลึก 0.05 จากผิว', 'wire_mesh WM-4@0.20', 'S.3.02', FD)
row('ทางเดิน WK-01…05', 'RB6 @0.25 (ชั้นเดียว) งอลงขอบพับ', 'mesh RB6 @0.25 สองทาง 1 ชั้น + ปลายงอลง 0.17 ที่ขอบนอก', 'S.3.02', FD, 'ความยาวงอ = ลึกขอบ 0.24 − ระยะหุ้ม (ไม่มีตัวเลขในแบบ)')
row('ทางลาด/ชานพัก RP-01, PF-01', 'RB9 @0.30 สองทาง (ป้าย 2 ตัว = 2 ทิศ) · ปลายงอลงคานล้อม', 'mesh RB9 @0.30 1 ชั้น + ปลายงอลง 0.33 ทุกด้าน', 'S.3.02', FD, 'ความยาวงอ = ลึกคาน 0.40 − ระยะหุ้ม (ไม่มีตัวเลขในแบบ)')

# ---------------------------------------------------------------- แผ่นเหล็กหัวเสา (S.3.01)
for x in m['members']:
    if x['type'] == 'column' and x['id'].startswith('C-'):
        d['plates'][x['j']] = {'plate': [200, 200, 9], 'bolts': [4, 10, 30], 'status': FD, 'src': 'S.3.01 แบบขยายแผ่นเหล็กหัวเสา (J-Bolt ชุบกัลวาไนซ์ 10x300)'}
row('แผ่นเหล็กหัวเสา × 10', 'Plate 200x200x9 มม. + J-Bolt ชุบกัลวาไนซ์ 10x300 มม. 4 ตัว', 'plate 200x200x9 · bolts 4-Ø10 ฝัง 30 ซม. ที่หัวเสา C ทุกต้น', 'S.3.01', FD)

# ---------------------------------------------------------------- เสาเอ็น / ทับหลัง
row('เสาเอ็น 58 / ทับหลัง 6 / คานเอ็น 3', 'แบบไม่ระบุ — ตกลง 0.10×0.10 RB6 2 เส้น ปลอก RB6@0.20', 'รวมในรายการ "เสาเอ็น-ทับหลัง คสล." ต่อเมตร (ราคารวมเหล็ก)', 'ตกลงกับ Earth', US)

m['meta'] = dict(m['meta'], name='ห้องสุขา รร.เทศบาล 4 — ขั้น 3 เหล็กเสริม', stage=3)
m['history'].append({'at': __import__('datetime').datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบขั้น 3)', 'sections': ['design'], 'note': 'เหล็กเสริมตาม S.3.01/S.3.02 + แผ่นเหล็กหัวเสา'})
json.dump(m, open('stage3.bm.json', 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- ถอดเหล็กเพื่อสรุปตาม "ชิ้น"
tk = T.Takeoff(m, {}); tk.run()
kg = collections.defaultdict(float)
SUP = {x['id'] for x in m['supports']}
grp = lambda sid: ('ฐานราก' if sid in SUP else 'ตอม่อ' if sid.startswith('P-') else 'เสา' if sid.startswith('C-') else
                   'คาน ' + sid[:2] if sid[:2] in ('B1', 'B2', 'B3') else 'พื้น')
for it in tk.items.values():
    if it['group_code'] == '1.1.9' and 'by_src' in it and 'kg_m' not in it['name']:
        dia = it.get('dia')
        for sid, q in it['by_src'].items():
            kg[(grp(sid), it['name'])] += q
summary = [(k[0], k[1], round(v, 2)) for k, v in sorted(kg.items())]
json.dump({'rows': rows, 'summary': summary}, open('stage3_rows.json', 'w'), ensure_ascii=False, indent=1)
for s in summary: print(s)
