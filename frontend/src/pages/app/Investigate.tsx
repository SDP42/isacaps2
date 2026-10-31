import { ArrowRight, AudioLines, FileText, Image as ImageIcon, Mic, Square, Trash2, Upload, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ProcessingView } from "@/components/app/ProcessingView";
import { decodePeaks, Waveform } from "@/components/app/Waveform";
import { Button } from "@/components/ui/Button";
import { BandPill, RiskRing } from "@/components/ui/primitives";
import { post } from "@/lib/api";
import { bytes, cx } from "@/lib/format";
import { useApi, useLiveCase } from "@/lib/hooks";
import type { CaseSummary } from "@/lib/types";

interface Item {
  id: string;
  file: File;
  kind: "audio" | "video" | "image" | "text";
  sha?: string;
  url?: string;
  peaks?: { peaks: number[]; duration: number } | null;
}

const CHANNELS = ["whatsapp", "phone", "video", "email", "sms", "teams", "unknown"] as const;
const KIND_ICON = { audio: AudioLines, video: Video, image: ImageIcon, text: FileText };
const ACCEPT = "audio/*,video/*,image/*,.txt,.eml,.wav,.mp3,.m4a,.ogg,.opus,.webm,.mp4,.png,.jpg,.jpeg,.webp";

function kindOf(f: File): Item["kind"] {
  if (f.type.startsWith("audio") || /\.(wav|mp3|m4a|ogg|opus|weba|flac)$/i.test(f.name)) return "audio";
  if (f.type.startsWith("video") || /\.(mp4|webm|mov|avi)$/i.test(f.name)) return "video";
  if (f.type.startsWith("image")) return "image";
  return "text";
}

async function sha256(f: File) {
  const d = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Recorder({ onDone }: { onDone: (f: File) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (!rec) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [rec]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onDone(new File(chunks.current, `voice-note-${Date.now()}.weba`, { type: "audio/webm" }));
      };
      mr.start();
      setSecs(0);
      setRec(mr);
    } catch {
      toast.error("Microphone permission was denied.");
    }
  };
  const stop = () => {
    rec?.stop();
    setRec(null);
  };
  return rec ? (
    <button onClick={stop} className="flex items-center gap-2 rounded-full border border-crimson/50 bg-crimson/10 px-3 py-1.5 text-[12.5px] text-crimson">
      <Square size={11} className="fill-current" /> Stop · {secs}s
    </button>
  ) : (
    <button onClick={start} className="flex items-center gap-2 rounded-full border border-line-2 px-3 py-1.5 text-[12.5px] text-silver hover:border-cyan/40 hover:text-fg">
      <Mic size={13} /> Record a voice note
    </button>
  );
}

export default function Investigate() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const caseId = params.get("case") ?? undefined;
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [sender, setSender] = useState("");
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState<string>("whatsapp");
  const [when, setWhen] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data: people } = useApi<{ name: string; role: string; circle: string; phone: string }[]>("/v1/identity/people");
  const { detail, live } = useLiveCase(caseId);

  const suggestions = useMemo(() => {
    if (!people || !sender) return [];
    const q = sender.toLowerCase();
    return people.filter((p) => `${p.name} ${p.role}`.toLowerCase().includes(q)).slice(0, 5);
  }, [people, sender]);

  const add = async (files: FileList | File[]) => {
    const next: Item[] = [...files].map((f) => ({ id: crypto.randomUUID(), file: f, kind: kindOf(f), url: URL.createObjectURL(f) }));
    setItems((s) => [...s, ...next]);
    for (const it of next) {
      const [sha, peaks] = await Promise.all([sha256(it.file), it.kind === "audio" || it.kind === "video" ? decodePeaks(it.file) : Promise.resolve(null)]);
      if (it.kind === "text" && it.file.size < 200_000) {
        const t = await it.file.text();
        setText((x) => (x ? `${x}\n\n${t}` : t));
      }
      setItems((s) => s.map((x) => (x.id === it.id ? { ...x, sha, peaks } : x)));
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length && (e.target as HTMLElement)?.tagName !== "TEXTAREA") add(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const submit = async () => {
    if (!items.length && !text.trim()) {
      toast.error("Add a file or paste the message you received.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    items.forEach((i) => fd.append("files", i.file, i.file.name));
    fd.append("message", text);
    fd.append("claimed_sender", sender);
    fd.append("sender_contact", contact);
    fd.append("channel", channel);
    fd.append("received_at", new Date(when).toISOString());
    try {
      const c = await post<CaseSummary>("/v1/cases", fd);
      toast.success(`${c.id} opened. Witnesses are analysing.`);
      setParams({ case: c.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- live processing view after submit ------------------------------------------------------------------------
  if (caseId) {
    const done = detail?.status === "complete" && detail.verdict;
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-dim">{caseId}</p>
            <h1 className="text-[24px] font-medium tracking-tight">{detail?.title ?? "Opening case…"}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setParams({}); setItems([]); setText(""); }}>New investigation</Button>
            {done && <Button size="sm" icon={<ArrowRight size={14} />} className="flex-row-reverse" onClick={() => nav(`/app/cases/${caseId}`)}>Open the verdict</Button>}
          </div>
        </div>
        <AnimatePresence>
          {done && detail?.verdict && (
            <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onClick={() => nav(`/app/cases/${caseId}`)}
              className="panel flex w-full flex-wrap items-center gap-6 p-5 text-left transition-colors hover:border-line-2">
              <RiskRing risk={detail.verdict.risk} band={detail.verdict.band} size={120} stroke={8} />
              <div className="min-w-0 flex-1">
                <BandPill band={detail.verdict.band} withCopy />
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-silver">{detail.verdict.summary}</p>
              </div>
              <span className="flex items-center gap-1 text-[13px] text-cyan">Full forensic report <ArrowRight size={14} /></span>
            </motion.button>
          )}
        </AnimatePresence>
        <ProcessingView live={live} detail={detail} />
      </div>
    );
  }

  // ---- intake ---------------------------------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-medium tracking-tight">New investigation</h1>
          <p className="text-[13.5px] text-muted">Drop everything you received. Files are hashed in your browser before they leave it.</p>
        </div>
        <span className="hidden font-mono text-[11px] text-dim sm:block">audio · video · image · text · up to 200 MB each</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {/* universal drop surface */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            className={cx(
              "group relative flex min-h-[300px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[18px] border border-dashed transition-all duration-300",
              drag ? "border-cyan bg-cyan/[0.05]" : "border-line-2 bg-ink-1/50 hover:border-cyan/40",
            )}
          >
            <div className={cx("pointer-events-none absolute inset-0 grid-field transition-opacity duration-500", drag ? "opacity-80" : "opacity-30")} />
            <div className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-cyan/[0.07] to-transparent" style={{ animation: "scan-sweep 3.2s linear infinite" }} />
            <motion.div animate={{ scale: drag ? 1.08 : 1 }} className="relative grid size-16 place-items-center rounded-2xl border border-line-2 bg-ink-2">
              <Upload size={22} className={drag ? "text-cyan" : "text-silver"} />
            </motion.div>
            <p className="relative mt-5 text-[17px] text-fg">{drag ? "Release to seal as evidence" : "Drop voice notes, call recordings, videos, screenshots"}</p>
            <p className="relative mt-1.5 text-[13px] text-muted">or click to browse · paste an image with ⌘V</p>
            <div className="relative mt-6 flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Recorder onDone={(f) => add([f])} />
            </div>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
          </div>

          {/* message */}
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="label !text-silver">Message, email or chat text</p>
              <span className="font-mono text-[10.5px] text-dim">English · हिन्दी · Hinglish</span>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
              placeholder="Paste exactly what you received, e.g. “Hi, it's Rajesh. In a board meeting, can't talk. Process ₹48,50,000 to the new vendor before 4 PM. Keep this between us.”"
              className="w-full resize-y bg-transparent px-4 py-3 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-dim" />
          </div>

          {/* selected evidence */}
          <AnimatePresence>
            {items.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="panel">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <p className="label !text-silver">Selected evidence · {items.length}</p>
                  <button onClick={() => setItems([])} className="flex items-center gap-1 text-[12px] text-muted hover:text-crimson"><Trash2 size={12} /> Clear</button>
                </div>
                <ul className="divide-y divide-line">
                  {items.map((it, i) => {
                    const Icon = KIND_ICON[it.kind];
                    return (
                      <motion.li key={it.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="grid grid-cols-[auto_1fr_auto] items-start gap-4 px-4 py-3">
                        <span className="grid size-10 place-items-center overflow-hidden rounded-lg border border-line bg-ink-2 text-silver">
                          {it.kind === "image" && it.url ? <img src={it.url} alt="" className="size-full object-cover" /> : <Icon size={16} />}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-[13.5px] text-fg">
                            <span className="etag">E{i + 1}</span>{it.file.name}
                          </p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-dim">
                            {it.kind} · {bytes(it.file.size)} · {it.sha ? <span className="text-muted">sha256 {it.sha.slice(0, 16)}…</span> : "hashing…"}
                          </p>
                          {it.peaks && <div className="mt-2"><Waveform peaks={it.peaks.peaks} duration={it.peaks.duration} height={34} /></div>}
                        </div>
                        <button onClick={() => setItems((s) => s.filter((x) => x.id !== it.id))} className="text-dim hover:text-crimson" aria-label={`Remove ${it.file.name}`}><X size={15} /></button>
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* metadata */}
        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="label !text-silver">Investigation metadata</p>
            <div className="mt-5 space-y-5">
              <label className="relative block">
                <span className="text-[13px] text-muted">Who does it claim to be from?</span>
                <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="e.g. Rajesh Mehta (CFO), Papa, IT helpdesk"
                  className="mt-1.5 h-10 w-full rounded-lg border border-line bg-ink-1 px-3 text-[14px] text-fg outline-none placeholder:text-dim focus:border-cyan/50" />
                {suggestions.length > 0 && !suggestions.some((s) => s.name === sender) && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line-2 bg-ink-2 shadow-xl">
                    {suggestions.map((p) => (
                      <li key={p.name}>
                        <button type="button" onClick={() => setSender(p.name)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-ink-3">
                          <span className="text-fg">{p.name}</span><span className="text-muted">{p.role} · {p.circle === "family" ? "family" : "Trustbook"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
              <label className="block">
                <span className="text-[13px] text-muted">Number or address it came from</span>
                <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+91 70451 88213 or name@domain.com"
                  className="mt-1.5 h-10 w-full rounded-lg border border-line bg-ink-1 px-3 font-mono text-[13px] text-fg outline-none placeholder:font-sans placeholder:text-dim focus:border-cyan/50" />
              </label>
              <div>
                <span className="text-[13px] text-muted">Channel</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CHANNELS.map((c) => (
                    <button key={c} type="button" onClick={() => setChannel(c)}
                      className={cx("h-8 rounded-lg border px-3 text-[12.5px] capitalize transition-colors", channel === c ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-line text-muted hover:text-silver")}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-[13px] text-muted">Received at</span>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-line bg-ink-1 px-3 font-mono text-[13px] text-fg outline-none [color-scheme:dark] focus:border-cyan/50" />
              </label>
            </div>
            <Button className="mt-6 w-full" size="md" onClick={submit} loading={busy} icon={<ArrowRight size={15} />}>
              Open investigation
            </Button>
            <p className="mt-3 text-center font-mono text-[10.5px] text-dim">5 witnesses · Tribunal · verdict in seconds</p>
          </div>
          <div className="panel p-5">
            <p className="label !text-silver">What happens next</p>
            <ol className="mt-4 space-y-3 text-[13px] text-muted">
              <li><span className="text-fg">Sealed.</span> Every file gets a SHA-256 hash and an audit-chain entry.</li>
              <li><span className="text-fg">Examined.</span> Voice, Face, Words, Identity and Provenance witnesses run in parallel.</li>
              <li><span className="text-fg">Argued.</span> The Tribunal testifies, the Skeptic objects, the Judge explains.</li>
              <li><span className="text-fg">Routed.</span> You get a verification plan, not just a score.</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
