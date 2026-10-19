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
  return { rows: out.quantities.items.filter(r => r.group_code === '1.1.9'), all: out.quantities.items, q: out.quantities, hash: h };
}
async function cmp(label, m) {
  const py = viaPython(m), js = T.compute(m);
  check(`${label}: จำนวนแถว`, py.rows.length === js.length, `py ${py.rows.length} js ${js.length}`);
  py.rows.forEach((r, i) => {
    const a = canon(strip(r)), b = canon(strip(js[i] || {}));
    check(`${label}: ${r.key}`, a === b, '\n py ' + a.slice(0, 600) + '\n js ' + b.slice(0, 600));
  });
  // apply บนผล Python ต้องได้ items เท่าเดิม (ยกเว้น src/price_ref คงเดิม)
  const mm = clone(m); mm.quantities = clone(py.q); mm.quantities.items = mm.quantities.items.filter(r => r.group_code !== '1.1.9');
  T.apply(mm);
  check(`${label}: apply ลำดับแถว`, mm.quantities.items.map(r => r.key).join() === py.all.map(r => r.key).join());
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
  check('pyJson เลขยกกำลัง', T.pyJson([1e-5, 1.5e-7, 0.0001, 2.5]) === '[1e-05,1.5e-07,0.0001,2.5]', T.pyJson([1e-5, 1.5e-7, 0.0001, 2.5]));
  console.log((ok ? 'PASS' : 'FAIL') + ` rebartk ${n} ข้อ`);
  process.exit(ok ? 0 : 1);
})();
