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
// ---------------------------------------------------------------- 4b มวลรวมผูกทีละบรรทัด (ใช้ DB จริงของ UD Cost Hub: PRICING=<path pricing-v1.js>)
const PP = process.env.PRICING || require('path').join(__dirname, '../../udmaterial-price/lib/pricing-v1.js');
let UP = null; try { UP = require(PP); } catch (e) { console.log('SKIP 4b — ไม่พบ pricing-v1.js (ตั้ง PRICING=…)'); }
if (UP) {
  const D = new UP.DB({
    materials: [{ code: '0001000000000001', name: 'ปูนซีเมนต์ บรรจุ 50 กก./ถุง', unit: 'ถุง', price: 150, province: 'อุดรธานี' }, { code: '0001000000000002', name: 'น้ำ', unit: 'ลบ.ม.', price: 20, province: 'อุดรธานี' },
      { code: '0001000000000003', name: 'ทรายหยาบ', unit: 'ลบ.ม.', price: 450, province: 'อุดรธานี' }],
    compList: [{ id: '1', group: '7', sub: '7.9', name: 'ปูนทดสอบ', unit: 'ลบ.ม.' }, { id: '2', group: '7', sub: '7.8', name: 'ปูนซ้อน', unit: 'ลบ.ม.' }],
    compItems: [
      { compId: '1', seq: '1', itemCode: 'A', itemName: 'ปูนซีเมนต์', qty: 10, unit: 'ถุง', commodityCode: '0001000000000001', fixedPrice: null },
      { compId: '1', seq: '2', itemCode: 'B', itemName: 'ทรายหยาบ', qty: 1, unit: 'ลบ.ม.', commodityCode: '', fixedPrice: null },
      { compId: '1', seq: '3', itemCode: 'C', itemName: 'น้ำ', qty: null, unit: 'ลบ.ม.', commodityCode: '0001000000000002', fixedPrice: null },
      { compId: '2', seq: '1', itemCode: 'D', itemName: 'หินฝุ่น', qty: 2, unit: 'ลบ.ม.', commodityCode: '', fixedPrice: null },
    ],
  });
  const ctx = { db: D, U: UP, surveyOf: k => (k === 'sub:B' ? { price: 500, unit: 'ลบ.ม.', name: 'ทรายหยาบ', src: 'ราคาสืบ', n: 3 } : k === 'sub:D' ? { price: 300, unit: 'ลบ.ม.', name: 'หินฝุ่น', src: 'ราคาสืบ', n: 3 } : null) };
  const rc = [{ key: 'p', name: 'ปูนฉาบ', unit: 'ลบ.ม.', qty: 2, price_ref: { kind: 'comp', code: '7.9', wage_code: 'W1' } }];
  const pr = cmp => { const x = BB.apply(rc, {}, { cmp, db: D, U: UP, surveyOf: ctx.surveyOf }); return B.priceRows(D, UP, x.rows, { overrides: x.overrides })[0]; };
  let p0 = pr({});
  chk(p0.mat_unit === null && /คิดไม่ครบ/.test(p0.warns.join()), '4b มวลรวมขาดราคาทราย + ปริมาณน้ำ → ยังไม่มีราคา');
  let st = BB.cmpState(ctx, { code: '7.9' }, { code: '7.9' }, 0);
  chk(st && st.missing.join() === '1,2' && !st.complete, '4b สถานะ: ขาดบรรทัด 1 (ราคา) และ 2 (ปริมาณ)');
  const S1 = { code: '7.9', lines: { 1: { kind: 'survey', key: 'sub:B' } }, qty: { 2: 0.3 } };
  let p1 = pr({ p: S1 });
  chk(p1.mat_unit === 2006 && !p1.warns.some(w => /มวลรวม/.test(w)), '4b ผูกทราย = ราคาสืบ 500 + น้ำ × 0.3 → 10×150 + 500 + 0.3×20 = 2006');
  const S2 = { code: '7.9', lines: { 1: { kind: 'mat', code: '0001000000000003' } }, qty: { 2: 0.3 } };
  chk(pr({ p: S2 }).mat_unit === 1956, '4b ผูกทรายกับพาณิชย์ M3 (450) → 1956');
  // ยอมรับราคาไม่ครบ
  const S3 = { code: '7.9', qty: { 2: 0.3 } }; const n = BB.cmpAccept(ctx, S3, S3, 0);
  let p3 = pr({ p: S3 });
  chk(n === 1 && S3.accept.join() === '1' && p3.mat_unit === 1506 && /ไม่ครบ ผู้ใช้ยอมรับ/.test(p3.mat_src), '4b ยอมรับราคาไม่ครบ (ขาดทราย) → 1506 และระบุในที่มา');
  delete S3.qty;   // ชุดที่ขาดเปลี่ยน → ไม่ใช้ราคาที่ยอมรับ
  st = BB.cmpState(ctx, S3, S3, 0); p3 = pr({ p: S3 });
  chk(st.stale && !st.acc && p3.mat_unit === null, '4b ยอมรับไว้แล้วรายการที่ขาดเปลี่ยน → stale ไม่คิดราคา');
  // มวลรวมซ้อน
  const S4 = { code: '7.9', lines: { 1: { kind: 'comp', code: '7.8' } }, qty: { 2: 0.3 } };
  chk(pr({ p: S4 }).mat_unit === null, '4b บรรทัดทรายผูกมวลรวม 7.8 ที่ยังขาดราคา → ยังไม่มีราคา');
  S4.sub = { '7.8': { lines: { 0: { kind: 'survey', key: 'sub:D' } } } };
  chk(pr({ p: S4 }).mat_unit === 2106, '4b ผูกบรรทัดในมวลรวมซ้อน (หินฝุ่น 2×300) → 1500 + 600 + 6 = 2106');
  // รหัสมวลรวมไม่ตรง → ไม่ใช้
  chk(pr({ p: { code: '7.8', lines: { 1: { kind: 'mat', code: '0001000000000003' } }, qty: { 2: 0.3 } } }).mat_unit === null, '4b การผูกบรรทัดของมวลรวมอื่น (รหัสไม่ตรงแถว) ไม่ถูกใช้');
}
console.log(ok ? 'ทั้งหมดผ่าน' : 'มีข้อไม่ผ่าน'); process.exit(ok ? 0 : 1);
