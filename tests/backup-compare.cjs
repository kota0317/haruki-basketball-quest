'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const external=[];
 page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8792/'))external.push(r.url())});
 await page.goto('http://127.0.0.1:8792/cloudflare/backup-compare.html');
 const a={sessions:[{minutes:30}],answers:[],matches:[{id:'m'}],settings:{},questData:{menus:[{id:'deleted-id',deleted:true}],completions:{'q@2026-11-20':{id:'q',date:'2026-11-20',xp:10}}},rpg:{bonusXP:5,awards:{'word:2026-11-20:enjp:1':true}},eikenDaily:{days:{}}};
 const b=JSON.parse(JSON.stringify(a));b.questData.menus[0].deleted=false;delete b.questData.completions['q@2026-11-20'];
 await page.locator('#before').setInputFiles({name:'before.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(a))});
 await page.locator('#after').setInputFiles({name:'after.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(b))});
 await page.getByRole('button',{name:'比較する'}).click();await page.waitForFunction(()=>document.getElementById('result').textContent.length>0);const text=await page.locator('#result').innerText();
 assert.match(text,/削除状態が変わったメニュー ID：deleted-id/);assert.match(text,/統合後にない完了履歴 ID：q@2026-11-20/);assert.match(text,/クエスト XP/);assert.deepEqual(external,[]);
 console.log('PASS local-only backup comparison reports IDs, deleted state, history and XP');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
