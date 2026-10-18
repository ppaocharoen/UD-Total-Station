// ทดสอบ lib/clash.js — รัน: node tools/test_clash.js
const C = require('../lib/clash.js');
const base = require('../examples/sample-building.bm.json');
let ok = true;
const check = (name, good, extra = '') => { ok = ok && !!good; console.log((good ? 'PASS ' : 'FAIL ') + name + ' ' + extra); };
const clone = () => JSON.parse(JSON.stringify(base));
const has = (r, code, sev, ...ids) => r.some(x => x.code === code && x.sev === sev && ids.every(i => x.ids.includes(i)));

// อาคารตัวอย่างเดิม: ท่อระบายอากาศ V-1 ชิดแนวคาน (ของจริงในตัวอย่าง) + ท้องคาน B1 กลางห้องต่ำกว่าฝ้า
let r = C.check(base);
check('ตัวอย่าง: ท่อ V-1 ลอดคานหลังคา B1-ROOF-04', has(r, 'A1', 'warn', 'V-1', 'B1-ROOF-04'));
check('ตัวอย่าง: ท้องคาน B1-ROOF-07 (+2.90) ต่ำกว่าฝ้า (+3.00)', has(r, 'B2', 'warn', 'B1-ROOF-07', 'FN-CL1') || has(r, 'B2', 'warn', 'FN-CL1'));
check('ตัวอย่าง: ไม่มี error', !r.some(x => x.sev === 'error'), r.filter(x => x.sev === 'error').map(x => x.title).join(' / '));
check('ตัวอย่าง: ระยะดิ่งสำนักงาน 3.00 ม. ผ่าน', !r.some(x => x.code === 'B3'));
check('แนวท่อประมาณไม่ขึ้นเป็น error/warn', r.filter(x => x.ids.some(i => /^(PP|EL)-/.test(i))).every(x => x.sev === 'info'));

// C1 เสาไม่มีฐานราก
let m = clone(); m.supports = m.supports.filter(s => s.id !== 'F1-1A');
check('C1 ลบฐานราก F1-1A → เสา C1-1A-1 ไม่มีที่รองรับ', has(C.check(m), 'C1', 'error', 'C1-1A-1'));
// B1 หน้าต่างสูงเกินท้องคาน
m = clone(); m.opening_types.W1.h = 1.8;     // หัว = 0.3+0.9+1.8 = 3.0 > ท้องคาน 2.9
check('B1 หน้าต่าง W1 สูงเกินท้องคาน', has(C.check(m), 'B1', 'error', 'W1-1'));
m = clone(); m.opening_types.W1.h = 1.65;    // หัว 2.85 ห่าง 0.05 < 0.10
check('B1 หน้าต่างชิดท้องคาน ไม่มีที่ใส่ทับหลัง', has(C.check(m), 'B1', 'warn', 'W1-1'));
// A4 ประตูทับเสา
m = clone(); m.openings.find(o => o.id === 'D1-1').at = 0.3;
check('A4 ประตู D1 ทับเสา C1-1A', has(C.check(m), 'A4', 'error', 'D1-1'));
// A3 ฐานรากซ้อน
m = clone(); m.supports.find(s => s.id === 'F1-2A').b = 8.5;
r = C.check(m); check('A3 ฐาน F1-2A กว้าง 8.5 ม. ซ้อน F1-1A และ F1-3A', has(r, 'A3', 'error', 'F1-1A', 'F1-2A') && has(r, 'A3', 'error', 'F1-2A', 'F1-3A'));
// A2 ถังบำบัดทับฐานราก
m = clone(); m.mep.plumbing.equipment.find(e => e.id === 'ST-1').xyz = [8.6, 4.0, -1.3];
check('A2 ถังบำบัดทับฐาน F1-3B', has(C.check(m), 'A2', 'error', 'ST-1', 'F1-3B'));
m = clone(); m.mep.plumbing.equipment.find(e => e.id === 'ST-1').xyz = [9.2, 3.5, -0.6];
check('A2 ถังบำบัดชิดฐาน (ห่าง 0.10 ม.)', has(C.check(m), 'A2', 'warn', 'ST-1', 'F1-3B'));
// B3 ระยะดิ่งห้องประชุม 3.50 ม.
m = clone(); m.slabs[0].use = 'ห้องประชุม';
check('B3 ห้องประชุมสูง 3.00 < 3.50 ม.', has(C.check(m), 'B3', 'error', 'S1-1F'));
// B4 บันไดอาคารสาธารณะ
m = clone(); m.stairs = [{ id: 'ST1', flights: [{ start: [1.0, 1.0], dir: '+X', width: 0.9, bottom: 0.3, top: 2.9, risers: 13, going: 0.25 }] }];
r = C.check(m, { buildingType: 'public' });
check('B4 บันไดกว้าง 0.90 / ลูกตั้ง 0.20 ไม่ผ่านข้อ 24', has(r, 'B4', 'error', 'ST1') && r.find(x => x.code === 'B4').detail.includes('ลูกตั้ง'));
check('B4 ระยะดิ่งใต้คาน B1 < 2.10 ม.', r.some(x => x.code === 'B4' && x.title.includes('ระยะดิ่ง')));
r = C.check(m, { buildingType: 'residential' });
check('B4 อาคารอยู่อาศัย: กว้าง 0.90 ลูกตั้ง 0.20 ผ่านข้อ 23', !r.some(x => x.code === 'B4' && x.title.includes('ไม่ผ่าน')));
// C3 ผนังวางบนพื้นวางบนดิน
m = clone(); m.walls.push({ id: 'W-MID', kind: 'brick_mon', t: 0.1, path: [[0.5, 2.0], [3.5, 2.0]], bottom: 0.3, top: 2.9 });
check('C3 ผนังกลางห้องวางบนพื้นวางบนดิน (info)', has(C.check(m), 'C3', 'info', 'W-MID'));
m.walls[m.walls.length - 1].bottom = 1.0;
check('C3 ผนังลอย (ไม่มีอะไรรับ) = error', has(C.check(m), 'C3', 'error', 'W-MID'));
// C2 ปลายคานลอย
m = clone(); m.nodes.push({ id: 'N-X', x: -2.0, y: 0.0, z: 3.3 });
m.members.push({ id: 'B9', mark: 'B9', type: 'beam', i: 'N-1A-R', j: 'N-X', section: 'RC-20x40', material: 'C240' });
check('C2 คาน B9 ปลายลอย', has(C.check(m), 'C2', 'error', 'B9'));
// A1 ท่อที่เขียนไว้ลอดเสา = error
m = clone(); m.mep.plumbing.pipes.push({ id: 'P-X', system: 'cw', dia: '1/2"', pts: [[-0.5, 0.0, 1.0], [0.5, 0.0, 1.0]] });
check('A1 ท่อ P-X ลอดเสา C1-1A-2 = error', has(C.check(m), 'A1', 'error', 'P-X', 'C1-1A-2'));

console.log(ok ? '\nทั้งหมดผ่าน' : '\nมีที่ไม่ผ่าน');
process.exit(ok ? 0 : 1);
