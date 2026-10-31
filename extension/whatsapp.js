// WhatsApp Web: a "Check with MIRAGE" chip on every voice note. WhatsApp only decrypts a note when it is played, so the
// chip asks for one play first; the decrypted audio comes from whatsapp-hook.js. WhatsApp's DOM is not a public API:
// voice notes are found by their play icon, which has been stable across versions, and everything fails quietly.
let lastAudio = null;
window.addEventListener("message", (e) => {
  if (e.source === window && e.data && e.data.__mirage === "audio" && e.data.blob) lastAudio = { blob: e.data.blob, at: e.data.at };
});

const PLAY = '[data-icon="audio-play"], [data-icon="ptt-play"], [data-icon="ptt-pause"], [data-icon="audio-pause"]';
const COLORS = { CRITICAL: "#e11d48", HIGH: "#e11d48", MEDIUM: "#d97706", LOW: "#059669", INCONCLUSIVE: "#64748b" };

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function chip(bubble) {
  const b = document.createElement("button");
  b.className = "mirage-chip";
  b.textContent = "Check with MIRAGE";
  b.style.cssText = "margin:4px 0 2px;padding:3px 10px;border-radius:999px;border:1px solid #0891b2;background:#ecfeff;color:#0e7490;font:12px system-ui;cursor:pointer";
  b.onclick = async (ev) => {
    ev.stopPropagation();
    const fresh = lastAudio && Date.now() - lastAudio.at < 5 * 60 * 1000;
    if (!fresh) {
      b.textContent = "Play the voice note once, then click again";
      return;
    }
    b.disabled = true;
    b.textContent = "Checking…";
    try {
      const dataUrl = await toDataUrl(lastAudio.blob);
      chrome.runtime.sendMessage({ type: "check-voice-data", dataUrl, mime: lastAudio.blob.type }, (res) => {
        b.disabled = false;
        if (!res || !res.ok) {
          b.textContent = (res && res.error) || "MIRAGE is not reachable";
          return;
        }
        const sev = res.severity || "INCONCLUSIVE";
        const c = COLORS[sev] || "#64748b";
        b.textContent = `MIRAGE · ${sev} · ${res.label || ""}`;
        b.style.borderColor = c;
        b.style.color = c;
        b.style.background = c + "14";
      });
    } catch (e) {
      b.disabled = false;
      b.textContent = "Could not read this voice note";
    }
  };
  return b;
}

function scan() {
  for (const icon of document.querySelectorAll(PLAY)) {
    const bubble = icon.closest("[data-id]") || icon.closest(".message-in, .message-out");
    if (!bubble || bubble.querySelector(".mirage-chip")) continue;
    const host = icon.closest("div[role='row']") ? icon.parentElement.parentElement : bubble;
    host.appendChild(chip(bubble));
  }
}

new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true });
scan();
