"""ผูกราคางานระบบ (ไฟฟ้า/ประปา) ตามชนิดและขนาด — ตกลงกับ Earth 18 ต.ค. 2569

- ค่าวัสดุ: หาในราคาพาณิชย์ด้วยตัวจับคู่ (price_ref kind "mat_find" ใน lib/boqcalc.js)
  หลายยี่ห้อ → เลือกถูกสุดที่มีราคาในอุดรธานี ถ้าอุดรไม่มี ใช้จังหวัดข้างเคียงที่ถูกสุด
- ค่าแรง: ว480 หมวดสุขาภิบาล (SN) / ไฟฟ้า (EE) / สถาปัตย์ 2.6 ติดตั้งสุขภัณฑ์ ตามขนาด
- ข้อต่อ เหล็กยึด ทดสอบ-ทำความสะอาด-ทาสีสัญลักษณ์: % ของค่าท่อ ตาม ว480 ของท่อแต่ละชนิด (PCT)
- ของที่ไม่มีในราคาพาณิชย์ (ท่อร้อยสาย สุขภัณฑ์ โคม ตู้ไฟ): ผูกค่าแรงอย่างเดียว ค่าวัสดุให้กรอกราคาสืบ (need_mat)
"""
import re


def dia_in(s):
    """'1/2"' → 0.5, '1 1/2"' → 1.5, '4"' → 4.0, '20 มม.' → None"""
    if s is None:
        return None
    t = str(s).replace('"', "").replace("”", "").replace("นิ้ว", "").strip()
    m = re.fullmatch(r"(\d+)?\s*(?:(\d+)/(\d+))?", t)
    if not m or not (m.group(1) or m.group(2)):
        return None
    v = float(m.group(1) or 0)
    if m.group(2):
        v += int(m.group(2)) / int(m.group(3))
    return v


# ว480 ค่าแรงเดินท่อตามขนาด (นิ้ว → ตัวอักษร)
SN37 = {1.5: "a", 2: "b", 2.5: "c", 3: "d", 4: "e", 6: "f"}                                   # PVC ระบายน้ำ
SN38 = {0.5: "a", 0.75: "b", 1: "c", 1.25: "d", 1.5: "e", 2: "f", 2.5: "g", 3: "h", 4: "i", 6: "j"}   # PVC ประปา
SN310 = SN38                                                                                   # PB/PP-R/HDPE ประปา
EE444 = {15: "i", 20: "h", 25: "g", 32: "f", 40: "e", 50: "d", 65: "c", 80: "b", 100: "a"}     # ท่อร้อยสาย PVC (มม.)
IN_MM = {0.5: 15, 0.75: 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 4: 100}
EE42 = {0.5: "a", 1: "b", 1.5: "c", 2.5: "d", 4: "e", 6: "f", 10: "g", 16: "h", 25: "i", 35: "j", 50: "k", 70: "l",
        95: "m", 120: "n", 150: "o", 185: "p", 240: "q", 300: "r", 400: "s", 500: "t"}       # THW
EE421 = {1: "a", 1.5: "b", 2.5: "c", 4: "d", 6: "e", 10: "f", 16: "g"}                       # VAF 300V

# % ของค่าท่อ ตาม ว480 (วัสดุ, ค่าแรง = 30% ของค่าวัสดุ)
PCT = {
    "SN-3.7": {"name": "PVC ระบายน้ำ", "fit": 0.4, "sup": 0.3, "test": 0.1},
    "SN-3.8": {"name": "PVC ประปา", "fit": 0.5, "sup": 0.3, "test": 0.1},
    "SN-3.10": {"name": "PP-R/PB/HDPE ประปา", "fit": 0.5, "sup": 0.2, "test": 0.1},
}
PCT_LAB = 0.30
PCT_CODES = {"SN-3.7": ("g/h", "i/j", "k/l"), "SN-3.8": ("k/l", "m/n", "o/p"), "SN-3.10": ("k/l", "m/n", "o/p")}


def nearest(table, v):
    if v is None:
        return None
    if v in table:
        return table[v]
    return None


def pipe_ref(system, material, dia):
    """คืน (price_ref, กลุ่ม ว480 สำหรับ %, หมายเหตุ)"""
    d = dia_in(dia)
    mat = material or ""
    drain = system in ("soil", "waste", "vent", "rain", "drain")
    if "PVC" in mat.upper():
        cls = re.search(r"ชั้น\s*([\d.]+)", mat)
        grp = "SN-3.7" if drain else "SN-3.8"
        letter = nearest(SN37 if drain else SN38, d)
        note = ""
        if drain and d is not None and d < 1.5:
            letter, note = "a", f"ท่อระบายน้ำ ⌀{dia} เล็กกว่าตาราง ว480 (เริ่ม 1.5\") ใช้ค่าแรง 1.5\""
        ref = {"kind": "mat_find", "find": {"type": "pvc_pipe", "cls": cls.group(1) if cls else "8.5", "dia": dia}}
        if letter:
            ref["wage_code"] = f"{grp}-{letter}"
        return ref, grp, note
    if re.search(r"PP-?R|PB|HDPE", mat, re.I) and not drain:
        letter = nearest(SN310, d)
        ref = {"kind": "user", "need_mat": True}
        if letter:
            ref["wage_code"] = f"SN-3.10-{letter}"
        return ref, "SN-3.10", "ท่อ PP-R ไม่มีในราคาพาณิชย์ — กรอกราคาสืบ"
    return {"kind": "user", "need_mat": True}, None, f"ท่อ {mat} ยังไม่มีการผูกราคา"


def conduit_ref(conduit):
    """ท่อร้อยสาย: ราคาพาณิชย์ไม่มี → ค่าแรง EE-4.44 (PVC สีเหลือง) ตามขนาด"""
    m = re.search(r'(\d+(?:\s+\d+/\d+|/\d+)?)\s*"', conduit or "") or re.search(r"(\d+)\s*มม", conduit or "")
    ref = {"kind": "user", "need_mat": True}
    if m and "PVC" in (conduit or "").upper():
        mm = IN_MM.get(dia_in(m.group(1) + '"')) if '"' in m.group(0) else int(m.group(1))
        if mm in EE444:
            ref["wage_code"] = f"EE-4.44-{EE444[mm]}"
    return ref


def wire_ref(wire_t, size):
    try:
        s = float(size)
    except (TypeError, ValueError):
        return {"kind": "user", "need_mat": True}
    s = int(s) if s == int(s) else s
    t = (wire_t or "").upper()
    if "THW" in t or "IEC01" in t or "60227" in t:
        ref = {"kind": "mat_find", "find": {"type": "thw", "size": str(s)}}
        if s in EE42:
            ref["wage_code"] = f"EE-4.2-{EE42[s]}"
        return ref
    if "VAF" in t:
        ref = {"kind": "mat_find", "find": {"type": "re", "re": rf"สายไฟฟ้า VAF.*2 ?[x×*] ?{s}(\.0)? ?ตร"}}
        if s in EE421:
            ref["wage_code"] = f"EE-4.21-{EE421[s]}"
        return ref
    return {"kind": "user", "need_mat": True}


def point_ref(kind, desc=""):
    d = (desc or "").lower()
    if kind in ("light", "lamp"):
        ref = {"kind": "user", "need_mat": True}
        if "ดาวน์" in d or "downlight" in d:
            ref["wage_code"] = "EE-4.58-a"
        return ref
    if kind == "switch":
        if "3 ทาง" in d or "two way" in d or "2 ทาง" in d:
            return {"kind": "mat_find", "find": {"type": "re", "re": "^สวิตช์ไฟฟ้า 3 ทาง"}, "wage_code": "EE-4.53-e"}
        return {"kind": "user", "need_mat": True, "wage_code": "EE-4.53-a"}
    if kind == "outlet":
        if "เดี่ยว" in d or "single" in d:
            return {"kind": "mat_find", "find": {"type": "re", "re": "^เต้ารับเดี่ยว.*มีกราวด์"}, "wage_code": "EE-4.53-j"}
        return {"kind": "mat_find", "find": {"type": "re", "re": "^เต้ารับคู่.*มีกราวด์"}, "wage_code": "EE-4.53-k"}
    if kind in ("tv",):
        return {"kind": "user", "need_mat": True, "wage_code": "EE-4.53-n"}
    if kind in ("data",):
        return {"kind": "user", "need_mat": True, "wage_code": "EE-4.53-o"}
    if kind == "bell":
        return {"kind": "user", "need_mat": True, "wage_code": "EE-4.53-q"}
    return {"kind": "user", "need_mat": True}


FIX_WAGE = {"wc": "ARC-2.6.1", "lavatory": "ARC-2.6.6", "urinal": "ARC-2.6.4", "shower": "ARC-2.6.10",
            "spray": "ARC-2.6.11", "faucet": "ARC-2.6.23", "floor_drain": "ARC-2.6.25", "sink": "ARC-2.6.31"}


def fixture_ref(kind):
    ref = {"kind": "user", "need_mat": True}
    if kind in FIX_WAGE:
        ref["wage_code"] = FIX_WAGE[kind]
    return ref


def equip_ref(kind, size=""):
    if kind == "septic_tank":
        m = re.search(r"([\d,]+)\s*ลิตร", size or "")
        if m:
            n = m.group(1).replace(",", "")
            pat = n[:-3] + ",?" + n[-3:] if len(n) > 3 else n
            return {"kind": "mat_find", "find": {"type": "re", "re": rf"^ถังบำบัดน้ำเสีย.*{pat} ?ลิตร"}}
        return {"kind": "user", "need_mat": True}
    if kind in ("meter", "gate_valve", "check_valve"):
        d = dia_in(size)
        letter = {0.5: "a", 0.75: "b"}.get(d)
        ref = {"kind": "user", "need_mat": True}
        if letter:
            ref["wage_code"] = f"SN-3.12-{letter}"
        return ref
    return {"kind": "user", "need_mat": True}
