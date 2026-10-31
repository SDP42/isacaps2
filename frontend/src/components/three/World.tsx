import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { buildWorld } from "./worldTargets";

/**
 * Scroll-driven controls for the landing world. GSAP ScrollTrigger tweens these; the frame loop eases toward them.
 * morph: 0 face · 1 constellation · 2 tribunal · 3 shield · 4 lens
 */
export const world = {
  morph: 0,
  split: 0,
  dim: 0,
  x: 0.9,
  y: 0.05,
  scale: 0.66,
  spin: 0,
  scan: 1,
  active: -1, // highlighted witness ring
};

const vertex = /* glsl */ `
uniform float uTime, uMorph, uSplit, uReveal, uPixel, uScanY, uSize, uActive;
uniform vec3 uMouse;
attribute vec3 aRings, aNetwork, aShield, aLens;
attribute float aSeed, aShade, aGroup;
varying float vShade, vBand, vSide, vGroup, vMorph, vTurb;

float hash(float n){ return fract(sin(n)*43758.5453); }
vec3 pick(float i){
  if (i < 0.5) return position;
  if (i < 1.5) return aRings;
  if (i < 2.5) return aNetwork;
  if (i < 3.5) return aShield;
  return aLens;
}
void main(){
  float m = clamp(uMorph, 0.0, 4.0);
  float i0 = floor(m), fr = m - i0;
  // each particle leaves a little earlier or later, so forms dissolve rather than slide
  float delay = hash(aSeed*17.3) * 0.35;
  float t = smoothstep(delay, delay + 0.65, fr);
  vec3 a = pick(i0), b = pick(min(i0 + 1.0, 4.0));
  vec3 p = mix(a, b, t);
  float turb = sin(t * 3.14159);
  vTurb = turb;
  vec3 dir = normalize(vec3(hash(aSeed*91.7)-0.5, hash(aSeed*13.1)-0.5, hash(aSeed*57.3)-0.5));
  p += dir * turb * (0.35 + 0.4*hash(aSeed*3.7));

  float onFace = 1.0 - clamp(m, 0.0, 1.0);
  vSide = step(0.0, position.x) * onFace;
  // the Illusion: right half of the face drifts and turns synthetic
  float s = uSplit * vSide;
  p.x += s * (0.18 + 0.9*hash(aSeed*91.7)*hash(aSeed*91.7));
  p.y += s * (hash(aSeed*13.1) - 0.5) * 0.55;
  p.z += s * (hash(aSeed*57.3) - 0.5) * 0.9;

  // breathing + cursor lens on the face
  p.z += sin(uTime*1.1 + p.y*3.0) * 0.004;
  vec2 d = p.xy - uMouse.xy;
  float f = smoothstep(0.32, 0.0, length(d)) * onFace;
  p.xy += normalize(d + 1e-4) * f * 0.09;
  p.z += f * 0.12;

  // intro
  vec3 start = dir * (2.5 + 2.0*hash(aSeed*7.1));
  p = mix(start, p, uReveal);

  vShade = mix(aShade, 0.75, clamp(m, 0.0, 1.0));
  vGroup = aGroup;
  vMorph = m;
  vBand = exp(-pow((position.y - uScanY)/0.035, 2.0)) * onFace;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float act = (uActive >= 0.0 && abs(aGroup - uActive) < 0.5) ? 1.8 : 1.0;
  float size = uSize * (0.6 + 0.8*aSeed) * (1.0 + vBand*1.6 + f*1.2) * mix(1.0, act, clamp(m, 0.0, 1.0) * (1.0 - clamp(m - 1.0, 0.0, 1.0)));
  gl_PointSize = size * uPixel / -mv.z;
}`;

const fragment = /* glsl */ `
uniform float uSplit, uDim, uActive;
varying float vShade, vBand, vSide, vGroup, vMorph, vTurb;
vec3 witness(float g){
  if (g < 0.5) return vec3(0.40,0.91,0.98);
  if (g < 1.5) return vec3(0.65,0.55,0.98);
  if (g < 2.5) return vec3(0.98,0.75,0.14);
  if (g < 3.5) return vec3(0.98,0.44,0.52);
  if (g < 4.5) return vec3(0.43,0.91,0.72);
  return vec3(0.95,0.97,1.0);
}
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  vec3 cyan = vec3(0.40,0.91,0.98);
  vec3 face = mix(vec3(0.55,0.66,0.78), cyan, 0.25 + vShade*0.45) * (0.35 + 1.1*vShade);
  face = mix(face, vec3(0.99,0.44,0.52), vSide * uSplit);
  vec3 rings = witness(vGroup);
  if (uActive >= 0.0 && abs(vGroup - uActive) > 0.5 && vGroup < 4.5) rings *= 0.35;
  vec3 net = mix(vec3(0.65,0.55,0.98), vec3(0.99,0.44,0.52), step(4.5, vGroup));
  vec3 shield = vec3(0.43,0.91,0.72);
  vec3 lens = cyan;
  float m = vMorph;
  vec3 col = face;
  col = mix(col, rings, smoothstep(0.0, 1.0, m));
  col = mix(col, net, smoothstep(1.0, 2.0, m));
  col = mix(col, shield, smoothstep(2.0, 3.0, m));
  col = mix(col, lens, smoothstep(3.0, 4.0, m));
  col += vBand * vec3(0.55, 0.95, 1.0) * 0.9 + vTurb * vec3(0.2,0.3,0.5);
  float alpha = a * mix(0.25 + 0.85*vShade, 0.7, clamp(m, 0.0, 1.0)) * (1.0 - uDim);
  gl_FragColor = vec4(col, alpha);
}`;

function Particles({ density, interactive }: { density: number; interactive: boolean }) {
  const cloud = useMemo(() => buildWorld(density), [density]);
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { pointer, viewport, gl } = useThree();
  const moved = useRef(false);
  const s = useRef({ morph: 0, split: 0, dim: 0, x: world.x, y: world.y, scale: world.scale, spin: 0, reveal: 0, active: -1 });
  const target = useRef(new THREE.Vector3(9, 9, 0));

  useEffect(() => {
    const on = () => { moved.current = true; };
    window.addEventListener("pointermove", on, { once: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uMorph: { value: 0 }, uSplit: { value: 0 }, uDim: { value: 0 }, uReveal: { value: 0 },
    uMouse: { value: new THREE.Vector3(9, 9, 0) }, uPixel: { value: Math.min(gl.getPixelRatio(), 2) }, uScanY: { value: 0 },
    uSize: { value: 5.4 }, uActive: { value: -1 },
  }), [gl]);

  useFrame((_, dt) => {
    const m = mat.current;
    if (!m || !group.current || !inner.current) return;
    const k = 1 - Math.pow(0.0015, dt);
    const c = s.current;
    for (const key of ["morph", "split", "dim", "x", "y", "scale", "spin"] as const) c[key] += (world[key] - c[key]) * k;
    c.reveal += (1 - c.reveal) * k * 0.5;
    c.active = world.active;
    const u = m.uniforms;
    u.uTime.value += dt;
    u.uMorph.value = c.morph;
    u.uSplit.value = c.split;
    u.uDim.value = c.dim;
    u.uReveal.value = c.reveal;
    u.uActive.value = c.active;
    u.uScanY.value = world.scan > 0 ? 1.15 - ((u.uTime.value * 0.32) % 1) * 2.4 : 9;
    group.current.position.set(c.x * (viewport.width / 3.2), c.y, 0);
    group.current.scale.setScalar(c.scale);

    const t = u.uTime.value;
    const faceW = 1 - Math.min(1, c.morph);
    // the face follows the cursor; later forms rotate slowly on their own
    const yaw = faceW * (interactive && moved.current ? pointer.x * 0.35 - 0.25 : -0.25 + Math.sin(t * 0.25) * 0.12) + (1 - faceW) * (t * 0.12 + c.spin);
    const pitch = faceW * (interactive && moved.current ? -pointer.y * 0.12 : 0) + (1 - faceW) * (0.35 * Math.min(1, c.morph) - (c.morph > 2.5 && c.morph < 3.5 ? 0.25 : 0));
    inner.current.rotation.y += (yaw - inner.current.rotation.y) * k * 0.6;
    inner.current.rotation.x += (pitch - inner.current.rotation.x) * k * 0.6;
    if (interactive && moved.current) {
      const px = ((pointer.x * viewport.width) / 2 - group.current.position.x) / c.scale;
      const py = ((pointer.y * viewport.height) / 2 - group.current.position.y) / c.scale;
      target.current.set(px, py, 0);
      (u.uMouse.value as THREE.Vector3).lerp(target.current, k);
    }
  });

  return (
    <group ref={group}>
      <group ref={inner}>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[cloud.face, 3]} />
            <bufferAttribute attach="attributes-aRings" args={[cloud.rings, 3]} />
            <bufferAttribute attach="attributes-aNetwork" args={[cloud.network, 3]} />
            <bufferAttribute attach="attributes-aShield" args={[cloud.shield, 3]} />
            <bufferAttribute attach="attributes-aLens" args={[cloud.lens, 3]} />
            <bufferAttribute attach="attributes-aGroup" args={[cloud.group, 1]} />
            <bufferAttribute attach="attributes-aSeed" args={[cloud.seeds, 1]} />
            <bufferAttribute attach="attributes-aShade" args={[cloud.shade, 1]} />
          </bufferGeometry>
          <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>
    </group>
  );
}

function webgl(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Full-viewport, fixed canvas that lives behind every landing section. */
export default function World() {
  const reduced = useReducedMotion();
  const mobile = useMedia("(max-width: 767px)");
  const [density, setDensity] = useState(mobile ? 0.45 : 1);
  const [ok] = useState(webgl);
  if (!ok || reduced) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 3.4], fov: 38 }} gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        eventSource={document.getElementById("root") ?? undefined} eventPrefix="client">
        <PerformanceMonitor onDecline={() => setDensity((d) => Math.max(0.35, d * 0.7))} />
        <AdaptiveDpr pixelated />
        <Particles density={density} interactive={!mobile} />
      </Canvas>
    </div>
  );
}
