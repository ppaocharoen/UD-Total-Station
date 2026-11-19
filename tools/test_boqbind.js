// ทดสอบการผูกราคาเอง (lib/boqbind.js) ทับการผูกอัตโนมัติ แล้วคิดด้วย lib/boqcalc.js — node tools/test_boqbind.js
const BB = require('../lib/boqbind.js'), B = require('../lib/boqcalc.js');
let ok = true;
const chk = (c, msg) => { ok = ok && c; console.log((c ? 'PASS ' : 'FAIL ') + msg); };
// ฐานราคาจำลอง: พาณิชย์ 2 รหัส · มวลรวม 7.2 · ค่าแรง 3 รหัส
const MAT = { C1: { code: 'C1', price: 100, unit: 'ลบ.ม.', province: 'อุดรธานี', name: 'คอนกรีต' }, C2: { code: 'C2', price: 50, unit: 'ลบ.ม.', province: 'อุดรธานี', name: 'ทราย' } };
const WAGE = { W1: { price: 20, unit: 'ลบ.ม.' }, W2: { price: 35, unit: 'ลบ.ม.' }, W3: { price: 10, unit: 'ตร.ม.' } };
const db = {
  materials: Object.values(MAT),
  resolveMat: it => ({ matItem: MAT[it.commodityCode] || null, missing: [] }),
  findComp: c => (c === '7.2' ? { id: '72', sub: '7.2', unit: 'ลบ.ม.', name: 'ปูนฉาบ' } : null),
  compPrice: () => ({ price: 80, complete: true, partial: false, lines: [] }),
  wage: c => WAGE[c] || null,
};
const U = { units: { normUnit: u => u, convertPrice: (p, f, t) => (f === t ? { ok: true, price: p, how: '' } : { ok: false, price: null, how: 'แปลงไม่ได้' }) } };
const rows = [
  { key: 'a', name: 'คอนกรีต', unit: 'ลบ.ม.', qty: 2, price_ref: { kind: 'mat', code: 'C1', wage_code: 'W1' } },
  { key: 'b', name: 'ท่อ', unit: 'ลบ.ม.', qty: 3, price_ref: { kind: 'user', need_mat: true, why: 'ไม่มีในพาณิชย์', wage_code: 'W1' } },
  { key: 'c', name: 'ขุดดิน', unit: 'ลบ.ม.', qty: 4, price_ref: { kind: 'wage', code: 'W1' } },
  { key: 'd', name: 'ประตู', unit: 'ชุด', qty: 1, price_ref: { kind: 'user', need_mat: true, wages: [{ code: 'W3', per: 'area' }], area: 1.8 } },
];
const run = (bind, extra) => {
  const x = BB.apply(rows, bind, Object.assign({ overrides: {}, survey: {} }, extra || {}));
  return Object.fromEntries(B.priceRows(db, U, x.rows, { overrides: x.overrides, survey: x.survey }).map(r => [r.key, r]));
};
// 0) ไม่ผูกเอง = ผลเหมือนผูกอัตโนมัติ
const P0 = run({}), P00 = Object.fromEntries(B.priceRows(db, U, rows, {}).map(r => [r.key, r]));
chk(['a', 'b', 'c', 'd'].every(k => P0[k].total === P00[k].total && P0[k].mat_src === P00[k].mat_src), 'ไม่มีการผูกเอง → ผลเท่าการผูกอัตโนมัติทุกแถว');
// 1) วัสดุเปลี่ยนรหัสพาณิชย์ ค่าแรงอัตโนมัติคงเดิม
let P = run({ a: { mat: { kind: 'mat', code: 'C2' } } });
chk(P.a.mat_unit === 50 && P.a.lab_unit === 20 && P.a.total === 140, 'ผูกพาณิชย์ C2 แทน C1: วัสดุ 50 ค่าแรงเดิม 20 รวม 140');
// 2) มวลรวม
P = run({ b: { mat: { kind: 'comp', code: '7.2' } } });
chk(P.b.mat_unit === 80 && P.b.lab_unit === 20 && !P.b.warns.length, 'แถวต้องสืบราคา → ผูกมวลรวม 7.2 = 80 ไม่มีคำเตือนค้าง');
// 3) ค่าแรงเปลี่ยนรหัส
P = run({ a: { lab: { kind: 'wage', code: 'W2' } } });
chk(P.a.mat_unit === 100 && P.a.lab_unit === 35, 'ผูกค่าแรง W2 แทน W1');
// 4) กรอกเอง + ไม่มี
P = run({ a: { mat: { kind: 'manual', price: 123.456, note: 'ใบเสนอราคา' }, lab: { kind: 'none' } } });
chk(P.a.mat_unit === 123.46 && P.a.lab_unit === null && P.a.total === 246.92 && !P.a.warns.length, 'กรอกเอง 123.456 → 123.46 · ไม่มีค่าแรง ไม่เตือน');
P = run({ b: { mat: { kind: 'none' } } });
chk(P.b.mat_unit === null && P.b.lab_unit === 20 && P.b.lab_only && !P.b.warns.length, 'ไม่มีค่าวัสดุ → ค่าแรงอย่างเดียว ไม่เตือน');
// 5) แถวค่าแรงอย่างเดียว: ผูกค่าแรงใหม่ยังเป็นค่าแรงอย่างเดียว · ผูกวัสดุเพิ่ม ค่าแรงเดิมยังอยู่
P = run({ c: { lab: { kind: 'wage', code: 'W2' } } });
chk(P.c.lab_unit === 35 && P.c.mat_unit === null && P.c.lab_only, 'ขุดดิน: เปลี่ยนค่าแรงเป็น W2 ยังเป็นค่าแรงอย่างเดียว');
P = run({ c: { mat: { kind: 'mat', code: 'C2' } } });
chk(P.c.lab_unit === 20 && P.c.mat_unit === 50 && !P.c.lab_only, 'ขุดดิน: เพิ่มค่าวัสดุ C2 ค่าแรงเดิม W1 ยังอยู่');
// 6) ราคาสืบ
P = run({ b: { mat: { kind: 'survey', key: 'row:x' } } }, { surveyOf: k => (k === 'row:x' ? { price: 77, src: 'ราคาสืบ 3 เจ้า' } : null) });
chk(P.b.mat_unit === 77 && P.b.mat_src === 'ราคาสืบ 3 เจ้า' && !P.b.warns.length, 'ผูกราคาสืบ row:x = 77');
// 7) ผูกวัสดุแทน → ราคาสืบรายแถวเดิมของแถวนั้นไม่ทับ
P = run({ b: { mat: { kind: 'mat', code: 'C2' } } }, { survey: { b: { price: 999, src: 'สืบเดิม' } } });
chk(P.b.mat_unit === 50, 'ผูกพาณิชย์แล้ว ราคาสืบเดิมของแถวไม่ทับ');
// 8) ประตู: ค่าแรงหลายรายการ × พื้นที่ คงอยู่เมื่อผูกแค่วัสดุ
P = run({ d: { mat: { kind: 'manual', price: 2500 } } });
chk(P.d.mat_unit === 2500 && P.d.lab_unit === 18, 'ประตู: วัสดุกรอกเอง ค่าแรงต่อ ตร.ม. × 1.8 คงเดิม (18)');
// 9) ผูกแค่ฝั่งเดียวแล้วอีกฝั่งยังไม่มีราคา → เตือนค้าง
P = run({ b: { lab: { kind: 'wage', code: 'W2' } } });
chk(P.b.warns.some(w => /ค่าวัสดุ|ยังไม่มีราคา|กรอกราคาสืบ/.test(w)) || P.b.mat_unit === null, 'ผูกค่าแรงอย่างเดียว ค่าวัสดุยังขาด → ยังเตือน');
// 9b) แถวที่ตั้งใจไม่มีค่าแรงแยก (no_lab) ผูกวัสดุเองแล้วไม่เตือนค่าแรง
const rw = [{ key: 'w', name: 'หน้าต่าง', unit: 'ชุด', qty: 1, price_ref: { kind: 'user', need_mat: true, no_lab: 'รวมในราคาสืบ' } }];
const xw = BB.apply(rw, { w: { mat: { kind: 'manual', price: 3000 } } }, {}), pw = B.priceRows(db, U, xw.rows, { overrides: xw.overrides })[0];
chk(pw.mat_unit === 3000 && !pw.warns.length, 'หน้าต่าง (ค่าแรงรวมในราคาสืบ) กรอกค่าวัสดุเอง → ไม่เตือนค่าแรง');
// 10) ย้ายไฟล์เดิม
const boq = { overrides: { a: { mat: 10 }, b: { no_mat: true, lab: 5 }, c: { code: 'X' } } };
const n = BB.migrate(boq);
chk(n === 3 && boq.bind.a.mat.price === 10 && boq.bind.b.mat.kind === 'none' && boq.bind.b.lab.price === 5 && !boq.overrides.a && boq.overrides.c.code === 'X', 'ย้าย overrides เดิม (mat/lab/no_mat) → bind');
// 11) ไม่แก้ข้อมูลต้นทาง
const ov = { a: { mat: 1 } }; BB.apply(rows, { a: { mat: { kind: 'none' } } }, { overrides: ov });
chk(ov.a.mat === 1 && rows[0].price_ref.code === 'C1', 'apply ไม่แก้ overrides/rows ต้นทาง');
console.log(ok ? 'ทั้งหมดผ่าน' : 'มีข้อไม่ผ่าน'); process.exit(ok ? 0 : 1);
