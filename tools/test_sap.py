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

print("\nทั้งหมดผ่าน" if ok else "\nมีที่ไม่ผ่าน")
sys.exit(0 if ok else 1)
