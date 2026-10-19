#!/usr/bin/env python3
"""ตรวจไฟล์โมเดลกลาง .bm.json

    python tools/validate.py <โครงการ>.bm.json [--json] [--write-stale]

ตรวจ 4 ชั้น:
  1. รูปแบบตาม schema/bm.schema.json
  2. id ไม่ซ้ำ และทุกการอ้างอิงชี้ไปของที่มีอยู่จริง
  3. กฎของงาน (f'c ห้ามสมมติ, ชิ้นส่วนยาวศูนย์, ช่องเปิดเกินผนัง ฯลฯ)
  4. ระดับความครบ L0–L3, ค่าที่เป็น assumed / missing, และผลวิเคราะห์/ออกแบบ/ปริมาณที่เก่า (stale)

--write-stale  เขียนธง stale ของ results / design / quantities กลับลงไฟล์ตาม model_hash ปัจจุบัน
exit code: 0 = ไม่มี error, 1 = มี error
"""
import argparse, hashlib, json, math, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = os.path.join(HERE, "..", "schema", "bm.schema.json")

# ส่วนที่ถ้าเปลี่ยน ผลวิเคราะห์/ออกแบบ/ปริมาณเดิมใช้ไม่ได้
HASH_SECTIONS = ["grids", "levels", "materials", "sections", "nodes", "members", "supports",
                 "slabs", "walls", "opening_types", "openings", "roofs", "stairs", "loads", "combos"]
# ส่วนที่มีผลต่อปริมาณแต่ไม่กระทบผลวิเคราะห์
QTY_EXTRA = ["finishes", "mep", "demolition", "design"]

RC_TYPES = {"column", "beam", "tie_beam", "lintel", "stiffener"}
ELEMENT_LISTS = ["nodes", "members", "supports", "slabs", "walls", "openings", "roofs", "stairs",
                 "finishes", "demolition"]


def canonical_hash(model, sections):
    blob = {k: model.get(k) for k in sections}
    s = json.dumps(blob, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def model_hash(model):
    return canonical_hash(model, HASH_SECTIONS)


def qty_hash(model):
    return canonical_hash(model, HASH_SECTIONS + QTY_EXTRA)


def qty_base_hash(model):
    """ส่วนที่มีผลต่อปริมาณ ยกเว้น design — เว็บถอดเหล็กเสริมใหม่ได้เอง (lib/rebartk.js) แล้วเขียน design_hash ใหม่"""
    return canonical_hash(model, HASH_SECTIONS + [k for k in QTY_EXTRA if k != "design"])


def design_hash(model):
    return canonical_hash(model, ["design"])


class Report:
    def __init__(self):
        self.errors, self.warnings, self.flags = [], [], []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def check_schema(model, rep):
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        rep.warn("schema", "ไม่มีแพ็กเกจ jsonschema — ข้ามการตรวจรูปแบบ (pip install jsonschema)")
        return
    schema = json.load(open(SCHEMA, encoding="utf-8"))
    v = Draft202012Validator(schema)
    for e in sorted(v.iter_errors(model), key=lambda e: list(e.path)):
        path = "/".join(str(p) for p in e.path) or "(root)"
        rep.err(f"schema {path}", e.message[:200])


def check_refs(m, rep):
    # --- id ไม่ซ้ำ ---
    seen = Counter()
    for lst in ELEMENT_LISTS:
        for el in m.get(lst, []) or []:
            if "id" in el:
                seen[el["id"]] += 1
    for el in ((m.get("site") or {}).get("existing") or {}).get("structures", []) or []:
        seen[el.get("id")] += 1
    loads = m.get("loads") or {}
    for k in ("area_loads", "member_loads", "node_loads"):
        for el in loads.get(k, []) or []:
            seen[el.get("id")] += 1
    for i, c in seen.items():
        if c > 1:
            rep.err("id", f"'{i}' ซ้ำ {c} ครั้ง")
    for name, lst in (("materials", m.get("materials")), ("sections", m.get("sections")),
                      ("loads.patterns", loads.get("patterns")), ("combos", m.get("combos"))):
        for i, c in Counter(x.get("id") for x in lst or []).items():
            if c > 1:
                rep.err(name, f"'{i}' ซ้ำ {c} ครั้ง")
    for i, c in Counter((g.get("axis"), g.get("name")) for g in m.get("grids", [])).items():
        if c > 1:
            rep.err("grids", f"กริด {i[1]} แกน {i[0]} ซ้ำ")
    levels = {l["name"]: l["z"] for l in m.get("levels", []) if "name" in l}
    if "GL" not in levels:
        rep.err("levels", "ต้องมีระดับ GL")

    nodes = {n["id"]: n for n in m.get("nodes", []) if "id" in n}
    members = {x["id"]: x for x in m.get("members", []) if "id" in x}
    mats = {x["id"]: x for x in m.get("materials", []) if "id" in x}
    secs = {x["id"]: x for x in m.get("sections", []) if "id" in x}
    slabs = {x["id"] for x in m.get("slabs", [])}
    roofs = {x["id"] for x in m.get("roofs", [])}
    walls = {x["id"]: x for x in m.get("walls", [])}
    supports = {x["id"] for x in m.get("supports", [])}
    patterns = {p["id"] for p in loads.get("patterns", []) or []}
    otypes = m.get("opening_types", {}) or {}
    existing = {s.get("id") for s in ((m.get("site") or {}).get("existing") or {}).get("structures", []) or []}
    all_elem = set(seen)
    mep = m.get("mep") or {}
    for grp, keys in (("electrical", ("panels", "points")), ("plumbing", ("fixtures", "pipes", "equipment"))):
        for k in keys:
            all_elem |= {x.get("id") for x in (mep.get(grp) or {}).get(k, []) if x.get("id")}

    def need(where, ref, pool, what):
        if ref is not None and ref not in pool:
            rep.err(where, f"อ้าง {what} '{ref}' ที่ไม่มีอยู่")

    for n in m.get("nodes", []):
        if n.get("level"):
            need(f"nodes/{n['id']}", n["level"], levels, "level")
    for x in m.get("members", []):
        w = f"members/{x.get('id')}"
        need(w, x.get("i"), nodes, "node")
        need(w, x.get("j"), nodes, "node")
        need(w, x.get("section"), secs, "section")
        need(w, x.get("material"), mats, "material")
        if x.get("level"):
            need(w, x["level"], levels, "level")
        a, b = nodes.get(x.get("i")), nodes.get(x.get("j"))
        if a and b:
            L = math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]))
            if L < 1e-6:
                rep.err(w, "ความยาวเป็นศูนย์ (i = j)")
        if x.get("type") in RC_TYPES and x.get("material") in mats and mats[x["material"]].get("kind") != "concrete":
            rep.warn(w, f"ชิ้นส่วน {x['type']} ใช้วัสดุที่ไม่ใช่คอนกรีต")
    for s in m.get("supports", []):
        need(f"supports/{s.get('id')}", s.get("node"), nodes, "node")
        need(f"supports/{s.get('id')}", s.get("material"), mats, "material")
    for s in m.get("slabs", []):
        need(f"slabs/{s.get('id')}", s.get("material"), mats, "material")
        if s.get("level"):
            need(f"slabs/{s.get('id')}", s["level"], levels, "level")
    for wl in m.get("walls", []):
        w = f"walls/{wl.get('id')}"
        need(w, wl.get("on_member"), members, "member")
        if wl.get("top") is not None and wl.get("bottom") is not None and wl["top"] <= wl["bottom"]:
            rep.err(w, "ระดับบนต่ำกว่าหรือเท่าระดับล่าง")
    for o in m.get("openings", []):
        w = f"openings/{o.get('id')}"
        need(w, o.get("wall"), walls, "wall")
        need(w, o.get("type"), otypes, "opening_type")
        wl, t = walls.get(o.get("wall")), otypes.get(o.get("type"))
        if wl and t:
            pts = wl["path"]
            length = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1))
            if o["at"] - t["w"] / 2 < -1e-6 or o["at"] + t["w"] / 2 > length + 1e-6:
                rep.err(w, f"ช่องเปิดกว้าง {t['w']} ที่ระยะ {o['at']} เกินความยาวผนัง {length:.2f} ม.")
            if t.get("sill", 0) + t["h"] > wl["top"] - wl["bottom"] + 1e-6:
                rep.err(w, "ช่องเปิดสูงเกินผนัง")
    for r in m.get("roofs", []):
        for part in ("rafter", "purlin"):
            if r.get(part):
                need(f"roofs/{r.get('id')}", r[part].get("section"), secs, "section")
    for d in m.get("demolition", []):
        need(f"demolition/{d.get('id')}", d.get("structure"), existing, "existing structure")

    # --- น้ำหนักและ combo ---
    for a in loads.get("area_loads", []) or []:
        w = f"loads/area_loads/{a.get('id')}"
        need(w, a.get("pattern"), patterns, "pattern")
        for t in a.get("targets", []):
            need(w, t, slabs | roofs, "slab/roof")
    for a in loads.get("member_loads", []) or []:
        w = f"loads/member_loads/{a.get('id')}"
        need(w, a.get("pattern"), patterns, "pattern")
        need(w, a.get("member"), members, "member")
    for a in loads.get("node_loads", []) or []:
        w = f"loads/node_loads/{a.get('id')}"
        need(w, a.get("pattern"), patterns, "pattern")
        need(w, a.get("node"), nodes, "node")
    for c in m.get("combos", []) or []:
        for p in c.get("factors", {}):
            need(f"combos/{c.get('id')}", p, patterns, "pattern")

    # --- ผล / ออกแบบ / ปริมาณ ---
    res = m.get("results") or {}
    for k in (res.get("members") or {}):
        need("results/members", k, members, "member")
    for k in (res.get("reactions") or {}):
        need("results/reactions", k, nodes, "node")
    des = m.get("design") or {}
    for k in (des.get("members") or {}):
        need("design/members", k, members, "member")
    for k in (des.get("supports") or {}):
        need("design/supports", k, supports, "support")
    for k in (des.get("slabs") or {}):
        need("design/slabs", k, slabs, "slab")
    for it in ((m.get("quantities") or {}).get("items") or []):
        for f in it.get("from", []):
            need(f"quantities/{it.get('key')}", f, all_elem, "element")

    # --- งานระบบ ---
    el = ((m.get("mep") or {}).get("electrical")) or {}
    panels = {p["id"] for p in el.get("panels", [])}
    circuits = {c["id"] for c in el.get("circuits", [])}
    ptypes = set((el.get("point_types") or {}).keys())
    for c in el.get("circuits", []):
        need(f"mep/electrical/circuits/{c['id']}", c.get("panel"), panels, "panel")
    for i, p in enumerate(el.get("points", [])):
        need(f"mep/electrical/points[{i}]", p.get("type"), ptypes, "point_type")
        need(f"mep/electrical/points[{i}]", p.get("circuit"), circuits, "circuit")
    pl = ((m.get("mep") or {}).get("plumbing")) or {}
    ftypes = set((pl.get("fixture_types") or {}).keys())
    for i, f in enumerate(pl.get("fixtures", [])):
        need(f"mep/plumbing/fixtures[{i}]", f.get("type"), ftypes, "fixture_type")
    return dict(nodes=nodes, members=members, mats=mats, secs=secs, patterns=patterns, supports=supports)


def collect_status(m):
    """คืนรายการ (ที่อยู่, ฟิลด์, status, note) ของค่าที่เป็น assumed / missing"""
    out = []

    def visit(where, el):
        if not isinstance(el, dict):
            return
        st = el.get("status")
        if st in ("assumed", "missing"):
            out.append((where, "*", st, el.get("note", "")))
        for f, info in (el.get("field_status") or {}).items():
            if info.get("status") in ("assumed", "missing"):
                out.append((where, f, info["status"], info.get("note", "")))

    visit("site", m.get("site") or {})
    for s in ((m.get("site") or {}).get("existing") or {}).get("structures", []) or []:
        visit(f"site/existing/{s.get('id')}", s)
    for lst in ["materials", "sections"] + ELEMENT_LISTS:
        for el in m.get(lst, []) or []:
            visit(f"{lst}/{el.get('id')}", el)
    loads = m.get("loads") or {}
    for k in ("area_loads", "member_loads", "node_loads"):
        for el in loads.get(k, []) or []:
            visit(f"loads/{k}/{el.get('id')}", el)
    if loads.get("wind"):
        visit("loads/wind", loads["wind"])
    for part in ("members", "supports", "slabs"):
        for k, el in ((m.get("design") or {}).get(part) or {}).items():
            visit(f"design/{part}/{k}", el)
    for el in ((m.get("quantities") or {}).get("items") or []):
        visit(f"quantities/{el.get('key')}", el)
    return out


def check_rules(m, ctx, rep, flagged):
    # f'c ถามทุกครั้ง ห้ามสมมติ
    for mat in m.get("materials", []):
        if mat.get("kind") != "concrete":
            continue
        st = ((mat.get("field_status") or {}).get("fc") or {}).get("status", mat.get("status"))
        if st in ("assumed", None):
            rep.err(f"materials/{mat.get('id')}", "f'c ต้องมาจากแบบหรือ Earth กำหนด ห้ามสมมติ (ตั้ง status เป็น from_drawing หรือ user)")
        if st == "missing":
            rep.err(f"materials/{mat.get('id')}", "f'c ยังไม่มี — ต้องถามก่อน")
    for where, f, st, note in flagged:
        if st == "missing":
            rep.warn(where, f"ค่า{'' if f == '*' else ' ' + f} ยังไม่มี (missing){' — ' + note if note else ''}")


def completeness(m, ctx, flagged, stale):
    """คืน (ระดับสูงสุดที่ผ่าน, เหตุผลที่ขั้นถัดไปยังไม่ผ่าน)"""
    missing_where = {w.split("/")[0] for w, f, st, _ in flagged if st == "missing"}
    members = m.get("members", [])
    # L0 เรขาคณิต
    l0 = []
    if not m.get("grids"): l0.append("ไม่มีกริด")
    if not m.get("levels"): l0.append("ไม่มีระดับ")
    if not members and not m.get("walls"): l0.append("ไม่มีชิ้นส่วน")
    if missing_where & {"nodes", "members", "walls", "slabs"}: l0.append("มีเรขาคณิตที่ยัง missing")
    if l0: return -1, l0
    # L1 พร้อมวิเคราะห์
    l1 = []
    if not members: l1.append("ไม่มี members")
    if not m.get("supports"): l1.append("ไม่มีจุดรองรับ (supports)")
    if any(not x.get("material") for x in members): l1.append("มีชิ้นส่วนไม่ระบุวัสดุ")
    loads = m.get("loads") or {}
    if not loads.get("patterns"): l1.append("ไม่มี load pattern")
    if not m.get("combos"): l1.append("ไม่มี combo")
    if missing_where & {"materials", "sections", "supports", "loads"}: l1.append("มีวัสดุ/หน้าตัด/ฐานราก/น้ำหนักที่ยัง missing")
    if l1: return 0, l1
    # L2 พร้อมออกแบบ
    l2 = []
    res = m.get("results") or {}
    if not res.get("members"): l2.append("ยังไม่มีผลวิเคราะห์")
    elif stale["results"]: l2.append("ผลวิเคราะห์เก่า (โมเดลเปลี่ยนหลังวิเคราะห์)")
    else:
        lack = [x["id"] for x in members if x["id"] not in res["members"]]
        if lack: l2.append(f"ไม่มีผลวิเคราะห์ของ {len(lack)} ชิ้น เช่น {', '.join(lack[:3])}")
    if l2: return 1, l2
    # L3 พร้อมส่งมอบ
    l3 = []
    des = m.get("design") or {}
    dm = des.get("members") or {}
    if stale["design"]: l3.append("ผลออกแบบเก่า")
    rc = [x["id"] for x in members if x.get("type") in RC_TYPES]
    lack = [i for i in rc if not (dm.get(i) or {}).get("rebar")]
    if lack: l3.append(f"ชิ้นส่วน คสล. ยังไม่มีเหล็กเสริม {len(lack)} ชิ้น เช่น {', '.join(lack[:3])}")
    ds = des.get("supports") or {}
    lack = [s["id"] for s in m.get("supports", []) if not (ds.get(s["id"]) or {}).get("rebar")]
    if lack: l3.append(f"ฐานรากยังไม่มีเหล็กเสริม {len(lack)} ฐาน")
    if l3: return 2, l3
    return 3, []


def staleness(m):
    h, hq = model_hash(m), qty_hash(m)
    res, des, qty = m.get("results") or {}, m.get("design") or {}, m.get("quantities") or {}
    def is_stale(sec, ref):
        if not sec: return False
        if sec.get("model_hash"): return sec["model_hash"] != ref
        return bool(sec.get("stale"))
    if qty.get("base_hash") and qty.get("design_hash"):   # แยก 2 ส่วน: เว็บอัปเดตเหล็กเสริมหลังออกแบบได้
        q_stale = qty["base_hash"] != qty_base_hash(m) or qty["design_hash"] != design_hash(m)
    else:
        q_stale = is_stale(qty, hq)
    return h, hq, {"results": is_stale(res, h), "design": is_stale(des, h), "quantities": q_stale}


def validate(model):
    rep = Report()
    check_schema(model, rep)
    ctx = check_refs(model, rep)
    flagged = collect_status(model)
    check_rules(model, ctx, rep, flagged)
    h, hq, stale = staleness(model)
    level, why = completeness(model, ctx, flagged, stale)
    return {
        "errors": rep.errors, "warnings": rep.warnings,
        "assumed": [f"{w}{'' if f == '*' else '.' + f}" + (f" — {n}" if n else "") for w, f, st, n in flagged if st == "assumed"],
        "missing": [f"{w}{'' if f == '*' else '.' + f}" + (f" — {n}" if n else "") for w, f, st, n in flagged if st == "missing"],
        "model_hash": h, "quantity_hash": hq, "stale": stale,
        "level": level, "next_level_blockers": why,
        "counts": {k: len(model.get(k) or []) for k in ("nodes", "members", "supports", "slabs", "walls", "openings", "roofs", "finishes")},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--json", action="store_true", help="พิมพ์ผลเป็น JSON")
    ap.add_argument("--write-stale", action="store_true", help="เขียนธง stale กลับลงไฟล์")
    a = ap.parse_args()
    model = json.load(open(a.file, encoding="utf-8"))
    r = validate(model)
    if a.write_stale:
        for k in ("results", "design", "quantities"):
            if model.get(k):
                model[k]["stale"] = r["stale"][k]
        json.dump(model, open(a.file, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        names = {-1: "ยังไม่ถึง L0", 0: "L0 เรขาคณิต", 1: "L1 พร้อมวิเคราะห์", 2: "L2 พร้อมออกแบบ", 3: "L3 พร้อมส่งมอบ"}
        print(f"ไฟล์: {a.file}")
        print(f"จำนวน: " + ", ".join(f"{k} {v}" for k, v in r["counts"].items()))
        print(f"ระดับความครบ: {names[r['level']]}")
        for b in r["next_level_blockers"]:
            print(f"  ขั้นถัดไปยังไม่ผ่าน: {b}")
        print(f"model_hash: {r['model_hash']}  stale: " + ", ".join(f"{k}={'ใช่' if v else 'ไม่'}" for k, v in r["stale"].items()))
        for title, key in (("ERROR", "errors"), ("คำเตือน", "warnings"), ("ค่าสมมติ (assumed)", "assumed"), ("ค่าที่ขาด (missing)", "missing")):
            if r[key]:
                print(f"\n{title} {len(r[key])} รายการ")
                for x in r[key]:
                    print(f"  - {x}")
        print("\nผ่าน" if not r["errors"] else f"\nไม่ผ่าน: {len(r['errors'])} error")
    sys.exit(1 if r["errors"] else 0)


if __name__ == "__main__":
    main()
