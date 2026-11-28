/*! steelchk.js — ตรวจซ้ำเหล็กรูปพรรณทั้งโมเดลจากผล SAP (M6 ก้อน 3 · 28 พ.ย. 2569 ตกลงกับ Earth)
 * - แรง: results.steel_combo ทุกชุดผสม ทุกสถานีวิกฤต → SteelASD.check (AISC 89 ASD)
 * - ความยาวโก่งเดาะ/ระยะค้ำ: อ่านจากโมเดล K = 1 · KL และ Lb (ปีกบน, M3 ≥ 0) = ระยะระหว่างจุดที่ชิ้นอื่นมาต่อ
 *   (results.frame_joints — จันทันค้ำโดยแป แปค้ำโดยจันทัน) · Lb ปีกล่าง (M3 < 0) = ระยะระหว่างจุดรองรับของแนวชิ้น
 *   (จันทันวางบนคาน/โครงถัก — แปไม่นับเป็นจุดรองรับ) · แก้ได้รายชิ้น/รายประเภท (opt.over / opt.byType)
 * - การโก่งตัว: การเคลื่อนที่ของจุด (results.displacements) เทียบเส้นตรงระหว่างจุดรองรับของแนวชิ้น ทุกชุดผสม
 *   ตั้งฉากกับแนวชิ้นในระนาบดิ่ง · ช่วงยื่น (ชายคา) เทียบจุดรองรับ ยอมให้ 2L/n · ค่าเริ่มต้น L/240 · ช่วงสั้นกว่า 0.30 ม. ไม่ตรวจ
 * - แกน: x ของ steelsec = แกนแข็ง · หน้าตัดในโมเดลวางแบน (h < b เช่น แปกล่อง 50x25 วางแบน) → M3 ของ SAP = แกนอ่อน
 * - Cb = 1 (ปลอดภัย — เก็บแรงเฉพาะสถานีวิกฤต) · Cm = 0.85
 * ใช้ได้ทั้งเว็บ (window.SteelChk) และ node
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./steelsec.js') : root.SteelSec, isNode ? require('./steelasd.js') : root.SteelASD);
  if (isNode) module.exports = api; else root.SteelChk = api;
})(typeof self !== 'undefined' ? self : this, function (Sec, ASD) {
  'use strict';
  const STEEL = ['purlin', 'rafter', 'ridge', 'hip', 'valley', 'steel_beam', 'steel_column', 'truss_chord', 'truss_web', 'brace', 'sag_rod'];
  const TYPE_TH = { purlin: 'แป', rafter: 'จันทัน', ridge: 'อกไก่', hip: 'ตะเฆ่สัน', valley: 'ตะเฆ่ราง', steel_beam: 'คานเหล็ก', steel_column: 'เสาเหล็ก',
    truss_chord: 'คอร์ดโครงถัก', truss_web: 'เอวโครงถัก', brace: 'ค้ำยัน', sag_rod: 'เหล็กยึดแป (sag rod)' };
  // ชิ้นที่ "เบากว่า" — มาต่อแล้วค้ำปีกบนได้ แต่ไม่นับเป็นจุดรองรับของแนวชิ้น (Lb ปีกล่าง / ช่วงการโก่งตัว)
  const LIGHT = {
    purlin: ['purlin', 'sag_rod'], rafter: ['purlin', 'sag_rod', 'rafter', 'ridge', 'hip', 'valley'], ridge: ['purlin', 'sag_rod', 'rafter'],
    hip: ['purlin', 'sag_rod', 'rafter'], valley: ['purlin', 'sag_rod', 'rafter'], steel_beam: ['purlin', 'sag_rod', 'rafter', 'ridge', 'hip', 'valley'],
    truss_chord: ['purlin', 'sag_rod', 'rafter', 'truss_web', 'brace'], steel_column: [], truss_web: [], brace: [], sag_rod: []
  };
  const MIN_SPAN = 0.30;   // ม. — ช่วง/ช่วงยื่นสั้นกว่านี้ไม่ตรวจการโก่งตัว
  const DEFL = ['purlin', 'rafter', 'ridge', 'hip', 'valley', 'steel_beam', 'truss_chord'];
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.sqrt(dot(a, a)), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /** หน้าตัดของชิ้นจากโมเดล → props ของ steelsec วางตามแกน SAP (x = แกน 3) */
  function memberSection(m, x) {
    const sd = (m.sections || []).find(s => s.id === x.section) || {};
    const names = [x.section, sd.id, sd.name].filter(Boolean);
    let p = null;
    for (const n of names) { p = Sec.props(String(n).replace(/^\[\]-?/, 'BOX')); if (p) break; }
    if (!p) return null;
    p = Object.assign({}, p);
    const h = (sd.h || (sd.dims && sd.dims.h) || 0) * 1000, b = (sd.b || (sd.dims && sd.dims.b) || 0) * 1000;
    if (h && b && h < b - 1e-6 && p.H > p.B + 1e-6 && p.fam !== 'C2') {     // วางแบน → สลับแกน
      [p.Ix, p.Iy] = [p.Iy, p.Ix]; [p.Sx, p.Sy] = [p.Sy, p.Sx]; [p.rx, p.ry] = [p.ry, p.rx];
      [p.H, p.B] = [p.B, p.H]; p.d = p.H / 10; p.bf = p.B / 10; p.hw = p.d - 2 * p.tf; p.Af = p.bf * p.tf; p.flat = true;
    }
    return p;
  }

  /** เตรียมข้อมูลเรขาคณิต: พิกัดจุด, จุดต่อ→ชิ้น, แนวชิ้น */
  function prepare(m) {
    const R = m.results || {}, xyz = {};
    (m.nodes || []).forEach(n => { xyz[n.id] = [n.x, n.y, n.z]; });
    Object.entries(R.aux_joints || {}).forEach(([j, p]) => { xyz[j] = p; });
    const fj = R.frame_joints || {}, sup = new Set((m.supports || []).map(s => s.node));
    const mem = (m.members || []).filter(x => xyz[x.i] && xyz[x.j]);
    const jm = {};   // joint → [member id]
    const pts = {};  // member → [{j, s}] ตามระยะจากปลาย i
    const ends = {};   // ปลายชิ้นตามพิกัดใน SAP (แปถูกย้ายลงระนาบจันทันตอนส่งออก — ใช้จุดแรก/สุดท้ายของ frame_joints)
    for (const x of mem) {
      const js = fj[x.id] || [x.i, x.j];
      const A = xyz[js[0]] || xyz[x.i], B = xyz[js[js.length - 1]] || xyz[x.j];
      ends[x.id] = [A, B];
      const a = A, L = len(sub(B, a));
      pts[x.id] = js.filter(j => xyz[j]).map(j => ({ j, s: len(sub(xyz[j], a)) })).sort((p, q) => p.s - q.s);
      pts[x.id].L = L;
      js.forEach(j => (jm[j] = jm[j] || []).push(x.id));
    }
    // ปลายชิ้นที่วางบนชิ้นอื่น (Body constraint) — นับว่าต่อกับชิ้นรองรับ
    Object.entries(R.body || {}).forEach(([e, ps]) => {
      const add = new Set(jm[e] || []);
      ps.forEach(p => (jm[p] || []).forEach(id => add.add(id)));
      ps.forEach(p => { jm[p] = [...new Set([...(jm[p] || []), ...(jm[e] || [])])]; });
      jm[e] = [...add];
    });
    return { xyz, jm, pts, sup, ends, byId: Object.fromEntries(mem.map(x => [x.id, x])), mem };
  }

  /** แนวชิ้น: ชิ้นประเภทเดียวกัน แนวเดียวกัน ต่อปลายกัน → [{ids, a (จุดเริ่ม), d (ทิศ), pts:[{j,s}]}] */
  function lines(G, types) {
    const seen = new Set(), out = [];
    const dir = x => unit(sub(G.ends[x.id][1], G.ends[x.id][0]));
    for (const x of G.mem) {
      if (seen.has(x.id) || !types.includes(x.type)) continue;
      const d = dir(x), ids = [x.id]; seen.add(x.id);
      let grow = true;
      while (grow) {
        grow = false;
        for (const y of G.mem) {
          if (seen.has(y.id) || y.type !== x.type || Math.abs(dot(dir(y), d)) < 0.9995) continue;
          const ends = new Set(ids.flatMap(id => [G.byId[id].i, G.byId[id].j, G.pts[id][0].j, G.pts[id][G.pts[id].length - 1].j]));
          if (ends.has(y.i) || ends.has(y.j) || ends.has(G.pts[y.id][0].j) || ends.has(G.pts[y.id][G.pts[y.id].length - 1].j)) { ids.push(y.id); seen.add(y.id); grow = true; }
        }
      }
      const all = ids.flatMap(id => G.pts[id].map(p => p.j));
      const a0 = all.reduce((best, j) => { const s = dot(sub(G.xyz[j], G.ends[x.id][0]), d); return s < best.s ? { j, s } : best; }, { j: G.pts[x.id][0].j, s: 0 }).j;
      const pmap = new Map();
      all.forEach(j => pmap.set(j, dot(sub(G.xyz[j], G.xyz[a0]), d)));
      out.push({ ids, type: x.type, a: a0, d, pts: [...pmap].map(([j, s]) => ({ j, s })).sort((p, q) => p.s - q.s) });
    }
    return out;
  }
  /** จุดรองรับของแนว: ต่อกับชิ้นที่ไม่ใช่ชิ้นในแนวและไม่อยู่ในกลุ่ม "เบากว่า" หรือเป็นจุดยึด */
  function supportsOf(G, line) {
    const light = LIGHT[line.type] || [], inLine = new Set(line.ids);
    return line.pts.filter(p => G.sup.has(p.j) || (G.jm[p.j] || []).some(id => !inLine.has(id) && G.byId[id] && !light.includes(G.byId[id].type)));
  }

  /** ระยะค้ำยัน/ความยาวโก่งเดาะของชิ้น (ม.) */
  function bracing(G, x, line) {
    const P = G.pts[x.id], L = P.L;
    let seg = 0;
    for (let i = 1; i < P.length; i++) seg = Math.max(seg, P[i].s - P[i - 1].s);
    seg = seg || L;
    let lbNeg = seg;
    if (line && (LIGHT[x.type] || []).length) {
      const S = supportsOf(G, line).map(p => p.s), s0 = dot(sub(G.ends[x.id][0], G.xyz[line.a]), line.d), s1 = dot(sub(G.ends[x.id][1], G.xyz[line.a]), line.d);
      const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      const bps = [line.pts[0].s, ...S, line.pts[line.pts.length - 1].s].sort((a, b) => a - b);
      lbNeg = 0;
      for (let i = 1; i < bps.length; i++) if (bps[i] > lo + 1e-6 && bps[i - 1] < hi - 1e-6) lbNeg = Math.max(lbNeg, bps[i] - bps[i - 1]);
      lbNeg = Math.max(lbNeg, seg);
    }
    return { L: r4(L), KLx: r4(seg), KLy: r4(seg), Lb: r4(seg), LbNeg: r4(lbNeg) };
  }

  // ---------------- แผนภาพโมเมนต์ตามแนวชิ้น (M6 ก้อน 3b · Earth 28 พ.ย.: Lb ปีกล่าง = จุดรองรับ→จุดดัดกลับ + Cb จริง) ----------------
  // เครื่องหมาย SAP (ตรวจจากผล ท12): dM3/dx = −V2 · dV2/dx = −w2 · M3 บวก = ท้องช้าง (ปีกบนรับแรงอัด) เมื่อแกน 2 ชี้ขึ้น
  const E_SAP = 2.04e6;   // ksc — ค่าที่ sap_export ส่งให้ SAP (ใช้คิดการโก่งกลางช่วงให้สอดคล้องกับการเคลื่อนที่จาก SAP)
  /** ช่วงของชิ้น (ระหว่างจุดต่อ) ในชุดเดียว → [{s0, s1, ja, jb, Ma, Va, Mb, Vb, q}] ตามสถานีของชิ้นเอง (q = dV2/dx = แรงแผ่ลง กก./ม.) */
  function memberSegs(G, R, id, c) {
    const rows = ((R.steel_combo || {})[id] || {})[c];
    const P = G.pts[id];
    if (!rows || !P || P.length < 2) return [];
    const at = st => rows.filter(r => Math.abs(r[0] - st) < 2e-3);
    const out = [];
    for (let k = 1; k < P.length; k++) {
      const a = at(P[k - 1].s), b = at(P[k].s), L = P[k].s - P[k - 1].s;
      if (!a.length || !b.length || L < 1e-6) continue;
      const ra = a[a.length - 1], rb = b[0];   // ต้นช่วง = แถวหลังที่สถานีนั้น · ปลายช่วง = แถวแรก
      out.push({ s0: P[k - 1].s, s1: P[k].s, ja: P[k - 1].j, jb: P[k].j, Ma: ra[6], Va: ra[2], Mb: rb[6], Vb: rb[2], q: (rb[2] - ra[2]) / L });
    }
    return out;
  }
  const Mseg = (g, x) => g.Ma - g.Va * x - g.q * x * x / 2;   // x จากต้นช่วง (ม.)
  /** แผนภาพโมเมนต์ทั้งแนวในชุด c → [{lo, hi, A, sg, f(s)}] ตามพิกัดแนว s */
  function lineDiagram(G, R, line, c) {
    const out = [];
    for (const id of line.ids) {
      const s0 = dot(sub(G.ends[id][0], G.xyz[line.a]), line.d), sg = dot(unit(sub(G.ends[id][1], G.ends[id][0])), line.d) > 0 ? 1 : -1;
      for (const g of memberSegs(G, R, id, c)) {
        const A = s0 + sg * g.s0, B = s0 + sg * g.s1;
        out.push({ id, lo: Math.min(A, B), hi: Math.max(A, B), A, sg, f: s => Mseg(g, sg * (s - A)), g });
      }
    }
    return out.sort((a, b) => a.lo - b.lo);
  }
  /** จุดโมเมนต์เป็นศูนย์ในแนว (ม.) */
  function zeros(diag) {
    const Z = [];
    for (const d of diag) {
      const g = d.g, L = g.s1 - g.s0, a = -g.q / 2, b = -g.Va, cc = g.Ma, xs = [];
      if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) xs.push(-cc / b); }
      else { const D = b * b - 4 * a * cc; if (D >= 0) xs.push((-b + Math.sqrt(D)) / (2 * a), (-b - Math.sqrt(D)) / (2 * a)); }
      for (const x of xs) if (x > 1e-6 && x < L - 1e-6) Z.push(d.A + d.sg * x);
    }
    return Z;
  }
  /** Lb, Cb ที่ตำแหน่ง s (แนว) — braces: จุดค้ำของปีกนั้น · neg: ปีกล่าง (เพิ่มจุดดัดกลับ) · freeEnds: ปลายแนวที่ไม่ใช่จุดรองรับ (ช่วงยื่น Cb = 1) */
  function zoneAt(diag, s, braces, neg, freeEnds) {
    const val = t => { const d = diag.find(e => t >= e.lo - 1e-9 && t <= e.hi + 1e-9); return d ? d.f(t) : 0; };
    const pts = braces.slice();
    if (neg) zeros(diag).forEach(z => pts.push(z));
    pts.sort((a, b) => a - b);
    let lo = -Infinity, hi = Infinity;
    for (const p of pts) { if (p <= s + 1e-6) lo = p; else { hi = p; break; } }
    if (!isFinite(lo) || !isFinite(hi)) return null;
    const Lb = hi - lo, free = freeEnds.some(e => Math.abs(e - lo) < 1e-6 || Math.abs(e - hi) < 1e-6);
    let mmax = 0; for (let k = 1; k < 10; k++) mmax = Math.max(mmax, Math.abs(val(lo + Lb * k / 10)));
    const Ma = val(lo + 1e-6), Mb = val(hi - 1e-6);
    let cb = 1;
    if (!free && Math.max(Math.abs(Ma), Math.abs(Mb)) >= mmax - 1e-9) {
      const big = Math.abs(Ma) >= Math.abs(Mb) ? Ma : Mb, small = big === Ma ? Mb : Ma;
      const r = Math.abs(big) < 1e-9 ? 0 : (small * big >= 0 ? -1 : 1) * Math.abs(small) / Math.abs(big);   // ดัดทางเดียว = ลบ
      cb = Math.min(2.3, 1.75 + 1.05 * r + 0.3 * r * r);
    }
    return { Lb, cb, lo, hi, free };
  }

  /** การโก่งตัวของแนวชิ้นทุกชุด → [{ids, from, to, span, cant, worst:{ratio, d, allow, combo, j}}]
   * จุดวัด = จุดต่อใน SAP + กึ่งกลางทุกช่วงระหว่างจุดต่อ (การเคลื่อนที่เฉลี่ยของปลายช่วง + การโก่งในช่วง
   *   5qL⁴/384EI + (Ma+Mb)L²/16EI จากแรงที่ปลายช่วงใน SAP — แปไม่มีจุดต่อระหว่างจันทัน จึงต้องใช้ส่วนนี้) · Ix: {id: ซม.⁴} */
  function deflection(G, line, R, n, Ix = {}) {
    const disp = R.displacements || {}, combos = R.cases_used || [];
    const S = supportsOf(G, line);
    if (!S.length || Math.abs(line.d[2]) > 0.95) return [];
    const nrm = unit(sub([0, 0, 1], line.d.map(v => v * line.d[2])));   // ตั้งฉากแนวชิ้นในระนาบดิ่ง (≈ แกน 2 ของ SAP)
    const spans = [];
    const first = S[0], last = S[S.length - 1], e0 = line.pts[0].s, e1 = line.pts[line.pts.length - 1].s;
    if (e0 < first.s - 1e-6) spans.push({ a: null, b: first, cant: true });
    for (let i = 1; i < S.length; i++) spans.push({ a: S[i - 1], b: S[i] });
    if (e1 > last.s + 1e-6) spans.push({ a: last, b: null, cant: true });
    const res = spans.map(() => null);
    for (const c of combos) {
      const P = line.pts.filter(p => disp[p.j] && disp[p.j][c]).map(p => ({ j: p.j, s: p.s, u: disp[p.j][c] }));
      for (const id of line.ids) {     // กึ่งกลางช่วงระหว่างจุดต่อ
        const I = Ix[id]; if (!I) continue;
        const s0 = dot(sub(G.ends[id][0], G.xyz[line.a]), line.d), sg = dot(unit(sub(G.ends[id][1], G.ends[id][0])), line.d) > 0 ? 1 : -1;
        for (const g of memberSegs(G, R, id, c)) {
          const L = g.s1 - g.s0, ua = disp[g.ja] && disp[g.ja][c], ub = disp[g.jb] && disp[g.jb][c];
          if (L < 0.1 || !ua || !ub) continue;
          const Lc = L * 100, down = (5 * (g.q / 100) * Lc ** 4 / 384 + (g.Ma + g.Mb) * 100 * Lc * Lc / 16) / (E_SAP * I);   // ซม.
          P.push({ j: g.ja + '~' + g.jb, s: s0 + sg * (g.s0 + g.s1) / 2, mid: true, u: ua.map((v, k) => (v + ub[k]) / 2 - nrm[k] * down / 100) });
        }
      }
      spans.forEach((sp, k) => {
        const lo = sp.a ? sp.a.s : e0, hi = sp.b ? sp.b.s : e1;
        if (hi - lo < MIN_SPAN) return;   // ปลายเกินจุดรองรับไม่กี่ ซม. (เช่น แปเลยจันทันตัวริม 3.7 ซม.) — ไม่ตรวจ
        const ua = sp.a && disp[sp.a.j] && disp[sp.a.j][c], ub = sp.b && disp[sp.b.j] && disp[sp.b.j][c];
        if ((sp.a && !ua) || (sp.b && !ub)) return;
        const Ls = hi - lo, allow = (sp.cant ? 2 : 1) * Ls * 100 / n;
        for (const p of P) {
          const inside = sp.cant ? (sp.a ? p.s > lo + 1e-6 : p.s < hi - 1e-6) : (p.s > lo + 1e-6 && p.s < hi - 1e-6);
          if (!inside) continue;
          let ref;
          if (sp.cant) ref = ua || ub;
          else { const t = (p.s - lo) / Ls; ref = ua.map((v, q) => v + (ub[q] - v) * t); }
          const dd = Math.abs(dot(sub(p.u, ref), nrm)) * 100;   // ซม.
          if (!res[k] || dd / allow > res[k].ratio) res[k] = { ratio: r4(dd / allow), d: r4(dd), allow: r4(allow), combo: c, j: p.j, mid: !!p.mid };
        }
      });
    }
    const out = [];
    spans.forEach((sp, k) => {
      if (!res[k]) return;
      const lo = sp.a ? sp.a.s : e0, hi = sp.b ? sp.b.s : e1;
      const ids = line.ids.filter(id => { const s0 = dot(sub(G.ends[id][0], G.xyz[line.a]), line.d), s1 = dot(sub(G.ends[id][1], G.xyz[line.a]), line.d); return Math.max(s0, s1) > lo + 1e-6 && Math.min(s0, s1) < hi - 1e-6; });
      out.push({ ids, from: sp.a && sp.a.j, to: sp.b && sp.b.j, span: r4(hi - lo), cant: !!sp.cant, worst: res[k] });
    });
    return out;
  }

  /** แถวแรงของชิ้น (SAP M3 = แกน x ของหน้าตัดที่วางตาม SAP แล้ว) → รายการสำหรับ SteelASD.checkAll
   * Lb/Cb รายแถว: M3 ≥ 0 (ปีกบนรับแรงอัด) ช่วงระหว่างจุดต่อ · M3 < 0 (ปีกล่าง) ช่วงระหว่างจุดรองรับ/จุดดัดกลับ — Cb จากแผนภาพโมเมนต์
   * ค่าที่ผู้ใช้แก้ (o.Lb / o.LbNeg) ใช้แทนเสมอ (Cb = 1) */
  function forceList(G, R, x, line, br, o) {
    const sc = (R.steel_combo || {})[x.id] || {}, out = [];
    const zoned = line && (LIGHT[x.type] || []).length && Math.abs(line.d[2]) < 0.95;
    let topB = [], botB = [], free = [], s0 = 0, sg = 1;
    if (zoned) {
      topB = line.pts.map(p => p.s);
      const S = supportsOf(G, line).map(p => p.s);
      const e0 = line.pts[0].s, e1 = line.pts[line.pts.length - 1].s;
      botB = [...new Set([e0, ...S, e1])];
      free = [e0, e1].filter(e => !S.some(v => Math.abs(v - e) < 1e-6));
      s0 = dot(sub(G.ends[x.id][0], G.xyz[line.a]), line.d); sg = dot(unit(sub(G.ends[x.id][1], G.ends[x.id][0])), line.d) > 0 ? 1 : -1;
    }
    for (const [c, rows] of Object.entries(sc)) {
      const diag = zoned ? lineDiagram(G, R, line, c) : null;
      for (const r of rows) {
        const [st, P, V2, V3, T, M2, M3] = r, neg = M3 < 0;
        const user = neg ? o.LbNeg : o.Lb;
        let Lb = neg ? br.LbNeg : br.Lb, cb = 1, how = 'ค่าตั้งต้น';
        if (user != null) { Lb = user; how = 'กำหนดเอง'; }
        else if (diag && diag.length) {
          const z = zoneAt(diag, s0 + sg * st, neg ? botB : topB, neg, free);
          if (z) { Lb = z.Lb; cb = z.cb; how = neg ? (z.free ? 'ปีกล่าง ช่วงยื่น' : 'ปีกล่าง จุดรองรับ↔จุดดัดกลับ') : 'ปีกบน ระหว่างจุดต่อ'; }
        }
        out.push({ combo: c, st, P, V2, V3, T, Mx: M3, My: M2, opt: { Lb: r4(Lb), cb: r4(cb), LbHow: how } });
      }
    }
    return out;
  }

  /** ตรวจชิ้น (ผลจาก analyze) ด้วยหน้าตัดอื่น name — แรงชุดเดิม (e.fl) วางแกนตามหน้าตัดในโมเดล (วางแบนก็วางแบน)
   * การโก่งตัวปรับตาม Ix ของหน้าตัดในโมเดล · ใช้เสนอหน้าตัดและจัดกลุ่มชนิด → {ok, ratio, res, dRatio, q} */
  function trySec(e, name) {
    const q = memberSection({ sections: [{ id: name, h: e.sd && e.sd.h, b: e.sd && e.sd.b }] }, { section: name });
    if (!q || !e.fl || !e.fl.length) return { ok: false, ratio: Infinity, res: null, dRatio: 0, q };
    const res = ASD.checkAll(q, e.fl, e.opt);
    const d0 = e.defl ? e.defl.worst.ratio / (e.defl.scaled || 1) : 0, dRatio = d0 && e.Ix0 ? r4(d0 * e.Ix0 / q.Ix) : 0;
    return { ok: res.ok && dRatio <= 1 + 1e-9, ratio: Math.max(res.ratio, dRatio), res, dRatio, q };
  }

  /**
   * ตรวจทั้งโมเดล
   * opt: {mat (เกรด/{Fy}), n (การโก่งตัว L/n = 240), byType: {type: {Lb, LbNeg, KLx, KLy, Cmx, slend…}}, over: {id: {...เหมือนกัน, sec}}, suggest (true), sameShape (false)}
   * คืน {members: [{id, type, typeTh, mark, sec, p, br, res, worst, sug, defl}], lines, warn}
   */
  function analyze(m, opt = {}) {
    const R = m.results || {}, n = +opt.n || 240, warn = [];
    if (!R.steel_combo) warn.push('ผล SAP ไม่มีแรงรายชุดของชิ้นเหล็ก (steel_combo) — อ่านผลใหม่ด้วย tools/sap_results.py รุ่น M6');
    const G = prepare(m);
    const L = lines(G, STEEL);
    const lineOf = {}; L.forEach(l => l.ids.forEach(id => { lineOf[id] = l; }));
    const Ix = {};
    G.mem.forEach(x => { if (STEEL.includes(x.type)) { const p = memberSection(m, x); if (p) Ix[x.id] = p.Ix; } });
    const dl = []; L.filter(l => DEFL.includes(l.type)).forEach(l => deflection(G, l, R, n, Ix).forEach(d => dl.push(Object.assign({ type: l.type }, d))));
    const out = [];
    for (const x of G.mem) {
      if (!STEEL.includes(x.type)) continue;
      const ov = Object.assign({}, (opt.byType || {})[x.type] || {}, (opt.over || {})[x.id] || {});
      const secName = ov.sec || x.section;
      const p = memberSection(m, Object.assign({}, x, { section: secName }));
      const br = bracing(G, x, lineOf[x.id]);
      const e = { id: x.id, type: x.type, typeTh: TYPE_TH[x.type] || x.type, mark: x.mark || '', sec: secName, p, br, ov };
      const o = { mat: opt.mat, Lx: ov.KLx != null ? +ov.KLx : br.KLx, Ly: ov.KLy != null ? +ov.KLy : br.KLy, Cmx: ov.Cmx, Cmy: ov.Cmy,
        slendComp: ov.slendComp, slendTen: ov.slendTen || (x.type === 'brace' || x.type === 'sag_rod' ? 300 : 240) };
      const lbo = { Lb: ov.Lb != null ? +ov.Lb : undefined, LbNeg: ov.LbNeg != null ? +ov.LbNeg : undefined };
      e.opt = o; e.lbo = lbo;
      // การโก่งตัวจาก SAP เป็นของหน้าตัดในโมเดล — แก้หน้าตัดแล้วปรับตาม Ix (ประมาณ — น้ำหนักตัวเองต่างเล็กน้อย)
      const sd = (m.sections || []).find(s => s.id === x.section) || {};
      e.sd = { h: sd.h || (sd.dims && sd.dims.h), b: sd.b || (sd.dims && sd.dims.b) }; e.Ix0 = Ix[x.id];
      const d0 = dl.filter(d => d.ids.includes(x.id)).reduce((a, d) => (!a || d.worst.ratio > a.worst.ratio ? d : a), null);
      e.defl = d0 && p && e.Ix0 && Math.abs(p.Ix - e.Ix0) > 1e-9 ? Object.assign({}, d0, { scaled: r4(e.Ix0 / p.Ix), worst: Object.assign({}, d0.worst, { ratio: r4(d0.worst.ratio * e.Ix0 / p.Ix), d: r4(d0.worst.d * e.Ix0 / p.Ix) }) }) : d0;
      if (!p) { e.res = { ok: false, ratio: Infinity, worst: { warn: [`อ่านหน้าตัด "${secName}" ไม่ได้`] } }; out.push(e); continue; }
      const fl = forceList(G, R, x, lineOf[x.id], br, lbo);
      e.fl = fl;
      if (!fl.length) { e.res = null; out.push(e); continue; }
      e.res = ASD.checkAll(p, fl, o);
      e.ratio = Math.max(e.res.ratio, e.defl ? e.defl.worst.ratio : 0);
      e.ok = e.res.ok && (!e.defl || e.defl.worst.ratio <= 1 + 1e-9);
      if (opt.suggest !== false) {
        const famList = Sec.family(p.fam, opt.sameShape ? { sameShape: { H: p.flat ? p.B : p.H, B: p.flat ? p.H : p.B } } : {});
        // หน้าตัดปัจจุบันที่ไม่มีในตาราง (คำนวณผนังบาง เช่น BOX38x38x1.6) ต้องอยู่ในรายการด้วย — ไม่งั้นอาจเสนอตัวที่หนักกว่าทั้งที่ตัวเดิมผ่าน
        if (!famList.some(c => c.name === p.name)) { famList.push(p); famList.sort((a, b) => a.w - b.w || a.A - b.A); }
        e.sug = null;
        for (const c of famList) {
          const r = trySec(e, c.name);
          if (r.ok) { e.sug = { name: c.name, w: r4(c.w), ratio: r.ratio, combo: r.res.combo, lighter: c.w < p.w - 1e-9 }; break; }
        }
      }
      out.push(e);
    }
    return { members: out, lines: L.map(l => ({ type: l.type, ids: l.ids })), defl: dl, warn };
  }

  return { _lineDiagram: lineDiagram, _dot: dot, _sub: sub, _unit: unit, zones: zeros, STEEL, TYPE_TH, LIGHT, memberSection, trySec, prepare, lines, supportsOf, bracing, deflection, analyze };
});
