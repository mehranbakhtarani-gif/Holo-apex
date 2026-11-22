import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { exportToCsv, toPersianDigits } from '../lib/format';
import {
  applyPendingSwRefresh,
  subscribeOfflineSwState,
  triggerSwUpdateCheck,
  warmOfflineCacheNow,
} from '../lib/offlineStatus';
import {
  HEALTH_DOMAIN_LABELS,
  HealthAction,
  runFullSystemHealthCheck,
  SystemHealthDomain,
  SystemHealthReport,
} from '../lib/systemHealthEngine';
import { ConflictResolutionPolicy, SupabaseStatusInfo } from '../lib/dualCloudSync';
import { ActiveModule } from '../types/accounting';
import { PWAInstallButton } from './PWAInstallButton';

interface SystemHealthDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (mod: ActiveModule, intent?: string, subKey?: string) => void;
  onReportUpdated?: (report: SystemHealthReport) => void;
  supabaseStatus?: SupabaseStatusInfo;
  pendingOfflineQueueCount?: number;
  conflictPolicy?: ConflictResolutionPolicy;
}

export const SystemHealthDrawer: React.FC<SystemHealthDrawerProps> = ({
  open,
  onClose,
  onNavigate,
  onReportUpdated,
  supabaseStatus,
  pendingOfflineQueueCount,
  conflictPolicy,
}) => {
  const {
    profile,
    accounts,
    parties,
    products,
    vouchers,
    invoices,
    cheques,
    currencies,
    exchangeRates,
    rbacOperators,
    trialBalance,
    incomeStatement,
    balanceSheet,
    auditReport,
    isCloudMode,
    isSyncing,
    localSnapshots,
    lastLocalBackupAt,
    renumberVouchersChronologically,
    triggerLocalBackupNow,
    showToast,
  } = useAccounting();

  const { dyeLots, pettyCashItems, moadianLinks, onlineDevices } = useWorkspaceExtensions();
  const isOnline = useOnlineStatus();
  const { isInstalled } = usePWAInstall();

  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [warmingCache, setWarmingCache] = useState(false);
  const [activeDomain, setActiveDomain] = useState<SystemHealthDomain | 'all'>('all');
  const [swNeedRefresh, setSwNeedRefresh] = useState(false);

  useEffect(() => {
    return subscribeOfflineSwState((st) => {
      setSwNeedRefresh(st.needRefresh);
    });
  }, []);

  const executeScan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await runFullSystemHealthCheck({
        profile,
        accounts,
        parties,
        products,
        vouchers,
        invoices,
        cheques,
        currencies,
        exchangeRates,
        rbacOperators,
        trialBalance,
        incomeStatement,
        balanceSheet,
        auditReport,
        isCloudMode,
        isSyncing,
        isOnline,
        localSnapshotCount: localSnapshots.length,
        lastLocalBackupAt,
        dyeLots,
        pettyCashItems,
        moadianLinks,
        onlineDevices,
        isStandalonePwa: isInstalled,
        supabaseStatus,
        pendingOfflineQueueCount,
        conflictPolicy,
      });
      setReport(result);
      onReportUpdated?.(result);
    } finally {
      setScanning(false);
    }
  }, [
    profile,
    accounts,
    parties,
    products,
    vouchers,
    invoices,
    cheques,
    currencies,
    exchangeRates,
    rbacOperators,
    trialBalance,
    incomeStatement,
    balanceSheet,
    auditReport,
    isCloudMode,
    isSyncing,
    isOnline,
    localSnapshots.length,
    lastLocalBackupAt,
    dyeLots,
    pettyCashItems,
    moadianLinks,
    onlineDevices,
    isInstalled,
    supabaseStatus,
    pendingOfflineQueueCount,
    conflictPolicy,
    onReportUpdated,
  ]);

  useEffect(() => {
    if (open) {
      void executeScan();
    }
  }, [open, executeScan]);

  // Escape key closes drawer cleanly
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleWarmOfflineCache = async () => {
    setWarmingCache(true);
    try {
      await triggerSwUpdateCheck();
      const { cachedCount } = await warmOfflineCacheNow();
      await triggerLocalBackupNow(false);
      showToast(
        `آماده‌سازی کامل آفلاین انجام شد (${toPersianDigits(cachedCount)} فایل پوسته کش شد و پشتیبان داخلی ذخیره گردید).`
      );
      await executeScan();
    } finally {
      setWarmingCache(false);
    }
  };

  const handleAction = async (action: HealthAction) => {
    if (action.type === 'navigate' && action.targetModule) {
      onClose();
      onNavigate(action.targetModule, action.intent);
      return;
    }
    if (action.type === 'renumber_vouchers') {
      await renumberVouchersChronologically();
      await executeScan();
      return;
    }
    if (action.type === 'local_backup') {
      await triggerLocalBackupNow(false);
      await executeScan();
      return;
    }
    if (action.type === 'warm_cache') {
      await handleWarmOfflineCache();
    }
  };

  const handleExportReport = () => {
    if (!report) return;
    exportToCsv(
      `holoo-apex-system-health-${profile.fiscalYear}.csv`,
      ['زیرسیستم', 'عنوان بررسی', 'وضعیت', 'شاخص', 'شرح نتیجه'],
      report.checks.map((c) => [
        HEALTH_DOMAIN_LABELS[c.domain],
        c.title,
        c.status === 'healthy' ? 'سالم' : c.status === 'warning' ? 'هشدار' : 'خطا',
        c.metricValue || '—',
        c.summary,
      ])
    );
    showToast('گزارش کامل سلامت سیستم با فرمت CSV ذخیره شد.');
  };

  if (!open) return null;

  const filteredChecks =
    report?.checks.filter((c) => activeDomain === 'all' || c.domain === activeDomain) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-slate-950/60 dark:backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
      aria-label="مرکز هوشمند پایش سلامت سیستم"
    >
      {/* Backdrop click target */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />

      {/* Glassmorphic Diagnostic Drawer */}
      <div className="w-full max-w-3xl h-full bg-white dark:bg-slate-900/95 dark:backdrop-blur-xl border-r border-slate-200 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden text-right">
        {/* Top Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                report?.overallStatus === 'critical'
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  : report?.overallStatus === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                    : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
              }`}
            >
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                مرکز هوشمند سلامت سیستم و آمادگی آفلاین هلو Apex 9.6
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-code tabular-nums">
                  {report ? `آخرین اسکن: ${toPersianDigits(report.checkedAtShamsi)}` : 'در حال اجرا...'}
                </span>
                {report && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-code tabular-nums">
                      زمان اجرا: {toPersianDigits(report.totalDurationMs)} میلی‌ثانیه
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className={isOnline ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                  {isOnline ? 'متصل به شبکه' : 'حالت کاملاً آفلاین'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void executeScan()}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'در حال اسکن...' : 'اسکن مجدد کل سیستم'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportReport}
              disabled={!report}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>گزارش CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Diagnostic Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Pending PWA Update Notification */}
          {swNeedRefresh && (
            <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-medium text-teal-900 dark:text-teal-200">
                نسخه به‌روزرسانی‌شده هسته آفلاین آماده اعمال است.
              </span>
              <button
                type="button"
                onClick={() => void applyPendingSwRefresh()}
                className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold whitespace-nowrap"
              >
                به‌روزرسانی و بارگذاری مجدد
              </button>
            </div>
          )}

          {/* Executive Summary Strip */}
          {report && (
            <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-100 dark:divide-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
                <div className="p-4">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">امتیاز کل سلامت سیستم</div>
                  <div
                    className={`mt-1 text-2xl font-bold font-code tabular-nums ${
                      report.overallStatus === 'critical'
                        ? 'text-rose-700 dark:text-rose-400'
                        : report.overallStatus === 'warning'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {toPersianDigits(report.overallScore)}٪
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">زیرسیستم‌های سالم</div>
                  <div className="mt-1 text-2xl font-bold font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                    {toPersianDigits(report.healthyCount)} / {toPersianDigits(report.checks.length)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">هشدارهای قابل بررسی</div>
                  <div className="mt-1 text-2xl font-bold font-code tabular-nums text-amber-700 dark:text-amber-400">
                    {toPersianDigits(report.warningCount)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">خطاهای بحرانی</div>
                  <div className="mt-1 text-2xl font-bold font-code tabular-nums text-rose-700 dark:text-rose-400">
                    {toPersianDigits(report.errorCount)}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10 text-xs text-slate-700 dark:text-slate-200 leading-relaxed flex items-start gap-2.5">
                <Cpu className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                <span>{report.smartExecutiveSummary}</span>
              </div>
            </div>
          )}

          {/* Offline Readiness & PWA Control Bar */}
          <div className="border border-slate-200 dark:border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                )}
                <span>آمادگی اجرای ۱۰۰٪ آفلاین روی این دستگاه</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                با زدن دکمه آماده‌سازی آفلاین، فایل‌های هسته در کش مرورگر ذخیره شده و آخرین نسخه کامل دفاتر در حافظه داخلی (IndexedDB) قفل می‌شود تا بدون اینترنت نیز بدون محدودیت کار کنید.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleWarmOfflineCache()}
                disabled={warmingCache}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>{warmingCache ? 'در حال ذخیره‌سازی...' : 'آماده‌سازی کامل آفلاین'}</span>
              </button>
              <PWAInstallButton compact />
            </div>
          </div>

          {/* Domain Filter Tabs */}
          {report && (
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="فیلتر زیرسیستم‌ها">
              <button
                type="button"
                role="tab"
                aria-selected={activeDomain === 'all'}
                onClick={() => setActiveDomain('all')}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap ${
                  activeDomain === 'all'
                    ? 'bg-teal-700 text-white font-semibold'
                    : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.09] font-medium'
                }`}
              >
                همه آزمون‌ها ({toPersianDigits(report.checks.length)})
              </button>
              {report.domainSummaries.map((ds) => {
                const active = activeDomain === ds.domain;
                return (
                  <button
                    key={ds.domain}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveDomain(ds.domain)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-teal-700 text-white font-semibold'
                        : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.09] font-medium'
                    }`}
                  >
                    <span>{ds.label}</span>
                    <span
                      className={`font-code text-[10.5px] ${
                        active
                          ? 'text-teal-100'
                          : ds.error > 0
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : ds.warning > 0
                              ? 'text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {toPersianDigits(ds.healthy)}/{toPersianDigits(ds.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Detailed Diagnostic Results List */}
          <div className="border border-slate-200 dark:border-white/10 rounded-xl divide-y divide-slate-100 dark:divide-white/10 overflow-hidden">
            {filteredChecks.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-white dark:bg-transparent"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {item.status === 'healthy' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : item.status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}

                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        · {HEALTH_DOMAIN_LABELS[item.domain]}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.summary}
                    </p>

                    {item.details && item.details.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-code">
                        {item.details.map((line, i) => (
                          <li key={i}>• {line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                  {item.metricValue && (
                    <span
                      className={`text-xs font-code tabular-nums font-semibold whitespace-nowrap ${
                        item.status === 'healthy'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : item.status === 'warning'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {item.metricValue}
                    </span>
                  )}

                  {item.action && (
                    <button
                      type="button"
                      onClick={() => void handleAction(item.action!)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-200 dark:border-white/10 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors whitespace-nowrap"
                    >
                      {item.action.label}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
            <span>تمامی آزمون‌ها روی داده‌های واقعی دفاتر و حافظه واقعی مرورگر اجرا می‌شوند</span>
          </span>
          <span className="font-code">میانبر سریع: Ctrl+Shift+H</span>
        </div>
      </div>
    </div>
  );
};
