// MIRAGE share target. Android's share sheet POSTs the shared voice note, screenshot, video or text to /share-target;
// this worker parks it in the Cache API and opens /app/share, which runs the right check. It handles nothing else:
// every other request goes straight to the network, so the app never runs from a stale cache.
const BOX = "mirage-share";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;
  event.respondWith((async () => {
    const form = await event.request.formData();
    const cache = await caches.open(BOX);
    for (const k of await cache.keys()) await cache.delete(k); // one share at a time
    const items = [];
    let i = 0;
    for (const f of form.getAll("media")) {
      if (!(f instanceof File) || !f.size) continue;
      const key = `/share-inbox/${i++}`;
      await cache.put(key, new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }));
      items.push({ key, name: f.name, type: f.type, size: f.size });
    }
    const text = [form.get("title"), form.get("text"), form.get("url")].filter(Boolean).join("\n").trim();
    await cache.put("/share-inbox/meta", new Response(JSON.stringify({ items, text, at: Date.now() }), { headers: { "content-type": "application/json" } }));
    return Response.redirect("/app/share", 303);
  })());
});
