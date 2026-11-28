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
  - by_combo: {id: {combo: {"i": [P, M2, M3], "j": [P, M2, M3]}}}  เฉพาะเสา คสล. (type column) — แรงพร้อมกันที่ปลายเสา
    รายชุดผสม ให้หน้าออกแบบตรวจทุกชุด (M4b 28 พ.ย. 2569) · i = สถานีแรก, j = สถานีสุดท้าย
  - steel_combo: {id: {combo: [[station, P, V2, V3, T, M2, M3], ...]}}  ชิ้นเหล็ก (M6 28 พ.ย. 2569) — แรงพร้อมกันรายชุดผสม
    เก็บเฉพาะสถานีวิกฤตของแต่ละชุด: ปลาย i, ปลาย j, P/M2/M3 มากสุดและน้อยสุด, |M3|/M3max+|M2|/M2max สูงสุด, |V2|, |V3| สูงสุด
    (ซ้ำกันเก็บครั้งเดียว · เรียงตามสถานี) ให้หน้าออกแบบตรวจ ASD ทุกชุด
  - frame_joints: {id: [joint, ...]}  ชิ้นเหล็กที่ SAP แบ่งเป็นหลาย element (จุดต่อกับชิ้นอื่น เช่น แปบนจันทัน) เรียงจากปลาย i → j
    จากตาราง Objects And Elements - Frames (ไม่บังคับ) · ใช้หาระยะค้ำยัน/ความยาวโก่งเดาะ และจุดวัดการโก่งตัว
  - body: {ปลายชิ้น: [จุดบนแกนชิ้นรองรับ]}  ปลายชิ้นที่วางบน/ชนชิ้นอื่น ผูกด้วย Body constraint ตอนส่งออก (sap_export._contacts)
    ใช้บอกว่าจันทันวางบนคาน/โครงถักตรงไหน (จุดรองรับของแนวชิ้น)
  - aux_joints: {joint: [x, y, z]}  จุดต่อที่ SAP สร้างเอง (ไม่มีใน nodes) จาก Objects And Elements - Joints — มีการเคลื่อนที่ใน displacements ด้วย
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
STEEL = {"steel_column", "steel_beam", "rafter", "purlin", "ridge", "hip", "valley", "truss_chord", "truss_web", "brace", "sag_rod"}


def steel_rows(rows):
    """สถานีวิกฤตของชิ้นเหล็กในชุดผสมเดียว: rows = [(station, [P, V2, V3, T, M2, M3])] → [[st, P, V2, V3, T, M2, M3]]"""
    if not rows:
        return []
    rows = sorted(rows, key=lambda x: x[0])
    keep = {0, len(rows) - 1}
    mx = [max(abs(v[k]) for _, v in rows) or 1.0 for k in range(6)]
    idx = range(len(rows))
    for k in (0, 4, 5):           # P M2 M3: ค่ามากสุดและน้อยสุด (เครื่องหมายบอกปีกที่รับแรงอัด)
        keep.add(max(idx, key=lambda i: rows[i][1][k]))
        keep.add(min(idx, key=lambda i: rows[i][1][k]))
    for k in (1, 2):              # V2 V3: ค่าสัมบูรณ์
        keep.add(max(idx, key=lambda i: abs(rows[i][1][k])))
    keep.add(max(range(len(rows)), key=lambda i: abs(rows[i][1][5]) / mx[5] + abs(rows[i][1][4]) / mx[4]))
    out, seen = [], set()
    for i in sorted(keep):
        st, v = rows[i]
        key = (round(st, 4), tuple(round(x, 2) for x in v))
        if key in seen:
            continue
        seen.add(key)
        out.append([round(st, 4)] + [round(x, 2) for x in v])
    return out


def read_tables(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = {}
    skip = {"Element Stresses - Frames", "Element Joint Forces - Frames", "Assembled Joint Masses"}   # ไม่ใช้ — ข้ามให้อ่านเร็ว
    for ws in wb.worksheets:
        if ws.title.strip() in skip:
            continue
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

    members = {x["id"] for x in m.get("members", []) if x.get("type") not in ("stiffener", "lintel")}   # เสาเอ็น/ทับหลังไม่ส่ง SAP (sap_export.SAP_SKIP)
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
    cols = {x["id"] for x in m.get("members", []) if x.get("type") == "column"}
    steel = {x["id"] for x in m.get("members", []) if x.get("type") in STEEL}
    srows = {}  # (frame, combo) -> [(station, [P..M3])]
    ends = {}   # (frame, combo) -> {"i": (station, row), "j": (station, row)}
    for r in ef:
        f = r["Frame"]
        if f not in members:
            unknown.add(f)
            continue
        if r["OutputCase"] not in use:
            continue
        if f in cols and not r.get("StepType"):
            st = float(r["Station"]); e2 = ends.setdefault((f, r["OutputCase"]), {})
            if "i" not in e2 or st < e2["i"][0]: e2["i"] = (st, r)
            if "j" not in e2 or st > e2["j"][0]: e2["j"] = (st, r)
        if f in steel and not r.get("StepType"):
            srows.setdefault((f, r["OutputCase"]), []).append((float(r["Station"]), [float(r[c]) for c in COMP]))
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
    by_combo = {}
    for (f, c), e2 in sorted(ends.items()):
        by_combo.setdefault(f, {})[c] = {k: [r4(e2[k][1][x]) for x in ("P", "M2", "M3")] for k in ("i", "j")}
    steel_combo = {}
    for (f, c), rows in sorted(srows.items()):
        steel_combo.setdefault(f, {})[c] = steel_rows(rows)
    if unknown:
        warn.append("ชิ้นส่วนใน SAP ที่ไม่มีใน .bm.json (ไม่ได้อ่าน): " + ", ".join(sorted(unknown)[:10]))
    from sap_export import Exporter
    ex = Exporter(m)
    merged = ex.merged      # ท่อนเสาในความลึกคานที่รวมเข้าตอม่อตอนส่งออก (ผลอยู่ที่ตอม่อ)
    try:
        ex.build()
        body = {k: sorted(v) for k, v in sorted(ex.body.items())}   # ปลายชิ้นที่วางบนชิ้นอื่น → จุดบนแกนชิ้นรองรับ (Body constraint)
    except Exception as e:   # noqa: BLE001
        body = {}
        warn.append("สร้างข้อมูลจุดผูก Body constraint ไม่ได้: %s" % e)
    nores = sorted(members - set(env) - set(merged))
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

    # จุดแบ่ง element ของชิ้นเหล็ก (M6)
    fjoints, aux = {}, {}
    oj, of = tables.get("Objects And Elements - Joints"), tables.get("Objects And Elements - Frames")
    if oj and of:
        xyz = {r["JointElem"]: [r4(r["GlobalX"]), r4(r["GlobalY"]), r4(r["GlobalZ"])] for r in oj["rows"]}
        ncoord = {n["id"]: [n["x"], n["y"], n["z"]] for n in m.get("nodes", [])}
        segs = {}
        for r in of["rows"]:
            if r["FrameObject"] in steel:
                segs.setdefault(r["FrameObject"], set()).update((r["ElemJtI"], r["ElemJtJ"]))
        mem = {x["id"]: x for x in m.get("members", [])}
        for f, js in segs.items():
            if len(js) <= 2:
                continue
            p0 = ncoord.get(mem[f]["i"]) or xyz.get(mem[f]["i"])
            pts = [(sum((a - b) ** 2 for a, b in zip(xyz.get(j) or ncoord.get(j), p0)), j) for j in js if (xyz.get(j) or ncoord.get(j))]
            fjoints[f] = [j for _, j in sorted(pts)]
            for j in fjoints[f]:
                if j not in nodes and j in xyz:
                    aux[j] = xyz[j]
    disp = {}
    jd = tables.get("Joint Displacements")
    if jd:
        for r in jd["rows"]:
            if (r["Joint"] in nodes or r["Joint"] in aux) and r["OutputCase"] in use:
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
    if by_combo:
        res["by_combo"] = by_combo
    if steel_combo:
        res["steel_combo"] = steel_combo
    if fjoints:
        res["frame_joints"] = fjoints
    if body:
        res["body"] = body
    if aux:
        res["aux_joints"] = aux
    if merged:
        res["merged"] = merged
    if disp:
        res["displacements"] = disp
    if not res["source"]:
        res.pop("source")
    return res, warn


def dump_model(m, path):
    """เขียน .bm.json (indent=1 ตามเดิม) แต่แถว steel_combo / displacements / aux_joints อยู่บรรทัดเดียว — ไม่ให้ไฟล์บวมเป็นแสนบรรทัด"""
    import re
    res = m.get("results") or {}
    keep = {}
    mark = lambda r: "@@%s@@" % json.dumps(r, separators=(",", ":"))
    if res.get("steel_combo"):
        keep["steel_combo"] = res["steel_combo"]
        res["steel_combo"] = {f: {c: [mark(r) for r in rows] for c, rows in d.items()} for f, d in keep["steel_combo"].items()}
    if res.get("displacements"):
        keep["displacements"] = res["displacements"]
        res["displacements"] = {j: {c: mark(v) for c, v in d.items()} for j, d in keep["displacements"].items()}
    if res.get("aux_joints"):
        keep["aux_joints"] = res["aux_joints"]
        res["aux_joints"] = {j: mark(v) for j, v in keep["aux_joints"].items()}
    try:
        txt = json.dumps(m, ensure_ascii=False, indent=1)
    finally:
        res.update(keep)
    txt = re.sub(r'"@@(\[[^"]*\])@@"', r"\1", txt)
    open(path, "w", encoding="utf-8").write(txt)


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
        dump_model(m, a.model)
        print("เขียน results ลง", a.model)


if __name__ == "__main__":
    main()
