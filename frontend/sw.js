// Minimal service worker: caches the app's own static files (HTML/CSS/
// JS) so the UI still loads through a brief network hiccup between the
// browser and the local server, and so the CDN-loaded QZ Tray library
// survives a short internet outage once it's been fetched once.
//
// /api/* requests are NEVER cached -- ticket data must always come from
// the live local database, never a stale cached response.
//
// NETWORK-FIRST, not cache-first: the server this talks to is a local
// process on the same machine, so a live fetch is never meaningfully
// slower than reading the cache -- there's no real performance reason to
// prefer the cache. There IS a real correctness reason not to: an
// earlier cache-first version served a stale cached copy of a page
// immediately and only refreshed the cache in the BACKGROUND for next
// time, so a just-fixed bug could keep appearing to still be broken for
// an extra reload or two. Network-first means the cache is purely a
// fallback for "the server is genuinely unreachable", never something
// that can mask a real fix.
const CACHE_NAME = "dropfix-shell-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        // Only reached if the local server is genuinely unreachable --
        // fall back to whatever was last successfully cached, if anything.
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })
  );
});
