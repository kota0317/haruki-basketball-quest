'use strict';
const CACHE='haruki-static-v6';
const ASSETS=['./','index.html','style.css','game.js','eiken-words.js','eiken.js','app.js','quest-ui.js','reading.js','experience.js','assets/haruki-growth.webp'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('haruki-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){let copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(async()=>{let hit=await caches.match(event.request,{ignoreSearch:true});return hit||(event.request.mode==='navigate'?caches.match('./'):Response.error())}))});
