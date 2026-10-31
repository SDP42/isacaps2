import { Evidence } from "@/components/landing/Evidence";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { HeroStory } from "@/components/landing/HeroStory";
import { Nav } from "@/components/landing/Nav";
import { Protection } from "@/components/landing/Protection";
import { Risk } from "@/components/landing/Risk";
import { Tribunal } from "@/components/landing/Tribunal";
import { useSmoothScroll } from "@/components/landing/useSmoothScroll";
import { Witnesses } from "@/components/landing/Witnesses";
import { useWorldDirector } from "@/components/landing/director";
import { lazy, Suspense } from "react";

const World = lazy(() => import("@/components/three/World"));

export default function Landing() {
  useSmoothScroll();
  useWorldDirector();
  return (
    <div className="grain relative bg-ink-0">
      <Suspense fallback={null}><World /></Suspense>
      <Nav />
      <main className="relative z-10">
        <HeroStory />
        <Evidence />
        <Witnesses />
        <Tribunal />
        <Risk />
        <Protection />
        <FinalCTA />
      </main>
    </div>
  );
}
