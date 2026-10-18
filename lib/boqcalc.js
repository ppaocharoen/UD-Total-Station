/*! boqcalc.js — คิดราคาแถว BOQ จาก quantities ของ .bm.json ด้วยฐานราคา UDPrice (UD-Cost Hub lib/pricing-v1.js)
 *
 * กฎปัดเศษ (ตกลงกับ Earth 18 ต.ค. 2569): ปริมาณแต่ละแถวปัด 2 ตำแหน่ง (มาจากตัวถอดแล้ว), ราคาต่อหน่วยปัด 2 ตำแหน่ง,
 * จำนวนเงิน = ปริมาณ × ราคาต่อหน่วย แล้วปัด 2 ตำแหน่ง — ตัวเลขที่พิมพ์คูณกันได้ตรง
 * ใช้ได้ทั้งเบราว์เซอร์ (window.BoqCalc) และ Node
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BoqCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function r2(x) {
    if (x === null || x === undefined || !isFinite(x)) return x;
    const s = x < 0 ? -1 : 1;
    return s * Math.round(+(Math.abs(x) * 100).toFixed(6)) / 100;
  }

  /** ราคาวัสดุจาก price_ref: คืน {price, src, warn} ต่อหน่วยของแถว */
  function materialPrice(db, U, ref, row, subPrices) {
    if (!ref || !ref.code) return { price: null, src: '', warn: '' };
    if (ref.kind === 'comp') {
      const comp = db.findComp(ref.code);
      if (!comp) return { price: null, src: '', warn: `ไม่พบวัสดุมวลรวม ${ref.code}` };
      const r = db.compPrice(comp.id, { subPrices });
      if (r.price === null) return { price: null, src: `วัสดุมวลรวม ${comp.sub}`, warn: `วัสดุมวลรวม ${comp.sub} คิดไม่ครบ (ขาดราคา/ปริมาณบางรายการ)`, comp: r };
      if (U.units.normUnit(comp.unit) !== U.units.normUnit(row.unit)) {
        const cx = U.units.convertPrice(r.price, comp.unit, row.unit, comp.name, row.name);
        if (!cx.ok) return { price: null, src: `วัสดุมวลรวม ${comp.sub}`, warn: `หน่วยวัสดุมวลรวม ${comp.unit} ไม่ตรงกับ ${row.unit}` };
        return { price: cx.price, src: `วัสดุมวลรวม ${comp.sub} (${cx.how})`, comp: r };
      }
      return { price: r.price, src: `วัสดุมวลรวม ${comp.sub}`, comp: r };
    }
    if (ref.kind === 'mat') {
      const { matItem, missing } = db.resolveMat({ itemCode: '', commodityCode: ref.code });
      if (!matItem) return { price: null, src: '', warn: `รหัสพาณิชย์ ${ref.code} ไม่มีราคาเดือนนี้` };
      const cx = U.units.convertPrice(matItem.price, matItem.unit, row.unit, matItem.name, row.name);
      if (!cx.ok) return { price: null, src: matItem.code, warn: cx.how };
      return { price: cx.price, src: `พาณิชย์ ${matItem.code} ${matItem.province}${missing.length ? ' (รหัสสำรอง)' : ''}${cx.how ? ' · ' + cx.how : ''}` };
    }
    return { price: null, src: '', warn: '' };
  }

  function laborPrice(db, U, code, row) {
    if (!code) return { price: null, src: '' };
    const w = db.wage(code);
    if (!w || w.price === null) return { price: null, src: '', warn: `ไม่พบค่าแรง ${code}` };
    const cx = U.units.convertPrice(w.price, w.unit, row.unit, '', row.name);
    if (!cx.ok) return { price: null, src: code, warn: `หน่วยค่าแรง ${w.unit} ไม่ตรงกับ ${row.unit}` };
    return { price: cx.price, src: `ว480 ${code}${cx.how ? ' · ' + cx.how : ''}` };
  }

  /**
   * คิดราคาทุกแถว
   * rows: quantities.items (+ แถวที่ผู้ใช้เพิ่ม)
   * state.overrides[key] = {mat, lab, code, wage_code, kind} ค่าที่ผู้ใช้แก้
   * คืน [{...row, mat_unit, mat_amt, lab_unit, lab_amt, total, mat_src, lab_src, warns[]}]
   */
  function priceRows(db, U, rows, state = {}) {
    const ov = state.overrides || {};
    const subPrices = state.subPrices || {};
    const out = rows.map(row => {
      if (row.price_ref && row.price_ref.kind === 'pct') return row;   // คิดรอบสอง (ต้องรู้ราคาแถวอ้างอิงก่อน)
      const o = ov[row.key] || {};
      const ref = Object.assign({}, row.price_ref || {}, o.kind ? { kind: o.kind } : {}, o.code !== undefined ? { code: o.code } : {},
        o.wage_code !== undefined ? { wage_code: o.wage_code } : {});
      const warns = [];
      let mat = { price: null, src: '' }, lab = { price: null, src: '' };
      if (db) {
        mat = materialPrice(db, U, ref, row, subPrices);
        lab = laborPrice(db, U, ref.wage_code || (ref.kind === 'wage' ? ref.code : null), row);
        if (ref.kind === 'wage') mat = { price: null, src: '' };
      }
      if (o.mat !== undefined && o.mat !== null && o.mat !== '') mat = { price: +o.mat, src: 'กรอกเอง' };
      if (o.lab !== undefined && o.lab !== null && o.lab !== '') lab = { price: +o.lab, src: 'กรอกเอง' };
      if (mat.warn) warns.push(mat.warn);
      if (lab.warn) warns.push(lab.warn);
      const mu = mat.price === null ? null : r2(mat.price);
      const lu = lab.price === null ? null : r2(lab.price);
      const ma = mu === null ? 0 : r2(row.qty * mu);
      const la = lu === null ? 0 : r2(row.qty * lu);
      if (mu === null && lu === null) warns.push('ยังไม่มีราคา');
      return Object.assign({}, row, { ref, mat_unit: mu, mat_amt: ma, lab_unit: lu, lab_amt: la, total: r2(ma + la),
        mat_src: mat.src, lab_src: lab.src, warns });
    });
    // แถวคิดเป็น % ของแถวอื่น (ข้อต่อ/อุปกรณ์ยึดท่อ ตามหลักเกณฑ์ 2569 ข้อ 4.3 ข้อ 3.2–3.3)
    const byKey = Object.fromEntries(out.filter(r => r.mat_amt !== undefined).map(r => [r.key, r]));
    return out.map(row => {
      if (!(row.price_ref && row.price_ref.kind === 'pct')) return row;
      const o = ov[row.key] || {}, pr = row.price_ref, warns = [];
      const refs = (pr.of || []).map(k => byKey[k]).filter(Boolean);
      const base = r2(refs.reduce((a, r) => a + (r.mat_amt || 0), 0));
      if (refs.some(r => r.mat_unit === null)) warns.push('ท่อบางรายการยังไม่มีราคา — ค่าข้อต่อ/อุปกรณ์ยังไม่ครบ');
      let mu = r2(base * pr.mat), lu = r2(mu * pr.lab_of_mat), ms = `${+(pr.mat * 100).toFixed(2)}% ของค่าท่อ ${base.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, ls = `${+(pr.lab_of_mat * 100).toFixed(2)}% ของค่าวัสดุ`;
      if (o.mat !== undefined && o.mat !== null && o.mat !== '') { mu = r2(+o.mat); ms = 'กรอกเอง'; }
      if (o.lab !== undefined && o.lab !== null && o.lab !== '') { lu = r2(+o.lab); ls = 'กรอกเอง'; }
      const ma = r2(row.qty * mu), la = r2(row.qty * lu);
      return Object.assign({}, row, { ref: pr, mat_unit: mu, mat_amt: ma, lab_unit: lu, lab_amt: la, total: r2(ma + la), mat_src: ms, lab_src: ls, warns });
    });
  }

  function sumBy(rows, key) {
    const out = {};
    rows.forEach(r => { const k = r[key] || ''; out[k] = r2((out[k] || 0) + r.total); });
    return out;
  }

  // ---------------------------------------------------------------- จำนวนเงินเป็นตัวอักษร
  const D = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function readInt(n) {
    if (n === 0) return '';
    if (n >= 1e6) {
      const hi = Math.floor(n / 1e6), lo = n % 1e6;
      return readInt(hi) + 'ล้าน' + readInt(lo);
    }
    const s = String(n); let out = '';
    for (let i = 0; i < s.length; i++) {
      const d = +s[i], pos = s.length - i - 1;
      if (d === 0) continue;
      if (pos === 1 && d === 1) out += 'สิบ';
      else if (pos === 1 && d === 2) out += 'ยี่สิบ';
      else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
      else out += D[d] + P[pos];
    }
    return out;
  }
  function bahtText(x) {
    x = r2(x);
    if (x === 0) return 'ศูนย์บาทถ้วน';
    const neg = x < 0; x = Math.abs(x);
    const baht = Math.floor(x + 1e-9), satang = Math.round((x - baht) * 100);
    let t = (baht ? readInt(baht) + 'บาท' : '') + (satang ? readInt(satang) + 'สตางค์' : 'ถ้วน');
    return (neg ? 'ลบ' : '') + t;
  }

  return { r2, priceRows, materialPrice, laborPrice, sumBy, bahtText };
});
