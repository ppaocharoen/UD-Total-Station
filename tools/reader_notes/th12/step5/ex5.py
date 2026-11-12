import pickle, os, collections, math
S = pickle.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dwg', 'sheets.pkl'), 'rb'))
def sheet(num): return next(s for s in S if s['num'] == num)
def origin(num, layers=('grid', 'Gird', 'GRID')):
    s = sheet(num); g = [q for q in s['prims'] if q.get('layer') in layers and q['kind'] in ('poly', 'line')]
    V = collections.Counter(round(q['p'][0][0], 2) for q in g if abs(q['p'][0][0] - q['p'][-1][0]) < 1e-3 and abs(q['p'][0][1] - q['p'][-1][1]) > 3)
    H = collections.Counter(round(q['p'][0][1], 2) for q in g if abs(q['p'][0][1] - q['p'][-1][1]) < 1e-3 and abs(q['p'][0][0] - q['p'][-1][0]) > 3)
    return sorted(V), sorted(H)
ORG = {'SN.2.01': (1523.373, 1455.060), 'SN.2.02': (1548.483, 1455.060), 'E.2.01': (1406.031, 1455.660)}
def loc(n):
    x0, y0 = ORG[n]; return lambda p: (round(p[0] - x0, 3), round(p[1] - y0, 3))
