import { Evidence } from "@/components/landing/Evidence";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { HeroStory } from "@/components/landing/HeroStory";
import { Nav } from "@/components/landing/Nav";
import { Protection } from "@/components/landing/Protection";
import { Risk } from "@/components/landing/Risk";
import { Tribunal } from "@/components/landing/Tribunal";
import { useSmoothScroll } from "@/components/landing/useSmoothScroll";
import { Witnesses } from "@/components/landing/Witnesses";

export default function Landing() {
  useSmoothScroll();
  return (
    <div className="grain relative bg-ink-0">
      <Nav />
      <main>
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
