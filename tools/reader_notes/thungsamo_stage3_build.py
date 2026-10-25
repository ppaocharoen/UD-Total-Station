# Step 3 เหล็กเสริม — สนง. ทุ่งสมอ (ต่อจาก stage2.bm.json)
# อ่าน: S-01 (ชนิดเหล็ก) · S-07 ฐานราก F1/F2 · S-08 ตารางเสา · S-09…S-14 ขยายคาน · S-15 พื้น · S-16 บันได · S-17 พื้นสำเร็จรูป · S-05 (เพลทเสา CS)
# stirrup = [ขนาด, ระยะกลางช่วง, ระยะปลายช่วง] · extra_top = เสริมบนที่หัวเสา (คิด 2/3 ช่วง) · extra_bot = เสริมล่างกลางช่วง (คิด 0.75 ช่วง)
import json, sys, collections, datetime
sys.path.insert(0, '/home/claude/UD-Total-Station/tools')
import takeoff as T

FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage2.bm.json'))
d = m['design'] = {'members': {}, 'supports': {}, 'slabs': {}, 'plates': {}, 'stairs': {}}
rows = []
def row(*a): rows.append(a)

# ---------------------------------------------------------------- ฐานราก (S-07)
for s in m['supports']:
    if s['mark'] == 'F1':   # ฐานเข็ม 1 ต้น 0.70×0.70×0.70
        rb = {'bars_x': [5, 12], 'bars_y': [5, 12], 'dowel': [8, 20, 0.80], 'rings': [14, 9]}
        src = 'S-07 F1: ตะแกรง 5-DB12# · เหล็กยืน 8-DB20 (งอฉากล่าง) · ปลอก 2-RB9 @0.10'
    else:                   # ฐานเข็ม 2 ต้น 1.40×0.60×0.60 — เหล็กหลักตามแนวยาว 5-DB20 · ขวาง DB16 @0.20 (รูปตัว U)
        long_y = s['d'] > s['b']
        main, cross = [5, 20], [8, 16]
        rb = {'bars_x': cross if long_y else main, 'bars_y': main if long_y else cross, 'bend_up': 0.45, 'rings': [1, 12]}
        src = 'S-07 F2: ล่าง 5-DB20 ตามแนวยาว (งอขอ) · ขวาง DB16 @0.20 รูปตัว U · รัดรอบ 1-DB12'
    d['supports'][s['id']] = {'rebar': rb, 'status': FD, 'src': src}
row('ฐานราก F1 × 5', 'ตะแกรงล่าง 5-DB12 สองทาง · เหล็กยืน 8-DB20 งอฉาก · ปลอก 2-RB9 @0.10 (สองวง: สี่เหลี่ยม + ข้าวหลามตัด)', 'bars 5-DB12 x/y · 8-DB20 ยาว 0.80 ม./เส้น · ปลอก 14 วง RB9 (7 ชุด × 2)', 'S-07', FD,
    'ความยาวเหล็กยืน = ลึกฐาน 0.70 − หุ้ม + ขอ (แบบไม่เขียนตัวเลข)')
row('ฐานราก F2 × 18', 'ล่าง 5-DB20 ตามแนวยาว งอขอสองปลาย · ขวาง DB16 @0.20 รูปตัว U · รัดรอบ 1-DB12', 'แนวยาว 5-DB20 · แนวขวาง 8-DB16 · ปลายหักขึ้น 0.45 สองด้าน · รัดรอบ 1 วง DB12', 'S-07', FD,
    'หักขึ้น 0.45 = ลึกฐาน 0.60 − หุ้ม (ใช้ค่าเดียวกันทั้งสองแนว)')

# ---------------------------------------------------------------- เสา (S-08 ตารางเสา)
COLRB = {('C0', 'P'): ([4, 12], [6, 0.15], False), ('C1', 'P'): ([4, 20], [9, 0.15], False), ('C1', '1'): ([4, 20], [9, 0.15], False), ('C1', '2'): ([4, 20], [9, 0.15], False),
         ('C2', 'P'): ([8, 20], [9, 0.15], True), ('C2', '1'): ([8, 20], [9, 0.25], True), ('C2', '2'): ([4, 20], [9, 0.25], False),
         ('C2A', 'P'): ([8, 20], [9, 0.15], True), ('C2A', '1'): ([8, 20], [9, 0.25], True)}
for x in m['members']:
    if x['type'] != 'column':
        continue
    seg = 'P' if x['id'].startswith('P-') else x['id'][1]
    main, st, dbl = COLRB[(x['mark'], seg)]
    rb = {'main': main, 'stirrup': st}
    if dbl: rb['double_stirrup'] = True
    d['members'][x['id']] = {'rebar': rb, 'status': FD, 'src': f"S-08 ตารางเสา {x['mark']} แถว {'ตอม่อ' if seg == 'P' else 'ชั้น ' + seg}"}
row('เสา C0', 'ตอม่อ 0.25 4-DB12 · ปลอก RB6 @0.15', 'main 4-DB12 · RB6 @0.15', 'S-08', FD)
row('เสา C1 (A2, A4, F2, F4)', 'ตอม่อ 0.25 4-DB20 · RB9 @0.15 · ชั้น 1–2 ลูกศรต่อเนื่อง (เท่าตอม่อ)', 'main 4-DB20 · RB9 @0.15 ทุกช่วง', 'S-08', FD)
row('เสา C2', 'ตอม่อ 0.30 8-DB20 2-RB9 @0.15 · ชั้น 1 0.25 8-DB20 2-RB9 @0.25 · ชั้น 2 0.25 4-DB20 RB9 @0.25', 'ตามตาราง · ปลอกคู่ (สี่เหลี่ยม + ข้าวหลามตัด) คิดเป็น 2 วง', 'S-08', FD)
row('เสา C2A (B3, C3)', 'ตอม่อ 0.30 8-DB20 2-RB9 @0.15 · ชั้น 1 0.25 8-DB20 2-RB9 @0.25 · ไม่มีชั้น 2', 'ตามตาราง', 'S-08', FD)
row('ระยะทาบ/ปลอกถี่ที่ปลายเสา', 'แบบแสดงระยะเรียงปลอกถี่ 0.125 ในช่วง lo ที่หัว-โคนเสา', 'ไม่แยกคิด (ใช้ระยะตามตาราง)', 'S-08', AS, 'ปริมาณปลอกต่ำกว่าจริงเล็กน้อย')

# ---------------------------------------------------------------- คาน (S-09…S-14)
B = {  # mark: (top, bot, extra_top, extra_bot, stirrup [dia, mid, end], side, double, sheet, note)
    'B1': ([2, 12], [2, 12], None, None, [6, 0.15], None, False, 'S-09', ''),
    'B2': ([2, 16], [2, 16], None, [1, 16], [6, 0.15], None, False, 'S-09', 'เสริมล่าง 1-DB16 หยุดที่ L/8'),
    'B2X': ([2, 16], [2, 16], None, None, [6, 0.15], None, False, 'S-09', ''),
    'B3': ([2, 20], [2, 20], None, None, [6, 0.15], None, False, 'S-09', ''),
    'B3X': ([2, 20], [2, 12], None, None, [6, 0.15], None, False, 'S-09', ''),
    'BX': ([2, 16], [2, 12], None, None, [6, 0.10], None, False, 'S-09', ''),
    'BY': ([4, 16], [2, 16], None, None, [6, 0.10], None, False, 'S-09', ''),
    'B4': ([3, 16], [3, 16], [2, 16], [2, 16], [6, 0.20, 0.10], None, False, 'S-10', ''),
    'B4A': ([2, 16], [2, 16], [1, 16], [1, 16], [6, 0.20, 0.10], None, False, 'S-10', 'ช่วงริม: บนที่หัวเสาฝั่ง B4 3-DB16 · ล่างกลางช่วง 3-DB16'),
    'B4X': ([2, 16], [2, 12], None, None, [6, 0.15], None, False, 'S-10', ''),
    'B5': ([2, 16], [2, 16], [1, 16], [1, 16], [6, 0.15, 0.075], None, False, 'S-10', ''),
    'B5X': ([2, 16], [2, 16], None, None, [6, 0.15], None, False, 'S-10', ''),
    'B6': ([2, 16], [2, 16], None, None, [6, 0.15], None, False, 'S-11', ''),
    'B6X': ([2, 16], [2, 16], None, None, [6, 0.15], None, False, 'S-11', ''),
    'B7': ([2, 16], [2, 16], None, None, [6, 0.15], [2, 9], False, 'S-11', 'เหล็กข้าง 2-RB9 + ปลอกยึด RB6 @0.60'),
    'B8': ([2, 16], [2, 20], None, [2, 16], [6, 0.10], None, False, 'S-11', 'เสริมล่าง 2-DB16 หยุดที่ L/8'),
    'B9': ([2, 16], [2, 16], None, None, [6, 0.15], None, False, 'S-11', ''),
    'B10': ([2, 16], [3, 16], None, [2, 16], [9, 0.15], None, False, 'S-11', 'เสริมล่าง 2-DB16 หยุดที่ L/8'),
    'B11': ([2, 20], [3, 20], [2, 20], [2, 16], [9, 0.25, 0.15], None, False, 'S-11', ''),
    'B11A': ([2, 20], [2, 20], None, [1, 16], [6, 0.10], None, False, 'S-11', ''),
    'B12': ([2, 20], [2, 20], None, [2, 20], [6, 0.20, 0.125], None, False, 'S-11', ''),
    'B12X': ([2, 20], [2, 16], None, None, [6, 0.15], None, False, 'S-11', ''),
    'B13': ([2, 25], [2, 25], [2, 20], [2, 20], [9, 0.25, 0.125], None, False, 'S-12', ''),
    'B13A': ([2, 25], [2, 25], None, None, [9, 0.25, 0.20], None, False, 'S-12', ''),
    'B13X': ([2, 25], [2, 25], None, None, [9, 0.25], None, False, 'S-12', ''),
    'B13Y': ([2, 25], [2, 16], None, None, [6, 0.15], None, False, 'S-12', ''),
    'B14': ([3, 25], [2, 25], [2, 25], [3, 25], [9, 0.20, 0.10], None, False, 'S-12', ''),
    'B14A': ([2, 25], [2, 25], None, None, [6, 0.20, 0.10], None, False, 'S-12', ''),
    'B14X': ([2, 25], [2, 25], None, None, [6, 0.25], None, False, 'S-12', ''),
    'B14Y': ([2, 25], [2, 16], None, None, [6, 0.15], None, False, 'S-12', ''),
    'B15': ([2, 16], [2, 16], [2, 16], [2, 16], [6, 0.15, 0.075], None, False, 'S-13', ''),
    'B15X': ([2, 16], [2, 16], None, None, [6, 0.15], None, False, 'S-13', ''),
    'B16': ([3, 25], [3, 25], None, [2, 25], [9, 0.125], None, False, 'S-13', ''),
    'B17': ([3, 25], [3, 25], [3, 25], [3, 25], [9, 0.15], None, False, 'S-13', 'ปลอกคู่ 2-RB9 ช่วงหัวเสา (ไม่แยกคิด)'),
    'B17A': ([2, 25], [2, 25], None, None, [9, 0.15], None, False, 'S-13', ''),
    'B17X': ([2, 25], [2, 20], None, None, [6, 0.15], None, False, 'S-13', 'แบบเขียนล่าง "2Ø19" ไม่มีขนาดนี้ — ใช้ DB20'),
    'BST': ([3, 25], [3, 25], None, [2, 16], [9, 0.15, 0.10], None, False, 'S-13', ''),
    'BR1': ([2, 12], [2, 12], [1, 12], [1, 12], [6, 0.15, 0.075], None, False, 'S-14', ''),
    'BR2': ([2, 16], [2, 16], None, [2, 16], [6, 0.15, 0.075], None, False, 'S-14', ''),
    'BR3': ([3, 16], [3, 16], None, [2, 16], [6, 0.20, 0.10], None, False, 'S-14', ''),
}
miss = collections.Counter()
for x in m['members']:
    if x['type'] not in ('beam', 'tie_beam'):
        continue
    if x['mark'] not in B:
        miss[x['mark']] += 1; continue
    top, bot, et, eb, st, side, dbl, sh, note = B[x['mark']]
    rb = {'top': top, 'bot': bot, 'stirrup': st}
    if et: rb['extra_top'] = et
    if eb: rb['extra_bot'] = eb
    if side: rb['side'] = side
    if dbl: rb['double_stirrup'] = True
    e = {'rebar': rb, 'status': AS if x['mark'] == 'B17X' else FD, 'src': f'{sh} ขยายคาน {x["mark"]}'}
    if note: e['note'] = note
    d['members'][x['id']] = e
print('ไม่มีข้อมูลเหล็ก:', dict(miss))
fmt = lambda b: f'{b[0]}-{"RB" if b[1] < 12 else "DB"}{b[1]}' if b else '—'
for mk, (top, bot, et, eb, st, side, dbl, sh, note) in B.items():
    if not any(x['mark'] == mk and x['type'] in ('beam', 'tie_beam') for x in m['members']):
        continue
    stx = f'RB{st[0]} @{st[1]:g}' + (f' (ปลาย @{st[2]:g})' if len(st) > 2 else '')
    row(f'คาน {mk}', f'บน {fmt(top)}' + (f' + เสริมบน {fmt(et)}' if et else '') + f' · ล่าง {fmt(bot)}' + (f' + เสริมล่าง {fmt(eb)}' if eb else '') + (f' · ข้าง {fmt(side)}' if side else '') + f' · ปลอก {stx}',
        'ตามแบบ (เสริมบนคิด 2/3 ช่วง เสริมล่างคิด 0.75 ช่วง)', sh, AS if mk == 'B17X' else FD, note)

# ---------------------------------------------------------------- พื้น (S-15, S-17, S-01 ข้อ 4)
for s in m['slabs']:
    mk = s['mark']
    if mk == 'SP':
        rb, src = {'mesh': [6, 0.20, 1]}, 'S-01 ข้อ 4.2 (Topping เสริม Ø6 @0.20# หรือ WM Ø4 @0.15)'
    elif mk in ('S1', 'S1X'):
        rb, src = {'mesh': [9, 0.25, 2]}, 'S-15 S1/S1X (บน-ล่าง Ø9 @0.25#)'
    elif mk == 'S2':
        rb, src = {'mesh_xy': {'x': [9, 0.20], 'y': [9, 0.25], 'layers': 2}}, 'S-15 S2 (ด้านสั้น Ø9 @0.20 · ด้านยาว Ø9 @0.25 บน-ล่าง)'
        xs = [p[0] for p in s['polygon']]; ys = [p[1] for p in s['polygon']]
        if max(ys) - min(ys) < max(xs) - min(xs):   # ด้านสั้นตาม Y → เหล็กด้านสั้นวางตาม Y
            rb = {'mesh_xy': {'x': [9, 0.25], 'y': [9, 0.20], 'layers': 2}}
    elif mk == 'S3':
        rb, src = {'mesh_xy': {'x': [9, 0.25], 'y': [9, 0.10], 'layers': 2}}, 'S-15 S3 (ด้านสั้น Ø9 @0.10 · ด้านยาว Ø9 @0.25 บน-ล่าง)'
    elif mk == 'SX':
        rb, src = {'mesh': [9, 0.25, 1]}, 'S-15 SX (Ø9 @0.25 + 2Ø9)'
    elif mk == 'S0':
        rb, src = {'mesh': [9, 0.25, 1]}, 'S-15 S0 (Ø9 @0.25# หรือ WM Ø4.6 @0.15#)'
    else:
        continue
    d['slabs'][s['id']] = {'rebar': rb, 'status': FD, 'src': src}
row('พื้น SP (Topping)', 'S-01 ข้อ 4.2: Topping หนา 0.05 เสริม Ø6 @0.20# หรือ Wire mesh Ø4 @0.15#', 'mesh RB6 @0.20 1 ชั้น', 'S-01, S-17', FD, 'เลือกทางแรก · เหล็กเสริมพิเศษเหนือคาน (S-17 Ø6 @0.20 ยาว 2.00) ยังไม่คิด')
row('พื้น S1 / S1X', 'Ø9 @0.25# บน-ล่าง', 'mesh RB9 @0.25 2 ชั้น', 'S-15', FD)
row('พื้น S2', 'ด้านสั้น Ø9 @0.20 · ด้านยาว Ø9 @0.25 บน-ล่าง', 'mesh_xy ตามทิศด้านสั้น 2 ชั้น', 'S-15', FD)
row('พื้น S3', 'ด้านสั้น Ø9 @0.10 · ด้านยาว Ø9 @0.25 (บนริม @0.10 ยาว 0.45)', 'mesh_xy 2 ชั้น (ด้านสั้น @0.10 ทั้งผืน)', 'S-15', FD, 'เหล็กบนริม 0.45 คิดรวมเต็มผืน — เกินเล็กน้อย')
row('พื้น SX', 'Ø9 @0.25 + 2Ø9', 'mesh RB9 @0.25 1 ชั้น', 'S-15', FD, '2Ø9 ตามยาวไม่แยกคิด')
row('พื้น S0', 'Ø9 @0.25# หรือ Wire mesh Ø4.6 @0.15#', 'mesh RB9 @0.25 1 ชั้น', 'S-15', FD, 'เลือกทางแรก')

# ---------------------------------------------------------------- บันได (S-16)
d['stairs'] = {
    'ST2#1': {'main_bar': [16, 0.125], 'dist_bar': [9, 0.25], 'waist': 0.20},
    'ST2#2': {'main_bar': [16, 0.125], 'dist_bar': [9, 0.25], 'waist': 0.20},
    'ST1': {'main_bar': [9, 0.25], 'dist_bar': [6, 0.25], 'waist': 0.10},
}
row('บันได ST2', 'ท้องหนา 0.20 · ล่าง DB16 @0.125 · บน DB16 @0.25 · กันร้าว RB9 @0.25 · ชานพัก Ø16 @0.125 / Ø9 @0.25', 'main DB16 @0.125 · dist RB9 @0.25 (ชานพักต่อเนื่องจากช่วงบันได)', 'S-16', FD,
    'เหล็กบน DB16 @0.25 และเหล็กมุมขั้น 1Ø9 ยังไม่คิด')
row('บันได ST1', 'ท้องหนา 0.10 · RB9 @0.25 · RB6 @0.25 · 1Ø9 ทุกมุม', 'main RB9 @0.25 · dist RB6 @0.25', 'S-16', FD)

# ---------------------------------------------------------------- เพลทเสาตั้ง CS (S-05)
for x in m['members']:
    if x['mark'] == 'CS':
        d['plates'][x['i']] = {'plate': [200, 200, 12], 'bolts': [2, 9, 30], 'status': FD, 'src': 'S-05 (CS วางบน PL-200x200x12 ยึด 2Ø9 ฝัง 0.30)'}
row('เพลทเสาตั้ง CS × 11', 'PL-200x200x12 มม. ยึดด้วย 2Ø9 ฝังในเสา/คาน 0.30', 'plate 200x200x12 · 2-RB9 ฝัง 30 ซม.', 'S-05', FD)
row('จุดต่อจันทันกับอกไก่', 'PL-50x150 หนา 4 มม. เชื่อมรอบ (S-08)', 'ยังไม่คิดเป็นชิ้น', 'S-08', AS, 'เล็กมาก — รวมในค่าแรงโครงหลังคา')
row('เสาเอ็น-ทับหลัง', 'แบบไม่ระบุ — RB6 2 เส้น ปลอก RB6 @0.20 (ข้อกำหนด Earth)', 'รวมในราคาต่อเมตร "เสาเอ็น-ทับหลัง คสล."', 'ข้อกำหนด Earth', US)

m['meta'] = dict(m['meta'], name='สนง. ทุ่งสมอ — Step 3 เหล็กเสริม', stage=3)
m['history'].append({'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 3)', 'sections': ['design'],
                     'note': 'เหล็กเสริมฐานราก เสา คาน พื้น บันได + เพลทเสาตั้ง ตาม S-07…S-17'})
json.dump(m, open('stage3.bm.json', 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- สรุปน้ำหนักเหล็กตามหมวด
tk = T.Takeoff(m, {}); tk.run()
kg = collections.defaultdict(float)
SUP = {x['id'] for x in m['supports']}; MEM = {x['id']: x for x in m['members']}; SL = {s['id'] for s in m['slabs']}
def grp(sid):
    if sid in SUP: return 'ฐานราก'
    if sid in MEM:
        x = MEM[sid]
        return 'เสา' if x['type'] == 'column' else 'คาน'
    if sid in SL: return 'พื้น'
    if sid.startswith('ST'): return 'บันได'
    return 'อื่นๆ'
for it in tk.items.values():
    if it['group_code'] == '1.1.9' and 'by_src' in it:
        for sid, q in it['by_src'].items():
            kg[(grp(sid), it['name'])] += q
summary = [(k[0], k[1], round(v, 2)) for k, v in sorted(kg.items())]
json.dump({'rows': rows, 'summary': summary}, open('stage3_rows.json', 'w'), ensure_ascii=False, indent=1)
for s in summary: print(s)
