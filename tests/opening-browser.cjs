const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8792/');await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();
 await p.evaluate(()=>{s.sessions=[{date:today(),kind:'英検',minutes:60},{date:today(),kind:'学校',minutes:60}];save();dailyTeams=()=>opponents.map((_,i)=>i)});
 for(const team of ['福岡第一','東山','福岡大学附属大濠']){
  await p.evaluate(name=>{let i=opponents.findIndex(x=>x.name===name);if(i<0)throw Error('missing '+name);startMatch(i)},team);
  assert.equal(await p.locator('.match-opening').count(),1);assert.equal(await p.evaluate(()=>match.team.name),team);
  await p.waitForFunction(()=>{let v=document.querySelector('.opening-video');return v && v.currentTime>.1},{timeout:15000});
  await p.evaluate(()=>document.querySelector('.opening-video').dispatchEvent(new Event('ended')));
  assert.equal(await p.locator('.opening-team').innerText(),team);
  let fit=await p.locator('.opening-team').evaluate(el=>{let r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight});assert.ok(fit,'long name fits');
  assert.equal(await p.locator('body').getByText('Opponent Team Name').count(),0);
  await p.waitForSelector('.match-opening',{state:'detached',timeout:5000});assert.equal(await p.evaluate(()=>s.activeMatch.team.name),team);
 }
 await p.evaluate(()=>startMatch(opponents.findIndex(x=>x.name==='東山')));await p.locator('.opening-skip').click();assert.equal(await p.locator('.match-opening').count(),0);assert.equal(await p.evaluate(()=>match.team.name),'東山');
 await p.evaluate(()=>startMatch(opponents.findIndex(x=>x.name==='福岡第一')));await p.evaluate(()=>{document.querySelector('.opening-video').dispatchEvent(new Event('error'));startMatch(opponents.findIndex(x=>x.name==='東山'))});assert.equal(await p.locator('.opening-team').innerText(),'福岡第一');assert.equal(await p.evaluate(()=>match.team.name),'福岡第一');await p.locator('.opening-skip').click();await p.reload();assert.equal(await p.evaluate(()=>s.activeMatch.team.name),'福岡第一');await p.context().setOffline(true);await p.evaluate(()=>{dailyTeams=()=>opponents.map((_,i)=>i);startMatch(opponents.findIndex(x=>x.name==='東山'))});await p.waitForFunction(()=>document.querySelector('.opening-video')?.currentTime>.1,null,{timeout:10000});await p.locator('.opening-skip').click();await p.context().setOffline(false);assert.deepEqual(errors,[]);
 console.log('PASS opening: real video play, three schools, overflow, saved match, completion, skip, error, double start and offline cached playback');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
