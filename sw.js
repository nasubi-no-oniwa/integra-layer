/* インテグラ・レイヤー  2回目から速く開くための保存（絵・音・版つきのプログラムだけ）
   ページ本体・version.txt・データベースはいつも最新を取りにいく（自動更新はそのまま） */
const C = 'il-assets-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  const p = u.pathname;
  const ok = /\/(img|snd)\//.test(p) || (/\/(js|css)\//.test(p) && u.searchParams.has('v')) || (/\/engine\/core-\d+\.js$/.test(p));
  if (!ok) return;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(r);
    const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net; // 保存があればすぐ出し、裏で新しいものに入れかえる
  }));
});
