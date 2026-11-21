#!/usr/bin/env bash
# รันชุดทดสอบทั้งหมดของ UD Total Station (M3 · 22 พ.ย. 2569)
#   bash tools/test_all.sh          ทดสอบหน่วย + ท12 เทียบ golden
#   bash tools/test_all.sh --e2e    + ทดสอบส่งออก Excel ในเบราว์เซอร์ด้วยราคาจริง (ต้องมี Chrome, soffice, playwright)
# ไฟล์ตัวอย่างหลัก = examples/t12/t12.bm.json · อาคารตัวอย่างเดิม (sample-building) ใช้กับทดสอบที่ดัดแปลงโมเดลทีละจุด และ SAP
# ตัวแปร: UDMP=<โฟลเดอร์ UDmaterial-price> (ตรวจไฟล์ใช้ร่วม + pricing-v2) · EXCELJS=<โฟลเดอร์ exceljs> (ทดสอบ formxlsx)
cd "$(dirname "$0")/.." || exit 2
T12=examples/t12/t12.bm.json
SAMPLE=examples/sample-building.bm.json
UDMP=${UDMP:-../udmaterial-price}
pass=0; fail=0; failed=()
run() { local name="$1"; shift; local out; out=$("$@" 2>&1); local rc=$?
  if [ $rc -eq 0 ]; then pass=$((pass+1)); echo "ผ่าน     $name — $(echo "$out" | tail -1 | cut -c1-90)"
  else fail=$((fail+1)); failed+=("$name"); echo "ไม่ผ่าน  $name"; echo "$out" | grep -v '^PASS' | tail -15 | sed 's/^/         /'; fi; }

echo "== ท12 (ไฟล์ตัวอย่างหลัก)"
run "validate ท12"            python3 tools/validate.py $T12
run "golden ท12"              python3 tools/golden.py $T12
run "matlib ท12"              python3 tools/test_matlib.py $T12
run "mepsel ท12"              python3 tools/test_mepsel.py $T12
run "rebartk เว็บ=Python (ตัวอย่าง+ท12)" node tools/test_rebartk.js

echo "== ทดสอบหน่วย"
for t in tools/test_*.js; do case "$t" in *test_rebartk.js) continue;; esac; run "$(basename "$t")" node "$t"; done
run "test_takeoff.py"         python3 tools/test_takeoff.py
run "test_validate.py"        python3 tools/test_validate.py
run "test_sap.py"             python3 tools/test_sap.py
run "matlib ตัวอย่างเดิม"      python3 tools/test_matlib.py $SAMPLE
run "mepsel ตัวอย่างเดิม"      python3 tools/test_mepsel.py $SAMPLE
if [ -d "$UDMP/lib" ]; then run "ไฟล์ใช้ร่วมกับ Cost Hub" node tools/check_shared.js "$UDMP"; else echo "ข้าม     ไฟล์ใช้ร่วม (ไม่มี $UDMP)"; fi

if [ "$1" = "--e2e" ]; then
  echo "== ส่งออก Excel ครบวงจร (เบราว์เซอร์ + ราคาจริง)"
  run "e2e Excel ท12" python3 tools/e2e_xlsx.py $T12 --out /tmp/e2e_t12 --pricing "$UDMP"
fi
echo; echo "รวม: ผ่าน $pass · ไม่ผ่าน $fail${failed:+ (${failed[*]})}"
[ $fail -eq 0 ]
