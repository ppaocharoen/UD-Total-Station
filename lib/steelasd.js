/*! steelasd.js — ตรวจ/ออกแบบเหล็กรูปพรรณ วิธีหน่วยแรงใช้งาน (ASD แบบ AISC 1989)
 * ที่มา: NeoSteelDesignv5 ชีต Tension / Compression / Flexible / Purlin / BColumn (อ่านสูตรอย่างเดียว ไม่ปลดล็อกไฟล์)
 *   + RC_Design_WSD_Fixed_iterative_calc_UDfix ชีตหลังคา (ตารางหน้าตัด → lib/steelsec.js)
 * ตกลงกับ Earth 28 พ.ย. 2569:
 *   - แรงอัด+ดัด ใช้ AISC 89 H1 เต็ม (H1-1/H1-2 · H1-3 เมื่อ fa/Fa ≤ 0.15) กับทุกชิ้นที่มี P และ M · แรงดึง+ดัด ใช้ H2
 *     (Neo BColumn ใช้ MOD(อัตราส่วน,2) และไม่มีตัวขยาย — ไม่พอร์ตส่วนนั้น)
 *   - การโก่งเฉพาะที่ของผนังบาง: เตือนเมื่อเกินพิกัด b/t (AISC 89 B5) ไม่ลดค่าหน่วยแรง
 *   - LTB ของ C: F1-6/7 ด้วย rT และ F1-8 เอาค่ามาก ≤ 0.6Fy · ท่อกล่อง/2C ประกบ/ท่อกลม ไม่มี LTB
 * หน่วย: แรง กก. · โมเมนต์ กก.-ม. · ความยาวชิ้น ม. · หน่วยแรง กก./ตร.ซม. (ksc) · หน้าตัด ซม. (ดู steelsec.js)
 * สูตร AISC ที่เขียนเป็น ksi แปลงด้วย Fy(ksi) = Fy(ksc)/70.307 และค่าคงที่ที่ Neo แปลงไว้ (เช่น 717×10⁴, 11.95×10⁶)
 */
(function (root, factory) {
  const Sec = (typeof module === 'object' && module.exports) ? require('./steelsec.js') : root.SteelSec;
  const api = factory(Sec);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SteelASD = api;
})(typeof self !== 'undefined' ? self : this, function (Sec) {
  'use strict';
  const KSI = 70.307;              // ksc ต่อ ksi
  const E0 = 2100000;             // ksc — Neo และ RC_Design ใช้ 2,100,000
  const GRADES = { 'Fe-24': { Fy: 2400, Fu: 4100 }, 'Fe-30': { Fy: 3000, Fu: 5000 }, 'SS400': { Fy: 2450, Fu: 4100 }, 'SM520': { Fy: 3550, Fu: 5200 } };
  const r4 = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1e4) / 1e4 : v;

  /** วัสดุ: ชื่อเกรด หรือ {Fy, Fu, E} → {grade, Fy, Fu, E} (Neo: Fu = 5000 ถ้า Fy > 2400 ไม่งั้น 4100) */
  function material(m) {
    if (!m) m = 'Fe-24';
    if (typeof m === 'string') { const g = GRADES[m] || GRADES['Fe-24']; return { grade: GRADES[m] ? m : 'Fe-24', Fy: g.Fy, Fu: g.Fu, E: E0 }; }
    const Fy = m.Fy || 2400;
    return { grade: m.grade || (Fy > 2400 ? 'Fe-30' : 'Fe-24'), Fy, Fu: m.Fu || (Fy > 2400 ? 5000 : 4100), E: m.E || E0 };
  }

  // ---------------- แรงอัด (Neo ชีต Compression · AISC E2) ----------------
  /** Cc = √(2π²E/Fy) */
  const Cc = (Fy, E = E0) => Math.sqrt(2 * E * Math.PI ** 2 / Fy);
  /** Fa ตาม KL/r — ช่วงไม่ยืดหยุ่น E2-1 / ยืดหยุ่น E2-2 (สูตรเดียวกับ Neo I21/I23) */
  function Fa(klr, Fy, E = E0) {
    const cc = Cc(Fy, E);
    if (klr <= cc) { const q = klr / cc; return Fy * (1 - 0.5 * q * q) / (5 / 3 + 0.375 * q - 0.125 * q ** 3); }
    return 12 * Math.PI ** 2 * E / (23 * klr * klr);
  }
  /** F′e = 12π²E / (23 (KL/r)²) */
  const Fe_ = (klr, E = E0) => 12 * Math.PI ** 2 * E / (23 * klr * klr);

  // ---------------- แรงดัด (Neo ชีต Flexible · AISC F1) ----------------
  /** Cb จากโมเมนต์ปลาย (Neo X/Y): M1 ≤ M2 ปลายเล็ก/ใหญ่ · Mmid กลางช่วง — ถ้ากลางช่วงมากกว่าปลาย Cb = 1
   * M1/M2 บวก = ดัดโค้งกลับ (reverse curvature) ตาม AISC · Neo ใส่เครื่องหมายเป็น −M1/M2 เมื่อ M1 < M2 */
  function Cb(M1, M2, Mmid) {
    const a1 = Math.abs(M1 || 0), a2 = Math.abs(M2 || 0);
    if (Math.max(a1, a2) < Math.abs(Mmid || 0) || Math.max(a1, a2) === 0) return 1;
    const lo = a1 <= a2 ? M1 : M2, hi = a1 <= a2 ? M2 : M1;
    const ratio = (lo * hi >= 0 ? -1 : 1) * Math.min(a1, a2) / Math.max(a1, a2);   // ดัดทางเดียว = ลบ
    return Math.min(2.3, 1.75 + 1.05 * ratio + 0.3 * ratio * ratio);
  }
  /** Cb แบบ Neo (ป้อน M1, M2 ตามชีต): X = −M1/M2 ถ้า M1 < M2 ไม่งั้น 1 */
  function CbNeo(M1, Mmid, M2) {
    const X = M1 < M2 ? -M1 / M2 : 1;
    return Math.max(M1, M2) < Mmid ? 1 : Math.min(2.3, 1.75 + 1.05 * X + 0.3 * X * X);
  }
  /** F1-6/F1-7 ด้วย L/rT (Neo AJ) */
  function FbLTB(LrT, cb, Fy) {
    const lo = Math.sqrt(717e4 * cb / Fy), hi = Math.sqrt(3585e4 * cb / Fy);
    if (LrT <= lo) return 0.6 * Fy;
    if (LrT >= hi) return Math.min(0.6 * Fy, cb * 11950000 / (LrT * LrT));
    return Math.min(0.6 * Fy, Fy * (2 / 3 - Fy * LrT * LrT / (107560000 * cb)));
  }
  /** F1-8: 12000 Cb / (L d/Af) ksi → 843,684 Cb/(L·d/Af) ksc (L, d ซม. · Af ซม.²) */
  const FbF18 = (Lcm, d, Af, cb, Fy) => Math.min(0.6 * Fy, 12000 * KSI * cb / (Lcm * d / Af));
  /** ปีก I/WF/รางน้ำ: compact / กึ่ง / ไม่ compact ตาม bf/2tf (ค่าคงที่ตาม Neo: 437.7/√Fy, 796.5/√Fy, 0.733−0.000167·x·√Fy) */
  function FbFlangeNeo(bf2tf, Fy) {
    if (bf2tf <= 437.7 / Math.sqrt(Fy)) return 0.66 * Fy;
    if (bf2tf >= 796.5 / Math.sqrt(Fy)) return 0.6 * Fy;
    return Fy * (0.733 - 0.000167 * bf2tf * Math.sqrt(Fy));
  }
  /** Lc = 637.2·bf/√Fy (ม.) · Lu = 1,406,000/((d/Af)·Fy) (ม.) — Neo Z/AA (bf, d ซม.) */
  const LcNeo = (bfcm, Fy) => bfcm * 637.2 / Math.sqrt(Fy) / 100;
  const LuNeo = (dcm, Af, Fy) => 1406000 / ((dcm / Af) * Fy) / 100;

  /** หน่วยแรงดัดที่ยอมให้ แกนแข็ง x — s: หน้าตัดจาก steelsec · o: {Lb ม., cb, M1M2} → {Fb, how} */
  function FbX(s, mat, o = {}) {
    const Fy = mat.Fy, fyk = Fy / KSI, Lb = (o.Lb || 0) * 100, cb = o.cb || 1;
    if (s.fam === 'BOX' || s.fam === 'C2') {
      const b = s.fam === 'C2' ? (s.bf - 3 * s.tf) : (s.B / 10 - 3 * s.tf), h = s.d - 3 * s.tw;
      const compact = b / s.tf <= 190 / Math.sqrt(fyk) && h / s.tw <= 640 / Math.sqrt(fyk) && s.d / s.bf <= 6;
      const Lc = Math.max((1950 + 1200 * (o.M1M2 || 0)) * s.bf / fyk, 1200 * s.bf / fyk);
      if (compact && Lb <= Lc) return { Fb: 0.66 * Fy, how: 'ท่อกล่อง compact (F3-1) 0.66Fy' };
      return { Fb: 0.6 * Fy, how: compact ? 'ท่อกล่อง Lb > Lc → 0.6Fy' : 'ท่อกล่อง ไม่ compact (F3-3) 0.6Fy' };
    }
    if (s.fam === 'PIPE') {
      const Dt = s.H / s.t;
      return Dt <= 3300 / fyk ? { Fb: 0.66 * Fy, how: 'ท่อกลม compact 0.66Fy' } : { Fb: 0.6 * Fy, how: 'ท่อกลม 0.6Fy' };
    }
    if (s.fam === 'L') return { Fb: 0.6 * Fy, how: 'เหล็กฉาก 0.6Fy (ไม่ตรวจแกนหลัก u-v)' };
    // I / WF / รางน้ำ / C-Lip
    const rT = s.rT || s.ry;
    const f18 = FbF18(Math.max(Lb, 1e-9), s.d, s.Af, cb, Fy);
    const f167 = FbLTB(Lb / rT, cb, Fy);
    const fltb = Math.max(f167, f18);
    if (s.fam === 'CL') {
      return { Fb: Math.min(0.6 * Fy, fltb), how: fltb >= 0.6 * Fy ? 'C-Lip 0.6Fy (Lb สั้น)' : `C-Lip LTB Lb=${r4(Lb / 100)} ม. L/rT=${r4(Lb / rT)} Cb=${r4(cb)} → max(F1-6/7, F1-8)` };
    }
    const Lc = LcNeo(s.bf, Fy) * 100, Lu = LuNeo(s.d, s.Af, Fy) * 100;
    if (Lb <= Math.min(Lc, Lu)) {
      const f = FbFlangeNeo(s.bf / (2 * s.tf), Fy);
      return { Fb: f, how: `Lb ≤ Lc,Lu → ${f >= 0.66 * Fy - 1e-9 ? 'compact 0.66Fy' : f <= 0.6 * Fy + 1e-9 ? 'ไม่ compact 0.6Fy' : 'กึ่ง compact (F1-3)'}` };
    }
    return { Fb: Math.min(0.6 * Fy, fltb), how: `LTB Lb=${r4(Lb / 100)} ม. → max(F1-6/7=${r4(f167)}, F1-8=${r4(f18)})` };
  }
  /** แกนอ่อน y (AISC F2) */
  function FbY(s, mat) {
    const Fy = mat.Fy, fyk = Fy / KSI;
    if (s.fam === 'WF' || s.fam === 'I') {
      const x = s.bf / (2 * s.tf), lo = 65 / Math.sqrt(fyk), hi = 95 / Math.sqrt(fyk);
      if (x <= lo) return { Fb: 0.75 * Fy, how: 'แกนอ่อน compact 0.75Fy (F2-1)' };
      if (x >= hi) return { Fb: 0.6 * Fy, how: 'แกนอ่อน 0.6Fy' };
      return { Fb: Fy * (1.075 - 0.005 * x * Math.sqrt(fyk)), how: 'แกนอ่อน กึ่ง compact (F2-3)' };
    }
    if (s.fam === 'BOX' || s.fam === 'C2' || s.fam === 'PIPE') return FbX(s, mat, {});
    return { Fb: 0.6 * Fy, how: 'แกนอ่อน 0.6Fy' };
  }

  // ---------------- แรงเฉือน ----------------
  /** พื้นที่รับแรงเฉือน ซม.² — แกนแข็ง (V2 ขนานเอว) ตาม Neo: (d − 2tf)·tw × จำนวนเอว · แกนอ่อน: ปีก */
  function shearAreas(s) {
    if (s.fam === 'PIPE') return { Av: s.A / 2, Avy: s.A / 2 };
    const Av = Math.max(s.webs, 1) * (s.d - 2 * s.tf) * s.tw;
    const Avy = (s.fam === 'BOX' || s.fam === 'C2') ? 2 * (s.bf - 2 * s.tw) * s.tf : (s.fam === 'L' ? s.bf * s.tf : 2 * s.bf * s.tf);
    return { Av, Avy };
  }

  // ---------------- การโก่งเฉพาะที่ (AISC 89 ตาราง B5.1) — เตือนอย่างเดียว ----------------
  function localWarn(s, mat, use = {}) {
    const fyk = mat.Fy / KSI, W = [], q = Math.sqrt(fyk);
    const chk = (name, ratio, lim, what) => { if (ratio > lim) W.push(`${name} ${r4(ratio)} > ${r4(lim)} (${what})`); };
    if (s.fam === 'BOX' || s.fam === 'C2') {
      const b = (s.fam === 'C2' ? s.bf : s.B / 10) - 3 * s.tf, h = s.d - 3 * s.tw;
      chk('b/t ปีก', b / s.tf, 238 / q, 'ปีกกล่องรับแรงอัด B5.1: 238/√Fy');
      if (use.comp) chk('h/t ผนัง', h / s.tw, 253 / q, 'ผนังรับแรงอัด 253/√Fy');
      else if (use.bend) chk('h/t ผนัง', h / s.tw, 760 / Math.sqrt(0.6 * fyk), 'เอวรับดัด 760/√Fb');
    } else if (s.fam === 'CL') {
      const t = s.t / 10, h = s.d - 2 * t, b = s.B / 10 - 2 * t, c = s.C / 10 - t;
      chk('b/t ปีก', b / t, 238 / q, 'ปีกมีขอบพับถือเป็นแผ่นมีขอบยึด 238/√Fy');
      if (s.C > s.t) chk('d/t ขอบพับ', c / t, 95 / q, 'ขอบพับ = แผ่นไม่มีขอบยึด 95/√Fy');
      if (use.comp) chk('h/t เอว', h / t, 253 / q, 'เอวรับแรงอัด 253/√Fy');
      else if (use.bend) chk('h/t เอว', h / t, 760 / Math.sqrt(0.6 * fyk), 'เอวรับดัด 760/√Fb');
    } else if (s.fam === 'WF' || s.fam === 'I' || s.fam === 'CH') {
      chk('bf/2tf', s.fam === 'CH' ? s.bf / s.tf : s.bf / (2 * s.tf), 95 / q, 'ปีกยื่น 95/√Fy');
      if (use.comp) chk('h/tw เอว', s.hw / s.tw, 253 / q, 'เอวรับแรงอัด 253/√Fy');
    } else if (s.fam === 'PIPE') chk('D/t', s.H / s.t, 3300 / fyk, 'ท่อกลม 3300/Fy');
    else if (s.fam === 'L') chk('b/t ขาฉาก', Math.max(s.H, s.B) / s.t, 76 / q, 'ฉากเดี่ยวรับแรงอัด 76/√Fy');
    if (s.fam === 'CL' && use.comp) W.push('C-Lip รับแรงอัด: ไม่ได้ตรวจการโก่งเดาะแบบบิด-ดัด (flexural-torsional) — หน้าตัดสมมาตรแกนเดียว');
    return W;
  }

  /**
   * ตรวจชิ้นส่วนเหล็กรับแรงชุดเดียว
   * @param sec ชื่อหน้าตัด หรือ object จาก SteelSec.props
   * @param f   {P (+ดึง −อัด) กก., Mx, My กก.-ม. (ค่ามากสุดในชิ้น), V2 (ขนานเอว), V3 กก.,
   *             M1x, M2x, Mmid (โมเมนต์ภายในที่ปลายและกลางช่วง ตามเครื่องหมายแผนภาพ — ใช้หา Cb)}
   * @param o   {mat, Lx, Ly ม. (ความยาวโก่งเดาะ), Kx, Ky, Lb ม. (ระยะค้ำปีกรับแรงอัด), cb, Cmx, Cmy,
   *             slendComp 200, slendTen 240, U (ตัวคูณพื้นที่สุทธิประสิทธิผล, Neo เชื่อม = 1)}
   * @returns {ok, ratio, govern, ...รายละเอียด, warn[]}
   */
  function check(sec, f, o = {}) {
    const s = typeof sec === 'string' ? Sec.props(sec) : sec;
    if (!s) return { ok: false, ratio: Infinity, govern: 'ไม่รู้จักหน้าตัด', warn: [`อ่านหน้าตัด "${sec}" ไม่ได้`] };
    const mat = material(o.mat), Fy = mat.Fy, E = mat.E;
    const P = f.P || 0, Mx = Math.abs(f.Mx || 0), My = Math.abs(f.My || 0);
    const Kx = o.Kx || 1, Ky = o.Ky || 1, Lx = o.Lx || 0, Ly = o.Ly != null ? o.Ly : Lx;
    const rx = s.rx, ry = s.ry;
    const klrx = Kx * Lx * 100 / rx, klry = Ky * Ly * 100 / ry;
    let klr = Math.max(klrx, klry);
    if (s.fam === 'L' && s.rv) klr = Math.max(Kx * Lx, Ky * Ly) * 100 / s.rv;   // ฉากเดี่ยว: แกน v
    const out = { sec: s.name, fam: s.fam, src: s.src, Fy, A: r4(s.A), warn: [] };
    if (s.tableNote) out.warn.push(s.tableNote);
    const ratios = {};
    const fbx = Mx * 100 / s.Sx, fby = My * 100 / s.Sy;
    const cb = o.cb || (f.M1x != null || f.M2x != null ? Cb(f.M1x, f.M2x, f.Mmid != null ? f.Mmid : 0) : 1);
    const FBX = FbX(s, mat, { Lb: o.Lb != null ? o.Lb : Lx, cb, M1M2: o.M1M2 }), FBY = FbY(s, mat);
    Object.assign(out, { fbx: r4(fbx), Fbx: r4(FBX.Fb), fby: r4(fby), Fby: r4(FBY.Fb), Cb: r4(cb), FbxHow: FBX.how, FbyHow: FBY.how });
    if (P < 0) {      // แรงอัด
      const fa = -P / s.A, FA = Fa(klr, Fy, E);
      Object.assign(out, { fa: r4(fa), Fa: r4(FA), KLr: r4(klr), Cc: r4(Cc(Fy, E)) });
      const lim = o.slendComp || 200;
      ratios.slender = klr / lim;
      if (klr > lim) out.warn.push(`KL/r = ${r4(klr)} > ${lim}`);
      const a = fa / FA;
      if (Mx === 0 && My === 0) { ratios.axial = a; out.eq = 'fa/Fa'; }
      else if (a <= 0.15) { ratios.comb = a + fbx / FBX.Fb + fby / FBY.Fb; out.eq = 'H1-3'; }
      else {
        const Cmx = o.Cmx || 0.85, Cmy = o.Cmy || 0.85;
        const fex = Fe_(klrx || 1e-9, E), fey = Fe_(klry || 1e-9, E);
        const ampx = 1 - fa / fex, ampy = 1 - fa / fey;
        if (ampx <= 0 || ampy <= 0) { ratios.comb = Infinity; out.warn.push('fa ≥ F′e — ชิ้นส่วนไม่เสถียร'); }
        else {
          const h11 = a + Cmx * fbx / (ampx * FBX.Fb) + Cmy * fby / (ampy * FBY.Fb);
          const h12 = fa / (0.6 * Fy) + fbx / FBX.Fb + fby / FBY.Fb;
          ratios.comb = Math.max(h11, h12);
          Object.assign(out, { H1_1: r4(h11), H1_2: r4(h12), Cmx, Cmy, Fex: r4(fex), Fey: r4(fey) });
        }
        out.eq = 'H1-1/H1-2';
      }
    } else if (P > 0) {   // แรงดึง (Neo Tension: 0.6Fy·Ag และ 0.5Fu·Ae)
      const U = o.U || 1, Ae = U * s.A;
      const Pt = Math.min(0.6 * Fy * s.A, 0.5 * mat.Fu * Ae), ft = P / s.A, Ft = Pt / s.A;
      Object.assign(out, { ft: r4(ft), Ft: r4(Ft), Pt: r4(Pt) });
      const lr = Math.max(Lx * 100 / rx, Ly * 100 / ry, s.fam === 'L' && s.rv ? Math.max(Lx, Ly) * 100 / s.rv : 0);
      const lim = o.slendTen || 240;
      out.Lr = r4(lr); ratios.slender = lr / lim;
      if (lr > lim) out.warn.push(`L/r = ${r4(lr)} > ${lim}`);
      if (Mx === 0 && My === 0) { ratios.axial = P / Pt; out.eq = 'P/Pt'; }
      else { ratios.comb = ft / Ft + fbx / FBX.Fb + fby / FBY.Fb; out.eq = 'H2-1'; }
    } else if (Mx || My) { ratios.bend = fbx / FBX.Fb + fby / FBY.Fb; out.eq = 'fbx/Fbx + fby/Fby'; }
    // แรงเฉือน
    const { Av, Avy } = shearAreas(s), Fv = 0.4 * Fy;
    const fv2 = Math.abs(f.V2 || 0) / Av, fv3 = Math.abs(f.V3 || 0) / Avy;
    out.fv = r4(Math.max(fv2, fv3)); out.Fv = r4(Fv);
    ratios.shear = Math.max(fv2, fv3) / Fv;
    if (s.webs && s.hw / s.tw > 380 / Math.sqrt(Fy / KSI)) out.warn.push(`h/tw = ${r4(s.hw / s.tw)} > 380/√Fy — Fv ต้องลดตาม F4-2 (ใช้ 0.4Fy อยู่)`);
    out.warn.push(...localWarn(s, mat, { comp: P < 0, bend: Mx > 0 || My > 0 }));
    let govern = null, ratio = 0;
    const label = { axial: 'แรงตามแนวแกน', comb: 'แรงร่วม', bend: 'แรงดัด', shear: 'แรงเฉือน', slender: 'ความชะลูด' };
    for (const k in ratios) if (ratios[k] > ratio || govern === null) { ratio = ratios[k]; govern = k; }
    out.ratios = Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, r4(v)]));
    out.ratio = r4(ratio); out.govern = label[govern] || '-'; out.ok = ratio <= 1 + 1e-9;
    return out;
  }

  /** ตรวจหลายชุดแรง → {ok, ratio, combo, worst, rows} (เลือกชุดอัตราส่วนสูงสุด) */
  function checkAll(sec, list, o = {}) {
    let worst = null;
    const rows = list.map(x => { const r = check(sec, x, Object.assign({}, o, x.opt || {})); r.combo = x.combo; if (x.st != null) r.st = x.st; if (x.opt && x.opt.Lb != null) { r.Lb = x.opt.Lb; r.LbHow = x.opt.LbHow; } if (!worst || r.ratio > worst.ratio) worst = r; return r; });
    return { ok: !!worst && worst.ok, ratio: worst ? worst.ratio : 0, combo: worst && worst.combo, worst, rows };
  }

  /** หน้าตัดเบาสุดที่ผ่านในตระกูลเดิม (ตาราง) — opt.sameShape: เปลี่ยนแค่ความหนา */
  function suggest(sec, list, o = {}, opt = {}) {
    const s = typeof sec === 'string' ? Sec.props(sec) : sec;
    if (!s) return null;
    const fam = Sec.family(s.fam, opt.sameShape ? { sameShape: { H: s.H, B: s.B } } : {});
    for (const c of fam) { const r = checkAll(c, list, o); if (r.ok) return { name: c.name, w: r4(c.w), ratio: r.ratio, combo: r.combo }; }
    return null;
  }

  // ---------------- แป (Neo ชีต Purlin — แก้สูตรที่ผิด) ----------------
  /**
   * p: {L ม. ช่วงแป, s ม. ระยะห่างแป, slope องศา, roofDL, LL, WL กก./ตร.ม., sw กก./ม. (น้ำหนักแปที่สมมติ),
   *     sag 1 ไม่มี / 2 กลางช่วง / 3 ที่ L/3, sec, mat, defl 240, Lb ม. (ค่าเริ่มต้น = ช่วงระหว่าง sag rod)}
   * แก้จาก Neo: การโก่งตัวใช้ Ix คู่กับ wy (Neo ใช้ max(Ix,Iy)·max(wx,wy)) · แรงปฏิกิริยาวงเล็บถูก ·
   *   ตรวจน้ำหนักแปจริงเทียบที่สมมติ (Neo เทียบข้อความผิดจึงไม่เคยเตือน) · fb ใช้ Fbx/Fby (LTB) แยกแกน
   */
  function purlin(p) {
    const mat = material(p.mat), th = (p.slope || 0) * Math.PI / 180, L = p.L, sp = p.s;
    const Wt = ((p.roofDL || 0) + (p.LL || 0)) * sp + (p.sw || 0);
    const wn = th * 180 / Math.PI <= 18 ? 0 : 2 * (p.WL || 0) * Math.sin(th) / (1 + Math.sin(th) ** 2);   // Neo R27
    const wx = Wt * Math.sin(th);
    const wy = Math.max(0.75 * (Wt * Math.cos(th) + wn * sp), Wt * Math.cos(th));
    const sag = p.sag || 1, kMy = sag === 1 ? 0.125 : sag === 2 ? 0.03125 : 0.0114285714285714;
    const Mx = wy * L * L / 8, My = kMy * L * L * wx;
    const ls = sag === 1 ? L : sag === 2 ? L / 2 : L / 3;   // ช่วงแกนอ่อนระหว่าง sag rod
    const s = typeof p.sec === 'string' ? Sec.props(p.sec) : p.sec;
    const out = { Wt: r4(Wt), wx: r4(wx), wy: r4(wy), wn: r4(wn), Mx: r4(Mx), My: r4(My), SreqNeo: r4(100 * Math.max(Mx, My) / (0.6 * mat.Fy)) };
    out.Ry = r4((Wt + wn * sp * Math.cos(th)) * L / 2);
    out.sagRodDmin = sag === 1 ? null : r4(Math.max(4 * (100 * sp / 300) * 10, 15));   // มม. (Neo L28–N30)
    if (!s) return out;
    const n = p.defl || 240, E = mat.E;
    const dy = 5 * wy / 100 * (L * 100) ** 4 / (384 * E * s.Ix), dx = 5 * wx / 100 * (ls * 100) ** 4 / (384 * E * s.Iy);
    const lim = L * 100 / n, limx = ls * 100 / n;
    const FBX = FbX(s, mat, { Lb: p.Lb != null ? p.Lb : ls }), FBY = FbY(s, mat);
    const fbx = Mx * 100 / s.Sx, fby = My * 100 / s.Sy, rb = fbx / FBX.Fb + fby / FBY.Fb;
    Object.assign(out, { sec: s.name, fbx: r4(fbx), fby: r4(fby), Fbx: r4(FBX.Fb), Fby: r4(FBY.Fb), ratioBend: r4(rb),
      dy: r4(dy), dyAllow: r4(lim), dx: r4(dx), dxAllow: r4(limx), w: r4(s.w), warn: [] });
    if (s.w > (p.sw || 0) + 1e-9) out.warn.push(`น้ำหนักแปจริง ${r4(s.w)} > ที่สมมติ ${p.sw || 0} กก./ม. — เพิ่มน้ำหนักที่ใช้ออกแบบ`);
    out.warn.push(...localWarn(s, mat, { bend: true }));
    out.ok = rb <= 1 + 1e-9 && dy <= lim + 1e-9 && dx <= limx + 1e-9 && !(s.w > (p.sw || 0) + 1e-9);
    return out;
  }

  /** จุดที่ต่างจากต้นฉบับ (ตั้งใจ — ตกลงกับ Earth 28 พ.ย. 2569 หรือแก้สูตรผิด) */
  const NOTES = [
    'BColumn (Neo): ใช้ MOD(อัตราส่วน,2) — อัตราส่วน 2.3 กลายเป็น 0.3 แล้วขึ้นว่าผ่าน · ไม่มีตัวขยาย Cm/(1−fa/F′e) · ใช้ Fb = 0.6Fy · Sy อ่านจากเซลล์ตายตัว Table3!L75 → เว็บใช้ AISC 89 H1-1/H1-2/H1-3 กับทุกชิ้นที่มีแรงอัด+ดัด และ H2 กับแรงดึง+ดัด (Cm ค่าเริ่มต้น 0.85)',
    'Compression (Neo): KL/r ใช้ rmin คู่กับ max(Lx,Ly) → เว็บใช้ max(Kx·Lx/rx, Ky·Ly/ry) · KL/r > 200 Neo ให้ Fa = 0.001 → เว็บคำนวณ Fa ตามสูตรและไม่ผ่านด้วยความชะลูด',
    'Flexible (Neo): C-Lip และท่อกล่องใช้ Fb = 0.6Fy ตายตัว · รางน้ำเมื่อ Lb เกินใช้ 0.6Fy (ไม่ตรวจ LTB) · I/WF เมื่อ Lb เกินใช้แค่ F1-6/7 → เว็บใช้ max(F1-6/7 ด้วย rT, F1-8) ≤ 0.6Fy กับ I/WF/รางน้ำ/C-Lip · ท่อกล่อง compact 0.66Fy (F3-1)',
    'Flexible (Neo): ป้อน M1 = M2 ได้ Cb = 2.3 (ควรเป็น 1.0 เมื่อดัดทางเดียว) → เว็บใช้ Cb ตามเครื่องหมายแผนภาพโมเมนต์ (ทางเดียว = M1/M2 ลบ)',
    'Flexible (Neo): ตัวซ้อนคู่คูณ tf ด้วยจำนวนตัวในความลึกเอวตอนคิดแรงเฉือน → เว็บใช้ (d − 2tf)·tw × จำนวนเอวจริง',
    'Flexible (Neo): ขอบเขตปีก compact ใช้ค่าคงที่ AISC 1978 (437.7/√Fy, 796.5/√Fy) — เว็บคงตาม Neo · แกนอ่อน I/WF ใช้ AISC 89 F2 (0.75Fy compact)',
    'Purlin (Neo): การโก่งตัวใช้ max(Ix,Iy) กับ max(wx,wy) — ผิดเมื่อแปวางแบน/หลังคาชัน → เว็บใช้ Ix คู่ wy และ Iy คู่ wx (ช่วงระหว่าง sag rod)',
    'Purlin (Neo): แรงปฏิกิริยาเมื่อชันเกิน 18° วงเล็บผิด (Wt ไม่คูณ L/2) → เว็บ (Wt + wn·s·cosθ)·L/2',
    'Purlin (Neo): ตรวจน้ำหนักแปจริงเทียบที่สมมติไม่เคยทำงาน (เทียบข้อความ "cm. OK.!" ไม่ตรง) → เว็บเตือนเมื่อน้ำหนักจริงเกิน',
    'Purlin (Neo): fb = Mx/Sx + My/Sy ≤ 0.6Fy → เว็บ fbx/Fbx + fby/Fby (Fbx คิด LTB ด้วย Lb ค่าเริ่มต้น = ช่วงระหว่าง sag rod)',
    'Tension (Neo): ต่อด้วยสลักหักรูเจาะ — เว็บยังไม่รองรับ (ถือเป็นรอยเชื่อม U = 1 ตามค่าตั้งต้นของ Neo) · L/r ≤ 240 ชิ้นหลัก',
    'RC_Design ชีต Purlin: ตรวจขนาด sag rod ดึงคอลัมน์ "เส้นรอบวง" แทนเส้นผ่านศูนย์กลาง · มี sag rod แล้วเอา Sy หารจำนวนแถว (จะพอร์ตพร้อมก้อน 4)',
    'ตาราง RC_Design: บางแถวน่าจะพิมพ์ผิด (เช่น BOX25x25x1.6 r = 0.34, BOX75x38x3.2 A = 5.15, C90x45x15 Sy, WF900x300 Sx) → steelsec.js ตรวจเทียบค่าคำนวณจากขนาด ใช้ค่าคำนวณแทนและแสดงหมายเหตุ',
    'ไม่ตรวจ: การโก่งเดาะแบบบิด-ดัดของ C-Lip รับแรงอัด · การลด Q ของผนังบาง (เตือนตาม B5.1 อย่างเดียว) · แรงบิดจากน้ำหนักเยื้องศูนย์ของ C · เหล็กฉากแกนหลัก u-v รับดัด — ใช้ SAP ตรวจจบ'
  ];

  return { NOTES, material, GRADES, Cc, Fa, Fe: Fe_, Cb, CbNeo, FbLTB, FbF18, FbFlangeNeo, LcNeo, LuNeo, FbX, FbY, shearAreas, localWarn, check, checkAll, suggest, purlin, KSI, E0 };
});
