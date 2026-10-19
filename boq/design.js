/* design.js — แท็บออกแบบโครงสร้าง (WSD) ใช้ lib/rcwsd.js
 * ส่วนแรก: เกณฑ์ออกแบบ + คาน (กลางช่วง +M / ที่ฐานรองรับ −M / เฉือน / บิด) → เหล็กเสริมเขียนลง design.members ของโมเดล
 * ใช้ตัวแปรร่วมจาก app.js: S, $, $$, esc, fmt, toast, download, autosave, buildLayers
 */
'use strict';
const DSG_DEF = () => ({ crit: { F: 0.45, mode: 1, fy: 4000, fyv: 2400, cov: 2.5, dias: [12, 16, 20, 25] }, beams: {}, sel: '' });
function dsg() {
  const b = S.boq; if (!b.dsg) b.dsg = DSG_DEF();
  const d = b.dsg; d.crit = Object.assign(DSG_DEF().crit, d.crit || {}); d.beams = d.beams || {}; return d;
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
      <div class="dsg-dias"><span>ขนาดเหล็กหลักที่ใช้</span>${[12, 16, 20, 25, 28].map(d => `<label class="ck"><input type="checkbox" data-dia="${d}" ${(c.dias || []).map(Number).includes(d) ? 'checked' : ''}>DB${d}</label>`).join('')}</div>
    </div>
    <div class="table-wrap"><table class="boq dsg-kv"><tr><th>fc</th><th>fs เหล็กหลัก</th><th>fs ปลอก</th><th>Ec</th><th>n</th><th>k</th><th>j</th><th>R</th><th>vc</th></tr>
      <tr><td class="r">${df2(cr.fc)}${cr.capped ? ' <span class="pill warn">จำกัด 65</span>' : ''}</td><td class="r">${df2(cr.main.fs, 0)}</td><td class="r">${df2(cr.stir.fs, 0)}</td><td class="r">${df2(cr.Ec, 0)}</td><td class="r">${df2(cr.n, 3)}${cr.nOk ? '' : ' <span class="pill err">&lt; 6</span>'}</td><td class="r">${df2(cr.main.k, 4)}</td><td class="r">${df2(cr.main.j, 4)}</td><td class="r">${df2(cr.main.R, 3)}</td><td class="r">${df2(cr.vc, 3)}</td></tr></table></div>
    ${cr.note ? `<p class="d-note">หมายเหตุที่ต้องระบุในแบบ: ${esc(cr.note)}</p>` : ''}
    <p class="hint">ที่มา: รายการคำนวณ RC_Design_WSD (สูตรเดียวกันทุกเซลล์) · ประกาศ มท. การออกแบบอาคารและคุณสมบัติวัสดุ 2567</p>
  </div>
  <div class="card"><h2>คาน คสล. <span class="hint">${done.length}/${beams.length} ตัวมีแรง · ผ่าน ${pass}</span></h2>
    <p class="hint">${nRes ? `แรงจากผลวิเคราะห์ SAP (${nRes} ชิ้น) — แก้ในช่องได้ ช่องที่แก้จะใช้แทนผล SAP` : 'ยังไม่มีผลวิเคราะห์ SAP ในโมเดล — กรอก M+ (กลางช่วง) M− (ที่ฐานรองรับ) V T ของแต่ละคาน หรือรัน tools/sap_results.py --write'} · ประเภทคานเดาจากการต่อเนื่องของคานในแนวเดียวกัน แก้ได้</p>
    <div class="btn-row"><button class="btn primary" id="dsg-write">เขียนเหล็กลงโมเดล</button><button class="btn" id="dsg-dl">ดาวน์โหลด .bm.json</button><button class="btn" id="dsg-print">พิมพ์รายการคำนวณ</button></div>
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
  <div id="dsg-report">${D.sel && S.dsgOut[D.sel] ? beamReport(beams.find(b => b.id === D.sel), S.dsgOut[D.sel]) : '<div class="card hint">แตะแถวคานเพื่อดูรายการคำนวณ</div>'}</div>`;
  bindDesign(beams);
}
function bindDesign(beams) {
  const D = dsg(), re = () => { autosave(); renderDesign(); };
  $$('#dsg-body [data-dc]').forEach(el => el.onchange = () => { const k = el.dataset.dc; D.crit[k] = k === 'cov' ? (+el.value || 2.5) : +el.value; re(); });
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
  $('#dsg-write').onclick = () => dsgWrite(beams);
  $('#dsg-dl').onclick = () => { download(S.modelName.replace(/(\.bm)?\.json$/, '') + '.bm.json', JSON.stringify(S.model, null, 1)); };
  $('#dsg-print').onclick = () => dsgPrint(beams);
}
function dsgWrite(beams) {
  const m = S.model, c = dsg().crit; m.design = m.design || {}; m.design.members = m.design.members || {};
  let n = 0;
  beams.forEach(bm => {
    const r = S.dsgOut[bm.id]; if (!r || !r.rebar) return;
    m.design.members[bm.id] = { method: 'WSD', rebar: r.rebar, pass: !!r.ok, ratio: Math.round(r.ratio * 1000) / 1000,
      governing: [r.inp.src === 'SAP' && bm.sap && bm.sap.combo ? bm.sap.combo : r.inp.src, RcWsd.BEAM_TYPES_TH[r.inp.type]].filter(Boolean).join(' · '),
      status: 'computed', src: `UD Total Station v${UD_VERSION.v} ออกแบบ WSD (fc ${df2(r.crit.fc, 0)} ksc, ${r.crit.main.grade}/${r.crit.stir.grade}, หุ้ม ${c.cov} ซม.)` };
    n++;
  });
  if (!n) return toast('ยังไม่มีคานที่ออกแบบได้ — กรอกแรงก่อน');
  if (m.quantities) m.quantities.stale = true;
  if (S.viewer) buildLayers(S.viewer.load(m));
  toast(`เขียนเหล็กเสริมคาน ${n} ตัวลงโมเดลแล้ว · ดาวน์โหลด .bm.json แล้วรัน tools/takeoff.py --write เพื่อปรับ BOQ`);
  renderDesign(); if (typeof renderProject === 'function') renderProject();
}
function dsgPrint(beams) {
  const D = dsg(), list = D.sel ? beams.filter(b => b.id === D.sel) : beams.filter(b => S.dsgOut[b.id] && S.dsgOut[b.id].rebar);
  if (!list.length) return toast('ยังไม่มีรายการคำนวณ');
  $('#dsg-printout').innerHTML = list.map(b => beamReport(b, S.dsgOut[b.id])).join('');
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
