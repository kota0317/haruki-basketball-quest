'use strict';
const {chromium}=require('playwright-core'),assert=require('node:assert/strict');
(async()=>{const origin=process.env.HQ_RESTORE_URL;assert(origin);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const p=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});p.on('dialog',d=>d.accept());
 const writes=[];p.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.method()+' '+r.url())});
 await p.goto(origin+'/',{waitUntil:'domcontentloaded'});await p.evaluate(()=>go('PARENT'));
 const data={sessions:[{date:'2026-11-20',kind:'学校',subject:'合成データ',minutes:30}],answers:[{id:'fake',correct:true}],matches:[{id:'fake-match',won:true}],settings:{club:true,exam:false},questData:{menus:[{id:'fake-menu',title:'合成メニュー',deleted:true}],completions:{'fake-menu@2026-11-20':{id:'fake-menu',date:'2026-11-20',xp:10}}},rpg:{bonusXP:5,awards:{'word:2026-11-20:enjp:1':true},unlocked:{three:true},titles:{},plays:[{kind:'合成'}]},eikenDaily:{days:{'2026-11-20':{synthetic:true}}}};
 await p.locator('input[type=file]').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await p.waitForFunction(()=>s.sessions[0]?.subject==='合成データ');await p.reload();
 assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('haruki-quest-prototype-v1'))),data);
 assert.equal(await p.evaluate(()=>typeof window.HQ_SYNC_API),'undefined');assert.equal(await p.evaluate(()=>localStorage.getItem('hq-sync-code-v1')),null);
 assert.deepEqual(writes,[]);console.log('PASS isolated restore keeps synthetic menu, history, XP, game and Eiken records in local storage without sync');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
