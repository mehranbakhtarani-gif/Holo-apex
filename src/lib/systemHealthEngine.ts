import {
  Account,
  ActiveModule,
  Cheque,
  CompanyProfile,
  CurrencyDefinition,
  ExchangeRateEntry,
  Invoice,
  Party,
  Product,
  RbacOperator,
  TrialBalanceRow,
  Voucher,
} from '../types/accounting';
import {
  AuditReport,
  BalanceSheetSummary,
  computeBalanceSheet,
  computeIncomeStatement,
  computeTrialBalance,
  IncomeStatementSummary,
} from './accountingEngine';
import {
  buildBankLoanSchedule,
  DevicePresenceRecord,
  generateMoadianTaxId22,
  MoadianInvoiceMeta,
  PettyCashItem,
  YarnDyeLot,
} from './apexExtensions';
import { getFirestoreCacheMode } from './firebase';
import {
  calculateChequeRasGiri,
  dayIndexToShamsi,
  formatCompactMoney,
  getTodayShamsi,
  numberToPersianWords,
  shamsiToDayIndex,
  toPersianDigits,
} from './format';
import { getOfflineSwState } from './offlineStatus';
import { ConflictResolutionPolicy, SupabaseStatusInfo } from './dualCloudSync';

export type SystemHealthDomain =
  | 'core_engine'
  | 'accounting'
  | 'auditing'
  | 'operations'
  | 'offline_pwa'
  | 'sync_security';

export type HealthCheckStatus = 'healthy' | 'warning' | 'error';

export interface HealthAction {
  label: string;
  type: 'navigate' | 'renumber_vouchers' | 'local_backup' | 'warm_cache';
  targetModule?: ActiveModule;
  intent?: string;
}

export interface HealthCheckItem {
  id: string;
  domain: SystemHealthDomain;
  title: string;
  status: HealthCheckStatus;
  summary: string;
  metricValue?: string;
  details?: string[];
  durationMs?: number;
  action?: HealthAction;
}

export interface DomainHealthSummary {
  domain: SystemHealthDomain;
  label: string;
  healthy: number;
  warning: number;
  error: number;
  total: number;
}

export interface StorageDiagnostics {
  localStorageOk: boolean;
  localStorageKb: number;
  indexedDbOk: boolean;
  cacheStorageOk: boolean;
  cacheBucketCount: number;
  cachedAssetCount: number;
  storageUsageMb: number | null;
  storageQuotaMb: number | null;
}

export interface SystemHealthReport {
  checkedAtIso: string;
  checkedAtShamsi: string;
  totalDurationMs: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
  overallScore: number;
  healthyCount: number;
  warningCount: number;
  errorCount: number;
  domainSummaries: DomainHealthSummary[];
  checks: HealthCheckItem[];
  smartExecutiveSummary: string;
  storageStats: StorageDiagnostics;
}

export const HEALTH_DOMAIN_LABELS: Record<SystemHealthDomain, string> = {
  core_engine: 'هسته محاسباتی و ریاضی',
  accounting: 'سیستم حسابداری و دفاتر',
  auditing: 'حسابرسی و تطبیق کل/تفصیلی',
  operations: 'انبار، خزانه، ارز و مودیان',
  offline_pwa: 'آفلاین، PWA و حافظه دستگاه',
  sync_security: 'همگام‌سازی ابری و امنیت',
};

export interface SystemHealthInput {
  profile: CompanyProfile;
  accounts: Account[];
  parties: Party[];
  products: Product[];
  vouchers: Voucher[];
  invoices: Invoice[];
  cheques: Cheque[];
  currencies: CurrencyDefinition[];
  exchangeRates: ExchangeRateEntry[];
  rbacOperators: RbacOperator[];
  trialBalance: TrialBalanceRow[];
  incomeStatement: IncomeStatementSummary;
  balanceSheet: BalanceSheetSummary;
  auditReport: AuditReport;
  isCloudMode: boolean;
  isSyncing: boolean;
  isOnline: boolean;
  localSnapshotCount: number;
  lastLocalBackupAt: string | null;
  dyeLots: YarnDyeLot[];
  pettyCashItems: PettyCashItem[];
  moadianLinks: Record<string, MoadianInvoiceMeta>;
  onlineDevices: DevicePresenceRecord[];
  isStandalonePwa: boolean;
  supabaseStatus?: SupabaseStatusInfo;
  pendingOfflineQueueCount?: number;
  conflictPolicy?: ConflictResolutionPolicy;
}

async function probeLocalStorage(): Promise<{ ok: boolean; kb: number }> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ok: false, kb: 0 };
  }
  const probeKey = '__apex_health_probe__';
  try {
    const token = `ok_${Date.now()}`;
    window.localStorage.setItem(probeKey, token);
    const readBack = window.localStorage.getItem(probeKey);
    window.localStorage.removeItem(probeKey);
    let totalChars = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) {
        totalChars += k.length + (window.localStorage.getItem(k)?.length || 0);
      }
    }
    return {
      ok: readBack === token,
      kb: Math.round(((totalChars * 2) / 1024) * 10) / 10,
    };
  } catch {
    return { ok: false, kb: 0 };
  }
}

async function probeIndexedDb(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('holoo_apex_health_probe_v1', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('probe')) {
          req.result.createObjectStore('probe');
        }
      };
      req.onsuccess = () => {
        try {
          const idb = req.result;
          const tx = idb.transaction('probe', 'readwrite');
          tx.objectStore('probe').put(Date.now(), 'ping');
          tx.oncomplete = () => {
            idb.close();
            resolve(true);
          };
          tx.onerror = () => {
            idb.close();
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function probeCacheStorage(): Promise<{
  ok: boolean;
  bucketCount: number;
  assetCount: number;
}> {
  if (typeof caches === 'undefined') {
    return { ok: false, bucketCount: 0, assetCount: 0 };
  }
  try {
    const keys = await caches.keys();
    let assetCount = 0;
    for (const key of keys) {
      const cache = await caches.open(key);
      const reqs = await cache.keys();
      assetCount += reqs.length;
    }
    return { ok: true, bucketCount: keys.length, assetCount };
  } catch {
    return { ok: false, bucketCount: 0, assetCount: 0 };
  }
}

async function probeStorageQuota(): Promise<{ usageMb: number | null; quotaMb: number | null }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return {
        usageMb:
          typeof est.usage === 'number'
            ? Math.round((est.usage / (1024 * 1024)) * 100) / 100
            : null,
        quotaMb:
          typeof est.quota === 'number'
            ? Math.round((est.quota / (1024 * 1024)) * 10) / 10
            : null,
      };
    }
  } catch {
    // ignore
  }
  return { usageMb: null, quotaMb: null };
}

/**
 * Runs deterministic, isolated in-memory self-tests on core accounting & financial algorithms
 * without mutating any user data.
 */
function runCoreEngineSelfTest(): HealthCheckItem {
  const t0 = performance.now();
  const failures: string[] = [];

  try {
    // 1. Double-entry engine & Balance Sheet equation test on synthetic balanced ledger
    const testAccounts: Account[] = [
      { id: 'a1', ownerId: 't', code: '10101', title: 'صندوق', level: 'moein', category: 'asset', nature: 'debit', isSystem: true },
      { id: 'a2', ownerId: 't', code: '50101', title: 'سرمایه', level: 'moein', category: 'equity', nature: 'credit', isSystem: true },
      { id: 'a3', ownerId: 't', code: '60101', title: 'فروش', level: 'moein', category: 'revenue', nature: 'credit', isSystem: true },
      { id: 'a4', ownerId: 't', code: '80101', title: 'هزینه', level: 'moein', category: 'expense', nature: 'debit', isSystem: true },
    ];
    const testVouchers: Voucher[] = [
      {
        id: 'v1',
        ownerId: 't',
        voucherNumber: 1,
        date: '1405/01/01',
        description: 'تست افتتاحیه',
        voucherType: 'opening',
        status: 'permanent',
        totalDebit: 1_000_000,
        totalCredit: 1_000_000,
        lines: [
          { accountCode: '10101', accountTitle: 'صندوق', description: 'تست', debit: 1_000_000, credit: 0 },
          { accountCode: '50101', accountTitle: 'سرمایه', description: 'تست', debit: 0, credit: 1_000_000 },
        ],
      },
      {
        id: 'v2',
        ownerId: 't',
        voucherNumber: 2,
        date: '1405/01/15',
        description: 'تست فروش و هزینه',
        voucherType: 'sales',
        status: 'permanent',
        totalDebit: 500_000,
        totalCredit: 500_000,
        lines: [
          { accountCode: '10101', accountTitle: 'صندوق', description: 'تست', debit: 300_000, credit: 0 },
          { accountCode: '80101', accountTitle: 'هزینه', description: 'تست', debit: 200_000, credit: 0 },
          { accountCode: '60101', accountTitle: 'فروش', description: 'تست', debit: 0, credit: 500_000 },
        ],
      },
    ];
    const tb = computeTrialBalance(testAccounts, testVouchers);
    const inc = computeIncomeStatement(tb);
    const bs = computeBalanceSheet(tb);
    if (inc.netProfit !== 300_000) {
      failures.push(`محاسبه سود خالص هسته نامعتبر بود (خروجی ${inc.netProfit})`);
    }
    if (!bs.isBalanced || bs.totalAssets !== 1_300_000) {
      failures.push('معادله ترازنامه در تست مصنوعی هسته تراز نشد');
    }

    // 2. Shamsi calendar round-trip & Cheque Ras-Giri (راس‌گیری) test
    const baseIdx = shamsiToDayIndex('1405/02/10');
    const roundTrip = dayIndexToShamsi(baseIdx);
    if (roundTrip !== '1405/02/10') {
      failures.push(`تبدیل تاریخ شمسی رفت‌وبرگشتی ناهماهنگ بود (${roundTrip})`);
    }
    const ras = calculateChequeRasGiri(
      [
        { amount: 1_000_000, dueDate: '1405/02/20' },
        { amount: 1_000_000, dueDate: '1405/02/30' },
      ],
      '1405/02/10'
    );
    if (ras.weightedDaysFromBase !== 15) {
      failures.push(`محاسبه راس‌گیری چک خارج از انتظار بود (${ras.weightedDaysFromBase} روز)`);
    }

    // 3. Persian words formatter + Moadian 22-char Tax ID + Bank loan amortization test
    const words = numberToPersianWords(12_500_000, 'IRT');
    if (!words.includes('تومان')) {
      failures.push('مبدل مبلغ به حروف فارسی خروجی معتبر نداشت');
    }
    const taxId = generateMoadianTaxId22('INV-1405-0042', '1405/04/12', '411589203411');
    if (taxId.length !== 22) {
      failures.push(`طول شناسه مالیاتی مودیان ۲۲ کاراکتر نبود (${taxId.length})`);
    }
    const loanSchedule = buildBankLoanSchedule({
      principalIrr: 120_000_000,
      annualInterestPct: 18,
      installmentCount: 12,
      startDate: '1405/01/15',
    });
    const principalSum = loanSchedule.reduce((s, r) => s + r.principalIrr, 0);
    if (loanSchedule.length !== 12 || Math.abs(principalSum - 120_000_000) > 5) {
      failures.push('جمع اصل اقساط تسهیلات با اصل وام منطبق نشد');
    }
  } catch (err) {
    failures.push(`خطای اجرایی در خودآزمایی هسته: ${err instanceof Error ? err.message : String(err)}`);
  }

  const durationMs = Math.max(0.1, Math.round((performance.now() - t0) * 10) / 10);

  return {
    id: 'core_self_test',
    domain: 'core_engine',
    title: 'خودآزمایی زنده هسته محاسباتی (۵ آزمون ریاضی و مالی)',
    status: failures.length === 0 ? 'healthy' : 'error',
    summary:
      failures.length === 0
        ? 'تمامی آزمون‌های هسته دوبل، ترازنامه، راس‌گیری چک، تقویم شمسی، مودیان ۲۲ کاراکتری و اقساط وام با دقت ۱۰۰٪ پاس شدند.'
        : `${toPersianDigits(failures.length)} مورد خطا در خودآزمایی هسته محاسباتی شناسایی شد.`,
    metricValue: `${toPersianDigits(durationMs)} ms`,
    details: failures,
    durationMs,
  };
}

export async function runFullSystemHealthCheck(
  input: SystemHealthInput
): Promise<SystemHealthReport> {
  const startAll = performance.now();
  const checks: HealthCheckItem[] = [];
  const unit = input.profile.currencyUnit;

  // ==================== 1. CORE ENGINE ====================
  checks.push(runCoreEngineSelfTest());

  // Core Data Schema Integrity (NaN / invalid lines check)
  const malformedVouchers = input.vouchers.filter(
    (v) =>
      !Array.isArray(v.lines) ||
      v.lines.length === 0 ||
      v.lines.some((l) => !Number.isFinite(Number(l.debit)) || !Number.isFinite(Number(l.credit)))
  );
  checks.push({
    id: 'core_data_integrity',
    domain: 'core_engine',
    title: 'سلامت ساختاری رکوردها و جلوگیری از مقادیر NaN',
    status: malformedVouchers.length === 0 ? 'healthy' : 'error',
    summary:
      malformedVouchers.length === 0
        ? `ساختار ${toPersianDigits(input.vouchers.length)} سند، ${toPersianDigits(input.invoices.length)} فاکتور و ${toPersianDigits(input.accounts.length)} حساب کاملاً استاندارد است.`
        : `${toPersianDigits(malformedVouchers.length)} سند دارای ردیف نامعتبر یا عدد مخدوش است.`,
    metricValue: `${toPersianDigits(input.vouchers.length + input.invoices.length)} رکورد`,
    details: malformedVouchers.slice(0, 5).map((v) => `سند #${toPersianDigits(v.voucherNumber)} (${v.date})`),
    action:
      malformedVouchers.length > 0
        ? { label: 'بررسی اسناد', type: 'navigate', targetModule: 'vouchers' }
        : undefined,
  });

  // ==================== 2. ACCOUNTING SYSTEM ====================
  const unbalancedVouchers = input.vouchers.filter((v) => {
    const d = v.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = v.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return Math.abs(d - c) >= 1;
  });
  checks.push({
    id: 'acc_voucher_balance',
    domain: 'accounting',
    title: 'توازن بدهکار و بستانکار تمام اسناد حسابداری',
    status: unbalancedVouchers.length === 0 ? 'healthy' : 'error',
    summary:
      unbalancedVouchers.length === 0
        ? `هر ${toPersianDigits(input.vouchers.length)} سند ثبت‌شده در سیستم دوبل کاملاً تراز هستند.`
        : `${toPersianDigits(unbalancedVouchers.length)} سند ناتراز یافت شد که باید فوراً اصلاح شود.`,
    metricValue:
      unbalancedVouchers.length === 0
        ? '۱۰۰٪ تراز'
        : `${toPersianDigits(unbalancedVouchers.length)} ناتراز`,
    details: unbalancedVouchers.slice(0, 5).map((v) => `سند #${toPersianDigits(v.voucherNumber)} — ${v.description}`),
    action:
      unbalancedVouchers.length > 0
        ? { label: 'اصلاح اسناد', type: 'navigate', targetModule: 'vouchers' }
        : undefined,
  });

  checks.push({
    id: 'acc_balance_sheet_eq',
    domain: 'accounting',
    title: 'معادله بنیادی ترازنامه (دارایی = بدهی + سرمایه + سود)',
    status: input.balanceSheet.isBalanced ? 'healthy' : 'error',
    summary: input.balanceSheet.isBalanced
      ? `ترازنامه با جمع دارایی ${formatCompactMoney(input.balanceSheet.totalAssets, unit)} کاملاً متوازن است.`
      : `اختلاف ترازنامه به مبلغ ${formatCompactMoney(Math.abs(input.balanceSheet.difference), unit)} مشاهده شد.`,
    metricValue: input.balanceSheet.isBalanced ? 'متوازن' : 'اختلاف تراز',
    action: !input.balanceSheet.isBalanced
      ? { label: 'مشاهده ترازنامه', type: 'navigate', targetModule: 'reports', intent: 'bs' }
      : undefined,
  });

  const tbDebit = input.trialBalance.reduce((s, r) => s + r.balanceDebit, 0);
  const tbCredit = input.trialBalance.reduce((s, r) => s + r.balanceCredit, 0);
  const tbDiff = Math.abs(tbDebit - tbCredit);
  checks.push({
    id: 'acc_trial_balance',
    domain: 'accounting',
    title: 'توازن مانده‌های تراز آزمایشی (۴ ستونی و ۶ ستونی)',
    status: tbDiff < 1 ? 'healthy' : 'error',
    summary:
      tbDiff < 1
        ? `مجموع مانده بدهکار و بستانکار در ${toPersianDigits(input.trialBalance.length)} حساب فعال دقیقاً برابر است.`
        : `اختلاف ${formatCompactMoney(tbDiff, unit)} بین ستون بدهکار و بستانکار تراز آزمایشی وجود دارد.`,
    metricValue: `${toPersianDigits(input.trialBalance.length)} حساب`,
    action:
      tbDiff >= 1
        ? { label: 'مشاهده تراز آزمایشی', type: 'navigate', targetModule: 'reports', intent: 'trial' }
        : undefined,
  });

  // ==================== 3. AUDITING ENGINE ====================
  const rec = input.auditReport.reconciliation;
  const recMismatches: string[] = [];
  if (Math.abs(rec.glReceivables - rec.subReceivables) >= 1) recMismatches.push('اختلاف معین ۱۰۴۰۱ با تفصیلی مشتریان');
  if (Math.abs(rec.glPayables - rec.subPayables) >= 1) recMismatches.push('اختلاف معین ۳۰۱۰۱ با تفصیلی تأمین‌کنندگان');
  if (Math.abs(rec.glSalesVat - rec.invSalesVat) >= 1) recMismatches.push('اختلاف مالیات فروش ۳۰۳۰۱ با فاکتورها');
  if (Math.abs(rec.glPurchaseVat - rec.invPurchaseVat) >= 1) recMismatches.push('اختلاف مالیات خرید ۳۰۳۰۲ با فاکتورها');
  if (Math.abs(rec.glInventory - rec.subInventory) >= 1) recMismatches.push('اختلاف معین انبار ۱۰۵۰۱ با ارزش ریالی کالاها');

  checks.push({
    id: 'audit_overall_score',
    domain: 'auditing',
    title: 'امتیاز و وضعیت کلی موتور حسابرسی هوشمند',
    status:
      input.auditReport.errorCount > 0
        ? 'error'
        : input.auditReport.warningCount > 0
          ? 'warning'
          : 'healthy',
    summary: `${toPersianDigits(input.auditReport.passedCount)} کنترل تأییدشده، ${toPersianDigits(input.auditReport.warningCount)} هشدار و ${toPersianDigits(input.auditReport.errorCount)} خطای بحرانی.`,
    metricValue: `${toPersianDigits(input.auditReport.score)}٪`,
    action: { label: 'ورود به مرکز حسابرسی', type: 'navigate', targetModule: 'audit' },
  });

  checks.push({
    id: 'audit_gl_sub_matrix',
    domain: 'auditing',
    title: 'تطبیق ۵ محور دفتر کل/معین با تفصیلی و انبار',
    status: recMismatches.length === 0 ? 'healthy' : 'warning',
    summary:
      recMismatches.length === 0
        ? 'هر ۵ محور تطبیق (مشتریان، تأمین‌کنندگان، ارزش افزوده خرید/فروش و انبار) ۱۰۰٪ هم‌تراز هستند.'
        : `${toPersianDigits(recMismatches.length)} محور نیازمند بررسی تطبیق است.`,
    metricValue: `${toPersianDigits(5 - recMismatches.length)} / ۵`,
    details: recMismatches,
    action:
      recMismatches.length > 0
        ? { label: 'مشاهده ماتریس تطبیق', type: 'navigate', targetModule: 'audit' }
        : undefined,
  });

  // Check chronological voucher sequence & draft vouchers
  const sortedNums = [...input.vouchers]
    .map((v) => v.voucherNumber)
    .sort((a, b) => a - b);
  const hasSequenceGap = sortedNums.some((num, idx) => num !== idx + 1);
  const draftCount = input.vouchers.filter((v) => v.status === 'draft').length;
  checks.push({
    id: 'audit_voucher_sequence',
    domain: 'auditing',
    title: 'توالی شماره‌گذاری اسناد و کارتابل اسناد موقت',
    status: hasSequenceGap ? 'warning' : draftCount > 0 ? 'warning' : 'healthy',
    summary: hasSequenceGap
      ? 'در توالی شماره اسناد گسستگی یا تکرار مشاهده شد؛ با یک کلیک قابل مرتب‌سازی است.'
      : draftCount > 0
        ? `توالی شماره اسناد سالم است، اما ${toPersianDigits(draftCount)} سند موقت در کارتابل منتظر قطعی‌شدن است.`
        : 'توالی شماره‌گذاری پیوسته و تمام اسناد قطعی هستند.',
    metricValue: hasSequenceGap
      ? 'گسستگی شماره'
      : draftCount > 0
        ? `${toPersianDigits(draftCount)} موقت`
        : 'مرتب و قطعی',
    action: hasSequenceGap
      ? { label: 'مرتب‌سازی خودکار اسناد', type: 'renumber_vouchers' }
      : draftCount > 0
        ? { label: 'کارتابل اسناد', type: 'navigate', targetModule: 'vouchers', intent: 'cartable' }
        : undefined,
  });

  // ==================== 4. OPERATIONS (INVENTORY, TREASURY, INVOICES, FX) ====================
  const negativeStock = input.products.filter((p) => p.stock < 0 || !Number.isFinite(p.stock));
  const lowStock = input.products.filter((p) => p.stock >= 0 && p.stock <= p.reorderPoint);
  const negativeLots = input.dyeLots.filter((l) => l.remainingWeightKg < 0);
  checks.push({
    id: 'ops_inventory_lots',
    domain: 'operations',
    title: 'سلامت موجودی انبار و لات‌های رنگرزی نخ',
    status:
      negativeStock.length > 0 || negativeLots.length > 0
        ? 'error'
        : lowStock.length > 0
          ? 'warning'
          : 'healthy',
    summary:
      negativeStock.length > 0 || negativeLots.length > 0
        ? `${toPersianDigits(negativeStock.length)} کالا و ${toPersianDigits(negativeLots.length)} لات دارای موجودی منفی هستند.`
        : lowStock.length > 0
          ? `موجودی منفی وجود ندارد؛ ${toPersianDigits(lowStock.length)} کالا به نقطه سفارش رسیده‌اند.`
          : `موجودی هر ${toPersianDigits(input.products.length)} کالا و ${toPersianDigits(input.dyeLots.length)} لات رنگرزی نرمال است.`,
    metricValue: `${toPersianDigits(input.products.length)} کالا`,
    details: [
      ...negativeStock.slice(0, 3).map((p) => `موجودی منفی: ${p.name}`),
      ...lowStock.slice(0, 3).map((p) => `نقطه سفارش: ${p.name}`),
    ],
    action:
      negativeStock.length > 0 || lowStock.length > 0
        ? { label: 'مدیریت انبار', type: 'navigate', targetModule: 'inventory' }
        : undefined,
  });

  const voucherIds = new Set(input.vouchers.map((v) => v.id));
  const orphanInvoices = input.invoices.filter(
    (inv) =>
      inv.invoiceType !== 'proforma' &&
      inv.status !== 'cancelled' &&
      (!inv.voucherId || !voucherIds.has(inv.voucherId))
  );
  const moadianLinkedCount = Object.keys(input.moadianLinks).length;
  checks.push({
    id: 'ops_invoices_moadian',
    domain: 'operations',
    title: 'اتصال فاکتورها به سند حسابداری و سامانه مودیان',
    status: orphanInvoices.length === 0 ? 'healthy' : 'warning',
    summary:
      orphanInvoices.length === 0
        ? `تمامی فاکتورهای رسمی به سند حسابداری معتبر متصل هستند (${toPersianDigits(moadianLinkedCount)} شناسه ۲۲ کاراکتری مودیان ثبت شده).`
        : `${toPersianDigits(orphanInvoices.length)} فاکتور فاقد سند حسابداری متناظر است.`,
    metricValue: `${toPersianDigits(input.invoices.length)} فاکتور`,
    details: orphanInvoices.slice(0, 4).map((i) => `فاکتور ${i.invoiceNumber} — ${i.partyName}`),
    action:
      orphanInvoices.length > 0
        ? { label: 'بررسی فاکتورها', type: 'navigate', targetModule: 'invoices' }
        : undefined,
  });

  const bouncedCheques = input.cheques.filter((c) => c.status === 'bounced');
  const invalidSayadi = input.cheques.filter(
    (c) =>
      (c.status === 'in_box' || c.status === 'deposited') &&
      c.sayadiId.replace(/\D/g, '').length !== 16
  );
  checks.push({
    id: 'ops_treasury_cheques',
    domain: 'operations',
    title: 'خزانه‌داری، چک‌های صیادی و تنخواه‌گردان',
    status:
      bouncedCheques.length > 0
        ? 'warning'
        : invalidSayadi.length > 0
          ? 'warning'
          : 'healthy',
    summary:
      bouncedCheques.length > 0
        ? `${toPersianDigits(bouncedCheques.length)} فقره چک برگشتی پیگیری‌نشده در سیستم وجود دارد.`
        : invalidSayadi.length > 0
          ? `${toPersianDigits(invalidSayadi.length)} چک فعال دارای شناسه صیادی غیر ۱۶ رقمی است.`
          : `وضعیت ${toPersianDigits(input.cheques.length)} فقره چک صیادی و ${toPersianDigits(input.pettyCashItems.length)} قبض تنخواه سالم است.`,
    metricValue: `${toPersianDigits(input.cheques.length)} چک`,
    action:
      bouncedCheques.length > 0 || invalidSayadi.length > 0
        ? { label: 'مدیریت چک‌ها', type: 'navigate', targetModule: 'treasury', intent: 'cheques' }
        : undefined,
  });

  const invalidCurrencies = input.currencies.filter(
    (c) => c.active && !c.isBase && (!Number.isFinite(c.defaultRateToIrr) || c.defaultRateToIrr <= 0)
  );
  checks.push({
    id: 'ops_fx_rates',
    domain: 'operations',
    title: 'ماژول چندارزی و نرخ برابری ارزهای فعال',
    status: invalidCurrencies.length === 0 ? 'healthy' : 'warning',
    summary:
      invalidCurrencies.length === 0
        ? `${toPersianDigits(input.currencies.filter((c) => c.active).length)} ارز فعال با ${toPersianDigits(input.exchangeRates.length)} رکورد نرخ روز آماده تسعیر هستند.`
        : `${toPersianDigits(invalidCurrencies.length)} ارز فعال نرخ برابری معتبر ندارد.`,
    metricValue: `${toPersianDigits(input.currencies.filter((c) => c.active).length)} ارز`,
    action:
      invalidCurrencies.length > 0
        ? { label: 'تنظیم نرخ ارز', type: 'navigate', targetModule: 'currencies' }
        : undefined,
  });

  // ==================== 5. OFFLINE & PWA READINESS (REAL BROWSER PROBES) ====================
  const [lsProbe, idbOk, cacheProbe, quotaProbe] = await Promise.all([
    probeLocalStorage(),
    probeIndexedDb(),
    probeCacheStorage(),
    probeStorageQuota(),
  ]);

  const swState = getOfflineSwState();
  let swRegistered = swState.registered;
  let swControlling = swState.controlling;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      swRegistered = swRegistered || regs.length > 0;
      swControlling = Boolean(navigator.serviceWorker.controller);
    } catch {
      // ignore restricted SW access
    }
  }

  checks.push({
    id: 'offline_service_worker',
    domain: 'offline_pwa',
    title: 'سرویس‌ورکر (Service Worker) و اجرای بدون اینترنت',
    status: swRegistered && swControlling ? 'healthy' : swRegistered ? 'warning' : 'warning',
    summary:
      swRegistered && swControlling
        ? 'سرویس‌ورکر فعال است و کنترل صفحه را در اختیار دارد؛ برنامه پس از قطع اینترنت نیز اجرا می‌شود.'
        : swRegistered
          ? 'سرویس‌ورکر ثبت شده است؛ برای فعال‌سازی کامل کنترل آفلاین، یک بار کش را گرم کنید یا صفحه را تازه نمایید.'
          : 'سرویس‌ورکر هنوز کنترل صفحه را نگرفته است (در محیط پیش‌نمایش یا اولین اجرا طبیعی است).',
    metricValue: swControlling ? 'فعال و کنترل‌گر' : swRegistered ? 'ثبت‌شده' : 'در انتظار',
    action: !swControlling
      ? { label: 'آماده‌سازی کش آفلاین', type: 'warm_cache' }
      : undefined,
  });

  checks.push({
    id: 'offline_cache_storage',
    domain: 'offline_pwa',
    title: 'حافظه کش فایل‌ها و فونت‌های آفلاین (Cache Storage)',
    status: cacheProbe.ok && cacheProbe.assetCount > 0 ? 'healthy' : cacheProbe.ok ? 'warning' : 'error',
    summary:
      cacheProbe.ok && cacheProbe.assetCount > 0
        ? `${toPersianDigits(cacheProbe.assetCount)} فایل برنامه در ${toPersianDigits(cacheProbe.bucketCount)} مخزن کش آفلاین ذخیره شده است.`
        : cacheProbe.ok
          ? 'مخزن کش پشتیبانی می‌شود اما هنوز فایل‌های پوسته آفلاین گرم نشده‌اند.'
          : 'مرورگر فعلی اجازه دسترسی به Cache Storage را نمی‌دهد.',
    metricValue: `${toPersianDigits(cacheProbe.assetCount)} فایل`,
    action:
      cacheProbe.ok && cacheProbe.assetCount === 0
        ? { label: 'ذخیره فایل‌ها در کش', type: 'warm_cache' }
        : undefined,
  });

  checks.push({
    id: 'offline_local_storage_idb',
    domain: 'offline_pwa',
    title: 'ذخیره‌سازی دائمی دستگاه (IndexedDB + LocalStorage + پشتیبان)',
    status: lsProbe.ok && idbOk ? 'healthy' : lsProbe.ok || idbOk ? 'warning' : 'error',
    summary:
      lsProbe.ok && idbOk
        ? `آزمون خواندن/نوشتن IndexedDB و LocalStorage موفق بود. ${toPersianDigits(input.localSnapshotCount)} نسخه پشتیبان داخلی روی دستگاه موجود است.`
        : 'یکی از لایه‌های حافظه داخلی مرورگر محدود شده است (ممکن است در حالت Incognito باشید).',
    metricValue:
      quotaProbe.usageMb !== null
        ? `${toPersianDigits(quotaProbe.usageMb)} MB`
        : `${toPersianDigits(lsProbe.kb)} KB`,
    details: [
      `حجم LocalStorage: ${toPersianDigits(lsProbe.kb)} کیلوبایت`,
      `آخرین پشتیبان داخلی: ${input.lastLocalBackupAt ? toPersianDigits(input.lastLocalBackupAt) : 'هنوز ذخیره نشده'}`,
      ...(quotaProbe.quotaMb !== null
        ? [`ظرفیت کل مجاز دستگاه: ${toPersianDigits(quotaProbe.quotaMb)} مگابایت`]
        : []),
    ],
    action:
      input.localSnapshotCount === 0
        ? { label: 'ذخیره پشتیبان فوری', type: 'local_backup' }
        : undefined,
  });

  const fsCacheMode = getFirestoreCacheMode();
  checks.push({
    id: 'offline_firestore_cache',
    domain: 'offline_pwa',
    title: 'کش آفلاین پایگاه‌داده ابری (Firestore Persistence)',
    status: fsCacheMode !== 'memory' ? 'healthy' : 'warning',
    summary:
      fsCacheMode === 'persistent-multitab'
        ? 'کش دائمی چندتب IndexedDB برای Firestore فعال است؛ تغییرات آفلاین در صف ذخیره شده و پس از اتصال خودکار ارسال می‌شوند.'
        : fsCacheMode === 'persistent-single'
          ? 'کش دائمی تک‌تب IndexedDB برای Firestore فعال است و کار آفلاین پشتیبانی می‌شود.'
          : 'کش Firestore در حالت حافظه موقت است؛ داده‌ها از طریق پشتیبان خودکار داخلی دستگاه محافظت می‌شوند.',
    metricValue:
      fsCacheMode === 'persistent-multitab'
        ? 'چندتب دائمی'
        : fsCacheMode === 'persistent-single'
          ? 'تک‌تب دائمی'
          : 'حافظه موقت',
  });

  // ==================== 6. CLOUD SYNC & SECURITY ====================
  checks.push({
    id: 'sync_cloud_connectivity',
    domain: 'sync_security',
    title: 'وضعیت اتصال شبکه و همگام‌سازی ابری چنددستگاهی',
    status: !input.isOnline ? 'warning' : input.isCloudMode ? 'healthy' : 'warning',
    summary: !input.isOnline
      ? 'دستگاه هم‌اکنون در حالت کاملاً آفلاین است؛ تمام ثبت‌های حسابداری روی حافظه دستگاه ذخیره می‌شوند.'
      : input.isCloudMode
        ? `متصل به فضای ابری (${input.profile.email || 'کاربر احرازشده'}) · ${toPersianDigits(Math.max(1, input.onlineDevices.length))} دستگاه آنلاین.`
        : 'برنامه در حالت کاملاً محلی (آفلاین دستگاه) اجرا می‌شود. در صورت نیاز می‌توانید ذخیره ابری را فعال کنید.',
    metricValue: !input.isOnline
      ? 'آفلاین ایمن'
      : input.isCloudMode
        ? input.isSyncing
          ? 'در حال سینک'
          : 'ابری متصل'
        : 'حالت محلی',
  });

  if (input.supabaseStatus) {
    const sb = input.supabaseStatus;
    const queueCount = input.pendingOfflineQueueCount ?? 0;
    const policyLabel =
      input.conflictPolicy === 'first_write_wins'
        ? 'اولویت با اولین ثبت (First-Write-Wins)'
        : 'اولویت با آخرین تغییر (Last-Write-Wins)';

    const sbStatus: HealthCheckStatus = !input.isOnline
      ? 'warning'
      : sb.configured && sb.connected && sb.tableReady && queueCount === 0
        ? 'healthy'
        : 'warning';

    const sbSummary = !input.isOnline
      ? `آفلاین: ${toPersianDigits(queueCount)} تغییر در صف آفلاین-اول ذخیره شده و با برقراری اینترنت به Supabase و Firebase ارسال می‌شود.`
      : !sb.configured
        ? 'سرور Supabase هنوز متصل نشده است (متغیرهای SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY در تنظیمات سرور قرار گیرند). ذخیره روی Firebase و حافظه محلی فعال است.'
        : !sb.tableReady
          ? `اتصال به پروژه Supabase برقرار است اما جدول «${sb.tableName}» هنوز ایجاد نشده است (فایل supabase/schema.sql را در SQL Editor اجرا کنید).`
          : queueCount > 0
            ? `Supabase آماده است و ${toPersianDigits(queueCount)} تراکنش در صف ارسال قرار دارد.`
            : `همگام‌سازی دوگانه Firebase + Supabase فعال است (${sb.projectRef || 'PostgreSQL'}${sb.latencyMs ? ` · ${toPersianDigits(sb.latencyMs)}ms` : ''}).`;

    checks.push({
      id: 'sync_dual_cloud_supabase',
      domain: 'sync_security',
      title: 'همگام‌سازی دوگانه Supabase PostgreSQL و صف آفلاین-اول',
      status: sbStatus,
      summary: sbSummary,
      metricValue: !input.isOnline
        ? `${toPersianDigits(queueCount)} در صف`
        : sb.configured && sb.tableReady
          ? 'متصل و آماده'
          : sb.configured
            ? 'نیاز به SQL'
            : 'در انتظار کلید',
      details: [
        `سیاست حل تداخل فعال: ${policyLabel}`,
        `تراکنش‌های در انتظار ارسال آفلاین: ${toPersianDigits(queueCount)} مورد`,
        `نام جدول مرکزی Supabase: ${sb.tableName}`,
      ],
    });
  }

  const activeManagers = input.rbacOperators.filter(
    (op) => op.active && op.role === 'finance_manager'
  );
  const profileReady = Boolean(
    input.profile.companyName?.trim() && input.profile.fiscalYear?.trim()
  );
  checks.push({
    id: 'security_rbac_profile',
    domain: 'sync_security',
    title: 'امنیت دسترسی کاربران (RBAC) و هویت شرکتی',
    status: activeManagers.length > 0 && profileReady ? 'healthy' : 'warning',
    summary:
      activeManagers.length > 0 && profileReady
        ? `${toPersianDigits(input.rbacOperators.filter((o) => o.active).length)} اپراتور فعال (شامل ${toPersianDigits(activeManagers.length)} مدیر مالی) و مشخصات شرکت «${input.profile.companyName}» ثبت شده‌اند.`
        : 'لطفاً حداقل یک مدیر مالی فعال در RBAC و مشخصات شرکتی را تکمیل کنید.',
    metricValue: `${toPersianDigits(input.rbacOperators.filter((o) => o.active).length)} اپراتور`,
    action:
      activeManagers.length === 0 || !profileReady
        ? { label: 'تنظیمات و RBAC', type: 'navigate', targetModule: 'settings', intent: 'rbac' }
        : undefined,
  });

  // ==================== AGGREGATE SCORING & SMART SUMMARY ====================
  const healthyCount = checks.filter((c) => c.status === 'healthy').length;
  const warningCount = checks.filter((c) => c.status === 'warning').length;
  const errorCount = checks.filter((c) => c.status === 'error').length;

  const overallScore =
    checks.length > 0
      ? Math.round(((healthyCount + warningCount * 0.6) / checks.length) * 100)
      : 100;

  const overallStatus: SystemHealthReport['overallStatus'] =
    errorCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

  const domainsOrder: SystemHealthDomain[] = [
    'core_engine',
    'accounting',
    'auditing',
    'operations',
    'offline_pwa',
    'sync_security',
  ];

  const domainSummaries: DomainHealthSummary[] = domainsOrder.map((domain) => {
    const sub = checks.filter((c) => c.domain === domain);
    return {
      domain,
      label: HEALTH_DOMAIN_LABELS[domain],
      healthy: sub.filter((c) => c.status === 'healthy').length,
      warning: sub.filter((c) => c.status === 'warning').length,
      error: sub.filter((c) => c.status === 'error').length,
      total: sub.length,
    };
  });

  let smartExecutiveSummary = '';
  if (errorCount === 0 && warningCount === 0) {
    smartExecutiveSummary =
      'تمامی زیرسیستم‌های هلو شرکتی Apex 9.6 شامل هسته محاسباتی، اسناد دوبل، ترازنامه، حسابرسی ۵ محوره، انبار، خزانه و زیرساخت آفلاین در وضعیت کاملاً سالم و عملیاتی هستند.';
  } else if (errorCount > 0) {
    const errTitles = checks
      .filter((c) => c.status === 'error')
      .map((c) => `«${c.title}»`)
      .join('، ');
    smartExecutiveSummary = `تعداد ${toPersianDigits(errorCount)} خطای بحرانی در بخش‌های ${errTitles} شناسایی شد که نیازمند اقدام فوری است. سایر ${toPersianDigits(healthyCount)} آزمون با موفقیت پاس شدند.`;
  } else {
    const warnTitles = checks
      .filter((c) => c.status === 'warning')
      .slice(0, 3)
      .map((c) => `«${c.title}»`)
      .join('، ');
    smartExecutiveSummary = `هسته حسابداری و تراز دفاتر بدون خطای بحرانی است؛ فقط ${toPersianDigits(warningCount)} هشدار قابل بررسی در ${warnTitles} وجود دارد.`;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const totalDurationMs = Math.max(1, Math.round(performance.now() - startAll));

  return {
    checkedAtIso: now.toISOString(),
    checkedAtShamsi: `${getTodayShamsi()} · ${timeStr}`,
    totalDurationMs,
    overallStatus,
    overallScore,
    healthyCount,
    warningCount,
    errorCount,
    domainSummaries,
    checks,
    smartExecutiveSummary,
    storageStats: {
      localStorageOk: lsProbe.ok,
      localStorageKb: lsProbe.kb,
      indexedDbOk: idbOk,
      cacheStorageOk: cacheProbe.ok,
      cacheBucketCount: cacheProbe.bucketCount,
      cachedAssetCount: cacheProbe.assetCount,
      storageUsageMb: quotaProbe.usageMb,
      storageQuotaMb: quotaProbe.quotaMb,
    },
  };
}
