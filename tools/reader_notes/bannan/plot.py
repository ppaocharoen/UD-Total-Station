import sys, ext, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
def plot(num, out, layers_col, box=None, texts=True, size=(26, 20), tlayers=None, dpi=80, grid=True):
    fig, ax = plt.subplots(figsize=size); f = ext.P(num)
    for q, _ in ext.prims(num):
        L = q.get('layer'); c = layers_col.get(L, layers_col.get('*'))
        if q['kind'] in ('poly', 'line') and c:
            p = [f(a) for a in q['p']] + ([f(q['p'][0])] if q.get('closed') else [])
            ax.plot([a[0] for a in p], [a[1] for a in p], c=c, lw=0.8)
        elif q['kind'] == 'arc' and c and 'p' in q:
            p = [f(a) for a in q['p']]; ax.plot([a[0] for a in p], [a[1] for a in p], c=c, lw=0.6)
        elif q['kind'] == 'text' and texts and (tlayers is None or L in tlayers):
            x, y = f(q['at'])
            if box is None or (box[0] <= x <= box[2] and box[1] <= y <= box[3]):
                ax.text(x, y, q['text'][:30], fontsize=6, color='k', fontname='Loma')
        elif q['kind'] == 'insert' and texts and q.get('name', '')[:2] in ('AW', 'AD', 'WD', 'WW', 'D0', 'W0', 'D1', 'W1', 'D2', 'W2'):
            x, y = f(q['at']); ax.plot(x, y, 'm+'); ax.text(x, y, q['name'], fontsize=6, color='m')
    if grid:
        for k, v in ext.GX.items(): ax.axvline(v, c='0.8', lw=0.4, ls='--'); ax.text(v, (box[3] if box else 23) , k, color='g', fontsize=8)
        for k, v in ext.GY.items(): ax.axhline(v, c='0.8', lw=0.4, ls='--'); ax.text((box[0] if box else -4), v, k, color='g', fontsize=8)
    if box: ax.set_xlim(box[0], box[2]); ax.set_ylim(box[1], box[3])
    ax.set_aspect('equal'); ax.grid(True, which='both', lw=0.2); ax.minorticks_on()
    plt.savefig(out, dpi=dpi, bbox_inches='tight'); plt.close()
