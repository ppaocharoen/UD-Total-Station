# โครงหลังคาเหล็ก บ้านแนน (S-07 ดั้ง · S-08 อกไก่/ตะเข้/จันทัน/แป) — ผิวหลังคาสร้างจากขอบชายคาใน S-08 (ปั้นหยา 5° ยื่น 0.55 รอบ)
import math, collections
import ext
TAN = math.tan(math.radians(5)); COS = math.cos(math.radians(5))
EAVE = 8.78
WINGS = {'M': (-0.55, 4.25, 18.15, 17.95), 'W': (-1.75, 4.25, 7.15, 11.95)}   # ผืนหลัก · ผืนเล็กตะวันตก (สันสั้น x 2.10–3.30 ที่ y 8.10)
STACK = 0.040   # ชิงเกิ้ล + แผ่นรอง SUB ROOF ~12 มม. + แปกล่อง 25 มม. (ผิวหลังคาในโมเดล = หลังวัสดุมุง)
GRAD = {'W': (1, 0), 'E': (-1, 0), 'S': (0, 1), 'N': (0, -1)}
def surf(x, y, d=None):
    """ผิวหลังคาที่ (x,y) = สูงสุดของผืนที่คลุม · d = ทิศชิ้น (จันทัน): เลือกด้านที่ลาดตามทิศนั้น"""
    if d is not None:
        c = []
        for w, (x0, y0, x1, y1) in WINGS.items():
            if not (x0 - 0.01 <= x <= x1 + 0.01 and y0 - 0.01 <= y <= y1 + 0.01): continue
            ds = {"W": max(0, x - x0), "E": max(0, x1 - x), "S": max(0, y - y0), "N": max(0, y1 - y)}
            m_ = min(ds.values())
            for f, v in ds.items():
                if v <= m_ + 1e-6 and abs(GRAD[f][0] * d[0] + GRAD[f][1] * d[1]) > 0.95: c.append((EAVE + v * TAN, (w, f)))
        if c: return max(c)
    best = None
    for w, (x0, y0, x1, y1) in WINGS.items():
        if not (x0 - 0.01 <= x <= x1 + 0.01 and y0 - 0.01 <= y <= y1 + 0.01): continue
        ds = {"W": max(0, x - x0), "E": max(0, x1 - x), "S": max(0, y - y0), "N": max(0, y1 - y)}
        f = min(ds, key=ds.get); z = EAVE + ds[f] * TAN
        if best is None or z > best[0] + 1e-9: best = (z, (w, f))
    return best
def secs_def(sections, AS, FD):
    def box(id_, name, h, b, n, src):
        A = 2 * 0.0023 * (h + b) - 8.62 * 0.0023 ** 2   # หน้าตัดกล่องมุมโค้ง (JIS G3466: □100x50x2.3 = 5.06 กก./ม.)
        sections[id_] = {'id': id_, 'kind': 'cold_formed', 'shape': 'box', 'name': name, 'b': round(b * n, 3), 'h': h, 'dims': {'h': h, 'b': b * n, 't': 0.0023},
                         'kg_m': round(A * 7850 * n, 2), 'table': 'มอก. 107 / JIS G3466', 'status': FD, 'src': src,
                         'note': 'น้ำหนัก/ม. คำนวณจากหน้าตัดกล่องมุมโค้ง' + (f' × {n} ตัวประกบ' if n > 1 else '')}
        return id_
    return (box('2BOX100x50x2.3', '2[]-100x50x2.3 (กล่องประกบคู่)', 0.10, 0.05, 2, 'S-08 ข้อ 1–3'),
            box('BOX150x50x2.3', '[]-150x50x2.3', 0.15, 0.05, 1, 'S-08 ข้อ 4'),
            box('BOX25x25x2.3', '[]-25x25x2.3', 0.025, 0.025, 1, 'S-08 ข้อ 5'))
def pairs(lines, gap=(0.035, 0.16)):
    """เส้นคู่ (ขอบชิ้นเหล็ก) → เส้นศูนย์กลาง"""
    out, used = [], set()
    for i, a in enumerate(lines):
        if i in used: continue
        best = None
        for j, b in enumerate(lines):
            if j <= i or j in used: continue
            (a0, a1), (b0, b1) = a, b
            da = (a1[0] - a0[0], a1[1] - a0[1]); La = math.hypot(*da); u = (da[0] / La, da[1] / La)
            db = (b1[0] - b0[0], b1[1] - b0[1]); Lb = math.hypot(*db)
            if abs(abs(u[0] * db[0] + u[1] * db[1]) / Lb - 1) > 1e-3: continue
            perp = abs(-u[1] * (b0[0] - a0[0]) + u[0] * (b0[1] - a0[1]))
            if not (gap[0] <= perp <= gap[1]): continue
            t = sorted([u[0] * (b0[0] - a0[0]) + u[1] * (b0[1] - a0[1]), u[0] * (b1[0] - a0[0]) + u[1] * (b1[1] - a0[1])])
            ov = min(La, t[1]) - max(0, t[0])
            if ov < 0.5 * min(La, Lb): continue
            if best is None or perp < best[0]: best = (perp, j)
        if best:
            j = best[1]; b = lines[j]; used |= {i, j}
            (a0, a1), (b0, b1) = a, b
            if math.dist(a0, b0) > math.dist(a0, b1): b0, b1 = b1, b0
            out.append(((round((a0[0] + b0[0]) / 2, 3), round((a0[1] + b0[1]) / 2, 3)), (round((a1[0] + b1[0]) / 2, 3), round((a1[1] + b1[1]) / 2, 3))))
    return out, [l for k, l in enumerate(lines) if k not in used]
def rafters():
    s = ext.sheet('S-08'); P = ext.P('S-08'); L = []
    for q in s['prims']:
        if q.get('layer') == '1' and q['kind'] == 'poly' and len(q['p']) == 2:
            a, b = [tuple(round(float(v), 3) for v in P(p)) for p in q['p']]
            if -3 < a[0] < 19 and 3 < a[1] < 19: L.append((a, b))
    return pairs(L)

def isect(p, q, a, b):
    """จุดตัดเส้นตรง pq กับ ab (ขยายเส้น) → (x, y, t บน pq, u บน ab)"""
    d1 = (q[0] - p[0], q[1] - p[1]); d2 = (b[0] - a[0], b[1] - a[1]); den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-9: return None
    t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den; u = ((a[0] - p[0]) * d1[1] - (a[1] - p[1]) * d1[0]) / den
    return (p[0] + d1[0] * t, p[1] + d1[1] * t, t, u)
def snap_top(p, q, lines, tol=0.25):
    """ยืดปลายบนของจันทันถึงแนวศูนย์อกไก่/ตะเข้ที่ใกล้สุด (ปลายเส้นแบบหยุดที่ขอบชิ้น)"""
    out = [p, q]; L = math.dist(p, q)
    for k, e in ((0, 0.0), (1, 1.0)):
        best = None
        for a, b in lines:
            r = isect(p, q, a, b)
            if r is None or not (-0.02 <= r[3] <= 1.02): continue
            dd = abs(r[2] - e) * L
            if dd <= tol and (best is None or dd < best[0]): best = (dd, (round(r[0], 3), round(r[1], 3)))
        if best: out[k] = best[1]
    return out
