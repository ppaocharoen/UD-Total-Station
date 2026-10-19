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
import argparse, csv, json, math, os, re, sys
from collections import OrderedDict, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validate import qty_hash, qty_base_hash, design_hash  # noqa: E402
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
    # งานระบบ (หลักเกณฑ์ 2569 ข้อ 4.3–4.4; ช่วงที่เล่มให้ใช้ค่าต่ำตามที่ Earth เลือก) — เผื่อยาว + เบ็ดเตล็ด รวมแบบบวก
    "pipe_waste": 0.10,               # ท่อประปา/ระบายน้ำ 10%
    "branch_conduit_waste": 0.30,     # ท่อร้อยสายวงจรย่อย 15% + เบ็ดเตล็ด 15%
    "branch_wire_waste": 0.20,        # สายวงจรย่อย 15% + เบ็ดเตล็ด 5%
    "drain_run_depth": 0.30,          # ท่อระบายน้ำเดินใต้ระดับดิน (ม.) ตอนประมาณแนวท่อ
    "cw_run_depth": 0.20,             # ท่อประปาเดินใต้ระดับดิน (ม.) ตอนประมาณแนวท่อ
}
# % เผื่อเหล็กเสริมตามขนาด (หลักเกณฑ์ 2569 ข้อ 4.1 (4))
REBAR_WASTE = {6: 0.05, 9: 0.07, 10: 0.07, 12: 0.09, 15: 0.11, 16: 0.11, 19: 0.13, 20: 0.13,
               22: 0.15, 25: 0.15, 28: 0.15, 32: 0.15}
POINT_NAME = {"light": "ดวงโคม", "lamp": "โคมไฟ", "switch": "สวิตช์", "outlet": "เต้ารับ", "ac": "เครื่องปรับอากาศ",
              "heater": "เครื่องทำน้ำอุ่น", "fan": "พัดลมระบายอากาศ", "tv": "เต้ารับทีวี", "data": "เต้ารับสื่อสาร",
              "bell": "กริ่ง", "pump": "ปั๊มน้ำ"}
EQUIP_NAME = {"septic_tank": "ถังบำบัดน้ำเสียสำเร็จรูป", "grease_trap": "ถังดักไขมัน", "water_tank": "ถังเก็บน้ำ", "pump": "เครื่องสูบน้ำ",
              "meter": "มาตรวัดน้ำ", "manhole": "บ่อพัก", "gate_valve": "ประตูน้ำ", "check_valve": "ประตูน้ำกันกลับ", "soak_pit": "บ่อซึม"}
FIXTURE_NAME = {"wc": "โถส้วมชักโครก", "lavatory": "อ่างล้างหน้า", "sink": "ซิงค์ล้างจาน", "shower": "ชุดฝักบัว",
                "floor_drain": "ตะแกรงระบายน้ำพื้น (FD)", "faucet": "ก๊อกน้ำ", "spray": "สายฉีดชำระ",
                "water_heater": "เครื่องทำน้ำอุ่น", "washer": "จุดเครื่องซักผ้า", "urinal": "โถปัสสาวะชาย"}
# % ของค่าท่อ ตาม ว480 (ตกลงกับ Earth 18 ต.ค. 2569): ข้อต่อ / เหล็กยึด / ทดสอบ-ทำความสะอาด-ทาสีสัญลักษณ์ ค่าแรง 30% ของค่าวัสดุ
PIPE_PCT = {"SN-3.7": {"name": "PVC ระบายน้ำ", "fit": 0.4, "sup": 0.3, "test": 0.1},
            "SN-3.8": {"name": "PVC ประปา", "fit": 0.5, "sup": 0.3, "test": 0.1},
            "SN-3.10": {"name": "PP-R/PB/HDPE ประปา", "fit": 0.5, "sup": 0.2, "test": 0.1}}
PIPE_PCT_CODES = {"SN-3.7": ("g/h", "i/j", "k/l"), "SN-3.8": ("k/l", "m/n", "o/p"), "SN-3.10": ("k/l", "m/n", "o/p")}
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


def steel_perimeter(sec):
    """เส้นรอบรูปสำหรับทาสี (ม./ม.) จากชื่อหน้าตัด มอก. หรือ dims; เหล็กแผ่นบางนับ 2 ด้าน"""
    import re
    shape, name, d = sec.get("shape"), sec.get("name", ""), sec.get("dims") or {}
    nums = [float(v) / 1000 for v in re.findall(r"[\d.]+", name.split(" ")[0])]
    if shape == "lipped_C" and len(nums) >= 3:
        h, b, lip = nums[0], nums[1], nums[2]
        return 2 * (h + 2 * b + 2 * lip)
    if shape == "C" and len(nums) >= 2:
        return 2 * (nums[0] + 2 * nums[1])
    if shape in ("H", "I") and len(nums) >= 2:
        return 2 * nums[0] + 4 * nums[1]
    if shape == "box" and len(nums) >= 2:
        return 2 * (nums[0] + nums[1])
    if shape == "pipe" and nums:
        return math.pi * nums[0]
    if shape == "angle" and len(nums) >= 2:
        return 2 * (nums[0] + nums[1])
    if d.get("h") and d.get("b"):
        return 2 * (d["h"] + d["b"])
    return None


PIPE_DEFAULT = {   # ระบบ/ขนาดท่อตั้งต้นต่อสุขภัณฑ์ ตอนแบบไม่ได้เขียนแนวท่อ: [(system, dia)]
    "wc": [("soil", '4"'), ("cw", '1/2"')], "lavatory": [("waste", '2"'), ("cw", '1/2"')], "sink": [("waste", '2"'), ("cw", '1/2"')],
    "shower": [("waste", '2"'), ("cw", '1/2"')], "floor_drain": [("waste", '2"')], "urinal": [("waste", '2"'), ("cw", '1/2"')],
    "washer": [("waste", '2"'), ("cw", '1/2"')], "water_heater": [("cw", '1/2"')], "faucet": [("cw", '1/2"')], "spray": [("cw", '1/2"')],
}
SYS_NAME = {"cw": "ประปา", "hw": "น้ำร้อน", "waste": "น้ำทิ้ง", "soil": "โสโครก", "vent": "ระบายอากาศ", "rain": "น้ำฝน", "drain": "ระบายน้ำ"}
SYS_TARGET = {"cw": ("meter", "water_tank", "pump"), "soil": ("septic_tank",),
              "waste": ("grease_trap", "soak_pit", "manhole", "septic_tank")}


def bored_pile_item(p):
    """รายการเข็มเจาะ: เสาเข็มเจาะ ขนาด ศก. x.xx ม. ยาว x.xx ม. n-DBxx ปลอก RBx @ x.xx ม. n-DBxx L=x.xx ม. (ถ้ามีเดือย)"""
    dia, ln = float(p.get("size") or 0), float(p["length"])
    name, key = f"เสาเข็มเจาะ ขนาด ศก. {dia:.2f} ม. ยาว {ln:.2f} ม.", f"pile_bored_{dia:g}_{ln:g}"
    if p.get("bars"):
        n, d = p["bars"]; name += f" {int(n)}-DB{d:g}"; key += f"_{int(n)}DB{d:g}"
    if p.get("tie"):
        d, sp = p["tie"]; name += f" ปลอก RB{d:g} @ {sp:.2f} ม."; key += f"_RB{d:g}@{sp:g}"
    if p.get("dowel"):
        n, d, L = p["dowel"]; name += f" {int(n)}-DB{d:g} L={L:.2f} ม."; key += f"_{int(n)}DB{d:g}L{L:g}"
    return key, name


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
        self.backfill = 0.0
        self.src_task = {}
        self.routes = []          # แนวท่อ/สายที่ระบบประมาณให้ (ใช้ตรวจ clash และแสดง 3D)
        self.rebar_calc = defaultdict(list)   # (dia, ชิ้น) -> วิธีคิดเหล็กเสริม

    # ------------------------------------------------------------ accumulate
    def add(self, code, key, name, unit, qty, src=None, waste=0.0, count=False, task=None, note=None, calc=None):
        k = f"{code}|{key}"
        it = self.items.get(k)
        if not it:
            it = self.items[k] = {"key": key, "group_code": code, "group": GROUPS.get(code, ""), "name": name,
                                  "unit": unit, "qty_net": 0.0, "waste": waste, "count": count,
                                  "from": [], "task": task, "note": note}
        it["qty_net"] += qty
        if src and src not in it["from"]:
            it["from"].append(src)
        if src:   # ปริมาณรายชิ้น (ไม่รวมเผื่อ) + วิธีคิด — ใช้ในกล่องข้อมูลชิ้นส่วนบนเว็บ
            bs = it.setdefault("by_src", {}); bs[src] = bs.get(src, 0.0) + qty
            if calc:
                it.setdefault("calc", {}).setdefault(src, []).append(calc)
        # แยกปริมาณตามงานในแผน (ใช้กระจายต้นทุนลง Gantt/S-Curve และโยงชิ้นส่วนกับงาน)
        part = it.setdefault("parts", {}).setdefault(task or "other", {"q": 0.0, "from": []})
        part["q"] += qty
        if src and src not in part["from"]:
            part["from"].append(src)
        if src and task and src not in self.src_task:
            self.src_task[src] = task
        return it

    def lift(self, x):
        """งานโครงสร้างตามระดับ: lift:<ชื่อระดับ> ของปลายบนชิ้นส่วน (เสาตอม่อไปกับคานคอดิน)"""
        lv = x.get("level")
        if not lv:
            n = max((self.nodes[x["i"]], self.nodes[x["j"]]), key=lambda n: n["z"])
            lv = n.get("level") or min(self.levels, key=lambda k: abs(self.levels[k] - n["z"]), default="?")
        return "lift:" + lv

    def note(self, msg):
        if msg not in self.notes:
            self.notes.append(msg)

    def rebar(self, mid, dia, length, calc=None):
        if length > 0:
            self.rebar_len[int(round(dia))][mid] += length
            if calc:
                self.rebar_calc[(int(round(dia)), mid)].append(calc)

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
        self._stairs()
        self._retaining_walls()
        self._plates()
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
                self.add("1.1.2", "excav", "งานขุดดินฐานรากและถมคืน (ลึกไม่เกิน 2.00 ม.)", "ลบ.ม.", exc, f["id"], waste=s["excav_waste"], task="footing",
                         calc=f"กว้าง {b:g} × ยาว {d:g} × ลึก {depth:.2f} = {exc:.2f} ลบ.ม. (+ เผื่อ {s['excav_waste']*100:g}%)",
                         note="ว480 ข้อ 1.3 ขุดหลุมแล้วถมกลับ รวมถมคืนในรายการเดียว")
                exc_total = exc * (1 + s["excav_waste"])
            else:
                mg = s["excav_deep_margin"]
                exc = (b + 2 * mg) * (d + 2 * mg) * (depth + s["sand_thk"] + s["lean_thk"])
                self.add("1.1.2", "excav_deep", "งานขุดดินฐานรากและถมคืน (ลึกเกิน 2.00 ม.)", "ลบ.ม.", exc, f["id"], task="footing")
                exc_total = exc
                self.note(f"ฐานราก {f['id']} ขุดลึก {depth:.2f} ม. เกิน 2 ม. — พิจารณาค่าใช้จ่ายพิเศษระบบป้องกันดินพัง (ปร.3)")
            vol_f = b * d * h
            pier = self._pier_volume(f)
            self.backfill += max(exc_total - vol_f - pier, 0)   # ข้อมูลเท่านั้น — ค่าแรงรวมอยู่ในงานขุด (ว480 1.3)
            self.add("1.1.4", "sand_base", "ทรายรองใต้ฐานราก (บดอัดแรงคน)", "ลบ.ม.", b * d * s["sand_thk"], f["id"],
                     waste=s["sand_waste"], task="footing")
            self.add("1.1.12", "lean_conc", "คอนกรีตหยาบรองใต้ฐานราก (1:3:5)", "ลบ.ม.", b * d * s["lean_thk"], f["id"], task="footing")
            name, key = self.conc_name(f.get("material"))
            self.add("1.1.12", key, name, "ลบ.ม.", vol_f, f["id"], task="footing", calc=f"{b:g} × {d:g} × หนา {h:g} = {vol_f:.3f} ลบ.ม.")
            self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", 2 * (b + d) * h, f["id"], task="footing",
                     calc=f"รอบรูป 2×({b:g}+{d:g}) × หนา {h:g} = {2*(b+d)*h:.2f} ตร.ม.")
            rb = self.rebar_of("supports", f["id"])
            c = s["cover"]
            if rb.get("bars_x"):
                n, dia = rb["bars_x"]; self.rebar(f["id"], dia, n * (b - 2 * c), f"แนว x {n} เส้น × {b - 2*c:.2f} ม.")
            if rb.get("bars_y"):
                n, dia = rb["bars_y"]; self.rebar(f["id"], dia, n * (d - 2 * c), f"แนว y {n} เส้น × {d - 2*c:.2f} ม.")
            if rb.get("rings"):   # ฐานเข็ม 1 ต้น: ปลอกรอบ
                k, dia = rb["rings"]; per = 2 * (b + d) - 8 * c
                self.rebar(f["id"], dia, int(k) * per, f"ปลอกรอบ {int(k)} วง × {per:.2f} ม.")
            if rb.get("bands"):   # ฐานเข็ม 3 ต้น: แถบเหล็กเหนือหัวเข็มแต่ละคู่
                k, n, dia, ln = rb["bands"]; k, n = int(k), int(n)
                self.rebar(f["id"], dia, k * n * ln, f"{k} แถบ × {n} เส้น × {ln:.2f} ม.")
            if not rb:
                self.note(f"ฐานราก {f['id']}: ยังไม่มีเหล็กเสริมใน design — ไม่ได้คิดเหล็ก")
            p = f.get("piles")
            if p:
                if p.get("kind") == "bored":   # เข็มเจาะ: สืบราคาต่อต้น (รวมเจาะ คอนกรีต เหล็ก) — เหล็กเข็มไม่รวมในหมวด 1.1.9
                    key, pname = bored_pile_item(p)
                    self.add("1.1.5", key, pname, "ต้น", p["n"], f["id"], count=True, task="footing")
                else:
                    pname = f"เสาเข็ม {p['type']} ยาว {p['length']:g} ม."
                    self.add("1.1.5", f"pile_{p['type']}_{p['length']:g}", pname, "ต้น", p["n"], f["id"], count=True, task="footing")
                    self.add("1.1.5", "pile_drive", "งานตอกเสาเข็มคอนกรีตอัดแรง", "ต้น", p["n"], f["id"], count=True, task="footing")
                self.add("1.1.5", "pile_cut", "งานสกัดหัวเสาเข็ม", "ต้น", p["n"], f["id"], count=True, task="footing")
        if not self.m.get("supports"):
            self.note("ไม่มีฐานราก (supports) ในโมเดล")
        elif self.backfill:
            self.note(f"ปริมาณถมคืน (ข้อมูล) {self.backfill:.2f} ลบ.ม. — ไม่แยกรายการ เพราะค่าแรง ว480 ข้อ 1.3 รวมขุดและถมกลับแล้ว")
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
            self.add("1.1.12", key, name, "ลบ.ม.", b * h * H, x["id"], task=self.lift(x), calc=f"{b:g} × {h:g} × สูง {H:.2f} = {b*h*H:.3f} ลบ.ม.")
            self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", 2 * (b + h) * H, x["id"], task=self.lift(x),
                     calc=f"2×({b:g}+{h:g}) × สูง {H:.2f} = {2*(b+h)*H:.2f} ตร.ม.")
            rb = self.rebar_of("members", x["id"])
            if rb.get("main"):
                n, dia = rb["main"]; self.rebar(x["id"], dia, n * H, f"เหล็กยืน {n} เส้น × {H:.2f} ม.")
            if rb.get("stirrup"):
                dia, sp = rb["stirrup"][0], rb["stirrup"][1]
                cnt = math.floor(H / sp) + 1
                per = 2 * (b + h) - 8 * c
                self.rebar(x["id"], dia, cnt * per * (2 if rb.get("double_stirrup") else 1), f"ปลอก @{sp:g} {cnt} วง × {per:.2f} ม.")
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
            self.add("1.1.12", key, name, "ลบ.ม.", b * hc * Ln, x["id"], task=self.lift(x),
                     calc=f"{b:g} × {'(' + format(h, 'g') + ' − พื้น ' + format(sl['t'], 'g') + ')' if sl else format(h, 'g')} × ยาวสุทธิ {Ln:.2f} = {b*hc*Ln:.3f} ลบ.ม. (ศูนย์–ศูนย์ {Lc:.2f} หักครึ่งเสา)")
            sides = 2 * hc
            bottom = b if x["type"] != "tie_beam" else b   # คานคอดินหล่อบนแบบเช่นกัน
            self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", (sides + bottom) * Ln, x["id"], task=self.lift(x),
                     calc=f"(ข้าง 2×{hc:g} + ท้อง {bottom:g}) × {Ln:.2f} = {(sides+bottom)*Ln:.2f} ตร.ม.")
            if x["type"] == "beam":
                self.add("1.1.7", "props", "ไม้ค้ำยัน (ยูคาลิปตัส Ø3\" ยาว 3 ม.)", "ต้น", self.s["props_per_m_beam"] * Ln,
                         x["id"], count=True, task=self.lift(x))
            rb = self.rebar_of("members", x["id"])
            for k in ("top", "bot", "side"):
                if rb.get(k):
                    n, dia = rb[k]; self.rebar(x["id"], dia, n * Lc, f"{dict(top='บน', bot='ล่าง', side='ข้าง')[k]} {n} เส้น × {Lc:.2f} ม.")
            if rb.get("extra_top"):
                n, dia = rb["extra_top"]; self.rebar(x["id"], dia, n * 2 * Lc / 3, f"เสริมบน {n} เส้น × 2/3 ช่วง")
            if rb.get("extra_bot"):
                n, dia = rb["extra_bot"]; self.rebar(x["id"], dia, n * 0.75 * Lc, f"เสริมล่าง {n} เส้น × 0.75 ช่วง")
            if rb.get("stirrup"):
                st = rb["stirrup"]; dia, s1 = st[0], st[1]; s2 = st[2] if len(st) > 2 else s1
                cnt = math.ceil((Ln / 2) / s1) + math.ceil((Ln / 2) / s2) + 1
                per = 2 * (b + h) - 8 * c
                self.rebar(x["id"], dia, cnt * per * (2 if rb.get("double_stirrup") else 1), f"ปลอก @{s1:g}/{s2:g} {cnt} วง × {per:.2f} ม.")
            if not rb:
                self.note(f"คาน {x['id']}: ยังไม่มีเหล็กเสริม")
        self.note("เหล็กยืนคานวัดศูนย์ถึงศูนย์ ไม่รวมระยะทาบและงอขอ; ปลอกวัดเส้นรอบรูป 2(b+h) − 8×ระยะหุ้ม ไม่รวมขอ")

    # ------------------------------------------------------------ พื้น
    def _slabs(self):
        for s in self.m.get("slabs", []):
            A, P, t = poly_area(s["polygon"]), poly_perim(s["polygon"]), s["t"]
            lt = "lift:" + s["level"] if s.get("level") else "slab"
            name, key = self.conc_name(s.get("material"))
            if s["kind"] == "precast":
                self.add("1.1.16", "precast_slab", "พื้นคอนกรีตสำเร็จรูป", "ตร.ม.", A, s["id"], task=lt)
                self.add("1.1.16", "topping", f"คอนกรีตทับหน้าพื้นสำเร็จรูป หนา {t*100:g} ซม.", "ตร.ม.", A, s["id"], task=lt)
                continue
            self.add("1.1.12", key, name, "ลบ.ม.", A * t, s["id"], task=lt, calc=f"พื้นที่ {A:.2f} × หนา {t:g} = {A*t:.3f} ลบ.ม.")
            if s["kind"] == "cast":
                self.add("1.1.7", "formwork", "ไม้แบบหล่อคอนกรีต", "ตร.ม.", A + P * t, s["id"], task=lt,
                         calc=f"ท้องพื้น {A:.2f} + ขอบ {P:.2f}×{t:g} = {A+P*t:.2f} ตร.ม.")
                self.add("1.1.7", "props", "ไม้ค้ำยัน (ยูคาลิปตัส Ø3\" ยาว 3 ม.)", "ต้น", self.s["props_per_m2_slab"] * A,
                         s["id"], count=True, task=lt)
            else:   # ground
                self.add("1.1.4", "sand_slab", "ทรายรองพื้นวางบนดิน (บดอัดแรงคน)", "ลบ.ม.", A * self.s["sand_thk"], s["id"],
                         waste=self.s["sand_waste"], task=lt)
                if s.get("pe_sheet", True):   # แผ่นพลาสติกรองใต้พื้น ไม่คิดเผื่อทับซ้อน (ตกลงกับ Earth 19 ต.ค. 2569)
                    self.add("1.1.4", "pe_sheet", "แผ่นพลาสติกรองใต้พื้น (Polyethylene)", "ตร.ม.", A, s["id"], task=lt,
                             calc=f"พื้นที่ {A:.2f} ตร.ม. (ไม่คิดเผื่อทับซ้อน)")
            rb = self.rebar_of("slabs", s["id"])
            if rb.get("mesh"):
                mh = rb["mesh"]; dia, sp = mh[0], mh[1]; layers = mh[2] if len(mh) > 2 else 1
                xs = [p[0] for p in s["polygon"]]; ys = [p[1] for p in s["polygon"]]
                Lx, Ly = max(xs) - min(xs), max(ys) - min(ys)
                fill = A / (Lx * Ly) if Lx * Ly else 1
                L = ((math.floor(Ly / sp) + 1) * Lx + (math.floor(Lx / sp) + 1) * Ly) * layers * fill
                self.rebar(s["id"], dia, L, f"ตะแกรง @{sp:g} {layers} ชั้น ยาวรวม {L:.2f} ม.")
            elif rb.get("mesh_xy"):   # เหล็กสองแนวต่างขนาด/ระยะ (ผลออกแบบพื้นจากเว็บ): x = เหล็กวางตามแนวแกน x
                mx = rb["mesh_xy"]; layers = mx.get("layers", 1)
                xs = [p[0] for p in s["polygon"]]; ys = [p[1] for p in s["polygon"]]
                Lx, Ly = max(xs) - min(xs), max(ys) - min(ys)
                fill = A / (Lx * Ly) if Lx * Ly else 1
                if mx.get("x"):
                    dia, sp = mx["x"]; L = (math.floor(Ly / sp) + 1) * Lx * layers * fill
                    self.rebar(s["id"], dia, L, f"แนว x @{sp:g} {math.floor(Ly / sp) + 1} เส้น × {Lx:.2f} ม. = {L:.2f} ม.")
                if mx.get("y"):
                    dia, sp = mx["y"]; L = (math.floor(Lx / sp) + 1) * Ly * layers * fill
                    self.rebar(s["id"], dia, L, f"แนว y @{sp:g} {math.floor(Lx / sp) + 1} เส้น × {Ly:.2f} ม. = {L:.2f} ม.")
            elif rb.get("wire_mesh"):
                self.add("1.1.9", f"wiremesh_{rb['wire_mesh']}", f"ตะแกรงเหล็กสำเร็จรูป {rb['wire_mesh']}", "ตร.ม.", A, s["id"], task=lt)
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
        steel_mem = defaultdict(dict)     # section -> {member: ความยาว}
        hip_roof = any(r["form"] == "hip" for r in self.m.get("roofs", []))
        explicit = {x["type"] for x in self.m.get("members", [])}
        for x in self.m.get("members", []):
            sec = self.secs.get(x["section"], {})
            if sec.get("kind") in ("steel", "cold_formed"):
                p, q = self.mem_geom(x)
                steel_len[x["section"]] += math.dist(p, q)
                steel_src[x["section"]].append(x["id"])
                steel_mem[x["section"]][x["id"]] = math.dist(p, q)
        roof_area = 0.0
        for rf in self.m.get("roofs", []):
            r = self._roof_r(rf)
            planes = roof_planes(r)
            area = sum(poly_area3(p) for p in planes)
            roof_area += area
            w = 0.05 if rf["form"] == "hip" else 0.03
            if rf["cover"] != "concrete_deck":
                it = self.add("1.2.1", f"cover_{rf['cover']}", f"วัสดุมุงหลังคา {COVER_NAME.get(rf['cover'], rf['cover'])}",
                              "ตร.ม.", area, rf["id"], waste=w, task="roof_cover",
                              note="พื้นที่ตามแนวลาด; ถ้าคิดเป็นแผ่นให้แปลงตามคู่มือผู้ผลิตแล้วเผื่อ 3%/5%")
                it["spec"] = {"t": "cover", "cover": rf["cover"], "form": rf["form"]}
                edges = defaultdict(int)
                for p in planes:
                    for i in range(len(p)):
                        a = tuple(round(v, 3) for v in p[i]); b = tuple(round(v, 3) for v in p[(i + 1) % len(p)])
                        edges[tuple(sorted([a, b]))] += 1
                ridge = sum(v_len(v_sub(list(a), list(b))) for (a, b), n in edges.items() if n >= 2 and abs(a[1] - b[1]) < 1e-3)
                hip = sum(v_len(v_sub(list(a), list(b))) for (a, b), n in edges.items() if n >= 2 and abs(a[1] - b[1]) >= 1e-3)
                if ridge:
                    it = self.add("1.2.1", "ridge_cap", "ครอบสันหลังคา", "ม.", ridge, rf["id"], waste=0.03, task="roof_cover")
                    it["spec"] = {"t": "ridge", "cover": rf["cover"]}
                if hip:
                    it = self.add("1.2.1", "hip_cap", "ครอบตะเข้สัน", "ม.", hip, rf["id"], waste=0.03, task="roof_cover")
                    it["spec"] = {"t": "hip", "cover": rf["cover"]}
                if rf.get("insulation"):
                    it = self.add("1.2.1", "insulation", f"ฉนวนใต้หลังคา {rf['insulation']}", "ตร.ม.", area, rf["id"], task="roof_cover")
                    it["spec"] = {"t": "insulation", "desc": rf["insulation"], "cover": rf["cover"]}
                for part, along, typ in (("purlin", "u", "purlin"), ("rafter", "v", "rafter")):
                    spec = rf.get(part)
                    if not spec or typ in explicit:
                        continue
                    L = sum(v_len(v_sub(a, b)) for p in planes if len(p) >= 3 for a, b in plane_lines(p, spec["spacing"], along))
                    steel_len[spec["section"]] += L
                    steel_src[spec["section"]].append(rf["id"])
                    steel_mem[spec["section"]][rf["id"]] = steel_mem[spec["section"]].get(rf["id"], 0) + L
            # พื้นที่โครงหลังคาตามแนวลาดเป็นข้อมูลเท่านั้น (ไม่มีค่างาน — ค่าแรงโครงหลังคาคิดต่อ กก. ในรายการเหล็กรูปพรรณ) ตกลงกับ Earth 18 ต.ค. 2569
            self.note(f"หลังคา {rf['id']}: พื้นที่ตามแนวลาด {area:.2f} ตร.ม. (ข้อมูล ไม่คิดเงิน)")
        for sec_id, L in steel_len.items():
            sec = self.secs[sec_id]
            w = 0.05 if hip_roof else 0.03
            pieces = round_pieces(L * (1 + w) / self.s["steel_piece_len"])
            kg = pieces * self.s["steel_piece_len"] * sec["kg_m"]
            it = self.add("1.1.19", f"steel_{sec_id}", f"เหล็กรูปพรรณ {sec.get('name', sec_id)} ({sec['kg_m']:g} กก./ม.)", "กก.",
                          kg, None, task="roof_frame",
                          note=f"ยาวรวม {L:.2f} ม. เผื่อ {w*100:g}% = {pieces} ท่อน × {self.s['steel_piece_len']:g} ม.")
            it["from"] = steel_src[sec_id]
            it["parts"] = {"roof_frame": {"q": kg, "from": steel_src[sec_id]}}
            it["pieces"] = pieces
            it["by_src"] = {m: ln * sec["kg_m"] for m, ln in steel_mem[sec_id].items()}
            it["calc"] = {m: [f"ยาว {ln:.2f} ม. × {sec['kg_m']:g} กก./ม. = {ln*sec['kg_m']:.2f} กก."] for m, ln in steel_mem[sec_id].items()}
        # ทาสีกันสนิม: เส้นรอบรูปหน้าตัด × ความยาวจริง (ไม่รวมเผื่อ) — เหล็กรีดเย็นคิด 2 ด้าน (ตกลงกับ Earth 18 ต.ค. 2569)
        paint, srcs, unk, pbs = 0.0, [], [], {}
        for sec_id, L in steel_len.items():
            per = steel_perimeter(self.secs[sec_id])
            if per is None:
                unk.append(sec_id)
                continue
            paint += per * L
            srcs += steel_src[sec_id]
            for m, ln in steel_mem[sec_id].items():
                pbs[m] = pbs.get(m, 0) + per * ln
        if paint:
            it = self.add("1.1.19", "paint_rust", "ทาสีกันสนิมโครงเหล็ก", "ตร.ม.", paint, None, task="roof_frame",
                          note="เส้นรอบรูปหน้าตัด × ความยาวจริง; เหล็กรีดเย็นนับผิว 2 ด้าน")
            it["from"] = srcs
            it["parts"] = {"roof_frame": {"q": paint, "from": srcs}}
            it["by_src"] = pbs
        if unk:
            self.note("ทาสีกันสนิม: ยังไม่รู้เส้นรอบรูปหน้าตัด " + ", ".join(unk))

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
                     net, w["id"], task="wall",
                     calc=f"ยาว {L:.2f}{f' − หักเสา {ded:.2f}' if ded else ''} × สูง {H:.2f} = {gross:.2f} ตร.ม." + (f" หักช่องเปิด {opens:.2f} → สุทธิ {net:.2f} ตร.ม." if opens else ""))
            sides = w.get("finish_sides", 2)
            if w.get("plaster") and sides:
                ext = 1 if (w.get("exterior") and sides >= 1) else 0
                pk = "aac" if w["kind"] == "aac" else "brick"
                if sides - ext:
                    it = self.add("1.2.4", f"plaster_int_{pk}", "ฉาบปูนเรียบผนังภายใน" + (" (อิฐมวลเบา)" if pk == "aac" else ""), "ตร.ม.", net * (sides - ext), w["id"], task="plaster",
                                  calc=f"สุทธิ {net:.2f} × {sides - ext} ด้าน")
                    it["spec"] = {"t": "plaster", "side": "int", "wall": w["kind"]}
                if ext:
                    it = self.add("1.2.4", f"plaster_ext_{pk}", "ฉาบปูนเรียบผนังภายนอก" + (" (อิฐมวลเบา)" if pk == "aac" else ""), "ตร.ม.", net, w["id"], task="plaster",
                                  calc=f"สุทธิ {net:.2f} × 1 ด้าน")
                    it["spec"] = {"t": "plaster", "side": "ext", "wall": w["kind"]}
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
                    it = self.add("1.2.3", "lintel", "เสาเอ็น-ทับหลัง คสล. รอบช่องเปิด", "ม.", run, o["id"], task="wall")
                    it.setdefault("spec", {"t": "lintel", "wall": w["kind"], "wt": w["t"]})
        for o in self.m.get("openings", []):
            t = ot.get(o["type"])
            if t:
                it = self.add("1.2.6", f"open_{o['type']}", f"{t.get('desc', o['type'])} ({o['type']} {t['w']:g}×{t['h']:g} ม.)",
                         "ชุด", 1, o["id"], count=True, task="opening")
                it["spec"] = {"t": "opening", "kind": t.get("kind", ""), "w": t["w"], "h": t["h"], "desc": t.get("desc", "")}
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
            it = self.add(code[f["kind"]], f"fin_{f['kind']}_{f['spec']}", f["spec"], unit, q, f["id"],
                          task="ceiling" if f["kind"] == "ceiling" else "finish")
            it["spec"] = {"t": "finish", "kind": f["kind"], "desc": f["spec"]}

    # ------------------------------------------------------------ งานระบบ (หลักเกณฑ์ 2569 ข้อ 4.3–4.4)
    def _mep(self):
        el = ((self.m.get("mep") or {}).get("electrical")) or {}
        pt = el.get("point_types", {})
        for i, p in enumerate(el.get("points", [])):
            t = pt.get(p["type"], {})
            it = self.add("1.4", f"pt_{p['type']}", "จุด" + POINT_NAME.get(t.get("kind"), p["type"]) + (f" ({t['desc']})" if t.get("desc") else ""), "จุด", 1,
                          p.get("id"), count=True, task="mep_fix")
            it["spec"] = {"t": "point", "kind": t.get("kind"), "desc": t.get("desc", "")}
        for pnl in el.get("panels", []):
            self.add("1.4", "panel", f"ตู้ไฟฟ้า {pnl.get('ways', '')} ช่อง {pnl.get('main', '')}".strip(), "ชุด", 1, pnl["id"],
                     count=True, task="mep_fix")
        if el.get("points"):
            self._branch_circuits(el)
        pl = ((self.m.get("mep") or {}).get("plumbing")) or {}
        ft = pl.get("fixture_types", {})
        for i, f in enumerate(pl.get("fixtures", [])):
            t = ft.get(f["type"], {})
            it = self.add("1.3", f"fx_{f['type']}", FIXTURE_NAME.get(t.get("kind"), f["type"]) + (f" ({t['desc']})" if t.get("desc") else ""), "ชุด", 1,
                          f.get("id"), count=True, task="mep_fix")
            it["spec"] = {"t": "fixture", "kind": t.get("kind"), "desc": t.get("desc", "")}
        for e in pl.get("equipment", []):
            it = self.add("1.3", f"eq_{e['kind']}", EQUIP_NAME.get(e["kind"], e["kind"]) + (f" {e['size']}" if e.get("size") else ""), "ชุด", 1,
                          e.get("id"), count=True, task="mep_ext")
            it["spec"] = {"t": "equip", "kind": e["kind"], "size": e.get("size", "")}
        if pl.get("fixtures") or pl.get("pipes"):
            self._pipes(pl)

    def _branch_circuits(self, el):
        """ท่อร้อยสาย/สายวงจรย่อย: เดินระดับ route_height แบบมุมฉาก แผง → จุดใกล้สุด → จุดถัดไป (เพื่อนบ้านใกล้สุด) + ดิ่งลงจุด"""
        H = el.get("route_height")
        panels = {p["id"]: p for p in el.get("panels", [])}
        circuits = {c["id"]: c for c in el.get("circuits", [])}
        if H is None:
            self.note("ไฟฟ้า: ไม่มี route_height — ยังไม่คิดความยาวท่อ/สาย")
            return
        by_c = defaultdict(list)
        for p in el.get("points", []):
            by_c[p.get("circuit")].append(p)
        conduit = el.get("conduit") or "ท่อร้อยสาย"
        wire_t = el.get("wire_type") or "สายไฟ"
        drop = lambda z: max(0.0, H - z)
        for cid, pts in by_c.items():
            c = circuits.get(cid)
            if not c or c.get("panel") not in panels:
                self.note(f"ไฟฟ้า: จุดในวงจร {cid} ไม่มีวงจร/แผงที่อ้างถึง — ไม่ได้คิดท่อ/สาย {len(pts)} จุด")
                continue
            pn = panels[c["panel"]]["xyz"]
            cur = (pn[0], pn[1])
            L = drop(pn[2])                       # แผงขึ้นไประดับเดินท่อ
            path = [list(pn), [pn[0], pn[1], max(H, pn[2])]]
            left = list(pts)
            while left:
                nxt = min(left, key=lambda q: abs(q["xyz"][0] - cur[0]) + abs(q["xyz"][1] - cur[1]))
                L += abs(nxt["xyz"][0] - cur[0]) + abs(nxt["xyz"][1] - cur[1]) + drop(nxt["xyz"][2])
                x, y, z = nxt["xyz"]
                self.routes.append({"id": f"EL-{cid}-{len(self.routes) + 1}", "kind": "conduit", "circuit": cid, "estimated": True,
                                    "pts": [[cur[0], cur[1], H], [x, cur[1], H], [x, y, H], [x, y, min(z, H)]]})
                cur = (x, y)
                left.remove(nxt)
            self.routes.append({"id": f"EL-{cid}-0", "kind": "conduit", "circuit": cid, "estimated": True, "pts": path})
            n = c.get("conductors") or 2
            if not c.get("conductors"):
                self.note(f"ไฟฟ้า: วงจร {cid} ไม่ระบุจำนวนสาย — ใช้ 2 เส้น")
            size = c.get("wire_size")
            it = self.add("1.4", f"conduit_{conduit}", f"ท่อร้อยสายวงจรย่อย {conduit}", "ม.", L, c["panel"],
                          waste=self.s["branch_conduit_waste"], task="mep_rough",
                          note="ประมาณจากตำแหน่งจุดในโมเดล เดินระดับฝ้าแบบมุมฉาก; เผื่อยาว 15% + เบ็ดเตล็ด 15%")
            it["spec"] = {"t": "conduit", "conduit": conduit}
            it = self.add("1.4", f"wire_{wire_t}_{size}", f"สายไฟฟ้า {wire_t} {size or ''} ตร.มม.".replace("  ", " "), "ม.", L * n, c["panel"],
                          waste=self.s["branch_wire_waste"], task="mep_rough",
                          note="ความยาวท่อ × จำนวนสายในวงจร; เผื่อยาว 15% + เบ็ดเตล็ด 5%")
            it["spec"] = {"t": "wire", "wire": wire_t, "size": size}
        self.note("ไฟฟ้า: คิดเฉพาะวงจรย่อย (แผง → จุด) ยังไม่รวมสายเมน/สายป้อน และค่าธรรมเนียมการไฟฟ้า")

    def _pipes(self, pl):
        GL = self.GL
        ft = pl.get("fixture_types", {})
        eq = pl.get("equipment", [])
        mat = {"cw": pl.get("cw_material", "PVC ชั้น 13.5"), "hw": pl.get("hw_material", "PP-R"),
               "soil": pl.get("drain_material", "PVC ชั้น 8.5"), "waste": pl.get("drain_material", "PVC ชั้น 8.5"),
               "vent": pl.get("drain_material", "PVC ชั้น 8.5"), "rain": pl.get("drain_material", "PVC ชั้น 8.5"),
               "drain": pl.get("drain_material", "PVC ชั้น 8.5")}
        runs = defaultdict(float); src = defaultdict(list); est_note = defaultdict(list); plen = defaultdict(dict)
        drawn = defaultdict(list)    # system -> จุดปลายท่อที่เขียนไว้
        for p in pl.get("pipes", []):
            Lp = sum(math.dist(p["pts"][i], p["pts"][i + 1]) for i in range(len(p["pts"]) - 1))
            k = (p["system"], p.get("material") or mat[p["system"]], p["dia"])
            runs[k] += Lp; src[k].append(p["id"]); plen[k][p["id"]] = Lp
            drawn[p["system"]] += [p["pts"][0], p["pts"][-1]]
        # ประมาณแนวท่อสุขภัณฑ์ที่ไม่มีท่อของระบบนั้นมาถึง
        need = defaultdict(list)     # (system, dia) -> fixtures
        for f in pl.get("fixtures", []):
            kind = ft.get(f["type"], {}).get("kind")
            for sysn, dia in PIPE_DEFAULT.get(kind, []):
                if any(math.dist(f["xyz"], q) < 0.3 for q in drawn[sysn]):
                    continue
                need[sysn].append((f, dia))
        for sysn, items in need.items():
            tgt = next((e for k in SYS_TARGET.get(sysn, ()) for e in eq if e["kind"] == k), None)
            if not tgt:
                self.note(f"ท่อ{SYS_NAME[sysn]}: ไม่มีอุปกรณ์ปลายทาง ({', '.join(SYS_TARGET.get(sysn, ()))}) ในโมเดล — ไม่ได้ประมาณท่อของ "
                          + ", ".join(f.get("id") or f["type"] for f, _ in items))
                continue
            zr = GL - (self.s["cw_run_depth"] if sysn in ("cw", "hw") else self.s["drain_run_depth"])
            # ต้นไม้เชื่อมจุดใกล้สุด (Prim): สุขภัณฑ์แต่ละตัวต่อเข้าจุดที่ต่อแล้วซึ่งใกล้ที่สุด (เริ่มจากอุปกรณ์ปลายทาง)
            done = [tgt["xyz"]]
            left = list(items)
            while left:
                f, dia = min(left, key=lambda fd: min(abs(fd[0]["xyz"][0] - q[0]) + abs(fd[0]["xyz"][1] - q[1]) for q in done))
                q = min(done, key=lambda q: abs(f["xyz"][0] - q[0]) + abs(f["xyz"][1] - q[1]))
                Lr = abs(f["xyz"][2] - zr) + abs(f["xyz"][0] - q[0]) + abs(f["xyz"][1] - q[1])
                if q is tgt["xyz"]:
                    Lr += abs(tgt["xyz"][2] - zr)
                k = (sysn, mat[sysn], dia)
                fx, fy, fz = f["xyz"]
                rp = [[fx, fy, fz], [fx, fy, zr], [q[0], fy, zr], [q[0], q[1], zr]]
                if q is tgt["xyz"]:
                    rp.append(list(tgt["xyz"]))
                self.routes.append({"id": f"PP-{sysn}-{f.get('id') or f['type']}", "kind": "pipe", "system": sysn, "dia": dia,
                                    "estimated": True, "from": f.get("id"), "pts": rp})
                runs[k] += Lr; src[k].append(f.get("id") or f["type"]); plen[k][f.get("id") or f["type"]] = plen[k].get(f.get("id") or f["type"], 0) + Lr
                est_note[k].append(f.get("id") or f["type"])
                done.append([f["xyz"][0], f["xyz"][1], zr]); left.remove((f, dia))
        if not runs:
            return
        fit_of = defaultdict(list)
        for k, Lp in sorted(runs.items()):
            sysn, m_, dia = k
            key = f"pipe_{sysn}_{m_}_{dia}"
            note = "ยาวตามแนวท่อ + เผื่อ 10%"
            if est_note[k]:
                note += f" · ประมาณแนวท่อให้ (แบบไม่ได้เขียน): {', '.join(est_note[k])} — ตรวจกับแบบ"
            grp = ("SN-3.7" if sysn in ("soil", "waste", "vent", "rain", "drain") else "SN-3.8") if "PVC" in m_.upper() else \
                  ("SN-3.10" if re.search(r"PP-?R|PB|HDPE", m_, re.I) and sysn in ("cw", "hw") else None)
            it = self.add("1.3", key, f"ท่อ{SYS_NAME.get(sysn, sysn)} {m_} ⌀ {dia}", "ม.", Lp, None,
                          waste=self.s["pipe_waste"], task="mep_rough", note=note)
            it["from"] = src[k]; it["parts"] = {"mep_rough": {"q": Lp, "from": src[k]}}; it["by_src"] = dict(plen[k])
            it["spec"] = {"t": "pipe", "sys": sysn, "mat": m_, "dia": dia}
            if est_note[k]:
                it["estimated"] = True
            if grp:
                fit_of[grp].append(key)
            else:
                self.note(f"ท่อ {m_}: ไม่มีอัตรา % ข้อต่อ/เหล็กยึดใน ว480 ที่ผูกไว้ — ไม่ได้คิดรายการ %")
        # ข้อต่อ / เหล็กยึด / ทดสอบ-ทำความสะอาด-ทาสีสัญลักษณ์: % ของค่าท่อ ตาม ว480 ของท่อแต่ละชนิด (ตกลงกับ Earth 18 ต.ค. 2569)
        for grp, keys in fit_of.items():
            pc, cd = PIPE_PCT[grp], PIPE_PCT_CODES[grp]
            for part, label, code in (("fit", "ข้อต่อ ข้องอ อุปกรณ์", cd[0]), ("sup", "เหล็กยึดและรองรับท่อ", cd[1]),
                                      ("test", "ทดสอบ ทำความสะอาด ทาสีทำสัญลักษณ์ท่อ", cd[2])):
                it = self.add("1.3", f"{part}_{grp}", f"{label} ท่อ{pc['name']} (วัสดุ {pc[part]*100:g}% ของค่าท่อ, ค่าแรง 30% ของค่าวัสดุ)",
                              "งาน", 1, None, count=True, task="mep_rough", note=f"ว480 {grp}-{code}")
                it["pct"] = {"of": keys, "mat": pc[part], "lab_of_mat": 0.30}

    # ------------------------------------------------------------ บันได: คอนกรีต ไม้แบบ (ช่วงพื้นเอียง + ชานพัก) และเหล็กตามผลออกแบบ
    def default_conc(self):
        return next((x["id"] for x in self.m.get("materials", []) if x.get("kind") == "concrete"), None)

    def level_of(self, z):
        return min(self.levels, key=lambda kk: abs(self.levels[kk] - z), default="?")

    def _stairs(self):
        c = self.s["cover"]
        for st in self.m.get("stairs", []):
            fl = st.get("flights") or []
            name, key = self.conc_name(st.get("material") or self.default_conc())
            dz = self.design.get("stairs") or {}
            fids = [st["id"] if len(fl) == 1 else f"{st['id']}#{k + 1}" for k in range(len(fl))]
            for k, f in enumerate(fl):
                fid = fids[k]
                d = dz.get(fid) or {}
                W, H, Lh = f["width"], f["top"] - f["bottom"], f["risers"] * f["going"]
                Li = math.hypot(Lh, H)
                t = d.get("waist") or f.get("waist") or 0.15
                lt = "lift:" + self.level_of(f["top"])
                self.src_task.setdefault(st["id"], lt)
                side = Li * t + Lh * H / 2
                vol, fw = W * side, W * Li + H * W + 2 * side
                self.add("1.1.12", key + "_stair", name + " (บันได)", "ลบ.ม.", vol, st["id"], task=lt,
                         calc=f"{fid} กว้าง {W:g} × (ท้อง {Li:.2f}×{t:g} + ขั้น {Lh:.2f}×{H:.2f}/2) = {vol:.3f} ลบ.ม.")
                self.add("1.1.7", "formwork_stair", "ไม้แบบหล่อคอนกรีต (บันได)", "ตร.ม.", fw, st["id"], task=lt,
                         calc=f"{fid} ท้อง {W:g}×{Li:.2f} + ลูกตั้ง {H:.2f}×{W:g} + ข้าง 2×{side:.3f} = {fw:.2f} ตร.ม.")
                if d.get("main_bar"):
                    dia, sp = d["main_bar"]; n = math.floor(W / sp) + 1
                    self.rebar(st["id"], dia, n * Li, f"{fid} เหล็กหลัก @{sp:g} {n} เส้น × {Li:.2f} ม.")
                if d.get("dist_bar"):
                    dia, sp = d["dist_bar"]; n = math.floor(Li / sp) + 1
                    self.rebar(st["id"], dia, n * (W - 2 * c), f"{fid} เหล็กกันร้าว @{sp:g} {n} เส้น × {W - 2 * c:.2f} ม.")
            # ชานพัก: จากโมเดล (landings) หรือจากแท็บออกแบบ (design.stairs[ช่วง].landing = [ยาวตามแนวบันได, กว้าง, หนา]) — เหล็กต่อเนื่องจากช่วงที่ชานพักอยู่บน
            lands = []
            for j, ld in enumerate(st.get("landings") or []):
                x1, y1, x2, y2 = ld["rect"]; dx, dy = abs(x2 - x1), abs(y2 - y1)
                k = next((k for k, f in enumerate(fl) if abs(f["top"] - ld["top"]) <= 0.02), None)
                if k is None:
                    k = next((k for k, f in enumerate(fl) if abs(f["bottom"] - ld["top"]) <= 0.02), None)
                xdir = k is not None and fl[k]["dir"] in ("+X", "-X")
                lands.append((f"ชานพัก {j + 1}", k, dx if xdir else dy, dy if xdir else dx, ld["t"], ld["top"]))
            if not st.get("landings"):
                for k, f in enumerate(fl):
                    ln = (dz.get(fids[k]) or {}).get("landing")
                    if ln:
                        lands.append((f"ชานพัก {fids[k]}", k, ln[0], ln[1], ln[2], f["top"]))
            for lbl, k, al, wd, t, top in lands:
                A, P = al * wd, 2 * (al + wd)
                lt = "lift:" + self.level_of(top)
                self.add("1.1.12", key + "_stair", name + " (บันได)", "ลบ.ม.", A * t, st["id"], task=lt,
                         calc=f"{lbl} {al:g}×{wd:g} × หนา {t:g} = {A * t:.3f} ลบ.ม.")
                self.add("1.1.7", "formwork_stair", "ไม้แบบหล่อคอนกรีต (บันได)", "ตร.ม.", A + P * t, st["id"], task=lt,
                         calc=f"{lbl} ท้อง {A:.2f} + ขอบ {P:.2f}×{t:g} = {A + P * t:.2f} ตร.ม.")
                d = (dz.get(fids[k]) or {}) if k is not None else {}
                if d.get("main_bar"):
                    dia, sp = d["main_bar"]; n = math.floor(wd / sp) + 1
                    self.rebar(st["id"], dia, n * al, f"{lbl} เหล็กหลัก @{sp:g} {n} เส้น × {al:.2f} ม.")
                if d.get("dist_bar"):
                    dia, sp = d["dist_bar"]; n = math.floor(al / sp) + 1
                    self.rebar(st["id"], dia, n * (wd - 2 * c), f"{lbl} เหล็กกันร้าว @{sp:g} {n} เส้น × {wd - 2 * c:.2f} ม.")

    # ------------------------------------------------------------ กำแพงกันดิน (เพิ่มจากแท็บออกแบบ)
    def _retaining_walls(self):
        c = self.s["cover"]
        for w in self.m.get("retaining_walls", []):
            L, H, tb, tw, B = w["length"], w["H"], w["tb"], w["tw"], w["B1"] + w["B2"]
            hw = H - tb
            bot = w.get("bottom")   # ระดับท้องฐาน (ม.) — ไม่มี = ยังไม่ระบุตำแหน่ง ไม่คิดงานขุด
            if bot is not None and self.GL - bot > 0:
                depth = self.GL - bot
                if depth <= self.s["excav_deep"]:
                    exc = B * L * depth
                    self.add("1.1.2", "excav_retain", "งานขุดดินฐานรากและถมคืน (ลึกไม่เกิน 2.00 ม.) (กำแพงกันดิน)", "ลบ.ม.", exc, w["id"],
                             waste=self.s["excav_waste"], task="footing",
                             calc=f"ฐาน {B:g} × ยาว {L:g} × ลึก {depth:.2f} = {exc:.2f} ลบ.ม. (+ เผื่อ {self.s['excav_waste'] * 100:g}%)")
                else:
                    mg = self.s["excav_deep_margin"]
                    exc = (B + 2 * mg) * (L + 2 * mg) * (depth + self.s["sand_thk"] + self.s["lean_thk"])
                    self.add("1.1.2", "excav_deep_retain", "งานขุดดินฐานรากและถมคืน (ลึกเกิน 2.00 ม.) (กำแพงกันดิน)", "ลบ.ม.", exc, w["id"], task="footing",
                             calc=f"({B:g}+{2 * mg:g}) × ({L:g}+{2 * mg:g}) × ลึก {depth + self.s['sand_thk'] + self.s['lean_thk']:.2f} = {exc:.2f} ลบ.ม.")
                    self.note(f"กำแพงกันดิน {w['id']} ขุดลึก {depth:.2f} ม. เกิน 2 ม. — พิจารณาค่าใช้จ่ายพิเศษระบบป้องกันดินพัง (ปร.3)")
            self.add("1.1.4", "sand_base_retain", "ทรายรองใต้ฐานราก (บดอัดแรงคน) (กำแพงกันดิน)", "ลบ.ม.", B * L * self.s["sand_thk"], w["id"],
                     waste=self.s["sand_waste"], task="footing")
            self.add("1.1.12", "lean_conc_retain", "คอนกรีตหยาบรองใต้ฐานราก (1:3:5) (กำแพงกันดิน)", "ลบ.ม.", B * L * self.s["lean_thk"], w["id"], task="footing")
            name, key = self.conc_name(w.get("material"))
            vol = L * (hw * tw + B * tb)
            self.add("1.1.12", key + "_retain", name + " (กำแพงกันดิน)", "ลบ.ม.", vol, w["id"], task="footing",
                     calc=f"ยาว {L:g} × (ผนัง {hw:.2f}×{tw:g} + ฐาน {B:g}×{tb:g}) = {vol:.3f} ลบ.ม.")
            fw = L * (2 * hw + 2 * tb) + 2 * (hw * tw + B * tb)
            self.add("1.1.7", "formwork_retain", "ไม้แบบหล่อคอนกรีต (กำแพงกันดิน)", "ตร.ม.", fw, w["id"], task="footing",
                     calc=f"ผนัง 2 ด้าน {2 * hw:.2f} + ขอบฐาน {2 * tb:g} × ยาว {L:g} + หัวท้าย = {fw:.2f} ตร.ม.")
            rb = w.get("rebar") or {}
            if rb.get("wall"):
                dia, sp = rb["wall"]; n = math.floor(L / sp) + 1
                self.rebar(w["id"], dia, n * (H - 2 * c), f"เหล็กยืนผนัง @{sp:g} {n} เส้น × {H - 2 * c:.2f} ม.")
            if rb.get("base"):
                dia, sp = rb["base"]; n = math.floor(L / sp) + 1
                self.rebar(w["id"], dia, n * (B - 2 * c), f"เหล็กฐาน @{sp:g} {n} เส้น × {B - 2 * c:.2f} ม.")
            if rb.get("temp"):
                dia, sp = rb["temp"]; n = (math.floor(hw / sp) + 1) + (math.floor(B / sp) + 1)
                self.rebar(w["id"], dia, n * (L - 2 * c), f"เหล็กกันร้าวตามยาว @{sp:g} ผนัง {math.floor(hw / sp) + 1} + ฐาน {math.floor(B / sp) + 1} เส้น × {L - 2 * c:.2f} ม.")
            self.src_task.setdefault(w["id"], "footing")

    # ------------------------------------------------------------ เพลทหัวเสาและสลักยึด (ผลออกแบบ)
    def _plates(self):
        for pid, e in (self.design.get("plates") or {}).items():
            if e.get("plate"):
                B, L, t = e["plate"]; kg = B * L * t * 7.85e-6
                self.add("1.1.10", f"plate_{t:g}", f"เหล็กแผ่น หนา {t:g} มม.", "กก.", kg, pid, task="roof_frame",
                         calc=f"{B:g}×{L:g}×{t:g} มม. × 7,850 กก./ลบ.ม. = {kg:.2f} กก.")
            if e.get("bolts"):
                n, dia, La = e["bolts"]
                self.add("1.1.10", f"abolt_{dia:g}_{La:g}", f"สลักเกลียวยึด (Anchor bolt) Ø {dia:g} มม. ฝังลึก {La:g} ซม.", "ตัว",
                         int(n), pid, count=True, task="roof_frame")

    # ------------------------------------------------------------ เหล็กเสริมรวม
    def _rebar_items(self):
        total_kg = 0.0
        all_parts = {}
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
            it["by_src"] = {mid: ln * kg_per_m(dia) for mid, ln in per.items()}
            it["calc"] = {mid: list(self.rebar_calc.get((dia, mid), [])) + [f"รวม {ln:.2f} ม. × {kg_per_m(dia):.3f} = {ln*kg_per_m(dia):.2f} กก."]
                          for mid, ln in per.items()}
            it["parts"] = {}
            for mid, ln in per.items():
                t = self.src_task.get(mid, "rebar")
                pt = it["parts"].setdefault(t, {"q": 0.0, "from": []})
                pt["q"] += ln * kg_per_m(dia)
                pt["from"].append(mid)
                pt_all = all_parts.setdefault(t, {"q": 0.0, "from": []})
                pt_all["q"] += ln * kg_per_m(dia) * (1 + w)
            total_kg += kg * (1 + w)
        if total_kg:
            it = self.add("1.1.9", "tie_wire", "ลวดผูกเหล็ก", "กก.", total_kg * self.s["tie_wire_per_ton"] / 1000.0, None,
                          task="rebar", note="30 กก. ต่อเหล็กเสริม 1,000 กก. (คิดจากน้ำหนักรวมเผื่อ)")
            f = self.s["tie_wire_per_ton"] / 1000.0
            it["parts"] = {t: {"q": v["q"] * f, "from": []} for t, v in all_parts.items()}
            wsum = {}
            for dia, per in self.rebar_len.items():
                for mid, ln in per.items():
                    wsum[mid] = wsum.get(mid, 0) + ln * kg_per_m(dia) * (1 + REBAR_WASTE.get(dia, 0.15)) * f
            it["by_src"] = wsum; it["from"] = list(wsum)

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
            if it.get("pct"):
                row["price_ref"] = {"kind": "pct", **it["pct"]}
            if it.get("estimated"):
                row["status"] = "assumed"
            if it.get("by_src"):
                row["by_src"] = {k: round(v, 4) for k, v in it["by_src"].items() if v}
            if it.get("calc"):
                row["calc"] = it["calc"]
            if it.get("spec"):      # ชนิด/ขนาด ให้เว็บ (lib/pricemap.js) ผูกราคาตอนเปิด
                row["spec"] = it["spec"]
            parts = it.get("parts") or {}
            tot = sum(v["q"] for v in parts.values())
            if tot > 0:
                row["by_task"] = {t: {"share": round(v["q"] / tot, 4), "from": v["from"]}
                                  for t, v in sorted(parts.items(), key=lambda kv: -kv[1]["q"])}
                row["task"] = next(iter(row["by_task"]))
            base = re.sub(r"_(retain|stair)$", "", it["key"])   # กำแพงกันดิน/บันได ใช้ราคาเดียวกับรายการปกติ
            pr = (price_map or {}).get(it["key"]) or ((price_map or {}).get(base) if base != it["key"] else None)
            if pr is None and price_map:
                pr = next((v for k, v in price_map.items() if k.endswith("*") and it["key"].startswith(k[:-1])), None)
            if it.get("wage_code"):
                pr = {"kind": "wage", "code": it["wage_code"]}
            if pr and not it.get("pct"):
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
    tk = Takeoff(m, settings).run()
    items, notes, used = tk.result(pm), tk.notes, tk.s
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
        m["quantities"] = {"model_hash": qty_hash(m), "base_hash": qty_base_hash(m), "design_hash": design_hash(m), "stale": False, "generated_by": "tools/takeoff.py",
                           "settings": used, "notes": notes, "items": items, "routes": tk.routes}
        m.setdefault("history", []).append({"at": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
                                            "by": "tools/takeoff.py", "sections": ["quantities"]})
        json.dump(m, open(a.file, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"\nเขียน quantities {len(items)} รายการลง {a.file}")


if __name__ == "__main__":
    main()
