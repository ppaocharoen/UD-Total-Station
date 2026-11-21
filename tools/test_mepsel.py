"""ทดสอบ lib/mepsel.js (ก้อน 6e เปลี่ยนชนิดท่อ/สายทั้งระบบ) เทียบ tools/takeoff.py เมื่อแก้ชนิดในโมเดล
ใช้: python tools/test_mepsel.py [โมเดล.bm.json]   (ไม่ใส่ = examples/sample-building.bm.json)"""
import copy, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import takeoff  # noqa: E402

JS = ("const M=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);"
      "process.stdout.write(JSON.stringify(M.apply(a.items,a.sel)))})")


def node_apply(items, sel):
    p = subprocess.run(["node", "-e", JS, os.path.join(HERE, "..", "lib", "mepsel.js")], input=json.dumps({"items": items, "sel": sel}),
                       capture_output=True, text=True, encoding="utf-8")
    if p.returncode:
        raise SystemExit(p.stderr)
    return json.loads(p.stdout)


def size_of(c):
    m = re.search(r'(\d+(?:\s+\d+/\d+|/\d+)?\s*"|\d+\s*มม\.?)\s*$', c or "")
    return m.group(1) if m else ""


def modify(model, sel):
    """แก้โมเดลให้ takeoff.py ได้ผลที่ควรเป็น"""
    m = copy.deepcopy(model)
    pl = (m.get("mep") or {}).get("plumbing") or {}
    el = (m.get("mep") or {}).get("electrical") or {}
    for sysn in ("cw", "soil", "waste", "vent"):
        if sel.get(sysn):
            pl[f"{sysn}_material"] = sel[sysn]
            for p in pl.get("pipes", []):   # ทั้งระบบ = ทุกเส้น (ชนิดรายเส้นเดิมถูกแทน)
                if p.get("system") == sysn:
                    p.pop("material", None)
    if sel.get("conduit"):
        el["conduit"] = (sel["conduit"] + " " + size_of(el.get("conduit") or "")).strip()
        if el.get("service") and el["service"].get("conduit"):
            el["service"]["conduit"] = (sel["conduit"] + " " + size_of(el["service"]["conduit"])).strip()
    if sel.get("wire"):
        el["wire_type"] = sel["wire"]
        if el.get("service") and el["service"].get("wire_type"):
            el["service"]["wire_type"] = sel["wire"]
    return m


def norm(rows):
    out = {}
    for r in rows:
        pr = r.get("price_ref") or {}
        out[r["key"]] = {"qty": r["qty"], "name": r["name"], "unit": r["unit"], "spec": r.get("spec"),
                         "of": sorted(pr.get("of", [])) if pr.get("kind") == "pct" else None,
                         "by_src": {k: round(v, 3) for k, v in (r.get("by_src") or {}).items()},
                         "runs": {k: {n: round(L, 3) for n, L in d.items()} for k, d in (r.get("runs") or {}).items()}}
    return out


def compare(got, exp, tag):
    A, B = norm(got), norm(exp)
    bad = []
    for k in sorted(set(A) | set(B)):
        if k not in A or k not in B:
            bad.append((k, "ไม่มีในเว็บ" if k not in A else "ไม่มีใน takeoff"))
            continue
        for f in ("qty", "name", "unit", "spec", "of", "by_src", "runs"):
            a, b = A[k][f], B[k][f]
            if f == "qty" and abs((a or 0) - (b or 0)) <= 0.011:
                continue
            if f == "by_src" and set(a) == set(b) and all(abs(a[x] - b[x]) <= 0.002 for x in a):   # runs ปัด 4 ตำแหน่ง × จำนวนสาย
                continue
            if a != b:
                bad.append((k, f, a, b))
    print(("ผ่าน" if not bad else "ไม่ผ่าน"), tag)
    for b in bad[:8]:
        print("   ", b)
    return not bad


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "examples", "sample-building.bm.json")
    model = json.load(open(path, encoding="utf-8"))
    pm = json.load(open(os.path.join(HERE, "price_map.json"), encoding="utf-8")).get("map", {})
    settings = (model.get("quantities") or {}).get("settings")
    base, _, _ = takeoff.run(model, settings, pm)
    ok = True
    r = node_apply(base, {})
    ok &= compare(r["items"], base, "ไม่เลือกอะไร = ตามแบบ")
    cases = [("ประปา PVC → PP-R", {"cw": "PP-R"}), ("ประปา PVC ชั้น 8.5", {"cw": "PVC ชั้น 8.5"}),
             ("โสโครก ชั้น 13.5 (แยกจากน้ำทิ้ง)", {"soil": "PVC ชั้น 13.5"}), ("น้ำทิ้ง ชั้น 5", {"waste": "PVC ชั้น 5"}),
             ("ท่อร้อยสาย EMT", {"conduit": "EMT"}), ("ท่อร้อยสาย IMC", {"conduit": "IMC"}),
             ("สาย VCT หลายแกน", {"wire": "VCT"}), ("สาย NYY หลายแกน", {"wire": "NYY"}),
             ("PP-R + EMT + VCT + โสโครก 13.5 พร้อมกัน", {"cw": "PP-R", "soil": "PVC ชั้น 13.5", "conduit": "EMT", "wire": "VCT"})]
    for tag, sel in cases:
        exp, _, _ = takeoff.run(modify(model, sel), settings, pm)
        r = node_apply(base, sel)
        ok &= compare(r["items"], exp, f"6e {tag}")
    # ย้อนกลับ: โมเดล VCT → เลือก THW = โมเดล THW
    mv = modify(model, {"wire": "VCT"})
    bv, _, _ = takeoff.run(mv, settings, pm)
    if any((x.get("spec") or {}).get("t") == "wire" for x in bv):
        thw = (((model.get("mep") or {}).get("electrical") or {}).get("wire_type")) or "สายไฟ"
        r = node_apply(bv, {"wire": thw})
        ok &= compare(r["items"], base, f"6e สาย VCT (ตามแบบ) → {thw}")
    # ตัวเลือกโครงการ ค่าทดสอบท่อ (Earth 22 พ.ย. 2569): MepSel.withPipeTest(แถวตั้งต้น) = takeoff.py settings.pipe_test = true
    if any(re.match(r"^sup_SN-", x["key"]) for x in base):
        pt = subprocess.run(["node", "-e", "const M=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify(M.withPipeTest(JSON.parse(s)))))",
                             os.path.join(HERE, "..", "lib", "mepsel.js")], input=json.dumps(base), capture_output=True, text=True, encoding="utf-8")
        want, _, _ = takeoff.run(model, dict(settings or {}, pipe_test=True), pm)
        ok &= compare(json.loads(pt.stdout), want, "ค่าทดสอบท่อ (ตัวเลือกโครงการ) = takeoff pipe_test")
        ok &= [x["key"] for x in json.loads(pt.stdout)] == [x["key"] for x in want]
    # แถวสายจากตัวถอดรุ่นเก่า (ไม่มี runs) → ต้องถอดใหม่
    old = [dict(x) for x in base]
    for x in old:
        x.pop("runs", None)
    r = node_apply(old, {"wire": "VCT"})
    w = [x["key"] for x in base if (x.get("spec") or {}).get("t") == "wire" and not x["spec"].get("ground")]   # สายดินคงเป็นแกนเดียว ไม่ต้องถอดใหม่
    g = sorted(r["retake"]) == sorted(w)
    print(("ผ่าน" if g else "ไม่ผ่าน"), "6e ตัวถอดรุ่นเก่า (ไม่มี runs) → บอกให้ถอดปริมาณใหม่ ไม่แปลงเอง", "" if g else r["retake"]); ok &= g
    print("รวม:", "ผ่านทั้งหมด" if ok else "มีไม่ผ่าน")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
