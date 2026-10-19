// ทดสอบ lib/steelconn.js เทียบชีต Column Base Plate (NeoSteel) — รัน: node tools/test_steelconn.js
const SC = require('../lib/steelconn.js');
const data = require('./neo_baseplate_cases.json');
let ok = true, n = 0;
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const check = (name, good, extra = '') => { n++; ok = ok && !!good; if (!good) console.log('FAIL ' + name + ' ' + extra); };
data.cases.forEach((cs, i) => {
  const r = SC.basePlate(cs.input), e = cs.expect;
  ['fp', 'fpmin', 'fpe', 'fpmax', 'Me', 'F', 'm', 'n', 'treq', 'Areq', 'nb', 'La', 'x', 'y', 'Fb', 'Fp'].forEach(k => {
    if (typeof e[k] === 'number') check(`bp${i} ${k}`, near(r[k], e[k]), `เว็บ ${r[k]} Neo ${e[k]}`);
  });
  const c = k => (r.checks.find(x => x.code === k) || {}).ok;
  check(`bp${i} B`, c('B') === /OK/.test(e.okB)); check(`bp${i} L`, c('L') === /OK/.test(e.okL));
  check(`bp${i} edge`, c('edge') === !/เพิ่ม/.test(e.okEdge)); check(`bp${i} t`, c('t') === /OK/.test(e.okT));
  if (/OK|Fail/.test(e.okFmax || '')) check(`bp${i} fpmax`, c('fpmax') === /OK/.test(e.okFmax));
  if (/OK|Fail/.test(e.okFp || '')) check(`bp${i} fp`, c('fp') === /OK/.test(e.okFp));
});
const d = SC.basePlateDesign({ P: 6000, M: 400, type: 2, wide: 50, depth: 100, Fy: 2400, fcp: 240, edge: 40 });
check('ออกแบบเพลท ผ่าน', d.ok, JSON.stringify(d));
console.log(`  เพลท ${d.B}×${d.L}×${d.t} มม. สลัก ${d.nb * 2}-Ø${d.dBolt} ยาว ${d.La} ซม.`);
console.log((ok ? 'PASS' : 'FAIL') + ` steelconn ${n} ข้อ`);
process.exit(ok ? 0 : 1);
