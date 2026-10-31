const DB_NAME='proofloom-v1';
let database=null,storageBroken=false;
export async function openDB(){
  if(database)return database;
  if(storageBroken)throw new Error('Browser storage is unavailable. Your work will remain in memory until this page closes. Export it before leaving.');
  if(typeof indexedDB==='undefined'){storageBroken=true;throw new Error('Browser storage is unavailable here (file:// pages have none). Your work will remain in memory until this page closes. Export it before leaving.');}
  try{
    database=await Promise.race([
      new Promise((resolve,reject)=>{
        const req=indexedDB.open(DB_NAME,1);
        req.onupgradeneeded=()=>{for(const name of ['documents','resources','settings'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Browser storage is unavailable. Your work will remain in memory until this page closes. Export it before leaving.'));
      }),
      // Some contexts (file:// pages in particular) never answer the open
      // request at all — degrade to in-memory mode instead of hanging forever.
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Browser storage did not answer. Your work will remain in memory until this page closes. Export it before leaving.')),4000)),
    ]);
  }catch(error){storageBroken=true;database=null;throw error;}
  return database;
}
export async function dbAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
// Deep clone into plain data (strings, numbers, booleans, arrays, plain
// objects). Browsers throw an opaque DataCloneError — "Too many properties
// to enumerate" — when a stored value carries exotic or oversized members;
// the fallback keeps the save working with what is cloneable.
function plainClone(value,depth=0){
  if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
  if(depth>8)return null;
  if(Array.isArray(value))return value.map(v=>plainClone(v,depth+1));
  if(typeof value==='object'){
    const out={};
    for(const[k,v]of Object.entries(value))out[k]=plainClone(v,depth+1);
    return out;
  }
  return null;
}
export async function dbPut(store,value){
  const db=await openDB();
  let record;
  try{record=structuredClone(value);}
  catch{record=plainClone(value);}
  return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(record);t.oncomplete=()=>resolve(value);t.onerror=()=>reject(new Error('Could not save in this browser. Storage may be full. Export your work now.'));});
}
export async function dbDelete(store,id){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
