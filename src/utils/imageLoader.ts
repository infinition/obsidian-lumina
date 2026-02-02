/**
 * Charge les images avec Worker (createImageBitmap) + cache IndexedDB.
 * Fallback sur le thread principal si le worker échoue (ex: app://).
 */

import { getCachedBlob, setCachedBlob } from './imageCache';

export type CachedImage = HTMLImageElement | ImageBitmap;

export function getImageDimensions(cached: CachedImage): { w: number; h: number } {
  if (cached instanceof HTMLImageElement) {
    return { w: cached.naturalWidth || cached.width, h: cached.naturalHeight || cached.height };
  }
  return { w: cached.width, h: cached.height };
}

export function getAspectRatio(cached: CachedImage): number {
  const { w, h } = getImageDimensions(cached);
  return w && h ? w / h : 1.5;
}

function loadFromBlobMain(
  blob: Blob,
  onLoad: (img: HTMLImageElement | ImageBitmap) => void,
  onError: () => void
): void {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    onLoad(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    onError();
  };
  img.src = url;
}

function loadFromUrlMain(
  url: string,
  onLoad: (img: HTMLImageElement) => void,
  onError: () => void
): void {
  const img = new Image();
  img.onload = () => onLoad(img);
  img.onerror = onError;
  img.src = url;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  string,
  { onLoad: (img: ImageBitmap) => void; onError: () => void; timeout: ReturnType<typeof setTimeout> }
>();

export function initWorker(workerUrl: string): void {
  if (worker) return;
  try {
    worker = new Worker(workerUrl);
    worker.onmessage = (e: MessageEvent<{ id: string; bitmap?: ImageBitmap; error?: true }>) => {
      const { id, bitmap, error } = e.data;
      const cb = pending.get(id);
      if (!cb) return;
      clearTimeout(cb.timeout);
      pending.delete(id);
      if (error) cb.onError();
      else if (bitmap) cb.onLoad(bitmap);
    };
    worker.onerror = () => {
      worker = null;
      pending.forEach((cb) => cb.onError());
      pending.clear();
    };
  } catch {
    worker = null;
  }
}

export function loadImage(
  url: string,
  path: string,
  onLoad: (img: HTMLImageElement | ImageBitmap) => void,
  onError: () => void,
  workerUrl?: string
): void {
  if (workerUrl) initWorker(workerUrl);

  const tryWorker = () => {
    if (!worker) {
      fallbackMain();
      return;
    }
    const id = `img-${++nextId}`;
    const timeout = setTimeout(() => {
      const cb = pending.get(id);
      if (cb) {
        pending.delete(id);
        fallbackMain();
      }
    }, 15000);
    pending.set(id, {
      onLoad: (bitmap) => onLoad(bitmap),
      onError: fallbackMain,
      timeout,
    });
    worker.postMessage({ id, url, path });
  };

  const fallbackMain = () => {
    getCachedBlob(path)
      .then((blob) => {
        if (blob) {
          loadFromBlobMain(blob, onLoad, onError);
          return;
        }
        fetch(url)
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch failed'))))
          .then((blob) => {
            setCachedBlob(path, blob).catch(() => {});
            loadFromBlobMain(blob, onLoad, onError);
          })
          .catch(() => loadFromUrlMain(url, onLoad as (i: HTMLImageElement) => void, onError));
      })
      .catch(() => loadFromUrlMain(url, onLoad as (i: HTMLImageElement) => void, onError));
  };

  if (worker) tryWorker();
  else fallbackMain();
}

const VIDEO_THUMB_SUFFIX = '#thumb';

function captureVideoFrame(
  url: string,
  thumbKey: string,
  onLoad: (img: ImageBitmap) => void,
  onError: () => void
): void {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  const cleanup = () => {
    video.src = '';
    video.load();
  };

  video.onerror = () => {
    cleanup();
    onError();
  };

  video.onseeked = () => {
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      if (c.width === 0 || c.height === 0) {
        cleanup();
        onError();
        return;
      }
      const ctx = c.getContext('2d');
      if (!ctx) {
        cleanup();
        onError();
        return;
      }
      ctx.drawImage(video, 0, 0);
      createImageBitmap(c).then(
        (bitmap) => {
          cleanup();
          c.toBlob(
            (blob) => {
              if (blob) setCachedBlob(thumbKey, blob).catch(() => {});
            },
            'image/jpeg',
            0.85
          );
          onLoad(bitmap);
        },
        () => {
          cleanup();
          onError();
        }
      );
    } catch {
      cleanup();
      onError();
    }
  };

  video.onloadedmetadata = () => {
    video.currentTime = Math.min(0.5, video.duration * 0.1);
  };

  video.src = url;
  video.load();
}

/**
 * Charge une miniature vidéo (frame à ~0.5s) et la met en cache.
 * Utilise IndexedDB pour persister entre sessions.
 */
export function loadVideoThumbnail(
  url: string,
  path: string,
  onLoad: (img: ImageBitmap) => void,
  onError: () => void
): void {
  const thumbKey = path + VIDEO_THUMB_SUFFIX;

  getCachedBlob(thumbKey)
    .then((blob) => {
      if (blob) {
        createImageBitmap(blob).then(onLoad).catch(onError);
        return;
      }
      captureVideoFrame(url, thumbKey, onLoad, onError);
    })
    .catch(() => captureVideoFrame(url, thumbKey, onLoad, onError));
}
