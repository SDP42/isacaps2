import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { ParticleFace } from "./ParticleFace";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Static fallback: a scan-line face silhouette in SVG for no-WebGL or reduced-motion visitors. */
function StaticFace() {
  const rows = Array.from({ length: 46 }, (_, i) => i);
  return (
    <svg viewBox="-1 -1.2 2 2.5" className="h-full w-full opacity-70" aria-hidden>
      {rows.map((i) => {
        const y = -1.05 + i * 0.047;
        const hw = y < -0.15 ? 0.74 * Math.sqrt(Math.max(0, 1 - ((y + 0.15) / 1.0) ** 2)) : 0.74 * (1 - 0.55 * Math.pow((y + 0.15) / 1.15, 1.7));
        return <line key={i} x1={-hw} x2={hw} y1={y} y2={y} stroke={i % 9 === 0 ? "#67e8f9" : "#8ea3b8"} strokeWidth="0.006" strokeDasharray="0.01 0.008" />;
      })}
    </svg>
  );
}

export default function HeroCanvas({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const mobile = useMedia("(max-width: 767px)");
  const [density, setDensity] = useState(mobile ? 0.45 : 1);
  const [gl] = useState(webglAvailable);

  if (!gl || reduced) return <div className={className}><StaticFace /></div>;
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 3.4], fov: 38 }}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <PerformanceMonitor onDecline={() => setDensity((d) => Math.max(0.35, d * 0.7))} />
        <AdaptiveDpr pixelated />
        <group position={[mobile ? 0 : 0.9, mobile ? 0.3 : 0.06, 0]} scale={mobile ? 0.58 : 0.64}>
          <ParticleFace density={density} interactive={!mobile} />
        </group>
      </Canvas>
    </div>
  );
}
