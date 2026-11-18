// 主人公（法被にねじり鉢巻の漁師）。あえてローポリで、鰹のリアルさを際立たせる
import * as THREE from 'three';

function happiTexture(back) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f3a7a'; ctx.fillRect(0, 0, 128, 128);
  // 裾の波模様
  ctx.strokeStyle = '#e9eef7'; ctx.lineWidth = 4;
  for (let x = -10; x < 140; x += 22) {
    ctx.beginPath(); ctx.arc(x, 128, 14, Math.PI, 0); ctx.stroke();
  }
  if (back) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(64, 54, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.font = 'bold 50px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('鰹', 64, 57);
  } else {
    // 襟
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(58, 0); ctx.lineTo(68, 110); ctx.lineTo(56, 110); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(88, 0); ctx.lineTo(70, 0); ctx.lineTo(60, 110); ctx.lineTo(72, 110); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1f3a7a';
    ctx.font = 'bold 13px serif';
    ctx.fillText('大', 44, 30); ctx.fillText('漁', 76, 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPlayer() {
  const root = new THREE.Group();
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
  const skin = M(0xe8b88a), pants = M(0x1b2640), happi = M(0x1f3a7a), white = M(0xf4f4f4), hair = M(0x161616), zori = M(0xb88a52), red = M(0xc62828);
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true;
    parent.add(m);
    return m;
  };

  // 脚
  const legs = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.92, 0);
    root.add(pivot);
    add(pivot, new THREE.BoxGeometry(0.2, 0.5, 0.22), pants, 0, -0.25, 0);
    add(pivot, new THREE.BoxGeometry(0.17, 0.42, 0.18), skin, 0, -0.66, 0);
    add(pivot, new THREE.BoxGeometry(0.2, 0.06, 0.34), zori, 0, -0.9, 0.05);
    legs.push(pivot);
  }
  // 胴（法被）
  const torsoMats = [happi, happi, happi, happi, M(0xffffff, { map: happiTexture(false) }), M(0xffffff, { map: happiTexture(true) })];
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.7, 0.34), torsoMats);
  torso.position.set(0, 1.3, 0); torso.castShadow = true;
  root.add(torso);
  add(root, new THREE.BoxGeometry(0.6, 0.1, 0.36), red, 0, 1.0, 0); // 帯
  // 腕
  const arms = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 1.58, 0);
    root.add(pivot);
    add(pivot, new THREE.BoxGeometry(0.18, 0.3, 0.2), happi, 0, -0.13, 0);
    add(pivot, new THREE.BoxGeometry(0.13, 0.34, 0.14), skin, 0, -0.42, 0);
    add(pivot, new THREE.BoxGeometry(0.15, 0.12, 0.15), skin, 0, -0.62, 0);
    arms.push(pivot);
  }
  // 頭
  const head = new THREE.Group();
  head.position.set(0, 1.88, 0);
  root.add(head);
  const hg = new THREE.IcosahedronGeometry(0.23, 1);
  add(head, hg, skin, 0, 0, 0);
  const hairG = new THREE.SphereGeometry(0.245, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hm = add(head, hairG, hair, 0, 0.02, -0.02);
  hm.rotation.x = -0.25;
  // ねじり鉢巻
  const band = add(head, new THREE.TorusGeometry(0.235, 0.04, 6, 18), white, 0, 0.07, 0);
  band.rotation.x = Math.PI / 2;
  add(head, new THREE.IcosahedronGeometry(0.06, 0), white, 0.0, 0.1, 0.24);
  const t1 = add(head, new THREE.BoxGeometry(0.05, 0.14, 0.03), white, 0.05, 0.03, 0.25); t1.rotation.z = -0.5;
  const t2 = add(head, new THREE.BoxGeometry(0.05, 0.14, 0.03), white, -0.05, 0.03, 0.25); t2.rotation.z = 0.5;
  // 顔
  const eyeM = M(0x111111);
  add(head, new THREE.BoxGeometry(0.045, 0.06, 0.02), eyeM, 0.085, -0.01, 0.215);
  add(head, new THREE.BoxGeometry(0.045, 0.06, 0.02), eyeM, -0.085, -0.01, 0.215);
  const b1 = add(head, new THREE.BoxGeometry(0.09, 0.022, 0.02), eyeM, 0.09, 0.05, 0.215); b1.rotation.z = 0.35;
  const b2 = add(head, new THREE.BoxGeometry(0.09, 0.022, 0.02), eyeM, -0.09, 0.05, 0.215); b2.rotation.z = -0.35;
  add(head, new THREE.BoxGeometry(0.1, 0.025, 0.02), M(0x7a3a2a), 0, -0.11, 0.215);

  root.userData = { legs, arms, head, torso };
  return root;
}

// 歩行・攻撃アニメーション
export function animatePlayer(p, walkPhase, moving, armYawRel, armPitch, t) {
  const { legs, arms, head, torso } = p.userData;
  const sw = moving ? Math.sin(walkPhase) * 0.7 : 0;
  legs[0].rotation.x = sw;
  legs[1].rotation.x = -sw;
  // 右腕（-X 側）は鰹を握る
  const right = arms[1], left = arms[0];
  right.rotation.order = 'YXZ';
  right.rotation.set(-Math.PI / 2 + armPitch, armYawRel, 0);
  left.rotation.set(-sw * 0.8, 0, 0.15);
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 0.05 : Math.sin(t * 2) * 0.015;
  torso.position.y = 1.3 + bob;
  head.position.y = 1.88 + bob;
  head.rotation.y = Math.sin(t * 0.7) * 0.08;
}
