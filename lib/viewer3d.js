/*! viewer3d.js — แสดง .bm.json เป็น 3 มิติด้วย three.js r128 (ต้องโหลด THREE และ THREE.OrbitControls ก่อน)
 * พิกัด .bm.json: X ตามกริดตัวเลข, Y ตามกริดตัวอักษร, Z ขึ้น → three: x = X, y = Z, z = −Y
 * ทุก mesh มี userData.id = id ชิ้นส่วนใน .bm.json เพื่อคลิกโยงกับ BOQ
 */
(function (root) {
  'use strict';
  const COLORS = {
    footing: 0x8d99ae, column: 0xb8c0cc, beam: 0xa7b1c2, tie_beam: 0x97a3b6, lintel: 0xc9ced8,
    steel: 0xe07a5f, slab: 0x9aa5b8, wall: 0xd9c9a8, roof: 0x5b8bd6, finish: 0x8fd6a0, opening: 0x6fb3e0,
    ceiling: 0xeeeeee, mep: 0xf5a623, existing: 0x666666,
  };
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

  class Viewer {
    constructor(el, opts = {}) {
      this.el = el;
      this.onPick = opts.onPick || (() => {});
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(opts.background || 0x0f1117);
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    _add(group, mesh, id, info) {
      if (!this.groups[group]) { this.groups[group] = new THREE.Group(); this.groups[group].name = group; this.scene.add(this.groups[group]); }
      mesh.userData = { id, info, group, baseColor: mesh.material.color.getHex() };
      mesh.material = mesh.material.clone();
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
        this._add(grp, mesh, x.id, `${x.mark || ''} ${x.type} ${s.name || s.id}`);
      });
      (m.slabs || []).forEach(s => this._add('พื้น', slabMesh(s.polygon, s.top - s.t, s.t, this._mat('slab', 0.95)), s.id,
        `${s.mark || ''} พื้น ${s.kind} หนา ${s.t} ม.`));
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
      this.fit();
      return Object.keys(this.groups);
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
    highlight(ids) {
      const set = new Set(ids || []);
      Object.values(this.groups).forEach(g => g.children.forEach(m => {
        const on = set.has(m.userData.id);
        m.material.color.setHex(on ? 0xffd166 : m.userData.baseColor);
        m.material.emissive && m.material.emissive.setHex(on ? 0x332200 : 0x000000);
        m.material.opacity = set.size && !on ? Math.min(m.material.opacity, 0.25) : (m.userData.group === 'ผนัง' ? 0.8 : m.userData.group === 'หลังคา' ? 0.75 : 1);
        m.material.transparent = m.material.opacity < 1;
      }));
    }
    _click(e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(v, this.camera);
      const objs = []; Object.values(this.groups).forEach(g => g.visible && g.children.forEach(m => objs.push(m)));
      const hit = this.ray.intersectObjects(objs)[0];
      this.onPick(hit ? hit.object.userData : null);
    }
  }
  root.BmViewer = { Viewer, roofPlanes };
})(typeof self !== 'undefined' ? self : this);
