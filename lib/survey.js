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
  // ---------------------------------------------------------------- คลังกลาง (Google Sheet ผ่าน Apps Script — tools/survey_lib.gs)
  // ตั้งค่าเก็บในเบราว์เซอร์: {url, team} · ไม่ตั้ง = ใช้คลังในเครื่อง (IndexedDB)
  const CFG_KEY = 'udts:lib';
  function cfg() { let c = {}; try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { /* */ } if (!c.url && root_lib()) c.url = root_lib(); return c; }
  function root_lib() { try { return (typeof UD_VERSION !== 'undefined' && UD_VERSION.LIB_URL) || ''; } catch (e) { return ''; } }
  function setCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* */ } }
  const remote = () => !!cfg().url;
  async function rget(params) { const r = await fetch(cfg().url + '?' + new URLSearchParams(params), { redirect: 'follow' }); return r.json(); }
  async function rpost(body) { const r = await fetch(cfg().url, { method: 'POST', body: JSON.stringify(Object.assign({ team: cfg().team || '' }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' }); return r.json(); }
  let cache = null;
  async function remoteAll(force) {
    if (cache && !force && Date.now() - cache.t < 60000) return cache.items;
    const d = await rget({ action: 'list' }); if (!d.ok) throw new Error(d.error || 'อ่านคลังกลางไม่ได้');
    cache = { t: Date.now(), items: d.items }; return d.items;
  }
  async function remotePut(key, val) {
    const all = await remoteAll().catch(() => []), cur = all.find(x => x.key === key), have = (cur && cur.imgs) || {};
    const imgs = {}; Object.entries(val.imgs || {}).forEach(([id, d]) => { if (!have[id]) imgs[id] = d; });   // ส่งเฉพาะภาพที่คลังยังไม่มี
    const item = Object.assign({}, val); delete item.imgs; delete item.key;
    const r = await rpost({ action: 'put', key, item, imgs });
    if (!r.ok) throw new Error(r.error);
    if (cache) { const i = cache.items.findIndex(x => x.key === key), v = Object.assign({ key }, item, { imgs: r.imgs }); if (i >= 0) cache.items[i] = v; else cache.items.push(v); }
    return r;
  }
  /** ภาพจากคลัง: ในเครื่องเป็น data URL อยู่แล้ว · คลังกลางเป็น id ไฟล์ Drive → ดึงผ่านสคริปต์ */
  async function libImg(v) { if (String(v).startsWith('data:')) return v; const d = await rget({ action: 'img', file: v }); return d.ok ? d.data : null; }
  async function ping(c) { const r = await fetch(c.url + '?action=ping', { redirect: 'follow' }); return r.json(); }

  const imgPut = (id, data) => op('img', 'readwrite', s => s.put(data, id)).catch(() => null);
  const imgGet = id => op('img', 'readonly', s => s.get(id)).catch(() => null);
  const localPut = (key, val) => op('lib', 'readwrite', s => s.put(val, key)).catch(() => null);
  const localGet = key => op('lib', 'readonly', s => s.get(key)).catch(() => null);
  const localAll = () => op('lib', 'readonly', s => s.getAll()).catch(() => []);
  // คลังกลางถ้าตั้งไว้ (เก็บสำรองในเครื่องด้วย) · ไม่ได้ตั้ง = ในเครื่อง
  async function libPut(key, val) { await localPut(key, val); if (remote()) return remotePut(key, val); }
  async function libGet(key) { if (remote()) { const a = await remoteAll().catch(() => null); if (a) return a.find(x => x.key === key) || null; } return localGet(key); }
  async function libAll(force) { if (remote()) { try { return await remoteAll(force); } catch (e) { /* ออฟไลน์ → ในเครื่อง */ } } return localAll(); }
  const libDel = key => op('lib', 'readwrite', s => s.delete(key)).catch(() => null);

  /** หาในคลังด้วยชื่อ+หน่วยตรงกัน ถ้าไม่เจอ ใช้คำร่วมของชื่อ (หน่วยต้องตรง) */
  function libMatch(all, name, unit) {
    const k = libKey(name, unit), exact = all.find(x => x.key === k);
    if (exact) return [exact];
    const words = norm(name).split(/[\s()]+/).filter(w => w.length >= 3);
    return all.filter(x => norm(x.unit) === norm(unit) && words.filter(w => norm(x.name).includes(w)).length >= Math.min(2, words.length))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 5);
  }

  return { cfg, setCfg, remote, ping, libImg, localAll, VAT, MIN_Q, CHANNEL, uid, unitPrice, summary, srcText, compress, libKey, libMatch, ageDays, imgPut, imgGet, libPut, libGet, libAll, libDel, r2 };
});
