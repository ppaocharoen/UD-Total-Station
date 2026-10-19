/*! pilecap.js — ฐานรากเสาเข็ม 1–9 ต้น (WSD)
 * ที่มา: RC_Design_WSD ชีต "1 Pile" … "9 pile" ฉบับแก้ (UDfix) — พอร์ตทีละเซลล์
 * ส่วนที่แก้จากต้นฉบับ (ตกลงกับผู้ใช้แล้ว ดู NOTES):
 *  - เข็มเจาะ: เส้นรอบรูปเฉือนทะลุรอบเข็ม π·(D + d)
 *  - 3 ต้น: มุม 60° (ต้นฉบับ TAN(45) เป็นเรเดียน), แรงต่อเข็มจากโมเมนต์แบบ Σx², แกนหัวสามเหลี่ยมใช้ระยะ 2h/3
 *  - 6 ต้น: แถวเข็มแนว y อยู่ที่ ±Dny/2
 *  - 4–9 ต้น: นับเหล็กหักระยะหุ้ม
 *  - 5–9 ต้น: เฉือนแนว y ใช้ d ชั้นที่สอง (เหมือน 4 ต้น) · 5/7/9 ต้น: เว็บเพิ่มตรวจเฉือนทะลุรอบตอม่อ
 * หน่วย: แรง กก. · โมเมนต์ กก.-ม. · ขนาด ม. · ระยะหุ้ม ซม. · หน่วยแรง ksc
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./rcwsd.js') : root.RcWsd);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PileCap = api;
})(typeof self !== 'undefined' ? self : this, function (RC) {
  'use strict';
  // ตารางเสาเข็ม (AS94:BC115) — [รหัส, ชนิด, ขนาด, พื้นที่ ตร.ซม., เส้นรอบรูป ซม., กว้าง/เส้นผ่านศูนย์กลาง ม.]
  const PILES = [
    [1, 'driven', 'I-18', 235, 83, 0.18], [2, 'driven', 'I-22', 332, 105, 0.22], [3, 'driven', 'I-26', 460, 126, 0.26],
    [4, 'driven', 'I-30', 570, 154, 0.3], [5, 'driven', 'I-35', 880, 165, 0.35], [6, 'driven', 'I-40', 1235, 180, 0.4],
    [7, 'driven', 'S-16', 256, 64, 0.16], [8, 'driven', 'S-18', 324, 72, 0.18], [9, 'driven', 'S-22', 484, 88, 0.22],
    [10, 'driven', 'S-26', 676, 104, 0.26], [11, 'driven', 'S-30', 900, 120, 0.3], [12, 'driven', 'S-35', 1225, 140, 0.35],
    [13, 'driven', 'S-40', 1600, 160, 0.4], [14, 'driven', 'SO-40', 1286, 160, 0.4], [15, 'driven', 'SO-525', 2650, 210, 0.525],
    [16, 'driven', 'HP-15', 138, 50, 0.15],
    [17, 'bored', 'Ø0.35', 960, 110, 0.35], [18, 'bored', 'Ø0.40', 1260, 125.7, 0.4], [19, 'bored', 'Ø0.50', 1960, 157.1, 0.5],
    [20, 'bored', 'Ø0.60', 2830, 188.5, 0.6], [21, 'bored', 'Ø0.80', 5030, 251.3, 0.8], [22, 'bored', 'Ø1.00', 7850, 314.2, 1]
  ].map(([id, kind, code, A, per, w]) => ({ id, kind, code, A, per, w, name: (kind === 'bored' ? 'เข็มเจาะ ' : 'เข็มตอก ') + code }));
  const pileOf = id => PILES.find(x => x.id === +id) || PILES[10];
  /** แผนผังเข็ม 4–9 ต้น: ระยะศูนย์ถึงศูนย์ Dnx/Dny · fx/fy = จำนวนช่วงในแนวนั้น
   *  ax/ay = ระยะเข็มแถวนอกจากศูนย์ (เท่าของ Dn) · Sx/Sy = Σx²/Dn² · kx/ky = จำนวนเข็มในแถวนอก · kd = ตัวคูณเดือย */
  const GRID = {
    4: { fx: 1, fy: 1, ax: 0.5, ay: 0.5, Sx: 4, Sy: 4, kx: 2, ky: 2, kd: 2 },
    5: { fx: 2, fy: 2, ax: 1, ay: 1, Sx: 4, Sy: 4, kx: 2, ky: 2, kd: 2 },
    6: { fx: 2, fy: 1, ax: 1, ay: 0.5, Sx: 4, Sy: 6, kx: 2, ky: 3, kd: 3 },
    7: { fx: 2, fy: 2, ax: 1, ay: 1, Sx: 6, Sy: 4, kx: 3, ky: 2, kd: 3 },
    8: { fx: 2, fy: 2, ax: 1, ay: 1, Sx: 6, Sy: 6, kx: 3, ky: 3, kd: 3 },
    9: { fx: 2, fy: 2, ax: 1, ay: 1, Sx: 6, Sy: 6, kx: 3, ky: 3, kd: 3 }
  };
  /** ตำแหน่งเข็ม (ม. จากศูนย์ฐาน) ใช้วาดรูป/ถอดปริมาณ */
  function layout(n, Dnx, Dny) {
    const g = (xs, ys, skip) => { const o = []; ys.forEach(y => xs.forEach(x => { if (!skip || !skip(x, y)) o.push([x, y]); })); return o; };
    const h = Math.tan(Math.PI / 3) * Dnx / 2;
    switch (+n) {
      case 1: return [[0, 0]];
      case 2: return [[-Dnx / 2, 0], [Dnx / 2, 0]];
      case 3: return [[-Dnx / 2, -h / 3], [Dnx / 2, -h / 3], [0, 2 * h / 3]];
      case 4: return g([-Dnx / 2, Dnx / 2], [-Dny / 2, Dny / 2]);
      case 5: return g([-Dnx, Dnx], [-Dny, Dny]).concat([[0, 0]]);
      case 6: return g([-Dnx, 0, Dnx], [-Dny / 2, Dny / 2]);
      case 7: return g([-Dnx, 0, Dnx], [-Dny, 0, Dny], (x, y) => x === 0 && y !== 0);
      case 8: return g([-Dnx, 0, Dnx], [-Dny, 0, Dny], (x, y) => x === 0 && y === 0);
      case 9: return g([-Dnx, 0, Dnx], [-Dny, 0, Dny]);
    }
    return [];
  }
  const roundup1 = x => Math.ceil(x * 10 - 1e-9) / 10;   // ROUNDUP(x,1)
  const rd0 = x => Math.floor(x + 1e-9);                   // ROUNDDOWN(x,-0.5) = ปัดลงจำนวนเต็ม
  const rd2 = x => Math.floor(x * 100 + 1e-9) / 100;
  /** ส่วนของแรงเข็มที่อยู่นอกหน้าตัดวิกฤต (กฎ ±15 ซม.) a = ระยะศูนย์เข็มถึงหน้าตัด (ซม.) */
  function frac(a, load) {
    const b = a < 0 ? -a : a;
    if (a < 0 && b < 15) return (a + 15) * (1 / 30) * load;
    if (a < 0) return 0;
    if (a > 0 && b < 15) return (a + 15) * (1 / 30) * load;
    if (a > 0) return load;
    return load / 2;
  }
  /** แรงฝืดผิว (AG20) กรณีไม่กรอกกำลังเข็ม */
  const skin = (per, L) => L <= 7 ? 600 * (per / 100) * L : (((800 + (200 * 0)) + (800 + (200 * (L - 7)))) * 0.5) * (per / 100) * (L - 7) + (600 * (per / 100) * 7);

  /**
   * ตรวจฐานรากเสาเข็ม
   * p: {n 1–9, cov ซม., t, Df, P, Mx, My, gamma, pier 1 เหลี่ยม|2 กลม, bx, by, D, pile (รหัสตาราง), len, fcPile, cap (กก./ต้น; 0 = คิดจากแรงฝืด),
   *     Dnx, Dny (ระยะเข็ม), Bx, By (เฉพาะ 1 ต้น; 2 ต้นกรอก By), dL, dS (มม.), sL, sS (ม.), nBar (3 ต้น), dDowel, nDowel, excel}
   * C: RcWsd.criteria()
   */
  function pileCapCheck(p, C) {
    const n = +p.n, X = !!p.excel, fs = C.main.fs, j = C.main.j, R = C.main.R, sq = Math.sqrt(C.fcp), fcp = C.fcp, fy = C.fy;
    const cov = +p.cov, t = +p.t, Df = +p.Df, P = +p.P, Mx = +p.Mx || 0, My = +p.My || 0, gam = +p.gamma || 1600;
    const pl = pileOf(p.pile), w = pl.w, L = +p.len || 0, fcPile = +p.fcPile || 350;
    const bL = RC.slabBar(+p.dL, X), bS = RC.slabBar(+p.dS || +p.dL, X), bD = RC.slabBar(+p.dDowel || +p.dL, X);
    const bx = +p.pier === 2 ? 0.886 * p.D : +p.bx, by = +p.pier === 2 ? 0.886 * p.D : +p.by;
    const o = { kind: 'pile', n, input: p, pileInfo: pl, bx, by, checks: [] };
    const chk = (code, label, ok, val, lim, unit = '') => o.checks.push({ code, label, ok: !!ok, val, lim, unit });
    const Dnx = +p.Dnx || 3 * w, Dny = +p.Dny || Dnx;
    o.Dnx = Dnx; o.Dny = Dny;
    // กำลังเข็ม
    o.P1 = 0.375 * fcp * pl.A; o.P2 = 0.375 * fcPile * pl.A; o.Pf = skin(pl.per, L);
    o.cap = +p.cap ? Math.min(+p.cap, o.P1, o.P2) : Math.min(o.P1, o.P2, o.Pf);
    o.capBy = +p.cap ? (o.cap === +p.cap ? 'ผลสำรวจดิน' : 'กำลังคอนกรีต') : 'แรงฝืด (ประมาณ)';
    o.fnb = P / ((bx * 100) * (by * 100)); o.fnb1 = 0.25 * fcp; o.fnb2 = 0.375 * fcp;
    if (n === 1) return one(p, C, o, chk);
    o.d1 = (t * 100) - cov - (bL.D / 2);                 // BM5
    o.d2 = (t * 100) - cov - bL.D - (bS.D / 2);          // BM6
    const d1 = o.d1, d2 = n === 2 || n === 3 ? d1 : o.d2;
    let Bx, By, area, Wt, Hmax;
    if (n === 3) {
      const tan60 = Math.tan(60 * Math.PI / 180);
      const AT8 = Dnx * 100, AT9 = (w * 100 * 1.3) + cov, AT12 = tan60 * (AT8 / 2), AT10 = AT12 / 3, AT11 = AT12 - AT10;
      const AT13 = AT9 + AT10, AT14 = AT9 + AT11, AT15 = AT13 + AT14, AT16 = AT9 + AT15, AT17 = (AT16 / tan60) * 2, AT18 = (AT9 / tan60) * 2;
      const AT19 = AT17 - (AT18 * 2), AV20 = (0.5 * AT17 * AT16) / (100 ** 2), AV21 = ((0.5 * AT18 * AT9) * 3) / (100 ** 2);
      Bx = AT18 / 100; By = AT19 / 100; area = AV20 - AV21;
      Object.assign(o, { h: AT12 / 100, side: AT17 / 100, height: AT16 / 100, clip: Bx, B1: Bx, B2: By, edge: AT9 / 100 });
      const AV23 = AT8 / 2 / 100, AV24 = AT11 / 100, AV10 = AT10 / 100;
      const mom = ((My * AV23) / (2 * ((AV23) ** 2))) + ((Mx * AV24) / (((AV24) ** 2) + 2 * ((AV10) ** 2)));
      Hmax = ((P + ((Df - t) * area * gam) + (t * area * 2400)) / 3) + mom; Wt = (P / 3) + mom;
      o.My_ = 1 * Wt * ((Dnx / 2) - (bx / 2));                 // AG21
      o.Mx_ = 1 * Wt * ((AT11 / 100) - (by / 2));              // N21
      const ux = (((Dnx * 100) - (bx * 100)) / 2);
      o.Vx = frac(ux - d1, Wt);                                // N22 (เข็มฐานสามเหลี่ยม)
      o.Vy = frac(AT11 - (by * 100 / 2) - d1, Wt);             // AG22 (เข็มหัวสามเหลี่ยม)
      o.Px = frac(ux - d1 / 2, P); o.Py = frac(AT11 - (by * 100 / 2) - d1 / 2, P);
      o.dreqX = Math.sqrt((o.Mx_ * 100) / (R * Bx * 100)); o.dreqY = Math.sqrt((o.My_ * 100) / (R * By * 100));
      chk('d', 'ความลึกที่ต้องการ √(M/(R·b))', d1 >= o.dreqX && d1 >= o.dreqY, Math.max(o.dreqX, o.dreqY), d1, 'ซม.');
      const AT25 = AT13 + (by * 100 / 2) + d1, AT26 = AT16 - AT25, AT27 = AT17 / 2, AT28 = ((AT27 / (AT26 + AT25)) * AT26) * 2;
      const AY25 = d1 + (bx * 100 / 2), AY26 = AT17 / 2, AY27 = AY26 - AY25, AY28 = AT16 * AY27 / AY26;
      o.bY = AT28; o.bX = AY28;
      o.vbY = o.Vy / (AT28 * d1); o.vbX = o.Vx / (AY28 * d1);
      o.lav = ((AT14 / 100 - bx) * 100) - cov;
    } else {
      if (n === 2) {
        Bx = roundup1(Dnx + (w * 1.3 * 2) + (cov * 2 / 100)); By = +p.By || roundup1(w * 2.6 + cov * 2 / 100);
        Hmax = ((P + ((Df - t) * Bx * By * gam) + (t * Bx * By * 2400)) / 2) + ((My * Dnx / 2) / (2 * ((Dnx / 2) ** 2)));
        Wt = ((P / 2) + ((My * Dnx / 2) / (2 * ((Dnx / 2) ** 2))));
        o.My_ = Wt * ((Dnx / 2) - (bx / 2)); o.Mx_ = 0;
        const ux = (((Dnx * 100) - (bx * 100)) / 2);
        o.Vx = frac(ux - d1, Wt); o.Vy = 0; o.Px = frac(ux - d1 / 2, P); o.Py = 0;
        o.dreqY = Math.sqrt((o.My_ * 100) / (R * By * 100)); o.dreqX = 0;
        chk('d', 'ความลึกที่ต้องการ √(M/(R·b))', d1 >= o.dreqY, o.dreqY, d1, 'ซม.');
        if (Mx) o.warn = 'ฐาน 2 ต้นไม่รับโมเมนต์ Mx (ตั้งฉากแนวเข็ม) — ตามชีตต้นฉบับ';
      } else {
        const G = GRID[n];
        Bx = roundup1((Dnx * G.fx) + (w * 1.3 * 2) + (cov * 2 / 100)); By = roundup1((Dny * G.fy) + (w * 1.3 * 2) + (cov * 2 / 100));
        const ax = Dnx * G.ax, ay = Dny * G.ay;
        const mom = ((My * ax) / (G.Sx * ((ax) ** 2))) + ((Mx * ay) / (G.Sy * ((ay) ** 2)));
        Hmax = ((P + ((Df - t) * Bx * By * gam) + (t * Bx * By * 2400)) / n) + mom; Wt = ((P / n) + mom);
        o.My_ = G.kx * Wt * (ax - (bx / 2)); o.Mx_ = G.ky * Wt * (ay - (by / 2));
        const ux = (((ax * 2 * 100) - (bx * 100)) / 2), uy = (((ay * 2 * 100) - (by * 100)) / 2);
        o.Vx = frac(ux - d1, Wt * G.kx); o.Vy = frac(uy - d2, Wt * G.ky);
        o.Px = frac(ux - d1 / 2, P); o.Py = frac(uy - d2 / 2, P);
        o.dreqX = Math.sqrt((o.Mx_ * 100) / (R * Bx * 100)); o.dreqY = Math.sqrt((o.My_ * 100) / (R * By * 100));
        chk('d', 'ความลึกที่ต้องการ √(M/(R·b))', d2 >= o.dreqX && d1 >= o.dreqY, Math.max(o.dreqX - d2, o.dreqY - d1) + Math.min(d1, d2), Math.min(d1, d2), 'ซม.');
        o.G = G;
      }
      o.vbX = o.Vx / ((By * 100) * d1); o.vbY = o.Vy / ((Bx * 100) * d2);
    }
    o.Bx = Bx; o.By = By; o.Hmax = Hmax; o.W = Wt;
    o.vc = 0.29 * sq; o.vp = 0.53 * sq;
    chk('cap', 'แรงต่อเข็มสูงสุด ≤ กำลังเข็ม', o.cap >= Hmax, Hmax, o.cap, 'กก./ต้น');
    chk('vb', "เฉือนแบบคาน ≤ 0.29√f'c", o.vbX < o.vc && o.vbY < o.vc, Math.max(o.vbX, o.vbY), o.vc, 'ksc');
    o.bo = (((bx * 100) + (d1 / 2 * 2)) * 2) + (((by * 100) + (d2 / 2 * 2)) * 2);
    o.vpX = o.Px / (o.bo * d1); o.vpY = o.Py / (o.bo * d2);
    chk('vp', "เฉือนทะลุรอบตอม่อ ≤ 0.53√f'c", o.vpX < o.vp && o.vpY < o.vp, Math.max(o.vpX, o.vpY), o.vp, 'ksc');
    o.boPile = pl.kind === 'bored' ? ((w * 100) + d1) * Math.PI : ((w * 100) + d1) * 4;
    o.vsX = Wt / (o.boPile * d1); o.vsY = Wt / (o.boPile * d2);
    chk('vs', "เฉือนทะลุรอบเสาเข็ม ≤ 0.53√f'c", o.vsX < o.vp && o.vsY < o.vp, Math.max(o.vsX, o.vsY), o.vp, 'ksc');
    // ยึดหน่วง/ระยะฝัง
    const uCap = d => fy === 2400 ? 11 : (d <= 30 ? 35 : 25);
    const uOf = (D, d) => fy === 2400 ? (d <= 30 ? 1.615 : 1.145) * sq / D : (d <= 30 ? 3.23 : 2.29) * sq / D;
    o.uL = uOf(bL.D, d1); o.uLcap = uCap(d1);
    const ld = (D, u, cap) => u <= cap ? (D * fs) / (4 * u) : (D * fs) / (4 * cap);
    if (n === 3) {
      const nb = +p.nBar || 0;
      o.nL = nb; o.AL = bL.A * nb; o.As = (Math.max(o.My_, o.Mx_) * 100) / (fs * j * d1); o.Asmin = (14 / fy) * Bx * 100 * d1;
      chk('asL', 'เหล็กแต่ละแนว ≥ As และ ≥ As min', o.AL >= o.As && o.AL >= o.Asmin, o.AL, Math.max(o.As, o.Asmin), 'ตร.ซม.');
      o.perReqL = Wt / (o.uL * j * d1); o.perL = nb * bL.per;
      chk('bondL', 'เส้นรอบรูปเหล็ก ≥ ที่ต้องการ', o.perL >= o.perReqL, o.perL, o.perReqL, 'ซม.');
      o.ldL = ld(bL.D, o.uL, o.uLcap); o.ldLav = o.lav;
      chk('ldL', 'ระยะฝังเหล็ก', o.ldLav >= o.ldL, o.ldLav, o.ldL, 'ซม.');
    } else if (n === 2) {
      o.nL = rd0(((By - (cov * 2 / 100)) / +p.sL) + 1); o.nS = rd0(((Bx - (cov * 2 / 100)) / +p.sS) + 1);
      o.AsL = (o.My_ * 100) / (fs * j * d1); o.AsminL = (14 / fy) * By * 100 * d1; o.AL = bL.A * o.nL;
      o.AsS = 0.002 * (Bx * 100) * d1; o.AsminS = o.AsS; o.AS = bS.A * o.nS;
      chk('asL', 'เหล็กแนวยาว ≥ As และ ≥ As min', o.AL >= o.AsL && o.AL >= o.AsminL, o.AL, Math.max(o.AsL, o.AsminL), 'ตร.ซม.');
      chk('asS', 'เหล็กแนวสั้น ≥ 0.002·b·d', o.AS >= o.AsS, o.AS, o.AsS, 'ตร.ซม.');
      o.perReqL = Wt / (o.uL * j * d1); o.perL = o.nL * bL.per;
      chk('bondL', 'เส้นรอบรูปเหล็กแนวยาว ≥ ที่ต้องการ', o.perL >= o.perReqL, o.perL, o.perReqL, 'ซม.');
      o.ldL = ld(bL.D, o.uL, o.uLcap); o.ldLav = ((Bx - bx) * 100 / 2) - cov;
      chk('ldL', 'ระยะฝังเหล็กแนวยาว', o.ldLav >= o.ldL, o.ldLav, o.ldL, 'ซม.');
    } else {
      const G = o.G;
      o.nL = rd0(((By - (cov * 2 / 100)) / +p.sL) + 1); o.nS = rd0(((Bx - (cov * 2 / 100)) / +p.sS) + 1);
      o.AsL = (o.My_ * 100) / (fs * j * d1); o.AsminL = (14 / fy) * By * 100 * d1; o.AL = bL.A * o.nL;
      o.AsS = (o.Mx_ * 100) / (fs * j * d2); o.AsminS = (14 / fy) * Bx * 100 * d2; o.AS = bS.A * o.nS;
      chk('asL', 'เหล็กแนวยาว ≥ As และ ≥ As min', o.AL >= o.AsL && o.AL >= o.AsminL, o.AL, Math.max(o.AsL, o.AsminL), 'ตร.ซม.');
      chk('asS', 'เหล็กแนวสั้น ≥ As และ ≥ As min', o.AS >= o.AsS && o.AS >= o.AsminS, o.AS, Math.max(o.AsS, o.AsminS), 'ตร.ซม.');
      o.uS = uOf(bS.D, d2); o.uScap = uCap(d1);   // K32 ใช้ d แนวยาว (ตาม Excel)
      o.perReqL = (Wt * G.kx) / (o.uL * j * d1); o.perL = o.nL * bL.per;
      o.perReqS = (Wt * G.ky) / (o.uS * j * d2); o.perS = o.nS * bS.per;
      chk('bondL', 'เส้นรอบรูปเหล็กแนวยาว ≥ ที่ต้องการ', o.perL >= o.perReqL, o.perL, o.perReqL, 'ซม.');
      chk('bondS', 'เส้นรอบรูปเหล็กแนวสั้น ≥ ที่ต้องการ', o.perS >= o.perReqS, o.perS, o.perReqS, 'ซม.');
      o.ldL = ld(bL.D, o.uL, o.uLcap); o.ldLav = ((Bx - bx) * 100 / 2) - cov;
      o.ldS = ld(bS.D, o.uS, o.uScap); o.ldSav = ((By - by) * 100 / 2) - cov;
      chk('ldL', 'ระยะฝังเหล็กแนวยาว', o.ldLav >= o.ldL, o.ldLav, o.ldL, 'ซม.');
      chk('ldS', 'ระยะฝังเหล็กแนวสั้น', o.ldSav >= o.ldS, o.ldSav, o.ldS, 'ซม.');
    }
    // เหล็กเดือย
    if (+p.nDowel) {
      const kd = n <= 3 ? 1 : o.G.kd;
      o.uDcap = fy === 2400 ? 11 : 28; o.uD = fy === 2400 ? 0.86 * sq : 1.72 * sq;
      o.perReqD = (Wt * kd) / (o.uD * j * d1); o.perD = +p.nDowel * bD.per;
      o.ldD = (o.uD <= o.uDcap ? (bD.D * fs) / (4 * o.uD) : (bD.D * fs) / (4 * o.uDcap)) / 100; o.ldDuse = rd2(o.ldD + (o.ldD / 4));
      chk('dowel', 'เส้นรอบรูปเหล็กเดือย ≥ ที่ต้องการ', o.perD >= o.perReqD, o.perD, o.perReqD, 'ซม.');
    }
    o.area = n === 3 ? area : Bx * By;
    o.ok = o.checks.every(c => c.ok);
    return o;
  }
  /** 1 ต้น (ชีต "1 Pile"): รับแรงในแนวดิ่งเท่านั้น */
  function one(p, C, o, chk) {
    const X = !!p.excel, t = +p.t, cov = +p.cov, Bx = +p.Bx, By = +p.By || Bx, gam = +p.gamma || 1600;
    const bL = RC.slabBar(+p.dL, X), bS = RC.slabBar(+p.dS || 12, X);
    o.Bx = Bx; o.By = By; o.area = Bx * By;
    o.Hmax = +p.P + ((+p.Df - t) * Bx * By * gam) + (t * Bx * By * 2400); o.W = +p.P;
    o.Pc = 0.2125 * o.bx * 100 * o.by * 100 * C.fcp;
    chk('pc', "แรงกดบนตอม่อ ≤ 0.2125 f'c·A", o.Hmax <= o.Pc, o.Hmax, o.Pc, 'กก.');
    chk('cap', 'แรงต่อเข็ม ≤ กำลังเข็ม', o.cap >= o.Hmax, o.Hmax, o.cap, 'กก./ต้น');
    o.nL = rd0(((Bx - (cov * 2 / 100)) / +p.sL) + 1); o.nS = o.nL;
    o.Asmin = 0.002 * Bx * 100 * t * 100; o.AL = bL.A * o.nL;
    chk('asL', 'เหล็กตะแกรง ≥ 0.002·B·t', o.Asmin <= o.AL, o.AL, o.Asmin, 'ตร.ซม.');
    o.nRing = rd0(((t - (cov * 2 / 100)) / +p.sS) + 1); o.ARing = bS.A * o.nRing;
    if (+p.Mx || +p.My) o.warn = 'ฐาน 1 ต้นออกแบบรับแรงแนวดิ่งเท่านั้น — โมเมนต์ไม่ได้นำมาคิด (ตามชีตต้นฉบับ)';
    o.ok = o.checks.every(c => c.ok);
    return o;
  }

  /** ออกแบบ: เลือกจำนวนเข็มน้อยสุดที่รับได้ (ถ้าไม่ล็อก n) → ระยะเข็ม 3D → ความหนาเพิ่มทีละ 5 ซม. → เหล็ก (ระยะ 0.10–0.25 ม. ปัด 0.025) */
  function pileCapDesign(p, C, opt = {}) {
    const dias = (opt.dias && opt.dias.length ? opt.dias : [12, 16, 20]).slice().sort((a, b) => a - b);
    const pl = pileOf(p.pile), sp = +(3 * pl.w).toFixed(3);
    const base = Object.assign({ Dnx: sp, Dny: sp, t: 0.5, sL: 0.2, sS: 0.2, dL: dias[0], dS: dias[0], nBar: 0, nDowel: 0 }, p);
    if (!+p.Dnx) base.Dnx = sp; if (!+p.Dny) base.Dny = base.Dnx;
    const run = x => pileCapCheck(x, C), bad = (r, codes) => r.checks.some(c => !c.ok && codes.includes(c.code));
    const ns = opt.lockN ? [+p.n] : [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(k => k >= (+opt.minN || 1));
    let q = null;
    for (const n of ns) {
      const x = Object.assign({}, base, { n });
      if (n === 1) { x.Bx = +x.Bx || +(pl.w + 0.3).toFixed(2); x.By = +x.By || x.Bx; x.sS = +p.sS || 0.15; }
      if (n === 2 && !+p.By) x.By = roundup1(pl.w * 2.6 + (+x.cov) * 2 / 100);
      if (n === 1 && (+p.Mx || +p.My) && !opt.lockN) continue;    // 1 ต้นไม่รับโมเมนต์
      if (opt.resize !== false) for (let i = 0; i < 40 && bad(run(x), ['d', 'vb', 'vp', 'vs']); i++) x.t = +(x.t + 0.05).toFixed(2);
      q = x;
      if (!bad(run(x), ['cap', 'pc'])) break;    // เข็มรับได้ → ใช้จำนวนนี้
    }
    const geo = ['d', 'vb', 'vp', 'vs'];
    const bars = q => {
      let best = null;
      for (const d of dias) {
        if (q.n === 3) {
          for (let nb = 4; nb <= 40; nb++) { const x = Object.assign({}, q, { dL: d, nBar: nb }), r = run(x); if (!best || !best.ok) best = { r, ok: r.ok, p: x }; if (r.ok) break; }
        } else {
          for (let s = 0.25; s >= 0.1 - 1e-9; s -= 0.025) {
            const x = Object.assign({}, q, { dL: d, dS: q.n === 1 ? (q.dS || 12) : d, sL: +s.toFixed(3), sS: q.n === 1 ? (q.sS || 0.15) : +s.toFixed(3) }), r = run(x);
            if (!best || !best.ok) best = { r, ok: r.ok, p: x };   // ไม่ผ่านทั้งหมด → เก็บชุดเหล็กมากสุดที่ลอง
            if (r.ok) break;
          }
        }
        if (best && best.ok) break;
      }
      return best;
    };
    let best = bars(q);
    // เหล็กใหญ่ขึ้นทำให้ d ลด → เพิ่มความหนาแล้วจัดเหล็กใหม่
    for (let i = 0; i < 20 && !best.ok && opt.resize !== false && bad(best.r, geo) && !bad(best.r, ['cap', 'pc']); i++) { q = Object.assign({}, q, { t: +(q.t + 0.05).toFixed(2) }); best = bars(q); }
    if (!best.ok) best.error = bad(best.r, ['cap']) ? 'กำลังเข็มไม่พอ — เพิ่มจำนวน/ขนาดเข็ม' : bad(best.r, ['pc']) ? 'แรงกดบนตอม่อเกิน — ขยายตอม่อ' : bad(best.r, ['d', 'vb', 'vp', 'vs']) ? 'ฐานบางเกิน — เพิ่มความหนา' : 'จัดเหล็กไม่ผ่าน';
    return best;
  }
  const NOTES = [
    'เข็มเจาะ: เส้นรอบรูปเฉือนทะลุรอบเข็มใช้ π·(D + d) (ชีตต้นฉบับ 3–9 ต้นใช้ π·(D + d/2))',
    '3 ต้น: ใช้มุม 60° (ต้นฉบับ TAN(45) ถูกคิดเป็นเรเดียน) แรงต่อเข็มจากโมเมนต์คิดแบบ Σx² และแกนหัวสามเหลี่ยมใช้ระยะ 2h/3',
    '6 ต้น: แถวเข็มแนว y อยู่ที่ ±Dny/2 (ต้นฉบับใช้ Dny เต็มในโมเมนต์และเฉือน)',
    '4–9 ต้น: จำนวนเหล็กนับหลังหักระยะหุ้ม (B − 2c)/s + 1',
    '5–9 ต้น: เฉือนแบบคานแนว y ใช้ d ชั้นที่สองเหมือน 4 ต้น (ต้นฉบับ 5–9 ต้นใช้ d ชั้นแรก)',
    '5/7/9 ต้น: เว็บตรวจเฉือนทะลุรอบตอม่อเพิ่ม (ต้นฉบับคำนวณแรงแต่ไม่ได้ตรวจ)'
  ];
  return { PILES, pileOf, GRID, layout, pileCapCheck, pileCapDesign, NOTES, frac, skin };
});
