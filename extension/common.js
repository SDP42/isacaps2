// Shared helpers for the popup, result page and service worker.
const DEFAULTS = { api: "http://localhost:8000", token: null, persona: null, autoGmail: false };

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function call(path, init = {}) {
  const s = await settings();
  const headers = new Headers(init.headers || {});
  if (s.token) headers.set("authorization", `Bearer ${s.token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const res = await fetch(`${s.api}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch (_) { /* not JSON */ }
    throw new Error(res.status === 401 ? "Sign in to MIRAGE first (open the extension popup)." : msg);
  }
  return res.json();
}

const SEV_COLOR = { CRITICAL: "#fb7185", HIGH: "#fb7185", MEDIUM: "#fbbf24", LOW: "#6ee7b7", INCONCLUSIVE: "#c7cfdd" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Render the "what now" response plan returned by every MIRAGE triage endpoint.
function renderPlan(plan, headlineExtra = "") {
  const c = SEV_COLOR[plan.severity] || "#c7cfdd";
  const list = (xs) => xs.map((x) => `<li>${esc(x)}</li>`).join("");
  const report = plan.report_to.map((r) =>
    `<a class="report" ${r.href ? `href="${esc(r.href)}" target="_blank"` : ""}><b>${esc(r.label)}</b><span>${esc(r.why)}</span></a>`).join("");
  return `
    <div class="plan" style="border-color:${c}55">
      <div class="plan-head" style="background:${c}18">
        <div class="sev" style="color:${c}">WHAT NOW · ${esc(plan.severity)}</div>
        <div class="headline">${esc(plan.headline)}</div>
        <div class="cat">${esc(plan.category_label)}${headlineExtra}</div>
        ${plan.report_to.some((r) => r.id === "1930") ? `<a class="call" href="tel:1930">Call 1930</a>` : ""}
      </div>
      <div class="plan-body">
        <div class="label">Do this now</div><ol>${list(plan.do_now)}</ol>
        ${plan.say_this ? `<div class="say"><div class="label">Say this, then hang up</div>“${esc(plan.say_this)}”</div>` : ""}
        ${plan.dont.length ? `<div class="label">Don't</div><ul class="dont">${list(plan.dont)}</ul>` : ""}
        ${report ? `<div class="label">Report to</div>${report}` : ""}
        ${plan.if_paid.length ? `<details><summary>Already paid or shared a code?</summary><ol>${list(plan.if_paid)}</ol></details>` : ""}
      </div>
    </div>`;
}
