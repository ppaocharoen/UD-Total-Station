/* UD Diff — เทียบโมเดล .bm.json สองรุ่น (ชิ้นส่วนที่เพิ่ม/ลบ/แก้) และเทียบรายการ BOQ ที่คิดราคาแล้ว
 * BmDiff.elements(oldM, newM) → { added:[{id,set}], removed:[...], changed:[{id,set,fields:[...]}] }
 * BmDiff.rows(oldPriced, newPriced) → [{key,name,unit,q0,q1,dq,t0,t1,dt,status:'added'|'removed'|'changed'|'same'}]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BmDiff = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SETS = { members: 'ชิ้นส่วน', supports: 'ฐานราก', slabs: 'พื้น', walls: 'ผนัง', openings: 'ช่องเปิด', roofs: 'หลังคา',
    finishes: 'งานผิว', nodes: 'จุดต่อ', sections: 'หน้าตัด', materials: 'วัสดุ' };
  const IGNORE = new Set(['status', 'src', 'note', 'field_status']);
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);

  function elements(a, b) {
    const out = { added: [], removed: [], changed: [] };
    for (const set of Object.keys(SETS)) {
      const A = Object.fromEntries((a[set] || []).map(e => [e.id, e])), B = Object.fromEntries((b[set] || []).map(e => [e.id, e]));
      for (const id in B) if (!A[id]) out.added.push({ id, set });
      for (const id in A) if (!B[id]) out.removed.push({ id, set });
      for (const id in B) {
        if (!A[id]) continue;
        const keys = new Set([...Object.keys(A[id]), ...Object.keys(B[id])]);
        const fields = [...keys].filter(k => !IGNORE.has(k) && canon(A[id][k]) !== canon(B[id][k]));
        if (fields.length) out.changed.push({ id, set, fields, before: Object.fromEntries(fields.map(f => [f, A[id][f]])), after: Object.fromEntries(fields.map(f => [f, B[id][f]])) });
      }
    }
    // จุดต่อที่ย้าย → ชิ้นส่วนที่ใช้จุดนั้นถือว่าเปลี่ยนด้วย
    const moved = new Set(out.changed.filter(c => c.set === 'nodes').map(c => c.id));
    if (moved.size) (b.members || []).forEach(x => {
      if ((moved.has(x.i) || moved.has(x.j)) && !out.changed.some(c => c.id === x.id) && !out.added.some(c => c.id === x.id))
        out.changed.push({ id: x.id, set: 'members', fields: ['(จุดต่อย้าย)'], before: {}, after: {} });
    });
    // หน้าตัด/วัสดุที่แก้ → ชิ้นส่วนที่ใช้
    const secs = new Set(out.changed.filter(c => c.set === 'sections').map(c => c.id));
    if (secs.size) (b.members || []).forEach(x => {
      if (secs.has(x.section) && !out.changed.some(c => c.id === x.id)) out.changed.push({ id: x.id, set: 'members', fields: ['(หน้าตัดเปลี่ยน)'], before: {}, after: {} });
    });
    return out;
  }

  function rows(p0, p1) {
    const A = Object.fromEntries(p0.map(r => [r.key, r])), B = Object.fromEntries(p1.map(r => [r.key, r]));
    const keys = [...new Set([...p1.map(r => r.key), ...p0.map(r => r.key)])];
    return keys.map(k => {
      const a = A[k], b = B[k], r = b || a;
      const q0 = a ? a.qty : 0, q1 = b ? b.qty : 0, t0 = a ? a.total : 0, t1 = b ? b.total : 0;
      return { key: k, name: r.name, unit: r.unit, group_code: r.group_code, q0, q1, dq: r2(q1 - q0), t0, t1, dt: r2(t1 - t0),
        status: !a ? 'added' : !b ? 'removed' : (Math.abs(q1 - q0) > 1e-9 || Math.abs(t1 - t0) > 0.004) ? 'changed' : 'same',
        from: [...new Set([...(a && a.from) || [], ...(b && b.from) || []])] };
    });
  }

  return { elements, rows, SETS };
});
