// ทดสอบ lib/rebartk.js เทียบกับ tools/takeoff.py แถวต่อแถว — รัน: node tools/test_rebartk.js
const T = require('../lib/rebartk.js');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const base = require('../examples/sample-building.bm.json');
let ok = true, n = 0;
const check = (name, good, extra = '') => { n++; ok = ok && !!good; if (!good) console.log('FAIL ' + name + ' ' + extra); };
const clone = o => JSON.parse(JSON.stringify(o));
const strip = r => { const x = Object.assign({}, r); delete x.price_ref; return x; };
const canon = v => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)) ? Object.fromEntries(Object.keys(val).sort().map(kk => [kk, val[kk]])) : val);

function viaPython(m) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbtk-')), f = path.join(dir, 'm.bm.json');
  fs.writeFileSync(f, JSON.stringify(m));
  execFileSync('python3', [path.join(__dirname, 'takeoff.py'), f, '--write'], { stdio: 'pipe' });
  const out = JSON.parse(fs.readFileSync(f, 'utf8'));
  const h = execFileSync('python3', ['-c', `import json,sys;sys.path.insert(0,${JSON.stringify(__dirname)});from validate import canonical_hash;m=json.load(open(${JSON.stringify(f)}));print(canonical_hash(m,["design"]))`]).toString().trim();
  return { rows: out.quantities.items.filter(r => r.group_code === '1.1.9'), piles: out.quantities.items.filter(r => r.group_code === '1.1.5' || r.group_code === '1.1.10' || T.EXTRA_RE.test(r.key)), all: out.quantities.items, q: out.quantities, hash: h };
}
async function cmp(label, m) {
  const py = viaPython(m), js = T.compute(m);
  check(`${label}: จำนวนแถว`, py.rows.length === js.length, `py ${py.rows.length} js ${js.length}`);
  py.rows.forEach((r, i) => {
    const a = canon(strip(r)), b = canon(strip(js[i] || {}));
    check(`${label}: ${r.key}`, a === b, '\n py ' + a.slice(0, 600) + '\n js ' + b.slice(0, 600));
  });
  const jp = T.computePiles(m).concat(T.computePlates(m));
  const order = ['1.1.2', '1.1.4', '1.1.5', '1.1.7', '1.1.10', '1.1.12']; py.piles.sort((a, b) => order.indexOf(a.group_code) - order.indexOf(b.group_code)); jp.push(...T.computeExtras(m)); jp.sort((a, b) => order.indexOf(a.group_code) - order.indexOf(b.group_code));
  check(`${label}: จำนวนแถวเข็ม`, py.piles.length === jp.length, `py ${py.piles.length} js ${jp.length}`);
  py.piles.forEach((r, i) => { const a = canon(strip(r)), b = canon(strip(jp[i] || {})); check(`${label}: ${r.key}`, a === b, '\n py ' + a + '\n js ' + b); });
  // apply บนผล Python ต้องได้ items เท่าเดิม (ยกเว้น src/price_ref คงเดิม)
  const mm = clone(m); mm.quantities = clone(py.q); mm.quantities.items = mm.quantities.items.filter(r => r.group_code !== '1.1.9' && r.group_code !== '1.1.5' && r.group_code !== '1.1.10' && !T.EXTRA_RE.test(r.key));
  T.apply(mm);
  check(`${label}: apply ลำดับแถว`, mm.quantities.items.map(r => r.key).join() === py.all.map(r => r.key).join(), '\n' + mm.quantities.items.map(r => r.key).join() + '\n' + py.all.map(r => r.key).join());
  check(`${label}: hash design ตรง Python`, (await T.designHash(m)) === py.hash, `${await T.designHash(m)} vs ${py.hash}`);
}
(async () => {
  await cmp('ตัวอย่างเดิม', clone(base));
  // ใส่ผลออกแบบหลายแบบ: เสริมพิเศษ ปลอกคู่ ปลอกระยะต่างกัน พื้นตะแกรง/ตะแกรงสำเร็จรูป ฐานรากใหม่
  const m = clone(base), D = m.design.members;
  const beams = m.members.filter(x => x.type === 'beam' || x.type === 'tie_beam');
  beams.forEach((b, i) => { D[b.id] = { method: 'WSD', rebar: { top: [2, 12 + 4 * (i % 2)], bot: [3, 16], stirrup: [6, 0.175, 0.125], ...(i % 3 === 0 ? { extra_top: [2, 16] } : {}), ...(i % 4 === 1 ? { extra_bot: [1, 20], double_stirrup: true } : {}) }, pass: true, ratio: 0.8123, status: 'computed', src: 'test' }; });
  m.members.filter(x => x.type === 'column').forEach((c, i) => { D[c.id] = { rebar: { main: [4, i % 2 ? 16 : 12], stirrup: [6, 0.15], ...(i === 3 ? { double_stirrup: true } : {}) }, status: 'computed' }; });
  m.design.slabs = { [m.slabs[0].id]: { rebar: { mesh: [9, 0.2, 2] }, status: 'computed' } };
  await cmp('ออกแบบใหม่ + ตะแกรง', m);
  const m2 = clone(m); m2.design.slabs[m.slabs[0].id].rebar = { wire_mesh: 'WM-4@0.20' }; delete m2.design.supports[Object.keys(m2.design.supports)[0]];
  await cmp('ตะแกรงสำเร็จรูป + ฐานไม่มีเหล็ก', m2);
  const m3 = clone(m); m3.design = {}; await cmp('ไม่มี design', m3);
  const m4 = clone(m); m4.design.slabs[m.slabs[0].id].rebar = { mesh_xy: { x: [9, 0.15], y: [12, 0.2] } }; await cmp('พื้นเหล็กสองแนว', m4);
  const m5 = clone(m); m5.design.slabs[m.slabs[0].id].rebar = { mesh_xy: { x: [9, 0.125], y: [9, 0.25], layers: 2 } }; await cmp('พื้นเหล็กสองแนว 2 ชั้น', m5);
  const m6 = clone(m), sp = m6.supports;
  sp[0].kind = 'pile_cap'; sp[0].piles = { n: 4, type: 'I-0.22x0.22', length: 21 };
  sp[1].kind = 'pile_cap'; sp[1].piles = { n: 3, type: 'เข็มเจาะ', kind: 'bored', size: 0.35, length: 18, bars: [6, 16], tie: [6, 0.2], dowel: [4, 16, 1.0] };
  sp[2].kind = 'pile_cap'; sp[2].piles = { n: 2, type: 'เข็มเจาะ', kind: 'bored', size: 0.5, length: 21.5 };
  if (sp[3]) { sp[3].kind = 'pile_cap'; sp[3].piles = { n: 3, type: 'เข็มเจาะ', kind: 'bored', size: 0.35, length: 18, bars: [6, 16], tie: [6, 0.2], dowel: [4, 16, 1.0] }; }
  m6.design.supports = m6.design.supports || {}; m6.design.supports[sp[1].id] = { rebar: { bands: [3, 13, 12, 1.96] }, status: 'computed' };
  m6.design.supports[sp[0].id] = { rebar: { bars_x: [5, 12], bars_y: [5, 12], rings: [4, 12] }, status: 'computed' };
  await cmp('ฐานเข็มตอก/เจาะ + แถบ 3 ต้น + ปลอกรอบ', m6);
  const m7 = clone(m6);
  m7.stairs = [{ id: 'ST1', mark: 'ST-1', flights: [{ start: [0, 0], dir: '+X', width: 1.2, bottom: 0, top: 1.6, risers: 9, going: 0.25, waist: 0.15 }, { start: [2.25, 1.3], dir: '-X', width: 1.2, bottom: 1.6, top: 3.2, risers: 9, going: 0.25 }] },
    { id: 'ST2', flights: [{ start: [5, 0], dir: '+Y', width: 1.0, bottom: 0, top: 1.5, risers: 8, going: 0.27 }] }];
  m7.design.stairs = { 'ST1#1': { main_bar: [12, 0.15], dist_bar: [9, 0.2] }, 'ST1#2': { main_bar: [12, 0.125], dist_bar: [9, 0.25] }, ST2: { main_bar: [16, 0.2] } };
  m7.design.plates = { 'N-1': { node: 'N-1', plate: [250, 300, 12], bolts: [4, 16, 33] }, 'N-2': { plate: [250, 300, 12], bolts: [4, 16, 33] }, 'N-3': { plate: [200, 200, 9], bolts: [4, 12, 25] } };
  await cmp('บันได + เพลท/สลัก', m7);
  const m8 = clone(m7); m8.retaining_walls = [{ id: 'RW-1', mark: 'RW-1', length: 12.5, H: 3, tb: 0.4, tw: 0.25, B1: 0.8, B2: 1.8, material: m8.materials.find(x => x.kind === 'concrete').id, rebar: { wall: [16, 0.15], base: [16, 0.2], temp: [12, 0.25] } },
    { id: 'RW-2', material: m8.materials.find(x => x.kind === 'concrete').id, length: 6, H: 2, tb: 0.3, tw: 0.2, B1: 0.5, B2: 1.2, rebar: { wall: [12, 0.2] } }];
  await cmp('กำแพงกันดิน', m8);
  // กำแพงกันดินมีตำแหน่ง/ระดับท้องฐาน (ขุดตื้น/ลึก) + บันไดมีชานพักจากโมเดล + ชานพักจากแท็บออกแบบ + พื้นไม่เอาพลาสติก
  const m9 = clone(m8), GL = (m9.levels.find(l => l.name === 'GL') || { z: 0 }).z;
  Object.assign(m9.retaining_walls[0], { start: [0, -3], dir: '+X', soil: 'left', bottom: GL - 1.2 });
  Object.assign(m9.retaining_walls[1], { start: [0, -6], dir: '+Y', soil: 'right', bottom: GL - 2.6 });
  m9.stairs[0].landings = [{ rect: [2.25, 0, 3.45, 2.5], top: 1.6, t: 0.15 }];
  m9.design.stairs['ST2'].landing = [1.2, 1.0, 0.12]; m9.design.stairs['ST1#1'].waist = 0.17;
  await cmp('กำแพงมีระดับ + ชานพัก', m9);
  const m10 = clone(m9); m10.slabs.filter(s => s.kind !== 'cast').forEach(s => { s.pe_sheet = false; }); m10.stairs[0].material = m10.materials.find(x => x.kind === 'concrete').id;
  await cmp('ไม่เอาพลาสติก + บันไดระบุคอนกรีต', m10);
  check('pyJson เลขยกกำลัง', T.pyJson([1e-5, 1.5e-7, 0.0001, 2.5]) === '[1e-05,1.5e-07,0.0001,2.5]', T.pyJson([1e-5, 1.5e-7, 0.0001, 2.5]));
  console.log((ok ? 'PASS' : 'FAIL') + ` rebartk ${n} ข้อ`);
  process.exit(ok ? 0 : 1);
})();
