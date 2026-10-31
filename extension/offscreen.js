// Holds the captured tab stream, keeps the call audible, and posts 3-second 16 kHz WAV chunks to /v1/live/chunk.
let ctx = null;
let stream = null;
let node = null;
let buf = [];
let context = "";
let cfg = null;
const SR = 16000;
const CHUNK = SR * 3;

function wav(samples) {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(b);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([b], { type: "audio/wav" });
}

async function send(samples) {
  const fd = new FormData();
  fd.append("file", wav(samples), "chunk.wav");
  fd.append("context", context.slice(-400));
  try {
    const res = await fetch(`${cfg.api}/v1/live/chunk`, { method: "POST", body: fd, headers: { authorization: `Bearer ${cfg.token}` } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const r = await res.json();
    if (r.text) context += " " + r.text;
    chrome.runtime.sendMessage({ type: "chunk-result", result: r });
  } catch (e) {
    chrome.runtime.sendMessage({ type: "chunk-error", error: String(e.message || e) });
  }
}

async function start(streamId) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
  });
  ctx = new AudioContext({ sampleRate: SR });
  const src = ctx.createMediaStreamSource(stream);
  src.connect(ctx.destination); // capturing a tab mutes it; route it back so the call stays audible
  node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    buf.push(...e.inputBuffer.getChannelData(0));
    if (buf.length >= CHUNK) {
      const chunk = buf.slice(0, CHUNK);
      buf = buf.slice(CHUNK);
      send(chunk);
    }
  };
  src.connect(node);
  node.connect(ctx.destination);
}

function stop() {
  stream?.getTracks().forEach((t) => t.stop());
  node?.disconnect();
  ctx?.close();
  stream = ctx = node = null;
  buf = [];
  context = "";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "start") { cfg = { api: msg.api, token: msg.token }; start(msg.streamId); }
  if (msg.type === "stop") stop();
});
