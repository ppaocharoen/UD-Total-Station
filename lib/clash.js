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
        const wt = (m.walls || []).filter(w => Math.abs(w.bottom - sl.top) < 0.05 && w.path.length > 1
          && pointInPoly([(w.path[0][0] + w.path[w.path.length - 1][0]) / 2, (w.path[0][1] + w.path[w.path.length - 1][1]) / 2], sl.polygon)).map(w => w.top);   // เฉพาะผนังที่อยู่บนพื้นผืนนี้
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
      const pe = [nodes[n].x, nodes[n].y, nodes[n].z];   // ปลายคานฝากเข้ากลางช่วงคาน/เสาอื่น (คานซอยชนข้างคาน)
      if (boxes.some(o => o.x !== x && ['beam', 'tie_beam', 'column'].includes(o.x.type) && segInBox(pe, add(pe, [0, 0, -0.001]), o.B, 0.01) > 0)) return;
      push('C2', 'error', `ปลายคาน ${x.id} ไม่มีที่รองรับ`, `จุด ${n} ไม่มีเสา ฐานราก หรือคานอื่น (ถ้าเป็นคานยื่นให้ระบุ type cantilever ภายหลัง)`, [x.id], [nodes[n].x, nodes[n].y, nodes[n].z]);
    }));
    // C3 ผนังต้องมีคานหรือพื้นรองรับ
    (m.walls || []).forEach(w => {
      for (let i = 0; i < w.path.length - 1; i++) {
        const a = w.path[i], b = w.path[i + 1], Lw = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Lw < 0.05) continue;
        const cov = [];
        beams.forEach(bm => { const zt = bm.B.c[2] + bm.B.h[2]; if (Math.abs(zt - w.bottom) > 0.06) return;
          const na = nodes[bm.x.i], nb = nodes[bm.x.j], ov = colinear(a, b, [na.x, na.y], [nb.x, nb.y], w.t / 2 + bm.B.h[1]); if (ov) cov.push(ov); });
        (m.walls || []).forEach(u => { if (u === w || Math.abs(u.top - w.bottom) > 0.02) return;   // วางบนผนังอีกชิ้น (เช่น ระแนงเหนือผนัง)
          for (let k = 0; k < u.path.length - 1; k++) { const ov = colinear(a, b, u.path[k], u.path[k + 1], (w.t + u.t) / 2); if (ov) cov.push(ov); } });
        cov.sort((p, q) => p[0] - q[0]); let reach = 0; cov.forEach(([s0, s1]) => { if (s0 <= reach + 0.25) reach = Math.max(reach, s1); });
        if (reach >= Lw - 0.25) continue;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const surfZ = (s2, p) => {   // ผิวพื้นที่จุด p (พื้นทางลาด: ไล่ระดับตามทิศ)
          const r = s2.ramp; if (!r || !r.dir) return s2.top;
          const ax = r.dir.includes('X') ? 0 : 1, vs = s2.polygon.map(q => q[ax]), lo = Math.min(...vs), hi = Math.max(...vs);
          let f = hi > lo ? (p[ax] - lo) / (hi - lo) : 1; if (r.dir[0] === '-') f = 1 - f;
          return r.low + (r.high - r.low) * Math.max(0, Math.min(1, f)); };
        const wb = w.bottom + (w.rise || 0) / 2;   // ผนังเอียง: เทียบที่กึ่งกลาง
        const onSlab = slabs.find(s2 => Math.abs(surfZ(s2, mid) - wb) < 0.06 && pointInPoly(mid, s2.polygon));
        if (onSlab) push('C3', onSlab.kind === 'ground' ? 'info' : 'warn', `ผนัง ${w.id} วางบนพื้น ${onSlab.id} โดยไม่มีคานรับ`,
          onSlab.kind === 'ground' ? 'พื้นวางบนดิน — ตรวจการทรุดตัว/ฐานรองผนัง' : 'พื้นต้องออกแบบรับน้ำหนักผนังแบบแนวเส้น หรือเพิ่มคานรับ', [w.id, onSlab.id], [mid[0], mid[1], w.bottom]);
        else push('C3', 'error', `ผนัง ${w.id} ไม่มีคานหรือพื้นรองรับ`, `ระดับใต้ผนัง +${f2(w.bottom)}`, [w.id], [mid[0], mid[1], w.bottom]);
      }
    });
    // C4 ปลายเหล็กรูปพรรณ: ต้องต่อกับชิ้นอื่นหรือวางบนชิ้นอื่น (ปลายยื่นชายคา ปลายแปยื่นปั้นลม และคอร์ดบน Truss ยื่นชายคา ยอมให้)
    const steel = boxes.filter(o => secs[o.x.section] && ['steel', 'cold_formed'].includes(secs[o.x.section].kind));
    steel.forEach(({ x }) => [x.i, x.j].forEach(n => {
      if ((atNode[n] || []).length > 1 || supAt.has(n)) return;
      const p = [nodes[n].x, nodes[n].y, nodes[n].z];
      const onOther = boxes.some(o => o.x !== x && segInBox(p, add(p, [0, 0, 0.001]), o.B, 0.01) > 0);
      if (onOther) return;
      const along = (atNode[x.i === n ? x.j : x.i] || []).length > 1;   // ปลายอีกข้างต่อแล้ว = ปลายยื่น
      if (along && (x.type === 'rafter' || x.type === 'purlin' || x.type === 'truss_chord')) return;   // คอร์ดบน Truss ยื่นถึงชายคา
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
  // ---------------------------------------------------------------- ประเภทอาคารตามกฎหมาย (พ.ร.บ.ควบคุมอาคาร 2522 ม.4 · กฎกระทรวง 55 ข้อ 1, 15, 27)
  // ใช้เฉพาะข้อมูลในโมเดล ไม่ต้องมีข้อมูลที่ดิน · ประเภทที่ขึ้นกับการใช้งาน (สาธารณะ/ชุมนุมคน) แสดงเป็นหมายเหตุ
  const polyArea = P => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  function classify(m) {
    const lv = m.levels || [], GL = ((lv.find(l => l.name === 'GL') || { z: 0 }).z) || 0;
    const roofs = m.roofs || [], flat = roofs.length ? roofs.every(r => r.form === 'flat') : true;
    const isDeck = s => /roof|ดาดฟ้า/i.test(String(s.level || '')) || s.kind === 'roof';
    const slabs = (m.slabs || []).filter(s => s.polygon && s.polygon.length > 2);
    const floors = slabs.filter(s => !isDeck(s)), decks = slabs.filter(isDeck);
    const wallTop = Math.max(-Infinity, ...(m.walls || []).map(w => +w.top).filter(isFinite));
    const eave = Math.max(-Infinity, ...roofs.map(r => +r.eave).filter(isFinite));
    let H, how;
    if (!flat) { const t = isFinite(wallTop) ? wallTop : eave; H = t - GL; how = (isFinite(wallTop) ? 'ยอดผนังชั้นสูงสุด' : 'ระดับชายคา') + ' (หลังคาจั่ว/ปั้นหยา)'; }
    else { const t = Math.max(-Infinity, ...decks.map(s => +s.top), ...floors.map(s => +s.top)); H = t - GL; how = 'พื้นดาดฟ้า (หลังคาแบน)'; }
    const byLevel = {}; floors.forEach(s => { const k = s.level || String(s.top); byLevel[k] = (byLevel[k] || 0) + polyArea(s.polygon); });
    const storeys = Object.keys(byLevel).length, areaTotal = r2(Object.values(byLevel).reduce((a, b) => a + b, 0)), areaMax = r2(Math.max(0, ...Object.values(byLevel)));
    const deckArea = r2(decks.reduce((a, s) => a + polyArea(s.polygon), 0));
    // ช่วงยาวสุด: คาน/โครงข้อหมุน = ระยะราบระหว่างปลาย · โครงหลังคา = ความกว้างหลังคาตั้งฉากสัน หักชายคา (สมมติไม่มีจุดรองรับกลาง)
    const nodes = Object.fromEntries((m.nodes || []).map(n => [n.id, n]));
    let span = 0, spanId = '';
    (m.members || []).filter(x => ['beam', 'tie_beam', 'truss'].includes(x.type) && nodes[x.i] && nodes[x.j]).forEach(x => {
      const a = nodes[x.i], b = nodes[x.j], L = Math.hypot(b.x - a.x, b.y - a.y); if (L > span) { span = L; spanId = x.id; } });
    let roofSpan = 0, roofId = '';
    roofs.forEach(r => { if (!r.outline || r.form === 'flat') return; const xs = r.outline.map(p => p[0]), ys = r.outline.map(p => p[1]);
      const wx = Math.max(...xs) - Math.min(...xs), wy = Math.max(...ys) - Math.min(...ys), oh = 2 * (+r.overhang || 0);
      const w = r.form === 'gable' || r.form === 'shed' ? (r.ridge === 'Y' ? wx : wy) - oh : Math.min(wx, wy) - oh; if (w > roofSpan) { roofSpan = w; roofId = r.id; } });
    H = r2(H); span = r2(span); roofSpan = r2(roofSpan);
    const use = String((m.meta || {}).occupancy || ''), owner = String((m.meta || {}).owner || '');
    const assembly = /หอประชุม|โรงมหรสพ|อัฒจันทร์|หอสมุด|หอศิลป์|พิพิธภัณฑ์|ศาสนสถาน|โรงแรม|โรงพยาบาล|สถานศึกษา|ตลาด|ห้าง|สนามกีฬา|ศูนย์การค้า/.test(use);
    const items = [];
    const add = (law, name, yes, why, note) => items.push({ law, name, yes, why, note: note || '' });
    add('พ.ร.บ. ม.4', 'อาคารสูง (≥ 23 ม.)', H >= 23, `สูง ${H.toFixed(2)} ม. วัดถึง${how}`);
    add('พ.ร.บ. ม.4', 'อาคารขนาดใหญ่พิเศษ (พื้นที่รวม ≥ 10,000 ตร.ม.)', areaTotal >= 10000, `พื้นที่รวม ${areaTotal.toLocaleString()} ตร.ม.`);
    const big = areaTotal > 2000 || areaMax > 2000 || (H >= 15 && (areaTotal > 1000 || areaMax > 1000));
    add('กฎ 55 ข้อ 1', 'อาคารขนาดใหญ่ (> 2,000 ตร.ม. หรือ สูง ≥ 15 ม. และ > 1,000 ตร.ม.)', big, `พื้นที่รวม ${areaTotal.toLocaleString()} · ชั้นมากสุด ${areaMax.toLocaleString()} ตร.ม. · สูง ${H.toFixed(2)} ม.`);
    const spec = H > 15 || span > 10 || roofSpan > 10 || /หอประชุม|โรงมหรสพ|อัฒจันทร์|หอสมุด|หอศิลป์|พิพิธภัณฑ์|ศาสนสถาน/.test(use);
    add('กฎ 55 ข้อ 1', 'อาคารพิเศษ (ก) ใช้งานพิเศษ / (ค) สูง > 15 ม. หรือ ช่วงโครงสร้าง/โครงหลังคา > 10 ม.', spec,
      `สูง ${H.toFixed(2)} ม. · ช่วงคานยาวสุด ${span.toFixed(2)} ม.${spanId ? ' (' + spanId + ')' : ''} · ช่วงโครงหลังคา ${roofSpan.toFixed(2)} ม.${roofId ? ' (' + roofId + ')' : ''}`,
      roofSpan > 8 && roofSpan <= 10 ? 'ช่วงโครงหลังคาใกล้ 10 ม. — ช่วงคิดแบบไม่มีจุดรองรับกลาง ตรวจกับแบบ' : 'ช่วงโครงหลังคาคิดจากความกว้างหลังคาตั้งฉากสัน หักชายคา (ไม่มีจุดรองรับกลาง)');
    add('กฎ 55 ข้อ 15', 'ต้องใช้วัสดุทนไฟ (เสา คาน พื้น บันได ผนัง)', storeys >= 3 || big || assembly, `${storeys} ชั้น · การใช้: ${use || 'ไม่ระบุ'}`, 'บังคับเมื่อสูง ≥ 3 ชั้น อาคารขนาดใหญ่ หรือ โรงมหรสพ หอประชุม โรงแรม โรงพยาบาล หอสมุด ห้างฯ ฯลฯ');
    add('กฎ 55 ข้อ 27', 'ต้องมีบันไดหนีไฟ', (storeys >= 4 && H <= 23) || (storeys === 3 && deckArea > 16), `${storeys} ชั้น · ดาดฟ้า ${deckArea} ตร.ม.`, '≥ 4 ชั้นและสูง ≤ 23 ม. หรือ 3 ชั้นมีดาดฟ้า > 16 ตร.ม.');
    add('พ.ร.บ. ม.4', 'อาคารชุมนุมคน (≥ 1,000 ตร.ม. หรือ ≥ 500 คน)', assembly && areaTotal >= 1000, `การใช้: ${use || 'ไม่ระบุ'}`, 'ขึ้นกับการใช้งานและจำนวนคน — ตรวจเอง');
    const gov = /เทศบาล|อบต|อบจ|องค์การบริหารส่วน|กรม|กระทรวง|ราชการ/.test(owner);
    const notes = [
      'ม.21: ก่อสร้าง/ดัดแปลง/เคลื่อนย้ายต้องขออนุญาต หรือแจ้งตาม ม.39 ทวิ',
      'ม.39 ทวิ (แจ้งแทนขออนุญาต): ระบุผู้ออกแบบ (สถาปนิก/วิศวกรควบคุม) และผู้ควบคุมงานที่มีใบอนุญาต พร้อมสำเนาใบอนุญาต แผนผังบริเวณ แบบแปลน รายการประกอบแบบ และรายการคำนวณที่ลงนาม',
      'ม.21 ทวิ: อาคารชนิดที่กฎกระทรวงกำหนดต้องตรวจสอบงานออกแบบและคำนวณโครงสร้าง',
    ];
    if (gov) notes.unshift(`เจ้าของ: ${owner} — ม.7 รัฐมนตรีออกกฎกระทรวงยกเว้น/ผ่อนผัน/กำหนดเงื่อนไขสำหรับอาคารของราชการส่วนท้องถิ่นที่ใช้ในราชการหรือสาธารณประโยชน์ได้ ตรวจกฎกระทรวงที่ออกตาม ม.7 ก่อนสรุป`);
    if ((m.demolition || []).length) notes.push('ม.22: มีงานรื้อถอน — ต้องขออนุญาตถ้าอาคารที่รื้อสูง > 15 ม. และห่างอาคารอื่น/ที่สาธารณะน้อยกว่าความสูง หรือห่าง < 2 ม. (ตรวจระยะหน้างาน)');
    return { H, how, storeys, areaTotal, areaMax, deckArea, span, spanId, roofSpan, roofId, use, items, notes };
  }
  // ---------------------------------------------------------------- กฎกระทรวง 55: ที่ว่าง (ข้อ 33) ร่นแนวถนน (ข้อ 41) แหล่งน้ำ (ข้อ 42) ความสูงกับถนน (ข้อ 44–46) ช่องเปิดห่างเขตที่ดิน (ข้อ 50)
  // cfg = { boundary: [[x,y]] | null, landArea, use: 'res'|'public'|'commercial'|'other', roads: [{edge, width}], waters: [{edge, width, kind: 'canal'|'large'}], coverExtra, off: {c33,c41,c42,c44,c45,c50} }
  // ผลแต่ละข้อ: pass / fail / missing (ข้อมูลไม่ครบ — ไม่ตัดสิน) / off (ผู้ใช้เลือกไม่คิด) / na (ไม่บังคับกับอาคารนี้)
  const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  function ptSeg(p, a, b) { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy; let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0; t = Math.max(0, Math.min(1, t)); return d2(p, [a[0] + t * vx, a[1] + t * vy]); }
  function segSeg(a, b, c, d) {
    const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const o1 = cr(a, b, c), o2 = cr(a, b, d), o3 = cr(c, d, a), o4 = cr(c, d, b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return 0;
    return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
  }
  const edgesOf = P => P.map((p, i) => [p, P[(i + 1) % P.length]]);
  function edgeLabel(P, i) {
    const [a, b] = edgesOf(P)[i], cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
    let nx = b[1] - a[1], ny = -(b[0] - a[0]); const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const dir = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'ตะวันออก' : 'ตะวันตก') : (ny > 0 ? 'เหนือ' : 'ใต้');
    return `ด้าน ${i + 1}: ทิศ${dir} (ยาว ${d2(a, b).toFixed(1)} ม.)`;
  }
  /** แนวอาคาร = ผนัง เสา พื้น (ไม่รวมชายคา) เป็นชุดเส้น 2 มิติ */
  function buildingLines(m) {
    const segs = [], nodes = Object.fromEntries((m.nodes || []).map(n => [n.id, n]));
    (m.walls || []).forEach(w => edgesOf(w.path || []).slice(0, Math.max(0, (w.path || []).length - 1)).forEach(e => segs.push({ e, id: w.id })));
    (m.slabs || []).forEach(s => (s.polygon && s.polygon.length > 2) && edgesOf(s.polygon).forEach(e => segs.push({ e, id: s.id })));
    (m.members || []).filter(x => x.type === 'column' && nodes[x.i]).forEach(x => { const n = nodes[x.i]; segs.push({ e: [[n.x, n.y], [n.x, n.y]], id: x.id }); });
    return segs;
  }
  function siteCheck(m, cfg, L) {
    cfg = cfg || {}; L = L || classify(m); const off = cfg.off || {}, out = [];
    const B = cfg.boundary && cfg.boundary.length > 2 ? cfg.boundary : null, E = B ? edgesOf(B) : [];
    const use = cfg.use || 'other', H = L.H, lines = buildingLines(m);
    const distTo = e => lines.reduce((o, s) => { const d = segSeg(s.e[0], s.e[1], e[0], e[1]); return d < o.d ? { d, id: s.id } : o; }, { d: Infinity, id: '' });
    const row = (code, title, status, detail, need) => out.push({ code, title, status, detail, need: need || '' });
    // ข้อ 33
    if (off.c33) row('ข้อ 33', 'ที่ว่างรอบอาคาร', 'off', 'ผู้ใช้เลือกไม่คิดข้อนี้');
    else {
      const land = B ? polyArea(B) : (+cfg.landArea || 0);
      const roofA = (m.roofs || []).reduce((a, r) => a + (r.outline ? polyArea(r.outline) : 0), 0);
      const covered = (roofA || L.areaMax) + (+cfg.coverExtra || 0), ratio = use === 'res' ? 0.30 : 0.10, need = r2(ratio * L.areaMax);
      if (!land) row('ข้อ 33', 'ที่ว่างรอบอาคาร', 'missing', 'ไม่มีขนาดที่ดิน', 'ใช้เขตที่ดินจากโมเดล หรือกรอกพื้นที่ดิน');
      else { const open = r2(land - covered); row('ข้อ 33', `ที่ว่าง ≥ ${ratio * 100}% ของพื้นที่ชั้นที่มากที่สุด`, open >= need ? 'pass' : 'fail',
        `ที่ดิน ${r2(land)} − ปกคลุม ${r2(covered)} (หลังคา${cfg.coverExtra ? ' + อื่น ' + cfg.coverExtra : ''}) = ที่ว่าง ${open} ตร.ม. · ต้องการ ${need} ตร.ม. (${ratio * 100}% × ${L.areaMax})`); }
    }
    // ข้อ 41 / 44: ถนนสาธารณะ
    const roads = (cfg.roads || []).filter(r => r && +r.width > 0 && E[+r.edge]);
    const big = L.storeys > 2 || H > 8 || ['public', 'commercial'].includes(use);
    // ข้อ 45/46: ถนนสองสายขนาดไม่เท่ากัน (ขนาบ = ด้านตรงข้ามขนานกัน · หัวมุม = ด้านติดกัน) — ความสูงวัดถึงเขตฝั่งตรงข้ามของสายที่กว้างกว่า
    const pts = lines.flatMap(x => x.e), uv = e => { const dx = e[1][0] - e[0][0], dy = e[1][1] - e[0][1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const lineDist = (p, e) => { const u = uv(e); return Math.abs((p[0] - e[0][0]) * u[1] - (p[1] - e[0][1]) * u[0]); };
    const along = e => { const u = uv(e), pr = pts.map(p => p[0] * u[0] + p[1] * u[1]); return pr.length ? Math.max(...pr) - Math.min(...pr) : 0; };
    let two = null;
    if (roads.length >= 2) {
      const srt = roads.slice().sort((a, b) => +b.width - +a.width), wide = srt[0], narrow = srt.find(r => +r.width < +wide.width);
      if (narrow) {
        const ew = E[+wide.edge], en = E[+narrow.edge], cos = Math.abs(uv(ew)[0] * uv(en)[0] + uv(ew)[1] * uv(en)[1]);
        if (cos > 0.9) { const gap = r2(lineDist([(en[0][0] + en[1][0]) / 2, (en[0][1] + en[1][1]) / 2], ew)), bw = r2(along(ew)); two = { kind: 45, wide, narrow, gap, bw, applies: gap <= 60 && bw <= 60 }; }
        else if (cos < 0.5) two = { kind: 46, wide, narrow, ln: r2(along(en)), applies: true };
      }
    }
    const viaTwo = two && two.applies && !off.c45 ? two.narrow : null;
    ['c41', 'c44'].forEach(k => {
      const code = k === 'c41' ? 'ข้อ 41' : 'ข้อ 44', title = k === 'c41' ? 'ร่นแนวอาคารจากถนนสาธารณะ' : 'ความสูงอาคาร ≤ 2 เท่าของระยะถึงเขตฝั่งตรงข้ามถนน';
      if (off[k]) return row(code, title, 'off', 'ผู้ใช้เลือกไม่คิดข้อนี้');
      if (!B) return row(code, title, 'missing', 'ไม่มีเขตที่ดิน', 'ใช้เขตที่ดินจากโมเดล');
      if (!roads.length) return row(code, title, 'missing', 'ยังไม่ระบุถนนสาธารณะ', 'เพิ่มถนน: เลือกด้านเขตที่ดินที่ติดถนน + ความกว้าง');
      roads.forEach(r => {
        const w = +r.width, dd = distTo(E[+r.edge]), d = r2(dd.d), lbl = edgeLabel(B, +r.edge) + ` ถนนกว้าง ${w} ม.`;
        if (k === 'c41') {
          let need, ref, ok;
          if (big && w < 10) { need = 6; ref = 'ห่างกึ่งกลางถนน'; ok = d + w / 2 >= 6; }
          else if (big && w <= 20) { need = r2(w / 10); ref = 'ห่างเขตถนน'; ok = d >= need; }
          else if (big) { need = 2; ref = 'ห่างเขตถนน'; ok = d >= 2; }
          else if (w < 6) { need = 3; ref = 'ห่างกึ่งกลางถนน'; ok = d + w / 2 >= 3; }
          else return row(code, title, 'na', `${lbl}: อาคารไม่เกิน 2 ชั้น/8 ม. และไม่ใช่อาคารสาธารณะ/พาณิชย์ ถนน ≥ 6 ม. — ข้อ 41 ไม่กำหนดระยะ`);
          const have = ref === 'ห่างกึ่งกลางถนน' ? r2(d + w / 2) : d;
          row(code, title, ok ? 'pass' : 'fail', `${lbl}: แนวอาคาร (${dd.id}) ${ref} ${have} ม. · ต้อง ≥ ${need} ม.${big ? ' (อาคาร > 2 ชั้น/> 8 ม./สาธารณะ/พาณิชย์)' : ''}`);
        } else {
          if (r === viaTwo) return row(code, title, 'na', `${lbl}: ใช้ข้อ ${two.kind} แทน (วัดถึงเขตฝั่งตรงข้ามของถนนสายที่กว้างกว่า)`);
          const lim = r2(2 * (d + w)); row(code, title, H <= lim ? 'pass' : 'fail', `${lbl}: สูง ${H.toFixed(2)} ม. · ระยะถึงเขตฝั่งตรงข้าม ${r2(d + w)} ม. → สูงได้ ≤ ${lim} ม.`);
        }
      });
    });
    // ข้อ 42: แหล่งน้ำสาธารณะ — กว้าง < 10 ม. ร่น ≥ 3 ม. · ≥ 10 ม. ร่น ≥ 6 ม. · บึง ทะเลสาบ ทะเล ร่น ≥ 12 ม. (เว้น สะพาน เขื่อน รั้ว ท่าเรือ ป้าย ที่จอดรถ)
    const waters = (cfg.waters || []).filter(x => x && E[+x.edge] && (x.kind === 'large' || +x.width > 0));
    const T42 = 'ร่นแนวอาคารจากแหล่งน้ำสาธารณะ';
    if (off.c42) row('ข้อ 42', T42, 'off', 'ผู้ใช้เลือกไม่คิดข้อนี้');
    else if (!B) row('ข้อ 42', T42, (cfg.waters || []).length ? 'missing' : 'na', (cfg.waters || []).length ? 'ไม่มีเขตที่ดิน' : 'ไม่ได้ระบุแหล่งน้ำสาธารณะติดที่ดิน', (cfg.waters || []).length ? 'ใช้เขตที่ดินจากโมเดล' : '');
    else if (!waters.length) row('ข้อ 42', T42, (cfg.waters || []).length ? 'missing' : 'na', (cfg.waters || []).length ? 'ยังไม่ใส่ความกว้างแหล่งน้ำ' : 'ไม่ได้ระบุแหล่งน้ำสาธารณะติดที่ดิน (ถ้ามี ให้เพิ่ม)', (cfg.waters || []).length ? 'กรอกความกว้าง หรือเลือกชนิด บึง/ทะเลสาบ/ทะเล' : '');
    else waters.forEach(x => {
      const big = x.kind === 'large', need = big ? 12 : (+x.width < 10 ? 3 : 6), dd = distTo(E[+x.edge]), d = r2(dd.d);
      const lbl = edgeLabel(B, +x.edge) + (big ? ' บึง/ทะเลสาบ/ทะเล' : ` แหล่งน้ำกว้าง ${+x.width} ม.`);
      row('ข้อ 42', T42, d >= need ? 'pass' : 'fail', `${lbl}: แนวอาคาร (${dd.id}) ห่างเขตแหล่งน้ำ ${d} ม. · ต้อง ≥ ${need} ม.`);
    });
    // ข้อ 45 / 46
    if (off.c45) row('ข้อ 45/46', 'อาคารติดถนนสาธารณะสองสายขนาดไม่เท่ากัน', 'off', 'ผู้ใช้เลือกไม่คิดข้อนี้');
    else if (!two) row('ข้อ 45/46', 'อาคารติดถนนสาธารณะสองสายขนาดไม่เท่ากัน', 'na', roads.length >= 2 ? 'ถนนกว้างเท่ากัน หรือแนวถนนไม่ใช่ด้านตรงข้าม/หัวมุม' : 'ไม่มีถนนสาธารณะสองสาย');
    else {
      const ww = +two.wide.width, dw = distTo(E[+two.wide.edge]), lim = r2(2 * (r2(dw.d) + ww)), hOk = H <= lim;
      const hTxt = `สูง ${H.toFixed(2)} ม. · ระยะถึงเขตฝั่งตรงข้ามถนนกว้าง ${ww} ม. ${r2(r2(dw.d) + ww)} ม. → สูงได้ ≤ ${lim} ม.`;
      if (two.kind === 45) {
        if (!two.applies) row('ข้อ 45', 'ถนนสองสายขนาบ ขนาดไม่เท่ากัน', 'na', `ระยะระหว่างถนน ${two.gap} ม. · อาคารกว้างตามถนนสายกว้าง ${two.bw} ม. — เกิน 60 ม. ไม่เข้าข้อ 45 ใช้ข้อ 44 รายถนน`);
        else row('ข้อ 45', 'ถนนสองสายขนาบ ขนาดไม่เท่ากัน (ระยะ ≤ 60 ม.)', hOk ? 'pass' : 'fail', `${hTxt} · ระยะระหว่างถนน ${two.gap} ม. · อาคารกว้างตามถนนสายกว้าง ${two.bw} ม.`);
      } else {
        const lOk = two.ln <= 60;
        row('ข้อ 46', 'อาคารหัวมุมถนนสองสายขนาดไม่เท่ากัน', hOk && lOk ? 'pass' : 'fail', `${hTxt} · ยาวตามถนนสายแคบ ${two.ln} ม. ต้อง ≤ 60 ม. (ห้องแถว/ตึกแถว ≤ 15 ม.)`);
      }
    }
    // ข้อ 50
    if (off.c50) row('ข้อ 50', 'ผนังมีช่องเปิดห่างเขตที่ดิน', 'off', 'ผู้ใช้เลือกไม่คิดข้อนี้');
    else if (!B) row('ข้อ 50', 'ผนังมีช่องเปิดห่างเขตที่ดิน', 'missing', 'ไม่มีเขตที่ดิน', 'ใช้เขตที่ดินจากโมเดล');
    else if (H >= 23) row('ข้อ 50', 'ผนังมีช่องเปิดห่างเขตที่ดิน', 'na', `สูง ${H.toFixed(2)} ม. ≥ 23 ม. — ใช้กฎกระทรวงอาคารสูง`);
    else {
      const need = H <= 9 ? 2 : 3, withOpen = new Set((m.openings || []).map(o => o.wall));
      let worst = null, nFail = 0;
      (m.walls || []).forEach(w => {
        const segs = edgesOf(w.path || []).slice(0, Math.max(0, (w.path || []).length - 1)); if (!segs.length) return;
        const d = r2(Math.min(...segs.flatMap(s => E.map(e => segSeg(s[0], s[1], e[0], e[1]))))), op = withOpen.has(w.id);
        const bad = op ? d < need : (d > 0 && d < 0.5);
        if (bad) nFail++;
        if (!worst || (bad && !worst.bad) || (bad === worst.bad && d < worst.d)) worst = { id: w.id, d, op, bad };
      });
      if (!worst) row('ข้อ 50', 'ผนังมีช่องเปิดห่างเขตที่ดิน', 'missing', 'ไม่มีผนังในโมเดล');
      else row('ข้อ 50', `ผนังมีช่องเปิดห่างเขตที่ดิน ≥ ${need} ม. (สูง ${H <= 9 ? '≤ 9' : '9–23'} ม.)`, nFail ? 'fail' : 'pass',
        nFail ? `${nFail} ผนังไม่ผ่าน · เช่น ${worst.id} ${worst.op ? 'มีช่องเปิด' : 'ผนังทึบ'} ห่างเขต ${worst.d} ม. (ผนังทึบห่างได้ ≥ 0.50 ม. หรือชิดเขตถ้าสูง ≤ 15 ม. + หนังสือยินยอม)`
          : `ผนังใกล้เขตที่สุด ${worst.id} ห่าง ${worst.d} ม.${worst.op ? ' (มีช่องเปิด)' : ' (ผนังทึบ)'} · ยังไม่ตรวจระเบียง (โมเดลไม่มีข้อมูลระเบียง)`);
    }
    return out;
  }
  return { check, classify, siteCheck, edgeLabel, buildingLines, memberBox, segInBox, boxOverlap, dia, ROOM_RULES };
});
