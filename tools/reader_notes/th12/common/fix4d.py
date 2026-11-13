# Step 4 แก้ 13 พ.ย. (Earth): A.3.04 รูปด้านข้าง — ข้างจั่ว (กริด 1 / 4) มีเชิงชายสำเร็จรูป 8" และครอบข้างพับปิดลงจนไม่เห็นโครงเหล็กหลังคา
import math
def fix4d(m):
    if m['meta'].get('fix4d'): return m
    F = {f['id']: f for f in m['finishes']}
    FA, CAP = F['RF-FA'], F['RF-CAP']
    seg = FA['place'][0]['segs']; (a0, a1), (b0, b1) = seg[0], seg[1]   # [แนว A], [แนว C]
    zA, zC = a0[2], b0[2]; yA, yC = a0[1], b0[1]
    side = [[[a0[0] - 0.006, yA, zA], [a0[0] - 0.006, yC, zC]], [[a1[0] + 0.006, yA, zA], [a1[0] + 0.006, yC, zC]]]
    FA['place'][0]['segs'] = seg + side
    Ls = math.hypot(yC - yA, zC - zA)
    FA['qty'] = round(FA['qty'] + 2 * Ls, 2)
    FA['src'] = FA['src'] + ' + A.3.04 รูปด้านข้าง (เชิงชายข้างจั่ว)'
    FA['note'] = FA['note'] + f' · + ข้างจั่วกริด 1 / 4 ยาวตามลาด {Ls:.2f} × 2 (A.3.04 — Earth 13 พ.ย.) = {FA["qty"]:.2f} ม.'
    FA['status'] = 'user'
    # ครอบข้าง: พับลงปิดหน้าเชิงชายด้านบน (แผ่นตั้งด้านนอก สูง 0.10) — ไม่เห็นโครงเหล็ก
    cs = CAP['place'][0]['segs']
    sides = [s for s in cs if abs(s[0][0] - s[1][0]) < 1e-6]
    CAP['place'].append({'shape': 'strip', 'w': 0.008, 'h': 0.10, 'color': CAP['place'][0]['color'],
                         'segs': [[[s[0][0] + (-0.066 if s[0][0] < 5 else 0.066), s[0][1], s[0][2] - 0.04], [s[1][0] + (-0.066 if s[1][0] < 5 else 0.066), s[1][1], s[1][2] - 0.04]] for s in sides]})
    CAP['note'] = CAP['note'] + ' · ครอบข้างพับลงปิดหน้าเชิงชายข้างจั่ว ไม่เห็นโครงเหล็กหลังคา (A.3.04 — Earth 13 พ.ย.)'
    # ฝ้า CL1 / CL1-E: A.4.01 ฝ้าไม่ติดท้องจันทัน มีโครงคร่าว C-Line ขวางก่อน (Earth 13 พ.ย.) → ผิวฝ้าต่ำกว่าท้องจันทัน 0.045 (C-Line + แผ่น 6 มม. — **สมมติ** แบบไม่บอกระยะ)
    for f in m['finishes']:
        if f['id'] in ('CL1', 'CL1-E'):
            f['z'] = round(f['z'] - 0.045, 3); f['slope'] = dict(f['slope'], z=round(f['slope']['z'] - 0.045, 3))
            f['note'] = f['note'] + ' · ผิวฝ้าต่ำกว่าท้องจันทัน 0.045 (โครงคร่าว C-Line ใต้ท้องจันทัน A.4.01 — Earth 13 พ.ย. · ระยะสมมติ) — ช่องนี้ใช้เดินท่อร้อยสาย'
    m['meta']['fix4d'] = True
    return m
