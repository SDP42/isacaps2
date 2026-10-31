// Opt-in automatic scan of the email you open in Gmail. Adds a small banner above the message with MIRAGE's verdict.
// Gmail's DOM is not a public API: `.a3s` (message body) is the selector that has been stable for years.
const seen = new WeakSet();

async function enabled() {
  const { autoGmail, token } = await chrome.storage.local.get(["autoGmail", "token"]);
  return autoGmail && token;
}

function banner(el, r) {
  const sev = r.severity, plan = r.response;
  const color = { CRITICAL: "#e11d48", HIGH: "#e11d48", MEDIUM: "#d97706", LOW: "#059669" }[sev] || "#64748b";
  if (sev === "LOW") return; // stay quiet on ordinary mail
  const b = document.createElement("div");
  b.style.cssText = `margin:0 0 12px;padding:10px 14px;border-radius:10px;border:1px solid ${color};background:${color}14;font:13px system-ui;color:#111;display:flex;gap:12px;align-items:center`;
  b.innerHTML = `<b style="color:${color}">MIRAGE · ${sev}</b><span style="flex:1">${plan.headline}. ${plan.do_now[0] || ""}</span>`;
  const more = document.createElement("button");
  more.textContent = "What to do";
  more.style.cssText = `border:0;border-radius:999px;padding:5px 12px;background:${color};color:#fff;cursor:pointer`;
  more.onclick = () => chrome.runtime.sendMessage({ type: "open-result", result: { kind: "text", input: el.innerText.slice(0, 600), ...r } });
  b.appendChild(more);
  el.parentElement.insertBefore(b, el);
}

async function scan() {
  if (!(await enabled())) return;
  for (const el of document.querySelectorAll("div.a3s")) {
    if (seen.has(el)) continue;
    seen.add(el);
    const text = el.innerText.trim();
    if (text.length < 20) continue;
    chrome.runtime.sendMessage({ type: "scan-email", text: text.slice(0, 4000) }, (res) => {
      if (res && res.ok) banner(el, res.result);
    });
  }
}

new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true });
scan();
