'use strict';
// The opponent and active match are already persisted by startMatch before this overlay appears.
let openingActive=false;
const openingStartMatch=startMatch;
startMatch=function(index){
  if(openingActive)return;
  const prior=match;
  openingStartMatch(index);
  if(!match || match===prior || match.finished)return;
  rpgClose();
  showMatchOpening(match.team.name);
};
function showMatchOpening(teamName){
  if(openingActive)return;
  openingActive=true;
  const overlay=document.createElement('div');
  overlay.className='match-opening';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-label','試合オープニング');
  overlay.innerHTML='<div class="opening-stage"><video class="opening-video" playsinline muted preload="auto" aria-label="試合オープニング映像"></video><div class="opening-loading" role="status">TIP OFF 準備中…</div><div class="opening-card" aria-live="polite"><div class="opening-stars"></div><div class="opening-haruki">HARUKI</div><div class="opening-vs">VS</div><div class="opening-team"></div></div></div><button type="button" class="opening-skip">SKIP ›</button>';
  const video=overlay.querySelector('video'), card=overlay.querySelector('.opening-card'), name=overlay.querySelector('.opening-team'), loading=overlay.querySelector('.opening-loading');
  name.textContent=teamName || '対戦チーム';
  name.classList.toggle('long',Array.from(name.textContent).length>12);
  document.body.appendChild(overlay);
  let done=false, cardShown=false, timer, cardTimer;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(cardTimer);video.pause();video.removeAttribute('src');video.load();overlay.remove();openingActive=false};
  const showCard=()=>{if(done||cardShown)return;cardShown=true;clearTimeout(timer);loading.hidden=true;card.classList.add('visible');cardTimer=setTimeout(finish,1800)};
  overlay.querySelector('.opening-skip').addEventListener('click',finish,{once:true});
  video.addEventListener('playing',()=>{loading.hidden=true},{once:true});
  video.addEventListener('ended',showCard,{once:true});
  video.addEventListener('error',showCard,{once:true});
  timer=setTimeout(showCard,12000);
  video.src='assets/match-opening.mp4';
  const play=video.play();
  if(play&&typeof play.catch==='function')play.catch(showCard);
}
