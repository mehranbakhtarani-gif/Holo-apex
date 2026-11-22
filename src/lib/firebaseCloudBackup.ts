import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, isFirestoreOfflineError, OperationType } from './firebase';
import { getTodayShamsi } from './format';

export const MAX_CLOUD_BACKUPS = 3;

export interface CloudBackupMeta {
  id: string;
  provider: 'firebase' | 'supabase';
  revision: number;
  savedAt: string;
  savedAtShamsi: string;
  deviceLabel: string;
  companyName: string;
  fiscalYear: string;
  voucherCount: number;
  invoiceCount: number;
  productCount: number;
  sizeKb?: number;
}

/** Recursively removes undefined values so native Maps & Lists are strictly Firestore-compatible */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function formatShamsiFromIso(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return getTodayShamsi();
    const datePart = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const timePart = d.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} · ${timePart}`;
  } catch {
    return getTodayShamsi();
  }
}

function buildCompactFirestoreSnapshot(rawSnapshotJson: string): {
  snapshotMap: Record<string, unknown>;
  sizeKb: number;
} {
  const parsed = JSON.parse(rawSnapshotJson) as Record<string, unknown>;
  // Store structured native Maps/Lists (never JSON.stringify inside Firestore)
  // Cap verbose auditLogs to latest 150 entries to stay comfortably under Firestore's 1 MiB document limit
  const auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs.slice(0, 150) : [];
  const compactObj = stripUndefinedDeep({
    version: String(parsed.version || 'holoo-apex-1.3'),
    exportedAt: String(parsed.exportedAt || new Date().toISOString()),
    profile: parsed.profile ?? {},
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    parties: Array.isArray(parsed.parties) ? parsed.parties : [],
    products: Array.isArray(parsed.products) ? parsed.products : [],
    vouchers: Array.isArray(parsed.vouchers) ? parsed.vouchers : [],
    invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
    cheques: Array.isArray(parsed.cheques) ? parsed.cheques : [],
    employees: Array.isArray(parsed.employees) ? parsed.employees : [],
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    costCenters: Array.isArray(parsed.costCenters) ? parsed.costCenters : [],
    currencies: Array.isArray(parsed.currencies) ? parsed.currencies : [],
    exchangeRates: Array.isArray(parsed.exchangeRates) ? parsed.exchangeRates : [],
    importDossiers: Array.isArray(parsed.importDossiers) ? parsed.importDossiers : [],
    salesOrders: Array.isArray(parsed.salesOrders) ? parsed.salesOrders : [],
    subcontractJobs: Array.isArray(parsed.subcontractJobs) ? parsed.subcontractJobs : [],
    rbacOperators: Array.isArray(parsed.rbacOperators) ? parsed.rbacOperators : [],
    auditLogs,
  });

  const approxBytes = new Blob([JSON.stringify(compactObj)]).size;
  if (approxBytes > 940_000) {
    // Trim non-critical audit logs first if approaching Firestore's 1 MiB doc cap
    compactObj.auditLogs = [];
  }
  const finalSizeKb = Math.min(1024, Math.max(1, Math.round(new Blob([JSON.stringify(compactObj)]).size / 1024)));
  return { snapshotMap: compactObj, sizeKb: finalSizeKb };
}

export async function listAndPruneFirebaseBackups(
  ownerId: string,
  preferServer = false
): Promise<{ backups: CloudBackupMeta[]; prunedCount: number }> {
  const q = query(collection(db, 'cloudBackups'), where('ownerId', '==', ownerId));
  let snap;
  try {
    snap = preferServer ? await getDocsFromServer(q) : await getDocs(q);
  } catch (err) {
    if (isFirestoreOfflineError(err)) {
      snap = await getDocs(q);
    } else {
      handleFirestoreError(err, OperationType.LIST, 'cloudBackups');
      return { backups: [], prunedCount: 0 };
    }
  }

  const rows = snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const savedAtMs = Number(data.savedAtMs) || 0;
      const iso = savedAtMs > 0 ? new Date(savedAtMs).toISOString() : new Date().toISOString();
      return {
        id: d.id,
        savedAtMs,
        meta: {
          id: d.id,
          provider: 'firebase' as const,
          revision: Number(data.revision) || 1,
          savedAt: iso,
          savedAtShamsi: String(data.savedAtShamsi || formatShamsiFromIso(iso)),
          deviceLabel: String(data.deviceLabel || 'دستگاه کاری'),
          companyName: String(data.companyName || ''),
          fiscalYear: String(data.fiscalYear || '1405'),
          voucherCount: Number(data.voucherCount) || 0,
          invoiceCount: Number(data.invoiceCount) || 0,
          productCount: Number(data.productCount) || 0,
          sizeKb: Number(data.sizeKb) || 0,
        },
      };
    })
    .sort((a, b) => b.savedAtMs - a.savedAtMs);

  const toKeep = rows.slice(0, MAX_CLOUD_BACKUPS);
  const toPrune = rows.slice(MAX_CLOUD_BACKUPS);
  let prunedCount = 0;

  if (toPrune.length > 0) {
    try {
      const batch = writeBatch(db);
      for (const stale of toPrune) {
        batch.delete(doc(db, 'cloudBackups', stale.id));
      }
      await batch.commit();
      prunedCount = toPrune.length;
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        // Fallback to individual deletes if batch fails
        for (const stale of toPrune) {
          try {
            await deleteDoc(doc(db, 'cloudBackups', stale.id));
            prunedCount += 1;
          } catch {
            // ignore individual cleanup failure
          }
        }
      }
    }
  }

  return {
    backups: toKeep.map((r) => r.meta),
    prunedCount,
  };
}

export async function saveAndPruneFirebaseBackup(params: {
  ownerId: string;
  reason: 'auto_sync' | 'manual_push';
  deviceId: string;
  deviceLabel: string;
  companyName: string;
  fiscalYear: string;
  voucherCount: number;
  invoiceCount: number;
  productCount: number;
  snapshotJson: string;
}): Promise<{
  ok: boolean;
  revision: number;
  backups: CloudBackupMeta[];
  prunedCount: number;
  savedAtShamsi: string;
  error?: string;
}> {
  const safeDeviceId = params.deviceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'dev1';
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const savedAtShamsi = formatShamsiFromIso(nowIso);

  try {
    const existing = await listAndPruneFirebaseBackups(params.ownerId, false);
    const maxRev = existing.backups.reduce((m, b) => Math.max(m, b.revision), 0);
    const nextRevision = maxRev + 1;

    const { snapshotMap, sizeKb } = buildCompactFirestoreSnapshot(params.snapshotJson);
    const backupId = `fbbak_${params.ownerId.slice(0, 12)}_${nowMs}_${nextRevision}`;

    await setDoc(doc(db, 'cloudBackups', backupId), {
      ownerId: params.ownerId,
      revision: nextRevision,
      reason: params.reason,
      deviceId: safeDeviceId,
      deviceLabel: params.deviceLabel.slice(0, 120) || 'دستگاه کاری',
      companyName: params.companyName.slice(0, 160),
      fiscalYear: params.fiscalYear.slice(0, 16) || '1405',
      savedAtMs: nowMs,
      savedAtShamsi: savedAtShamsi.slice(0, 48),
      voucherCount: Math.max(0, Math.floor(params.voucherCount)),
      invoiceCount: Math.max(0, Math.floor(params.invoiceCount)),
      productCount: Math.max(0, Math.floor(params.productCount)),
      sizeKb,
      snapshot: snapshotMap,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Immediately enforce rolling 3-version retention by pruning any backup older than the latest 3
    const after = await listAndPruneFirebaseBackups(params.ownerId, false);
    return {
      ok: true,
      revision: nextRevision,
      backups: after.backups,
      prunedCount: existing.prunedCount + after.prunedCount,
      savedAtShamsi,
    };
  } catch (err) {
    if (isFirestoreOfflineError(err)) {
      return {
        ok: false,
        revision: 0,
        backups: [],
        prunedCount: 0,
        savedAtShamsi,
        error: 'دستگاه آفلاین است؛ پشتیبان ابری Firebase پس از اتصال ذخیره خواهد شد.',
      };
    }
    return {
      ok: false,
      revision: 0,
      backups: [],
      prunedCount: 0,
      savedAtShamsi,
      error: 'خطا در ذخیره نسخه پشتیبان روی Firebase Firestore.',
    };
  }
}

export async function pullFirebaseBackupSnapshot(
  ownerId: string,
  backupId?: string
): Promise<{
  ok: boolean;
  found?: boolean;
  revision?: number;
  deviceLabel?: string;
  savedAtShamsi?: string;
  snapshotJson?: string;
  error?: string;
}> {
  try {
    let targetId = backupId;
    if (!targetId) {
      const list = await listAndPruneFirebaseBackups(ownerId, true);
      if (list.backups.length === 0) {
        return { ok: true, found: false };
      }
      targetId = list.backups[0].id;
    }

    const ref = doc(db, 'cloudBackups', targetId);
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch (err) {
      if (isFirestoreOfflineError(err)) {
        snap = await getDoc(ref);
      } else {
        throw err;
      }
    }

    if (!snap.exists()) {
      return { ok: true, found: false };
    }

    const data = snap.data() as Record<string, unknown>;
    if (data.ownerId !== ownerId || !data.snapshot || typeof data.snapshot !== 'object') {
      return { ok: false, error: 'نسخه پشتیبان انتخاب‌شده معتبر نیست.' };
    }

    return {
      ok: true,
      found: true,
      revision: Number(data.revision) || 1,
      deviceLabel: String(data.deviceLabel || 'دستگاه کاری'),
      savedAtShamsi: String(data.savedAtShamsi || ''),
      snapshotJson: JSON.stringify(data.snapshot),
    };
  } catch {
    return { ok: false, error: 'خطا در بازیابی نسخه پشتیبان از Firebase Firestore.' };
  }
}

export async function deleteFirebaseBackupById(
  ownerId: string,
  backupId: string
): Promise<{ ok: boolean; backups: CloudBackupMeta[] }> {
  try {
    await deleteDoc(doc(db, 'cloudBackups', backupId));
    const after = await listAndPruneFirebaseBackups(ownerId, false);
    return { ok: true, backups: after.backups };
  } catch {
    return { ok: false, backups: [] };
  }
}
