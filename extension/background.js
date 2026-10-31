// MIRAGE Shield service worker: context menus, the tab-audio shield and messages from the Gmail content script.
importScripts("common.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "mirage-text", title: "Check selected text with MIRAGE", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "mirage-image", title: "Check this image with MIRAGE", contexts: ["image"] });
  chrome.contextMenus.create({ id: "mirage-audio", title: "Check this voice note with MIRAGE", contexts: ["audio", "video"] });
});

async function showResult(result) {
  await chrome.storage.session.set({ lastResult: result });
  chrome.windows.create({ url: "result.html", type: "popup", width: 460, height: 720 });
}

async function fetchAsFile(url, name) {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type || "application/octet-stream" });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  try {
    if (info.menuItemId === "mirage-text") {
      const r = await call("/v1/quick/text", { method: "POST", body: JSON.stringify({ text: info.selectionText }) });
      await showResult({ kind: "text", input: info.selectionText, ...r });
    } else if (info.menuItemId === "mirage-image") {
      const fd = new FormData();
      fd.append("file", await fetchAsFile(info.srcUrl, "image.jpg"));
      await showResult({ kind: "media", input: info.srcUrl, ...(await call("/v1/quick/media", { method: "POST", body: fd })) });
    } else if (info.menuItemId === "mirage-audio") {
      const fd = new FormData();
      fd.append("file", await fetchAsFile(info.srcUrl, "voice.ogg"));
      await showResult({ kind: "voice", input: info.srcUrl, ...(await call("/v1/voice/triage", { method: "POST", body: fd })) });
    }
  } catch (e) {
    await showResult({ kind: "error", error: String(e.message || e) });
  }
});

// ---- tab-audio shield ---------------------------------------------------------------------------------------------
// tabCapture needs a user gesture (the popup button) and an offscreen document to hold the MediaStream in MV3.

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA"], justification: "Analyse the tab's call audio in 3-second chunks." });
}

let shieldState = { on: false, tabId: null, title: "", chunks: 0, worst: 0, last: null, transcript: "" };

async function startShield(tabId, title) {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  const s = await settings();
  shieldState = { on: true, tabId, title, chunks: 0, worst: 0, last: null, transcript: "" };
  await chrome.storage.session.set({ shield: shieldState });
  chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId, api: s.api, token: s.token });
  chrome.action.setBadgeText({ text: "ON" });
  chrome.action.setBadgeBackgroundColor({ color: "#0891b2" });
}

async function stopShield() {
  chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
  shieldState.on = false;
  await chrome.storage.session.set({ shield: shieldState });
  chrome.action.setBadgeText({ text: "" });
}

function onChunk(r) {
  shieldState.chunks += 1;
  shieldState.last = r;
  if (r.text) shieldState.transcript = (shieldState.transcript + " " + r.text).slice(-1200);
  const spoof = r.spoof ?? 0;
  const sensitive = ["payment", "credential", "remote_access"].includes(r.action);
  const risk = Math.max(spoof, sensitive ? 0.6 + 0.4 * (r.manipulation || 0) : (r.manipulation || 0) * 0.6);
  const before = shieldState.worst;
  shieldState.worst = Math.max(before, risk);
  chrome.storage.session.set({ shield: shieldState });
  chrome.action.setBadgeText({ text: String(Math.round(shieldState.worst * 100)) });
  chrome.action.setBadgeBackgroundColor({ color: shieldState.worst >= 0.7 ? "#e11d48" : shieldState.worst >= 0.4 ? "#d97706" : "#059669" });
  if (before < 0.7 && shieldState.worst >= 0.7) {
    const why = spoof >= 0.7 ? "The voice on this call looks machine-generated." : "The caller is asking for something sensitive under pressure.";
    chrome.notifications.create({ type: "basic", iconUrl: "icon.png", priority: 2, title: "MIRAGE: stop and verify",
      message: `${why} Do not pay or share codes. Hang up and call back on a saved number.` });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "shield-start") { startShield(msg.tabId, msg.title).then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e.message || e) })); return true; }
  if (msg.type === "shield-stop") { stopShield().then(() => reply({ ok: true })); return true; }
  if (msg.type === "chunk-result") onChunk(msg.result);
  if (msg.type === "chunk-error") chrome.storage.session.set({ shieldError: msg.error });
  if (msg.type === "scan-email") {
    // content scripts cannot call localhost across origins; the worker does it for them
    call("/v1/quick/text", { method: "POST", body: JSON.stringify({ text: msg.text }) })
      .then((r) => reply({ ok: true, result: r }), (e) => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "check-voice-data") {
    // a WhatsApp Web voice note the user played and asked about (see whatsapp.js)
    (async () => {
      const blob = await (await fetch(msg.dataUrl)).blob();
      const fd = new FormData();
      fd.append("file", new File([blob], msg.mime.includes("ogg") ? "voice-note.ogg" : "voice-note.webm", { type: msg.mime }));
      const r = await call("/v1/voice/triage", { method: "POST", body: fd });
      await showResult({ kind: "voice", input: "WhatsApp Web voice note", ...r });
      return { ok: true, severity: r.stage3.severity, label: r.stage1.label };
    })().then(reply, (e) => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "open-result") { showResult(msg.result); }
  return false;
});
