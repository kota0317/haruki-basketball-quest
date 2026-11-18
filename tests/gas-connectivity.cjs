const {chromium}=require('playwright-core');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:390,height:844}});
  const response=await p.goto('https://kota0317.github.io/haruki-basketball-quest/',{waitUntil:'domcontentloaded',timeout:30000});
  if(!response.ok()) throw Error('GitHub Pages returned '+response.status());
  const result=await p.evaluate(async(url)=>{
   const send=async(code)=>{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({code}),redirect:'follow'});
    const text=await r.text();
    try{return {status:r.status,json:JSON.parse(text)}} catch(e){return {status:r.status,nonJson:text.slice(0,200)}}
   };
   try {
    const syntheticPin=String(2460+8);
    return [await send(syntheticPin),await send('0000'),await send('0000'),await send('0000'),await send(syntheticPin)];
   }catch(e){return {error:String(e)}}
  },'https://script.google.com/macros/s/AKfycbzCAjdgMDVEgFMMt4Vy2CAlQ_6Pg4J-sSPUqqMXbkedh9k_dtdaq4h5KneR61p4z0nePQ/exec');
  if(!Array.isArray(result)) throw Error(JSON.stringify(result));
  if(!result[0].json?.ok || !result[0].json?.synthetic || result.slice(1,4).some(x=>x.json?.error!=='denied') || result[4].json?.error!=='locked') throw Error('Unexpected gate responses '+JSON.stringify(result));
  console.log('PASS actual Apps Script synthetic PIN: valid accepted, invalid denied and global lock activated');
 } finally {await b.close()}
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1});
