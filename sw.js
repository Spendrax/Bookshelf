const V = 'bookshelf-v98';
const FILES = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'privacy.html', 'terms.html'];
// GitHub Pages lets browsers reuse files for 10 minutes: 'reload' makes a new version cache the new files, not the old ones
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-site files: answer from cache instantly (works offline), refresh the cache in the background.
// Other sites (book search, covers) are never touched.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); }
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => caches.match('index.html'));
  }));
});

// Daily reading reminder (turned on in Customize > More). Android wakes this about once a day.
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'read-reminder') return;
  e.waitUntil(new Promise(res => {
    const r = indexedDB.open('my-bookshelf', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('remind'); g.onsuccess = () => res(g.result); g.onerror = () => res(null); } catch (x) { res(null); } };
    r.onerror = () => res(null);
  }).then(m => self.registration.showNotification((m && m.t) || '📚 Time to read!', { body: (m && m.b) || '', icon: 'icon-192.png', tag: 'read-reminder' })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(w => w.length ? w[0].focus() : clients.openWindow('./')));
});
