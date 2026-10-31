/**
 * Morph targets for the landing-page particle world. Every target has exactly as many points as the face, so the
 * shader can interpolate any particle between forms:
 *   0 face (scan-line head)  1 constellation (five witness rings)  2 tribunal (agent network)
 *   3 shield (dome)          4 lens (the MIRAGE mark)
 */
import { buildFace } from "./faceGeometry";

export interface WorldCloud {
  count: number;
  face: Float32Array;
  rings: Float32Array;
  network: Float32Array;
  shield: Float32Array;
  lens: Float32Array;
  group: Float32Array; // witness ring index 0..4 (colours the constellation)
  seeds: Float32Array;
  shade: Float32Array;
}

const TAU = Math.PI * 2;

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildWorld(density = 1): WorldCloud {
  const f = buildFace(density);
  const n = f.count;
  const r = rand(7);
  const rings = new Float32Array(n * 3);
  const network = new Float32Array(n * 3);
  const shield = new Float32Array(n * 3);
  const lens = new Float32Array(n * 3);
  const group = new Float32Array(n);

  // 1 · five tilted witness rings around a small core
  const tilts = [[0.2, 0], [1.1, 0.6], [-0.9, 1.3], [0.5, 2.2], [-0.3, 2.9]];
  for (let i = 0; i < n; i++) {
    const g = i % 6; // 5 rings + core
    if (g === 5) {
      const u = r() * TAU, v = Math.acos(2 * r() - 1), rr = 0.22 * Math.cbrt(r());
      rings.set([rr * Math.sin(v) * Math.cos(u), rr * Math.sin(v) * Math.sin(u), rr * Math.cos(v)], i * 3);
      group[i] = 5;
      continue;
    }
    const [tx, ty] = tilts[g];
    const a = r() * TAU, rad = 0.55 + g * 0.13 + (r() - 0.5) * 0.025;
    let x = Math.cos(a) * rad, y = (r() - 0.5) * 0.02, z = Math.sin(a) * rad;
    // tilt around X then Y
    const y1 = y * Math.cos(tx) - z * Math.sin(tx), z1 = y * Math.sin(tx) + z * Math.cos(tx);
    const x2 = x * Math.cos(ty) + z1 * Math.sin(ty), z2 = -x * Math.sin(ty) + z1 * Math.cos(ty);
    x = x2; y = y1; z = z2;
    rings.set([x, y, z], i * 3);
    group[i] = g;
  }

  // 2 · tribunal: eight agent nodes on an arc, a central case, links between them
  const nodes: [number, number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * (0.08 + (k / 7) * 0.84);
    nodes.push([Math.cos(a) * 0.95, Math.sin(a) * 0.62 - 0.25, (k % 2 ? 0.12 : -0.12)]);
  }
  const core: [number, number, number] = [0, -0.25, 0];
  for (let i = 0; i < n; i++) {
    const kind = r();
    if (kind < 0.42) {
      // node clusters (and the core, larger)
      const k = Math.floor(r() * 9);
      const c = k === 8 ? core : nodes[k];
      const rr = (k === 8 ? 0.16 : 0.07) * Math.cbrt(r());
      const u = r() * TAU, v = Math.acos(2 * r() - 1);
      network.set([c[0] + rr * Math.sin(v) * Math.cos(u), c[1] + rr * Math.sin(v) * Math.sin(u), c[2] + rr * Math.cos(v)], i * 3);
    } else {
      // links: agent → core, plus the skeptic's counter-link between neighbours
      const k = Math.floor(r() * 8);
      const a = nodes[k];
      const b = r() < 0.8 ? core : nodes[(k + 1) % 8];
      const t = r();
      const bow = Math.sin(t * Math.PI) * 0.08;
      network.set([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + bow, a[2] + (b[2] - a[2]) * t + (r() - 0.5) * 0.01], i * 3);
    }
  }

  // 3 · shield: a dome shell with a faint lattice
  for (let i = 0; i < n; i++) {
    const u = r() * TAU;
    const v = Math.acos(r() * 0.98); // upper hemisphere
    const rad = 0.95 + (r() < 0.15 ? (r() - 0.5) * 0.06 : 0);
    const lat = Math.round(v / 0.12) * 0.12; // latitude bands
    const vv = r() < 0.55 ? lat : v;
    shield.set([rad * Math.sin(vv) * Math.cos(u), rad * Math.cos(vv) - 0.45, rad * Math.sin(vv) * Math.sin(u)], i * 3);
  }

  // 4 · lens: concentric rings like the logo, right half dashed
  for (let i = 0; i < n; i++) {
    const ring = r();
    const rad = ring < 0.45 ? 0.95 : ring < 0.75 ? 0.58 : ring < 0.9 ? 0.3 * Math.sqrt(r()) : 1.12;
    const a = r() * TAU;
    const dashed = Math.cos(a) > 0 && rad > 0.9 && Math.floor((a / TAU) * 60) % 2 === 0;
    lens.set([Math.cos(a) * rad * (dashed ? 1.04 : 1), Math.sin(a) * rad, (r() - 0.5) * 0.03], i * 3);
  }

  return { count: n, face: f.positions, rings, network, shield, lens, group, seeds: f.seeds, shade: f.shade };
}
