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
    for (const x of mem) {
      const js = fj[x.id] || [x.i, x.j], a = xyz[x.i], L = len(sub(xyz[x.j], a));
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
    return { xyz, jm, pts, sup, byId: Object.fromEntries(mem.map(x => [x.id, x])), mem };
  }

  /** แนวชิ้น: ชิ้นประเภทเดียวกัน แนวเดียวกัน ต่อปลายกัน → [{ids, a (จุดเริ่ม), d (ทิศ), pts:[{j,s}]}] */
  function lines(G, types) {
    const seen = new Set(), out = [];
    const dir = x => unit(sub(G.xyz[x.j], G.xyz[x.i]));
    for (const x of G.mem) {
      if (seen.has(x.id) || !types.includes(x.type)) continue;
      const d = dir(x), ids = [x.id]; seen.add(x.id);
      let grow = true;
      while (grow) {
        grow = false;
        for (const y of G.mem) {
          if (seen.has(y.id) || y.type !== x.type || Math.abs(dot(dir(y), d)) < 0.9995) continue;
          const ends = new Set(ids.flatMap(id => [G.byId[id].i, G.byId[id].j]));
          if (ends.has(y.i) || ends.has(y.j)) { ids.push(y.id); seen.add(y.id); grow = true; }
        }
      }
      const all = ids.flatMap(id => G.pts[id].map(p => p.j));
      const a0 = all.reduce((best, j) => { const s = dot(sub(G.xyz[j], G.xyz[x.i]), d); return s < best.s ? { j, s } : best; }, { j: x.i, s: 0 }).j;
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
      const S = supportsOf(G, line).map(p => p.s), s0 = dot(sub(G.xyz[x.i], G.xyz[line.a]), line.d), s1 = dot(sub(G.xyz[x.j], G.xyz[line.a]), line.d);
      const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      const bps = [line.pts[0].s, ...S, line.pts[line.pts.length - 1].s].sort((a, b) => a - b);
      lbNeg = 0;
      for (let i = 1; i < bps.length; i++) if (bps[i] > lo + 1e-6 && bps[i - 1] < hi - 1e-6) lbNeg = Math.max(lbNeg, bps[i] - bps[i - 1]);
      lbNeg = Math.max(lbNeg, seg);
    }
    return { L: r4(L), KLx: r4(seg), KLy: r4(seg), Lb: r4(seg), LbNeg: r4(lbNeg) };
  }

  /** การโก่งตัวของแนวชิ้นทุกชุด → [{ids, from, to, span, cant, worst:{ratio, d, allow, combo, j}}] */
  function deflection(G, line, R, n) {
    const disp = R.displacements || {}, combos = R.cases_used || [];
    const S = supportsOf(G, line);
    if (!S.length || Math.abs(line.d[2]) > 0.95) return [];
    const nrm = unit(sub([0, 0, 1], line.d.map(v => v * line.d[2])));   // ตั้งฉากแนวชิ้นในระนาบดิ่ง
    const spans = [];
    const first = S[0], last = S[S.length - 1];
    if (line.pts[0].s < first.s - 1e-6) spans.push({ a: null, b: first, cant: true });
    for (let i = 1; i < S.length; i++) spans.push({ a: S[i - 1], b: S[i] });
    if (line.pts[line.pts.length - 1].s > last.s + 1e-6) spans.push({ a: last, b: null, cant: true });
    const out = [];
    for (const sp of spans) {
      const lo = sp.a ? sp.a.s : line.pts[0].s, hi = sp.b ? sp.b.s : line.pts[line.pts.length - 1].s;
      if (hi - lo < MIN_SPAN) continue;   // ปลายเกินจุดรองรับไม่กี่ ซม. (เช่น แปเลยจันทันตัวริม 3.7 ซม.) — ไม่ตรวจ
      const inner = line.pts.filter(p => p.s > lo + 1e-6 && p.s < hi - 1e-6 || (sp.cant && (sp.a ? p.s >= hi - 1e-6 : p.s <= lo + 1e-6)));
      const Ls = hi - lo, allow = (sp.cant ? 2 : 1) * Ls * 100 / n;
      let worst = null;
      for (const c of combos) {
        const ua = sp.a && disp[sp.a.j] && disp[sp.a.j][c], ub = sp.b && disp[sp.b.j] && disp[sp.b.j][c];
        if ((sp.a && !ua) || (sp.b && !ub)) continue;
        for (const p of inner) {
          const u = disp[p.j] && disp[p.j][c]; if (!u) continue;
          let ref;
          if (sp.cant) ref = (ua || ub);
          else { const t = (p.s - lo) / Ls; ref = ua.map((v, k) => v + (ub[k] - v) * t); }
          const dd = Math.abs(dot(sub(u, ref), nrm)) * 100;   // ซม.
          if (!worst || dd / allow > worst.ratio) worst = { ratio: r4(dd / allow), d: r4(dd), allow: r4(allow), combo: c, j: p.j };
        }
      }
      const ids = line.ids.filter(id => { const x = G.byId[id], s0 = dot(sub(G.xyz[x.i], G.xyz[line.a]), line.d), s1 = dot(sub(G.xyz[x.j], G.xyz[line.a]), line.d); return Math.max(s0, s1) > lo + 1e-6 && Math.min(s0, s1) < hi - 1e-6; });
      if (worst) out.push({ ids, from: sp.a && sp.a.j, to: sp.b && sp.b.j, span: r4(Ls), cant: !!sp.cant, worst });
    }
    return out;
  }

  /** แถวแรงของชิ้น (SAP M3 = แกน x ของหน้าตัดที่วางตาม SAP แล้ว) → รายการสำหรับ SteelASD.checkAll */
  function forceList(R, id, br, o) {
    const sc = (R.steel_combo || {})[id] || {}, out = [];
    for (const [c, rows] of Object.entries(sc)) for (const r of rows) {
      const [st, P, V2, V3, T, M2, M3] = r;
      out.push({ combo: c, st, P, V2, V3, T, Mx: M3, My: M2, opt: { Lb: M3 < 0 ? (o.LbNeg != null ? o.LbNeg : br.LbNeg) : (o.Lb != null ? o.Lb : br.Lb) } });
    }
    return out;
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
    const dl = []; L.filter(l => DEFL.includes(l.type)).forEach(l => deflection(G, l, R, n).forEach(d => dl.push(Object.assign({ type: l.type }, d))));
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
      e.defl = dl.filter(d => d.ids.includes(x.id)).reduce((a, d) => (!a || d.worst.ratio > a.worst.ratio ? d : a), null);
      if (!p) { e.res = { ok: false, ratio: Infinity, worst: { warn: [`อ่านหน้าตัด "${secName}" ไม่ได้`] } }; out.push(e); continue; }
      const fl = forceList(R, x.id, br, lbo);
      if (!fl.length) { e.res = null; out.push(e); continue; }
      e.res = ASD.checkAll(p, fl, o);
      e.ratio = Math.max(e.res.ratio, e.defl ? e.defl.worst.ratio : 0);
      e.ok = e.res.ok && (!e.defl || e.defl.worst.ratio <= 1 + 1e-9);
      if (opt.suggest !== false) {
        const famList = Sec.family(p.fam, opt.sameShape ? { sameShape: { H: p.flat ? p.B : p.H, B: p.flat ? p.H : p.B } } : {});
        e.sug = null;
        for (const c of famList) {
          const q = p.flat ? memberSection({ sections: [{ id: c.name, h: (m.sections.find(s => s.id === x.section) || {}).h, b: (m.sections.find(s => s.id === x.section) || {}).b }] }, { section: c.name }) || c : c;
          const r = ASD.checkAll(q, fl, o);
          const dOK = !e.defl || e.defl.worst.ratio * (p.Ix / q.Ix) <= 1 + 1e-9;   // การโก่งตัวแปรผกผันกับ I (ประมาณ — น้ำหนักตัวเองต่างเล็กน้อย)
          if (r.ok && dOK) { e.sug = { name: c.name, w: r4(c.w), ratio: r.ratio, combo: r.combo, lighter: c.w < p.w - 1e-9 }; break; }
        }
      }
      out.push(e);
    }
    return { members: out, lines: L.map(l => ({ type: l.type, ids: l.ids })), defl: dl, warn };
  }

  return { STEEL, TYPE_TH, LIGHT, memberSection, prepare, lines, supportsOf, bracing, deflection, analyze };
});
