import { AudioLines, FileQuestion, Image as ImageIcon, Loader2, MessageSquareText, Share2, Smartphone, Upload, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/kit/StateKit";
import { SEVERITY_COLOR, WhatNow, type ResponsePlan } from "@/components/app/WhatNow";
import { Button } from "@/components/ui/Button";
import { PanelHead } from "@/components/ui/primitives";
import { post } from "@/lib/api";

type Kind = "voice" | "media" | "text";
interface Checked { kind: Kind; name: string; status: "running" | "done" | "error"; severity?: string; headline?: string; detail?: string; plan?: ResponsePlan; error?: string }

const ICON = { voice: AudioLines, media: ImageIcon, text: MessageSquareText };
const kindOf = (f: File): Kind | null =>
  /^audio\//.test(f.type) || /\.(ogg|opus|m4a|aac|amr|mp3|wav|weba)$/i.test(f.name) ? "voice" : /^(image|video)\//.test(f.type) ? "media" : null;

async function check(item: { kind: Kind; file?: File; text?: string }): Promise<Omit<Checked, "name" | "kind" | "status">> {
  if (item.kind === "text") {
    const r = await post<{ severity: string; semantics: { category_label: string; summary: string }; response: ResponsePlan }>("/v1/quick/text", { text: item.text });
    return { severity: r.severity, headline: r.semantics.category_label, detail: r.semantics.summary, plan: r.response };
  }
  const fd = new FormData();
  fd.append("file", item.file!);
  if (item.kind === "voice") {
    const r = await post<{ stage1: { label: string }; stage3: { severity: string; why: string }; response: ResponsePlan }>("/v1/voice/triage", fd);
    return { severity: r.stage3.severity, headline: r.stage1.label, detail: r.stage3.why, plan: r.response };
  }
  const r = await post<{ label: string; summary: string; response: ResponsePlan }>("/v1/quick/media", fd);
  return { severity: r.response.severity, headline: r.label, detail: r.summary, plan: r.response };
}

/**
 * Where Android's share sheet lands ("Share → MIRAGE" once the app is installed from the browser): each shared voice
 * note, image, video or text is checked at once and answered with the same "what now" plan as the rest of MIRAGE.
 */
export default function Share() {
  const [items, setItems] = useState<Checked[]>([]);
  const [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = (queue: { kind: Kind; name: string; file?: File; text?: string }[]) => {
    setItems(queue.map((q) => ({ kind: q.kind, name: q.name, status: "running" })));
    queue.forEach((q, i) => {
      check(q).then(
        (r) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...r, status: "done" } : x))),
        (e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, status: "error", error: (e as Error).message } : x))),
      );
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const cache = await caches.open("mirage-share");
        const meta = await cache.match("/share-inbox/meta");
        if (!meta) return;
        const m: { items: { key: string; name: string; type: string }[]; text: string } = await meta.json();
        const queue: { kind: Kind; name: string; file?: File; text?: string }[] = [];
        for (const it of m.items) {
          const res = await cache.match(it.key);
          if (!res) continue;
          const f = new File([await res.blob()], it.name || "shared", { type: it.type });
          const k = kindOf(f);
          if (k) queue.push({ kind: k, name: f.name, file: f });
        }
        if (m.text.length >= 8) queue.push({ kind: "text", name: "Shared text", text: m.text });
        for (const k of await cache.keys()) await cache.delete(k); // shared content is checked once, then dropped
        if (queue.length) run(queue);
      } catch {
        /* no Cache API (private mode): picking a file still works */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const pick = (files: FileList | null) => {
    const q = [...(files ?? [])].map((f) => ({ f, k: kindOf(f) })).filter((x) => x.k).map((x) => ({ kind: x.k!, name: x.f.name, file: x.f }));
    if (q.length) run(q);
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-[26px] font-medium tracking-tight">Shared to MIRAGE</h1>
        <p className="text-[13.5px] text-muted">Voice notes, screenshots, videos and messages shared from your phone, checked as they arrive.</p>
      </header>
      <input ref={input} type="file" multiple hidden accept="audio/*,image/*,video/*,.ogg,.opus,.m4a" onChange={(e) => pick(e.target.files)} />
      {loaded && !items.length && (
        <section className="panel">
          <EmptyState icon={Share2} title="Nothing was shared yet."
            hint={<>On Android, open MIRAGE in Chrome and choose <span className="text-silver">Add to Home screen</span>. MIRAGE then appears in the share sheet: in WhatsApp, long-press a voice note, tap Share, pick MIRAGE.</>}
            action={<Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => input.current?.click()}>Pick a file instead</Button>} />
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-[12px] text-dim"><Smartphone size={13} />Sharing needs the installed app on Android (Chrome 89 or later), served over https or localhost.</p>
        </section>
      )}
      {items.map((it, i) => {
        const Icon = it.kind === "media" && /\.(mp4|mov|webm)$/i.test(it.name) ? Video : ICON[it.kind];
        const c = it.severity ? SEVERITY_COLOR[it.severity] ?? "var(--color-silver)" : "var(--color-silver)";
        return (
          <section key={i} className="panel overflow-hidden">
            <PanelHead title={it.name} right={it.status === "running" ? <Loader2 size={14} className="animate-spin text-cyan" /> : <Icon size={14} className="text-dim" />} />
            {it.status === "running" && <p className="px-5 py-4 text-[13px] text-muted">Checking {it.kind === "voice" ? "the voice and what it asks for" : it.kind === "text" ? "the message" : "for AI generation and face swaps"}…</p>}
            {it.status === "error" && <EmptyState icon={FileQuestion} title="This one could not be checked." hint={it.error} />}
            {it.status === "done" && (
              <div className="space-y-4 p-4">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.12em]" style={{ color: c }}>{it.severity}</p>
                  <p className="text-[17px] text-fg">{it.headline}</p>
                  {it.detail && <p className="mt-1 text-[13px] leading-relaxed text-muted">{it.detail}</p>}
                </div>
                {it.plan && <WhatNow plan={it.plan} compact />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
