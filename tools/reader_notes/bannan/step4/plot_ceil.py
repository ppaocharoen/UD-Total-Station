import json, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm; fm.fontManager.addfont('/usr/share/fonts/opentype/tlwg/Loma.otf'); matplotlib.rcParams['font.family']='Loma'
from matplotlib.patches import Rectangle
m = json.load(open('stage4a.bm.json')); F = m['finishes']
fl_z = {}
for f in F:
    if f['kind'] == 'floor': fl_z[(f['level'], f['room'])] = f['z']
cols = {'C1': '#fff59d', 'C1h': '#ffab91', 'C2': '#81d4fa', 'SOF': '#bcaaa4'}
for lv, fn, title in [('1F', 'ceil_1F.png', 'ฝ้าชั้นล่าง (ระดับวัดจากพื้นห้อง)'), ('2F', 'ceil_2F.png', 'ฝ้าชั้นบน + ฝ้าชายคา')]:
    fig, ax = plt.subplots(figsize=(14, 14)); ax.set_title(title, fontsize=16)
    for w in m['walls']:
        zr = (0, 1) if lv == '1F' else (4.4, 4.8)
        if zr[0] - 0.3 <= w['bottom'] <= zr[1] + 0.3:
            xs, ys = zip(*w['path']); ax.plot(xs, ys, color='k', lw=2.2, zorder=3)
    for f in F:
        if f['kind'] != 'ceiling' or not f.get('rects'): continue
        sof = 'Conwood' in f['spec']
        if (f['level'] != lv) and not (lv == '2F' and sof): continue
        c = cols['SOF'] if sof else cols['C2'] if 'C2' in f['spec'] else cols['C1h'] if 'หลุม' in f['room'] else cols['C1']
        for r in f['rects']: ax.add_patch(Rectangle((r[0], r[1]), r[2] - r[0], r[3] - r[1], fc=c, ec='none', zorder=1))
        r = max(f['rects'], key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
        nm = f['room'].replace(' (หลุมฝ้า)', '').replace(' (ขอบตั้งหลุมฝ้า)', ''); base = fl_z.get((f['level'], nm))
        lab = f"+{f['z'] - base:.2f}" if base is not None else f"z {f['z']:.2f}"
        if 'โถงทางเข้า' in f['room']: lab = f"+{f['z'] - 0.55:.2f} (จาก +0.55)"
        if sof: lab = 'Conwood +8.65'
        ax.text((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, ('C2 ' if 'C2' in f['spec'] else '') + lab, ha='center', va='center', fontsize=10, zorder=4,
                bbox=dict(fc='white', ec='0.5', boxstyle='round,pad=0.2'))
    ax.set_aspect('equal'); ax.set_xlim(-3, 20); ax.set_ylim(-0.5, 23); ax.grid(alpha=0.3)
    for g in m['grids']:
        if g['axis'] == 'X': ax.text(g['coord'], 22.7, g['name'], ha='center', color='b')
        else: ax.text(-2.8, g['coord'], g['name'], va='center', color='b')
    plt.savefig(fn, dpi=60, bbox_inches='tight'); plt.close()
