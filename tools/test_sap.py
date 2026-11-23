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
n_stub = sum(1 for x in t12["members"] if re.match(r"C-\w+j$", x["id"]))
check("ท12 ส่งชิ้นส่วนโครงสร้างครบ (ไม่รวมเสาเอ็น/ทับหลัง · ท่อนเสาในความลึกคานรวมเข้าตอม่อ)",
      len(T12["CONNECTIVITY - FRAME"]) == n_struct - n_stub and n_stub == 10, (len(T12["CONNECTIVITY - FRAME"]), n_struct, n_stub))
EM = ex12.members
check("ท12 ตอม่อ 12 ต้นยาวถึงเส้นคาน (หลังคาน) — Earth 22 พ.ย. 2569",
      all(max(ex12.nodes[EM[k]["i"]]["z"], ex12.nodes[EM[k]["j"]]["z"]) in (0.15, 0.2) for k in EM if k.startswith("PD-"))
      and sum(k.startswith("PD-") for k in EM) == 12 and not any(re.match(r"C-\w+j$", k) for k in EM))
check("ท12 คาน คสล. แสดงผลห้อยจากเส้น (Top Center)", "FRAME INSERTION POINT ASSIGNMENTS" in T12
      and all('CardinalPt="8 (Top Center)"' in r for r in T12["FRAME INSERTION POINT ASSIGNMENTS"]))
check("ท12 ไม่มีกลุ่มชิ้นส่วนลอย (ต่อถึงฐานรากทุกชิ้น)", not [w for w in ex12.warn if "ไม่ต่อถึงฐานราก" in w],
      [w for w in ex12.warn if "ไม่ต่อถึงฐานราก" in w][:2])
check("ท12 จุดวางชนผูก Body constraint", len(T12.get("CONSTRAINT DEFINITIONS - BODY", [])) == 61, len(T12.get("CONSTRAINT DEFINITIONS - BODY", [])))
check("ท12 หัวเสา 1B ผูกกับแนวแกนอะเส RB-B", any("N-1B-T" in r for r in T12["JOINT CONSTRAINT ASSIGNMENTS"]))
check("ท12 หน้าตัด 2C = General · ท่อกล่อง = Box/Tube · C ลึกเป็นบวก",
      "Shape=General" in txt12 and "Shape=Box/Tube" in txt12 and "t3=-" not in txt12)
check("ท12 แป 9 เส้นต่อกับจันทันทุกตัว (13 แนว)", sum(1 for j in ex12.extra_joints if re.match(r"PL-R1-\d+-X", j)) == 9 * 13,
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
check("purlingen: แป 9 เส้น ยาวรวม 117.00 ม. (มีแปที่ปลายจันทันด้านสูง — Earth 22 พ.ย. 2569)", len(mm2) == 9 and abs(Lp - 117.0) < 0.01, round(Lp, 3))
ys = sorted(NN[x["i"]]["y"] for x in mm2)
check("purlingen: แปริมสองด้านห่างขอบหลังคา ~0.05 (วัดตามลาด)", abs(ys[0] - (-1.1 + 0.05 * math.cos(math.radians(2.96)))) < 0.01
      and abs(ys[-1] - (6.9 - 0.05 * math.cos(math.radians(2.96)))) < 0.01, (ys[0], ys[-1]))

# ---------- loadgen (M4 ก้อน 2): น้ำหนักตามที่ Earth กำหนด 22 พ.ย. 2569 ----------
from loadgen import Gen, load_lib  # noqa: E402
g = Gen(json.loads(json.dumps(t12)), load_lib(os.path.join(HERE, "unit_weights.json")))
LD, CB = g.run()
AL = {a["id"]: a for a in LD["area_loads"]}
check("loadgen: DL ใช้น้ำหนักตัวเองจาก SAP อย่างเดียว (ไม่มีน้ำหนักชิ้นส่วนซ้ำ)",
      next(p for p in LD["patterns"] if p["id"] == "DL")["self_weight"] and not [a for a in LD["area_loads"] + LD["member_loads"] if a["pattern"] == "DL"])
check("loadgen: เมทัลชีท 0.40 มม. × 7.85 = 3.14", abs(AL["AL-R1-SHEET"]["value"] - 3.14) < 1e-9)
check("loadgen: ฝ้าสมาร์ทบอร์ด 9.1 ลงจันทัน ต่อพื้นที่ราบ", AL["AL-R1-CEIL"]["value"] == 9.1 and AL["AL-R1-CEIL"]["on"] == "rafter" and AL["AL-R1-CEIL"]["per"] == "plan")
check("loadgen: LR หลังคา 50", AL["AL-R1-LR"]["value"] == 50)
ops = {}
for o in t12["openings"]:
    t_ = t12["opening_types"][o["type"]]
    ops[o["wall"]] = ops.get(o["wall"], 0) + t_["w"] * t_["h"]
per = {}
for ml in LD["member_loads"]:
    per[ml["src"]] = per.get(ml["src"], 0) + ml["value"][0] * (ml["at"][1] - ml["at"][0])
W12 = {w["id"]: w for w in t12["walls"]}
bad = []
for wid, v in per.items():
    w = W12[wid]
    Lw = sum(math.dist(w["path"][i], w["path"][i + 1]) for i in range(len(w["path"]) - 1))
    exp = g.wall_w(w)[0] * ((w["top"] - w["bottom"]) * Lw - ops.get(wid, 0))
    if abs(exp - v) > 0.5:
        bad.append((wid, round(v, 1), round(exp, 1)))
check("loadgen: น้ำหนักผนังที่ลงคาน = หน่วยน้ำหนัก × (พื้นที่ผนัง − ช่องเปิด) ทุกแผง", not bad, bad[:3])
check("loadgen: อิฐครึ่งแผ่น 180 · เต็มแผ่น 360 · บล็อกช่องลม 135",
      g.wall_w(W12["W-G1"])[0] == 180 and g.wall_w(W12["W-1A"])[0] == 360 and g.wall_w(W12["W-A1"])[0] == 135)
check("loadgen: แผงเหล็ก 75x38x1.6 @0.10 คิดน้ำหนักเหล็ก", abs(g.wall_w(W12["W-A2S"])[0] - round((2 * (75 + 38) - 4 * 1.6) * 1.6 * 7.85e-3 / 0.10, 3)) < 1e-9)
check("loadgen: ผนังรวมลงคาน 24,521.7 กก.", abs(sum(per.values()) - 24521.7) < 0.5, round(sum(per.values()), 1))

# ---------- ลม (M4 ก้อน 3) มยผ.1311 ภาคผนวก ค · ท12: V50 25 ภูมิประเทศ B Iw 1 กรณี 3 (Earth 22 พ.ย. 2569) ----------
from windgen import Wind, combos as wcombos  # noqa: E402
wi = {"V50": 25, "terrain": "B", "Iw": 1.0, "cpi_case": 3}
wp, wz, wd = Wind(t12, wi).run()
check("ลม: 16 กลุ่ม (4 มุมต้นลม × ตั้งฉาก/ขนานสัน × Cpi ±)", len(wp) == 16 and len({p["id"] for p in wp}) == 16, [p["id"] for p in wp][:4])
check("ลม: z 1.00 · y 6.00 · ค-4 B h 3.47 = 0.70", (wd["z"], wd["y_E"], wd["Ce_C4"]) == (1.0, 6.0, 0.7), wd)
Z = {(z["pattern"], z["on"], z["zone"]): z for z in wz}
check("ลม: WYA1P หลังคาโซน 2 = −107.5 × 0.7 (ตาราง ค-3 C3b แถว 0–5°)", abs(Z[("WYA1P", "roof", "2")]["value"] + 75.25) < 1e-6)
check("ลม: WYA1N หลังคาโซน 2E = −23.9 × 0.7 (C3a)", abs(Z[("WYA1N", "roof", "2E")]["value"] + 16.73) < 1e-6)
check("ลม: ผนัง 1 แบ่งต้นลม/ท้ายลม 0.75 : 0.55 (รูป ข.1) รวม = 51.8 × 0.7",
      abs(Z[("WYA1P", "face", "1")]["value"] - Z[("WYA1P", "face", "4")]["value"] - 36.26) < 1e-3
      and abs(Z[("WYA1P", "face", "1")]["value"] / 36.26 - 0.75 / 1.3) < 1e-4)
check("ลม: ชุดผสม 2 + 16×3 = 50", len(wcombos([p["id"] for p in wp])) == 50)
t12w = json.loads(json.dumps(t12))
t12w["loads"]["patterns"] = [p for p in t12w["loads"]["patterns"] if p["kind"] != "wind"] + wp
t12w["loads"]["wind"] = {"input": wi, "derived": wd, "zones": wz}
exw = Exporter(t12w)
txtw = exw.build()
Tw = dict(exw.tables)
S = exw.wind_sum
# แรงลมรวมจากโซน (ไม่ผ่านการกระจาย): หลังคา ΣFz = −Σ ค่า × พื้นที่แปลน
for pid in ("WYA1P", "WX4CN"):
    fz = -sum(z["value"] * (z["rect"][2] - z["rect"][0]) * (z["rect"][3] - z["rect"][1]) for z in wz if z["pattern"] == pid and z["on"] == "roof")
    check("ลม %s: ΣFz ที่ลงแป = แรงจากโซน (%.1f กก.)" % (pid, fz), abs(S[pid][2] - fz) < 0.5, round(S[pid][2], 1))
# ผนังสกัด x = 0 (ลม WX1AP โซน 5E ทั้งผนัง): ΣFx ≈ ค่ารวม 5E × กว้าง 5.80 × สูงเฉลี่ย (หลังคาน 0.20 → ผิวหลังคา)
hx = sum(exw._roof_z(t12["roofs"][0], 0, 5.8 * (i + 0.5) / 100) for i in range(100)) / 100 - 0.2
fx = 77.7 * 0.7 * 5.8 * hx
check("ลม WX1AP: ΣFx ผนังสกัด ≈ หน่วยแรง × พื้นที่ (คลาดไม่เกิน 3%% · ช่วงอะเสไม่มีเสาไม่นับ) %.1f" % fx, abs(S["WX1AP"][0] - fx) / fx < 0.03, round(S["WX1AP"][0], 1))
check("ลม: ปลายเสาใช้ RelDist (กัน AbsDist เกินความยาว)", all("RelDist=" in r for r in Tw["FRAME LOADS - POINT"] if "LoadPat=W" in r))
th = math.radians(2.96)
check("ลม: ΣFy หลังคาเพิง = ΣFz × tan(ลาด) (แรงตั้งฉากผิวหลังคา)", abs((S["WX1AP"][1]) - S["WX1AP"][2] * math.tan(th)) < 0.5)
check("ลม: แปหมุนแกน 2 ตั้งฉากหลังคา (±2.96°)", all(abs(abs(exw.members[k].get("angle", 0)) - 2.96) < 1e-6 for k in exw.members if k.startswith("PL-")))
dist = Tw["FRAME LOADS - DISTRIBUTED"]
check("ลม: แรงบนแปทิศ Local 2 · แรงบนเสาทิศ X/Y", any("LoadPat=WYA1P" in r and "CoordSys=Local" in r and "Dir=2" in r for r in dist)
      and any("LoadPat=WYA1P" in r and "Frame=C-1A " in r and "Dir=Y" in r for r in dist))
check("ลม: กลุ่มลมเป็น Wind ใน SAP · ชุดผสม 50", sum("DesignType=Wind" in r for r in Tw["LOAD PATTERN DEFINITIONS"]) == 16
      and len({re.search(r"ComboName=(\S+)", r).group(1) for r in Tw["COMBINATION DEFINITIONS"]}) == len(t12w["combos"]))

print("\nทั้งหมดผ่าน" if ok else "\nมีที่ไม่ผ่าน")
sys.exit(0 if ok else 1)
