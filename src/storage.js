const DB_NAME='proofloom-v1';
let database;
export async function openDB(){
  if(database)return database;
  database=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{for(const name of ['documents','resources','settings'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Browser storage is unavailable. Your work will remain in memory until this page closes. Export it before leaving.'));
  });return database;
}
export async function dbAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function dbPut(store,value){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(structuredClone(value));t.oncomplete=()=>resolve(value);t.onerror=()=>reject(new Error('Could not save in this browser. Storage may be full. Export your work now.'));});}
export async function dbDelete(store,id){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
