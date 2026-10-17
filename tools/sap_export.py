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

รัน: python tools/sap_export.py model.bm.json [-o out.s2k] [--version 23.0.0]
"""
import argparse, json, math, os, sys
from collections import defaultdict

PATTERN_TYPE = {"dead": "Dead", "super_dead": "Super Dead", "live": "Live", "roof_live": "Roof Live",
                "wind": "Wind", "seismic": "Quake", "other": "Other"}
E_STEEL = 2.04e6  # ksc
KSC = 1e4         # ksc -> kgf/m2
G = 9.80665


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
    """C100x50x20x2.3 -> (d, b, lip, t) เมตร"""
    p = name.upper().lstrip("C").split("X")
    d, b, lip, t = [float(v) / 1000 for v in p[:4]]
    return d, b, lip, t


class Exporter:
    def __init__(self, m, version="23.0.0"):
        self.m, self.version = m, version
        self.warn = []
        self.nodes = {n["id"]: n for n in m.get("nodes", [])}
        self.members = {x["id"]: x for x in m.get("members", [])}
        self.tables = []
        self._oh_warned = set()

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
        rows = []
        for nid, n in self.nodes.items():
            if nid not in used:
                continue
            rows.append(row(Joint=nid, CoordSys="GLOBAL", CoordType="Cartesian", XorR=n["x"], Y=n["y"], Z=n["z"],
                            SpecialJt="No", GlobalX=n["x"], GlobalY=n["y"], GlobalZ=n["z"]))
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
                fc = mt["fc"]
                E = mt.get("E") or 15100 * math.sqrt(fc)
                w = mt.get("unit_weight", 2400)
                gen.append(row(Material=mt["id"], Type="Concrete", SymType="Isotropic", TempDepend="No",
                               Color="Gray8Dark", Notes="from bm.json"))
                mech.append(row(Material=mt["id"], UnitWeight=w, UnitMass=round(w / G, 4), E1=E * KSC,
                                G12=round(E * KSC / 2.4, 2), U12=0.2, A1=9.9e-6))
                conc.append(row(Material=mt["id"], Fc=fc * KSC, LtWtConc="No", SSCurveOpt="Mander",
                                SSHysType="Takeda", SFc=0.00221914, SCap=0.005, FinalSlope=-0.1,
                                FAngle=0, DAngle=0))
                if not mt.get("E"):
                    self.warn.append("วัสดุ %s: E = 15100√f'c = %.0f ksc (คำนวณ)" % (mt["id"], E))
            elif k in ("steel", "cold_formed"):
                fy = mt["fy"]
                fu = mt.get("fu") or {"SSC400": 4100, "SS400": 4100, "SM520": 5300}.get(mt.get("grade"), 4100)
                E = mt.get("E") or E_STEEL
                gen.append(row(Material=mt["id"], Type=("ColdFormed" if k == "cold_formed" else "Steel"),
                               SymType="Isotropic", TempDepend="No", Color="Red", Notes="from bm.json"))
                mech.append(row(Material=mt["id"], UnitWeight=7850, UnitMass=round(7850 / G, 4), E1=E * KSC,
                                G12=round(E * KSC / 2.6, 2), U12=0.3, A1=1.17e-5))
                tbl = cf if k == "cold_formed" else steel
                tbl.append(row(Material=mt["id"], Fy=fy * KSC, Fu=fu * KSC,
                               **({} if k == "cold_formed" else {"EffFy": fy * 1.1 * KSC, "EffFu": fu * 1.1 * KSC}),
                               SSCurveOpt="Simple", SSHysType="Kinematic", SHard=0.02, SMax=0.14,
                               SRup=0.2, FinalSlope=-0.1))
                if not mt.get("fu"):
                    self.warn.append("วัสดุ %s: Fu = %s ksc (ค่าตามเกรด)" % (mt["id"], fu))
            else:
                self.warn.append("วัสดุ %s ชนิด %s ไม่ส่งเข้า SAP" % (mt["id"], k))
        self.table("MATERIAL PROPERTIES 01 - GENERAL", gen)
        self.table("MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES", mech)
        self.table("MATERIAL PROPERTIES 03a - STEEL DATA", steel)
        self.table("MATERIAL PROPERTIES 03b - CONCRETE DATA", conc)
        self.table("MATERIAL PROPERTIES 03c - COLD FORMED DATA", cf)

    def sap_shape(self, s):
        if s["kind"] == "rc_rect":
            return "Rectangular"
        if s["kind"] == "rc_circle":
            return "Circle"
        if s["kind"] == "cold_formed" and s.get("shape") == "lipped_C":
            return "Cold Formed C"
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
            else:
                d, b, lip, t = parse_cf_name(s["name"])
                rows.append(row(SectionName=sid, Material=mat, Shape=shape, t3=d, t2=b, tf=t, tw=t,
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
                proj = self.pattern_kind.get(al["pattern"]) == "roof_live"
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
        self._joints()
        self._restraints()
        self._materials()
        self._frames()
        self._automesh()
        self._patterns()
        self._member_loads()
        self._combos()
        meta = self.m.get("meta", {})
        out = ["File exported from UD-Total-Station sap_export.py  project=%s  model_hash=%s"
               % (meta.get("name", ""), self.m.get("quantities", {}).get("model_hash", "")), ""]
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
    print("เขียน", out)
    for w in ex.warn:
        print("  ! " + w)


if __name__ == "__main__":
    main()
