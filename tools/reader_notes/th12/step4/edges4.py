# ผิวสันผนัง (ปลาย/ขอบผนังที่โผล่) + หลังผนัง (ยอดผนังที่ไม่มีอะไรปิด) — Earth 11 พ.ย.
#   "ผนังกรุกระเบื้อง ด้านบนผนังถ้าไม่มีอะไรปิดก็เป็นกรุกระเบื้องด้วย" · "สันข้างผนัง 2|2 เป็นกระเบื้อง เช็คสันผนังทุกจุด (บริเวณเสาเอ็น)"
# วิธี: แบ่งอาคารเป็นช่อง 2.5 ซม. ในแปลน × ชั้นความสูงตามจุดเปลี่ยนระดับจริง → ผิวตั้ง/ผิวบนของผนังก่อ + เสาเอ็นในผนัง ที่ไม่มีชิ้นใดปิด
#   - หน้าข้างผนัง (ตั้งฉากแนวผนัง) = ผิวผนังรายด้าน L/R มีอยู่แล้ว ไม่คิดซ้ำ · หน้าเสา คสล. = CS-… · เสาเอ็นหน้าห้องส้วม = SS-…
#   - ช่องเปิดโล่ง (kind opening): ข้างช่อง = สันผนัง · ช่องโค้ง: ส่วนโค้งคิดเป็นสูตร π r t · ประตู/บล็อกแก้ว/บล็อกช่องลม: มีวงกบ/บล็อกปิด ไม่คิด
#   - หลังผนัง: ช่วงที่มีผนังอีกชิ้น/คาน/อะเส/เสาเอ็นวางทับ (แม้ทับไม่เต็มความหนา) = ปิดทั้งความหนา
import math, collections, re
import numpy as np

RES = 0.025
def wall_edges(m, F, N, SEC, OT, OPS, space, FZ, ROOM, SPEC, WSIDES, in_brick, SS_IDS, status_user, status_assumed, status_fd):
    X0, Y0, X1, Y1 = -0.5, -0.7, 11.3, 6.3
    NX, NY = int(round((X1 - X0) / RES)), int(round((Y1 - Y0) / RES))
    xc = X0 + (np.arange(NX) + 0.5) * RES; yc = Y0 + (np.arange(NY) + 0.5) * RES
    def rmask(x0, y0, x1, y1):
        return np.outer((xc > x0 + 1e-6) & (xc < x1 - 1e-6), (yc > y0 + 1e-6) & (yc < y1 - 1e-6))
    def wrect(w, t=None):
        (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; t = (t or w['t']) / 2
        if abs(ay - by) < 1e-9: return (min(ax, bx), ay - t, max(ax, bx), ay + t), 'x'
        assert abs(ax - bx) < 1e-9, ('ผนังไม่ขนานแกน', w['id'])
        return (ax - t, min(ay, by), ax + t, max(ay, by)), 'y'
    BR = [w for w in m['walls'] if w['kind'] == 'brick_mon']; BI = {w['id']: i + 1 for i, w in enumerate(BR)}
    OW = [w for w in m['walls'] if w['kind'] != 'brick_mon' and not w.get('rise')]
    STI = [x for x in m['members'] if x['type'] == 'stiffener']
    def mbox(x):   # ชิ้นตั้ง (เสา/เสาเอ็น): กรอบแปลน + ช่วงสูง
        a, b = N[x['i']], N[x['j']]; s = SEC[x['section']]; hb, hh = s['b'] / 2, s['h'] / 2
        return (a['x'] - hb, a['y'] - hh, a['x'] + hb, a['y'] + hh), min(a['z'], b['z']), max(a['z'], b['z'])
    COLS = [x for x in m['members'] if x['type'] == 'column']
    # ---- ชั้นความสูง
    Z = set()
    for w in m['walls']:
        if not w.get('rise'): Z |= {w['bottom'], w['top']}
    for x in STI + COLS: _, z0, z1 = mbox(x); Z |= {z0, z1}
    Z |= set(FZ.values()) | {0.0}
    for w in BR:
        for o in OPS[w['id']]:
            t = OT[o['type']]
            if t['kind'] == 'opening': s0 = w['bottom'] + (o.get('sill', t.get('sill')) or 0); Z |= {s0, min(w['top'], s0 + t['h'])}
    zs = sorted({round(z, 3) for z in Z if -0.05 <= z <= 3.6}); NK = len(zs) - 1
    zm = [(zs[k] + zs[k + 1]) / 2 for k in range(NK)]
    brick = np.zeros((NK, NX, NY), np.int16); stf = np.zeros((NK, NX, NY), np.int16); other = np.zeros((NK, NX, NY), bool)
    for w in BR:
        rc, _ = wrect(w); mk = rmask(*rc)
        for k in range(NK):
            if w['bottom'] - 1e-6 <= zs[k] and zs[k + 1] <= w['top'] + 1e-6: brick[k][mk & (brick[k] == 0)] = BI[w['id']]
    for w in BR:   # ช่องเปิดโล่ง → ว่าง (ช่องโค้ง: ถึงจุดเริ่มโค้ง)
        rc, ax = wrect(w); (ax0, ay0) = w['path'][0]; (bx0, by0) = w['path'][-1]; sg = 1 if (bx0 - ax0 if ax == 'x' else by0 - ay0) > 0 else -1
        for o in OPS[w['id']]:
            t = OT[o['type']]
            if t['kind'] != 'opening': continue
            c = (ax0 if ax == 'x' else ay0) + sg * o['at']; s0 = w['bottom'] + (o.get('sill', t.get('sill')) or 0); s1 = min(w['top'], s0 + t['h'])
            mk = rmask(c - t['w'] / 2, rc[1], c + t['w'] / 2, rc[3]) if ax == 'x' else rmask(rc[0], c - t['w'] / 2, rc[2], c + t['w'] / 2)
            for k in range(NK):
                if s0 - 1e-6 <= zs[k] and zs[k + 1] <= s1 + 1e-6: brick[k][mk] = 0
    SIN = []   # เสาเอ็นในผนังก่อ
    for x in STI:
        a = N[x['i']]; rc, z0, z1 = mbox(x); mk = rmask(*rc)
        inb = in_brick(a['x'], a['y']) and x['id'] not in SS_IDS
        if inb: SIN.append(x)
        for k in range(NK):
            if z0 - 1e-6 <= zs[k] and zs[k + 1] <= z1 + 1e-6:
                if inb: stf[k][mk & (brick[k] == 0)] = len(SIN)
                else: other[k] |= mk
    for x in COLS:
        rc, z0, z1 = mbox(x); mk = rmask(*rc)
        for k in range(NK):
            if z0 - 1e-6 <= zs[k] and zs[k + 1] <= z1 + 1e-6: other[k] |= mk
    for w in OW:
        rc, _ = wrect(w, max(w['t'], 0.10)); mk = rmask(*rc)   # แผงบาง (ระแนง แผงเหล็ก แผงประตู) ถือว่าปิดเต็มความหนาผนัง 0.10
        for k in range(NK):
            if w['bottom'] - 1e-6 <= zs[k] and zs[k + 1] <= w['top'] + 1e-6: other[k] |= mk
    solid = (brick > 0) | (stf > 0) | other
    # ---- ระดับผิวพื้นของแต่ละช่อง (ผิวที่อยู่ต่ำกว่าผิวพื้นฝั่งที่หันไป = จมในพื้น)
    fz = np.zeros((NX, NY)); rooms = {}
    for i in range(NX):
        for j in range(NY):
            r = space(xc[i], yc[j]); rooms[(i, j)] = r; fz[i, j] = FZ.get(r, 0.0)
    # ---- ผนังที่เสาเอ็นสังกัด (ผนังก่อที่เสาเอ็นอยู่ในแนว) + กฎป้ายผิวของสัน/หลังผนัง
    def walls_of(x):
        a = N[x['i']]; out = []
        for w in BR:
            (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
            u = (a['x'] - ax) * ux + (a['y'] - ay) * uy; d = abs(-(a['x'] - ax) * uy + (a['y'] - ay) * ux)
            if -0.06 <= u <= L + 0.06 and d <= w['t'] / 2 + 1e-6: out.append(w)
        return out
    SW = [walls_of(x) for x in SIN]
    def host(kind, idx, z):
        if kind == 'b': return BR[idx - 1]
        ws = SW[idx - 1]; up = [w for w in ws if w['top'] >= z - 1e-6]
        return max(up or ws, key=lambda w: (w['top'], w['id']))
    LINE = np.zeros((NX, NY), bool)   # แนวผนังก่อทั้งหมดในแปลน (รวมช่วงช่องเปิด) — ผิวที่หันเข้าแนวผนัง = ข้างช่องเปิด/ขอบขั้นตามแนวผนัง
    for w in BR: LINE |= rmask(*wrect(w)[0])
    def marks(w):
        inn, out = w['mark'].split('|'); return inn, out.split('+')[0]
    def tag_v(w, ni, nj):   # ป้ายผิวของสันผนัง (ผิวตั้ง) → (tag, สมมติ?, ภายนอก?)
        inn, out = marks(w); r = rooms.get((ni, nj), 'ภายนอก')
        if inn == out: return inn, False, (inn == '1' and not ROOM(r))
        if LINE[ni, nj]: return ('2' if '2' in (inn, out) else inn), True, False   # ผนังสองด้านผิวต่างกัน หันเข้าแนวผนัง (ข้างช่องเปิดโล่ง/ขอบขั้น): สมมติกระเบื้อง รอ Earth ยืนยัน
        return (inn, False, False) if ROOM(r) else (out, False, out == '1')          # ปลายอิสระ: ตามพื้นที่ที่หันไปหา (ห้องน้ำ = ป้ายใน · นอก = ป้ายนอก)
    def tag_t(w):   # ป้ายผิวของหลังผนัง
        inn, out = marks(w)
        if inn == out: return inn, False, (inn == '1' and not any(ROOM(r) for r in WSIDES.get(w['id'], {}).values()))
        return ('2' if '2' in (inn, out) else inn), True, False
    # ---- ผิวตั้ง
    VF = collections.defaultdict(lambda: collections.defaultdict(set))   # (wall, tag, mixed, nx, ny, plane) → layer → {pos}
    for k in range(NK):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = np.zeros((NX, NY), bool); nf = np.zeros((NX, NY))
            if dx == 1: nb[:-1, :] = solid[k][1:, :]; nf[:-1, :] = fz[1:, :]
            elif dx == -1: nb[1:, :] = solid[k][:-1, :]; nf[1:, :] = fz[:-1, :]
            elif dy == 1: nb[:, :-1] = solid[k][:, 1:]; nf[:, :-1] = fz[:, 1:]
            else: nb[:, 1:] = solid[k][:, :-1]; nf[:, 1:] = fz[:, :-1]
            for kind, arr in (('b', brick[k]), ('s', stf[k])):
                ex = (arr > 0) & ~nb & (zm[k] > nf)
                for i, j in zip(*np.nonzero(ex)):
                    w = host(kind, int(arr[i, j]), zm[k])
                    if kind == 'b':
                        _, ax = wrect(w)
                        if (ax == 'x') != (dx != 0): continue   # หน้าข้างผนัง = ผิวรายด้าน L/R มีแล้ว
                    tg, mixed, ext = tag_v(w, min(NX - 1, max(0, i + dx)), min(NY - 1, max(0, j + dy)))
                    plane = round((X0 + (i + (1 if dx == 1 else 0)) * RES) if dx else (Y0 + (j + (1 if dy == 1 else 0)) * RES), 3)
                    VF[(w['id'], tg, mixed, ext, dx, dy, plane)][k].add(int(j if dx else i))
    faces = collections.defaultdict(list)   # (wall, tag, mixed, ext) → faces
    for (wid, tg, mixed, ext, dx, dy, plane), lay in VF.items():
        runs = {}
        for k in sorted(lay):
            ps = sorted(lay[k]); st = ps[0]; pv = ps[0]; rr = []
            for p in ps[1:] + [None]:
                if p is None or p != pv + 1: rr.append((st, pv + 1)); st = p
                pv = p
            runs[k] = rr
        done = set()
        for k in sorted(runs):
            for r in runs[k]:
                if (k, r) in done: continue
                k2 = k
                while k2 + 1 in runs and r in runs[k2 + 1]: k2 += 1; done.add((k2, r))
                o0 = (Y0 if dx else X0); a0, a1 = round(o0 + r[0] * RES, 3), round(o0 + r[1] * RES, 3)
                p = [[plane, a0], [plane, a1]] if dx else [[a0, plane], [a1, plane]]
                faces[(wid, tg, mixed, ext)].append({'p': p, 'n': [dx, dy], 'z': [zs[k], zs[k2 + 1]]})
    # ---- หลังผนัง (ยอดที่ไม่มีอะไรปิด)
    MB = []   # ชิ้นเหล็ก/คานแนวนอนที่อาจวางทับยอดผนัง
    for x in m['members']:
        if x['type'] in ('column', 'stiffener', 'steel_column', 'lintel', 'tie_beam'): continue
        a, b = N[x['i']], N[x['j']]; s = SEC.get(x['section'], {})
        nm = [float(v) / 1000 for v in re.findall(r'[\d.]+', re.sub(r'^\d(?=C)', '', s.get('name', '') or x['section']))]
        bw, bh = (s['b'], s['h']) if s.get('b') and s.get('h') else ((nm[1], nm[0]) if len(nm) >= 2 else (0.05, 0.1))
        if max(a['z'], b['z']) + bh / 2 < 0.3: continue
        MB.append((a, b, bw, bh))
    def memcover(T):
        cv = np.zeros((NX, NY), bool)
        for a, b, bw, bh in MB:
            L = math.hypot(b['x'] - a['x'], b['y'] - a['y'])
            if L < 1e-6: continue
            ux, uy = (b['x'] - a['x']) / L, (b['y'] - a['y']) / L
            U = (xc[:, None] - a['x']) * ux + (yc[None, :] - a['y']) * uy; D = np.abs(-(xc[:, None] - a['x']) * uy + (yc[None, :] - a['y']) * ux)
            zc = a['z'] + (b['z'] - a['z']) * np.clip(U / L, 0, 1)
            cv |= (U >= -1e-6) & (U <= L + 1e-6) & (D <= bw / 2 + 1e-6) & (zc - bh / 2 <= T + 0.03) & (zc + bh / 2 > T + 0.005)
        return cv
    TOPS = collections.defaultdict(lambda: np.zeros((NX, NY), bool))   # (wall, tag, mixed, ext, z) → cells
    for k in range(NK):
        T = zs[k + 1]; above = solid[k + 1] if k + 1 < NK else np.zeros((NX, NY), bool)
        hb = (brick[k] > 0) | (stf[k] > 0)
        if not (hb & ~above).any(): continue
        blk = above | memcover(T)
        for w in BR:
            if abs(w['top'] - T) > 1e-6: continue
            rc, ax = wrect(w); reg = rmask(*rc)
            bad = (reg & blk).any(axis=1 if ax == 'x' else 0)   # ช่วงตามยาวที่มีอะไรทับ (แม้ไม่เต็มความหนา) = ปิดทั้งความหนา
            okm = reg & (brick[k] == BI[w['id']]) & ~(bad[:, None] if ax == 'x' else bad[None, :])
            if okm.any(): TOPS[(w['id'], *tag_t(w), T)] |= okm
        for idx, x in enumerate(SIN, 1):
            okm = (stf[k] == idx) & ~blk
            if okm.any():
                w = host('s', idx, T); TOPS[(w['id'], *tag_t(w), T)] |= okm
    tops = collections.defaultdict(list)
    for (wid, tg, mixed, ext, T), g in TOPS.items():
        g = g.copy()
        for i in range(NX):
            j = 0
            while j < NY:
                if not g[i, j]: j += 1; continue
                j1 = j
                while j1 < NY and g[i, j1]: j1 += 1
                i1 = i + 1
                while i1 < NX and g[i1, j:j1].all() and (j == 0 or not g[i1, j - 1]) and (j1 == NY or not g[i1, j1]): i1 += 1
                g[i:i1, j:j1] = False
                tops[(wid, tg, mixed, ext, T)].append([round(X0 + i * RES, 3), round(Y0 + j * RES, 3), round(X0 + i1 * RES, 3), round(Y0 + j1 * RES, 3)])
                j = j1
    # ---- ส่วนโค้งของช่องโค้ง (สูตร π r t) รวมกับสันผนังของผนังนั้น
    arcs = collections.defaultdict(list)
    for w in BR:
        for o in OPS[w['id']]:
            t = OT[o['type']]
            if t['kind'] == 'opening' and t.get('shape') == 'arch': arcs[w['id']].append((o['id'], math.pi * t['w'] / 2 * w['t']))
    # ---- เขียนลง finishes + รวมฉาบ/ทาสีที่ผนัง
    WLd = {w['id']: w for w in m['walls']}; out = {'E': collections.defaultdict(float), 'T': collections.defaultdict(float), 'rec': [], 'mixed': []}
    def room_of(w):
        rs = [r for r in WSIDES.get(w['id'], {}).values() if ROOM(r)] or list(WSIDES.get(w['id'], {}).values())
        return rs[0] if rs else ''
    sid = lambda wid: wid[2:] if wid.startswith('W-') else wid
    def base(w, tg, mixed, ext, sd):
        return {'kind': 'wall', 'spec': SPEC[tg] + ((' ภายนอก' if ext else ' ภายใน') if tg == '1' else ''), 'wall': w['id'], 'side': sd, 'tag': tg, 'unit': 'ตร.ม.', 'room': room_of(w), 'level': '1F',
                'status': status_user if (mixed or tg != '1') else status_fd,
                'src': f'A.2.01 ป้ายวัสดุผนัง {w["mark"]} + Earth 11 พ.ย. (สัน/หลังผนังที่ไม่มีอะไรปิดใช้ผิวเดียวกับผนัง)'}
    def book(w, f, tg, mixed, ext, a, what):
        if tg == '1':
            f['counted_by'] = 'wall'; ka = 'ext' if ext else 'int'
            pa = w.get('plaster_area') or {'int': 0.0, 'ext': 0.0}; pa[ka] = round(pa[ka] + a, 3)
            w['plaster'] = w['paint'] = True; w['plaster_area'] = pa; w['paint_area'] = dict(pa)
            f['note'] += f' · ฉาบ + ทาสี{"ภายนอก" if ext else "ภายใน"} — ปริมาณรวมอยู่ที่ผนัง {w["id"]} (plaster_area / paint_area)'
        if mixed:
            f['note'] += f' · ผนังป้าย {w["mark"]} สองด้านผิวต่างกัน ใช้กระเบื้อง (Earth 11 พ.ย. ยืนยัน)'; out['mixed'].append((f['id'], w['id'], w['mark'], what, round(a, 3)))
        f['qty'] = round(a, 3); out[what][(tg, 'ext' if ext else 'int', 'assumed' if mixed else 'ok')] += a; F.append(f); out['rec'].append(f)
    for wid, ar in arcs.items():   # ท้องโค้งรวมกับกลุ่มสันผนังที่หันเข้าแนวผนังของผนังนั้น
        w = WLd[wid]; inn, o_ = marks(w); key = (wid, inn, False, False) if inn == o_ else (wid, '2' if '2' in (inn, o_) else inn, True, False)
        faces.setdefault(key, [])
    nE = collections.Counter(k[0] for k in faces)
    for (wid, tg, mixed, ext), fl in sorted(faces.items()):
        w = WLd[wid]; fl.sort(key=lambda q: (q['n'], q['p'], q['z']))
        a = sum(math.dist(*q['p']) * (q['z'][1] - q['z'][0]) for q in fl)
        f = base(w, tg, mixed, ext, 'E'); f['id'] = f'WF-{sid(wid)}-E' + (f'-{tg}{"x" if ext else ""}' if nE[wid] > 1 else ''); f['faces'] = fl
        f['note'] = f'สันผนัง {wid} (ปลายผนัง/ข้างช่องเปิดโล่ง/ขอบเสาเอ็นที่โผล่) {len(fl)} หน้า {a:.3f} ตร.ม.'
        inn, o_ = marks(w); arc_here = wid in arcs and ext is False and (tg == (inn if inn == o_ else ('2' if '2' in (inn, o_) else inn))) and mixed == (inn != o_)
        if arc_here:
            ar = arcs[wid]; f['arcs'] = [{'opening': oid} for oid, _ in ar]; aa = sum(v for _, v in ar); a += aa
            f['note'] += f' + ท้องโค้งช่องโค้ง π × r × หนาผนัง {aa:.3f} ตร.ม.'
        book(w, f, tg, mixed, ext, a, 'E')
    nT = collections.Counter(k[0] for k in tops)
    for (wid, tg, mixed, ext, T), rl in sorted(tops.items()):
        w = WLd[wid]; a = sum((r[2] - r[0]) * (r[3] - r[1]) for r in rl)
        f = base(w, tg, mixed, ext, 'T'); n = sum(1 for q in out['rec'] if q['wall'] == wid and q['side'] == 'T')
        f['id'] = f'WF-{sid(wid)}-T' + (str(n + 1) if nT[wid] > 1 else ''); f['rects'] = rl; f['z'] = T
        f['note'] = f'หลังผนัง {wid} ที่ระดับ +{T:.2f} ช่วงที่ไม่มีผนัง/คาน/อะเส/เสาเอ็นทับ {a:.3f} ตร.ม.'
        book(w, f, tg, mixed, ext, a, 'T')
    return out
