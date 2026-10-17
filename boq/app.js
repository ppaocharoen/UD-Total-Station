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
    overrides: {}, survey: {}, custom_rows: [], pr2: [], pr3: [], model_file: '', saved_at: '' };
}

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
  S.boq = saved && saved.format === 'ud-boq' ? saved : newBoq();
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
  renderProject(); renderSurvey(); renderPR1(); renderPR23(); renderSummary();
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
function renderSummary() { clearTimeout(renderSummary._t); renderSummary._t = setTimeout(_renderSummary, 0); }
function _renderSummary() {
  const box = $('#summary');
  if (!S.model) { box.innerHTML = '<div class="card hint">เปิดโมเดลก่อน</div>'; return; }
  const pr = priceAll();
  const p = S.boq.project, fc = S.boq.factor;
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
  const head = `<div class="head"><span>ชื่อโครงการ ${esc(p.name)}</span><span>สถานที่ก่อสร้าง ${esc(p.location)}</span>
    <span>แบบเลขที่ ${esc(p.drawing_no || '-')}</span><span>หน่วยงาน ${esc(p.agency)}</span><span>คำนวณราคากลางเมื่อวันที่ ${esc(p.calc_date)}</span><span>หน่วย : บาท</span></div>`;
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

// ------------------------------------------------------------------ 3D
function buildLayers(groups) {
  $('#layer-list').innerHTML = groups.map(g => `<label><input type="checkbox" checked data-layer="${esc(g)}"> ${esc(g)}</label>`).join('');
  $$('#layer-list input').forEach(cb => cb.onchange = () => S.viewer.setVisible(cb.dataset.layer, cb.checked));
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
  $('#b-fit').onclick = () => S.viewer && S.viewer.fit();
  $('#b-clear').onclick = () => S.viewer && S.viewer.highlight([]);
}

bind();
renderAll();
loadPrices();
