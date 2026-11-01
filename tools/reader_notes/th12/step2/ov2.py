import json
from PIL import Image, ImageDraw, ImageFont
m = json.load(open('stage2.bm.json')); N = {n['id']: n for n in m['nodes']}
im = Image.open('p24-24.png').convert('RGB'); k = 200 / 72; S = 612.3 / 10.8
M = lambda x, y: ((324.2 + x * S) * k, (583.6 - y * S) * k)
d = ImageDraw.Draw(im, 'RGBA'); F = ImageFont.truetype('/usr/share/fonts/opentype/tlwg/Loma-Bold.otf', 18)
for s in m['supports']:
    n = N[s['node']]; h = s['b'] / 2
    d.rectangle([M(n['x'] - h, n['y'] + h), M(n['x'] + h, n['y'] - h)], outline=(0, 120, 255, 255), width=3)
for c in m['members']:
    a, b = N[c['i']], N[c['j']]
    if c['type'] == 'beam':
        if abs(a['y'] - b['y']) < 1e-6: poly = [(a['x'], a['y'] - .1), (b['x'], a['y'] - .1), (b['x'], a['y'] + .1), (a['x'], a['y'] + .1)]
        else: poly = [(a['x'] - .1, a['y']), (a['x'] + .1, a['y']), (a['x'] + .1, b['y']), (a['x'] - .1, b['y'])]
        d.polygon([M(*p) for p in poly], fill=(255, 0, 0, 70) if c['mark'] == 'B1' else (255, 140, 0, 80), outline=(200, 0, 0, 255))
        cx, cy = M((a['x'] + b['x']) / 2, (a['y'] + b['y']) / 2); d.text((cx - 18, cy - 10), c['id'][3:], fill=(150, 0, 0, 255), font=F)
    if c['type'] == 'column' and abs(a['x'] - b['x']) < 1e-6:
        h = 0.15 if c['id'].startswith('PD') else 0.10
        d.rectangle([M(a['x'] - h, a['y'] + h), M(a['x'] + h, a['y'] - h)], outline=(0, 170, 0, 255), width=4)
a, b = M(-1.4, 7.2), M(12.2, -1.5)
im.crop((int(a[0]), int(a[1]), int(b[0]), int(b[1]))).save('ov_s202.png')
