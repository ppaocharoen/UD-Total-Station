import ext, json
from PIL import Image, ImageDraw, ImageFont
m = json.load(open('stage1.bm.json')); num = 'A.2.01'; O = (1034.108, 1455.664)
im = Image.open('../p4h-04.png').convert('RGB'); W, H = im.size
fx0, fy0, fx1, fy1 = ext.sheet(num)['box']
k = 200 / 72; S = 612.3 / 10.8
M = lambda x, y: ((233.5 + x * S) * k, (583.6 - y * S) * k)   # กริด 1 / A จากเส้นกริดเวกเตอร์ใน PDF (1:50)
d = ImageDraw.Draw(im, 'RGBA'); F = ImageFont.truetype('/usr/share/fonts/opentype/tlwg/Loma-Bold.otf', 20)
for w in m['walls']:
    (x0, y0), (x1, y1) = w['path']; t = max(w['t'], 0.05) / 2
    poly = [(x0, y0 - t), (x1, y0 - t), (x1, y0 + t), (x0, y0 + t)] if abs(y0 - y1) < 1e-6 else [(x0 - t, y0), (x0 + t, y0), (x0 + t, y1), (x0 - t, y1)]
    c = (255, 0, 0) if w['kind'] != 'other' else (255, 0, 255)
    d.polygon([M(*p) for p in poly], fill=c + (80,), outline=c + (255,))
    cx, cy = M((x0 + x1) / 2, (y0 + y1) / 2); d.text((cx + 4, cy - 22), w['id'][2:], fill=(170, 0, 0, 255), font=F)
OT = m['opening_types']
for o in m['openings']:
    w = next(q for q in m['walls'] if q['id'] == o['wall']); (x0, y0), (x1, y1) = w['path']; hor = abs(y0 - y1) < 1e-6
    a = (x0 if hor else y0) + o['at']; hw = OT[o['type']]['w'] / 2
    p0, p1 = ((a - hw, y0), (a + hw, y0)) if hor else ((x0, a - hw), (x0, a + hw))
    d.line([M(*p0), M(*p1)], fill=(0, 150, 255, 255), width=9); d.text(M(*p1), o['type'], fill=(0, 80, 255, 255), font=F)
for n in m['members']:
    nd = next(q for q in m['nodes'] if q['id'] == n['i']); x, y = nd['x'], nd['y']
    d.rectangle([M(x - .1, y + .1), M(x + .1, y - .1)], outline=(0, 170, 0, 255), width=5)
for s in m['slabs']:
    d.polygon([M(*p) for p in s['polygon']], outline=(255, 140, 0, 255))
    xs = [p[0] for p in s['polygon']]; ys = [p[1] for p in s['polygon']]
    d.text(M(sum(xs) / len(xs), sum(ys) / len(ys)), f"{s['id']} +{s['top']:.2f}", fill=(220, 110, 0, 255), font=F)
a, b = M(-1.4, 7.2), M(12.2, -1.5)
im.crop((int(a[0]), int(a[1]), int(b[0]), int(b[1]))).save('../ov_step1.png')
