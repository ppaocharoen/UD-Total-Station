"""สร้างชุดทดสอบ tools/neo_steel_cases.json — ป้อนค่าลงชีต NeoSteelDesignv5 (สำเนา) แล้วให้ LibreOffice คำนวณ
ชีต: Tension · Compression · Flexible · Purlin · BColumn (อ่าน/เขียนเฉพาะเซลล์ป้อนข้อมูลในสำเนา ไม่ปลดล็อกไฟล์)
หน้าตัดป้อนลงแถวตาราง (Table/Table1/Table2/Table3 แถว 67–81) ที่ชีตใช้ VLOOKUP — ทดสอบสูตร ไม่ใช่ตาราง
ใช้: python3 tools/gen_neo_steel_cases.py "<NeoSTeelDesignv5 (4).xls>"   (ต้องมี LibreOffice + python3-uno)
"""
import sys, json, os, shutil, subprocess, tempfile, time
import uno
from com.sun.star.beans import PropertyValue


class LO:
    def __init__(self, path, port=2011):
        self.p = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore',
                                   f'--accept=socket,host=localhost,port={port};urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        local = uno.getComponentContext()
        res = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(80):
            try:
                ctx = res.resolve(f'uno:socket,host=localhost,port={port};urp;StarOffice.ComponentContext'); break
            except Exception:
                time.sleep(0.5)
        desk = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        tmp = tempfile.mkdtemp(); dst = os.path.join(tmp, 'neo.xls'); shutil.copy(path, dst)
        pv = PropertyValue(); pv.Name = 'Hidden'; pv.Value = True
        self.doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(dst), '_blank', 0, (pv,))

    def cell(self, ref):
        sh, a = ref.split('!')
        return self.doc.Sheets.getByName(sh).getCellRangeByName(a)

    def put(self, vals):
        for k, v in vals.items():
            c = self.cell(k)
            c.setString(v) if isinstance(v, str) else c.setValue(v)
        self.doc.calculateAll()

    def get(self, ref):
        c = self.cell(ref)
        if c.getError(): return '#ERR'
        if c.getType().value == 'FORMULA' and c.FormulaResultType2 == 1:   # VALUE (ข้อความถูกซ่อนด้วยรูปแบบ ;;; ก็ยังได้ค่า)
            return c.getValue()
        if c.getType().value == 'VALUE': return c.getValue()
        s = c.getString()
        try:
            float(s.replace(',', ''))
            return c.getValue()
        except ValueError:
            return s

    def close(self):
        try: self.doc.close(True)
        except Exception: pass
        self.p.terminate()


# หน้าตัดทดสอบ (ค่าป้อนลงแถวตาราง) — C-Lip/ท่อกล่องจากตาราง RC_Design, WF/รางน้ำจากตาราง Neo
SEC = {
    'C100x50x20x2.3': dict(D=100, B=50, C=20, tw=2.3, tf=2.3, w=4.06, A=5.172, Sx=16.1, Sy=6.06, Ix=80.7, Iy=19.0, rx=3.95, ry=1.92),
    'BOX75x75x3.2': dict(D=75, B=75, C=0, tw=3.2, tf=3.2, w=7.01, A=8.93, Sx=20.1, Sy=20.1, Ix=75.5, Iy=75.5, rx=2.91, ry=2.91),
    'WF200x100x5.5x8': dict(D=200, B=100, C=0, tw=5.5, tf=8, w=21.3, A=27.16, Sx=184, Sy=26.8, Ix=1840, Iy=134, rx=8.24, ry=2.22),
    'WF300x150x6.5x9': dict(D=300, B=150, C=0, tw=6.5, tf=9, w=36.7, A=46.78, Sx=481, Sy=67.7, Ix=7210, Iy=508, rx=12.4, ry=3.29),
    'WF194x150x6x9': dict(D=194, B=150, C=0, tw=6, tf=9, w=30.6, A=39.01, Sx=277, Sy=67.6, Ix=2690, Iy=507, rx=8.3, ry=3.61),
    'CH150x75x6.5x10': dict(D=150, B=75, C=0, tw=6.5, tf=10, w=18.6, A=23.71, Sx=115, Sy=22.4, Ix=861, Iy=117, rx=6.03, ry=2.22),
}


def main(path):
    lo = LO(path)
    out = {'source': 'NeoSTeelDesignv5 — LibreOffice คำนวณจากสำเนา (ป้อนค่าเฉพาะเซลล์ข้อมูล + แถวตาราง)', 'sections': SEC}
    try:
        # ---------- Tension: type 4 → Table!A70 ----------
        T = []
        for name, P, L, k in [('BOX75x75x3.2', 8000, 3, 1), ('C100x50x20x2.3', 4000, 2.5, 1), ('BOX75x75x3.2', 15000, 4, 1),
                              ('WF200x100x5.5x8', 30000, 5, 0.8), ('C100x50x20x2.3', 9000, 1.2, 1)]:
            s = SEC[name]
            v = {'Table!A70': 4, 'Table!B70': name, 'Table!C70': s['tw'], 'Table!D70': s['A'], 'Table!E70': s['w'], 'Table!F70': s['Sx'],
                 'Table!G70': s['Ix'], 'Table!H70': min(s['rx'], s['ry']), 'Table!I70': name, 'Table!J70': s['tf'],
                 'Tension!N16': 4, 'Tension!I9': 1, 'Tension!I13': P, 'Tension!I12': L, 'Tension!I14': k, 'Tension!N11': 2400}
            lo.put(v)
            T.append({'input': dict(sec=name, P=P, L=L, k=k, Fy=2400),
                      'expect': {c: lo.get('Tension!' + c) for c in ('I16', 'I21', 'I23', 'I25', 'I26', 'I22', 'N13', 'N12')}})
        out['tension'] = T
        # ---------- Compression: type 4 → Table!A78 ----------
        C = []
        for name, P, Lx, Ly, k, Fy in [('BOX75x75x3.2', 6000, 3, 3, 1, 2400), ('BOX75x75x3.2', 3000, 5, 5, 1, 2400),
                                       ('C100x50x20x2.3', 2000, 2, 2, 1, 2400), ('WF200x100x5.5x8', 20000, 4, 4, 0.8, 3000),
                                       ('WF300x150x6.5x9', 40000, 2, 2, 1, 2400), ('C100x50x20x2.3', 500, 4.5, 4.5, 1, 2400)]:
            s = SEC[name]
            v = {'Table!A78': 4, 'Table!B78': name, 'Table!C78': s['tw'], 'Table!D78': s['A'], 'Table!E78': s['w'], 'Table!F78': s['Sx'],
                 'Table!G78': s['Ix'], 'Table!H78': min(s['rx'], s['ry']), 'Table!I78': name, 'Table!J78': s['tf'],
                 'Compression!N16': 4, 'Compression!I9': P, 'Compression!I10': Lx, 'Compression!I11': Ly, 'Compression!I14': k, 'Compression!N11': Fy}
            lo.put(v)
            C.append({'input': dict(sec=name, P=P, Lx=Lx, Ly=Ly, k=k, Fy=Fy),
                      'expect': {c: lo.get('Compression!' + c) for c in ('I16', 'I17', 'I18', 'I21', 'I23', 'I28', 'N27', 'I27')}})
        out['compression'] = C
        # ---------- Flexible: Table1 แถว 67–72 (type 1–6) ----------
        F = []
        rowof = {2: 68, 4: 70, 6: 72, 5: 71}
        for typ, name, M1, Mm, M2, V, D, L, Lb, dbl in [
                (6, 'WF200x100x5.5x8', 0, 1500, 0, 1200, 2000, 4, 1.0, 1), (6, 'WF200x100x5.5x8', 0, 1500, 0, 1200, 2000, 4, 4.0, 1),
                (6, 'WF300x150x6.5x9', 2000, 1000, 3000, 3000, 0, 6, 6.0, 1), (6, 'WF194x150x6x9', -1500, 500, 3000, 2500, 0, 5, 3.0, 1),
                (5, 'WF300x150x6.5x9', 0, 4000, 0, 2600, 9000, 6, 8.0, 1), (4, 'CH150x75x6.5x10', 0, 800, 0, 900, 700, 3, 1.5, 1),
                (4, 'CH150x75x6.5x10', 0, 800, 0, 900, 700, 3, 3.0, 2), (2, 'C100x50x20x2.3', 0, 120, 0, 150, 90, 3, 3.0, 1),
                (6, 'WF194x150x6x9', 1000, 400, 1000, 900, 0, 3, 3.0, 1)]:
            s = SEC[name]; r = rowof[typ]
            v = {f'Table1!A{r}': typ, f'Table1!B{r}': name, f'Table1!C{r}': s['D'], f'Table1!D{r}': s['B'], f'Table1!E{r}': s['C'] or '*****',
                 f'Table1!F{r}': s['tw'], f'Table1!G{r}': s['tf'], f'Table1!H{r}': s['w'], f'Table1!I{r}': s['A'], f'Table1!J{r}': s['Sx'],
                 f'Table1!K{r}': s['Sy'], f'Table1!L{r}': s['Ix'], f'Table1!M{r}': s['Iy'], f'Table1!N{r}': s['rx'], f'Table1!O{r}': s['ry'],
                 f'Table1!P{r}': name, 'Flexible!I19': typ, 'Flexible!J20': dbl, 'Flexible!I9': M1, 'Flexible!I10': Mm, 'Flexible!I11': M2,
                 'Flexible!I12': V, 'Flexible!I13': D, 'Flexible!I14': L, 'Flexible!I15': Lb, 'Flexible!N11': 2400}
            lo.put(v)
            rr = 28 + typ
            e = {c: lo.get('Flexible!' + c) for c in ('I16', 'N16', 'N17', 'N18', 'R27', 'S27', 'I31', 'I32', 'I33', 'N33', 'G34')}
            e.update({k: lo.get(f'Flexible!{c}{rr}') for k, c in (('X', 'X'), ('Y', 'Y'), ('Z', 'Z'), ('AA', 'AA'), ('AB', 'AB'), ('AE', 'AE'),
                                                                   ('AF', 'AF'), ('AI', 'AI'), ('AJ', 'AJ'), ('AK', 'AK'), ('AL', 'AL'))})
            F.append({'input': dict(type=typ, sec=name, M1=M1, Mmid=Mm, M2=M2, V=V, D=D, L=L, Lb=Lb, n=dbl, Fy=2400), 'expect': e})
        out['flexible'] = F
        # ---------- Purlin: Table2 แถว 68 (type 2 = C-Lip) / 70 (type 4) ----------
        Pu = []
        for name, sag, L, sp, slope, tiles, LL, WL, sw in [('C100x50x20x2.3', 1, 4, 1, 15, 30, 30, 50, 5), ('C100x50x20x2.3', 2, 6, 1.2, 25, 15, 30, 60, 5),
                                                         ('C100x50x20x2.3', 3, 6, 1, 30, 10, 50, 80, 4.06), ('BOX75x75x3.2', 1, 3, 0.8, 10, 12, 30, 50, 8)]:
            s = SEC[name]; r = 68
            v = {f'Table2!A{r}': 2, f'Table2!B{r}': name, f'Table2!C{r}': s['D'], f'Table2!D{r}': s['B'], f'Table2!E{r}': s['C'] or '*****',
                 f'Table2!F{r}': s['tw'], f'Table2!G{r}': s['tf'], f'Table2!H{r}': s['w'], f'Table2!I{r}': s['A'], f'Table2!J{r}': s['Sx'],
                 f'Table2!K{r}': s['Sy'], f'Table2!L{r}': s['Ix'], f'Table2!M{r}': s['Iy'], f'Table2!N{r}': s['rx'], f'Table2!O{r}': s['ry'],
                 f'Table2!P{r}': name, 'Purlin!N17': 2, 'Purlin!I9': sag, 'Purlin!I11': L, 'Purlin!I12': sp, 'Purlin!I13': slope,
                 'Purlin!I14': tiles, 'Purlin!I15': LL, 'Purlin!I16': WL, 'Purlin!I17': sw, 'Purlin!N11': 2400}
            lo.put(v)
            Pu.append({'input': dict(sec=name, sag=sag, L=L, s=sp, slope=slope, roofDL=tiles, LL=LL, WL=WL, sw=sw, Fy=2400),
                       'expect': {c: lo.get('Purlin!' + c) for c in ('I19', 'I20', 'I21', 'I22', 'I23', 'I24', 'I25', 'I27', 'I28', 'I30', 'I32', 'R27', 'N29', 'N30', 'J29', 'G34')}})
        out['purlin'] = Pu
        # ---------- BColumn: type 4 → Table3!A78 (+ L78 = Sy) ----------
        B = []
        for name, P, Mx, My, L, k in [('BOX75x75x3.2', 3000, 150, 80, 3, 1), ('WF200x100x5.5x8', 12000, 900, 100, 4, 1),
                                      ('BOX75x75x3.2', 1500, 400, 0, 3.5, 1.2), ('WF194x150x6x9', 25000, 1500, 600, 5, 0.8)]:
            s = SEC[name]
            v = {'Table3!A78': 4, 'Table3!B78': name, 'Table3!C78': s['tw'], 'Table3!D78': s['A'], 'Table3!E78': s['w'], 'Table3!F78': s['Sx'],
                 'Table3!G78': s['Ix'], 'Table3!H78': min(s['rx'], s['ry']), 'Table3!I78': name, 'Table3!J78': s['tf'], 'Table3!L75': s['Sy'],
                 'BColumn!N16': 4, 'BColumn!I9': P, 'BColumn!I10': Mx, 'BColumn!I11': My, 'BColumn!I12': L, 'BColumn!I14': k, 'BColumn!N11': 2400}
            lo.put(v)
            B.append({'input': dict(sec=name, P=P, Mx=Mx, My=My, L=L, k=k, Fy=2400),
                      'expect': {c: lo.get('BColumn!' + c) for c in ('I17', 'I18', 'I21', 'I23', 'I28', 'N27', 'Y8')}})
        out['bcolumn'] = B
    finally:
        lo.close()
    json.dump(out, open(os.path.join(os.path.dirname(__file__), 'neo_steel_cases.json'), 'w'), ensure_ascii=False, indent=1)
    print('cases:', {k: len(v) for k, v in out.items() if isinstance(v, list)})


if __name__ == '__main__':
    main(sys.argv[1])
