export interface OfflineSwSnapshot {
  supported: boolean;
  registered: boolean;
  controlling: boolean;
  offlineReady: boolean;
  needRefresh: boolean;
  registrationError: string | null;
  lastCheckedAt: string | null;
}

type Listener = (state: OfflineSwSnapshot) => void;

let currentState: OfflineSwSnapshot = {
  supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  registered: false,
  controlling:
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller),
  offlineReady: false,
  needRefresh: false,
  registrationError: null,
  lastCheckedAt: null,
};

let updateSwFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

function emit() {
  const copy = { ...currentState };
  listeners.forEach((fn) => fn(copy));
}

export function setOfflineSwState(patch: Partial<OfflineSwSnapshot>): void {
  currentState = {
    ...currentState,
    ...patch,
    lastCheckedAt: new Date().toISOString(),
  };
  emit();
}

export function setOfflineSwUpdater(fn: (reloadPage?: boolean) => Promise<void>): void {
  updateSwFn = fn;
}

export function getOfflineSwState(): OfflineSwSnapshot {
  return { ...currentState };
}

export function subscribeOfflineSwState(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...currentState });
  return () => {
    listeners.delete(listener);
  };
}

export async function triggerSwUpdateCheck(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0) {
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
      setOfflineSwState({
        registered: true,
        controlling: Boolean(navigator.serviceWorker.controller),
      });
      return true;
    }
    if (updateSwFn) {
      await updateSwFn(false);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function applyPendingSwRefresh(): Promise<void> {
  if (updateSwFn) {
    await updateSwFn(true);
  } else {
    window.location.reload();
  }
}

/**
 * Warms up essential runtime assets into Cache Storage so the app opens seamlessly when offline.
 */
export async function warmOfflineCacheNow(): Promise<{ cachedCount: number; cacheName: string }> {
  const cacheName = 'apex-offline-shell-manual-v1';
  if (typeof caches === 'undefined') {
    return { cachedCount: 0, cacheName };
  }
  const urlsToWarm = [
    '/',
    '/index.html',
    '/icon.svg',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    '/apple-touch-icon.png',
    '/manifest.webmanifest',
  ];
  let cachedCount = 0;
  try {
    const cache = await caches.open(cacheName);
    await Promise.all(
      urlsToWarm.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) {
            await cache.put(url, res.clone());
            cachedCount += 1;
          }
        } catch {
          // ignore individual asset fetch errors when already offline
        }
      })
    );
  } catch {
    // ignore cache storage errors
  }
  return { cachedCount, cacheName };
}
