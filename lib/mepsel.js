/* UD MepSel — เปลี่ยนชนิดท่อ/สายทั้งระบบ (ก้อน 6e · Earth 21 พ.ย. 2569) — ผลเท่ากับ tools/takeoff.py เมื่อแก้ชนิดในโมเดล
 *   ประปา (cw_material): PVC ชั้น 8.5 / 13.5 ↔ PP-R · โสโครก / น้ำทิ้ง / ระบายอากาศ แยกรายระบบ (soil_/waste_/vent_material): PVC ชั้น 5 / 8.5 / 13.5
 *   ท่อร้อยสาย (conduit + service.conduit): PVC สีขาว / PVC สีเหลือง / EMT / IMC (คงขนาดเดิม) · สายไฟ (wire_type): THW ↔ VCT / NYY
 *   - แถวท่อย้ายไปกุญแจ pipe_<ระบบ>_<ชนิดใหม่>_<ขนาด> (PP-R ชื่อขนาดเป็น มม. ตารางเดียวกับ takeoff.py) · แถว % ข้อต่อ/เหล็กยึด/ทดสอบ ย้ายรายการท่อไปกลุ่ม % ของชนิดใหม่
 *   - สายหลายแกน (VCT/NYY): 1 เส้นต่อวงจร จำนวนแกน = จำนวนสาย ยาวเท่าท่อ — ใช้ runs {แหล่ง: {จำนวนสาย: ยาว}} จาก takeoff.py (ไม่มี = ต้องถอดปริมาณใหม่)
 *   - sel = { cw, soil, waste, vent, conduit, wire } ('' / ไม่มี = ตามแบบ) — เก็บใน .boq.json `mepsel`
 * ใช้ได้ทั้งเว็บและ node (UMD)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MepSel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SYS_NAME = { cw: 'ประปา', hw: 'น้ำร้อน', waste: 'น้ำทิ้ง', soil: 'โสโครก', vent: 'ระบายอากาศ', rain: 'น้ำฝน', drain: 'ระบายน้ำ' };
  const PVC = ['PVC ชั้น 5', 'PVC ชั้น 8.5', 'PVC ชั้น 13.5'];
  /** ระบบที่เลือกได้ (ลำดับแสดงผล) */
  const SYSTEMS = [
    { k: 'cw', th: 'ท่อประปา', kind: 'pipe', opts: ['PVC ชั้น 8.5', 'PVC ชั้น 13.5', 'PP-R'] },
    { k: 'soil', th: 'ท่อโสโครก', kind: 'pipe', opts: PVC },
    { k: 'waste', th: 'ท่อน้ำทิ้ง', kind: 'pipe', opts: PVC },
    { k: 'vent', th: 'ท่อระบายอากาศ', kind: 'pipe', opts: PVC },
    { k: 'conduit', th: 'ท่อร้อยสายไฟ', kind: 'conduit', opts: ['PVC สีขาว', 'PVC สีเหลือง', 'EMT', 'IMC'] },
    { k: 'wire', th: 'สายไฟฟ้า', kind: 'wire', opts: ['IEC 01 (THW)', 'VCT', 'NYY'] },
  ];
  const OPT_TH = { 'PP-R': 'PP-R (ขนาด มม.)', 'EMT': 'EMT (ท่อบาง)', 'IMC': 'IMC (ท่อหนาปานกลาง)', 'IEC 01 (THW)': 'THW แกนเดียว', 'VCT': 'VCT หลายแกน', 'NYY': 'NYY หลายแกน' };
  // % ของค่าท่อ ตาม ว480 — เหมือน PIPE_PCT / PIPE_PCT_CODES ใน takeoff.py
  const PIPE_PCT = { 'SN-3.7': { name: 'PVC ระบายน้ำ', fit: 0.4, sup: 0.3, test: 0.1 }, 'SN-3.8': { name: 'PVC ประปา', fit: 0.5, sup: 0.3, test: 0.1 },
    'SN-3.10': { name: 'PP-R/PB/HDPE ประปา', fit: 0.5, sup: 0.2, test: 0.1 } };
  const PIPE_PCT_CODES = { 'SN-3.7': ['g/h', 'i/j', 'k/l'], 'SN-3.8': ['k/l', 'm/n', 'o/p'], 'SN-3.10': ['k/l', 'm/n', 'o/p'] };
  const PCT_PARTS = [['fit', 'ข้อต่อ ข้องอ อุปกรณ์'], ['sup', 'เหล็กยึดและรองรับท่อ'], ['test', 'ทดสอบ ทำความสะอาด ทาสีทำสัญลักษณ์ท่อ']];
  const PCT_RE = /^(fit|sup|test)_SN-3\.(7|8|10)$/;
  const PPR_MM = { 0.5: 20, 0.75: 25, 1: 32, 1.25: 40, 1.5: 50, 2: 63 };
  const CABLE_RE = /VCT|NYY/i;
  const DRAIN = ['soil', 'waste', 'vent', 'rain', 'drain'];

  const r2 = x => Math.sign(x) * Math.floor(Math.abs(x) * 100 + 0.5 + 1e-9) / 100;   // = r2 ของ takeoff.py
  const r4 = x => Math.round(x * 1e4) / 1e4;
  const g = x => String(+(+x).toFixed(6));                                                // Python :g (ค่าที่ใช้ในตาราง)
  const diaIn = s => { const m = /^\s*(\d+)?\s*(?:(\d+)\/(\d+))?\s*(?:"|”|นิ้ว)\s*$/.exec(String(s || '')); if (!m || !(m[1] || m[2])) return null; return (+m[1] || 0) + (m[2] ? m[2] / m[3] : 0); };
  const diaLabel = (mat, dia) => { if (/PP-?R/i.test(mat || '')) { const mm = PPR_MM[diaIn(dia)]; if (mm) return `${mm} มม.`; } return dia; };
  const grpOf = (sys, mat) => /PVC/i.test(mat) ? (DRAIN.includes(sys) ? 'SN-3.7' : 'SN-3.8') : (/PP-?R|PB|HDPE/i.test(mat) && (sys === 'cw' || sys === 'hw') ? 'SN-3.10' : null);
  const pyStr = v => v === null || v === undefined ? 'None' : String(v);                 // f"{size}" ของ Python
  /** ขนาดในชื่อท่อร้อยสาย เช่น 'PVC สีขาว 1/2"' → '1/2"' */
  const condSize = c => { const m = /(\d+(?:\s+\d+\/\d+|\/\d+)?\s*"|\d+\s*มม\.?)\s*$/.exec(String(c || '')); return m ? m[1] : ''; };
  const condType = c => String(c || '').slice(0, String(c || '').length - condSize(c).length).trim();

  /** ชนิดที่ใช้อยู่ตามโมเดล/ตัวถอด (ก่อนเลือก) — { cw: ['PVC ชั้น 13.5'], …, conduit: ['PVC สีขาว'], wire: ['IEC 01 (THW)'] } */
  function current(items) {
    const out = {}; SYSTEMS.forEach(s => { out[s.k] = []; });
    const add = (k, v) => { if (out[k] && v && !out[k].includes(v)) out[k].push(v); };
    (items || []).forEach(r => { const s = r.spec || {};
      if (s.t === 'pipe') add(s.sys, s.mat);
      else if (s.t === 'conduit') add('conduit', condType(s.conduit));
      else if (s.t === 'wire') add('wire', s.wire);
    });
    return out;
  }

  /** แถวใหม่จากแถวต้นทาง (ย้ายทั้งแถว หรือรวมหลายแถว) — ปริมาณ = รวม by_src × (1 + เผื่อ) ปัดแบบ takeoff.py */
  function build(key, srcRows, meta, bySrc, runs) {
    const r0 = srcRows[0], from = [], bs = {};
    Object.keys(bySrc).forEach(s => { if (bySrc[s]) { bs[s] = r4(bySrc[s]); from.push(s); } });
    const raw = Object.values(bySrc).reduce((a, v) => a + v, 0), w = r0.waste || 0;
    const row = Object.assign({}, r0, { key, name: meta.name, spec: meta.spec, qty: r2(raw * (1 + w)), qty_net: r2(raw), from,
      by_src: bs, by_task: { [r0.task || 'mep_rough']: { share: 1, from } }, status: srcRows.some(r => r.status === 'assumed') ? 'assumed' : r0.status });
    if (meta.note !== undefined) row.note = meta.note;
    if (runs) row.runs = runs; else delete row.runs;
    delete row.price_ref;   // ผูกใหม่ตาม spec (PriceMap.bindAll)
    return row;
  }

  /** ใช้การเลือก sel กับแถว BOQ → { items, moved: {กุญแจเดิม: กุญแจใหม่}, retake: [กุญแจสายที่ต้องถอดปริมาณใหม่] } */
  function apply(items, sel) {
    sel = sel || {};
    const any = SYSTEMS.some(s => sel[s.k]);
    if (!any || !items || !items.length) return { items: items || [], moved: {}, retake: [] };
    const plan = {}, order = [], moved = {}, retake = [];   // plan[กุญแจใหม่] = { rows, meta, bySrc, runs }
    const P = (key, r, meta) => { if (!plan[key]) { plan[key] = { rows: [], meta, bySrc: {}, runs: null }; order.push(key); } const p = plan[key]; if (!p.rows.includes(r)) p.rows.push(r); return p; };
    const take = (r, nk) => { if (nk !== r.key) moved[r.key] = nk; };
    let pipesMoved = false;
    items.forEach(r => {
      const s = r.spec || {};
      if (s.t === 'pipe' && sel[s.sys] && sel[s.sys] !== s.mat) {
        const m = sel[s.sys], nk = `pipe_${s.sys}_${m}_${s.dia}`;
        const p = P(nk, r, { name: `ท่อ${SYS_NAME[s.sys] || s.sys} ${m} ⌀ ${diaLabel(m, s.dia)}`, spec: Object.assign({}, s, { mat: m }), note: r.note });
        Object.entries(r.by_src || {}).forEach(([k, v]) => { p.bySrc[k] = (p.bySrc[k] || 0) + v; }); take(r, nk); pipesMoved = true;
      } else if (s.t === 'conduit' && sel.conduit && condType(s.conduit) !== sel.conduit) {
        const nc = (sel.conduit + ' ' + condSize(s.conduit)).trim(), nk = `conduit_${nc}`;
        const p = P(nk, r, { name: r.name.split(s.conduit).join(nc), spec: Object.assign({}, s, { conduit: nc }), note: r.note });
        Object.entries(r.by_src || {}).forEach(([k, v]) => { p.bySrc[k] = (p.bySrc[k] || 0) + v; }); take(r, nk);
      } else if (s.t === 'wire' && sel.wire && sel.wire !== s.wire) {
        const t = sel.wire, toCab = CABLE_RE.test(t), fromCab = CABLE_RE.test(s.wire || '');
        if (!r.runs && (toCab || fromCab)) { retake.push(r.key); return; }
        const ents = r.runs ? [].concat(...Object.entries(r.runs).map(([src, d]) => Object.entries(d).map(([n, L]) => [src, +n, L]))) : null;
        const sz = s.size, note0 = String(r.note || '');
        const noteC = note0.replace('ความยาวท่อ × จำนวนสายในวงจร', 'สายหลายแกน 1 เส้นต่อวงจร ยาวเท่าท่อ'), noteS = note0.replace('สายหลายแกน 1 เส้นต่อวงจร ยาวเท่าท่อ', 'ความยาวท่อ × จำนวนสายในวงจร');
        if (!ents) {   // แกนเดียว → แกนเดียว ไม่มี runs: ปริมาณเท่าเดิม
          const nk = `wire_${t}_${pyStr(sz)}`, p = P(nk, r, { name: `สายไฟฟ้า ${t} ${sz === null || sz === undefined ? '' : sz} ตร.มม.`.replace('  ', ' '), spec: { t: 'wire', wire: t, size: sz }, note: noteS });
          Object.entries(r.by_src || {}).forEach(([k, v]) => { p.bySrc[k] = (p.bySrc[k] || 0) + v; }); take(r, nk); return;
        }
        ents.forEach(([src, n, L]) => {
          const nk = toCab ? `wire_${t}_${n}C_${pyStr(sz)}` : `wire_${t}_${pyStr(sz)}`;
          const p = P(nk, r, toCab
            ? { name: sz === null || sz === undefined ? `สายไฟฟ้า ${t} ${n} แกน` : `สายไฟฟ้า ${t} ${n}x${sz} ตร.มม.`, spec: { t: 'wire', wire: t, size: sz, cores: n }, note: noteC }
            : { name: `สายไฟฟ้า ${t} ${sz === null || sz === undefined ? '' : sz} ตร.มม.`.replace('  ', ' '), spec: { t: 'wire', wire: t, size: sz }, note: noteS });
          p.bySrc[src] = (p.bySrc[src] || 0) + (toCab ? L : L * n);
          p.runs = p.runs || {}; const d = p.runs[src] = p.runs[src] || {}; d[String(n)] = r4((d[String(n)] || 0) + L);
          if (!moved[r.key]) moved[r.key] = nk;
        });
      }
    });
    const gone = new Set(Object.keys(moved)), byKey = {};
    items.forEach(r => { byKey[r.key] = r; });
    // แถวปลายทางที่มีอยู่แล้วและไม่ได้ย้ายออก → รวมเข้า (เช่น ท่อที่ตั้งชนิดรายเส้นไว้ตรงกับชนิดใหม่)
    order.forEach(k => { const ex = byKey[k]; if (ex && !gone.has(k)) { const p = plan[k]; p.rows.unshift(ex); Object.entries(ex.by_src || {}).forEach(([s, v]) => { p.bySrc[s] = (p.bySrc[s] || 0) + v; });
      if (ex.runs) { p.runs = p.runs || {}; Object.entries(ex.runs).forEach(([s, d]) => Object.entries(d).forEach(([n, L]) => { const x = p.runs[s] = p.runs[s] || {}; x[n] = r4((x[n] || 0) + L); })); } } });
    const built = {}; order.forEach(k => { const p = plan[k]; built[k] = build(k, p.rows, p.meta, p.bySrc, p.runs); });
    let out = [], placed = new Set();
    items.forEach(r => {
      if (plan[r.key] && !gone.has(r.key)) { if (!placed.has(r.key)) { out.push(built[r.key]); placed.add(r.key); } return; }
      if (gone.has(r.key)) { const nk = moved[r.key]; Object.keys(plan).filter(k => plan[k].rows.includes(r) && !placed.has(k)).forEach(k => { out.push(built[k]); placed.add(k); }); if (nk && !placed.has(nk)) { out.push(built[nk]); placed.add(nk); } return; }
      out.push(r);
    });
    order.filter(k => !placed.has(k)).forEach(k => out.push(built[k]));
    if (pipesMoved) out = regroupPct(out);
    return { items: out, moved, retake };
  }

  /** แถว % ข้อต่อ/เหล็กยึด/ทดสอบ ตามชนิดท่อหลังเปลี่ยน — เหมือน fit_of ใน takeoff.py */
  function regroupPct(rows) {
    const fit = {}, go = [];
    rows.forEach(r => { const s = r.spec || {}; if (s.t !== 'pipe') return; const gk = grpOf(s.sys, s.mat || ''); if (!gk) return; if (!fit[gk]) { fit[gk] = []; go.push(gk); } fit[gk].push(r.key); });
    const tmpl = rows.find(r => PCT_RE.test(r.key));
    const out = []; let lastPct = -1, lastPipe = -1;
    rows.forEach(r => {
      if (PCT_RE.test(r.key)) {
        const gk = r.key.replace(/^(fit|sup|test)_/, '');
        if (!fit[gk]) return;   // กลุ่มไม่เหลือท่อ → แถว % หาย
        out.push(Object.assign({}, r, { price_ref: Object.assign({}, r.price_ref, { of: fit[gk].slice() }) })); lastPct = out.length - 1; return;
      }
      out.push(r); if ((r.spec || {}).t === 'pipe') lastPipe = out.length - 1;
    });
    const have = new Set(out.filter(r => PCT_RE.test(r.key)).map(r => r.key)), add = [];
    go.forEach(gk => PCT_PARTS.forEach(([part, label], i) => {
      const key = `${part}_${gk}`; if (have.has(key)) return;
      const pc = PIPE_PCT[gk];
      add.push(Object.assign({}, tmpl || {}, { key, group_code: '1.3', group: (tmpl && tmpl.group) || (rows.find(r => r.group_code === '1.3') || {}).group || '',
        name: `${label} ท่อ${pc.name} (วัสดุ ${g(pc[part] * 100)}% ของค่าท่อ, ค่าแรง 30% ของค่าวัสดุ)`, unit: 'งาน', qty: 1, qty_net: 1, waste: 0, waste_included: false,
        count: true, from: [], task: 'mep_rough', status: 'computed', note: `ว480 ${gk}-${PIPE_PCT_CODES[gk][i]}`,
        by_task: { mep_rough: { share: 1, from: [] } }, price_ref: { kind: 'pct', of: fit[gk].slice(), mat: pc[part], lab_of_mat: 0.3, of_label: 'ค่าท่อ' } }));
    }));
    if (add.length) { const at = (lastPct >= 0 ? lastPct : lastPipe) + 1; out.splice(at, 0, ...add); }
    return out;
  }

  /** สี 3D ตามชนิด (null = สีเดิมตามระบบ) */
  const colorOf = (k, m) => k === 'conduit' ? ({ EMT: 0xb9bec4, IMC: 0x8a9199, 'PVC สีเหลือง': 0xf2c94c }[m] || null) : /PP-?R/i.test(m || '') ? 0x2e9e4f : null;

  return { SYSTEMS, OPT_TH, SYS_NAME, apply, current, regroupPct, diaLabel, diaIn, grpOf, condSize, condType, colorOf, CABLE_RE };
});
