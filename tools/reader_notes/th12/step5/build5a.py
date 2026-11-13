# ห้องน้ำ ท12 — Step 5 ส่วนที่ 1: สุขาภิบาล (สุขภัณฑ์ น้ำดี น้ำเสีย อุปกรณ์) จาก SN.2.01 (ฉบับตรง PDF) SN.2.02 A.6.01 A.0.01 — ฉบับแก้รอบ 4 (Earth 12 พ.ย.)
import json, os, math, collections
H = os.path.dirname(os.path.abspath(__file__))
import sys; sys.path.insert(0, os.path.join(H, '..', 'common')); from relevel import relevel
m = relevel(json.load(open(os.path.join(H, '..', 's4', 'stage4c.bm.json'))))   # ระดับโครงสร้างตามกติกา Earth 12–13 พ.ย.
m.pop('quantities', None)
m['meta']['name'] = 'ห้องน้ำ ท12 — Step 5 งานระบบ (ส่วนที่ 1 สุขาภิบาล)'
GL, WALK, WC, ENT, GUT = 0.0, 0.05, 0.20, 0.25, 0.14
FIN, BH, BSOF = 0.05, 0.10, -0.25        # Earth 12 พ.ย.: หลังคานคอดิน = พื้นสำเร็จ − 0.05 (พื้น +0.20 → คาน +0.15 · พื้น +0.25 → คาน +0.20) พื้นโครงสร้างระดับเดียวกับคาน + ฟินิช 0.05 · ท้องคานต่ำสุด −0.25
BTOP = 0.15                              # หลังคานของคานทุกแนวที่ท่อข้าม (แถว B C · กริด 1 · ผนังกั้นภายใน) ตามตารางที่ Earth ยืนยัน 13 พ.ย.
R1, R2 = 0.0167, 0.0302                  # รัศมีนอกท่อ 1" / 2"
ZG = -0.27                               # ท่อน้ำดีประธาน: ใต้ท้องคาน (หลังท่อ −0.253)
Z0, Z0W, SLOPE = -0.39, -0.55, 1 / 100   # ท่อน้ำทิ้งเดินต่ำกว่าท่อโสโครก 0.16 ม. เพื่อลอดกันตรงจุดตัด ·              # ท่อระบาย: จุดต้นทางไกลสุดของแต่ละสายอยู่ที่ −0.36 แล้วลาดลง 1:100 ไปปลายทาง (สมมติ)
HT = {'WC': 0.20, 'CS': 0.20, 'K2': 0.50, 'LAV': 0.60, 'UR': 1.20}
SRC_FX = 'A.6.01 แปลนขยายห้องน้ำ (ตำแหน่งสุขภัณฑ์) + รายการสุขภัณฑ์และมาตรฐานการติดตั้ง · จุดจ่ายน้ำ SN.2.02'
SRC_CW, SRC_W = 'SN.2.02 แปลนระบบสุขาภิบาล (น้ำดี)', 'SN.2.01 แปลนระบบสุขาภิบาล (น้ำเสีย)'
BR = 'ยี่ห้อ COTTO, KARAT, American Standard หรือเทียบเท่า'
FT = {
  'WC': {'kind': 'wc', 'desc': f'โถส้วมนั่งราบพร้อมหม้อน้ำ {BR} รุ่น C13443(SOFT)'},
  'CS': {'kind': 'spray', 'desc': f'สายชำระ สเตนเลส 304 {BR} รุ่น CT9902SAHM'},
  'UR': {'kind': 'urinal', 'desc': f'โถปัสสาวะชาย {BR} รุ่น TF-6401-WT-0 พร้อมฟลัชวาล์ว FFAS9859-001500BT0 และท่อน้ำทิ้ง CT6809(HM)'},
  'LAV1': {'kind': 'lavatory', 'desc': f'อ่างล้างหน้าชนิดแขวนผนัง {BR} รุ่น C014 พร้อมท่อน้ำทิ้ง CT6809(HM)'},
  'LAV2': {'kind': 'lavatory', 'mount': 'counter', 'desc': f'อ่างล้างหน้าชนิดติดตั้งบนเคาน์เตอร์ {BR} รุ่น C003817 พร้อมท่อน้ำทิ้ง PVC 2" ยาวไม่น้อยกว่า 35 ซม. ปล่อยลงช่องระบายน้ำใต้อ่าง'},
  'K1': {'kind': 'faucet', 'desc': f'ก๊อกน้ำอ่างล้างหน้า {BR} รุ่น CT1276A(SA)(HM)'},
  'K2': {'kind': 'faucet', 'mount': 'wall', 'desc': 'ก๊อกน้ำล้างพื้น ยี่ห้อ Sanwa หรือเทียบเท่า'},
  'FD': {'kind': 'floor_drain', 'desc': 'ตะแกรงดักกลิ่น สเตนเลส 304 สำหรับท่อ ⌀ 2" ยี่ห้อ COTTO, VRH หรือเทียบเท่า รุ่น FUVHU-W002AS'}}
fx, pipes, eq, DR = [], [], [], []
def F(i, t, x, y, z, room, rot=None, note='', **kw):
    d = {'id': i, 'type': t, 'xyz': [round(x, 3), round(y, 3), round(z, 3)], 'room': room, 'src': SRC_FX, 'status': 'from_drawing'}
    if rot is not None: d['rot'] = rot
    if note: d['note'] = note
    d.update(kw); fx.append(d)
def Pp(i, system, dia, pts, serves=None, note='', src=SRC_CW, status='from_drawing', **kw):
    out = []
    for p in pts:
        q = [round(p[0], 3), round(p[1], 3), round(p[2], 3)]
        if not out or q != out[-1]: out.append(q)
    d = {'id': i, 'system': system, 'dia': dia, 'pts': out, 'src': src, 'status': status}
    if serves: d['serves'] = serves
    if note: d['note'] = note
    d.update(kw); pipes.append(d)

# ================= น้ำดี =================
# ท่อน้ำดีเป็น 1 นิ้วทั้งหมด เฉพาะส่วนที่หักออกจากผนังเข้าสุขภัณฑ์เป็น 1/2 นิ้ว · ท่อประธานเดินใต้ท้องคานชิดข้างคานด้านนอก/ด้านที่แบบเขียน
# (แกน, ศูนย์ผนัง, ศูนย์คาน, ฝั่งท่อประธาน ±1, ระยะท่อประธานจากศูนย์คาน)
PED = 0.15   # ครึ่งหน้าตอม่อ 0.30×0.30 — ท่อประธานข้างคานที่มีตอม่อ (แถว C · กริด 1 · แถว B · กริด 2/3 ช่วง B–ผนังหลังห้องคนพิการ) เดินแนบหน้าตอม่อ = ห่างหน้าคาน 0.05 (13 พ.ย.: เดิมชิดคานแล้วทะลุตอม่อ)
WALLS = [('y', 5.85, 5.8, +1, PED + R1), ('x', -0.05, 0.0, -1, PED + R1), ('x', 2.05, 2.0, -1, 0.20), ('x', 5.35, 5.35, -1, BH + R1), ('y', 3.05, 3.1, +1, BH + R1), ('y', 1.45, 1.5, +1, PED + R1)]
MAIN = {w[1]: w[2] + w[3] * w[4] for w in WALLS}
NB = 'ท่อแยก 1 นิ้ว: จากท่อประธานใต้ท้องคาน ลอดใต้คาน ขึ้นชิดข้างคานด้านใน หักเข้าผนังเหนือหลังคาน ขึ้นในผนังถึงระดับสุขภัณฑ์ (Earth 12 พ.ย.)'
NS = 'ส่วนหักออกจากผนังเข้าสุขภัณฑ์ 1/2 นิ้ว'
def stub(fid, wall_pt, pt, zf, h, serves, note='', tee=None, du=0.0, inside=None):
    ax, cw, cb, sm, om = next(w for w in WALLS if abs(wall_pt[0 if w[0] == 'x' else 1] - w[1]) < 1e-6)
    k = 0 if ax == 'x' else 1; u = wall_pt[1 - k]; zp = zf + h; mn = cb + sm * om
    P2 = lambda c, uu=None: (c, u if uu is None else uu) if k == 0 else (u if uu is None else uu, c)
    sf = 1 if pt[k] > cw else -1; face = cw + 0.05 * sf
    if tee is not None:
        b = [tee, (*P2(cw), tee[2]), (*P2(cw), zp)]
    else:
        sr, zr = (sf, zf) if inside is None else inside   # ฝั่งที่ท่อขึ้น + ระดับพื้นสำเร็จฝั่งนั้น
        ur = u + du; rise = mn if sr == sm else cb + sr * (BH + R1); ztop = BTOP + R1   # ท่อขึ้นฝั่งเดียวกับท่อประธาน: ขึ้นตรงจากท่อประธาน (ไม่หักกลับเข้าชิดคาน)
          # หักเข้าผนังบนหลังคาน +0.15 (จมในชั้นฟินิช/เนื้อพื้น)
        b = [(*P2(mn, ur), ZG), (*P2(rise, ur), ZG), (*P2(rise, ur), ztop), (*P2(cw, ur), ztop), (*P2(cw, ur), zp), (*P2(cw), zp)]
    if len({(round(p[0], 3), round(p[1], 3), round(p[2], 3)) for p in b}) > 1: Pp('CWB-' + fid, 'cw', '1"', b, serves, (('แยกในผนัง 1 นิ้ว · ' if tee is not None else NB + ' · ') + note).strip(' ·'))
    Pp('CW-' + fid, 'cw', '1/2"', [(*P2(cw), zp), (*P2(face), zp)], serves, NS)
    for f in fx:
        if f['id'] == fid and f['type'] in ('WC', 'LAV1', 'LAV2'): f['supply_z'] = round(zp, 3)
AH = 'ความสูงสต๊อปวาล์วสมมติ (มาตรฐานในแบบไม่ได้บอก)'
# ถังบำบัด KS-2000 (S),(F) ตาราง SN.3.01 (Earth 13 พ.ย.) — H ฐาน→หลัง ค.ส.ล.รัดฝา · ih ท่อเข้า · Oh ท่อออก (วัดจากหลังพื้นรองถัง) · Od ⌀ถัง · A บ่อ/พื้นรองถัง
TK = {'H': 1.67, 'ih': 1.41, 'Oh': 1.35, 'Od': 1.46, 'A': 1.70}; TKR = TK['Od'] / 2
TR = WC + 0.20   # ระดับท่อน้ำทิ้งโถปัสสาวะเข้าผนัง = 0.20 เหนือพื้น ให้อยู่ใต้คานเอ็นใต้ช่อง LS-01 (+0.45) — Earth 13 พ.ย. (เดิมสมมติ 0.32)
for k, y in enumerate((5.3, 4.5, 3.7)):
    F(f'UR-W{k+1}', 'UR', 0.0, y, WC, 'โซนปัสสาวะชาย ผนังกริด 1', 0, trap_z=TR); stub(f'UR-W{k+1}', (-0.05, y), (0.126, y), WC, HT['UR'], [f'UR-W{k+1}'], 'ท่อขึ้นเยื้อง 0.12 ม. หลบท่อน้ำทิ้งของโถเดียวกัน', du=0.12)
    F(f'UR-E{k+1}', 'UR', 2.0, y, WC, 'โซนปัสสาวะชาย ผนังกั้นห้องส้วม', 180, trap_z=TR); stub(f'UR-E{k+1}', (2.05, y), (1.869, y), WC, HT['UR'], [f'UR-E{k+1}'], 'ท่อขึ้นเยื้อง 0.12 ม. หลบท่อน้ำทิ้งของโถเดียวกัน', du=0.12)
F('K2-W', 'K2', -0.10, 4.954, WALK + HT['K2'], 'ผนังกริด 1 ด้านนอกอาคาร (ทางเดิน +0.05)', 180, 'A.6.01 ไม่มีป้าย K.2 ที่จุดนี้ แต่มีสัญลักษณ์ก๊อกและจุดจ่ายน้ำใน SN.2.02 (Earth 12 พ.ย. ยืนยันเป็นก๊อกล้างพื้น)')
stub('K2-W', (-0.05, 4.954), (-0.204, 4.954), WALK, HT['K2'], ['K2-W'], 'ก๊อกอยู่ผนังด้านนอก แต่ท่อขึ้นด้านในอาคาร (จมในพื้น) แล้วทะลุผนังออก ไม่ให้ท่อโผล่เหนือทางเดิน', inside=(1, WC))
for i in range(8):
    room = ('ห้องส้วมชาย' if i < 3 else 'ห้องส้วมหญิง') + f' ห้องที่ {i+1} นับจากกริด 1'
    xs, xw = 2.248 + 1.1 * i, 2.598 + 1.1 * i
    F(f'WC-{i+1}', 'WC', 2.6 + 1.1 * i, 5.80, WC, room, -90); stub(f'WC-{i+1}', (xw, 5.85), (xw, 5.686), WC, HT['WC'], [f'WC-{i+1}'], AH)
    F(f'CS-{i+1}', 'CS', xs, 5.80, WC + HT['CS'], room, -90, hook_z=WC + 0.50); stub(f'CS-{i+1}', (xs, 5.85), (xs, 5.657), WC, HT['CS'], [f'CS-{i+1}'], 'แยกจากท่อขึ้นของโถส้วมห้องเดียวกัน', tee=(xw, 5.85, WC + HT['WC']))
F('K2-M', 'K2', 5.30, 3.602, WC + HT['K2'], 'ห้องน้ำชาย ผนังกั้นชาย/หญิง', 180); stub('K2-M', (5.35, 3.602), (5.196, 3.602), WC, HT['K2'], ['K2-M'])
F('K2-F', 'K2', 5.40, 3.602, WC + HT['K2'], 'ห้องน้ำหญิง ผนังกั้นชาย/หญิง', 0); stub('K2-F', (5.35, 3.602), (5.499, 3.602), WC, HT['K2'], ['K2-F'], 'ใช้ท่อขึ้นร่วมกับ K2-M', tee=(5.35, 3.602, WC + HT['K2']))
F('WC-D', 'WC', 4.8, 3.00, ENT, 'ห้องน้ำคนพิการ', -90); stub('WC-D', (4.798, 3.05), (4.798, 2.886), ENT, HT['WC'], ['WC-D'], AH)
F('CS-D', 'CS', 4.446, 3.00, ENT + HT['CS'], 'ห้องน้ำคนพิการ', -90, hook_z=ENT + 0.50); stub('CS-D', (4.446, 3.05), (4.446, 2.933), ENT, HT['CS'], ['CS-D'], 'แยกจากท่อขึ้นของโถส้วม WC-D', tee=(4.798, 3.05, ENT + HT['WC']))
F('LAV-D', 'LAV1', 5.8, 3.00, ENT + 0.80, 'ห้องน้ำคนพิการ', -90, 'ขอบบนอ่างสูง 0.80 จากพื้น ตามมาตรฐานการติดตั้งสุขภัณฑ์ · พีแทรปต่อเข้าท่อน้ำทิ้งฝังผนัง', trap_z=ENT + 0.50)
F('K1-D', 'K1', 5.8, 2.93, ENT + 0.80, 'ห้องน้ำคนพิการ'); stub('LAV-D', (5.798, 3.05), (5.798, 2.836), ENT, HT['LAV'], ['LAV-D', 'K1-D'], AH + ' · ท่อขึ้นเยื้อง 0.15 ม. หลบท่อน้ำทิ้งของอ่าง', du=0.15)
CT = 0.91
for side, xs_in, xs_out, room in (('M', (2.098, 2.898, 3.698), (2.898, 3.698), 'ชาย'), ('F', (6.998, 7.798, 8.598), (6.998, 7.798), 'หญิง')):
    for k, x in enumerate(xs_in):
        i = f'{side}I{k+1}'; rm = f'เคาน์เตอร์อ่างล้างหน้า{room} ด้านใน (CT-{side}I)'
        F('LAV-' + i, 'LAV2', x, 1.50, CT, rm, 90); F('K1-' + i, 'K1', x, 1.62, CT, rm)
        stub('LAV-' + i, (x, 1.45), (x, 1.759), WC, HT['LAV'], ['LAV-' + i, 'K1-' + i], AH + (' · ท่อขึ้นเยื้อง 0.03 ม. หลบคานขวางที่ x=2.00' if x == 2.098 else ''), du=0.03 if x == 2.098 else 0.0)
    for k, x in enumerate(xs_out):
        i = f'{side}O{k+1}'; rm = f'เคาน์เตอร์อ่างล้างหน้า{room} ด้านนอก โถงทางเข้า (CT-{side}O)'
        F('LAV-' + i, 'LAV2', x, 1.40, CT, rm, -90); F('K1-' + i, 'K1', x, 1.27, CT, rm)
        stub('LAV-' + i, (x, 1.45), (x, 1.149), ENT, HT['LAV'], ['LAV-' + i, 'K1-' + i], AH + ' · ใช้ท่อขึ้นร่วมกับอ่างด้านในที่ผนังเดียวกัน', tee=(x, 1.45, WC + HT['LAV']))
# ท่อประธาน
NM = 'ท่อน้ำดีประธาน เดินใต้ท้องคาน (−0.27) ชิดข้างคาน (Earth 12 พ.ย.) — แนวที่ผ่านตอม่อ 0.30×0.30 เดินแนบหน้าตอม่อ (ห่างหน้าคาน 0.05)'
yC, x1, xP, xM, yD, yB = MAIN[5.85], MAIN[-0.05], MAIN[2.05], MAIN[5.35], MAIN[3.05], MAIN[1.45]
xDL, xDR = 4.2 - (BH + R1), 6.5 + (BH + R1)   # ช่วงนี้ไม่ผ่านตอม่อ (เลี้ยวเข้าแนวแถว B ที่หน้าตอม่อพอดี) และต้องหลบท่อ FD ใต้เคาน์เตอร์
ZE = WALK + 0.10   # ท่อช่วงถัง–ปั๊มเดินเหนือพื้นทางเดิน (อุปกรณ์วางบนพื้นภายนอก)
def G(i, dia, pts, note=''): Pp(i, 'cw', dia, [p if len(p) == 3 else (p[0], p[1], ZG) for p in pts], None, (note + ' · ' if note else '') + NM)
G('CW-M1', '1"', [(7.809, 7.252), (7.809, 6.589), (7.6, 6.589), (7.6, 6.589, ZE), (7.13, 6.589, ZE)], 'จากท่อเมนประปาภายในโครงการ ขึ้นเหนือพื้นเข้าถังเก็บน้ำ ผ่านประตูน้ำ GV-1')
Pp('CW-M2', 'cw', '2"', [(5.87, 6.589, ZE), (4.78, 6.589, ZE)], None, 'จากถังเก็บน้ำเข้าปั๊ม PVC 2" ต่อข้อลดเข้าปั๊ม 1" ผ่านประตูน้ำ GV-2 · เดินเหนือพื้นทางเดิน')
G('CW-M3', '1"', [(4.42, 6.589, ZE), (3.95, 6.589, ZE), (3.95, 6.589), (3.783, 6.589), (3.783, yC)], 'จากปั๊มผ่านประตูน้ำ GV-3 ลงใต้ดิน ถึงท่อประธานข้างคานแถว C ด้านนอก')
G('CW-M4', '1"', [(x1, yC), (10.298, yC)], 'ข้างคานแถว C ด้านนอกอาคาร (ใต้ทางเดิน)')
G('CW-M5', '1"', [(x1, yC), (x1, 3.82)], 'ข้างคานกริด 1 ด้านนอกอาคาร (ใต้ทางเดิน)')
G('CW-M6', '1"', [(xP, yC), (xP, 3.82)], 'ลอดใต้คานแถว C เข้าอาคาร เดินข้างคานผนังกั้นโซนปัสสาวะ ห่างศูนย์คาน 0.20 (เว้นที่ให้ท่อน้ำทิ้งโถปัสสาวะลงชิดคาน)')
G('CW-M7', '1"', [(xM, yC), (xM, yD)], 'ลอดใต้คานแถว C เข้าอาคาร เดินข้างคานผนังกั้นชาย/หญิง')
G('CW-M8', '1"', [(xDL, yD), (xDR, yD)], 'ข้างคานผนังหลังห้องน้ำคนพิการ')
G('CW-M9', '1"', [(xDL, yD), (xDL, yB), (2.128, yB)], 'ข้างคานผนังข้างห้องคนพิการ → ข้างคานแถว B (เคาน์เตอร์ชาย)')
G('CW-M10', '1"', [(xDR, yD), (xDR, yB), (8.598, yB)], 'ข้างคานผนังข้างห้องคนพิการ → ข้างคานแถว B (เคาน์เตอร์หญิง)')

# ================= น้ำเสีย: กำหนดแนว 2 มิติ แล้วคำนวณระดับตามความลาด =================
def D(i, system, dia, run, serves=None, note='', pre=None, **kw): DR.append({'id': i, 'system': system, 'dia': dia, 'run': run, 'serves': serves, 'note': note, 'pre': pre or [], 'kw': kw})
fl = lambda x, y, z: [(x, y, z)]
D('S-1', 'soil', '4"', [(2.6, 5.43), (2.6, 5.99), (2.75, 6.14), (3.9, 6.14)], ['WC-1'], pre=fl(2.6, 5.43, WC))
D('S-2', 'soil', '4"', [(3.7, 5.43), (3.7, 5.99), (3.85, 6.14), (4.95, 6.14)], ['WC-2'], pre=fl(3.7, 5.43, WC))
D('S-3', 'soil', '4"', [(4.8, 5.43), (4.8, 5.99), (4.95, 6.14), (5.24, 6.43)], ['WC-3'], pre=fl(4.8, 5.43, WC))
D('S-D', 'soil', '4"', [(4.8, 2.62), (5.24, 2.62), (5.24, 7.6), (5.09, 7.75), (3.695 + TKR, 7.75)], ['WC-D'], 'เข้าถังบำบัด ST-1 · **มาร์ก:** ช่วงแรกปรับแนวจากเส้นเฉียงในแบบเป็นตั้งฉาก หลบท่อดิ่งของ FD-D ที่อยู่ห่างแนวท่อเดิมเพียง 0.05 ม. · เข้าถังด้วยข้อต่ออ่อน (flex)', fl(4.8, 2.62, ENT), flex_end=True)
D('S-4', 'soil', '4"', [(5.9, 5.43), (5.9, 5.99), (6.05, 6.14), (11.47, 6.14), (11.62, 6.29), (11.62, 7.755 - TKR)], ['WC-4'], 'เข้าถังบำบัด ST-2 ด้วยข้อต่ออ่อน (flex)', fl(5.9, 5.43, WC), flex_end=True)
for i, x in ((5, 7.0), (6, 8.1), (7, 9.2), (8, 10.3)): D(f'S-{i}', 'soil', '4"', [(x, 5.43), (x, 5.99), (x + 0.15, 6.14)], [f'WC-{i}'], pre=fl(x, 5.43, WC))
NU = 'ท่อน้ำทิ้งโถปัสสาวะ: หักเข้าผนัง ลงในผนังถึงเหนือหลังคาน หักหลบคาน แล้วลงชิดข้างคาน (Earth 12 พ.ย.)'
ZJ = BTOP + R2
for k, y in enumerate((5.3, 4.5, 3.7)):
    xw, xd = -0.05, 0.0 + BH + R2
    D(f'SU-W{k+1}', 'soil', '2"', [(xd, y), (1.06, y), (1.46, y + 0.4)], [f'UR-W{k+1}'], NU, [(0.0, y, TR), (xw, y, TR), (xw, y, ZJ), (xd, y, ZJ)])
    xw, xd = 2.05, 2.0 - BH - R2
    D(f'SU-E{k+1}', 'soil', '2"', [(xd, y), (1.61, y), (1.46, y + 0.15)], [f'UR-E{k+1}'], NU, [(2.0, y, TR), (xw, y, TR), (xw, y, ZJ), (xd, y, ZJ)])
D('SU-M', 'soil', '2"', [(1.46, 3.85), (1.46, 5.99), (1.61, 6.14), (2.75, 6.14)], None, 'ท่อรวมโถปัสสาวะ (S) PVC 2" ต่อเข้าท่อโสโครก 4"')
LAVS = lambda sd: [f'LAV-{sd}I{k}' for k in (1, 2, 3)] + [f'LAV-{sd}O{k}' for k in (1, 2)]
D('W-M1', 'waste', '2"', [(5.1, 4.03), (2.25, 4.03), (2.25, 7.09), (1.55, 7.79), (1.55, 8.48)], ['FD-M1', 'FD-M2'], 'แนวรางระบายน้ำห้องน้ำชาย ต่อเข้าระบบระบายน้ำภายในโครงการ', fl(5.1, 4.03, GUT))
D('W-M2', 'waste', '2"', [(4.0, 1.25), (4.0, 3.83), (3.8, 4.03)], ['FD-CMO', 'FD-CMI'] + LAVS('M'), 'รับ FD ใต้เคาน์เตอร์อ่างล้างหน้าชาย — อ่างปล่อยน้ำลงพื้นแล้วลง FD (Earth 12 พ.ย.)', fl(4.0, 1.25, ENT))
D('W-D1', 'waste', '2"', [(5.8, 3.0 - R2), (5.8, 2.8), (5.35, 2.8), (5.1, 3.06)], ['LAV-D'], 'รับพีแทรปอ่างแขวน: ท่อน้ำทิ้งฝังผนัง ลงถึงเหนือหลังคาน หักหลบคาน ลงชิดข้างคาน', [(5.8, 3.05, ENT + 0.50), (5.8, 3.05, BTOP + R2), (5.8, 3.0 - R2, BTOP + R2)])
D('W-D2', 'waste', '2"', [(5.1, 2.85), (5.1, 4.03)], ['FD-D'], pre=fl(5.1, 2.85, ENT))
D('W-F1', 'waste', '2"', [(5.6, 4.03), (10.55, 4.03), (10.55, 8.86), (11.48, 9.8)], ['FD-F1', 'FD-F2'], 'แนวรางระบายน้ำห้องน้ำหญิง ต่อเข้าระบบระบายน้ำภายในโครงการ', fl(5.6, 4.03, GUT))
D('W-F2', 'waste', '2"', [(6.7, 1.25), (6.7, 3.83), (6.9, 4.03)], ['FD-CFO', 'FD-CFI'] + LAVS('F'), 'รับ FD ใต้เคาน์เตอร์อ่างล้างหน้าหญิง — อ่างปล่อยน้ำลงพื้นแล้วลง FD (Earth 12 พ.ย.)', fl(6.7, 1.25, ENT))
for i, x, y, zf, room in (('FD-M1', 2.25, 4.03, GUT, 'รางระบายน้ำห้องน้ำชาย (ก้นราง +0.14) ปลายด้านกริด 1'), ('FD-M2', 5.1, 4.03, GUT, 'รางระบายน้ำห้องน้ำชาย ปลายด้านผนังกั้น'),
                          ('FD-F1', 5.6, 4.03, GUT, 'รางระบายน้ำห้องน้ำหญิง ปลายด้านผนังกั้น'), ('FD-F2', 10.55, 4.03, GUT, 'รางระบายน้ำห้องน้ำหญิง ปลายด้านกริด 4'),
                          ('FD-D', 5.1, 2.85, ENT, 'ห้องน้ำคนพิการ'),
                          ('FD-CMI', 4.0, 1.75, WC, 'ใต้เคาน์เตอร์อ่างล้างหน้าชาย ด้านใน (CT-MI)'), ('FD-CMO', 4.0, 1.25, ENT, 'ใต้เคาน์เตอร์อ่างล้างหน้าชาย ด้านนอก (CT-MO)'),
                          ('FD-CFI', 6.7, 1.75, WC, 'ใต้เคาน์เตอร์อ่างล้างหน้าหญิง ด้านใน (CT-FI)'), ('FD-CFO', 6.7, 1.25, ENT, 'ใต้เคาน์เตอร์อ่างล้างหน้าหญิง ด้านนอก (CT-FO)')):
    F(i, 'FD', x, y, zf, room, None, 'Floor drain (Earth 12 พ.ย. ยืนยัน)')
    if i in ('FD-M1', 'FD-F2', 'FD-CMI', 'FD-CFI'): D('W-' + i, 'waste', '2"', [(x, y)], [i], 'ท่อดิ่งจาก FD ลงท่อน้ำทิ้งใต้พื้น', fl(x, y, zf))
D('S-OUT1', 'soil', '4"', [(3.695 - TKR, 7.75), (1.86, 7.75), (1.71, 7.9), (1.71, 8.95)], None, 'ออกจากถังบำบัด ST-1 ด้วยข้อต่ออ่อน (flex) ต่อเข้าระบบระบายน้ำภายในโครงการ', flex_start=True)
D('S-OUT2', 'soil', '4"', [(11.62, 7.755 + TKR), (11.62, 10.32)], None, 'ออกจากถังบำบัด ST-2 ด้วยข้อต่ออ่อน (flex) ต่อเข้าระบบระบายน้ำภายในโครงการ', flex_start=True)
# ---- ระดับตามความลาด: Lsink = ระยะตามท่อจากจุดนั้นถึงปลายทางของสาย (ถัง/จุดต่อระบบระบายน้ำโครงการ)
d2 = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
BY = {d['id']: d for d in DR}
def along(run, p):   # ระยะจากจุด p (อยู่บนแนว run) ถึงปลาย run · None ถ้าไม่อยู่บนแนว
    acc = [0]
    for a, b in zip(run, run[1:]): acc.append(acc[-1] + d2(a, b))
    for k, (a, b) in enumerate(zip(run, run[1:])):
        L = d2(a, b)
        if L < 1e-9: continue
        t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L / L
        if -1e-6 <= t <= 1 + 1e-6 and d2(p, (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))) < 0.012: return acc[-1] - (acc[k] + t * L)
    if len(run) == 1 and d2(run[0], p) < 0.012: return 0.0
    return None
def end_L(d):
    if 'eL' in d: return d['eL']
    d['eL'], d['to'] = 0.0, None
    for q in DR:
        if q is d or q['id'].startswith('S-OUT') != d['id'].startswith('S-OUT'): continue
        a = along(q['run'], d['run'][-1]) if len(q['run']) > 1 else None
        if a is not None: d['eL'], d['to'] = a + end_L(q), q['id']; break
    return d['eL']
def sink(d): return d['id'] if end_L(d) == 0 and d['to'] is None else sink(BY[d['to']])
def Ls(d):   # Lsink ของแต่ละจุดบน run
    tot = sum(d2(a, b) for a, b in zip(d['run'], d['run'][1:])); acc = 0; out = [tot + end_L(d)]
    for a, b in zip(d['run'], d['run'][1:]): acc += d2(a, b); out.append(tot - acc + end_L(d))
    return out
NET = collections.defaultdict(list)
for d in DR: NET[sink(d)].append(d)
ZSINK = {}
for sk, ds in NET.items():
    if sk.startswith('S-OUT'): continue
    ZSINK[sk] = (Z0 if BY[sk]['system'] == 'soil' else Z0W) - SLOPE * max(Ls(d)[0] for d in ds)
ZSINK['S-OUT1'] = ZSINK['S-D'] - TK['ih'] + TK['Oh'] - SLOPE * Ls(BY['S-OUT1'])[0]; ZSINK['S-OUT2'] = ZSINK['S-4'] - TK['ih'] + TK['Oh'] - SLOPE * Ls(BY['S-OUT2'])[0]
ND = f'ท่อใต้พื้น ลาด 1:{round(1 / SLOPE)} ไปปลายทาง (ความลาดสมมติ — แบบไม่ระบุ) · ท่อแนวดิ่งลงข้างคาน ไม่ทะลุคาน'
for d in DR:
    zs = ZSINK[sink(d)]; run3 = [(p[0], p[1], zs + SLOPE * L) for p, L in zip(d['run'], Ls(d))]
    Pp(d['id'], d['system'], d['dia'], list(d['pre']) + run3, d['serves'], (d['note'] + ' · ' if d['note'] else '') + ND, SRC_W, **d['kw'])
    d['z'] = (run3[0][2], run3[-1][2])

# ================= อุปกรณ์ =================
def E(i, kind, x, y, z, size, dims=None, note='', src=SRC_CW):
    e = {'id': i, 'kind': kind, 'xyz': [x, y, round(z, 3)], 'size': size, 'src': src, 'status': 'from_drawing'}
    if dims: e['dims'] = dims
    if note: e['note'] = note
    eq.append(e)
E('WT-1', 'water_tank', 6.498, 6.589, WALK + 0.925, 'Polymer วางบนพื้นดิน 2,000 ลิตร', [1.25, 1.25, 1.85], 'ยี่ห้อ WAVE, DOS หรือเทียบเท่า · วางบนพื้นทางเดินภายนอก +0.05 (Earth 12 พ.ย.) · ขนาดถัง ⌀1.25×1.85 เป็นขนาดทั่วไปของถัง 2,000 ลิตร (แบบเขียนสัญลักษณ์ ⌀0.70) · แบบหมายเหตุว่าปรับตำแหน่งได้ตามหน้างาน')
E('PM-1', 'pump', 4.598, 6.589, WALK + 0.15, 'อัตโนมัติ มอเตอร์ 300 วัตต์', [0.36, 0.25, 0.30], 'ยี่ห้อ Mitsubishi, Hitachi หรือเทียบเท่า · วางบนพื้นทางเดินภายนอก +0.05')
for i, x in (('GV-1', 7.402), ('GV-2', 5.078), ('GV-3', 4.117)): E(i, 'gate_valve', x, 6.588, ZE, '1"')
TANKS = {}
def tank(i, x, y, zin, serves):   # ถังบำบัด + พื้นรองถัง + ค.ส.ล.รัดฝา + อิฐก่อรอบปากถังถึงดิน (SN.3.01)
    zb = round(zin - TK['ih'], 3); ztop = round(zb + TK['H'], 3); zr = round(ztop - 0.10, 3)
    TANKS[i] = dict(x=x, y=y, zb=zb, ztop=ztop, zr=zr, zin=zin)
    E(i, 'septic_tank', x, y, round((zb + zr) / 2, 3), '2,000 ลิตร รุ่น KS-2000 (S),(F)', [TK['Od'], TK['Od'], round(zr - zb, 3)],
      src='SN.2.01 + SN.3.01', note=f'ยี่ห้อ AQUA, WAVE, COTTO, DOS หรือเทียบเท่า (SN.3.01 เลือกขนาด KS-2000 · แบบ (S),(F) — Earth 13 พ.ย.) · ⌀{TK["Od"]:.2f} · ท่อเข้า {zin:+.3f} (ih 1.41 จากหลังพื้นรองถัง) · ท่อออก {zb + TK["Oh"]:+.3f} (Oh 1.35) · หลังพื้นรองถัง {zb:+.3f} · หลัง ค.ส.ล.รัดฝา {ztop:+.3f} · ก่ออิฐมอญรอบปากถังขึ้นถึงดิน ±0.00 (ยึดระดับท่อเข้า — Earth 13 พ.ย.) · รับ{serves}')
tank('ST-1', 3.695, 7.75, ZSINK['S-D'], 'โถส้วมชาย 3 + คนพิการ 1 + โถปัสสาวะ 6')
tank('ST-2', 11.62, 7.755, ZSINK['S-4'], 'โถส้วมหญิง 5')
# ---- มาร์กจุดที่ตรวจพบ (13 พ.ย.)
for p in pipes:
    i = p['id']
    if i.startswith('SU-W') or i.startswith('SU-E'):
        p['note'] += ' · **มาร์ก:** ช่วงหักบนหลังคาน +0.15 หลังท่อ +0.21 โผล่พ้นพื้นสำเร็จ +0.20 ราว 1 ซม. ยาวราว 0.14 ม. ที่โคนผนัง (Earth 13 พ.ย.: คงไว้ ให้ขึ้นเตือน)'
    if i in ('CWB-UR-W1', 'CWB-UR-W2', 'CWB-UR-W3', 'CWB-K2-W', 'CW-K2-W'):
        p['sleeve'] = 'LS-01'; p['note'] += ' · ผ่านคานเอ็นใต้ช่อง LS-01 (0.10×0.15 ระดับ +0.45 ถึง +0.60) ด้วยปลอกท่อฝังในคานเอ็น (Earth 13 พ.ย.)'
m.setdefault('mep', {})['plumbing'] = {'cw_material': 'PVC ชั้น 13.5', 'drain_material': 'PVC ชั้น 8.5', 'note': 'ชั้นคุณภาพท่อตาม A.0.01: น้ำดี PVC ชั้น 13.5 · น้ำเสีย PVC ชั้น 8.5',
                                       'fixture_types': FT, 'fixtures': fx, 'pipes': pipes, 'equipment': eq}
# ---- งานติดตั้งถังบำบัด (SN.3.01 แบบขยายบ่อบำบัดน้ำเสีย + ขยายพื้นรับน้ำหนักถังบำบัด)
import math as _m
RO = 0.30   # รัศมีช่องปากถัง (ฝา NYLON) — สมมติ ⌀0.60
m['slabs'] = [q for q in m['slabs'] if not q['id'].startswith('S-ST')]; m['walls'] = [w for w in m['walls'] if not w['id'].startswith('W-ST')]
for i, t in TANKS.items():
    x, y, h = t['x'], t['y'], TK['A'] / 2
    sq = [[round(x - h, 3), round(y - h, 3)], [round(x + h, 3), round(y - h, 3)], [round(x + h, 3), round(y + h, 3)], [round(x - h, 3), round(y + h, 3)]]
    n = i[-1]
    m['slabs'].append({'id': f'S-ST{n}B', 'mark': 'ST', 'kind': 'ground', 't': 0.15, 'top': t['zb'], 'polygon': sq, 'sand': 0.05, 'lean': 0.05, 'pe_sheet': False, 'material': 'C',
                       'use': f'พื้นรองรับน้ำหนักถังบำบัด {i}', 'src': 'SN.3.01 ขยายพื้นรับน้ำหนักถังบำบัด', 'status': 'from_drawing', 'task': 'mep_ext',
                       'note': f'คอนกรีตหนา 0.15 RB9 @0.20# · คอนกรีตหยาบ 0.05 · ทรายหยาบ 0.05 · กว้าง A = 1.70 × 1.70 (KS-2000 (S),(F) — แบบเขียน "Varies") · หลังพื้น {t["zb"]:+.3f}'})
    ring = sq + [sq[0], [round(x, 3), round(y - h, 3)]][1:] if False else None
    circ = [[round(x + RO * _m.cos(-2 * _m.pi * k / 16 - _m.pi / 2), 3), round(y + RO * _m.sin(-2 * _m.pi * k / 16 - _m.pi / 2), 3)] for k in range(17)]
    poly = [[round(x, 3), round(y - h, 3)], sq[1], sq[2], sq[3], sq[0], [round(x, 3), round(y - h, 3)]] + circ   # ขอบนอก → ร่องตัด → วงช่องปากถัง (keyhole)
    m['slabs'].append({'id': f'S-ST{n}R', 'mark': 'ST', 'kind': 'ground', 't': 0.10, 'top': t['ztop'], 'polygon': poly, 'sand': 0, 'pe_sheet': False, 'material': 'C',
                       'use': f'ค.ส.ล.รัดฝาถังบำบัด {i}', 'src': 'SN.3.01 แบบขยายบ่อบำบัดน้ำเสีย', 'status': 'from_drawing', 'task': 'mep_ext',
                       'note': f'ค.ส.ล.รัดฝาถัง หนา 0.10 RB9 @0.20# วางบนทรายหยาบรอบถัง · ช่องปากถัง ⌀0.60 **สมมติ** (แบบไม่บอกขนาดฝา) · หลัง {t["ztop"]:+.3f}'})
    m['design']['slabs'][f'S-ST{n}B'] = {'rebar': {'mesh': [9, 0.20, 1]}, 'status': 'from_drawing', 'src': 'SN.3.01: RB 9 มม. @0.20#'}
    m['design']['slabs'][f'S-ST{n}R'] = {'rebar': {'mesh': [9, 0.20, 1]}, 'status': 'from_drawing', 'src': 'SN.3.01: RB 9 มม. @0.20#'}
    rc = RO + 0.05
    path = [[round(x + rc * _m.cos(2 * _m.pi * k / 16), 3), round(y + rc * _m.sin(2 * _m.pi * k / 16), 3)] for k in range(17)]
    m['walls'].append({'id': f'W-ST{n}', 'kind': 'brick_mon', 't': 0.10, 'path': path, 'bottom': t['ztop'], 'top': 0.0, 'mark': 'อิฐมอญ', 'plaster': False, 'paint': False, 'exterior': True,
                       'src': 'SN.3.01 (ก่ออิฐมอญโดยรอบกรณีฝาถังต่ำกว่าระดับดิน)', 'status': 'user', 'task': 'mep_ext',
                       'note': f'ก่ออิฐมอญรอบปากถัง {i} จากหลัง ค.ส.ล.รัดฝา {t["ztop"]:+.3f} ถึงระดับดิน ±0.00 สูง {-t["ztop"]:.3f} (ยึดระดับท่อเข้า — Earth 13 พ.ย.) · ไม่ฉาบ'})
json.dump(m, open(os.path.join(H, 'stage5a.bm.json'), 'w'), ensure_ascii=False, indent=1)
print(collections.Counter(f['type'] for f in fx), len(pipes), len(eq)); print({k: round(v, 3) for k, v in ZSINK.items()})
