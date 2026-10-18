/* UD Clash — ตรวจชิ้นส่วนชนกัน / ระยะไม่พอ / ความต่อเนื่องของโครงสร้าง จาก .bm.json
 * ใช้ได้ทั้งเบราว์เซอร์ (window.BmClash) และ Node
 *
 * BmClash.check(model, opts) → [{ key, code, sev: 'error'|'warn'|'info', title, detail, ids, at:[x,y,z], estimated }]
 * opts: { buildingType: 'residential'|'public', lintelMin: 0.10, tankSize: [1.2, 1.2, 1.6], tankClear: 0.30 }
 *
 * กลุ่ม ก ชนจริง  A1 ท่อ/ท่อร้อยสายลอดเสา คาน ฐานราก · A2 ถังบำบัด/อุปกรณ์ชนฐานราก · A3 ฐานรากซ้อน · A4 ช่องเปิดทับเสา
 * กลุ่ม ข ระยะ    B1 ช่องเปิดสูงเกินท้องคาน/ไม่มีที่ใส่ทับหลัง · B2 ท้องคานต่ำกว่าฝ้า · B3 ระยะดิ่งห้อง (กฎ 55 ข้อ 22)
 *                 B4 บันได (กฎ 55 ข้อ 23/24)
 * กลุ่ม ค ต่อเนื่อง C1 เสาไม่มีที่รองรับ · C2 ปลายคานไม่มีที่รองรับ · C3 ผนังไม่มีคาน/พื้นรับ · C4 ปลายเหล็กรูปพรรณลอย
 * แนวท่อ/สายที่ระบบประมาณให้ (quantities.routes) ตรวจด้วย แต่ขึ้นเป็นระดับ info เสมอ
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BmClash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-6;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
  const r2 = x => Math.round(x * 100) / 100;
  const f2 = x => (+x).toFixed(2);

  // ------------------------------------------------------------ รูปทรง (กล่องหมุนได้ OBB)
  function obb(c, axes, half) { return { c, ax: axes, h: half }; }
  function aabb(min, max) { return obb(mul(add(min, max), 0.5), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], mul(sub(max, min), 0.5)); }
  function sectionSize(s) {
    if (!s) return null;
    if (s.b && s.h) return [s.b, s.h];
    if (s.d) return [s.d, s.d];
    const n = (String(s.name || '').match(/[\d.]+/g) || []).map(v => +v / 1000);
    if (n.length >= 2) return [n[1], n[0]];          // C100x50… → กว้าง 0.05 ลึก 0.10
    return [0.05, 0.1];
  }
  function memberBox(x, nodes, secs) {
    const a = nodes[x.i], b = nodes[x.j], s = secs[x.section]; if (!a || !b) return null;
    const pa = [a.x, a.y, a.z], pb = [b.x, b.y, b.z], d = sub(pb, pa), L = len(d); if (L < EPS) return null;
    const [bw, bh] = sectionSize(s), u = mul(d, 1 / L);
    const steel = s && (s.kind === 'steel' || s.kind === 'cold_formed');
    let v, w, c = mul(add(pa, pb), 0.5);
    if (Math.abs(u[2]) > 0.99) { v = [1, 0, 0]; w = [0, 1, 0]; }
    else { v = norm(cross([0, 0, 1], u)); w = cross(u, v); if (!steel && (x.type === 'beam' || x.type === 'tie_beam' || x.type === 'lintel')) c = add(c, [0, 0, -bh / 2]); }
    return obb(c, [u, v, w], [L / 2, bw / 2, bh / 2]);
  }
  // ช่วง t ที่ส่วนของเส้น p→q (รัศมี r) อยู่ในกล่อง; คืนความยาวที่ทะลุ (ม.)
  function segInBox(p, q, B, r) {
    const d = sub(q, p), L = len(d); if (L < EPS) return 0;
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      const e = B.ax[k], o = dot(sub(p, B.c), e), dd = dot(d, e), h = B.h[k] + r;
      if (Math.abs(dd) < EPS) { if (Math.abs(o) > h) return 0; continue; }
      let a = (-h - o) / dd, b = (h - o) / dd; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return 0;
    }
    return (t1 - t0) * L;
  }
  // SAT: ระยะซ้อนน้อยสุดของกล่อง 2 กล่อง (บวก = ซ้อน, ลบ = ห่าง ตามแกนแยก)
  function boxOverlap(A, B) {
    const axes = [...A.ax, ...B.ax];
    A.ax.forEach(a => B.ax.forEach(b => { const c = cross(a, b); if (len(c) > 1e-6) axes.push(norm(c)); }));
    const T = sub(B.c, A.c); let best = Infinity;
    for (const L of axes) {
      const ra = A.h.reduce((s, h, i) => s + h * Math.abs(dot(A.ax[i], L)), 0);
      const rb = B.h.reduce((s, h, i) => s + h * Math.abs(dot(B.ax[i], L)), 0);
      best = Math.min(best, ra + rb - Math.abs(dot(T, L)));
    }
    return best;
  }
  const pointInPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const distPtSeg2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t]; };
  // แนวคานกับแนวผนัง (2 มิติ) ซ้อนกันตามยาว: คืนช่วงที่ซ้อน [s0, s1] บนผนัง
  function colinear(wa, wb, ba, bb, tol) {
    const L = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]); if (L < EPS) return null;
    const ux = (wb[0] - wa[0]) / L, uy = (wb[1] - wa[1]) / L;
    const off = p => Math.abs((p[0] - wa[0]) * uy - (p[1] - wa[1]) * ux), along = p => (p[0] - wa[0]) * ux + (p[1] - wa[1]) * uy;
    if (off(ba) > tol || off(bb) > tol) return null;
    const s0 = Math.max(0, Math.min(along(ba), along(bb))), s1 = Math.min(L, Math.max(along(ba), along(bb)));
    return s1 - s0 > 0.05 ? [s0, s1] : null;
  }

  const ROOM_RULES = [   // กฎกระทรวงฉบับที่ 55 ข้อ 22 (วัดพื้นถึงพื้น)
    [/ระเบียง/, 2.20, 'ระเบียง'],
    [/ขายสินค้า|ประชุม|คนไข้รวม|คลัง|โรงครัว|ตลาด/, 3.50, 'ห้องขายสินค้า ห้องประชุม คลังสินค้า ตลาด ฯลฯ'],
    [/สำนักงาน|ห้องเรียน(?!อนุบาล)|ห้องอาหาร|ภัตตาคาร|โรงงาน|ทำงาน|office/i, 3.00, 'สำนักงาน ห้องเรียน ห้องอาหาร โรงงาน'],
    [/พักอาศัย|ห้องนอน|บ้าน|โรงแรม|อนุบาล|ครัว|ทางเดิน|นั่งเล่น|พักคนไข้/, 2.60, 'ห้องพักอาศัย ห้องนอน ครัว ทางเดิน ฯลฯ'],
  ];

  function check(m, opts) {
    opts = Object.assign({ buildingType: (m.meta && m.meta.building_type) || 'public', lintelMin: 0.10, tankSize: [1.2, 1.2, 1.6], tankClear: 0.30 }, opts || {});
    const out = [];
    const push = (code, sev, title, detail, ids, at, estimated) => out.push({ key: code + ':' + [...ids].sort().join('+'), code, sev: estimated ? 'info' : sev,
      title, detail, ids, at: at && at.map(r2), estimated: !!estimated });
    const nodes = Object.fromEntries((m.nodes || []).map(n => [n.id, n]));
    const secs = Object.fromEntries((m.sections || []).map(s => [s.id, s]));
    const members = (m.members || []).filter(x => nodes[x.i] && nodes[x.j]);
    const boxes = members.map(x => ({ x, B: memberBox(x, nodes, secs) })).filter(o => o.B);
    const conc = boxes.filter(o => ['column', 'beam', 'tie_beam'].includes(o.x.type));
    const cols = boxes.filter(o => o.x.type === 'column');
    const beams = boxes.filter(o => o.x.type === 'beam' || o.x.type === 'tie_beam');
    const foots = (m.supports || []).filter(f => f.b && nodes[f.node]).map(f => { const n = nodes[f.node]; return { f, B: aabb([n.x - f.b / 2, n.y - f.d / 2, f.bottom], [n.x + f.b / 2, n.y + f.d / 2, f.bottom + f.h]) }; });
    const at3 = (p, q) => mul(add(p, q), 0.5);

    // ---------------- A1 ท่อ / ท่อร้อยสาย ลอดโครงสร้าง
    const pl = ((m.mep || {}).plumbing) || {};
    const lines = [];
    (pl.pipes || []).forEach(p => lines.push({ id: p.id, pts: p.pts, r: dia(p.dia) / 2, what: `ท่อ${p.system} ⌀${p.dia}`, est: false }));
    ((m.quantities || {}).routes || []).forEach(rt => lines.push({ id: rt.id, pts: rt.pts, r: rt.kind === 'pipe' ? dia(rt.dia) / 2 : 0.01,
      what: rt.kind === 'pipe' ? `ท่อ${rt.system} ⌀${rt.dia} (แนวประมาณ)` : `ท่อร้อยสายวงจร ${rt.circuit} (แนวประมาณ)`, est: !!rt.estimated }));
    lines.forEach(ln => {
      const hits = new Map();
      for (let i = 0; i < ln.pts.length - 1; i++) {
        const p = ln.pts[i], q = ln.pts[i + 1];
        conc.concat(foots.map(o => ({ x: { id: o.f.id, type: 'footing', mark: o.f.mark }, B: o.B }))).forEach(o => {
          const pen = segInBox(p, q, o.B, ln.r);
          if (pen > 0.02 && !hits.has(o.x.id)) hits.set(o.x.id, { o, at: at3(p, q), pen });
        });
      }
      hits.forEach(({ o, at, pen }, id) => {
        const kind = { column: 'เสา', beam: 'คาน', tie_beam: 'คานคอดิน', footing: 'ฐานราก' }[o.x.type];
        push('A1', o.x.type === 'beam' || o.x.type === 'tie_beam' ? 'warn' : 'error', `${ln.what} ลอด${kind} ${o.x.mark || ''}`.trim(),
          `${ln.id} ผ่าน ${id} ยาว ${f2(pen)} ม.${o.x.type.includes('beam') ? ' — ถ้าตั้งใจให้ลอด ต้องมีปลอกท่อและตรวจตำแหน่ง/ขนาดรูเจาะ' : ' — ต้องย้ายแนวท่อ'}`, [ln.id, id], at, ln.est);
      });
    });

    // ---------------- A2 ถังบำบัด/อุปกรณ์ใต้ดิน ชนหรือชิดฐานราก
    (pl.equipment || []).filter(e => ['septic_tank', 'grease_trap', 'water_tank', 'manhole', 'soak_pit'].includes(e.kind)).forEach(e => {
      const sz = e.dims || opts.tankSize, c = e.xyz;
      const B = aabb([c[0] - sz[0] / 2, c[1] - sz[1] / 2, c[2] - sz[2] / 2], [c[0] + sz[0] / 2, c[1] + sz[1] / 2, c[2] + sz[2] / 2]);
      foots.forEach(o => {
        const ov = boxOverlap(B, o.B);
        const gap = Math.max(Math.abs(c[0] - o.B.c[0]) - sz[0] / 2 - o.B.h[0], Math.abs(c[1] - o.B.c[1]) - sz[1] / 2 - o.B.h[1]);
        const note = e.dims ? '' : ` · ขนาดถังสมมติ ${sz.join('×')} ม. (ใส่ dims ใน equipment เพื่อความแม่นยำ)`;
        if (ov > 0.005) push('A2', 'error', `${e.id || e.kind} ทับฐานราก ${o.f.mark || o.f.id}`, `ซ้อน ${f2(ov)} ม.${note}`, [e.id || e.kind, o.f.id], c);
        else if (gap < opts.tankClear) push('A2', 'warn', `${e.id || e.kind} ชิดฐานราก ${o.f.mark || o.f.id}`, `ระยะห่าง ${f2(gap)} ม. (< ${opts.tankClear} ม.)${note}`, [e.id || e.kind, o.f.id], c);
      });
    });

    // ---------------- A3 ฐานรากซ้อนกัน
    for (let i = 0; i < foots.length; i++) for (let j = i + 1; j < foots.length; j++) {
      const ov = boxOverlap(foots[i].B, foots[j].B);
      if (ov > 0.005) push('A3', 'error', `ฐานราก ${foots[i].f.id} ซ้อนกับ ${foots[j].f.id}`, `ซ้อน ${f2(ov)} ม. — พิจารณารวมเป็นฐานร่วม`, [foots[i].f.id, foots[j].f.id], at3(foots[i].B.c, foots[j].B.c));
    }

    // ---------------- A4 / B1 ช่องเปิด กับ เสา และ คาน
    const ot = m.opening_types || {}, walls = Object.fromEntries((m.walls || []).map(w => [w.id, w]));
    (m.openings || []).forEach(o => {
      const w = walls[o.wall], t = ot[o.type]; if (!w || !t) return;
      const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < EPS) return;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, z0 = w.bottom + (t.sill || 0), z1 = z0 + t.h, s0 = o.at - t.w / 2, s1 = o.at + t.w / 2;
      const c = [a[0] + ux * o.at, a[1] + uy * o.at, (z0 + z1) / 2];
      const OB = obb(c, [[ux, uy, 0], [-uy, ux, 0], [0, 0, 1]], [t.w / 2, w.t / 2, t.h / 2]);
      cols.forEach(cb => { const ov = boxOverlap(OB, cb.B); if (ov > 0.01) push('A4', 'error', `${o.id} (${o.type}) ทับเสา ${cb.x.mark || cb.x.id}`, `ซ้อน ${f2(ov)} ม. — เลื่อนตำแหน่งช่องเปิด`, [o.id, cb.x.id], c); });
      beams.forEach(bm => {
        const na = nodes[bm.x.i], nb = nodes[bm.x.j];
        const ov = colinear(a, b, [na.x, na.y], [nb.x, nb.y], w.t / 2 + 0.1); if (!ov || ov[1] < s0 || ov[0] > s1) return;
        const zb = bm.B.c[2] - bm.B.h[2];       // ท้องคาน
        if (zb < w.bottom + 0.01 || zb > z1 + 1.5) return;   // คานล่าง (คานคอดิน) หรือคานสูงกว่ามาก
        if (z1 > zb + 0.005) push('B1', 'error', `${o.id} (${o.type}) สูงเกินท้องคาน ${bm.x.mark || bm.x.id}`, `หัวช่องเปิด +${f2(z1)} ท้องคาน +${f2(zb)} เกิน ${f2(z1 - zb)} ม.`, [o.id, bm.x.id], [c[0], c[1], zb]);
        else if (zb - z1 < opts.lintelMin && w.kind !== 'gypsum') push('B1', 'warn', `${o.id} ชิดท้องคาน ${bm.x.mark || bm.x.id} ไม่มีที่ใส่ทับหลัง`, `ห่าง ${f2(zb - z1)} ม. (< ${opts.lintelMin} ม.) — ใช้คานแทนทับหลังได้ถ้าตั้งใจ`, [o.id, bm.x.id], [c[0], c[1], zb]);
      });
    });

    // ---------------- B2 ท้องคานต่ำกว่าระดับฝ้า
    (m.finishes || []).filter(f => f.kind === 'ceiling' && f.z !== undefined).forEach(f => (f.rects || []).forEach(rc => {
      const [x0, y0, x1, y1] = [Math.min(rc[0], rc[2]), Math.min(rc[1], rc[3]), Math.max(rc[0], rc[2]), Math.max(rc[1], rc[3])];
      beams.filter(bm => bm.x.type === 'beam').forEach(bm => {
        const zb = bm.B.c[2] - bm.B.h[2]; if (zb >= f.z - 0.005 || zb < f.z - 1.2) return;
        const na = nodes[bm.x.i], nb = nodes[bm.x.j], mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2;
        const inside = (mx > x0 + 0.02 && mx < x1 - 0.02 && my > y0 + 0.02 && my < y1 - 0.02);
        if (inside) push('B2', 'warn', `ท้องคาน ${bm.x.mark || bm.x.id} ต่ำกว่าฝ้า ${f.id}`, `ท้องคาน +${f2(zb)} ฝ้า +${f2(f.z)} — คานโผล่ใต้ฝ้า ${f2(f.z - zb)} ม. (ทำฝ้าหลบหรือลดระดับฝ้า)`, [bm.x.id, f.id], [mx, my, zb]);
      });
    }));

    // ---------------- B3 ระยะดิ่งห้อง กฎ 55 ข้อ 22
    const slabs = m.slabs || [];
    slabs.forEach(sl => {
      if (!sl.use) return;
      const cen = sl.polygon.reduce((a, p) => [a[0] + p[0] / sl.polygon.length, a[1] + p[1] / sl.polygon.length], [0, 0]);
      const above = slabs.filter(s2 => s2 !== sl && s2.top > sl.top + 0.5 && pointInPoly(cen, s2.polygon)).sort((a, b) => a.top - b.top)[0];
      let H, how;
      if (above) { H = above.top - sl.top; how = `พื้นถึงพื้น (${above.id})`; }
      else {
        const tops = beams.filter(bm => bm.x.type === 'beam' && bm.B.c[2] > sl.top).map(bm => bm.B.c[2] + bm.B.h[2]);
        const wt = (m.walls || []).filter(w => Math.abs(w.bottom - sl.top) < 0.05).map(w => w.top);
        H = Math.max(...tops, ...wt, -Infinity) - sl.top; how = 'พื้นถึงยอดผนัง/หลังคานชั้นบน (ชั้นใต้หลังคา)';
        if (!isFinite(H)) return;
      }
      if (/ห้องน้ำ|ส้วม|สุขา/.test(sl.use)) {
        const ceil = (m.finishes || []).filter(f => f.kind === 'ceiling' && f.z > sl.top && (f.rects || []).some(rc => cen[0] >= Math.min(rc[0], rc[2]) && cen[0] <= Math.max(rc[0], rc[2]) && cen[1] >= Math.min(rc[1], rc[3]) && cen[1] <= Math.max(rc[1], rc[3]))).map(f => f.z);
        const hc = ceil.length ? Math.min(...ceil) - sl.top : H;
        if (hc < 2.0) push('B3', 'error', `ห้องน้ำ ${sl.id} สูงพื้นถึงฝ้า ${f2(hc)} ม. < 2.00 ม.`, 'กฎกระทรวงฉบับที่ 55 ข้อ 22 วรรคท้าย', [sl.id], [cen[0], cen[1], sl.top]);
        return;
      }
      const rule = ROOM_RULES.find(([re]) => re.test(sl.use));
      if (!rule) { push('B3', 'info', `พื้น ${sl.id} การใช้งาน "${sl.use}" ไม่ตรงหมวดใน ข้อ 22`, 'ระบุการใช้งานให้ตรงหมวดเพื่อตรวจระยะดิ่ง', [sl.id], [cen[0], cen[1], sl.top]); return; }
      if (H < rule[1] - 0.005) push('B3', 'error', `ระยะดิ่ง ${sl.id} (${sl.use}) ${f2(H)} ม. < ${f2(rule[1])} ม.`, `กฎกระทรวงฉบับที่ 55 ข้อ 22 — ${rule[2]} · วัด${how}`, [sl.id], [cen[0], cen[1], sl.top]);
    });

    // ---------------- B4 บันได กฎ 55 ข้อ 23 (อยู่อาศัย) / ข้อ 24 (อาคารอื่น)
    const R = opts.buildingType === 'residential' ? { w: 0.80, rise: 0.20, go: 0.22, flight: 3.0, head: 1.90, ref: 'ข้อ 23' } : { w: 1.20, rise: 0.18, go: 0.25, flight: 4.0, head: 2.10, ref: 'ข้อ 24' };
    (m.stairs || []).forEach(st => (st.flights || []).forEach((fl, k) => {
      const rise = (fl.top - fl.bottom) / fl.risers, id = st.id, P = [fl.start[0], fl.start[1], fl.bottom];
      const bad = [];
      if (fl.width < R.w - 0.005) bad.push(`กว้าง ${f2(fl.width)} < ${f2(R.w)}`);
      if (rise > R.rise + 0.0005) bad.push(`ลูกตั้ง ${(rise * 100).toFixed(1)} ซม. > ${R.rise * 100}`);
      if (fl.going < R.go - 0.0005) bad.push(`ลูกนอน ${(fl.going * 100).toFixed(1)} ซม. < ${R.go * 100}`);
      if (fl.top - fl.bottom > R.flight + 0.005) bad.push(`ช่วงบันไดสูง ${f2(fl.top - fl.bottom)} > ${R.flight} ม. ต้องมีชานพัก`);
      if (bad.length) push('B4', 'error', `บันได ${id} ช่วงที่ ${k + 1} ไม่ผ่านกฎ 55 ${R.ref}`, bad.join(' · '), [id], P);
      // ระยะดิ่งเหนือขั้นบันได: ส่วนต่ำสุดของคาน/พื้นที่อยู่เหนือแต่ละขั้น
      const dir = { '+X': [1, 0], '-X': [-1, 0], '+Y': [0, 1], '-Y': [0, -1] }[fl.dir], side = [-dir[1], dir[0]];
      let worst = null;
      for (let s = 0; s < fl.risers; s++) for (const g of [0.05, 0.35, 0.65, 0.95]) for (const o of [0.1, 0.5, 0.9]) {
        const px = fl.start[0] + dir[0] * (s + g) * fl.going + side[0] * o * fl.width, py = fl.start[1] + dir[1] * (s + g) * fl.going + side[1] * o * fl.width;
        const zs = fl.bottom + (s + 1) * rise;
        let low = Infinity, who = null;
        beams.forEach(bm => { const na = nodes[bm.x.i], nb = nodes[bm.x.j]; const [d] = distPtSeg2([px, py], [na.x, na.y], [nb.x, nb.y]); const zb = bm.B.c[2] - bm.B.h[2];
          if (d <= bm.B.h[1] + 0.001 && zb > zs + 0.05 && zb < low) { low = zb; who = bm.x.id; } });
        slabs.forEach(s2 => { const zb = s2.top - s2.t; if (zb > zs + 0.05 && zb < low && pointInPoly([px, py], s2.polygon)) { low = zb; who = s2.id; } });
        if (who && (!worst || low - zs < worst.h)) worst = { h: low - zs, who, at: [px, py, zs] };
      }
      if (worst && worst.h < R.head - 0.005) push('B4', 'error', `ระยะดิ่งเหนือบันได ${id} ${f2(worst.h)} ม. < ${f2(R.head)} ม.`, `ส่วนต่ำสุดเหนือขั้นคือ ${worst.who} · กฎ 55 ${R.ref}`, [id, worst.who], worst.at);
    }));

    // ---------------- C ความต่อเนื่องของโครงสร้าง
    const supAt = new Set((m.supports || []).map(s => s.node));
    const atNode = {}; members.forEach(x => [x.i, x.j].forEach(n => (atNode[n] = atNode[n] || []).push(x)));
    // C1 เสา: โคนเสาต้องอยู่บนฐานราก หรือมีเสาต่อลงไป
    members.filter(x => x.type === 'column').forEach(x => {
      const lo = nodes[x.i].z <= nodes[x.j].z ? x.i : x.j;
      if (supAt.has(lo)) return;
      const below = (atNode[lo] || []).some(y => y !== x && y.type === 'column' && Math.min(nodes[y.i].z, nodes[y.j].z) < nodes[lo].z - 0.01);
      if (below) return;
      const onBeam = (atNode[lo] || []).some(y => y.type === 'beam' || y.type === 'tie_beam');
      push('C1', onBeam ? 'warn' : 'error', onBeam ? `เสา ${x.id} ตั้งบนคาน (ไม่มีฐานราก)` : `เสา ${x.id} ไม่มีฐานรากหรือที่รองรับ`,
        onBeam ? 'เสาลอย/เสาตั้งบนคาน — ตรวจว่าตั้งใจ และคานรับน้ำหนักจุดได้' : `โคนเสาที่จุด ${lo} ไม่มีฐานรากหรือเสาต่อลง`, [x.id], [nodes[lo].x, nodes[lo].y, nodes[lo].z]);
    });
    // C2 ปลายคาน: ต้องมีเสา/ฐาน หรือคานอื่นที่ปลายเดียวกันซึ่งมีที่รองรับ
    const colNode = new Set(members.filter(x => x.type === 'column').flatMap(x => [x.i, x.j]));
    beams.forEach(({ x }) => [x.i, x.j].forEach(n => {
      if (colNode.has(n) || supAt.has(n)) return;
      const others = (atNode[n] || []).filter(y => y !== x && (y.type === 'beam' || y.type === 'tie_beam'));
      if (others.length >= 2) return;                       // คานต่อเนื่อง/คานซอยรับด้วยคานหลัก
      if (others.length === 1) {
        const y = others[0], ny = nodes[y.i], nz = nodes[y.j], nx = nodes[x.i], nw = nodes[x.j];
        const ux = [nw.x - nx.x, nw.y - nx.y], uy = [nz.x - ny.x, nz.y - ny.y];
        const par = Math.abs(ux[0] * uy[1] - ux[1] * uy[0]) < 1e-6 * Math.hypot(...ux) * Math.hypot(...uy);
        if (!par) return;                                  // คานตั้งฉากรับ = คานซอย
        push('C2', 'warn', `คาน ${x.id} ต่อกับ ${y.id} ที่จุด ${n} โดยไม่มีเสารับ`, 'คานต่อตรงกันกลางช่วงไม่มีเสา — ตรวจว่ามีเสาหรือคานรับจริง', [x.id, y.id], [nodes[n].x, nodes[n].y, nodes[n].z]);
        return;
      }
      push('C2', 'error', `ปลายคาน ${x.id} ไม่มีที่รองรับ`, `จุด ${n} ไม่มีเสา ฐานราก หรือคานอื่น (ถ้าเป็นคานยื่นให้ระบุ type cantilever ภายหลัง)`, [x.id], [nodes[n].x, nodes[n].y, nodes[n].z]);
    }));
    // C3 ผนังต้องมีคานหรือพื้นรองรับ
    (m.walls || []).forEach(w => {
      for (let i = 0; i < w.path.length - 1; i++) {
        const a = w.path[i], b = w.path[i + 1], Lw = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Lw < 0.05) continue;
        const cov = [];
        beams.forEach(bm => { const zt = bm.B.c[2] + bm.B.h[2]; if (Math.abs(zt - w.bottom) > 0.06) return;
          const na = nodes[bm.x.i], nb = nodes[bm.x.j], ov = colinear(a, b, [na.x, na.y], [nb.x, nb.y], w.t / 2 + bm.B.h[1]); if (ov) cov.push(ov); });
        cov.sort((p, q) => p[0] - q[0]); let reach = 0; cov.forEach(([s0, s1]) => { if (s0 <= reach + 0.25) reach = Math.max(reach, s1); });
        if (reach >= Lw - 0.25) continue;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const onSlab = slabs.find(s2 => Math.abs(s2.top - w.bottom) < 0.06 && pointInPoly(mid, s2.polygon));
        if (onSlab) push('C3', onSlab.kind === 'ground' ? 'info' : 'warn', `ผนัง ${w.id} วางบนพื้น ${onSlab.id} โดยไม่มีคานรับ`,
          onSlab.kind === 'ground' ? 'พื้นวางบนดิน — ตรวจการทรุดตัว/ฐานรองผนัง' : 'พื้นต้องออกแบบรับน้ำหนักผนังแบบแนวเส้น หรือเพิ่มคานรับ', [w.id, onSlab.id], [mid[0], mid[1], w.bottom]);
        else push('C3', 'error', `ผนัง ${w.id} ไม่มีคานหรือพื้นรองรับ`, `ระดับใต้ผนัง +${f2(w.bottom)}`, [w.id], [mid[0], mid[1], w.bottom]);
      }
    });
    // C4 ปลายเหล็กรูปพรรณ: ต้องต่อกับชิ้นอื่นหรือวางบนชิ้นอื่น (ปลายยื่นชายคาและปลายแปยื่นปั้นลมยอมให้)
    const steel = boxes.filter(o => secs[o.x.section] && ['steel', 'cold_formed'].includes(secs[o.x.section].kind));
    steel.forEach(({ x }) => [x.i, x.j].forEach(n => {
      if ((atNode[n] || []).length > 1 || supAt.has(n)) return;
      const p = [nodes[n].x, nodes[n].y, nodes[n].z];
      const onOther = boxes.some(o => o.x !== x && segInBox(p, add(p, [0, 0, 0.001]), o.B, 0.01) > 0);
      if (onOther) return;
      const along = (atNode[x.i === n ? x.j : x.i] || []).length > 1;   // ปลายอีกข้างต่อแล้ว = ปลายยื่น
      if (along && (x.type === 'rafter' || x.type === 'purlin')) return;
      push('C4', 'warn', `ปลาย ${x.type} ${x.id} ไม่ต่อกับชิ้นใด`, `จุด ${n}`, [x.id], p);
    }));

    const order = { error: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.sev] - order[b.sev] || a.code.localeCompare(b.code));
  }
  function dia(s) {   // '4"' → 0.1016 ม., '110' → 0.11 ม.
    const t = String(s || ''); const m = t.match(/([\d.]+)\s*\/\s*([\d.]+)/), w = t.match(/^([\d.]+)\s*(?:-\s*([\d.]+)\s*\/\s*([\d.]+))?/);
    if (t.includes('"')) { if (m && !/^\d+\s*-/.test(t) && t.indexOf('/') < t.indexOf('"')) { const whole = t.match(/^(\d+)\s+/); return ((whole ? +whole[1] : 0) + (+m[1] / +m[2])) * 0.0254; } return (w ? +w[1] : 1) * 0.0254; }
    return w ? +w[1] / 1000 : 0.05;
  }
  return { check, memberBox, segInBox, boxOverlap, dia, ROOM_RULES };
});
