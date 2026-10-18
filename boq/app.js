/* UD BOQ — เว็บราคากลางงานอาคาร 2569
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
  return { format: 'ud-boq', version: 1, project: {}, factor: { advance: 15, retention: 10, loanPct: 0 },
    overrides: {}, survey: {}, custom_rows: [], pr2: [], pr3: [], plan: newPlan(), model_file: '', saved_at: '' };
}
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
function autosave() { try { if (S.modelName) localStorage.setItem('udboq:' + S.modelName, JSON.stringify(S.boq)); } catch (e) { /* ไม่มี storage */ } }

// ------------------------------------------------------------------ ราคา
async function loadPrices() {
  try {
    S.db = await UDPrice.load();
    S.baseCompItems = S.db.compItems.slice();
    applySurvey();
    $('#meta-price').textContent = `ราคาพาณิชย์ ${S.db.period || ''} · ค่าแรง ว480 ${S.db.wages.length} รายการ`;
  } catch (e) {
    $('#meta-price').textContent = 'โหลดราคาไม่สำเร็จ: ' + e.message;
  }
  renderAll();
}
function hasCommerce(it) { return !!S.db.resolveMat(it).matItem; }
function applySurvey() {
  if (!S.db) return;
  const sv = S.boq.survey || {};
  S.db.compItems = S.baseCompItems.map(it => {
    const p = sv[it.itemCode];
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
  $('#meta-proj').textContent = p.name;
  $('#file-status').innerHTML = `เปิด <b>${esc(name)}</b>${saved ? ' · ดึงงาน BOQ ที่บันทึกไว้ในเบราว์เซอร์นี้' : ''}`;
  if (S.viewer) buildLayers(S.viewer.load(m));
  renderAll();
}
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }

function rows() {
  const q = (S.model && S.model.quantities && S.model.quantities.items) || [];
  return q.concat(S.boq.custom_rows || []);
}

// ------------------------------------------------------------------ render
function renderAll() {
  renderProject(); renderSurvey(); renderPR1(); renderPR23(); renderSummary(); renderPlan();
}

function renderProject() {
  $$('#proj-form [data-k]').forEach(el => { el.value = S.boq.project[el.dataset.k] ?? ''; });
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
function _renderSurvey() {
  const box = $('#survey-table');
  if (!S.db) { box.textContent = 'กำลังโหลดราคา…'; return; }
  const used = new Set(S.baseCompItems.map(i => i.itemCode));
  const list = Object.entries(S.db.matRef).filter(([k, r]) => used.has(k) && !S.db.resolveMat({ itemCode: k, commodityCode: '' }).matItem && !r.compRef);
  box.innerHTML = `<table class="boq"><tr><th>รหัส</th><th>วัสดุ</th><th>หน่วย</th><th>ราคาสืบ (บาท)</th><th>ใช้ในวัสดุมวลรวม</th></tr>${
    list.map(([k, r]) => {
      const n = S.baseCompItems.filter(i => i.itemCode === k).length;
      return `<tr><td class="mono">${esc(k)}</td><td>${esc(r.name)}</td><td>${esc(r.unit)}</td>
        <td class="r"><input class="price ${S.boq.survey[k] ? 'ov' : ''}" data-sv="${esc(k)}" value="${esc(S.boq.survey[k] ?? '')}" inputmode="decimal"></td><td class="r">${n} รายการ</td></tr>`;
    }).join('')}</table>`;
  box.querySelectorAll('[data-sv]').forEach(el => el.onchange = () => {
    const v = el.value.trim(); if (v === '') delete S.boq.survey[el.dataset.sv]; else S.boq.survey[el.dataset.sv] = +v;
    applySurvey(); autosave(); renderPR1(); renderSummary(); renderSurvey(); toast('ใช้ราคาสืบคิดวัสดุมวลรวมใหม่แล้ว');
  });
}

function priceAll() {
  S.priced = BoqCalc.priceRows(S.db, window.UDPrice, rows(), { overrides: S.boq.overrides });
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
  let h = `<thead><tr><th rowspan="2">ลำดับ</th><th rowspan="2">รายการ</th><th rowspan="2">จำนวน</th><th rowspan="2">หน่วย</th>
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
          <td class="r">${n}</td>
          <td>${custom ? `<input class="cell" data-cf="name" value="${esc(r.name)}">` : esc(r.name)}
            ${r.waste ? `<span class="src">สุทธิ ${fmt(r.qty_net)} + เผื่อ ${+(r.waste * 100).toFixed(2)}%</span>` : ''}
            ${r.warns.map(w => `<span class="warnline">${esc(w)}</span>`).join('')}</td>
          <td class="r">${custom ? `<input class="price" data-cf="qty" value="${esc(r.qty)}">` : fmt(r.qty)}</td>
          <td>${custom ? `<input class="cell" data-cf="unit" value="${esc(r.unit)}" style="width:60px">` : esc(r.unit)}</td>
          <td class="r"><input class="price ${o.mat !== undefined ? 'ov' : ''}" data-ov="mat" value="${r.mat_unit ?? ''}" inputmode="decimal"><span class="src">${esc(r.mat_src)}</span></td>
          <td class="r">${fmt(r.mat_amt)}</td>
          <td class="r"><input class="price ${o.lab !== undefined ? 'ov' : ''}" data-ov="lab" value="${r.lab_unit ?? ''}" inputmode="decimal"><span class="src">${esc(r.lab_src)}</span></td>
          <td class="r">${fmt(r.lab_amt)}</td>
          <td class="r">${fmt(r.total)}</td>
          <td><span class="src">${esc((r.ref && r.ref.note) || r.note || '')}</span>${custom ? '<button class="btn small" data-del="1">ลบ</button>' : ''}</td></tr>`;
        secTot += r.total;
      }
    }
    h += `<tr class="total"><td></td><td colspan="7">รวม ${sc} ${esc(sname)}</td><td class="r">${fmt(r2(secTot))}</td><td></td></tr>`;
    grand += secTot;
  }
  h += `<tr class="total"><td></td><td colspan="7">รวมค่างานต้นทุนทั้งหมด</td><td class="r">${fmt(r2(grand))}</td><td></td></tr></tbody>`;
  tb.innerHTML = h;
  $('#pr1-alert').textContent = warn ? `มี ${warn} รายการที่ยังไม่มีราคาหรือมีคำเตือน (แถบสีส้ม) — แก้ราคาในช่องได้โดยตรง` : '';
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
  const eq = r2((+r.qty || 0) * (+r.price || 0)), inst = r2((+r.qty || 0) * (+r.install || 0));
  return { eq, inst, eqVat: r2(eq * VAT), instVat: r2(inst * VAT) };
}
function renderPR23() { clearTimeout(renderPR23._t); renderPR23._t = setTimeout(_renderPR23, 0); }
function _renderPR23() {
  const t2 = $('#pr2-table');
  let h = `<tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ค่าครุภัณฑ์/หน่วย</th><th>จำนวนเงิน</th><th>ค่าติดตั้ง/หน่วย</th><th>จำนวนเงิน</th><th>รวม (ยังไม่รวม VAT)</th><th></th></tr>`;
  S.boq.pr2.forEach((r, i) => {
    const c = pr2Row(r);
    h += `<tr><td class="r">${i + 1}</td><td><input class="cell" data-i="${i}" data-f="name" value="${esc(r.name)}"></td>
      <td class="r"><input class="price" data-i="${i}" data-f="qty" value="${esc(r.qty)}"></td><td><input class="cell" style="width:60px" data-i="${i}" data-f="unit" value="${esc(r.unit)}"></td>
      <td class="r"><input class="price" data-i="${i}" data-f="price" value="${esc(r.price)}"></td><td class="r">${fmt(c.eq)}</td>
      <td class="r"><input class="price" data-i="${i}" data-f="install" value="${esc(r.install)}"></td><td class="r">${fmt(c.inst)}</td>
      <td class="r">${fmt(r2(c.eq + c.inst))}</td><td><button class="btn small" data-del2="${i}">ลบ</button></td></tr>`;
  });
  t2.innerHTML = h;
  t2.querySelectorAll('input').forEach(el => el.onchange = () => {
    const r = S.boq.pr2[+el.dataset.i]; r[el.dataset.f] = ['qty', 'price', 'install'].includes(el.dataset.f) ? +el.value || 0 : el.value;
    autosave(); renderPR23(); renderSummary();
  });
  t2.querySelectorAll('[data-del2]').forEach(b => b.onclick = () => { S.boq.pr2.splice(+b.dataset.del2, 1); autosave(); renderPR23(); renderSummary(); });

  const t3 = $('#pr3-table');
  let k = `<tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ค่าใช้จ่ายรวม (ค่าก่อสร้าง)</th><th>หมายเหตุ / เหตุผลความจำเป็น</th><th></th></tr>`;
  S.boq.pr3.forEach((r, i) => {
    k += `<tr><td class="r">${i + 1}</td><td><input class="cell" list="pr3-list" data-i="${i}" data-f="name" value="${esc(r.name)}"></td>
      <td class="r"><input class="price" data-i="${i}" data-f="qty" value="${esc(r.qty)}"></td><td><input class="cell" style="width:60px" data-i="${i}" data-f="unit" value="${esc(r.unit)}"></td>
      <td class="r"><input class="price" data-i="${i}" data-f="amount" value="${esc(r.amount)}"></td>
      <td><input class="cell" data-i="${i}" data-f="note" value="${esc(r.note)}"></td><td><button class="btn small" data-del3="${i}">ลบ</button></td></tr>`;
  });
  k += `<tr class="total"><td></td><td colspan="3">รวมค่าใช้จ่ายพิเศษตามข้อกำหนดทุกรายการ</td><td class="r">${fmt(pr3Total())}</td><td colspan="2"></td></tr>`;
  t3.innerHTML = k + `<datalist id="pr3-list">${PR3_TEMPLATES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  t3.querySelectorAll('input').forEach(el => el.onchange = () => {
    const r = S.boq.pr3[+el.dataset.i]; r[el.dataset.f] = ['qty', 'amount'].includes(el.dataset.f) ? +el.value || 0 : el.value;
    autosave(); renderPR23(); renderSummary();
  });
  t3.querySelectorAll('[data-del3]').forEach(b => b.onclick = () => { S.boq.pr3.splice(+b.dataset.del3, 1); autosave(); renderPR23(); renderSummary(); });
}
const pr3Total = () => r2(S.boq.pr3.reduce((a, r) => a + (+r.amount || 0), 0));

// ------------------------------------------------------------------ สรุป ปร.1(ก) ปร.2(ก) ปร.4
function renderSummary() { clearTimeout(renderSummary._t); renderSummary._t = setTimeout(() => { _renderSummary(); renderPlan(); }, 0); }
function _renderSummary() {
  const box = $('#summary');
  if (!S.model) { box.innerHTML = '<div class="card hint">เปิดโมเดลก่อน</div>'; return; }
  const T = totals(), pr = T.pr, p = S.boq.project, fc = S.boq.factor;
  const { secs, cost, ff, build, eq, eqV, ins, insV, eqTotal, sp, grand } = T;
  const head = `<div class="head"><span>ชื่อโครงการ ${esc(p.name)}</span><span>สถานที่ก่อสร้าง ${esc(p.location)}</span>
    <span>แบบเลขที่ ${esc(p.drawing_no || '-')}</span><span>หน่วยงาน ${esc(p.agency)}</span><span>คำนวณราคากลางเมื่อวันที่ ${esc(p.calc_date)}</span><span>หน่วย : บาท</span></div>`;
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
function renderSummaryDoc({ pr, p, fc, secs, cost, ff, build, eq, eqV, ins, insV, eqTotal, sp, grand, head, box }) {
  const sig = `<p class="hint" style="margin-top:18px;text-align:center">ประธานกรรมการกำหนดราคากลาง ............................ &nbsp; กรรมการ ............................ &nbsp; กรรมการ ............................</p>`;
  box.innerHTML = `
  <div class="sum-doc"><h3>แบบ ปร.1 (ก) แบบสรุปค่าก่อสร้าง ค่างานต้นทุน</h3>${head}
    <table class="boq"><tr><th>ลำดับที่</th><th>รายการ</th><th>ค่างานต้นทุน</th><th>Factor F</th><th>ค่าก่อสร้าง</th><th>หมายเหตุ</th></tr>
    ${secs.map((s, i) => `<tr><td class="r">${i + 1}</td><td>${s.c} ${esc(s.n)}</td><td class="r">${fmt(s.cost)}</td><td class="r">${ff.F.toFixed(4)}</td><td class="r">${fmt(s.build)}</td><td></td></tr>`).join('')}
    <tr class="total"><td></td><td>รวมค่าก่อสร้าง</td><td class="r">${fmt(cost)}</td><td></td><td class="r">${fmt(build)}</td><td></td></tr></table>
    <p class="hint" style="margin-top:8px">เงื่อนไขการใช้ตาราง Factor F: เงินค่าจ้างล่วงหน้า ${fc.advance}% · เงินประกันผลงาน ${fc.retention}% · ดอกเบี้ยเงินกู้ ${ff.interest}% · ภาษีมูลค่าเพิ่ม ${ff.vat}%${ff.loanShare ? ` · เงินกู้ไม่เสีย VAT ${+(ff.loanShare * 100).toFixed(2)}%` : ''}</p>
    ${p.area ? `<p class="hint">ขนาดหรือเนื้อที่อาคาร ${fmt(p.area)} ตร.ม. · เฉลี่ย ${fmt(r2(build / p.area))} บาท/ตร.ม.</p>` : ''}${sig}</div>
  <div class="sum-doc"><h3>รายละเอียดการหาค่า Factor F</h3>
    <p class="hint">ค่างานต้นทุนทั้งโครงการ ${fmt(cost)} บาท = ${(cost / 1e6).toFixed(6)} ล้านบาท</p>
    ${ff.detail.map(d => `<p class="mono" style="font-size:13px;margin-top:4px">${esc(d)}</p>`).join('')}
    <p class="hint" style="margin-top:6px">ตามเล่มหลักเกณฑ์อาคาร 2569 ข้อ 9.3 · ทศนิยม 4 ตำแหน่งแบบตัดทิ้ง · ${esc(FactorF.SOURCE)}</p></div>
  ${S.boq.pr2.length ? `<div class="sum-doc"><h3>แบบ ปร.2 (ก) แบบสรุปค่าครุภัณฑ์จัดซื้อ</h3>${head}
    <table class="boq"><tr><th>รายการ</th><th>ค่าครุภัณฑ์</th><th>VAT</th><th>จำนวนเงิน</th><th>ค่าติดตั้ง</th><th>VAT</th><th>จำนวนเงิน</th><th>รวมค่าครุภัณฑ์จัดซื้อ</th></tr>
    <tr><td>ครุภัณฑ์จัดซื้อ</td><td class="r">${fmt(eq)}</td><td class="r">${fmt(eqV)}</td><td class="r">${fmt(r2(eq + eqV))}</td><td class="r">${fmt(ins)}</td><td class="r">${fmt(insV)}</td><td class="r">${fmt(r2(ins + insV))}</td><td class="r">${fmt(eqTotal)}</td></tr></table>${sig}</div>` : ''}
  <div class="sum-doc"><h3>แบบ ปร.4 แบบสรุปราคากลางงานก่อสร้างอาคาร</h3>${head}
    <table class="boq"><tr><th>ลำดับที่</th><th>รายการ</th><th>ค่าก่อสร้าง</th><th>หมายเหตุ</th></tr>
    <tr><td class="r">1</td><td>ค่างานต้นทุน</td><td class="r">${fmt(build)}</td><td></td></tr>
    ${secs.map(s => `<tr><td></td><td>&nbsp;&nbsp;- ${s.c} ${esc(s.n)}</td><td class="r">${fmt(s.build)}</td><td></td></tr>`).join('')}
    <tr><td class="r">2</td><td>ค่าครุภัณฑ์จัดซื้อ</td><td class="r">${fmt(eqTotal)}</td><td></td></tr>
    <tr><td class="r">3</td><td>ค่าใช้จ่ายพิเศษตามข้อกำหนด (ถ้ามี)</td><td class="r">${fmt(sp)}</td><td></td></tr>
    <tr class="total"><td></td><td>รวมค่าก่อสร้างทั้งโครงการงานก่อสร้าง</td><td class="r">${fmt(grand)}</td><td></td></tr></table>
    <p class="bigtotal" style="margin-top:12px">ราคากลาง ${fmt(grand)} บาท</p>
    <p style="text-align:right">(${esc(BoqCalc.bahtText(grand))})</p>${sig}</div>`;
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
  renderGantt(plan, inst); renderSCurve(plan, inst); renderInst(inst, contract);
}
function selectTask(id) {
  const t = S.plan && S.plan.tasks.find(x => x.id === id); if (!t) return;
  S.selTask = id;
  $$('#pl-table tr.row').forEach(x => x.classList.toggle('sel', x.dataset.task === id));
  $$('#pl-gantt .bar').forEach(b => b.classList.toggle('sel', b.dataset.task === id));
  if (S.viewer) S.viewer.highlight(t.from);
  toast(`${t.label}: ${t.from.length} ชิ้นส่วน — ดูในแท็บโมเดล 3D`);
}
function renderGantt(plan, inst) {
  const days = plan.calDays, rowH = 24, left = 250, top = 34, W = Math.max(720, left + days * 12 + 20);
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
    g += `<text x="6" y="${y + 15}">${esc(t.label.length > 34 ? t.label.slice(0, 33) + '…' : t.label)}</text>
      <rect class="bar ${S.selTask === t.id ? 'sel' : ''}" data-task="${esc(t.id)}" x="${x0}" y="${y + 4}" width="${Math.max(3, x1 - x0)}" height="${rowH - 9}" rx="3" fill="${t.color}"><title>${esc(t.label)}\n${thDate(t.start)} – ${thDate(t.finish)} (${t.days} วันทำงาน)\n${fmt(t.cost)} บาท (${t.pct}%)</title></rect>`;
  });
  inst.list.forEach(c => { if (!c.due) return; const xx = x(c.due) + sx; g += `<line class="cut" x1="${xx}" y1="${top - 4}" x2="${xx}" y2="${H}"/><text class="cutlbl" x="${xx + 2}" y="${H - 2}">งวด ${c.no}</text>`; });
  $('#pl-gantt').innerHTML = g + '</svg>';
  $$('#pl-gantt .bar').forEach(b => b.onclick = () => selectTask(b.dataset.task));
}
function renderSCurve(plan, inst) {
  const W = 760, H = 300, l = 44, r = 16, t = 14, b = 34, c = plan.curve;
  const sx = (W - l - r) / Math.max(1, c.length), sy = (H - t - b) / 100;
  const X = i => l + i * sx, Y = p => H - b - p * sy;
  let g = `<svg class="scurve" width="100%" viewBox="0 0 ${W} ${H}" style="max-width:${W}px">`;
  for (let p = 0; p <= 100; p += 20) g += `<line class="grid" x1="${l}" y1="${Y(p)}" x2="${W - r}" y2="${Y(p)}"/><text x="${l - 6}" y="${Y(p) + 4}" text-anchor="end">${p}%</text>`;
  const step = Math.max(1, Math.round(c.length / 8));
  for (let i = 0; i < c.length; i += step) g += `<text x="${X(i)}" y="${H - b + 16}" text-anchor="middle">${thDate(c[i].date)}</text>`;
  g += `<path class="ln" d="M${l},${Y(0)} ${c.map((p, i) => `L${X(i + 1)},${Y(p.pct)}`).join(' ')}"/>`;
  inst.list.forEach(k => {
    const i = c.findIndex(p => p.date === k.due); if (i < 0) return;
    g += `<line class="cut" x1="${X(i + 1)}" y1="${Y(0)}" x2="${X(i + 1)}" y2="${Y(c[i].pct)}"/><circle cx="${X(i + 1)}" cy="${Y(c[i].pct)}" r="3.5" fill="var(--green)"><title>งวด ${k.no} · ${thDate(k.due)} · ผลงานตามแผน ${c[i].pct.toFixed(2)}%</title></circle><text x="${X(i + 1) - 4}" y="${Y(c[i].pct) - 6}" text-anchor="end" style="fill:var(--green)">${c[i].pct.toFixed(1)}%</text>`;
  });
  $('#pl-scurve').innerHTML = g + `<text x="${W - r}" y="${t + 8}" text-anchor="end">คลิกกราฟเพื่อดูอาคาร ณ วันนั้นในแท็บโมเดล 3D</text></svg>`;
  const svg = $('#pl-scurve svg'); svg.style.cursor = 'pointer';
  svg.onclick = e => {
    const rc = svg.getBoundingClientRect(), xv = (e.clientX - rc.left) / rc.width * W;
    const day = Math.max(1, Math.min(c.length, Math.round((xv - l) / sx)));
    $$('#tabs .nav-tab').find(x => x.dataset.tab === 'model').click();
    setTimeout(() => tlSet(day), 50);
  };
}
function renderInst(inst, contract) {
  const fc = S.boq.factor, L = inst.list;
  const sum = k => r2(L.reduce((a, g) => a + g[k], 0));
  $('#pl-inst').innerHTML = `<tr><th>งวดที่</th><th>เนื้องานที่ต้องแล้วเสร็จ</th><th>กำหนดแล้วเสร็จ</th><th>% งวด</th><th>% สะสม</th><th>จำนวนเงิน</th><th>หักเงินล่วงหน้า ${fc.advance}%</th><th>หักประกันผลงาน ${fc.retention}%</th><th>จ่ายสุทธิ</th></tr>` +
    L.map(g => `<tr><td class="r">${g.no}</td><td>${g.labels.map(esc).join('<br>') || '<span class="alert">ไม่มีงาน</span>'}</td>
      <td>${thDate(g.due)}${g.due ? `<span class="src">วันที่ ${Schedule.parse(g.due) - Schedule.parse(S.plan.start) >= 0 ? Math.round((Schedule.parse(g.due) - Schedule.parse(S.plan.start)) / 864e5) + 1 : ''} นับจากเริ่มงาน</span>` : ''}</td>
      <td class="r">${g.pct.toFixed(2)}</td><td class="r">${g.cumPct.toFixed(2)}</td><td class="r">${fmt(g.amount)}</td><td class="r">${fmt(g.advance)}</td><td class="r">${fmt(g.retention)}</td><td class="r">${fmt(g.net)}</td></tr>`).join('') +
    `<tr class="total"><td></td><td colspan="2">รวม</td><td class="r">${r2(L.reduce((a, g) => a + g.pct, 0)).toFixed(2)}</td><td></td><td class="r">${fmt(sum('amount'))}</td><td class="r">${fmt(sum('advance'))}</td><td class="r">${fmt(sum('retention'))}</td><td class="r">${fmt(sum('net'))}</td></tr>`;
  $('#pl-instnote').innerHTML = `% ของงวด = ค่างานของงานในงวด ÷ ค่างานรวม (ปัด 2 ตำแหน่ง งวดสุดท้ายรับเศษให้ครบ 100%) · จำนวนเงิน = ${fmt(contract)} × % งวด ·
    เงินล่วงหน้าและประกันผลงานใช้ % เดียวกับเงื่อนไข Factor F ในหน้าโครงการ · เงินประกันผลงานคืนตามเงื่อนไขสัญญา (ไม่รวมในตาราง)`;
}

// ------------------------------------------------------------------ 3D
function buildLayers(groups) {
  $('#layer-list').innerHTML = groups.map(g => `<label><input type="checkbox" ${S.viewer.groups[g].visible ? 'checked' : ''} data-layer="${esc(g)}"> ${esc(g)}</label>`).join('');
  $$('#layer-list input').forEach(cb => cb.onchange = () => {
    if (cb.dataset.layer === 'เหล็กเสริม') { S.viewer.setXray(cb.checked); syncLayers(); return; }
    S.viewer.setVisible(cb.dataset.layer, cb.checked);
  });
  buildClip(); tlReset();
}
function syncLayers() { $$('#layer-list input').forEach(cb => { const g = S.viewer.groups[cb.dataset.layer]; if (g) cb.checked = g.visible; }); }
function buildClip() {
  const m = S.model, v = S.viewer; if (!m || !v || !v.bbox) return;
  const lv = (m.levels || []).slice().sort((a, b) => a.z - b.z);
  $('#clip-level').innerHTML = '<option value="">ไม่ตัด (ทั้งหมด)</option>' + lv.map(l => `<option value="${l.z}">ถึงระดับ ${esc(l.name)} (${l.z >= 0 ? '+' : ''}${(+l.z).toFixed(2)})</option>`).join('');
  const zr = $('#clip-z'); zr.min = v.bbox.min.y.toFixed(2); zr.max = (v.bbox.max.y + 0.05).toFixed(2); zr.value = zr.max; zr.disabled = true;
  $('#clip-label').textContent = '';
}
function setClip(z) {
  const zr = $('#clip-z');
  if (z === null) { S.viewer.setClip(null); zr.disabled = true; zr.value = zr.max; $('#clip-label').textContent = ''; $('#clip-level').value = ''; return; }
  S.viewer.setClip(z); zr.disabled = false; zr.value = z;
  $('#clip-label').textContent = `แสดงเฉพาะส่วนที่ต่ำกว่า ${z >= 0 ? '+' : ''}${(+z).toFixed(2)} ม.`;
}
function applyPreset(name) {
  const v = S.viewer; if (!v) return;
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
  $('#tl-label').textContent = `ลากแถบหรือกด ▶ เพื่อดูลำดับก่อสร้าง ${p.calDays} วัน (${thDate(p.start)} – ${thDate(p.finish)})`;
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
  $('#tl-label').innerHTML = `<b>วันที่ ${day}/${p.calDays}</b> · ${thDate(date)} · ผลงานตามแผน <b style="color:var(--green)">${day ? cv.pct.toFixed(1) : '0.0'}%</b>` +
    (now.length ? ` · กำลังทำ: ${now.map(t => `<span class="pill" style="border-color:${t.color}">${esc(t.label.replace(/ — .*/, ''))} ${Math.round(prog[t.id] * 100)}%</span>`).join('')}` : '');
}
function tlDone() {
  tlStop(); TL.day = null;
  if (S.viewer) { S.viewer.setState(null); if (S.viewer.groups['เหล็กเสริม']) S.viewer.groups['เหล็กเสริม'].visible = S.viewer.xray; }
  if (S.plan) { $('#tl-day').value = S.plan.calDays; $('#tl-label').textContent = `อาคารเสร็จ · ${S.plan.calDays} วัน (${thDate(S.plan.start)} – ${thDate(S.plan.finish)})`; }
}
function tlStop() { clearInterval(TL.timer); TL.timer = null; $('#tl-play').textContent = '▶ เล่นลำดับก่อสร้าง'; }
function tlPlay() {
  if (TL.timer) return tlStop();
  if (!S.plan) return toast('แผนงานยังไม่พร้อม');
  let d = (TL.day === null || TL.day >= S.plan.calDays) ? 0 : TL.day;
  $('#tl-play').textContent = '⏸ หยุด';
  const ms = Math.max(60, Math.min(250, 12000 / S.plan.calDays));
  TL.timer = setInterval(() => { d++; if (d >= S.plan.calDays) { tlDone(); return; } tlSet(d); }, ms);
}
function initViewer() {
  if (S.viewer || typeof THREE === 'undefined') return;
  S.viewer = new BmViewer.Viewer($('#viewer'), { onPick: d => {
    if (!d || !d.id) { $('#pick-info').textContent = 'คลิกชิ้นส่วนในโมเดล'; return; }
    const items = (S.priced || []).filter(r => (r.from || []).includes(d.id));
    $('#pick-info').innerHTML = `<div class="kv"><b>id</b><span class="mono">${esc(d.id)}</span><b>กลุ่ม</b><span>${esc(d.group)}</span><b>รายละเอียด</b><span>${esc(d.info || '')}</span></div>
      <p class="hint" style="margin-top:8px">อยู่ในรายการ BOQ ${items.length} รายการ:</p><ul class="hint" style="margin-left:18px">${items.map(r => `<li>${esc(r.group_code)} ${esc(r.name)}</li>`).join('')}</ul>`;
    S.viewer.highlight([d.id]);
  } });
  if (S.model) buildLayers(S.viewer.load(S.model));
  const sel = S.selKey && (S.priced || []).find(r => r.key === S.selKey);
  if (sel) S.viewer.highlight(sel.from || []);
}

// ------------------------------------------------------------------ events
function bind() {
  $$('#tabs .nav-tab').forEach(t => t.onclick = () => {
    $$('#tabs .nav-tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + t.dataset.tab));
    if (t.dataset.tab === 'model') { initViewer(); S.viewer && S.viewer.resize(); }
  });
  $('#f-model').onchange = async e => { try { const f = await readFile(e.target); loadModel(f.text, f.name); toast('เปิดโมเดลแล้ว'); } catch (er) { if (er) alert('เปิดไฟล์ไม่ได้: ' + er.message); } e.target.value = ''; };
  $('#f-boq').onchange = async e => {
    try {
      const f = await readFile(e.target); const b = JSON.parse(f.text);
      if (b.format !== 'ud-boq') throw new Error('ไม่ใช่ไฟล์ .boq.json');
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
    download((S.modelName || 'project').replace(/\.bm\.json$|\.json$/, '') + '.boq.json', JSON.stringify(S.boq, null, 1));
  };
  $('#b-sample').onclick = async () => {
    try { const r = await fetch('../examples/sample-building.bm.json'); loadModel(await r.text(), 'sample-building.bm.json'); toast('เปิดอาคารตัวอย่างแล้ว'); }
    catch (er) { alert('โหลดตัวอย่างไม่ได้: ' + er.message); }
  };
  $$('#proj-form [data-k]').forEach(el => el.onchange = () => {
    S.boq.project[el.dataset.k] = el.type === 'number' ? (+el.value || '') : el.value;
    if (el.dataset.k === 'name') $('#meta-proj').textContent = el.value;
    autosave(); renderSummary(); renderPR1();
  });
  [['#ff-adv', 'advance'], ['#ff-ret', 'retention'], ['#ff-loan', 'loanPct']].forEach(([s, k]) => $(s).onchange = () => {
    S.boq.factor[k] = +$(s).value || 0; autosave(); renderSummary();
  });
  $('#b-addrow').onclick = addCustomRow;
  $('#b-add-pr2').onclick = () => { S.boq.pr2.push({ name: '', qty: 1, unit: 'ชุด', price: 0, install: 0 }); autosave(); renderPR23(); };
  $('#b-add-pr3').onclick = () => { S.boq.pr3.push({ name: '', qty: 1, unit: 'งาน', amount: 0, note: '' }); autosave(); renderPR23(); };
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
  $$('[data-view]').forEach(b => b.onclick = () => S.viewer && S.viewer.setView(b.dataset.view));
  $$('[data-preset]').forEach(b => b.onclick = () => applyPreset(b.dataset.preset));
  $('#clip-level').onchange = e => setClip(e.target.value === '' ? null : +e.target.value + 0.02);
  $('#clip-z').oninput = e => setClip(+e.target.value);
  $('#b-side-close').onclick = () => { $('#model-wrap').classList.add('collapsed'); setTimeout(() => S.viewer && S.viewer.resize(), 50); try { localStorage.setItem('udboq:side', '1'); } catch (er) { /* */ } };
  $('#b-side-open').onclick = () => { $('#model-wrap').classList.remove('collapsed'); setTimeout(() => S.viewer && S.viewer.resize(), 50); try { localStorage.setItem('udboq:side', '0'); } catch (er) { /* */ } };
  try { if (localStorage.getItem('udboq:side') === '1') $('#model-wrap').classList.add('collapsed'); } catch (er) { /* */ }
  $('#tl-play').onclick = tlPlay;
  $('#tl-day').oninput = e => { tlStop(); tlSet(+e.target.value); };
  $('#tl-done').onclick = tlDone;
  $('#b-fit').onclick = () => S.viewer && S.viewer.fit();
  $('#b-clear').onclick = () => S.viewer && S.viewer.highlight([]);
}

bind();
renderAll();
loadPrices();
