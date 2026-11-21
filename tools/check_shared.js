// ตรวจว่าไฟล์ใช้ร่วมกับ UD Cost Hub เหมือนกันทุกไบต์ — node tools/check_shared.js <โฟลเดอร์ repo UDmaterial-price>
const fs = require('fs'), path = require('path');
const ch = process.argv[2];
if (!ch) { console.log('ใช้: node tools/check_shared.js <โฟลเดอร์ UDmaterial-price>'); process.exit(2); }
const SHARED = ['boqcalc', 'factorf', 'formxlsx', 'survey', 'auth', 'boqsuggest', 'boqimport', 'xlsxwm'];   // boqimport: ใช้เฉพาะ norm/similar (จำการผูกตามชื่อ ร่วมกับ Cost Hub)
let bad = 0;
for (const n of SHARED) {
  const a = fs.readFileSync(path.join(__dirname, '..', 'lib', n + '.js')), b = fs.readFileSync(path.join(ch, 'lib', n + '-v1.js'));
  const same = a.equals(b); if (!same) bad++;
  console.log((same ? 'ตรง  ' : 'ต่าง ') + n);
}
const t1 = fs.readFileSync(path.join(__dirname, '..', 'boq', 'form_template.xlsx')), t2 = fs.readFileSync(path.join(ch, 'lib', 'boq_form_template-v1.xlsx'));
if (!t1.equals(t2)) { bad++; console.log('ต่าง form_template.xlsx'); } else console.log('ตรง  form_template.xlsx');
{ const same = fs.readFileSync(path.join(__dirname, '..', 'boq', 'watermark.jpg')).equals(fs.readFileSync(path.join(ch, 'lib', 'watermark-v1.jpg'))); if (!same) bad++; console.log((same ? 'ตรง  ' : 'ต่าง ') + 'watermark.jpg'); }   // ลายน้ำตราเทศบาล (ก้อน 7)
for (const f of ['survey_lib.gs', 'survey_lib.appsscript.json']) {   // สคริปต์คลังราคาสืบกลาง (Apps Script) — ฉบับเดียวกันสองที่
  const same = fs.readFileSync(path.join(__dirname, f)).equals(fs.readFileSync(path.join(ch, 'tools', f))); if (!same) bad++;
  console.log((same ? 'ตรง  ' : 'ต่าง ') + f);
}
console.log(bad ? `ไม่ตรง ${bad} ไฟล์` : 'ทั้งหมดตรงกัน'); process.exit(bad ? 1 : 0);
