/* UD Total Station — วัสดุมวลรวมที่สร้างเอง (M2 ก้อน 5e · ตาม UD Cost Hub "วัสดุมวลรวมที่สร้างเอง")
 * เก็บในคลังกลาง (ชีต comps ผ่านสคริปต์คลังราคาสืบ) ใช้ร่วมกันทั้งทีมและทั้งสองเว็บ · หมวด 12 งานอื่นๆ · รหัส U-1, U-2, ...
 * แปลงเป็นข้อมูลแบบมวลรวมมาตรฐานด้วย Survey.compToItems/compMerge (lib ใช้ร่วม Cost Hub) แล้วเติมลง S.db
 *   → ขึ้นในหน้าต่างผูกราคา แท็บวัสดุมวลรวม (ทั้งแถว และทีละบรรทัดในมวลรวม) คิดราคาด้วยตัวคำนวณเดียวกัน
 * สิทธิ์ (ตาม Cost Hub): สร้าง/แก้ = เชื่อมคลังกลางแล้ว (บัญชีอนุมัติ editor/admin หรือรหัสทีม) · ลบ = ผู้ดูแลระบบ หรือรหัสทีม
 * ลบแล้วเลิกผูก (Earth 21 พ.ย. 2569): แถว/บรรทัดที่ผูกไว้ในโครงการที่เปิดอยู่เลิกผูกทันที · โครงการอื่นเลิกผูกตอนเปิด
 *   เฉพาะเมื่อโหลดรายการจากคลังกลางสำเร็จแล้ว (ติดต่อไม่ได้ → ไม่แตะการผูก) */
'use strict';
const CU = { comps: [], loaded: false, loading: false, err: '', ed: null, ret: null };
const CU_SRC = { mat: 'ราคาพาณิชย์', fixed: 'ราคาคงที่', comp: 'มวลรวมอื่น', none: 'เลือกตอนใช้ใน BOQ' };
const cuCanWrite = () => !!(Survey.remote() && S.libMode === 'central');
const cuCanDel = () => cuCanWrite() && lvCanDel();
const cuWhy = () => !Survey.remote() ? 'ยังไม่ได้ตั้งคลังกลาง' : S.libMode === 'offline' ? 'ติดต่อคลังกลางไม่ได้' : 'ต้องเข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลอนุมัติแล้ว (หรือใส่รหัสทีม)';

// ------------------------------------------------------------------ โหลด / เติมลงฐานราคา
function cuApply() {
  if (!S.db || !S.baseCompItems) return;
  CU.comps = Survey.compMerge({ compList: S.db.compList, compItems: S.baseCompItems, matRef: S.db.matRef }, CU.comps);
  applySurvey();   // S.db.compItems สร้างใหม่จาก S.baseCompItems (รวมราคาสืบของวัสดุย่อย)
}
async function cuLoad() {
  if (!S.db || !Survey.remote() || CU.loading) return;
  CU.loading = true;
  try { CU.comps = (await Survey.compList()) || []; CU.loaded = true; CU.err = ''; }
  catch (e) { CU.err = e.message; console.warn('โหลดวัสดุมวลรวมที่สร้างเองไม่สำเร็จ', e); return; }
  finally { CU.loading = false; }
  cuApply(); cuPruneOpen(); cuRefresh();
}
/** เปิดโครงการ: เลิกผูก U-n ที่ไม่มีในคลังกลางแล้ว (เฉพาะเมื่อโหลดคลังกลางสำเร็จ) */
function cuPruneOpen() {
  if (!CU.loaded) return;
  const n = cuPrune();
  if (n) toast(`เลิกผูกวัสดุมวลรวมที่ถูกลบจากคลังกลางแล้ว ${n} จุด — แถวนั้นใช้การผูกอัตโนมัติหรือขึ้น "ยังไม่มีราคา" ให้ผูกใหม่`);
}
/** เลิกผูกมวลรวมสร้างเองในโครงการที่เปิดอยู่ · gone = รหัสที่เพิ่งลบ (Set) · ไม่ส่ง = เทียบกับรายการจากคลังกลาง · คืนจำนวนจุด */
function cuPrune(gone) {
  if (!S.boq) return 0;
  const live = CU.comps.map(c => c.id); let n = 0;
  const dead = refs => gone ? new Set([...refs].filter(c => gone.has(c))) : Survey.compGone(refs, live);
  const B = S.boq.bind || {};
  Object.keys(B).forEach(k => { const v = B[k] && B[k].mat;
    if (v && v.kind === 'comp' && dead(new Set([String(v.code)])).size) { delete B[k].mat; if (!B[k].lab) delete B[k]; n++; } });
  const C = S.boq.cmpline || {};
  Object.keys(C).forEach(k => { const sc = C[k]; if (!sc) return;
    const refs = Survey.compRefCodes(sc); refs.add(String(sc.code));
    const G = dead(refs); if (!G.size) return;
    if (G.has(String(sc.code))) { delete C[k]; return; }   // ขอบเขตของมวลรวมที่ถูกลบ (แถวเลิกผูกแล้วข้างบน)
    n += Survey.compUnlink(sc, G);
  });
  if (n) autosave();
  return n;
}
function cuRefresh() {
  renderPR1(); renderSummary(); renderSurvey();
  if (typeof BQ !== 'undefined' && BQ.key && $('#bind-modal') && $('#bind-modal').classList.contains('on')) bqList();
  if ($('#cul-modal') && $('#cul-modal').classList.contains('on')) cuListRender();
}
const cuOf = id => CU.comps.find(x => x.id === id) || null;
/** แถวในโครงการนี้ที่ใช้มวลรวม id (ผูกทั้งแถว หรือผูกบรรทัดในมวลรวม) */
function cuUsedBy(id) {
  const out = [];
  (S.priced || []).forEach(r => {
    const sc = (S.boq.cmpline || {})[r.key];
    const whole = r.ref && r.ref.kind === 'comp' && String(r.ref.code) === id;
    const line = sc && Survey.compRefCodes(sc).has(id);
    if (whole || line) out.push(r.name + (whole ? '' : ' (บรรทัดในมวลรวม)'));
  });
  return out;
}

// ------------------------------------------------------------------ หน้ารายการ (แท็บราคาสืบ → ปุ่ม "มวลรวมสร้างเอง")
function cuListOpen() {
  let m = $('#cul-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'cul-modal'; m.className = 'modal'; document.body.appendChild(m);
    m.addEventListener('click', e => {
      if (e.target === m || e.target.dataset.close) return m.classList.remove('on');
      const a = e.target.closest('[data-cua]'); if (!a) return;
      const id = a.dataset.id || null;
      if (a.dataset.cua === 'new') cuOpen(null, null, null);
      else if (a.dataset.cua === 'edit') cuOpen(id, null, null);
      else if (a.dataset.cua === 'copy') cuOpen(null, id, null);
      else if (a.dataset.cua === 'del') cuDel(id);
      else if (a.dataset.cua === 'reload') { CU.loaded = false; cuLoad().then(cuListRender); }
    });
  }
  m.innerHTML = `<div class="modal-box glass cu-box"><div class="side-top"><h2 style="margin:0">วัสดุมวลรวมที่สร้างเอง</h2><button class="btn small" data-close="1">×</button></div><div id="cul-body"></div></div>`;
  m.classList.add('on'); cuListRender();
  if (!CU.loaded) cuLoad().then(cuListRender);
}
function cuListRender() {
  const b = $('#cul-body'); if (!b) return;
  const w = cuCanWrite(), d = cuCanDel();
  const head = `<div class="btn-row" style="margin:6px 0"><button class="btn small primary" data-cua="new" ${w ? '' : 'disabled'}>+ สร้างวัสดุมวลรวมเอง</button><button class="btn small" data-cua="reload">โหลดใหม่</button></div>
    <div class="hint">อยู่หมวด 12 งานอื่นๆ รหัสขึ้นต้น U- · ใช้ร่วมกันทั้งทีมและ UD Cost Hub · แก้แล้วทุกโครงการที่ใช้เปลี่ยนตาม${w ? '' : ' — สร้าง/แก้ไม่ได้: ' + esc(cuWhy())}${w && !d ? ' · ลบได้เฉพาะผู้ดูแลระบบ' : ''}</div>`;
  if (!Survey.remote()) { b.innerHTML = head + '<div class="hint bq-note">ยังไม่ได้ตั้งคลังกลาง — กด "ตั้งค่าคลังกลาง" ในแท็บราคาสืบ</div>'; return; }
  if (!CU.loaded) { b.innerHTML = head + `<div class="hint bq-note">${CU.loading ? 'กำลังโหลด…' : 'โหลดจากคลังกลางไม่สำเร็จ' + (CU.err ? ': ' + esc(CU.err) : '')}</div>`; return; }
  const rows = CU.comps.map(c => {
    const pr = S.db ? S.db.compPrice(c.id, {}) : null, used = cuUsedBy(c.id);
    return `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.name)}<div class="hint">${(c.lines || []).length} บรรทัด${c.by ? ' · แก้ล่าสุดโดย ' + esc(String(c.by).replace(/\s*<[^>]*>$/, '')) : ''}${c.updated ? ' · ' + esc(String(c.updated).slice(0, 10)) : ''}</div></td>
      <td>${esc(c.unit)}</td><td class="r">${pr && pr.price !== null ? bqF2(pr.price) : '<span class="hint">คิดไม่ครบ</span>'}</td>
      <td>${used.length ? `<span title="${esc(used.join('\n'))}">${used.length} แถว</span>` : '<span class="hint">—</span>'}</td>
      <td style="white-space:nowrap"><button class="btn small" data-cua="edit" data-id="${esc(c.id)}" ${w ? '' : 'disabled'}>แก้ไข</button> <button class="btn small" data-cua="copy" data-id="${esc(c.id)}" ${w ? '' : 'disabled'}>คัดลอก</button>${d ? ` <button class="btn small danger" data-cua="del" data-id="${esc(c.id)}">ลบ</button>` : ''}</td></tr>`;
  }).join('');
  b.innerHTML = head + (CU.comps.length ? `<table class="boq cu-tbl"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>ใช้ในโครงการนี้</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="hint bq-note">ยังไม่มีวัสดุมวลรวมที่สร้างเอง</div>');
}

// ------------------------------------------------------------------ หน้าแก้ (เหมือน Cost Hub cuOpen/cuRender/cuSave)
function cuModal() {
  let m = $('#cu-modal'); if (m) return m;
  m = document.createElement('div'); m.id = 'cu-modal'; m.className = 'modal';
  m.innerHTML = `<div class="modal-box glass cu-box"><div class="side-top"><h2 style="margin:0" id="cu-title"></h2><button class="btn small" data-close="1">×</button></div>
    <div id="cu-body"></div><div class="btn-row" style="margin-top:10px;align-items:center"><button class="btn small primary" id="cu-save">บันทึกเข้าคลังกลาง</button><button class="btn small" data-close="1">ยกเลิก</button><span id="cu-err" style="color:var(--red)"></span></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close) cuClose(); });
  $('#cu-save', m).onclick = cuSave;
  const body = $('#cu-body', m);
  body.addEventListener('input', ev => {
    const t = ev.target, e = CU.ed; if (!e) return;
    if (t.dataset.cuh) { e[t.dataset.cuh] = t.value; return; }
    const f = t.dataset.cu, i = +t.dataset.i; if (!f || !e.lines[i]) return;
    const l = e.lines[i];
    if (f === 'qty' || f === 'price') l[f] = t.value === '' ? '' : +t.value; else l[f] = t.value;
    if (f === 'code') {
      const q = t.value.trim(), box = body.querySelector(`[data-cures="${i}"]`); if (!box) return;
      if (q.length < 2 || /^[0-9,\s]+$/.test(q)) { box.innerHTML = ''; return; }
      const res = bqSearch(S.db.materials.filter(d => d.code), q, d => [d.name, d.code, d.catName || '']);
      const items = res.fallback ? [] : res.items.slice(0, 8);
      box.innerHTML = items.length ? '<div class="cu-res">' + items.map(d => `<div class="bq-item" data-cupick="${i}" data-code="${esc(d.code)}" data-unit="${esc(d.unit)}"><div class="bq-iname">${esc(d.name)}<div class="hint">${esc(d.code)}${d.province ? ' · ' + esc(d.province) : ''}</div></div><div class="bq-iprice">${d.price !== null ? bqF2(d.price) + ' / ' + esc(d.unit) : '—'}</div></div>`).join('') + '</div>' : '<div class="hint">ไม่พบ</div>';
    }
  });
  body.addEventListener('change', ev => { const t = ev.target; if (t.dataset.cuh === 'unit' || (t.dataset.cu && t.dataset.cu !== 'code' && t.dataset.cu !== 'name')) cuRender(); else if (t.dataset.cu === 'code' && /^[0-9,\s]+$/.test(t.value.trim())) cuRender(); });
  body.addEventListener('click', ev => {
    const pk = ev.target.closest('[data-cupick]');
    if (pk) { const l = CU.ed.lines[+pk.dataset.cupick]; l.code = pk.dataset.code; if (!l.unit) l.unit = pk.dataset.unit;
      if (!l.name) { const d = S.db.material(pk.dataset.code); if (d) l.name = d.name.slice(0, 80); } cuRender(); return; }
    const dl = ev.target.closest('[data-cudel]');
    if (dl) { CU.ed.lines.splice(+dl.dataset.cudel, 1); if (!CU.ed.lines.length) CU.ed.lines.push({ name: '', qty: '', unit: '', src: 'mat' }); cuRender(); return; }
    if (ev.target.id === 'cu-addln') { CU.ed.lines.push({ name: '', qty: '', unit: '', src: 'mat' }); cuRender(); }
    if (ev.target.id === 'cu-copyln') { const v = $('#cu-copy').value; if (!v) return;
      CU.ed.lines = CU.ed.lines.filter(l => l.name || l.code || l.price || l.comp).concat(cuLinesFrom(v)); cuRender(); }
  });
  return m;
}
/** บรรทัดจากมวลรวมที่มีอยู่ (มาตรฐานหรือสร้างเอง) → รูปแบบของตัวแก้ */
function cuLinesFrom(compId) {
  const cc = cuOf(compId); if (cc) return JSON.parse(JSON.stringify(cc.lines || []));
  return S.baseCompItems.filter(b => b.compId === String(compId)).map(it => {   // ชุดฐาน: ไม่เอาราคาสืบของโครงการนี้ติดไปเป็นราคาคงที่
    const l = { name: it.itemName || '', qty: it.qty, unit: it.unit || '', src: 'none' };
    if (it.fixedPrice !== null && it.fixedPrice !== undefined) { l.src = 'fixed'; l.price = it.fixedPrice; return l; }
    const sc = S.db.resolveCompRef(it); if (sc) { l.src = 'comp'; l.comp = sc.sub || sc.id; return l; }
    const codes = S.db.itemCodes(it); if (codes.length) { l.src = 'mat'; l.code = codes.join(','); }
    return l;
  });
}
/** เปิดหน้าแก้: id = แก้รายการเดิม · fromId = คัดลอกจากมวลรวมนี้ · ret = ผูกให้หลังบันทึก {key, side, line} */
function cuOpen(id, fromId, ret) {
  if (!S.db) return toast('ราคายังโหลดไม่เสร็จ');
  if (!cuCanWrite()) return alert('สร้างหรือแก้ไขวัสดุมวลรวมไม่ได้: ' + cuWhy());
  const cur = id ? cuOf(id) : null, src = fromId ? S.db.findComp(fromId) : null;
  CU.ret = cur ? null : ret || null;
  CU.ed = cur ? { id: cur.id, base: cur.updated, name: cur.name, unit: cur.unit, lines: JSON.parse(JSON.stringify(cur.lines || [])) }
    : { id: null, base: '', name: src ? src.name + ' (ปรับปรุง)' : '', unit: src ? src.unit : '', lines: src ? cuLinesFrom(src.id) : [{ name: '', qty: '', unit: '', src: 'mat' }] };
  const m = cuModal();
  $('#cu-title', m).textContent = cur ? 'แก้ไขวัสดุมวลรวม ' + cur.id : (src ? `สร้างวัสดุมวลรวมเอง (คัดลอกจาก ${src.sub || src.id})` : 'สร้างวัสดุมวลรวมเอง');
  $('#cu-err', m).textContent = '';
  document.body.appendChild(m);   // ให้อยู่บนหน้าต่างผูกราคา/หน้ารายการ
  m.classList.add('on'); cuRender();
}
function cuClose() { const m = $('#cu-modal'); if (m) m.classList.remove('on'); CU.ed = null; CU.ret = null; }
/** ราคาตัวอย่างระหว่างแก้: ใส่เป็นมวลรวมชั่วคราวแล้วคิดด้วยตัวคำนวณจริง */
function cuPreview() {
  const e = CU.ed, tid = 'U-PREVIEW', db = S.db;
  const x = Survey.compToItems({ id: tid, name: e.name, unit: e.unit, lines: e.lines });
  db.compList.push(x.comp); x.items.forEach(it => db.compItems.push(it)); Object.assign(db.matRef, x.refs);
  let r = null; try { r = db.compPrice(tid, { partial: true }); } catch (err) { /* */ }
  for (let i = db.compList.length - 1; i >= 0; i--) if (db.compList[i].id === tid) db.compList.splice(i, 1);
  for (let i = db.compItems.length - 1; i >= 0; i--) if (db.compItems[i].compId === tid) db.compItems.splice(i, 1);
  Object.keys(x.refs).forEach(k => delete db.matRef[k]);
  return r;
}
function cuRender() {
  const e = CU.ed; if (!e) return; const pv = cuPreview(), L = (pv && pv.lines) || [];
  const G = COMP_GROUPS(), others = S.db.compList.filter(c => c.id !== e.id);
  const compOpts = v => '<option value="">— เลือก —</option>' + others.map(c => `<option value="${esc(c.sub || c.id)}"${(c.sub || c.id) === v ? ' selected' : ''}>${esc((c.sub || c.id) + ' ' + c.name)} (${esc(c.unit)})</option>`).join('');
  const rows = e.lines.map((l, i) => {
    const ln = L[i] || {}, src = l.src || 'none'; let val = '';
    if (src === 'mat') { const d = S.db.material(String(l.code || '').split(',')[0].trim());
      val = `<input class="cell" data-cu="code" data-i="${i}" value="${esc(l.code || '')}" placeholder="พิมพ์ชื่อหรือรหัสเพื่อค้นหา" autocomplete="off">`
        + (d ? `<div class="hint">${esc(d.name)} · ${bqF2(d.price)} บาท/${esc(d.unit)}</div>` : '') + `<div data-cures="${i}"></div>`; }
    else if (src === 'fixed') val = `<input class="cell" type="number" step="any" min="0" data-cu="price" data-i="${i}" value="${esc(l.price ?? '')}" placeholder="บาท/${esc(l.unit || 'หน่วย')}" style="width:120px">`;
    else if (src === 'comp') val = `<select data-cu="comp" data-i="${i}" style="width:100%">${compOpts(l.comp || '')}</select>`;
    else val = '<span class="hint">เลือกราคาพาณิชย์ ราคาสืบ หรือมวลรวมอื่น ตอนใช้ใน BOQ</span>';
    const pr = ln.unitPrice !== null && ln.unitPrice !== undefined ? bqF2(ln.unitPrice) : '—', am = ln.amount !== null && ln.amount !== undefined ? bqF2(ln.amount) : '—';
    const W = ln.warnings || [];
    const warn = W.includes('unit_conversion_failed') ? `<div class="warnline">แปลงหน่วยราคาพาณิชย์เป็น ${esc(l.unit)} ไม่ได้</div>` : W.includes('sub_comp_unit_mismatch') ? '<div class="warnline">หน่วยมวลรวมไม่ตรง</div>' : '';
    return `<tr><td class="hint">${i + 1}</td>
      <td><input class="cell" data-cu="name" data-i="${i}" value="${esc(l.name || '')}" placeholder="ชื่อวัสดุ"></td>
      <td><input class="cell" type="number" step="any" min="0" data-cu="qty" data-i="${i}" value="${esc(l.qty ?? '')}" placeholder="?" style="width:80px"></td>
      <td><input class="cell" data-cu="unit" data-i="${i}" value="${esc(l.unit || '')}" placeholder="หน่วย" style="width:70px"></td>
      <td><select data-cu="src" data-i="${i}">${Object.entries(CU_SRC).map(([k, v]) => `<option value="${k}"${k === src ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
      <td style="min-width:240px">${val}${warn}</td>
      <td class="r">${pr}</td><td class="r">${am}</td>
      <td><button class="btn small danger" data-cudel="${i}" title="ลบบรรทัด">×</button></td></tr>`;
  }).join('');
  const tot = pv && pv.raw !== null && pv.raw !== undefined ? bqF2(pv.raw) : '—', miss = pv ? pv.missing.length : 0;
  $('#cu-body').innerHTML = `
    <div class="cu-head">
      <label>ชื่อวัสดุมวลรวม<input data-cuh="name" value="${esc(e.name)}"></label>
      <label>หน่วย (ราคาต่อ 1 หน่วยนี้)<input data-cuh="unit" value="${esc(e.unit)}" placeholder="เช่น ตร.ม."></label>
      <div>หมวด<div style="margin-top:8px">${esc(G['12'] || '12 งานอื่นๆ')}</div></div>
    </div>
    <div class="cu-scroll"><table class="boq cu-tbl"><thead><tr><th>#</th><th>วัสดุ</th><th>ปริมาณต่อ 1 ${esc(e.unit || 'หน่วย')}</th><th>หน่วย</th><th>ที่มาราคา</th><th>รหัส / ราคา / มวลรวม</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="7" style="text-align:right">รวมต่อ 1 ${esc(e.unit || 'หน่วย')}${miss ? ` <span class="warnline">(ยังคิดไม่ครบ ${miss} บรรทัด — ขาดราคาหรือปริมาณ)</span>` : ''}</td><td class="r"><b>${tot}</b></td><td></td></tr></tfoot></table></div>
    <div class="btn-row" style="margin-top:8px;align-items:center">
      <button class="btn small" id="cu-addln">+ เพิ่มบรรทัดวัสดุ</button>
      <span class="hint">คัดลอกบรรทัดจากมวลรวมอื่นมาต่อท้าย:</span>
      <select id="cu-copy" style="max-width:360px"><option value="">— เลือกมวลรวม —</option>${others.map(c => `<option value="${esc(c.id)}">${esc((c.sub || c.id) + ' ' + c.name)}</option>`).join('')}</select>
      <button class="btn small" id="cu-copyln">คัดลอก</button>
    </div>
    <div class="hint" style="margin-top:8px">ราคาพาณิชย์ปรับตามเดือนเอง · บรรทัดที่ "เลือกตอนใช้ใน BOQ" หรือยังไม่มีปริมาณ ใช้ใน BOQ ได้ ระบบจะให้เลือกราคา/กรอกปริมาณตอนนั้น · บันทึกแล้วทุกโครงการที่ใช้มวลรวมนี้จะเปลี่ยนตาม (ใช้ร่วมกับ UD Cost Hub)</div>`;
}
async function cuSave() {
  const e = CU.ed, err = $('#cu-err'); if (!e) return; err.textContent = '';
  const lines = e.lines.filter(l => String(l.name || '').trim()).map(l => {
    const o = { name: String(l.name).trim(), qty: l.qty === '' ? null : l.qty, unit: String(l.unit || '').trim(), src: l.src || 'none' };
    if (o.src === 'mat') o.code = String(l.code || '').trim(); if (o.src === 'fixed') o.price = l.price === '' ? null : l.price; if (o.src === 'comp') o.comp = l.comp || '';
    return o; });
  if (!String(e.name).trim() || !String(e.unit).trim()) { err.textContent = 'ต้องใส่ชื่อและหน่วยของวัสดุมวลรวม'; return; }
  if (!lines.length) { err.textContent = 'ต้องมีรายการวัสดุอย่างน้อย 1 บรรทัด'; return; }
  const btn = $('#cu-save'); btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    const c = await Survey.compPut(e.id, { name: String(e.name).trim(), unit: String(e.unit).trim(), lines, base: e.base });
    const i = CU.comps.findIndex(x => x.id === c.id); if (i >= 0) CU.comps[i] = c; else CU.comps.push(c);
    const ret = CU.ret; cuApply(); cuClose(); cuRefresh();
    toast(`บันทึก ${c.id} ${c.name} เข้าคลังกลางแล้ว`);
    if (ret && BQ.key === ret.key && BQ.side === ret.side && $('#bind-modal').classList.contains('on')) {   // สร้างจากหน้าต่างผูกราคา → ผูกแถว/บรรทัดนั้นกับรายการใหม่
      const r = bqRow(), d = S.db.findComp(c.id);
      if (r && d) { BQ.tab = 'comp'; if (ret.side === 'line') await bqPickLine(r, d); else await bqPickItem(r, d); }
    }
  } catch (x) { err.textContent = 'บันทึกไม่สำเร็จ: ' + (x && x.message || x); }
  finally { btn.disabled = false; btn.textContent = 'บันทึกเข้าคลังกลาง'; }
}
async function cuDel(id) {
  if (!cuCanDel()) return alert('ลบได้เฉพาะผู้ดูแลระบบ หรือเมื่อใช้รหัสทีม');
  const used = cuUsedBy(id), refBy = CU.comps.filter(c => c.id !== id && (c.lines || []).some(l => l.src === 'comp' && String(l.comp) === id)).map(c => c.id);
  if (!confirm(`ลบวัสดุมวลรวม ${id} ออกจากคลังกลางใช่หรือไม่\nแถวที่ผูกไว้จะเลิกผูก (กลับไปใช้การผูกอัตโนมัติ หรือขึ้น "ยังไม่มีราคา" ให้ผูกใหม่) — กู้คืนได้จากชีต comps_deleted`
    + (used.length ? `\nโครงการนี้ใช้อยู่ ${used.length} แถว: ${used.slice(0, 5).join(', ')}${used.length > 5 ? ' …' : ''}` : '')
    + (refBy.length ? `\nมวลรวมที่มีบรรทัดอ้าง ${id} อยู่: ${refBy.join(', ')} (บรรทัดนั้นจะคิดราคาไม่ได้จนกว่าจะแก้)` : ''))) return;
  try {
    await Survey.compDel(id);
    CU.comps = CU.comps.filter(x => x.id !== id); cuApply();
    const n = cuPrune(new Set([id])); cuRefresh();
    toast(`ลบ ${id} แล้ว${n ? ` · เลิกผูก ${n} จุด` : ''}`);
  } catch (x) { alert('ลบไม่สำเร็จ: ' + (x && x.message || x)); }
}

// ------------------------------------------------------------------ ปุ่มในหน้าต่างผูกราคา (แท็บวัสดุมวลรวม)
/** ปุ่มต่อท้ายแต่ละรายการในแท็บมวลรวม */
function cuItemBtns(c) {
  if (!cuCanWrite()) return c.custom ? ' <span class="pill">สร้างเอง</span>' : '';
  const b = (a, t, cls) => ` <button class="btn small ${cls || ''}" data-cuitem="${a}" data-id="${esc(c.id)}">${t}</button>`;
  return c.custom ? ' <span class="pill">สร้างเอง</span>' + b('edit', 'แก้ไข') + b('copy', 'คัดลอก') + (cuCanDel() ? b('del', 'ลบ', 'danger') : '') : b('copy', 'คัดลอกไปสร้างเอง');
}
function cuFootHtml() {
  return cuCanWrite() ? `<button class="btn small" data-cuitem="new">+ สร้างวัสดุมวลรวมเอง</button> <span class="hint">ใช้ร่วมกันทั้งทีม · บันทึกแล้วผูกรายการนี้ให้เลย</span>`
    : `<span class="hint">สร้างวัสดุมวลรวมเองได้เมื่อ${!Survey.remote() ? 'ตั้งคลังกลางแล้ว' : 'เข้าสู่ระบบด้วยบัญชีที่อนุมัติแล้ว (หรือรหัสทีม)'}</span>`;
}
/** คลิกปุ่มมวลรวมสร้างเองในหน้าต่างผูกราคา → true = จัดการแล้ว */
function cuBindClick(e) {
  const a = e.target.closest('[data-cuitem]'); if (!a) return false;
  e.stopPropagation();
  const ret = { key: BQ.key, side: BQ.side }, id = a.dataset.id || null;
  if (a.dataset.cuitem === 'new') cuOpen(null, null, ret);
  else if (a.dataset.cuitem === 'copy') cuOpen(null, id, ret);
  else if (a.dataset.cuitem === 'edit') cuOpen(id, null, null);
  else if (a.dataset.cuitem === 'del') cuDel(id);
  return true;
}
