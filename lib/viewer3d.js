/*! viewer3d.js — แสดง .bm.json เป็น 3 มิติด้วย three.js r128 (ต้องโหลด THREE และ THREE.OrbitControls ก่อน)
 * พิกัด .bm.json: X ตามกริดตัวเลข, Y ตามกริดตัวอักษร, Z ขึ้น → three: x = X, y = Z, z = −Y
 * ทุก mesh มี userData.id = id ชิ้นส่วนใน .bm.json เพื่อคลิกโยงกับ BOQ
 */
(function (root) {
  'use strict';
  const COLORS = {
    footing: 0x8d99ae, column: 0xb8c0cc, beam: 0xa7b1c2, tie_beam: 0x97a3b6, lintel: 0xc9ced8,
    steel: 0xe07a5f, slab: 0x9aa5b8, wall: 0xd9c9a8, roof: 0x5b8bd6, finish: 0x8fd6a0, opening: 0x6fb3e0,
    ceiling: 0xeeeeee, mep: 0xf5a623, existing: 0x666666, rebar: 0xff7a45, stirrup: 0xffd166,
  };
  const CONCRETE = ['ฐานราก', 'เสา', 'คาน', 'พื้น'];
  const ARCH = ['ผนัง', 'ประตู-หน้าต่าง', 'หลังคา', 'งานผิว', 'ฝ้า', 'งานระบบ'];
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

  function slabMesh(poly, bottom, t, mat) {
    const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
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
    // คืน {main: [[p,q],...], tie: [[p,q],...]} ในพิกัด .bm.json
    const main = [], tie = [];
    const rect = (cx, cy, z, hx, hy, ux, uy) => {   // สี่เหลี่ยมปลอกรอบจุด (ระนาบแนวนอน)
      const vx = -uy, vy = ux, P4 = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([a, b]) => [cx + ux * a + vx * b, cy + uy * a + vy * b, z]);
      for (let i = 0; i < 4; i++) tie.push([P4[i], P4[(i + 1) % 4]]);
    };
    if (kind === 'column') {
      const { a, b, w, h } = geo, hx = w / 2 - COVER, hy = h / 2 - COVER;
      const z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
      if (rb.main) perimPts(rb.main[0], hx, hy).forEach(([dx, dy]) => main.push([[a[0] + dx, a[1] + dy, z0], [a[0] + dx, a[1] + dy, z1]]));
      if (rb.stirrup) { const sp = rb.stirrup[1] || 0.15; for (let z = z0 + 0.05; z < z1 - 0.02; z += sp) rect(a[0], a[1], z, hx, hy, 1, 0); }
    } else if (kind === 'beam') {
      const { a, b, w, h } = geo, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return { main, tie };
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, vx = -uy, vy = ux, hw = w / 2 - COVER;
      const zt = a[2] - COVER, zb = a[2] - h + COVER;
      const bars = (n, z) => spread(n, -hw, hw).forEach(o => main.push([[a[0] + vx * o, a[1] + vy * o, z], [b[0] + vx * o, b[1] + vy * o, z]]));
      if (rb.top) bars(rb.top[0], zt);
      if (rb.bot) bars(rb.bot[0], zb);
      if (rb.extra_top) spread(rb.extra_top[0], -hw * 0.6, hw * 0.6).forEach(o => {
        [[0, L / 4], [L * 3 / 4, L]].forEach(([s0, s1]) => main.push([[a[0] + ux * s0 + vx * o, a[1] + uy * s0 + vy * o, zt - 0.02], [a[0] + ux * s1 + vx * o, a[1] + uy * s1 + vy * o, zt - 0.02]])); });
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
      if (rb.bars_x) spread(rb.bars_x[0], -d / 2 + 0.075, d / 2 - 0.075).forEach(o => main.push([[c[0] - b / 2 + 0.075, c[1] + o, z1], [c[0] + b / 2 - 0.075, c[1] + o, z1]]));
      if (rb.bars_y) spread(rb.bars_y[0], -b / 2 + 0.075, b / 2 - 0.075).forEach(o => main.push([[c[0] + o, c[1] - d / 2 + 0.075, z2], [c[0] + o, c[1] + d / 2 - 0.075, z2]]));
    } else if (kind === 'slab' && rb.mesh) {
      const { poly, z } = geo, sp = rb.mesh[1] || 0.2, xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if ((x1 - x0) / sp + (y1 - y0) / sp < 600) {
        for (let y = y0 + sp / 2; y < y1; y += sp) main.push([[x0 + 0.05, y, z], [x1 - 0.05, y, z]]);
        for (let x = x0 + sp / 2; x < x1; x += sp) main.push([[x, y0 + 0.05, z + 0.01], [x, y1 - 0.05, z + 0.01]]);
      }
    }
    return { main, tie };
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
      this.scene.background = new THREE.Color(opts.background || 0x0f1117);
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.clippingPlanes = [];
      this.hl = new Set(); this.xray = false; this.state = null;
      el.appendChild(this.renderer.domElement);
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(30, 50, 20); this.scene.add(dl);
      this.groups = {};
      this.byId = {};
      this.ray = new THREE.Raycaster();
      this.renderer.domElement.addEventListener('click', e => this._click(e));
      new ResizeObserver(() => this.resize()).observe(el);
      const loop = () => { requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
      loop();
    }
    resize() {
      const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    _mat(key, opacity) {
      return new THREE.MeshLambertMaterial({ color: COLORS[key] || 0xaaaaaa, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
    }
    _add(group, mesh, id, info, extra) {
      if (!this.groups[group]) { this.groups[group] = new THREE.Group(); this.groups[group].name = group; this.scene.add(this.groups[group]); }
      mesh.material = mesh.material.clone();
      mesh.userData = Object.assign({ id, info, group, baseColor: mesh.material.color.getHex(), baseOpacity: mesh.material.opacity,
        pos0: mesh.position.clone(), z: mesh.position.y }, extra || {});
      this.groups[group].add(mesh);
      if (id) (this.byId[id] = this.byId[id] || []).push(mesh);
    }
    load(m) {
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
      (m.members || []).forEach(x => {
        const a = nodes[x.i], b = nodes[x.j], s = secs[x.section]; if (!a || !b || !s) return;
        let w = s.b || (s.dims && s.dims.b) || 0.08, h = s.h || (s.dims && s.dims.h) || 0.12;
        if (s.kind === 'cold_formed' || s.kind === 'steel') { w = (s.dims && s.dims.b) || 0.05; h = (s.dims && s.dims.h) || 0.1; }
        const steel = s.kind === 'steel' || s.kind === 'cold_formed';
        const key = steel ? 'steel' : (COLORS[x.type] ? x.type : 'beam');
        const pa = [a.x, a.y, a.z], pb = [b.x, b.y, b.z];
        if (!steel && (x.type === 'beam' || x.type === 'tie_beam')) { pa[2] -= h / 2; pb[2] -= h / 2; }   // node = หลังคาน
        const mesh = boxBetween(pa, pb, w, h, this._mat(key, 1), x.angle);
        const grp = x.type === 'column' ? 'เสา' : steel ? 'เหล็กรูปพรรณ' : 'คาน';
        const lo = a.z <= b.z ? a : b;
        this._add(grp, mesh, x.id, `${x.mark || ''} ${x.type} ${s.name || s.id}`, x.type === 'column' ? { growFrom: P(lo.x, lo.y, lo.z) } : null);
        const rb = (((m.design || {}).members || {})[x.id] || {}).rebar;
        if (rb && !steel) {
          const k = x.type === 'column' ? 'column' : (x.type === 'beam' || x.type === 'tie_beam') ? 'beam' : null;
          if (k) this._rebar(rebarLines(k, { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], w: s.b, h: s.h }, rb), x.id);
        }
      });
      (m.slabs || []).forEach(s => {
        this._add('พื้น', slabMesh(s.polygon, s.top - s.t, s.t, this._mat('slab', 0.95)), s.id, `${s.mark || ''} พื้น ${s.kind} หนา ${s.t} ม.`);
        const rb = (((m.design || {}).slabs || {})[s.id] || {}).rebar;
        if (rb) this._rebar(rebarLines('slab', { poly: s.polygon, z: s.top - s.t + 0.03 }, rb), s.id);
      });
      (m.walls || []).forEach(w => {
        for (let i = 0; i < w.path.length - 1; i++) {
          const a = w.path[i], b = w.path[i + 1], hh = w.top - w.bottom;
          const mesh = boxBetween([a[0], a[1], w.bottom + hh / 2], [b[0], b[1], w.bottom + hh / 2], w.t, hh, this._mat('wall', 0.8));
          this._add('ผนัง', mesh, w.id, `${w.kind} หนา ${w.t} ม.`);
        }
      });
      const ot = m.opening_types || {}, walls = Object.fromEntries((m.walls || []).map(w => [w.id, w]));
      (m.openings || []).forEach(o => {
        const w = walls[o.wall], t = ot[o.type]; if (!w || !t) return;
        const a = w.path[0], b = w.path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, z = w.bottom + (t.sill || 0) + t.h / 2;
        const c = [a[0] + ux * o.at, a[1] + uy * o.at];
        const mesh = boxBetween([c[0] - ux * t.w / 2, c[1] - uy * t.w / 2, z], [c[0] + ux * t.w / 2, c[1] + uy * t.w / 2, z], w.t + 0.04, t.h, this._mat('opening', 0.9));
        this._add('ประตู-หน้าต่าง', mesh, o.id, `${o.type} ${t.desc || ''} ${t.w}×${t.h} ม.`);
      });
      (m.roofs || []).forEach(r => roofPlanes(r).forEach(pl => this._add('หลังคา', polyMesh(pl, this._mat('roof', 0.75)), r.id,
        `หลังคา ${r.form} ลาด ${r.pitch}° ${r.cover}`)));
      (m.finishes || []).forEach(f => (f.rects || []).forEach(rc => {
        const z = (f.z ?? 0) + (f.kind === 'ceiling' ? 0 : 0.005);
        const pts = [[rc[0], rc[1], z], [rc[2], rc[1], z], [rc[2], rc[3], z], [rc[0], rc[3], z]];
        this._add(f.kind === 'ceiling' ? 'ฝ้า' : 'งานผิว', polyMesh(pts, this._mat(f.kind === 'ceiling' ? 'ceiling' : 'finish', f.kind === 'ceiling' ? 0.35 : 0.6)), f.id, f.spec);
      }));
      const el = ((m.mep || {}).electrical) || {};
      (el.points || []).forEach((p, i) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this._mat('mep', 1));
        mesh.position.copy(P(...p.xyz));
        this._add('งานระบบ', mesh, p.id || null, `จุด ${p.type} วงจร ${p.circuit || '-'}`);
      });
      if (this.groups['เหล็กเสริม']) this.groups['เหล็กเสริม'].visible = false;
      this.bbox = new THREE.Box3(); Object.values(this.groups).forEach(g => this.bbox.expandByObject(g));
      this.xray = false; this.hl = new Set(); this.state = null; this.setClip(null);
      this.fit();
      return Object.keys(this.groups);
    }
    _rebar(lines, id) {
      if (lines.main.length) this._add('เหล็กเสริม', lineMesh(lines.main, COLORS.rebar), id, 'เหล็กยืน/เหล็กล่าง-บน', { rebar: true });
      if (lines.tie.length) this._add('เหล็กเสริม', lineMesh(lines.tie, COLORS.stirrup), id, 'เหล็กปลอก', { rebar: true });
    }
    meshes() { const out = []; Object.values(this.groups).forEach(g => g.children.forEach(m => out.push(m))); return out; }
    // สีและความโปร่งของแต่ละชิ้น = ค่าเดิม → สถานะ timelapse → เอกซเรย์ → ไฮไลต์
    _paint(m) {
      const u = m.userData, st = (this.state && this.state(u)) || null;
      let color = u.baseColor, op = u.baseOpacity, vis = true, grow = 1;
      if (st) { if (st.visible === false) vis = false; if (st.color !== undefined) color = st.color; if (st.grow !== undefined) grow = st.grow; }
      if (this.xray && CONCRETE.includes(u.group)) op = Math.min(op, 0.18);
      if (this.hl.size) { if (this.hl.has(u.id) && !u.rebar) { color = 0xffd166; op = Math.max(op, 0.9); } else if (!u.rebar) op = Math.min(op, 0.22); }
      m.visible = vis && grow > 0.001;
      m.material.color.setHex(color);
      m.material.opacity = op; m.material.transparent = op < 1; m.material.depthWrite = op >= 0.5;
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
    setClip(z) {   // ซ่อนทุกอย่างที่สูงกว่าระดับ z (พิกัด .bm.json)
      this.clipZ = z;
      this.renderer.clippingPlanes = (z === null || z === undefined) ? [] : [new THREE.Plane(new THREE.Vector3(0, -1, 0), z)];
    }
    setView(name) {
      const box = this.bbox && !this.bbox.isEmpty() ? this.bbox : null; if (!box) return;
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
      const d = { iso: [0.7, 0.55, 0.8], iso2: [-0.8, 0.55, -0.7], top: [0, 1.4, 0.001], front: [0, 0.15, 1.3], back: [0, 0.15, -1.3],
        left: [-1.3, 0.15, 0], right: [1.3, 0.15, 0] }[name] || [0.7, 0.55, 0.8];
      this.controls.target.copy(c);
      this.camera.position.copy(c.clone().add(new THREE.Vector3(d[0] * s, d[1] * s, d[2] * s)));
      this.camera.updateProjectionMatrix();
    }
    fit() {
      const box = new THREE.Box3();
      Object.values(this.groups).forEach(g => box.expandByObject(g));
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
      this.controls.target.copy(c);
      this.camera.position.copy(c.clone().add(new THREE.Vector3(s * 0.7, s * 0.55, s * 0.8)));
      this.camera.near = s / 500; this.camera.far = s * 20; this.camera.updateProjectionMatrix();
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
      const hit = this.ray.intersectObjects(objs).find(h => z === null || z === undefined || h.point.y <= z + 1e-6);
      this.onPick(hit ? hit.object.userData : null);
    }
  }
  root.BmViewer = { Viewer, roofPlanes, rebarLines, CONCRETE, ARCH };
})(typeof self !== 'undefined' ? self : this);
