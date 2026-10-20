"""dwgread_model.py — ประกอบ .bm.json จากแผ่นที่แยกแล้ว (ใช้กับ tools/dwgread.py)

รอบแรก (v0.1): กริด · ฐานราก (ตำแหน่ง ขนาด ชื่อ) · เสา (ตำแหน่ง ขนาด ชื่อ) · ตารางหน้าตัด/เหล็กเสริม (B*, C*, F*)
ทุกค่าที่ไม่ได้อ่านตรงจากแบบ → status "assumed" + เพิ่มคำถามใน questions
"""
import math, re
from collections import Counter, defaultdict

MARK_RE = re.compile(r'^([A-Z]{1,3}\d{1,2}[A-Z]?)$')
REBAR_RE = re.compile(r'(\d+)\s*-\s*(DB|RB)\s*(\d+)', re.I)
SPACING_RE = re.compile(r'(DB|RB)\s*(\d+)\s*(?:มม\.?|mm\.?)?\s*@\s*(\d*\.\d+)', re.I)
STEEL_RE = re.compile(r'(\d?C|\[|เหล็กกล่อง|เหล็กตัว\s*C)\s*-?\s*(\d+)\s*[xX×]\s*(\d+)(?:\s*[xX×]\s*(\d+(?:\.\d+)?))?(?:\s*[xX×]\s*(\d+(?:\.\d+)?))?')


def r3(x):
    return round(x + 0.0, 3)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


# ---------------------------------------------------------------- กริด
def find_grid(sheet):
    """หัวกริด = วงกลมรัศมีบนกระดาษ 2–8 มม. ที่มีข้อความ 1–3 ตัวอยู่ข้างใน · แถวแนวนอน → กริดแกน X (พิกัด x), แถวแนวตั้ง → กริดแกน Y"""
    sc = sheet['scale'] / 1000.0
    P = sheet['prims']
    circles = [q for q in P if q['kind'] == 'circle' and 2 * sc <= q['r'] <= 8 * sc]
    texts = [q for q in P if q['kind'] == 'text' and re.fullmatch(r"[A-Z0-9']{1,3}", q['text'])]
    bub = []
    for c in circles:
        t = [q for q in texts if dist(q['at'], c['c']) <= c['r'] * 1.2]
        if t:
            bub.append({'label': t[0]['text'], 'c': c['c'], 'r': c['r']})
    # หัวกริดขนาดเท่ากันทั้งชุด — ถ้ามีวงกลมหลายขนาด (ป้ายชี้วัสดุ ตารางสัญลักษณ์) ใช้ขนาดใหญ่สุดที่ได้ทั้งแกน X และ Y
    sizes = sorted({round(b['r'] / sc, 1) for b in bub}, reverse=True)
    if len(sizes) > 1:
        for sz in sizes:
            sub = [b for b in bub if round(b['r'] / sc, 1) == sz]
            if len(sub) >= 3:
                X, Y = _grid_rows(sub, sc)
                if X and Y:
                    return X, Y
    return _grid_rows(bub, sc)


def _grid_rows(bub, sc):
    # ตัดซ้ำ (หัวกริดสองฝั่ง)
    rows = defaultdict(list); cols = defaultdict(list)
    for b in bub:
        rows[round(b['c'][1] / (sc * 5))].append(b); cols[round(b['c'][0] / (sc * 5))].append(b)
    X, Y = {}, {}
    for k, bs in rows.items():
        if len(bs) >= 2:
            for b in bs:
                X.setdefault(b['label'], b['c'][0])
    for k, bs in cols.items():
        if len(bs) >= 2:
            for b in bs:
                if b['label'] not in X:
                    Y.setdefault(b['label'], b['c'][1])
    return X, Y


# ---------------------------------------------------------------- สี่เหลี่ยมปิด
def rect_of(q):
    """poly ปิด 4 มุมตั้งฉากแนวแกน → (cx, cy, w, h)"""
    p = q['p']
    if len(p) < 4:
        return None
    pts = p[:-1] if p[0] == p[-1] else p
    if len(pts) != 4:
        return None
    xs = sorted(set(round(v[0], 4) for v in pts)); ys = sorted(set(round(v[1], 4) for v in pts))
    if len(xs) != 2 or len(ys) != 2:
        return None
    return ((xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2, xs[1] - xs[0], ys[1] - ys[0])


def rects(sheet):
    out = []
    for q in sheet['prims']:
        if q['kind'] == 'poly' and q.get('closed'):
            r = rect_of(q)
            if r:
                out.append(r + (q.get('parent'),))
        if q['kind'] == 'hatch':
            for path in q['paths']:
                r = rect_of({'p': path + [path[0]] if path and path[0] != path[-1] else path})
                if r:
                    out.append(r + ('#hatch',))
    return out


# ---------------------------------------------------------------- ฐานรากและเสาในแปลน
def plan_supports(sheet, X, Y):
    """ที่จุดตัดกริด: สี่เหลี่ยมใหญ่สุด 0.4–4 ม. = ฐานราก, เล็ก 0.1–0.6 ม. ที่มีแรเงา/ซ้อนกลาง = เสา · ชื่อจากข้อความ F#, C# ใกล้ที่สุด"""
    R = rects(sheet)
    marks = [q for q in sheet['prims'] if q['kind'] == 'text' and re.search(r'\b[FC]\d', q['text'])]
    out = []
    for gx, x in X.items():
        for gy, y in Y.items():
            at = [r for r in R if abs(r[0] - x) < 0.05 and abs(r[1] - y) < 0.05]
            if not at:
                continue
            big = [r for r in at if 0.4 <= max(r[2], r[3]) <= 4.0]
            small = [r for r in at if 0.1 <= max(r[2], r[3]) < 0.6]
            f = max(big, key=lambda r: r[2] * r[3]) if big else None
            c = min(small, key=lambda r: abs(r[2] * r[3] - 0.04)) if small else None
            if f and c and f[2] * f[3] <= c[2] * c[3] * 1.5:
                f = None
            near = sorted(marks, key=lambda q: dist(q['at'], (x, y)))
            lab = near[0]['text'] if near and dist(near[0]['at'], (x, y)) < (f[2] if f else 1.0) else ''
            fm = re.search(r'\b(F\d+[A-Z]?)', lab); cm = re.search(r'\b(C\d+[A-Z]?)', lab)
            out.append({'grid': f'{gx}/{gy}', 'x': x, 'y': y,
                        'footing': {'mark': fm.group(1) if fm else None, 'b': r3(f[2]), 'd': r3(f[3])} if f else None,
                        'column': {'mark': cm.group(1) if cm else None, 'b': r3(c[2]), 'h': r3(c[3])} if c else None})
    return out


# ---------------------------------------------------------------- ตารางหน้าตัด (B1 / C1 …) และแบบขยายฐานราก
def schedules(sheet):
    """ตารางหน้าตัด: anchor = ชื่อชิ้น (B1, C1 ตัวใหญ่) หรือชื่อแถวภาษาไทยสั้น (ตอม่อ, อะเส …) ด้านซ้าย
    ข้อความเหล็กเสริม/เส้นบอกระยะแต่ละตัว → anchor ที่อยู่ซ้ายมือและใกล้ที่สุดตามแนวตั้ง
    ชื่อชิ้นที่ไม่มีข้อความของตัวเอง แต่มีแถวภาษาไทยอยู่เหนือในตารางเดียวกัน (เช่น C1 ใต้แถว อะเส / ตอม่อ) → แถวเหล่านั้นเป็นของชื่อชิ้นนี้"""
    P = sheet['prims']; sc = sheet['scale'] / 1000.0
    T = [q for q in P if q['kind'] == 'text' and q.get('parent') != 'gsdfg45fzcse']
    hs = sorted(q['h'] for q in T if q['h'])
    hmed = hs[len(hs) // 2] if hs else 1
    marks = [q for q in T if MARK_RE.match(q['text']) and q['h'] and q['h'] >= hmed * 1.2]
    specs = [q for q in T if REBAR_RE.search(q['text']) or SPACING_RE.search(q['text'])]
    labels = [q for q in T if re.fullmatch(r'[\u0e00-\u0e7f]{2,10}', q['text']) and any(0 < sp['at'][0] - q['at'][0] < 60 * sc and abs(sp['at'][1] - q['at'][1]) < 30 * sc for sp in specs)]
    anchors = marks + labels
    rows = defaultdict(lambda: {'texts': [], 'dims': []})
    # เส้นแนวนอนของตาราง (แบ่งแถว)
    H = []
    for q in P:
        if q['kind'] in ('line', 'poly'):
            for a0, a1 in zip(q['p'], q['p'][1:]):
                if abs(a0[1] - a1[1]) < 1e-6 and abs(a1[0] - a0[0]) > 20 * sc:
                    H.append((min(a0[0], a1[0]), max(a0[0], a1[0]), a0[1]))
    def band(a):
        x, y = a['at']
        up = [h[2] for h in H if h[0] - 1e-6 <= x <= h[1] + 1e-6 and h[2] > y]
        dn = [h[2] for h in H if h[0] - 1e-6 <= x <= h[1] + 1e-6 and h[2] < y]
        return (max(dn) if dn else y - 15 * sc, min(up) if up else y + 15 * sc)
    bands = {id(a): band(a) for a in anchors}
    def owner(x, y):
        c = [a for a in anchors if 0 < x - a['at'][0] < 60 * sc and bands[id(a)][0] <= y <= bands[id(a)][1]]
        if not c:
            c = [a for a in anchors if 0 < x - a['at'][0] < 60 * sc]
        return min(c, key=lambda a: (x - a['at'][0], abs(a['at'][1] - y))) if c else None
    for q in specs:
        a = owner(*q['at'])
        if a:
            rows[id(a)]['texts'].append((q['at'][1], q['text'].replace('\n', ' ')))
    for q in P:
        if q['kind'] == 'dim' and q['p'] and q['value']:
            mx = (q['p'][0][0] + q['p'][1][0]) / 2; my = (q['p'][0][1] + q['p'][1][1]) / 2
            a = owner(mx, my)
            if a and bands[id(a)][0] <= my <= bands[id(a)][1]:
                rows[id(a)]['dims'].append(round(dimval(q), 3))
    out = {}
    for m in marks:
        own = rows.get(id(m))
        if own and own['texts']:
            out.setdefault(m['text'], []).append({'row': '', 'texts': [t for _, t in sorted(own['texts'], reverse=True)], 'dims': sorted(set(own['dims'])), 'sheet': sheet['num']})
            continue
        # ชื่อชิ้นใต้ตาราง: แถวภาษาไทยที่อยู่เหนือภายใน 40 มม. กระดาษ และ x ใกล้กัน
        subs = [a for a in labels if 0 < a['at'][1] - m['at'][1] < 100 * sc and abs(a['at'][0] - m['at'][0]) < 60 * sc
                and not any(o is not m and m['at'][1] < o['at'][1] < a['at'][1] and abs(o['at'][0] - m['at'][0]) < 60 * sc for o in marks)]
        for a in sorted(subs, key=lambda a: -a['at'][1]):
            r = rows.get(id(a))
            if r and r['texts']:
                out.setdefault(m['text'], []).append({'row': a['text'], 'texts': [t for _, t in sorted(r['texts'], reverse=True)], 'dims': sorted(set(r['dims'])), 'sheet': sheet['num']})
    return out


def parse_section(entry):
    """จากข้อความในแถบตาราง → b, h, เหล็กบน/ล่าง/หลัก, ปลอก"""
    t = entry['texts']; d = entry['dims']
    bars = [(int(m.group(1)), m.group(2).upper(), int(m.group(3))) for s in t if '@' not in s for m in [REBAR_RE.search(s)] if m]
    stir = next(((m.group(1).upper(), int(m.group(2)), float(m.group(3))) for s in t if '@' in s for m in [SPACING_RE.search(s.replace('St.-1', '').replace('1-', ''))] if m), None)
    small = [x for x in d if 0.1 <= x <= 1.5]
    b = min(small) if small else None
    h = max(small) if small else None
    return {'b': b, 'h': h, 'bars': bars, 'stirrup': stir}


# ---------------------------------------------------------------- แบบขยายฐานราก (จับคู่กับฐานในแปลนด้วยขนาด)
def dimval(q):
    """ค่าบนเส้นบอกระยะ: ใช้ข้อความที่เขียนทับถ้าเป็นตัวเลข (แบบขยายมักวาดไม่ตามสเกล) ไม่งั้นใช้ค่าที่วัดได้"""
    t = (q.get('text') or '').strip()
    m = re.fullmatch(r'(\d*\.\d+|\d+)', t)
    return float(m.group(1)) if m else q['value']


def footing_details(sheets, sizes):
    """sizes = {(b,d): [marks]} → {mark: {b,d,t,depth,lean,sand,bars,dowel,pier,src,texts}}"""
    out = {}
    for s in sheets:
        if not s['num'].startswith('S.3'):
            continue
        P = s['prims']
        dims = [q for q in P if q['kind'] == 'dim' and q['p'] and q['value']]
        for q in dims:
            m = re.fullmatch(r'\s*(\d*\.\d+)\s*[xX×]\s*(\d*\.\d+)\s*', q.get('text') or '')
            if not m:
                continue
            b, d = float(m.group(1)), float(m.group(2))
            mk = sizes.get((round(b, 2), round(d, 2)))
            if not mk:
                continue
            xs = [p[0] for p in q['p']]; x0, x1 = min(xs), max(xs); ybase = min(p[1] for p in q['p'])
            band = lambda x: x0 - 0.5 * (x1 - x0) <= x <= x1 + 1.6 * (x1 - x0)
            T = [t for t in P if t['kind'] == 'text' and band(t['at'][0])]
            V = [v for v in dims if x0 - max(0.5, 0.6 * (x1 - x0)) <= v['p'][0][0] <= x1 and abs(v['p'][0][0] - v['p'][1][0]) < 0.3
                 and ybase - 0.3 <= min(v['p'][0][1], v['p'][1][1]) <= ybase + 0.3]   # เส้นบอกระยะแนวตั้งของรูปตัด (เริ่มที่ท้อง/หลังฐาน)
            vals = sorted({round(dimval(v), 3) for v in V})
            txt = [t['text'].replace('\n', ' ') for t in sorted(T, key=lambda t: -t['at'][1])]
            bars = [(int(m.group(1)), int(m.group(3))) for t in txt for m in [re.search(r'(\d+)\s*-\s*(DB)\s*(\d+).*@', t)] if m]
            dowel = next(((int(m.group(1)), int(m.group(2))) for t in txt if 'DOWEL' in t.upper() for m in [re.search(r'(\d+)\s*-\s*DB\s*(\d+)', t)] if m), None)
            pier = next((tuple(float(v) for v in m.groups()) for t in txt for m in [re.search(r'ตอม่อ\s*(\d*\.\d+)\s*x\s*(\d*\.\d+)', t)] if m), None)
            top_bars = sorted({int(m.group(2)) for v in dims if band(v['p'][0][0]) for m in [re.search(r'(\d+)\s*-\s*DB\s*(\d+)', v.get('text') or '')] if m})
            big = [v for v in vals if v >= 0.8]
            depth = max(big) if big else None
            t_ = next((v for v in vals if 0.15 <= v <= 0.6), None)
            thin = [v for v in vals if v < 0.15]
            for mark in mk:
                out[mark] = {'b': b, 'd': d, 't': t_, 'depth': depth, 'lean': thin[0] if thin else None, 'sand': thin[1] if len(thin) > 1 else None,
                             'bars': bars, 'dowel': dowel, 'pier': pier, 'plan_bar_dias': top_bars, 'src': s['num'], 'vdims': vals}
    return out


# ---------------------------------------------------------------- คาน (แปลนคาน-พื้น: แผงพื้นวาดเป็นสี่เหลี่ยมมีเส้นทแยง X)
def beam_plan(sheet, X, Y, bw=0.2):
    """แผงพื้น = คู่เส้นทแยงที่ไขว้กันในกรอบเดียวกัน → สี่เหลี่ยมแผง · ขอบแผงขยายออกครึ่งความกว้างคาน = แนวคาน
    รวมแนวคานที่อยู่บรรทัดเดียวกันและต่อกัน · ชื่อคาน (B1 …) จากข้อความที่ใกล้แนวที่สุด · คืนพิกัดจริงของแบบ (ยังไม่หักจุดกำเนิด)"""
    P = sheet['prims']; sc = sheet['scale'] / 1000.0
    diag = []
    for q in P:
        if q['kind'] in ('line', 'poly'):
            for a0, a1 in zip(q['p'], q['p'][1:]):
                dx, dy = a1[0] - a0[0], a1[1] - a0[1]
                if abs(dx) > 0.2 and abs(dy) > 0.2:
                    diag.append((round(min(a0[0], a1[0]), 3), round(min(a0[1], a1[1]), 3), round(max(a0[0], a1[0]), 3), round(max(a0[1], a1[1]), 3), (dx > 0) == (dy > 0)))
    boxes = Counter((d[0], d[1], d[2], d[3]) for d in diag)
    panels = [b for b, n in boxes.items() if n >= 2 and {d[4] for d in diag if (d[0], d[1], d[2], d[3]) == b} == {True, False}]
    h = bw / 2
    lines = []   # (axis, c, a, b)  axis 'H' = แนวนอน y=c ช่วง x a..b
    for x0, y0, x1, y1 in panels:
        lines += [('H', y0 - h, x0 - h, x1 + h), ('H', y1 + h, x0 - h, x1 + h), ('V', x0 - h, y0 - h, y1 + h), ('V', x1 + h, y0 - h, y1 + h)]
    def snap(c, G):
        g = min(G, key=lambda v: abs(v - c)) if G else None
        return g if g is not None and abs(g - c) < 0.06 else round(c, 3)
    merged = []
    for ax in ('H', 'V'):
        G = list(Y.values()) if ax == 'H' else list(X.values())
        rows = defaultdict(list)
        for a_, c, lo, hi in lines:
            if a_ == ax:
                rows[round(snap(c, G), 2)].append([lo, hi])
        for c, iv in rows.items():
            iv.sort()
            cur = iv[0][:]
            for lo, hi in iv[1:]:
                if lo <= cur[1] + 0.05:
                    cur[1] = max(cur[1], hi)
                else:
                    merged.append((ax, c, cur[0], cur[1])); cur = [lo, hi]
            merged.append((ax, c, cur[0], cur[1]))
    labs = [q for q in P if q['kind'] == 'text' and re.fullmatch(r'[BG]B?\d{1,2}', q['text'])]
    # ตัดแนวที่ขอบตัวอาคาร (กริดนอกสุด) — ส่วนที่ยื่นออกนอกอาคารเป็นคานก็ต่อเมื่อมีชื่อคานกำกับบนส่วนนั้นเอง
    if X and Y:
        bx = (min(X.values()), max(X.values())); by = (min(Y.values()), max(Y.values()))
        cut = []
        for ax, c, lo, hi in merged:
            bnd = bx if ax == 'H' else by
            pts = [lo] + [b for b in bnd if lo + 0.05 < b < hi - 0.05] + [hi]
            cut += [(ax, c, a0, a1) for a0, a1 in zip(pts, pts[1:])]
        merged = cut
    # ชื่อคานแต่ละตัว → แนวเดียวที่ใกล้ที่สุด (ต้องอยู่ภายในช่วงของแนว และห่างตั้งฉาก ≤ 8 มม.บนกระดาษ)
    # แนวที่ไม่มีชื่อเลย = เส้นแบ่งแผงพื้นสมมติ/ขอบพื้นวางบนดิน ไม่ใช่คาน (Earth 20 ต.ค. 2569)
    marks = [Counter() for _ in merged]
    for q in labs:
        x, y = q['at']; best = None
        for k, (ax, c, lo, hi) in enumerate(merged):
            u, v = (x, y) if ax == 'H' else (y, x)
            if lo - 0.1 <= u <= hi + 0.1:
                dd = abs(v - c)
                if dd <= 8 * sc and (best is None or dd < best[0]):
                    best = (dd, k)
        if best:
            marks[best[1]][q['text']] += 1
    out = [{'axis': ax, 'c': c, 'from': lo, 'to': hi, 'marks': dict(marks[k])} for k, (ax, c, lo, hi) in enumerate(merged)]
    return out, panels


# ---------------------------------------------------------------- หลังคา (ข้อความรายการโครงหลังคา)
def roof_specs(sheets):
    keys = {'rafter': r'จันทัน', 'purlin': r'แป', 'plate': r'อะเส', 'king': r'ดั้ง', 'cover': r'หลังคา(เมทัลชีท|กระเบื้อง)', 'truss': r'TRUSS'}
    out = defaultdict(set)
    for s in sheets:
        if not (s['num'].startswith('S.') or s['num'].startswith('A.4')):
            continue
        for q in s['prims']:
            if q['kind'] != 'text':
                continue
            t = q['text'].replace('\n', ' ').strip()
            for k, rx in keys.items():
                if re.search(rx, t) and len(t) < 80:
                    out[k].add(t)
    return {k: sorted(v) for k, v in out.items()}


def _dseg(p, a, b):
    """ระยะจากจุดถึงส่วนของเส้นตรง"""
    dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return dist(p, (a[0] + t * dx, a[1] + t * dy))


def roof_plan_tags(sheets):
    """แปลนโครงหลังคา: วงกลมหมายเลขชี้ด้วยเส้นโยง (leader) ไปที่แนวกริด → [(ป้าย, รายการวัสดุ, แกน, ชื่อกริด, ตำแหน่งปลายเส้นตามแนวกริด)]
    ตารางสัญลักษณ์ = วงกลมที่มีข้อความยาวอยู่ทางขวาแถวเดียวกัน"""
    out = []
    for sh in sheets:
        if not sh['num'].startswith('S.'):
            continue
        GXs, GYs = find_grid(sh)
        if not GXs or not GYs:
            continue
        sc = sh['scale'] / 1000.0; P = sh['prims']
        circles = [q for q in P if q['kind'] == 'circle' and 2 * sc <= q['r'] <= 8 * sc]
        texts = [q for q in P if q['kind'] == 'text']
        legend, tags = {}, []
        for c in circles:
            lab = next((q['text'].strip() for q in texts if re.fullmatch(r"[A-Z0-9]{1,3}", q['text'].strip()) and dist(q['at'], c['c']) <= c['r'] * 1.2), None)
            if not lab or (lab in GXs and abs(GXs[lab] - c['c'][0]) < c['r']) or (lab in GYs and abs(GYs[lab] - c['c'][1]) < c['r']):
                continue
            row = [q for q in texts if len(q['text']) > 8 and abs(q['at'][1] - c['c'][1]) < c['r'] * 1.2 and 0 < q['at'][0] - c['c'][0] < c['r'] * 8]
            if row:
                legend[lab] = row[0]['text'].replace('\n', ' ')
            else:
                tags.append((lab, c))
        if not legend or not tags:
            continue
        segs = []
        for q in P:
            if q['kind'] == 'line':
                segs.append(q['p'])
            elif q['kind'] == 'poly' and not q.get('closed'):
                segs += list(zip(q['p'], q['p'][1:]))
        tol = 0.6 * sc
        leaders = [q for q in P if q['kind'] == 'poly' and q.get('leader') and len(q['p']) >= 2]
        x0, y0 = min(GXs.values()), min(GYs.values())
        for lab, c in tags:
            end = None
            for a, b in segs:
                for s0, s1 in ((a, b), (b, a)):
                    if abs(dist(s0, c['c']) - c['r']) < tol and dist(s1, c['c']) > c['r'] * 1.5:
                        cur, used = s1, 1
                        while used < 6:   # เดินต่อเส้นที่ต่อปลายกัน
                            nxt = next((t1 if dist(t0, cur) < tol else t0 for t0, t1 in segs if (dist(t0, cur) < tol or dist(t1, cur) < tol)
                                        and dist(t1 if dist(t0, cur) < tol else t0, cur) > tol and dist(t1 if dist(t0, cur) < tol else t0, c['c']) > dist(cur, c['c'])), None)
                            if nxt is None:
                                break
                            cur = nxt; used += 1
                        if end is None or dist(cur, c['c']) > dist(end, c['c']):
                            end = cur
            # ป้ายเดียวชี้หลายเส้น (LEADER หลายเส้นต่อกันเป็นพัด) → ปลายลูกศรทุกเส้น = ตำแหน่งชิ้นส่วนแต่ละตัว (จันทัน/แป)
            group = [q for q in leaders if dist(q['p'][-1], c['c']) < c['r'] * 1.6]
            grow = True
            while grow:
                grow = False
                for q in leaders:
                    if q not in group and any(_dseg(q['p'][-1], a_, b_) < tol for g_ in group for a_, b_ in zip(g_['p'], g_['p'][1:])):
                        group.append(q); grow = True
            tips = sorted((round(q['p'][0][0] - x0, 3), round(q['p'][0][1] - y0, 3)) for q in group)
            if end is None:
                continue
            cand = [(abs(end[0] - v), 'X', k, end[1] - y0) for k, v in GXs.items()] + [(abs(end[1] - v), 'Y', k, end[0] - x0) for k, v in GYs.items()]
            d, ax, g, along = min(cand)
            if d < 1.5 * sc * 10 or len(tips) >= 2:
                out.append({'label': lab, 'item': legend.get(lab), 'axis': ax, 'grid': g, 'at': round(along, 2), 'src': sh['num'],
                            **({'tips': tips} if len(tips) >= 2 else {})})
    return out


def steel_section(text):
    """'จันทันเหล็ก C - 75x45x15x3.2 มม. @1.08 ม.' → {name, shape, dims, spacing}"""
    t = text.replace('×', 'x')
    sp = re.search(r'@\s*(\d*\.\d+)', t)
    box = re.search(r'เหล็กกล่อง\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:\.\d+)?)', t)
    if box:
        a, b, th = box.groups(); return {'id': f'BOX{a}x{b}x{th}', 'kind': 'cold_formed', 'shape': 'box', 'dims': {'h': int(a) / 1000, 'b': int(b) / 1000, 't': float(th) / 1000}, 'spacing': float(sp.group(1)) if sp else None}
    c = re.search(r'(2C|C)\s*-\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:\.\d+)?)', t)
    if c:
        k, h, b, lip, th = c.groups(); n = 'DBL-' if k == '2C' else ''
        return {'id': f'{n}C{h}x{b}x{lip}x{th}', 'kind': 'cold_formed', 'shape': 'lipped_c' + ('_double' if k == '2C' else ''),
                'dims': {'h': int(h) / 1000, 'b': int(b) / 1000, 'lip': int(lip) / 1000, 't': float(th) / 1000}, 'spacing': float(sp.group(1)) if sp else None}
    return None


# ---------------------------------------------------------------- รวม
def build_model(doc, sheets, info):
    Q = []   # คำถามถึง Earth
    by = {}
    for s in sheets:
        by.setdefault(s['num'], s)
    # แปลนฐานราก = แผ่น S ที่มีข้อความ F#,C# มากที่สุด
    cand = [s for s in sheets if s['num'].startswith('S.2')]
    fplan = max(cand, key=lambda s: sum(1 for q in s['prims'] if q['kind'] == 'text' and re.search(r'\bF\d', q['text'])), default=None)
    X, Y = find_grid(fplan) if fplan else ({}, {})
    if not X or not Y:
        Q.append({'id': 'grid', 'q': 'หากริดในแปลนฐานรากไม่เจอ — ระบุแผ่นที่มีกริดครบ'})
    ox = min(X.values()) if X else 0; oy = min(Y.values()) if Y else 0
    gx = sorted(X.items(), key=lambda kv: kv[1]); gy = sorted(Y.items(), key=lambda kv: kv[1])
    grids = [{'name': k, 'axis': 'X', 'coord': r3(v - ox)} for k, v in gx] + [{'name': k, 'axis': 'Y', 'coord': r3(v - oy)} for k, v in gy]
    sup = plan_supports(fplan, X, Y) if fplan else []
    # ตาราง
    sched = {}
    for s in sheets:
        if s['num'].startswith('S.3'):
            for k, v in schedules(s).items():
                sched.setdefault(k, []).extend(v)
    bsh = max(cand, key=lambda s: sum(1 for q in s['prims'] if q['kind'] == 'text' and re.fullmatch(r'B\d', q['text'])), default=None)
    beams, panels = [], []
    if bsh:
        BX, BY = find_grid(bsh)
        bx0 = min(BX.values()) if BX else 0; by0 = min(BY.values()) if BY else 0
        bw = next((e['parsed']['b'] for k, v in sched.items() if k.startswith('B') for e in [dict(v[0], parsed=parse_section(v[0]))] if e['parsed']['b']), 0.2) if sched else 0.2
        bl, pn = beam_plan(bsh, BX, BY, bw)
        for b in bl:
            off = by0 if b['axis'] == 'H' else bx0; offl = bx0 if b['axis'] == 'H' else by0
            beams.append(dict(b, c=r3(b['c'] - off), **{'from': r3(b['from'] - offl), 'to': r3(b['to'] - offl)}))
        panels = [[r3(p[0] - bx0), r3(p[1] - by0), r3(p[2] - bx0), r3(p[3] - by0)] for p in pn]
    roof = roof_specs(sheets)
    roof['tags'] = roof_plan_tags(sheets)
    # หน้าตัด Truss จากแผ่นรายละเอียด (ข้อความเหล็กกล่องในแผ่นที่มีคำว่า EQ) — ใหญ่สุด = คอร์ด เล็กสุด = ค้ำ
    tb = []
    for sh_ in sheets:
        if sh_['num'].startswith('S.') and any(q['kind'] == 'text' and re.search(r'\d+EQ', q['text']) for q in sh_['prims']):
            tb += [(steel_section(q['text']), sh_['num']) for q in sh_['prims'] if q['kind'] == 'text' and 'เหล็กกล่อง' in q['text']]
    tb = [t for t in tb if t[0]]
    if tb:
        tb.sort(key=lambda t: t[0]['dims']['h'])
        roof['truss_sec'] = {'chord': tb[-1][0], 'web': tb[0][0], 'src': tb[0][1]}
    sizes = {}
    for x in sup:
        if x['footing'] and x['footing']['mark']:
            k = (round(x['footing']['b'], 2), round(x['footing']['d'], 2))
            if x['footing']['mark'] not in sizes.setdefault(k, []):
                sizes[k].append(x['footing']['mark'])
    fdet = footing_details(sheets, sizes)
    for mk, f in fdet.items():
        dias = sorted({b[1] for b in f['bars']}); pd = f['plan_bar_dias']
        if pd and dias and set(pd) != set(dias):
            Q.append({'id': f'{mk}-bars', 'q': f'แบบขยาย {mk} ({f["src"]}): แปลนขยายเขียนเหล็กตะแกรง DB{"/".join(map(str, pd))} แต่รูปตัดเขียน DB{"/".join(map(str, dias))} — ใช้ขนาดไหน'})
    # ตำแหน่งคำว่า SLOPE / ทางลาด ในแปลนสถาปัตย์ (พิกัดโมเดล) — ใช้แยกแผงทางลาด
    slope_marks = []
    for sh in sheets:
        if not sh['num'].startswith('A.2'):
            continue
        SX, SY = find_grid(sh)
        if not SX or not SY:
            continue
        sx0, sy0 = min(SX.values()), min(SY.values())
        slope_marks += [(r3(q['at'][0] - sx0), r3(q['at'][1] - sy0)) for q in sh['prims'] if q['kind'] == 'text' and re.search(r'SLOPE|ทางลาด', q['text'])]
    rep = {'source': info, 'foundation_sheet': fplan['num'] if fplan else None, 'grids': grids,
           'supports': [dict(x, x=r3(x['x'] - ox), y=r3(x['y'] - oy)) for x in sup],
           'schedules': {k: [dict(e, parsed=parse_section(e)) for e in v] for k, v in sched.items()}, 'roof': roof, 'footing_details': fdet, 'beam_sheet': bsh['num'] if bsh else None, 'beams': beams, 'panels': panels, 'slope_marks': slope_marks}
    return rep, Q


# ---------------------------------------------------------------- ระดับจากรูปตัด (เส้นบอกระยะแนวตั้งต่อกันเป็นชุด)
def level_chain(sheets):
    """หาแผ่นรูปตัด/รูปด้านที่มีเส้นบอกระยะแนวตั้ง ≥ 3 ช่วงต่อกันที่ x เดียวกัน และผลรวมเท่ากับเส้นรวมข้าง ๆ → [ช่วง…] จากล่างขึ้นบน"""
    for s in sheets:
        if not (s['num'].startswith('A.4') or s['num'].startswith('A.3')):
            continue
        V = [q for q in s['prims'] if q['kind'] == 'dim' and q['p'] and q['value'] and abs(q['p'][0][0] - q['p'][1][0]) < 0.05]
        byx = defaultdict(list)
        for q in V:
            byx[round(q['p'][0][0], 1)].append((min(q['p'][0][1], q['p'][1][1]), max(q['p'][0][1], q['p'][1][1]), round(q['value'], 3)))
        totals = {round(v[2], 2) for vs in byx.values() for v in vs}
        for x, vs in sorted(byx.items(), key=lambda kv: -len(kv[1])):
            vs.sort()
            if len(vs) >= 3 and all(abs(vs[i][1] - vs[i + 1][0]) < 0.01 for i in range(len(vs) - 1)) and round(sum(v[2] for v in vs), 2) in totals:
                return [v[2] for v in vs], s['num']
    return None, None


def to_bm(rep, sheets, Q):
    """แปลงผลอ่าน → .bm.json (schema 0.1) — ทุกชิ้นติด status from_drawing + src แผ่น; ค่าที่เดา = assumed"""
    import datetime
    G = rep['grids']; GX = {g['name']: g['coord'] for g in G if g['axis'] == 'X'}; GY = {g['name']: g['coord'] for g in G if g['axis'] == 'Y'}
    chain, csrc = level_chain(sheets)
    f1 = chain[0] if chain else 0.2
    roof = round(f1 + chain[1], 3) if chain and len(chain) > 1 else 3.0
    ridge = round(roof + chain[2], 3) if chain and len(chain) > 2 else None
    if not chain:
        Q.append({'id': 'levels', 'q': 'หาระดับจากรูปตัดไม่เจอ — ใช้ชั้น 1 +0.20, ระดับอะเส +3.00 ไปก่อน'})
    fd = rep['footing_details']
    deep = max([f['depth'] for f in fd.values() if f.get('depth')] or [1.5])
    levels = [{'name': 'FOOT', 'z': -deep, 'desc': 'ท้องฐานรากลึกสุด'}, {'name': 'GL', 'z': 0.0}, {'name': '1F', 'z': f1, 'desc': 'หลังคานคอดิน/พื้นชั้น 1'},
              {'name': 'ROOF', 'z': roof, 'desc': 'ระดับอะเส (หัวเสา)'}] + ([{'name': 'RIDGE', 'z': ridge}] if ridge else [])
    meta = {'name': 'อ่านจากแบบ ' + rep['source']['source'], 'owner': 'เทศบาลนครอุดรธานี', 'province': 'อุดรธานี', 'design_method': 'WSD', 'work_group': 'building',
            'drawings': [{'sheet': s['num'], 'title': (s.get('title') or [''])[0] if s.get('title') else ''} for s in sheets],
            'units': {'length': 'm', 'force': 'kgf', 'stress': 'ksc'}, 'notes': ['สร้างโดย tools/dwgread.py — ตรวจกับแบบก่อนใช้งาน']}
    mats = [{'id': 'C240', 'kind': 'concrete', 'fc': 240, 'unit_weight': 2400, 'status': 'user', 'note': "แบบไม่ระบุ f'c — ค่าตั้งต้น 240 ksc ตามที่ Earth กำหนด (20 ต.ค. 2569)"},
            {'id': 'SD40', 'kind': 'rebar', 'fy': 4000, 'status': 'assumed'}, {'id': 'SR24', 'kind': 'rebar', 'fy': 2400, 'status': 'assumed'}]
    secs = {}
    def rc(b, h, src):
        k = f'RC-{round(b * 100)}x{round(h * 100)}'
        secs.setdefault(k, {'id': k, 'kind': 'rc_rect', 'b': b, 'h': h, 'status': 'from_drawing', 'src': src})
        return k
    nodes, members, supports, design = {}, [], [], {'members': {}, 'supports': {}}
    def node(x, y, z, lv=None, grid=None):
        k = (round(x, 3), round(y, 3), round(z, 3))
        if k not in nodes:
            nid = f'N-{grid.replace("/", "") if grid else f"{k[0]:g}_{k[1]:g}"}-{lv or "B"}'
            while any(n['id'] == nid for n in nodes.values()):
                nid += "'"
            nodes[k] = dict({'id': nid, 'x': k[0], 'y': k[1], 'z': k[2]}, **({'grid': grid} if grid else {}), **({'level': lv} if lv else {}))
        return nodes[k]['id']
    sch = rep['schedules']
    col_rows = {e.get('row'): parse_section(e) for e in sch.get('C1', [])}
    for x in rep['supports']:
        g = x['grid']; f = x['footing']; c = x['column']
        if not f:
            continue
        det = fd.get(f['mark'] or '', {})
        t = det.get('t') or 0.3; bot = -(det.get('depth') or deep)
        nb = node(x['x'], x['y'], bot + t, None, g)
        supports.append({'id': f"{f['mark'] or 'F'}-{g.replace('/', '')}", 'mark': f['mark'], 'node': nb, 'kind': 'spread', 'b': f['b'], 'd': f['d'], 'h': t, 'bottom': bot,
                         **({'sand': det['sand']} if det.get('sand') else {}), **({'lean': det['lean']} if det.get('lean') else {}),
                         'material': 'C240', 'fixity': 'fixed', 'status': 'from_drawing' if det else 'assumed', 'src': rep['foundation_sheet'] + (' + ' + det['src'] if det else '')})
        if det.get('bars'):
            n, d = det['bars'][0]
            design['supports'][supports[-1]['id']] = {'rebar': {'bars_x': [n, d], 'bars_y': [det['bars'][-1][0], det['bars'][-1][1]]}, 'status': 'from_drawing', 'src': det['src']}
        if c:
            sec = rc(c['b'], c['h'], rep['foundation_sheet'])
            n1 = node(x['x'], x['y'], f1, '1F', g); nr = node(x['x'], x['y'], roof, 'ROOF', g)
            for k, (i, j, row) in enumerate([(nb, n1, 'ตอม่อ'), (n1, nr, 'อะเส')]):
                mid = f"{c['mark'] or 'C'}-{g.replace('/', '')}-{k + 1}"
                members.append({'id': mid, 'mark': c['mark'], 'type': 'column', 'i': i, 'j': j, 'section': sec, 'material': 'C240', 'status': 'from_drawing', 'src': rep['foundation_sheet']})
                p = col_rows.get(row) or next(iter(col_rows.values()), None)
                if p and p['bars']:
                    design['members'][mid] = {'rebar': {'main': [p['bars'][0][0], p['bars'][0][2]], **({'stirrup': [p['stirrup'][1], p['stirrup'][2]]} if p['stirrup'] else {})},
                                              'status': 'from_drawing', 'src': sch['C1'][0]['sheet'] + (f' แถว{row}' if row in col_rows else '')}
    # คานคอดิน: แนวที่มีชื่อ B# เท่านั้น
    xmax = max(GX.values()) if GX else 0; ymax = max(GY.values()) if GY else 0
    lines = [b for b in rep['beams'] if b['marks']]
    skipped = [b for b in rep['beams'] if not b['marks']]
    # แนวขอบแผงที่ไม่มีชื่อคาน = ขอบพื้นวางบนดิน (Earth ยืนยัน 20 ต.ค. 2569) — ไม่สร้างคาน
    colxy = [(nodes[k]['x'], nodes[k]['y']) for k in nodes if nodes[k].get('level') == '1F']
    cnt = Counter()
    for b in lines:
        mark = Counter(b['marks']).most_common(1)[0][0]
        p = parse_section(sch[mark][0]) if mark in sch else {'b': 0.2, 'h': 0.4, 'bars': [], 'stirrup': None}
        if mark not in sch:
            Q.append({'id': f'{mark}-sec', 'q': f'ไม่พบตารางหน้าตัด {mark}'})
        sec = rc(p['b'] or 0.2, p['h'] or 0.4, sch[mark][0]['sheet'] if mark in sch else rep['beam_sheet'])
        c = round(b['c'], 2)
        lim = (0, xmax) if b['axis'] == 'H' else (0, ymax)
        inb = lambda u: lim[0] - 0.02 <= u <= lim[1] + 0.02
        pts = {round(u, 2) for u in (b['from'], b['to']) if inb(u)}   # ปลายที่ยื่นนอกอาคาร ตัดที่คานที่ตัดผ่าน
        for o in lines:
            if o['axis'] != b['axis'] and o['from'] - 0.02 <= c <= o['to'] + 0.02 and b['from'] - 0.02 <= o['c'] <= b['to'] + 0.02:
                pts.add(round(o['c'], 2))
        for (x, y) in colxy:
            u, v = (x, y) if b['axis'] == 'H' else (y, x)
            if abs(v - c) < 0.02 and b['from'] - 0.02 <= u <= b['to'] + 0.02:
                pts.add(round(u, 2))
        pts = sorted(pts)
        for a0, a1 in zip(pts, pts[1:]):
            if a1 - a0 < 0.05:
                continue
            xy = lambda u: (u, c) if b['axis'] == 'H' else (c, u)
            gname = lambda u: next((f'{gx}/{gy}' for gx, X in GX.items() for gy, Y in GY.items() if abs(X - xy(u)[0]) < 0.01 and abs(Y - xy(u)[1]) < 0.01), None)
            i = node(*xy(a0), f1, '1F', gname(a0)); j = node(*xy(a1), f1, '1F', gname(a1))
            cnt[mark] += 1; mid = f'{mark}-1F-{cnt[mark]:02d}'
            members.append({'id': mid, 'mark': mark, 'type': 'tie_beam', 'i': i, 'j': j, 'section': sec, 'material': 'C240', 'level': '1F', 'status': 'from_drawing', 'src': rep['beam_sheet']})
            if p['bars']:
                design['members'][mid] = {'rebar': {'top': [p['bars'][0][0], p['bars'][0][2]], 'bot': [p['bars'][-1][0], p['bars'][-1][2]],
                                                    **({'stirrup': [p['stirrup'][1], p['stirrup'][2]]} if p['stirrup'] else {})}, 'status': 'from_drawing', 'src': sch[mark][0]['sheet']}
    for k, e in col_rows.items():
        pass
    if 'C1' in sch and len(sch['C1']) > 1:
        Q.append({'id': 'C1-rows', 'q': 'ตาราง C1 มี 2 แถว (' + ' / '.join(f"{e['row']}: {', '.join(e['texts'][:1])}" for e in sch['C1']) + ') — ผมใส่ ตอม่อ = ใต้พื้น, อะเส = เหนือพื้นถึงอะเส ถูกไหม'})
    # พื้น (Earth 20 ต.ค. 2569: เส้นประแบ่งแผงในแปลน = เส้นสมมติ · รอบอาคารเป็นพื้นวางบนดินผืนเดียว ไม่มีคาน)
    #  - ในอาคาร: แผงระหว่างคาน (ขอบแผง + ครึ่งคาน = แนวศูนย์คาน) → S1
    #  - นอกอาคารที่มีคานมีชื่อล้อม (เช่น B3 รอบทางลาด): แผงในกรอบนั้น → ทางลาด (แผงที่มีคำว่า SLOPE/ทางลาด) หรือชานพัก
    #  - นอกอาคารที่เหลือ: ทางเดินรอบอาคาร = กรอบนอกสุดลบตัวอาคารลบกรอบทางลาด แบ่งเป็นสี่เหลี่ยม → S2
    slabs = []; design['slabs'] = {}
    h = 0.1
    P = [(round(p[0] - h, 2), round(p[1] - h, 2), round(p[2] + h, 2), round(p[3] + h, 2)) for p in rep['panels']]
    inb = lambda p: p[0] >= -0.05 and p[1] >= -0.05 and p[2] <= xmax + 0.05 and p[3] <= ymax + 0.05
    ext_lines = [b for b in lines if not (b['axis'] == 'H' and -0.02 <= b['c'] <= ymax + 0.02 and b['from'] >= -0.02 and b['to'] <= xmax + 0.02)
                 and not (b['axis'] == 'V' and -0.02 <= b['c'] <= xmax + 0.02 and b['from'] >= -0.02 and b['to'] <= ymax + 0.02)]
    RP_ = rep['panels']   # ขอบนอกสุด = ขอบแผงจริง (ไม่บวกครึ่งคาน เพราะขอบนอกเป็นขอบพื้น ไม่ใช่แนวคาน)
    outer = (min(p[0] for p in RP_), min(p[1] for p in RP_), max(p[2] for p in RP_), max(p[3] for p in RP_)) if RP_ else None
    zones = []
    if ext_lines:
        xs = [b['c'] for b in ext_lines if b['axis'] == 'V'] + [v for b in ext_lines if b['axis'] == 'H' for v in (b['from'], b['to'])]
        ys = [b['c'] for b in ext_lines if b['axis'] == 'H'] + [v for b in ext_lines if b['axis'] == 'V' for v in (b['from'], b['to'])]
        z = [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)]
        if outer:   # กรอบที่เกือบชนขอบนอกสุด (≤ 0.2 ม.) ขยายถึงขอบนอก
            z = [outer[0] if z[0] - outer[0] <= 0.2 else z[0], outer[1] if z[1] - outer[1] <= 0.2 else z[1],
                 outer[2] if outer[2] - z[2] <= 0.2 else z[2], outer[3] if outer[3] - z[3] <= 0.2 else z[3]]
        zones.append(z)
    slope_pts = rep.get('slope_marks') or []
    k = 0
    for p in sorted(P, key=lambda p: (-p[1], p[0])):
        if inb(p):
            k += 1; sid = f'S1-{k:02d}'
            slabs.append({'id': sid, 'mark': 'S1', 'kind': 'ground', 't': 0.10, 'top': f1, 'level': '1F', 'polygon': [[p[0], p[1]], [p[2], p[1]], [p[2], p[3]], [p[0], p[3]]],
                          'material': 'C240', 'use': 'ห้องน้ำ', 'status': 'from_drawing', 'src': rep['beam_sheet'] + ' + S.3.02'})
            design['slabs'][sid] = {'rebar': {'mesh': [9, 0.30, 1]}, 'status': 'from_drawing', 'src': 'S.3.02 พื้นห้องน้ำ'}
    for z in zones:
        inz = [p for p in P if p[0] >= z[0] - 0.05 and p[2] <= z[2] + 0.05 and p[1] >= z[1] - 0.15 and p[3] <= z[3] + 0.05]
        hit = [p for p in inz if any(p[0] <= x <= p[2] and p[1] - 0.6 <= y <= p[3] + 0.6 for x, y in slope_pts)]
        if not hit and len(inz) >= 2:   # ไม่เจอคำว่า SLOPE ในแปลน → แผงใหญ่สุดในกรอบ = ทางลาด ที่เหลือ = ชานพัก
            hit = [max(inz, key=lambda p: (p[2] - p[0]) * (p[3] - p[1]))]
        # ขอบแผงชิดขอบกรอบ (≤ 0.25 ม.) ยืดให้เต็มกรอบ — ไม่ให้เหลือช่องว่างระหว่างทางลาดกับทางเดิน/ตัวอาคาร
        snap = lambda p: (z[0] if p[0] - z[0] <= 0.25 else p[0], z[1] if p[1] - z[1] <= 0.25 else p[1],
                          z[2] if z[2] - p[2] <= 0.25 else p[2], z[3] if z[3] - p[3] <= 0.25 else p[3])
        inz = [tuple(round(float(v), 3) for v in snap(p)) for p in inz]; hit = [tuple(round(float(v), 3) for v in snap(p)) for p in hit]
        cnt = {}
        for n, p in enumerate(sorted(inz, key=lambda p: p[0])):
            ramp = p in hit
            if ramp:   # ทิศขึ้นลาด: จากฝั่งไกลชานพัก → เข้าหาชานพัก
                land = [o for o in inz if o not in hit]
                cx = sum((o[0] + o[2]) / 2 for o in land) / len(land) if land else p[2]
                cy = sum((o[1] + o[3]) / 2 for o in land) / len(land) if land else (p[1] + p[3]) / 2
                dx, dy = cx - (p[0] + p[2]) / 2, cy - (p[1] + p[3]) / 2
                rdir = ('+X' if dx > 0 else '-X') if abs(dx) >= abs(dy) else ('+Y' if dy > 0 else '-Y')
            cnt[ramp] = cnt.get(ramp, 0) + 1
            sid = f"{'RP' if ramp else 'S3'}-{cnt[ramp]:02d}"
            sl = {'id': sid, 'mark': 'RP' if ramp else 'S3', 'kind': 'ground', 't': 0.10, 'top': 0.25, 'level': '1F', **({'note': 'ทางลาด: แผงใหญ่สุดในกรอบคาน B3 (แปลนไม่มีคำ SLOPE ตรงแผง) — Earth ยืนยันเป็นพื้นทางลาด'} if ramp and not slope_pts else {}),
                  'polygon': [[p[0], p[1]], [p[2], p[1]], [p[2], p[3]], [p[0], p[3]]], 'material': 'C240', 'use': 'ทางลาด' if ramp else 'ชานพักทางเข้า',
                  'status': 'from_drawing', 'src': rep['beam_sheet'] + ' + A.2.01'}
            if ramp:
                sl['ramp'] = {'low': 0.05, 'high': 0.25, 'dir': rdir}
            slabs.append(sl)
            design['slabs'][sid] = {'rebar': {'wire_mesh': 'WM-4@0.20'}, 'status': 'from_drawing', 'src': 'S.3.02'}
    if outer:
        holes = [(0.0, 0.0, xmax, ymax)] + [tuple(z) for z in zones]
        XS = sorted({outer[0], outer[2]} | {v for hh in holes for v in (hh[0], hh[2]) if outer[0] < v < outer[2]})
        YS = sorted({outer[1], outer[3]} | {v for hh in holes for v in (hh[1], hh[3]) if outer[1] < v < outer[3]})
        rects = []
        for y0, y1 in zip(YS, YS[1:]):
            row = []
            for x0, x1 in zip(XS, XS[1:]):
                cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                if not any(hh[0] < cx < hh[2] and hh[1] < cy < hh[3] for hh in holes):
                    if row and abs(row[-1][2] - x0) < 1e-6:
                        row[-1][2] = x1
                    else:
                        row.append([x0, y0, x1, y1])
            rects += row
        for n, r in enumerate(rects):
            sid = f'S2-{n + 1:02d}'
            slabs.append({'id': sid, 'mark': 'S2', 'kind': 'ground', 't': 0.10, 'top': 0.05, 'level': '1F',
                          'polygon': [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], 'material': 'C240', 'use': 'ทางเดินรอบอาคาร',
                          'status': 'from_drawing', 'src': rep['beam_sheet'] + ' + A.2.01 (พื้นวางบนดินผืนเดียว แบ่งสี่เหลี่ยมเพื่อเก็บในโมเดล)'})
            design['slabs'][sid] = {'rebar': {'wire_mesh': 'WM-4@0.20'}, 'status': 'from_drawing', 'src': 'S.3.02'}
    # คานนอกอาคาร (เช่น B3 รอบทางลาด): หลังคานเท่าผิวพื้นที่มันรับ — ทางลาดคิดระดับตามแนวลาด
    def surf(x, y):
        best = None
        for sl in slabs:
            if sl['mark'] == 'S1':
                continue
            xs_ = [q[0] for q in sl['polygon']]; ys_ = [q[1] for q in sl['polygon']]
            if not (min(xs_) - 0.15 <= x <= max(xs_) + 0.15 and min(ys_) - 0.15 <= y <= max(ys_) + 0.15):
                continue
            z = sl['top']; r = sl.get('ramp')
            if r:
                ax = 0 if 'X' in r['dir'] else 1; v = (x, y)[ax]; lo, hi = (min(xs_), max(xs_)) if ax == 0 else (min(ys_), max(ys_))
                f = min(1, max(0, (v - lo) / (hi - lo))) if hi > lo else 1
                if r['dir'][0] == '-':
                    f = 1 - f
                z = r['low'] + (r['high'] - r['low']) * f
            best = z if best is None else (max(best, z) if not r else z)   # ทางลาดมีสิทธิ์ก่อน
            if r:
                break
        return best
    inside = lambda n: -0.02 <= n['x'] <= xmax + 0.02 and -0.02 <= n['y'] <= ymax + 0.02
    for n in nodes.values():
        if n.get('level') == '1F' and not inside(n):
            z = surf(n['x'], n['y'])
            if z is not None:
                n['z'] = round(z, 3)
    # คานนอกอาคารที่วิ่งมาชนคานขอบอาคาร: ไม่ยกขึ้นไปหาระดับคานอาคาร — วิ่งราบระดับเดียวกับช่วงนอกไปชนข้างคาน
    # และช่วงสั้นที่ถูกตัดด้วยคานขวาง ต่อเป็นตัวเดียว (Earth 20 ต.ค. 2569: B3 ข้างทางลาดวิ่งยาวไปชน B2)
    NID = {n['id']: n for n in nodes.values()}
    for x in [x for x in members if x['type'] == 'tie_beam']:
        a, b = NID[x['i']], NID[x['j']]
        for end, other in (('i', b), ('j', a)):
            e = NID[x[end]]
            if inside(e) and not inside(other) and abs(e['z'] - other['z']) > 1e-6:
                k = (e['x'], e['y'], other['z'])
                x[end] = node(*k, '1F')
                NID = {n['id']: n for n in nodes.values()}
    merged = True
    while merged:
        merged = False
        tb = [x for x in members if x['type'] == 'tie_beam']
        for x in tb:
            a, b = NID[x['i']], NID[x['j']]
            if not (inside(a) and not inside(b) or inside(b) and not inside(a)):
                continue
            if not ((inside(a) and (a['x'] in (0, xmax) or a['y'] in (0, ymax))) or (inside(b) and (b['x'] in (0, xmax) or b['y'] in (0, ymax)))):
                continue
            out_ = x['j'] if inside(a) else x['i']; on_ = x['i'] if inside(a) else x['j']
            nb = next((y for y in tb if y is not x and y['mark'] == x['mark'] and out_ in (y['i'], y['j'])
                       and abs((NID[y['i']]['x'] - NID[y['j']]['x']) * (NID[on_]['y'] - NID[out_]['y']) - (NID[y['i']]['y'] - NID[y['j']]['y']) * (NID[on_]['x'] - NID[out_]['x'])) < 1e-6), None)
            if nb and abs(NID[nb['i']]['z'] - NID[nb['j']]['z']) < 1e-6:
                far = nb['i'] if nb['j'] == out_ else nb['j']
                nb['i'], nb['j'] = far, on_
                members.remove(x); design['members'].pop(x['id'], None)
                merged = True
                break
    # จุดแบ่งคานที่ไม่เหลือชิ้นอื่นมาต่อ (เช่น คานนอกอาคารย้ายไปชนข้างคาน) → รวมสองท่อนที่ต่อตรงกันเป็นตัวเดียว
    merged = True
    while merged:
        merged = False
        use = Counter(n for x in members for n in (x['i'], x['j']))
        for nid, c_ in use.items():
            if c_ != 2:
                continue
            two = [x for x in members if nid in (x['i'], x['j'])]
            if len(two) != 2 or any(x['type'] != 'tie_beam' for x in two) or two[0]['mark'] != two[1]['mark']:
                continue
            p_ = [NID[two[0]['i'] if two[0]['j'] == nid else two[0]['j']], NID[nid], NID[two[1]['i'] if two[1]['j'] == nid else two[1]['j']]]
            if abs((p_[1]['x'] - p_[0]['x']) * (p_[2]['y'] - p_[0]['y']) - (p_[1]['y'] - p_[0]['y']) * (p_[2]['x'] - p_[0]['x'])) > 1e-6 or abs(p_[0]['z'] - p_[2]['z']) > 1e-6:
                continue
            keep, drop = two
            keep['i'], keep['j'] = p_[0]['id'], p_[2]['id']
            members.remove(drop); design['members'].pop(drop['id'], None)
            merged = True
            break
    # หลังคาเพิง: จากรูปตัด (สูงฝั่งกริด A ระดับหลัง Truss, ต่ำฝั่งกริด C ระดับอะเส) + ระยะยื่นจากแปลนโครงหลังคา
    roofs = []
    rs = rep.get('roof') or {}
    raf = next((steel_section(t) for t in rs.get('rafter', []) if steel_section(t)), None)
    pur = next((steel_section(t) for t in rs.get('purlin', []) if steel_section(t)), None)
    def add_steel(sec):
        if not sec:
            return None
        d = sec['dims']; t = d['t']
        per = (d['h'] + 2 * d['b'] + 2 * d.get('lip', 0) - 4 * t) if sec['shape'].startswith('lipped') else 2 * (d['h'] + d['b'] - 2 * t)
        kg = round(per * t * 7850 * (2 if sec['shape'].endswith('double') else 1), 2)
        secs.setdefault(sec['id'], {'id': sec['id'], 'kind': 'cold_formed', 'shape': 'lipped_C' if sec['shape'].startswith('lipped') else 'box', 'name': sec['id'], 'kg_m': kg,
                                    'dims': {k: round(v * (2 if k == 'b' and sec['shape'].endswith('double') else 1), 4) for k, v in d.items()},
                                    'status': 'from_drawing', 'src': 'S.2.03', 'note': 'น้ำหนักต่อเมตรคิดจากเส้นกลางแผ่น (ไม่ใช่ตาราง มอก.)'})
        return sec['id']
    if chain and len(chain) > 2 and GX and GY:
        ov = 1.1
        pitch = math.degrees(math.atan(chain[2] / ymax)) if ymax else 0
        # ระนาบแผ่นหลังคา = ระนาบท้องจันทัน (หลังอะเส/คอร์ดบน) + ครึ่งความลึกอะเส + จันทัน + แป
        stack = 0.05 + (raf['dims']['h'] if raf else 0) + (pur['dims']['h'] if pur else 0)
        eave = round(roof - (ov * chain[2] / ymax) + stack, 3)
        cover = 'metal_sheet' if any('เมทัลชีท' in t for t in rs.get('cover', [])) else 'metal_sheet'
        roofs.append({'id': 'R1', 'form': 'shed', 'low': 'y2', 'outline': [[-ov, -ov], [xmax + ov, -ov], [xmax + ov, ymax + ov], [-ov, ymax + ov]],
                      'eave': eave, 'pitch': round(pitch, 2), 'overhang': ov, 'cover': cover,
                      'rafter': {'section': add_steel(raf), 'spacing': raf['spacing']} if raf else None,
                      'purlin': {'section': add_steel(pur), 'spacing': pur['spacing']} if pur else None,
                      'status': 'from_drawing', 'src': 'S.2.03–S.2.05 + A.4.01'})
        roofs[-1] = {k: v for k, v in roofs[-1].items() if v is not None}
        # โครงหลังคาจากแปลนโครงหลังคา: ป้ายวงกลม + เส้นโยงชี้แนวกริด (roof_plan_tags) — Truss / อะเส / ดั้ง
        hiY, loY = min(GY, key=GY.get), max(GY, key=GY.get)
        top = round(roof + chain[2], 3)
        zpl = lambda y: round(top + (roof - top) * (y - GY[hiY]) / ((GY[loY] - GY[hiY]) or 1), 3)   # ระนาบท้องจันทัน
        xs = sorted(GX.values()); ys_ = sorted(GY.values())
        tags = rs.get('tags') or []
        tm = {}
        def mem(mk, tp, i, j, sec, src, st='from_drawing', note=None):
            tm[mk] = tm.get(mk, 0) + 1
            members.append(dict({'id': f'{mk}-{tm[mk]:02d}', 'mark': mk, 'type': tp, 'i': i, 'j': j, 'section': sec, 'material': 'SSC400', 'level': 'ROOF',
                                 'group': 'roof_frame', 'status': st, 'src': src}, **({'note': note} if note else {})))
        def box(sec):
            return add_steel(dict(sec, id=f"BOX{round(sec['dims']['h'] * 1000)}x{round(sec['dims']['b'] * 1000)}x{sec['dims']['t'] * 1000:g}"))
        ts = rs.get('truss_sec') or {}
        tsrc = (ts.get('src') or 'S.2.04') + ' รายละเอียด Truss'
        truss_lines = sorted({t['grid'] for t in tags if t['axis'] == 'Y' and 'TRUSS' in (t['item'] or '')}) or [hiY]
        for gy in truss_lines:
            yA = GY[gy]; zb, zt = roof, zpl(yA)
            ch = box(ts['chord']) if ts.get('chord') else box({'shape': 'box', 'dims': {'h': 0.075, 'b': 0.075, 't': 0.0032}})
            wb = box(ts['web']) if ts.get('web') else box({'shape': 'box', 'dims': {'h': 0.038, 'b': 0.038, 't': 0.0016}})
            pts = [xs[0]]
            sp_r = raf['spacing'] if raf and raf.get('spacing') else 1.0
            for a, b in zip(xs, xs[1:]):    # แบ่งช่องเท่ากันตามระยะจันทัน (แบบ: 4EQ / 2EQ / 4EQ)
                n = max(1, round((b - a) / sp_r)); pts += [round(a + (b - a) * k / n, 3) for k in range(1, n + 1)]
            bot_n = [node(x, yA, zb) for x in pts]; top_n = [node(x, yA, zt) for x in pts]
            ends = [node(xs[0] - ov, yA, zt)] + top_n + [node(xs[-1] + ov, yA, zt)]   # คอร์ดบนยื่นถึงชายคา (รูปขยาย 1.10 ม.)
            for a, b in zip(ends, ends[1:]):
                mem('T1', 'truss_chord', a, b, ch, tsrc)
            for k in range(len(pts) - 1):
                mem('T1', 'truss_chord', bot_n[k], bot_n[k + 1], ch, tsrc)
            for k in range(len(pts)):
                mem('T1', 'truss_web', bot_n[k], top_n[k], wb, tsrc)
            for k in range(len(pts) - 1):   # ทแยงฟันปลา: ล่าง→บน แล้วบน→ล่าง (ตามรูปขยาย)
                i, j = (bot_n[k], top_n[k + 1]) if (k % 2 == 0) else (top_n[k], bot_n[k + 1])
                mem('T1', 'truss_web', i, j, wb, tsrc)
        done = set()
        for t in tags:
            it = t['item'] or ''; sec = steel_section(it)
            if not sec or 'TRUSS' in it:
                continue
            sid = add_steel(sec)
            if 'ดั้ง' in it:   # เสาสั้นเหล็กบนหัวเสา คสล. ถึงระนาบท้องจันทัน — ป้ายชี้จุดตัดกริด
                if t['axis'] == 'X':
                    x, y = GX[t['grid']], min(ys_, key=lambda v: abs(v - t['at']))
                else:
                    x, y = min(xs, key=lambda v: abs(v - t['at'])), GY[t['grid']]
                k = ('post', round(x, 2), round(y, 2))
                if k in done or zpl(y) - roof < 0.05:
                    continue
                done.add(k)
                mem('CX', 'steel_column', node(x, y, roof), node(x, y, zpl(y)), sid, t['src'])
            elif 'อะเส' in it:
                k = ('plate', t['axis'], t['grid'])
                if k in done:
                    continue
                done.add(k)
                mk = 'P1' if '2C' in it else 'P2'
                if t['axis'] == 'Y':   # ตามแนวกริดตัวอักษร ตลอดความยาว แบ่งที่กริดตัวเลข
                    y = GY[t['grid']]
                    for a, b in zip(xs, xs[1:]):
                        mem(mk, 'steel_beam', node(a, y, zpl(y)), node(b, y, zpl(y)), sid, t['src'])
                else:                  # ตามแนวกริดตัวเลข เฉพาะช่วงที่ป้ายชี้ (ลาดตามระนาบจันทัน)
                    # อะเสแนวกริดตัวเลข = อะเสบนผนังหัวท้าย วิ่งราบระดับอะเสตลอดแนว ชนโครงถักฝั่งสูง (รูปตัด A.4.06; Earth 20 ต.ค. 2569)
                    x = GX[t['grid']]
                    for a, b in zip(ys_, ys_[1:]):
                        mem(mk, 'steel_beam', node(x, a, roof), node(x, b, roof), sid, t['src'] + ' + รูปตัด A.4')
        # จันทัน / แป ตามตำแหน่งที่ป้ายชี้ในแปลนจันทัน-แป (ลูกศรแต่ละเส้น = 1 ตัว) ยาวเต็มขอบชายคา
        ox0, ox1, oy0, oy1 = xs[0] - ov, xs[-1] + ov, ys_[0] - ov, ys_[-1] + ov
        def snap(v, lo, hi):   # ปลายลูกศรชี้ไม่เป๊ะ: ใกล้ขอบชายคา ≤ 0.10 / ใกล้แนวกริด ≤ 0.05 → ยึดค่านั้น
            if abs(v - lo) <= 0.1: return lo
            if abs(v - hi) <= 0.1: return hi
            g_ = min(list(GX.values()) + list(GY.values()), key=lambda w: abs(w - v))
            return g_ if abs(g_ - v) <= 0.05 else round(v, 2)
        lay = {}
        for t in tags:
            it = t['item'] or ''
            if len(t.get('tips') or []) < 2 or not ('จันทัน' in it or 'แป' in it):
                continue
            sec = steel_section(it)
            if not sec:
                continue
            tp = 'rafter' if 'จันทัน' in it else 'purlin'
            d = lay.setdefault(tp, {'sec': sec, 'src': t['src'], 'x': set(), 'y': set()})
            tx = [q[0] for q in t['tips']]; ty = [q[1] for q in t['tips']]
            if max(tx) - min(tx) > max(ty) - min(ty):   # ลูกศรเรียงตามแกน X → ชิ้นส่วนวิ่งตามแกน Y
                d['x'] |= {snap(v, ox0, ox1) for v in tx}
            else:
                d['y'] |= {snap(v, oy0, oy1) for v in ty}
        hr = lay['rafter']['sec']['dims']['h'] if 'rafter' in lay else 0
        for tp, d in lay.items():
            sid = add_steel(d['sec']); mk = 'RF' if tp == 'rafter' else 'PL'
            hh = d['sec']['dims']['h']
            zc = (lambda y: zpl(y) + 0.05 + hh / 2) if tp == 'rafter' else (lambda y: zpl(y) + 0.05 + hr + hh / 2)
            if d['x']:   # วิ่งตามแกน Y — แบ่งที่แนวรับ (กริดตัวอักษร) ให้ต่อกันเป็นช่วง
                cuts = [oy0] + [v for v in ys_ if oy0 < v < oy1] + [oy1]
                for x in sorted(d['x']):
                    for a, b in zip(cuts, cuts[1:]):
                        mem(mk, tp, node(x, a, zc(a)), node(x, b, zc(b)), sid, d['src'] + ' แปลนจันทัน-แป')
            if d['y']:   # วิ่งตามแกน X — แบ่งที่ตำแหน่งจันทัน
                rx = sorted(lay['rafter']['x']) if 'rafter' in lay and lay['rafter']['x'] else []
                cuts = sorted({ox0, ox1} | {v for v in rx if ox0 < v < ox1})
                for y in sorted(d['y']):
                    for a, b in zip(cuts, cuts[1:]):
                        mem(mk, tp, node(a, y, zc(y)), node(b, y, zc(y)), sid, d['src'] + ' แปลนจันทัน-แป')
        if 'SSC400' not in {m['id'] for m in mats}:
            mats.append({'id': 'SSC400', 'kind': 'cold_formed', 'grade': 'SSC400 (มอก.1228)', 'fy': 2450, 'status': 'assumed'})
        if not tags:
            Q.append({'id': 'roof', 'q': f'แปลนโครงหลังคาไม่พบป้ายชี้ — ใส่ Truss แนวกริด {hiY} อย่างเดียว อะเส/ดั้งอยู่แนวไหน'})
    bm = {'schema_version': '0.1', 'meta': meta, 'site': {'v50': 25, 'terrain': 'A', 'seismic_zone': 'none', 'site_class': 'D', 'status': 'assumed'},
          'grids': G, 'levels': levels, 'materials': mats, 'sections': list(secs.values()), 'nodes': [n for n in nodes.values() if n['id'] in {v for x in members for v in (x['i'], x['j'])} | {sp['node'] for sp in supports}], 'members': members,
          'supports': supports, 'slabs': slabs, 'walls': [], 'roofs': roofs, 'design': design,
          'history': [{'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'by': 'tools/dwgread.py', 'sections': ['*'], 'note': 'อ่านจาก ' + rep['source']['source']}]}
    if csrc:
        for l in bm['levels']:
            if l['name'] in ('1F', 'ROOF', 'RIDGE'):
                l['desc'] = (l.get('desc', '') + f' (จากเส้นบอกระยะรูปตัด {csrc})').strip()
    return bm
