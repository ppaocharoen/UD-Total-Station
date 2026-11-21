// ทดสอบ pricing-v2.js: ห้ามแปลงราคาระหว่างหน่วยนับต่างชนิด (M2 ก้อน 5f · Earth 21 พ.ย. 2569)
// node tools/test_units_v2.js  (ตั้ง PRICING_DIR=<โฟลเดอร์ lib ของ UDmaterial-price> ถ้า repo ไม่อยู่ข้างกัน)
const path = require('path');
const DIR = process.env.PRICING_DIR || path.join(__dirname, '../../udmaterial-price/lib');
const V1 = require(path.join(DIR, 'pricing-v1.js')), V2 = require(path.join(DIR, 'pricing-v2.js'));
const B = require('../lib/boqcalc.js');
let bad = 0; const chk = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) bad++; };
const cv = (U, p, f, t, fn, tn) => U.units.convertPrice(p, f, t, fn || '', tn || '');
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-9;

// ---- ชนิดเดียวกัน: v2 = v1 ทุกตัว
const same = [
  [1000, 'ตัน', 'กก.', '', 1], [10, 'กก.', 'กรัม', '', 0.01], [3785, 'แกลลอน', 'GL.', '', 3785], [500, 'ลบ.ม.', 'ลิตร', '', 0.5],
  [10, 'ม.', 'ซม.', '', 0.1], [100, 'ตร.ม.', 'ตร.ซม.', '', 0.01],
  [150, 'ถุง', 'กก.', 'ปูนซีเมนต์ บรรจุ 50 กก./ถุง', 3], [400, 'ท่อน', 'ม.', 'ท่อ พีวีซี ยาว 4 เมตร', 100], [1000, 'ม้วน', 'ม.', 'สายไฟ THW ยาว 100 เมตร', 10],
  [210, 'กระป๋อง', 'ลิตร', 'สีน้ำ ขนาด 2.1 ลิตร', 100], [1440, '144 แผ่น', 'แผ่น', '', 10], [120, 'โหล', 'ตัว', '', 10], [120, 'โหล', 'อัน', '', 10],
];
for (const [p, f, t, fn, want] of same) {
  const a = cv(V1, p, f, t, fn), b = cv(V2, p, f, t, fn);
  chk(b.ok && near(b.price, want) && a.ok && near(a.price, b.price), `ยอม ${f} → ${t}${fn ? ' (' + fn.slice(0, 22) + ')' : ''} = ${b.price} (v1 ${a.price})`);
}
// ---- ต่างชนิด: v1 แปลง 1:1 · v2 ไม่แปลง + บอกเหตุ
const diff = [['เส้น', 'แผ่น'], ['อัน', 'ชุด'], ['ตัว', 'ชุด'], ['ท่อน', 'เส้น'], ['อัน', 'ชิ้น'], ['แผ่น', 'ก้อน'], ['144 แผ่น', 'ก้อน'], ['ดวง', 'หลอด']];
for (const [f, t] of diff) {
  const a = cv(V1, 100, f, t), b = cv(V2, 100, f, t);
  chk(a.ok && !b.ok && b.price === null && b.countKind && /หน่วยนับต่างชนิด/.test(b.how), `ห้าม ${f} → ${t} (v1 ${a.price} · v2 "${b.how}")`);
}
// ---- คำนับเดียวกันยังใช้ได้ · หน่วยต่างมิติยังแปลงไม่ได้เหมือนเดิม
chk(cv(V2, 50, 'แผ่น', 'แผ่น').price === 50 && cv(V2, 50, 'ตัว', ' ตัว ').ok, 'คำนับเดียวกัน (แผ่น → แผ่น) ใช้ราคาเดิม');
const md = cv(V2, 100, 'กก.', 'ม.'); chk(!md.ok && !md.countKind && md.how === cv(V1, 100, 'กก.', 'ม.').how, 'ต่างมิติ (กก. → ม.) แปลงไม่ได้ ข้อความเดิม');
// ---- จุด (ไฟฟ้า): รับคำนับใดก็ได้ 1:1 · โหล ÷ 12 · ไม่รับหน่วยวัด
chk(cv(V2, 116.83, 'อัน', 'จุด').price === 116.83 && cv(V2, 80, 'ชุด', 'จุด').price === 80 && cv(V2, 50, 'ตัว', 'จุด').price === 50, 'จุด ← อัน/ชุด/ตัว 1:1');
chk(near(cv(V2, 120, 'โหล', 'จุด').price, 10) && !cv(V2, 10, 'ม.', 'จุด').ok, 'จุด ← โหล ÷ 12 · จุด ← ม. ไม่ได้');
// ---- ผ่าน boqcalc ทั้งสองรุ่นได้ราคาเดียวกันสำหรับแถว จุด (ข้อตัดสิน 1 ข)
const mk = U => new U.DB({ materials: [{ code: '2006030102000000', name: 'เต้ารับคู่ มีกราวด์', unit: 'อัน', price: 116.83, province: 'ขอนแก่น' },
  { code: '0505000000000001', name: 'แผ่นยิปซัม', unit: 'แผ่น', price: 200, province: 'อุดรธานี' }, { code: '0505000000000002', name: 'ไม้ระแนง', unit: 'เส้น', price: 60, province: 'อุดรธานี' }] });
const rowsP = [{ key: 'pt', name: 'จุดเต้ารับ', unit: 'จุด', qty: 4, price_ref: { kind: 'mat', code: '2006030102000000' } },
  { key: 'gy', name: 'แผ่นยิปซัม', unit: 'แผ่น', qty: 10, price_ref: { kind: 'mat', code: '0505000000000001' } },
  { key: 'rn', name: 'ระแนงผูกเป็นแผ่น', unit: 'แผ่น', qty: 10, price_ref: { kind: 'mat', code: '0505000000000002' } }];
const P1 = B.priceRows(mk(V1), V1, rowsP, {}), P2 = B.priceRows(mk(V2), V2, rowsP, {});
chk(P1[0].mat_unit === 116.83 && P2[0].mat_unit === 116.83, `boqcalc แถว จุด: v1 = v2 = 116.83 (v2 "${P2[0].mat_src}")`);
chk(P1[1].mat_unit === 200 && P2[1].mat_unit === 200, 'boqcalc แถว แผ่น ← แผ่น: 200 ทั้งสองรุ่น');
chk(P1[2].mat_unit === 60 && P2[2].mat_unit === null, `boqcalc แถว แผ่น ← เส้น: v1 60 · v2 ยังไม่มีราคา (${(P2[2].warns || []).join(' | ').slice(0, 90)})`);
// ---- มวลรวม: บรรทัดคำนับต่างชนิด → unit_conversion_failed (คิดไม่ครบ) ใน v2
const cd = U => new U.DB({ materials: [{ code: '0505000000000002', name: 'ไม้ระแนง', unit: 'เส้น', price: 60 }], matRef: {},
  compList: [{ id: '9', group: '12', sub: '12.9', name: 'ทดสอบ', unit: 'ตร.ม.' }], compItems: [{ compId: '9', seq: '1', itemCode: '', itemName: 'ระแนง', qty: 2, unit: 'แผ่น', commodityCode: '0505000000000002', fixedPrice: null }] });
const c1 = cd(V1).compPrice('9', {}), c2 = cd(V2).compPrice('9', {});
chk(c1.price === 120 && c2.price === null && c2.lines[0].warnings.includes('unit_conversion_failed'), 'มวลรวม: บรรทัด แผ่น ← ราคา/เส้น v1 120 · v2 คิดไม่ครบ (unit_conversion_failed)');
// ---- v1 ไม่เปลี่ยน: ไฟล์ v1 ไม่มี V/POINT
chk(!V1.units.V && !V1.units.POINT && V2.units.V === 2, 'pricing-v1 คงเดิม (ไม่มี units.V/POINT)');
console.log(bad ? `ไม่ผ่าน ${bad} ข้อ` : 'ทั้งหมดผ่าน'); process.exit(bad ? 1 : 0);
