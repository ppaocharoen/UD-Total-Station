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

// ชีตพื้น (Two-way / One-way / Cantilever slaps) — โหมด excel: true ต้องตรงทุกค่า
const slabs = require('./rcwsd_slab_cases.json');
slabs.cases.forEach((cs, i) => {
  const p = Object.assign({ excel: true }, cs.input), e = cs.expect, cr = W.criteria(p);
  const r = p.kind === 'two' ? W.slabTwoWay(p, cr) : p.kind === 'one' ? W.slabOneWay(p, cr) : W.slabCant(p, cr);
  const g = { fc: cr.fc, fs: cr.main.fs, k: cr.main.k, j: cr.main.j, R: cr.main.R, self: r.self, w: r.w, hmin: r.hmin, dreq: r.dreq, d: r.d };
  if (p.kind === 'two') {
    Object.assign(g, { m: r.m, dL: r.dL, McS: r.McS, McL: r.McL, sS: r.sS, sL: r.sL, RS: r.RS, RL: r.RL });
    ['Sd', 'Sm', 'Sc', 'Ld', 'Lm', 'Lc'].forEach(k => { g['c' + k] = r.C[k]; g['M' + k] = r.M[k]; g['As' + k] = r.As[k]; });
  } else Object.assign(g, { M: r.M, V: r.V, As: r.As, sMain: r.sMain, Vc: r.Vc, Mc: r.Mc, Asmin: r.Asmin, sTemp: r.sTemp, N: r.N, U: r.U, Ua: r.Ua, Vb: r.Vb });
  Object.keys(e).forEach(k => {
    if (k === 'bond') { check(`slab${i} bond`, (e[k] === '[Ok.]') === r.bondExcel); return; }
    if (typeof e[k] !== 'number') return;
    check(`slab${i} ${p.kind} ${k}`, near(g[k], e[k], 1e-9), `เว็บ ${g[k]} Excel ${e[k]}`);
  });
});

// ฉบับแก้ (RC_Design_WSD_UDfix.xlsm) — โหมดออกแบบของเว็บต้องตรงกับไฟล์ที่แก้แล้ว
const bfix = require('./rcwsd_beam_cases_fix.json');
bfix.cases.forEach((cs, i) => {
  const p = cs.input, e = cs.expect, cr = W.criteria(p), r = W.beamCheck(p, cr);
  ['dp', 'd', 'Mc', 'As', 'Asc', 'Asmin', 'Vc', 'Vp', 'Av_s', 'At_s', 'smax', 'Avmin', 'reqT', 'reqC'].forEach(k => {
    if (typeof e[k] === 'number') check(`fix beam${i} ${k}`, near(r[k], e[k]), `เว็บ ${r[k]} Excel ${e[k]}`);
  });
  check(`fix beam${i} ระยะปลอก`, r.checks.find(x => x.code === 's').ok === !/Check/.test(e.stirTxt));
});
const sfix = require('./rcwsd_slab_cases_fix.json');
sfix.cases.forEach((cs, i) => {
  const p = Object.assign({}, cs.input), e = cs.expect, cr = W.criteria(p);
  const r = p.kind === 'two' ? W.slabTwoWay(p, cr) : p.kind === 'one' ? W.slabOneWay(p, cr) : W.slabCant(p, cr);
  const g = Object.assign({}, r, p.kind === 'two' ? { MSm: r.M.Sm } : {});
  Object.keys(e).forEach(k => {
    if (k === 'bond') { check(`fix slab${i} bond`, (e[k] === '[Ok.]') === r.checks.find(x => x.code === 'bond').ok); return; }
    if (typeof e[k] !== 'number') return;
    check(`fix slab${i} ${p.kind} ${k}`, near(g[k], e[k], 1e-9), `เว็บ ${g[k]} Excel ${e[k]}`);
  });
});

// เสาปลอกเดี่ยว / ฐานแผ่ (ฉบับแก้: e = M/P ไม่วนอ้างอิง)
const cf = require('./rcwsd_colfoot_cases.json');
cf.cases.forEach((cs, i) => {
  const p = Object.assign({ excel: true }, cs.input), e = cs.expect, cr = W.criteria({ fcp: p.fcp, fy: p.fy, fyv: p.fyv || 2400, mode: p.mode || 1, F: p.F || 0.45 });
  if (p.kind === 'col') {
    p.rT = e.rT; p.rB = e.rB;
    const r = W.columnCheck(p, cr);
    ['LB', 'Ag', 'rho', 'Pa', 'Fa', 'Fb', 'P0', 'dp', 'Ix', 'Iy', 'Mfx', 'Mfy', 'eax', 'eay', 'ebx', 'eby', 'Pbx', 'Pby', 'Mbx', 'Mby', 'Mox', 'Moy', 'ex', 'ey', 'Pd', 'fa', 'fbx', 'fby', 'Mxd', 'Myd', 'R'].forEach(k => {
      if (typeof e[k] === 'number') check(`col${i} ${k}`, near(r[k], e[k], 1e-9), `เว็บ ${r[k]} Excel ${e[k]}`);
    });
    check(`col${i} sTie`, near(Math.min(16 * W.slabBar(p.dMain, true).D, 48 * W.slabBar(p.dTie, true).D, Math.min(p.Bx, p.By)), e.sTie));
    check(`col${i} zone`, r.zone === { 'e < ea': 1, 'ea ≤ e ≤ eb': 2, 'e > eb': 3 }[e.zone], r.zone + ' ' + e.zone);
    if (typeof e.res === 'number') check(`col${i} ratio`, near(r.ratio, e.res, 1e-9), `${r.ratio} ${e.res}`);
    const main = r.checks.find(c => ['pa', 'inter'].includes(c.code));
    if (e.R > 0) check(`col${i} ผล`, main && main.ok === (e.ok === 'Ok.'), JSON.stringify(main));
    else check(`col${i} R ≤ 0 ต้องไม่ผ่าน (Excel ขึ้น Ok.)`, !r.ok);
  } else {
    const r = W.footingCheck(p, cr);
    Object.keys(e).forEach(k => { if (typeof e[k] === 'number' && r[k] !== undefined) check(`foot${i} ${k}`, near(r[k], e[k], 1e-9), `เว็บ ${r[k]} Excel ${e[k]}`); });
    const ck = c => r.checks.find(x => x.code === c).ok;
    check(`foot${i} ok d`, ck('d') === (e.okD === 'Ok.')); check(`foot${i} ok vb`, ck('vb') === (e.okVb === 'Ok.')); check(`foot${i} ok vp`, ck('vp') === (e.okVp === 'Ok.'));
    check(`foot${i} ok asL`, ck('asL') === (e.okL === 'Ok.')); check(`foot${i} ok asS`, ck('asS') === (e.okS === 'Ok.'));
    check(`foot${i} ok bondL`, ck('bondL') === (e.okBL === 'Ok.')); check(`foot${i} ok bondS`, ck('bondS') === (e.okBS === 'Ok.'));
    check(`foot${i} ok q`, (ck('qy') && ck('qy0') && ck('qx') && ck('qx0')) === [e.okQ1, e.okQ2, e.okQ3, e.okQ4].every(v => v === 'Ok.'));
  }
});
const cc = W.criteria({ fcp: 240, fy: 4000, mode: 1 });
const cd = W.columnDesign({ L: 3, Bx: 20, By: 20, cov: 3, P: 15000, Mx: 300, My: 200, case: 1 }, cc);
check('ออกแบบเสา ผ่าน', cd.ok, JSON.stringify({ d: cd.dMain, nX: cd.nX, nY: cd.nY, e: cd.error }));
console.log(`  เสา: ${cd.nX + cd.nY - 4}-DB${cd.dMain} ปลอก RB${cd.dTie}@${cd.sTie}`);
const fd = W.footingDesign({ cov: 7.5, t: 0.3, Bx: 1.2, By: 1.2, Df: 1.5, P: 30000, Mx: 300, My: 300, qa: 15000, gamma: 1800, pier: 1, bx: 0.2, by: 0.2 }, cc, { resize: true });
check('ออกแบบฐาน ผ่าน', fd.ok, JSON.stringify({ p: fd.p, e: fd.error }));
console.log(`  ฐาน: ${fd.p.Bx}×${fd.p.By}×${fd.p.t} DB${fd.p.dLong}@${fd.p.sLong} / DB${fd.p.dShort}@${fd.p.sShort}`);

// บันไดท้องเรียบ (Stair1–3 ฉบับแก้)
require('./rcwsd_stair_cases.json').cases.forEach((cs, i) => {
  const p = cs.input, e = cs.expect, cr = W.criteria(p), r = W.slabStair(p, cr);
  const g = Object.assign({ fc: cr.fc, fs: cr.main.fs, k: cr.main.k, j: cr.main.j, R: cr.main.R }, r);
  Object.keys(e).forEach(k => {
    if (k === 'bond') { check(`stair${i} bond`, (e[k] === '[Ok.]') === r.checks.find(x => x.code === 'bond').ok); return; }
    if (typeof e[k] === 'number') check(`stair${i} ${k}`, near(g[k], e[k], 1e-9), `เว็บ ${g[k]} Excel ${e[k]}`);
  });
});
// ออกแบบพื้น: ผลผ่าน และระยะไม่น้อยกว่า 0.10
const cs = W.criteria({ fcp: 240, mode: 1, fy: 2400, fyv: 2400 });
[['two', { S: 3.5, L: 4.2, t: 0.12, cov: 2, SDL: 100, LL: 300, case: 3 }], ['one', { L: 2.5, t: 0.1, cov: 2, SDL: 50, LL: 200, type: 1 }], ['cant', { L: 1.2, t: 0.1, cov: 2, SDL: 50, LL: 200, P: 100, a: 1 }],
 ['two', { S: 4, L: 4, t: 0.12, cov: 2, SDL: 100, LL: 300, case: 5 }]].forEach(([k, p], i) => {
  const d = W.slabDesign(k, p, cs, [9, 12]);
  check(`ออกแบบพื้น ${i} ผ่าน`, d.ok, JSON.stringify({ dm: d.dm, dt: d.dt, sA: d.sA, sB: d.sB, e: d.error }));
  console.log(`  พื้น ${i} ${k}: ${d.dm}@${d.sA} / ${d.dt}@${d.sB}`, d.ok ? 'ผ่าน' : d.error);
});
check('พื้นบางเกิน', !W.slabDesign('one', { L: 4.5, t: 0.1, cov: 2, SDL: 100, LL: 400, type: 1 }, cs).ok);
console.log((ok ? 'PASS' : 'FAIL') + ` rcwsd ${n} ข้อ`);
process.exit(ok ? 0 : 1);
