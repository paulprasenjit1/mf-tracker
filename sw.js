const C='mf-tracker-v36';
const SHELL=['./','./index.html','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
// Live data must never be served from cache: NAVs, AMFI list & news come via these hosts.
const NET_ONLY=['api.mfapi.in','allorigins.win','corsproxy.io'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  if(NET_ONLY.some(h=>u.includes(h))){ // network only, empty JSON when offline
    e.respondWith(fetch(e.request).catch(()=>new Response('{}',{headers:{'Content-Type':'application/json'}})));
    return;
  }
  // app shell + CDN libs: cache first, fall back to network and cache it
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
    const cp=resp.clone(); caches.open(C).then(c=>{try{c.put(e.request,cp);}catch(_){}}); return resp;
  })).catch(()=>new Response('Offline',{status:503,statusText:'Offline'})));
});
