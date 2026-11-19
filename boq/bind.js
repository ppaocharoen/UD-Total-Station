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
  const prj = Object.values(S.boq.surveys || {}).filter(it => Survey.summary(it).price !== null)
    .map(it => ({ src: 'prj', id: 'p:' + it.target, it, name: it.name, unit: it.unit, s: Survey.summary(it) }));
  const linked = new Set(prj.map(x => x.it.lib).filter(Boolean));
  const lib = (BQ.lib || []).filter(x => !linked.has(x.key) && Survey.summary(x).price !== null)
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
const BQ_TABS = { mat: [['mat', 'พาณิชย์'], ['comp', 'วัสดุมวลรวม'], ['survey', 'ราคาสืบ'], ['manual', 'กรอกเอง'], ['none', 'ไม่มีค่าวัสดุ']],
  lab: [['wage', 'ค่าแรง ว480'], ['manual', 'กรอกเอง'], ['none', 'ไม่มีค่าแรง']] };
/** แท็บแรกที่เปิด: ชนิดที่ผูกไว้ → ชนิดของการผูกอัตโนมัติ → แท็บที่ชื่อรายการค้นเจอครบทุกคำ */
function bqBestTab(r, side) {
  const cur = ((S.boq.bind || {})[r.key] || {})[side];
  if (cur && BQ_TABS[side].some(t => t[0] === cur.kind)) return cur.kind;
  if (side === 'lab') return 'wage';
  const k0 = r.ref && r.ref.kind; if (k0 === 'comp') return 'comp'; if (k0 === 'mat' || k0 === 'mat_find') return 'mat';
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
function bqClose() { const m = $('#bind-modal'); if (m) m.classList.remove('on'); BQ.key = null; }
function bindOpen(key, side) {
  if (!S.db) return toast('ราคายังโหลดไม่เสร็จ');
  const r = S.priced.find(x => x.key === key); if (!r) return;
  const m = bqEl();
  BQ.key = key; BQ.side = side; BQ.fl = {}; BQ.fprov = ''; BQ.tab = bqBestTab(r, side);
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
  const side = BQ.side, q = $('#bq-q', m).value.trim(), P = bqPools(r), tabs = BQ_TABS[side];
  $('#bq-cur', m).innerHTML = bqCurHtml(r, side);
  const cnt = k => { const t = P[k]; if (!t) return ''; if (!q) return ` (${t.pool.length})`; const x = bqSearch(t.pool, q, t.hay, { unit: r.unit, unitOf: t.unit }); return ` (${x.fallback ? 0 : x.items.length})`; };
  $('#bq-tabs', m).innerHTML = tabs.map(([k, l]) => `<span class="chip ${BQ.tab === k ? 'on' : ''}" data-tab="${k}">${l}${cnt(k)}</span>`).join('');
  const T = P[BQ.tab], list = $('#bq-list', m), filt = $('#bq-filt', m);
  $('#bq-q', m).style.display = T ? '' : 'none'; filt.innerHTML = '';
  const cur = ((S.boq.bind || {})[r.key] || {})[side];
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
    const res = bqSearch(pool, q, T.hay, { unit: r.unit, unitOf: T.unit });
    const curId = cur && (cur.kind === 'survey' ? 'p:' + cur.key : cur.code), autoId = cur ? '' : bqAutoId(r, BQ.tab);
    items = res.items;
    const pin = [curId, autoId].map(id => id && T.pool.find(d => T.id(d) === id)).filter(Boolean);
    if (pin.length) items = pin.concat(items.filter(d => !pin.includes(d)));
    const fullAt = (!res.fallback && q && res.full > 0 && res.full < items.length) ? res.full + pin.filter(d => !res.items.slice(0, res.full).includes(d)).length : -1;
    const total = items.length; items = items.slice(0, BQ_MAXROWS);
    const note = (!res.fallback && q && res.full === 0 && res.items.length ? `<div class="hint bq-note">ไม่มีรายการที่ตรงครบทุกคำของ "${esc(q)}" — แสดงรายการที่ตรงบางคำ/ใกล้เคียง</div>` : '')
      + (res.fallback ? `<div class="hint bq-note">ไม่พบรายการที่มีคำของ "${esc(q)}" — แสดงทั้งหมดในแท็บนี้ (ลองพิมพ์คำเดียว หรือเลือกหมวด)</div>` : '')
      + (total > BQ_MAXROWS ? `<div class="hint bq-note">แสดง ${BQ_MAXROWS} จาก ${total} รายการ — พิมพ์เพิ่มหรือเลือกหมวดเพื่อกรอง</div>` : '');
    const row = (d, name, meta, price, i) => (i === fullAt ? '<div class="hint bq-note">ตรงบางคำเท่านั้น</div>' : '')
      + `<div class="bq-item ${(curId || autoId) && [curId, autoId].includes(T.id(d)) ? 'cur' : ''}" data-i="${i}"><div class="bq-iname">${esc(name)}${curId && T.id(d) === curId ? ' <span class="pill ok">ผูกอยู่</span>' : autoId && T.id(d) === autoId ? ' <span class="pill">ผูกอัตโนมัติอยู่</span>' : ''}<div class="hint">${meta}</div></div><div class="bq-iprice">${price}</div></div>`;
    if (BQ.tab === 'mat') html = items.map((d, i) => row(d, d.name, esc([d.code, d.catName, d.province].filter(Boolean).join(' · ')), d.price !== null ? bqF2(d.price) + ' / ' + esc(d.unit) : '—', i)).join('');
    else if (BQ.tab === 'comp') {
      const G = COMP_GROUPS();
      html = items.map((c, i) => { const pr = S.db.compPrice(c.id, {}); return row(c, c.sub + ' ' + c.name, esc(G[c.group] || ''), pr && pr.price !== null ? bqF2(pr.price) + ' / ' + esc(c.unit) : `คิดไม่ครบ (${esc(c.unit)})`, i); }).join('');
    } else if (BQ.tab === 'survey') {
      html = items.length ? items.map((x, i) => row(x, x.name, `${x.src === 'prj' ? 'ราคาสืบในโครงการนี้' + (x.it.lib ? ' · ผูกกับคลัง' : '') : 'คลังราคาสืบ' + (x.x.project ? ' · ' + esc(x.x.project) : '') + ` · ${Survey.ageDays(x.x.updated)} วันก่อน`} · ${x.s.n} เจ้า${x.s.n < Survey.MIN_Q ? ` (ไม่ครบ ${Survey.MIN_Q})` : ''} · ไม่รวม VAT`, bqF2(x.s.price) + ' / ' + esc(x.unit), i)).join('')
        : `<div class="hint bq-note">${BQ.lib ? 'ยังไม่มีราคาสืบที่ใช้ได้' : 'กำลังโหลดคลังราคาสืบ…'}</div>`;
    } else html = items.map((d, i) => row(d, bqWagePath(d).join(' › '), esc(d.code), d.price !== null ? bqF2(d.price) + ' / ' + esc(d.unit) : esc(d.rawPrice || '—'), i)).join('');
    html = note + html;
  } else if (BQ.tab === 'manual') {
    const v = cur && cur.kind === 'manual' ? cur.price : '';
    html = `<div class="bq-pad"><label>ราคาต่อหน่วย (บาท/${esc(r.unit || 'หน่วย')}) <input id="bq-mv" class="price" inputmode="decimal" value="${esc(v)}"></label> <button class="btn small primary" id="bq-mok">ใช้ราคานี้</button>
      <label class="wide">รายละเอียด / วิธีคิด / ที่มา (ไม่บังคับ — แสดงในที่มาของราคา)<input id="bq-mn" value="${esc(cur && cur.kind === 'manual' ? cur.note || '' : '')}"></label></div>`;
  } else {
    html = `<div class="bq-pad"><button class="btn small primary" id="bq-nok">${side === 'mat' ? 'ยืนยัน: รายการนี้ไม่มีค่าวัสดุ (ค่าแรงอย่างเดียว)' : 'ยืนยัน: รายการนี้ไม่มีค่าแรง (รวมในค่าอื่นแล้ว)'}</button></div>`;
  }
  list.innerHTML = html || '<div class="hint bq-note">ไม่พบรายการ</div>';
  $('#bq-foot', m).innerHTML = side === 'mat'
    ? `<span class="hint">ไม่มีในฐานข้อมูล?</span> <button class="btn small" data-svnew="1">+ สืบราคาใหม่</button> <button class="btn small" data-tab="manual">กรอกราคาเอง</button>`
    : `<button class="btn small" data-tab="manual">ไม่พบ — กรอกค่าแรงเอง</button>`;
  list.onclick = e => {
    const it = e.target.closest('.bq-item');
    if (it && T) { bqPickItem(r, items[+it.dataset.i]); return; }
    if (e.target.id === 'bq-mok') { const v = $('#bq-mv', m).value.replace(/,/g, '').trim(); if (v === '' || !isFinite(+v) || +v < 0) return toast('ใส่ราคาเป็นตัวเลข ≥ 0'); bqSet(r, { kind: 'manual', price: r2(+v), note: $('#bq-mn', m).value.trim() }); }
    if (e.target.id === 'bq-nok') bqSet(r, { kind: 'none' });
  };
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
