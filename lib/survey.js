/* UD Survey — ราคาสืบ (ตกลงกับ Earth 18 ต.ค. 2569)
 * วัสดุ 1 รายการ สืบหลายเจ้า (ปกติ 3) เลือกเจ้าที่ต่ำสุด; ราคาที่รวม VAT ให้หัก VAT (÷ 1.07); แปลงหน่วยร้านเป็นหน่วยใน ปร. ด้วยตัวคูณ
 * หลักฐาน: ลิงก์ / เบอร์โทร / ไลน์ / ใบเสนอราคา + ภาพแคปหน้าจอ (ย่อเป็น JPEG แล้วเก็บใน .boq.json)
 *
 * item  = { id, name, unit, target: 'row:<key>' | 'sub:<code>' | 'manual', quotes: [quote], reason, updated }
 * quote = { id, channel: 'web'|'phone'|'line'|'quote'|'store', shop, contact, date, price, qunit, factor, vat, note, imgs: [imgId] }
 *   factor = จำนวนหน่วย ปร. ต่อ 1 หน่วยที่ร้านขาย (เช่น 1 กล่อง = 1.44 ตร.ม. → factor 1.44)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Survey = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VAT = 0.07, MIN_Q = 3;
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const CHANNEL = { web: 'เว็บไซต์', phone: 'โทรสืบ', line: 'ไลน์', quote: 'ใบเสนอราคา', store: 'หน้าร้าน' };
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** ราคาต่อหน่วย ปร. ไม่รวม VAT ของเจ้าหนึ่ง (null ถ้ายังไม่ครบ) */
  function unitPrice(q) {
    const p = +q.price, f = +(q.factor || 1);
    if (!(p > 0) || !(f > 0)) return null;
    return r2((q.vat ? p / (1 + VAT) : p) / f);
  }
  /** สรุปรายการ: ราคาที่ใช้ (ต่ำสุด), จำนวนเจ้า, เจ้าที่เลือก, สถานะ */
  function summary(item) {
    const list = (item.quotes || []).map(q => ({ q, up: unitPrice(q) })).filter(x => x.up !== null);
    if (!list.length) return { price: null, n: 0, best: null, status: 'none', list };
    const best = list.reduce((a, b) => (b.up < a.up ? b : a));
    return { price: best.up, n: list.length, best: best.q, status: list.length >= MIN_Q ? 'ok' : 'few', list };
  }
  function srcText(item) {
    const s = summary(item); if (s.price === null) return '';
    return `ราคาสืบ ต่ำสุดจาก ${s.n} เจ้า: ${s.best.shop || CHANNEL[s.best.channel] || ''}${s.best.date ? ' (' + s.best.date + ')' : ''}`;
  }
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const libKey = (name, unit) => norm(name) + '|' + norm(unit);
  const ageDays = d => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null);

  // ---------------------------------------------------------------- ย่อภาพ (เบราว์เซอร์)
  function compress(file, maxSide = 1600, q = 0.72) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', q));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------- IndexedDB: ภาพ (สำรองอัตโนมัติ) และคลังราคาสืบ (ใช้ข้ามโครงการ)
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('ไม่มี IndexedDB'));
      const r = indexedDB.open('ud-survey', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('img'); r.result.createObjectStore('lib'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function op(store, mode, fn) {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
  }
  const imgPut = (id, data) => op('img', 'readwrite', s => s.put(data, id)).catch(() => null);
  const imgGet = id => op('img', 'readonly', s => s.get(id)).catch(() => null);
  const libPut = (key, val) => op('lib', 'readwrite', s => s.put(val, key)).catch(() => null);
  const libGet = key => op('lib', 'readonly', s => s.get(key)).catch(() => null);
  const libAll = () => op('lib', 'readonly', s => s.getAll()).catch(() => []);
  const libDel = key => op('lib', 'readwrite', s => s.delete(key)).catch(() => null);

  /** หาในคลังด้วยชื่อ+หน่วยตรงกัน ถ้าไม่เจอ ใช้คำร่วมของชื่อ (หน่วยต้องตรง) */
  function libMatch(all, name, unit) {
    const k = libKey(name, unit), exact = all.find(x => x.key === k);
    if (exact) return [exact];
    const words = norm(name).split(/[\s()]+/).filter(w => w.length >= 3);
    return all.filter(x => norm(x.unit) === norm(unit) && words.filter(w => norm(x.name).includes(w)).length >= Math.min(2, words.length))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 5);
  }

  return { VAT, MIN_Q, CHANNEL, uid, unitPrice, summary, srcText, compress, libKey, libMatch, ageDays, imgPut, imgGet, libPut, libGet, libAll, libDel, r2 };
});
