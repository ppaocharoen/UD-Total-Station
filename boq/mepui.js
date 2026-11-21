/* UD Total Station — เปลี่ยนชนิดท่อ/สายทั้งระบบ (ก้อน 6e · v7.6) — ใช้ lib/mepsel.js
 * เลือกได้ 2 ที่: ปุ่ม "ชนิดท่อ/สาย…" ในหน้า ปร.1 และกดท่อ/ท่อร้อยสายใน 3D → "เปลี่ยนทั้งระบบ"
 * การเลือกเก็บใน .boq.json `mepsel` { cw, soil, waste, vent, conduit, wire } ('' = ตามแบบ)
 * BOQ: MepSel.apply หลังแยกแถวตามวัสดุ (matRows) ก่อนผูกราคา · แถวที่ผูกราคา/แก้ปริมาณเองไว้กับกุญแจเดิม → เตือนให้ผูก/แก้ใหม่
 */
'use strict';

const mepSel = () => (S.boq.mepsel = S.boq.mepsel || {});
/** แถว BOQ หลังเปลี่ยนชนิดท่อ/สาย (เรียกใน rows() ของ app.js) */
function mepRows(items) {
  S.mepRes = null;
  if (!window.MepSel || !S.boq) return items;
  try { const r = MepSel.apply(items, mepSel()); S.mepRes = r; return r.items; } catch (e) { console.warn('เปลี่ยนชนิดท่อ/สายไม่สำเร็จ', e); return items; }
}
/** สีท่อ/ท่อร้อยสายใน 3D ตามชนิดที่เลือก */
function mepLooks() {
  const s = mepSel(), L = {};
  MepSel.SYSTEMS.forEach(x => { if (s[x.k]) { const c = MepSel.colorOf(x.k, s[x.k]); if (c !== null) L[x.k] = c; } });
  return L;
}
function mepRefresh() {
  if (S.viewer && S.viewer.setMepLooks) S.viewer.setMepLooks(mepLooks());
  autosave(); renderAll();
}
/** ข้อความเตือนใน ปร.1: ถอดปริมาณใหม่ · แถวที่ผูกเอง/แก้ปริมาณเองกับกุญแจเดิม */
function mepAlertHtml() {
  const r = S.mepRes; if (!r) return '';
  const B = S.boq.bind || {}, Q = S.boq.qty_ov || {}, mv = r.moved || {};
  const stale = Object.keys(mv).filter(k => B[k] || Q[k]);
  let h = '';
  if (r.retake.length) h += ` <span class="warnline no-print">สายไฟ ${r.retake.length} แถวสลับเป็นสายหลายแกนไม่ได้ — ไฟล์ปริมาณถอดด้วยตัวถอดรุ่นเก่า (ไม่มีข้อมูลความยาวรายวงจร) ให้ถอดปริมาณใหม่</span>`;
  if (stale.length) h += ` <span class="warnline no-print" title="${esc(stale.map(k => k + ' → ' + mv[k]).join('\n'))}">เปลี่ยนชนิดท่อ/สายแล้ว: ${stale.length} แถวที่ผูกราคา/แก้ปริมาณเองไว้กับชื่อเดิม — ผูก/แก้ใหม่ที่แถวใหม่ <button class="btn small" data-mep-clr="1" title="ล้างการผูก/ปริมาณที่แก้เองของแถวชื่อเดิม">ล้างของเดิม</button></span>`;
  return h;
}
function mepAlertBind(box) {
  const b = box && box.querySelector('[data-mep-clr]'); if (!b) return;
  b.onclick = () => { const mv = (S.mepRes || {}).moved || {}; Object.keys(mv).forEach(k => { if (S.boq.bind) delete S.boq.bind[k]; if (S.boq.qty_ov) delete S.boq.qty_ov[k]; }); mepRefresh(); toast('ล้างการผูก/ปริมาณที่แก้เองของแถวชื่อเดิมแล้ว'); };
}

// ------------------------------------------------------------------ หน้าต่างเลือก
function mepModal() {
  let m = $('#mep-modal'); if (m) return m;
  m = document.createElement('div'); m.id = 'mep-modal'; m.className = 'modal';
  m.innerHTML = '<div class="modal-box glass mt-box"><div class="side-top"><h2 style="margin:0">ชนิดท่อ/สาย ทั้งระบบ</h2><button class="btn small" data-mep-x="1">×</button></div><div id="mep-body"></div></div>';
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.dataset.mepX) m.classList.remove('on'); });
  return m;
}
function mepSysRowHtml(x, cur) {
  const s = mepSel(), now = cur[x.k] || [];
  if (!now.length && !s[x.k]) return '';
  return `<div class="mte-row" style="align-items:center"><label class="fld" style="flex:1">${esc(x.th)}<select data-mep="${x.k}">
    <option value="">ตามแบบ (${esc(now.join(', ') || '-')})</option>${x.opts.map(o => `<option value="${esc(o)}" ${s[x.k] === o ? 'selected' : ''}>${esc(MepSel.OPT_TH[o] || o)}</option>`).join('')}</select></label></div>`;
}
function mepOpen(only) {
  if (!S.model) return toast('เปิดโมเดลก่อน');
  const m = mepModal(), items = (S.model.quantities || {}).items || [], cur = MepSel.current(items);
  const xs = MepSel.SYSTEMS.filter(x => !only || only.includes(x.k));
  const rows = xs.map(x => mepSysRowHtml(x, cur)).join('');
  $('#mep-body', m).innerHTML = (rows || '<div class="hint">โมเดลนี้ไม่มีท่อ/สายที่เปลี่ยนชนิดได้</div>') +
    `<div class="hint" style="margin-top:6px">เปลี่ยนทุกเส้นในระบบ (ขนาดตามโมเดล) · แถว ปร.1 ย้ายไปรายการชนิดใหม่ ปริมาณเท่ากับถอดจากโมเดลที่แก้ชนิด · แถว % ข้อต่อ/เหล็กยึด/ทดสอบ เปลี่ยนตามชนิดท่อ ·
    PP-R เรียกขนาดเป็น มม. (1/2"→20 · 3/4"→25 · 1"→32 · 1¼"→40 · 1½"→50 · 2"→63) · VCT/NYY = สายหลายแกน 1 เส้นต่อวงจร ยาวเท่าท่อ · ค่าแรงตาม ว480 ของชนิดใหม่</div>
    <div class="btn-row" style="margin-top:8px"><button class="btn primary" data-mep-ok="1">ใช้</button><button class="btn" data-mep-reset="1">ตามแบบทั้งหมด</button></div>`;
  m.querySelector('[data-mep-ok]').onclick = () => { m.querySelectorAll('[data-mep]').forEach(el => { const k = el.dataset.mep; if (el.value) mepSel()[k] = el.value; else delete mepSel()[k]; }); m.classList.remove('on'); mepRefresh(); mepAfterPick(); };
  m.querySelector('[data-mep-reset]').onclick = () => { xs.forEach(x => delete mepSel()[x.k]); m.classList.remove('on'); mepRefresh(); mepAfterPick(); };
  m.classList.add('on');
}
function mepAfterPick() {
  const box = $('#pick-info'); if (!box || !box.classList.contains('on') || !S.mepPickId || typeof showPick !== 'function') return;
  const v = S.viewer, ms = v && v.byId[S.mepPickId]; showPick(ms && ms[0] ? ms[0].userData : { id: S.mepPickId }, null);
}

// ------------------------------------------------------------------ กล่องชิ้นใน 3D
/** ระบบของชิ้นท่อ/ท่อร้อยสายใน 3D → ['cw'] | ['conduit', 'wire'] | null */
function mepSysOf(id) {
  if (!S.model || !id) return null;
  const pl = ((S.model.mep || {}).plumbing) || {}, el = ((S.model.mep || {}).electrical) || {};
  const p = (pl.pipes || []).find(x => x.id === id);
  const rt = (((S.model.quantities || {}).routes) || []).find(x => x.id === id);
  const sys = p ? p.system : rt && rt.kind === 'pipe' ? rt.system : null;
  if (sys) return MepSel.SYSTEMS.some(x => x.k === sys) ? [sys] : null;
  if (id === 'SERVICE' || (el.conduits || []).some(x => x.id === id) || (rt && rt.kind === 'conduit')) return ['conduit', 'wire'];
  return null;
}
function mepPickHtml(id) {
  if (!window.MepSel) return '';
  const ks = mepSysOf(id); if (!ks) return '';
  S.mepPickId = id;
  const s = mepSel(), cur = MepSel.current((S.model.quantities || {}).items || []);
  const line = k => { const x = MepSel.SYSTEMS.find(y => y.k === k); return `<div class="hint">${esc(x.th)}: <b>${esc(s[k] ? (MepSel.OPT_TH[s[k]] || s[k]) : 'ตามแบบ')}</b>${s[k] ? ` · ตามแบบ ${esc((cur[k] || []).join(', '))}` : ` (${esc((cur[k] || []).join(', ') || '-')})`}</div>`; };
  return `<div class="pk-sec mt-pk"><div class="pk-lbl">ชนิดท่อ/สาย (ทั้งระบบ)</div>${ks.map(line).join('')}
    <div class="btn-row"><button class="btn small primary" data-mep-open="${ks.join(',')}">เปลี่ยนทั้งระบบ…</button>${ks.some(k => s[k]) ? '<button class="btn small" data-mep-rev="1">คืนตามแบบ</button>' : ''}</div></div>`;
}
function mepPickBind(box) {
  const o = box.querySelector('[data-mep-open]'); if (o) o.onclick = () => mepOpen(o.dataset.mepOpen.split(','));
  const r = box.querySelector('[data-mep-rev]'); if (r) r.onclick = () => { (mepSysOf(S.mepPickId) || []).forEach(k => delete mepSel()[k]); mepRefresh(); mepAfterPick(); };
}
