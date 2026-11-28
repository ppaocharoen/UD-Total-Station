// ทดสอบ lib/steelchk.js กับ ท12 (ผล SAP ใน examples/t12) — ระยะค้ำ จุดรองรับ แกนหน้าตัด การโก่งตัว · รัน: node tools/test_steelchk.js
const C = require('../lib/steelchk.js');
const ASD = require('../lib/steelasd.js');
const m = require('../examples/t12/t12.bm.json');
let pass = 0, fail = 0;
function check(name, ok, msg) { if (ok) pass++; else { fail++; console.log('FAIL', name, msg || ''); } }
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
const A = C.analyze(m);
const by = id => A.members.find(e => e.id === id);
check('ตรวจชิ้นเหล็กครบ 102', A.members.length === 102 && A.members.every(e => e.res && e.res.rows.length > 0), A.members.length);
check('ไม่มีคำเตือนระดับโมเดล', A.warn.length === 0, A.warn);
// แกนหน้าตัด: แปกล่อง 50x25 วางแบน → แกน 3 ของ SAP = แกนอ่อนของหน้าตัด
const pl = by('PL-R1-04');
check('แปวางแบน สลับแกน', pl.p.flat && near(pl.p.Ix, 2.76) && near(pl.p.Iy, 8.17), JSON.stringify([pl.p.Ix, pl.p.Iy]));
check('จันทัน C ไม่สลับแกน', !by('RF-05c').p.flat && near(by('RF-05c').p.Ix, 80.7));
check('2C เสา/คาน คำนวณ', by('CX-3B').p.src === 'computed' && by('CX-3B').p.fam === 'C2');
// ระยะค้ำ: จันทัน = ระยะแป · แป = ระยะจันทัน 1.08 · ปีกล่างจันทัน = ระยะจุดรองรับ (คาน/โครงถัก)
const rf = by('RF-05c');
check('จันทัน KL = ระยะแป 1.00', near(rf.br.Lb, 1.0, 0.01) && near(rf.br.KLx, 1.0, 0.01), JSON.stringify(rf.br));
check('จันทัน Lb ปีกล่าง = ช่วงคาน B → C 4.31', near(rf.br.LbNeg, 4.3058, 0.01), JSON.stringify(rf.br));
check('แป Lb = ระยะจันทัน 1.08', near(pl.br.Lb, 1.08, 0.01) && near(pl.br.LbNeg, 1.08, 0.01), JSON.stringify(pl.br));
check('เอวโครงถัก KL = ความยาวชิ้น', near(by('T1-D10').br.KLx, by('T1-D10').br.L));
// จุดรองรับของแนวจันทัน: โครงถักแถว A, คาน B, คาน C (ผ่าน Body constraint)
const G = C.prepare(m), L = C.lines(G, C.STEEL), ln = L.find(l => l.ids.includes('RF-08b'));
check('แนวจันทัน 4 ท่อน', ln.ids.length === 4, ln.ids);
check('จุดรองรับแนวจันทัน 3 จุด (A, B, C)', C.supportsOf(G, ln).map(p => p.j).join() === 'N-6.480_0.000_3.750,N-6.480_1.500_3.647,N-6.480_5.800_3.350', C.supportsOf(G, ln).map(p => p.j));
// การโก่งตัว: ทุกแนวจันทันมีช่วงยื่นชายคา + ช่วงใน · ค่าการโก่งเทียบมือ (ชายคา D+LR: ปลาย − จุดรองรับ ตั้งฉากแนว)
const d = C.deflection(G, ln, m.results, 240);
check('แนวจันทัน: ช่วงยื่น 2 + ช่วงใน 2', d.filter(x => x.cant).length === 2 && d.filter(x => !x.cant).length === 2, d.map(x => x.span));
{
  const u = m.results.displacements['N-6.480_-1.100_3.826']['D+LR'], s = m.results.displacements['N-6.480_0.000_3.750']['D+LR'];
  const dd = [0, 1, 2].map(k => u[k] - s[k]), dir = ln.d, nz = [0 - dir[0] * dir[2], 0 - dir[1] * dir[2], 1 - dir[2] * dir[2]], ln_ = Math.hypot(...nz);
  const hand = Math.abs(dd.reduce((a, v, k) => a + v * nz[k] / ln_, 0)) * 100;
  const sp = d.find(x => x.cant && x.to === 'N-6.480_0.000_3.750');
  check('การโก่งชายคา ≥ ค่ามือ D+LR และยอมให้ 2L/240', sp.worst.d >= hand - 1e-6 && near(sp.worst.allow, 2 * 110.15 / 240, 0.01), `${sp.worst.d} vs ${hand}`);
}
// ผลตรวจ = ASD.check ด้วยแรงชุดวิกฤตเดียวกัน
{
  const e = by('T1-D10'), w = e.res.worst, row = m.results.steel_combo['T1-D10'][e.res.combo].find(r => r[0] === w.st || true);
  const rows = m.results.steel_combo['T1-D10'][e.res.combo].map(r => ASD.check(e.p, { P: r[1], V2: r[2], V3: r[3], Mx: r[6], My: r[5] }, Object.assign({}, e.opt, { Lb: e.br.Lb })).ratio);
  check('ผลรวม = ASD.check รายแถว (T1-D10)', near(Math.max(...rows), e.res.ratio, 1e-4), `${Math.max(...rows)} vs ${e.res.ratio}`);
}
// แก้ค่าเอง: Lb ปีกล่างจันทัน 1.0 ม. → อัตราส่วนลด · เปลี่ยนหน้าตัดรายชิ้น
const B = C.analyze(m, { byType: { rafter: { LbNeg: 1.0 } }, over: { 'RF-05c': { sec: 'C150x65x20x3.2' } }, suggest: false });
check('byType LbNeg ลดอัตราส่วน', B.members.find(e => e.id === 'RF-02c').res.ratio < by('RF-02c').res.ratio);
check('over sec รายชิ้น', B.members.find(e => e.id === 'RF-05c').sec === 'C150x65x20x3.2' && B.members.find(e => e.id === 'RF-05c').res.ratio < rf.res.ratio);
// เสนอหน้าตัด: ผ่านทุกชุดในตระกูลเดิม เบาสุด
const sg = by('T1-D10').sug;
check('เสนอหน้าตัดตระกูลกล่อง', sg && /^BOX/.test(sg.name) && sg.ratio <= 1, JSON.stringify(sg));

// ---------- ก้อน 3b: แผนภาพโมเมนต์ จุดดัดกลับ Cb และการโก่งกลางช่วง ----------
{
  const R = m.results; let n = 0, bad = 0;
  for (const l of L) {
    if (!['rafter', 'purlin', 'steel_beam'].includes(l.type)) continue;
    for (const c of R.cases_used) {
      const D = C._lineDiagram(G, R, l, c);
      for (const id of l.ids) {
        const s0 = C._dot(C._sub(G.ends[id][0], G.xyz[l.a]), l.d), sg = C._dot(C._unit(C._sub(G.ends[id][1], G.ends[id][0])), l.d) > 0 ? 1 : -1;
        for (const r of (R.steel_combo[id] || {})[c] || []) {
          if (G.pts[id].some(p => Math.abs(p.s - r[0]) < 2e-3)) continue;   // แถวที่จุดต่อมีค่ากระโดด (โมเมนต์ส่งเข้าชิ้นที่มาต่อ)
          const s = s0 + sg * r[0], d = D.find(e => e.id === id && s >= e.lo - 1e-6 && s <= e.hi + 1e-6);
          n++; if (!d || Math.abs(d.f(s) - r[6]) > 0.5 + 0.02 * Math.abs(r[6])) bad++;
        }
      }
    }
  }
  check('แผนภาพโมเมนต์จากปลายช่วง ตรงแถวกลางช่วงของ SAP ทุกแถว', n > 500 && bad === 0, `${bad}/${n}`);
  // จันทันใต้ลมยก: ปีกล่างรับแรงอัดกลางช่วง → Lb = ระหว่างจุดดัดกลับ (< ช่วงจุดรองรับ 4.31) · Cb = 1 (โมเมนต์สูงสุดอยู่ในช่วง)
  const w = by('RF-10c').res.worst;
  check('RF-10c Lb ปีกล่าง = ระหว่างจุดดัดกลับ', w.Lb > 2 && w.Lb < 4.3 && /จุดดัดกลับ/.test(w.LbHow) && w.Cb === 1, JSON.stringify([w.Lb, w.LbHow, w.Cb]));
  // ตรงจุดรองรับ (โมเมนต์ลบมากสุดที่ปลายช่วง) Cb = 1.75 + …
  const rows = by('RF-05b').res.rows.filter(r => r.LbHow && /จุดดัดกลับ/.test(r.LbHow));
  check('ปีกล่างที่จุดรองรับ Cb > 1.5', rows.some(r => r.Cb >= 1.5), rows.slice(0, 3).map(r => [r.Lb, r.Cb]));
  // แป: การโก่งกลางช่วง = เฉลี่ยปลาย + 5qL⁴/384EI + (Ma+Mb)L²/16EI
  const pl2 = by('PL-R1-02');
  check('แปมีการโก่งกลางช่วง (ไม่มีจุดต่อระหว่างจันทัน)', pl2.defl && pl2.defl.worst.mid && pl2.defl.worst.d > 0.05 && pl2.defl.worst.d < 0.45, JSON.stringify(pl2.defl));
}
console.log(`PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
