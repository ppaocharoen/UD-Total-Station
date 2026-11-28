// ทดสอบ lib/dsggroup.js (M4b 28 พ.ย. 2569) — รัน: node tools/test_dsggroup.js
const G = require('../lib/dsggroup.js');
let ok = true, n = 0;
const check = (name, good, extra = '') => { n++; ok = ok && !!good; if (!good) console.log('FAIL ' + name + ' ' + extra); };
// ชิ้นสมมติ: need = เหล็กที่ต้องการ · แบบ cand = {As} ผ่านเมื่อ As ≥ need
const need = { a: 4, b: 4, c: 6, d: 8, e: 8, f: 12, g: 20 };
const items = Object.entries(need).map(([id, v]) => ({ id, cat: 'C', size: '20×20', mark: '', score: v, cand: { As: v } }));
const chk = (id, c) => ({ ok: c.As >= need[id] - 1e-9, ratio: need[id] / c.As });
let g = G.group(items, chk, { maxTypes: 3 });
check('ไม่เกิน 3 ชนิด', g.length === 3, g.length);
check('ทุกชิ้นผ่านเหล็กของชนิด', g.every(x => !x.fails.length));
check('ครบทุกชิ้นไม่ซ้ำ', g.flatMap(x => x.ids).sort().join() === Object.keys(need).sort().join());
check('ชื่อ C1–C3 เรียงตามเหล็ก', g.map(x => x.name).join() === 'C1,C2,C3' && g[0].cand.As < g[1].cand.As && g[1].cand.As < g[2].cand.As, JSON.stringify(g.map(x => [x.name, x.cand.As])));
// เผื่อรวมน้อยสุด: ระดับ 4,4,6,8,8,12,20 → ตัด {4,4,6,8,8} {12} {20}? เทียบทุกทางเลือก
const over = gs => gs.reduce((s, x) => s + x.ids.reduce((t, id) => t + x.cand.As - need[id], 0), 0);
const best = (() => { const lv = [4, 6, 8, 12, 20]; let b = Infinity; for (let i = 1; i < lv.length; i++) for (let j = i + 1; j < lv.length; j++) {
  const segs = [lv.slice(0, i), lv.slice(i, j), lv.slice(j)]; let s = 0; for (const seg of segs) { const mx = Math.max(...seg); for (const v of Object.values(need)) if (seg.includes(v)) s += mx - v; } b = Math.min(b, s); } return b; })();
check('เผื่อรวมน้อยสุด', Math.abs(over(g) - best) < 1e-9, `${over(g)} vs ${best}`);
check('ระดับเหล็กน้อยกว่า maxTypes = ชนิดละระดับ', G.group(items.slice(0, 3), chk, { maxTypes: 3 }).length === 2);
// ชื่อในแบบ (mark) เป็นกลุ่ม · ชิ้นในชนิดไม่ผ่าน → fails
const im = items.map(x => Object.assign({}, x, { mark: x.score >= 12 ? 'C9' : '' }));
g = G.group(im, chk, { maxTypes: 2 });
const c9 = g.find(x => x.name === 'C9');
check('ชนิดตามแบบ C9 = f,g', c9 && c9.fromMark && c9.ids.join() === 'f,g' && c9.cand.As === 20, JSON.stringify(c9));
check('ชื่ออัตโนมัติไม่ชนชื่อในแบบ', g.filter(x => !x.fromMark).every(x => x.name !== 'C9') && g.length === 3, JSON.stringify(g.map(x => x.name)));
// ย้ายเอง (assign)
g = G.group(items, chk, { maxTypes: 3, assign: { a: 'C20', g: 'C20' } });
const c20 = g.find(x => x.name === 'C20');
check('ย้ายเอง: a,g อยู่ C20 ใช้เหล็กของ g', c20 && c20.ids.join() === 'a,g' && c20.cand.As === 20);
// แบบที่ผ่านทุกชิ้นไม่ใช่ตัวเหล็กมากสุดเสมอ (ทิศเหล็ก): x ต้องการทิศ X, y ต้องการทิศ Y → ไม่มีแบบเดียวผ่าน → fails
const dir = [{ id: 'x', cat: 'C', size: 's', score: 5, cand: { As: 5, d: 'X' } }, { id: 'y', cat: 'C', size: 's', score: 6, cand: { As: 6, d: 'Y' } }];
g = G.group(dir, (id, c) => ({ ok: c.d === id.toUpperCase(), ratio: 1 }), { maxTypes: 1 });
check('ไม่มีแบบผ่านทุกชิ้น → ใช้เหล็กมากสุด + รายชื่อไม่ผ่าน', g.length === 1 && g[0].cand.d === 'Y' && g[0].fails.join() === 'x', JSON.stringify(g));
// หมวดต่างกันไม่ปนกัน
g = G.group([{ id: 'p', cat: 'PD', size: '30×30', score: 3, cand: { As: 3 } }, { id: 'q', cat: 'C', size: '30×30', score: 3, cand: { As: 3 } }], (id, c) => ({ ok: true, ratio: 1 }));
check('PD กับ C แยกกลุ่ม', g.length === 2 && g.some(x => x.name === 'PD1') && g.some(x => x.name === 'C1'));
console.log(ok ? `PASS dsggroup ${n} ข้อ` : 'FAIL'); process.exit(ok ? 0 : 1);
