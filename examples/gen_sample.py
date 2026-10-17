"""สร้าง examples/sample-building.bm.json — อาคาร คสล. 1 ชั้น 2x1 ช่วง หลังคาจั่วโครงเหล็ก

ค่าน้ำหนักและ combo ในไฟล์นี้เป็นตัวอย่างประกอบ schema เท่านั้น ไม่ใช่ผลคำนวณตามกฎหมาย
รัน: python examples/gen_sample.py
"""
import json, math, os

X = {"1": 0.0, "2": 4.0, "3": 8.0}
Y = {"A": 0.0, "B": 4.0}
FOOT_BOT, FOOT_H = -1.50, 0.35
BASE = FOOT_BOT + FOOT_H          # หลังฐานราก
F1, ROOF = 0.30, 3.30
PITCH = 20.0
RISE = 2.0 * math.tan(math.radians(PITCH))   # ครึ่งช่วง 2 ม.

nodes, members, supports = [], [], []
def node(nid, x, y, z, grid=None, level=None):
    n = {"id": nid, "x": round(x, 4), "y": round(y, 4), "z": round(z, 4)}
    if grid: n["grid"] = grid
    if level: n["level"] = level
    nodes.append(n)
    return nid

# จุดต่อที่จุดตัดกริด 3 ระดับ
for gx, x in X.items():
    for gy, y in Y.items():
        g = f"{gx}/{gy}"
        node(f"N-{gx}{gy}-B", x, y, BASE, g)
        node(f"N-{gx}{gy}-1F", x, y, F1, g, "1F")
        node(f"N-{gx}{gy}-R", x, y, ROOF, g, "ROOF")
    node(f"N-{gx}-RIDGE", x, 2.0, ROOF + RISE, f"{gx}/AB", "RIDGE")

# เสา 2 ท่อน (ฐาน→1F, 1F→ROOF) และฐานราก
k = 0
for gx in X:
    for gy in Y:
        k += 1
        for seg, (a, b) in enumerate([("B", "1F"), ("1F", "R")], 1):
            members.append({"id": f"C1-{gx}{gy}-{seg}", "mark": "C1", "type": "column",
                            "i": f"N-{gx}{gy}-{a}", "j": f"N-{gx}{gy}-{b}",
                            "section": "RC-20x20", "material": "C240", "status": "from_drawing", "src": "S-02"})
        supports.append({"id": f"F1-{gx}{gy}", "mark": "F1", "node": f"N-{gx}{gy}-B", "kind": "spread",
                         "b": 1.0, "d": 1.0, "h": FOOT_H, "bottom": FOOT_BOT, "material": "C240",
                         "fixity": "fixed", "status": "from_drawing", "src": "S-01"})

# คานคอดิน GB1 (1F) และคานหลังคา B1 (ROOF)
def beams(mark, lvl, tag, sec, typ):
    n = 0
    spans = [(f"{a}{gy}", f"{b}{gy}") for gy in Y for a, b in zip(list(X)[:-1], list(X)[1:])]
    spans += [(f"{gx}A", f"{gx}B") for gx in X]
    for a, b in spans:
        n += 1
        members.append({"id": f"{mark}-{tag}-{n:02d}", "mark": mark, "type": typ,
                        "i": f"N-{a}-{lvl}", "j": f"N-{b}-{lvl}", "section": sec, "material": "C240",
                        "level": tag, "status": "from_drawing", "src": "S-03"})
beams("GB1", "1F", "1F", "RC-20x40", "tie_beam")
beams("B1", "R", "ROOF", "RC-20x40", "beam")

# จันทันหลัก (แนวกริด 1, 2, 3) — แปอยู่ใน roofs[].purlin
for gx in X:
    for side, gy in (("A", "A"), ("B", "B")):
        members.append({"id": f"RF1-{gx}{side}", "mark": "RF1", "type": "rafter",
                        "i": f"N-{gx}{gy}-R", "j": f"N-{gx}-RIDGE", "section": "C100x50x20x2.3",
                        "material": "SSC400", "group": "roof_frame",
                        "releases": {"i": ["M2", "M3"]}, "status": "from_drawing", "src": "S-04"})

walls, n = [], 0
perimeter = [((0, 0), (4, 0), "A12"), ((4, 0), (8, 0), "A23"), ((8, 0), (8, 4), "3AB"),
             ((8, 4), (4, 4), "B23"), ((4, 4), (0, 4), "B12"), ((0, 4), (0, 0), "1AB")]
for p1, p2, tag in perimeter:
    walls.append({"id": f"W-{tag}", "kind": "brick_mon", "t": 0.10, "path": [list(p1), list(p2)],
                  "bottom": F1, "top": ROOF - 0.40, "finish_sides": 2, "plaster": True, "paint": True,
                  "exterior": True, "status": "from_drawing", "src": "A-02"})
# ผนังวางบนคานคอดินช่วงเดียวกัน
gb = {m["i"].split("-")[1] + m["j"].split("-")[1]: m["id"] for m in members if m["mark"] == "GB1"}
pair = {"A12": "1A2A", "A23": "2A3A", "3AB": "3A3B", "B23": "2B3B", "B12": "1B2B", "1AB": "1A1B"}
for w in walls:
    w["on_member"] = gb[pair[w["id"][2:]]]

model = {
  "schema_version": "0.1",
  "meta": {
    "name": "อาคารตัวอย่าง 1 ชั้น", "owner": "เทศบาลนครอุดรธานี", "province": "อุดรธานี", "district": "เมืองอุดรธานี",
    "occupancy": "สำนักงาน", "design_method": "WSD", "wind_method": "1311_appC", "has_construction_std": True,
    "work_group": "building",
    "drawings": [{"sheet": "A-02", "title": "แปลนพื้นชั้น 1"}, {"sheet": "S-01", "title": "แปลนฐานราก"},
                 {"sheet": "S-02", "title": "แปลนเสา"}, {"sheet": "S-03", "title": "แปลนคาน"},
                 {"sheet": "S-04", "title": "แปลนโครงหลังคา"}],
    "units": {"length": "m", "force": "kgf", "stress": "ksc"},
    "notes": ["ไฟล์ตัวอย่างประกอบ schema v0.1 — ค่าน้ำหนักและ combo เป็นตัวอย่าง ไม่ใช่ผลคำนวณตามกฎหมาย"]
  },
  "site": {"v50": 25, "terrain": "A", "seismic_zone": "none", "site_class": "D",
           "status": "assumed", "note": "ไม่มีผลเจาะสำรวจดิน",
           "field_status": {"v50": {"status": "computed", "ref": "มยผ.1311-50 อุดรธานี"},
                            "seismic_zone": {"status": "computed", "ref": "กฎกระทรวง 2564"}},
           "existing": {"boundary": [[-5, -5], [13, -5], [13, 9], [-5, 9]],
                        "structures": [{"id": "EX-1", "kind": "ลานคอนกรีตเดิม", "outline": [[1, 1], [6, 1], [6, 5], [1, 5]],
                                        "demolish": True, "status": "from_survey", "src": "สำรวจ 2026-10-10"}]}},
  "grids": [{"name": g, "axis": "X", "coord": c} for g, c in X.items()] + [{"name": g, "axis": "Y", "coord": c} for g, c in Y.items()],
  "levels": [{"name": "FOOT", "z": FOOT_BOT, "desc": "ท้องฐานราก"}, {"name": "GL", "z": 0.0},
             {"name": "1F", "z": F1}, {"name": "ROOF", "z": ROOF, "desc": "หลังคานหลังคา"},
             {"name": "RIDGE", "z": round(ROOF + RISE, 4)}],
  "materials": [
    {"id": "C240", "kind": "concrete", "fc": 240, "unit_weight": 2400, "status": "user", "note": "Earth กำหนด"},
    {"id": "SD40", "kind": "rebar", "fy": 4000, "status": "assumed", "note": "ค่าสมมติตามข้อตกลง (แบบไม่ระบุ)"},
    {"id": "SR24", "kind": "rebar", "fy": 2400, "status": "assumed", "note": "ค่าสมมติตามข้อตกลง (แบบไม่ระบุ)"},
    {"id": "SSC400", "kind": "cold_formed", "fy": 2450, "grade": "SSC400", "status": "from_drawing", "src": "S-04"}
  ],
  "sections": [
    {"id": "RC-20x20", "kind": "rc_rect", "b": 0.20, "h": 0.20, "status": "from_drawing", "src": "S-02"},
    {"id": "RC-20x40", "kind": "rc_rect", "b": 0.20, "h": 0.40, "status": "from_drawing", "src": "S-03"},
    {"id": "C100x50x20x2.3", "kind": "cold_formed", "shape": "lipped_C", "name": "C100x50x20x2.3", "kg_m": 4.06, "table": "มอก.1228", "status": "from_drawing", "src": "S-04"},
    {"id": "C75x45x15x2.3", "kind": "cold_formed", "shape": "lipped_C", "name": "C75x45x15x2.3", "kg_m": 3.25, "table": "มอก.1228", "status": "from_drawing", "src": "S-04"}
  ],
  "nodes": nodes,
  "members": members,
  "supports": supports,
  "slabs": [{"id": "S1-1F", "mark": "S1", "kind": "ground", "t": 0.10, "top": F1, "level": "1F",
             "polygon": [[0, 0], [8, 0], [8, 4], [0, 4]], "material": "C240", "use": "สำนักงาน",
             "status": "from_drawing", "src": "S-03"}],
  "walls": walls,
  "opening_types": {
    "D1": {"w": 0.90, "h": 2.00, "sill": 0.0, "kind": "door", "desc": "ประตูไม้อัดสัก"},
    "W1": {"w": 1.20, "h": 1.10, "sill": 0.90, "kind": "window", "desc": "หน้าต่างบานเลื่อนอลูมิเนียม"}
  },
  "openings": [
    {"id": "D1-1", "type": "D1", "wall": "W-A12", "at": 2.0, "status": "from_drawing", "src": "A-02"},
    {"id": "W1-1", "type": "W1", "wall": "W-B23", "at": 2.0, "status": "from_drawing", "src": "A-02"},
    {"id": "W1-2", "type": "W1", "wall": "W-B12", "at": 2.0, "status": "from_drawing", "src": "A-02"}
  ],
  "roofs": [{"id": "R1", "form": "gable", "ridge": "X",
             "outline": [[-0.8, -0.8], [8.8, -0.8], [8.8, 4.8], [-0.8, 4.8]],
             "eave": round(ROOF - 0.8 * math.tan(math.radians(PITCH)), 4), "pitch": PITCH, "overhang": 0.8,
             "cover": "metal_sheet", "rafter": {"section": "C100x50x20x2.3", "spacing": 4.0},
             "purlin": {"section": "C75x45x15x2.3", "spacing": 0.80}, "gutter": False,
             "status": "from_drawing", "src": "S-04"}],
  "finishes": [
    {"id": "FN-FL1", "kind": "floor", "spec": "กระเบื้องแกรนิตโต้ 60x60 ซม.", "level": "1F", "z": F1,
     "rects": [[0.05, 0.05, 7.95, 3.95]], "status": "from_drawing", "src": "A-05 รายการประกอบแบบ"},
    {"id": "FN-CL1", "kind": "ceiling", "spec": "ฝ้ายิปซัมบอร์ด 9 มม. ฉาบเรียบ โครงคร่าวเหล็กชุบสังกะสี", "z": 3.00,
     "rects": [[0.05, 0.05, 7.95, 3.95]], "status": "from_drawing", "src": "A-05 รายการประกอบแบบ"}
  ],
  "mep": {
    "electrical": {
      "route_height": 2.85, "wire_type": "THW", "conduit": "PVC 1/2\"",
      "panels": [{"id": "LC", "xyz": [0.2, 1.0, F1 + 1.6], "ways": 6, "main": "MCB 2P 32A"}],
      "point_types": {"L": {"kind": "light", "desc": "ดาวน์ไลท์ LED 12W"}, "S": {"kind": "switch"}, "P": {"kind": "outlet"}},
      "circuits": [{"id": "a", "panel": "LC", "desc": "แสงสว่าง", "breaker": "MCB 1P 16A", "wire_size": 1.5, "conductors": 2},
                   {"id": "b", "panel": "LC", "desc": "เต้ารับ", "breaker": "MCB 1P 20A", "wire_size": 2.5, "conductors": 3}],
      "points": [{"type": "L", "xyz": [2.0, 2.0, 3.0], "circuit": "a"}, {"type": "L", "xyz": [6.0, 2.0, 3.0], "circuit": "a"},
                 {"type": "S", "xyz": [1.2, 0.1, F1 + 1.2], "circuit": "a"}, {"type": "P", "xyz": [7.9, 2.0, F1 + 0.3], "circuit": "b"}]
    }
  },
  "loads": {
    "patterns": [{"id": "DL", "kind": "dead", "self_weight": True}, {"id": "SDL", "kind": "super_dead"},
                 {"id": "LR", "kind": "roof_live"}, {"id": "WX", "kind": "wind"}],
    "area_loads": [{"id": "AL-R1-SDL", "pattern": "SDL", "targets": ["R1"], "value": 10, "status": "assumed",
                    "note": "ตัวอย่าง: แผ่นหลังคาเหล็ก + แป"},
                   {"id": "AL-R1-LR", "pattern": "LR", "targets": ["R1"], "value": 50, "status": "computed",
                    "ref": "ตัวอย่าง — ต้องตรวจกับกฎกระทรวง 2566"}],
    "member_loads": [{"id": f"ML-WALL-{w['id']}", "pattern": "SDL", "member": w["on_member"], "kind": "uniform",
                      "value": round(180 * (w["top"] - w["bottom"]), 1), "dir": "gravity", "source": "wall",
                      "status": "computed", "ref": "ตัวอย่าง: ผนังก่ออิฐครึ่งแผ่นฉาบสองด้าน 180 กก./ตร.ม."} for w in walls]
                    + [{"id": "ML-WX-RF1-1A", "pattern": "WX", "member": "RF1-1A", "kind": "uniform", "value": -45.0,
                        "dir": "local2", "source": "wind", "wind_zone": "1", "status": "computed",
                        "ref": "ตัวอย่าง — มยผ.1311 ภาคผนวก ค"}],
    "wind": {"method": "1311_appC", "table": "ค-1", "H": round(ROOF + RISE, 2), "Ds": 4.0,
             "directions": ["X+", "Y+"], "status": "computed", "note": "ตัวอย่าง"}
  },
  "combos": [{"id": "W1", "method": "WSD", "factors": {"DL": 1.0, "SDL": 1.0, "LR": 1.0},
              "ref": "ตัวอย่าง — skill น้ำหนักบรรทุกจะสร้างตามกฎกระทรวง 2566"}],
  "design": {
    "members": {m["id"]: {"rebar": ({"main": [4, 12], "stirrup": [6, 0.15]} if m["mark"] == "C1"
                                    else {"top": [2, 12], "bot": [2, 12], "stirrup": [6, 0.15, 0.10]}),
                          "status": "from_drawing", "src": "S-05 รายละเอียด"}
                for m in members if m["mark"] in ("C1", "GB1", "B1")},
    "supports": {s["id"]: {"rebar": {"bars_x": [6, 12], "bars_y": [6, 12]}, "status": "from_drawing", "src": "S-05"}
                 for s in supports}
  },
  "demolition": [{"id": "DM-1", "wage_code": "ARC-2.9.17-a", "qty": 20.0, "unit": "ตร.ม.", "structure": "EX-1",
                  "survey_points": ["P12", "P13", "P14", "P15"], "status": "from_survey",
                  "note": "รื้อพื้น คสล. วางบนดิน หนา 10-15 ซม. (รื้อกอง)"}],
  "quantities": {"stale": True, "items": []},
  "history": [{"at": "2026-10-18T03:00:00+07:00", "by": "gen_sample.py", "sections": ["*"], "note": "สร้างไฟล์ตัวอย่าง"}]
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample-building.bm.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(model, f, ensure_ascii=False, indent=1)
print("wrote", out, len(nodes), "nodes", len(members), "members")
