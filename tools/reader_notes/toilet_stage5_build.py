# ขั้น 5 งานระบบ — ต่อจาก stage4.bm.json
# อ่าน: E.1.01 (สัญลักษณ์) · E.1.02 (ข้อกำหนด/ความสูงติดตั้ง) · E.2.01 (แปลนไฟฟ้า)
#       SN.2.01 น้ำดี (DWG แผ่นที่ 32) · SN.2.01 น้ำเสีย แบบ A (หน้า PDF 34/38 = DWG แผ่นที่ 31 — Earth เลือก) · SN.3.01 (ถังบำบัด)
import json, sys, math, pickle, collections
sys.path.insert(0, '/home/claude/UD-Total-Station/tools')
import takeoff as T

FD, AS, US = 'from_drawing', 'assumed', 'user'
m = json.load(open('stage4.bm.json'))
S = pickle.load(open('../dwg/sheets.pkl', 'rb'))
rows = []
def row(*a): rows.append(a)
r2 = lambda v: round(float(v), 3)

def origin(i):   # จุด กริด 1/A ของแผ่น จากตัวเลขในหัวกริด (เทียบกับ A.2.01: +0.0216, +0.0808)
    t1 = next(q for q in S[i]['prims'] if q['kind'] == 'text' and q['text'] == '1' and q.get('parent') == 'A$C15B253FF')
    ta = next(q for q in S[i]['prims'] if q['kind'] == 'text' and q['text'] == 'A' and q.get('parent') == 'A$C15B253FF')
    return t1['at'][0] + 0.0216, ta['at'][1] + 0.0808

FLOOR = 0.20          # ระดับผิวพื้นสำเร็จในห้องน้ำ (ความสูงติดตั้งวัดจากผิวพื้น)
_cl = next(f for f in m['finishes'] if f['id'] == 'CL1')
CEIL = _cl['z']
zc = lambda y: _cl['slope']['z'] + _cl['slope']['dz'] * (y - _cl['slope']['at'])   # ระดับฝ้าเอียงที่พิกัด y

# ================================================================ ไฟฟ้า E.2.01
X0, Y0 = origin(30)
EX0, EY0, ESH = X0, Y0, S[30]
sh = S[30]
inplan = lambda x, y: -1.0 < x < 11.6 and -1.0 < y < 7.0
pts_by = collections.defaultdict(list)
for q in sh['prims']:
    if q['kind'] == 'insert' and q.get('parent') is None:
        x, y = q['at'][0] - X0, q['at'][1] - Y0
        if inplan(x, y):
            pts_by[q['name']].append((round(x, 2), round(y, 2), q['rot'], q.get('sx', 1)))
el = {'route_height': CEIL, 'conduit': 'PVC สีเหลือง (ท่อร้อยสาย)', 'wire_type': 'THW',
      'point_types': {
          'L18': {'kind': 'light', 'desc': 'โคมหลอด LED T8 18W พร้อมอุปกรณ์ครบชุด', 'dims': [1.20, 0.08, 0.05]},
          'L9': {'kind': 'light', 'desc': 'โคมหลอด LED T8 9W พร้อมอุปกรณ์ครบชุด', 'dims': [0.60, 0.08, 0.05]},
          'WL': {'kind': 'lamp', 'desc': 'โคมไฟกิ่งติดผนังภายนอก LED พร้อมอุปกรณ์ครบชุด', 'dims': [0.15, 0.25, 0.25]},
          'SW': {'kind': 'switch', 'desc': 'สวิตช์ทางเดียว ฝาครอบกันน้ำ +1.20', 'dims': [0.08, 0.03, 0.12]},
          'OUT': {'kind': 'outlet', 'desc': 'เต้ารับคู่มีสายดิน ฝาครอบกันน้ำ +0.90', 'dims': [0.08, 0.03, 0.12]},
          'OP': {'kind': 'outlet', 'desc': 'เต้ารับปั๊มน้ำ กล่อง ABS ฝาทึบ +0.60', 'dims': [0.10, 0.04, 0.10]}},
      'panels': [], 'circuits': [], 'points': []}
LC = pts_by['LOADCENTER'][0]
el['panels'].append({'id': 'LC-1', 'xyz': [LC[0], LC[1], FLOOR + 1.80], 'ways': 4, 'main': 'MCB 2P 32A', 'dims': [0.30, 0.10, 0.40],
                     'status': AS, 'src': 'E.2.01 ตำแหน่ง · ขนาดแผง/เมนไม่มีในแบบ'})
el['circuits'] = [
    {'id': 'L1', 'panel': 'LC-1', 'desc': 'แสงสว่างฝั่งซ้าย (ห้องชาย + ทางเข้า + โคมกิ่งมุม 1/A)', 'breaker': '1P 16A', 'wire_size': 2.5, 'conductors': 2},
    {'id': 'L2', 'panel': 'LC-1', 'desc': 'แสงสว่างฝั่งขวา (ห้องหญิง + ห้องคนพิการ + โคมกิ่งมุม 4/A)', 'breaker': '1P 16A', 'wire_size': 2.5, 'conductors': 2},
    {'id': 'P1', 'panel': 'LC-1', 'desc': 'เต้ารับ + ปั๊มน้ำ', 'breaker': '1P 20A', 'wire_size': 4, 'conductors': 3}]
XL = 5.40     # เส้นแบ่งวงจรแสงสว่าง ซ้าย/ขวา
MASW = [w for w in m['walls'] if w['kind'] in ('brick_mon', 'brick_mon_full', 'aac', 'block') and len(w['path']) == 2]
def snap(x, y, lim=0.45):   # ผิวผนังใกล้สุด + ทิศหันหน้า (เหมือนขั้น 4)
    best = None
    for w in MASW:
        a, b = w['path']; L = math.dist(a, b); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        u = (x - a[0]) * ux + (y - a[1]) * uy
        if not (-0.05 <= u <= L + 0.05):
            continue
        v = (x - a[0]) * -uy + (y - a[1]) * ux
        if best is None or abs(v) < best[0]:
            best = (abs(v), w, u, v, ux, uy)
    if not best or best[0] > lim:
        return x, y, None
    _, w, u, v, ux, uy = best; sg = 1 if v >= 0 else -1; nx, ny = -uy * sg, ux * sg; a = w['path'][0]
    return r2(a[0] + ux * u + nx * w['t'] / 2), r2(a[1] + uy * u + ny * w['t'] / 2), round(math.degrees(math.atan2(ny, nx))) % 360
def P(t, x, y, z, c, rot=None, wall=False):
    if wall:
        x, y, rot = snap(x, y)
    p = {'id': f'{t}-{sum(1 for p in el["points"] if p["type"] == t) + 1:02d}', 'type': t, 'xyz': [x, y, r2(z)], 'circuit': c}
    if rot is not None:
        p['rot'] = rot
    el['points'].append(p)
def lamp_center(x, y, rt, sx, L):   # จุดแทรกบล็อกโคมอยู่ปลายหลอด → ศูนย์กลาง = ปลาย + ครึ่งความยาวตามทิศบล็อก
    a = math.radians(rt); dx, dy = (1 if sx > 0 else -1) * math.cos(a), (1 if sx > 0 else -1) * math.sin(a)
    return r2(x + dx * L / 2), r2(y + dy * L / 2)
RAW = {}   # id → จุดแทรกเดิม (ใช้จับปลายเส้นสายไฟในแบบ)
for x, y, rt, sx in sorted(pts_by['A$C59DC7984']):
    cx, cy = lamp_center(x, y, rt, sx, 1.20); P('L18', cx, cy, zc(cy), 'L1' if cx < XL else 'L2', rot=round(rt) % 180); RAW[el['points'][-1]['id']] = (x, y, rt, sx, 1.20)
for x, y, rt, sx in sorted(pts_by['A$C1201696c']):
    cx, cy = lamp_center(x, y, rt, sx, 0.60); P('L9', cx, cy, zc(cy), 'L1' if cx < XL else 'L2', rot=round(rt) % 180); RAW[el['points'][-1]['id']] = (x, y, rt, sx, 0.60)
# โคมกิ่ง: A1 ติดหน้าเสา A1 ด้านนอก · A4 ติดปลายผนังก่อต่อจากเสา A4 (W-A4c) — หันออกทิศ −Y
for (x, y) in [(0.0, -0.10), (10.8, -0.30)]:
    P('WL', x, y, 2.40, 'L1', rot=270)
for x, y, _, _ in sorted(pts_by['SWICH']):
    P('SW', x, y, FLOOR + 1.20, 'L1' if x < XL else 'L2', wall=True); RAW[el['points'][-1]['id']] = (x, y)
for x, y, _, _ in sorted(pts_by['SWICH-1']):
    if y > 5.0:
        P('OP', x, y, 0.60, 'P1', wall=True)       # เต้ารับปั๊ม นอกอาคารด้านหลัง (ข้างป้าย PUMP)
    else:
        P('OUT', x, y, FLOOR + 0.90, 'P1', wall=True)
px, py, prot = snap(LC[0], LC[1])
el['panels'][0]['xyz'][:2] = [px, py]
if prot is not None:
    el['panels'][0]['rot'] = prot
# สายเมน มิเตอร์ → ตู้ LC: แบบไม่บอกระยะ — Earth ให้ใส่ระยะเอง (แก้ค่า length ในไฟล์ได้) · ขนาดสายตามตาราง E.1.02 มิเตอร์ 15(45)A
el['service'] = {'length': 10.0, 'wire_type': 'THW', 'wire_size': 16, 'conductors': 2, 'conduit': 'PVC สีเหลือง 1"', 'meter': '15(45)A',
                 'status': AS, 'note': 'ระยะมิเตอร์ → LC คิดเอง 10 ม. (แบบไม่ระบุ) · สาย THW 16 ตร.มม. ตามตาราง E.1.02 มิเตอร์ 15(45)A'}
m.setdefault('mep', {})['electrical'] = el
cnt = collections.Counter(p['type'] for p in el['points'])
row('ไฟฟ้า', 'ดวงโคม', f'LED T8 18W {cnt["L18"]} · LED T8 9W {cnt["L9"]} · โคมกิ่งติดผนังภายนอก {cnt["WL"]} — ติดใต้ฝ้าเอียง +{zc(5.8):.2f}…+{zc(0):.2f} (โคมกิ่ง +2.40)', 'E.2.01', FD,
    'ความสูงโคมกิ่งคิดเอง +2.40')
row('ไฟฟ้า', 'สวิตช์ / เต้ารับ', f'สวิตช์ทางเดียว {cnt["SW"]} จุด (+1.20 จากพื้น) · เต้ารับคู่ {cnt["OUT"]} จุด (+0.90) · เต้ารับปั๊ม {cnt["OP"]} จุด (+0.60)', 'E.2.01, E.1.02', FD,
    'สวิตช์: E.2.01 เขียน +1.20 / E.1.02 เขียน +1.10 → ใช้ +1.20 ตามแปลน')
row('ไฟฟ้า', 'แผงควบคุม LC', f'Load center 1 ชุด ที่ ({LC[0]}, {LC[1]}) สูง +1.80 · 4 ช่อง เมน MCB 2P 32A', 'E.2.01', AS,
    'แบบไม่มีตารางโหลด/single line — จำนวนช่องและขนาดเมนคิดเอง · E.1.02 รูปความสูงเขียน 1.75')
row('ไฟฟ้า', 'วงจรย่อย (จัดเอง)', 'L1 แสงสว่างซ้าย · L2 แสงสว่างขวา (THW 2.5 ตร.มม. 2 เส้น) · P1 เต้ารับ+ปั๊ม (THW 4 ตร.มม. 3 เส้นรวมดิน) · ท่อ PVC เหลือง เดินระดับฝ้า', 'E.1.02', US,
    'Earth ให้จัดเอง · ความยาวท่อ/สาย ประมาณจากตำแหน่งจุด (แบบเขียนเส้นสายเฉพาะกลุ่มสวิตช์ ~31 ม. ไม่ครบเส้นทาง)')
row('ไฟฟ้า', 'สายเมน มิเตอร์ → LC', 'ใส่ระยะเอง 10 ม. · THW 16 ตร.มม. 2 เส้น ในท่อ PVC 1" (มิเตอร์ 15(45)A ตามตาราง E.1.02)', 'E.1.02', AS, 'Earth ให้ใส่ระยะเอง — แก้ได้ที่ mep.electrical.service.length')

# ================================================================ ประปา SN.2.01 น้ำดี (DWG แผ่น 32)
pl = m['mep']['plumbing']
fx = pl['fixtures']
X0, Y0 = origin(32)
sh = S[32]
CWZ = -0.30     # ท่อประปาเดินใต้ดิน ต่ำกว่าท้องคานคอดิน (-0.23)
UPZ = 0.10      # ท่อช่วงถังเก็บน้ำ–ปั๊ม (วางบนดิน)
valves = [((q['p'][0][0] + q['p'][1][0]) / 2 - X0, (q['p'][0][1] + q['p'][1][1]) / 2 - Y0)
          for q in sh['prims'] if q.get('parent') == 'hhhh' and q['kind'] == 'poly' and q.get('layer') == 'DEFPOINTS' and abs(q['p'][0][1] - q['p'][1][1]) < 1e-6]
near_fx = lambda x, y: min(fx, key=lambda f: math.hypot(f['xyz'][0] - x, f['xyz'][1] - y))
# ระดับจุดต่อน้ำดีของสุขภัณฑ์ (ผิวพื้นสำเร็จ +): โถส้วม +0.20 (วาล์วหม้อน้ำ) · โถปัสสาวะ +0.95 (ฟลัชวาล์ว) · อื่นๆ ตามระดับสุขภัณฑ์
FT_ = m['mep']['plumbing']['fixture_types']
def cw_z(f):
    k = FT_[f['type']]['kind']
    return {'wc': 0.20 + 0.20, 'urinal': 0.20 + 0.95}.get(k, f['xyz'][2])
pipes = []
def addpipe(sysn, dia, pts, src, st=FD, mat=None, note=None):
    p = {'id': f'{sysn.upper()}-{sum(1 for q in pipes if q["system"] == sysn) + 1:02d}', 'system': sysn, 'dia': dia,
         'pts': [[r2(a) for a in pt] for pt in pts], 'status': st, 'src': src}
    if mat: p['material'] = mat
    if note: p['note'] = note
    pipes.append(p)
L_cw = collections.defaultdict(float)
for q in sh['prims']:
    if q.get('parent') == 'SET WC' and q['kind'] == 'poly' and q.get('lt') == 'DIVIDE2':
        xy = [(a[0] - X0, a[1] - Y0) for a in q['p']]
        L = sum(math.dist(xy[i], xy[i + 1]) for i in range(len(xy) - 1))
        if max(y for _, y in xy) > 6.3:          # ช่วงถังเก็บน้ำ / ปั๊ม / ท่อเมนเข้า (บนดิน)
            z = UPZ
            pts3 = [[x, y, z] for x, y in xy]
            if abs(xy[-1][1] - 5.9) < 0.01:       # ลงดินไปต่อท่อเมนแนวหลังอาคาร
                pts3.append([xy[-1][0], xy[-1][1], CWZ])
            addpipe('cw', '1"', pts3, 'SN.2.01 น้ำดี (ท่อ CW PVC 1")', mat='PVC ชั้น 13.5')
            L_cw['1"'] += L
            continue
        # ท่อย่อยเข้าสุขภัณฑ์: ปลายข้างหนึ่งอยู่ที่วาล์วเปิดปิด และสั้น → 1/2"
        end_v = [k for k in (0, -1) if any(math.dist(xy[k], v) < 0.12 for v in valves)]
        pts3 = [[x, y, CWZ] for x, y in xy]
        for k in end_v:   # ยกขึ้นถึงระดับสุขภัณฑ์
            f = near_fx(*xy[k])
            if k == 0:
                pts3.insert(0, [xy[0][0], xy[0][1], cw_z(f)])
            else:
                pts3.append([xy[-1][0], xy[-1][1], cw_z(f)])
        dia = '1/2"' if end_v and L < 0.6 else '1"'
        addpipe('cw', dia, pts3, 'SN.2.01 น้ำดี (' + ('ต่อเข้าสุขภัณฑ์ ⌀1/2"' if dia == '1/2"' else 'ท่อ CW PVC 1"') + ')', mat='PVC ชั้น 13.5')
        L_cw[dia] += L
# สุขภัณฑ์ที่ใช้น้ำดีแต่แบบไม่มีท่อย่อยมาถึง (แนวท่อเมนผ่านใกล้ ≤ 0.40) → ต่อแยก ⌀1/2" จากท่อเมนยกขึ้นถึงจุดต่อ
def seg_near(px, py, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]; L2 = (bx - ax) ** 2 + (by - ay) ** 2
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2))
    return ax + t * (bx - ax), ay + t * (by - ay), a[2] + t * (b[2] - a[2])
for f in fx:
    if FT_[f['type']]['kind'] not in ('wc', 'urinal', 'faucet', 'spray'):
        continue
    x, y = f['xyz'][0], f['xyz'][1]
    risers = [q for q in pipes if q['system'] == 'cw' and any(math.hypot(e[0] - x, e[1] - y) < 0.40 and e[2] > CWZ + 0.05 for e in (q['pts'][0], q['pts'][-1]))]
    if risers:
        continue
    best = None
    for q in pipes:
        if q['system'] != 'cw':
            continue
        for i in range(len(q['pts']) - 1):
            a, b = q['pts'][i], q['pts'][i + 1]
            if abs(a[2] - CWZ) > 1e-6 or abs(b[2] - CWZ) > 1e-6:
                continue
            nx, ny, nz = seg_near(x, y, a, b); d = math.hypot(nx - x, ny - y)
            if d <= 0.40 and (best is None or d < best[0]):
                best = (d, nx, ny, nz)
    if best:
        _, nx, ny, nz = best
        pp_ = [[nx, ny, nz]] + ([[x, y, nz]] if math.hypot(nx - x, ny - y) > 0.01 else []) + [[x, y, cw_z(f)]]
        addpipe('cw', '1/2"', pp_, 'SN.2.01 น้ำดี (แยกจากท่อเมนเข้าสุขภัณฑ์ — แบบเขียนเส้นสั้นมาก)', mat='PVC ชั้น 13.5',
                note=f'ต่อเข้า {f["id"]}')
# วาล์วเปิดปิดท่อย่อย (สัญลักษณ์ในแปลนน้ำดี) — นับเป็นส่วนหนึ่งของชุดสุขภัณฑ์ ไม่แยกรายการ
eq = pl.setdefault('equipment', [])
tank = next(q for q in sh['prims'] if q.get('parent') == 'qeg4' and q['kind'] == 'circle' and abs(q['r'] - 0.585) < 0.01)
tx, ty = tank['c'][0] - X0, tank['c'][1] - Y0
eq.append({'id': 'WT-1', 'kind': 'water_tank', 'xyz': [r2(tx), r2(ty), 1.05], 'dims': [1.17, 1.17, 2.10], 'size': '2,000 ลิตร วางบนพื้นดิน (WAVE, DOS หรือเทียบเท่า)',
           'status': FD, 'src': 'SN.2.01 น้ำดี + สัญลักษณ์', 'note': 'ความสูงถัง 2.10 คิดเอง (แบบให้แค่ขนาด/ยี่ห้อ)'})
pump = next(q for q in sh['prims'] if q.get('parent') == 'SET WC' and q['kind'] == 'poly' and q.get('layer') == 'P1')
px = sum(a[0] for a in pump['p'][:4]) / 4 - X0; py = sum(a[1] for a in pump['p'][:4]) / 4 - Y0
eq.append({'id': 'PU-1', 'kind': 'pump', 'xyz': [r2(px), r2(py), 0.25], 'dims': [0.43, 0.43, 0.40], 'size': 'ปั๊มน้ำอัตโนมัติ 300 วัตต์ (Mitsubishi, Hitachi หรือเทียบเท่า)',
           'status': FD, 'src': 'SN.2.01 น้ำดี'})
for k, x in enumerate([4.12, 5.08, 7.40], 1):     # ประตูน้ำ 3 ตัว (หน้า/หลังปั๊ม, ท่อเข้าถัง) — กึ่งกลางสัญลักษณ์
    eq.append({'id': f'GV-{k}', 'kind': 'gate_valve', 'xyz': [x, 6.58, UPZ], 'size': '1"', 'status': FD, 'src': 'SN.2.01 น้ำดี'})
pl['cw_material'] = 'PVC ชั้น 13.5'
ONE, HALF = '1"', '1/2"'
row('ประปา', 'ท่อน้ำดี PVC', f'⌀1" {L_cw[ONE]:.2f} ม. · ⌀1/2" {L_cw[HALF]:.2f} ม. ในแปลน (ยาวรวมท่อยกขึ้นสุขภัณฑ์ ดูตารางปริมาณด้านล่าง) — เดินใต้ดิน -0.30 (ใต้ท้องคานคอดิน), ช่วงถัง-ปั๊มบนดิน', 'SN.2.01 น้ำดี', FD,
    'ชั้นท่อไม่ระบุ → PVC ชั้น 13.5 · ความลึกฝังคิดเอง')
row('ประปา', 'ถังเก็บน้ำ / ปั๊ม / ประตูน้ำ', 'ถังเก็บน้ำบนดิน 2,000 ลิตร 1 · ปั๊มอัตโนมัติ 300 W 1 · ประตูน้ำ 1" 3 ตัว', 'SN.2.01 น้ำดี', FD)
row('ประปา', 'ท่อเมนเข้า', 'ต่อจากท่อเมนประปาในโครงการ — คิดถึงปลายเส้นที่เขียน (0.67 ม. จากถัง)', 'SN.2.01 น้ำดี', AS, 'ความยาวถึงจุดต่อจริงไม่ทราบ')

# ================================================================ น้ำเสีย SN.2.01 แบบ A (DWG แผ่น 31)
X0, Y0 = origin(31)
sh = S[31]
DZ = -0.40      # ท่อระบายเดินใต้ดิน ต่ำกว่าท่อประปา
D8Z = -0.60     # ท่อซีเมนต์ใยหิน 8"
def polys(parent, layer):
    for q in sh['prims']:
        if q.get('parent') == parent and q['kind'] == 'poly' and q.get('layer') == layer:
            yield [(a[0] - X0, a[1] - Y0) for a in q['p']]
FLZ = 0.15   # ผิวพื้นโครงสร้าง (หลังดรอป 0.05) — ท่อจากสุขภัณฑ์/FD ลงจากระดับนี้
def drop_pipe(sysn, dia, xy, src, z0=FLZ, st=FD, note=None, end=None):
    pts3 = [[xy[0][0], xy[0][1], z0]] + [[x, y, DZ] for x, y in xy]
    if end:
        pts3 += end
    addpipe(sysn, dia, pts3, src, st=st, mat='PVC ชั้น 8.5', note=note)
# โสโครก 4": ส้วม 3 ห้องซ้าย + ห้องคนพิการ → ถังซ้าย · ส้วม 5 ห้องขวา → ถังขวา
TL, TR = (-0.90, 6.50), (11.70, 6.50)     # ศูนย์กลางถังบำบัด (กรอบ 1.70×1.70)
for xy in polys('SET SN04', 'SN04'):
    xy = [p for i, p in enumerate(xy) if i == 0 or math.dist(p, xy[i - 1]) > 1e-6]
    if xy[-1][0] < -1.0:                         # ท่อเมนซ้ายลากผ่านถังถึง -1.82 → ตัดที่ขอบถัง
        xy[-1] = (-0.05, xy[-1][1])
    drop_pipe('soil', '4"', xy, 'SN.2.01 น้ำเสีย (S) PVC 4"')
# WC ห้องขวาสุด (x 10.3) — แบบ DWG เขียนอยู่ชั้น DIM แต่ใน PDF เห็นต่อขึ้นท่อเมน
drop_pipe('soil', '4"', [(10.30, 5.42), (10.30, 6.09)], 'SN.2.01 น้ำเสีย (PDF หน้า 34)', note='DWG เขียนเส้นนี้ในชั้น DIM')
# ท่อเมนขวา → ถังขวา (PDF: ข้องอขึ้นแล้วเข้าถังด้านซ้าย)
addpipe('soil', '4"', [[10.45, 6.09, DZ], [10.60, 6.09, DZ], [10.60, 6.50, DZ], [10.85, 6.50, DZ]], 'SN.2.01 น้ำเสีย (PDF หน้า 34)', mat='PVC ชั้น 8.5')
# น้ำทิ้งโถปัสสาวะ 2" (DWG SET UR S02)
for xy in polys('SET UR S02', 'SN02'):
    xy = [p for i, p in enumerate(xy) if i == 0 or math.dist(p, xy[i - 1]) > 1e-6]
    if len(xy) < 2:
        continue
    start_ur = any(abs(xy[0][0] - u) < 0.01 for u in (0.14, 1.86))
    if start_ur:
        drop_pipe('waste', '2"', xy, 'SN.2.01 น้ำเสีย (W) PVC 2" โถปัสสาวะ', z0=0.30)
    else:
        addpipe('waste', '2"', [[x, y, DZ] for x, y in xy] + [[-0.05, 6.50, DZ]], 'SN.2.01 น้ำเสีย (W) PVC 2"', st=AS, mat='PVC ชั้น 8.5',
                note='แบบลากถึง (0.49, 6.50) มีลูกศร แต่ไม่ต่อถึงถัง → ต่อเข้าถังบำบัดซ้าย (คิดเอง)')
# น้ำทิ้ง FD + LAV.1 2" (DWG Set W 02)
for xy in polys('Set W 02', 'SN02'):
    xy = [p for i, p in enumerate(xy) if i == 0 or math.dist(p, xy[i - 1]) > 1e-6]
    if len(xy) < 2:
        continue
    st = (xy[0][0], xy[0][1])
    fd = [f for f in fx if f['type'] == 'FD' and math.hypot(f['xyz'][0] - st[0], f['xyz'][1] - st[1]) < 0.06]
    lav1 = math.hypot(st[0] - 5.8, st[1] - 2.8) < 0.06
    if fd or lav1:
        drop_pipe('waste', '2"', xy, 'SN.2.01 น้ำเสีย (W) PVC 2"', z0=0.50 if lav1 else FLZ)
    else:
        addpipe('waste', '2"', [[x, y, DZ] for x, y in xy], 'SN.2.01 น้ำเสีย (W) PVC 2"', mat='PVC ชั้น 8.5')
# ท่อ (W) 2" ปลายบนสุดเข้าบ่อพัก: ลงไประดับท่อ 8"
for p in pipes:
    if p['system'] == 'waste' and p['pts'][-1][1] > 7.30 and p['pts'][-1][2] == DZ:
        p['pts'].append([p['pts'][-1][0], p['pts'][-1][1], D8Z])
# อ่างล้างหน้า LAV.2 บนเคาน์เตอร์ — แบบไม่เขียนท่อ → ลงต่อท่อ (W) ของ FD ใต้เคาน์เตอร์
for f in fx:
    if f['type'] == 'LAV2':
        x, y, _ = f['xyz']; xl = 4.0 if x < 5.4 else 6.7
        addpipe('waste', '2"', [[x, y, 0.50], [x, y, DZ], [xl, y, DZ]], 'แบบไม่เขียน — คิดเอง', st=AS, mat='PVC ชั้น 8.5',
                note=f'ท่อน้ำทิ้งอ่าง {f["id"]} ต่อเข้าท่อ (W) ใต้เคาน์เตอร์')
# ถังบำบัดซ้าย → ท่อ 8" ปลายซ้าย (PDF: ท่อ (S) 4" ลากผ่านถังไปทางซ้ายแล้วขึ้นต่อท่อระบายของโครงการ)
addpipe('soil', '4"', [[-1.75, 7.30, DZ], [-4.11, 7.30, DZ], [-4.11, 7.55, D8Z]], 'SN.2.01 น้ำเสีย (PDF หน้า 34)', mat='PVC ชั้น 8.5',
        note='ท่อน้ำออกจากถังบำบัดซ้าย')
addpipe('soil', '4"', [[12.55, 6.50, DZ], [13.64, 6.50, DZ], [13.64, 7.35, D8Z]], 'แบบไม่เขียน — คิดเอง', st=AS, mat='PVC ชั้น 8.5',
        note='ท่อน้ำออกจากถังบำบัดขวา → บ่อพักขวาสุด (แบบมีแค่ป้าย (S) PVC 4")')
# ท่อระบายซีเมนต์ใยหิน 8" + บ่อพัก 4 บ่อ
mh = sorted({round((min(a[0] for a in q['p']) + max(a[0] for a in q['p'])) / 2 - X0, 2)
             for q in sh['prims'] if q.get('parent') == 'A$C67e598f2' and q['kind'] == 'poly' and len(q['p']) == 5
             and max(a[0] for a in q['p']) - min(a[0] for a in q['p']) > 0.45 and q['p'][0][1] - Y0 > 7.0})
for k, x in enumerate(mh, 1):
    eq.append({'id': f'MH-{k}', 'kind': 'manhole', 'xyz': [x, 7.55, -0.30], 'dims': [0.50, 0.40, 0.60], 'size': 'บ่อพักสำเร็จรูป 40x50 ซม. พร้อมฝาปิด',
               'status': FD, 'src': 'SN.2.01 น้ำเสีย'})
addpipe('drain', '8"', [[-4.11, 7.55, D8Z], [14.39, 7.55, D8Z]], 'SN.2.01 น้ำเสีย (ท่อระบายน้ำทิ้งซีเมนต์ใยหิน 8" SLOPE 1:200)', mat='ซีเมนต์ใยหิน',
        note='คิดตามเส้นที่เขียน (ปลายสองข้าง "ต่อเข้ากับระบบระบายน้ำภายในโครงการ") · ระดับ -0.60 คิดเอง')
for k, (x, y) in enumerate([TL, TR], 1):
    eq.append({'id': f'ST-{k}', 'kind': 'septic_tank', 'xyz': [x, y, -0.80], 'dims': [1.46, 1.46, 1.40], 'size': '2,000 ลิตร (AQUA, WAVE, COTTO, DOS หรือเทียบเท่า)',
               'status': FD, 'src': 'SN.2.01 น้ำเสีย + SN.3.01 (KS-2000 Od 1.46 H 1.40)'})
# สุขภัณฑ์ที่ท่อในแปลนต่อถึง (ระยะในแปลนจากสุขภัณฑ์ถึงแนวท่อ ≤ 0.40) → pipe.serves กันถอดปริมาณประมาณท่อซ้ำ
NEED = {'wc': ('soil', 'cw'), 'urinal': ('waste', 'cw'), 'lavatory': ('waste',), 'floor_drain': ('waste',), 'faucet': ('cw',), 'spray': ('cw',)}
def segd(px, py, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]; L2 = (bx - ax) ** 2 + (by - ay) ** 2
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2))
    return math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay))
unserved = []
for f in fx:
    for sysn in NEED.get(pl['fixture_types'][f['type']]['kind'], ()):
        best = min(((segd(f['xyz'][0], f['xyz'][1], p['pts'][i], p['pts'][i + 1]), p) for p in pipes if p['system'] == sysn
                    for i in range(len(p['pts']) - 1)), key=lambda t: t[0], default=(9, None))
        if best[0] <= 0.40:
            best[1].setdefault('serves', []).append(f['id'])
        else:
            unserved.append(f"{f['id']}/{sysn}")
print('ยังไม่มีท่อ:', unserved)
pl['pipes'] = pipes
pl['drain_material'] = 'PVC ชั้น 8.5'
Ls = collections.defaultdict(float)
for p in pipes:
    Ls[(p['system'], p['dia'], p['status'])] += sum(math.dist(p['pts'][i], p['pts'][i + 1]) for i in range(len(p['pts']) - 1))
row('สุขาภิบาล', 'แบบที่ใช้', 'แปลนน้ำเสียแบบ A (PDF หน้า 34/38 = DWG แผ่นที่ 31) — แบบ B (หน้า 36) และ C บ่อซึม (หน้า 37) ไม่ใช้', 'SN.2.01', US, 'Earth เลือก')
row('สุขาภิบาล', 'ท่อโสโครก (S) PVC 4"', 'ส้วม 3 ห้องซ้าย + ห้องคนพิการ → ถังซ้าย · ส้วม 5 ห้องขวา → ถังขวา · ใต้ดิน -0.40', 'SN.2.01', FD,
    'ส้วมห้องขวาสุดใน DWG อยู่ชั้น DIM → ใช้ตาม PDF')
row('สุขาภิบาล', 'ท่อน้ำทิ้ง (W) PVC 2"', 'FD ทุกตัว + LAV.1 → ท่อหลังห้องส้วม → ขึ้นเข้าบ่อพัก 2 บ่อ (x 2.14, 8.14) โดยตรง ไม่ผ่านถัง', 'SN.2.01', FD)
row('สุขาภิบาล', 'น้ำทิ้งโถปัสสาวะ', 'ท่อ 2" รวมแนว x 0.64 ขึ้นไปทางถังซ้าย → ต่อเข้าถังบำบัดซ้าย', 'SN.2.01', AS, 'แบบลากไม่ถึงถัง (หยุดที่ลูกศร) — ขอยืนยันว่าเข้าถังบำบัด')
row('สุขาภิบาล', 'น้ำทิ้งอ่าง LAV.2', 'แบบไม่เขียนท่อ → ลงต่อท่อ (W) ใต้เคาน์เตอร์ (ที่ FD) อ่างละ ~1–1.9 ม.', '-', AS, 'ขอยืนยัน')
row('สุขาภิบาล', 'น้ำออกจากถังบำบัด', 'ถังซ้าย → ท่อ 4" ไปปลายท่อ 8" ด้านซ้าย (ตาม PDF) · ถังขวา → บ่อพักขวาสุด (แบบไม่เขียน คิดเอง)', 'SN.2.01', AS)
row('สุขาภิบาล', 'ท่อระบาย 8" + บ่อพัก', f'ท่อซีเมนต์ใยหิน 8" ยาว 18.50 ม. (x -4.11 → 14.39) · บ่อพักสำเร็จรูป 40x50 {len(mh)} บ่อ', 'SN.2.01', FD,
    'ปลายสองข้างต่อระบบโครงการ — คิดถึงปลายเส้นที่เขียน · ท่อใยหินไม่มีอัตรา % ข้อต่อใน ว480')
row('สุขาภิบาล', 'ถังบำบัด', 'ถังบำบัดสำเร็จรูป 2,000 ลิตร 2 ใบ (KS-2000 Od 1.46 H 1.40)', 'SN.2.01, SN.3.01', FD)

# ---------------------------------------------------------------- งานโยธาถังบำบัด (SN.3.01)
for k, (x, y) in enumerate([TL, TR], 1):
    sq = [[r2(x - 0.85), r2(y - 0.85)], [r2(x + 0.85), r2(y - 0.85)], [r2(x + 0.85), r2(y + 0.85)], [r2(x - 0.85), r2(y + 0.85)]]
    m['slabs'].append({'id': f'STP-{k}', 'mark': 'STP', 'kind': 'ground', 't': 0.15, 'top': -1.50, 'polygon': sq, 'material': 'C240',
                       'use': 'พื้นรับน้ำหนักถังบำบัด', 'task': 'mep_ext', 'status': AS, 'src': 'SN.3.01 ขยายพื้นรับน้ำหนักถังบำบัด (หนา 0.15 RB9@0.20#)',
                       'note': 'ขนาด 1.70×1.70 ตามกรอบ A ของ KS-2000 · ระดับคิดเอง (ใต้ถัง H 1.40 + ฝา 0.10)'})
    m['design']['slabs'][f'STP-{k}'] = {'rebar': {'mesh': [9, 0.20, 1]}, 'status': FD, 'src': 'SN.3.01 RB9 @0.20#'}
    m['slabs'].append({'id': f'STC-{k}', 'mark': 'STC', 'kind': 'ground', 't': 0.10, 'top': 0.00, 'polygon': sq, 'material': 'C240',
                       'use': 'ค.ส.ล.รัดฝาถังบำบัด', 'task': 'mep_ext', 'status': AS, 'src': 'SN.3.01 ค.ส.ล.รัดฝาถัง หนา 0.10 RB9@0.20#',
                       'note': 'ขนาดเท่าพื้นรับถัง ไม่หักช่องฝา — คิดเอง'})
    m['design']['slabs'][f'STC-{k}'] = {'rebar': {'mesh': [9, 0.20, 1]}, 'status': FD, 'src': 'SN.3.01 RB9 @0.20#'}
fin = m['finishes']
exc = round(2 * (1.70 + 0.60) ** 2 * (1.50 + 0.15 + 0.05 + 0.05), 2)
fin.append({'id': 'ST-EXC', 'kind': 'other', 'spec': 'ขุดดินฝังถังบำบัด 2 ใบ (กว้าง 2.30×2.30 ลึก 1.75)', 'status': AS, 'src': 'SN.3.01 (คิดเอง)', 'qty': exc, 'unit': 'ลบ.ม.'})
fin.append({'id': 'ST-SAND', 'kind': 'other', 'spec': 'ทรายหยาบถมรอบถังบำบัด', 'status': AS, 'src': 'SN.3.01 รูปตัด "ทรายหยาบ"',
            'qty': round(2 * ((1.70 ** 2) * 1.40 - math.pi * 0.73 ** 2 * 1.40), 2), 'unit': 'ลบ.ม.'})
fin.append({'id': 'ST-LEAN', 'kind': 'other', 'spec': 'คอนกรีตหยาบ 0.05 + ทรายหยาบ 0.05 ใต้พื้นรับถัง', 'status': FD, 'src': 'SN.3.01',
            'qty': round(2 * 1.70 * 1.70 * 0.05, 3), 'unit': 'ลบ.ม. (คอนกรีตหยาบ)'})
row('สุขาภิบาล', 'งานโยธาถังบำบัด', 'พื้นรับถัง คสล. 1.70×1.70×0.15 RB9@0.20# + ฝารัดถัง คสล. หนา 0.10 RB9@0.20# · คอนกรีตหยาบ/ทราย 0.05 · ขุดดิน · ทรายหยาบถมรอบ', 'SN.3.01', AS,
    f'ขนาด/ระดับ/ปริมาณขุด {exc} ลบ.ม. คิดเอง — ขอยืนยัน')

m['meta'] = dict(m['meta'], name='ห้องสุขา รร.เทศบาล 4 — ขั้น 5 งานระบบ', stage=5)
m['history'].append({'at': __import__('datetime').datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'claude (อ่านแบบขั้น 5)',
                     'sections': ['mep', 'slabs', 'finishes'], 'note': 'ไฟฟ้า E.2.01 + ประปา/น้ำเสีย SN.2.01 (แบบ A) + ถังบำบัด SN.3.01'})
# ---------------------------------------------------------------- แนวท่อร้อยสายตาม E.2.01
# เส้นสายไฟในแบบ (ชั้น EL_wire) = สายจากสวิตช์ไปโคมแต่ละกลุ่ม (เส้นโค้ง = โยงโคมในกลุ่มเดียวกัน) → ใช้เป็นแนวท่อจริง
# แบบไม่เขียนสายจากตู้ LC ไปกลุ่มสวิตช์ และไปเต้ารับ → ประมาณแนวมุมฉากเหนือฝ้า (สถานะคิดเอง)
PT = {p['id']: p for p in el['points']}
def ends_of(pid):   # จุดปลายที่เส้นสายไฟในแบบอาจมาจับ: ศูนย์กลางโคม + ปลายหลอดทั้งสอง / ตำแหน่งสวิตช์
    p = PT[pid]
    if pid in RAW and len(RAW[pid]) == 2:
        return [RAW[pid], tuple(p['xyz'][:2])]
    if pid in RAW:
        x, y, rt, sx, L = RAW[pid]; a = math.radians(rt); d = (1 if sx > 0 else -1)
        return [(x, y), (x + d * math.cos(a) * L, y + d * math.sin(a) * L), tuple(p['xyz'][:2])]
    return [tuple(p['xyz'][:2])]
def nearest(pt, kinds):
    best = min(((math.dist(pt, e), pid) for pid in PT if PT[pid]['type'] in kinds for e in ends_of(pid)), default=(9, None))
    return best[1] if best[0] < 0.45 else None
LAMPS, SWS = ('L18', 'L9', 'WL'), ('SW',)
wires, links = [], []          # (pts2d, a_id, b_id)
X0, Y0 = EX0, EY0
for q in ESH['prims']:
    if q.get('layer') != 'EL_wire':
        continue
    if q['kind'] in ('poly', 'line'):
        xy = [(a[0] - X0, a[1] - Y0) for a in q['p']]
    elif q['kind'] == 'arc':
        c, rr, a0, a1 = (q['c'][0] - X0, q['c'][1] - Y0), q['r'], math.radians(q['a0']), math.radians(q['a1'])
        if a1 < a0: a1 += 2 * math.pi
        xy = [(c[0] + rr * math.cos(a0 + (a1 - a0) * k / 12), c[1] + rr * math.sin(a0 + (a1 - a0) * k / 12)) for k in range(13)]
    else:
        continue
    if max(x for x, _ in xy) > 11.6:
        continue
    A, B = nearest(xy[0], LAMPS + SWS), nearest(xy[-1], LAMPS + SWS)
    wires.append((xy, A, B))
# กลุ่มสวิตช์: union โคม–สวิตช์ ตามเส้นในแบบ
par = {pid: pid for pid in PT}
def fnd(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
for xy, A, B in wires:
    if A and B: par[fnd(A)] = fnd(B)
grp = collections.defaultdict(list)
for pid in PT:
    if PT[pid]['type'] in LAMPS + SWS: grp[fnd(pid)].append(pid)
EXTRA = {'L18-09': 'SW-10'}    # แบบไม่ลากสายถึงโคม L18-09 (หน้าทางเข้าขวา) → ใช้สวิตช์ SW-10 ข้างประตูฝั่งขวา (คิดเอง)
for lamp, sw in EXTRA.items():
    par[fnd(lamp)] = fnd(sw)
grp = collections.defaultdict(list)
for pid in PT:
    if PT[pid]['type'] in LAMPS + SWS: grp[fnd(pid)].append(pid)
switch_of = {}
for g in grp.values():
    sws = sorted(p for p in g if PT[p]['type'] == 'SW')
    for p in g:
        if PT[p]['type'] in LAMPS:
            switch_of[p] = sws[0] if sws else None
for pid, sw in switch_of.items():
    PT[pid]['switch'] = sw
    if sw: PT[pid]['circuit'] = PT[sw]['circuit']          # โคมอยู่วงจรเดียวกับสวิตช์ที่คุม
spare = sorted(p for p in PT if PT[p]['type'] == 'SW' and not any(v == p for v in switch_of.values()))
for p in spare:
    PT[p]['note'] = 'แบบไม่ลากสายจากสวิตช์นี้ไปโคม — สวิตช์สำรอง (คิดเอง)'
zt = lambda x, y: r2(zc(y) + 0.03)      # ระดับท่อเหนือฝ้าเอียง
cond = []
def C(cid, circ, pts3, st, note):
    cond.append({'id': cid, 'circuit': circ, 'pts': [[r2(a) for a in p] for p in pts3], 'status': st, 'note': note})
for k, (xy, A, B) in enumerate(wires, 1):
    pts3 = [[x, y, zt(x, y)] for x, y in xy]
    for end, pid in ((0, A), (-1, B)):
        if pid:
            p = PT[pid]
            drop = [p['xyz'][0], p['xyz'][1], p['xyz'][2]]
            if p['type'] == 'SW':   # ลงสวิตช์: เดินเหนือฝ้าถึงแนวผนัง แล้วลงในผนัง
                hop = [[p['xyz'][0], p['xyz'][1], zt(*p['xyz'][:2])], drop]
            else:
                hop = [[p['xyz'][0], p['xyz'][1], zt(*p['xyz'][:2])], drop]
            if end == 0: pts3 = hop[::-1] + pts3
            else: pts3 = pts3 + hop
    circ = PT[A]['circuit'] if A else (PT[B]['circuit'] if B else None)
    C(f'EW-{k:02d}', circ, pts3, FD, 'แนวสายไฟตาม E.2.01 (สวิตช์ → โคม)')
# โคมที่แบบไม่ลากเส้นถึง (EXTRA) → ต่อจากสวิตช์มุมฉากเหนือฝ้า
for lamp, sw in EXTRA.items():
    a, b = PT[sw]['xyz'], PT[lamp]['xyz']
    C(f'EX-{lamp}', PT[sw]['circuit'], [a, [a[0], a[1], zt(a[0], a[1])], [b[0], a[1], zt(b[0], a[1])], [b[0], b[1], zt(b[0], b[1])], b], AS,
      f'แบบไม่ลากสายถึง {lamp} — ต่อจาก {sw} (คิดเอง)')
# สายป้อนจากตู้ LC ไปกลุ่มสวิตช์ / เต้ารับ: มุมฉากเหนือฝ้า จุดใกล้สุดทีละจุด (แบบไม่เขียน)
pn = el['panels'][0]['xyz']
for circ in ('L1', 'L2', 'P1'):
    if circ == 'P1':
        tg = [p['xyz'] for p in el['points'] if p['circuit'] == 'P1']
    else:   # หัวกลุ่มสวิตช์ (สวิตช์ติดกันถือเป็นกล่องเดียว)
        sw = [PT[p]['xyz'] for p in PT if PT[p]['type'] == 'SW' and PT[p]['circuit'] == circ]
        tg = []
        for q in sorted(sw, key=lambda q: -q[1]):
            if not any(math.dist(q[:2], t[:2]) < 0.45 for t in tg): tg.append(q)
    cur = [pn[0], pn[1]]; first = True; k = 0
    while tg:
        nx = min(tg, key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1])); tg.remove(nx); k += 1
        pts3 = ([[pn[0], pn[1], pn[2]]] if first else []) + [[cur[0], cur[1], zt(*cur)], [nx[0], cur[1], zt(nx[0], cur[1])], [nx[0], nx[1], zt(nx[0], nx[1])], [nx[0], nx[1], nx[2]]]
        C(f'EF-{circ}-{k:02d}', circ, pts3, AS, 'สายป้อนจากตู้ LC — แบบไม่เขียนแนว ประมาณมุมฉากเหนือฝ้า')
        cur = [nx[0], nx[1]]; first = False
el['conduits'] = cond
row('ไฟฟ้า', 'กลุ่มสวิตช์ (E.2.01)', ' · '.join(f"{sw}: {', '.join(sorted(l for l, s_ in switch_of.items() if s_ == sw))}" for sw in sorted({v for v in switch_of.values() if v})), 'E.2.01', FD,
    'L18-09 แบบไม่ลากสาย → ใช้ SW-10 (Earth ยืนยัน) · ' + (', '.join(spare) + ' ไม่มีสายไปโคม (สำรอง)' if spare else ''))
json.dump(m, open('stage5.bm.json', 'w'), ensure_ascii=False, indent=1)

tk = T.Takeoff(m, {}); tk.run()
out = []
for it in tk.items.values():
    if it['group_code'] in ('1.3', '1.4'):
        out.append((it['group_code'], it['name'], round(it['qty_net'], 2), it['unit'], it.get('waste')))
json.dump({'rows': rows, 'mep': sorted(out), 'notes': tk.notes if hasattr(tk, 'notes') else []}, open('stage5_rows.json', 'w'), ensure_ascii=False, indent=1)
for o in sorted(out): print(o)
print('pipes', {k: round(v, 2) for k, v in Ls.items()})
