"""ทดสอบตัวตรวจ: ไฟล์ตัวอย่างต้องผ่าน และไฟล์ที่แก้ให้เสียต้องถูกจับ
รัน: python tools/test_validate.py
"""
import copy, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validate import validate, model_hash  # noqa: E402

BASE = json.load(open(os.path.join(HERE, "..", "examples", "sample-building.bm.json"), encoding="utf-8"))


def run(name, mutate, expect_error=None, expect_level=None, expect_stale=None, expect_missing=None):
    m = copy.deepcopy(BASE)
    mutate(m)
    r = validate(m)
    ok = True
    if expect_error is None:
        ok &= not r["errors"]
    else:
        ok &= any(expect_error in e for e in r["errors"])
    if expect_level is not None:
        ok &= r["level"] == expect_level
    if expect_stale:
        ok &= all(r["stale"][k] == v for k, v in expect_stale.items())
    if expect_missing:
        ok &= any(expect_missing in x for x in r["missing"])
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"\n   errors={r['errors'][:3]} level={r['level']} stale={r['stale']}"))
    return ok


def set_(path, value):
    def f(m):
        cur = m
        for p in path[:-1]:
            cur = cur[p]
        cur[path[-1]] = value
    return f


def add_results(stale=False):
    def f(m):
        h = model_hash(m)
        env = {"max": 1.0, "min": -1.0, "combo_max": "W1", "combo_min": "W1"}
        m["results"] = {"source": "test.sdb", "model_hash": "0" * 16 if stale else h,
                        "members": {x["id"]: {"M3": env, "V2": env, "P": env} for x in m["members"]}}
    return f


def chain(*fs):
    def f(m):
        for g in fs:
            g(m)
    return f


tests = [
    ("ไฟล์ตัวอย่างผ่าน ระดับ L1", lambda m: None, None, 1),
    ("schema: ขาด meta.name", lambda m: m["meta"].pop("name"), "schema meta"),
    ("schema: status ผิดค่า", set_(["members", 0, "status"], "guess"), "schema members/0/status"),
    ("schema: คอนกรีตไม่มี fc", lambda m: m["materials"][0].pop("fc"), "schema materials/0"),
    ("schema: เหล็กรูปพรรณไม่มี kg_m", lambda m: m["sections"][2].pop("kg_m"), "schema sections/2"),
    ("schema: ส่วนบนสุดที่ไม่รู้จัก", set_(["foo"], 1), "schema (root)"),
    ("id ซ้ำ", set_(["members", 1, "id"], "C1-1A-1"), "ซ้ำ"),
    ("member อ้าง node ที่ไม่มี", set_(["members", 0, "j"], "N-XX"), "อ้าง node 'N-XX'"),
    ("member อ้าง section ที่ไม่มี", set_(["members", 0, "section"], "RC-99"), "อ้าง section"),
    ("member ยาวศูนย์", lambda m: m["members"][0].update(j=m["members"][0]["i"]), "ความยาวเป็นศูนย์"),
    ("ไม่มีระดับ GL", lambda m: m.update(levels=[l for l in m["levels"] if l["name"] != "GL"]), "ต้องมีระดับ GL"),
    ("ช่องเปิดเกินผนัง", set_(["openings", 0, "at"], 3.9), "เกินความยาวผนัง"),
    ("ช่องเปิดอ้าง type ที่ไม่มี", set_(["openings", 0, "type"], "D9"), "opening_type"),
    ("ผนังบนต่ำกว่าล่าง", set_(["walls", 0, "top"], 0.1), "ระดับบนต่ำกว่า"),
    ("f'c สมมติ = error", set_(["materials", 0, "status"], "assumed"), "f'c ต้องมาจากแบบ"),
    ("f'c สมมติผ่าน field_status = error", set_(["materials", 0, "field_status"], {"fc": {"status": "assumed"}}), "f'c ต้องมาจากแบบ"),
    ("area_load อ้าง target ที่ไม่มี", set_(["loads", "area_loads", 0, "targets"], ["R9"]), "slab/roof"),
    ("combo อ้าง pattern ที่ไม่มี", set_(["combos", 0, "factors"], {"DL": 1, "EQ": 1}), "pattern 'EQ'"),
    ("design อ้าง member ที่ไม่มี", lambda m: m["design"]["members"].update({"B9": {"status": "computed"}}), "design/members"),
    ("วงจรอ้างตู้ที่ไม่มี", set_(["mep", "electrical", "circuits", 0, "panel"], "LX"), "panel"),
    ("demolition นอกบัญชีต้องมี name", lambda m: m["demolition"][0].pop("wage_code"), "schema demolition/0"),
    ("ไม่มี combo → L0", lambda m: m.pop("combos"), None, 0),
    ("ค่า missing แสดงในรายการ", set_(["supports", 0, "status"], "missing"), None, None, None, "supports/F1-1A"),
    ("ผลวิเคราะห์ตรง hash + เหล็กตามแบบครบ → L3", add_results(), None, 3, {"results": False}),
    ("ผลวิเคราะห์ตรง hash แต่ยังไม่มีเหล็ก → L2", chain(add_results(), lambda m: m["design"]["members"].clear()), None, 2),
    ("ผลวิเคราะห์ hash เก่า → stale และค้าง L1", add_results(stale=True), None, 1, {"results": True}),
    ("แก้โมเดลหลังวิเคราะห์ → stale", chain(add_results(), set_(["sections", 0, "b"], 0.25)), None, 1, {"results": True}),
    ("แก้งานผิวไม่ทำให้ผลวิเคราะห์ stale", chain(add_results(), set_(["finishes", 0, "spec"], "กระเบื้องยาง")), None, 3, {"results": False}),
    ("ฐานรากไม่มีเหล็ก → ค้าง L2", chain(add_results(), lambda m: m["design"]["supports"].clear()), None, 2),
]

ok = all([run(*t) for t in tests])
print(f"\n{'ทั้งหมดผ่าน' if ok else 'มีที่ไม่ผ่าน'} ({len(tests)} กรณี)")
sys.exit(0 if ok else 1)
