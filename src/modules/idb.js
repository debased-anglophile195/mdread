/* Tiny IndexedDB key/value store — persists folder handles and recents so a
   library can be reopened across visits with a single permission grant. */

const DB = "markread",
  STORE = "kv";

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(v, k);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

export async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readonly");
    const rq = t.objectStore(STORE).get(k);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function idbDel(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(k);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
