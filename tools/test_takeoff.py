"""ทดสอบตัวถอดปริมาณกับอาคารตัวอย่าง เทียบค่าที่คำนวณมือ
รัน: python tools/test_takeoff.py

ค่าคาดหวัง (คำนวณมือ, อาคาร 2x1 ช่วง 4x4 ม., เสา 0.20x0.20, คาน 0.20x0.40, ฐาน 1.0x1.0x0.35 ท้อง -1.50):
  ขุดดิน   6 x 1x1x1.50 x 1.30                                   = 11.70 ลบ.ม.
  ถมคืน    6 x (1.95 - 0.35 - 0.2x0.2x1.15)                      = 9.32
  ทรายรอง  6 x 1x1x0.05 x 1.25 = 0.375                           → 0.38
  คอนกรีต  ฐาน 2.10 + เสา 6x0.04x4.45=1.068 + คานคอดิน 7x0.2x0.3x3.8=1.596
           + คานหลังคา 7x0.2x0.4x3.8=2.128 + พื้น 8x4x0.10=3.20  = 10.092 → 10.09
  ไม้แบบ   ฐาน 8.40 + เสา 21.36 + คานคอดิน 7x0.8x3.8=21.28 + คานหลังคา 7x1.0x3.8=26.60 = 77.64
  ค้ำยัน   7 x 3.8 x 1.5 = 39.9 → 40 ต้น
  DB12     (เสา 106.8 + คาน 224 + งอปลายคาน 20 ปลาย x 4 x 0.175 = 14 + ฐาน 68.4) ม. x 12²/162 x 1.09 = 400.34 กก.
  RB6      (เสา 31x0.6x6=111.6 + คาน 33x1.0x14=462) ม. x 6²/162 x 1.05 = 133.84 กก.
  ลวดผูก   (400.34+133.84) x 0.03                                = 16.03
  ผนัง     ยาวสุทธิ 3.8 x สูง 2.6 x 6 ผนัง − ประตู 1.8 − หน้าต่าง 2x1.32 = 54.84 ตร.ม.
  หลังคา   9.6x5.6/cos20° = 57.21 ตร.ม.; วัสดุมุง x1.03 = 58.93
  แป C75   8 เส้น x 9.6 = 76.8 ม. x1.03 /6 = 13.18 → 13 ท่อน x 6 x 3.25 = 253.50 กก. (แปเป็นชิ้นส่วนจริง แบ่งช่วงที่จันทัน)
  จันทัน C100 6 x (2.0 + 0.8)/cos20° = 17.88 ม. x1.03 /6 = 3.07 → 3 ท่อน x 6 x 4.06 = 73.08 กก. (รวมส่วนยื่นชายคา)
  สีกันสนิม C100: 2(0.10+2×0.05+2×0.02)=0.48 × 17.88 = 8.58; C75: 2(0.075+0.09+0.03)=0.39 × 76.8 = 29.95 → 38.53 ตร.ม.
  ไฟฟ้า วงจร a (แผง LC 0.2,1.0 สูง 1.90; เดินท่อ 2.85): 0.95 + S(1.9+1.35) + L1(2.7) + L2(4.0) = 10.90
        วงจร b: 0.95 + 8.7 + 2.25 = 11.90 → ท่อ 22.80 ×1.30 = 29.64; สาย 1.5 = 10.9×2×1.2 = 26.16; สาย 2.5 = 11.9×3×1.2 = 42.84
  ท่อ (ประมาณแนว เดินใต้ดิน): โสโครก WC→ST 0.6+2.1+0.3 = 3.0 ×1.1 = 3.30; น้ำทิ้ง FD→ST 3.9 + LAV→FD 1.7 = 5.6 ×1.1 = 6.16
        ประปา LAV→มาตร 0.5+10.8+0.5 = 11.8 + WC→LAV 1.5 = 13.3 ×1.1 = 14.63; ระบายอากาศ (เขียนไว้) 3.2 ×1.1 = 3.52
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from takeoff import run, r2, round_pieces  # noqa: E402
from validate import validate, qty_hash  # noqa: E402

m = json.load(open(os.path.join(HERE, "..", "examples", "sample-building.bm.json"), encoding="utf-8"))
items, notes, used = run(m)
by = {it["key"]: it for it in items}

EXPECT = {
    "excav": 11.70, "sand_base": 0.38, "sand_slab": 2.00, "lean_conc": 0.30,
    "conc_C240": 10.09, "formwork": 77.64, "props": 40, "rebar_DB12": 400.34, "rebar_RB6": 133.84,
    "tie_wire": 16.03, "wall_brick_mon": 54.84, "plaster_int_brick": 54.84, "plaster_ext_brick": 54.84, "lintel": 17.10,
    "cover_metal_sheet": 58.93, "steel_C75x45x15x2.3": 253.50,
    "steel_C100x50x20x2.3": 73.08, "ridge_cap": 9.89, "open_W1": 2, "open_D1": 1, "paint_ext": 54.84,
    "demo_ARC-2.9.17-a": 20.00, "paint_rust": 38.53,
    'conduit_PVC 1/2"': 29.64, "wire_THW_1.5": 26.16, "wire_THW_2.5": 42.84,
    'pipe_soil_PVC ชั้น 8.5_4"': 3.30, 'pipe_waste_PVC ชั้น 8.5_2"': 6.16, 'pipe_cw_PVC ชั้น 13.5_1/2"': 14.63,
    'pipe_vent_PVC ชั้น 8.5_2"': 3.52, "fit_SN-3.8": 1, "fit_SN-3.7": 1, "sup_SN-3.7": 1, "sup_SN-3.8": 1, "test_SN-3.7": 1, "test_SN-3.8": 1,
}
ok = "backfill" not in by
print(("PASS" if ok else "FAIL"), "ไม่มีแถวถมคืนแยก (รวมใน 1.3)")
for k, v in EXPECT.items():
    got = by.get(k, {}).get("qty")
    good = got is not None and abs(got - v) < 0.005
    ok &= good
    print(("PASS" if good else "FAIL"), k, got, "คาด", v)

from takeoff import sheet_layout, SHEET_DEFAULT  # noqa: E402
pl = [(-1.1, -1.1, 3.9), (11.9, -1.1, 3.9), (11.9, 6.9, 3.35), (-1.1, 6.9, 3.35)]
n1, l1, k1 = sheet_layout(pl, SHEET_DEFAULT)
pl2 = [(0, 0, 0), (7.6, 0, 0), (7.6, 16, 2), (0, 16, 2)]
n2, l2, k2 = sheet_layout(pl2, SHEET_DEFAULT)
sp = by["cover_metal_sheet"]["spec"].get("sheet") or {}
good = n1 == 18 and abs(l1 - 8.019) < 0.005 and k1 == 1 and n2 == 10 and k2 == 2 and sp.get("cover") == 0.76 and sp.get("n", 0) > 0 \
    and by["cover_metal_sheet"]["unit"] == "ตร.ม." and "แผ่น" in by["cover_metal_sheet"]["note"]
ok &= good
print(("PASS" if good else "FAIL"), "เมทัลชีท: 13.00 ม. ÷ 0.76 = 18 แผ่น × 8.02 ม. · ยาวเกิน 15 ม. แบ่ง 2 ช่วง · หน่วยยังเป็น ตร.ม.", n1, round(l1, 3), k1, n2, k2, sp)

import copy, math  # noqa: E402
mc = copy.deepcopy(m); rc = mc["roofs"][0]; rc.update({"form": "curved", "rise": 1.0, "outline": [[0, 0], [10, 0], [10, 6], [0, 6]]}); rc.pop("low", None); rc["ridge"] = "X"
for k in ("pitch",): rc[k] = 0
ic = {it["key"]: it for it in run(mc)[0]}
R = (9 + 1) / 2.0; arc = 2 * R * math.asin(3 / R)
good = abs(ic["cover_metal_sheet"]["qty"] - round(arc * 10 * 1.03, 2)) < 0.15 and "ridge_cap" not in ic and ic["cover_metal_sheet"]["spec"]["sheet"]["n"] == 14 \
    and abs(ic["cover_metal_sheet"]["spec"]["sheet"]["len"] - arc) < 0.01
ok &= good
print(("PASS" if good else "FAIL"), "หลังคาโค้ง: พื้นที่ = ส่วนโค้ง × ยาว · ไม่มีครอบสัน · แผ่นยาวตามโค้ง", ic["cover_metal_sheet"]["qty"], round(arc * 10 * 1.03, 2), ic["cover_metal_sheet"]["spec"]["sheet"])
rc2 = dict(rc, low="y1", rise=None, radius=10.0)
ic2 = {it["key"]: it for it in run(dict(mc, roofs=[rc2]))[0]}
arc2 = 10.0 * math.asin(6 / 10.0)
good = abs(ic2["cover_metal_sheet"]["qty"] - round(arc2 * 10 * 1.03, 2)) < 0.15
ok &= good
print(("PASS" if good else "FAIL"), "หลังคาโค้งด้านเดียว กำหนดด้วยรัศมี", ic2["cover_metal_sheet"]["qty"], round(arc2 * 10 * 1.03, 2))

good = by.get('pipe_cw_PVC ชั้น 13.5_1/2"', {}).get("status") == "assumed" and by.get('pipe_vent_PVC ชั้น 8.5_2"', {}).get("status") == "computed"
ok &= good
print(("PASS" if good else "FAIL"), "ท่อที่ประมาณแนวให้ติดป้าย assumed, ท่อที่เขียนไว้เป็น computed")
good = by["fit_SN-3.7"]["price_ref"]["kind"] == "pct" and set(by["fit_SN-3.7"]["price_ref"]["of"]) == {'pipe_soil_PVC ชั้น 8.5_4"', 'pipe_waste_PVC ชั้น 8.5_2"', 'pipe_vent_PVC ชั้น 8.5_2"'} \
    and by["fit_SN-3.7"]["price_ref"]["mat"] == 0.4 and by["sup_SN-3.7"]["price_ref"]["mat"] == 0.3 and by["test_SN-3.8"]["price_ref"]["mat"] == 0.1 \
    and by["fit_SN-3.8"]["price_ref"]["mat"] == 0.5
# งานระบบส่ง spec ให้เว็บผูกราคา (ราคาผูกใน lib/pricemap.js — ทดสอบ tools/test_pricemap.js)
good = good and by['pipe_cw_PVC ชั้น 13.5_1/2"'].get("spec") == {"t": "pipe", "sys": "cw", "mat": "PVC ชั้น 13.5", "dia": '1/2"'} \
    and by["wire_THW_2.5"]["spec"]["t"] == "wire" and by["open_D1"]["spec"]["w"] == 0.9 and by["plaster_ext_brick"]["spec"]["side"] == "ext"
ok &= good
print(("PASS" if good else "FAIL"), "ข้อต่อระบายน้ำคิด 40% จากท่อระบายน้ำ 3 รายการ")

# กฎปัดเศษ
for x, y in ((0.375, 0.38), (1.005, 1.01), (2.675, 2.68), (10.124, 10.12)):
    good = r2(x) == y; ok &= good
    print(("PASS" if good else "FAIL"), "r2", x, "→", r2(x))
for x, y in ((13.18, 13), (13.5, 14), (13.49, 13)):
    good = round_pieces(x) == y; ok &= good
    print(("PASS" if good else "FAIL"), "ท่อน", x, "→", round_pieces(x))

# ปริมาณที่พิมพ์ต้องเป็นทศนิยมไม่เกิน 2 ตำแหน่ง
bad = [it["key"] for it in items if abs(it["qty"] * 100 - round(it["qty"] * 100)) > 1e-6]
ok &= not bad
print(("PASS" if not bad else "FAIL"), "ทศนิยม 2 ตำแหน่ง", bad)

# เขียนลงไฟล์แล้วต้องผ่านตัวตรวจ และไม่ stale
m2 = json.loads(json.dumps(m))
m2["quantities"] = {"model_hash": qty_hash(m2), "stale": False, "generated_by": "test", "settings": used, "notes": notes, "items": items}
r = validate(m2)
good = not r["errors"] and not r["stale"]["quantities"]
ok &= good
print(("PASS" if good else "FAIL"), "validate หลังเขียน quantities", r["errors"][:3], r["stale"])
m2["walls"][0]["t"] = 0.20
good = validate(m2)["stale"]["quantities"]
ok &= good
print(("PASS" if good else "FAIL"), "แก้ผนังแล้ว quantities ต้อง stale")

# ผนัง คสล. (rc) → คอนกรีต + ไม้แบบ 2 ด้าน ไม่เป็นงานก่อ · พื้นวางบนดินระบุทราย/คอนกรีตหยาบเองได้ (ทางลาดกล่อง ท12, 4 พ.ย. 2569)
m3 = json.loads(json.dumps(m))
m3["walls"] = [{"id": "RW-T", "kind": "rc", "t": 0.10, "path": [[0, 0], [3, 0]], "bottom": 0.0, "top": 0.15, "status": "from_drawing", "src": "test"}]
m3["openings"] = []; m3["supports"] = []; m3["members"] = []
m3["slabs"] = [{"id": "S-T", "kind": "ground", "t": 0.10, "top": 0.0, "polygon": [[0, 0], [3, 0], [3, 1], [0, 1]], "sand": 0.10, "lean": 0.05, "pe_sheet": False, "status": "from_drawing", "src": "test"}]
it3, nt3, _ = run(m3)
rw = [i for i in it3 if any("RW-T" in str(v) for v in i.values())]
keys = {i["key"] for i in rw}
good = ("formwork" in keys and any(k.startswith("conc_") for k in keys) and not any(k.startswith("wall_") for k in keys)
        and any(n.startswith("ผนัง คสล. RW-T") for n in nt3))
ok &= good
print(("PASS" if good else "FAIL"), "ผนัง rc ถอดเป็นคอนกรีต + ไม้แบบ", sorted(keys))
sk = {i["key"]: i["qty"] for i in it3}
good = abs(sk.get("sand_slab", 0) - r2(0.30 * (1 + used["sand_waste"]))) < 0.011 and abs(sk.get("lean_conc_slab", 0) - 0.15) < 1e-6 and "pe_sheet" not in sk
ok &= good
print(("PASS" if good else "FAIL"), "พื้นระบุทราย 0.10 / คอนกรีตหยาบ 0.05", sk)

# เหล็กกลม Ø12 ที่แบบระบุ (extra_bars kind RB) แยกเป็น rebar_RB12 ไม่ปนกับ DB12 (Earth 4 พ.ย. 2569)
m4 = json.loads(json.dumps(m3))
m4.setdefault("design", {})["slabs"] = {"S-T": {"rebar": {"extra_bars": [{"label": "t", "dia": 12, "kind": "RB", "a": [0, 0, 0], "b": [2, 0, 0], "n": 3},
                                                                   {"label": "t", "dia": 12, "a": [0, 0, 0], "b": [1, 0, 0]}]}}}
it4, _, _ = run(m4)
k4 = {i["key"]: i for i in it4}
good = "rebar_RB12" in k4 and "rebar_DB12" in k4 and abs(k4["rebar_RB12"]["qty_net"] - round(6 * 12 * 12 / 162.0, 2)) < 0.011 and "SR24" in k4["rebar_RB12"]["name"]
ok &= good
print(("PASS" if good else "FAIL"), "RB12 แยกจาก DB12", {k: v["qty_net"] for k, v in k4.items() if k.startswith("rebar")})

# ผิวผนังที่ไว้แสดง 3D (counted_by wall) ไม่ถอดซ้ำ · ผิวเสา (kind struct): ผิว 1 = ฉาบโครงสร้าง + ทาสี · ผิวอื่นบุตาม spec (ท12, 5 พ.ย. 2569)
m5 = json.loads(json.dumps(m3))
m5["finishes"] = [{"id": "WF-T", "kind": "wall", "spec": "ผนังฉาบปูนเรียบทาสีน้ำอะคริลิก ภายนอก", "wall": "RW-T", "side": "L", "qty": 9.0, "counted_by": "wall", "status": "from_drawing", "src": "test"},
                  {"id": "CS-T", "kind": "struct", "spec": "ฉาบเสา", "member": "C-T", "status": "from_drawing", "src": "test",
                   "faces": [{"p": [[0, 0], [0.2, 0]], "n": [0, -1], "z": [0.2, 3.2], "tag": "1", "ext": True},
                             {"p": [[0, 0.2], [0.1, 0.2]], "n": [0, 1], "z": [0.2, 2.2], "tag": "2", "spec": "ผนังกรุกระเบื้องเซรามิค ผิวมัน"}]}]
it5, _, _ = run(m5)
k5 = {i["key"]: i for i in it5 if i["key"].startswith(("plaster", "paint", "fin_"))}
good = ("fin_wall_ผนังฉาบปูนเรียบทาสีน้ำอะคริลิก ภายนอก" not in k5 and abs(k5["plaster_struct_ext"]["qty"] - 0.6) < 1e-6 and abs(k5["paint_ext"]["qty"] - 0.6) < 1e-6
        and abs(k5["fin_wall_ผนังกรุกระเบื้องเซรามิค ผิวมัน"]["qty"] - 0.2) < 1e-6 and k5["plaster_struct_ext"]["spec"].get("struct"))
ok &= good
print(("PASS" if good else "FAIL"), "ผิวเสา struct + ผิวแสดงผลไม่ถอดซ้ำ", {k: v["qty"] for k, v in k5.items()})

# ผิวสันผนัง (side E: faces) + หลังผนัง (side T: rects + z): ใช้ qty รวมกับรายการผิวผนังตาม spec · ผิวทาสี (counted_by wall) ไม่ถอดซ้ำ (ท12, 11 พ.ย. 2569)
m6 = json.loads(json.dumps(m3)); TILE = "ผนังกรุกระเบื้องเซรามิค ผิวมัน"
m6["finishes"] = [{"id": "WF-X-L", "kind": "wall", "spec": TILE, "wall": "RW-T", "side": "L", "u": [0, 3], "tag": "2", "height": 3.0, "qty": 9.0, "unit": "ตร.ม.", "status": "from_drawing", "src": "test"},
                  {"id": "WF-X-E", "kind": "wall", "spec": TILE, "wall": "RW-T", "side": "E", "tag": "2", "qty": 0.31, "unit": "ตร.ม.", "status": "user", "src": "test",
                   "faces": [{"p": [[3.0, -0.05], [3.0, 0.05]], "n": [1, 0], "z": [0.2, 3.3]}]},
                  {"id": "WF-X-T", "kind": "wall", "spec": TILE, "wall": "RW-T", "side": "T", "tag": "2", "qty": 0.30, "unit": "ตร.ม.", "z": 3.3, "rects": [[0, -0.05, 3.0, 0.05]], "status": "user", "src": "test"},
                  {"id": "WF-Y-T", "kind": "wall", "spec": "ผนังฉาบปูนเรียบทาสีน้ำอะคริลิก ภายนอก", "wall": "RW-T", "side": "T", "tag": "1", "qty": 0.5, "unit": "ตร.ม.", "z": 3.3, "rects": [[0, -0.05, 5.0, 0.05]],
                   "counted_by": "wall", "status": "from_drawing", "src": "test"}]
it6, _, _ = run(m6)
k6 = {i["key"]: i for i in it6 if i["key"].startswith("fin_")}
good = abs(k6["fin_wall_" + TILE]["qty"] - 9.61) < 1e-6 and "fin_wall_ผนังฉาบปูนเรียบทาสีน้ำอะคริลิก ภายนอก" not in k6
ok &= good
print(("PASS" if good else "FAIL"), "ผิวสันผนัง/หลังผนัง รวมกับผิวผนังตาม spec", {k: v["qty"] for k, v in k6.items()})

# บ่อถังบำบัด (equipment.pit) + กลุ่มงานแยกแถว (work: septic)
m7 = json.loads(json.dumps(m3))
m7.setdefault("slabs", []).append({"id": "S-TB", "kind": "ground", "t": 0.15, "top": -1.5, "polygon": [[0, 0], [1.7, 0], [1.7, 1.7], [0, 1.7]], "sand": 0.05, "lean": 0.05,
                                   "pe_sheet": False, "work": "septic", "task": "mep_ext", "material": (m7.get("materials") or [{}])[0].get("id")})
m7.setdefault("design", {}).setdefault("slabs", {})["S-TB"] = {"rebar": {"mesh": [9, 0.20, 1]}}
m7.setdefault("mep", {}).setdefault("plumbing", {}).setdefault("equipment", []).append(
    {"id": "TK", "kind": "septic_tank", "xyz": [0.85, 0.85, -0.7], "dims": [1.46, 1.46, 1.5], "size": "2000",
     "pit": {"a": 1.7, "bottom": -1.75, "work": "septic", "fill": {"bottom": -1.5, "top": -0.2}}})
it7, _, _ = run(m7)
k7 = {i["key"]: i for i in it7}
v_fill = 1.7 * 1.7 * 1.3 - math.pi * 0.73 * 0.73 * 1.3
good = (abs(k7["excav_septic"]["qty_net"] - 1.7 * 1.7 * 1.75) < 0.006 and abs(k7["sand_fill_septic"]["qty_net"] - v_fill) < 0.006
        and "rebar_RB9_septic" in k7 and "tie_wire_septic" in k7 and k7["excav_septic"]["name"].endswith("(งานถังบำบัด)")
        and "S-TB" not in k7.get("rebar_RB9", {}).get("from", []))
m7["mep"]["plumbing"]["equipment"][-1]["pit"]["bottom"] = -2.2
k7b = {i["key"]: i for i in run(m7)[0]}
good &= abs(k7b["excav_deep_septic"]["qty_net"] - 2.7 * 2.7 * 2.2) < 0.006
ok &= good
print(("PASS" if good else "FAIL"), "บ่อถังบำบัด: ขุด ≤2 ม./เกิน 2 ม. ทรายถมรอบถัง เหล็กแยกแถวงานถังบำบัด", {k: round(v["qty_net"], 3) for k, v in k7.items() if k.endswith("_septic")})

print("\nทั้งหมดผ่าน" if ok else "\nมีที่ไม่ผ่าน")
sys.exit(0 if ok else 1)
