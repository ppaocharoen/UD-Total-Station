// ทดสอบ lib/pilecap.js เทียบค่าที่ LibreOffice คำนวณจากชีต "1 Pile" … "9 pile" (RC_Design_WSD ฉบับแก้ UDfix)
const RC = require('../lib/rcwsd.js'), PC = require('../lib/pilecap.js');
const cases = require('./pilecap_cases.json');
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let pass = 0, fail = 0;
const check = (name, ok, msg) => { if (ok) pass++; else { fail++; console.log('FAIL', name, msg || ''); } };
cases.forEach(({ inp: c, exp: e }, i) => {
  const C = RC.criteria({ fcp: c.fcp, F: c.F, mode: c.mode, fy: c.fy, fyv: 2400 });
  const p = { n: c.n, cov: c.cov, t: c.t, Df: c.Df, P: c.P, Mx: c.Mx, My: c.My, gamma: c.gamma, pier: c.pier, bx: c.bx, by: c.by, D: c.D,
    pile: c.type, len: c.len, fcPile: c.fcPile, cap: c.cap, Dnx: c.Dnx, Dny: c.Dny, Bx: c.Bx, By: c.By,
    dL: c.dL, dS: c.dS, sL: c.sL, sS: c.sS, nBar: c.nBar, dDowel: c.dDow, nDowel: c.nDow };
  const r = PC.pileCapCheck(p, C);
  Object.keys(e).forEach(k => {
    if (typeof e[k] !== 'number') return;
    if (r[k] === undefined) { check(`pile${i} n${c.n} ${k}`, false, 'เว็บไม่มีค่า'); return; }
    check(`pile${i} n${c.n} ${k}`, near(r[k], e[k]), `เว็บ ${r[k]} Excel ${e[k]}`);
  });
});
// ออกแบบอัตโนมัติ: ผลต้องผ่านทุกข้อ
const C = RC.criteria({ fcp: 240, F: 0.45, mode: 1, fy: 4000, fyv: 2400 });
[[20000, 0, 0, 11], [60000, 2000, 1500, 11], [150000, 5000, 5000, 19], [250000, 8000, 8000, 13], [40000, 0, 3000, 18]].forEach(([P, Mx, My, pile], i) => {
  const d = PC.pileCapDesign({ cov: 7.5, t: 0.5, Df: 1.5, P, Mx, My, gamma: 1800, pier: 1, bx: 0.4, by: 0.4, pile, len: 21, fcPile: 350, cap: 35000 }, C, { dias: [12, 16, 20] });
  check(`design${i}`, d.ok, `${d.error} n=${d.p.n}`);
});
// M4b ก้อน 5: ออกแบบจากหลายชุดแรง
const base = { cov: 7.5, t: 0.5, Df: 1.5, gamma: 1800, pier: 1, bx: 0.4, by: 0.4, pile: 11, len: 21, fcPile: 350, cap: 35000 };
{ // ชุดเดียว = ผลเท่ากับ pileCapDesign
  const s1 = { P: 60000, Mx: 2000, My: 1500, tag: 'D+L' };
  const a = PC.pileCapDesign(Object.assign({}, base, s1), C, { dias: [12, 16, 20] }), b = PC.pileCapDesignMulti(base, [s1], C, { dias: [12, 16, 20] });
  check('multi1 เท่าชุดเดียว', a.ok === b.ok && a.p.n === b.p.n && a.p.t === b.p.t && a.p.dL === b.p.dL && a.p.sL === b.p.sL && a.p.sS === b.p.sS && near(a.r.Hmax, b.r.Hmax), JSON.stringify([a.p, b.p]));
  check('multi1 gov', b.gov.tag === 'D+L' && b.nSets === 1);
}
{ // แรงอัดน้อยแต่โมเมนต์มาก (ลม) ต้องคุม: ทุกชุดต้องผ่านด้วยแบบเดียวกัน และแรงยกเข็มเตือน
  const sets = [{ P: 90000, Mx: 1000, My: 1000, tag: 'D+L' }, { P: 30000, Mx: 1000, My: 26000, tag: '.6D+WX' }, { P: -500, Mx: 0, My: 0, tag: 'up' }];
  const d = PC.pileCapDesignMulti(base, sets, C, { dias: [12, 16, 20] });
  check('multi2 ผ่าน', d.ok, d.error);
  const all = sets.filter(s => s.P > 0).map(s => PC.pileCapCheck(Object.assign({}, d.p, { P: s.P, Mx: s.Mx, My: s.My }), C));
  check('multi2 ทุกชุดผ่าน', all.every(r => r.ok), all.map(r => r.checks.filter(c => !c.ok).map(c => c.code)).join('|'));
  check('multi2 นับชุดอัด', d.nSets === 2);
  check('multi2 เข็มรับแรงดึง', d.tension && d.tension.tag === '.6D+WX' && d.tension.T > 0, JSON.stringify(d.tension));
  const one = PC.pileCapDesign(Object.assign({}, base, sets[0]), C, { dias: [12, 16, 20] });
  check('multi2 มากกว่าชุดอัดมากสุดชุดเดียว', d.p.n > one.p.n || d.p.t > one.p.t || d.r.AL > one.r.AL, `n ${d.p.n}/${one.p.n}`);
  check('util ≤ 1 เมื่อผ่าน', PC.util(all[0]) <= 1 && PC.util(all[1]) <= 1);
}
check('multi ไม่มีชุดอัด = null', PC.pileCapDesignMulti(base, [{ P: -10 }], C) === null);
console.log(`pilecap: ผ่าน ${pass} ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
