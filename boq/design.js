/* design.js — แท็บออกแบบโครงสร้าง (WSD) ใช้ lib/rcwsd.js
 * เกณฑ์ออกแบบ + คาน + พื้น (สองทาง / ทางเดียว / ยื่น) + เสาปลอกเดี่ยว + ฐานแผ่ → เหล็กเสริมเขียนลง design ของโมเดล
 * ใช้ตัวแปรร่วมจาก app.js: S, $, $$, esc, fmt, toast, download, autosave, buildLayers
 */
'use strict';
const DSG_DEF = () => ({ crit: { F: 0.45, mode: 1, fy: 4000, fyv: 2400, cov: 2.5, dias: [12, 16, 20, 25], slabFy: 2400, slabCov: 2, slabDias: [9, 12], colCov: 3, colDias: [12, 16, 20], ftCov: 7.5, qa: '', gamma: 1800, ftDias: [12, 16], plateFy: 2400 }, beams: {}, slabs: {}, cols: {}, foots: {}, plates: {}, sel: '' });
const SLAB_DIAS = fy => fy <= 2400 ? [9, 12, 15] : [10, 12, 16];
function dsg() {
  const b = S.boq; if (!b.dsg) b.dsg = DSG_DEF();
  const d = b.dsg; d.crit = Object.assign(DSG_DEF().crit, d.crit || {}); d.beams = d.beams || {}; d.slabs = d.slabs || {}; d.cols = d.cols || {}; d.foots = d.foots || {}; d.plates = d.plates || {}; return d;
}
const df2 = (x, n = 2) => (x === null || x === undefined || Number.isNaN(+x)) ? '-' : (+x).toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
const okTag = ok => ok ? '<b class="d-ok">[Ok.]</b>' : '<b class="d-ng">[Fail]</b>';

/** f'c ของชิ้น (จากวัสดุในโมเดล) */
function dsgFcp(mid) {
  const m = S.model, ms = m.materials || [], x = (m.members || []).find(y => y.id === mid);
  const mt = x && ms.find(y => y.id === x.material && y.kind === 'concrete');
  return (mt && +mt.fc) || ((ms.find(y => y.kind === 'concrete') || {}).fc) || 240;
}
function dsgCrit(fcp) { const c = dsg().crit; return RcWsd.criteria({ fcp, F: +c.F, mode: +c.mode, fy: +c.fy, fyv: +c.fyv }); }

/** คานในโมเดล + ประเภทคาน (เดาจากการต่อเนื่อง) + แรงจากผล SAP */
function dsgBeamList() {
  const m = S.model; if (!m) return [];
  const N = Object.fromEntries((m.nodes || []).map(n => [n.id, n])), sec = Object.fromEntries((m.sections || []).map(s => [s.id, s]));
  const beams = (m.members || []).filter(x => (x.type === 'beam' || x.type === 'tie_beam') && sec[x.section] && sec[x.section].kind === 'rc_rect');
  const all = m.members || [], sup = new Set((m.supports || []).map(s => s.node));
  const dir = x => { const a = N[x.i], b = N[x.j]; const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const res = (m.results && m.results.members) || {};
  return beams.map(x => {
    const a = N[x.i], b = N[x.j], s = sec[x.section], L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), u = dir(x);
    const endInfo = nid => {
      const oth = all.filter(y => y !== x && (y.i === nid || y.j === nid));
      const cont = oth.some(y => (y.type === 'beam' || y.type === 'tie_beam') && N[y.i] && N[y.j] && Math.abs(dir(y)[0] * u[0] + dir(y)[1] * u[1]) > 0.95);
      const held = sup.has(nid) || oth.some(y => y.type === 'column' || y.type === 'beam' || y.type === 'tie_beam');
      return { cont, free: !held };
    };
    const ei = endInfo(x.i), ej = endInfo(x.j);
    const auto = (ei.free || ej.free) ? 4 : (ei.cont && ej.cont) ? 3 : (ei.cont || ej.cont) ? 2 : 1;
    const r = res[x.id], env = k => r && r[k] ? r[k] : null;
    let sap = null;
    if (r) {
      const M3 = env('M3') || {}, V2 = env('V2') || {}, T = env('T') || {};
      sap = { Mpos: Math.max(0, +M3.max || 0), Mneg: Math.max(0, -(+M3.min || 0)), V: Math.max(Math.abs(+V2.max || 0), Math.abs(+V2.min || 0)), T: Math.max(Math.abs(+T.max || 0), Math.abs(+T.min || 0)),
        combo: [M3.combo_max, M3.combo_min, V2.combo_max].filter(Boolean).filter((v, i, A) => A.indexOf(v) === i).join(', ') };
    }
    return { id: x.id, mark: x.mark || '', kind: x.type, level: x.level || '', b: +s.b, h: +s.h, L, auto, sap, fcp: dsgFcp(x.id) };
  });
}
/** ค่าที่ใช้ออกแบบของคาน: ผู้ใช้กรอก > ผล SAP */
function dsgInput(bm) {
  const u = dsg().beams[bm.id] || {}, sp = bm.sap || {};
  const pick = k => (u[k] !== undefined && u[k] !== '') ? +u[k] : (sp[k] !== undefined ? sp[k] : null);
  const f = { Mpos: pick('Mpos'), Mneg: pick('Mneg'), V: pick('V'), T: pick('T') || 0 };
  const src = ['Mpos', 'Mneg', 'V', 'T'].some(k => u[k] !== undefined && u[k] !== '') ? 'กรอกเอง' : bm.sap ? 'SAP' : '';
  return { f, type: +(u.type || bm.auto), src, has: f.Mpos !== null || f.Mneg !== null };
}
function dsgRun(bm) {
  const c = dsg().crit, inp = dsgInput(bm); if (!inp.has) return null;
  const crit = dsgCrit(bm.fcp), g = { b: bm.b, h: bm.h, L: bm.L, type: inp.type, cov: +c.cov };
  const d = RcWsd.beamDesign({ Mpos: inp.f.Mpos || 0, Mneg: inp.f.Mneg || 0, V: inp.f.V || 0, T: inp.f.T || 0 }, g, crit, { dias: (c.dias || []).map(Number).sort((a, b) => a - b) });
  return Object.assign(d, { crit, g, inp });
}
const rbText = (rb, fy) => {
  if (!rb) return '-';
  const B = (a, s = '') => a ? `${a[0]}-${RcWsd.barName(a[1], fy)}${s}` : '';
  return [`บน ${B(rb.top)}${rb.extra_top ? ' + ' + B(rb.extra_top, ' เสริม') : ''}`, `ล่าง ${B(rb.bot)}${rb.extra_bot ? ' + ' + B(rb.extra_bot, ' เสริม') : ''}`,
    `ปลอก ${rb.double_stirrup ? '2×' : ''}RB ${rb.stirrup[0]} @${rb.stirrup[1]}`].join(' · ');
};

// ------------------------------------------------------------------ หน้าจอ
function renderDesign() {
  const box = $('#dsg-body'); if (!box) return;
  if (!S.model) { box.innerHTML = '<div class="card hint">เปิดโมเดลก่อน</div>'; return; }
  const D = dsg(), c = D.crit, beams = dsgBeamList(), fcp = beams[0] ? beams[0].fcp : dsgFcp(''), cr = dsgCrit(fcp);
  S.dsgOut = {};
  beams.forEach(bm => { S.dsgOut[bm.id] = dsgRun(bm); });
  const slabs = dsgSlabList(); S.dsgSlab = {}; slabs.forEach(sl => { S.dsgSlab[sl.id] = dsgSlabRun(sl); });
  const cols = dsgColList(); S.dsgCol = {}; cols.forEach(x => { S.dsgCol[x.id] = dsgColRun(x); });
  const foots = dsgFootList(); S.dsgFoot = {}; foots.forEach(x => { S.dsgFoot[x.id] = dsgFootRun(x); });
  const plates = dsgPlateList(); S.dsgPlate = {}; plates.forEach(x => { S.dsgPlate[x.id] = dsgPlateRun(x); });
  const nRes = Object.keys((S.model.results && S.model.results.members) || {}).length;
  const opt = (v, cur, t) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`;
  const done = beams.filter(b => S.dsgOut[b.id]), pass = done.filter(b => S.dsgOut[b.id].ok).length;
  box.innerHTML = `
  <div class="card"><h2>เกณฑ์ออกแบบ (WSD)</h2>
    <div class="form-grid dsg-crit">
      <label>f'c คอนกรีต (จากวัสดุในโมเดล)<input value="${fcp} ksc" disabled></label>
      <label>หน่วยแรงอัดที่ยอมให้ fc<select data-dc="mode">${opt(1, c.mode, '0.45 f\'c ไม่เกิน 65 ksc (ตามกฎหมาย)')}${opt(2, c.mode, '0.45 f\'c (มีการควบคุมคุณภาพ)')}</select></label>
      <label>สัดส่วน fc / f'c<select data-dc="F">${opt(0.45, c.F, '0.45')}${opt(0.375, c.F, '0.375')}</select></label>
      <label>เหล็กหลัก<select data-dc="fy">${opt(3000, c.fy, 'SD30 (fy 3,000)')}${opt(4000, c.fy, 'SD40 (fy 4,000)')}${opt(5000, c.fy, 'SD50 (fy 5,000)')}</select></label>
      <label>เหล็กปลอก<select data-dc="fyv">${opt(2400, c.fyv, 'SR24 (fy 2,400)')}</select></label>
      <label>ระยะหุ้มคาน (ซม.)<input data-dc="cov" inputmode="decimal" value="${esc(c.cov)}"></label>
      <label>เหล็กพื้น<select data-dc="slabFy">${opt(2400, c.slabFy, 'SR24 (fy 2,400)')}${opt(3000, c.slabFy, 'SD30 (fy 3,000)')}${opt(4000, c.slabFy, 'SD40 (fy 4,000)')}</select></label>
      <label>ระยะหุ้มพื้น (ซม.)<input data-dc="slabCov" inputmode="decimal" value="${esc(c.slabCov)}"></label>
      <label>ระยะหุ้มเสา (ซม.)<input data-dc="colCov" inputmode="decimal" value="${esc(c.colCov)}"></label>
      <label>ระยะหุ้มฐานราก (ซม.)<input data-dc="ftCov" inputmode="decimal" value="${esc(c.ftCov)}"></label>
      <label>กำลังรับน้ำหนักดินปลอดภัย qa (กก./ตร.ม.)<input data-dc="qa" inputmode="decimal" value="${esc(c.qa)}" placeholder="ใส่ตามผลเจาะสำรวจ"></label>
      <label>เหล็กแผ่นเพลท Fy (ksc)<select data-dc="plateFy">${opt(2400, c.plateFy, '2,400 (SS400 / Fe-24)')}${opt(3000, c.plateFy, '3,000 (Fe-30)')}</select></label>
      <label>หน่วยน้ำหนักดินถม γ (กก./ลบ.ม.)<input data-dc="gamma" inputmode="decimal" value="${esc(c.gamma)}"></label>
      <div class="dsg-dias"><span>ขนาดเหล็กหลักที่ใช้</span>${[12, 16, 20, 25, 28].map(d => `<label class="ck"><input type="checkbox" data-dia="${d}" ${(c.dias || []).map(Number).includes(d) ? 'checked' : ''}>DB${d}</label>`).join('')}</div>
      <div class="dsg-dias"><span>ขนาดเหล็กพื้นที่ใช้</span>${SLAB_DIAS(+c.slabFy).map(d => `<label class="ck"><input type="checkbox" data-sdia="${d}" ${(c.slabDias || []).map(Number).includes(d) ? 'checked' : ''}>${RcWsd.barName(d, +c.slabFy)}</label>`).join('')}</div>
    </div>
    <div class="table-wrap"><table class="boq dsg-kv"><tr><th>fc</th><th>fs เหล็กหลัก</th><th>fs ปลอก</th><th>Ec</th><th>n</th><th>k</th><th>j</th><th>R</th><th>vc</th></tr>
      <tr><td class="r">${df2(cr.fc)}${cr.capped ? ' <span class="pill warn">จำกัด 65</span>' : ''}</td><td class="r">${df2(cr.main.fs, 0)}</td><td class="r">${df2(cr.stir.fs, 0)}</td><td class="r">${df2(cr.Ec, 0)}</td><td class="r">${df2(cr.n, 3)}${cr.nOk ? '' : ' <span class="pill err">&lt; 6</span>'}</td><td class="r">${df2(cr.main.k, 4)}</td><td class="r">${df2(cr.main.j, 4)}</td><td class="r">${df2(cr.main.R, 3)}</td><td class="r">${df2(cr.vc, 3)}</td></tr></table></div>
    ${cr.note ? `<p class="d-note">หมายเหตุที่ต้องระบุในแบบ: ${esc(cr.note)}</p>` : ''}
    <p class="hint">ที่มา: รายการคำนวณ RC_Design_WSD (สูตรเดียวกันทุกเซลล์) · ประกาศ มท. การออกแบบอาคารและคุณสมบัติวัสดุ 2567</p>
  </div>
  <div class="card dsg-actions"><div class="btn-row"><button class="btn primary" id="dsg-write">เขียนเหล็กคานและพื้นลงโมเดล</button><button class="btn" id="dsg-dl">ดาวน์โหลด .bm.json</button><button class="btn" id="dsg-print">พิมพ์รายการคำนวณ</button></div>
    <p class="hint">เขียนเฉพาะชิ้นที่ผ่าน · เขียนแล้ว 3D และ ปร.1 อัปเดตเหล็กเสริมทันที · พิมพ์: ถ้าเลือกแถวไว้จะพิมพ์ตัวนั้น ไม่เลือกจะพิมพ์ทุกตัวที่ออกแบบได้</p></div>
  <div class="card"><h2>คาน คสล. <span class="hint">${done.length}/${beams.length} ตัวมีแรง · ผ่าน ${pass}</span></h2>
    <p class="hint">${nRes ? `แรงจากผลวิเคราะห์ SAP (${nRes} ชิ้น) — แก้ในช่องได้ ช่องที่แก้จะใช้แทนผล SAP` : 'ยังไม่มีผลวิเคราะห์ SAP ในโมเดล — กรอก M+ (กลางช่วง) M− (ที่ฐานรองรับ) V T ของแต่ละคาน หรือรัน tools/sap_results.py --write'} · ประเภทคานเดาจากการต่อเนื่องของคานในแนวเดียวกัน แก้ได้</p>
    <div class="table-wrap"><table class="boq dsg-tab"><tr><th>คาน</th><th>b×h (ม.)</th><th>L (ม.)</th><th>ประเภท</th><th>M+ กก.-ม.</th><th>M− กก.-ม.</th><th>V กก.</th><th>T กก.-ม.</th><th>เหล็กเสริม</th><th>ratio</th><th></th></tr>
    ${beams.map(bm => {
      const r = S.dsgOut[bm.id], u = D.beams[bm.id] || {}, inp = dsgInput(bm);
      const cell = k => `<input class="price${u[k] !== undefined && u[k] !== '' ? ' ov' : ''}" data-bf="${k}" inputmode="decimal" value="${u[k] !== undefined && u[k] !== '' ? esc(u[k]) : (bm.sap ? df2(bm.sap[k], 0).replace(/,/g, '') : '')}" placeholder="-">`;
      return `<tr class="row ${D.sel === bm.id ? 'sel' : ''}" data-bm="${esc(bm.id)}"><td class="c-name"><b>${esc(bm.mark)}</b> <span class="hint">${esc(bm.id)}</span>${inp.src ? `<span class="src">${inp.src}</span>` : ''}</td>
        <td class="r" data-l="b×h (ม.)">${df2(bm.b)}×${df2(bm.h)}</td><td class="r" data-l="L (ม.)">${df2(bm.L)}</td>
        <td data-l="ประเภท"><select data-bf="type">${[1, 2, 3, 4].map(t => opt(t, inp.type, RcWsd.BEAM_TYPES_TH[t] + (t === bm.auto ? ' *' : ''))).join('')}</select></td>
        <td data-l="M+ กก.-ม.">${cell('Mpos')}</td><td data-l="M− กก.-ม.">${cell('Mneg')}</td><td data-l="V กก.">${cell('V')}</td><td data-l="T กก.-ม.">${cell('T')}</td>
        <td class="dsg-rb">${r ? esc(rbText(r.rebar, +c.fy)) + (r.error ? `<span class="warnline">${esc(r.error)}</span>` : '') : '<span class="hint">ยังไม่มีแรง</span>'}</td>
        <td class="r" data-l="ratio">${r && r.rebar ? df2(r.ratio, 2) : ''}</td><td>${r ? (r.ok ? '<span class="pill ok">ผ่าน</span>' : '<span class="pill err">ไม่ผ่าน</span>') : ''}</td></tr>`;
    }).join('')}</table></div>
    <p class="hint">* = ประเภทที่ระบบเดา · ratio = แรงที่ต้องรับ ÷ ที่หน้าตัดรับได้ (เหล็ก/หน่วยแรงเฉือน ค่ามากสุด) · เหล็กเสริมบนยาว 2/3 ช่วง เหล็กเสริมล่างยาว 0.75 ช่วง (ตามวิธีถอดปริมาณ)</p>
  </div>
  ${slabCard(slabs)}
  ${colCard(cols)}
  ${footCard(foots)}
  ${plateCard(plates)}
  <div id="dsg-report">${D.sel && D.sel.startsWith('pl:') && S.dsgPlate[D.sel.slice(3)] && S.dsgPlate[D.sel.slice(3)].r ? plateReport(plates.find(x => x.id === D.sel.slice(3)), S.dsgPlate[D.sel.slice(3)])
    : D.sel && D.sel.startsWith('col:') && S.dsgCol[D.sel.slice(4)] && S.dsgCol[D.sel.slice(4)].r ? colReport(cols.find(x => x.id === D.sel.slice(4)), S.dsgCol[D.sel.slice(4)])
    : D.sel && D.sel.startsWith('ft:') && S.dsgFoot[D.sel.slice(3)] && S.dsgFoot[D.sel.slice(3)].r ? footReport(foots.find(x => x.id === D.sel.slice(3)), S.dsgFoot[D.sel.slice(3)])
    : D.sel && D.sel.startsWith('slab:') && S.dsgSlab[D.sel.slice(5)] && S.dsgSlab[D.sel.slice(5)].r ? slabReport(slabs.find(x => x.id === D.sel.slice(5)), S.dsgSlab[D.sel.slice(5)])
    : D.sel && S.dsgOut[D.sel] ? beamReport(beams.find(b => b.id === D.sel), S.dsgOut[D.sel]) : '<div class="card hint">แตะแถวคาน พื้น เสา หรือฐานรากเพื่อดูรายการคำนวณ</div>'}</div>`;
  bindDesign(beams, slabs, cols, foots, plates);
}
function bindDesign(beams, slabs, cols, foots, plates) {
  const D = dsg(), re = () => { autosave(); renderDesign(); };
  $$('#dsg-body [data-dc]').forEach(el => el.onchange = () => {
    const k = el.dataset.dc, v = el.value.trim().replace(/,/g, ''); D.crit[k] = k === 'qa' ? (v === '' ? '' : Math.abs(+v) || '') : ({ cov: 2.5, slabCov: 2, colCov: 3, ftCov: 7.5, gamma: 1800 }[k] !== undefined ? (+v || { cov: 2.5, slabCov: 2, colCov: 3, ftCov: 7.5, gamma: 1800 }[k]) : +v);
    if (k === 'slabFy') D.crit.slabDias = SLAB_DIAS(+el.value).slice(0, 2);
    re();
  });
  $$('#dsg-body [data-sdia]').forEach(el => el.onchange = () => { const s = new Set((D.crit.slabDias || []).map(Number)); el.checked ? s.add(+el.dataset.sdia) : s.delete(+el.dataset.sdia); if (!s.size) { el.checked = true; return toast('ต้องเลือกอย่างน้อย 1 ขนาด'); } D.crit.slabDias = [...s].sort((a, b) => a - b); re(); });
  $$('#dsg-body tr[data-sl]').forEach(tr => {
    const id = tr.dataset.sl;
    tr.querySelectorAll('[data-sf]').forEach(el => el.onchange = () => {
      const u = D.slabs[id] = D.slabs[id] || {}, k = el.dataset.sf, v = el.value.trim().replace(/,/g, '');
      if (k === 'type') u.type = v; else if (v === '') delete u[k]; else u[k] = Math.abs(+v) || 0;
      D.sel = 'slab:' + id; re();
    });
    tr.addEventListener('click', e => { if (['INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName)) return; D.sel = 'slab:' + id; renderDesign(); const r = $('#dsg-report'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
  $$('#dsg-body [data-dia]').forEach(el => el.onchange = () => { const s = new Set((D.crit.dias || []).map(Number)); el.checked ? s.add(+el.dataset.dia) : s.delete(+el.dataset.dia); if (!s.size) { el.checked = true; return toast('ต้องเลือกอย่างน้อย 1 ขนาด'); } D.crit.dias = [...s].sort((a, b) => a - b); re(); });
  $$('#dsg-body tr[data-bm]').forEach(tr => {
    const id = tr.dataset.bm;
    tr.querySelectorAll('[data-bf]').forEach(el => el.onchange = () => {
      const u = D.beams[id] = D.beams[id] || {}, k = el.dataset.bf, v = el.value.trim().replace(/,/g, '');
      if (k === 'type') u.type = +v; else if (v === '') delete u[k]; else u[k] = Math.abs(+v) || 0;
      D.sel = id; re();
    });
    tr.addEventListener('click', e => { if (['INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName)) return; D.sel = id; renderDesign(); const r = $('#dsg-report'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
  [['tr[data-cl]', 'cl', 'cf', 'cols', 'col:'], ['tr[data-ft]', 'ft', 'ff', 'foots', 'ft:'], ['tr[data-pl]', 'pl', 'pf', 'plates', 'pl:']].forEach(([sel, key, fk, store, pre]) => $$('#dsg-body ' + sel).forEach(tr => {
    const id = tr.dataset[key];
    tr.querySelectorAll(`[data-${fk}]`).forEach(el => el.onchange = () => {
      const u = D[store][id] = D[store][id] || {}, k = el.dataset[fk], v = el.value.trim().replace(/,/g, '');
      if (k === 'case' || k === 'resize' || k === 'type') u[k] = el.type === 'checkbox' ? el.checked : +v; else if (v === '') delete u[k]; else u[k] = Math.abs(+v) || 0;
      D.sel = pre + id; re();
    });
    tr.addEventListener('click', e => { if (['INPUT', 'SELECT', 'OPTION', 'LABEL'].includes(e.target.tagName)) return; D.sel = pre + id; renderDesign(); const r = $('#dsg-report'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }));
  $('#dsg-write').onclick = () => dsgWrite(beams, slabs, cols, foots, plates);
  $('#dsg-dl').onclick = () => { download(S.modelName.replace(/(\.bm)?\.json$/, '') + '.bm.json', JSON.stringify(S.model, null, 1)); };
  $('#dsg-print').onclick = () => dsgPrint(beams, slabs, cols, foots, plates);
}
function dsgWrite(beams, slabs, cols, foots, plates) {
  const m = S.model, c = dsg().crit, D = dsg(); m.design = m.design || {}; m.design.members = m.design.members || {};
  let n = 0, skip = 0; D.applied = D.applied || {};
  beams.forEach(bm => {
    const r = S.dsgOut[bm.id]; if (!r || !r.rebar) return; if (!r.ok) { skip++; return; }
    m.design.members[bm.id] = D.applied[bm.id] = { method: 'WSD', rebar: r.rebar, pass: !!r.ok, ratio: Math.round(r.ratio * 1000) / 1000,
      governing: [r.inp.src === 'SAP' && bm.sap && bm.sap.combo ? bm.sap.combo : r.inp.src, RcWsd.BEAM_TYPES_TH[r.inp.type]].filter(Boolean).join(' · '),
      status: 'computed', src: `UD Total Station v${UD_VERSION.v} ออกแบบ WSD (fc ${df2(r.crit.fc, 0)} ksc, ${r.crit.main.grade}/${r.crit.stir.grade}, หุ้ม ${c.cov} ซม.)` };
    n++;
  });
  let ns = 0; m.design.slabs = m.design.slabs || {}; D.appliedSlabs = D.appliedSlabs || {};
  (slabs || []).forEach(sl => {
    const o = S.dsgSlab[sl.id]; if (!o || !o.rebar) return; if (!o.ok) { skip++; return; }
    m.design.slabs[sl.id] = D.appliedSlabs[sl.id] = { method: 'WSD', rebar: o.rebar, pass: !!o.ok, governing: o.label, status: 'computed',
      src: `UD Total Station v${UD_VERSION.v} ออกแบบพื้น WSD (fc ${df2(o.crit.fc, 0)} ksc, ${o.crit.main.grade}, หุ้ม ${c.slabCov} ซม.)` };
    ns++;
  });
  let nc = 0, nf = 0; D.appliedSup = D.appliedSup || {}; m.design.supports = m.design.supports || {};
  (cols || []).forEach(x => {
    const o = S.dsgCol[x.id]; if (!o || !o.rebar) return; if (!o.ok) { skip++; return; }
    m.design.members[x.id] = D.applied[x.id] = { method: 'WSD', rebar: o.rebar, pass: !!o.ok, ratio: Math.round((o.r.ratio || 0) * 1000) / 1000, governing: o.label, status: 'computed',
      src: `UD Total Station v${UD_VERSION.v} ออกแบบเสา WSD (${o.crit.main.grade}, หุ้ม ${c.colCov} ซม.)` };
    nc++;
  });
  (foots || []).forEach(x => {
    const o = S.dsgFoot[x.id]; if (!o || !o.rebar) return; if (!o.ok) { skip++; return; }
    m.design.supports[x.id] = D.appliedSup[x.id] = { method: 'WSD', rebar: o.rebar, pass: !!o.ok, governing: o.label, status: 'computed',
      src: `UD Total Station v${UD_VERSION.v} ออกแบบฐานแผ่ WSD (qa ${df2(c.qa, 0)} กก./ตร.ม., ${o.crit.main.grade}, หุ้ม ${c.ftCov} ซม.)` };
    nf++;
  });
  let np = 0; D.appliedPlates = D.appliedPlates || {}; m.design.plates = m.design.plates || {};
  (plates || []).forEach(x => {
    const o = S.dsgPlate[x.id]; if (!o || !o.d) return; if (!o.ok) { skip++; return; }
    m.design.plates[x.id] = D.appliedPlates[x.id] = { method: 'WSD', node: x.node, plate: [o.d.B, o.d.L, o.d.t], bolts: [o.d.nb * 2, o.d.dBolt, o.d.La], pass: true, status: 'computed',
      src: `UD Total Station v${UD_VERSION.v} เพลทหัวเสา (Neo Column Base Plate)` };
    np++;
  });
  if (!n && !ns && !nc && !nf && !np) return toast(skip ? `ยังไม่มีชิ้นที่ผ่าน (ไม่ผ่าน ${skip} ชิ้น — แก้ขนาดก่อน)` : 'ยังไม่มีชิ้นที่ออกแบบได้ — กรอกแรง/น้ำหนักบรรทุกก่อน');
  autosave();
  dsgRequantify().then(msg => toast(`เขียนเหล็กเสริม คาน ${n} · พื้น ${ns} · เสา ${nc} · ฐานราก ${nf} · เพลท ${np} ลงโมเดลแล้ว${skip ? ` · ข้ามชิ้นที่ไม่ผ่าน ${skip} ชิ้น` : ''} · ${msg}`));
}
/** ถอดปริมาณเหล็กเสริมใหม่ในเว็บ (lib/rebartk.js วิธีเดียวกับ takeoff.py) แล้วอัปเดต 3D / ปร.1 / แผนงาน */
async function dsgRequantify() {
  const m = S.model, q = m.quantities; let msg;
  if (q && Array.isArray(q.items)) {
    const wasStale = !!q.stale, r = RebarTk.apply(m, `UD Total Station v${UD_VERSION.v}`);
    if (r.ok) {
      try { q.design_hash = await RebarTk.designHash(m); } catch (e) { q.design_hash = ''; }
      q.stale = wasStale;
      msg = `ถอดเหล็กเสริมใหม่ ${r.rows.length} รายการใน ปร.1 แล้ว` + (wasStale ? ' (ปริมาณส่วนอื่นยังเก่า — รัน takeoff.py)' : '');
    } else msg = r.error;
  } else msg = 'โมเดลยังไม่มีปริมาณ — รัน tools/takeoff.py --write';
  if (S.viewer) buildLayers(S.viewer.load(m)); else if (typeof renderClash === 'function') renderClash();
  renderAll();
  return msg;
}
/** เปิดโมเดลซ้ำ: ใส่ผลออกแบบที่เคยเขียน (เก็บในงาน BOQ ของเบราว์เซอร์นี้) กลับเข้าโมเดล */
function dsgOnLoad() {
  const A = (S.boq.dsg || {}).applied || {}; if (!S.model || !S.boq.dsg) return false;
  const m = S.model, ids = new Set((m.members || []).map(x => x.id)); m.design = m.design || {}; m.design.members = m.design.members || {};
  let n = 0;
  for (const [id, e] of Object.entries(A)) {
    if (!ids.has(id)) { delete A[id]; continue; }
    if (JSON.stringify((m.design.members[id] || {}).rebar) !== JSON.stringify(e.rebar)) { m.design.members[id] = e; n++; }
  }
  const AS = (S.boq.dsg || {}).appliedSlabs || {}, sids = new Set((m.slabs || []).map(x => x.id)); m.design.slabs = m.design.slabs || {};
  for (const [id, e] of Object.entries(AS)) {
    if (!sids.has(id)) { delete AS[id]; continue; }
    if (JSON.stringify((m.design.slabs[id] || {}).rebar) !== JSON.stringify(e.rebar)) { m.design.slabs[id] = e; n++; }
  }
  const AF = (S.boq.dsg || {}).appliedSup || {}, fids = new Set((m.supports || []).map(x => x.id)); m.design.supports = m.design.supports || {};
  for (const [id, e] of Object.entries(AF)) {
    if (!fids.has(id)) { delete AF[id]; continue; }
    if (JSON.stringify((m.design.supports[id] || {}).rebar) !== JSON.stringify(e.rebar)) { m.design.supports[id] = e; n++; }
  }
  const AP = (S.boq.dsg || {}).appliedPlates || {}; m.design.plates = m.design.plates || {};
  for (const [id, e] of Object.entries(AP)) { if (JSON.stringify(m.design.plates[id]) !== JSON.stringify(e)) { m.design.plates[id] = e; n++; } }
  if (n) dsgRequantify().then(msg => toast(`ใส่ผลออกแบบ ${n} ชิ้นที่เคยเขียนไว้กลับเข้าโมเดล · ${msg}`));
  return n > 0;
}
function dsgPrint(beams, slabs, cols, foots, plates) {
  const D = dsg(), sel = D.sel || '';
  const bl = sel ? beams.filter(b => b.id === sel) : beams.filter(b => S.dsgOut[b.id] && S.dsgOut[b.id].rebar);
  const sl = sel ? slabs.filter(x => 'slab:' + x.id === sel && S.dsgSlab[x.id] && S.dsgSlab[x.id].r) : slabs.filter(x => S.dsgSlab[x.id] && S.dsgSlab[x.id].r);
  const cl = sel ? cols.filter(x => 'col:' + x.id === sel && S.dsgCol[x.id].r) : cols.filter(x => S.dsgCol[x.id] && S.dsgCol[x.id].r);
  const fl = sel ? foots.filter(x => 'ft:' + x.id === sel && S.dsgFoot[x.id].r) : foots.filter(x => S.dsgFoot[x.id] && S.dsgFoot[x.id].r);
  const pl = sel ? plates.filter(x => 'pl:' + x.id === sel && S.dsgPlate[x.id].r) : plates.filter(x => S.dsgPlate[x.id] && S.dsgPlate[x.id].r);
  if (!bl.length && !sl.length && !cl.length && !fl.length && !pl.length) return toast('ยังไม่มีรายการคำนวณ');
  $('#dsg-printout').innerHTML = bl.map(b => beamReport(b, S.dsgOut[b.id])).join('') + sl.map(x => slabReport(x, S.dsgSlab[x.id])).join('')
    + cl.map(x => colReport(x, S.dsgCol[x.id])).join('') + fl.map(x => footReport(x, S.dsgFoot[x.id])).join('') + pl.map(x => plateReport(x, S.dsgPlate[x.id])).join('');
  document.body.classList.add('print-dsg');
  setTimeout(() => { window.print(); document.body.classList.remove('print-dsg'); }, 300);
}

// ------------------------------------------------------------------ รายการคำนวณ (หน้าตาตามชีต Beam)
function secSvg(r, title) {
  if (!r) return '';
  const p = r.input, W = 150, sc = W / (p.b * 100), H = p.h * 100 * sc, pad = 14, cov = p.cov * sc, ds = (p.stir.d / 10) * sc;
  const dots = [];
  const side = (bars, fromTop) => {
    [1, 2, 3].forEach(ly => {
      const L = bars.filter(x => x.layer === ly && x.n > 0); const n = L.reduce((a, x) => a + x.n, 0); if (!n) return;
      const y = fromTop ? L[0].y * sc : H - L[0].y * sc, x0 = cov + ds + (L[0].d / 20) * sc, x1 = W - x0;
      let i = 0; L.forEach(x => { for (let k = 0; k < x.n; k++, i++) { const xx = n === 1 ? W / 2 : x0 + (x1 - x0) * i / (n - 1); dots.push(`<circle cx="${(pad + xx).toFixed(1)}" cy="${(pad + y).toFixed(1)}" r="${Math.max(2.2, x.d / 20 * sc).toFixed(1)}" class="${x.kind === 'sp' ? 'sp' : ''}"/>`); } });
    });
  };
  const cant = +p.type === 4, tensTop = title.includes('ฐานรองรับ') || cant;
  side(r.bars.tens, tensTop); side(r.bars.comp, !tensTop);
  return `<figure class="dsg-sec"><svg viewBox="0 0 ${W + pad * 2} ${H + pad * 2 + 4}" width="${W + pad * 2}"><rect x="${pad}" y="${pad}" width="${W}" height="${H}" class="con"/><rect x="${pad + cov}" y="${pad + cov}" width="${W - 2 * cov}" height="${H - 2 * cov}" rx="3" class="stp"/>${dots.join('')}</svg><figcaption>${esc(title)}</figcaption></figure>`;
}
function beamReport(bm, d) {
  if (!bm || !d) return '';
  const C = d.crit, g = d.g, f = d.inp.f, fy = C.fy, pj = S.boq.project || {};
  const row = (a, eq, v, u = '', tag = '') => `<tr><td>${a}</td><td class="eq">${eq}</td><td class="r">${v}</td><td>${u}</td><td>${tag}</td></tr>`;
  const flexPart = (r, title, M) => {
    if (!r) return '';
    const tL = r.input.tens.map(l => RcWsd.layerText(l, fy)).filter(Boolean).join(' / ') || '-', cL = r.input.comp.map(l => RcWsd.layerText(l, fy)).filter(Boolean).join(' / ') || '-';
    const ck = k => (r.checks.find(x => x.code === k) || {}).ok;
    return `<h4>${title} — M = ${df2(M, 0)} กก.-ม.</h4><table class="dsg-calc">
      ${row("d'", 'ระยะถึงศูนย์กลางเหล็กรับแรงอัด', df2(r.dp), 'ซม.')}${row('d', 'h − ระยะถึงศูนย์กลางเหล็กรับแรงดึง', df2(r.d), 'ซม.')}
      ${row(r.narrow ? "Mc'" : 'Mc', (r.narrow ? `(1.75 − L/b/40)·` : '') + `R·b·d² = ${df2(C.main.R, 3)} × ${df2(g.b)} × ${df2(r.d)}²`, df2(r.Mc, 2), 'กก.-ม.', r.singly ? '> M → เสริมเหล็กรับแรงดึงอย่างเดียว' : '< M → เสริมเหล็กรับแรงอัด')}
      ${r.singly ? row('As', `M / (fs·j·d) = ${df2(M, 0)}×100 / (${df2(C.main.fs, 0)} × ${df2(C.main.j, 4)} × ${df2(r.d)})`, df2(r.As, 3), 'ตร.ซม.')
        : row('M1, M2', 'M1 = Mc · M2 = M − Mc', `${df2(r.M1)} / ${df2(r.M2)}`, 'กก.-ม.') + row("fs'", "2fs(k − d'/d)/(1 − k) ≤ fs", df2(r.fsp, 2), 'ksc') +
          row('As', `M1/(fs·j·d) + M2/(fs·(d − d'))`, `${df2(r.As1, 3)} + ${df2(r.As2, 3)} = ${df2(r.As, 3)}`, 'ตร.ซม.') + row("As'", "M2/(fs'·(d − d'))", df2(r.Asc, 3), 'ตร.ซม.', r.flex === 'fail' ? okTag(false) + " As' > As ขยายหน้าตัด" : r.flex === 'steel' ? 'As − As\' < 0.25 → คิดแบบ Steel beam' : '')}
      ${row('As min', `14/fy·b·d = 14/${fy} × ${df2(g.b * 100, 0)} × ${df2(r.d)}`, df2(r.Asmin, 3), 'ตร.ซม.')}
      ${row('ต้องการ', `ดึง As + 2Ast · อัด As' + 2Ast`, `${df2(r.reqT, 3)} / ${df2(r.reqC, 3)}`, 'ตร.ซม.')}
      ${row('ใส่ด้านดึง', esc(tL), df2(r.AsProv, 2), 'ตร.ซม.', okTag(ck('ast') && ck('asmin')))}
      ${row('ใส่ด้านอัด', esc(cL), df2(r.AscProv, 2), 'ตร.ซม.', okTag(ck('asc')))}
      ${r.spacing.map(s => row(`ช่องว่าง ${s.side === 'tens' ? 'ดึง' : 'อัด'} ชั้น ${s.layer}`, `≥ ${df2(s.need, 1)} ซม.`, df2(s.s, 2), 'ซม.', okTag(s.s >= s.need - 1e-9))).join('')}
    </table>`;
  };
  const r = d.sup || d.mid, sh = d.sup;
  const hm = r.checks.find(x => x.code === 'hmin'), dp = r.checks.find(x => x.code === 'deep');
  const div = { 1: 16, 2: 18.5, 3: 21, 4: 8 }[d.inp.type];
  return `<div class="card dsg-rep">
    <div class="dsg-head"><b>Beams Design (WSD)</b> · ${esc(pj.name || S.model.meta.name || '')}<br>คาน <b>${esc(bm.mark)}</b> (${esc(bm.id)}) ${bm.level ? 'ชั้น ' + esc(bm.level) : ''} · ${RcWsd.BEAM_TYPES_TH[d.inp.type]} (${RcWsd.BEAM_TYPES[d.inp.type]}) · แรงจาก${esc(d.inp.src || '-')}</div>
    <h4>1. ข้อมูล</h4><table class="dsg-calc">
      ${row("f'c", '', df2(C.fcp, 0), 'ksc')}${row('fc', `${C.F} f'c${C.capped ? ' ≤ 65 (ประกาศ มท. 2567)' : ''}`, df2(C.fc, 2), 'ksc')}
      ${row('fy / fs', C.main.grade, `${df2(fy, 0)} / ${df2(C.main.fs, 0)}`, 'ksc')}${row('fys / fsv', C.stir.grade, `${df2(C.fyv, 0)} / ${df2(C.stir.fs, 0)}`, 'ksc')}
      ${row('Ec', "(2.323^1.5)·4270·√f'c", df2(C.Ec, 0), 'ksc')}${row('n, k, j, R', 'Es/Ec · 1/(1+fs/(n·fc)) · 1−k/3 · ½fc·k·j', `${df2(C.n, 3)} · ${df2(C.main.k, 4)} · ${df2(C.main.j, 4)} · ${df2(C.main.R, 3)}`, '', okTag(C.nOk))}
      ${row('b × h × L', '', `${df2(g.b)} × ${df2(g.h)} × ${df2(g.L)}`, 'ม.')}${row('ระยะหุ้ม', '', df2(g.cov, 1), 'ซม.')}
      ${row('M+ / M− / V / T', '', `${df2(f.Mpos, 0)} / ${df2(f.Mneg, 0)} / ${df2(f.V, 0)} / ${df2(f.T, 0)}`, 'กก.-ม., กก.')}
    </table>
    <h4>2. ตรวจขนาดหน้าตัด</h4><table class="dsg-calc">
      ${row('h min', fy >= 4000 ? `L/${div}` : `L/${div}·(0.4 + fy/7000)`, df2(hm.lim, 3), 'ม.', `≤ ${df2(g.h)} ${okTag(hm.ok)}`)}
      ${row('คานลึก', 'h/L', df2(dp.val, 2), '', `≤ ${dp.lim} ${okTag(dp.ok)}`)}
      ${row('คานแคบ', 'L/b', df2(r.Lb, 2), '', r.narrow ? '> 30 ลดกำลังโมเมนต์' : '≤ 30 [Ok.]')}
    </table>
    ${d.mid ? flexPart(d.mid, '3. หน้าตัดกลางช่วง (เหล็กล่างรับแรงดึง)', f.Mpos) : ''}
    ${flexPart(sh, `${d.mid ? 4 : 3}. หน้าตัดที่ฐานรองรับ (เหล็กบนรับแรงดึง)`, f.Mneg)}
    <h4>${d.mid ? 5 : 4}. แรงเฉือนและแรงบิด</h4><table class="dsg-calc">
      ${row('Vc', `0.29·√f'c·b·d`, df2(sh.Vc, 0), 'กก.')}${row("V'", 'V − Vc', df2(sh.Vp, 0), 'กก.', `≤ Vc2 = 1.32√f'c·bd = ${df2(sh.Vc2, 0)} ${okTag(sh.Vp <= sh.Vc2)}`)}
      ${row('Av/s', (sh.narrow || sh.flex === 'steel' ? 'V' : "V'") + '/(fsv·d)', df2(sh.Av_s, 5), 'ตร.ซม./ซม.')}
      ${row('vt', '3.5·T/(h·b²)', df2(sh.vt, 3), 'ksc', `≤ 1.32√f'c = ${df2(sh.vc1, 2)} ${okTag(sh.vt <= sh.vc1)}`)}
      ${row('v', 'vt + V/(b·h)', df2(sh.v, 3), 'ksc', `≤ 1.65√f'c = ${df2(sh.vc2, 2)} ${okTag(sh.v <= sh.vc2)}`)}
      ${row('At/s', 'T/(Ac·fsv) · Ac = x1·y1 = ' + df2(sh.Ac, 2), df2(sh.At_s, 5), 'ตร.ซม./ซม.')}${row('Ast', 'เหล็กยืนรับแรงบิดต่อมุม', df2(sh.Ast, 4), 'ตร.ซม.')}
      ${row('s max', sh.zone === 0 ? "ไม่ต้องคำนวณปลอก → d/2 ≤ 0.60 ม." : sh.zone === 3 ? "V' > Vc1 → d/4 ≤ 0.30 ม." : 'Av/(Av/s + At/s) ≤ d/2', df2(sh.smax, 3), 'ม.')}
      ${row('Av min', '0.0015·b·s', df2(sh.Avmin, 3), 'ตร.ซม.', `Av = ${df2(sh.Avprov, 2)} ${okTag((sh.checks.find(x => x.code === 'avmin') || {}).ok)}`)}
      ${row('ปลอก', `${d.stir.sets > 1 ? d.stir.sets + ' ชุด ' : ''}RB ${d.stir.d} @ ${d.stir.s} ม.`, '', '', okTag((sh.checks.find(x => x.code === 's') || {}).ok))}
    </table>
    <h4>สรุป ${okTag(d.ok)}</h4><p class="dsg-sum">${esc(rbText(d.rebar, fy))}</p>
    <div class="dsg-secs">${d.mid ? secSvg(d.mid, 'กลางช่วง') : ''}${secSvg(d.sup, 'ที่ฐานรองรับ')}</div>
    ${d.error ? `<p class="d-ng">${esc(d.error)}</p>` : ''}${C.note ? `<p class="d-note">${esc(C.note)}</p>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ พื้น (ชีต Two-way / One-way / Cantilever slaps)
const SLAB_TYPES = [['two:1', 'สองทาง · ต่อเนื่อง 4 ด้าน'], ['two:2', 'สองทาง · ไม่ต่อเนื่อง 1 ด้าน'], ['two:3', 'สองทาง · ไม่ต่อเนื่อง 2 ด้าน'], ['two:4', 'สองทาง · ไม่ต่อเนื่อง 3 ด้าน'], ['two:5', 'สองทาง · ไม่ต่อเนื่อง 4 ด้าน'],
  ['one:1', 'ทางเดียว · ช่วงเดียว'], ['one:2', 'ทางเดียว · ต่อเนื่องปลายเดียว'], ['one:3', 'ทางเดียว · ต่อเนื่องสองปลาย'], ['cant', 'พื้นยื่น']];
const slabTypeTh = t => (SLAB_TYPES.find(x => x[0] === t) || [, t])[1];
/** พื้นในโมเดล + ช่วงสั้น/ยาว + ด้านที่ต่อเนื่อง (มีพื้นหล่อในที่ระดับเดียวกันชิดขอบ) + น้ำหนักบรรทุกจาก area_loads */
function dsgSlabList() {
  const m = S.model; if (!m) return [];
  const ms = m.materials || [], L = m.loads || {}, pats = Object.fromEntries((L.patterns || []).map(p => [p.id, p.kind]));
  const bb = s => { const xs = s.polygon.map(p => p[0]), ys = s.polygon.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0), near = (a, b) => Math.abs(a - b) < 0.02;
  const all = m.slabs || [];
  return all.map(s => {
    const b = bb(s), Lx = b.x1 - b.x0, Ly = b.y1 - b.y0, shortX = Lx <= Ly;
    const mt = ms.find(y => y.id === s.material && y.kind === 'concrete') || ms.find(y => y.kind === 'concrete') || {};
    const oth = all.filter(o => o !== s && o.kind === 'cast' && Math.abs(o.top - s.top) <= 0.02).map(bb);
    const cont = { x0: oth.some(o => near(o.x1, b.x0) && ov(o.y0, o.y1, b.y0, b.y1) > 0.1), x1: oth.some(o => near(o.x0, b.x1) && ov(o.y0, o.y1, b.y0, b.y1) > 0.1),
      y0: oth.some(o => near(o.y1, b.y0) && ov(o.x0, o.x1, b.x0, b.x1) > 0.1), y1: oth.some(o => near(o.y0, b.y1) && ov(o.x0, o.x1, b.x0, b.x1) > 0.1) };
    const S0 = Math.min(Lx, Ly), L0 = Math.max(Lx, Ly), nCont = Object.values(cont).filter(Boolean).length;
    const ends = (shortX ? [cont.x0, cont.x1] : [cont.y0, cont.y1]).filter(Boolean).length;
    const auto = S0 / L0 < 0.5 ? 'one:' + (ends === 2 ? 3 : ends === 1 ? 2 : 1) : 'two:' + (5 - nCont);
    let sdl = null, ll = null;
    (L.area_loads || []).filter(a => (a.targets || []).includes(s.id)).forEach(a => {
      const k = pats[a.pattern];
      if (k === 'live' || k === 'roof_live') ll = (ll || 0) + (+a.value || 0); else if (k && k !== 'wind' && k !== 'dead') sdl = (sdl || 0) + (+a.value || 0);
    });
    const rect = s.polygon.length === 4 && Math.abs(Lx * Ly - Math.abs(s.polygon.reduce((a, p, i) => { const q = s.polygon[(i + 1) % 4]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2) < 0.01;
    return { id: s.id, mark: s.mark || '', kind: s.kind, level: s.level || '', t: +s.t, Lx, Ly, S: S0, L: L0, shortX, auto, cont, rect, unitW: +mt.unit_weight || 2400, fcp: +mt.fc || 240, sdl, ll, use: s.use || '' };
  });
}
function dsgSlabInput(sl) {
  const u = dsg().slabs[sl.id] || {}, has = k => u[k] !== undefined && u[k] !== '';
  const type = u.type || sl.auto;
  return { type, SDL: has('SDL') ? +u.SDL : sl.sdl, LL: has('LL') ? +u.LL : sl.ll, P: has('P') ? +u.P : 0, a: has('a') ? +u.a : 0, Lc: has('Lc') ? +u.Lc : sl.S,
    src: (has('SDL') || has('LL')) ? 'กรอกเอง' : (sl.sdl !== null || sl.ll !== null) ? 'จากโมเดล' : '' };
}
function dsgSlabRun(sl) {
  if (sl.kind !== 'cast') return { skip: sl.kind === 'ground' ? 'พื้นวางบนดิน — ออกแบบในชุดถัดไป (จากไฟล์ Neo)' : 'พื้นสำเร็จรูป — ใช้ตามผู้ผลิต' };
  const c = dsg().crit, inp = dsgSlabInput(sl);
  if (inp.LL === null || inp.LL === undefined) return { need: 'ใส่น้ำหนักบรรทุกจร (LL)', inp };
  const crit = RcWsd.criteria({ fcp: sl.fcp, F: +c.F, mode: +c.mode, fy: +c.slabFy, fyv: +c.fyv });
  const [kind, cs] = inp.type.split(':');
  const base = { t: sl.t, cov: +c.slabCov, unitW: sl.unitW, SDL: inp.SDL || 0, LL: inp.LL };
  const p = kind === 'two' ? Object.assign(base, { S: sl.S, L: sl.L, case: +cs }) : kind === 'one' ? Object.assign(base, { L: sl.S, type: +cs }) : Object.assign(base, { L: inp.Lc, P: inp.P, a: inp.a });
  const d = RcWsd.slabDesign(kind, p, crit, (c.slabDias || []).map(Number));
  const main = [d.dm, d.sA], sec = [d.dt, d.sB];   // main = เหล็กวางตามช่วงสั้น (หรือแนวยื่น)
  const rebar = { mesh_xy: sl.shortX ? { x: main, y: sec } : { x: sec, y: main } };
  return { r: d.r, ok: d.ok, error: d.error || '', d, crit, inp, kind, p, rebar, label: slabTypeTh(inp.type) };
}
const slabRbText = (o, fy) => {
  if (!o || !o.d) return '';
  const n = d => RcWsd.barName(d, fy);
  return o.kind === 'two' ? `ช่วงสั้น ${n(o.d.dm)} @${o.d.sA} · ช่วงยาว ${n(o.d.dt)} @${o.d.sB}` : `เหล็กหลัก ${n(o.d.dm)} @${o.d.sA} · กันร้าว ${n(o.d.dt)} @${o.d.sB}`;
};
function slabCard(slabs) {
  const D = dsg(), c = D.crit, opt = (v, cur, t) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`;
  const dsn = slabs.filter(x => S.dsgSlab[x.id] && S.dsgSlab[x.id].r), pass = dsn.filter(x => S.dsgSlab[x.id].ok).length;
  return `<div class="card"><h2>พื้น คสล. <span class="hint">${dsn.length}/${slabs.length} แผ่นออกแบบได้ · ผ่าน ${pass}</span></h2>
    <p class="hint">น้ำหนักบรรทุกคงที่เพิ่ม (SDL) และจร (LL) ดึงจาก area_loads ของโมเดล ถ้าไม่มีให้กรอก · ประเภทเดาจาก S/L และพื้นข้างเคียงที่ชิดขอบ แก้ได้ · น้ำหนักพื้นคิดจากความหนา × หน่วยน้ำหนักวัสดุ</p>
    ${slabs.length ? `<div class="table-wrap"><table class="boq dsg-tab"><tr><th>พื้น</th><th>S×L (ม.)</th><th>t (ม.)</th><th>ประเภท</th><th>SDL กก./ตร.ม.</th><th>LL กก./ตร.ม.</th><th>เหล็กเสริม</th><th></th></tr>
    ${slabs.map(sl => {
      const o = S.dsgSlab[sl.id], u = D.slabs[sl.id] || {}, inp = dsgSlabInput(sl), cast = sl.kind === 'cast';
      const cell = (k, v) => `<input class="price${u[k] !== undefined && u[k] !== '' ? ' ov' : ''}" data-sf="${k}" inputmode="decimal" value="${u[k] !== undefined && u[k] !== '' ? esc(u[k]) : (v === null || v === undefined ? '' : esc(v))}" placeholder="-">`;
      return `<tr class="row ${D.sel === 'slab:' + sl.id ? 'sel' : ''}" data-sl="${esc(sl.id)}"><td class="c-name"><b>${esc(sl.mark)}</b> <span class="hint">${esc(sl.id)}</span>${sl.use ? `<span class="src">${esc(sl.use)}</span>` : ''}${sl.rect ? '' : '<span class="warnline">ไม่ใช่สี่เหลี่ยมผืนผ้า — ใช้กรอบนอก</span>'}</td>
        <td class="r" data-l="S×L (ม.)">${df2(sl.S)}×${df2(sl.L)}</td><td class="r" data-l="t (ม.)">${df2(sl.t)}</td>
        <td data-l="ประเภท">${cast ? `<select data-sf="type">${SLAB_TYPES.map(([v, t]) => opt(v, inp.type, t + (v === sl.auto ? ' *' : ''))).join('')}</select>${inp.type === 'cant' ? `<div class="dsg-cant">ยื่น ${cell('Lc', df2(inp.Lc))} ม. · P ${cell('P', 0)} กก./ม. ที่ ${cell('a', 0)} ม.</div>` : ''}` : `<span class="hint">${sl.kind === 'ground' ? 'วางบนดิน' : 'สำเร็จรูป'}</span>`}</td>
        <td data-l="SDL กก./ตร.ม.">${cast ? cell('SDL', sl.sdl) : ''}</td><td data-l="LL กก./ตร.ม.">${cast ? cell('LL', sl.ll) : ''}</td>
        <td class="dsg-rb">${o.r ? esc(slabRbText(o, +c.slabFy)) + (o.error ? `<span class="warnline">${esc(o.error)}</span>` : '') : `<span class="hint">${esc(o.skip || o.need || '')}</span>`}</td>
        <td>${o.r ? (o.ok ? '<span class="pill ok">ผ่าน</span>' : '<span class="pill err">ไม่ผ่าน</span>') : ''}</td></tr>`;
    }).join('')}</table></div>` : '<p class="hint">ไม่มีพื้นในโมเดล</p>'}
    <p class="hint">* = ประเภทที่ระบบเดา · เหล็กพื้นเขียนลงโมเดลเป็นเหล็กสองแนว (ช่วงสั้น/ยาว หรือ หลัก/กันร้าว) ใช้ถอดปริมาณ</p>
  </div>`;
}
function slabReport(sl, o) {
  if (!sl || !o || !o.r) return '';
  const r = o.r, C = o.crit, p = o.p, fy = C.fy, pj = S.boq.project || {}, bn = d => RcWsd.barName(d, fy);
  const row = (a, eq, v, u = '', tag = '') => `<tr><td>${a}</td><td class="eq">${eq}</td><td class="r">${v}</td><td>${u}</td><td>${tag}</td></tr>`;
  const ck = k => (r.checks.find(x => x.code === k) || {}).ok;
  const head = `<div class="dsg-head"><b>${o.kind === 'two' ? 'Two-way slabs' : o.kind === 'one' ? 'One-way slabs' : 'Cantilever slabs'} Design (WSD)</b> · ${esc(pj.name || S.model.meta.name || '')}<br>พื้น <b>${esc(sl.mark)}</b> (${esc(sl.id)}) ${sl.level ? 'ชั้น ' + esc(sl.level) : ''} · ${esc(o.label)} · น้ำหนักบรรทุกจาก${esc(o.inp.src || '-')}</div>`;
  const data = `<h4>1. ข้อมูล</h4><table class="dsg-calc">
    ${row("f'c / fc", `fc = ${C.F} f'c${C.capped ? ' ≤ 65' : ''}`, `${df2(C.fcp, 0)} / ${df2(C.fc, 2)}`, 'ksc')}${row('fy / fs', C.main.grade, `${df2(fy, 0)} / ${df2(C.main.fs, 0)}`, 'ksc')}
    ${row('n, k, j, R', '', `${df2(C.n, 3)} · ${df2(C.main.k, 4)} · ${df2(C.main.j, 4)} · ${df2(C.main.R, 3)}`, '', okTag(C.nOk))}
    ${row('ความหนา', '', df2(p.t, 2), 'ม.')}${row('ระยะหุ้ม', '', df2(p.cov, 1), 'ซม.')}
    ${row('น้ำหนักพื้น', `${df2(p.unitW, 0)} × ${df2(p.t, 2)}`, df2(r.self, 0), 'กก./ตร.ม.')}${row('w', 'น้ำหนักพื้น + SDL + LL', `${df2(r.self, 0)} + ${df2(p.SDL, 0)} + ${df2(p.LL, 0)} = ${df2(r.w, 0)}`, 'กก./ตร.ม.')}
  </table>`;
  let body;
  if (o.kind === 'two') {
    const lab = { Sc: 'M− ต่อเนื่อง', Sd: 'M− ไม่ต่อเนื่อง', Sm: 'M+ กลางช่วง', Lc: 'M− ต่อเนื่อง', Ld: 'M− ไม่ต่อเนื่อง', Lm: 'M+ กลางช่วง' };
    const mrow = (k, dir) => row(lab[k], `C = ${df2(r.C[k], 4)} · C·w·S²`, df2(r.M[k], 2), 'กก.-ม./ม.', r.s[k] === null ? '' : `As ${df2(r.As[k], 3)} → s ${df2(r.s[k], 2)} ม.`);
    body = `<h4>2. ตรวจความหนา</h4><table class="dsg-calc">
      ${row('S, L, m', 'm = S/L (ไม่น้อยกว่า 0.50)', `${df2(p.S)} · ${df2(p.L)} · ${df2(r.m, 2)}`, 'ม.')}
      ${row('t min', '≥ 8 ซม. และ ≥ เส้นรอบรูป/180', df2(r.hmin, 3), 'ม.', `≤ ${df2(p.t)} ${okTag(ck('hmin'))}`)}
      ${row('d ช่วงสั้น / ยาว', 't − หุ้ม − ½D · t − หุ้ม − Dสั้น − ½Dยาว', `${df2(r.d)} / ${df2(r.dL)}`, 'ซม.')}
      ${row('d ต้องการ', '√(M max / R)', df2(r.dreq, 2), 'ซม.', okTag(ck('dreq')))}
    </table>
    <h4>3. โมเมนต์ (ตารางสัมประสิทธิ์ ว.ส.ท. · ${esc(o.label)})</h4><table class="dsg-calc">
      <tr><td colspan="5"><b>ช่วงสั้น S = ${df2(p.S)} ม.</b></td></tr>${mrow('Sc')}${mrow('Sd')}${mrow('Sm')}
      ${row('Mc ช่วงสั้น', 'R·b·d²', df2(r.McS, 2), 'กก.-ม./ม.', okTag(ck('mcS')))}
      <tr><td colspan="5"><b>ช่วงยาว L = ${df2(p.L)} ม.</b></td></tr>${mrow('Lc')}${mrow('Ld')}${mrow('Lm')}
      ${row('Mc ช่วงยาว', 'R·b·d²', df2(r.McL, 2), 'กก.-ม./ม.', okTag(ck('mcL')))}
    </table>
    <h4>4. เหล็กเสริม</h4><table class="dsg-calc">
      ${row('As min', `ρ·b·t (ρ = ${RcWsd.rhoTemp(fy)})`, df2(r.Asmin, 2), 'ตร.ซม./ม.')}
      ${row('ระยะช่วงสั้น', 'min(3t, ทุกโมเมนต์, As min, 0.45)', df2(r.sS, 2), 'ม.', `ใช้ ${bn(o.d.dm)} @${o.d.sA}`)}
      ${row('ระยะช่วงยาว', 'min(3t, ทุกโมเมนต์, As min, 0.45)', df2(r.sL, 2), 'ม.', `ใช้ ${bn(o.d.dt)} @${o.d.sB}`)}
      ${row('แรงลงคานช่วงสั้น', 'w·S/3', df2(r.RS, 2), 'กก./ม.')}${row('แรงลงคานช่วงยาว', 'w·S/3·(3 − m²)/2', df2(r.RL, 2), 'กก./ม.')}
    </table>`;
  } else {
    const one = o.kind === 'one';
    body = `<h4>2. โมเมนต์และแรงเฉือน</h4><table class="dsg-calc">
      ${one ? row('M', `w·L²/${{ 1: 8, 2: 9, 3: 10 }[p.type]}`, df2(r.M, 2), 'กก.-ม./ม.') : row('M', 'w·L²/2 + P·a', df2(r.M, 2), 'กก.-ม./ม.')}
      ${one ? row('V', `${p.type === 1 ? '' : '1.15·'}w·L/2 − w·d`, df2(r.V, 2), 'กก./ม.') : row('V', 'w·L + P', df2(r.V, 2), 'กก./ม.')}
      ${row('t min', one ? `L/${{ 1: 20, 2: 24, 3: 28 }[p.type]}${fy >= 4000 ? '' : '·(0.4 + fy/7000)'}` : `L/10${fy >= 4000 ? '' : '·(0.4 + fy/7000)'}`, df2(r.hmin, 3), 'ม.', `≤ ${df2(p.t)} ${okTag(ck('hmin'))}`)}
      ${row('d', 't − หุ้ม − ½D', df2(r.d, 2), 'ซม.')}${row('d ต้องการ', '√(M/R)', df2(r.dreq, 2), 'ซม.', okTag(ck('dreq')))}
      ${row('Vc', "0.29√f'c·b·d", df2(r.Vc, 0), 'กก./ม.', okTag(ck('vc')))}${row('Mc', 'R·b·d²', df2(r.Mc, 2), 'กก.-ม./ม.', okTag(ck('mc')))}
    </table>
    <h4>3. เหล็กเสริม</h4><table class="dsg-calc">
      ${row('As', 'M/(fs·j·d)', df2(r.As, 3), 'ตร.ซม./ม.')}${row('ระยะเหล็กหลัก', 'min(A/As, 3t, 0.45, As min)', df2(r.sMain, 2), 'ม.', `ใช้ ${bn(o.d.dm)} @${o.d.sA}`)}
      ${row('As min (กันร้าว)', `ρ·b·t (ρ = ${RcWsd.rhoTemp(fy)})`, df2(r.Asmin, 2), 'ตร.ซม./ม.')}${row('ระยะกันร้าว', 'min(A/As min, 5t, 0.45)', df2(r.sTemp, 2), 'ม.', `ใช้ ${bn(o.d.dt)} @${o.d.sB}`)}
      ${row('ยึดหน่วง U', 'V/(Σo·N·j·d)', df2(r.U, 2), 'ksc', `≤ ${df2(Math.min(r.Ua, r.Ucap), 2)} ${okTag(ck('bond'))}`)}
    </table>`;
  }
  return `<div class="card dsg-rep">${head}${data}${body}<h4>สรุป ${okTag(o.ok)}</h4><p class="dsg-sum">${esc(slabRbText(o, fy))}</p>${o.error ? `<p class="d-ng">${esc(o.error)}</p>` : ''}${r.warn ? `<p class="d-note">${esc(r.warn)}</p>` : ''}${C.note ? `<p class="d-note">${esc(C.note)}</p>` : ''}</div>`;
}

// ------------------------------------------------------------------ เสาปลอกเดี่ยว (ชีต Tied Columns)
/** เสา คสล. ในโมเดล + แรงจาก SAP + สัดส่วนสติฟเนสปลายบน/ล่าง (r' = ΣI/L เสา ÷ ΣI/L คาน) */
function dsgColList() {
  const m = S.model; if (!m) return [];
  const N = Object.fromEntries((m.nodes || []).map(n => [n.id, n])), sec = Object.fromEntries((m.sections || []).map(s => [s.id, s]));
  const all = m.members || [], res = (m.results && m.results.members) || {};
  const len = x => { const a = N[x.i], b = N[x.j]; return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); };
  const rAt = (nid, self) => {
    const at = all.filter(y => (y.i === nid || y.j === nid) && sec[y.section] && sec[y.section].kind === 'rc_rect');
    const ci = at.filter(y => y.type === 'column').reduce((a, y) => { const s = sec[y.section]; return a + (s.b * 100 * (s.h * 100) ** 3 / 12) / (len(y) * 100); }, 0);
    const bi = at.filter(y => y.type === 'beam' || y.type === 'tie_beam').reduce((a, y) => { const s = sec[y.section]; return a + (s.b * 100 * (s.h * 100) ** 3 / 12) / (len(y) * 100); }, 0);
    return bi > 0 ? ci / bi : null;
  };
  return all.filter(x => x.type === 'column' && sec[x.section] && sec[x.section].kind === 'rc_rect').map(x => {
    const s = sec[x.section], a = N[x.i], b = N[x.j], top = b.z >= a.z ? x.j : x.i, bot = top === x.j ? x.i : x.j, r = res[x.id];
    let sap = null;
    if (r) {
      const P = r.P || {}, M2 = r.M2 || {}, M3 = r.M3 || {}, mx = e => Math.max(Math.abs(+e.max || 0), Math.abs(+e.min || 0));
      sap = { P: (+P.min || 0) < 0 ? -(+P.min) : Math.abs(+P.max || 0), Mx: mx(M2), My: mx(M3), combo: [P.combo_min, M2.combo_max, M3.combo_max].filter(Boolean).filter((v, i, A) => A.indexOf(v) === i).join(', ') };
    }
    return { id: x.id, mark: x.mark || '', level: x.level || '', Bx: s.b * 100, By: s.h * 100, L: Math.abs(b.z - a.z), rT: rAt(top), rB: rAt(bot), sap, fcp: dsgFcp(x.id) };
  });
}
function dsgColInput(x) {
  const u = dsg().cols[x.id] || {}, has = k => u[k] !== undefined && u[k] !== '', sp = x.sap || {};
  const pick = k => has(k) ? +u[k] : (sp[k] !== undefined ? sp[k] : null);
  const f = { P: pick('P'), Mx: pick('Mx') || 0, My: pick('My') || 0 };
  const auto = f.Mx > 0 && f.My > 0 ? 1 : 2;
  return { f, case: +(u.case || auto), auto, src: ['P', 'Mx', 'My'].some(has) ? 'กรอกเอง' : x.sap ? 'SAP' : '' };
}
function dsgColRun(x) {
  const c = dsg().crit, inp = dsgColInput(x);
  if (!(inp.f.P > 0)) return { need: 'ใส่แรงอัด P', inp };
  if ([3, 4].includes(inp.case) && (x.rT === null && x.rB === null)) return { need: 'กรณีเซได้ต้องมีคานต่อที่ปลายเสา', inp };
  const crit = RcWsd.criteria({ fcp: x.fcp, F: +c.F, mode: +c.mode, fy: +c.fy, fyv: +c.fyv });
  const p = { L: x.L, Bx: x.Bx, By: x.By, cov: +c.colCov, P: inp.f.P, Mx: inp.f.Mx, My: inp.f.My, case: inp.case, rT: x.rT || 0, rB: x.rB || 0 };
  const d = RcWsd.columnDesign(p, crit, (c.colDias || []).map(Number));
  return { r: d.r, ok: d.ok, error: d.error || '', d, crit, inp, p, label: RcWsd.COL_CASE_TH[inp.case] + (d.r.slender ? ' · เสายาว' : ' · เสาสั้น'),
    rebar: { main: [d.nX + d.nY - 4, d.dMain], stirrup: [d.dTie, d.sTie] } };
}
function colCard(cols) {
  const D = dsg(), c = D.crit, opt = (v, cur, t) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`;
  const dn = cols.filter(x => S.dsgCol[x.id] && S.dsgCol[x.id].r), pass = dn.filter(x => S.dsgCol[x.id].ok).length;
  return `<div class="card"><h2>เสา คสล. <span class="hint">${dn.length}/${cols.length} ต้นออกแบบได้ · ผ่าน ${pass}</span></h2>
    <p class="hint">P แรงอัด · Mx ดัดรอบแกน x (ด้านลึก h) · My ดัดรอบแกน y — จาก SAP ใช้ค่ามากสุดของ M2/M3 (ไม่ใช่ชุดเดียวกับ P จึงเผื่อไว้) แก้ได้ · เสาที่ L/B > 15 คิดเป็นเสายาว · ขนาดเหล็กยืนใช้ชุดเดียวกับคาน (เลือกได้ ${(c.colDias || []).map(d => 'DB' + d).join(' ')})</p>
    ${cols.length ? `<div class="table-wrap"><table class="boq dsg-tab"><tr><th>เสา</th><th>b×h (ซม.)</th><th>L (ม.)</th><th>กรณี</th><th>P กก.</th><th>Mx กก.-ม.</th><th>My กก.-ม.</th><th>เหล็กเสริม</th><th></th></tr>
    ${cols.map(x => {
      const o = S.dsgCol[x.id], u = D.cols[x.id] || {}, inp = dsgColInput(x);
      const cell = k => `<input class="price${u[k] !== undefined && u[k] !== '' ? ' ov' : ''}" data-cf="${k}" inputmode="decimal" value="${u[k] !== undefined && u[k] !== '' ? esc(u[k]) : (x.sap ? df2(x.sap[k], 0).replace(/,/g, '') : '')}" placeholder="-">`;
      return `<tr class="row ${D.sel === 'col:' + x.id ? 'sel' : ''}" data-cl="${esc(x.id)}"><td class="c-name"><b>${esc(x.mark)}</b> <span class="hint">${esc(x.id)}</span>${inp.src ? `<span class="src">${inp.src}</span>` : ''}</td>
        <td class="r" data-l="b×h (ซม.)">${df2(x.Bx, 0)}×${df2(x.By, 0)}</td><td class="r" data-l="L (ม.)">${df2(x.L)}</td>
        <td data-l="กรณี"><select data-cf="case">${[1, 2, 3, 4, 5].map(k => opt(k, inp.case, RcWsd.COL_CASE_TH[k] + (k === inp.auto ? ' *' : ''))).join('')}</select></td>
        <td data-l="P กก.">${cell('P')}</td><td data-l="Mx กก.-ม.">${cell('Mx')}</td><td data-l="My กก.-ม.">${cell('My')}</td>
        <td class="dsg-rb">${o.r ? `${o.d.nX + o.d.nY - 4}-${RcWsd.barName(o.d.dMain, +c.fy)} · ปลอก RB ${o.d.dTie} @${o.d.sTie}` + (o.error ? `<span class="warnline">${esc(o.error)}</span>` : '') : `<span class="hint">${esc(o.need || '')}</span>`}</td>
        <td>${o.r ? (o.ok ? '<span class="pill ok">ผ่าน</span>' : '<span class="pill err">ไม่ผ่าน</span>') : ''}</td></tr>`;
    }).join('')}</table></div>` : '<p class="hint">ไม่มีเสา คสล. ในโมเดล</p>'}
    <p class="hint">* = กรณีที่ระบบเดา (ดัดสองแกนเมื่อมีทั้ง Mx และ My) · กรณีเซได้ใช้สัดส่วนสติฟเนสคาน/เสาจากโมเดล</p>
  </div>`;
}
function colReport(x, o) {
  if (!x || !o || !o.r) return '';
  const r = o.r, C = o.crit, p = o.p, fy = C.fy, pj = S.boq.project || {};
  const row = (a, eq, v, u = '', tag = '') => `<tr><td>${a}</td><td class="eq">${eq}</td><td class="r">${v}</td><td>${u}</td><td>${tag}</td></tr>`;
  const ck = k => (r.checks.find(c => c.code === k) || {}).ok;
  const zoneTh = { 1: 'กรณี I: e < ea (แรงอัดตามแกน)', 2: 'กรณี II: ea ≤ e ≤ eb (แรงอัดเป็นหลัก)', 3: 'กรณี III: e > eb (แรงดึงเป็นหลัก)' }[r.zone] || '-';
  const main = r.checks.find(c => ['pa', 'inter'].includes(c.code)) || {};
  return `<div class="card dsg-rep"><div class="dsg-head"><b>Tied Columns Design (WSD)</b> · ${esc(pj.name || S.model.meta.name || '')}<br>เสา <b>${esc(x.mark)}</b> (${esc(x.id)}) ${x.level ? 'ชั้น ' + esc(x.level) : ''} · ${esc(o.label)} · แรงจาก${esc(o.inp.src || '-')}</div>
    <h4>1. ข้อมูล</h4><table class="dsg-calc">
      ${row("f'c / fy", C.main.grade, `${df2(C.fcp, 0)} / ${df2(fy, 0)}`, 'ksc')}${row('fs', '0.4 fy', df2(r.fs, 0), 'ksc')}${row('n', 'Es/Ec', df2(C.n, 3), '', okTag(C.nOk))}
      ${row('Bx × By × L', '', `${df2(p.Bx, 0)} × ${df2(p.By, 0)} ซม. × ${df2(p.L)} ม.`, '')}${row('P / Mx / My', '', `${df2(p.P, 0)} / ${df2(p.Mx, 0)} / ${df2(p.My, 0)}`, 'กก., กก.-ม.')}
      ${row('L/B', 'L / ด้านแคบ', df2(r.LB, 1), '', r.slender ? '> 15 เสายาว' : '≤ 15 เสาสั้น')}
    </table>
    <h4>2. กำลังหน้าตัด</h4><table class="dsg-calc">
      ${row('เหล็กยืน', `${r.nbars}-${RcWsd.barName(o.d.dMain, fy)}`, df2(r.Ast, 2), 'ตร.ซม.', `ρ = ${df2(r.rho, 2)}% ${okTag(ck('rho'))}`)}
      ${row('Pa', "0.85·Ag·(0.25f'c + fs·ρg)", df2(r.Pa, 0), 'กก.')}${row('Fa / Fb', "0.34(1+ρg·m)f'c / 0.45f'c", `${df2(r.Fa, 2)} / ${df2(r.Fb, 2)}`, 'ksc')}
      ${row('Ix / Iy', 'b·h³/12 + (2n−1)·Ast·γ²/' + (o.d.nX === o.d.nY ? 6 : 4), `${df2(r.Ix, 0)} / ${df2(r.Iy, 0)}`, 'ซม.⁴')}
      ${row('e = My/P · Mx/P', '', `${df2(r.ex, 2)} · ${df2(r.ey, 2)}`, 'ซม.')}${row('ea / eb (แกนคุม)', '', `${df2(r.ex >= r.ey ? r.eax : r.eay, 2)} / ${df2(r.ex >= r.ey ? r.ebx : r.eby, 2)}`, 'ซม.')}
      ${r.slender ? row('R (เสายาว)', `klu/r = ${df2(r.klr, 1)} · r = 0.25·Bx`, df2(r.R, 3), '', r.R > 0 ? '' : okTag(false)) : ''}
      ${row(zoneTh, r.zone === 1 ? 'Pa ≥ P/R' : r.zone === 2 ? 'fa/Fa + fbx/Fb + fby/Fb' : 'Mx/Mox + My/Moy', r.zone === 1 ? `${df2(r.Pa, 0)} ≥ ${df2(r.Pd, 0)}` : df2(r.ratio, 3), r.zone === 1 ? 'กก.' : '≤ 1.00', okTag(main.ok))}
    </table>
    <h4>3. เหล็กปลอก</h4><table class="dsg-calc">
      ${row('ระยะ', 'min(16·Dยืน, 48·Dปลอก, ด้านแคบ)', df2(r.sTie, 1), 'ซม.', `ใช้ RB ${o.d.dTie} @${o.d.sTie}`)}
      ${r.gapX !== undefined ? row('ช่องว่างเหล็กยืน', '≥ max(1.5D, 4 ซม.)', df2(Math.min(r.gapX, r.gapY), 1), 'ซม.', okTag(ck('gap'))) : ''}
    </table>
    <h4>สรุป ${okTag(o.ok)}</h4><p class="dsg-sum">เหล็กยืน ${r.nbars}-${RcWsd.barName(o.d.dMain, fy)} · ปลอก RB ${o.d.dTie} @${o.d.sTie} ม.</p>${o.error ? `<p class="d-ng">${esc(o.error)}</p>` : ''}</div>`;
}

// ------------------------------------------------------------------ ฐานแผ่ (ชีต spread footings)
function dsgFootList() {
  const m = S.model; if (!m) return [];
  const N = Object.fromEntries((m.nodes || []).map(n => [n.id, n])), sec = Object.fromEntries((m.sections || []).map(s => [s.id, s]));
  const GL = ((m.levels || []).find(l => l.name === 'GL') || { z: 0 }).z, reac = (m.results && m.results.reactions) || {};
  const cols = (m.members || []).filter(x => x.type === 'column');
  return (m.supports || []).filter(f => f.kind === 'spread' || f.kind === 'pile_cap').map(f => {
    const n = N[f.node] || {}, col = cols.find(c => [c.i, c.j].some(id => N[id] && Math.abs(N[id].x - n.x) < 1e-3 && Math.abs(N[id].y - n.y) < 1e-3));
    const cs = col && sec[col.section] && sec[col.section].kind === 'rc_rect' ? sec[col.section] : null;
    let sap = null; const rr = reac[f.node];
    if (rr) { const best = Object.entries(rr).sort((a, b) => (+b[1][2] || 0) - (+a[1][2] || 0))[0]; if (best) sap = { P: Math.abs(+best[1][2] || 0), Mx: Math.abs(+best[1][3] || 0), My: Math.abs(+best[1][4] || 0), combo: best[0] }; }
    const mt = (m.materials || []).find(y => y.id === f.material && y.kind === 'concrete') || (m.materials || []).find(y => y.kind === 'concrete') || {};
    return { id: f.id, mark: f.mark || '', kind: f.kind, Bx: +f.b, By: +f.d, t: +f.h, Df: GL - f.bottom, bx: cs ? cs.b : 0.2, by: cs ? cs.h : 0.2, sap, fcp: +mt.fc || 240 };
  });
}
function dsgFootInput(x) {
  const u = dsg().foots[x.id] || {}, has = k => u[k] !== undefined && u[k] !== '', sp = x.sap || {};
  const pick = k => has(k) ? +u[k] : (sp[k] !== undefined ? sp[k] : null);
  return { f: { P: pick('P'), Mx: pick('Mx') || 0, My: pick('My') || 0 }, src: ['P', 'Mx', 'My'].some(has) ? 'กรอกเอง' : x.sap ? 'SAP' : '' };
}
function dsgFootRun(x) {
  const c = dsg().crit, inp = dsgFootInput(x);
  if (x.kind === 'pile_cap') return { need: 'ฐานรากเสาเข็ม — ชุดถัดไป' };
  if (!(+c.qa > 0)) return { need: 'ใส่ qa ในเกณฑ์ออกแบบ', inp };
  if (!(inp.f.P > 0)) return { need: 'ใส่แรง P', inp };
  const crit = RcWsd.criteria({ fcp: x.fcp, F: +c.F, mode: +c.mode, fy: +c.fy, fyv: +c.fyv });
  const p = { cov: +c.ftCov, t: x.t, Bx: x.Bx, By: x.By, Df: x.Df, P: inp.f.P, Mx: inp.f.Mx, My: inp.f.My, qa: +c.qa, gamma: +c.gamma, pier: 1, bx: x.bx, by: x.by };
  const d = RcWsd.footingDesign(p, crit, { dias: (c.ftDias || []).map(Number) });
  let sug = '';
  if (!d.ok && /ฐานเล็ก|ฐานบาง/.test(d.error || '')) { const z = RcWsd.footingDesign(p, crit, { dias: (c.ftDias || []).map(Number), resize: true }); if (z.ok) sug = `แนะนำขนาด ${df2(z.p.Bx)}×${df2(z.p.By)}×${df2(z.p.t)} ม. (แก้ในโมเดล)`; }
  return { r: d.r, ok: d.ok, error: d.error || '', sug, d, crit, inp, p: d.p, label: 'ฐานแผ่',
    rebar: { bars_x: [d.r.nL, d.p.dLong], bars_y: [d.r.nS, d.p.dShort] } };
}
function footCard(foots) {
  const D = dsg(), c = D.crit;
  const dn = foots.filter(x => S.dsgFoot[x.id] && S.dsgFoot[x.id].r), pass = dn.filter(x => S.dsgFoot[x.id].ok).length;
  return `<div class="card"><h2>ฐานรากแผ่ <span class="hint">${dn.length}/${foots.length} ฐานออกแบบได้ · ผ่าน ${pass}</span></h2>
    <p class="hint">${+c.qa > 0 ? `qa ${df2(c.qa, 0)} กก./ตร.ม.` : '<b class="d-ng">ยังไม่ได้ใส่ qa</b> (เกณฑ์ออกแบบด้านบน)'} · แรงจาก SAP ใช้ชุดที่ F3 มากสุดที่จุดรองรับ (P, M1→Mx, M2→My) แก้ได้ · น้ำหนักฐานและดินถมคิดให้ในแรงดันดิน · ขนาดฐานใช้ตามโมเดล ถ้าไม่ผ่านระบบแนะนำขนาดใหม่</p>
    ${foots.length ? `<div class="table-wrap"><table class="boq dsg-tab"><tr><th>ฐาน</th><th>B×L×t (ม.)</th><th>Df (ม.)</th><th>ตอม่อ (ม.)</th><th>P กก.</th><th>Mx กก.-ม.</th><th>My กก.-ม.</th><th>เหล็กเสริม</th><th></th></tr>
    ${foots.map(x => {
      const o = S.dsgFoot[x.id], u = D.foots[x.id] || {}, inp = dsgFootInput(x);
      const cell = k => `<input class="price${u[k] !== undefined && u[k] !== '' ? ' ov' : ''}" data-ff="${k}" inputmode="decimal" value="${u[k] !== undefined && u[k] !== '' ? esc(u[k]) : (x.sap ? df2(x.sap[k], 0).replace(/,/g, '') : '')}" placeholder="-">`;
      return `<tr class="row ${D.sel === 'ft:' + x.id ? 'sel' : ''}" data-ft="${esc(x.id)}"><td class="c-name"><b>${esc(x.mark)}</b> <span class="hint">${esc(x.id)}</span>${inp && inp.src ? `<span class="src">${inp.src}</span>` : ''}</td>
        <td class="r" data-l="B×L×t (ม.)">${df2(x.Bx)}×${df2(x.By)}×${df2(x.t)}</td><td class="r" data-l="Df (ม.)">${df2(x.Df)}</td><td class="r" data-l="ตอม่อ (ม.)">${df2(x.bx)}×${df2(x.by)}</td>
        <td data-l="P กก.">${x.kind === 'spread' ? cell('P') : ''}</td><td data-l="Mx กก.-ม.">${x.kind === 'spread' ? cell('Mx') : ''}</td><td data-l="My กก.-ม.">${x.kind === 'spread' ? cell('My') : ''}</td>
        <td class="dsg-rb">${o.r ? `แนว x ${o.r.nL}-${RcWsd.barName(o.d.p.dLong, +c.fy)} @${o.d.p.sLong} · แนว y ${o.r.nS}-${RcWsd.barName(o.d.p.dShort, +c.fy)} @${o.d.p.sShort}` + (o.error ? `<span class="warnline">${esc(o.error)}${o.sug ? ' · ' + esc(o.sug) : ''}</span>` : '') : `<span class="hint">${esc(o.need || '')}</span>`}</td>
        <td>${o.r ? (o.ok ? '<span class="pill ok">ผ่าน</span>' : '<span class="pill err">ไม่ผ่าน</span>') : ''}</td></tr>`;
    }).join('')}</table></div>` : '<p class="hint">ไม่มีฐานรากในโมเดล</p>'}
  </div>`;
}
function footReport(x, o) {
  if (!x || !o || !o.r) return '';
  const r = o.r, C = o.crit, p = o.p, fy = C.fy, pj = S.boq.project || {}, bn = d => RcWsd.barName(d, fy);
  const row = (a, eq, v, u = '', tag = '') => `<tr><td>${a}</td><td class="eq">${eq}</td><td class="r">${v}</td><td>${u}</td><td>${tag}</td></tr>`;
  const ck = k => (r.checks.find(c => c.code === k) || {}).ok;
  return `<div class="card dsg-rep"><div class="dsg-head"><b>Spread footings Design (WSD)</b> · ${esc(pj.name || S.model.meta.name || '')}<br>ฐาน <b>${esc(x.mark)}</b> (${esc(x.id)}) · แรงจาก${esc(o.inp.src || '-')}${x.sap && o.inp.src === 'SAP' ? ' ชุด ' + esc(x.sap.combo) : ''}</div>
    <h4>1. ข้อมูล</h4><table class="dsg-calc">
      ${row("f'c / fc / fs", C.main.grade, `${df2(C.fcp, 0)} / ${df2(C.fc, 2)} / ${df2(C.main.fs, 0)}`, 'ksc')}${row('R, j', '', `${df2(C.main.R, 3)} · ${df2(C.main.j, 4)}`, '')}
      ${row('Bx × By × t', '', `${df2(p.Bx)} × ${df2(p.By)} × ${df2(p.t)}`, 'ม.')}${row('Df / ตอม่อ', '', `${df2(p.Df)} / ${df2(p.bx)}×${df2(p.by)}`, 'ม.')}
      ${row('P / Mx / My', '', `${df2(p.P, 0)} / ${df2(p.Mx, 0)} / ${df2(p.My, 0)}`, 'กก., กก.-ม.')}${row('qa / γ', '', `${df2(p.qa, 0)} / ${df2(p.gamma, 0)}`, 'กก./ตร.ม., กก./ลบ.ม.')}
    </table>
    <h4>2. แรงดันดิน (รวมน้ำหนักฐานและดินถม)</h4><table class="dsg-calc">
      ${row('q max/min แกน y-y', '(P + Wฐาน + Wดิน)/A ± 6Mx/(Bx·By²)', `${df2(r.qmaxY, 0)} / ${df2(r.qminY, 0)}`, 'กก./ตร.ม.', okTag(ck('qy') && ck('qy0')))}
      ${row('q max/min แกน x-x', '(P + Wฐาน + Wดิน)/A ± 6My/(By·Bx²)', `${df2(r.qmaxX, 0)} / ${df2(r.qminX, 0)}`, 'กก./ตร.ม.', okTag(ck('qx') && ck('qx0')))}
    </table>
    <h4>3. โมเมนต์และแรงเฉือน (แรงดันสุทธิ)</h4><table class="dsg-calc">
      ${row('d แนว x / y', 't − หุ้ม − ½D · t − หุ้ม − D − ½D', `${df2(r.dL)} / ${df2(r.dS)}`, 'ซม.')}
      ${row('M ที่หน้าตอม่อ', 'แนว x / แนว y', `${df2(r.MyY, 0)} / ${df2(r.MxX, 0)}`, 'กก.-ม.')}
      ${row('d ต้องการ', '√(M/(R·b))', `${df2(r.dreqY, 2)} / ${df2(r.dreqX, 2)}`, 'ซม.', okTag(ck('d')))}
      ${row('เฉือนแบบคาน (ที่ d)', "v ≤ 0.29√f'c = " + df2(r.vc, 2), `${df2(r.vb2, 2)} / ${df2(r.vb1, 2)}`, 'ksc', okTag(ck('vb')))}
      ${row('เฉือนทะลุ (ที่ d/2)', `bo = ${df2(r.bo, 1)} ซม. · v ≤ 0.53√f'c = ${df2(r.vp, 2)}`, `${df2(r.vp1, 2)} / ${df2(r.vp2, 2)}`, 'ksc', okTag(ck('vp')))}
    </table>
    <h4>4. เหล็กเสริม</h4><table class="dsg-calc">
      ${row('แนว x (ล่าง)', `As = M/(fs·j·d) · As min = 14/fy·b·d`, `${df2(r.AsL, 2)} · ${df2(r.AsminL, 2)}`, 'ตร.ซม.', `${r.nL}-${bn(p.dLong)} @${p.sLong} = ${df2(r.AL, 2)} ${okTag(ck('asL'))}`)}
      ${row('แนว y', `As · As min`, `${df2(r.AsS, 2)} · ${df2(r.AsminS, 2)}`, 'ตร.ซม.', `${r.nS}-${bn(p.dShort)} @${p.sShort} = ${df2(r.AS, 2)} ${okTag(ck('asS'))}`)}
      ${row('ยึดหน่วง แนว x / y', 'Σo ต้องการ = V/(u·j·d)', `${df2(r.perReqL, 1)} / ${df2(r.perReqS, 1)}`, 'ซม.', okTag(ck('bondL') && ck('bondS')))}
      ${row('ระยะฝัง แนว x / y', 'D·fs/(4u) ≤ ระยะที่มี', `${df2(r.ldL, 1)} / ${df2(r.ldS, 1)}`, 'ซม.', okTag(ck('ldL') && ck('ldS')))}
      ${row('แบกทานใต้ตอม่อ', "P/(bx·by) ≤ " + df2(r.fnbA, 0), df2(r.fnb, 2), 'ksc', okTag(ck('bear')))}
    </table>
    <h4>สรุป ${okTag(o.ok)}</h4><p class="dsg-sum">แนว x ${r.nL}-${bn(p.dLong)} @${p.sLong} ม. · แนว y ${r.nS}-${bn(p.dShort)} @${p.sShort} ม.</p>${o.error ? `<p class="d-ng">${esc(o.error)}${o.sug ? ' · ' + esc(o.sug) : ''}</p>` : ''}</div>`;
}

// ------------------------------------------------------------------ เพลทหัวเสา (NeoSteel ชีต Column Base Plate)
/** จุดที่ชิ้นส่วนเหล็ก (ไม่นับแป) วางบนหัวเสา คสล. */
function dsgPlateList() {
  const m = S.model; if (!m) return [];
  const sec = Object.fromEntries((m.sections || []).map(s => [s.id, s])), all = m.members || [];
  const N = Object.fromEntries((m.nodes || []).map(n => [n.id, n]));
  const rcTop = new Map();
  all.filter(x => x.type === 'column' && sec[x.section] && sec[x.section].kind === 'rc_rect').forEach(c => { const top = N[c.j].z >= N[c.i].z ? c.j : c.i; rcTop.set(top, c); });
  const out = [];
  for (const [nid, col] of rcTop) {
    const st = all.filter(x => (x.i === nid || x.j === nid) && sec[x.section] && sec[x.section].kind !== 'rc_rect' && x.type !== 'purlin');
    if (!st.length) continue;
    const s0 = sec[st[0].section], name = s0.name || s0.id, nums = (name.match(/\d+(\.\d+)?/g) || []).map(Number);
    const shape = s0.shape || '', type = /pipe|circ/i.test(shape) || /^O|Ø/i.test(name) ? 1 : /lipped|^C/i.test(shape + name) ? 2 : /angle|^L/i.test(shape + name) ? 3 : /tube|box|rect|□/i.test(shape + name) ? 4 : /channel|\[/i.test(shape + name) ? 5 : /^I/i.test(name) ? 6 : 7;
    const depth = nums[0] || 100, wide = type === 1 || type === 4 ? (nums[1] && type === 4 ? nums[1] : depth) : (nums[1] || depth);
    const mt = (m.materials || []).find(y => y.id === col.material && y.kind === 'concrete') || {};
    const cs = sec[col.section];
    out.push({ id: nid, node: nid, mark: col.mark || '', col: col.id, rcB: Math.round(cs.b * 1000), rcL: Math.round(cs.h * 1000), members: st.map(x => x.id), section: name, type, depth, wide, fcp: +mt.fc || 240 });
  }
  return out;
}
function dsgPlateRun(x) {
  const c = dsg().crit, u = dsg().plates[x.id] || {}, has = k => u[k] !== undefined && u[k] !== '';
  const P = has('P') ? +u.P : null, M = has('M') ? +u.M : 0;
  if (!(P > 0)) return { need: 'ใส่แรง P (และ M)' };
  const p = { P, M, type: +(u.type || x.type), wide: has('wide') ? +u.wide : x.wide, depth: has('depth') ? +u.depth : x.depth, Fy: +c.plateFy, fcp: x.fcp, edge: has('edge') ? +u.edge : 25, maxB: x.rcB, maxL: x.rcL };
  const d = SteelConn.basePlateDesign(p);
  return { r: d.r, ok: d.ok, error: d.error || '', d, p };
}
function plateCard(plates) {
  const D = dsg(), opt = (v, cur, t) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`;
  const dn = plates.filter(x => S.dsgPlate[x.id] && S.dsgPlate[x.id].r), pass = dn.filter(x => S.dsgPlate[x.id].ok).length;
  return `<div class="card"><h2>เพลทหัวเสา <span class="hint">${dn.length}/${plates.length} จุด · ผ่าน ${pass}</span></h2>
    <p class="hint">จุดที่ชิ้นส่วนเหล็กวางบนหัวเสา คสล. · เพลทต้องไม่ใหญ่กว่าหัวเสา · ใส่แรงอัด P และโมเมนต์ M ที่ฐาน (แรงปฏิกิริยาจาก SAP) · ขนาดหน้าตัดอ่านจากชื่อหน้าตัด แก้ได้ · ยังไม่เข้า BOQ (เหล็กแผ่น/สลักยึด) — รอผูกรายการราคา</p>
    ${plates.length ? `<div class="table-wrap"><table class="boq dsg-tab"><tr><th>จุด</th><th>เหล็กที่วาง</th><th>หน้าตัด</th><th>กว้าง×ลึก (มม.)</th><th>P กก.</th><th>M กก.-ม.</th><th>เพลท + สลัก</th><th></th></tr>
    ${plates.map(x => {
      const o = S.dsgPlate[x.id], u = D.plates[x.id] || {};
      const cell = (k, def = '') => `<input class="price${u[k] !== undefined && u[k] !== '' ? ' ov' : ''}" data-pf="${k}" inputmode="decimal" value="${u[k] !== undefined && u[k] !== '' ? esc(u[k]) : def}" placeholder="-">`;
      return `<tr class="row ${D.sel === 'pl:' + x.id ? 'sel' : ''}" data-pl="${esc(x.id)}"><td class="c-name"><b>${esc(x.mark)}</b> <span class="hint">${esc(x.id)}</span></td>
        <td data-l="เหล็กที่วาง"><span class="hint">${esc(x.members.join(', '))}</span><br>${esc(x.section)}</td>
        <td data-l="หน้าตัด"><select data-pf="type">${Object.entries(SteelConn.TYPES).map(([k, v]) => opt(k, u.type || x.type, v[1])).join('')}</select></td>
        <td data-l="กว้าง×ลึก (มม.)"><div class="dsg-cant">${cell('wide', x.wide)}×${cell('depth', x.depth)}</div></td>
        <td data-l="P กก.">${cell('P')}</td><td data-l="M กก.-ม.">${cell('M')}</td>
        <td class="dsg-rb">${o.d ? `เพลท ${o.d.B}×${o.d.L}×${o.d.t} มม. · สลัก ${o.d.nb * 2}-Ø${o.d.dBolt} มม. ฝัง ${o.d.La} ซม.` + (o.error ? `<span class="warnline">${esc(o.error)}</span>` : '') : `<span class="hint">${esc(o.need || '')}</span>`}</td>
        <td>${o.d ? (o.ok ? '<span class="pill ok">ผ่าน</span>' : '<span class="pill err">ไม่ผ่าน</span>') : ''}</td></tr>`;
    }).join('')}</table></div>` : '<p class="hint">ไม่มีจุดที่เหล็กรูปพรรณวางบนหัวเสา คสล.</p>'}
  </div>`;
}
function plateReport(x, o) {
  if (!x || !o || !o.r) return '';
  const r = o.r, p = Object.assign({}, o.p, { B: o.d.B, L: o.d.L }), pj = S.boq.project || {};
  const row = (a, eq, v, u = '', tag = '') => `<tr><td>${a}</td><td class="eq">${eq}</td><td class="r">${v}</td><td>${u}</td><td>${tag}</td></tr>`;
  const ck = k => (r.checks.find(c => c.code === k) || {}).ok;
  const M = !!p.M;
  return `<div class="card dsg-rep"><div class="dsg-head"><b>Design Column-Base For Axial-Force And Bending-Moment</b> · ${esc(pj.name || S.model.meta.name || '')}<br>จุด <b>${esc(x.id)}</b> บนเสา ${esc(x.col)} · ${esc(x.section)} (${esc(SteelConn.TYPES[p.type][1])})</div>
    <h4>1. ข้อมูล</h4><table class="dsg-calc">
      ${row('P / M', '', `${df2(p.P, 0)} / ${df2(p.M, 0)}`, 'กก., กก.-ม.')}${row('เสาเหล็ก', 'กว้าง × ลึก', `${df2(p.wide, 0)} × ${df2(p.depth, 0)}`, 'มม.')}
      ${row('Fy / Fb', `${r.grade} · Fb = 0.75 Fy`, `${df2(p.Fy, 0)} / ${df2(r.Fb, 0)}`, 'ksc')}${row("f'c / Fp", "Fp = 0.25 f'c", `${df2(p.fcp, 0)} / ${df2(r.Fp, 2)}`, 'ksc')}
      ${row('สลัก Ft / Fv', '0.6·2400 / 0.4·2400', `${df2(r.Ft, 0)} / ${df2(r.Fv, 0)}`, 'ksc')}
      ${row('เพลท B × L', `ระยะสลักจากขอบ ${p.edge} มม.`, `${o.d.B} × ${o.d.L}`, 'มม.', okTag(ck('B') && ck('L')))}
    </table>
    <h4>2. แรงแบกทาน</h4><table class="dsg-calc">
      ${M ? row('fp min / max', 'P/A ∓ M·c/I', `${df2(r.fpmin, 2)} / ${df2(r.fpmax, 2)}`, 'ksc', okTag(ck('fpmin') && ck('fpmax'))) + row('fp ที่ขอบเสา', '', df2(r.fpe, 2), 'ksc', okTag(ck('fpe')))
        : row('fp', 'P/(B·L)', df2(r.fp, 2), 'ksc', okTag(ck('fp')))}
      ${row('ระยะ x / y', '(L − d)/2 · ระยะสลักถึงผิวเสา', `${df2(r.x, 2)} / ${df2(r.y, 2)}`, 'ซม.', okTag(ck('edge')))}
    </table>
    <h4>3. ความหนาเพลทและสลัก</h4><table class="dsg-calc">
      ${M ? row('Me', 'B·x²·(fpe + fpmax)/4', df2(r.Me, 2), 'กก.-ม.') + row('t ต้องการ', '√(6·Me/(B·Fb))', df2(r.treq, 3), 'ซม.', `ใช้ ${o.d.t} มม. ${okTag(ck('t'))}`)
        : row('m / n', '(L − 0.95d)/2 · (B − 0.8b)/2', `${df2(r.m, 2)} / ${df2(r.n, 2)}`, 'ซม.') + row('t ต้องการ', '2·max(m,n)·√(fp/Fy)', df2(r.treq, 3), 'ซม.', `ใช้ ${o.d.t} มม. ${okTag(ck('t'))}`)}
      ${row('แรงในสลัก', r.tension ? 'M/(L − 2y) (แรงดึง)' : '0.1·P (แรงเฉือน)', df2(r.F, 0), 'กก.')}
      ${row('พื้นที่สลักต่อด้าน', M ? 'F/Ft' : 'F/Fv', df2(r.Areq, 3), 'ตร.ซม.', `${r.nb} ตัว Ø${o.d.dBolt} มม. ต่อด้าน`)}
      ${row('ระยะฝังสลัก', 'Ft·D/(4·11)', df2(r.La, 0), 'ซม.')}${row('เชื่อม', 'เชื่อมโดยรอบ', '3', 'มม.')}
    </table>
    <h4>สรุป ${okTag(o.ok)}</h4><p class="dsg-sum">เพลท ${o.d.B}×${o.d.L}×${o.d.t} มม. + สลักยึด ${o.d.nb * 2}-Ø${o.d.dBolt} มม. ฝังลึก ${o.d.La} ซม. · เชื่อมโดยรอบ 3 มม.</p>${o.error ? `<p class="d-ng">${esc(o.error)}</p>` : ''}</div>`;
}
