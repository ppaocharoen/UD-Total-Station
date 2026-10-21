/*! viewer3d.js — แสดง .bm.json เป็น 3 มิติด้วย three.js r128 (ต้องโหลด THREE และ THREE.OrbitControls ก่อน)
 * พิกัด .bm.json: X ตามกริดตัวเลข, Y ตามกริดตัวอักษร, Z ขึ้น → three: x = X, y = Z, z = −Y
 * ทุก mesh มี userData.id = id ชิ้นส่วนใน .bm.json เพื่อคลิกโยงกับ BOQ
 */
(function (root) {
  'use strict';
  // ธีมเทอร์มินัล: คอนกรีตเทาเขียวเย็น เส้นขอบเรืองเขียว เหล็กเสริมเขียวสว่าง
  const COLORS = {
    footing: 0x4d5f57, column: 0x7c8d85, beam: 0x6b7d75, tie_beam: 0x5f7169, lintel: 0x8a9a92,
    steel: 0xc9a227, slab: 0x58695f, wall: 0x9a8f7a, roof: 0x1d6b48, finish: 0x2f8f5b, opening: 0x18c9c9,
    ceiling: 0xb8c8be, mep: 0xffb000, existing: 0x444444, rebar: 0x39ff14, stirrup: 0xc6ff00,
  };
  const EDGE = 0x00ff41, HILITE = 0xd8ffe0, BG = 0x000000;
  // ธีม 3D: terminal (มืด) / dos (สว่าง แบบ MS-DOS Shell)
  const THEMES = {
    terminal: { bg: BG, edge: EDGE, hot: HILITE, hotEdge: 0xffffff, grid: 0x00ff41, gridOp: [0.13, 0.28], gl: '#18ffff', glFill: 'rgba(0,10,12,0.85)', shadow: 0.55 },
    plain: { bg: 0xeef1f5, edge: 0x334155, hot: 0x60a5fa, hotEdge: 0x1d4ed8, grid: 0x94a3b8, gridOp: [0.2, 0.4], gl: '#1d4ed8', glFill: 'rgba(255,255,255,0.95)', shadow: 0.25 },
    dos: { bg: 0xa8a8a8, edge: 0x000000, hot: 0x5555ff, hotEdge: 0x0000a8, grid: 0x545454, gridOp: [0.18, 0.4], gl: '#0000a8', glFill: 'rgba(255,255,255,0.95)', shadow: 0.3 },
  };
  const CONCRETE = ['ฐานราก', 'เสา', 'คาน', 'พื้น'];
  // ชั้นข้อมูลแบ่งเป็นหมวด (ชื่อกลุ่ม = key ภายใน · LABEL = ชื่อที่แสดง)
  const CATS = [
    ['โครงสร้าง', ['ฐานราก', 'เสา', 'คาน', 'พื้น', 'เหล็กรูปพรรณ', 'เหล็กเสริม']],
    ['สถาปัตย์', ['ผนัง', 'เสาเอ็น-ทับหลัง', 'ประตู-หน้าต่าง', 'งานผิว', 'ฝ้า', 'หลังคา', 'เคาน์เตอร์-อุปกรณ์']],
    ['สุขาภิบาล', ['ท่อประปา', 'ท่อระบายน้ำ', 'สุขภัณฑ์', 'อุปกรณ์สุขาภิบาล']],
    ['ไฟฟ้า', ['ดวงโคม', 'สวิตช์-เต้ารับ', 'ตู้ไฟ', 'ท่อร้อยสาย']]];
  const LABEL = { 'เสา': 'เสา-ตอม่อ', 'เหล็กรูปพรรณ': 'โครงหลังคาเหล็ก' };
  const ARCH = CATS.slice(1).flatMap(c => c[1]);
  // ขนาดโตนอกท่อ (ม.) ตามขนาดเรียก
  const PIPE_OD = { '1/2"': 0.0213, '3/4"': 0.0267, '1"': 0.0334, '1 1/4"': 0.0422, '1 1/2"': 0.0483, '2"': 0.0603, '2 1/2"': 0.073, '3"': 0.0889, '4"': 0.1143, '6"': 0.1683, '8"': 0.2191 };
  const pipeOD = d => PIPE_OD[String(d).replace(/\s+/g, ' ').trim()] || (parseFloat(d) > 0 ? parseFloat(d) * 0.0254 : 0.03);
  // ลายผิววัสดุ (canvas) — repeat ตามขนาดชิ้น
  const TEX = {};
  function texCanvas(kind) {
    if (TEX[kind]) return TEX[kind];
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    if (kind === 'tile') { c.fillStyle = '#eef3f6'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#9fb0ba'; c.lineWidth = 3; c.strokeRect(1, 1, 126, 126); }
    else if (kind === 'brick') { c.fillStyle = '#d8d0c4'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#b4583c';
      for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) c.fillRect(k * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28); }
    else if (kind === 'granito') { c.fillStyle = '#cfc9bd'; c.fillRect(0, 0, 128, 128); for (let i = 0; i < 260; i++) { c.fillStyle = ['#8f877a', '#e9e4da', '#a69c8c'][i % 3]; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
      c.strokeStyle = '#a49d90'; c.lineWidth = 2; c.strokeRect(1, 1, 126, 126); }
    return (TEX[kind] = cv);
  }
  function texMat(kind, ru, rv, color) {
    const t = new THREE.CanvasTexture(texCanvas(kind)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(ru, 0.01), Math.max(rv, 0.01));
    return new THREE.MeshLambertMaterial({ color: color || 0xffffff, map: t, side: THREE.DoubleSide });
  }
  const FINISH = {   // ผิวผนังตามป้ายวัสดุ ①–⑦: สี / ลาย (ขนาดลาย ม.)
    '1': { color: 0xf1ede4 }, '2': { tex: 'tile', cell: [0.30, 0.30] }, '4': { tex: 'brick', cell: [0.40, 0.26] }, '6': { color: 0xc8b89a } };
  // กล่องหมุนตามทิศหันหน้า: ศูนย์กลาง (x, y, z) · df = ลึก (ตามทิศหน้า) · ds = กว้าง · dz = สูง · rot = องศาทิศหน้าในแปลน
  function obox(x, y, z, df, ds, dz, rot, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(df, dz, ds), mat); m.position.copy(P(x, y, z)); m.rotation.y = (rot || 0) * Math.PI / 180; return m;
  }
  // ทรงกระบอก/วงรีตั้ง: rf = รัศมีตามทิศหน้า · rs = รัศมีด้านข้าง
  function ocyl(x, y, z0, z1, rf, rs, rot, mat, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, z1 - z0, seg || 24), mat); m.scale.set(rf, 1, rs);
    m.position.copy(P(x, y, (z0 + z1) / 2)); m.rotation.y = (rot || 0) * Math.PI / 180; return m;
  }
  const loc = (x, y, rot, f, sd) => { const c = Math.cos((rot || 0) * Math.PI / 180), sn = Math.sin((rot || 0) * Math.PI / 180); return [x + f * c - sd * sn, y + f * sn + sd * c]; };
  const P = (x, y, z) => new THREE.Vector3(x, z, -y);

  function roofPlanes(rf) {
    // พอร์ตจาก phiso roof_planes (gable / hip / shed / flat) ในพิกัด X,Y,Z ของ .bm.json
    const xs = rf.outline.map(p => p[0]), ys = rf.outline.map(p => p[1]);
    const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys), z0 = rf.eave;
    const t = Math.tan((rf.pitch || 0) * Math.PI / 180), L = x2 - x1, D = y2 - y1;
    const ridge = rf.ridge || (L >= D ? 'X' : 'Y');
    if (rf.form === 'custom') return (rf.planes || []).map(p => p.pts);
    if (rf.form === 'flat') return [[[x1, y1, z0], [x2, y1, z0], [x2, y2, z0], [x1, y2, z0]]];
    if (rf.form === 'shed') {
      const low = rf.low || 'y1';
      if (low === 'y1') return [[[x1, y1, z0], [x2, y1, z0], [x2, y2, z0 + D * t], [x1, y2, z0 + D * t]]];
      if (low === 'y2') return [[[x1, y2, z0], [x2, y2, z0], [x2, y1, z0 + D * t], [x1, y1, z0 + D * t]]];
      if (low === 'x1') return [[[x1, y1, z0], [x1, y2, z0], [x2, y2, z0 + L * t], [x2, y1, z0 + L * t]]];
      return [[[x2, y1, z0], [x2, y2, z0], [x1, y2, z0 + L * t], [x1, y1, z0 + L * t]]];
    }
    if (rf.form === 'gable') {
      if (ridge === 'X') { const h = D / 2, ym = y1 + h, zt = z0 + h * t;
        return [[[x1, y1, z0], [x2, y1, z0], [x2, ym, zt], [x1, ym, zt]], [[x2, y2, z0], [x1, y2, z0], [x1, ym, zt], [x2, ym, zt]]]; }
      const h = L / 2, xm = x1 + h, zt = z0 + h * t;
      return [[[x1, y2, z0], [x1, y1, z0], [xm, y1, zt], [xm, y2, zt]], [[x2, y1, z0], [x2, y2, z0], [xm, y2, zt], [xm, y1, zt]]];
    }
    if (rf.form === 'hip') {
      if (ridge === 'X') { const h = D / 2, ym = y1 + h, zt = z0 + h * t; let a = x1 + h, b = x2 - h; if (b < a) a = b = (x1 + x2) / 2;
        return [[[x1, y1, z0], [x2, y1, z0], [b, ym, zt], [a, ym, zt]], [[x2, y2, z0], [x1, y2, z0], [a, ym, zt], [b, ym, zt]],
          [[x1, y2, z0], [x1, y1, z0], [a, ym, zt]], [[x2, y1, z0], [x2, y2, z0], [b, ym, zt]]]; }
      const h = L / 2, xm = x1 + h, zt = z0 + h * t; let a = y1 + h, b = y2 - h; if (b < a) a = b = (y1 + y2) / 2;
      return [[[x1, y2, z0], [x1, y1, z0], [xm, a, zt], [xm, b, zt]], [[x2, y1, z0], [x2, y2, z0], [xm, b, zt], [xm, a, zt]],
        [[x1, y1, z0], [x2, y1, z0], [xm, a, zt]], [[x2, y2, z0], [x1, y2, z0], [xm, b, zt]]];
    }
    return [];
  }

  // เส้นแป (along 'u' ขนานชายคา) / จันทัน (along 'v' ตามลาด) — พอร์ตจาก tools/roofgeom.py plane_lines (ให้ตรงกับที่ถอดปริมาณ)
  const vs = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vd = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vx = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vn = a => { const l = Math.hypot(...a) || 1; return a.map(c => c / l); };
  function planeLines(pts, spacing, along) {
    const O = pts[0], u = vn(vs(pts[1], pts[0])), n = vn(vx(u, vs(pts[2], pts[0])));
    let v = vn(vx(n, u)); if (v[1] < 0) v = v.map(c => -c);
    const P2 = pts.map(p => [vd(vs(p, O), u), vd(vs(p, O), v)]), segs = [];
    if (!(spacing > 0)) return { segs, n };
    const idx = along === 'u' ? 1 : 0;
    const lo = Math.min(...P2.map(p => p[idx])), hi = Math.max(...P2.map(p => p[idx]));
    const to3 = (uu, vv) => [O[0] + u[0] * uu + v[0] * vv, O[1] + u[1] * uu + v[1] * vv, O[2] + u[2] * uu + v[2] * vv];
    for (let c = lo + (along === 'u' ? 0.05 : spacing / 2); c <= hi - 0.02; c += spacing) {
      const hits = [];
      for (let i = 0; i < P2.length; i++) {
        const a = P2[i], b = P2[(i + 1) % P2.length];
        if ((a[idx] - c) * (b[idx] - c) <= 0 && Math.abs(a[idx] - b[idx]) > 1e-9) { const k = (c - a[idx]) / (b[idx] - a[idx]); hits.push(a[1 - idx] + k * (b[1 - idx] - a[1 - idx])); }
      }
      if (hits.length >= 2) { const s0 = Math.min(...hits), s1 = Math.max(...hits);
        if (s1 - s0 > 0.05) segs.push(along === 'u' ? [to3(s0, c), to3(s1, c)] : [to3(c, s0), to3(c, s1)]); }
    }
    return { segs, n: n[2] < 0 ? n.map(c => -c) : n };
  }

  // ผนังเอียงตามพื้นลาด: ด้านข้างตั้งฉาก ท้อง/ยอดเอียง (สี่เหลี่ยมด้านขนาน) หนา t
  function slopedWall(a, b, z0, z1, h, t, mat) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * t / 2, ny = (b[0] - a[0]) / L * t / 2;
    const c = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], zz = [z0, z1, z1, z0];
    const V = [];
    c.forEach((p, i) => V.push(P(p[0], p[1], zz[i]))); c.forEach((p, i) => V.push(P(p[0], p[1], zz[i] + h)));
    const F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
    const g = new THREE.BufferGeometry(); g.setFromPoints(F.flat().map(k => V[k])); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }

  function boxBetween(a, b, w, h, mat, angleDeg) {
    const va = P(...a), vb = P(...b), len = va.distanceTo(vb);
    const g = new THREE.BoxGeometry(w, h, len);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    const dir = vb.clone().sub(va).normalize();
    // แกน z ของกล่องชี้ตามชิ้นส่วน; แกน y ของหน้าตัดชี้ขึ้น (หรือ +X สำหรับเสา)
    const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3().crossVectors(up, dir).normalize();
    const yAxis = new THREE.Vector3().crossVectors(dir, xAxis).normalize();
    const mtx = new THREE.Matrix4().makeBasis(xAxis, yAxis, dir);
    m.quaternion.setFromRotationMatrix(mtx);
    if (angleDeg) m.rotateZ(angleDeg * Math.PI / 180);
    return m;
  }

  function polyMesh(pts3, mat) {
    const g = new THREE.BufferGeometry();
    const v = [];
    for (let i = 1; i < pts3.length - 1; i++) [pts3[0], pts3[i], pts3[i + 1]].forEach(p => { const q = P(...p); v.push(q.x, q.y, q.z); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }

  function slabMesh(poly, bottom, t, mat, ramp, holes) {
    const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], p[1])));
    (holes || []).forEach(h => shape.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1])))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    if (ramp && ramp.dir) {   // พื้นทางลาด: ลดระดับเชิงเส้นจากฝั่งสูง (top = high) ไปฝั่งต่ำตามทิศ dir (ทิศขึ้นลาด)
      const ax = ramp.dir.includes('X') ? 0 : 1, neg = ramp.dir[0] === '-';
      const vs = poly.map(p => p[ax]), lo = Math.min(...vs), hi = Math.max(...vs), dh = (ramp.high - ramp.low) || 0;
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const v = ax ? pos.getY(i) : pos.getX(i);
        let f = hi > lo ? (v - lo) / (hi - lo) : 1; if (neg) f = 1 - f;
        pos.setZ(i, pos.getZ(i) - dh * (1 - f));
      }
      pos.needsUpdate = true; g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;          // shape XY → three XZ (y ของ shape → −z)
    m.position.y = bottom;
    return m;
  }

  // ------------------------------------------------------------ เหล็กเสริม (เส้น) จาก design
  const COVER = 0.04;
  function spread(n, a, b) { if (n <= 1) return [(a + b) / 2]; return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); }
  function perimPts(n, hx, hy) {   // ตำแหน่งเหล็กยืนเสา n เส้นรอบหน้าตัด (มุมก่อน)
    const c = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
    if (n <= 4) return c.slice(0, Math.max(n, 1));
    const out = c.slice(), extra = n - 4, perSide = [0, 0, 0, 0];
    for (let i = 0; i < extra; i++) perSide[i % 4]++;
    perSide.forEach((k, s) => { const a = c[s], b = c[(s + 1) % 4]; for (let i = 1; i <= k; i++) { const t = i / (k + 1); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } });
    return out;
  }
  function rebarLines(kind, geo, rb) {
    // คืน {main: [[p,q],...], tie: [[p,q],...], dm: [Ø มม. ต่อเส้น main], dt: Ø ปลอก} ในพิกัด .bm.json
    const main = [], tie = [], dm = [], D = v => +(v || 0) || 12;
    const mark = (n0, d) => { while (dm.length < main.length) dm.push(D(d)); };
    const rect = (cx, cy, z, hx, hy, ux, uy) => {   // สี่เหลี่ยมปลอกรอบจุด (ระนาบแนวนอน)
      const vx = -uy, vy = ux, P4 = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([a, b]) => [cx + ux * a + vx * b, cy + uy * a + vy * b, z]);
      for (let i = 0; i < 4; i++) tie.push([P4[i], P4[(i + 1) % 4]]);
    };
    if (kind === 'column') {
      const { a, b, w, h } = geo, hx = w / 2 - COVER, hy = h / 2 - COVER;
      const z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
      if (rb.main) { perimPts(rb.main[0], hx, hy).forEach(([dx, dy]) => main.push([[a[0] + dx, a[1] + dy, z0], [a[0] + dx, a[1] + dy, z1]])); mark(0, rb.main[1]); }
      if (rb.stirrup) { const sp = rb.stirrup[1] || 0.15; for (let z = z0 + 0.05; z < z1 - 0.02; z += sp) rect(a[0], a[1], z, hx, hy, 1, 0); }
    } else if (kind === 'beam') {
      const { a, b, w, h } = geo, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return { main, tie, dm, dt: 6 };
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, vx = -uy, vy = ux, hw = w / 2 - COVER;
      const zt = a[2] - COVER, zb = a[2] - h + COVER;
      const bars = (n, z) => spread(n, -hw, hw).forEach(o => main.push([[a[0] + vx * o, a[1] + vy * o, z], [b[0] + vx * o, b[1] + vy * o, z]]));
      if (rb.top) { bars(rb.top[0], zt); mark(0, rb.top[1]); }
      if (rb.bot) { bars(rb.bot[0], zb); mark(0, rb.bot[1]); }
      if (rb.extra_top) spread(rb.extra_top[0], -hw * 0.6, hw * 0.6).forEach(o => {
        [[0, L / 4], [L * 3 / 4, L]].forEach(([s0, s1]) => main.push([[a[0] + ux * s0 + vx * o, a[1] + uy * s0 + vy * o, zt - 0.02], [a[0] + ux * s1 + vx * o, a[1] + uy * s1 + vy * o, zt - 0.02]])); });
      if (rb.extra_top) mark(0, rb.extra_top[1]);
      if (rb.stirrup) {
        const sp = rb.stirrup[1] || 0.15, se = rb.stirrup[2] || sp;
        for (let t = 0.05; t < L - 0.02;) {
          const zc = (zt + zb) / 2, hz = (zt - zb) / 2, cx = a[0] + ux * t, cy = a[1] + uy * t;
          const pts = [[-hw, -hz], [hw, -hz], [hw, hz], [-hw, hz]].map(([o, dz]) => [cx + vx * o, cy + vy * o, zc + dz]);
          for (let i = 0; i < 4; i++) tie.push([pts[i], pts[(i + 1) % 4]]);
          t += (t < L / 4 || t > L * 3 / 4) ? se : sp;
        }
      }
    } else if (kind === 'footing') {
      const { c, b, d, bottom } = geo, z1 = bottom + 0.075, z2 = z1 + 0.015;
      const bu = rb.bend_up || 0, leg = (p, z) => { if (bu) main.push([[p[0], p[1], z], [p[0], p[1], z + bu]]); };   // ปลายหักขึ้น
      if (rb.bars_x) { spread(rb.bars_x[0], -d / 2 + 0.075, d / 2 - 0.075).forEach(o => { const a = [c[0] - b / 2 + 0.075, c[1] + o], e = [c[0] + b / 2 - 0.075, c[1] + o];
        main.push([[...a, z1], [...e, z1]]); leg(a, z1); leg(e, z1); }); mark(0, rb.bars_x[1]); }
      if (rb.bars_y) { spread(rb.bars_y[0], -b / 2 + 0.075, b / 2 - 0.075).forEach(o => { const a = [c[0] + o, c[1] - d / 2 + 0.075], e = [c[0] + o, c[1] + d / 2 - 0.075];
        main.push([[...a, z2], [...e, z2]]); leg(a, z2); leg(e, z2); }); mark(0, rb.bars_y[1]); }
    } else if (kind === 'slab' && rb.mesh) {
      const { poly, z } = geo, sp = rb.mesh[1] || 0.2, xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if ((x1 - x0) / sp + (y1 - y0) / sp < 600) {
        for (let y = y0 + sp / 2; y < y1; y += sp) main.push([[x0 + 0.05, y, z], [x1 - 0.05, y, z]]);
        for (let x = x0 + sp / 2; x < x1; x += sp) main.push([[x, y0 + 0.05, z + 0.01], [x, y1 - 0.05, z + 0.01]]);
        mark(0, rb.mesh[0]);
      }
    } else if (kind === 'slab' && rb.mesh_xy) {   // ผลออกแบบพื้น: x = เหล็กวางตามแกน x
      const { poly, z } = geo, mx = rb.mesh_xy, xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), sx = (mx.x || [])[1] || 0.2, sy = (mx.y || [])[1] || 0.2;
      if ((y1 - y0) / sx + (x1 - x0) / sy < 600) {
        if (mx.x) for (let y = y0 + sx / 2; y < y1; y += sx) main.push([[x0 + 0.05, y, z], [x1 - 0.05, y, z]]);
        if (mx.y) for (let x = x0 + sy / 2; x < x1; x += sy) main.push([[x, y0 + 0.05, z + 0.01], [x, y1 - 0.05, z + 0.01]]);
        mark(0, Math.max((mx.x || [0])[0], (mx.y || [0])[0]));
      }
    }
    mark(0, 12);
    return { main, tie, dm, dt: +((rb.stirrup || [])[0]) || 6 };
  }
  /** เหล็กเสริมเป็นท่อกลมตามขนาดจริง: segs [[p,q]], dia มม. (ตัวเลขเดียวหรืออาร์เรย์ต่อเส้น) — รวมเป็น geometry เดียว */
  function tubeMesh(segs, dia, color) {
    const N = 6, pos = [], nor = [], idx = [], up = new THREE.Vector3(0, 1, 0);
    segs.forEach(([p, q], k) => {
      const a = P(...p), b = P(...q), d = b.clone().sub(a), L = d.length(); if (L < 1e-6) return;
      const r = (Array.isArray(dia) ? dia[k] : dia) / 2000, qn = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()), base = pos.length / 3;
      for (let i = 0; i < N; i++) {
        const t = i / N * Math.PI * 2, n = new THREE.Vector3(Math.cos(t), 0, Math.sin(t)).applyQuaternion(qn);
        [a, b].forEach(e => { pos.push(e.x + n.x * r, e.y + n.y * r, e.z + n.z * r); nor.push(n.x, n.y, n.z); });
      }
      for (let i = 0; i < N; i++) { const j = (i + 1) % N, a0 = base + i * 2, b0 = a0 + 1, a1 = base + j * 2, b1 = a1 + 1; idx.push(a0, a1, b0, b0, a1, b1); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide }));
  }
  function lineMesh(segs, color) {
    const v = []; segs.forEach(([p, q]) => { const a = P(...p), b = P(...q); v.push(a.x, a.y, a.z, b.x, b.y, b.z); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
  }

  class Viewer {
    constructor(el, opts = {}) {
      this.el = el;
      this.onPick = opts.onPick || (() => {});
      this.scene = new THREE.Scene();
      this.th = THEMES.terminal;
      this.scene.background = new THREE.Color(opts.background ?? BG);
      this.pcam = this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
      this.ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000); this.ortho = false;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.clippingPlanes = [];
      this.hl = new Set(); this.xray = false; this.state = null;
      el.appendChild(this.renderer.domElement);
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
      this.controls.addEventListener('start', () => { this._lastView = null; });
      this.scene.add(new THREE.HemisphereLight(0xd8ffe8, 0x0a1a10, 0.75));
      const dl = this.sun = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(30, 50, 20); dl.castShadow = true;
      dl.shadow.mapSize.set(2048, 2048); dl.shadow.bias = -0.0004; this.scene.add(dl); this.scene.add(dl.target);
      this.groups = {};
      this.byId = {};
      this.ray = new THREE.Raycaster(); this.ray.params.Line = { threshold: 0.06 };
      // แตะ/คลิกโดยไม่ลาก = เลือกชิ้นส่วน (มือถือ: OrbitControls กิน touch จน 'click' ไม่เกิด)
      const dom = this.renderer.domElement; let down = null;
      dom.addEventListener('pointerdown', e => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), n: 1 } : (down && (down.n = 2), down); });
      dom.addEventListener('pointerup', e => {
        if (!down || !e.isPrimary) return; const d = down; down = null;
        if (d.n === 1 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && performance.now() - d.t < 600) this._click(e);
      });
      new ResizeObserver(() => this.resize()).observe(el);
      const loop = () => { requestAnimationFrame(loop); if (!this.el.offsetParent) return; this.controls.update(); this.renderer.render(this.scene, this.camera); };
      loop();
    }
    resize() {
      const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
      this.pcam.aspect = w / h; this.pcam.updateProjectionMatrix();
      if (this.ortho) this._syncOrtho(true);
    }
    /** มุมมองแบบขนาน (parallel/orthographic): กว้างเท่ามุมมองเดิมที่ระยะถึงจุดเล็ง · keepZoom = แค่ปรับสัดส่วนจอ */
    _syncOrtho(keepZoom) {
      const o = this.ocam, w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
      if (!keepZoom || !this._oh) { const d = this.camera.position.distanceTo(this.controls.target); this._oh = d * Math.tan(THREE.MathUtils.degToRad(this.pcam.fov / 2)); o.zoom = 1; }
      o.top = this._oh; o.bottom = -this._oh; o.right = this._oh * w / h; o.left = -o.right; o.updateProjectionMatrix();
    }
    setParallel(on) {
      on = !!on; if (on === this.ortho) return;
      const from = this.camera, to = on ? this.ocam : this.pcam;
      if (!on) {   // กลับเป็น perspective: ระยะกล้องให้ภาพขนาดเท่ากับ zoom ปัจจุบัน
        const hh = this._oh / (this.ocam.zoom || 1), d = hh / Math.tan(THREE.MathUtils.degToRad(this.pcam.fov / 2));
        const dir = from.position.clone().sub(this.controls.target).normalize(); to.position.copy(this.controls.target.clone().add(dir.multiplyScalar(d)));
      } else to.position.copy(from.position);
      to.quaternion.copy(from.quaternion); to.up.copy(from.up);
      this.ortho = on; this.camera = to; this.controls.object = to;
      if (on) this._syncOrtho(); else to.updateProjectionMatrix();
      this.controls.update();
      if (['front', 'back', 'left', 'right', 'top'].includes(this._lastView)) this.setView(this._lastView);   // อยู่ที่รูปด้านอยู่แล้ว → จัดมุมใหม่
    }
    _moved() { if (this.ortho) this._syncOrtho(); }
    _mat(key, opacity) {
      return new THREE.MeshLambertMaterial({ color: COLORS[key] || 0xaaaaaa, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
    }
    _add(group, mesh, id, info, extra) {
      if (!this.groups[group]) { this.groups[group] = new THREE.Group(); this.groups[group].name = group; this.scene.add(this.groups[group]); }
      mesh.material = mesh.material.clone();
      if (mesh.isMesh) {
        mesh.castShadow = true; mesh.receiveShadow = true;
        if (this.edges !== false && mesh.geometry && !(extra && extra.noEdge)) {
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: this.th.edge, transparent: true, opacity: 0.35 }));
          e.raycast = () => {}; mesh.add(e); mesh.userData_edge = e;
        }
      }
      mesh.userData = Object.assign({ id, info, group, baseColor: mesh.material.color.getHex(), baseOpacity: mesh.material.opacity,
        pos0: mesh.position.clone(), z: mesh.position.y }, extra || {});
      mesh.updateMatrixWorld(true); mesh.userData.bb = new THREE.Box3().setFromObject(mesh);
      this.groups[group].add(mesh);
      if (id) (this.byId[id] = this.byId[id] || []).push(mesh);
    }
    load(m) {
      this._m = m;
      Object.values(this.groups).forEach(g => this.scene.remove(g));
      this.groups = {}; this.byId = {};
      const nodes = Object.fromEntries((m.nodes || []).map(n => [n.id, n]));
      const secs = Object.fromEntries((m.sections || []).map(s => [s.id, s]));
      (m.supports || []).forEach(f => {
        const n = nodes[f.node]; if (!n || !f.b) return;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(f.b, f.h, f.d), this._mat('footing', 1));
        mesh.position.copy(P(n.x, n.y, f.bottom + f.h / 2));
        this._add('ฐานราก', mesh, f.id, `${f.mark || ''} ${f.b}×${f.d}×${f.h} ม.${f.piles ? ` เข็ม ${f.piles.n} ต้น ${f.piles.type} ยาว ${f.piles.length} ม.` : ''}`);
        const rb = (((m.design || {}).supports || {})[f.id] || {}).rebar;
        if (rb) this._rebar(rebarLines('footing', { c: [n.x, n.y], b: f.b, d: f.d, bottom: f.bottom }, rb), f.id);
      });
      // กำแพงกันดิน (แท็บออกแบบ): start = ปลายแนวหน้าผนัง · ส้นฐาน/ผนังอยู่ฝั่งดิน · ไม่มีตำแหน่ง = ไม่วาด
      const glz = ((m.levels || []).find(l => l.name === 'GL') || { z: 0 }).z;
      (m.retaining_walls || []).forEach(w => {
        if (!w.start) return;
        const u = { '+X': [1, 0], '-X': [-1, 0], '+Y': [0, 1], '-Y': [0, -1] }[w.dir || '+X'] || [1, 0], nl = [-u[1], u[0]], sn = w.soil === 'right' ? [-nl[0], -nl[1]] : nl;
        const bot = w.bottom !== undefined ? w.bottom : glz - w.tb, B = w.B1 + w.B2, L = w.length;
        const at = (off, along, z) => [w.start[0] + u[0] * along + sn[0] * off, w.start[1] + u[1] * along + sn[1] * off, z];
        const ob = (w.B2 - w.B1) / 2, zb = bot + w.tb / 2, hw = w.H - w.tb, zw = bot + w.tb + hw / 2;
        const info = `${w.mark || w.id} กำแพงกันดิน ยาว ${L} ม. สูง ${w.H} ม. ฐาน ${B}×${w.tb} ม.`;
        this._add('ฐานราก', boxBetween(at(ob, 0, zb), at(ob, L, zb), B, w.tb, this._mat('footing', 1)), w.id, info);
        this._add('ฐานราก', boxBetween(at(w.tw / 2, 0, zw), at(w.tw / 2, L, zw), w.tw, hw, this._mat('footing', 1)), w.id, info);
      });
      // ปลายคาน คสล. ที่ชนคานแนวอื่น: ยืดเข้าไปครึ่งความกว้างคานที่ชน — มุมคานเต็ม ไม่แหว่ง (แสดงผลเท่านั้น)
      const isRC = x => (x.type === 'beam' || x.type === 'tie_beam') && secs[x.section] && secs[x.section].kind && secs[x.section].kind.startsWith('rc');
      const xyk = n => `${(+n.x).toFixed(2)},${(+n.y).toFixed(2)}`, atXY = {};
      (m.members || []).filter(isRC).forEach(x => [x.i, x.j].forEach(id => { const n = nodes[id]; if (n) (atXY[xyk(n)] = atXY[xyk(n)] || []).push(x); }));
      const ext = (x, n, dir) => Math.max(0, ...(atXY[xyk(n)] || []).filter(y => y !== x).map(y => {
        const p = nodes[y.i], q = nodes[y.j]; const d = vn([q.x - p.x, q.y - p.y, 0]);
        return Math.abs(d[0] * dir[0] + d[1] * dir[1]) < 0.5 ? (secs[y.section].b || 0) / 2 : 0; }));
      const isSt = x => secs[x.section] && ['steel', 'cold_formed'].includes(secs[x.section].kind);
      const stEnds = []; (m.members || []).filter(isSt).forEach(x => [x.i, x.j].forEach(id => { const n = nodes[id]; if (n) stEnds.push([n, x]); }));
      const nearSt = n => stEnds.filter(([q]) => Math.hypot(q.x - n.x, q.y - n.y, q.z - n.z) < 0.02).map(([, y]) => y);   // ปลายห่างกันไม่เกิน 2 ซม. ถือว่าชนกัน
      const stExt = (x, n, dir) => Math.max(0, ...nearSt(n).filter(y => y !== x).map(y => {
        const p = nodes[y.i], q = nodes[y.j], d = vn([q.x - p.x, q.y - p.y, q.z - p.z]), dm = (secs[y.section].dims) || {};
        if (Math.abs(d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) > 0.5) return 0;   // ต่อแนวเดียวกัน
        const yVert = Math.abs(d[2]) > 0.9, xVert = Math.abs(dir[2]) > 0.9;
        return ((xVert ? dm.h : (yVert ? Math.max(dm.b || 0, dm.h || 0) : dm.b)) || 0) / 2; }));
      (m.members || []).forEach(x => {
        const a = nodes[x.i], b = nodes[x.j], s = secs[x.section]; if (!a || !b || !s) return;
        let w = s.b || (s.dims && s.dims.b) || 0.08, h = s.h || (s.dims && s.dims.h) || 0.12;
        if (s.kind === 'cold_formed' || s.kind === 'steel') { w = (s.dims && s.dims.b) || 0.05; h = (s.dims && s.dims.h) || 0.1; }
        const steel = s.kind === 'steel' || s.kind === 'cold_formed';
        const key = steel ? 'steel' : (COLORS[x.type] ? x.type : 'beam');
        const pa = [a.x, a.y, a.z], pb = [b.x, b.y, b.z];
        if (!steel && (x.type === 'beam' || x.type === 'tie_beam' || x.type === 'lintel')) {
          pa[2] -= h / 2; pb[2] -= h / 2;   // node = หลังคาน
          const L = Math.hypot(b.x - a.x, b.y - a.y);
          if (L > 1e-6) { const dir = [(b.x - a.x) / L, (b.y - a.y) / L], ea = ext(x, a, dir), eb = ext(x, b, dir);
            pa[0] -= dir[0] * ea; pa[1] -= dir[1] * ea; pb[0] += dir[0] * eb; pb[1] += dir[1] * eb; }
        }
        if (steel) {   // เหล็กรูปพรรณที่มาชนกันที่จุดเดียวกัน: ยืดปลายเข้าไปครึ่งขนาดชิ้นที่ชน — มุมเต็ม ไม่แหว่ง (แสดงผลเท่านั้น)
          const L3 = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          if (L3 > 1e-6) {
            const dir = [(b.x - a.x) / L3, (b.y - a.y) / L3, (b.z - a.z) / L3], ea = stExt(x, a, dir), eb = stExt(x, b, dir);
            for (let k = 0; k < 3; k++) { pa[k] -= dir[k] * ea; pb[k] += dir[k] * eb; }
          }
        }
        const mesh = boxBetween(pa, pb, w, h, this._mat(key, 1), x.angle);
        const grp = (x.type === 'stiffener' || x.type === 'lintel') ? 'เสาเอ็น-ทับหลัง' : x.type === 'column' ? 'เสา' : steel ? 'เหล็กรูปพรรณ' : 'คาน';
        const lo = a.z <= b.z ? a : b;
        this._add(grp, mesh, x.id, `${x.mark || ''} ${x.type} ${s.name || s.id}`, x.type === 'column' ? { growFrom: P(lo.x, lo.y, lo.z) } : null);
        const rb = (((m.design || {}).members || {})[x.id] || {}).rebar;
        if (rb && !steel) {
          const k = x.type === 'column' ? 'column' : (x.type === 'beam' || x.type === 'tie_beam') ? 'beam' : null;
          if (k) this._rebar(rebarLines(k, { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], w: s.b, h: s.h }, rb), x.id);
        }
      });
      (m.slabs || []).forEach(s => {
        const et = s.edge_thicken;
        if (et && et.sides) et.sides.forEach(i => {   // ขอบพับลง: วาดเป็นแท่งกว้างเฉลี่ยใต้ท้องพื้น ชิดขอบด้านใน
          const a = s.polygon[i], b = s.polygon[(i + 1) % s.polygon.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return;
          const wm = ((et.w_top || 0) + (et.w_bot || 0)) / 2, cx = s.polygon.reduce((q, p) => [q[0] + p[0] / s.polygon.length, q[1] + p[1] / s.polygon.length], [0, 0]);
          let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          if ((cx[0] - mx) * nx + (cx[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
          const z = s.top - s.t - (et.d || 0) / 2, o = wm / 2;
          this._add('พื้น', boxBetween([a[0] + nx * o, a[1] + ny * o, z], [b[0] + nx * o, b[1] + ny * o, z], wm, et.d || 0, this._mat('slab', 0.95)), s.id, `${s.mark || ''} ขอบพื้นพับลง ลึก ${et.d} ม.`);
        });
        this._add('พื้น', slabMesh(s.polygon, s.top - s.t, s.t, this._mat('slab', 0.95), s.ramp), s.id, `${s.mark || ''} พื้น ${s.kind} หนา ${s.t} ม.${s.ramp ? ` ทางลาด ${s.ramp.low}→${s.ramp.high}` : ''}`);
        const rb = (((m.design || {}).slabs || {})[s.id] || {}).rebar;
        if (rb) this._rebar(rebarLines('slab', { poly: s.polygon, z: s.top - s.t + 0.03 }, rb), s.id);
      });
      const OT_ = m.opening_types || {}, opsBy = {};
      (m.openings || []).forEach(o => { if (OT_[o.type]) (opsBy[o.wall] = opsBy[o.wall] || []).push(o); });
      // ช่วงที่ถูกเจาะ ตามแนวผนัง: [u0,u1, z0,z1] (z เทียบท้องผนัง) — ช่องโค้งเว้นทั้งแนว แล้ววาดส่วนเหนือโค้งแยก (archShape)
      const holesOf = (w, L) => {
        const H = [];
        (opsBy[w.id] || []).forEach(o => {
          const t = OT_[o.type], z0 = t.sill || 0, u0 = o.at - t.w / 2;
          if (t.shape === 'arch') H.push([u0, u0 + t.w, z0, 1e9]);
          else H.push([u0, u0 + t.w, z0, z0 + t.h]);
        });
        return H.map(h => [Math.max(0, h[0]), Math.min(L, h[1]), h[2], h[3]]).filter(h => h[1] - h[0] > 1e-4);
      };
      // ก้อนสี่เหลี่ยมทึบของผนังตรง (หักช่องเปิด): [{u0,u1,z0,z1}] z เทียบท้องผนัง
      const wallRects = (w) => {
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), hh = w.top - w.bottom, H = holesOf(w, L), out = [];
        const us = [...new Set([0, L, ...H.flatMap(h => [h[0], h[1]])])].sort((p, q) => p - q);
        for (let k = 0; k < us.length - 1; k++) {
          const u0 = us[k], u1 = us[k + 1]; if (u1 - u0 < 1e-4) continue;
          const cut = H.filter(h => h[0] <= u0 + 1e-6 && h[1] >= u1 - 1e-6).map(h => [Math.max(0, h[2]), Math.min(hh, h[3])]).sort((p, q) => p[0] - q[0]);
          let z = 0;
          cut.forEach(([c0, c1]) => { if (c0 > z + 1e-4) out.push({ u0, u1, z0: z, z1: c0 }); z = Math.max(z, c1); });
          if (hh > z + 1e-4) out.push({ u0, u1, z0: z, z1: hh });
        }
        return out;
      };
      // ส่วนผนังเหนือช่องโค้ง (โปรไฟล์โค้งต่อเนื่อง) หนา depth วางที่ระยะ off จากแนวกึ่งกลาง (ตามทิศซ้ายของผนัง)
      // วาง Shape ที่เขียนในพิกัดผนัง (u ตามแนวผนัง, z จากท้องผนัง) หนา depth ห่างแนวกึ่งกลาง off (ทิศซ้ายของผนัง = +)
      const wallPlaneMesh = (w, sh, depth, off, mat) => {
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 32 });
        const X = new THREE.Vector3(ux, 0, -uy), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
        g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z));
        const o3 = P(a[0], a[1], w.bottom).sub(Z.clone().multiplyScalar(depth / 2 + off)); g.translate(o3.x, o3.y, o3.z);
        return new THREE.Mesh(g, mat);
      };
      const archShape = (w, o, depth, off, mat) => {
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, hh = w.top - w.bottom;
        const t = OT_[o.type], r = t.w / 2, zs = (t.sill || 0) + t.h, n = 32, sh = new THREE.Shape();
        sh.moveTo(o.at - r, hh); sh.lineTo(o.at + r, hh);
        for (let k = 0; k <= n; k++) { const th = Math.PI * k / n; sh.lineTo(o.at + r * Math.cos(th), Math.min(hh, zs + r * Math.sin(th))); }
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
        const X = new THREE.Vector3(ux, 0, -uy), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
        g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z));
        // Z ของ shape = ทิศขวาของผนัง (−ซ้าย) → off ตามทิศซ้าย = เลื่อน −Z
        const o3 = P(a[0], a[1], w.bottom).sub(Z.clone().multiplyScalar(depth / 2 + off)); g.translate(o3.x, o3.y, o3.z);
        return new THREE.Mesh(g, mat);
      };
      const WALL_INFO = w => `${w.kind} หนา ${w.t} ม.${w.note ? ' · ' + w.note : ''}`;
      // ผนังลายพิเศษ (3D เท่านั้น): บล็อกช่องลม = ตารางช่อง · ระแนง = ซี่ตั้งเรียงตามระยะ
      const lookPieces = (w, rc, look) => {
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        const at = (u, z) => [a[0] + ux * u, a[1] + uy * u, w.bottom + z], mat = this._mat('wall', 0.95), out = [], vA = Math.atan2(-uy, -ux) * 180 / Math.PI;   // vA: หน้าตัดซี่ตั้งหันตามแนวตั้งฉากผนัง
        if (look.pattern === 'vent_block') {
          const c = look.cell || 0.2, web = 0.025;
          for (let u = rc.u0; u <= rc.u1 + 1e-6; u += c) { const uu = Math.min(u, rc.u1); out.push(boxBetween(at(uu, rc.z0), at(uu, rc.z1), w.t, web, mat, vA)); }
          for (let z = rc.z0; z <= rc.z1 + 1e-6; z += c) { const zz = Math.min(z, rc.z1); out.push(boxBetween(at(rc.u0, zz), at(rc.u1, zz), w.t, web, mat)); }
        } else if (look.pattern === 'louver') {
          const sp = look.spacing || 0.1, [bw, bh] = look.bar || [0.05, 0.025], m2 = new THREE.MeshLambertMaterial({ color: 0x5b6670, side: THREE.DoubleSide });
          for (let u = rc.u0 + sp / 2; u < rc.u1; u += sp) out.push(boxBetween(at(u, rc.z0), at(u, rc.z1), bw, bh, m2, vA + (look.angle || 0)));
          out.push(boxBetween(at(rc.u0, rc.z1 - 0.02), at(rc.u1, rc.z1 - 0.02), bh, 0.04, m2), boxBetween(at(rc.u0, rc.z0 + 0.02), at(rc.u1, rc.z0 + 0.02), bh, 0.04, m2));
        }
        return out;
      };
      (m.walls || []).forEach(w => {
        if (!w.rise && w.path.length === 2) {   // ผนังตรง: แบ่งเป็นก้อนสี่เหลี่ยมรอบช่อง (เจาะจริง)
          const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
          wallRects(w).forEach(rc => {
            if (w.look && w.look.pattern) { lookPieces(w, rc, w.look).forEach(ms => this._add('ผนัง', ms, w.id, WALL_INFO(w), { noEdge: true })); return; }
            const zc = w.bottom + (rc.z0 + rc.z1) / 2;
            this._add('ผนัง', boxBetween([a[0] + ux * rc.u0, a[1] + uy * rc.u0, zc], [a[0] + ux * rc.u1, a[1] + uy * rc.u1, zc], w.t, rc.z1 - rc.z0, this._mat('wall', 0.8)), w.id, WALL_INFO(w));
          });
          (opsBy[w.id] || []).forEach(o => { if (OT_[o.type].shape === 'arch') this._add('ผนัง', archShape(w, o, w.t, 0, this._mat('wall', 0.8)), w.id, WALL_INFO(w)); });
          return;
        }
        const segL = w.path.slice(1).map((b, i) => Math.hypot(b[0] - w.path[i][0], b[1] - w.path[i][1])), Lw = segL.reduce((s, v) => s + v, 0) || 1;
        let run = 0;
        for (let i = 0; i < w.path.length - 1; i++) {
          const a = w.path[i], b = w.path[i + 1], hh = w.top - w.bottom;
          const za = (w.rise || 0) * run / Lw, zb = (w.rise || 0) * (run + segL[i]) / Lw; run += segL[i];   // ผนังวางเอียง (rise)
          const mesh = w.rise ? slopedWall(a, b, w.bottom + za, w.bottom + zb, hh, w.t, this._mat('wall', 0.8))
            : boxBetween([a[0], a[1], w.bottom + hh / 2], [b[0], b[1], w.bottom + hh / 2], w.t, hh, this._mat('wall', 0.8));
          this._add('ผนัง', mesh, w.id, WALL_INFO(w));
        }
      });
      // ผิวผนังรายด้าน (finishes kind 'wall' ที่มี side + u): แผ่นบาง 1 ซม. แปะผิว ตามสี/ลายวัสดุ
      const wallsById = Object.fromEntries((m.walls || []).map(w => [w.id, w]));
      (m.finishes || []).forEach(f => {
        const w = wallsById[f.wall]; if (f.kind !== 'wall' || !w || !f.side || w.rise || w.path.length !== 2) return;
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        const sg = f.side === 'L' ? 1 : -1, nx = -uy * sg, ny = ux * sg, off = w.t / 2 + 0.006, sk = 0.01;
        const [fu0, fu1] = f.u || [0, L], fin = FINISH[f.tag] || FINISH['1'];
        wallRects(w).forEach(rc => {
          const u0 = Math.max(rc.u0, fu0), u1 = Math.min(rc.u1, fu1); if (u1 - u0 < 1e-3) return;
          const zc = w.bottom + (rc.z0 + rc.z1) / 2, hz = rc.z1 - rc.z0;
          const mat = fin.tex ? texMat(fin.tex, (u1 - u0) / fin.cell[0], hz / fin.cell[1]) : new THREE.MeshLambertMaterial({ color: fin.color, side: THREE.DoubleSide });
          const ms = boxBetween([a[0] + ux * u0 + nx * off, a[1] + uy * u0 + ny * off, zc], [a[0] + ux * u1 + nx * off, a[1] + uy * u1 + ny * off, zc], sk, hz, mat);
          this._add('งานผิว', ms, f.id, f.spec, { noEdge: true });
        });
        (opsBy[w.id] || []).forEach(o => { const t = OT_[o.type]; if (t.shape !== 'arch' || o.at < fu0 - 1e-6 || o.at > fu1 + 1e-6) return;
          this._add('งานผิว', archShape(w, o, sk, sg * off, new THREE.MeshLambertMaterial({ color: fin.color || 0xeeeeee, side: THREE.DoubleSide })), f.id, f.spec, { noEdge: true }); });
      });
      // ประตู-หน้าต่าง: วงกบ + บาน/แผงตาม look (A.7.01) · ช่องโล่งไม่มีบาน
      const ot = m.opening_types || {};
      const FRAME = new THREE.MeshLambertMaterial({ color: 0xe9e7e1, side: THREE.DoubleSide }), GLASS = 0xcfe3ea;
      (m.openings || []).forEach(o => {
        const w = wallsById[o.wall], t = ot[o.type]; if (!w || !t || t.kind === 'opening') return;
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        const vA = Math.atan2(-uy, -ux) * 180 / Math.PI, lk = t.look || {}, z0 = w.bottom + (t.sill || 0), z1 = z0 + t.h, u0 = o.at - t.w / 2, u1 = o.at + t.w / 2;
        const at = (u, z, off) => [a[0] + ux * u - uy * (off || 0), a[1] + uy * u + ux * (off || 0), z];
        const info = `${o.type} ${t.desc || ''} ${t.w}×${t.h} ม.`, add = (ms, op) => this._add('ประตู-หน้าต่าง', ms, o.id, info, op);
        const fd = Math.min(0.10, w.t), fw = lk.frame || 0.05;
        const frame = (zt) => {   // วงกบ: ซ้าย ขวา บน
          add(boxBetween(at(u0 + fw / 2, z0), at(u0 + fw / 2, zt), fd, fw, FRAME, vA)); add(boxBetween(at(u1 - fw / 2, z0), at(u1 - fw / 2, zt), fd, fw, FRAME, vA));
          add(boxBetween(at(u0, zt - fw / 2), at(u1, zt - fw / 2), fd, fw, FRAME));
        };
        if (lk.style === 'swing') {
          frame(z1);
          const [lw, lh] = lk.leaf || [t.w - 2 * fw, t.h - fw], lz = z1 - fw - lh / 2;
          add(boxBetween(at(o.at - lw / 2, lz), at(o.at + lw / 2, lz), 0.035, lh, new THREE.MeshLambertMaterial({ color: 0xd9d6cf, side: THREE.DoubleSide })));
          add(boxBetween(at(o.at + lw / 2 - 0.08, z0 + 1.0, 0.03), at(o.at + lw / 2 - 0.08, z0 + 1.15, 0.03), 0.02, 0.02, new THREE.MeshLambertMaterial({ color: 0xb8c0c8 }), vA));
        } else if (lk.style === 'slide_hung') {
          // บานเลื่อนรางแขวน: รางยาวตามแบบติดผิวผนังด้านนอก (ฝั่งไกลจากกลางอาคาร) · บานปิดช่อง แบ่งช่องกระจกตาม panes
          const nx = -uy, ny = ux, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, cx = (m.grids || []).filter(g => g.axis === 'X').map(g => g.coord), cy = (m.grids || []).filter(g => g.axis === 'Y').map(g => g.coord);
          const ctr = [(Math.min(...cx) + Math.max(...cx)) / 2, (Math.min(...cy) + Math.max(...cy)) / 2], out = ((mx - ctr[0]) * nx + (my - ctr[1]) * ny) > 0 ? 1 : -1;
          const off = out * (w.t / 2 + 0.04), [pw, ph] = lk.panel || [t.w, t.h], tr = lk.track || pw * 2;
          add(boxBetween(at(u1 - tr, z0 + ph + 0.05, off), at(u1, z0 + ph + 0.05, off), 0.05, 0.10, FRAME));
          let zz = z0; const panes = lk.panes || [ph];
          panes.forEach((hp, k) => {
            const hpx = hp * ph / panes.reduce((s, v) => s + v, 0), zc = zz + hpx / 2;
            add(boxBetween(at(o.at - pw / 2, zc, off), at(o.at + pw / 2, zc, off), 0.02, hpx - 0.04, new THREE.MeshLambertMaterial({ color: k === panes.length - 1 ? 0xf2f2f2 : GLASS, transparent: true, opacity: k === panes.length - 1 ? 1 : 0.65, side: THREE.DoubleSide })));
            add(boxBetween(at(o.at - pw / 2, zz + 0.02, off), at(o.at + pw / 2, zz + 0.02, off), 0.04, 0.04, FRAME)); zz += hpx;
          });
          add(boxBetween(at(o.at - pw / 2, zz - 0.02, off), at(o.at + pw / 2, zz - 0.02, off), 0.04, 0.04, FRAME));
          [o.at - pw / 2 + 0.02, o.at + pw / 2 - 0.02].forEach(u => add(boxBetween(at(u, z0, off), at(u, z0 + ph, off), 0.04, 0.04, FRAME, vA)));
        } else if (lk.style === 'vent_block' || lk.style === 'glass_block') {
          const c = lk.cell || 0.2, web = 0.02, wm = this._mat('wall', 0.95);
          if (lk.style === 'glass_block') add(boxBetween(at(u0, (z0 + z1) / 2), at(u1, (z0 + z1) / 2), w.t * 0.8, t.h, new THREE.MeshLambertMaterial({ color: 0x9fd8e6, transparent: true, opacity: 0.55, side: THREE.DoubleSide })), { noEdge: true });
          for (let u = u0; u <= u1 + 1e-6; u += c) add(boxBetween(at(Math.min(u, u1), z0), at(Math.min(u, u1), z1), w.t, web, wm, vA), { noEdge: true });
          for (let z = z0; z <= z1 + 1e-6; z += c) add(boxBetween(at(u0, Math.min(z, z1)), at(u1, Math.min(z, z1)), w.t, web, wm), { noEdge: true });
        } else {   // ทั่วไป: วงกบ + แผงกระจก
          frame(z1);
          add(boxBetween(at(u0 + fw, (z0 + z1 - fw) / 2), at(u1 - fw, (z0 + z1 - fw) / 2), 0.01, t.h - fw, new THREE.MeshLambertMaterial({ color: GLASS, transparent: true, opacity: 0.55, side: THREE.DoubleSide })));
        }
      });
      (m.roofs || []).forEach(r => roofPlanes(r).forEach(pl => this._add('หลังคา', polyMesh(pl, this._mat('roof', 0.75)), r.id,
        `หลังคา ${r.form} ลาด ${r.pitch}° ${r.cover}`)));
      // จันทัน + แป จากข้อกำหนดหลังคา (ไม่มีเป็นชิ้นส่วนในโมเดล) — แปอยู่ใต้แผ่นหลังคา จันทันอยู่ใต้แป
      (m.roofs || []).forEach(r => {
        const dim = sp => { const s = sp && secs[sp.section]; const d = (s && s.dims) || {}; return { s, h: d.h || 0.075, b: d.b || 0.045 }; };
        const pu = dim(r.purlin), ra = dim(r.rafter);
        roofPlanes(r).forEach(pl => {
          [[r.purlin, 'u', pu, pu.h / 2 + 0.005, 'แป', 'purlin'], [r.rafter, 'v', ra, (r.purlin ? pu.h : 0) + ra.h / 2 + 0.005, 'จันทัน', 'rafter']].forEach(([sp, al, d, off, nm, tp]) => {
            if (!sp || !sp.spacing || (m.members || []).some(x => x.type === tp)) return;   // มีเป็นชิ้นส่วนในโมเดลแล้ว ไม่วาดซ้ำ (เหมือนถอดปริมาณ)
            const { segs, n } = planeLines(pl, sp.spacing, al);
            segs.forEach((sg, k) => {
              const a = sg[0].map((c, i) => c - n[i] * off), b = sg[1].map((c, i) => c - n[i] * off);
              this._add('เหล็กรูปพรรณ', boxBetween(a, b, d.b, d.h, this._mat('steel', 1)), `${r.id}-${nm}-${k + 1}`,
                `${nm} ${(d.s && (d.s.name || d.s.id)) || sp.section} @${sp.spacing} ม. (${r.id})`);
            });
          });
        });
      });
      // งานผิวพื้น / ฝ้า / เคาน์เตอร์ / อุปกรณ์ที่มีตำแหน่ง (place)
      const floorMat = (spec, poly) => {
        const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), W = Math.max(...xs) - Math.min(...xs), D = Math.max(...ys) - Math.min(...ys);
        if (/แกรนิต/.test(spec || '')) return texMat('granito', W / 0.6, D / 0.6);
        return new THREE.MeshLambertMaterial({ color: /ทรายล้าง/.test(spec || '') ? 0xbfae8e : /ขัด/.test(spec || '') ? 0xa3a39b : COLORS.finish, side: THREE.DoubleSide });
      };
      (m.finishes || []).forEach(f => {
        if (f.kind === 'floor' && f.polygon) {   // แผ่นผิวพื้นบาง ตามรูปแผ่นพื้น วางที่ระดับผิวสำเร็จ
          const ms = slabMesh(f.polygon, (f.z ?? 0) - 0.01, 0.01, floorMat(f.spec, f.polygon), f.ramp, f.holes);
          const xs = f.polygon.map(p => p[0]), ys = f.polygon.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), uv = ms.geometry.attributes.uv;
          if (uv) { const ps = ms.geometry.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, (ps.getX(k) - x0) / (Math.max(...xs) - x0 || 1), (ps.getY(k) - y0) / (Math.max(...ys) - y0 || 1)); uv.needsUpdate = true; }
          this._add('งานผิว', ms, f.id, f.spec, { noEdge: true });
        }
        if (f.kind === 'counter') (f.rects || []).forEach(rc => {   // เคาน์เตอร์: แผ่นบนหนา 0.10 + ขอบหน้า
          const z = f.z ?? 1, [x0, y0, x1, y1] = rc, mat = texMat('granito', 1 / 0.6, 1 / 0.6);   // UV ของ ExtrudeGeometry เป็นเมตร
          this._add('เคาน์เตอร์-อุปกรณ์', slabMesh([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z - 0.10, 0.10, mat), f.id, f.spec);
        });
        else if (f.kind === 'ceiling') (f.rects || []).forEach(rc => {   // slope: {axis:'Y'|'X', at, z, dz} = ระดับ z ที่พิกัด at เปลี่ยน dz ต่อเมตร (ฝ้าเอียงตามหลังคา)
          const sl = f.slope, zf = (x, y) => sl ? sl.z + sl.dz * ((sl.axis === 'X' ? x : y) - (sl.at || 0)) : (f.z ?? 0);
          const pts = [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]].map(([x, y]) => [x, y, zf(x, y)]);
          this._add('ฝ้า', polyMesh(pts, this._mat('ceiling', 0.35)), f.id, f.spec);
        });
        else if (f.kind !== 'floor' && f.kind !== 'wall') (f.rects || []).forEach(rc => {
          const z = (f.z ?? 0) + 0.005, pts = [[rc[0], rc[1], z], [rc[2], rc[1], z], [rc[2], rc[3], z], [rc[0], rc[3], z]];
          this._add('งานผิว', polyMesh(pts, this._mat('finish', 0.6)), f.id, f.spec);
        });
        (f.place || []).forEach(pc => {
          if (pc.shape === 'arch_moulding') {   // บัวโค้งเหนือช่องโค้ง: วงแหวนครึ่งวง กว้าง pc.w ยื่น pc.d จากผิวผนังด้าน pc.side
            const w = wallsById[pc.wall], o = (m.openings || []).find(q => q.id === pc.opening), t = o && OT_[o.type]; if (!w || !t) return;
            const r0 = t.w / 2, r1 = r0 + (pc.w || 0.1), zs = (t.sill || 0) + t.h, sh = new THREE.Shape();
            if (pc.legs) {   // ขาบัวลงถึงท้องผนังสองข้าง
              sh.moveTo(o.at - r1, 0); sh.lineTo(o.at - r1, zs); sh.absarc(o.at, zs, r1, Math.PI, 0, true); sh.lineTo(o.at + r1, 0); sh.lineTo(o.at + r0, 0);
              sh.lineTo(o.at + r0, zs); sh.absarc(o.at, zs, r0, 0, Math.PI, false); sh.lineTo(o.at - r0, 0); sh.closePath();
            } else { sh.absarc(o.at, zs, r1, 0, Math.PI, false); sh.absarc(o.at, zs, r0, Math.PI, 0, true); sh.closePath(); }
            const sg = pc.side === 'L' ? 1 : -1, d = pc.d || 0.05;
            this._add('เคาน์เตอร์-อุปกรณ์', wallPlaneMesh(w, sh, d, sg * (w.t / 2 + 0.012 + d / 2), new THREE.MeshLambertMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide })), f.id, f.spec);
          } else if (pc.shape === 'channel') {   // รางตื้นในพื้น: ท้องรางแกรนิตโต้ + ขอบคิ้วอลูมิเนียมสองข้างยาว
            const [x0, y0, x1, y1] = pc.rect, z = pc.z ?? 0, d = pc.depth || 0.025, al = new THREE.MeshLambertMaterial({ color: 0xc4ccd4 });
            this._add('งานผิว', slabMesh([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z - d - 0.01, 0.01, texMat('granito', 1 / 0.3, 1 / 0.3, 0xb9b2a5)), f.id, f.spec, { noEdge: true });
            const lx = x1 - x0 >= y1 - y0;
            (lx ? [y0, y1] : [x0, x1]).forEach(c => this._add('งานผิว', lx ? boxBetween([x0, c, z - d / 2], [x1, c, z - d / 2], 0.008, d, al) : boxBetween([c, y0, z - d / 2], [c, y1, z - d / 2], 0.008, d, al), f.id, f.spec, { noEdge: true }));
          } else if (pc.shape === 'rail') this._add('เคาน์เตอร์-อุปกรณ์', tubeMesh(pc.segs.flatMap(pl => pl.slice(1).map((q, k) => [pl[k], q])), pc.dia_mm || 32, 0xc0c7cf), f.id, f.spec);
          else if (pc.shape === 'panel') {
            const isMirror = /กระจก/.test(f.spec || '');
            let map = null;
            if (pc.label && !isMirror) {   // ป้าย: เขียนข้อความบนแผ่น (ไม่ใช่สัญลักษณ์จริง — ดูแบบขยาย)
              const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
              c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#555'; c.lineWidth = 10; c.strokeRect(8, 8, 240, 240);
              c.fillStyle = '#222'; c.font = 'bold 46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
              String(pc.label).split(' ').forEach((ln, k, arr) => c.fillText(ln, 128, 128 + (k - (arr.length - 1) / 2) * 56));
              map = new THREE.CanvasTexture(cv);
            }
            const mt = new THREE.MeshLambertMaterial({ color: isMirror ? 0xd8eaf2 : 0xffffff, emissive: isMirror ? 0x4a6470 : 0x000000, map, side: THREE.DoubleSide });
            this._add('เคาน์เตอร์-อุปกรณ์', obox(...pc.xyz, pc.t || 0.01, pc.w, pc.h, pc.rot, mt), f.id, f.spec);
          }
        });
      });
      // ------------------------------------------------ สุขาภิบาล
      const el = ((m.mep || {}).electrical) || {};
      const pl = ((m.mep || {}).plumbing) || {};
      const SYSC = { cw: 0x18b4ff, hw: 0xff6e40, waste: 0x8bc34a, soil: 0xa1792b, vent: 0x9e9e9e, rain: 0x40c4ff, drain: 0x6d8f3c };
      const SYSN = { cw: 'ประปา', hw: 'น้ำร้อน', waste: 'น้ำทิ้ง', soil: 'โสโครก', vent: 'ระบายอากาศ', rain: 'น้ำฝน', drain: 'ระบายน้ำ' };
      const pipeGrp = sy => (sy === 'cw' || sy === 'hw') ? 'ท่อประปา' : 'ท่อระบายน้ำ';
      (pl.pipes || []).forEach(pp => {
        const segs = []; for (let i = 0; i < pp.pts.length - 1; i++) segs.push([pp.pts[i], pp.pts[i + 1]]);
        this._add(pipeGrp(pp.system), tubeMesh(segs, pipeOD(pp.dia) * 1000, SYSC[pp.system] || 0x18ffff), pp.id,
          `ท่อ${SYSN[pp.system] || pp.system} ${pp.material || ''} ⌀${pp.dia}`, { noEdge: true });
      });
      (((m.quantities || {}).routes) || []).forEach(rt => {
        const segs = []; for (let i = 0; i < rt.pts.length - 1; i++) segs.push([rt.pts[i], rt.pts[i + 1]]);
        const ln = lineMesh(segs, rt.kind === 'pipe' ? (SYSC[rt.system] || 0x18ffff) : 0xffb000);
        ln.material = new THREE.LineDashedMaterial({ color: ln.material.color, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.8 }); ln.computeLineDistances();
        this._add(rt.kind === 'pipe' ? pipeGrp(rt.system) : 'ท่อร้อยสาย', ln, rt.id, rt.kind === 'pipe' ? `ท่อ${SYSN[rt.system] || rt.system} ⌀${rt.dia} (แนวประมาณ)` : `ท่อร้อยสาย วงจร ${rt.circuit} (แนวประมาณ)`, { line: true });
      });
      const PORC = () => new THREE.MeshLambertMaterial({ color: 0xf6f6f2, side: THREE.DoubleSide }), STEEL = () => new THREE.MeshLambertMaterial({ color: 0xb6bec6, side: THREE.DoubleSide });
      const fts = pl.fixture_types || {};
      // สุขภัณฑ์ทรงง่ายตามขนาดจริงโดยประมาณ: จุดอ้างอิง = ผิวผนังด้านหลัง (rot = ทิศหันหน้า) · z = พื้น (โถ/FD) หรือขอบบน (อ่าง/เคาน์เตอร์)
      const fixtureParts = (f, t) => {
        const [x, y, z] = f.xyz, r = f.rot, k = t.kind, L = (fo, so) => loc(x, y, r, fo, so), out = [];
        if (k === 'wc') {
          let [cx, cy] = L(0.09, 0); out.push(obox(cx, cy, z + 0.58, 0.18, 0.40, 0.40, r, PORC()));
          [cx, cy] = L(0.40, 0); out.push(ocyl(cx, cy, z, z + 0.36, 0.17, 0.13, r, PORC()));
          [cx, cy] = L(0.43, 0); out.push(ocyl(cx, cy, z + 0.36, z + 0.42, 0.26, 0.19, r, PORC()));
        } else if (k === 'urinal') {
          const [cx, cy] = L(0.15, 0); out.push(ocyl(cx, cy, z + 0.42, z + 0.98, 0.15, 0.17, r, PORC()));
          const [vx, vy] = L(0.04, 0); out.push(ocyl(vx, vy, z + 0.98, z + 1.25, 0.015, 0.015, r, STEEL(), 8));
        } else if (k === 'lavatory' && t.mount === 'counter') {
          const [cx, cy] = L(0.30, 0); out.push(ocyl(cx, cy, z, z + 0.14, 0.19, 0.24, r, PORC()));
        } else if (k === 'lavatory') {
          const [cx, cy] = L(0.22, 0); out.push(ocyl(cx, cy, z - 0.18, z, 0.22, 0.26, r, PORC()));
        } else if (k === 'faucet' && t.mount !== 'wall' && r === undefined) {
          out.push(ocyl(x, y, z, z + 0.20, 0.022, 0.022, 0, STEEL(), 10));
        } else if (k === 'faucet' || k === 'spray') {
          const [cx, cy] = L(0.05, 0); out.push(obox(cx, cy, z, 0.10, 0.05, 0.08, r, STEEL()));
        } else if (k === 'floor_drain') {
          out.push(ocyl(x, y, z - 0.004, z + 0.002, 0.06, 0.06, 0, STEEL(), 20));
        } else out.push(obox(x, y, z + 0.1, 0.2, 0.2, 0.2, r, PORC()));
        return out;
      };
      (pl.fixtures || []).forEach(f => {
        const t = fts[f.type] || { kind: f.type };
        fixtureParts(f, t).forEach(ms => this._add('สุขภัณฑ์', ms, f.id || null, `${f.type} ${t.desc || t.kind}`));
      });
      const EQN = { septic_tank: 'ถังบำบัดน้ำเสีย', grease_trap: 'ถังดักไขมัน', water_tank: 'ถังเก็บน้ำ', pump: 'ปั๊มน้ำ', meter: 'มาตรวัดน้ำ', manhole: 'บ่อพัก', gate_valve: 'ประตูน้ำ', check_valve: 'เช็ควาล์ว', soak_pit: 'บ่อซึม' };
      (pl.equipment || []).forEach(e => {
        const sz = e.dims || [0.6, 0.6, 0.6], [x, y, z] = e.xyz, info = `${EQN[e.kind] || e.kind} ${e.size || ''}`.trim(), parts = [];
        if (e.kind === 'septic_tank' || e.kind === 'water_tank' || e.kind === 'soak_pit') {
          parts.push(ocyl(x, y, z - sz[2] / 2, z + sz[2] / 2, sz[0] / 2, sz[1] / 2, 0, new THREE.MeshLambertMaterial({ color: e.kind === 'water_tank' ? 0x3d74c4 : 0x5f8a52, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 32));
          if (e.kind === 'septic_tank') parts.push(ocyl(x, y, z + sz[2] / 2, z + sz[2] / 2 + 0.06, 0.30, 0.30, 0, new THREE.MeshLambertMaterial({ color: 0x3c3c3c }), 24));
        } else if (e.kind === 'gate_valve' || e.kind === 'check_valve') {
          parts.push(ocyl(x, y, z - 0.04, z + 0.10, 0.03, 0.03, 0, new THREE.MeshLambertMaterial({ color: 0xc9a227 }), 10));
        } else if (e.kind === 'pump') {
          parts.push(obox(x, y, z, sz[0], sz[1], sz[2], 0, new THREE.MeshLambertMaterial({ color: 0x2f6fd0 })));
        } else parts.push(obox(x, y, z, sz[0], sz[1], sz[2], 0, new THREE.MeshLambertMaterial({ color: 0x8c8c86, transparent: true, opacity: 0.9 })));
        parts.forEach(ms => this._add('อุปกรณ์สุขาภิบาล', ms, e.id || null, info));
      });
      // ------------------------------------------------ ไฟฟ้า
      const pts = el.point_types || {};
      (el.points || []).forEach(p => {
        const t = pts[p.type] || {}, d = t.dims || [0.1, 0.1, 0.1], [x, y, z] = p.xyz, info = `${p.type} ${t.desc || t.kind || ''} · วงจร ${p.circuit || '-'}`;
        let ms;
        if (t.kind === 'light') ms = obox(x, y, z - d[2] / 2, d[0], d[1], d[2], p.rot || 0, new THREE.MeshLambertMaterial({ color: 0xfffbe6, emissive: 0x6b6440 }));
        else if (p.rot !== undefined) { const [cx, cy] = loc(x, y, p.rot, d[1] / 2, 0); ms = obox(cx, cy, z, d[1], d[0], d[2], p.rot, new THREE.MeshLambertMaterial({ color: t.kind === 'lamp' ? 0x444a50 : 0xf4f4f4 })); }
        else ms = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this._mat('mep', 1)), ms.position.copy(P(x, y, z));
        this._add(t.kind === 'light' || t.kind === 'lamp' ? 'ดวงโคม' : 'สวิตช์-เต้ารับ', ms, p.id || null, info);
      });
      (el.panels || []).forEach(pn => {
        const d = pn.dims || [0.3, 0.1, 0.4], [x, y, z] = pn.xyz, [cx, cy] = loc(x, y, pn.rot || 0, d[1] / 2, 0);
        this._add('ตู้ไฟ', obox(cx, cy, z, d[1], d[0], d[2], pn.rot || 0, new THREE.MeshLambertMaterial({ color: 0xd8dde2 })), pn.id, `ตู้ไฟฟ้า ${pn.ways || ''} ช่อง ${pn.main || ''}`.trim());
      });
      (el.conduits || []).forEach(c => {
        const segs = []; for (let i = 0; i < c.pts.length - 1; i++) segs.push([c.pts[i], c.pts[i + 1]]);
        this._add('ท่อร้อยสาย', tubeMesh(segs, 20, 0xff9f1a), c.id, `ท่อร้อยสาย วงจร ${c.circuit || '-'}`, { noEdge: true });
      });
      if (this.groups['เหล็กเสริม']) this.groups['เหล็กเสริม'].visible = false;
      this.bbox = new THREE.Box3(); Object.values(this.groups).forEach(g => this.bbox.expandByObject(g));
      this._ground(m); this._gridLines(m);
      this.xray = false; this.hl = new Set(); this.state = null; this.setClip(null);
      this.fit();
      return Object.keys(this.groups);
    }
    _ground(m) {   // พื้นดินที่ระดับ GL + กริดเขียว + เงา
      if (this.groundGrp) this.scene.remove(this.groundGrp);
      const g = this.groundGrp = new THREE.Group(), b = this.bbox; if (b.isEmpty()) return;
      const gl = ((m.levels || []).find(l => l.name === 'GL') || { z: 0 }).z;
      const c = b.getCenter(new THREE.Vector3()), size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 3 + 10;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity: this.th.shadow }));
      pl.rotation.x = -Math.PI / 2; pl.position.set(c.x, gl - 0.002, c.z); pl.receiveShadow = true; g.add(pl);
      const T = this.th, grid = new THREE.GridHelper(size, Math.round(size), T.grid, T.grid);
      grid.material.transparent = true; grid.material.opacity = T.gridOp[0]; grid.position.set(c.x, gl - 0.001, c.z); g.add(grid);
      const grid2 = new THREE.GridHelper(size, Math.round(size / 5), T.grid, T.grid);
      grid2.material.transparent = true; grid2.material.opacity = T.gridOp[1]; grid2.position.copy(grid.position); g.add(grid2);
      g.visible = this.groundOn !== false; this.scene.add(g);
      this.scene.fog = new THREE.Fog(T.bg, size * 0.35, size * 0.9);
      const s = b.getSize(new THREE.Vector3()).length();
      this.sun.position.set(c.x + s, c.y + s * 1.4, c.z + s * 0.6); this.sun.target.position.copy(c);
      const cam = this.sun.shadow.camera; cam.left = cam.bottom = -s; cam.right = cam.top = s; cam.near = 0.1; cam.far = s * 4; cam.updateProjectionMatrix();
    }
    _gridLines(m) {   // เส้นกริดโครงสร้าง (แนว A, B, 1, 2 …) ที่ระดับ GL พร้อมป้ายชื่อที่ปลายเส้น
      if (this.gridGrp) this.scene.remove(this.gridGrp);
      const g = this.gridGrp = new THREE.Group(), gr = m.grids || []; g.visible = this.gridOn !== false;
      if (!gr.length) return;
      const gl = ((m.levels || []).find(l => l.name === 'GL') || { z: 0 }).z + 0.01;
      const xs = gr.filter(a => a.axis === 'X').map(a => a.coord), ys = gr.filter(a => a.axis === 'Y').map(a => a.coord);
      const ext = 1.5, x0 = Math.min(...xs, 0) - ext, x1 = Math.max(...xs, 0) + ext, y0 = Math.min(...ys, 0) - ext, y1 = Math.max(...ys, 0) + ext;
      const mat = new THREE.LineDashedMaterial({ color: new THREE.Color(this.th.gl).getHex(), dashSize: 0.35, gapSize: 0.18, transparent: true, opacity: 0.7, depthTest: true });
      const label = (txt, at) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
        c.strokeStyle = this.th.gl; c.lineWidth = 7; c.fillStyle = this.th.glFill; c.beginPath(); c.arc(64, 64, 54, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = this.th.gl; c.font = 'bold 64px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 64, 68);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
        sp.scale.set(0.7, 0.7, 1); sp.position.copy(at); sp.renderOrder = 9; g.add(sp);
      };
      gr.forEach(a => {
        const p0 = a.axis === 'X' ? P(a.coord, y0, gl) : P(x0, a.coord, gl), p1 = a.axis === 'X' ? P(a.coord, y1, gl) : P(x1, a.coord, gl);
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), mat); ln.computeLineDistances(); g.add(ln);
        const d = p1.clone().sub(p0).normalize().multiplyScalar(0.45);
        label(a.name, p0.clone().sub(d)); label(a.name, p1.clone().add(d));
      });
      this.scene.add(g);
    }
    setOverlay(name, on) {
      if (name === 'grid') { this.gridOn = on; if (this.gridGrp) this.gridGrp.visible = on; }
      if (name === 'ground') { this.groundOn = on; if (this.groundGrp) this.groundGrp.visible = on; }
    }
    setMarkers(list) {   // จุดปัญหา clash: [{at:[x,y,z], sev}]
      if (this.markGrp) this.scene.remove(this.markGrp);
      const g = this.markGrp = new THREE.Group();
      const col = { error: 0xff3b3b, warn: 0xffb000, info: 0x18ffff };
      (list || []).forEach(c => { if (!c.at) return;
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshBasicMaterial({ color: col[c.sev] || 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
        s.position.copy(P(...c.at)); s.renderOrder = 10; g.add(s); });
      this.scene.add(g);
    }
    focus(at, dist) {
      const t = P(...at), cur = this.camera.position.clone().sub(this.controls.target).normalize();
      const d = dist || 6; this.controls.target.copy(t); this.camera.position.copy(t.clone().add(cur.multiplyScalar(d))); this._moved();
    }
    _rebar(lines, id) {
      if (lines.main.length) this._add('เหล็กเสริม', tubeMesh(lines.main, lines.dm, COLORS.rebar), id, 'เหล็กยืน/เหล็กล่าง-บน', { rebar: true, noEdge: true });
      if (lines.tie.length) this._add('เหล็กเสริม', tubeMesh(lines.tie, lines.dt, COLORS.stirrup), id, 'เหล็กปลอก', { rebar: true, noEdge: true });
    }
    meshes() { const out = []; Object.values(this.groups).forEach(g => g.children.forEach(m => out.push(m))); return out; }
    // สีและความโปร่งของแต่ละชิ้น = ค่าเดิม → สถานะ timelapse → เอกซเรย์ → ไฮไลต์
    _paint(m) {
      const u = m.userData, st = (this.state && this.state(u)) || null;
      let color = u.baseColor, op = u.baseOpacity, vis = true, grow = 1;
      if (st) { if (st.visible === false) vis = false; if (st.color !== undefined) color = st.color; if (st.grow !== undefined) grow = st.grow; }
      if (this.tcol && this.tcol[u.id] !== undefined && !u.rebar && !(st && st.color !== undefined)) color = this.tcol[u.id];
      if (this.xray && CONCRETE.includes(u.group)) op = Math.min(op, 0.18);
      let hot = false;
      if (this.hl.size) { if (this.hl.has(u.id) && !u.rebar) { color = this.th.hot; op = Math.max(op, 0.95); hot = true; } else if (!u.rebar) op = Math.min(op, 0.18); }
      if (this.scope && !this.inScope(m)) vis = false;
      m.visible = vis && grow > 0.001;
      m.material.color.setHex(color);
      if (m.material.emissive) m.material.emissive.setHex(hot ? 0x00aa33 : 0x000000);
      m.material.opacity = op; m.material.transparent = op < 1; m.material.depthWrite = op >= 0.5;
      m.castShadow = op >= 0.5;
      const e = m.userData_edge; if (e) { e.material.opacity = hot ? 1 : Math.min(0.35, op * 0.5); e.material.color.setHex(hot ? this.th.hotEdge : this.th.edge); }
      if (u.growFrom) {
        m.scale.z = Math.max(grow, 0.001);
        m.position.copy(u.growFrom.clone().lerp(u.pos0, grow));
      }
    }
    repaint() { this.meshes().forEach(m => this._paint(m)); }
    setState(fn) { this.state = fn; this.repaint(); }
    setXray(on) {
      this.xray = !!on;
      if (on) { this._saved = Object.fromEntries(ARCH.filter(g => this.groups[g]).map(g => [g, this.groups[g].visible])); ARCH.forEach(g => { if (this.groups[g]) this.groups[g].visible = false; }); }
      else if (this._saved) { Object.entries(this._saved).forEach(([g, v]) => { this.groups[g].visible = v; }); this._saved = null; }
      if (this.groups['เหล็กเสริม']) this.groups['เหล็กเสริม'].visible = !!on;
      this.repaint();
    }
    // ขอบเขตการแสดง: ทีละชั้น {kind:'floor', key} (userData.floor กำหนดโดยแอป) หรือแนวกริด {kind:'grid', axis:'X'|'Y', c, tol}
    inScope(m) {
      const sc = this.scope, bb = m.userData.bb; if (!sc || !bb) return true;
      if (sc.kind === 'floor') return m.userData.floor === sc.key;
      const t = sc.tol || 0.3;
      return sc.axis === 'X' ? bb.min.x <= sc.c + t && bb.max.x >= sc.c - t : bb.min.z <= -sc.c + t && bb.max.z >= -sc.c - t;
    }
    scopeCount(sc) { const o = this.scope; this.scope = sc; const n = this.meshes().filter(m => !m.userData.rebar && this.inScope(m)).length; this.scope = o; return n; }
    setScope(sc) {
      this.scope = sc || null; this.repaint();
      if (!sc) return this.fit();
      const box = new THREE.Box3(); this.meshes().forEach(m => { if (!m.userData.rebar && this.inScope(m) && m.userData.bb) box.union(m.userData.bb); });
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3()), s = Math.max(box.getSize(new THREE.Vector3()).length(), 2);
      const asp = (this.el.clientWidth || 1) / (this.el.clientHeight || 1), k = 1.25 / Math.min(1, asp * 1.4);
      let dir;
      if (sc.kind === 'floor') dir = new THREE.Vector3(0.55, 0.95, 0.65);
      else if (sc.axis === 'X') { c.x = sc.c; dir = new THREE.Vector3(1, this.ortho ? 0 : 0.12, 0); }
      else { c.z = -sc.c; dir = new THREE.Vector3(0, this.ortho ? 0 : 0.12, 1); }
      this.controls.target.copy(c);
      this.camera.position.copy(c.clone().add(dir.normalize().multiplyScalar(s * k)));
      this.camera.updateProjectionMatrix(); this._moved();
    }
    setTypeColors(map) { this.tcol = map || null; this.repaint(); }
    setClip(z) { this.setSection(z === null || z === undefined ? null : { axis: 'Z', c: z }); }   // ซ่อนส่วนที่สูงกว่าระดับ z
    /** ตัดดูโมเดล: {axis:'Z'|'X'|'Y', c: พิกัด .bm.json, flip} · Z = แนวระดับ (เหลือส่วนล่าง) · X/Y = แนวตั้ง (เหลือฝั่งค่าน้อย; flip = อีกฝั่ง) */
    setSection(sec) {
      this.section = sec || null; this.clipZ = sec && sec.axis === 'Z' ? sec.c : null;
      if (!sec) { this.renderer.clippingPlanes = []; this.clipPlane = null; return; }
      const f = sec.flip ? -1 : 1, c = +sec.c;
      const pl = sec.axis === 'Z' ? new THREE.Plane(new THREE.Vector3(0, -f, 0), f * c)
        : sec.axis === 'X' ? new THREE.Plane(new THREE.Vector3(-f, 0, 0), f * c)
          : new THREE.Plane(new THREE.Vector3(0, 0, f), f * c);   // แกน Y ของแบบ = -z ของ three
      this.clipPlane = pl; this.renderer.clippingPlanes = [pl];
    }
    /** ช่วงพิกัดของโมเดลตามแกน (พิกัด .bm.json) */
    range(axis) { const b = this.bbox; if (!b || b.isEmpty()) return [0, 1]; return axis === 'Z' ? [b.min.y, b.max.y] : axis === 'X' ? [b.min.x, b.max.x] : [-b.max.z, -b.min.z]; }
    setTheme(name) {
      this.th = THEMES[name] || THEMES.terminal;
      this.scene.background = new THREE.Color(this.th.bg);
      if (this._m && this.bbox) { this._ground(this._m); this._gridLines(this._m); }
      this.repaint();
    }
    setView(name) {
      this._lastView = name;
      const box = this.bbox && !this.bbox.isEmpty() ? this.bbox : null; if (!box) return;
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
      const d = { iso: [0.7, 0.55, 0.8], iso2: [-0.8, 0.55, -0.7], top: [0, 1.4, 0.001], front: [0, 0.15, 1.3], back: [0, 0.15, -1.3],
        left: [-1.3, 0.15, 0], right: [1.3, 0.15, 0] }[name] || [0.7, 0.55, 0.8];
      if (this.ortho && ['front', 'back', 'left', 'right'].includes(name)) d[1] = 0;   // Parallel: รูปด้านมุมตรง 0°
      const tg = c.clone().add(new THREE.Vector3(0, name === 'top' || this.ortho ? 0 : -s * 0.14, 0));
      this.controls.target.copy(tg);
      const asp = (this.el.clientWidth || 1) / (this.el.clientHeight || 1), k = 1.3 / Math.min(1, asp * 1.4);
      this.camera.position.copy(tg.clone().add(new THREE.Vector3(d[0] * s * k, d[1] * s * k, d[2] * s * k)));
      this.camera.updateProjectionMatrix(); this._moved();
    }
    fit() {
      this._lastView = null;
      const box = new THREE.Box3();
      Object.values(this.groups).forEach(g => box.expandByObject(g));
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
      const tg = c.clone().add(new THREE.Vector3(0, -s * 0.14, 0));   // เล็งต่ำลงเล็กน้อย ให้โมเดลอยู่เหนือแผงล่าง
      this.controls.target.copy(tg);
      const asp = (this.el.clientWidth || 1) / (this.el.clientHeight || 1), k = 1 / Math.min(1, asp * 1.4);   // จอแคบ (มือถือ) ถอยกล้องออก
      this.camera.position.copy(tg.clone().add(new THREE.Vector3(s * 0.95 * k, s * 0.72 * k, s * 1.08 * k)));
      this.pcam.near = s / 500; this.pcam.far = s * 20; this.pcam.updateProjectionMatrix(); this.ocam.near = -s * 20; this.ocam.far = s * 40; this._moved();
      const dist = this.camera.position.distanceTo(tg);
      if (this.scene.fog) { this.scene.fog.near = dist * 1.1; this.scene.fog.far = dist * 3.2; }
      this.resize();
    }
    setVisible(group, v) { if (this.groups[group]) this.groups[group].visible = v; }
    highlight(ids) { this.hl = new Set(ids || []); this.repaint(); }
    _click(e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(v, this.camera);
      const objs = []; Object.values(this.groups).forEach(g => g.visible && g.children.forEach(m => { if (m.visible && !m.userData.rebar) objs.push(m); }));
      const z = this.clipZ;
      const touch = e.pointerType === 'touch'; this.ray.params.Line.threshold = touch ? 0.15 : 0.06;
      const cp = this.clipPlane, hits = this.ray.intersectObjects(objs).filter(h => !cp || cp.distanceToPoint(h.point) >= -1e-6);
      const hit = hits[0];
      this.onPick(hit ? hit.object.userData : null);
    }
  }
  root.BmViewer = { Viewer, roofPlanes, rebarLines, CONCRETE, ARCH, CATS, LABEL };
})(typeof self !== 'undefined' ? self : this);
