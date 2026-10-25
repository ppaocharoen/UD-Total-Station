# ผนังจากแกนผนัง DXF + ค่ากำหนดด้วยมือ (คู่ผนังหนา, ช่องเปิด, ผนังที่ขาดเส้นแกน, ตัดชิ้นตกแต่ง)
import walls as W
def make(num, OT, pairs=(), openings=(), extra=(), drop=(), split_cols=True, minlen=0.15):
    """pairs: [(ax, c1, c2, a, b)] รวมสองแนวในช่วง a..b เป็นผนังหนา · openings: [(type, ax, c, at)] · extra: [(ax, c, a, b, t, note)] · drop: [(ax, c, a, b)]"""
    G = W.groups(num); C = W.cols(num)
    lines = []   # (ax, c, t, [ [a,b], ... ], note)
    consumed = {}
    for ax, c1, c2, a, b in pairs:
        iv = []
        for c in (c1, c2):
            k = (ax, round(c, 2)); rest = []
            for p, q in G.get(k, []):
                lo, hi = max(p, a), min(q, b)
                if hi > lo + 1e-6: iv.append([lo, hi])
                if p < a - 1e-6: rest.append((p, min(q, a)))
                if q > b + 1e-6: rest.append((max(p, b), q))
            G[k] = rest
        iv.sort(); m = []
        for p, q in iv:
            if m and p <= m[-1][1] + 0.02: m[-1][1] = max(m[-1][1], q)
            else: m.append([p, q])
        lines.append((ax, round((c1 + c2) / 2, 3), round(abs(c2 - c1) + 0.10, 3), m, 'ผนังสองชั้น/ผนังหนา'))
    for (ax, c), iv in G.items():
        if iv: lines.append((ax, c, 0.10, [list(x) for x in iv], ''))
    for ax, c, a, b, t, note in extra:
        lines.append((ax, c, t, [[a, b]], note or 'เพิ่มเอง (แกนผนังขาดใน DXF)'))
    # ช่องเปิด → แนวที่ใกล้สุด (ภายใน 0.2)
    opsBy = {}
    for typ, ax, c, at in openings:
        cand = [i for i, L in enumerate(lines) if L[0] == ax and abs(L[1] - c) < 0.21]
        cand = [i for i in cand if any(p - OT[typ]['w'] / 2 - 0.6 <= at <= q + OT[typ]['w'] / 2 + 0.6 for p, q in lines[i][3])] or cand
        if not cand: raise SystemExit(f'!! ช่องเปิด {typ} {ax} {c} {at} ไม่มีแนวผนัง')
        i = min(cand, key=lambda i: abs(lines[i][1] - c)); opsBy.setdefault(i, []).append((typ, at))
    segs = []
    for i, (ax, c, t, iv, note) in enumerate(lines):
        ops = sorted(opsBy.get(i, []), key=lambda o: o[1])
        # ขยายช่วงให้ครอบช่องเปิด แล้วเชื่อมช่องว่าง
        for typ, at in ops:
            hw = OT[typ]['w'] / 2; iv.append([at - hw, at + hw])
        iv.sort(); m = []
        for p, q in iv:
            if m and p <= m[-1][1] + 0.125: m[-1][1] = max(m[-1][1], q)
            else: m.append([p, q])
        # ตัดที่เสา
        colsOn = sorted((p[1] if ax == 'V' else p[0]) for p in C if abs((p[0] if ax == 'V' else p[1]) - c) < 0.13 + t / 2) if split_cols else []
        out = []
        for p, q in m:
            cur = p
            for x in colsOn:
                if p - 0.13 < x < q + 0.13:
                    if x - 0.125 > cur + 0.01: out.append([cur, x - 0.125])
                    cur = max(cur, x + 0.125)
            if q > cur + 0.01: out.append([cur, q])
        for p, q in out:
            if any(dax == ax and abs(dc - c) < 0.02 and da - 0.01 <= p and q <= db + 0.01 for dax, dc, da, db in drop): continue
            myops = [(typ, at) for typ, at in ops if p - 0.01 <= at <= q + 0.01]
            if q - p < minlen and not myops: continue
            segs.append({'ax': ax, 'c': c, 't': t, 'a': round(p, 3), 'b': round(q, 3), 'ops': myops, 'note': note})
        for typ, at in ops:
            if not any(p - 0.01 <= at <= q + 0.01 for p, q in out): print('!! ช่องเปิดตกเสา', typ, ax, c, at)
    return segs
