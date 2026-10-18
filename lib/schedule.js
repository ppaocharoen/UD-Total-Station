/* UD Schedule — แผนงานก่อสร้างจากรายการ BOQ ที่คิดราคาแล้ว
 * ใช้ by_task ของแต่ละรายการ (จาก tools/takeoff.py) กระจายปริมาณ/ต้นทุนลงงาน
 * ระยะเวลาคิดเป็นวันทำงาน แล้วแปลงเป็นวันที่ตามปฏิทิน (ระยะสัญญานับวันปฏิทิน)
 * อัตราผลงานเริ่มต้นยกจาก phiso-house-3d (references/boq-method.md) ผู้ใช้กำหนดวันเองได้ทุกงาน
 *
 * Schedule.build(rows, model, cfg) → { tasks, days, curve, finish, calDays, total }
 * Schedule.installments(plan, cfg, contract) → { list, warns }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Schedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LABEL = {
    prep: 'งานเตรียมการ / รื้อถอน', footing: 'งานฐานราก (ขุด เข็ม ฐาน)', roof_frame: 'งานโครงหลังคาเหล็ก',
    roof_cover: 'งานมุงหลังคา', wall: 'งานก่อผนัง เสาเอ็น-ทับหลัง', mep_rough: 'งานเดินท่อร้อยสาย / ท่อฝัง',
    plaster: 'งานฉาบปูน', ceiling: 'งานฝ้าเพดาน', opening: 'งานประตู-หน้าต่าง', finish: 'งานวัสดุปูพื้น / บุผนัง',
    paint: 'งานทาสี', mep_fix: 'งานติดตั้งดวงโคม สุขภัณฑ์ อุปกรณ์', mep_ext: 'งานระบบภายนอก (ถังบำบัด ท่อภายนอก)',
    other: 'งานอื่น ๆ', handover: 'งานทำความสะอาด / ส่งมอบ',
  };
  const COLOR = {   // โทนจอฟอสฟอร์ (เขียว/ฟ้า/อำพัน)
    prep: '#3b7a57', footing: '#4fae78', lift: '#00ff41', roof_frame: '#c9a227', roof_cover: '#ffb000',
    wall: '#c6ff00', mep_rough: '#18ffff', plaster: '#9fd8ae', ceiling: '#d8ffe0', opening: '#18c9c9',
    finish: '#b388ff', paint: '#ff6ec7', mep_fix: '#64ffda', mep_ext: '#26c6da', other: '#8a9a92', handover: '#ffd740',
  };
  const kind = t => (t.startsWith('lift:') ? 'lift' : t);
  const label = (t, levels) => t.startsWith('lift:') ? `งานโครงสร้าง คสล. ระดับ ${t.slice(5)}${levels && levels[t.slice(5)] !== undefined ? ` (${levels[t.slice(5)] >= 0 ? '+' : ''}${levels[t.slice(5)].toFixed(2)})` : ''} — เสา คาน พื้น` : (LABEL[t] || t);
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

  // ------------------------------------------------------------ ปฏิทิน
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayDiff = (a, b) => Math.round((parse(iso(b)) - parse(iso(a))) / 864e5);
  function nextMonday(from) { const d = new Date(from); d.setHours(0, 0, 0, 0); const k = (8 - d.getDay()) % 7 || 7; return addDays(d, k); }
  class Calendar {
    constructor(start, workdays, holidays) { this.start = start; this.wd = new Set(workdays); this.hol = new Set(holidays || []); this.c = []; }
    date(i) {   // วันทำงานที่ i (เริ่ม 0)
      let d = this.c.length ? addDays(this.c[this.c.length - 1], 1) : new Date(this.start);
      while (this.c.length <= i) {
        while (!this.wd.has(d.getDay()) || this.hol.has(iso(d))) d = addDays(d, 1);
        this.c.push(d); d = addDays(d, 1);
      }
      return this.c[i];
    }
  }

  // ------------------------------------------------------------ ตัวขับระยะเวลา
  function drivers(rows) {
    const D = {};
    const add = (t, k, v) => { (D[t] = D[t] || {})[k] = (D[t][k] || 0) + v; };
    for (const r of rows) {
      const parts = r.by_task || { [r.task || 'other']: { share: 1 } };
      for (const [t, p] of Object.entries(parts)) {
        const q = (+r.qty || 0) * p.share;
        if (/^conc_/.test(r.key) || r.key === 'lean_conc') add(t, 'conc', q);
        else if (/^steel_/.test(r.key)) add(t, 'steel', q);
        else if (/^cover_/.test(r.key)) add(t, 'cover', q);
        else if (/^wall_/.test(r.key)) add(t, 'wall', q);
        else if (/^plaster_/.test(r.key)) add(t, 'plaster', q);
        else if (/^paint_/.test(r.key)) add(t, 'paint', q);
        else if (/^fin_ceiling_/.test(r.key)) add(t, 'ceiling', q);
        else if (/^fin_/.test(r.key)) add(t, 'finish', q);
        else if (/^open_/.test(r.key)) add(t, 'open', q);
        else if (/^pt_|^panel/.test(r.key)) add(t, 'points', q);
        else if (/^fx_/.test(r.key)) add(t, 'fixtures', q);
        else if (/^pile_/.test(r.key) && r.unit === 'ต้น' && !/drive|cut/.test(r.key)) add(t, 'piles', q);
        else if (/^demo_/.test(r.key)) add(t, 'demo', q);
      }
    }
    return D;
  }
  // อัตราผลงาน (วันทำงาน) — ค่าตั้งต้นจาก phiso; คืน [วัน, คำอธิบาย]
  function autoDays(t, d) {
    d = d || {};
    const c = Math.ceil;
    switch (kind(t)) {
      case 'prep': return [Math.max(3, c((d.demo || 0) / 40) + 2), `${(d.demo || 0).toFixed(0)} หน่วยรื้อ ÷ 40 + 2 (ขั้นต่ำ 3)`];
      case 'footing': return [Math.max(5, c((d.piles || 0) / 10 + (d.conc || 0) / 2.5 + 4)), `เข็ม ${(d.piles || 0).toFixed(0)}/10 + คอนกรีต ${(d.conc || 0).toFixed(2)}/2.5 + 4`];
      case 'lift': return [Math.max(7, c((d.conc || 0) / 1.8 + 6)), `คอนกรีต ${(d.conc || 0).toFixed(2)} ลบ.ม. ÷ 1.8 + 6 (แบบ เหล็ก เท บ่ม)`];
      case 'roof_frame': return [Math.max(2, c((d.steel || 0) / 220 + 2)), `${(d.steel || 0).toFixed(0)} กก. ÷ 220 + 2`];
      case 'roof_cover': return [Math.max(1, c((d.cover || 0) / 40 + 1)), `${(d.cover || 0).toFixed(0)} ตร.ม. ÷ 40 + 1`];
      case 'wall': return [Math.max(2, c((d.wall || 0) / 18)), `${(d.wall || 0).toFixed(0)} ตร.ม. ÷ 18`];
      case 'plaster': return [Math.max(2, c((d.plaster || 0) / 30)), `${(d.plaster || 0).toFixed(0)} ตร.ม. ÷ 30`];
      case 'paint': return [Math.max(1, c((d.paint || 0) / 80)), `${(d.paint || 0).toFixed(0)} ตร.ม. ÷ 80`];
      case 'ceiling': return [Math.max(1, c((d.ceiling || 0) / 25)), `${(d.ceiling || 0).toFixed(0)} ตร.ม. ÷ 25`];
      case 'finish': return [Math.max(1, c((d.finish || 0) / 15)), `${(d.finish || 0).toFixed(0)} ตร.ม. ÷ 15`];
      case 'opening': return [Math.max(1, c((d.open || 0) / 4)), `${(d.open || 0).toFixed(0)} ชุด ÷ 4`];
      case 'mep_rough': return [Math.max(2, c((d.points || 0) / 10 + 2)), `${(d.points || 0).toFixed(0)} จุด ÷ 10 + 2`];
      case 'mep_fix': return [Math.max(1, c((d.points || 0) / 12 + (d.fixtures || 0) / 3 + 1)), `จุด ${(d.points || 0).toFixed(0)}/12 + สุขภัณฑ์ ${(d.fixtures || 0).toFixed(0)}/3 + 1`];
      case 'mep_ext': return [3, 'ค่าตั้งต้น 3 วัน'];
      case 'handover': return [3, 'ค่าตั้งต้น 3 วัน'];
      default: return [2, 'ค่าตั้งต้น 2 วัน'];
    }
  }

  // ลำดับงานและเงื่อนไขเริ่ม: [งาน, [[งานก่อนหน้า, สัดส่วนที่ต้องเสร็จ]]]
  function order(tasks, levels) {
    const lifts = tasks.filter(t => t.startsWith('lift:')).sort((a, b) => (levels[a.slice(5)] ?? 0) - (levels[b.slice(5)] ?? 0));
    const seq = ['prep', 'footing', ...lifts, 'roof_frame', 'roof_cover', 'wall', 'mep_ext', 'mep_rough', 'plaster',
      'ceiling', 'opening', 'finish', 'other', 'paint', 'mep_fix', 'handover'];
    const pre = { prep: [], footing: [['prep', 1]], roof_frame: [[lifts[lifts.length - 1] || 'footing', 1]],
      roof_cover: [['roof_frame', 1]], wall: [['roof_cover', 1]], mep_ext: [['wall', 0]], mep_rough: [['wall', 0.5]],
      plaster: [['wall', 1], ['mep_rough', 1]], ceiling: [['plaster', 1]], opening: [['plaster', 1]], finish: [['plaster', 1]],
      other: [['plaster', 1]], paint: [['ceiling', 1], ['opening', 1], ['finish', 1], ['other', 1]],
      mep_fix: [['paint', 1]], handover: [['mep_fix', 1], ['paint', 1], ['mep_ext', 1]] };
    lifts.forEach((t, i) => { pre[t] = [[i ? lifts[i - 1] : 'footing', 1]]; });
    return { seq: seq.filter(t => tasks.includes(t)), pre };
  }

  function build(rows, model, cfg) {
    cfg = cfg || {};
    const levels = {}; ((model && model.levels) || []).forEach(l => { levels[l.name] = l.z; });
    // ต้นทุนและชิ้นส่วนต่องาน
    const cost = {}, from = {};
    for (const r of rows) {
      const parts = r.by_task || { [r.task || 'other']: { share: 1, from: r.from || [] } };
      const sum = Object.values(parts).reduce((a, p) => a + p.share, 0) || 1;   // share ปัด 4 ตำแหน่ง → ปรับให้รวมครบ
      for (const [t0, p] of Object.entries(parts)) {
        const t = t0 === 'rebar' ? 'footing' : t0;
        cost[t] = (cost[t] || 0) + (+r.total || 0) * p.share / sum;
        (from[t] = from[t] || new Set()); (p.from || []).forEach(id => from[t].add(id));
      }
    }
    const names = Object.keys(cost).concat(['handover']);
    const { seq, pre } = order(names, levels);
    const D = drivers(rows);
    const dur = cfg.durations || {};
    const start = cfg.start ? parse(cfg.start) : nextMonday(new Date());
    const cal = new Calendar(start, cfg.workdays || [1, 2, 3, 4, 5, 6], cfg.holidays || []);
    const total = Object.values(cost).reduce((a, b) => a + b, 0);
    const T = {};
    for (const t of seq) {
      const [auto, why] = autoDays(t, D[t]);
      const days = Math.max(1, Math.round(+dur[t] || auto));
      let es = 0;
      for (const [p, frac] of (pre[t] || [])) es = Math.max(es, ready(p, frac));
      T[t] = { id: t, label: label(t, levels), kind: kind(t), color: COLOR[kind(t)] || '#cbd5e1', days, auto, why, manual: !!dur[t],
        es, ef: es + days, cost: r2(cost[t] || 0), from: [...(from[t] || [])] };
    }
    // วันทำงานที่งาน p เสร็จถึงสัดส่วน frac; ถ้าโครงการไม่มีงาน p ใช้งานก่อนหน้าของ p แทน
    function ready(p, frac) {
      if (T[p]) return T[p].es + Math.ceil(T[p].days * frac);
      return (pre[p] || []).reduce((m, [q]) => Math.max(m, ready(q, 1)), 0);
    }
    const tasks = seq.map(t => T[t]);
    tasks.forEach(t => {
      t.start = iso(cal.date(t.es)); t.finish = iso(cal.date(t.ef - 1));
      t.pct = total ? r2(t.cost / total * 100) : 0;
    });
    const finish = tasks.reduce((m, t) => (t.finish > m ? t.finish : m), iso(start));
    const calDays = dayDiff(start, parse(finish)) + 1;
    // S-Curve รายวันปฏิทิน: ต้นทุนงานกระจายเท่ากันทุกวันทำงานของงาน
    const daily = new Array(calDays).fill(0);
    for (const t of tasks) {
      if (!t.cost) continue;
      for (let i = t.es; i < t.ef; i++) daily[dayDiff(start, cal.date(i))] += t.cost / t.days;
    }
    const curve = []; let acc = 0;
    for (let i = 0; i < calDays; i++) { acc += daily[i]; curve.push({ day: i + 1, date: iso(addDays(start, i)), pct: total ? acc / total * 100 : 0 }); }
    return { start: iso(start), finish, calDays, total: r2(total), tasks, curve, workdays: [...cal.wd] };
  }

  // ------------------------------------------------------------ งวดงาน
  // แบบอัตโนมัติ: ตัดงวดที่วันเสร็จของงานซึ่ง % สะสมใกล้ k/N; แต่ละงานอยู่งวดแรกที่วันตัด ≥ วันเสร็จงาน
  function autoAssign(plan, n) {
    const fin = [...new Set(plan.tasks.filter(t => t.cost > 0).map(t => t.finish))].sort();
    const pctAt = d => { const c = plan.curve.find(x => x.date === d); return c ? c.pct : 100; };
    const cuts = []; let lastIdx = -1;
    for (let k = 1; k < n; k++) {
      let best = -1, bd = 1e9;
      fin.forEach((d, i) => { if (i <= lastIdx || i >= fin.length - (n - k)) return; const e = Math.abs(pctAt(d) - k / n * 100); if (e < bd) { bd = e; best = i; } });
      if (best < 0) break;
      cuts.push(fin[best]); lastIdx = best;
    }
    cuts.push(plan.finish);
    const assign = {};
    plan.tasks.forEach(t => { const k = cuts.findIndex(c => t.finish <= c); assign[t.id] = (k < 0 ? cuts.length - 1 : k) + 1; });
    return assign;
  }
  // contract = ราคาค่าก่อสร้างที่จ่ายตามงวด (บาท); advance/retention เป็น %
  function installments(plan, cfg, contract) {
    const n = Math.max(1, cfg.n || 1);
    const assign = Object.assign(autoAssign(plan, n), cfg.mode === 'manual' ? (cfg.assign || {}) : {});
    const warns = [];
    const list = [];
    for (let k = 1; k <= n; k++) {
      const ts = plan.tasks.filter(t => assign[t.id] === k);
      const cost = ts.reduce((a, t) => a + t.cost, 0);
      list.push({ no: k, tasks: ts.map(t => t.id), labels: ts.map(t => t.label), cost,
        due: ts.length ? ts.reduce((m, t) => (t.finish > m ? t.finish : m), '') : '', pct: 0, amount: 0 });
    }
    const tot = plan.total || 1;
    let acc = 0, accPct = 0;
    list.forEach((g, i) => {
      g.pct = Math.round(g.cost / tot * 10000) / 100;
      if (i === list.length - 1) g.pct = r2(100 - accPct);   // ปัดเศษให้ครบ 100
      accPct = r2(accPct + g.pct);
      g.amount = i === list.length - 1 ? r2(contract - acc) : r2(contract * g.pct / 100);
      acc = r2(acc + g.amount);
      g.advance = r2(g.amount * (+cfg.advance || 0) / 100);
      g.retention = r2(g.amount * (+cfg.retention || 0) / 100);
      g.net = r2(g.amount - g.advance - g.retention);
      g.cumPct = accPct;
      if (!g.tasks.length) warns.push(`งวดที่ ${g.no} ไม่มีงาน`);
    });
    for (let i = 1; i < list.length; i++) if (list[i].due && list[i - 1].due && list[i].due < list[i - 1].due) warns.push(`งวดที่ ${list[i].no} ครบกำหนดก่อนงวดที่ ${list[i - 1].no}`);
    return { list, assign, warns };
  }

  return { build, installments, autoAssign, autoDays, label, iso, parse, addDays, LABEL, COLOR };
});
