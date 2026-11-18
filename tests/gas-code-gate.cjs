const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let now=10000,locked=false,properties=new Map([['TEST_ONLY_CODE','1234']]);
const p={getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k)};
const c={Date:{now:()=>now},PropertiesService:{getScriptProperties:()=>p},LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},releaseLock:()=>{locked=false}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>s})},JSON,Number,String};
vm.createContext(c);vm.runInContext(fs.readFileSync('qa/gas-code-gate.gs','utf8'),c);
function invoke(code){return JSON.parse(c.doPost({postData:{contents:JSON.stringify({code})}}))}
assert.equal(invoke('1234').ok,true);assert.equal(invoke('9999').ok,false);assert.equal(invoke('1234').ok,true);
for(let i=0;i<3;i++)assert.equal(invoke('0000').ok,false);
assert.equal(invoke('1234').error,'locked');now+=30001;assert.equal(invoke('1234').ok,true);
assert.equal(invoke('12345').ok,false);console.log('PASS simulated global locking, wrong codes and timeout; no live Apps Script authorization tested');
