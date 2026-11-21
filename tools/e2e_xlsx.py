#!/usr/bin/env python3
"""ทดสอบครบวงจร ส่งออก Excel ปร. (M2 ก้อน 7) — เปิดหน้า boq จริงใน Chrome → โหลดโมเดล + ราคาจริง (Google Sheet ของ Cost Hub)
→ คิดราคา → ส่งออก Excel ด้วยโค้ดเดียวกับปุ่ม → LibreOffice คำนวณสูตรใหม่ → เทียบยอดกับเว็บทุกสตางค์ + ตรวจแผ่นที่มาของราคา

ใช้:  python3 tools/e2e_xlsx.py <โมเดล.bm.json> [--boq <.boq.json>] [--out <โฟลเดอร์>] [--pricing <โฟลเดอร์ UDmaterial-price>]
ต้องมี: playwright (python) · Chrome /usr/bin/google-chrome · soffice · openpyxl
ห้ามเปิด http.server — หน้าเว็บเสิร์ฟด้วย route ของ Playwright (http://ts.test/ → repo นี้ · UDmaterial-price → ไฟล์ในเครื่อง)
auth/matfs จำลอง (ผู้ใช้อนุมัติแล้ว · คลังวัสดุว่าง) · เครือข่ายอื่น (ราคา Google Sheet, CDN) ผ่าน proxy ของเครื่อง
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('model'); ap.add_argument('--boq'); ap.add_argument('--out', default='/tmp/e2e_xlsx')
ap.add_argument('--pricing', default=str(REPO.parent / 'udmaterial-price'))
ap.add_argument('--modes', default='estimate,central,repair')
A = ap.parse_args()
OUT = Path(A.out); OUT.mkdir(parents=True, exist_ok=True)
PRICING = Path(A.pricing)

from playwright.sync_api import sync_playwright
import openpyxl

AUTH_STUB = """window.UDAuth = { _s: {ready:true, user:{uid:'t', email:'t@test'}, profile:{name:'ผู้ทดสอบ', position:'วิศวกรโยธา'}, access:{status:'approved', role:'admin'}},
  on(fn){ fn(Object.assign({}, this._s)); }, state(){ return Object.assign({}, this._s); }, signIn(){}, signOut(){}, store: null };
window.dispatchEvent(new Event('udauth-loaded'));"""
MATFS_STUB = """window.UDMatFS = { list: async () => [], put: async m => Object.assign({id:'M-t'}, m), del: async () => {}, who: () => ({uid:'t', name:'ผู้ทดสอบ'}) };
window.dispatchEvent(new Event('udmatfs'));"""
CT = {'.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.xlsx': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png'}

fails = []
def chk(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

def recalc(src: Path) -> Path:
    """LibreOffice เปิดแล้วคำนวณสูตรทุกช่องใหม่ (ตั้งโปรไฟล์ให้ OOXML คำนวณใหม่เสมอ) แล้วบันทึกเป็น xlsx"""
    prof = Path(tempfile.mkdtemp(prefix='lo_'))
    (prof / 'user').mkdir()
    (prof / 'user' / 'registrymodifications.xcu').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>''', encoding='utf-8')
    od = Path(tempfile.mkdtemp(prefix='lo_out_'))
    subprocess.run(['soffice', f'-env:UserInstallation=file://{prof}', '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', str(od), str(src)],
                   check=True, capture_output=True, timeout=180)
    out = od / src.name
    dst = src.with_name(src.stem + '.recalc.xlsx'); shutil.move(str(out), dst)
    shutil.rmtree(prof, ignore_errors=True); shutil.rmtree(od, ignore_errors=True)
    return dst

def near(a, b): return a is not None and b is not None and abs(float(a) - float(b)) < 0.005

def run():
    model = json.loads(Path(A.model).read_text(encoding='utf-8'))
    boq = json.loads(Path(A.boq).read_text(encoding='utf-8')) if A.boq else None
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
                               args=['--ignore-certificate-errors', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] + ([f'--proxy-server={proxy}'] if proxy else []))
        ctx = br.new_context(accept_downloads=True, ignore_https_errors=True)
        def local(route, base: Path, rel: str):
            f = base / rel.split('?')[0]
            if not f.is_file(): return route.fulfill(status=404, body='')
            route.fulfill(status=200, body=f.read_bytes(), headers={'content-type': CT.get(f.suffix, 'application/octet-stream'), 'cache-control': 'no-store'})
        ctx.route('http://ts.test/**', lambda r: (r.fulfill(status=200, body=AUTH_STUB, headers={'content-type': 'application/javascript'}) if r.request.url.split('?')[0].endswith('/lib/auth.js')
                                                else r.fulfill(status=200, body=MATFS_STUB, headers={'content-type': 'application/javascript'}) if r.request.url.split('?')[0].endswith('/lib/matfs.js')
                                                else local(r, REPO, r.request.url.split('http://ts.test/', 1)[1])))
        ctx.route('https://ppaocharoen.github.io/UDmaterial-price/**', lambda r: local(r, PRICING, r.request.url.split('/UDmaterial-price/', 1)[1]))
        ctx.route('https://www.gstatic.com/firebasejs/**', lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        pg.goto('http://ts.test/boq/index.html', wait_until='domcontentloaded', timeout=120000)
        pg.wait_for_function('typeof S !== "undefined" && S.db && S.db.wages && S.db.wages.length > 0', timeout=180000)
        print('ราคา:', pg.evaluate('S.db.period'), '· ค่าแรง', pg.evaluate('S.db.wages.length'), 'รายการ')
        pg.evaluate('([m, n, b]) => { loadModel(m, n); if (b) { S.boq = Object.assign(newBoq(), b); S.boq.plan = Object.assign(newPlan(), S.boq.plan || {}); normProject(); BoqBind.migrate(S.boq); applySurvey(); renderAll(); } }',
                    [Path(A.model).read_text(encoding='utf-8'), Path(A.model).name, boq])
        pg.wait_for_timeout(1500)
        chk(not errs, 'ไม่มี error ในหน้า' + (' — ' + '; '.join(errs[:3]) if errs else ''))
        for mode in [m for m in A.modes.split(',') if m]:
            pg.evaluate("""m => { const p = S.boq.project; p.mode = m; p.name = p.name || 'ทดสอบส่งออก ท12'; p.location = p.location || 'เทศบาลนครอุดรธานี';
                p.agency = p.agency || 'กองช่าง เทศบาลนครอุดรธานี'; p.calc_date = p.calc_date || '2026-11-21'; p.roundTo = 1000; if (m === 'repair') p.vat = '1'; }""", mode)
            T = pg.evaluate("""() => { const T = totals(); return { secs: T.secs.map(s => ({c: s.c, cost: s.cost, build: s.build})), cost: T.cost, F: T.ff.F, build: T.build,
                eqTotal: T.eqTotal, sp: T.sp, grand: T.grand, pr4: T.pr4, nRows: T.pr.length, nNo: T.pr.filter(r => r.warns.includes('ยังไม่มีราคา')).length,
                priced: T.pr.filter(r => r.mat_unit !== null || r.lab_unit !== null).length,
                rows: T.pr.map(r => ({key: r.key, name: r.name, qty: r.qty, mat: r.mat_unit, lab: r.lab_unit, ms: r.mat_src, ls: r.lab_src, kind: (r.ref || {}).kind || ''})) }; }""")
            print(f'\n== {mode}: {T["nRows"]} แถว · มีราคา {T["priced"]} · ไม่มีราคา {T["nNo"]} · ค่างานต้นทุน {T["cost"]:,.2f} · F {T["F"]} · ค่าก่อสร้าง {T["build"]:,.2f} · ปร.4 {T["pr4"]:,.2f}')
            # ส่งออกด้วยโค้ดเดียวกับปุ่ม (formData → FormXlsx.build → xlsxFinish)
            res = pg.evaluate("""async () => {
                if (!window.ExcelJS) await loadScript(EXCELJS.src, EXCELJS.sri);
                if (!window.FormXlsx) await loadScript('../lib/formxlsx.js');
                const buf = await (await fetch('form_template.xlsx')).arrayBuffer(), fd = formData();
                const o = await FormXlsx.build(window.ExcelJS, buf, fd), out = await xlsxFinish(o.wb);
                let s = ''; const u = new Uint8Array(out); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
                return { b64: btoa(s), rows: o.rows, src: fd.sources, pr4Text: fd.pr4Text, wm: !!window.XlsxWm, sections: fd.sections.map(x => x.code) }; }""")
            f = OUT / f't12_{mode}.xlsx'; f.write_bytes(base64.b64decode(res['b64']))
            chk(res['wm'], f'{mode}: โหลดตัวใส่ลายน้ำได้')
            check_file(f, T, res, mode)
        # ปุ่มจริงในหน้า (ดาวน์โหลดได้ ชื่อไฟล์ถูก)
        pg.evaluate("() => { S.boq.project.mode = 'estimate'; renderAll(); }")
        pg.click('[data-tab=pr1]')
        with pg.expect_download(timeout=120000) as dl:
            pg.click('#tab-pr1 [data-xlsx], [data-xlsx] >> nth=0')
        d = dl.value; fn = d.suggested_filename; d.save_as(str(OUT / ('ui_' + fn)))
        chk(fn.startswith('ประมาณราคา_') and fn.endswith('.xlsx'), f'ปุ่มส่งออกจริง ดาวน์โหลด {fn}')
        chk(not errs, 'ไม่มี error ในหน้าหลังส่งออก' + (' — ' + '; '.join(errs[:3]) if errs else ''))
        br.close()

def check_file(f: Path, T, res, mode):
    import zipfile
    z = zipfile.ZipFile(f)
    names = z.namelist()
    sheets_xml = [n for n in names if re.match(r'xl/worksheets/sheet\d+\.xml$', n)]
    chk('xl/media/watermark1.jpg' in names and any('legacyDrawingHF' in z.read(n).decode('utf-8') for n in sheets_xml), f'{mode}: มีลายน้ำในไฟล์')
    chk(not any('<outlinePr' in z.read(n).decode('utf-8') for n in sheets_xml), f'{mode}: ไม่มี outlinePr (Excel ไม่ถามกู้คืน)')
    rc = recalc(f)
    wb = openpyxl.load_workbook(rc, data_only=True)
    print('   แผ่น:', ', '.join(wb.sheetnames))
    s1 = wb['ปร.1']; rows = res['rows']
    # ยอดรวมหมวด ปร.1 (N ของแถวรวมหมวด) = ค่างานต้นทุนรายหมวดของเว็บ
    secs = T['secs']
    for i, rr in enumerate(rows['secTot']):
        v = s1[f'N{rr}'].value
        chk(near(v, secs[i]['cost']), f'{mode}: ปร.1 รวมหมวด {secs[i]["c"]} Excel {v} = เว็บ {secs[i]["cost"]}')
    g = s1[f'N{rows["pr1Grand"]}'].value
    chk(near(g, T['cost']), f'{mode}: ปร.1 รวมค่าวัสดุและแรงงาน Excel {g} = เว็บ {T["cost"]}')
    # ทุกแถวรายการ: ราคาต่อหน่วยตรงเว็บ
    web = [r for r in T['rows']]
    xl = []
    for r in range(1, s1.max_row + 1):
        if s1[f'B{r}'].value == '-' and s1[f'C{r}'].value:
            xl.append((s1[f'C{r}'].value, s1[f'H{r}'].value, s1[f'J{r}'].value, s1[f'L{r}'].value, s1[f'N{r}'].value))
    chk(len(xl) == len(web), f'{mode}: จำนวนแถวรายการ Excel {len(xl)} = เว็บ {len(web)}')
    bad = 0
    for (nm, q, mu, lu, n), w in zip(sorted(xl, key=lambda x: str(x[0])), sorted(web, key=lambda x: str(x['name']))):
        okq = near(q, w['qty']); okm = (mu is None and w['mat'] is None) or near(mu, w['mat']); okl = (lu is None and w['lab'] is None) or near(lu, w['lab'])
        if not (okq and okm and okl):
            bad += 1
            if bad <= 5: print(f'   ต่าง: {nm} · จำนวน {q}/{w["qty"]} · วัสดุ {mu}/{w["mat"]} · แรง {lu}/{w["lab"]}')
    chk(bad == 0, f'{mode}: จำนวน/ราคาต่อหน่วยทุกแถวตรงเว็บ (ต่าง {bad})')
    # ปร.1 (ก) / ปร.4
    s4 = wb['ปร.4']
    v4 = s4[f'H{rows["pr4Sum"]}'].value; vf = s4[f'H{rows["pr4Final"]}'].value
    chk(near(v4, T['grand']), f'{mode}: ปร.4 รวมทั้งโครงการ Excel {v4} = เว็บ {T["grand"]}')
    chk(near(vf, T['pr4']), f'{mode}: ปร.4 {"คิดเพียง" if mode != "central" else "ราคากลาง"} Excel {vf} = เว็บ {T["pr4"]}')
    # ยอดเป็นตัวหนังสือ: สูตร BAHTTEXT (LibreOffice ไม่รู้จัก → #NAME?) จึงตรวจค่าที่เก็บไว้ในไฟล์ (Excel แสดงทันทีที่เปิด และคำนวณใหม่ได้เอง)
    c0 = openpyxl.load_workbook(f, data_only=True)['ปร.4'][f'C{rows["pr4Final"] + 1}'].value or ''
    chk('บาท' in c0 and res['pr4Text'] in c0, f'{mode}: ปร.4 ยอดเป็นตัวหนังสือ (ค่าในไฟล์): {c0[:90]}')
    f0 = openpyxl.load_workbook(f)['ปร.4'][f'C{rows["pr4Final"] + 1}'].value or ''
    chk('BAHTTEXT(H' in str(f0), f'{mode}: ปร.4 ตัวหนังสือยังเป็นสูตร BAHTTEXT (แก้ตัวเลขใน Excel แล้วเปลี่ยนตาม)')
    if mode != 'repair':
        sa = wb['ปร.1 (ก)']
        ka = sa[f'K{rows["pr1aTot"]}'].value
        chk(near(ka, T['build']), f'{mode}: ปร.1 (ก) ค่าก่อสร้าง Excel {ka} = เว็บ {T["build"]}')
        ff = None
        for r in sa.iter_rows():
            for c in r:
                if isinstance(c.value, float) and 1 < c.value < 2 and abs(c.value - T['F']) < 1e-9: ff = c.value
        chk(ff is not None, f'{mode}: Factor F {T["F"]} อยู่ใน ปร.1 (ก)')
    # แผ่นที่มาของราคา
    chk('ที่มาของราคา' in wb.sheetnames, f'{mode}: มีแผ่น "ที่มาของราคา"')
    S = res['src'] or {}
    n = {k: len(S.get(k) or []) for k in ['commerce', 'wagesUsed', 'manual', 'pctRows', 'comps', 'surveys']}
    print('   ที่มาของราคา:', n)
    # ทุกแถวที่มีราคามีที่มาในแผ่น
    names_c = {u for x in S.get('commerce', []) for u in x.get('used', [])}
    names_w = {u.split(' — ')[0] for x in S.get('wagesUsed', []) for u in x.get('used', [])}
    names_m = {(x['name'], x['type']) for x in S.get('manual', []) + S.get('pctRows', [])}
    names_k = {u for x in S.get('comps', []) for u in x.get('used', [])}
    miss = []
    for w in web:
        if w['mat'] is not None and not str(w['ms']).startswith('ราคาสืบ') and w['ms'] not in ('ค่าแรงอย่างเดียว',):
            if not (w['name'] in names_c or w['name'] in names_k or (w['name'], 'ค่าวัสดุ') in names_m): miss.append('วัสดุ: ' + w['name'] + ' [' + str(w['ms']) + ']')
        if w['lab'] is not None:
            if not (w['name'] in names_w or (w['name'], 'ค่าแรง') in names_m): miss.append('ค่าแรง: ' + w['name'] + ' [' + str(w['ls']) + ']')
    for m in miss[:8]: print('   ไม่มีที่มา:', m)
    chk(not miss, f'{mode}: ทุกแถวที่มีราคามีที่มาในแผ่นที่มาของราคา (ขาด {len(miss)})')
    # มวลรวม: ผลรวมบรรทัด = ราคาใบ
    badc = [c['title'] for c in S.get('comps', []) if c.get('total') is not None and not c['title'].count('ไม่ครบ')
            and abs(sum((l.get('amount') or 0) for l in c['lines']) - c['total']) > 0.011]
    chk(not badc, f'{mode}: มวลรวมทุกใบ ผลรวมบรรทัด = ราคาต่อหน่วย ({len(S.get("comps", []))} ใบ){" ต่าง: " + ", ".join(badc[:3]) if badc else ""}')

run()
print(f'\nสรุป: {"ผ่านทั้งหมด" if not fails else "ไม่ผ่าน " + str(len(fails)) + " ข้อ"} · ไฟล์ที่ {OUT}')
sys.exit(1 if fails else 0)
