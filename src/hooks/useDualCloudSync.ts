import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  clearOfflineOutbox,
  createSupabasePairCode,
  redeemSupabasePairCode,
  loadSupabaseDeviceToken,
  registerSupabaseDeviceToken,
  ConflictResolutionPolicy,
  deleteSupabaseBackup,
  enqueueOfflineOutboxItem,
  fetchSupabaseBackups,
  fetchSupabaseServerStatus,
  loadConflictPolicy,
  loadLastSupabaseRevision,
  loadLastSupabaseSyncAt,
  loadOfflineOutbox,
  normalizeSupabaseBackups,
  OfflineOutboxItem,
  pullSnapshotFromSupabase,
  pushSnapshotToSupabase,
  saveConflictPolicy,
  saveLastSupabaseRevision,
  saveLastSupabaseSyncAt,
  SupabaseStatusInfo,
} from '../lib/dualCloudSync';
import {
  CloudBackupMeta,
  deleteFirebaseBackupById,
  listAndPruneFirebaseBackups,
  MAX_CLOUD_BACKUPS,
  pullFirebaseBackupSnapshot,
  saveAndPruneFirebaseBackup,
} from '../lib/firebaseCloudBackup';
import { getTodayShamsi, toPersianDigits } from '../lib/format';
import { useOnlineStatus } from './usePWAInstall';

/** Fast deterministic FNV-1a fingerprint ignoring volatile exportedAt timestamp */
function fingerprintWorkspacePayload(rawJson: string): string {
  const normalized = rawJson.replace(/"exportedAt"\s*:\s*"[^"]*"/, '"exportedAt":""');
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16)}`;
}

const LAST_FB_BACKUP_KEY = 'holoo_apex_firebase_last_backup_v1';

function loadLastFirebaseBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_FB_BACKUP_KEY) || null;
  } catch {
    return null;
  }
}

function saveLastFirebaseBackupAt(stamp: string): void {
  try {
    localStorage.setItem(LAST_FB_BACKUP_KEY, stamp);
  } catch {
    // ignore
  }
}

export function useDualCloudSync() {
  const {
    user,
    profile,
    accounts,
    vouchers,
    invoices,
    products,
    parties,
    cheques,
    employees,
    assets,
    costCenters,
    currencies,
    exchangeRates,
    importDossiers,
    salesOrders,
    subcontractJobs,
    rbacOperators,
    deviceId,
    deviceLabel,
    exportBackupJson,
    importBackupJson,
    logActivity,
    showToast,
  } = useAccounting();

  const isOnline = useOnlineStatus();

  // ---- Supabase State ----
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatusInfo>({
    configured: false,
    connected: false,
    tableReady: false,
    projectRef: null,
    tableName: 'holoo_apex_workspaces',
    latencyMs: null,
    errorCode: 'NOT_CONFIGURED',
    checkedAt: null,
  });

  const [conflictPolicy, setConflictPolicyState] = useState<ConflictResolutionPolicy>(() =>
    loadConflictPolicy()
  );
  const [outbox, setOutbox] = useState<OfflineOutboxItem[]>(() => loadOfflineOutbox());
  const [lastSupabaseRevision, setLastSupabaseRevision] = useState<number>(() =>
    loadLastSupabaseRevision()
  );
  const [lastSupabaseSyncAt, setLastSupabaseSyncAt] = useState<string | null>(() =>
    loadLastSupabaseSyncAt()
  );
  const [isSupabaseSyncing, setIsSupabaseSyncing] = useState(false);
  const [lastConflictNote, setLastConflictNote] = useState<string | null>(null);
  const [supabaseBackups, setSupabaseBackups] = useState<CloudBackupMeta[]>([]);
  const [pairedDeviceToken, setPairedDeviceToken] = useState<string | null>(() => loadSupabaseDeviceToken());

  // ---- Firebase Cloud Backup State (3-version rolling retention + manual push/pull) ----
  const [firebaseBackups, setFirebaseBackups] = useState<CloudBackupMeta[]>([]);
  const [isFirebaseBackingUp, setIsFirebaseBackingUp] = useState(false);
  const [lastFirebaseBackupAt, setLastFirebaseBackupAt] = useState<string | null>(() =>
    loadLastFirebaseBackupAt()
  );
  const [lastFirebaseRevision, setLastFirebaseRevision] = useState<number>(0);

  // Guard refs prevent overlapping requests, infinite revision loops, and pull-echo loops
  const sbInFlightRef = useRef(false);
  const fbInFlightRef = useRef(false);
  const lastSbSyncedHashRef = useRef<string | null>(null);
  const lastFbSyncedHashRef = useRef<string | null>(null);
  const suppressNextAutoSyncRef = useRef(false);
  const sbBootstrappedUidRef = useRef<string | null>(null);
  const fbBootstrappedUidRef = useRef<string | null>(null);

  const setConflictPolicy = useCallback(
    (policy: ConflictResolutionPolicy) => {
      setConflictPolicyState(policy);
      saveConflictPolicy(policy);
      logActivity(
        'همگام‌سازی ابری',
        'تغییر سیاست حل تداخل',
        policy === 'last_write_wins'
          ? 'اولویت همگام‌سازی روی «آخرین تغییر (Last-Write-Wins)» تنظیم شد.'
          : 'اولویت همگام‌سازی روی «اولین ثبت (First-Write-Wins)» برای محافظت اسناد تنظیم شد.'
      );
      showToast(
        policy === 'last_write_wins'
          ? 'سیاست حل تداخل: اولویت با آخرین تغییر (Last-Write-Wins) فعال شد.'
          : 'سیاست حل تداخل: اولویت با اولین ثبت (First-Write-Wins) فعال شد.'
      );
    },
    [logActivity, showToast]
  );

  // ---------------- FIREBASE 3-BACKUP ROLLING RETENTION + PUSH / PULL ----------------
  const refreshFirebaseBackups = useCallback(
    async (preferServer = false): Promise<CloudBackupMeta[]> => {
      if (!user) {
        setFirebaseBackups([]);
        return [];
      }
      const res = await listAndPruneFirebaseBackups(user.uid, preferServer);
      setFirebaseBackups(res.backups);
      if (res.backups.length > 0) {
        setLastFirebaseRevision(res.backups[0].revision);
        setLastFirebaseBackupAt(res.backups[0].savedAtShamsi);
        saveLastFirebaseBackupAt(res.backups[0].savedAtShamsi);
      }
      return res.backups;
    },
    [user]
  );

  const pushToFirebaseNow = useCallback(
    async (silent = false): Promise<boolean> => {
      if (fbInFlightRef.current) return false;
      const snapshotJson = exportBackupJson();
      const snapshotHash = fingerprintWorkspacePayload(snapshotJson);

      if (silent && lastFbSyncedHashRef.current === snapshotHash) {
        return true;
      }

      if (!user) {
        if (!silent) {
          showToast('برای ارسال پشتیبان به Firebase ابتدا با حساب گوگل وارد شوید.');
        }
        return false;
      }

      if (!isOnline) {
        if (!silent) {
          showToast('دستگاه آفلاین است؛ اسناد در حافظه محلی ذخیره شدند و پس از اتصال به Firebase ارسال می‌شوند.');
        }
        return false;
      }

      fbInFlightRef.current = true;
      setIsFirebaseBackingUp(true);
      try {
        const res = await saveAndPruneFirebaseBackup({
          ownerId: user.uid,
          reason: silent ? 'auto_sync' : 'manual_push',
          deviceId,
          deviceLabel,
          companyName: profile.companyName,
          fiscalYear: profile.fiscalYear,
          voucherCount: vouchers.length,
          invoiceCount: invoices.length,
          productCount: products.length,
          snapshotJson,
        });

        if (!res.ok) {
          if (!silent && res.error) showToast(res.error);
          return false;
        }

        lastFbSyncedHashRef.current = snapshotHash;
        setFirebaseBackups(res.backups);
        setLastFirebaseRevision(res.revision);
        setLastFirebaseBackupAt(res.savedAtShamsi);
        saveLastFirebaseBackupAt(res.savedAtShamsi);

        if (!silent) {
          const pruneNote =
            res.prunedCount > 0
              ? ` · ${toPersianDigits(res.prunedCount)} نسخه قدیمی پاکسازی شد`
              : '';
          logActivity(
            'پشتیبان ابری Firebase',
            'ارسال نسخه پشتیبان',
            `نسخه #${toPersianDigits(res.revision)} در Firebase ذخیره شد (نگهداری ${toPersianDigits(res.backups.length)} از ${toPersianDigits(MAX_CLOUD_BACKUPS)} نسخه${pruneNote}).`
          );
          showToast(
            `ارسال به Firebase انجام شد (نسخه #${toPersianDigits(res.revision)} · نگهداری ${toPersianDigits(MAX_CLOUD_BACKUPS)} نسخه آخر${pruneNote}).`
          );
        }
        return true;
      } finally {
        fbInFlightRef.current = false;
        setIsFirebaseBackingUp(false);
      }
    },
    [
      exportBackupJson,
      user,
      isOnline,
      deviceId,
      deviceLabel,
      profile.companyName,
      profile.fiscalYear,
      vouchers.length,
      invoices.length,
      products.length,
      logActivity,
      showToast,
    ]
  );

  const pullFromFirebaseNow = useCallback(
    async (backupId?: string): Promise<boolean> => {
      if (fbInFlightRef.current) return false;
      if (!user) {
        showToast('برای دریافت نسخه از Firebase ابتدا با حساب گوگل وارد شوید.');
        return false;
      }
      if (!isOnline) {
        showToast('برای دریافت نسخه از سرور Firebase اتصال اینترنت لازم است.');
        return false;
      }

      fbInFlightRef.current = true;
      setIsFirebaseBackingUp(true);
      try {
        const res = await pullFirebaseBackupSnapshot(user.uid, backupId);
        if (!res.ok) {
          showToast(res.error || 'خطا در دریافت نسخه از Firebase.');
          return false;
        }
        if (!res.found || !res.snapshotJson) {
          showToast('هنوز نسخه پشتیبان ابری روی Firebase ذخیره نشده است. ابتدا یک بار «ارسال به Firebase» را بزنید.');
          return false;
        }

        suppressNextAutoSyncRef.current = true;
        const imported = importBackupJson(res.snapshotJson);
        if (imported) {
          const hash = fingerprintWorkspacePayload(res.snapshotJson);
          lastFbSyncedHashRef.current = hash;
          const rev = res.revision || 1;
          setLastFirebaseRevision(rev);
          if (res.savedAtShamsi) {
            setLastFirebaseBackupAt(res.savedAtShamsi);
            saveLastFirebaseBackupAt(res.savedAtShamsi);
          }
          logActivity(
            'پشتیبان ابری Firebase',
            'دریافت و بازیابی نسخه ابری',
            `نسخه #${toPersianDigits(rev)} از Firebase Firestore دریافت و بازیابی شد.`
          );
          showToast(`نسخه #${toPersianDigits(rev)} از Firebase Firestore دریافت و بازیابی شد.`);
          await refreshFirebaseBackups(false);
        } else {
          suppressNextAutoSyncRef.current = false;
        }
        return imported;
      } finally {
        fbInFlightRef.current = false;
        setIsFirebaseBackingUp(false);
      }
    },
    [user, isOnline, importBackupJson, logActivity, showToast, refreshFirebaseBackups]
  );

  const removeFirebaseBackup = useCallback(
    async (backupId: string) => {
      if (!user) return;
      const res = await deleteFirebaseBackupById(user.uid, backupId);
      if (res.ok) {
        setFirebaseBackups(res.backups);
        showToast('نسخه پشتیبان انتخاب‌شده از Firebase حذف شد.');
      }
    },
    [user, showToast]
  );

  // ---------------- SUPABASE AUTO-SYNC + 3-BACKUP ROLLING RETENTION ----------------
  const refreshSupabaseBackups = useCallback(async () => {
    if (!isOnline || (!user && !pairedDeviceToken)) return null;
    try {
      const idToken = user ? await user.getIdToken() : pairedDeviceToken!;
      const res = await fetchSupabaseBackups(idToken);
      if (res.ok) {
        if (res.backups) setSupabaseBackups(res.backups);
        return res;
      }
    } catch {
      // ignore transient errors
    }
    return null;
  }, [isOnline, user, pairedDeviceToken]);

  const refreshSupabaseStatus = useCallback(async () => {
    if (!isOnline) {
      setSupabaseStatus((prev) => ({
        ...prev,
        connected: false,
        errorCode: 'OFFLINE',
        checkedAt: new Date().toISOString(),
      }));
      return null;
    }
    const status = await fetchSupabaseServerStatus();
    setSupabaseStatus(status);
    if (status.configured && status.tableReady && (user || pairedDeviceToken)) {
      void refreshSupabaseBackups();
    }
    return status;
  }, [isOnline, user, pairedDeviceToken, refreshSupabaseBackups]);

  useEffect(() => {
    void refreshSupabaseStatus();
  }, [refreshSupabaseStatus]);

  // Provision a dedicated Supabase credential while Firebase is available.
  // The saved device token survives a later Google sign-out.
  useEffect(() => {
    if (!user || !isOnline) return;
    let cancelled = false;
    void (async () => {
      try {
        const firebaseToken = await user.getIdToken();
        const deviceToken = await registerSupabaseDeviceToken(firebaseToken, deviceId, deviceLabel);
        if (!cancelled && deviceToken) setPairedDeviceToken(deviceToken);
      } catch {
        // Firebase and Supabase remain independent; a later online cycle can retry.
      }
    })();
    return () => { cancelled = true; };
  }, [user, isOnline, deviceId, deviceLabel]);

  const syncSupabaseNow = useCallback(
    async (silent = false): Promise<boolean> => {
      if (sbInFlightRef.current) return false;
      const snapshotJson = exportBackupJson();
      const snapshotHash = fingerprintWorkspacePayload(snapshotJson);

      if (silent && lastSbSyncedHashRef.current === snapshotHash && loadOfflineOutbox().length === 0) {
        return true;
      }

      if (!isOnline) {
        const updated = enqueueOfflineOutboxItem({
          summary: `تغییر آفلاین (${toPersianDigits(vouchers.length)} سند · ${toPersianDigits(invoices.length)} فاکتور)`,
          voucherCount: vouchers.length,
          invoiceCount: invoices.length,
          productCount: products.length,
        });
        setOutbox(updated);
        if (!silent) {
          showToast('دستگاه آفلاین است؛ تغییرات در صف همگام‌سازی ذخیره شد و پس از اتصال ارسال می‌شود.');
        }
        return false;
      }

      if (!user && !pairedDeviceToken) {
        if (!silent) {
          showToast('برای استفاده مستقل از Supabase، این دستگاه را با کد یک‌بارمصرف جفت کنید.');
        }
        return false;
      }

      if (!supabaseStatus.configured || !supabaseStatus.tableReady) {
        const freshStatus = await refreshSupabaseStatus();
        if (!freshStatus?.configured || !freshStatus.tableReady) {
          if (!silent) {
            showToast(
              freshStatus?.configured
                ? 'جدول Supabase هنوز ایجاد نشده است (فایل supabase/schema.sql را در SQL Editor اجرا کنید).'
                : 'اطلاعات اتصال Supabase (SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY) هنوز در تنظیمات سرور وارد نشده است.'
            );
          }
          return false;
        }
      }

      sbInFlightRef.current = true;
      setIsSupabaseSyncing(true);
      try {
        const idToken = user ? await user.getIdToken() : pairedDeviceToken!;
        const res = await pushSnapshotToSupabase({
          idToken,
          deviceId,
          deviceLabel,
          conflictPolicy,
          clientRevision: lastSupabaseRevision,
          companyName: profile.companyName,
          fiscalYear: profile.fiscalYear,
          voucherCount: vouchers.length,
          invoiceCount: invoices.length,
          productCount: products.length,
          snapshotJson,
        });

        if (!res.ok || !res.data) {
          const updated = enqueueOfflineOutboxItem({
            summary: `تلاش ناموفق همگام‌سازی Supabase (${res.code || 'RETRY'})`,
            voucherCount: vouchers.length,
            invoiceCount: invoices.length,
            productCount: products.length,
          });
          setOutbox(updated);
          if (!silent && res.error) showToast(res.error);
          return false;
        }

        const timeStr = new Date().toLocaleTimeString('fa-IR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const stamp = `${getTodayShamsi()} · ${timeStr}`;

        setLastSupabaseRevision(res.data.serverRevision);
        saveLastSupabaseRevision(res.data.serverRevision);
        setLastSupabaseSyncAt(stamp);
        saveLastSupabaseSyncAt(stamp);
        clearOfflineOutbox();
        setOutbox([]);

        if (Array.isArray(res.data.retainedBackups)) {
          setSupabaseBackups(normalizeSupabaseBackups(res.data.retainedBackups));
        }

        const prunedCount = Number(res.data.prunedBackupsCount) || 0;
        const pruneNote =
          prunedCount > 0 ? ` · ${toPersianDigits(prunedCount)} نسخه قدیمی پاکسازی شد` : '';

        if (res.data.status === 'conflict_kept_remote') {
          const note = `تداخل ویرایش با ${res.data.remoteDeviceLabel || 'دستگاه دیگر'}: طبق سیاست «اولین ثبت»، نسخه شماره ${toPersianDigits(res.data.serverRevision)} سرور حفظ شد.`;
          setLastConflictNote(note);
          logActivity('همگام‌سازی Supabase', 'حل تداخل (اولین ثبت)', note);
          if (res.data.remoteSnapshotJson) {
            suppressNextAutoSyncRef.current = true;
            lastSbSyncedHashRef.current = fingerprintWorkspacePayload(res.data.remoteSnapshotJson);
            importBackupJson(res.data.remoteSnapshotJson);
          }
          if (!silent) showToast(note);
        } else if (res.data.status === 'conflict_overwrote_remote') {
          lastSbSyncedHashRef.current = snapshotHash;
          const note = `تداخل ویرایش حل شد: طبق سیاست «آخرین تغییر»، نسخه جدید شماره ${toPersianDigits(res.data.serverRevision)} ثبت گردید${pruneNote}.`;
          setLastConflictNote(note);
          logActivity('همگام‌سازی Supabase', 'حل تداخل (آخرین تغییر)', note);
          if (!silent) showToast(note);
        } else {
          lastSbSyncedHashRef.current = snapshotHash;
          setLastConflictNote(null);
          if (!silent) {
            showToast(
              `ارسال به Supabase انجام شد (نسخه #${toPersianDigits(res.data.serverRevision)} · نگهداری ${toPersianDigits(MAX_CLOUD_BACKUPS)} نسخه آخر${pruneNote}).`
            );
          }
        }
        return true;
      } finally {
        sbInFlightRef.current = false;
        setIsSupabaseSyncing(false);
      }
    },
    [
      exportBackupJson,
      isOnline,
      vouchers.length,
      invoices.length,
      products.length,
      user,
      pairedDeviceToken,
      supabaseStatus.configured,
      supabaseStatus.tableReady,
      refreshSupabaseStatus,
      deviceId,
      deviceLabel,
      conflictPolicy,
      lastSupabaseRevision,
      profile.companyName,
      profile.fiscalYear,
      logActivity,
      importBackupJson,
      showToast,
    ]
  );

  const pullFromSupabase = useCallback(
    async (backupId?: string, silent = false): Promise<boolean> => {
      if (sbInFlightRef.current) return false;
      if (!isOnline || (!user && !pairedDeviceToken)) {
        if (!silent) {
          showToast('برای دریافت از Supabase اتصال اینترنت و جفت‌سازی این دستگاه لازم است.');
        }
        return false;
      }
      sbInFlightRef.current = true;
      setIsSupabaseSyncing(true);
      try {
        const idToken = user ? await user.getIdToken() : pairedDeviceToken!;
        const res = await pullSnapshotFromSupabase(idToken, backupId);
        if (!res.ok) {
          if (!silent) showToast(res.error || 'خطا در دریافت از Supabase');
          return false;
        }
        if (!res.found || !res.snapshotJson) {
          if (!silent) showToast('هنوز نسخه‌ای روی Supabase برای این حساب ذخیره نشده است.');
          return false;
        }
        suppressNextAutoSyncRef.current = true;
        const imported = importBackupJson(res.snapshotJson);
        if (imported) {
          lastSbSyncedHashRef.current = fingerprintWorkspacePayload(res.snapshotJson);
          const rev = res.revision || 1;
          setLastSupabaseRevision(rev);
          saveLastSupabaseRevision(rev);
          const timeStr = new Date().toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const stamp = `${getTodayShamsi()} · ${timeStr}`;
          setLastSupabaseSyncAt(stamp);
          saveLastSupabaseSyncAt(stamp);
          clearOfflineOutbox();
          setOutbox([]);
          logActivity(
            'همگام‌سازی Supabase',
            backupId ? 'بازیابی از نسخه پشتیبان' : 'دریافت نسخه ابری',
            `نسخه #${toPersianDigits(rev)} از Supabase PostgreSQL دریافت و بازیابی شد.`
          );
          if (!silent) {
            showToast(`نسخه #${toPersianDigits(rev)} از Supabase PostgreSQL دریافت و بازیابی شد.`);
          }
        } else {
          suppressNextAutoSyncRef.current = false;
        }
        return imported;
      } finally {
        sbInFlightRef.current = false;
        setIsSupabaseSyncing(false);
      }
    },
    [isOnline, user, pairedDeviceToken, importBackupJson, logActivity, showToast]
  );

  const removeSupabaseBackup = useCallback(
    async (backupId: string) => {
      if ((!user && !pairedDeviceToken) || !isOnline) return;
      const idToken = user ? await user.getIdToken() : pairedDeviceToken!;
      const res = await deleteSupabaseBackup(idToken, backupId);
      if (res.ok && res.backups) {
        setSupabaseBackups(res.backups);
        showToast('نسخه پشتیبان انتخاب‌شده از Supabase حذف شد.');
      }
    },
    [user, pairedDeviceToken, isOnline, showToast]
  );

  // Refs to prevent revision state updates from re-triggering effects
  const syncSupabaseNowRef = useRef(syncSupabaseNow);
  useEffect(() => {
    syncSupabaseNowRef.current = syncSupabaseNow;
  }, [syncSupabaseNow]);

  const pullFromSupabaseRef = useRef(pullFromSupabase);
  useEffect(() => {
    pullFromSupabaseRef.current = pullFromSupabase;
  }, [pullFromSupabase]);

  const pushToFirebaseNowRef = useRef(pushToFirebaseNow);
  useEffect(() => {
    pushToFirebaseNowRef.current = pushToFirebaseNow;
  }, [pushToFirebaseNow]);

  const lastSupabaseRevisionRef = useRef(lastSupabaseRevision);
  useEffect(() => {
    lastSupabaseRevisionRef.current = lastSupabaseRevision;
  }, [lastSupabaseRevision]);

  // 1. AUTO-BOOTSTRAP FOR SUPABASE (works automatically upon login/connect just like Firebase!)
  useEffect(() => {
    if ((!user && !pairedDeviceToken) || !isOnline || !supabaseStatus.configured || !supabaseStatus.tableReady) {
      if (!user && !pairedDeviceToken) {
        sbBootstrappedUidRef.current = null;
        setSupabaseBackups([]);
      }
      return;
    }
    const bootstrapKey = user?.uid || 'paired-device';
    if (sbBootstrappedUidRef.current === bootstrapKey) return;
    sbBootstrappedUidRef.current = bootstrapKey;

    let cancelled = false;
    void (async () => {
      const meta = await refreshSupabaseBackups();
      if (cancelled || !meta) return;

      const remoteRev = meta.currentRevision || 0;
      const localRev = lastSupabaseRevisionRef.current;

      if (remoteRev === 0) {
        // First time ever on Supabase: automatically push initial workspace + backup #1
        await syncSupabaseNowRef.current(true);
      } else if (
        remoteRev > localRev &&
        meta.currentDeviceId !== deviceId &&
        loadOfflineOutbox().length === 0
      ) {
        // Another device pushed a newer snapshot on Supabase: automatically pull it
        await pullFromSupabaseRef.current(undefined, true);
      } else {
        setLastSupabaseRevision(Math.max(localRev, remoteRev));
        saveLastSupabaseRevision(Math.max(localRev, remoteRev));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, pairedDeviceToken, isOnline, supabaseStatus.configured, supabaseStatus.tableReady, deviceId, refreshSupabaseBackups]);

  // 2. AUTO-BOOTSTRAP FOR FIREBASE 3-VERSION ROLLING BACKUPS
  useEffect(() => {
    if (!user) {
      fbBootstrappedUidRef.current = null;
      setFirebaseBackups([]);
      return;
    }
    if (!isOnline || fbBootstrappedUidRef.current === user.uid) return;
    fbBootstrappedUidRef.current = user.uid;

    let cancelled = false;
    void (async () => {
      const existing = await refreshFirebaseBackups(false);
      if (cancelled) return;
      if (existing.length === 0) {
        await pushToFirebaseNowRef.current(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isOnline, refreshFirebaseBackups]);

  // 3. AUTOMATIC BACKGROUND POLL + WINDOW FOCUS SYNC FOR SUPABASE (real-time-like multi-device sync)
  useEffect(() => {
    if ((!user && !pairedDeviceToken) || !isOnline || !supabaseStatus.configured || !supabaseStatus.tableReady) return;

    const checkRemoteSupabase = async () => {
      if (document.visibilityState !== 'visible' || sbInFlightRef.current) return;
      const meta = await refreshSupabaseBackups();
      if (!meta || !meta.ok) return;
      const remoteRev = meta.currentRevision || 0;
      if (
        remoteRev > lastSupabaseRevisionRef.current &&
        meta.currentDeviceId &&
        meta.currentDeviceId !== deviceId &&
        loadOfflineOutbox().length === 0
      ) {
        await pullFromSupabaseRef.current(undefined, true);
      }
    };

    const interval = window.setInterval(() => {
      void checkRemoteSupabase();
    }, 45_000);

    const onFocus = () => {
      void checkRemoteSupabase();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, pairedDeviceToken, isOnline, supabaseStatus.configured, supabaseStatus.tableReady, deviceId, refreshSupabaseBackups]);

  // 4. OFFLINE-FIRST MUTATION OBSERVER: automatically syncs BOTH Supabase & Firebase rolling backups on any change
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (suppressNextAutoSyncRef.current) {
      suppressNextAutoSyncRef.current = false;
      return;
    }

    if (!isOnline) {
      const updated = enqueueOfflineOutboxItem({
        summary: `تغییر آفلاین (${toPersianDigits(vouchers.length)} سند · ${toPersianDigits(invoices.length)} فاکتور)`,
        voucherCount: vouchers.length,
        invoiceCount: invoices.length,
        productCount: products.length,
      });
      setOutbox(updated);
      return;
    }

    const timers: number[] = [];

    if ((user || pairedDeviceToken) && supabaseStatus.configured && supabaseStatus.tableReady) {
      timers.push(
        window.setTimeout(() => {
          void syncSupabaseNowRef.current(true);
        }, 2500)
      );
    }

    if (user) {
      timers.push(
        window.setTimeout(() => {
          void pushToFirebaseNowRef.current(true);
        }, 4000)
      );
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [
    isOnline,
    user,
    pairedDeviceToken,
    supabaseStatus.configured,
    supabaseStatus.tableReady,
    profile,
    accounts,
    vouchers,
    invoices,
    products,
    parties,
    cheques,
    employees,
    assets,
    costCenters,
    currencies,
    exchangeRates,
    importDossiers,
    salesOrders,
    subcontractJobs,
    rbacOperators,
  ]);

  // 5. AUTO-FLUSH QUEUED OFFLINE CHANGES IMMEDIATELY UPON RECONNECTING (both clouds)
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const justReconnected = !prevOnlineRef.current && isOnline;
    prevOnlineRef.current = isOnline;
    if (justReconnected && (user || pairedDeviceToken)) {
      void refreshSupabaseStatus().then((st) => {
        if (st?.configured && st.tableReady && loadOfflineOutbox().length > 0) {
          void syncSupabaseNowRef.current(false);
        }
      });
      void pushToFirebaseNowRef.current(true);
    }
  }, [isOnline, user, pairedDeviceToken, refreshSupabaseStatus]);

  const generateSupabasePairCode = useCallback(async () => {
    if (!user) return {ok:false as const,error:'برای ساخت کد، دستگاه اصلی باید با گوگل وارد شده باشد.'};
    const token = await user.getIdToken();
    return createSupabasePairCode(token, deviceId);
  }, [user, deviceId]);

  const pairThisDevice = useCallback(async (code: string) => {
    const result = await redeemSupabasePairCode(code, deviceId, deviceLabel);
    if (result.ok) {
      setPairedDeviceToken(result.deviceToken || null);
      sbBootstrappedUidRef.current = null;
      await refreshSupabaseStatus();
      showToast('این دستگاه با موفقیت به فضای مستقل Supabase متصل شد.');
    }
    return result;
  }, [deviceId, deviceLabel, refreshSupabaseStatus, showToast]);

  const disconnectPairedDevice = useCallback(() => {
    try { localStorage.removeItem('holoo_apex_supabase_device_token_v1'); } catch { /* ignore */ }
    setPairedDeviceToken(null);
    sbBootstrappedUidRef.current = null;
    setSupabaseBackups([]);
    showToast('اتصال مستقل Supabase از این دستگاه قطع شد.');
  }, [showToast]);

  return {
    // Supabase
    supabaseStatus,
    supabaseBackups,
    conflictPolicy,
    setConflictPolicy,
    pendingQueueCount: outbox.length,
    outboxItems: outbox,
    lastSupabaseRevision,
    lastSupabaseSyncAt,
    isSupabaseSyncing,
    lastConflictNote,
    syncSupabaseNow,
    pullFromSupabase,
    refreshSupabaseStatus,
    removeSupabaseBackup,
    pairedDevice: Boolean(pairedDeviceToken),
    generateSupabasePairCode,
    pairThisDevice,
    disconnectPairedDevice,

    // Firebase (3-version rolling backup + symmetrical push/pull)
    firebaseBackups,
    isFirebaseBackingUp,
    lastFirebaseBackupAt,
    lastFirebaseRevision,
    pushToFirebaseNow,
    pullFromFirebaseNow,
    refreshFirebaseBackups,
    removeFirebaseBackup,
    maxCloudBackups: MAX_CLOUD_BACKUPS,
  };
}

export type DualCloudSyncController = ReturnType<typeof useDualCloudSync>;
