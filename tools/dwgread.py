#!/usr/bin/env python3
"""dwgread.py — อ่านแบบ DWG/DXF เป็น .bm.json (ขาอ่านแบบ รอบแรก: โครงสร้าง + ผนัง/ช่องเปิด)

หลักการ (ตกลงกับ Earth 20 ต.ค. 2569):
- ไม่พึ่งชื่อเลเยอร์ (แบบมาจากหลายสถาปนิก ชื่อเลเยอร์ไม่เป็นระบบ) — แยกชิ้นส่วนจากรูปทรง + ข้อความ + เส้นบอกระยะ
- ทุกอย่างที่ระบบเดา ติด status "assumed" และสรุปเป็นรายการถาม (questions) ให้ Earth ตอบ
- แยกแผ่นจากกรอบกระดาษใน Model space (กรอบบล็อกที่มีเลขแผ่น เช่น A.2.01 S.2.01 SN.2.01)

ขั้นตอน: dwg → dxf (LibreDWG dwg2dxf หรือ ODA File Converter) → ซ่อมข้อความหลายบรรทัด → ezdxf → แยกแผ่น → อ่านทีละชนิด

ใช้:  python tools/dwgread.py แบบ.dwg --out โครงการ.bm.json [--report report.json]
"""
import argparse, json, math, os, re, shutil, subprocess, sys, tempfile
from collections import Counter, defaultdict

SHEET_RE = re.compile(r'^(A|S|E|SN|EE|ME|AC|L)\.\d{1,2}\.\d{2}$')
TITLE_RE = re.compile(r'(แปลน|รูปด้าน|รูปตัด|แบบขยาย|รายการ|ผัง|ตาราง|ขยาย)')
PAPER = {'A4': (0.297, 0.210), 'A3': (0.420, 0.297), 'A2': (0.594, 0.420), 'A1': (0.841, 0.594)}


# ---------------------------------------------------------------- โหลดไฟล์
def dwg_to_dxf(path, workdir):
    """แปลง DWG เป็น DXF: LibreDWG (dwg2dxf) ถ้ามี ไม่งั้น ODA File Converter"""
    out = os.path.join(workdir, 'in.dxf')
    exe = shutil.which('dwg2dxf') or ('/opt/libredwg/bin/dwg2dxf' if os.path.exists('/opt/libredwg/bin/dwg2dxf') else None)
    if exe:
        env = dict(os.environ, LD_LIBRARY_PATH='/opt/libredwg/lib:' + os.environ.get('LD_LIBRARY_PATH', ''))
        subprocess.run([exe, '-y', '-o', out, path], check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return out
    oda = shutil.which('ODAFileConverter')
    if oda:
        src = os.path.join(workdir, 'src'); os.makedirs(src, exist_ok=True); shutil.copy(path, src)
        subprocess.run([oda, src, workdir, 'ACAD2018', 'DXF', '0', '1'], check=True)
        return os.path.join(workdir, os.path.splitext(os.path.basename(path))[0] + '.dxf')
    raise SystemExit('ไม่มีตัวแปลง DWG (ติดตั้ง LibreDWG หรือ ODA File Converter) — หรือส่งออกเป็น DXF จาก AutoCAD')


def sanitize_dxf(src, dst):
    """LibreDWG เขียนข้อความหลายบรรทัดออกมาแตกบรรทัด → รวมบรรทัดที่ไม่ใช่รหัสกลุ่มเข้ากับค่าก่อนหน้า"""
    raw = open(src, 'rb').read()
    nl = b'\r\n' if b'\r\n' in raw[:2000] else b'\n'
    L = raw.split(nl); out = []; i = 0; fixed = 0
    isint = re.compile(rb'^\s*-?\d+\s*$')
    while i < len(L) - 1:
        code, val = L[i], L[i + 1]; i += 2
        while i < len(L) and L[i] != b'' and not isint.match(L[i]):
            val += L[i]; i += 1; fixed += 1   # LibreDWG ตัดสตริงยาวกลางตัวอักษร → ต่อกันตรง ๆ
        out += [code, val]
    open(dst, 'wb').write(nl.join(out) + nl)
    return fixed


def load(path):
    import ezdxf
    from ezdxf import recover
    tmp = tempfile.mkdtemp(prefix='dwgread-')
    dxf = dwg_to_dxf(path, tmp) if path.lower().endswith('.dwg') else path
    fixed_path = os.path.join(tmp, 'fixed.dxf')
    fixed = sanitize_dxf(dxf, fixed_path)
    doc, aud = recover.readfile(fixed_path)
    return doc, {'source': os.path.basename(path), 'dxf_fixed_lines': fixed, 'recover_errors': len(aud.errors), 'recover_fixes': len(aud.fixes)}


# ---------------------------------------------------------------- แตกบล็อกเป็นชิ้นพื้นฐาน (พิกัดจริง)
def clean(s):
    """แก้อักขระเสีย (surrogate จากไบต์ UTF-8 ที่ถูกตัด)"""
    try:
        return s.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace').replace('\ufffd', '')
    except Exception:
        return s


def text_of(e):
    return clean(_text_of(e))


def _text_of(e):
    t = e.dxftype()
    if t == 'MTEXT':
        return e.plain_text().strip()
    if t in ('TEXT', 'ATTRIB', 'ATTDEF'):
        return (e.dxf.text or '').strip()
    return ''


def flatten(entities, depth=0, parent=None, out=None):
    """คืน list ของ dict ชิ้นพื้นฐาน: kind, layer, block (ชื่อบล็อกแม่), geom… — INSERT แตกซ้อนได้ 4 ชั้น"""
    out = [] if out is None else out
    for e in entities:
        t = e.dxftype()
        if t == 'INSERT':
            name = e.dxf.name
            attrs = {a.dxf.tag: clean((a.dxf.text or '').strip()) for a in e.attribs}
            rec = {'kind': 'insert', 'name': name, 'layer': e.dxf.layer, 'at': (e.dxf.insert.x, e.dxf.insert.y),
                   'rot': e.dxf.get('rotation', 0.0), 'sx': e.dxf.get('xscale', 1.0), 'attrs': attrs, 'parent': parent, 'ref': e}
            out.append(rec)
            for a in e.attribs:
                if a.dxf.text:
                    out.append({'kind': 'text', 'text': clean(a.dxf.text.strip()), 'at': (a.dxf.insert.x, a.dxf.insert.y), 'h': a.dxf.height,
                                'layer': a.dxf.layer, 'parent': name, 'attr': a.dxf.tag})
            if depth < 4:
                try:
                    flatten(list(e.virtual_entities()), depth + 1, name, out)
                except Exception:
                    pass
        elif t in ('TEXT', 'MTEXT'):
            s = text_of(e)
            if s and t != 'ATTDEF':
                h = e.dxf.char_height if t == 'MTEXT' else e.dxf.height
                out.append({'kind': 'text', 'text': s, 'at': (e.dxf.insert.x, e.dxf.insert.y), 'h': h, 'layer': e.dxf.layer, 'parent': parent})
        elif t == 'LINE':
            out.append({'kind': 'line', 'p': [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)], 'layer': e.dxf.layer, 'parent': parent,
                        'lt': e.dxf.get('linetype', '')})
        elif t in ('LWPOLYLINE', 'POLYLINE'):
            try:
                pts = [(p[0], p[1]) for p in (e.get_points('xy') if t == 'LWPOLYLINE' else [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices])]
            except Exception:
                continue
            closed = bool(e.closed) if t == 'LWPOLYLINE' else e.is_closed
            if closed and len(pts) > 2 and pts[0] != pts[-1]:
                pts = pts + [pts[0]]
            out.append({'kind': 'poly', 'p': pts, 'closed': closed or (len(pts) > 3 and pts[0] == pts[-1]), 'layer': e.dxf.layer, 'parent': parent,
                        'lt': e.dxf.get('linetype', '')})
        elif t == 'CIRCLE':
            out.append({'kind': 'circle', 'c': (e.dxf.center.x, e.dxf.center.y), 'r': e.dxf.radius, 'layer': e.dxf.layer, 'parent': parent})
        elif t == 'ARC':
            out.append({'kind': 'arc', 'c': (e.dxf.center.x, e.dxf.center.y), 'r': e.dxf.radius, 'a0': e.dxf.start_angle, 'a1': e.dxf.end_angle,
                        'layer': e.dxf.layer, 'parent': parent})
        elif t == 'HATCH':
            try:
                b = [[(v[0], v[1]) for v in path.vertices] for path in e.paths if hasattr(path, 'vertices')]
            except Exception:
                b = []
            out.append({'kind': 'hatch', 'paths': b, 'solid': bool(e.dxf.solid_fill), 'pattern': e.dxf.pattern_name, 'layer': e.dxf.layer, 'parent': parent})
        elif t == 'DIMENSION':
            try:
                m = e.get_measurement()
                m = m if isinstance(m, (int, float)) else None
            except Exception:
                m = None
            p1, p2 = e.dxf.get('defpoint2'), e.dxf.get('defpoint3')
            out.append({'kind': 'dim', 'value': m, 'text': e.dxf.get('text', ''), 'p': [(p1.x, p1.y), (p2.x, p2.y)] if p1 and p2 else None,
                        'layer': e.dxf.layer, 'parent': parent})
    return out


def bbox_of(prims):
    xs, ys = [], []
    for q in prims:
        for p in pts_of(q):
            xs.append(p[0]); ys.append(p[1])
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def pts_of(q):
    k = q['kind']
    if k in ('line', 'poly'):
        return q['p']
    if k in ('circle', 'arc'):
        c, r = q['c'], q['r']; return [(c[0] - r, c[1] - r), (c[0] + r, c[1] + r)]
    if k in ('text', 'insert'):
        return [q['at']]
    if k == 'hatch':
        return [p for path in q['paths'] for p in path]
    if k == 'dim' and q['p']:
        return q['p']
    return []


def center(q):
    ps = pts_of(q)
    if not ps:
        return None
    return (sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps))


# ---------------------------------------------------------------- ดัชนีกรอบสี่เหลี่ยมของทุกเอนทิตีใน Model space (คิดครั้งเดียว)
def index(doc):
    from ezdxf import bbox as ebb
    cache = ebb.Cache(); out = []
    for e in doc.modelspace():
        try:
            b = ebb.extents([e], fast=True, cache=cache)
        except Exception:
            continue
        if b.has_data:
            out.append((e, (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)))
    return out


# ---------------------------------------------------------------- แยกแผ่น
def find_sheets(doc, idx):
    """กรอบแผ่น = INSERT ที่ภายในมีข้อความเลขแผ่น (A.2.01 ฯลฯ) และสัดส่วนเท่ากระดาษ A (√2)
    คืน [{num, title, box:(x0,y0,x1,y1), scale, paper}] เรียงตามเลขแผ่น"""
    msp = doc.modelspace()
    nums = [(text_of(e), e.dxf.insert) for e in msp.query('TEXT MTEXT') if SHEET_RE.match(text_of(e))]
    cand = []
    for e, (x0, y0, x1, y1) in idx:
        if e.dxftype() != 'INSERT':
            continue
        w, h = x1 - x0, y1 - y0
        if w <= 0 or h <= 0 or abs(w / h - math.sqrt(2)) > 0.03:
            continue
        inside = [n for n, p in nums if x0 <= p.x <= x1 and y0 <= p.y <= y1]
        if len(inside) == 1:
            cand.append({'num': inside[0], 'box': (x0, y0, x1, y1), 'block': e.dxf.name, 'w': w, 'h': h})
    # เลือกกรอบที่เล็กที่สุดต่อเลขแผ่นแต่ละจุด (กรอบซ้อนกัน)
    sheets = []
    for c in sorted(cand, key=lambda c: c['w']):
        if any(s['num'] == c['num'] and s['box'][0] <= c['box'][0] + 1e-6 and s['box'][2] >= c['box'][2] - 1e-6 and s['box'][1] <= c['box'][1] + 1e-6 and s['box'][3] >= c['box'][3] - 1e-6
               or (c['box'][0] <= s['box'][0] + 1e-6 and c['box'][2] >= s['box'][2] - 1e-6 and c['box'][1] <= s['box'][1] + 1e-6 and c['box'][3] >= s['box'][3] - 1e-6 and s['num'] == c['num']) for s in sheets):
            continue
        sheets.append(c)
    for s in sheets:
        s['paper'] = 'A3'   # แบบหน่วยงานใช้ A3 — สเกลคิดจากความกว้างกรอบ
        s['scale'] = round(s['w'] / PAPER['A3'][0])
    key = lambda s: (['A', 'S', 'E', 'EE', 'SN', 'ME', 'AC', 'L'].index(s['num'].split('.')[0]) if s['num'].split('.')[0] in ['A', 'S', 'E', 'EE', 'SN', 'ME', 'AC', 'L'] else 9,
                     [int(x) for x in s['num'].split('.')[1:]], s['box'][1] * -1, s['box'][0])
    sheets.sort(key=key)
    return sheets


def sheet_prims(idx, sheet, skip_blocks=()):
    x0, y0, x1, y1 = sheet['box']; sel = []
    for e, (a0, b0, a1, b1) in idx:
        if e.dxftype() == 'INSERT' and e.dxf.name in skip_blocks:
            continue
        cx, cy = (a0 + a1) / 2, (b0 + b1) / 2
        if x0 <= cx <= x1 and y0 <= cy <= y1 and (a1 - a0) < (x1 - x0) * 0.98:
            sel.append(e)
    return flatten(sel)


def sheet_title(prims, sheet):
    """ชื่อรูปในแผ่น: ข้อความที่ขึ้นต้นด้วย แปลน/รูปด้าน/รูปตัด/แบบขยาย/รายการ ตัวสูงสุด (ไม่นับกรอบชื่อแถบล่าง)"""
    x0, y0, x1, y1 = sheet['box']; band = y0 + (y1 - y0) * 0.09
    ts = [q for q in prims if q['kind'] == 'text' and q['at'][1] > band and TITLE_RE.match(q['text'])]
    ts.sort(key=lambda q: -(q['h'] or 0))
    seen = []
    for q in ts:
        t = q['text'].split('\n')[0].strip()
        if t not in seen:
            seen.append(t)
    return seen[:4]


# ---------------------------------------------------------------- ตรวจลำดับ/อ้างอิงข้ามแผ่น
def check_sheets(doc, sheets):
    msp = doc.modelspace()
    issues = []
    c = Counter(s['num'] for s in sheets)
    for n, k in c.items():
        if k > 1:
            issues.append({'kind': 'dup_number', 'num': n, 'count': k, 'msg': f'เลขแผ่น {n} ซ้ำ {k} แผ่น'})
    have = set(c)
    # อ้างอิงในสัญลักษณ์รูปตัด/รูปด้าน (แอตทริบิวต์ที่เป็นเลขแผ่น)
    refs = defaultdict(set)
    for e in msp.query('INSERT'):
        for a in e.attribs:
            v = (a.dxf.text or '').strip()
            if SHEET_RE.match(v):
                refs[v].add(e.dxf.name)
    for v in sorted(refs):
        if v not in have:
            issues.append({'kind': 'missing_ref', 'num': v, 'msg': f'มีสัญลักษณ์อ้างถึงแผ่น {v} แต่ไม่มีแผ่นนี้ในชุดแบบ'})
    # ช่องว่างในลำดับ
    by = defaultdict(list)
    for n in have:
        p = n.split('.'); by[(p[0], int(p[1]))].append(int(p[2]))
    for (cat, grp), ns in sorted(by.items()):
        ns = sorted(ns)
        miss = [i for i in range(1, ns[-1] + 1) if i not in ns]
        if miss:
            issues.append({'kind': 'gap', 'num': f'{cat}.{grp}', 'msg': f'หมวด {cat}.{grp} ขาดลำดับ ' + ', '.join(f'{cat}.{grp}.{i:02d}' for i in miss)})
    return issues


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('--out'); ap.add_argument('--report')
    ap.add_argument('--sheets-only', action='store_true', help='แค่แยกแผ่นและตรวจเลขแผ่น')
    a = ap.parse_args()
    doc, info = load(a.src)
    idx = index(doc)
    sheets = find_sheets(doc, idx)
    frame_blocks = {s['block'] for s in sheets}
    for s in sheets:
        s['prims'] = sheet_prims(idx, s, frame_blocks)
        s['title'] = sheet_title(s['prims'], s)
    rep = {'info': info, 'sheets': [{k: s[k] for k in ('num', 'title', 'scale', 'box')} for s in sheets], 'issues': check_sheets(doc, sheets)}
    for s in sheets:
        s['title'] = s.get('title') or []
    if a.sheets_only:
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        return
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from dwgread_model import build_model
    from dwgread_model import to_bm
    found, questions = build_model(doc, sheets, info)
    bm = to_bm(found, sheets, questions)
    rep['found'] = found; rep['questions'] = questions
    if a.out:
        json.dump(bm, open(a.out, 'w'), ensure_ascii=False, indent=1)
    if a.report:
        json.dump(rep, open(a.report, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
