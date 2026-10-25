/*! rebartk.js — ถอดปริมาณเหล็กเสริม (หมวด 1.1.9) ในเว็บ ด้วยวิธีเดียวกับ tools/takeoff.py ทุกบรรทัด
 * ใช้หลังเขียนผลออกแบบลง design ของโมเดล เพื่อให้ ปร.1 อัปเดตทันทีโดยไม่ต้องรัน Python
 * ส่วนที่คิด: ฐานราก (bars_x/bars_y/bands/rings) · บันได · เพลทและสลัก (1.1.10) · เข็ม (1.1.5) · เสา (main/stirrup) · คาน (top/bot/side/extra/stirrup) · พื้น (mesh/wire_mesh) · ลวดผูกเหล็ก
 * ชุดทดสอบ tools/test_rebartk.js เทียบผลกับ takeoff.py แถวต่อแถว
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RebarTk = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GROUP = '1.1.9', GROUP_NAME = 'งานเหล็กเสริมคอนกรีต';
  const GROUP_ORDER = ['1.1.0', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.7', '1.1.9', '1.1.10', '1.1.12', '1.1.16', '1.1.19', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.3', '1.4'];
  const REBAR_WASTE = { 6: 0.05, 9: 0.07, 10: 0.07, 12: 0.09, 15: 0.11, 16: 0.11, 19: 0.13, 20: 0.13, 22: 0.15, 25: 0.15, 28: 0.15, 32: 0.15 };
  const RB_SIZES = new Set([6, 9]);
  const DEF = { cover: 0.025, tie_wire_per_ton: 30.0, excav_deep: 2.0 };
  const SRC = 'tools/takeoff.py (หลักเกณฑ์อาคาร 2569)';
  const kgm = d => d * d / 162.0;
  const r2 = x => Math.sign(x) * Math.floor(Math.abs(x) * 100 + 0.5 + 1e-9) / 100;   // = takeoff.r2
  const rnd4 = x => +x.toFixed(4);
  const g = x => String(parseFloat((+x).toPrecision(6)));   // Python "{:g}"
  const f2 = x => (+x).toFixed(2);
  const pyRound = x => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
  const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const polyArea = P => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  const levelOf = (levels, z) => { let lv = '?', bd = Infinity; for (const [k, zz] of levels) { const d = Math.abs(zz - z); if (d < bd) { bd = d; lv = k; } } return lv; };
  /** ส่วนของบันได (= takeoff.py _stairs): ช่วงพื้นเอียงตามลำดับ แล้วชานพัก (จากโมเดล หรือ design.stairs[ช่วง].landing ถ้าโมเดลไม่มี) */
  function stairParts(sx, design, levels) {
    const fl = sx.flights || [], dz = design.stairs || {}, out = [];
    const fids = fl.map((f, k) => fl.length === 1 ? sx.id : `${sx.id}#${k + 1}`);
    fl.forEach((f, k) => {
      const d = dz[fids[k]] || {}, W = f.width, H = f.top - f.bottom, Lh = f.risers * f.going, Li = Math.hypot(Lh, H);
      out.push({ kind: 'flight', fid: fids[k], d, W, H, Lh, Li, n: f.risers, t: d.waist || f.waist || 0.15, lt: 'lift:' + levelOf(levels, f.top) });
    });
    const L0 = sx.landings || [];
    L0.forEach((ld, j) => {
      const [x1, y1, x2, y2] = ld.rect, dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      let k = fl.findIndex(f => Math.abs(f.top - ld.top) <= 0.02); if (k < 0) k = fl.findIndex(f => Math.abs(f.bottom - ld.top) <= 0.02);
      const xdir = k >= 0 && ['+X', '-X'].includes(fl[k].dir);
      out.push({ kind: 'landing', lbl: `ชานพัก ${j + 1}`, d: k >= 0 ? (dz[fids[k]] || {}) : {}, al: xdir ? dx : dy, wd: xdir ? dy : dx, t: ld.t, lt: 'lift:' + levelOf(levels, ld.top) });
    });
    if (!L0.length) fl.forEach((f, k) => { const ln = (dz[fids[k]] || {}).landing; if (ln) out.push({ kind: 'landing', lbl: `ชานพัก ${fids[k]}`, d: dz[fids[k]] || {}, al: ln[0], wd: ln[1], t: ln[2], lt: 'lift:' + levelOf(levels, f.top) }); });
    return out;
  }
  function compute(m) {
    const st = Object.assign({}, DEF, ((m.quantities || {}).settings) || {});
    const nodes = Object.fromEntries((m.nodes || []).map(n => [n.id, n])), secs = Object.fromEntries((m.sections || []).map(s => [s.id, s]));
    const levels = new Map(); (m.levels || []).forEach(l => levels.set(l.name, l.z));
    const GL = levels.has('GL') ? levels.get('GL') : 0.0, design = m.design || {};
    const rebarLen = new Map(), rebarCalc = new Map(), srcTask = new Map(), items = new Map();
    const rebarOf = (part, id) => (((design[part] || {})[id]) || {}).rebar || {};
    const geom = x => { const a = nodes[x.i], b = nodes[x.j]; return [[a.x, a.y, a.z], [b.x, b.y, b.z]]; };
    const lift = x => {
      let lv = x.level;
      if (!lv) {
        const a = nodes[x.i], b = nodes[x.j], n = b.z > a.z ? b : a;
        lv = n.level;
        if (!lv) { let best = null, bd = Infinity; for (const [k, z] of levels) { const d = Math.abs(z - n.z); if (d < bd) { bd = d; best = k; } } lv = best === null ? '?' : best; }
      }
      return 'lift:' + lv;
    };
    const setTask = (src, task) => { if (src && task && !srcTask.has(src)) srcTask.set(src, task); };
    const rebar = (mid, dia, length, calc) => {
      if (!(length > 0)) return;
      const d = pyRound(dia);
      if (!rebarLen.has(d)) rebarLen.set(d, new Map());
      const per = rebarLen.get(d); per.set(mid, (per.get(mid) || 0) + length);
      if (calc) { const k = d + '|' + mid; if (!rebarCalc.has(k)) rebarCalc.set(k, []); rebarCalc.get(k).push(calc); }
    };
    const add = (key, name, unit, qty, src, task, note) => {
      let it = items.get(key);
      if (!it) items.set(key, it = { key, name, unit, qty_net: 0, waste: 0, from: [], task, note, parts: new Map(), by_src: new Map() });
      it.qty_net += qty;
      if (src && !it.from.includes(src)) it.from.push(src);
      if (src) it.by_src.set(src, (it.by_src.get(src) || 0) + qty);
      const t = task || 'other'; if (!it.parts.has(t)) it.parts.set(t, { q: 0, from: [] });
      const pt = it.parts.get(t); pt.q += qty; if (src && !pt.from.includes(src)) pt.from.push(src);
      setTask(src, task);
      return it;
    };
    // ฐานราก
    const columns = (m.members || []).filter(x => x.type === 'column'), colAt = new Map();
    const ck = (x, y) => Math.round(x * 1000) / 1000 + ',' + Math.round(y * 1000) / 1000;
    columns.forEach(c => { const [p] = geom(c), k = ck(p[0], p[1]); if (!colAt.has(k)) colAt.set(k, []); colAt.get(k).push(c); });
    const c = st.cover;
    for (const f of m.supports || []) {
      if (!['spread', 'pile_cap'].includes(f.kind)) continue;
      if (GL - f.bottom <= 0) continue;
      setTask(f.id, 'footing');
      const rb = rebarOf('supports', f.id);
      const bu = rb.bend_up || 0, bt = bu ? ` + หักขึ้น 2×${g(bu)}` : '';   // ปลายตะแกรงหักขึ้นสองด้าน
      if (rb.bars_x) { const [n, dia] = rb.bars_x; rebar(f.id, dia, n * (f.b - 2 * c + 2 * bu), bu ? `แนว x ${n} เส้น × (${f2(f.b - 2 * c)}${bt}) ม.` : `แนว x ${n} เส้น × ${f2(f.b - 2 * c)} ม.`); }
      if (rb.bars_y) { const [n, dia] = rb.bars_y; rebar(f.id, dia, n * (f.d - 2 * c + 2 * bu), bu ? `แนว y ${n} เส้น × (${f2(f.d - 2 * c)}${bt}) ม.` : `แนว y ${n} เส้น × ${f2(f.d - 2 * c)} ม.`); }
      if (rb.dowel) { const [n, dia, ln] = rb.dowel; rebar(f.id, dia, n * ln, `เหล็กเดือย ${g(n)} เส้น × ${f2(ln)} ม.`); }
      if (rb.rings) { const k = Math.trunc(rb.rings[0]), dia = rb.rings[1], per = 2 * (f.b + f.d) - 8 * c; rebar(f.id, dia, k * per, `ปลอกรอบ ${k} วง × ${f2(per)} ม.`); }
      if (rb.bands) { const k = Math.trunc(rb.bands[0]), n = Math.trunc(rb.bands[1]), dia = rb.bands[2], ln = rb.bands[3]; rebar(f.id, dia, k * n * ln, `${k} แถบ × ${n} เส้น × ${f2(ln)} ม.`); }
    }
    // เสา
    for (const x of columns) {
      const sec = secs[x.section] || {}; if (sec.kind !== 'rc_rect') continue;
      const [p, q] = geom(x), H = Math.abs(q[2] - p[2]), b = sec.b, h = sec.h;
      setTask(x.id, lift(x));
      const rb = rebarOf('members', x.id);
      if (rb.main) { const [n, dia] = rb.main; rebar(x.id, dia, n * H, `เหล็กยืน ${n} เส้น × ${f2(H)} ม.`); }
      if (rb.stirrup) {
        const dia = rb.stirrup[0], sp = rb.stirrup[1], cnt = Math.floor(H / sp) + 1, per = 2 * (b + h) - 8 * c;
        rebar(x.id, dia, cnt * per * (rb.double_stirrup ? 2 : 1), `ปลอก @${g(sp)} ${cnt} วง × ${f2(per)} ม.`);
      }
    }
    // คาน
    const colHalf = (xy, u) => {
      let best = 0.0;
      for (const cc of colAt.get(ck(xy[0], xy[1])) || []) { const s = secs[cc.section] || {}; if (s.kind === 'rc_rect') best = Math.max(best, Math.abs(u[0]) * s.b / 2 + Math.abs(u[1]) * s.h / 2); }
      return best;
    };
    for (const x of m.members || []) {
      if (!['beam', 'tie_beam', 'lintel'].includes(x.type)) continue;
      const sec = secs[x.section] || {}; if (sec.kind !== 'rc_rect') continue;
      const [p, q] = geom(x), Lc = dist(p, q); if (Lc < 1e-6) continue;
      const u = [(q[0] - p[0]) / Lc, (q[1] - p[1]) / Lc], Ln = Math.max(Lc - colHalf(p, u) - colHalf(q, u), 0), b = sec.b, h = sec.h;
      setTask(x.id, lift(x));
      const rb = rebarOf('members', x.id), TH = { top: 'บน', bot: 'ล่าง', side: 'ข้าง' };
      for (const k of ['top', 'bot', 'side']) if (rb[k]) { const [n, dia] = rb[k]; rebar(x.id, dia, n * Lc, `${TH[k]} ${n} เส้น × ${f2(Lc)} ม.`); }
      if (rb.extra_top) { const [n, dia] = rb.extra_top; rebar(x.id, dia, n * 2 * Lc / 3, `เสริมบน ${n} เส้น × 2/3 ช่วง`); }
      if (rb.extra_bot) { const [n, dia] = rb.extra_bot; rebar(x.id, dia, n * 0.75 * Lc, `เสริมล่าง ${n} เส้น × 0.75 ช่วง`); }
      if (rb.stirrup) {
        const s = rb.stirrup, dia = s[0], s1 = s[1], s2 = s.length > 2 ? s[2] : s1;
        const cnt = Math.ceil((Ln / 2) / s1) + Math.ceil((Ln / 2) / s2) + 1, per = 2 * (b + h) - 8 * c;
        rebar(x.id, dia, cnt * per * (rb.double_stirrup ? 2 : 1), `ปลอก @${g(s1)}/${g(s2)} ${cnt} วง × ${f2(per)} ม.`);
      }
    }
    // พื้น
    for (const s of m.slabs || []) {
      const lt = s.level ? 'lift:' + s.level : 'slab';
      setTask(s.id, lt);   // พื้นสำเร็จรูป: เหล็กเสริม = ตะแกรงใน Topping (ถ้ามีใน design)
      const A = polyArea(s.polygon), rb = rebarOf('slabs', s.id);
      if (rb.mesh) {
        const mh = rb.mesh, dia = mh[0], sp = mh[1], layers = mh.length > 2 ? mh[2] : 1;
        const xs = s.polygon.map(v => v[0]), ys = s.polygon.map(v => v[1]), Lx = Math.max(...xs) - Math.min(...xs), Ly = Math.max(...ys) - Math.min(...ys);
        const fill = Lx * Ly ? A / (Lx * Ly) : 1;
        const L = ((Math.floor(Ly / sp) + 1) * Lx + (Math.floor(Lx / sp) + 1) * Ly) * layers * fill;
        rebar(s.id, dia, L, `ตะแกรง @${g(sp)} ${layers} ชั้น ยาวรวม ${f2(L)} ม.`);
        const bd = rb.bend;   // ปลายเหล็กงอลงที่ขอบ (ด้านของ polygon ที่ระบุ)
        if (bd && bd.sides && bd.sides.length) {
          const pg = s.polygon, nb = bd.sides.reduce((t, i) => { const p = pg[i], q = pg[(i + 1) % pg.length]; return t + Math.floor(Math.hypot(q[0] - p[0], q[1] - p[1]) / sp) + 1; }, 0) * layers;
          rebar(s.id, dia, nb * bd.L, `ปลายงอ ${nb} ปลาย × ${g(bd.L)} ม.`);
        }
      } else if (rb.mesh_xy) {
        const mx = rb.mesh_xy, layers = mx.layers || 1;
        const xs = s.polygon.map(v => v[0]), ys = s.polygon.map(v => v[1]), Lx = Math.max(...xs) - Math.min(...xs), Ly = Math.max(...ys) - Math.min(...ys);
        const fill = Lx * Ly ? A / (Lx * Ly) : 1;
        if (mx.x) { const [dia, sp] = mx.x, n = Math.floor(Ly / sp) + 1, L = n * Lx * layers * fill; rebar(s.id, dia, L, `แนว x @${g(sp)} ${n} เส้น × ${f2(Lx)} ม. = ${f2(L)} ม.`); }
        if (mx.y) { const [dia, sp] = mx.y, n = Math.floor(Lx / sp) + 1, L = n * Ly * layers * fill; rebar(s.id, dia, L, `แนว y @${g(sp)} ${n} เส้น × ${f2(Ly)} ม. = ${f2(L)} ม.`); }
      } else if (rb.wire_mesh) add(`wiremesh_${rb.wire_mesh}`, `ตะแกรงเหล็กสำเร็จรูป ${rb.wire_mesh}`, 'ตร.ม.', A, s.id, lt);
    }
    // บันได (= _stairs ส่วนเหล็ก: ช่วงพื้นเอียง + ชานพักต่อเนื่องจากช่วง)
    for (const sx of m.stairs || []) for (const e of stairParts(sx, design, levels)) {
      setTask(sx.id, e.lt);
      const d = e.d || {};
      if (e.kind === 'flight') {
        if (d.main_bar) { const [dia, sp] = d.main_bar, n = Math.floor(e.W / sp) + 1; rebar(sx.id, dia, n * e.Li, `${e.fid} เหล็กหลัก @${g(sp)} ${n} เส้น × ${f2(e.Li)} ม.`); }
        if (d.dist_bar) { const [dia, sp] = d.dist_bar, n = Math.floor(e.Li / sp) + 1; rebar(sx.id, dia, n * (e.W - 2 * c), `${e.fid} เหล็กกันร้าว @${g(sp)} ${n} เส้น × ${f2(e.W - 2 * c)} ม.`); }
      } else {
        if (d.main_bar) { const [dia, sp] = d.main_bar, n = Math.floor(e.wd / sp) + 1; rebar(sx.id, dia, n * e.al, `${e.lbl} เหล็กหลัก @${g(sp)} ${n} เส้น × ${f2(e.al)} ม.`); }
        if (d.dist_bar) { const [dia, sp] = d.dist_bar, n = Math.floor(e.al / sp) + 1; rebar(sx.id, dia, n * (e.wd - 2 * c), `${e.lbl} เหล็กกันร้าว @${g(sp)} ${n} เส้น × ${f2(e.wd - 2 * c)} ม.`); }
      }
    }
    // กำแพงกันดิน (= _retaining_walls ส่วนเหล็ก)
    for (const w of m.retaining_walls || []) {
      const L = w.length, H = w.H, tb = w.tb, B = w.B1 + w.B2, hw = H - tb, rb = w.rebar || {};
      if (rb.wall) { const [dia, sp] = rb.wall, n = Math.floor(L / sp) + 1; rebar(w.id, dia, n * (H - 2 * c), `เหล็กยืนผนัง @${g(sp)} ${n} เส้น × ${f2(H - 2 * c)} ม.`); }
      if (rb.base) { const [dia, sp] = rb.base, n = Math.floor(L / sp) + 1; rebar(w.id, dia, n * (B - 2 * c), `เหล็กฐาน @${g(sp)} ${n} เส้น × ${f2(B - 2 * c)} ม.`); }
      if (rb.temp) { const [dia, sp] = rb.temp, a = Math.floor(hw / sp) + 1, b = Math.floor(B / sp) + 1; rebar(w.id, dia, (a + b) * (L - 2 * c), `เหล็กกันร้าวตามยาว @${g(sp)} ผนัง ${a} + ฐาน ${b} เส้น × ${f2(L - 2 * c)} ม.`); }
      setTask(w.id, 'footing');
    }
    // รวมเป็นรายการ (= _rebar_items)
    let totalKg = 0; const allParts = new Map();
    for (const dia of [...rebarLen.keys()].sort((a, b) => a - b)) {
      const per = rebarLen.get(dia), L = [...per.values()].reduce((a, v) => a + v, 0), kg = L * kgm(dia);
      const w = REBAR_WASTE[dia] !== undefined ? REBAR_WASTE[dia] : 0.15, kind = RB_SIZES.has(dia) ? 'RB' : 'DB', grade = kind === 'RB' ? 'SR24' : 'SD40';
      const it = add(`rebar_${kind}${dia}`, `เหล็กเสริม ${grade} (${kind}) Ø ${dia} มม.`, 'กก.', kg, null, 'rebar', `ยาวรวม ${f2(L)} ม. × ${kgm(dia).toFixed(3)} กก./ม.`);
      it.waste = w; it.from = [...per.keys()];
      it.by_src = new Map([...per].map(([mid, ln]) => [mid, ln * kgm(dia)]));
      it.calc = Object.fromEntries([...per].map(([mid, ln]) => [mid, (rebarCalc.get(dia + '|' + mid) || []).concat([`รวม ${f2(ln)} ม. × ${kgm(dia).toFixed(3)} = ${f2(ln * kgm(dia))} กก.`])]));
      it.parts = new Map();
      for (const [mid, ln] of per) {
        const t = srcTask.get(mid) || 'rebar';
        if (!it.parts.has(t)) it.parts.set(t, { q: 0, from: [] });
        const pt = it.parts.get(t); pt.q += ln * kgm(dia); pt.from.push(mid);
        if (!allParts.has(t)) allParts.set(t, { q: 0, from: [] });
        allParts.get(t).q += ln * kgm(dia) * (1 + w);
      }
      totalKg += kg * (1 + w);
    }
    if (totalKg) {
      const f = st.tie_wire_per_ton / 1000.0;
      const it = add('tie_wire', 'ลวดผูกเหล็ก', 'กก.', totalKg * f, null, 'rebar', '30 กก. ต่อเหล็กเสริม 1,000 กก. (คิดจากน้ำหนักรวมเผื่อ)');
      it.parts = new Map([...allParts].map(([t, v]) => [t, { q: v.q * f, from: [] }]));
      const ws = new Map();
      for (const [dia, per] of rebarLen) for (const [mid, ln] of per) ws.set(mid, (ws.get(mid) || 0) + ln * kgm(dia) * (1 + (REBAR_WASTE[dia] !== undefined ? REBAR_WASTE[dia] : 0.15)) * f);
      it.by_src = ws; it.from = [...ws.keys()];
    }
    // แถวผลลัพธ์ (= Takeoff.result)
    const rows = [...items.values()].map(it => {
      const qty = r2(it.qty_net * (1 + it.waste));
      const row = { key: it.key, group_code: GROUP, group: GROUP_NAME, name: it.name, unit: it.unit, qty, qty_net: r2(it.qty_net), waste: it.waste,
        waste_included: !!it.waste, from: it.from, task: it.task, status: 'computed', src: SRC };
      if (it.note) row.note = it.note;
      const bs = Object.fromEntries([...it.by_src].filter(([, v]) => v).map(([k, v]) => [k, rnd4(v)]));
      if (Object.keys(bs).length) row.by_src = bs;
      if (it.calc && Object.keys(it.calc).length) row.calc = it.calc;
      const parts = [...it.parts], tot = parts.reduce((a, [, v]) => a + v.q, 0);
      if (tot > 0) {
        row.by_task = Object.fromEntries(parts.map((e, i) => [e, i]).sort((A, B) => (B[0][1].q - A[0][1].q) || (A[1] - B[1])).map(([[t, v]]) => [t, { share: rnd4(v.q / tot), from: v.from }]));
        row.task = Object.keys(row.by_task)[0];
      }
      return row;
    });
    return rows;
  }
  /** รายการเสาเข็ม (หมวด 1.1.5) = takeoff.py _footings ส่วน piles */
  const PILE_GROUP = '1.1.5', PILE_GROUP_NAME = 'งานเสาเข็มคอนกรีตอัดแรง';
  function boredPileItem(p) {
    const dia = +(p.size || 0), ln = +p.length;
    let name = `เสาเข็มเจาะ ขนาด ศก. ${f2(dia)} ม. ยาว ${f2(ln)} ม.`, key = `pile_bored_${g(dia)}_${g(ln)}`;
    if (p.bars) { const n = Math.trunc(p.bars[0]), d = p.bars[1]; name += ` ${n}-DB${g(d)}`; key += `_${n}DB${g(d)}`; }
    if (p.tie) { const [d, sp] = p.tie; name += ` ปลอก RB${g(d)} @ ${f2(sp)} ม.`; key += `_RB${g(d)}@${g(sp)}`; }
    if (p.dowel) { const n = Math.trunc(p.dowel[0]), d = p.dowel[1], L = p.dowel[2]; name += ` ${n}-DB${g(d)} L=${f2(L)} ม.`; key += `_${n}DB${g(d)}L${g(L)}`; }
    return { key, name };
  }
  function computePiles(m) {
    const levels = new Map(); (m.levels || []).forEach(l => levels.set(l.name, l.z));
    const GL = levels.has('GL') ? levels.get('GL') : 0.0, items = new Map();
    const add = (key, name, qty, src) => {
      let it = items.get(key); if (!it) items.set(key, it = { key, name, q: 0, from: [], by: new Map() });
      it.q += qty; if (!it.from.includes(src)) it.from.push(src); it.by.set(src, (it.by.get(src) || 0) + qty);
    };
    for (const f of m.supports || []) {
      if (!['spread', 'pile_cap'].includes(f.kind) || GL - f.bottom <= 0) continue;
      const p = f.piles; if (!p) continue;
      if (p.kind === 'bored') { const b = boredPileItem(p); add(b.key, b.name, p.n, f.id); }
      else { add(`pile_${p.type}_${g(p.length)}`, `เสาเข็ม ${p.type} ยาว ${g(p.length)} ม.`, p.n, f.id); add('pile_drive', 'งานตอกเสาเข็มคอนกรีตอัดแรง', p.n, f.id); }
      add('pile_cut', 'งานสกัดหัวเสาเข็ม', p.n, f.id);
    }
    return [...items.values()].map(it => {
      const q = it.q, qty = Math.abs(q - Math.round(q)) < 1e-6 ? Math.round(q) : Math.ceil(q - 1e-9);
      return { key: it.key, group_code: PILE_GROUP, group: PILE_GROUP_NAME, name: it.name, unit: 'ต้น', qty, qty_net: r2(q), waste: 0, waste_included: false,
        from: it.from, task: 'footing', status: 'computed', src: SRC, by_src: Object.fromEntries([...it.by].filter(([, v]) => v).map(([k, v]) => [k, rnd4(v)])),
        by_task: { footing: { share: 1, from: it.from } } };
    });
  }
  /** เพลทหัวเสาและสลักยึด (หมวด 1.1.10) = takeoff.py _plates */
  const STEEL_GROUP = '1.1.10', STEEL_GROUP_NAME = 'งานโครงสร้างเหล็กรูปพรรณ';
  function computePlates(m) {
    const items = new Map();
    const add = (key, name, unit, qty, src, count, calc) => {
      let it = items.get(key); if (!it) items.set(key, it = { key, name, unit, q: 0, from: [], by: new Map(), count, calc: {} });
      it.q += qty; if (!it.from.includes(src)) it.from.push(src); it.by.set(src, (it.by.get(src) || 0) + qty);
      if (calc) (it.calc[src] = it.calc[src] || []).push(calc);
    };
    for (const [pid, e] of Object.entries((m.design || {}).plates || {})) {
      if (e.plate) { const [B, L, t] = e.plate, kg = B * L * t * 7.85e-6; add(`plate_${g(t)}`, `เหล็กแผ่น หนา ${g(t)} มม.`, 'กก.', kg, pid, false, `${g(B)}×${g(L)}×${g(t)} มม. × 7,850 กก./ลบ.ม. = ${f2(kg)} กก.`); }
      if (e.bolts) { const n = Math.trunc(e.bolts[0]), dia = e.bolts[1], La = e.bolts[2]; add(`abolt_${g(dia)}_${g(La)}`, `สลักเกลียวยึด (Anchor bolt) Ø ${g(dia)} มม. ฝังลึก ${g(La)} ซม.`, 'ตัว', n, pid, true); }
    }
    return [...items.values()].map(it => {
      const q = it.q, qty = it.count ? (Math.abs(q - Math.round(q)) < 1e-6 ? Math.round(q) : Math.ceil(q - 1e-9)) : r2(q);
      const row = { key: it.key, group_code: STEEL_GROUP, group: STEEL_GROUP_NAME, name: it.name, unit: it.unit, qty, qty_net: r2(q), waste: 0, waste_included: false,
        from: it.from, task: 'roof_frame', status: 'computed', src: SRC, by_src: Object.fromEntries([...it.by].filter(([, v]) => v).map(([k, v]) => [k, rnd4(v)])) };
      if (Object.keys(it.calc).length) row.calc = it.calc;
      row.by_task = { roof_frame: { share: 1, from: it.from } };
      return row;
    });
  }
  /** แถวที่เว็บคิดเองนอกหมวดเหล็ก (= takeoff.py): แผ่นพลาสติกรองพื้น (pe_sheet) · บันได (_stair) · กำแพงกันดิน (_retain) — ลำดับเดียวกับ Python */
  const EXTRA_RE = /^pe_sheet$|_(retain|stair)$/;
  const GROUP_NAMES = { '1.1.2': 'งานขุดดิน', '1.1.4': 'งานวัสดุรองฐานราก', '1.1.7': 'งานไม้แบบหล่อคอนกรีต', '1.1.12': 'งานคอนกรีต' };
  const XDEF = { lean_thk: 0.05, sand_thk: 0.05, sand_waste: 0.25, excav_waste: 0.30, excav_deep: 2.0, excav_deep_margin: 0.50 };
  function computeExtras(m) {
    const st = Object.assign({}, XDEF, ((m.quantities || {}).settings) || {});
    const mats = Object.fromEntries((m.materials || []).map(x => [x.id, x])), items = new Map(), design = m.design || {};
    const levels = new Map(); (m.levels || []).forEach(l => levels.set(l.name, l.z));
    const GL = levels.has('GL') ? levels.get('GL') : 0.0;
    const conc = id => { const fc = (mats[id] || {}).fc; return [fc ? `คอนกรีตโครงสร้าง f'c ${g(fc)} ksc (ทรงกระบอก)` : 'คอนกรีตโครงสร้าง', `conc_${id === undefined || id === null ? 'None' : id}`]; };
    const add = (code, key, name, unit, qty, src, task, calc, waste = 0) => {
      const k = code + '|' + key; let it = items.get(k);
      if (!it) items.set(k, it = { code, key, name, unit, q: 0, waste, from: [], by: new Map(), calc: {}, task, parts: new Map() });
      it.q += qty; if (!it.from.includes(src)) it.from.push(src); it.by.set(src, (it.by.get(src) || 0) + qty);
      if (calc) (it.calc[src] = it.calc[src] || []).push(calc);
      const t = task || 'other'; if (!it.parts.has(t)) it.parts.set(t, { q: 0, from: [] });
      const pt = it.parts.get(t); pt.q += qty; if (!pt.from.includes(src)) pt.from.push(src);
    };
    for (const s of m.slabs || []) {
      if (s.kind === 'cast' || s.kind === 'precast' || s.pe_sheet === false) continue;
      const A = polyArea(s.polygon), lt = s.level ? 'lift:' + s.level : 'slab';
      add('1.1.4', 'pe_sheet', 'แผ่นพลาสติกรองใต้พื้น (Polyethylene)', 'ตร.ม.', A, s.id, lt, `พื้นที่ ${f2(A)} ตร.ม. (ไม่คิดเผื่อทับซ้อน)`);
    }
    const defConc = ((m.materials || []).find(x => x.kind === 'concrete') || {}).id;
    for (const sx of m.stairs || []) {
      const [name, key] = conc(sx.material || defConc);
      for (const e of stairParts(sx, design, levels)) {
        if (e.kind === 'flight') {
          const side = e.Li * e.t + e.Lh * e.H / (2 * e.n), vol = e.W * side, fw = e.W * e.Li + e.H * e.W + 2 * side;
          add('1.1.12', key + '_stair', name + ' (บันได)', 'ลบ.ม.', vol, sx.id, e.lt, `${e.fid} กว้าง ${g(e.W)} × (ท้อง ${f2(e.Li)}×${g(e.t)} + ขั้น ${f2(e.Lh)}×${f2(e.H)}/(2×${e.n})) = ${vol.toFixed(3)} ลบ.ม.`);
          add('1.1.7', 'formwork_stair', 'ไม้แบบหล่อคอนกรีต (บันได)', 'ตร.ม.', fw, sx.id, e.lt, `${e.fid} ท้อง ${g(e.W)}×${f2(e.Li)} + ลูกตั้ง ${f2(e.H)}×${g(e.W)} + ข้าง 2×${side.toFixed(3)} = ${f2(fw)} ตร.ม.`);
        } else {
          const A = e.al * e.wd, P = 2 * (e.al + e.wd);
          add('1.1.12', key + '_stair', name + ' (บันได)', 'ลบ.ม.', A * e.t, sx.id, e.lt, `${e.lbl} ${g(e.al)}×${g(e.wd)} × หนา ${g(e.t)} = ${(A * e.t).toFixed(3)} ลบ.ม.`);
          add('1.1.7', 'formwork_stair', 'ไม้แบบหล่อคอนกรีต (บันได)', 'ตร.ม.', A + P * e.t, sx.id, e.lt, `${e.lbl} ท้อง ${f2(A)} + ขอบ ${f2(P)}×${g(e.t)} = ${f2(A + P * e.t)} ตร.ม.`);
        }
      }
    }
    for (const w of m.retaining_walls || []) {
      const L = w.length, H = w.H, tb = w.tb, tw = w.tw, B = w.B1 + w.B2, hw = H - tb;
      if (w.bottom !== undefined && w.bottom !== null && GL - w.bottom > 0) {
        const depth = GL - w.bottom;
        if (depth <= st.excav_deep) { const exc = B * L * depth; add('1.1.2', 'excav_retain', 'งานขุดดินฐานรากและถมคืน (ลึกไม่เกิน 2.00 ม.) (กำแพงกันดิน)', 'ลบ.ม.', exc, w.id, 'footing', `ฐาน ${g(B)} × ยาว ${g(L)} × ลึก ${f2(depth)} = ${f2(exc)} ลบ.ม. (+ เผื่อ ${g(st.excav_waste * 100)}%)`, st.excav_waste); }
        else { const mg = st.excav_deep_margin, dd = depth + st.sand_thk + st.lean_thk, exc = (B + 2 * mg) * (L + 2 * mg) * dd;
          add('1.1.2', 'excav_deep_retain', 'งานขุดดินฐานรากและถมคืน (ลึกเกิน 2.00 ม.) (กำแพงกันดิน)', 'ลบ.ม.', exc, w.id, 'footing', `(${g(B)}+${g(2 * mg)}) × (${g(L)}+${g(2 * mg)}) × ลึก ${f2(dd)} = ${f2(exc)} ลบ.ม.`); }
      }
      add('1.1.4', 'sand_base_retain', 'ทรายรองใต้ฐานราก (บดอัดแรงคน) (กำแพงกันดิน)', 'ลบ.ม.', B * L * st.sand_thk, w.id, 'footing', null, st.sand_waste);
      add('1.1.12', 'lean_conc_retain', 'คอนกรีตหยาบรองใต้ฐานราก (1:3:5) (กำแพงกันดิน)', 'ลบ.ม.', B * L * st.lean_thk, w.id, 'footing', null);
      const [name, key] = conc(w.material), vol = L * (hw * tw + B * tb), fw = L * (2 * hw + 2 * tb) + 2 * (hw * tw + B * tb);
      add('1.1.12', key + '_retain', name + ' (กำแพงกันดิน)', 'ลบ.ม.', vol, w.id, 'footing', `ยาว ${g(L)} × (ผนัง ${f2(hw)}×${g(tw)} + ฐาน ${g(B)}×${g(tb)}) = ${vol.toFixed(3)} ลบ.ม.`);
      add('1.1.7', 'formwork_retain', 'ไม้แบบหล่อคอนกรีต (กำแพงกันดิน)', 'ตร.ม.', fw, w.id, 'footing', `ผนัง 2 ด้าน ${f2(2 * hw)} + ขอบฐาน ${g(2 * tb)} × ยาว ${g(L)} + หัวท้าย = ${f2(fw)} ตร.ม.`);
    }
    return [...items.values()].map(it => {
      const row = { key: it.key, group_code: it.code, group: GROUP_NAMES[it.code] || '', name: it.name, unit: it.unit, qty: r2(it.q * (1 + it.waste)), qty_net: r2(it.q), waste: it.waste,
        waste_included: !!it.waste, from: it.from, task: it.task, status: 'computed', src: SRC };
      const bs = Object.fromEntries([...it.by].filter(([, v]) => v).map(([k, v]) => [k, rnd4(v)])); if (Object.keys(bs).length) row.by_src = bs;
      if (Object.keys(it.calc).length) row.calc = it.calc;
      const parts = [...it.parts], tot = parts.reduce((a, [, v]) => a + v.q, 0);
      if (tot > 0) { row.by_task = Object.fromEntries(parts.map((e, i) => [e, i]).sort((A, B) => (B[0][1].q - A[0][1].q) || (A[1] - B[1])).map(([[t, v]]) => [t, { share: rnd4(v.q / tot), from: v.from }])); row.task = Object.keys(row.by_task)[0]; }
      return row;
    });
  }
  const computeRetain = computeExtras;   // ชื่อเดิม
  /** เปิดโมเดล: เติม/แทนแถวที่เว็บคิดเอง (ไฟล์จาก takeoff.py รุ่นเก่ายังไม่มีพลาสติก/บันได/งานขุดกำแพง) */
  function applyExtras(m) { const q = m.quantities; if (q && Array.isArray(q.items)) replaceExtras(q, computeExtras(m)); }
  function replaceExtras(q, rows) {
    const old = q.items.filter(r => EXTRA_RE.test(r.key)), oldRef = Object.fromEntries(old.map(r => [r.key, r.price_ref]));
    q.items = q.items.filter(r => !EXTRA_RE.test(r.key));
    for (const r0 of rows) {
      const r = oldRef[r0.key] ? Object.assign(r0, { price_ref: oldRef[r0.key] }) : r0, gi = GROUP_ORDER.indexOf(r.group_code);
      let last = -1; q.items.forEach((x, i) => { if (x.group_code === r.group_code) last = i; });
      let at = last >= 0 ? last + 1 : q.items.findIndex(x => { const k = GROUP_ORDER.indexOf(x.group_code); return (k < 0 ? 99 : k) > gi; });
      if (at < 0) at = q.items.length;
      q.items.splice(at, 0, r);
    }
  }
  function replaceGroup(q, code, rows) {
    const old = q.items.filter(r => r.group_code === code), oldRef = Object.fromEntries(old.map(r => [r.key, r.price_ref]));
    rows = rows.map(r => oldRef[r.key] ? Object.assign(r, { price_ref: oldRef[r.key] }) : r);
    const firstOld = q.items.findIndex(r => r.group_code === code), rest = q.items.filter(r => r.group_code !== code), gi = GROUP_ORDER.indexOf(code);
    let at = firstOld >= 0 ? q.items.slice(0, firstOld).filter(r => r.group_code !== code).length : rest.findIndex(r => { const k = GROUP_ORDER.indexOf(r.group_code); return (k < 0 ? 99 : k) > gi; });
    if (at < 0) at = rest.length;
    q.items = rest.slice(0, at).concat(rows, rest.slice(at));
    return { rows, before: old.length };
  }
  /** แทนแถวหมวด 1.1.9 (เหล็กเสริม) และ 1.1.5 (เสาเข็ม) ใน quantities.items ด้วยผลใหม่ (คง price_ref เดิมของ key เดียวกัน) */
  function apply(m, by) {
    const q0 = m.quantities; if (q0 && Array.isArray(q0.items)) { replaceGroup(q0, PILE_GROUP, computePiles(m)); replaceGroup(q0, STEEL_GROUP, computePlates(m)); replaceExtras(q0, computeExtras(m)); }
    return applyRebar(m, by);
  }
  function applyRebar(m, by) {
    const q = m.quantities; if (!q || !Array.isArray(q.items)) return { ok: false, error: 'โมเดลยังไม่มีปริมาณ (รัน tools/takeoff.py --write ครั้งแรกก่อน)' };
    const old = q.items.filter(r => r.group_code === GROUP), oldRef = Object.fromEntries(old.map(r => [r.key, r.price_ref]));
    const rows = compute(m).map(r => oldRef[r.key] ? Object.assign(r, { price_ref: oldRef[r.key] }) : r);
    const rest = q.items.filter(r => r.group_code !== GROUP), gi = GROUP_ORDER.indexOf(GROUP);
    let at = rest.findIndex(r => { const k = GROUP_ORDER.indexOf(r.group_code); return (k < 0 ? 99 : k) > gi; });
    if (at < 0) at = rest.length;
    q.items = rest.slice(0, at).concat(rows, rest.slice(at));
    q.rebar_by = by || 'web';
    return { ok: true, rows, before: old.length };
  }

  // ---- hash แบบเดียวกับ tools/validate.py canonical_hash (json.dumps sort_keys, separators (",",":"), ensure_ascii=False)
  function pyJson(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : pyFloat(v)) : (v > 0 ? 'Infinity' : v < 0 ? '-Infinity' : 'NaN');
    if (typeof v === 'string') return JSON.stringify(v).replace(/[\u007f]/g, c => c);
    if (Array.isArray(v)) return '[' + v.map(pyJson).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + pyJson(v[k])).join(',') + '}';
  }
  function pyFloat(x) {   // repr(float) ของ Python: เลขยกกำลังเมื่อ < 1e-4 หรือ ≥ 1e16
    const a = Math.abs(x);
    if (a !== 0 && (a < 1e-4 || a >= 1e16)) {
      let [m, e] = x.toExponential().split('e'); const n = +e;
      return m + 'e' + (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(2, '0');
    }
    return String(x);
  }
  async function sha16(text) {
    const buf = new TextEncoder().encode(text);
    if (typeof crypto !== 'undefined' && crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); }
    return require('crypto').createHash('sha256').update(Buffer.from(buf)).digest('hex').slice(0, 16);
  }
  const designHash = m => sha16(pyJson({ design: m.design === undefined ? null : m.design }));
  return { compute, computePiles, computePlates, computeRetain, computeExtras, applyExtras, EXTRA_RE, boredPileItem, apply, designHash, pyJson, sha16, GROUP };
});
