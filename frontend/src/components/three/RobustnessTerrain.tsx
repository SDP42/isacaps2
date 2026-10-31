import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";

export interface TerrainCell { attack: string; launder: string; score: number; caught: boolean }

const MINT = new THREE.Color("#6ee7b7");
const AMBER = new THREE.Color("#fbbf24");
const CRIMSON = new THREE.Color("#fb7185");

function colorFor(score: number) {
  // above the catch line: mint (caught); near it: amber; below: crimson (missed)
  return score >= 0.5 ? MINT.clone().lerp(AMBER, Math.max(0, 0.75 - score) * 1.6) : CRIMSON.clone();
}

/**
 * Robustness terrain: one bar per (scheme, laundering channel), height = detection score. The translucent plane at
 * 0.5 is the catch line, so anything that sinks below it is an attack that slipped through. Renders on demand only
 * (frameloop="demand"), so it costs nothing while idle.
 */
export default function RobustnessTerrain({ cells, attacks, launders, attackLabel, launderLabel }: {
  cells: TerrainCell[];
  attacks: string[];
  launders: string[];
  attackLabel: (k: string) => string;
  launderLabel: (k: string) => string;
}) {
  const [hover, setHover] = useState<TerrainCell | null>(null);
  const H = 3; // world height of a score of 1.0
  const gap = 1.25;
  const ox = ((launders.length - 1) * gap) / 2;
  const oz = ((attacks.length - 1) * gap) / 2;
  const bars = useMemo(() => cells.map((c) => ({
    c, x: launders.indexOf(c.launder) * gap - ox, z: attacks.indexOf(c.attack) * gap - oz,
    h: Math.max(0.04, c.score * H), color: colorFor(c.score),
  })), [cells, attacks, launders, ox, oz]);

  return (
    <div className="relative h-[420px] overflow-hidden rounded-xl border border-line bg-ink-1">
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [ox * 0.4, 11.5, oz + 9.5], fov: 40 }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 9, 4]} intensity={1.1} />
        <gridHelper args={[Math.max(launders.length, attacks.length) * gap + 2, Math.max(launders.length, attacks.length) + 2, "#18233b", "#111a2e"]} position={[0, 0, 0]} />
        {bars.map(({ c, x, z, h, color }) => (
          <mesh key={`${c.attack}-${c.launder}`} position={[x, h / 2, z]}
            onPointerOver={(e) => { e.stopPropagation(); setHover(c); }} onPointerOut={() => setHover(null)}>
            <boxGeometry args={[0.8, h, 0.8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover === c ? 0.55 : 0.18} roughness={0.5} />
          </mesh>
        ))}
        {/* the catch line */}
        <mesh position={[0, 0.5 * H, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[launders.length * gap + 0.6, attacks.length * gap + 0.6]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <lineSegments position={[0, 0.5 * H, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(launders.length * gap + 0.6, attacks.length * gap + 0.6)]} />
          <lineBasicMaterial color="#67e8f9" transparent opacity={0.7} />
        </lineSegments>
        {launders.map((l, i) => (
          <Html key={l} position={[i * gap - ox, 0, oz + 1.1]} center distanceFactor={9}>
            <span className="whitespace-nowrap font-mono text-[11px] text-muted">{launderLabel(l)}</span>
          </Html>
        ))}
        {attacks.map((a, i) => (
          <Html key={a} position={[-ox - 0.9, 0, i * gap - oz]} distanceFactor={11} style={{ transform: "translate(-100%, -50%)" }}>
            <span className="block w-[150px] text-right text-[11px] leading-tight text-silver">{attackLabel(a)}</span>
          </Html>
        ))}
        <OrbitControls enablePan={false} minDistance={6} maxDistance={22} maxPolarAngle={Math.PI / 2.15} makeDefault />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line bg-ink-0/80 px-3 py-2 text-[12px] backdrop-blur">
        {hover ? (
          <>
            <p className="text-fg">{attackLabel(hover.attack)}</p>
            <p className="text-muted">{launderLabel(hover.launder)} · score <span className={hover.caught ? "text-mint" : "text-crimson"}>{hover.score.toFixed(2)}</span> · {hover.caught ? "caught" : "missed"}</p>
          </>
        ) : (
          <p className="text-muted">Drag to orbit. Bars below the cyan catch line slipped past the detector.</p>
        )}
      </div>
    </div>
  );
}
