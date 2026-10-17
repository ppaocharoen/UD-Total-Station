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
| `tools/sap_export.py` | ส่งออก `.bm.json` เป็น SAP2000 `.s2k` (ทดสอบกับ v23.3.1) + ไฟล์ประกอบ `.sap.json` |
| `tools/sap_results.py` | อ่านผลจาก Excel ที่ SAP export กลับเข้า `results` (`--write`) |
| `tools/test_sap.py` | ทดสอบส่งออก/อ่านผล เทียบแรงปฏิกิริยารวมกับน้ำหนักที่ใส่ |

```
pip install jsonschema
python tools/validate.py examples/sample-building.bm.json
python tools/test_validate.py
python tools/takeoff.py examples/sample-building.bm.json --write
python tools/test_takeoff.py
python tools/sap_export.py examples/sample-building.bm.json
python tools/sap_results.py examples/sample-building.bm.json examples/sample-building.results.xlsx
python tools/test_sap.py
```

## ใช้กับ SAP2000

1. `python tools/sap_export.py โครงการ.bm.json` ได้ `โครงการ.s2k` และ `โครงการ.sap.json` (จำรุ่นโมเดลที่ส่งไป)
2. SAP: File > Import > SAP2000 .s2k Text File > New model แล้วรัน
3. SAP: File > Export > SAP2000 MS Excel Spreadsheet เลือก Analysis Results: Joint Output > Reactions, Displacements และ Element Output > Frame Output > Element Forces - Frames บันทึกชื่อเดียวกับ `.s2k` (เช่น `โครงการ.xlsx`)
4. `python tools/sap_results.py โครงการ.bm.json โครงการ.xlsx --write`
ถ้าแก้โมเดลหลังส่งออก ผลที่อ่านกลับจะถูกนับว่าเก่า (stale) จนกว่าจะส่งออกและวิเคราะห์ใหม่

## เว็บ BOQ (`/boq/`)

เปิด `boq/index.html` ผ่าน GitHub Pages แล้วเปิดไฟล์ `.bm.json` ที่ถอดปริมาณแล้ว (หรือกด "ลองกับอาคารตัวอย่าง")

- ราคาวัสดุ วัสดุมวลรวม และค่าแรง ว480 ดึงจาก UD-Cost Hub (`UDmaterial-price/lib/pricing-v1.js`)
- ปร.1 แก้ราคาต่อหน่วยในช่องได้ เพิ่มรายการเองได้ คลิกแถวเพื่อไฮไลต์ชิ้นส่วนในโมเดล 3D
- ราคาสืบ (ทราย หิน ฯลฯ) กรอกในหน้าโครงการ ใช้คิดวัสดุมวลรวมทุกรายการ
- ปร.2 ครุภัณฑ์ (ไม่คูณ F, บวก VAT), ปร.3 ค่าใช้จ่ายพิเศษ, ปร.1(ก) + Factor F (ข้อ 9.3, ตัด 4 ตำแหน่ง), ปร.4 + ราคากลางเป็นตัวอักษร
- งานของผู้ใช้เก็บใน `.boq.json` (ปุ่มบันทึก) และสำรองอัตโนมัติในเบราว์เซอร์
- แผนงาน / งวดงาน: Gantt (คลิกงาน → ไฮไลต์ชิ้นส่วนใน 3D), S-Curve, งวดงาน 2 แบบ (อัตโนมัติตาม % ผลงานสะสม หรือกำหนดงวดของแต่ละงานเอง) หักเงินล่วงหน้า/ประกันผลงานตามเงื่อนไข Factor F; ระยะเวลาคิดจากปริมาณเป็นวันทำงาน แก้เองได้ทุกงาน ระยะสัญญานับวันปฏิทิน
- ยังไม่มี: timelapse, เหล็กเสริม 3D, ส่งออก Excel ตามแบบฟอร์มหน่วยงาน (รอแบบฟอร์ม)

`lib/` : `schedule.js` แผนงาน/S-Curve/งวดงาน (ทดสอบ `node tools/test_schedule.js`), `factorf.js` ตาราง Factor F อาคาร 2569, `boqcalc.js` คิดราคาแถวและจำนวนเงินเป็นตัวอักษร, `viewer3d.js` แสดง `.bm.json` ด้วย three.js

## หลักของไฟล์ `.bm.json`

- หน่วย ม. / กก. (kgf) / ksc; พิกัดเป็นตัวเลขเมตร X ตามกริดตัวเลข Y ตามกริดตัวอักษร Z ขึ้น
- ชิ้นส่วนมี `id` ไม่ซ้ำ และ `mark` = ชื่อตามแบบ
- ทุกชิ้นมี `status` (from_drawing, from_survey, user, assumed, computed, missing) ค่าที่ต่างจากสถานะรวมใส่ใน `field_status`
- f'c ห้ามเป็น assumed; SD40 / SR24 / site class D สมมติได้ (ติดป้าย)
- เหล็กเสริมอยู่ใน `design` เสมอ แม้มาจากแบบ
- `results`, `design`, `quantities` เก็บ `model_hash` ตอนสร้าง ถ้าโมเดลเปลี่ยนจะถูกนับว่าเก่า (stale)

รายละเอียดการตัดสินใจทั้งหมดอยู่ในเอกสาร "ข้อเสนอโครงสร้างข้อมูลกลาง (Building Model)"
