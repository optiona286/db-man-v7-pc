// 看盤 PRO — Service Worker
// 更新版本號可強制清除舊快取
const APP_VER  = 'kanpan-v1';
const CDN_VER  = 'kanpan-cdn-v1';

// App shell — 安裝時預先快取
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

// ── Install：預快取 App Shell ──────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_VER)
      .then(cache => cache.addAll(
        APP_SHELL.map(u => new Request(u, { cache: 'reload' }))
      ).catch(() => {}))          // icon-192/512 可能尚未存在，忽略錯誤
      .then(() => self.skipWaiting())
  );
});

// ── Activate：清除舊版快取 ─────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_VER && k !== CDN_VER)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch 策略 ────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // 只處理 GET
  if (req.method !== 'GET') return;

  // CDN 資源（ECharts、sql.js）→ Cache-First
  if (url.hostname === 'cdn.jsdelivr.net' ||
      url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(cdnFirst(req));
    return;
  }

  // 同源 App Shell → Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req));
  }
});

// CDN：先查快取，無快取再從網路抓並存入
async function cdnFirst(req) {
  const cache = await caches.open(CDN_VER);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('Network error', { status: 503 });
  }
}

// App Shell：立即回傳快取，同時背景更新
async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP_VER);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || await fetchPromise;
}
