/* ICU Clinical Notes v9 - local IndexedDB cache and unsaved-draft store (keeps v8 DB name for draft/cache continuity) */
(function(global){
  'use strict';
  const DB_NAME='icu_clinical_notes_v8';
  const DB_VERSION=1;
  let dbPromise=null;

  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in global)){reject(new Error('IndexedDB is unavailable in this browser.'));return;}
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv',{keyPath:'key'});
        if(!db.objectStoreNames.contains('drafts')){
          const s=db.createObjectStore('drafts',{keyPath:'key'});
          s.createIndex('userId','userId',{unique:false});
          s.createIndex('admissionId','admissionId',{unique:false});
          s.createIndex('updatedAt','updatedAt',{unique:false});
        }
      };
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db);};
      req.onerror=()=>reject(req.error||new Error('Unable to open local database.'));
    });
    return dbPromise;
  }
  async function tx(store,mode,fn){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(store,mode),s=t.objectStore(store);let result;
      try{result=fn(s);}catch(e){reject(e);return;}
      t.oncomplete=()=>resolve(result);
      t.onerror=()=>reject(t.error||new Error('Local database operation failed.'));
      t.onabort=()=>reject(t.error||new Error('Local database operation aborted.'));
    });
  }
  async function getKV(key){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const t=db.transaction('kv','readonly'),r=t.objectStore('kv').get(key);
      r.onsuccess=()=>resolve(r.result?r.result.value:null);r.onerror=()=>reject(r.error);
    });
  }
  async function putKV(key,value){return tx('kv','readwrite',s=>s.put({key,value,updatedAt:new Date().toISOString()}));}
  async function delKV(key){return tx('kv','readwrite',s=>s.delete(key));}
  async function putDraft(draft){draft=Object.assign({},draft,{updatedAt:new Date().toISOString()});return tx('drafts','readwrite',s=>s.put(draft));}
  async function getDraft(key){
    const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('drafts','readonly').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
  }
  async function deleteDraft(key){return tx('drafts','readwrite',s=>s.delete(key));}
  async function listDrafts(userId){
    const db=await open();return new Promise((resolve,reject)=>{
      const out=[],t=db.transaction('drafts','readonly'),idx=t.objectStore('drafts').index('userId'),r=idx.openCursor(IDBKeyRange.only(userId));
      r.onsuccess=()=>{const c=r.result;if(c){out.push(c.value);c.continue();}else resolve(out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))));};r.onerror=()=>reject(r.error);
    });
  }
  async function clearUser(userId){
    const drafts=await listDrafts(userId);for(const d of drafts)await deleteDraft(d.key);
    await delKV('bootstrap:'+userId).catch(()=>{});
    const db=await open();
    await new Promise((resolve,reject)=>{
      const t=db.transaction('kv','readwrite'),s=t.objectStore('kv'),r=s.openCursor();
      r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith('bundle:'+userId+':'))c.delete();c.continue();}else resolve();};r.onerror=()=>reject(r.error);
    });
  }
  const api={
    available:()=>('indexedDB' in global),
    open,
    cacheBootstrap:(userId,data)=>putKV('bootstrap:'+userId,data),
    getBootstrap:userId=>getKV('bootstrap:'+userId),
    cacheBundle:(userId,admissionId,data)=>putKV('bundle:'+userId+':'+admissionId,data),
    getBundle:(userId,admissionId)=>getKV('bundle:'+userId+':'+admissionId),
    putDraft,getDraft,deleteDraft,listDrafts,clearUser,
    putKV,getKV,delKV
  };
  global.ICULocalDB=api;
})(window);
