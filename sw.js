'use strict';
const CACHE='haruki-static-v15';
const ASSETS=['./','index.html','style.css','game.js','eiken-words.js','eiken.js','app.js','quest-ui.js','reading.js','experience.js','rpg.js','opening.js','cloudflare/merge.js','cloudflare/sync-config.js','cloudflare/sync-client.js','assets/haruki-growth.webp','assets/haruki-action.webp','assets/haruki-three.webp','assets/haruki-spin.webp','assets/haruki-alley.webp'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('haruki-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
let videoFetch;
async function openingVideo(request){
 const cache=await caches.open(CACHE),url=new URL(request.url),key=url.origin+url.pathname;
 let full=await cache.match(key);
 if(!full){
  if(!videoFetch)videoFetch=fetch(key).then(async response=>{if(!response.ok)throw Error('video unavailable');try{await cache.put(key,response.clone())}catch{}return response}).finally(()=>{videoFetch=null});
  full=(await videoFetch).clone();
 }
 let range=request.headers.get('range');if(!range)return full;
 const data=await full.arrayBuffer(), match=/^bytes=(\d+)-(\d*)$/.exec(range);
 if(!match)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.byteLength}});
 const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),data.byteLength-1):data.byteLength-1;
 if(start>end||start>=data.byteLength)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.byteLength}});
 return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${data.byteLength}`,'Content-Length':String(end-start+1)}});
}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(new URL(event.request.url).pathname.endsWith('/assets/match-opening.mp4')){event.respondWith(openingVideo(event.request));return}
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.status!==206){let copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response}).catch(async()=>{let hit=await caches.match(event.request,{ignoreSearch:true});return hit||(event.request.mode==='navigate'?caches.match('./'):Response.error())}))});

