/*! dsggroup.js — จัดกลุ่มชิ้นส่วนที่ออกแบบรายชิ้นแล้วเป็น "ชนิด" (C1 C2 PD1 F1 …) — M4b 28 พ.ย. 2569 (Earth)
 * หลัก: ออกแบบแต่ละชิ้นจากแรงของตัวเองก่อน (หน้าออกแบบ) แล้วค่อยจัดกลุ่ม
 *  - ชิ้นที่มีชื่อชนิดในแบบ (mark) และเลือก byMark → กลุ่มตามชื่อในแบบ
 *  - ชิ้นที่ไม่มีชื่อ → กลุ่มตามหมวด + ขนาด (ล็อกขนาดตามโมเดล) แล้วแบ่งตามปริมาณเหล็กไม่เกิน maxTypes ชนิดต่อกลุ่มขนาด
 *    แบ่งให้เหล็กเผื่อรวม (เหล็กของชนิด − เหล็กที่ชิ้นต้องการ) น้อยที่สุด
 *  - เหล็กของชนิด = แบบของชิ้นในกลุ่มที่เหล็กน้อยสุดซึ่งผ่านทุกชิ้น (ตรวจด้วยแรงของแต่ละชิ้น)
 *    ไม่มีแบบของชิ้นใดผ่านทุกชิ้น (เช่น ชิ้นหนึ่งต้องการเหล็กบนมาก อีกชิ้นต้องการปลอกถี่) → ลองแบบรวม opt.merge (ค่ามากสุดรายส่วน)
 *    ยังไม่ผ่าน → ใช้ตัวที่เหล็กมากสุด + รายชื่อชิ้นที่ไม่ผ่าน
 * ใช้ได้ทั้งเว็บ (window.DsgGroup) และ node (require)
 */
(function (root) {
  'use strict';
  /**
   * items: [{id, cat, size, mark, score, cand}] — cat 'C' | 'PD' | 'F' …, size ข้อความขนาด, score ปริมาณเหล็ก (ใช้เรียง), cand แบบของชิ้นเอง
   * check(id, cand) → {ok, ratio}  ตรวจชิ้น id ด้วยแบบ cand (แรงของชิ้น id เอง)
   * opt: {maxTypes = 3, byMark = true, assign: {id: ชื่อชนิด} (ย้ายเอง), key: cand → ข้อความ (แยกแบบซ้ำ),
   *       merge: [cand] → cand รวมรายส่วน, score: (cand, items) → ปริมาณเหล็ก (ของแบบรวม)}
   * คืน [{name, cat, size, ids, cand, gov, score, fails, fromMark, util: {id: ratio}, sizes}]
   */
  function group(items, check, opt = {}) {
    const maxT = Math.max(1, +opt.maxTypes || 3), byMark = opt.byMark !== false, assign = opt.assign || {};
    const key = opt.key || (c => JSON.stringify(c));
    const buckets = new Map(), put = (k, it, meta) => { if (!buckets.has(k)) buckets.set(k, Object.assign({ items: [] }, meta)); buckets.get(k).items.push(it); };
    for (const it of items) {
      const forced = assign[it.id];
      if (forced) put('A|' + it.cat + '|' + forced, it, { cat: it.cat, name: forced, fixed: true });
      else if (byMark && it.mark) put('M|' + it.cat + '|' + it.mark, it, { cat: it.cat, name: it.mark, fixed: true, fromMark: true });
      else put('S|' + it.cat + '|' + it.size, it, { cat: it.cat, size: it.size, fixed: false });
    }
    const out = [];
    const finish = (b, list, name) => {
      const sorted = list.slice().sort((a, c) => a.score - c.score);
      const seen = new Set(), cands = [];
      for (const it of sorted) { const k = key(it.cand); if (!seen.has(k)) { seen.add(k); cands.push(it); } }
      let pick = null, res = null;
      for (const c of cands) {
        const r = list.map(it => [it.id, check(it.id, c.cand)]);
        if (r.every(x => x[1].ok)) { pick = c; res = r; break; }
      }
      if (!pick && opt.merge && cands.length > 1) {
        const mc = opt.merge(cands.map(c => c.cand)), r = list.map(it => [it.id, check(it.id, mc)]);
        if (r.every(x => x[1].ok)) {
          const gov = r.reduce((a, x) => (x[1].ratio > a[1].ratio ? x : a))[0];
          pick = { id: gov, cand: mc, score: opt.score ? opt.score(mc, list) : Math.max(...list.map(it => it.score)), merged: true }; res = r;
        }
      }
      if (!pick) { pick = sorted[sorted.length - 1]; res = list.map(it => [it.id, check(it.id, pick.cand)]); }
      const sizes = [...new Set(list.map(it => it.size))];
      out.push({ name, cat: b.cat, size: sizes.join(' / '), sizes, ids: sorted.map(it => it.id), cand: pick.cand, gov: pick.id, score: pick.score,
        fails: res.filter(x => !x[1].ok).map(x => x[0]), util: Object.fromEntries(res.map(x => [x[0], x[1].ratio])), fromMark: !!b.fromMark, fixed: b.fixed, merged: !!pick.merged });
    };
    for (const b of buckets.values()) {
      if (b.fixed) { finish(b, b.items, b.name); continue; }
      for (const seg of split(b.items, maxT)) finish(b, seg, null);
    }
    // ตั้งชื่ออัตโนมัติ: คำนำหน้าตามหมวด เลขต่อจากชื่อที่มีอยู่แล้ว เรียงตามขนาดแล้วตามเหล็ก
    const pre = opt.prefix || {};
    const used = new Set(out.filter(g => g.name).map(g => g.name));
    const nextNo = {};
    for (const g of out.filter(x => !x.name).sort((a, c) => (a.cat < c.cat ? -1 : a.cat > c.cat ? 1 : 0) || sizeCmp(a.size, c.size) || a.score - c.score)) {
      const p = pre[g.cat] || g.cat;
      let n = nextNo[p] || 1, nm;
      do { nm = p + n; n++; } while (used.has(nm));
      nextNo[p] = n; used.add(nm); g.name = nm;
    }
    return out.sort((a, c) => (a.cat < c.cat ? -1 : a.cat > c.cat ? 1 : 0) || natCmp(a.name, c.name));
  }
  /** แบ่งรายการ (เรียงตาม score) เป็น ≤ k ช่วงติดกัน ให้ Σ(score สูงสุดของช่วง − score ชิ้น) น้อยสุด · ตัดได้เฉพาะจุดที่ score เปลี่ยน */
  function split(items, k) {
    const a = items.slice().sort((x, y) => x.score - y.score), n = a.length;
    if (!n) return [];
    const cut = [0]; for (let i = 1; i < n; i++) if (a[i].score > a[i - 1].score + 1e-9) cut.push(i); cut.push(n);
    const m = cut.length - 1;   // จำนวนระดับเหล็กที่ต่างกัน
    if (m <= k) return cut.slice(0, -1).map((s, i) => a.slice(s, cut[i + 1]));
    const pre = [0]; for (const it of a) pre.push(pre[pre.length - 1] + it.score);
    const cost = (i, j) => { const s = cut[i], e = cut[j]; return a[e - 1].score * (e - s) - (pre[e] - pre[s]); };   // ช่วงระดับ i..j-1
    const INF = 1e300, dp = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(INF)), bk = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(-1));
    dp[0][0] = 0;
    for (let t = 1; t <= k; t++) for (let j = 1; j <= m; j++) for (let i = t - 1; i < j; i++) {
      const v = dp[t - 1][i] + cost(i, j); if (v < dp[t][j] - 1e-12) { dp[t][j] = v; bk[t][j] = i; }
    }
    const segs = []; let j = m;
    for (let t = k; t >= 1; t--) { const i = bk[t][j]; segs.unshift(a.slice(cut[i], cut[j])); j = i; }
    return segs;
  }
  const natCmp = (a, b) => String(a).localeCompare(String(b), 'th', { numeric: true });
  const sizeCmp = (a, b) => natCmp(a, b);
  const api = { group, split };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DsgGroup = api;
})(typeof window !== 'undefined' ? window : this);
