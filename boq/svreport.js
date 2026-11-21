/* UD Total Station — รายงานราคาสืบ (M2 ก้อน 5d · ตาม UD Cost Hub)
 * บัญชีราคาสืบ (พิมพ์/PDF): ตารางรายที่สืบต่อรายการ + อ้าง "ภาพที่ N" + ลิงก์ย่อ [Ln] รวมท้ายรายงาน
 * ภาพหลักฐาน (พิมพ์/PDF): ภาพขนาดใหญ่ หน้าละ 2 ภาพ เลขภาพเดียวกับบัญชีราคาสืบและ Excel
 * ส่งออก Excel: 2 แผ่น สรุปราคาสืบ + รายละเอียดการสืบ (มีสูตร) — ข้อมูลจาก Survey.sheetData (ใช้ร่วม Cost Hub)
 * เลขภาพ: Survey.evNumber — เรียงรายการตามชื่อ → รายตามลำดับ → ภาพตามลำดับที่แนบ */
const svKey = it => it.target || it.id;
/** รายการในโครงการที่มีราคาสืบ เรียงตามชื่อ (ลำดับเดียวกับเลขภาพ) */
function svReportItems() {
  return Object.values((S.boq && S.boq.surveys) || {}).filter(it => Survey.summary(it).price !== null)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
}
const svEvidence = list => Survey.evNumber(list, { key: svKey });
const svThaiDate = () => { const d = new Date(), m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`; };
const svFileName = what => `${what}_${(S.boq.project && S.boq.project.name) || S.modelName || 'โครงการ'}_${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]+/g, '_');
function svProjLine() {
  const p = S.boq.project || {};
  return [p.name ? 'โครงการ ' + p.name : '', p.location ? 'สถานที่ ' + p.location : '', p.agency ? 'หน่วยงาน ' + p.agency : ''].filter(Boolean).map(esc).join(' · ');
}
/** ภาพของรายการ: ในโครงการ (S.img) → ในเครื่อง (IndexedDB) → คลังกลาง (รายการที่ผูก/ชื่อ+หน่วยตรง) */
async function svImgData(it, id) {
  if (S.img[id]) return Survey.safeImg(S.img[id]);
  let d = await Survey.imgGet(id).catch(() => null);
  if (!d) {
    const all = await Survey.libAll().catch(() => []), key = it.lib || Survey.libKey(it.name, it.unit);
    const x = (all || []).find(y => y.key === key && y.imgs && y.imgs[id]) || (all || []).find(y => y.imgs && y.imgs[id]);
    if (x) d = await Survey.libImg(x.imgs[id]).catch(() => null);
  }
  if (d && Survey.safeImg(d)) { S.img[id] = d; Survey.imgPut(id, d); return d; }
  return null;
}
async function svWaitImgs(el) {
  const ims = [...el.querySelectorAll('img')];
  await Promise.race([Promise.all(ims.map(i => (i.decode ? i.decode() : Promise.resolve()).catch(() => {}))), new Promise(r => setTimeout(r, 8000))]);
}
/** ลิงก์ในรายงาน: ในตารางแสดง [Ln] ชื่อเว็บ (กดได้) · ลิงก์เต็มรวมท้ายรายงาน ลิงก์ซ้ำใช้เลขเดียว (ตรง Cost Hub) */
function svLinks() {
  const list = [], byUrl = {};
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u.slice(0, 30); } };
  const reg = (u, use) => { let o = byUrl[u]; if (!o) { o = byUrl[u] = { n: list.length + 1, url: u, uses: [] }; list.push(o); } if (use && !o.uses.includes(use)) o.uses.push(use); return o; };
  return {
    cite(text, use) {
      const t = String(text || ''); if (!t) return '';
      const re = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi; let out = '', last = 0, m;
      while ((m = re.exec(t))) {
        const u = m[0].replace(/[),.;]+$/, ''), full = /^https?:/i.test(u) ? u : 'https://' + u;
        out += esc(t.slice(last, m.index));
        const o = reg(full, use); out += `<a href="${esc(full)}" target="_blank" rel="noopener">[L${o.n}] ${esc(host(full))}</a>`;
        last = m.index + u.length;
      }
      return out + esc(t.slice(last));
    },
    html() {
      if (!list.length) return '';
      const dec = u => { try { return decodeURI(u); } catch (e) { return u; } };
      return `<h4>เอกสารอ้างอิง (ลิงก์)</h4><table class="svr-tbl svr-links"><colgroup><col style="width:9mm"><col><col style="width:62mm"></colgroup>
        <thead><tr><th>เลข</th><th>ลิงก์</th><th>ใช้กับ</th></tr></thead><tbody>${list.map(o => `<tr><td>L${o.n}</td><td class="url"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(dec(o.url))}</a></td><td>${esc(o.uses.join(' · '))}</td></tr>`).join('')}</tbody></table>`;
    },
  };
}
function svBlockHtml(it, idx, ev, lk) {
  const s = Survey.summary(it), cat = svCatOf(it);
  const rows = s.list.map((x, j) => {
    const q = x.q, ref = ev.refTxt(svKey(it), q.id), use = it.name + ' — ' + (q.shop || Survey.CHANNEL[q.channel] || '');
    return `<tr${q.id === s.best.id ? ' class="best"' : ''}><td>${j + 1}</td><td>${esc(q.shop || '')}${q.brand ? ' <small>(ยี่ห้อ ' + esc(q.brand) + ')</small>' : ''}<div class="sub">${esc(Survey.CHANNEL[q.channel] || '')}${q.contact ? ' · ' + lk.cite(q.contact, use) : ''}</div></td>
      <td>${esc(q.date || '')}</td><td class="r">${fmt(+q.price)}</td><td>${esc(q.qunit || '')}</td><td class="r">${esc(q.factor || 1)}</td><td>${q.vat ? 'รวม VAT' : 'ไม่รวม VAT'}</td>
      <td class="r">${fmt(x.up)}</td><td>${lk.cite(q.note, use)}${ref ? ' (' + ref + ')' : ''}</td></tr>`;
  }).join('');
  return `<div class="svr-block"><div class="svr-hd">${idx + 1}. ${esc(it.name)} <span>[หน่วย ${esc(it.unit)}]${cat !== 'mat' ? ' · ' + SV_CATS[cat] : ''}</span></div>
    <div class="svr-sub">${esc(Survey.srcText(it))}${s.n < Survey.MIN_Q ? ' · สืบได้ ' + s.n + ' ราย (ไม่ครบ ' + Survey.MIN_Q + ')' + (it.reason ? ' เหตุผล: ' + esc(it.reason) : '') : ''}</div>
    <table class="svr-tbl"><thead><tr><th>#</th><th>ร้าน / ช่องทาง</th><th>วันที่</th><th class="r">ราคาเสนอ</th><th>หน่วยร้าน</th><th class="r">ตัวคูณ</th><th>VAT</th><th class="r">บาท/${esc(it.unit)} ไม่รวม VAT</th><th>หมายเหตุ</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="7" class="r">ราคาที่ใช้ (ต่ำสุด)</td><td class="r"><b>${fmt(s.price)}</b></td><td></td></tr></tfoot></table></div>`;
}
function svDoPrint(html) {
  $('#sv-printout').innerHTML = html;
  document.body.classList.add('print-survey');
  setTimeout(() => { window.print(); document.body.classList.remove('print-survey'); }, 300);
}
/** บัญชีราคาสืบ (ไม่มีภาพ — อ้างเลขภาพ) */
function svPrint() {
  const list = svReportItems();
  if (!list.length) { toast('ยังไม่มีรายการที่มีราคาสืบให้ออกรายงาน'); return; }
  const ev = svEvidence(list), lk = svLinks();
  svDoPrint(`<div class="svr-head"><div class="svr-title">บัญชีราคาสืบ</div><div class="svr-meta">${svProjLine()}${svProjLine() ? ' · ' : ''}${list.length} รายการ · วันที่พิมพ์ ${svThaiDate()}</div></div>
    ${list.map((it, i) => svBlockHtml(it, i, ev, lk)).join('')}
    ${lk.html()}
    <div class="svr-ft">* ราคาต่อหน่วย = (ราคาที่ร้านเสนอ ÷ 1.07 กรณีรวม VAT) ÷ ตัวคูณแปลงหน่วย · ราคาที่ใช้ = ต่ำสุดของรายที่สืบ${ev.figs.length ? ' · "ภาพที่ N" ดูใน "พิมพ์ภาพหลักฐาน"' : ''}</div>`);
}
/** ภาพหลักฐาน หน้าละ 2 ภาพ — โหลดภาพครบก่อนพิมพ์ แจ้งภาพที่โหลดไม่ได้ */
async function svEvidencePrint() {
  const list = svReportItems(), ev = svEvidence(list);
  if (!ev.figs.length) { toast('รายการที่มีราคาสืบยังไม่มีภาพหลักฐาน'); return; }
  const bad = [];
  for (const [i, f] of ev.figs.entries()) {
    toast(`กำลังโหลดภาพหลักฐาน ${i + 1}/${ev.figs.length}…`);
    f.d = await svImgData(f.item, f.id);
    if (!f.d) { f.err = S.libMode === 'public' ? 'ต้องเข้าสู่ระบบก่อนจึงดูภาพในคลังกลางได้' : 'ไม่พบภาพในโครงการ เครื่องนี้ และคลังกลาง'; bad.push(f); }
  }
  if (bad.length && !confirm(`โหลดภาพไม่ได้ ${bad.length} จาก ${ev.figs.length} ภาพ:\n` + bad.slice(0, 12).map(f => `- ภาพที่ ${f.n} ${f.name} (${f.q.shop || '-'}): ${f.err}`).join('\n') + (bad.length > 12 ? `\n…และอีก ${bad.length - 12} ภาพ` : '') + '\n\nพิมพ์ต่อโดยเว้นช่องภาพเหล่านี้ไว้หรือไม่?')) return;
  const fig = f => `<div class="svr-fig"><div class="svr-fhd">ภาพที่ ${f.n} — ${esc(f.name)} <span>[หน่วย ${esc(f.unit || '')}]</span></div>
    <div class="svr-fsub">${esc(f.q.shop || Survey.CHANNEL[f.q.channel] || '-')}${f.q.brand ? ' · ยี่ห้อ ' + esc(f.q.brand) : ''} · ราคาเสนอ ${fmt(+f.q.price)} บาท/${esc(f.q.qunit || f.unit || '')}${f.q.vat ? ' (รวม VAT)' : ''} · ${esc(f.q.date || '')}${f.up !== null && f.up !== undefined ? ' · คิดเป็น ' + fmt(f.up) + ' บาท/' + esc(f.unit || '') + ' ไม่รวม VAT' : ''}</div>
    ${f.d ? `<img src="${esc(f.d)}" alt="ภาพที่ ${f.n}">` : `<div class="svr-miss">โหลดภาพไม่ได้ — ${esc(f.err || '')}</div>`}</div>`;
  const pages = []; for (let i = 0; i < ev.figs.length; i += 2) pages.push(ev.figs.slice(i, i + 2).map(fig).join(''));
  $('#sv-printout').innerHTML = `<div class="svr-ev"><div class="svr-head"><div class="svr-title">ภาพหลักฐานการสืบราคา</div><div class="svr-meta">${svProjLine()}${svProjLine() ? ' · ' : ''}${ev.figs.length} ภาพ · วันที่พิมพ์ ${svThaiDate()}</div></div>
    ${pages.map((h, i) => `<div class="svr-page${i < pages.length - 1 ? ' brk' : ''}">${h}</div>`).join('')}</div>`;   // A4 แนวตั้ง
  await svWaitImgs($('#sv-printout'));
  document.body.classList.add('print-survey');
  setTimeout(() => { window.print(); document.body.classList.remove('print-survey'); }, 300);
}
/** ส่งออก Excel ราคาสืบ (ExcelJS) — 2 แผ่นเหมือน Cost Hub */
async function svExportExcel() {
  const list = svReportItems();
  if (!list.length) { toast('ยังไม่มีรายการที่มีราคาสืบให้ส่งออก'); return; }
  try {
    if (!window.ExcelJS) await loadScript(EXCELJS.src, EXCELJS.sri);
    const d = Survey.sheetData(list, svEvidence(list).refTxt, svKey), wb = new ExcelJS.Workbook();
    wb.creator = 'UD Total Station';
    for (const o of [d.sum, d.detail]) {
      const ws = wb.addWorksheet(o.name);
      o.aoa.forEach(r => ws.addRow(r));
      Object.entries(o.f).forEach(([a, c]) => { const cell = ws.getCell(a); cell.value = { formula: c.f, result: c.v === null ? undefined : c.v }; cell.numFmt = '#,##0.00'; });
      o.cols.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.eachRow((r, n) => { const v1 = r.getCell(1).value, hd = n === 1 || v1 === '#' || (typeof v1 === 'string' && /^\d+\. /.test(v1)) || r.getCell(9).value === 'ราคาที่ใช้ (ต่ำสุด)'; r.eachCell(c => { c.font = { name: 'TH Sarabun New', size: 13, bold: hd }; }); });   // ฟอนต์เดียวกับแบบฟอร์ม ปร.
    }
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = svFileName('ราคาสืบ') + '.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`ส่งออก Excel ราคาสืบ ${list.length} รายการแล้ว`);
  } catch (er) { toast('ส่งออก Excel ไม่สำเร็จ: ' + er.message); }
}
