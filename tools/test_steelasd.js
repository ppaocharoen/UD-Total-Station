// ทดสอบ lib/steelsec.js + lib/steelasd.js — เทียบค่าที่ LibreOffice คำนวณจากชีต NeoSteelDesignv5 (tools/neo_steel_cases.json)
// + ตารางหน้าตัด RC_Design + ตัวอย่างคำนวณมือ AISC 89 · รัน: node tools/test_steelasd.js
const Sec = require('../lib/steelsec.js');
const A = require('../lib/steelasd.js');
const data = require('./neo_steel_cases.json');
let pass = 0, fail = 0;
function check(name, ok, msg) { if (ok) pass++; else { fail++; console.log('FAIL', name, msg || ''); } }
const near = (a, b, tol = 1e-6) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
/** หน้าตัดจากค่าที่ป้อนในชีต (ทดสอบสูตร ไม่ใช่ตาราง) */
function mk(name) {
  const s = data.sections[name], p = Sec.props(name);
  return Object.assign({}, p, { A: s.A, Sx: s.Sx, Sy: s.Sy, Ix: s.Ix, Iy: s.Iy, rx: s.rx, ry: s.ry, w: s.w, tableNote: undefined });
}

// ---------- ตารางหน้าตัด ----------
{
  const c = Sec.props('C100x50x20x2.3');
  check('C100 จากตาราง', c.src === 'table' && near(c.A, 5.172) && near(c.Ix, 80.7) && near(c.Sx, 16) && near(c.ry, 1.92), JSON.stringify(c));
  const d = Sec.props('2C100x50x20x2.3');
  check('2C = 2×C (A)', d.src === 'computed' && near(d.A, 2 * 5.172, 0.01), d.A);
  check('2C = 2×C (Ix)', near(d.Ix, 2 * 80.7, 0.01), d.Ix);
  const b = Sec.props('BOX38x38x1.6');
  check('BOX38x38x1.6 คำนวณ', b.src === 'computed' && b.A > 2.2 && b.A < 2.3, b.A);
  const b23 = Sec.computeBOX(Sec.parse('BOX38x38x2.3')), t23 = Sec.props('BOX38x38x2.3');
  for (const k of ['A', 'Ix', 'Sx', 'rx']) check('BOX38x38x2.3 คำนวณ≈ตาราง ' + k, Math.abs(b23[k] - t23[k]) / t23[k] < 0.01, `${b23[k]} vs ${t23[k]}`);
  const c23 = Sec.computeCL(Sec.parse('C100x50x20x2.3'));
  for (const k of ['A', 'Ix', 'Iy', 'Sx', 'rx', 'ry']) check('C100 คำนวณ≈ตาราง ' + k, Math.abs(c23[k] - c[k]) / c[k] < 0.04, `${c23[k]} vs ${c[k]}`);
  check('ชื่อ BOX50x25x2.0 = ตาราง 50x25x2', Sec.props('BOX50x25x2.0').src === 'table' && near(Sec.props('BOX50x25x2.0').Iy, 2.76));
  check('ตารางพิมพ์ผิด BOX25x25x1.6 rx → คำนวณ', Sec.props('BOX25x25x1.6').rx > 0.9 && /พิมพ์ผิด/.test(Sec.props('BOX25x25x1.6').tableNote));
  check('ตารางพิมพ์ผิด WF900 Sx → Ix/(d/2)', near(Sec.props('WF900x300x16x28').Sx, 411000 / 45, 1e-6));
  check('รู้จัก WF/H/CH/L/PIPE', ['H200x100x5.5x8', 'CH150x75x6.5x10', 'L50x50x6', 'PIPE60.5x2.3'].every(n => Sec.props(n)), '');
  check('rT ของ C100 ≈ 1.88', near(c.rT, 1.879, 0.01), c.rT);
  const fam = Sec.family('BOX', { sameShape: { H: 75, B: 75 } }).map(x => x.name);
  check('ตระกูล BOX75x75 เรียงเบา→หนัก', fam[0] === 'BOX75x75x2.3' && fam.includes('BOX75x75x4.5'), fam.join(','));
}

// ---------- Tension (Neo) ----------
for (const [i, cs] of data.tension.entries()) {
  const s = mk(cs.input.sec), e = cs.expect;
  const r = A.check(s, { P: cs.input.P }, { Lx: cs.input.L * cs.input.k, mat: { Fy: cs.input.Fy } });
  check(`T${i} Pt`, near(r.Pt, e.I23, 1e-4), `${r.Pt} vs ${e.I23}`);
  check(`T${i} ft`, near(r.ft, e.I25, 1e-4), `${r.ft} vs ${e.I25}`);
  check(`T${i} L/r`, near(r.Lr, e.I26, 1e-4), `${r.Lr} vs ${e.I26}`);
  const neoOK = /OK/.test(e.I22);
  check(`T${i} ผ่าน/ไม่ผ่าน`, r.ok === neoOK || (!neoOK && r.ok && r.ft <= 1440 && cs.input.P / 1440 > Math.trunc(cs.input.P / 1440 * 100) / 100), `${r.ok} vs ${e.I22}`);
}

// ---------- Compression (Neo) ----------
for (const [i, cs] of data.compression.entries()) {
  const x = cs.input, e = cs.expect, s = mk(x.sec);
  const klr = x.k * Math.max(x.Lx, x.Ly) * 100 / Math.min(s.rx, s.ry);
  check(`C${i} Cc`, near(A.Cc(x.Fy), e.I17), `${A.Cc(x.Fy)} vs ${e.I17}`);
  check(`C${i} KL/r`, near(klr, e.I18), `${klr} vs ${e.I18}`);
  const r = A.check(s, { P: -x.P }, { Lx: x.Lx, Ly: x.Ly, Kx: x.k, Ky: x.k, mat: { Fy: x.Fy } });
  if (klr <= 200) {
    const neoFa = klr <= e.I17 ? e.I21 : e.I23;
    check(`C${i} Fa`, near(A.Fa(klr, x.Fy), neoFa, 1e-9), `${A.Fa(klr, x.Fy)} vs ${neoFa}`);
    check(`C${i} check fa,Fa`, near(r.fa, x.P / s.A, 1e-4) && near(r.Fa, neoFa, 1e-4), JSON.stringify(r));
  } else check(`C${i} KL/r > 200: Neo Fa = 0.001 · เว็บไม่ผ่านด้วยความชะลูด`, e.I23 === 0.001 && !r.ok && r.govern === 'ความชะลูด', JSON.stringify(r));
  check(`C${i} ผ่าน/ไม่ผ่าน`, r.ok === /OK/.test(e.I27), `${r.ok} vs ${e.I27}`);
}

// ---------- Flexible (Neo) ----------
for (const [i, cs] of data.flexible.entries()) {
  const x = cs.input, e = cs.expect, sd = data.sections[x.sec];
  check(`F${i} Cb`, near(A.CbNeo(x.M1, x.Mmid, x.M2), e.Y), `${A.CbNeo(x.M1, x.Mmid, x.M2)} vs ${e.Y}`);
  const U = sd.B * x.n, V = sd.tf * x.n;
  check(`F${i} Lc`, near(A.LcNeo(U / 10, x.Fy), e.Z), `${A.LcNeo(U / 10, x.Fy)} vs ${e.Z}`);
  check(`F${i} Lu`, near(A.LuNeo(sd.D / 10, (U / 10) * (V / 10), x.Fy), e.AA), `${A.LuNeo(sd.D / 10, U * V / 100, x.Fy)} vs ${e.AA}`);
  if (x.type >= 4) check(`F${i} Fb1 ปีก`, near(A.FbFlangeNeo(e.AB, x.Fy), e.AI), `${A.FbFlangeNeo(e.AB, x.Fy)} vs ${e.AI}`);
  if (x.type >= 5) check(`F${i} Fb2 F1-6/7`, near(A.FbLTB(e.AF, e.Y, x.Fy), e.AJ), `${A.FbLTB(e.AF, e.Y, x.Fy)} vs ${e.AJ}`);
  check(`F${i} fb`, near(100 * x.Mmid / (sd.Sx * x.n), e.I31), '');
  const s = mk(x.sec), sa = A.shearAreas(s);
  // Neo คูณ tf ด้วยจำนวนตัว (J20) ในความลึกเอว — ทดสอบเฉพาะตัวเดียว
  if (x.type >= 4 && x.n === 1) check(`F${i} fv`, near(x.V / sa.Av, e.AK), `${x.V / sa.Av} vs ${e.AK}`);
  // เว็บใช้ AISC เต็ม: I/WF เมื่อ Lb เกิน → max(F1-6/7, F1-8) ≥ ค่า Neo · รางน้ำ Neo ใช้ 0.6Fy ตายตัว (ไม่ตรวจ LTB) — เว็บต้องไม่มากกว่า Neo
  if (x.n === 1) {
    const fb = A.FbX(s, A.material({ Fy: x.Fy }), { Lb: x.Lb, cb: e.Y }).Fb;
    const neo = e.S27;
    if (x.type >= 5) check(`F${i} Fbx เว็บ ≥ Neo (I/WF)`, fb >= neo - 1e-6, `${fb} vs ${neo}`);
    if (x.type === 4) check(`F${i} Fbx รางน้ำ เว็บ ≤ Neo`, fb <= neo + 1e-6, `${fb} vs ${neo}`);
    if (x.type === 2) check(`F${i} Fbx C-Lip ≤ 0.6Fy`, fb <= 0.6 * x.Fy + 1e-9, fb);
  }
}

// ---------- Purlin (Neo) ----------
for (const [i, cs] of data.purlin.entries()) {
  const x = cs.input, e = cs.expect, s = mk(x.sec);
  const r = A.purlin(Object.assign({}, x, { sec: s, mat: { Fy: x.Fy } }));
  for (const [k, c] of [['Wt', 'I19'], ['wx', 'I20'], ['wy', 'I21'], ['Mx', 'I22'], ['My', 'I23'], ['SreqNeo', 'I25'], ['wn', 'R27']])
    check(`P${i} ${k}`, near(r[k], e[c], 1e-4), `${r[k]} vs ${e[c]}`);
  check(`P${i} fb (Neo ไม่แยก Fb)`, near(r.fbx + r.fby, e.I27, 1e-4), `${r.fbx + r.fby} vs ${e.I27}`);
  if (x.slope <= 18) check(`P${i} Ry`, near(r.Ry, e.I32, 1e-4), `${r.Ry} vs ${e.I32}`);
  else check(`P${i} Ry Neo วงเล็บผิด`, near(e.I32, r.Wt + r.wn * x.s * Math.cos(x.slope * Math.PI / 180) * x.L / 2, 1e-4) && r.Ry > e.I32, `${r.Ry} vs Neo ${e.I32}`);
  // Neo ใช้ max(Ix,Iy)·max(wx,wy): หน้าตัดตั้ง (Ix > Iy, wy > wx) ได้เท่ากัน
  if (s.Ix >= s.Iy && r.wy >= r.wx) check(`P${i} dy`, near(r.dy, e.I28, 1e-4), `${r.dy} vs ${e.I28}`);
  if (x.sag > 1) check(`P${i} sag rod`, near(r.sagRodDmin, e.N30, 1e-6), `${r.sagRodDmin} vs ${e.N30}`);
}
{ // แปท่อกล่องวางแบน (Iy > Ix ของแนวรับน้ำหนัก): Neo จะใช้ I ผิดแกน
  const flat = Object.assign({}, Sec.props('BOX50x25x2.0'));
  [flat.Ix, flat.Iy, flat.Sx, flat.Sy] = [flat.Iy, flat.Ix, flat.Sy, flat.Sx];
  const r = A.purlin({ sec: flat, L: 1, s: 1, slope: 10, roofDL: 6, LL: 50, WL: 0, sw: 3, sag: 1 });
  const neoDy = 5 * Math.max(r.wx, r.wy) / 100 * 100 ** 4 / (384 * 2.1e6 * Math.max(flat.Ix, flat.Iy));
  check('แปวางแบน: เว็บใช้ Ix (แกนรับน้ำหนัก)', r.dy > neoDy * 2, `${r.dy} vs Neo ${neoDy}`);
  check('แปวางแบน: เตือนน้ำหนักแปเกินที่สมมติ', r.warn.some(w => /น้ำหนักแปจริง/.test(w)) === false);
}

// ---------- BColumn (Neo) — เทียบชิ้นส่วนสูตร (เว็บใช้ H1 เต็มแทน) ----------
for (const [i, cs] of data.bcolumn.entries()) {
  const x = cs.input, e = cs.expect, s = mk(x.sec);
  const klr = x.k * x.L * 100 / Math.min(s.rx, s.ry);
  check(`B${i} KL/r`, near(klr, e.I18), '');
  const fa = A.Fa(klr, x.Fy);
  check(`B${i} Fa`, near(fa, klr <= e.I17 ? e.I21 : e.I23), '');
  const neo = (x.P / s.A) / fa + (100 * x.Mx / s.Sx) / (0.6 * x.Fy) + (100 * x.My / e.Y8) / (0.6 * x.Fy);
  check(`B${i} สูตร Neo = fa/Fa + fbx/0.6Fy + fby/0.6Fy (mod 2)`, near(neo % 2, e.N27, 1e-9), `${neo} vs ${e.N27}`);
  const r = A.check(s, { P: -x.P, Mx: x.Mx, My: x.My }, { Lx: x.L, Kx: x.k, Ky: x.k, mat: { Fy: x.Fy } });
  check(`B${i} เว็บ (H1) ≥ Neo ไม่มีตัวขยาย`, r.ratio >= Math.min(neo, (x.P / s.A) / fa + (100 * x.Mx / s.Sx) / r.Fbx + (100 * x.My / s.Sy) / r.Fby) - 1e-9, `${r.ratio} vs ${neo}`);
  if (neo >= 2) check(`B${i} Neo MOD ทำให้ผ่านผิด — เว็บไม่ผ่าน`, !r.ok, r.ratio);
}

// ---------- คำนวณมือ AISC 89 ----------
{
  // H1: BOX75x75x3.2 P=3,000 อัด Mx=150 L=3 ม. K=1 Cm=0.85 (ตาราง A=8.93 Sx=20.1 r=2.91)
  const r = A.check('BOX75x75x3.2', { P: -3000, Mx: 150 }, { Lx: 3 });
  const klr = 300 / 2.91, fa = 3000 / 8.93, Fa = A.Fa(klr, 2400), fb = 15000 / 20.1;
  const fe = 12 * Math.PI ** 2 * 2.1e6 / (23 * klr * klr);
  const h11 = fa / Fa + 0.85 * fb / ((1 - fa / fe) * 0.66 * 2400), h12 = fa / 1440 + fb / (0.66 * 2400);
  check('H1-1/H1-2 มือ', near(r.ratio, Math.max(h11, h12), 1e-4) && r.eq === 'H1-1/H1-2', `${r.ratio} vs ${h11},${h12} ${r.eq}`);
  check('ท่อกล่อง compact 0.66Fy', near(r.Fbx, 1584), r.Fbx);
  // H1-3: fa/Fa ≤ 0.15
  const r3 = A.check('BOX75x75x3.2', { P: -500, Mx: 150 }, { Lx: 3 });
  check('H1-3 มือ', r3.eq === 'H1-3' && near(r3.ratio, (500 / 8.93) / A.Fa(klr, 2400) + fb / 1584, 1e-4), `${r3.ratio}`);
  // H2: ดึง+ดัด
  const r2 = A.check('C100x50x20x2.3', { P: 2000, Mx: 100 }, { Lx: 1, Lb: 1 });
  check('H2 มือ', r2.eq === 'H2-1' && near(r2.ratio, (2000 / 5.172) / 1440 + (10000 / 16) / r2.Fbx, 1e-4), `${r2.ratio}`);
  // LTB C-Lip: Lb 3 ม. Cb 1 → max(F1-6/7, F1-8)
  const c = Sec.props('C100x50x20x2.3'), fx = A.FbX(c, A.material(), { Lb: 3, cb: 1 });
  const f167 = A.FbLTB(300 / c.rT, 1, 2400), f18 = 12000 * 70.307 / (300 * 10 / (5 * 0.23));
  check('C-Lip LTB = max(F1-6/7, F1-8)', near(fx.Fb, Math.min(1440, Math.max(f167, f18)), 1e-6), `${fx.Fb} ${f167} ${f18}`);
  check('C-Lip Lb สั้น = 0.6Fy', near(A.FbX(c, A.material(), { Lb: 0.5 }).Fb, 1440));
  // Cb (AISC): ดัดทางเดียวโมเมนต์ปลายเท่ากัน = 1.0 · โค้งกลับ = 2.3 · Neo M1 = M2 ให้ 2.3 (ผิด)
  check('Cb ดัดทางเดียว M1=M2', near(A.Cb(1000, 1000, 0), 1), A.Cb(1000, 1000, 0));
  check('Cb โค้งกลับ', near(A.Cb(-1000, 1000, 0), 2.3), A.Cb(-1000, 1000, 0));
  check('Cb กลางช่วงมาก = 1', near(A.Cb(0, 0, 500), 1));
  check('Neo M1=M2 ได้ Cb 2.3 (บันทึกใน NOTES)', near(A.CbNeo(1000, 400, 1000), 2.3));
  // แรงเฉือน 2 เอว
  const sb = Sec.props('BOX75x75x3.2');
  check('Av ท่อกล่อง 2 เอว', near(A.shearAreas(sb).Av, 2 * (7.5 - 0.64) * 0.32), A.shearAreas(sb).Av);
  // KL/r > 200 เตือน · ชิ้นไม่รู้จัก
  const rs = A.check('BOX38x38x1.6', { P: -100 }, { Lx: 3.5 });
  check('KL/r > 200 เตือนและไม่ผ่าน', !rs.ok && rs.warn.some(w => /KL\/r/.test(w)), JSON.stringify(rs.warn));
  check('หน้าตัดไม่รู้จัก', A.check('XYZ', { P: -1 }).ok === false);
  // ผนังบาง: BOX100x100x2.3 (b/t ≈ 40.5) ปกติ · BOX150x150x2.3 ไม่มีในตาราง คำนวณ → b/t > 238/√Fy เตือน
  check('b/t เกินพิกัด → เตือน', A.check('BOX150x150x2.3', { P: -1000 }, { Lx: 2 }).warn.some(w => /b\/t ปีก/.test(w)));
  check('C100x50x20x2.3 ไม่เกินพิกัด', !A.check('C100x50x20x2.3', { P: -500, Mx: 20 }, { Lx: 1 }).warn.some(w => /\//.test(w) && !/flexural/.test(w)));
  // หน้าตัดเบาสุดที่ผ่านในตระกูล
  const sg = A.suggest('C100x50x20x2.3', [{ Mx: 60, combo: 'c1' }, { Mx: 90, combo: 'c2' }], { Lb: 1 });
  check('suggest เบาสุดที่ผ่าน', sg && Sec.props(sg.name).w <= 4.06 && sg.ratio <= 1 && sg.combo === 'c2', JSON.stringify(sg));
  const sg2 = A.suggest('BOX75x75x3.2', [{ P: -6000 }], { Lx: 3 }, { sameShape: true });
  check('suggest ขนาดเดิมเปลี่ยนความหนา', sg2 && /^BOX75x75x/.test(sg2.name), JSON.stringify(sg2));
  const all = A.checkAll('BOX38x38x1.6', [{ P: -800, combo: 'a' }, { P: 900, combo: 'b' }], { Lx: 1 });
  check('checkAll เลือกชุดวิกฤต', all.rows.length === 2 && all.combo === 'a', JSON.stringify(all.combo));
}

console.log(`PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
