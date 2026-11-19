/* UD BoqBind — การผูกราคาที่ผู้ใช้เลือกเอง (หน้าต่างผูกราคา ตาม UD Cost Hub) ทับการผูกอัตโนมัติจาก pricemap ทีละฝั่ง
 * (Earth 19 พ.ย. 2569: ยังคงผูกอัตโนมัติไว้ · ผูกเองเก็บใน .boq.json · ค่าวัสดุ / ค่าแรง แยกกัน)
 *
 * bind[key] = { mat?, lab? }   (รูปแบบเดียวกับ r.mat / r.lab ของ Cost Hub)
 *   mat: {kind:'mat', code, label}      ราคาพาณิชย์ (รหัส)
 *        {kind:'comp', code, label}     วัสดุมวลรวม (เลขข้อ เช่น 7.2)
 *        {kind:'survey', key, label}    ราคาสืบ (target ของรายการสืบในโครงการ เช่น row:<key>)
 *        {kind:'manual', price, note}   กรอกเอง (+ รายละเอียด/ที่มา)
 *        {kind:'none'}                  ไม่มีค่าวัสดุ (งานที่มีแต่ค่าแรง)
 *   lab: {kind:'wage', code, label}     ค่าแรง ว480
 *        {kind:'manual', price, note}
 *        {kind:'none'}                  ไม่มีค่าแรง (รวมในค่าอื่นแล้ว)
 *
 * ฟังก์ชันล้วน ไม่แตะ DOM — ใช้ได้ทั้งเว็บและ node (tools/test_boqbind.js)
 *   BoqBind.apply(rows, bind, {overrides, survey, surveyOf}) → {rows, overrides, survey}
 *     rows      = แถวที่ผูกอัตโนมัติแล้ว (PriceMap.bindAll) — คืนแถวใหม่ที่ price_ref ถูกทับตามการผูกเอง
 *     overrides = state.overrides เดิมของ BoqCalc (ไม่แก้ของเดิม คืนสำเนา)
 *     survey    = ราคาสืบรายแถว {key: {price, src}} ของเดิม · surveyOf(target) → {price, src} | null
 *   BoqBind.migrate(boq) — ไฟล์เดิม: overrides.mat/lab (กรอกในช่อง) และ no_mat → bind (คืนจำนวนที่ย้าย)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BoqBind = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const has = v => v !== undefined && v !== null && v !== '';
  const MAT_DROP = ['find', 'need_mat', 'why', 'prices', 'qty', 'partial'];   // ฝั่งวัสดุของการผูกอัตโนมัติ
  const LAB_DROP = ['wage_code', 'wages', 'area', 'lab_pct', 'lab_of_mat', 'lab_none', 'no_lab', 'wage_tiers'];

  function applyRow(row, b, ov, sv, surveyOf) {
    const ref0 = row.price_ref || {}, ref = Object.assign({}, ref0);
    const o = Object.assign({}, ov[row.key] || {});
    // ฝั่งค่าแรงของแถวค่าแรงอย่างเดียวเดิม (kind 'wage' ใช้ code เป็นรหัสค่าแรง) — ย้ายไป wage_code ก่อนเปลี่ยนชนิด
    if (b.mat && ref.kind === 'wage') { ref.wage_code = ref.wage_code || ref.code; delete ref.code; ref.kind = 'user'; }
    if (b.mat) {
      const m = b.mat;
      MAT_DROP.forEach(k => delete ref[k]); delete o.mat; delete o.no_mat; delete sv[row.key];
      if (ref.kind === 'pct') { ['of', 'mat', 'of_label', 'of_txt'].forEach(k => delete ref[k]); }
      if (m.kind === 'mat' || m.kind === 'comp') { ref.kind = m.kind; ref.code = m.code; }
      else {
        ref.kind = 'user'; delete ref.code;
        if (m.kind === 'manual' && has(m.price)) o.mat = +m.price;
        else if (m.kind === 'none') o.no_mat = true;
        else if (m.kind === 'survey') { const s = surveyOf ? surveyOf(m.key) : null; if (s && s.price !== null && s.price !== undefined) sv[row.key] = { price: s.price, src: s.src }; }
      }
    }
    if (b.lab) {
      const l = b.lab;
      LAB_DROP.forEach(k => delete ref[k]); delete o.lab;
      if (ref.kind === 'wage') { delete ref.code; ref.kind = 'user'; ref.wage_only = true; }
      if (l.kind === 'wage') ref.wage_code = l.code;
      else if (l.kind === 'manual' && has(l.price)) o.lab = +l.price;
      else if (l.kind === 'none') { ref.lab_none = true; ref.no_lab = 'กำหนดเอง'; }
    }
    // แถวที่เดิมเป็นค่าแรงอย่างเดียว แต่ผู้ใช้ผูกแค่ค่าแรงใหม่ → ยังเป็นค่าแรงอย่างเดียว
    if (ref.wage_only && !b.mat) { ref.kind = 'wage'; ref.code = ref.wage_code; delete ref.wage_code; }
    delete ref.wage_only;
    // ผูกเองแล้ว: เตือนฝั่งที่ยังไม่มีราคาค้างไว้ (เหมือน Cost Hub) — ยกเว้นแถวที่ตัวผูกอัตโนมัติตั้งใจไม่มีค่าแรงแยก (no_lab)
    if (!b.lab && ref.no_lab) ref.lab_none = true;
    ref.chk = true;
    if (Object.keys(o).length) ov[row.key] = o; else delete ov[row.key];
    return Object.assign({}, row, { price_ref: ref, bound: { mat: b.mat ? b.mat.kind : '', lab: b.lab ? b.lab.kind : '' } });
  }

  function apply(rows, bind, opts) {
    opts = opts || {};
    const ov = JSON.parse(JSON.stringify(opts.overrides || {})), sv = Object.assign({}, opts.survey || {});
    const B = bind || {};
    const out = rows.map(r => { const b = B[r.key]; return b && (b.mat || b.lab) ? applyRow(r, b, ov, sv, opts.surveyOf) : r; });
    return { rows: out, overrides: ov, survey: sv };
  }

  /** ไฟล์เดิม: ราคาที่พิมพ์ในช่อง (overrides.mat/lab) และปุ่ม "ไม่มีค่าวัสดุ" (no_mat) → bind */
  function migrate(boq) {
    const ov = boq.overrides || {}; boq.bind = boq.bind || {}; let n = 0;
    Object.keys(ov).forEach(k => {
      const o = ov[k], b = boq.bind[k] = boq.bind[k] || {};
      if (has(o.mat) && !b.mat) { b.mat = { kind: 'manual', price: +o.mat, note: '' }; n++; }
      else if (o.no_mat && !b.mat) { b.mat = { kind: 'none' }; n++; }
      if (has(o.lab) && !b.lab) { b.lab = { kind: 'manual', price: +o.lab, note: '' }; n++; }
      delete o.mat; delete o.lab; delete o.no_mat;
      if (!Object.keys(o).length) delete ov[k];
      if (!b.mat && !b.lab) delete boq.bind[k];
    });
    return n;
  }

  /** ป้ายที่มาของการผูกเอง (ต่อท้าย mat_src / lab_src ที่ BoqCalc คืน) */
  function label(v) {
    if (!v) return '';
    if (v.kind === 'manual') return 'กรอกเอง' + (v.note ? ': ' + v.note : '');
    if (v.kind === 'none') return '';
    return v.label || v.code || v.key || '';
  }
  return { apply, migrate, label };
});
