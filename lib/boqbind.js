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

  // ---------------------------------------------------------------- มวลรวมผูกทีละบรรทัด (ก้อน 4b ตาม Cost Hub)
  /* cmp[rowKey] = ขอบเขตราก {code, lines:{i: link}, prices:{i: บาท}, qty:{i: ปริมาณ}, accept:[i ที่ขาดตอนยอมรับ], sub:{รหัสมวลรวมซ้อน: {lines, prices, qty, accept}}}
   *   link = {kind:'mat', code} พาณิชย์ · {kind:'survey', key} ราคาสืบในโครงการ · {kind:'comp', code} มวลรวมอื่น (ผูกบรรทัดย่อยต่อใน sub[code])
   *   ใช้กับแถวที่ผูกมวลรวม (อัตโนมัติหรือผูกเอง) เมื่อรหัสตรงกับ code เท่านั้น — เปลี่ยนมวลรวมแล้วการผูกบรรทัดเดิมไม่ถูกใช้
   *   ลำดับราคาบรรทัด: ผูกบรรทัดนี้ (prices) → ราคาสืบที่ใช้ทั้งโครงการ / ราคาคงที่ (fixedPrice) → ราคาพาณิชย์ (Earth 19 พ.ย. 2569)
   * ctx = {db, U, surveyOf(target) → {price, src, unit, n, name}} */
  const scopeOf = (root, code) => (!code || code === root.code) ? root : Object.assign({ code }, (root.sub || {})[code] || {});
  function cmpLines(db, code) { const c = db && db.findComp(code); if (!c) return []; const p = db.compPrice(c.id, {}); return (p && p.lines) || []; }
  function cmpQty(sc) { const o = {}; Object.entries((sc && sc.qty) || {}).forEach(([k, v]) => { if (has(v) && isFinite(+v) && +v > 0) o[k] = +v; }); return Object.keys(o).length ? o : undefined; }
  function conv(ctx, price, fu, tu, fn, tn) {
    const N = ctx.U.units.normUnit; if (!fu || !tu || N(fu) === N(tu)) return { ok: true, price, how: '' };
    const c = ctx.U.units.convertPrice(price, fu, tu, fn, tn); return c && c.ok && c.price !== null ? c : { ok: false };
  }
  /** ราคาของบรรทัดที่ผูกไว้: {state:'ok'|'badunit'|'missing', price, label, src, n, warn, nested} หรือ null (ไม่ได้ผูก) */
  function cmpLineInfo(ctx, root, sc, ln, depth) {
    const l = (sc.lines || {})[ln.index]; if (!l) return null;
    const db = ctx.db;
    if (l.kind === 'survey') {
      const a = ctx.surveyOf ? ctx.surveyOf(l.key) : null;
      if (!a || a.price === null || a.price === undefined) return { state: 'missing', label: l.label || '', warn: 'ราคาสืบที่ผูกไว้ยังไม่มีราคา' };
      const c = conv(ctx, a.price, a.unit, ln.unit, a.name, ln.name);
      if (!c.ok) return { state: 'badunit', label: a.name, warn: `หน่วยราคาสืบ (${a.unit}) ไม่ตรง ${ln.unit}` };
      return { state: 'ok', price: c.price, label: a.name, src: 'ราคาสืบ', n: a.n };
    }
    if (l.kind === 'comp') {
      const c = db.findComp(l.code); if (!c) return { state: 'missing', label: l.code, warn: 'ไม่พบวัสดุมวลรวม ' + l.code };
      const st = depth < 4 ? cmpState(ctx, root, scopeOf(root, c.sub), depth + 1) : null;
      const pr = st ? ((st.complete || st.acc) ? st.pp.price : null) : (db.compPrice(c.id, {}) || {}).price;
      if (pr === null || pr === undefined) return { state: 'missing', nested: c.sub, prov: st && st.pp ? st.pp.price : null, label: c.sub + ' ' + c.name, warn: 'มวลรวม ' + c.sub + ' ยังคิดราคาไม่ครบ — ผูกราคารายการย่อยให้ครบ หรือกดยอมรับราคาไม่ครบ' };
      const cx = conv(ctx, pr, c.unit, ln.unit, c.name, ln.name);
      if (!cx.ok) return { state: 'badunit', label: c.sub + ' ' + c.name, warn: `หน่วยมวลรวม (${c.unit}) ไม่ตรง ${ln.unit}` };
      return { state: 'ok', price: cx.price, label: c.sub + ' ' + c.name, src: 'วัสดุมวลรวม ' + c.sub + (st && st.acc ? ' (ราคาไม่ครบ ยอมรับแล้ว)' : '') };
    }
    const m = db.material(l.code);
    if (!m || m.price === null || m.price === undefined) return { state: 'missing', label: l.code, warn: 'ไม่มีราคาพาณิชย์รหัส ' + l.code + ' เดือนนี้' };
    const cx = conv(ctx, m.price, m.unit, ln.unit, m.name, ln.name);
    if (!cx.ok) return { state: 'badunit', label: m.name, warn: `แปลงหน่วย ${m.unit} เป็น ${ln.unit} ไม่ได้` };
    return { state: 'ok', price: cx.price, label: m.name, src: 'พาณิชย์ ' + m.code + (cx.how ? ' · ' + cx.how : '') };
  }
  function cmpPrices(ctx, root, sc, depth) {
    const out = Object.assign({}, sc.prices || {});
    cmpLines(ctx.db, sc.code).forEach(ln => { const x = cmpLineInfo(ctx, root, sc, ln, depth || 0); if (x && x.state === 'ok') out[ln.index] = x.price; });
    return out;
  }
  /** สถานะมวลรวมหนึ่งใบ: {c, pp, complete, missing, acc (ยอมรับแล้วและชุดที่ขาดยังเหมือนตอนยอมรับ), stale (ยอมรับไว้แต่ชุดที่ขาดเปลี่ยน)} */
  function cmpState(ctx, root, sc, depth) {
    const c = ctx.db && ctx.db.findComp(sc.code); if (!c) return null;
    const pr = cmpPrices(ctx, root, sc, depth || 0);
    const pp = ctx.db.compPrice(c.id, { prices: Object.keys(pr).length ? pr : undefined, qty: cmpQty(sc), partial: true }); if (!pp) return null;
    const acc = !pp.complete && Array.isArray(sc.accept) && sc.accept.join(',') === pp.missing.join(',');
    return { c, pp, complete: pp.complete, missing: pp.missing, acc, stale: !pp.complete && !acc && Array.isArray(sc.accept) && sc.accept.length > 0 };
  }
  /** ยอมรับราคาไม่ครบ ทั้งมวลรวมใบนี้และมวลรวมซ้อนข้างใน (แก้ root) — คืนจำนวนใบที่ยอมรับ */
  function cmpAccept(ctx, root, sc, depth) {
    let n = 0;
    cmpLines(ctx.db, sc.code).forEach(ln => { const lk = (sc.lines || {})[ln.index]; if (lk && lk.kind === 'comp' && depth < 3) n += cmpAccept(ctx, root, scopeOf(root, lk.code), depth + 1); });
    const st = cmpState(ctx, root, sc, depth); if (!st || st.complete) return n;
    const tgt = sc === root ? root : ((root.sub = root.sub || {})[sc.code] = root.sub[sc.code] || {});
    tgt.accept = st.missing.slice(); return n + 1;
  }
  /** ส่วนที่ต้องเติมใน price_ref ของแถวมวลรวม: {prices, qty, partial} */
  function cmpRef(ctx, root) {
    const st = cmpState(ctx, root, root, 0); if (!st) return {};
    const out = {}, pr = cmpPrices(ctx, root, root, 0), q = cmpQty(root);
    if (Object.keys(pr).length) out.prices = pr; if (q) out.qty = q; if (st.acc) out.partial = true;
    return out;
  }

  function apply(rows, bind, opts) {
    opts = opts || {};
    const ov = JSON.parse(JSON.stringify(opts.overrides || {})), sv = Object.assign({}, opts.survey || {});
    const B = bind || {}, C = opts.cmp || {}, ctx = { db: opts.db, U: opts.U, surveyOf: opts.surveyOf };
    const out = rows.map(r => {
      const b = B[r.key]; let x = b && (b.mat || b.lab) ? applyRow(r, b, ov, sv, opts.surveyOf) : r;
      const sc = C[r.key], ref = x.price_ref;
      if (sc && ctx.db && ctx.U && ref && ref.kind === 'comp' && ref.code === sc.code) {
        const add = cmpRef(ctx, sc); if (Object.keys(add).length) x = Object.assign({}, x, { price_ref: Object.assign({}, ref, add) });
      }
      return x;
    });
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
  return { apply, migrate, label, scopeOf, cmpLines, cmpQty, cmpLineInfo, cmpPrices, cmpState, cmpAccept, cmpRef };
});
