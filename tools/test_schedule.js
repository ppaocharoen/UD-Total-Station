// ทดสอบ lib/schedule.js กับอาคารตัวอย่าง — รัน: node tools/test_schedule.js
const S = require('../lib/schedule.js');
const m = require('../examples/sample-building.bm.json');
let ok = true;
const check = (name, good, extra = '') => { ok = ok && !!good; console.log((good ? 'PASS ' : 'FAIL ') + name + ' ' + extra); };
const rows = m.quantities.items.map(r => Object.assign({}, r, { total: Math.round(r.qty * 137.31 * 100) / 100 }));
const sum = rows.reduce((a, r) => a + r.total, 0);
const p = S.build(rows, m, { start: '2026-11-02', workdays: [1, 2, 3, 4, 5, 6] });
const T = Object.fromEntries(p.tasks.map(t => [t.id, t]));
check('ค่างานกระจายครบ', Math.abs(p.total - sum) < 0.01, `${p.total} / ${sum.toFixed(2)}`);
check('ผลรวม % งาน ≈ 100', Math.abs(p.tasks.reduce((a, t) => a + t.pct, 0) - 100) < 0.1);
check('S-Curve จบที่ 100%', Math.abs(p.curve[p.curve.length - 1].pct - 100) < 1e-6);
check('S-Curve ไม่ลดลง', p.curve.every((c, i) => !i || c.pct >= p.curve[i - 1].pct - 1e-9));
const after = (a, b) => T[a].es >= T[b].ef;
check('ลำดับ: ฐานราก → 1F → ROOF → โครงหลังคา → มุง → ผนัง',
  after('footing', 'prep') && after('lift:1F', 'footing') && after('lift:ROOF', 'lift:1F') && after('roof_frame', 'lift:ROOF') && after('roof_cover', 'roof_frame') && after('wall', 'roof_cover'));
check('ทาสีหลังฝ้า/พื้น/ประตูหน้าต่าง', after('paint', 'ceiling') && after('paint', 'finish') && after('paint', 'opening'));
check('ระยะเวลาโครงสร้าง 1F = 5.14/1.8+6 → 9 วัน', T['lift:1F'].days === 9, T['lift:1F'].why);
check('ไม่เริ่มงานวันอาทิตย์', p.tasks.every(t => S.parse(t.start).getDay() !== 0));
check('ระยะสัญญานับวันปฏิทิน', p.calDays === Math.round((S.parse(p.finish) - S.parse(p.start)) / 864e5) + 1, `${p.calDays} วัน`);
// วันหยุดเลื่อนวันเสร็จ
const p2 = S.build(rows, m, { start: '2026-11-02', holidays: ['2026-11-03', '2026-11-04'] });
check('วันหยุด 2 วันเลื่อนแผน 2 วัน', p2.calDays === p.calDays + 2, `${p2.calDays}`);
// แก้ระยะเวลาเอง
const p3 = S.build(rows, m, { start: '2026-11-02', durations: { wall: 10 } });
check('แก้ระยะเวลาผนังเป็น 10 วัน', p3.tasks.find(t => t.id === 'wall').days === 10 && p3.tasks.find(t => t.id === 'wall').manual);
// งวดงาน
const I = S.installments(p, { n: 4, advance: 15, retention: 10 }, 1234567.89);
const amt = I.list.reduce((a, g) => a + g.amount, 0);
check('เงินงวดรวม = มูลค่าสัญญา', Math.abs(amt - 1234567.89) < 0.005, amt.toFixed(2));
check('% งวดรวม 100', Math.abs(I.list[I.list.length - 1].cumPct - 100) < 1e-9);
check('ทุกงานอยู่ในงวด', p.tasks.every(t => I.assign[t.id] >= 1 && I.assign[t.id] <= 4));
check('สุทธิ = เงินงวด − ล่วงหน้า − ประกัน', I.list.every(g => Math.abs(g.net - (g.amount - g.advance - g.retention)) < 0.005));
check('งวดสุดท้ายครบกำหนดวันเสร็จโครงการ', I.list[3].due === p.finish);
const I2 = S.installments(p, { n: 4, mode: 'manual', assign: Object.assign({}, I.assign, { roof_cover: 4 }) }, 1000000);
check('กำหนดงวดเอง (มุงหลังคา → งวด 4)', I2.list[3].tasks.includes('roof_cover') && !I2.list[2].tasks.includes('roof_cover'));
console.log(ok ? '\nทั้งหมดผ่าน' : '\nมีที่ไม่ผ่าน');
process.exit(ok ? 0 : 1);
