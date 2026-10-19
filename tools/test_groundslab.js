// ทดสอบ lib/groundslab.js (โหมด excel) เทียบค่าที่ LibreOffice คำนวณจากชีต Ground Slab(SG) ของ Neo RC ทั้งสองไฟล์ + ชีต Mesh
const G = require('../lib/groundslab.js'), cases = require('./groundslab_cases.json');
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let pass = 0, fail = 0;
const check = (n, ok, m) => { if (ok) pass++; else { fail++; console.log('FAIL', n, m || ''); } };
cases.forEach(({ inp: c, exp: e }, i) => {
  const r = G.check({ mode: c.kind === 'vehicle' ? 'vehicle' : 'll', S: c.S, L: c.L, t: c.t, soil: c.soil, W: c.W, psi: c.psi, LL: c.LL, fcp: c.fcp, fs: c.fs, fy: 2400, dia: c.dia, excel: true });
  const map = { l: 'l', a: 'a', b: 'b', t3: 'treq', si: 'si', se: 'se', sc: 'sc', ft1: 'si', ft2: 'se', tmin: 'tmin', AsS: 'AsS', AsL: 'AsL', Ast: 'Ast', barsPerM: 'barsPerM', sMax: 'sMax', k: 'k' };
  Object.entries(e).forEach(([k, v]) => {
    if (typeof v === 'number') check(`gs${i} ${c.kind} ${k}`, near(r[map[k]], v), `เว็บ ${r[map[k]]} Excel ${v}`);
  });
  const okX = typeof e.okT === 'string' && /ผ่าน|OK/.test(e.okT);
  const okW = r.checks.filter(x => x.code === 't' || x.code === 'se' || (c.kind === 'vehicle' && ['si', 'sc'].includes(x.code))).every(x => x.ok);
  // ชีตมีรถตัดสิน "ผ่าน" จาก t3 < t และค่าสูงสุดของ si/se/sc · ชีตไม่มีรถจาก t3 < t และ ft2
  check(`gs${i} ${c.kind} ผ่าน/ไม่ผ่าน`, okX === okW, `${e.okT} vs ${okW}`);
});
// ชีต Mesh ตัวอย่างในไฟล์: DB10 @0.20 → As2 3.93, Fs2 1500, Fy ลวด 5500 → As1 2.14, Ø6 สูงสุด @0.13
const m = G.mesh(10, 0.2, 1500, { wires: [6] });
check('mesh As2', m.As2 === 3.93, m.As2); check('mesh As1', m.As1 === 2.14, m.As1); check('mesh smax', m.smax === 0.13, m.smax); check('mesh ระยะ', m.s === 0.1, m.s);
// ฉบับแก้: หน่วยแรงต้องลดลง 2.2 เท่าเมื่อแก้หน่วย (แรงเท่ากัน รัศมีสัมผัสต่าง)
const a = G.check({ mode: 'vehicle', S: 3, L: 4, t: 12, soil: 1, W: 5, psi: 80, fcp: 240, fs: 1200, fy: 2400 }), b = G.check({ mode: 'vehicle', S: 3, L: 4, t: 12, soil: 1, W: 5, psi: 80, fcp: 240, fs: 1200, fy: 2400, excel: true });
check('แก้หน่วย: แรงล้อ กก.', near(a.P, 2000) && near(b.P / a.P, 2.2046), `${a.P} ${b.P}`);
check('แก้หน่วย: รัศมีใช้แรงล้อ', near(a.a, b.a * Math.sqrt(0.4)), `${a.a} ${b.a}`);
check('เหล็กขั้นต่ำ SR24', near(a.AsS, Math.max(0.0025 * 100 * 12, 24 * 12 * 3 * 1.5 / 2400)), a.AsS);
const d0 = G.design({ mode: 'll', S: 4, L: 5, t: 10, soil: 1, LL: 300, fcp: 240, fs: 1200, fy: 2400 }, [6, 9, 12]);
check('ความหนาไม่พอบอกค่าที่ต้องใช้', !d0.ok && d0.tReq === 11, JSON.stringify(d0.error));
const d = G.design({ mode: 'll', S: 4, L: 5, t: 12, soil: 1, LL: 300, fcp: 240, fs: 1200, fy: 2400 }, [6, 9, 12]);
check('ออกแบบไม่มีรถ', d.ok && d.s >= 0.1, JSON.stringify([d.d, d.s, d.error]));
console.log(`groundslab: ผ่าน ${pass} ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
