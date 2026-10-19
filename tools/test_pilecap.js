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
console.log(`pilecap: ผ่าน ${pass} ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
