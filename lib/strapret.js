/*! strapret.js — ฐานชิดเขตพร้อมคานยึดฐาน (Strap footing) และกำแพงกันดินแบบยื่น (Cantilever retaining wall)
 * ที่มา: Neo RC v5 Plus2003 ชีต "Strapf" และ "Retain" (อ่านสูตรอย่างเดียว ไม่ปลดล็อกไฟล์) — พอร์ตทีละเซลล์
 * excel:true = ตรงชีต (ใช้ทดสอบ) · ค่าปกติ = ฉบับแก้ที่ตกลงกับผู้ใช้ (ดู NOTES)
 * หน่วย: ม. · กก. · กก.-ม. · ksc · ขนาดเหล็ก มม.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.StrapRet = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const trunc = Math.trunc, A = d => Math.PI * ((d / 10) ** 2) / 4, A7 = d => (22 / 7) * ((0.1 * d) ** 2) / 4;
  const rd2 = x => Math.floor(x * 100 + 1e-9) / 100;
  const roundup0 = x => Math.ceil(x - 1e-9);

  // ------------------------------------------------------------------ Strapf
  /**
   * p: {L ระยะเสา, bxe/lxe ขนาดเสาริม (ตั้งฉาก/ตามแนวคาน), P1, bxi/lxi เสาใน, P2, Lxe/Lye ฐานริม (ตามแนวคาน/ตั้งฉาก), te, Lxi (ฐานในจัตุรัส), ti,
   *     bb/hb คาน, dTop dBot dSt dFe dFi dT, qa, cov ซม. (7.5), excel}
   * C: {fcp, fs, fsv, k, j, R}
   */
  function strapCheck(p, C) {
    const X = !!p.excel, fs = C.fs, j = C.j, k = C.k, R = C.R, fcp = C.fcp, cov = +p.cov || 7.5;
    const L = +p.L, bxe = +p.bxe, lxe = +p.lxe, P1 = +p.P1, bxi = +p.bxi, P2 = +p.P2, qa = +p.qa;
    const Lxe = +p.Lxe, Lye = +p.Lye, te = +p.te, Lxi = +p.Lxi, ti = +p.ti, bb = +p.bb, hb = +p.hb;
    const o = { input: p, checks: [] }, chk = (code, label, ok, val, lim, unit = '') => o.checks.push({ code, label, ok: !!ok, val, lim, unit });
    o.Ptot = 1.1 * (P1 + P2); o.Areq = o.Ptot / qa; o.AreqE = 1.1 * P1 / qa; o.AreqI = 1.1 * P2 / qa;
    o.xi = L + lxe / 2; o.xc = ((P2 * L) / (P1 + P2)) + lxe / 2;
    o.Ae = Lxe * Lye; o.Ai = Lxi * Lxi;
    o.qavg = o.Ptot / (o.Ae + o.Ai);
    o.Re = (o.Ptot * (o.xi - o.xc)) / (o.xi - (Lxe / 2));
    o.Ri = (o.Ptot * (o.xc - (Lxe / 2))) / (o.xi - (Lxe / 2));
    o.qe = X ? o.Re / (Lxe + Lye) : o.Re / o.Ae;   // R6 (ชีตหารด้วยผลบวกด้าน)
    o.qi = X ? o.Ri / (Lxi + Lxi) : o.Ri / o.Ai;
    chk('qe', 'แรงดันดินฐานริม ≤ qa และพื้นที่ ≥ ที่ต้องการ', o.Ae >= o.AreqE && o.qe <= qa, o.qe, qa, 'กก./ตร.ม.');
    chk('qi', 'แรงดันดินฐานใน ≤ qa และพื้นที่ ≥ ที่ต้องการ', o.Ai >= o.AreqI && o.qi <= qa, o.qi, qa, 'กก./ตร.ม.');
    const pe = X ? o.qavg : o.Re / o.Ae, pi = X ? o.qavg : o.Ri / o.Ai;
    o.MeT = ((pe * Lxe) * (((Lye - bxe) / 2) ** 2)) / 2; o.MiT = ((pi * Lxi) * (((Lxi - bxi) / 2) ** 2)) / 2;
    o.dreqE = trunc(Math.sqrt(o.MeT / (R * Lxe))) + 1; o.dreqI = trunc(Math.sqrt(o.MiT / (R * Lxi))) + 1;
    // คานยึดฐาน
    o.w = Lye * (o.Re / (Lxe * Lye));
    o.x0 = P1 / o.w; o.Mb = ((o.w * o.x0 ** 2) / 2) - (P1 * (o.x0 - (lxe / 2)));
    o.dreqB = trunc(Math.sqrt(((-1) * o.Mb * 100) / (R * bb * 100))) + 1; o.hreq = (o.dreqB + 5) / 100;
    chk('hb', 'ความลึกคาน ≥ ที่ต้องการ', hb >= o.hreq, hb, o.hreq, 'ม.');
    chk('Lb', 'คาน L/b ≤ 30', L / bb <= 30, L / bb, 30);
    const d = (hb * 100) - cov;
    o.Vb = (o.w * ((hb - (cov / 100)) + lxe)) - P1;
    o.Mc = R * (bb * 100) * (((hb - (cov / 100)) * 100) ** 2) / 100;
    const Ma = Math.abs(o.Mb); o.doubly = !(o.Mc >= Ma);
    const M1 = Ma <= o.Mc ? Ma : o.Mc, M2 = o.Mc >= Ma ? 0 : Ma - o.Mc;
    o.fsc = 2 * fs * ((k - (cov / (hb * 100 - cov)))) / (1 - k);
    o.AsTop = (M1 * 100 / (j * fs * ((hb - (cov / 100)) * 100))) + ((100 * M2) / (fs * (100 * hb - (2 * cov))));
    o.AsBot = (M2 * 100) / (o.fsc * ((100 * hb - cov) - cov));
    o.nTop = (trunc(o.AsTop / ((Math.PI * ((+p.dTop / 10) ** 2)) / 4)) + 1) <= 2 ? 2 : (trunc(o.AsTop / ((Math.PI * ((+p.dTop / 10) ** 2)) / 4)) + 1);
    o.nBot = Math.max(trunc(o.AsBot / ((Math.PI * ((+p.dBot / 10) ** 2)) / 4)) + 1, 2);
    const vc = 0.29 * (fcp ** 0.5), b = bb * 100, sAv = (Math.PI * ((+p.dSt / 10) ** 2) / 4) * 2 / (0.0015 * b);
    o.vc = vc; o.v = o.Vb / ((100 * bb) * (100 * (hb - (cov / 100))));
    if (X) {
      o.sSt = trunc((vc * d * b >= o.Vb) ? Math.min(sAv, 30, d / 2) : 2);
    } else {
      const V = Math.abs(o.Vb), Vs = V > vc * d * b ? V - vc * d * b : 0, fsv = C.fsv || 1200;
      o.sSt = trunc(Vs <= 0 ? Math.min(30, sAv, d / 2) : Math.min((fsv * 2 * d * A(+p.dSt)) / Vs, 30, sAv, d / 2));
      chk('vb', "เฉือนคาน (V − Vc ≤ 4Vc)", Vs <= 4 * vc * d * b, Math.abs(o.v), 5 * vc, 'ksc');
    }
    o.sSt = o.sSt / 100;
    // ฐานริม / ฐานใน
    const foot = (Lw, Lp, bcol, t, Rr, dmm) => {
      const P15 = (Lp - bcol) / 2, q = Rr / (Lw * Lp);
      const M = ((Lw * q) * (P15 ** 2)) / 2, V = (Lw * q) * P15, Vd = (Lw * q) * (P15 - (t - (cov / 100)));
      const As = (100 * M) / (fs * j * (100 * t - cov)), v = Vd / ((100 * Lw) * (100 * t - cov));
      const u = fs > 1200 ? Math.min(25, (2.29 * (fcp ** 0.5)) / (dmm / 10)) : Math.min(11, (1.145 * (fcp ** 0.5)) / (dmm / 10));
      const per = V / (u * j * (t * 100 - cov)), n = trunc(Math.max(As / ((Math.PI * (0.1 * dmm) ** 2) / 4), per / (Math.PI * (dmm * 0.1)))) + 1;
      return { arm: P15, q, M, V, Vd, As, v, u, per, n };
    };
    o.fe = foot(Lxe, Lye, bxe, te, o.Re, +p.dFe); o.fi = foot(Lxi, Lxi, bxi, ti, o.Ri, +p.dFi);
    chk('te', 'ฐานริม: เฉือน ≤ 0.29√f\'c และหนา ≥ d + 7.5', o.fe.v <= vc && (te * 100) >= (o.dreqE + 7.5), te * 100, o.dreqE + 7.5, 'ซม.');
    chk('ti', 'ฐานใน: เฉือน ≤ 0.29√f\'c และหนา ≥ d + 7.5', o.fi.v <= vc && (ti * 100) >= (o.dreqI + 7.5), ti * 100, o.dreqI + 7.5, 'ซม.');
    o.AsT = fs > 1200 ? 0.002 * (Lye * 100) * (te * 100) : 0.0025 * (Lye * 100) * (te * 100);
    o.sT = trunc((Lye / (trunc(o.AsT / ((Math.PI * (+p.dT * 0.1) ** 2) / 4)) + 1)) * 100) / 100;
    o.Ld = roundup0(fs <= 2400 * 0.5 ? fs * (+p.dTop / 10) / (4 * 11) : fs * (+p.dTop / 10) / (4 * 25));
    o.ok = o.checks.every(c => c.ok);
    return o;
  }

  // ------------------------------------------------------------------ Retain
  /**
   * p: {H ความสูงรวม, Hs ความสูงดิน, gam, q (กก./ตร.ม.), hw น้ำ, qa, phi, beta (องศา), mu, tb, tw, B1 ปลายเท้า, B2 ส้น (รวมผนัง), dW, dB, dT, excel}
   * C: {fcp, fs, j, R}
   */
  function retainCheck(p, C) {
    const X = !!p.excel, fs = C.fs, j = C.j, R = C.R, fcp = C.fcp;
    const H = +p.H, Hs = +p.Hs, gam = +p.gam, q = +p.q || 0, hw = +p.hw || 0, qa = +p.qa, phi = +p.phi, beta = +p.beta || 0, mu = +p.mu;
    const tb = +p.tb, tw = +p.tw, B1 = +p.B1, B2 = +p.B2, B = B1 + B2;
    const o = { input: p, checks: [] }, chk = (code, label, ok, val, lim, unit = '') => o.checks.push({ code, label, ok: !!ok, val, lim, unit });
    const cb = Math.cos(22 * beta / (180 * 7)), cp = Math.cos(22 * phi / (180 * 7));
    o.Ka = cb * ((cb - (cb ** 2 - cp ** 2) ** 0.5) / (cb + (cb ** 2 - cp ** 2) ** 0.5));
    o.pw = (Hs - tb) * gam * o.Ka; o.pb = Hs * gam * o.Ka; o.psur = q * o.Ka;
    o.Ww = (H - tb) * tw * 2400; o.Wb = (B1 + B2) * tb * 2400; o.Wsoil = (B2 - tw) * (Hs - tb) * gam; o.Wsur = (B2 - tw) * q;
    const N1 = X ? hw - tw : hw - tb;   // ความสูงน้ำเหนือฐาน (ชีตหักความหนาผนัง)
    o.Wwat = N1 <= 0 ? 0 : N1 * 1000 * (B2 - tw);
    o.W = o.Ww + o.Wb + o.Wsoil + o.Wsur + o.Wwat;
    o.Fsur = o.psur * Hs; o.Fsoil = o.pb * Hs * 0.5; o.Fwat = hw * 1000 * 0.5 * hw; o.F = o.Fsur + o.Fsoil + o.Fwat;
    o.slideRatio = o.F / o.W;
    o.Mw = (((1 / 6) * (Hs - tb) ** 2) * o.pw) + ((o.psur * (Hs - tb) ** 2) / 2) + (N1 <= 0 ? 0 : ((N1) ** 3 * 1000 * (1 / 6)));
    o.dW = Math.round(((o.Mw / R) ** 0.5 / 100) * 100) / 100;
    const armSur = X ? ((tw + B1) * (B2 - tw) * 0.5) : ((tw + B1) + (B2 - tw) * 0.5);   // ชีตเขียนเป็นผลคูณ
    o.MR = ((B1 + (0.5 * tw)) * o.Ww) + (((B1 + B2) / 2) * o.Wb) + (((tw + B1) + (B2 - tw) * 0.5) * o.Wsoil) + (armSur * o.Wsur) + (armSur * o.Wwat);
    o.Mo = (o.psur * Hs * (0.5 * Hs)) + (hw * 1000 * 0.5 * hw * (hw / 3)) + (Hs * gam * o.Ka * 0.5 * Hs * (Hs / 3));
    o.FSo = o.MR / o.Mo;
    chk('ot', 'ส่วนปลอดภัยการพลิกคว่ำ ≥ 2', o.FSo >= 2, o.FSo, 2);
    o.xbar = (o.MR - o.Mo) / o.W; o.Lp = o.xbar * 3;
    // แรงดันดินใต้ฐาน: q(x) เชิงเส้นจากปลายเท้า
    let q0, q1, Lp;
    if (X || o.xbar < B / 3) { Lp = o.Lp; q0 = o.W / (Lp * 0.5); q1 = 0; }
    else { const e = B / 2 - o.xbar; Lp = B; q0 = o.W / B * (1 + 6 * e / B); q1 = o.W / B * (1 - 6 * e / B); }
    o.qmax = q0; o.qmin = q1; o.LpUse = Lp;
    chk('bear', 'แรงดันดินใต้ฐาน ≤ qa และ ≥ 0', q0 <= qa && q0 >= 0 && o.xbar > 0, q0, qa, 'กก./ตร.ม.');
    const qAt = x => x > Lp + 1e-12 ? 0 : q0 + (q1 - q0) * x / Lp;
    // ปลายเท้า
    const p12 = X ? q0 * (o.Lp - B1) / o.Lp : qAt(B1);
    o.Mtoe = ((p12) * (B1 ** 2) * 0.5) + ((q0 - p12) * 0.5 * B1 * (2 * B1 / 3)) - (tb * B1 * 2400 * B1 * 0.5);
    // ส้น (ตั้งแต่หลังผนังถึงปลายส้น ยาว N12)
    const N12 = B2 - tw, xs = tw + B1;
    if (X) {
      const p13 = q0 * (o.Lp - xs) / o.Lp, N13 = o.Lp - xs;
      o.Mheel = (o.Wsoil * N12 * 0.5) - (0.5 * p13 * ((o.Lp - xs) ** 2 / 3)) + (0.5 * o.Wsur * N12) + (0.5 * o.Wwat * N12);
      o.Vheel = (o.Wsoil + (N12 * tb * 2400) + o.Wsur + o.Wwat) - (p13 * N13 / 2);
      o.Mmax = Math.max(o.Mtoe, o.Mheel);
    } else {
      const xe = Math.min(B, Lp), len = Math.max(0, xe - xs), qs = qAt(xs), qe = qAt(xe);
      const Fup = (qs + qe) / 2 * len, Mup = qs * len ** 2 / 2 + (qe - qs) * len ** 2 / 3;   // รอบหน้าผนังด้านหลัง
      const Wdown = o.Wsoil + o.Wsur + o.Wwat + N12 * tb * 2400;
      o.Mheel = Wdown * N12 * 0.5 - Mup; o.Vheel = Wdown - Fup;
      o.Mmax = Math.max(Math.abs(o.Mtoe), Math.abs(o.Mheel));
    }
    o.dB = Math.round(((o.Mmax / R) ** 0.5 / 100) * 100) / 100;
    if (X) chk('tb', 'ความหนาฐาน ≥ H/12', tb >= H / 12, tb, H / 12, 'ม.');
    else chk('tb', 'ความหนาฐาน ≥ H/12 และ ≥ d + 7.5 ซม.', tb >= H / 12 && tb >= o.dB + 0.075, tb, Math.max(H / 12, o.dB + 0.075), 'ม.');
    chk('tw', 'ความหนาผนัง ≥ d + 5 ซม.', tw >= (o.dW + 0.05), tw, o.dW + 0.05, 'ม.');
    chk('B1', 'ปลายเท้า ≥ 0.4H/3', B1 >= (0.4 * H) / 3, B1, 0.4 * H / 3, 'ม.');
    chk('B2', 'ส้นฐาน ≥ 0.8H/3', B2 >= (0.8 * H) / 3, B2, 0.8 * H / 3, 'ม.');
    if (X) chk('slide', 'การเลื่อน: แรงผลัก/น้ำหนัก < μ', o.slideRatio < mu, o.slideRatio, mu);
    else { o.FSs = mu * o.W / o.F; chk('slide', 'ส่วนปลอดภัยการเลื่อน μW/F ≥ 1.5', o.FSs >= 1.5, o.FSs, 1.5); }
    o.vc = 0.29 * (fcp ** 0.5); o.v = o.Vheel / (((tb - 0.05) * 100) * 100);
    chk('v', "เฉือนส้นฐาน ≤ 0.29√f'c", (X ? o.v : Math.abs(o.v)) <= o.vc, o.v, o.vc, 'ksc');
    o.AsT = 100 * (Math.max(tb, tw)) * 100 * 0.0025;
    o.AsW = Math.max(((100 * o.Mw) / (fs * j * ((tw - 0.05) * 100))), o.AsT, 0.006 * 100 * tw * 100);
    o.AsB = Math.max(((100 * o.Mmax) / (fs * j * ((tb - 0.05) * 100))), o.AsT, 0.006 * 100 * tb * 100);
    const sp = (As, d) => trunc(100 / (As / A7(d))) / 100;
    o.sW = sp(o.AsW, +p.dW); o.sB = sp(o.AsB, +p.dB); o.sT = sp(o.AsT, +p.dT);
    o.ok = o.checks.every(c => c.ok);
    return o;
  }

  /** ออกแบบฐานชิดเขต: เลือกเหล็กฐาน (ระยะ ≥ 0.10 ม.) และเหล็กคาน (ไม่เกินจำนวนที่วางได้ในชั้นเดียว) · ถ้าไม่ผ่านแนะนำขนาด */
  function strapDesign(p, C, opt = {}) {
    const dias = (opt.dias && opt.dias.length ? opt.dias : [12, 16, 20]).slice().sort((a, b) => a - b), cov = +p.cov || 7.5;
    const run = x => strapCheck(x, C);
    const fit = (field, w) => { for (const d of dias) { const r = run(Object.assign({}, p, { [field]: d })), n = (field === 'dFe' ? r.fe : r.fi).n; if ((w - 2 * cov / 100) / Math.max(n - 1, 1) >= 0.1 - 1e-9) return d; } return dias[dias.length - 1]; };
    const q = Object.assign({ dT: dias[0], dSt: 6 }, p);
    q.dFe = fit('dFe', +p.Lxe); q.dFi = fit('dFi', +p.Lxi);
    const perLayer = d => Math.max(2, Math.floor(((+p.bb * 100) - 2 * (3 + 0.6) + 2.5) / (d / 10 + 2.5)));
    q.dTop = dias.find(d => run(Object.assign({}, q, { dTop: d })).nTop <= perLayer(d)) || dias[dias.length - 1];
    q.dBot = dias[0];
    const r = run(q), out = { r, p: q, ok: r.ok };
    // จำนวนเหล็กฐานขั้นต่ำให้ระยะไม่เกิน 0.25 ม. (เหมือนฐานแผ่น)
    const nMin = w => Math.ceil(((w - 2 * cov / 100) / 0.25) - 1e-9) + 1;
    r.fe.n = Math.max(r.fe.n, nMin(+p.Lxe)); r.fi.n = Math.max(r.fi.n, nMin(+p.Lxi));
    if (!r.ok) {
      const z = Object.assign({}, q);
      for (let i = 0; i < 60 && run(z).checks.some(c => c.code === 'qe' && !c.ok); i++) z.Lye = +(z.Lye + 0.1).toFixed(2);
      for (let i = 0; i < 60 && run(z).checks.some(c => c.code === 'qi' && !c.ok); i++) z.Lxi = +(z.Lxi + 0.1).toFixed(2);
      for (let i = 0; i < 40 && run(z).checks.some(c => c.code === 'te' && !c.ok); i++) z.te = +(z.te + 0.05).toFixed(2);
      for (let i = 0; i < 40 && run(z).checks.some(c => c.code === 'ti' && !c.ok); i++) z.ti = +(z.ti + 0.05).toFixed(2);
      for (let i = 0; i < 40 && run(z).checks.some(c => (c.code === 'hb' || c.code === 'vb') && !c.ok); i++) z.hb = +(z.hb + 0.05).toFixed(2);
      out.sug = run(z).ok ? `แนะนำ ฐานริม ${z.Lxe}×${z.Lye}×${z.te} · ฐานใน ${z.Lxi}×${z.Lxi}×${z.ti} · คาน ${z.bb}×${z.hb} ม.` : '';
      out.error = 'ขนาดไม่พอ' + (out.sug ? ' — ' + out.sug : '');
    }
    return out;
  }
  /** ออกแบบกำแพงกันดิน: เลือกเหล็กผนัง/ฐาน/กันร้าวขนาดเล็กสุดที่ได้ระยะ ≥ 0.10 ม. */
  function retainDesign(p, C, opt = {}) {
    const dias = (opt.dias && opt.dias.length ? opt.dias : [12, 16, 20]).slice().sort((a, b) => a - b);
    const r0 = retainCheck(Object.assign({}, p, { dW: dias[0], dB: dias[0], dT: dias[0] }), C);
    const pick = As => dias.find(d => Math.trunc(100 / (As / A7(d))) / 100 >= 0.1) || dias[dias.length - 1];
    const q = Object.assign({}, p, { dW: pick(r0.AsW), dB: pick(r0.AsB), dT: pick(r0.AsT) });
    const r = retainCheck(q, C), out = { r, p: q, ok: r.ok };
    if (!r.ok) out.error = r.checks.filter(c => !c.ok).map(c => c.label).join(' · ');
    return out;
  }
  const NOTES = [
    'Strapf: แรงดันดินใต้ฐานหารด้วยพื้นที่ (ชีตหารด้วยผลบวกด้าน) · ความหนาฐานใช้แรงดันจริงของแต่ละฐาน (ชีตใช้แรงดันเฉลี่ย) · ปลอกคานคิดด้วย fs ปลอกและขนาดแรงเฉือน |V| · เว็บจัดเหล็กฐานระยะไม่เกิน 0.25 ม.',
    'Retain: ความสูงน้ำเหนือฐานหักความหนาฐาน · แขนโมเมนต์น้ำหนักบรรทุกจร/น้ำบนส้นเป็นผลบวก · แรงดันดินใต้ฐานแบบสี่เหลี่ยมคางหมูเมื่อแรงลัพธ์อยู่ในช่วงกลาง · โมเมนต์ส้นรวมน้ำหนักฐานและใช้ค่าสัมบูรณ์ · ตรวจความหนาฐานกับ d · การเลื่อนส่วนปลอดภัย ≥ 1.5'
  ];
  return { strapCheck, retainCheck, strapDesign, retainDesign, NOTES };
});
