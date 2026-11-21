/* UD Total Station — ข้อมูลแผ่น "ที่มาของราคา" ในไฟล์ Excel ปร. (M2 ก้อน 7 · ตาม boqSourcesData ของ UD Cost Hub)
 * ฟังก์ชันล้วน ไม่แตะ DOM — ใช้ได้ทั้งเว็บ (boq/app.js) และ node (tools/test_e2e_t12.js)
 *
 * PriceSrc.build(o) → {commerce, wagesUsed, manual, pctRows, comps, surveys, materials:[], wages:[]}  (รูปแบบที่ lib/formxlsx.js sourcesSheet รับ)
 *   o.rows     = แถวที่คิดราคาแล้ว (BoqCalc.priceRows หลัง BoqBind.apply — S.priced)
 *   o.bind     = S.boq.bind (ผูกเอง)          o.cmp = S.boq.cmpline (มวลรวมผูกทีละบรรทัด)
 *   o.surveys  = S.boq.surveys (ราคาสืบทั้งโครงการ — Earth 21 พ.ย. 2569: แสดงทุกรายการในโครงการ)
 *   o.db, o.U  = ฐานราคา (UDPrice) · o.surveyOf(target) → {price, src, unit, n, name} · o.Survey = lib/survey.js
 *   o.svKey(it) = รหัสรายการสืบ (target) · o.refTxt(key, qid) = "ภาพที่ N" (ไม่ใส่ = ไม่มีคอลัมน์ภาพ)
 * แถวที่ผูกอัตโนมัติ "ถูกสุดจากหลายรายการในพาณิชย์" (mat_find): แสดงรหัสที่เลือก + หมายเหตุในช่องจังหวัด (Earth 21 พ.ย. 2569)
 * ไม่มีส่วน Backup (materials/wages) — Total Station ไม่มีรายการ Backup แยกแบบ Cost Hub
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PriceSrc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = x => { const s = x < 0 ? -1 : 1; return s * Math.round(+(Math.abs(x) * 100).toFixed(6)) / 100; };
  const f2 = v => (+v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const has = v => v !== undefined && v !== null && v !== '';
  const wc = v => { v = String(v == null ? '' : v).trim(); return v === '-' ? '' : v; };
  /** เส้นทางหมวดเต็มของค่าแรง ว480 (เหมือน bqWagePath ใน boq/bind.js) */
  function wagePath(d) { const o = []; [d.sheetLabel, d.h1, d.h2, d.h3, d.h4].forEach(x => { x = wc(x); if (x && o[o.length - 1] !== x) o.push(x); }); return o; }
  /** ข้อความที่มาของ BoqCalc.findMat: "พาณิชย์ <รหัส> <จังหวัด> · ถูกสุดจาก <n> รายการ[ (อุดรไม่มี)][ · แปลงหน่วย]" */
  const FIND_RE = /^พาณิชย์ (\S+) (\S+) · ถูกสุดจาก (\d+) รายการ( \(อุดรไม่มี\))?/;
  const CMP_SRC = { commerce: 'พาณิชย์', 'commerce-fallback': 'พาณิชย์ (รหัสสำรอง)', fixed: 'ราคาคงที่', 'sub-comp': 'ส่วนผสม', user: 'กรอกเอง' };

  function build(o) {
    const rows = o.rows || [], B = o.bind || {}, C = o.cmp || {}, db = o.db, U = o.U, SV = o.Survey;
    const svKey = o.svKey || (it => it.target || it.id), ctx = { db, U, surveyOf: o.surveyOf };
    const push = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));

    // ---------------------------------------------------------------- พาณิชย์
    const cm = {};
    const addC = (code, who, prov, price) => {
      if (!code || !db) return;
      let m = null; try { m = db.resolveMat({ itemCode: '', commodityCode: code }).matItem; } catch (e) { m = null; }
      if (!m) return;
      const k = m.code + '|' + (prov || '');
      const e = cm[k] || (cm[k] = { code: m.code, name: m.name, unit: m.unit, price: has(price) ? price : m.price, province: prov || m.province,
        cat: m.catName || '', period: String(m.period || db.period || '').replace('ระยะเวลา ', ''), used: [] });
      push(e.used, who);
    };
    // ราคาจาก "ถูกสุดจาก n รายการ" — ราคาจังหวัดอุดรธานีของรหัสนั้น (หรือจังหวัดที่ถูกสุดถ้าอุดรไม่มี)
    const addFind = (src, who) => {
      const m = FIND_RE.exec(src || ''); if (!m || !db) return false;
      const it = (db.materials || []).find(x => x.code === m[1]); if (!it) return false;
      const pv = (it.provinces || []).find(p => p.name === m[2]);
      const price = pv && has(pv.val) ? pv.val : it.price;
      addC(m[1], who, `${m[2]} (ถูกสุดจาก ${m[3]} รายการ${m[4] ? ' · อุดรไม่มี' : ''})`, price);
      return true;
    };

    // ---------------------------------------------------------------- ค่าแรง ว480
    const wm = {};
    const addW = (code, who) => {
      if (!code || !db) return; const w = db.wage(code); if (!w) return;
      const p = wagePath(w), e = wm[code] || (wm[code] = { code, name: p[p.length - 1] || code, path: p.slice(0, -1).join(' › '), unit: w.unit || '', price: w.price, used: [] });
      push(e.used, who);
    };

    // ---------------------------------------------------------------- วัสดุมวลรวม (ชั้นนอก + มวลรวมซ้อน)
    const cmpOut = [], cmpSeen = {};
    const lineSrc = (c, ln, lk, x, sc, acc) => {
      if (lk && x && x.state === 'ok') {
        if (lk.kind === 'survey') return 'ราคาสืบ · ' + (x.label || '') + (x.n !== undefined ? ` (${x.n} ราย)` : '');
        return x.src;
      }
      if (sc && sc.prices && sc.prices[ln.index] !== undefined && !lk) return 'กรอกเอง';
      if (ln.unitPrice === null || ln.unitPrice === undefined) return acc ? 'ไม่ได้ใส่ราคา (ผู้ใช้ยอมรับ)' : 'ยังไม่มีราคา';
      const it = (db.itemsOf ? db.itemsOf(c.id) : [])[ln.index] || {};
      if (ln.source === 'fixed' && it.surveyed) return 'ราคาสืบที่ใช้ทั้งโครงการ';
      if (ln.source === 'fixed' && it.skipped) return 'ไม่คิดราคา (ผู้ใช้เลือก)';
      if (ln.source === 'commerce' || ln.source === 'commerce-fallback') return CMP_SRC[ln.source] + ' ' + (ln.province || '') + (ln.commodityCode ? ' (' + ln.commodityCode + ')' : '') + (ln.how ? ' · ' + ln.how : '');
      if (ln.source === 'sub-comp') return 'ส่วนผสม ' + (ln.subComp || '');
      return CMP_SRC[ln.source] || String(ln.source || '');
    };
    /** root = ขอบเขตรากของแถว (S.boq.cmpline[แถว]) หรือ null · sc = ขอบเขตของใบนี้ */
    const addComp = (code, root, sc, depth, who, ref) => {
      if (!db) return; const c = db.findComp(code); if (!c) return;
      let res, st = null;
      if (root && sc) {
        st = BoqBindRef().cmpState(ctx, root, sc, depth);
        const pr = BoqBindRef().cmpPrices(ctx, root, sc, depth);
        res = db.compPrice(c.id, { prices: Object.keys(pr).length ? pr : undefined, qty: BoqBindRef().cmpQty(sc), partial: !!(st && st.acc) });
      } else res = db.compPrice(c.id, ref ? { prices: ref.prices, qty: ref.qty, partial: !!ref.partial } : {});
      if (!res) return;
      const lines = [];
      res.lines.forEach(ln => {
        const lk = sc && (sc.lines || {})[ln.index], x = lk ? BoqBindRef().cmpLineInfo(ctx, root, sc, ln, depth) : null;
        const price = x && x.state === 'ok' ? x.price : ln.unitPrice, nm = c.sub + ' ' + ln.name;
        if (lk && lk.kind === 'mat') addC(lk.code, nm);
        else if (!lk && !(sc && sc.prices && sc.prices[ln.index] !== undefined) && (ln.source === 'commerce' || ln.source === 'commerce-fallback')) addC(ln.commodityCode, nm);
        lines.push({ name: ln.name, qty: ln.qty, unit: ln.unit, price, amount: has(price) && ln.qty !== null ? r2(ln.qty * price) : null, src: lineSrc(c, ln, lk, x, sc, !!(st && st.acc)) });
        if (depth < 3) {
          if (lk && lk.kind === 'comp') addComp(lk.code, root, BoqBindRef().scopeOf(root, lk.code), depth + 1, nm);
          else if (!lk && ln.source === 'sub-comp' && ln.subComp) addComp(ln.subComp, null, null, depth + 1, nm);
        }
      });
      const partial = !!res.partial, miss = partial ? res.missing.length : 0;
      const sig = c.sub + '|' + res.price + '|' + lines.map(l => l.price + ':' + l.src).join(';');
      if (cmpSeen[sig]) { push(cmpSeen[sig].used, who); return; }
      const e = { id: c.id, sub: c.sub, title: (c.sub + ' ' + c.name).trim() + (partial ? ` (ราคาไม่ครบ — ผู้ใช้ยอมรับ ขาด ${miss} รายการ)` : ''),
        unit: c.unit || 'หน่วย', total: res.price, used: [who], lines };
      // มวลรวมเดียวกันแต่ผูกบรรทัดต่างกันในแต่ละแถว → แยกใบ ระบุแถวที่ใช้
      if (cmpOut.some(x => x.sub === c.sub)) e.title += ` — ตามรายการ ${who}`;
      cmpSeen[sig] = e; cmpOut.push(e);
    };

    // ---------------------------------------------------------------- ไล่ทุกแถว
    const manual = [], pctRows = [];
    rows.forEach(r => {
      const who = r.name || '', ref = r.ref || r.price_ref || {}, b = B[r.key] || {}, ms = String(r.mat_src || ''), ls = String(r.lab_src || '');
      // ค่าวัสดุ
      if (r.mat_unit !== null && r.mat_unit !== undefined && !r.lab_only) {
        if (ref.kind === 'pct') {
          const nm = (ref.of || []).map(k => byKey[k] ? (byKey[k].name || '(ไม่มีชื่อ)') : null).filter(Boolean);
          pctRows.push({ type: 'ค่าวัสดุ', name: who, unit: r.unit || '', price: r.mat_unit, note: ms.replace(/ \([^()]*\)$/, '') + (nm.length ? '\nจากรายการ: ' + nm.join(', ') : '') });
        } else if (b.mat && b.mat.kind === 'manual') manual.push({ type: 'ค่าวัสดุ', name: who, unit: r.unit || '', price: r.mat_unit, note: String(b.mat.note || '').trim() });
        else if (/^วัสดุมวลรวม/.test(ms) && ref.kind === 'comp') {
          const sc = C[r.key] && C[r.key].code === ref.code ? C[r.key] : null;
          addComp(ref.code, sc, sc, 0, who, sc ? null : ref);
        } else if (/^พาณิชย์/.test(ms)) {
          if (!(ref.kind === 'mat_find' && addFind(ms, who))) addC(ref.code, who);
        }
        // ราคาสืบ: อยู่ในส่วนราคาสืบทั้งโครงการอยู่แล้ว
      }
      // ค่าแรง
      if (r.lab_unit !== null && r.lab_unit !== undefined) {
        if (ref.kind === 'pct' || has(ref.lab_pct)) pctRows.push({ type: 'ค่าแรง', name: who, unit: r.unit || '', price: r.lab_unit, note: ls });
        else if (b.lab && b.lab.kind === 'manual') manual.push({ type: 'ค่าแรง', name: who, unit: r.unit || '', price: r.lab_unit, note: String(b.lab.note || '').trim() });
        else if (/^ว480/.test(ls)) {
          if (Array.isArray(ref.wages) && ref.wages.length) ref.wages.forEach(w => {
            const x = db && db.wage(w.code);
            addW(w.code, w.per === 'area' && x ? `${who} — ${f2(x.price)} × ${ref.area} ตร.ม./${r.unit || 'หน่วย'}` : who);
          });
          else addW(ref.wage_code || (ref.kind === 'wage' ? ref.code : null), who);
        }
      }
    });
    manual.sort((a, c) => (a.type === c.type ? 0 : a.type === 'ค่าแรง' ? -1 : 1));

    // ---------------------------------------------------------------- ราคาสืบทุกรายการในโครงการ (มีอย่างน้อย 1 ราย) เรียงตามชื่อ = ลำดับเลขภาพ
    const surveys = Object.values(o.surveys || {}).filter(it => it && (it.quotes || []).length)
      .sort((a, c) => String(a.name || '').localeCompare(String(c.name || ''), 'th')).map(it => {
        const sm = SV.summary(it), k = svKey(it);
        return { key: k, name: it.name || '', unit: it.unit || '', n: sm.n, need: SV.MIN_Q, price: sm.price,
          quotes: sm.list.map(x => ({ qid: x.q.id, shop: x.q.shop || '', contact: [SV.CHANNEL[x.q.channel] || '', x.q.contact || ''].filter(Boolean).join(' · '), brand: x.q.brand || '', note: x.q.note || '',
            date: x.q.date || '', price: x.q.price, factor: x.q.factor || 1, vat: !!x.q.vat, up: x.up, best: !!(sm.best && x.q.id === sm.best.id),
            imgRef: o.refTxt ? (o.refTxt(k, x.q.id) || '') : '' })) };
      });
    surveys.forEach(v => v.quotes.forEach(q => { if (!q.imgRef) delete q.imgRef; }));

    return { commerce: Object.values(cm), wagesUsed: Object.values(wm), manual, pctRows, comps: cmpOut, surveys, materials: [], wages: [] };
  }
  // lib/boqbind.js (เว็บ = window.BoqBind · node = require)
  function BoqBindRef() { if (typeof BoqBind !== 'undefined') return BoqBind; return require('./boqbind.js'); }   // eslint-disable-line no-undef
  return { build, wagePath, FIND_RE };
});
