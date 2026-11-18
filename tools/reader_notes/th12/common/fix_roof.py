"""ท12 แก้ 18 พ.ย. 2569 (Earth) — ใช้กับไฟล์ Step 2–5 ที่ส่งแล้ว (รันซ้ำได้ ธง meta.fix_roof)

1. ระนาบโครงหลังคา: เดิมอ่าน "+3.30 ระดับอะเส" เป็นท้องจันทันแถว C (ผิด)
   รูปตัด A.4.01–06 วัดจาก DXF: อะเสทุกแถว ท้อง +3.30 (= หัวเสา) หลัง +3.40 · หลัง TRUSS1 แถว A +3.70
   → ท้องจันทัน PL(y) = 3.70 − 0.30/5.80·y (แถว A +3.70 · แถว B +3.622 · แถว C +3.40 วางบนหลัง RB-C)
   ชิ้นที่ผูกกับระนาบโครง (จันทัน RB-C RB-B2 หัวดั้ง CX ฝ้า เชิงชาย ครอบ แผ่นหลังคา ท่อร้อยสาย/กล่อง/โคมเหนือฝ้า)
   เลื่อนขึ้น Δ(y) = PLใหม่ − PLเดิม = 0.10/5.80·y
2. มุมอะเส 1/B 4/B: RB-B วิ่งยาวถึงหลัง RB-1/RB-4 (x −0.10 / 10.90) · RB-1/RB-4 ชนข้าง RB-B (y 1.55) และข้าง RB-C (y 5.75)
3. ทิศปากเหล็กตัว C (open_dir): จันทันหันทางกริด 4 (+X) · RB-1 หันเข้าใน (+X) · RB-4 หันเข้าใน (−X)
4. ฝ้า CL1 / CL1-E: โครงคร่าว C-Line @0.40 ตามแนวจันทัน (Y) + โครงซอยตั้งฉาก @1.20 (frame — แสดง 3D ไม่ถอดแยก)

รัน: python fix_roof.py <in.bm.json> <out.bm.json>
"""
import json, math, re, sys

OLD_S, NEW_S = 0.40 / 5.80, 0.30 / 5.80
PL_OLD = lambda y: 3.70 - OLD_S * y
PL_NEW = lambda y: 3.70 - NEW_S * y
D = lambda y: PL_NEW(y) - PL_OLD(y)
CEIL_OLD = lambda y: PL_OLD(y) - 0.035
r3 = lambda v: round(v, 4)
SHIFT_MEMBERS = lambda x: x['type'] == 'rafter' or x['id'] in ('RB-C', 'RB-B2')
TAG = '2026-11-18'


def shift_pt(p):
    return [p[0], p[1], r3(p[2] + D(p[1]))]


def in_plenum(p):
    return p[2] >= CEIL_OLD(p[1]) - 0.01


def main(src, dst):
    m = json.load(open(src, encoding='utf-8'))
    if m['meta'].get('fix_roof'):
        print('มีธง fix_roof แล้ว — ไม่แก้ซ้ำ'); json.dump(m, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); return
    log = []
    N = {n['id']: n for n in m['nodes']}
    # 1) ชิ้นส่วนโครงหลังคา
    sh = set()
    for x in m['members']:
        if SHIFT_MEMBERS(x): sh.update((x['i'], x['j']))
        if x['id'].startswith('CX-'): sh.add(x['j'])   # หัวดั้ง (ปลายบน) รับ RB-B2
    for nid in sh:
        n = N[nid]; dz = D(n['y']); n['z'] = r3(n['z'] + dz)
    log.append(f'เลื่อนจุดต่อโครงหลังคา {len(sh)} จุด ตามระนาบใหม่')
    # 2) มุมอะเส
    for x in m['members']:
        a, b = N[x['i']], N[x['j']]
        if x['id'] == 'RB-B':
            lo, hi = (a, b) if a['x'] < b['x'] else (b, a); lo['x'] = -0.10; hi['x'] = 10.90
        if x['id'] in ('RB-1', 'RB-4'):
            lo, hi = (a, b) if a['y'] < b['y'] else (b, a); lo['y'] = 1.55; hi['y'] = 5.75
    log.append('RB-B ยาวถึงหลัง RB-1/RB-4 (x −0.10 → 10.90) · RB-1/RB-4 ชนข้าง RB-B (y 1.55) และข้าง RB-C (y 5.75)')
    # 3) ทิศปากตัว C
    for x in m['members']:
        if x['type'] == 'rafter': x['open_dir'] = '+X'
        if x['id'] == 'RB-1': x['open_dir'] = '+X'
        if x['id'] == 'RB-4': x['open_dir'] = '-X'
    for r in m.get('roofs', []):
        if r.get('rafter'): r['rafter']['open_dir'] = '+X'
    # หมายเหตุชิ้น
    for x in m['members']:
        if x['id'] == 'RB-C':
            x['note'] = ('อะเสแถว C วางบนหัวเสา ท้อง +3.30 หลัง +3.40 ยาวตลอดถึงขอบชายคาสองข้าง · จันทันวางบนหลัง RB-C '
                         '(Earth 18 พ.ย. — เดิมหลัง +3.30 จมหัวเสา 0.10 เพราะอ่าน "+3.30 ระดับอะเส" เป็นท้องจันทัน)')
        if x['id'] == 'RB-B2':
            x['note'] = (x.get('note', '') + ' · ระดับใหม่ (18 พ.ย.): ท้อง +3.522 หลัง +3.622 = ท้องจันทันที่แถว B').strip(' ·')
        if x['id'] == 'RB-B':
            x['note'] = (x.get('note', '') + ' · มุมกริด 1/B 4/B: วิ่งยาวถึงหลัง RB-1/RB-4 (Earth 18 พ.ย.)').strip(' ·')
    # 4) หลังคา
    for r in m.get('roofs', []):
        ys = [p[1] for p in r['outline']]
        r['eave'] = r3(PL_NEW(max(ys)) + 0.125)
        r['pitch'] = round(math.degrees(math.atan(NEW_S)), 2)
        r['src'] = 'A.2.02 แปลนหลังคา (SLOPE ลงทางแถว C) + รูปตัด A.4.01–A.4.06 (หลัง TRUSS1 +3.70 แถว A · อะเสท้อง +3.30 หลัง +3.40 ทุกแถว)'
        r['note'] = (f'หลังคาเพิงเมทัลชีท 0.40 มม. (BlueScope) ลาดลงทางแถว C · ท้องจันทัน +3.70 ที่แถว A (หลัง TRUSS1) → +3.40 ที่แถว C (หลังอะเส RB-C) '
                     f'ลาด {r["pitch"]}° · ผิวแผ่นหลังคาสูงกว่าระนาบโครง 0.125 (จันทัน C-100 สูง 0.10 + แปกล่อง 50x25 วางแบน 0.025) · ชายคายื่น 1.10 รอบ → '
                     f'ขอบต่ำ +{r["eave"]:.3f} ขอบสูง +{PL_NEW(min(ys)) + 0.125:.3f} · แก้ระนาบ 18 พ.ย. (Earth) · เชิงชาย / ครอบ / ฝ้า CL1 = Step 4')
    # 5) งานผิว (Step 4+)
    for f in m.get('finishes', []):
        if f.get('kind') == 'ceiling' and f.get('slope'):
            sl = f['slope']; sl['dz'] = -round(NEW_S, 5)
            k = math.sqrt(1 + NEW_S ** 2)
            area = sum(abs(rc[2] - rc[0]) * abs(rc[3] - rc[1]) for rc in f['rects'])
            q0 = f.get('qty'); f['qty'] = round(area * k, 3)
            f['frame'] = {'section': 'C-LINE', 'spacing': 0.40, 'dir': 'Y', 'cross': 1.20,
                          'note': 'โครงคร่าว C-Line @0.40 ตามแนวจันทัน + โครงซอยตั้งฉาก @1.20 ระนาบเดียวกัน (Earth 18 พ.ย.) · แสดง 3D ไม่ถอดแยก (รวมในราคาฝ้า)'}
            if f.get('note'):
                f['note'] = f['note'].replace('+3.70 (แนว A) → +3.30 (แนว C)', '+3.70 (แนว A) → +3.40 (แนว C)').replace('×1.0024', f'×{k:.4f}')
            log.append(f'ฝ้า {f["id"]}: ลาด −{NEW_S:.5f} · ปริมาณ {q0} → {f["qty"]} ตร.ม. · ใส่โครงคร่าว C-Line')
        for pl in (f.get('place') if isinstance(f.get('place'), list) else [f.get('place')] if f.get('place') else []):
            if pl.get('shape') == 'strip' and pl.get('segs') and f['id'] in ('RF-FA', 'RF-CAP'):
                pl['segs'] = [[shift_pt(p) for p in s] for s in pl['segs']]
        if f['id'] in ('RF-FA', 'RF-CAP'):
            gl = math.hypot(8.0, 8.0 * NEW_S)
            q0 = f.get('qty'); f['qty'] = round(13.0 * (2 if f['id'] == 'RF-FA' else 1) + 2 * round(gl, 2), 2)
            log.append(f'{f["id"]}: ข้างจั่วยาวตามแนวลาด {gl:.3f} ม. · {q0} → {f["qty"]} ม.')
    if any(f.get('frame') for f in m.get('finishes', [])) and not any(s['id'] == 'C-LINE' for s in m['sections']):
        m['sections'].append({'id': 'C-LINE', 'kind': 'cold_formed', 'shape': 'C', 'name': 'C-Line (โครงคร่าวฝ้า)', 'b': 0.02, 'h': 0.035,
                              'dims': {'h': 0.035, 'b': 0.02, 't': 0.0005}, 'kg_m': 0.2, 'status': 'assumed',
                              'src': 'A.2.01 รายการฝ้า CL1 (โครงคร่าว C-Line @0.40) · สูง 0.035 (Earth 13 พ.ย.)',
                              'note': 'กว้าง 0.020 หนา 0.5 มม. น้ำหนัก = ค่าสมมติ (ใช้แสดง 3D เท่านั้น ไม่ถอดปริมาณ)'})
    # 6) ไฟฟ้าเหนือฝ้า (Step 5)
    el = (m.get('mep') or {}).get('electrical')
    if el:
        cnt = 0
        for c in el.get('conduits', []):
            new = []
            for p in c['pts']:
                if in_plenum(p): p = shift_pt(p); cnt += 1
                new.append(p)
            c['pts'] = new
        for b in el.get('boxes', []):
            if in_plenum(b['xyz']): b['xyz'] = shift_pt(b['xyz']); cnt += 1
        for p in el.get('points', []):
            if in_plenum(p['xyz']): p['xyz'] = shift_pt(p['xyz']); cnt += 1
        sv = el.get('service')
        if sv and sv.get('pts'):
            sv['pts'] = [shift_pt(p) if in_plenum(p) else p for p in sv['pts']]
        if el.get('note'): el['note'] = el['note'].replace('3.70 − 0.06897', '3.70 − 0.05172')
        log.append(f'ไฟฟ้า: เลื่อนจุดเหนือฝ้า (ท่อร้อยสาย/กล่อง/โคม) {cnt} จุดตามระนาบใหม่')
    # ข้อความเก่าที่ยังอ้างระนาบเดิม
    left = [p for p in re.findall(r'[^"]{0,40}\+3\.30 \(แนว C\)[^"]{0,20}', json.dumps(m, ensure_ascii=False))]
    m['meta']['fix_roof'] = TAG
    m.setdefault('history', []).append({'at': TAG + 'T12:00:00+07:00', 'by': 'claude (แก้ Step 2 ระนาบหลังคา)',
                                        'sections': ['nodes', 'members', 'roofs', 'finishes', 'sections', 'mep'],
                                        'note': 'Earth 18 พ.ย.: อะเสทุกแถวท้อง +3.30 (= หัวเสา) · ท้องจันทันแถว C +3.40 · มุมอะเสชนกัน · ปากตัว C · โครงคร่าวฝ้า C-Line'})
    m.pop('quantities', None)
    json.dump(m, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n'.join(log))
    if left: print('ข้อความยังอ้าง +3.30 (แนว C):', left[:5])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
