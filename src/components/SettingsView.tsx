import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Cloud,
  CloudOff,
  Database,
  Download,
  HardDrive,
  Laptop,
  LogIn,
  LogOut,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import type { DualCloudSyncController } from '../hooks/useDualCloudSync';
import { RbacPermissions, RbacRoleKey } from '../types/accounting';
import { RBAC_ROLE_LABELS, RBAC_ROLE_PRESETS } from '../lib/enterpriseAccounting';
import { exportToCsv, toPersianDigits } from '../lib/format';
import { PWAInstallButton } from './PWAInstallButton';
import {
  ACCENT_THEMES,
  InvoiceAccentColor,
  InvoicePaperSize,
  InvoiceTemplateStyle,
  InvoiceUnitMode,
  PAPER_SIZE_LABELS,
  TEMPLATE_LABELS,
  UNIT_MODE_LABELS,
  useInvoiceSettings,
} from '../lib/invoiceSettings';

const PERMISSION_LABELS: { key: keyof RbacPermissions; label: string }[] = [
  { key: 'canCreateVoucher', label: 'ثبت سند حسابداری' },
  { key: 'canFinalizeVoucher', label: 'قطعی‌سازی سند' },
  { key: 'canIssueInvoice', label: 'صدور فاکتور' },
  { key: 'canEditInventory', label: 'تغییر انبار و باسکول' },
  { key: 'canManageTreasury', label: 'خزانه‌داری و چک' },
  { key: 'canManageCurrencies', label: 'نرخ ارز و تسعیر' },
  { key: 'canManageSettings', label: 'تنظیمات و کاربران' },
  { key: 'canDeleteRecords', label: 'حذف و ابطال رکورد' },
];

export const SettingsView: React.FC<{
  initialIntent?: string;
  clearIntent?: () => void;
  dualCloud?: DualCloudSyncController;
}> = ({ initialIntent, clearIntent, dualCloud }) => {
  const {
    profile,
    isCloudMode,
    user,
    deviceId,
    deviceLabel,
    setDeviceLabel,
    autoBackupOnClose,
    setAutoBackupOnClose,
    localSnapshots,
    lastLocalBackupAt,
    triggerLocalBackupNow,
    restoreFromLocalSnapshot,
    removeLocalSnapshot,
    rbacOperators,
    activeOperator,
    setActiveOperatorId,
    addRbacOperator,
    updateRbacOperator,
    deleteRbacOperator,
    auditLogs,
    isSigningIn,
    loginWithGoogle,
    logout,
    updateCompanyProfile,
    exportBackupJson,
    importBackupJson,
    showToast,
  } = useAccounting();

  const {
    settings: invSettings,
    updateSettings: updateInvSettings,
    reset: resetInvSettings,
  } = useInvoiceSettings();

  const [companyName, setCompanyName] = useState(profile.companyName);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [economicCode, setEconomicCode] = useState(profile.economicCode || '');
  const [nationalId, setNationalId] = useState(profile.nationalId || '');
  const [fiscalYear, setFiscalYear] = useState(profile.fiscalYear);
  const [currencyUnit, setCurrencyUnit] = useState(profile.currencyUnit);
  const [deviceNameInput, setDeviceNameInput] = useState(deviceLabel);
  const [supabasePairCode, setSupabasePairCode] = useState('');
  const [supabasePairInput, setSupabasePairInput] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudRef = useRef<HTMLDivElement | null>(null);
  const localBackupRef = useRef<HTMLDivElement | null>(null);
  const designerRef = useRef<HTMLDivElement | null>(null);
  const companyRef = useRef<HTMLFormElement | null>(null);
  const rbacRef = useRef<HTMLDivElement | null>(null);
  const auditLogRef = useRef<HTMLDivElement | null>(null);
  const jsonBackupRef = useRef<HTMLDivElement | null>(null);
  const pwaRef = useRef<HTMLDivElement | null>(null);

  // Holoo Apex 9.6 Smart Settings Search
  const [settingsQuery, setSettingsQuery] = useState('');
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  const settingsDirectory = useMemo(
    () => [
      {
        id: 'cloud',
        title: 'ذخیره ابری و اتصال گوگل',
        keywords: 'ابر فایربیس گوگل همگام سازی اتصال آنلاین ورود خروج firebase cloud',
        ref: cloudRef,
      },
      {
        id: 'local-backup',
        title: 'پشتیبان داخلی و همزمانی ۳ دستگاه',
        keywords: 'پشتیبان حافظه داخلی گوشی تبلت کامپیوتر بسته شدن دستگاه همزمانی تداخل local backup',
        ref: localBackupRef,
      },
      {
        id: 'designer',
        title: 'طراحی قالب فاکتور و چاپ چندواحدی',
        keywords: 'فاکتور چاپ قالب رنگ کاغذ a4 a5 لوگو بوبین کارتن مودیان طراحی invoice template',
        ref: designerRef,
      },
      {
        id: 'company',
        title: 'مشخصات حقوقی، سال مالی و واحد پول',
        keywords: 'شرکت کد اقتصادی شناسه ملی سال مالی ریال تومان واحد پول نام شرکت',
        ref: companyRef,
      },
      {
        id: 'rbac',
        title: 'کاربران و سطوح دسترسی (RBAC)',
        keywords: 'کاربر اپراتور نقش مدیر حسابدار انباردار فروشنده دسترسی مجوز rbac',
        ref: rbacRef,
      },
      {
        id: 'audit-log',
        title: 'گزارش ممیزی و تاریخچه عملیات',
        keywords: 'ممیزی لاگ تاریخچه گزارش عملیات کاربری audit log',
        ref: auditLogRef,
      },
      {
        id: 'json-backup',
        title: 'پشتیبان‌گیری JSON و بازیابی فایل',
        keywords: 'دانلود فایل json بازیابی ریستور پشتیبان کامل export import',
        ref: jsonBackupRef,
      },
      {
        id: 'pwa',
        title: 'نصب اپلیکیشن (PWA) روی موبایل و دسکتاپ',
        keywords: 'نصب اپلیکیشن pwa آفلاین موبایل ویندوز دسکتاپ',
        ref: pwaRef,
      },
    ],
    []
  );

  const matchedSettingsSections = useMemo(() => {
    const q = settingsQuery.trim().toLowerCase();
    if (!q) return settingsDirectory;
    return settingsDirectory.filter(
      (s) => s.title.toLowerCase().includes(q) || s.keywords.toLowerCase().includes(q)
    );
  }, [settingsDirectory, settingsQuery]);

  const jumpToSettingsSection = (id: string) => {
    const found = settingsDirectory.find((s) => s.id === id);
    if (!found) return;
    found.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlightedSection(id);
    setTimeout(() => {
      setHighlightedSection((curr) => (curr === id ? null : curr));
    }, 2200);
  };

  // RBAC new operator state
  const [newOpName, setNewOpName] = useState('');
  const [newOpEmail, setNewOpEmail] = useState('');
  const [newOpRole, setNewOpRole] = useState<RbacRoleKey>('accountant');
  const [auditSearch, setAuditSearch] = useState('');

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (log) =>
        log.operatorName.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.timestamp.toLowerCase().includes(q)
    );
  }, [auditLogs, auditSearch]);

  useEffect(() => {
    if (initialIntent === 'local-backup') {
      setTimeout(() => {
        localBackupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      clearIntent?.();
    } else if (initialIntent === 'invoice-designer') {
      setTimeout(() => {
        designerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      clearIntent?.();
    } else if (initialIntent === 'rbac') {
      setTimeout(() => {
        rbacRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      clearIntent?.();
    } else if (initialIntent === 'audit-log') {
      setTimeout(() => {
        auditLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      clearIntent?.();
    }
  }, [initialIntent, clearIntent]);

  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpName.trim()) {
      showToast('نام و نام خانوادگی کاربر را وارد کنید.');
      return;
    }
    await addRbacOperator({
      fullName: newOpName.trim(),
      email: newOpEmail.trim() || undefined,
      role: newOpRole,
      active: true,
      permissions: { ...RBAC_ROLE_PRESETS[newOpRole] },
    });
    setNewOpName('');
    setNewOpEmail('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateCompanyProfile({
      companyName,
      displayName,
      economicCode,
      nationalId,
      fiscalYear,
      currencyUnit,
    });
  };

  const handleDownloadBackup = () => {
    const json = exportBackupJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `holoo-apex-backup-${profile.fiscalYear}-${dateStamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('فایل پشتیبان کامل حسابداری (JSON) با موفقیت دانلود شد.');
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        importBackupJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const activeAccent = ACCENT_THEMES[invSettings.accentColor];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          تنظیمات شرکتی، طراحی قالب فاکتور، پشتیبان‌گیری و نصب اپلیکیشن
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          مدیریت اطلاعات رسمی مودیان، سفارشی‌سازی کامل فاکتورهای چندواحدی نخ، پشتیبان‌گیری JSON و همگام‌سازی ابری Firebase
        </p>
      </div>

      {/* Holoo Apex 9.6 Smart Settings Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={settingsQuery}
              onChange={(e) => setSettingsQuery(e.target.value)}
              placeholder="جستجوی هوشمند تنظیمات هلو اپکس ۹.۶ (مثلاً: چاپ فاکتور، کد اقتصادی، پشتیبان، RBAC، ریال، ابر)..."
              className="w-full pr-9 pl-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600"
            />
            {settingsQuery && (
              <button
                type="button"
                onClick={() => setSettingsQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="پاک کردن جستجو"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-code shrink-0">
            {toPersianDigits(matchedSettingsSections.length)} بخش یافت شد
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {matchedSettingsSections.length === 0 ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              تنظیمی با عبارت «{settingsQuery}» یافت نشد. کلیدواژه‌ای مانند «فاکتور»، «پشتیبان» یا «کاربر» را امتحان کنید.
            </span>
          ) : (
            matchedSettingsSections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => jumpToSettingsSection(sec.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${
                  highlightedSection === sec.id
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600'
                }`}
              >
                {sec.title}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Dual-Cloud Auto-Sync & 3-Version Rolling Backup Panel (Firebase + Supabase) */}
      <div
        ref={cloudRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-5 space-y-4 transition-all ${
          highlightedSection === 'cloud'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {isCloudMode ? (
              <Cloud className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <CloudOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {isCloudMode
                  ? `متصل به ذخیره ابری دوگانه Firebase + Supabase (${user?.email})`
                  : 'حالت پیش‌نمایش محلی — برای همگام‌سازی خودکار دوابری وارد شوید'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-5">
                {isCloudMode
                  ? 'همگام‌سازی خودکار روی هر دو ابر Firebase و Supabase فعال است. برای بهینه‌سازی فضا و هزینه، در هر دو سرویس همیشه فقط ۳ نسخه آخر پشتیبان ابری نگهداری شده و نسخه‌های قدیمی‌تر به‌طور خودکار پاکسازی می‌شوند.'
                  : 'با ورود از طریق حساب گوگل، داده‌های مالی شما به‌صورت خودکار در هر دو سرویس Firebase و Supabase با نگهداری هوشمند ۳ نسخه آخر همگام‌سازی می‌شوند.'}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            {isCloudMode ? (
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <LogOut className="w-4 h-4" />
                <span>خروج از حساب</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={loginWithGoogle}
                disabled={isSigningIn}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>{isSigningIn ? 'در حال اتصال...' : 'ورود با حساب گوگل'}</span>
              </button>
            )}
          </div>
        </div>

        {dualCloud && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Database className="w-4 h-4 text-emerald-600" />
              اتصال مستقل Supabase (بدون ورود گوگل)
            </div>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              دستگاه اصلی با حساب گوگل کد پنج‌دقیقه‌ای می‌سازد. دستگاه دیگر با آن فقط یک‌بار جفت می‌شود و پس از آن برای همگام‌سازی Supabase به ورود گوگل نیاز ندارد.
            </p>
            {user ? (
              <div className="space-y-2">
                <button type="button" disabled={pairingBusy} onClick={async () => {
                  setPairingBusy(true);
                  const result = await dualCloud.generateSupabasePairCode();
                  setSupabasePairCode(result.code || '');
                  if (!result.ok) showToast(result.error || 'ساخت کد ناموفق بود.');
                  setPairingBusy(false);
                }} className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50">
                  {pairingBusy ? 'در حال ساخت کد...' : 'ساخت کد جفت‌سازی برای دستگاه دیگر'}
                </button>
                {supabasePairCode && (
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 p-3">
                    <div className="text-[11px] text-slate-500 mb-1">کد یک‌بارمصرف — اعتبار ۵ دقیقه</div>
                    <div className="text-2xl tracking-[0.3em] font-bold font-mono text-center text-emerald-700 dark:text-emerald-400">{supabasePairCode}</div>
                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(supabasePairCode); showToast('کد جفت‌سازی کپی شد.'); }} className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 underline">کپی کد</button>
                  </div>
                )}
              </div>
            ) : dualCloud.pairedDevice ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">این دستگاه برای Supabase جفت شده است.</span>
                <button type="button" onClick={dualCloud.disconnectPairedDevice} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs">قطع اتصال این دستگاه</button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input inputMode="numeric" maxLength={8} value={supabasePairInput} onChange={(e) => setSupabasePairInput(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="کد ۸ رقمی دستگاه اصلی" className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm tracking-widest text-center" />
                <button type="button" disabled={pairingBusy || supabasePairInput.length !== 8} onClick={async () => {
                  setPairingBusy(true);
                  const result = await dualCloud.pairThisDevice(supabasePairInput);
                  if (result.ok) { setSupabasePairInput(''); setSupabasePairCode(''); }
                  else showToast(result.error || 'جفت‌سازی ناموفق بود.');
                  setPairingBusy(false);
                }} className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50">
                  {pairingBusy ? 'در حال اتصال...' : 'جفت‌سازی این دستگاه'}
                </button>
              </div>
            )}
          </div>
        )}

        {dualCloud && isCloudMode && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            {/* Firebase Rolling 3-Backup Card */}
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>پشتیبان‌های ابری Firebase Firestore</span>
                </span>
                <span className="font-code text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                  {toPersianDigits(dualCloud.firebaseBackups.length)} از {toPersianDigits(dualCloud.maxCloudBackups)} نسخه (پاکسازی خودکار)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void dualCloud.pushToFirebaseNow(false)}
                  disabled={dualCloud.isFirebaseBackingUp}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold disabled:opacity-50"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  <span>ارسال به Firebase</span>
                </button>
                <button
                  type="button"
                  onClick={() => void dualCloud.pullFromFirebaseNow()}
                  disabled={dualCloud.isFirebaseBackingUp}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold disabled:opacity-50"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>دریافت از Firebase</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {dualCloud.firebaseBackups.length === 0 ? (
                  <div className="text-[11px] text-slate-500 text-center py-3">
                    هنوز نسخه پشتیبان ابری در Firebase ثبت نشده است (ثبت خودکار فعال است).
                  </div>
                ) : (
                  dualCloud.firebaseBackups.map((bak, idx) => (
                    <div
                      key={bak.id}
                      className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-code font-semibold text-slate-800 dark:text-slate-100 truncate">
                          نسخه #{toPersianDigits(bak.revision)} · {toPersianDigits(bak.savedAtShamsi)}
                          {idx === 0 ? ' (جدیدترین)' : ''}
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-code">
                          {bak.deviceLabel} · {toPersianDigits(bak.voucherCount)} سند · {toPersianDigits(bak.invoiceCount)} فاکتور
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void dualCloud.pullFromFirebaseNow(bak.id)}
                          disabled={dualCloud.isFirebaseBackingUp}
                          className="px-2 py-1 rounded text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                        >
                          بازیابی
                        </button>
                        <button
                          type="button"
                          onClick={() => void dualCloud.removeFirebaseBackup(bak.id)}
                          title="حذف نسخه"
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Supabase Rolling 3-Backup Card */}
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>پشتیبان‌های ابری Supabase PostgreSQL</span>
                </span>
                <span className="font-code text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {toPersianDigits(dualCloud.supabaseBackups.length)} از {toPersianDigits(dualCloud.maxCloudBackups)} نسخه (پاکسازی خودکار)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void dualCloud.syncSupabaseNow(false)}
                  disabled={dualCloud.isSupabaseSyncing}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold disabled:opacity-50"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  <span>ارسال به Supabase</span>
                </button>
                <button
                  type="button"
                  onClick={() => void dualCloud.pullFromSupabase()}
                  disabled={dualCloud.isSupabaseSyncing || !dualCloud.supabaseStatus.tableReady}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold disabled:opacity-50"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>دریافت از Supabase</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {dualCloud.supabaseBackups.length === 0 ? (
                  <div className="text-[11px] text-slate-500 text-center py-3">
                    هنوز نسخه پشتیبان ابری در Supabase ثبت نشده است (سینک خودکار فعال است).
                  </div>
                ) : (
                  dualCloud.supabaseBackups.map((bak, idx) => (
                    <div
                      key={bak.id}
                      className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-code font-semibold text-slate-800 dark:text-slate-100 truncate">
                          نسخه #{toPersianDigits(bak.revision)} · {toPersianDigits(bak.savedAtShamsi)}
                          {idx === 0 ? ' (جدیدترین)' : ''}
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-code">
                          {bak.deviceLabel} · {toPersianDigits(bak.voucherCount)} سند · {toPersianDigits(bak.invoiceCount)} فاکتور
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void dualCloud.pullFromSupabase(bak.id)}
                          disabled={dualCloud.isSupabaseSyncing}
                          className="px-2 py-1 rounded text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                        >
                          بازیابی
                        </button>
                        <button
                          type="button"
                          onClick={() => void dualCloud.removeSupabaseBackup(bak.id)}
                          title="حذف نسخه"
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Device Concurrency (3 Simultaneous Devices) & Automatic Local Internal Storage Backup */}
      <div
        ref={localBackupRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-6 space-y-5 text-xs scroll-mt-20 transition-all ${
          highlightedSection === 'local-backup'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
          <div className="flex items-start gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                پشتیبان‌گیری خودکار روی حافظه داخلی دستگاه و همزمانی بدون تداخل (۳ دستگاه همزمان)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-5">
                شماره‌گذاری اتمی اسناد، تراکنش اتمی موجودی انبار و کنترل نسخه (_version) از تداخل ورود همزمان روی موبایل، تبلت و کامپیوتر جلوگیری می‌کند. علاوه بر ابر Firebase، هنگام بستن برنامه به‌صورت خودکار یک پشتیبان در حافظه داخلی این دستگاه ذخیره می‌شود.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void triggerLocalBackupNow(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg whitespace-nowrap"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>پشتیبان فوری روی حافظه دستگاه</span>
            </button>
            <button
              type="button"
              onClick={() => void triggerLocalBackupNow(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ذخیره + دانلود فایل JSON</span>
            </button>
          </div>
        </div>

        {/* Device Identity & Auto-Backup Toggle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>هویت این دستگاه در ثبت همزمان</span>
              </span>
              <span className="font-code text-[11px] text-slate-500">
                ID: {deviceId.slice(-8)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="مثلاً: کامپیوتر دفتر، تبلت انبار، گوشی مدیر..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setDeviceLabel(deviceNameInput)}
                className="px-3 py-1.5 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
              >
                ثبت نام دستگاه
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              نام دستگاه در تاریخچه ممیزی و هر ویرایش همزمان ثبت می‌شود تا تداخلی میان کاربران ۳ دستگاه رخ ندهد.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackupOnClose}
                onChange={(e) => setAutoBackupOnClose(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600"
              />
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  پشتیبان‌گیری خودکار در حافظه داخلی هنگام بستن برنامه (و پس از تغییرات)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  قبل از بسته شدن تب، خروج از اپلیکیشن موبایل/دسکتاپ یا پس از ثبت اسناد، آخرین نسخه کامل به‌طور خودکار در حافظه داخلی (IndexedDB + بافر خروجی) ذخیره می‌شود.
                </div>
              </div>
            </label>
            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/70 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <span>تعداد نسخه‌های ذخیره‌شده روی این دستگاه:</span>
              <span className="font-code font-bold text-indigo-700 dark:text-indigo-400">
                {toPersianDigits(localSnapshots.length)} نسخه ·{' '}
                {lastLocalBackupAt ? `آخرین: ${toPersianDigits(lastLocalBackupAt)}` : 'آماده'}
              </span>
            </div>
          </div>
        </div>

        {/* Local Device Snapshots Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">تاریخ و ساعت ذخیره</th>
                <th className="py-2.5 px-3">نحوه ثبت</th>
                <th className="py-2.5 px-3">دستگاه</th>
                <th className="py-2.5 px-3">آمار اطلاعات</th>
                <th className="py-2.5 px-3">حجم</th>
                <th className="py-2.5 px-3 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {localSnapshots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-5 text-center text-slate-500">
                    هنوز نسخه پشتیبانی در حافظه داخلی ثبت نشده است — روی دکمه «پشتیبان فوری» کلیک کنید یا هنگام بستن برنامه به‌صورت خودکار ذخیره می‌شود.
                  </td>
                </tr>
              ) : (
                localSnapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-code font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {toPersianDigits(snap.savedAtShamsi)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          snap.reason === 'before_close'
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : snap.reason === 'manual'
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {snap.reason === 'before_close'
                          ? 'خودکار هنگام خروج'
                          : snap.reason === 'manual'
                            ? 'ذخیره دستی'
                            : 'خودکار پس از تغییر'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {snap.deviceLabel}
                    </td>
                    <td className="py-2.5 px-3 font-code tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {toPersianDigits(snap.voucherCount)} سند ·{' '}
                      {toPersianDigits(snap.invoiceCount)} فاکتور ·{' '}
                      {toPersianDigits(snap.productCount)} کالا
                    </td>
                    <td className="py-2.5 px-3 font-code tabular-nums text-slate-500 whitespace-nowrap">
                      {toPersianDigits(snap.sizeKb)} KB
                    </td>
                    <td className="py-2.5 px-3 text-left whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void restoreFromLocalSnapshot(snap.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-md"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>بازیابی</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeLocalSnapshot(snap.id)}
                          title="حذف از حافظه دستگاه"
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Holoo Invoice Designer & Customization Studio */}
      <div
        ref={designerRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-6 space-y-5 text-xs scroll-mt-20 transition-all ${
          highlightedSection === 'designer'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                طراحی و سفارشی‌سازی قالب فاکتور، تعداد واحد و تنظیمات چاپ هلو
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تمامی تغییرات به‌صورت زنده در فرم صدور فاکتور، چاپ رسمی و متن ارسالی واتساپ و تلگرام اعمال می‌شوند.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              resetInvSettings();
              showToast('تنظیمات قالب فاکتور به حالت استاندارد بازرگانی نخ بازنشانی شد.');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازنشانی پیش‌فرض</span>
          </button>
        </div>

        {/* Template Selector */}
        <div className="space-y-2">
          <label className="block font-semibold text-slate-700 dark:text-slate-300">
            انتخاب قالب چاپ فاکتور
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(TEMPLATE_LABELS) as InvoiceTemplateStyle[]).map((tpl) => {
              const active = invSettings.template === tpl;
              return (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => updateInvSettings({ template: tpl })}
                  className={`p-3 rounded-lg border text-right transition-colors ${
                    active
                      ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    {TEMPLATE_LABELS[tpl].title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-4">
                    {TEMPLATE_LABELS[tpl].desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Multi-Unit Mode Selector */}
        <div className="space-y-2">
          <label className="block font-semibold text-slate-700 dark:text-slate-300">
            تعداد واحدهای فعال در فرم و چاپ فاکتور نخ (چندواحدی هلو)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(UNIT_MODE_LABELS) as InvoiceUnitMode[]).map((mode) => {
              const active = invSettings.unitDisplayMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateInvSettings({ unitDisplayMode: mode })}
                  className={`p-3 rounded-lg border text-right transition-colors ${
                    active
                      ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    {UNIT_MODE_LABELS[mode].title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {UNIT_MODE_LABELS[mode].desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Paper Size, Accent Color & Custom Texts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-500 mb-1">ابعاد کاغذ چاپ</label>
            <select
              value={invSettings.paperSize}
              onChange={(e) =>
                updateInvSettings({ paperSize: e.target.value as InvoicePaperSize })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {Object.entries(PAPER_SIZE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">عنوان سربرگ فاکتور</label>
            <input
              value={invSettings.customTitle}
              onChange={(e) => updateInvSettings({ customTitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">تم رنگی سربرگ و تیتر فاکتور</label>
            <div className="flex items-center gap-2 pt-1.5">
              {(Object.keys(ACCENT_THEMES) as InvoiceAccentColor[]).map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => updateInvSettings({ accentColor: col })}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] ${
                    invSettings.accentColor === col
                      ? 'border-slate-900 dark:border-white font-bold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-sm ${ACCENT_THEMES[col].swatch}`} />
                  <span className="hidden xl:inline">{ACCENT_THEMES[col].label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-500 mb-1">نشانی فروشنده و انبار در سربرگ فاکتور</label>
            <input
              value={invSettings.sellerAddress}
              onChange={(e) => updateInvSettings({ sellerAddress: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">تلفن فروشنده (درج در فاکتور)</label>
            <input
              value={invSettings.sellerPhone}
              onChange={(e) => updateInvSettings({ sellerPhone: e.target.value })}
              className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-slate-500 mb-1">
              شماره شبا و مشخصات حساب بانکی (درج در فاکتور، صورتحساب و پیام واتساپ/تلگرام)
            </label>
            <input
              value={invSettings.bankInfo}
              onChange={(e) => updateInvSettings({ bankInfo: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-slate-500 mb-1">توضیحات و شرایط پاورقی فاکتور (عرف باسکول و تحویل نخ)</label>
            <textarea
              rows={2}
              value={invSettings.footerTerms}
              onChange={(e) => updateInvSettings({ footerTerms: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        {/* Toggle Columns & Sections */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {(
            [
              ['showSku', 'نمایش ستون کد کالا'],
              ['showLotAndOrigin', 'نمایش شماره لات رنگرزی'],
              ['showDiscountColumn', 'نمایش ستون تخفیف'],
              ['showVatColumn', 'نمایش ستون مالیات ۱۰٪'],
              ['showPartyBalance', 'درج مانده قبلی و جدید مشتری'],
              ['showAmountInWords', 'مبلغ کل به حروف فارسی'],
              ['showSignatures', 'کادر امضای فروشنده/انبار/خریدار'],
              ['showTaxQrBox', 'شماره یکتای سامانه مودیان'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="inline-flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 cursor-pointer text-slate-700 dark:text-slate-300"
            >
              <input
                type="checkbox"
                checked={invSettings[key]}
                onChange={(e) => updateInvSettings({ [key]: e.target.checked })}
                className="rounded border-slate-300 text-teal-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {/* Mini Live Preview Strip */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white text-slate-900">
          <div className={`px-4 py-2.5 flex items-center justify-between text-[11px] ${activeAccent.headerBg}`}>
            <span className="font-bold">{companyName}</span>
            <span>{invSettings.customTitle}</span>
          </div>
          <div className="p-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>
              ستون‌های فعال:{' '}
              <strong>
                {[
                  invSettings.showSku && 'کد کالا',
                  'شرح نخ',
                  invSettings.unitDisplayMode !== '1_unit' && 'کارتن/عدل',
                  invSettings.unitDisplayMode === '3_units' && 'بوبین/دوک',
                  'وزن (کیلو)',
                  'فی کیلو',
                  invSettings.showDiscountColumn && 'تخفیف',
                  invSettings.showVatColumn && 'مالیات ۱۰٪',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </strong>
            </span>
            <span className="font-code text-teal-700 font-semibold">
              {PAPER_SIZE_LABELS[invSettings.paperSize]} · ذخیره خودکار فعال
            </span>
          </div>
        </div>
      </div>

      {/* Company Form */}
      <form
        ref={companyRef}
        onSubmit={handleSave}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-6 space-y-5 text-xs scroll-mt-20 transition-all ${
          highlightedSection === 'company'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <h2 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
          مشخصات حقوقی شرکت و تنظیمات پایه هلو
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-500 mb-1">نام رسمی شرکت (درج در فاکتور رسمی)</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">نام مدیر مالی / کاربر</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">شناسه ملی شرکت</label>
            <input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">کد اقتصادی (۱۲ رقمی مودیان)</label>
            <input
              value={economicCode}
              onChange={(e) => setEconomicCode(e.target.value)}
              className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">سال مالی فعال</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="1404">1404</option>
              <option value="1405">1405</option>
              <option value="1406">1406</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">واحد نمایش مبالغ</label>
            <select
              value={currencyUnit}
              onChange={(e) => setCurrencyUnit(e.target.value as 'IRR' | 'IRT')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="IRT">تومان (نمایش خوانا — ثبت دقیق ریالی)</option>
              <option value="IRR">ریال (مطابق دفاتر رسمی مالیاتی)</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
          >
            <Save className="w-4 h-4" />
            <span>ذخیره تنظیمات</span>
          </button>
        </div>
      </form>

      {/* Multi-User RBAC Roles & Operator Switcher */}
      <div
        ref={rbacRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-6 space-y-5 text-xs scroll-mt-20 transition-all ${
          highlightedSection === 'rbac'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                مدیریت کاربران، نقش‌های دسترسی (RBAC) و تعویض اپراتور فعال
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تعریف دسترسی مجزا برای مدیر مالی، حسابدار، انباردار، فروش و حسابرس — تمامی عملیات با نام اپراتور فعال ثبت ممیزی می‌شود.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <select
              value={activeOperator.id}
              onChange={(e) => {
                setActiveOperatorId(e.target.value);
                const chosen = rbacOperators.find((o) => o.id === e.target.value);
                if (chosen) showToast(`اپراتور فعال به «${chosen.fullName}» تغییر یافت.`);
              }}
              aria-label="اپراتور فعال سیستم"
              className="px-3 py-1.5 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/40 text-slate-900 dark:text-white font-semibold"
            >
              {rbacOperators
                .filter((o) => o.active)
                .map((op) => (
                  <option key={op.id} value={op.id}>
                    اپراتور فعال: {op.fullName} ({RBAC_ROLE_LABELS[op.role]})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Add New Operator Form */}
        <form
          onSubmit={handleAddOperator}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800"
        >
          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-500 mb-1">نام کامل کاربر جدید</label>
            <input
              value={newOpName}
              onChange={(e) => setNewOpName(e.target.value)}
              placeholder="مثلاً: رضا کریمی"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-500 mb-1">ایمیل یا شناسه کاربری</label>
            <input
              value={newOpEmail}
              onChange={(e) => setNewOpEmail(e.target.value)}
              placeholder="operator@company.ir"
              dir="ltr"
              className="w-full px-3 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-500 mb-1">نقش سازمانی</label>
            <select
              value={newOpRole}
              onChange={(e) => setNewOpRole(e.target.value as RbacRoleKey)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {(Object.keys(RBAC_ROLE_LABELS) as RbacRoleKey[]).map((rk) => (
                <option key={rk} value={rk}>
                  {RBAC_ROLE_LABELS[rk]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>افزودن کاربر</span>
            </button>
          </div>
        </form>

        {/* Operators & 8 Granular Permission Matrix */}
        <div className="space-y-3">
          {rbacOperators.map((op) => {
            const isActiveUser = op.id === activeOperator.id;
            return (
              <div
                key={op.id}
                className={`p-4 rounded-lg border transition-colors space-y-3 ${
                  isActiveUser
                    ? 'border-teal-500/70 bg-teal-50/30 dark:bg-teal-950/25'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {op.fullName}
                    </span>
                    <span className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">
                      {RBAC_ROLE_LABELS[op.role]}
                    </span>
                    {op.email && (
                      <span className="text-[11px] font-code text-slate-500" dir="ltr">
                        {op.email}
                      </span>
                    )}
                    {isActiveUser && (
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        · اپراتور فعال
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={op.role}
                      onChange={(e) => {
                        const nextRole = e.target.value as RbacRoleKey;
                        updateRbacOperator(op.id, {
                          role: nextRole,
                          permissions: { ...RBAC_ROLE_PRESETS[nextRole] },
                        });
                      }}
                      className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {(Object.keys(RBAC_ROLE_LABELS) as RbacRoleKey[]).map((rk) => (
                        <option key={rk} value={rk}>
                          {RBAC_ROLE_LABELS[rk]}
                        </option>
                      ))}
                    </select>
                    {!isActiveUser && (
                      <button
                        type="button"
                        onClick={() => setActiveOperatorId(op.id)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        ورود به نقش
                      </button>
                    )}
                    {rbacOperators.length > 1 && !isActiveUser && (
                      <button
                        type="button"
                        onClick={() => deleteRbacOperator(op.id)}
                        title="حذف کاربر"
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  {PERMISSION_LABELS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(op.permissions[key])}
                        onChange={(e) =>
                          updateRbacOperator(op.id, {
                            permissions: {
                              ...op.permissions,
                              [key]: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-slate-300 text-teal-700"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Audit Activity Log (گزارش ممیزی و تاریخچه عملیات کاربران) */}
      <div
        ref={auditLogRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-6 space-y-4 text-xs scroll-mt-20 transition-all ${
          highlightedSection === 'audit-log'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                گزارش ممیزی و تاریخچه عملیات کاربران ({toPersianDigits(auditLogs.length)} رویداد)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ثبت خودکار تمامی اسناد، فاکتورها، ترخیص واردات، باسکول و تغییرات نرخ ارز به تفکیک اپراتور و ساعت
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="جستجو در اپراتور، بخش یا شرح..."
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 w-52"
            />
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  `holoo-audit-log-${profile.fiscalYear}.csv`,
                  ['تاریخ و ساعت', 'اپراتور', 'نقش', 'بخش', 'عملیات', 'شرح جزئیات'],
                  filteredAuditLogs.map((l) => [
                    l.timestamp,
                    l.operatorName,
                    RBAC_ROLE_LABELS[l.operatorRole],
                    l.module,
                    l.action,
                    l.details,
                  ])
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">زمان ثبت</th>
                <th className="py-2.5 px-3">اپراتور</th>
                <th className="py-2.5 px-3">بخش</th>
                <th className="py-2.5 px-3">عملیات</th>
                <th className="py-2.5 px-3">شرح ممیزی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    رویدادی مطابق جستجو یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-code text-slate-500 whitespace-nowrap">
                      {toPersianDigits(log.timestamp)}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {log.operatorName}
                    </td>
                    <td className="py-2 px-3 text-teal-700 dark:text-teal-400 whitespace-nowrap">
                      {log.module}
                    </td>
                    <td className="py-2 px-3 font-medium whitespace-nowrap">{log.action}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup & Restore Center */}
      <div
        ref={jsonBackupRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 scroll-mt-20 transition-all ${
          highlightedSection === 'json-backup'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex items-start gap-3">
          <HardDrive className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              پشتیبان‌گیری و بازیابی اطلاعات حسابداری (JSON)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-5">
              دریافت نسخه پشتیبان کامل از کدینگ، اسناد، فاکتورها، انبار نخ، طرف‌حساب‌ها، چک‌ها، پرسنل و اموال جهت بایگانی یا انتقال به دستگاه دیگر.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>دریافت پشتیبان</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            <span>بازیابی فایل</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreBackup}
            className="hidden"
          />
        </div>
      </div>

      {/* PWA & Desktop App Installation Center */}
      <div
        ref={pwaRef}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 scroll-mt-20 transition-all ${
          highlightedSection === 'pwa'
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            نصب اپلیکیشن دسکتاپ و موبایل (PWA) برای کارکنان
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-5">
            این سامانه به‌صورت کامل از استاندارد PWA (Service Worker، کش آفلاین و میانبرهای سریع) پشتیبانی می‌کند و بدون نیاز به فروشگاه نرم‌افزاری روی ویندوز، مک، اندروید و آیفون نصب می‌شود.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Security Reminder */}
      <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
        <span>
          قوانین امنیتی Firestore با ایزوله‌سازی کامل داده‌های هر شرکت، کنترل تراز اسناد و قفل اسناد دائم پیاده‌سازی شده‌اند.
        </span>
      </div>
    </div>
  );
};
