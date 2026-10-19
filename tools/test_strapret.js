// ทดสอบ lib/strapret.js (โหมด excel) เทียบค่าที่ LibreOffice คำนวณจากชีต Strapf / Retain ของ Neo RC v5 Plus
const SR = require('../lib/strapret.js'), cases = require('./strapret_cells.json');
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let pass = 0, fail = 0;
const check = (n, ok, m) => { if (ok) pass++; else { fail++; console.log('FAIL', n, m || ''); } };
const MS = { Ptot: 'P3', Areq: 'R3', AreqE: 'P4', AreqI: 'R4', xi: 'T3', xc: 'J10', qavg: 'T5', Re: 'P6', qe: 'R6', Ri: 'P7', qi: 'R7', MeT: 'T6', MiT: 'T7', dreqE: 'X6', dreqI: 'X7',
  w: 'V3', x0: 'P8', Mb: 'R8', dreqB: 'T8', hreq: 'F26', Vb: 'V8', v: 'X8', Mc: 'P10', AsTop: 'P12', AsBot: 'R12', fsc: 'T12', nTop: 'P13', nBot: 'R13', AsT: 'P17', sT: 'R17', Ld: null };
const fe = { M: 'R15', V: 'T15', Vd: 'V15', As: 'X15', v: 'R16', u: 'T16', per: 'V16', n: 'X16' }, fi = { M: 'R19', V: 'T19', Vd: 'V19', As: 'X19', v: 'R20', u: 'T20', per: 'V20', n: 'X20' };
const MR = { Ka: 'V1', pw: 'P5', pb: 'P6', psur: 'P7', Ww: 'R5', Wb: 'R6', Wsoil: 'R7', Wsur: 'T5', Wwat: 'T6', W: 'T7', F: 'U8', slideRatio: 'T8', Mw: 'P8', dW: 'R8', MR: 'U9', Mo: 'S10', FSo: 'T10',
  xbar: 'P11', Lp: 'Q11', qmax: 'R11', Mtoe: 'Q12', Mheel: 'Q13', Vheel: 'R13', Mmax: 'P14', dB: 'Q14', AsW: 'J17', AsB: 'J20', AsT: 'J23', v: 'F24' };
cases.forEach(({ inp: c, cells: e }, i) => {
  const C = { fcp: c.fcp, fs: c.fs, k: c.k, j: c.j, R: c.R };
  if (c.kind === 'strap') {
    const r = SR.strapCheck(Object.assign({}, c, { excel: true }), C);
    for (const [k, cell] of Object.entries(MS)) if (cell && typeof e[cell] === 'number') check(`strap${i} ${k}`, near(r[k], e[cell]), `เว็บ ${r[k]} Excel ${e[cell]}`);
    for (const [k, cell] of Object.entries(fe)) check(`strap${i} ext ${k}`, near(r.fe[k], e[cell]), `เว็บ ${r.fe[k]} Excel ${e[cell]}`);
    for (const [k, cell] of Object.entries(fi)) check(`strap${i} int ${k}`, near(r.fi[k], e[cell]), `เว็บ ${r.fi[k]} Excel ${e[cell]}`);
    check(`strap${i} ปลอก`, near(r.sSt, Math.trunc(e.T13) / 100), `${r.sSt} ${e.T13}`);
    const okX = ['G17', 'G21', 'G19', 'G23', 'G27'].every(k => /OK/.test(e[k]));
    check(`strap${i} ผ่าน/ไม่ผ่าน`, okX === r.checks.filter(x => x.code !== 'Lb').every(x => x.ok), `${['G17', 'G21', 'G19', 'G23', 'G27'].map(k => e[k])} vs ${JSON.stringify(r.checks.map(x => x.code + x.ok))}`);
  } else {
    const r = SR.retainCheck(Object.assign({}, c, { excel: true }), C);
    for (const [k, cell] of Object.entries(MR)) if (typeof e[cell] === 'number') check(`ret${i} ${k}`, near(r[k], e[cell]), `เว็บ ${r[k]} Excel ${e[cell]}`);
    const sp = cell => +String(e[cell]).match(/@ ([\d.]+)/)[1];
    check(`ret${i} ระยะเหล็ก`, near(r.sW, sp('I19')) && near(r.sB, sp('I22')) && near(r.sT, sp('I25')), `${r.sW} ${r.sB} ${r.sT} vs ${e.I19} ${e.I22} ${e.I25}`);
    const fl = (cell, okRe) => okRe.test(String(e[cell]));
    check(`ret${i} พลิก`, fl('G21', /OK/) === r.checks.find(x => x.code === 'ot').ok);
    check(`ret${i} เลื่อน`, fl('G23', /OK/) === r.checks.find(x => x.code === 'slide').ok);
    check(`ret${i} เฉือน`, fl('G24', /OK/) === r.checks.find(x => x.code === 'v').ok, `${e.G24} ${r.v}`);
  }
});
// ฉบับแก้: เทียบกับการอินทิเกรตเชิงตัวเลขของแรงดันดินใต้ฐาน (สี่เหลี่ยมคางหมู/สามเหลี่ยม)
const Cf = { fcp: 240, fs: 1700, fsv: 1200, k: 0.35, j: 0.87, R: 7.4 };
[{ H: 4, Hs: 3, gam: 2000, q: 1000, hw: 0.5, qa: 10000, phi: 25, beta: 25, mu: 0.4, tb: 0.45, tw: 0.25, B1: 1, B2: 5 }, { H: 3, Hs: 3, gam: 1800, q: 500, hw: 0, qa: 10000, phi: 30, beta: 0, mu: 0.5, tb: 0.3, tw: 0.2, B1: 0.4, B2: 1.2 }].forEach((p, i) => {
  const r = SR.retainCheck(Object.assign({ dW: 12, dB: 12, dT: 12 }, p), Cf), B = p.B1 + p.B2, xs = p.tw + p.B1, Lp = r.LpUse;
  const qAt = x => x > Lp ? 0 : r.qmax + (r.qmin - r.qmax) * x / Lp; let M = 0, F = 0, Mt = 0, Wq = 0; const n = 200000;
  for (let k = 0; k < n; k++) { const x = xs + (B - xs) * (k + 0.5) / n, dx = (B - xs) / n; F += qAt(x) * dx; M += qAt(x) * (x - xs) * dx; const y = p.B1 * (k + 0.5) / n; Mt += qAt(y) * (p.B1 - y) * p.B1 / n; const z = B * (k + 0.5) / n; Wq += qAt(z) * B / n; }
  const Wd = r.Wsoil + r.Wsur + r.Wwat + (p.B2 - p.tw) * p.tb * 2400;
  check(`retain fix${i} แรงดันรวม = น้ำหนัก`, near(Wq, r.W, 1e-6), `${Wq} ${r.W}`);
  check(`retain fix${i} โมเมนต์ส้น`, near(Wd * (p.B2 - p.tw) / 2 - M, r.Mheel, 1e-6), `${Wd * (p.B2 - p.tw) / 2 - M} ${r.Mheel}`);
  check(`retain fix${i} เฉือนส้น`, near(Wd - F, r.Vheel, 1e-6));
  check(`retain fix${i} โมเมนต์ปลายเท้า`, near(Mt - p.tb * p.B1 * 2400 * p.B1 / 2, r.Mtoe, 1e-6));
  check(`retain fix${i} แขนน้ำหนักจรเป็นผลบวก`, near(r.MR - (((p.B1 + 0.5 * p.tw) * r.Ww) + (B / 2 * r.Wb) + ((p.tw + p.B1) + (p.B2 - p.tw) * 0.5) * (r.Wsoil + r.Wsur + r.Wwat)), 0));
});
const st = SR.strapCheck({ L: 3.5, bxe: 0.2, lxe: 0.2, P1: 12000, bxi: 0.2, lxi: 0.2, P2: 20000, Lxe: 1, Lye: 1.5, te: 0.25, Lxi: 1.5, ti: 0.25, bb: 0.25, hb: 0.55, qa: 10000, dTop: 12, dBot: 12, dSt: 6, dFe: 12, dFi: 12, dT: 12 }, Cf);
check('strap fix แรงดัน = R/พื้นที่', near(st.qe, st.Re / 1.5) && near(st.qi, st.Ri / 2.25));
check('strap fix ความหนาใช้แรงดันจริง', near(st.MeT, (st.Re / 1.5 * 1) * ((1.5 - 0.2) / 2) ** 2 / 2));
console.log(`strapret: ผ่าน ${pass} ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
