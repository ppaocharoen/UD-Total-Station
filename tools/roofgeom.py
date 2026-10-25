"""เรขาคณิตหลังคา — ยกมาจาก phiso-house-3d/scripts/house_model.py (roof_planes, plane_lines) ไม่แก้ตรรกะ
พิกัดภายใน: x, y = ขึ้น, z  (ตัวเรียกต้องแปลง X,Y,Z ของ .bm.json เป็น x=X, z=Y, y=Z)
"""
import math

def v_sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def v_add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def v_mul(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def v_len(a): return math.sqrt(v_dot(a, a))
def v_norm(a):
    l = v_len(a)
    return [a[0] / l, a[1] / l, a[2] / l] if l > 1e-12 else [0, 0, 0]


def poly_area3(pts):
    s = [0.0, 0.0, 0.0]
    for i in range(len(pts)):
        s = v_add(s, v_cross(pts[i], pts[(i + 1) % len(pts)]))
    return 0.5 * v_len(s)


def roof_planes(r):
    """คืนรายการระนาบหลังคา แต่ละระนาบเรียงจุดโดยขอบแรก = ชายคา (แนวนอน)"""
    x1, z1, x2, z2, y0 = r["x1"], r["z1"], r["x2"], r["z2"], r["eave"]
    form = r.get("form", "gable")
    t = math.tan(math.radians(r.get("pitch", 0)))
    L, D = x2 - x1, z2 - z1
    ridge = r.get("ridge") or ("x" if L >= D else "z")
    P = []
    if form == "custom":
        return [p["pts"] for p in r.get("planes", [])]
    if form in ("flat",):
        return [[[x1, y0, z1], [x2, y0, z1], [x2, y0, z2], [x1, y0, z2]]]
    if form == "shed":
        low = r.get("low", "z1")
        if low in ("z1", "z2"):
            rise = D * t
            if low == "z1":
                return [[[x1, y0, z1], [x2, y0, z1], [x2, y0 + rise, z2], [x1, y0 + rise, z2]]]
            return [[[x2, y0, z2], [x1, y0, z2], [x1, y0 + rise, z1], [x2, y0 + rise, z1]]]
        rise = L * t
        if low == "x1":
            return [[[x1, y0, z2], [x1, y0, z1], [x2, y0 + rise, z1], [x2, y0 + rise, z2]]]
        return [[[x2, y0, z1], [x2, y0, z2], [x1, y0 + rise, z2], [x1, y0 + rise, z1]]]
    if form == "gable":
        if ridge == "x":
            h = D / 2; zm = z1 + h; yt = y0 + h * t
            P.append([[x1, y0, z1], [x2, y0, z1], [x2, yt, zm], [x1, yt, zm]])
            P.append([[x2, y0, z2], [x1, y0, z2], [x1, yt, zm], [x2, yt, zm]])
        else:
            h = L / 2; xm = x1 + h; yt = y0 + h * t
            P.append([[x1, y0, z2], [x1, y0, z1], [xm, yt, z1], [xm, yt, z2]])
            P.append([[x2, y0, z1], [x2, y0, z2], [xm, yt, z2], [xm, yt, z1]])
        return P
    if form == "hip":
        if ridge == "x":
            h = D / 2; zm = z1 + h; yt = y0 + h * t
            a, b = x1 + h, x2 - h
            if b < a: a = b = (x1 + x2) / 2
            P.append([[x1, y0, z1], [x2, y0, z1], [b, yt, zm], [a, yt, zm]])
            P.append([[x2, y0, z2], [x1, y0, z2], [a, yt, zm], [b, yt, zm]])
            P.append([[x1, y0, z2], [x1, y0, z1], [a, yt, zm]])
            P.append([[x2, y0, z1], [x2, y0, z2], [b, yt, zm]])
        else:
            h = L / 2; xm = x1 + h; yt = y0 + h * t
            a, b = z1 + h, z2 - h
            if b < a: a = b = (z1 + z2) / 2
            P.append([[x1, y0, z2], [x1, y0, z1], [xm, yt, a], [xm, yt, b]])
            P.append([[x2, y0, z1], [x2, y0, z2], [xm, yt, b], [xm, yt, a]])
            P.append([[x1, y0, z1], [x2, y0, z1], [xm, yt, a]])
            P.append([[x2, y0, z2], [x1, y0, z2], [xm, yt, b]])
        return P
    raise ValueError(f"ไม่รู้จักรูปแบบหลังคา {form}")


def plane_lines(pts, spacing, along, base=None):
    """เส้นแป (along='u' ขนานชายคา = แนวราบในระนาบ) หรือจันทัน (along='v' ตามลาด) ที่ระยะห่าง spacing ตัดด้วยขอบระนาบ (นูน)
    พิกัด [x, สูง, y] · แนวแปคิดจากแนวราบของระนาบ (ไม่ขึ้นกับลำดับจุด) · base = ระดับชายคา → แปทุกชิ้นของระนาบเดียวกันอยู่แนวเดียวกัน"""
    O = pts[0]
    n = v_norm(v_cross(v_sub(pts[1], pts[0]), v_sub(pts[2], pts[0])))
    if n[1] < 0:
        n = v_mul(n, -1)
    h = v_cross(n, [0, 1, 0])
    if v_len(h) < 1e-6:   # ระนาบราบ: ใช้ขอบแรก
        u = v_norm(v_sub(pts[1], pts[0]))
    else:
        u = v_norm(h)
    v = v_norm(v_cross(n, u))
    if v[1] < 0:
        v = v_mul(v, -1)
    P2 = [(v_dot(v_sub(p, O), u), v_dot(v_sub(p, O), v)) for p in pts]
    segs = []
    if spacing <= 0:
        return segs
    idx = 1 if along == "u" else 0   # coordinate held constant
    lo = min(p[idx] for p in P2); hi = max(p[idx] for p in P2)
    if along == "u":
        c0 = ((base - O[1]) / v[1] if (base is not None and v[1] > 1e-9) else lo) + 0.05
    else:
        c0 = v_dot(v_sub([0, 0, 0], O), u) + spacing / 2
    c = c0 + math.ceil((lo - c0) / spacing - 1e-9) * spacing
    while c <= hi - 0.02:
        hits = []
        for i in range(len(P2)):
            a, b = P2[i], P2[(i + 1) % len(P2)]
            if (a[idx] - c) * (b[idx] - c) <= 0 and abs(a[idx] - b[idx]) > 1e-9:
                k = (c - a[idx]) / (b[idx] - a[idx])
                hits.append(a[1 - idx] + k * (b[1 - idx] - a[1 - idx]))
        if len(hits) >= 2:
            s0, s1 = min(hits), max(hits)
            if s1 - s0 > 0.05:
                def to3(uu, vv):
                    return v_add(O, v_add(v_mul(u, uu), v_mul(v, vv)))
                if along == "u":
                    segs.append([to3(s0, c), to3(s1, c)])
                else:
                    segs.append([to3(c, s0), to3(c, s1)])
        c += spacing
    return segs
    idx = 1 if along == "u" else 0   # coordinate held constant
    lo = min(p[idx] for p in P2); hi = max(p[idx] for p in P2)
    c = lo + (0.0 if along == "u" else spacing / 2)
    if along == "u":
        c = lo + 0.05
    while c <= hi - 0.02:
        hits = []
        for i in range(len(P2)):
            a, b = P2[i], P2[(i + 1) % len(P2)]
            if (a[idx] - c) * (b[idx] - c) <= 0 and abs(a[idx] - b[idx]) > 1e-9:
                k = (c - a[idx]) / (b[idx] - a[idx])
                hits.append(a[1 - idx] + k * (b[1 - idx] - a[1 - idx]))
        if len(hits) >= 2:
            s0, s1 = min(hits), max(hits)
            if s1 - s0 > 0.05:
                def to3(uu, vv):
                    return v_add(O, v_add(v_mul(u, uu), v_mul(v, vv)))
                if along == "u":
                    segs.append([to3(s0, c), to3(s1, c)])
                else:
                    segs.append([to3(c, s0), to3(c, s1)])
        c += spacing
    return segs


