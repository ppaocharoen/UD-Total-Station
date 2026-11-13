# ปรับระดับ (relevel) Step 2–4 → ไฟล์ _lv · ฝังปริมาณ · ทำตารางตรวจ (ต้นฉบับ + ภาคผนวก) ลงโฟลเดอร์ส่ง
import json, sys, subprocess, shutil, os, copy
sys.path.insert(0, os.path.dirname(__file__)); from relevel import relevel
from fix4d import fix4d
R = '/home/claude/UD-Total-Station'; W = '/home/claude/th12work'; OUT = '/mnt/user-data/outputs'
def qty(path):
    t = '/tmp/_q.bm.json'; shutil.copy(path, t); subprocess.run(['python3', f'{R}/tools/takeoff.py', t, '--write'], check=True, capture_output=True)
    return {i['name'] if 'name' in i else i.get('desc'): (i.get('qty'), i.get('unit')) for i in json.load(open(t))['quantities']['items']}
diff = []
for n, src in ((2, 's2/stage2'), (3, 's3/stage3'), (4, 's4/stage4c')):
    m = relevel(json.load(open(f'{W}/{src}.bm.json')))
    if n == 4: m = fix4d(m)
    lv = f'{W}/{src}_lv.bm.json'; json.dump(m, open(lv, 'w'), ensure_ascii=False, indent=1)
    r = subprocess.run(['python3', f'{R}/tools/validate.py', lv], capture_output=True, text=True); print(n, r.stdout.strip().splitlines()[-1])
    dst = f'{OUT}/th12s{n}/ห้องน้ำ ท12 Step{n}.bm.json'; shutil.copy(lv, dst); subprocess.run(['python3', f'{R}/tools/takeoff.py', dst, '--write'], check=True, capture_output=True)
    print('  items', len(json.load(open(dst))['quantities']['items']))
    if n == 4:
        a, b = qty(f'{W}/{src}.bm.json'), qty(lv)
        diff = [[k, a.get(k, (0,))[0], b[k][0], b[k][1]] for k in b if a.get(k, (None,))[0] != b[k][0]] + [[k, a[k][0], 0, a[k][1]] for k in a if k not in b]
json.dump(diff, open(f'{W}/common/lvdiff.json', 'w'), ensure_ascii=False)
for d in diff: print('  ', d)
# ตารางตรวจ = ต้นฉบับ + ภาคผนวก common/app_lv.json (แก้ข้อความภาคผนวกในไฟล์นั้น · ตารางปริมาณมาจาก lvdiff.json)
A = json.load(open(f'{W}/common/app_lv.json'))
for n, src in ((2, 's2'), (3, 's3'), (4, 's4')):
    open(f'{OUT}/th12s{n}/ตารางตรวจ Step{n}.md', 'w').write(open(f'{W}/{src}/ตารางตรวจ Step{n}.md').read().rstrip() + '\n' + '\n'.join(A) + '\n')
