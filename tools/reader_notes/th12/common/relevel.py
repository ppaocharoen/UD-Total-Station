# ปรับระดับโครงสร้างพื้นชั้นล่างแบบ on ground ตามกติกา Earth 12–13 พ.ย. 2569 (ใช้กับไฟล์ Step 2 ขึ้นไปก่อนส่ง)
#   หลังคานคอดิน = ระดับพื้นสำเร็จของห้องฝั่งที่บ่าคานโผล่พ้นผนัง − 0.05 · พื้นโครงสร้าง = พื้นสำเร็จ − 0.05 (มีฟินิช) · ทางเดินไม่มีฟินิช
#   ผนังก่อเริ่มที่หลังคาน (ไม่อยู่บนคาน = หลังพื้นโครงสร้าง) · ตอม่อจบที่ท้องคานต่ำสุดของหัวเสานั้น · ระดับช่องเปิดคงเดิม
import math
FIN = 0.05
FIN_RAMP = 0.03   # ทรายล้างทางลาด/ชานพัก (Earth 13 พ.ย.)
NOTE = 'Earth 12–13 พ.ย.: หลังคาน = พื้นสำเร็จฝั่งบ่าคาน − 0.05'
def beam_top(a, b):
    """หลังคานของ ท12 ตามตารางที่ Earth ยืนยัน 13 พ.ย.: +0.20 เฉพาะแถว A · คาน A+0.90 · กริด 1–4 ช่วง A–B (พื้น +0.25) นอกนั้น +0.15"""
    (x0, y0), (x1, y1) = a, b
    if abs(y0 - y1) < 1e-6: return 0.20 if (abs(y0) < 1e-6 or abs(y0 - 0.9) < 1e-6) else 0.15
    return 0.20 if max(y0, y1) <= 1.5 + 1e-6 else 0.15
def relevel(m):
    if m.get('meta', {}).get('releveled'): return m
    N = {n['id']: n for n in m['nodes']}; mem = m['members']
    beams = [b for b in mem if b['type'] == 'tie_beam']; BT = {}; segs = []
    for b in beams:
        a, e = N[b['i']], N[b['j']]; T = beam_top((a['x'], a['y']), (e['x'], e['y'])); BT[b['id']] = T; segs.append(((a['x'], a['y']), (e['x'], e['y']), T))
    def beam_at(x, y, tol=0.12):   # หลังคานของคานที่จุด (x,y) อยู่บนแนว (ต่ำสุดถ้าหลายตัว) · None ถ้าไม่อยู่บนคาน
        out = []
        for (ax, ay), (bx, by), T in segs:
            L = math.hypot(bx - ax, by - ay); t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L / L
            if -0.02 <= t <= 1.02 and abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / L <= tol: out.append(T)
        return min(out) if out else None
    def inside(p, poly):
        c = False; n = len(poly)
        for i in range(n):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
            if (y1 > p[1]) != (y2 > p[1]) and p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1: c = not c
        return c
    # ---- พื้น
    STR = {}
    for s in m['slabs']:
        i = s['id']; old = s['top']
        if i.startswith('S-WK') or i == 'S-RB': STR[i] = old; continue   # ทางเดินไม่มีฟินิช · พื้นล่างกล่องทางลาดคงเดิม
        if i in ('S-RAMP', 'S-LAND'):   # ทางลาด/ชานพัก: ฟินิช = ทรายล้างหนา 0.03 (Earth 13 พ.ย.)
            s['finish_t'] = FIN_RAMP; s['top'] = round(old - FIN_RAMP, 3); STR[i] = s['top']; s['status'] = 'user'
            if 'ramp' in s: s['ramp'] = dict(s['ramp'], low=round(s['ramp']['low'] - FIN_RAMP, 3), high=round(s['ramp']['high'] - FIN_RAMP, 3))
            if i == 'S-RAMP': s['sand'] = 0.027; sn = 'ทรายอัดในกล่อง ≈ 0.065 ลบ.ม. (ช่องใน 0.75 × ยาว 1.44 × สูงเฉลี่ย 0.06) คิดเป็นหนาเทียบเท่า 0.027 บนพื้นที่ 2.40'
            else: s['sand'] = 0.083; sn = 'ทรายอัดในกล่อง ≈ 0.099 ลบ.ม. (ช่องใน 0.75 × 1.10 × 0.12) คิดเป็นหนาเทียบเท่า 0.083 บนพื้นที่ 1.20'
            s['note'] = (s.get('note') or '').split(' · ทรายอัดในกล่อง')[0] + f' · {sn} · หลังพื้นโครงสร้างต่ำกว่าผิวสำเร็จ 0.03 = ความหนาทรายล้าง (Earth 13 พ.ย.) — ผิวสำเร็จคงเดิม {old:+.2f}'
            continue
        s['finish_t'] = FIN; s['top'] = round(old - FIN, 3); STR[i] = s['top']
        if s.get('t') == 0.17: s['t'] = 0.12
        s['status'] = 'user'
        s['note'] = f'พื้น GS on ground หนา {s["t"]:.2f} หลังพื้นโครงสร้าง {s["top"]:+.2f} + ฟินิช 0.05 = พื้นสำเร็จ {old:+.2f} ({NOTE}) · ' + (s.get('note') or '').split(' · ', 1)[-1]
    def slab_z(x, y):
        for s in m['slabs']:
            if not s['id'].startswith('S-WK') and inside((x, y), s['polygon']): return STR[s['id']]
        return None
    def base_z(x, y, old):
        b = beam_at(x, y)
        if b is not None: return b
        z = slab_z(x, y)
        return z if z is not None else old
    # ---- โหนดคาน: โหนดที่คานต่างระดับมาชนกัน → แยกโหนดระดับต่ำ (เสาเริ่มที่หลังคานสูงสุด)
    use = {}
    for b in beams:
        for k in ('i', 'j'): use.setdefault(b[k], set()).add(BT[b['id']])
    new_id = {}
    for nid, Ts in use.items():
        hi = max(Ts); N[nid]['z'] = hi
        for T in Ts - {hi}:
            n2 = dict(N[nid]); n2['id'] = f'{nid}-L{int(round(T * 100))}'; n2['z'] = T; m['nodes'].append(n2); N[n2['id']] = n2; new_id[(nid, T)] = n2['id']
    for b in beams:
        for k in ('i', 'j'):
            if (b[k], BT[b['id']]) in new_id: b[k] = new_id[(b[k], BT[b['id']])]
        T = BT[b['id']]; b['status'] = 'user' if T != 0.20 else b.get('status', 'from_drawing')
        b['note'] = (b.get('note') or '').replace('หลังคาน +0.20', f'หลังคาน {T:+.2f}') + f' · {NOTE}'
    # ---- ตอม่อ/ช่วงจุดต่อ: ท้องคานต่ำสุดที่หัวเสา
    for n in m['nodes']:
        if abs(n['z'] + 0.20) < 1e-6:
            Ts = [T for (a, b_, T) in segs if min(math.dist(a, (n['x'], n['y'])), math.dist(b_, (n['x'], n['y']))) < 0.02]
            if Ts: n['z'] = round(min(Ts) - 0.40, 3)
    # ---- เสาเอ็น: ฐานที่ระดับพื้นเดิม → หลังคาน/หลังพื้นโครงสร้าง
    for b in mem:
        if b['type'] != 'stiffener': continue
        lo = N[b['i']] if N[b['i']]['z'] <= N[b['j']]['z'] else N[b['j']]
        if lo['id'] in use or lo['z'] not in (0.2, 0.25): continue
        lo['z'] = base_z(lo['x'], lo['y'], lo['z'])
    # ---- ผนังก่อ: ฐานลงถึงหลังคาน · ช่องเปิดคงระดับเดิม
    OT = m.get('opening_types', {}); dz = {}
    for w in m['walls']:
        if w['kind'] not in ('brick_mon', 'brick', 'block') or w.get('bottom') not in (0.2, 0.25): continue
        (x0, y0), (x1, y1) = w['path'][0], w['path'][-1]; nb = base_z((x0 + x1) / 2, (y0 + y1) / 2, w['bottom'])
        if abs(nb - w['bottom']) < 1e-6: continue
        dz[w['id']] = round(w['bottom'] - nb, 3); w['finish_floor'] = w['bottom']; w['bottom'] = nb
        w['note'] = (w.get('note') or '') + f' · ฐานผนังก่อจากหลังคาน/พื้นโครงสร้าง {nb:+.2f} (ต่ำกว่าพื้นสำเร็จ {dz[w["id"]]:.2f}) — {NOTE}'
    by = {}
    for o in m.get('openings', []): by.setdefault(o['type'], []).append(dz.get(o['wall'], 0.0))
    for tp, ds in by.items():   # ช่องเปิดคงระดับเดิม: sill (วัดจากฐานผนัง) เพิ่มเท่าที่ฐานผนังลดลง — ทุกช่องของชนิดเดียวกันลดเท่ากันจึงแก้ที่ชนิด ไม่งั้นแยกชนิดใหม่
        if not any(ds): continue
        if len(set(ds)) == 1:
            OT[tp]['sill'] = round((OT[tp].get('sill') or 0) + ds[0], 3); continue
        for o in m['openings']:
            d = dz.get(o['wall'], 0.0)
            if o['type'] == tp and d:
                nt = f'{tp}-L{int(round(d * 100))}'
                if nt not in OT: OT[nt] = dict(OT[tp], sill=round((OT[tp].get('sill') or 0) + d, 3))
                o['type'] = nt
    # ---- ผนัง คสล. กล่องทางลาด: ยอด = ท้องพื้นบน ลดตาม 0.03 · ช่วงแรกสั้นลง (พื้นบนชนพื้นล่างถึง x 3.96)
    for w in m['walls']:
        if not w['id'].startswith('RW-'): continue
        old = w['top']; w['top'] = round(old - FIN_RAMP, 3)
        if w['top'] <= 0.001:   # RW-O1 / RW-I1: เหลือเฉพาะ x 3.96–4.20 สูงเฉลี่ย 0.01
            w['path'] = [[3.96, w['path'][0][1]], w['path'][-1]]; w['top'] = 0.01
        w['status'] = 'user'; w['note'] = (w.get('note') or '') + f' · ยอดผนังลด 0.03 ตามพื้นบนที่ลดเท่าความหนาทรายล้าง (เดิม {old:+.3f} → {w["top"]:+.3f} · Earth 13 พ.ย.)'
    m['meta']['releveled'] = True
    m['meta']['level_rule'] = 'พื้น on ground: หลังคานคอดิน = พื้นสำเร็จฝั่งบ่าคาน − 0.05 · พื้นโครงสร้าง = พื้นสำเร็จ − 0.05 (ทางเดินไม่มีฟินิช) · ผนังก่อจากหลังคาน · ทางลาด/ชานพัก ฟินิชทรายล้าง 0.03 (Earth 12–13 พ.ย. 2569)'
    return m
