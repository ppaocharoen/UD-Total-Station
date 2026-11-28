/*! steelsec.js — หน้าตัดเหล็กรูปพรรณ: อ่านชื่อหน้าตัด → คุณสมบัติ (จากตาราง หรือคำนวณจากขนาดเมื่อไม่มีในตาราง)
 * ตาราง: lib/steelsec_data.js (RC_Design_WSD UDfix + ท่อกลม Neo) — ตกลงกับ Earth 28 พ.ย. 2569: ใช้ตาราง RC_Design เป็นหลัก
 *   ขนาดที่ไม่มีในตาราง และ 2C ประกบคู่ → คำนวณจากขนาด (แผ่นสี่เหลี่ยมบาง ไม่คิดมุมโค้ง — วิธีเดียวกับ sap_export.double_c_props)
 * หน่วย: ขนาด มม. · A ซม.² · I ซม.⁴ · S ซม.³ · r ซม. · w กก./ม. · แกน x = แกนแข็ง (ดัดในระนาบเอว) · แกน y = แกนอ่อน
 * ชื่อที่อ่านได้: C100x50x20x2.3 (C มีขอบ) · 2C100x50x20x2.3 (C 2 ตัวประกบปากชนปาก = กล่องปิด) · BOX75x75x3.2 / BOX50x25x2.0
 *   CH150x75x6.5x10 (รางน้ำ) · WF200x100x5.5x8 · I200x100x7x10 · L50x50x5 · PIPE60.5x2.3 (ไม่มีคำนำหน้า "WF"/"H" ก็อ่านได้)
 */
(function (root, factory) {
  const data = (typeof module === 'object' && module.exports) ? require('./steelsec_data.js') : root.SteelSecData;
  const api = factory(data || []);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SteelSec = api;
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';
  const RHO = 7.85e-3;   // กก./(ซม.²·ม.) — A(ซม.²) × 0.785 = กก./ม.
  const FAMS = { CL: 'เหล็กตัวซีมีขอบ (C-Lip)', C2: 'C ประกบคู่ (กล่อง)', BOX: 'ท่อเหล็กกล่อง', CH: 'เหล็กรางน้ำ', WF: 'เหล็ก WF/H', I: 'เหล็ก I', L: 'เหล็กฉาก', PIPE: 'ท่อกลม' };
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  /** อ่านชื่อหน้าตัด → {fam, dims} หรือ null */
  function parse(name) {
    const s = String(name || '').replace(/\s+/g, '').replace(/[×*]/g, 'x').toUpperCase();
    const n = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    let m;
    if ((m = s.match(/^2C[-_]?/)) && n.length >= 5) return { fam: 'C2', H: n[1], B: n[2], C: n[3], t: n[4] };
    if (/^(C|LC|CL)[-_]?\d/.test(s) && n.length === 4) return { fam: 'CL', H: n[0], B: n[1], C: n[2], t: n[3] };
    if (/^(BOX|RHS|SHS|TUBE|□)/.test(s) && n.length === 3) return { fam: 'BOX', H: n[0], B: n[1], t: n[2] };
    if (/^(BOX|SHS)/.test(s) && n.length === 2) return { fam: 'BOX', H: n[0], B: n[0], t: n[1] };
    if (/^(CH|\[)/.test(s) && n.length === 4) return { fam: 'CH', H: n[0], B: n[1], tw: n[2], tf: n[3] };
    if (/^(WF|H)[-_]?\d/.test(s) && n.length === 4) return { fam: 'WF', H: n[0], B: n[1], tw: n[2], tf: n[3] };
    if (/^I[-_]?\d/.test(s) && n.length === 4) return { fam: 'I', H: n[0], B: n[1], tw: n[2], tf: n[3] };
    if (/^L[-_]?\d/.test(s) && n.length === 3) return { fam: 'L', H: n[0], B: n[1], t: n[2] };
    if (/^(PIPE|O|Ø)/.test(s) && n.length === 2) return { fam: 'PIPE', H: n[0], B: n[0], t: n[1] };
    return null;
  }
  const key = d => [d.fam, d.H, d.B, d.C, d.t, d.tw, d.tf].filter(v => v !== undefined).join('|');
  const INDEX = new Map();
  DATA.forEach(r => { const d = parse(r.name); if (d) INDEX.set(key(Object.assign(d, { fam: r.fam })), r); });

  // ---------- คำนวณจากขนาด: แผ่นสี่เหลี่ยม (x0,x1,y0,y1) หน่วย ซม. ----------
  function rectProps(R) {
    let A = 0, Sx1 = 0, Sy1 = 0;
    R.forEach(([x0, x1, y0, y1]) => { const a = (x1 - x0) * (y1 - y0); A += a; Sx1 += a * (x0 + x1) / 2; Sy1 += a * (y0 + y1) / 2; });
    const xc = Sx1 / A, yc = Sy1 / A;
    let Ix = 0, Iy = 0, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    R.forEach(([x0, x1, y0, y1]) => {
      Ix += (x1 - x0) * ((y1 - yc) ** 3 - (y0 - yc) ** 3) / 3;
      Iy += (y1 - y0) * ((x1 - xc) ** 3 - (x0 - xc) ** 3) / 3;
      xmin = Math.min(xmin, x0); xmax = Math.max(xmax, x1); ymin = Math.min(ymin, y0); ymax = Math.max(ymax, y1);
    });
    return { A, Ix, Iy, xc, yc, Sx: Ix / Math.max(ymax - yc, yc - ymin), Sy: Iy / Math.max(xmax - xc, xc - xmin),
      rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A), cx: xc - xmin };
  }
  /** ผนังบางตามเส้นกลางแผ่น (thin-wall midline): paths = รายการจุด [x,y] ซม. · t ซม. → {A, Ix, Iy, xc, yc} */
  function thinProps(paths, t) {
    let A = 0, Sx1 = 0, Sy1 = 0, Ixx = 0, Iyy = 0;
    paths.forEach(P => {
      for (let i = 0; i + 1 < P.length; i++) {
        const [x0, y0] = P[i], [x1, y1] = P[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
        if (!L) continue;
        const a = L * t;
        A += a; Sx1 += a * (x0 + x1) / 2; Sy1 += a * (y0 + y1) / 2;
        Ixx += a * (y0 * y0 + y0 * y1 + y1 * y1) / 3 + t ** 3 * L / 12 * ((x1 - x0) / L) ** 2;
        Iyy += a * (x0 * x0 + x0 * x1 + x1 * x1) / 3 + t ** 3 * L / 12 * ((y1 - y0) / L) ** 2;
      }
    });
    const xc = Sx1 / A, yc = Sy1 / A;
    return { A, Ix: Ixx - A * yc * yc, Iy: Iyy - A * xc * xc, xc, yc };
  }
  function arc(cx, cy, r, a0, a1, n = 8) {
    const P = [];
    for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return P;
  }
  // รัศมีมุมดัด: C-Lip รัศมีในเท่า t · ท่อกล่อง รัศมีนอก 2t — ปรับให้ตรงตาราง RC_Design (คลาดเฉลี่ย ~2%)
  const CL_RI = 1.0, BOX_RO = 2.0;
  /** เส้นกลางแผ่น C มีขอบ (ซม.): เอวที่ x = 0 ปากหันไป +x */
  function clPath(H, B, C, t) {
    H /= 10; B /= 10; C /= 10; t /= 10;
    const rm = CL_RI * t + t / 2, h = H - t, b = B - t, c = C - t / 2, lip = C > t, P = [];
    if (lip) { P.push([b, h / 2 - c]); P.push(...arc(b - rm, h / 2 - rm, rm, 0, 90)); } else P.push([b, h / 2]);
    P.push(...arc(rm, h / 2 - rm, rm, 90, 180), ...arc(rm, -h / 2 + rm, rm, 180, 270));
    if (lip) { P.push(...arc(b - rm, -h / 2 + rm, rm, 270, 360)); P.push([b, -h / 2 + c]); } else P.push([b, -h / 2]);
    return P;
  }
  function finish(p, xmin, xmax, ymin, ymax) {
    return Object.assign(p, { Sx: p.Ix / Math.max(ymax - p.yc, p.yc - ymin), Sy: p.Iy / Math.max(xmax - p.xc, p.xc - xmin),
      rx: Math.sqrt(p.Ix / p.A), ry: Math.sqrt(p.Iy / p.A), cx: p.xc - xmin, w: p.A * RHO * 100 });
  }
  function computeCL(d) {
    const t = d.t / 10, p = thinProps([clPath(d.H, d.B, d.C, d.t)], t);
    return finish(p, -t / 2, d.B / 10 - t / 2, -d.H / 20, d.H / 20);
  }
  /** 2C ประกบปากชนปาก (กล่องกว้าง 2B สูง H) — ขอบพับอยู่ด้านในกล่อง */
  function computeC2(d) {
    const t = d.t / 10, off = d.B / 10 - t / 2;
    const L = clPath(d.H, d.B, d.C, d.t).map(([x, y]) => [x - off, y]);
    const p = thinProps([L, L.map(([x, y]) => [-x, y])], t);
    return finish(p, -d.B / 10, d.B / 10, -d.H / 20, d.H / 20);
  }
  function computeBOX(d) {
    const H = d.H / 10, B = d.B / 10, t = d.t / 10, rm = BOX_RO * t - t / 2, h = H - t, b = B - t;
    const P = [...arc(b / 2 - rm, h / 2 - rm, rm, 0, 90), ...arc(-b / 2 + rm, h / 2 - rm, rm, 90, 180),
      ...arc(-b / 2 + rm, -h / 2 + rm, rm, 180, 270), ...arc(b / 2 - rm, -h / 2 + rm, rm, 270, 360)];
    P.push(P[0]);
    return finish(thinProps([P], t), -B / 2, B / 2, -H / 2, H / 2);
  }
  function computePIPE(d) {
    const D = d.H / 10, t = d.t / 10, Di = D - 2 * t;
    const A = Math.PI / 4 * (D * D - Di * Di), I = Math.PI / 64 * (D ** 4 - Di ** 4);
    return { A, Ix: I, Iy: I, Sx: I / (D / 2), Sy: I / (D / 2), rx: Math.sqrt(I / A), ry: Math.sqrt(I / A), w: A * RHO * 100 };
  }
  function computeIsh(d) {   // I / WF / รางน้ำ ไม่คิดมุมโค้ง
    const H = d.H / 10, B = d.B / 10, tw = d.tw / 10, tf = d.tf / 10;
    const R = d.fam === 'CH'
      ? [[0, tw, -H / 2 + tf, H / 2 - tf], [0, B, H / 2 - tf, H / 2], [0, B, -H / 2, -H / 2 + tf]]
      : [[-tw / 2, tw / 2, -H / 2 + tf, H / 2 - tf], [-B / 2, B / 2, H / 2 - tf, H / 2], [-B / 2, B / 2, -H / 2, -H / 2 + tf]];
    const p = rectProps(R);
    return Object.assign(p, { w: p.A * RHO * 100 });
  }

  /** rT = รัศมีไจเรชันของปีกรับแรงอัด + 1/3 ของเอวส่วนรับแรงอัด รอบแกนตั้ง (AISC 89 F1) — ซม. */
  function rT(d) {
    let R;
    if (d.fam === 'CL') {
      const H = d.H / 10, B = d.B / 10, C = d.C / 10, t = d.t / 10;
      R = [[0, B, 0, t], [0, t, t, t + (H / 2 - t) / 3]];
      if (C > t) R.push([B - t, B, t, C]);
    } else if (d.fam === 'CH') {
      const H = d.H / 10, B = d.B / 10, tw = d.tw / 10, tf = d.tf / 10;
      R = [[0, B, 0, tf], [0, tw, tf, tf + (H / 2 - tf) / 3]];
    } else if (d.fam === 'WF' || d.fam === 'I') {
      const H = d.H / 10, B = d.B / 10, tw = d.tw / 10, tf = d.tf / 10;
      R = [[-B / 2, B / 2, 0, tf], [-tw / 2, tw / 2, tf, tf + (H / 2 - tf) / 3]];
    } else return null;
    const p = rectProps(R);
    return p.ry;
  }

  // ---------- ตรวจตาราง: ค่าที่น่าจะพิมพ์ผิดในตารางต้นฉบับ ----------
  // C-Lip/ท่อกล่อง: เทียบค่าคำนวณจากขนาด (มุมโค้ง) ต่างเกิน 15% → ใช้ค่าคำนวณทั้งชุด
  // รีดร้อน (WF/I/รางน้ำ): Sx ไม่สอดคล้องกับ Ix/(H/2) เกิน 10% → ใช้ Ix/(H/2) (Sy เช่นกัน · แบบเดียวกันกับเหล็กฉาก)
  const SUSPECT = {};
  DATA.forEach(r => {
    const d = Object.assign(parse(r.name) || {}, { fam: r.fam });
    if (r.fam === 'CL' || r.fam === 'BOX') {
      const c = r.fam === 'CL' ? computeCL(d) : computeBOX(d);
      const bad = ['A', 'Ix', 'Iy', 'Sx', 'Sy', 'rx', 'ry'].filter(k => r[k] && Math.abs(c[k] - r[k]) / r[k] > 0.15);
      if (bad.length) SUSPECT[r.name] = { use: 'computed', keys: bad, note: 'ตาราง RC_Design ' + bad.map(k => `${k}=${r[k]}`).join(' ') + ' น่าจะพิมพ์ผิด (คำนวณจากขนาดได้ ' + bad.map(k => `${k}=${+c[k].toPrecision(4)}`).join(' ') + ') — ใช้ค่าคำนวณ' };
    } else if (r.fam === 'WF' || r.fam === 'I' || r.fam === 'CH') {
      const fix = {};
      const sx = r.Ix / (r.H / 20), sy = r.fam === 'CH' ? r.Iy / (r.B / 10 - (r.cx || 0)) : r.Iy / (r.B / 20);
      if (Math.abs(r.Sx - sx) / sx > 0.10) fix.Sx = sx;
      if (r.fam !== 'CH' && Math.abs(r.Sy - sy) / sy > 0.10) fix.Sy = sy;
      if (Object.keys(fix).length) SUSPECT[r.name] = { use: 'fix', fix, note: 'ตาราง RC_Design ' + Object.keys(fix).map(k => `${k}=${r[k]}`).join(' ') + ' ไม่สอดคล้องกับ I/c — ใช้ ' + Object.entries(fix).map(([k, v]) => `${k}=${+v.toPrecision(4)}`).join(' ') };
    }
  });

  /** คุณสมบัติหน้าตัด → {name, fam, famName, src:'table'|'computed', H,B,…, A,w,Ix,Iy,Sx,Sy,rx,ry,rmin, rT, d(ซม.), Af(ซม.²), webs, hw(ซม.), tw(ซม.)} */
  function props(name) {
    const d = parse(name);
    if (!d) return null;
    let p, src = 'table';
    const row = INDEX.get(key(d));
    const sus = row && SUSPECT[row.name];
    let note = null;
    if (row && !(sus && sus.use === 'computed')) { p = Object.assign({}, row, sus ? sus.fix : {}); note = sus ? sus.note : null; }
    else {
      if (sus) note = sus.note;
      src = 'computed';
      if (d.fam === 'CL') p = computeCL(d);
      else if (d.fam === 'C2') p = computeC2(d);
      else if (d.fam === 'BOX') p = computeBOX(d);
      else if (d.fam === 'PIPE') p = computePIPE(d);
      else if (d.fam === 'WF' || d.fam === 'I' || d.fam === 'CH') p = computeIsh(d);
      else return null;    // เหล็กฉากที่ไม่มีในตาราง — ไม่คำนวณเอง (ต้องการ Iv)
    }
    const o = Object.assign({ name: String(name).trim(), fam: d.fam, famName: FAMS[d.fam], src }, d, p);
    if (note) o.tableNote = note;
    o.fam = d.fam;
    o.rmin = d.fam === 'L' && o.rv ? o.rv : Math.min(o.rx, o.ry);
    o.d = d.H / 10;
    // ปีก/เอวสำหรับตรวจแรงเฉือนและ LTB (หน่วย ซม.)
    if (d.fam === 'CL') { o.tw = d.t / 10; o.tf = d.t / 10; o.webs = 1; o.bf = d.B / 10; }
    else if (d.fam === 'C2') { o.tw = d.t / 10; o.tf = d.t / 10; o.webs = 2; o.bf = 2 * d.B / 10; }
    else if (d.fam === 'BOX') { o.tw = d.t / 10; o.tf = d.t / 10; o.webs = 2; o.bf = d.B / 10; }
    else if (d.fam === 'PIPE') { o.tw = d.t / 10; o.tf = d.t / 10; o.webs = 0; o.bf = d.H / 10; }
    else if (d.fam === 'L') { o.tw = d.t / 10; o.tf = d.t / 10; o.webs = 1; o.bf = d.B / 10; }
    else { o.tw = d.tw / 10; o.tf = d.tf / 10; o.webs = 1; o.bf = d.B / 10; }
    o.hw = o.d - 2 * o.tf;
    o.Af = o.bf * o.tf;
    if (d.fam === 'C2') o.Af = 2 * (d.B / 10) * (d.t / 10);
    const r = rT(d);
    if (r) o.rT = r;
    return o;
  }

  /** หน้าตัดในตารางของตระกูลเดียวกัน (ใช้หาหน้าตัดเบาสุดที่ผ่าน) เรียงตามน้ำหนัก
   * opt.sameShape: ขนาด H×B เท่าเดิม เปลี่ยนแค่ความหนา · 2C ใช้ตาราง C-Lip แล้วประกอบคู่ */
  function family(fam, opt = {}) {
    const src = fam === 'C2' ? 'CL' : fam;
    let list = DATA.filter(r => r.fam === src).map(r => fam === 'C2' ? '2' + r.name : r.name);
    if (opt.sameShape) {
      list = list.filter(n => { const d = parse(n); return near(d.H, opt.sameShape.H) && near(d.B, opt.sameShape.B); });
    }
    return list.map(props).filter(Boolean).sort((a, b) => a.w - b.w || a.A - b.A);
  }

  return { parse, props, family, rectProps, thinProps, SUSPECT, computeCL, computeC2, computeBOX, computePIPE, computeIsh, rT, FAMS, DATA };
});
