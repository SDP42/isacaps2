import { ArrowRight, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import Aurora from "@/components/reactbits/Aurora";
import CircularText from "@/components/reactbits/CircularText";

export function FinalCTA() {
  return (
    <section id="finale" className="relative overflow-hidden pb-10 pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <Aurora colorStops={["#0891b2", "#6d28d9", "#67e8f9"]} amplitude={0.9} blend={0.6} speed={0.6} />
      </div>
      <div className="relative mx-auto max-w-[1400px] px-4 text-center sm:px-8">
        <h2 data-split className="mx-auto max-w-[18ch] text-[clamp(2.6rem,6.4vw,6rem)] font-medium leading-[0.95] tracking-[-0.045em]">
          Before you trust the request,{" "}
          <span className="font-serif font-normal italic text-cyan">investigate the evidence.</span>
        </h2>
        <div className="mx-auto mt-10 w-fit opacity-80">
          <CircularText text="MIRAGE • FIVE WITNESSES • ONE TRIBUNAL • " size={120} fontSize={9.5} color="#67e8f9" spinDuration={22} onHover="slowDown" />
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button to="/auth" size="lg" magnetic icon={<ArrowRight size={17} />} className="flex-row-reverse">Investigate a file</Button>
          <Button to="/auth" variant="outline" size="lg" magnetic icon={<FlaskConical size={16} />}>Run a scenario</Button>
        </div>

        <footer className="mt-32 grid gap-10 border-t border-line pt-10 text-left sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-muted">
              Multimodal Impersonation &amp; Request-Aware Guard Engine. Team Outliers, DJSCE, for D3COY 1.0 · DJS ISACA ·
              PS-02.
            </p>
          </div>
          <div className="space-y-2 text-[13.5px] text-muted">
            <p className="label mb-3">Product</p>
            <p>Five witnesses</p>
            <p>The Tribunal</p>
            <p>Trustbook &amp; Identity Graph</p>
            <p>Incident reports</p>
          </div>
          <div className="space-y-2 text-[13.5px] text-muted">
            <p className="label mb-3">If you were targeted</p>
            <p>National helpline <span className="font-mono text-fg">1930</span></p>
            <p>cybercrime.gov.in</p>
            <p>incident@cert-in.org.in</p>
          </div>
          <p className="font-mono text-[11px] text-dim sm:col-span-3">
            All demo media is synthetic and labelled. Detection is evidence, not proof; MIRAGE always recommends independent verification.
          </p>
        </footer>
      </div>
    </section>
  );
}
