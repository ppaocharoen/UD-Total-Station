# Step 2 โครงสร้าง — สนง. ทุ่งสมอ (ต่อจาก Step 1: stage1.bm.json)
# อ่าน: S-01 รายการประกอบ · S-02 ฐานราก · S-03 / S-04 / S-05 แปลนเสา-คาน-พื้น · S-06 โครงหลังคา · S-07 ฐานราก F1/F2 · S-08 ตารางเสา
#       S-09…S-14 ขยายคาน (ขนาดหน้าตัด) · S-15 พื้น · S-16 บันได · S-17 พื้นสำเร็จรูป
# พิกัดคาน/เสา/ตำแหน่งเข็ม อ่านจาก DXF (แผ่น S) ด้วย st/ext.py — X = แนว A→F, Y = แนว 5→1 (แถว 5 = 0)
# ระดับ: หลังคานชั้น 1 +0.75 · ชั้น 2 +4.35 · คานหลังคา +8.85 · พื้นสำเร็จรูป SP หนารวม 0.10 วางบนคาน (หลังพื้น = หลังคาน + 0.10 = ระดับพื้นสถาปัตย์)
import json, math, datetime, sys, re
from collections import Counter, defaultdict
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, polygonize
sys.path.insert(0, '.'); sys.path.insert(0, 'st')
import roofgen, ext

FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage1.bm.json'))
rows = []
def row(cat, id_, desc, src, st, note=''):
    rows.append((cat, id_, desc, src, st, note))

GX = {'A': 0.0, 'B': 4.0, 'C': 8.0, 'D': 12.0, 'E': 18.0, 'F': 22.0}
GY = {'5': 0.0, '4': 4.0, '3': 8.0, '2': 12.0, '1': 15.0}
Z1, Z2, ZR = 0.75, 4.35, 8.85

nodes = {}
def node(x, y, z, lv=None, grid=None):
    k = (round(x, 3), round(y, 3), round(z, 3))
    for n in nodes.values():
        if (n['x'], n['y'], n['z']) == k:
            return n['id']
    nid = f'N{len(nodes) + 1:04d}'
    nodes[nid] = dict({'id': nid, 'x': k[0], 'y': k[1], 'z': k[2]}, **({'level': lv} if lv else {}), **({'grid': grid} if grid else {}))
    return nid
members = []
def mem(id_, mark, tp, a, b, sec, src, st=FD, mat='C240', note=None, **kw):
    x = dict({'id': id_, 'mark': mark, 'type': tp, 'i': node(*a), 'j': node(*b), 'section': sec, 'material': mat, 'status': st, 'src': src}, **kw)
    if note: x['note'] = note
    members.append(x); return x
secs = {}
def rc(b, h, src='S-08 / S-09…S-14'):
    k = f'RC-{round(b * 100)}x{round(h * 100)}'
    secs.setdefault(k, {'id': k, 'kind': 'rc_rect', 'b': b, 'h': h, 'status': FD, 'src': src}); return k

mats = [{'id': 'C240', 'kind': 'concrete', 'fc': 240, 'unit_weight': 2400, 'status': FD, 'src': "S-01 ข้อ 1 (f'c ทรงกระบอก 28 วัน ≥ 240 กก./ตร.ซม.)"},
        {'id': 'SS400', 'kind': 'steel', 'grade': 'SS400 (มอก.1227)', 'fy': 2400, 'status': FD, 'src': 'S-01 ข้อ 5.1 (fy ≥ 2,400 กก./ตร.ซม.)'},
        {'id': 'CF', 'kind': 'cold_formed', 'grade': 'มอก.1228', 'fy': 2400, 'status': AS, 'src': 'S-01 ข้อ 5 (เหล็กรูปพรรณ ≥ 2,400)', 'note': 'เหล็กขึ้นรูปเย็น C-125x50x20x3.2 — ใช้กำลังเท่าข้อ 5.1'}]

# ================================================================ ฐานราก + เข็ม (S-02, S-07, S-01 ข้อ 3)
PILE = {'type': 'สี่เหลี่ยมตัน 0.26x0.26', 'size': 0.26, 'length': 10.0, 'capacity': 30000, 'kind': 'driven'}
HEAD = -1.20          # ระดับหัวเข็ม: ต่ำกว่า "ระดับที่กำหนด" ไม่น้อยกว่า 1.20 (ถือ ระดับที่กำหนด = ±0.00)
FT = {'F1': dict(b=0.70, d=0.70, h=0.70, embed=0.25), 'F2': dict(b=1.40, d=0.60, h=0.60, embed=0.05)}
COLS = {}   # (x, y) -> mark
for g, r in [('A', '2'), ('A', '4'), ('F', '2'), ('F', '4')]:
    COLS[(GX[g], GY[r])] = 'C1'
for g, r in [('B', '3'), ('C', '3')]:
    COLS[(GX[g], GY[r])] = 'C2A'
for g in 'ABCDEF':
    for r in '12345':
        xy = (GX[g], GY[r])
        if xy in COLS: continue
        if (g in 'ABCF' and r in '234') or (g in 'DE'):
            COLS[xy] = 'C2'
COLS[(21.825, 0.475)] = 'C0'
PL2 = {(0, 8), (4, 8), (8, 8), (22, 8)} | {(x, y) for x in (12, 18) for y in (0, 4, 8, 12, 15)}   # F2 แนวยาวตาม Y (เข็มเรียง ±Y)
supports = []
gname = lambda x, y: next((f'{g}{r}' for g, gx in GX.items() for r, gy in GY.items() if abs(gx - x) < 1e-6 and abs(gy - y) < 1e-6), 'C0')
for (x, y), cm in COLS.items():
    fm = 'F1' if cm in ('C1', 'C0') else 'F2'
    f = FT[fm]; along_y = (round(x), round(y)) in PL2 or (x, y) in PL2
    b, d = (f['b'], f['d']) if not along_y else (f['d'], f['b'])
    bottom = round(HEAD - f['embed'], 3)
    nb = node(x, y, round(bottom + f['h'], 3), None, gname(x, y))
    at = [[0, 0]] if fm == 'F1' else ([[0, -0.4], [0, 0.4]] if along_y else [[-0.4, 0], [0.4, 0]])
    supports.append({'id': f'{fm}-{gname(x, y)}', 'mark': fm, 'node': nb, 'kind': 'pile_cap', 'b': b, 'd': d, 'h': f['h'], 'bottom': bottom,
                     'sand': 0.08, 'lean': 0.08, 'material': 'C240', 'fixity': 'fixed', 'status': FD,
                     'piles': dict(PILE, n=len(at), at=at, top=HEAD), 'src': 'S-02 (ตำแหน่ง/ทิศเข็มจาก DXF ST_Pile) + S-07 + S-01 ข้อ 3'})
row('ฐานราก', 'F1 × 5', 'F1 0.70×0.70 หนา 0.70 เข็ม 1 ต้น (ฝังในฐาน 0.25) — ใต้ C1 (A2, A4, F2, F4) และ C0 · คอนกรีตหยาบ 1:3:5 หนา 0.08 + ทรายอัดแน่น 0.08', 'S-02, S-07', FD)
row('ฐานราก', 'F2 × 18', 'F2 1.40×0.60 หนา 0.60 เข็ม 2 ต้นห่าง 0.80 (ฝัง 0.05) — แนวยาวตามทิศเข็มใน DXF: ตาม X ที่ B2/C2/B4/C4 · ตาม Y ที่เหลือ', 'S-02, S-07', FD)
row('ฐานราก', 'ระดับ', f'หัวเข็ม {HEAD:+.2f} (แบบ: ต่ำกว่าระดับที่กำหนดไม่น้อยกว่า 1.20) → ท้อง F1 −1.45 หลัง −0.75 · ท้อง F2 −1.25 หลัง −0.65', 'S-07', US, '"ระดับที่กำหนด" = ±0.00 — Earth ยืนยัน 25 ต.ค.')
row('เสาเข็ม', '41 ต้น', 'เข็มสี่เหลี่ยมตัน ≥ 0.26×0.26 รับ ≥ 30 ตัน/ต้น ยาวคิดราคา 10.00 ม. (ข้อ 3.3) · ทดสอบ Dynamic load test 2 ต้น (ข้อ 3.7)', 'S-01 ข้อ 3, S-02', FD, 'ความยาวจริงตามผลเจาะสำรวจดิน (ข้อ 3.4)')

# ================================================================ เสา (S-08 ตารางเสา)
c25, c30 = rc(0.25, 0.25), rc(0.30, 0.30)
for (x, y), cm in COLS.items():
    s = next(s for s in supports if s['node'] and nodes[s['node']]['x'] == round(x, 3) and nodes[s['node']]['y'] == round(y, 3))
    z0 = nodes[s['node']]['z']; gn = gname(x, y)
    if cm == 'C0':
        mem(f'P-{gn}', 'C0', 'column', (x, y, z0), (x, y, 0.80), c25, 'S-08 (C0 ตอม่อ 0.25×0.25) + S-03', US, level='GL', note='ยอดตอม่อ = หลังคานชานราบทางลาด +0.80')
        continue
    if gn in ('B2', 'C2', 'B4', 'C4'):   # จุดต่อคานยื่น BX (ล่าง) ที่ +0.60
        mem(f'P-{gn}', cm, 'column', (x, y, z0), (x, y, 0.60), c30, 'S-08 (แถวตอม่อ)', level='GL')
        mem(f'P-{gn}b', cm, 'column', (x, y, 0.60), (x, y, Z1), c30, 'S-08 (แถวตอม่อ)', level='GL', note='ตอม่อท่อนบน (แบ่งที่จุดต่อคาน BX)')
    else:
        mem(f'P-{gn}', cm, 'column', (x, y, z0), (x, y, Z1), c30 if cm in ('C2', 'C2A') else c25, 'S-08 (แถวตอม่อ)', level='GL')
    mem(f'C1-{gn}', cm, 'column', (x, y, Z1), (x, y, Z2), c25, 'S-08 (แถวชั้น 1)', level='1F')
    if cm != 'C2A':
        mem(f'C2-{gn}', cm, 'column', (x, y, Z2), (x, y, ZR), c25, 'S-08 (แถวชั้น 2)', level='2F')
row('เสา', 'ตอม่อ', 'C2/C2A ตอม่อ 0.30×0.30 · C1/C0 ตอม่อ 0.25×0.25 จากหลังฐานรากถึงหลังคานชั้น 1 (+0.75)', 'S-08', FD)
row('เสา', 'ชั้น 1–2', 'เสา 0.25×0.25 ทุกต้น +0.75 → +4.35 → +8.85 (คานหลังคา) · C2A (B3, C3) หยุดที่ชั้น 2 · C0 ตอม่อรับชานพักทางลาดเท่านั้น', 'S-08, S-03…S-05', FD,
    'สถาปัตย์เขียนเสา 0.30 (รวมฉาบ) — โครงสร้าง 0.25')

# ================================================================ คาน คสล. (S-03 / S-04 / S-05 + หน้าตัด S-09…S-14)
SEC = {'B1': (0.15, 0.40), 'B2': (0.20, 0.40), 'B2X': (0.20, 0.40), 'B3': (0.20, 0.40), 'B3X': (0.20, 0.40), 'BX': (0.20, 0.50), 'BY': (0.20, 0.40),
       'B4': (0.20, 0.50), 'B4A': (0.20, 0.50), 'B4X': (0.20, 0.40), 'B5': (0.20, 0.40), 'B5X': (0.20, 0.40),
       'B6': (0.20, 0.70), 'B6X': (0.20, 0.70), 'B7': (0.20, 1.00), 'B8': (0.20, 0.40), 'B9': (0.20, 0.40), 'B10': (0.20, 0.50),
       'B11': (0.25, 0.50), 'B11A': (0.25, 0.50), 'B12': (0.20, 0.60), 'B12X': (0.20, 0.40),
       'B13': (0.20, 0.70), 'B13A': (0.20, 0.70), 'B13X': (0.20, 0.70), 'B13Y': (0.20, 0.40),
       'B14': (0.25, 0.70), 'B14A': (0.25, 0.70), 'B14X': (0.25, 0.70), 'B14Y': (0.20, 0.40),
       'B15': (0.20, 0.40), 'B15X': (0.20, 0.40), 'B16': (0.25, 0.60), 'B17': (0.25, 0.60), 'B17A': (0.25, 0.60), 'B17X': (0.25, 0.40),
       'BST': (0.25, 0.50), 'BR1': (0.20, 0.40), 'BR2': (0.20, 0.40), 'BR3': (0.20, 0.50)}
SRC_SEC = {k: 'S-09' for k in ('B1', 'B2', 'B2X', 'B3', 'B3X', 'BX', 'BY')} | {k: 'S-10' for k in ('B4', 'B4A', 'B4X', 'B5', 'B5X')} | \
          {k: 'S-11' for k in ('B6', 'B6X', 'B7', 'B8', 'B9', 'B10', 'B11', 'B11A', 'B12', 'B12X')} | {k: 'S-12' for k in ('B13', 'B13A', 'B13X', 'B13Y', 'B14', 'B14A', 'B14X', 'B14Y')} | \
          {k: 'S-13' for k in ('B15', 'B15X', 'B16', 'B17', 'B17A', 'B17X', 'BST')} | {k: 'S-14' for k in ('BR1', 'BR2', 'BR3')}
cnt = Counter()
def beam(mk, a, b, top, plan, st=FD, note=None, tp='beam', lv=None, top_b=None):
    w, h = SEC[mk]; cnt[mk] += 1
    return mem(f'{mk}-{cnt[mk]:02d}', mk, tp, (a[0], a[1], top), (b[0], b[1], top if top_b is None else top_b), rc(w, h, SRC_SEC[mk]), f'{plan} + {SRC_SEC[mk]} ({mk} {w:.2f}×{h:.2f})', st, note=note, level=lv)
def H(mk, y, x0, x1, top, plan, **k): return beam(mk, (x0, y), (x1, y), top, plan, **k)
def V(mk, x, y0, y1, top, plan, **k): return beam(mk, (x, y0), (x, y1), top, plan, **k)
def run(mk, ax, c, pts, top, plan, **k):   # แบ่งท่อนที่จุดตัด (เสา/คานซอย)
    for u, v in zip(pts, pts[1:]):
        (H if ax == 'H' else V)(mk, c, u, v, top, plan, **k)
xA, xD, xE, xF = -0.025, 11.975, 18.025, 22.025          # คานริมนอก: ผิวนอกเสมอผิวเสา (ศูนย์เยื้อง 0.025)
y5, y4, y3, y2, y1 = -0.025, 3.975, 8.0, 12.025, 15.025

# ---- ชั้น 1 (S-03) หลังคาน +0.75
P1 = 'S-03'; L1 = '1F'
run('B6', 'H', y4, [xA, 4.0, 8.0, xD], Z1, P1, lv=L1); H('B13', y4, xD, xE, Z1, P1, lv=L1); run('B13A', 'H', y4, [xE, 19.8, xF], Z1, P1, lv=L1)
run('B4', 'H', y3, [xA, 4.0, 8.0, xD], Z1, P1, lv=L1); run('B14', 'H', y3, [xD, 15.65, xE], Z1, P1, lv=L1); run('B14A', 'H', y3, [xE, 19.8, xF], Z1, P1, lv=L1)
run('B6', 'H', y2, [xA, 4.0, 8.0, xD], Z1, P1, lv=L1); run('B14', 'H', y2, [xD, 13.75, 15.65, xE], Z1, P1, lv=L1); run('B14A', 'H', y2, [xE, 19.8, xF], Z1, P1, lv=L1)
H('B13', y1, xD, xE, Z1, P1, lv=L1)
run('B6', 'V', xA, [y4, y3, y2], Z1, P1, lv=L1)
run('B5', 'V', 4.0, [y4, y3, y2], Z1, P1, lv=L1); run('B5', 'V', 8.0, [y4, y3, y2], Z1, P1, lv=L1)
run('B4A', 'V', xD, [y4, y3], Z1, P1, lv=L1); run('B4', 'V', xD, [y3, 9.6, y2], Z1, P1, lv=L1); run('B6', 'V', xD, [y2, 13.25, y1], Z1, P1, lv=L1)
run('B4A', 'V', xE, [y4, 6.65, y3], Z1, P1, lv=L1); run('B4', 'V', xE, [y3, 10.0, y2], Z1, P1, lv=L1); V('B6', xE, y2, y1, Z1, P1, lv=L1)
run('B6', 'V', xF, [y4, 5.95, y3, 8.6, y2], Z1, P1, lv=L1)
# ภายใน: โถงบันได / ห้องปั๊ม / ครัว / ห้องน้ำ
H('B10', 9.6, xD, 13.75, Z1, P1, lv=L1); H('B10', 9.6, 13.75, 15.65, Z1, P1, lv=L1)
H('B10', 13.25, xD, 13.75, Z1, P1, lv=L1); H('B10', 13.25, 13.75, 15.65, Z1, P1, lv=L1)
run('B9', 'V', 13.75, [9.6, y2, 13.25], Z1, P1, lv=L1)
run('B11', 'V', 15.65, [y3, 9.6, 10.0, y2], Z1, P1, lv=L1); run('B11A', 'V', 15.65, [y2, 13.25, y1], Z1, P1, lv=L1)
H('B1', 10.0, 15.65, xE, Z1, P1, lv=L1)
run('B15', 'V', 19.8, [y4, 5.95, 6.65, y3, 8.6, 10.0, y2], Z1, P1, lv=L1, st=US, note='เลื่อนจาก x 19.60 (S-03) มาใต้ผนัง x 19.80 — Earth 25 ต.ค.')
H('B1', 10.0, xE, 19.8, Z1, P1, lv=L1); H('B1', 6.65, xE, 19.8, Z1, P1, lv=L1)
H('B1', 8.6, 19.8, xF, Z1, P1, lv=L1); H('B1', 5.95, 19.8, xF, Z1, P1, lv=L1)
row('คาน ชั้น 1', 'B4…B15 ภายในอาคาร', 'คานชั้น 1 หลังคาน +0.75 ใต้พื้นสำเร็จรูป SP (หลังพื้น +0.85) · ริมนอก B6/B13/B13A/B14A 0.20×0.70 (ผิวนอกเสมอผิวเสา) · ภายใน B4/B4A 0.20×0.50, B5 0.20×0.40, B14 0.25×0.70 · โถงบันได B9/B10/B11 · ห้องน้ำ B15/B1',
    'S-03, S-09…S-13', FD, 'หลังคาน = หลังพื้นสถาปัตย์ − 0.10 (SP 0.05 + Topping 0.05 วางบนคาน, S-17)')
# ชานทางเข้า D–E แถว 5–4 (หลังพื้น +0.80 → หลังคาน +0.70)
ZP = 0.70
H('B12', y5, xD, xE, ZP, P1, lv=L1, st=US, note='หลังคานชานทางเข้า = +0.80 − 0.10')
V('B6', xD, y5, y4, ZP, P1, lv=L1, st=US); V('B7', xE, y5, y4, ZP, P1, lv=L1, st=US, note='คานลึก 1.00 กั้นชานทางเข้า/ทางลาด (ปลายล่างทางลาดฝากคานนี้)')
V('BY', xD, y5, -1.2, ZP, P1, lv=L1, st=US, note='คานยื่น 1.20 รับหน้าบันได ST1'); V('BY', xE, y5, -1.2, ZP, P1, lv=L1, st=US)
H('B8', -1.1, xD, xE, ZP, P1, lv=L1, st=US, note='ปลายคานยื่น BY')
row('คาน ชั้น 1', 'B12, B6, B7, BY, B8 (ชานทางเข้า)', 'ชานทางเข้า: B12 0.20×0.60 แถว 5 · B7 0.20×1.00 แนว E · BY คานยื่น 1.20 ที่ D5/E5 · B8 ปลายคานยื่น · หลังคาน +0.70', 'S-03, S-09, S-11', US,
    'ระดับ: ชานทางเข้า F6 +0.80 (A-03) − 0.10 — Earth ยืนยัน 25 ต.ค.')
# ทางลาดข้างชานทางเข้า (E–F แถว 4–5): คาน B3 เอียงจากลาน +0.20 (ฝากคาน B7) ขึ้นไปตะวันออก 3.70 แล้วหักเป็นแนวราบ B3X 1.10 ที่ระดับพื้นชานทางเข้า (Earth 25 ต.ค.)
ZL, ZB = 0.80, 0.20
for yb in (0.45, 1.55, 1.75, 3.05):
    beam('B3', (18.125, yb), (21.825, yb), ZB, P1, top_b=ZL, lv=L1, st=US, note='คานเอียง +0.20 → +0.80 (S-09 B3;B3X — หักราบที่ระดับพื้นชานทางเข้า)')
for yb in (0.45, 3.05):
    H('B3X', yb, 21.825, 22.925, ZL, P1, lv=L1, st=US, note='ช่วงราบต่อจาก B3 ที่ระดับพื้น +0.80')
run('B8', 'V', 21.825, [0.45, 1.55, 1.75, 3.05], ZL, P1, lv=L1, st=US); V('B1', 22.925, 0.45, 3.05, ZL, P1, lv=L1, st=US, note='คานขอบชานพัก')
row('ทางลาด', 'B3 (เอียง) × 4, B3X, B8, B1, C0', 'ทางลาด 2 ช่อง (ช่องละกว้าง ~1.00) ขึ้นทิศตะวันออก ยาว 3.70 จาก +0.20 (ลาน S0 / คาน B7) ถึง +0.80 แล้วเป็นชานราบ 1.10 ที่เสา C0 ระดับเท่าพื้นชานทางเข้า · คานเอียง B3 รับขอบทางลาด B3X ช่วงราบ',
    'S-03, S-09 (B3;B3X), S-08 (C0)', US, 'Earth 25 ต.ค.: B3 เอียงลงแล้วหักราบ ระดับช่วงราบ = ระดับพื้น (ไม่รวมดรอปผิว) · ไม่มีแบบ A-15')
# คานยื่นรับเสาปูนปั้นชั้น 1 (BX ล่าง / B6X / B13X / B14X) + แผ่นยื่น SX สองข้าง
CANT1 = [('B6X', 'A', '2', '+y'), ('B6X', 'A', '2', '-x'), ('B6X', 'A', '4', '-y'), ('B6X', 'A', '4', '-x'), ('BX', 'A', '3', '-x'),
         ('BXL', 'B', '2', '+y'), ('BXL', 'C', '2', '+y'), ('BXL', 'B', '4', '-y'), ('BXL', 'C', '4', '-y'),
         ('B6X', 'F', '2', '+y'), ('B14X', 'F', '2', '+x'), ('B14X', 'F', '3', '+x'), ('B13X', 'F', '4', '+x'),
         ('B6X', 'D', '1', '+y'), ('B13X', 'D', '1', '-x'), ('B6X', 'E', '1', '+y'), ('B13X', 'E', '1', '+x')]
sx_slabs = []
for mk, g, r, d in CANT1:
    x, y = GX[g], GY[r]
    sx, sy = {'+x': (1, 0), '-x': (-1, 0), '+y': (0, 1), '-y': (0, -1)}[d]
    low = mk == 'BXL'; mk2 = 'BX' if low else mk
    top = 0.60 if low else Z1
    e = (x + 0.95 * sx, y + 0.95 * sy)
    beam(mk2, (x, y), e, top, P1, lv=L1, st=US if low else FD,
         note=('BX (ล่าง) หลังคาน +0.60 (Earth ยืนยัน) · ' if low else '') + f'คานยื่น 0.95 รับเสาปูนปั้น {g}{r} ทิศ {d} (S-09 ปลายเรียวลาด 1:6 — โมเดลใช้หน้าตัดเต็ม)')
    w = SEC[mk2][0]
    for side in (-1, 1):   # SX: แผ่นยื่นข้างคาน กว้าง 0.20 ยาวจากหน้าเสาถึงปลายคาน หลัง +0.20
        u0, u1 = 0.125, 0.95; v0, v1 = side * w / 2, side * (w / 2 + 0.20)
        pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        poly = [(round(x + sx * u - sy * v, 3), round(y + sy * u + sx * v, 3)) for u, v in pts]
        sx_slabs.append(poly)
row('คาน ชั้น 1', 'BX / B6X / B13X / B14X (คานยื่นใต้เสาปูนปั้น)', 'คานยื่น 0.95 จากศูนย์เสาใต้เสาปูนปั้นชั้น 1 ทุกต้น · B6X/B13X/B14X หน้าตัดต่อเนื่องคานริม (0.70) หลัง +0.75 · BX (ล่าง) 0.20×0.50 ที่ B2/C2/B4/C4 หลัง +0.60',
    'S-03, S-09, S-11, S-12', US, 'BX (ล่าง) +0.60 / SX +0.20 — Earth ยืนยัน 25 ต.ค.')

# ---- ชั้น 2 (S-04) หลังคาน +4.35
P2 = 'S-04'; L2 = '2F'
run('B15', 'H', y4, [xA, 4.0, 8.0, xD], Z2, P2, lv=L2); H('B13', y4, xD, xE, Z2, P2, lv=L2); run('B13A', 'H', y4, [xE, 19.8, xF], Z2, P2, lv=L2)
run('B4', 'H', y3, [xA, 4.0, 8.0, xD], Z2, P2, lv=L2); run('B17', 'H', y3, [xD, 15.65, xE], Z2, P2, lv=L2); run('B17A', 'H', y3, [xE, 19.8, xF], Z2, P2, lv=L2)
run('B15', 'H', y2, [xA, 4.0, 8.0, xD], Z2, P2, lv=L2); run('B15', 'H', y2, [xE, 19.8, xF], Z2, P2, lv=L2)
H('B14', y1, xD, xE, Z2, P2, lv=L2, note='B14/BST: B14 ระดับพื้นชั้น 2 · BST ที่ชานพัก +2.80')
H('B12', y5, xD, xE, Z2, P2, lv=L2)
run('B5', 'V', xA, [y4, y3, y2], Z2, P2, lv=L2); run('B5', 'V', 4.0, [y4, y3, y2], Z2, P2, lv=L2); run('B5', 'V', 8.0, [y4, y3, y2], Z2, P2, lv=L2)
V('B4A', xD, y5, y4, Z2, P2, lv=L2); V('B4A', xD, y4, y3, Z2, P2, lv=L2); run('B4', 'V', xD, [y3, 10.0, y2], Z2, P2, lv=L2); V('B4A', xD, y2, y1, Z2, P2, lv=L2)
V('B4A', xE, y5, y4, Z2, P2, lv=L2); run('B4A', 'V', xE, [y4, 6.65, y3], Z2, P2, lv=L2); run('B4', 'V', xE, [y3, 10.0, y2], Z2, P2, lv=L2); V('B4A', xE, y2, y1, Z2, P2, lv=L2)
run('B5', 'V', xF, [y4, 5.95, y3, 8.6, y2], Z2, P2, lv=L2)
H('B10', 10.0, xD, 15.65, Z2, P2, lv=L2, note='ขอบช่องบันได (หัวบันไดช่วงบน)')
run('B16', 'V', 15.65, [y3, 10.0, y1], Z2, P2, lv=L2)
H('B1', 10.0, 15.65, xE, Z2, P2, lv=L2)
run('B15', 'V', 19.8, [y4, 5.95, 6.65, y3, 8.6, 10.0, y2], Z2, P2, lv=L2, st=US, note='เลื่อนจาก x 19.60 (S-04) มาใต้ผนัง x 19.80 — Earth 25 ต.ค.')
H('B1', 10.0, xE, 19.8, Z2, P2, lv=L2); H('B1', 6.65, xE, 19.8, Z2, P2, lv=L2)
H('B1', 8.6, 19.8, xF, Z2, P2, lv=L2); H('B1', 5.95, 19.8, xF, Z2, P2, lv=L2)
H('BST', y1, xD, xE, 2.80, 'S-04 (B14/BST) + S-16', lv=L1, note='คานรับชานพักบันได ST2 หลัง +2.80 (ช่วง D1–E1 6.00)')
row('คาน ชั้น 2', 'B4…B17', 'คานชั้น 2 หลังคาน +4.35 (พื้น SP หลัง +4.45) · ริมนอก B15 0.20×0.40, B13/B13A 0.20×0.70 · แนว 3 B4/B17/B17A · แนว D/E B4/B4A · ห้องประชุมสภา B12 · ช่องบันได B10/B16 · ห้องน้ำ B15/B1',
    'S-04, S-10…S-13', FD)
row('คาน ชั้น 1–2', 'B15 แนว x 19.80', 'คาน B15 ห้องน้ำ (แถว 4→2) เลื่อนจาก x 19.60 ตามแบบโครงสร้าง มาที่ x 19.80 ใต้ผนัง W1-19 / W2-19 · คาน B1 ที่ชนปรับปลายตาม', 'S-03, S-04, A-03', US, 'Earth: ยึดแนวผนัง ขยับคาน (25 ต.ค.)')
row('คาน ชั้น 2', 'BST', 'คานชานพักบันได BST 0.25×0.50 แนว 1 (D1–E1) หลัง +2.80', 'S-04, S-13, S-16', FD)
# กันสาด: คานยื่น + คานขอบ (B1 0.15 / B2 0.20) หลัง +4.35
CN_OUT = Polygon([(-1.05, 2.95), (11.6, 2.95), (11.6, -1.05), (18.4, -1.05), (18.4, 2.95), (23.05, 2.95), (23.05, 13.05), (19.05, 13.05), (19.05, 16.05), (10.95, 16.05), (10.95, 13.05), (-1.05, 13.05)])
CANT2 = [('B5X', 'A', '2', '+y'), ('B5X', 'B', '2', '+y'), ('B5X', 'C', '2', '+y'), ('B5X', 'F', '2', '+y'), ('B5X', 'A', '4', '-y'), ('B5X', 'B', '4', '-y'), ('B5X', 'C', '4', '-y'), ('B5X', 'F', '4', '-y'),
         ('B15X', 'A', '2', '-x'), ('B15X', 'A', '4', '-x'), ('B15X', 'F', '2', '+x'), ('B4X', 'A', '3', '-x'), ('B17X', 'F', '3', '+x'), ('B13Y', 'F', '4', '+x'),
         ('B4X', 'D', '1', '+y'), ('B4X', 'E', '1', '+y'), ('B14Y', 'D', '1', '-x'), ('B14Y', 'E', '1', '+x'),
         ('B4X', 'D', '5', '-y'), ('B4X', 'E', '5', '-y'), ('B12X', 'D', '5', '-x'), ('B12X', 'E', '5', '+x')]
EDGE = {'+y': None}
def edge_c(x, y, d):   # ศูนย์คานขอบตามทิศยื่น
    if d == '+y': return 16.05 - 0.10 if y > 14 else 13.05 - 0.075
    if d == '-y': return -1.05 + 0.10 if y < 1 else 2.95 + 0.075
    if d == '-x': return 11.6 + 0.075 if y < 3 else (10.95 + 0.075 if y > 14 else -1.05 + 0.075)
    if d == '+x': return 18.4 - 0.075 if y < 3 else (19.05 - 0.075 if y > 14 else 23.05 - 0.075)
for mk, g, r, d in CANT2:
    x, y = GX[g], GY[r]; e = edge_c(x, y, d)
    (V if d in ('+y', '-y') else H)(mk, x if d in ('+y', '-y') else y, y if d in ('+y', '-y') else x, e, Z2, P2, lv=L2, note=f'คานยื่นรับกันสาด {g}{r} ทิศ {d}')
ring_c = CN_OUT.buffer(-0.075, join_style=2)
co = list(ring_c.exterior.coords)[:-1]
for a, b in zip(co, co[1:] + co[:1]):
    a = (round(a[0], 3), round(a[1], 3)); b = (round(b[0], 3), round(b[1], 3))
    mk = 'B2' if abs(a[1] - b[1]) < 1e-6 and (a[1] > 15.5 or a[1] < -0.5) else 'B1'
    if mk == 'B2':
        yy = 16.05 - 0.10 if a[1] > 15 else -1.05 + 0.10
        a, b = (a[0], yy), (b[0], yy)
    beam(mk, a, b, Z2, P2, lv=L2, note='คานขอบกันสาด')
row('กันสาด', 'คานยื่น B5X/B15X/B4X/B17X/B13Y/B14Y/B12X + คานขอบ B1/B2', 'กันสาดรอบอาคาร: คานยื่นจากเสาทุกต้นริมนอก หลัง +4.35 · คานขอบ B1 0.15×0.40 รอบ (ด้านแนว 1 และแนว 5 ใช้ B2 0.20×0.40)', 'S-04, S-09…S-13', FD,
    'ขอบนอกห่างกริด 1.05 · ข้างห้องประชุมสภา x 11.60 / 18.40 (แก้ Step 1 ด้วย)')

# ---- คานหลังคา (S-05) หลัง +8.85
P3 = 'S-05'; L3 = 'ROOF'
run('BR1', 'H', y4, [xA, 4.0, 8.0, xD], ZR, P3, lv=L3); run('BR2', 'H', y4, [xD, 15.0, xE], ZR, P3, lv=L3); H('BR1', y4, xE, xF, ZR, P3, lv=L3)
run('BR1', 'H', y2, [xA, 4.0, 8.0, xD], ZR, P3, lv=L3); run('BR2', 'H', y2, [xD, 15.0, xE], ZR, P3, lv=L3); H('BR1', y2, xE, xF, ZR, P3, lv=L3)
run('BR1', 'H', y3, [xA, 2.0, 4.0], ZR, P3, lv=L3); run('BR2', 'H', y3, [xD, 15.0, xE], ZR, P3, lv=L3); run('BR1', 'H', y3, [xE, 20.0, xF], ZR, P3, lv=L3)
H('BR2', y1, xD, xE, ZR, P3, lv=L3); H('BR2', y5, xD, xE, ZR, P3, lv=L3)
run('BR1', 'V', xA, [y4, y3, y2], ZR, P3, lv=L3); run('BR1', 'V', xF, [y4, y3, y2], ZR, P3, lv=L3)
run('BR1', 'V', xD, [y5, y4, y3, y2, y1], ZR, P3, lv=L3); run('BR1', 'V', xE, [y5, y4, y3, y2, y1], ZR, P3, lv=L3)
run('BR3', 'V', 4.0, [y4, y3, y2], ZR, P3, lv=L3); run('BR3', 'V', 8.0, [y4, y3, y2], ZR, P3, lv=L3)
run('BR1', 'V', 15.0, [y5, 0.975, y4], ZR, P3, lv=L3); run('BR1', 'V', 15.0, [y2, 14.025, y1], ZR, P3, lv=L3)
row('คานหลังคา', 'BR1 / BR2 / BR3', 'คานหลังคา หลัง +8.85: BR1 0.20×0.40 รอบนอก + แนว D/E + แนว 3 (A–B, E–F) + x 15.00 (แถว 1–2, 4–5) · BR2 0.20×0.40 ช่วง D–E แถว 1–5 · BR3 0.20×0.50 แนว B/C ยาว 8.00 (ไม่มีเสา B3/C3 ชั้น 2)',
    'S-05, S-14', FD)

# ================================================================ พื้น (S-03/S-04 + S-15 + S-17)
# หาช่องพื้นจากแนวศูนย์คาน (polygonize) แล้วติดป้ายตามข้อความใน DXF
def bays(level_top, sheet, extra_lines=()):
    L = []
    for x in members:
        if x['type'] not in ('beam',) or abs(nodes[x['i']]['z'] - level_top) > 0.06 or abs(nodes[x['j']]['z'] - level_top) > 0.06:
            continue
        a, b = nodes[x['i']], nodes[x['j']]
        L.append(LineString([(a['x'], a['y']), (b['x'], b['y'])]))
    L += [LineString(l) for l in extra_lines]
    faces = list(polygonize(unary_union(L)))
    T = [t for t in ext.texts(sheet) if re.match(r'^(SP|S\d|S\dX)$', t[0])]
    out = []
    for f in faces:
        lab = [t[0] for t in T if f.contains(Point(t[1], t[2]))]
        out.append((f, lab))
    return out
slabs = []
def slab(id_, mark, kind, top, poly, use, src, st=FD, note='', t=0.10, **kw):
    s = dict({'id': id_, 'mark': mark, 'kind': kind, 't': t, 'top': round(top, 3), 'polygon': [[round(x, 3), round(y, 3)] for x, y in poly], 'use': use,
              'material': 'C240', 'status': st, 'src': src}, **kw)
    if note: s['note'] = note
    if kind == 'precast': s['topping'] = 0.05
    slabs.append(s); return s
def ring(p):
    return list(p.exterior.coords)[:-1]
FOOT = Polygon([(0, 4), (12, 4), (12, 0), (18, 0), (18, 4), (22, 4), (22, 12), (18, 12), (18, 15), (12, 15), (12, 12), (0, 12)])
ns = Counter()
for top, sheet, lv, P in ((Z1, 14, '1F', 'S-03'), (Z2, 15, '2F', 'S-04')):
    for f, lab in bays(top, sheet):
        if not lab or not FOOT.contains(f.representative_point()) or (lv == '1F' and box(11.9, -1.3, 18.1, 3.9).contains(f.representative_point())):
            continue
        mk = lab[0] if len(set(lab)) == 1 else Counter(lab).most_common(1)[0][0]
        g = f.buffer(-0.10, join_style=2).simplify(0.03)
        if g.is_empty or g.area < 0.05:
            continue
        g = g if g.geom_type == 'Polygon' else max(g.geoms, key=lambda q: q.area)
        ns[lv] += 1
        if mk == 'SP':
            slab(f'{lv}-SP{ns[lv]:02d}', 'SP', 'precast', top + 0.10, ring(g), 'พื้นสำเร็จรูป SP + Topping', f'{P} + S-17 + S-01 ข้อ 4',
                 note='แผ่นพื้น Solid plank หนา 0.05 + คอนกรีต Topping 0.05 (เสริม Ø6 @0.20# หรือ WM Ø4 @0.15# — S-01 ข้อ 4.2) วางบนคาน · เนื้อที่ถึงหน้าคาน')
        else:
            slab(f'{lv}-{mk}-{ns[lv]:02d}', mk, 'cast', top, ring(g), 'พื้น คสล. หล่อในที่' + (' (ห้องน้ำ/ครัว ลดระดับ)' if True else ''), f'{P} + S-15 ({mk} หนา 0.10)',
                 note='หลังพื้นเสมอหลังคาน (ต่ำกว่า SP 0.10 ตาม S-17 "พื้นห้องน้ำ")')
row('พื้น', 'SP (ชั้น 1 / 2)', 'พื้นสำเร็จรูป Solid plank 0.05 + Topping 0.05 = 0.10 วางบนคาน หลังพื้น +0.85 / +4.45 · ช่องพื้นหาจากแนวคาน ติดป้าย SP ตาม DXF', 'S-03, S-04, S-17, S-01 ข้อ 4', FD,
    'พื้นที่คิดถึงหน้าคาน (หักครึ่งคาน 0.10)')
row('พื้น', 'S1 / S2 / S3', 'พื้น คสล. หล่อในที่ หนา 0.10 (ห้องน้ำ ครัว ห้องปั๊ม) หลังพื้นเสมอหลังคาน (+0.75 / +4.35) — ต่ำกว่า SP 0.10 ตาม S-17', 'S-03, S-04, S-15, S-17', FD)
# กันสาดชั้น 2 (S1 หล่อในที่ หลังเสมอคาน +4.35)
foot = Polygon([(0, 4), (12, 4), (12, 0), (18, 0), (18, 4), (22, 4), (22, 12), (18, 12), (18, 15), (12, 15), (12, 12), (0, 12)])
cring = CN_OUT.buffer(-0.15, join_style=2).difference(foot.buffer(0.125, join_style=2))
xs = sorted({round(x, 3) for x, y in cring.exterior.coords} | {round(x, 3) for i in cring.interiors for x, y in i.coords})
strips = []
for a, b in zip(xs, xs[1:]):
    part = cring.intersection(box(a, -10, b, 30))
    for g in getattr(part, 'geoms', [part]):
        if g.area > 1e-4:
            strips.append(list(g.bounds))
merged = True
while merged:
    merged = False
    for i in range(len(strips)):
        for j in range(len(strips)):
            if i != j and abs(strips[i][2] - strips[j][0]) < 1e-6 and abs(strips[i][1] - strips[j][1]) < 1e-6 and abs(strips[i][3] - strips[j][3]) < 1e-6:
                strips[i][2] = strips[j][2]; strips.pop(j); merged = True; break
        if merged: break
R = lambda x0, y0, x1, y1: [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
for k, (x0, y0, x1, y1) in enumerate(sorted(strips), 1):
    slab(f'CN-{k:02d}', 'S1', 'cast', Z2, R(x0, y0, x1, y1), 'กันสาดรอบอาคาร', 'S-04 (S1) + S-15', note='ช่องพื้นระหว่างคานริมอาคารกับคานขอบ (คานยื่นไม่หัก) · แบ่งสี่เหลี่ยมเพื่อเก็บในโมเดล')
row('พื้น', f'CN-01…CN-{len(strips):02d}', f'กันสาด S1 หนา 0.10 หลัง +4.35 รอบอาคาร {cring.area:.2f} ตร.ม. (ระหว่างหน้าคานริมอาคารกับหน้าคานขอบ)', 'S-04, S-15', FD)
# SX แผ่นยื่นข้างคานยื่นใต้เสาปูนปั้น
for k, p in enumerate(sx_slabs, 1):
    slab(f'SX-{k:02d}', 'SX', 'cast', 0.20, p, 'แผ่นยื่นรับเสาปูนปั้น', 'S-03 (SX) + S-15', US, 'หลังแผ่น +0.20 = ฐานเสาปูนปั้น (รูปด้าน) — Earth ยืนยัน')
row('พื้น', f'SX-01…SX-{len(sx_slabs):02d}', 'แผ่นยื่น SX หนา 0.10 กว้าง 0.20 สองข้างคานยื่นใต้เสาปูนปั้น หลัง +0.20', 'S-03, S-15', US, 'Earth ยืนยัน 25 ต.ค.')
# ชานทางเข้า / หน้าบันได (SP + S1 ข้าง) / ทางลาด / ชานพัก / S1X / พื้นวางบนดิน S0
slab('1F-PO-SP', 'SP', 'precast', ZP + 0.10, R(12.075, 0.075, 17.925, 3.875), 'ชานทางเข้า F6', 'S-03 (SP) + S-17', US, 'หลังพื้น +0.80 (A-03 F6)')
slab('1F-PO-S1a', 'S1', 'cast', ZP + 0.10, R(12.075, -1.0, 12.85, -0.125), 'ข้างบันไดหน้า', 'S-03 (S1) + S-15', AS, 'ระดับเท่าชานทางเข้า')
slab('1F-PO-S1b', 'S1', 'cast', ZP + 0.10, R(17.15, -1.0, 17.925, -0.125), 'ข้างบันไดหน้า', 'S-03 (S1) + S-15', AS)
slab('RP-1', 'S2', 'cast', ZL, R(18.125, 0.55, 21.725, 1.45), 'ทางลาดช่องใต้', 'S-03 (S2) + S-15', US, ramp={'low': ZB, 'high': ZL, 'dir': '+X'})
slab('RP-2', 'S2', 'cast', ZL, R(18.125, 1.85, 21.725, 2.95), 'ทางลาดช่องเหนือ', 'S-03 (S2) + S-15', US, ramp={'low': ZB, 'high': ZL, 'dir': '+X'})
slab('RP-L', 'S1', 'cast', ZL, R(21.925, 0.55, 22.85, 2.95), 'ชานราบปลายทางลาด', 'S-03 (S1) + S-15', US)
slab('RP-S1X', 'S1X', 'cast', Z1, R(18.125, 3.15, 21.7, 3.875), 'แผ่นยื่น S1X ระหว่างทางลาดกับผนังห้องน้ำ', 'S-03 (S1X) + S-15 (ยื่น ~0.85)', AS,
     'A-03: พื้นระหว่างทางลาดกับผนังอาคารสำหรับวางกระถางต้นไม้')
s0 = box(10.35, -2.85, 19.65, 3.875).difference(box(11.875, -1.2, 18.125, 3.875)).difference(box(18.125, 0.35, 19.65, 3.875))
s0 = s0 if s0.geom_type == 'Polygon' else max(s0.geoms, key=lambda q: q.area)
slab('S0-01', 'S0', 'ground', 0.20, [(round(x, 3), round(y, 3)) for x, y in ring(s0.simplify(0.001))], 'พื้นวางบนดิน S0 ลานหน้าอาคาร', 'S-03 (S0) + S-15', FD,
     'S0 หนา 0.10 บนทรายอัดแน่น 0.10 ขอบพับ · ตัดรอยต่อทุก 5.00×5.00 เว้นร่อง 1 ซม. หยอดยางมะตอย (S-15) · หลังพื้น +0.20 = F4 (A-03)',
     edge_thicken={'d': 0.10, 'w_top': 0.20, 'w_bot': 0.10, 'sides': list(range(len(ring(s0.simplify(0.001)))))})
row('พื้น', 'ชานทางเข้า / ทางลาด / S0', 'ชานทางเข้า SP +0.80 · ข้างบันไดหน้า S1 · ทางลาด S2 สองช่อง +0.20 → +0.80 · ชานราบ S1 +0.80 · S1X · ลานหน้าอาคาร S0 พื้นวางบนดิน +0.20 (ขอบพับลึก 0.10)',
    'S-03, S-15', US, 'S0 ตาม S-15 · ทางลาด/ชานทางเข้า Earth ยืนยัน 25 ต.ค.')

# ================================================================ บันได (S-16)
stairs = [
    {'id': 'ST1', 'mark': 'ST1', 'status': US, 'src': 'S-03 (ST1 กว้าง 12.85–17.15) + S-16 (สูง ≤ 0.60 ยาว ≤ 1.05 ท้องหนา 0.10)', 'material': 'C240',
     'flights': [{'start': [17.14, -1.40], 'dir': '+Y', 'width': 4.28, 'bottom': 0.20, 'top': 0.80, 'risers': 4, 'going': 0.30, 'waist': 0.10}],
     'note': 'ลูกตั้ง 4 × 0.15 / ลูกนอน 0.30 — Earth ยืนยัน 25 ต.ค.'},
    {'id': 'ST2', 'mark': 'ST2', 'status': FD, 'src': 'S-16 (ท้องหนา 0.20 · ช่วงล่างยาวราบ 3.60 ชานพัก 1.925 · ช่วงบน 2.70 ชานพัก 2.225 ถึงคาน BST) + S-03/S-04', 'material': 'C240',
     'flights': [{'start': [13.75, 9.50], 'dir': '+Y', 'width': 1.65, 'bottom': 0.85, 'top': 2.80, 'risers': 13, 'going': round(3.60 / 13, 4), 'waist': 0.20},
                 {'start': [13.85, 12.80], 'dir': '-Y', 'width': 1.65, 'bottom': 2.80, 'top': 4.45, 'risers': 10, 'going': 0.27, 'waist': 0.20}],
     'landings': [{'rect': [12.10, 13.10, 15.50, 14.90], 'top': 2.80, 't': 0.20}, {'rect': [13.85, 12.80, 15.50, 13.10], 'top': 2.80, 't': 0.20}],
     'note': 'ช่วงล่าง 13 ขั้น สูง 0.15 ลึก 0.277 · ช่วงบน 10 ขั้น สูง 0.165 ลึก 0.27 — คิดจากระดับและระยะราบใน S-16 · ปลายล่างวางบนคาน B10 ชั้น 1 (y 9.60) · ปลายบนชนคาน B10 ชั้น 2 (y 10.00)'},
]
row('บันได', 'ST2', 'บันไดภายใน 2 ช่วงกลับทาง ท้องหนา 0.20: ช่วงล่าง +0.85 → ชานพัก +2.80 (ยาวราบ 3.60) · ช่วงบน +2.80 → +4.45 (2.70) · ชานพักหนา 0.20 ฝากคาน BST แนว 1', 'S-16, S-03, S-04', FD,
    'ความกว้างช่วงละ 1.65 จากแปลน S-04 · ช่วงล่าง 13 ขั้น (0.15/0.277) · ช่วงบน 10 ขั้น (0.165/0.27)')
row('บันได', 'ST1', 'บันไดหน้าชานทางเข้า กว้าง 4.28 ท้องหนา 0.10 +0.20 → +0.80 · 4 ขั้น สูง 0.15 ลึก 0.30', 'S-03, S-16', US, 'Earth ยืนยัน 25 ต.ค.')

# ================================================================ โครงหลังคาเหล็ก (S-06) — ฉายเส้นแปลนลงระนาบหลังคา
def ch(id_, name, shape, d, kg, n=1, src='S-06'):
    secs[id_] = {'id': id_, 'kind': 'steel' if shape == 'C' else 'cold_formed', 'shape': shape, 'name': name, 'kg_m': round(kg * n, 2),
                 'dims': d, 'status': FD, 'src': src, 'note': 'น้ำหนัก/ม. ตามตาราง มอก.' + (f' × {n} ตัว' if n > 1 else '')}
    return id_
HR = ch('[125x65x6x8', '[125x65x6x8', 'C', {'h': 0.125, 'b': 0.065, 't': 0.006}, 13.4)
HR2 = ch('2[125x65x6x8', '2[125x65x6x8 (ประกบ)', 'C', {'h': 0.125, 'b': 0.130, 't': 0.006}, 13.4, 2)
CF = ch('C125x50x20x3.2', 'C-125x50x20x3.2', 'lipped_C', {'h': 0.125, 'b': 0.050, 'lip': 0.020, 't': 0.0032}, 7.51)
CF2 = ch('2C125x50x20x3.2', '2C-125x50x20x3.2 (ประกบกล่อง)', 'lipped_C', {'h': 0.125, 'b': 0.100, 'lip': 0.020, 't': 0.0032}, 7.51, 2, 'S-05 (CS)')
HAT = 'HAT-0.55'
secs[HAT] = {'id': HAT, 'kind': 'cold_formed', 'shape': 'other', 'name': 'แปสำเร็จรูป (Hat) หนา 0.55 มม.', 'kg_m': 0.55, 'dims': {'h': 0.032, 'b': 0.035, 't': 0.00055},
             'status': AS, 'src': 'S-06 + S-01 ข้อ 6.1', 'note': 'น้ำหนัก/ม. สมมติ — ราคาแปสำเร็จรูปคิดต่อเมตร'}
roof = m['roofs'][0]
W = [roofgen.Wing('M', (-1.5, 2.5, 23.5, 13.5), 8.10, math.tan(math.radians(35)), 'X', 2.5, 3.5), roofgen.Wing('C', (10.5, -1.5, 19.5, 16.5), 8.10, math.tan(math.radians(35)), 'Y', 1.5, 2.5)]
PLN = [(Polygon([(p[0], p[1]) for p in pl['pts']]), pl) for pl in roof['planes'] if pl.get('kind', 'cover') == 'cover']
def _fz(pl):
    a, b, c = pl['pts'][:3]
    u = [b[i] - a[i] for i in range(3)]; v = [c[i] - a[i] for i in range(3)]
    n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    return (lambda X, Y, a=a, n=n: a[2] - (n[0] * (X - a[0]) + n[1] * (Y - a[1])) / n[2]), (-n[0] / n[2], -n[1] / n[2])
def plane_of(x, y, d=None):
    """ระนาบที่ (x, y): ถ้าระบุทิศ d (จันทัน) เลือกระนาบที่ลาดตามทิศนั้น (รวมปั้นหยาใต้หลังคาจั่ว) · ไม่ระบุ = ผิวบนสุด"""
    cand = []
    for poly, pl in PLN:
        if poly.buffer(1e-4).contains(Point(x, y)):
            f, g = _fz(pl); cand.append(((pl['wing'], pl['face']), f, g))
    if not cand:
        return None, None
    if d is not None:
        par = [c for c in cand if math.hypot(*c[2]) > 1e-6 and abs(c[2][0] * d[0] + c[2][1] * d[1]) / math.hypot(*c[2]) > 0.95]
        if par:
            cand = par
    k, f, g = max(cand, key=lambda c: c[1](x, y))
    return k, f
def zs(x, y, d=None):
    k, f = plane_of(x, y, d)
    return f(x, y) if f else None
COS = math.cos(math.radians(35))
STACK = 0.032 / COS + 0.02            # แปสำเร็จรูป 32 มม. + กระเบื้องวางบนแป (ระดับผิวหลังคาในโมเดล = หลังแป)
tm = Counter()
def steel(mk, tp, a, b, sec, src, st=FD, note=None, mat='SS400'):
    tm[mk] += 1
    return mem(f'{mk}-{tm[mk]:03d}', mk, tp, a, b, sec, src, st, mat, note, group='roof_frame', level='ROOF')
def drape(pts, sec, mk, tp, src, depth, st=FD, note=None, mat='SS400', below=0.0, along=False):
    """วางเส้นแปลนบนผิวหลังคา (ศูนย์ชิ้น = ผิว − แป − ครึ่งลึก/cos) แบ่งท่อนที่เปลี่ยนระนาบ · along=True (จันทัน) = อยู่บนระนาบที่ลาดตามแนวชิ้น"""
    out = []
    for p, q in zip(pts, pts[1:]):
        L = math.dist(p, q)
        if L < 0.05:
            continue
        d = ((q[0] - p[0]) / L, (q[1] - p[1]) / L) if along else None
        if not along:   # อกไก่/ตะเฆ่: อยู่บนรอยต่อระนาบ = เส้นตรง ใช้ผิวบนสุดที่ปลายทั้งสอง
            za, zb = zs(*p), zs(*q)
            if za is None or zb is None:
                continue
            off = STACK + depth / 2 / COS + below
            out.append(steel(mk, tp, (round(p[0], 3), round(p[1], 3), round(za - off, 3)), (round(q[0], 3), round(q[1], 3), round(zb - off, 3)), sec, src, st, note, mat))
            continue
        n = max(2, int(L / 0.05))
        P = lambda t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
        cuts = [0.0]; prev = plane_of(*P(0.5 / n), d)[0]
        for k in range(1, n):
            cur = plane_of(*P((k + 0.5) / n), d)[0]
            if cur != prev and cur is not None and prev is not None:
                cuts.append(k / n)
            prev = cur if cur is not None else prev
        cuts.append(1.0)
        for t0, t1 in zip(cuts, cuts[1:]):
            A, B, M = P(t0), P(t1), P((t0 + t1) / 2)
            k, f = plane_of(*M, d)
            if f is None or math.dist(A, B) < 0.05:
                continue
            off = STACK + depth / 2 / COS + below
            out.append(steel(mk, tp, (round(A[0], 3), round(A[1], 3), round(f(*A) - off, 3)), (round(B[0], 3), round(B[1], 3), round(f(*B) - off, 3)), sec, src, st, note, mat))
    return out
# จันทันจาก DXF (ชั้น ST_Roof_จันทัน): HIDDEN3 = [125x65x6x8 · CENTER = C-125x50x20x3.2 @≤1.00 · เส้นทึบ = อกไก่
S6 = ext.S[17]; X6 = ext.X0[17]
nr = nh = 0
for q in S6['prims']:
    if q.get('layer') != 'ST_Roof_จันทัน' or q['kind'] not in ('line', 'poly'):
        continue
    p = [(round(a[0] - X6, 3), round(a[1] - ext.Y0, 3)) for a in q['p']]
    if q.get('closed'): p = p + [p[0]]
    lt = q.get('lt') or ''
    if lt == '':
        continue   # อกไก่ ทำแยก
    sec, mk = (HR, 'RF1') if lt.startswith('HIDDEN') else (CF, 'RF2')
    drape(p, sec, mk, 'rafter', 'S-06 (เส้นจันทันใน DXF)', 0.125, along=True)
# อกไก่ 2[ : ผืนหลัก y 8 x 1→21 · ผืนขวาง x 15 y 0→15 (ถึงขอบปั้นลมจั่วปั้นหยา แนว 5 / แนว 1)
drape([(1.0, 8.0), (21.0, 8.0)], HR2, 'RG', 'ridge', 'S-06 (อกไก่ 2[125x65x6x8)', 0.125)
drape([(15.0, 0.0), (15.0, 7.0)], HR2, 'RG', 'ridge', 'S-06', 0.125); drape([(15.0, 9.0), (15.0, 15.0)], HR2, 'RG', 'ridge', 'S-06', 0.125)
steel('RG', 'ridge', (15.0, 7.0, round(zs(15.0, 6.99) - STACK - 0.125 / 2, 3)), (15.0, 9.0, round(zs(15.0, 6.99) - STACK - 0.125 / 2, 3)), HR2, 'S-06 (อกไก่ผืนขวางต่อใต้ผืนหลัก)', note='ช่วงอยู่ใต้หลังคาผืนหลัก')
# ตะเฆ่สัน / ตะเฆ่ราง 2[ (ชั้น ST_Roof_ตะเข่)
for q in S6['prims']:
    if q.get('layer') != 'ST_Roof_ตะเข่':
        continue
    p = [(round(a[0] - X6, 3), round(a[1] - ext.Y0, 3)) for a in q['p']]
    valley = abs(p[1][1] - 7.0) < 1e-3 or abs(p[1][1] - 9.0) < 1e-3
    for a, b in ((p[0], p[1]), (p[1], p[2])):
        drape([a, b], HR2, 'VL' if valley else 'HP', 'valley' if valley else 'hip', 'S-06 (' + ('ตะเฆ่ราง' if valley else 'ตะเฆ่สัน') + ' 2[125x65x6x8)', 0.125)
# เสาตั้งเหล็ก CS 2C-125x50x20x3.2 บน PL-200x200x12 (S-05) — จากหลังคานหลังคาถึงท้องอกไก่
CS = [(2.0, 8.0), (4.0, 8.0), (8.0, 8.0), (12.0, 8.0), (15.0, 8.0), (18.0, 8.0), (20.0, 8.0), (15.0, 12.025), (15.0, 14.025), (15.0, 3.975), (15.0, 0.975)]
for x, y in CS:
    z_top = zs(x, y) - STACK - 0.125 / COS
    if abs(y - 8) < 1e-6 and 13.5 < x < 16.5:
        z_top = zs(15.0, 6.99) - STACK - 0.125   # ใต้อกไก่ผืนขวาง
    steel('CS', 'steel_column', (x, y, ZR), (x, y, round(z_top, 3)), CF2, 'S-05 (CS เสาตั้งเหล็ก 2[-125x50x20x3.2 บน PL-200x200x12 ฝังเหล็ก 2Ø9 0.30)', mat='CF')
# ปิดปลายจันทัน C-125x50x20x3.2 รอบชายคา
eo = [(-1.5, 2.5), (10.5, 2.5), (10.5, -1.5), (19.5, -1.5), (19.5, 2.5), (23.5, 2.5), (23.5, 13.5), (19.5, 13.5), (19.5, 16.5), (10.5, 16.5), (10.5, 13.5), (-1.5, 13.5)]
for a, b in zip(eo, eo[1:] + eo[:1]):
    za = 8.10 - STACK - 0.125 / 2
    steel('FC', 'other', (a[0], a[1], round(za, 3)), (b[0], b[1], round(za, 3)), CF, 'S-06 (ปิดปลายจันทัน C-125x50x20x3.2)', mat='CF')
roof['purlin'] = {'section': HAT, 'spacing': 0.32}
roof['src'] += ' · โครง S-06'
roof['note'] = roof.get('note', '') + ' · แปสำเร็จรูป @0.32 (S-06) · ผิวหลังคาในโมเดล = หลังแป'
row('หลังคา', 'RF1 / RF2', 'จันทัน: [125x65x6x8 (เส้นหนาใน S-06) และ C-125x50x20x3.2 @ ≤ 1.00 ม. ตามเส้นใน DXF วางบนระนาบที่ลาดตามแนวจันทัน (จันทันปลายปั้นหยาแนว A/F/1/5 อยู่บนระนาบปั้นหยา รวมช่วงใต้หลังคาจั่ว)', 'S-06', FD, 'รอบ 2: แก้จันทันปั้นหยา y 7/8/9 (แนว A, F) และ x 14/15/16 (แนว 1, 5) ที่เดิมวางบนระนาบหลังคาจั่ว')
row('หลังคา', 'RG / HP / VL', 'อกไก่ ตะเฆ่สัน ตะเฆ่ราง 2[125x65x6x8 ประกบ · อกไก่ผืนหลัก x 1.00→21.00 · ผืนขวาง y 0.00→15.00 (ถึงขอบปั้นลมจั่วปั้นหยา) · ตะเฆ่สันวิ่งจากมุมชายคาถึงจุดตัดอกไก่ตาม S-06 (ช่วงใต้หลังคาจั่วอยู่ในระนาบหลังคาจั่วพอดี)', 'S-06, A-06/A-07', FD,
    'รอบ 2: จั่วปั้นหยา = หลังคาจั่วยื่นคลุมถึงขอบปั้นลม หน้าจั่วถอยเข้า 1.00 (Earth ชี้ผืนขวางถึงแนว 1/5)')
row('หลังคา', 'CS × 11', 'เสาตั้งเหล็ก 2[-125x50x20x3.2 บนแผ่นเหล็ก PL-200x200x12 รับอกไก่ (แนว 3 และ x 15.00)', 'S-05', FD)
row('หลังคา', 'FC', 'ปิดปลายจันทัน C-125x50x20x3.2 รอบชายคา', 'S-06', FD)
row('หลังคา', 'แป', 'แปสำเร็จรูป @0.32 ม. (ตามมาตรฐานผู้ผลิต) — คิดจากระนาบหลังคา', 'S-06, S-01 ข้อ 6', FD, 'น้ำหนัก/ม. สมมติ 0.55 กก./ม.')
row('หลังคา', 'หน้าจั่วปั้นหยา', 'โครงหน้าจั่วปั้นหยา (ช่องลม WW01) ไม่มีในแบบโครงสร้าง — ไม่ใส่', 'A-05, S-06', US, 'Earth ให้ข้าม 25 ต.ค.')

# ================================================================ ผนัง: ปรับฐาน/ยอดตามคาน + เสาเอ็น/ทับหลัง (กติกาเดียวกับห้องน้ำ)
walls = m['walls']; OTs = m['opening_types']; opsw = defaultdict(list)
for o in m['openings']:
    opsw[o['wall']].append(o)
def dseg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
RCB = [x for x in members if x['type'] == 'beam']
def beam_above(w, zlev):
    a, b = w['path']; mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    best = None
    for x in RCB:
        p, q = nodes[x['i']], nodes[x['j']]
        if abs(p['z'] - zlev) > 0.06 or abs(q['z'] - zlev) > 0.06:
            continue
        if dseg(mid, (p['x'], p['y']), (q['x'], q['y'])) <= 0.16:
            h = secs[x['section']]['h']
            best = min(best, zlev - h) if best is not None else zlev - h
    return best
nt = 0
for w in walls:
    if w['id'].startswith(('P1', 'P2')):
        continue
    if abs(w['top'] - 4.45) < 1e-6:
        zb = beam_above(w, Z2); w['top'] = round(zb if zb is not None else Z2, 3); nt += 1
        w['note'] = (w.get('note', '') + (f' · ยอดผนัง = ท้องคาน {zb:+.2f}' if zb is not None else ' · ยอดผนัง = ท้องพื้นชั้น 2 +4.35')).strip(' ·')
    elif abs(w['top'] - 8.85) < 1e-6:
        zb = beam_above(w, ZR)
        if zb is not None:
            w['top'] = round(zb, 3); nt += 1
            w['note'] = (w.get('note', '') + f' · ยอดผนัง = ท้องคานหลังคา {zb:+.2f}').strip(' ·')
        else:
            w['note'] = (w.get('note', '') + ' · ไม่มีคานหลังคาเหนือแนวนี้ — ยอด +8.85 เท่าหลังคานหลังคา (Earth ยืนยัน)').strip(' ·')
    if abs(w['bottom'] - 4.45) < 1e-6:
        w['bottom'] = Z2 + 0.10 if not w.get('exterior') else Z2 + 0.10
ncast = 0
for w in walls:
    if w['id'].startswith(('P1', 'P2')) or abs(w['bottom'] - 0.85) > 1e-6 and abs(w['bottom'] - 4.45) > 1e-6:
        continue
    a, b = w['path']; hits = Counter()
    for k in range(1, 10):
        pt = Point(a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10)
        for s2 in slabs:
            if s2['kind'] == 'cast' and abs(s2['top'] - (w['bottom'] - 0.10)) < 0.02 and Polygon(s2['polygon']).buffer(0.12).contains(pt):
                hits[s2['top']] += 1; break
    if sum(hits.values()) >= 5:
        w['bottom'] = round(w['bottom'] - 0.10, 3); ncast += 1
        w['note'] = (w.get('note', '') + ' · ฐานผนังบนพื้นหล่อในที่ห้องน้ำ (ต่ำกว่า SP 0.10)').strip(' ·')
row('ผนัง', 'ฐานผนังห้องน้ำ', f'ผนังที่วางบนพื้น S หล่อในที่ (ห้องน้ำ) ฐานลดลง 0.10 ตามหลังพื้น ({ncast} แผ่น)', 'S-17', FD)
row('ผนัง', 'ยอดผนัง', f'ผนังชั้น 1 / ชั้น 2 ปรับยอดให้ชนท้องคานที่อยู่เหนือแนวผนัง ({nt} แผ่น) · ไม่มีคานเหนือ = ท้องพื้น', 'S-04, S-05', FD)
# ทับหลัง / คานเอ็นใต้ช่อง / เสาเอ็น (กติกาที่ตกลงกับ Earth 21 ต.ค. — ใช้ซ้ำจากห้องน้ำ)
c10 = rc(0.10, 0.10, 'ข้อกำหนด Earth (หนาเท่าผนัง)')
MAS = ('brick_mon', 'brick_mon_full', 'aac', 'block', 'block_07')
WL = {w['id']: w for w in walls}
vert = [(nodes[x['i']]['x'], nodes[x['i']]['y'], min(nodes[x['i']]['z'], nodes[x['j']]['z']), max(nodes[x['i']]['z'], nodes[x['j']]['z'])) for x in members if x['type'] == 'column']
def has_vert(xy, z0, z1, tol=0.16):
    return any(math.dist(xy, (v[0], v[1])) <= tol and v[2] <= z0 + 0.3 and v[3] >= z1 - 0.3 for v in vert)
nl = nsl = nst = 0
for wid, ops in opsw.items():
    w = WL[wid]
    if w['kind'] not in MAS:
        continue
    a, b = w['path']; L = math.dist(a, b); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    P = lambda u: (a[0] + ux * u, a[1] + uy * u)
    for o in ops:
        t = OTs[o['type']]; u0, u1 = o['at'] - t['w'] / 2, o['at'] + t['w'] / 2
        sill = t.get('sill', 0); ztop = w['bottom'] + sill + t['h']
        e0, e1 = max(0, u0 - 0.20), min(L, u1 + 0.20)
        if w['top'] - ztop >= 0.10 - 1e-6:
            nl += 1; z = round(ztop + 0.10, 3)
            mem(f'LT-{nl:02d}', 'ทับหลัง', 'lintel', (*P(e0), z), (*P(e1), z), c10, f'ข้อกำหนด Earth · เหนือ {o["id"]}', US)
        if sill > 1e-6:
            nsl += 1; z = round(w['bottom'] + sill, 3)
            mem(f'LS-{nsl:02d}', 'คานเอ็น', 'lintel', (*P(e0), z), (*P(e1), z), c10, f'ข้อกำหนด Earth · ใต้ {o["id"]}', US)
        for u in (u0 - 0.05, u1 + 0.05):
            if u < 0.05 or u > L - 0.05:
                continue
            xy = P(u)
            if has_vert(xy, w['bottom'], w['top'], 0.15):
                continue
            nst += 1
            mem(f'SA-{nst:02d}', 'เสาเอ็น', 'stiffener', (*xy, w['bottom']), (*xy, w['top']), c10, f'ข้าง {o["id"]} — ข้อกำหนด Earth', US)
            vert.append((*xy, w['bottom'], w['top']))
ne = nsp = nh = 0
def in_open(w, u, z=None):
    for o in opsw.get(w['id'], []):
        t = OTs[o['type']]
        if o['at'] - t['w'] / 2 - 0.05 <= u <= o['at'] + t['w'] / 2 + 0.05:
            if z is None:
                return True
            z0 = w['bottom'] + t.get('sill', 0); z1 = z0 + t['h']
            if z0 - 0.05 <= z <= z1 + 0.05:
                return True
    return False
for w in walls:
    if w['kind'] not in MAS or w['top'] - w['bottom'] < 0.5 or w['id'].startswith(('P1', 'P2')):
        continue
    a, b = w['path']; L = math.dist(a, b); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    P = lambda u: (a[0] + ux * u, a[1] + uy * u)
    for u in (0.05, L - 0.05):
        xy = P(u)
        near_wall = any(o is not w and o['kind'] in MAS and dseg(xy, *o['path']) <= 0.11 and abs(o['bottom'] - w['bottom']) < 0.5 for o in walls)
        if not has_vert(xy, w['bottom'], w['top']) and not near_wall:
            ne += 1
            mem(f'SE-{ne:02d}', 'เสาเอ็น', 'stiffener', (*xy, w['bottom']), (*xy, w['top']), c10, f'ปลายผนัง {w["id"]} ไม่ติดเสา/ผนัง — ข้อกำหนดเสาเอ็น', US)
            vert.append((*xy, w['bottom'], w['top']))
    us = sorted(min(max((v[0] - a[0]) * ux + (v[1] - a[1]) * uy, 0), L) for v in vert
                if abs((v[0] - a[0]) * uy - (v[1] - a[1]) * ux) <= 0.16 and -0.16 <= (v[0] - a[0]) * ux + (v[1] - a[1]) * uy <= L + 0.16 and v[2] <= w['bottom'] + 0.3 and v[3] >= w['top'] - 0.3)
    us = sorted(set([0.0, L] + us))
    for u0, u1 in zip(us, us[1:]):
        g = u1 - u0
        if g > 3.0 + 1e-6:
            n = math.ceil(g / 3.0)
            for k in range(1, n):
                u = u0 + g * k / n
                if in_open(w, u):
                    continue
                nsp += 1; xy = P(u)
                mem(f'SM-{nsp:02d}', 'เสาเอ็น', 'stiffener', (*xy, w['bottom']), (*xy, w['top']), c10, f'{w["id"]} ช่วงยาว {g:.2f} ม. > 3 ม. — ข้อกำหนดเสาเอ็น', US)
                vert.append((*xy, w['bottom'], w['top']))
    Hh = w['top'] - w['bottom']
    if Hh > 3.0 + 1e-6:
        z = round((w['bottom'] + Hh / 2) * 20) / 20
        cuts = [0.0, L]
        for o in opsw.get(w['id'], []):
            t = OTs[o['type']]
            if in_open(w, o['at'], z):
                cuts += [max(0, o['at'] - t['w'] / 2), min(L, o['at'] + t['w'] / 2)]
        cuts = sorted(cuts)
        for u0, u1 in zip(cuts[0::2], cuts[1::2]):
            if u1 - u0 >= 0.20:
                nh += 1
                mem(f'LH-{nh:02d}', 'คานเอ็น', 'lintel', (*P(u0), z), (*P(u1), z), c10, f'{w["id"]} สูง {Hh:.2f} ม. > 3 ม. — คานเอ็นกลางความสูง', US)
for x in members:
    if x['type'] in ('stiffener', 'lintel'):
        x['note'] = (x.get('note', '') + ' · RB6 2 เส้น ปลอก RB6@0.20 (ข้อกำหนด Earth)').strip(' ·')
row('ทับหลัง/เสาเอ็น', f'LT {nl} · LS {nsl} · SA {nst} · SE {ne} · SM {nsp} · LH {nh}', 'ทับหลังเหนือช่อง / คานเอ็นใต้ช่องที่ยกจากพื้น / เสาเอ็นข้างช่อง / ปลายผนังลอย / ผนังยาว > 3 ม. / ผนังสูง > 3 ม. คานเอ็นกลางความสูง · 0.10×0.10 ยื่นเลยช่อง 0.20',
    'ข้อกำหนด Earth 21 ต.ค. (ใช้ซ้ำจากห้องน้ำ)', US, 'แบบไม่ระบุ')

# ================================================================ บันทึก
bm = dict(m)
bm['meta'] = dict(m['meta'], name='สนง. ทุ่งสมอ — Step 2 โครงสร้าง', stage=2)
bm['materials'] = mats
bm['sections'] = list(secs.values())
used = {v for x in members for v in (x['i'], x['j'])} | {s['node'] for s in supports}
bm['nodes'] = [n for n in nodes.values() if n['id'] in used]
bm['members'] = members
bm['supports'] = supports
bm['slabs'] = slabs
bm['stairs'] = stairs
bm['walls'] = walls
bm['design'] = {}
bm['history'] = m['history'] + [{'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบ Step 2)', 'sections': ['*'],
                                 'note': 'โครงสร้าง: เข็ม ฐานราก เสา คาน พื้นสำเร็จรูป/หล่อในที่ บันได โครงหลังคาเหล็ก เสาเอ็น-ทับหลัง'}]
json.dump(bm, open('stage2.bm.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rows, open('stage2_rows.json', 'w'), ensure_ascii=False, indent=1)
print(Counter(x['mark'] for x in members).most_common())
print(len(members), 'members', len(slabs), 'slabs', len(supports), 'supports')
