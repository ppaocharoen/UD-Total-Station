#!/usr/bin/env python3
"""ค่าอ้างอิง (golden) ของไฟล์ตัวอย่าง ท12 — M3 (Earth 22 พ.ย. 2569: golden = ปริมาณ + ผลตรวจ ไม่รวมราคา เพราะราคาพาณิชย์เปลี่ยนทุกเดือน)

  python3 tools/golden.py examples/t12/t12.bm.json            ตรวจเทียบ golden (ต่าง = ไม่ผ่าน, exit 1)
  python3 tools/golden.py examples/t12/t12.bm.json --write    เขียน golden ใหม่ + รายงานให้ Earth ตรวจรับรอง (<ชื่อ>.golden.md)

ครอบคลุม: ถอดปริมาณทุกแถว (takeoff.py — คิดใหม่จากโมเดล และต้องตรงกับ quantities ที่เก็บในไฟล์) · เหล็กเสริมรายชิ้น ·
ข้อสมมติ/คำเตือนของตัวถอด · validate (ระดับ/error/คำเตือน/ค่าสมมติ) · clash (lib/clash.js) · แผนงาน (lib/schedule.js — ระยะเวลารายงาน)
ราคา: ไม่อยู่ใน golden — ตรวจความตรงกันเว็บ ↔ Excel ด้วย tools/e2e_xlsx.py
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import takeoff, validate  # noqa: E402

NODE_CLASH = "const C=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);" \
             "process.stdout.write(JSON.stringify(C.check(m).map(x=>({code:x.code,sev:x.sev,title:x.title,ids:[...x.ids].sort()}))))})"
# แผนงาน: ค่างานสมมติ = ปริมาณ × 137.31 (ไม่ใช้ราคาจริง) · เริ่ม 2 พ.ย. 2569 · ทำงาน จ–ส
NODE_SCHED = "const S=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);" \
             "const rows=m.quantities.items.map(r=>Object.assign({},r,{total:Math.round(r.qty*137.31*100)/100}));" \
             "const p=S.build(rows,m,{start:'2026-11-02',workdays:[1,2,3,4,5,6]});" \
             "process.stdout.write(JSON.stringify({finish:p.finish,calDays:p.calDays,tasks:p.tasks.map(t=>({id:t.id,name:t.label,days:t.days,start:t.start,end:t.finish,why:t.why}))}))})"


def node(js, lib, model):
    out = subprocess.run(["node", "-e", js, os.path.join(HERE, "..", "lib", lib)], input=json.dumps(model), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def compute(path):
    m = json.load(open(path, encoding="utf-8"))
    pm = json.load(open(os.path.join(HERE, "price_map.json"), encoding="utf-8")).get("map", {})
    settings = ((m.get("quantities") or {}).get("settings")) or None
    items, notes, _ = takeoff.run(m, settings, pm)
    row = lambda r: {k: r.get(k) for k in ("group_code", "name", "unit", "qty_net", "waste", "qty")}
    q = {r["key"]: row(r) for r in items}
    rebar = {r["key"]: r["by_src"] for r in items if r.get("by_src")}
    stored = {r["key"]: row(r) for r in ((m.get("quantities") or {}).get("items") or [])}
    v = validate.validate(m)
    g = {
        "model": os.path.basename(path), "model_hash": v["model_hash"],
        "quantities": q, "rebar_by_element": rebar, "takeoff_notes": notes,
        "validate": {k: v[k] for k in ("level", "counts", "errors", "warnings", "assumed", "missing", "next_level_blockers")},
        "clash": node(NODE_CLASH, "clash.js", m),
        "schedule": node(NODE_SCHED, "schedule.js", m),
    }
    return g, stored


def diff(a, b, path=""):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a: out.append(f"{path}/{k}: เพิ่มใหม่ = {json.dumps(b[k], ensure_ascii=False)[:160]}")
            elif k not in b: out.append(f"{path}/{k}: หายไป (เดิม {json.dumps(a[k], ensure_ascii=False)[:160]})")
            else: out += diff(a[k], b[k], f"{path}/{k}")
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)): out += diff(x, y, f"{path}[{i}]")
    elif a != b:
        out.append(f"{path}: golden {json.dumps(a, ensure_ascii=False)[:160]} → ตอนนี้ {json.dumps(b, ensure_ascii=False)[:160]}")
    return out


def report(g, path):
    L = [f"# ค่าอ้างอิง (golden) — {g['model']}", "",
         "**สถานะ: ยังไม่รับรอง** — ตรวจรับรองว่าตัวเลขเหล่านี้ถูกต้อง แล้วชุดทดสอบจะเทียบกับค่านี้ทุกครั้งที่แก้โค้ด (ไม่รวมราคา)", "",
         f"model_hash `{g['model_hash']}`", "", "## 1. ถอดปริมาณ", "", "| หมวด | รายการ | ปริมาณสุทธิ | เผื่อ | ปริมาณ | หน่วย |", "|---|---|---:|---:|---:|---|"]
    for k, r in g["quantities"].items():
        L.append(f"| {r['group_code']} | {r['name']} | {r['qty_net']:,.2f} | {(r['waste'] or 0) * 100:g}% | {r['qty']:,.2f} | {r['unit']} |")
    L += ["", "## 2. เหล็กเสริมรายชิ้น (กก. ก่อนเผื่อ)", ""]
    for k, d in g["rebar_by_element"].items():
        L.append(f"- **{g['quantities'][k]['name']}**: " + " · ".join(f"{e} {v:,.2f}" for e, v in d.items()))
    if g["takeoff_notes"]:
        L += ["", "## 3. ข้อสมมติ/คำเตือนของตัวถอดปริมาณ", ""] + [f"- {n}" for n in g["takeoff_notes"]]
    v = g["validate"]
    L += ["", "## 4. validate", "", f"- ระดับความครบ L{v['level']} · error {len(v['errors'])} · คำเตือน {len(v['warnings'])}"]
    L += [f"- error: {x}" for x in v["errors"]] + [f"- คำเตือน: {x}" for x in v["warnings"]] + [f"- ค่าสมมติ: {x}" for x in v["assumed"]]
    L += ["", "## 5. Clash", ""] + [f"- [{c['sev']}] {c['code']} {c['title']} ({', '.join(c['ids'])})" for c in g["clash"]] or ["- ไม่พบ"]
    s = g["schedule"]
    L += ["", "## 6. แผนงาน (เริ่ม 2 พ.ย. 2569 · ทำงาน จ–ส · ค่างานสมมติ)", "", f"เสร็จ {s['finish']} · ระยะสัญญา {s['calDays']} วันปฏิทิน", "",
          "| งาน | วันทำงาน | เริ่ม | เสร็จ | ที่มาระยะเวลา |", "|---|---:|---|---|---|"]
    L += [f"| {t['name']} | {t['days']} | {t['start']} | {t['end']} | {t.get('why') or ''} |" for t in s["tasks"]]
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(2)
    path = sys.argv[1]; gpath = os.path.splitext(os.path.splitext(path)[0])[0] + ".golden.json"
    g, stored = compute(path)
    bad = 0
    st = diff(stored, g["quantities"], "quantities ในไฟล์")
    if st:
        print(f"FAIL quantities ที่เก็บในไฟล์ไม่ตรงกับถอดใหม่ ({len(st)} จุด) — รัน takeoff.py --write"); [print("   ", x) for x in st[:10]]; bad += 1
    else: print(f"PASS quantities ในไฟล์ตรงกับถอดใหม่ ({len(stored)} แถว)")
    if "--write" in sys.argv:
        json.dump(g, open(gpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        report(g, gpath.replace(".json", ".md"))
        print(f"เขียน {gpath} + รายงาน .golden.md"); sys.exit(1 if bad else 0)
    if not os.path.exists(gpath): print(f"FAIL ไม่มี {gpath} — รัน --write"); sys.exit(1)
    g0 = json.load(open(gpath, encoding="utf-8"))
    for part in ("quantities", "rebar_by_element", "takeoff_notes", "validate", "clash", "schedule"):
        d = diff(g0.get(part), g[part], part)
        if d:
            bad += 1; print(f"FAIL {part} ต่างจาก golden {len(d)} จุด"); [print("   ", x) for x in d[:15]]
        else: print(f"PASS {part} ตรง golden")
    print("รวม: " + ("ผ่านทั้งหมด" if not bad else f"ไม่ผ่าน {bad} ส่วน")); sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
