/**
 * UD Total Station — คลังราคาสืบกลาง (Google Apps Script Web App)
 * ข้อมูลราคาสืบเก็บในชีต "library" · ภาพหลักฐานเก็บในโฟลเดอร์ Drive "UD Survey Images" (ส่วนตัว ไม่แชร์ลิงก์)
 * อ่าน/เขียน/ลบ: ต้องมีรหัสทีมทุกคำสั่ง (Script properties: TEAM_KEY) · เดาผิดเกิน 20 ครั้งใน 10 นาที → ปิดรับ 10 นาที
 *
 * วิธีติดตั้ง (ครั้งเดียว):
 *  1) script.google.com → New project → วางไฟล์นี้ → Project Settings → ติ๊ก Show "appsscript.json" → วาง appsscript.json (ท้ายไฟล์นี้) → Save
 *  2) เลือกฟังก์ชัน setup → ▷ เรียกใช้ (อนุญาตสิทธิ์) — สร้างชีต "UD คลังราคาสืบ" + โฟลเดอร์ภาพให้เอง
 *  3) Project Settings → Script properties → Add: TEAM_KEY = <รหัสทีม อย่างน้อย 12 ตัว>
 *  4) Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → Deploy → คัดลอก Web app URL
 *  5) เอา URL ใส่ใน lib/version.js (LIB_URL) หรือในเว็บ (แท็บราคาสืบ → ตั้งค่าคลังกลาง)
 *
 * เว็บเรียกแบบ POST text/plain (ไม่มี preflight, รหัสไม่อยู่ใน URL): list / img / ping / put / del
 *
 * appsscript.json (จำกัดสิทธิ์: ชีต + เฉพาะไฟล์ Drive ที่สคริปต์สร้างเอง) — ไฟล์เต็มอยู่ที่ tools/survey_lib.appsscript.json:
 * { "timeZone": "Asia/Bangkok", "exceptionLogging": "STACKDRIVER", "runtimeVersion": "V8",
 *   "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
 *   "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" } }
 */
const SHEET = 'library', TRASH = 'deleted', FOLDER = 'UD Survey Images';
const SHEET_ID = '';   // ว่างไว้ได้: ใช้ชีตที่ setup() สร้าง (เก็บ id ใน Script properties)
const HEAD = ['key', 'name', 'unit', 'quotes', 'reason', 'updated', 'project', 'by', 'imgs', 'ref', 'aliases'];   // ref = รหัสพาณิชย์/รหัสแถวมาตรฐาน · aliases = ชื่ออื่นที่ผูกไว้
const IMG_MAX = 2.8e6, IMG_PER_PUT = 10, IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FAIL_MAX = 20, FAIL_WIN = 600;   // เดาผิดได้ 20 ครั้ง / 10 นาที

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() {
  const id = SHEET_ID || props_().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function tab_(name) {
  const ss = ss_(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(name === TRASH ? HEAD.concat(['deleted_at']) : HEAD); sh.setFrozenRows(1); sh.getRange('A:L').setNumberFormat('@'); }
  else if (name === SHEET && sh.getLastColumn() < HEAD.length) { sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); sh.getRange('A:K').setNumberFormat('@'); }   // เพิ่มคอลัมน์ใหม่ให้ชีตเดิม
  return sh;
}
function folder_() {
  const id = props_().getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* สร้างใหม่ */ } }
  const it = DriveApp.getFoldersByName(FOLDER);   // โฟลเดอร์เดิมที่สคริปต์นี้สร้างไว้
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); props_().setProperty('FOLDER_ID', f.getId()); return f;
}
/** รันในตัวแก้ไข (▷ เรียกใช้ setup): สร้างชีต/โฟลเดอร์ + ปิดแชร์ภาพเดิม — รันซ้ำได้ */
function setup() {
  let ss = null; try { ss = ss_(); } catch (e) { ss = null; }
  if (!ss) { ss = SpreadsheetApp.create('UD คลังราคาสืบ'); props_().setProperty('SHEET_ID', ss.getId()); }
  tab_(SHEET).getRange('A:I').setNumberFormat('@'); tab_(TRASH);
  const fd = folder_(), it = fd.getFiles(); let n = 0;
  while (it.hasNext()) { const f = it.next(); if (f.getSharingAccess() !== DriveApp.Access.PRIVATE) { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); n++; } }
  const k = props_().getProperty('TEAM_KEY') || '';
  Logger.log('ชีตคลัง: ' + ss.getUrl() + ' · ปิดแชร์ภาพ ' + n + ' ไฟล์' + (k.length < 12 ? ' · คำเตือน: TEAM_KEY ควรยาวอย่างน้อย 12 ตัว' : ''));
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
/** กันข้อความกลายเป็นสูตรในชีต (= + - @) */
function txt_(v) { const s = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
function rows_(sh) {
  const v = (sh || tab_(SHEET)).getDataRange().getValues(); v.shift();
  const un = s => String(s).replace(/^'/, '');
  return v.map((r, i) => ({ row: i + 2, r })).filter(x => x.r[0]).map(({ row, r }) => ({ row, key: un(r[0]), name: un(r[1]), unit: un(r[2]), quotes: JSON.parse(r[3] || '[]'), reason: un(r[4]), updated: un(r[5]), project: un(r[6]), by: un(r[7]), imgs: JSON.parse(r[8] || '{}'), ref: un(r[9] || ''), aliases: JSON.parse(r[10] || '[]') }));
}
function same_(a, b) {   // เทียบแบบเวลาคงที่
  a = String(a); b = String(b); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function auth_(team) {
  const c = CacheService.getScriptCache(), fails = +(c.get('fails') || 0);
  if (fails >= FAIL_MAX) return 'ใส่รหัสผิดหลายครั้ง ปิดรับชั่วคราว 10 นาที';
  const key = props_().getProperty('TEAM_KEY');
  if (key && team && same_(team, key)) return '';
  c.put('fails', String(fails + 1), FAIL_WIN);
  return 'รหัสทีมไม่ถูกต้อง';
}

function doGet() { return out_({ ok: true, app: 'ud-survey-lib', note: 'ใช้ POST พร้อมรหัสทีม' }); }

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'คำขอไม่ถูกต้อง' }); }
  const bad = auth_(b.team); if (bad) return out_({ ok: false, error: bad, auth: true });
  try {
    if (b.action === 'ping') return out_({ ok: true, name: ss_().getName() });
    if (b.action === 'list') return out_({ ok: true, items: rows_().map(x => { delete x.row; return x; }) });
    if (b.action === 'img') {   // คืนภาพเป็น data URL — เฉพาะไฟล์ในโฟลเดอร์คลัง
      const f = DriveApp.getFileById(String(b.file)), fid = folder_().getId();
      let inLib = false; const ps = f.getParents(); while (ps.hasNext()) if (ps.next().getId() === fid) inLib = true;
      if (!inLib) return out_({ ok: false, error: 'ไม่ใช่ภาพในคลัง' });
      return out_({ ok: true, data: 'data:' + f.getMimeType() + ';base64,' + Utilities.base64Encode(f.getBlob().getBytes()) });
    }
    if (['put', 'del', 'alias'].indexOf(b.action) < 0) return out_({ ok: false, error: 'unknown action' });
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = tab_(SHEET), cur = rows_(sh).find(x => x.key === b.key);
      if (b.action === 'del') {   // ย้ายไปชีต deleted (กู้คืนได้)
        if (cur) { const r = sh.getRange(cur.row, 1, 1, HEAD.length).getValues()[0]; tab_(TRASH).appendRow(r.concat([new Date().toISOString()])); sh.deleteRow(cur.row); }
        return out_({ ok: true });
      }
      if (b.action === 'alias') {   // จำชื่ออื่นของรายการ (ไม่เปลี่ยนวันที่สืบ)
        if (!cur) return out_({ ok: false, error: 'ไม่พบรายการในคลัง' });
        const al = String(b.alias || '').slice(0, 300); if (!al) return out_({ ok: false, error: 'alias ว่าง' });
        const list = cur.aliases.indexOf(al) < 0 ? cur.aliases.concat([al]).slice(-50) : cur.aliases;
        sh.getRange(cur.row, 11).setValue(JSON.stringify(list)); return out_({ ok: true, aliases: list });
      }
      const it = b.item || {};
      if (!b.key || String(b.key).length > 300) return out_({ ok: false, error: 'key ไม่ถูกต้อง' });
      if (cur && cur.updated && it.updated && String(cur.updated) > String(it.updated)) return out_({ ok: false, error: 'คลังมีข้อมูลใหม่กว่า', item: cur });
      const add = Object.keys(b.imgs || {}).filter(id => !(cur && cur.imgs[id]));
      if (add.length > IMG_PER_PUT) return out_({ ok: false, error: 'ภาพเกิน ' + IMG_PER_PUT + ' ภาพต่อครั้ง' });
      const imgs = cur ? cur.imgs : {}, fd = add.length ? folder_() : null;
      for (const id of add) {
        const m = String(b.imgs[id]).match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
        if (!m || IMG_TYPES.indexOf(m[1]) < 0) return out_({ ok: false, error: 'รับเฉพาะภาพ JPEG/PNG/WebP' });
        if (m[2].length > IMG_MAX) return out_({ ok: false, error: 'ภาพใหญ่เกิน 2 MB' });
        if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) return out_({ ok: false, error: 'id ภาพไม่ถูกต้อง' });
        imgs[id] = fd.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], id + '.jpg')).getId();   // ไม่แชร์ลิงก์ (ส่วนตัว)
      }
      const row = [txt_(b.key), txt_(it.name), txt_(it.unit), JSON.stringify(it.quotes || []), txt_(it.reason), txt_(it.updated || new Date().toISOString()), txt_(it.project), txt_(it.by), JSON.stringify(imgs), txt_(String(it.ref || '').slice(0, 120)), JSON.stringify(Array.from(new Set((cur ? cur.aliases : []).concat(Array.isArray(it.aliases) ? it.aliases.map(a => String(a).slice(0, 300)) : []))).slice(-50))];
      if (cur) sh.getRange(cur.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
      return out_({ ok: true, imgs });
    } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}
