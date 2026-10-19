/*! steelconn.js — เพลทหัวเสา (เพลทฐานเสาเหล็กบนหัวเสา/ตอม่อ คสล.) รับแรงอัด + โมเมนต์
 * ที่มา: NeoSteelDesignv5 ชีต "Column Base Plate" (อ่านสูตรอย่างเดียว ไม่ปลดล็อกไฟล์) — พอร์ตทีละเซลล์
 * หน่วยตามชีต: แรง กก. · โมเมนต์ กก.-ม. · ขนาดหน้าตัด/เพลท มม. · ความหนาเพลท ซม. · หน่วยแรง ksc
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SteelConn = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TYPES = { 1: ['O', 'ท่อกลม'], 2: ['C', 'เหล็กตัวซีมีปีก'], 3: ['L', 'เหล็กฉาก'], 4: ['[]', 'ท่อเหลี่ยม'], 5: ['[', 'เหล็กรางน้ำ'], 6: ['I', 'เหล็ก I'], 7: ['WF', 'เหล็ก WF'] };
  const PLATES = [6, 8, 9, 10, 12, 16, 19, 20, 25, 28, 32];   // ความหนาเพลทที่มีขาย (มม.)
  const BOLTS = [12, 16, 20, 24, 25];
  const SIXTH = 0.0833333333333333;   // ค่าคงที่ 1/12 ตามที่เขียนในชีต
  /**
   * p: {P, M, type 1–7, wide, depth (มม. ขนาดเสาเหล็ก), B, L (มม. เพลท; L ตามแนวโมเมนต์), edge (มม. ขอบถึงสลัก), Fy, fcp, t (ซม. ที่ใช้), dBolt (มม.)}
   */
  function basePlate(p) {
    const P = +p.P, M = +p.M || 0, B = +p.B, L = +p.L, w = +p.wide, d = +p.depth, Fy = +p.Fy || 2400, fcp = +p.fcp;
    const o = { input: p, checks: [] }, chk = (code, label, ok, val, lim, unit = '') => o.checks.push({ code, label, ok: !!ok, val, lim, unit });
    o.grade = Fy > 2400 ? 'Fe-30' : 'Fe-24'; o.Fu = Fy > 2400 ? 5000 : 4100;
    o.Fb = 0.75 * Fy; o.Fp = 0.25 * fcp; o.Ft = 0.6 * 2400; o.Fv = 0.4 * 2400; o.Fw = 0.4 * Fy;
    const Bc = B / 10, Lc = L / 10, pAvg = P / (Bc * Lc);
    chk('B', 'เพลทกว้างไม่น้อยกว่าเสา และ P/A ≤ Fp', B >= w && pAvg <= o.Fp, B, w, 'มม.');
    chk('L', 'เพลทยาวไม่น้อยกว่าเสา และ P/A ≤ Fp', L >= d && pAvg <= o.Fp, L, d, 'มม.');
    o.x = (L - d) / 20; o.y = (((L - d) / 2) - +p.edge) / 10;
    chk('edge', 'ระยะสลักถึงผิวเสา ≥ 2.5 ซม.', !(o.y < 2.5), o.y, 2.5, 'ซม.');
    const noM = !M;
    if (noM) {
      o.fp = pAvg; chk('fp', 'แรงแบกทาน P/A ≤ 0.25 f\'c', o.fp <= o.Fp, o.fp, o.Fp, 'ksc');
      o.m = (Lc - 0.95 * (d / 10)) / 2; o.n = (Bc - 0.8 * (w / 10)) / 2;
      o.treq = 2 * Math.max(o.m, o.n) * Math.sqrt(o.fp / Fy);
      o.F = 0.1 * P; o.tension = false;
    } else {
      const s = (M * 100 * (0.1 * L / 2)) / (SIXTH * (0.1 * B) * (0.1 * L) ** 3);
      o.fpmin = Math.abs(pAvg - s) <= 1e-14 * Math.max(pAvg, s) ? 0 : pAvg - s; o.fpmax = pAvg + s;   // Excel ให้ 0 เมื่อลบกันเหลือเศษทศนิยมหลักที่ 15
      o.W20 = o.fpmax * ((Lc - o.y) - o.x) / (Lc - o.y);
      o.fpe = o.fpmin >= 0 ? o.fpmin + ((o.fpmax - o.fpmin) * ((Lc + d / 10) / (2 * Lc))) : o.W20;
      chk('fpmin', 'แรงแบกทานต่ำสุด ≤ Fp', o.fpmin <= o.Fp, o.fpmin, o.Fp, 'ksc');
      chk('fpe', 'แรงแบกทานที่ขอบเสา ≤ Fp', o.fpe <= o.Fp, o.fpe, o.Fp, 'ksc');
      chk('fpmax', 'แรงแบกทานสูงสุด ≤ Fp', o.fpmax <= o.Fp, o.fpmax, o.Fp, 'ksc');
      o.Me = o.fpmin < 0 ? (Bc * o.x ** 2 * (o.fpe + o.Fp)) / (4 * 100) : (Bc * o.x ** 2 * (o.fpe + o.fpmax)) / (4 * 100);
      o.treq = Math.sqrt((600 * o.Me) / (0.1 * B * o.Fb));
      o.tension = o.fpmin < 0;
      o.F = o.fpmin >= 0 ? 0.1 * P : M * 100 / (Lc - 2 * o.y);
    }
    chk('t', 'ความหนาเพลท ≥ ที่ต้องการ', +p.t >= o.treq, +p.t, o.treq, 'ซม.');
    o.Areq = noM ? o.F / o.Fv : o.F / o.Ft;   // ตามชีต: มีโมเมนต์ใช้ Ft เสมอ (แม้สลักรับแรงเฉือน)
    const Ab = Math.PI * ((+p.dBolt / 10) ** 2) / 4;
    o.nb = Math.max(Math.trunc(o.Areq / Ab) + 1, 2);   // TRUNC + 1 ตามชีต (ต่อด้าน)
    o.La = Math.trunc((o.Ft * (+p.dBolt / 10)) / (4 * 11)) + 1;
    o.weld = 3;
    o.ok = o.checks.every(c => c.ok);
    return o;
  }
  /** ออกแบบ: ขยายเพลทจากขนาดเสา + 2×(ระยะสลัก + 25 มม.) ทีละ 25 มม. จนแรงแบกทานผ่าน → เลือกความหนามาตรฐาน → สลักขนาดเล็กสุดที่ไม่เกิน 3 ตัวต่อด้าน
   *  p.maxB / p.maxL = ขนาดหัวเสา คสล. (มม.) — เพลทต้องไม่ยื่นเกิน (เพิ่มจากชีต Neo) */
  function basePlateDesign(p) {
    const edge = +p.edge || 25, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
    let B = r25(Math.max(+p.B || 0, +p.wide + 2 * (edge + 25))), L = r25(Math.max(+p.L || 0, +p.depth + 2 * (edge + 25)));
    let r = null;
    for (let i = 0; i < 40; i++) {
      r = basePlate(Object.assign({}, p, { B, L, edge, t: 99, dBolt: 16 }));
      if (r.checks.filter(c => ['B', 'L', 'fp', 'fpmin', 'fpe', 'fpmax', 'edge'].includes(c.code)).every(c => c.ok)) break;
      B += 25; L += 25;
    }
    const tmm = PLATES.find(t => t / 10 >= r.treq - 1e-9) || PLATES[PLATES.length - 1];
    let best = null;
    for (const db of BOLTS) { const x = basePlate(Object.assign({}, p, { B, L, edge, t: tmm / 10, dBolt: db })); best = { r: x, dBolt: db }; if (x.nb <= 3) break; }
    const out = { B, L, t: tmm, edge, dBolt: best.dBolt, nb: best.r.nb, La: best.r.La, r: best.r, ok: best.r.ok };
    if (!out.ok) out.error = 'จัดเพลทไม่ผ่าน — ตรวจแรงหรือขนาดเสา';
    if ((+p.maxB && B > +p.maxB) || (+p.maxL && L > +p.maxL)) { out.ok = false; out.error = `เพลท ${B}×${L} มม. ใหญ่กว่าหัวเสา คสล. ${p.maxB}×${p.maxL} มม. — ขยายหัวเสาหรือลดระยะสลัก`; }
    return out;
  }
  return { TYPES, PLATES, BOLTS, basePlate, basePlateDesign };
});
