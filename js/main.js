// カツオのたたきサバイバー
import * as THREE from 'three';
import * as F from './fish.js';
import { buildPlayer, animatePlayer } from './human.js';
import { Sound } from './audio.js';
import { WEAPONS, EVOS, PASSIVES, EXTRAS, TYPES, BOSSES, BOSS_ORDER, CHARS, SHOP, shopCost, DIFFS, ACH, RANKS } from './data.js';
import { loadSave, persist, wipeSave } from './save.js';

const TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const AUTO = params.has('auto');
const TURBO = +params.get('turbo') || 0;
const ZOOM = +params.get('zoom') || 0;
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const save = loadSave(isMobile);
const sound = new Sound();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ge = (lv, n) => (lv >= n ? 1 : 0);
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
  if (n < 1e16) return (n / 1e12).toFixed(n < 1e13 ? 1 : 0) + '兆';
  return (n / 1e16).toFixed(1) + '京';
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
const shopLv = k => save.shop[k] || 0;
const achDone = id => !id || !!save.ach[id];

// ================================================================ レンダラー
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe2ec);
scene.fog = new THREE.Fog(0xbfe2ec, 42, 95);

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
// 夜道を照らす提灯
const lantern = new THREE.PointLight(0xffc27a, 0, 18, 1.6);
scene.add(lantern);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
const camOff = new THREE.Vector3();
const view = { xmin: -15, xmax: 15, zmin: -14, zmax: 10 };

// ---- 昼夜サイクル（20分で一周）
// [位置, 太陽色, 太陽強度, 空色, 地面色, 半球光強度, 背景色, 環境光, 提灯]
const DAY_KEYS = [
  [0.00, 0xffd2a8, 1.7, 0xcfe0ff, 0xb89868, 0.65, 0xd9e4ea, 0.85, 0],
  [0.20, 0xfff0d8, 2.3, 0xd8ecff, 0xb89868, 0.75, 0xbfe2ec, 1.0, 0],
  [0.45, 0xfff0d8, 2.3, 0xd8ecff, 0xb89868, 0.75, 0xbfe2ec, 1.0, 0],
  [0.56, 0xff9a55, 1.9, 0xffc89a, 0xa07050, 0.6, 0xf0b088, 0.8, 0],
  [0.66, 0xd0603a, 1.0, 0x8a6a9a, 0x504060, 0.45, 0x705880, 0.5, 0.5],
  [0.76, 0x6a88d0, 0.55, 0x3a4a80, 0x202838, 0.38, 0x1a2444, 0.32, 1],
  [0.92, 0x6a88d0, 0.55, 0x3a4a80, 0x202838, 0.38, 0x1a2444, 0.32, 1],
  [1.00, 0xffd2a8, 1.7, 0xcfe0ff, 0xb89868, 0.65, 0xd9e4ea, 0.85, 0],
];
const _ca = new THREE.Color(), _cb = new THREE.Color(), _cc = new THREE.Color();
function lerpHex(a, b, t, out) { _ca.setHex(a); _cb.setHex(b); return out.copy(_ca).lerp(_cb, t); }
function phaseName(p) {
  return p < 0.18 ? '🌅 朝' : p < 0.52 ? '☀️ 昼' : p < 0.7 ? '🌇 夕方' : p < 0.94 ? '🌙 夜' : '🌄 夜明け';
}
function applyDaylight(t, storm) {
  const p = (t % 1200) / 1200;
  let i = 0;
  while (i < DAY_KEYS.length - 2 && p > DAY_KEYS[i + 1][0]) i++;
  const A = DAY_KEYS[i], B = DAY_KEYS[i + 1];
  const k = clamp((p - A[0]) / (B[0] - A[0]), 0, 1);
  const s = 1 - storm * 0.45;
  lerpHex(A[1], B[1], k, sun.color);
  sun.intensity = (A[2] + (B[2] - A[2]) * k) * s;
  lerpHex(A[3], B[3], k, hemi.color);
  lerpHex(A[4], B[4], k, hemi.groundColor);
  hemi.intensity = (A[5] + (B[5] - A[5]) * k) * (1 - storm * 0.3);
  lerpHex(A[6], B[6], k, _cc);
  if (storm > 0) _cc.lerp(_ca.setHex(0x4a5664), storm * 0.6);
  scene.background.copy(_cc);
  scene.fog.color.copy(_cc);
  scene.environmentIntensity = (A[7] + (B[7] - A[7]) * k) * s;
  lantern.intensity = (A[8] + (B[8] - A[8]) * k) * 55 + storm * 20;
  return p;
}

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
function makeFlagTexture() {
  const c = makeCanvas(128, 80), ctx = c.getContext('2d');
  const cols = ['#d23a2a', '#ffffff', '#1d4f9c', '#ffcf3a', '#2e9a4a'];
  cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * 16, 128, 16); });
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.font = 'bold 34px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeText('大漁', 64, 42); ctx.fillText('大漁', 64, 42);
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
let player = buildPlayer();
scene.add(player);
function setPlayerLook(look) {
  scene.remove(player);
  player.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
  player = buildPlayer(look);
  scene.add(player);
}
const katsuoMats = F.makeKatsuoMaterials();
const KATSUO_LEN = 1.8, GRIP_OFF = 0.5;
const katsuo = F.buildKatsuo(katsuoMats, KATSUO_LEN, 0.97, GRIP_OFF);
const katsuoPivot = new THREE.Group();
katsuoPivot.rotation.order = 'YXZ';
katsuoPivot.add(katsuo);
scene.add(katsuoPivot);
function setGoldKatsuo(gold) {
  katsuoMats.body.color.setHex(gold ? 0xffd04a : 0xffffff);
  katsuoMats.body.metalness = gold ? 0.85 : 0.42;
}

// ================================================================ 敵モデル（インスタンス描画）
const MAXE = isMobile ? 240 : 380;
const CORPSE_MAX = 70;
const sabaG = F.sabaGeometry();
const canG = F.canGeometry();
const MODELS = {};
for (const [k, geo, mats, cap] of [
  ['masaba', sabaG, F.makeSabaMaterials('masaba')],
  ['gomasaba', sabaG, F.makeSabaMaterials('gomasaba')],
  ['kinka', sabaG, F.makeSabaMaterials('kinka')],
  ['shime', sabaG, F.makeSabaMaterials('shime')],
  ['yaki', sabaG, F.makeSabaMaterials('yaki')],
  ['can', canG, F.makeCanMaterials()],
  ['battera', F.batteraGeometry(), F.makeBatteraMaterials()],
  ['taru', F.taruGeometry(), F.makeTaruMaterials(), 16],
]) {
  const m = new THREE.InstancedMesh(geo, mats, cap || MAXE + CORPSE_MAX);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  m.count = 0;
  m.frustumCulled = false;
  if (k === 'taru') m.castShadow = true;
  scene.add(m);
  MODELS[k] = m;
}
const blobTex = makeRadialTexture([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
const blobG = new THREE.PlaneGeometry(1, 1); blobG.rotateX(-Math.PI / 2);
const blobs = new THREE.InstancedMesh(blobG, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), MAXE + CORPSE_MAX + 40);
blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 1;
scene.add(blobs);

// ボス
function buildBossMeshes() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc935, metalness: 0.9, roughness: 0.25 });
  const blackM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const whiteM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const out = {};
  {
    const g = new THREE.Group();
    const mats = F.makeSabaMaterials('masaba');
    const body = new THREE.Mesh(sabaG, mats); body.castShadow = true; g.add(body);
    const crown = new THREE.Group();
    crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.07, 10, 1, true), gold));
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), gold);
      const a = i / 5 * TAU; sp.position.set(Math.cos(a) * 0.09, 0.07, Math.sin(a) * 0.09); crown.add(sp);
    }
    crown.position.set(0, 0.16, 0.38);
    g.add(crown);
    g.userData.mats = mats;
    out.nushi = g;
  }
  {
    const g = new THREE.Group();
    const mats = F.makeCanMaterials();
    const body = new THREE.Mesh(canG, mats); body.castShadow = true;
    body.rotation.z = Math.PI / 2;
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
  // 鯖神：光り輝く黄金の鯖
  {
    const g = new THREE.Group();
    const mats = F.makeSabaMaterials('kinka');
    mats[0].metalness = 0.8; mats[0].roughness = 0.2;
    const body = new THREE.Mesh(sabaG, mats); body.castShadow = true; g.add(body);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe680 }));
    halo.position.set(0, 0.32, 0.12); halo.rotation.x = Math.PI / 2; g.add(halo);
    const orbs = [];
    for (let i = 0; i < 6; i++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
      g.add(o); orbs.push(o);
    }
    g.userData.mats = mats;
    g.userData.orbs = orbs;
    g.userData.halo = halo;
    out.kami = g;
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

const COIN_MAX = 200;
const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 18); coinGeo.rotateX(Math.PI / 2); coinGeo.scale(1.35, 1, 1);
const coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffc935, metalness: 0.95, roughness: 0.25, emissive: 0x332200 }), COIN_MAX);
coinMesh.count = 0; coinMesh.frustumCulled = false; coinMesh.castShadow = true;
scene.add(coinMesh);

const FLAKE_MAX = 420;
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

const BULLET_MAX = 420;
const bulletMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), BULLET_MAX);
bulletMesh.setColorAt(0, new THREE.Color(1, 1, 1)); bulletMesh.count = 0; bulletMesh.frustumCulled = false;
scene.add(bulletMesh);

const KNIFE_MAX = 200;
const knifeMesh = (() => {
  const blade = new THREE.BoxGeometry(0.09, 0.015, 0.5); blade.translate(0, 0, 0.18);
  const handle = new THREE.BoxGeometry(0.06, 0.05, 0.24); handle.translate(0, 0, -0.18);
  const g = F.mergeGeos([blade, handle]);
  g.addGroup(0, blade.index.count, 0); g.addGroup(blade.index.count, handle.index.count, 1);
  const m = new THREE.InstancedMesh(g, [
    new THREE.MeshStandardMaterial({ color: 0xe6edf4, metalness: 0.95, roughness: 0.15 }),
    new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 }),
  ], KNIFE_MAX);
  m.count = 0; m.frustumCulled = false; scene.add(m);
  return m;
})();

const throwPool = [];
for (let i = 0; i < 9; i++) {
  const k = F.buildKatsuo(katsuoMats, 1.3, 0.55, 0);
  k.visible = false; scene.add(k);
  throwPool.push(k);
}

// 鰹乱舞用：空から降る大量の鰹（インスタンス描画）
const RAIN_MAX = 52;
const rainMeshes = (() => {
  const geos = F.katsuoGeos(2.1, 0.5, 0);
  const pairs = [['body', 'body'], ['fins', 'fin'], ['iris', 'iris'], ['pupil', 'pupil']];
  return pairs.map(([g, m]) => {
    const im = new THREE.InstancedMesh(geos[g], katsuoMats[m], RAIN_MAX);
    im.count = 0; im.frustumCulled = false; im.castShadow = true; scene.add(im);
    return im;
  });
})();

const yakumiMeshes = (() => {
  const arr = [];
  const garlic = new THREE.MeshStandardMaterial({ color: 0xf7f0dc, roughness: 0.5 });
  const ginger = new THREE.MeshStandardMaterial({ color: 0xf0d36a, roughness: 0.6 });
  const negi = new THREE.MeshStandardMaterial({ color: 0x5fb94a, roughness: 0.5 });
  const geos = [new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18), new THREE.BoxGeometry(0.34, 0.08, 0.34), new THREE.TorusGeometry(0.22, 0.08, 8, 18)];
  const mats = [garlic, ginger, negi];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(geos[i % 3], mats[i % 3]);
    m.castShadow = true; m.visible = false; scene.add(m); arr.push(m);
  }
  return arr;
})();

const puddleMat = new THREE.MeshStandardMaterial({ color: 0xc07018, transparent: true, opacity: 0.62, roughness: 0.04, metalness: 0.15, depthWrite: false });
const seaMat = new THREE.MeshStandardMaterial({ color: 0x1f78c0, transparent: true, opacity: 0.6, roughness: 0.02, metalness: 0.2, depthWrite: false });
const puddleGeo = new THREE.CircleGeometry(1, 40); puddleGeo.rotateX(-Math.PI / 2);
const puddlePool = [];
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(puddleGeo, puddleMat); m.visible = false; m.renderOrder = 2; scene.add(m); puddlePool.push(m);
}

const fireGlow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
  map: makeRadialTexture([[0, 'rgba(255,170,60,0.0)'], [0.6, 'rgba(255,110,30,0.12)'], [0.9, 'rgba(255,80,20,0.4)'], [1, 'rgba(255,60,0,0)']]),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
fireGlow.visible = false; fireGlow.renderOrder = 3; scene.add(fireGlow);

// 衝撃波リング
const ringGeo = new THREE.RingGeometry(0.88, 1.0, 56); ringGeo.rotateX(-Math.PI / 2);
const ringPool = [];
for (let i = 0; i < 24; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.visible = false; m.renderOrder = 4; scene.add(m); ringPool.push(m);
}

// カモメ
function buildGull() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.7 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf0a020, roughness: 0.5 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const body = add(new THREE.SphereGeometry(0.22, 10, 8), white, 0, 0, 0); body.scale.set(0.8, 0.75, 1.6);
  add(new THREE.SphereGeometry(0.14, 10, 8), white, 0, 0.1, 0.36);
  const beak = add(new THREE.ConeGeometry(0.04, 0.16, 6), orange, 0, 0.08, 0.52); beak.rotation.x = Math.PI / 2;
  for (const sx of [1, -1]) add(new THREE.SphereGeometry(0.022, 6, 4), dark, sx * 0.07, 0.15, 0.44);
  add(new THREE.BoxGeometry(0.22, 0.03, 0.2), white, 0, 0, -0.38);
  const wings = [];
  for (const sx of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(sx * 0.12, 0.08, 0); g.add(pv);
    add(new THREE.BoxGeometry(0.5, 0.03, 0.3), grey, sx * 0.25, 0, 0, pv);
    add(new THREE.BoxGeometry(0.28, 0.025, 0.22), dark, sx * 0.62, 0, -0.03, pv);
    wings.push(pv);
  }
  g.userData.wings = wings;
  g.visible = false; scene.add(g);
  return g;
}
const gullPool = [];
for (let i = 0; i < 12; i++) gullPool.push(buildGull());

// 一本釣りの釣り針と糸
const hookPool = [];
{
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.85 });
  const hookMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.95, roughness: 0.2 });
  for (let i = 0; i < 24; i++) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lg, lineMat);
    line.frustumCulled = false;
    const hook = new THREE.Group();
    const curve = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI * 1.35), hookMat);
    curve.rotation.z = Math.PI * 0.85;
    hook.add(curve);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), hookMat);
    shaft.position.set(0.16, 0.25, 0); hook.add(shaft);
    line.visible = false; hook.visible = false;
    scene.add(line, hook);
    hookPool.push({ line, hook, busy: false });
  }
}

function makeItemMesh(kind) {
  const g = new THREE.Group();
  const std = o => new THREE.MeshStandardMaterial(o);
  if (kind === 'onigiri') {
    const rice = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 3), std({ color: 0xfafafa, roughness: 0.8 }));
    rice.rotation.x = Math.PI / 2; rice.rotation.y = Math.PI / 2;
    const nori = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), std({ color: 0x1d2a1d, roughness: 0.6 }));
    nori.position.y = -0.12;
    g.add(rice, nori);
  } else if (kind === 'teishoku') {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.55), std({ color: 0x6a2a1a, roughness: 0.4 }));
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), std({ color: 0xffffff, roughness: 0.3 }));
    bowl.position.set(-0.2, 0.16, 0);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.04, 16), std({ color: 0xe0e8f0, roughness: 0.3 }));
    plate.position.set(0.15, 0.05, 0);
    g.add(tray, bowl, plate);
    for (let i = 0; i < 4; i++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.2), std({ color: 0xb02030, roughness: 0.3 }));
      sl.position.set(0.06 + i * 0.06, 0.1, 0); sl.rotation.z = 0.3; g.add(sl);
    }
  } else if (kind === 'float') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), std({ color: 0x2fa0e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 20), std({ color: 0xc8a060 }));
    rope.rotation.x = Math.PI / 2;
    g.add(ball, rope);
  } else if (kind === 'chest') {
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.55), std({ color: 0x8a5a2b, roughness: 0.7 }));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.8, 12, 1, false, 0, Math.PI), std({ color: 0x9a6a33, roughness: 0.7 }));
    lid.rotation.z = Math.PI / 2; lid.position.y = 0.25;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.82, 0.58), std({ color: 0xffcc33, metalness: 0.9, roughness: 0.3 }));
    band.position.y = 0.1;
    g.add(wood, lid, band);
  } else if (kind === 'tokei') {
    const glass = std({ color: 0xbfe8ff, roughness: 0.05, transparent: true, opacity: 0.6 });
    const sand = std({ color: 0xe8c070 });
    const frame = std({ color: 0x6a4020, roughness: 0.6 });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 12), glass); c1.position.y = 0.15; c1.rotation.x = Math.PI;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 12), glass); c2.position.y = -0.15;
    const s1 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.15, 12), sand); s1.position.y = -0.22;
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 12), frame); t1.position.y = 0.32;
    const t2 = t1.clone(); t2.position.y = -0.32;
    g.add(c1, c2, s1, t1, t2);
  } else if (kind === 'hata') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), std({ color: 0x8a6a3a }));
    pole.position.set(-0.3, 0.2, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.44, 4, 1), std({ map: makeFlagTexture(), side: THREE.DoubleSide, roughness: 0.7 }));
    flag.position.set(0.05, 0.55, 0);
    g.add(pole, flag);
  } else if (kind === 'koban') {
    const m = std({ color: 0xffc935, metalness: 0.95, roughness: 0.25, emissive: 0x332200 });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(coinGeo, m);
      c.rotation.x = Math.PI / 2; c.position.set(rand(-0.15, 0.15), -0.25 + i * 0.06, rand(-0.15, 0.15));
      g.add(c);
    }
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
const parts = new Particles(isMobile ? 1800 : 3600, false);
const fire = new Particles(isMobile ? 900 : 1800, true);

function splash(x, y, z, n, col = [0.85, 0.95, 1], spd = 5) {
  if (save.settings.quality === 'low') n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.3, 1) * spd;
    parts.spawn(x, y, z, Math.cos(a) * s, rand(1, 5), Math.sin(a) * s, rand(0.3, 0.6), rand(0.15, 0.32), col[0], col[1], col[2], 0.9, 14);
  }
}
function burstFire(x, y, z, n, spd = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.4, 1) * spd;
    fire.spawn(x, y, z, Math.cos(a) * s, rand(1, 6), Math.sin(a) * s, rand(0.3, 0.7), rand(0.4, 0.8), 1, rand(0.4, 0.8), 0.15, 0.9, 6);
  }
}

// ================================================================ オーバーレイ（テキスト・演出）
const fx = $('fx');
const fctx = fx.getContext('2d');
const texts = [];
function floatText(x, y, z, str, color = '#fff', size = 1, life = 0.75) {
  if (texts.length > 110) texts.shift();
  texts.push({ x, y, z, str, color, size, life, max: life });
}
function flash(a = 0.6, color = '#ffffff') {
  const el = $('flash');
  el.style.transition = 'none';
  el.style.background = color;
  el.style.opacity = a;
  requestAnimationFrame(() => { el.style.transition = 'opacity .45s'; el.style.opacity = 0; });
}
let bannerTimer = 0;
function banner(text, cls = '') {
  const el = $('banner');
  el.textContent = text;
  el.className = 'show ' + cls;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.className = ''; }, 2600);
}
function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + cls;
  d.innerHTML = html;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 3700);
}
let cutinTimer = 0;
function cutin(name, sub, final) {
  const el = $('cutin');
  el.className = final ? 'final' : '';
  el.querySelector('.ci-name').textContent = name;
  el.querySelector('.ci-sub').textContent = sub;
  const band = el.querySelector('.ci-band');
  band.style.animation = 'none'; void band.offsetWidth; band.style.animation = '';
  clearTimeout(cutinTimer);
  cutinTimer = setTimeout(() => el.classList.add('hidden'), 1900);
}
function shake(v) { if (save.settings.shake) G.shake = Math.max(G.shake || 0, v); }

// ================================================================ ゲーム状態
const xpNeed = L => Math.floor(4 + L * 5.5 + L * L * 0.42);
// 敵のインフレ（12分以降はさらに急加速して、いつかは必ず呑まれる）
const hpMul = t => (1 + t / 240) * Math.pow(1.11, t / 60) * (1 + Math.pow(Math.max(0, t - 720) / 500, 2));
const eDmgMul = t => 1 + t / 300;
const eSpdMul = t => 1 + Math.min(0.35, t / 1800);

const G = { state: 'boot' };
const P = {};
let S = {};
let DIFF = DIFFS.normal, CHAR = CHARS.taro;
const enemies = [], corpses = [], gems = [], coins = [], items = [], throws = [], flakes = [], puddles = [], bullets = [],
  knives = [], hooks = [], rings = [], rainK = [], strikes = [];
const TK = {}, WY = {}, NG = {}, BS = {}, PZ = {}, YK = {}, DB = {}, KM = { gulls: [] }, IP = {};

function computeStats() {
  const p = G.passives, g = k => p[k] || 0, C = CHAR.mods;
  const prevMax = S.maxHp || 0;
  S = {
    dmgMul: (1 + 0.12 * g('sendo')) * G.awaken * (1 + 0.08 * G.infSendo) * (1 + 0.05 * shopLv('power')) * (1 + (C.dmg || 0)),
    speed: 5.4 * (1 + 0.08 * g('zori') + 0.04 * shopLv('speed') + (C.speed || 0)),
    maxHp: 100 + 20 * g('dha') + 10 * shopLv('hp') + (C.hp || 0),
    regen: 0.4 * g('ocha') + 0.2 * shopLv('regen'),
    magnet: 2.8 * (1 + 0.35 * g('ami') + 0.15 * shopLv('magnet') + (C.magnet || 0)),
    xpMul: 1 + 0.12 * g('tairyo') + 0.06 * shopLv('xp'),
    cdMul: Math.max(0.4, 1 - 0.07 * g('hachimaki') - 0.03 * shopLv('cd')),
    armor: g('maekake') + shopLv('armor'),
    area: 1 + 0.1 * g('ozara') + 0.04 * shopLv('area') + (C.area || 0),
    luck: 1 + 0.1 * g('maneki') + 0.08 * shopLv('luck') + (C.luck || 0),
    crit: 0.08 + 0.02 * g('maneki') + (C.crit || 0),
    amount: g('dashi'),
    coinMul: (1 + 0.1 * shopLv('greed') + (C.coin || 0)) * DIFF.coin,
    dashCd: 2.2 * (1 - 0.1 * shopLv('dash')),
    gaugeMul: 1 + 0.15 * shopLv('gauge'),
  };
  if (prevMax && S.maxHp > prevMax) P.hp += S.maxHp - prevMax;
  P.maxHp = S.maxHp;
  P.hp = Math.min(P.hp, P.maxHp);
}

function resetGame() {
  const charKey = CHARS[save.char] && achDone(CHARS[save.char].unlock) ? save.char : 'taro';
  const diffKey = DIFFS[save.diff] && achDone(DIFFS[save.diff].unlock) ? save.diff : 'normal';
  CHAR = CHARS[charKey]; DIFF = DIFFS[diffKey];
  Object.assign(G, {
    state: 'play', time: 0, kills: 0, level: 1, xp: 0, pendingLv: 0, char: charKey, diffKey,
    weapons: CHAR.weapon === 'tataki' ? { tataki: charKey === 'taro' ? 2 : 1 } : { tataki: 1, [CHAR.weapon]: 1 }, passives: {}, evolved: {}, banished: new Set(),
    infSendo: 0, awaken: 1,
    nextElite: 75, nextWave: 240, bossIdx: 0, nextBoss: 150, spawnAcc: 0, shake: 0, boss: null,
    noticeIdx: 0, god: params.has('god'), seared: false, maxDmg: 0, dmgLog: {}, wdmg: {}, coins: 0,
    combo: 0, comboT: 0, maxCombo: 0, gauge: 0, gaugeMax: 100, specials: 0, special: null,
    hitstop: 0, slowmo: 0, slowScale: 1, freezeT: 0,
    rushT: 0, nextRush: 270, stormT: 0, nextStorm: 450, nextFlock: 95, nextTaru: 10, lightT: 1,
    kamiSpawned: false, kamiDone: false,
    rerolls: shopLv('reroll') + 1, skips: shopLv('skip') + 1, banishes: shopLv('banish'), revives: shopLv('revive'),
    bossKilled: {}, noDmg3: true, phase: '', achT: 0, newAch: [], tipIdx: 0, simMs: 0, simMax: 0,
  });
  Object.assign(P, { x: 0, z: 0, facing: 0, hp: 100, maxHp: 100, inv: 0, hurtT: 0, walk: 0, moving: false, dashT: 0, dashCd: 0, dashDx: 0, dashDz: 1 });
  S = {};
  computeStats();
  P.hp = P.maxHp;
  enemies.length = 0; corpses.length = 0; gems.length = 0; coins.length = 0; flakes.length = 0; bullets.length = 0;
  knives.length = 0; rainK.length = 0; strikes.length = 0;
  for (const it of items) scene.remove(it.mesh);
  items.length = 0;
  for (const t of throws) t.mesh.visible = false;
  throws.length = 0;
  for (const p of puddles) p.mesh.visible = false;
  puddles.length = 0;
  for (const h of hooks) { h.obj.busy = false; h.obj.line.visible = false; h.obj.hook.visible = false; }
  hooks.length = 0;
  for (const r of rings) r.mesh.visible = false;
  rings.length = 0;
  for (const g of KM.gulls) g.mesh.visible = false;
  KM.gulls.length = 0;
  for (const k in BOSS_MESH) BOSS_MESH[k].visible = false;
  parts.clear(); fire.clear(); texts.length = 0;
  Object.assign(TK, { swinging: false, t: 0, dur: 0.26, a0: 0, a1: 0, prev: 0, side: 1, cd: 0.4, id: 0, second: false, yaw: 0, pitch: 1.0, hits: 0 });
  Object.assign(WY, { tick: 0 });
  Object.assign(NG, { cd: 1.0 });
  Object.assign(BS, { cd: 0.5, spinT: 0, ang: 0 });
  Object.assign(PZ, { cd: 1.0 });
  Object.assign(YK, { ang: 0 });
  Object.assign(DB, { cd: 0.6 });
  Object.assign(IP, { cd: 1.5 });
  katsuoMats.body.map = katsuoMats.rawMap;
  katsuoMats.body.needsUpdate = true;
  setGoldKatsuo(!!CHAR.look.gold);
  setPlayerLook(CHAR.look);
  DECOR.last = '';
  $('bossbar').classList.add('hidden');
  sound.intensity = 0;
  renderWeaponList();
}

// ================================================================ 入力
const keys = {};
const joy = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vz: 0 };
const GP = { prev: [], prevNav: {}, vx: 0, vz: 0 };
const SUBMENUS = ['settings', 'charsel', 'shop', 'achv', 'rank', 'codex'];

addEventListener('keydown', e => {
  keys[e.code] = true;
  const st = G.state;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (st === 'play') pauseGame();
    else if (st === 'pause' && $('settings').classList.contains('hidden')) resumeGame();
    else backAction();
  }
  if (e.code === 'KeyM') toggleMute();
  if (st === 'play') {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') { e.preventDefault(); tryDash(); }
    if (e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'KeyJ') trySpecial();
  } else {
    if (['ArrowUp', 'ArrowLeft'].includes(e.code)) { e.preventDefault(); navFocus(-1); }
    if (['ArrowDown', 'ArrowRight'].includes(e.code)) { e.preventDefault(); navFocus(1); }
  }
  if (st === 'levelup') {
    if (/^Digit[1-4]$/.test(e.code)) { const btn = document.querySelectorAll('#cards .card')[+e.code.slice(5) - 1]; if (btn) btn.click(); }
    if (e.code === 'KeyR') $('rerollBtn').click();
    if (e.code === 'KeyX') $('skipBtn').click();
    if (e.code === 'KeyB') $('banishBtn').click();
  }
  if (st === 'title' && (e.code === 'Enter' || e.code === 'Space') && !SUBMENUS.some(id => !$(id).classList.contains('hidden')) && document.activeElement === document.body) {
    e.preventDefault(); openCharSel();
  }
  if (st === 'chest' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); closeChest(); }
  if (DEBUG && st === 'play') {
    if (e.code === 'KeyT') G.time += 60;
    if (e.code === 'KeyL') addXp(xpNeed(G.level) / S.xpMul + 0.01);
    if (e.code === 'KeyB') G.nextBoss = G.time;
    if (e.code === 'KeyG') G.gauge = G.gaugeMax;
    if (e.code === 'KeyC') for (const k in G.weapons) G.weapons[k] = 8;
    if (e.code === 'KeyV') spawnItem('chest', P.x + 2, P.z, { count: 3 });
    if (e.code === 'KeyY') G.coins += 500;
    if (e.code === 'KeyU') G.nextStorm = G.time;
    if (e.code === 'KeyO') G.nextRush = G.time;
    if (e.code === 'KeyH') { G.time = Math.max(G.time, 1199); }
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
$('dashBtn').addEventListener('pointerdown', e => { e.preventDefault(); tryDash(); });
$('spBtn').addEventListener('pointerdown', e => { e.preventDefault(); trySpecial(); });

// メニューのフォーカス移動（キーボード・ゲームパッド）
function topScreen() {
  for (const id of ['settings', 'chest', 'levelup', 'pause', 'gameover', 'charsel', 'shop', 'achv', 'rank', 'codex', 'title']) {
    const el = $(id);
    if (!el.classList.contains('hidden')) return el;
  }
  return null;
}
function navFocus(dir) {
  const root = topScreen();
  if (!root) return;
  const list = [...root.querySelectorAll('button:not([disabled]), a.ghost, input, select')].filter(el => el.offsetParent !== null);
  if (!list.length) return;
  let i = list.indexOf(document.activeElement);
  if (i < 0) i = dir > 0 ? -1 : 0;
  list[(i + dir + list.length) % list.length].focus();
}
function backAction() {
  for (const id of SUBMENUS) {
    if (!$(id).classList.contains('hidden')) { closeMenu(id); return; }
  }
  if (G.state === 'pause') resumeGame();
}
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { GP.vx = GP.vz = 0; return; }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  GP.vx = Math.abs(ax) > 0.2 ? ax : 0;
  GP.vz = Math.abs(ay) > 0.2 ? ay : 0;
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const pressed = i => b(i) && !GP.prev[i];
  const nav = { up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6 };
  const navP = k => nav[k] && !GP.prevNav[k];
  if (G.state === 'play') {
    if (pressed(0) || pressed(5) || pressed(7)) tryDash();
    if (pressed(1) || pressed(2) || pressed(4) || pressed(6)) trySpecial();
    if (pressed(9)) pauseGame();
  } else {
    if (navP('up') || navP('left')) navFocus(-1);
    if (navP('down') || navP('right')) navFocus(1);
    if (pressed(0)) {
      const el = document.activeElement, root = topScreen();
      if (el && el !== document.body && root && root.contains(el)) el.click(); else navFocus(1);
    }
    if (pressed(1)) backAction();
    if (pressed(9) && G.state === 'pause') resumeGame();
  }
  GP.prev = gp.buttons.map(x => x.pressed);
  GP.prevNav = nav;
}

function inputVector() {
  let x = 0, z = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) z -= 1;
  if (keys.KeyS || keys.ArrowDown) z += 1;
  if (joy.active) { x += joy.vx; z += joy.vz; }
  x += GP.vx; z += GP.vz;
  if (AUTO) { // 自動操作（動作確認用）
    const a = G.time * 0.25;
    x = Math.cos(a); z = Math.sin(a);
    let ax = 0, az = 0;
    for (const e of enemies) {
      if (e.prop) continue;
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

// ================================================================ 回避・必殺技
function tryDash() {
  if (G.state !== 'play' || P.dashCd > 0) return;
  let [x, z] = inputVector();
  if (x * x + z * z < 0.01) { x = Math.sin(P.facing); z = Math.cos(P.facing); }
  const l = Math.hypot(x, z) || 1;
  P.dashDx = x / l; P.dashDz = z / l;
  P.dashT = 0.17; P.dashCd = S.dashCd;
  P.inv = Math.max(P.inv, 0.34);
  sound.play('dash');
  addRing(P.x, P.z, 0.3, 2.2, 10, 0x9fe8ff, 0.3);
}

function trySpecial() {
  if (G.state !== 'play' || G.gauge < G.gaugeMax || G.special) return;
  G.gauge = 0;
  G.specials++;
  G.gaugeMax = Math.round(100 * (1 + G.specials * 0.25));
  G.special = { t: 0, n: 0, total: isMobile ? 30 : 46, dur: 2.4 };
  sound.play('special');
  flash(0.55, '#fff3c8');
  G.slowmo = 0.35; G.slowScale = 0.3;
  banner('🐟 鰹乱舞！！ 🐟', 'sp');
  shake(0.5);
}
function updateSpecial(dt) {
  const sp = G.special;
  if (sp) {
    sp.t += dt;
    const want = Math.floor(sp.total * Math.min(1, sp.t / sp.dur));
    const cand = sp.n < want ? onScreenEnemies() : null;
    while (sp.n < want) {
      sp.n++;
      let x, z;
      if (cand.length && Math.random() < 0.75) { const e = cand[(Math.random() * cand.length) | 0]; x = e.x + rand(-0.6, 0.6); z = e.z + rand(-0.6, 0.6); } else { x = P.x + rand(view.xmin, view.xmax) * 0.9; z = P.z + rand(view.zmin, view.zmax) * 0.9; }
      rainK.push({ x, z, y: rand(16, 22), vy: -18, yaw: rand(0, TAU), rx: rand(-0.25, 0.25), state: 'fall', t: 0, spin: 0 });
    }
    if (sp.n >= sp.total && !rainK.length) G.special = null;
  }
  for (let i = rainK.length - 1; i >= 0; i--) {
    const k = rainK[i];
    k.t += dt;
    if (k.state === 'fall') {
      k.vy -= 40 * dt; k.y += k.vy * dt;
      if (k.y <= 1.05) {
        k.y = 1.05;
        const dmg = 90 * (1 + G.level * 0.06);
        aoe(k.x, k.z, 2.6 * S.area, dmg, 'special', 9);
        addRing(k.x, k.z, 0.4, 3.2 * S.area, 14, 0xffe0a0, 0.35);
        splash(k.x, 0.6, k.z, 10, [0.9, 0.95, 1], 6);
        sound.play('impact');
        shake(0.18);
        k.state = 'bounce'; k.vy = rand(6, 9); k.spin = rand(10, 16) * (Math.random() < 0.5 ? -1 : 1); k.t = 0;
      }
    } else {
      k.vy -= 26 * dt; k.y += k.vy * dt; k.rx += k.spin * dt;
      if (k.t > 0.65 || k.y < 0) rainK.splice(i, 1);
    }
  }
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
function onScreen(x, z, m = 0) {
  const rx = x - P.x, rz = z - P.z;
  return rx > view.xmin - m && rx < view.xmax + m && rz > view.zmin - m && rz < view.zmax + m;
}
function onScreenEnemies() {
  return enemies.filter(e => !e.dead && !e.prop && onScreen(e.x, e.z, -0.5));
}
function spawnEnemy(type, x, z, opts = {}) {
  const T = TYPES[type];
  if (!T.prop && enemies.length >= MAXE) return null;
  const t = G.time, elite = !!opts.elite;
  const sc = T.sc * (elite ? 1.6 : 1) * (T.prop ? 1 : rand(0.92, 1.08));
  const hp = T.prop ? 1 : T.hp * hpMul(t) * DIFF.hp * (elite ? 12 : 1);
  const e = {
    id: ++eid, type, model: T.model, x, z, kx: 0, kz: 0, hp, maxHp: hp,
    spd: T.spd * eSpdMul(t) * rand(0.9, 1.1) * (elite ? 0.8 : 1),
    dmg: T.dmg * eDmgMul(t) * DIFF.dmg * (elite ? 1.2 : 1), xp: T.xp * (1 + t / 500) * (elite ? 10 : 1),
    sc, r: (type === 'can' ? 0.45 : type === 'battera' ? 0.55 : 0.5) * sc, phase: rand(0, TAU), flash: 0, slowT: 0, elite, boss: null,
    yaw: rand(0, TAU), roll: 0, lastSwing: -1, ykT: 0, dead: false, prop: !!T.prop, ranged: !!T.ranged, shootT: rand(1.5, 3),
    flock: opts.flock || null, gold: G.rushT > 0 && !T.prop, burnT: 0, burnTick: 0, burnDmg: 0,
  };
  enemies.push(e);
  return e;
}
function pickType(t) {
  const w = [
    ['masaba', Math.max(0.3, 1 - t / 500)],
    ['gomasaba', t > 60 ? Math.min(0.9, (t - 60) / 120) : 0],
    ['kinka', t > 180 ? 0.25 + Math.min(0.35, (t - 180) / 600) : 0],
    ['shime', t > 240 ? 0.15 + Math.min(0.2, (t - 240) / 600) : 0],
    ['can', t > 300 ? 0.2 + Math.min(0.3, (t - 300) / 600) : 0],
    ['battera', t > 420 ? 0.15 + Math.min(0.2, (t - 420) / 600) : 0],
    ['yaki', t > 480 ? 0.3 + Math.min(0.3, (t - 480) / 600) : 0],
  ];
  let sum = 0;
  for (const [, v] of w) sum += v;
  let r = Math.random() * sum;
  for (const [k, v] of w) { r -= v; if (r <= 0) return k; }
  return 'masaba';
}
function strongestType(t) {
  return t > 480 ? 'yaki' : t > 420 ? 'battera' : t > 300 ? 'can' : t > 180 ? 'kinka' : t > 60 ? 'gomasaba' : 'masaba';
}
const NOTICES = [
  [60, 'ゴマサバが群れで来た！（速い）'],
  [180, '金華サバ出現！（硬い）'],
  [240, 'しめ鯖が酢を吐いてくる！'],
  [300, 'サバ缶が転がってきた！'],
  [420, 'バッテラ襲来！ 斬ると分裂するぞ'],
  [480, '焼きサバが香ばしく迫る！'],
];

function spawnFlock() {
  const a = rand(0, TAU), dx = Math.sin(a), dz = Math.cos(a);
  const R = Math.max(view.xmax - view.xmin, view.zmax - view.zmin) * 0.65 + 4;
  const n = Math.min(46, Math.floor(16 + G.time / 20));
  const px = -dz, pz = dx; // 進行方向に垂直
  const off = rand(-4, 4);
  const ty = G.time > 360 ? 'gomasaba' : 'masaba';
  for (let i = 0; i < n; i++) {
    const lat = (i - n / 2) * 0.85 + off, back = rand(-1.2, 1.2) + (i % 3) * 0.6;
    const x = P.x - dx * (R + back) + px * lat, z = P.z - dz * (R + back) + pz * lat;
    const e = spawnEnemy(ty, x, z, { flock: { vx: dx * 7.5, vz: dz * 7.5, life: (2 * R + 6) / 7.5 } });
    if (e) e.yaw = a;
  }
  banner('🐟🐟🐟 サバの群れが横切る！');
}

function spawnTaru() {
  let n = 0;
  for (const e of enemies) if (e.prop) n++;
  if (n >= 5) return;
  for (let tries = 0; tries < 8; tries++) {
    const x = P.x + rand(view.xmin - 4, view.xmax + 4), z = P.z + rand(view.zmin - 4, view.zmax + 4);
    if (Math.hypot(x - P.x, z - P.z) < 6) continue;
    spawnEnemy('taru', x, z);
    return;
  }
}

function director(dt) {
  const t = G.time;
  let rate = Math.min(50, 0.6 + t * 0.012 + Math.pow(t / 200, 2) * 1.6) * DIFF.spawn;
  if (G.boss) rate *= 0.6;
  if (G.rushT > 0) rate *= 1.6;
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
  if (t >= G.nextFlock) { G.nextFlock = t + rand(55, 80); spawnFlock(); }
  if (t >= G.nextTaru) { G.nextTaru = t + 13; spawnTaru(); }
  if (t >= G.nextRush) {
    G.nextRush = t + 360; G.rushT = 15;
    banner('🎉 大漁タイム！ 金色の鯖を狩れ！');
    sound.play('chest');
  }
  if (t >= G.nextStorm) {
    G.nextStorm = t + 420; G.stormT = 25;
    banner('⛈ 時化（しけ）だ！ 鯖が荒ぶる！', 'boss');
    sound.play('thunder');
    flash(0.5, '#dfe8ff');
  }
  if (G.noticeIdx < NOTICES.length && t >= NOTICES[G.noticeIdx][0]) {
    banner(NOTICES[G.noticeIdx][1]);
    G.noticeIdx++;
  }
  // ボス出現（20分で鯖神）
  if (t >= 1200 && !G.kamiSpawned && !G.boss) {
    G.kamiSpawned = true;
    spawnBoss('kami', 0);
  } else if (t >= G.nextBoss && !(t >= 1170 && !G.kamiSpawned)) {
    if (G.boss) G.nextBoss = t + 10;
    else {
      spawnBoss(BOSS_ORDER[G.bossIdx % 3], Math.floor(G.bossIdx / 3));
      G.bossIdx++;
      G.nextBoss = G.bossIdx < 3 ? [150, 360, 600][G.bossIdx] : 600 + 240 * (G.bossIdx - 2);
    }
  }
}

function spawnBoss(key, cycle) {
  const def = BOSSES[key];
  const hp = def.hp * hpMul(G.time) * Math.pow(1.6, cycle) * DIFF.hp;
  const [x, z] = spawnPos(1);
  const suffix = ['', '・改', '・真', '・極'][Math.min(3, cycle)] + (cycle > 3 ? '+' + (cycle - 3) : '');
  const e = {
    id: ++eid, type: key, model: null, x, z, kx: 0, kz: 0, hp, maxHp: hp,
    spd: def.spd * (1 + cycle * 0.08), dmg: def.dmg * eDmgMul(G.time) * DIFF.dmg, xp: 0,
    sc: def.sc, r: def.r, phase: 0, flash: 0, slowT: 0, elite: false,
    boss: key, name: def.name + suffix, yaw: 0, roll: 0, lastSwing: -1, ykT: 0, dead: false, burnT: 0, burnTick: 0, burnDmg: 0,
    ai: { t: 0, mode: 'chase', tt: 0, shot: 0, spiral: 0, ang: 0, dx: 0, dz: 0, summon: 0, ph2: false }, cycle,
  };
  enemies.push(e);
  G.boss = e;
  BOSS_MESH[key].visible = true;
  $('bossbar').classList.remove('hidden');
  $('bossname').textContent = e.name;
  cutin(e.name, def.sub, key === 'kami');
  G.slowmo = 1.2; G.slowScale = 0.25;
  sound.play('boss');
  sound.intensity = key === 'kami' ? 2 : 1;
  shake(0.6);
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
  const dasher = e.boss === 'nushi' || e.boss === 'miso' || (e.boss === 'kami' && ai.ph2);
  if (dasher) {
    ai.tt += dt;
    const every = e.boss === 'nushi' ? 4.2 : e.boss === 'kami' ? 5 : 6.5;
    if (ai.mode === 'chase' && ai.tt > every) { ai.mode = 'tele'; ai.tt = 0; ai.dx = dx / d; ai.dz = dz / d; }
    if (ai.mode === 'tele') {
      vx = vz = 0; e.flash = 0.05 * (Math.sin(ai.t * 40) > 0 ? 1 : 0);
      ai.dx = dx / d; ai.dz = dz / d;
      if (ai.tt > 0.9) { ai.mode = 'dash'; ai.tt = 0; sound.play('dash'); shake(0.3); }
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
      ai.spiral = 0; ai.ang += 0.38;
      fireBullet(e.x, e.z, ai.ang, 6, e.dmg * 0.5, 1);
      fireBullet(e.x, e.z, ai.ang + Math.PI, 6, e.dmg * 0.5, 1);
      if (e.cycle > 0) fireBullet(e.x, e.z, ai.ang + Math.PI / 2, 6, e.dmg * 0.5, 1);
    }
  }
  if (e.boss === 'nushi' && e.cycle > 0) {
    ai.shot += dt;
    if (ai.shot > 2.5 && ai.mode === 'chase') {
      ai.shot = 0;
      for (let i = -2; i <= 2; i++) fireBullet(e.x, e.z, face + i * 0.25, 7, e.dmg * 0.5, 0);
    }
  }
  if (e.boss === 'kami') {
    if (!ai.ph2 && e.hp < e.maxHp * 0.5) {
      ai.ph2 = true; e.spd *= 1.5;
      banner('鯖神が本気を出した！！', 'boss');
      flash(0.5, '#ffd060'); shake(1);
      sound.play('boss');
    }
    ai.spiral += dt; ai.shot += dt; ai.summon += dt;
    if (ai.mode === 'chase' && ai.spiral > (ai.ph2 ? 0.11 : 0.16)) {
      ai.spiral = 0; ai.ang += 0.31;
      const arms = ai.ph2 ? 4 : 3;
      for (let k = 0; k < arms; k++) fireBullet(e.x, e.z, ai.ang + k * TAU / arms, 5.5, e.dmg * 0.4, 3);
    }
    if (ai.shot > (ai.ph2 ? 2.8 : 4.2)) {
      ai.shot = 0;
      const n = ai.ph2 ? 30 : 22, off = Math.random() * TAU;
      for (let i = 0; i < n; i++) fireBullet(e.x, e.z, off + (i / n) * TAU, 7, e.dmg * 0.45, 3);
      sound.play('shoot');
    }
    if (ai.summon > 11) {
      ai.summon = 0;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        spawnEnemy('kinka', P.x + Math.sin(a) * 10, P.z + Math.cos(a) * 10);
      }
    }
  }
  if (e.slowT > 0) { vx *= 0.75; vz *= 0.75; }
  e.x += (vx + e.kx) * dt; e.z += (vz + e.kz) * dt;
  e.kx *= Math.exp(-6 * dt); e.kz *= Math.exp(-6 * dt);
  if (d > 40) { const [x, z] = spawnPos(1); e.x = x; e.z = z; }
  return d;
}

// 衝突判定用の空間ハッシュ
const HS = 4096, CS = 1.6;
const head = new Int32Array(HS), nxt = new Int32Array(4096);
const cellH = (ix, iz) => ((Math.imul(ix, 92837111) ^ Math.imul(iz, 689287499)) >>> 0) & (HS - 1);

function hurtPlayer(dmg, src = 'mob') {
  if (P.inv > 0 || G.god) return;
  const d = Math.max(1, dmg - S.armor);
  G.dmgLog[src] = (G.dmgLog[src] || 0) + d;
  P.hp -= d;
  P.inv = 0.6; P.hurtT = 0.6;
  if (G.time < 180) G.noDmg3 = false;
  sound.play('hurt');
  floatText(P.x, 2.4, P.z, '-' + fmtNum(d), '#ff5a5a', 1.1);
  shake(0.25);
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
  const relocate = 14, frozen = G.freezeT > 0, stormMul = G.stormT > 0 ? 1.25 : 1;
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    e.flash -= dt; e.slowT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) { e.burnTick = 0.5; hitEnemy(e, e.burnDmg, 0, 0, 0, { src: 'warayaki', quiet: true }); }
      if (Math.random() < 0.12) fire.spawn(e.x + rand(-0.3, 0.3), 0.8 * e.sc, e.z + rand(-0.3, 0.3), 0, rand(1, 2), 0, 0.4, 0.4, 1, 0.5, 0.1, 0.8, -1);
      if (e.dead) continue;
    }
    if (e.prop) {
      const rx = e.x - P.x, rz = e.z - P.z;
      if (rx < view.xmin - 25 || rx > view.xmax + 25 || rz < view.zmin - 25 || rz > view.zmax + 25) killEnemy(e, 0, 0, false, true);
      continue;
    }
    if (frozen) {
      const dx = P.x - e.x, dz = P.z - e.z;
      if (!e.boss && Math.hypot(dx, dz) < e.r + 0.45) { /* 凍っている間は無害 */ }
      continue;
    }
    let d;
    if (e.boss) d = bossAI(e, dt);
    else if (e.flock) {
      const f = e.flock;
      e.x += (f.vx + e.kx) * dt; e.z += (f.vz + e.kz) * dt;
      e.kx *= Math.exp(-7 * dt); e.kz *= Math.exp(-7 * dt);
      f.life -= dt;
      if (f.life <= 0) { killEnemy(e, 0, 0, false, true); continue; }
      d = Math.hypot(P.x - e.x, P.z - e.z);
    } else {
      const dx = P.x - e.x, dz = P.z - e.z;
      d = Math.hypot(dx, dz) || 1e-4;
      let sp = e.spd * (e.slowT > 0 ? 0.5 : 1) * stormMul;
      let mx = dx / d, mz = dz / d;
      if (e.ranged) {
        // しめ鯖：距離をとって酢を吐く
        if (d < 4.5) { mx = -mx; mz = -mz; sp *= 0.6; } else if (d < 7) { const t2 = mx; mx = -mz; mz = t2; sp *= 0.5; }
        e.shootT -= dt;
        if (e.shootT <= 0 && d < 12) {
          e.shootT = rand(2.4, 3.4);
          fireBullet(e.x, e.z, Math.atan2(dx, dz), 7, e.dmg * 0.8, 2);
        }
      }
      e.x += (mx * sp + e.kx) * dt;
      e.z += (mz * sp + e.kz) * dt;
      const kd = Math.exp(-7 * dt);
      e.kx *= kd; e.kz *= kd;
      const ty = Math.atan2(dx, dz);
      e.yaw += angDiff(e.yaw, ty) * Math.min(1, dt * 8);
      if (e.model === 'can') e.roll += sp * dt / 0.42;
      const rx = e.x - P.x, rz = e.z - P.z;
      if (rx < view.xmin - relocate || rx > view.xmax + relocate || rz < view.zmin - relocate || rz > view.zmax + relocate) {
        const [x, z] = spawnPos();
        e.x = x; e.z = z; e.kx = e.kz = 0;
      }
    }
    if (d < e.r + 0.45) hurtPlayer(e.dmg, e.boss ? 'boss' : e.elite ? 'elite' : 'mob');
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
            const ha = a.boss || a.prop, hb = b.boss || b.prop;
            const wa = ha && hb ? 0 : ha ? 0.05 : hb ? 1.95 : 1, wb = ha && hb ? 0 : 2 - wa;
            a.x -= nx * push * wa * 0.6; a.z -= nz * push * wa * 0.6;
            b.x += nx * push * wb * 0.6; b.z += nz * push * wb * 0.6;
          }
        }
        j = nxt[j];
      }
    }
  }
  if (G.boss) {
    const b = G.boss;
    for (const e of enemies) {
      if (e === b || e.prop) continue;
      const dx = e.x - b.x, dz = e.z - b.z, rr = e.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); e.x += dx / d * (rr - d); e.z += dz / d * (rr - d); }
    }
  }
}

function hitEnemy(e, base, nx, nz, kb, opts = {}) {
  if (e.dead) return;
  let dmg = opts.raw ? base : base * S.dmgMul * rand(0.9, 1.1);
  const crit = !opts.raw && Math.random() < S.crit;
  if (crit) dmg *= 2;
  if (e.prop) dmg = Math.max(dmg, 1);
  e.hp -= dmg;
  e.flash = 0.1;
  if (!e.prop) {
    G.maxDmg = Math.max(G.maxDmg, dmg);
    const src = opts.src || 'other';
    G.wdmg[src] = (G.wdmg[src] || 0) + dmg;
  }
  const kbm = e.boss ? 0.04 : e.elite ? 0.3 : 1;
  e.kx += nx * kb * kbm; e.kz += nz * kb * kbm;
  const cap = enemies.length > 150 ? 14 : 28;
  if (save.settings.dmgNum && !opts.quiet && !e.prop && ((crit && texts.length < cap * 2) || e.boss || texts.length < cap)) {
    floatText(e.x + rand(-0.3, 0.3), (e.boss ? 2.5 : 1.4) + rand(0, 0.4), e.z, fmtNum(dmg), crit ? '#ffd23a' : '#ffffff', crit ? 1.35 : 1);
  }
  if (crit && e.boss && opts.src === 'tataki' && G.hitstop <= 0) G.hitstop = 0.05;
  if (e.hp <= 0) killEnemy(e, nx, nz, opts.launch, false, opts.up);
}

function aoe(x, z, r, dmg, src, kb = 6, opts = {}) {
  let hits = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
    if (d < r + e.r) { hitEnemy(e, dmg, dx / (d || 1), dz / (d || 1), kb, { src, launch: true, ...opts }); hits++; }
  }
  return hits;
}

function killEnemy(e, nx, nz, launch, silent, up) {
  if (e.dead) return;
  e.dead = true;
  if (e.prop) {
    if (!silent) {
      splash(e.x, 0.6, e.z, 12, [0.6, 0.42, 0.25], 5);
      sound.play('hit');
      dropFromTaru(e.x, e.z);
    }
    return;
  }
  if (silent) return;
  G.kills++;
  G.combo++; G.comboT = 2.5;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  if (G.combo % 100 === 0) comboMilestone(G.combo);
  if (!G.special) G.gauge = Math.min(G.gaugeMax, G.gauge + (e.elite ? 10 : e.boss ? 40 : 0.6) * S.gaugeMul);
  if (e.boss) { bossDefeated(e); return; }
  sound.play('kill');
  const comboMul = 1 + Math.min(0.5, G.combo / 600);
  dropGem(e.x, e.z, e.xp * comboMul * (G.rushT > 0 || e.gold ? 2 : 1));
  splash(e.x, 0.8 * e.sc, e.z, e.elite ? 24 : 6, e.model === 'yaki' ? [0.6, 0.4, 0.2] : e.gold ? [1, 0.85, 0.3] : [0.8, 0.9, 1]);
  if (e.elite) {
    spawnItem('chest', e.x, e.z, { count: 1 });
    for (let i = 0; i < 8; i++) dropCoin(e.x + rand(-1, 1), e.z + rand(-1, 1), 1);
    G.hitstop = Math.max(G.hitstop, 0.06);
  } else {
    if (Math.random() < (e.gold ? 0.35 : 0.015 * S.luck)) dropCoin(e.x, e.z, 1);
    const r = Math.random() / S.luck;
    if (r < 0.004) spawnItem('onigiri', e.x, e.z);
    else if (r < 0.0055 && gems.length > 60) spawnItem('float', e.x, e.z);
    else if (r < 0.0062) spawnItem('tokei', e.x, e.z);
    else if (r < 0.0069) spawnItem('hata', e.x, e.z);
  }
  if (TYPES[e.type] && TYPES[e.type].split) {
    for (let i = 0; i < 3; i++) {
      const a = e.yaw + (i - 1) * 1.2;
      const k = spawnEnemy('kosaba', e.x + Math.sin(a) * 0.5, e.z + Math.cos(a) * 0.5);
      if (k) { k.kx = Math.sin(a) * 6; k.kz = Math.cos(a) * 6; }
    }
  }
  if (corpses.length < CORPSE_MAX) {
    const pw = launch ? 9 : 3;
    corpses.push({
      model: e.model, x: e.x, y: 0.75 * e.sc, z: e.z,
      vx: up ? rand(-1, 1) : nx * pw + rand(-1, 1), vy: up ? rand(14, 18) : launch ? rand(6, 9) : rand(3, 5), vz: up ? rand(-1, 1) : nz * pw + rand(-1, 1),
      yaw: e.yaw, rx: 0, rz: 0, spin: rand(8, 16) * (Math.random() < 0.5 ? -1 : 1), life: up ? 1.0 : 0.65, sc: e.sc, gold: e.gold,
    });
  }
}

function comboMilestone(c) {
  sound.play('combo');
  const bonus = c % 1000 === 0 ? 10 : 1;
  G.coins += Math.round(bonus * S.coinMul);
  G.gauge = Math.min(G.gaugeMax, G.gauge + 8);
  floatText(P.x, 3.2, P.z, `${c}連撃！ +${bonus}🪙`, '#ffd23a', 1.4, 1.2);
  if (c % 500 === 0) banner(`🔥 ${c}連撃！ 大漁だ！`);
  const el = $('combo');
  el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 120);
}

function bossDefeated(e) {
  sound.play('bossdie');
  BOSS_MESH[e.boss].visible = false;
  $('bossbar').classList.add('hidden');
  G.boss = null;
  G.bossKilled[e.boss] = true;
  sound.intensity = 0;
  shake(1.0);
  flash(0.7, e.boss === 'kami' ? '#ffe9a0' : '#ffffff');
  G.slowmo = 1.6; G.slowScale = 0.3;
  burstFire(e.x, 2, e.z, 90, 10);
  for (let i = 0; i < 16; i++) dropGem(e.x + rand(-2, 2), e.z + rand(-2, 2), 6 * (1 + G.time / 300));
  const coinN = e.boss === 'kami' ? 60 : 12 + e.cycle * 6;
  for (let i = 0; i < coinN; i++) dropCoin(e.x + rand(-2.5, 2.5), e.z + rand(-2.5, 2.5), e.boss === 'kami' ? 4 : 2);
  spawnItem('chest', e.x, e.z, { count: 3, awaken: true, name: e.name, boss: true });
  floatText(e.x, 4, e.z, `${e.name} 討伐！`, '#ffcf3a', 1.8, 2.0);
  if (e.boss === 'kami') {
    G.kamiDone = true;
    cutin('完全制覇', '鯖神を〆た！ 延長戦突入', true);
    banner('👑 鯖神を〆た！！ ここからは延長戦だ');
  } else banner(`${e.name} を〆た！`);
  checkAch();
}

// ================================================================ 経験値・小判・アイテム
function dropGem(x, z, v) {
  if (gems.length >= GEM_MAX) {
    gems[(Math.random() * gems.length) | 0].v += v;
    return;
  }
  gems.push({ x: x + rand(-0.2, 0.2), z: z + rand(-0.2, 0.2), v, mag: false, sp: 0, t: Math.random() * TAU });
}
function dropCoin(x, z, v) {
  if (coins.length >= COIN_MAX) { coins[(Math.random() * coins.length) | 0].v += v; return; }
  coins.push({ x, z, v, mag: false, sp: 0, t: Math.random() * TAU, vy: rand(3, 6), y: 0.6 });
}
function spawnItem(kind, x, z, data = {}) {
  if (items.length >= 24) {
    // 宝箱以外の一番古いアイテムを消す
    const idx = items.findIndex(it => it.kind !== 'chest');
    if (idx < 0) { if (kind !== 'chest') return; } else { scene.remove(items[idx].mesh); items.splice(idx, 1); }
  }
  items.push({ kind, x, z, data, mesh: makeItemMesh(kind), t: 0 });
}
function dropFromTaru(x, z) {
  const tbl = [['onigiri', 32], ['koban', 28], ['float', 12], ['tokei', 9 * S.luck], ['hata', 9 * S.luck], ['teishoku', 6 * S.luck]];
  let sum = 0;
  for (const [, w] of tbl) sum += w;
  let r = Math.random() * sum;
  for (const [k, w] of tbl) { r -= w; if (r <= 0) { spawnItem(k, x, z); return; } }
  spawnItem('onigiri', x, z);
}
function addXp(v) {
  G.xp += v * S.xpMul;
  while (G.xp >= xpNeed(G.level)) {
    G.xp -= xpNeed(G.level);
    G.level++;
    G.pendingLv++;
  }
}
function heal(v, label) {
  P.hp = Math.min(P.maxHp, P.hp + v);
  sound.play('heal');
  floatText(P.x, 2.6, P.z, label, '#7dff8a', 1.2, 1.0);
}
function useItem(it) {
  switch (it.kind) {
    case 'onigiri': heal(30, '+30 おにぎり'); break;
    case 'teishoku': heal(P.maxHp, '鰹のたたき定食！ 全回復'); break;
    case 'float':
      for (const g of gems) g.mag = true;
      for (const c of coins) c.mag = true;
      sound.play('heal');
      floatText(P.x, 2.6, P.z, '大漁！全回収', '#7dd8ff', 1.2, 1.0);
      break;
    case 'koban': {
      const n = Math.round(10 * S.coinMul);
      G.coins += n; sound.play('coin');
      floatText(P.x, 2.6, P.z, `+${n}🪙 小判の山`, '#ffd23a', 1.2, 1.0);
      break;
    }
    case 'tokei':
      G.freezeT = 6;
      sound.play('freeze');
      flash(0.4, '#bfe8ff');
      banner('⏳ 時よ止まれ！ 鯖が凍りついた');
      break;
    case 'hata': {
      sound.play('bomb');
      flash(0.8, '#ffffff');
      shake(0.9);
      banner('🎏 大漁旗の号令！ 画面の鯖を一掃！');
      for (const e of enemies) {
        if (e.dead || e.prop || !onScreen(e.x, e.z, 2)) continue;
        const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
        if (e.boss) hitEnemy(e, e.maxHp * 0.08, 0, 0, 0, { src: 'bomb', raw: true });
        else { G.wdmg.bomb = (G.wdmg.bomb || 0) + e.hp; killEnemy(e, dx / d, dz / d, true); }
      }
      addRing(P.x, P.z, 0.5, 18, 28, 0xffffff, 0.6);
      break;
    }
    case 'chest': openChest(it.data); break;
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
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.y > 0.35 || c.vy > 0) { c.vy -= 20 * dt; c.y = Math.max(0.35, c.y + c.vy * dt); if (c.y <= 0.35) c.vy = 0; }
    const dx = P.x - c.x, dz = P.z - c.z, d2 = dx * dx + dz * dz;
    if (!c.mag && d2 < mg2) c.mag = true;
    if (c.mag) {
      c.sp = Math.min(30, c.sp + 40 * dt);
      const d = Math.sqrt(d2) || 1;
      const step = Math.min(d, (6 + c.sp) * dt);
      c.x += dx / d * step; c.z += dz / d * step;
    }
    if (d2 < 0.5) {
      const v = Math.max(1, Math.round(c.v * S.coinMul));
      G.coins += v;
      sound.play('coin');
      coins[i] = coins[coins.length - 1]; coins.pop();
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    it.mesh.position.set(it.x, 0.45 + Math.sin(it.t * 3) * 0.12, it.z);
    it.mesh.rotation.y = it.t * 1.5;
    // 宝箱以外は45秒で消える（最後の5秒は点滅）
    if (it.kind !== 'chest') {
      if (it.t > 45) { scene.remove(it.mesh); items.splice(i, 1); continue; }
      it.mesh.visible = it.t < 40 || Math.sin(it.t * 20) > 0;
    }
    if (Math.random() < 0.05) parts.spawn(it.x + rand(-0.4, 0.4), 0.3, it.z + rand(-0.4, 0.4), 0, rand(1, 2), 0, 0.6, 0.15, 1, 0.95, 0.6, 0.9, 0);
    if (Math.hypot(P.x - it.x, P.z - it.z) < (it.kind === 'chest' ? 1.3 : 1.0)) {
      scene.remove(it.mesh);
      items.splice(i, 1);
      useItem(it);
      if (G.state !== 'play') return;
    }
  }
}

// ================================================================ 演出用リング
function addRing(x, z, r0, r1, spd, color, alpha = 0.6, hitDmg = 0, src = '') {
  const mesh = ringPool.find(m => !m.visible);
  if (!mesh) return;
  mesh.visible = true;
  mesh.material.color.setHex(color);
  rings.push({ mesh, x, z, r: r0, max: r1, spd, alpha, dmg: hitDmg, src, hit: hitDmg ? new Set() : null });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.r += g.spd * dt;
    const k = g.r / g.max;
    if (k >= 1) { g.mesh.visible = false; rings.splice(i, 1); continue; }
    g.mesh.position.set(g.x, 0.08, g.z);
    g.mesh.scale.setScalar(g.r);
    g.mesh.material.opacity = g.alpha * (1 - k);
    if (g.dmg) {
      for (const e of enemies) {
        if (e.dead || g.hit.has(e.id)) continue;
        const dx = e.x - g.x, dz = e.z - g.z, d = Math.hypot(dx, dz);
        if (d < g.r + e.r) { g.hit.add(e.id); hitEnemy(e, g.dmg, dx / (d || 1), dz / (d || 1), 5, { src: g.src, launch: true }); }
      }
    }
  }
}

// ================================================================ 武器
const lvOf = k => G.weapons[k] || 0;
function nearestEnemy(maxD, x = P.x, z = P.z, skip = null) {
  let best = maxD * maxD, t = null;
  for (const e of enemies) {
    if (e.dead || e.prop || (skip && skip.has(e.id))) continue;
    const dx = e.x - x, dz = e.z - z, d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; t = e; }
  }
  return t;
}

function tatakiStats(lv, evo) {
  const s = {
    dmg: 22 * (lv >= 2 ? 1.3 : 1) * (lv >= 5 ? 1.3 : 1) * (lv >= 7 ? 1.3 : 1),
    cd: 0.95 * (lv >= 5 ? 0.85 : 1),
    size: 1 + 0.15 * ge(lv, 3) + 0.2 * ge(lv, 6),
    arc: 3.4, spin: lv >= 8, dur: lv >= 8 ? 0.42 : 0.26,
    dbl: lv >= 4 && lv < 8, kb: lv >= 7 ? 10 : 6.5, wave: false,
  };
  if (evo) { s.dmg *= 1.6; s.cd *= 0.7; s.size += 0.3; s.spin = true; s.dbl = false; s.dur = 0.38; s.wave = true; }
  return s;
}
function updateTataki(dt) {
  const lv = lvOf('tataki');
  if (!lv) { katsuoPivot.visible = false; return; }
  katsuoPivot.visible = true;
  const st = tatakiStats(lv, G.evolved.tataki);
  const size = st.size * S.area;
  katsuo.scale.setScalar(size);
  const tipLen = (GRIP_OFF + 0.97 * KATSUO_LEN) * size;
  const reach = tipLen + 0.25;
  // 鰹の先端（と腹の厚み）が地面に埋まらない最大の下向き角度
  const pitchMax = Math.asin(clamp((1.3 - 0.4 * size) / tipLen, -1, 1));
  if (!TK.swinging) {
    TK.cd -= dt;
    if (TK.cd <= 0) {
      const tgt = nearestEnemy(reach * 2.4);
      if (tgt || AUTO || Math.random() < 0.02) {
        const aim = tgt ? Math.atan2(tgt.x - P.x, tgt.z - P.z) : P.facing;
        TK.side = -TK.side;
        TK.a0 = st.spin ? aim - Math.PI : aim - TK.side * st.arc / 2;
        TK.a0 = TK.yaw + angDiff(TK.yaw, TK.a0);
        TK.a1 = TK.a0 + (st.spin ? TAU * TK.side : TK.side * st.arc);
        TK.t = 0; TK.dur = st.dur; TK.swinging = true; TK.second = false; TK.id++; TK.prev = TK.a0; TK.hits = 0;
        sound.play('swing');
        if (st.wave) addRing(P.x, P.z, 0.5, 7.5 * S.area, 15, 0x9fe8ff, 0.7, st.dmg * 0.7, 'tataki');
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
    TK.pitch += (Math.min(0.1, pitchMax) - TK.pitch) * Math.min(1, dt * 30);
  } else {
    const rest = P.facing - 0.75;
    TK.yaw += angDiff(TK.yaw, rest) * Math.min(1, dt * 6);
    TK.pitch += (Math.min(1.05, pitchMax) - TK.pitch) * Math.min(1, dt * 6);
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
        shake(0.12);
      }
      TK.hits++;
      hitEnemy(e, st.dmg, nx, nz, st.kb, { launch: true, src: 'tataki' });
    }
  }
}

function warayakiStats(lv, evo) {
  const s = {
    dmg: 6 * (lv >= 2 ? 1.3 : 1) * (lv >= 4 ? 1.3 : 1) * (lv >= 6 ? 1.35 : 1) * (lv >= 8 ? 1.5 : 1),
    r: 2.3 * (1 + 0.15 * ge(lv, 3) + 0.15 * ge(lv, 5) + 0.2 * ge(lv, 7)),
    tick: lv >= 5 ? 0.4 : 0.5, burn: false,
  };
  if (evo) { s.dmg *= 2; s.r *= 1.35; s.burn = true; }
  return s;
}
function updateWarayaki(dt) {
  const lv = lvOf('warayaki');
  if (!lv) { fireGlow.visible = false; return; }
  if (!G.seared) {
    G.seared = true;
    if (!katsuoMats.searedMap) katsuoMats.searedMap = F.makeKatsuoTexture(true);
    katsuoMats.body.map = katsuoMats.searedMap;
    katsuoMats.body.needsUpdate = true;
    floatText(P.x, 3, P.z, '鰹が藁焼きで香ばしくなった！', '#ffb347', 1.1, 1.6);
  }
  const st = warayakiStats(lv, G.evolved.warayaki), r = st.r * S.area;
  fireGlow.visible = true;
  fireGlow.position.set(P.x, 0.06, P.z);
  fireGlow.scale.set(r, 1, r);
  const nf = r * 12 * dt * (save.settings.quality === 'low' ? 0.5 : 1) * (st.burn ? 1.5 : 1);
  for (let i = 0; i < nf + Math.random(); i++) {
    const a = Math.random() * TAU, rr = r * Math.sqrt(rand(0.6, 1));
    fire.spawn(P.x + Math.sin(a) * rr, 0.15, P.z + Math.cos(a) * rr, 0, rand(1.5, st.burn ? 4.5 : 3.2), 0, rand(0.35, 0.6), rand(0.35, 0.6) * (st.burn ? 1.4 : 1), 1, rand(0.3, 0.55), 0.08, 0.5, -1);
  }
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
      if (d < r + e.r) {
        if (st.burn && !e.prop) { e.burnT = 2.5; e.burnDmg = st.dmg * 0.5; }
        hitEnemy(e, st.dmg, dx / (d || 1), dz / (d || 1), 0.6, { src: 'warayaki' });
      }
    }
  }
}

function nageStats(lv, evo) {
  const s = {
    n: 1 + ge(lv, 2) + ge(lv, 5) + ge(lv, 7) + S.amount,
    dmg: 26 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.5 : 1),
    v0: lv >= 4 ? 23 : 18, cd: 2.5, homing: false,
  };
  if (evo) { s.n += 2; s.homing = true; s.dmg *= 1.3; s.cd = 2.0; }
  s.n = Math.min(s.n, throwPool.length);
  return s;
}
function updateNage(dt) {
  const lv = lvOf('nage');
  if (lv) {
    const st = nageStats(lv, G.evolved.nage);
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
        throws.push({ mesh, x: P.x, z: P.z, dx: Math.sin(a), dz: Math.cos(a), v0: st.v0, t: 0, T: st.homing ? 1.5 : 0.8, back: false, sp: 0, hit: new Set(), dmg: st.dmg, spin: Math.random() * TAU, homing: st.homing, tgt: null });
      }
      sound.play('throw');
    }
  }
  for (let i = throws.length - 1; i >= 0; i--) {
    const p = throws[i];
    p.t += dt;
    p.spin += dt * 16;
    if (!p.back) {
      let v;
      if (p.homing) {
        if (!p.tgt || p.tgt.dead) p.tgt = nearestEnemy(12, p.x, p.z, p.hit);
        if (p.tgt) {
          const tx = p.tgt.x - p.x, tz = p.tgt.z - p.z, tl = Math.hypot(tx, tz) || 1;
          const k = Math.min(1, dt * 8);
          p.dx += (tx / tl - p.dx) * k; p.dz += (tz / tl - p.dz) * k;
          const l = Math.hypot(p.dx, p.dz) || 1; p.dx /= l; p.dz /= l;
        }
        v = 17;
      } else v = p.v0 * Math.max(0, 1 - p.t / p.T);
      p.x += p.dx * v * dt; p.z += p.dz * v * dt;
      if (p.t >= p.T) { p.back = true; p.hit.clear(); }
    } else {
      const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.sp = Math.min(26, p.sp + 45 * dt);
      p.x += dx / d * p.sp * dt; p.z += dz / d * p.sp * dt;
      if (d < 0.9 || p.t > 6) { p.mesh.visible = false; throws.splice(i, 1); continue; }
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
        hitEnemy(e, p.dmg, dx / d, dz / d, 4, { launch: true, src: 'nage' });
        if (p.homing) {
          aoe(e.x, e.z, 2.0 * S.area, p.dmg * 0.6, 'nage', 5);
          burstFire(e.x, 1, e.z, 14, 5);
          addRing(e.x, e.z, 0.3, 2.4 * S.area, 12, 0xff9a3a, 0.6);
          sound.play('impact');
          p.tgt = null;
        } else if (Math.random() < 0.3) sound.play('slap');
      }
    }
  }
}

function bushiStats(lv, evo) {
  const s = {
    n: 2 + lv + S.amount * 2,
    dmg: 9 * (lv >= 3 ? 1.25 : 1) * (lv >= 5 ? 1.25 : 1) * (lv >= 7 ? 1.3 : 1),
    pierce: 1 + ge(lv, 4) + ge(lv, 6) + ge(lv, 8),
    cd: lv >= 6 ? 0.8 : 1.0, storm: false,
  };
  if (evo) { s.storm = true; s.pierce += 3; s.dmg *= 1.3; }
  return s;
}
function pushFlake(a, st, sp) {
  if (flakes.length >= FLAKE_MAX) return;
  flakes.push({ x: P.x, y: 1.2, z: P.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, life: 1.1, pierce: st.pierce, hit: new Set(), dmg: st.dmg, rx: Math.random() * TAU, ry: a, rs: rand(8, 15) });
}
function updateBushi(dt) {
  const lv = lvOf('bushi');
  if (lv) {
    const st = bushiStats(lv, G.evolved.bushi);
    BS.cd -= dt;
    if (BS.cd <= 0) {
      BS.cd = st.cd * S.cdMul;
      const near = [];
      for (const e of enemies) {
        if (e.dead || e.prop) continue;
        const dx = e.x - P.x, dz = e.z - P.z, d2 = dx * dx + dz * dz;
        if (d2 < 200) near.push([d2, e]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < st.n; i++) {
        let a;
        if (near.length) { const e = near[i % Math.min(near.length, Math.ceil(st.n / 1.5))][1]; a = Math.atan2(e.x - P.x, e.z - P.z) + rand(-0.15, 0.15); } else a = Math.random() * TAU;
        pushFlake(a, st, rand(13, 17));
      }
      sound.play('flake');
    }
    if (st.storm) {
      BS.spinT += dt;
      while (BS.spinT > 0.07) {
        BS.spinT -= 0.07;
        BS.ang += 0.45;
        pushFlake(BS.ang, st, 14);
        pushFlake(BS.ang + Math.PI, st, 14);
      }
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
          hitEnemy(e, f.dmg, f.vx / d, f.vz / d, 1.5, { src: 'bushi' });
          if (--f.pierce < 0) { dead = true; break; }
        }
      }
    }
    if (dead) { flakes[i] = flakes[flakes.length - 1]; flakes.pop(); }
  }
}

function ponzuStats(lv, evo) {
  const s = {
    n: 1 + ge(lv, 3) + ge(lv, 5) + ge(lv, 7),
    r: 1.9 * (1 + 0.12 * ge(lv, 2) + 0.12 * ge(lv, 6)),
    dps: 13 * (lv >= 4 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.5 : 1),
    dur: lv >= 8 ? 5.5 : 4, cd: 4.5, sea: false,
  };
  if (evo) { s.r *= 1.5; s.dur *= 1.5; s.dps *= 1.4; s.sea = true; }
  return s;
}
function updatePonzu(dt) {
  const lv = lvOf('ponzu');
  if (lv) {
    const st = ponzuStats(lv, G.evolved.ponzu);
    PZ.cd -= dt;
    if (PZ.cd <= 0) {
      PZ.cd = st.cd * S.cdMul;
      const cand = enemies.filter(e => !e.dead && !e.prop && Math.abs(e.x - P.x) < 11 && Math.abs(e.z - P.z) < 9);
      for (let i = 0; i < st.n; i++) {
        const mesh = puddlePool.find(m => !m.visible);
        if (!mesh) break;
        let x, z;
        if (st.sea && i === 0) { x = P.x; z = P.z; } else if (cand.length) { const e = cand[(Math.random() * cand.length) | 0]; x = e.x; z = e.z; } else { x = P.x + rand(-5, 5); z = P.z + rand(-5, 5); }
        mesh.visible = true;
        mesh.material = st.sea ? seaMat : puddleMat;
        puddles.push({ mesh, x, z, r: st.r * S.area, life: st.dur, max: st.dur, tick: 0, dps: st.dps, sea: st.sea });
        splash(x, 0.5, z, 10, st.sea ? [0.4, 0.7, 1] : [0.85, 0.5, 0.1], 4);
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
    if (p.sea && Math.hypot(P.x - p.x, P.z - p.z) < p.r) P.hp = Math.min(P.maxHp, P.hp + 3 * dt);
    p.tick -= dt;
    if (p.tick <= 0) {
      p.tick = 0.4;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        if (dx * dx + dz * dz < (p.r + e.r * 0.5) ** 2) { e.slowT = 0.5; hitEnemy(e, p.dps * 0.4, 0, 0, 0, { src: 'ponzu' }); }
      }
      if (Math.random() < 0.5) parts.spawn(p.x + rand(-p.r, p.r) * 0.6, 0.1, p.z + rand(-p.r, p.r) * 0.6, 0, rand(1, 2), 0, 0.4, 0.2, 0.95, 0.7, 0.3, 0.8, 4);
    }
  }
}

function yakumiStats(lv, evo) {
  const s = {
    n: Math.min(7, 2 + ge(lv, 3) + ge(lv, 5) + ge(lv, 7) + ge(lv, 8) + S.amount),
    dmg: 11 * (lv >= 2 ? 1.3 : 1) * (lv >= 4 ? 1.3 : 1) * (lv >= 6 ? 1.35 : 1),
    r: 2.5 + 0.3 * ge(lv, 4) + 0.3 * ge(lv, 6),
    spd: lv >= 8 ? 4.0 : 2.8, double: false,
  };
  if (evo) { s.dmg *= 1.5; s.double = true; }
  return s;
}
function updateYakumi(dt) {
  const lv = lvOf('yakumi');
  if (!lv) { for (const m of yakumiMeshes) m.visible = false; return; }
  const st = yakumiStats(lv, G.evolved.yakumi), R = st.r * S.area;
  YK.ang += st.spd * dt;
  const hr = 0.45 * S.area;
  for (let i = 0; i < yakumiMeshes.length; i++) {
    const m = yakumiMeshes[i];
    const ring = i < 7 ? 0 : 1, idx = i % 7;
    if (idx >= st.n || (ring === 1 && !st.double)) { m.visible = false; continue; }
    const a = (ring ? -YK.ang * 0.8 : YK.ang) + (idx / st.n) * TAU;
    const rr = ring ? R * 1.65 : R;
    const x = P.x + Math.sin(a) * rr, z = P.z + Math.cos(a) * rr;
    m.visible = true;
    m.position.set(x, 1.0 + Math.sin(G.time * 4 + i) * 0.1, z);
    m.rotation.set(G.time * 5 + i, G.time * 3, 0.4);
    m.scale.setScalar(S.area * (ring ? 1.25 : 1));
    for (const e of enemies) {
      if (e.dead || e.ykT > G.time) continue;
      const dx = e.x - x, dz = e.z - z, r2 = hr * (ring ? 1.25 : 1) + e.r;
      if (dx * dx + dz * dz < r2 * r2) {
        e.ykT = G.time + 0.45;
        const ox = e.x - P.x, oz = e.z - P.z, od = Math.hypot(ox, oz) || 1;
        hitEnemy(e, st.dmg, ox / od, oz / od, 3, { src: 'yakumi' });
        sound.play('hit');
      }
    }
  }
}

function debaStats(lv, evo) {
  const s = {
    n: 1 + ge(lv, 2) + ge(lv, 5) + ge(lv, 7) + S.amount,
    dmg: 14 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.3 : 1),
    pierce: 1 + ge(lv, 4) + 2 * ge(lv, 8),
    cd: lv >= 6 ? 0.55 : 0.75, dirs: 0,
  };
  if (evo) { s.dmg *= 1.5; s.pierce = 999; s.dirs = 8; s.cd = 0.5; }
  return s;
}
function updateDeba(dt) {
  const lv = lvOf('deba');
  if (lv) {
    const st = debaStats(lv, G.evolved.deba);
    DB.cd -= dt;
    if (DB.cd <= 0) {
      DB.cd = st.cd * S.cdMul;
      const base = P.facing;
      const angles = [];
      if (st.dirs) for (let d = 0; d < st.dirs; d++) for (let i = 0; i < Math.max(1, Math.ceil(st.n / 2)); i++) angles.push(base + d * TAU / st.dirs + (i - (Math.ceil(st.n / 2) - 1) / 2) * 0.1);
      else for (let i = 0; i < st.n; i++) angles.push(base + (i - (st.n - 1) / 2) * 0.13);
      for (const a of angles) {
        if (knives.length >= KNIFE_MAX) break;
        knives.push({ x: P.x + Math.sin(a) * 0.5, z: P.z + Math.cos(a) * 0.5, vx: Math.sin(a) * 22, vz: Math.cos(a) * 22, ang: a, rx: 0, life: 0.85, pierce: st.pierce, hit: new Set(), dmg: st.dmg });
      }
      sound.play('knife');
    }
  }
  const hr = 0.35 * S.area;
  for (let i = knives.length - 1; i >= 0; i--) {
    const k = knives[i];
    k.life -= dt; k.x += k.vx * dt; k.z += k.vz * dt; k.rx += 28 * dt;
    let dead = k.life <= 0;
    if (!dead) {
      for (const e of enemies) {
        if (e.dead || k.hit.has(e.id)) continue;
        const dx = e.x - k.x, dz = e.z - k.z, rr = hr + e.r;
        if (dx * dx + dz * dz < rr * rr) {
          k.hit.add(e.id);
          hitEnemy(e, k.dmg, k.vx / 22, k.vz / 22, 2.5, { src: 'deba' });
          if (--k.pierce < 0) { dead = true; break; }
        }
      }
    }
    if (dead) { knives[i] = knives[knives.length - 1]; knives.pop(); }
  }
}

function kamomeStats(lv, evo) {
  const s = {
    n: 1 + ge(lv, 2) + ge(lv, 5) + ge(lv, 7) + S.amount,
    dmg: 30 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.5 : 1),
    cd: lv >= 4 ? 1.6 : 2.2, r: lv >= 6 ? 1.6 : 1.2, bomb: false,
  };
  if (evo) { s.n += 4; s.cd *= 0.6; s.r = 2.4; s.dmg *= 1.3; s.bomb = true; }
  s.n = Math.min(s.n, gullPool.length);
  return s;
}
function updateKamome(dt) {
  const lv = lvOf('kamome');
  if (!lv) return;
  const st = kamomeStats(lv, G.evolved.kamome);
  while (KM.gulls.length < st.n) {
    const mesh = gullPool[KM.gulls.length];
    mesh.visible = true;
    KM.gulls.push({ mesh, state: 'orbit', cd: rand(0.5, 1.5), x: P.x, y: 4, z: P.z, tx: 0, tz: 0, flap: rand(0, TAU) });
  }
  KM.ang = (KM.ang || 0) + dt * 1.2;
  KM.gulls.forEach((g, i) => {
    const oa = KM.ang + (i / KM.gulls.length) * TAU;
    const ox = P.x + Math.sin(oa) * 3.2, oz = P.z + Math.cos(oa) * 3.2, oy = 3.8 + Math.sin(G.time * 2 + i) * 0.3;
    let vx = 0, vy = 0, vz = 0;
    if (g.state === 'orbit') {
      const k = Math.min(1, dt * 5);
      vx = (ox - g.x) * k / dt; vy = (oy - g.y) * k / dt; vz = (oz - g.z) * k / dt;
      g.cd -= dt;
      if (g.cd <= 0) {
        const cand = onScreenEnemies();
        if (cand.length) {
          cand.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
          const e = cand[(Math.random() * Math.min(10, cand.length)) | 0];
          g.tx = e.x; g.tz = e.z; g.state = 'dive';
          sound.play('gull');
        } else g.cd = 0.5;
      }
    } else if (g.state === 'dive') {
      const dx = g.tx - g.x, dy = 0.8 - g.y, dz = g.tz - g.z, d = Math.hypot(dx, dy, dz) || 1;
      vx = dx / d * 20; vy = dy / d * 20; vz = dz / d * 20;
      if (d < 0.7) {
        aoe(g.tx, g.tz, st.r * S.area, st.dmg, 'kamome', 4);
        splash(g.tx, 0.5, g.tz, 8, [0.9, 0.95, 1], 4);
        if (st.bomb) { burstFire(g.tx, 0.8, g.tz, 12, 5); addRing(g.tx, g.tz, 0.3, st.r * S.area * 1.2, 10, 0xffb060, 0.6); sound.play('impact'); }
        g.state = 'rise'; g.cd = st.cd * S.cdMul * rand(0.8, 1.2);
      }
    } else {
      const dx = ox - g.x, dy = oy - g.y, dz = oz - g.z, d = Math.hypot(dx, dy, dz) || 1;
      vx = dx / d * 14; vy = dy / d * 14; vz = dz / d * 14;
      if (d < 0.8) g.state = 'orbit';
    }
    g.x += vx * dt; g.y += vy * dt; g.z += vz * dt;
    g.flap += dt * (g.state === 'dive' ? 4 : 14);
    const m = g.mesh;
    m.position.set(g.x, g.y, g.z);
    if (vx * vx + vz * vz > 0.01) m.rotation.y = Math.atan2(vx, vz);
    m.rotation.x = g.state === 'dive' ? 0.6 : 0;
    const w = g.state === 'dive' ? 0.9 : Math.sin(g.flap) * 0.6;
    m.userData.wings[0].rotation.z = w;
    m.userData.wings[1].rotation.z = -w;
  });
}

function ipponStats(lv, evo) {
  const s = {
    n: 1 + ge(lv, 2) + ge(lv, 5) + ge(lv, 7) + S.amount,
    dmg: 45 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.5 : 1),
    cd: lv >= 4 ? 2.4 : 3.0, r: lv >= 8 ? 1.6 : 1.1, chain: 0,
  };
  if (evo) { s.n *= 2; s.chain = 2; s.dmg *= 1.3; }
  return s;
}
function updateIppon(dt) {
  const lv = lvOf('ippon');
  if (lv) {
    const st = ipponStats(lv, G.evolved.ippon);
    IP.cd -= dt;
    if (IP.cd <= 0) {
      IP.cd = st.cd * S.cdMul;
      const cand = onScreenEnemies().sort(() => Math.random() - 0.5);
      for (let i = 0; i < st.n && cand.length; i++) {
        const obj = hookPool.find(h => !h.busy);
        if (!obj) break;
        const e = cand[i % cand.length];
        obj.busy = true; obj.line.visible = true; obj.hook.visible = true;
        hooks.push({ obj, tgt: e, x: e.x, z: e.z, y: 18, phase: 'down', dmg: st.dmg, r: st.r, chain: st.chain });
      }
    }
  }
  for (let i = hooks.length - 1; i >= 0; i--) {
    const h = hooks[i];
    if (h.phase === 'down') {
      if (h.tgt && !h.tgt.dead) { h.x = h.tgt.x; h.z = h.tgt.z; }
      h.y -= 60 * dt;
      if (h.y <= 1.0) {
        h.y = 1.0; h.phase = 'up';
        const before = G.kills;
        aoe(h.x, h.z, h.r * S.area, h.dmg, 'ippon', 0, { up: true });
        if (h.chain) {
          const hitSet = new Set();
          let cx = h.x, cz = h.z;
          for (let c = 0; c < h.chain; c++) {
            const n = nearestEnemy(4.5, cx, cz, hitSet);
            if (!n) break;
            hitSet.add(n.id);
            for (let s = 0; s < 6; s++) fire.spawn(cx + (n.x - cx) * s / 6, 1, cz + (n.z - cz) * s / 6, 0, 0.5, 0, 0.3, 0.35, 0.6, 0.9, 1, 0.9, 0);
            hitEnemy(n, h.dmg * 0.5, 0, 0, 0, { src: 'ippon', up: true });
            cx = n.x; cz = n.z;
          }
        }
        if (G.kills > before && Math.random() < 0.5) floatText(h.x, 3, h.z, ['釣れた！', '大物だ！', 'フィッシュ！'][(Math.random() * 3) | 0], '#9fe8ff', 1.2, 0.8);
        splash(h.x, 0.8, h.z, 8, [0.85, 0.95, 1], 4);
        sound.play('hook');
      }
    } else {
      h.y += 40 * dt;
      if (h.y > 18) { h.obj.busy = false; h.obj.line.visible = false; h.obj.hook.visible = false; hooks.splice(i, 1); continue; }
    }
    const pos = h.obj.line.geometry.attributes.position;
    pos.setXYZ(0, h.x + 0.16, 22, h.z); pos.setXYZ(1, h.x + 0.16, h.y + 0.5, h.z);
    pos.needsUpdate = true;
    h.obj.hook.position.set(h.x, h.y, h.z);
    h.obj.hook.rotation.y = G.time * 2;
  }
}

function updateBullets(dt) {
  if (G.freezeT > 0) return;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt;
    const dx = b.x - P.x, dz = b.z - P.z;
    let dead = b.life <= 0;
    if (!dead && dx * dx + dz * dz < 0.5) { hurtPlayer(b.dmg, 'bullet'); dead = true; }
    if (dead) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }
}

// 時化の落雷：鯖を焼くが、近くに落ちると自分も危ない
function updateStorm(dt) {
  if (G.stormT <= 0) return;
  const n = save.settings.quality === 'low' ? 3 : 7;
  for (let i = 0; i < n; i++) {
    parts.spawn(P.x + rand(view.xmin, view.xmax), rand(8, 14), P.z + rand(view.zmin, view.zmax), -2, -32, 0, 0.45, 0.07, 0.75, 0.85, 1, 0.55, 0);
  }
  G.lightT -= dt;
  if (G.lightT <= 0) {
    G.lightT = rand(0.7, 1.8);
    let x, z;
    const nearPlayer = Math.random() < 0.3;
    if (nearPlayer) { const a = rand(0, TAU), r = rand(0, 4); x = P.x + Math.sin(a) * r; z = P.z + Math.cos(a) * r; } else {
      const cand = onScreenEnemies();
      if (!cand.length) return;
      const e = cand[(Math.random() * cand.length) | 0]; x = e.x; z = e.z;
    }
    strikes.push({ x, z, t: nearPlayer ? 1.0 : 0.25, max: nearPlayer ? 1.0 : 0.25 });
  }
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    s.t -= dt;
    if (s.t <= 0) {
      strikes.splice(i, 1);
      aoe(s.x, s.z, 2.4, 22 * hpMul(G.time) * DIFF.hp, 'storm', 6, { raw: true });
      if (Math.hypot(P.x - s.x, P.z - s.z) < 1.6) hurtPlayer(25 * eDmgMul(G.time) * DIFF.dmg, 'storm');
      for (let k = 0; k < 18; k++) fire.spawn(s.x + rand(-0.15, 0.15), k * 0.8, s.z + rand(-0.15, 0.15), 0, 0, 0, 0.25, 0.7, 0.7, 0.85, 1, 1, 0);
      addRing(s.x, s.z, 0.3, 3, 14, 0xbfe0ff, 0.8);
      flash(0.25, '#e8f0ff');
      sound.play('thunder');
      shake(0.3);
    }
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

// レベルアップ時の衝撃波（周囲の鯖を吹き飛ばす）
function levelBurst() {
  addRing(P.x, P.z, 0.5, 6, 18, 0x7de0ff, 0.8);
  for (let i = 0; i < 24; i++) parts.spawn(P.x + rand(-0.4, 0.4), 0.2, P.z + rand(-0.4, 0.4), 0, rand(6, 12), 0, 0.6, 0.3, 0.6, 0.9, 1, 1, 6);
  for (const e of enemies) {
    if (e.dead || e.prop) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d < 5.5) hitEnemy(e, 5, dx / (d || 1), dz / (d || 1), 14, { src: 'burst', quiet: true });
  }
}

// ================================================================ ヒント（最初の数回）
const TIPS = [
  [4, '💨 <b>Space</b>（スマホは右下）で回避ステップ！ 一瞬無敵'],
  [22, '🐟 ゲージが満タンで <b>E</b> キー → 鰹乱舞！'],
  [50, '🛢️ 樽を壊すとアイテムが出る'],
  [140, '🧬 武器Lv8＋対応パッシブで、ボスの宝箱から<b>進化</b>！'],
];
function updateTips() {
  if (save.tips > 3 || G.tipIdx >= TIPS.length) return;
  if (G.time >= TIPS[G.tipIdx][0]) { toast(TIPS[G.tipIdx][1], 'tip'); G.tipIdx++; }
}

// ================================================================ メイン更新
function simulate(dt) {
  const t0 = performance.now();
  simulateInner(dt);
  const ms = performance.now() - t0;
  G.simMs = G.simMs * 0.98 + ms * 0.02;
  G.simMax = Math.max(G.simMax, ms);
}
function simulateInner(dt) {
  G.time += dt;
  // プレイヤー移動
  const [ix, iz] = inputVector();
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.x += P.dashDx * 24 * dt; P.z += P.dashDz * 24 * dt;
    P.facing = Math.atan2(P.dashDx, P.dashDz);
    for (let i = 0; i < 3; i++) parts.spawn(P.x + rand(-0.3, 0.3), rand(0.3, 1.8), P.z + rand(-0.3, 0.3), 0, 0, 0, 0.3, 0.35, 0.75, 0.92, 1, 0.6, 0);
    P.moving = true; P.walk += dt * 20;
  } else {
    const moving = ix * ix + iz * iz > 0.01;
    P.x += ix * S.speed * dt; P.z += iz * S.speed * dt;
    if (moving) {
      const tf = Math.atan2(ix, iz);
      P.facing += angDiff(P.facing, tf) * Math.min(1, dt * 12);
      P.walk += dt * 11 * Math.hypot(ix, iz);
    }
    P.moving = moving;
  }
  P.inv -= dt; P.hurtT -= dt; P.dashCd -= dt;
  if (S.regen > 0) P.hp = Math.min(P.maxHp, P.hp + S.regen * dt);
  G.comboT -= dt;
  if (G.comboT <= 0) G.combo = 0;
  if (G.freezeT > 0) G.freezeT -= dt;
  if (G.rushT > 0) G.rushT -= dt;
  if (G.stormT > 0) G.stormT -= dt;
  if (AUTO) {
    if (G.gauge >= G.gaugeMax) trySpecial();
    if (P.dashCd <= 0 && enemies.some(e => !e.prop && Math.hypot(e.x - P.x, e.z - P.z) < e.r + 1)) tryDash();
  }

  director(dt);
  updateEnemies(dt);
  if (G.state !== 'play') return;
  updateTataki(dt);
  updateWarayaki(dt);
  updateNage(dt);
  updateBushi(dt);
  updatePonzu(dt);
  updateYakumi(dt);
  updateDeba(dt);
  updateKamome(dt);
  updateIppon(dt);
  updateSpecial(dt);
  updateRings(dt);
  updateStorm(dt);
  updateBullets(dt);
  if (G.state !== 'play') return;
  let w = 0;
  for (let i = 0; i < enemies.length; i++) if (!enemies[i].dead) enemies[w++] = enemies[i];
  enemies.length = w;
  updateCorpses(dt);
  updatePickups(dt);
  if (G.state !== 'play') return;
  updateDecor();
  updateTips();
  G.achT += dt;
  if (G.achT >= 1) { G.achT = 0; checkAch(); }
  if (G.pendingLv > 0 && G.state === 'play') openLevelUp();
}

// ================================================================ 描画同期
function syncScene(dt, t) {
  player.position.set(P.x, 0, P.z);
  player.rotation.y = P.facing;
  player.visible = G.state === 'over' || !(P.hurtT > 0 && Math.sin(t * 50) > 0.3);
  katsuoPivot.position.set(P.x, 1.3, P.z);
  katsuoPivot.rotation.set(TK.pitch, TK.yaw, 0);
  katsuo.rotation.z = TK.swinging ? Math.sin(t * 40) * 0.12 : Math.sin(t * 3) * 0.05;
  animatePlayer(player, P.walk, P.moving, angDiff(P.facing, TK.yaw), TK.pitch, t);

  const frozen = G.freezeT > 0;
  const cnt = {};
  for (const k in MODELS) cnt[k] = 0;
  let nb = 0;
  for (const e of enemies) {
    if (e.boss) {
      const m = BOSS_MESH[e.boss];
      const hop = e.boss === 'kan' ? Math.abs(Math.sin(t * 4)) * 0.8 : Math.sin(t * 3) * 0.2;
      m.position.set(e.x, (e.boss === 'kan' ? 0.25 : e.boss === 'kami' ? 0.5 : 0.68) * e.sc + hop, e.z);
      m.rotation.set(0, e.yaw + (e.boss === 'kan' ? 0 : Math.sin(t * 6) * 0.15), e.boss === 'kan' ? Math.sin(t * 4) * 0.1 : 0);
      m.scale.setScalar(e.sc);
      const fl = e.flash > 0 ? 1 : 0;
      const glow = e.boss === 'kami' ? 0.25 + Math.sin(t * 3) * 0.1 : 0;
      for (const mat of m.userData.mats) {
        if (frozen) mat.emissive.setRGB(0.1, 0.25, 0.5);
        else mat.emissive.setRGB(fl * 0.8 + glow, fl * 0.3 + glow * 0.7, fl * 0.3);
      }
      if (m.userData.orbs) {
        m.userData.orbs.forEach((o, i) => {
          const a = t * 1.5 + i * TAU / 6;
          o.position.set(Math.sin(a) * 0.32, 0.1 + Math.sin(t * 3 + i) * 0.05, Math.cos(a) * 0.32);
        });
        m.userData.halo.rotation.z = t;
        if (Math.random() < 0.3) fire.spawn(e.x + rand(-2, 2), rand(1, 4), e.z + rand(-2, 2), 0, rand(0.5, 1.5), 0, 0.8, 0.4, 1, 0.85, 0.4, 0.8, -0.5);
      }
      _p.set(e.x, 0.03, e.z); _q.identity(); _s.set(e.sc * 1.3, 1, e.sc * 1.3);
      blobs.setMatrixAt(nb++, _m4.compose(_p, _q, _s));
      continue;
    }
    const mesh = MODELS[e.model], i = cnt[e.model]++;
    const ph = t * 6 + e.phase;
    if (e.model === 'can') {
      _p.set(e.x, 0.42 * e.sc, e.z);
      _e.set(e.roll, e.yaw, 0);
    } else if (e.model === 'battera') {
      _p.set(e.x, 0.16 * e.sc + Math.abs(Math.sin(t * 7 + e.phase)) * 0.3 * e.sc, e.z);
      _e.set(0, e.yaw, Math.sin(t * 7 + e.phase) * 0.1);
    } else if (e.model === 'taru') {
      _p.set(e.x, 0, e.z);
      _e.set(0, e.phase, e.flash > 0 ? 0.15 : 0);
    } else {
      _p.set(e.x, 0.75 * e.sc + (frozen ? 0 : Math.sin(ph) * 0.12), e.z);
      _e.set(0, e.yaw + (frozen ? 0 : Math.sin(t * 13 + e.phase) * 0.3), frozen ? 0 : Math.sin(ph) * 0.12);
    }
    _q.setFromEuler(_e);
    _s.setScalar(e.sc);
    mesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (e.flash > 0) _c.setRGB(3, 3, 3);
    else if (frozen && !e.prop) _c.setRGB(0.55, 0.85, 1.6);
    else if (e.elite) { const k = 0.75 + Math.sin(t * 8) * 0.25; _c.setRGB(1.6, k * 0.6, k * 0.6); }
    else if (e.gold) _c.setRGB(1.8, 1.4, 0.4);
    else if (e.burnT > 0) _c.setRGB(1.5, 0.75, 0.45);
    else if (e.slowT > 0) _c.setRGB(1.1, 0.85, 0.5);
    else _c.setRGB(1, 1, 1);
    mesh.setColorAt(i, _c);
    _p.set(e.x, 0.03, e.z); _q.identity(); _s.set(e.sc * 1.1, 1, e.sc * 1.1);
    blobs.setMatrixAt(nb++, _m4.compose(_p, _q, _s));
  }
  for (const c of corpses) {
    const mesh = MODELS[c.model];
    if (cnt[c.model] >= mesh.instanceMatrix.count) continue;
    const i = cnt[c.model]++;
    _p.set(c.x, c.y, c.z);
    _e.set(c.rx, c.yaw, c.rz);
    _q.setFromEuler(_e);
    _s.setScalar(c.sc * Math.min(1, c.life / 0.25));
    mesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (c.gold) _c.setRGB(1.8, 1.4, 0.4); else _c.setRGB(1.3, 1.3, 1.3);
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

  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    _p.set(c.x, c.y + Math.sin(t * 3 + c.t) * 0.05, c.z);
    _e.set(0, t * 4 + c.t, 0); _q.setFromEuler(_e); _s.setScalar(c.v > 3 ? 1.4 : 1);
    coinMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
  }
  coinMesh.count = coins.length;
  coinMesh.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i];
    _p.set(f.x, f.y, f.z); _e.set(f.rx, f.ry, f.rx * 0.6); _q.setFromEuler(_e); _s.setScalar(S.area || 1);
    flakeMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
  }
  flakeMesh.count = flakes.length;
  flakeMesh.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < knives.length; i++) {
    const k = knives[i];
    _p.set(k.x, 1.1, k.z); _e.set(0, k.ang, Math.sin(k.rx) * 0.3); _q.setFromEuler(_e); _s.setScalar(Math.sqrt(S.area || 1) * 1.1);
    knifeMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
  }
  knifeMesh.count = knives.length;
  knifeMesh.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < rainK.length; i++) {
    const k = rainK[i];
    _p.set(k.x, k.y, k.z); _e.set(Math.PI / 2 + k.rx, k.yaw, 0); _q.setFromEuler(_e); _s.setScalar(1);
    _m4.compose(_p, _q, _s);
    for (const m of rainMeshes) m.setMatrixAt(i, _m4);
  }
  for (const m of rainMeshes) { m.count = rainK.length; m.instanceMatrix.needsUpdate = true; }

  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    _p.set(b.x, 0.9, b.z); _q.identity(); _s.setScalar(1 + Math.sin(t * 12 + i) * 0.1);
    bulletMesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (b.col === 1) _c.setRGB(0.55, 0.22, 0.05);
    else if (b.col === 2) _c.setRGB(0.95, 0.95, 0.6);
    else if (b.col === 3) _c.setRGB(1.0, 0.85, 0.3);
    else _c.setRGB(1.0, 0.62, 0.1);
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
  lantern.position.set(P.x, 3.2, P.z + 0.5);
  G.stormVis = (G.stormVis || 0) + ((G.stormT > 0 ? 1 : 0) - (G.stormVis || 0)) * Math.min(1, dt * 2);
  const ph = applyDaylight(G.time || 0, G.stormVis);
  const name = phaseName(ph);
  if (name !== G.phase && G.state === 'play') {
    if (G.phase && name === '🌙 夜') { banner('🌙 夜になった… 提灯が頼りだ'); sound.play('night'); }
    if (G.phase && name === '🌇 夕方') banner('🌇 夕焼けの浜辺');
    G.phase = name;
    $('phase').textContent = name;
  }
  G.shake = Math.max(0, (G.shake || 0) - dt * 2.5);
  const sh = G.shake * G.shake * 0.8;
  const zoom = 1 - 0.15 * Math.min(1, Math.max(0, G.slowmo || 0));
  camera.position.set(P.x + camOff.x * zoom + rand(-sh, sh), camOff.y * zoom + rand(-sh, sh), P.z + camOff.z * zoom + rand(-sh, sh));
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
  // ボスの突進予告線
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
  // 落雷の予告円
  for (const s of strikes) {
    if (s.max < 0.5) continue;
    const [cx, cy] = proj(s.x, 0.05, s.z);
    const [ex] = proj(s.x + 1.6, 0.05, s.z);
    const r = Math.abs(ex - cx);
    fctx.strokeStyle = `rgba(255,240,120,${0.5 + Math.sin(s.t * 30) * 0.3})`;
    fctx.lineWidth = 3 * k;
    fctx.beginPath(); fctx.ellipse(cx, cy, r, r * 0.7, 0, 0, TAU); fctx.stroke();
    fctx.fillStyle = 'rgba(255,240,120,0.15)'; fctx.fill();
  }
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
  // 回避ゲージ（HPバーの下）
  const dr = clamp(1 - P.dashCd / S.dashCd, 0, 1);
  fctx.fillStyle = 'rgba(0,0,0,0.45)';
  fctx.fillRect(hx - bw / 2, hy + 10 * k + bh + 2 * k, bw, 3 * k);
  fctx.fillStyle = dr >= 1 ? '#9fe8ff' : '#4a8ab8';
  fctx.fillRect(hx - bw / 2, hy + 10 * k + bh + 2 * k, bw * dr, 3 * k);
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

// ================================================================ HUD
let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
function updateHud() {
  setText('timer', fmtTime(G.time));
  setText('kills', '🐟 ' + fmtNum(G.kills));
  setText('lvtext', 'Lv ' + G.level);
  setText('coinsHud', '🪙 ' + fmtNum(G.coins));
  $('xpfill').style.width = (clamp(G.xp / xpNeed(G.level), 0, 1) * 100).toFixed(1) + '%';
  if (G.boss) $('bossfill').style.width = (clamp(G.boss.hp / G.boss.maxHp, 0, 1) * 100).toFixed(1) + '%';
  const gp = clamp(G.gauge / G.gaugeMax, 0, 1);
  const ready = gp >= 1 && !G.special;
  $('gaugeFill').style.width = (gp * 100).toFixed(1) + '%';
  $('gaugeWrap').classList.toggle('ready', ready);
  const dr = clamp(1 - P.dashCd / S.dashCd, 0, 1);
  $('dashFill').style.width = (dr * 100).toFixed(1) + '%';
  $('spBtn').querySelector('.ring').style.setProperty('--p', (gp * 100).toFixed(0));
  $('spBtn').classList.toggle('ready', ready);
  $('dashBtn').querySelector('.ring').style.setProperty('--p', (dr * 100).toFixed(0));
  const cb = $('combo');
  if (G.combo >= 10) {
    cb.classList.remove('hidden');
    setText('comboNum', fmtNum(G.combo));
    cb.classList.toggle('hot', G.combo >= 100);
    cb.classList.toggle('fire', G.combo >= 500);
  } else cb.classList.add('hidden');
  const ev = $('eventTag');
  if (G.rushT > 0) { ev.className = ''; setText('eventTag', `🎉 大漁タイム ${Math.ceil(G.rushT)}`); }
  else if (G.stormT > 0) { ev.className = 'storm'; setText('eventTag', `⛈ 時化 ${Math.ceil(G.stormT)}`); }
  else if (G.freezeT > 0) { ev.className = 'storm'; setText('eventTag', `⏳ 時間停止 ${Math.ceil(G.freezeT)}`); }
  else ev.className = 'hidden';
  $('vignette').style.opacity = P.hp / P.maxHp < 0.3 ? (0.5 + Math.sin(simTime * 6) * 0.3).toFixed(2) : '0';
}
function renderWeaponList() {
  const el = $('weapons');
  let html = '';
  for (const k in G.weapons) {
    const evo = G.evolved[k];
    html += `<div class="wi${evo ? ' evo' : ''}" title="${evo ? EVOS[k].name : WEAPONS[k].name}">${evo ? EVOS[k].icon : WEAPONS[k].icon}<b>${evo ? '★' : G.weapons[k]}</b></div>`;
  }
  html += '<div class="sep"></div>';
  for (const k in G.passives) html += `<div class="wi p" title="${PASSIVES[k].name}">${PASSIVES[k].icon}<b>${G.passives[k]}</b></div>`;
  el.innerHTML = html;
}

// ================================================================ レベルアップ・宝箱
const MAX_SLOTS = 6;
const canEvolve = k => G.weapons[k] >= WEAPONS[k].max && (G.passives[WEAPONS[k].need] || 0) > 0 && !G.evolved[k];
function rollOptions(n, exclude = []) {
  const pool = [];
  const nW = Object.keys(G.weapons).length, nP = Object.keys(G.passives).length;
  const ex = new Set(exclude.map(o => o.kind + ':' + o.key));
  const ok = (kind, key) => !G.banished.has(kind + ':' + key) && !ex.has(kind + ':' + key);
  for (const k in WEAPONS) {
    const lv = G.weapons[k] || 0;
    if (!ok('w', k)) continue;
    if (lv && lv < WEAPONS[k].max) pool.push({ kind: 'w', key: k, w: 1.3 });
    else if (!lv && nW < MAX_SLOTS) pool.push({ kind: 'w', key: k, w: nW < 3 ? 1.4 : 0.8 });
  }
  for (const k in PASSIVES) {
    const lv = G.passives[k] || 0;
    if (!ok('p', k)) continue;
    // 所持武器の進化に必要なパッシブは出やすく
    const needed = Object.keys(G.weapons).some(w => WEAPONS[w].need === k);
    if (lv && lv < PASSIVES[k].max) pool.push({ kind: 'p', key: k, w: 0.9 });
    else if (!lv && nP < MAX_SLOTS) pool.push({ kind: 'p', key: k, w: needed ? 1.0 : 0.6 });
  }
  const out = [];
  while (out.length < n && pool.length) {
    let sum = 0;
    for (const o of pool) sum += o.w;
    let r = Math.random() * sum, idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    out.push(pool.splice(idx, 1)[0]);
  }
  const extras = ['sendoInf', 'onigiri', 'koban'];
  for (const k of extras) if (out.length < n && !ex.has('x:' + k)) out.push({ kind: 'x', key: k });
  return out;
}
function optionInfo(o) {
  if (o.kind === 'w') {
    const W = WEAPONS[o.key], lv = G.weapons[o.key] || 0, need = PASSIVES[W.need];
    const hint = lv + 1 >= W.max ? `🧬 進化条件：${need.icon}${need.name} を所持して宝箱` : '';
    return { icon: W.icon, name: W.name, tag: lv ? `Lv${lv + 1}` : 'NEW!', desc: W.desc[lv], hint, cls: 'w' };
  }
  if (o.kind === 'p') {
    const Pp = PASSIVES[o.key], lv = G.passives[o.key] || 0;
    const evoFor = Object.keys(G.weapons).filter(w => WEAPONS[w].need === o.key && !G.evolved[w]);
    const hint = evoFor.length ? `🧬 ${evoFor.map(w => WEAPONS[w].name).join('・')} の進化に必要` : '';
    return { icon: Pp.icon, name: Pp.name, tag: lv ? `Lv${lv + 1}` : 'NEW!', desc: Pp.desc, hint, cls: 'p' };
  }
  if (o.kind === 'evo') {
    const E = EVOS[o.key];
    return { icon: E.icon, name: E.name, tag: '進化！', desc: E.desc, hint: `${WEAPONS[o.key].name} が進化した`, cls: 'evo' };
  }
  const X = EXTRAS[o.key];
  return { icon: X.icon, name: X.name, tag: '', desc: X.desc, hint: '', cls: 'x' };
}
function applyOption(o) {
  if (o.kind === 'w') G.weapons[o.key] = (G.weapons[o.key] || 0) + 1;
  else if (o.kind === 'p') G.passives[o.key] = (G.passives[o.key] || 0) + 1;
  else if (o.kind === 'evo') {
    G.evolved[o.key] = true;
    save.stats.evolved[o.key] = true;
    sound.play('evolve');
    flash(0.5, '#ffe9a0');
    banner(`🧬 進化！ ${EVOS[o.key].name}`);
  } else if (o.key === 'sendoInf') G.infSendo++;
  else if (o.key === 'onigiri') P.hp = Math.min(P.maxHp, P.hp + 50);
  else if (o.key === 'koban') G.coins += Math.round(25 * S.coinMul);
  computeStats();
  renderWeaponList();
}
function cardHtml(info, key) {
  return `<div class="ic">${info.icon}</div><div class="tx"><div class="nm">${info.name} <span class="tag">${info.tag}</span></div><div class="ds">${info.desc}</div>${info.hint ? `<div class="hint">${info.hint}</div>` : ''}</div>${key ? `<div class="key">${key}</div>` : ''}`;
}

function openLevelUp() {
  const fourth = Math.random() < Math.min(0.6, 0.1 + (S.luck - 1) * 0.5);
  const opts = rollOptions(fourth ? 4 : 3);
  if (opts.every(o => o.kind === 'x')) {
    // 全強化済み：モーダルを出さずに鮮度∞を自動適用
    while (G.pendingLv > 0) { G.pendingLv--; G.infSendo++; }
    computeStats();
    sound.play('levelup');
    floatText(P.x, 3.0, P.z, `鮮度∞ ×${S.dmgMul.toFixed(1)}`, '#ffd23a', 1.1, 1.0);
    levelBurst();
    return;
  }
  G.state = 'levelup';
  G.lvOpts = opts;
  G.banishMode = false;
  sound.play('levelup');
  renderLevelCards();
  $('lvnum').textContent = G.level - G.pendingLv + 1;
  $('levelup').classList.remove('hidden');
  if (AUTO) setTimeout(() => { const c = $('cards').querySelector('.card'); if (c) c.click(); }, 30);
}
function renderLevelCards() {
  const box = $('cards');
  box.innerHTML = '';
  G.lvOpts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'card ' + optionInfo(o).cls;
    b.innerHTML = cardHtml(optionInfo(o), i + 1);
    b.onclick = () => chooseLevelOption(o);
    box.appendChild(b);
  });
  const setTool = (id, n) => { const el = $(id); el.querySelector('b').textContent = n; el.disabled = n <= 0; };
  setTool('rerollBtn', G.rerolls); setTool('skipBtn', G.skips); setTool('banishBtn', G.banishes);
  $('banishBtn').classList.toggle('on', G.banishMode);
  $('lvHint').textContent = G.banishMode ? '封印する選択肢を選んでください（今回の出航中は出なくなる）' : 'R：リロール　X：スキップ　B：封印';
  if (!isMobile) setTimeout(() => { const c = box.querySelector('.card'); if (c && G.state === 'levelup') c.focus(); }, 0);
}
function chooseLevelOption(o) {
  if (G.state !== 'levelup') return;
  if (G.banishMode && o.kind !== 'x') {
    G.banished.add(o.kind + ':' + o.key);
    G.banishes--;
    G.banishMode = false;
    sound.play('error');
    const idx = G.lvOpts.indexOf(o);
    const rep = rollOptions(1, G.lvOpts)[0];
    if (rep) G.lvOpts[idx] = rep; else G.lvOpts.splice(idx, 1);
    renderLevelCards();
    return;
  }
  sound.play('click');
  applyOption(o);
  closeLevelUp();
}
function closeLevelUp() {
  G.pendingLv--;
  $('levelup').classList.add('hidden');
  G.state = 'play';
  blurUi();
  levelBurst();
  if (G.pendingLv > 0) openLevelUp();
}
$('rerollBtn').onclick = () => {
  if (G.state !== 'levelup' || G.rerolls <= 0) return;
  G.rerolls--; sound.play('reroll');
  G.lvOpts = rollOptions(G.lvOpts.length);
  renderLevelCards();
};
$('skipBtn').onclick = () => {
  if (G.state !== 'levelup' || G.skips <= 0) return;
  G.skips--; sound.play('click');
  P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.1);
  closeLevelUp();
};
$('banishBtn').onclick = () => {
  if (G.state !== 'levelup' || G.banishes <= 0) return;
  G.banishMode = !G.banishMode;
  renderLevelCards();
};

let chestTimers = [];
function openChest(data) {
  G.state = 'chest';
  sound.play('chest');
  const rewards = [];
  for (let i = 0; i < data.count; i++) {
    const evoKey = Object.keys(G.weapons).find(canEvolve);
    let o;
    if (evoKey) o = { kind: 'evo', key: evoKey };
    else o = rollOptions(1)[0];
    if (!o) break;
    rewards.push({ o, info: optionInfo(o) });
    applyOption(o);
  }
  const bonus = Math.round((data.boss ? 20 : 5) * S.coinMul);
  G.coins += bonus;
  if (data.awaken) {
    G.awaken *= 1.25;
    computeStats();
    rewards.push({ info: { icon: '⚡', name: '鰹の覚醒', tag: `×${G.awaken.toFixed(2)}`, desc: 'ボス討伐の報酬：全ダメージ ×1.25（累積）・HP全回復', hint: '', cls: 'x' } });
    P.hp = P.maxHp;
  }
  // ルーレット演出
  const list = $('chestlist');
  list.innerHTML = '';
  for (const t of chestTimers) clearTimeout(t);
  chestTimers = [];
  const icons = ['🐟', '🔥', '🪃', '🍂', '🍋', '🧄', '🔪', '🕊️', '🎣', '✨', '🍵', '💊', '🍙'];
  rewards.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'card spin';
    d.innerHTML = `<div class="ic">❓</div><div class="tx"><div class="nm">？？？</div><div class="ds">　</div></div>`;
    list.appendChild(d);
    const spinIv = setInterval(() => { d.querySelector('.ic').textContent = icons[(Math.random() * icons.length) | 0]; sound.play('roulette'); }, 70);
    chestTimers.push(setTimeout(() => {
      clearInterval(spinIv);
      d.className = 'card land ' + r.info.cls;
      d.innerHTML = cardHtml(r.info);
      sound.play(r.info.cls === 'evo' ? 'evolve' : 'coin');
    }, 550 + i * 380));
    chestTimers.push(spinIv);
  });
  $('chestCoins').textContent = `🪙 小判 +${bonus}`;
  $('chesttitle').textContent = data.name ? `${data.name} の宝箱！` : '宝箱を手に入れた！';
  $('chest').classList.remove('hidden');
  const ok = $('chestOk');
  ok.disabled = true;
  chestTimers.push(setTimeout(() => { ok.disabled = false; ok.focus(); }, 600 + rewards.length * 380));
  if (AUTO) setTimeout(closeChest, 30);
}
function closeChest() {
  if (G.state !== 'chest') return;
  for (const t of chestTimers) { clearTimeout(t); clearInterval(t); }
  chestTimers = [];
  sound.play('click');
  $('chest').classList.add('hidden');
  G.state = 'play';
  blurUi();
  renderWeaponList();
}

// ================================================================ 一時停止
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  $('pausestats').innerHTML = statsHtml();
  $('evoHints').innerHTML = evoHintsHtml();
  $('pause').classList.remove('hidden');
  $('resumeBtn').focus();
}
function resumeGame() {
  if (G.state !== 'pause') return;
  $('pause').classList.add('hidden');
  G.state = 'play';
  blurUi();
  lastT = performance.now();
}
function statsHtml() {
  const rows = [];
  for (const k in G.weapons) rows.push(G.evolved[k] ? `${EVOS[k].icon} ${EVOS[k].name} ★` : `${WEAPONS[k].icon} ${WEAPONS[k].name} Lv${G.weapons[k]}`);
  for (const k in G.passives) rows.push(`${PASSIVES[k].icon} ${PASSIVES[k].name} Lv${G.passives[k]}`);
  rows.push(`⚔ ダメージ倍率 ×${S.dmgMul.toFixed(2)}`);
  rows.push(`💯 最大連撃 ${G.maxCombo}`);
  rows.push(`${CHAR.icon} ${CHAR.name}`);
  rows.push(`${DIFF.icon} ${DIFF.name}`);
  return rows.map(r => `<div>${r}</div>`).join('');
}
function evoHintsHtml() {
  const rows = [];
  for (const k in G.weapons) {
    if (G.evolved[k]) continue;
    const W = WEAPONS[k], need = PASSIVES[W.need], has = (G.passives[W.need] || 0) > 0;
    rows.push(`🧬 ${W.icon}${W.name} Lv${G.weapons[k]}/8 ＋ ${need.icon}${need.name} ${has ? '✅' : '❌'} → ${save.stats.evolved[k] ? EVOS[k].name : '？？？'}`);
  }
  return rows.join('<br>');
}

// ================================================================ 実績
function runSnapshot() {
  return {
    time: G.time, kills: G.kills, level: G.level, maxHit: G.maxDmg, maxCombo: G.maxCombo, diff: G.diffKey,
    bosses: G.bossKilled, evolved: Object.keys(G.evolved).length, specials: G.specials,
    noDmg3: G.noDmg3 && G.time >= 180, coins: G.coins,
  };
}
function checkAch() {
  const r = runSnapshot();
  for (const a of ACH) {
    if (save.ach[a.id]) continue;
    let ok = false;
    try { ok = a.test(r, save); } catch (e) { ok = false; }
    if (ok) unlockAch(a);
  }
}
function unlockAch(a) {
  save.ach[a.id] = Date.now();
  save.coins += a.reward;
  G.newAch.push(a);
  sound.play('ach');
  toast(`🏆 実績解除 <b>${a.name}</b>　+${a.reward}🪙`);
  for (const k in CHARS) if (CHARS[k].unlock === a.id) toast(`🎉 新しい漁師が解放：<b>${CHARS[k].name}</b>`);
  for (const k in DIFFS) if (DIFFS[k].unlock === a.id) toast(`${DIFFS[k].icon} 難易度解放：<b>${DIFFS[k].name}</b>`);
  persist(save);
}

// ================================================================ ゲームオーバー・結果
function rankOf(t) {
  for (const [s, n] of RANKS) if (t < s) return n;
  return RANKS[RANKS.length - 1][1];
}
const SRC_NAMES = { special: ['🌧️', '鰹乱舞'], storm: ['⚡', '落雷'], bomb: ['🎏', '大漁旗'], burst: ['💥', '衝撃波'] };
function gameOver() {
  if (G.state === 'over') return;
  if (G.revives > 0) {
    G.revives--;
    P.hp = P.maxHp * 0.5;
    P.inv = 2.5;
    sound.play('revive');
    flash(0.7, '#fff6d0');
    banner('✊ 根性で復活！');
    for (const e of enemies) {
      if (e.dead || e.prop || e.boss) continue;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
      if (d < 8) hitEnemy(e, 50, dx / (d || 1), dz / (d || 1), 20, { src: 'burst', quiet: true });
    }
    addRing(P.x, P.z, 0.5, 9, 20, 0xffe0a0, 0.8);
    return;
  }
  G.state = 'over';
  sound.play('gameover');
  sound.stopMusic();
  checkAch();
  const timeBonus = Math.round(Math.floor(G.time / 60) * 5 * S.coinMul);
  const earned = G.coins + timeBonus;
  save.coins += earned;
  save.totalCoins += earned;
  const st = save.stats;
  const prevBest = st.bestTime;
  st.kills += G.kills; st.runs++; st.playTime += G.time;
  st.bestTime = Math.max(st.bestTime, G.time);
  st.maxCombo = Math.max(st.maxCombo, G.maxCombo);
  for (const k in G.bossKilled) st.bosses[k] = (st.bosses[k] || 0) + 1;
  const entry = { time: G.time, kills: G.kills, level: G.level, char: G.char, diff: G.diffKey, date: Date.now() };
  save.ranking.push(entry);
  save.ranking.sort((a, b) => b.time - a.time);
  save.ranking = save.ranking.slice(0, 10);
  const place = save.ranking.indexOf(entry);
  save.tips++;
  persist(save);

  $('goH').textContent = G.kamiDone ? '鯖神を〆た漁師、ついに力尽く…' : '鯖に呑まれた…';
  $('goH').classList.toggle('win', G.kamiDone);
  $('goTime').textContent = fmtTime(G.time);
  $('goRank').textContent = `称号：${rankOf(G.time)}`;
  $('goStats').innerHTML = `撃破 <b>${fmtNum(G.kills)}</b>　Lv <b>${G.level}</b>　最大連撃 <b>${G.maxCombo}</b><br>最大ダメージ <b>${fmtNum(G.maxDmg)}</b>　${CHAR.icon}${CHAR.name}・${DIFF.icon}${DIFF.name}`;
  $('goBest').textContent = G.time > prevBest ? '🎉 自己ベスト更新！' : place >= 0 ? `📜 番付 ${place + 1} 位` : `自己ベスト ${fmtTime(prevBest)}`;
  // 武器別ダメージ
  const rows = Object.entries(G.wdmg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxV = rows.length ? rows[0][1] : 1;
  $('goDmg').innerHTML = rows.length ? '<b>武器別ダメージ</b>' + rows.map(([k, v]) => {
    const icon = WEAPONS[k] ? (G.evolved[k] ? EVOS[k].icon : WEAPONS[k].icon) : (SRC_NAMES[k] || ['❔'])[0];
    return `<div class="dmgRow"><span>${icon}</span><div class="bar" style="width:${(v / maxV * 100).toFixed(1)}%"></div><span class="v">${fmtNum(v)}</span></div>`;
  }).join('') : '';
  $('goCoins').textContent = `🪙 小判 +${earned}（拾った ${G.coins} ＋ 生存ボーナス ${timeBonus}）`;
  $('goAch').innerHTML = G.newAch.length ? '🏆 ' + G.newAch.map(a => a.name).join('・') : '';
  const text = `「カツオのたたきサバイバー」で鯖の猛攻を ${fmtTime(G.time)} 生き延びた！（撃破 ${fmtNum(G.kills)}・最大ダメージ ${fmtNum(G.maxDmg)}・称号「${rankOf(G.time)}」） #カツオのたたきサバイバー`;
  G.shareText = `${text}\n${location.href.split(/[?#]/)[0]}`;
  G.shareFile = null;
  G.wantShot = true; // 次の描画で最後の瞬間を撮影して結果画像を作る
  setTimeout(() => { $('gameover').classList.remove('hidden'); $('retryBtn').focus(); }, 900);
  $('hud').classList.add('hidden');
  joy.active = false; joyEl.classList.add('hidden');
}

// ================================================================ 結果画像のシェア
const SHARE_W = 1200, SHARE_H = 630;
function captureResult() {
  // 描画直後のゲーム画面（と数字のオーバーレイ）を右側に敷く
  const shot = document.createElement('canvas');
  shot.width = SHARE_W; shot.height = SHARE_H;
  const ctx = shot.getContext('2d');
  ctx.fillStyle = '#0a1626'; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const rx = 380, rw = SHARE_W - rx;
  const s = Math.max(rw / canvas.width, SHARE_H / canvas.height);
  const dw = canvas.width * s, dh = canvas.height * s, dx = rx + (rw - dw) / 2, dy = (SHARE_H - dh) / 2;
  try {
    ctx.drawImage(canvas, dx, dy, dw, dh);
    ctx.drawImage(fx, dx, dy, dw, dh);
  } catch (e) { /* noop */ }
  G.shareShot = shot;
  try { G.shareFile = canvasToFile(makeShareCanvas()); } catch (e) { G.shareFile = null; }
}
function makeShareCanvas() {
  const c = document.createElement('canvas');
  c.width = SHARE_W; c.height = SHARE_H;
  const ctx = c.getContext('2d');
  if (G.shareShot) ctx.drawImage(G.shareShot, 0, 0);
  else { ctx.fillStyle = '#0a1626'; ctx.fillRect(0, 0, SHARE_W, SHARE_H); }
  const g = ctx.createLinearGradient(0, 0, SHARE_W, 0);
  g.addColorStop(0, 'rgba(6,14,32,0.96)'); g.addColorStop(0.45, 'rgba(6,14,32,0.82)'); g.addColorStop(0.75, 'rgba(6,14,32,0.2)'); g.addColorStop(1, 'rgba(6,14,32,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, SHARE_W - 10, SHARE_H - 10);
  const TITLE = '"Dela Gothic One", "Hiragino Sans", sans-serif', BODY = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const text = (str, x, y, font, color, stroke = 0) => {
    ctx.font = font;
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
  };
  const X = 60;
  // タイトル
  let x = X;
  x += text('カツオの', x, 92, `400 44px ${TITLE}`, '#ffffff', 8);
  x += text('たたき', x, 92, `400 44px ${TITLE}`, '#e2402e', 8);
  text('サバイバー', x, 92, `400 44px ${TITLE}`, '#ffcf3a', 8);
  // 生存時間
  text(G.kamiDone ? '👑 鯖神を〆た！ 生存時間' : '生存時間', X, 165, `800 30px ${BODY}`, '#bfe2ff', 6);
  text(fmtTime(G.time), X - 4, 310, `400 150px ${TITLE}`, '#ffffff', 14);
  text(`称号：${rankOf(G.time)}`, X, 378, `900 40px ${BODY}`, '#ffcf3a', 8);
  text(`撃破 ${fmtNum(G.kills)}　Lv ${G.level}　最大連撃 ${fmtNum(G.maxCombo)}`, X, 442, `800 30px ${BODY}`, '#ffffff', 6);
  text(`最大ダメージ ${fmtNum(G.maxDmg)}`, X, 488, `800 30px ${BODY}`, '#ffffff', 6);
  text(`${CHAR.icon} ${CHAR.name}　${DIFF.icon} ${DIFF.name}`, X, 534, `800 28px ${BODY}`, '#9fe8ff', 6);
  text('#カツオのたたきサバイバー', X, 596, `800 24px ${BODY}`, '#ffd27a', 5);
  return c;
}
function canvasToFile(c) {
  const data = c.toDataURL('image/png');
  const bin = atob(data.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const t = Math.floor(G.time);
  return new File([arr], `katsuo-survivor-${String(Math.floor(t / 60)).padStart(2, '0')}m${String(t % 60).padStart(2, '0')}s.png`, { type: 'image/png' });
}
function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
async function shareResult() {
  sound.play('click');
  if (!G.shareFile) { try { G.shareFile = canvasToFile(makeShareCanvas()); } catch (e) { G.shareFile = null; } }
  const file = G.shareFile, text = G.shareText || '';
  // 投稿先アプリが本文を受け取らない場合に備えて、本文もコピーしておく
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { /* noop */ });
  const data = file ? { files: [file], text } : { text };
  if (navigator.share && (!navigator.canShare || navigator.canShare(data)) && file) {
    try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  // 画像付きの共有ができない環境：画像を保存して本文をコピー
  if (file) downloadFile(file);
  toast('📸 結果画像を保存し、投稿文をコピーしました。<br>X などに画像を添付して貼り付けてね', 'tip');
}
$('shareBtn').onclick = shareResult;

// ================================================================ タイトル・メニュー
function blurUi() { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }
function startGame() {
  blurUi();
  sound.init();
  applySettings();
  sound.play('click');
  for (const id of SUBMENUS) $(id).classList.add('hidden');
  resetGame();
  $('title').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('hud').classList.remove('hidden');
  lastHud = {};
  G.phase = '';
  sound.startMusic();
  lastT = performance.now();
  banner(`${CHAR.icon} ${CHAR.name}、出航！ 迫り来る鯖を〆ろ！`);
  checkAch();
}
function toTitle() {
  G.state = 'title';
  for (const id of ['gameover', 'pause', 'levelup', 'chest', ...SUBMENUS]) $(id).classList.add('hidden');
  $('hud').classList.add('hidden');
  $('title').classList.remove('hidden');
  sound.stopMusic();
  setGoldKatsuo(false);
  katsuoMats.body.map = katsuoMats.rawMap; katsuoMats.body.needsUpdate = true;
  refreshTitle();
}
function refreshTitle() {
  const b = save.stats.bestTime;
  $('best').textContent = b ? `自己ベスト ${fmtTime(b)}　｜　累計撃破 ${fmtNum(save.stats.kills)}` : '';
  $('titleCoins').textContent = fmtNum(save.coins);
}
function openMenu(id) {
  sound.init();
  sound.play('click');
  const render = { charsel: renderCharSel, shop: renderShop, achv: renderAch, rank: renderRank, codex: renderCodex, settings: renderSettings }[id];
  if (render) render();
  $(id).classList.remove('hidden');
  setTimeout(() => { const f = $(id).querySelector('.sel, button:not([disabled])'); if (f) f.focus(); }, 0);
}
function closeMenu(id) {
  sound.play('click');
  $(id).classList.add('hidden');
  if (G.state === 'title') { refreshTitle(); setTimeout(() => $('startBtn').focus(), 0); }
  if (G.state === 'pause') $('resumeBtn').focus();
}
function openCharSel() { openMenu('charsel'); }

function renderCharSel() {
  const box = $('charList');
  box.innerHTML = '';
  for (const k in CHARS) {
    const C = CHARS[k], unlocked = achDone(C.unlock);
    const b = document.createElement('button');
    b.className = 'ch' + (save.char === k ? ' sel' : '') + (unlocked ? '' : ' locked');
    const cond = C.unlock ? ACH.find(a => a.id === C.unlock) : null;
    b.innerHTML = `<div class="ic">${unlocked ? C.icon : '🔒'}</div><div><div class="tt">${C.title}</div><div class="nm">${unlocked ? C.name : '？？？'}</div><div class="ds">${unlocked ? C.desc : '解放条件：' + (cond ? cond.desc : '')}</div></div>`;
    b.onclick = () => {
      if (!unlocked) { sound.play('error'); return; }
      save.char = k; persist(save); sound.play('click'); renderCharSel();
      setTimeout(() => box.querySelector('.sel')?.focus(), 0);
    };
    box.appendChild(b);
  }
  const dl = $('diffList');
  dl.innerHTML = '';
  for (const k in DIFFS) {
    const D = DIFFS[k], unlocked = achDone(D.unlock);
    const b = document.createElement('button');
    b.className = 'diff' + (save.diff === k ? ' sel' : '') + (unlocked ? '' : ' locked');
    const cond = D.unlock ? ACH.find(a => a.id === D.unlock) : null;
    b.innerHTML = `${unlocked ? D.icon : '🔒'} ${D.name}<small>${unlocked ? D.desc : '解放：' + (cond ? cond.desc : '')}</small>`;
    b.onclick = () => {
      if (!unlocked) { sound.play('error'); return; }
      save.diff = k; persist(save); sound.play('click'); renderCharSel();
    };
    dl.appendChild(b);
  }
}
function renderShop() {
  $('shopCoins').textContent = fmtNum(save.coins);
  const box = $('shopList');
  box.innerHTML = '';
  for (const it of SHOP) {
    const lv = shopLv(it.id), maxed = lv >= it.max, cost = shopCost(it, lv);
    const d = document.createElement('div');
    d.className = 'shopItem';
    d.innerHTML = `<div class="ic">${it.icon}</div><div class="tx"><div class="nm">${it.name}</div><div class="ds">${it.desc}</div><div class="pips">${Array.from({ length: it.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = maxed ? '最大' : `🪙 ${fmtNum(cost)}`;
    btn.disabled = maxed || save.coins < cost;
    btn.onclick = () => {
      if (maxed || save.coins < cost) { sound.play('error'); return; }
      save.coins -= cost;
      save.shop[it.id] = lv + 1;
      persist(save);
      sound.play('buy');
      renderShop();
    };
    d.appendChild(btn);
    box.appendChild(d);
  }
}
function renderAch() {
  const done = ACH.filter(a => save.ach[a.id]).length;
  $('achCount').textContent = `${done} / ${ACH.length}`;
  $('achList').innerHTML = ACH.map(a => `<div class="achItem${save.ach[a.id] ? ' done' : ''}"><div class="ic">${save.ach[a.id] ? '🏆' : '🔒'}</div><div class="tx"><div class="nm">${a.name}</div><div class="ds">${a.desc}</div></div><div class="rw">+${a.reward}🪙</div></div>`).join('');
}
function renderRank() {
  const r = save.ranking;
  $('rankList').innerHTML = r.length ? `<table><tr><th>#</th><th>時間</th><th>撃破</th><th>Lv</th><th>漁師</th><th>難易度</th></tr>${r.map((e, i) => `<tr><td>${i + 1}</td><td>${fmtTime(e.time)}</td><td>${fmtNum(e.kills)}</td><td>${e.level}</td><td>${(CHARS[e.char] || CHARS.taro).icon}</td><td>${(DIFFS[e.diff] || DIFFS.normal).icon}</td></tr>`).join('')}</table>` : '<p>まだ記録がありません。出航しよう！</p>';
  const s = save.stats;
  $('statList').innerHTML = [
    `出航回数 <b>${s.runs}</b>`, `累計撃破 <b>${fmtNum(s.kills)}</b>`,
    `累計プレイ <b>${fmtTime(s.playTime)}</b>`, `最大連撃 <b>${s.maxCombo}</b>`,
    `累計小判 <b>${fmtNum(save.totalCoins)}</b>`, `ボス討伐 <b>${Object.values(s.bosses).reduce((a, b) => a + b, 0)}</b>`,
  ].map(x => `<div>${x}</div>`).join('');
}
function renderCodex() {
  let html = '<h3>武器と進化</h3>';
  for (const k in WEAPONS) {
    const W = WEAPONS[k], need = PASSIVES[W.need], known = save.stats.evolved[k];
    html += `<div class="cx"><div class="ic">${W.icon}</div><div><b>${W.name}</b>　${W.desc[0]}<br><span class="arrow">Lv8 ＋ ${need.icon}${need.name} →</span> ${known ? `${EVOS[k].icon}<b>${EVOS[k].name}</b>：${EVOS[k].desc}` : '？？？'}</div></div>`;
  }
  html += '<h3>パッシブ</h3>';
  for (const k in PASSIVES) html += `<div class="cx"><div class="ic">${PASSIVES[k].icon}</div><div><b>${PASSIVES[k].name}</b>　${PASSIVES[k].desc}（最大Lv${PASSIVES[k].max}）</div></div>`;
  html += '<h3>鯖</h3>';
  const enemyDesc = { masaba: '基本の鯖。とにかく数が多い', gomasaba: '腹にゴマ模様。足が速い', kinka: '脂の乗った高級鯖。硬い', shime: '酢で〆られた鯖。距離をとって酢を吐く', can: '転がってくる缶詰。硬い', battera: '押し寿司。倒すと小サバに分裂', yaki: '香ばしく焼けた鯖。速くて痛い', kosaba: 'バッテラから飛び出す小さな鯖' };
  for (const k in TYPES) if (!TYPES[k].prop) html += `<div class="cx"><div class="ic">🐟</div><div><b>${TYPES[k].name}</b>　${enemyDesc[k] || ''}</div></div>`;
  html += '<h3>ボス</h3>';
  for (const k in BOSSES) {
    const B = BOSSES[k], n = save.stats.bosses[k] || 0;
    html += `<div class="cx"><div class="ic">${n ? '👑' : '❓'}</div><div><b>${n || k !== 'kami' ? B.name : '？？？'}</b>　${B.sub}${n ? `（討伐 ${n} 回）` : ''}</div></div>`;
  }
  $('codexList').innerHTML = html;
}
function renderSettings() {
  const st = save.settings;
  $('setBgm').value = st.bgm; $('setSe').value = st.se;
  $('setShake').checked = st.shake; $('setDmg').checked = st.dmgNum;
  $('setQuality').value = st.quality;
}
function applySettings() {
  const st = save.settings;
  sound.setVolumes(st.bgm, st.se);
  sound.setMuted(st.muted);
  const low = st.quality === 'low';
  sun.castShadow = !low;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : (isMobile ? 1.5 : 2)));
  resize();
  updateMuteButtons();
}
$('setBgm').oninput = e => { save.settings.bgm = +e.target.value; applySettings(); persist(save); };
$('setSe').oninput = e => { save.settings.se = +e.target.value; applySettings(); sound.play('coin'); persist(save); };
$('setShake').onchange = e => { save.settings.shake = e.target.checked; persist(save); };
$('setDmg').onchange = e => { save.settings.dmgNum = e.target.checked; persist(save); };
$('setQuality').onchange = e => { save.settings.quality = e.target.value; applySettings(); persist(save); };
$('wipeBtn').onclick = () => {
  if (!confirm('セーブデータ（小判・購買部・実績・番付）をすべて消去します。よろしいですか？')) return;
  wipeSave();
  location.reload();
};

function toggleMute() {
  sound.init();
  save.settings.muted = !save.settings.muted;
  sound.setMuted(save.settings.muted);
  persist(save);
  updateMuteButtons();
}
function updateMuteButtons() {
  for (const el of document.querySelectorAll('.muteBtn')) el.textContent = save.settings.muted ? '🔇' : '🔊';
}

$('startBtn').onclick = openCharSel;
$('goBtn').onclick = startGame;
$('retryBtn').onclick = startGame;
$('titleBtn').onclick = toTitle;
$('resumeBtn').onclick = resumeGame;
$('pauseSetBtn').onclick = () => openMenu('settings');
$('quitBtn').onclick = () => {
  if (G.state !== 'pause') return;
  $('pause').classList.add('hidden');
  G.revives = 0;
  G.state = 'play';
  gameOver();
};
$('pauseBtn').onclick = () => pauseGame();
$('chestOk').onclick = closeChest;
for (const el of document.querySelectorAll('.muteBtn')) el.onclick = toggleMute;
for (const el of document.querySelectorAll('.menuBtn')) el.onclick = () => openMenu(el.dataset.open);
for (const el of document.querySelectorAll('.back')) el.onclick = () => closeMenu(el.closest('.screen').id);

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
  const sc = (h * renderer.getPixelRatio()) / (2 * Math.tan(vf / 2));
  parts.mat.uniforms.scale.value = sc;
  fire.mat.uniforms.scale.value = sc;
  show.cam.aspect = w / h;
  const sv = Math.tan(show.cam.fov * Math.PI / 360);
  show.cam.position.z = Math.max(3.6, 1.25 / (sv * show.cam.aspect));
  show.portrait = w / h < 0.8;
  show.cam.updateProjectionMatrix();
}
addEventListener('resize', resize);

let lastT = performance.now();
let simTime = 0, frameNo = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  simTime += dt;
  pollGamepad();
  if (G.state === 'title') {
    showK.rotation.y = simTime * 0.45;
    showK.rotation.z = Math.sin(simTime * 0.9) * 0.12;
    showK.rotation.x = Math.sin(simTime * 0.6) * 0.08;
    showK.position.y = (show.portrait ? 0.05 : -0.32) + Math.sin(simTime * 1.3) * 0.04;
    renderer.render(show.scene, show.cam);
    fctx.clearRect(0, 0, fx.width, fx.height);
    return;
  }
  let sdt = dt;
  if (G.state === 'play') {
    if (G.hitstop > 0) { G.hitstop -= dt; sdt = dt * 0.05; } else if (G.slowmo > 0) { G.slowmo -= dt; sdt = dt * G.slowScale; }
    if (TURBO) { for (let i = 0; i < TURBO && G.state === 'play'; i++) simulate(1 / 60); }
    else {
      const steps = sdt > 0.025 ? 2 : 1;
      for (let i = 0; i < steps && G.state === 'play'; i++) simulate(sdt / steps);
    }
  }
  const vdt = G.state === 'play' ? sdt : 0;
  frameNo++;
  if (TURBO && frameNo % 20 !== 0 && G.state === 'play') { parts.update(1 / 60 * TURBO); fire.update(1 / 60 * TURBO); texts.length = 0; return; }
  syncScene(vdt, simTime);
  renderer.render(scene, camera);
  drawFx(G.state === 'play' || G.state === 'over' ? sdt : 0);
  if (G.wantShot) { G.wantShot = false; captureResult(); }
  if (G.state !== 'over') updateHud();
}

// シェーダーを事前コンパイル（初登場時のカクつき防止）
function warmup() {
  const hidden = [];
  scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const tmp = ['onigiri', 'teishoku', 'float', 'chest', 'tokei', 'hata', 'koban'].map(k => makeItemMesh(k));
  try { renderer.compile(scene, camera); } catch (e) { /* noop */ }
  for (const m of tmp) scene.remove(m);
  for (const o of hidden) o.visible = false;
}

// ================================================================ 初期化
applySettings();
warmup();
G.state = 'title';
refreshTitle();
$('loading').classList.add('hidden');
$('title').classList.remove('hidden');
requestAnimationFrame(frame);
setTimeout(() => { if (!katsuoMats.searedMap) katsuoMats.searedMap = F.makeKatsuoTexture(true); }, 600);
if (AUTO) setTimeout(startGame, 300);
window.__game = { G, P, enemies, S: () => S, gems, fps: () => frameNo, parts, save, dbg: DEBUG ? { computeStats, renderWeaponList, trySpecial, spawnBoss, spawnItem, openChest, spawnFlock } : null };
