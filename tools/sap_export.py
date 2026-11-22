"""แปลง .bm.json เป็นไฟล์ข้อความ SAP2000 (.s2k) สำหรับ File > Import > SAP2000 .s2k

หน่วยในไฟล์: kgf, m, C (ตรงกับ .bm.json)
ชื่อจุด/ชิ้นส่วน/หน้าตัด/วัสดุ ใช้ id เดิมใน .bm.json เพื่อให้อ่านผลกลับได้ตรงตัว

ขอบเขตรุ่นนี้ (0.1)
  - จุด, ชิ้นส่วน (เสา คาน คานคอดิน จันทัน เหล็กรูปพรรณ), หน้าตัด RC สี่เหลี่ยม/กลม และเหล็กขึ้นรูปเย็นตัว C มีขอบ
  - วัสดุคอนกรีต (E = 15100 sqrt(fc) ksc) และเหล็ก (E = 2.04e6 ksc)
  - จุดรองรับจากฐานราก (fixed/pinned), การปลดแรงปลายชิ้นส่วน, เส้นกริด
  - กลุ่มน้ำหนัก + load case แบบ linear static, น้ำหนักบนชิ้นส่วน, ชุดผสม
  - น้ำหนักแผ่บนหลังคา (area_loads ที่ target เป็นหลังคา) แปลงเป็นน้ำหนักแผ่บนแป (ถ้ามีแปในโมเดล) หรือจันทัน
    ตามความกว้างรับน้ำหนัก; roof_live คิดต่อพื้นที่ราบ กลุ่มอื่นคิดต่อพื้นที่ลาด
  - ชิ้นส่วนที่มีจุดต่ออื่นอยู่กลางช่วง (จันทันที่แปวางทับ) ตั้ง auto mesh ที่จุดต่อ
  - พื้นวางบนดิน (kind=ground) ไม่ส่งเข้า SAP; พื้นลอยยังไม่รองรับ (เตือน)
  - M4 ก้อน 1 (22 พ.ย. 2569 · ท12):
    · ไม่ส่งเสาเอ็น/ทับหลัง (stiffener, lintel) — ไม่ใช่โครงสร้างหลัก น้ำหนักรวมอยู่ในน้ำหนักผนัง
    · ท่อเหล็กกล่อง (box) → Box/Tube · 2C ประกบคู่ (ปากชนปาก = กล่องปิด) → General ใส่ค่าหน้าตัดที่คำนวณเอง
      (ทั้งสองแบบใช้วัสดุเหล็ก "<วัสดุ>-ST" ชนิด Steel ที่ fy เดียวกัน — SAP ไม่ให้วัสดุ ColdFormed กับหน้าตัดชนิดนี้)
    · แปในโมเดลวางบนหลังจันทัน (ตำแหน่งจริง) → ตอนส่งออกลดแปลงมาที่แนวแกนจันทัน และสร้างจุดต่อที่จุดตัดทุกจันทัน
      (แป/จันทันแบ่งช่วงที่จุดนั้นด้วย auto mesh — ชื่อชิ้นส่วนเดิม อ่านผลกลับได้ตรงตัว)
    · ตรวจชิ้นส่วนที่ไม่ต่อถึงฐานราก (กลุ่มลอย) แล้วเตือน
    · วัสดุเหล็กที่แบบไม่ระบุเกรด: fy 2,450 ksc (SSC400 มอก. 1228) + เตือนเป็นค่าสมมติ

ทดสอบกับ SAP2000 v23.3.1 แล้ว (18 ต.ค. 2569): import ไม่มี error, รันได้, แรงปฏิกิริยารวมตรงกับน้ำหนักที่ใส่
  (DL 13,643.96 = คอนกรีต 5.548 ลบ.ม. + C100 73.9 + C75 254.9 กก.; SDL 11,804.1 = ผนัง 11,232 + หลังคา 572.1; LR 2,688)

รัน: python tools/sap_export.py model.bm.json [-o out.s2k] [--version 23.0.0]
"""
import argparse, json, math, os, sys
from datetime import datetime
from collections import defaultdict

PATTERN_TYPE = {"dead": "Dead", "super_dead": "Super Dead", "live": "Live", "roof_live": "Roof Live",
                "wind": "Wind", "seismic": "Quake", "other": "Other"}
E_STEEL = 2.04e6  # ksc
FY_DEFAULT = 2450  # ksc — เหล็กขึ้นรูปเย็น SSC400 (มอก. 1228) เมื่อแบบไม่ระบุเกรด
SAP_SKIP = {"stiffener": "เสาเอ็น", "lintel": "ทับหลัง/คานเอ็น"}
KSC = 1e4         # ksc -> kgf/m2
G = 9.80665



CUBE_CYL = [(180, 140), (210, 180), (240, 210), (280, 240), (320, 280), (350, 300), (380, 320), (400, 350)]   # คู่ค่าในบัญชีราคาคอนกรีตผสมเสร็จ (เหมือน lib/rcwsd.js)


def fc_cyl(mt):
    """f'c ทรงกระบอก จากวัสดุคอนกรีต (specimen ไม่ระบุ = ลูกบาศก์)"""
    fc = float(mt.get("fc") or 240)
    if mt.get("specimen") == "cylinder":
        return fc
    T = CUBE_CYL
    if fc <= T[0][0]:
        return round(fc * T[0][1] / T[0][0])
    for (a0, b0), (a1, b1) in zip(T, T[1:]):
        if fc <= a1:
            return round(b0 + (b1 - b0) * (fc - a0) / (a1 - a0))
    return round(fc * T[-1][1] / T[-1][0])

def q(s):
    """ครอบด้วย " ถ้ามีช่องว่าง (รูปแบบ s2k)"""
    s = str(s)
    return '"%s"' % s if (" " in s or s == "") else s


def num(x):
    if isinstance(x, bool):
        return "Yes" if x else "No"
    if isinstance(x, (int, float)):
        if x == int(x) and abs(x) < 1e15:
            return str(int(x))
        return "%.10g" % x
    return q(x)


def row(**kw):
    return "   " + "   ".join("%s=%s" % (k, num(v)) for k, v in kw.items())


def parse_cf_name(name):
    """C100x50x20x2.3 / C-100x50x20x2.3 -> (d, b, lip, t) เมตร"""
    import re
    g = re.search(r"(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)", name)
    if not g:
        raise ValueError("อ่านขนาดหน้าตัด C จากชื่อ %r ไม่ได้" % name)
    d, b, lip, t = [float(v) / 1000 for v in g.groups()]
    return d, b, lip, t


def double_c(s):
    """หน้าตัด 2C ประกบคู่ → (h, b, lip, t) ของ C ตัวเดียว (เมตร) หรือ None"""
    import re
    for txt in (s.get("id", ""), s.get("name", "")):
        g = re.match(r"\s*2C[-\s]?(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)", txt, re.I)
        if g:
            return tuple(float(v) / 1000 for v in g.groups())
    return None


def double_c_props(h, b, c, t):
    """C มีขอบ 2 ตัวประกบปากชนปาก (ปลายปีกชนกัน ขอบพับอยู่ด้านในกล่อง) — กล่องกว้าง 2b สูง h
    วิธี: แบ่งเป็นแผ่นสี่เหลี่ยมบาง (ไม่คิดมุมโค้ง) · แกน 3 = แนวนอน (I33 = ∫y²dA ดัดในระนาบตั้ง) · แกน 2 = แนวตั้ง
    J: กล่องปิดเซลล์เดียว (Bredt) J = 4·Am²·t / ความยาวเส้นรอบรูปกลางแผ่น — ถือว่าปลายปีกเชื่อมติดกันตลอด
    AS2 = เอว 2 แผ่น (h·t·2) · AS3 = ปีกบน-ล่างตลอดความกว้าง (2b·t·2)"""
    R = []   # (x0, x1, y0, y1) — ตัว C ซ้าย (ปากหันขวา) แล้วสะท้อนเป็นตัวขวา
    R.append((-b, -b + t, -h / 2, h / 2))                 # เอว
    R.append((-b + t, 0, h / 2 - t, h / 2))               # ปีกบน
    R.append((-b + t, 0, -h / 2, -h / 2 + t))             # ปีกล่าง
    R.append((-t, 0, h / 2 - c, h / 2 - t))               # ขอบพับบน (ชี้ลง)
    R.append((-t, 0, -h / 2 + t, -h / 2 + c))             # ขอบพับล่าง (ชี้ขึ้น)
    R += [(-x1, -x0, y0, y1) for x0, x1, y0, y1 in R]
    A = sum((x1 - x0) * (y1 - y0) for x0, x1, y0, y1 in R)
    I33 = sum((x1 - x0) * (y1 ** 3 - y0 ** 3) / 3 for x0, x1, y0, y1 in R)
    I22 = sum((y1 - y0) * (x1 ** 3 - x0 ** 3) / 3 for x0, x1, y0, y1 in R)
    def zpl(lo, hi):   # ∫|s| ds ของช่วง [lo, hi]
        f = lambda v: v * abs(v) / 2
        return f(hi) - f(lo)
    Z33 = sum((x1 - x0) * zpl(y0, y1) for x0, x1, y0, y1 in R)
    Z22 = sum((y1 - y0) * zpl(x0, x1) for x0, x1, y0, y1 in R)
    W, H = 2 * b - t, h - t
    J = 4 * (W * H) ** 2 * t / (2 * (W + H))
    return {"t3": h, "t2": 2 * b, "A": A, "I33": I33, "I22": I22, "J": J, "AS2": 2 * h * t, "AS3": 2 * (2 * b) * t,
            "S33": I33 / (h / 2), "S22": I22 / b, "Z33": Z33, "Z22": Z22,
            "R33": math.sqrt(I33 / A), "R22": math.sqrt(I22 / A)}


class Exporter:
    def __init__(self, m, version="23.0.0"):
        self.m, self.version = m, version
        self.warn = []
        self.nodes = {n["id"]: n for n in m.get("nodes", [])}
        self.members = {}
        skipped = defaultdict(int)
        for x in m.get("members", []):
            if x["type"] in SAP_SKIP:
                skipped[x["type"]] += 1
            else:
                self.members[x["id"]] = x
        for t, k in skipped.items():
            self.warn.append("ไม่ส่ง%s %d ชิ้นเข้า SAP (ไม่ใช่โครงสร้างหลัก — น้ำหนักคิดรวมในผนัง)" % (SAP_SKIP[t], k))
        self.tables = []
        self.extra_mats = {}     # วัสดุเหล็กที่สร้างให้หน้าตัด Box/Tube/General: id ใหม่ -> วัสดุต้นทาง
        self.sec_mat = {}
        self.extra_joints = set()
        self._snap_purlins()
        self._oh_warned = set()
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from validate import model_hash
        self.model_hash = model_hash(m)

    def table(self, name, rows):
        if rows:
            self.tables.append((name, rows))

    # ---------- geometry ----------
    def _grids(self):
        rows = []
        for g in self.m.get("grids", []):
            rows.append(row(CoordSys="GLOBAL", AxisDir=g["axis"], GridID=g["name"], XRYZCoord=g["coord"],
                            LineType="Primary", LineColor="Gray8Dark", Visible="Yes", BubbleLoc="End"))
        for lv in self.m.get("levels", []):
            rows.append(row(CoordSys="GLOBAL", AxisDir="Z", GridID=lv["name"], XRYZCoord=lv["z"],
                            LineType="Primary", LineColor="Gray8Dark", Visible="Yes", BubbleLoc="End"))
        self.table("GRID LINES", rows)

    def _joints(self):
        used = set()
        for x in self.members.values():
            used.update((x["i"], x["j"]))
        ends = set(used)
        used |= self.extra_joints
        rows = []
        for nid, n in self.nodes.items():
            if nid not in used:
                continue
            # จุดที่ไม่ใช่ปลายชิ้นส่วน (จุดกลางคานที่ผูก Body / จุดตัดแป) ต้องเป็น SpecialJt ไม่งั้น SAP ลบทิ้งตอน import
            sp = "Yes" if nid in self.extra_joints and nid not in ends else "No"
            rows.append(row(Joint=nid, CoordSys="GLOBAL", CoordType="Cartesian", XorR=n["x"], Y=n["y"], Z=n["z"],
                            SpecialJt=sp, GlobalX=n["x"], GlobalY=n["y"], GlobalZ=n["z"]))
        self.used_nodes = used
        self.table("JOINT COORDINATES", rows)

    def _restraints(self):
        rows = []
        for s in self.m.get("supports", []):
            if s["node"] not in self.used_nodes:
                self.warn.append("ฐานราก %s: จุด %s ไม่ต่อกับชิ้นส่วนใด" % (s["id"], s["node"]))
                continue
            fixed = s.get("fixity", "fixed") == "fixed"
            r = "Yes" if fixed else "No"
            rows.append(row(Joint=s["node"], U1="Yes", U2="Yes", U3="Yes", R1=r, R2=r, R3=r))
        self.table("JOINT RESTRAINT ASSIGNMENTS", rows)

    def _frames(self):
        conn, sec, rel, ang = [], [], [], []
        for x in self.members.values():
            a, b = self.nodes[x["i"]], self.nodes[x["j"]]
            L = math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]))
            if L < 1e-6:
                self.warn.append("ชิ้นส่วน %s ยาวศูนย์ ข้าม" % x["id"])
                continue
            conn.append(row(Frame=x["id"], JointI=x["i"], JointJ=x["j"], IsCurved="No", Length=round(L, 6),
                            CentroidX=(a["x"] + b["x"]) / 2, CentroidY=(a["y"] + b["y"]) / 2,
                            CentroidZ=(a["z"] + b["z"]) / 2))
            s = self.sections[x["section"]]
            sec.append(row(Frame=x["id"], SectionType=self.sap_shape(s), AutoSelect="N.A.",
                           AnalSect=x["section"], MatProp="Default"))
            r = x.get("releases")
            if r:
                kw = {"Frame": x["id"]}
                for end, tag in (("i", "I"), ("j", "J")):
                    for c in ("P", "V2", "V3", "T", "M2", "M3"):
                        kw[c + tag] = "Yes" if c in r.get(end, []) else "No"
                kw["PartialFix"] = "No"
                rel.append(row(**kw))
            if x.get("angle"):
                ang.append(row(Frame=x["id"], Angle=x["angle"], MirrorAbt2="No", MirrorAbt3="No", AdvanceAxes="No"))
        self.table("CONNECTIVITY - FRAME", conn)
        self.table("FRAME SECTION ASSIGNMENTS", sec)
        self.table("FRAME RELEASE ASSIGNMENTS 1 - GENERAL", rel)
        self.table("FRAME LOCAL AXES ASSIGNMENTS 1 - TYPICAL", ang)

    # ---------- properties ----------
    def _materials(self):
        used = {x.get("material") for x in self.members.values()}
        gen, mech, conc, steel, cf = [], [], [], [], []
        for mt in self.m.get("materials", []):
            if mt["id"] not in used:
                continue
            k = mt["kind"]
            if k == "concrete":
                fc = fc_cyl(mt)   # SAP ใช้กำลังทรงกระบอก — วัสดุในโมเดลค่าตั้งต้นเป็นลูกบาศก์ (Earth 4 พ.ย. 2569)
                E = mt.get("E") or 15100 * math.sqrt(fc)
                w = mt.get("unit_weight", 2400)
                gen.append(row(Material=mt["id"], Type="Concrete", Grade="fc %g ksc" % fc, SymType="Isotropic",
                               TempDepend="No", Color="Gray8Dark", Notes="from bm.json"))
                mech.append(row(Material=mt["id"], UnitWeight=w, UnitMass=round(w / G, 4), E1=E * KSC,
                                G12=round(E * KSC / 2.4, 2), U12=0.2, A1=9.9e-6))
                conc.append(row(Material=mt["id"], Fc=fc * KSC, eFc=fc * KSC, LtWtConc="No", SSCurveOpt="Mander",
                                SSHysType="Takeda", SFc=0.00221914, SCap=0.005, FinalSlope=-0.1,
                                FAngle=0, DAngle=0, CoupModType="Modified Darwin-Pecknold"))
                if not mt.get("E"):
                    self.warn.append("วัสดุ %s: E = 15100√f'c = %.0f ksc (คำนวณ)" % (mt["id"], E))
            elif k in ("steel", "cold_formed"):
                fy = mt.get("fy")
                if not fy:
                    fy = FY_DEFAULT
                    self.warn.append("วัสดุ %s: แบบไม่ระบุ fy — ใช้ %d ksc (SSC400 มอก. 1228) เป็นค่าสมมติ" % (mt["id"], fy))
                fu = mt.get("fu") or {"SSC400": 4100, "SS400": 4100, "SM520": 5300}.get(mt.get("grade"), 4100)
                E = mt.get("E") or E_STEEL
                gen.append(row(Material=mt["id"], Type=("ColdFormed" if k == "cold_formed" else "Steel"),
                               Grade=mt.get("grade", mt["id"]), SymType="Isotropic", TempDepend="No", Color="Red", Notes="from bm.json"))
                mech.append(row(Material=mt["id"], UnitWeight=7850, UnitMass=round(7850 / G, 4), E1=E * KSC,
                                G12=round(E * KSC / 2.6, 2), U12=0.3, A1=1.17e-5))
                if k == "cold_formed":   # ตาราง 03D ตาม SAP2000 v23 (ตรวจจากไฟล์ที่ SAP export)
                    cf.append(row(Material=mt["id"], Fy=fy * KSC, Fu=fu * KSC, SSHysType="Kinematic",
                                  CoupModType="Von Mises"))
                else:
                    steel.append(row(Material=mt["id"], Fy=fy * KSC, Fu=fu * KSC, EffFy=fy * 1.1 * KSC,
                                     EffFu=fu * 1.1 * KSC, SSCurveOpt="Simple", SSHysType="Kinematic", SHard=0.02,
                                     SMax=0.14, SRup=0.2, FinalSlope=-0.1))
                if not mt.get("fu"):
                    self.warn.append("วัสดุ %s: Fu = %s ksc (ค่าตามเกรด)" % (mt["id"], fu))
            else:
                self.warn.append("วัสดุ %s ชนิด %s ไม่ส่งเข้า SAP" % (mt["id"], k))
        mats = {mt["id"]: mt for mt in self.m.get("materials", [])}
        for nid_, src in self.extra_mats.items():   # วัสดุเหล็ก (Steel) ของหน้าตัด Box/Tube / General
            mt = mats.get(src, {})
            fy = mt.get("fy") or FY_DEFAULT
            fu = mt.get("fu") or {"SSC400": 4100, "SS400": 4100, "SM520": 5300}.get(mt.get("grade"), 4100)
            E = mt.get("E") or E_STEEL
            gen.append(row(Material=nid_, Type="Steel", Grade=mt.get("grade", src), SymType="Isotropic", TempDepend="No",
                           Color="Red", Notes="from bm.json %s (tube/general)" % src))
            mech.append(row(Material=nid_, UnitWeight=7850, UnitMass=round(7850 / G, 4), E1=E * KSC,
                            G12=round(E * KSC / 2.6, 2), U12=0.3, A1=1.17e-5))
            steel.append(row(Material=nid_, Fy=fy * KSC, Fu=fu * KSC, EffFy=fy * 1.1 * KSC,
                             EffFu=fu * 1.1 * KSC, SSCurveOpt="Simple", SSHysType="Kinematic", SHard=0.02,
                             SMax=0.14, SRup=0.2, FinalSlope=-0.1))
        self.table("MATERIAL PROPERTIES 01 - GENERAL", gen)
        self.table("MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES", mech)
        self.table("MATERIAL PROPERTIES 03A - STEEL DATA", steel)
        self.table("MATERIAL PROPERTIES 03B - CONCRETE DATA", conc)
        self.table("MATERIAL PROPERTIES 03D - COLD FORMED DATA", cf)

    def _steel_mat(self, mat):
        mt = next((x for x in self.m.get("materials", []) if x["id"] == mat), {})
        if mt.get("kind") == "steel":
            return mat
        nid_ = "%s-ST" % mat
        self.extra_mats[nid_] = mat
        return nid_

    def _snap_purlins(self):
        """แปที่วางบนหลังจันทัน → ย้ายแนวแกนลงมาที่แนวแกนจันทัน + สร้างจุดต่อที่จุดตัด (เฉพาะใน .s2k)"""
        purl = [x for x in self.members.values() if x["type"] == "purlin"]
        raf = [x for x in self.members.values() if x["type"] == "rafter"]
        if not purl or not raf:
            return
        P = lambda nid_: self.nodes[nid_]
        n_snap = 0
        for x in purl:
            a, b = P(x["i"]), P(x["j"])
            hits = []   # (t ตามแป, จุดบนแกนจันทัน)
            for r in raf:
                c, d = P(r["i"]), P(r["j"])
                # จุดตัดในแปลน (xy) ของเส้น a-b กับ c-d
                d1 = (b["x"] - a["x"], b["y"] - a["y"]); d2 = (d["x"] - c["x"], d["y"] - c["y"])
                den = d1[0] * d2[1] - d1[1] * d2[0]
                if abs(den) < 1e-12:
                    continue
                ex, ey = c["x"] - a["x"], c["y"] - a["y"]
                t = (ex * d2[1] - ey * d2[0]) / den
                u = (ex * d1[1] - ey * d1[0]) / den
                if -1e-6 <= t <= 1 + 1e-6 and -1e-6 <= u <= 1 + 1e-6:
                    hits.append((t, (c["x"] + u * d2[0], c["y"] + u * d2[1], c["z"] + u * (d["z"] - c["z"]))))
            if len(hits) < 2:
                self.warn.append("แป %s: ตัดจันทันน้อยกว่า 2 ตัว — ส่งตามตำแหน่งเดิม (ไม่ต่อกับจันทัน)" % x["id"])
                continue
            hits.sort()
            # แนวแกนใหม่ผ่านจุดตัดแรกและสุดท้าย (แปตรง) — ตรวจว่าจุดตัดอื่นอยู่บนแนวนี้
            (t0, p0), (t1, p1) = hits[0], hits[-1]
            if t1 - t0 < 1e-6:
                self.warn.append("แป %s: ตัดจันทันจุดเดียว — ส่งตามตำแหน่งเดิม" % x["id"])
                continue
            def at(t):
                k = (t - t0) / (t1 - t0)
                return tuple(p0[i] + k * (p1[i] - p0[i]) for i in range(3))
            bad = max(math.dist(at(t), p) for t, p in hits)
            if bad > 0.005:
                self.warn.append("แป %s: จุดตัดจันทันไม่อยู่ในแนวเดียวกัน (คลาด %.1f มม.) — ส่งตามตำแหน่งเดิม" % (x["id"], bad * 1000))
                continue
            ni, nj = "%s-SI" % x["id"], "%s-SJ" % x["id"]
            for nn, t in ((ni, 0.0), (nj, 1.0)):
                p = at(t)
                self.nodes[nn] = {"id": nn, "x": round(p[0], 6), "y": round(p[1], 6), "z": round(p[2], 6)}
            for k, (t, p) in enumerate(hits):
                if t < 1e-4 or t > 1 - 1e-4:
                    continue
                jn = "%s-X%02d" % (x["id"], k + 1)
                self.nodes[jn] = {"id": jn, "x": round(p[0], 6), "y": round(p[1], 6), "z": round(p[2], 6)}
                self.extra_joints.add(jn)
            self.members[x["id"]] = dict(x, i=ni, j=nj)
            n_snap += 1
        if n_snap:
            self.warn.append("แป %d เส้น: ลดแนวแกนลงมาที่แนวแกนจันทันและต่อที่จุดตัด (ระยะเยื้องบนหลังจันทันไม่คิดใน SAP)" % n_snap)

    def _half(self, x):
        """(ครึ่งความลึก, ครึ่งความกว้าง) ของหน้าตัด (ม.)"""
        sc = next((q for q in self.m.get("sections", []) if q["id"] == x["section"]), {})
        d = sc.get("dims") or {}
        h = d.get("h") or sc.get("h") or sc.get("d") or 0.1
        b = d.get("b") or sc.get("b") or sc.get("d") or h
        return h / 2, b / 2

    def _contacts(self):
        """จุดที่ปลายชิ้นส่วนวางชน/วางบนชิ้นอื่น (โมเดลเก็บตำแหน่งจริง เช่น หัวเสา +3.30 ใต้อะเสแนวแกน +3.35)
        → สร้างจุดบนแนวแกนชิ้นที่รองรับ แล้วผูกกับปลายชิ้นด้วย Body constraint (ข้อต่อแข็ง = ไม่มีการปลดแรง ตามที่ Earth ใช้)
        เกณฑ์ชน: ห่างในแปลน ≤ ครึ่งกว้างชิ้นรองรับ + ครึ่งกว้างชิ้นที่วาง + 6 มม.
                 ห่างแนวตั้ง ≤ ครึ่งลึกชิ้นรองรับ + ครึ่งลึกชิ้นที่วาง (ปลายเสา/ชิ้นตั้ง = 0 เพราะจุดอยู่ที่ผิวปลาย) + 6 มม.
        แปไม่อยู่ในเกณฑ์นี้ (จัดการใน _snap_purlins)"""
        TOL = 0.006
        mem = [x for x in self.members.values() if x["type"] != "purlin"]
        geo = {}
        for x in mem:
            a, b = self.nodes[x["i"]], self.nodes[x["j"]]
            A, B = (a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"])
            L = math.dist(A, B)
            if L < 1e-6:
                continue
            vert = abs(B[2] - A[2]) > 0.9 * L
            geo[x["id"]] = (A, B, L, vert, self._half(x))
        def on_axis(Q, g):
            A, B, L = g[0], g[1], g[2]
            t = sum((Q[k] - A[k]) * (B[k] - A[k]) for k in range(3)) / L
            return -1e-3 <= t <= L + 1e-3 and math.dist(Q, [A[k] + (B[k] - A[k]) * t / L for k in range(3)]) < 2e-3
        groups = defaultdict(set)    # จุดปลาย -> จุดบนแนวแกนที่ผูก
        made = {}
        def joint_at(p):
            for nid_, n in self.nodes.items():
                if abs(n["x"] - p[0]) < 1e-3 and abs(n["y"] - p[1]) < 1e-3 and abs(n["z"] - p[2]) < 1e-3:
                    return nid_
            k = (round(p[0], 3), round(p[1], 3), round(p[2], 3))
            if k not in made:
                nn = "CJ-%.3f_%.3f_%.3f" % k
                self.nodes[nn] = {"id": nn, "x": p[0], "y": p[1], "z": p[2]}
                self.extra_joints.add(nn)
                made[k] = nn
            return made[k]
        for x in mem:
            if x["id"] not in geo:
                continue
            _, _, _, vm, (hm, bm) = geo[x["id"]]
            for end in (x["i"], x["j"]):
                n = self.nodes[end]
                E = (n["x"], n["y"], n["z"])
                for y in mem:
                    if y is x or y["id"] not in geo or end in (y["i"], y["j"]):
                        continue
                    A, B, L, vs, (hs, bs) = geo[y["id"]]
                    if vs:   # ชิ้นรองรับเป็นแนวตั้ง (เสา): ปลายชิ้นอื่นชนข้างเสา
                        if not (min(A[2], B[2]) - TOL <= E[2] <= max(A[2], B[2]) + TOL):
                            continue
                        P = (A[0], A[1], E[2])
                        if math.hypot(E[0] - P[0], E[1] - P[1]) > max(hs, bs) + (0 if vm else hm) + TOL:
                            continue
                    else:
                        dx, dy = B[0] - A[0], B[1] - A[1]
                        ll = dx * dx + dy * dy
                        if ll < 1e-12:
                            continue
                        t = ((E[0] - A[0]) * dx + (E[1] - A[1]) * dy) / ll
                        if t < -1e-6 or t > 1 + 1e-6:
                            continue
                        P = (A[0] + t * dx, A[1] + t * dy, A[2] + t * (B[2] - A[2]))
                        dpl = math.hypot(E[0] - P[0], E[1] - P[1])
                        dz = abs(E[2] - P[2])
                        if dpl > bs + bm + TOL or dz > hs + (0 if vm else hm) + TOL:
                            continue
                        if dpl > bs + TOL and dz > TOL:   # ห่างทั้งแปลนและแนวตั้ง = ไม่ชนกันจริง
                            continue
                    if math.dist(E, P) < 1e-3:
                        continue   # อยู่บนแนวแกนแล้ว (auto mesh ต่อให้)
                    if any(on_axis(E, g) and on_axis(P, g) for g in geo.values()):
                        continue   # E กับ P อยู่บนแกนชิ้นเดียวกันอยู่แล้ว (เช่น 2 จุดบนเสาต้นเดียว) — ต่อกันแล้ว
                    groups[end].add(joint_at(P))
        rows_def, rows_as = [], []
        for k, (end, ps) in enumerate(sorted(groups.items()), 1):
            nm = "BC%03d" % k
            rows_def.append(row(Name=nm, CoordSys="GLOBAL", UX="Yes", UY="Yes", UZ="Yes", RX="Yes", RY="Yes", RZ="Yes"))
            for j in [end] + sorted(ps):
                rows_as.append(row(Joint=j, Constraint=nm, Type="Body"))
                self.extra_joints.add(j)
        self.body = groups
        self.table("CONSTRAINT DEFINITIONS - BODY", rows_def)
        self.table("JOINT CONSTRAINT ASSIGNMENTS", rows_as)
        if groups:
            self.warn.append("ปลายชิ้นส่วนวางชนชิ้นอื่น %d จุด: ผูกกับแนวแกนชิ้นที่รองรับด้วย Body constraint (BC001–BC%03d)" % (len(groups), len(groups)))

    def _islands(self):
        """กลุ่มชิ้นส่วนที่ไม่ต่อถึงจุดรองรับ (ต่อกันที่จุดปลาย หรือจุดที่อยู่กลางชิ้นอื่น)"""
        par = {}
        def f(a):
            par.setdefault(a, a)
            while par[a] != a:
                par[a] = par[par[a]]; a = par[a]
            return a
        def u(a, b):
            par[f(a)] = f(b)
        pts = {nid_: (n["x"], n["y"], n["z"]) for nid_, n in self.nodes.items() if nid_ in self.used_nodes}
        for x in self.members.values():
            u(x["i"], x["j"])
            a, b = pts[x["i"]], pts[x["j"]]
            L = math.dist(a, b)
            if L < 1e-6:
                continue
            for nid_, p in pts.items():
                t = sum((p[k] - a[k]) * (b[k] - a[k]) for k in range(3)) / L
                if 1e-3 < t < L - 1e-3 and math.dist(p, [a[k] + (b[k] - a[k]) * t / L for k in range(3)]) < 2e-3:
                    u(nid_, x["i"])
        for e, ps in getattr(self, "body", {}).items():
            for p in ps:
                u(e, p)
        sup = {f(s["node"]) for s in self.m.get("supports", []) if s["node"] in pts}
        lost = defaultdict(list)
        for x in self.members.values():
            r = f(x["i"])
            if r not in sup:
                lost[r].append(x["id"])
        for ids in lost.values():
            self.warn.append("ชิ้นส่วน %d ชิ้นไม่ต่อถึงฐานราก (SAP จะ unstable) เช่น %s" % (len(ids), ", ".join(sorted(ids)[:5])))

    def sap_shape(self, s):
        if s["kind"] == "rc_rect":
            return "Rectangular"
        if s["kind"] == "rc_circle":
            return "Circle"
        if s["kind"] == "cold_formed" and s.get("shape") == "lipped_C":
            return "Cold Formed C"
        if s["kind"] in ("cold_formed", "steel") and s.get("shape") == "box":
            return "General" if double_c(s) else "Box/Tube"
        raise ValueError("หน้าตัด %s ชนิด %s/%s ยังไม่รองรับ" % (s["id"], s["kind"], s.get("shape")))

    def _sections(self):
        self.sections = {s["id"]: s for s in self.m.get("sections", [])}
        mat_of = {}
        for x in self.members.values():
            mat_of.setdefault(x["section"], x.get("material"))
        rows, rc = [], []
        for sid, mat in mat_of.items():
            s = self.sections[sid]
            shape = self.sap_shape(s)
            if shape == "Rectangular":
                rows.append(row(SectionName=sid, Material=mat, Shape=shape, t3=s["h"], t2=s["b"],
                                Color="Cyan", FromFile="No", AMod=1, A2Mod=1, A3Mod=1, JMod=1, I2Mod=1, I3Mod=1,
                                MMod=1, WMod=1))
            elif shape == "Circle":
                rows.append(row(SectionName=sid, Material=mat, Shape=shape, t3=s["d"],
                                Color="Cyan", FromFile="No", AMod=1, A2Mod=1, A3Mod=1, JMod=1, I2Mod=1, I3Mod=1,
                                MMod=1, WMod=1))
            elif shape in ("Box/Tube", "General"):
                smat = self._steel_mat(mat)
                if shape == "Box/Tube":
                    d = s.get("dims") or {}
                    h, b, t = d.get("h") or s["h"], d.get("b") or s["b"], d.get("t")
                    rows.append(row(SectionName=sid, Material=smat, Shape=shape, t3=h, t2=b, tf=t, tw=t,
                                    Color="Yellow", FromFile="No", AMod=1, A2Mod=1, A3Mod=1, JMod=1, I2Mod=1,
                                    I3Mod=1, MMod=1, WMod=1))
                else:
                    P = double_c_props(*double_c(s))
                    rows.append(row(SectionName=sid, Material=smat, Shape=shape, t3=P["t3"], t2=P["t2"],
                                    Area=P["A"], TorsConst=P["J"], I33=P["I33"], I22=P["I22"], I23=0,
                                    AS2=P["AS2"], AS3=P["AS3"], S33=P["S33"], S22=P["S22"], Z33=P["Z33"],
                                    Z22=P["Z22"], R33=P["R33"], R22=P["R22"], Color="Yellow", FromFile="No",
                                    AMod=1, A2Mod=1, A3Mod=1, JMod=1, I2Mod=1, I3Mod=1, MMod=1, WMod=1,
                                    Notes="2C ประกบคู่ปากชนปาก (กล่องปิด) — ค่าจาก sap_export.double_c_props"))
                    self.warn.append("หน้าตัด %s: General A=%.3f ซม.² I33=%.1f I22=%.1f J=%.1f ซม.⁴ (คำนวณเอง — SAP ไม่ตรวจออกแบบเหล็กขึ้นรูปเย็นให้)"
                                     % (sid, P["A"] * 1e4, P["I33"] * 1e8, P["I22"] * 1e8, P["J"] * 1e8))
                self.sec_mat[sid] = smat
            else:
                d, b, lip, t = parse_cf_name(s["name"])
                rows.append(row(SectionName=sid, Material=mat, Shape=shape, t3=d, t2=b, tw=t,
                                Radius=0, LipDepth=lip, Color="Red", FromFile="No",
                                AMod=1, A2Mod=1, A3Mod=1, JMod=1, I2Mod=1, I3Mod=1, MMod=1, WMod=1))
        self.table("FRAME SECTION PROPERTIES 01 - GENERAL", rows)

    # ---------- loads ----------
    def _patterns(self):
        L = self.m.get("loads", {})
        pats, cases, assign = [], [], []
        self.pattern_kind = {}
        for p in L.get("patterns", []):
            self.pattern_kind[p["id"]] = p["kind"]
            t = PATTERN_TYPE[p["kind"]]
            kw = dict(LoadPat=p["id"], DesignType=t, SelfWtMult=1 if p.get("self_weight") else 0)
            if p["kind"] in ("wind", "seismic"):
                kw["AutoLoad"] = "None"
            pats.append(row(**kw))
            cases.append(row(Case=p["id"], Type="LinStatic", InitialCond="Zero", DesTypeOpt="Prog Det",
                             DesignType=t, DesActOpt="Prog Det", DesignAct="Non-Composite", AutoType="None",
                             RunCase="Yes", CaseStatus="Not Run"))
            assign.append(row(Case=p["id"], LoadType="Load pattern", LoadName=p["id"], LoadSF=1))
        self.table("LOAD PATTERN DEFINITIONS", pats)
        self.table("LOAD CASE DEFINITIONS", cases)
        self.table("CASE - STATIC 1 - LOAD ASSIGNMENTS", assign)

    def _dir(self, d):
        return {"gravity": ("GLOBAL", "Gravity"), "X": ("GLOBAL", "X"), "Y": ("GLOBAL", "Y"), "Z": ("GLOBAL", "Z"),
                "local1": ("Local", "1"), "local2": ("Local", "2"), "local3": ("Local", "3"),
                "gravity_proj": ("GLOBAL", "Gravity Projected")}[d]

    def _member_loads(self):
        dist, point = [], []
        L = self.m.get("loads", {})
        items = list(L.get("member_loads", [])) + self._roof_to_rafters()
        for ml in items:
            if ml["member"] not in self.members:
                self.warn.append("น้ำหนัก %s: ไม่พบชิ้นส่วน %s" % (ml["id"], ml["member"]))
                continue
            cs, d = self._dir(ml.get("dir", "gravity"))
            if ml["kind"] == "uniform":
                dist.append(row(Frame=ml["member"], LoadPat=ml["pattern"], CoordSys=cs, Type="Force", Dir=d,
                                DistType="RelDist", RelDistA=0, RelDistB=1, FOverLA=ml["value"],
                                FOverLB=ml["value"]))
            elif ml["kind"] == "trapezoid":
                a, b = ml.get("at", [0, None])
                Lm = self._len(ml["member"])
                b = Lm if b is None else b
                if b - a < 1e-4:
                    self.warn.append("น้ำหนัก %s: ช่วงยาวศูนย์ ข้าม" % ml["id"])
                    continue
                dist.append(row(Frame=ml["member"], LoadPat=ml["pattern"], CoordSys=cs, Type="Force", Dir=d,
                                DistType="AbsDist", AbsDistA=a, AbsDistB=b, FOverLA=ml["value"][0],
                                FOverLB=ml["value"][1]))
            elif ml["kind"] == "point":
                point.append(row(Frame=ml["member"], LoadPat=ml["pattern"], CoordSys=cs, Type="Force", Dir=d,
                                 DistType="AbsDist", AbsDist=ml.get("at", 0), Force=ml["value"]))
        self.table("FRAME LOADS - DISTRIBUTED", dist)
        self.table("FRAME LOADS - POINT", point)

    def _len(self, mid):
        x = self.members[mid]
        a, b = self.nodes[x["i"]], self.nodes[x["j"]]
        return math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]))

    def _roof_to_rafters(self):
        """area_loads บนหลังคา -> น้ำหนักแผ่บนแป (ถ้ามีแปในโมเดล) หรือจันทัน
        แป: กว้างรับ = กึ่งกลางระหว่างแปข้างเคียง ปลายถึงชายคา/สัน (วัดราบ)
            roof_live คิดต่อพื้นที่ราบ, กลุ่มอื่นคิดต่อพื้นที่ลาด (หารด้วย cos มุมลาด)
        จันทัน: กว้างรับ = กึ่งกลางระหว่างจันทันข้างเคียง ปลายถึงขอบหลังคา
            roof_live ใช้ Gravity Projected, กลุ่มอื่น Gravity ตามความยาวจริง"""
        roofs = {r["id"]: r for r in self.m.get("roofs", [])}
        slabs = {s["id"]: s for s in self.m.get("slabs", [])}
        out = []
        for al in self.m.get("loads", {}).get("area_loads", []):
            for tgt in al["targets"]:
                if tgt in slabs:
                    if slabs[tgt].get("kind") == "ground":
                        continue
                    self.warn.append("น้ำหนัก %s บนพื้น %s: ยังไม่รองรับพื้นลอยใน SAP รุ่นนี้" % (al["id"], tgt))
                    continue
                r = roofs.get(tgt)
                if not r:
                    self.warn.append("น้ำหนัก %s: ไม่พบเป้าหมาย %s" % (al["id"], tgt))
                    continue
                if r["form"] not in ("gable", "shed"):
                    self.warn.append("หลังคา %s แบบ %s: ยังไม่แปลงน้ำหนักลงแป/จันทันอัตโนมัติ" % (tgt, r["form"]))
                    continue
                proj = self.pattern_kind.get(al["pattern"]) == "roof_live" or al.get("per") == "plan"
                if al.get("on") == "rafter":   # เช่น ฝ้าแขวนใต้จันทัน — ลงจันทันโดยตรง ไม่ผ่านแป
                    got = self._to_rafters(r, al, proj)
                else:
                    got = self._to_purlins(r, al, proj) or self._to_rafters(r, al, proj)
                if not got:
                    self.warn.append("หลังคา %s: ไม่พบแปหรือจันทันในโมเดล" % tgt)
                out += got
        return out

    def _in_outline(self, x, r):
        xs = [p[0] for p in r["outline"]]; ys = [p[1] for p in r["outline"]]
        out = []
        for nid in (x["i"], x["j"]):
            n = self.nodes[nid]
            out.append(min(xs) - 1e-6 <= n["x"] <= max(xs) + 1e-6 and min(ys) - 1e-6 <= n["y"] <= max(ys) + 1e-6)
        return all(out)

    def _to_purlins(self, r, al, proj):
        along = 0 if r.get("ridge", "X") == "X" else 1      # แปขนานสัน
        k_c = "yx"[along]                                     # พิกัดที่คงที่ตามแนวแป
        pur = [x for x in self.members.values() if x["type"] == "purlin" and self._in_outline(x, r)
               and abs(self.nodes[x["i"]][k_c] - self.nodes[x["j"]][k_c]) < 0.01]
        if not pur:
            return []
        cs = [p[1 - along] for p in r["outline"]]
        lo, hi = min(cs), max(cs)
        groups = ([(lo, (lo + hi) / 2), ((lo + hi) / 2, hi)] if r["form"] == "gable" else [(lo, hi)])
        cosp = math.cos(math.radians(r["pitch"]))
        out = []
        for g0, g1 in groups:
            mine = [x for x in pur if g0 - 1e-6 <= self.nodes[x["i"]][k_c] <= g1 + 1e-6]
            pos = sorted({round(self.nodes[x["i"]][k_c], 6) for x in mine})
            trib = {}
            for k, p in enumerate(pos):
                left = g0 if k == 0 else (pos[k - 1] + p) / 2
                right = g1 if k == len(pos) - 1 else (pos[k + 1] + p) / 2
                trib[p] = right - left
            for x in mine:
                w = al["value"] * trib[round(self.nodes[x["i"]][k_c], 6)] / (1 if proj else cosp)
                out.append({"id": "%s@%s" % (al["id"], x["id"]), "pattern": al["pattern"], "member": x["id"],
                            "kind": "uniform", "value": round(w, 4), "dir": "gravity"})
        return out

    def _to_rafters(self, r, al, proj):
        ax = 0 if r.get("ridge", "X") == "X" else 1  # ตำแหน่งจันทันวัดตามแนวสัน
        key = "xy"[ax]
        xs = [p[ax] for p in r["outline"]]
        lo, hi = min(xs), max(xs)
        mine = [x for x in self.members.values() if x["type"] == "rafter" and self._in_outline(x, r)
                and abs(self.nodes[x["i"]][key] - self.nodes[x["j"]][key]) < 1e-6]
        pos = sorted({round(self.nodes[x["i"]][key], 6) for x in mine})
        if not pos:
            return []
        trib = {}
        for k, p in enumerate(pos):
            left = lo if k == 0 else (pos[k - 1] + p) / 2
            right = hi if k == len(pos) - 1 else (pos[k + 1] + p) / 2
            trib[p] = right - left
        out = [{"id": "%s@%s" % (al["id"], x["id"]), "pattern": al["pattern"], "member": x["id"], "kind": "uniform",
                "value": round(al["value"] * trib[round(self.nodes[x["i"]][key], 6)], 4),
                "dir": "gravity_proj" if proj else "gravity"} for x in mine]
        if r.get("overhang") and not any(x["id"] for x in mine if self._reaches_edge(x, r)):
            self.warn.append("หลังคา %s: จันทันในโมเดลไม่ยื่นถึงชายคา น้ำหนักส่วนยื่นจะไม่ถูกรวม" % r["id"])
        return out

    def _reaches_edge(self, x, r):
        k = "yx"[0 if r.get("ridge", "X") == "X" else 1]
        cs = [p[1 if k == "y" else 0] for p in r["outline"]]
        return any(abs(self.nodes[n][k] - c) < 0.02 for n in (x["i"], x["j"]) for c in (min(cs), max(cs)))

    def _automesh(self):
        """ชิ้นส่วนที่มีจุดต่อของชิ้นอื่นอยู่กลางช่วง (เช่น จันทันที่แปวางทับ) ให้ SAP แบ่งช่วงที่จุดนั้น"""
        pts = {nid: (n["x"], n["y"], n["z"]) for nid, n in self.nodes.items() if nid in self.used_nodes}
        rows = []
        for x in self.members.values():
            a, b = pts[x["i"]], pts[x["j"]]
            L = math.dist(a, b)
            if L < 1e-6:
                continue
            u = [(b[k] - a[k]) / L for k in range(3)]
            for nid, p in pts.items():
                if nid in (x["i"], x["j"]):
                    continue
                t = sum((p[k] - a[k]) * u[k] for k in range(3))
                if 1e-3 < t < L - 1e-3:
                    off = math.dist(p, [a[k] + u[k] * t for k in range(3)])
                    if off < 2e-3:
                        rows.append(row(Frame=x["id"], AutoMesh="Yes", AtJoints="Yes", AtFrames="No",
                                        NumSegments=0, MaxLength=0, MaxDegrees=0))
                        break
        self.table("FRAME AUTO MESH ASSIGNMENTS", rows)

    def _combos(self):
        rows = []
        for c in self.m.get("combos", []):
            first = True
            for pat, f in c["factors"].items():
                kw = dict(ComboName=c["id"])
                if first:
                    kw.update(ComboType="Linear Add", AutoDesign="No")
                kw.update(CaseType="Linear Static", CaseName=pat, ScaleFactor=f)
                if first:
                    kw.update(SteelDesign="Strength", ConcDesign="Strength", ColdDesign="Strength")
                rows.append(row(**kw))
                first = False
        self.table("COMBINATION DEFINITIONS", rows)

    def build(self):
        self._sections()
        self._grids()
        self._contacts()
        self._joints()
        self._restraints()
        self._materials()
        self._frames()
        self._automesh()
        self._islands()
        self._patterns()
        self._member_loads()
        self._combos()
        meta = self.m.get("meta", {})
        out = ["File exported from UD-Total-Station sap_export.py  project=%s  model_hash=%s"
               % (meta.get("name", ""), self.model_hash), ""]
        out.append('TABLE:  "PROGRAM CONTROL"')
        out.append(row(ProgramName="SAP2000", Version=self.version, CurrUnits="Kgf, m, C", SteelCode="AISC 360-16",
                       ConcCode="ACI 318-19", ColdCode="AISI-16"))
        out.append("")
        for name, rows in self.tables:
            out.append('TABLE:  "%s"' % name)
            out.extend(rows)
            out.append("")
        out.append("END TABLE DATA")
        return "\r\n".join(out) + "\r\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("-o", "--out")
    ap.add_argument("--version", default="23.0.0")
    a = ap.parse_args()
    m = json.load(open(a.model, encoding="utf-8"))
    ex = Exporter(m, a.version)
    txt = ex.build()
    out = a.out or os.path.splitext(os.path.splitext(a.model)[0])[0] + ".s2k"
    open(out, "w", encoding="utf-8", newline="").write(txt)
    # ไฟล์ประกอบ: จำ model_hash ตอนส่งออก เพื่อให้ตัวอ่านผลรู้ว่าผลวิเคราะห์มาจากโมเดลรุ่นไหน
    side = os.path.splitext(out)[0] + ".sap.json"
    json.dump({"model_hash": ex.model_hash, "model": os.path.basename(a.model), "s2k": os.path.basename(out),
               "exported_at": datetime.now().isoformat(timespec="seconds")},
              open(side, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("เขียน", out, "และ", side)
    if any(ord(c) > 127 for c in os.path.abspath(out)):
        print("  ! path มีอักษรไม่ใช่ภาษาอังกฤษ — SAP2000 import ได้ แต่รันวิเคราะห์ไม่ได้ (Illegal characters in file name):"
              " หลัง import ให้ Save As .sdb ไว้ในโฟลเดอร์/ชื่อไฟล์ภาษาอังกฤษก่อนกด Run")
    for w in ex.warn:
        print("  ! " + w)


if __name__ == "__main__":
    main()
