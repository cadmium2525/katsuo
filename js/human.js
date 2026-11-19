// 主人公（法被にねじり鉢巻の漁師）。あえてローポリで、鰹のリアルさを際立たせる
import * as THREE from 'three';

const hex = n => '#' + n.toString(16).padStart(6, '0');

function happiTexture(L, back) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex(L.happi); ctx.fillRect(0, 0, 128, 128);
  // 裾の波模様
  ctx.strokeStyle = L.trim; ctx.lineWidth = 4;
  for (let x = -10; x < 140; x += 22) {
    ctx.beginPath(); ctx.arc(x, 128, 14, Math.PI, 0); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (back) {
    ctx.fillStyle = L.trim;
    ctx.beginPath(); ctx.arc(64, 54, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.font = 'bold 50px serif';
    ctx.fillText(L.back, 64, 57);
  } else {
    // 襟
    ctx.fillStyle = L.trim;
    ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(58, 0); ctx.lineTo(68, 110); ctx.lineTo(56, 110); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(88, 0); ctx.lineTo(70, 0); ctx.lineTo(60, 110); ctx.lineTo(72, 110); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hex(L.happi);
    ctx.font = 'bold 13px serif';
    ctx.fillText(L.text[0], 49, 30); ctx.fillText(L.text[1], 79, 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPlayer(look = {}) {
  const L = Object.assign({
    happi: 0x1f3a7a, trim: '#f2f2f2', pants: 0x1b2640, skin: 0xe8b88a, hair: 0x161616, band: 0xf4f4f4, obi: 0xc62828,
    text: ['大', '漁'], back: '鰹', longHair: false, bald: false, beard: false, cat: false, gold: false,
  }, look);
  if (L.gold) Object.assign(L, { happi: 0xc99a1e, trim: '#fff3c0', pants: 0x6a4a10, obi: 0xffffff, band: 0xffe680 });
  const root = new THREE.Group();
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
  const metal = L.gold ? { metalness: 0.75, roughness: 0.3 } : {};
  const skin = M(L.skin), pants = M(L.pants, metal), happi = M(L.happi, metal), band = M(L.band), hair = M(L.hair),
    zori = M(0xb88a52), obi = M(L.obi);
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
    add(pivot, new THREE.BoxGeometry(0.17, 0.42, 0.18), L.cat ? skin : skin, 0, -0.66, 0);
    add(pivot, new THREE.BoxGeometry(0.2, 0.06, 0.34), zori, 0, -0.9, 0.05);
    legs.push(pivot);
  }
  // 胴（法被）
  const tm = extra => M(0xffffff, { ...metal, ...extra });
  const torsoMats = [happi, happi, happi, happi, tm({ map: happiTexture(L, false) }), tm({ map: happiTexture(L, true) })];
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.7, 0.34), torsoMats);
  torso.position.set(0, 1.3, 0); torso.castShadow = true;
  root.add(torso);
  add(root, new THREE.BoxGeometry(0.6, 0.1, 0.36), obi, 0, 1.0, 0); // 帯
  // 尻尾（猫）
  let tail = null;
  if (L.cat) {
    tail = new THREE.Group();
    tail.position.set(0, 0.95, -0.18);
    root.add(tail);
    const tg = new THREE.CylinderGeometry(0.035, 0.05, 0.6, 6); tg.translate(0, 0.3, 0);
    const tl = add(tail, tg, skin, 0, 0, 0); tl.rotation.x = -0.9;
  }
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
  add(head, new THREE.IcosahedronGeometry(0.23, 1), skin, 0, 0, 0);
  if (!L.bald && !L.cat) {
    const hairG = new THREE.SphereGeometry(0.245, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hm = add(head, hairG, hair, 0, 0.02, -0.02);
    hm.rotation.x = -0.25;
  }
  if (L.bald) {
    // 側頭部だけ白髪
    for (const sx of [1, -1]) add(head, new THREE.BoxGeometry(0.05, 0.12, 0.2), M(0xdddddd), sx * 0.22, -0.02, -0.03);
  }
  if (L.longHair) {
    add(head, new THREE.BoxGeometry(0.42, 0.55, 0.1), hair, 0, -0.2, -0.2);
  }
  if (L.cat) {
    for (const sx of [1, -1]) {
      const ear = add(head, new THREE.ConeGeometry(0.08, 0.16, 4), skin, sx * 0.13, 0.24, -0.02);
      ear.rotation.z = -sx * 0.25;
      const inner = add(head, new THREE.ConeGeometry(0.045, 0.1, 4), M(0xff9aa8), sx * 0.13, 0.23, 0.02);
      inner.rotation.z = -sx * 0.25;
      for (const dy of [-0.06, -0.1]) {
        const wk = add(head, new THREE.BoxGeometry(0.16, 0.008, 0.008), M(0x222222), sx * 0.2, dy, 0.19);
        wk.rotation.z = sx * (dy + 0.08) * 2;
      }
    }
    add(head, new THREE.BoxGeometry(0.05, 0.035, 0.03), M(0xff7a8a), 0, -0.05, 0.225);
  }
  // ねじり鉢巻
  const bandM = add(head, new THREE.TorusGeometry(0.235, 0.04, 6, 18), band, 0, 0.07, 0);
  bandM.rotation.x = Math.PI / 2;
  add(head, new THREE.IcosahedronGeometry(0.06, 0), band, 0.0, 0.1, 0.24);
  const t1 = add(head, new THREE.BoxGeometry(0.05, 0.14, 0.03), band, 0.05, 0.03, 0.25); t1.rotation.z = -0.5;
  const t2 = add(head, new THREE.BoxGeometry(0.05, 0.14, 0.03), band, -0.05, 0.03, 0.25); t2.rotation.z = 0.5;
  // 顔
  const eyeM = M(0x111111), browM = L.bald ? M(0xeeeeee) : eyeM;
  add(head, new THREE.BoxGeometry(0.045, 0.06, 0.02), eyeM, 0.085, -0.01, 0.215);
  add(head, new THREE.BoxGeometry(0.045, 0.06, 0.02), eyeM, -0.085, -0.01, 0.215);
  const b1 = add(head, new THREE.BoxGeometry(0.09, 0.022, 0.02), browM, 0.09, 0.05, 0.215); b1.rotation.z = 0.35;
  const b2 = add(head, new THREE.BoxGeometry(0.09, 0.022, 0.02), browM, -0.09, 0.05, 0.215); b2.rotation.z = -0.35;
  if (L.beard) {
    add(head, new THREE.BoxGeometry(0.3, 0.2, 0.12), M(0xf0f0f0), 0, -0.2, 0.13);
  } else if (!L.cat) {
    add(head, new THREE.BoxGeometry(0.1, 0.025, 0.02), M(0x7a3a2a), 0, -0.11, 0.215);
  }

  root.userData = { legs, arms, head, torso, tail };
  return root;
}

// 歩行・攻撃アニメーション
export function animatePlayer(p, walkPhase, moving, armYawRel, armPitch, t) {
  const { legs, arms, head, torso, tail } = p.userData;
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
  if (tail) tail.rotation.z = Math.sin(t * 3) * 0.5;
}
