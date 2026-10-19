/* UD Total Station — โมเดล 3D ราคากลางงานอาคาร 2569 แผนงาน
 * อ่าน .bm.json (quantities จาก tools/takeoff.py) → ราคาจาก UD-Cost Hub (UDPrice) → ปร.1 / ปร.2 / ปร.3 / ปร.1(ก) / ปร.4
 * งานของผู้ใช้ (ราคาที่แก้, รายการเพิ่ม, ปร.2, ปร.3, ราคาสืบ, เงื่อนไข Factor F) เก็บใน .boq.json แยกจากโมเดล
 */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const r2 = BoqCalc.r2;
const fmt = (x, d = 2) => (x === null || x === undefined || x === '') ? '' :
  Number(x).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECTIONS = [
  ['1.1', 'งานโครงสร้างวิศวกรรม'], ['1.2', 'งานสถาปัตยกรรม'], ['1.3', 'งานระบบประปา สุขาภิบาล และป้องกันอัคคีภัย'],
  ['1.4', 'งานระบบไฟฟ้าและสื่อสาร'], ['1.5', 'งานระบบปรับอากาศ ระบายอากาศ ลิฟต์โดยสาร และงานระบบพิเศษอื่น ๆ'],
];
const sectionOf = code => { const s = SECTIONS.find(([c]) => code === c || code.startsWith(c + '.')); return s ? s[0] : '1.2'; };

const S = {
  db: null, baseCompItems: null, model: null, modelName: '', viewer: null, priced: [], selKey: null,
  boq: newBoq(),
};
function newBoq() {
  return { format: 'ud-boq', version: 1, project: {}, factor: { advance: 0, retention: 0, loanPct: 0 },
    overrides: {}, survey: {}, surveys: {}, subSkip: {}, custom_rows: [], pr2: [], pr3: [], plan: newPlan(), model_file: '', saved_at: '' };
}
/** คำเรียกตามประเภทงาน: กำหนดราคากลาง → ราคากลาง · ประมาณราคา → ราคาประมาณการ */
const RG = () => (S.boq && S.boq.project && S.boq.project.mode === 'estimate' ? 'ราคาประมาณการ' : 'ราคากลาง');
function newPlan() { return { start: '', workdays: [1, 2, 3, 4, 5, 6], holidays: [], durations: {}, inst: { n: 4, mode: 'auto', assign: {} } }; }

// ------------------------------------------------------------------ util
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function readFile(input) {
  return new Promise((res, rej) => { const f = input.files[0]; if (!f) return rej(); const r = new FileReader();
    r.onload = () => res({ name: f.name, text: r.result }); r.onerror = rej; r.readAsText(f, 'utf-8'); });
}
// ภาพหลักฐานราคาสืบเก็บใน S.img (หน่วยความจำ) + IndexedDB; localStorage เก็บเฉพาะตัวเลข (ไม่พอสำหรับภาพ)
function autosave() { try { if (S.modelName) localStorage.setItem('udboq:' + S.modelName, JSON.stringify(Object.assign({}, S.boq, { svimg: undefined }))); } catch (e) { /* ไม่มี storage */ } }
S.img = {};
async function restoreImgs() {
  const ids = Object.values(S.boq.surveys || {}).flatMap(it => (it.quotes || []).flatMap(q => q.imgs || [])).filter(id => !S.img[id]);
  for (const id of ids) { const d = await Survey.imgGet(id); if (d) S.img[id] = d; }
  if (ids.length) renderSurvey();
}
function migrateSurvey() {   // ราคาสืบรุ่นเดิม {รหัส: ราคา} → รายการราคาสืบ
  const old = S.boq.survey || {}; S.boq.surveys = S.boq.surveys || {};
  Object.entries(old).forEach(([code, p]) => {
    const id = 'sub:' + code; if (S.boq.surveys[id] || p === '' || p === null) return;
    const r = S.db && S.db.matRef[code];
    S.boq.surveys[id] = { id, name: r ? r.name : code, unit: r ? r.unit : '', target: id, quotes: [{ id: Survey.uid('q'), channel: 'store', shop: '(ราคาที่กรอกไว้เดิม)', price: +p, factor: 1, vat: false, imgs: [] }] };
  });
  S.boq.survey = {};
}

// ------------------------------------------------------------------ ราคา
async function loadPrices() {
  try { S.pmap = (await (await fetch('../tools/price_map.json', { cache: 'no-cache' })).json()).map; } catch (e) { S.pmap = null; }
  try {
    S.db = await UDPrice.load();
    S.baseCompItems = S.db.compItems.slice();
    applySurvey();
    $('#meta-price').textContent = `ราคาพาณิชย์ ${S.db.period || ''} · ค่าแรง ว480 ${S.db.wages.length} รายการ`;
    bootDone(`UD-Cost Hub OK · ${S.db.wages.length} wage items`);
  } catch (e) {
    $('#meta-price').textContent = 'โหลดราคาไม่สำเร็จ: ' + e.message;
    bootDone('ERROR: ' + e.message);
  }
  renderAll();
}
// วัสดุย่อยในวัสดุมวลรวม: มีรหัสวัสดุ → sub:<รหัส> · ไม่มีรหัส (เช่น ไม้อัดดำ) → subn:<ชื่อ|หน่วย>
const subKey = it => it.itemCode ? 'sub:' + it.itemCode : 'subn:' + String(it.itemName || '').replace(/\s+/g, ' ').trim() + '|' + (it.unit || '');
function hasCommerce(it) { return !!S.db.resolveMat(it).matItem; }
function applySurvey() {
  if (!S.db) return;
  migrateSurvey();
  const sv = {}; Object.values(S.boq.surveys || {}).forEach(it => { if (it.target && /^subn?:/.test(it.target)) { const p = Survey.summary(it).price; if (p !== null) sv[it.target] = p; } });
  S.db.compItems = S.baseCompItems.map(it => {
    const k = subKey(it), skip = S.boq.subSkip && S.boq.subSkip[k];
    if (skip && it.fixedPrice === null && !hasCommerce(it)) return Object.assign({}, it, { fixedPrice: 0, skipped: true });   // ผู้ใช้เลือกไม่คิดราคาวัสดุย่อยนี้
    const p = sv[k];
    return (p !== undefined && p !== '' && it.fixedPrice === null && !hasCommerce(it)) ? Object.assign({}, it, { fixedPrice: +p, surveyed: true }) : it;
  });
}

// ------------------------------------------------------------------ โมเดล
function loadModel(json, name) {
  const m = JSON.parse(json);
  if (!m.schema_version || !m.meta) throw new Error('ไม่ใช่ไฟล์ .bm.json');
  S.model = m; S.modelName = name;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('udboq:' + name) || 'null'); } catch (e) { /* */ }
  S.boq = saved && saved.format === 'ud-boq' ? Object.assign(newBoq(), saved) : newBoq();
  S.boq.plan = Object.assign(newPlan(), S.boq.plan || {});
  if (name === 'sample-building.bm.json' && S.boq.factor && +S.boq.factor.advance === 15 && +S.boq.factor.retention === 10) S.boq.factor = { advance: 0, retention: 0, loanPct: 0 };   // ค่าเริ่มต้นเดิมของตัวอย่าง → 0
  S.boq.model_file = name;
  const p = S.boq.project;
  p.name = p.name || m.meta.name || '';
  p.location = p.location || [m.meta.district, m.meta.province].filter(Boolean).join(' ');
  p.agency = p.agency || m.meta.agency || m.meta.owner || '';
  p.calc_date = p.calc_date || new Date().toISOString().slice(0, 10);
  if (!p.area) {
    const sl = (m.slabs || []).reduce((a, s) => a + polyArea(s.polygon), 0);
    if (sl) p.area = r2(sl);
  }
  $('#meta-proj').textContent = p.name; restoreImgs();
  $('#file-status').innerHTML = `เปิด <b>${esc(name)}</b>${saved ? ' · ดึงงาน BOQ ที่บันทึกไว้ในเบราว์เซอร์นี้' : ''}`;
  if (typeof dsgOnLoad === 'function' && dsgOnLoad()) return;   // ใส่ผลออกแบบที่เคยเขียนแล้ว render ให้เอง
  if (S.viewer) buildLayers(S.viewer.load(m)); else renderClash();
  renderAll();
}
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }

function rows() {   // ผูกราคาตอนเปิด (lib/pricemap.js + tools/price_map.json) — ไม่ต้องถอดปริมาณใหม่เมื่อแก้การผูก
  const q = (S.model && S.model.quantities && S.model.quantities.items) || [];
  return PriceMap.bindAll(q, S.pmap).concat(S.boq.custom_rows || []);
}

// ------------------------------------------------------------------ render
function renderAll() {
  renderProject(); renderSurvey(); renderPR1(); renderPR23(); renderSummary(); renderPlan(); if (S.old) setTimeout(renderDiff, 0);
  if (typeof renderDesign === 'function') renderDesign();
}

// ผู้ลงนาม: ประมาณราคา = ผู้ประมาณราคา 1 คน · กำหนดราคากลาง = คณะกรรมการ ≥ 3 คน มีประธาน 1 คนเสมอ (ตกลงกับ Earth 18 ต.ค. 2569)
function people() {
  const p = S.boq.project; p.mode = p.mode || 'estimate';
  let L = p.people || [];
  if (p.mode === 'estimate') { const e = L.find(x => x.role === 'ผู้ประมาณราคา') || L[0] || {}; L = [{ role: 'ผู้ประมาณราคา', name: e.name || '', pos: e.pos || '' }]; }
  else {
    const ch = L.find(x => x.role === 'ประธานกรรมการ') || (L[0] && L[0].role === 'ผู้ประมาณราคา' ? L[0] : null) || {};
    const mem = L.filter(x => x.role === 'กรรมการ');
    while (mem.length < 2) mem.push({ role: 'กรรมการ', name: '', pos: '' });
    L = [{ role: 'ประธานกรรมการ', name: ch.name || '', pos: ch.pos || '' }].concat(mem);
  }
  p.people = L; return L;
}
function renderPeople() {
  const p = S.boq.project, L = people(), est = p.mode === 'estimate';
  if ($('#lbl-calc')) $('#lbl-calc').textContent = `คำนวณ${RG()}เมื่อวันที่`;
  $('#people-title').textContent = est ? 'ผู้ประมาณราคา' : `คณะกรรมการกำหนดราคากลาง (${L.length} คน)`;
  $('#people').innerHTML = L.map((x, i) => `<div class="ppl-row"><span class="ppl-role">${x.role}</span><input data-pp="${i}" data-pf="name" placeholder="ชื่อ-สกุล" value="${esc(x.name)}"><input data-pp="${i}" data-pf="pos" placeholder="ตำแหน่ง" value="${esc(x.pos)}">${!est && i >= 3 ? `<button class="btn small" data-ppdel="${i}">ลบ</button>` : ''}</div>`).join('') +
    (est ? '' : `<button class="btn small" id="pp-add">+ เพิ่มกรรมการ</button>`);
  $$('#people [data-pp]').forEach(el => el.onchange = () => { L[+el.dataset.pp][el.dataset.pf] = el.value; autosave(); renderSummary(); });
  $$('#people [data-ppdel]').forEach(b => b.onclick = () => { L.splice(+b.dataset.ppdel, 1); autosave(); renderPeople(); renderSummary(); });
  const add = $('#pp-add'); if (add) add.onclick = () => { L.push({ role: 'กรรมการ', name: '', pos: '' }); autosave(); renderPeople(); };
}
function sigHtml() {   // ส่วนลงนามท้ายแบบฟอร์ม (หน้าตาจริงรอแบบฟอร์มหน่วยงาน)
  const L = people(), est = S.boq.project.mode === 'estimate';
  return `<div class="sig">${L.map(x => `<div class="sig-b"><div>ลงชื่อ ......................................... ${est ? 'ผู้ประมาณราคา' : x.role}</div><div>(${esc(x.name || '.........................................')})</div><div>${esc(x.pos || 'ตำแหน่ง .........................................')}</div></div>`).join('')}</div>`;
}
function renderProject() {
  $$('#proj-form [data-k]').forEach(el => { el.value = S.boq.project[el.dataset.k] ?? (el.dataset.k === 'mode' ? 'estimate' : ''); });
  renderPeople();
  $('#ff-adv').value = S.boq.factor.advance; $('#ff-ret').value = S.boq.factor.retention; $('#ff-loan').value = S.boq.factor.loanPct;
  $('#ff-src').textContent = FactorF.SOURCE;
  const m = S.model, box = $('#model-check');
  if (!m) { box.textContent = 'ยังไม่ได้เปิดโมเดล'; return; }
  const q = m.quantities || {};
  const cnt = k => (m[k] || []).length;
  const notes = (q.notes || []).map(n => `<li>${esc(n)}</li>`).join('');
  const assumed = [];
  ['materials', 'sections', 'members', 'supports', 'slabs', 'walls'].forEach(k => (m[k] || []).forEach(e => { if (e.status === 'assumed' || e.status === 'missing') assumed.push(`${e.id} (${e.status})`); }));
  box.innerHTML = `<div class="kv">
    <b>ชิ้นส่วน</b><span>เสา/คาน ${cnt('members')} · ฐานราก ${cnt('supports')} · พื้น ${cnt('slabs')} · ผนัง ${cnt('walls')} · หลังคา ${cnt('roofs')}</span>
    <b>ปริมาณ</b><span>${q.items ? q.items.length + ' รายการ จาก ' + esc(q.generated_by || '') : '<span class="pill err">ยังไม่มี quantities — รัน tools/takeoff.py --write</span>'}
      ${q.stale ? '<span class="pill err">ปริมาณเก่า (โมเดลเปลี่ยนหลังถอด)</span>' : q.items ? '<span class="pill ok">ตรงกับโมเดลตอนถอด</span>' : ''}</span>
    <b>ค่าสมมติ</b><span>${assumed.length ? assumed.map(a => `<span class="pill warn">${esc(a)}</span>`).join('') : '—'}</span>
  </div>${notes ? `<details style="margin-top:8px"><summary class="hint">ข้อสมมติจากตัวถอดปริมาณ (${(q.notes || []).length})</summary><ul class="hint" style="margin:6px 0 0 18px">${notes}</ul></details>` : ''}`;
}

function renderSurvey() { clearTimeout(renderSurvey._t); renderSurvey._t = setTimeout(_renderSurvey, 0); }
// ------------------------------------------------------------------ ราคาสืบ
const isInfo = r => r.ref && r.ref.no_lab && !r.ref.need_mat && !r.ref.code && !r.ref.find;
/** รหัสอ้างอิงข้ามโครงการ: รหัสพาณิชย์ หรือรหัสแถวมาตรฐานของตัวถอดปริมาณ (ไม่ใช้แถวที่ตั้งตามเลขแบบ เช่น D1, fx_, pt_) */
function refOfRow(r) { const c = r.ref && r.ref.kind === 'mat' && r.ref.code; if (c) return 'c:' + String(c).split(',')[0]; return /^(open_|fx_|pt_|eq_|manual)/.test(r.key) ? '' : 'k:' + r.key; }
function surveyTargets() {   // กลุ่ม: pr1 = วัสดุใน ปร.1 · sub = วัสดุย่อยในวัสดุมวลรวม · pr23 = ครุภัณฑ์/ค่าใช้จ่ายพิเศษที่เพิ่มเอง
  const out = [], pr = S.db ? priceAll() : [];
  pr.forEach(r => {
    if ((r.price_ref && ['pct', 'comp'].includes(r.price_ref.kind)) || isInfo(r) || r.unit === 'งาน' || r.lab_only) return;   // วัสดุมวลรวมสืบที่วัสดุย่อย; ค่าแรงอย่างเดียวไม่ต้องสืบ
    if (r.mat_unit === null || /^ราคาสืบ/.test(r.mat_src || '')) out.push({ group: 'pr1', target: 'row:' + r.key, key: r.key, ref: refOfRow(r), name: r.name, unit: r.unit, qty: r.qty, why: (r.warns || []).join(' · ') });
  });
  if (S.db) {
    // วัสดุมวลรวมที่โครงการนี้ใช้ (แถว ปร.1 ที่ผูก comp) → วัสดุย่อยที่ใช้จริง
    const usedComp = {};
    pr.filter(r => r.ref && r.ref.kind === 'comp').forEach(r => { const c = S.db.findComp(r.ref.code); if (c) (usedComp[c.id] = usedComp[c.id] || { c, rows: [] }).rows.push(r.name); });
    const subs = {};
    S.baseCompItems.forEach(it => {
      if (it.fixedPrice !== null || hasCommerce(it)) return;
      const sc = S.db.resolveCompRef(it); if (sc) return;   // คิดจากวัสดุมวลรวมย่อยอีกตัว
      const k = subKey(it), ref = it.itemCode && S.db.matRef[it.itemCode];
      const o = subs[k] = subs[k] || { group: 'sub', target: k, ref: k.startsWith('sub:') ? 'c:' + k.slice(4) : '', name: ref ? ref.name : it.itemName, unit: ref ? String(ref.unit).replace(/^บาท\//, '') : it.unit, comps: new Set(), used: [] };
      o.comps.add(it.compId);
      if (usedComp[it.compId] && !o.used.some(u => u.id === it.compId)) o.used.push({ id: it.compId, sub: usedComp[it.compId].c.sub, name: usedComp[it.compId].c.name, rows: usedComp[it.compId].rows });
    });
    Object.values(subs).forEach(o => {
      o.why = o.used.length ? 'ใช้ในวัสดุมวลรวมของโครงการ: ' + o.used.map(u => `${u.sub} ${u.name} (${u.rows.join(', ')})`).join(' · ') : `อยู่ในวัสดุมวลรวม ${o.comps.size} รายการ (ไม่ได้ใช้ในโครงการนี้)`;
      o.inProject = !!o.used.length; o.skip = !!(S.boq.subSkip || {})[o.target]; out.push(o);
    });
  }
  (S.boq.pr2 || []).forEach(r => { if (!r.id) r.id = Survey.uid('e'); if (r.name) out.push({ group: 'pr23', target: 'pr2:' + r.id, name: r.name, unit: r.unit, qty: r.qty, why: 'ปร.2 ครุภัณฑ์จัดซื้อ (ราคาไม่รวม VAT)' }); });
  (S.boq.pr3 || []).forEach(r => { if (!r.id) r.id = Survey.uid('x'); if (r.name) out.push({ group: 'pr23', target: 'pr3:' + r.id, name: r.name, unit: r.unit, qty: r.qty, why: 'ปร.3 ค่าใช้จ่ายพิเศษตามข้อกำหนด' }); });
  return out;
}
// ราคาสืบของ ปร.2/ปร.3 → ราคาต่อหน่วยครุภัณฑ์ / ค่าใช้จ่ายรวม (= ราคาต่อหน่วย × จำนวน)
function applyPr23Survey() {
  (S.boq.pr2 || []).forEach(r => { const it = r.id && S.boq.surveys['pr2:' + r.id], p = it ? Survey.summary(it).price : null; if (p !== null) { r.price = p; r.price_src = Survey.srcText(it); } else delete r.price_src; });
  (S.boq.pr3 || []).forEach(r => { const it = r.id && S.boq.surveys['pr3:' + r.id], p = it ? Survey.summary(it).price : null; if (p !== null) { r.amount = r2(p * r2(+r.qty || 1)); r.price_src = Survey.srcText(it) + ` × ${r.qty}`; } else delete r.price_src; });
}
function svItem(t) {   // รายการราคาสืบของเป้าหมาย (สร้างใหม่ถ้ายังไม่มี)
  const sv = S.boq.surveys; let it = sv[t.target];
  if (!it) it = sv[t.target] = { id: t.target, name: t.name, unit: t.unit, target: t.target, quotes: [], reason: '' };
  if (t.ref && !it.ref) it.ref = t.ref;
  return it;
}
function renderSurvey() { clearTimeout(renderSurvey._t); renderSurvey._t = setTimeout(_renderSurvey, 0); }
function _renderSurvey() {
  const box = $('#sv-list'); if (!box) return;
  if (!S.model) { box.innerHTML = '<div class="card hint">เปิดโมเดลก่อน</div>'; return; }
  migrateSurvey();
  const tg = surveyTargets(), have = new Set(tg.map(t => t.target));
  const manual = Object.values(S.boq.surveys).filter(it => !have.has(it.target) && (it.quotes || []).length).map(it => ({ group: 'manual', target: it.target, name: it.name, unit: it.unit, why: it.target.startsWith('manual') ? 'เพิ่มเอง' : 'ไม่ได้ใช้ในงานนี้แล้ว (เก็บไว้เป็นหลักฐาน)' }));
  const all = tg.concat(manual).map(t => ({ t, it: S.boq.surveys[t.target], s: t.skip ? { status: 'skip', n: 0, price: null } : S.boq.surveys[t.target] ? Survey.summary(S.boq.surveys[t.target]) : { status: 'none', n: 0, price: null } }));
  const f = S.svf || 'todo';
  const rel = all.filter(x => x.t.group !== 'sub' || x.t.inProject || (x.it && (x.it.quotes || []).length));   // นับเฉพาะที่ใช้ในโครงการนี้
  const cnt = k => rel.filter(x => x.s.status === k).length;
  $('#sv-stat').innerHTML = `ใช้ในโครงการนี้ ${rel.length} รายการ · <span style="color:var(--green)">ครบ 3 เจ้า ${cnt('ok')}</span> · <span style="color:var(--amber)">ไม่ครบ ${cnt('few')}</span> · <span style="color:var(--red)">ยังไม่สืบ ${cnt('none')}</span>`;
  $('#sv-badge').innerHTML = cnt('none') ? `<span class="pill err">${cnt('none')}</span>` : '';
  $$('#sv-filter [data-svf]').forEach(c => c.classList.toggle('on', c.dataset.svf === f));
  const show = all.filter(x => x.t.target === S.svOpen || f === 'all' || (f === 'todo' ? !['ok', 'skip'].includes(x.s.status) : x.s.status === f));
  const GR = [['pr1', 'วัสดุในแบบ ปร.1'], ['sub', 'วัสดุย่อยในวัสดุมวลรวม (ใช้คิดราคาต่อหน่วยของ ปร.1)'], ['pr23', 'ครุภัณฑ์ ปร.2 / ค่าใช้จ่ายพิเศษ ปร.3'], ['manual', 'รายการอื่น']];
  let html = '';
  GR.forEach(([g, title]) => {
    let list = show.filter(x => x.t.group === g); if (!list.length) return;
    let extra = '';
    if (g === 'sub') {
      const other = list.filter(x => !x.t.inProject && x.t.target !== S.svOpen && !(x.it && (x.it.quotes || []).length));
      list = list.filter(x => !other.includes(x));
      if (other.length) extra = `<details class="sv-more"><summary class="hint">วัสดุย่อยอื่นที่ไม่ได้ใช้ในโครงการนี้ (${other.length})</summary>${other.map(x => svCard(x)).join('')}</details>`;
    }
    html += `<h3 class="sv-group">${title} <span class="hint">${list.length + (extra ? '' : '')} รายการ</span></h3>` + list.map(x => svCard(x)).join('') + extra;
  });
  box.innerHTML = html || '<div class="card hint">ไม่มีรายการในกลุ่มนี้</div>';
  const tmap = {}; all.forEach(x => { tmap[x.t.target] = x.t; }); libBadges(box, tmap);
  if (S.svOpen) { const c = box.querySelector(`[data-svi="${CSS.escape(S.svOpen)}"]`); if (c) c.classList.add('open'); }
}
const SVST = { ok: ['ครบ 3 เจ้า', 'ok'], few: ['ไม่ครบ 3 เจ้า', 'warn'], none: ['ยังไม่สืบ', 'err'], skip: ['ไม่คิดราคา', ''] };
function svCard({ t, it, s }) {
  const open = S.svOpen === t.target;
  let h = `<div class="card sv-card ${open ? 'open' : ''}" data-svi="${esc(t.target)}">
    <div class="sv-head" data-svtoggle="1"><div><b>${esc(t.name)}</b> <span class="hint">[${esc(t.unit)}]</span>${t.qty ? ` <span class="hint">· ใช้ ${fmt(t.qty)} ${esc(t.unit)}</span>` : ''}
      <div class="hint">${esc(t.why || '')}</div></div>
      <div class="sv-sum">${t.group === 'sub' && (s.status === 'none' || s.status === 'skip') ? `<button class="btn small" data-subskip="${esc(t.target)}" title="ไม่ใส่ราคาวัสดุย่อยนี้ — วัสดุมวลรวมคิดราคาจากวัสดุที่เหลือ">${s.status === 'skip' ? 'กลับมาคิดราคา' : 'ไม่คิดราคา'}</button> ` : ''}${t.group === 'pr1' && s.status === 'none' ? `<button class="btn small" data-nomat="${esc(t.key)}" title="งานที่มีแต่ค่าแรง เช่น รื้อถอน ขุดดิน">ไม่มีค่าวัสดุ</button> ` : ''}<span class="pill ${SVST[s.status][1]}">${SVST[s.status][0]}${s.n ? ' · ' + s.n : ''}</span>${s.price !== null ? `<b>${fmt(s.price)}</b><small>บ./${esc(t.unit)}</small>` : ''}</div></div>`;
  if (open) h += svEditor(t, it || svItem(t));
  return h + '</div>';
}
function svEditor(t, it) {
  const s = Survey.summary(it), best = s.best && s.best.id;
  const ch = Object.entries(Survey.CHANNEL);
  const ph = { web: 'ลิงก์หน้าเว็บ', phone: 'เบอร์โทร', line: 'ชื่อไลน์ / ลิงก์ร้าน', quote: 'เลขที่ใบเสนอราคา / ผู้เสนอ', store: 'ที่อยู่ร้าน' };
  let h = `<div class="sv-body">`;
  (it.quotes || []).forEach((q, i) => {
    const up = Survey.unitPrice(q);
    h += `<div class="sv-q ${q.id === best ? 'best' : ''}" data-q="${esc(q.id)}">
      <div class="sv-qh"><b>เจ้าที่ ${i + 1}</b>${q.id === best ? ' <span class="pill ok">ต่ำสุด ใช้ราคานี้</span>' : ''}<button class="btn small" data-qdel="1">ลบ</button></div>
      <div class="sv-grid">
        <label>ช่องทาง<select data-qf="channel">${ch.map(([k, v]) => `<option value="${k}" ${q.channel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>ชื่อร้าน<input data-qf="shop" value="${esc(q.shop || '')}"></label>
        <label class="wide">${ph[q.channel] || 'ติดต่อ'}<input data-qf="contact" value="${esc(q.contact || '')}" ${q.channel === 'phone' ? 'inputmode="tel"' : ''}>${q.contact && /^https?:\/\//.test(q.contact) ? `<a href="${esc(q.contact)}" target="_blank" rel="noopener" class="pk-link">เปิดลิงก์</a>` : ''}</label>
        <label>วันที่สืบ<input type="date" data-qf="date" value="${esc(q.date || '')}"></label>
        <label>ราคาที่ได้ (บาท)<input data-qf="price" inputmode="decimal" value="${esc(q.price ?? '')}"></label>
        <label>ต่อหน่วยที่ร้านขาย<input data-qf="qunit" value="${esc(q.qunit || '')}" placeholder="${esc(it.unit)}"></label>
        <label>1 หน่วยร้าน = ? ${esc(it.unit)}<input data-qf="factor" inputmode="decimal" value="${esc(q.factor ?? 1)}"></label>
        <label class="ck"><input type="checkbox" data-qf="vat" ${q.vat ? 'checked' : ''}> ราคานี้รวม VAT แล้ว (หักออก)</label>
        <label class="wide">หมายเหตุ<input data-qf="note" value="${esc(q.note || '')}"></label>
      </div>
      <div class="sv-calc">${up !== null ? `= ${fmt(+q.price)}${q.vat ? ' ÷ 1.07' : ''}${+(q.factor || 1) !== 1 ? ` ÷ ${esc(q.factor)}` : ''} → <b>${fmt(up)}</b> บ./${esc(it.unit)} (ไม่รวม VAT)` : '<span class="hint">ใส่ราคาเพื่อคำนวณ</span>'}</div>
      <div class="sv-imgs">${(q.imgs || []).map(id => `<span class="sv-th">${S.img[id] ? `<img src="${esc(Survey.safeImg(S.img[id]) || '')}" data-view="${esc(id)}">` : '<i>กำลังโหลด…</i>'}<button data-imgdel="${esc(id)}">×</button></span>`).join('')}
        <label class="btn small">+ แนบภาพ (แคปจอ/ใบเสนอราคา)<input type="file" accept="image/*" multiple data-qimg="1" hidden></label></div>
    </div>`;
  });
  h += `<div class="btn-row"><button class="btn small primary" data-qadd="1">+ เพิ่มเจ้า</button><span class="hint" data-libhint="1"></span></div>`;
  if (s.status !== 'ok') h += `<label class="sv-reason">เหตุผลที่สืบได้ไม่ครบ 3 เจ้า<input data-reason="1" value="${esc(it.reason || '')}" placeholder="เช่น มีจำหน่ายในพื้นที่เพียง 2 ร้าน"></label>`;
  return h + '</div>';
}
function svSave(it) {   // บันทึก + สำรองเข้าคลังราคาสืบ (ใช้ข้ามโครงการ)
  it.updated = new Date().toISOString(); applyPr23Survey(); autosave(); applySurvey(); priceAll(); if (/^pr[23]:/.test(it.target)) renderPR23();
  clearTimeout(svSave._t); svSave._t = setTimeout(() => {
    const imgs = {}; (it.quotes || []).forEach(q => (q.imgs || []).forEach(id => { if (S.img[id]) imgs[id] = S.img[id]; }));
    if ((it.quotes || []).some(q => +q.price > 0)) Survey.libPut(Survey.libKey(it.name, it.unit), { key: Survey.libKey(it.name, it.unit), name: it.name, unit: it.unit, quotes: it.quotes, reason: it.reason, imgs, updated: it.updated, project: S.boq.project.name || '', ref: it.ref || '' })
      .then(() => { if (Survey.remote()) libStatus('บันทึกเข้าคลังกลางแล้ว'); })
      .catch(er => { libStatus('บันทึกเข้าคลังกลางไม่ได้: ' + er.message + ' (เก็บในเครื่องไว้ก่อน)', true); });
  }, 800);
}
async function svLibHint(card, it) {   // คลังราคาสืบของรายการนี้: ตรงแน่ / อาจตรงกับ / ค้นเอง
  const el = card.querySelector('[data-libhint]'); if (!el) return;
  const all = await Survey.libAll(), own = Survey.libKey(it.name, it.unit), f = Survey.libFind(all, it);
  const mine = x => x.key === own && (it.quotes || []).length;
  const ent = [];
  if (f.hit && !mine(f.hit)) ent.push({ x: f.hit, tag: f.how, sure: true });
  f.maybe.forEach(o => { if (!mine(o.x)) ent.push({ x: o.x, tag: 'อาจตรงกับ', sure: false }); });
  const line = (e, i) => { const a = Survey.ageDays(e.x.updated); return `${e.sure ? '' : '<span class="pill warn">อาจตรงกับ</span> '}<a class="pk-link" data-libuse="${i}" title="${esc(e.tag)}">${esc(e.x.name)} [${esc(e.x.unit)}] · ${(e.x.quotes || []).length} เจ้า · ${a} วันก่อน${e.x.project ? ' (' + esc(e.x.project) + ')' : ''}</a>${a > 90 ? ' <span class="pill warn">เกิน 90 วัน</span>' : ''}`; };
  el.innerHTML = (ent.length ? 'คลังราคาสืบ: ' + ent.map(line).join(' · ') + ' · ' : '') + '<a class="pk-link" data-libsearch="1">ค้นในคลัง…</a><div data-libres="1"></div>';
  el.querySelectorAll('[data-libuse]').forEach(a => a.onclick = () => { const e = ent[+a.dataset.libuse]; if (!e.sure && !confirm(`ใช้ราคาสืบของ "${e.x.name}" กับ "${it.name}"?\nระบบจะจำว่าเป็นวัสดุเดียวกันสำหรับโครงการต่อไป`)) return; libUse(it, e.x, !e.sure); });
  el.querySelector('[data-libsearch]').onclick = () => {
    const q = prompt('ค้นในคลังราคาสืบ (พิมพ์บางส่วนของชื่อ)', it.name); if (!q) return;
    const res = Survey.libSearch(all, q, it.unit), box = el.querySelector('[data-libres]');
    box.innerHTML = res.length ? res.map((x, i) => `<div><a class="pk-link" data-libpick="${i}">${esc(x.name)} [${esc(x.unit)}] · ${(x.quotes || []).length} เจ้า · ${Survey.ageDays(x.updated)} วันก่อน</a></div>`).join('') : '<span class="hint">ไม่พบในคลัง</span>';
    box.querySelectorAll('[data-libpick]').forEach(a => a.onclick = () => libUse(it, res[+a.dataset.libpick], true));
  };
}
/** ดึงราคาสืบจากคลังมาใช้ · remember = จำชื่อนี้เป็นชื่ออื่นของรายการในคลัง (โครงการต่อไปจับคู่ให้เอง) */
async function libUse(it, x, remember) {
  toast('กำลังดึงจากคลัง…');
  for (const [id, v] of Object.entries(x.imgs || {})) { const d = await Survey.libImg(v).catch(() => null); if (d) { S.img[id] = d; Survey.imgPut(id, d); } }
  it.quotes = (it.quotes || []).concat((x.quotes || []).map(q => Object.assign({}, q, { id: Survey.uid('q'), note: (q.note ? q.note + ' · ' : '') + 'จากคลัง' })));
  if (!it.reason && x.reason) it.reason = x.reason;
  const sameUnit = Survey.normUnit(x.unit) === Survey.normUnit(it.unit);
  if (remember && sameUnit && x.key !== Survey.libKey(it.name, it.unit)) Survey.libAlias(x.key, it.name, it.unit).catch(er => libStatus('จำชื่ออื่นไม่สำเร็จ: ' + er.message, true));
  svSave(it); renderSurvey(); renderPR1(); renderSummary();
  toast(sameUnit ? `ดึง ${(x.quotes || []).length} เจ้าจากคลังแล้ว — ตรวจวันที่สืบ` : `ดึงแล้ว แต่หน่วยต่างกัน (${x.unit} → ${it.unit}) — แก้ตัวแปลงหน่วยของแต่ละเจ้า`);
}
/** ป้ายในรายการ: มีในคลัง / อาจมีในคลัง (เฉพาะรายการที่ยังไม่ได้สืบ) */
async function libBadges(box, tmap) {
  const lib = await Survey.libAll().catch(() => []); if (!lib.length) return;
  box.querySelectorAll('[data-svi]').forEach(c => {
    const t = tmap[c.dataset.svi], it = S.boq.surveys[c.dataset.svi]; if (!t || (it && (it.quotes || []).length)) return;
    const f = Survey.libFind(lib, { name: t.name, unit: t.unit, ref: t.ref || (it && it.ref) }), sum = c.querySelector('.sv-sum'); if (!sum || sum.querySelector('.libb')) return;
    let h = '';
    if (f.hit) { const a = Survey.ageDays(f.hit.updated); h = `<span class="pill ${a > 90 ? 'warn' : 'ok'} libb" title="${esc(f.how)}">มีในคลัง · ${(f.hit.quotes || []).length} เจ้า · ${a} วัน</span>`; }
    else if (f.maybe.length) h = `<span class="pill warn libb" title="${esc(f.maybe[0].x.name)}">อาจมีในคลัง</span>`;
    if (h) sum.insertAdjacentHTML('afterbegin', h + ' ');
  });
}
/** ดูภาพหลักฐานแบบหน้าต่างซ้อน (ไม่เปิดแท็บใหม่) — แตะพื้นหลัง/× /Esc เพื่อปิด */
function showImg(d) {
  let m = $('#img-modal');
  if (!m) { m = document.createElement('div'); m.id = 'img-modal'; m.className = 'modal img-modal'; m.innerHTML = '<button class="btn small img-x" aria-label="ปิด">×</button><img alt="ภาพหลักฐาน">'; document.body.appendChild(m);
    m.onclick = e => { if (e.target.tagName !== 'IMG') m.classList.remove('on'); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') m.classList.remove('on'); }); }
  m.querySelector('img').src = d; m.classList.add('on');
}
function libStatus(msg, err) {
  const c = Survey.cfg();
  $('#sv-libst').innerHTML = (c.url ? `คลังราคาสืบ: <b style="color:var(--green)">คลังกลาง (Google Sheet)</b>${c.team ? '' : ' · <span style="color:var(--amber)">ยังไม่ใส่รหัสทีม — กด ตั้งค่าคลังกลาง เพื่อเปิดดู/บันทึก (ตอนนี้ใช้คลังในเครื่อง)</span>'}` : 'คลังราคาสืบ: เก็บในเครื่องนี้ (ยังไม่ได้ตั้งคลังกลาง)')
    + (msg ? ` · <span style="color:var(${err ? '--red' : '--text3'})">${esc(msg)}</span>` : '');
}
function libConfig() {
  const c = Survey.cfg(); let m = $('#lib-modal');
  if (!m) { m = document.createElement('div'); m.id = 'lib-modal'; m.className = 'modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-box glass"><div class="side-top"><h2 style="margin:0">คลังราคาสืบกลาง</h2><button class="btn small" data-close="1">×</button></div>
    <p class="hint">ราคาสืบเก็บใน Google Sheet กลาง · ดู/เพิ่ม/แก้ ต้องใช้รหัสทีม · คอมกลางหรือเครื่องคนอื่น อย่าติ๊ก "จำรหัส"</p>
    <div class="form-grid"><label>Web app URL (Apps Script)<input id="lib-url" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/.../exec"></label>
    <label>รหัสทีม<input id="lib-team" type="password" autocomplete="off" value="${esc(c.team || '')}"></label>
    <label class="ck"><input type="checkbox" id="lib-remember" ${c.remember ? 'checked' : ''}> จำรหัสบนเครื่องนี้ (ไม่ติ๊ก = ลืมเมื่อปิดแท็บ)</label></div>
    <div class="btn-row"><button class="btn small primary" id="lib-save">บันทึกและทดสอบ</button><button class="btn small" id="lib-off">ลบรหัสจากเครื่องนี้</button><button class="btn small" id="lib-push">ส่งคลังในเครื่องขึ้นคลังกลาง</button></div>
    <div class="hint" id="lib-msg"></div></div>`;
  m.classList.add('on');
  m.onclick = e => { if (e.target === m || e.target.dataset.close) m.classList.remove('on'); };
  $('#lib-save').onclick = async () => {
    const n = { url: $('#lib-url').value.trim(), team: $('#lib-team').value, remember: $('#lib-remember').checked };
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(n.url)) { $('#lib-msg').textContent = 'URL ต้องเป็น Web app ของ Apps Script (https://script.google.com/macros/s/…/exec)'; return; }
    try { const r = await Survey.ping(n); if (!r.ok) throw new Error(r.error); Survey.setCfg(n); $('#lib-msg').textContent = 'เชื่อมต่อแล้ว: ' + r.name; libStatus(); }
    catch (er) { $('#lib-msg').textContent = 'เชื่อมต่อไม่ได้: ' + er.message; }
  };
  $('#lib-off').onclick = () => { Survey.setCfg({ url: Survey.cfg().url }); libStatus(); m.classList.remove('on'); toast('ลบรหัสทีมออกจากเครื่องนี้แล้ว'); };
  $('#lib-push').onclick = async () => {
    const loc = await Survey.localAll(); let ok = 0, bad = 0;
    for (const x of loc) { try { await Survey.libPut(x.key, x); ok++; } catch (er) { bad++; $('#lib-msg').textContent = er.message; } }
    $('#lib-msg').textContent = `ส่งขึ้นคลังกลาง ${ok} รายการ${bad ? ` · ไม่สำเร็จ ${bad}` : ''}`;
  };
}
function bindSurvey() {
  libStatus();
  $('#sv-libcfg').onclick = libConfig;
  $('#sv-list').addEventListener('click', e => {
    const card = e.target.closest('[data-svi]'); if (!card) return;
    const tid = card.dataset.svi, t = { target: tid, name: card.querySelector('.sv-head b').textContent, unit: (card.querySelector('.sv-head .hint').textContent.match(/\[(.*)\]/) || [])[1] || '' };
    const it = S.boq.surveys[tid] || svItem(t);
    if (e.target.dataset.subskip) { const k = e.target.dataset.subskip, m = S.boq.subSkip = S.boq.subSkip || {}; if (m[k]) delete m[k]; else m[k] = true; autosave(); applySurvey(); priceAll(); renderSurvey(); renderPR1(); renderSummary(); toast(m[k] ? 'ไม่คิดราคาวัสดุย่อยนี้ — วัสดุมวลรวมคิดจากวัสดุที่เหลือ' : 'กลับมาคิดราคาวัสดุย่อยนี้'); return; }
    if (e.target.dataset.nomat) { const k = e.target.dataset.nomat; S.boq.overrides[k] = Object.assign(S.boq.overrides[k] || {}, { no_mat: true }); autosave(); renderSurvey(); renderPR1(); renderSummary(); toast('ตั้งเป็นค่าแรงอย่างเดียวแล้ว — ยกเลิกได้ที่ ปร.1'); return; }
    if (e.target.closest('[data-svtoggle]')) { S.svOpen = S.svOpen === tid ? null : tid; renderSurvey(); if (S.svOpen) setTimeout(() => { const c = $(`[data-svi="${CSS.escape(tid)}"]`); if (c) { svLibHint(c, it); c.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, 50); return; }
    if (e.target.dataset.qadd) { it.quotes.push({ id: Survey.uid('q'), channel: 'web', shop: '', contact: '', date: new Date().toISOString().slice(0, 10), price: '', qunit: it.unit, factor: 1, vat: true, note: '', imgs: [] }); svSave(it); renderSurvey(); return; }
    const qel = e.target.closest('[data-q]'), q = qel && it.quotes.find(x => x.id === qel.dataset.q);
    if (q && e.target.dataset.qdel) { if (confirm('ลบเจ้านี้?')) { it.quotes = it.quotes.filter(x => x !== q); svSave(it); renderSurvey(); renderPR1(); } return; }
    if (q && e.target.dataset.imgdel) { q.imgs = q.imgs.filter(x => x !== e.target.dataset.imgdel); svSave(it); renderSurvey(); return; }
    if (e.target.dataset.view) { const d = Survey.safeImg(S.img[e.target.dataset.view]); if (d) showImg(d); }
  });
  $('#sv-list').addEventListener('change', async e => {
    const card = e.target.closest('[data-svi]'); if (!card) return;
    const it = S.boq.surveys[card.dataset.svi]; if (!it) return;
    if (e.target.dataset.reason) { it.reason = e.target.value; svSave(it); return; }
    const qel = e.target.closest('[data-q]'), q = qel && it.quotes.find(x => x.id === qel.dataset.q); if (!q) return;
    if (e.target.dataset.qimg) {
      for (const f of e.target.files) { const d = await Survey.compress(f), id = Survey.uid('img'); S.img[id] = d; Survey.imgPut(id, d); q.imgs.push(id); }
      svSave(it); renderSurvey(); toast('แนบภาพแล้ว'); return;
    }
    const k = e.target.dataset.qf; if (!k) return;
    q[k] = e.target.type === 'checkbox' ? e.target.checked : (['price', 'factor'].includes(k) ? (e.target.value.trim() === '' ? '' : +e.target.value.replace(/,/g, '')) : e.target.value);
    svSave(it); renderSurvey(); renderPR1(); renderSummary();
  });
  $$('#sv-filter [data-svf]').forEach(c => c.onclick = () => { S.svf = c.dataset.svf; renderSurvey(); });
  $('#sv-add').onclick = () => {
    const name = prompt('ชื่อวัสดุ'); if (!name) return; const unit = prompt('หน่วย (ตามใน ปร.)', 'ชุด') || '';
    const id = Survey.uid('manual:'); S.boq.surveys[id] = { id, name, unit, target: id, quotes: [], reason: '' }; S.svOpen = id; S.svf = 'all'; svSave(S.boq.surveys[id]); renderSurvey();
  };
  $('#sv-print').onclick = () => { svPrintout(); document.body.classList.add('print-survey'); setTimeout(() => { window.print(); document.body.classList.remove('print-survey'); }, 300); };
  $('#sv-libx').onclick = async () => { const all = await Survey.libAll(); download('คลังราคาสืบ-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ format: 'ud-survey-lib', items: all })); toast(`ส่งออกคลัง ${all.length} รายการ`); };
  $('#sv-libi').onchange = async e => {
    try { const f = await readFile(e.target), d = JSON.parse(f.text); if (d.format !== 'ud-survey-lib') throw new Error('ไม่ใช่ไฟล์คลังราคาสืบ');
      for (const x of d.items) { const cur = await Survey.libGet(x.key); if (!cur || (x.updated || '') > (cur.updated || '')) await Survey.libPut(x.key, x); }
      toast(`นำเข้าคลัง ${d.items.length} รายการ`); } catch (er) { alert('นำเข้าไม่ได้: ' + er.message); }
    e.target.value = '';
  };
}
function svPrintout() {   // บัญชีสืบราคา + ภาคผนวกภาพหลักฐาน
  const p = S.boq.project, items = Object.values(S.boq.surveys).filter(it => (it.quotes || []).length);
  let h = `<h3 style="text-align:center">บัญชีสืบราคาวัสดุ</h3><div>โครงการ ${esc(p.name || '')} · สถานที่ ${esc(p.location || '')} · หน่วยงาน ${esc(p.agency || '')} · วันที่พิมพ์ ${new Date().toISOString().slice(0, 10)}</div>
    <p class="hint">ราคาต่อหน่วยไม่รวมภาษีมูลค่าเพิ่ม (ราคาที่รวม VAT หารด้วย 1.07) แปลงเป็นหน่วยตามแบบ ปร. แล้วเลือกราคาต่ำสุด</p>`;
  let n = 0, fig = [];
  items.forEach((it, k) => {
    const s = Survey.summary(it);
    h += `<h4>${k + 1}. ${esc(it.name)} (หน่วย ${esc(it.unit)})</h4><div class="table-wrap"><table class="boq"><tr><th>เจ้า</th><th>ร้าน / ช่องทาง</th><th>ติดต่อ</th><th>วันที่</th><th>ราคาที่ได้</th><th>VAT</th><th>แปลงหน่วย</th><th>บาท/${esc(it.unit)}</th><th>หลักฐาน</th></tr>
      ${s.list.map((x, i) => { const q = x.q, refs = (q.imgs || []).map(id => { fig.push({ id, k, item: it.name, cap: `${it.name} — ${q.shop || Survey.CHANNEL[q.channel]}` }); const d = Survey.safeImg(S.img[id]); return d ? `<figure class="sv-ev"><img src="${esc(d)}"><figcaption>ภาพ ${fig.length}</figcaption></figure>` : 'ภาพ ' + fig.length; });
        return `<tr ${q === s.best ? 'class="total"' : ''}><td class="r">${i + 1}</td><td>${esc(q.shop || '')}<br><small>${Survey.CHANNEL[q.channel] || ''}</small></td><td style="word-break:break-all">${esc(q.contact || '')}</td><td>${esc(q.date || '')}</td>
          <td class="r">${fmt(+q.price)}${q.qunit ? '/' + esc(q.qunit) : ''}</td><td>${q.vat ? 'รวม (หักออก)' : 'ไม่รวม'}</td><td class="r">${+(q.factor || 1) !== 1 ? `1 ${esc(q.qunit || '')} = ${esc(q.factor)} ${esc(it.unit)}` : '-'}</td>
          <td class="r"><b>${fmt(x.up)}</b></td><td class="sv-evs">${refs.join('') || '-'}</td></tr>`; }).join('')}
      </table></div><p>ใช้ราคา <b>${fmt(s.price)}</b> บาท/${esc(it.unit)} (${esc(s.best.shop || '')})${s.n < Survey.MIN_Q ? ` · สืบได้ ${s.n} เจ้า: ${esc(it.reason || 'ไม่ได้ระบุเหตุผล')}` : ''}</p>`;
    n++;
  });
  if (fig.length) {   // ภาคผนวก (A4 แนวตั้ง): ภาพของวัสดุเดียวกันอยู่หน้าเดียวกัน ย่อตามจำนวนภาพ
    const groups = []; fig.forEach((f, i) => { f.no = i + 1; let g = groups.find(x => x.k === f.k); if (!g) groups.push(g = { k: f.k, item: f.item, list: [] }); g.list.push(f); });
    h += `<div class="sv-appx"><h3 style="text-align:center">ภาคผนวก ภาพหลักฐานการสืบราคา</h3>${groups.map(g => { const n = g.list.length, sz = n <= 1 ? 'n1' : n <= 2 ? 'n2' : n <= 4 ? 'n4' : n <= 6 ? 'n6' : 'n9';
      return `<section class="sv-ag ${sz}"><h4>${g.k + 1}. ${esc(g.item)} (${n} ภาพ)</h4><div class="sv-ag-grid">${g.list.map(f => { const d = Survey.safeImg(S.img[f.id]); return d ? `<figure><img src="${esc(d)}"><figcaption>ภาพ ${f.no} ${esc(f.cap)}</figcaption></figure>` : ''; }).join('')}</div></section>`; }).join('')}</div>`;
  }
  $('#sv-printout').innerHTML = n ? h : '<p>ยังไม่มีรายการที่สืบราคา</p>';
}

function surveyState() {
  const out = {};
  Object.values(S.boq.surveys || {}).forEach(it => { if (it.target && it.target.startsWith('row:')) { const p = Survey.summary(it).price; if (p !== null) out[it.target.slice(4)] = { price: p, src: Survey.srcText(it) }; } });
  return out;
}
function priceAll() {
  S.priced = BoqCalc.priceRows(S.db, window.UDPrice, rows(), { overrides: S.boq.overrides, survey: surveyState() });
  return S.priced;
}

function renderPR1() { clearTimeout(renderPR1._t); renderPR1._t = setTimeout(_renderPR1, 0); }
function _renderPR1() {
  const tb = $('#pr1-table');
  if (!S.model) { tb.innerHTML = '<tr><td class="hint">เปิดโมเดลก่อน</td></tr>'; return; }
  const pr = priceAll();
  const p = S.boq.project;
  $('#pr1-head').innerHTML = `<h3 style="text-align:center">แบบ ปร.1 แบบแสดงรายการ ปริมาณงาน และราคา ค่างานต้นทุน</h3>
    <div>ชื่อโครงการ ${esc(p.name)} · สถานที่ ${esc(p.location)} · แบบเลขที่ ${esc(p.drawing_no || '')} · หน่วยงาน ${esc(p.agency)} · คำนวณเมื่อ ${esc(p.calc_date)}</div>`;
  let h = `<thead class="pr1-th"><tr><th rowspan="2">ลำดับ</th><th rowspan="2">รายการ</th><th rowspan="2">จำนวน</th><th rowspan="2">หน่วย</th>
    <th colspan="2">ค่าวัสดุ</th><th colspan="2">ค่าแรงงาน</th><th rowspan="2">รวมค่าวัสดุ<br>และค่าแรงงาน</th><th rowspan="2">หมายเหตุ</th></tr>
    <tr><th>ราคา/หน่วย</th><th>จำนวนเงิน</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th></tr></thead><tbody>`;
  let n = 0, grand = 0, warn = 0;
  for (const [sc, sname] of SECTIONS) {
    const inSec = pr.filter(r => sectionOf(r.group_code) === sc);
    if (!inSec.length) continue;
    h += `<tr class="grp"><td></td><td colspan="9">${sc} ${esc(sname)}</td></tr>`;
    const groups = [...new Set(inSec.map(r => r.group_code))];
    let secTot = 0;
    for (const g of groups) {
      const gr = inSec.filter(r => r.group_code === g);
      h += `<tr class="sub"><td></td><td colspan="9">${esc(g)} ${esc(gr[0].group || '')}</td></tr>`;
      for (const r of gr) {
        n++;
        const o = S.boq.overrides[r.key] || {};
        if (r.warns.length) warn++;
        const custom = r.key.startsWith('custom_');
        h += `<tr class="row ${r.warns.length ? 'warn' : ''} ${S.selKey === r.key ? 'sel' : ''}" data-key="${esc(r.key)}">
          <td class="r c-no">${n}</td>
          <td class="c-name" data-n="${n}">${custom ? `<input class="cell" data-cf="name" value="${esc(r.name)}">` : esc(r.name)}
            ${r.waste ? `<span class="src">สุทธิ ${fmt(r.qty_net)} + เผื่อ ${+(r.waste * 100).toFixed(2)}%</span>` : ''}
            ${r.status === 'assumed' ? '<span class="pill warn">ประมาณ — ตรวจกับแบบ</span>' : ''}
            ${r.warns.map(w => `<span class="warnline">${esc(w)}</span>`).join('')}${(r.mat_unit === null || /^ราคาสืบ/.test(r.mat_src || '')) && r.unit !== 'งาน' && !isInfo(r) && !custom && !r.lab_only && !(r.ref && r.ref.kind === 'comp') ? `<button class="btn small sv-go" data-svgo="${esc(r.key)}">${r.mat_unit === null ? 'สืบราคา' : 'ดูราคาสืบ'}</button>${r.mat_unit === null ? ` <button class="btn small" data-nomat="${esc(r.key)}">ไม่มีค่าวัสดุ</button>` : ''}` : ''}${o.no_mat ? `<span class="src">ค่าแรงอย่างเดียว <button class="btn small" data-unnomat="${esc(r.key)}">ยกเลิก</button></span>` : ''}</td>
          <td class="r c-qty" data-l="จำนวน">${custom ? `<input class="price" data-cf="qty" value="${esc(r.qty)}">` : fmt(r.qty)}</td>
          <td class="c-unit">${custom ? `<input class="cell" data-cf="unit" value="${esc(r.unit)}" style="width:60px">` : esc(r.unit)}</td>
          <td class="r c-mu" data-l="ค่าวัสดุ/หน่วย"><input class="price ${o.mat !== undefined ? 'ov' : ''}" data-ov="mat" value="${r.mat_unit ?? ''}" inputmode="decimal"><span class="src">${esc(r.mat_src)}</span></td>
          <td class="r c-ma" data-l="ค่าวัสดุ">${fmt(r.mat_amt)}</td>
          <td class="r c-lu" data-l="ค่าแรง/หน่วย"><input class="price ${o.lab !== undefined ? 'ov' : ''}" data-ov="lab" value="${r.lab_unit ?? ''}" inputmode="decimal"><span class="src">${esc(r.lab_src)}</span></td>
          <td class="r c-la" data-l="ค่าแรง">${fmt(r.lab_amt)}</td>
          <td class="r c-tot" data-l="รวม">${fmt(r.total)}</td>
          <td class="c-note"><span class="src">${esc((r.ref && r.ref.note) || r.note || '')}</span>${custom ? '<button class="btn small" data-del="1">ลบ</button>' : ''}</td></tr>`;
        secTot += r.total;
      }
    }
    h += `<tr class="total"><td></td><td colspan="7">รวม ${sc} ${esc(sname)}</td><td class="r c-tot">${fmt(r2(secTot))}</td><td></td></tr>`;
    grand += secTot;
  }
  h += `<tr class="total"><td></td><td colspan="7">รวมค่างานต้นทุนทั้งหมด</td><td class="r c-tot">${fmt(r2(grand))}</td><td></td></tr></tbody>`;
  tb.innerHTML = h;
  $('#pr1-alert').textContent = warn ? `มี ${warn} รายการที่ยังไม่มีราคาหรือมีคำเตือน (แถบสีส้ม) — แก้ราคาในช่องได้โดยตรง` : '';
  tb.querySelectorAll('[data-nomat],[data-unnomat]').forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.nomat || b.dataset.unnomat;
    S.boq.overrides[k] = Object.assign(S.boq.overrides[k] || {}, { no_mat: !!b.dataset.nomat }); if (!b.dataset.nomat) delete S.boq.overrides[k].no_mat; autosave(); renderPR1(); renderSummary(); renderSurvey(); });
  tb.querySelectorAll('[data-svgo]').forEach(b => b.onclick = e => { e.stopPropagation(); S.svOpen = 'row:' + b.dataset.svgo; S.svf = 'all'; $$('#tabs .nav-tab').find(x => x.dataset.tab === 'survey').click(); renderSurvey(); setTimeout(() => { const c = $(`[data-svi="${CSS.escape(S.svOpen)}"]`); if (c) { c.scrollIntoView({ block: 'start' }); svLibHint(c, S.boq.surveys[S.svOpen] || svItem({ target: S.svOpen, name: c.querySelector('.sv-head b').textContent, unit: '' })); } }, 80); });
  tb.querySelectorAll('tr.row').forEach(tr => {
    const key = tr.dataset.key;
    tr.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      S.selKey = key; const r = S.priced.find(x => x.key === key);
      tb.querySelectorAll('tr.row').forEach(x => x.classList.toggle('sel', x.dataset.key === key));
      if (S.viewer && r) { S.viewer.highlight(r.from || []); toast(`ไฮไลต์ ${(r.from || []).length} ชิ้นส่วนในแท็บโมเดล 3D`); }
    });
    tr.querySelectorAll('[data-ov]').forEach(inp => inp.onchange = () => {
      const o = S.boq.overrides[key] = S.boq.overrides[key] || {};
      const v = inp.value.trim();
      if (v === '') delete o[inp.dataset.ov]; else o[inp.dataset.ov] = +v;
      if (!Object.keys(o).length) delete S.boq.overrides[key];
      autosave(); renderPR1(); renderSummary();
    });
    tr.querySelectorAll('[data-cf]').forEach(inp => inp.onchange = () => {
      const c = S.boq.custom_rows.find(x => x.key === key); if (!c) return;
      c[inp.dataset.cf] = inp.dataset.cf === 'qty' ? r2(+inp.value || 0) : inp.value;
      autosave(); renderPR1(); renderSummary();
    });
    const del = tr.querySelector('[data-del]');
    if (del) del.onclick = () => { S.boq.custom_rows = S.boq.custom_rows.filter(x => x.key !== key); delete S.boq.overrides[key]; autosave(); renderPR1(); renderSummary(); };
  });
}

function addCustomRow() {
  if (!S.model) return toast('เปิดโมเดลก่อน');
  const code = prompt('หมวดของรายการใหม่ (เช่น 1.1.12, 1.2.5, 1.3, 1.4)', '1.2.5');
  if (!code) return;
  const n = (S.boq.custom_rows.length ? Math.max(...S.boq.custom_rows.map(r => +r.key.split('_')[1] || 0)) : 0) + 1;
  S.boq.custom_rows.push({ key: `custom_${n}`, group_code: code.trim(), group: 'รายการเพิ่มเติม', name: 'รายการใหม่', unit: 'หน่วย', qty: 1,
    qty_net: 1, waste: 0, from: [], status: 'user' });
  autosave(); renderPR1(); renderSummary();
}

// ------------------------------------------------------------------ ปร.2 / ปร.3
const PR3_TEMPLATES = ['ค่าใช้จ่ายในการกำหนดคุณสมบัติผู้ปฏิบัติงานหรือคุมการก่อสร้างพิเศษเฉพาะ', 'ค่าใช้จ่ายในการกำหนดให้ใช้นั่งร้านพิเศษเพื่อความปลอดภัยต่อคนงานก่อสร้าง',
  'ค่าใช้จ่ายในการทำ BENCHMARK สำหรับตรวจเช็คระดับมาตรฐาน', 'ค่าใช้จ่ายในการทดสอบการทรุดตัวของอาคารขณะก่อสร้างเป็นระยะ ๆ',
  'ค่าใช้จ่ายในการทำอาคารบางส่วนให้แล้วเสร็จเพื่อเข้าไปใช้สอยก่อนเสร็จทั้งโครงการ', 'ค่าใช้จ่ายในการกำหนดให้ทำรายละเอียดแผนงานก่อสร้างด้วยระบบ CPM',
  'ค่าใช้จ่ายในการจัดสร้างสำนักงานสนาม สำหรับผู้ว่าจ้างหรือผู้ควบคุมงาน', 'ค่าใช้จ่ายในการจัดทำระบบป้องกันฝุ่นตามข้อบังคับ',
  'ค่าใช้จ่ายในการติดตั้งสิ่งป้องกันดินพังทลาย', 'ค่าใช้จ่ายสำหรับอุปกรณ์เครื่องจักรกลพิเศษในการก่อสร้าง',
  'ค่าใช้จ่ายสำหรับพาหนะเดินทางไป-กลับของคนงาน', 'ค่าใช้จ่ายสำหรับกรรมวิธีป้องกันชีวิตและทรัพย์สินของบุคคลที่ 3',
  'ค่าใช้จ่ายในการนำวัสดุก่อสร้างไปใช้ในสถานที่ที่มีข้อจำกัดในการลำเลียงวัสดุ', 'ค่าใช้จ่ายในการขนส่งวัสดุ', 'อื่น ๆ'];
const VAT = 0.07;
function pr2Row(r) {
  const q = r2(+r.qty || 0), eq = r2(q * r2(+r.price || 0)), inst = r2(q * r2(+r.install || 0));   // คูณจากค่าที่พิมพ์
  return { eq, inst, eqVat: r2(eq * VAT), instVat: r2(inst * VAT) };
}
function renderPR23() { clearTimeout(renderPR23._t); renderPR23._t = setTimeout(_renderPR23, 0); }
function _renderPR23() {
  const t2 = $('#pr2-table');
  let h = `<tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ค่าครุภัณฑ์/หน่วย</th><th>จำนวนเงิน</th><th>ค่าติดตั้ง/หน่วย</th><th>จำนวนเงิน</th><th>รวม (ยังไม่รวม VAT)</th><th></th></tr>`;
  S.boq.pr2.forEach((r, i) => {
    const c = pr2Row(r);
    h += `<tr><td class="r">${i + 1}</td><td><input class="cell" data-i="${i}" data-f="name" value="${esc(r.name)}"></td>
      <td class="r"><input class="price" data-i="${i}" data-f="qty" value="${esc(r2(+r.qty || 0))}"></td><td><input class="cell" style="width:60px" data-i="${i}" data-f="unit" value="${esc(r.unit)}"></td>
      <td class="r">${r.price_src ? `${fmt(r.price)}<span class="src">${esc(r.price_src)}</span>` : `<input class="price" data-i="${i}" data-f="price" value="${esc(r2(+r.price || 0))}">`}<button class="btn small sv-go" data-svpr="pr2:${esc(r.id || '')}">${r.price_src ? 'ดูราคาสืบ' : 'สืบราคา'}</button></td><td class="r">${fmt(c.eq)}</td>
      <td class="r"><input class="price" data-i="${i}" data-f="install" value="${esc(r2(+r.install || 0))}"></td><td class="r">${fmt(c.inst)}</td>
      <td class="r">${fmt(r2(c.eq + c.inst))}</td><td><button class="btn small" data-del2="${i}">ลบ</button></td></tr>`;
  });
  t2.innerHTML = h;
  t2.querySelectorAll('input').forEach(el => el.onchange = () => {
    const r = S.boq.pr2[+el.dataset.i]; r[el.dataset.f] = ['qty', 'price', 'install'].includes(el.dataset.f) ? r2(+el.value.replace(/,/g, '') || 0) : el.value; applyPr23Survey();
    autosave(); renderPR23(); renderSummary();
  });
  const goSv = b => b.onclick = () => { if (!b.dataset.svpr.split(':')[1]) { surveyTargets(); renderPR23(); return toast('ใส่ชื่อรายการก่อน'); } S.svOpen = b.dataset.svpr; S.svf = 'all'; $$('#tabs .nav-tab').find(x => x.dataset.tab === 'survey').click(); setTimeout(() => { const c = $(`[data-svi="${CSS.escape(S.svOpen)}"]`); if (c) c.scrollIntoView({ block: 'start' }); }, 120); };
  t2.querySelectorAll('[data-svpr]').forEach(goSv);
  t2.querySelectorAll('[data-del2]').forEach(b => b.onclick = () => { S.boq.pr2.splice(+b.dataset.del2, 1); autosave(); renderPR23(); renderSummary(); });

  const t3 = $('#pr3-table');
  let k = `<tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ค่าใช้จ่ายรวม (ค่าก่อสร้าง)</th><th>หมายเหตุ / เหตุผลความจำเป็น</th><th></th></tr>`;
  S.boq.pr3.forEach((r, i) => {
    k += `<tr><td class="r">${i + 1}</td><td><input class="cell" list="pr3-list" data-i="${i}" data-f="name" value="${esc(r.name)}"></td>
      <td class="r"><input class="price" data-i="${i}" data-f="qty" value="${esc(r2(+r.qty || 0))}"></td><td><input class="cell" style="width:60px" data-i="${i}" data-f="unit" value="${esc(r.unit)}"></td>
      <td class="r">${r.price_src ? `${fmt(r.amount)}<span class="src">${esc(r.price_src)}</span>` : `<input class="price" data-i="${i}" data-f="amount" value="${esc(r2(+r.amount || 0))}">`}<button class="btn small sv-go" data-svpr="pr3:${esc(r.id || '')}">${r.price_src ? 'ดูราคาสืบ' : 'สืบราคา'}</button></td>
      <td><input class="cell" data-i="${i}" data-f="note" value="${esc(r.note)}"></td><td><button class="btn small" data-del3="${i}">ลบ</button></td></tr>`;
  });
  k += `<tr class="total"><td></td><td colspan="3">รวมค่าใช้จ่ายพิเศษตามข้อกำหนดทุกรายการ</td><td class="r">${fmt(pr3Total())}</td><td colspan="2"></td></tr>`;
  setTimeout(() => t3.querySelectorAll('[data-svpr]').forEach(goSv), 0);
  t3.innerHTML = k + `<datalist id="pr3-list">${PR3_TEMPLATES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  t3.querySelectorAll('input').forEach(el => el.onchange = () => {
    const r = S.boq.pr3[+el.dataset.i]; r[el.dataset.f] = ['qty', 'amount'].includes(el.dataset.f) ? r2(+el.value.replace(/,/g, '') || 0) : el.value; applyPr23Survey();
    autosave(); renderPR23(); renderSummary();
  });
  t3.querySelectorAll('[data-del3]').forEach(b => b.onclick = () => { S.boq.pr3.splice(+b.dataset.del3, 1); autosave(); renderPR23(); renderSummary(); });
}
const roundDown1000 = x => Math.floor(r2(x) / 1000 + 1e-9) * 1000;
const pr3Total = () => r2(S.boq.pr3.reduce((a, r) => a + r2(+r.amount || 0), 0));

// ------------------------------------------------------------------ สรุป ปร.1(ก) ปร.2(ก) ปร.4
function renderSummary() { clearTimeout(renderSummary._t); renderSummary._t = setTimeout(() => { _renderSummary(); renderPlan(); }, 0); }
function _renderSummary() {
  const box = $('#summary');
  if (!S.model) { box.innerHTML = '<div class="card hint">เปิดโมเดลก่อน</div>'; return; }
  const T = totals(), pr = T.pr, p = S.boq.project, fc = S.boq.factor;
  const { secs, cost, ff, build, eq, eqV, ins, insV, eqTotal, sp, grand } = T;
  const head = `<div class="head"><span>ชื่อโครงการ ${esc(p.name)}</span><span>สถานที่ก่อสร้าง ${esc(p.location)}</span>
    <span>แบบเลขที่ ${esc(p.drawing_no || '-')}</span><span>หน่วยงาน ${esc(p.agency)}</span><span>คำนวณ${RG()}เมื่อวันที่ ${esc(p.calc_date)}</span><span>หน่วย : บาท</span></div>`;
  return renderSummaryDoc({ pr, p, fc, secs, cost, ff, build, eq, eqV, ins, insV, eqTotal, sp, grand, head, box });
}
function totals() {
  const pr = priceAll();
  const fc = S.boq.factor;
  const secs = SECTIONS.map(([c, n]) => ({ c, n, cost: r2(pr.filter(r => sectionOf(r.group_code) === c).reduce((a, r) => a + r.total, 0)) })).filter(s => s.cost);
  const cost = r2(secs.reduce((a, s) => a + s.cost, 0));
  const ff = FactorF.compute(cost, { advance: +fc.advance, retention: +fc.retention, loanShare: (+fc.loanPct || 0) / 100 });
  secs.forEach(s => { s.build = r2(s.cost * ff.F); });
  const build = r2(secs.reduce((a, s) => a + s.build, 0));
  const p2 = S.boq.pr2.map(pr2Row);
  const eq = r2(p2.reduce((a, c) => a + c.eq, 0)), eqV = r2(p2.reduce((a, c) => a + c.eqVat, 0));
  const ins = r2(p2.reduce((a, c) => a + c.inst, 0)), insV = r2(p2.reduce((a, c) => a + c.instVat, 0));
  const eqTotal = r2(eq + eqV + ins + insV), sp = pr3Total();
  const grand = r2(build + eqTotal + sp);
  return { pr, secs, cost, ff, build, eq, eqV, ins, insV, eqTotal, sp, grand };
}
// ---------------------------------------------------------------- ส่งออก Excel ตามแบบฟอร์มหน่วยงาน (lib/formxlsx.js + boq/form_template.xlsx)
const EXCELJS = { src: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', sri: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz' };
function loadScript(src, sri) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; } s.onload = ok; s.onerror = () => no(new Error('โหลดไม่ได้: ' + src)); document.head.appendChild(s); });
}
function formData() {
  const T = totals(), p = S.boq.project, fc = S.boq.factor;
  const sections = SECTIONS.map(([c, n]) => {
    const inSec = T.pr.filter(r => sectionOf(r.group_code) === c);
    const codes = [...new Set(inSec.map(r => r.group_code))];
    return { code: c, name: n, groups: codes.map(g => { const gr = inSec.filter(r => r.group_code === g);
      return { code: g, name: gr[0].group || '', rows: gr.map(r => ({ name: r.name, qty: r.qty, unit: r.unit, mat: r.mat_unit, lab: r.lab_unit })) }; }) };
  }).filter(s => s.groups.length);
  return { mode: p.mode || 'estimate', project: p, people: people(), sections,
    factor: { F: T.ff.F, advance: +fc.advance || 0, retention: +fc.retention || 0, loanShare: (+fc.loanPct || 0) / 100, table: FactorF.TABLES[`adv${+fc.advance || 0}_ret${+fc.retention || 0}`] || [] },
    pr2: S.boq.pr2, pr3: S.boq.pr3, expect: T.grand };
}
async function exportXlsx() {
  if (!S.model) { toast('เปิดโมเดลก่อน'); return; }
  toast('กำลังสร้างไฟล์ Excel…');
  try {
    if (!window.ExcelJS) await loadScript(EXCELJS.src, EXCELJS.sri);
    if (!window.FormXlsx) await loadScript('../lib/formxlsx.js?v=' + (window.UD_VERSION ? UD_VERSION.v : ''));
    const buf = await (await fetch('form_template.xlsx', { cache: 'no-cache' })).arrayBuffer();
    const o = await FormXlsx.build(window.ExcelJS, buf, formData());
    const out = await o.wb.xlsx.writeBuffer();
    const nm = (S.boq.project.mode === 'central' ? 'ราคากลาง_' : 'ประมาณราคา_') + (S.boq.project.name || 'โครงการ').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60) + '.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = nm; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('ส่งออก ' + nm);
  } catch (e) { console.error(e); toast('ส่งออก Excel ไม่สำเร็จ: ' + e.message); }
}
function renderSummaryDoc({ pr, p, fc, secs, cost, ff, build, eq, eqV, ins, insV, eqTotal, sp, grand, head, box }) {
  const est = p.mode === 'estimate', show = est ? roundDown1000(grand) : grand;   // คิดเพียง เฉพาะประมาณราคา · ราคากลางไม่ปัด
  const sig = sigHtml();
  box.innerHTML = `<div class="kpis no-print">${kpiHtml({ pr, cost, ff, grand }, S.plan)}</div>
  <div class="sum-doc"><h3>แบบ ปร.1 (ก) แบบสรุปค่าก่อสร้าง ค่างานต้นทุน</h3>${head}
    <div class="table-wrap"><table class="boq"><tr><th>ลำดับที่</th><th>รายการ</th><th>ค่างานต้นทุน</th><th>Factor F</th><th>ค่าก่อสร้าง</th><th>หมายเหตุ</th></tr>
    ${secs.map((s, i) => `<tr><td class="r">${i + 1}</td><td>${s.c} ${esc(s.n)}</td><td class="r">${fmt(s.cost)}</td><td class="r">${ff.F.toFixed(4)}</td><td class="r">${fmt(s.build)}</td><td></td></tr>`).join('')}
    <tr class="total"><td></td><td>รวมค่าก่อสร้าง</td><td class="r">${fmt(cost)}</td><td></td><td class="r">${fmt(build)}</td><td></td></tr></table></div>
    <p class="hint" style="margin-top:8px">เงื่อนไขการใช้ตาราง Factor F: เงินค่าจ้างล่วงหน้า ${fc.advance}% · เงินประกันผลงาน ${fc.retention}% · ดอกเบี้ยเงินกู้ ${ff.interest}% · ภาษีมูลค่าเพิ่ม ${ff.vat}%${ff.loanShare ? ` · เงินกู้ไม่เสีย VAT ${+(ff.loanShare * 100).toFixed(2)}%` : ''}</p>
    ${p.area ? `<p class="hint">ขนาดหรือเนื้อที่อาคาร ${fmt(p.area)} ตร.ม. · เฉลี่ย ${fmt(r2(build / p.area))} บาท/ตร.ม.</p>` : ''}${sig}</div>
  <div class="sum-doc"><h3>รายละเอียดการหาค่า Factor F</h3>
    <p class="hint">ค่างานต้นทุนทั้งโครงการ ${fmt(cost)} บาท = ${(cost / 1e6).toFixed(6)} ล้านบาท</p>
    ${ff.detail.map(d => `<p class="mono" style="font-size:13px;margin-top:4px">${esc(d)}</p>`).join('')}
    <p class="hint" style="margin-top:6px">ตามเล่มหลักเกณฑ์อาคาร 2569 ข้อ 9.3 · ทศนิยม 4 ตำแหน่งแบบตัดทิ้ง · ${esc(FactorF.SOURCE)}</p></div>
  ${S.boq.pr2.length ? `<div class="sum-doc"><h3>แบบ ปร.2 (ก) แบบสรุปค่าครุภัณฑ์จัดซื้อ</h3>${head}
    <div class="table-wrap"><table class="boq"><tr><th>รายการ</th><th>ค่าครุภัณฑ์</th><th>VAT</th><th>จำนวนเงิน</th><th>ค่าติดตั้ง</th><th>VAT</th><th>จำนวนเงิน</th><th>รวมค่าครุภัณฑ์จัดซื้อ</th></tr>
    <tr><td>ครุภัณฑ์จัดซื้อ</td><td class="r">${fmt(eq)}</td><td class="r">${fmt(eqV)}</td><td class="r">${fmt(r2(eq + eqV))}</td><td class="r">${fmt(ins)}</td><td class="r">${fmt(insV)}</td><td class="r">${fmt(r2(ins + insV))}</td><td class="r">${fmt(eqTotal)}</td></tr></table></div>${sig}</div>` : ''}
  <div class="sum-doc"><h3>แบบ ปร.4 แบบสรุป${RG()}งานก่อสร้างอาคาร</h3>${head}
    <div class="table-wrap"><table class="boq"><tr><th>ลำดับที่</th><th>รายการ</th><th>ค่าก่อสร้าง</th><th>หมายเหตุ</th></tr>
    <tr><td class="r">1</td><td>ค่างานต้นทุน</td><td class="r">${fmt(build)}</td><td></td></tr>
    ${secs.map(s => `<tr><td></td><td>&nbsp;&nbsp;- ${s.c} ${esc(s.n)}</td><td class="r">${fmt(s.build)}</td><td></td></tr>`).join('')}
    <tr><td class="r">2</td><td>ค่าครุภัณฑ์จัดซื้อ</td><td class="r">${fmt(eqTotal)}</td><td></td></tr>
    <tr><td class="r">3</td><td>ค่าใช้จ่ายพิเศษตามข้อกำหนด (ถ้ามี)</td><td class="r">${fmt(sp)}</td><td></td></tr>
    <tr class="total"><td></td><td>รวมค่าก่อสร้างทั้งโครงการงานก่อสร้าง</td><td class="r">${fmt(grand)}</td><td></td></tr>
    ${est ? `<tr class="total"><td></td><td>คิดเพียง</td><td class="r">${fmt(show)}</td><td></td></tr>` : ''}</table></div>
    ${est ? `<p class="hint" style="text-align:right;margin-top:8px">รวม ${fmt(grand)} บาท · คิดเพียง (ปัดลงหลักพัน)</p>` : ''}
    <p class="bigtotal" style="margin-top:${est ? 2 : 12}px">${est ? 'คิดเพียง' : RG()} ${fmt(show)} บาท</p>
    <p style="text-align:right">(${esc(BoqCalc.bahtText(show))})</p>${sig}</div>`;
}

// ------------------------------------------------------------------ แผนงาน / งวดงาน
const WD = [['จ', 1], ['อ', 2], ['พ', 3], ['พฤ', 4], ['ศ', 5], ['ส', 6], ['อา', 0]];
const thDate = s => { if (!s) return ''; const d = Schedule.parse(s); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); };
function planCfg() {
  const pl = S.boq.plan;
  if (!pl.start) { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); pl.start = Schedule.iso(d); }
  return { start: pl.start, workdays: pl.workdays, holidays: pl.holidays, durations: pl.durations };
}
function computePlan() {
  const T = totals();
  const plan = Schedule.build(T.pr, S.model, planCfg());
  const fc = S.boq.factor, ins = S.boq.plan.inst;
  // มูลค่าที่จ่ายตามงวด = ค่าก่อสร้าง (ค่างานต้นทุน × F) + ค่าใช้จ่ายพิเศษ ปร.3; ครุภัณฑ์ ปร.2 จ่ายแยกตามการส่งมอบ
  const contract = r2(T.build + T.sp);
  const inst = Schedule.installments(plan, { n: +ins.n || 1, mode: ins.mode, assign: ins.assign, advance: +fc.advance, retention: +fc.retention }, contract);
  return { T, plan, inst, contract };
}
function renderPlan() { clearTimeout(renderPlan._t); renderPlan._t = setTimeout(_renderPlan, 0); }
function _renderPlan() {
  const pl = S.boq.plan;
  $('#pl-wd').innerHTML = WD.map(([n, d]) => `<label class="wd-cb"><input type="checkbox" data-wd="${d}" ${pl.workdays.includes(d) ? 'checked' : ''}>${n}</label>`).join('');
  $$('#pl-wd [data-wd]').forEach(cb => cb.onchange = () => {
    const d = +cb.dataset.wd; pl.workdays = cb.checked ? [...new Set(pl.workdays.concat(d))] : pl.workdays.filter(x => x !== d);
    if (!pl.workdays.length) { pl.workdays = [d]; cb.checked = true; return toast('ต้องมีวันทำงานอย่างน้อย 1 วัน'); }
    autosave(); renderPlan();
  });
  if (!S.model || !S.db) { $('#pl-sum').textContent = S.model ? 'กำลังโหลดราคา…' : 'เปิดโมเดลก่อน'; return; }
  const { T, plan, inst, contract } = computePlan();
  const planChanged = !S.plan || S.plan.finish !== plan.finish || S.plan.total !== plan.total || S.plan.start !== plan.start;
  S.plan = plan; S.inst = inst;
  if (planChanged && TL.day === null && !TL.timer) tlReset();
  $('#pl-start').value = pl.start; $('#pl-n').value = pl.inst.n; $('#pl-mode').value = pl.inst.mode;
  $('#pl-hol').value = (pl.holidays || []).join('\n');
  $('#pl-sum').innerHTML = `<div class="kv">
    <b>เริ่มงาน</b><span>${thDate(plan.start)}</span><b>แล้วเสร็จ</b><span>${thDate(plan.finish)}</span>
    <b>ระยะเวลาก่อสร้าง</b><span><b style="color:var(--green)">${plan.calDays} วัน</b> (นับวันปฏิทิน) · ทำงาน ${plan.tasks.reduce((m, t) => Math.max(m, t.ef), 0)} วันทำงาน</span>
    <b>ค่างานต้นทุน</b><span>${fmt(T.cost)} บาท (ใช้กระจายลงงาน ${fmt(plan.total)})</span>
    <b>มูลค่าจ่ายตามงวด</b><span>${fmt(contract)} บาท = ค่าก่อสร้าง × F${T.sp ? ' + ปร.3' : ''} (ไม่รวมครุภัณฑ์ ปร.2)</span>
    <b>งวดงาน</b><span>${inst.list.length} งวด · ${pl.inst.mode === 'manual' ? 'กำหนดตามเนื้องาน' : 'อัตโนมัติตาม % ผลงานสะสม'}</span></div>
    ${inst.warns.length ? `<p class="alert" style="margin-top:6px">${inst.warns.map(esc).join(' · ')}</p>` : ''}
    ${Math.abs(plan.total - T.cost) > 1 ? `<p class="alert">ค่างานที่กระจายลงงานไม่ครบ (${fmt(plan.total)} จาก ${fmt(T.cost)})</p>` : ''}`;
  // ตารางงาน
  const manual = pl.inst.mode === 'manual';
  const n = inst.list.length;
  $('#pl-table').innerHTML = `<tr><th>ลำดับ</th><th>งาน</th><th>วันทำงาน</th><th>เริ่ม</th><th>เสร็จ</th><th>ค่างาน (บาท)</th><th>%</th><th>งวดที่</th></tr>` +
    plan.tasks.map((t, i) => `<tr class="row" data-task="${esc(t.id)}"><td class="r">${i + 1}</td>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${t.color};margin-right:6px"></span>${esc(t.label)}<span class="src">${esc(t.why)}${t.manual ? ` · ค่าตั้งต้น ${t.auto} วัน` : ''}</span></td>
      <td class="r"><input class="days ${t.manual ? 'ov' : ''}" data-dur="${esc(t.id)}" value="${t.days}" inputmode="numeric"></td>
      <td>${thDate(t.start)}</td><td>${thDate(t.finish)}</td><td class="r">${fmt(t.cost)}</td><td class="r">${t.pct.toFixed(2)}</td>
      <td>${manual ? `<select data-asg="${esc(t.id)}">${Array.from({ length: n }, (_, k) => `<option ${inst.assign[t.id] === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select>` : inst.assign[t.id]}</td></tr>`).join('') +
    `<tr class="total"><td></td><td colspan="4">รวม</td><td class="r">${fmt(plan.total)}</td><td class="r">100.00</td><td></td></tr>`;
  $$('#pl-table [data-dur]').forEach(el => el.onchange = () => {
    const v = parseInt(el.value, 10); if (v > 0) pl.durations[el.dataset.dur] = v; else delete pl.durations[el.dataset.dur];
    autosave(); renderPlan();
  });
  $$('#pl-table [data-asg]').forEach(el => el.onchange = () => { pl.inst.assign[el.dataset.asg] = +el.value; autosave(); renderPlan(); });
  $$('#pl-table tr.row').forEach(tr => tr.addEventListener('click', e => { if (['INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName)) return; selectTask(tr.dataset.task); }));
  renderGantt(plan, inst, '#pl-gantt'); renderSCurve(plan, inst, '#pl-scurve', true); renderInst(inst, contract, '#pl-inst', true);
  renderGantt(plan, inst, '#dk-gantt-svg'); renderSCurve(plan, inst, '#dk-scurve-svg', false); renderInst(inst, contract, '#dk-inst-table', false);
  renderHud(T, plan); renderDockBoq(T, plan); renderSideSum(T, plan);
}
function selectTask(id) {
  const t = S.plan && S.plan.tasks.find(x => x.id === id); if (!t) return;
  S.selTask = id;
  $$('#pl-table tr.row').forEach(x => x.classList.toggle('sel', x.dataset.task === id));
  $$('.gantt .bar').forEach(b => b.classList.toggle('sel', b.dataset.task === id));
  if (S.viewer) S.viewer.highlight(t.from);
  toast(`${t.label}: ${t.from.length} ชิ้นส่วน${$('#page-model').classList.contains('active') ? '' : ' — ดูในแท็บโมเดล 3D'}`);
}
function renderGantt(plan, inst, sel) {
  const narrow = innerWidth < 800, days = plan.calDays, rowH = 24, left = narrow ? 128 : 250, top = 34, W = Math.max(720, left + days * 12 + 20);
  const sx = (W - left - 20) / days, H = top + plan.tasks.length * rowH + 10;
  const x = d => left + Schedule.parse(d).getTime() / 864e5 * sx - Schedule.parse(plan.start).getTime() / 864e5 * sx;
  let g = `<svg class="gantt" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  // เส้นแบ่งรายสัปดาห์ + เดือน
  for (let i = 0; i <= days; i++) {
    const d = Schedule.addDays(Schedule.parse(plan.start), i);
    if (d.getDay() === 1 || i === 0) { const xx = left + i * sx; g += `<line class="grid" x1="${xx}" y1="${top - 6}" x2="${xx}" y2="${H}"/><text x="${xx + 2}" y="${top - 10}">${d.getDate()}/${d.getMonth() + 1}</text>`; }
  }
  g += `<text x="${left}" y="12">วันที่ (สัปดาห์เริ่มวันจันทร์) · รวม ${days} วัน</text>`;
  plan.tasks.forEach((t, i) => {
    const y = top + i * rowH, x0 = x(t.start), x1 = x(t.finish) + sx;
    g += `<text x="6" y="${y + 15}">${esc(t.label.length > (narrow ? 17 : 34) ? t.label.slice(0, narrow ? 16 : 33) + '…' : t.label)}</text>
      <rect class="bar ${S.selTask === t.id ? 'sel' : ''}" data-task="${esc(t.id)}" x="${x0}" y="${y + 4}" width="${Math.max(3, x1 - x0)}" height="${rowH - 9}" rx="3" fill="${t.color}"><title>${esc(t.label)}\n${thDate(t.start)} – ${thDate(t.finish)} (${t.days} วันทำงาน)\n${fmt(t.cost)} บาท (${t.pct}%)</title></rect>`;
  });
  inst.list.forEach(c => { if (!c.due) return; const xx = x(c.due) + sx; g += `<line class="cut" x1="${xx}" y1="${top - 4}" x2="${xx}" y2="${H}"/><text class="cutlbl" x="${xx + 2}" y="${H - 2}">งวด ${c.no}</text>`; });
  $(sel).innerHTML = g + '</svg>';
  $$(sel + ' .bar').forEach(b => b.onclick = () => selectTask(b.dataset.task));
}
function renderSCurve(plan, inst, sel, jump) {
  const W = 760, H = jump ? 300 : 230, l = 44, r = 60, t = 14, b = 34, c = plan.curve;
  const sx = (W - l - r) / Math.max(1, c.length), sy = (H - t - b) / 100;
  const X = i => l + i * sx, Y = p => H - b - p * sy;
  let g = `<svg class="scurve" width="100%" viewBox="0 0 ${W} ${H}" style="max-width:${jump ? W + 'px' : '100%'}">`;
  // แท่งค่างานรายสัปดาห์ (แกนขวา)
  const wk = []; for (let i = 0; i < c.length; i += 7) { const a = i ? c[i - 1].pct : 0, z = c[Math.min(c.length, i + 7) - 1].pct; wk.push({ i, v: (z - a) / 100 * plan.total }); }
  const wmax = Math.max(1, ...wk.map(w => w.v));
  wk.forEach(w => { const h = w.v / wmax * (H - t - b) * 0.45; g += `<rect class="wk" x="${X(w.i) + 1}" y="${Y(0) - h}" width="${Math.max(1, sx * 7 - 2)}" height="${h}"><title>สัปดาห์เริ่ม ${thDate(c[w.i].date)} · ${fmt(w.v)} บาท</title></rect>`; });
  g += `<text x="${W - r + 6}" y="${Y(45) + 4}">${fmt(wmax, 0)}</text><text x="${W - r + 6}" y="${Y(0) + 4}">บาท/สัปดาห์</text>`;
  for (let p = 0; p <= 100; p += 20) g += `<line class="grid" x1="${l}" y1="${Y(p)}" x2="${W - r}" y2="${Y(p)}"/><text x="${l - 6}" y="${Y(p) + 4}" text-anchor="end">${p}%</text>`;
  const step = Math.max(1, Math.round(c.length / 8));
  for (let i = 0; i < c.length; i += step) g += `<text x="${X(i)}" y="${H - b + 16}" text-anchor="middle">${thDate(c[i].date)}</text>`;
  g += `<path class="ln" d="M${l},${Y(0)} ${c.map((p, i) => `L${X(i + 1)},${Y(p.pct)}`).join(' ')}"/>`;
  inst.list.forEach(k => {
    const i = c.findIndex(p => p.date === k.due); if (i < 0) return;
    g += `<line class="cut" x1="${X(i + 1)}" y1="${Y(0)}" x2="${X(i + 1)}" y2="${Y(c[i].pct)}"/><circle cx="${X(i + 1)}" cy="${Y(c[i].pct)}" r="3.5" fill="var(--green)"><title>งวด ${k.no} · ${thDate(k.due)} · ผลงานตามแผน ${c[i].pct.toFixed(2)}%</title></circle><text x="${X(i + 1) - 4}" y="${Y(c[i].pct) - 6}" text-anchor="end" style="fill:var(--green)">${c[i].pct.toFixed(1)}%</text>`;
  });
  $(sel).innerHTML = g + (jump ? `<text x="${W - r}" y="${t + 8}" text-anchor="end">คลิกกราฟเพื่อดูอาคาร ณ วันนั้นในแท็บโมเดล 3D</text>` : '') + '</svg>';
  const svg = $(sel + ' svg'); svg.style.cursor = 'pointer';
  svg.onclick = e => {
    const rc = svg.getBoundingClientRect(), xv = (e.clientX - rc.left) / rc.width * W;
    const day = Math.max(1, Math.min(c.length, Math.round((xv - l) / sx)));
    if (jump) { $$('#tabs .nav-tab').find(x => x.dataset.tab === 'model').click(); setDock('time'); }
    setTimeout(() => tlSet(day), 50);
  };
}
function renderInst(inst, contract, sel, full) {
  const fc = S.boq.factor, L = inst.list;
  const sum = k => r2(L.reduce((a, g) => a + g[k], 0));
  if (!full) {
    $(sel).innerHTML = `<tr><th>งวด</th><th>เนื้องาน</th><th>ครบกำหนด</th><th>%</th><th>สะสม</th><th>จำนวนเงิน</th><th>จ่ายสุทธิ</th></tr>` +
      L.map(g => `<tr class="row" data-inst="${g.no}"><td class="r">${g.no}</td><td>${g.labels.map(x => esc(x.replace(/ — .*/, ''))).join(', ')}</td><td>${thDate(g.due)}</td><td class="r">${g.pct.toFixed(2)}</td><td class="r">${g.cumPct.toFixed(2)}</td><td class="r">${fmt(g.amount)}</td><td class="r">${fmt(g.net)}</td></tr>`).join('');
    $$(sel + ' tr[data-inst]').forEach(tr => tr.onclick = () => {
      const g = L[+tr.dataset.inst - 1]; const ids = S.plan.tasks.filter(t => g.tasks.includes(t.id)).flatMap(t => t.from);
      $$(sel + ' tr').forEach(x => x.classList.toggle('sel', x === tr));
      if (S.viewer) S.viewer.highlight(ids); toast(`งวด ${g.no}: ${ids.length} ชิ้นส่วน`);
    });
    return;
  }
  $(sel).innerHTML = `<tr><th>งวดที่</th><th>เนื้องานที่ต้องแล้วเสร็จ</th><th>กำหนดแล้วเสร็จ</th><th>% งวด</th><th>% สะสม</th><th>จำนวนเงิน</th><th>หักเงินล่วงหน้า ${fc.advance}%</th><th>หักประกันผลงาน ${fc.retention}%</th><th>จ่ายสุทธิ</th></tr>` +
    L.map(g => `<tr><td class="r">${g.no}</td><td>${g.labels.map(esc).join('<br>') || '<span class="alert">ไม่มีงาน</span>'}</td>
      <td>${thDate(g.due)}${g.due ? `<span class="src">วันที่ ${Schedule.parse(g.due) - Schedule.parse(S.plan.start) >= 0 ? Math.round((Schedule.parse(g.due) - Schedule.parse(S.plan.start)) / 864e5) + 1 : ''} นับจากเริ่มงาน</span>` : ''}</td>
      <td class="r">${g.pct.toFixed(2)}</td><td class="r">${g.cumPct.toFixed(2)}</td><td class="r">${fmt(g.amount)}</td><td class="r">${fmt(g.advance)}</td><td class="r">${fmt(g.retention)}</td><td class="r">${fmt(g.net)}</td></tr>`).join('') +
    `<tr class="total"><td></td><td colspan="2">รวม</td><td class="r">${r2(L.reduce((a, g) => a + g.pct, 0)).toFixed(2)}</td><td></td><td class="r">${fmt(sum('amount'))}</td><td class="r">${fmt(sum('advance'))}</td><td class="r">${fmt(sum('retention'))}</td><td class="r">${fmt(sum('net'))}</td></tr>`;
  $('#pl-instnote').innerHTML = `% ของงวด = ค่างานของงานในงวด ÷ ค่างานรวม (ปัด 2 ตำแหน่ง งวดสุดท้ายรับเศษให้ครบ 100%) · จำนวนเงิน = ${fmt(contract)} × % งวด ·
    เงินล่วงหน้าและประกันผลงานใช้ % เดียวกับเงื่อนไข Factor F ในหน้าโครงการ · เงินประกันผลงานคืนตามเงื่อนไขสัญญา (ไม่รวมในตาราง)`;
}

// ------------------------------------------------------------------ เทียบรุ่น
function totalsFor(model) {
  // แถวรุ่นเก่าที่ไม่มีการผูกราคา ใช้การผูกราคาของแถว key เดียวกันในรุ่นปัจจุบัน (ให้เทียบด้วยราคาชุดเดียวกัน)
  const ref = Object.fromEntries(((S.model.quantities && S.model.quantities.items) || []).map(r => [r.key, r.price_ref]));
  const rs = PriceMap.bindAll(((model.quantities && model.quantities.items) || []).map(r => (r.price_ref || !ref[r.key]) ? r : Object.assign({}, r, { price_ref: ref[r.key] })), S.pmap)
    .concat(S.boq.custom_rows || []);
  const pr = BoqCalc.priceRows(S.db, window.UDPrice, rs, { overrides: S.boq.overrides });
  const fc = S.boq.factor, cost = r2(pr.reduce((a, r) => a + r.total, 0));
  const ff = FactorF.compute(cost, { advance: +fc.advance, retention: +fc.retention, loanShare: (+fc.loanPct || 0) / 100 });
  const secs = SECTIONS.map(([c]) => r2(r2(pr.filter(r => sectionOf(r.group_code) === c).reduce((a, r) => a + r.total, 0)) * ff.F));
  const build = r2(secs.reduce((a, b) => a + b, 0));
  const T = totals(), grand = r2(build + T.eqTotal + T.sp);
  const plan = Schedule.build(pr, model, planCfg());
  return { pr, cost, F: ff.F, build, grand, plan };
}
function renderDiff() {
  const out = $('#diff-out');
  if (!S.old) { out.innerHTML = ''; return; }
  if (!S.model || !S.db) { out.innerHTML = '<div class="card hint">เปิดโมเดลปัจจุบันและรอโหลดราคาก่อน</div>'; return; }
  const A = totalsFor(S.old.model), B = totalsFor(S.model), E = BmDiff.elements(S.old.model, S.model), R = BmDiff.rows(A.pr, B.pr);
  S.diffIds = [...E.added, ...E.changed].map(e => e.id);
  const d = (a, b, n = 2) => { const x = r2(b - a); return `<span style="color:${x > 0 ? 'var(--amber)' : x < 0 ? 'var(--cyan)' : 'var(--text3)'}">${x > 0 ? '+' : ''}${fmt(x, n)}</span>`; };
  const k = (l, a, b, u, n = 2) => `<div class="kpi"><span>${l}</span><b>${fmt(b, n)}<small>${u}</small></b><span>เดิม ${fmt(a, n)} · ต่าง ${d(a, b, n)}${a ? ` (${((b - a) / a * 100).toFixed(1)}%)` : ''}</span></div>`;
  const ch = R.filter(r => r.status !== 'same');
  const el = [...E.added.map(e => ['เพิ่ม', e]), ...E.removed.map(e => ['ลบ', e]), ...E.changed.map(e => ['แก้', e])];
  const stale = [S.old.model, S.model].filter(m => m.quantities && m.quantities.stale).length;
  out.innerHTML = `<div class="kpis">${k('ค่างานต้นทุน', A.cost, B.cost, 'บ.')}${k(RG(), A.grand, B.grand, 'บ.')}${k('Factor F', A.F, B.F, '', 4)}${k('ระยะเวลา', A.plan.calDays, B.plan.calDays, 'วัน', 0)}</div>
  ${stale ? '<p class="alert">มีโมเดลที่ปริมาณเก่า (แก้โมเดลหลังถอดปริมาณ) — ถอดปริมาณใหม่ก่อนเทียบ</p>' : ''}
  <div class="card"><h2>ชิ้นส่วนที่เปลี่ยน (${el.length})</h2>${el.length ? `<div class="table-wrap"><table class="boq"><tr><th>สถานะ</th><th>ประเภท</th><th>id</th><th>สิ่งที่เปลี่ยน</th></tr>${el.map(([t, e]) =>
    `<tr class="row" data-id="${esc(e.id)}"><td><span class="pill ${t === 'เพิ่ม' ? 'ok' : t === 'ลบ' ? 'err' : 'warn'}">${t}</span></td><td>${esc(BmDiff.SETS[e.set])}</td><td class="mono">${esc(e.id)}</td><td>${e.fields ? e.fields.map(f => `<b>${esc(f)}</b> ${e.before && f in e.before ? `<span class="mono">${esc(JSON.stringify(e.before[f]))} → ${esc(JSON.stringify(e.after[f]))}</span>` : ''}`).join('<br>') : ''}</td></tr>`).join('')}</table></div>` : '<p class="hint">ไม่มีชิ้นส่วนที่เปลี่ยน</p>'}</div>
  <div class="card"><h2>รายการ BOQ ที่เปลี่ยน (${ch.length} จาก ${R.length})</h2><div class="table-wrap"><table class="boq"><tr><th>หมวด</th><th>รายการ</th><th>หน่วย</th><th>ปริมาณเดิม</th><th>ใหม่</th><th>ต่าง</th><th>เงินเดิม</th><th>ใหม่</th><th>ต่าง</th></tr>
    ${ch.map(r => `<tr class="row" data-key="${esc(r.key)}"><td class="mono">${esc(r.group_code)}</td><td>${esc(r.name)} ${r.status !== 'changed' ? `<span class="pill ${r.status === 'added' ? 'ok' : 'err'}">${r.status === 'added' ? 'ใหม่' : 'ตัดออก'}</span>` : ''}</td><td>${esc(r.unit)}</td>
      <td class="r">${fmt(r.q0)}</td><td class="r">${fmt(r.q1)}</td><td class="r">${d(r.q0, r.q1)}</td><td class="r">${fmt(r.t0)}</td><td class="r">${fmt(r.t1)}</td><td class="r">${d(r.t0, r.t1)}</td></tr>`).join('')}
    <tr class="total"><td></td><td colspan="5">รวมค่างานต้นทุน</td><td class="r">${fmt(A.cost)}</td><td class="r">${fmt(B.cost)}</td><td class="r">${d(A.cost, B.cost)}</td></tr></table></div></div>`;
  $$('#diff-out tr[data-id]').forEach(tr => tr.onclick = () => { if (S.viewer) S.viewer.highlight([tr.dataset.id]); toast(`ไฮไลต์ ${tr.dataset.id} ในแท็บโมเดล 3D`); });
  $$('#diff-out tr[data-key]').forEach(tr => tr.onclick = () => { const r = R.find(x => x.key === tr.dataset.key); if (S.viewer) S.viewer.highlight(r.from); toast(`ไฮไลต์ ${r.from.length} ชิ้นส่วนในแท็บโมเดล 3D`); });
  $('#diff-status').innerHTML = `เทียบ <b>${esc(S.old.name)}</b> (เดิม) กับ <b>${esc(S.modelName)}</b> (ปัจจุบัน) · ชิ้นส่วน เพิ่ม ${E.added.length} · ลบ ${E.removed.length} · แก้ ${E.changed.length}`;
}

// ------------------------------------------------------------------ Clash
const SEV = { error: ['ร้ายแรง', 'err'], warn: ['เตือน', 'warn'], info: ['ข้อมูล', ''] };
// กฎกระทรวง 55 ข้อ 33/41/44/50 — ข้อมูลที่ดินเก็บใน S.boq.site · ไม่ครบ = "ข้อมูลไม่ครบ" (ไม่ตัดสิน) · ปิดรายข้อได้
const USE_LBL = { res: 'อยู่อาศัย / อยู่อาศัยรวม', public: 'อาคารสาธารณะ', commercial: 'พาณิชย์ / โรงงาน / ห้องแถว', other: 'อาคารอื่นที่ไม่ใช่อยู่อาศัย' };
function siteCfg() {
  const st = S.boq.site = Object.assign({ useModel: true, landArea: '', use: 'auto', roads: [], coverExtra: '', off: {} }, S.boq.site || {});
  const mb = S.model.site && S.model.site.existing && S.model.site.existing.boundary;
  const occ = String((S.model.meta || {}).occupancy || '');
  const auto = /อยู่อาศัย|บ้าน|หอพัก|อพาร์ต|คอนโด/.test(occ) ? 'res' : /หอประชุม|โรงมหรสพ|สถานศึกษา|โรงเรียน|โรงพยาบาล|ตลาด|สนามกีฬา|ศาสนสถาน|หอสมุด/.test(occ) ? 'public' : /ร้าน|พาณิชย์|โรงงาน|ตึกแถว|คลังสินค้า/.test(occ) ? 'commercial' : 'other';
  return { st, mb, auto, cfg: { boundary: st.useModel && mb ? mb : null, landArea: +st.landArea || 0, use: st.use === 'auto' ? auto : st.use, roads: st.roads, coverExtra: +st.coverExtra || 0, off: st.off } };
}
function renderSiteLaw(L) {
  const box = $('#site-law'); if (!box) return;
  const { st, mb, auto, cfg } = siteCfg(), res = BmClash.siteCheck(S.model, cfg, L), B = cfg.boundary;
  const ST = { pass: ['ผ่าน', 'ok'], fail: ['ไม่ผ่าน', 'err'], missing: ['ข้อมูลไม่ครบ', 'warn'], off: ['ไม่คิด', ''], na: ['ไม่บังคับ', ''] };
  const edgeOpt = sel => (B || []).map((_, i) => `<option value="${i}" ${+sel === i ? 'selected' : ''}>${esc(BmClash.edgeLabel(B, i))}</option>`).join('');
  box.innerHTML = `<h4 style="margin:10px 0 4px;color:var(--green)">ระยะร่นและที่ว่าง (กฎกระทรวง 55)</h4>
    <div class="form-grid site-form">
      <label class="ck"><input type="checkbox" data-st="useModel" ${st.useModel ? 'checked' : ''} ${mb ? '' : 'disabled'}> ใช้เขตที่ดินจากโมเดล${mb ? ` (${mb.length} มุม)` : ' — โมเดลไม่มีเขตที่ดิน'}</label>
      <label>พื้นที่ดิน (ตร.ม.) ${B ? '<span class="hint">คิดจากเขตที่ดินแล้ว</span>' : ''}<input data-st="landArea" inputmode="decimal" value="${esc(st.landArea)}" ${B ? 'disabled' : ''} placeholder="ใช้ตรวจข้อ 33 เมื่อไม่มีเขตที่ดิน"></label>
      <label>ประเภทการใช้ (ข้อ 33/41)<select data-st="use"><option value="auto" ${st.use === 'auto' ? 'selected' : ''}>อัตโนมัติ: ${esc(USE_LBL[auto])}</option>${Object.entries(USE_LBL).map(([k, v]) => `<option value="${k}" ${st.use === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label>พื้นที่ปกคลุมอื่นนอกหลังคาอาคาร (ตร.ม.)<input data-st="coverExtra" inputmode="decimal" value="${esc(st.coverExtra)}" placeholder="เช่น โรงจอดรถ ศาลา"></label>
    </div>
    <div class="hint" style="margin-top:6px">ถนนสาธารณะที่ติดที่ดิน (ข้อ 41/44)</div>
    ${(st.roads || []).map((r, i) => `<div class="site-road"><select data-road="${i}" data-rf="edge" ${B ? '' : 'disabled'}>${edgeOpt(r.edge) || '<option>ไม่มีเขตที่ดิน</option>'}</select><input data-road="${i}" data-rf="width" inputmode="decimal" value="${esc(r.width)}" placeholder="กว้าง (ม.)"><button class="btn small" data-road-del="${i}">ลบ</button></div>`).join('')}
    <button class="btn small" id="road-add" ${B ? '' : 'disabled'}>+ เพิ่มถนน</button>
    <table class="mini-boq" style="margin-top:6px">${res.map(r => `<tr><td><span class="pill ${ST[r.status][1]}">${ST[r.status][0]}</span></td><td class="mono" style="color:var(--text3);white-space:nowrap">${esc(r.code)}</td><td>${esc(r.title)}<span class="src">${esc(r.detail)}${r.need ? ' → ' + esc(r.need) : ''}</span></td><td><label class="hint" style="white-space:nowrap"><input type="checkbox" data-off="${r.code === 'ข้อ 33' ? 'c33' : r.code === 'ข้อ 41' ? 'c41' : r.code === 'ข้อ 44' ? 'c44' : 'c50'}" ${r.status === 'off' ? 'checked' : ''}> ไม่คิด</label></td></tr>`).join('')}</table>
    <div class="hint">แนวอาคาร = ผนัง เสา พื้น (ไม่รวมชายคา) · ข้อ 44 ใช้ความสูงตามกฎหมายที่แนวอาคารใกล้ถนนที่สุด (ปลอดภัยไว้ก่อน) · เขตที่ดินที่ติดถนนถือเป็นเขตถนน</div>`;
  const save = () => { autosave(); renderClash(); };
  box.querySelectorAll('[data-st]').forEach(el => el.onchange = () => { st[el.dataset.st] = el.type === 'checkbox' ? el.checked : el.value; save(); });
  box.querySelectorAll('[data-rf]').forEach(el => el.onchange = () => { st.roads[+el.dataset.road][el.dataset.rf] = el.dataset.rf === 'edge' ? +el.value : el.value; save(); });
  box.querySelectorAll('[data-road-del]').forEach(b => b.onclick = () => { st.roads.splice(+b.dataset.roadDel, 1); save(); });
  const add = box.querySelector('#road-add'); if (add) add.onclick = () => { st.roads.push({ edge: 0, width: '' }); save(); };
  box.querySelectorAll('[data-off]').forEach(el => el.onchange = () => { st.off[el.dataset.off] = el.checked; if (!el.checked) delete st.off[el.dataset.off]; save(); });
  const nf = res.filter(r => r.status === 'fail').length, nm = res.filter(r => r.status === 'missing').length;
  $('#legal-sum').textContent += (nf ? ` · ไม่ผ่าน ${nf} ข้อ` : '') + (nm ? ` · ข้อมูลไม่ครบ ${nm} ข้อ` : '');
}
function renderClash() {
  if (!S.model) return;
  const L = BmClash.classify(S.model), yes = L.items.filter(i => i.yes);
  $('#legal-sum').textContent = yes.length ? '· ' + yes.map(i => i.name.split(' (')[0]).join(', ') : '· อาคารทั่วไป';
  $('#legal').innerHTML = `<div class="kv" style="margin:6px 0"><b>ความสูงตามกฎหมาย</b><span>${L.H.toFixed(2)} ม. (วัดจากพื้นดินถึง${esc(L.how)})</span><b>จำนวนชั้น / พื้นที่</b><span>${L.storeys} ชั้น · รวม ${L.areaTotal.toLocaleString()} ตร.ม. · ชั้นมากสุด ${L.areaMax.toLocaleString()} ตร.ม.</span><b>ช่วงยาวสุด</b><span>คาน ${L.span.toFixed(2)} ม. · โครงหลังคา ${L.roofSpan.toFixed(2)} ม.</span></div>
    <table class="mini-boq">${L.items.map(i => `<tr><td><span class="pill ${i.yes ? 'warn' : 'ok'}">${i.yes ? 'เข้าข่าย' : 'ไม่เข้าข่าย'}</span></td><td class="mono" style="color:var(--text3);white-space:nowrap">${esc(i.law)}</td><td>${esc(i.name)}<span class="src">${esc(i.why)}${i.note ? ' · ' + esc(i.note) : ''}</span></td></tr>`).join('')}</table>
    <ul class="hint" style="margin:6px 0 0 18px">${L.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    <div id="site-law"></div>
    <div class="hint" style="margin-top:4px">อ้างอิง: พ.ร.บ.ควบคุมอาคาร 2522 (แก้ไขถึงฉบับที่ 5 พ.ศ. 2558) · กฎกระทรวงฉบับที่ 55 (2543) — ตรวจกับราชกิจจานุเบกษาก่อนใช้อ้างอิงทางกฎหมาย</div>`;
  renderSiteLaw(L);
  const bt = S.boq.clash_bt || (S.model.meta && S.model.meta.building_type) || 'public';
  $('#clash-bt').value = bt;
  const all = BmClash.check(S.model, { buildingType: bt }), ack = S.boq.clash_ack || {};
  S.clashAll = all.filter(c => !ack[c.key]);
  const showInfo = $('#clash-info').checked, showAck = $('#clash-ack').checked;
  const list = all.filter(c => (showInfo || c.sev !== 'info') && (showAck || !ack[c.key]));
  const nErr = all.filter(c => c.sev === 'error' && !ack[c.key]).length, nWarn = all.filter(c => c.sev === 'warn' && !ack[c.key]).length;
  $('#clash-n').innerHTML = nErr ? `<span class="pill err">${nErr}</span>` : nWarn ? `<span class="pill warn">${nWarn}</span>` : '<span class="pill ok">0</span>';
  S.clashes = list;
  $('#clash-table').innerHTML = list.length ? list.map((c, i) => `<tr data-i="${i}"><td><span class="pill ${SEV[c.sev][1]}">${SEV[c.sev][0]}</span></td><td class="mono" style="color:var(--text3)">${c.code}</td>
    <td>${esc(c.title)}<span class="src">${esc(c.detail)}</span></td>
    <td><button class="btn small" data-ack="${esc(c.key)}">${ack[c.key] ? 'ยกเลิกยอมรับ' : 'ยอมรับ'}</button></td></tr>`).join('')
    : `<tr><td class="hint">ไม่พบปัญหา${all.length ? ` (ซ่อน ${all.length} รายการ: ระดับข้อมูล/ยอมรับแล้ว)` : ''}</td></tr>`;
  $$('#clash-table tr[data-i]').forEach(tr => tr.onclick = e => {
    if (e.target.tagName === 'BUTTON') return;
    const c = list[+tr.dataset.i]; $$('#clash-table tr').forEach(x => x.classList.toggle('sel', x === tr));
    if (S.viewer) { S.viewer.highlight(c.ids); if (c.at) S.viewer.focus(c.at, 5); }
  });
  $$('#clash-table [data-ack]').forEach(b => b.onclick = () => {
    const k = b.dataset.ack; S.boq.clash_ack = S.boq.clash_ack || {};
    if (S.boq.clash_ack[k]) delete S.boq.clash_ack[k]; else S.boq.clash_ack[k] = { at: new Date().toISOString().slice(0, 10) };
    autosave(); renderClash();
  });
  if (S.viewer) S.viewer.setMarkers(list.filter(c => c.sev !== 'info' || showInfo));
}

// ------------------------------------------------------------------ HUD / dock
function kpiHtml(T, plan) {
  const mat = r2(T.pr.reduce((a, r) => a + (r.mat_amt || 0), 0)), lab = r2(T.pr.reduce((a, r) => a + (r.lab_amt || 0), 0));
  const area = +S.boq.project.area || 0;
  const k = (l, v, u, hot) => `<div class="kpi ${hot ? 'hot' : ''}"><span>${l}</span><b>${v}${u ? `<small>${u}</small>` : ''}</b></div>`;
  return k('ค่าวัสดุ', fmt(mat, 0), 'บ.') + k('ค่าแรง', fmt(lab, 0), 'บ.') + k('ค่างานต้นทุน', fmt(T.cost, 0), 'บ.') +
    k(`${RG()} (F ${T.ff.F.toFixed(4)})`, fmt(T.grand, 0), 'บ.', true) + (area ? k(`ต่อพื้นที่ ${fmt(area)} ตร.ม.`, fmt(r2(T.grand / area), 0), 'บ./ตร.ม.') : '') +
    (plan ? k('ระยะเวลา', plan.calDays, 'วัน') : '');
}
function renderSideSum(T, plan) {
  const pr = T.pr, area = +S.boq.project.area || 0, q = S.model.quantities || {};
  const sum = (test, unit) => r2(pr.filter(r => test(r.key) && (!unit || r.unit === unit)).reduce((a, r) => a + (+r.qty || 0), 0));
  const it = [
    [RG(), fmt(T.grand, 0), 'บาท', true],
    area ? ['เฉลี่ยต่อพื้นที่', fmt(r2(T.grand / area), 0), `บาท/ตร.ม. (${fmt(area)} ตร.ม.)`] : null,
    plan ? ['ระยะเวลา', plan.calDays, `วัน (${thDate(plan.start)} – ${thDate(plan.finish)})`] : null,
    ['คอนกรีตโครงสร้าง', fmt(sum(k => k.startsWith('conc_'), 'ลบ.ม.')), 'ลบ.ม.'],
    ['เหล็กเสริม', fmt(sum(k => k.startsWith('rebar_'), 'กก.'), 0), 'กก.'],
    ['เหล็กรูปพรรณ', fmt(sum(k => k.startsWith('steel_'), 'กก.'), 0), 'กก.'],
    ['ไม้แบบ', fmt(sum(k => k.startsWith('formwork'))), 'ตร.ม.'],
    ['ผนัง', fmt(sum(k => k.startsWith('wall_'))), 'ตร.ม.'],
    ['หลังคา', fmt(sum(k => k.startsWith('cover_'))), 'ตร.ม.'],
    ['จุดไฟฟ้า', sum(k => k.startsWith('pt_')), 'จุด'],
    ['สายไฟ', fmt(sum(k => k.startsWith('wire_'), 'ม.'), 0), 'ม.'],
    ['ท่อประปา/ระบายน้ำ', fmt(sum(k => k.startsWith('pipe_'), 'ม.'), 0), 'ม.'],
  ].filter(x => x && x[1] !== 0 && x[1] !== '0' && x[1] !== '0.00');
  const nNo = pr.filter(r => r.warns.includes('ยังไม่มีราคา')).length, nAs = pr.filter(r => r.status === 'assumed').length, nNote = (q.notes || []).length;
  $('#side-sum').innerHTML = `<div class="kv">${it.map(([l, v, u, hot]) => `<b>${l}</b><span><em class="${hot ? 'hot' : ''}">${v}</em> ${u}</span>`).join('')}</div>` +
    (nNo ? `<a class="pk-link ss-warn" data-ss="pr1">[!] ยังไม่มีราคา ${nNo} รายการ</a><br>` : '') +
    (nAs ? `<a class="pk-link ss-warn" data-ss="pr1">[!] ปริมาณประมาณ ${nAs} รายการ (ตรวจกับแบบ)</a><br>` : '') +
    (nNote ? `<a class="pk-link" data-ss="project">ข้อสมมติจากตัวถอดปริมาณ ${nNote} ข้อ</a>` : '');
  $$('#side-sum [data-ss]').forEach(a => a.onclick = () => $$('#tabs .nav-tab').find(x => x.dataset.tab === a.dataset.ss).click());
}
function renderHud(T, plan) {
  const m = S.model; if (!m) return;
  const cnt = t => (m.members || []).filter(x => x.type === t).length;
  $('#hud .t').innerHTML = `${esc(S.boq.project.name || m.meta.name || '')}<span class="tag">3D·BOQ·แผนงาน</span>`;
  $('#hud .s').textContent = `${RG()} ${fmt(T.grand)} บาท · ${plan.calDays} วัน (${thDate(plan.start)} – ${thDate(plan.finish)}) · เสา ${cnt('column')} · คาน ${cnt('beam') + cnt('tie_beam')}`;
}
function renderDockBoq(T, plan) {
  $('#dk-kpis').innerHTML = kpiHtml(T, plan);
  const q = ($('#dk-q').value || '').trim().toLowerCase();
  const rows = T.pr.filter(r => !q || (r.name + ' ' + r.group_code).toLowerCase().includes(q));
  $('#dk-boq-table').innerHTML = rows.map(r => `<tr data-key="${esc(r.key)}" class="${S.selKey === r.key ? 'sel' : ''}"><td class="mono" style="color:var(--text3)">${esc(r.group_code)}</td><td>${esc(r.name)}${r.warns.length ? ' <span class="pill warn">ไม่มีราคา</span>' : ''}</td><td class="r">${fmt(r.qty)}</td><td>${esc(r.unit)}</td><td class="r">${fmt(r.total)}</td></tr>`).join('');
  $$('#dk-boq-table tr').forEach(tr => tr.onclick = () => {
    const r = T.pr.find(x => x.key === tr.dataset.key); S.selKey = r.key;
    $$('#dk-boq-table tr').forEach(x => x.classList.toggle('sel', x === tr));
    if (S.viewer) S.viewer.highlight(r.from || []); toast(`${r.name}: ${(r.from || []).length} ชิ้นส่วน`);
  });
}
function setDock(name) {
  $$('.dock-tab[data-dock]').forEach(t => t.classList.toggle('active', t.dataset.dock === name));
  $$('.dock-pane').forEach(p => p.classList.toggle('active', p.id === 'dk-' + name));
  $('#dock').classList.remove('min'); $('#dock-min').textContent = '− ย่อ';
}
// ------------------------------------------------------------------ บูต / CRT
function bootRain() {
  const cv = $('#boot-rain'), ctx = cv.getContext('2d');
  const W = cv.width = innerWidth, H = cv.height = innerHeight, fs = 16, cols = Math.ceil(W / fs), y = Array(cols).fill(0).map(() => Math.random() * -50);
  const ch = 'アイウエオカキクケコサシスセソ0123456789กขคงจฉชซญฎฐณดตถทนบปผพฟภมยรลวศสหฬอฮ'.split('');
  const t = setInterval(() => {
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, 0, W, H); ctx.font = fs + 'px monospace';
    y.forEach((v, i) => { ctx.fillStyle = Math.random() > .975 ? '#d8ffe0' : '#00ff41'; ctx.fillText(ch[Math.random() * ch.length | 0], i * fs, v * fs); y[i] = v * fs > H && Math.random() > .975 ? 0 : v + 1; });
  }, 45);
  return () => clearInterval(t);
}
function bootDone(msg) {
  const el = $('#boot'); if (!el || el.classList.contains('off')) return;
  $('#boot-txt').innerHTML = `&gt; UD_TOTAL_STATION v${UD_VERSION.v}\n&gt; ${esc(msg)}\n&gt; ready<span class="cur">_</span>`;
  setTimeout(() => { el.classList.add('off'); setTimeout(() => { S.stopRain && S.stopRain(); el.remove(); }, 700); }, Math.max(300, 1400 - (Date.now() - S.bootAt)));
}
/** ธีม: plain (ปกติ ค่าเริ่มต้น) / terminal (มืด, The Matrix) / dos (สว่าง แบบ MS-DOS Shell) — จำไว้ในเครื่อง */
const THEMES = ['plain', 'terminal', 'dos'], THEME_NAME = { plain: 'ปกติ', terminal: 'TERMINAL', dos: 'DOS SHELL' };
const curTheme = () => document.documentElement.classList.contains('dos') ? 'dos' : document.documentElement.classList.contains('plain') ? 'plain' : 'terminal';
function setTheme(name) {
  if (!THEMES.includes(name)) name = 'plain';
  THEMES.forEach(t => document.documentElement.classList.toggle(t, t === name && t !== 'terminal'));
  $('#b-theme').textContent = name === 'plain' ? 'ธีม: ปกติ' : 'THEME:' + THEME_NAME[name];
  if (S.viewer) S.viewer.setTheme(name);
  try { localStorage.setItem('udboq:theme', name); } catch (e) { /* */ }
}
function setCrt(on) {
  document.body.classList.toggle('nocrt', !on); $('#b-crt').textContent = 'CRT:' + (on ? 'ON' : 'OFF');
  try { localStorage.setItem('udboq:crt', on ? '1' : '0'); } catch (e) { /* */ }
}

// ------------------------------------------------------------------ 3D
function buildLayers(groups) {
  const v = S.viewer;
  const ov = [['grid', 'เส้นกริด', '#18ffff', (S.model.grids || []).length], ['ground', 'พื้นดิน', '#00ff41', '']].filter(o => o[3] !== 0);
  $('#layer-list').innerHTML = ov.map(([k, t, col, n]) => `<span class="chip ${v[k + 'On'] === false ? '' : 'on'}" data-ov="${k}" style="color:${col}"><i style="background:${col}"></i><span style="color:var(--text)">${t}</span><em>${n}</em></span>`).join('') + groups.map(g => {
    const kids = v.groups[g].children, n = new Set(kids.map(m => m.userData.id || m.uuid)).size;
    const col = '#' + ((kids[0] && kids[0].userData.baseColor) || 0x888888).toString(16).padStart(6, '0');
    return `<span class="chip" data-layer="${esc(g)}" style="color:${col}"><i style="background:${col}"></i><span style="color:var(--text)">${esc(g)}</span><em>${n}</em></span>`;
  }).join('');
  $$('#layer-list [data-ov]').forEach(ch => ch.onclick = () => { const k = ch.dataset.ov, on = v[k + 'On'] === false; v.setOverlay(k, on); ch.classList.toggle('on', on); });
  $$('#layer-list [data-layer]').forEach(ch => ch.onclick = () => {
    const g = ch.dataset.layer, on = !v.groups[g].visible;
    if (g === 'เหล็กเสริม') v.setXray(on); else v.setVisible(g, on);
    $$('.preset').forEach(b => b.classList.remove('on'));
    syncLayers();
  });
  S.scopeKey = ''; S.typeSel = null; syncLayers(); buildClip(); buildScope(); buildTypes(); tlReset(); renderClash();
}
function syncLayers() { $$('#layer-list [data-layer]').forEach(ch => { const g = S.viewer.groups[ch.dataset.layer]; ch.classList.toggle('on', !!(g && g.visible)); }); }
// ตัดดูโมเดล: แนวระดับ (Z) หรือแนวตั้งตามแกน X / Y ของแบบ · เลือกระดับ/แนวกริด หรือเลื่อนอิสระ · กลับด้านได้
const CLIP = { ax: 'Z', c: null, flip: false };
function clipOpts(ax) {
  const m = S.model;
  if (ax === 'Z') return (m.levels || []).slice().sort((a, b) => a.z - b.z).map(l => ({ v: +l.z + 0.02, t: `ถึงระดับ ${l.name} (${l.z >= 0 ? '+' : ''}${(+l.z).toFixed(2)})` }));
  return (m.grids || []).filter(g => g.axis === ax).sort((a, b) => a.coord - b.coord).map(g => ({ v: +g.coord, t: `แนวกริด ${g.name} (${ax} = ${(+g.coord).toFixed(2)} ม.)` }));
}
function buildClip() {
  const m = S.model, v = S.viewer; if (!m || !v || !v.bbox) return;
  const gn = ax => (m.grids || []).filter(g => g.axis === ax).map(g => g.name);
  ['X', 'Y'].forEach(ax => { const n = gn(ax), b = $(`#clip-ax [data-ax=${ax}]`); if (b) b.textContent = n.length ? `แนว ${n[0]}–${n[n.length - 1]}` : `แนวตั้ง ${ax}`; });
  CLIP.c = null; CLIP.flip = false;
  const ax = CLIP.ax, [lo, hi] = v.range(ax);
  $('#clip-level').innerHTML = '<option value="">ไม่ตัด (ทั้งหมด)</option>' + clipOpts(ax).map(o => `<option value="${o.v}">${esc(o.t)}</option>`).join('');
  const zr = $('#clip-z'); zr.min = (lo - 0.05).toFixed(2); zr.max = (hi + 0.05).toFixed(2); zr.step = ax === 'Z' ? 0.05 : 0.1;
  $$('#clip-ax [data-ax]').forEach(b => b.classList.toggle('on', b.dataset.ax === ax));
  setClip(CLIP.c);
}
function setClip(c) {
  const zr = $('#clip-z'), on = c !== null && c !== undefined; CLIP.c = on ? +c : null;
  $('#clip-flip').disabled = $('#clip-look').disabled = !on;
  if (!on) { S.viewer.setSection(null); zr.disabled = true; zr.value = CLIP.ax === 'Z' ? zr.max : zr.min; $('#clip-label').textContent = ''; $('#clip-level').value = ''; return; }
  S.viewer.setSection({ axis: CLIP.ax, c: CLIP.c, flip: CLIP.flip }); zr.disabled = false; zr.value = CLIP.c;
  const opt = [...$('#clip-level').options].find(o => o.value !== '' && Math.abs(+o.value - CLIP.c) < 1e-6); $('#clip-level').value = opt ? opt.value : '';
  const n = (+CLIP.c).toFixed(2), side = CLIP.ax === 'Z' ? (CLIP.flip ? 'สูงกว่า' : 'ต่ำกว่า') : (CLIP.flip ? 'มากกว่า' : 'น้อยกว่า');
  $('#clip-label').textContent = CLIP.ax === 'Z' ? `แสดงเฉพาะส่วนที่${side} ${CLIP.c >= 0 ? '+' : ''}${n} ม.` : `ตัดแนวตั้งที่ ${CLIP.ax} = ${n} ม. · แสดงฝั่งที่ ${CLIP.ax} ${side} ${n}`;
}
const TPAL = [0xff5370, 0x40c4ff, 0xffd740, 0x69f0ae, 0xe040fb, 0xff9100, 0x18ffff, 0xb2ff59, 0xff80ab, 0x7c4dff, 0xffab40, 0x64ffda, 0xeeff41, 0x536dfe];
function buildTypes() {
  const m = S.model, v = S.viewer; if (!m || !v) return;
  const cats = [], add = (cat, mark, id) => { let c = cats.find(x => x.cat === cat); if (!c) cats.push(c = { cat, t: [] });
    let t = c.t.find(x => x.mark === mark); if (!t) c.t.push(t = { mark, ids: [] }); t.ids.push(id); };
  const MT = { column: 'เสา', beam: 'คาน', tie_beam: 'คาน', lintel: 'คาน', rafter: 'โครงหลังคา', purlin: 'โครงหลังคา', truss: 'โครงหลังคา', brace: 'โครงหลังคา' };
  (m.supports || []).forEach(x => add('ฐานราก', x.mark || x.kind, x.id));
  (m.members || []).forEach(x => add(MT[x.type] || x.type, x.mark || x.section, x.id));
  (m.slabs || []).forEach(x => add('พื้น', x.mark || x.kind, x.id));
  (m.walls || []).forEach(x => add('ผนัง', (WALL_TH[x.kind] || x.kind).replace('ผนัง', '') + ` ${x.t * 100}`, x.id));
  (m.openings || []).forEach(x => add('ประตู-หน้าต่าง', x.type, x.id));
  let k = 0; const col = {};
  cats.forEach(c => c.t.forEach(t => { t.color = TPAL[k++ % TPAL.length]; t.ids.forEach(id => { col[id] = t.color; }); }));
  S.types = { cats, col };
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  $('#type-list').innerHTML = cats.map(c => `<div class="tl-cat"><span class="hint">${esc(c.cat)}</span><div class="chips">${c.t.map((t, i) =>
    `<span class="chip on" data-type="${esc(c.cat)}|${i}" style="color:${hex(t.color)}"><i style="background:${hex(t.color)}"></i><span style="color:var(--text)">${esc(t.mark)}</span><em>${t.ids.length}</em></span>`).join('')}</div></div>`).join('');
  $$('#type-list [data-type]').forEach(ch => ch.onclick = () => {
    const [cat, i] = ch.dataset.type.split('|'), t = cats.find(c => c.cat === cat).t[+i];
    const same = S.typeSel === ch.dataset.type; S.typeSel = same ? null : ch.dataset.type;
    $$('#type-list [data-type]').forEach(x => x.classList.toggle('sel', x.dataset.type === S.typeSel));
    v.highlight(same ? [] : t.ids); if (!same) toast(`${cat} ${t.mark}: ${t.ids.length} ชิ้น`);
  });
  v.setTypeColors(S.tcolOn ? col : null);
  $('#b-tcol').classList.toggle('primary', !!S.tcolOn);
}
const autoFold = () => { if (innerWidth < 800) $('#stage').classList.add('collapsed'); };   // มือถือ: เลือกแล้วพับเมนูให้เห็นโมเดล
function buildScope() {
  const v = S.viewer, m = S.model; if (!v || !m) return;
  const lv = (m.levels || []).slice().sort((a, b) => a.z - b.z);
  // แต่ละชิ้นอยู่ชั้นเดียว: แนวราบ (พื้น คาน) ตามระดับหลังชิ้น · แนวดิ่ง (เสา ผนัง) ตามระดับที่ตั้ง · หลังคา/โครงเหล็กเป็นชุดหลังคา · เหล็กเสริมตามชิ้นแม่
  const ROOFG = ['หลังคา', 'เหล็กรูปพรรณ'], e = 0.06, own = {};
  const base = z => { let k = lv[0] ? lv[0].name : ''; lv.forEach(l => { if (l.z <= z + e) k = l.name; }); return k; };
  v.meshes().forEach(m => { const u = m.userData, bb = u.bb; if (!bb || u.rebar) return;
    if (ROOFG.includes(u.group)) u.floor = 'ROOFSYS';
    else { const top = lv.find(l => Math.abs(l.z - bb.max.y) < e); u.floor = top && bb.max.y - bb.min.y < 1.0 ? top.name : base(bb.min.y); }
    if (u.id && !own[u.id]) own[u.id] = u.floor; });
  v.meshes().forEach(m => { const u = m.userData; if (u.rebar) u.floor = own[u.id] || (u.bb ? base(u.bb.min.y) : ''); });
  const fl = lv.map(l => ({ l, sc: { kind: 'floor', key: l.name } })).concat([{ l: { name: 'หลังคา', z: null }, sc: { kind: 'floor', key: 'ROOFSYS' } }]).filter(o => v.scopeCount(o.sc) > 0);
  const gr = (m.grids || []).map(g => ({ g, sc: { kind: 'grid', axis: g.axis, c: g.coord, tol: 0.3 } })).filter(o => v.scopeCount(o.sc) > 0);
  const btn = (txt, key) => `<button class="chip ${S.scopeKey === key ? 'on' : ''}" data-scope="${esc(key)}">${esc(txt)}</button>`;
  $('#scope-floor').innerHTML = btn('ทั้งหมด', '') + fl.map(o => btn(o.sc.key === 'ROOFSYS' ? 'หลังคา' : 'ชั้น ' + o.l.name, 'f:' + o.l.name)).join('');
  $('#scope-grid').innerHTML = gr.map(o => btn('แนว ' + o.g.name, 'g:' + o.g.name)).join('');
  const find = k => k.startsWith('f:') ? fl.find(o => 'f:' + o.l.name === k) : gr.find(o => 'g:' + o.g.name === k);
  $$('[data-scope]').forEach(b => b.onclick = () => {
    const k = b.dataset.scope, o = k ? find(k) : null;
    S.scopeKey = k; setClip(null); v.setScope(o ? o.sc : null); autoFold();
    $$('[data-scope]').forEach(x => x.classList.toggle('on', x.dataset.scope === k));
    $('#scope-label').textContent = !o ? '' : o.l ? (o.l.z === null ? 'หลังคาและโครงหลังคาเหล็ก' : `ชั้น ${o.l.name}: พื้น/คานที่ระดับ ${o.l.z >= 0 ? '+' : ''}${(+o.l.z).toFixed(2)} กับเสา/ผนังที่ตั้งจากระดับนี้`) : `แนวกริด ${o.g.name} (${o.g.axis === 'X' ? 'x' : 'y'} = ${o.g.coord}) ระยะ ±0.30 ม. มองตั้งฉาก`;
  });
}
function applyPreset(name) {
  const v = S.viewer; if (!v) return;
  v.highlight([]); $('#pick-info').innerHTML = ''; $('#pick-info').classList.remove('on');
  v.setXray(false);
  const show = { all: g => g !== 'เหล็กเสริม', struct: g => ['ฐานราก', 'เสา', 'คาน', 'พื้น', 'เหล็กรูปพรรณ'].includes(g),
    roof: g => ['เสา', 'คาน', 'เหล็กรูปพรรณ'].includes(g) }[name];
  if (name === 'rebar') v.setXray(true);
  else Object.keys(v.groups).forEach(g => v.setVisible(g, show(g)));
  $$('.preset').forEach(b => b.classList.toggle('on', b.dataset.preset === name));
  syncLayers();
}

// ------------------------------------------------------------------ timelapse ลำดับก่อสร้าง
const TL = { day: null, timer: null, model: null };
function tlReset() {
  tlStop(); TL.day = null; TL.model = null;
  if (S.viewer) S.viewer.setState(null);
  const p = S.plan;
  if (!p) { $('#tl-label').textContent = 'เปิดโมเดลและโหลดราคาก่อน แผนงานจึงจะพร้อม'; return; }
  $('#tl-day').max = p.calDays; $('#tl-day').value = p.calDays;
  $('#tl-label').textContent = `ลากแถบหรือกด เล่น เพื่อดูลำดับก่อสร้าง ${p.calDays} วัน (${thDate(p.start)} – ${thDate(p.finish)})`;
}
function tlPrepare() {
  const p = S.plan, v = S.viewer; if (!p || !v) return null;
  if (TL.model && TL.model.plan === p) return TL.model;
  const primary = {}, also = {};
  p.tasks.forEach(t => t.from.forEach(id => { if (!primary[id]) primary[id] = t.id; else (also[id] = also[id] || []).push(t.id); }));
  const zOf = {};
  v.meshes().forEach(m => { const u = m.userData; if (!u.id || u.rebar) return; const z = u.z, x = u.pos0.x; if (!zOf[u.id] || z < zOf[u.id][0]) zOf[u.id] = [z, x]; });
  const rank = {}, count = {}, ord = {};   // ลำดับประกอบ: เสา/จันทันก่อน คาน แล้วจึงแป
  (S.model.members || []).forEach(x => { ord[x.id] = { column: 0, rafter: 0, purlin: 2 }[x.type] ?? 1; });
  p.tasks.forEach(t => {
    const ids = t.from.filter(id => zOf[id]).sort((a, b) => (ord[a] || 1) - (ord[b] || 1) || zOf[a][0] - zOf[b][0] || zOf[a][1] - zOf[b][1]);
    count[t.id] = ids.length; ids.forEach((id, k) => { (rank[t.id] = rank[t.id] || {})[id] = k; });
  });
  return (TL.model = { plan: p, primary, rank, count, task: Object.fromEntries(p.tasks.map(t => [t.id, t])) });
}
function tlProg(t, date) {
  if (!t || date < t.start) return 0;
  if (date >= t.finish) return 1;
  const a = Schedule.parse(t.start), b = Schedule.parse(t.finish), d = Schedule.parse(date);
  return ((d - a) / 864e5 + 1) / ((b - a) / 864e5 + 1);
}
function tlSet(day) {
  const M = tlPrepare(); if (!M) return;
  const p = M.plan, v = S.viewer;
  day = Math.max(0, Math.min(p.calDays, day)); TL.day = day; $('#tl-day').value = day;
  if (day >= p.calDays) { tlDone(); return; }
  const date = day === 0 ? Schedule.iso(Schedule.addDays(Schedule.parse(p.start), -1)) : Schedule.iso(Schedule.addDays(Schedule.parse(p.start), day - 1));
  const prog = {}; p.tasks.forEach(t => { prog[t.id] = tlProg(t, date); });
  const step = (tid, id) => { const n = M.count[tid] || 1, k = (M.rank[tid] || {})[id] || 0; return prog[tid] * n - k; };   // >0 = เริ่มชิ้นนี้แล้ว
  const BRICK = 0xb5654a, PLASTER = 0xd9d4ca, PAINT = 0xf3efe6;
  if (v.groups['เหล็กเสริม']) v.groups['เหล็กเสริม'].visible = true;
  v.setState(u => {
    if (!u.id) return u.group === 'งานระบบ' ? { visible: (prog.mep_fix ?? 1) >= 0.5 } : null;
    // แผ่นหลังคาโผล่ตอนงานมุง (id หลังคาอยู่ในงานโครงหลังคาด้วยเพราะคิดพื้นที่โครงหลังคา)
    const tid = (u.group === 'หลังคา' && M.task.roof_cover && M.task.roof_cover.from.includes(u.id)) ? 'roof_cover' : M.primary[u.id]; if (!tid) return null;
    const s0 = step(tid, u.id);
    if (u.rebar) return { visible: s0 > 0 && (M.task[tid].kind === 'footing' || M.task[tid].kind === 'lift') };
    if (s0 <= 0) return { visible: false };
    const st = {};
    if (u.growFrom) st.grow = Math.max(0, Math.min(1, (s0 - 0.4) / 0.6)); else if (s0 < 0.5) st.visible = false;
    if (u.group === 'ผนัง') {
      st.color = BRICK;
      if (M.task.plaster && step('plaster', u.id) >= 1) st.color = PLASTER;
      if (M.task.paint && step('paint', u.id) >= 1) st.color = PAINT;
    }
    return st;
  });
  const cv = p.curve[Math.max(0, day - 1)], now = p.tasks.filter(t => prog[t.id] > 0 && prog[t.id] < 1);
  const lastInst = ((S.inst && S.inst.list) || []).filter(c => c.due && c.due <= date).slice(-1)[0];
  $('#tl-fill').style.width = (day ? cv.pct : 0) + '%';
  $('#tl-label').innerHTML = `<b>วันที่ ${day}/${p.calDays}</b> · ${thDate(date)} · ผลงานตามแผน <b style="color:var(--green)">${day ? cv.pct.toFixed(1) : '0.0'}%</b>` +
    (lastInst ? ` · ถึง <b style="color:var(--amber)">งวด ${lastInst.no}</b> (${thDate(lastInst.due)})` : '') +
    (now.length ? `<div class="tl-now">กำลังทำ (กดเพื่อดูชิ้นส่วน): ${now.map(t => `<span class="pill tl-task" data-tl-task="${esc(t.id)}" style="border-color:${t.color}">${esc(t.label.replace(/ — .*/, ''))} ${Math.round(prog[t.id] * 100)}%</span>`).join('')}</div>` : '');
  $$('#tl-label [data-tl-task]').forEach(b => b.onclick = () => { tlStop(); selectTask(b.dataset.tlTask); });
}
function tlDone() {
  tlStop(); TL.day = null;
  if (S.viewer) { S.viewer.setState(null); if (S.viewer.groups['เหล็กเสริม']) S.viewer.groups['เหล็กเสริม'].visible = S.viewer.xray; }
  $('#tl-fill').style.width = '100%';
  if (S.plan) { $('#tl-day').value = S.plan.calDays; $('#tl-label').textContent = `อาคารเสร็จ · ${S.plan.calDays} วัน (${thDate(S.plan.start)} – ${thDate(S.plan.finish)})`; }
}
function tlStop() { clearInterval(TL.timer); TL.timer = null; $('#tl-play').textContent = '» เล่น'; }
function tlPlay() {
  if (TL.timer) return tlStop();
  if (!S.plan) return toast('แผนงานยังไม่พร้อม');
  let d = (TL.day === null || TL.day >= S.plan.calDays) ? 0 : TL.day;
  $('#tl-play').textContent = '‖ หยุด'; setDock('time');
  const ms = Math.max(60, Math.min(250, 12000 / S.plan.calDays)) / (+$('#tl-speed').value || 1);
  TL.timer = setInterval(() => { d++; if (d >= S.plan.calDays) { tlDone(); return; } tlSet(d); }, ms);
}
function initViewer() {
  if (S.viewer || typeof THREE === 'undefined') return;
  S.viewer = new BmViewer.Viewer($('#viewer'), { onPick: d => showPick(d) });
  try { if (localStorage.getItem('udboq:proj') === 'para') $('#proj-seg [data-proj=para]').click(); } catch (e) { /* */ }
  if (curTheme() !== 'terminal') S.viewer.setTheme(curTheme());
  if (S.model) buildLayers(S.viewer.load(S.model));
  const sel = S.selKey && (S.priced || []).find(r => r.key === S.selKey);
  if (sel) S.viewer.highlight(sel.from || []);
}

// ------------------------------------------------------------------ กล่องข้อมูลชิ้นส่วน
const TYPE_TH = { column: 'เสา', beam: 'คาน', tie_beam: 'คานคอดิน', lintel: 'ทับหลัง', rafter: 'จันทัน', purlin: 'แป', truss: 'โครงถัก', brace: 'ค้ำยัน',
  spread: 'ฐานราก', pile_cap: 'ฐานรากบนเข็ม', cast: 'พื้นหล่อในที่', ground: 'พื้นวางบนดิน', precast: 'พื้นสำเร็จรูป' };
const WALL_TH = { brick_mon: 'ผนังก่ออิฐมอญครึ่งแผ่น', brick_mon_full: 'ผนังก่ออิฐมอญเต็มแผ่น', aac: 'ผนังก่ออิฐมวลเบา', block: 'ผนังก่อคอนกรีตบล็อก', block_07: 'ผนังก่อคอนกรีตบล็อก 7 ซม.', gypsum: 'ผนังเบา', glass: 'ผนังกระจก' };
const f2 = x => (+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lvlOf = z => { const L = (S.model.levels || []).filter(l => Math.abs(l.z - z) < 0.02)[0]; return (L ? L.name + ' ' : '') + (z >= 0 ? '+' : '') + (+z).toFixed(2); };
function elemIndex() {
  if (S._elIdx && S._elIdx.m === S.model) return S._elIdx.map;
  const m = S.model, map = {};
  const put = (set, arr) => (arr || []).forEach(e => e && e.id && (map[e.id] = { set, e }));
  put('members', m.members); put('supports', m.supports); put('slabs', m.slabs); put('walls', m.walls); put('openings', m.openings);
  put('roofs', m.roofs); put('finishes', m.finishes);
  const mep = m.mep || {}, pl = mep.plumbing || {}, el = mep.electrical || {};
  put('pipes', pl.pipes); put('fixtures', pl.fixtures); put('equipment', pl.equipment); put('points', el.points); put('panels', el.panels);
  put('routes', (m.quantities || {}).routes);
  S._elIdx = { m, map }; return map;
}
function rebarTxt(rb) {
  if (!rb) return '';
  const bar = v => v ? `${v[0]}-${v[1] < 10 ? 'RB' : 'DB'}${v[1]}` : '', out = [];
  if (rb.main) out.push('เหล็กยืน ' + bar(rb.main));
  if (rb.top) out.push('บน ' + bar(rb.top)); if (rb.bot) out.push('ล่าง ' + bar(rb.bot));
  if (rb.extra_top) out.push('เสริมบน ' + bar(rb.extra_top)); if (rb.extra_bot) out.push('เสริมล่าง ' + bar(rb.extra_bot));
  if (rb.stirrup) out.push(`ปลอก ${rb.stirrup[0] < 10 ? 'RB' : 'DB'}${rb.stirrup[0]}@${rb.stirrup[1]}${rb.stirrup[2] ? '/' + rb.stirrup[2] : ''}`);
  if (rb.bars_x) out.push('แนว x ' + bar(rb.bars_x)); if (rb.bars_y) out.push('แนว y ' + bar(rb.bars_y));
  if (rb.mesh) out.push(`ตะแกรง ${rb.mesh[0] < 10 ? 'RB' : 'DB'}${rb.mesh[0]}@${rb.mesh[1]}${rb.mesh[2] > 1 ? ' ' + rb.mesh[2] + ' ชั้น' : ''}`);
  if (rb.wire_mesh) out.push('ตะแกรงสำเร็จรูป ' + rb.wire_mesh);
  return out.join(' · ');
}
function elemSpec(id) {
  const hit = elemIndex()[id]; if (!hit) return null;
  const { set, e } = hit, m = S.model, sec = e.section && (m.sections || []).find(x => x.id === e.section);
  const nd = k => (m.nodes || []).find(n => n.id === k), design = ((m.design || {})[set] || {})[id];
  let title = '', mark = e.mark || '', lines = [];
  if (set === 'members') {
    title = TYPE_TH[e.type] || e.type;
    const a = nd(e.i), b = nd(e.j), L = a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : 0;
    if (sec && sec.kind === 'rc_rect') lines.push(`คสล. ${sec.b * 100}×${sec.h * 100} ซม. · ${e.material || ''}`);
    else if (sec) lines.push(`${sec.name || sec.id}${sec.kg_m ? ` · ${sec.kg_m} กก./ม.` : ''}`);
    if (a && b) lines.push(e.type === 'column' ? `ระดับ ${lvlOf(Math.min(a.z, b.z))} → ${lvlOf(Math.max(a.z, b.z))} · สูง ${f2(L)} ม.` : `ยาว ${f2(L)} ม. · ระดับ ${lvlOf(Math.max(a.z, b.z))}`);
  } else if (set === 'supports') {
    title = TYPE_TH[e.kind] || 'ฐานราก';
    lines.push(`${f2(e.b)}×${f2(e.d)} ม. หนา ${f2(e.h)} ม. · ${e.material || ''}`, `ท้องฐาน ${lvlOf(e.bottom)}`);
    if (e.piles) lines.push(`เสาเข็ม ${e.piles.type} ยาว ${e.piles.length} ม. × ${e.piles.n} ต้น`);
  } else if (set === 'slabs') {
    title = TYPE_TH[e.kind] || 'พื้น'; lines.push(`หนา ${e.t * 100} ซม. · ${e.material || ''} · ระดับ ${lvlOf(e.top)}`);
    if (e.use) lines.push('ใช้งาน: ' + e.use);
  } else if (set === 'walls') {
    title = WALL_TH[e.kind] || 'ผนัง'; lines.push(`หนา ${e.t * 100} ซม. · สูง ${f2(e.top - e.bottom)} ม. (${lvlOf(e.bottom)} → ${lvlOf(e.top)})`);
    lines.push([e.plaster && 'ฉาบ', e.paint && 'ทาสี', e.exterior && 'ผนังภายนอก', e.finish_sides && `${e.finish_sides} ด้าน`].filter(Boolean).join(' · '));
  } else if (set === 'openings') {
    const t = (m.opening_types || {})[e.type] || {}; title = 'ช่องเปิด'; mark = e.type;
    lines.push(`${t.desc || ''} ${t.w || ''}×${t.h || ''} ม.${t.sill ? ` ขอบล่าง +${t.sill}` : ''}`.trim());
  } else if (set === 'roofs') { title = 'หลังคา'; lines.push(`${e.cover || ''} · ลาด ${e.pitch || 0}°`); }
  else if (set === 'pipes') { title = 'ท่อ'; lines.push(`ระบบ ${e.system} ⌀${e.dia}${e.material ? ' ' + e.material : ''}`); }
  else if (set === 'routes') { title = e.kind === 'pipe' ? 'ท่อ (แนวประมาณ)' : 'ท่อร้อยสาย (แนวประมาณ)'; lines.push(e.kind === 'pipe' ? `ระบบ ${e.system} ⌀${e.dia}` : `วงจร ${e.circuit}`, 'แนวนี้ระบบประมาณให้ ตรวจกับแบบ'); }
  else if (set === 'fixtures') { title = 'สุขภัณฑ์'; mark = e.type; }
  else if (set === 'equipment') { title = 'อุปกรณ์'; lines.push(`${e.kind} ${e.size || ''}`); }
  else title = set;
  const rb = design && design.rebar; if (rb) lines.push(rebarTxt(rb));
  return { set, e, title, mark, lines: lines.filter(Boolean), note: e.note, src: e.src, status: e.status };
}
function elemQty(id) {
  const rows = (S.priced || []), out = [], calc = [];
  let value = 0, partial = [];
  rows.forEach(r => {
    const bs = r.by_src;
    if (bs && bs[id]) {
      const tot = Object.values(bs).reduce((a, b) => a + b, 0), sh = tot ? bs[id] / tot : 0;
      out.push({ key: r.key, name: r.name, unit: r.unit, q: bs[id], val: sh * (r.total || 0), noPrice: r.warns.includes('ยังไม่มีราคา'), calc: (r.calc || {})[id] || [] });
      value += sh * (r.total || 0);
    } else if ((r.from || []).includes(id)) partial.push(r.name);
  });
  return { rows: out, value, calc, partial };
}
function showPick(d) {
  const box = $('#pick-info');
  if (!d || !d.id) { box.innerHTML = ''; box.classList.remove('on'); S.viewer.highlight([]); return; }
  S.viewer.highlight([d.id]);
  const sp = elemSpec(d.id), q = elemQty(d.id), id = d.id;
  const tasks = (S.plan ? S.plan.tasks : []).filter(t => (t.from || []).includes(id));
  const res = (S.model.results || {}).members && S.model.results.members[id];
  const cl = (S.clashAll || []).filter(c => c.ids.includes(id));
  const st = sp && sp.status === 'assumed' ? '<span class="pill warn">สมมติ</span>' : sp && sp.src ? `<span class="pill">แบบ ${esc(sp.src)}</span>` : '';
  let h = `<div class="pk-grab"></div><div class="pk-head"><div><span class="pk-type">${esc(sp ? sp.title : d.group)}</span> <b class="mono">${esc(id)}</b>${sp && sp.mark ? ` <span class="pk-mark">· ${esc(sp.mark)}</span>` : ''} ${st}</div><button class="btn small" data-pk="close">×</button></div>`;
  if (sp) h += `<div class="pk-spec">${sp.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
  else if (d.info) h += `<div class="pk-spec"><div>${esc(d.info)}</div></div>`;
  if (q.rows.length) {
    h += `<div class="pk-sec"><div class="pk-lbl">ปริมาณของชิ้นนี้ (ไม่รวมเผื่อ) · กดรายการเพื่อไปที่ ปร.1</div><table class="pk-q">${q.rows.map(r => `<tr data-pk-row="${esc(r.key)}"><td>${esc(r.name)}${r.calc.map(c => `<div class="pk-calc">${esc(c)}</div>`).join('')}</td><td class="r">${f2(r.q)}</td><td>${esc(r.unit)}</td></tr>`).join('')}</table></div>`;
    const np = q.rows.filter(r => r.noPrice).length;
    h += `<div class="pk-val"><span>มูลค่าชิ้นนี้ <small>(ค่าวัสดุ+ค่าแรง รวมเผื่อ ไม่รวม F)</small></span><b>${f2(q.value)} <small>บาท</small></b></div>`;
    if (np) h += `<div class="hint warnline">${np} รายการยังไม่มีราคา — มูลค่ายังไม่ครบ</div>`;
    if (q.partial.length) h += `<div class="hint">ไม่แยกรายชิ้น (คิดรวมทั้งโครงการ): ${q.partial.map(esc).join(', ')}</div>`;
  } else if (q.partial.length) h += `<div class="pk-sec hint">อยู่ในรายการ: ${q.partial.map(esc).join(', ')} (คิดรวม ไม่แยกรายชิ้น)</div>`;
  if (tasks.length) h += `<div class="pk-sec"><div class="pk-lbl">งานในแผน</div>${tasks.map(t => `<a class="pk-link" data-pk-task="${esc(t.id)}">${esc(t.label)}</a> <span class="hint">(${thDate(t.start)} – ${thDate(t.finish)})</span>`).join('<br>')}</div>`;
  if (res) {
    const row = (k, u) => res[k] ? `<tr><td>${k}</td><td class="r">${f2(res[k].max)}</td><td class="hint">${esc(res[k].combo_max || '')}</td><td class="r">${f2(res[k].min)}</td><td class="hint">${esc(res[k].combo_min || '')}</td><td>${u}</td></tr>` : '';
    h += `<div class="pk-sec"><div class="pk-lbl">แรงจาก SAP2000 ${S.model.results.stale ? '<span class="pill warn">โมเดลแก้หลังวิเคราะห์</span>' : ''}</div>
      <table class="pk-q"><tr class="hint"><td></td><td class="r">สูงสุด</td><td></td><td class="r">ต่ำสุด</td><td></td><td></td></tr>${row('P', 'kgf')}${row('V2', 'kgf')}${row('M3', 'kgf-m')}${row('T', 'kgf-m')}</table></div>`;
  }
  if (cl.length) h += `<div class="pk-sec"><div class="pk-lbl">Clash</div>${cl.map(c => `<a class="pk-link" data-pk-clash="1"><span class="pill ${SEV[c.sev][1]}">${SEV[c.sev][0]}</span> ${esc(c.title)}</a>`).join('<br>')}</div>`;
  if (sp && sp.note) h += `<div class="pk-sec hint">หมายเหตุ: ${esc(sp.note)}</div>`;
  box.innerHTML = h; box.classList.add('on'); box.scrollTop = 0;
  box.querySelector('[data-pk=close]').onclick = () => showPick(null);
  box.querySelectorAll('[data-pk-task]').forEach(a => a.onclick = () => { setDock('gantt'); selectTask(a.dataset.pkTask); });
  box.querySelectorAll('[data-pk-row]').forEach(tr => tr.onclick = () => gotoRow(tr.dataset.pkRow));
  box.querySelectorAll('[data-pk-clash]').forEach(a => a.onclick = () => setDock('clash'));
  // มือถือ: ปัดลงที่แถบจับเพื่อปิด
  const g = box.querySelector('.pk-grab'); let y0 = null;
  g.ontouchstart = e => { y0 = e.touches[0].clientY; }; g.ontouchend = e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 50) showPick(null); y0 = null; };
}
function gotoRow(key) {
  S.selKey = key; $$('#tabs .nav-tab').find(x => x.dataset.tab === 'pr1').click(); renderPR1();
  setTimeout(() => { const tr = $(`#pr1-table tr[data-key="${CSS.escape(key)}"]`); if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('sel'); } }, 120);
}

// ------------------------------------------------------------------ events
function showLog() {
  let m = $('#log-modal');
  if (!m) { m = document.createElement('div'); m.id = 'log-modal'; m.className = 'modal'; document.body.appendChild(m); m.onclick = e => { if (e.target === m || e.target.dataset.close) m.classList.remove('on'); }; }
  m.innerHTML = `<div class="modal-box glass"><div class="side-top"><h2 style="margin:0">${esc(UD_VERSION.name)} v${UD_VERSION.v}</h2><button class="btn small" data-close="1">×</button></div>
    <p class="hint">developed by <b style="color:var(--green)">patcharapol_bot</b> · เลขใหญ่.เลขย่อย — แก้เล็กเปลี่ยนเลขย่อย แก้ใหญ่เปลี่ยนเลขใหญ่</p>
    <table class="mini-boq">${UD_VERSION.log.map(([v, d, t]) => `<tr><td class="mono" style="color:var(--green);white-space:nowrap">v${v}</td><td class="mono" style="color:var(--text3);white-space:nowrap">${d}</td><td>${esc(t)}</td></tr>`).join('')}</table></div>`;
  m.classList.add('on');
}
function bind() {
  bindSurvey();
  $('#credit').innerHTML = `UD Total Station v${UD_VERSION.v} · developed by <b>patcharapol_bot</b>`;
  $('#logo-ver').textContent = 'v' + UD_VERSION.v; $('#logo-ver').onclick = showLog;
  $('#boot-txt').innerHTML = `&gt; UD_TOTAL_STATION v${UD_VERSION.v}\n&gt; dev: patcharapol_bot\n&gt; connecting UD-Cost Hub ...<span class="cur">_</span>`;
  $$('#tabs .nav-tab').forEach(t => t.onclick = () => {
    $$('#tabs .nav-tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + t.dataset.tab));
    if (t.dataset.tab === 'model') { initViewer(); S.viewer && S.viewer.resize(); }
    if (t.dataset.tab === 'survey') renderSurvey();
    if (t.dataset.tab === 'design' && typeof renderDesign === 'function') renderDesign();
    $$('#bnav [data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === t.dataset.tab || (b.dataset.go === 'more' && ['pr23', 'diff', 'survey', 'design'].includes(t.dataset.tab))));
    document.body.classList.toggle('on-model', t.dataset.tab === 'model');
    $('#bmore').classList.remove('on'); scrollTo(0, 0);
  });
  $$('#bnav [data-go], #bmore [data-go]').forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === 'more') { $('#bmore-meta').innerHTML = $('#meta-proj').innerHTML + '<br>' + $('#meta-price').innerHTML; return $('#bmore').classList.toggle('on'); }
    if (go === 'log') { $('#bmore').classList.remove('on'); return showLog(); }
    if (go === 'crt') { $('#b-crt').click(); return $('#bmore').classList.remove('on'); }
    if (go === 'theme') { $('#b-theme').click(); return $('#bmore').classList.remove('on'); }
    $$('#tabs .nav-tab').find(x => x.dataset.tab === go).click();
  });
  $('#f-model').onchange = async e => { try { const f = await readFile(e.target); loadModel(f.text, f.name); toast('เปิดโมเดลแล้ว'); } catch (er) { if (er) alert('เปิดไฟล์ไม่ได้: ' + er.message); } e.target.value = ''; };
  $('#f-boq').onchange = async e => {
    try {
      const f = await readFile(e.target); const b = JSON.parse(f.text);
      if (b.format !== 'ud-boq') throw new Error('ไม่ใช่ไฟล์ .boq.json');
      const svimg = b.svimg || {}; delete b.svimg;
      Object.entries(svimg).forEach(([id, d]) => { if (Survey.safeImg(d)) { S.img[id] = d; Survey.imgPut(id, d); } });   // รับเฉพาะภาพจริง
      S.boq = Object.assign(newBoq(), b);
      S.boq.plan = Object.assign(newPlan(), S.boq.plan || {});
      if (S.model && b.model_file && b.model_file !== S.modelName) toast(`หมายเหตุ: ไฟล์ BOQ นี้ทำกับ ${b.model_file}`);
      applySurvey(); autosave(); renderAll(); toast('เปิดงาน BOQ แล้ว');
    } catch (er) { if (er) alert('เปิดไฟล์ไม่ได้: ' + er.message); }
    e.target.value = '';
  };
  $('#b-save').onclick = () => {
    if (!S.model) return toast('เปิดโมเดลก่อน');
    S.boq.saved_at = new Date().toISOString();
    const ids = new Set(Object.values(S.boq.surveys || {}).flatMap(it => (it.quotes || []).flatMap(q => q.imgs || [])));
    const svimg = {}; ids.forEach(id => { if (S.img[id]) svimg[id] = S.img[id]; });
    download((S.modelName || 'project').replace(/\.bm\.json$|\.json$/, '') + '.boq.json', JSON.stringify(Object.assign({}, S.boq, { svimg }), null, 1));
    if (ids.size > Object.keys(svimg).length) toast(`คำเตือน: ภาพหลักฐาน ${ids.size - Object.keys(svimg).length} ภาพยังโหลดไม่เสร็จ — บันทึกอีกครั้ง`);
  };
  $('#b-sample').onclick = async () => {
    try { const r = await fetch('../examples/sample-building.bm.json'); loadModel(await r.text(), 'sample-building.bm.json'); toast('เปิดอาคารตัวอย่างแล้ว'); }
    catch (er) { alert('โหลดตัวอย่างไม่ได้: ' + er.message); }
  };
  $$('#proj-form [data-k]').forEach(el => el.onchange = () => {
    S.boq.project[el.dataset.k] = el.type === 'number' ? (+el.value || '') : el.value;
    if (el.dataset.k === 'name') $('#meta-proj').textContent = el.value;
    if (el.dataset.k === 'mode') { renderPeople(); $('#lbl-calc').textContent = `คำนวณ${RG()}เมื่อวันที่`; renderAll(); }
    autosave(); renderSummary(); renderPR1();
  });
  [['#ff-adv', 'advance'], ['#ff-ret', 'retention'], ['#ff-loan', 'loanPct']].forEach(([s, k]) => $(s).onchange = () => {
    S.boq.factor[k] = +$(s).value || 0; autosave(); renderSummary();
  });
  $('#b-addrow').onclick = addCustomRow;
  $('#b-add-pr2').onclick = () => { S.boq.pr2.push({ id: Survey.uid('e'), name: '', qty: 1, unit: 'ชุด', price: 0, install: 0 }); autosave(); renderPR23(); };
  $$('[data-xlsx]').forEach(b => b.onclick = exportXlsx);
  $('#b-add-pr3').onclick = () => { S.boq.pr3.push({ id: Survey.uid('x'), name: '', qty: 1, unit: 'งาน', amount: 0, note: '' }); autosave(); renderPR23(); };
  $('#pl-start').onchange = e => { S.boq.plan.start = e.target.value; autosave(); renderPlan(); };
  $('#pl-n').onchange = e => { S.boq.plan.inst.n = Math.max(1, Math.min(24, +e.target.value || 1)); S.boq.plan.inst.assign = {}; autosave(); renderPlan(); };
  $('#pl-mode').onchange = e => {
    const ins = S.boq.plan.inst; ins.mode = e.target.value;
    if (ins.mode === 'manual' && S.inst) ins.assign = Object.assign({}, S.inst.assign);   // เริ่มจากที่แบ่งอัตโนมัติ
    autosave(); renderPlan();
  };
  $('#pl-hol').onchange = e => { S.boq.plan.holidays = e.target.value.split(/\s+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); autosave(); renderPlan(); };
  $('#pl-reauto').onclick = () => { const ins = S.boq.plan.inst; ins.assign = {}; if (ins.mode === 'manual' && S.plan) ins.assign = Schedule.autoAssign(S.plan, +ins.n || 1); autosave(); renderPlan(); toast('แบ่งงวดอัตโนมัติใหม่แล้ว'); };
  $('#pl-resetdur').onclick = () => { S.boq.plan.durations = {}; autosave(); renderPlan(); };
  $$('#side [data-view], .side [data-view], .btn-grid [data-view]').forEach(b => b.onclick = () => { if (S.viewer) S.viewer.setView(b.dataset.view); autoFold(); });
  $$('#proj-seg [data-proj]').forEach(b => b.onclick = () => { const on = b.dataset.proj === 'para'; if (S.viewer) S.viewer.setParallel(on); $$('#proj-seg [data-proj]').forEach(x => x.classList.toggle('on', x === b)); try { localStorage.setItem('udboq:proj', on ? 'para' : 'persp'); } catch (e) { /* */ } });
  $$('[data-preset]').forEach(b => b.onclick = () => applyPreset(b.dataset.preset));
  $('#clip-level').onchange = e => setClip(e.target.value === '' ? null : +e.target.value);
  $$('#clip-ax [data-ax]').forEach(b => b.onclick = () => { if (CLIP.ax === b.dataset.ax) return; CLIP.ax = b.dataset.ax; CLIP.c = null; CLIP.flip = false; buildClip(); });
  $('#clip-flip').onclick = () => { CLIP.flip = !CLIP.flip; setClip(CLIP.c); };
  $('#clip-look').onclick = () => { if (!S.viewer || CLIP.c === null) return; const f = CLIP.flip;   // มองตั้งฉากเข้าหาหน้าตัด
    S.viewer.setView(CLIP.ax === 'Z' ? 'top' : CLIP.ax === 'X' ? (f ? 'left' : 'right') : (f ? 'front' : 'back')); autoFold(); };
  $('#clip-z').oninput = e => setClip(+e.target.value);
  $('#b-side-close').onclick = () => { $('#stage').classList.add('collapsed'); setTimeout(() => S.viewer && S.viewer.resize(), 50); try { localStorage.setItem('udboq:side', '1'); } catch (er) { /* */ } };
  $('#b-side-open').onclick = () => { $('#stage').classList.remove('collapsed'); setTimeout(() => S.viewer && S.viewer.resize(), 50); try { localStorage.setItem('udboq:side', '0'); } catch (er) { /* */ } };
  try {
    const sv = localStorage.getItem('udboq:side');
    if (sv === '1' || (sv === null && innerWidth < 800)) $('#stage').classList.add('collapsed');   // มือถือเริ่มแบบพับเมนู
  } catch (er) { /* */ }
  const fitStage = () => { const bn = $('#bnav'), bh = bn && getComputedStyle(bn).display !== 'none' ? bn.offsetHeight : 0; $('#stage').style.height = Math.max(bh ? 300 : 420, innerHeight - $('.topbar').offsetHeight - bh) + 'px'; };
  addEventListener('resize', fitStage); fitStage();
  $('#tl-play').onclick = tlPlay;
  $('#tl-speed').onchange = () => { if (TL.timer) { tlStop(); tlPlay(); } };
  $('#b-tcol').onclick = () => { S.tcolOn = !S.tcolOn; if (S.viewer && S.types) S.viewer.setTypeColors(S.tcolOn ? S.types.col : null); $('#b-tcol').classList.toggle('primary', S.tcolOn); $('#b-tcol').textContent = S.tcolOn ? 'กลับเป็นสีวัสดุ' : 'ระบายสีตามชนิด'; };
  $('#clash-bt').onchange = e => { S.boq.clash_bt = e.target.value; autosave(); renderClash(); };
  $('#clash-info').onchange = renderClash; $('#clash-ack').onchange = renderClash;
  $('#f-old').onchange = async e => {
    try { const f = await readFile(e.target); const m = JSON.parse(f.text); if (!m.schema_version) throw new Error('ไม่ใช่ไฟล์ .bm.json');
      if (!(m.quantities && m.quantities.items)) throw new Error('โมเดลรุ่นก่อนยังไม่ได้ถอดปริมาณ (รัน tools/takeoff.py --write)');
      S.old = { model: m, name: f.name }; renderDiff(); toast('เทียบรุ่นแล้ว'); }
    catch (er) { if (er) alert('เปิดไฟล์ไม่ได้: ' + er.message); }
    e.target.value = '';
  };
  $('#b-diff-3d').onclick = () => { if (!S.diffIds) return toast('เปิดรุ่นก่อนก่อน'); $$('#tabs .nav-tab').find(x => x.dataset.tab === 'model').click(); setTimeout(() => S.viewer && S.viewer.highlight(S.diffIds), 80); toast(`ไฮไลต์ชิ้นที่เพิ่ม/แก้ ${S.diffIds.length} ชิ้น`); };
  $('#b-diff-clear').onclick = () => { S.old = null; S.diffIds = null; $('#diff-status').textContent = ''; renderDiff(); };
  $$('.dock-tab[data-dock]').forEach(t => t.onclick = () => setDock(t.dataset.dock));
  $('#dock-min').onclick = () => { const d = $('#dock'); d.classList.toggle('min'); $('#dock-min').textContent = d.classList.contains('min') ? '+ ขยาย' : '− ย่อ'; };
  $('#dk-q').oninput = () => renderPlan();
  $('#b-crt').onclick = () => setCrt(document.body.classList.contains('nocrt'));
  $('#b-theme').onclick = () => setTheme(THEMES[(THEMES.indexOf(curTheme()) + 1) % THEMES.length]);
  setTheme(curTheme());
  try { if (localStorage.getItem('udboq:crt') === '0') setCrt(false); } catch (er) { /* */ }
  $('#tl-day').oninput = e => { tlStop(); tlSet(+e.target.value); };
  $('#tl-done').onclick = tlDone;
  $('#b-fit').onclick = () => S.viewer && S.viewer.fit();
  $('#b-clear').onclick = () => S.viewer && S.viewer.highlight([]);
}

S.bootAt = Date.now(); S.stopRain = bootRain();
setTimeout(() => bootDone('timeout — ทำงานต่อโดยไม่มีราคา'), 15000);
bind();
renderAll();
loadPrices();
