# UD-Total-Station

เว็บและเครื่องมือฝั่งโครงการของชุด skill งานวิศวกรรม เทศบาลนครอุดรธานี: เว็บออกแบบ RC (`/design/`), เว็บ BOQ (`/boq/`) และโค้ดร่วม (`/lib/`) ทุกส่วนทำงานกับไฟล์โมเดลกลาง `<โครงการ>.bm.json` ไฟล์เดียวต่อโครงการ ส่วนราคาดึงจาก UD-Cost Hub (`UDmaterial-price/lib/pricing-v1.js`)

## ตอนนี้มีอะไร

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `schema/bm.schema.json` | schema ของ `.bm.json` v0.1 |
| `examples/sample-building.bm.json` | อาคาร คสล. 1 ชั้น 2x1 ช่วง หลังคาจั่วเหล็ก (ค่าน้ำหนักเป็นตัวอย่าง) |
| `examples/gen_sample.py` | สคริปต์สร้างไฟล์ตัวอย่าง |
| `tools/validate.py` | ตัวตรวจไฟล์: schema, การอ้างอิง id, กฎงาน, ระดับความครบ L0–L3, stale |
| `tools/test_validate.py` | ชุดทดสอบตัวตรวจ |
| `tools/takeoff.py` | ถอดปริมาณตามหลักเกณฑ์งานอาคาร 2569 เขียนลง `quantities` (`--write`) |
| `tools/roofgeom.py` | เรขาคณิตหลังคา (ยกจาก phiso-house-3d) |
| `tools/price_map.json` | ร่างการผูกรายการกับรหัสราคา UD-Cost Hub (รอตรวจ) |
| `tools/test_takeoff.py` | ทดสอบตัวถอดปริมาณเทียบค่าคำนวณมือ |

```
pip install jsonschema
python tools/validate.py examples/sample-building.bm.json
python tools/test_validate.py
python tools/takeoff.py examples/sample-building.bm.json --write
python tools/test_takeoff.py
```

## หลักของไฟล์ `.bm.json`

- หน่วย ม. / กก. (kgf) / ksc; พิกัดเป็นตัวเลขเมตร X ตามกริดตัวเลข Y ตามกริดตัวอักษร Z ขึ้น
- ชิ้นส่วนมี `id` ไม่ซ้ำ และ `mark` = ชื่อตามแบบ
- ทุกชิ้นมี `status` (from_drawing, from_survey, user, assumed, computed, missing) ค่าที่ต่างจากสถานะรวมใส่ใน `field_status`
- f'c ห้ามเป็น assumed; SD40 / SR24 / site class D สมมติได้ (ติดป้าย)
- เหล็กเสริมอยู่ใน `design` เสมอ แม้มาจากแบบ
- `results`, `design`, `quantities` เก็บ `model_hash` ตอนสร้าง ถ้าโมเดลเปลี่ยนจะถูกนับว่าเก่า (stale)

รายละเอียดการตัดสินใจทั้งหมดอยู่ในเอกสาร "ข้อเสนอโครงสร้างข้อมูลกลาง (Building Model)"
