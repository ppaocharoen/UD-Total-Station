# Step 3 เหล็กเสริม — สนง. ทุ่งสมอ (ต่อจาก stage2.bm.json)
# อ่าน: S-01 (ชนิดเหล็ก) · S-07 ฐานราก F1/F2 · S-08 ตารางเสา · S-09…S-14 ขยายคาน · S-15 พื้น · S-16 บันได · S-17 พื้นสำเร็จรูป · S-05 (เพลทเสา CS)
# stirrup = [ขนาด, ระยะกลางช่วง, ระยะปลายช่วง] · extra_top = เสริมบนที่หัวเสา (คิด 2/3 ช่วง) · extra_bot = เสริมล่างกลางช่วง (คิด 0.75 ช่วง)
import json, sys, collections, datetime, math
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
        rb = {'bars_x': [5, 12], 'bars_y': [5, 12], 'dowel': [8, 20, 0.70], 'rings': [14, 9]}
        src = 'S-07 F1: ตะแกรง 5-DB12# · เหล็กยืน 8-DB20 (งอฉากล่าง) · ปลอก 2-RB9 @0.10'
    else:                   # ฐานเข็ม 2 ต้น 1.40×0.60×0.60 — เหล็กหลักตามแนวยาว 5-DB20 · ขวาง DB16 @0.20 (รูปตัว U)
        long_y = s['d'] > s['b']
        main, cross = [5, 20], [8, 16]
        rb = {'bars_x': cross if long_y else main, 'bars_y': main if long_y else cross, 'bend_up': 0.45, 'rings': [1, 12]}
        src = 'S-07 F2: ล่าง 5-DB20 ตามแนวยาว (งอขอ) · ขวาง DB16 @0.20 รูปตัว U · รัดรอบ 1-DB12'
    d['supports'][s['id']] = {'rebar': rb, 'status': FD, 'src': src}
row('ฐานราก F1 × 5', 'ตะแกรงล่าง 5-DB12 สองทาง · เหล็กยืน 8-DB20 งอฉาก · ปลอก 2-RB9 @0.10 (สองวง: สี่เหลี่ยม + ข้าวหลามตัด)', 'bars 5-DB12 x/y · 8-DB20 ยาว 0.70 ม./เส้น · ปลอก 14 วง RB9 (7 ชุด × 2)', 'S-07', US,
    'แบบไม่เขียนความยาวส่วนในฐาน — คิดเท่าความหนาฐาน 0.70 (Earth 25 ต.ค.)')
row('ฐานราก F2 × 18', 'ล่าง 5-DB20 ตามแนวยาว งอขอสองปลาย · ขวาง DB16 @0.20 รูปตัว U · รัดรอบ 1-DB12', 'แนวยาว 5-DB20 · แนวขวาง 8-DB16 · ปลายหักขึ้น 0.45 สองด้าน · รัดรอบ 1 วง DB12', 'S-07', FD,
    'หักขึ้น 0.45 = ลึกฐาน 0.60 − หุ้ม (ใช้ค่าเดียวกันทั้งสองแนว)')

# ---------------------------------------------------------------- เสา (S-08 ตารางเสา)
COLRB = {('C0', 'P'): ([4, 12], [6, 0.15], False), ('C1', 'P'): ([4, 20], [9, 0.15], False), ('C1', '1'): ([4, 20], [9, 0.15], False), ('C1', '2'): ([4, 20], [9, 0.15], False),
         ('C2', 'P'): ([8, 20], [9, 0.15], True), ('C2', '1'): ([8, 20], [9, 0.25], True), ('C2', '2'): ([4, 20], [9, 0.25], False),
         ('C2A', 'P'): ([8, 20], [9, 0.15], True), ('C2A', '1'): ([8, 20], [9, 0.25], True)}
NODE = {n['id']: n for n in m['nodes']}; SECS = {c['id']: c for c in m['sections']}
for x in m['members']:
    if x['type'] != 'column':
        continue
    seg = 'P' if x['id'].startswith('P-') else x['id'][1]
    main, st, dbl = COLRB[(x['mark'], seg)]
    # ปลอกถี่ @0.125 ช่วง lo หัว-โคนเสา (S-08 รูปแสดงระยะเรียงปลอก) · lo = max(ด้านเสา, ช่วงว่าง/6, 0.45) (Earth 25 ต.ค.)
    # ช่วงหัวรวมความลึกคานที่มาชน (ปลอกถี่ต่อเนื่องผ่านจุดต่อ)
    a_, b_ = NODE[x['i']], NODE[x['j']]; top = x['j'] if b_['z'] >= a_['z'] else x['i']
    H = abs(b_['z'] - a_['z']); hb = max([SECS[y['section']]['h'] for y in m['members'] if y['type'] in ('beam', 'tie_beam') and top in (y['i'], y['j'])] or [0])
    sc = SECS[x['section']]; lo = round(max(sc['b'], sc['h'], (H - hb) / 6, 0.45), 3)
    rb = {'main': main, 'stirrup': st[:2] + [0.125, [lo, round(lo + hb, 3)]]}
    if dbl: rb['double_stirrup'] = True
    d['members'][x['id']] = {'rebar': rb, 'status': FD, 'src': f"S-08 ตารางเสา {x['mark']} แถว {'ตอม่อ' if seg == 'P' else 'ชั้น ' + seg}"}
row('เสา C0', 'ตอม่อ 0.25 4-DB12 · ปลอก RB6 @0.15', 'main 4-DB12 · RB6 @0.15', 'S-08', FD)
row('เสา C1 (A2, A4, F2, F4)', 'ตอม่อ 0.25 4-DB20 · RB9 @0.15 · ชั้น 1–2 ลูกศรต่อเนื่อง (เท่าตอม่อ)', 'main 4-DB20 · RB9 @0.15 ทุกช่วง', 'S-08', FD)
row('เสา C2', 'ตอม่อ 0.30 8-DB20 2-RB9 @0.15 · ชั้น 1 0.25 8-DB20 2-RB9 @0.25 · ชั้น 2 0.25 4-DB20 RB9 @0.25', 'ตามตาราง · ปลอกคู่ (สี่เหลี่ยม + ข้าวหลามตัด) คิดเป็น 2 วง', 'S-08', FD)
row('เสา C2A (B3, C3)', 'ตอม่อ 0.30 8-DB20 2-RB9 @0.15 · ชั้น 1 0.25 8-DB20 2-RB9 @0.25 · ไม่มีชั้น 2', 'ตามตาราง', 'S-08', FD)
row('ปลอกถี่ช่วงหัว-โคนเสา', 'S-08 รูปแสดงระยะเรียงปลอก: @0.125 ในช่วง lo ที่หัวและโคนเสา และต่อเนื่องผ่านจุดต่อคาน · แบบไม่ระบุค่า lo', 'stirrup [Ø, ระยะตามตาราง, 0.125, [lo โคน, lo + ลึกคานที่หัว]] · lo = max(ด้านเสา, ช่วงว่าง/6, 0.45)', 'S-08', US, 'ค่า lo ตามเกณฑ์ที่ Earth ยืนยัน 25 ต.ค.')

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
    'B17': ([3, 25], [3, 25], [3, 25], [3, 25], [9, 0.15], None, 1.5, 'S-13', 'ปลอกคู่ 2-RB9 @0.15 ช่วง 1.50 จากศูนย์เสาทั้งสองปลาย'),
    'B17A': ([2, 25], [2, 25], None, None, [9, 0.15], None, False, 'S-13', ''),
    'B17X': ([2, 25], [2, 20], None, None, [6, 0.15], None, False, 'S-13', '**ไม่ตรงแบบ** — แบบเขียนล่าง "2Ø19" (ไม่มีขนาดนี้) ใส่ DB20 · ให้พิจารณาแก้ไขแบบ'),
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
    if dbl: rb['double_end'] = dbl
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
    elif mk == 'SX':   # เหล็กทางเดียวตามด้านสั้น Ø9 @0.25 (ปลายพับขึ้นเข้าคาน 0.25 — extra_bars) + 2Ø9 ตามยาว
        xs = [p[0] for p in s['polygon']]; ys = [p[1] for p in s['polygon']]
        rb = {'mesh_xy': {('y' if max(xs) - min(xs) >= max(ys) - min(ys) else 'x'): [9, 0.25], 'layers': 1}}
        src = 'S-15 SX (Ø9 @0.25 พับเข้าคาน 0.25 + 2Ø9)'
    elif mk == 'S0':
        rb, src = {'mesh': [9, 0.25, 1]}, 'S-15 S0 (Ø9 @0.25# หรือ WM Ø4.6 @0.15#)'
    else:
        continue
    d['slabs'][s['id']] = {'rebar': rb, 'status': FD, 'src': src}
row('พื้น SP (Topping)', 'S-01 ข้อ 4.2: Topping หนา 0.05 เสริม Ø6 @0.20# หรือ Wire mesh Ø4 @0.15#', 'mesh RB6 @0.20 1 ชั้น', 'S-01, S-17', FD, '**หมายเหตุ:** แบบให้เลือก Wire mesh Ø4 @0.15# ได้ — ใส่เหล็กเส้นไว้ก่อน (Earth: ยังไม่แก้)')
row('พื้น S1 / S1X', 'Ø9 @0.25# บน-ล่าง', 'mesh RB9 @0.25 2 ชั้น', 'S-15', FD)
row('พื้น S2', 'ด้านสั้น Ø9 @0.20 · ด้านยาว Ø9 @0.25 บน-ล่าง', 'mesh_xy ตามทิศด้านสั้น 2 ชั้น', 'S-15', FD)
row('พื้น S3', 'ด้านสั้น Ø9 @0.10 · ด้านยาว Ø9 @0.25 (บนริม @0.10 ยาว 0.45)', 'mesh_xy 2 ชั้น (ด้านสั้น @0.10 ทั้งผืน)', 'S-15', FD, 'เหล็กบนริม 0.45 คิดรวมเต็มผืน — เกินเล็กน้อย')
row('พื้น SX', 'Ø9 @0.25 (พับขึ้นเข้าคาน 0.25) + 2Ø9 ตามยาว', 'RB9 @0.25 ทางเดียวตามด้านสั้น + ขาพับ 0.25 + 2-RB9 ตามยาว (extra_bars)', 'S-15', FD)
row('พื้น S0', 'Ø9 @0.25# หรือ Wire mesh Ø4.6 @0.15#', 'mesh RB9 @0.25 1 ชั้น', 'S-15', FD, '**หมายเหตุ:** แบบให้เลือก Wire mesh Ø4.6 @0.15# ได้ — ใส่เหล็กเส้นไว้ก่อน (Earth: ยังไม่แก้)')

# ---------------------------------------------------------------- บันได (S-16)
d['stairs'] = {
    'ST2#1': {'main_bar': [16, 0.125], 'dist_bar': [9, 0.25], 'waist': 0.20},
    'ST2#2': {'main_bar': [16, 0.125], 'dist_bar': [9, 0.25], 'waist': 0.20},
    'ST1': {'main_bar': [9, 0.25], 'dist_bar': [9, 0.25], 'waist': 0.10},
}
row('บันได ST2', 'ท้องหนา 0.20 · ล่าง DB16 @0.125 · บน DB16 @0.25 · กันร้าว Ø9 "@ตามแบบ" · ชานพัก Ø16 @0.125 / Ø9 @0.25', 'main DB16 @0.125 · dist RB9 @0.25 (ชานพักต่อเนื่องจากช่วงบันได) · เหล็กบน/มุมขั้น/เหล็กพับขั้นเป็น extra_bars (ดูแถวถัดไป)', 'S-16', AS, 'กันร้าวแบบเขียน "@ตามแบบ" ไม่มีระยะ — ใช้ @0.25 เท่าชานพัก')
row('บันได ST1', 'ท้องหนา 0.10 · หลัก Ø9 @0.25 · กันร้าว Ø9 "@ตามแบบ" · เหล็กพับขั้น Ø6 @0.25 · 1Ø9 ทุกมุม', 'main RB9 @0.25 · dist RB9 @0.25 · เหล็กพับขั้น RB6 @0.25 + มุมขั้น 1-RB9 (extra_bars)', 'S-16', AS, 'กันร้าว "@ตามแบบ" ไม่มีระยะ — ใช้ @0.25 (Step 3 รอบแรกใส่ RB6 ผิด — Ø6 @0.25 คือเหล็กพับขั้น)')

# ---------------------------------------------------------------- เพลทเสาตั้ง CS (S-05)
for x in m['members']:
    if x['mark'] == 'CS':
        d['plates'][x['i']] = {'plate': [200, 200, 12], 'bolts': [2, 9, 30], 'status': FD, 'src': 'S-05 (CS วางบน PL-200x200x12 ยึด 2Ø9 ฝัง 0.30)'}
row('เพลทเสาตั้ง CS × 11', 'PL-200x200x12 มม. ยึดด้วย 2Ø9 ฝังในเสา/คาน 0.30', 'plate 200x200x12 · 2-RB9 ฝัง 30 ซม.', 'S-05', FD)
row('จุดต่อจันทันกับอกไก่', 'PL-50x150 หนา 4 มม. เชื่อมรอบ (S-08)', 'ยังไม่คิดเป็นชิ้น', 'S-08', AS, 'เล็กมาก — รวมในค่าแรงโครงหลังคา')
row('เสาเอ็น-ทับหลัง', 'แบบไม่ระบุ — RB6 2 เส้น ปลอก RB6 @0.20 (ข้อกำหนด Earth)', 'รวมในราคาต่อเมตร "เสาเอ็น-ทับหลัง คสล."', 'ข้อกำหนด Earth', US)


# ---------------------------------------------------------------- เหล็กเสริมรายการย่อย (extra_bars — คิดปริมาณ + วาด 3D)
from shapely.geometry import Polygon as SPoly, Point as SPt, LineString
R3 = lambda v: [round(c, 3) for c in v]
def xb(label, dia, a, b, n=1, step=None):
    it = {'label': label, 'dia': dia, 'a': R3(a), 'b': R3(b)}
    if n > 1: it['n'] = int(n); it['step'] = R3(step)
    return it
def add_x(sec, key, it):
    e = d[sec].setdefault(key, {'rebar': {}, 'status': FD, 'src': ''})
    (e['rebar'] if sec != 'stairs' else e).setdefault('extra_bars', []).append(it)

# ก. SX: 2Ø9 ตามยาว (S-15) — วางที่ 1/3, 2/3 ของด้านสั้น ลึกจากหลัง 0.05
for sl in m['slabs']:
    if sl['mark'] != 'SX': continue
    xs = [p[0] for p in sl['polygon']]; ys = [p[1] for p in sl['polygon']]; z = sl['top'] - 0.05
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for f in (1 / 3, 2 / 3):
        if x1 - x0 >= y1 - y0: a, b = [x0 + 0.025, y0 + (y1 - y0) * f, z], [x1 - 0.025, y0 + (y1 - y0) * f, z]
        else: a, b = [x0 + (x1 - x0) * f, y0 + 0.025, z], [x0 + (x1 - x0) * f, y1 - 0.025, z]
        add_x('slabs', sl['id'], xb('SX 1Ø9 ตามยาว', 9, a, b))
    # ขาพับขึ้นเข้าคาน 0.25 ที่ขอบด้านยาวฝั่งคาน (ขอบที่ใกล้แนวคานระดับเดียวกันที่สุด)
    zb = sl['top'] - 0.05; alongX = x1 - x0 >= y1 - y0
    edges = [(y0, y1), (y1, y0)] if alongX else [(x0, x1), (x1, x0)]
    def dist_beam(px, py):
        best = 9
        for y in m['members']:
            if y['type'] not in ('beam', 'tie_beam'): continue
            p, q = NODE[y['i']], NODE[y['j']]
            if max(p['z'], q['z']) > sl['top'] + 1.0 or min(p['z'], q['z']) < sl['top'] - 0.2: continue
            best = min(best, LineString([(p['x'], p['y']), (q['x'], q['y'])]).distance(SPt(px, py)))
        return best
    mid = ((x0 + x1) / 2, (y0 + y1) / 2)
    e = min(edges, key=lambda ee: dist_beam(mid[0], ee[0]) if alongX else dist_beam(ee[0], mid[1]))[0]
    e = e + (0.025 if e == (y0 if alongX else x0) else -0.025)
    if alongX: n = int((x1 - x0 - 0.05) // 0.25) + 1; a, b, stp = [x0 + 0.025, e, zb], [x0 + 0.025, e, zb + 0.25], [0.25, 0, 0]
    else: n = int((y1 - y0 - 0.05) // 0.25) + 1; a, b, stp = [e, y0 + 0.025, zb], [e, y0 + 0.025, zb + 0.25], [0, 0.25, 0]
    add_x('slabs', sl['id'], xb('SX ขาพับขึ้นเข้าคาน 0.25', 9, a, b, n, stp))

# ข. เหล็กเสริมพิเศษใน Topping เหนือคานใต้พื้น SP (S-17)
#   SP–SP: Ø6 @0.20 ยาว 1.00 + 1.00 ข้ามคาน + 1Ø9 ตามแนวคาน · SP–S (พื้นหล่อ/ห้องน้ำ): Ø6 @0.20 ยาว 1.00 + 0.40 + 2Ø9 · SP–ขอบ (คานริม): 1Ø9
SLP = [(sl, SPoly(sl['polygon'])) for sl in m['slabs'] if sl['kind'] in ('precast', 'cast')]
def side_of(x, y, ztop):
    for sl, pg in SLP:
        if pg.buffer(0.01).contains(SPt(x, y)):
            if sl['kind'] == 'precast' and abs(sl['top'] - 0.10 - ztop) < 0.03: return 'SP', sl
            if sl['kind'] == 'cast' and -0.12 <= sl['top'] - ztop <= 0.12: return 'S', sl
    return None, None
nsp = 0
for x in m['members']:
    if x['type'] not in ('beam', 'tie_beam'): continue
    A, Bn = NODE[x['i']], NODE[x['j']]
    if abs(A['z'] - Bn['z']) > 1e-3: continue
    zt = A['z']; L = math.hypot(Bn['x'] - A['x'], Bn['y'] - A['y'])
    if L < 0.3: continue
    ux, uy = (Bn['x'] - A['x']) / L, (Bn['y'] - A['y']) / L; vx, vy = -uy, ux; hb = SECS[x['section']]['b'] / 2 + 0.15
    samples = []
    t = 0.10
    while t < L - 0.05:
        px, py = A['x'] + ux * t, A['y'] + uy * t
        l, ls = side_of(px + vx * hb, py + vy * hb, zt); r, rs = side_of(px - vx * hb, py - vy * hb, zt)
        if 'SP' in (l, r):
            zsp = (ls if l == 'SP' else rs)['top'] - 0.025
            cls = ('SP', 'SP') if l == r else (l, r)
            samples.append((t, cls, zsp))
        t += 0.20
    runs = []
    for smp in samples:
        if runs and runs[-1][-1][1] == smp[1] and abs(smp[0] - runs[-1][-1][0] - 0.20) < 1e-6: runs[-1].append(smp)
        else: runs.append([smp])
    for run in runs:
        t0, cls, z = run[0]; n = len(run); t1 = run[-1][0]
        P = lambda t, o: [A['x'] + ux * t + vx * o, A['y'] + uy * t + vy * o]
        step = [ux * 0.20, uy * 0.20, 0]
        if cls == ('SP', 'SP'):
            add_x('members', x['id'], xb('S-17 เสริมพิเศษ Ø6 @0.20 ข้ามคาน (1.00+1.00)', 6, P(t0, 1.0) + [z], P(t0, -1.0) + [z], n, step)); nl = 1
        elif None in cls:
            nl = 1   # คานริม: 1Ø9 มุม
        else:   # SP กับพื้นหล่อในที่: ฝั่ง SP 1.00 ฝั่ง S 0.40
            sgn = 1 if cls[0] == 'SP' else -1
            add_x('members', x['id'], xb('S-17 เสริมพิเศษ Ø6 @0.20 (SP 1.00 + S 0.40)', 6, P(t0, sgn * 1.0) + [z], P(t0, -sgn * 0.40) + [z], n, step)); nl = 2
        # Ø9 @0.20 รูป ⊓ จากคานขึ้น Topping (ทุกกรณีใน S-17) — ขาฝังคาน 0.30 (สมมติ แบบไม่ระบุ)
        hw_ = SECS[x['section']]['b'] / 2 - 0.04
        for o_ in (hw_, -hw_):
            add_x('members', x['id'], xb('S-17 Ø9 @0.20 ⊓ ขา (ฝังคาน 0.30)', 9, P(t0, o_) + [z - 0.01], P(t0, o_) + [zt - 0.30], n, step))
        add_x('members', x['id'], xb('S-17 Ø9 @0.20 ⊓ บน', 9, P(t0, hw_) + [z - 0.01], P(t0, -hw_) + [z - 0.01], n, step))
        for k in range(nl):
            o = 0 if nl == 1 else (-0.04 if k == 0 else 0.04)
            add_x('members', x['id'], xb(f'S-17 {nl}Ø9 ตามแนวคานใน Topping', 9, P(t0 - 0.10, o) + [z - 0.005], P(t1 + 0.10, o) + [z - 0.005]))
        nsp += n
print('เหล็กเสริมพิเศษเหนือคาน Ø6:', nsp, 'เส้น')

# ค. บันได: มุมขั้น 1Ø9 ทุกขั้น (ST1, ST2) · ST2 เหล็กบน DB16 @0.25 ยาว 1.60 ที่ปลายติดพื้น + ชานพักบน DB16 @0.25 (ยื่นเข้าช่วงบันได 0.60) + กันร้าวบน RB9 @0.25
DIRV = {'+X': (1, 0), '-X': (-1, 0), '+Y': (0, 1), '-Y': (0, -1)}
for st in m['stairs']:
    fl = st['flights']
    for k, f in enumerate(fl):
        fid = st['id'] if len(fl) == 1 else f"{st['id']}#{k + 1}"
        dx, dy = DIRV[f['dir']]; lx, ly = -dy, dx   # ด้านกว้างอยู่ซ้ายทิศเดิน
        W, n, g = f['width'], f['risers'], f['going']; rise = (f['top'] - f['bottom']) / n
        sx, sy = f['start']; cv = 0.04
        # มุมขั้น: ขั้นที่ i (1..n) จมูกขั้นอยู่ที่ระยะราบ (i−1)·g สูง bottom + i·rise
        a = [sx + lx * cv + dx * 0.03, sy + ly * cv + dy * 0.03, f['bottom'] + rise - 0.03]
        b = [sx + lx * (W - cv) + dx * 0.03, sy + ly * (W - cv) + dy * 0.03, f['bottom'] + rise - 0.03]
        add_x('stairs', fid, xb('มุมขั้น 1Ø9 ทุกขั้น', 9, a, b, n, [dx * g, dy * g, rise]))
        # เหล็กพับในขั้น (ซิกแซกตามลูกตั้ง-ลูกนอน) ST2 Ø9 @0.25 · ST1 Ø6 @0.25 — คิดยาว ลูกตั้ง + ลูกนอน ต่อขั้น
        dz_ = 9 if st['id'] == 'ST2' else 6; nw = int((W - 2 * cv) // 0.25) + 1
        for j in range(nw):
            o = cv + 0.25 * j
            r0 = [sx + lx * o + dx * 0.03, sy + ly * o + dy * 0.03, f['bottom'] + 0.03]
            r1 = [r0[0], r0[1], f['bottom'] + rise - 0.03]
            t1_ = [sx + lx * o + dx * g, sy + ly * o + dy * g, f['bottom'] + rise - 0.03]
            add_x('stairs', fid, xb(f'เหล็กพับขั้น Ø{dz_} @0.25 (ลูกตั้ง)', dz_, r0, r1, n, [dx * g, dy * g, rise]))
            add_x('stairs', fid, xb(f'เหล็กพับขั้น Ø{dz_} @0.25 (ลูกนอน)', dz_, r1, t1_, n, [dx * g, dy * g, rise]))
        if st['id'] == 'ST2':
            Lh = n * g; H = f['top'] - f['bottom']; Li = math.hypot(Lh, H); ch, cz = Lh / Li, H / Li
            nb = int((W - 2 * cv) // 0.25) + 1
            # ปลายติดพื้นชั้น: ช่วงล่างที่ start (k=0) · ช่วงบนที่ปลายบน (k=1)
            if k == 0: s0, s1 = 0.0, 1.60
            else: s0, s1 = Li - 1.60, Li
            z_at = lambda s: f['bottom'] + cz * s - 0.06   # แนวหลังท้องบันได (ใต้จมูกขั้น) ลด 0.06
            pa = [sx + dx * ch * s0 + lx * cv, sy + dy * ch * s0 + ly * cv, z_at(s0)]
            pb = [sx + dx * ch * s1 + lx * cv, sy + dy * ch * s1 + ly * cv, z_at(s1)]
            add_x('stairs', fid, xb('เหล็กบน DB16 @0.25 ยาว 1.60 ปลายติดพื้น', 16, pa, pb, nb, [lx * 0.25, ly * 0.25, 0]))
# ชานพัก ST2 (แบบ S-16): บน DB16 @0.25 ตามแนวเดิน ยื่นเข้าช่วงบันได 0.60 + บน RB9 @0.25 ขวาง
st2 = next(s_ for s_ in m['stairs'] if s_['id'] == 'ST2'); zl = st2['landings'][0]['top'] - 0.04
x0, x1 = 12.10, 15.50; y0, y1 = 13.10 - 0.60, 14.90 - 0.04
nb = int((x1 - x0 - 0.08) // 0.25) + 1
add_x('stairs', 'ST2#1', xb('ชานพัก เหล็กบน DB16 @0.25 (ยื่นเข้าช่วงบันได 0.60)', 16, [x0 + 0.04, y0, zl], [x0 + 0.04, y1, zl], nb, [0.25, 0, 0]))
nd = int((y1 - y0) // 0.25) + 1
add_x('stairs', 'ST2#1', xb('ชานพัก เหล็กกันร้าวบน RB9 @0.25', 9, [x0 + 0.04, y0, zl - 0.016], [x1 - 0.04, y0, zl - 0.016], nd, [0, 0.25, 0]))
row('บันได ST2 (เพิ่ม)', 'บน DB16 @0.25 ยาว 1.60 ปลายติดพื้น · ชานพักบน DB16 @0.25 + RB9 @0.25 (ยื่นเข้าช่วง 0.60) · 1Ø9 ทุกมุมขั้น', 'extra_bars ตามตำแหน่ง (วาด 3D)', 'S-16', FD,
    'เหล็กพับในขั้น Ø9 @0.25 (ST2) / Ø6 @0.25 (ST1) คิดยาวลูกตั้ง + ลูกนอนต่อขั้น')
row('เหล็กเสริมพิเศษเหนือคาน (พื้น SP)', 'S-17: SP–SP Ø6 @0.20 ยาว 1.00+1.00 + 1Ø9 · SP–พื้นหล่อ Ø6 @0.20 ยาว 1.00+0.40 + 2Ø9 · คานริม 1Ø9', f'extra_bars ที่คานใต้ SP {nsp} เส้น Ø6 + เหล็ก Ø9 ตามแนวคาน', 'S-17', FD,
    'Ø9 @0.20 ⊓ จากคานขึ้น Topping ใส่ทุกคานใต้ SP — แบบไม่ระบุความลึกขาในคาน **สมมติฝัง 0.30**')

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
