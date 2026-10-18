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
  DB12     (เสา 106.8 + คาน 224 + ฐาน 68.4) ม. x 12²/162 x 1.09    = 386.78 กก.
  RB6      (เสา 31x0.6x6=111.6 + คาน 33x1.0x14=462) ม. x 6²/162 x 1.05 = 133.84 กก.
  ลวดผูก   (386.78+133.84) x 0.03                                = 15.62
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
    "conc_C240": 10.09, "formwork": 77.64, "props": 40, "rebar_DB12": 386.78, "rebar_RB6": 133.84,
    "tie_wire": 15.62, "wall_brick_mon": 54.84, "plaster_wall": 109.68, "lintel": 17.10,
    "cover_metal_sheet": 58.93, "roof_frame_area": 57.21, "steel_C75x45x15x2.3": 253.50,
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

good = by.get('pipe_cw_PVC ชั้น 13.5_1/2"', {}).get("status") == "assumed" and by.get('pipe_vent_PVC ชั้น 8.5_2"', {}).get("status") == "computed"
ok &= good
print(("PASS" if good else "FAIL"), "ท่อที่ประมาณแนวให้ติดป้าย assumed, ท่อที่เขียนไว้เป็น computed")
good = by["fit_SN-3.7"]["price_ref"]["kind"] == "pct" and set(by["fit_SN-3.7"]["price_ref"]["of"]) == {'pipe_soil_PVC ชั้น 8.5_4"', 'pipe_waste_PVC ชั้น 8.5_2"', 'pipe_vent_PVC ชั้น 8.5_2"'} \
    and by["fit_SN-3.7"]["price_ref"]["mat"] == 0.4 and by["sup_SN-3.7"]["price_ref"]["mat"] == 0.3 and by["test_SN-3.8"]["price_ref"]["mat"] == 0.1 \
    and by["fit_SN-3.8"]["price_ref"]["mat"] == 0.5
# งานระบบผูกค่าแรง ว480 ตามขนาด
good = good and by['pipe_cw_PVC ชั้น 13.5_1/2"']["price_ref"].get("wage_code") == "SN-3.8-a" and by['pipe_soil_PVC ชั้น 8.5_4"']["price_ref"].get("wage_code") == "SN-3.7-e" \
    and by["wire_THW_2.5"]["price_ref"].get("wage_code") == "EE-4.2-d" and by['conduit_PVC 1/2"']["price_ref"].get("wage_code") == "EE-4.44-i" \
    and by["pt_P"]["price_ref"].get("wage_code") == "EE-4.53-k" and by["fx_WC"]["price_ref"].get("wage_code") == "ARC-2.6.1"
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

print("\nทั้งหมดผ่าน" if ok else "\nมีที่ไม่ผ่าน")
sys.exit(0 if ok else 1)
