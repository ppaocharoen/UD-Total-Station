# ผนังหนา 0.25/0.50 จาก Step 1 (รวมแกนอิฐสองเส้นเป็นก้อนเดียว) → แผ่น 0.10 ตามแกนอิฐ A_Wall_in จริงใน DXF
# ช่วงที่มีแกนสองเส้น = ผนังก่อสองชั้น (ช่องกลางเดินท่องานระบบ — Earth 30 ต.ค.) · ช่วงที่มีแกนเส้นเดียว = ผนังแผ่นเดียวที่ตำแหน่งแกน
import math, sys, collections
sys.path.insert(0, '../st'); import walls as WS

def fix(m):
    OT = m['opening_types']; out = []; info = {}; cav = set(); newops = []
    cores = {num: WS.cores(num) for num in ('A-04#2', 'A-05')}
    for w in m['walls']:
        if w['kind'] == 'other' or w['t'] < 0.2: out.append(w); continue
        (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
        hor = abs(uy) < 1e-6; num = 'A-04#2' if w['bottom'] < 2 else 'A-05'
        c0 = ay if hor else ax; s0, s1 = sorted(((ax, bx) if hor else (ay, by)))
        lines = collections.defaultdict(list)
        for axn, c, a, b in cores[num]:
            if axn != ('H' if hor else 'V') or abs(c - c0) > w['t'] / 2 + 0.03: continue
            a2, b2 = max(a, s0 - 0.05), min(b, s1 + 0.05)
            if b2 - a2 > 0.02:
                k = next((c_ for c_ in lines if abs(c_ - c) < 0.05), round(c, 3))   # แกนเยื้องกันไม่เกิน 0.05 = แผ่นเดียวกัน
                lines[k].append((a2, b2))
        # ช่วงช่องเปิดตามแนว (พิกัดจริง) — ช่องว่างระหว่างปลายแกนกับปลายผนังที่เป็นประตู/หน้าต่าง นับเป็นผนังแผ่นนั้น
        osp = []
        for o in m['openings']:
            if o['wall'] != w['id']: continue
            pos = (ax + ux * o['at']) if hor else (ay + uy * o['at']); hw = OT[o['type']]['w'] / 2; osp.append((pos - hw, pos + hw))
        def uncovered(p, q):
            tot = q - p
            for s_, e_ in osp: tot -= max(0, min(e_, q) - max(s_, p))
            return tot
        if not lines and uncovered(s0, s1) < 0.35:   # ท่อนที่เป็นช่องประตูเกือบทั้งท่อน (ไม่มีแกนอิฐ) → หนา 0.10
            v = dict(w); v['t'] = 0.10; v['note'] = ((w.get('note', '') or '').replace('ผนังสองชั้น/ผนังหนา', '').strip(' ·') + ' · ช่วงประตูไม่มีแกนอิฐใน DXF → หนา 0.10').strip(' ·')
            out.append(v); info[w['id']] = [(w['id'], c0, s0, s1)]; continue
        if not lines: out.append(w); continue
        leaves = []
        for c, iv in sorted(lines.items()):
            a, b = min(x for x, _ in iv), max(y for _, y in iv)
            if uncovered(s0, a) < 0.35: a = s0
            if uncovered(b, s1) < 0.35: b = s1
            leaves.append((c, a, b))
        double = len(leaves) > 1
        ids = [w['id']] if not double else [w['id'] + 'ab'[k] for k in range(len(leaves))]
        info[w['id']] = [(i, c, a, b) for i, (c, a, b) in zip(ids, leaves)]
        made = []
        for i, (c, a, b) in zip(ids, leaves):
            v = dict(w); v['id'] = i; v['t'] = 0.10
            v['path'] = [[round(a, 3), round(c, 3)], [round(b, 3), round(c, 3)]] if hor else [[round(c, 3), round(a, 3)], [round(c, 3), round(b, 3)]]
            if (ux < 0 if hor else uy < 0): v['path'] = v['path'][::-1]
            nt = (w.get('note', '') or '').replace('ผนังสองชั้น/ผนังหนา', '').strip(' ·')
            v['note'] = ((nt + ' · ') if nt else '') + (f'ผนังก่อสองชั้น แผ่นแกน {c:.3f} (Step 1 รวมเป็นผนังหนา {w["t"]:.2f}) — ช่องกลางเดินท่องานระบบ (Earth 30 ต.ค.)' if double
                                                     else f'แกนอิฐเส้นเดียวใน DXF ที่ {c:.3f} → ผนังหนา 0.10 (Step 1 ใส่หนา {w["t"]:.2f})')
            out.append(v); made.append(v)
        if double:   # ด้านที่หันเข้าหากันเป็นช่องกลาง
            v0, v1 = sorted(made, key=lambda v: v['path'][0][1] if hor else v['path'][0][0])
            for v, toward in ((v0, +1), (v1, -1)):
                (px, py), (qx, qy) = v['path']; Lv = math.hypot(qx - px, qy - py); nx, ny = -(qy - py) / Lv, (qx - px) / Lv   # ซ้าย
                left_dir = ny if hor else nx
                cav.add((v['id'], 'L' if left_dir * toward > 0 else 'R'))
        # ช่องเปิด: ย้ายไปแผ่นที่คลุมตำแหน่ง · แผ่นที่สองเป็นช่องเปล่า
        for o in m['openings']:
            if o['wall'] != w['id']: continue
            pos = (ax + ux * o['at']) if hor else (ay + uy * o['at'])
            first = True
            if not any(a - 1e-6 <= pos <= b + 1e-6 for c, a, b in leaves):
                print('!! ช่องเปิดไม่อยู่ในแผ่นผนังใด', o['id'])
            for v, (c, a, b) in zip(made, leaves):
                if not (a - 1e-6 <= pos <= b + 1e-6): continue
                (px, py), _ = v['path']; at = round(abs(pos - (px if hor else py)), 3)
                if first: o['wall'] = v['id']; o['at'] = at; first = False
                else:
                    k = o['type'] + '_ช่อง'
                    if k not in OT: OT[k] = dict(OT[o['type']], kind='opening', desc=f'ช่องผนังแผ่นที่สองของ {o["type"]} (ไม่มีบาน)')
                    newops.append(dict(o, id=o['id'] + '-b', type=k, wall=v['id'], at=at, note=f'ช่องผนังแผ่นที่สองของ {o["id"]} (ผนังก่อสองชั้น)'))
    m['walls'] = out; m['openings'] = m['openings'] + newops
    return info, cav

def fix_pilasters(m):
    """เสาเฉลียงหน้า แนว E / F ระหว่างแถว 8A–9 (Earth 30 ต.ค.: แต่ละแนวต้องเป็นชิ้นเดียวกัน)
    ผนังกล่องชั้นล่างกับชั้นบนที่ซ้อนแนวเดียวกัน → รวมเป็นผนังเดียวตั้งแต่ฐานถึง +8.05 (ใต้บัวปูนปั้น 0.60) · ผนังชั้นบนช่วง 8A–9 ยอด +8.05"""
    inreg = lambda w: all((6.45 <= x <= 7.45 or 9.95 <= x <= 10.95) and 2.85 <= y <= 4.85 for x, y in w['path'])
    W = [w for w in m['walls'] if w['kind'] != 'other' and inreg(w)]
    def same(a, b, tol=0.12):
        pa, pb = a['path'], b['path']
        return (math.dist(pa[0], pb[0]) < tol and math.dist(pa[-1], pb[-1]) < tol) or (math.dist(pa[0], pb[-1]) < tol and math.dist(pa[-1], pb[0]) < tol)
    drop = set(); merged = []
    for a in W:
        if a['bottom'] > 2: continue
        tw = next((b for b in W if b['bottom'] > 2 and b['id'] not in drop and same(a, b)), None)
        if tw:
            if math.dist(*tw['path']) > math.dist(*a['path']) + 0.05: a['path'] = tw['path']   # ชั้นบนยาวกว่า (ต่อถึง 8A)
            drop.add(tw['id']); merged.append((a['id'], tw['id']))
        a['top'] = 8.05
        a['note'] = ((a.get('note') or '').replace('ไม่มีคานเหนือผนัง — ยอดใต้พื้น/ระดับแถบคาน', '').strip(' ·') + ' · ' if a.get('note') else '') + \
            f'เสาเฉลียงหน้าแนว {"E" if a["path"][0][0] < 8.7 else "F"} 8A–9 ต่อเนื่องเป็นชิ้นเดียวถึง +8.05' + (f' (รวม {tw["id"]})' if tw else '') + ' — Earth 30 ต.ค.'
        a['note'] = a['note'].strip(' ·')
    def axis(w):
        (ax, ay), (bx, by) = w['path'][0], w['path'][-1]; hor = abs(by - ay) < 1e-6
        return hor, round(ay if hor else ax, 2), sorted((ax, bx) if hor else (ay, by))
    for b in W:
        if b['bottom'] <= 2 or b['id'] in drop: continue
        hb, cb, (b0, b1) = axis(b)
        for a in W:
            if a['bottom'] > 2: continue
            ha, ca, (a0, a1) = axis(a)
            if ha != hb or abs(ca - cb) > 0.03 or a1 <= b0 + 0.02 or a0 >= b1 - 0.02: continue
            if a0 <= b0 + 0.05 and a1 >= b1 - 0.05: drop.add(b['id']); break   # ชั้นล่างคลุมทั้งท่อน
            if a0 <= b0 + 0.05: b0 = a1                                          # ตัดส่วนที่ซ้อนออก
            elif a1 >= b1 - 0.05: b1 = a0
        if b['id'] in drop: continue
        b['path'] = [[b0, cb], [b1, cb]] if hb else [[cb, b0], [cb, b1]]
        b['top'] = 8.05
    m['walls'] = [w for w in m['walls'] if w['id'] not in drop]
    for o in m['openings']:
        for a_, b_ in merged:
            if o['wall'] == b_: o['wall'] = a_
    return merged
