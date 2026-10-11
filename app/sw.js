// Adds the headers that let the voice model use several processor cores (cross-origin isolation).
// GitHub Pages cannot send them itself. Nothing is cached here; every request still goes to the network.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.cache==='only-if-cached'&&r.mode!=='same-origin')return;
  const req=r.mode==='no-cors'?new Request(r,{credentials:'omit'}):r;
  e.respondWith(fetch(req).then(res=>{if(res.status===0)return res;const h=new Headers(res.headers);h.set('Cross-Origin-Embedder-Policy','credentialless');h.set('Cross-Origin-Opener-Policy','same-origin');return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})}))});
