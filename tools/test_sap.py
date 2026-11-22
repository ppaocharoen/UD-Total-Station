"""ทดสอบตัวส่งออก SAP (.s2k) และตัวอ่านผล กับอาคารตัวอย่าง
ผลอ้างอิง examples/sample-building.results.xlsx ได้จากการ import sample-building.s2k เข้า SAP2000 v23.3.1 แล้วรัน (18 ต.ค. 2569)
รัน: python tools/test_sap.py
"""
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sap_export import Exporter  # noqa: E402
from sap_results import build, read_tables  # noqa: E402
from validate import validate  # noqa: E402

EX = os.path.join(HERE, "..", "examples")
m = json.load(open(os.path.join(EX, "sample-building.bm.json"), encoding="utf-8"))
ok = True


def check(name, good, extra=""):
    global ok
    ok &= bool(good)
    print(("PASS" if good else "FAIL"), name, extra)


ex = Exporter(m)
txt = ex.build()
names = [t for t, _ in ex.tables]
for t in ("JOINT COORDINATES", "CONNECTIVITY - FRAME", "FRAME SECTION PROPERTIES 01 - GENERAL",
          "MATERIAL PROPERTIES 03D - COLD FORMED DATA", "JOINT RESTRAINT ASSIGNMENTS", "LOAD PATTERN DEFINITIONS",
          "LOAD CASE DEFINITIONS", "FRAME LOADS - DISTRIBUTED", "COMBINATION DEFINITIONS", "FRAME AUTO MESH ASSIGNMENTS"):
    check("มีตาราง " + t, t in names)
check("ไม่มีตารางที่ SAP v23 ไม่รู้จัก (03c)", "03c" not in txt)
check("จำนวนชิ้นส่วน", len(dict(ex.tables)["CONNECTIVITY - FRAME"]) == len(m["members"]))

# น้ำหนักบนแปรวม = ค่าต่อ ตร.ม. x พื้นที่หลังคา
L = {mm.group(1): float(mm.group(2)) for mm in re.finditer(r"Frame=(\S+)\s+JointI.*?Length=([\d.]+)", txt)}
tot = {"SDL": 0.0, "LR": 0.0}
for mm in re.finditer(r"Frame=(P1\S+)\s+LoadPat=(\w+).*?FOverLA=([\d.]+)", txt):
    tot[mm.group(2)] += float(mm.group(3)) * L[mm.group(1)]
area_flat = 9.6 * 5.6
check("น้ำหนักหลังคา SDL ลงแป", abs(tot["SDL"] - 10 * area_flat / math.cos(math.radians(20))) < 0.01, round(tot["SDL"], 2))
check("น้ำหนักจรหลังคา LR ลงแป", abs(tot["LR"] - 50 * area_flat) < 0.01, round(tot["LR"], 2))

# ผลจาก SAP: แรงปฏิกิริยารวม = น้ำหนักที่ใส่
res, warn = build(m, read_tables(os.path.join(EX, "sample-building.results.xlsx")))
fz = {c: sum(v[c][2] for v in res["reactions"].values()) for c in ("DL", "SDL", "LR", "W1")}
conc = (6 * 0.04 * 4.45 + 2 * 7 * 0.2 * 0.4 * 4.0) * 2400        # SAP คิดเต็มความยาวจุดต่อจุด
steel = 17.8809 * 5.2630e-4 * 7850 + 76.8 * 4.2280e-4 * 7850
walls = 6 * 468 * 4.0
check("ΣFz DL = น้ำหนักตัวเอง", abs(fz["DL"] - (conc + steel)) < 1.0, "%.2f vs %.2f" % (fz["DL"], conc + steel))
check("ΣFz SDL = ผนัง + หลังคา", abs(fz["SDL"] - (walls + tot["SDL"])) < 0.05, round(fz["SDL"], 2))
check("ΣFz LR", abs(fz["LR"] - 2688) < 0.01, round(fz["LR"], 2))
check("ΣFz W1 = DL+SDL+LR", abs(fz["W1"] - fz["DL"] - fz["SDL"] - fz["LR"]) < 0.01)
check("อ่านผลครบทุกชิ้นส่วน", len(res["members"]) == len(m["members"]))
check("ห่อหุ้มจากชุดผสม", res["cases_used"] == ["W1"])
mm_ = res["members"]["B1-ROOF-01"]["M3"]
check("โมเมนต์คานหลังคา B1-ROOF-01", abs(mm_["min"] + 336.8149) < 1e-3 and abs(mm_["max"] - 209.0206) < 1e-3,
      json.dumps(mm_, ensure_ascii=False))

m2 = json.loads(json.dumps(m))
m2["results"] = res
r = validate(m2)
check("validate หลังใส่ results", not r["errors"] and not r["stale"]["results"], r["errors"][:2])
m2["members"][0]["section"] = "RC-20x40"
check("แก้โมเดลแล้ว results ต้อง stale", validate(m2)["stale"]["results"])

# ---------- ท12 (M4 ก้อน 1 · 22 พ.ย. 2569): ส่งออกได้ครบ ต่อถึงฐานรากทุกชิ้น ----------
from sap_export import double_c_props, SAP_SKIP  # noqa: E402
from purlingen import gen as purlin_gen  # noqa: E402
t12 = json.load(open(os.path.join(EX, "t12", "t12.bm.json"), encoding="utf-8"))
ex12 = Exporter(t12)
txt12 = ex12.build()
T12 = dict(ex12.tables)
n_struct = sum(1 for x in t12["members"] if x["type"] not in SAP_SKIP)
check("ท12 ส่งชิ้นส่วนโครงสร้างครบ (ไม่รวมเสาเอ็น/ทับหลัง)", len(T12["CONNECTIVITY - FRAME"]) == n_struct, n_struct)
check("ท12 ไม่มีกลุ่มชิ้นส่วนลอย (ต่อถึงฐานรากทุกชิ้น)", not [w for w in ex12.warn if "ไม่ต่อถึงฐานราก" in w],
      [w for w in ex12.warn if "ไม่ต่อถึงฐานราก" in w][:2])
check("ท12 จุดวางชนผูก Body constraint", len(T12.get("CONSTRAINT DEFINITIONS - BODY", [])) == 61, len(T12.get("CONSTRAINT DEFINITIONS - BODY", [])))
check("ท12 หัวเสา 1B ผูกกับแนวแกนอะเส RB-B", any("N-1B-T" in r for r in T12["JOINT CONSTRAINT ASSIGNMENTS"]))
check("ท12 หน้าตัด 2C = General · ท่อกล่อง = Box/Tube · C ลึกเป็นบวก",
      "Shape=General" in txt12 and "Shape=Box/Tube" in txt12 and "t3=-" not in txt12)
check("ท12 แป 8 เส้นต่อกับจันทันทุกตัว (13 แนว)", sum(1 for j in ex12.extra_joints if re.match(r"PL-R1-\d+-X", j)) == 8 * 13,
      sum(1 for j in ex12.extra_joints if re.match(r"PL-R1-\d+-X", j)))
P = double_c_props(0.1, 0.05, 0.02, 0.0023)
c1 = 0.1 * 0.0023 + 2 * (0.05 - 0.0023) * 0.0023 + 2 * (0.02 - 0.0023) * 0.0023
check("2C ประกบคู่: A = 2 × C เดี่ยว", abs(P["A"] - 2 * c1) < 1e-12, P["A"])
check("2C ประกบคู่: I33 = 2 × I33 ของ C เดี่ยว (แกนเดียวกัน)", abs(P["I33"] / 2 - (0.0023 * 0.1 ** 3 / 12 + 2 * ((0.05 - 0.0023) * 0.0023 ** 3 / 12 + (0.05 - 0.0023) * 0.0023 * (0.05 - 0.00115) ** 2) + 2 * (0.0023 * (0.02 - 0.0023) ** 3 / 12 + 0.0023 * (0.02 - 0.0023) * (0.05 - 0.0023 - (0.02 - 0.0023) / 2) ** 2))) < 1e-12)
check("purlingen: ท12 มีแปแล้ว ไม่สร้างซ้ำ", purlin_gen(t12)[1] == [])
t12b = json.loads(json.dumps(t12))
t12b["members"] = [x for x in t12b["members"] if x["type"] != "purlin"]
nn, mm2, _ = purlin_gen(t12b)
NN = {n["id"]: n for n in t12b["nodes"] + nn}
Lp = sum(math.dist(*[(NN[x[k]]["x"], NN[x[k]]["y"], NN[x[k]]["z"]) for k in ("i", "j")]) for x in mm2)
check("purlingen: แป 8 เส้น ยาวรวม 104.00 ม. (= ตัวถอดจากข้อกำหนดเดิม)", len(mm2) == 8 and abs(Lp - 104.0) < 0.01, round(Lp, 3))

print("\nทั้งหมดผ่าน" if ok else "\nมีที่ไม่ผ่าน")
sys.exit(0 if ok else 1)
