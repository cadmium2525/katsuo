// カツオのたたきサバイバー
import * as THREE from 'three';
import * as F from './fish.js';
import { buildPlayer, animatePlayer } from './human.js';
import { Sound } from './audio.js';

const TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const AUTO = params.has('auto');
const TURBO = +params.get('turbo') || 0;
const ZOOM = +params.get('zoom') || 0;
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const sound = new Sound();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function fmtNum(n) {
  n = Math.round(n);
  if (n < 1e4) return '' + n;
  if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 1 : 0) + '万';
  if (n < 1e12) return (n / 1e8).toFixed(n < 1e9 ? 1 : 0) + '億';
  return (n / 1e12).toFixed(1) + '兆';
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function h3(a, b, c) {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const $ = id => document.getElementById(id);

// ================================================================ レンダラー
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
renderer.setPixelRatio(PR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const SKY = 0xbfe2ec;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 42, 95);

function makeEnv() {
  const env = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 vP; void main(){ float y=vP.y;
      vec3 sky=mix(vec3(0.9,0.95,1.0), vec3(0.22,0.45,0.9), clamp(y*1.3,0.0,1.0));
      vec3 gnd=mix(vec3(0.85,0.9,0.95), vec3(0.62,0.5,0.34), clamp(-y*4.0,0.0,1.0));
      gl_FragColor=vec4(y>0.0?sky:gnd,1.0);}`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const sunM = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 10) }));
  sunM.position.set(20, 32, 18); env.add(sunM);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.7, 3), side: THREE.DoubleSide }));
  panel.position.set(-28, 14, -14); panel.lookAt(0, 0, 0); env.add(panel);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return tex;
}
scene.environment = makeEnv();

const hemi = new THREE.HemisphereLight(0xd8ecff, 0xb89868, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(10, 24, 9);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
const camOff = new THREE.Vector3();
const view = { xmin: -15, xmax: 15, zmin: -14, zmax: 10 };

// ================================================================ テクスチャ類
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }

function makeSandTexture() {
  const S = 512, P = 16, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const u = (px / S) * P, v = (py / S) * P;
      const n = F.fbm(u, v, P);
      const rip = Math.sin(TAU * (py / S) * 5 + TAU * (px / S) * 1 + 3.0 * F.fbm(u * 0.5, v * 0.5, P / 2));
      const big = F.vnoise(u * 0.25, v * 0.25, P / 4);
      let k = 0.84 + 0.22 * n + rip * 0.025 - big * 0.06;
      const hs = h3(px, py, 7);
      if (hs > 0.996) k -= 0.25; else if (hs > 0.99) k += 0.12;
      const o = (py * S + px) * 4;
      d[o] = 206 * k; d[o + 1] = 180 * k; d[o + 2] = 134 * k; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 小石と貝殻
  for (let i = 0; i < 46; i++) {
    const x = h3(i, 1, 2) * S, y = h3(i, 3, 4) * S, r = 2 + h3(i, 5, 6) * 5;
    const shell = h3(i, 9, 9) > 0.7;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.fillStyle = shell ? 'rgba(250,228,220,0.9)' : `rgba(${120 + h3(i, 7, 7) * 60 | 0},${110 + h3(i, 8, 8) * 50 | 0},${95},0.85)`;
      ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.7, h3(i, 2, 2) * 3, 0, TAU); ctx.fill();
      if (shell) {
        ctx.strokeStyle = 'rgba(200,150,140,0.8)'; ctx.lineWidth = 0.8;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + ox, y + oy + r * 0.6); ctx.lineTo(x + ox + k * r * 0.35, y + oy - r * 0.6); ctx.stroke(); }
      }
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function makeRadialTexture(stops) {
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return tex(c);
}
function makeFlakeTexture() {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, 64, 64);
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU, r = 26 + Math.sin(a * 5) * 3 + Math.random() * 4;
    const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r * 0.75;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, '#e8a890'); g.addColorStop(0.5, '#d4876a'); g.addColorStop(1, '#b86a52');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(140,70,50,0.5)';
  for (let y = 10; y < 58; y += 3) { ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(60, y + Math.random() * 3); ctx.stroke(); }
  return tex(c);
}

// ================================================================ 地面と装飾
const GSIZE = 260, TILE = 10;
const sandTex = makeSandTexture();
sandTex.repeat.set(GSIZE / TILE, GSIZE / TILE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GSIZE, GSIZE),
  new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.96, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const DECOR = (() => {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const rockG = new THREE.DodecahedronGeometry(0.55, 0); rockG.scale(1, 0.6, 1); rockG.translate(0, 0.15, 0);
  const woodG = new THREE.CylinderGeometry(0.11, 0.15, 2.4, 7); woodG.rotateZ(Math.PI / 2); woodG.translate(0, 0.12, 0);
  const floatG = new THREE.SphereGeometry(0.32, 16, 12); floatG.translate(0, 0.28, 0);
  const weedG = new THREE.ConeGeometry(0.22, 0.7, 5); weedG.translate(0, 0.32, 0);
  const types = [
    { g: rockG, m: std({ color: 0x8c8a86, roughness: 0.9, flatShading: true }) },
    { g: woodG, m: std({ color: 0x9a7b58, roughness: 0.95, flatShading: true }) },
    { g: floatG, m: std({ color: 0x3aa6c9, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }) },
    { g: weedG, m: std({ color: 0x3f6b2d, roughness: 0.8, flatShading: true }) },
  ];
  for (const t of types) {
    t.mesh = new THREE.InstancedMesh(t.g, t.m, 220);
    t.mesh.count = 0; t.mesh.castShadow = true; t.mesh.receiveShadow = true;
    t.mesh.frustumCulled = false;
    scene.add(t.mesh);
  }
  return { types, last: '' };
})();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'),
  _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _v = new THREE.Vector3();
function updateDecor() {
  const CH = 14, cx = Math.floor(P.x / CH), cz = Math.floor(P.z / CH);
  const key = cx + ',' + cz;
  if (key === DECOR.last) return;
  DECOR.last = key;
  const counts = DECOR.types.map(() => 0);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const X = cx + dx, Z = cz + dz;
    const n = 1 + Math.floor(h3(X, Z, 1) * 3);
    for (let k = 0; k < n; k++) {
      const ti = Math.floor(h3(X, Z, 10 + k) * DECOR.types.length);
      const t = DECOR.types[ti];
      if (counts[ti] >= 220) continue;
      _p.set((X + h3(X, Z, 20 + k)) * CH, 0, (Z + h3(X, Z, 30 + k)) * CH);
      _e.set(0, h3(X, Z, 40 + k) * TAU, 0);
      _q.setFromEuler(_e);
      const sc = 0.7 + h3(X, Z, 50 + k) * 0.9;
      _s.set(sc, sc, sc);
      t.mesh.setMatrixAt(counts[ti]++, _m4.compose(_p, _q, _s));
    }
  }
  DECOR.types.forEach((t, i) => { t.mesh.count = counts[i]; t.mesh.instanceMatrix.needsUpdate = true; });
}

// ================================================================ プレイヤーと鰹
const player = buildPlayer();
scene.add(player);
const katsuoMats = F.makeKatsuoMaterials();
const KATSUO_LEN = 1.8, GRIP_OFF = 0.5;
const katsuo = F.buildKatsuo(katsuoMats, KATSUO_LEN, 0.97, GRIP_OFF);
const katsuoPivot = new THREE.Group();
katsuoPivot.rotation.order = 'YXZ';
katsuoPivot.add(katsuo);
scene.add(katsuoPivot);

// ================================================================ 敵モデル（インスタンス描画）
const MAXE = isMobile ? 240 : 380;
const CORPSE_MAX = 70;
const sabaG = F.sabaGeometry();
const canG = F.canGeometry();
const MODELS = {};
for (const [k, geo, mats] of [
  ['masaba', sabaG, F.makeSabaMaterials('masaba')],
  ['gomasaba', sabaG, F.makeSabaMaterials('gomasaba')],
  ['kinka', sabaG, F.makeSabaMaterials('kinka')],
  ['yaki', sabaG, F.makeSabaMaterials('yaki')],
  ['can', canG, F.makeCanMaterials()],
]) {
  const m = new THREE.InstancedMesh(geo, mats, MAXE + CORPSE_MAX);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  MODELS[k] = m;
}
const blobTex = makeRadialTexture([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
const blobG = new THREE.PlaneGeometry(1, 1); blobG.rotateX(-Math.PI / 2);
const blobs = new THREE.InstancedMesh(blobG, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), MAXE + CORPSE_MAX + 8);
blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 1;
scene.add(blobs);

// ボス
function buildBossMeshes() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc935, metalness: 0.9, roughness: 0.25 });
  const blackM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const whiteM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const out = {};
  // ヌシサバ
  {
    const g = new THREE.Group();
    const mats = F.makeSabaMaterials('masaba');
    const body = new THREE.Mesh(sabaG, mats); body.castShadow = true; g.add(body);
    const crown = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.07, 10, 1, true), gold);
    crown.add(ring);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), gold);
      const a = i / 5 * TAU; sp.position.set(Math.cos(a) * 0.09, 0.07, Math.sin(a) * 0.09); crown.add(sp);
    }
    crown.position.set(0, 0.16, 0.38);
    g.add(crown);
    g.userData.mats = mats;
    out.nushi = g;
  }
  // サバ缶大魔神
  {
    const g = new THREE.Group();
    const mats = F.makeCanMaterials();
    const body = new THREE.Mesh(canG, mats); body.castShadow = true;
    body.rotation.z = Math.PI / 2; // 缶を立てて、ラベル側に顔を付ける
    body.rotation.y = Math.PI / 2;
    g.add(body);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), whiteM);
      eye.position.set(sx * 0.13, 0.06, 0.4); eye.scale.z = 0.55; g.add(eye);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), blackM);
      pu.position.set(sx * 0.12, 0.05, 0.445); g.add(pu);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.03), blackM);
      brow.position.set(sx * 0.13, 0.16, 0.43); brow.rotation.z = sx * -0.45; g.add(brow);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), blackM);
    mouth.position.set(0, -0.11, 0.43); g.add(mouth);
    g.userData.mats = mats;
    out.kan = g;
  }
  // サバ味噌煮将軍
  {
    const g = new THREE.Group();
    const mats = F.makeSabaMaterials('miso');
    const body = new THREE.Mesh(sabaG, mats); body.castShadow = true; g.add(body);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, TAU, 0, Math.PI / 2), blackM);
    helm.position.set(0, 0.11, 0.4); helm.scale.set(0.7, 0.8, 1); g.add(helm);
    const kuwa = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI), gold);
    kuwa.position.set(0, 0.22, 0.47); g.add(kuwa);
    const ginM = new THREE.MeshStandardMaterial({ color: 0xf2d77a, roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const gi = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.12), ginM);
      gi.position.set((i - 2.5) * 0.02, 0.15, 0.1 - i * 0.03); gi.rotation.y = i * 0.6; g.add(gi);
    }
    g.userData.mats = mats;
    out.miso = g;
  }
  for (const k in out) { out[k].visible = false; scene.add(out[k]); }
  return out;
}
const BOSS_MESH = buildBossMeshes();

// ================================================================ 武器・アイテムのメッシュ
const GEM_MAX = 500;
const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.25, emissive: 0x222222 }), GEM_MAX);
gemMesh.setColorAt(0, new THREE.Color(1, 1, 1)); gemMesh.count = 0; gemMesh.frustumCulled = false;
scene.add(gemMesh);

const FLAKE_MAX = 260;
const flakeGeo = (() => {
  const g = new THREE.PlaneGeometry(0.55, 0.36, 6, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 6) * 0.06 + p.getX(i) * p.getX(i) * 0.4);
  g.computeVertexNormals();
  return g;
})();
const flakeMesh = new THREE.InstancedMesh(flakeGeo, new THREE.MeshStandardMaterial({
  map: makeFlakeTexture(), side: THREE.DoubleSide, roughness: 0.7, alphaTest: 0.4,
}), FLAKE_MAX);
flakeMesh.count = 0; flakeMesh.frustumCulled = false;
scene.add(flakeMesh);

const BULLET_MAX = 360;
const bulletMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), BULLET_MAX);
bulletMesh.setColorAt(0, new THREE.Color(1, 1, 1)); bulletMesh.count = 0; bulletMesh.frustumCulled = false;
scene.add(bulletMesh);

const throwPool = [];
for (let i = 0; i < 6; i++) {
  const k = F.buildKatsuo(katsuoMats, 1.3, 0.55, 0);
  k.visible = false; scene.add(k);
  throwPool.push(k);
}

const yakumiMeshes = (() => {
  const arr = [];
  const garlic = new THREE.MeshStandardMaterial({ color: 0xf7f0dc, roughness: 0.5 });
  const ginger = new THREE.MeshStandardMaterial({ color: 0xf0d36a, roughness: 0.6 });
  const negi = new THREE.MeshStandardMaterial({ color: 0x5fb94a, roughness: 0.5 });
  const geos = [new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18), new THREE.BoxGeometry(0.34, 0.08, 0.34), new THREE.TorusGeometry(0.22, 0.08, 8, 18)];
  const mats = [garlic, ginger, negi];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geos[i % 3], mats[i % 3]);
    m.castShadow = true; m.visible = false; scene.add(m); arr.push(m);
  }
  return arr;
})();

const puddleMat = new THREE.MeshStandardMaterial({ color: 0xc07018, transparent: true, opacity: 0.62, roughness: 0.04, metalness: 0.15, depthWrite: false });
const puddleGeo = new THREE.CircleGeometry(1, 40); puddleGeo.rotateX(-Math.PI / 2);
const puddlePool = [];
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(puddleGeo, puddleMat); m.visible = false; m.renderOrder = 2; scene.add(m); puddlePool.push(m);
}

const fireGlow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
  map: makeRadialTexture([[0, 'rgba(255,170,60,0.0)'], [0.6, 'rgba(255,110,30,0.12)'], [0.9, 'rgba(255,80,20,0.4)'], [1, 'rgba(255,60,0,0)']]),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
fireGlow.visible = false; fireGlow.renderOrder = 3; scene.add(fireGlow);

function makeItemMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'onigiri') {
    const rice = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 3), new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.8 }));
    rice.rotation.x = Math.PI / 2; rice.rotation.y = Math.PI / 2;
    const nori = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0x1d2a1d, roughness: 0.6 }));
    nori.position.y = -0.12;
    g.add(rice, nori);
  } else if (kind === 'float') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), new THREE.MeshStandardMaterial({ color: 0x2fa0e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 20), new THREE.MeshStandardMaterial({ color: 0xc8a060 }));
    rope.rotation.x = Math.PI / 2;
    g.add(ball, rope);
  } else if (kind === 'chest') {
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.55), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 }));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.8, 12, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9a6a33, roughness: 0.7 }));
    lid.rotation.z = Math.PI / 2; lid.position.y = 0.25;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.82, 0.58), new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.9, roughness: 0.3 }));
    band.position.y = 0.1;
    g.add(wood, lid, band);
  }
  g.traverse(o => { o.castShadow = true; });
  scene.add(g);
  return g;
}

// ================================================================ パーティクル
const dotTex = makeRadialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.base = new Float32Array(max * 2);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcol', this.aCol); g.setAttribute('psize', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTex }, scale: { value: 400 } },
      vertexShader: `attribute float psize; attribute vec4 pcol; varying vec4 vCol; uniform float scale;
        void main(){ vCol=pcol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*scale/(-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vCol;
        void main(){ float a=texture2D(map, gl_PointCoord).a*vCol.a; if(a<0.01) discard; gl_FragColor=vec4(vCol.rgb, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.life[i] = this.maxLife[i] = life; this.size[i] = size; this.grav[i] = grav;
    this.base[i * 2] = size; this.base[i * 2 + 1] = a;
  }
  _copy(dst, src) {
    for (let k = 0; k < 3; k++) { this.pos[dst * 3 + k] = this.pos[src * 3 + k]; this.vel[dst * 3 + k] = this.vel[src * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[dst * 4 + k] = this.col[src * 4 + k];
    this.life[dst] = this.life[src]; this.maxLife[dst] = this.maxLife[src]; this.size[dst] = this.size[src];
    this.grav[dst] = this.grav[src]; this.base[dst * 2] = this.base[src * 2]; this.base[dst * 2 + 1] = this.base[src * 2 + 1];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; if (i < this.n) { this._copy(i, this.n); i--; } continue; }
      const t = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const dr = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      this.col[i * 4 + 3] = this.base[i * 2 + 1] * Math.min(1, t * 1.6);
      this.size[i] = this.base[i * 2] * (0.4 + 0.6 * t);
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}
const parts = new Particles(isMobile ? 1500 : 3000, false);
const fire = new Particles(isMobile ? 800 : 1600, true);

function splash(x, y, z, n, col = [0.85, 0.95, 1], spd = 5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.3, 1) * spd;
    parts.spawn(x, y, z, Math.cos(a) * s, rand(1, 5), Math.sin(a) * s, rand(0.3, 0.6), rand(0.15, 0.32), col[0], col[1], col[2], 0.9, 14);
  }
}

// ================================================================ フロートテキスト（2Dオーバーレイ）
const fx = $('fx');
const fctx = fx.getContext('2d');
const texts = [];
function floatText(x, y, z, str, color = '#fff', size = 1, life = 0.75) {
  if (texts.length > 110) texts.shift();
  texts.push({ x, y, z, str, color, size, life, max: life });
}

// ================================================================ ゲームデータ
const WEAPONS = {
  tataki: { name: '鰹のたたき', icon: '🐟', max: 8, desc: ['やたらリアルな鰹で迫る鯖をぶっ叩く', 'ダメージ +30%', '鰹が大きくなる（範囲 +15%）', '往復ビンタ：振り抜いた後にもう一撃', 'ダメージ +30%・攻撃速度 +15%', '鰹がさらに巨大化（範囲 +20%）', 'ダメージ +30%・ノックバック強化', '大回転たたき：360°ぶん回す'] },
  warayaki: { name: '藁焼きの炎', icon: '🔥', max: 8, desc: ['藁の炎をまとい周囲を炙る（鰹も香ばしく）', 'ダメージ +30%', '範囲 +15%', 'ダメージ +30%', '範囲 +15%・燃焼間隔 短縮', 'ダメージ +35%', '範囲 +20%', '業火：ダメージ +50%'] },
  nage: { name: '投げ鰹', icon: '🪃', max: 8, desc: ['鰹をブーメランのように投げる（貫通）', '投げる数 +1', 'ダメージ +30%', '飛距離・速度 UP', '投げる数 +1', 'ダメージ +30%', '投げる数 +1', 'ダメージ +50%'] },
  bushi: { name: '鰹節ショット', icon: '🍂', max: 8, desc: ['削りたての鰹節を飛ばして貫通攻撃', '発射数 +1', '発射数 +1・ダメージ +25%', '発射数 +1・貫通 +1', '発射数 +1・ダメージ +25%', '発射数 +1・連射 UP・貫通 +1', '発射数 +1・ダメージ +30%', '発射数 +1・貫通 +1'] },
  ponzu: { name: 'ポン酢の沼', icon: '🍋', max: 8, desc: ['ポン酢をぶちまけ鯖を減速＆ダメージ', '範囲 +12%', '沼の数 +1', 'ダメージ +30%', '沼の数 +1', '範囲 +12%・ダメージ +30%', '沼の数 +1', 'ダメージ +50%・持続 UP'] },
  yakumi: { name: '薬味オービット', icon: '🧄', max: 8, desc: ['にんにく・生姜・ネギが周囲を回る', 'ダメージ +30%', '薬味 +1', 'ダメージ +30%・半径 UP', '薬味 +1', 'ダメージ +35%・半径 UP', '薬味 +1', '薬味 +1・回転速度 UP'] },
};
const PASSIVES = {
  sendo: { name: '鮮度', icon: '✨', max: 5, desc: '全ダメージ +12%' },
  zori: { name: '草履', icon: '👡', max: 5, desc: '移動速度 +8%' },
  dha: { name: 'DHA', icon: '💊', max: 5, desc: '最大HP +20（同量回復）' },
  ocha: { name: '緑茶', icon: '🍵', max: 5, desc: 'HP自然回復 +0.4/秒' },
  ami: { name: '漁網', icon: '🕸️', max: 5, desc: '経験値の回収範囲 +35%' },
  tairyo: { name: '大漁旗', icon: '🎏', max: 5, desc: '獲得経験値 +12%' },
  hachimaki: { name: 'ねじり鉢巻', icon: '🎌', max: 5, desc: 'クールダウン -7%' },
  maekake: { name: '前掛け', icon: '🛡️', max: 5, desc: '被ダメージ -1' },
  ozara: { name: '大皿', icon: '🍽️', max: 5, desc: '攻撃範囲 +10%' },
};
const EXTRAS = {
  sendoInf: { name: '鮮度∞', icon: '💪', desc: '全ダメージ +8%（上限なし）' },
  onigiri: { name: 'おにぎり', icon: '🍙', desc: 'HPを50回復' },
};

const ge = (lv, n) => (lv >= n ? 1 : 0);
function tatakiStats(lv) {
  return {
    dmg: 22 * (lv >= 2 ? 1.3 : 1) * (lv >= 5 ? 1.3 : 1) * (lv >= 7 ? 1.3 : 1),
    cd: 0.95 * (lv >= 5 ? 0.85 : 1),
    size: 1 + 0.15 * ge(lv, 3) + 0.2 * ge(lv, 6),
    arc: 3.4, spin: lv >= 8, dur: lv >= 8 ? 0.42 : 0.26,
    dbl: lv >= 4 && lv < 8, kb: lv >= 7 ? 10 : 6.5,
  };
}
function warayakiStats(lv) {
  return {
    dmg: 6 * (lv >= 2 ? 1.3 : 1) * (lv >= 4 ? 1.3 : 1) * (lv >= 6 ? 1.35 : 1) * (lv >= 8 ? 1.5 : 1),
    r: 2.3 * (1 + 0.15 * ge(lv, 3) + 0.15 * ge(lv, 5) + 0.2 * ge(lv, 7)),
    tick: lv >= 5 ? 0.4 : 0.5,
  };
}
function nageStats(lv) {
  return {
    n: 1 + ge(lv, 2) + ge(lv, 5) + ge(lv, 7),
    dmg: 26 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.5 : 1),
    v0: lv >= 4 ? 23 : 18, cd: 2.5,
  };
}
function bushiStats(lv) {
  return {
    n: 2 + lv,
    dmg: 9 * (lv >= 3 ? 1.25 : 1) * (lv >= 5 ? 1.25 : 1) * (lv >= 7 ? 1.3 : 1),
    pierce: 1 + ge(lv, 4) + ge(lv, 6) + ge(lv, 8),
    cd: lv >= 6 ? 0.8 : 1.0,
  };
}
function ponzuStats(lv) {
  return {
    n: 1 + ge(lv, 3) + ge(lv, 5) + ge(lv, 7),
    r: 1.9 * (1 + 0.12 * ge(lv, 2) + 0.12 * ge(lv, 6)),
    dps: 13 * (lv >= 4 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.5 : 1),
    dur: lv >= 8 ? 5.5 : 4, cd: 4.5,
  };
}
function yakumiStats(lv) {
  return {
    n: 2 + ge(lv, 3) + ge(lv, 5) + ge(lv, 7) + ge(lv, 8),
    dmg: 11 * (lv >= 2 ? 1.3 : 1) * (lv >= 4 ? 1.3 : 1) * (lv >= 6 ? 1.35 : 1),
    r: 2.5 + 0.3 * ge(lv, 4) + 0.3 * ge(lv, 6),
    spd: lv >= 8 ? 4.0 : 2.8,
  };
}

const TYPES = {
  masaba: { name: '真サバ', hp: 10, spd: 2.3, dmg: 8, xp: 1, sc: 1.0, model: 'masaba' },
  gomasaba: { name: 'ゴマサバ', hp: 7, spd: 3.5, dmg: 6, xp: 1, sc: 0.85, model: 'gomasaba' },
  kinka: { name: '金華サバ', hp: 55, spd: 1.8, dmg: 14, xp: 4, sc: 1.5, model: 'kinka' },
  can: { name: 'サバ缶', hp: 130, spd: 1.5, dmg: 18, xp: 8, sc: 1.0, model: 'can' },
  yaki: { name: '焼きサバ', hp: 90, spd: 3.1, dmg: 16, xp: 6, sc: 1.15, model: 'yaki' },
};
const BOSSES = [
  { key: 'nushi', name: 'ヌシサバ', hp: 420, spd: 2.7, dmg: 15, sc: 4.2, r: 1.7 },
  { key: 'kan', name: 'サバ缶大魔神', hp: 1000, spd: 1.7, dmg: 20, sc: 3.4, r: 1.5 },
  { key: 'miso', name: 'サバ味噌煮将軍', hp: 1600, spd: 2.3, dmg: 24, sc: 4.6, r: 1.9 },
];
const NOTICES = [
  [60, 'ゴマサバが群れで来た！（速い）'],
  [180, '金華サバ出現！（硬い）'],
  [300, 'サバ缶が転がってきた！'],
  [480, '焼きサバが香ばしく迫る！'],
];

// 敵のインフレ
// 15分以降はさらに急加速して、いつかは必ず呑まれる
const hpMul = t => (1 + t / 240) * Math.pow(1.11, t / 60) * (1 + Math.pow(Math.max(0, t - 720) / 500, 2));
const eDmgMul = t => 1 + t / 300;
const eSpdMul = t => 1 + Math.min(0.35, t / 1800);
const xpNeed = L => Math.floor(4 + L * 5.5 + L * L * 0.42);

const G = {};
const P = {};
let S = {};
const enemies = [], corpses = [], gems = [], items = [], throws = [], flakes = [], puddles = [], bullets = [];
const TK = {}, WY = {}, NG = {}, BS = {}, PZ = {}, YK = {};

function computeStats() {
  const p = G.passives;
  const g = k => p[k] || 0;
  const prevMax = S.maxHp || 100;
  S = {
    dmgMul: (1 + 0.12 * g('sendo')) * G.awaken * (1 + 0.08 * G.infSendo),
    speed: 5.4 * (1 + 0.08 * g('zori')),
    maxHp: 100 + 20 * g('dha'),
    regen: 0.4 * g('ocha'),
    magnet: 2.8 * (1 + 0.35 * g('ami')),
    xpMul: 1 + 0.12 * g('tairyo'),
    cdMul: 1 - 0.07 * g('hachimaki'),
    armor: g('maekake'),
    area: 1 + 0.1 * g('ozara'),
  };
  if (S.maxHp > prevMax) P.hp += S.maxHp - prevMax;
  P.maxHp = S.maxHp;
  P.hp = Math.min(P.hp, P.maxHp);
}

function resetGame() {
  Object.assign(G, {
    state: 'play', time: 0, kills: 0, level: 1, xp: 0, pendingLv: 0,
    weapons: { tataki: 1 }, passives: {}, infSendo: 0, awaken: 1,
    nextElite: 75, nextWave: 240, bossIdx: 0, nextBoss: 150, spawnAcc: 0, shake: 0, boss: null,
    noticeIdx: 0, god: params.has('god'), seared: false, maxDmg: 0, dmgLog: {},
  });
  Object.assign(P, { x: 0, z: 0, facing: 0, hp: 100, maxHp: 100, inv: 0, walk: 0, moving: false, vx: 0, vz: 0 });
  S = {};
  computeStats();
  P.hp = P.maxHp;
  enemies.length = 0; corpses.length = 0; gems.length = 0; flakes.length = 0; bullets.length = 0;
  for (const it of items) scene.remove(it.mesh);
  items.length = 0;
  for (const t of throws) t.mesh.visible = false;
  throws.length = 0;
  for (const p of puddles) p.mesh.visible = false;
  puddles.length = 0;
  for (const k in BOSS_MESH) BOSS_MESH[k].visible = false;
  parts.clear(); fire.clear(); texts.length = 0;
  Object.assign(TK, { swinging: false, t: 0, dur: 0.26, a0: 0, a1: 0, prev: 0, side: 1, cd: 0.4, id: 0, second: false, cur: 0, yaw: 0, pitch: 1.0 });
  Object.assign(WY, { tick: 0 });
  Object.assign(NG, { cd: 1.0 });
  Object.assign(BS, { cd: 0.5 });
  Object.assign(PZ, { cd: 1.0 });
  Object.assign(YK, { ang: 0 });
  katsuoMats.body.map = katsuoMats.rawMap;
  katsuoMats.body.needsUpdate = true;
  DECOR.last = '';
  $('bossbar').classList.add('hidden');
  sound.intensity = 0;
  renderWeaponList();
}

// ================================================================ 入力
const keys = {};
const joy = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vz: 0 };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'play') pauseGame(); else if (G.state === 'pause') resumeGame();
  }
  if (e.code === 'KeyM') toggleMute();
  if (G.state === 'levelup' && /^Digit[1-4]$/.test(e.code)) {
    const btn = document.querySelectorAll('#levelup .card')[+e.code.slice(5) - 1];
    if (btn) btn.click();
  }
  if ((e.code === 'Enter' || e.code === 'Space')) {
    if (G.state === 'title') { e.preventDefault(); startGame(); }
    else if (G.state === 'chest') { e.preventDefault(); closeChest(); }
  }
  if (DEBUG && G.state === 'play') {
    if (e.code === 'KeyT') G.time += 60;
    if (e.code === 'KeyL') addXp(xpNeed(G.level) / S.xpMul + 0.01);
    if (e.code === 'KeyB') G.nextBoss = G.time;
    if (e.code === 'KeyK') for (const en of enemies) if (!en.boss) en.hp = 0, killEnemy(en, 0, 1);
    if (e.code === 'KeyI') { G.god = !G.god; banner(G.god ? '無敵ON' : '無敵OFF'); }
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pauseGame(); });

const joyEl = $('joy'), knobEl = $('joyKnob');
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play' || joy.active) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.vx = joy.vz = 0;
  joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
  knobEl.style.transform = 'translate(-50%,-50%)';
  joyEl.classList.remove('hidden');
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
});
canvas.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const R = 55, d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  joy.vx = dx / R; joy.vz = dy / R;
  knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
const endJoy = e => {
  if (e.pointerId !== joy.id) return;
  joy.active = false; joy.vx = joy.vz = 0; joyEl.classList.add('hidden');
};
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

function inputVector() {
  let x = 0, z = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) z -= 1;
  if (keys.KeyS || keys.ArrowDown) z += 1;
  if (joy.active) { x += joy.vx; z += joy.vz; }
  if (AUTO) { // 自動操作（動作確認用）：円を描いて逃げつつ近くの敵だけ避ける
    const a = G.time * 0.25;
    x = Math.cos(a); z = Math.sin(a);
    let ax = 0, az = 0;
    for (const e of enemies) {
      const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz, rr = (e.r + (e.boss ? 5 : 1.2)) ** 2;
      if (d2 < rr) { const w = e.boss ? 25 : 1; ax += dx / d2 * w; az += dz / d2 * w; }
    }
    for (const b of bullets) {
      const dx = P.x - b.x, dz = P.z - b.z, d2 = dx * dx + dz * dz;
      if (d2 < 6) { ax += dx / d2; az += dz / d2; }
    }
    x += ax * 2; z += az * 2;
    if (G.boss && G.boss.ai.mode === 'tele') { x += -G.boss.ai.dz * 3; z += G.boss.ai.dx * 3; }
    for (const it of items) { x += (it.x - P.x) * 0.1; z += (it.z - P.z) * 0.1; }
  }
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return [x, z];
}

// ================================================================ 敵
let eid = 0;
function spawnPos(margin = 2.5) {
  const x0 = P.x + view.xmin - margin, x1 = P.x + view.xmax + margin, z0 = P.z + view.zmin - margin, z1 = P.z + view.zmax + margin;
  const w = x1 - x0, h = z1 - z0;
  let r = Math.random() * (2 * w + 2 * h);
  if (r < w) return [x0 + r, z0]; r -= w;
  if (r < w) return [x0 + r, z1]; r -= w;
  if (r < h) return [x0, z0 + r]; r -= h;
  return [x1, z0 + r];
}
function spawnEnemy(type, x, z, opts = {}) {
  if (enemies.length >= MAXE) return null;
  const T = TYPES[type], t = G.time, elite = !!opts.elite;
  const sc = T.sc * (elite ? 1.6 : 1) * rand(0.92, 1.08);
  const hp = T.hp * hpMul(t) * (elite ? 12 : 1);
  const e = {
    id: ++eid, type, model: T.model, x, z, kx: 0, kz: 0, hp, maxHp: hp,
    spd: T.spd * eSpdMul(t) * rand(0.9, 1.1) * (elite ? 0.95 : 1),
    dmg: T.dmg * eDmgMul(t) * (elite ? 1.5 : 1), xp: T.xp * (1 + t / 500) * (elite ? 10 : 1),
    sc, r: (type === 'can' ? 0.45 : 0.5) * sc, phase: rand(0, TAU), flash: 0, slowT: 0, elite, boss: null,
    yaw: 0, roll: 0, lastSwing: -1, ykT: 0, dead: false,
  };
  enemies.push(e);
  return e;
}
function pickType(t) {
  const w = [
    ['masaba', Math.max(0.3, 1 - t / 500)],
    ['gomasaba', t > 60 ? Math.min(0.9, (t - 60) / 120) : 0],
    ['kinka', t > 180 ? 0.25 + Math.min(0.35, (t - 180) / 600) : 0],
    ['can', t > 300 ? 0.2 + Math.min(0.3, (t - 300) / 600) : 0],
    ['yaki', t > 480 ? 0.3 + Math.min(0.3, (t - 480) / 600) : 0],
  ];
  let sum = 0;
  for (const [, v] of w) sum += v;
  let r = Math.random() * sum;
  for (const [k, v] of w) { r -= v; if (r <= 0) return k; }
  return 'masaba';
}
function strongestType(t) {
  return t > 480 ? 'yaki' : t > 300 ? 'can' : t > 180 ? 'kinka' : t > 60 ? 'gomasaba' : 'masaba';
}

function director(dt) {
  const t = G.time;
  let rate = Math.min(50, 0.6 + t * 0.012 + Math.pow(t / 200, 2) * 1.6);
  if (G.boss) rate *= 0.6;
  G.spawnAcc += rate * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    const [x, z] = spawnPos();
    spawnEnemy(pickType(t), x, z);
  }
  if (t >= G.nextElite) {
    G.nextElite += 50;
    const [x, z] = spawnPos();
    if (spawnEnemy(strongestType(t), x, z, { elite: true })) banner('でかいサバが来た！ 倒すと宝箱');
  }
  if (t >= G.nextWave) {
    G.nextWave += 180;
    const n = Math.floor(30 + t / 12);
    const R = Math.max(view.xmax, -view.zmin) + 3;
    const ty = t > 400 ? 'gomasaba' : 'masaba';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      spawnEnemy(ty, P.x + Math.sin(a) * R, P.z + Math.cos(a) * R);
    }
    banner('🐟 サバの大群に囲まれた！');
  }
  if (G.noticeIdx < NOTICES.length && t >= NOTICES[G.noticeIdx][0]) {
    banner(NOTICES[G.noticeIdx][1]);
    G.noticeIdx++;
  }
  if (t >= G.nextBoss) {
    if (G.boss) G.nextBoss = t + 10;
    else {
      spawnBoss(G.bossIdx);
      G.bossIdx++;
      G.nextBoss = G.bossIdx < 3 ? [150, 360, 600][G.bossIdx] : 600 + 240 * (G.bossIdx - 2);
    }
  }
}

function spawnBoss(idx) {
  const def = BOSSES[idx % 3], cycle = Math.floor(idx / 3);
  const hp = def.hp * hpMul(G.time) * Math.pow(1.6, cycle);
  const [x, z] = spawnPos(1);
  const suffix = ['', '・改', '・真', '・極'][Math.min(3, cycle)] + (cycle > 3 ? '+' + (cycle - 3) : '');
  const e = {
    id: ++eid, type: def.key, model: null, x, z, kx: 0, kz: 0, hp, maxHp: hp,
    spd: def.spd * (1 + cycle * 0.08), dmg: def.dmg * eDmgMul(G.time), xp: 0,
    sc: def.sc, r: def.r, phase: 0, flash: 0, slowT: 0, elite: false,
    boss: def.key, name: def.name + suffix, yaw: 0, roll: 0, lastSwing: -1, ykT: 0, dead: false,
    ai: { t: 0, mode: 'chase', tt: 0, shot: 0, spiral: 0, dash: 0, dx: 0, dz: 0, summon: 0 }, cycle,
  };
  enemies.push(e);
  G.boss = e;
  BOSS_MESH[def.key].visible = true;
  $('bossbar').classList.remove('hidden');
  $('bossname').textContent = e.name;
  banner(`⚠ ${e.name} 出現！`, 'boss');
  sound.play('boss');
  sound.intensity = 1;
  G.shake = Math.max(G.shake, 0.6);
}

function fireBullet(x, z, a, spd, dmg, col) {
  if (bullets.length >= BULLET_MAX) return;
  bullets.push({ x, z, vx: Math.sin(a) * spd, vz: Math.cos(a) * spd, life: 6, dmg, col });
}

function bossAI(e, dt) {
  const ai = e.ai;
  ai.t += dt;
  const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  let vx = dx / d * e.spd, vz = dz / d * e.spd;
  const face = Math.atan2(dx, dz);
  if (e.boss === 'nushi' || e.boss === 'miso') {
    ai.tt += dt;
    if (ai.mode === 'chase' && ai.tt > (e.boss === 'nushi' ? 4.2 : 6.5)) { ai.mode = 'tele'; ai.tt = 0; ai.dx = dx / d; ai.dz = dz / d; }
    if (ai.mode === 'tele') {
      vx = vz = 0; e.flash = 0.05 * (Math.sin(ai.t * 40) > 0 ? 1 : 0);
      ai.dx = dx / d; ai.dz = dz / d;
      if (ai.tt > 0.9) { ai.mode = 'dash'; ai.tt = 0; sound.play('dash'); G.shake = Math.max(G.shake, 0.3); }
    } else if (ai.mode === 'dash') {
      vx = ai.dx * 17; vz = ai.dz * 17;
      if (Math.random() < 0.6) parts.spawn(e.x, 0.3, e.z, rand(-1, 1), rand(1, 3), rand(-1, 1), 0.6, 0.6, 0.9, 0.85, 0.7, 0.7, 4);
      if (ai.tt > 0.75) { ai.mode = 'chase'; ai.tt = 0; }
    }
    e.yaw = ai.mode === 'dash' ? Math.atan2(ai.dx, ai.dz) : face;
  } else {
    e.yaw = face;
  }
  if (e.boss === 'kan') {
    ai.shot += dt; ai.summon += dt;
    const n = 14 + e.cycle * 4;
    if (ai.shot > 3.0) {
      ai.shot = 0;
      const off = Math.random() * TAU;
      for (let i = 0; i < n; i++) fireBullet(e.x, e.z, off + (i / n) * TAU, 6.5, e.dmg * 0.6, 0);
      sound.play('shoot');
    }
    if (ai.summon > 9) {
      ai.summon = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        spawnEnemy('masaba', e.x + Math.sin(a) * 3, e.z + Math.cos(a) * 3);
      }
    }
  }
  if (e.boss === 'miso') {
    ai.spiral += dt;
    if (ai.mode === 'chase' && ai.spiral > 0.14) {
      ai.spiral = 0; ai.shot += 0.38;
      fireBullet(e.x, e.z, ai.shot, 6, e.dmg * 0.5, 1);
      fireBullet(e.x, e.z, ai.shot + Math.PI, 6, e.dmg * 0.5, 1);
      if (e.cycle > 0) fireBullet(e.x, e.z, ai.shot + Math.PI / 2, 6, e.dmg * 0.5, 1);
    }
  }
  if (e.boss === 'nushi' && e.cycle > 0) {
    ai.shot += dt;
    if (ai.shot > 2.5 && ai.mode === 'chase') {
      ai.shot = 0;
      for (let i = -2; i <= 2; i++) fireBullet(e.x, e.z, face + i * 0.25, 7, e.dmg * 0.5, 0);
    }
  }
  if (e.slowT > 0) { vx *= 0.75; vz *= 0.75; }
  e.x += (vx + e.kx) * dt; e.z += (vz + e.kz) * dt;
  e.kx *= Math.exp(-6 * dt); e.kz *= Math.exp(-6 * dt);
  // 遠すぎたら近くへ
  if (d > 40) { const [x, z] = spawnPos(1); e.x = x; e.z = z; }
  return d;
}

// 衝突判定用の空間ハッシュ
const HS = 4096, CS = 1.6;
const head = new Int32Array(HS), nxt = new Int32Array(2048);
const cellH = (ix, iz) => ((Math.imul(ix, 92837111) ^ Math.imul(iz, 689287499)) >>> 0) & (HS - 1);

function hurtPlayer(dmg, x, z, src = 'mob') {
  if (P.inv > 0 || G.god) return;
  const d = Math.max(1, dmg - S.armor);
  G.dmgLog[src] = (G.dmgLog[src] || 0) + d;
  P.hp -= d;
  P.inv = 0.6;
  sound.play('hurt');
  floatText(P.x, 2.4, P.z, '-' + fmtNum(d), '#ff5a5a', 1.1);
  G.shake = Math.max(G.shake, 0.25);
  splash(P.x, 1.2, P.z, 6, [1, 0.3, 0.3], 3);
  if (P.hp <= 0) { P.hp = 0; gameOver(); }
}

function updateEnemies(dt) {
  const n = enemies.length;
  head.fill(-1);
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    const h = cellH(Math.floor(e.x / CS), Math.floor(e.z / CS));
    nxt[i] = head[h]; head[h] = i;
  }
  const relocate = 14;
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    e.flash -= dt; e.slowT -= dt;
    let d;
    if (e.boss) d = bossAI(e, dt);
    else {
      const dx = P.x - e.x, dz = P.z - e.z;
      d = Math.hypot(dx, dz) || 1e-4;
      const sp = e.spd * (e.slowT > 0 ? 0.5 : 1);
      e.x += (dx / d * sp + e.kx) * dt;
      e.z += (dz / d * sp + e.kz) * dt;
      const kd = Math.exp(-7 * dt);
      e.kx *= kd; e.kz *= kd;
      const ty = Math.atan2(dx, dz);
      e.yaw += angDiff(e.yaw, ty) * Math.min(1, dt * 8);
      if (e.model === 'can') e.roll += sp * dt / 0.42;
      // 画面外に取り残されたら反対側へ回り込む
      const rx = e.x - P.x, rz = e.z - P.z;
      if (rx < view.xmin - relocate || rx > view.xmax + relocate || rz < view.zmin - relocate || rz > view.zmax + relocate) {
        const [x, z] = spawnPos();
        e.x = x; e.z = z; e.kx = e.kz = 0;
      }
    }
    if (d < e.r + 0.45) hurtPlayer(e.dmg, e.x, e.z, e.boss ? 'boss' : e.elite ? 'elite' : 'mob');
  }
  // 押し合い
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    const ix = Math.floor(a.x / CS), iz = Math.floor(a.z / CS);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      let j = head[cellH(ix + ox, iz + oz)];
      while (j !== -1) {
        if (j > i) {
          const b = enemies[j];
          const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = (rr - d) * 0.5;
            const nx = dx / d, nz = dz / d;
            const wa = a.boss ? 0.05 : b.boss ? 1.95 : 1, wb = 2 - wa;
            a.x -= nx * push * wa * 0.6; a.z -= nz * push * wa * 0.6;
            b.x += nx * push * wb * 0.6; b.z += nz * push * wb * 0.6;
          }
        }
        j = nxt[j];
      }
    }
  }
  // 大きい敵（ボス）は個別に押しのける
  if (G.boss) {
    const b = G.boss;
    for (const e of enemies) {
      if (e === b) continue;
      const dx = e.x - b.x, dz = e.z - b.z, rr = e.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); e.x += dx / d * (rr - d); e.z += dz / d * (rr - d); }
    }
  }
}

function hitEnemy(e, base, nx, nz, kb, opts) {
  if (e.dead) return;
  let dmg = base * S.dmgMul * rand(0.9, 1.1);
  const crit = Math.random() < 0.08;
  if (crit) dmg *= 2;
  e.hp -= dmg;
  e.flash = 0.1;
  G.maxDmg = Math.max(G.maxDmg, dmg);
  const kbm = e.boss ? 0.04 : e.elite ? 0.3 : 1;
  e.kx += nx * kb * kbm; e.kz += nz * kb * kbm;
  if ((crit && texts.length < 60) || e.boss || texts.length < 28) {
    floatText(e.x + rand(-0.3, 0.3), (e.boss ? 2.5 : 1.4) + rand(0, 0.4), e.z, fmtNum(dmg), crit ? '#ffd23a' : '#ffffff', crit ? 1.35 : 1);
  }
  if (e.hp <= 0) killEnemy(e, nx, nz, opts && opts.launch);
}

function killEnemy(e, nx, nz, launch) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  if (e.boss) { bossDefeated(e); return; }
  sound.play('kill');
  dropGem(e.x, e.z, e.xp);
  splash(e.x, 0.8 * e.sc, e.z, e.elite ? 24 : 6, e.model === 'yaki' ? [0.6, 0.4, 0.2] : [0.8, 0.9, 1]);
  if (e.elite) spawnItem('chest', e.x, e.z, { count: 1 });
  else {
    const r = Math.random();
    if (r < 0.004) spawnItem('onigiri', e.x, e.z);
    else if (r < 0.0055 && gems.length > 60) spawnItem('float', e.x, e.z);
  }
  if (corpses.length < CORPSE_MAX) {
    const pw = launch ? 9 : 3;
    corpses.push({
      model: e.model, x: e.x, y: 0.75 * e.sc, z: e.z, vx: nx * pw + rand(-1, 1), vy: launch ? rand(6, 9) : rand(3, 5), vz: nz * pw + rand(-1, 1),
      yaw: e.yaw, rx: 0, rz: 0, spin: rand(8, 16) * (Math.random() < 0.5 ? -1 : 1), life: 0.65, max: 0.65, sc: e.sc, elite: e.elite,
    });
  }
}

function bossDefeated(e) {
  sound.play('bossdie');
  BOSS_MESH[e.boss].visible = false;
  $('bossbar').classList.add('hidden');
  G.boss = null;
  sound.intensity = 0;
  G.shake = 1.0;
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * TAU, s = rand(2, 10);
    fire.spawn(e.x, rand(0.5, 3), e.z, Math.cos(a) * s, rand(2, 10), Math.sin(a) * s, rand(0.6, 1.2), rand(0.4, 0.9), 1, rand(0.5, 0.9), 0.2, 1, 8);
  }
  for (let i = 0; i < 16; i++) dropGem(e.x + rand(-2, 2), e.z + rand(-2, 2), 6 * (1 + G.time / 300));
  spawnItem('chest', e.x, e.z, { count: 3, awaken: true, name: e.name });
  floatText(e.x, 4, e.z, `${e.name} 討伐！`, '#ffcf3a', 1.8, 2.0);
  banner(`${e.name} を〆た！`);
}

// ================================================================ 経験値・アイテム
function dropGem(x, z, v) {
  if (gems.length >= GEM_MAX) {
    gems[(Math.random() * gems.length) | 0].v += v;
    return;
  }
  gems.push({ x: x + rand(-0.2, 0.2), z: z + rand(-0.2, 0.2), v, mag: false, sp: 0, t: Math.random() * TAU });
}
function spawnItem(kind, x, z, data = {}) {
  items.push({ kind, x, z, data, mesh: makeItemMesh(kind), t: 0 });
}
function addXp(v) {
  G.xp += v * S.xpMul;
  while (G.xp >= xpNeed(G.level)) {
    G.xp -= xpNeed(G.level);
    G.level++;
    G.pendingLv++;
  }
}
function updatePickups(dt) {
  const mg2 = S.magnet * S.magnet;
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    const dx = P.x - g.x, dz = P.z - g.z, d2 = dx * dx + dz * dz;
    if (!g.mag && d2 < mg2) g.mag = true;
    if (g.mag) {
      g.sp = Math.min(30, g.sp + 40 * dt);
      const d = Math.sqrt(d2) || 1;
      const step = Math.min(d, (6 + g.sp) * dt);
      g.x += dx / d * step; g.z += dz / d * step;
    }
    if (d2 < 0.5) {
      addXp(g.v);
      sound.play('gem');
      gems[i] = gems[gems.length - 1]; gems.pop();
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    it.mesh.position.set(it.x, 0.45 + Math.sin(it.t * 3) * 0.12, it.z);
    it.mesh.rotation.y = it.t * 1.5;
    if (Math.hypot(P.x - it.x, P.z - it.z) < 1.0) {
      scene.remove(it.mesh);
      items.splice(i, 1);
      if (it.kind === 'onigiri') {
        P.hp = Math.min(P.maxHp, P.hp + 30);
        sound.play('heal');
        floatText(P.x, 2.6, P.z, '+30 おにぎり', '#7dff8a', 1.2, 1.0);
      } else if (it.kind === 'float') {
        for (const g of gems) g.mag = true;
        sound.play('heal');
        floatText(P.x, 2.6, P.z, '大漁！全回収', '#7dd8ff', 1.2, 1.0);
      } else if (it.kind === 'chest') {
        openChest(it.data);
      }
    }
  }
}

// ================================================================ 武器
function nearestEnemy(maxD) {
  let best = maxD * maxD, t = null;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; t = e; }
  }
  return t;
}

function updateTataki(dt) {
  const lv = G.weapons.tataki || 0;
  const st = tatakiStats(lv);
  const size = st.size * S.area;
  katsuo.scale.setScalar(size);
  const reach = (GRIP_OFF + 0.97 * KATSUO_LEN) * size + 0.25;
  if (!TK.swinging) {
    TK.cd -= dt;
    if (TK.cd <= 0) {
      const tgt = nearestEnemy(reach * 2.4);
      if (tgt || AUTO || Math.random() < 0.02) {
        const aim = tgt ? Math.atan2(tgt.x - P.x, tgt.z - P.z) : P.facing;
        TK.side = -TK.side;
        if (st.spin) { TK.a0 = aim - Math.PI; TK.a1 = TK.a0 + TAU * TK.side; } else { TK.a0 = aim - TK.side * st.arc / 2; TK.a1 = aim + TK.side * st.arc / 2; }
        // 現在の向きから連続になるよう調整
        TK.a0 = TK.yaw + angDiff(TK.yaw, TK.a0);
        TK.a1 = TK.a0 + (st.spin ? TAU * TK.side : TK.side * st.arc);
        TK.t = 0; TK.dur = st.dur; TK.swinging = true; TK.second = false; TK.id++; TK.prev = TK.a0; TK.hits = 0;
        sound.play('swing');
      }
    }
  }
  if (TK.swinging) {
    TK.t += dt;
    const p = Math.min(1, TK.t / TK.dur);
    const ez = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const ang = TK.a0 + (TK.a1 - TK.a0) * ez;
    sweep(TK.prev, ang, reach, st);
    TK.prev = ang;
    TK.yaw = ang;
    if (p >= 1) {
      if (st.dbl && !TK.second) {
        TK.second = true;
        const a0 = TK.a1; TK.a1 = TK.a0; TK.a0 = a0;
        TK.t = 0; TK.id++; TK.prev = TK.a0; TK.hits = 0;
        sound.play('swing');
      } else {
        TK.swinging = false;
        TK.cd = st.cd * S.cdMul;
      }
    }
    TK.pitch += (0.1 - TK.pitch) * Math.min(1, dt * 30);
  } else {
    const rest = P.facing - 0.75;
    TK.yaw += angDiff(TK.yaw, rest) * Math.min(1, dt * 6);
    TK.pitch += (1.05 - TK.pitch) * Math.min(1, dt * 6);
  }
}
function sweep(a0, a1, reach, st) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  if (hi - lo < 1e-5) return;
  for (const e of enemies) {
    if (e.dead || e.lastSwing === TK.id) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > reach + e.r) continue;
    const phi = Math.atan2(dx, dz), hw = Math.atan2(e.r, Math.max(0.1, d));
    const p2 = lo + ((((phi - lo) % TAU) + TAU) % TAU);
    if (p2 <= hi + hw || p2 >= lo + TAU - hw) {
      e.lastSwing = TK.id;
      const nx = dx / (d || 1), nz = dz / (d || 1);
      if (TK.hits === 0) {
        sound.play('slap');
        const hx = P.x + nx * Math.min(d, reach * 0.8), hz = P.z + nz * Math.min(d, reach * 0.8);
        splash(hx, 1.2, hz, 10, [0.85, 0.95, 1], 6);
        if (Math.random() < 0.35) floatText(hx, 2.6, hz, ['バシッ!', 'ベチッ!', 'ビターン!', 'たたき!'][(Math.random() * 4) | 0], '#7fd6ff', 1.25, 0.6);
        G.shake = Math.max(G.shake, 0.12);
      }
      TK.hits++;
      hitEnemy(e, st.dmg, nx, nz, st.kb, { launch: true });
    }
  }
}

function updateWarayaki(dt) {
  const lv = G.weapons.warayaki || 0;
  if (!lv) { fireGlow.visible = false; return; }
  if (!G.seared) {
    G.seared = true;
    if (!katsuoMats.searedMap) katsuoMats.searedMap = F.makeKatsuoTexture(true);
    katsuoMats.body.map = katsuoMats.searedMap;
    katsuoMats.body.needsUpdate = true;
    floatText(P.x, 3, P.z, '鰹が藁焼きで香ばしくなった！', '#ffb347', 1.1, 1.6);
  }
  const st = warayakiStats(lv), r = st.r * S.area;
  fireGlow.visible = true;
  fireGlow.position.set(P.x, 0.06, P.z);
  fireGlow.scale.set(r, 1, r);
  const nf = r * 12 * dt * (isMobile ? 0.6 : 1);
  for (let i = 0; i < nf + Math.random(); i++) {
    const a = Math.random() * TAU, rr = r * Math.sqrt(rand(0.6, 1));
    fire.spawn(P.x + Math.sin(a) * rr, 0.15, P.z + Math.cos(a) * rr, 0, rand(1.5, 3.2), 0, rand(0.35, 0.6), rand(0.35, 0.6), 1, rand(0.3, 0.55), 0.08, 0.5, -1);
  }
  // 鰹も炙られる
  if (Math.random() < 0.5) {
    const L = (GRIP_OFF + rand(0.2, 1.6)) * katsuo.scale.x;
    fire.spawn(P.x + Math.sin(TK.yaw) * L, 1.3, P.z + Math.cos(TK.yaw) * L, 0, rand(0.5, 1.5), 0, 0.35, 0.3, 1, 0.55, 0.1, 0.8, -1);
  }
  WY.tick -= dt;
  if (WY.tick <= 0) {
    WY.tick = st.tick;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
      if (d < r + e.r) hitEnemy(e, st.dmg, dx / (d || 1), dz / (d || 1), 0.6);
    }
  }
}

function updateNage(dt) {
  const lv = G.weapons.nage || 0;
  if (lv) {
    const st = nageStats(lv);
    NG.cd -= dt;
    if (NG.cd <= 0) {
      NG.cd = st.cd * S.cdMul;
      const tgt = nearestEnemy(14);
      const aim = tgt ? Math.atan2(tgt.x - P.x, tgt.z - P.z) : P.facing;
      for (let i = 0; i < st.n; i++) {
        const mesh = throwPool.find(m => !m.visible);
        if (!mesh) break;
        const a = aim + (st.n > 1 ? (i - (st.n - 1) / 2) * (TAU / Math.max(3, st.n)) : 0);
        mesh.visible = true;
        mesh.scale.setScalar(S.area);
        throws.push({ mesh, x: P.x, z: P.z, dx: Math.sin(a), dz: Math.cos(a), v0: st.v0, t: 0, T: 0.8, back: false, sp: 0, hit: new Set(), dmg: st.dmg, spin: Math.random() * TAU });
      }
      sound.play('throw');
    }
  }
  for (let i = throws.length - 1; i >= 0; i--) {
    const p = throws[i];
    p.t += dt;
    p.spin += dt * 16;
    if (!p.back) {
      const v = p.v0 * Math.max(0, 1 - p.t / p.T);
      p.x += p.dx * v * dt; p.z += p.dz * v * dt;
      if (p.t >= p.T) { p.back = true; p.hit.clear(); }
    } else {
      const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.sp = Math.min(26, p.sp + 45 * dt);
      p.x += dx / d * p.sp * dt; p.z += dz / d * p.sp * dt;
      if (d < 0.9 || p.t > 5) { p.mesh.visible = false; throws.splice(i, 1); continue; }
    }
    p.mesh.position.set(p.x, 1.0, p.z);
    p.mesh.rotation.set(0, p.spin, 0.25);
    const hr = 0.85 * S.area;
    for (const e of enemies) {
      if (e.dead || p.hit.has(e.id)) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz < (hr + e.r) * (hr + e.r)) {
        p.hit.add(e.id);
        const d = Math.hypot(dx, dz) || 1;
        hitEnemy(e, p.dmg, dx / d, dz / d, 4, { launch: true });
        if (Math.random() < 0.3) sound.play('slap');
      }
    }
  }
}

function updateBushi(dt) {
  const lv = G.weapons.bushi || 0;
  if (lv) {
    const st = bushiStats(lv);
    BS.cd -= dt;
    if (BS.cd <= 0) {
      BS.cd = st.cd * S.cdMul;
      const near = [];
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - P.x, dz = e.z - P.z, d2 = dx * dx + dz * dz;
        if (d2 < 200) near.push([d2, e]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < st.n; i++) {
        if (flakes.length >= FLAKE_MAX) break;
        let a;
        if (near.length) { const e = near[i % Math.min(near.length, Math.ceil(st.n / 1.5))][1]; a = Math.atan2(e.x - P.x, e.z - P.z) + rand(-0.15, 0.15); } else a = Math.random() * TAU;
        const sp = rand(13, 17);
        flakes.push({ x: P.x, y: 1.2, z: P.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, life: 1.1, pierce: st.pierce, hit: new Set(), dmg: st.dmg, rx: Math.random() * TAU, ry: a, rs: rand(8, 15) });
      }
      sound.play('flake');
    }
  }
  const hr = 0.3 * S.area;
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i];
    f.life -= dt; f.x += f.vx * dt; f.z += f.vz * dt; f.rx += f.rs * dt;
    let dead = f.life <= 0;
    if (!dead) {
      for (const e of enemies) {
        if (e.dead || f.hit.has(e.id)) continue;
        const dx = e.x - f.x, dz = e.z - f.z, rr = hr + e.r;
        if (dx * dx + dz * dz < rr * rr) {
          f.hit.add(e.id);
          const d = Math.hypot(f.vx, f.vz);
          hitEnemy(e, f.dmg, f.vx / d, f.vz / d, 1.5);
          if (--f.pierce < 0) { dead = true; break; }
        }
      }
    }
    if (dead) { flakes[i] = flakes[flakes.length - 1]; flakes.pop(); }
  }
}

function updatePonzu(dt) {
  const lv = G.weapons.ponzu || 0;
  if (lv) {
    const st = ponzuStats(lv);
    PZ.cd -= dt;
    if (PZ.cd <= 0) {
      PZ.cd = st.cd * S.cdMul;
      const cand = enemies.filter(e => !e.dead && Math.abs(e.x - P.x) < 11 && Math.abs(e.z - P.z) < 9);
      for (let i = 0; i < st.n; i++) {
        const mesh = puddlePool.find(m => !m.visible);
        if (!mesh) break;
        let x, z;
        if (cand.length) { const e = cand[(Math.random() * cand.length) | 0]; x = e.x; z = e.z; } else { x = P.x + rand(-5, 5); z = P.z + rand(-5, 5); }
        mesh.visible = true;
        puddles.push({ mesh, x, z, r: st.r * S.area, life: st.dur, max: st.dur, tick: 0, dps: st.dps });
        splash(x, 0.5, z, 10, [0.85, 0.5, 0.1], 4);
      }
      sound.play('ponzu');
    }
  }
  for (let i = puddles.length - 1; i >= 0; i--) {
    const p = puddles[i];
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; puddles.splice(i, 1); continue; }
    const age = p.max - p.life;
    const k = Math.min(1, age / 0.25) * Math.min(1, p.life / 0.4);
    p.mesh.position.set(p.x, 0.04 + i * 0.002, p.z);
    p.mesh.scale.setScalar(p.r * (0.3 + 0.7 * k) * (1 + Math.sin(age * 5) * 0.02));
    p.tick -= dt;
    if (p.tick <= 0) {
      p.tick = 0.4;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        if (dx * dx + dz * dz < (p.r + e.r * 0.5) ** 2) { e.slowT = 0.5; hitEnemy(e, p.dps * 0.4, 0, 0, 0); }
      }
      if (Math.random() < 0.5) parts.spawn(p.x + rand(-p.r, p.r) * 0.6, 0.1, p.z + rand(-p.r, p.r) * 0.6, 0, rand(1, 2), 0, 0.4, 0.2, 0.95, 0.7, 0.3, 0.8, 4);
    }
  }
}

function updateYakumi(dt) {
  const lv = G.weapons.yakumi || 0;
  if (!lv) { for (const m of yakumiMeshes) m.visible = false; return; }
  const st = yakumiStats(lv), R = st.r * S.area;
  YK.ang += st.spd * dt;
  for (let i = 0; i < yakumiMeshes.length; i++) {
    const m = yakumiMeshes[i];
    if (i >= st.n) { m.visible = false; continue; }
    const a = YK.ang + (i / st.n) * TAU;
    const x = P.x + Math.sin(a) * R, z = P.z + Math.cos(a) * R;
    m.visible = true;
    m.position.set(x, 1.0 + Math.sin(G.time * 4 + i) * 0.1, z);
    m.rotation.set(G.time * 5 + i, G.time * 3, 0.4);
    m.scale.setScalar(S.area);
    const hr = 0.45 * S.area;
    for (const e of enemies) {
      if (e.dead || e.ykT > G.time) continue;
      const dx = e.x - x, dz = e.z - z, rr = hr + e.r;
      if (dx * dx + dz * dz < rr * rr) {
        e.ykT = G.time + 0.45;
        const ox = e.x - P.x, oz = e.z - P.z, od = Math.hypot(ox, oz) || 1;
        hitEnemy(e, st.dmg, ox / od, oz / od, 3);
        sound.play('hit');
      }
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt;
    const dx = b.x - P.x, dz = b.z - P.z;
    let dead = b.life <= 0;
    if (!dead && dx * dx + dz * dz < 0.5) { hurtPlayer(b.dmg, b.x, b.z, 'bullet'); dead = true; }
    if (dead) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }
}

function updateCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.life -= dt;
    c.vy -= 22 * dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    if (c.y < 0.2) { c.y = 0.2; c.vy *= -0.4; c.vx *= 0.6; c.vz *= 0.6; }
    c.rx += c.spin * dt; c.rz += c.spin * 0.5 * dt;
    if (c.life <= 0) { corpses[i] = corpses[corpses.length - 1]; corpses.pop(); }
  }
}

// ================================================================ メイン更新
function simulate(dt) {
  const t0 = performance.now();
  simulateInner(dt);
  const ms = performance.now() - t0;
  G.simMs = (G.simMs || 0) * 0.98 + ms * 0.02;
  G.simMax = Math.max(G.simMax || 0, ms);
}
function simulateInner(dt) {
  G.time += dt;
  // プレイヤー移動
  const [ix, iz] = inputVector();
  const moving = ix * ix + iz * iz > 0.01;
  P.x += ix * S.speed * dt; P.z += iz * S.speed * dt;
  if (moving) {
    const tf = Math.atan2(ix, iz);
    P.facing += angDiff(P.facing, tf) * Math.min(1, dt * 12);
    P.walk += dt * 11 * Math.hypot(ix, iz);
  }
  P.moving = moving;
  P.inv -= dt;
  if (S.regen > 0) P.hp = Math.min(P.maxHp, P.hp + S.regen * dt);

  director(dt);
  updateEnemies(dt);
  if (G.state !== 'play') return;
  updateTataki(dt);
  updateWarayaki(dt);
  updateNage(dt);
  updateBushi(dt);
  updatePonzu(dt);
  updateYakumi(dt);
  updateBullets(dt);
  if (G.state !== 'play') return;
  // 倒れた敵を除去
  let w = 0;
  for (let i = 0; i < enemies.length; i++) if (!enemies[i].dead) enemies[w++] = enemies[i];
  enemies.length = w;
  updateCorpses(dt);
  updatePickups(dt);
  updateDecor();

  if (G.pendingLv > 0 && G.state === 'play') openLevelUp();
}

// ================================================================ 描画同期
function syncScene(dt, t) {
  // プレイヤー
  player.position.set(P.x, 0, P.z);
  player.rotation.y = P.facing;
  player.visible = !(P.inv > 0 && Math.sin(t * 50) > 0.3);
  katsuoPivot.position.set(P.x, 1.3, P.z);
  katsuoPivot.rotation.set(TK.pitch, TK.yaw, 0);
  katsuo.rotation.z = TK.swinging ? Math.sin(t * 40) * 0.12 : Math.sin(t * 3) * 0.05;
  animatePlayer(player, P.walk, P.moving, angDiff(P.facing, TK.yaw), TK.pitch, t);

  // 敵
  const cnt = {};
  for (const k in MODELS) cnt[k] = 0;
  let nb = 0;
  for (const e of enemies) {
    if (e.boss) {
      const m = BOSS_MESH[e.boss];
      const hop = e.boss === 'kan' ? Math.abs(Math.sin(t * 4)) * 0.8 : Math.sin(t * 3) * 0.2;
      m.position.set(e.x, (e.boss === 'kan' ? 0.25 : 0.68) * e.sc + hop, e.z);
      m.rotation.set(0, e.yaw + (e.boss === 'kan' ? 0 : Math.sin(t * 6) * 0.15), e.boss === 'kan' ? Math.sin(t * 4) * 0.1 : 0);
      m.scale.setScalar(e.sc);
      const fl = e.flash > 0 ? 1 : 0;
      for (const mat of m.userData.mats) mat.emissive.setRGB(fl * 0.8, fl * 0.3, fl * 0.3);
      _p.set(e.x, 0.03, e.z); _q.identity(); _s.set(e.sc * 1.3, 1, e.sc * 1.3);
      blobs.setMatrixAt(nb++, _m4.compose(_p, _q, _s));
      continue;
    }
    const mesh = MODELS[e.model], i = cnt[e.model]++;
    if (e.model === 'can') {
      _p.set(e.x, 0.42 * e.sc, e.z);
      _e.set(e.roll, e.yaw, 0);
    } else {
      const ph = t * 6 + e.phase;
      _p.set(e.x, 0.75 * e.sc + Math.sin(ph) * 0.12, e.z);
      _e.set(0, e.yaw + Math.sin(t * 13 + e.phase) * 0.3, Math.sin(ph) * 0.12);
    }
    _q.setFromEuler(_e);
    _s.setScalar(e.sc);
    mesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (e.flash > 0) _c.setRGB(3, 3, 3);
    else if (e.elite) { const k = 0.75 + Math.sin(t * 8) * 0.25; _c.setRGB(1.6, k * 0.6, k * 0.6); }
    else if (e.slowT > 0) _c.setRGB(1.1, 0.85, 0.5);
    else _c.setRGB(1, 1, 1);
    mesh.setColorAt(i, _c);
    _p.set(e.x, 0.03, e.z); _q.identity(); _s.set(e.sc * 1.1, 1, e.sc * 1.1);
    blobs.setMatrixAt(nb++, _m4.compose(_p, _q, _s));
  }
  for (const c of corpses) {
    const mesh = MODELS[c.model], i = cnt[c.model]++;
    _p.set(c.x, c.y, c.z);
    _e.set(c.rx, c.yaw, c.rz);
    _q.setFromEuler(_e);
    _s.setScalar(c.sc * Math.min(1, c.life / 0.25));
    mesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    _c.setRGB(1.3, 1.3, 1.3);
    mesh.setColorAt(i, _c);
  }
  _p.set(P.x, 0.03, P.z); _q.identity(); _s.set(1.2, 1, 1.2);
  blobs.setMatrixAt(nb++, _m4.compose(_p, _q, _s));
  for (const k in MODELS) {
    const m = MODELS[k];
    m.count = cnt[k];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  blobs.count = nb; blobs.instanceMatrix.needsUpdate = true;

  // 経験値
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    const big = g.v >= 50 ? 1.6 : g.v >= 12 ? 1.3 : g.v >= 3 ? 1.1 : 1;
    _p.set(g.x, 0.4 + Math.sin(t * 3 + g.t) * 0.08, g.z);
    _e.set(0, t * 2 + g.t, 0); _q.setFromEuler(_e);
    _s.set(big, big * 1.3, big);
    gemMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (g.v >= 50) _c.setRGB(1.0, 0.75, 0.1);
    else if (g.v >= 12) _c.setRGB(1.0, 0.25, 0.4);
    else if (g.v >= 3) _c.setRGB(0.25, 1.0, 0.45);
    else _c.setRGB(0.25, 0.65, 1.0);
    gemMesh.setColorAt(i, _c);
  }
  gemMesh.count = gems.length;
  gemMesh.instanceMatrix.needsUpdate = true;
  if (gemMesh.instanceColor) gemMesh.instanceColor.needsUpdate = true;

  // 鰹節
  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i];
    _p.set(f.x, f.y, f.z); _e.set(f.rx, f.ry, f.rx * 0.6); _q.setFromEuler(_e); _s.setScalar(S.area || 1);
    flakeMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
  }
  flakeMesh.count = flakes.length;
  flakeMesh.instanceMatrix.needsUpdate = true;

  // 弾
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    _p.set(b.x, 0.9, b.z); _q.identity(); _s.setScalar(1 + Math.sin(t * 12 + i) * 0.1);
    bulletMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (b.col === 1) _c.setRGB(0.55, 0.22, 0.05); else _c.setRGB(1.0, 0.62, 0.1);
    bulletMesh.setColorAt(i, _c);
  }
  bulletMesh.count = bullets.length;
  bulletMesh.instanceMatrix.needsUpdate = true;
  if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;

  // 地面・光・カメラ
  ground.position.set(P.x, 0, P.z);
  sandTex.offset.set(P.x / TILE, -P.z / TILE);
  sun.position.set(P.x + SUN_OFF.x, SUN_OFF.y, P.z + SUN_OFF.z);
  sun.target.position.set(P.x, 0, P.z);
  G.shake = Math.max(0, (G.shake || 0) - dt * 2.5);
  const sh = G.shake * G.shake * 0.8;
  camera.position.set(P.x + camOff.x + rand(-sh, sh), camOff.y + rand(-sh, sh), P.z + camOff.z + rand(-sh, sh));
  camera.lookAt(P.x, 0.6, P.z);

  parts.update(dt);
  fire.update(dt);
}

// ================================================================ 2Dオーバーレイ描画
function drawFx(dt) {
  const W = fx.width, H = fx.height, k = fx._k;
  fctx.clearRect(0, 0, W, H);
  const proj = (x, y, z) => {
    _v.set(x, y, z).project(camera);
    return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H, _v.z];
  };
  // ヌシサバの突進予告線
  for (const e of enemies) {
    if (e.boss && e.ai.mode === 'tele') {
      const [x0, y0] = proj(e.x, 0.1, e.z);
      const [x1, y1] = proj(e.x + e.ai.dx * 14, 0.1, e.z + e.ai.dz * 14);
      fctx.strokeStyle = 'rgba(255,40,40,0.45)';
      fctx.lineWidth = e.r * 2 * 22 * k;
      fctx.lineCap = 'round';
      fctx.beginPath(); fctx.moveTo(x0, y0); fctx.lineTo(x1, y1); fctx.stroke();
    }
  }
  // テキスト
  fctx.textAlign = 'center';
  fctx.textBaseline = 'middle';
  fctx.lineJoin = 'round';
  for (let i = texts.length - 1; i >= 0; i--) {
    const tx = texts[i];
    tx.life -= dt;
    if (tx.life <= 0) { texts.splice(i, 1); continue; }
    const age = tx.max - tx.life;
    const [sx, sy, sz] = proj(tx.x, tx.y + age * 1.4, tx.z);
    if (sz > 1) continue;
    const pop = age < 0.08 ? 1 + (0.08 - age) * 6 : 1;
    const px = Math.round(17 * tx.size * pop * k);
    fctx.globalAlpha = Math.min(1, tx.life / 0.25);
    fctx.font = `900 ${px}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif`;
    fctx.lineWidth = Math.max(2, px * 0.2);
    fctx.strokeStyle = 'rgba(10,20,40,0.85)';
    fctx.strokeText(tx.str, sx, sy);
    fctx.fillStyle = tx.color;
    fctx.fillText(tx.str, sx, sy);
  }
  fctx.globalAlpha = 1;
  if (G.state === 'title') return;
  // HPバー
  const [hx, hy] = proj(P.x, 0, P.z);
  const bw = 54 * k, bh = 7 * k;
  fctx.fillStyle = 'rgba(0,0,0,0.55)';
  fctx.fillRect(hx - bw / 2 - k, hy + 10 * k - k, bw + 2 * k, bh + 2 * k);
  const hpr = clamp(P.hp / P.maxHp, 0, 1);
  fctx.fillStyle = hpr > 0.5 ? '#4ee06a' : hpr > 0.25 ? '#ffc23a' : '#ff4646';
  fctx.fillRect(hx - bw / 2, hy + 10 * k, bw * hpr, bh);
  // 画面外のボスを示す矢印
  if (G.boss) {
    const [bx, by, bz] = proj(G.boss.x, 1, G.boss.z);
    if (bx < 0 || bx > W || by < 0 || by > H || bz > 1) {
      const cx = W / 2, cy = H / 2;
      let ax = bx - cx, ay = by - cy;
      if (bz > 1) { ax = -ax; ay = -ay; }
      const a = Math.atan2(ay, ax);
      const m = 40 * k;
      const ex = clamp(cx + Math.cos(a) * W, m, W - m), ey = clamp(cy + Math.sin(a) * H, m, H - m);
      fctx.save();
      fctx.translate(ex, ey); fctx.rotate(a);
      fctx.fillStyle = 'rgba(255,60,60,0.9)';
      fctx.beginPath(); fctx.moveTo(18 * k, 0); fctx.lineTo(-10 * k, -12 * k); fctx.lineTo(-10 * k, 12 * k); fctx.closePath(); fctx.fill();
      fctx.restore();
    }
  }
}

// ================================================================ HUD・画面
let lastHud = { sec: -1, kills: -1, lv: -1 };
function updateHud() {
  const sec = Math.floor(G.time);
  if (sec !== lastHud.sec) { $('timer').textContent = fmtTime(G.time); lastHud.sec = sec; }
  if (G.kills !== lastHud.kills) { $('kills').textContent = '🐟 ' + fmtNum(G.kills); lastHud.kills = G.kills; }
  if (G.level !== lastHud.lv) { $('lvtext').textContent = 'Lv ' + G.level; lastHud.lv = G.level; }
  $('xpfill').style.width = (clamp(G.xp / xpNeed(G.level), 0, 1) * 100).toFixed(1) + '%';
  if (G.boss) $('bossfill').style.width = (clamp(G.boss.hp / G.boss.maxHp, 0, 1) * 100).toFixed(1) + '%';
}
function renderWeaponList() {
  const el = $('weapons');
  let html = '';
  for (const k in WEAPONS) if (G.weapons[k]) html += `<div class="wi" title="${WEAPONS[k].name}">${WEAPONS[k].icon}<b>${G.weapons[k]}</b></div>`;
  html += '<div class="sep"></div>';
  for (const k in PASSIVES) if (G.passives[k]) html += `<div class="wi p" title="${PASSIVES[k].name}">${PASSIVES[k].icon}<b>${G.passives[k]}</b></div>`;
  el.innerHTML = html;
}

let bannerTimer = 0;
function banner(text, cls = '') {
  const el = $('banner');
  el.textContent = text;
  el.className = 'show ' + cls;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.className = ''; }, 2600);
}

function rollOptions(n) {
  const pool = [];
  const nW = Object.keys(G.weapons).length;
  for (const k in WEAPONS) {
    const lv = G.weapons[k] || 0;
    if (lv < WEAPONS[k].max) pool.push({ kind: 'w', key: k, w: lv ? 1.3 : (nW < 3 ? 1.4 : 0.8) });
  }
  for (const k in PASSIVES) {
    const lv = G.passives[k] || 0;
    if (lv < PASSIVES[k].max) pool.push({ kind: 'p', key: k, w: 0.75 });
  }
  const out = [];
  while (out.length < n && pool.length) {
    let sum = 0;
    for (const o of pool) sum += o.w;
    let r = Math.random() * sum, idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    out.push(pool.splice(idx, 1)[0]);
  }
  const extras = ['sendoInf', 'onigiri'];
  while (out.length < n && extras.length) out.push({ kind: 'x', key: extras.shift() });
  return out;
}
function optionInfo(o) {
  if (o.kind === 'w') {
    const W = WEAPONS[o.key], lv = G.weapons[o.key] || 0;
    return { icon: W.icon, name: W.name, tag: lv ? `Lv${lv + 1}` : 'NEW!', desc: W.desc[lv], cls: 'w' };
  }
  if (o.kind === 'p') {
    const Pp = PASSIVES[o.key], lv = G.passives[o.key] || 0;
    return { icon: Pp.icon, name: Pp.name, tag: lv ? `Lv${lv + 1}` : 'NEW!', desc: Pp.desc, cls: 'p' };
  }
  const X = EXTRAS[o.key];
  return { icon: X.icon, name: X.name, tag: '', desc: X.desc, cls: 'x' };
}
function applyOption(o) {
  if (o.kind === 'w') G.weapons[o.key] = (G.weapons[o.key] || 0) + 1;
  else if (o.kind === 'p') G.passives[o.key] = (G.passives[o.key] || 0) + 1;
  else if (o.key === 'sendoInf') G.infSendo++;
  else if (o.key === 'onigiri') P.hp = Math.min(P.maxHp, P.hp + 50);
  computeStats();
  renderWeaponList();
}

function openLevelUp() {
  const opts = rollOptions(3);
  if (opts.every(o => o.kind === 'x')) {
    // 全強化済み：モーダルを出さずに鮮度∞を自動適用
    while (G.pendingLv > 0) { G.pendingLv--; G.infSendo++; }
    computeStats();
    sound.play('levelup');
    floatText(P.x, 3.0, P.z, `鮮度∞ ×${S.dmgMul.toFixed(1)}`, '#ffd23a', 1.1, 1.0);
    return;
  }
  G.state = 'levelup';
  sound.play('levelup');
  const box = $('cards');
  box.innerHTML = '';
  opts.forEach((o, i) => {
    const info = optionInfo(o);
    const b = document.createElement('button');
    b.className = 'card ' + info.cls;
    b.innerHTML = `<div class="ic">${info.icon}</div><div class="tx"><div class="nm">${info.name} <span class="tag">${info.tag}</span></div><div class="ds">${info.desc}</div></div><div class="key">${i + 1}</div>`;
    b.onclick = () => {
      if (G.state !== 'levelup') return;
      sound.play('click');
      applyOption(o);
      G.pendingLv--;
      $('levelup').classList.add('hidden');
      G.state = 'play';
      if (G.pendingLv > 0) openLevelUp();
    };
    box.appendChild(b);
  });
  $('lvnum').textContent = G.level - G.pendingLv + 1;
  $('levelup').classList.remove('hidden');
  if (AUTO) setTimeout(() => { const c = box.querySelector('.card'); if (c) c.click(); }, 30);
}

function openChest(data) {
  G.state = 'chest';
  sound.play('chest');
  const list = $('chestlist');
  list.innerHTML = '';
  const opts = rollOptions(data.count);
  for (const o of opts) {
    const info = optionInfo(o);
    applyOption(o);
    const d = document.createElement('div');
    d.className = 'card ' + info.cls;
    d.innerHTML = `<div class="ic">${info.icon}</div><div class="tx"><div class="nm">${info.name} <span class="tag">${info.tag}</span></div><div class="ds">${info.desc}</div></div>`;
    list.appendChild(d);
  }
  if (data.awaken) {
    G.awaken *= 1.25;
    computeStats();
    const d = document.createElement('div');
    d.className = 'card x';
    d.innerHTML = `<div class="ic">⚡</div><div class="tx"><div class="nm">鰹の覚醒 <span class="tag">×${G.awaken.toFixed(2)}</span></div><div class="ds">ボス討伐の報酬：全ダメージ ×1.25（累積）</div></div>`;
    list.appendChild(d);
    P.hp = P.maxHp;
  }
  $('chesttitle').textContent = data.awaken ? `${data.name} の宝箱！` : '宝箱を手に入れた！';
  $('chest').classList.remove('hidden');
  if (AUTO) setTimeout(closeChest, 30);
}
function closeChest() {
  if (G.state !== 'chest') return;
  sound.play('click');
  $('chest').classList.add('hidden');
  G.state = 'play';
}

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  $('pausestats').innerHTML = statsHtml();
  $('pause').classList.remove('hidden');
}
function resumeGame() {
  if (G.state !== 'pause') return;
  $('pause').classList.add('hidden');
  G.state = 'play';
  lastT = performance.now();
}
function statsHtml() {
  const rows = [];
  for (const k in WEAPONS) if (G.weapons[k]) rows.push(`${WEAPONS[k].icon} ${WEAPONS[k].name} Lv${G.weapons[k]}`);
  for (const k in PASSIVES) if (G.passives[k]) rows.push(`${PASSIVES[k].icon} ${PASSIVES[k].name} Lv${G.passives[k]}`);
  rows.push(`⚔ ダメージ倍率 ×${S.dmgMul.toFixed(2)}`);
  return rows.map(r => `<div>${r}</div>`).join('');
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem('katsuo_best') || 'null'); } catch (e) { return null; }
}
function saveBest(b) {
  try { localStorage.setItem('katsuo_best', JSON.stringify(b)); } catch (e) { /* noop */ }
}
function rankOf(t) {
  const R = [[60, 'サバの餌'], [180, '見習い漁師'], [300, '一本釣り職人'], [600, '土佐の荒波'], [900, '藁焼き名人'], [1200, 'カツオ神'], [Infinity, '伝説のたたき職人']];
  for (const [s, n] of R) if (t < s) return n;
  return R[R.length - 1][1];
}
function showBestOnTitle() {
  const b = loadBest();
  $('best').textContent = b ? `自己ベスト ${fmtTime(b.time)}（撃破 ${fmtNum(b.kills)}）` : '';
}

function gameOver() {
  if (G.state === 'over') return;
  G.state = 'over';
  sound.play('gameover');
  sound.stopMusic();
  const best = loadBest();
  const isNew = !best || G.time > best.time;
  if (isNew) saveBest({ time: G.time, kills: G.kills, level: G.level });
  $('goTime').textContent = fmtTime(G.time);
  $('goRank').textContent = `称号：${rankOf(G.time)}`;
  $('goStats').innerHTML = `撃破数 <b>${fmtNum(G.kills)}</b>　レベル <b>${G.level}</b>　最大ダメージ <b>${fmtNum(G.maxDmg)}</b>`;
  $('goBest').textContent = isNew ? '🎉 自己ベスト更新！' : `自己ベスト ${fmtTime(best.time)}`;
  const text = `「カツオのたたきサバイバー」で鯖の猛攻を ${fmtTime(G.time)} 生き延びた！（撃破 ${fmtNum(G.kills)}・称号「${rankOf(G.time)}」） #カツオのたたきサバイバー`;
  $('shareBtn').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.href.split(/[?#]/)[0])}`;
  setTimeout(() => $('gameover').classList.remove('hidden'), 700);
  $('hud').classList.add('hidden');
  joy.active = false; joyEl.classList.add('hidden');
}

function startGame() {
  sound.init();
  sound.play('click');
  resetGame();
  $('title').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('hud').classList.remove('hidden');
  lastHud = { sec: -1, kills: -1, lv: -1 };
  sound.startMusic();
  lastT = performance.now();
  banner('迫り来る鯖を、鰹で〆ろ！');
}
function toTitle() {
  G.state = 'title';
  $('gameover').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('title').classList.remove('hidden');
  sound.stopMusic();
  showBestOnTitle();
}
function toggleMute() {
  sound.init();
  sound.setMuted(!sound.muted);
  updateMuteButtons();
}
function updateMuteButtons() {
  for (const el of document.querySelectorAll('.muteBtn')) el.textContent = sound.muted ? '🔇' : '🔊';
}

$('startBtn').onclick = startGame;
$('retryBtn').onclick = startGame;
$('titleBtn').onclick = toTitle;
$('resumeBtn').onclick = resumeGame;
$('quitBtn').onclick = () => { if (G.state === 'pause') { G.state = 'over'; toTitle(); } };
$('pauseBtn').onclick = () => pauseGame();
$('chestOk').onclick = closeChest;
for (const el of document.querySelectorAll('.muteBtn')) el.onclick = toggleMute;
updateMuteButtons();

// ================================================================ タイトル画面の鰹ショーケース
const show = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 1, 0.1, 50) };
show.scene.background = new THREE.Color(0x0a1626);
show.scene.environment = scene.environment;
{
  const key = new THREE.DirectionalLight(0xfff2e0, 3.2); key.position.set(-2, 4, 3);
  const rim = new THREE.DirectionalLight(0x7fb4ff, 2.6); rim.position.set(2, 1, -4);
  const fill = new THREE.HemisphereLight(0x9cc8ff, 0x1a2030, 0.6);
  show.scene.add(key, rim, fill);
}
const showK = F.buildKatsuo(katsuoMats, 1.8, 0.42, 0);
show.scene.add(showK);
show.cam.position.set(0, 0.25, 3.3);
show.cam.lookAt(0, 0.05, 0);

// ================================================================ リサイズ・ループ
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  camera.aspect = w / h;
  const vf = camera.fov * Math.PI / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const d = clamp(10.5 / Math.tan(hf / 2), 15.5, 26);
  camOff.set(0, 0.74, 0.67).normalize().multiplyScalar(ZOOM || d);
  camera.updateProjectionMatrix();
  camera.position.copy(camOff); camera.lookAt(0, 0.6, 0); camera.updateMatrixWorld();
  const rc = new THREE.Raycaster(), pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    rc.setFromCamera(new THREE.Vector2(x, y), camera);
    if (rc.ray.intersectPlane(pl, hit)) {
      xmin = Math.min(xmin, hit.x); xmax = Math.max(xmax, hit.x); zmin = Math.min(zmin, hit.z); zmax = Math.max(zmax, hit.z);
    }
  }
  if (isFinite(xmin)) Object.assign(view, { xmin, xmax, zmin, zmax });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.width = Math.round(w * dpr); fx.height = Math.round(h * dpr);
  fx.style.width = w + 'px'; fx.style.height = h + 'px';
  fx._k = dpr * clamp(Math.min(w, h) / 700, 0.8, 1.3);
  const sc = (h * PR) / (2 * Math.tan(vf / 2));
  parts.mat.uniforms.scale.value = sc;
  fire.mat.uniforms.scale.value = sc;
  show.cam.aspect = w / h;
  // 縦長画面でも鰹が画面幅に収まる距離に
  const sv = Math.tan(show.cam.fov * Math.PI / 360);
  show.cam.position.z = Math.max(3.6, 1.25 / (sv * show.cam.aspect));
  show.portrait = w / h < 0.8;
  show.cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let lastT = performance.now();
let simTime = 0, frameNo = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  simTime += dt;
  if (G.state === 'title') {
    showK.rotation.y = simTime * 0.45;
    showK.rotation.z = Math.sin(simTime * 0.9) * 0.12;
    showK.rotation.x = Math.sin(simTime * 0.6) * 0.08;
    showK.position.y = (show.portrait ? 0.05 : -0.32) + Math.sin(simTime * 1.3) * 0.04;
    renderer.render(show.scene, show.cam);
    fctx.clearRect(0, 0, fx.width, fx.height);
    return;
  }
  if (G.state === 'play') {
    // 低FPS時も判定を安定させるため分割
    if (TURBO) { for (let i = 0; i < TURBO && G.state === 'play'; i++) simulate(1 / 60); }
    else {
      const steps = dt > 0.025 ? 2 : 1;
      for (let i = 0; i < steps && G.state === 'play'; i++) simulate(dt / steps);
    }
  }
  const vdt = G.state === 'play' ? dt : 0;
  frameNo++;
  if (TURBO && frameNo % 20 !== 0 && G.state === 'play') { parts.update(1 / 60 * TURBO); fire.update(1 / 60 * TURBO); texts.length = 0; return; }
  syncScene(vdt, simTime);
  renderer.render(scene, camera);
  drawFx(G.state === 'play' || G.state === 'over' ? dt : 0);
  if (G.state !== 'over') updateHud();
}

// シェーダーを事前コンパイル（初登場時のカクつき防止）
function warmup() {
  const hidden = [];
  scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const tmp = ['onigiri', 'float', 'chest'].map(k => makeItemMesh(k));
  try { renderer.compile(scene, camera); } catch (e) { /* noop */ }
  for (const m of tmp) scene.remove(m);
  for (const o of hidden) o.visible = false;
}
warmup();

// 初期化完了
G.state = 'title';
showBestOnTitle();
$('loading').classList.add('hidden');
$('title').classList.remove('hidden');
requestAnimationFrame(frame);
// 藁焼き版の鰹テクスチャはタイトル表示中に先に焼いておく（取得時のカクつき防止）
setTimeout(() => { if (!katsuoMats.searedMap) katsuoMats.searedMap = F.makeKatsuoTexture(true); }, 600);
if (AUTO) setTimeout(startGame, 300);
window.__game = { G, P, enemies, S: () => S, gems, fps: () => frameNo, parts };
