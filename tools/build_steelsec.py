"""สร้างตารางหน้าตัดเหล็ก lib/steelsec_data.js จากตารางใน RC_Design_WSD_Fixed_iterative_calc_UDfix.xlsm (ชีต Purlin)
+ ท่อกลมจาก NeoSTeelDesignv5 ชีต Table (A4:H) — รันครั้งเดียวเมื่อตารางต้นฉบับเปลี่ยน
ใช้: python3 tools/build_steelsec.py <RC_Design.xlsm> <NeoSteel.xls>
หน่วย: มม. (ขนาด) · ซม.² · ซม.⁴ · ซม.³ · ซม. · กก./ม.
"""
import sys, json, re
import openpyxl, xlrd
from openpyxl.utils import column_index_from_string as ci

def num(v):
    if isinstance(v, (int, float)): return float(v)
    return None

def main(rc, neo):
    ws = openpyxl.load_workbook(rc, data_only=True, read_only=True)['Purlin']
    R = {}
    for r, row in enumerate(ws.iter_rows(min_row=120, max_row=1074, min_col=ci('AN'), max_col=ci('BQ'), values_only=True), start=120):
        R[r] = {openpyxl.utils.get_column_letter(ci('AN') + i): v for i, v in enumerate(row)}
    def rows(r0, r1):
        for r in range(r0, r1 + 1):
            x = R[r]
            if isinstance(x['AN'], (int, float)) and x['AO']: yield x
    out = []
    def nums(s): return [float(v) for v in re.findall(r'\d+(?:\.\d+)?', s)]
    for x in rows(342, 386):     # C-Light Lip
        H, B, C, t = nums(x['AO'])
        out.append(dict(fam='CL', name='C%sx%sx%sx%s' % tuple(fmt(v) for v in (H, B, C, t)), H=H, B=B, C=C, t=t,
                        A=num(x['AR']), w=num(x['AS']), cx=num(x['AU']), Ix=num(x['AV']), Iy=num(x['AW']),
                        rx=num(x['AX']), ry=num(x['AY']), Sx=num(x['AZ']), Sy=num(x['BA']), xo=num(x['BB'])))
    for x in rows(443, 475):     # ท่อเหล็กกล่องสี่เหลี่ยมจัตุรัส
        D, _, t = nums(x['AO'])
        out.append(dict(fam='BOX', name='BOX%sx%sx%s' % (fmt(D), fmt(D), fmt(t)), H=D, B=D, t=t, w=num(x['AS']), A=num(x['AT']),
                        Ix=num(x['AU']), Iy=num(x['AU']), Sx=num(x['AV']), Sy=num(x['AV']), rx=num(x['AW']), ry=num(x['AW'])))
    for x in rows(402, 427):     # ท่อเหล็กกล่องสี่เหลี่ยมผืนผ้า (D = ด้านยาว แนวแกน x แข็ง)
        D, B, t = nums(x['AO'])
        out.append(dict(fam='BOX', name='BOX%sx%sx%s' % (fmt(D), fmt(B), fmt(t)), H=D, B=B, t=t, w=num(x['AS']), A=num(x['AT']),
                        Ix=num(x['AU']), Iy=num(x['AV']), Sx=num(x['AW']), Sy=num(x['AX']), rx=num(x['AY']), ry=num(x['AZ'])))
    for x in rows(126, 141):     # เหล็กรางน้ำ (รีดร้อน)
        H, B, tw, tf = nums(x['AO'])
        out.append(dict(fam='CH', name='CH%sx%sx%sx%s' % tuple(fmt(v) for v in (H, B, tw, tf)), H=H, B=B, tw=tw, tf=tf,
                        A=num(x['AU']), w=num(x['AV']), cx=num(x['AX']), Ix=num(x['AY']), Iy=num(x['AZ']),
                        rx=num(x['BA']), ry=num(x['BB']), Sx=num(x['BC']), Sy=num(x['BD'])))
    for x in rows(218, 290):     # WF
        H, B, tw, tf = nums(x['AO'])
        out.append(dict(fam='WF', name='WF%sx%sx%sx%s' % tuple(fmt(v) for v in (H, B, tw, tf)), H=H, B=B, tw=tw, tf=tf,
                        A=num(x['BC']), w=num(x['AQ']), Ix=num(x['BE']), Iy=num(x['BG']), rx=num(x['BI']), ry=num(x['BK']),
                        Sx=num(x['BM']), Sy=num(x['BO'])))
    for x in rows(308, 327):     # I-Beam
        H, B, tw, tf = nums(x['AO'])
        out.append(dict(fam='I', name='I%sx%sx%sx%s' % tuple(fmt(v) for v in (H, B, tw, tf)), H=H, B=B, tw=tw, tf=tf,
                        A=num(x['AU']), w=num(x['AV']), Ix=num(x['AW']), Iy=num(x['AX']), rx=num(x['AY']), ry=num(x['AZ']),
                        Sx=num(x['BA']), Sy=num(x['BB'])))
    for r0, r1 in ((157, 202), (1062, 1074)):   # เหล็กฉาก ขาเท่า / ขาไม่เท่า
        for x in rows(r0, r1):
            A_, B_, t = nums(x['AO'])
            out.append(dict(fam='L', name='L%sx%sx%s' % (fmt(A_), fmt(B_), fmt(t)), H=A_, B=B_, t=t, A=num(x['AT']), w=num(x['AU']),
                            cx=num(x['AV']), cy=num(x['AW']), Ix=num(x['AX']), Iy=num(x['AY']), Iu=num(x['AZ']), Iv=num(x['BA']),
                            rx=num(x['BB']), ry=num(x['BC']), ru=num(x['BD']), rv=num(x['BE']), Sx=num(x['BF']), Sy=num(x['BG'])))
    s = xlrd.open_workbook(neo).sheet_by_name('Table')    # ท่อกลม (Neo A4:H)
    for r in range(3, 60):
        v = [s.cell_value(r, c) for c in range(8)]
        if not isinstance(v[0], float) or not isinstance(v[1], float): continue
        D, t = v[1], v[2]
        out.append(dict(fam='PIPE', name='PIPE%sx%s' % (fmt(D), fmt(t)), H=D, B=D, t=t, w=v[3], A=v[4], Ix=v[5], Iy=v[5],
                        Sx=v[6], Sy=v[6], rx=v[7], ry=v[7]))
    names = [o['name'] for o in out]
    dup = {n for n in names if names.count(n) > 1}
    if dup: print('ชื่อซ้ำ', dup)
    for o in out:
        for k in list(o):
            if o[k] is None: del o[k]
    js = ('/*! steelsec_data.js — ตารางหน้าตัดเหล็ก (สร้างโดย tools/build_steelsec.py — ห้ามแก้มือ)\n'
          ' * ที่มา: RC_Design_WSD_Fixed_iterative_calc_UDfix.xlsm ชีต Purlin (C-Lip มอก.1228, ท่อกล่อง มอก.107, รางน้ำ, WF, I, ฉาก)'
          ' + NeoSteelDesignv5 ชีต Table (ท่อกลม)\n'
          ' * หน่วย: มม. · ซม.² · ซม.⁴ · ซม.³ · ซม. · กก./ม. · แกน x = แกนแข็ง */\n'
          '(function (root) { const D = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('},{', '},\n{') +
          ';\n  if (typeof module === "object" && module.exports) module.exports = D; else root.SteelSecData = D;\n'
          '})(typeof self !== "undefined" ? self : this);\n')
    open('lib/steelsec_data.js', 'w').write(js)
    from collections import Counter
    print(len(out), Counter(o['fam'] for o in out))

def fmt(v):
    return ('%g' % v)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
