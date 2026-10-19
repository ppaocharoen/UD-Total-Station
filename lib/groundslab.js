/*! groundslab.js — พื้นวางบนดิน (Westergaard) และตะแกรงเหล็กสำเร็จรูปแทนเหล็กเสริม
 * ที่มา (อ่านสูตรอย่างเดียว ไม่ปลดล็อกไฟล์):
 *  - มีรถ: Neo RC v5 Plus2003 ชีต "Ground Slab(SG)"  (น้ำหนักเพลา W ตัน, ลมยาง psi)
 *  - ไม่มีรถ: NeoRCDesignv5 ชีต "Ground Slab(SG)"   (น้ำหนักจร LL กก./ตร.ม., P = LL/0.2, รัศมีสัมผัส 12 ซม.)
 *  - ตะแกรง: ชีต "Mesh" (As1 = As2·Fs2/Fs1, Fs1 = 0.5·Fy ลวด)
 * excel:true = ตรงชีตทุกเซลล์ (ใช้ทดสอบ) · ค่าปกติ = ฉบับแก้ที่ตกลงกับผู้ใช้ (ดู NOTES)
 * หน่วย: S, L ม. · t ซม. · แรง กก. · หน่วยแรง ksc
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GroundSlab = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SOIL = { 1: ['ทรายบดอัดแน่น', 5.548], 2: ['กรวดบดอัดแน่น', 6.935], 3: ['ดินเหนียว', 1.942], 4: ['ดินทราย/ตะกอน + ดินเหนียว', 2.774] };
  const PI7 = 22 / 7, LOG = Math.log10, trunc = Math.trunc;
  const rhoTemp = fy => fy <= 2400 ? 0.0025 : fy <= 3000 ? 0.002 : 0.0018;
  const JOINT_MAX = (0.5 / (0.000017 * 35)) / 100;   // ระยะรอยต่อสูงสุด 8.40 ม. (ตามชีต)
  /** จำนวนเส้น/ม. และระยะสูงสุด (สูตร I19/J19 ของชีต) */
  function spacingOf(As, dmm) {
    const Ab = PI7 * (dmm / 10) ** 2 / 4, H = As / Ab, I = H <= 4 ? 4 : trunc(H) + 1, q = 100 / I;
    const s = (q < 0.25 && q - trunc(q) / 100 >= 0.005) ? trunc(q) / 100 + 0.005 : trunc(q) / 100;
    return { Ab, need: H, barsPerM: I, sMax: s };
  }
  /**
   * p: {mode 'vehicle'|'ll', S, L (ม.), t (ซม.), soil 1–4, W (ตัน/เพลา), psi, LL (กก./ตร.ม.), fcp, fs (ของเหล็กที่ใช้), fy, dia (มม.), excel}
   */
  function check(p) {
    const X = !!p.excel, t = +p.t, fcp = +p.fcp, k = SOIL[+p.soil || 1][1], fs = +p.fs || 1200, S = +p.S, L = +p.L;
    const o = { input: p, k, soilName: SOIL[+p.soil || 1][0], checks: [] }, chk = (code, label, ok, val, lim, unit = '') => o.checks.push({ code, label, ok: !!ok, val, lim, unit });
    o.l = (((4270 * ((2.323) ** 1.5) * (fcp ** 0.5) * (t ** 3))) / (12 * k * (1 - (0.15 ** 2)))) ** (1 / 4);
    o.fa = 0.13 * fcp;
    o.over = S >= JOINT_MAX || L >= JOINT_MAX;
    chk('joint', `ระยะรอยต่อพื้น ≤ ${JOINT_MAX.toFixed(2)} ม.`, !o.over, Math.max(S, L), JOINT_MAX, 'ม.');
    if (p.mode === 'vehicle') {
      const W = +p.W, psi = +p.psi || 25;
      o.P = X ? 0.4 * W * 2.2046 * 1000 : 0.4 * W * 1000;                       // แรงล้อ (ชีต: ปอนด์)
      o.a = X ? Math.sqrt((W * 1000 * 2.2046) / (psi * PI7)) * 2.54 : Math.sqrt((o.P * 2.2046) / (psi * PI7)) * 2.54;   // รัศมีหน้าสัมผัสล้อ ซม.
      o.b = o.a < (1.725 * t) ? (((1.6 * o.a ** 2) + t ** 2) ** 0.5) - (0.675 * t) : o.a;
      o.treq = X ? ((3 * (W / 0.2) / (0.13 * fcp)) * (1 - (12 * (2 ** 0.5) / o.l) ** 0.6)) ** 0.5
        : ((3 * o.P / (0.13 * fcp)) * (1 - (o.a * (2 ** 0.5) / o.l) ** 0.6)) ** 0.5;
      o.si = (0.316 * o.P / (t ** 2)) * (4 * LOG(o.l / o.b) + 1.069);
      o.se = (0.572 * o.P / (t ** 2)) * (4 * LOG(o.l / o.b) + 0.359);
      o.sc = (3 * o.P / (t ** 2)) * (1 - (o.a * (2 ** 0.5) / o.l) ** 0.6);
      o.smax = Math.max(o.si, o.se, o.sc);
      o.tmin = (W / 35) < 8 ? 8 : W / 35;
      chk('t', 'ความหนา ≥ ที่ต้องการ (มุมแผ่น)', o.treq < t, o.treq, t, 'ซม.');
      chk('si', "หน่วยแรงดึงกลางแผ่น ≤ 0.13 f'c", o.si <= o.fa, o.si, o.fa, 'ksc');
      chk('se', "หน่วยแรงดึงขอบแผ่น ≤ 0.13 f'c", o.se <= o.fa, o.se, o.fa, 'ksc');
      chk('sc', "หน่วยแรงดึงมุมแผ่น ≤ 0.13 f'c", o.sc <= o.fa, o.sc, o.fa, 'ksc');
      const fsU = fs > 1200 ? fs : 1200;
      const drag = (span, two) => (24 * t * span * 1.5) / ((two ? 2 : 1) * fsU);
      o.rhoMin = X ? 0.0055 : rhoTemp(+p.fy || 2400);
      o.AsS = Math.max((o.rhoMin) * 100 * t, drag(S, true)); o.AsL = Math.max(o.rhoMin * 100 * t, drag(L, true)); o.Ast = Math.max(o.rhoMin * 100 * t, drag(S, false));
    } else {
      const LL = +p.LL;
      o.P = LL / 0.2; o.a = 12;
      const g = LOG(t ** 3) - 4 * LOG((1.6 * (12 ** 2) + t ** 2) ** 0.5 - 0.675 * t) - LOG(k);
      o.treq = ((3 * (LL / 0.2) / (0.13 * fcp)) * (1 - (12 * (2 ** 0.5) / o.l) ** 0.6)) ** 0.5;
      o.si = (0.316 * (LL / 0.2) / (t ** 2)) * (g + 6.48);
      const se = (0.572 * (LL / 0.2) / (t ** 2)) * (g + 5.77);
      o.se = X ? trunc(se) : se;
      o.smax = Math.max(o.si, o.se);
      o.tmin = (LL / 35) < 8 ? 8 : LL / 35;
      const fa2 = X ? Math.round(0.13 * fcp * 100) / 100 : o.fa;
      chk('t', 'ความหนา ≥ ที่ต้องการ (มุมแผ่น)', o.treq < t, o.treq, t, 'ซม.');
      chk('si', "หน่วยแรงดึงกลางแผ่น ≤ 0.13 f'c", o.si <= o.fa, o.si, o.fa, 'ksc');
      chk('se', "หน่วยแรงดึงขอบแผ่น ≤ 0.13 f'c", o.se <= fa2, o.se, fa2, 'ksc');
      const fsU = X ? 1200 : fs;
      o.rhoMin = X ? 0 : rhoTemp(+p.fy || 2400);
      o.AsS = Math.max(o.rhoMin * 100 * t, (24 * t * S * 1.5) / (2 * fsU)); o.AsL = Math.max(o.rhoMin * 100 * t, (24 * t * L * 1.5) / (2 * fsU));
    }
    o.As = Math.max(o.AsS, o.AsL);
    if (p.dia) Object.assign(o, spacingOf(o.As, +p.dia));
    o.ok = o.checks.every(c => c.ok);
    return o;
  }
  /** ออกแบบ: เลือกเหล็กขนาดเล็กสุดที่ได้ระยะ ≥ 0.15 (หรือ ≥ 0.10) ม. ปัดลงทีละ 0.025 ไม่เกินระยะสูงสุดตามชีต · ความหนาที่ต้องการ (เพิ่มทีละ 1 ซม.) */
  function design(p, dias) {
    const r = check(p), ds = (dias && dias.length ? dias : [6, 9, 12]).slice().sort((a, b) => a - b);
    const fl = x => Math.floor(x / 0.025 + 1e-9) * 0.025;
    let pick = null;
    for (const lim of [0.15, 0.1]) {
      for (const d of ds) { const sp = spacingOf(r.As, d), s = +fl(Math.min(sp.sMax, sp.Ab / r.As)).toFixed(3); if (s >= lim - 1e-9) { pick = { d, s }; break; } }
      if (pick) break;
    }
    if (!pick) { const d = ds[ds.length - 1], sp = spacingOf(r.As, d); pick = { d, s: Math.max(0.05, +fl(Math.min(sp.sMax, sp.Ab / r.As)).toFixed(3)) }; }
    let tReq = +p.t;
    if (!r.checks.filter(c => c.code !== 'joint').every(c => c.ok)) for (let i = 0; i < 40; i++) { tReq += 1; const z = check(Object.assign({}, p, { t: tReq })); if (z.checks.filter(c => c.code !== 'joint').every(c => c.ok)) break; }
    const out = { r, ok: r.ok, d: pick.d, s: pick.s, tReq };
    if (!r.ok) out.error = r.over ? `แผ่นยาวเกิน ${JOINT_MAX.toFixed(2)} ม. — แบ่งรอยต่อ` + (tReq > +p.t ? ` · หนาอย่างน้อย ${tReq} ซม.` : '') : `ความหนาไม่พอ — ใช้อย่างน้อย ${tReq} ซม.`;
    return out;
  }
  const WIRE = [4, 5, 6, 7, 8, 9];
  /** ตะแกรงสำเร็จรูปแทนเหล็ก (ชีต Mesh): As2 = ROUND(Ab/s,2) · As1 = ROUND(As2·Fs2/Fs1,2) · ระยะสูงสุดของลวด Ø = ROUND(100/(As1/Aw),0)/100 */
  function mesh(dmm, s, fs2, opt = {}) {
    const fy1 = +opt.fy1 || 5500, fs1 = fy1 * 0.5;
    const As2 = Math.round((1 / s) * (Math.PI * (dmm / 10) ** 2 / 4) * 100) / 100, As1 = Math.round(As2 * fs2 / fs1 * 100) / 100;
    const sMaxOf = w => Math.round(100 / (As1 / (Math.PI * (w / 10) ** 2 / 4))) / 100;
    const o = { As2, As1, fs1, fs2, fy1 };
    for (const w of (opt.wires || WIRE)) {
      const smax = sMaxOf(w), sp = [0.2, 0.15, 0.1].find(x => x <= smax + 1e-9);
      if (sp) return Object.assign(o, { w, s: sp, smax, ok: true, name: `Ø${w} มม. @${sp.toFixed(2)} ม.` });
    }
    return Object.assign(o, { ok: false, error: 'ลวดตะแกรงขนาดที่มีไม่พอ — ใช้เหล็กเสริม' });
  }
  const NOTES = [
    'มีรถ: ใช้หน่วย กก.–ซม. ทั้งสูตร (ชีตใส่แรงล้อเป็นปอนด์ หน่วยแรงสูงเกินจริง 2.2 เท่า) และรัศมีหน้าสัมผัสล้อใช้แรงล้อ 0.4W · ความหนาที่ต้องการที่มุมแผ่นใช้แรงล้อและรัศมีจริง (ชีตใช้ W/0.2 กับ a = 12 ซม.)',
    'เหล็กยืดหดขั้นต่ำใช้เกณฑ์เดียวกับพื้น (SR24 0.0025 · SD30 0.002 · SD40 0.0018) คู่กับสูตรแรงเสียดทานดิน (ชีตมีรถใช้ 0.55%, ชีตไม่มีรถไม่มีขั้นต่ำ) และใช้ fs ของเหล็กที่เลือก',
    'ไม่มีรถ: ไม่ปัดหน่วยแรงขอบแผ่นลง (ชีตใช้ TRUNC)',
    'ตะแกรงสำเร็จรูป: Fs2 ใช้ fs ของเหล็กที่ถูกแทน (ชีตใช้ RB 1,200 / DB 1,500)'
  ];
  return { SOIL, JOINT_MAX, check, design, mesh, spacingOf, WIRE, NOTES };
});
