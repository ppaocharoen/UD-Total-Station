"""ทดสอบ lib/matlib.js (เปลี่ยนวัสดุงานผิว → แยกแถว BOQ) เทียบกับ tools/takeoff.py
วิธี: เลือกวัสดุให้งานผิว → (ก) MatLib.apply บน quantities เดิม (ข) แก้ spec/ป้ายผิวในโมเดลแล้วรัน takeoff.py ใหม่ → ต้องได้แถวเดียวกันทุกแถว
ใช้: python tools/test_matlib.py <โมเดลที่ถอดปริมาณแล้ว.bm.json>   (เช่น ห้องน้ำ ท12 Step5.bm.json · ไม่ระบุ = examples/sample-building.bm.json)
ต้องมี node ในเครื่อง
"""
import copy
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import takeoff  # noqa: E402

JS = r"""
const M = require(process.argv[1]); let s = ''; process.stdin.on('data', d => s += d).on('end', () => {
  const a = JSON.parse(s), out = {};
  out.eff = Object.fromEntries(Object.entries(M.effective(a.model, a.sel, a.mats)).map(([k, v]) => [k, v.id]));
  out.items = M.apply(a.items, a.model, a.sel, a.mats);
  out.port = {};   // contribs(ตามแบบ) ของทุกงานผิว — ต้องเท่ากับ by_src ของ takeoff.py
  (a.model.finishes || []).forEach(f => M.contribs(f, null, a.model).forEach(c => { const k = c.key; (out.port[k] = out.port[k] || {})[f.id] = ((out.port[k] || {})[f.id] || 0) + c.q; }));
  process.stdout.write(JSON.stringify(out));
});
"""


def node_apply(model, items, sel, mats):
    lib = os.path.join(HERE, "..", "lib", "matlib.js")
    p = subprocess.run(["node", "-e", JS, os.path.abspath(lib)], input=json.dumps({"model": model, "items": items, "sel": sel, "mats": mats}),
                       capture_output=True, text=True, encoding="utf-8")
    if p.returncode:
        raise SystemExit(p.stderr)
    return json.loads(p.stdout)


def modify(model, eff, mats):
    m = copy.deepcopy(model)
    for f in m.get("finishes", []):
        mid = eff.get(f["id"])
        if not mid or f.get("counted_by") == "wall":
            continue
        mt = mats[mid]
        if f["kind"] == "struct":
            for fc in f.get("faces", []):
                if mt["cls"] == "paint":
                    fc["tag"] = "1"
                else:
                    fc["tag"], fc["spec"] = "2", mt["spec"]
        else:
            f["spec"] = mt["spec"]
    return m


def compare(a, b, tag):
    A, B = {r["key"]: r for r in a}, {r["key"]: r for r in b}
    err = []
    if set(A) != set(B):
        err.append(f"แถวไม่ตรง: เว็บเกิน {sorted(set(A) - set(B))} · takeoff เกิน {sorted(set(B) - set(A))}")
    for k in set(A) & set(B):
        x, y = A[k], B[k]
        for f in ("qty", "qty_net", "unit", "name", "group_code", "group", "task", "waste"):
            if x.get(f) != y.get(f):
                err.append(f"{k}: {f} เว็บ {x.get(f)!r} ≠ takeoff {y.get(f)!r}")
        if set(x.get("from", [])) != set(y.get("from", [])):
            err.append(f"{k}: from ต่างกัน")
        bx, by = x.get("by_src") or {}, y.get("by_src") or {}
        if set(bx) != set(by) or any(abs(bx[s] - by[s]) > 1.5e-4 for s in bx):
            err.append(f"{k}: by_src ต่างกัน")
        tx, ty = x.get("by_task") or {}, y.get("by_task") or {}
        if set(tx) != set(ty) or any(abs(tx[t]["share"] - ty[t]["share"]) > 1.5e-4 or set(tx[t]["from"]) != set(ty[t]["from"]) for t in tx):
            err.append(f"{k}: by_task ต่างกัน")
        if x.get("calc") != y.get("calc"):
            err.append(f"{k}: calc ต่างกัน")
        if x.get("spec") != y.get("spec"):
            err.append(f"{k}: spec ต่างกัน")
    print(("ผ่าน " if not err else "ไม่ผ่าน ") + tag + (f" ({len(err)} จุด)" if err else ""))
    for e in err[:12]:
        print("   ", e)
    return not err


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "examples", "sample-building.bm.json")
    model = json.load(open(path, encoding="utf-8"))
    pm = json.load(open(os.path.join(HERE, "price_map.json"), encoding="utf-8")).get("map", {})
    settings = (model.get("quantities") or {}).get("settings")
    base, _, _ = takeoff.run(model, settings, pm)
    fins = model.get("finishes", [])
    ok = True

    # 1) สูตรปริมาณที่ย้ายมาเว็บ = by_src ของ takeoff.py ทุกงานผิว
    r = node_apply(model, base, {}, {})
    bad = []
    for row in base:
        for s, v in (row.get("by_src") or {}).items():
            pv = (r["port"].get(row["key"]) or {}).get(s)
            if any(f["id"] == s and f.get("counted_by") != "wall" for f in fins) and (pv is None or abs(pv - v) > 1.5e-4):
                bad.append((row["key"], s, v, pv))
    print(("ผ่าน" if not bad else "ไม่ผ่าน") + f" สูตรปริมาณงานผิว (เทียบ by_src {sum(len(v) for v in r['port'].values())} ชิ้น-แถว)")
    for b in bad[:10]:
        print("   ", b)
    ok &= not bad

    def mat(i, cls, spec, kinds):
        return {"id": i, "name": i, "cls": cls, "kinds": kinds, "spec": spec, "look": {"pat": "tile"}}
    mats = {
        "G60": mat("G60", "clad", "พื้นปูกระเบื้องแกรนิตโต้ 60x60 ซม. ผิวด้าน", ["floor"]),
        "WT": mat("WT", "clad", "ผนังกรุกระเบื้องเซรามิค 30x60 ซม. ผิวด้าน", ["wall"]),
        "P1": mat("P1", "paint", "", ["wall"]),
        "CL": mat("CL", "clad", "ฝ้ายิปซัมบอร์ด หนา 9 มม. ฉาบเรียบ โครงเคร่าเหล็กชุบสังกะสี", ["ceiling"]),
        "CT": mat("CT", "clad", "เคาน์เตอร์ คสล. หนา 0.10 กรุหินแกรนิต", ["counter"]),
    }
    by_kind = lambda k, cond=lambda f: True: [f for f in fins if f["kind"] == k and cond(f)]
    floors, structs = by_kind("floor"), by_kind("struct", lambda f: f.get("faces"))
    tiled = by_kind("wall", lambda f: f.get("counted_by") != "wall")
    painted = by_kind("wall", lambda f: f.get("counted_by") == "wall")
    ceil, ctr = by_kind("ceiling"), by_kind("counter")
    cases = []
    if floors:
        cases.append(("พื้น 1 ชิ้น → รายการใหม่", {"piece": {floors[0]["id"]: "G60"}}))
        if len({f["spec"] for f in floors}) > 1:
            other = next(f for f in floors if f["spec"] != floors[0]["spec"])
            mats["SAME"] = mat("SAME", "clad", floors[0]["spec"], ["floor"])
            cases.append(("พื้น 1 ชิ้น → รายการที่มีอยู่แล้ว (รวมแถว)", {"piece": {other["id"]: "SAME"}}))
        cases.append(("พื้นทุกชิ้นชนิดเดียวกัน + ยกเว้น 1 ชิ้นตามแบบ", {"type": {"|".join([floors[0]["kind"], "", floors[0].get("tag", ""), floors[0]["spec"]]): "G60"},
                                                          "piece": {f["id"]: "" for f in floors[1:2] if f["spec"] == floors[0]["spec"]}}))
        cases.append(("พื้นทุกชิ้นเป็นรายการเดียว (แถวเดิมหาย)", {"piece": {f["id"]: "G60" for f in floors}}))
    if tiled:
        t0 = tiled[0]
        cases.append(("ผนังกรุทั้งชนิด", {"type": {"|".join(["wall", "", t0.get("tag", ""), t0["spec"]]): "WT"}}))
    if structs:
        cases.append(("ผิวโครงสร้าง → กรุกระเบื้อง", {"piece": {structs[0]["id"]: "WT"}}))
        mixed = [f for f in structs if len({str(fc.get("tag", "1")) for fc in f["faces"]}) > 1] or structs[-1:]
        cases.append(("ผิวโครงสร้าง (หลายป้ายผิว) → ฉาบทาสี", {"piece": {mixed[0]["id"]: "P1"}}))
        cases.append(("ผิวโครงสร้างทุกชิ้นชนิดเดียวกัน → กรุ", {"type": {"|".join(["struct", "", structs[0].get("tag", ""), structs[0]["spec"]]): "WT"}}))
    if painted:
        cases.append(("ผนังทาสี → สีอื่น (ไม่กระทบ BOQ)", {"piece": {painted[0]["id"]: "P1"}}))
    if ceil:
        cases.append(("ฝ้า", {"piece": {ceil[0]["id"]: "CL"}}))
    if ctr:
        cases.append(("เคาน์เตอร์ทุกชิ้น", {"piece": {f["id"]: "CT" for f in ctr}}))
    allsel = {"piece": {}, "type": {}}
    for _, s in cases[:1] + cases[4:]:
        for k in ("piece", "type"):
            allsel[k].update(s.get(k, {}))
    cases.append(("หลายอย่างพร้อมกัน", allsel))

    for tag, sel in cases:
        r = node_apply(model, base, sel, mats)
        if not r["eff"]:
            print("ข้าม", tag, "(ไม่มีชิ้นที่ใช้ได้)")
            continue
        exp, _, _ = takeoff.run(modify(model, r["eff"], mats), settings, pm)
        ok &= compare(r["items"], exp, f"{tag} — {len(r['eff'])} ชิ้น")
    print("\nรวม:", "ผ่านทั้งหมด" if ok else "มีข้อที่ไม่ผ่าน")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
