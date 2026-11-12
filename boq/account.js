/* บัญชีผู้ใช้ + โมเดลในบัญชี (ล็อกอินชุดเดียวกับ UD Cost Hub — ดู lib/auth.js) */
(function () {
  const box = () => document.getElementById('acct-body');
  let st = { ready: false }, fail = false, rows = null, busy = '', msg = '', delAsk = '';
  const ROLE = { admin: 'ผู้ดูแลระบบ', editor: 'แก้ไขได้', viewer: 'ดูอย่างเดียว' };
  const approved = () => !!(st.user && st.access && st.access.status === 'approved');
  const store = () => window.UDAuth.store('models');
  const mid = name => 'bm_' + String(name || 'model').replace(/[\/\s.#$\[\]]+/g, '_').slice(0, 180);
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';
  const when = t => { try { return new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  async function reload() { try { rows = (await store().list()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); } catch (e) { rows = []; msg = 'อ่านรายการโมเดลในบัญชีไม่ได้: ' + (e.message || e); } render(); }
  function render() {
    const el = box(); if (!el) return;
    if (fail) { el.innerHTML = '<div class="hint">โหลดระบบล็อกอินไม่ได้ (ตรวจการเชื่อมต่ออินเทอร์เน็ต) — ยังเปิดไฟล์จากเครื่องได้ตามปกติ</div>'; return; }
    if (!st.ready) { el.innerHTML = '<div class="hint">กำลังตรวจสอบบัญชี…</div>'; return; }
    if (!st.user) { el.innerHTML = '<p class="hint">ล็อกอินด้วยบัญชี Google (บัญชีและการอนุมัติชุดเดียวกับ UD Cost Hub) เพื่อเก็บไฟล์โมเดลไว้ในบัญชี เปิดได้จากทุกเครื่อง</p><div class="btn-row"><button class="btn primary" id="ac-in">เข้าสู่ระบบด้วย Google</button></div>' + (st.error ? `<div class="status">${esc(st.error)}</div>` : ''); document.getElementById('ac-in').onclick = () => UDAuth.signIn(); return; }
    const a = st.access || {}, ok = approved();
    let h = `<div class="btn-row" style="align-items:center"><b>${esc((st.profile && st.profile.name) || st.user.name || st.user.email)}</b><span class="pill">${ok ? 'อนุมัติแล้ว · ' + (ROLE[a.role] || a.role || '') : a.status === 'revoked' ? 'ถูกระงับสิทธิ์' : 'รอผู้ดูแลระบบอนุมัติ'}</span><button class="btn small ghost" id="ac-out">ออกจากระบบ</button></div>`;
    if (!ok) h += '<p class="hint">บัญชีนี้ยังบันทึกโมเดลลงบัญชีไม่ได้จนกว่าผู้ดูแลระบบจะอนุมัติ (อนุมัติที่หน้าจัดการผู้ใช้ของ UD Cost Hub)</p>';
    h += `<div class="btn-row" style="margin-top:8px"><button class="btn" id="ac-save" ${ok && S.model && !busy ? '' : 'disabled'}>บันทึกโมเดลที่เปิดอยู่ลงบัญชี</button><button class="btn small ghost" id="ac-ref">รีเฟรชรายการ</button></div>`;
    if (busy) h += `<div class="hint">${esc(busy)}</div>`;
    if (msg) h += `<div class="status">${esc(msg)}</div>`;
    if (rows === null) h += '<div class="hint">กำลังอ่านรายการ…</div>';
    else if (!rows.length) h += '<div class="hint">ยังไม่มีโมเดลในบัญชี</div>';
    else h += '<table class="boq" style="margin-top:8px;width:100%"><thead><tr><th style="text-align:left">ไฟล์โมเดล</th><th>ขนาด</th><th>บันทึกเมื่อ</th><th></th></tr></thead><tbody>' + rows.map(r =>
      `<tr><td>${esc(r.name || r.id)}</td><td style="text-align:right">${kb(r.bytes || 0)}</td><td>${esc(when(r.updatedAt))}</td><td style="white-space:nowrap"><button class="btn small primary" data-ac-open="${esc(r.id)}">เปิด</button> ` +
      (delAsk === r.id ? `<button class="btn small" data-ac-del2="${esc(r.id)}">ยืนยันลบ</button> <button class="btn small ghost" data-ac-no="1">ยกเลิก</button>` : `<button class="btn small ghost" data-ac-del="${esc(r.id)}">ลบ</button>`) + '</td></tr>').join('') + '</tbody></table>';
    el.innerHTML = h;
    document.getElementById('ac-out').onclick = () => UDAuth.signOut();
    document.getElementById('ac-ref').onclick = () => { msg = ''; rows = null; render(); reload(); };
    document.getElementById('ac-save').onclick = save;
    el.querySelectorAll('[data-ac-open]').forEach(b => b.onclick = () => open(b.dataset.acOpen));
    el.querySelectorAll('[data-ac-del]').forEach(b => b.onclick = () => { delAsk = b.dataset.acDel; render(); });
    el.querySelectorAll('[data-ac-no]').forEach(b => b.onclick = () => { delAsk = ''; render(); });
    el.querySelectorAll('[data-ac-del2]').forEach(b => b.onclick = () => del(b.dataset.acDel2));
  }
  async function save() {
    if (!S.model || !approved()) return;
    const name = S.modelName || 'model.bm.json', id = mid(name), old = (rows || []).find(r => r.id === id);
    busy = 'กำลังบันทึก ' + name + ' …'; msg = ''; render();
    try { await store().put(id, { name, updatedAt: Date.now(), json: S.modelJson || JSON.stringify(S.model) }, old && old.n); msg = (old ? 'บันทึกทับ ' : 'บันทึก ') + name + ' ลงบัญชีแล้ว'; }
    catch (e) { msg = 'บันทึกไม่สำเร็จ: ' + (e.message || e); }
    busy = ''; await reload();
  }
  async function open(id) {
    busy = 'กำลังเปิดจากบัญชี…'; msg = ''; render();
    try { const o = await store().get(id); if (!o || !o.json) throw new Error('ไม่พบข้อมูลโมเดล'); loadModel(o.json, o.name || id); toast('เปิดโมเดลจากบัญชีแล้ว'); msg = 'เปิด ' + (o.name || id) + ' จากบัญชีแล้ว'; }
    catch (e) { msg = 'เปิดไม่สำเร็จ: ' + (e.message || e); }
    busy = ''; render();
  }
  async function del(id) {
    const r = (rows || []).find(x => x.id === id); delAsk = ''; busy = 'กำลังลบ…'; render();
    try { await store().del(id, r && r.n); msg = 'ลบ ' + ((r && r.name) || id) + ' ออกจากบัญชีแล้ว (ไฟล์ในเครื่องไม่ถูกลบ)'; } catch (e) { msg = 'ลบไม่สำเร็จ: ' + (e.message || e); }
    busy = ''; await reload();
  }
  function onState(s) { const was = st.user && st.user.uid; st = s; if (s.user && s.user.uid !== was) { rows = null; render(); reload(); } else { if (!s.user) rows = null; render(); } }
  const hook = () => { if (window.UDAuth) UDAuth.on(onState); };
  window.acctFail = () => { fail = true; render(); };
  window.acctRender = render;
  if (window.UDAuth) hook(); else window.addEventListener('udauth-loaded', hook);
  document.addEventListener('DOMContentLoaded', render); render();
})();
