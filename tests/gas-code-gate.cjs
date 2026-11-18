const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let now=10000,locked=false;const code=String(require('node:crypto').randomInt(0,10000)).padStart(4,'0'),wrong=code==='0000'?'0001':'0000',properties=new Map([['TEST_ONLY_CODE',code]]);
const p={getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k)};
const c={Date:{now:()=>now},PropertiesService:{getScriptProperties:()=>p},LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},releaseLock:()=>{locked=false}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>s})},JSON,Number,String};
vm.createContext(c);vm.runInContext(fs.readFileSync('qa/gas-code-gate.gs','utf8'),c);
function invoke(code){return JSON.parse(c.doPost({postData:{contents:JSON.stringify({code})}}))}
assert.equal(invoke(code).ok,true);assert.equal(invoke(wrong).ok,false);assert.equal(invoke(code).ok,true);
for(let i=0;i<3;i++)assert.equal(invoke(wrong).ok,false);
assert.equal(invoke(code).error,'locked');now+=30001;assert.equal(invoke(code).ok,true);
assert.equal(invoke(code+'5').ok,false);console.log('PASS simulated global locking, wrong codes and timeout; no live Apps Script authorization tested');
