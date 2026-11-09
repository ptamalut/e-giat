/* Service worker LAKSANA: membuat aplikasi bisa dipasang dan membuka tampilan dasar tanpa internet.
 * Hanya berkas milik sendiri (same-origin) yang disimpan; permintaan ke Supabase (data, foto, berkas) tidak disentuh,
 * sehingga data selalu terbaru dan tidak ada data pengguna yang tersimpan di cache. */
const VERSION = 'v1'
const SHELL = `laksana-shell-${VERSION}`
const ASSETS = `laksana-assets-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // Supabase dan layanan lain: langsung ke jaringan

  // halaman: jaringan dulu (selalu versi terbaru), cadangan dari cache bila offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put('/', copy))
        return res
      }).catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // berkas statis bernama hash (assets/*), ikon, font: cache dulu, simpan saat pertama diunduh
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/') || url.pathname === '/favicon.svg') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})
