// Adds the headers that let the voice model use several processor cores (cross-origin isolation).
// GitHub Pages cannot send them itself. Nothing is cached here; every request still goes to the network.
// The app's own pages and code are always checked with the server (no-cache), so a new version shows up on the
// next visit instead of an old copy kept by the phone's browser. Unchanged files still come back quickly (304).
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.cache==='only-if-cached'&&r.mode!=='same-origin')return;
  const own=new URL(r.url).origin===location.origin&&/(\/|\.html|\.js|\.mjs|\.css|\.json)$/.test(new URL(r.url).pathname)&&r.method==='GET';
  const req=r.mode==='no-cors'?new Request(r,{credentials:'omit'}):own&&r.mode!=='navigate'?new Request(r,{cache:'no-cache'}):r;
  e.respondWith((own&&r.mode==='navigate'?fetch(r.url,{cache:'no-cache',credentials:'same-origin'}):fetch(req)).then(res=>{if(res.status===0)return res;const h=new Headers(res.headers);h.set('Cross-Origin-Embedder-Policy','credentialless');h.set('Cross-Origin-Opener-Policy','same-origin');return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})}))});
