#!/usr/bin/env python3
"""ถอดปริมาณจาก .bm.json ตามหลักเกณฑ์การคำนวณราคากลางงานก่อสร้างอาคาร 2569

    python tools/takeoff.py <โครงการ>.bm.json [--write] [--price-map tools/price_map.json] [--csv out.csv]

กฎที่ใช้ (ดู _claude_kb/takeoff_rules_2569.md):
  - วัดตามแบบในแนวเส้นตรง ไม่คิดระยะทาบ แล้วคูณ % เผื่อตามที่เล่มกำหนด
  - รายการที่ราคาเป็นวัสดุมวลรวม (มีเผื่อในสูตรแล้ว) ส่งปริมาณสุทธิ ไม่เผื่อซ้ำ
  - ปริมาณแต่ละแถวปัดทศนิยม 2 ตำแหน่ง (จำนวนนับเป็นจำนวนเต็ม) ชิ้นส่วนย่อยไม่ปัด
  - คอนกรีตคาน = ช่วงสุทธิระหว่างหน้าเสา × b × (h − พื้นที่วางบนคาน); เสาวัดเต็มความสูง
  - ผนังใช้พิกัดจริง หักส่วนที่ชนเสา หักช่องเปิด
--write  เขียนผลลง quantities ในไฟล์ (พร้อม model_hash ปัจจุบัน)
"""
import argparse, csv, json, math, os, sys
from collections import OrderedDict, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validate import qty_hash  # noqa: E402
from roofgeom import roof_planes, plane_lines, poly_area3, v_len, v_sub  # noqa: E402

DEFAULTS = {
    "cover": 0.025,       # ระยะหุ้มสำหรับความยาวปลอก/เหล็กฐานราก (ม.)
    "lean_thk": 0.05,     # คอนกรีตหยาบใต้ฐานราก (ม.)
    "sand_thk": 0.05,     # ทรายรองใต้ฐานราก (ม.)
    "sand_waste": 0.25,   # ทรายบดอัดด้วยแรงคน
    "excav_waste": 0.30,  # ขุดดินลึก ≤ 2 ม.
    "excav_deep": 2.0,
    "excav_deep_margin": 0.50,
    "tie_wire_per_ton": 30.0,
    "props_per_m_beam": 1.5,
    "props_per_m2_slab": 1.5,
    "steel_piece_len": 6.0,
    "lintel_extra": 0.30, # ทับหลัง/เสาเอ็นรอบช่องเปิด ยื่นเลยขอบข้างละ (ม.)
}
# % เผื่อเหล็กเสริมตามขนาด (หลักเกณฑ์ 2569 ข้อ 4.1 (4))
REBAR_WASTE = {6: 0.05, 9: 0.07, 10: 0.07, 12: 0.09, 15: 0.11, 16: 0.11, 19: 0.13, 20: 0.13,
               22: 0.15, 25: 0.15, 28: 0.15, 32: 0.15}
POINT_NAME = {"light": "ดวงโคม", "lamp": "โคมไฟ", "switch": "สวิตช์", "outlet": "เต้ารับ", "ac": "เครื่องปรับอากาศ",
              "heater": "เครื่องทำน้ำอุ่น", "fan": "พัดลมระบายอากาศ", "tv": "เต้ารับทีวี", "data": "เต้ารับสื่อสาร",
              "bell": "กริ่ง", "pump": "ปั๊มน้ำ"}
FIXTURE_NAME = {"wc": "โถส้วมชักโครก", "lavatory": "อ่างล้างหน้า", "sink": "ซิงค์ล้างจาน", "shower": "ชุดฝักบัว",
                "floor_drain": "ตะแกรงระบายน้ำพื้น (FD)", "faucet": "ก๊อกน้ำ", "spray": "สายฉีดชำระ",
                "water_heater": "เครื่องทำน้ำอุ่น", "washer": "จุดเครื่องซักผ้า", "urinal": "โถปัสสาวะชาย"}
RB_SIZES = {6, 9}   # ปลอก/เหล็กกลม (SR24); ขนาดอื่นถือเป็นข้ออ้อย SD40 ตามข้อตกลง
WALL_NAME = {"brick_mon": "ผนังก่ออิฐมอญครึ่งแผ่น", "brick_mon_full": "ผนังก่ออิฐมอญเต็มแผ่น", "aac": "ผนังก่ออิฐมวลเบา",
             "block": "ผนังก่อคอนกรีตบล็อก", "block_07": "ผนังก่อคอนกรีตบล็อก 7 ซม.", "gypsum": "ผนังเบายิปซัมบอร์ด",
             "precast_panel": "ผนังสำเร็จรูป", "other": "ผนัง"}
COVER_NAME = {"metal_sheet": "เมทัลชีท", "cpac_tile": "กระเบื้องคอนกรีต", "ceramic_tile": "กระเบื้องเซรามิก",
              "fibre_cement": "กระเบื้องไฟเบอร์ซีเมนต์ลอนคู่", "shingle": "แผ่นชิงเกิ้ล", "upvc": "UPVC",
              "polycarbonate": "โพลีคาร์บอเนต", "concrete_deck": "พื้น คสล. (ดาดฟ้า)"}
GROUPS = OrderedDict([
    ("1.1.0", "งานรื้อถอน"),
    ("1.1.2", "งานขุดดิน"), ("1.1.3", "งานถมคืน"), ("1.1.4", "งานวัสดุรองฐานราก"),
    ("1.1.5", "งานเสาเข็มคอนกรีตอัดแรง"), ("1.1.7", "งานไม้แบบหล่อคอนกรีต"), ("1.1.9", "งานเหล็กเสริมคอนกรีต"),
    ("1.1.10", "งานโครงสร้างเหล็กรูปพรรณ"), ("1.1.12", "งานคอนกรีต"), ("1.1.16", "งานพื้นคอนกรีตสำเร็จรูป"),
    ("1.1.19", "งานโครงหลังคา"),
    ("1.2.1", "งานหลังคา"), ("1.2.2", "งานฝ้าเพดาน"), ("1.2.3", "งานผนัง"), ("1.2.4", "งานฉาบปูน"),
    ("1.2.5", "งานวัสดุผิวพื้นและผนัง"), ("1.2.6", "งานประตู-หน้าต่าง"), ("1.2.7", "งานทาสี"),
    ("1.3", "งานระบบประปา สุขาภิบาล และป้องกันอัคคีภัย"), ("1.4", "งานระบบไฟฟ้าและสื่อสาร"),
])


def kg_per_m(d):
    return d * d / 162.0


def r2(x):
    """ปัดปกติ 2 ตำแหน่ง (กันเศษเลขฐานสอง)"""
    return math.copysign(math.floor(abs(x) * 100 + 0.5 + 1e-9) / 100, x)


def round_pieces(n):
    """ท่อน: เศษ < 0.5 ปัดลง ≥ 0.5 ปัดขึ้น (หลักเกณฑ์ 6.2)"""
    return int(math.floor(n + 0.5))


def dist2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def point_in_poly(p, poly):
    x, y, inside = p[0], p[1], False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def on_or_in_poly(p, poly, tol=0.02):
    """อยู่ในรูปหรือบนขอบ (คานริมพื้นถือว่าพื้นวางบนคาน)"""
    if point_in_poly(p, poly):
        return True
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        L = dist2(a, b)
        if L < 1e-9:
            continue
        t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)
        if -1e-9 <= t <= 1 + 1e-9 and abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / L <= tol:
            return True
    return False


def poly_area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def poly_perim(poly):
    return sum(dist2(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


class Takeoff:
    def __init__(self, m, settings=None):
        self.m = m
        self.s = dict(DEFAULTS, **(settings or {}))
        self.items = OrderedDict()
        self.notes = []          # ข้อสมมติ / คำเตือน
        self.nodes = {n["id"]: n for n in m.get("nodes", [])}
        self.secs = {s["id"]: s for s in m.get("sections", [])}
        self.mats = {x["id"]: x for x in m.get("materials", [])}
        self.levels = {l["name"]: l["z"] for l in m.get("levels", [])}
        self.GL = self.levels.get("GL", 0.0)
        self.design = (m.get("design") or {})
        self.rebar_len = defaultdict(lambda: defaultdict(float))   # dia -> member id -> m

    # ------------------------------------------------------------ accumulate
    def add(self, code, key, name, unit, qty, src=None, waste=0.0, count=False, task=None, note=None):
        k = f"{code}|{key}"
        it = self.items.get(k)
        if not it:
            it = self.items[k] = {"key": key, "group_code": code, "group": GROUPS.get(code, ""), "name": name,
                                  "unit": unit, "qty_net": 0.0, "waste": waste, "count": count,
                                  "from": [], "task": task, "note": note}
        it["qty_net"] += qty
        if src and src not in it["from"]:
            it["from"].append(src)
        return it

    def note(self, msg):
        if msg not in self.notes:
            self.notes.append(msg)

    def rebar(self, mid, dia, length):
        if length > 0:
            self.rebar_len[int(round(dia))][mid] += length

    # ------------------------------------------------------------ helpers
    def mem_geom(self, x):
        a, b = self.nodes[x["i"]], self.nodes[x["j"]]
        return (a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"])

    def conc_name(self, mat_id):
        mat = self.mats.get(mat_id) or {}
        fc = mat.get("fc")
        return (f"คอนกรีตโครงสร้าง f'c {fc:g} ksc (ทรงกระบอก)" if fc else "คอนกรีตโครงสร้าง"), f"conc_{mat_id}"

    def rebar_of(self, part, eid):
        d = (self.design.get(part) or {}).get(eid) or {}
        return d.get("rebar") or {}

    # ------------------------------------------------------------ run
    def run(self):
        self.columns = [x for x in self.m.get("members", []) if x["type"] == "column"]
        self.col_at = defaultdict(list)          # (x,y) ปัด → เสา
        for c in self.columns:
            p, q = self.mem_geom(c)
            self.col_at[(round(p[0], 3), round(p[1], 3))].append(c)
        self._demolition()
        self._footings()
        self._columns()
        self._beams()
        self._slabs()
        self._steel_and_roofs()
        self._walls()
        self._finishes()
        self._mep()
        self._rebar_items()
        return self

    # ------------------------------------------------------------ รื้อถอน
    def _demolition(self):
        for d in self.m.get("demolition", []):
            if d.get("wage_code"):
                self.add("1.1.0", f"demo_{d['wage_code']}", d.get("note") or f"งานรื้อถอน {d['wage_code']}", d["unit"],
                         d["qty"], d["id"], task="prep").setdefault("wage_code", d["wage_code"])
            else:
                self.add("1.1.0", f"demo_{d['id']}", d["name"], d["unit"], d["qty"], d["id"], task="prep")

    # ------------------------------------------------------------ ฐานราก เข็ม ขุด ถม
    def _footings(self):
        s = self.s
        for f in self.m.get("supports", []):
            if f.get("kind") not in ("spread", "pile_cap"):
                continue
            b, d, h, bot = f["b"], f["d"], f["h"], f["bottom"]
            depth = self.GL - bot
            if depth <= 0:
                self.note(f"ฐานราก {f['id']}: ท้องฐานรากอยู่สูงกว่า GL ไม่คิดงานขุด")
                continue
            if depth <= s["excav_deep"]:
                exc = b * d * depth
                self.add("1.1.2", "excav", "งานขุดดิน (ลึกไม่เกิน 2.00 ม.)", "ลบ.ม.", exc, f["id"], waste=s["excav_waste"], task="footing")
                exc_total = exc * (1 + s["excav_waste"])
            else:
                mg = s["excav_deep_margin"]
                exc = (b + 2 * mg) * (d + 2 * mg) * (depth + s["sand_thk"] + s["lean_thk"])
                self.add("1.1.2", "excav_deep", "งานขุดดิน (ลึกเกิน 2.00 ม.)", "ลบ.ม.", exc, f["id"], task="footing")
                exc_total = exc
                self.note(f"ฐานราก {f['id']} ขุดลึก {depth:.2f} ม. เกิน 2 ม. — พิจารณาค่าใช้จ่ายพิเศษระบบป้องกันดินพัง (ปร.3)")
            vol_f = b * d * h
            pier = self._pier_volume(f)
            self.add("1.1.3", "backfill", "งานถมคืน", "ลบ.ม.", max(exc_total - vol_f - pier, 0), f["id"], task="footing")
            self.add("1.1.4", "sand_base", "ทรายรองใต้ฐานราก (บดอัดแรงคน)", "ลบ.ม.", b * d * s["sand_thk"], f["id"],
                     waste=s["sand_waste"], task="footing")
            self.add("1.1.12", "lean_conc", "คอนกรีตหยาบรองใต้ฐานราก (1:3:5)", "ลบ.ม.", b * d * s["lean_thk"], f["id"], task="footing")
            name, key = self.conc_name(f.get("material"))
            self.add("1.1.12", key, name, "ลบ.ม.", vol_f, f["id"], task="footing")
            self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", 2 * (b + d) * h, f["id"], task="footing")
            rb = self.rebar_of("supports", f["id"])
            c = s["cover"]
            if rb.get("bars_x"):
                n, dia = rb["bars_x"]; self.rebar(f["id"], dia, n * (b - 2 * c))
            if rb.get("bars_y"):
                n, dia = rb["bars_y"]; self.rebar(f["id"], dia, n * (d - 2 * c))
            if not rb:
                self.note(f"ฐานราก {f['id']}: ยังไม่มีเหล็กเสริมใน design — ไม่ได้คิดเหล็ก")
            p = f.get("piles")
            if p:
                pname = f"เสาเข็ม {p['type']} ยาว {p['length']:g} ม."
                self.add("1.1.5", f"pile_{p['type']}_{p['length']:g}", pname, "ต้น", p["n"], f["id"], count=True, task="footing")
                self.add("1.1.5", "pile_drive", "งานตอกเสาเข็มคอนกรีตอัดแรง", "ต้น", p["n"], f["id"], count=True, task="footing")
                self.add("1.1.5", "pile_cut", "งานสกัดหัวเสาเข็ม", "ต้น", p["n"], f["id"], count=True, task="footing")
        if not self.m.get("supports"):
            self.note("ไม่มีฐานราก (supports) ในโมเดล")
        self.note(f"ทรายรอง {self.s['sand_thk']*100:g} ซม. และคอนกรีตหยาบ {self.s['lean_thk']*100:g} ซม. ใต้ฐานราก เป็นค่าตั้งต้น (แบบไม่ระบุ)")

    def _pier_volume(self, f):
        """ปริมาตรเสาส่วนที่อยู่ใต้ GL บนฐานรากนี้ (ตอม่อ)"""
        n = self.nodes.get(f["node"])
        if not n:
            return 0.0
        v = 0.0
        for c in self.col_at.get((round(n["x"], 3), round(n["y"], 3)), []):
            p, q = self.mem_geom(c)
            lo, hi = min(p[2], q[2]), min(max(p[2], q[2]), self.GL)
            if hi > lo:
                sec = self.secs[c["section"]]
                v += sec["b"] * sec["h"] * (hi - lo)
        return v

    # ------------------------------------------------------------ เสา
    def _columns(self):
        c = self.s["cover"]
        for x in self.columns:
            sec = self.secs.get(x["section"], {})
            if sec.get("kind") != "rc_rect":
                continue
            p, q = self.mem_geom(x)
            H = abs(q[2] - p[2])
            b, h = sec["b"], sec["h"]
            name, key = self.conc_name(x.get("material"))
            self.add("1.1.12", key, name, "ลบ.ม.", b * h * H, x["id"], task="column")
            self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", 2 * (b + h) * H, x["id"], task="column")
            rb = self.rebar_of("members", x["id"])
            if rb.get("main"):
                n, dia = rb["main"]; self.rebar(x["id"], dia, n * H)
            if rb.get("stirrup"):
                dia, sp = rb["stirrup"][0], rb["stirrup"][1]
                cnt = math.floor(H / sp) + 1
                per = 2 * (b + h) - 8 * c
                self.rebar(x["id"], dia, cnt * per * (2 if rb.get("double_stirrup") else 1))
            if not rb:
                self.note(f"เสา {x['id']}: ยังไม่มีเหล็กเสริม")

    # ------------------------------------------------------------ คาน
    def _slab_over(self, top, mid_xy):
        for s in self.m.get("slabs", []):
            if s.get("kind") in ("cast", "ground") and abs(s["top"] - top) <= 0.02 and on_or_in_poly(mid_xy, s["polygon"]):
                return s
        return None

    def _col_half(self, xy, along):
        """ครึ่งความกว้างเสาที่ตำแหน่ง xy วัดตามทิศ along (unit vector) — ใช้หักความยาวสุทธิ"""
        best = 0.0
        for c in self.col_at.get((round(xy[0], 3), round(xy[1], 3)), []):
            sec = self.secs.get(c["section"], {})
            if sec.get("kind") == "rc_rect":
                best = max(best, abs(along[0]) * sec["b"] / 2 + abs(along[1]) * sec["h"] / 2)
        return best

    def _beams(self):
        c = self.s["cover"]
        for x in self.m.get("members", []):
            if x["type"] not in ("beam", "tie_beam", "lintel"):
                continue
            sec = self.secs.get(x["section"], {})
            if sec.get("kind") != "rc_rect":
                continue
            p, q = self.mem_geom(x)
            Lc = math.dist(p, q)
            if Lc < 1e-6:
                continue
            u = ((q[0] - p[0]) / Lc, (q[1] - p[1]) / Lc)
            Ln = max(Lc - self._col_half(p, u) - self._col_half(q, u), 0)
            b, h = sec["b"], sec["h"]
            top = max(p[2], q[2])
            sl = self._slab_over(top, ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2))
            hc = h - (sl["t"] if sl else 0)
            name, key = self.conc_name(x.get("material"))
            self.add("1.1.12", key, name, "ลบ.ม.", b * hc * Ln, x["id"], task="beam")
            sides = 2 * hc
            bottom = b if x["type"] != "tie_beam" else b   # คานคอดินหล่อบนแบบเช่นกัน
            self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", (sides + bottom) * Ln, x["id"], task="beam")
            if x["type"] == "beam":
                self.add("1.1.7", "props", "ไม้ค้ำยัน (ยูคาลิปตัส Ø3\" ยาว 3 ม.)", "ต้น", self.s["props_per_m_beam"] * Ln,
                         x["id"], count=True, task="beam")
            rb = self.rebar_of("members", x["id"])
            for k in ("top", "bot", "side"):
                if rb.get(k):
                    n, dia = rb[k]; self.rebar(x["id"], dia, n * Lc)
            if rb.get("extra_top"):
                n, dia = rb["extra_top"]; self.rebar(x["id"], dia, n * 2 * Lc / 3)
            if rb.get("extra_bot"):
                n, dia = rb["extra_bot"]; self.rebar(x["id"], dia, n * 0.75 * Lc)
            if rb.get("stirrup"):
                st = rb["stirrup"]; dia, s1 = st[0], st[1]; s2 = st[2] if len(st) > 2 else s1
                cnt = math.ceil((Ln / 2) / s1) + math.ceil((Ln / 2) / s2) + 1
                per = 2 * (b + h) - 8 * c
                self.rebar(x["id"], dia, cnt * per * (2 if rb.get("double_stirrup") else 1))
            if not rb:
                self.note(f"คาน {x['id']}: ยังไม่มีเหล็กเสริม")
        self.note("เหล็กยืนคานวัดศูนย์ถึงศูนย์ ไม่รวมระยะทาบและงอขอ; ปลอกวัดเส้นรอบรูป 2(b+h) − 8×ระยะหุ้ม ไม่รวมขอ")

    # ------------------------------------------------------------ พื้น
    def _slabs(self):
        for s in self.m.get("slabs", []):
            A, P, t = poly_area(s["polygon"]), poly_perim(s["polygon"]), s["t"]
            name, key = self.conc_name(s.get("material"))
            if s["kind"] == "precast":
                self.add("1.1.16", "precast_slab", "พื้นคอนกรีตสำเร็จรูป", "ตร.ม.", A, s["id"], task="slab")
                self.add("1.1.16", "topping", f"คอนกรีตทับหน้าพื้นสำเร็จรูป หนา {t*100:g} ซม.", "ตร.ม.", A, s["id"], task="slab")
                continue
            self.add("1.1.12", key, name, "ลบ.ม.", A * t, s["id"], task="slab")
            if s["kind"] == "cast":
                self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", A + P * t, s["id"], task="slab")
                self.add("1.1.7", "props", "ไม้ค้ำยัน (ยูคาลิปตัส Ø3\" ยาว 3 ม.)", "ต้น", self.s["props_per_m2_slab"] * A,
                         s["id"], count=True, task="slab")
            else:   # ground
                self.add("1.1.4", "sand_slab", "ทรายรองพื้นวางบนดิน (บดอัดแรงคน)", "ลบ.ม.", A * self.s["sand_thk"], s["id"],
                         waste=self.s["sand_waste"], task="slab")
            rb = self.rebar_of("slabs", s["id"])
            if rb.get("mesh"):
                mh = rb["mesh"]; dia, sp = mh[0], mh[1]; layers = mh[2] if len(mh) > 2 else 1
                xs = [p[0] for p in s["polygon"]]; ys = [p[1] for p in s["polygon"]]
                Lx, Ly = max(xs) - min(xs), max(ys) - min(ys)
                fill = A / (Lx * Ly) if Lx * Ly else 1
                L = ((math.floor(Ly / sp) + 1) * Lx + (math.floor(Lx / sp) + 1) * Ly) * layers * fill
                self.rebar(s["id"], dia, L)
            elif rb.get("wire_mesh"):
                self.add("1.1.9", f"wiremesh_{rb['wire_mesh']}", f"ตะแกรงเหล็กสำเร็จรูป {rb['wire_mesh']}", "ตร.ม.", A, s["id"], task="slab")
            else:
                self.note(f"พื้น {s['id']}: ยังไม่มีเหล็กเสริม")

    # ------------------------------------------------------------ เหล็กรูปพรรณ + หลังคา
    def _roof_r(self, rf):
        xs = [p[0] for p in rf["outline"]]; ys = [p[1] for p in rf["outline"]]
        r = {"x1": min(xs), "x2": max(xs), "z1": min(ys), "z2": max(ys), "eave": rf["eave"],
             "pitch": rf.get("pitch", 0), "form": rf["form"]}
        if rf.get("ridge"):
            r["ridge"] = "x" if rf["ridge"] == "X" else "z"
        if rf.get("low"):
            r["low"] = {"x1": "x1", "x2": "x2", "y1": "z1", "y2": "z2"}[rf["low"]]
        if rf["form"] == "custom":
            r["planes"] = [{"pts": [[p[0], p[2], p[1]] for p in pl["pts"]]} for pl in rf.get("planes", [])]
        return r

    def _steel_and_roofs(self):
        steel_len = defaultdict(float)    # section -> m
        steel_src = defaultdict(list)
        hip_roof = any(r["form"] == "hip" for r in self.m.get("roofs", []))
        explicit = {x["type"] for x in self.m.get("members", [])}
        for x in self.m.get("members", []):
            sec = self.secs.get(x["section"], {})
            if sec.get("kind") in ("steel", "cold_formed"):
                p, q = self.mem_geom(x)
                steel_len[x["section"]] += math.dist(p, q)
                steel_src[x["section"]].append(x["id"])
        roof_area = 0.0
        for rf in self.m.get("roofs", []):
            r = self._roof_r(rf)
            planes = roof_planes(r)
            area = sum(poly_area3(p) for p in planes)
            roof_area += area
            w = 0.05 if rf["form"] == "hip" else 0.03
            if rf["cover"] != "concrete_deck":
                self.add("1.2.1", f"cover_{rf['cover']}", f"วัสดุมุงหลังคา {COVER_NAME.get(rf['cover'], rf['cover'])}",
                         "ตร.ม.", area, rf["id"], waste=w, task="roof_cover",
                         note="พื้นที่ตามแนวลาด; ถ้าคิดเป็นแผ่นให้แปลงตามคู่มือผู้ผลิตแล้วเผื่อ 3%/5%")
                edges = defaultdict(int)
                for p in planes:
                    for i in range(len(p)):
                        a = tuple(round(v, 3) for v in p[i]); b = tuple(round(v, 3) for v in p[(i + 1) % len(p)])
                        edges[tuple(sorted([a, b]))] += 1
                ridge = sum(v_len(v_sub(list(a), list(b))) for (a, b), n in edges.items() if n >= 2 and abs(a[1] - b[1]) < 1e-3)
                hip = sum(v_len(v_sub(list(a), list(b))) for (a, b), n in edges.items() if n >= 2 and abs(a[1] - b[1]) >= 1e-3)
                if ridge:
                    self.add("1.2.1", "ridge_cap", "ครอบสันหลังคา", "ม.", ridge, rf["id"], waste=0.03, task="roof_cover")
                if hip:
                    self.add("1.2.1", "hip_cap", "ครอบตะเข้สัน", "ม.", hip, rf["id"], waste=0.03, task="roof_cover")
                if rf.get("insulation"):
                    self.add("1.2.1", "insulation", f"ฉนวนใต้หลังคา {rf['insulation']}", "ตร.ม.", area, rf["id"], task="roof_cover")
                for part, along, typ in (("purlin", "u", "purlin"), ("rafter", "v", "rafter")):
                    spec = rf.get(part)
                    if not spec or typ in explicit:
                        continue
                    L = sum(v_len(v_sub(a, b)) for p in planes if len(p) >= 3 for a, b in plane_lines(p, spec["spacing"], along))
                    steel_len[spec["section"]] += L
                    steel_src[spec["section"]].append(rf["id"])
            self.add("1.1.19", "roof_frame_area", "งานโครงหลังคา (พื้นที่ตามแนวลาด)", "ตร.ม.", area, rf["id"], task="roof_frame")
        for sec_id, L in steel_len.items():
            sec = self.secs[sec_id]
            w = 0.05 if hip_roof else 0.03
            pieces = round_pieces(L * (1 + w) / self.s["steel_piece_len"])
            kg = pieces * self.s["steel_piece_len"] * sec["kg_m"]
            it = self.add("1.1.19", f"steel_{sec_id}", f"เหล็กรูปพรรณ {sec.get('name', sec_id)} ({sec['kg_m']:g} กก./ม.)", "กก.",
                          kg, None, task="roof_frame",
                          note=f"ยาวรวม {L:.2f} ม. เผื่อ {w*100:g}% = {pieces} ท่อน × {self.s['steel_piece_len']:g} ม.")
            it["from"] = steel_src[sec_id]
            it["pieces"] = pieces
        if roof_area:
            self.note("ทาสีกันสนิมโครงหลังคาเหล็ก ยังไม่คำนวณ — ต้องตกลงวิธีคิดพื้นที่ผิวเหล็ก")

    # ------------------------------------------------------------ ผนัง ช่องเปิด
    def _walls(self):
        ot = self.m.get("opening_types", {})
        open_by_wall = defaultdict(list)
        for o in self.m.get("openings", []):
            open_by_wall[o["wall"]].append(o)
        for w in self.m.get("walls", []):
            pts = w["path"]
            L = sum(dist2(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            # หักเสาที่ผนังชน (เสาที่อยู่บนแนวผนัง ภายในช่วงความสูงผนัง)
            ded = 0.0
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                seg = dist2(a, b)
                if seg < 1e-9:
                    continue
                u = ((b[0] - a[0]) / seg, (b[1] - a[1]) / seg)
                for key, cols in self.col_at.items():
                    t = (key[0] - a[0]) * u[0] + (key[1] - a[1]) * u[1]
                    off = abs((key[0] - a[0]) * u[1] - (key[1] - a[1]) * u[0])
                    if off > w["t"] / 2 + 0.15 or t < -1e-6 or t > seg + 1e-6:
                        continue
                    if not any(min(self.mem_geom(c)[0][2], self.mem_geom(c)[1][2]) < w["top"] and
                               max(self.mem_geom(c)[0][2], self.mem_geom(c)[1][2]) > w["bottom"] for c in cols):
                        continue
                    half = self._col_half(key, u)
                    # เสาที่ปลายผนังหักครึ่งเดียว
                    ded += half * (1 if (t < half + 1e-6 or t > seg - half - 1e-6) else 2)
            H = w["top"] - w["bottom"]
            gross = max(L - ded, 0) * H
            opens = sum(ot[o["type"]]["w"] * ot[o["type"]]["h"] for o in open_by_wall[w["id"]] if o["type"] in ot)
            net = max(gross - opens, 0)
            self.add("1.2.3", f"wall_{w['kind']}", WALL_NAME.get(w["kind"], "ผนัง") + f" หนา {w['t']*100:g} ซม.", "ตร.ม.",
                     net, w["id"], task="wall")
            sides = w.get("finish_sides", 2)
            if w.get("plaster") and sides:
                self.add("1.2.4", "plaster_wall", "ฉาบปูนเรียบผนัง", "ตร.ม.", net * sides, w["id"], task="plaster")
            if w.get("paint") and sides:
                if w.get("exterior") and sides == 2:
                    self.add("1.2.7", "paint_ext", "ทาสีน้ำอะคริลิกภายนอก", "ตร.ม.", net, w["id"], task="paint")
                    self.add("1.2.7", "paint_int", "ทาสีน้ำอะคริลิกภายใน", "ตร.ม.", net, w["id"], task="paint")
                else:
                    self.add("1.2.7", "paint_int", "ทาสีน้ำอะคริลิกภายใน", "ตร.ม.", net * sides, w["id"], task="paint")
            for o in open_by_wall[w["id"]]:
                t = ot.get(o["type"])
                if t and w["kind"] in ("brick_mon", "brick_mon_full", "aac", "block", "block_07"):
                    ext = self.s["lintel_extra"]
                    run = (t["w"] + 2 * ext) * (2 if t.get("sill", 0) > 0 else 1) + 2 * t["h"]   # ทับหลัง (+ธรณี) + เสาเอ็น 2 ข้าง
                    self.add("1.2.3", "lintel", "เสาเอ็น-ทับหลัง คสล. รอบช่องเปิด", "ม.", run, o["id"], task="wall")
        for o in self.m.get("openings", []):
            t = ot.get(o["type"])
            if t:
                self.add("1.2.6", f"open_{o['type']}", f"{t.get('desc', o['type'])} ({o['type']} {t['w']:g}×{t['h']:g} ม.)",
                         "ชุด", 1, o["id"], count=True, task="opening")
        self.note("เสาเอ็น-ทับหลัง: คิดเฉพาะรอบช่องเปิด (ทับหลัง+ธรณี ยาว w+2×0.30 และเสาเอ็น 2 ข้างสูง h) ยังไม่รวมเสาเอ็นกลางผนัง/ปลายผนัง")

    # ------------------------------------------------------------ งานผิว
    def _finishes(self):
        code = {"floor": "1.2.5", "wall": "1.2.5", "skirting": "1.2.5", "counter": "1.2.5", "railing": "1.2.5",
                "ceiling": "1.2.2", "other": "1.2.5"}
        for f in self.m.get("finishes", []):
            if f.get("qty") is not None:
                q, unit = f["qty"], f.get("unit", "")
            elif f.get("rects"):
                q, unit = sum(abs(r[2] - r[0]) * abs(r[3] - r[1]) for r in f["rects"]), "ตร.ม."
            elif f.get("polygon"):
                q, unit = poly_area(f["polygon"]), "ตร.ม."
            elif f.get("wall") and f.get("height"):
                w = next((w for w in self.m.get("walls", []) if w["id"] == f["wall"]), None)
                pts = w["path"] if w else []
                q, unit = sum(dist2(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) * f["height"], "ตร.ม."
            else:
                self.note(f"งานผิว {f['id']}: ไม่มีขนาดให้คิด")
                continue
            if f["kind"] in ("skirting", "railing", "counter") and not f.get("unit"):
                unit = "ม."
            self.add(code[f["kind"]], f"fin_{f['kind']}_{f['spec']}", f["spec"], unit, q, f["id"],
                     task="ceiling" if f["kind"] == "ceiling" else "finish")

    # ------------------------------------------------------------ งานระบบ (รอบแรก: นับจำนวน)
    def _mep(self):
        el = ((self.m.get("mep") or {}).get("electrical")) or {}
        pt = el.get("point_types", {})
        for i, p in enumerate(el.get("points", [])):
            t = pt.get(p["type"], {})
            self.add("1.4", f"pt_{p['type']}", "จุด" + POINT_NAME.get(t.get("kind"), p["type"]) + (f" ({t['desc']})" if t.get("desc") else ""), "จุด", 1,
                     p.get("id"), count=True, task="mep_fix")
        for pnl in el.get("panels", []):
            self.add("1.4", "panel", f"ตู้ไฟฟ้า {pnl.get('ways', '')} ช่อง {pnl.get('main', '')}".strip(), "ชุด", 1, pnl["id"],
                     count=True, task="mep_fix")
        pl = ((self.m.get("mep") or {}).get("plumbing")) or {}
        ft = pl.get("fixture_types", {})
        for i, f in enumerate(pl.get("fixtures", [])):
            t = ft.get(f["type"], {})
            self.add("1.3", f"fx_{f['type']}", FIXTURE_NAME.get(t.get("kind"), f["type"]) + (f" ({t['desc']})" if t.get("desc") else ""), "ชุด", 1,
                     f.get("id"), count=True, task="mep_fix")
        for e in pl.get("equipment", []):
            self.add("1.3", f"eq_{e['kind']}", f"{e['kind']} {e.get('size', '')}".strip(), "ชุด", 1, e.get("id"),
                     count=True, task="mep_ext")
        if el or pl:
            self.note("งานระบบรอบแรกนับเฉพาะจุดและอุปกรณ์ ยังไม่คิดความยาวสาย/ท่อ (รอหลักเกณฑ์ข้อ 4.3–4.4)")

    # ------------------------------------------------------------ เหล็กเสริมรวม
    def _rebar_items(self):
        total_kg = 0.0
        for dia in sorted(self.rebar_len):
            per = self.rebar_len[dia]
            L = sum(per.values())
            kg = L * kg_per_m(dia)
            w = REBAR_WASTE.get(dia, 0.15)
            kind = "RB" if dia in RB_SIZES else "DB"
            grade = "SR24" if kind == "RB" else "SD40"
            it = self.add("1.1.9", f"rebar_{kind}{dia}", f"เหล็กเสริม {grade} ({kind}) Ø {dia} มม.", "กก.", kg, None,
                          waste=w, task="rebar", note=f"ยาวรวม {L:.2f} ม. × {kg_per_m(dia):.3f} กก./ม.")
            it["from"] = list(per.keys())
            total_kg += kg * (1 + w)
        if total_kg:
            self.add("1.1.9", "tie_wire", "ลวดผูกเหล็ก", "กก.", total_kg * self.s["tie_wire_per_ton"] / 1000.0, None, task="rebar",
                     note="30 กก. ต่อเหล็กเสริม 1,000 กก. (คิดจากน้ำหนักรวมเผื่อ)")

    # ------------------------------------------------------------ output
    def result(self, price_map=None):
        out = []
        for it in self.items.values():
            if it.get("skip"):
                continue
            q = it["qty_net"] * (1 + it["waste"])
            qty = int(round(q)) if it["count"] and abs(q - round(q)) < 1e-6 else (math.ceil(q - 1e-9) if it["count"] else r2(q))
            row = {"key": it["key"], "group_code": it["group_code"], "group": it["group"], "name": it["name"],
                   "unit": it["unit"], "qty": qty, "qty_net": r2(it["qty_net"]), "waste": it["waste"],
                   "waste_included": bool(it["waste"]), "from": it["from"], "task": it["task"], "status": "computed",
                   "src": "tools/takeoff.py (หลักเกณฑ์อาคาร 2569)"}
            if it.get("note"):
                row["note"] = it["note"]
            pr = (price_map or {}).get(it["key"])
            if pr is None and price_map:
                pr = next((v for k, v in price_map.items() if k.endswith("*") and it["key"].startswith(k[:-1])), None)
            if it.get("wage_code"):
                pr = {"kind": "wage", "code": it["wage_code"]}
            if pr:
                row["price_ref"] = pr
            out.append(row)
        order = list(GROUPS)
        out.sort(key=lambda r: order.index(r["group_code"]) if r["group_code"] in order else 99)
        return out


def run(model, settings=None, price_map=None):
    t = Takeoff(model, settings).run()
    return t.result(price_map), t.notes, t.s


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--price-map", default=os.path.join(HERE, "price_map.json"))
    ap.add_argument("--csv")
    a = ap.parse_args()
    m = json.load(open(a.file, encoding="utf-8"))
    pm = json.load(open(a.price_map, encoding="utf-8")).get("map", {}) if os.path.exists(a.price_map) else None
    settings = ((m.get("quantities") or {}).get("settings")) or None
    items, notes, used = run(m, settings, pm)
    for r in items:
        w = f" (+{r['waste']*100:g}%)" if r["waste"] else ""
        print(f"{r['group_code']:<7} {r['name'][:58]:<58} {r['qty']:>12,.2f} {r['unit']}{w}")
    if notes:
        print("\nข้อสมมติ/คำเตือน:")
        for n in notes:
            print("  -", n)
    if a.csv:
        with open(a.csv, "w", newline="", encoding="utf-8-sig") as f:
            wr = csv.writer(f)
            wr.writerow(["หมวด", "รายการ", "หน่วย", "ปริมาณสุทธิ", "% เผื่อ", "ปริมาณ", "ชิ้นส่วน"])
            for r in items:
                wr.writerow([r["group_code"], r["name"], r["unit"], r["qty_net"], r["waste"] * 100, r["qty"], " ".join(r["from"])])
    if a.write:
        m["quantities"] = {"model_hash": qty_hash(m), "stale": False, "generated_by": "tools/takeoff.py",
                           "settings": used, "notes": notes, "items": items}
        m.setdefault("history", []).append({"at": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
                                            "by": "tools/takeoff.py", "sections": ["quantities"]})
        json.dump(m, open(a.file, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"\nเขียน quantities {len(items)} รายการลง {a.file}")


if __name__ == "__main__":
    main()
