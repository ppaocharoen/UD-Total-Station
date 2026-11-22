"""สร้างแปเป็นชิ้นส่วน (members type=purlin) จากข้อกำหนดแปของหลังคา (roofs[].purlin = {section, spacing})

ใช้กับหลังคาที่ยังไม่มีแปเป็นชิ้นส่วน — ตำแหน่งแปตรงกับที่ตัวถอดปริมาณ/3D วางจากข้อกำหนดทุกเส้น
(roofgeom.plane_lines: แปเส้นแรกห่างชายคา 0.05 ม. แล้ว @spacing ตามแนวลาด ยาวขอบชายคาถึงขอบชายคา)
ความยาวรวมจึงเท่าเดิม → ปริมาณเหล็ก/ทาสีกันสนิมไม่เปลี่ยน

ตำแหน่งในโมเดลเป็นตำแหน่งจริง: แนวแกนแปอยู่ใต้ผิวแผ่นหลังคาครึ่งความสูงแป (วางบนหลังจันทัน)
ตอนส่งออก SAP ตัวส่งออกจะลดแปลงไปที่แนวแกนจันทันและสร้างจุดต่อที่จุดตัดให้เอง (ไม่แก้โมเดล)

หลังคาโค้ง (curved) / custom ยังไม่รองรับ — ข้ามพร้อมเตือน

รัน: python tools/purlingen.py model.bm.json [--write]
"""
import argparse, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roofgeom import roof_planes, plane_lines, v_norm, v_cross, v_sub  # noqa: E402
from takeoff import Takeoff  # noqa: E402


def nid(x, y, z):
    return "N-%.3f_%.3f_%.3f" % (x, y, z)


def roof_r(rf):
    return Takeoff._roof_r(None, rf)


def gen(m):
    """คืน (nodes ใหม่, members ใหม่, คำเตือน)"""
    secs = {s["id"]: s for s in m.get("sections", [])}
    have = {x["id"] for x in m.get("members", [])}
    nodes_have = {n["id"] for n in m.get("nodes", [])}
    new_nodes, new_mem, warn = [], [], []
    has_purlin = any(x["type"] == "purlin" for x in m.get("members", []))
    if has_purlin:
        return [], [], ["โมเดลมีแปเป็นชิ้นส่วนอยู่แล้ว — ไม่สร้างซ้ำ"]
    rafters = [x for x in m.get("members", []) if x["type"] == "rafter"]
    for rf in m.get("roofs", []):
        sp = rf.get("purlin")
        if not sp or not sp.get("spacing"):
            continue
        if rf["form"] in ("curved", "custom"):
            warn.append("หลังคา %s แบบ %s: ยังไม่สร้างแปอัตโนมัติ" % (rf["id"], rf["form"]))
            continue
        sec = secs.get(sp["section"])
        if not sec:
            warn.append("หลังคา %s: ไม่พบหน้าตัดแป %s" % (rf["id"], sp["section"]))
            continue
        ph = (sec.get("dims") or {}).get("h") or sec.get("h") or 0.05
        mat = next((x.get("material") for x in rafters if x.get("material")), None) or "CF"
        k = 0
        for pl in roof_planes(roof_r(rf)):
            if len(pl) < 3:
                continue
            n = v_norm(v_cross(v_sub(pl[1], pl[0]), v_sub(pl[2], pl[0])))
            if n[1] < 0:
                n = [-c for c in n]
            off = ph / 2
            for a, b in plane_lines(pl, sp["spacing"], "u", rf["eave"]):
                # พิกัด roofgeom [x, สูง, y] → .bm.json (x, y, z) แล้วลดลงตามแนวตั้งฉากผิวหลังคา
                pa = (a[0] - n[0] * off, a[2] - n[2] * off, a[1] - n[1] * off)
                pb = (b[0] - n[0] * off, b[2] - n[2] * off, b[1] - n[1] * off)
                k += 1
                ids = []
                for p in (pa, pb):
                    i = nid(*p)
                    if i not in nodes_have:
                        nodes_have.add(i)
                        new_nodes.append({"id": i, "x": round(p[0], 4), "y": round(p[1], 4), "z": round(p[2], 4)})
                    ids.append(i)
                mid = "PL-%s-%02d" % (rf["id"], k)
                while mid in have:
                    mid += "x"
                have.add(mid)
                new_mem.append({"id": mid, "type": "purlin", "i": ids[0], "j": ids[1], "section": sp["section"],
                                "material": mat, "status": "computed",
                                "src": "สร้างจากข้อกำหนดแปหลังคา %s (%s @%g ม.) — tools/purlingen.py" % (rf["id"], sp["section"], sp["spacing"]),
                                "note": "วางบนหลังจันทัน แนวแกนต่ำกว่าผิวแผ่นหลังคา %.4f ม." % off})
    return new_nodes, new_mem, warn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--write", action="store_true", help="เขียนกลับลงไฟล์โมเดล")
    a = ap.parse_args()
    m = json.load(open(a.model, encoding="utf-8"))
    nn, mm, warn = gen(m)
    for w in warn:
        print("เตือน:", w)
    L = 0.0
    N = {n["id"]: n for n in m.get("nodes", []) + nn}
    for x in mm:
        p, q = N[x["i"]], N[x["j"]]
        L += math.dist((p["x"], p["y"], p["z"]), (q["x"], q["y"], q["z"]))
    print("แปใหม่ %d เส้น ยาวรวม %.2f ม. · จุดใหม่ %d" % (len(mm), L, len(nn)))
    if a.write and mm:
        m.setdefault("nodes", []).extend(nn)
        m.setdefault("members", []).extend(mm)
        json.dump(m, open(a.model, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("เขียนแล้ว:", a.model)


if __name__ == "__main__":
    main()
