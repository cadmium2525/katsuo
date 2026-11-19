// 魚モデル（やたらリアルな鰹・鯖）の手続き生成
import * as THREE from 'three';

const TAU = Math.PI * 2;

export function smooth(a, b, x) {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}
const mix = (a, b, t) => a + (b - a) * t;
function mixc(c1, c2, t) {
  return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
}

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, period = 0) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  let x1 = xi + 1, y1 = yi + 1;
  if (period) {
    xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period;
    x1 = ((x1 % period) + period) % period; y1 = ((y1 % period) + period) % period;
  }
  const a = hash2(xi, yi), b = hash2(x1, yi), c = hash2(xi, y1), d = hash2(x1, y1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, period = 0) {
  return (vnoise(x, y, period) * 0.5 + vnoise(x * 2, y * 2, period * 2) * 0.25 +
    vnoise(x * 4, y * 4, period * 4) * 0.125) / 0.875;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- 体型プロファイル
// [s(0=吻端,1=尾柄), 半高, 半幅, 中心Y]
const KATSUO_PROFILE = [
  [0.000, 0.004, 0.003, -0.010],
  [0.015, 0.030, 0.022, -0.008],
  [0.050, 0.068, 0.052, -0.004],
  [0.110, 0.108, 0.082, 0.000],
  [0.200, 0.142, 0.108, 0.004],
  [0.320, 0.160, 0.122, 0.004],
  [0.430, 0.158, 0.120, 0.002],
  [0.560, 0.134, 0.102, 0.000],
  [0.680, 0.095, 0.074, 0.000],
  [0.790, 0.056, 0.046, 0.000],
  [0.880, 0.030, 0.032, 0.000],
  [0.950, 0.020, 0.026, 0.000],
  [1.000, 0.016, 0.018, 0.000],
];
const SABA_PROFILE = [
  [0.000, 0.004, 0.003, -0.006],
  [0.020, 0.028, 0.020, -0.004],
  [0.070, 0.060, 0.042, 0.000],
  [0.160, 0.090, 0.064, 0.002],
  [0.300, 0.106, 0.076, 0.002],
  [0.450, 0.104, 0.074, 0.000],
  [0.600, 0.086, 0.062, 0.000],
  [0.740, 0.058, 0.042, 0.000],
  [0.860, 0.032, 0.026, 0.000],
  [0.950, 0.020, 0.018, 0.000],
  [1.000, 0.016, 0.014, 0.000],
];

function profileAt(P, s, k) {
  if (s <= P[0][0]) return P[0][k];
  const n = P.length;
  if (s >= P[n - 1][0]) return P[n - 1][k];
  let i = 0;
  while (i < n - 2 && s > P[i + 1][0]) i++;
  const u = (s - P[i][0]) / (P[i + 1][0] - P[i][0]);
  const p0 = P[Math.max(0, i - 1)][k], p1 = P[i][k], p2 = P[i + 1][k], p3 = P[Math.min(n - 1, i + 2)][k];
  const v = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  return Math.max(0, v) * (k === 3 ? 0 : 1) + (k === 3 ? v : 0);
}

// 胴体（体表を回転断面で生成）。魚体は +X が吻端、x = 0.5 - s
function buildBody(P, N, M) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = Math.pow(i / N, 1.08);
    const h = profileAt(P, s, 1), w = profileAt(P, s, 2), cy = profileAt(P, s, 3);
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * TAU;
      let cyl = -Math.cos(a);
      const sn = Math.sin(a);
      // 腹側を少し平たく、背側を少し尖らせる
      const hh = cyl < 0 ? h * 0.96 : h;
      const zz = Math.sign(sn) * Math.pow(Math.abs(sn), 0.92);
      pos.push(0.5 - s, cy + hh * cyl, w * zz);
      uv.push(s, j / M);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 継ぎ目（腹）の法線を平均化
  const nrm = g.attributes.normal;
  for (let i = 0; i <= N; i++) {
    const a = i * (M + 1), b = a + M;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

// 2D多角形 → 3D鰭
function finFromPolygon(pts, mapFn) {
  const v2 = pts.map(p => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(v2, []);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const pos = [], uv = [], idx = [];
  for (const p of pts) {
    const v = mapFn(p[0], p[1]);
    pos.push(v[0], v[1], v[2]);
    uv.push((p[0] - minX) / (maxX - minX || 1), (Math.abs(p[1]) - 0) / (Math.max(Math.abs(maxY), Math.abs(minY)) || 1));
  }
  for (const t of tris) idx.push(t[0], t[1], t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function mergeGeos(geos) {
  let vcount = 0;
  const pos = [], nrm = [], uv = [], idx = [];
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + vcount);
    else for (let i = 0; i < p.count; i++) idx.push(i + vcount);
    vcount += p.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  m.setIndex(idx);
  return m;
}

function buildFins(P, spec) {
  const H = s => profileAt(P, s, 1), Wd = s => profileAt(P, s, 2), CY = s => profileAt(P, s, 3);
  const geos = [];
  const dorsal = pts => finFromPolygon(pts, (s, o) => [0.5 - s, CY(s) + H(s) * 0.985 + o - 0.003, 0]);
  const ventral = pts => finFromPolygon(pts, (s, o) => [0.5 - s, CY(s) - H(s) * 0.95 - o + 0.003, 0]);
  for (const f of spec.dorsal) geos.push(dorsal(f));
  for (const f of spec.ventral) geos.push(ventral(f));
  // 小離鰭（フィンレット）
  for (let k = 0; k < spec.finletsTop; k++) {
    const s0 = spec.finletTopStart + k * spec.finletGap;
    const hgt = spec.finletH * (1 - k * 0.05);
    geos.push(dorsal([[s0, 0], [s0 + spec.finletGap * 0.85, hgt], [s0 + spec.finletGap * 0.55, 0]]));
  }
  for (let k = 0; k < spec.finletsBottom; k++) {
    const s0 = spec.finletBotStart + k * spec.finletGap;
    const hgt = spec.finletH * (1 - k * 0.05);
    geos.push(ventral([[s0, 0], [s0 + spec.finletGap * 0.85, hgt], [s0 + spec.finletGap * 0.55, 0]]));
  }
  // 尾鰭（三日月型）
  geos.push(finFromPolygon(spec.caudal, (dx, y) => [0.5 - 1 - dx + 0.012, y, 0]));
  // 胸鰭・腹鰭（左右）
  for (const side of [1, -1]) {
    const s0 = spec.pecS, y0 = CY(s0) + H(s0) * spec.pecY;
    geos.push(finFromPolygon(spec.pectoral, (ds, o) => [
      0.5 - (s0 + ds), y0 + o * 0.9 - ds * 0.18, side * (Wd(s0 + ds * 0.5) * 0.97 + ds * 0.16 + 0.004)]));
    if (spec.keel) {
      geos.push(finFromPolygon(spec.keel, (s, o) => [0.5 - s, CY(s), side * (Wd(s) * 0.98 + o)]));
    }
    const p0 = spec.pelS;
    geos.push(finFromPolygon(spec.pelvic, (ds, o) => [
      0.5 - (p0 + ds), CY(p0) - H(p0) * 0.9 - o * 0.8, side * (Wd(p0) * 0.35 + o * 0.25)]));
  }
  return mergeGeos(geos);
}

const KATSUO_FINS = {
  dorsal: [
    [[0.255, 0], [0.262, 0.085], [0.272, 0.112], [0.29, 0.118], [0.31, 0.104], [0.34, 0.078], [0.38, 0.052],
      [0.42, 0.034], [0.46, 0.02], [0.50, 0.008], [0.505, 0]],
    [[0.53, 0], [0.54, 0.06], [0.552, 0.078], [0.57, 0.072], [0.60, 0.03], [0.625, 0.01], [0.63, 0]],
  ],
  ventral: [
    [[0.57, 0], [0.58, 0.05], [0.592, 0.068], [0.61, 0.062], [0.635, 0.024], [0.655, 0.008], [0.66, 0]],
  ],
  finletsTop: 8, finletTopStart: 0.655, finletsBottom: 7, finletBotStart: 0.69, finletGap: 0.038, finletH: 0.03,
  caudal: [[0, 0.02], [0.05, 0.07], [0.11, 0.14], [0.17, 0.2], [0.205, 0.232], [0.19, 0.2], [0.15, 0.12],
    [0.12, 0.05], [0.108, 0], [0.12, -0.05], [0.15, -0.12], [0.19, -0.2], [0.205, -0.232], [0.17, -0.2],
    [0.11, -0.14], [0.05, -0.07], [0, -0.02]],
  pecS: 0.205, pecY: -0.12,
  pectoral: [[0, 0.014], [0.0, -0.012], [0.05, -0.006], [0.1, 0.006], [0.125, 0.013], [0.07, 0.02], [0.03, 0.02]],
  pelS: 0.235,
  pelvic: [[0, 0], [0.06, 0.04], [0.075, 0.04], [0.05, 0.01], [0.04, 0]],
  keel: [[0.86, 0], [0.92, 0.011], [0.985, 0.012], [1.0, 0.004], [1.0, 0], [0.93, -0.002]],
};
const SABA_FINS = {
  dorsal: [
    [[0.25, 0], [0.26, 0.055], [0.275, 0.07], [0.3, 0.06], [0.33, 0.04], [0.36, 0.02], [0.385, 0]],
    [[0.54, 0], [0.55, 0.045], [0.565, 0.055], [0.58, 0.045], [0.61, 0.012], [0.62, 0]],
  ],
  ventral: [
    [[0.56, 0], [0.57, 0.04], [0.585, 0.05], [0.60, 0.04], [0.625, 0.01], [0.635, 0]],
  ],
  finletsTop: 5, finletTopStart: 0.655, finletsBottom: 5, finletBotStart: 0.67, finletGap: 0.05, finletH: 0.024,
  caudal: [[0, 0.016], [0.06, 0.07], [0.13, 0.15], [0.19, 0.205], [0.21, 0.215], [0.18, 0.14], [0.13, 0.05],
    [0.11, 0], [0.13, -0.05], [0.18, -0.14], [0.21, -0.215], [0.19, -0.205], [0.13, -0.15], [0.06, -0.07], [0, -0.016]],
  pecS: 0.19, pecY: 0.05,
  pectoral: [[0, 0.016], [0, -0.014], [0.05, -0.008], [0.1, 0.006], [0.07, 0.022]],
  pelS: 0.24,
  pelvic: [[0, 0], [0.05, 0.03], [0.06, 0.03], [0.04, 0]],
  keel: null,
};

// ---------------------------------------------------------------- テクスチャ
// θ: 0=腹 → π=背中
function paintFishTexture(W, H, fn) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const col = [0, 0, 0];
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / H, a = v * TAU, th = a <= Math.PI ? a : TAU - a;
    for (let px = 0; px < W; px++) {
      const s = (px + 0.5) / W;
      fn(s, th, col);
      const o = (py * W + px) * 4;
      d[o] = col[0] < 0 ? 0 : col[0] > 255 ? 255 : col[0];
      d[o + 1] = col[1] < 0 ? 0 : col[1] > 255 ? 255 : col[1];
      d[o + 2] = col[2] < 0 ? 0 : col[2] > 255 ? 255 : col[2];
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeKatsuoTexture(seared = false) {
  const stripesC = [0.30, 0.58, 0.86, 1.13];
  const c = paintFishTexture(1024, 512, (s, th, out) => {
    // 銀白の腹〜鋼青の背
    const silver = mixc([238, 240, 242], [192, 200, 212], Math.min(1, th / 1.5));
    const back = mixc([46, 56, 96], [16, 20, 40], smooth(1.75, 2.6, th));
    let c = mixc(silver, back, smooth(1.38, 1.8, th));
    // 体側の虹色（玉虫色）
    const band = Math.exp(-(((th - 1.45) / 0.13) ** 2));
    c[0] += band * (18 + 22 * Math.sin(s * 11 + 1.3));
    c[1] += band * (10 + 10 * Math.sin(s * 7 + 2));
    c[2] += band * (30 + 18 * Math.cos(s * 9));
    // 腹の縦縞（カツオの証）
    const stripeFade = smooth(0.2, 0.3, s) * (1 - smooth(0.8, 0.93, s));
    for (let k = 0; k < 4; k++) {
      const ck = stripesC[k] + 0.022 * Math.sin(s * 28 + k * 1.7) + 0.012 * Math.sin(s * 71 + k);
      const st = smooth(0.07, 0.03, Math.abs(th - ck)) * stripeFade;
      c = mixc(c, [48, 54, 76], st * 0.92);
    }
    // 頭部：鰓蓋のライン・頬
    if (s < 0.24) {
      const sop = 0.19 - 0.028 * Math.cos(th - 1.25);
      const ln = smooth(0.007, 0.0, Math.abs(s - sop)) * smooth(0.25, 0.4, th) * (1 - smooth(2.1, 2.3, th));
      if (s < sop) {
        const cheek = smooth(0.4, 0.9, th) * (1 - smooth(1.5, 1.8, th));
        c[0] += cheek * 14; c[1] += cheek * 12; c[2] += cheek * 6;
      }
      c = mixc(c, [40, 44, 58], ln * 0.75);
      // 口
      const mouthTh = 1.33 + s * 1.6;
      const mo = smooth(0.035, 0.0, Math.abs(th - mouthTh)) * (1 - smooth(0.06, 0.08, s));
      c = mixc(c, [30, 26, 34], mo * 0.9);
      // 吻端は暗め
      const tip = 1 - smooth(0.0, 0.03, s);
      c = mixc(c, [46, 52, 70], tip * 0.7);
    }
    // 側線
    const llTh = 1.85 - 0.12 * Math.sin(s * Math.PI);
    const ll = smooth(0.012, 0.0, Math.abs(th - llTh)) * smooth(0.2, 0.3, s) * (1 - smooth(0.85, 0.95, s));
    c = mixc(c, [120, 130, 160], ll * 0.35);
    // 尾柄は暗め
    c = mixc(c, [40, 46, 62], smooth(0.88, 1.0, s) * 0.4);
    // 微細なまだらと鱗のきらめき
    const n = fbm(s * 70, th * 26);
    const f = 0.9 + 0.18 * n;
    c[0] *= f; c[1] *= f; c[2] *= f;
    const sp = hash2(Math.floor(s * 900), Math.floor(th * 260));
    if (sp > 0.992 && th < 1.7) { c[0] += 28; c[1] += 28; c[2] += 32; }
    if (seared) {
      // 藁焼き：表面が炙られて香ばしく
      const burn = 0.55 + 0.45 * fbm(s * 18 + 3, th * 9);
      const charM = smooth(0.62, 0.8, fbm(s * 30, th * 14 + 7));
      let sc = mixc(c, [150, 92, 54], 0.55 * burn);
      sc = mixc(sc, [36, 22, 14], charM * 0.7);
      c = mixc(c, sc, smooth(0.0, 0.08, s) * (1 - smooth(0.92, 1, s)) * 0.92);
    }
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  });
  return canvasTex(c);
}

export function makeBumpTexture() {
  const c = paintFishTexture(512, 256, (s, th, out) => {
    // 細かい鱗目
    const sc = Math.sin(s * 420 + Math.sin(th * 120) * 1.5) * Math.sin(th * 140 + s * 60);
    const v = 128 + sc * 22 + (fbm(s * 120, th * 60) - 0.5) * 40;
    out[0] = out[1] = out[2] = v;
  });
  return canvasTex(c, false);
}

const SABA_VARIANTS = {
  masaba: { back: [40, 96, 100], backTop: [22, 58, 68], bar: [10, 22, 28], belly: [232, 236, 240], side: [190, 204, 212], sesame: false },
  gomasaba: { back: [44, 88, 112], backTop: [24, 54, 76], bar: [14, 24, 34], belly: [222, 228, 234], side: [180, 192, 204], sesame: true, thin: true },
  kinka: { back: [92, 104, 54], backTop: [52, 64, 30], bar: [26, 28, 12], belly: [244, 222, 150], side: [230, 196, 110], sesame: false, gold: true },
  yaki: { back: [128, 74, 36], backTop: [70, 38, 18], bar: [40, 20, 10], belly: [200, 150, 96], side: [170, 112, 62], grill: true },
  miso: { back: [112, 58, 26], backTop: [70, 32, 14], bar: [52, 24, 10], belly: [150, 86, 40], side: [128, 70, 32], miso: true },
  shime: { back: [150, 170, 180], backTop: [100, 120, 135], bar: [60, 70, 80], belly: [240, 232, 228], side: [228, 214, 208] },
};

export function makeSabaTexture(variant = 'masaba', W = 512, H = 256) {
  const V = SABA_VARIANTS[variant];
  const c = paintFishTexture(W, H, (s, th, out) => {
    const silver = mixc(V.belly, V.side, Math.min(1, th / 1.6));
    const back = mixc(V.back, V.backTop, smooth(1.9, 2.9, th));
    let c = mixc(silver, back, smooth(1.55, 1.85, th));
    // 鯖特有の虫食い状の波模様
    const q = s * (V.thin ? 40 : 30) + 2.3 * Math.sin(th * 5.0 + s * 12) + 1.6 * (vnoise(s * 14, th * 6) - 0.5) * 3;
    const bars = smooth(V.thin ? 0.62 : 0.45, V.thin ? 0.85 : 0.72, Math.sin(q));
    const barMask = smooth(1.62, 1.88, th) * smooth(0.04, 0.1, s) * (1 - smooth(0.9, 1, s));
    c = mixc(c, V.bar, bars * barMask * 0.92);
    // 虹色
    const band = Math.exp(-(((th - 1.55) / 0.15) ** 2));
    if (!V.grill && !V.miso) {
      c[0] += band * (14 + 18 * Math.sin(s * 9)); c[1] += band * 12; c[2] += band * (26 + 14 * Math.cos(s * 6));
    }
    if (V.gold) {
      const g = Math.exp(-(((th - 1.4) / 0.35) ** 2));
      c[0] += g * 40; c[1] += g * 26; c[2] -= g * 20;
    }
    // ゴマ模様
    if (V.sesame && th < 1.55 && th > 0.25) {
      const gx = s * 90, gy = th * 26;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      const hx = hash2(cx, cy), hy = hash2(cy + 31, cx + 7);
      const dd = Math.hypot(gx - cx - 0.3 - hx * 0.4, (gy - cy - 0.3 - hy * 0.4) * 1.3);
      if (hash2(cx + 99, cy) > 0.45) c = mixc(c, [90, 96, 108], smooth(0.32, 0.18, dd) * 0.8);
    }
    // 頭部
    if (s < 0.22) {
      const sop = 0.18 - 0.03 * Math.cos(th - 1.2);
      const ln = smooth(0.008, 0.0, Math.abs(s - sop)) * smooth(0.3, 0.45, th) * (1 - smooth(2.2, 2.4, th));
      c = mixc(c, [V.bar[0] + 30, V.bar[1] + 30, V.bar[2] + 30], ln * 0.7);
      const mo = smooth(0.04, 0.0, Math.abs(th - (1.35 + s * 1.5))) * (1 - smooth(0.06, 0.085, s));
      c = mixc(c, [30, 26, 30], mo * 0.85);
    }
    // 焼き目
    if (V.grill) {
      const gq = Math.sin((s * 14 + th * 0.9) * Math.PI);
      const gm = smooth(0.82, 0.95, gq);
      c = mixc(c, [28, 14, 6], gm * 0.85);
      const shine = smooth(0.6, 0.9, fbm(s * 20, th * 10));
      c[0] += shine * 30; c[1] += shine * 18; c[2] += shine * 6;
    }
    if (V.miso) {
      const glaze = fbm(s * 16, th * 8);
      c = mixc(c, [170, 104, 50], smooth(0.55, 0.8, glaze) * 0.6);
    }
    const n = 0.9 + 0.2 * fbm(s * 50, th * 20);
    c[0] *= n; c[1] *= n; c[2] *= n;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  });
  return canvasTex(c);
}

export function makeFinTexture(base, ray) {
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, `rgb(${base[0]},${base[1]},${base[2]})`);
  g.addColorStop(1, `rgb(${base[0] * 0.7 | 0},${base[1] * 0.7 | 0},${base[2] * 0.7 | 0})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = `rgba(${ray[0]},${ray[1]},${ray[2]},0.7)`;
  ctx.lineWidth = 1.5;
  for (let x = 2; x < 128; x += 6) {
    ctx.beginPath(); ctx.moveTo(x, 128); ctx.lineTo(x + 4, 0); ctx.stroke();
  }
  return canvasTex(c);
}

// ---------------------------------------------------------------- モデル組み立て
let _katsuoCache = null;
function katsuoGeometries() {
  if (_katsuoCache) return _katsuoCache;
  const body = buildBody(KATSUO_PROFILE, 72, 36);
  const fins = buildFins(KATSUO_PROFILE, KATSUO_FINS);
  const H = s => profileAt(KATSUO_PROFILE, s, 1), Wd = s => profileAt(KATSUO_PROFILE, s, 2), CY = s => profileAt(KATSUO_PROFILE, s, 3);
  const es = 0.058, er = 0.021;
  const iris = [], pupil = [];
  for (const side of [1, -1]) {
    const ig = new THREE.SphereGeometry(er, 16, 12);
    ig.scale(1, 1, 0.55);
    ig.translate(0.5 - es, CY(es) + H(es) * 0.22, side * (Wd(es) * 0.86));
    iris.push(ig);
    const pg = new THREE.SphereGeometry(er * 0.62, 14, 10);
    pg.scale(1, 1, 0.5);
    pg.translate(0.5 - es + 0.001, CY(es) + H(es) * 0.22, side * (Wd(es) * 0.86 + er * 0.28));
    pupil.push(pg);
  }
  _katsuoCache = { body, fins, iris: mergeGeos(iris), pupil: mergeGeos(pupil) };
  return _katsuoCache;
}

// 鰹モデル：尾柄（握り）を原点、吻端が +Z 方向
// 指定サイズ・握り位置に変換した鰹のジオメトリ一式（インスタンス描画にも使う）
export function katsuoGeos(length = 1.8, grip = 0.97, gripOffset = 0) {
  const geos = katsuoGeometries();
  const xf = g => {
    const c = g.clone();
    c.scale(length, length, length);
    c.rotateY(-Math.PI / 2);
    c.translate(0, 0, (grip - 0.5) * length + gripOffset);
    return c;
  };
  return { body: xf(geos.body), fins: xf(geos.fins), iris: xf(geos.iris), pupil: xf(geos.pupil) };
}

export function buildKatsuo(mats, length = 1.8, grip = 0.97, gripOffset = 0) {
  const g = katsuoGeos(length, grip, gripOffset);
  const group = new THREE.Group();
  const body = new THREE.Mesh(g.body, mats.body);
  const fins = new THREE.Mesh(g.fins, mats.fin);
  const iris = new THREE.Mesh(g.iris, mats.iris);
  const pupil = new THREE.Mesh(g.pupil, mats.pupil);
  for (const m of [body, fins, iris, pupil]) { m.castShadow = true; group.add(m); }
  group.userData.length = length;
  return group;
}

export function makeKatsuoMaterials(env) {
  const map = makeKatsuoTexture(false);
  const bump = makeBumpTexture();
  const body = new THREE.MeshPhysicalMaterial({
    map, bumpMap: bump, bumpScale: 0.6, metalness: 0.42, roughness: 0.34,
    clearcoat: 1.0, clearcoatRoughness: 0.18, envMapIntensity: 1.25,
    iridescence: 0.35, iridescenceIOR: 1.4, sheen: 0.2, sheenColor: new THREE.Color(0x8899cc),
  });
  const fin = new THREE.MeshStandardMaterial({
    map: makeFinTexture([52, 58, 78], [24, 28, 40]), side: THREE.DoubleSide,
    metalness: 0.3, roughness: 0.45, transparent: true, opacity: 0.95,
  });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0xd8c890, metalness: 0.85, roughness: 0.25, clearcoat: 1 });
  const pupil = new THREE.MeshPhysicalMaterial({ color: 0x050507, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  return { body, fin, iris, pupil, rawMap: map, searedMap: null };
}

let _sabaCache = null;
export function sabaGeometry() {
  if (_sabaCache) return _sabaCache;
  const L = 1.4;
  const body = buildBody(SABA_PROFILE, 26, 14);
  const fins = buildFins(SABA_PROFILE, SABA_FINS);
  const H = s => profileAt(SABA_PROFILE, s, 1), Wd = s => profileAt(SABA_PROFILE, s, 2), CY = s => profileAt(SABA_PROFILE, s, 3);
  const es = 0.065, er = 0.024;
  const eyes = [];
  for (const side of [1, -1]) {
    const g = new THREE.SphereGeometry(er, 8, 6);
    g.scale(1, 1, 0.55);
    g.translate(0.5 - es, CY(es) + H(es) * 0.2, side * Wd(es) * 0.85);
    eyes.push(g);
  }
  const eyeG = mergeGeos(eyes);
  // 本体と鰭と目をグループ付きで統合（InstancedMesh 用）
  const merged = mergeGeos([body, fins, eyeG]);
  const bc = body.index.count, fc = fins.index.count, ec = eyeG.index.count;
  merged.addGroup(0, bc, 0);
  merged.addGroup(bc, fc, 1);
  merged.addGroup(bc + fc, ec, 2);
  merged.scale(L, L, L);
  merged.rotateY(-Math.PI / 2);
  merged.translate(0, 0, 0.1 * L);
  merged.computeBoundingSphere();
  _sabaCache = merged;
  return merged;
}

export function makeSabaMaterials(variant) {
  const finCol = variant === 'yaki' ? [90, 50, 26] : variant === 'miso' ? [80, 40, 18] : variant === 'kinka' ? [120, 120, 70] : [90, 110, 118];
  return [
    new THREE.MeshStandardMaterial({ map: makeSabaTexture(variant), metalness: variant === 'yaki' || variant === 'miso' ? 0.1 : 0.38, roughness: variant === 'miso' ? 0.22 : 0.38, envMapIntensity: 1.1 }),
    new THREE.MeshStandardMaterial({ map: makeFinTexture(finCol, finCol.map(v => v * 0.5)), side: THREE.DoubleSide, metalness: 0.2, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.5, roughness: 0.08 }),
  ];
}

// サバ缶
export function makeCanLabelTexture() {
  const c = makeCanvas(512, 256), ctx = c.getContext('2d');
  ctx.fillStyle = '#1d4f9c'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 70, 512, 116);
  ctx.fillStyle = '#d23a2a'; ctx.fillRect(0, 62, 512, 8); ctx.fillRect(0, 186, 512, 8);
  for (const ox of [0, 256]) {
    ctx.fillStyle = '#1d4f9c';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('さば', ox + 92, 128);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#d23a2a';
    ctx.fillText('水煮', ox + 92, 172);
    // 魚のシルエット
    ctx.fillStyle = '#2e6f78';
    ctx.beginPath();
    ctx.ellipse(ox + 190, 128, 46, 16, 0, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + 140, 128); ctx.lineTo(ox + 122, 108); ctx.lineTo(ox + 126, 128); ctx.lineTo(ox + 122, 148); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('SABA', ox + 128, 30);
    ctx.fillText('DHA・EPA', ox + 128, 226);
  }
  return canvasTex(c);
}
export function makeLidTexture() {
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, '#e8e8ea'); g.addColorStop(1, '#9a9ca2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(80,80,90,0.6)';
  for (let r = 14; r < 64; r += 9) { ctx.beginPath(); ctx.arc(64, 64, r, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = '#777'; ctx.fillRect(56, 30, 16, 26);
  return canvasTex(c);
}
export function canGeometry() {
  const g = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 22, 1);
  g.rotateZ(Math.PI / 2); // 軸を X 方向へ
  return g;
}
export function makeCanMaterials() {
  const lid = new THREE.MeshStandardMaterial({ map: makeLidTexture(), metalness: 0.9, roughness: 0.3 });
  return [
    new THREE.MeshStandardMaterial({ map: makeCanLabelTexture(), metalness: 0.25, roughness: 0.4 }),
    lid, lid,
  ];
}

// バッテラ（鯖の押し寿司）：酢飯＋しめ鯖＋白板昆布
export function batteraGeometry() {
  const rice = new THREE.BoxGeometry(0.5, 0.3, 1.0, 3, 2, 6);
  const top = new THREE.BoxGeometry(0.52, 0.07, 1.02); top.translate(0, 0.185, 0);
  const kombu = new THREE.BoxGeometry(0.44, 0.015, 0.94); kombu.translate(0, 0.228, 0);
  const m = mergeGeos([rice, top, kombu]);
  const a = rice.index.count, b = top.index.count, c = kombu.index.count;
  m.addGroup(0, a, 0); m.addGroup(a, b, 1); m.addGroup(a + b, c, 2);
  m.computeBoundingSphere();
  return m;
}
export function makeBatteraMaterials() {
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    ctx.fillStyle = `rgba(${200 + Math.random() * 40 | 0},${195 + Math.random() * 40 | 0},${180 + Math.random() * 30 | 0},0.9)`;
    ctx.beginPath(); ctx.ellipse(x, y, 4, 2.2, Math.random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return [
    new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: makeSabaTexture('shime', 256, 128), metalness: 0.3, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0xc8d890, roughness: 0.2, transparent: true, opacity: 0.75 }),
  ];
}

// 壊せる樽（アイテム入り）
export function taruGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const y = i / 10;
    pts.push(new THREE.Vector2(0.34 + Math.sin(y * Math.PI) * 0.07, y * 0.9));
  }
  const body = new THREE.LatheGeometry(pts, 14);
  const lid = new THREE.CircleGeometry(0.34, 14); lid.rotateX(-Math.PI / 2); lid.translate(0, 0.9, 0);
  const bands = [0.18, 0.72].map(y => {
    const t = new THREE.TorusGeometry(0.4 + Math.sin(y / 0.9 * Math.PI) * 0.06, 0.025, 4, 18);
    t.rotateX(Math.PI / 2); t.translate(0, y, 0); return t;
  });
  const wood = mergeGeos([body, lid]);
  const band = mergeGeos(bands);
  const m = mergeGeos([wood, band]);
  m.addGroup(0, wood.index.count, 0); m.addGroup(wood.index.count, band.index.count, 1);
  m.computeBoundingSphere();
  return m;
}
export function makeTaruMaterials() {
  const c = makeCanvas(128, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#9a6a3a'; ctx.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 11) {
    ctx.fillStyle = `rgba(${120 + Math.random() * 40 | 0},${80 + Math.random() * 30 | 0},40,0.5)`; ctx.fillRect(x, 0, 10, 64);
    ctx.fillStyle = 'rgba(50,30,10,0.6)'; ctx.fillRect(x + 10, 0, 1, 64);
  }
  ctx.fillStyle = '#c62828'; ctx.font = 'bold 26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('大漁', 64, 34);
  return [
    new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 }),
  ];
}
