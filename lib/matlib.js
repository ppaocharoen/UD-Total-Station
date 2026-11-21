/* UD MatLib — คลังวัสดุ: ลายวัสดุ (วาดจากเว็บ) + เปลี่ยนวัสดุงานผิวแล้วแยกแถว BOQ ให้ตรง tools/takeoff.py (M2b ก้อน 6 · Earth 21 พ.ย. 2569)
 *
 * วัสดุ (คลังกลาง Firestore `materials` / สำเนาใน .boq.json mats):
 *   { id, name, cls: 'clad'|'paint'|'ground', kinds: ['floor','wall','ceiling','counter','skirting'], spec: ข้อความรายการ BOQ (clad),
 *     look: { pat, color, color2, grout, gw (มม.), cell: [กว้าง, ยาว] ม. }, sug: { mat, lab } (การผูกราคาแนะนำ — คำแนะนำเท่านั้น), by, byName, at }
 *   cls clad = ปู/กรุ/บุผิว → แถว fin_<ชนิด>_<spec> · paint = ฉาบทาสี (เปลี่ยนสีใน 3D · ผิวโครงสร้าง → ฉาบโครงสร้าง+ทาสี) · ground = ผิวดินรอบอาคาร (ไม่มีแถว BOQ)
 * การเลือก (.boq.json matsel): { piece: { <id งานผิว | '@ground'>: matId | '' (= ตามแบบ) }, type: { <typeKey>: matId } } — ชิ้นนี้มาก่อนกฎทั้งชนิด
 *
 * ขอบเขตก้อน 6 (Earth 21 พ.ย.): เปลี่ยนได้เฉพาะงานผิวที่คิดปริมาณจากงานผิวโดยตรง (พื้น ฝ้า ผนังกรุ บัว เคาน์เตอร์ ผิวโครงสร้าง)
 *   ผิวผนังทาสี (counted_by: wall — ปริมาณฉาบ/ทาสีคิดจากผนัง): วัสดุทาสี = เปลี่ยนสีใน 3D ไม่กระทบ BOQ
 * ก้อน 6b (Earth 21 พ.ย.): ผนังทาสี ↔ ผนังกรุ ได้ทั้งสองทาง — ปริมาณชิ้น (qty) ย้ายระหว่างแถวกรุ fin_wall_<spec> กับแถวฉาบ/ทาสีของผนัง
 *   ทาสี → กรุ: หัก plaster_area/paint_area ด้านนั้นของผนัง · กรุ → ทาสี: เพิ่ม (ผนังไม่มีค่านี้ → ใช้ค่าเริ่ม net×ด้าน จาก by_src แล้วหัก/เพิ่ม)
 *   ด้าน (ภายใน/ภายนอก): คำในชื่อรายการ → (ทาสี → กรุ) ผนังฉาบด้านเดียว = ด้านนั้น → คำตอบที่เลือกในหน้าต่าง matsel.side{id: 'int'|'ext'} → ยังไม่รู้ = ยังไม่แยกแถว (needSide)
 *   แถวฉาบตามชนิดผนัง (อิฐ/อิฐมวลเบา) · ผิวปลายผนัง/สันผนัง (E/T) รวมอยู่ใน plaster_area แล้ว · ผนัง คสล./อื่นๆ ไม่รองรับกรุ → ทาสี
 * ก้อน 6c (Earth 21 พ.ย.): แผ่นมุงหลังคา (ชิ้น = model.roofs ตาม id) — วัสดุ cls 'roof' { cover: ชนิด (ต้องตรงกับหลังคา — ข้ามชนิดต้องแก้โมเดล),
 *   spec: ข้อความรายการ, ins: { mode: 'keep' ตามแบบ | 'none' ไม่มีฉนวน | 'set', desc } } · พื้นที่เท่าเดิม (by_src ของแถวแผ่นมุง)
 *   แถว cover_<ชนิด>_<spec> · ฉนวน insulation_<desc> (= takeoff.py เมื่อแก้ roof.cover_spec / roof.insulation) · ครอบสัน/ตะเข้ที่คิดจากหลังคาไม่เปลี่ยน
 *   ครอบหลังคา/เชิงชาย/ปั้นลมที่เป็นงานผิว (kind other) = ชิ้นแยก เปลี่ยนเองด้วยวัสดุกรุชนิด 'cap' / 'fascia' (Earth 21 พ.ย.)
 * ก้อน 6d (Earth 21 พ.ย.): แคตตาล็อกชิ้นนับจำนวน — ประตู-หน้าต่าง (openings) · สุขภัณฑ์ (fixtures) · อุปกรณ์สุขาภิบาล (equipment) · จุดไฟฟ้า/โคม (points)
 *   วัสดุ cls 'item' { kinds: ['open:door'|'fx:wc'|'eq:water_tank'|'pt:light' …] (ชนิดเดียวกันเท่านั้น), spec: ข้อความรายการ (ชนิด/วัสดุ/ยี่ห้อ),
 *     style: วิธีเปิดบาน (ประตู-หน้าต่าง · '' = ตามแบบ), look: { color = วงกบ/ตัว, color2 = บาน } }
 *   ขนาดใช้ของโมเดลเสมอ (ช่อง w×h · ขนาดอุปกรณ์ size) — ทับหลัง/เสาเอ็น/ท่อ ไม่เปลี่ยน
 *   ชิ้นที่ใช้วัสดุ m ย้ายจากแถว <แถวเดิม> ไปแถว <แถวเดิม>~<id วัสดุ> (ต่อท้ายแถวเดิม) ชื่อตามรูปแบบ takeoff.py ด้วย spec ของวัสดุ
 *     = takeoff.py เมื่อแก้โมเดลเป็นแบบ (type) ใหม่ชื่อ <แบบ>~<id วัสดุ> · ทุกชิ้นแบบเดียวกัน → แถวเดิมหาย เหลือแถวใหม่แถวเดียว (= เปลี่ยนชื่อแถว)
 *     อุปกรณ์: ชื่อ = ข้อความรายการ + ขนาดจากโมเดล · spec ผูกราคาคงขนาดเดิม (ถังบำบัดผูกตามลิตร)
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
  const GROUP = { '1.2.1': 'งานหลังคา', '1.2.2': 'งานฝ้าเพดาน', '1.2.4': 'งานฉาบปูน', '1.2.5': 'งานวัสดุผิวพื้นและผนัง', '1.2.7': 'งานทาสี' };
  const CODE = { floor: '1.2.5', wall: '1.2.5', skirting: '1.2.5', counter: '1.2.5', railing: '1.2.5', ceiling: '1.2.2', other: '1.2.5' };
  const SRC = 'tools/takeoff.py (หลักเกณฑ์อาคาร 2569)';
  const CLAD_KINDS = ['floor', 'wall', 'ceiling', 'counter', 'skirting', 'cap', 'fascia'];
  const KIND_TH = { floor: 'พื้น', wall: 'ผนัง/ผิวโครงสร้าง', ceiling: 'ฝ้า', counter: 'เคาน์เตอร์', skirting: 'บัว', cap: 'ครอบหลังคา', fascia: 'เชิงชาย/ปั้นลม' };
  const CLS_TH = { clad: 'ปู/กรุ/บุผิว', paint: 'ฉาบทาสี', ground: 'ผิวดิน', roof: 'แผ่นมุงหลังคา', item: 'ประตู-หน้าต่าง/สุขภัณฑ์/อุปกรณ์/โคม' };
  const COVER_TH = { metal_sheet: 'เมทัลชีท', cpac_tile: 'กระเบื้องคอนกรีต', ceramic_tile: 'กระเบื้องเซรามิก', fibre_cement: 'กระเบื้องไฟเบอร์ซีเมนต์ลอนคู่',
    shingle: 'แผ่นชิงเกิ้ล', upvc: 'UPVC', polycarbonate: 'โพลีคาร์บอเนต' };   // = COVER_NAME ของ takeoff.py (ไม่รวมพื้น คสล.)
  const INS_TH = { keep: 'ฉนวนตามแบบ', none: 'ไม่มีฉนวน', set: 'มีฉนวน' };
  // 6d: ชื่อชิ้นนับจำนวน = POINT_NAME / EQUIP_NAME / FIXTURE_NAME ของ takeoff.py
  const POINT_NAME = { light: 'ดวงโคม', lamp: 'โคมไฟ', switch: 'สวิตช์', outlet: 'เต้ารับ', ac: 'เครื่องปรับอากาศ', heater: 'เครื่องทำน้ำอุ่น', fan: 'พัดลมระบายอากาศ',
    tv: 'เต้ารับทีวี', data: 'เต้ารับสื่อสาร', bell: 'กริ่ง', pump: 'ปั๊มน้ำ' };
  const EQUIP_NAME = { septic_tank: 'ถังบำบัดน้ำเสียสำเร็จรูป', grease_trap: 'ถังดักไขมัน', water_tank: 'ถังเก็บน้ำ', pump: 'เครื่องสูบน้ำ', meter: 'มาตรวัดน้ำ',
    manhole: 'บ่อพัก', gate_valve: 'ประตูน้ำ', check_valve: 'ประตูน้ำกันกลับ', soak_pit: 'บ่อซึม' };
  const FIXTURE_NAME = { wc: 'โถส้วมชักโครก', lavatory: 'อ่างล้างหน้า', sink: 'ซิงค์ล้างจาน', shower: 'ชุดฝักบัว', floor_drain: 'ตะแกรงระบายน้ำพื้น (FD)', faucet: 'ก๊อกน้ำ',
    spray: 'สายฉีดชำระ', water_heater: 'เครื่องทำน้ำอุ่น', washer: 'จุดเครื่องซักผ้า', urinal: 'โถปัสสาวะชาย' };
  const OPEN_NAME = { door: 'ประตู', window: 'หน้าต่าง', vent: 'ช่องลม/บล็อกช่องลม' };
  const UNIT_TH = { open: 'ประตู-หน้าต่าง', fx: 'สุขภัณฑ์', eq: 'อุปกรณ์สุขาภิบาล', pt: 'ไฟฟ้า' };
  /** ชนิดชิ้นนับจำนวนทั้งหมด { 'open:door': 'ประตู', … } */
  const ITEM_KINDS = {};
  [['open', OPEN_NAME], ['fx', FIXTURE_NAME], ['eq', EQUIP_NAME], ['pt', POINT_NAME]].forEach(([u, T]) => Object.keys(T).forEach(k => { ITEM_KINDS[u + ':' + k] = T[k]; }));
  /** วิธีเปิดบาน (look.style ของ opening_types — วาดใน viewer3d) · '' = ตามแบบ */
  const STYLE_TH = { swing: 'บานเปิดเดี่ยว', swing2: 'บานเปิดคู่', slide: 'บานเลื่อน', slide_hung: 'บานเลื่อนรางแขวน', glass: 'บานกระจก/ช่องแสง',
    vent_block: 'บล็อกช่องลม', glass_block: 'บล็อกแก้ว' };
  /** ชิ้นหลังคา (model.roofs) */
  const isRoof = x => !!(x && x.outline && x.cover);
  /** 6d: ชิ้นนับจำนวน (สร้างโดย units()) */
  const isUnit = x => !!(x && x.unit && UNIT_TH[x.unit]);
  /** ข้อความรายการตามแบบของชิ้น (หลังคา = cover_spec หรือชื่อกลางแบบ takeoff.py) */
  const specOf = x => isUnit(x) ? x.desc : isRoof(x) ? ((x.cover_spec || '').trim() || 'วัสดุมุงหลังคา ' + (COVER_TH[x.cover] || x.cover)) : (x && x.spec) || '';
  /** งานผิว kind other ที่เป็นครอบหลังคา/เชิงชาย (จากข้อความรายการ) */
  const otherKind = f => /เชิงชาย|ปั้นลม/.test(f.spec || '') ? 'fascia' : /ครอบ/.test(f.spec || '') ? 'cap' : null;
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
  const PAT_FOR = { clad: ['plain', 'concrete', 'tile', 'granito', 'washed', 'brick', 'wood'], paint: ['plain'], ground: ['soil', 'grass', 'concrete', 'washed', 'plain'], roof: ['plain'], item: ['plain'] };
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
    if (isUnit(f)) return 'item';
    if (isRoof(f)) return f.cover !== 'concrete_deck' ? 'roof' : null;
    if (f.kind === 'other') return otherKind(f) ? 'clad' : null;
    if (f.counted_by === 'wall') return 'paint';
    if (f.kind === 'struct') return (f.faces || []).length ? 'struct' : null;
    return CLAD_KINDS.includes(f.kind) ? 'clad' : null;
  }
  const kindOfPiece = f => isUnit(f) ? f.ik : isRoof(f) ? 'roof' : f.kind === 'other' ? otherKind(f) : (f.kind === 'struct' || f.counted_by === 'wall') ? 'wall' : f.kind;
  const MASON = ['brick_mon', 'brick_mon_full', 'aac', 'block', 'block_07'];
  const wallOf = (f, model) => (model && (model.walls || []).find(w => w.id === f.wall)) || null;
  /** 6b: 'p2c' ผนังทาสี → กรุ · 'c2p' ผนังกรุ → ทาสี · null = ไม่ใช่การสลับ */
  function swapMode(f, mat) {
    if (!f || !mat || f === GROUND || f.id === GROUND) return null;
    if (f.counted_by === 'wall' && mat.cls === 'clad') return 'p2c';
    if (pieceClass(f) === 'clad' && f.kind === 'wall' && f.wall && mat.cls === 'paint') return 'c2p';
    return null;
  }
  /** วัสดุนี้ใช้กับชิ้นนี้ได้ไหม (model ไม่บังคับ — ให้มาแล้วตรวจชนิดผนังของ กรุ → ทาสี) */
  function accepts(f, mat, model) {
    if (!mat) return false;
    if (f === GROUND || (f && f.id === GROUND)) return mat.cls === 'ground';
    const pc = pieceClass(f); if (!pc || mat.cls === 'ground') return false;
    if (pc === 'item' || mat.cls === 'item') return pc === 'item' && mat.cls === 'item' && (mat.kinds || []).includes(f.ik);   // 6d: ชนิดเดียวกัน
    if (pc === 'roof' || mat.cls === 'roof') return pc === 'roof' && mat.cls === 'roof' && mat.cover === f.cover;   // 6c: เฉพาะชนิดเดียวกัน
    const kOk = (mat.kinds || []).includes(kindOfPiece(f));
    if (pc === 'paint') return (mat.cls === 'paint' || mat.cls === 'clad') && kOk;
    if (pc === 'struct') return (mat.cls === 'paint' || mat.cls === 'clad') && kOk;
    if (mat.cls === 'paint') {   // กรุ → ทาสี: เฉพาะผิวผนังก่อ (ฉาบได้)
      if (!(f.kind === 'wall' && f.wall && kOk)) return false;
      if (model) { const w = wallOf(f, model); return !!w && MASON.includes(w.kind); }
      return true;
    }
    return mat.cls === 'clad' && kOk;
  }
  /** กุญแจ "ชนิดเดียวกัน" — ชนิดงานผิว + ทาสี/ไม่ + ป้ายผิว + รายการตามแบบ */
  const typeKey = f => isUnit(f) ? ['u', f.unit, f.type, f.unit === 'eq' ? f.size : ''].join('|') : isRoof(f) ? ['roof', f.cover, '', specOf(f)].join('|') : [f.kind, f.counted_by === 'wall' ? 'c' : '', f.tag || '', f.spec || ''].join('|');
  /** ชิ้นที่เปลี่ยนวัสดุได้ทั้งหมด: งานผิว + หลังคา */
  const pieces = model => (model.finishes || []).concat((model.roofs || []).filter(r => pieceClass(r)), units(model));
  /** 6d: ชิ้นนับจำนวนในโมเดล (ตามที่ takeoff.py นับ) → { id, unit, type, kind, ik, desc, row (กุญแจแถว), w, h, size, style, room } */
  function units(model) {
    const out = [], mep = model.mep || {}, pl = mep.plumbing || {}, el = mep.electrical || {};
    const ot = model.opening_types || {};
    (model.openings || []).forEach(o => { const t = ot[o.type]; if (!o.id || !t || t.kind === 'opening' || !OPEN_NAME[t.kind]) return;
      out.push({ id: o.id, unit: 'open', type: o.type, kind: t.kind, ik: 'open:' + t.kind, desc: t.desc || o.type, row: 'open_' + o.type, w: t.w, h: t.h,
        style: (t.look && t.look.style) || '', room: o.wall ? 'ผนัง ' + o.wall : '' }); });
    const ft = pl.fixture_types || {};
    (pl.fixtures || []).forEach(f => { const t = ft[f.type] || {}; if (!f.id) return;
      out.push({ id: f.id, unit: 'fx', type: f.type, kind: t.kind || '', ik: 'fx:' + (t.kind || ''), desc: t.desc || '', row: 'fx_' + f.type, room: f.room || '' }); });
    (pl.equipment || []).forEach(e => { if (!e.id) return;
      out.push({ id: e.id, unit: 'eq', type: e.kind, kind: e.kind, ik: 'eq:' + e.kind, desc: [EQUIP_NAME[e.kind] || e.kind, e.size].filter(Boolean).join(' '), size: e.size || '', row: 'eq_' + e.kind, room: '' }); });
    const pt = el.point_types || {};
    (el.points || []).forEach(p => { const t = pt[p.type] || {}; if (!p.id) return;
      out.push({ id: p.id, unit: 'pt', type: p.type, kind: t.kind || '', ik: 'pt:' + (t.kind || ''), desc: t.desc || '', row: 'pt_' + p.type, room: p.room || '' }); });
    return out;
  }
  /** 6d: ชื่อแถว + spec ผูกราคา ของชิ้นนับจำนวนเมื่อใช้ข้อความรายการ sp (รูปแบบเดียวกับ takeoff.py) */
  function unitRow(u, sp) {
    if (u.unit === 'open') return { name: `${sp} (${u.type} ${u.w}×${u.h} ม.)`, spec: { t: 'opening', kind: u.kind, w: u.w, h: u.h, desc: sp } };
    if (u.unit === 'fx') return { name: (FIXTURE_NAME[u.kind] || u.type) + (sp ? ` (${sp})` : ''), spec: { t: 'fixture', kind: u.kind, desc: sp } };
    if (u.unit === 'pt') return { name: 'จุด' + (POINT_NAME[u.kind] || u.type) + (sp ? ` (${sp})` : ''), spec: { t: 'point', kind: u.kind, desc: sp } };
    return { name: sp + (u.size ? ' ' + u.size : ''), spec: { t: 'equip', kind: u.kind, size: u.size } };
  }
  /** วัสดุที่ใช้จริงของแต่ละชิ้น: { id งานผิว: วัสดุ } (เฉพาะที่เปลี่ยน) · sel = matsel · mats = { id: วัสดุ } */
  function effective(model, sel, mats) {
    const out = {}, P = (sel && sel.piece) || {}, T = (sel && sel.type) || {}, M = mats || {};
    pieces(model).forEach(f => {
      let id = Object.prototype.hasOwnProperty.call(P, f.id) ? P[f.id] : T[typeKey(f)];
      const m = id && M[id]; if (m && accepts(f, m)) out[f.id] = m;
    });
    const g = P[GROUND] && M[P[GROUND]]; if (g && g.cls === 'ground') out[GROUND] = g;
    return out;
  }

  // ------------------------------------------------------------------ ปริมาณ (สูตรเดียวกับ tools/takeoff.py _finishes)
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const polyArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
  /** ทศนิยม 2 ตำแหน่งแบบ Python f"{x:.2f}" (ค่าที่อยู่กึ่งกลางพอดีปัดเข้าเลขคู่ — toFixed ปัดขึ้น เช่น 2.625 → 2.63 แต่ Python ได้ 2.62) */
  const fmt2 = x => {
    const neg = x < 0, t = Math.abs(x).toFixed(20).split('.'), rest = t[1].slice(2);
    let n = BigInt(t[0] + t[1].slice(0, 2));
    if (rest[0] > '5' || (rest[0] === '5' && (/[1-9]/.test(rest.slice(1)) || n % 2n === 1n))) n += 1n;
    const v = n.toString().padStart(3, '0'), out = v.slice(0, -2) + '.' + v.slice(-2);
    return (neg && n > 0n ? '-' : '') + out;
  };
  /** ปริมาณของงานผิว 1 ชิ้น {q, unit} (null = ไม่มีขนาดให้คิด) */
  function baseQty(f, model) {
    let q, unit;
    if (f.qty !== undefined && f.qty !== null) { q = +f.qty; unit = f.unit || ''; }
    else if (f.rects && f.rects.length) { q = f.rects.reduce((s, r) => s + Math.abs(r[2] - r[0]) * Math.abs(r[3] - r[1]), 0); unit = 'ตร.ม.'; }
    else if (f.polygon) { q = polyArea(f.polygon) - (f.holes || []).reduce((s, h) => s + polyArea(h), 0); unit = 'ตร.ม.'; }
    else if (f.wall && f.height) {
      const w = wallOf(f, model), pts = w ? w.path : [];
      let L = 0; for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
      q = L * f.height; unit = 'ตร.ม.';
    } else return null;
    if (['skirting', 'railing', 'counter'].includes(f.kind) && !f.unit) unit = 'ม.';
    return { q, unit };
  }

  // ------------------------------------------------------------------ 6b ด้านภายใน/ภายนอก + ฉาบ/ทาสีของผนัง
  const SIDES = ['int', 'ext'];
  const SIDE_TH = { int: 'ภายใน', ext: 'ภายนอก' };
  const sideWord = t => { const e = /ภายนอก/.test(t || ''), i = /ภายใน/.test(t || ''); return e === i ? null : e ? 'ext' : 'int'; };
  /** ด้านที่ผนังมีพื้นที่ฉาบ (plaster_area หรือแถวฉาบใน items) — ด้านเดียว = ด้านนั้น */
  function plasteredSides(w, items) {
    if (!w) return [];
    if (w.plaster && w.plaster_area) return SIDES.filter(sd => (w.plaster_area[sd] || 0) > 0);
    return SIDES.filter(sd => (items || []).some(r => new RegExp(`^plaster_${sd}_`).test(r.key) && r.by_src && r.by_src[w.id] > 0));
  }
  /** ด้านของชิ้นที่สลับ ทาสี ↔ กรุ: 'int' | 'ext' | null (ต้องถาม) */
  function sideOf(f, mat, model, sel, items) {
    const sm = swapMode(f, mat); if (!sm) return null;
    const w = sm === 'p2c' ? f.spec : (mat.name || '') + ' ' + (mat.spec || '');
    const a = sideWord(w) || (sm === 'c2p' ? sideWord(f.spec) : null); if (a) return a;
    if (sm === 'p2c') { const ps = plasteredSides(wallOf(f, model), items); if (ps.length === 1) return ps[0]; }
    const ch = sel && sel.side && sel.side[f.id];
    return SIDES.includes(ch) ? ch : null;
  }
  /** ชิ้นที่เลือกสลับ ทาสี ↔ กรุ แต่ยังไม่รู้ด้าน (หน้าเว็บถาม) */
  function needSide(model, sel, mats, items) {
    const eff = effective(model, sel, mats);
    return (model.finishes || []).filter(f => eff[f.id] && swapMode(f, eff[f.id]) && !sideOf(f, eff[f.id], model, sel, items)).map(f => f.id);
  }
  /** ส่วนต่างฉาบ/ทาสีของผนังจากการสลับ 1 ชิ้น: [{key, code, name, unit, task, spec, kind: 'plaster'|'paint', wall, d}] */
  function wallDeltas(f, mat, sd, model) {
    const sm = swapMode(f, mat), w = wallOf(f, model); if (!sm || !w || !sd) return [];
    const b = baseQty(f, model), q = b ? b.q : 0; if (!(q > 0)) return [];
    const nm = SIDE_TH[sd], pk = w.kind === 'aac' ? 'aac' : 'brick', out = [];
    const pl = { key: `plaster_${sd}_${pk}`, code: '1.2.4', name: `ฉาบปูนเรียบผนัง${nm}` + (pk === 'aac' ? ' (อิฐมวลเบา)' : ''), unit: 'ตร.ม.', task: 'plaster', spec: { t: 'plaster', side: sd, wall: w.kind }, kind: 'plaster', wall: w.id };
    const pt = { key: `paint_${sd}`, code: '1.2.7', name: `ทาสีน้ำอะคริลิก${nm}`, unit: 'ตร.ม.', task: 'paint', kind: 'paint', wall: w.id };
    if (sm === 'p2c') { if (w.plaster) out.push(Object.assign(pl, { d: -q })); if (w.paint) out.push(Object.assign(pt, { d: -q })); }
    else { if (!MASON.includes(w.kind)) return []; out.push(Object.assign(pl, { d: q }), Object.assign(pt, { d: q })); }
    return out;
  }
  /** รายการปริมาณที่งานผิว f ให้ (ตาม takeoff.py) เมื่อใช้วัสดุ mat (null = ตามแบบ): [{code, key, name, unit, q, task, calc, spec}] */
  function contribs(f, mat, model) {
    const sm = swapMode(f, mat);
    if (f.counted_by === 'wall' && sm !== 'p2c') return [];
    if (sm === 'c2p') return [];   // ย้ายไปฉาบ/ทาสีของผนัง (wallDeltas)
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
    const b = baseQty(f, model); if (!b) return out;
    const q = b.q, unit = b.unit;
    const sp = mat ? mat.spec : f.spec;
    out.push({ code: CODE[f.kind], key: `fin_${f.kind}_${sp}`, name: sp, unit, q, task: f.kind === 'ceiling' ? 'ceiling' : 'finish', spec: { t: 'finish', kind: f.kind, desc: sp } });
    return out;
  }

  /** 6c: การย้ายพื้นที่หลังคาระหว่างแถว (แผ่นมุง + ฉนวน) ตามวัสดุหลังคาที่เลือก — แหล่ง = id หลังคา เหมือน takeoff.py */
  function roofMoves(items, model, eff) {
    const mv = {}, M = k => (mv[k] = mv[k] || { meta: null, rm: {}, add: {}, swap: new Set() });
    (model.roofs || []).forEach(rf => {
      const m = eff[rf.id]; if (!m || m.cls !== 'roof') return;
      const cov = items.find(r => r.spec && r.spec.t === 'cover' && r.by_src && r.by_src[rf.id] > 0); if (!cov) return;
      const area = cov.by_src[rf.id], waste = rf.form === 'hip' ? 0.05 : 0.03;
      const sp = (m.spec || '').trim(), nk = sp ? `cover_${rf.cover}_${sp}` : `cover_${rf.cover}`;
      if (nk !== cov.key) {
        const a = M(cov.key); a.rm[rf.id] = true; a.swap.add(rf.id);
        const b = M(nk); b.add[rf.id] = area; b.swap.add(rf.id);
        if (!b.meta) b.meta = { code: '1.2.1', name: sp || cov.name, unit: 'ตร.ม.', task: 'roof_cover', waste, note: cov.note, spec: Object.assign({}, cov.spec, sp ? { desc: sp } : {}) };
      }
      const ins = m.ins || { mode: 'keep' }; if (ins.mode !== 'none' && ins.mode !== 'set') return;
      const desc = ins.mode === 'set' ? String(ins.desc || '').trim() : ''; if (ins.mode === 'set' && !desc) return;
      const old = items.filter(r => r.spec && r.spec.t === 'insulation' && r.by_src && r.by_src[rf.id] > 0), ik = desc ? `insulation_${desc}` : null;
      old.forEach(r => { if (r.key !== ik) { const a = M(r.key); a.rm[rf.id] = true; a.swap.add(rf.id); } });
      if (ik && !old.some(r => r.key === ik)) {
        const b = M(ik); b.add[rf.id] = area; b.swap.add(rf.id);
        if (!b.meta) b.meta = { code: '1.2.1', name: `ฉนวนใต้หลังคา ${desc}`, unit: 'ตร.ม.', task: 'roof_cover', waste: 0, spec: { t: 'insulation', desc, cover: rf.cover } };
      }
    });
    return mv;
  }

  /** 6d: ชิ้นนับจำนวนที่ใช้วัสดุ m ย้ายจากแถวเดิม R → แถว R~<id วัสดุ> (จำนวนชิ้นละ by_src เดิม) */
  function unitMoves(items, model, eff, mv) {
    const M = k => (mv[k] = mv[k] || { meta: null, rm: {}, add: {}, swap: new Set() });
    units(model).forEach(u => {
      const m = eff[u.id]; if (!m || m.cls !== 'item') return;
      const r0 = items.find(r => r.key === u.row && r.by_src && r.by_src[u.id] > 0); if (!r0) return;
      const nk = `${u.row}~${m.id}`, a = M(u.row); a.rm[u.id] = true; a.swap.add(u.id);
      const b = M(nk); b.add[u.id] = r0.by_src[u.id]; b.swap.add(u.id); b.task = r0.task;
      if (!b.meta) { const x = unitRow(u, (m.spec || '').trim() || u.desc); b.meta = { code: r0.group_code, group: r0.group, name: x.name, unit: r0.unit, task: r0.task, waste: 0, spec: x.spec, after: u.row }; }
    });
    return mv;
  }

  /** แยกแถว BOQ ตามวัสดุที่เปลี่ยน: items = quantities.items จาก takeoff.py → items ชุดใหม่ (ไม่แก้ของเดิม)
   *  แถวที่ได้รับผลมี mat_swap: [{ id งานผิว, mat, name }] (ไว้แสดงป้ายบนจอ) */
  function apply(items, model, sel, mats) {
    const eff = effective(model, sel, mats), fins = {};
    (model.finishes || []).forEach(f => { fins[f.id] = f; });
    const mv = unitMoves(items, model, eff, roofMoves(items, model, eff));   // 6c/6d: { key: { meta, rm: {src}, add: {src: q}, swap: Set, task } }
    const side = {};
    const changed = Object.keys(eff).filter(id => {
      const f = fins[id], m = eff[id]; if (!f) return false;   // หลังคาไม่อยู่ใน fins (roofMoves)
      if (swapMode(f, m)) { side[id] = sideOf(f, m, model, sel, items); return !!side[id]; }   // 6b: ยังไม่รู้ด้าน = ยังไม่แยกแถว
      const pc = pieceClass(f); if (pc === 'paint') return false;
      if (pc === 'clad') return m.spec !== f.spec;
      return true;   // ผิวโครงสร้าง: คิดใหม่ทุกหน้า
    });
    if (!changed.length && !Object.keys(mv).length) return items;
    const chg = new Set(changed), touched = new Set(Object.keys(mv));
    items.forEach(r => { if (r.by_src && changed.some(id => r.by_src[id])) touched.add(r.key); });
    const newC = {}; changed.forEach(id => { newC[id] = contribs(fins[id], eff[id], model); newC[id].forEach(c => touched.add(c.key)); });
    const byKey = {}; items.forEach(r => { byKey[r.key] = r; });
    const cache = {}, cOf = id => cache[id] || (cache[id] = chg.has(id) ? newC[id] : contribs(fins[id], eff[id] || null, model));
    const meta = {};   // เมตาแถวใหม่จาก contribution แรก
    changed.forEach(id => newC[id].forEach(c => { if (!byKey[c.key] && !meta[c.key]) meta[c.key] = c; }));
    Object.keys(mv).forEach(k => { if (!byKey[k] && !meta[k] && mv[k].meta) meta[k] = mv[k].meta; });
    // 6b: ส่วนต่างฉาบ/ทาสีของผนัง (แหล่ง = ผนัง เหมือน takeoff.py ที่คิดจาก plaster_area/paint_area)
    const dl = {}, dSwap = {}, wk = {};   // dl[key][wall] = ส่วนต่าง · dSwap[key] = ชิ้นที่ทำให้แถวเปลี่ยน · wk[wall] = {plaster, paint}
    changed.forEach(id => wallDeltas(fins[id], eff[id], side[id], model).forEach(x => {
      (dl[x.key] = dl[x.key] || {})[x.wall] = (dl[x.key][x.wall] || 0) + x.d;
      (dSwap[x.key] = dSwap[x.key] || new Set()).add(id);
      (wk[x.wall] = wk[x.wall] || {})[x.kind] = true;
      touched.add(x.key); if (!byKey[x.key] && !meta[x.key]) meta[x.key] = x;
    }));
    // ผนังที่ระบุพื้นที่ใหม่: ทุกแถวฉาบ/ทาสีของผนังนั้นใช้วิธีคิด "ตามพื้นที่ที่ระบุ" (เหมือนแก้ plaster_area/paint_area ในโมเดล)
    Object.keys(wk).forEach(w => items.forEach(r => {
      if (!(r.by_src && r.by_src[w] !== undefined)) return;
      const kd = /^plaster_(int|ext)_/.test(r.key) ? 'plaster' : /^paint_(int|ext)$/.test(r.key) ? 'paint' : null;
      if (kd && wk[w][kd]) { (dl[r.key] = dl[r.key] || {})[w] = dl[r.key][w] || 0; touched.add(r.key); }
    }));
    const calcTxt = (key, q) => /^plaster_/.test(key) ? `ตามพื้นที่ฉาบที่ระบุ ${fmt2(q)} ตร.ม.` : `ตามพื้นที่ทาสีที่ระบุ ${fmt2(q)} ตร.ม.`;
    const built = {};
    touched.forEach(key => {
      const r0 = byKey[key], waste = r0 ? (r0.waste || 0) : ((meta[key] && meta[key].waste) || 0);
      const srcs = [];
      if (r0) (r0.from || []).forEach(s => { if (!srcs.includes(s)) srcs.push(s); });
      changed.forEach(id => { if (newC[id].some(c => c.key === key) && !srcs.includes(id)) srcs.push(id); });
      Object.keys(dl[key] || {}).forEach(w => { if (!srcs.includes(w)) srcs.push(w); });
      const M = mv[key]; if (M) Object.keys(M.add).forEach(r => { if (!srcs.includes(r)) srcs.push(r); });
      const taskOf0 = s => { const bt = (r0 && r0.by_task) || {}; for (const t of Object.keys(bt)) if ((bt[t].from || []).includes(s)) return t; return (r0 && r0.task) || 'other'; };
      let raw = 0; const bySrc = {}, calc = {}, parts = {}, from = [], swaps = [];
      srcs.forEach(s => {
        let q = 0, cl = [], task = null;
        const f = fins[s];
        if (M && M.rm[s]) return;   // 6c: หลังคาย้ายออกจากแถวนี้
        if (M && M.add[s] !== undefined) { q = M.add[s]; task = M.task || 'roof_cover'; }
        else if (f && (f.counted_by !== 'wall' || chg.has(s))) {
          const cs = cOf(s).filter(c => c.key === key);
          cs.forEach(c => { q += c.q; if (c.calc) cl.push(c.calc); task = task || c.task; });
        } else if (dl[key] && dl[key][s] !== undefined) {   // ผนังที่ฉาบ/ทาสีเปลี่ยน
          q = Math.max(0, Math.round((((r0 && r0.by_src && r0.by_src[s]) || 0) + dl[key][s]) * 1e9) / 1e9); cl = [calcTxt(key, q)];   // ปัด 9 ตำแหน่ง = ค่าพื้นที่ที่ระบุ (ตัดเศษทศนิยมลอยตัว)
          task = meta[key] && !r0 ? meta[key].task : null;
        } else { q = (r0 && r0.by_src && r0.by_src[s]) || 0; cl = ((r0 && r0.calc) || {})[s] || []; }
        if (!(q > 1e-9)) return;
        raw += q; from.push(s); bySrc[s] = (bySrc[s] || 0) + q; if (cl.length) calc[s] = cl;
        const t = task || taskOf0(s); (parts[t] = parts[t] || { q: 0, from: [] }).q += q; if (!parts[t].from.includes(s)) parts[t].from.push(s);
        if (chg.has(s)) swaps.push({ id: s, mat: eff[s].id, name: eff[s].name });
      });
      (dSwap[key] || new Set()).forEach(id => { if (!swaps.some(x => x.id === id)) swaps.push({ id, mat: eff[id].id, name: eff[id].name }); });
      if (M) M.swap.forEach(id => { if (!swaps.some(x => x.id === id)) swaps.push({ id, mat: eff[id].id, name: eff[id].name }); });
      if (!from.length) { built[key] = null; return; }   // ไม่เหลือชิ้นใด → แถวหายเหมือน takeoff.py
      const c0 = meta[key];
      const row = r0 ? Object.assign({}, r0) : { key, group_code: c0.code, group: c0.group || GROUP[c0.code] || '', name: c0.name, unit: c0.unit, waste: c0.waste || 0, waste_included: false, task: c0.task, status: 'computed', src: SRC };
      if (!r0 && c0.spec) row.spec = c0.spec;
      if (!r0 && c0.note) row.note = c0.note;
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
    const out = [], fresh = Object.keys(built).filter(k => !byKey[k] && built[k]), done = new Set();
    items.forEach(r => {
      if (Object.prototype.hasOwnProperty.call(built, r.key)) { if (built[r.key]) out.push(built[r.key]); } else out.push(r);
      fresh.filter(k => meta[k] && meta[k].after === r.key).forEach(k => { out.push(built[k]); done.add(k); });   // 6d: แถวใหม่ต่อท้ายแถวเดิมของชิ้น
    });
    fresh.filter(k => !done.has(k)).forEach(k => {   // แถวใหม่: ต่อท้ายหมวดเดียวกัน
      const row = built[k]; let at = -1; out.forEach((r, i) => { if (r.group_code === row.group_code) at = i; });
      if (at < 0) { const ord = ['1.2.1', '1.2.2', '1.2.4', '1.2.5', '1.2.7']; out.forEach((r, i) => { if (ord.indexOf(r.group_code) >= 0 && ord.indexOf(r.group_code) < ord.indexOf(row.group_code)) at = i; }); }
      out.splice(at + 1, 0, row);
    });
    return out;
  }

  // ------------------------------------------------------------------ ตรวจข้อมูลวัสดุ (ก่อนบันทึก/รับจากไฟล์ — ไม่เชื่อไฟล์)
  function clean(m) {
    const s = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
    const col = v => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : undefined;
    const cls = ['clad', 'paint', 'ground', 'roof', 'item'].includes(m && m.cls) ? m.cls : 'clad';
    const lk = (m && m.look) || {}, pat = PAT[lk.pat] ? lk.pat : 'plain';
    const look = { pat };
    ['color', 'color2', 'grout'].forEach(k => { const c = col(lk[k]); if (c) look[k] = c; });
    if (+lk.gw >= 0 && +lk.gw <= 50) look.gw = +lk.gw;
    if (Array.isArray(lk.cell) && +lk.cell[0] > 0 && +lk.cell[1] > 0) look.cell = [Math.min(20, +lk.cell[0]), Math.min(20, +lk.cell[1])].map(v => Math.round(v * 1e4) / 1e4);
    const KS = cls === 'item' ? Object.keys(ITEM_KINDS) : CLAD_KINDS;
    let kinds = cls === 'ground' || cls === 'roof' ? [] : [...new Set(((m && m.kinds) || []).filter(k => KS.includes(k)))];
    if (cls === 'item' && kinds.length) { const u = kinds[0].split(':')[0]; kinds = kinds.filter(k => k.split(':')[0] === u).slice(0, 7); }   // 6d: ชนิดในหมวดเดียวกัน
    const out = { id: s(m && m.id, 60), name: s(m && m.name, 200), cls, kinds, spec: cls === 'clad' || cls === 'roof' || cls === 'item' ? s(m && m.spec, 300) : '', look };
    if (cls === 'item' && kinds.length && kinds.every(k => /^open:/.test(k)) && STYLE_TH[m && m.style]) out.style = m.style;
    if (cls === 'roof') {
      out.cover = COVER_TH[m && m.cover] ? m.cover : 'metal_sheet';
      const i = (m && m.ins) || {}, md = ['keep', 'none', 'set'].includes(i.mode) ? i.mode : 'keep';
      out.ins = md === 'set' ? { mode: md, desc: s(i.desc, 200) } : { mode: md };
    }
    const sg = m && m.sug, sgc = v => v && typeof v === 'object' && ['mat', 'comp', 'survey', 'wage', 'none'].includes(v.kind) ? { kind: v.kind, code: s(v.code, 60), key: s(v.key, 200), label: s(v.label, 300) } : undefined;
    if (sg && (sgc(sg.mat) || sgc(sg.lab))) { out.sug = {}; if (sgc(sg.mat)) out.sug.mat = sgc(sg.mat); if (sgc(sg.lab)) out.sug.lab = sgc(sg.lab); }
    ['by', 'byName'].forEach(k => { if (m && m[k]) out[k] = s(m[k], 200); });
    if (m && +m.at > 0) out.at = +m.at;
    return out;
  }
  function problems(m) {
    const e = [];
    if (!m.name) e.push('ยังไม่มีชื่อวัสดุ');
    if ((m.cls === 'clad' || m.cls === 'roof' || m.cls === 'item') && !m.spec) e.push('ยังไม่มีข้อความรายการ BOQ');
    if (m.cls === 'roof' && m.ins && m.ins.mode === 'set' && !m.ins.desc) e.push('ยังไม่ได้ระบุชนิด/ความหนาฉนวน');
    if (m.cls !== 'ground' && m.cls !== 'roof' && !m.kinds.length) e.push(m.cls === 'item' ? 'ยังไม่ได้เลือกว่าใช้กับชิ้นชนิดใด' : 'ยังไม่ได้เลือกว่าใช้กับผิวชนิดใด');
    return e;
  }
  /** ผิวดินค่าเริ่ม (ไม่อยู่ในคลัง) */
  const BUILTIN = {
    'B-soil': { id: 'B-soil', name: 'ดิน', cls: 'ground', kinds: [], spec: '', look: { pat: 'soil' }, builtin: true },
    'B-grass': { id: 'B-grass', name: 'หญ้า', cls: 'ground', kinds: [], spec: '', look: { pat: 'grass' }, builtin: true },
  };

  return { PAT, PAT_FOR, CLAD_KINDS, KIND_TH, CLS_TH, GROUND, BUILTIN, lookOf, repeatOf, hex, draw, swatch,
    pieceClass, kindOfPiece, accepts, typeKey, effective, contribs, apply, clean, problems, r2,
    swapMode, sideOf, needSide, wallDeltas, baseQty, SIDE_TH,
    COVER_TH, INS_TH, isRoof, specOf, pieces, otherKind, roofMoves,
    isUnit, units, unitRow, unitMoves, ITEM_KINDS, STYLE_TH, UNIT_TH, POINT_NAME, EQUIP_NAME, FIXTURE_NAME, OPEN_NAME };
});
