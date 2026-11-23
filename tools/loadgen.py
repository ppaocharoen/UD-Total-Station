"""ตัวคิดน้ำหนักบรรทุก (M4 ก้อน 2) — เขียน loads + combos ลง .bm.json ให้ sap_export.py ส่งเข้า SAP

กลุ่มน้ำหนัก
  DL   น้ำหนักตัวเองของ frame — SAP คิดให้เอง (SelfWtMult = 1) · loadgen ไม่ใส่น้ำหนักชิ้นส่วนโครงสร้างซ้ำ (Earth 22 พ.ย. 2569)
  SDL  แผ่นมุงหลังคา (ลงแป · ต่อพื้นที่ลาด) · ฝ้าที่แขวนใต้จันทัน (ลงจันทัน · ต่อพื้นที่ราบ) · ผนังลงคานที่รองรับ (หักช่องเปิด)
  LR   น้ำหนักจรหลังคา 50 กก./ตร.ม. ต่อพื้นที่ราบ (กฎกระทรวง 2566 ข้อ 11)
  W*   ลม (ก้อน 3) — tools/windgen.py: มยผ.1311 ภาคผนวก ค แบ่งโซนเป็น loads.wind.zones ให้ sap_export กระจายลงแป/เสา
       ข้อมูลลมของโครงการเก็บใน loads.wind.input (ใส่ครั้งแรกด้วย --wind "V50=25,terrain=B,Iw=1,cpi=3,by=Earth …")

น้ำหนักวัสดุจากคลัง: _claude_kb/น้ำหนักวัสดุ.json (ถ้ามี) ไม่งั้น tools/unit_weights.json

ผนัง: ลงคานที่อยู่ใต้แนวผนังในแปลน (ห่างจากแกนคาน ≤ ครึ่งกว้างคาน + ครึ่งหนาผนัง + 1 ซม.) และฐานผนังไม่ต่ำกว่าหลังคาน
      (ผนังบนพื้นวางบนดินไม่ลง frame — รายงานไว้) · ผนังที่ซ้อนอยู่บนผนังอื่น (ระแนงเหนือผนัง) ลงคานแนวเดียวกัน
      น้ำหนัก/ม. = หน่วยน้ำหนัก × ความสูงผนัง แบ่งช่วงตามช่องเปิด (ช่วงช่องเปิดหักความสูงช่อง) · ไม่คิดปูนฉาบ

รัน: python tools/loadgen.py model.bm.json [--write] [--lib คลัง.json]
"""
import argparse, json, math, os, re, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.join(HERE, "..", "..", "_claude_kb", "น้ำหนักวัสดุ.json")
SKIP_MEMBER = ("stiffener", "lintel")


def load_lib(path=None):
    for p in [path, KB, os.path.join(HERE, "unit_weights.json")]:
        if p and os.path.exists(p):
            d = json.load(open(p, encoding="utf-8"))
            d["_path"] = p
            return d
    raise FileNotFoundError("ไม่พบคลังน้ำหนักวัสดุ")


def tube_kgm(a, b, t):
    """ท่อเหล็กกล่อง a×b×t มม. → กก./ม. (ไม่คิดมุมโค้ง)"""
    return (2 * (a + b) - 4 * t) * t * 7.85e-3


class Gen:
    def __init__(self, m, lib):
        self.m, self.lib = m, lib
        self.items = {x["key"]: x for x in lib["items"]}
        self.nodes = {n["id"]: n for n in m.get("nodes", [])}
        self.secs = {s["id"]: s for s in m.get("sections", [])}
        self.notes, self.warn = [], []
        self.area, self.mem = [], []

    # ---------- หน่วยน้ำหนัก ----------
    def sheet_w(self, rf):
        txt = " ".join(str(rf.get(k) or "") for k in ("cover_spec", "note"))
        g = re.search(r"(\d+(?:\.\d+)?)\s*มม", txt)
        if not g:
            self.warn.append("หลังคา %s: หาความหนาแผ่นมุงจากข้อความไม่ได้ — ไม่ใส่น้ำหนักแผ่นมุง" % rf["id"])
            return None, ""
        t = float(g.group(1))
        return round(t * 7.85, 4), "เมทัลชีท %.2f มม. × 7.85 = %.2f กก./ตร.ม." % (t, t * 7.85)

    def wall_w(self, w):
        k = w["kind"]
        if k == "brick_mon":
            it = self.items["brick_full" if (w.get("t") or 0.1) > 0.15 else "brick_half"]
            return it["value"], it["name"]
        if k == "block":
            it = self.items["vent_block"]
            return it["value"], it["name"] + " (ค่ามากสุด)"
        if k == "other":
            txt = " ".join(str(w.get(x) or "") for x in ("note", "desc"))
            fin = [f for f in self.m.get("finishes", []) if f.get("id") == "RL-" + w["id"].split("-", 1)[-1]]
            txt += " " + " ".join(f.get("spec", "") for f in fin)
            g = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:มม\.?)?\s*@\s*(\d+(?:\.\d+)?)", txt)
            if g and re.search(r"เหล็ก", txt):
                a, b, t, s = map(float, g.groups())
                kgm = tube_kgm(a, b, t)
                return round(kgm / s, 3), "แผง/ระแนงเหล็ก %gx%gx%g @%g = %.2f กก./ม. ÷ %g" % (a, b, t, s, kgm, s)
            return None, ""
        return None, ""

    # ---------- หลังคา ----------
    def roofs(self):
        live = self.lib["live"]["roof"]
        for rf in self.m.get("roofs", []):
            v, why = self.sheet_w(rf)
            if v:
                self.area.append({"id": "AL-%s-SHEET" % rf["id"], "pattern": "SDL", "targets": [rf["id"]], "value": v,
                                  "status": "computed", "ref": why + " (Earth 22 พ.ย. 2569)"})
            self.area.append({"id": "AL-%s-LR" % rf["id"], "pattern": "LR", "targets": [rf["id"]], "value": live["value"],
                              "status": "computed", "ref": live["ref"]})
            ins = rf.get("insulation")
            if ins:
                self.warn.append("หลังคา %s มีฉนวน %s — ยังไม่มีน้ำหนักในคลัง" % (rf["id"], ins))
        # ฝ้าแขวนใต้จันทัน
        roofs = {r["id"]: r for r in self.m.get("roofs", [])}
        it = self.items.get("ceiling_smartboard_6")
        cls = [f for f in self.m.get("finishes", []) if f.get("kind") == "ceiling"]
        if not cls:
            return
        for r in roofs.values():
            xs = [p[0] for p in r["outline"]]; ys = [p[1] for p in r["outline"]]
            A_out = (max(xs) - min(xs)) * (max(ys) - min(ys))
            mine, A = [], 0.0
            for f in cls:
                if not re.search(r"จันทัน", f.get("spec", "")) and not f.get("frame"):
                    continue
                for x0, y0, x1, y1 in f.get("rects", []):
                    A += (x1 - x0) * (y1 - y0)
                mine.append(f)
            if not mine:
                continue
            ok = all(it and it["match"] in f.get("spec", "") for f in mine)
            if not ok:
                self.warn.append("ฝ้า %s: ไม่มีน้ำหนักในคลัง" % ", ".join(f["id"] for f in mine))
                continue
            if abs(A - A_out) > 0.02 * A_out:
                self.warn.append("ฝ้าใต้หลังคา %s คลุม %.2f จาก %.2f ตร.ม. — รุ่นนี้ลงได้เฉพาะเมื่อคลุมเต็มหลังคา" % (r["id"], A, A_out))
                continue
            self.area.append({"id": "AL-%s-CEIL" % r["id"], "pattern": "SDL", "targets": [r["id"]], "value": it["value"],
                              "on": "rafter", "per": "plan", "status": "computed",
                              "ref": "%s (%s) %g กก./ตร.ม. ต่อพื้นที่ราบ แขวนใต้จันทัน — Earth 22 พ.ย. 2569" % (it["name"], ", ".join(f["id"] for f in mine), it["value"])})

    # ---------- ผนัง ----------
    def walls(self):
        beams = []
        for x in self.m.get("members", []):
            if x["type"] in SKIP_MEMBER:
                continue
            a, b = self.nodes[x["i"]], self.nodes[x["j"]]
            if abs(a["z"] - b["z"]) > 0.01 or math.hypot(b["x"] - a["x"], b["y"] - a["y"]) < 1e-6:
                continue   # เฉพาะคานแนวราบ
            s = self.secs.get(x["section"], {})
            if s.get("kind") != "rc_rect":
                continue   # ผนังวางบนคาน คสล. (คานคอดิน/คานชั้น)
            beams.append((x, a, b, s))
        ops = defaultdict(list)
        ot = self.m.get("opening_types", {})
        for o in self.m.get("openings", []):
            t = ot.get(o["type"]) if isinstance(ot, dict) else None
            if t:
                ops[o["wall"]].append((o["at"] - t["w"] / 2, o["at"] + t["w"] / 2, t["h"], o["id"]))
        none, skip = [], []
        n = 0
        for w in self.m.get("walls", []):
            gam, why = self.wall_w(w)
            if gam is None:
                skip.append(w["id"])
                continue
            H = w["top"] - w["bottom"]
            if H <= 0:
                continue
            s0 = 0.0
            hit_any = False
            P = w["path"]
            for k in range(len(P) - 1):
                p, q = P[k], P[k + 1]
                Lw = math.dist(p, q)
                if Lw < 1e-6:
                    continue
                u = ((q[0] - p[0]) / Lw, (q[1] - p[1]) / Lw)
                for x, a, b, s in beams:
                    top = a["z"]   # node คาน คสล. = หลังคาน
                    if w["bottom"] < top - 0.06:
                        continue
                    Lb = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
                    ub = ((b["x"] - a["x"]) / Lb, (b["y"] - a["y"]) / Lb)
                    if abs(u[0] * ub[1] - u[1] * ub[0]) > 1e-3:
                        continue   # ไม่ขนาน
                    d = abs((p[0] - a["x"]) * ub[1] - (p[1] - a["y"]) * ub[0])
                    if d > s["b"] / 2 + (w.get("t") or 0.1) / 2 + 0.01:
                        continue
                    tp = (p[0] - a["x"]) * ub[0] + (p[1] - a["y"]) * ub[1]
                    tq = (q[0] - a["x"]) * ub[0] + (q[1] - a["y"]) * ub[1]
                    lo, hi = max(0.0, min(tp, tq)), min(Lb, max(tp, tq))
                    if hi - lo < 1e-3:
                        continue
                    hit_any = True
                    # จุดแบ่งตามช่องเปิด (พิกัดตามคาน)
                    def to_b(sw):   # ระยะตามผนัง (ทั้งเส้น) → ระยะตามคาน
                        loc = sw - s0
                        return tp + (loc if tp <= tq else -loc)
                    cuts = {lo, hi}
                    for o0, o1, oh, _ in ops.get(w["id"], []):
                        for sw in (o0, o1):
                            c = to_b(sw)
                            if lo < c < hi:
                                cuts.add(c)
                    cuts = sorted(cuts)
                    for c0, c1 in zip(cuts, cuts[1:]):
                        if c1 - c0 < 1e-3:
                            continue   # ช่วงสั้นกว่า 1 มม. (ขอบช่องเปิดชนปลายคาน)
                        mid = (c0 + c1) / 2
                        h = H
                        for o0, o1, oh, oid in ops.get(w["id"], []):
                            a0, a1 = sorted((to_b(o0), to_b(o1)))
                            if a0 - 1e-6 <= mid <= a1 + 1e-6:
                                h -= min(oh, H)
                        if h <= 1e-6:
                            continue
                        n += 1
                        L3 = math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]))
                        f = L3 / Lb
                        val = round(gam * h, 3)
                        self.mem.append({"id": "ML-W-%s-%s-%d" % (w["id"], x["id"], n), "pattern": "SDL", "member": x["id"],
                                         "kind": "trapezoid", "value": [val, val], "at": [round(c0 * f, 4), round(c1 * f, 4)],
                                         "dir": "gravity", "source": "wall", "src": w["id"], "status": "computed",
                                         "ref": "%s %g กก./ตร.ม. × สูง %.2f ม.%s" % (why, gam, h, " (หักช่องเปิด)" if h < H - 1e-6 else "")})
                s0 += Lw
            if not hit_any:
                none.append(w["id"])
        if none:
            self.notes.append("ผนังที่ไม่มีคานรองรับใน SAP (อยู่บนพื้นวางบนดิน ไม่ลง frame): " + ", ".join(none))
        if skip:
            self.notes.append("ไม่คิดน้ำหนัก (ไม่ใช่ผนังรับน้ำหนัก/ไม่มีในคลัง: วงกบ คัน ผนังทางลาด คสล. บนดิน ฯลฯ): " + ", ".join(skip))

    def combos(self):
        return [
            {"id": "D", "method": "WSD", "factors": {"DL": 1, "SDL": 1}, "ref": "น้ำหนักคงที่ (ตรวจแรงปฏิกิริยา)"},
            {"id": "D+LR", "method": "WSD", "factors": {"DL": 1, "SDL": 1, "LR": 1}, "ref": "WSD — ชุดลมเพิ่มในก้อน 3"},
        ]

    def run(self, wind_input=None):
        self.roofs()
        self.walls()
        loads = {"patterns": [{"id": "DL", "kind": "dead", "self_weight": True},
                              {"id": "SDL", "kind": "super_dead"},
                              {"id": "LR", "kind": "roof_live"}],
                 "area_loads": self.area, "member_loads": self.mem}
        combos = self.combos()
        if wind_input:
            from windgen import Wind, combos as wcombos
            w = Wind(self.m, wind_input)
            pats, zones, derived = w.run()
            loads["patterns"] += pats
            loads["wind"] = {"input": wind_input, "derived": derived, "zones": zones}
            combos = wcombos([p["id"] for p in pats])
            self.notes += w.notes
            self.warn += w.warn
        else:
            self.notes.append("ยังไม่มีข้อมูลลมของโครงการ (loads.wind.input) — ไม่ใส่ลม")
        return loads, combos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--lib")
    ap.add_argument("--wind", help='ข้อมูลลมของโครงการ เช่น "V50=25,terrain=B,Iw=1,cpi=3,by=Earth 22 พ.ย. 2569"')
    a = ap.parse_args()
    m = json.load(open(a.model, encoding="utf-8"))
    lib = load_lib(a.lib)
    g = Gen(m, lib)
    wi = ((m.get("loads") or {}).get("wind") or {}).get("input")
    if a.wind:
        kv = dict(x.split("=", 1) for x in a.wind.split(","))
        wi = {"V50": float(kv["V50"]), "terrain": kv["terrain"].upper(), "Iw": float(kv["Iw"]), "cpi_case": int(kv["cpi"]),
              "status": "from_engineer", "by": kv.get("by", "")}
    loads, combos = g.run(wi)
    print("คลังน้ำหนัก:", os.path.relpath(lib["_path"]))
    for al in loads["area_loads"]:
        print("  %-16s %-4s %7.2f กก./ตร.ม.  %s" % (al["id"], al["pattern"], al["value"], al["ref"]))
    tot = defaultdict(float)
    for ml in loads["member_loads"]:
        tot[ml["member"]] += ml["value"][0] * (ml["at"][1] - ml["at"][0])
    print("  ผนังลงคาน %d ช่วง บนคาน %d ตัว รวม %.1f กก." % (len(loads["member_loads"]), len(tot), sum(tot.values())))
    if loads.get("wind"):
        from collections import Counter
        zs = loads["wind"]["zones"]
        print("  ลม %d กลุ่ม · โซน %d รายการ · ชุดผสม %d" % (sum(p["kind"] == "wind" for p in loads["patterns"]), len(zs), len(combos)))
    for s in g.notes:
        print("  · " + s)
    for s in g.warn:
        print("  ! " + s)
    if a.write:
        m["loads"] = loads
        m["combos"] = combos
        json.dump(m, open(a.model, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("เขียนแล้ว:", a.model)


if __name__ == "__main__":
    main()
