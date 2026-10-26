import ext, re, collections
def rects(num, layer='BEAM'):
    f = ext.P(num); out = []
    for q, _ in ext.prims(num, layers={layer}, kinds={'poly'}):
        p = [f(a) for a in q['p']]; xs = [a[0] for a in p]; ys = [a[1] for a in p]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        if x1 - x0 >= y1 - y0: out.append(('H', round((y0 + y1) / 2, 3), round(y1 - y0, 3), round(x0, 3), round(x1, 3)))
        else: out.append(('V', round((x0 + x1) / 2, 3), round(x1 - x0, 3), round(y0, 3), round(y1, 3)))
    return out
def labels(num, pat=r"^(B\d|B1'|BST|BS|B\d/|BR)"):
    f = ext.P(num)
    return [(q['text'].strip(), f(q['at']), q.get('rot', 0)) for q, _ in ext.prims(num, kinds={'text'}) if re.match(pat, q['text'].strip())]
def labeled(num):
    R = rects(num); T = labels(num); lab = [[] for _ in R]
    for t, (x, y), rot in T:
        best = None
        for k, (ax, c, w, a, b) in enumerate(R):
            u, v = (x, y) if ax == 'H' else (y, x)
            if a - 0.05 <= u <= b + 0.05:
                d = abs(v - c)
                if d < 0.55 and (best is None or d < best[0]): best = (d, k)
        if best: lab[best[1]].append(t)
    return [(ax, c, w, a, b, '/'.join(sorted(set(l))) if l else '?') for (ax, c, w, a, b), l in zip(R, lab)]
if __name__ == '__main__':
    import sys
    for r in sorted(labeled(sys.argv[1])): print(r)
