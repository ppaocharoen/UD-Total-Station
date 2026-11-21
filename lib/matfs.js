/* UD Total Station — คลังวัสดุกลาง (Firestore คอลเลกชัน `materials`) · ใช้แอป Firebase เดียวกับ lib/auth.js (ล็อกอิน/รายชื่อผู้ใช้ชุดเดียวกับ UD Cost Hub)
 * สิทธิ์ (กฎ Firestore — ดู tools/firestore_materials.rules): ผู้ที่ได้รับอนุมัติทุกคนอ่าน/สร้างได้ · แก้/ลบ = ผู้สร้าง หรือผู้ดูแลระบบ (Earth 21 พ.ย. 2569)
 * ใช้: window.UDMatFS.list() / put(วัสดุ) → id / del(id) / who() → {uid, admin} — ต้องโหลดหลัง lib/auth.js (type=module ทำงานตามลำดับในหน้า)
 */
import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = () => { if (!getApps().length) throw new Error('ยังไม่ได้เชื่อมระบบล็อกอิน'); return getApp(); };
const user = () => { const u = getAuth(app()).currentUser; if (!u) throw new Error('ยังไม่ได้ล็อกอิน'); return u; };
const ERR = { 'permission-denied': 'ไม่มีสิทธิ์ (บัญชียังไม่ได้รับอนุมัติ หรือไม่ใช่ผู้สร้างวัสดุนี้)', 'unavailable': 'ติดต่อคลังวัสดุไม่ได้ (ออฟไลน์?)' };
const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { throw new Error(ERR[e && e.code] || (e && e.message) || String(e)); } };
const FIELDS = ['name', 'cls', 'kinds', 'spec', 'look', 'sug', 'by', 'byName', 'at'];

window.UDMatFS = {
  list: wrap(async () => { user(); const s = await getDocs(collection(getFirestore(app()), 'materials')); return s.docs.map(d => Object.assign({}, d.data(), { id: d.id })); }),
  /** บันทึก (สร้างใหม่ถ้าไม่มี id) — by = ผู้สร้างเดิม (แก้ของคนอื่นได้เฉพาะผู้ดูแลระบบ ตามกฎ) */
  put: wrap(async m => {
    const u = user(), id = m.id || ('M-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const v = {}; FIELDS.forEach(k => { if (m[k] !== undefined) v[k] = m[k]; });
    v.by = m.by || u.uid; v.byName = m.byName || u.displayName || u.email || ''; v.at = Date.now();
    await setDoc(doc(getFirestore(app()), 'materials', id), v);
    return Object.assign({}, v, { id });
  }),
  del: wrap(async id => { user(); await deleteDoc(doc(getFirestore(app()), 'materials', id)); }),
  who() { try { const u = getAuth(app()).currentUser; return u ? { uid: u.uid, name: u.displayName || u.email || '' } : null; } catch (e) { return null; } },
};
window.dispatchEvent(new Event('udmatfs'));
