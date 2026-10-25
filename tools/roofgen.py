# หลังคาปั้นหยา (hip) หลายผืนต่อกัน + จั่วปั้นหยา (gablet) — สร้างระนาบเป็นสามเหลี่ยมสำหรับ roofs[].form = 'custom'
# แต่ละผืน: สี่เหลี่ยม (รวมชายคา) ลาดเท่ากันทุกด้าน · ผิวหลังคา = ค่าสูงสุดของทุกผืน (เกิดตะเข้รางเอง)
# gablet: ปลายสันด้านสั้นตัดเป็นหน้าจั่วตั้งที่ระยะ g จากขอบชายคา (ระนาบปลายใช้เฉพาะก่อนถึงหน้าจั่ว)
import math
from shapely.geometry import Polygon, box, Point
from shapely.ops import triangulate, unary_union

BIG = 1e3


def halfplane(a, b, c, bb):
    """{(x,y): a*x + b*y + c >= 0} ตัดกับกรอบ bb"""
    x0, y0, x1, y1 = bb
    pts = []
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    n = len(corners)
    for i in range(n):   # Sutherland–Hodgman กับเส้นเดียว
        p, q = corners[i], corners[(i + 1) % n]
        fp, fq = a * p[0] + b * p[1] + c, a * q[0] + b * q[1] + c
        if fp >= 0:
            pts.append(p)
        if (fp >= 0) != (fq >= 0):
            t = fp / (fp - fq); pts.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return Polygon(pts) if len(pts) >= 3 else Polygon()


class Wing:
    """r = (x0,y0,x1,y1) รวมชายคา · axis 'X' = สันขนานแกน X
    จั่วปั้นหยา: gv = ระยะจากขอบชายคาปลายสันถึงขอบปั้นลมของหลังคาจั่ว (หลังคาจั่วยื่นคลุมปั้นหยา)
                 gf = ระยะถึงหน้าจั่วตั้ง (ผนังช่องลม) — ระนาบปั้นหยาปลายสันวิ่งต่อใต้หลังคาจั่วจนชนหน้าจั่ว
    gv = gf = None → ปั้นหยาธรรมดา"""
    def __init__(self, name, r, eave, t, axis, gv=None, gf=None):
        self.name, self.r, self.e, self.t, self.axis = name, r, eave, t, axis
        self.gv = gv; self.gf = gf if gf is not None else gv
        x0, y0, x1, y1 = r; e = eave
        # ระนาบ z = A x + B y + C
        self.planes = {'S0': (0, t, e - t * y0), 'S1': (0, -t, e + t * y1), 'E0': (t, 0, e - t * x0), 'E1': (-t, 0, e + t * x1)} if axis == 'X' else \
                      {'S0': (t, 0, e - t * x0), 'S1': (-t, 0, e + t * x1), 'E0': (0, t, e - t * y0), 'E1': (0, -t, e + t * y1)}
        self.box = box(*r)

    def zone(self, k, d):
        """แถบปลายสันด้าน k (E0/E1) ลึก d จากขอบชายคา"""
        x0, y0, x1, y1 = self.r
        if self.axis == 'X':
            return box(x0, y0, x0 + d, y1) if k == 'E0' else box(x1 - d, y0, x1, y1)
        return box(x0, y0, x1, y0 + d) if k == 'E0' else box(x0, y1 - d, x1, y1)

    def mid(self):
        if self.gv is None:
            return Polygon()
        return self.box.difference(self.zone('E0', self.gv)).difference(self.zone('E1', self.gv))

    def z(self, k, x, y):
        A, B, C = self.planes[k]; return A * x + B * y + C

    def le(self, P, Q, bb):   # {P <= Q}
        return halfplane(Q[0] - P[0], Q[1] - P[1], Q[2] - P[2], bb)

    def gt(self, P, Q, bb):   # {Q > P}
        return self.le(P, Q, bb)

    def region(self, k, bb, visible=True):
        """โซนในผืนนี้ของระนาบ k · S = หลังคาจั่ว (ช่วงกลาง) + ปั้นหยา (ช่วงปลาย) · E = ปั้นหยาปลายสัน (visible=False รวมส่วนใต้หลังคาจั่วถึงหน้าจั่ว)"""
        P = self.planes[k]; L = lambda q: self.le(P, self.planes[q], bb)
        if k.startswith('S'):
            q2 = 'S1' if k == 'S0' else 'S0'
            hip = self.box.intersection(L('E0')).intersection(L('E1'))
            if self.gv is not None:
                hip = hip.difference(self.mid()).union(self.mid())
            return self.box.intersection(L(q2)).intersection(hip)
        R = self.box
        for q in self.planes:
            if q != k:
                R = R.intersection(L(q))
        if self.gv is not None:
            R = R.intersection(self.zone(k, self.gv if visible else self.gf))
        return R

    def above(self, P, bb):
        """โซนที่ผืนนี้ (ส่วนที่มองเห็น) สูงกว่าระนาบ P (ระนาบของผืนอื่น)"""
        acc = Polygon()
        for k in self.planes:
            acc = acc.union(self.region(k, bb).intersection(self.gt(P, self.planes[k], bb)))
        return acc


def convex_pieces(R):
    """แตกโพลิกอน (อาจเว้า/หลายชิ้น) เป็นชิ้นนูน: constrained triangulation แล้วรวมสามเหลี่ยมที่ติดกันตราบที่ยังนูน"""
    import shapely
    out = []
    for g in getattr(R, 'geoms', [R]):
        g = g.simplify(1e-6)
        if g.area < 1e-4:
            continue
        if g.convex_hull.area - g.area < 1e-6:
            out.append(g); continue
        tris = [t for t in shapely.constrained_delaunay_triangles(g).geoms if t.area > 1e-8]
        pieces = list(tris)
        merged = True
        while merged:
            merged = False
            for i in range(len(pieces)):
                for j in range(i + 1, len(pieces)):
                    a, b = pieces[i], pieces[j]
                    if a.intersection(b).length < 1e-6:
                        continue
                    u = a.union(b).simplify(1e-6)
                    if u.geom_type == 'Polygon' and u.convex_hull.area - u.area < 1e-6:
                        pieces[i] = u; pieces.pop(j); merged = True; break
                if merged:
                    break
        out += pieces
    return out


def ring(g):
    pts = list(g.exterior.coords)[:-1]
    if g.exterior.is_ccw is False:
        pts = pts[::-1]
    return pts


def build(wings):
    allx = [w.r[0] for w in wings] + [w.r[2] for w in wings]; ally = [w.r[1] for w in wings] + [w.r[3] for w in wings]
    bb = (min(allx) - 1, min(ally) - 1, max(allx) + 1, max(ally) + 1)
    planes = []
    for w in wings:
        for k in w.planes:
            parts = [(w.region(k, bb), None)]
            if k.startswith('E') and w.gv is not None and w.gf > w.gv:   # ปั้นหยาส่วนใต้หลังคาจั่ว (มองไม่เห็น มีกระเบื้องจริง)
                parts.append((w.region(k, bb, False).difference(w.zone(k, w.gv)), 'ใต้หลังคาจั่ว'))
            for R, note in parts:
                for o in wings:
                    if o is not w:
                        R = R.difference(o.above(w.planes[k], bb))
                if R.area < 1e-4:
                    continue
                for pc in convex_pieces(R):
                    pl = {'pts': [[round(x, 4), round(y, 4), round(w.z(k, x, y), 4)] for x, y in ring(pc)], 'wing': w.name, 'face': k}
                    if note: pl['note'] = note
                    planes.append(pl)
        # หน้าจั่วตั้ง (ช่องลม) ที่ระยะ gf
        if w.gv is not None:
            x0, y0, x1, y1 = w.r; g = w.gf
            for k in ('E0', 'E1'):
                if w.axis == 'X':
                    xg = x0 + g if k == 'E0' else x1 - g
                    zb = w.e + w.t * g; zr = w.e + w.t * (y1 - y0) / 2
                    tri = [[xg, y0 + g, zb], [xg, y1 - g, zb], [xg, (y0 + y1) / 2, zr]]
                else:
                    yg = y0 + g if k == 'E0' else y1 - g
                    zb = w.e + w.t * g; zr = w.e + w.t * (x1 - x0) / 2
                    tri = [[x0 + g, yg, zb], [x1 - g, yg, zb], [(x0 + x1) / 2, yg, zr]]
                planes.append({'pts': [[round(v, 4) for v in p] for p in tri], 'wing': w.name, 'face': 'G' + k[1], 'kind': 'gablet'})
    return planes
