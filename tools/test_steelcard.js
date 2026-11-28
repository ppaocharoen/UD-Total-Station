// M6 ก้อน 3c: การ์ด "เหล็กรูปพรรณ ASD" ในหน้าออกแบบ — โหลด boq/design.js ใน vm (ไม่มี DOM) กับ ท12 แล้วเรียกฟังก์ชันตรง
// ตรวจ: ผลตรวจรายชิ้น · แคช · แก้ค่ารายประเภท/รายชิ้น · จัดชนิด · หน้าตัดในโมเดล · HTML การ์ด/รายการคำนวณ · ชุดที่พิมพ์
const vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const check = (name, ok, msg) => { if (ok) pass++; else { fail++; console.log('FAIL', name, msg || ''); } };
const model = JSON.parse(fs.readFileSync(R + 'examples/t12/t12.bm.json', 'utf8'));
const ctx = { console, Math, JSON, Object, Array, Set, Map, Number, String, isFinite, parseFloat, parseInt, Date, RegExp, Error, Infinity, NaN };
ctx.self = ctx; vm.createContext(ctx);
for (const f of ['lib/version.js', 'lib/rcwsd.js', 'lib/dsggroup.js', 'lib/pilecap.js', 'lib/groundslab.js', 'lib/strapret.js', 'lib/steelconn.js', 'lib/steelsec_data.js', 'lib/steelsec.js', 'lib/steelasd.js', 'lib/steelchk.js'])
  vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
ctx.__model = model;
vm.runInContext(`var S = { model: __model, boq: {} }, __out = { innerHTML: '' }, __toast = [];
  function $(q){ return q === '#dsg-printout' ? __out : null } function $$(){return []} function esc(s){return String(s)} function toast(t){ __toast.push(t) } function autosave(){}
  var document = { body: { classList: { add(){}, remove(){} } } }; function setTimeout(){}`, ctx);
vm.runInContext(fs.readFileSync(R + 'boq/design.js', 'utf8').replace(/^'use strict';/m, ''), ctx, { filename: 'design.js' });
const run = js => vm.runInContext(js, ctx);

const A = run('dsgSteelRun()');
check('ตรวจ 102 ชิ้น', A.members.length === 102 && A.members.every(e => e.res && e.res.rows.length), A.members.length);
check('แคช: เรียกซ้ำได้ผลเดิม', run('dsgSteelRun()') === A);
check('เกรดตั้งต้น Fe-24', run('dsgStl().grade') === 'Fe-24' && A.members[0].res.worst.Fy === 2400);
const ng = A.members.filter(e => !e.ok).map(e => e.id).sort();
check('ไม่ผ่าน 11 ชิ้น (จันทัน 9 + คาน RB 2)', ng.length === 11 && ng.filter(x => x.startsWith('RF-')).length === 9, ng);
for (const e of A.members) {
  const t = ctx.SteelChk.trySec(e, e.sec);
  if (Math.abs(t.ratio - e.ratio) > 1e-3 || t.ok !== e.ok) { check(`trySec = ผลเดิม ${e.id}`, false, [t.ratio, e.ratio]); break; }
}
check('trySec กับหน้าตัดเดิม = ผล analyze ทุกชิ้น', true);
const rf = A.byId['RF-03c'];
check('RF-03c ไม่ผ่าน H2-1 ปีกล่าง', !rf.ok && rf.res.worst.eq === 'H2-1' && /ปีกล่าง/.test(rf.res.worst.LbHow), rf.res.worst.eq);
check('RF-03c เสนอ C125x50x20x2.3', rf.sug && rf.sug.name === 'C125x50x20x2.3', rf.sug);

// จัดชนิด
const G = run('dsgSteelGroups(dsgSteelRun())');
const g3 = G.groups.find(g => g.ids.includes('RF-03c'));
check('จันทันชื่อในแบบ "3" รวม 52 ชิ้น', g3 && g3.fromMark && g3.name === '3' && g3.ids.length === 52, g3 && [g3.name, g3.ids.length]);
check('ชนิดจันทันใช้ C125 ผ่านทุกชิ้น', g3.cand === 'C125x50x20x2.3' && !g3.fails.length, [g3.cand, g3.fails]);
check('หน้าตัดในโมเดลของชนิดจันทัน ไม่ผ่าน 9 ชิ้น', g3.draw.bad.length === 9 && g3.draw.text === 'C100x50x20x2.3', g3.draw);
const gp = G.groups.find(g => g.type === 'purlin');
check('แปไม่มีชื่อ → ชนิด P1…', gp && /^P\d$/.test(gp.name), gp && gp.name);
const tw = G.groups.filter(g => g.type === 'truss_web');
check('เอวโครงถัก T1 แยกตามหน้าตัดในโมเดล (38 / 75)', tw.length === 2 && tw.every(g => g.fromMark && g.draw.text.split(' / ').length === 1) && tw.some(g => g.name === 'T1 BOX38x38x1.6'), tw.map(g => [g.name, g.cand, g.draw.text]));
check('หน้าตัดนอกตารางที่ผ่านอยู่แล้วไม่ถูกเสนอตัวหนักกว่า (BOX38x38x1.6)', tw.find(g => g.name === 'T1 BOX38x38x1.6').cand === 'BOX38x38x1.6');
check('คอร์ดโครงถักชื่อ T1 กลุ่มเดียว', G.groups.filter(g => g.type === 'truss_chord').map(g => g.name).join() === 'T1');
check('ทุกชิ้นอยู่ในชนิด', G.groups.reduce((a, g) => a + g.ids.length, 0) === 102 && !G.skip.length);
check('น้ำหนักรวมคำนวณได้', G.wModel > 100 && G.wGrp > 0, [G.wModel, G.wGrp]);
check('แคชชนิด', run('dsgSteelGroups(dsgSteelRun())') === G);

// HTML
const card = run('stlCard(dsgSteelRun(), dsgSteelGroups(dsgSteelRun()))');
check('การ์ดมี 102 แถว', (card.match(/data-sm="/g) || []).length === 102);
check('การ์ดมีตารางแก้รายประเภท 6 ประเภท', (card.match(/data-stt="[^"]+" data-sk="sec"/g) || []).length === 6, (card.match(/data-stt="[^"]+" data-sk="sec"/g) || []).length);
check('การ์ดบอกไม่ผ่าน 11', /ไม่ผ่าน 11/.test(card));
const rep = run(`stlReport(dsgSteelRun().byId['RF-03c'])`);
check('รายการคำนวณมี H2-1 + การโก่ง + ชุดผสม', /H2-1/.test(rep) && /การโก่งตัว/.test(rep) && /ชุดผสมที่อัตราส่วนสูงสุด/.test(rep) && /data-smo="RF-03c"/.test(rep));
check('รายการคำนวณสำหรับพิมพ์ไม่มีช่องแก้', !/data-smo/.test(run(`stlReport(dsgSteelRun().byId['RF-03c'], true)`)));
const rc = run(`stlReport(dsgSteelRun().byId['CX-3B'])`);
check('เสา 2C แรงอัดน้อย: H1-3 (fa/Fa ≤ 0.15)', /H1-3/.test(rc) && /fa \/ Fa/.test(rc), rc.slice(0, 200));

// พิมพ์: ไม่เลือก = สรุป + ชิ้นคุม + ชิ้นไม่ผ่าน · เลือกแถวเหล็ก = ชิ้นนั้น
run('dsgPrint([], [], [], [], [], [], [], [])');
const pr = run('__out.innerHTML'), nRep = (pr.match(/Steel Member Check/g) || []).length;
const want = new Set(G.groups.map(g => g.gov).concat(ng)).size;
check('พิมพ์ทั้งหมด: สรุป + ชิ้นคุม + ไม่ผ่าน', /สรุปตรวจเหล็กรูปพรรณ/.test(pr) && nRep === want, [nRep, want]);
run(`dsg().sel = 'stl:PL-R1-04'; dsgPrint([], [], [], [], [], [], [], [])`);
check('พิมพ์ชิ้นที่เลือก', (run('__out.innerHTML').match(/Steel Member Check/g) || []).length === 1 && /PL-R1-04/.test(run('__out.innerHTML')));
run(`dsg().sel = ''`);

// แก้ค่ารายประเภท: จันทันลองหน้าตัด C125 → ผ่านทั้งหมด (ไม่แตะโมเดล)
run(`dsgStl().byType.rafter = { sec: 'C125x50x20x2.3' }`);
const A2 = run('dsgSteelRun()');
check('แก้ค่า → คำนวณใหม่ (คีย์แคชเปลี่ยน)', A2 !== A);
check('จันทันทุกชิ้นใช้ C125 แล้วผ่าน', A2.members.filter(e => e.type === 'rafter').every(e => e.sec === 'C125x50x20x2.3' && e.ok));
check('การโก่งตัวปรับตาม Ix', A2.byId['RF-06a'].defl.scaled > 0 && A2.byId['RF-06a'].defl.scaled < 1, A2.byId['RF-06a'].defl.scaled);
check('โมเดลไม่ถูกแก้', model.members.find(x => x.id === 'RF-03c').section === 'C100x50x20x2.3');
const G2 = run('dsgSteelGroups(dsgSteelRun())'), g3b = G2.groups.find(g => g.ids.includes('RF-03c'));
check('หน้าตัดในโมเดลยังตรวจ C100 (ไม่ผ่าน 9)', g3b.draw.bad.length === 9, g3b.draw);
// แก้รายชิ้น Lb ปีกล่าง → Cb 1 ที่มา "กำหนดเอง"
run(`dsgStl().byType = {}; dsgStl().over['RF-03c'] = { LbNeg: 1.0 }`);
const r3 = run('dsgSteelRun()').byId['RF-03c'];
const negRows = r3.res.rows.filter(r => r.LbHow === 'กำหนดเอง');
check('Lb ปีกล่างกำหนดเอง 1.00 ม.', negRows.length > 0 && negRows.every(r => r.Lb === 1 && r.Cb === 1), negRows.length);
check('Lb สั้นลง → RF-03c ผ่าน', r3.ok, r3.ratio);
// เกรด SS400
run(`dsgStl().over = {}; dsgStl().grade = 'SS400'`);
check('เกรด SS400 Fy 2450', run('dsgSteelRun()').members[0].res.worst.Fy === 2450);
console.log(`PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
