/*! rcwsd.js — ออกแบบ คสล. วิธีหน่วยแรงใช้งาน (WSD) ตามรายการคำนวณของ Earth
 * ที่มา: RC_Design_WSD_Fixed_iterative_calc.xlsm ชีต "Design criteria" และ "Beam" (สูตรในเซลล์ — พอร์ตทีละเซลล์)
 * อ้างอิง: ประกาศ มท. การออกแบบอาคารและคุณสมบัติวัสดุ 2567 (fc ≤ 0.45f'c และ ≤ 65 ksc) · ว.ส.ท. / ACI WSD
 * หน่วย: แรง กก. · โมเมนต์ กก.-ม. · ขนาดหน้าตัด/ความยาว ม. · ระยะหุ้ม/ระยะในหน้าตัด ซม. · หน่วยแรง ksc · เหล็ก ตร.ซม.
 * จุดที่ต่างจาก Excel (ตั้งใจ บันทึกไว้ใน NOTES): ดูท้ายไฟล์
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RcWsd = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ES = 2040000;
  const rd2 = x => Math.floor(x * 100 + 1e-9) / 100;   // ROUNDDOWN(x,2) (ค่าบวก)
  /** พื้นที่เหล็ก ตร.ซม. ปัด 2 ตำแหน่ง (ตรงตาราง Excel: DB16 2.01, DB12 1.13 …) */
  const barArea = mm => Math.round(Math.PI * mm * mm / 4) / 100 || 0;
  const barName = (mm, fy) => (fy <= 2400 ? 'RB' : 'DB') + ' ' + mm;
  const GRADE = { 2400: 'SR-24', 3000: 'SD-30', 4000: 'SD-40', 5000: 'SD-50' };

  /** fs ที่ยอมให้ (Excel AA7): F = 0.45 → SD40 0.425fy · F = 0.375 → SD40 0.375fy */
  function fsAllow(fy, F) {
    const t = F === 0.375 ? { 2400: 0.5, 3000: 0.5, 4000: 0.375, 5000: 0.34 } : { 2400: 0.5, 3000: 0.5, 4000: 0.425, 5000: 0.34 };
    return t[fy] ? t[fy] * fy : 0.5 * fy;
  }
  /**
   * เกณฑ์ออกแบบ
   * c: {fcp: f'c ksc, F: 0.45|0.375, mode: 1 (จำกัด 65 ksc ตามกฎหมาย) | 2 (0.45f'c มีควบคุมคุณภาพ), fy: เหล็กหลัก, fyv: เหล็กปลอก}
   */
  function criteria(c = {}) {
    const fcp = +c.fcp || 240, F = +c.F || 0.45, mode = +c.mode === 2 ? 2 : 1, fy = +c.fy || 4000, fyv = +c.fyv || 2400;
    const Ec = Math.pow(2.323, 1.5) * 4270 * Math.sqrt(fcp);
    const fcRaw = F * fcp, fc = mode === 1 ? Math.min(fcRaw, 65) : fcRaw;
    const n = ES / Ec, sq = Math.sqrt(fcp);
    const kjr = fs => { const k = 1 / (1 + fs / (n * fc)), j = 1 - k / 3; return { fs, k, j, R: 0.5 * fc * k * j }; };
    const fs = fsAllow(fy, F), fsv = fsAllow(fyv, F);
    return {
      fcp, F, mode, fy, fyv, Es: ES, Ec, fcRaw, fc, capped: fc < fcRaw, n, nOk: n >= 6,
      main: Object.assign({ fy, grade: GRADE[fy] || 'fy ' + fy }, kjr(fs)), stir: Object.assign({ fy: fyv, grade: GRADE[fyv] || 'fy ' + fyv }, kjr(fsv)),
      vc: 0.29 * sq, vcPunch: 0.53 * sq, vcTor: 1.32 * sq, ftPlain: 0.424 * sq, bearFull: 0.25 * fcp, bearPart: 0.375 * fcp,
      bondTop: { deformed: D => Math.min(2.29 * sq / D, 25), round: D => Math.min(1.145 * sq / D, 11) },
      bondOther: { deformed: D => Math.min(3.32 * sq / D, 35), round: D => Math.min(1.615 * sq / D, 11) },
      note: mode === 2 && fcRaw > 65 ? 'ใช้ fc เกิน 65 ksc: ต้องระบุในแบบว่ามีมาตรฐานงานก่อสร้าง/การควบคุมคุณภาพวัสดุ และมีรายการคำนวณส่วนผสมคอนกรีตรับรองโดยวิศวกร' : ''
    };
  }

  // ----------------------------------------------------------------- คาน
  const BEAM_TYPES = { 1: 'Simple Beam', 2: 'One End Continuous Beam', 3: 'Both Ends Continuous Beam', 4: 'Cantilever Beam' };
  const BEAM_TYPES_TH = { 1: 'คานช่วงเดียว', 2: 'ต่อเนื่องปลายเดียว', 3: 'ต่อเนื่องสองปลาย', 4: 'คานยื่น' };
  /** ชั้นเหล็ก: [{main:{n,d}, sp:{n,d}}, …] (d = มม.) → [{A, y}] ระยะจากผิว (ซม.) ตามสูตร AY32–AY42 */
  function layerBars(layers, cov, ds) {
    const L = [0, 1, 2].map(i => layers[i] || {}), m = L.map(l => l.main || { n: 0, d: 0 }), s = L.map(l => l.sp || { n: 0, d: 0 });
    const base = [0, (m[0].d / 10) + 2.5, (m[0].d / 10) + 2.5 + (m[1].d / 10) + 2.5];
    const out = [];
    for (let i = 0; i < 3; i++) {
      out.push({ A: m[i].n * barArea(m[i].d), y: cov + ds + base[i] + m[i].d / 20, n: m[i].n, d: m[i].d, layer: i + 1, kind: 'main' });
      out.push({ A: s[i].n * barArea(s[i].d), y: cov + ds + base[i] + s[i].d / 20, n: s[i].n, d: s[i].d, layer: i + 1, kind: 'sp' });
    }
    return out;
  }
  const centroid = bars => { const A = bars.reduce((a, b) => a + b.A, 0); return A ? bars.reduce((a, b) => a + b.A * b.y, 0) / A : null; };
  /** ระยะช่องว่างระหว่างเหล็กในชั้น (ซม.) ตาม O32 */
  function clearSpacing(bcm, cov, ds, layer) {
    const m = layer.main || { n: 0, d: 0 }, s = layer.sp || { n: 0, d: 0 }, n = m.n + s.n;
    if (n < 2) return null;
    return (bcm - 2 * cov - 2 * ds - (m.d / 10) * m.n - (s.d / 10) * s.n) / (n - 1);
  }

  /**
   * ตรวจคาน 1 หน้าตัด (ตรงชีต Beam ของ Excel)
   * p: {M (กก.-ม., ค่าบวก), V (กก.), T (กก.-ม.), b, h, L (ม.), type 1–4, cov (ซม.),
   *     tens: [ชั้น], comp: [ชั้น] (ด้านรับแรงดึง/อัด), stir: {d มม., sets, s ม., fy}}
   * crit: ผลจาก criteria()
   */
  function beamCheck(p, crit) {
    const C = crit, fs = C.main.fs, fsv = C.stir.fs, k = C.main.k, j = C.main.j, R = C.main.R, sq = Math.sqrt(C.fcp);
    const M = Math.abs(+p.M || 0), V = Math.abs(+p.V || 0), T = Math.abs(+p.T || 0), b = +p.b, h = +p.h, L = +p.L, type = +p.type || 1, cov = +p.cov || 2.5;
    const st = p.stir || { d: 6, sets: 1, s: 0.15 }, ds = st.d / 10, Avs = barArea(st.d) * (st.sets || 1) * 2;
    const bcm = b * 100, hcm = h * 100, fy = C.fy;
    const tb = layerBars(p.tens || [], cov, ds), cb = layerBars(p.comp || [], cov, ds);
    const AsProv = tb.reduce((a, x) => a + x.A, 0), AscProv = cb.reduce((a, x) => a + x.A, 0);
    const yT = centroid(tb), yC = centroid(cb);
    const d = hcm - (yT === null ? cov + ds + 0.8 : yT), dp = yC === null ? cov + ds + 0.6 : yC;   // ไม่มีเหล็ก → สมมติ DB16 / DB12
    const out = { input: p, d, dp, AsProv, AscProv, bars: { tens: tb, comp: cb }, checks: [], warn: [] };
    const chk = (code, label, ok, val, lim, unit = '') => out.checks.push({ code, label, ok: !!ok, val, lim, unit });
    // ความลึกน้อยสุด (H14) · คานลึก (H15) · คานแคบ (H16)
    const div = { 1: 16, 2: 18.5, 3: 21, 4: 8 }[type];
    out.hmin = fy >= 4000 ? L / div : (L / div) * (0.4 + fy / 7000);
    chk('hmin', 'ความลึกน้อยสุด', h >= out.hmin, h, out.hmin, 'ม.');
    out.deep = rd2(h / L); out.deepLim = type === 1 ? 0.8 : 0.4;
    chk('deep', 'อัตราส่วนคานลึก h/L', out.deep <= out.deepLim, out.deep, out.deepLim);
    out.Lb = L / b; out.narrow = out.Lb > 30;
    chk('narrow', 'คานแคบ L/b', true, out.Lb, 30);
    // โมเมนต์ (X16–AG19)
    out.Mc = (out.narrow ? (1.75 - out.Lb / 40) : 1) * R * b * d * d;
    out.singly = M <= out.Mc;
    out.M1 = out.singly ? 0 : out.Mc; out.M2 = out.singly ? 0 : M - out.Mc;
    out.fsp = Math.min(fs, 2 * fs * (k - dp / d) / (1 - k));
    out.As1 = out.M1 / (fs * j * d / 100);
    out.As2 = out.singly ? 0 : out.M2 / (fs * (d - dp) / 100);
    out.As = out.singly ? M / (fs * j * d / 100) : out.As1 + out.As2;
    out.Asc = out.singly ? 0 : out.M2 / (out.fsp * (d - dp) / 100);
    out.Asmin = 14 / fy * bcm * d;
    if (out.singly) out.flex = 'ok';
    else if (out.fsp <= 0) out.flex = 'fail';
    else if (out.As > out.Asc) out.flex = out.As - out.Asc >= 0.25 ? 'ok' : 'steel';
    else out.flex = 'fail';
    // เฉือน (E18–E22)
    out.Vc = 0.29 * bcm * d * sq; out.Vc1 = 0.795 * bcm * d * sq; out.Vc2 = 1.32 * bcm * d * sq;
    out.Vp = V > out.Vc ? V - out.Vc : 0;
    chk('vmax', "V' ≤ Vc2 (1.32√f'c·bd)", out.Vp <= out.Vc2, out.Vp, out.Vc2, 'กก.');
    out.Av_s = (out.narrow || out.flex === 'steel' ? V : out.Vp) / (fsv * d);
    // บิด (E24–E29, N24–N26)
    const x1 = bcm - 2 * (cov + ds), y1 = hcm - 2 * (cov + ds);
    out.Ac = x1 * y1;
    out.vb = V / (bcm * hcm); out.vt = 3.5 * T * 100 / (hcm * bcm * bcm); out.v = out.vt + out.vb;
    out.vc1 = 1.32 * sq; out.vc2 = 1.65 * sq;
    chk('vt', 'หน่วยแรงเฉือนจากแรงบิด vt ≤ 1.32√f\'c', out.vt <= out.vc1, out.vt, out.vc1, 'ksc');
    chk('v', 'หน่วยแรงเฉือนรวม v ≤ 1.65√f\'c', out.v <= out.vc2, out.v, out.vc2, 'ksc');
    out.At_s = T * 100 / (out.Ac * fsv);
    out.Ast = (T * 100 * (x1 + y1) / 2) / (2 * out.Ac * fsv);   // ต่อมุม
    out.Atot_s = out.Av_s + out.At_s;
    // ระยะเหล็กปลอก (Z25, BP14–BQ16)
    const dm = d / 100;
    if (out.Atot_s === 0) { out.zone = 0; out.smax = Math.min(rd2(dm / 2), 0.6); out.scal = null; }
    else {
      out.scal = rd2((Avs / out.Atot_s) / 100);
      if (out.Vp === 0 || out.Vp <= out.Vc1) {
        out.zone = out.Vp === 0 ? 1 : 2;
        const cap = out.zone === 1 ? 0.6 : 0.3;
        out.smax = (out.scal > dm / 2 || out.scal > 0.6) ? Math.min(rd2(dm / 2), cap) : out.scal;
      } else if (out.Vp <= out.Vc2) { out.zone = 3; out.smax = (out.scal > dm / 4 || out.scal > 0.3) ? Math.min(rd2(dm / 4), 0.3) : out.scal; }
      else { out.zone = 4; out.smax = 0; }
    }
    out.Avmin = 0.0015 * bcm * out.smax * 100; out.Avprov = Avs;
    chk('avmin', 'เหล็กปลอก Av ≥ Av min', Avs >= out.Avmin - 1e-9, Avs, out.Avmin, 'ตร.ซม.');
    chk('s', 'ระยะเหล็กปลอก 0.10 ≤ s ≤ s max', out.zone !== 4 && st.s <= out.smax + 1e-9 && st.s >= 0.1 - 1e-9, st.s, out.smax, 'ม.');
    // เหล็กที่ต้องการ (G32/G36)
    if (out.flex === 'fail') { out.reqT = NaN; out.reqC = NaN; }
    else if (out.flex === 'steel') { const a = M / (fs * (d - dp) / 100); out.reqT = a + 2 * out.Ast; out.reqC = a + 2 * out.Ast; }
    else { out.reqT = out.As + 2 * out.Ast; out.reqC = out.Asc + 2 * out.Ast; }
    chk('flex', out.flex === 'steel' ? 'ออกแบบแบบ Steel beam (As ≈ As\')' : 'กำลังโมเมนต์ (As\' < As)', out.flex !== 'fail', out.As, out.Asc, 'ตร.ซม.');
    chk('ast', 'เหล็กรับแรงดึงที่ใส่ ≥ ที่ต้องการ', AsProv >= out.reqT - 1e-9, AsProv, out.reqT, 'ตร.ซม.');
    chk('asc', 'เหล็กรับแรงอัดที่ใส่ ≥ ที่ต้องการ', AscProv >= out.reqC - 1e-9, AscProv, out.reqC, 'ตร.ซม.');
    chk('asmin', 'เหล็กรับแรงดึง ≥ As min (14/fy·bd)', AsProv >= out.Asmin - 1e-9, AsProv, out.Asmin, 'ตร.ซม.');
    // ระยะช่องว่างเหล็ก (เพิ่มจาก Excel: ≥ 2.5 ซม. และ ≥ ขนาดเหล็กใหญ่สุด)
    out.spacing = [];
    [['tens', p.tens], ['comp', p.comp]].forEach(([side, ls]) => (ls || []).forEach((ly, i) => {
      const s = clearSpacing(bcm, cov, ds, ly); if (s === null) return;
      const need = Math.max(2.5, ((ly.main || {}).d || 0) / 10, ((ly.sp || {}).d || 0) / 10);
      out.spacing.push({ side, layer: i + 1, s, need });
      chk('clear', `ช่องว่างเหล็ก${side === 'tens' ? 'รับแรงดึง' : 'รับแรงอัด'} ชั้น ${i + 1}`, s >= need - 1e-9, s, need, 'ซม.');
    }));
    if (!C.nOk) out.warn.push("n = Es/Ec < 6 — ตรวจ f'c");
    out.ok = out.checks.every(c => c.ok);
    out.ratio = Math.max(...out.checks.filter(c => ['ast', 'asc', 'asmin'].includes(c.code) && c.lim > 0).map(c => c.lim / Math.max(c.val, 1e-9)), out.vt / out.vc1, out.v / out.vc2, out.zone === 4 ? 9 : 0, 0);
    return out;
  }

  // ----------------------------------------------------------------- เลือกเหล็กอัตโนมัติ
  const DIAS = { 4000: [12, 16, 20, 25], 3000: [12, 16, 20, 25], 5000: [12, 16, 20, 25], 2400: [12, 15, 19, 25] };
  /** จำนวนเหล็กสูงสุดต่อชั้นที่ยังมีช่องว่าง ≥ max(2.5, D) */
  function maxPerLayer(bcm, cov, ds, dmm) {
    const D = dmm / 10, need = Math.max(2.5, D);
    return Math.max(2, Math.floor((bcm - 2 * cov - 2 * ds + need) / (D + need)));
  }
  /** จัดเหล็กให้ได้ A ≥ req ด้วย base (เหล็กยาวตลอด, ชั้น 1) + extra (เสริมพิเศษ) — คืน layers ในรูปแบบ beamCheck */
  function arrange(bcm, cov, ds, dmm, nBase, nExtra) {
    const cap = maxPerLayer(bcm, cov, ds, dmm), layers = [];
    let base = nBase, extra = nExtra;
    for (let i = 0; i < 3 && (base + extra) > 0; i++) {
      const mb = Math.min(base, cap), me = Math.min(extra, cap - mb);
      layers.push({ main: { n: mb, d: mb ? dmm : (i === 0 ? dmm : 0) }, sp: { n: me, d: me ? dmm : 0 } });
      base -= mb; extra -= me;
    }
    return base + extra > 0 ? null : layers;
  }
  /**
   * ออกแบบคานทั้งตัว: หน้าตัดกลางช่วง (+M ดึงล่าง) และหน้าตัดที่ฐานรองรับ (−M ดึงบน)
   * f: {Mpos, Mneg (ค่าบวก), V, T} · g: {b, h, L, type, cov} · opt: {dias, stirDias:[6,9], minBars:2}
   * คืน {rebar (รูปแบบ .bm.json), mid, sup, ok, ratio}
   */
  function beamDesign(f, g, crit, opt = {}) {
    const fy = crit.fy, dias = opt.dias || DIAS[fy] || DIAS[4000], stirD = opt.stirDias || [6, 9], cov = +g.cov || 2.5, bcm = g.b * 100;
    const cant = +g.type === 4;
    const Mmid = cant ? 0 : Math.abs(+f.Mpos || 0), Msup = Math.abs(+f.Mneg || 0);
    // ปลอก: เริ่ม RB6 ถ้าระยะ < 0.10 ม. ขยับขนาด แล้วจึงปลอกคู่
    const stirOf = (dd) => {
      for (const sets of [1, 2]) for (const sd of stirD) {
        const tmp = beamCheck({ M: Math.max(Mmid, Msup), V: f.V, T: f.T, b: g.b, h: g.h, L: g.L, type: g.type, cov, tens: [{ main: { n: 2, d: dd } }], comp: [{ main: { n: 2, d: dd } }], stir: { d: sd, sets, s: 0.1 } }, crit);
        if (tmp.zone === 4) return null;
        let s = Math.floor(tmp.smax / 0.025 + 1e-9) * 0.025;
        s = Math.min(s, 0.3);
        if (s >= 0.1 - 1e-9 && barArea(sd) * sets * 2 >= 0.0015 * bcm * s * 100) return { d: sd, sets, s: +s.toFixed(3) };
      }
      return null;
    };
    let best = null;
    for (const D of dias) {
      const stir = stirOf(D) || { d: stirD[stirD.length - 1], sets: 2, s: 0.1 };
      const A = barArea(D);
      // วนเพราะ d ขึ้นกับจำนวนชั้นเหล็ก
      let nBot = 2, nTop = 2, nTopEx = 0, nBotEx = 0, res = null;
      for (let it = 0; it < 40; it++) {
        const bot = arrange(bcm, cov, stir.d / 10, D, nBot, nBotEx), top = arrange(bcm, cov, stir.d / 10, D, nTop, nTopEx);
        if (!bot || !top) { res = null; break; }
        const supTop = top, supBot = bot, midTop = arrange(bcm, cov, stir.d / 10, D, nTop, 0), midBot = arrange(bcm, cov, stir.d / 10, D, nBot, nBotEx);
        const P = (M, tens, comp) => ({ M, V: f.V, T: f.T, b: g.b, h: g.h, L: g.L, type: g.type, cov, tens, comp, stir });
        const mid = cant ? null : beamCheck(P(Mmid, midBot, midTop), crit);
        const sup = beamCheck(P(Msup, supTop, supBot), crit);
        res = { mid, sup, D, stir, nBot, nTop, nTopEx, nBotEx };
        let grow = false;
        if ((mid && mid.flex === 'fail') || sup.flex === 'fail' || sup.zone === 4 || (mid && mid.zone === 4)) { res.sectionFail = true; break; }   // เพิ่มเหล็กไม่ช่วย ต้องขยายหน้าตัด
        if (mid) {
          if (!(mid.AsProv >= mid.reqT - 1e-9 && mid.AsProv >= mid.Asmin - 1e-9)) { nBot++; grow = true; }
          else if (!(mid.AscProv >= mid.reqC - 1e-9)) { nTop++; grow = true; }
        }
        if (!grow) {
          if (!(sup.AsProv >= sup.reqT - 1e-9 && sup.AsProv >= sup.Asmin - 1e-9)) { nTopEx++; grow = true; }
          else if (!(sup.AscProv >= sup.reqC - 1e-9)) { nBotEx++; grow = true; }
        }
        if (!grow) break;
        if (nBot + nBotEx > 12 || nTop + nTopEx > 12) { res = null; break; }
      }
      if (!res) continue;
      const okAll = (!res.mid || res.mid.ok) && res.sup.ok;
      const steel = A * (res.nBot + res.nTop) * 1 + A * (res.nTopEx * 2 / 3 + res.nBotEx * 0.75);   // ตามสัดส่วนความยาวใน takeoff
      const cand = Object.assign(res, { ok: okAll, steel });
      if (!best || (cand.ok && !best.ok) || (cand.ok === best.ok && cand.steel < best.steel - 1e-9)) best = cand;
    }
    if (!best) return { ok: false, error: 'จัดเหล็กไม่ได้ในหน้าตัดนี้ — ขยายหน้าตัด' };
    if (best.sectionFail) best.error = 'หน้าตัดรับโมเมนต์/แรงเฉือนไม่พอ (เพิ่มเหล็กไม่ช่วย) — ขยายหน้าตัด';
    const rb = { top: [best.nTop, best.D], bot: [best.nBot, best.D], stirrup: [best.stir.d, best.stir.s, best.stir.s] };
    if (best.nTopEx) rb.extra_top = [best.nTopEx, best.D];
    if (best.nBotEx) rb.extra_bot = [best.nBotEx, best.D];
    if (best.stir.sets > 1) rb.double_stirrup = true;
    const ratio = Math.max(best.sup.ratio, best.mid ? best.mid.ratio : 0);
    return { ok: best.ok, rebar: rb, mid: best.mid, sup: best.sup, ratio, stir: best.stir, error: best.error || '' };
  }
  /** ข้อความเหล็กแบบ Excel: 2-DB 16+1-DB 16(special) */
  function layerText(ly, fy) {
    const m = ly.main || {}, s = ly.sp || {}, a = [];
    if (m.n) a.push(m.n + '-' + barName(m.d, fy));
    if (s.n) a.push(s.n + '-' + barName(s.d, fy) + ' (เสริมพิเศษ)');
    return a.join(' + ');
  }

  const NOTES = [
    'ไม่มีเหล็กรับแรงอัด: Excel หาร 0 (#DIV/0!) — เว็บสมมติ d\' = ระยะหุ้ม + ปลอก + 0.6 ซม.',
    'ไม่ต้องใช้เหล็กปลอกตามคำนวณ (V ≤ Vc และไม่มีแรงบิด): Excel ไม่ตรวจระยะ — เว็บจำกัด s ≤ d/2 และ ≤ 0.60 ม. พร้อม Av min',
    'ตรวจช่องว่างระหว่างเหล็ก ≥ 2.5 ซม. และ ≥ ขนาดเหล็ก (Excel แสดงระยะแต่ไม่ตรวจ)',
    'ตรวจเหล็กที่ใส่ ≥ เหล็กที่ต้องการ ทั้งด้านดึงและด้านอัด (Excel ใช้สีเตือน)',
    'พื้นที่ DB10 ใช้ 0.79 ตร.ซม. (ตารางใน Excel เขียน 0.76)'
  ];
  return { ES, criteria, fsAllow, barArea, barName, GRADE, BEAM_TYPES, BEAM_TYPES_TH, layerBars, centroid, clearSpacing, beamCheck, beamDesign, arrange, maxPerLayer, layerText, rd2, NOTES };
});
