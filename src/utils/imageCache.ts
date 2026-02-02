/**
 * Cache persistant d'images via IndexedDB.
 * Survit à la fermeture d'Obsidian.
 */

const DB_NAME = 'lumina-image-cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
    };
  });
}

export function getCachedBlob(path: string): Promise<Blob | null> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(path);
      req.onsuccess = () => {
        const row = req.result as { path: string; blob: Blob } | undefined;
        resolve(row?.blob ?? null);
      };
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  });
}

export function setCachedBlob(path: string, blob: Blob): Promise<void> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put({ path, blob });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  });
}
