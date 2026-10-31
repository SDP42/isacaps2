import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildFace } from "./faceGeometry";

/** Shared, mutable scene controls. GSAP ScrollTrigger writes targets; the frame loop lerps toward them. */
export const faceControls = {
  split: 0, // 0 = whole face, 1 = right half synthetic and scattered
  dissolve: 0, // 0..1 whole face fragments outward
  scan: 1, // scan band intensity
  dim: 0, // fade the whole cloud
  rotate: 0, // extra yaw driven by scroll
};

const vertex = /* glsl */ `
uniform float uTime;
uniform float uSplit;
uniform float uDissolve;
uniform float uReveal;
uniform vec3 uMouse;
uniform float uPixel;
uniform float uScanY;
uniform float uSize;
attribute float aSeed;
attribute float aShade;
varying float vShade;
varying float vBand;
varying float vSide;
varying float vSeed;
varying float vDepth;

float hash(float n){ return fract(sin(n)*43758.5453); }

void main(){
  vec3 p = position;
  vSeed = aSeed;
  vShade = aShade;
  vSide = step(0.0, p.x);
  // breathing
  p.z += sin(uTime*1.1 + p.y*3.0)*0.004;
  // cursor repulsion: a lens pushing the surface aside
  vec2 d = p.xy - uMouse.xy;
  float f = smoothstep(0.32, 0.0, length(d));
  p.xy += normalize(d + 1e-4) * f * 0.09;
  p.z += f * 0.12;
  // real/synthetic split: the right half drifts and scatters
  float s = uSplit * vSide;
  float r1 = hash(aSeed*91.7), r2 = hash(aSeed*13.1), r3 = hash(aSeed*57.3);
  p.x += s * (0.18 + 0.9*r1*r1);
  p.y += s * (r2 - 0.5) * 0.55;
  p.z += s * (r3 - 0.5) * 0.9;
  // dissolve everything into a field of fragments
  vec3 dir = normalize(vec3(r1-0.5, r2-0.5, r3-0.3));
  p += dir * uDissolve * (0.6 + 1.6*r1);
  // intro: points converge from a scattered cloud
  vec3 start = vec3((r1-0.5)*6.0, (r2-0.5)*4.0, (r3-0.5)*4.0);
  p = mix(start, p, uReveal);

  vBand = exp(-pow((position.y - uScanY)/0.035, 2.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = position.z;
  gl_Position = projectionMatrix * mv;
  float size = uSize * (0.6 + 0.8*aSeed) * (1.0 + vBand*1.6 + f*1.2);
  gl_PointSize = size * uPixel / -mv.z;
}`;

const fragment = /* glsl */ `
uniform float uSplit;
uniform float uDim;
uniform vec3 uCyan;
uniform vec3 uCrimson;
uniform vec3 uWarm;
varying float vBand;
varying float vSide;
varying float vSeed;
varying float vDepth;
varying float vShade;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  vec3 base = mix(vec3(0.55,0.66,0.78), uCyan, 0.25 + vShade*0.45);
  base *= 0.35 + 1.1*vShade;
  // a warm key light on the brow and cheek, like the concept render
  base = mix(base, uWarm, smoothstep(0.75, 1.0, vShade) * 0.35);
  vec3 col = mix(base, uCrimson, vSide * uSplit);
  col += vBand * vec3(0.55, 0.95, 1.0) * 0.9;
  float alpha = a * (0.25 + 0.85*vShade + vBand*0.7) * (1.0 - uDim);
  gl_FragColor = vec4(col, alpha);
}`;

export function ParticleFace({ density = 1, interactive = true }: { density?: number; interactive?: boolean }) {
  const cloud = useMemo(() => buildFace(density), [density]);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const mouseTarget = useRef(new THREE.Vector3(9, 9, 0));
  const { pointer, viewport, gl } = useThree();
  const state = useRef({ split: 0, dissolve: 0, dim: 0, reveal: 0, yaw: 0 });
  const moved = useRef(false);
  useEffect(() => {
    const on = () => { moved.current = true; };
    window.addEventListener("pointermove", on, { once: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSplit: { value: 0 },
      uDissolve: { value: 0 },
      uReveal: { value: 0 },
      uDim: { value: 0 },
      uMouse: { value: new THREE.Vector3(9, 9, 0) },
      uPixel: { value: Math.min(gl.getPixelRatio(), 2) * 1.0 },
      uScanY: { value: 0 },
      uSize: { value: 5.6 },
      uCyan: { value: new THREE.Color("#67e8f9") },
      uCrimson: { value: new THREE.Color("#fb7185") },
      uWarm: { value: new THREE.Color("#fde68a") },
    }),
    [gl],
  );

  useFrame((_, dt) => {
    const m = mat.current;
    if (!m || !group.current) return;
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent lerp
    const s = state.current;
    s.split += (faceControls.split - s.split) * k * 0.9;
    s.dissolve += (faceControls.dissolve - s.dissolve) * k * 0.9;
    s.dim += (faceControls.dim - s.dim) * k;
    s.reveal += (1 - s.reveal) * k * 0.55;
    s.yaw += (faceControls.rotate - s.yaw) * k * 0.6;
    m.uniforms.uTime.value += dt;
    m.uniforms.uSplit.value = s.split;
    m.uniforms.uDissolve.value = s.dissolve;
    m.uniforms.uDim.value = s.dim;
    m.uniforms.uReveal.value = s.reveal;
    const t = m.uniforms.uTime.value;
    m.uniforms.uScanY.value = faceControls.scan > 0 ? 1.15 - ((t * 0.32) % 1) * 2.4 : 9;

    if (interactive && moved.current) {
      // project the pointer onto the face plane (local space)
      const px = (pointer.x * viewport.width) / 2 / group.current.scale.x - group.current.position.x / group.current.scale.x;
      const py = (pointer.y * viewport.height) / 2 / group.current.scale.y - group.current.position.y / group.current.scale.y;
      mouseTarget.current.set(px, py, 0);
      (m.uniforms.uMouse.value as THREE.Vector3).lerp(mouseTarget.current, k);
      group.current.rotation.y += ((pointer.x * 0.35 - 0.25 + s.yaw) - group.current.rotation.y) * k * 0.5;
      group.current.rotation.x += ((-pointer.y * 0.12) - group.current.rotation.x) * k * 0.5;
    } else {
      group.current.rotation.y = -0.25 + Math.sin(t * 0.25) * 0.15 + s.yaw;
    }
  });

  return (
    <group ref={group}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[cloud.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[cloud.seeds, 1]} />
          <bufferAttribute attach="attributes-aShade" args={[cloud.shade, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={mat}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
