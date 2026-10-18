/**
 * UD Total Station — คลังราคาสืบกลาง (Google Apps Script Web App)
 * ข้อมูลราคาสืบเก็บในชีต "library" ของสเปรดชีตนี้ · ภาพหลักฐานเก็บในโฟลเดอร์ Drive "UD Survey Images"
 * อ่าน: ทุกคน · เขียน/ลบ: ต้องมีรหัสทีม (ตั้งใน Project Settings → Script properties: TEAM_KEY)
 *
 * วิธีติดตั้ง (ครั้งเดียว):
 *  1) สร้าง Google Sheet ใหม่ ชื่อ "UD คลังราคาสืบ" → Extensions → Apps Script → วางไฟล์นี้แทนโค้ดเดิม → Save
 *  2) Project Settings → Script properties → Add: TEAM_KEY = <รหัสทีม>
 *  3) Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → Deploy → อนุญาตสิทธิ์ → คัดลอก Web app URL
 *  4) เอา URL ใส่ในเว็บ (แท็บราคาสืบ → ตั้งค่าคลังกลาง) หรือส่งให้ผู้ดูแลใส่ใน lib/version.js (LIB_URL)
 *
 * เว็บเรียกแบบ text/plain (ไม่มี preflight) — doGet: list / img · doPost: put / del
 */
const SHEET = 'library', FOLDER = 'UD Survey Images';
const HEAD = ['key', 'name', 'unit', 'quotes', 'reason', 'updated', 'project', 'by', 'imgs'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEAD); sh.setFrozenRows(1); }
  return sh;
}
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rows_() {
  const v = sheet_().getDataRange().getValues(); v.shift();
  return v.filter(r => r[0]).map((r, i) => ({ row: i + 2, key: r[0], name: r[1], unit: r[2], quotes: JSON.parse(r[3] || '[]'), reason: r[4], updated: r[5], project: r[6], by: r[7], imgs: JSON.parse(r[8] || '{}') }));
}

function doGet(e) {
  const a = (e.parameter.action || 'list');
  try {
    if (a === 'list') return out_({ ok: true, items: rows_().map(x => { delete x.row; return x; }) });
    if (a === 'img') {   // คืนภาพเป็น data URL (ให้เว็บเก็บลงไฟล์โครงการได้)
      const f = DriveApp.getFileById(e.parameter.file), fid = folder_().getId();
      let inLib = false; const ps = f.getParents(); while (ps.hasNext()) if (ps.next().getId() === fid) inLib = true;
      if (!inLib) return out_({ ok: false, error: 'ไม่ใช่ภาพในคลัง' });   // อ่านได้เฉพาะภาพในโฟลเดอร์คลัง
      return out_({ ok: true, data: 'data:' + f.getMimeType() + ';base64,' + Utilities.base64Encode(f.getBlob().getBytes()) });
    }
    if (a === 'ping') return out_({ ok: true, name: SpreadsheetApp.getActiveSpreadsheet().getName() });
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const b = JSON.parse(e.postData.contents);
    const key = PropertiesService.getScriptProperties().getProperty('TEAM_KEY');
    if (!key || b.team !== key) return out_({ ok: false, error: 'รหัสทีมไม่ถูกต้อง' });
    const sh = sheet_(), all = rows_(), cur = all.find(x => x.key === b.key);
    if (b.action === 'del') { if (cur) sh.deleteRow(cur.row); return out_({ ok: true }); }
    if (b.action !== 'put') return out_({ ok: false, error: 'unknown action' });
    const it = b.item;
    if (cur && cur.updated && it.updated && String(cur.updated) > String(it.updated)) return out_({ ok: false, error: 'คลังมีข้อมูลใหม่กว่า', item: cur });
    // ภาพ: id ภาพในเว็บ → ไฟล์ใน Drive (อัปโหลดเฉพาะที่ยังไม่มี)
    const imgs = cur ? cur.imgs : {}, fd = folder_();
    Object.keys(b.imgs || {}).forEach(id => {
      if (imgs[id]) return;
      const m = String(b.imgs[id]).match(/^data:(.+?);base64,(.*)$/); if (!m) return;
      const f = fd.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], id + '.jpg'));
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imgs[id] = f.getId();
    });
    const row = [b.key, it.name, it.unit, JSON.stringify(it.quotes || []), it.reason || '', it.updated || new Date().toISOString(), it.project || '', it.by || '', JSON.stringify(imgs)];
    if (cur) sh.getRange(cur.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    return out_({ ok: true, imgs });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}
