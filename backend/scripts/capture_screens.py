"""Capture README screenshots from a running MIRAGE (API on :8000, web on :5173) with the local Edge or Chrome.

    python scripts/capture_screens.py [case_id]

Needs `pip install playwright` (no browser download: it drives the installed msedge / chrome). Writes
docs/images/*.jpg and resets the demo case's Cure Console afterwards.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

WEB, API = "http://localhost:5173", "http://localhost:8000"
OUT = Path(__file__).resolve().parents[2] / "docs" / "images"
CASE = sys.argv[1] if len(sys.argv) > 1 else "MRG-0466"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    api = httpx.Client(base_url=API, timeout=120)
    token = api.post("/v1/auth/login", json={"persona_id": "analyst"}).json()["token"]
    h = {"authorization": f"Bearer {token}"}
    # stage the Cure Console: a hold placed and money reported as moved 12 minutes ago
    api.post(f"/v1/cases/{CASE}/cure/actions/hold_payment", headers=h, json={})
    api.post(f"/v1/cases/{CASE}/cure/actions/stop_engaging", headers=h, json={})
    at = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() - 12 * 60))
    api.post(f"/v1/cases/{CASE}/cure/paid", headers=h, json={"amount_inr": 4850000, "txn": "UTR526109348812", "to": "918273645501", "at": at})

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="msedge", headless=True)
        except Exception:
            browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, color_scheme="dark")
        ctx.add_init_script(f"localStorage.setItem('mirage.token', {token!r}); localStorage.removeItem('mirage.demo');")
        page = ctx.new_page()

        def shot(path: str, name: str, wait: float = 3.0, full: bool = False, before=None):
            page.goto(WEB + path, wait_until="networkidle")
            time.sleep(wait)
            if before:
                before()
                time.sleep(1.5)
            page.screenshot(path=str(OUT / f"{name}.jpg"), full_page=full, type="jpeg", quality=84)
            print("saved", name)

        shot("/", "landing", wait=5)
        shot("/app/dashboard", "dashboard")
        shot(f"/app/cases/{CASE}/evidence", "case-evidence")
        shot(f"/app/tribunal/{CASE}", "tribunal")
        shot(f"/app/cases/{CASE}/respond", "cure-console",
             before=lambda: (page.get_by_role("button", name="Open draft").nth(3).click(), page.evaluate("window.scrollTo(0, 0)")))

        def voice():
            page.get_by_role("button", name="CFO voice note").click()
            time.sleep(1)
            page.get_by_role("button", name="Check this voice").click()
            page.wait_for_selector("text=Combined verdict", timeout=120_000)
            time.sleep(2)
        shot("/app/voice", "voice-check", before=voice, full=True)

        def terrain():
            page.get_by_role("tab", name="3D terrain").click()
            time.sleep(3)
            page.locator("canvas").scroll_into_view_if_needed()
        shot("/app/redteam", "redteam-terrain", before=terrain)
        shot("/app/redteam", "redteam-lab")
        shot("/app/attack-chain", "attack-chains")
        shot("/app/system", "models")
        browser.close()

    for a in ("hold_payment", "stop_engaging"):
        api.post(f"/v1/cases/{CASE}/cure/actions/{a}", headers=h, json={"undo": True})
    api.post(f"/v1/cases/{CASE}/cure/paid", headers=h, json={"clear": True})


if __name__ == "__main__":
    main()
