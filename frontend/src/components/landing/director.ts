import { useEffect } from "react";
import { SplitText } from "gsap/SplitText";
import { world } from "@/components/three/World";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { gsap, ScrollTrigger } from "./useSmoothScroll";

gsap.registerPlugin(SplitText);

type Pose = Partial<typeof world>;

/**
 * Scroll director: each section owns a scroll range over which the particle world travels to that section's pose.
 * Poses are placed where the section's content is not, so the 3D always frames the copy instead of fighting it.
 */
export function useWorldDirector() {
  const reduced = useReducedMotion();
  const mobile = useMedia("(max-width: 1023px)");

  useEffect(() => {
    if (reduced) return;
    const m = mobile;
    const poses: [string, Pose][] = [
      ["evidence", { morph: 1, split: 0, dim: 0.45, x: m ? 0 : 0.78, y: m ? 0.55 : 0.32, scale: m ? 0.5 : 0.62, spin: 0.6 }],
      ["witnesses", { morph: 1, dim: 0.05, x: m ? 0 : 0.6, y: m ? -0.35 : -0.05, scale: m ? 0.55 : 0.8, spin: 1.4 }],
      ["tribunal", { morph: 2, dim: 0.45, x: m ? 0 : -0.62, y: m ? 0.4 : -0.1, scale: m ? 0.6 : 0.95, spin: 0 }],
      ["risk", { morph: 2, dim: 0.88, x: 0, y: 0, scale: 0.9 }],
      ["protection", { morph: 3, dim: 0.25, x: m ? 0 : 0.62, y: m ? -0.2 : -0.05, scale: m ? 0.55 : 0.78, spin: 0.4 }],
      ["finale", { morph: 4, dim: 0.35, x: 0, y: 0.18, scale: m ? 0.62 : 0.85, spin: 0 }],
    ];
    const triggers: ScrollTrigger[] = [];
    let prev: Pose = { morph: 0, split: 1, dim: 0.6, x: world.x, y: world.y, scale: world.scale, spin: 0 };
    for (const [id, pose] of poses) {
      const el = document.getElementById(id);
      if (!el) continue;
      const from = { ...prev };
      const to = { ...prev, ...pose };
      const tween = gsap.fromTo(world, from, { ...to, ease: "none", immediateRender: false });
      tween.pause();
      triggers.push(ScrollTrigger.create({
        trigger: el, start: "top 85%", end: "top 15%", scrub: 1,
        onUpdate: (self) => tween.progress(self.progress),
      }));
      prev = to;
    }

    // word-by-word mask reveals for every section heading
    const splits: SplitText[] = [];
    document.querySelectorAll<HTMLElement>("[data-split]").forEach((h) => {
      const st = new SplitText(h, { type: "words", mask: "words" });
      splits.push(st);
      triggers.push(ScrollTrigger.create({
        trigger: h, start: "top 85%", once: true,
        onEnter: () => gsap.from(st.words, { yPercent: 110, opacity: 0, duration: 0.9, stagger: 0.045, ease: "expo.out" }),
      }));
    });
    // soft rise for supporting copy
    document.querySelectorAll<HTMLElement>("[data-rise]").forEach((el) => {
      triggers.push(ScrollTrigger.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: () => gsap.from(el, { y: 28, opacity: 0, filter: "blur(6px)", duration: 1, ease: "expo.out" }),
      }));
    });
    ScrollTrigger.refresh();
    return () => {
      triggers.forEach((t) => t.kill());
      splits.forEach((s) => s.revert());
    };
  }, [reduced, mobile]);
}
