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
check('ตัวอย่าง: ไม่มี error (นอกจาก D1 ไม่มีห้องส้วมผู้พิการ — ถูกตามกฎหมาย)', !r.some(x => x.sev === 'error' && x.code !== 'D1'), r.filter(x => x.sev === 'error').map(x => x.title).join(' / '));
check('ตัวอย่าง: D1 ไม่มีห้องส้วมผู้พิการ', r.some(x => x.code === 'D1' && x.sev === 'error'));
check('ตัวอย่าง อาคารอยู่อาศัย: ไม่ตรวจกลุ่ม D', !C.check(base, { buildingType: 'residential' }).some(x => /^D/.test(x.code)));
check('ตัวอย่าง: ระยะดิ่งสำนักงาน 3.00 ม. ผ่าน', !r.some(x => x.code === 'B3'));
check('แนวท่อประมาณไม่ขึ้นเป็น error/warn', r.filter(x => x.ids.some(i => /^(PP|EL)-/.test(i))).every(x => x.sev === 'info'));

// C1 เสาไม่มีฐานราก
let m = clone(), m2; m.supports = m.supports.filter(s => s.id !== 'F1-1A');
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
m2 = clone(); m2.stairs = [{ id: 'STX', flights: [{ start: [1.0, -0.5], dir: '+Y', width: 0.9, bottom: 0.0, top: 0.8, risers: 4, going: 0.25 }] }];
r = C.check(m2); check('A5 ขั้นบันไดผ่านคาน/เสาแนว A ชั้นล่าง = error', r.some(x => x.code === 'A5' && x.ids.includes('STX')));
m2.stairs[0].flights[0].start = [3.0, 1.5]; r = C.check(m2); check('A5 บันไดกลางห้องไม่ชน', !r.some(x => x.code === 'A6'));
r = C.check(m, { buildingType: 'residential' });
check('B4 อาคารอยู่อาศัย: กว้าง 0.90 ลูกตั้ง 0.20 ผ่านข้อ 23', !r.some(x => x.code === 'B4' && x.title.includes('ไม่ผ่าน')));
// C3 ผนังวางบนพื้นวางบนดิน
m = clone(); m.walls.push({ id: 'W-MID', kind: 'brick_mon', t: 0.1, path: [[0.5, 2.0], [3.5, 2.0]], bottom: 0.3, top: 2.9 });
check('C3 ผนังกลางห้องวางบนพื้นวางบนดิน (info)', has(C.check(m), 'C3', 'info', 'W-MID'));
m.walls[m.walls.length - 1].bottom = 1.0;
check('C3 ผนังลอย (ไม่มีอะไรรับ) = error', has(C.check(m), 'C3', 'error', 'W-MID'));
m.walls[m.walls.length - 1].attached = true;
r = C.check(m); check('C3 ส่วนตกแต่งยึดกับโครงสร้าง (attached) = info ไม่ใช่ error', has(r, 'C3', 'info', 'W-MID') && !has(r, 'C3', 'error', 'W-MID'));
{ const w0 = base.walls.find(w => (base.members.some(x => x.type === 'beam'))); m = clone(); const w = m.walls.find(x => x.id === w0.id); const b0 = w.bottom;
  w.bottom = b0 + 0.10; check('C3 ฐานผนังสูงกว่าหลังคาน 0.10 (ชั้นพื้น/ปรับระดับ) ยังถือว่าคานรับ', !has(C.check(m), 'C3', 'error', w.id) && !has(C.check(m), 'C3', 'warn', w.id));
  w.bottom = b0 + 0.20; check('C3 ฐานผนังสูงกว่าหลังคาน 0.20 → ไม่ถือว่าคานรับ', has(C.check(m), 'C3', 'error', w.id) || has(C.check(m), 'C3', 'warn', w.id) || has(C.check(m), 'C3', 'info', w.id)); }
// C4 ปลายจันทันฝังในตะเข้ (ไม่มีจุดต่อร่วม) = ต่อแล้ว · ปลายชายคาอีกข้างยื่นอิสระได้
m = clone(); m.sections.push({ id: 'BX', kind: 'cold_formed', shape: 'box', name: 'BOX100x100', b: 0.1, h: 0.1, kg_m: 10 });
m.nodes.push({ id: 'H1', x: 0, y: 0, z: 5 }, { id: 'H2', x: 4, y: 4, z: 5 }, { id: 'R1', x: 2, y: 2.02, z: 5 }, { id: 'R2', x: 2, y: 6, z: 4.6 });
m.members.push({ id: 'HPX', type: 'hip', i: 'H1', j: 'H2', section: 'BX', material: 'C240' }, { id: 'RFX', type: 'rafter', i: 'R1', j: 'R2', section: 'BX', material: 'C240' });
r = C.check(m); check('C4 จันทันชนตะเข้ (ปลายอยู่ในชิ้นตะเข้) ไม่ขึ้นเตือน', !has(r, 'C4', 'warn', 'RFX'));
// C4 อะเสวางบนหัวเสา/ชนอะเสอีกตัว (ไม่มีจุดต่อร่วม) = ต่อแล้ว · อะเสลอยไม่แตะชิ้นใด = เตือน
m = clone(); m.sections.push({ id: 'CX', kind: 'cold_formed', shape: 'c', name: 'C100x50x20x2.3', kg_m: 4 });
m.nodes.push({ id: 'KA', x: 20, y: 0, z: 0 }, { id: 'KB', x: 20, y: 0, z: 3 }, { id: 'KC', x: 24, y: 0, z: 0 }, { id: 'KD', x: 24, y: 0, z: 3 },
  { id: 'PA', x: 20, y: 0, z: 3.05 }, { id: 'PB', x: 24, y: 0, z: 3.05 }, { id: 'QA', x: 19.925, y: 0, z: 3.05 }, { id: 'QB', x: 19.925, y: 3, z: 3.05 },
  { id: 'FA', x: 30, y: 0, z: 6 }, { id: 'FB', x: 32, y: 0, z: 6 });
m.members.push({ id: 'KC1', type: 'column', i: 'KA', j: 'KB', section: 'RC-20x20', material: 'C240' }, { id: 'KC2', type: 'column', i: 'KC', j: 'KD', section: 'RC-20x20', material: 'C240' },
  { id: 'PLX', type: 'steel_beam', i: 'PA', j: 'PB', section: 'CX', material: 'C240' }, { id: 'PLY', type: 'steel_beam', i: 'QA', j: 'QB', section: 'CX', material: 'C240' },
  { id: 'PLF', type: 'steel_beam', i: 'FA', j: 'FB', section: 'CX', material: 'C240' });
r = C.check(m); check('C4 อะเสวางบนหัวเสา (ปลายแตะหัวเสา ไม่มีจุดต่อร่วม) ไม่ขึ้นเตือน', !has(r, 'C4', 'warn', 'PLX'));
check('C4 อะเสอีกแนวที่ปลายวางบนหัวเสา ปลายอีกข้างยื่น ไม่ขึ้นเตือน', !has(r, 'C4', 'warn', 'PLY'));
check('C4 อะเสลอยไม่แตะชิ้นใด ยังขึ้นเตือน', has(r, 'C4', 'warn', 'PLF'));
// C2 ปลายคานลอย
m = clone(); m.nodes.push({ id: 'N-X', x: -3.0, y: 0.0, z: 3.3 });
m.members.push({ id: 'B9', mark: 'B9', type: 'beam', i: 'N-1A-R', j: 'N-X', section: 'RC-20x40', material: 'C240' });
check('C2 คาน B9 ปลายลอย (ยาว > 2 ม.) = error', has(C.check(m), 'C2', 'error', 'B9'));
m.nodes.find(n => n.id === 'N-X').x = -1.5;
check('C2 คานยื่นสั้นจากเสา ปลายอิสระ = info', has(C.check(m), 'C2', 'info', 'B9'));
// A1 ท่อที่เขียนไว้ลอดเสา = error
m = clone(); m.mep.plumbing.pipes.push({ id: 'P-X', system: 'cw', dia: '1/2"', pts: [[-0.5, 0.0, 1.0], [0.5, 0.0, 1.0]] });
check('A1 ท่อ P-X ลอดเสา C1-1A-2 = error', has(C.check(m), 'A1', 'error', 'P-X', 'C1-1A-2'));

// A6 ท่อฝังพื้นโผล่พ้นพื้นสำเร็จ · A1 ท่อผ่านคานเอ็น (แบบจำลองเล็กสร้างเอง)
{
  const mk = (z, extra) => ({ nodes: [{ id: 'a', x: 0, y: 0, z: 0.6 }, { id: 'b', x: 4, y: 0, z: 0.6 }], sections: [{ id: 'L', kind: 'rc_rect', b: 0.1, h: 0.15 }],
    members: [{ id: 'LS', type: 'lintel', mark: 'คานเอ็น', i: 'a', j: 'b', section: 'L' }],
    slabs: [{ id: 'S1', kind: 'ground', t: 0.12, top: 0.15, finish_t: 0.05, polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
    walls: [{ id: 'W1', kind: 'brick', t: 0.1, path: [[0, 0], [4, 0]], bottom: 0.15, top: 2.8 }],
    mep: { plumbing: { pipes: [Object.assign({ id: 'P1', system: 'waste', dia: '2"', pts: [[1, 0, z], [1, 0.5, z]] }, extra || {})] } } });
  check('A6 ท่อ 2" ศูนย์ +0.18 หลังท่อ +0.21 > พื้นสำเร็จ +0.20 = warn', has(C.check(mk(0.18)), 'A6', 'warn', 'P1', 'S1'));
  check('A6 ท่อ 2" ศูนย์ +0.16 หลังท่อ +0.19 ไม่เตือน', !C.check(mk(0.16)).some(x => x.code === 'A6'));
  check('A6 ท่อที่ระบุ exposed ไม่เตือน', !C.check(mk(0.18, { exposed: true })).some(x => x.code === 'A6'));
  check('A6 ท่อเดินลอยเหนือพื้น (+0.50) ไม่เตือน', !C.check(mk(0.50)).some(x => x.code === 'A6'));
  const v = mk(0.16); v.mep.plumbing.pipes.push({ id: 'P2', system: 'cw', dia: '1"', pts: [[2, 0, 0.2], [2, 0, 1.4]] });
  check('A1 ท่อขึ้นในผนังผ่านคานเอ็น LS = warn', has(C.check(v), 'A1', 'warn', 'P2', 'LS'));
  v.mep.plumbing.pipes[1].sleeve = 'LS';
  check('A1 ท่อที่ระบุฝังปลอกผ่านคานเอ็น = info', has(C.check(v), 'A1', 'info', 'P2', 'LS') && !has(C.check(v), 'A1', 'warn', 'P2', 'LS'));
  delete v.mep.plumbing.pipes[1].sleeve;
  v.mep.plumbing.pipes[1].pts = [[2, 0.2, 0.2], [2, 0.2, 1.4]];
  check('A1 ท่อขึ้นห่างคานเอ็น ไม่เตือน', !has(C.check(v), 'A1', 'warn', 'P2', 'LS'));
}

// ประเภทอาคารตามกฎหมาย
let L = C.classify(clone());
check('ความสูงตามกฎหมาย หลังคาจั่ว = ยอดผนัง 2.90 ม.', Math.abs(L.H - 2.9) < 1e-6);
check('พื้นที่รวม 32 ตร.ม. · ช่วงโครงหลังคา 4.00 ม.', L.areaTotal === 32 && L.roofSpan === 4);
check('อาคารตัวอย่างไม่เข้าข่ายประเภทพิเศษ', !L.items.some(i => i.yes));
check('เจ้าของเทศบาล → หมายเหตุ ม.7', L.notes.some(n => n.includes('ม.7')));
m = clone(); m.roofs[0].outline = [[-0.8, -0.8], [8.8, -0.8], [8.8, 11.8], [-0.8, 11.8]];
L = C.classify(m); check('โครงหลังคาช่วง 11 ม. → อาคารพิเศษ (ค)', L.roofSpan === 11 && L.items.find(i => i.name.startsWith('อาคารพิเศษ')).yes);
m = clone(); m.roofs.forEach(r => { r.form = 'flat'; }); m.slabs.push({ id: 'S-R', kind: 'roof', level: 'ROOF', t: 0.1, top: 24.0, polygon: [[0, 0], [8, 0], [8, 4], [0, 4]] });
L = C.classify(m); check('หลังคาแบน ดาดฟ้า +24.00 → อาคารสูง', L.H === 24 && L.items[0].yes);
// นับชั้นจากพื้นที่ใช้งาน (M5 · 25 พ.ย. 2569)
const T12 = require('../examples/t12/t12.bm.json');
L = C.classify(T12);
check('ท12: พื้นหลายระดับ (+0.05/+0.15/+0.20) + ถัง + ทางลาด = 1 ชั้น', L.storeys === 1, `ได้ ${L.storeys}`);
check('ท12: ไม่เข้าวัสดุทนไฟ/บันไดหนีไฟ', !L.items.some(i => i.yes), L.items.filter(i => i.yes).map(i => i.name).join(' / '));
check('ท12: พื้นที่ไม่รวมพื้นถัง/ทางลาด แต่รวมทางเดินรอบอาคาร', L.areaTotal > 80 && L.areaTotal < 100, L.areaTotal);
const sq = (z, s) => ({ id: 'X' + z, kind: 'cast', t: 0.12, top: z, polygon: [[0, 0], [10, 0], [10, 10], [0, 10]], ...(s ? { storey: s } : {}) });
m = clone(); m.slabs = [sq(0.3), sq(1.2), sq(3.5), sq(6.7)];
L = C.classify(m); check('ไม่มี storey: +0.30/+1.20 ชั้นเดียว · +3.50 · +6.70 → 3 ชั้น', L.storeys === 3 && L.areaMax === 200, `${L.storeys} ${L.areaMax}`);
m = clone(); m.slabs = [sq(0.3, 1), sq(1.8, 2), sq(3.5, 2)];
L = C.classify(m); check('ใช้ storey ตามแปลนเมื่อมี → 2 ชั้น (ชั้นลอยต่างระดับ 1.5 ม.)', L.storeys === 2, L.storeys);

// กฎกระทรวง 55 ข้อ 33/41/44/50
const SB = clone().site.existing.boundary, st = (r, c) => (r.find(x => x.code === c) || {}).status;
let R = C.siteCheck(clone(), {});
check('ไม่มีข้อมูลที่ดิน → ข้อมูลไม่ครบทุกข้อ (ไม่ตัดสิน) · ข้อ 42/45–46 ไม่บังคับเมื่อไม่ระบุ', R.every(x => x.status === (/ข้อ 4[256]\b|ข้อ 45\/46/.test(x.code) && x.code !== 'ข้อ 44' ? 'na' : 'missing')), JSON.stringify(R.map(x => x.code + ':' + x.status)));
R = C.siteCheck(clone(), { boundary: SB, off: { c33: 1, c41: 1, c42: 1, c43: 1, c44: 1, c45: 1, c50: 1 } });
check('ปิดทุกข้อ → ไม่คิด', R.every(x => x.status === 'off'));
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }] });
check('ตัวอย่าง ถนน 8 ม. ด้านใต้ → ผ่านทุกข้อ', ['ข้อ 33', 'ข้อ 41', 'ข้อ 44', 'ข้อ 50'].every(c => st(R, c) === 'pass'));
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [] });
check('ไม่ระบุถนน → ข้อ 41/44 ข้อมูลไม่ครบ แต่ข้อ 50 ยังตรวจ', st(R, 'ข้อ 41') === 'missing' && st(R, 'ข้อ 50') === 'pass');
const near = [[-1, -1], [13, -1], [13, 9], [-1, 9]];   // เขตที่ดินห่างผนังมีประตู W-A12 แค่ 1 ม.
R = C.siteCheck(clone(), { boundary: near, use: 'public', roads: [{ edge: 0, width: 4 }] });
check('ผนังมีช่องเปิดห่างเขต 1 ม. → ข้อ 50 ไม่ผ่าน', st(R, 'ข้อ 50') === 'fail');
check('ถนน 4 ม. อาคารสาธารณะ ห่างกึ่งกลาง 3 ม. < 6 → ข้อ 41 ไม่ผ่าน', st(R, 'ข้อ 41') === 'fail');
R = C.siteCheck(clone(), { landArea: 40, use: 'res' });
check('ที่ดิน 40 ตร.ม. อยู่อาศัย (ปกคลุม 53.76) → ข้อ 33 ไม่ผ่าน', st(R, 'ข้อ 33') === 'fail');

// ข้อ 42 แหล่งน้ำ · ข้อ 45 ถนนขนาบ · ข้อ 46 หัวมุม (อาคารห่างเขตทุกด้าน 5 ม.)
const all = (r, c) => r.filter(x => x.code === c);
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }, { edge: 2, width: 12 }], waters: [{ edge: 1, width: 8 }] });
check('คลองกว้าง 8 ม. ห่าง 5 ม. ≥ 3 → ข้อ 42 ผ่าน', st(R, 'ข้อ 42') === 'pass');
check('ถนน 8/12 ม. ขนาบ ห่าง 14 ม. → ข้อ 45 ผ่าน และข้อ 44 ถนนแคบใช้ข้อ 45 แทน', st(R, 'ข้อ 45') === 'pass' && all(R, 'ข้อ 44').some(x => x.status === 'na' && /ข้อ 45/.test(x.detail)));
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }, { edge: 1, width: 12 }], waters: [{ edge: 3, width: 12 }] });
check('แหล่งน้ำกว้าง 12 ม. ห่าง 5 ม. < 6 → ข้อ 42 ไม่ผ่าน', st(R, 'ข้อ 42') === 'fail');
check('ถนน 8/12 ม. หัวมุม → ข้อ 46 ผ่าน (ยาวตามถนนแคบ ≤ 60 ม.)', st(R, 'ข้อ 46') === 'pass');
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }], waters: [{ edge: 3, kind: 'large' }] });
check('ทะเลสาบ ห่าง 5 ม. < 12 → ข้อ 42 ไม่ผ่าน · ถนนสายเดียว → ข้อ 45/46 ไม่บังคับ', st(R, 'ข้อ 42') === 'fail' && st(R, 'ข้อ 45/46') === 'na');
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }, { edge: 2, width: 8 }] });
check('ถนนสองสายกว้างเท่ากัน → ข้อ 45/46 ไม่บังคับ', st(R, 'ข้อ 45/46') === 'na');
const tall = clone(); tall.levels.push({ name: 'X', z: 40 }); tall.slabs.push({ id: 'S-T', kind: 'roof', level: 'X', t: 0.1, top: 40, polygon: [[0, 0], [8, 0], [8, 4], [0, 4]] }); tall.roofs.forEach(r => { r.form = 'flat'; });
R = C.siteCheck(tall, { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }, { edge: 1, width: 12 }] });
check('สูง 40 ม. หัวมุม ระยะถึงฝั่งตรงข้ามถนนกว้าง 17 ม. → ข้อ 46 ไม่ผ่าน', st(R, 'ข้อ 46') === 'fail', JSON.stringify(R.filter(x => x.code === 'ข้อ 46')));

// M5 ก้อน 2: ข้อ 20 ห้องนอน · ข้อ 21 ทางเดิน · ข้อ 24 ชานพัก/1.50 ม. · ข้อ 25 ระยะถึงบันได · ข้อ 43 · ข้อ 50 ระเบียง
const pg = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
m = clone(); m.slabs[0].use = 'ห้องนอน'; m.slabs[0].polygon = pg(0, 0, 2.4, 4);
check('B5 ห้องนอนแคบ 2.40 ม.', has(C.check(m, { buildingType: 'residential' }), 'B5', 'error', m.slabs[0].id));
m.slabs[0].polygon = pg(0, 0, 2.6, 3); check('B5 ห้องนอน 7.8 ตร.ม. < 8', has(C.check(m, { buildingType: 'residential' }), 'B5', 'error', m.slabs[0].id));
m.slabs[0].polygon = pg(0, 0, 2.6, 3.2); check('B5 ห้องนอน 2.60×3.20 ผ่าน', !C.check(m, { buildingType: 'residential' }).some(x => x.code === 'B5'));
m = clone(); m.slabs[0].use = 'ทางเดิน'; m.slabs[0].polygon = [[0, 0], [8, 0], [8, 1.2], [1.6, 1.2], [1.6, 6], [0, 6]];   // รูป L แขนกว้าง 1.20/1.60
r = C.check(m); check('B6 ทางเดินรูป L แคบสุด 1.20 < 1.50 (สาธารณะ)', r.some(x => x.code === 'B6' && x.title.includes('1.20')), r.filter(x => x.code === 'B6').map(x => x.title).join());
check('B6 อาคารอยู่อาศัย 1.20 ≥ 1.00 ผ่าน', !C.check(m, { buildingType: 'residential' }).some(x => x.code === 'B6'));
m.slabs[0].use = 'ทางเดินรอบอาคาร'; check('B6 ทางเดินรอบอาคารไม่ตรวจ', !C.check(m).some(x => x.code === 'B6'));
const two = () => { const v = clone(); v.slabs = [{ id: 'G', kind: 'cast', t: 0.12, top: 0.3, polygon: pg(0, 0, 20, 20) }, { id: 'U', kind: 'cast', t: 0.12, top: 3.6, polygon: pg(0, 0, 20, 20) }];
  v.stairs = [{ id: 'ST1', flights: [{ start: [1, 1], dir: '+Y', width: 1.2, bottom: 0.3, top: 1.95, risers: 10, going: 0.25 }, { start: [2.2, 3.5], dir: '-Y', width: 1.2, bottom: 1.95, top: 3.6, risers: 10, going: 0.25 }],
    landings: [{ rect: [1, 3.5, 3.4, 4.5], top: 1.95, t: 0.15 }] }]; return v; };
m = two(); r = C.check(m);
check('B4 ชานพักลึก 1.00 < กว้างบันได 1.20', has(r, 'B4', 'error', 'ST1') && r.some(x => x.title.includes('ชานพัก')));
check('B4 พื้นชั้นบน 400 ตร.ม. > 300 → บันได 1.20 < 1.50', r.some(x => x.code === 'B4' && x.title.includes('< 1.50')));
m.stairs.push({ id: 'ST2', flights: [{ start: [15, 15], dir: '+Y', width: 1.2, bottom: 0.3, top: 3.6, risers: 18, going: 0.25 }] });
check('B4 มี 2 บันไดกว้าง ≥ 1.20 → ไม่ต้อง 1.50', !C.check(m).some(x => x.code === 'B4' && x.title.includes('< 1.50')));
m = two(); m.slabs[1].polygon = pg(0, 0, 40, 10); r = C.check(m);
check('B7 มุมไกลสุด (40,10) ห่างหัวบันได > 40 ม.', r.some(x => x.code === 'B7' && x.sev === 'error'), r.filter(x => x.code === 'B7').map(x => x.title).join());
m.slabs[1].polygon = pg(0, 0, 20, 20); check('B7 ชั้นบน 20×20 ผ่าน', !C.check(m).some(x => x.code === 'B7'));
m.stairs = []; check('B7 ชั้นบนไม่มีบันไดขึ้นถึง → เตือน', C.check(m).some(x => x.code === 'B7' && x.sev === 'warn'));
check('B7 ไม่ตรวจอาคารอยู่อาศัย', !C.check(two(), { buildingType: 'residential' }).some(x => x.code === 'B7'));
R = C.siteCheck(clone(), { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }] });
check('ข้อ 43 อาคารสาธารณะ ชายคา +3.01 ยื่นเลยแนวอาคาร 0.80 ม. → ไม่ผ่าน', st(R, 'ข้อ 43') === 'fail');
R = C.siteCheck(clone(), { boundary: SB, use: 'res', roads: [{ edge: 0, width: 8 }] });
check('ข้อ 43 บ้านชั้นเดียว ถนน 8 ม. → ไม่บังคับ (ข้อ 41 ไม่กำหนด)', st(R, 'ข้อ 43') === 'na');
m = clone(); m.slabs.push({ id: 'BAL', kind: 'cast', t: 0.1, top: 0.3, use: 'ระเบียง', polygon: pg(-4, 0, 0, 4) });
R = C.siteCheck(m, { boundary: SB, use: 'public', roads: [{ edge: 0, width: 8 }] });
check('ข้อ 50 ระเบียงห่างเขต 1.00 ม. < 2 ม. → ไม่ผ่าน', st(R, 'ข้อ 50') === 'fail' && R.find(x => x.code === 'ข้อ 50').detail.includes('BAL'));

// M5 ก้อน 2b: สิ่งอำนวยความสะดวกผู้พิการ 2548 + ฉบับที่ 2 (2564)
const t12 = () => JSON.parse(JSON.stringify(T12)), dOf = (v, c) => C.check(v).filter(x => x.code === c);
r = C.check(T12);
check('ท12: D มีแค่ทางลาดไม่มีราว (ข้อสังเกต) + รายการตรวจในแบบ', r.filter(x => /^D/.test(x.code)).map(x => x.code + x.sev).sort().join() === 'D0info,D3warn', r.filter(x => /^D/.test(x.code)).map(x => x.code + ':' + x.title).join(' / '));
let v = t12(); v.slabs.find(x => x.id === 'S-DIS').polygon = [[4.25, 0.95], [6.45, 0.95], [6.45, 2.2], [4.25, 2.2]];
check('D2 ห้องผู้พิการเล็กลง → วงหมุน < 1.50', dOf(v, 'D2').some(x => x.sev === 'error' && x.title.includes('หมุน')));
v = t12(); v.opening_types.DR2.desc = 'ประตูบานเปิด ช่อง 0.90'; v.opening_types.DR2.w = 0.9;
check('D2 ประตูบานเปิด สุทธิ 0.80 < 0.86 + ต้องเลื่อน/เปิดออก', dOf(v, 'D2').some(x => x.sev === 'error' && x.title.includes('0.80')) && dOf(v, 'D2').some(x => x.sev === 'warn' && x.title.includes('บานเลื่อน')));
v = t12(); v.opening_types.DR2.desc = 'ประตูบานเลื่อน สุทธิ 0.88';
check('D2 ประตู 0.88 ผ่าน 2564 ต่ำกว่า 2548 → info', dOf(v, 'D2').some(x => x.sev === 'info' && x.title.includes('0.88')));
v = t12(); v.finishes.find(f => f.id === 'FF-DIS').z = 0.28; check('D2 พื้นต่างระดับ 3 ซม. → error', dOf(v, 'D2').some(x => x.sev === 'error' && x.title.includes('3.0 ซม.')));
v.finishes.find(f => f.id === 'FF-DIS').z = 0.265; check('D2 ต่างระดับ 1.5 ซม. (ผ่าน 2548) → ข้อสังเกต', dOf(v, 'D2').some(x => x.sev === 'warn' && x.title.includes('1.5 ซม.')));
v = t12(); v.finishes = v.finishes.filter(f => !/ราว/.test(f.spec || '')); check('D2 ไม่มีราวจับ → error', dOf(v, 'D2').some(x => x.sev === 'error' && x.title.includes('ราวจับ')));
v = t12(); v.slabs = v.slabs.filter(x => x.id !== 'S-DIS'); v.mep.plumbing.fixtures.forEach(f => { f.room = String(f.room || '').replace('คนพิการ', 'X'); });
check('D1 ลบห้องผู้พิการ → error', dOf(v, 'D1').length === 1);
v = t12(); v.slabs.find(x => x.id === 'S-RAMP').ramp.low = -0.02; check('D3 ทางลาดชัน 1:10 → error', dOf(v, 'D3').some(x => x.sev === 'error' && x.detail.includes('1:10')));
v = t12(); v.slabs.find(x => x.id === 'S-RAMP').polygon = [[2.4, -1.1], [5.4, -1.1], [5.4, -0.1], [2.4, -0.1]]; v.slabs.find(x => x.id === 'S-RAMP').ramp.low = -0.03;
check('D3 ทางลาดยาว 3.00 ไม่มีราว (ไม่ผ่านทั้ง 2548) → error', dOf(v, 'D3').some(x => x.sev === 'error' && x.title.includes('ราวจับ')));
v = t12(); v.finishes.push({ id: 'RL', kind: 'other', spec: 'ราวจับสแตนเลส Ø 1½"', room: 'ทางลาด', note: 'สองด้านทางลาด' });
check('D3 มีราวทางลาด → ไม่เตือน', !dOf(v, 'D3').length);
m = two(); check('D4 อาคาร 2 ชั้นไม่มีลิฟต์/ทางลาด → error', C.check(m).some(x => x.code === 'D4'));
check('D5 บันได 16.5/25 ซม. รวม 41.5 < 43 → error', C.check(m).some(x => x.code === 'D5' && x.detail.includes('41.5')));
check('ปิดการตรวจผู้พิการ opts.access=false', !C.check(m, { access: false }).some(x => /^D/.test(x.code)));
console.log(ok ? '\nทั้งหมดผ่าน' : '\nมีที่ไม่ผ่าน');
process.exit(ok ? 0 : 1);
