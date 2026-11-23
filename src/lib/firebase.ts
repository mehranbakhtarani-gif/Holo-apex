import { initializeApp } from 'firebase/app';
import { getAuth, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, UserCredential } from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence noisy SDK internal offline/retry console.error spam on slow or filtered networks;
// all actual operation failures are still surfaced through handleFirestoreError().
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

export type FirestoreCacheMode = 'persistent-multitab' | 'persistent-single' | 'memory';
let detectedFirestoreCacheMode: FirestoreCacheMode = 'memory';

function createResilientFirestore(): Firestore {
  const dbId = firebaseConfig.firestoreDatabaseId;
  // 1. Prefer persistent multi-tab IndexedDB cache for full offline read/write & multi-tab sync
  try {
    const instance = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      dbId
    );
    detectedFirestoreCacheMode = 'persistent-multitab';
    return instance;
  } catch {
    // 2. Fallback to single-tab persistent cache if SharedWorker/BroadcastChannel is restricted
    try {
      const instance = initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
          ignoreUndefinedProperties: true,
          localCache: persistentLocalCache(),
        },
        dbId
      );
      detectedFirestoreCacheMode = 'persistent-single';
      return instance;
    } catch {
      // 3. Final fallback to memory cache (e.g. strict private/incognito iframe without IndexedDB)
      try {
        const instance = initializeFirestore(
          app,
          {
            experimentalAutoDetectLongPolling: true,
            ignoreUndefinedProperties: true,
            localCache: memoryLocalCache(),
          },
          dbId
        );
        detectedFirestoreCacheMode = 'memory';
        return instance;
      } catch {
        return getFirestore(app, dbId);
      }
    }
  }
}

export const db = createResilientFirestore();
export const getFirestoreCacheMode = (): FirestoreCacheMode => detectedFirestoreCacheMode;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreOfflineError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    message.includes('the client is offline') ||
    message.includes('Could not reach Cloud Firestore backend') ||
    message.includes('Failed to get document because the client is offline')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      console.warn('Firestore backend temporarily unreachable; operating in offline mode until reconnected.');
      return false;
    }
    return true;
  }
}

let pendingGoogleSignIn: Promise<UserCredential | null> | null = null;

export async function completeGoogleRedirectSignIn() {
  return getRedirectResult(auth);
}

export async function signInWithGoogle() {
  if (pendingGoogleSignIn) {
    return pendingGoogleSignIn;
  }
  const isMobileBrowser =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const request = (isMobileBrowser
    ? signInWithRedirect(auth, googleProvider).then(() => null)
    : signInWithPopup(auth, googleProvider)
  ).catch((err: unknown) => {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
        return null;
      }
      throw err;
    })
    .finally(() => {
      pendingGoogleSignIn = null;
    });

  pendingGoogleSignIn = request;
  return request;
}

export async function signOutAccount() {
  return signOut(auth);
}
