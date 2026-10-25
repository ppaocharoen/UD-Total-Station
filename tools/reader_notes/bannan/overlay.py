# วาดผลโมเดลทับภาพ PDF ของแผ่น (กรอบแผ่น DXF ↔ ขอบหน้า PDF)
import ext
from PIL import Image, ImageDraw, ImageFont
def mapper(num, img):
    s = ext.sheet(num); fx0, fy0, fx1, fy1 = s['box']; o = ext.origin(num); W, H = img.size
    return lambda x, y: ((x + o[0] - fx0) / (fx1 - fx0) * W, (fy1 - (y + o[1])) / (fy1 - fy0) * H)
def draw(num, png, out, walls=(), opens=(), cols=(), crop=None, scale=1.0):
    im = Image.open(png).convert('RGB'); M = mapper(num, im); d = ImageDraw.Draw(im, 'RGBA')
    try: F = ImageFont.truetype('/usr/share/fonts/opentype/tlwg/Loma-Bold.otf', 22)
    except Exception: F = None
    for w in walls:
        (x0, y0), (x1, y1) = w['path']; t = w['t'] / 2
        if abs(y0 - y1) < 1e-6: poly = [(x0, y0 - t), (x1, y0 - t), (x1, y0 + t), (x0, y0 + t)]
        else: poly = [(x0 - t, y0), (x0 + t, y0), (x0 + t, y1), (x0 - t, y1)]
        d.polygon([M(*p) for p in poly], fill=(255, 0, 0, 90), outline=(255, 0, 0, 255))
        cx, cy = M((x0 + x1) / 2, (y0 + y1) / 2); d.text((cx, cy), w['id'].split('-', 1)[1], fill=(200, 0, 0, 255), font=F)
    for (x0, y0, x1, y1, lab) in opens:
        d.line([M(x0, y0), M(x1, y1)], fill=(0, 160, 255, 255), width=10); cx, cy = M((x0 + x1) / 2, (y0 + y1) / 2)
        d.text((cx + 6, cy + 6), lab, fill=(0, 90, 255, 255), font=F)
    for (x, y, b) in cols:
        d.rectangle([M(x - b / 2, y + b / 2), M(x + b / 2, y - b / 2)], outline=(0, 170, 0, 255), width=5)
    if crop: im = im.crop(crop)
    if scale != 1: im = im.resize((int(im.width * scale), int(im.height * scale)))
    im.save(out)
