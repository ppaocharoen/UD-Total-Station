/* UD Total Station — คลังวัสดุ + เปลี่ยนวัสดุงานผิวใน 3D (M2b ก้อน 6 · Earth 21 พ.ย. 2569)
 * คลังกลาง: Firestore `materials` (lib/matfs.js) — ผู้ที่ได้รับอนุมัติอ่าน/สร้างได้ · แก้/ลบ = ผู้สร้างหรือผู้ดูแลระบบ
 * โครงการ (.boq.json): matsel = { piece: {id งานผิว|'@ground': matId|''}, type: {typeKey: matId} } · mats = { matId: สำเนาวัสดุ }
 *   สำเนาใช้คิด BOQ/วาด 3D เสมอ (ไม่ล็อกอิน/วัสดุถูกลบจากคลัง ก็ยังเปิดได้) · คลังมีรุ่นใหม่กว่า → อัปเดตสำเนาตอนโหลดคลัง
 *   วัสดุ "เฉพาะโครงการนี้" (id P-…) อยู่ในสำเนาอย่างเดียว ส่งขึ้นคลังกลางทีหลังได้
 * BOQ: MatLib.apply แยกแถวก่อนผูกราคา (rows() ใน app.js) — ชิ้นที่เปลี่ยนย้ายไปแถวรายการใหม่ ปริมาณตรง takeoff.py
 * ป้าย "เปลี่ยนวัสดุ" ใน ปร.1 แสดงบนจอเท่านั้น · ราคาแนะนำของวัสดุ = คำแนะนำ ไม่ทับการผูกอัตโนมัติ
 * 6c แผ่นมุงหลังคา: ชิ้น = หลังคา (model.roofs) วัสดุ cls 'roof' เปลี่ยนได้เฉพาะชนิดเดียวกัน · ครอบหลังคา/เชิงชายเป็นชิ้นแยก (วัสดุกรุชนิด cap/fascia)
 * 6b ผนังทาสี ↔ ผนังกรุ: ด้านภายใน/ภายนอกหาเองจากคำในรายการ/ผนังฉาบด้านเดียว — ไม่รู้ → ถามในหน้าต่าง เก็บใน matsel.side {id: 'int'|'ext'}
 */
'use strict';
const MT = { lib: [], loaded: false, loading: false, err: '', auth: { ready: false }, pick: null, scope: 'piece', q: '', ed: null, edFor: null };
const mtSel = () => { const b = S.boq; b.matsel = b.matsel && typeof b.matsel === 'object' ? b.matsel : {}; b.matsel.piece = b.matsel.piece || {}; b.matsel.type = b.matsel.type || {}; b.matsel.side = b.matsel.side || {}; return b.matsel; };
const mtItems = () => (S.model && S.model.quantities && S.model.quantities.items) || [];
/** 6b: ชิ้นที่สลับ ทาสี ↔ กรุ แต่ยังไม่รู้ด้าน */
const mtNeed = () => S.model && S.boq ? MatLib.needSide(S.model, mtSel(), mtUseMats(), mtItems()) : [];
const mtSnaps = () => (S.boq.mats = S.boq.mats && typeof S.boq.mats === 'object' ? S.boq.mats : {});
const mtFin = id => (S.model ? MatLib.pieces(S.model) : []).find(f => f.id === id) || null;   // งานผิว + หลังคา (6c)
const mtApproved = () => !!(MT.auth.user && MT.auth.access && MT.auth.access.status === 'approved');
const mtAdmin = () => mtApproved() && MT.auth.access.role === 'admin';
const mtCanEdit = m => !!m && !m.builtin && (String(m.id).startsWith('P-') || (mtApproved() && (mtAdmin() || m.by === MT.auth.user.uid)));
/** วัสดุทั้งหมดที่ใช้ได้: ค่าเริ่ม + คลังกลาง + วัสดุเฉพาะโครงการ/สำเนาที่ไม่อยู่ในคลังแล้ว */
function mtAll() {
  const out = Object.assign({}, MatLib.BUILTIN), sn = S.boq ? mtSnaps() : {};
  MT.lib.forEach(m => { out[m.id] = Object.assign({}, m, { src: 'lib' }); });
  Object.values(sn).forEach(m => { if (!out[m.id]) out[m.id] = Object.assign({}, m, { src: String(m.id).startsWith('P-') ? 'proj' : 'gone' }); });
  return out;
}
/** วัสดุที่ใช้คิด/วาดจริง = สำเนาในโครงการ (+ ค่าเริ่ม) */
const mtUseMats = () => Object.assign({}, MatLib.BUILTIN, S.boq ? mtSnaps() : {});
/** rows() ใน app.js: แยกแถวตามวัสดุที่เปลี่ยน (ก่อนผูกราคา) */
function matRows(items) {
  if (!S.model || !S.boq || !S.boq.matsel) return items;
  try { return MatLib.apply(items, S.model, S.boq.matsel, mtUseMats()); } catch (e) { console.warn('แยกแถวตามวัสดุไม่สำเร็จ', e); return items; }
}
function mtLooks() {
  if (!S.model || !S.boq) return {};
  const eff = MatLib.effective(S.model, mtSel(), mtUseMats()), L = {};
  Object.entries(eff).forEach(([id, m]) => { L[id] = m.look; });
  return L;
}
/** หลังเปลี่ยนการเลือก: 3D + BOQ + บันทึก */
function mtRefresh(noRender) {
  if (S.viewer && S.viewer.setLooks) S.viewer.setLooks(mtLooks());
  if (!noRender) { autosave(); renderAll(); }
}
/** เปิดโมเดล/เปิด .boq.json (เรียกจาก app.js ก่อน viewer.load) */
function matOnLoad() {
  if (!S.boq) return; mtSel(); mtSnaps();
  if (S.viewer) S.viewer.looks = mtLooks();
  mtSyncSnaps();
}

// ------------------------------------------------------------------ คลังกลาง
async function mtLoad(force) {
  if (!window.UDMatFS || !mtApproved() || MT.loading || (MT.loaded && !force)) return;
  MT.loading = true; MT.err = '';
  try { MT.lib = (await UDMatFS.list()).map(m => Object.assign(MatLib.clean(m), { id: m.id })); MT.loaded = true; }
  catch (e) { MT.err = e.message; } finally { MT.loading = false; }
  mtSyncSnaps(); mtRender();
}
/** สำเนาในโครงการที่คลังมีรุ่นใหม่กว่า → อัปเดต (แจ้งจำนวน) */
function mtSyncSnaps() {
  if (!MT.loaded || !S.boq) return;
  const sn = mtSnaps(); let n = 0;
  MT.lib.forEach(m => { const o = sn[m.id]; if (o && (+m.at || 0) > (+o.at || 0)) { sn[m.id] = MatLib.clean(m); sn[m.id].id = m.id; n++; } });
  if (n) { toast(`อัปเดตวัสดุจากคลังกลาง ${n} รายการ (มีการแก้ไขในคลัง)`); mtRefresh(); }
}
function mtAuthHook() {
  if (!window.UDAuth) return;
  UDAuth.on(st => { const was = MT.auth.user && MT.auth.user.uid; MT.auth = st; if (mtApproved() && (!MT.loaded || was !== st.user.uid)) mtLoad(true); else mtRender(); });
}
if (window.UDAuth) mtAuthHook(); else window.addEventListener('udauth-loaded', mtAuthHook);
window.addEventListener('udmatfs', () => mtLoad());

// ------------------------------------------------------------------ กล่องข้อมูลชิ้น (showPick)
function mtCur(id) {
  const all = mtUseMats(), eff = S.model ? MatLib.effective(S.model, mtSel(), all) : {};
  return eff[id] || null;
}
function mtSameType(f) { const k = MatLib.typeKey(f); return (S.model ? MatLib.pieces(S.model) : []).filter(x => MatLib.typeKey(x) === k && MatLib.pieceClass(x)); }
/** 6c: ข้อความฉนวนของวัสดุหลังคา */
function mtInsTxt(m, f) {
  const i = (m && m.ins) || { mode: 'keep' };
  if (i.mode === 'none') return 'ไม่มีฉนวน';
  if (i.mode === 'set') return 'ฉนวน ' + (i.desc || '');
  return f && f.insulation ? 'ฉนวนตามแบบ: ' + f.insulation : 'ฉนวนตามแบบ (ไม่มี)';
}
function mtSwatchHtml(lk, w, h) { return `<canvas class="mt-sw" width="${w || 44}" height="${h || 30}" data-look="${esc(JSON.stringify(lk || {}))}"></canvas>`; }
function mtPaintSwatches(root) { (root || document).querySelectorAll('canvas.mt-sw[data-look]').forEach(c => { try { MatLib.swatch(c, JSON.parse(c.dataset.look)); } catch (e) { /* */ } }); }
function matPickHtml(id) {
  if (!S.model || !window.MatLib) return '';
  const g = id === MatLib.GROUND, f = g ? null : mtFin(id), pc = f && MatLib.pieceClass(f);
  if (!g && !pc) return '';
  const cur = mtCur(id), sel = mtSel(), tk = f && MatLib.typeKey(f);
  const lk = cur ? cur.look : g ? MatLib.BUILTIN['B-soil'].look : null;
  let h = `<div class="pk-sec mt-pk"><div class="pk-lbl">วัสดุ${g ? 'ผิวดิน' : ''}</div><div class="mt-cur">${lk ? mtSwatchHtml(lk) : ''}<div>`;
  if (g) h += `<b>${esc(cur ? cur.name : 'ดิน (ค่าเริ่ม)')}</b><div class="hint">ผิวดินรอบอาคารที่ระดับ GL — แสดงใน 3D เท่านั้น ยังไม่มีแถว BOQ</div>`;
  else if (cur) h += `<b>${esc(cur.name)}</b>${cur.spec && cur.spec !== MatLib.specOf(f) ? `<div class="hint">รายการ BOQ: ${esc(cur.spec)}</div>` : ''}${pc === 'roof' ? `<div class="hint">${esc(mtInsTxt(cur, f))}</div>` : ''}<div class="hint">ตามแบบ: ${esc(MatLib.specOf(f))}${sel.piece[id] === undefined && sel.type[tk] ? ' · เปลี่ยนทั้งชนิด' : ''}</div>`;
  else h += `<b>ตามแบบ</b><div class="hint">${esc(MatLib.specOf(f))}${pc === 'roof' && f.insulation ? ' · ฉนวน ' + esc(f.insulation) : ''}</div>`;
  h += `</div></div><div class="btn-row"><button class="btn small primary" data-mt="open">เปลี่ยนวัสดุ…</button>`;
  if (cur && !g) h += `<button class="btn small" data-mt="revert" title="ชิ้นนี้กลับไปใช้วัสดุตามแบบ">คืนตามแบบ</button>`;
  if (g && cur) h += `<button class="btn small" data-mt="revert">คืนเป็นดิน</button>`;
  if (!g && sel.type[tk]) h += `<button class="btn small" data-mt="untype" title="ยกเลิกการเปลี่ยนทุกชิ้นชนิดนี้">ยกเลิกทั้งชนิด (${mtSameType(f).length} ชิ้น)</button>`;
  h += '</div>';
  const sm = !g && cur && MatLib.swapMode(f, cur);
  if (sm) {
    const sd = MatLib.sideOf(f, cur, S.model, sel, mtItems()), chosen = sel.side[id] && sd === sel.side[id];
    const what = sm === 'p2c' ? 'ทาสี → กรุ: หักฉาบ/ทาสีของผนังด้าน' : 'กรุ → ทาสี: เพิ่มฉาบ/ทาสีของผนังด้าน';
    if (!sd) h += `<div class="hint" style="color:var(--red)">ยังไม่รู้ว่าเป็นผนังด้านภายในหรือภายนอก — BOQ ยังไม่แยกแถว</div>`;
    else h += `<div class="hint">${what}<b>${MatLib.SIDE_TH[sd]}</b>${chosen ? ' (เลือกเอง)' : ''}</div>`;
    if (!sd || chosen) h += `<div class="btn-row"><span class="hint">ด้าน:</span><button class="btn small ${sd === 'int' ? 'primary' : ''}" data-mt="side-int">ภายใน</button><button class="btn small ${sd === 'ext' ? 'primary' : ''}" data-mt="side-ext">ภายนอก</button></div>`;
  } else if (pc === 'roof') h += `<div class="hint">แผ่นมุงหลังคา: เปลี่ยนรายการ/สี/ความหนา/ฉนวนได้ พื้นที่เท่าเดิม · เปลี่ยนได้เฉพาะ${esc(MatLib.COVER_TH[f.cover] || f.cover)}ด้วยกัน (ต่างชนิดต้องแก้โมเดล — โครงหลังคาเปลี่ยน) · ครอบหลังคา/เชิงชายกดเปลี่ยนแยกที่ชิ้นนั้น</div>`;
  else if (pc === 'paint') h += '<div class="hint">ผนังทาสี: วัสดุทาสี = เปลี่ยนสีใน 3D (ไม่กระทบ BOQ) · วัสดุกรุ = ย้ายปริมาณจากฉาบ/ทาสีของผนังไปแถวกรุ</div>';
  return h + '</div>';
}
function matPickBind(box, id) {
  mtPaintSwatches(box);
  box.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => {
    const a = b.dataset.mt, sel = mtSel(), f = mtFin(id);
    if (a === 'open') return mtOpen(id);
    if (a === 'side-int' || a === 'side-ext') { sel.side[id] = a.slice(5); return mtAfterChange(id); }
    if (a === 'revert') { if (id !== MatLib.GROUND && f && sel.type[MatLib.typeKey(f)]) sel.piece[id] = ''; else delete sel.piece[id]; }
    if (a === 'untype' && f) { const k = MatLib.typeKey(f); delete sel.type[k]; mtSameType(f).forEach(x => { if (sel.piece[x.id] === '') delete sel.piece[x.id]; }); }
    mtAfterChange(id);
  });
}
function mtAfterChange(id) {
  mtRefresh();
  const box = $('#pick-info'); if (!id || !box || !box.classList.contains('on') || typeof showPick !== 'function') return;
  const v = S.viewer, ud = !v ? null : id === MatLib.GROUND ? v.groundMesh && v.groundMesh.userData : v.byId[id] && v.byId[id][0] && v.byId[id][0].userData;
  showPick(ud || { id }, null);
}
/** ป้ายใน ปร.1 (บนจอเท่านั้น) */
function mtPill(r) {
  const s = r.mat_swap || []; if (!s.length) return '';
  const names = [...new Set(s.map(x => x.name))].join(', ');
  return `<span class="pill no-print" title="เปลี่ยนวัสดุจากแบบใน 3D: ${esc(names)} (${s.length} ชิ้น)">เปลี่ยนวัสดุ ${s.length} ชิ้น</span>`;
}
/** ราคาแนะนำของวัสดุ (bind.js sugResolve) — คืน {mat, lab} ของวัสดุแรกในแถวที่มีคำแนะนำ */
function mtSugOf(r) {
  const all = mtUseMats();
  for (const x of r.mat_swap || []) { const m = all[x.mat]; if (m && m.sug && (m.spec === r.name)) return m.sug; }
  return null;
}

// ------------------------------------------------------------------ หน้าต่างเลือกวัสดุ
function mtModal() {
  let m = $('#mt-modal'); if (m) return m;
  m = document.createElement('div'); m.id = 'mt-modal'; m.className = 'modal';
  m.innerHTML = `<div class="modal-box glass mt-box"><div class="side-top"><h2 style="margin:0" id="mt-title">เปลี่ยนวัสดุ</h2><button class="btn small" data-close="1">×</button></div><div id="mt-body"></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close) m.classList.remove('on'); });
  m.addEventListener('input', e => { if (e.target.id === 'mt-q') { MT.q = e.target.value; mtRenderList(); } });
  m.addEventListener('change', e => { if (e.target.name === 'mt-scope') { MT.scope = e.target.value; } });
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-mta]'); if (!b) return;
    const a = b.dataset.mta, mid = b.dataset.id, all = mtAll();
    if (a === 'use') mtUse(mid);
    else if (a === 'plan') mtUse('');
    else if (a === 'new') mtEdit(null, MT.pick);
    else if (a === 'edit') mtEdit(all[mid], MT.pick);
    else if (a === 'copy') { const c = Object.assign({}, all[mid]); delete c.id; delete c.by; delete c.byName; delete c.at; c.name = c.name + ' (สำเนา)'; mtEdit(c, MT.pick); }
    else if (a === 'del') mtDel(all[mid]);
    else if (a === 'up') mtUpload(all[mid]);
    else if (a === 'reload') mtLoad(true);
  });
  return m;
}
function mtOpen(id) {
  MT.pick = id; MT.q = ''; MT.scope = 'piece';
  const m = mtModal(); m.classList.add('on'); mtRender();
  if (!MT.loaded) mtLoad();
}
function mtStatus() {
  if (!window.UDMatFS && !MT.auth.ready) return '<span class="hint">คลังวัสดุกลาง: กำลังเชื่อม…</span>';
  if (!MT.auth.user) return '<span class="pill warn">ยังไม่ได้ล็อกอิน</span> <span class="hint">ใช้ได้เฉพาะวัสดุในโครงการนี้ — ล็อกอิน (แท็บบัญชี) เพื่อใช้คลังวัสดุกลางของทีม</span>';
  if (!mtApproved()) return '<span class="pill warn">รอผู้ดูแลระบบอนุมัติ</span> <span class="hint">ใช้ได้เฉพาะวัสดุในโครงการนี้</span>';
  if (MT.loading) return '<span class="hint">กำลังโหลดคลังวัสดุกลาง…</span>';
  if (MT.err) return `<span class="pill err">โหลดคลังไม่ได้</span> <span class="hint">${esc(MT.err)}</span> <button class="btn small" data-mta="reload">ลองใหม่</button>`;
  return `<span class="pill">คลังวัสดุกลาง ${MT.lib.length} รายการ</span> <button class="btn small ghost" data-mta="reload">รีเฟรช</button>`;
}
function mtRender() {
  const m = $('#mt-modal'); if (!m || !m.classList.contains('on') || !S.model) return;
  const id = MT.pick, g = id === MatLib.GROUND, f = g ? null : mtFin(id), cur = mtCur(id);
  $('#mt-title', m).textContent = g ? 'เปลี่ยนวัสดุผิวดิน' : 'เปลี่ยนวัสดุ — ' + (f ? [f.room, f.level].filter(Boolean).join(' · ') || f.id : id);
  const same = f ? mtSameType(f) : [];
  let h = `<div class="mt-head"><div class="hint">${g ? 'ผิวดินรอบอาคาร (ระดับ GL)' : `ชิ้น <b class="mono">${esc(id)}</b> · ตามแบบ: ${esc(MatLib.specOf(f))}`}</div>
    <div class="hint">ตอนนี้: <b>${esc(cur ? cur.name : g ? 'ดิน (ค่าเริ่ม)' : 'ตามแบบ')}</b></div>`;
  if (!g && same.length > 1) h += `<div class="mt-scope"><label><input type="radio" name="mt-scope" value="piece" ${MT.scope === 'piece' ? 'checked' : ''}> ชิ้นนี้</label>
    <label><input type="radio" name="mt-scope" value="type" ${MT.scope === 'type' ? 'checked' : ''}> ทุกชิ้นชนิดเดียวกัน (${same.length} ชิ้น)</label></div>`;
  h += `<div class="mt-stat">${mtStatus()}</div>
    <div class="btn-row"><input id="mt-q" class="cell" placeholder="ค้นชื่อ/รายการ" value="${esc(MT.q)}" style="flex:1;min-width:160px">
    <button class="btn small primary" data-mta="new">+ สร้างวัสดุใหม่</button>${!g && cur ? '<button class="btn small" data-mta="plan">ใช้ตามแบบ</button>' : ''}</div></div>
    <div id="mt-list"></div>`;
  $('#mt-body', m).innerHTML = h; mtRenderList();
}
function mtRenderList() {
  const box = $('#mt-list'); if (!box) return;
  const id = MT.pick, g = id === MatLib.GROUND, f = g ? MatLib.GROUND : mtFin(id), cur = mtCur(id), all = mtAll();
  const qs = MT.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = Object.values(all).filter(m => MatLib.accepts(f, m, S.model)).filter(m => qs.every(q => (m.name + ' ' + (m.spec || '') + ' ' + (m.byName || '')).toLowerCase().includes(q)))
    .sort((a, b) => (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'th'));
  const SRC = { lib: '', proj: '<span class="pill warn">เฉพาะโครงการนี้</span>', gone: '<span class="pill warn">ถูกลบจากคลังแล้ว (ใช้สำเนาในโครงการ)</span>' };
  if (!list.length) { box.innerHTML = `<div class="hint" style="margin-top:8px">ยังไม่มีวัสดุที่ใช้กับ${g ? 'ผิวดิน' : 'ผิวนี้'}ได้ — กด "+ สร้างวัสดุใหม่"</div>`; return; }
  box.innerHTML = list.map(m => `<div class="mt-item ${cur && cur.id === m.id ? 'on' : ''}">${mtSwatchHtml(m.look, 72, 48)}
    <div class="mt-iname"><b>${esc(m.name)}</b> ${m.builtin ? '<span class="pill">ค่าเริ่ม</span>' : ''}${SRC[m.src] || ''}
      <div class="hint">${esc(MatLib.CLS_TH[m.cls] || '')}${m.cls === 'roof' ? ' · ' + esc(MatLib.COVER_TH[m.cover] || '') + ' · ' + esc(mtInsTxt(m, null).replace(' (ไม่มี)', '')) : ''}${m.kinds && m.kinds.length ? ' · ' + m.kinds.map(k => MatLib.KIND_TH[k]).join(', ') : ''}${m.byName ? ' · โดย ' + esc(m.byName) : ''}</div>
      ${m.spec ? `<div class="hint">รายการ BOQ: ${esc(m.spec)}</div>` : ''}${m.sug ? `<div class="hint">ราคาแนะนำ: ${esc([m.sug.mat && m.sug.mat.label, m.sug.lab && m.sug.lab.label].filter(Boolean).join(' · '))}</div>` : ''}</div>
    <div class="mt-ibtn"><button class="btn small primary" data-mta="use" data-id="${esc(m.id)}">${cur && cur.id === m.id ? 'ใช้อยู่' : 'ใช้'}</button>
      ${m.builtin ? '' : `<button class="btn small" data-mta="copy" data-id="${esc(m.id)}">คัดลอก</button>`}
      ${mtCanEdit(m) ? `<button class="btn small" data-mta="edit" data-id="${esc(m.id)}">แก้</button>` : ''}
      ${m.src === 'proj' && mtApproved() ? `<button class="btn small" data-mta="up" data-id="${esc(m.id)}" title="ส่งวัสดุนี้ขึ้นคลังกลางให้ทั้งทีมใช้">ขึ้นคลัง</button>` : ''}
      ${m.src === 'lib' && mtCanEdit(m) ? `<button class="btn small danger" data-mta="del" data-id="${esc(m.id)}">ลบ</button>` : ''}</div></div>`).join('');
  mtPaintSwatches(box);
}
/** ใช้วัสดุ mid ('' = ตามแบบ) กับชิ้นที่เลือก/ทั้งชนิด */
function mtUse(mid) {
  const id = MT.pick, sel = mtSel(), all = mtAll(), m = mid ? all[mid] : null, f = id === MatLib.GROUND ? null : mtFin(id);
  if (mid && !m) return;
  if (m && !m.builtin) { const sn = mtSnaps(); sn[m.id] = Object.assign(MatLib.clean(m), { id: m.id }); }
  if (id === MatLib.GROUND) { if (!m || m.id === 'B-soil') delete sel.piece[id]; else sel.piece[id] = m.id; }
  else if (MT.scope === 'type' && f) {
    const k = MatLib.typeKey(f);
    if (m) sel.type[k] = m.id; else delete sel.type[k];
    mtSameType(f).forEach(x => { delete sel.piece[x.id]; });   // ทั้งชนิด: ทุกชิ้นตามกฎเดียวกัน
  } else if (f) {
    if (m) sel.piece[id] = m.id; else if (sel.type[MatLib.typeKey(f)]) sel.piece[id] = ''; else delete sel.piece[id];
  }
  mtPrune();
  toast(m ? `ใช้ "${m.name}" แล้ว${MT.scope === 'type' && f ? ' กับทุกชิ้นชนิดเดียวกัน' : ''}` : 'กลับไปใช้วัสดุตามแบบแล้ว');
  const need = mtNeed();
  if (need.length) { mtAfterChange(id); return mtAskSide(need, id); }
  const mm = $('#mt-modal'); if (mm) mm.classList.remove('on');
  mtAfterChange(id);
}
/** 6b: ถามด้านภายใน/ภายนอกของชิ้นที่สลับ ทาสี ↔ กรุ (ตอบครั้งเดียวใช้กับทุกชิ้นที่ยังไม่รู้) */
function mtAskSide(need, id) {
  const m = mtModal(); m.classList.add('on');
  const fs = need.map(mtFin).filter(Boolean), eff = MatLib.effective(S.model, mtSel(), mtUseMats());
  const p2c = fs.filter(f => MatLib.swapMode(f, eff[f.id]) === 'p2c').length;
  $('#mt-title', m).textContent = 'ผนังด้านภายในหรือภายนอก?';
  const list = fs.slice(0, 8).map(f => `<li>${esc([f.room, f.level].filter(Boolean).join(' · ') || f.id)} <span class="mono hint">${esc(f.id)} · ผนัง ${esc(f.wall || '')}</span></li>`).join('') + (fs.length > 8 ? `<li class="hint">… อีก ${fs.length - 8} ชิ้น</li>` : '');
  $('#mt-body', m).innerHTML = `<div class="mt-head"><div>${fs.length} ชิ้นที่เปลี่ยน${p2c === fs.length ? 'จากผนังทาสีเป็นผนังกรุ' : p2c ? 'ระหว่างผนังทาสีกับผนังกรุ' : 'จากผนังกรุเป็นผนังทาสี'} ยังไม่รู้ว่าเป็นผนังด้านภายในหรือภายนอก
    <div class="hint">ใช้เลือกแถวฉาบปูน/ทาสี${p2c === fs.length ? 'ที่จะหักออก' : p2c ? 'ที่จะหัก/เพิ่ม' : 'ที่จะเพิ่ม'} (ภายใน/ภายนอกราคาต่างกัน) — ชื่อรายการไม่มีคำว่า "ภายใน/ภายนอก" และผนังไม่ได้ฉาบด้านเดียว</div></div>
    <ul style="margin:6px 0 0 18px">${list}</ul>
    <div class="btn-row" style="margin-top:10px"><button class="btn small primary" data-mts="int">ภายใน</button><button class="btn small primary" data-mts="ext">ภายนอก</button>
    <button class="btn small" data-mts="later">ไว้ทีหลัง</button></div>
    <div class="hint">ตอบแล้วใช้กับทุกชิ้นในรายการนี้ · แก้ทีละชิ้นได้ที่กล่องข้อมูลชิ้น · "ไว้ทีหลัง" = 3D เปลี่ยนแล้ว แต่ ปร.1 ยังไม่แยกแถวจนกว่าจะเลือกด้าน</div></div>`;
  $('#mt-body', m).querySelectorAll('[data-mts]').forEach(b => b.onclick = () => {
    const v = b.dataset.mts, sel = mtSel();
    if (v !== 'later') need.forEach(x => { sel.side[x] = v; });
    m.classList.remove('on'); mtAfterChange(id);
    if (v !== 'later') toast(`ตั้งเป็นผนังด้าน${MatLib.SIDE_TH[v]} ${need.length} ชิ้นแล้ว`);
  });
}
/** ลบสำเนาวัสดุที่ไม่มีชิ้นใดใช้แล้ว (ยกเว้นวัสดุเฉพาะโครงการ — ยังเลือกใช้ได้ภายหลัง) */
function mtPrune() {
  const sel = mtSel(), eff0 = S.model ? MatLib.effective(S.model, sel, mtUseMats()) : {};
  Object.keys(sel.side).forEach(id => { const f = mtFin(id); if (!f || !eff0[id] || !MatLib.swapMode(f, eff0[id])) delete sel.side[id]; });   // ด้านของชิ้นที่ไม่ได้สลับแล้ว
  const used = new Set(Object.values(sel.piece).concat(Object.values(sel.type)).filter(Boolean)), sn = mtSnaps();
  Object.keys(sn).forEach(id => { if (!used.has(id) && !String(id).startsWith('P-')) delete sn[id]; });
}
async function mtDel(m) {
  if (!m || !mtCanEdit(m)) return;
  if (!confirm(`ลบ "${m.name}" ออกจากคลังวัสดุกลาง?\nโครงการที่ใช้อยู่ยังใช้สำเนาเดิมต่อได้ (ไม่เปลี่ยน BOQ)`)) return;
  try { await UDMatFS.del(m.id); MT.lib = MT.lib.filter(x => x.id !== m.id); toast('ลบออกจากคลังแล้ว'); } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
  mtRender();
}
/** วัสดุเฉพาะโครงการ → คลังกลาง (id ใหม่ แล้วเปลี่ยนการเลือกในโครงการนี้ตาม) */
async function mtUpload(m) {
  if (!m || !mtApproved()) return;
  try {
    const c = MatLib.clean(m); delete c.id; delete c.by; delete c.byName;
    const d = await UDMatFS.put(c), nm = Object.assign(MatLib.clean(d), { id: d.id });
    MT.lib.push(nm); mtReplaceId(m.id, nm); toast('ส่งขึ้นคลังกลางแล้ว');
  } catch (e) { alert('ส่งขึ้นคลังไม่สำเร็จ: ' + e.message); }
  mtRender();
}
function mtReplaceId(oldId, nm) {
  const sel = mtSel(), sn = mtSnaps();
  ['piece', 'type'].forEach(k => Object.keys(sel[k]).forEach(x => { if (sel[k][x] === oldId) sel[k][x] = nm.id; }));
  delete sn[oldId]; sn[nm.id] = nm; mtRefresh();
}

// ------------------------------------------------------------------ หน้าแก้วัสดุ
function mtEdModal() {
  let m = $('#mte-modal'); if (m) return m;
  m = document.createElement('div'); m.id = 'mte-modal'; m.className = 'modal';
  m.innerHTML = `<div class="modal-box glass mt-box"><div class="side-top"><h2 style="margin:0" id="mte-title"></h2><button class="btn small" data-close="1">×</button></div>
    <div id="mte-body"></div><div class="btn-row" style="margin-top:10px;align-items:center"><button class="btn small primary" id="mte-save"></button><button class="btn small" data-close="1">ยกเลิก</button><span id="mte-err" style="color:var(--red)"></span></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close) m.classList.remove('on'); });
  m.addEventListener('input', e => mtEdInput(e.target, false));
  m.addEventListener('change', e => mtEdInput(e.target, true));
  m.addEventListener('click', e => { const b = e.target.closest('[data-mte]'); if (!b) return; if (b.dataset.mte === 'sugclr') { delete MT.ed.sug; mtEdRender(); } });
  $('#mte-save', m).onclick = mtEdSave;
  return m;
}
function mtEdit(m, forId) {
  const f = forId && forId !== MatLib.GROUND ? mtFin(forId) : null;
  const pc = f && MatLib.pieceClass(f);
  const base = m ? JSON.parse(JSON.stringify(m)) : pc === 'roof' ? { name: '', cls: 'roof', kinds: [], cover: f.cover, spec: '', ins: { mode: 'keep' }, look: { pat: 'plain', color: '#7d8a92' } } : {
    name: '', cls: forId === MatLib.GROUND ? 'ground' : pc === 'paint' ? 'paint' : 'clad',
    kinds: f ? [MatLib.kindOfPiece(f)] : [], spec: '', look: forId === MatLib.GROUND ? { pat: 'grass' } : { pat: f && f.kind === 'floor' ? 'granito' : f && f.kind === 'other' ? 'plain' : 'tile' } };
  if (base.cls === 'roof') { base.ins = base.ins || { mode: 'keep' }; base.cover = base.cover || (f && f.cover) || 'metal_sheet'; }
  base.look = MatLib.lookOf(base.look);
  MT.ed = base; MT.edFor = forId || null;
  MT.edTarget = m && m.id && !String(m.id).startsWith('P-') ? 'lib' : m && m.id ? 'proj' : (mtApproved() ? 'lib' : 'proj');
  mtEdModal().classList.add('on'); mtEdRender();
}
function mtEdRender() {
  const e = MT.ed, m = $('#mte-modal'); if (!e || !m) return;
  const L = e.look, P = MatLib.PAT, pats = MatLib.PAT_FOR[e.cls] || ['plain'];
  if (!pats.includes(L.pat)) { e.look = MatLib.lookOf({ pat: pats[0] }); return mtEdRender(); }
  const need = { color2: ['concrete', 'granito', 'washed', 'wood', 'soil', 'grass'], grout: ['tile', 'granito', 'brick'], gw: ['tile', 'granito', 'brick', 'wood'], cell: ['concrete', 'tile', 'granito', 'brick', 'wood', 'washed'] };
  const show = k => need[k].includes(L.pat);
  const CELL_TH = { brick: 'ขนาดก้อน (ยาว × สูง)', wood: 'ขนาดแผ่น (ยาว × กว้าง)', concrete: 'ขนาดแผงแบบหล่อ', washed: 'หน่วยลาย' };
  const isNew = !e.id;
  $('#mte-title', m).textContent = isNew ? 'สร้างวัสดุใหม่' : 'แก้วัสดุ — ' + e.name;
  const kinds = MatLib.CLAD_KINDS.map(k => `<label><input type="checkbox" data-mtk="${k}" ${e.kinds.includes(k) ? 'checked' : ''}> ${MatLib.KIND_TH[k]}</label>`).join(' ');
  const rows = (S.priced || []).filter(r => r.mat_src || r.lab_src || (S.boq.bind || {})[r.key]);
  let h = `<div class="mte-grid"><div class="mte-form">
    <label class="fld">ชื่อวัสดุ<input class="cell" data-mtf="name" value="${esc(e.name)}" placeholder="เช่น กระเบื้องแกรนิตโต้ 60x60 สีเทาอ่อน ยาแนวขาว"></label>
    <label class="fld">ประเภท<select data-mtf="cls">${['clad', 'paint', 'roof', 'ground'].map(c => `<option value="${c}" ${e.cls === c ? 'selected' : ''}>${MatLib.CLS_TH[c]}</option>`).join('')}</select></label>
    ${e.cls === 'ground' ? '<div class="hint">ผิวดินรอบอาคาร — แสดงใน 3D อย่างเดียว ไม่มีแถว BOQ</div>' : e.cls === 'roof' ? `<label class="fld">ชนิดวัสดุมุง<select data-mtf="cover">${Object.entries(MatLib.COVER_TH).map(([k, v]) => `<option value="${k}" ${e.cover === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <span class="hint">ใช้ได้กับหลังคาชนิดเดียวกันเท่านั้น (ต่างชนิดต้องแก้โมเดล)</span></label>
      <label class="fld">ข้อความรายการ BOQ<textarea class="cell" rows="2" data-mtf="spec" placeholder="เช่น หลังคาเมทัลชีท หนา 0.40 มม. สีแดง">${esc(e.spec)}</textarea><span class="hint">ชื่อแถวใน ปร.4 · พื้นที่เท่าเดิม · ราคาผูกตามชนิดวัสดุมุง</span></label>
      <div class="fld">ฉนวนใต้หลังคา<div>${['keep', 'none', 'set'].map(k => `<label><input type="radio" name="mte-ins" value="${k}" ${e.ins.mode === k ? 'checked' : ''}> ${MatLib.INS_TH[k]}</label>`).join(' ')}</div>
      ${e.ins.mode === 'set' ? `<input class="cell" data-mti="desc" value="${esc(e.ins.desc || '')}" placeholder="เช่น PU โฟม หนา 25 มม.">` : ''}<span class="hint">แถวฉนวนพื้นที่เท่ากับแผ่นมุง · "ฉนวนตามแบบ" = เปลี่ยนแค่แผ่น</span></div>` : `<div class="fld">ใช้กับผิว<div class="mte-kinds">${kinds}</div></div>`}
    ${e.cls === 'clad' ? `<label class="fld">ข้อความรายการ BOQ<textarea class="cell" rows="2" data-mtf="spec" placeholder="เช่น พื้นปูกระเบื้องแกรนิตโต้ 60x60 ซม. ผิวด้าน">${esc(e.spec)}</textarea>
      <span class="hint">เป็นชื่อแถวใน ปร.4 — ชิ้นที่เปลี่ยนย้ายไปแถวนี้ (ตรงกับรายการที่มีอยู่แล้ว = รวมแถว) · แกรนิตโต้ระบุขนาด "60x60 ซม." และ ฝ้ายิปซัม ผูกราคาอัตโนมัติได้</span></label>` : e.cls === 'paint' ? '<div class="hint">ฉาบทาสี: เปลี่ยนสีใน 3D · ผิวโครงสร้างที่เปลี่ยนเป็นทาสีคิดเป็นฉาบปูนโครงสร้าง + ทาสีน้ำอะคริลิก · ผนังกรุที่เปลี่ยนเป็นทาสีคิดเป็นฉาบปูนเรียบผนัง + ทาสีน้ำอะคริลิก (ใส่คำว่า "ภายใน" หรือ "ภายนอก" ในชื่อวัสดุ = ไม่ต้องถามด้าน)</div>' : ''}
    <label class="fld">ลาย<select data-mtl="pat">${pats.map(p => `<option value="${p}" ${L.pat === p ? 'selected' : ''}>${P[p].th}</option>`).join('')}</select></label>
    <div class="mte-row"><label class="fld">สีหลัก<input type="color" data-mtl="color" value="${esc(L.color)}"></label>
      ${show('color2') ? `<label class="fld">${L.pat === 'granito' || L.pat === 'washed' ? 'สีเม็ด' : 'สีที่ 2'}<input type="color" data-mtl="color2" value="${esc(L.color2 || '#888888')}"></label>` : ''}
      ${show('grout') ? `<label class="fld">${L.pat === 'brick' ? 'สีปูนก่อ' : 'สียาแนว'}<input type="color" data-mtl="grout" value="${esc(L.grout || '#999999')}"></label>` : ''}
      ${show('gw') ? `<label class="fld">ร่อง (มม.)<input class="cell num" type="number" min="0" max="50" step="0.5" data-mtl="gw" value="${esc(L.gw ?? '')}"></label>` : ''}</div>
    ${show('cell') ? `<div class="mte-row"><label class="fld">${CELL_TH[L.pat] || 'ขนาดแผ่น (กว้าง × ยาว)'} ซม.<span><input class="cell num" type="number" min="1" step="0.5" data-mtc="0" value="${+(L.cell[0] * 100).toFixed(2)}"> × <input class="cell num" type="number" min="1" step="0.5" data-mtc="1" value="${+(L.cell[1] * 100).toFixed(2)}"></span></label></div>` : ''}
    ${e.cls === 'clad' || e.cls === 'roof' ? `<div class="fld">ราคาแนะนำ <span class="hint">(คำแนะนำในแถวที่ยังไม่มีราคา — ไม่ทับการผูกอัตโนมัติ)</span>
      <div class="hint">${e.sug ? esc([e.sug.mat && 'วัสดุ: ' + e.sug.mat.label, e.sug.lab && 'ค่าแรง: ' + e.sug.lab.label].filter(Boolean).join(' · ')) + ' <button class="btn small ghost" data-mte="sugclr">ล้าง</button>' : 'ยังไม่มี'}</div>
      ${rows.length ? `<select data-mtf="sugfrom"><option value="">คัดลอกการผูกจากแถว BOQ…</option>${rows.map(r => `<option value="${esc(r.key)}">${esc(r.name)}${r.mat_src ? ' · ' + esc(r.mat_src) : ''}</option>`).join('')}</select>` : ''}</div>` : ''}
    <div class="fld">บันทึกที่<div><label><input type="radio" name="mte-tg" value="lib" ${MT.edTarget === 'lib' ? 'checked' : ''} ${mtApproved() ? '' : 'disabled'}> คลังวัสดุกลาง (ทั้งทีม)</label>
      <label><input type="radio" name="mte-tg" value="proj" ${MT.edTarget === 'proj' ? 'checked' : ''} ${e.id && !String(e.id).startsWith('P-') ? 'disabled' : ''}> เฉพาะโครงการนี้</label></div>
      ${mtApproved() ? '' : '<span class="hint">ล็อกอินด้วยบัญชีที่อนุมัติแล้วเพื่อบันทึกเข้าคลังกลาง</span>'}</div>
  </div><div class="mte-prev"><canvas id="mte-cv" width="300" height="300"></canvas><div class="hint" id="mte-cvh"></div>
    <canvas id="mte-cv2" width="300" height="120"></canvas><div class="hint">ตัวอย่างพื้นที่ 2.5 × 1 ม.</div></div></div>`;
  $('#mte-body', m).innerHTML = h;
  $('#mte-save', m).textContent = MT.edFor ? 'บันทึกแล้วใช้กับชิ้นนี้' : 'บันทึก';
  mtEdPreview();
}
function mtEdPreview() {
  const e = MT.ed, cv = $('#mte-cv'), cv2 = $('#mte-cv2'); if (!e || !cv) return;
  const rep = MatLib.repeatOf(e.look), span = rep ? Math.max(rep[0], rep[1]) * 3 : 1;
  MatLib.swatch(cv, e.look, span); MatLib.swatch(cv2, e.look, 2.5);
  $('#mte-cvh').textContent = rep ? `ตัวอย่าง ${span.toFixed(2)} × ${span.toFixed(2)} ม.` : 'สีเรียบ';
}
function mtEdInput(t, changed) {
  const e = MT.ed; if (!e) return;
  if (t.dataset.mtf === 'sugfrom') { if (changed && t.value) { const s = mtSugFromRow(t.value); if (s) e.sug = s; else toast('แถวนี้ไม่มีการผูกที่ใช้เป็นคำแนะนำได้'); mtEdRender(); } return; }
  if (t.name === 'mte-ins') { e.ins = { mode: t.value, desc: (e.ins && e.ins.desc) || '' }; mtEdRender(); return; }
  if (t.dataset.mti) { e.ins.desc = t.value; return; }
  if (t.dataset.mtf) { e[t.dataset.mtf] = t.value; if (t.dataset.mtf === 'cls' && changed) { if (e.cls === 'ground' || e.cls === 'roof') e.kinds = []; if (e.cls === 'roof') { e.ins = e.ins || { mode: 'keep' }; e.cover = e.cover || 'metal_sheet'; } mtEdRender(); } return; }
  if (t.dataset.mtk) { const k = t.dataset.mtk; e.kinds = e.kinds.filter(x => x !== k); if (t.checked) e.kinds.push(k); return; }
  if (t.name === 'mte-tg') { MT.edTarget = t.value; return; }
  if (t.dataset.mtl) { const k = t.dataset.mtl; e.look[k] = k === 'gw' ? (t.value === '' ? undefined : +t.value) : t.value;
    if (k === 'pat') { e.look = MatLib.lookOf({ pat: t.value }); return mtEdRender(); } mtEdPreview(); return; }
  if (t.dataset.mtc !== undefined) { const v = +t.value / 100; if (v > 0) { e.look.cell[+t.dataset.mtc] = v; mtEdPreview(); } }
}
/** การผูกของแถว BOQ → ราคาแนะนำ (รูปแบบเดียวกับความจำการผูก) */
function mtSugFromRow(key) {
  const r = (S.priced || []).find(x => x.key === key); if (!r) return null;
  const b = (S.boq.bind || {})[key] || {}, ref = r.ref || r.price_ref || {}, out = {};
  const ok = v => v && ['mat', 'comp', 'wage', 'none'].includes(v.kind) && (v.kind === 'none' || v.code);
  if (ok(b.mat)) out.mat = { kind: b.mat.kind, code: b.mat.code || '', label: BoqBind.label(b.mat) || 'ไม่มีค่าวัสดุ' };
  else if (ref.kind === 'comp' && ref.code) out.mat = { kind: 'comp', code: ref.code, label: r.mat_src || 'วัสดุมวลรวม ' + ref.code };
  else if (ref.kind === 'mat' && ref.code) out.mat = { kind: 'mat', code: ref.code, label: r.mat_src || 'พาณิชย์ ' + ref.code };
  if (ok(b.lab)) out.lab = { kind: b.lab.kind, code: b.lab.code || '', label: BoqBind.label(b.lab) || 'ไม่มีค่าแรง' };
  else if (ref.wage_code) out.lab = { kind: 'wage', code: ref.wage_code, label: r.lab_src || 'ว480 ' + ref.wage_code };
  return out.mat || out.lab ? out : null;
}
async function mtEdSave() {
  const e = MT.ed; if (!e) return;
  const c = MatLib.clean(e), err = MatLib.problems(c), em = $('#mte-err');
  if (err.length) { em.textContent = err.join(' · '); return; }
  if (MT.edFor && !MatLib.accepts(MT.edFor === MatLib.GROUND ? MatLib.GROUND : mtFin(MT.edFor), c, S.model)) { em.textContent = 'วัสดุนี้ใช้กับชิ้นที่เลือกไม่ได้ (ตรวจประเภท/ผิวที่ใช้)'; return; }
  em.textContent = 'กำลังบันทึก…';
  let saved;
  try {
    if (MT.edTarget === 'lib') {
      if (e.id) { c.id = e.id; c.by = e.by; c.byName = e.byName; } else delete c.id;
      const d = await UDMatFS.put(c); saved = Object.assign(MatLib.clean(d), { id: d.id });
      MT.lib = MT.lib.filter(x => x.id !== saved.id).concat([saved]);
    } else {
      saved = Object.assign(c, { id: e.id || ('P-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), at: Date.now() });
    }
  } catch (x) { em.textContent = 'บันทึกไม่สำเร็จ: ' + x.message; return; }
  em.textContent = '';
  const sn = mtSnaps(); if (sn[saved.id] || String(saved.id).startsWith('P-')) sn[saved.id] = saved;   // โครงการนี้ใช้อยู่ → สำเนาใหม่
  $('#mte-modal').classList.remove('on');
  if (MT.edFor) { MT.pick = MT.edFor; mtUse(saved.id); } else { mtRefresh(); mtRender(); }
  toast('บันทึกวัสดุแล้ว' + (MT.edTarget === 'lib' ? ' (คลังกลาง)' : ' (เฉพาะโครงการนี้)'));
}
