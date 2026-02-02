/**
 * Worker dédié : décodage des images via createImageBitmap.
 * IndexedDB + fetch dans le worker pour garder le thread principal libre.
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

function getCachedBlob(path: string): Promise<Blob | null> {
  return openDB().then((db) => {
    return new Promise<Blob | null>((resolve, reject) => {
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

function setCachedBlob(path: string, blob: Blob): Promise<void> {
  return openDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put({ path, blob });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  });
}

interface LoadRequest {
  id: string;
  url: string;
  path: string;
}

interface LoadSuccess {
  id: string;
  bitmap: ImageBitmap;
}

interface LoadError {
  id: string;
  error: true;
}

self.onmessage = (e: MessageEvent<LoadRequest>) => {
  const { id, url, path } = e.data;
  getCachedBlob(path)
    .then((blob) => {
      if (blob) return createImageBitmap(blob);
      return fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch failed'))))
        .then((b) => {
          setCachedBlob(path, b).catch(() => {});
          return createImageBitmap(b);
        });
    })
    .then((bitmap) => {
      self.postMessage({ id, bitmap } as LoadSuccess, [bitmap]);
    })
    .catch(() => {
      self.postMessage({ id, error: true } as LoadError);
    });
};
