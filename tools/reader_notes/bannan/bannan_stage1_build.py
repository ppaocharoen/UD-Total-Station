# Step 1 รูปทรงอาคาร — บ้านแนน (บ้านพักอาศัย คสล. 2 ชั้น · ต.หมากแข้ง อุดรธานี)
# อ่านจาก DXF "WIP บ้านแนน.dxf" (แยกแผ่นตามกรอบ → sheets.pkl) เทียบ PDF "รวม_บ้านแนน.pdf" ทีละแผ่น
# พิกัด: X = จากกริด A (ไปทาง I) · Y = จากกริด 10 (ขึ้นไปทางแถว 1) · หน่วย ม. · ทุกชิ้นติด src/status
import json, datetime, math, sys
sys.path[:0] = ['../st', '.']
from shapely.geometry import Polygon, box, Point
from shapely.ops import unary_union
import walls as W, wallcfg, roofgen, ext
from ot import OT
import cfg1, cfg2

FD, AS, US = 'from_drawing', 'assumed', 'user'
rows = []
def row(cat, id_, desc, src, st, note=''):
    rows.append((cat, id_, desc, src, st, note))

# ---------------------------------------------------------------- กริด / ระดับ
GX = dict(ext.GX, A1=-1.20, A2=1.80, E1=8.20); GY = dict(ext.GY, **{'5A': 13.00, '8A': 4.80, '2A': 19.125, '1A': 20.525})
G = [{'name': k, 'axis': 'X', 'coord': v} for k, v in sorted(GX.items(), key=lambda t: t[1])] + \
    [{'name': k, 'axis': 'Y', 'coord': v} for k, v in sorted(GY.items(), key=lambda t: t[1])]
row('กริด', 'A0…J', 'X: A0 −2.50 · A1 −1.20 · A 0 · A2 1.80 · B 3.20 · C 3.90 · D 5.20 · D1 6.25 · E 7.10 · E1 8.20 · F 10.30 · G 12.90 · H 15.20 · I 17.60 · J 19.425', 'A-04, A-05, S-04 (DXF หัวกริด)', FD,
    'A1/A2/E1 มีเฉพาะแปลนชั้นบน/หลังคา')
row('กริด', '10…1', 'Y: 10 = 0 · 9 3.50 · 8A 4.80 · 8 6.00 · 7 8.70 · 6 11.40 · 5A 13.00 · 5 14.10 · 4 15.70 · 3 17.40 · 2A 19.125 · 2 19.80 · 1 20.50 · 1A 20.525', 'A-04, A-05, S-04', FD,
    'แถว 4: A-04 เขียนระยะ 1.68/1.63 (หัวกริดที่ 15.725) แต่ S-04 เขียน 1.70/1.60 (15.70) — ใช้ 15.70 ตามโครงสร้าง')
levels = [
    {'name': 'GL', 'z': 0.0, 'desc': '±0.00 ลานหญ้า (Fx)'},
    {'name': 'YARD', 'z': 0.05, 'desc': '+0.05 จอดรถ F4 / ลานหน้าบ้าน F3'},
    {'name': 'WALK', 'z': 0.25, 'desc': '+0.25 ทางเดินข้างบ้าน / ลานหลังบ้าน F3'},
    {'name': '1F', 'z': 0.55, 'desc': '+0.55 พื้นชั้นล่าง (ห้องแม่บ้าน +0.35 · ครัว/ซักรีด +0.45 · โถงทางเข้า/ห้องน้ำ 1 +0.50 · ห้องน้ำ 3 +0.25 · เฉลียง +0.45)'},
    {'name': 'RF1', 'z': 4.60, 'desc': '+4.60 หลังคา SLAB ชั้นล่าง (จอดรถ เฉลียง ด้านหลัง)'},
    {'name': '2F', 'z': 4.70, 'desc': '+4.70 พื้นชั้นบน (ห้องน้ำ +4.60)'},
    {'name': 'EAVE', 'z': 8.65, 'desc': '+8.65 หลังแถบคานหลังคา (A-11 รูปตัด: 0.55 + 3.45 + 0.70 + 3.35 + 0.60)'},
    {'name': 'RIDGE', 'z': 9.41, 'desc': '+9.41 สันหลังคา (A-11)'},
]
for l in levels:
    row('ระดับ', l['name'], l['desc'], 'A-04, A-05, A-11, A-12', FD)

# ---------------------------------------------------------------- เสา (ส่วนเหนือพื้น — ขนาดจริง/ตอม่อ = Step 2)
nodes, members = [], []
def node(nid, x, y, z, lv=None):
    if not any(n['id'] == nid for n in nodes):
        n = {'id': nid, 'x': x, 'y': y, 'z': z}
        if lv: n['level'] = lv
        nodes.append(n)
    return nid
def gname(x, y):
    gx = min(GX, key=lambda k: abs(GX[k] - x)); gy = min(GY, key=lambda k: abs(GY[k] - y))
    return f'{gx}_{gy}' if abs(GX[gx] - x) < 0.3 and abs(GY[gy] - y) < 0.3 else f'{x:.2f}_{y:.2f}'
FOOT2 = Polygon([(-1.28, 4.73), (7.17, 4.73), (7.17, 5.28), (10.22, 5.28), (10.22, 4.73), (17.67, 4.73), (17.67, 17.48), (-0.08, 17.48), (-0.08, 11.33), (-1.28, 11.33)])
cols1 = W.cols('A-04#2'); cols2 = W.cols('A-05')
for fl, cols in (('1F', cols1), ('2F', cols2)):
    for x, y in cols:
        g = gname(x, y)
        if fl == '1F':
            z0, z1, l1 = 0.55, (4.70 if FOOT2.buffer(0.2).contains(Point(x, y)) else 4.60), ('2F' if FOOT2.buffer(0.2).contains(Point(x, y)) else 'RF1')
        else:
            z0, z1, l1 = 4.70, 8.65, 'EAVE'
        i = node(f'N-{g}-{fl}', round(x, 3), round(y, 3), z0, fl); j = node(f'N-{g}-{l1}', round(x, 3), round(y, 3), z1, l1)
        members.append({'id': f'C{fl[0]}-{g}', 'mark': 'C', 'type': 'column', 'i': i, 'j': j, 'section': 'RC-25x25', 'material': 'C', 'status': FD,
                        'src': ('A-04' if fl == '1F' else 'A-05') + ' (บล็อกเสา 0.25 ในแปลนสถาปัตย์)', 'note': 'ขนาด/เหล็ก/ตอม่อ = Step 2 (S-04…S-10)'})
row('เสา', f'C1-… ({len(cols1)} ต้น)', 'ชั้นล่าง: เสา 0.25×0.25 ตามบล็อกเสาใน A-04 · +0.55 → ท้องพื้นชั้นบน +4.70 (เสาจอดรถ/เฉลียง/ห้องปั๊ม → หลังคา SLAB +4.60)', 'A-04', FD,
    'เสาเฉลียงแนว F/9 อยู่ x 10.545 (เยื้องจากกริด F 0.245) ตามแบบ · ตำแหน่งจริงตรวจกับ S-04 ใน Step 2')
row('เสา', f'C2-… ({len(cols2)} ต้น)', 'ชั้นบน: เสา 0.25 ตามบล็อกเสาใน A-05 · +4.70 → +8.65 · ผังเสาชั้นบนไม่ตรงชั้นล่าง (แนว A1, A2, E1, 5A, 8A)', 'A-05', FD,
    'เสาชั้นบนที่ไม่มีเสาชั้นล่างรองรับ (เช่น A1/8A, A2/8A, E1/5A, G/5A) ต้องตั้งบนคาน — ตรวจ Step 2')

# ---------------------------------------------------------------- พื้น (หนา/ชนิด = Step 2 — ใส่ 0.10 ชั่วคราว)
slabs = []
def slab(id_, mark, top, poly, use, src, st=FD, note='', kind='cast'):
    if hasattr(poly, 'exterior'): poly = list(poly.exterior.coords)[:-1]
    s = {'id': id_, 'mark': mark, 'kind': kind, 't': 0.10, 'top': top, 'polygon': [[round(x, 3), round(y, 3)] for x, y in poly], 'use': use, 'status': st, 'src': src}
    if note: s['note'] = note
    slabs.append(s); return s
B = lambda x0, y0, x1, y1: box(x0, y0, x1, y1)
FOOT1 = Polygon([(-0.08, 5.93), (7.17, 5.93), (7.17, 5.28), (10.22, 5.28), (10.22, 5.93), (17.67, 5.93), (17.67, 11.405), (18.34, 11.405), (18.34, 14.105), (17.67, 14.105),
                 (17.67, 17.98), (15.27, 17.98), (15.27, 20.58), (10.22, 20.58), (10.22, 19.80), (5.27, 19.80), (5.27, 19.88), (-0.08, 19.88)])
R1 = [  # (id, ชื่อ, ระดับ, รูป, หมายเหตุ)
    ('S1-MAID', 'ห้องแม่บ้าน', 0.35, B(-0.08, 17.405, 2.84, 19.88), ''),
    ('S1-WC3', 'ห้องน้ำ 3', 0.25, B(-0.08, 15.80, 1.84, 17.405), ''),
    ('S1-WC2', 'ห้องน้ำ 2', 0.45, B(1.84, 15.80, 3.97, 17.405), 'แปลน A-04 เขียน +0.50 แต่แบบขยาย A-20 เขียน +0.45 — ใช้ +0.45 (ถาม)'),
    ('S1-FOY', 'โถงทางเข้า (โถงทางเดิน +0.50)', 0.50, B(7.17, 5.28, 10.22, 8.70), 'ขอบเขตระดับ +0.50 ถึงแนว 7 (สมมติ — ป้ายห้องอยู่ช่วงแถว 8–7)'),
    ('S1-WC1', 'ห้องน้ำ 1', 0.50, B(15.12, 11.405, 18.34, 14.105), 'โซนอาบน้ำ +0.45 (A-19) = Step 4'),
    ('S1-KIT', 'ห้องครัว', 0.45, B(10.22, 17.405, 15.27, 20.58), ''),
    ('S1-LAU', 'ห้องซักรีด', 0.45, B(15.27, 15.55, 17.67, 17.98), ''),
]
rest = FOOT1
for sid, use, z, poly, note in R1:
    slab(sid, 'F1', z, poly.intersection(FOOT1), use, 'A-04 (ป้ายระดับห้อง)', AS if 'สมมติ' in note or 'ถาม' in note else FD, note)
    rest = rest.difference(poly)
slab('S1-MAIN', 'F1', 0.55, rest, 'ห้องพักผ่อน ห้องเก็บของ ห้องพระ โถงทางเดิน ห้องแต่งตัว ห้องนอน 1 เตรียมอาหาร ใต้บันได', 'A-04 (F1/F2 +0.55)', FD,
     'ขอบเขตตามศูนย์ผนังนอก · ช่องบันได = Step 2')
G1 = [  # พื้นนอกอาคาร (วางบนดิน)
    ('G-GAR', 'F4', 0.05, B(-2.88, -0.12, 6.62, 5.88), 'จอดรถ', 'A-04 (F4 +0.05 · เส้นขอบชั้น 8)', FD, ''),
    ('G-PCH', 'F5', 0.45, B(7.22, 3.88, 10.17, 5.28), 'เฉลียง', 'A-04 (F5 +0.45)', FD, 'ขั้นบันไดลงลานหน้าบ้าน (y 3.08–3.88) = Step 2'),
    ('G-FRT', 'F3', 0.05, B(6.62, -0.12, 10.87, 3.08), 'ลานหน้าบ้าน', 'A-04 (F3 +0.05 · เส้นขอบชั้น 8)', AS, 'ขอบเขตตามเส้นขอบพื้นในแปลน'),
    ('G-SIDE', 'F3', 0.25, B(-1.33, 7.08, -0.13, 19.33), 'ทางเดินข้างบ้าน', 'A-04 (F3 +0.25 · เส้นขอบ)', FD, 'ปลายทั้งสองเขียน +0.125 (ทางลาด?) — ถาม'),
    ('G-BK1', 'F3', 0.25, B(10.17, 20.63, 17.72, 22.63), 'ลานหลังบ้าน (ด้านเหนือครัว)', 'A-04 (F3 +0.25 · เส้นขอบ)', FD, ''),
    ('G-BK2', 'F3', 0.25, B(15.27, 17.98, 17.60, 20.58), 'ลานหลังบ้าน (ข้างครัว)', 'A-04 (F3 +0.25)', FD, ''),
    ('G-PMP', 'F3', 0.35, B(17.60, 19.08, 19.47, 20.58), 'ห้องปั๊มน้ำ', 'A-04 (F3 +0.35)', FD, ''),
]
for sid, mk, z, poly, use, src, st, note in G1:
    slab(sid, mk, z, poly, use, src, st, note, kind='ground')
row('พื้น', 'S1-…', 'พื้นชั้นล่างแบ่งตามระดับป้ายห้อง: +0.55 หลัก · +0.50 โถงทางเข้า/ห้องน้ำ 1 · +0.45 ครัว/ซักรีด/ห้องน้ำ 2 · +0.35 ห้องแม่บ้าน · +0.25 ห้องน้ำ 3', 'A-04, A-19, A-20', FD,
    f'พื้นที่ภายใน {FOOT1.area:.2f} ตร.ม. (ถึงศูนย์ผนังนอก)')
row('พื้น', 'G-…', 'พื้นนอกอาคาร: จอดรถ +0.05 · เฉลียง +0.45 · ลานหน้าบ้าน +0.05 · ทางเดินข้างบ้าน/ลานหลังบ้าน +0.25 · ห้องปั๊ม +0.35', 'A-04', FD, 'ลานหญ้า Fx ±0.00 ไม่ใส่')
FOOT2N = FOOT2.difference(B(7.17, 5.28, 10.22, 11.33))
R2 = [('S2-WC4', 'ห้องน้ำ 4', B(-1.28, 8.78, 1.72, 11.33)), ('S2-WC5', 'ห้องน้ำ 5', B(15.12, 8.78, 17.67, 11.33)),
      ('S2-WC6', 'ห้องน้ำ 6', B(11.30, 14.48, 12.90, 17.48)), ('S2-WC7', 'ห้องน้ำ 7', B(12.90, 14.48, 14.50, 17.48))]
rest2 = FOOT2N
for sid, use, poly in R2:
    slab(sid, 'F3', 4.60, poly, use, 'A-05 (F3 +4.60)'); rest2 = rest2.difference(poly)
slab('S2-MAIN', 'F2', 4.70, rest2, 'ห้องนอน 2–5 ห้องนั่ง (ลานหน้าบ้านชั้นบน) พักผ่อน โถงทางเดิน', 'A-05 (F2 +4.70)', FD, 'เว้นช่องโล่ง E–F แถว 8A–6 (ทางเข้าสูงสองชั้น) · ช่องบันได = Step 2')
row('พื้น', 'S2-…', 'พื้นชั้นบน +4.70 · ห้องน้ำ 4–7 +4.60 · ช่องโล่งเหนือโถงทางเข้า E–F แถว 8A–6', 'A-05', FD, f'พื้นที่ {FOOT2N.area:.2f} ตร.ม.')
RS = [  # หลังคา SLAB +4.60 (ขอบนอกตามเส้นขอบ/กันตกใน A-05)
    ('RS-S', Polygon([(-3.13, -0.37), (6.87, -0.37), (6.87, 2.68), (10.87, 2.68), (10.87, 4.73), (-1.28, 4.73), (-1.28, 6.13), (-3.13, 6.13)]), 'หลังคาจอดรถ + หลังคาเฉลียง', 'ขอบนอก x −3.13…6.87 y −0.37 · หลังคาเฉลียง x 6.84…10.87 y 2.68'),
    ('RS-W', Polygon([(-1.58, 6.13), (-1.28, 6.13), (-1.28, 11.33), (-0.08, 11.33), (-0.08, 17.48), (-1.58, 17.48)]), 'กันสาดด้านข้าง (คลุมทางเดินข้างบ้าน)', 'ขอบนอก x −1.58'),
    ('RS-N', Polygon([(-1.58, 17.48), (17.67, 17.48), (17.67, 20.88), (9.92, 20.88), (9.92, 18.73), (5.57, 18.73), (5.57, 20.18), (-1.58, 20.18)]), 'หลังคาด้านหลัง (ห้องแม่บ้าน ห้องเก็บของ ครัว)', 'ช่วง x 5.57–9.92 ขอบที่ y 18.73 (หลังคากระจก W5 ยื่นออก)'),
    ('RS-P', B(17.67, 18.78, 19.77, 20.88), 'หลังคาห้องปั๊ม/ลานหลังบ้านข้างครัว', 'ขอบนอก x 19.77 y 18.78–20.88'),
    ('RS-E', B(17.67, 10.93, 18.40, 13.48), 'หลังคาส่วนยื่นห้องน้ำ 1', 'ขอบนอก x 18.40'),
]
for sid, poly, use, note in RS:
    slab(sid, 'RS', 4.60, poly.difference(FOOT2) if sid != 'RS-N' else poly, use, 'A-05 / A-06 (หลังคา SLAB +4.60 · เส้นขอบชั้น 1)', FD, note)
row('พื้น', 'RS-…', 'หลังคา SLAB +4.60 รอบชั้นบน: จอดรถ+เฉลียง · ทางเดินข้างบ้าน · ด้านหลัง (ครัว/ห้องแม่บ้าน) · ห้องปั๊ม · ส่วนยื่นห้องน้ำ 1', 'A-05, A-06', FD,
    'ขอบกันตก/แถบคาน 0.70 รอบหลังคา SLAB = Step 2 (คานขอบ)')

# ---------------------------------------------------------------- ผนัง / ช่องเปิด
walls, opens = [], []
def zone_level(x, y, fl):
    p = Point(x, y)
    for s in slabs:
        if fl == '1F' and s['top'] < 2 and Polygon(s['polygon']).buffer(0.06).contains(p):
            yield s['top']
        if fl == '2F' and 4 < s['top'] < 5 and s['mark'] != 'RS' and Polygon(s['polygon']).buffer(0.06).contains(p):
            yield s['top']
GLASSW = 'ฉากกระจก'
for fl, num, cfg in (('1F', 'A-04#2', cfg1), ('2F', 'A-05', cfg2)):
    segs = wallcfg.make(num, OT, cfg.PAIRS, cfg.OPEN, cfg.EXTRA, cfg.DROP)
    p = 'W1-' if fl == '1F' else 'W2-'
    segs.sort(key=lambda s: (s['ax'], s['c'], s['a']))
    for k, s in enumerate(segs, 1):
        a0 = (s['a'], s['c']) if s['ax'] == 'H' else (s['c'], s['a']); a1 = (s['b'], s['c']) if s['ax'] == 'H' else (s['c'], s['b'])
        mx, my = (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2
        n = (0, 0.12) if s['ax'] == 'H' else (0.12, 0)
        lv = [z for q in ((mx + n[0], my + n[1]), (mx - n[0], my - n[1])) for z in zone_level(q[0], q[1], fl)]
        if fl == '1F':
            bot = min(lv) if lv else 0.55
            top = 4.70 if FOOT2.buffer(0.1).contains(Point(mx, my)) else 4.60
        else:
            bot = min(lv) if lv else 4.70; top = 8.65
        glass = s['note'].startswith(GLASSW)
        if glass: top = bot + 2.20
        wid = f'{p}{k:02d}'
        w = {'id': wid, 'kind': 'other' if glass else 'brick_mon', 't': s['t'], 'path': [[round(a0[0], 3), round(a0[1], 3)], [round(a1[0], 3), round(a1[1], 3)]],
             'bottom': round(bot, 3), 'top': round(top, 3), 'status': AS if s['note'].startswith('เพิ่มเอง') else FD,
             'src': ('A-04' if fl == '1F' else 'A-05') + (' (แกนผนัง DXF A_Wall_in)' if not s['note'] else '')}
        if s['note']: w['note'] = s['note']
        if not FOOT1.buffer(0.2).union(FOOT2.buffer(0.2)).contains(Point(mx, my)): w['exterior'] = True
        elif FOOT1.exterior.distance(Point(mx, my)) < 0.12 if fl == '1F' else FOOT2.exterior.distance(Point(mx, my)) < 0.12: w['exterior'] = True
        walls.append(w)
        for j, (typ, at) in enumerate(s['ops'], 1):
            o = {'id': f'{wid}-{typ}{"" if j == 1 else j}', 'type': typ, 'wall': wid, 'at': round(at - s['a'], 3), 'status': FD,
                 'src': ('A-04' if fl == '1F' else 'A-05') + f' (ป้าย {typ[:3].rstrip("G")}) + ' + ('A-13…A-17')}
            if typ == 'D16G': o['note'] = 'เลข D16 ซ้ำในตาราง — ตำแหน่งนี้เป็นประตูกระจกห้องอาบน้ำ'
            opens.append(o)
n1 = sum(1 for w in walls if w['id'].startswith('W1')); n2 = len(walls) - n1
row('ผนัง', f'W1-01…W1-{n1:02d}', 'ผนังชั้นล่างตามแกนผนังในแปลน (เส้น A_Wall_in) หนา 0.10 (แนว 6/5/3 ผนังคู่หนา 0.25 · แนว E ช่องประตูเลื่อนเก็บในผนังหนา 0.50) ตัดท่อนที่หน้าเสา', 'A-04 (DXF)', FD,
    'ฐานผนัง = ระดับพื้นห้องที่ต่ำกว่า · ยอด = ท้องพื้นชั้นบน +4.70 / หลังคา SLAB +4.60 (ใต้คาน = Step 2) · ผนังรวมกรอบปูนปั้นหน้าต่างยื่น (W2) และกล่องหุ้มเสาเฉลียง/จอดรถ')
row('ผนัง', f'W2-01…W2-{n2:02d}', 'ผนังชั้นบน หนา 0.10 +4.70 → +8.65 (ห้องน้ำ +4.60)', 'A-05 (DXF)', FD, 'ยอดผนังใต้คานหลังคา = Step 2')
row('ผนัง', 'ฉากกระจกห้องอาบน้ำ', 'D16 (ห้องน้ำ 1) · D17 (ห้องน้ำ 6/7) · D18 (ห้องน้ำ 4/5) ใส่เป็นแผงชนิด "other" สูงเท่าบาน 2.20 (ไม่ก่ออิฐ)', 'A-15, A-04, A-05', FD)
row('ผนัง', 'แกนผนังที่ขาดใน DXF', 'เพิ่มเอง: แนว W5 (แถว 2 D–F) · ผนังห้องปั๊มด้านแนว I · ช่องประตู D5 ห้องเก็บของ · ผนังห้องพระด้านโถง (D4) · ผนังห้องน้ำ 4/5 แนว 7 · ช่องประตูห้องน้ำ 6/7', 'A-04, A-05', AS,
    'แปลนเขียนผนัง/ประตูแต่ไม่มีเส้นแกนผนังใน DXF')

# ---------------------------------------------------------------- หลังคา ปั้นหยา 5° (Shingle roof)
pitch = 5; t = math.tan(math.radians(pitch)); EAVE = 8.78
wings = [roofgen.Wing('M', (-0.48, 4.02, 18.07, 17.87), EAVE, t, 'X'), roofgen.Wing('W', (-1.68, 4.02, 10.0, 11.87), EAVE, t, 'X')]
planes = [p for p in roofgen.build(wings) if Polygon([q[:2] for q in p['pts']]).area > 1e-3]
out = unary_union([w.box.intersection(box(-1.68, 4.02, 18.07, 17.87)) for w in wings])
roof = {'id': 'R1', 'form': 'custom', 'outline': [[round(x, 3), round(y, 3)] for x, y in list(out.exterior.coords)[:-1]], 'eave': EAVE, 'pitch': pitch, 'cover': 'shingle',
        'planes': planes, 'status': FD,
        'src': 'A-06 แปลนหลังคา (ขอบชายคา เส้น A-Wall · SLOPE 5° · ชิงเกิ้ลรูฟ + SUB ROOF) + A-11 รูปตัด (หลังแถบ +8.65 · สัน +9.41) + S-08',
        'note': 'ผืนหลัก x −0.48…18.07 y 4.02…17.87 สันยาว x 6.45–11.14 ที่ y 10.95 · ผืนเล็กด้านตะวันตก x −1.68…−0.48 y 4.02…11.87 (ตะเข้รางกับผืนหลัก) · ระดับชายคา +8.78 วัดจากรูปตัด A-11'}
row('หลังคา', 'R1', 'ปั้นหยาลาด 5° มุงชิงเกิ้ลรูฟบน SUB ROOF: ผืนหลัก x −0.48…18.07 y 4.02…17.87 · ส่วนยื่นด้านตะวันตก x −1.68…−0.48 y 4.02…11.87 (ตะเข้รางที่มุม) · สันยาว 4.70 ที่ y 10.95', 'A-06, S-08', FD,
    f'ชายคา +8.78 (วัดจากรูปตัด A-11) → สัน {EAVE + 6.925 * t:.2f} · รูปตัดเขียนยอด +9.41 (รวมครอบสัน/โครง) · พื้นที่ผังหลังคา {out.area:.2f} ตร.ม.')

meta = {'name': 'บ้านแนน — Step 1 รูปทรงอาคาร', 'agency': 'บ้านพักอาศัย คสล. 2 ชั้น', 'units': {'length': 'm', 'force': 'kgf', 'stress': 'ksc'},
        'source': 'WIP บ้านแนน.dxf + รวม_บ้านแนน.pdf (สถาปัตย์ A-01…A-27 · โครงสร้าง S-00…S-11 · ไฟฟ้า E-00…E-07 · สุขาภิบาล SN-01…SN-06)', 'stage': 1,
        'location': '129/99 ถ.บ้านเหล่า ต.หมากแข้ง อ.เมือง จ.อุดรธานี'}
bm = {'schema_version': '0.1', 'meta': meta, 'grids': G, 'levels': levels,
      'materials': [{'id': 'C', 'kind': 'concrete', 'fc': 240, 'status': FD, 'src': 'A-02 รายการทั่วไป ข้อ 4.3 (ทรงกระบอก 15×30 ซม. 28 วัน 240 ksc)'}],
      'sections': [{'id': 'RC-25x25', 'kind': 'rc_rect', 'b': 0.25, 'h': 0.25, 'status': FD, 'src': 'A-04/A-05 (บล็อกเสา 0.25) + S-10 ตารางเสา'}],
      'nodes': nodes, 'members': members, 'supports': [], 'slabs': slabs, 'walls': walls, 'opening_types': OT, 'openings': opens,
      'roofs': [roof], 'design': {},
      'history': [{'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 1)', 'sections': ['*'], 'note': 'อ่านบ้านแนน Step 1 จาก DXF + PDF'}]}
json.dump(bm, open('stage1.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage1_rows.json', 'w'), ensure_ascii=False, indent=1)
print(len(walls), 'walls', len(opens), 'openings', len(slabs), 'slabs', len(members), 'columns', len(planes), 'roof planes')
