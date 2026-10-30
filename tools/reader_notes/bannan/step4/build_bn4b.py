# Step 4b บ้านแนน: ผนังสองชั้น → 2 แผ่น · ชนิดผนังตามห้อง (ห้องน้ำ = อิฐมอญครึ่งแผ่น · อื่น = อิฐมวลเบา 10 ซม.)
# ผิวผนังรายด้านแบ่งตามห้อง: ป้าย P ในแปลน → ไม่มีป้ายใช้ตามชนิดห้อง · กระเบื้อง P2/P4 ถึงระดับฝ้า ไม่ฉาบ/ไม่ทาสี
# P3 Cast in Stone: แผงในกรอบหน้าต่าง W2 ด้านหน้า + แผงโถงทางเข้า E–F · บัวพื้นไม้ 3/4"×4"
import json, math, collections, sys, io, contextlib
sys.path.insert(0, '../st'); import ext
import numpy as np
with contextlib.redirect_stdout(io.StringIO()):
    import build_bn4a as A          # ห้อง (mask) + ฝ้า จาก 4a (เขียน stage4a ใหม่ด้วย)
from rooms import H
m = json.load(open('stage4a.bm.json'))
AS, FD, US = 'assumed', 'from_drawing', 'user'
ROWS = []
def row(*a): ROWS.append(list(a))
WSPEC = {
    'P1': 'ผนัง P1 ฉาบเรียบ Skimcoat ทาสี TOA สีขาว',
    'P2': 'ผนัง P2 บุกระเบื้อง 10"×16" สูงชนฝ้า',
    'P3': 'ทาสี TOA 8295 Cast in Stone (P3)',
    'P4': 'ผนัง P4 บุกระเบื้อง 30×60 ซม. สูงชนฝ้า',
    'SK': 'บัวพื้นไม้เนื้อแข็ง 3/4"×4"',
}
OUTDOOR = {'จอดรถ', 'ทางเดินข้างบ้าน', 'ลานหลังบ้าน', 'ลานหลังบ้าน (2)', 'ห้องปั๊มน้ำ', 'เฉลียง', 'ลานหน้าบ้าน (2)'}
isbath = lambda nm: nm.startswith('ห้องน้ำ')

# ---------------------------------------------------------------- ป้าย P → (ผนัง, ด้าน) + ระยะตามแนวผนัง (ใช้ผนังก่อนแยก)
def tag_faces(walls):
    out = collections.defaultdict(list)
    for num, zr in (('A-04#2', (0, 1)), ('A-05', (4.4, 4.8))):
        s = ext.sheet(num); f = ext.P(num)
        W = [w for w in walls if zr[0] - 0.3 <= w['bottom'] <= zr[1] + 0.3 and w['kind'] != 'other']
        for q in s['prims']:
            if q.get('layer') != 'A_sym_wall': continue
            p = f(q['at']); best = None
            for w in W:
                (ax, ay), (bx, by) = w['path'][0], w['path'][-1]
                L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
                t = (p[0] - ax) * ux + (p[1] - ay) * uy; tc = max(0, min(L, t)); off = (p[0] - ax) * -uy + (p[1] - ay) * ux
                d = math.hypot(p[0] - (ax + ux * tc), p[1] - (ay + uy * tc))
                if best is None or d < best[0]: best = (d, w, off, tc)
            d, w, off, tc = best
            if d - w['t'] / 2 > 0.25: continue
            out[(w['id'], 'L' if off > 0 else 'R')].append((tc, q['attrs']['ผนัง']))
    return out
TAGS = tag_faces(m['walls'])

# ---------------------------------------------------------------- ผนังหนาจาก Step 1 แยกแล้วใน 4a (fixwalls) — ป้ายอ่านใหม่จากผนังที่แยกแล้ว
OT = m['opening_types']; split = {k: v for k, v in A.WINFO.items() if len(v) > 1}; single = {k: v for k, v in A.WINFO.items() if len(v) == 1}
row('ผนัง', 'ผนังก่อสองชั้น', f'{len(split)} ท่อน ({", ".join(split)}) แยกเป็นแผ่น 0.10 สองแผ่นตามแกนอิฐในแปลน — ประตู/หน้าต่างนับครั้งเดียว แผ่นที่สองเป็นช่องเปล่า', 'A-04, A-05 (DXF)', US,
    'Earth 30 ต.ค.: ก่อสองชั้นเว้นช่องเดินท่องานระบบ · ด้านในช่องไม่ฉาบ')
row('ผนัง', 'แก้ความหนาผนัง', f'{len(single)} ท่อน ({", ".join(single)}) Step 1 ใส่หนา 0.25/0.50 แต่ใน DXF มีแกนอิฐเส้นเดียว → หนา 0.10 ที่ตำแหน่งแกน', 'A-04, A-05 (DXF)', FD, 'แก้จาก Step 1')
# ---------------------------------------------------------------- ห้องรอบผนัง
LAB = {}
for fl in ('1F', '2F'):
    rs = [(k[1], r) for k, r in A.ROOMS.items() if k[0] == fl]; R = rs[0][1]['R']
    img = np.zeros(R['wall'].shape, int); names = [None]
    for nm, r in rs: names.append(nm); img[r['mask']] = len(names) - 1
    LAB[fl] = (img, names, R)
from scipy import ndimage
OUTM = {}
for fl in ('1F', '2F'):
    img, names, R = LAB[fl]; free = ~R['real']; lab_, n_ = ndimage.label(free)
    edge = np.unique(np.concatenate([lab_[0], lab_[-1], lab_[:, 0], lab_[:, -1]])); edge = edge[edge > 0]
    sizes = ndimage.sum(np.ones_like(lab_), lab_, index=np.arange(n_ + 1)) * H * H
    OUTM[fl] = (np.isin(lab_, edge), lab_, sizes)
def space_at(fl, x, y):
    """ด้านที่ไม่ติดห้อง: 'ext' นอกอาคาร · 'shaft' ช่องปิดเล็ก (< 1.5 ตร.ม. ช่องท่อ/โพรง) · 'void' ที่ว่างภายใน (ช่องโล่ง/บันได)"""
    img, names, R = LAB[fl]; out, lab_, sizes = OUTM[fl]; iy, ix = int((y - R['y0']) / H), int((x - R['x0']) / H)
    if not (0 <= iy < img.shape[0] and 0 <= ix < img.shape[1]): return 'ext'
    if out[iy, ix]: return 'ext'
    l = lab_[iy, ix]
    if l == 0: return 'shaft'
    return 'shaft' if sizes[l] < 1.5 else 'void'
def room_at(fl, x, y):
    img, names, R = LAB[fl]; iy, ix = int((y - R['y0']) / H), int((x - R['x0']) / H)
    if not (0 <= iy < img.shape[0] and 0 <= ix < img.shape[1]): return None
    best = None   # หาในรัศมี 2 เซลล์ (ขอบห้องเว้นช่องผนัง)
    for dy in (0, -1, 1, -2, 2):
        for dx in (0, -1, 1, -2, 2):
            j, i = iy + dy, ix + dx
            if 0 <= j < img.shape[0] and 0 <= i < img.shape[1] and img[j, i]: return names[img[j, i]]
    return best
FLZ = {k: r['lv'] for k, r in A.ROOMS.items()}
CZ = {}
for k, c in A.CEIL.items(): CZ[k] = FLZ[k] + c[1]
def floor_of(w): return '1F' if w['bottom'] < 2.0 else '2F'
def oarea_in(o, z0, z1, wb):   # พื้นที่ช่องเปิดในช่วงความสูง [z0, z1] (ระดับจริง)
    t = OT[o['type']]; s = wb + (o.get('sill', t.get('sill')) or 0); e = s + t['h']
    return t['w'] * max(0, min(e, z1) - max(s, z0))

CAV = A.CAV
FACE = []    # (wall, side, u0, u1, room, code, src, z0, z1)
for w in m['walls']:
    if w['kind'] == 'other': continue
    (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
    fl = floor_of(w)
    for sd, sg in (('L', 1), ('R', -1)):
        if (w['id'], sd) in CAV: continue
        nx, ny = -uy * sg, ux * sg; off = w['t'] / 2 + 0.06
        n = max(1, int(L / 0.05)); seq = []
        for i in range(n):
            u = (i + 0.5) * L / n; px, py = ax + ux * u + nx * off, ay + uy * u + ny * off
            r = room_at(fl, px, py); seq.append(r if r else '#' + space_at(fl, px, py))
        runs = []
        for i, r in enumerate(seq):
            if runs and runs[-1][2] == r: runs[-1][1] = (i + 1) * L / n
            else: runs.append([i * L / n, (i + 1) * L / n, r])
        tg = sorted(TAGS.get((w['id'], sd), []))
        for u0, u1, rm in runs:
            if u1 - u0 < 0.08: continue
            mine = [(t, c) for t, c in tg if u0 - 0.1 <= t <= u1 + 0.1]
            if rm == '#shaft': continue   # ช่องท่อ/โพรงปิด ไม่ทำผิว
            ext_ = rm == '#ext' or rm in OUTDOOR
            rm_ = {'#ext': 'ภายนอก', '#void': 'ช่องโล่ง/บันได (ภายใน)'}.get(rm, rm)
            if mine:
                codes = sorted({c for _, c in mine})
                if len(codes) == 1: zones = [(u0, u1, codes[0], 'ป้าย')]
                else:
                    cut = [u0] + [(mine[k][0] + mine[k + 1][0]) / 2 for k in range(len(mine) - 1)] + [u1]
                    zones = [(cut[k], cut[k + 1], mine[k][1], 'ป้าย') for k in range(len(mine))]
            else:
                zones = [(u0, u1, 'P2' if isbath(rm_) else 'P1', 'ตามห้อง')]
            for z0_, z1_, c, src in zones:
                FACE.append(dict(w=w, sd=sd, u0=z0_, u1=z1_, room=rm_, code=c, src=src, fl=fl, ext=bool(ext_)))

# ---------------------------------------------------------------- ชนิดผนัง: ด้านใดติดห้องน้ำเกินครึ่งความยาว → อิฐมอญครึ่งแผ่น
bathlen = collections.defaultdict(float)
for f in FACE:
    if isbath(f['room']) or f['code'] == 'P2': bathlen[f['w']['id']] += f['u1'] - f['u0']
nb = na = 0
for w in m['walls']:
    if w['kind'] == 'other': continue
    L = math.dist(w['path'][0], w['path'][-1])
    if bathlen[w['id']] >= 0.5 * L: w['kind'] = 'brick_mon'; nb += 1
    else: w['kind'] = 'aac'; na += 1
    if 0.05 < bathlen[w['id']] < 0.5 * L: w['note'] = (w.get('note', '') + ' · ' if w.get('note') else '') + 'ติดห้องน้ำบางช่วง — ใช้อิฐมวลเบาตามความยาวส่วนใหญ่'
row('ผนัง', 'ชนิดผนัง', f'อิฐมอญครึ่งแผ่น {nb} ท่อน (ติดห้องน้ำ ≥ ครึ่งความยาว) · อิฐมวลเบา 10 ซม. {na} ท่อน', 'A-02 (P1–P4 + หมายเหตุผนังห้องน้ำ)', FD,
    'Earth 30 ต.ค.: เปลี่ยนตามป้าย (Step 1 ใส่อิฐมอญทั้งหลัง)')

# ---------------------------------------------------------------- พื้นที่ผิวรายช่วง
ops_by = collections.defaultdict(list)
for o in m['openings']: ops_by[o['wall']].append(o)
area = collections.defaultdict(lambda: collections.defaultdict(float))   # wall → {plaster_int, plaster_ext, paint_int, paint_ext}
TILE = collections.defaultdict(float); TILEF = []; SUM = collections.defaultdict(float); P3 = []
for f in FACE:
    w = f['w']; wb, wt = w['bottom'], w['top']
    if f['ext'] and f['room'] == 'ภายนอก': z0, z1 = wb, wt
    else:
        key = (f['fl'], f['room']); z0 = max(wb, FLZ.get(key, wb)); z1 = min(wt, CZ.get(key, wt))
    if z1 - z0 < 0.05: continue
    gross = (f['u1'] - f['u0']) * (z1 - z0)
    op = sum(oarea_in(o, z0, z1, wb) for o in ops_by[w['id']] if f['u0'] - 1e-6 <= o['at'] < f['u1'] + 1e-6)
    net = max(0.0, gross - op); f['net'] = net; f['z0'], f['z1'] = z0, z1
    sd = 'ext' if f['ext'] else 'int'
    if f['code'] == 'P3':   # ป้าย P3 ในแปลน: ฉาบ + ทาสี Cast in Stone
        area[w['id']]['plaster_' + sd] += net; P3.append((w['id'], net, 'ป้าย P3 ในแปลน')); SUM[(f['code'], sd, f['src'])] += net; continue
    if f['code'] in ('P2', 'P4'):
        TILE[(w['id'], f['sd'], f['room'], f['code'])] += net
        TILEF.append(f)
    else:
        area[w['id']]['plaster_' + sd] += net; area[w['id']]['paint_' + sd] += net
    SUM[(f['code'], sd, f['src'])] += net

# ---------------------------------------------------------------- P3 Cast in Stone (รูปด้าน A): แผงใต้/เหนือหน้าต่าง W2 ด้านหน้า + แผงโถงทางเข้า E–F
P3plan = len(P3)
def outward_y(w, sd):
    (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); sg = 1 if sd == 'L' else -1
    return (bx - ax) / L * sg   # ny ของด้านนั้น
for f in FACE:
    w = f['w']
    if not f['ext'] or outward_y(w, f['sd']) > -0.9 or min(p[1] for p in w['path']) > 7.0: continue
    wb, wt = w['bottom'], w['top']
    mid = sum(p[0] for p in w['path']) / len(w['path'])
    if 7.05 <= mid <= 10.35:   # แผงโถงทางเข้า E–F ทั้งด้าน (หักประตู/หน้าต่าง)
        P3.append((w['id'], f['net'], 'แผงโถงทางเข้า GL E–F')); continue
    for o in ops_by[w['id']]:
        if o['type'] != 'W2' or not (f['u0'] - 1e-6 <= o['at'] < f['u1'] + 1e-6): continue
        t = OT['W2']; s = (o.get('sill', t.get('sill')) or 0); a_ = t['w'] * (s + (wt - wb - s - t['h']))
        P3.append((w['id'], a_, 'แผงใต้/เหนือหน้าต่าง W2'))
for wid, a_, _ in P3[P3plan:]:
    area[wid]['paint_ext'] = max(0.0, area[wid]['paint_ext'] - a_)

# ---------------------------------------------------------------- ใส่ลงผนัง
for w in m['walls']:
    if w['kind'] == 'other': continue
    a_ = area.get(w['id'])
    w['finish_sides'] = 2
    w['plaster'] = bool(a_ and a_['plaster_int'] + a_['plaster_ext'] > 0.01)
    w['paint'] = bool(a_ and a_['paint_int'] + a_['paint_ext'] > 0.01)
    if w['plaster']: w['plaster_area'] = {'int': round(a_['plaster_int'], 3), 'ext': round(a_['plaster_ext'], 3)}
    else: w.pop('plaster_area', None)
    if w['paint']: w['paint_area'] = {'int': round(a_['paint_int'], 3), 'ext': round(a_['paint_ext'], 3)}
    else: w.pop('paint_area', None)

FIN = m['finishes']; k = 0
for (wid, sd, rm, c), q in sorted(TILE.items()):
    if q < 0.01: continue
    fs = [f for f in TILEF if f['w']['id'] == wid and f['sd'] == sd and f['room'] == rm and f['code'] == c]
    k += 1; z1 = max(f['z1'] for f in fs); z0 = min(f['z0'] for f in fs)
    FIN.append(dict(id=f'WT-{k:03d}', kind='wall', spec=WSPEC[c], room=rm, level=fs[0]['fl'], wall=wid, side=sd, height=round(z1 - z0, 3), qty=round(q, 3), unit='ตร.ม.',
                    u=[round(min(f['u0'] for f in fs), 3), round(max(f['u1'] for f in fs), 3)], tag='2',
                    status=FD if all(f['src'] == 'ป้าย' for f in fs) else AS, src='A-02 + ป้ายผนังในแปลน A-04/A-05',
                    note=f'บุถึงระดับฝ้า +{z1:.2f} ไม่ฉาบ/ไม่ทาสี (Earth 30 ต.ค.)' + ('' if all(f['src'] == 'ป้าย' for f in fs) else ' · ด้านนี้ไม่มีป้าย — ใช้ตามห้องน้ำ (P2)')))
p3q = round(sum(a_ for _, a_, _ in P3), 3)
FIN.append(dict(id='P3-01', kind='other', spec=WSPEC['P3'], room='ผนังภายนอกด้านหน้า (รูปด้าน A)', level='1F', qty=p3q, unit='ตร.ม.', status=AS,
                src='A-02 (P3) + A-07 รูปด้าน A', note='แผงใต้/เหนือหน้าต่าง W2 ด้านหน้า (กว้างเท่าหน้าต่าง) + แผงโถงทางเข้า E–F ทั้งด้าน หักช่องเปิด · หักออกจากทาสีภายนอก · ฐานเสาจอดรถ A0/D1 ยังไม่คิด'))

# ---------------------------------------------------------------- บัวพื้นไม้: ขอบห้องที่ติดผนัง/เสา − ด้านบุกระเบื้อง − ช่องประตู (ไม่ทำห้องน้ำและพื้นที่ภายนอก)
dw = collections.defaultdict(float)
for o in m['openings']:
    t = OT[o['type']]
    if t.get('kind') == 'window' and (o.get('sill', t.get('sill')) or 0) > 0.05: continue
    if o['type'].endswith('_ช่อง'): continue
    w = next((x for x in m['walls'] if x['id'] == o['wall']), None)
    if not w: continue
    (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
    fl = floor_of(w); px, py = ax + ux * o['at'], ay + uy * o['at']
    tw = w['t'] / 2 + 0.06 + (0.25 if o['wall'][:-1] in split else 0)   # ผนังสองชั้น: ดูเลยแผ่นที่สอง (ช่องกลาง 0.05)
    for sg in (1, -1):
        rm = room_at(fl, px - uy * sg * tw, py + ux * sg * tw)
        if rm: dw[(fl, rm)] += t['w']
tile_len = collections.defaultdict(float)
for f in TILEF: tile_len[(f['fl'], f['room'])] += f['u1'] - f['u0']
SK = []
for key, r in sorted(A.ROOMS.items()):
    fl, nm = key
    if isbath(nm) or nm in OUTDOOR: continue
    L = A.perim_real(r['R'], r['mask']) - tile_len[key] - dw[key]
    if L < 0.1: continue
    SK.append((key, L))
    FIN.append(dict(id=f'SK{fl[0]}-{len(SK):02d}', kind='skirting', spec=WSPEC['SK'], room=nm, level=fl, z=r['lv'], qty=round(L, 2), unit='ม.', status=FD,
                    src='A-01 ข้อ 9.2–9.3 + A-11 หมายเหตุ', note=f'ขอบห้องติดผนัง/เสา {A.perim_real(r["R"], r["mask"]):.2f} − ด้านบุกระเบื้อง {tile_len[key]:.2f} − ช่องประตู {dw[key]:.2f} ม.'))

json.dump(m, open('stage4b.bm.json', 'w'), ensure_ascii=False)
json.dump(dict(rows=ROWS, sum={f'{a}|{b}|{c}': round(v, 2) for (a, b, c), v in SUM.items()}, p3=P3, sk=[[k[0], k[1], round(v, 2)] for k, v in SK],
               tile={f'{a}|{b}|{c}|{d}': round(v, 2) for (a, b, c, d), v in TILE.items()}), open('stage4b_rows.json', 'w'), ensure_ascii=False, indent=0)
print('walls', len(m['walls']), 'split', len(split), 'brick', nb, 'aac', na)
for k_, v in sorted(SUM.items()): print(k_, round(v, 2))
print('P3', p3q, len(P3)); print('skirting', round(sum(v for _, v in SK), 2), len(SK))
print('void faces', sum(1 for f in FACE if f['room'].startswith('ช่องโล่ง')), 'ext', sum(1 for f in FACE if f['room'] == 'ภายนอก'))
if 'dbg' in sys.argv:
    for f in FACE:
        if f['room'].startswith('ช่องโล่ง'):
            w = f['w']; print(w['id'], f['sd'], round(f['u0'], 2), round(f['u1'], 2), w['path'][0], w['path'][-1], w['bottom'], w['top'], f.get('net'), w.get('exterior'), f['code'], f['src'])
if 'plot' in sys.argv:
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    from matplotlib import font_manager as fm; fm.fontManager.addfont('/usr/share/fonts/opentype/tlwg/Loma.otf'); matplotlib.rcParams['font.family'] = 'Loma'
    COL = {('P1', 0): '#9e9e9e', ('P1', 1): '#43a047', 'P2': '#1e88e5', 'P3': '#e53935', 'P4': '#8e24aa'}
    for fl, fn, tt in (('1F', 'walls_1F.png', 'ผนังชั้นล่าง'), ('2F', 'walls_2F.png', 'ผนังชั้นบน')):
        fig, ax = plt.subplots(figsize=(15, 15)); ax.set_title(tt + ' — ดำ = อิฐมอญครึ่งแผ่น · เทาอ่อน = อิฐมวลเบา · เส้นผิว: เทา P1 ใน · เขียว P1 นอก · น้ำเงิน P2 · ม่วง P4 · แดง P3 · เส้นประ = ไม่มีป้าย (ใช้ตามห้อง)', fontsize=11)
        for w in m['walls']:
            if floor_of(w) != fl: continue
            xs, ys = zip(*w['path']); ax.plot(xs, ys, color='k' if w['kind'] == 'brick_mon' else '#bdbdbd' if w['kind'] == 'aac' else '#ffb300', lw=3.5, solid_capstyle='butt', zorder=2)
        for f in FACE:
            if f['fl'] != fl: continue
            w = f['w']; (ax_, ay_), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax_, by - ay_); ux, uy = (bx - ax_) / L, (by - ay_) / L
            sg = 1 if f['sd'] == 'L' else -1; o = w['t'] / 2 + 0.06; nx, ny = -uy * sg * o, ux * sg * o
            c = COL[(f['code'], int(f['ext']))] if f['code'] == 'P1' else COL[f['code']]
            ax.plot([ax_ + ux * f['u0'] + nx, ax_ + ux * f['u1'] + nx], [ay_ + uy * f['u0'] + ny, ay_ + uy * f['u1'] + ny], color=c, lw=2.2, ls='-' if f['src'] == 'ป้าย' else (0, (2, 1.5)), zorder=3)
        for (fl_, nm), r in A.ROOMS.items():
            if fl_ != fl: continue
            ys_, xs_ = np.nonzero(r['mask']); R = r['R']; ax.text(R['x0'] + xs_.mean() * H, R['y0'] + ys_.mean() * H, nm, ha='center', fontsize=9, color='#444')
        ax.set_aspect('equal'); ax.set_xlim(-3, 20); ax.set_ylim(-0.5, 23); ax.grid(alpha=0.25)
        plt.savefig(fn, dpi=60, bbox_inches='tight'); plt.close()
