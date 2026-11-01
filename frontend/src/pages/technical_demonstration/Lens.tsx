import { motion } from "motion/react";
import type { ReactNode } from "react";
import { RULES, TACTIC_COLOR, type DemoCase, type Stage } from "./data";

/**
 * The backend lens: one zoomed-in scene per pipeline stage. `p` is the scroll progress through the stage (0 to 1) and
 * drives every animation, so the viewer controls the pace. Each scene pairs a visual (for everyone) with the exact
 * rule or formula (for the engineer), using the case's real values.
 */
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const tone = (s: number, t = 0.5) => (s >= 0.7 ? "var(--color-crimson)" : s >= t ? "var(--color-amber)" : "var(--color-mint)");

function Shell({ plain, rules, children, values }: { plain: string; rules: string[]; children: ReactNode; values?: [string, string][] }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-fg">{plain}</p>
      <div className="min-h-0 flex-1 rounded-2xl border border-line bg-ink-1/70 p-4">{children}</div>
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <ul className="space-y-1 rounded-xl border border-violet/25 bg-violet/[0.05] p-3">
          <li className="mb-1 font-mono text-[9.5px] tracking-[0.16em] text-violet">UNDER THE HOOD</li>
          {rules.map((r) => <li key={r} className="font-mono text-[11px] leading-snug text-silver">› {r}</li>)}
        </ul>
        {values && (
          <dl className="grid grid-cols-2 gap-1.5 self-start">
            {values.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-ink-2/70 px-2 py-1.5"><dt className="text-[9.5px] text-dim">{k}</dt><dd className="truncate font-mono text-[11.5px] text-fg" title={v}>{v}</dd></div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function Bar({ label, v, t, w, p }: { label: string; v: number; t?: number; w?: number; p: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3">
      <span className="truncate text-[12px] text-silver">{label}</span>
      <span className="relative h-2.5 rounded-full bg-ink-4">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v * p * 100}%`, background: tone(v, t ?? 0.5) }} />
        {t != null && <span className="absolute -top-1 h-[18px] w-px bg-fg/80" style={{ left: `${t * 100}%` }} title={`threshold ${t}`} />}
      </span>
      <span className="w-[86px] text-right font-mono text-[11px] text-silver">{(v * p).toFixed(3)}{w != null && <span className="text-dim"> · w{w}</span>}</span>
    </div>
  );
}

function NotCalled({ what, why }: { what: string; why: string }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm space-y-2">
        <p className="font-mono text-[11px] tracking-[0.16em] text-dim">NOT CALLED FOR THIS CASE</p>
        <p className="text-[14px] text-silver">{why}</p>
        <p className="text-[12px] text-dim">{what}</p>
      </div>
    </div>
  );
}

// ---- scenes ---------------------------------------------------------------------------------------------------------

function Input({ c, p }: { c: DemoCase; p: number }) {
  const lines = [
    "POST /v1/cases  HTTP/1.1", "Authorization: Bearer ••••••", "Content-Type: multipart/form-data; boundary=⋯", "",
    `files        ${c.file.name}  (${c.file.mime}, ${c.file.bytes.toLocaleString()} B)`, `claimed_sender  ${c.sender}`, `channel      ${c.channel.toLowerCase()}`,
    `sender_contact  ${c.contact}`, `message      "${c.message.slice(0, 64)}…"`, "", "→ 202  { id: \"" + c.id + "\", status: \"queued\" }",
  ];
  const n = Math.ceil(seg(p, 0.05, 0.85) * lines.length);
  return (
    <Shell plain="The person drops the file and fills in who it claims to be from. The browser sends one request; the case is queued and the pipeline starts in the background."
      rules={["FastAPI endpoint; files read into memory, then stored by content hash", "Case row created with claimed sender, channel and contact (the identity witness needs them)",
              "pipeline.submit(case_id) → thread pool; progress streams back over server-sent events"]}
      values={[["Case", c.id], ["File", c.file.name], ["Claims", c.sender], ["Via", c.channel]]}>
      <pre className="h-full overflow-hidden font-mono text-[11.5px] leading-[1.7] text-cyan/90">
        {lines.slice(0, n).map((l, i) => <div key={i} className={i === lines.length - 1 ? "text-mint" : i < 3 ? "text-dim" : ""}>{l || " "}</div>)}
      </pre>
    </Shell>
  );
}

function Custody({ c, p }: { c: DemoCase; p: number }) {
  const hexRows = ["0000", "0010", "0020"];
  const reveal = Math.ceil(seg(p, 0.3, 0.75) * 64);
  const sha = (c.file.sha + "…").padEnd(17, "·");
  const blocks = [["#517", "a91f…", "case.created MRG-0517"], ["#518", "3c0d…", "case.created MRG-0518"], ["#519", "e77a…", `artifact.stored ${c.id}`]];
  return (
    <Shell plain="Before anything is analysed, the file is fingerprinted so it can stand up as evidence. Its real type is read from its first bytes, so an executable renamed to .ogg is refused."
      rules={["Magic-byte sniffing: allow audio / video / image / text; reject executables and archives", "SHA-256 of the raw bytes stored with the artifact (chain of custody)",
              "Every action appended to an audit log where each entry hashes the previous one: tampering breaks the chain"]}
      values={[["Declared", c.file.name.split(".").pop()!], ["Sniffed", c.file.mime], ["Size", `${c.file.bytes.toLocaleString()} B`], ["SHA-256", `${c.file.sha}…`]]}>
      <div className="grid h-full gap-4 md:grid-cols-2">
        <div className="space-y-1.5 font-mono text-[11px]">
          <p className="text-[9.5px] tracking-[0.16em] text-dim">FIRST BYTES</p>
          {hexRows.map((r, i) => (
            <p key={r} className="text-dim">{r}  {i === 0 ? <><span className="rounded bg-cyan/20 px-0.5 text-cyan">{c.file.magic.slice(0, 11)}</span>{c.file.magic.slice(11)}</> : "00 1e 4f 70 75 73 48 65"}
              <span className="ml-2 text-silver">{i === 0 ? c.file.magicText : "..OpusHe"}</span></p>
          ))}
          <motion.p animate={{ opacity: p > 0.2 ? 1 : 0 }} className="pt-2 text-mint">✓ {c.file.magicText} → {c.file.mime} · allowed</motion.p>
          <p className="pt-3 text-[9.5px] tracking-[0.16em] text-dim">SHA-256</p>
          <p className="break-all text-[12px] text-fg">{sha.slice(0, Math.min(sha.length, Math.ceil(reveal / 4)))}<span className="animate-pulse text-cyan">▍</span></p>
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[9.5px] tracking-[0.16em] text-dim">AUDIT CHAIN</p>
          {blocks.map(([n, h, a], i) => (
            <motion.div key={n} initial={false} animate={{ opacity: i < 2 || p > 0.7 ? 1 : 0.15, x: i === 2 && p <= 0.7 ? 20 : 0 }}
              className="relative rounded-lg border border-line bg-ink-2/80 p-2 font-mono text-[10.5px]">
              <p className="text-silver">{n} · {a}</p><p className="text-dim">prev {i ? blocks[i - 1][1] : "0000…"} → this {h}</p>
              {i < 2 && <span className="absolute -bottom-2 left-6 h-2 w-px bg-cyan/60" />}
            </motion.div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Dissect({ c, p }: { c: DemoCase; p: number }) {
  const words = c.transcript.split(" ");
  const shown = Math.ceil(seg(p, 0.35, 0.95) * words.length);
  const streams = [
    ["Audio track", true, `${c.voice.bandwidth / 1000} kHz band · ${c.windows.length} windows × 4.04 s`],
    ["Speech → text", true, `faster-whisper · ${c.language === "en" ? "English" : c.language}`],
    ["Video frames", c.file.kind === "video", c.face ? `${c.face.frames} frames sampled · ${c.face.faces} with a face` : "no video"],
    ["Typed message", !!c.message, `${c.message.length} characters`],
  ] as const;
  return (
    <Shell plain="The file is taken apart into the things each expert needs: the audio in short slices, the words that were spoken, the video frames, and the typed message."
      rules={["Audio decoded to 16 kHz mono; 4.04 s windows (DF_Arena's training crop), up to 16 per clip", "faster-whisper: Hinglish kept in Roman script; Tamil, Marathi, Bengali… in native script",
              "Video: OpenCV frame sampling + audio extraction; screenshots: RapidOCR + glued-word repair"]}
      values={[["Duration", `${c.file.duration} s`], ["Windows", String(c.windows.length)], ["Language", c.language], ["Streams", String(streams.filter((s) => s[1]).length)]]}>
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {streams.map(([k, on, d], i) => (
            <motion.div key={k} animate={{ opacity: on ? (p > i * 0.08 ? 1 : 0.2) : 0.3 }} className={`rounded-lg border p-2 ${on ? "border-cyan/40 bg-cyan/[0.06]" : "border-line"}`}>
              <p className={`text-[11.5px] ${on ? "text-cyan" : "text-dim line-through"}`}>{k}</p><p className="text-[10px] text-dim">{d}</p>
            </motion.div>
          ))}
        </div>
        <div className="flex h-9 items-end gap-1">
          {c.windows.map((w, i) => (
            <motion.span key={i} initial={false} animate={{ height: p > 0.15 + i * 0.02 ? `${30 + w * 70}%` : "8%" }}
              className="flex-1 rounded-sm bg-gradient-to-t from-cyan/30 to-cyan/70" />
          ))}
        </div>
        <p className="min-h-0 flex-1 overflow-hidden text-[13px] leading-relaxed text-silver">
          {words.slice(0, shown).map((w, i) => <span key={i}>{w} </span>)}<span className="animate-pulse text-cyan">▍</span>
        </p>
      </div>
    </Shell>
  );
}

function Voice({ c, p }: { c: DemoCase; p: number }) {
  const v = c.voice;
  const fill = seg(p, 0.25, 0.7);
  const decided = p > 0.75;
  return (
    <Shell plain={`Three independent detectors listen to every slice. Each has its own line for "fake", so their votes are lined up before averaging. Here they say: machine-made voice (${v.score.toFixed(2)}).`}
      rules={["Gate: < 2 s, silent or < 15 % speech (Silero VAD) → inconclusive, never 'AI'", "SNR < 19 dB → noisy mode: DF_Arena votes alone, confidence −0.25",
              "score = σ(Σ wᵢ·(logit pᵢ − logit tᵢ) / Σ wᵢ), attention-pooled over windows", "AI ≥ 0.70 · human ≤ 0.30 (0.90 / 0.10 when noisy)"]}
      values={[["Speech", `${Math.round(v.speech * 100)} %`], ["SNR", `${v.snr} dB`], ["Codec", v.codec.split(" (")[0]], ["Confidence", v.conf.toFixed(2)]]}>
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-2"><p className="text-[10px] text-dim">Speech present (gate 15 %)</p>
            <div className="mt-1 h-2 rounded-full bg-ink-4"><span className="block h-full rounded-full bg-mint" style={{ width: `${v.speech * 100 * seg(p, 0, 0.2)}%` }} /></div></div>
          <div className="rounded-lg border border-line p-2"><p className="text-[10px] text-dim">SNR {v.snr} dB (noisy below 19)</p>
            <div className="relative mt-1 h-2 rounded-full bg-ink-4"><span className="block h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, v.snr) * seg(p, 0.05, 0.25)}%` }} />
              <span className="absolute -top-1 h-4 w-px bg-amber" style={{ left: "19%" }} /></div></div>
        </div>
        <div className="space-y-2.5">{v.models.map(([n, s, t, w]) => <Bar key={n} label={n} v={s} t={t} w={w} p={fill} />)}</div>
        <div>
          <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(90deg, var(--color-mint) 0 30%, var(--color-ink-4) 30% 70%, var(--color-crimson) 70%)" }}>
            <motion.span animate={{ left: `${v.score * (decided ? 1 : fill) * 100}%` }} className="absolute -top-1.5 h-6 w-1 -translate-x-1/2 rounded bg-fg" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-dim"><span>human ≤ 0.30</span><span>uncertain</span><span>AI ≥ 0.70</span></div>
          <motion.p animate={{ opacity: decided ? 1 : 0 }} className="mt-2 font-mono text-[13px]" style={{ color: tone(v.score) }}>
            ensemble {v.score.toFixed(3)} → {v.score >= 0.7 ? "AI-GENERATED VOICE" : v.score <= 0.3 ? "HUMAN VOICE" : "UNCERTAIN"}
          </motion.p>
        </div>
      </div>
    </Shell>
  );
}

function Face({ c, p }: { c: DemoCase; p: number }) {
  if (!c.face) return <Shell plain="This case has no video or face, so the face witness is not called." rules={["Router: face witness runs only on video artifacts", "Images with faces go through provenance + GenD"]}>
    <NotCalled why="No video in this case." what="On a video it finds faces (YuNet), scores each crop for swapping (two GenD models), checks whole frames for generation and whether the lips follow the voice (SyncNet)." /></Shell>;
  const f = c.face;
  const fill = seg(p, 0.2, 0.65);
  return (
    <Shell plain="Every frame is checked twice: is this face swapped, and was the whole picture generated? Here the faces don't look swapped, but every frame is AI-generated and the mouth never moves with the voice: an avatar over a cloned voice."
      rules={["YuNet face boxes → GenD CLIP L/14 + PE-L on crops (threshold 0.75), median + attention pooling", "Whole-frame AI detectors (Community Forensics, SwinV2) on key frames: catches text-to-video and avatars",
              "SyncNet v2 lip-sync; mouth motion < 0.05 → reported as a still picture over audio, not scored", "Jury shows all four detectors so a high score never sits beside '0 of 2 say fake'"]}
      values={[["Frames", String(f.frames)], ["Faces", String(f.faces)], ["Lip-sync", f.sync.toFixed(2)], ["Video score", f.score.toFixed(2)]]}>
      <div className="grid h-full gap-4 md:grid-cols-[180px_1fr]">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-gradient-to-b from-ink-3 to-ink-1">
          <div className="absolute inset-x-8 top-8 bottom-16 rounded-[45%] bg-gradient-to-b from-silver/20 to-silver/5" />
          <motion.div animate={{ top: `${10 + 70 * (p % 0.5) * 2}%` }} className="absolute inset-x-0 h-px bg-cyan/80 shadow-[0_0_12px_#67e8f9]" />
          <span className="absolute left-6 right-6 top-6 bottom-14 rounded-lg border border-cyan/70" />
          <span className="absolute bottom-2 left-2 rounded bg-crimson/80 px-1.5 py-0.5 font-mono text-[9px] text-white">GENERATED 1.00</span>
        </div>
        <div className="flex flex-col justify-between gap-3">
          <div className="space-y-2"><p className="font-mono text-[9.5px] tracking-[0.16em] text-dim">FACE-SWAP DETECTORS (on crops)</p>{f.gend.map(([n, s]) => <Bar key={n} label={n} v={s} t={0.75} p={fill} />)}</div>
          <div className="space-y-2"><p className="font-mono text-[9.5px] tracking-[0.16em] text-dim">WHOLE-FRAME AI DETECTORS</p>{f.frame.map(([n, s]) => <Bar key={n} label={n} v={s} t={0.5} p={fill} />)}</div>
          <div><p className="font-mono text-[9.5px] tracking-[0.16em] text-dim">LIP-SYNC · mouth motion {f.motion}</p>
            <svg viewBox="0 0 300 40" className="h-10 w-full"><path d={`M0 20 ${Array.from({ length: 30 }, (_, i) => `L${i * 10} ${20 + Math.sin(i) * 1.2}`).join(" ")}`} fill="none" stroke="var(--color-amber)" strokeWidth="1.5" /></svg>
            <motion.p animate={{ opacity: p > 0.75 ? 1 : 0 }} className="font-mono text-[12px] text-crimson">→ still picture over audio · video score {f.score}</motion.p></div>
        </div>
      </div>
    </Shell>
  );
}

function Provenance({ c }: { c: DemoCase }) {
  return (
    <Shell plain="The provenance witness checks still images: was this photo generated or edited, and does it carry a signed origin certificate?"
      rules={["Community Forensics ViT-S/384 (t 0.01, w 0.55) + SwinV2 (t 0.1, w 0.45), logit fusion", "C2PA manifest: valid · tampered · AI-declared", "EXIF camera traces, generator markers, ELA grid; faces also go to GenD"]}
      values={[["Images in case", "0"], ["Benchmark AUC", "0.98"], ["Red team", "15 / 15"], ["Real photos called AI", "0 / 136"]]}>
      <NotCalled why={`No still image in ${c.id}.`} what="A video's frames are checked by the same image detectors inside the face witness, which is how the avatar call's frames scored 1.00." />
    </Shell>
  );
}

function Words({ c, p }: { c: DemoCase; p: number }) {
  const text = c.words.marks.some(([m]) => !c.message.toLowerCase().includes(m.toLowerCase())) ? `${c.message}  ${c.transcript}` : c.message;
  const nMarks = Math.ceil(seg(p, 0.15, 0.7) * c.words.marks.length);
  const active = c.words.marks.slice(0, nMarks);
  const parts: ReactNode[] = [];
  let rest = text;
  let k = 0;
  const sorted = [...active].map(([s, t]) => ({ s, t, i: text.toLowerCase().indexOf(s.toLowerCase()) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  let cursor = 0;
  for (const m of sorted) {
    if (m.i < cursor) continue;
    parts.push(<span key={k++}>{text.slice(cursor, m.i)}</span>);
    const col = TACTIC_COLOR[m.t] ?? "#fbbf24";
    parts.push(<mark key={k++} title={m.t} className="rounded px-0.5 text-fg" style={{ background: `color-mix(in srgb, ${col} 25%, transparent)`, boxShadow: `inset 0 -2px 0 ${col}` }}>{text.slice(m.i, m.i + m.s.length)}</mark>);
    cursor = m.i + m.s.length;
  }
  parts.push(<span key={k++}>{text.slice(cursor)}</span>);
  rest = "";
  const req = p > 0.65;
  return (
    <Shell plain={c.words.action === "none" ? "The words are read for pressure tricks and requests. This message asks for nothing and uses no pressure, which matters as much as the voice being synthetic."
      : `The words are read for pressure tricks and for what is being asked. Here: ${c.words.tactics.length} tricks and a request for ${c.words.amount ?? "money"}.`}
      rules={["Tactic lexicons (EN, HI, Hinglish, MR, TA, BN, GU) give exact highlightable spans", "Request extractor: action, amount (ASR-tolerant), deadline, UPI / account / IFSC, look-alike domains",
              "Logit blend: own TF-IDF 0.5 · phishing DistilBERT 0.3 · mDeBERTa zero-shot 0.2 (only when corroborated)", "Notices ('your OTP is…', 'debited…') are never read as requests"]}
      values={[["Asks for", c.words.action], ["Amount", c.words.amount ?? "—"], ["Deadline", c.words.deadline ?? "—"], ["Scam language", c.words.score.toFixed(2)]]}>
      <div className="flex h-full flex-col gap-3">
        <p className="text-[13.5px] leading-[1.9] text-silver">{parts}{rest}</p>
        <div className="flex flex-wrap gap-1.5">
          {c.words.tactics.map((t, i) => (
            <motion.span key={t} initial={false} animate={{ opacity: i < Math.ceil(nMarks * c.words.tactics.length / Math.max(1, c.words.marks.length)) ? 1 : 0.15 }}
              className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ color: TACTIC_COLOR[t], background: `color-mix(in srgb, ${TACTIC_COLOR[t]} 15%, transparent)` }}>{t}</motion.span>
          ))}
          {!c.words.tactics.length && <span className="text-[12px] text-mint">no tactics found</span>}
        </div>
        <motion.pre animate={{ opacity: req ? 1 : 0.2 }} className="mt-auto rounded-lg border border-line bg-ink-2/80 p-3 font-mono text-[11px] leading-relaxed text-cyan/90">
{`request = {
  action:   "${c.words.action}",
  amount:   ${c.words.amount ? `"${c.words.amount}"` : "null"},
  deadline: ${c.words.deadline ? `"${c.words.deadline}"` : "null"},
  ids:      [${c.words.ids.map((x) => `"${x}"`).join(", ")}]
}`}
        </motion.pre>
      </div>
    </Shell>
  );
}

function Identity({ c, p }: { c: DemoCase; p: number }) {
  const n = Math.ceil(seg(p, 0.15, 0.8) * c.identity.flags.length);
  return (
    <Shell plain={c.identity.resolved ? `The claimed sender is a real person in the Trustbook, so every detail is checked against what is normal for ${c.identity.resolved.split(" ·")[0]}: the number, the channel, the account, the amount.`
      : "The sender is checked against the Trustbook of people this organisation trusts, and the payment details against earlier fraud."}
      rules={["Trustbook: directory number, usual channels and hours, approval limit, known beneficiaries", "Beneficiary lookup: flagged in a confirmed fraud → severity 3",
              "Request anomaly: IsolationForest over 12 months of requests", "Voiceprint (WavLM): a match is 'consistent with', never proof (28 % false accept measured)"]}
      values={[["Resolved", c.identity.resolved ?? "not in Trustbook"], ["Directory no.", c.identity.directory ?? "—"], ["Approval limit", c.identity.limit ?? "—"], ["Witness score", c.identity.score.toFixed(2)]]}>
      <div className="space-y-2">
        {c.identity.flags.map(([k, v, s], i) => (
          <motion.div key={k} initial={false} animate={{ opacity: i < n ? 1 : 0.15, x: i < n ? 0 : 12 }}
            className="flex items-start gap-3 rounded-lg border border-line bg-ink-2/70 p-2.5">
            <span className={`mt-1 size-2 shrink-0 rounded-full ${s === "bad" ? "bg-crimson" : s === "ok" ? "bg-mint" : "bg-amber"}`} />
            <div><p className="text-[12px] text-fg">{k}</p><p className="text-[11.5px] text-muted">{v}</p></div>
          </motion.div>
        ))}
      </div>
    </Shell>
  );
}

function Risk({ c, p }: { c: DemoCase; p: number }) {
  const { A, M, C, S } = c.dims;
  const firedAt = RULES.findIndex((r) => r.id === c.rule);
  const step = Math.floor(seg(p, 0.05, 0.55) * (firedAt + 1));
  const Cp = C * (0.25 + 0.75 * S);
  const raw = 1 - (1 - A * S) * (1 - M * S) * (1 - Cp);
  const lg = (x: number) => Math.log(Math.min(Math.max(x, 1e-4), 1 - 1e-4) / (1 - Math.min(Math.max(x, 1e-4), 1 - 1e-4)));
  const formula = 100 / (1 + Math.exp(-lg(raw) / 1.65));
  const needle = seg(p, 0.55, 0.9);
  return (
    <Shell plain={c.band === "HIGH" ? "The judge weighs all witnesses against what is being asked. Hard rules run first: a money request with secrecy or a flagged account is HIGH before any arithmetic, so a weak detector can never talk it down."
      : "The judge weighs all witnesses against what is being asked. A synthetic voice that asks for nothing meets the harmless-synthetic rule, which caps the risk: no false alarm."}
      rules={["Policy rules in order; the first that fires sets a floor (or a ceiling)", "risk = 100·σ( logit(1 − (1−A·S)(1−M·S)(1−C′)) / T ),  T = 1.65", "C′ = C · (0.25 + 0.75·S): context counts more when the ask is sensitive",
              "Exact Shapley values split the risk between witnesses"]}
      values={[["A · S", `${A.toFixed(2)} · ${S}`], ["M", M.toFixed(2)], ["C′", Cp.toFixed(2)], ["Formula", formula.toFixed(1)]]}>
      <div className="grid h-full gap-4 md:grid-cols-[1.1fr_1fr]">
        <ol className="space-y-1">
          {RULES.map((r, i) => {
            const state = i < step ? (i === firedAt ? "fire" : "pass") : i === step && i <= firedAt ? "eval" : "idle";
            return (
              <li key={r.id} className={`rounded-md border px-2 py-1.5 font-mono text-[10.5px] transition-colors ${state === "fire" ? "border-crimson/60 bg-crimson/15 text-fg" : state === "eval" ? "border-cyan/50 text-fg" : state === "pass" ? "border-line text-dim line-through" : "border-line text-dim"}`}>
                <span className="mr-1">{state === "fire" ? "●" : state === "pass" ? "✕" : "○"}</span>{r.id}<span className="block pl-3 font-sans text-[10px] text-muted no-underline">{r.when} → {r.sets}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="relative size-[180px]">
            <svg viewBox="0 0 200 120" className="w-full">
              <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="var(--color-ink-4)" strokeWidth="16" strokeLinecap="round" />
              <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke={c.band === "HIGH" ? "var(--color-crimson)" : "var(--color-mint)"} strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${(c.risk / 100) * 251 * needle} 251`} />
            </svg>
            <div className="absolute inset-x-0 bottom-6 text-center"><p className="font-mono text-[34px] leading-none" style={{ color: c.band === "HIGH" ? "var(--color-crimson)" : "var(--color-mint)" }}>{(c.risk * needle).toFixed(1)}</p>
              <p className="font-mono text-[11px] text-dim">{c.band}</p></div>
          </div>
          <div className="w-full space-y-1">
            {c.shap.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[64px_1fr_40px] items-center gap-2 text-[10.5px]"><span className="text-silver">{k}</span>
                <span className="h-1.5 rounded-full bg-ink-4"><span className="block h-full rounded-full bg-violet" style={{ width: `${(v / 40) * 100 * needle}%` }} /></span><span className="text-right font-mono text-dim">{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Tribunal({ c, p }: { c: DemoCase; p: number }) {
  const agents = ["Planner", "Voice", "Face", "Linguist", "Identity", "Skeptic", "Judge"];
  const n = Math.ceil(seg(p, 0.05, 0.9) * c.tribunal.length);
  return (
    <Shell plain="A small courtroom replays the case so a person can follow it: each witness testifies, a skeptic argues the innocent reading, the judge rules. Every claim cites evidence. It explains; it never changes the score."
      rules={["LangGraph state machine, streamed over SSE", "Claims must cite evidence IDs like [E1]", "Optional LLM narration is rejected if it drops or invents a tag or a number"]}
      values={[["Messages", String(c.tribunal.length)], ["Evidence items", c.key === "townhall" ? "4" : "28+"], ["Verdict", `${c.band} ${c.risk}`], ["Rule", c.rule.split("_").slice(0, 2).join(" ")]]}>
      <div className="grid h-full gap-3 md:grid-cols-[110px_1fr]">
        <div className="hidden space-y-1 md:block">{agents.map((a) => {
          const on = c.tribunal.slice(0, n).some(([x]) => x === a);
          return <p key={a} className={`rounded-md px-2 py-1 text-[11px] ${on ? "bg-violet/15 text-violet" : "text-dim"}`}>{a}</p>;
        })}</div>
        <div className="space-y-2 overflow-hidden">
          {c.tribunal.slice(0, n).map(([a, t], i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-2.5 ${a === "Judge" ? "border-cyan/50 bg-cyan/[0.06]" : "border-line bg-ink-2/70"}`}>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-violet">{a.toUpperCase()}</p>
              <p className="text-[12px] leading-snug text-silver">{t.split(/(\[E\d+\])/).map((x, j) => x.match(/\[E\d+\]/) ? <span key={j} className="etag mx-0.5">{x.slice(1, -1)}</span> : x)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Cure({ c, p }: { c: DemoCase; p: number }) {
  const stages = ["Contain", "Verify", "Recover", "Report", "Immunise"];
  const exposure = c.band === "HIGH" ? Math.round(100 - 82 * seg(p, 0.2, 0.9)) : 0;
  return (
    <Shell plain={c.band === "HIGH" ? "The verdict becomes steps for this exact scam type. As the person acts (hold the payment, call back, report), the exposure meter falls. The person sees only the plain card; the analyst gets the full console."
      : "A harmless result needs no emergency plan, so the cure stays quiet. Not crying wolf is part of the design."}
      rules={["categorise(action, tactics, transcript + message) → one of 9 scam categories", "response.build(): do-now, don't, say-this, report-to (1930, cybercrime.gov.in, CERT-In 6 h), if-paid",
              "Cure Console: exposure weights per action; 'already paid' starts the golden-hour clock", "Bank hold / session revoke / SOC ticket connectors are simulated and labelled"]}
      values={[["Category", c.category.split(" · ")[0]], ["Severity", c.severity], ["Steps", String(c.plan.length)], ["Exposure", `${exposure} %`]]}>
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-5 gap-1.5">
          {stages.map((s, i) => {
            const on = c.band === "HIGH" && p > 0.1 + i * 0.15;
            return <div key={s} className={`rounded-lg border p-2 text-center text-[11px] ${on ? "border-mint/50 bg-mint/10 text-mint" : "border-line text-dim"}`}>{on ? "✓ " : ""}{s}</div>;
          })}
        </div>
        <div><p className="mb-1 flex justify-between text-[11px] text-muted"><span>Exposure still at risk</span><span className="font-mono">{exposure} %</span></p>
          <div className="h-3 rounded-full bg-ink-4"><motion.div animate={{ width: `${exposure}%` }} className="h-full rounded-full bg-gradient-to-r from-amber to-crimson" /></div></div>
        <ol className="space-y-1.5">
          {c.plan.map((s, i) => (
            <motion.li key={i} initial={false} animate={{ opacity: p > 0.15 + i * 0.15 ? 1 : 0.25 }} className="flex gap-2 rounded-lg border border-line bg-ink-2/70 px-2.5 py-1.5 text-[12px] text-silver">
              <span className="font-mono text-cyan">{i + 1}</span>{s}
            </motion.li>
          ))}
        </ol>
      </div>
    </Shell>
  );
}

export function Lens({ c, stage, p }: { c: DemoCase; stage: Stage; p: number }) {
  switch (stage) {
    case "input": return <Input c={c} p={p} />;
    case "custody": return <Custody c={c} p={p} />;
    case "dissect": return <Dissect c={c} p={p} />;
    case "voice": return <Voice c={c} p={p} />;
    case "face": return <Face c={c} p={p} />;
    case "provenance": return <Provenance c={c} />;
    case "words": return <Words c={c} p={p} />;
    case "identity": return <Identity c={c} p={p} />;
    case "risk": return <Risk c={c} p={p} />;
    case "tribunal": return <Tribunal c={c} p={p} />;
    case "cure": return <Cure c={c} p={p} />;
  }
}
