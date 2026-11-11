/* Service worker — Manual Técnico Wen. Cache-first: funciona 100% offline após a primeira abertura. */
const CACHE = 'wen-manual-7b74054ccb';
const ASSETS = ["./", "index.html", "manifest.webmanifest", "css/app.css", "js/icons.js", "js/engine.js", "js/app.js", "data.json", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-32.png", "icons/icon-512.png", "icons/maskable-512.png", "media/m1.webp", "media/m10.webp", "media/m100.webp", "media/m101.webp", "media/m102.webp", "media/m103.webp", "media/m104.webp", "media/m105.webp", "media/m106.webp", "media/m107.webp", "media/m11.webp", "media/m12.webp", "media/m13.webp", "media/m14.webp", "media/m15.webp", "media/m16.webp", "media/m17.webp", "media/m18.webp", "media/m19.webp", "media/m2.webp", "media/m20.webp", "media/m21.webp", "media/m22.webp", "media/m23.webp", "media/m24.webp", "media/m25.webp", "media/m26.webp", "media/m27.webp", "media/m28.webp", "media/m29.webp", "media/m3.webp", "media/m30.webp", "media/m31.webp", "media/m32.webp", "media/m33.webp", "media/m34.webp", "media/m35.webp", "media/m36.webp", "media/m37.webp", "media/m38.webp", "media/m39.webp", "media/m4.webp", "media/m40.webp", "media/m41.webp", "media/m42.webp", "media/m43.webp", "media/m44.webp", "media/m45.webp", "media/m46.webp", "media/m47.webp", "media/m48.webp", "media/m49.webp", "media/m5.webp", "media/m50.webp", "media/m51.webp", "media/m52.webp", "media/m53.webp", "media/m54.webp", "media/m55.webp", "media/m57.webp", "media/m58.webp", "media/m59.webp", "media/m6.webp", "media/m60.webp", "media/m61.webp", "media/m62.webp", "media/m63.webp", "media/m64.webp", "media/m65.webp", "media/m66.webp", "media/m67.webp", "media/m68.webp", "media/m69.webp", "media/m7.webp", "media/m70.webp", "media/m71.webp", "media/m72.webp", "media/m73.webp", "media/m74.webp", "media/m75.webp", "media/m76.webp", "media/m77.webp", "media/m78.webp", "media/m79.webp", "media/m8.webp", "media/m80.webp", "media/m81.webp", "media/m82.webp", "media/m83.webp", "media/m84.webp", "media/m85.webp", "media/m86.webp", "media/m87.webp", "media/m88.webp", "media/m89.webp", "media/m9.webp", "media/m90.webp", "media/m91.webp", "media/m92.webp", "media/m93.webp", "media/m94.webp", "media/m95.webp", "media/m96.webp", "media/m97.webp", "media/m98.webp", "media/m99.webp"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('wen-manual-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
