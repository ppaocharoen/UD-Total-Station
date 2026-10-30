# Step 4a บ้านแนน: ผิวพื้น F1–F5 ตามห้อง · ฝ้า C1/C2 ตามแปลนฝ้า (ฝ้าหลุม + ขอบตั้ง) · บัวฝ้า · ฝ้าชายคา Conwood
# ห้อง = เซลล์ระหว่างผนัง/เสาบนพื้นระดับเดียวกัน (rooms.py) + เส้นแบ่งเสมือนตรงที่ห้องเปิดโล่งต่อกัน
import json, math, sys, collections
import numpy as np
from rooms import raster, regions, cell, rects, tags, H

m = json.load(open('../b/stage3.bm.json'))
from fixwalls import fix
WINFO, CAV = fix(m)   # ผนังหนาจาก Step 1 → แผ่นตามแกนอิฐจริง (ก่อนแบ่งห้อง)
from fixwalls import fix_pilasters
PILMERGE = fix_pilasters(m)
SPEC = {
    'F1': 'พื้น F1 กระเบื้องแกรนิโต้ 60×60 ซม. ผิวมัน',
    'F2': 'พื้น F2 ไม้ Engineer Wood หนา 14 มม. วางบนตงเหล็กกล่อง',
    'F3': 'พื้น F3 กระเบื้องแกรนิโต้ 60×60 ซม. กันลื่น',
    'F4': 'พื้น F4 คอนกรีตพิมพ์ลาย',
    'F5': 'พื้น F5 กระเบื้องเซรามิค 60×120 ซม. ผิวหยาบ',
    'C1': 'ฝ้า C1 ยิปซัมบอร์ด 9 มม. ฉาบเรียบทาสี โครงเคร่าเหล็กชุบสังกะสี @0.40',
    'C2': 'ฝ้า C2 ยิปซัมบอร์ดกันชื้น 9 มม. ฉาบเรียบทาสี โครงเคร่าเหล็กชุบสังกะสี @0.40',
    'SOF': 'ฝ้าชายคา ไม้ระแนงสำเร็จรูป Conwood ทาสีย้อมไม้เทียม',
    'COR': 'บัวฝ้าสำเร็จรูป',
}
SRC_F = 'A-02 รายการวัสดุตกแต่ง + A-04/A-05 ป้ายห้อง (DXF)'
SRC_C = 'แปลนฝ้าชั้นล่าง/ชั้นบน (PDF หน้า 8–9) + A-11'

FLOORS = {
    '1F': dict(sheet='A-04#2', z=(0.0, 1.0),
               # เส้นแบ่งเสมือน (ห้องเปิดโล่งต่อกัน / เปลี่ยนวัสดุพื้น)
               virt=[((4.0, 17.40), (10.30, 17.40)),    # พักผ่อน | โถง (เส้นเปลี่ยนพื้น F2/F1 แนว 3)
                     ((10.30, 11.40), (10.30, 17.40)),  # โถง | เตรียมอาหาร (แนว F แถว 3–6)
                     ((7.10, 11.40), (10.30, 11.40)),   # โถง | โถงทางเข้า (ช่องโล่ง) แนว 6
                     ((7.10, 7.926), (10.30, 7.926)),   # โถงทางเข้า +0.55 | +0.50
                     ((3.95, 11.40), (3.95, 14.10)),    # ห้องพระ | โถง (แนวประตู D4)
                     ((6.375, -0.2), (6.375, 5.9)),     # จอดรถ | ลานหน้าบ้าน (หน้าเสา D1)
                     ((15.2, 20.5), (17.6, 20.5))],     # ลานหลังบ้านใต้หลังคา H–I/2A–1 | ลานหลังบ้านโล่ง (แนว 1)
               extra=[],
               move={'ห้องน้ำ 3': (0.9, 16.6), 'ห้องน้ำ 2': (2.9, 16.6), '?': (-0.6, 12.0)},
               join={'ห้องน้ำ 1': [(17.67, 12.74)]},   # ส่วนยื่นห้องน้ำ 1 นอกแนว I (พื้นระดับเดียวกัน)
               rename={'?': ('ทางเดินข้างบ้าน', 0.25, 'CL2')}),
    '2F': dict(sheet='A-05', z=(4.4, 4.8),
               virt=[((15.15, 7.40), (15.15, 8.70))],   # ห้องนอน 3 | ลานหน้าบ้านขวา (ช่วงประตู)
               extra=[], join={}, move={'ห้องน้ำ 4': (0.2, 10.0), 'ห้องน้ำ 5': (16.2, 10.0), 'ห้องน้ำ 6': (12.2, 16.0), 'ห้องน้ำ 7': (14.0, 16.0)},
               rename={}),
}

def add_lines(R, lines, w=0.02):
    X, Y = R['X'], R['Y']
    for (ax, ay), (bx, by) in lines:
        L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
        t = (X - ax) * ux + (Y - ay) * uy; d = np.abs((X - ax) * -uy + (Y - ay) * ux)
        R['wall'] |= (t >= -w) & (t <= L + w) & (d <= w)

def add_extra(R, ex):
    for x0, y0, x1, y1, zt in ex:
        R['S'].append({'id': 'extra', 'top': zt, 'polygon': [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]})
        k = len(R['S']) - 1; msk = (R['X'] >= x0) & (R['X'] <= x1) & (R['Y'] >= y0) & (R['Y'] <= y1); R['lev'][msk] = k

ROOMS = {}   # (floor, name) → dict(mask, F, lv, cl, R)
for fl, cf in FLOORS.items():
    m2 = dict(m); m2['walls'] = [w for w in m['walls'] if w['kind'] != 'other']   # ฉากกระจกห้องอาบน้ำไม่แบ่งห้อง
    R = raster(m2, *cf['z']); add_extra(R, cf['extra']); R['real'] = R['wall'].copy(); add_lines(R, cf['virt'])
    lab, z = regions(R)
    for t in tags(cf['sheet']):
        nm = t['name']
        if nm in cf['rename']: t['name'], t['lv'], t['cl'] = cf['rename'][nm]
        at = cf['move'].get(nm, t['at']); iy, ix = cell(R, at); l = lab[iy, ix]
        if l == 0:
            ys, xs = np.nonzero(lab); k = np.argmin((ys - iy) ** 2 + (xs - ix) ** 2); l = lab[ys[k], xs[k]]
        key = (fl, t['name'])
        if key in ROOMS:   # ชื่อซ้ำ (โถงทางเดิน / ลานหน้าบ้าน หลายช่วง) → ต่อท้ายเลข
            k = 2
            while (fl, f"{t['name']} ({k})") in ROOMS: k += 1
            key = (fl, f"{t['name']} ({k})")
        same = [k for k, r in ROOMS.items() if k[0] == fl and r['label'] == l]
        if same and ROOMS[same[0]]['F'] == t['F']:   # ห้องเปิดโล่งต่อกัน วัสดุพื้นเดียวกัน → ห้องเดียว
            r = ROOMS.pop(same[0]); ROOMS[(fl, same[0][1] + ' + ' + t['name'] if t['name'] not in same[0][1] else same[0][1])] = r; continue
        ROOMS[key] = dict(label=l, F=t['F'], lv=t['lv'], cl=t['cl'], R=R, lab=lab, z=z, at=at, fl=fl, extra_labels=[])
        for p in cf['join'].get(t['name'], []):
            iy, ix = cell(R, p); ROOMS[key]['extra_labels'].append(lab[iy, ix])
    # ตรวจ: ช่องเดียวมีหลายป้าย / ช่องใหญ่ไม่มีป้าย
    by = collections.defaultdict(list)
    for k, r in ROOMS.items():
        if k[0] == fl:
            by[r['label']].append(k[1])
            for e in r['extra_labels']: by[e].append(k[1] + '*')
    for l, ns in by.items():
        if len(ns) > 1: print('!! หลายป้ายในช่องเดียว', fl, ns)
    for l in range(1, lab.max() + 1):
        a = (lab == l).sum() * H * H
        if l not in by and a > 1.0:
            ys, xs = np.nonzero(lab == l); print(f'.. ไม่มีป้าย {fl} ช่อง {l} {a:.2f} ตร.ม. @({R["x0"]+xs.mean()*H:.2f},{R["y0"]+ys.mean()*H:.2f}) z={np.nanmean(z[lab==l]):.2f}')

for k, r in sorted(ROOMS.items()):
    msk = np.isin(r['lab'], [r['label']] + r['extra_labels']); r['mask'] = msk; a = msk.sum() * H * H
    zs = np.nanmean(r['z'][msk])
    flag = '' if r['lv'] is None or abs(zs - r['lv']) < 0.011 else f'  ** พื้นโครงสร้าง {zs:.2f} ≠ ป้าย {r["lv"]}'
    print(f'{k[0]} {k[1]:22s} {r["F"]} {r["lv"]} {r["cl"]} A={a:6.2f}{flag}')
json.dump({f'{k[0]}|{k[1]}': dict(F=r['F'], lv=r['lv'], cl=r['cl'], area=float((r['lab'] == r['label']).sum() * H * H)) for k, r in ROOMS.items()}, open('rooms4a.json', 'w'), ensure_ascii=False, indent=0)
if 'plot' in sys.argv:
    from plot4a import plot
    plot(ROOMS, '1F', 'f1.png'); plot(ROOMS, '2F', 'f2.png')

# ------------------------------------------------------------------ ฝ้า (ระดับวัดจากพื้นห้อง · แปลนฝ้าเป็นหลัก)
# ห้อง: (รหัส, ระดับรอบห้อง, [หลุมฝ้า (x0, y0, x1, y1, ระดับ)], หมายเหตุ)
CEIL = {
    ('1F', 'ห้องแม่บ้าน'): ('C1', 3.00, [], 'ป้ายห้องเขียน CL1+3.20 · แปลนฝ้า +3.00'),
    ('1F', 'ห้องเก็บของ'): ('C1', 3.00, [], 'ป้ายห้องเขียน CL1+3.20 · แปลนฝ้า +3.00'),
    ('1F', 'พักผ่อน'): ('C1', 3.00, [], 'ป้ายห้องเขียน CL1+3.10 · แปลนฝ้า +3.00 · ช่วงแนว 2 ถึง y 18.35 ใต้หลังคากระจก W5 ไม่มีฝ้า (A-16)'),
    ('1F', 'ห้องครัว'): ('C1', 3.30, [], ''),
    ('1F', 'ห้องซักรีด'): ('C1', 3.30, [], ''),
    ('1F', 'ลานหลังบ้าน (2)'): ('C2', 3.40, [], 'ป้ายห้องเขียน CL2+3.65 · แปลนฝ้า +3.40'),
    ('1F', 'ห้องปั๊มน้ำ'): ('C2', 3.30, [], 'ไม่มีในแปลนฝ้า · ป้ายห้องเขียน CL2 แต่ป้ายระดับเขียน CL1+3.30 → ใช้ C2 +3.30'),
    ('1F', 'ห้องน้ำ 1'): ('C2', 2.80, [], ''),
    ('1F', 'ห้องน้ำ 2'): ('C2', 2.60, [], 'ไม่มีระดับในแปลนฝ้า → ใช้ป้ายห้อง'),
    ('1F', 'ห้องน้ำ 3'): ('C2', 2.20, [], 'ไม่มีระดับในแปลนฝ้า → ใช้ป้ายห้อง'),
    ('1F', 'เตรียมอาหาร'): ('C1', 3.20, [], ''),
    ('1F', 'โถงทางเดิน (3)'): ('C1', 3.00, [(4.93, 13.00, 9.28, 15.95, 3.20)], 'ป้ายห้องเขียน CL1+3.20 · แปลนฝ้า รอบ +3.00 หลุม +3.20 (4.35×2.95) · ไม่มีฝ้าใต้บันได'),
    ('1F', 'ห้องพระ'): ('C1', 3.00, [(0.75, 11.95, 3.30, 13.55, 3.20)], 'หลุม 2.55×1.60'),
    ('1F', 'ลานหน้าบ้าน'): ('C1', 3.00, [(1.15, 7.75, 5.70, 10.15, 3.20)], 'หลุม 4.55×2.40'),
    ('1F', 'ห้องแต่งตัว'): ('C1', 3.00, [], 'ป้ายห้องเขียน CL1+3.20 · แปลนฝ้า +3.00'),
    ('1F', 'ห้องนอน 1'): ('C1', 3.00, [(14.35, 7.95, 16.65, 10.25, 3.20)], 'หลุม 2.30×2.30'),
    ('1F', 'จอดรถ'): ('C2', 3.45, [], ''),
    ('1F', 'ทางเดินข้างบ้าน'): ('C2', 3.75, [], 'ไม่มีในแปลนฝ้า → ใช้ป้ายห้อง/รูปตัด A-11 (CL2+3.75)'),
    ('2F', 'โถงทางเดิน + พักผ่อน'): ('C1', 3.00, [(4.75, 13.85, 7.25, 16.45, 3.20)], 'หลุม 2.50×2.60 · รวมฝ้าเหนือช่องบันได'),
    ('2F', 'ห้องนอน 4'): ('C1', 3.20, [], ''),
    ('2F', 'ห้องนอน 5'): ('C1', 3.20, [], ''),
    ('2F', 'ห้องน้ำ 4'): ('C2', 2.80, [], ''), ('2F', 'ห้องน้ำ 5'): ('C2', 2.80, [], ''),
    ('2F', 'ห้องน้ำ 6'): ('C2', 2.80, [], ''), ('2F', 'ห้องน้ำ 7'): ('C2', 2.80, [], ''),
    ('2F', 'ห้องนอน 2'): ('C1', 3.00, [(2.975, 6.05, 5.925, 10.15, 3.20)], 'หลุม 2.95×4.10'),
    ('2F', 'ห้องนอน 3'): ('C1', 3.00, [(11.75, 5.55, 14.45, 7.65, 3.20)], 'หลุม 2.70×2.10 · **แปลนฝ้าเขียนรอบหลุมปนกัน +3.20 (บน/ล่าง) กับ +3.00 (ซ้าย/ขวา)** → ใช้ +3.00 แบบห้องนอนอื่น'),
    ('2F', 'ลานหน้าบ้าน'): ('C1', 3.20, [], ''), ('2F', 'ลานหน้าบ้าน (2)'): ('C1', 3.20, [], ''),
}
NOCEIL = {('1F', 'เฉลียง'): 'ป้ายห้องไม่มีฝ้า (−)', ('1F', 'ลานหน้าบ้าน (2)'): 'ลานโล่ง (−)',
          ('1F', 'ลานหลังบ้าน'): '**ป้ายห้องเขียน CL1+3.30 แต่ไม่มีหลังคา/พื้นชั้นบนคลุม และแปลนฝ้าไม่เขียน → ไม่ใส่ฝ้า**',
          ('1F', 'โถงทางเดิน'): 'ช่องโล่งสูง 2 ชั้น → ฝ้าที่ระดับชั้นบน', ('1F', 'โถงทางเดิน (2)'): 'ช่องโล่งสูง 2 ชั้น → ฝ้าที่ระดับชั้นบน'}
STAIR_2F = (0.05, 14.15, 3.95, 17.35)
STAIR_1F = (0.05, 14.15, 4.00, 15.72)   # ใต้บันไดช่วงแรก + ชานพัก (ท้องบันได ไม่มีฝ้า)   # ช่องบันไดชั้นบน (ไม่มีพื้น) — ฝ้าโถงต่อคลุม
VOID = dict(rect=(7.15, 4.85, 10.25, 11.35), base=0.55, rel=7.15, coffer=(7.625, 6.75, 9.775, 9.45, 7.35))   # ฝ้าโถงสูง 2 ชั้น (แปลนฝ้าชั้นบน E–F/6–8A วัดจากพื้น +0.55)

FIN = []; ROWS = []
def fid(pfx):
    n = sum(1 for f in FIN if f['id'].startswith(pfx)) + 1; return f'{pfx}{n:02d}'
def boxmask(R, b):
    x0, y0, x1, y1 = b[:4]; return (R['X'] >= x0) & (R['X'] <= x1) & (R['Y'] >= y0) & (R['Y'] <= y1)
def perim_real(R, msk):
    """ความยาวขอบห้องที่ติดผนัง/เสาจริง (ไม่นับเส้นแบ่งเสมือน/ด้านเปิดโล่ง)"""
    real = R['real']; L = 0
    for sh in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb = np.roll(real, sh, axis=(0, 1)); L += (msk & nb).sum()
    return L * H
def ring(b): return 2 * ((b[2] - b[0]) + (b[3] - b[1]))

for k, r in sorted(ROOMS.items()):
    fl, nm = k; R = r['R']; msk = r['mask']; z0 = r['lv']
    FIN.append(dict(id=fid(f'FL{fl[0]}-'), kind='floor', spec=SPEC[r['F']], room=nm, level=fl, z=z0, rects=rects(msk, R['x0'], R['y0']),
                    status='from_drawing', src=SRC_F))
    ROWS.append(['พื้น', f'{nm} ชั้น {fl[0]} (+{z0:.2f})', r['F'], f'{msk.sum()*H*H:.2f} ตร.ม.', 'from_drawing', ''])
    if k in NOCEIL:
        ROWS.append(['ฝ้า', f'{nm} ชั้น {fl[0]}', '—', '', 'from_drawing', NOCEIL[k]]); continue
    if k not in CEIL: print('!! ไม่มีฝ้าในตาราง', k); continue
    code, rel, cof, note = CEIL[k]
    cm = msk.copy()
    if k == ('2F', 'โถงทางเดิน + พักผ่อน'): cm |= boxmask(R, STAIR_2F)
    if k == ('1F', 'โถงทางเดิน (3)'): cm &= ~boxmask(R, STAIR_1F)
    if k == ('1F', 'พักผ่อน'): cm &= ~boxmask(R, (0, 18.35, 20, 25))   # ใต้หลังคากระจก W5
    hole = np.zeros_like(cm)
    for c in cof:
        bm = boxmask(R, c); assert (bm & cm).sum() >= 0.95 * bm.sum(), (k, c, (bm & cm).sum(), bm.sum())
        hole |= bm
    zc = round(z0 + rel, 3)
    FIN.append(dict(id=fid(f'CL{fl[0]}-'), kind='ceiling', spec=SPEC[code], room=nm, level=fl, z=zc, rects=rects(cm & ~hole, R['x0'], R['y0']),
                    status='from_drawing', src=SRC_C, note=note or None))
    a = (cm & ~hole).sum() * H * H; txt = [f'รอบห้อง {a:.2f} ตร.ม. ที่ +{zc:.2f}']
    for c in cof:
        zz = round(z0 + c[4], 3); w, h = c[2] - c[0], c[3] - c[1]
        FIN.append(dict(id=fid(f'CL{fl[0]}-'), kind='ceiling', spec=SPEC[code], room=nm + ' (หลุมฝ้า)', level=fl, z=zz, rects=[[c[0], c[1], c[2], c[3]]], status='from_drawing', src=SRC_C))
        dz = round(c[4] - rel, 3); q = round(ring(c) * dz, 3)
        FIN.append(dict(id=fid(f'CL{fl[0]}-'), kind='ceiling', spec=SPEC[code], room=nm + ' (ขอบตั้งหลุมฝ้า)', level=fl, z=zc, qty=q, unit='ตร.ม.',
                        status='from_drawing', src=SRC_C, note=f'ขอบตั้งรอบหลุม {ring(c):.2f} ม. × สูง {dz:.2f} ม.'))
        txt.append(f'หลุม {w:.2f}×{h:.2f} ที่ +{zz:.2f} · ขอบตั้ง {q:.2f} ตร.ม.')
    ROWS.append(['ฝ้า', f'{nm} ชั้น {fl[0]}', code, ' · '.join(txt), 'from_drawing', note])
    if code == 'C1':   # บัวฝ้า: ขอบห้องที่ติดผนัง (ห้องภายใน ไม่รวมห้องน้ำ/ภายนอก)
        L = round(perim_real(R, cm), 2)
        FIN.append(dict(id=fid(f'CR{fl[0]}-'), kind='other', spec=SPEC['COR'], room=nm, level=fl, z=zc, qty=L, unit='ม.', status='assumed', src='A-11 หมายเหตุ "ผนังรอบห้องทำการติดตั้งบัวพื้นและบัวฝ้าสำเร็จรูป"',
                        note='ความยาวตามขอบห้องที่ติดผนัง · แบบไม่ระบุขนาดบัว'))
        ROWS.append(['บัวฝ้า', f'{nm} ชั้น {fl[0]}', 'บัวฝ้าสำเร็จรูป', f'{L:.2f} ม.', 'assumed', 'ขนาดบัวแบบไม่ระบุ'])

# ฝ้าโถงสูง 2 ชั้น (เหนือโถงทางเข้า)
R2 = next(r['R'] for k, r in ROOMS.items() if k[0] == '2F')
vm = boxmask(R2, VOID['rect']); cf = VOID['coffer']; hm = boxmask(R2, cf); zc = round(VOID['base'] + VOID['rel'], 3); zz = round(VOID['base'] + cf[4], 3)
FIN.append(dict(id=fid('CL2-'), kind='ceiling', spec=SPEC['C1'], room='โถงทางเข้า (ช่องโล่งสูง 2 ชั้น)', level='2F', z=zc, rects=rects(vm & ~hm, R2['x0'], R2['y0']), status='from_drawing', src=SRC_C,
                note='แปลนฝ้าชั้นบน CL1+7.15 / หลุม +7.35 วัดจากพื้นชั้นล่าง +0.55'))
FIN.append(dict(id=fid('CL2-'), kind='ceiling', spec=SPEC['C1'], room='โถงทางเข้า (หลุมฝ้า)', level='2F', z=zz, rects=[list(cf[:4])], status='from_drawing', src=SRC_C))
dz = round(cf[4] - VOID['rel'], 3)
FIN.append(dict(id=fid('CL2-'), kind='ceiling', spec=SPEC['C1'], room='โถงทางเข้า (ขอบตั้งหลุมฝ้า)', level='2F', z=zc, qty=round(ring(cf) * dz, 3), unit='ตร.ม.', status='from_drawing', src=SRC_C))
L = round(ring(VOID['rect']), 2)
FIN.append(dict(id=fid('CR2-'), kind='other', spec=SPEC['COR'], room='โถงทางเข้า (ช่องโล่งสูง 2 ชั้น)', level='2F', z=zc, qty=L, unit='ม.', status='assumed', src='A-11 หมายเหตุ'))
ROWS.append(['ฝ้า', 'โถงทางเข้า ชั้น 1 (+0.50/+0.55) GL E–F / 6–9 (ช่องโล่ง)', 'C1', f'รอบ +{zc:.2f} · หลุม 2.15×2.70 ที่ +{zz:.2f}', 'from_drawing', 'แปลนฝ้าชั้นบน CL1+7.15 / +7.35 วัดจากพื้นชั้นล่าง'])

# ฝ้าชายคา Conwood: ใต้ชายคาหลังคาชั้นบน = ขอบหลังคา (A-06) − แนวผนังนอกชั้นบน
from scipy import ndimage
roof = m['roofs'][0]; P = roof['outline']; X, Y = R2['X'], R2['Y']
inside = np.zeros(X.shape, bool)
for i in range(len(P)):
    (ax, ay), (bx, by) = P[i], P[(i + 1) % len(P)]
    inside ^= ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / ((by - ay) or 1e-12) + ax)
W2 = np.zeros(X.shape, bool)
for w in m['walls']:
    if not (4.4 <= w['bottom'] <= 4.8) or w['top'] < 7.5: continue
    for (ax, ay), (bx, by) in zip(w['path'], w['path'][1:]):
        Ln = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / Ln, (by - ay) / Ln; ht = w['t'] / 2
        t = (X - ax) * ux + (Y - ay) * uy; d = np.abs((X - ax) * -uy + (Y - ay) * ux); W2 |= (t >= -ht - 0.13) & (t <= Ln + ht + 0.13) & (d <= ht)
lab, n = ndimage.label(~W2); out = np.isin(lab, np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
sof = inside & out & ~ndimage.binary_dilation(~out, iterations=int(round(0.20 / H)))
sof &= ~((X >= 7.0) & (X <= 10.4) & (Y <= 5.3))   # หน้าโถงทางเข้า E–F ใต้หลังคา SLAB +8.65 (คานหน้าแนว 8A) ไม่ใช่ชายคา   # เว้นแนวคานขอบ + แผ่นปิดขอบ 0.60 (ผิวผนัง + 0.20)
A = sof.sum() * H * H
FIN.append(dict(id='SOF-01', kind='ceiling', spec=SPEC['SOF'], room='ชายคาหลังคาชั้นบน', level='EAVE', z=8.65, rects=rects(sof, R2['x0'], R2['y0']), status='user',
                src='A-01 รายการทั่วไป (ฝ้าไม้ระแนง Conwood) + A-06 ขอบชายคา', note='ขอบเขต = ขอบหลังคา A-06 ถึงหน้าแผ่นปิดขอบใต้ชายคา (ผิวผนังนอกชั้นบน + 0.20) · ระดับ +8.65 (ระดับหลังอะเส) — Earth 30 ต.ค.'))
ROWS.append(['ฝ้า', 'ชายคาหลังคาชั้นบน (รอบอาคาร)', 'Conwood', f'{A:.2f} ตร.ม. ที่ +8.65', 'assumed', 'Earth 30 ต.ค.: ใส่ฝ้าชายคา · ระดับ +8.65 สมมติ'])

m['finishes'] = [{k: v for k, v in f.items() if v is not None} for f in FIN]
json.dump(m, open('stage4a.bm.json', 'w'), ensure_ascii=False)
json.dump(ROWS, open('stage4a_rows.json', 'w'), ensure_ascii=False)
print('finishes', len(FIN), collections.Counter(f['kind'] for f in FIN), 'soffit', round(A, 2))
