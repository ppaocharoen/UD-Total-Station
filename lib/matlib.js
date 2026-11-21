/* UD MatLib — คลังวัสดุ: ลายวัสดุ (วาดจากเว็บ) + เปลี่ยนวัสดุงานผิวแล้วแยกแถว BOQ ให้ตรง tools/takeoff.py (M2b ก้อน 6 · Earth 21 พ.ย. 2569)
 *
 * วัสดุ (คลังกลาง Firestore `materials` / สำเนาใน .boq.json mats):
 *   { id, name, cls: 'clad'|'paint'|'ground', kinds: ['floor','wall','ceiling','counter','skirting'], spec: ข้อความรายการ BOQ (clad),
 *     look: { pat, color, color2, grout, gw (มม.), cell: [กว้าง, ยาว] ม. }, sug: { mat, lab } (การผูกราคาแนะนำ — คำแนะนำเท่านั้น), by, byName, at }
 *   cls clad = ปู/กรุ/บุผิว → แถว fin_<ชนิด>_<spec> · paint = ฉาบทาสี (เปลี่ยนสีใน 3D · ผิวโครงสร้าง → ฉาบโครงสร้าง+ทาสี) · ground = ผิวดินรอบอาคาร (ไม่มีแถว BOQ)
 * การเลือก (.boq.json matsel): { piece: { <id งานผิว | '@ground'>: matId | '' (= ตามแบบ) }, type: { <typeKey>: matId } } — ชิ้นนี้มาก่อนกฎทั้งชนิด
 *
 * ขอบเขตก้อน 6 (Earth 21 พ.ย.): เปลี่ยนได้เฉพาะงานผิวที่คิดปริมาณจากงานผิวโดยตรง (พื้น ฝ้า ผนังกรุ บัว เคาน์เตอร์ ผิวโครงสร้าง)
 *   ผิวผนังทาสี (counted_by: wall — ปริมาณฉาบ/ทาสีคิดจากผนัง) เปลี่ยนได้เฉพาะวัสดุทาสี (สีใน 3D ไม่กระทบ BOQ) · ทาสี → กรุผิว ไว้ก้อน 6b
 * แยกแถว: ชิ้นที่เปลี่ยนย้ายปริมาณออกจากแถวเดิมไปแถวที่ takeoff.py จะได้ถ้าแก้ spec ในโมเดล (มีแถวรายการเดียวกันอยู่แล้ว → รวม)
 *   ปริมาณของงานผิวคิดใหม่ตามสูตร takeoff.py (_finishes) · ชิ้นอื่นในแถวเดียวกันที่ไม่ใช่งานผิว (เช่น ทาสีผนัง) ใช้ by_src · ปัด 2 ตำแหน่งต่อแถว
 *   ทดสอบเทียบ: tools/test_matlib.py (แก้ spec ในโมเดลแล้วรัน takeoff.py)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MatLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = x => Math.sign(x) * Math.floor(Math.abs(x) * 100 + 0.5 + 1e-9) / 100;   // = r2() ของ takeoff.py
  const r4 = x => Math.round(x * 1e4) / 1e4;
  const GROUP = { '1.2.2': 'งานฝ้าเพดาน', '1.2.4': 'งานฉาบปูน', '1.2.5': 'งานวัสดุผิวพื้นและผนัง', '1.2.7': 'งานทาสี' };
  const CODE = { floor: '1.2.5', wall: '1.2.5', skirting: '1.2.5', counter: '1.2.5', railing: '1.2.5', ceiling: '1.2.2', other: '1.2.5' };
  const SRC = 'tools/takeoff.py (หลักเกณฑ์อาคาร 2569)';
  const CLAD_KINDS = ['floor', 'wall', 'ceiling', 'counter', 'skirting'];
  const KIND_TH = { floor: 'พื้น', wall: 'ผนัง/ผิวโครงสร้าง', ceiling: 'ฝ้า', counter: 'เคาน์เตอร์', skirting: 'บัว' };
  const CLS_TH = { clad: 'ปู/กรุ/บุผิว', paint: 'ฉาบทาสี', ground: 'ผิวดิน' };
  const GROUND = '@ground';

  // ------------------------------------------------------------------ ลายวัสดุ
  const PAT = {   // ค่าเริ่มของแต่ละลาย · cell = ขนาดแผ่น/หน่วยลาย (ม.)
    plain: { th: 'สีเรียบ', color: '#e9e5dc' },
    concrete: { th: 'คอนกรีตเปลือย', color: '#a7a7a1', color2: '#8d8d87', cell: [1.2, 0.6] },
    tile: { th: 'กระเบื้อง', color: '#eef3f6', grout: '#9fb0ba', gw: 3, cell: [0.3, 0.3] },
    granito: { th: 'แกรนิตโต้', color: '#cfc9bd', color2: '#8f877a', grout: '#a49d90', gw: 2, cell: [0.6, 0.6] },
    washed: { th: 'ทรายล้าง', color: '#c8b89a', color2: '#7d6f5a', cell: [0.5, 0.5] },
    brick: { th: 'อิฐ/บล็อกเรียงสลับ', color: '#b4583c', grout: '#d8d0c4', gw: 10, cell: [0.2, 0.065] },
    wood: { th: 'ไม้แผ่น', color: '#a8794e', color2: '#7f5636', gw: 2, cell: [1.2, 0.15] },
    soil: { th: 'ดิน', color: '#8a6a48', color2: '#6b5036', cell: [1.5, 1.5] },
    grass: { th: 'หญ้า', color: '#4f7f3a', color2: '#6fa04d', cell: [1, 1] },
  };
  const PAT_FOR = { clad: ['plain', 'concrete', 'tile', 'granito', 'washed', 'brick', 'wood'], paint: ['plain'], ground: ['soil', 'grass', 'concrete', 'washed', 'plain'] };
  /** ลายครบค่า (เติมค่าเริ่ม) */
  function lookOf(lk) {
    const l = Object.assign({ pat: 'plain' }, lk || {}), d = PAT[l.pat] || PAT.plain;
    ['color', 'color2', 'grout', 'gw'].forEach(k => { if (l[k] === undefined || l[k] === '' || l[k] === null) l[k] = d[k]; });
    const c = Array.isArray(l.cell) ? l.cell.map(Number) : null;
    l.cell = c && c[0] > 0 && c[1] > 0 ? c : (d.cell || [1, 1]).slice();
    return l;
  }
  /** หน่วยลายที่ภาพ 1 ภาพครอบคลุม (ม.) — อิฐ 2 ก้อน × 2 แถว · ไม้ 1 แผ่น × 2 แถว (รอยต่อสลับ) */
  function repeatOf(lk) {
    const l = lookOf(lk); if (l.pat === 'plain') return null;
    if (l.pat === 'brick') return [2 * l.cell[0], 2 * l.cell[1]];
    if (l.pat === 'wood') return [l.cell[0], 2 * l.cell[1]];
    return l.cell.slice();
  }
  const hex = c => { const s = String(c || '').replace('#', ''); return /^[0-9a-f]{6}$/i.test(s) ? parseInt(s, 16) : 0xcccccc; };
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const shade = (c, f) => { const v = hex(c), ch = k => Math.max(0, Math.min(255, Math.round(((v >> k) & 255) * f))); return '#' + [16, 8, 0].map(k => ch(k).toString(16).padStart(2, '0')).join(''); };
  /** วาดลาย 1 หน่วยลาย (repeatOf) ลง ctx ขนาด W×H px — ภาพต่อกันได้ไร้รอย */
  function draw(ctx, lk, W, H) {
    const l = lookOf(lk), R = rng(hex(l.color) ^ (hex(l.color2) << 3) ^ 0x9e37);
    const rep = repeatOf(l) || [1, 1], pxm = W / rep[0], gpx = Math.max(1, (l.gw || 0) / 1000 * pxm);   // ร่องยาแนว (px) ตามขนาดจริง ไม่บางกว่า 1 px
    ctx.fillStyle = l.color; ctx.fillRect(0, 0, W, H);
    const dots = (n, cols, s0, s1) => { for (let i = 0; i < n; i++) { ctx.fillStyle = cols[i % cols.length]; const s = s0 + R() * (s1 - s0); ctx.fillRect(R() * W, R() * H, s, s); } };
    const grout = (x, y, w, h) => { ctx.fillStyle = l.grout; ctx.fillRect(x, y, w, h); };
    if (l.pat === 'concrete') {
      for (let i = 0; i < 90; i++) { ctx.fillStyle = (i % 2 ? l.color2 : shade(l.color, 1.08)) + '33'; const r = 4 + R() * 18; ctx.beginPath(); ctx.arc(R() * W, R() * H, r, 0, 7); ctx.fill(); }
      dots(260, [shade(l.color, 0.7), shade(l.color, 1.15)], 1, 2);
      ctx.fillStyle = shade(l.color, 0.82); [0.25, 0.75].forEach(f => { ctx.beginPath(); ctx.arc(W * f, H * 0.5, Math.max(1.5, W / 80), 0, 7); ctx.fill(); });   // รูน็อตแบบหล่อ
      ctx.fillStyle = shade(l.color, 0.88); ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, 0, 1, H);
    } else if (l.pat === 'tile') {
      grout(0, 0, W, gpx / 2); grout(0, H - gpx / 2, W, gpx / 2); grout(0, 0, gpx / 2, H); grout(W - gpx / 2, 0, gpx / 2, H);
    } else if (l.pat === 'granito') {
      dots(Math.round(W * H / 40), [l.color2, shade(l.color, 1.12), shade(l.color2, 1.25)], 1, 2.6);
      grout(0, 0, W, gpx / 2); grout(0, H - gpx / 2, W, gpx / 2); grout(0, 0, gpx / 2, H); grout(W - gpx / 2, 0, gpx / 2, H);
    } else if (l.pat === 'washed') {
      dots(Math.round(W * H / 6), [l.color2, shade(l.color, 1.18), shade(l.color, 0.78), shade(l.color2, 1.4)], 1.2, 3.2);
    } else if (l.pat === 'brick') {
      const bw = W / 2, bh = H / 2; ctx.fillStyle = l.grout; ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < 2; r++) for (let k = -1; k < 3; k++) {
        ctx.fillStyle = shade(l.color, 0.9 + R() * 0.2); ctx.fillRect(k * bw + (r % 2) * bw / 2 + gpx / 2, r * bh + gpx / 2, bw - gpx, bh - gpx);
      }
    } else if (l.pat === 'wood') {
      const ph = H / 2;
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = shade(l.color, r ? 0.94 : 1.04); ctx.fillRect(0, r * ph, W, ph);
        for (let i = 0; i < 14; i++) { ctx.strokeStyle = l.color2 + '55'; ctx.lineWidth = 1; const y = r * ph + R() * ph; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y + (R() - 0.5) * ph * 0.3, W * 0.7, y + (R() - 0.5) * ph * 0.3, W, y); ctx.stroke(); }
        ctx.fillStyle = l.color2; ctx.fillRect(0, r * ph, W, Math.max(1, gpx / 2)); ctx.fillRect(0, (r + 1) * ph - Math.max(1, gpx / 2), W, Math.max(1, gpx / 2));
        const x = r ? W / 2 : 0; ctx.fillRect(x, r * ph, Math.max(1, gpx), ph);   // รอยต่อหัวแผ่นสลับ
      }
    } else if (l.pat === 'soil') {
      dots(Math.round(W * H / 5), [l.color2, shade(l.color, 1.2), shade(l.color, 0.85), '#9b8a70'], 1, 3.5);
    } else if (l.pat === 'grass') {
      dots(Math.round(W * H / 10), [shade(l.color, 0.75), shade(l.color, 1.1)], 1, 3);
      for (let i = 0; i < Math.round(W * H / 14); i++) { const x = R() * W, y = R() * H, h = 3 + R() * 7; ctx.strokeStyle = R() < 0.5 ? l.color2 : shade(l.color2, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 4, y - h); ctx.stroke(); }
    }
  }
  /** ภาพตัวอย่าง (สี่เหลี่ยมขนาด w×h ม.) สำหรับรายการในคลัง/หน้าแก้ */
  function swatch(canvas, lk, metres) {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, rep = repeatOf(lk);
    if (!rep) { ctx.fillStyle = lookOf(lk).color; ctx.fillRect(0, 0, W, H); return; }
    const m = metres || Math.max(rep[0], rep[1]) * 2.2, pw = Math.max(4, W * rep[0] / m), ph = Math.max(4, H * rep[1] / m);
    const t = document.createElement('canvas'); t.width = Math.round(pw); t.height = Math.round(ph); draw(t.getContext('2d'), lk, t.width, t.height);
    ctx.fillStyle = ctx.createPattern(t, 'repeat'); ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------------ ชิ้นที่เปลี่ยนได้
  /** ชนิดชิ้นงานผิว: 'clad' (คิดจากงานผิว) · 'struct' (ผิวโครงสร้าง) · 'paint' (ผิวผนังทาสี counted_by wall) · null = เปลี่ยนไม่ได้ */
  function pieceClass(f) {
    if (!f) return null;
    if (f.counted_by === 'wall') return 'paint';
    if (f.kind === 'struct') return (f.faces || []).length ? 'struct' : null;
    return CLAD_KINDS.includes(f.kind) ? 'clad' : null;
  }
  const kindOfPiece = f => (f.kind === 'struct' || f.counted_by === 'wall') ? 'wall' : f.kind;
  /** วัสดุนี้ใช้กับชิ้นนี้ได้ไหม */
  function accepts(f, mat) {
    if (!mat) return false;
    if (f === GROUND || (f && f.id === GROUND)) return mat.cls === 'ground';
    const pc = pieceClass(f); if (!pc || mat.cls === 'ground') return false;
    const kOk = (mat.kinds || []).includes(kindOfPiece(f));
    if (pc === 'paint') return mat.cls === 'paint' && kOk;
    if (pc === 'struct') return (mat.cls === 'paint' || mat.cls === 'clad') && kOk;
    return mat.cls === 'clad' && kOk;
  }
  /** กุญแจ "ชนิดเดียวกัน" — ชนิดงานผิว + ทาสี/ไม่ + ป้ายผิว + รายการตามแบบ */
  const typeKey = f => [f.kind, f.counted_by === 'wall' ? 'c' : '', f.tag || '', f.spec || ''].join('|');
  /** วัสดุที่ใช้จริงของแต่ละชิ้น: { id งานผิว: วัสดุ } (เฉพาะที่เปลี่ยน) · sel = matsel · mats = { id: วัสดุ } */
  function effective(model, sel, mats) {
    const out = {}, P = (sel && sel.piece) || {}, T = (sel && sel.type) || {}, M = mats || {};
    (model.finishes || []).forEach(f => {
      let id = Object.prototype.hasOwnProperty.call(P, f.id) ? P[f.id] : T[typeKey(f)];
      const m = id && M[id]; if (m && accepts(f, m)) out[f.id] = m;
    });
    const g = P[GROUND] && M[P[GROUND]]; if (g && g.cls === 'ground') out[GROUND] = g;
    return out;
  }

  // ------------------------------------------------------------------ ปริมาณ (สูตรเดียวกับ tools/takeoff.py _finishes)
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const polyArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
  const fmt2 = x => x.toFixed(2);
  /** รายการปริมาณที่งานผิว f ให้ (ตาม takeoff.py) เมื่อใช้วัสดุ mat (null = ตามแบบ): [{code, key, name, unit, q, task, calc, spec}] */
  function contribs(f, mat, model) {
    if (f.counted_by === 'wall') return [];
    const out = [];
    if (f.kind === 'struct') {
      (f.faces || []).forEach(fc => {
        const w = dist(fc.p[0], fc.p[1]), h = fc.z[1] - fc.z[0], a = w * h; if (a < 1e-4) return;
        const sd = fc.ext ? 'ext' : 'int', nm = sd === 'ext' ? 'ภายนอก' : 'ภายใน', calc = `กว้าง ${fmt2(w)} × สูง ${fmt2(h)}`;
        const paint = mat ? mat.cls === 'paint' : String(fc.tag === undefined ? '1' : fc.tag) === '1';
        if (paint) {
          out.push({ code: '1.2.4', key: `plaster_struct_${sd}`, name: `ฉาบปูนโครงสร้าง (เสา คาน) ${nm}`, unit: 'ตร.ม.', q: a, task: 'plaster', calc, spec: { t: 'plaster', side: sd, struct: true } });
          out.push({ code: '1.2.7', key: `paint_${sd}`, name: `ทาสีน้ำอะคริลิก${nm}`, unit: 'ตร.ม.', q: a, task: 'paint', calc });
        } else {
          const sp = mat ? mat.spec : (fc.spec || f.spec);
          out.push({ code: '1.2.5', key: `fin_wall_${sp}`, name: sp, unit: 'ตร.ม.', q: a, task: 'finish', calc, spec: { t: 'finish', kind: 'wall', desc: sp } });
        }
      });
      return out;
    }
    if (!CODE[f.kind]) return out;
    let q, unit;
    if (f.qty !== undefined && f.qty !== null) { q = f.qty; unit = f.unit || ''; }
    else if (f.rects && f.rects.length) { q = f.rects.reduce((s, r) => s + Math.abs(r[2] - r[0]) * Math.abs(r[3] - r[1]), 0); unit = 'ตร.ม.'; }
    else if (f.polygon) { q = polyArea(f.polygon) - (f.holes || []).reduce((s, h) => s + polyArea(h), 0); unit = 'ตร.ม.'; }
    else if (f.wall && f.height) {
      const w = (model.walls || []).find(x => x.id === f.wall), pts = w ? w.path : [];
      let L = 0; for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
      q = L * f.height; unit = 'ตร.ม.';
    } else return out;
    if (['skirting', 'railing', 'counter'].includes(f.kind) && !f.unit) unit = 'ม.';
    const sp = mat ? mat.spec : f.spec;
    out.push({ code: CODE[f.kind], key: `fin_${f.kind}_${sp}`, name: sp, unit, q, task: f.kind === 'ceiling' ? 'ceiling' : 'finish', spec: { t: 'finish', kind: f.kind, desc: sp } });
    return out;
  }

  /** แยกแถว BOQ ตามวัสดุที่เปลี่ยน: items = quantities.items จาก takeoff.py → items ชุดใหม่ (ไม่แก้ของเดิม)
   *  แถวที่ได้รับผลมี mat_swap: [{ id งานผิว, mat, name }] (ไว้แสดงป้ายบนจอ) */
  function apply(items, model, sel, mats) {
    const eff = effective(model, sel, mats), fins = {};
    (model.finishes || []).forEach(f => { fins[f.id] = f; });
    const changed = Object.keys(eff).filter(id => {
      const f = fins[id], m = eff[id]; if (!f) return false;
      const pc = pieceClass(f); if (pc === 'paint') return false;
      if (pc === 'clad') return m.spec !== f.spec;
      return true;   // ผิวโครงสร้าง: คิดใหม่ทุกหน้า
    });
    if (!changed.length) return items;
    const chg = new Set(changed), touched = new Set();
    items.forEach(r => { if (r.by_src && changed.some(id => r.by_src[id])) touched.add(r.key); });
    const newC = {}; changed.forEach(id => { newC[id] = contribs(fins[id], eff[id], model); newC[id].forEach(c => touched.add(c.key)); });
    const byKey = {}; items.forEach(r => { byKey[r.key] = r; });
    const cache = {}, cOf = id => cache[id] || (cache[id] = chg.has(id) ? newC[id] : contribs(fins[id], eff[id] || null, model));
    const meta = {};   // เมตาแถวใหม่จาก contribution แรก
    changed.forEach(id => newC[id].forEach(c => { if (!byKey[c.key] && !meta[c.key]) meta[c.key] = c; }));
    const built = {};
    touched.forEach(key => {
      const r0 = byKey[key], waste = r0 ? (r0.waste || 0) : 0;
      const srcs = [];
      if (r0) (r0.from || []).forEach(s => { if (!srcs.includes(s)) srcs.push(s); });
      changed.forEach(id => { if (newC[id].some(c => c.key === key) && !srcs.includes(id)) srcs.push(id); });
      const taskOf0 = s => { const bt = (r0 && r0.by_task) || {}; for (const t of Object.keys(bt)) if ((bt[t].from || []).includes(s)) return t; return (r0 && r0.task) || 'other'; };
      let raw = 0; const bySrc = {}, calc = {}, parts = {}, from = [], swaps = [];
      srcs.forEach(s => {
        let q = 0, cl = [], task = null;
        const f = fins[s];
        if (f && f.counted_by !== 'wall') {
          const cs = cOf(s).filter(c => c.key === key);
          cs.forEach(c => { q += c.q; if (c.calc) cl.push(c.calc); task = task || c.task; });
        } else { q = (r0 && r0.by_src && r0.by_src[s]) || 0; cl = ((r0 && r0.calc) || {})[s] || []; }
        if (!(q > 0)) return;
        raw += q; from.push(s); bySrc[s] = (bySrc[s] || 0) + q; if (cl.length) calc[s] = cl;
        const t = task || taskOf0(s); (parts[t] = parts[t] || { q: 0, from: [] }).q += q; if (!parts[t].from.includes(s)) parts[t].from.push(s);
        if (chg.has(s)) swaps.push({ id: s, mat: eff[s].id, name: eff[s].name });
      });
      if (!from.length) { built[key] = null; return; }   // ไม่เหลือชิ้นใด → แถวหายเหมือน takeoff.py
      const c0 = meta[key];
      const row = r0 ? Object.assign({}, r0) : { key, group_code: c0.code, group: GROUP[c0.code] || '', name: c0.name, unit: c0.unit, waste: 0, waste_included: false, task: c0.task, status: 'computed', src: SRC };
      if (!r0 && c0.spec) row.spec = c0.spec;
      row.qty = r2(raw * (1 + waste)); row.qty_net = r2(raw); row.from = from;
      row.by_src = {}; Object.keys(bySrc).forEach(s => { if (bySrc[s]) row.by_src[s] = r4(bySrc[s]); });
      if (Object.keys(calc).length) row.calc = calc; else delete row.calc;
      const tot = Object.values(parts).reduce((a, p) => a + p.q, 0);
      if (tot > 0) {
        row.by_task = {}; Object.entries(parts).sort((a, b) => b[1].q - a[1].q).forEach(([t, p]) => { row.by_task[t] = { share: r4(p.q / tot), from: p.from }; });
        row.task = Object.keys(row.by_task)[0];
      }
      if (swaps.length) row.mat_swap = swaps; else delete row.mat_swap;
      built[key] = row;
    });
    const out = [];
    items.forEach(r => { if (Object.prototype.hasOwnProperty.call(built, r.key)) { if (built[r.key]) out.push(built[r.key]); } else out.push(r); });
    Object.keys(built).filter(k => !byKey[k] && built[k]).forEach(k => {   // แถวใหม่: ต่อท้ายหมวดเดียวกัน
      const row = built[k]; let at = -1; out.forEach((r, i) => { if (r.group_code === row.group_code) at = i; });
      if (at < 0) { const ord = ['1.2.2', '1.2.4', '1.2.5', '1.2.7']; out.forEach((r, i) => { if (ord.indexOf(r.group_code) >= 0 && ord.indexOf(r.group_code) < ord.indexOf(row.group_code)) at = i; }); }
      out.splice(at + 1, 0, row);
    });
    return out;
  }

  // ------------------------------------------------------------------ ตรวจข้อมูลวัสดุ (ก่อนบันทึก/รับจากไฟล์ — ไม่เชื่อไฟล์)
  function clean(m) {
    const s = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
    const col = v => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : undefined;
    const cls = ['clad', 'paint', 'ground'].includes(m && m.cls) ? m.cls : 'clad';
    const lk = (m && m.look) || {}, pat = PAT[lk.pat] ? lk.pat : 'plain';
    const look = { pat };
    ['color', 'color2', 'grout'].forEach(k => { const c = col(lk[k]); if (c) look[k] = c; });
    if (+lk.gw >= 0 && +lk.gw <= 50) look.gw = +lk.gw;
    if (Array.isArray(lk.cell) && +lk.cell[0] > 0 && +lk.cell[1] > 0) look.cell = [Math.min(20, +lk.cell[0]), Math.min(20, +lk.cell[1])].map(v => Math.round(v * 1e4) / 1e4);
    const out = { id: s(m && m.id, 60), name: s(m && m.name, 200), cls, kinds: cls === 'ground' ? [] : [...new Set(((m && m.kinds) || []).filter(k => CLAD_KINDS.includes(k)))],
      spec: cls === 'clad' ? s(m && m.spec, 300) : '', look };
    const sg = m && m.sug, sgc = v => v && typeof v === 'object' && ['mat', 'comp', 'survey', 'wage', 'none'].includes(v.kind) ? { kind: v.kind, code: s(v.code, 60), key: s(v.key, 200), label: s(v.label, 300) } : undefined;
    if (sg && (sgc(sg.mat) || sgc(sg.lab))) { out.sug = {}; if (sgc(sg.mat)) out.sug.mat = sgc(sg.mat); if (sgc(sg.lab)) out.sug.lab = sgc(sg.lab); }
    ['by', 'byName'].forEach(k => { if (m && m[k]) out[k] = s(m[k], 200); });
    if (m && +m.at > 0) out.at = +m.at;
    return out;
  }
  function problems(m) {
    const e = [];
    if (!m.name) e.push('ยังไม่มีชื่อวัสดุ');
    if (m.cls === 'clad' && !m.spec) e.push('ยังไม่มีข้อความรายการ BOQ');
    if (m.cls !== 'ground' && !m.kinds.length) e.push('ยังไม่ได้เลือกว่าใช้กับผิวชนิดใด');
    return e;
  }
  /** ผิวดินค่าเริ่ม (ไม่อยู่ในคลัง) */
  const BUILTIN = {
    'B-soil': { id: 'B-soil', name: 'ดิน', cls: 'ground', kinds: [], spec: '', look: { pat: 'soil' }, builtin: true },
    'B-grass': { id: 'B-grass', name: 'หญ้า', cls: 'ground', kinds: [], spec: '', look: { pat: 'grass' }, builtin: true },
  };

  return { PAT, PAT_FOR, CLAD_KINDS, KIND_TH, CLS_TH, GROUND, BUILTIN, lookOf, repeatOf, hex, draw, swatch,
    pieceClass, kindOfPiece, accepts, typeKey, effective, contribs, apply, clean, problems, r2 };
});
