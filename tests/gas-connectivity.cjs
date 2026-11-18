const {chromium}=require('playwright-core');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{let p=await b.newPage({viewport:{width:390,height:844}}), response=await p.goto('https://kota0317.github.io/haruki-basketball-quest/',{waitUntil:'domcontentloaded',timeout:30000});
 if(!response.ok())throw Error('GitHub Pages returned '+response.status());
 const result=await p.evaluate(async(url)=>{try{let r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:'synthetic-test-only',redirect:'follow'});return {ok:r.ok,status:r.status,body:await r.text()}}catch(e){return {error:String(e)}}},'https://script.google.com/macros/s/AKfycbzCAjdgMDVEgFMMt4Vy2CAlQ_6Pg4J-sSPUqqMXbkedh9k_dtdaq4h5KneR61p4z0nePQ/exec');
 if(result.error)throw Error('Cross-origin POST failed: '+result.error);
 const v=JSON.parse(result.body);if(!result.ok||v.body!=='synthetic-test-only')throw Error('Unexpected response '+result.status);
 console.log('PASS GitHub Pages origin -> Apps Script simple POST and readable response');
 }finally{await b.close()}
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1});
