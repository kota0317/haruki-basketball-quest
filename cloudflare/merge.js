/* Pure three-way merge; callers must persist conflicts before applying any result.
   Missing keys are distinct from JSON null. Arrays are treated as atomic values. */
'use strict';
(function(root){
  const missing=Symbol('missing');
  const isObject=x=>x!==null && typeof x==='object' && !Array.isArray(x);
  function stable(x) {
    if(x===missing)return 'MISSING';
    if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
    if(isObject(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
    return JSON.stringify(x);
  }
  const same=(a,b)=>stable(a)===stable(b);
  function eventMap(events){
    const map=new Map(),counts=new Map();
    for(const event of events){
      const base=typeof event?.eventId==='string'&&event.eventId?`id:${event.eventId}`:`legacy:${stable(event)}`;
      const n=counts.get(base)||0;counts.set(base,n+1);map.set(`${base}#${n}`,event);
    }
    return map;
  }
  function mergeLearningEvents(left,right){
    const a=eventMap(left),b=eventMap(right),out=[...left];
    for(const [key,event] of b){
      if(a.has(key)){
        if(!same(a.get(key),event))return null;
      }else out.push(event);
    }
    return out;
  }
  function awardTotal(awards){
    if(!isObject(awards))return null;
    let total=0;
    for(const [k,v] of Object.entries(awards)){
      if(v!==true)return null;
      if(/^word:\d{4}-\d{2}-\d{2}:(enjp|jpen):\d+$/.test(k))total+=5;
      else if(/^(sentence|dialogue):\d{4}-\d{2}-\d{2}:.+$/.test(k))total+=8;
      else if(/^reading:\d{4}-\d{2}-\d{2}:.+$/.test(k))total+=15;
      else if(/^giant:.+$/.test(k))total+=20;
      else return null;
    }
    return Number.isSafeInteger(total)?total:null;
  }
  function validAwardState(r){
    return isObject(r)&&Number.isSafeInteger(r.bonusXP)&&r.bonusXP>=0&&awardTotal(r.awards)===r.bonusXP;
  }
  function merge(base,local,remote) {
    const conflicts=[];
    function walk(b,l,r,path) {
      // Quest completions are durable learning history. Older snapshots may omit
      // records that were already acknowledged on another device; treating that
      // omission as a deletion lets a stale writer erase completed work. Keep
      // the union of completion IDs. Conflicting edits to the same record still
      // use the normal three-way conflict handling below.
      if(path.length===2&&path[0]==='questData'&&path[1]==='completions'&&(isObject(b)||isObject(l)||isObject(r))){
        const bm=isObject(b)?b:Object.create(null),lm=isObject(l)?l:Object.create(null),rm=isObject(r)?r:Object.create(null);
        const out=Object.create(null);
        const keys=new Set([...Object.keys(bm),...Object.keys(lm),...Object.keys(rm)]);
        for(const k of keys){
          const hb=Object.prototype.hasOwnProperty.call(bm,k),hl=Object.prototype.hasOwnProperty.call(lm,k),hr=Object.prototype.hasOwnProperty.call(rm,k);
          let value;
          if(hl&&hr)value=walk(hb?bm[k]:missing,lm[k],rm[k],path.concat(k));
          else if(hl)value=lm[k];
          else if(hr)value=rm[k];
          else if(hb)value=bm[k]; // no tombstones exist, so preserve acknowledged history
          if(value!==missing)Object.defineProperty(out,k,{value,enumerable:true,writable:true,configurable:true});
        }
        return out;
      }
      if(same(l,r))return l;
      // Recurse through the root and questData container even when one side
      // equals the base, so completion IDs can be unioned at their map path.
      const completionAncestor=path.length===0||(path.length===1&&path[0]==='questData');
      if(same(l,b)&&!completionAncestor)return r;
      if(same(r,b)&&!completionAncestor)return l;
      if(path.length===1&&path[0]==='learningEvents'&&Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)){
        const merged=mergeLearningEvents(l,r);
        if(merged)return merged;
      }
      // Only recurse into existing objects. Deletion vs change must be a conflict.
      if(isObject(b)&&isObject(l)&&isObject(r)) {
        const out=Object.create(null);
        const keys=new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)]);
        for(const k of keys) {
          const has=(o)=>Object.prototype.hasOwnProperty.call(o,k);
          const value=walk(has(b)?b[k]:missing,has(l)?l[k]:missing,has(r)?r[k]:missing,path.concat(k));
          if(value!==missing)Object.defineProperty(out,k,{value,enumerable:true,writable:true,configurable:true});
        }
        return out;
      }
      const wrap=x=>x===missing?{exists:false}:{exists:true,value:x};
      conflicts.push({path,base:wrap(b),local:wrap(l),remote:wrap(r)});
      return l; // preview only; caller must not commit until conflicts are resolved
    }
    const value=walk(base,local,remote,[]);
    // The award map is a set of unique events; the total is derived from the
    // merged set, not merged independently as a scalar. Two different +5
    // awards must produce +10 even when both devices report the same +5.
    if(isObject(base?.rpg)&&isObject(local?.rpg)&&isObject(remote?.rpg)){
      const changed=x=>!same({bonusXP:x.bonusXP,awards:x.awards},{bonusXP:base.rpg.bonusXP,awards:base.rpg.awards});
      if(changed(local.rpg)||changed(remote.rpg)){
        const affected=conflicts.some(x=>x.path[0]==='rpg'&&(x.path.length===1||x.path[1]==='awards'));
        if(validAwardState(base.rpg)&&validAwardState(local.rpg)&&validAwardState(remote.rpg)&&!affected&&isObject(value?.rpg)){
          const total=awardTotal(value.rpg.awards);
          if(total!==null){
            value.rpg.bonusXP=total;
            for(let i=conflicts.length-1;i>=0;i--)if(conflicts[i].path[0]==='rpg'&&conflicts[i].path[1]==='bonusXP')conflicts.splice(i,1);
          }
        }else if(!same(local.rpg,remote.rpg)){
          // Unknown provenance must not result in an unexplained total. Keep
          // both whole records for explicit selection and conflict backup.
          for(let i=conflicts.length-1;i>=0;i--)if(conflicts[i].path[0]==='rpg')conflicts.splice(i,1);
          conflicts.push({path:['rpg'],base:{exists:true,value:base.rpg},local:{exists:true,value:local.rpg},remote:{exists:true,value:remote.rpg}});
          value.rpg=local.rpg;
        }
      }
    }
    return {value,conflicts};
  }
  // No common ancestor exists at first pairing. Only provably lossless unions
  // are automatic; ambiguous histories / progression block the operation.
  function initial(local,remote) {
    const menuConflicts=[],blocked=[],hardErrors=[];
    const copy=x=>JSON.parse(JSON.stringify(x));
    const calcAwards=r=>{
      if(r===undefined)return {total:0,keys:{}};
      if(!isObject(r)||!Number.isSafeInteger(r.bonusXP)||r.bonusXP<0||!isObject(r.awards))return null;
      let total=0;for(const [k,v] of Object.entries(r.awards)){
        if(v!==true)return null;
        let points=0;
        if(/^word:\d{4}-\d{2}-\d{2}:(enjp|jpen):\d+$/.test(k))points=5;
        else if(/^(sentence|dialogue):\d{4}-\d{2}-\d{2}:.+$/.test(k))points=8;
        else if(/^reading:\d{4}-\d{2}-\d{2}:.+$/.test(k))points=15;
        else if(/^giant:.+$/.test(k))points=20;
        else return null;
        total+=points;
      }
      return total===r.bonusXP?{total,keys:r.awards}:null;
    };
    for(const [side,value] of [['この端末',local],['相手の端末',remote]]){
      const entries=value?.questData?.completions;
      if(entries!==undefined){
        if(!isObject(entries))hardErrors.push({side,reason:'完了履歴の形式を確認できません'});
        else for(const [key,item] of Object.entries(entries)){
          if(!isObject(item)||typeof item.id!=='string'||typeof item.date!=='string'||key!==item.id+'@'+item.date||!Number.isSafeInteger(item.xp)||item.xp<0)
            hardErrors.push({side,reason:'完了履歴の識別子または XP を確認できません'});
        }
      }
    }
    const a=calcAwards(local?.rpg),b=calcAwards(remote?.rpg);
    let reconciledBonus=null;
    if(a&&b){
      const combined=Object.assign(Object.create(null),a.keys,b.keys);
      const keysOnly={bonusXP:0,awards:combined};
      for(const k of Object.keys(combined)){
        if(k.startsWith('word:'))keysOnly.bonusXP+=5;
        else if(k.startsWith('sentence:')||k.startsWith('dialogue:'))keysOnly.bonusXP+=8;
        else if(k.startsWith('reading:'))keysOnly.bonusXP+=15;
        else if(k.startsWith('giant:'))keysOnly.bonusXP+=20;
      }
      if(calcAwards(keysOnly))reconciledBonus=keysOnly.bonusXP;
    }
    function walk(l,r,path) {
      if(same(l,r))return l===missing?missing:copy(l);
      if(l===missing)return copy(r); if(r===missing)return copy(l);
      if(path.length===1&&path[0]==='learningEvents'&&Array.isArray(l)&&Array.isArray(r)){
        const merged=mergeLearningEvents(l,r);
        if(merged)return merged;
        blocked.push({path,local:copy(l),remote:copy(r)});return copy(l);
      }
      if(path.length===3 && path[0]==='questData' && path[1]==='menus'){
        menuConflicts.push({path,local:copy(l),remote:copy(r)});return copy(l);
      }
      if(path.length===3 && path[0]==='questData' && path[1]==='completions'){
        blocked.push({path,local:copy(l),remote:copy(r)});return copy(l);
      }
      if(path.length===1 && path[0]==='rpg' && reconciledBonus===null){
        const left={bonusXP:l?.bonusXP,awards:l?.awards},right={bonusXP:r?.bonusXP,awards:r?.awards};
        if(!same(left,right)){blocked.push({path,local:copy(l),remote:copy(r)});return copy(l);}
      }
      if(path.join('.')==='rpg.bonusXP' && reconciledBonus!==null)return reconciledBonus;
      if(isObject(l)&&isObject(r)){
        const out=Object.create(null);for(const k of new Set([...Object.keys(l),...Object.keys(r)])){
          const val=walk(Object.hasOwn(l,k)?l[k]:missing,Object.hasOwn(r,k)?r[k]:missing,path.concat(k));
          if(val!==missing)Object.defineProperty(out,k,{value:val,enumerable:true,configurable:true,writable:true});
        }return out;
      }
      if(Array.isArray(l)&&Array.isArray(r)){
        if(!l.length)return copy(r);if(!r.length)return copy(l);
      }
      blocked.push({path,local:copy(l),remote:copy(r)});return copy(l);
    }
    const value=walk(local,remote,[]);
    // The two snapshots can have the same displayed total but disjoint awards.
    if(reconciledBonus!==null && value?.rpg)value.rpg.bonusXP=reconciledBonus;
    return {value,menuConflicts,blocked,hardErrors};
  }
  const api={merge,initial};
  if(typeof module!=='undefined')module.exports=api;else root.HQMerge=api;
})(typeof globalThis==='undefined'?this:globalThis);

