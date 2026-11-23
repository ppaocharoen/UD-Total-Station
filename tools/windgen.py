"""แรงลมโครงสร้างหลัก (M4 ก้อน 3) — มยผ.1311-50 ภาคผนวก ค (ตารางแรงลมสำเร็จรูป อาคารเตี้ย) แบ่งโซนตามรูป ข.1

ข้อมูลที่ Earth ให้ต่อโครงการ (loads.wind.input):
  V50 (ม./วินาที: 25/27/29/30 ตามกลุ่มพื้นที่ ตาราง ก-1) · terrain A/B · Iw (ตาราง 2-1/2-2 สภาวะกำลัง) · cpi_case 1/2/3
ที่เหลือคิดจากโมเดล:
  ขนาดอาคาร = กรอบเสา (เสาเหนือดิน) · Ds = ด้านแคบ · h = ระดับชายคา (หลังคาชัน < 7°) หรือกึ่งกลางหลังคา
  z = min(0.10 Ds, 0.40 h) ≥ max(0.04 Ds, 1.0) · y (ความกว้างโซนมุม E) = max(6, 2z)
  หน่วยแรง = ค่าตาราง ค (V50, ฐาน h 10 ม. ภูมิประเทศ A) × ค-4(terrain, h) × Iw · ความชันระหว่างแถว interpolate

กลุ่มลม: ตรวจทั้ง 4 มุมเป็นมุมต้นลม (หมายเหตุรูป ข.1) × ลมตั้งฉากสัน/ขนานสัน × แรงดันภายใน (กรณี 3: ลบ N / บวก P)
  ชื่อ W<แกนลม><ด้านต้นลม><มุม><N|P> เช่น WYA1P = ลมตามแกน Y พัดจากแถว A มุมต้นลมที่กริด 1 แรงดันภายในบวก

โซน (ค่า + = ดันเข้าหาผิว, − = ดูดออก):
  ลมตั้งฉากสัน: หลังคาครึ่งต้นลม 2/2E ครึ่งท้ายลม 3/3E · ผนังต้นลม 1/1E ผนังท้ายลม 4/4E
  ลมขนานสัน:   หลังคาครึ่งฝั่งมุมต้นลม 2/2E อีกครึ่ง 3/3E · ผนังสกัดต้นลม 5/5E ผนังสกัดท้ายลม 6/6E
  E = แถบกว้าง y — ลมตั้งฉากสันวัดจากมุมต้นลมตามแนวผนัง · ลมขนานสันวัดจากด้านต้นลม
  ตาราง ค ให้ผนัง 1 (และ 5) เป็นค่ารวมต้นลม+ท้ายลม → แบ่งให้ผนังสองด้านตามสัดส่วน Cp ของรูป ข.1 (เช่น 0.75 : 0.55)
  ค่าหลังคาในตาราง ค รวมแรงดันภายในแล้ว · ผนังข้างตอนลมขนานสันตาราง ค ไม่ให้ค่า (ไม่ใส่)
หลังคาเพิงชัน ≤ 5° คิดแบบหลังคาเกือบแบน (แถว 0–5°) — ชันกว่านี้ยังไม่รองรับ รอ Earth ตัดสิน (22 พ.ย. 2569)
ไม่คิด: แรงใต้ชายคายื่น · องค์อาคารย่อย (ตาราง ค-5..ค-7 สำหรับออกแบบแป/แผ่นมุงเฉพาะชิ้น)
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.join(HERE, "..", "..", "_claude_kb")
SLOPE_ROWS = {"0-5": (0, 5), "10": (10, 10), "15": (15, 15), "20": (20, 20), "25": (25, 25), "30-45": (30, 45), "90": (90, 90)}
VARIANTS = {   # cpi_case -> [(ต่อท้ายชื่อ, ตาราง, load case ตั้งฉากสัน, load case ขนานสัน)]
    1: [("", "C1_case1", "1", "3")],
    2: [("", "C2_case2", "1", "3")],
    3: [("N", "C3a_case3_neg", "1", "2"), ("P", "C3b_case3_pos", "3", "4")],
}


def load_tables():
    kc, kb = os.path.join(KB, "wind_1311_appC.json"), os.path.join(KB, "wind_1311_appB1.json")
    if os.path.exists(kc) and os.path.exists(kb):
        c, b = json.load(open(kc, encoding="utf-8")), json.load(open(kb, encoding="utf-8"))
        return {"appC": c, "appC_meta": c["_meta"], "B1": b, "_path": kc}
    d = json.load(open(os.path.join(HERE, "wind_1311.json"), encoding="utf-8"))
    d["_path"] = os.path.join(HERE, "wind_1311.json")
    return d


def interp(x, xs, ys):
    if x <= xs[0]:
        return ys[0]
    for k in range(1, len(xs)):
        if x <= xs[k]:
            return ys[k - 1] + (ys[k] - ys[k - 1]) * (x - xs[k - 1]) / (xs[k] - xs[k - 1])
    return ys[-1]


def by_slope(rows, slope, zone):
    """ค่าโซนจากแถวความชัน (ช่วง 0-5, 30-45 ค่าคงที่ · ระหว่างแถว interpolate)"""
    pts = []
    for r in rows:
        lo, hi = SLOPE_ROWS[r["slope"]]
        pts += [(lo, r[zone]), (hi, r[zone])] if hi > lo else [(lo, r[zone])]
    pts.sort()
    return interp(slope, [p[0] for p in pts], [p[1] for p in pts])


class Wind:
    def __init__(self, m, inp, tables=None):
        self.m, self.inp = m, inp
        self.T = tables or load_tables()
        self.warn, self.notes = [], []

    # ---------- เรขาคณิต ----------
    def footprint(self):
        N = {n["id"]: n for n in self.m["nodes"]}
        xs, ys = [], []
        for x in self.m["members"]:
            if x["type"] not in ("column", "steel_column"):
                continue
            a, b = N[x["i"]], N[x["j"]]
            if max(a["z"], b["z"]) > 1.0 and abs(a["x"] - b["x"]) < 1e-6 and abs(a["y"] - b["y"]) < 1e-6:
                xs.append(a["x"]); ys.append(a["y"])
        return min(xs), max(xs), min(ys), max(ys)

    @staticmethod
    def ridge_axis(r):
        if r["form"] == "shed":
            return "X" if str(r.get("low", "y")).startswith("y") else "Y"
        return r.get("ridge", "X")

    def run(self):
        inp = self.inp
        roofs = self.m.get("roofs", [])
        if len(roofs) != 1:
            raise SystemExit("ลม: รุ่นนี้รองรับอาคารหลังคาเดียว (พบ %d)" % len(roofs))
        r = roofs[0]
        if r["form"] not in ("gable", "shed"):
            raise SystemExit("ลม: หลังคาแบบ %s ยังไม่รองรับ" % r["form"])
        slope = r["pitch"]
        if r["form"] == "shed" and slope > 5:
            raise SystemExit("ลม: หลังคาเพิงชัน %.2f° (> 5°) — ยังไม่มีกติกา ต้องให้ Earth ตัดสินก่อน" % slope)
        x0, x1, y0, y1 = self.footprint()
        Lx, Ly = x1 - x0, y1 - y0
        Ds = min(Lx, Ly)
        ox = [p[0] for p in r["outline"]]; oy = [p[1] for p in r["outline"]]
        rx0, rx1, ry0, ry1 = min(ox), max(ox), min(oy), max(oy)
        if slope < 7:
            h, h_why = r["eave"], "ระดับชายคา (หลังคาชัน < 7°)"
        else:
            hi = r["eave"] + (Ly if self.ridge_axis(r) == "X" else Lx) / (2 if r["form"] == "gable" else 1) * math.tan(math.radians(slope))
            h, h_why = (r["eave"] + hi) / 2, "กึ่งกลางหลังคา"
        if h > 23 or h / Ds >= 1:
            raise SystemExit("ลม: h %.2f ม. Ds %.2f ม. เกินขอบเขตอาคารเตี้ยของตาราง ค (h ≤ 23 ม. และ h/Ds < 1)" % (h, Ds))
        z = max(min(0.10 * Ds, 0.40 * h), max(0.04 * Ds, 1.0))
        yE = max(6.0, 2 * z)
        meta = self.T["appC_meta"]
        c4 = meta["C4_height_factor"]
        ce = interp(max(h, c4["h_m"][0]), c4["h_m"], c4[inp["terrain"]])
        k = ce * inp["Iw"]
        V = str(int(inp["V50"]))
        appC = self.T["appC"]
        if V not in appC["C1_case1"]:
            raise SystemExit("ลม: ไม่มีคอลัมน์ V50 = %s ในตาราง ค (มี 25/27/29/30)" % V)
        ra = self.ridge_axis(r)
        B1 = self.T["B1"]["fig_B1_main_frame"]
        perpB1 = B1["case1_wind_perpendicular_to_ridge"]
        zi = {z_: i for i, z_ in enumerate(perpB1["zones"])}
        rows_b1 = [{"slope": s, **{z_: v[zi[z_]] for z_ in zi}} for s, v in perpB1["slope_deg"].items()]
        par = dict(zip(B1["case2_wind_parallel_to_ridge_all_slopes"]["zones"], B1["case2_wind_parallel_to_ridge_all_slopes"]["values"]))

        def share(zw, zl, perp):   # ส่วนของผนังต้นลมในค่ารวม (รูป ข.1)
            if perp:
                a, b = by_slope(rows_b1, slope, zw), by_slope(rows_b1, slope, zl)
            else:
                a, b = par[zw], par[zl]
            return a / (a - b)

        grids = self.m.get("grids", [])

        def gname(axis, c):
            g = [g_ for g_ in grids if g_["axis"] == axis and abs(g_["coord"] - c) < 0.01]
            return g[0]["name"] if g else ("%s%.2f" % (axis.lower(), c))

        ext = {"X": (x0, x1, rx0, rx1), "Y": (y0, y1, ry0, ry1)}
        patterns, zones = [], []
        for suf, tab, lc_perp, lc_par in VARIANTS[inp["cpi_case"]]:
            rows = [x for x in appC[tab][V]]
            for wa in ("X", "Y"):                 # แกนที่ลมพัด
                perp = wa != ra
                ba = "Y" if wa == "X" else "X"     # แกนตามแนวผนังต้นลม
                rws = [x for x in rows if x["load_case"] == (lc_perp if perp else lc_par)]
                if perp and slope >= 30:
                    self.warn.append("ลม: หลังคาชัน ≥ 30° มี load case ทางเลือก (lc2) — รุ่นนี้ยังไม่ใส่")

                def val(zone):
                    if perp:
                        return by_slope(rws, slope, zone) * k
                    return rws[0][zone] * k
                for sgn in (+1, -1):
                    a0, a1, ra0, ra1 = ext[wa]
                    b0, b1, rb0, rb1 = ext[ba]
                    w_face = a0 if sgn > 0 else a1     # ผนังต้นลม
                    l_face = a1 if sgn > 0 else a0
                    for cend in (0, 1):                # มุมต้นลม: ปลายต่ำ/สูงของแกน ba
                        pid = "W%s%s%s%s" % (wa, gname(wa, w_face), gname(ba, (b0, b1)[cend]), suf)
                        patterns.append({"id": pid, "kind": "wind", "axis": wa, "sign": sgn, "perp_ridge": perp,
                                         "corner": [gname(wa, w_face), gname(ba, (b0, b1)[cend])], "internal": suf or "-",
                                         "table": tab, "load_case": lc_perp if perp else lc_par})

                        def rect(arange, brange):
                            (p0, p1), (q0, q1) = arange, brange
                            return [p0, q0, p1, q1] if wa == "X" else [q0, p0, q1, p1]

                        def add(on, zone, value, **kw):
                            if abs(value) < 1e-9:
                                return
                            zones.append({"id": "WZ-%s-%s-%s" % (pid, on, zone), "pattern": pid, "on": on, "zone": zone,
                                          "value": round(value, 3), **kw})
                        if perp:
                            # E ตามแนวผนัง (แกน ba) จากมุมต้นลม · หลังคาแบ่งครึ่งตามแกนลม
                            Eb = (rb0, b0 + yE) if cend == 0 else (b1 - yE, rb1)
                            Nb = (b0 + yE, rb1) if cend == 0 else (rb0, b1 - yE)
                            mid = (a0 + a1) / 2
                            wa_half = (ra0, mid) if sgn > 0 else (mid, ra1)
                            le_half = (mid, ra1) if sgn > 0 else (ra0, mid)
                            for zn, half in (("2", wa_half), ("3", le_half)):
                                add("roof", zn + "E", val(zn + "E"), target=r["id"], rect=rect(half, Eb))
                                if Nb[1] > Nb[0] + 1e-6:
                                    add("roof", zn, val(zn), target=r["id"], rect=rect(half, Nb))
                            fb_E = (max(b0, Eb[0]), min(b1, Eb[1]))
                            fb_N = (max(b0, Nb[0]), min(b1, Nb[1]))
                            for zn, zl in (("1", "4"), ("1E", "4E")):
                                s = share(zn, zl, True)
                                rng = fb_E if zn.endswith("E") else fb_N
                                if rng[1] <= rng[0] + 1e-6:
                                    continue
                                add("face", zn, val(zn) * s, axis=wa, at=w_face, range=list(rng))
                                add("face", zl, -val(zn) * (1 - s), axis=wa, at=l_face, range=list(rng))
                        else:
                            # E ตามแกนลมจากด้านต้นลม · หลังคาแบ่งครึ่งตามแกน ba ฝั่งมุมต้นลม = 2
                            Ea = (ra0, a0 + yE) if sgn > 0 else (a1 - yE, ra1)
                            Na = (a0 + yE, ra1) if sgn > 0 else (ra0, a1 - yE)
                            mid = (b0 + b1) / 2
                            c_half = (rb0, mid) if cend == 0 else (mid, rb1)
                            o_half = (mid, rb1) if cend == 0 else (rb0, mid)
                            for zn, half in (("2", c_half), ("3", o_half)):
                                add("roof", zn + "E", val(zn + "E"), target=r["id"], rect=rect(Ea, half))
                                if Na[1] > Na[0] + 1e-6:
                                    add("roof", zn, val(zn), target=r["id"], rect=rect(Na, half))
                            fE = (b0, min(b1, b0 + yE)) if cend == 0 else (max(b0, b1 - yE), b1)
                            fN = (b0 + yE, b1) if cend == 0 else (b0, b1 - yE)
                            for zn, zl in (("5", "6"), ("5E", "6E")):
                                s = share(zn, zl, False)
                                rng = fE if zn.endswith("E") else fN
                                if rng[1] <= rng[0] + 1e-6:
                                    continue
                                add("face", zn, val(zn) * s, axis=wa, at=w_face, range=list(rng))
                                add("face", zl, -val(zn) * (1 - s), axis=wa, at=l_face, range=list(rng))
        derived = {"Ds": round(Ds, 3), "Lx": round(Lx, 3), "Ly": round(Ly, 3), "h": round(h, 3), "h_rule": h_why,
                   "z": round(z, 3), "y_E": round(yE, 3), "Ce_C4": round(ce, 4), "factor": round(k, 4),
                   "ridge": ra, "slope": slope, "table_V": V,
                   "faces": {"X": [x0, x1], "Y": [y0, y1]},
                   "ref": "มยผ.1311-50 ภาคผนวก ค ตาราง ค-1..ค-4 + รูป ข.1 (%s)" % os.path.basename(self.T["_path"])}
        self.notes.append("ลม: h %.2f ม. (%s) · Ds %.2f · z %.2f · y %.2f ม. · ค-4 %s = %.3f × Iw %.2f → ×%.3f ของตาราง V%s"
                          % (h, h_why, Ds, z, yE, inp["terrain"], ce, inp["Iw"], k, V))
        self.notes.append("ลม: %d กลุ่ม (4 มุมต้นลม × ตั้งฉาก/ขนานสัน × Cpi) · ไม่คิดแรงใต้ชายคายื่น · ฐานรากใช้ 70%% ของแรงลม (ข.1)" % len(patterns))
        return patterns, zones, derived


def combos(wind_ids):
    out = [{"id": "D", "method": "WSD", "factors": {"DL": 1, "SDL": 1}, "ref": "น้ำหนักคงที่ (ตรวจแรงปฏิกิริยา)"},
           {"id": "D+LR", "method": "WSD", "factors": {"DL": 1, "SDL": 1, "LR": 1}, "ref": "WSD D+Lr"}]
    for w in wind_ids:
        out += [{"id": "D+" + w, "method": "WSD", "factors": {"DL": 1, "SDL": 1, w: 1}, "ref": "WSD D+W"},
                {"id": "D+.75LR+.75" + w, "method": "WSD", "factors": {"DL": 1, "SDL": 1, "LR": 0.75, w: 0.75}, "ref": "WSD D+0.75Lr+0.75W"},
                {"id": ".6D+" + w, "method": "WSD", "factors": {"DL": 0.6, "SDL": 0.6, w: 1}, "ref": "WSD 0.6D+W"}]
    return out
