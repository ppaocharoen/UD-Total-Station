"""อ่านผลวิเคราะห์ SAP2000 (ไฟล์ Excel จาก File > Export > MS Excel Spreadsheet) กลับเข้า .bm.json ส่วน results

ตารางที่ต้องเลือกตอน export (Analysis Results):
  - Joint Output > Reactions            (จำเป็น)
  - Element Output > Frame Output > Element Forces - Frames   (จำเป็น)
  - Joint Output > Displacements        (ไม่บังคับ)
  - Program Control (SAP ใส่ให้เอง) ใช้ตรวจหน่วยต้องเป็น Kgf, m, C

สิ่งที่เขียนลง results
  - members: {id: {P, V2, V3, T, M2, M3: {max, min, at_max, at_min, combo_max, combo_min}}}
    ห่อหุ้มจากชุดผสม (combos ใน .bm.json) ถ้ามี; ถ้าไม่มีชุดผสมเลยใช้ทุก load case
    at_* = ระยะจากปลาย i (ม.) ตามสถานีของ SAP
  - reactions: {joint: {case/combo: [F1, F2, F3, M1, M2, M3]}}  ทุก case และ combo
  - displacements: {joint: {combo: [U1, U2, U3]}}  เฉพาะชุดผสม (หรือทุก case ถ้าไม่มีชุดผสม)
  - model_hash: จากไฟล์ประกอบ .sap.json ที่ตัวส่งออกเขียนไว้ (ถ้าไม่มีใช้ hash ปัจจุบันพร้อมเตือน)

รัน: python tools/sap_results.py model.bm.json results.xlsx [--sidecar x.sap.json] [--write]
"""
import argparse, json, os, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validate import model_hash  # noqa: E402

COMP = ["P", "V2", "V3", "T", "M2", "M3"]


def read_tables(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 3:
            continue
        head = [h for h in rows[1] if h is not None]
        data = []
        for r in rows[3:]:
            if r[0] is None:
                continue
            data.append(dict(zip(head, r)))
        out[ws.title.strip()] = {"head": head, "units": rows[2][:len(head)], "rows": data}
    return out


def r4(x):
    return round(float(x), 4)


def build(m, tables, sidecar=None):
    warn = []
    pc = tables.get("Program Control")
    if pc and pc["rows"]:
        u = pc["rows"][0].get("CurrUnits")
        if u and u.replace(" ", "") != "Kgf,m,C":
            raise SystemExit("หน่วยใน SAP เป็น %s — ต้องตั้ง Kgf, m, C ก่อน export" % u)
    else:
        warn.append("ไม่มีตาราง Program Control ตรวจหน่วยไม่ได้ (สมมติ Kgf, m, C)")
    for need in ("Element Forces - Frames", "Joint Reactions"):
        if need not in tables:
            raise SystemExit("ไม่พบตาราง %s ในไฟล์ Excel" % need)

    members = {x["id"] for x in m.get("members", [])}
    nodes = {n["id"] for n in m.get("nodes", [])}
    combos = [c["id"] for c in m.get("combos", [])]
    ef = tables["Element Forces - Frames"]["rows"]
    cases_seen = sorted({r["OutputCase"] for r in ef})
    use = [c for c in combos if c in cases_seen] or cases_seen
    miss = [c for c in combos if c not in cases_seen]
    if miss:
        warn.append("ชุดผสมใน .bm.json ไม่มีในผล SAP: " + ", ".join(miss))
    if not combos:
        warn.append("ไม่มีชุดผสมใน .bm.json — ห่อหุ้มจากทุก load case")

    env = {}
    unknown = set()
    for r in ef:
        f = r["Frame"]
        if f not in members:
            unknown.add(f)
            continue
        if r["OutputCase"] not in use:
            continue
        # ชุดผสมแบบ envelope ใน SAP มี StepType Max/Min; แบบ linear add มีบรรทัดเดียว
        e = env.setdefault(f, {})
        for c in COMP:
            v = float(r[c])
            d = e.setdefault(c, {"max": v, "min": v, "at_max": r["Station"], "at_min": r["Station"],
                                 "combo_max": r["OutputCase"], "combo_min": r["OutputCase"]})
            if v > d["max"]:
                d.update(max=v, at_max=r["Station"], combo_max=r["OutputCase"])
            if v < d["min"]:
                d.update(min=v, at_min=r["Station"], combo_min=r["OutputCase"])
    for f in env.values():
        for d in f.values():
            for k in ("max", "min", "at_max", "at_min"):
                d[k] = r4(d[k])
    if unknown:
        warn.append("ชิ้นส่วนใน SAP ที่ไม่มีใน .bm.json (ไม่ได้อ่าน): " + ", ".join(sorted(unknown)[:10]))
    nores = sorted(members - set(env))
    if nores:
        warn.append("ชิ้นส่วนที่ไม่มีผล: " + ", ".join(nores[:10]))

    reac = {}
    for r in tables["Joint Reactions"]["rows"]:
        j = r["Joint"]
        if j not in nodes:
            unknown.add(j)
            continue
        key = r["OutputCase"] + ("" if not r.get("StepType") else "/" + str(r["StepType"]))
        reac.setdefault(j, {})[key] = [r4(r[k]) for k in ("F1", "F2", "F3", "M1", "M2", "M3")]

    disp = {}
    jd = tables.get("Joint Displacements")
    if jd:
        for r in jd["rows"]:
            if r["Joint"] in nodes and r["OutputCase"] in use:
                key = r["OutputCase"] + ("" if not r.get("StepType") else "/" + str(r["StepType"]))
                disp.setdefault(r["Joint"], {})[key] = [round(float(r[k]), 6) for k in ("U1", "U2", "U3")]

    h_now = model_hash(m)
    if sidecar:
        h = sidecar["model_hash"]
        if h != h_now:
            warn.append("โมเดลถูกแก้หลังส่งออกไป SAP — ผลนี้จะถูกนับว่าเก่า (stale) จนกว่าจะวิเคราะห์ใหม่")
    else:
        h = h_now
        warn.append("ไม่พบไฟล์ .sap.json — ใช้ hash ปัจจุบัน ต้องแน่ใจว่าวิเคราะห์จากโมเดลล่าสุด")
    res = {"source": sidecar.get("s2k") if sidecar else None, "analyzed_at": datetime.now().isoformat(timespec="seconds"),
           "model_hash": h, "stale": h != h_now, "cases_used": use, "members": env, "reactions": reac}
    if disp:
        res["displacements"] = disp
    if not res["source"]:
        res.pop("source")
    return res, warn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("xlsx")
    ap.add_argument("--sidecar", help="ไฟล์ .sap.json จากตัวส่งออก (ค่าเริ่มต้น: ชื่อเดียวกับ xlsx หรือ model)")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    m = json.load(open(a.model, encoding="utf-8"))
    side = a.sidecar
    if not side:
        for cand in (os.path.splitext(a.xlsx)[0] + ".sap.json",
                     os.path.splitext(os.path.splitext(a.model)[0])[0] + ".sap.json"):
            if os.path.exists(cand):
                side = cand
                break
    sc = json.load(open(side, encoding="utf-8")) if side else None
    res, warn = build(m, read_tables(a.xlsx), sc)
    print("อ่านผล %d ชิ้นส่วน, แรงปฏิกิริยา %d จุด, ห่อหุ้มจาก %s" % (len(res["members"]), len(res["reactions"]),
                                                                   ", ".join(res["cases_used"])))
    for w in warn:
        print("  ! " + w)
    if a.write:
        m["results"] = res
        json.dump(m, open(a.model, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("เขียน results ลง", a.model)


if __name__ == "__main__":
    main()
