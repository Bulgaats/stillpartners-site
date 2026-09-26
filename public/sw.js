const CACHE_NAME = "still-partners-v4-public-only";
const APP_SHELL = ["/offline"];
self.addEventListener("install", event => {event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate", event => {event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("still-partners-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch", event => {
 const request=event.request;const url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin)return;
 // Authenticated HTML, APIs, RSC responses and private documents are never cached.
 const publicAsset=url.pathname.startsWith("/_next/static/")||url.pathname.startsWith("/assets/logo/")||url.pathname==="/offline";
 if(publicAsset){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)));}return response;}).catch(()=>caches.match(request).then(hit=>hit||Response.error())));return;}
 if(request.mode==="navigate")event.respondWith(fetch(request).catch(()=>caches.match("/offline").then(hit=>hit||Response.error())));
});
