import { apiUrl } from './apiBase';
import type { CloudBackupMeta } from './firebaseCloudBackup';

export type ConflictResolutionPolicy = 'last_write_wins' | 'first_write_wins';

export interface SupabaseStatusInfo {
  configured: boolean;
  connected: boolean;
  tableReady: boolean;
  projectRef: string | null;
  tableName: string;
  latencyMs: number | null;
  errorCode: string | null;
  checkedAt: string | null;
}

export interface OfflineOutboxItem {
  id: string;
  queuedAt: string;
  summary: string;
  voucherCount: number;
  invoiceCount: number;
  productCount: number;
}

export interface RawServerBackupMeta {
  id: string;
  provider: 'supabase';
  revision: number;
  savedAt: string;
  deviceLabel: string;
  companyName: string;
  fiscalYear: string;
  voucherCount: number;
  invoiceCount: number;
  productCount: number;
}

export interface SupabaseSyncResponse {
  status: 'synced' | 'conflict_kept_remote' | 'conflict_overwrote_remote';
  serverRevision: number;
  conflictPolicy: ConflictResolutionPolicy;
  syncedAt: string;
  remoteDeviceLabel?: string;
  remoteSnapshotJson?: string;
  retainedBackups?: RawServerBackupMeta[];
  prunedBackupsCount?: number;
}

export interface SupabaseBackupsListResponse {
  ok: boolean;
  maxBackups?: number;
  currentRevision?: number;
  currentUpdatedAt?: string | null;
  currentDeviceId?: string;
  currentDeviceLabel?: string;
  prunedCount?: number;
  backups?: CloudBackupMeta[];
  error?: string;
}

function formatShamsiFromIso(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
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
    return iso;
  }
}

export function normalizeSupabaseBackups(raw?: RawServerBackupMeta[]): CloudBackupMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((b) => ({
    id: b.id,
    provider: 'supabase',
    revision: Number(b.revision) || 1,
    savedAt: b.savedAt || new Date().toISOString(),
    savedAtShamsi: formatShamsiFromIso(b.savedAt || new Date().toISOString()),
    deviceLabel: b.deviceLabel || 'دستگاه کاری',
    companyName: b.companyName || '',
    fiscalYear: b.fiscalYear || '1405',
    voucherCount: Number(b.voucherCount) || 0,
    invoiceCount: Number(b.invoiceCount) || 0,
    productCount: Number(b.productCount) || 0,
  }));
}

const POLICY_STORAGE_KEY = 'holoo_apex_conflict_policy_v1';
const OUTBOX_STORAGE_KEY = 'holoo_apex_offline_outbox_v1';
const REVISION_STORAGE_KEY = 'holoo_apex_supabase_revision_v1';
const LAST_SYNC_STORAGE_KEY = 'holoo_apex_supabase_last_sync_v1';

export function loadConflictPolicy(): ConflictResolutionPolicy {
  try {
    const raw = localStorage.getItem(POLICY_STORAGE_KEY);
    if (raw === 'first_write_wins' || raw === 'last_write_wins') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'last_write_wins';
}

export function saveConflictPolicy(policy: ConflictResolutionPolicy): void {
  try {
    localStorage.setItem(POLICY_STORAGE_KEY, policy);
  } catch {
    // ignore
  }
}

export function loadOfflineOutbox(): OfflineOutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineOutboxItem[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineOutboxItem(item: Omit<OfflineOutboxItem, 'id' | 'queuedAt'>): OfflineOutboxItem[] {
  const existing = loadOfflineOutbox();
  const next: OfflineOutboxItem[] = [
    ...existing.slice(-24),
    {
      ...item,
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      queuedAt: new Date().toISOString(),
    },
  ];
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearOfflineOutbox(): void {
  try {
    localStorage.removeItem(OUTBOX_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadLastSupabaseRevision(): number {
  try {
    const n = Number(localStorage.getItem(REVISION_STORAGE_KEY) || '0');
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveLastSupabaseRevision(rev: number): void {
  try {
    localStorage.setItem(REVISION_STORAGE_KEY, String(Math.max(0, Math.floor(rev))));
  } catch {
    // ignore
  }
}

export function loadLastSupabaseSyncAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveLastSupabaseSyncAt(shamsiStamp: string): void {
  try {
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, shamsiStamp);
  } catch {
    // ignore
  }
}

export async function fetchSupabaseServerStatus(): Promise<SupabaseStatusInfo> {
  try {
    const resp = await fetch(apiUrl('/api/supabase/status'), {
      method: 'GET',
      cache: 'no-store',
    });
    if (!resp.ok) {
      return {
        configured: false,
        connected: false,
        tableReady: false,
        projectRef: null,
        tableName: 'holoo_apex_workspaces',
        latencyMs: null,
        errorCode: `HTTP_${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    const data = (await resp.json()) as Omit<SupabaseStatusInfo, 'checkedAt'>;
    return {
      ...data,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      configured: false,
      connected: false,
      tableReady: false,
      projectRef: null,
      tableName: 'holoo_apex_workspaces',
      latencyMs: null,
      errorCode: 'OFFLINE_OR_UNREACHABLE',
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function fetchSupabaseBackups(idToken: string): Promise<SupabaseBackupsListResponse> {
  try {
    const resp = await fetch(apiUrl('/api/supabase/backups'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    const json = (await resp.json().catch(() => ({}))) as {
      maxBackups?: number;
      currentRevision?: number;
      currentUpdatedAt?: string | null;
      currentDeviceId?: string;
      currentDeviceLabel?: string;
      prunedCount?: number;
      backups?: RawServerBackupMeta[];
      error?: string;
    };
    if (!resp.ok) {
      return { ok: false, error: json.error || 'خطا در دریافت لیست پشتیبان‌های Supabase' };
    }
    return {
      ok: true,
      maxBackups: json.maxBackups ?? 3,
      currentRevision: Number(json.currentRevision) || 0,
      currentUpdatedAt: json.currentUpdatedAt ?? null,
      currentDeviceId: json.currentDeviceId || '',
      currentDeviceLabel: json.currentDeviceLabel || '',
      prunedCount: Number(json.prunedCount) || 0,
      backups: normalizeSupabaseBackups(json.backups),
    };
  } catch {
    return { ok: false, error: 'ارتباط با Supabase برقرار نشد.' };
  }
}

export async function deleteSupabaseBackup(
  idToken: string,
  backupId: string
): Promise<{ ok: boolean; backups?: CloudBackupMeta[]; error?: string }> {
  try {
    const resp = await fetch(apiUrl(`/api/supabase/backups/${encodeURIComponent(backupId)}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      backups?: RawServerBackupMeta[];
      error?: string;
    };
    if (!resp.ok) {
      return { ok: false, error: json.error || 'خطا در حذف نسخه پشتیبان' };
    }
    return { ok: true, backups: normalizeSupabaseBackups(json.backups) };
  } catch {
    return { ok: false, error: 'ارتباط با Supabase برقرار نشد.' };
  }
}

export async function pushSnapshotToSupabase(params: {
  idToken: string;
  deviceId: string;
  deviceLabel: string;
  conflictPolicy: ConflictResolutionPolicy;
  clientRevision: number;
  companyName: string;
  fiscalYear: string;
  voucherCount: number;
  invoiceCount: number;
  productCount: number;
  snapshotJson: string;
}): Promise<{ ok: boolean; data?: SupabaseSyncResponse; error?: string; code?: string }> {
  try {
    const resp = await fetch(apiUrl('/api/supabase/sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        deviceId: params.deviceId,
        deviceLabel: params.deviceLabel,
        conflictPolicy: params.conflictPolicy,
        clientRevision: params.clientRevision,
        clientUpdatedAt: new Date().toISOString(),
        companyName: params.companyName,
        fiscalYear: params.fiscalYear,
        voucherCount: params.voucherCount,
        invoiceCount: params.invoiceCount,
        productCount: params.productCount,
        snapshotJson: params.snapshotJson,
      }),
    });

    const json = (await resp.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    } & Partial<SupabaseSyncResponse>;

    if (!resp.ok) {
      return {
        ok: false,
        error: json.error || 'خطا در همگام‌سازی با Supabase',
        code: json.code,
      };
    }

    return {
      ok: true,
      data: json as SupabaseSyncResponse,
    };
  } catch {
    return {
      ok: false,
      error: 'عدم دسترسی به سرور Supabase (تغییرات در صف آفلاین ذخیره ماند).',
      code: 'NETWORK_ERROR',
    };
  }
}

export async function pullSnapshotFromSupabase(
  idToken: string,
  backupId?: string
): Promise<{
  ok: boolean;
  found?: boolean;
  backupId?: string;
  revision?: number;
  lastDeviceLabel?: string;
  updatedAt?: string;
  snapshotJson?: string;
  error?: string;
}> {
  try {
    const url = apiUrl(backupId
      ? `/api/supabase/pull?backupId=${encodeURIComponent(backupId)}`
      : '/api/supabase/pull');
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    });
    const json = (await resp.json().catch(() => ({}))) as {
      found?: boolean;
      backupId?: string;
      revision?: number;
      lastDeviceLabel?: string;
      updatedAt?: string;
      snapshotJson?: string;
      error?: string;
    };
    if (!resp.ok) {
      return { ok: false, error: json.error || 'خطا در بازیابی از Supabase' };
    }
    return { ok: true, ...json };
  } catch {
    return { ok: false, error: 'ارتباط با Supabase برقرار نشد.' };
  }
}


const SUPABASE_DEVICE_TOKEN_KEY = 'holoo_apex_supabase_device_token_v1';

export function loadSupabaseDeviceToken(): string | null {
  try {
    const token = localStorage.getItem(SUPABASE_DEVICE_TOKEN_KEY);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function saveSupabaseDeviceToken(token: string): void {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('مجوز دستگاه معتبر نیست.');
  localStorage.setItem(SUPABASE_DEVICE_TOKEN_KEY, token);
}

export async function createSupabasePairCode(idToken: string, deviceId: string): Promise<{ok:boolean;code?:string;expiresAt?:string;error?:string}> {
  try {
    const resp = await fetch(apiUrl('/api/supabase/pair-code'), {
      method: 'POST',
      headers: {'Content-Type':'application/json', Authorization:`Bearer ${idToken}`},
      body: JSON.stringify({deviceId}),
    });
    const json = await resp.json().catch(() => ({})) as {code?:string;expiresAt?:string;error?:string};
    return resp.ok && json.code ? {ok:true,code:json.code,expiresAt:json.expiresAt} : {ok:false,error:json.error || 'ساخت کد جفت‌سازی ناموفق بود.'};
  } catch {
    return {ok:false,error:'ارتباط با سرور برقرار نشد.'};
  }
}

export async function redeemSupabasePairCode(code: string, deviceId: string, deviceLabel: string): Promise<{ok:boolean;deviceToken?:string;error?:string}> {
  try {
    const resp = await fetch(apiUrl('/api/supabase/pair'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code,deviceId,deviceLabel}),
    });
    const json = await resp.json().catch(() => ({})) as {deviceToken?:string;error?:string};
    if (!resp.ok || !json.deviceToken) return {ok:false,error:json.error || 'جفت‌سازی دستگاه ناموفق بود.'};
    saveSupabaseDeviceToken(json.deviceToken);
    return {ok:true,deviceToken:json.deviceToken};
  } catch {
    return {ok:false,error:'ارتباط با سرور برقرار نشد.'};
  }
}
