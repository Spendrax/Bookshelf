const V = 'bookshelf-v144';
const FILES = ['./', 'index.html', 'i18n.js', 'i18n/fr.js', 'i18n/es.js', 'i18n/ht.js', 'i18n/pt.js', 'i18n/de.js', 'i18n/it.js', 'css/style.css', 'js/01-core.js', 'js/02-cover-scan-and-pet-placement.js', 'js/03-animal.js', 'js/04-book-lookup-and-details.js', 'js/05-walls-stats-goals-hexagon.js', 'js/06-backup-sharing-pairing.js', 'js/07-import-and-room.js', 'js/08-reading-timer-and-series.js', 'js/09-small-features.js', 'js/10-ebook-reader.js', 'js/11-shelves-journal-rewards.js', 'js/12-secrets-and-news.js', 'js/13-customize.js', 'js/14-install.js', 'js/15-book-view.js', 'js/16-animal-life.js', 'js/17-calm.js', 'js/18-animal-moves.js', 'js/19-speed-quotes-tricks.js', 'js/20-edition-covers.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'privacy.html', 'terms.html'];
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
    r.onsuccess = () => { try { const st = r.result.transaction('kv').objectStore('kv'), g = st.get('remind'), d = st.get('readDay');
      g.onerror = d.onerror = () => res(null); d.onsuccess = () => res({ m: g.result, day: d.result }); } catch (x) { res(null); } };
    r.onerror = () => res(null);
  }).then(x => {
    /* already read today (a reading session or a finished book): no reminder */
    const n = new Date(), today = new Date(n - n.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    if (x && x.day === today) return;
    const m = x && x.m;
    return self.registration.showNotification((m && m.t) || '📚 Time to read!', { body: (m && m.b) || '', icon: 'icon-192.png', tag: 'read-reminder' });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(w => w.length ? w[0].focus() : clients.openWindow('./')));
});
