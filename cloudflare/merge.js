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
  function merge(base,local,remote) {
    const conflicts=[];
    function walk(b,l,r,path) {
      if(same(l,r))return l;
      if(same(l,b))return r;
      if(same(r,b))return l;
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
    return {value,conflicts};
  }
  // No common ancestor exists at first pairing. Only provably lossless unions
  // are automatic; ambiguous histories / progression block the operation.
  function initial(local,remote) {
    const menuConflicts=[],blocked=[];
    const copy=x=>JSON.parse(JSON.stringify(x));
    function walk(l,r,path) {
      if(same(l,r))return l===missing?missing:copy(l);
      if(l===missing)return copy(r); if(r===missing)return copy(l);
      if(path.length===3 && path[0]==='questData' && path[1]==='menus'){
        menuConflicts.push({path,local:copy(l),remote:copy(r)});return copy(l);
      }
      if(isObject(l)&&isObject(r)){
        const out=Object.create(null);for(const k of new Set([...Object.keys(l),...Object.keys(r)])){
          const val=walk(Object.hasOwn(l,k)?l[k]:missing,Object.hasOwn(r,k)?r[k]:missing,path.concat(k));
          if(val!==missing)Object.defineProperty(out,k,{value:val,enumerable:true,configurable:true,writable:true});
        }return out;
      }
      if(Array.isArray(l)&&Array.isArray(r)){
        if(!l.length)return copy(r);if(!r.length)return copy(l);
      }
      if(path.join('.')==='rpg.bonusXP' && Number.isFinite(l)&&Number.isFinite(r)){
        if(l===0)return r;if(r===0)return l;
      }
      blocked.push({path,local:copy(l),remote:copy(r)});return copy(l);
    }
    return {value:walk(local,remote,[]),menuConflicts,blocked};
  }
  const api={merge,initial};
  if(typeof module!=='undefined')module.exports=api;else root.HQMerge=api;
})(typeof globalThis==='undefined'?this:globalThis);

