const $ = (id) => document.getElementById(id);

function showErr(e) { $("err").textContent = e ? String(e.message || e) : ""; }

function voiceSummary(r) {
  const s1 = r.stage1, sem = r.stage2.semantics;
  const c = s1.verdict === "ai" ? "#fb7185" : s1.verdict === "human" ? "#6ee7b7" : "#c7cfdd";
  const models = Object.entries(s1.models || {}).map(([m, v]) => `<span class="chip">${esc(m.split("/").pop())} ${v.toFixed(2)}</span>`).join("");
  return `<div class="verdict"><div class="label" style="margin-top:0">1 · Voice</div><b style="color:${c}">${esc(s1.label)}</b>
      <span class="muted"> · ${(s1.score ?? 0).toFixed(2)}</span><div class="chips">${models}</div>
      <div class="label">2 · What it says</div><div>${esc(r.stage2.transcript || "No intelligible speech")}</div>
      ${sem ? `<div class="chips">${sem.tactics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}<span class="chip">asks: ${esc(sem.action)}</span></div>` : ""}
      <div class="label">3 · Verdict</div><div>${esc(r.stage3.why)}</div></div>`;
}

async function boot() {
  const s = await settings();
  $("api").value = s.api;
  if (!s.token) {
    $("login").hidden = false;
    try {
      const res = await fetch(`${s.api}/v1/auth/personas`);
      const ps = await res.json();
      $("persona").innerHTML = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.role)}</option>`).join("");
    } catch (_) {
      $("loginErr").textContent = "Cannot reach the MIRAGE server. Start the backend, or fix the URL above.";
    }
    return;
  }
  $("main").hidden = false;
  $("who").textContent = `Signed in as ${s.persona || "persona"}`;
  $("autoGmail").checked = !!s.autoGmail;
  const { shield } = await chrome.storage.session.get("shield");
  renderShield(shield);
}

$("signin").onclick = async () => {
  const api = $("api").value.replace(/\/$/, "") || DEFAULTS.api;
  try {
    const res = await fetch(`${api}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona_id: $("persona").value }) });
    if (!res.ok) throw new Error("Sign-in failed");
    const j = await res.json();
    await chrome.storage.local.set({ api, token: j.token, persona: j.persona.name });
    location.reload();
  } catch (e) { $("loginErr").textContent = String(e.message || e); }
};
$("api").onchange = async () => { await chrome.storage.local.set({ api: $("api").value.replace(/\/$/, "") }); location.reload(); };
$("signout").onclick = async (e) => { e.preventDefault(); await chrome.storage.local.set({ token: null }); location.reload(); };
$("autoGmail").onchange = (e) => chrome.storage.local.set({ autoGmail: e.target.checked });

document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll("[data-pane]").forEach((p) => p.hidden = p.dataset.pane !== b.dataset.tab);
  $("out").innerHTML = ""; showErr(null);
});

$("checkText").onclick = async () => {
  showErr(null); $("checkText").disabled = true; $("out").innerHTML = "";
  try {
    const r = await call("/v1/quick/text", { method: "POST", body: JSON.stringify({ text: $("text").value }) });
    const sem = r.semantics;
    $("out").innerHTML = `<div class="verdict"><b>${esc(sem.category_label)}</b><div class="muted">${esc(sem.summary)}</div>
      <div class="chips">${sem.tactics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></div>` + renderPlan(r.response);
  } catch (e) { showErr(e); } finally { $("checkText").disabled = false; }
};

$("checkFile").onclick = async () => {
  const f = $("file").files[0];
  if (!f) return showErr("Choose a file first.");
  showErr(null); $("checkFile").disabled = true; $("checkFile").textContent = "Checking…"; $("out").innerHTML = "";
  try {
    const fd = new FormData(); fd.append("file", f);
    const isAudio = f.type.startsWith("audio") || /\.(ogg|opus|m4a|mp3|wav|weba)$/i.test(f.name);
    if (isAudio) {
      const r = await call("/v1/voice/triage", { method: "POST", body: fd });
      $("out").innerHTML = voiceSummary(r) + renderPlan(r.response);
    } else {
      const r = await call("/v1/quick/media", { method: "POST", body: fd });
      $("out").innerHTML = `<div class="verdict"><b>${esc(r.label)}</b><span class="muted"> · ${r.score.toFixed(2)}</span><div class="muted">${esc(r.summary)}</div></div>` + renderPlan(r.response);
    }
  } catch (e) { showErr(e); } finally { $("checkFile").disabled = false; $("checkFile").textContent = "Check file"; }
};

function renderShield(sh) {
  const on = sh && sh.on;
  $("shieldBtn").textContent = on ? "Stop shield" : "Shield this tab";
  $("shieldBtn").className = on ? "btn red" : "btn";
  if (!sh) { $("shieldOut").innerHTML = ""; return; }
  const w = sh.worst || 0, c = w >= 0.7 ? "#fb7185" : w >= 0.4 ? "#fbbf24" : "#6ee7b7";
  const last = sh.last || {};
  $("shieldOut").innerHTML = `<div class="verdict"><div class="row" style="justify-content:space-between"><b style="color:${c}">Risk ${Math.round(w * 100)}</b>
    <span class="muted">${sh.chunks} chunks · ${esc(sh.title || "")}</span></div>
    <div class="meter"><i style="width:${w * 100}%;background:${c}"></i></div>
    <div class="chips"><span class="chip">voice spoof ${last.spoof == null ? "–" : last.spoof.toFixed(2)}</span><span class="chip">asks: ${esc(last.action || "none")}</span>
    ${(last.tactics || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
    <div class="live">${esc(sh.transcript || "Listening…")}</div></div>`;
}

$("shieldBtn").onclick = async () => {
  showErr(null);
  const { shield } = await chrome.storage.session.get("shield");
  if (shield && shield.on) { await chrome.runtime.sendMessage({ type: "shield-stop" }); return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const r = await chrome.runtime.sendMessage({ type: "shield-start", tabId: tab.id, title: tab.title });
  if (!r || !r.ok) showErr(r ? r.error : "Could not capture this tab.");
};

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "session" && ch.shield) renderShield(ch.shield.newValue);
  if (area === "session" && ch.shieldError) showErr(ch.shieldError.newValue);
});

boot();
