// PWA install support (manifest.json) stays active, but the service
// worker (sw.js) is NOT registered while the app is still under active,
// rapid iteration -- a service worker's whole point is showing you
// something without waiting on the network, which is exactly the wrong
// behaviour when files are changing every few minutes and you need to
// see the CURRENT version, not a recently-cached one. A stale cache from
// an earlier version of sw.js was the actual cause of a real bug report
// (fault/payment totals "not updating") that turned out to be the UI
// working correctly underneath a stale cached copy of itself.
//
// This actively UNREGISTERS any service worker a browser already
// installed before this change, and clears its cache, so a machine that
// hit the app earlier doesn't stay stuck on old cached files. Once the
// app is feature-complete and no longer changing underneath active
// testing, sw.js can be registered again the same way this used to.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
if ("caches" in window) {
  caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
}
