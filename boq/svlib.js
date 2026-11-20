/* UD Total Station — หน้ารายการคลังราคาสืบ (M2 ก้อน 5c · ตาม UD Cost Hub)
 * ดูทุกรายการในคลัง (คลังกลาง หรือในเครื่องเมื่อไม่ได้เชื่อม) · ค้น/กรองชนิด · ดูรายที่สืบ ชื่ออื่น
 * ลบจากคลังกลาง (ผู้ดูแลระบบ หรือใช้รหัสทีม — สคริปต์ย้ายไปชีต deleted กู้คืนได้) · ลบสำเนาในเครื่อง
 * หารายการซ้ำ → รวมเข้าต้นฉบับ (ตรรกะใน survey.js: libDupFind / libDupMerge ใช้ร่วม Cost Hub) */
const LV = { q: '', cat: 'all', open: null, view: 'list', items: [], pend: new Set(), dup: [], busy: false };

/** ลบจากคลังกลางได้: เชื่อมคลังกลางแล้ว และใช้รหัสทีม หรือบัญชีเป็นผู้ดูแลระบบ (ตรง svCanDel ของ Cost Hub) */
const lvCanDel = () => S.libMode === 'central' && (!!Survey.cfg().team || !!(S.libWho && S.libWho.role === 'admin'));
const lvCentral = () => Survey.remote() && ['central', 'pending', 'public'].includes(S.libMode);

function lvModal() {
  let m = $('#lv-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'lv-modal'; m.className = 'modal'; document.body.appendChild(m);
    m.addEventListener('click', lvClick); m.addEventListener('input', e => { if (e.target.id === 'lv-q') { LV.q = e.target.value; lvList(); } });
  }
  return m;
}
async function svLibOpen() {
  const m = lvModal(); LV.view = 'list'; LV.open = null;
  m.innerHTML = `<div class="modal-box glass lv-box"><div class="side-top"><h2 style="margin:0">คลังราคาสืบ</h2><button class="btn small" data-close="1">×</button></div><div id="lv-body"><div class="hint">กำลังโหลดคลัง…</div></div></div>`;
  m.classList.add('on');
  await lvLoad(); lvRender();
}
async function lvLoad(force) {
  LV.items = (await Survey.libAll(force)) || [];
  LV.pend = new Set((await svPendingList()).map(x => x.key));
  if (lvCentral()) {   // รายการที่สืบในเครื่องนี้แต่ยังไม่ขึ้นคลังกลาง แสดงต่อท้าย (ป้าย "ในเครื่อง")
    const have = new Set(LV.items.map(x => x.key));
    ((await Survey.localAll()) || []).filter(x => LV.pend.has(x.key) && !have.has(x.key)).forEach(x => LV.items.push(Object.assign({ _local: true }, x)));
  }
}
/** แถวในโครงการนี้ที่ใช้รายการคลัง key (ผูกไว้ หรือชื่อ+หน่วยตรง) */
function lvUsedBy(x) {
  return Object.values((S.boq && S.boq.surveys) || {}).filter(it => it.lib === x.key || (!it.lib && Survey.libKey(it.name, it.unit) === x.key));
}
function lvRender() {
  const b = $('#lv-body'); if (!b) return;
  const src = !Survey.remote() ? 'คลังในเครื่องนี้ (ยังไม่ได้ตั้งคลังกลาง)' : S.libMode === 'offline' ? 'สำเนาในเครื่อง (ติดต่อคลังกลางไม่ได้)' : S.libMode === 'public' ? 'คลังกลาง — มุมมองสาธารณะ (ไม่เห็นชื่อร้าน/ติดต่อ/ภาพ)' : 'คลังกลาง';
  if (LV.view === 'dup') { lvDupRender(b); return; }
  b.innerHTML = `<div class="lv-tools">
      <input id="lv-q" placeholder="ค้นชื่อรายการ / ชื่ออื่น / หน่วย" value="${esc(LV.q)}" autocomplete="off">
      <div class="chips">${[['all', 'ทั้งหมด']].concat(Object.entries(SV_CATS)).map(([k, v]) => `<button class="chip ${LV.cat === k ? 'on' : ''}" data-lvcat="${k}">${v}</button>`).join('')}</div>
      <button class="btn small" data-lvact="reload">โหลดใหม่</button>
      ${lvCanDel() ? '<button class="btn small" data-lvact="dup">หารายการซ้ำ</button>' : ''}
    </div>
    <div class="hint" id="lv-src">${esc(src)}${lvCanDel() ? ' · คุณลบรายการจากคลังกลางได้ (กู้คืนได้จากชีต deleted)' : S.libMode === 'central' ? ' · ลบจากคลังกลางได้เฉพาะผู้ดูแลระบบ' : ''}</div>
    <div id="lv-list"></div>`;
  lvList();
}
function lvList() {
  const el = $('#lv-list'); if (!el) return;
  const nq = Survey.normName(LV.q);
  const rows = LV.items.filter(x => (LV.cat === 'all' || libCat(x) === LV.cat)
    && (!nq || Survey.normName(x.name).includes(nq) || Survey.normName(x.unit).includes(nq) || (x.aliases || []).some(a => Survey.normName(a).includes(nq))))
    .sort((a, b) => a.name.localeCompare(b.name, 'th') || a.unit.localeCompare(b.unit, 'th'));
  const cnt = c => LV.items.filter(x => c === 'all' || libCat(x) === c).length;
  document.querySelectorAll('[data-lvcat]').forEach(bt => { const k = bt.dataset.lvcat; bt.textContent = (k === 'all' ? 'ทั้งหมด' : SV_CATS[k]) + ' ' + cnt(k); });
  if (!rows.length) { el.innerHTML = `<div class="hint" style="padding:18px;text-align:center">${LV.items.length ? 'ไม่พบรายการที่ค้น' : 'คลังยังว่าง'}</div>`; return; }
  el.innerHTML = `<table class="lv-tbl"><thead><tr><th>รายการ</th><th>หน่วย</th><th>ชนิด</th><th class="r">ราคาต่ำสุด</th><th class="r">ราย</th><th>อัปเดต</th><th></th></tr></thead><tbody>${rows.map(lvRow).join('')}</tbody></table>
    <div class="hint">${rows.length} รายการ</div>`;
}
function lvRow(x) {
  const s = Survey.summary(x), used = lvUsedBy(x), open = LV.open === x.key;
  const tags = [x._local ? '<span class="pill warn">ในเครื่อง — ยังไม่ขึ้นคลังกลาง</span>' : LV.pend.has(x.key) ? '<span class="pill warn">ในเครื่องใหม่กว่า</span>' : '',
    used.length ? `<span class="pill">ใช้ในโครงการนี้${used.length > 1 ? ' ' + used.length + ' แถว' : ''}</span>` : '',
    (x.aliases || []).length ? `<span class="pill" title="ชื่ออื่นที่ผูกไว้">+${x.aliases.length} ชื่อ</span>` : ''].join('');
  let h = `<tr class="lv-row ${open ? 'open' : ''}" data-lvk="${esc(x.key)}"><td>${esc(x.name)} ${tags}</td><td>${esc(x.unit)}</td><td>${SV_CATS[libCat(x)]}</td>
    <td class="r">${s.price === null ? '—' : fmt(s.price)}</td><td class="r ${s.status === 'ok' ? '' : 'warn'}">${s.n}</td><td>${esc(String(x.updated || '').slice(0, 10))}</td>
    <td class="r">${lvDelBtn(x)}</td></tr>`;
  if (open) {
    const q = s.list.slice().sort((a, b) => a.up - b.up).map(o => `<tr><td>${esc(o.q.shop || (Survey.CHANNEL[o.q.channel] || ''))}</td><td>${esc(Survey.CHANNEL[o.q.channel] || '')}</td><td>${esc(o.q.date || '')}</td><td class="r">${fmt(o.up)}</td><td>${esc(o.q.note || '')}</td></tr>`).join('');
    const al = (x.aliases || []).map(a => esc(String(a).replace('|', ' [') + ']')).join(' · ');
    h += `<tr class="lv-det"><td colspan="7">
      ${q ? `<table class="lv-q"><thead><tr><th>ร้าน/แหล่ง</th><th>ช่องทาง</th><th>วันที่</th><th class="r">ราคา/หน่วย (ไม่รวม VAT)</th><th>หมายเหตุ</th></tr></thead><tbody>${q}</tbody></table>` : '<div class="hint">ยังไม่มีรายที่กรอกราคาครบ</div>'}
      <div class="hint">${x.project ? 'โครงการที่สืบ: ' + esc(x.project) + ' · ' : ''}${x.by ? 'ผู้บันทึก: ' + esc(x.by) + ' · ' : ''}${x.ref ? 'อ้างอิง: ' + esc(x.ref) + ' · ' : ''}${al ? 'ชื่ออื่น: ' + al : ''}</div>
      ${used.length ? `<div class="hint">ใช้ในโครงการนี้: ${used.map(it => esc(it.name)).join(' · ')}</div>` : ''}</td></tr>`;
  }
  return h;
}
function lvDelBtn(x) {
  if (x._local) return '<button class="btn small" data-lvdel="local">ลบในเครื่อง</button>';
  if (lvCanDel()) return '<button class="btn small lv-del" data-lvdel="central">ลบ</button>';
  if (!lvCentral()) return '<button class="btn small" data-lvdel="local">ลบ</button>';   // คลังในเครื่อง/ออฟไลน์
  return '';
}
async function lvDel(x, how) {
  const used = lvUsedBy(x);
  const warnUse = used.length ? `\n\nโครงการนี้ใช้อยู่ ${used.length} แถว — ราคาในโครงการยังอยู่ แต่จะเลิกผูกกับคลัง (ถ้าแก้ราคาในโครงการภายหลังจะบันทึกเป็นรายการใหม่)` : '';
  const msg = how === 'central' ? `ลบ "${x.name}" [${x.unit}] ออกจากคลังกลาง?\nทุกคน (ทั้ง Cost Hub และ Total Station) จะไม่เห็นรายการนี้อีก · กู้คืนได้จากชีต deleted · โครงการที่เคยใช้ยังเก็บราคาของตัวเองไว้`
    : `ลบ "${x.name}" [${x.unit}] ออกจากคลังในเครื่องนี้?${Survey.remote() ? '\n(คลังกลางไม่ถูกลบ)' : ''}`;
  if (!confirm(msg + warnUse)) return;
  try { if (how === 'central') await Survey.libRemove(x.key); else await Survey.libDel(x.key); }
  catch (er) { toast('ลบไม่สำเร็จ: ' + er.message); return; }
  if (used.length) { used.forEach(it => { delete it.lib; delete it.libName; delete it.libUnit; delete it.libRef; delete it.libConv; }); autosave(); renderSurvey(); }
  LV.items = LV.items.filter(y => y !== x); LV.open = null; lvList();
  if (typeof BQ !== 'undefined') BQ.lib = null;
  toast(how === 'central' ? 'ลบออกจากคลังกลางแล้ว' : 'ลบสำเนาในเครื่องแล้ว');
  svMode(true);
}

/* ---------- หารายการซ้ำ (ตรง Cost Hub svDupOpen/svDupGo) ---------- */
function lvDupRender(b) {
  const cen = LV.items.filter(x => !x._local);
  LV.dup = Survey.libDupFind(cen);
  const L = LV.dup;
  b.innerHTML = `<div class="btn-row"><button class="btn small" data-lvact="back">← กลับรายการคลัง</button></div>
    <p class="hint">รายการซ้ำ = สำเนาที่ Total Station รุ่นก่อน 6.51 คัดลอกจากรายการอื่นมาเป็นรายการใหม่ตามชื่อแถว BOQ · รวมแล้ว: ชื่อซ้ำถูกจำเป็น "ชื่ออื่น" ของต้นฉบับ รายที่สืบเพิ่มเองย้ายไปต้นฉบับ แล้วลบตัวซ้ำ (กู้คืนได้จากชีต deleted)</p>
    ${!L.length ? '<div class="hint" style="padding:18px;text-align:center">ไม่พบรายการซ้ำ</div>' : `<table class="lv-tbl"><thead><tr><th style="width:28px"></th><th>รายการซ้ำ (จะลบ)</th><th>ต้นฉบับ (เก็บไว้)</th><th>หมายเหตุ</th></tr></thead><tbody>${L.map((d, i) => {
      const own = (d.x.quotes || []).filter(q => +q.price > 0 && !/จากคลัง/.test(q.note || '')).length, ok = d.o.sameUnit || d.o.how === 'copy';
      const note = [d.o.how === 'partial' ? 'สืบเพิ่มเอง ' + own + ' ราย — ย้ายไปที่ต้นฉบับ' : 'คัดลอกมาทั้งหมด', d.o.sameUnit ? '' : 'หน่วยต่างกัน' + (d.o.how === 'partial' ? ' — ตรวจเอง' : '')].filter(Boolean).join(' · ');
      return `<tr><td><input type="checkbox" data-dup="${i}"${ok ? '' : ' disabled'}${ok && d.o.sameUnit && d.o.how === 'copy' ? ' checked' : ''}></td>
        <td>${esc(d.x.name)} <span class="hint">[${esc(d.x.unit)}] · ${(d.x.quotes || []).length} ราย${d.x.project ? ' · ' + esc(d.x.project) : ''}</span></td>
        <td>${esc(d.o.orig.name)} <span class="hint">[${esc(d.o.orig.unit)}] · ${(d.o.orig.quotes || []).length} ราย</span></td>
        <td class="${d.o.sameUnit && d.o.how === 'copy' ? 'hint' : 'warn'}">${esc(note)}</td></tr>`;
    }).join('')}</tbody></table>
    <div class="btn-row"><button class="btn small primary" data-lvact="dupgo">รวมรายการที่เลือกเข้าต้นฉบับ</button></div>`}
    <div class="hint" id="lv-dupmsg"></div>`;
}
async function lvDupGo() {
  const pick = [...document.querySelectorAll('#lv-body [data-dup]:checked')].map(c => LV.dup[+c.dataset.dup]);
  const msg = t => { const e = $('#lv-dupmsg'); if (e) e.textContent = t; };
  if (!pick.length) { msg('ยังไม่ได้เลือกรายการ'); return; }
  if (!confirm('รวม ' + pick.length + ' รายการเข้าต้นฉบับ แล้วลบรายการซ้ำออกจากคลังกลาง?\n(กู้คืนได้จากชีต deleted)')) return;
  LV.busy = true; let ok = 0, bad = 0, last = '';
  for (const d of pick) {
    msg('กำลังรวม ' + (ok + bad + 1) + '/' + pick.length + ' — ' + d.x.name);
    try { await Survey.libDupMerge(d); ok++; } catch (er) { bad++; last = er.message; }
  }
  LV.busy = false;
  const done = bad ? `รวมสำเร็จ ${ok} · ไม่สำเร็จ ${bad} (${last})` : `รวมแล้ว ${ok} รายการ`;
  await lvLoad(true); lvRender(); msg(done);
  if (typeof BQ !== 'undefined') BQ.lib = null;
  await svRelink(); renderSurvey();
}

function lvClick(e) {
  const m = $('#lv-modal'), t = e.target;
  if (t === m || t.dataset.close) { if (!LV.busy) m.classList.remove('on'); return; }
  if (t.dataset.lvcat) { LV.cat = t.dataset.lvcat; document.querySelectorAll('[data-lvcat]').forEach(b => b.classList.toggle('on', b === t)); lvList(); return; }
  const a = t.dataset.lvact;
  if (a === 'reload') { $('#lv-list').innerHTML = '<div class="hint">กำลังโหลด…</div>'; svMode(true).then(() => lvLoad(true)).then(lvRender); return; }
  if (a === 'dup') { LV.view = 'dup'; lvRender(); return; }
  if (a === 'back') { LV.view = 'list'; lvRender(); return; }
  if (a === 'dupgo') { if (!LV.busy) lvDupGo(); return; }
  const row = t.closest('[data-lvk]'); if (!row) return;
  const x = LV.items.find(y => y.key === row.dataset.lvk); if (!x) return;
  if (t.dataset.lvdel) { lvDel(x, t.dataset.lvdel); return; }
  LV.open = LV.open === x.key ? null : x.key; lvList();
}
