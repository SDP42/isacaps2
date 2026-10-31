import { Mic, Square, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getToken } from "@/lib/api";
import { cx } from "@/lib/format";
import { micError, useRecorder } from "@/lib/recorder";

function Meter({ level, color = "#fb7185" }: { level: number[]; color?: string }) {
  return (
    <span className="flex h-4 items-center gap-[2px]" aria-hidden>
      {level.slice(0, 14).map((l, i) => <span key={i} className="w-[2px] rounded-full transition-[height] duration-75" style={{ height: 3 + l * 13, background: color }} />)}
    </span>
  );
}

/** Record a voice note as evidence. */
export function RecordButton({ onFile, className }: { onFile: (f: File) => void; className?: string }) {
  const rec = useRecorder();
  const toggle = async () => {
    if (rec.recording) {
      const f = await rec.stop();
      if (f) {
        onFile(f);
        toast.success(`Voice note added (${rec.seconds}s)`);
      } else toast.error("Nothing was recorded. Speak for at least a second.");
      return;
    }
    try {
      await rec.start();
    } catch (e) {
      toast.error(micError(e));
    }
  };
  return (
    <button type="button" onClick={toggle}
      className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
        rec.recording ? "border-crimson/60 bg-crimson/10 text-crimson" : "border-line-2 text-silver hover:border-cyan/40 hover:text-fg", className)}>
      {rec.recording ? <><Square size={11} className="fill-current" /><Meter level={rec.level} />Stop · {rec.seconds}s</> : <><Mic size={13} />Record a voice note</>}
    </button>
  );
}

/** Speak instead of typing: records, transcribes with Whisper, and hands back the text. */
export function DictateButton({ onText, className, label = "Dictate" }: { onText: (t: string) => void; className?: string; label?: string }) {
  const rec = useRecorder();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    if (!rec.recording) {
      try {
        await rec.start();
      } catch (e) {
        toast.error(micError(e));
      }
      return;
    }
    const f = await rec.stop();
    if (!f) {
      toast.error("Nothing was recorded.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f, f.name);
      const r = await fetch("/v1/transcribe", { method: "POST", body: fd, headers: { authorization: `Bearer ${getToken() ?? ""}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "Transcription failed");
      if (j.text) onText(j.text);
      else toast.error("No speech was recognised. Try again a little closer to the mic.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={toggle}
      className={cx("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
        rec.recording ? "border-crimson/60 bg-crimson/10 text-crimson" : "border-line text-muted hover:border-cyan/40 hover:text-fg", className)}>
      {busy ? <><span className="size-3 animate-spin rounded-full border-2 border-cyan border-r-transparent" />Transcribing…</>
        : rec.recording ? <><Square size={10} className="fill-current" /><Meter level={rec.level} />Stop · {rec.seconds}s</>
        : <><Wand2 size={12} />{label}</>}
    </button>
  );
}
