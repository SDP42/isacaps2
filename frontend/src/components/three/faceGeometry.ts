/**
 * Procedural human head sampled on horizontal scan lines, like a LIDAR capture.
 * Depth is an analytic height field: an ellipsoid skull with a tapered jaw, plus Gaussian features
 * (brow, eye sockets, nose bridge and tip, cheekbones, lips, chin). No mesh or model file is needed.
 */
const g = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

function halfWidth(y: number): number {
  // skull above, tapering jaw below
  if (y > 0.15) return 0.74 * Math.pow(Math.max(0, 1 - Math.pow((y - 0.15) / 1.0, 2.6)), 1 / 2.6); // rounder cranium
  const t = (0.15 - y) / 1.15;
  return 0.74 * (1 - 0.55 * Math.pow(Math.max(0, t), 1.7));
}

export function depthAt(x: number, y: number): number | null {
  if (y > 1.13 || y < -1.0) return null;
  const hw = halfWidth(y);
  if (Math.abs(x) > hw) return null;
  const u = x / hw;
  let z = 0.62 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.75 + 0.25 * Math.sqrt(Math.max(0, 1 - ((y - 0.1) / 1.15) ** 2)));
  const ax = Math.abs(x);
  z += 0.075 * g(ax, y, 0.26, 0.33, 0.22, 0.06); // brow ridge
  z -= 0.11 * g(ax, y, 0.27, 0.18, 0.13, 0.075); // eye sockets
  z += 0.035 * g(ax, y, 0.27, 0.17, 0.06, 0.035); // eyeballs
  z += 0.11 * g(x, y, 0, 0.12, 0.06, 0.16); // nose bridge
  z += 0.27 * g(x, y, 0, -0.14, 0.085, 0.13); // nose
  z += 0.09 * g(x, y, 0, -0.27, 0.12, 0.045); // nostrils
  z -= 0.04 * g(ax, y, 0.11, -0.27, 0.04, 0.03);
  z += 0.06 * g(ax, y, 0.43, 0.0, 0.14, 0.13); // cheekbones
  z -= 0.035 * g(ax, y, 0.38, -0.25, 0.1, 0.12); // cheek hollow
  z += 0.07 * g(x, y, 0, -0.44, 0.17, 0.035); // upper lip
  z -= 0.035 * g(x, y, 0, -0.49, 0.18, 0.012); // mouth line
  z += 0.06 * g(x, y, 0, -0.54, 0.14, 0.04); // lower lip
  z += 0.06 * g(x, y, 0, -0.8, 0.17, 0.09); // chin
  z -= 0.02 * g(x, y, 0, -0.66, 0.1, 0.04);
  return z;
}

export interface FaceCloud {
  positions: Float32Array;
  seeds: Float32Array;
  shade: Float32Array;
  count: number;
}

const LIGHT = (() => {
  const l = [-0.45, 0.55, 0.7];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

/** Lambert shading from the height field's surface normal, so features read as relief. */
function shadeAt(x: number, y: number, z: number): number {
  const e = 0.008;
  const zx = depthAt(x + e, y) ?? z;
  const zy = depthAt(x, y + e) ?? z;
  const nx = -(zx - z) / e, ny = -(zy - z) / e, nz = 1;
  const len = Math.hypot(nx, ny, nz);
  const d = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / len;
  return Math.pow(Math.max(0, d), 1.6);
}

export function buildFace(density = 1): FaceCloud {
  const pos: number[] = [];
  const seeds: number[] = [];
  const shade: number[] = [];
  const rowStep = 0.016 / Math.sqrt(density);
  const colStep = 0.0062 / Math.sqrt(density);
  let row = 0;
  for (let y = 1.13; y >= -1.0; y -= rowStep, row++) {
    const hw = halfWidth(y);
    const jitter = (row % 2) * colStep * 0.5;
    for (let x = -hw + jitter; x <= hw; x += colStep) {
      const z = depthAt(x, y);
      if (z == null) continue;
      // thin scan lines: drop a few points at random so the surface reads as sampled, not solid
      if (Math.random() < 0.12) continue;
      pos.push(x + (Math.random() - 0.5) * 0.002, y, z);
      seeds.push(Math.random());
      shade.push(shadeAt(x, y, z));
    }
    // neck
  }
  for (let y = -0.85; y > -1.55; y -= rowStep) {
    const hw = 0.3 + (y + 0.85) * -0.05;
    for (let x = -hw; x <= hw; x += colStep * 1.4) {
      if (Math.random() < 0.35) continue;
      const u = x / hw;
      pos.push(x, y, 0.25 * Math.sqrt(Math.max(0, 1 - u * u)) - 0.12);
      seeds.push(Math.random());
      shade.push(0.25 + 0.35 * Math.sqrt(Math.max(0, 1 - u * u)));
    }
  }
  return { positions: new Float32Array(pos), seeds: new Float32Array(seeds), shade: new Float32Array(shade), count: seeds.length };
}
