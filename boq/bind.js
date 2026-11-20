/* UD Total Station — หน้าต่างผูกราคา (ตาม UD Cost Hub · M2 ก้อน 4a)
 * ผูกค่าวัสดุ: พาณิชย์ / วัสดุมวลรวม / ราคาสืบ / กรอกเอง / ไม่มี · ผูกค่าแรง: ว480 / กรอกเอง / ไม่มี
 * การผูกเองเก็บใน S.boq.bind[key] = {mat, lab} (.boq.json) แล้ว lib/boqbind.js ทับการผูกอัตโนมัติ (pricemap) ทีละฝั่ง
 * ค้นหา: ยกจาก Cost Hub (ให้คะแนน · คำพ้อง · ตัดวรรณยุกต์ · ตรงบางคำ · เดาคำพิมพ์ผิด) — ปรับที่เดียวกันทั้งสองเว็บเมื่อแก้
 */
'use strict';
const BQ = { key: null, side: 'mat', tab: '', fl: {}, fprov: '', lib: null, lvKeys: [] };
const BQ_MAXROWS = 150;

// ------------------------------------------------------------------ ค้นหา (เหมือน Cost Hub)
const BQ_SYN = [[/พีวีซี/g, 'pvc'], [/พีพีอาร์|พีพี-อาร์/g, 'ppr'], [/แอลอีดี/g, 'led'], [/อะลูมิเนียม|อลูมิเนียม|อลูมีเนียม|อะลูมีเนียม/g, 'alu'], [/สแตนเลส|สเตนเลส/g, 'sus'], [/ซีเมนต์|ซิเมนต์/g, 'cement'], [/ไม้แบบ/g, 'แบบหล่อ']];
const bqN = s => { let t = String(s || '').toLowerCase(); BQ_SYN.forEach(([r, w]) => { t = t.replace(r, w); }); return t.replace(/ม\.ม\.|มม\.?|มิลลิเมตร/g, 'mm').replace(/นิ้ว|”|″/g, '"'); };
const bqTone = s => s.replace(/[่-์]/g, '');
const bqNorm = s => bqTone(bqN(s));
const BQ_GROUPS = [['รื้อ', 'รื้อถอน'], ['คสล', 'คสล.', 'คอนกรีตเสริมเหล็ก'], ['ฝ้า', 'ฝ้าเพดาน'], ['โถส้วม', 'ส้วม', 'ชักโครก', 'โถชักโครก', 'สุขภัณฑ์'],
  ['อ่างล้างหน้า', 'อ่างล้างมือ', 'ล้างหน้า', 'ล้างมือ'], ['ปูน', 'ปูนซีเมนต์', 'ซีเมนต์', 'cement'], ['เหล็กเส้น', 'เหล็กเสริม', 'เหล็กข้ออ้อย', 'เหล็กกลม'],
  ['ประตู', 'door'], ['หน้าต่าง', 'window'], ['โคม', 'โคมไฟ'], ['ทาสี', 'พ่นสี'], ['กันซึม', 'กันน้ำ'], ['ฉาบ', 'ฉาบปูน'], ['อิฐมอญ', 'อิฐสามัญ'],
  ['อิฐบล็อก', 'อิฐบล็อค', 'บล็อก', 'บล็อค'], ['แบบหล่อ', 'ไม้แบบ'], ['กระเบื้อง', 'tile'], ['ขุด', 'ขุดดิน', 'ขุดหลุม'], ['ถม', 'ถมดิน', 'ถมทราย'],
  ['สายไฟ', 'vct', 'thw', 'nyy'], ['ท่อ', 'pipe'], ['ราว', 'ราวกันตก', 'ราวบันได'], ['เสาเข็ม', 'เข็ม'], ['ติดตั้ง', 'ประกอบ', 'วาง'], ['ทุบ', 'รื้อ', 'สกัด']].map(g => g.map(bqNorm));
const bqVariants = t => { const o = new Set([t]); BQ_GROUPS.forEach(g => { if (g.includes(t)) g.forEach(w => o.add(w)); }); return [...o]; };
const bqBig = t => { const b = new Set(); for (let i = 0; i < t.length - 1; i++) b.add(t.slice(i, i + 2)); return b; };
/** ค้นหาแบบให้คะแนน: ตรงครบทุกคำขึ้นก่อน · ตรงบางคำ (≥ครึ่ง) ตามมา · ไม่มีเลยจึงเดาคำพิมพ์ผิด · ไม่เจออะไรเลย → คืนทั้งหมด (fallback) */
function bqSearch(pool, q, hay, opts) {
  opts = opts || {};
  const toks = bqNorm(q).split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return { items: pool, full: pool.length, fallback: false };
  const vs = toks.map(bqVariants), need = Math.max(1, Math.ceil(toks.length / 2));
  const unitN = opts.unit ? Survey.normUnit(opts.unit) : '';
  const run = fuzzy => {
    const out = [];
    pool.forEach(d => {
      const h = hay(d), name = bqNorm(h[0]), all = bqNorm(h.join(' ')); let sc = 0, m = 0, ex = 0;
      toks.forEach((t, ti) => {
        const num = /^\d+(\.\d+)?$/.test(t); let hit = false;
        for (const v of vs[ti]) {
          if (num) { if (new RegExp('(^|[^\\d.])' + v.replace('.', '\\.') + '($|[^\\d])').test(all)) { hit = true; sc += name.includes(v) ? 3 : 2; break; } }
          else if (all.includes(v)) { hit = true; sc += name.includes(v) ? 2 : 1; if (name.startsWith(v) && ti === 0) sc += 1; break; }
        }
        if (hit) { m++; ex++; }
        else if (fuzzy && t.length >= 4 && !num) { const bg = bqBig(t); let k = 0; bg.forEach(x => { if (all.includes(x)) k++; }); if (k / bg.size >= 0.8) { m++; sc += 0.5; } }
      });
      if (m < need) return;
      if (unitN && opts.unitOf && Survey.normUnit(opts.unitOf(d) || '') === unitN) sc += 0.5;
      out.push({ d, sc, full: m === toks.length && ex === toks.length });
    });
    out.sort((x, y) => (y.full - x.full) || (y.sc - x.sc));
    return out;
  };
  let out = run(false);
  if (!out.length) out = run(true);
  if (!out.length) return { items: pool, full: 0, fallback: true };
  return { items: out.map(x => x.d), full: out.filter(x => x.full).length, fallback: false };
}
const bqWc = v => { v = String(v == null ? '' : v).trim(); return v === '-' ? '' : v; };
/** เส้นทางหมวดเต็มของค่าแรง ว480: หมวดใหญ่ › h1 › h2 › h3 › h4 */
function bqWagePath(d) { const o = []; [d.sheetLabel, d.h1, d.h2, d.h3, d.h4].forEach(x => { x = bqWc(x); if (x && o[o.length - 1] !== x) o.push(x); }); return o; }
const bqWn = d => ((!d.h3 || d.h3 === '-') && (!d.h4 || d.h4 === '-')) ? (d.h2 || d.h1) : ([d.h3 || d.h2, d.h4].filter(x => x && x !== '-').join(' — ') || d.h1);
/** หมวดย่อยของราคาพาณิชย์ (ข้อมูลไม่มีชื่อหมวดย่อย): 4/6 หลักแรกของรหัส + คำขึ้นต้นที่ทุกรายการในกลุ่มมีเหมือนกัน */
const BQ_PFX = { sig: '', m4: {}, m6: {} };
function bqPfxBuild(pool) {
  const sig = pool.length + ':' + (pool[0] && pool[0].code); if (BQ_PFX.sig === sig) return;
  const g = { 4: {}, 6: {} };
  pool.forEach(d => { const c = String(d.code || ''); [4, 6].forEach(n => { const k = c.slice(0, n); (g[n][k] = g[n][k] || []).push(String(d.name || '').replace(/\s+/g, ' ').trim()); }); });
  const lab = (k, names) => {
    const tk = names.map(x => x.split(' ')); let n = 0;
    while (n < 5 && tk.every(t => t[n] !== undefined && t[n] === tk[0][n])) n++;
    let w = tk[0].slice(0, n).join(' '); if (!w) w = tk[0].slice(0, 2).join(' ');
    if (w.length > 40) w = w.slice(0, 40) + '…';
    return k + ' ' + w + ' (' + names.length + ')';
  };
  BQ_PFX.m4 = {}; BQ_PFX.m6 = {};
  Object.keys(g[4]).forEach(k => { BQ_PFX.m4[k] = lab(k, g[4][k]); });
  Object.keys(g[6]).forEach(k => { BQ_PFX.m6[k] = lab(k, g[6][k]); });
  BQ_PFX.sig = sig;
}
const bqCompKind = d => String(d.name || '').replace(/[(（].*$/, '').replace(/\s+\d.*$/, '').replace(/\s+ขนาด.*$/, '').trim().slice(0, 30) || String(d.name || '').slice(0, 30);
const bqF2 = n => (n === null || n === undefined || n === '') ? '—' : (+n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ------------------------------------------------------------------ แหล่งราคา
const COMP_GROUPS = () => (window.UDPrice && UDPrice.CONFIG && UDPrice.CONFIG.COMP_GROUPS) || {};
function bqSurveyPool(r) {   // ราคาสืบในโครงการ (มีราคาแล้ว) + คลังราคาสืบ
  const prj = Object.values(S.boq.surveys || {}).filter(it => svCatOf(it) === 'mat' && Survey.summary(it).price !== null)   // ค่าวัสดุผูกได้เฉพาะชนิดวัสดุ (ครุภัณฑ์/ค่าใช้จ่ายพิเศษอยู่ ปร.2/ปร.3)
    .map(it => ({ src: 'prj', id: 'p:' + it.target, it, name: it.name, unit: it.unit, s: Survey.summary(it) }));
  const linked = new Set(prj.map(x => x.it.lib).filter(Boolean));
  const lib = (BQ.lib || []).filter(x => libCat(x) === 'mat' && !linked.has(x.key) && Survey.summary(x).price !== null)
    .map(x => ({ src: 'lib', id: 'l:' + x.key, x, name: x.name, unit: x.unit, s: Survey.summary(x) }));
  return prj.concat(lib);
}
function bqPools(r) {
  const db = S.db || { materials: [], compList: [], wages: [] };
  const mats = db.materials.filter(d => d.code); bqPfxBuild(mats);
  const G = COMP_GROUPS();
  return {
    mat: { pool: mats, hay: d => [d.name, d.code, d.catName || ''], id: d => d.code, unit: d => d.unit, prov: d => d.province || '',
      levels: [['cat', d => d.catName || '', 'ทุกหมวดใหญ่'], ['g4', d => BQ_PFX.m4[String(d.code).slice(0, 4)] || '', 'ทุกหมวดย่อย'], ['g6', d => BQ_PFX.m6[String(d.code).slice(0, 6)] || '', 'ทุกหมวดย่อยชั้น 2']] },
    comp: { pool: db.compList, hay: d => [d.name, d.sub, G[d.group] || ''], id: d => d.sub, unit: d => d.unit,
      levels: [['cat', d => G[d.group] || '', 'ทุกหมวดใหญ่'], ['kind', bqCompKind, 'ทุกประเภทงาน']] },
    survey: { pool: bqSurveyPool(r), hay: d => [d.name], id: d => d.id, unit: d => d.unit },
    wage: { pool: db.wages.filter(d => d.code), hay: d => [[d.h3, d.h4].filter(x => x && x !== '-').join(' ') || bqWn(d), bqWagePath(d).join(' '), d.code || ''], id: d => d.code, unit: d => d.unit,
      levels: [['cat', d => bqWc(d.sheetLabel), 'ทุกหมวดใหญ่'], ['h1', d => bqWc(d.h1), 'ทุกหมวดย่อย'], ['h2', d => bqWc(d.h2), 'ทุกหมวดย่อยชั้น 2'], ['h3', d => bqWc(d.h3), 'ทุกหมวดย่อยชั้น 3']] },
  };
}
const BQ_TABS = { mat: [['mat', 'พาณิชย์'], ['comp', 'วัสดุมวลรวม'], ['survey', 'ราคาสืบ'], ['pct', '% ของรายการอื่น'], ['manual', 'กรอกเอง'], ['none', 'ไม่มีค่าวัสดุ']],
  lab: [['wage', 'ค่าแรง ว480'], ['pctmat', '% ของค่าวัสดุ'], ['manual', 'กรอกเอง'], ['none', 'ไม่มีค่าแรง']],
  line: [['mat', 'ราคาพาณิชย์'], ['comp', 'วัสดุมวลรวม'], ['survey', 'ราคาสืบ']] };
/** แท็บแรกที่เปิด: ชนิดที่ผูกไว้ → ชนิดของการผูกอัตโนมัติ → แท็บที่ชื่อรายการค้นเจอครบทุกคำ */
function bqBestTab(r, side) {
  const cur = ((S.boq.bind || {})[r.key] || {})[side];
  if (cur && BQ_TABS[side].some(t => t[0] === cur.kind)) return cur.kind;
  const k0 = r.ref && r.ref.kind;
  if (side === 'lab') return k0 === 'pct' ? 'pctmat' : 'wage';
  if (k0 === 'pct') return 'pct'; if (k0 === 'comp') return 'comp'; if (k0 === 'mat' || k0 === 'mat_find') return 'mat';
  const P = bqPools(r), q = (r.name || '').trim(); if (!q) return 'mat';
  for (const full of [true, false]) for (const k of ['mat', 'comp', 'survey']) { const t = P[k], x = bqSearch(t.pool, q, t.hay, { unit: r.unit, unitOf: t.unit }); if (!x.fallback && (full ? x.full : x.items.length)) return k; }
  return 'mat';
}

/** รหัสที่ตัวผูกอัตโนมัติใช้อยู่ (ปักไว้บนสุดของแท็บนั้น เมื่อแถวยังไม่ได้ผูกเอง) */
function bqAutoId(r, tab) {
  const a = (rows().find(x => x.key === r.key) || {}).price_ref || {};
  if (tab === 'mat') { if (a.kind === 'mat' && a.code) return String(a.code).split(',')[0]; const m = String(r.mat_src || '').match(/พาณิชย์ (\d{8,})/); return m ? m[1] : ''; }
  if (tab === 'comp') return a.kind === 'comp' ? a.code : '';
  if (tab === 'wage') return a.wage_code || (a.kind === 'wage' && a.code) || (a.wages && a.wages[0] && a.wages[0].code) || '';
  if (tab === 'survey') return (S.boq.surveys || {})['row:' + r.key] && Survey.summary(S.boq.surveys['row:' + r.key]).price !== null ? 'p:row:' + r.key : '';
  return '';
}
// ------------------------------------------------------------------ หน้าต่าง
function bqEl() {
  let m = $('#bind-modal'); if (m) return m;
  m = document.createElement('div'); m.id = 'bind-modal'; m.className = 'modal';
  m.innerHTML = `<div class="modal-box glass bind-box"><div class="side-top"><h2 style="margin:0" id="bq-title">ผูกราคา</h2><button class="btn small" data-close="1">×</button></div>
    <div id="bq-label" class="hint"></div><div id="bq-cur" class="bq-cur"></div>
    <div id="bq-tabs" class="bq-tabs"></div>
    <input id="bq-q" placeholder="พิมพ์คำค้นหา (หลายคำได้ ไม่ต้องติดกัน)" autocomplete="off">
    <div id="bq-filt" class="bq-filt"></div>
    <div id="bq-list" class="bq-list"></div>
    <div id="bq-foot" class="bq-foot"></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close) bqClose(); });
  $('#bq-q', m).addEventListener('input', bqList);
  $('#bq-tabs', m).addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { BQ.tab = t.dataset.tab; BQ.fl = {}; BQ.fprov = ''; bqList(); } });
  $('#bq-foot', m).addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { BQ.tab = t.dataset.tab; bqList(); } if (e.target.dataset.unbind) bqUnbind(); if (e.target.dataset.svnew) bqSurveyNew(); });
  $('#bq-filt', m).addEventListener('change', e => { const k = e.target.dataset.flt; if (!k) return; if (k === 'prov') BQ.fprov = e.target.value; else { BQ.fl[k] = e.target.value; BQ.lvKeys.slice(BQ.lvKeys.indexOf(k) + 1).forEach(x => { BQ.fl[x] = ''; }); } bqList(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('on')) bqClose(); });
  return m;
}
const bqRow = () => S.priced.find(x => x.key === BQ.key);
function bqLineCur(r) { const root = cmpRootR(r.key); if (!root || !BQ.line) return null; return ((BoqBind.scopeOf(root, BQ.line.sub).lines) || {})[BQ.line.index] || null; }
function bqClose() { const m = $('#bind-modal'); if (m) m.classList.remove('on'); BQ.key = null; }
function bindOpen(key, side) {
  if (!S.db) return toast('ราคายังโหลดไม่เสร็จ');
  const r = S.priced.find(x => x.key === key); if (!r) return;
  const m = bqEl();
  BQ.key = key; BQ.side = side; BQ.line = null; BQ.pct = null; BQ.fl = {}; BQ.fprov = ''; BQ.tab = bqBestTab(r, side);
  $('#bq-title', m).textContent = side === 'mat' ? 'ผูกราคาค่าวัสดุ' : 'ผูกราคาค่าแรง';
  $('#bq-label', m).innerHTML = `รายการ: <b>${esc(r.name)}</b> · หน่วย ${esc(r.unit || '—')} · ระบบแปลงหน่วยราคาให้เมื่อทำได้`;
  $('#bq-q', m).value = r.name || '';
  m.classList.add('on'); bqList(); $('#bq-q', m).focus(); $('#bq-q', m).select();
  if (side === 'mat' && !BQ.lib) Survey.libAll().then(a => { BQ.lib = a || []; if (BQ.key && BQ.tab === 'survey') bqList(); }).catch(() => { BQ.lib = []; });
}
function bqCurHtml(r, side) {
  const b = ((S.boq.bind || {})[r.key] || {})[side], src = side === 'mat' ? r.mat_src : r.lab_src, u = side === 'mat' ? r.mat_unit : r.lab_unit;
  const now = `ตอนนี้: ${u === null || u === undefined ? '<span class="hint">ยังไม่มีราคา</span>' : `<b>${bqF2(u)}</b> บ./${esc(r.unit)}`}${src ? ` · ${esc(src)}` : ''}`;
  return b ? `${now} <span class="pill warn">ผูกเอง</span> <button class="btn small" data-unbind="1" title="ลบการผูกเองของฝั่งนี้ กลับไปใช้การผูกอัตโนมัติจากตัวถอดปริมาณ">↺ กลับไปใช้การผูกอัตโนมัติ</button>` : `${now} <span class="pill">อัตโนมัติ</span>`;
}
function bqList() {
  const m = $('#bind-modal'), r = bqRow(); if (!m || !r) return;
  const side = BQ.side, q = $('#bq-q', m).value.trim(), isPct = r.ref && r.ref.kind === 'pct';
  const tabs = side === 'lab' && isPct ? BQ_TABS.lab.filter(t => t[0] !== 'wage') : BQ_TABS[side];   // แถว % คิดค่าแรงจาก ว480 ไม่ได้ (เป็นงานเหมา)
  const tg = side === 'line' ? { key: r.key, name: BQ.line.name, unit: BQ.line.unit, ref: {} } : r, P = bqPools(tg);
  $('#bq-cur', m).innerHTML = side === 'line' ? '' : bqCurHtml(r, side);
  const cnt = k => { const t = P[k]; if (!t) return ''; if (!q) return ` (${t.pool.length})`; const x = bqSearch(t.pool, q, t.hay, { unit: tg.unit, unitOf: t.unit }); return ` (${x.fallback ? 0 : x.items.length})`; };
  $('#bq-tabs', m).innerHTML = tabs.map(([k, l]) => `<span class="chip ${BQ.tab === k ? 'on' : ''}" data-tab="${k}">${l}${cnt(k)}</span>`).join('');
  const T = P[BQ.tab], list = $('#bq-list', m), filt = $('#bq-filt', m);
  $('#bq-q', m).style.display = T ? '' : 'none'; filt.innerHTML = '';
  const cur = side === 'line' ? bqLineCur(r) : ((S.boq.bind || {})[r.key] || {})[side];
  let html = '', items = [];
  if (T) {
    let pool = T.pool, fh = '';
    if (T.levels) {
      BQ.lvKeys = T.levels.map(l => l[0]);
      T.levels.forEach(([k, fn, all]) => {
        const opts = [...new Set(pool.map(fn).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th', { numeric: true }));
        if (BQ.fl[k] && !opts.includes(BQ.fl[k])) BQ.fl[k] = '';
        if (opts.length > 1 || BQ.fl[k]) fh += `<select data-flt="${k}"><option value="">${all} (${opts.length})</option>${opts.map(c => `<option value="${esc(c)}" ${BQ.fl[k] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
        if (BQ.fl[k]) pool = pool.filter(d => fn(d) === BQ.fl[k]);
      });
    }
    const provs = T.prov ? [...new Set(T.pool.map(T.prov).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th')) : [];
    if (BQ.fprov && !provs.includes(BQ.fprov)) BQ.fprov = '';
    if (provs.length > 1) fh += `<select data-flt="prov"><option value="">ทุกจังหวัด</option>${provs.map(c => `<option value="${esc(c)}" ${BQ.fprov === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    filt.innerHTML = fh;
    if (BQ.fprov && T.prov) pool = pool.filter(d => T.prov(d) === BQ.fprov);
    if (side === 'line' && BQ.tab === 'comp') { const self = BQ.line.sub || (r.ref && r.ref.code); pool = pool.filter(d => d.sub !== self); }   // ไม่ให้เลือกมวลรวมตัวเองซ้อนตัวเอง
    const res = bqSearch(pool, q, T.hay, { unit: tg.unit, unitOf: T.unit });
    const curId = cur && (cur.kind === 'survey' ? 'p:' + cur.key : cur.code), autoId = cur || side === 'line' ? '' : bqAutoId(r, BQ.tab);
    items = res.items;
    const pref = linkPrefIds(tg.name, side, BQ.tab);
    const pin = [curId, autoId].map(id => id && T.pool.find(d => T.id(d) === id)).filter(Boolean);
    T.pool.filter(d => pref.has(T.id(d)) && !pin.includes(d)).forEach(d => pin.push(d));
    if (pin.length) items = pin.concat(items.filter(d => !pin.includes(d)));
    const fullAt = (!res.fallback && q && res.full > 0 && res.full < items.length) ? res.full + pin.filter(d => !res.items.slice(0, res.full).includes(d)).length : -1;
    const total = items.length; items = items.slice(0, BQ_MAXROWS);
    const note = (!res.fallback && q && res.full === 0 && res.items.length ? `<div class="hint bq-note">ไม่มีรายการที่ตรงครบทุกคำของ "${esc(q)}" — แสดงรายการที่ตรงบางคำ/ใกล้เคียง</div>` : '')
      + (res.fallback ? `<div class="hint bq-note">ไม่พบรายการที่มีคำของ "${esc(q)}" — แสดงทั้งหมดในแท็บนี้ (ลองพิมพ์คำเดียว หรือเลือกหมวด)</div>` : '')
      + (total > BQ_MAXROWS ? `<div class="hint bq-note">แสดง ${BQ_MAXROWS} จาก ${total} รายการ — พิมพ์เพิ่มหรือเลือกหมวดเพื่อกรอง</div>` : '');
    const row = (d, name, meta, price, i) => (i === fullAt ? '<div class="hint bq-note">ตรงบางคำเท่านั้น</div>' : '')
      + `<div class="bq-item ${(curId || autoId) && [curId, autoId].includes(T.id(d)) ? 'cur' : ''}" data-i="${i}"><div class="bq-iname">${esc(name)}${curId && T.id(d) === curId ? ' <span class="pill ok">ผูกอยู่</span>' : autoId && T.id(d) === autoId ? ' <span class="pill">ผูกอัตโนมัติอยู่</span>' : pref.has(T.id(d)) ? ' <span class="pill warn">เคยผูกไว้</span>' : ''}<div class="hint">${meta}</div></div><div class="bq-iprice">${price}</div></div>`;
    if (BQ.tab === 'mat') html = items.map((d, i) => row(d, d.name, esc([d.code, d.catName, d.province].filter(Boolean).join(' · ')), d.price !== null ? bqF2(d.price) + ' / ' + esc(d.unit) : '—', i)).join('');
    else if (BQ.tab === 'comp') {
      const G = COMP_GROUPS();
      html = items.map((c, i) => { const pr = S.db.compPrice(c.id, {}); return row(c, c.sub + ' ' + c.name, esc(G[c.group] || ''), pr && pr.price !== null ? bqF2(pr.price) + ' / ' + esc(c.unit) : `คิดไม่ครบ (${esc(c.unit)})`, i); }).join('');
    } else if (BQ.tab === 'survey') {
      html = items.length ? items.map((x, i) => row(x, x.name, `${x.src === 'prj' ? 'ราคาสืบในโครงการนี้' + (x.it.lib ? ' · ผูกกับคลัง' : '') : 'คลังราคาสืบ' + (x.x.project ? ' · ' + esc(x.x.project) : '') + ` · ${Survey.ageDays(x.x.updated)} วันก่อน`} · ${x.s.n} เจ้า${x.s.n < Survey.MIN_Q ? ` (ไม่ครบ ${Survey.MIN_Q})` : ''} · ไม่รวม VAT`, bqF2(x.s.price) + ' / ' + esc(x.unit), i)).join('')
        : `<div class="hint bq-note">${BQ.lib ? 'ยังไม่มีราคาสืบที่ใช้ได้' : 'กำลังโหลดคลังราคาสืบ…'}</div>`;
    } else html = items.map((d, i) => row(d, bqWagePath(d).join(' › '), esc(d.code), d.price !== null ? bqF2(d.price) + ' / ' + esc(d.unit) : esc(d.rawPrice || '—'), i)).join('');
    html = note + html;
  } else if (BQ.tab === 'pct') {
    html = pctHtml(r);
  } else if (BQ.tab === 'pctmat') {
    const v = cur && cur.kind === 'pctmat' ? cur.pct : (r.ref && r.ref.lab_pct !== undefined ? +(r.ref.lab_pct * 100).toFixed(2) : 30);
    html = `<div class="bq-pad"><div class="hint" style="flex-basis:100%">ค่าแรงต่อหน่วย = % ของค่าวัสดุต่อหน่วยของรายการนี้ (หลักเกณฑ์: ค่าแรง 30% ของค่าของ)</div><label>เปอร์เซ็นต์ของค่าวัสดุ <input id="bq-lp" class="price sm" inputmode="decimal" value="${esc(v)}"> %</label> <button class="btn small primary" id="bq-lpok">ใช้การคิดนี้</button></div>`;
  } else if (BQ.tab === 'manual') {
    const v = cur && cur.kind === 'manual' ? cur.price : '';
    html = `<div class="bq-pad"><label>ราคาต่อหน่วย (บาท/${esc(r.unit || 'หน่วย')}) <input id="bq-mv" class="price" inputmode="decimal" value="${esc(v)}"></label> <button class="btn small primary" id="bq-mok">ใช้ราคานี้</button>
      <label class="wide">รายละเอียด / วิธีคิด / ที่มา (ไม่บังคับ — แสดงในที่มาของราคา)<input id="bq-mn" value="${esc(cur && cur.kind === 'manual' ? cur.note || '' : '')}"></label></div>`;
  } else {
    html = `<div class="bq-pad"><button class="btn small primary" id="bq-nok">${side === 'mat' ? 'ยืนยัน: รายการนี้ไม่มีค่าวัสดุ (ค่าแรงอย่างเดียว)' : 'ยืนยัน: รายการนี้ไม่มีค่าแรง (รวมในค่าอื่นแล้ว)'}</button></div>`;
  }
  list.innerHTML = html || '<div class="hint bq-note">ไม่พบรายการ</div>';
  if (BQ.tab === 'pct' || BQ.tab === 'pctmat') $('#bq-foot', m).innerHTML = ''; else $('#bq-foot', m).innerHTML = side === 'line' ? '<span class="hint">ไม่มีในฐานข้อมูล? สืบราคาวัสดุย่อยนี้ได้ที่แท็บราคาสืบ (กลุ่ม "วัสดุย่อยในวัสดุมวลรวม") แล้วกลับมาเลือกในแท็บราคาสืบ</span>' : side === 'mat'
    ? `<span class="hint">ไม่มีในฐานข้อมูล?</span> <button class="btn small" data-svnew="1">+ สืบราคาใหม่</button> <button class="btn small" data-tab="manual">กรอกราคาเอง</button>`
    : `<button class="btn small" data-tab="manual">ไม่พบ — กรอกค่าแรงเอง</button>`;
  list.onclick = e => {
    const it = e.target.closest('.bq-item');
    if (it && T) { if (side === 'line') bqPickLine(r, items[+it.dataset.i]); else bqPickItem(r, items[+it.dataset.i]); return; }
    if (e.target.id === 'bq-mok') { const v = $('#bq-mv', m).value.replace(/,/g, '').trim(); if (v === '' || !isFinite(+v) || +v < 0) return toast('ใส่ราคาเป็นตัวเลข ≥ 0'); bqSet(r, { kind: 'manual', price: r2(+v), note: $('#bq-mn', m).value.trim() }); }
    if (e.target.id === 'bq-nok') bqSet(r, { kind: 'none' });
    if (e.target.id === 'bq-lpok') { const v = $('#bq-lp').value.trim(); if (v === '' || !(+v >= 0)) return toast('ใส่เปอร์เซ็นต์เป็นตัวเลข'); bqSet(r, { kind: 'pctmat', pct: +v }); }
    const pa = e.target.closest('[data-pa]'); if (pa && BQ.tab === 'pct') pctAct(r, pa.dataset.pa);
  };
  list.onchange = e => { if (BQ.tab !== 'pct') return; const t = e.target, P = BQ.pct;
    if (t.dataset.pk) { const i = P.sel.indexOf(t.dataset.pk); if (t.checked && i < 0) P.sel.push(t.dataset.pk); if (!t.checked && i >= 0) P.sel.splice(i, 1); pctSum(r); }
    if (t.id === 'bq-pre') { P.preset = t.value; const ps = PCT_PRESETS.find(x => x.id === t.value); if (ps) { P.pct = ps.pct; pctAuto(r); } bqList(); } };
  list.oninput = e => { if (BQ.tab !== 'pct') return; const t = e.target;
    if (t.id === 'bq-pv') { BQ.pct.pct = t.value; pctSum(r); }
    if (t.id === 'bq-pf') { BQ.pct.filter = t.value; pctFilter(); } };
  if (BQ.tab === 'pct') pctFilter();
  list.onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'bq-mv') $('#bq-mok', m).click(); };
}
async function bqPickItem(r, d) {
  const t = BQ.tab;
  if (t === 'mat') return bqSet(r, { kind: 'mat', code: d.code, label: `พาณิชย์ ${d.code} ${d.name}` });
  if (t === 'comp') return bqSet(r, { kind: 'comp', code: d.sub, label: `วัสดุมวลรวม ${d.sub} ${d.name}` });
  if (t === 'wage') return bqSet(r, { kind: 'wage', code: d.code, label: `ว480 ${d.code} ${bqWn(d)}` });
  if (t === 'survey') {
    if (d.src === 'prj') return bqSet(r, { kind: 'survey', key: d.it.target, label: 'ราคาสืบ ' + d.it.name });
    // จากคลัง: ผูกรายการสืบของแถวนี้กับรายการในคลัง (ไม่สร้างรายการใหม่ในคลัง — ก้อน 5a) แล้วผูกค่าวัสดุกับรายการสืบนั้น
    const item = svItem({ target: 'row:' + r.key, name: r.name, unit: r.unit, ref: refOfRow(r) });
    await libUse(item, d.x);
    return bqSet(r, { kind: 'survey', key: item.target, label: 'ราคาสืบ ' + d.x.name });
  }
}
function bqSet(r, v) {
  const B = S.boq.bind = S.boq.bind || {}, b = B[r.key] = B[r.key] || {};
  b[BQ.side] = v; b.by = (S.me && S.me.name) || b.by || ''; b.at = new Date().toISOString().slice(0, 10);
  linkRemember(r.name, BQ.side, v);
  autosave(); bqClose(); renderPR1(); renderSummary(); renderSurvey();
  toast(`ผูก${BQ.side === 'mat' ? 'ค่าวัสดุ' : 'ค่าแรง'} "${r.name}" แล้ว`);
}
function bqUnbind() {
  const r = bqRow(); if (!r) return; const b = (S.boq.bind || {})[r.key]; if (!b) return;
  delete b[BQ.side]; if (!b.mat && !b.lab) delete S.boq.bind[r.key];
  autosave(); bqClose(); renderPR1(); renderSummary(); renderSurvey(); toast('กลับไปใช้การผูกอัตโนมัติแล้ว');
}
function bqSurveyNew() {   // สืบราคาใหม่ของแถวนี้ในแท็บราคาสืบ แล้วผูกค่าวัสดุกับรายการสืบนั้น (ราคาขึ้นเมื่อสืบครบ)
  const r = bqRow(); if (!r) return;
  const item = svItem({ target: 'row:' + r.key, name: r.name, unit: r.unit, ref: refOfRow(r) });
  const B = S.boq.bind = S.boq.bind || {}, b = B[r.key] = B[r.key] || {};
  b.mat = { kind: 'survey', key: item.target, label: 'ราคาสืบ ' + r.name }; autosave(); bqClose();
  S.svOpen = item.target; S.svf = 'all'; $$('#tabs .nav-tab').find(x => x.dataset.tab === 'survey').click(); renderSurvey();
  setTimeout(() => { const c = $(`[data-svi="${CSS.escape(item.target)}"]`); if (c) { c.scrollIntoView({ block: 'start' }); svLibHint(c, item); } }, 80);
}

// ------------------------------------------------------------------ มวลรวมผูกทีละบรรทัด (ก้อน 4b ตาม Cost Hub)
// S.boq.cmpline[แถว] = {code, lines, prices, qty, accept, sub} (lib/boqbind.js) · ใช้ทั้งแถวที่ผูกมวลรวมอัตโนมัติและผูกเอง
const cmpCtx = () => ({ db: S.db, U: window.UDPrice, surveyOf: svPriceOf });
function cmpRootR(key) { const r = S.priced.find(x => x.key === key), C = S.boq.cmpline || {}, sc = C[key]; return r && sc && r.ref && sc.code === r.ref.code ? sc : null; }
function cmpRootW(key) {   // ขอบเขตรากสำหรับเขียน (รหัสมวลรวมเปลี่ยน → เริ่มใหม่)
  const r = S.priced.find(x => x.key === key); if (!r || !r.ref || r.ref.kind !== 'comp') return null;
  const C = S.boq.cmpline = S.boq.cmpline || {};
  if (!C[key] || C[key].code !== r.ref.code) C[key] = { code: r.ref.code, lines: {}, prices: {}, qty: {} };
  return C[key];
}
function cmpScopeW(root, sub) { if (!sub || sub === root.code) return root; root.sub = root.sub || {}; return (root.sub[sub] = root.sub[sub] || {}); }
const CMP_SRC = { commerce: 'พาณิชย์', 'commerce-fallback': 'พาณิชย์ (รหัสสำรอง)', fixed: 'ราคาคงที่', 'sub-comp': 'ส่วนผสม', user: 'กรอกเอง' };
function cmpPanel(r) {
  const root = cmpRootR(r.key) || { code: r.ref.code };
  return `<div class="cmp no-print" data-ck="${esc(r.key)}">${cmpBlock(r, root, root, 0)}</div>`;
}
function cmpBlock(r, root, sc, depth) {
  const ctx = cmpCtx(), all = BoqBind.cmpLines(S.db, sc.code); if (!all.length) return '';
  const sub = sc === root ? '' : sc.code, st = BoqBind.cmpState(ctx, root, sc, depth), uq = BoqBind.cmpQty(sc) || {};
  const noQ = l => l.qty === null && uq[l.index] === undefined;
  const miss = st ? st.missing : [], nQ = miss.filter(i => { const l = all.find(x => x.index === i); return l && noQ(l); }).length, nP = Math.max(0, miss.length - nQ);
  const missTxt = [nP ? `ยังไม่มีราคา ${nP} รายการ` : '', nQ ? `ยังไม่มีปริมาณ ${nQ} รายการ` : ''].filter(Boolean).join(' · ');
  const dk = r.key + '|' + sc.code, open = (S.cmpOpen && S.cmpOpen[dk] !== undefined) ? S.cmpOpen[dk] : !!(miss.length && !(st && st.acc));
  let stat;
  if (!miss.length) stat = ' <span class="ok">(ราคาครบ)</span>';
  else if (st && st.acc) stat = ` <span class="warn">ยอมรับราคาไม่ครบ (${missTxt.replace(/ยังไม่มี/g, 'ขาด')}) = ${fmt(st.pp.price)}</span> <a class="pk-link" data-cact="unacc" data-s="${esc(sub)}">ยกเลิกการยอมรับ</a>`;
  else stat = ` <span class="warn">(${missTxt})</span>${st && st.pp.price ? ` <span class="hint">ราคาชั่วคราว ${fmt(st.pp.price)} — ยังไม่รวมในยอด</span> <a class="pk-link" data-cact="acc" data-s="${esc(sub)}">ยอมรับราคานี้ (ขาด ${miss.length})</a>` : ''}${st && st.stale ? ' <span class="warn">รายการที่ขาดเปลี่ยนไป ยืนยันใหม่</span>' : ''}`;
  const unitC = (S.db.findComp(sc.code) || {}).unit || 'หน่วย';
  return `<details class="cmp-b" data-dk="${esc(dk)}" ${open ? 'open' : ''}><summary>วัสดุในมวลรวม ${esc(sc.code)}${stat}</summary>` + all.map(l => {
    const x = BoqBind.cmpLineInfo(ctx, root, sc, l, depth), lk = (sc.lines || {})[l.index], pr = (sc.prices || {})[l.index], missP = (l.warnings || []).includes('missing_price');
    let s;
    if (x) s = x.state === 'ok' ? `<b class="ok">${esc(x.src)} ${fmt(x.price)} บ./${esc(l.unit)}</b> <span class="hint">(${esc(x.label)}${x.n !== undefined ? ` · ${x.n} เจ้า${x.n < Survey.MIN_Q ? ' ไม่ครบ ' + Survey.MIN_Q : ''}` : ''})</span>` : `<span class="warn">${esc(x.warn)}</span>`;
    else if (pr !== undefined) s = `<span class="hint">ราคาที่กรอกไว้ ${fmt(pr)} บ./${esc(l.unit)}</span>`;
    else if (!missP) s = `<span class="hint">${esc(CMP_SRC[l.source] || l.source || '')}${l.source === 'sub-comp' ? ' ' + esc(l.subComp || '') : l.province ? ' ' + esc(l.province) : ''} ${fmt(l.unitPrice)} บ./${esc(l.unit)}</span>`;
    else s = '<span class="warn">ยังไม่มีราคา</span>';
    const nest = lk && lk.kind === 'comp' && depth < 3 ? `<div class="cmp-nest">${cmpBlock(r, root, BoqBind.scopeOf(root, lk.code), depth + 1)}</div>` : '';
    const qh = l.qty !== null ? `<span class="hint">× ${esc(l.qty)} ${esc(l.unit)}</span>`
      : `<span class="hint">×</span> <input class="price sm ${uq[l.index] === undefined ? 'ov' : ''}" data-cqty="1" data-s="${esc(sub)}" data-i="${l.index}" value="${esc(uq[l.index] ?? '')}" placeholder="ปริมาณ" title="ข้อมูลมวลรวมไม่ระบุปริมาณบรรทัดนี้ — กรอกปริมาณต่อ 1 ${esc(unitC)} (ใช้เฉพาะโครงการนี้)"> <span class="hint">${esc(l.unit)}</span>${uq[l.index] === undefined ? ' <span class="warn">ยังไม่มีปริมาณ</span>' : ''}`;
    return `<div class="cmp-l"><span>${esc(l.name)} ${qh}</span> ${s} <a class="pk-link" data-cact="pick" data-s="${esc(sub)}" data-i="${l.index}">${lk ? 'เปลี่ยน' : missP ? 'เลือกราคา' : 'เปลี่ยนที่มาราคา'}</a>${lk || pr !== undefined ? ` <a class="pk-link" data-cact="unlink" data-s="${esc(sub)}" data-i="${l.index}">เลิกผูก</a>` : ''}</div>${nest}`;
  }).join('') + '</details>';
}
function cmpRefresh() { autosave(); renderPR1(); renderSummary(); renderSurvey(); }
function cmpBindEvents(tb) {
  tb.querySelectorAll('.cmp details').forEach(d => d.addEventListener('toggle', () => { S.cmpOpen = S.cmpOpen || {}; S.cmpOpen[d.dataset.dk] = d.open; }));
  tb.querySelectorAll('.cmp').forEach(box => {
    const key = box.dataset.ck;
    box.addEventListener('click', e => {
      e.stopPropagation();
      const a = e.target.closest('[data-cact]'); if (!a) return;
      const root = cmpRootW(key); if (!root) return; const sub = a.dataset.s, sc = cmpScopeW(root, sub), i = a.dataset.i;
      if (a.dataset.cact === 'acc') { if (BoqBind.cmpAccept(cmpCtx(), root, sub ? BoqBind.scopeOf(root, sub) : root, sub ? 1 : 0)) { if (sub) Object.assign(sc, { accept: BoqBind.scopeOf(root, sub).accept }); cmpRefresh(); } }
      else if (a.dataset.cact === 'unacc') { delete sc.accept; cmpRefresh(); }
      else if (a.dataset.cact === 'unlink') { if (sc.lines) delete sc.lines[i]; if (sc.prices) delete sc.prices[i]; cmpRefresh(); }
      else if (a.dataset.cact === 'pick') {
        const ln = BoqBind.cmpLines(S.db, sub || root.code).find(l => String(l.index) === String(i)); if (ln) bindLineOpen(key, sub, ln);
      }
    });
    box.addEventListener('change', e => {
      const t = e.target; if (!t.dataset.cqty) return;
      const root = cmpRootW(key); if (!root) return; const sc = cmpScopeW(root, t.dataset.s); sc.qty = sc.qty || {};
      const v = t.value.replace(/,/g, '').trim();
      if (v === '' || !(+v > 0)) delete sc.qty[t.dataset.i]; else sc.qty[t.dataset.i] = +v;
      cmpRefresh();
    });
  });
}
/** แถวมวลรวมที่ราคายังไม่ครบและยังไม่ได้ยอมรับ */
function cmpAcceptable(pr) {
  if (!S.db) return [];
  const ctx = cmpCtx();
  return pr.filter(r => r.ref && r.ref.kind === 'comp' && r.mat_unit === null).filter(r => { const root = cmpRootR(r.key) || { code: r.ref.code }; const st = BoqBind.cmpState(ctx, root, root, 0); return st && !st.complete && !st.acc; }).map(r => r.key);
}
function cmpAcceptAll(keys) {
  if (!confirm(`ยอมรับราคาไม่ครบ ${keys.length} รายการ?\nราคาจะรวมเฉพาะวัสดุย่อยที่มีราคาแล้ว (ที่ขาดคิดเป็น 0) และระบุในที่มาของราคา — ตรวจแต่ละแถวได้ภายหลัง`)) return;
  keys.forEach(k => { const root = cmpRootW(k); if (root) BoqBind.cmpAccept(cmpCtx(), root, root, 0); });
  cmpRefresh(); toast(`ยอมรับราคาไม่ครบ ${keys.length} รายการแล้ว`);
}
/** หน้าต่างเลือกราคาของบรรทัดในมวลรวม: พาณิชย์ / มวลรวม / ราคาสืบ */
function bindLineOpen(key, sub, ln) {
  if (!S.db) return;
  const r = S.priced.find(x => x.key === key); if (!r) return;
  const m = bqEl();
  BQ.key = key; BQ.side = 'line'; BQ.line = { sub, index: ln.index, name: ln.name, unit: ln.unit, itemCode: ln.itemCode || '' }; BQ.fl = {}; BQ.fprov = '';
  const fake = { key, name: ln.name, unit: ln.unit, ref: {} }, P = bqPools(fake);
  BQ.tab = 'mat';
  for (const k of ['mat', 'comp', 'survey']) { const t = P[k], x = bqSearch(t.pool, ln.name, t.hay, { unit: ln.unit, unitOf: t.unit }); if (!x.fallback && x.full) { BQ.tab = k; break; } }
  $('#bq-title').textContent = 'เลือกราคาวัสดุในมวลรวม';
  $('#bq-label').innerHTML = `วัสดุ: <b>${esc(ln.name)}</b> · หน่วย ${esc(ln.unit || '—')} · ในมวลรวม ${esc(sub || r.ref.code)} ของรายการ "${esc(r.name)}" · ระบบแปลงหน่วยให้เมื่อทำได้`;
  $('#bq-q').value = ln.name || '';
  m.classList.add('on'); bqList(); $('#bq-q').focus(); $('#bq-q').select();
  if (!BQ.lib) Survey.libAll().then(a => { BQ.lib = a || []; if (BQ.key && BQ.tab === 'survey') bqList(); }).catch(() => { BQ.lib = []; });
}
const lineSubKey = L => L.itemCode ? 'sub:' + L.itemCode : 'subn:' + String(L.name || '').replace(/\s+/g, ' ').trim() + '|' + (L.unit || '');
async function bqPickLine(r, d) {
  const L = BQ.line, root = cmpRootW(r.key); if (!root) return;
  const sc = cmpScopeW(root, L.sub); sc.lines = sc.lines || {};
  let link;
  if (BQ.tab === 'mat') link = { kind: 'mat', code: d.code, label: d.name };
  else if (BQ.tab === 'comp') { if (d.sub === (L.sub || root.code)) return toast('เลือกมวลรวมตัวเองซ้อนตัวเองไม่ได้'); link = { kind: 'comp', code: d.sub, label: d.sub + ' ' + d.name }; }
  else if (d.src === 'prj') link = { kind: 'survey', key: d.it.target, label: d.it.name };
  else {   // จากคลัง → รายการสืบของวัสดุย่อยนี้ในโครงการ ผูกกับรายการในคลัง (ไม่สร้างรายการใหม่ในคลัง)
    const item = svItem({ target: lineSubKey(L), name: L.name, unit: L.unit, ref: L.itemCode ? 'c:' + L.itemCode : '' });
    await libUse(item, d.x); link = { kind: 'survey', key: item.target, label: d.x.name };
  }
  sc.lines[L.index] = link; if (sc.prices) delete sc.prices[L.index];
  linkRemember(L.name, 'mat', link);
  autosave(); bqClose(); renderPR1(); renderSummary(); renderSurvey(); toast(`ผูกราคา "${L.name}" แล้ว`);
}

// ------------------------------------------------------------------ แถว % ของรายการอื่น (ก้อน 4c ตาม Cost Hub — หลักเกณฑ์งานอาคาร 2569 ข้อ 4.3–4.4)
const UNIT_M = /^(ม\.?|เมตร|m)$/i;
const PCT_PRESETS = (() => {
  const lc = n => String(n || '').toLowerCase();
  const conduit = n => /ท่อร้อยสาย|conduit|\b(imc|emt|rsc)\b|ท่อ\s*(imc|emt|rsc)/i.test(lc(n));
  const wire = n => /สายไฟ|\b(vct|vctf|thw|nyy|cv|vaf|iec)\b/i.test(lc(n));
  const ppr = n => /p\.?p-?r|พีพีอาร์|\bpb\b|พีบี|hdpe|เอชดีพีอี/i.test(lc(n));
  const drain = n => /ระบาย|น้ำทิ้ง|โสโครก|น้ำเสีย|ท่อ\s*ส้วม|ระบายอากาศ/i.test(lc(n)) && !ppr(n);
  const water = n => /ประปา|น้ำดี/i.test(lc(n)) && /pvc|พีวีซี/i.test(lc(n)) && !ppr(n);
  const out = [
    { id: 'e_conduit', grp: 'งานระบบไฟฟ้า', name: 'งานเบ็ดเตล็ดท่อร้อยสายไฟ', pct: 15, lab: null, of: 'ค่าท่อร้อยสายไฟ', test: conduit, hint: 'ท่อร้อยสายไฟทุกขนาด · ไม่มีค่าแรง' },
    { id: 'e_wire', grp: 'งานระบบไฟฟ้า', name: 'งานเบ็ดเตล็ดสายไฟ', pct: 5, lab: null, of: 'ค่าสายไฟ', test: wire, hint: 'สายไฟทุกขนาด · ไม่มีค่าแรง' },
  ];
  [['d', 'ท่อระบายน้ำ PVC', drain, [40, 30, 10]], ['w', 'ท่อประปา PVC', water, [50, 30, 10]], ['p', 'ท่อ PP-R / PB / HDPE', ppr, [50, 20, 10]]].forEach(([k, nm, t, pc]) => {
    [['fit', 'ข้อต่อ', pc[0]], ['sup', 'เหล็กยึด', pc[1]], ['test', 'ทดสอบ ทำความสะอาด ทาสีสัญลักษณ์', pc[2]]].forEach(([pk, pn, v]) => {
      out.push({ id: 's_' + k + '_' + pk, grp: 'งานระบบสุขาภิบาล — ' + nm, name: 'งาน' + pn + nm, pct: v, lab: 30, of: 'ค่า' + nm, test: t, hint: 'ท่อชนิดนี้ทุกขนาด · ค่าแรง 30% ของค่าวัสดุ' });
    });
  });
  return out;
})();
function pctInit(r) {   // ค่าเริ่ม: ที่ผูกเองไว้ → แถว % จากตัวถอดปริมาณ (ข้อต่อท่อ) → ว่าง
  const m = ((S.boq.bind || {})[r.key] || {}).mat, a = r.ref && r.ref.kind === 'pct' ? r.ref : null;
  BQ.pct = m && m.kind === 'pct' ? { key: r.key, sel: (m.of || []).slice(), pct: m.pct, preset: m.preset || '', filter: '' }
    : { key: r.key, sel: a ? (a.of || []).slice() : [], pct: a ? +(a.mat * 100).toFixed(2) : '', preset: '', filter: '' };
}
const pctCand = r => S.priced.filter(x => x.key !== r.key && !(x.ref && x.ref.kind === 'pct'));
function pctAuto(r) { const ps = PCT_PRESETS.find(x => x.id === BQ.pct.preset); if (ps) BQ.pct.sel = pctCand(r).filter(x => UNIT_M.test(String(x.unit || '').trim()) && ps.test(x.name)).map(x => x.key); }
function pctSumHtml() {
  const P = BQ.pct, by = Object.fromEntries(S.priced.map(x => [x.key, x])), pc = +P.pct || 0;
  const base = r2(P.sel.reduce((a, k) => a + ((by[k] && by[k].mat_amt) || 0), 0)), miss = P.sel.filter(k => by[k] && by[k].mat_unit === null).length;
  return `เลือกแล้ว ${P.sel.length} รายการ · รวมค่าวัสดุ ${bqF2(base)} บาท${pc > 0 ? ` → ${pc}% = <b>${bqF2(r2(base * pc / 100))}</b> บาท` : ''}${miss ? ` <span class="warnline" style="display:inline">${miss} รายการที่เลือกยังไม่มีราคา</span>` : ''}`;
}
function pctSum() { const e = $('#bq-psum'); if (e) e.innerHTML = pctSumHtml(); }
function pctFilter() { const q = bqNorm((BQ.pct && BQ.pct.filter) || ''); document.querySelectorAll('#bq-list [data-rk]').forEach(el => { el.style.display = !q || bqNorm(el.textContent).includes(q) ? '' : 'none'; }); }
function pctHtml(r) {
  if (!BQ.pct || BQ.pct.key !== r.key) pctInit(r);
  const P = BQ.pct, grps = [...new Set(PCT_PRESETS.map(x => x.grp))], ps = PCT_PRESETS.find(x => x.id === P.preset), nm = rowNums(rows());
  const opts = '<option value="">กำหนดเอง (ไม่ใช้ชุดสำเร็จรูป)</option>' + grps.map(g => `<optgroup label="${esc(g)}">${PCT_PRESETS.filter(x => x.grp === g).map(x => `<option value="${x.id}" ${P.preset === x.id ? 'selected' : ''}>${esc(x.name)} — ${x.pct}%</option>`).join('')}</optgroup>`).join('');
  const list = pctCand(r).map(x => { const isM = UNIT_M.test(String(x.unit || '').trim());
    return `<label class="bq-item" data-rk="${esc(x.key)}"><input type="checkbox" data-pk="${esc(x.key)}" ${P.sel.includes(x.key) ? 'checked' : ''}><div class="bq-iname">${nm[x.key] ? nm[x.key] + '. ' : ''}${esc(x.name)}<div class="hint">${fmt(x.qty)} ${esc(x.unit || '')}${isM ? '' : ' · หน่วยไม่ใช่ ม.'}</div></div><div class="bq-iprice">${x.mat_unit === null ? '<span class="warnline" style="display:inline">ยังไม่มีราคา</span>' : bqF2(x.mat_amt) + ' บาท'}</div></label>`; }).join('');
  return `<div class="bq-pad pct"><div class="hint" style="flex-basis:100%">ค่าวัสดุของรายการนี้ = % ของค่าวัสดุรวมของรายการที่เลือก (หลักเกณฑ์งานอาคาร 2569) · ราคาตามรายการฐานเปลี่ยนเองเมื่อรายการฐานเปลี่ยน</div>
    <select id="bq-pre">${opts}</select> <label>เปอร์เซ็นต์ <input id="bq-pv" class="price sm" inputmode="decimal" value="${esc(P.pct)}"> %</label>
    ${ps ? `<div class="hint" style="flex-basis:100%">${esc(ps.hint)} · ระบบเลือกรายการหน่วย ม. ที่ชื่อเข้าข่ายให้เบื้องต้น ตรวจและแก้ได้</div>` : ''}
    <div style="flex-basis:100%;display:flex;gap:6px;flex-wrap:wrap"><input id="bq-pf" placeholder="กรองรายการด้วยชื่อ" value="${esc(P.filter)}" style="max-width:240px">${ps ? '<button class="btn small" data-pa="auto">เลือกตามชนิดท่อ/สายอัตโนมัติ</button>' : ''}<button class="btn small" data-pa="allm">เลือกทุกรายการหน่วย ม.</button><button class="btn small" data-pa="clear">ล้างที่เลือก</button></div>
    <div class="pct-rows" style="flex-basis:100%">${list || '<div class="hint bq-note">ไม่มีรายการอื่นให้เลือก</div>'}</div>
    <div id="bq-psum" style="flex-basis:100%">${pctSumHtml()}</div>
    <div style="flex-basis:100%"><button class="btn small primary" data-pa="ok">ใช้การคิดนี้</button></div></div>`;
}
function pctAct(r, a) {
  const P = BQ.pct;
  if (a === 'clear') P.sel = [];
  else if (a === 'auto') pctAuto(r);
  else if (a === 'allm') P.sel = pctCand(r).filter(x => UNIT_M.test(String(x.unit || '').trim())).map(x => x.key);
  else if (a === 'ok') {
    const pc = +P.pct; if (!P.sel.length || P.pct === '' || !(pc >= 0)) return toast('เลือกรายการฐานอย่างน้อย 1 รายการ และกรอกเปอร์เซ็นต์');
    const ps = PCT_PRESETS.find(x => x.id === P.preset), m = { kind: 'pct', of: P.sel.slice(), pct: pc };
    if (ps) { m.preset = ps.id; m.ofLabel = ps.of; }
    const c = (S.boq.custom_rows || []).find(x => x.key === r.key);   // รายการที่เพิ่มเอง: ตั้งชื่อ/หน่วยตามชุดสำเร็จรูป
    if (c) { if (ps && (!c.name || c.name === 'รายการใหม่')) c.name = ps.name; if (!c.unit || c.unit === 'หน่วย') c.unit = 'งาน'; if (!(+c.qty > 0)) c.qty = 1; }
    const b = (S.boq.bind || {})[r.key] || {};
    if (ps && !b.lab) bindSide(r.key, 'lab', ps.lab === null ? { kind: 'none' } : { kind: 'pctmat', pct: ps.lab });
    BQ.pct = null; return bqSet(r, m);
  }
  bqList();
}

// ------------------------------------------------------------------ ความจำการผูก + คำแนะนำ (ก้อน 4d ตาม Cost Hub)
// จำการผูกที่ผู้ใช้เลือกเองตามชื่อรายการ — ที่เก็บเดียวกับ UD Cost Hub (localStorage โดเมนเดียวกัน → ผูกในเว็บหนึ่ง อีกเว็บจำด้วย)
// {mat: {ชื่อ: {kind:'mat'|'comp'|'survey'|'none', code|key, label}}, lab: {ชื่อ: {kind:'wage'|'none', code, label}}} · survey.key = คีย์รายการในคลังราคาสืบ
// ใช้เป็นคำแนะนำ + ปักบนสุดในหน้าต่างผูกราคาเท่านั้น ไม่ทับการผูกอัตโนมัติ (Earth 19 พ.ย. 2569)
const LINK_KEY = 'udCostHub_boqlink_v1';
const linkNorm = n => BoqImport.norm(n).toLowerCase();
function linkMem() { try { const m = JSON.parse(localStorage.getItem(LINK_KEY)); return m && typeof m === 'object' ? { mat: m.mat || {}, lab: m.lab || {} } : { mat: {}, lab: {} }; } catch (e) { return { mat: {}, lab: {} }; } }
function linkRemember(name, side, v) {
  try {
    if (!name || !v || !['mat', 'comp', 'survey', 'none', 'wage'].includes(v.kind)) return;
    let val = { kind: v.kind, label: v.label || '' };
    if (v.kind === 'survey') { const it = (S.boq.surveys || {})[v.key]; if (!it || !it.lib) return; val.key = it.lib; val.label = it.libName || val.label; }   // จำเป็นคีย์คลัง (ใช้ข้ามโครงการ/ข้ามเว็บ)
    else if (v.kind !== 'none') val.code = v.code;
    const m = linkMem(), b = side === 'lab' ? 'lab' : 'mat'; m[b][linkNorm(name)] = val;
    const ks = Object.keys(m[b]); if (ks.length > 1500) delete m[b][ks[0]];
    localStorage.setItem(LINK_KEY, JSON.stringify(m));
  } catch (e) { /* ไม่มี storage */ }
}
/** การผูกที่เคยจำไว้ของชื่อนี้ (ตรงกัน หรือคล้าย ≥ 0.72 และตัวเลขในชื่อตรงกัน) */
function linkFind(name, side) {
  const mem = linkMem()[side === 'lab' ? 'lab' : 'mat'], k0 = linkNorm(name || ''); if (!k0) return [];
  if (mem[k0]) return [mem[k0]];
  return Object.keys(mem).map(k => ({ k, s: BoqImport.similar(name, k) })).filter(o => o.s >= 0.72).sort((a, b) => b.s - a.s).slice(0, 3).map(o => mem[o.k]);
}
/** id ของรายการที่เคยผูกไว้ในแท็บนี้ (ปักบนสุด) */
function linkPrefIds(name, side, tab) {
  const want = tab === 'wage' ? 'wage' : tab, out = new Set();
  linkFind(name, side === 'line' ? 'mat' : side).filter(v => v.kind === want).forEach(v => {
    if (v.kind === 'survey') { out.add('l:' + v.key); Object.values(S.boq.surveys || {}).filter(it => it.lib === v.key).forEach(it => out.add('p:' + it.target)); }
    else out.add(v.code);
  });
  return out;
}
function linkExport() {
  const m = linkMem(), n = Object.keys(m.mat).length + Object.keys(m.lab).length;
  if (!n) return toast('ยังไม่มีความจำการผูก — เมื่อผูกวัสดุ/ค่าแรงเอง ระบบจะจำไว้ให้');
  const d = new Date();
  download(`UD-ความจำการผูกBOQ_${d.getFullYear() + 543}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`, JSON.stringify({ format: 'ud-costhub-boqlink', version: 1, exportedAt: d.toISOString(), mat: m.mat, lab: m.lab }));
  toast(`ส่งออกความจำการผูก ${n} รายการ`);
}
/** รวมความจำการผูกจากไฟล์ (รูปแบบเดียวกับ Cost Hub) — ตรวจชนิด/ตัดความยาว ไม่เชื่อไฟล์ */
function linkImport(d) {
  if (!d || d.format !== 'ud-costhub-boqlink') throw new Error('ไม่ใช่ไฟล์ความจำการผูก BOQ');
  const str = v => typeof v === 'string' ? v.slice(0, 300) : '';
  const clean = (o, kinds) => { const out = {}; Object.keys(o && typeof o === 'object' ? o : {}).slice(0, 5000).forEach(k => {
    const v = o[k]; if (!v || typeof v !== 'object' || !kinds.includes(v.kind)) return;
    const c = { kind: v.kind }; if (v.kind === 'survey') c.key = str(v.key); else if (v.kind !== 'none') c.code = str(v.code);
    if (v.kind !== 'none' && !(c.key || c.code)) return; c.label = str(v.label); out[str(k).toLowerCase()] = c; }); return out; };
  const add = { mat: clean(d.mat, ['mat', 'comp', 'survey', 'none']), lab: clean(d.lab, ['wage', 'none']) };
  const nA = Object.keys(add.mat).length + Object.keys(add.lab).length; if (!nA) throw new Error('ไม่พบรายการที่ใช้ได้ในไฟล์');
  const cur = linkMem(), added = Object.keys(add.mat).filter(k => !cur.mat[k]).length + Object.keys(add.lab).filter(k => !cur.lab[k]).length;
  localStorage.setItem(LINK_KEY, JSON.stringify({ mat: Object.assign({}, cur.mat, add.mat), lab: Object.assign({}, cur.lab, add.lab) }));
  return { nA, added };
}

/** คำแนะนำของแถวที่ยังไม่มีราคาฝั่งนั้นและยังไม่ได้ผูกเอง: ความจำการผูก → พจนานุกรมงานทั่วไป (boqsuggest) */
function sugResolve(r) {
  if (!S.db || !r || !String(r.name || '').trim()) return null;
  const b = (S.boq.bind || {})[r.key] || {}, ref = r.ref || {};
  const needMat = !b.mat && r.mat_unit === null && !r.lab_only && ref.kind !== 'pct' && !(ref.kind === 'comp');
  const needLab = !b.lab && r.lab_unit === null && !ref.lab_none && !ref.no_lab && ref.kind !== 'pct';
  if (!needMat && !needLab) return null;
  const out = { why: '' };
  const okMem = v => {
    if (v.kind === 'none') return { kind: 'none', label: 'ไม่มี (รวมในค่าอื่นแล้ว)' };
    if (v.kind === 'mat') { const d = S.db.material(v.code); return d && d.price !== null ? { kind: 'mat', code: d.code, label: `พาณิชย์ ${d.code} ${d.name}` } : null; }
    if (v.kind === 'comp') { const c = S.db.findComp(v.code); return c ? { kind: 'comp', code: c.sub, label: `วัสดุมวลรวม ${c.sub} ${c.name}` } : null; }
    if (v.kind === 'survey') { const x = (BQ.lib || []).find(y => y.key === v.key); return x && Survey.summary(x).price !== null ? { kind: 'survey', libx: x, label: 'ราคาสืบ ' + x.name } : null; }
    if (v.kind === 'wage') { const w = S.db.wage(v.code); return w && w.price !== null ? { kind: 'wage', code: w.code, label: `ว480 ${w.code} ${bqWn(w)}` } : null; }
    return null;
  };
  const fromMem = side => { for (const v of linkFind(r.name, side)) { const x = okMem(v); if (x) return x; } return null; };
  if (needMat) { const x = fromMem('mat'); if (x) { out.mat = x; out.why = 'เคยผูกชื่อนี้ไว้'; } }
  if (needLab) { const x = fromMem('lab'); if (x && x.kind !== 'mat') { out.lab = x; out.why = 'เคยผูกชื่อนี้ไว้'; } }
  if ((needMat && !out.mat) || (needLab && !out.lab)) {
    const sg = window.BoqSuggest && BoqSuggest.suggest({ name: r.name, unit: r.unit, qty: r.qty });
    if (sg) {
      const pick = a => a.find(d => /อุดร/.test(d.province || '')) || a[0];
      if (needMat && !out.mat) {
        if (sg.mat && sg.mat.kind === 'mat') {
          let c = null;
          if (sg.mat.codes) { for (const code of sg.mat.codes) { const d = S.db.material(code); if (d && d.price !== null) { c = d; break; } } }
          else if (sg.mat.re) { try { const re = new RegExp(sg.mat.re); const a = S.db.materials.filter(d => d.price !== null && re.test(d.name || '')); if (a.length) c = pick(a); } catch (e) { /* */ } }
          if (c) out.mat = { kind: 'mat', code: c.code, label: `พาณิชย์ ${c.code} ${c.name}` };
        } else if (sg.mat && sg.mat.kind === 'comp') { const c = S.db.findComp(sg.mat.code); if (c) out.mat = { kind: 'comp', code: c.sub, label: `วัสดุมวลรวม ${c.sub} ${c.name}` }; }
        else if (sg.lab_none_mat) out.mat = { kind: 'none', label: 'ไม่มี (รวมในค่าอื่นแล้ว)' };
      }
      if (needLab && !out.lab) {
        if (sg.lab && sg.lab.kind === 'none') out.lab = { kind: 'none', label: 'ไม่มี (รวมในค่าอื่นแล้ว)' };
        else if (sg.lab && sg.lab.kind === 'wage') { const w = S.db.wage(sg.lab.code); if (w && w.price !== null) out.lab = { kind: 'wage', code: w.code, label: `ว480 ${w.code} ${bqWn(w)}` }; }
      }
      if (out.mat || out.lab) out.why = out.why || sg.why || 'พจนานุกรมงานทั่วไป';
      if (sg.matNote) out.note = sg.matNote;
    }
  }
  return out.mat || out.lab ? out : null;
}
function sugHtml(r) {
  const s = sugResolve(r); if (!s) return '';
  const bits = [];
  if (s.mat) bits.push(`วัสดุ: ${esc(s.mat.label)} <a class="pk-link" data-sug="mat">ใช้</a>`);
  if (s.lab) bits.push(`ค่าแรง: ${esc(s.lab.label)} <a class="pk-link" data-sug="lab">ใช้</a>`);
  return `<div class="sug no-print">แนะนำ (${esc(s.why)}): ${bits.join(' · ')}${s.note ? `<div class="hint">${esc(s.note)}</div>` : ''}</div>`;
}
async function sugApply(r, which) {
  const s = sugResolve(r); if (!s) return 0; let n = 0;
  for (const side of ['mat', 'lab']) {
    if ((which !== side && which !== 'all') || !s[side]) continue;
    let v = s[side];
    if (v.kind === 'survey') { const item = svItem({ target: 'row:' + r.key, name: r.name, unit: r.unit, ref: refOfRow(r) }); await libUse(item, v.libx); v = { kind: 'survey', key: item.target, label: v.label }; }
    else v = Object.assign({}, v);
    bindSide(r.key, side, v); linkRemember(r.name, side, v); n++;
  }
  return n;
}
function sugRows() { return (S.priced || []).filter(r => sugResolve(r)); }
async function sugApplyAll() {
  const list = sugRows(); if (!list.length) return toast('ไม่มีคำแนะนำที่ใช้ได้');
  if (!confirm(`ใช้คำแนะนำกับ ${list.length} รายการ (เฉพาะช่องที่ยังไม่มีราคาและยังไม่ได้ผูกเอง)?\nควรตรวจแต่ละแถวอีกครั้ง — ยกเลิกทีละแถวได้ด้วยปุ่ม ↺`)) return;
  let n = 0; for (const r of list) n += await sugApply(r, 'all');
  renderPR1(); renderSummary(); renderSurvey(); toast(`ใช้คำแนะนำแล้ว ${n} ช่อง`);
}
function sugBindEvents(tb) {
  tb.querySelectorAll('.sug [data-sug]').forEach(a => a.onclick = async e => {
    e.stopPropagation(); const key = a.closest('tr').dataset.key, r = S.priced.find(x => x.key === key); if (!r) return;
    if (await sugApply(r, a.dataset.sug)) { renderPR1(); renderSummary(); renderSurvey(); toast('ใช้คำแนะนำแล้ว — ยกเลิกได้ด้วยปุ่ม ↺'); }
  });
}
function linkLibWarm() { if (!BQ.lib && !BQ.libLoading && window.Survey) { BQ.libLoading = true; Survey.libAll().then(a => { BQ.lib = a || []; BQ.libLoading = false; if (Object.keys(linkMem().mat).length) renderPR1(); }).catch(() => { BQ.lib = []; BQ.libLoading = false; }); } }
