import ext, re, collections, math
def cores(num):
    f = ext.P(num); out = []
    for q, _ in ext.prims(num, layers={'A_Wall_in'}):
        p = [f(a) for a in q['p']]; xs = [a[0] for a in p]; ys = [a[1] for a in p]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        if x1 - x0 < 0.01 and y1 - y0 < 0.01: continue
        if x1 - x0 <= y1 - y0: out.append(('V', round((x0 + x1) / 2, 3), y0, y1))
        else: out.append(('H', round((y0 + y1) / 2, 3), x0, x1))
    return out
def cols(num):
    f = ext.P(num)
    return [(round(f(q['at'])[0] + 0.125, 3), round(f(q['at'])[1] + 0.125, 3)) for q, _ in ext.prims(num, layers={'C'}, kinds={'insert'})]
def tags(num):
    f = ext.P(num)
    return [(q['text'].strip(), f(q['at'])) for q, _ in ext.prims(num, kinds={'text'}) if re.match(r'^[DW]\d{1,2}$', q['text'].strip())]
def groups(num):
    g = collections.defaultdict(list)
    for ax, c, a, b in cores(num):
        key = (ax, round(c, 2)); g[key].append((round(a, 3), round(b, 3)))
    out = {}
    for k, iv in g.items():
        iv.sort(); m = []
        for a, b in iv:
            if m and a <= m[-1][1] + 0.02: m[-1][1] = max(m[-1][1], b)
            else: m.append([a, b])
        out[k] = m
    return out
def report(num):
    C = cols(num); T = tags(num); G = groups(num)
    for (ax, c), m in sorted(G.items()):
        segs = ' '.join(f'[{a:.3f},{b:.3f}]' for a, b in m)
        print(f'{ax} {c:7.3f} :: {segs}')
        for (a0, b0), (a1, b1) in zip(m, m[1:]):
            g0, g1 = b0, a1
            col = [p for p in C if (abs(p[0] - c) < 0.2 and g0 - 0.15 < p[1] < g1 + 0.15) if ax == 'V'] if ax == 'V' else [p for p in C if abs(p[1] - c) < 0.2 and g0 - 0.15 < p[0] < g1 + 0.15]
            tg = [(t, p) for t, p in T if (abs(p[0] - c) < 1.3 and g0 - 0.3 < p[1] < g1 + 0.3) if ax == 'V'] if ax == 'V' else [(t, p) for t, p in T if abs(p[1] - c) < 1.3 and g0 - 0.3 < p[0] < g1 + 0.3]
            print(f'      gap {g0:.3f}-{g1:.3f} w={g1-g0:.3f} col={col} tag={tg}')
if __name__ == '__main__':
    import sys; report(sys.argv[1])
