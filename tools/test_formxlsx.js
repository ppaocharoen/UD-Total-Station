// ทดสอบ lib/formxlsx.js — โครงสร้างไฟล์ Excel ส่งออก (สูตร ชีต Factor F ลงนาม) · ต้องมี exceljs (npm i exceljs หรือ EXCELJS=/path)
// ค่าตัวเลขตรวจกับ LibreOffice แล้ว (ปร.4 = ยอดรวมเว็บ, Factor F 11 จุด ตรงกับ lib/factorf.js) — ดู KB rc_wsd_criteria / บันทึกเวอร์ชัน 5.13
let ExcelJS; try { ExcelJS = require(process.env.EXCELJS || 'exceljs'); } catch (e) { console.log('SKIP test_formxlsx: ไม่มี exceljs'); process.exit(0); }
const fs = require('fs'), path = require('path');
const FX = require('../lib/formxlsx.js'), FF = require('../lib/factorf.js');
const tpl = fs.readFileSync(path.join(__dirname, '../boq/form_template.xlsx'));
let pass = 0, fail = 0;
const check = (n, ok, m) => { if (ok) pass++; else { fail++; console.log('FAIL', n, m || ''); } };
const fm = c => (c.value && c.value.formula) || '';
const base = (mode, pr2, pr3) => ({ mode, project: { name: 'ทดสอบ', location: 'อุดร', agency: 'กองช่าง', drawing_no: 'ท.1', calc_date: '2026-10-19' },
  people: mode === 'central' ? [{ role: 'ประธานกรรมการ', name: 'ก' }, { role: 'กรรมการ', name: 'ข' }, { role: 'กรรมการ', name: 'ค' }] : [{ role: 'ผู้ประมาณราคา', name: 'ก' }],
  sections: [{ code: '1.1', name: 'งานโครงสร้าง', groups: [{ code: '1.1.2', name: 'งานดิน', rows: [{ name: 'ขุดดิน', qty: 12.5, unit: 'ลบ.ม.', mat: null, lab: 120 }, { name: 'คอนกรีต', qty: 3.33, unit: 'ลบ.ม.', mat: 2450.5, lab: 398 }] }] },
    { code: '1.2', name: 'งานสถาปัตย์', groups: [{ code: '1.2.7', name: 'งานสี', rows: [{ name: 'ทาสี', qty: 100, unit: 'ตร.ม.', mat: 45.25, lab: 30 }] }] }],
  factor: { advance: 15, retention: 10, loanShare: 0, table: FF.TABLES.adv15_ret10, F: 1.3052 },
  pr2: pr2 ? [{ name: 'แอร์', qty: 2, unit: 'ชุด', price: 25000, install: 1500 }] : [], pr3: pr3 ? [{ name: 'ป้าย', qty: 1, unit: 'ป้าย', amount: 3000 }] : [] });
(async () => {
  for (const [mode, p2, p3] of [['estimate', true, true], ['central', true, true], ['estimate', false, false]]) {
    const tag = `${mode}${p2 ? '' : '-noPr23'}`;
    const o = await FX.build(ExcelJS, tpl, base(mode, p2, p3)), wb = o.wb;
    const names = wb.worksheets.map(w => w.name);
    check(tag + ' sheets', (p2 ? names.includes('ปร.2') && names.includes('ปร.2(ก)') && names.includes('ปร.3') : !names.includes('ปร.2') && !names.includes('ปร.3')) && names.includes('ปร.4') && names.includes('Factor F'), names.join());
    const s1 = wb.getWorksheet('ปร.1');
    // แถวรายการ: K/M/N เป็นสูตร ปัด 2 ตำแหน่ง
    let items = 0;
    s1.eachRow((row, r) => { if (row.getCell('B').value === '-') { items++;
      check(`${tag} r${r} K`, fm(row.getCell('K')) === `ROUND(H${r}*J${r},2)`); check(`${tag} r${r} M`, fm(row.getCell('M')) === `ROUND(H${r}*L${r},2)`); check(`${tag} r${r} N`, fm(row.getCell('N')) === `K${r}+M${r}`); } });
    check(tag + ' items', items === 3, items);
    check(tag + ' mat null → ว่าง', s1.getCell(`J${o.rows.secTot[0] - 2}`).value === null);
    o.rows.secTot.forEach(t => check(`${tag} secTot ${t}`, /^SUM\(N\d+:N\d+\)$/.test(fm(s1.getCell(`N${t}`)))));
    check(tag + ' grand', fm(s1.getCell(`N${o.rows.pr1Grand}`)) === o.rows.secTot.map(t => `N${t}`).join('+'));
    check(tag + ' sum page1', /^SUM\(N11:N12\)$/.test(fm(s1.getCell(`N${o.rows.pr1Sum}`))));
    // อ้างชื่อชีตมีเครื่องหมาย '
    let bad = 0; wb.worksheets.forEach(ws => ws.eachRow(row => row.eachCell(c => { const x = fm(c); if (/(^|[^'])ปร\.[0-9][^!']*!/.test(x)) bad++; })));
    check(tag + ' quoted refs', bad === 0, bad);
    // Factor F
    const sf = wb.getWorksheet('Factor F');
    check(tag + ' FF E6', sf.getCell('E6').value === 0.15 && sf.getCell('E7').value === 0.1);
    check(tag + ' FF table', sf.getCell('G12').value === FF.TABLES.adv15_ret10[0][2] && sf.getCell('G35').value === FF.TABLES.adv15_ret10[23][2] && sf.getCell('E33').value === 400);
    check(tag + ' FF H49', /ROUNDDOWN\(/.test(fm(sf.getCell('H49'))) && /E12:E33/.test(fm(sf.getCell('H49'))));
    check(tag + ' FF G37', fm(sf.getCell('G37')) === `'ปร.1'!N${o.rows.pr1Sum}`);
    // ปร.1 (ก)
    const sa = wb.getWorksheet('ปร.1 (ก)');
    check(tag + ' 1ก H10', fm(sa.getCell('H10')) === `'ปร.1'!N${o.rows.secTot[0]}` && fm(sa.getCell('H11')) === `'ปร.1'!N${o.rows.secTot[1]}`);
    check(tag + ' 1ก J', fm(sa.getCell('J10')) === `'Factor F'!H49` && fm(sa.getCell('K10')) === 'ROUND(H10*J10,2)');
    check(tag + ' 1ก tot', fm(sa.getCell(`K${o.rows.pr1aTot}`)) === 'SUM(K10:K11)');
    // ปร.4
    const s4 = wb.getWorksheet('ปร.4');
    check(tag + ' ปร.4 final', fm(s4.getCell(`H${o.rows.pr4Final}`)) === (mode === 'estimate' ? `ROUNDDOWN(H${o.rows.pr4Sum},-3)` : `H${o.rows.pr4Sum}`));
    check(tag + ' ปร.4 pr2', p2 ? fm(s4.getCell('H10')) === `'ปร.2(ก)'!J11` : s4.getCell('H10').value === 0);
    if (p2) check(tag + ' ปร.2ก VAT', /^SUMPRODUCT\(ROUND\('ปร\.2'!K11:K11\*0\.07,2\)\)$/.test(fm(wb.getWorksheet('ปร.2(ก)').getCell('G10'))));
    // ลงนาม
    let sig = 0; s1.eachRow(row => row.eachCell(c => { if (c.master.address === c.address && typeof c.value === 'string' && /^\(\s+[กขค]\s+\)$/.test(c.value)) sig++; }));
    check(tag + ' sig ปร.1', sig === (mode === 'central' ? 3 : 1), sig);
    check(tag + ' date label', /^(ประมาณราคา|คำนวณราคากลาง)เมื่อวันที่$/.test(s1.getCell('A6').value) && (mode === 'central') === /ราคากลาง/.test(s1.getCell('A6').value));
    await wb.xlsx.writeBuffer();   // เขียนได้ไม่ error
  }
  console.log(`test_formxlsx: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
