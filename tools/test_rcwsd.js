// ทดสอบ lib/rcwsd.js เทียบผล Excel (RC_Design_WSD_Fixed_iterative_calc.xlsm) — รัน: node tools/test_rcwsd.js
const W = require('../lib/rcwsd.js');
const data = require('./rcwsd_beam_cases.json');
let ok = true, n = 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const check = (name, good, extra = '') => { n++; ok = ok && !!good; if (!good) console.log('FAIL ' + name + ' ' + extra); };

// ชีต Design criteria (โหมด 2, f'c 240, SD30/SR24)
let c = W.criteria({ fcp: 240, F: 0.45, mode: 2, fy: 3000, fyv: 2400 });
check('Ec', near(c.Ec, 234211.01197526182)); check('fc', c.fc === 108); check('n', near(c.n, 8.710094298279502));
check('k SR24', near(c.stir.k, 0.43943312822705305)); check('j SR24', near(c.stir.j, 0.8535222905909823)); check('R SR24', near(c.stir.R, 20.253562388959416));
check('k SD30', near(c.main.k, 0.3854197432752221)); check('j SD30', near(c.main.j, 0.8715267522415926)); check('R SD30', near(c.main.R, 18.138795323747907));
check('vc', near(c.vc, 4.492660681600603)); check('vc ทะลุ', near(c.vcPunch, 8.210724693959724)); check('vc บิด', near(c.vcTor, 20.449352067975163)); check('ft', near(c.ftPlain, 6.568579755167779));
check('แบกทาน', c.bearFull === 60 && c.bearPart === 90);
check('fs SD40 F0.45', W.fsAllow(4000, 0.45) === 1700); check('fs SD40 F0.375', W.fsAllow(4000, 0.375) === 1500);
check('โหมด 1 จำกัด 65', W.criteria({ fcp: 240, mode: 1 }).fc === 65 && W.criteria({ fcp: 240, mode: 1 }).capped);
check('โหมด 2 เกิน 65 มีหมายเหตุ', !!W.criteria({ fcp: 240, mode: 2 }).note);

// ชีต Beam
const KEYS = ['fc', 'fs', 'fsv', 'n', 'k', 'j', 'R', 'Ec', 'hmin', 'deep', 'Lb', 'dp', 'd', 'Mc', 'fsp', 'As1', 'As', 'Asmin', 'M1', 'M2', 'As2', 'Asc', 'Vc', 'Vc1', 'Vc2', 'Vp', 'Av_s', 'vb', 'Ac', 'At_s', 'vt', 'v', 'Ast', 'Atot_s', 'smax', 'Avmin', 'Avprov', 'reqC', 'reqT', 'AsProv', 'AscProv'];
data.cases.forEach((cs, i) => {
  const p = cs.input, e = cs.expect, cr = W.criteria(p), r = W.beamCheck(p, cr);
  const got = Object.assign({ fc: cr.fc, fs: cr.main.fs, fsv: cr.stir.fs, n: cr.n, k: cr.main.k, j: cr.main.j, R: cr.main.R, Ec: cr.Ec }, r);
  if (!r.singly) { /* M1/M2 ตรงตาม Excel */ } else { got.M1 = 0; got.M2 = 0; }
  KEYS.forEach(k => {
    if (typeof e[k] !== 'number') { if (e[k] === 'Fail') check(`case${i} ${k} = Fail`, Number.isNaN(got[k]), String(got[k])); return; }
    check(`case${i} ${k}`, near(got[k], e[k]), `เว็บ ${got[k]} Excel ${e[k]}`);
  });
  const flex = { '[Ok.]': 'ok', '[Steel beam]': 'steel', '[Fail]': 'fail' }[e.flex];
  check(`case${i} flex`, r.flex === flex, r.flex + ' / ' + e.flex);
  check(`case${i} ช่องว่างดึงชั้น 1`, near(W.clearSpacing(p.b * 100, p.cov, p.stir.d / 10, p.tens[0]) ?? 0, e.clearT1) || !p.tens[0].main || !p.tens[0].main.n);
  check(`case${i} ช่องว่างอัดชั้น 1`, near(W.clearSpacing(p.b * 100, p.cov, p.stir.d / 10, p.comp[0]), e.clearC1));
  const sOk = !/Check/.test(e.stirTxt);
  check(`case${i} ระยะปลอก`, r.checks.find(x => x.code === 's').ok === sOk);
});

// ออกแบบอัตโนมัติ: ผลต้องผ่านการตรวจทุกข้อ และใช้เหล็กไม่เกินจำเป็น
const crit = W.criteria({ fcp: 240, F: 0.45, mode: 1, fy: 4000, fyv: 2400 });
[[{ Mpos: 1500, Mneg: 1850, V: 4200, T: 0 }, { b: 0.2, h: 0.4, L: 4.5, type: 3, cov: 3 }],
 [{ Mpos: 1200, Mneg: 1800, V: 2500, T: 80 }, { b: 0.2, h: 0.4, L: 4, type: 2, cov: 3 }],
 [{ Mpos: 0, Mneg: 2200, V: 2600, T: 0 }, { b: 0.2, h: 0.4, L: 1.5, type: 4, cov: 3 }],
 [{ Mpos: 3500, Mneg: 4500, V: 9000, T: 200 }, { b: 0.25, h: 0.5, L: 6, type: 3, cov: 3 }]].forEach(([f, g], i) => {
  const d = W.beamDesign(f, g, crit);
  check(`ออกแบบ ${i} ผ่าน`, d.ok, JSON.stringify(d.rebar));
  check(`ออกแบบ ${i} เหล็กบน ≥ 2`, d.rebar.top[0] >= 2 && d.rebar.bot[0] >= 2);
  // ลดเหล็กล่าง 1 เส้นต้องไม่ผ่าน (ถ้ามากกว่า 2 เส้น) — ยืนยันว่าไม่เผื่อเกิน
  if (d.mid && d.rebar.bot[0] > 2 && !d.rebar.extra_bot) {
    const t = JSON.parse(JSON.stringify(d.mid.input)); const ly = t.tens[t.tens.length - 1]; if (ly.main.n > 0) ly.main.n--; else ly.sp.n--;
    check(`ออกแบบ ${i} ไม่เผื่อเกิน`, !W.beamCheck(t, crit).ok);
  }
  console.log(`  ออกแบบ ${i}:`, JSON.stringify(d.rebar), 'ratio', d.ratio.toFixed(3));
});
// หน้าตัดเล็กเกิน → ไม่ผ่าน
check('หน้าตัดเล็กเกิน', !W.beamDesign({ Mpos: 20000, Mneg: 25000, V: 30000, T: 0 }, { b: 0.15, h: 0.3, L: 6, type: 3, cov: 3 }, crit).ok);
console.log((ok ? 'PASS' : 'FAIL') + ` rcwsd ${n} ข้อ`);
process.exit(ok ? 0 : 1);
