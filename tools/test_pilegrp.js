// M4b ก้อน 5: ฐานเข็มออกแบบทุกชุดผสม + จัดกลุ่มชนิด — ทดสอบกับสำเนา ท12 ที่เปลี่ยนฐานแผ่เป็นฐานเข็ม (ในหน่วยความจำ ไม่แตะไฟล์ golden)
// โหลด boq/design.js ใน vm (ไม่มี DOM) แล้วเรียกฟังก์ชันออกแบบ/จัดกลุ่มตรง
const vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const check = (name, ok, msg) => { if (ok) pass++; else { fail++; console.log('FAIL', name, msg || ''); } };
const model = JSON.parse(fs.readFileSync(R + 'examples/t12/t12.bm.json', 'utf8'));
model.design = model.design || {}; model.design.supports = model.design.supports || {};
for (const f of model.supports) {
  if (f.id === 'F2-1A') { f.mark = ''; continue; }            // ฐานแผ่ไม่มีชื่อ 1 ฐาน: ชื่อชนิดอัตโนมัติต้องไม่ชนกับฐานเข็ม
  const F1 = f.mark === 'F1';
  f.kind = 'pile_cap'; f.piles = { n: F1 ? 2 : 0, type: 'S-18', length: 12, capacity: F1 ? 8000 : 2500 };
  if (!F1) f.mark = '';                                      // F2 → ไม่มีชื่อ จัดตามขนาด
  if (F1) model.design.supports[f.id] = { status: 'from_drawing', rebar: { bars_x: [7, 12], bars_y: [7, 12] } };
  else delete model.design.supports[f.id];
}
const ctx = { console, Math, JSON, Object, Array, Set, Map, Number, String, isFinite, parseFloat, parseInt, Date, RegExp, Error, Infinity, NaN };
ctx.self = ctx; vm.createContext(ctx);
for (const f of ['lib/version.js', 'lib/rcwsd.js', 'lib/dsggroup.js', 'lib/pilecap.js', 'lib/groundslab.js', 'lib/strapret.js']) vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
ctx.__model = model;
vm.runInContext('var S = { model: __model, boq: {} }; function $(){return null} function $$(){return []} function esc(s){return String(s)} function toast(){} function autosave(){}', ctx);
vm.runInContext(fs.readFileSync(R + 'boq/design.js', 'utf8').replace(/^'use strict';/m, ''), ctx, { filename: 'design.js' });
const out = vm.runInContext(`(() => {
  Object.assign(dsg().crit, { qa: 10000 });
  const bs = dsgBeamList(); S.dsgOut = {}; bs.forEach(b => S.dsgOut[b.id] = dsgRun(b));
  const cols = dsgColList(); S.dsgCol = {}; cols.forEach(x => S.dsgCol[x.id] = dsgColRun(x));
  const allF = dsgFootList(), foots = allF.filter(x => x.kind === 'spread'), piles = allF.filter(x => x.kind === 'pile_cap');
  S.dsgFoot = {}; foots.forEach(x => S.dsgFoot[x.id] = dsgFootRun(x)); S.dsgStrap = {};
  S.dsgPile = {}; piles.forEach(x => S.dsgPile[x.id] = dsgPileRun(x));
  dsgGroups(cols, foots, bs, piles);
  return { piles, foots, P: S.dsgPile, F: S.dsgFoot, G: S.dsgGrp.groups.filter(g => g.kind === 'pile' || g.kind === 'foot'),
    txt: Object.fromEntries(S.dsgGrp.groups.filter(g => g.kind === 'pile').map(g => [g.name, grpRebarText(g)])) };
})()`, ctx);
const PC = ctx.PileCap;
check('ฐานเข็ม 11 ฐาน', out.piles.length === 11, out.piles.length);
for (const x of out.piles) {
  const o = out.P[x.id];
  check(`${x.id} ทุกชุดผสม`, o.inp.multi && o.inp.sets.length === x.sets.length && o.d.nSets === x.sets.length, o.inp.src);
  check(`${x.id} ผ่าน`, o.ok, o.error || o.need);
  check(`${x.id} ชุดวิกฤตอยู่ในชุด`, x.sets.some(s => s.tag === o.inp.gov), o.inp.gov);
  const bad = x.sets.map(s => PC.pileCapCheck(Object.assign({}, o.p, { P: s.P, Mx: s.Mx, My: s.My }), o.crit)).filter(r => !r.ok);
  check(`${x.id} เหล็ก/ความหนาเดียวผ่านทุกชุด`, !bad.length, bad.length);
  if (x.mark === 'F1') check(`${x.id} ล็อก 2 ต้น`, o.r.n === 2, o.r.n);
  if (x.uplift) check(`${x.id} เตือนแรงยก`, /แรงยก/.test(o.warn), o.warn);
}
check('F2-4A มีแรงยก (ลม)', !!out.piles.find(x => x.id === 'F2-4A').uplift);
const pg = out.G.filter(g => g.kind === 'pile'), fg = out.G.filter(g => g.kind === 'foot');
const names = out.G.map(g => g.name);
check('ชื่อชนิดไม่ซ้ำ (ฐานแผ่ + ฐานเข็ม)', new Set(names).size === names.length, names.join(','));
check('ฐานแผ่ไม่มีชื่อได้ชื่อ F', fg.length === 1 && /^F\d+$/.test(fg[0].name), fg.map(g => g.name));
const g1 = pg.find(g => g.name === 'F1');
check('ชนิด F1 ตามชื่อในแบบ 8 ฐาน', g1 && g1.fromMark && g1.ids.length === 8, g1 && g1.ids.length);
check('F1 ตรวจเหล็กในแบบ', g1 && g1.draw && g1.draw.n === 8 && !g1.draw.bad.length, g1 && JSON.stringify(g1.draw));
for (const g of pg) {
  check(`${g.name} ทุกชิ้นผ่าน`, !g.fails.length && Object.values(g.util).every(u => u <= 1 + 1e-9), JSON.stringify(g.util));
  check(`${g.name} หมวด FP ชื่อ F`, g.cat === 'FP' && /^F\d+$/.test(g.name), g.name);
  check(`${g.name} ข้อความเหล็ก`, /DB/.test(out.txt[g.name] || ''), out.txt[g.name]);
}
check('ฐานเข็มไม่มีชื่อจัดตามขนาด', pg.filter(g => !g.fromMark).reduce((a, g) => a + g.ids.length, 0) === 3, pg.map(g => g.name + ':' + g.ids.length).join(' '));
console.log(`pilegrp: ผ่าน ${pass} ไม่ผ่าน ${fail}`);
if (process.argv[2] === '-v') { for (const x of out.piles) { const o = out.P[x.id]; console.log(x.id, x.mark, o.r.n, 'ต้น', o.inp.gov, o.warn || ''); } for (const g of out.G) console.log(g.kind, g.name, g.size, g.ids.join(','), out.txt[g.name], g.draw ? JSON.stringify(g.draw) : ''); }
process.exit(fail ? 1 : 0);
