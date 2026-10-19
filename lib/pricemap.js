/* UD PriceMap — ผูกรหัสราคา (วัสดุ/ค่าแรง) ให้แถว BOQ ตอนเปิดในเว็บ (ตกลงกับ Earth 18 ต.ค. 2569)
 * ลำดับ: แถว % (pct) คงเดิม → ผูกตามชนิด/ขนาด (row.spec จากตัวถอดปริมาณ) → tools/price_map.json ตาม key → price_ref เดิมในไฟล์
 * แก้การผูกที่ไฟล์นี้/price_map.json ที่เดียว ทุกโครงการได้ผลทันทีโดยไม่ต้องถอดปริมาณใหม่
 *
 * ชนิด price_ref ที่คืน: mat {code} · comp {code} · mat_find {find} (หาในราคาพาณิชย์ เลือกถูกสุดในอุดรก่อน) · user
 *   + wage_code (ค่าแรง ว480 ต่อหน่วยแถว) หรือ wages [{code, per:'area'|'unit'}] + area (ค่าแรงต่อ ตร.ม. ของช่องเปิด × พื้นที่)
 *   + need_mat (ต้องมีค่าวัสดุแต่ราคาพาณิชย์ไม่มี → ให้ไปกรอก/สืบราคา)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PriceMap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const dia = s => {   // '1/2"' → 0.5, '1 1/2"' → 1.5
    const t = String(s || '').replace(/["”]|นิ้ว/g, '').trim(), m = t.match(/^(\d+)?\s*(?:(\d+)\/(\d+))?$/);
    if (!m || !(m[1] || m[2])) return null;
    return (+m[1] || 0) + (m[2] ? m[2] / m[3] : 0);
  };
  const L = (tab, v) => (v !== null && v !== undefined && tab[v] !== undefined ? tab[v] : null);
  // ว480 ตามขนาด
  const SN37 = { 1.5: 'a', 2: 'b', 2.5: 'c', 3: 'd', 4: 'e', 6: 'f' };                                     // PVC ระบายน้ำ
  const SN38 = { 0.5: 'a', 0.75: 'b', 1: 'c', 1.25: 'd', 1.5: 'e', 2: 'f', 2.5: 'g', 3: 'h', 4: 'i', 6: 'j' }; // PVC ประปา / PP-R (3.10)
  const EE444 = { 15: 'i', 20: 'h', 25: 'g', 32: 'f', 40: 'e', 50: 'd', 65: 'c', 80: 'b', 100: 'a' };         // ท่อร้อยสาย PVC (มม.)
  const IN_MM = { 0.5: 15, 0.75: 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 4: 100 };
  const EE42 = { 0.5: 'a', 1: 'b', 1.5: 'c', 2.5: 'd', 4: 'e', 6: 'f', 10: 'g', 16: 'h', 25: 'i', 35: 'j', 50: 'k', 70: 'l', 95: 'm', 120: 'n', 150: 'o', 185: 'p', 240: 'q', 300: 'r', 400: 's', 500: 't' };
  const EE421 = { 1: 'a', 1.5: 'b', 2.5: 'c', 4: 'd', 6: 'e', 10: 'f', 16: 'g' };
  const FIX = { wc: 'ARC-2.6.1', lavatory: 'ARC-2.6.6', urinal: 'ARC-2.6.4', shower: 'ARC-2.6.10', spray: 'ARC-2.6.11', faucet: 'ARC-2.6.23', floor_drain: 'ARC-2.6.25', sink: 'ARC-2.6.31' };
  const user = (wage_code, why) => Object.assign({ kind: 'user', need_mat: true }, wage_code ? { wage_code } : {}, why ? { why } : {});

  const RULES = {
    pipe(s) {
      const d = dia(s.dia), drain = ['soil', 'waste', 'vent', 'rain', 'drain'].includes(s.sys), mat = s.mat || '';
      if (/PVC/i.test(mat)) {
        const cls = (mat.match(/ชั้น\s*([\d.]+)/) || [])[1] || '8.5';
        let w = drain ? L(SN37, d) : L(SN38, d), why = '';
        if (drain && d !== null && d < 1.5) { w = 'a'; why = `ท่อระบายน้ำ ⌀${s.dia} เล็กกว่าตาราง ว480 ใช้ค่าแรง 1.5"`; }
        return Object.assign({ kind: 'mat_find', find: { type: 'pvc_pipe', cls, dia: s.dia } }, w ? { wage_code: `${drain ? 'SN-3.7' : 'SN-3.8'}-${w}` } : {}, why ? { why } : {});
      }
      if (/PP-?R|PB|HDPE/i.test(mat) && !drain) return user(L(SN38, d) && `SN-3.10-${L(SN38, d)}`, 'ท่อ PP-R ไม่มีในราคาพาณิชย์');
      return user(null, `ท่อ ${mat} ยังไม่มีการผูกราคา`);
    },
    conduit(s) {
      const c = s.conduit || '', mi = c.match(/(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*"/), mm = mi ? IN_MM[dia(mi[1])] : +((c.match(/(\d+)\s*มม/) || [])[1] || 0);
      return user(/PVC/i.test(c) && EE444[mm] ? `EE-4.44-${EE444[mm]}` : null, 'ท่อร้อยสายไม่มีในราคาพาณิชย์');
    },
    wire(s) {
      const z = parseFloat(s.size), t = String(s.wire || '').toUpperCase();
      if (!isFinite(z)) return user(null, 'ไม่ระบุขนาดสาย');
      if (/THW|IEC ?01|60227/.test(t)) return Object.assign({ kind: 'mat_find', find: { type: 'thw', size: String(z) } }, EE42[z] ? { wage_code: `EE-4.2-${EE42[z]}` } : {});
      if (/VAF/.test(t)) return Object.assign({ kind: 'mat_find', find: { type: 're', re: `สายไฟฟ้า VAF.*2 ?[x×*] ?${z}(\\.0)? ?ตร` } }, EE421[z] ? { wage_code: `EE-4.21-${EE421[z]}` } : {});
      return user(null, `สาย ${s.wire} ยังไม่มีการผูกราคา`);
    },
    point(s) {
      const d = String(s.desc || '').toLowerCase();
      if (s.kind === 'light' || s.kind === 'lamp') return user(/ดาวน์|downlight/.test(d) ? 'EE-4.58-a' : null, 'โคมไม่มีในราคาพาณิชย์');
      if (s.kind === 'switch') return /3 ทาง|2 ทาง|two ?way/.test(d) ? { kind: 'mat_find', find: { type: 're', re: '^สวิตช์ไฟฟ้า 3 ทาง' }, wage_code: 'EE-4.53-e' } : user('EE-4.53-a', 'สวิตช์ทางเดียวไม่มีในราคาพาณิชย์');
      if (s.kind === 'outlet') return /เดี่ยว|single/.test(d) ? { kind: 'mat_find', find: { type: 're', re: '^เต้ารับเดี่ยว.*มีกราวด์' }, wage_code: 'EE-4.53-j' }
        : { kind: 'mat_find', find: { type: 're', re: '^เต้ารับคู่.*มีกราวด์' }, wage_code: 'EE-4.53-k' };
      return user({ tv: 'EE-4.53-n', data: 'EE-4.53-o', bell: 'EE-4.53-q' }[s.kind] || null);
    },
    fixture: s => user(FIX[s.kind] || null, 'สุขภัณฑ์ไม่มีในราคาพาณิชย์'),
    equip(s) {
      if (s.kind === 'septic_tank') {
        const n = ((String(s.size).match(/([\d,]+)\s*ลิตร/) || [])[1] || '').replace(/,/g, '');
        return n ? { kind: 'mat_find', find: { type: 're', re: `^ถังบำบัดน้ำเสีย.*${n.length > 3 ? n.slice(0, -3) + ',?' + n.slice(-3) : n} ?ลิตร` }, no_lab: 'ว480 ไม่มีค่าแรงติดตั้งถังบำบัด — ใส่เองถ้ามี' } : user();
      }
      if (['meter', 'gate_valve', 'check_valve'].includes(s.kind)) return user({ 0.5: 'SN-3.12-a', 0.75: 'SN-3.12-b' }[dia(s.size)] || null);
      return user();
    },
    plaster(s) {
      const aac = s.wall === 'aac';
      return { kind: 'comp', code: aac ? '7.3' : '7.2', wage_code: s.side === 'ext' ? 'ARC-2.3.1.2-d' : 'ARC-2.3.1.2-c' };
    },
    lintel(s) {
      const full = /full/.test(s.wall || '') || (s.wt || 0) >= 0.15;
      return { kind: 'comp', code: '4.1', wage_code: full ? ((s.wt || 0) >= 0.2 ? 'ARC-2.3.1-y' : 'ARC-2.3.1-x') : 'ARC-2.3.1-w' };
    },
    cover(s) {
      const w = { metal_sheet: s.form === 'curved' ? 'ARC-2.1.8-b' : 'ARC-2.1.8-a', cpac_tile: 'ARC-2.1.3-a', fibre_cement: 'ARC-2.1.1-a' }[s.cover];
      return user(w || null, 'วัสดุมุงไม่มีในราคาพาณิชย์');
    },
    ridge: s => user({ metal_sheet: 'ARC-2.1.8-c', cpac_tile: 'ARC-2.1.3-c' }[s.cover] || null),
    hip: s => user({ metal_sheet: 'ARC-2.1.8-c', cpac_tile: 'ARC-2.1.3-c' }[s.cover] || null),
    insulation(s) {
      const d = String(s.desc || '');
      return user(/ฟอยล์|foil/i.test(d) && !/ใยแก้ว/.test(d) ? 'ARC-2.1.10-a' : 'ARC-2.1.10-b');
    },
    finish(s) {
      const d = String(s.desc || '');
      if (s.kind === 'floor' && /แกรนิตโต้/.test(d)) {
        const cm = d.match(/(\d+)\s*[x×]\s*(\d+)\s*ซม/), inch = d.match(/(\d+)"?\s*[x×]\s*(\d+)"/);
        const sz = cm ? Math.round(Math.max(+cm[1], +cm[2]) / 2.54) : inch ? Math.max(+inch[1], +inch[2]) : null;
        const s4 = sz === null ? null : sz >= 23 ? 24 : sz >= 19 ? 20 : sz >= 15 ? 16 : 12;
        const gloss = /มัน|ขัดเงา|polish/i.test(d);
        const comp = { 12: gloss ? '9.42' : '9.38', 16: gloss ? '9.43' : '9.39', 20: gloss ? '9.44' : '9.40', 24: gloss ? '9.45' : '9.41' }[s4];
        const wage = s4 === null ? null : s4 >= 24 ? 'ARC-2.4.8-c' : s4 >= 18 ? 'ARC-2.4.8-b' : 'ARC-2.4.8-a';
        return comp ? { kind: 'comp', code: comp, wage_code: wage, why: gloss ? '' : 'แบบไม่ระบุผิว — ใช้ผิวด้าน' } : user(wage);
      }
      if (s.kind === 'ceiling' && /ยิปซัม|ยิบซัม|gypsum/i.test(d)) {
        const t12 = /12\s*มม/.test(d);
        return { kind: 'comp', code: t12 ? '5.36' : '5.35', wage_code: /ที-?บาร์|t-?bar/i.test(d) ? 'ARC-2.2.4' : 'ARC-2.2.3' };
      }
      return null;
    },
    opening(s) {
      const d = String(s.desc || ''), area = +(s.w * s.h).toFixed(4);
      if (/อลูมิเนียม|อะลูมิเนียม|uPVC|ยูพีวีซี|กระจก|เหล็ก/i.test(d)) return Object.assign(user(null, 'บานอลูมิเนียม/uPVC ไม่มีในราคาพาณิชย์ (สืบราคารวมติดตั้ง)'), { no_lab: 'รวมในราคาสืบ (ว480 ไม่มีค่าแรงติดตั้งบานอลูมิเนียม/uPVC)' });
      if (/ไม้|ไฟเบอร์|PVC/i.test(d)) {
        const door = s.kind === 'door', ready = /อัด|สำเร็จ|ไฟเบอร์|PVC|HDF/i.test(d);
        const wages = door
          ? [{ code: 'ARC-2.5.2-a', per: 'area' }, { code: ready ? 'ARC-2.5.3-b' : 'ARC-2.5.3-a', per: 'area' }, { code: 'ARC-2.5.4-a', per: 'unit' }]
          : [{ code: 'ARC-2.5.2-b', per: 'area' }, { code: 'ARC-2.5.3-c', per: 'area' }];
        return { kind: 'user', need_mat: true, wages, area, why: `${door ? 'ประตู' : 'หน้าต่าง'}ไม้ไม่มีในราคาพาณิชย์` };
      }
      return user();
    },
  };

  function lookup(map, key) {
    if (!map) return null;
    if (map[key]) return map[key];
    const base = key.replace(/_(retain|stair)$/, ''); if (base !== key) return lookup(map, base);   // กำแพงกันดิน/บันได ใช้ราคาเดียวกับคอนกรีต/ไม้แบบ/ขุด/ทรายปกติ
    const k = Object.keys(map).filter(k => k.endsWith('*') && key.startsWith(k.slice(0, -1))).sort((a, b) => b.length - a.length)[0];
    return k ? map[k] : null;
  }
  /** คืน price_ref ของแถว (ไม่แก้แถวเดิม) */
  function bind(row, map) {
    const pr = row.price_ref;
    if (pr && pr.kind === 'pct') return pr;
    const sp = row.spec && RULES[row.spec.t] ? RULES[row.spec.t](row.spec) : null;
    if (sp) return sp;
    const m = lookup(map, row.key);
    if (m) return m;
    return pr || null;
  }
  function bindAll(rows, map) { return rows.map(r => { const ref = bind(r, map); return ref === r.price_ref ? r : Object.assign({}, r, { price_ref: ref }); }); }

  return { bind, bindAll, lookup, RULES, dia };
});
