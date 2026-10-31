(async () => {
  const { lastResult: r } = await chrome.storage.session.get("lastResult");
  const out = document.getElementById("out");
  if (!r) { out.textContent = "No result yet."; return; }
  if (r.kind === "error") { out.innerHTML = `<div class="err">${esc(r.error)}</div>`; return; }
  let head = "";
  if (r.kind === "text") {
    const s = r.semantics;
    head = `<div class="verdict"><div class="label" style="margin-top:0">Message</div><div>${esc(r.input).slice(0, 400)}</div>
      <div class="chips">${s.tactics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}<span class="chip">asks: ${esc(s.action)}</span></div></div>`;
  } else if (r.kind === "media") {
    head = `<div class="verdict"><b>${esc(r.label)}</b><span class="muted"> · ${r.score.toFixed(2)}</span><div class="muted">${esc(r.summary)}</div></div>`;
  } else if (r.kind === "voice") {
    head = `<div class="verdict"><b>${esc(r.stage1.label)}</b><span class="muted"> · ${(r.stage1.score ?? 0).toFixed(2)}</span>
      <div style="margin-top:6px">${esc(r.stage2.transcript || "")}</div><div class="muted" style="margin-top:6px">${esc(r.stage3.why)}</div></div>`;
  }
  out.className = "";
  out.innerHTML = head + renderPlan(r.response);
})();
