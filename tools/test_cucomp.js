// ทดสอบวัสดุมวลรวมที่สร้างเอง (M2 ก้อน 5e): lib/survey.js compToItems/compMerge/compUnlink/compRefCodes/compGone
// + คิดราคา U-* ด้วยตัวคำนวณจริงของ Cost Hub + ผลเหมือนตัวแปลงเดิมของ Cost Hub (cuToItems ก่อน v1.22.4)
// node tools/test_cucomp.js  (ตั้ง PRICING=<path pricing-v1.js> ถ้า repo Cost Hub ไม่อยู่ข้างกัน)
const Survey = require('../lib/survey.js');
const BB = require('../lib/boqbind.js'), B = require('../lib/boqcalc.js');
let bad = 0; const chk = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) bad++; };
const J = x => JSON.stringify(x);

// ---- 1) ตัวแปลงใหม่ = ตัวแปลงเดิมของ Cost Hub (คัดลอกจาก index.html v1.22.3)
function oldToItems(c, matRefMap) {
  const comp = { id: c.id, group: '12', sub: c.id, name: c.name, unit: c.unit, custom: true, by: c.by || '', updated: c.updated || '' };
  const items = (c.lines || []).map((l, i) => {
    const it = { compId: c.id, seq: String(i + 1), itemCode: '', itemName: l.name, qty: l.qty === null || l.qty === undefined || l.qty === '' ? null : +l.qty, unit: l.unit || '', commodityCode: '', userInput: '', fixedPrice: null };
    if (l.src === 'mat') it.commodityCode = String(l.code || '');
    if (l.src === 'fixed' && l.price !== null && l.price !== undefined && l.price !== '') it.fixedPrice = +l.price;
    if (l.src === 'comp' && l.comp) { it.itemCode = 'U:' + c.id + ':' + i; matRefMap[it.itemCode] = { name: '', unit: l.unit || '', commodityCode: '', compRef: l.comp }; }
    return it;
  });
  return { comp, items };
}
const U1 = { id: 'U-1', name: 'ปูนก่อเอง', unit: 'ลบ.ม.', by: 'Earth <e@x>', updated: '2026-11-21T01:00:00Z', lines: [
  { name: 'ปูนซีเมนต์', qty: 8, unit: 'ถุง', src: 'mat', code: '0001000000000001' },
  { name: 'ทรายหยาบ', qty: '1.1', unit: 'ลบ.ม.', src: 'fixed', price: 400 },
  { name: 'น้ำ', qty: 0.3, unit: 'ลบ.ม.', src: 'none' },
  { name: 'ปูนทดสอบ', qty: 0.5, unit: 'ลบ.ม.', src: 'comp', comp: '7.9' },
  { name: 'ไม่มีปริมาณ', qty: '', unit: 'กก.', src: 'fixed', price: '' }] };
const U10 = { id: 'U-10', name: 'ซ้อน U-1', unit: 'ลบ.ม.', lines: [{ name: 'ปูนก่อเอง', qty: 2, unit: 'ลบ.ม.', src: 'comp', comp: 'U-1' }, { name: 'ค่าอื่น', qty: 1, unit: 'ลบ.ม.', src: 'fixed', price: 10 }] };
for (const c of [U1, U10]) {
  const mr = {}, o = oldToItems(c, mr), n = Survey.compToItems(c);
  chk(J(o.comp) === J(n.comp) && J(o.items) === J(n.items) && J(mr) === J(n.refs), `compToItems ${c.id} ตรงตัวแปลงเดิมของ Cost Hub ทุกช่อง`);
}

// ---- 2) compMerge: ถอดชุดเก่า ใส่ชุดใหม่ เรียงตามเลข ไม่แตะมวลรวมมาตรฐาน
const db0 = { compList: [{ id: '1', group: '7', sub: '7.9', name: 'มาตรฐาน', unit: 'ลบ.ม.' }], compItems: [{ compId: '1', seq: '1' }], matRef: { A: { compRef: '' } } };
let L = Survey.compMerge(db0, [U10, U1]);
chk(L.map(x => x.id).join() === 'U-1,U-10' && db0.compList.length === 3 && db0.compItems.length === 1 + 5 + 2 && Object.keys(db0.matRef).length === 1 + 2, 'compMerge ใส่ U-1, U-10 (เรียงตามเลข) + refs');
L = Survey.compMerge(db0, [U1]);
chk(db0.compList.length === 2 && db0.compItems.length === 6 && !db0.matRef['U:U-10:0'] && db0.matRef.A, 'compMerge รอบสอง: ถอด U-10 ออกหมด มาตรฐานอยู่ครบ');

// ---- 3) คิดราคาด้วยตัวคำนวณจริง
const PP = process.env.PRICING || require('path').join(__dirname, '../../udmaterial-price/lib/pricing-v1.js');
let UP = null; try { UP = require(PP); } catch (e) { console.log('SKIP ราคา — ไม่พบ pricing-v1.js (ตั้ง PRICING=…)'); }
if (UP) {
  const D = new UP.DB({
    materials: [{ code: '0001000000000001', name: 'ปูนซีเมนต์', unit: 'ถุง', price: 150, province: 'อุดรธานี' }],
    compList: [{ id: '1', group: '7', sub: '7.9', name: 'ปูนทดสอบ', unit: 'ลบ.ม.' }],
    compItems: [{ compId: '1', seq: '1', itemCode: 'A', itemName: 'ปูนซีเมนต์', qty: 2, unit: 'ถุง', commodityCode: '0001000000000001', fixedPrice: null }], matRef: {} });
  Survey.compMerge(D, [U1, U10]);
  const p = D.compPrice('U-1', { partial: true });
  // 8×150 + 1.1×400 + 0.5×(2×150=300) = 1200 + 440 + 150 = 1790 · ขาด: น้ำ (ไม่มีราคา) + ไม่มีปริมาณ
  chk(p && Math.abs(p.raw - 1790) < 1e-9 && !p.complete && p.missing.join() === '2,4', `U-1 ราคาบางส่วน 1790 ขาดบรรทัด 2,4 (ได้ ${p && p.raw} ขาด ${p && p.missing})`);
  const full = D.compPrice('U-1', { prices: { 2: 20, 4: 5 }, qty: { 4: 3 } });
  chk(full && full.price === 1811 && full.complete, `U-1 กรอกราคาน้ำ 20 + ปริมาณ 3×5 → 1790 + 6 + 15 = 1811 (ได้ ${full && full.price})`);
  chk(D.findComp('U-1') && D.findComp('U-1').custom, 'findComp("U-1") เจอ (ใช้ผูกในหน้าต่างผูกราคา)');
  // แถว BOQ ผูก U-1 ทั้งแถว (ผูกเอง) + กรอกราคาน้ำ/ปริมาณบรรทัดที่ขาด ผ่าน cmpline (เหมือนหน้าต่างผูกราคา 4b)
  const rc = [{ key: 'r', name: 'ก่อ', unit: 'ลบ.ม.', qty: 2, price_ref: { kind: 'mat_find' } }];
  const pr = cmp => { const x = BB.apply(rc, { r: { mat: { kind: 'comp', code: 'U-1' } } }, { cmp, db: D, U: UP, surveyOf: () => null }); return B.priceRows(D, UP, x.rows, { overrides: x.overrides })[0]; };
  const r0 = pr({});
  chk(r0 && r0.mat_unit === null, 'แถวผูก U-1 ยังขาดราคา → ยังไม่มีราคา');
  const r1 = pr({ r: { code: 'U-1', lines: {}, prices: { 2: 20, 4: 5 }, qty: { 4: 3 } } });
  chk(r1 && r1.mat_unit === 1811, `แถวผูก U-1 + กรอกบรรทัดที่ขาด → 1811 บ./ลบ.ม. (ได้ ${r1 && r1.mat_unit})`);
}

// ---- 4) เลิกผูกเมื่อลบ: compRefCodes / compGone / compUnlink
const sc = { code: '7.9', lines: { 0: { kind: 'comp', code: 'U-3' }, 1: { kind: 'mat', code: 'x' }, 2: { kind: 'comp', code: 'U-4' }, 3: { kind: 'survey', key: 'sub:B' } },
  sub: { 'U-3': { lines: { 0: { kind: 'comp', code: 'U-9' } } }, 'U-4': { lines: { 1: { kind: 'comp', code: 'U-3' }, 2: { kind: 'comp', code: '7.8' } } } } };
const refs = Survey.compRefCodes(sc);
chk([...refs].sort().join() === '7.8,U-3,U-4,U-9', 'compRefCodes รวมทุกชั้น (บรรทัด + ขอบเขตย่อย)');
const G = Survey.compGone(refs, ['U-4', 'U-9']);
chk([...G].join() === 'U-3', 'compGone: เฉพาะ U-n ที่ไม่มีแล้ว (ไม่นับรหัสมาตรฐาน 7.8)');
const n = Survey.compUnlink(sc, G);
chk(n === 2 && !sc.lines[0] && sc.lines[1] && sc.lines[2] && sc.lines[3] && !sc.sub['U-3'] && !sc.sub['U-4'].lines[1] && sc.sub['U-4'].lines[2], 'compUnlink: เลิกผูก U-3 ทั้งชั้นบนและในขอบเขต U-4 · ลบขอบเขต U-3 · บรรทัดอื่นอยู่ครบ');
chk(Survey.compUnlink(sc, new Set(['U-3'])) === 0 && Survey.compUnlink(null, ['U-1']) === 0, 'compUnlink ซ้ำ / ไม่มีขอบเขต → 0');
chk(Survey.compGone(['U-1', 'U-2'], new Set()).size === 2 && Survey.compGone(['U-PREVIEW'], []).size === 0, 'compGone ไม่นับรหัสชั่วคราว U-PREVIEW');

console.log(bad ? `ไม่ผ่าน ${bad} ข้อ` : 'ทั้งหมดผ่าน'); process.exit(bad ? 1 : 0);
