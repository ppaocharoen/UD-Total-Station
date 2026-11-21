"""ทดสอบ lib/matlib.js (เปลี่ยนวัสดุงานผิว → แยกแถว BOQ) เทียบกับ tools/takeoff.py
วิธี: เลือกวัสดุให้งานผิว → (ก) MatLib.apply บน quantities เดิม (ข) แก้ spec/ป้ายผิวในโมเดลแล้วรัน takeoff.py ใหม่ → ต้องได้แถวเดียวกันทุกแถว
ใช้: python tools/test_matlib.py <โมเดลที่ถอดปริมาณแล้ว.bm.json>   (เช่น ห้องน้ำ ท12 Step5.bm.json · ไม่ระบุ = examples/sample-building.bm.json)
ต้องมี node ในเครื่อง
"""
import copy
import json
import os
import re
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
  out.side = {}; out.need = M.needSide(a.model, a.sel, a.mats, a.items);   // 6b: ด้านของชิ้นที่สลับ ทาสี ↔ กรุ
  const E = M.effective(a.model, a.sel, a.mats);
  (a.model.finishes || []).forEach(f => { if (E[f.id] && M.swapMode(f, E[f.id])) out.side[f.id] = M.sideOf(f, E[f.id], a.model, a.sel, a.items); });
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


def modify(model, eff, mats, side=None, base=None):
    """แก้โมเดลให้ takeoff.py ได้ผลที่ควรเป็น · 6b: ทาสี ↔ กรุ แก้ counted_by/tag/spec ของชิ้น + plaster_area/paint_area ของผนัง"""
    m = copy.deepcopy(model)
    walls = {w["id"]: w for w in m.get("walls", [])}

    def areas(w, kind):   # พื้นที่ฉาบ/ทาสีปัจจุบันของผนัง (ไม่มีค่า → ค่าเริ่มจาก by_src ของ takeoff)
        fld = "plaster_area" if kind == "plaster" else "paint_area"
        if w.get(kind) and w.get(fld):
            return w[fld]
        pat = r"^plaster_(int|ext)_" if kind == "plaster" else r"^paint_(int|ext)$"
        out = {"int": 0.0, "ext": 0.0}
        if w.get(kind):
            for r in base or []:
                mm = re.match(pat, r["key"])
                if mm and w["id"] in (r.get("by_src") or {}):
                    out[mm.group(1)] += r["by_src"][w["id"]]
        w[fld] = out
        return out
    for rf in m.get("roofs", []):   # 6c: แผ่นมุง → cover_spec · ฉนวนตามวัสดุ
        mid = eff.get(rf["id"])
        if not mid:
            continue
        mt = mats[mid]
        rf["cover_spec"] = mt["spec"]
        ins = mt.get("ins") or {"mode": "keep"}
        if ins["mode"] == "none":
            rf.pop("insulation", None)
        elif ins["mode"] == "set":
            rf["insulation"] = ins["desc"]
    for f in m.get("finishes", []):
        mid = eff.get(f["id"])
        if not mid:
            continue
        mt = mats[mid]
        sd = (side or {}).get(f["id"])
        if f.get("counted_by") == "wall" and mt["cls"] == "clad":   # ทาสี → กรุ
            if not sd:
                continue
            w = walls[f["wall"]]
            for kind in ("plaster", "paint"):
                if w.get(kind):
                    a = areas(w, kind); a[sd] = round(a.get(sd, 0) - f["qty"], 9)
            del f["counted_by"]; f["tag"] = "2"; f["spec"] = mt["spec"]
            continue
        if f.get("counted_by") == "wall":
            continue
        if f["kind"] == "wall" and f.get("wall") and mt["cls"] == "paint":   # กรุ → ทาสี
            if not sd:
                continue
            w = walls[f["wall"]]
            for kind in ("plaster", "paint"):
                a = areas(w, kind); a[sd] = round(a.get(sd, 0) + f["qty"], 9); w[kind] = True
            f["counted_by"] = "wall"; f["tag"] = "1"
            continue
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


def roof_cases(model, settings, pm):
    """6c แผ่นมุงหลังคา + ครอบ/เชิงชาย — ทั้งโมเดลตามแบบ และโมเดลที่ใส่ฉนวน/ข้อความรายการไว้แล้ว"""
    roofs = [r for r in model.get("roofs", []) if r.get("cover") != "concrete_deck"]
    if not roofs:
        print("ข้าม 6c (ไม่มีหลังคา)")
        return True
    ok = True
    r0 = roofs[0]
    def rm(i, spec, ins, cover=None):
        return {"id": i, "name": i, "cls": "roof", "kinds": [], "cover": cover or r0["cover"], "spec": spec, "ins": ins, "look": {"pat": "plain", "color": "#aa3322"}}
    mats = {"RS": rm("RS", "หลังคาเมทัลชีท หนา 0.47 มม. สีแดง", {"mode": "keep"}),
            "RPU": rm("RPU", "หลังคาเมทัลชีท หนา 0.40 มม. สีเทา", {"mode": "set", "desc": "PU โฟม หนา 25 มม."}),
            "RNO": rm("RNO", "หลังคาเมทัลชีท หนา 0.40 มม. สีเทา", {"mode": "none"}),
            "RSAME": rm("RSAME", "", {"mode": "keep"}),
            "CAP": {"id": "CAP", "name": "CAP", "cls": "roof", "kinds": ["cap"], "cover": "any", "ins": {"mode": "keep"}, "spec": "ครอบหลังคาเมทัลชีท สีแดง", "look": {"pat": "plain"}},
            "FA": {"id": "FA", "name": "FA", "cls": "roof", "kinds": ["fascia"], "cover": "any", "ins": {"mode": "keep"}, "spec": "เชิงชายไม้ฝาไฟเบอร์ซีเมนต์ 8\"", "look": {"pat": "plain"}}}
    others = [f for f in model.get("finishes", []) if f["kind"] == "other"]
    caps = [f for f in others if "ครอบ" in f.get("spec", "") and "เชิงชาย" not in f["spec"]]
    fas = [f for f in others if "เชิงชาย" in f.get("spec", "") or "ปั้นลม" in f.get("spec", "")]
    variants = [("ตามแบบ", model)]
    m2 = copy.deepcopy(model)
    m2["roofs"][model["roofs"].index(r0)]["insulation"] = "ฉนวนใยแก้ว หนา 2 นิ้ว ปิดฟอยล์"
    m2["roofs"][model["roofs"].index(r0)]["cover_spec"] = "หลังคาเมทัลชีท หนา 0.35 มม."
    variants.append(("มีฉนวน+ข้อความรายการตามแบบ", m2))
    for vn, mdl in variants:
        base, _, _ = takeoff.run(mdl, settings, pm)
        mats["RSAME"]["spec"] = mdl["roofs"][model["roofs"].index(r0)].get("cover_spec", "")
        cases = [("แผ่นมุง 1 หลัง → รายการใหม่ ฉนวนตามแบบ", {"piece": {r0["id"]: "RS"}}),
                 ("แผ่นมุง + ใส่ฉนวน PU", {"piece": {r0["id"]: "RPU"}}),
                 ("แผ่นมุง + ไม่มีฉนวน", {"piece": {r0["id"]: "RNO"}}),
                 ("หลังคาทุกหลังชนิดเดียวกัน", {"type": {"|".join(["roof", r0["cover"], "", r0.get("cover_spec") if vn == "ตามแบบ" and r0.get("cover_spec") else (mdl["roofs"][model["roofs"].index(r0)].get("cover_spec") or "วัสดุมุงหลังคา " + takeoff.COVER_NAME[r0["cover"]])]): "RPU"}})]
        if mats["RSAME"]["spec"]:
            cases.append(("ข้อความเดิม (ไม่กระทบ BOQ)", {"piece": {r0["id"]: "RSAME"}}))
        if caps:
            cases.append(("ครอบหลังคา (งานผิว) → วัสดุใหม่", {"piece": {caps[0]["id"]: "CAP"}}))
        if fas:
            cases.append(("เชิงชาย → วัสดุใหม่", {"piece": {fas[0]["id"]: "FA"}}))
        if caps and fas:
            cases.append(("หลังคา + ครอบ + เชิงชาย พร้อมกัน", {"piece": {r0["id"]: "RPU", caps[0]["id"]: "CAP", fas[0]["id"]: "FA"}}))
        # ต่างชนิดเลือกไม่ได้
        other_cover = next(c for c in takeoff.COVER_NAME if c not in (r0["cover"], "concrete_deck"))
        mats["RX"] = rm("RX", "กระเบื้อง", {"mode": "keep"}, other_cover)
        r = node_apply(mdl, base, {"piece": {r0["id"]: "RX"}}, mats)
        print(("ผ่าน" if not r["eff"] else "ไม่ผ่าน"), f"6c [{vn}] วัสดุหลังคาต่างชนิดใช้ไม่ได้"); ok &= not r["eff"]
        for tag, sel in cases:
            r = node_apply(mdl, base, sel, mats)
            if not r["eff"]:
                print("ไม่ผ่าน", tag, "(ไม่มีชิ้นที่ใช้ได้)"); ok = False
                continue
            exp, _, _ = takeoff.run(modify(mdl, r["eff"], mats), settings, pm)
            ok &= compare(r["items"], exp, f"6c [{vn}] {tag} — {len(r['eff'])} ชิ้น")
    return ok


def unit_modify(model, eff, mats):
    """6d: ชิ้นนับจำนวนที่ใช้วัสดุ m → แบบใหม่ <แบบ>~<id วัสดุ> (desc = spec ของวัสดุ) · อุปกรณ์ไม่มีแบบ — ตรวจแยก (unit_eq_expect)"""
    m = copy.deepcopy(model)
    mep = m.get("mep") or {}
    groups = [(m.get("openings", []), m.setdefault("opening_types", {})),
              (((mep.get("plumbing") or {}).get("fixtures") or []), (mep.get("plumbing") or {}).get("fixture_types") or {}),
              (((mep.get("electrical") or {}).get("points") or []), (mep.get("electrical") or {}).get("point_types") or {})]
    for objs, types in groups:
        for o in objs:
            mid = eff.get(o.get("id"))
            if not mid:
                continue
            nt = f"{o['type']}~{mid}"
            if nt not in types:
                types[nt] = dict(copy.deepcopy(types[o["type"]]), desc=mats[mid]["spec"])
            o["type"] = nt
    return m


def unit_norm(rows, eff):
    """ชื่อแถวประตูของ takeoff.py มีเลขแบบใหม่ (DR1~M) — เว็บใช้เลขแบบเดิม (DR1) ตามที่ตกลง"""
    mids = set(eff.values())
    out = []
    for r in rows:
        r = dict(r)
        for mid in mids:
            r["name"] = r["name"].replace(f"~{mid} ", " ")
        out.append(r)
    return out


def unit_cases(model, settings, pm):
    """6d แคตตาล็อก ประตู-หน้าต่าง · สุขภัณฑ์ · อุปกรณ์ · จุดไฟฟ้า"""
    import subprocess as sp
    us = json.loads(sp.run(["node", "-e", "const M=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify(M.units(JSON.parse(s)))))",
                            os.path.abspath(os.path.join(HERE, "..", "lib", "matlib.js"))], input=json.dumps(model), capture_output=True, text=True, encoding="utf-8").stdout)
    if not us:
        print("ข้าม 6d (ไม่มีชิ้นนับจำนวน)")
        return True
    base, _, _ = takeoff.run(model, settings, pm)
    ok = True
    def im(i, kinds, spec, style=None):
        d = {"id": i, "name": i, "cls": "item", "kinds": kinds, "spec": spec, "look": {"pat": "plain", "color": "#335577", "color2": "#aabbcc"}}
        if style:
            d["style"] = style
        return d
    by = lambda unit: [u for u in us if u["unit"] == unit]
    tk = lambda u: "|".join(["u", u["unit"], u["type"], u.get("size", "") if u["unit"] == "eq" else ""])
    mats, cases = {}, []
    op, fx, pt, eq = by("open"), by("fx"), by("pt"), by("eq")
    if op:
        d = op[0]; mats["DA"] = im("DA", [d["ik"]], "ประตูอลูมิเนียมบานเลื่อน กระจกเขียวตัดแสง 6 มม.", "slide")
        mats["DB"] = im("DB", [d["ik"]], "ประตูไม้อัดยางกันชื้น บานเปิดเดี่ยว")
        same = [u for u in op if u["type"] == d["type"]]
        cases.append(("ประตู 1 บาน → แยกแถว", {"piece": {d["id"]: "DA"}}))
        cases.append(("ประตูทุกบานแบบเดียวกัน (แถวเดิมหาย = เปลี่ยนชื่อ)", {"type": {tk(d): "DA"}}))
        if len(same) > 1:
            cases.append(("ทั้งแบบ + ยกเว้น 1 บานตามแบบ + 1 บานวัสดุอื่น", {"type": {tk(d): "DA"}, "piece": {same[1]["id"]: "", **({same[2]["id"]: "DB"} if len(same) > 2 else {})}}))
        win = [u for u in op if u["kind"] != d["kind"]]
        if win:
            mats["WX"] = im("WX", [win[0]["ik"]], "หน้าต่างอลูมิเนียมบานเลื่อน กระจกใส 5 มม.")
            cases.append(("หน้าต่าง/ช่องลม 1 ชุด", {"piece": {win[0]["id"]: "WX"}}))
    if fx:
        f0 = fx[0]; mats["FX"] = im("FX", [f0["ik"]], f"{f0['kind']} ยี่ห้อ X รุ่นทดสอบ")
        cases.append(("สุขภัณฑ์ 1 ชิ้น", {"piece": {f0["id"]: "FX"}}))
        cases.append(("สุขภัณฑ์ทั้งแบบ", {"type": {tk(f0): "FX"}}))
    if pt:
        p0 = pt[0]; mats["PX"] = im("PX", [p0["ik"]], "โคมดาวน์ไลท์ LED 12W ฝังฝ้า")
        cases.append(("จุดไฟฟ้า 1 จุด", {"piece": {p0["id"]: "PX"}}))
        cases.append(("จุดไฟฟ้าทั้งแบบ", {"type": {tk(p0): "PX"}}))
    if op and fx and pt:
        cases.append(("ประตู + สุขภัณฑ์ + โคม พร้อมกัน", {"piece": {op[0]["id"]: "DA", fx[0]["id"]: "FX"}, "type": {tk(pt[0]): "PX"}}))
    # ต่างชนิดใช้ไม่ได้
    if op and fx:
        r = node_apply(model, base, {"piece": {op[0]["id"]: "FX"}}, mats)
        print(("ผ่าน" if not r["eff"] else "ไม่ผ่าน"), "6d วัสดุต่างชนิด (สุขภัณฑ์ → ประตู) ใช้ไม่ได้"); ok &= not r["eff"]
    for tag, sel in cases:
        r = node_apply(model, base, sel, mats)
        if not r["eff"]:
            print("ไม่ผ่าน", tag, "(ไม่มีชิ้นที่ใช้ได้)"); ok = False
            continue
        exp, _, _ = takeoff.run(unit_modify(model, r["eff"], mats), settings, pm)
        ok &= compare(r["items"], unit_norm(exp, r["eff"]), f"6d {tag} — {len(r['eff'])} ชิ้น")
        keys = [x["key"] for x in r["items"]]   # แถวใหม่อยู่ต่อจากแถวเดิม (หรือที่เดิมถ้าแถวเดิมหาย)
        for k in keys:
            if "~" in k:
                b = k.split("~")[0]
                i = keys.index(k)
                prev = keys[i - 1] if i else ""
                if not (prev == b or prev.startswith(b + "~") or (b not in keys and [x["key"] for x in base].index(b) >= 0)):
                    print("ไม่ผ่าน", tag, "ลำดับแถว", k, "ต่อจาก", prev); ok = False
    if eq:
        e0 = eq[0]; mats["EQ"] = im("EQ", [e0["ik"]], f"{takeoff.EQUIP_NAME.get(e0['kind'], e0['kind'])} ยี่ห้อ Y")
        r = node_apply(model, base, {"piece": {e0["id"]: "EQ"}}, mats)
        A = {x["key"]: x for x in r["items"]}; B = {x["key"]: x for x in base}
        k0, k1 = f"eq_{e0['kind']}", f"eq_{e0['kind']}~EQ"
        n0 = B[k0]["qty"]
        good = k1 in A and A[k1]["qty"] == 1 and A[k1]["name"] == mats["EQ"]["spec"] + (" " + e0["size"] if e0["size"] else "") \
            and A[k1]["spec"] == {"t": "equip", "kind": e0["kind"], "size": e0["size"]} and A[k1]["group_code"] == B[k0]["group_code"] \
            and ((n0 == 1 and k0 not in A) or (n0 > 1 and A[k0]["qty"] == n0 - 1))
        print(("ผ่าน" if good else "ไม่ผ่าน"), f"6d อุปกรณ์ 1 ชิ้น ({e0['id']}) — ชื่อ = ข้อความรายการ + ขนาดจากโมเดล · spec ผูกราคาเดิม"); ok &= good
    return ok


def v75_cases(model, settings, pm):
    """v7.5 อุปกรณ์หลังคา (ครอบสัน/ตะเข้ที่คิดจากหลังคา) + ทาสีเหล็กรูปพรรณ — ตรวจตาม by_src ของ takeoff.py"""
    import subprocess as sp
    base, _, _ = takeoff.run(model, settings, pm)
    m = copy.deepcopy(model); m.setdefault("quantities", {})["items"] = base
    js = ("const M=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);"
          "process.stdout.write(JSON.stringify({r:M.raccs(m),s:M.steels(m),cl:M.clean({cls:'clad',kinds:['cap'],name:'x',spec:'y',look:{}})}))})")
    P = json.loads(sp.run(["node", "-e", js, os.path.abspath(os.path.join(HERE, "..", "lib", "matlib.js"))], input=json.dumps(m), capture_output=True, text=True, encoding="utf-8").stdout)
    ok = True
    cl = P["cl"]
    g = cl["cls"] == "roof" and cl["kinds"] == ["cap"] and cl["cover"] == "any"
    print(("ผ่าน" if g else "ไม่ผ่าน"), "v7.5 วัสดุกรุครอบเดิม → หมวดหลังคา (ครอบข้าง ทุกชนิดหลังคา)", "" if g else cl); ok &= g
    B = {x["key"]: x for x in base}
    r2 = lambda v: round(v + 1e-9, 2)
    def mv(tag, sel, mats, key, srcs, nk, name):
        nonlocal ok
        r = node_apply(m, base, sel, mats)
        A = {x["key"]: x for x in r["items"]}
        w = B[key].get("waste") or 0
        moved = sum(B[key]["by_src"][s] for s in srcs)
        rest = sum(v for s, v in B[key]["by_src"].items() if s not in srcs)
        g = nk in A and abs(A[nk]["qty"] - r2(moved * (1 + w))) < 0.011 and A[nk]["name"] == name and A[nk]["unit"] == B[key]["unit"] \
            and ((rest <= 1e-9 and key not in A) or (key in A and abs(A[key]["qty"] - r2(rest * (1 + w))) < 0.011)) \
            and [x["key"] for x in r["items"]].index(nk) <= [x["key"] for x in base].index(key) + 1
        others = [k for k in A if k not in (key, nk) and A[k]["qty"] != (B.get(k) or {}).get("qty")]
        g = g and not others
        print(("ผ่าน" if g else "ไม่ผ่าน"), f"v7.5 {tag}", "" if g else (A.get(nk, {}).get("qty"), r2(moved * (1 + w)), A.get(key, {}).get("qty"), others[:3])); ok &= g
    for f in P["r"]:
        mats = {"RG": {"id": "RG", "name": "RG", "cls": "roof", "kinds": [f["racc"]], "cover": f["cover"], "ins": {"mode": "keep"}, "spec": f"{f['racc']} ทดสอบ สีแดง", "look": {"pat": "plain"}},
                "RX": {"id": "RX", "name": "RX", "cls": "roof", "kinds": [f["racc"]], "cover": "cpac_tile" if f["cover"] != "cpac_tile" else "metal_sheet", "ins": {"mode": "keep"}, "spec": "x", "look": {"pat": "plain"}}}
        mv(f"{f['racc']} ของ {f['roof']} (คิดจากหลังคา) → แถวใหม่", {"piece": {f["id"]: "RG"}}, mats, f["row"], [f["roof"]], f"{f['row']}~RG", mats["RG"]["spec"])
        r = node_apply(m, base, {"piece": {f["id"]: "RX"}}, mats)
        print(("ผ่าน" if not r["eff"] else "ไม่ผ่าน"), f"v7.5 {f['racc']} วัสดุต่างชนิดหลังคาใช้ไม่ได้"); ok &= not r["eff"]
    st = P["s"]
    if st:
        SP = {"id": "SP", "name": "SP", "cls": "paint", "kinds": ["steel"], "spec": "ทาสีกันสนิม + สีน้ำมัน 2 เที่ยว สีเทาเข้ม", "look": {"pat": "plain", "color": "#444444"}}
        WP = {"id": "WP", "name": "WP", "cls": "paint", "kinds": ["wall"], "spec": "", "look": {"pat": "plain"}}
        mats = {"SP": SP, "WP": WP}
        s0 = st[0]
        mv(f"ทาสีเหล็ก ชิ้นนี้ ({s0['id']})", {"piece": {s0["id"]: "SP"}}, mats, "paint_rust", [s0["src"]], "paint_rust~SP", SP["spec"])
        same = [x for x in st if x["type"] == s0["type"]]
        mv(f"ทาสีเหล็ก ทั้งชนิด {s0['type']} ({len(same)} ชิ้น)", {"type": {"steel|" + s0["type"]: "SP"}}, mats, "paint_rust", [x["src"] for x in same], "paint_rust~SP", SP["spec"])
        mv(f"ทาสีเหล็ก ทุกชิ้น ({len(st)} ชิ้น) → แถวเดิมหาย", {"type": {"steel|" + t: "SP" for t in {x["type"] for x in st}}}, mats, "paint_rust", [x["src"] for x in st], "paint_rust~SP", SP["spec"])
        rf = [x for x in st if x["type"] == "roof_frame"]
        if rf:
            mv(f"ทาสีโครงหลังคาตามข้อกำหนด ({rf[0]['id']})", {"piece": {rf[0]["id"]: "SP"}}, mats, "paint_rust", [rf[0]["src"]], "paint_rust~SP", SP["spec"])
        r = node_apply(m, base, {"piece": {s0["id"]: "WP"}}, mats)
        print(("ผ่าน" if not r["eff"] else "ไม่ผ่าน"), "v7.5 สีทาผนังใช้กับเหล็กไม่ได้"); ok &= not r["eff"]
        wall = [f for f in m.get("finishes", []) if f.get("counted_by") == "wall"]
        if wall:
            r = node_apply(m, base, {"piece": {wall[0]["id"]: "SP"}}, mats)
            print(("ผ่าน" if not r["eff"] else "ไม่ผ่าน"), "v7.5 สีทาเหล็กใช้กับผนังไม่ได้"); ok &= not r["eff"]
        import subprocess as sp2
        pid = json.loads(sp2.run(["node", "-e", "const M=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);const r=(m.roofs||[])[0];process.stdout.write(JSON.stringify(r?M.pieceIdOf(r.id+'-แป-1',m):null))})",
                                   os.path.abspath(os.path.join(HERE, "..", "lib", "matlib.js"))], input=json.dumps(m), capture_output=True, text=True, encoding="utf-8").stdout)
        if rf:
            g = pid == rf[0]["id"]
            print(("ผ่าน" if g else "ไม่ผ่าน"), "v7.5 กดแปในหลังคา 3D → ชิ้นโครงหลังคา", "" if g else pid); ok &= g
    else:
        print("ข้าม ทาสีเหล็ก (ไม่มีแถว paint_rust)")
    return ok


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
        # 6b ทาสี → กรุ
        cases.append(("6b ผนังทาสี 1 ด้าน → กรุ (ด้านจากคำในรายการ)", {"piece": {painted[0]["id"]: "WT"}}))
        et = [f for f in painted if f.get("side") in ("E", "T")]
        if et:
            cases.append(("6b ปลาย/สันผนังทาสี → กรุ", {"piece": {et[0]["id"]: "WT"}}))
        p0 = painted[0]
        cases.append(("6b ผนังทาสีทุกชิ้นชนิดเดียวกัน → กรุ (แถวฉาบ/ทาสีผนังหาย)", {"type": {"|".join(["wall", "c", p0.get("tag", ""), p0["spec"]]): "WT"}}))
        mats["WT2"] = mat("WT2", "clad", tiled[0]["spec"], ["wall"]) if tiled else mats["WT"]
        cases.append(("6b ผนังทาสี → กรุรายการที่มีอยู่แล้ว (รวมแถว)", {"piece": {painted[1]["id"]: "WT2"}}))
    if tiled:
        mats["PI"] = mat("PI", "paint", "", ["wall"]); mats["PI"]["name"] = "สีทาภายใน ขาวนวล"
        mats["PE"] = mat("PE", "paint", "", ["wall"]); mats["PE"]["name"] = "สีทาภายนอก เทา"
        t0 = tiled[0]
        cases.append(("6b ผนังกรุ → ทาสี (ด้านจากชื่อวัสดุ)", {"piece": {t0["id"]: "PI"}}))
        cases.append(("6b ผนังกรุ → ทาสี ยังไม่รู้ด้าน = ยังไม่แยกแถว", {"piece": {t0["id"]: "P1"}}, True))
        cases.append(("6b ผนังกรุ → ทาสี (ด้านที่ตอบในหน้าต่าง)", {"piece": {t0["id"]: "P1"}, "side": {t0["id"]: "int"}}))
        nop = [f for f in tiled if not next((w for w in model["walls"] if w["id"] == f.get("wall")), {}).get("plaster")]
        if nop:
            cases.append(("6b ผนังไม่ฉาบ (กรุสองด้าน) → ทาสี (แถวฉาบใหม่)", {"piece": {nop[0]["id"]: "PE"}}))
        cases.append(("6b ผนังกรุทุกชิ้นชนิดเดียวกัน → ทาสีภายใน", {"type": {"|".join(["wall", "", t0.get("tag", ""), t0["spec"]]): "PI"}}))
        if painted:
            cases.append(("6b สลับไปกลับพร้อมกัน (ทาสี → กรุ + กรุ → ทาสี)", {"piece": {painted[0]["id"]: "WT", t0["id"]: "PE"}}))
    if ceil:
        cases.append(("ฝ้า", {"piece": {ceil[0]["id"]: "CL"}}))
    if ctr:
        cases.append(("เคาน์เตอร์ทุกชิ้น", {"piece": {f["id"]: "CT" for f in ctr}}))
    allsel = {"piece": {}, "type": {}}
    for c in cases[:1] + cases[4:]:
        if c[0].startswith("6b"):
            continue
        for k in ("piece", "type"):
            allsel[k].update(c[1].get(k, {}))
    cases.append(("หลายอย่างพร้อมกัน", allsel))

    for c in cases:
        tag, sel, expect_need = c[0], c[1], (c[2] if len(c) > 2 else False)
        r = node_apply(model, base, sel, mats)
        if not r["eff"]:
            print("ข้าม", tag, "(ไม่มีชิ้นที่ใช้ได้)")
            continue
        if bool(r["need"]) != expect_need:
            print("ไม่ผ่าน", tag, "— ชิ้นที่ต้องถามด้าน", r["need"][:5]); ok = False
        sides = {k: v for k, v in r["side"].items() if v}
        exp, _, _ = takeoff.run(modify(model, r["eff"], mats, sides, base), settings, pm)
        ok &= compare(r["items"], exp, f"{tag} — {len(r['eff'])} ชิ้น" + (f" · ด้าน {sorted(set(sides.values()))}" if sides else ""))
    ok &= roof_cases(model, settings, pm)
    ok &= unit_cases(model, settings, pm)
    ok &= v75_cases(model, settings, pm)
    print("\nรวม:", "ผ่านทั้งหมด" if ok else "มีข้อที่ไม่ผ่าน")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
