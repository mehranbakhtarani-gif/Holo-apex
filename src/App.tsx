import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Cloud,
  CloudOff,
  Database,
  FileText,
  FolderTree,
  GitCompareArrows,
  HardDrive,
  Keyboard,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Package,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  Sparkles,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { ActiveModule } from './types/accounting';
import { useAccounting } from './context/AccountingContext';
import { useWorkspaceExtensions } from './context/WorkspaceExtensionsContext';
import { DashboardView } from './components/DashboardView';
import { InvoicesView } from './components/InvoicesView';
import { VouchersView } from './components/VouchersView';
import { AuditView } from './components/AuditView';
import { AccountsView } from './components/AccountsView';
import { PartiesView } from './components/PartiesView';
import { InventoryView } from './components/InventoryView';
import { TreasuryView } from './components/TreasuryView';
import { CorporateView } from './components/CorporateView';
import { ReportsView } from './components/ReportsView';
import { BrandStudioView } from './components/BrandStudioView';
import { SettingsView } from './components/SettingsView';
import { CurrenciesView } from './components/CurrenciesView';
import { ImportAndSubcontractView } from './components/ImportAndSubcontractView';
import { FinanceOpsView } from './components/FinanceOpsView';
import { WarehouseCrmOpsView } from './components/WarehouseCrmOpsView';
import { SmartCopilotDrawer } from './components/SmartCopilotDrawer';
import { SystemHealthDrawer } from './components/SystemHealthDrawer';
import { OfflineIndicator } from './components/PWAInstallButton';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { useDualCloudSync } from './hooks/useDualCloudSync';
import {
  CommandPaletteModal,
  QuickCalculatorModal,
  ShortcutHelpModal,
} from './components/ShortcutHelpModal';
import { formatCompactMoney, toPersianDigits } from './lib/format';
import { computeChequeAlerts, useChequeAlertPreferences } from './lib/chequeAlerts';
import { RBAC_ROLE_LABELS } from './lib/enterpriseAccounting';

interface SubMenuItem {
  key: string;
  label: string;
  module: ActiveModule;
  intent?: string;
  shortcut?: string;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconAccent: string;
  shortcut?: string;
  directModule?: ActiveModule;
  items?: SubMenuItem[];
}

const HOLOO_MENU_TREE: MenuGroup[] = [
  {
    id: 'dashboard',
    label: 'داشبورد مدیریت مالی',
    icon: LayoutDashboard,
    iconAccent: 'text-teal-600 dark:text-teal-400',
    shortcut: 'F10',
    directModule: 'dashboard',
  },
  {
    id: 'base',
    label: 'اطلاعات اول دوره و پایه',
    icon: FolderTree,
    iconAccent: 'text-sky-600 dark:text-sky-400',
    items: [
      { key: 'accounts-all', label: 'کدینگ حساب‌ها (کل و معین)', module: 'accounts' },
      { key: 'accounts-banks', label: 'معرفی صندوق، تنخواه و بانک‌ها', module: 'accounts', intent: 'banks-cash' },
      { key: 'parties', label: 'طرف‌حساب‌ها و اشخاص', module: 'parties', shortcut: 'F5' },
      { key: 'inventory-base', label: 'معرفی کالاها و انبارها', module: 'inventory', shortcut: 'F6' },
      { key: 'currencies-def', label: 'تعریف ارزها و نرخ برابری روزانه', module: 'currencies', intent: 'rates' },
      { key: 'opening-voucher', label: 'ثبت سند افتتاحیه اول دوره', module: 'vouchers', intent: 'new-opening' },
    ],
  },
  {
    id: 'accounting',
    label: 'عملیات حسابداری و حسابرسی',
    icon: BookOpen,
    iconAccent: 'text-indigo-600 dark:text-indigo-400',
    items: [
      { key: 'voucher-new', label: 'صدور سند حسابداری جدید', module: 'vouchers', intent: 'new-voucher', shortcut: 'F3' },
      { key: 'voucher-cartable', label: 'کارتابل اسناد و حواله‌ها (۹.۶)', module: 'vouchers', intent: 'cartable' },
      { key: 'voucher-list', label: 'مدیریت، اصلاح و دفتر روزنامه', module: 'vouchers' },
      { key: 'voucher-drafts', label: 'اسناد موقت (نیاز به قطعی‌سازی)', module: 'vouchers', intent: 'drafts' },
      { key: 'fin-recurring', label: 'اسناد تکرارشونده دوره‌ای', module: 'finance-ops', intent: 'recurring' },
      { key: 'audit-center', label: 'مرکز حسابرسی و کنترل اسناد', module: 'audit' },
      { key: 'year-closing', label: 'عملیات بستن حساب پایان سال', module: 'corporate', intent: 'closing' },
      { key: 'fin-rollover', label: 'انتقال دوره و افتتاح سال مالی جدید', module: 'finance-ops', intent: 'fiscal-rollover' },
    ],
  },
  {
    id: 'invoices',
    label: 'خرید، فروش و فاکتور',
    icon: FileText,
    iconAccent: 'text-emerald-600 dark:text-emerald-400',
    items: [
      { key: 'inv-sale', label: 'فاکتور فروش رسمی و مودیان', module: 'invoices', intent: 'new-sale', shortcut: 'F2' },
      { key: 'inv-purchase', label: 'فاکتور خرید کالا', module: 'invoices', intent: 'new-purchase', shortcut: 'F4' },
      { key: 'inv-reserved', label: 'صف فاکتورهای رزرو موقت (۹.۶)', module: 'invoices', intent: 'reserved' },
      { key: 'crm-installments', label: 'فروش اقساطی و تخفیف پلکانی', module: 'warehouse-crm', intent: 'installments' },
      { key: 'inv-proforma', label: 'صدور و تبدیل پیش‌فاکتور', module: 'invoices', intent: 'new-proforma' },
      { key: 'inv-sale-ret', label: 'فاکتور برگشت از فروش', module: 'invoices', intent: 'new-sale-return' },
      { key: 'inv-pur-ret', label: 'فاکتور برگشت از خرید', module: 'invoices', intent: 'new-purchase-return' },
      { key: 'inv-waste', label: 'ثبت فاکتور ضایعات انبار', module: 'invoices', intent: 'new-waste' },
      { key: 'inv-list', label: 'آرشیو و مدیریت فاکتورها', module: 'invoices' },
      { key: 'inv-designer', label: 'طراحی و سفارشی‌سازی قالب فاکتور', module: 'settings', intent: 'invoice-designer' },
    ],
  },
  {
    id: 'commercial',
    label: 'بازرگانی واردات، باسکول و رنگرزی',
    icon: Ship,
    iconAccent: 'text-cyan-600 dark:text-cyan-400',
    items: [
      { key: 'comm-imports', label: 'پرونده واردات نخ و قیمت تمام‌شده', module: 'commercial', intent: 'imports' },
      { key: 'comm-orders', label: 'سفارش فروش، حواله باسکول و بارکد', module: 'commercial', intent: 'orders' },
      { key: 'comm-subcontract', label: 'پیمانکاری رنگرزی و بافندگی (کارمزدی)', module: 'commercial', intent: 'subcontract' },
    ],
  },
  {
    id: 'warehouse',
    label: 'انبارداری و کالا',
    icon: Package,
    iconAccent: 'text-orange-600 dark:text-orange-400',
    items: [
      { key: 'inv-products', label: 'فهرست کالاها و موجودی انبار', module: 'inventory' },
      { key: 'wh-dyelots', label: 'ردیابی شماره لات و شید رنگ', module: 'warehouse-crm', intent: 'dye-lots' },
      { key: 'wh-slips', label: 'رسید/حواله مستقل و کالای امانی', module: 'warehouse-crm', intent: 'slips' },
      { key: 'wh-bom', label: 'فرمول تولید (BOM) و بهای تمام‌شده', module: 'warehouse-crm', intent: 'bom' },
      { key: 'inv-bulk-import', label: 'ورود گروهی کالا از اکسل / CSV', module: 'inventory', intent: 'bulk-import' },
      { key: 'inv-barcode-print', label: 'طراحی و چاپ لیبل بارکد کالا', module: 'inventory', intent: 'barcode-print' },
      { key: 'inv-kardex', label: 'کاردکس ریالی (میانگین موزون هلو)', module: 'inventory', intent: 'kardex' },
      { key: 'inv-stocktaking', label: 'انبارگردانی گروهی و تعدیل', module: 'inventory', intent: 'stocktaking' },
      { key: 'inv-bulk-price', label: 'تغییر گروهی قیمت کالاها', module: 'inventory', intent: 'bulk-price' },
      { key: 'inv-transfer', label: 'حواله انتقال بین انبارها', module: 'inventory', intent: 'transfer' },
    ],
  },
  {
    id: 'treasury',
    label: 'خزانه‌داری، چک و امور ارزی',
    icon: Landmark,
    iconAccent: 'text-amber-600 dark:text-amber-400',
    items: [
      { key: 'tr-cheques', label: 'مدیریت چک صیادی و گردش چک', module: 'treasury', intent: 'cheques', shortcut: 'F7' },
      { key: 'tr-cheque-print', label: 'چاپ کالیبره برگه چک صیادی (میلی‌متر)', module: 'treasury', intent: 'cheque-print' },
      { key: 'tr-reconciliation', label: 'مغایرت‌گیری خودکار بانکی (CSV)', module: 'treasury', intent: 'reconciliation' },
      { key: 'tr-quick', label: 'دریافت و پرداخت سریع', module: 'treasury', intent: 'quick' },
      { key: 'fin-petty', label: 'مدیریت تنخواه‌گردان و اسکن قبض', module: 'finance-ops', intent: 'petty-cash' },
      { key: 'fin-loans', label: 'تسهیلات و وام‌های بانکی', module: 'finance-ops', intent: 'loans' },
      { key: 'tr-transfer', label: 'انتقال وجه بین صندوق و بانک', module: 'treasury', intent: 'transfer' },
      { key: 'tr-rasgiri', label: 'ماشین‌حساب راس‌گیری چک', module: 'treasury', intent: 'rasgiri' },
      { key: 'tr-fx-rates', label: 'تابلوی نرخ روز ارز و مبدل ارزی', module: 'currencies', intent: 'converter' },
      { key: 'tr-fx-reval', label: 'تسعیر ارز پایان دوره و معین دو ستونه', module: 'currencies', intent: 'revaluation' },
    ],
  },
  {
    id: 'corporate',
    label: 'امور شرکتی (F8)',
    icon: Briefcase,
    iconAccent: 'text-violet-600 dark:text-violet-400',
    items: [
      { key: 'corp-payroll', label: 'حقوق و دستمزد و فیش حقوقی', module: 'corporate', intent: 'payroll' },
      { key: 'corp-assets', label: 'اموال، دارایی ثابت و استهلاک', module: 'corporate', intent: 'assets' },
      { key: 'corp-cc', label: 'مراکز هزینه و سود پروژه‌ها', module: 'corporate', intent: 'costcenters' },
    ],
  },
  {
    id: 'reports',
    label: 'گزارش‌ها و دفاتر قانونی (F9)',
    icon: BarChart3,
    iconAccent: 'text-fuchsia-600 dark:text-fuchsia-400',
    items: [
      { key: 'rep-trial', label: 'تراز آزمایشی ۲/۴/۶/۸ ستونی', module: 'reports', intent: 'trial' },
      { key: 'rep-moroor', label: 'مرور حساب‌ها (دریل‌داون)', module: 'reports', intent: 'moroor' },
      { key: 'rep-abc', label: 'تحلیل هوشمند ABC کالا و مشتری', module: 'reports', intent: 'abc' },
      { key: 'rep-pnl', label: 'صورت سود و زیان جامع', module: 'reports', intent: 'pnl' },
      { key: 'rep-balance', label: 'ترازنامه استاندارد', module: 'reports', intent: 'balance' },
      { key: 'rep-ledger', label: 'دفتر کل و معین (دریل‌داون سند)', module: 'reports', intent: 'ledger' },
      { key: 'rep-party', label: 'صورتحساب تفصیلی طرف‌حساب', module: 'reports', intent: 'party-ledger' },
      { key: 'rep-aging', label: 'گزارش سنی مطالبات (۰ تا +۹۰ روز)', module: 'reports', intent: 'aging' },
      { key: 'rep-commissions', label: 'پورسانت واسطه‌ها و بازاریابان', module: 'reports', intent: 'commissions' },
      { key: 'rep-vat', label: 'گزارش ارزش افزوده مودیان', module: 'reports', intent: 'vat' },
      { key: 'rep-169', label: 'گزارش معاملات فصلی (ماده ۱۶۹)', module: 'reports', intent: 'seasonal-169' },
      { key: 'rep-statutory', label: 'خروجی بیمه DSK / مالیات TTMS / مودیان', module: 'reports', intent: 'statutory' },
      { key: 'rep-prod-profit', label: 'سود ناخالص کالا و فاکتور', module: 'reports', intent: 'product-profit' },
    ],
  },
  {
    id: 'tools',
    label: 'ابزارها، کاربران و تنظیمات',
    icon: Settings,
    iconAccent: 'text-rose-600 dark:text-rose-400',
    items: [
      { key: 'tool-local-backup', label: 'پشتیبان داخلی و همزمانی ۳ دستگاه', module: 'settings', intent: 'local-backup' },
      { key: 'tool-rbac', label: 'کاربران و سطوح دسترسی (RBAC)', module: 'settings', intent: 'rbac' },
      { key: 'tool-audit-log', label: 'گزارش ممیزی و تاریخچه عملیات', module: 'settings', intent: 'audit-log' },
      { key: 'tool-studio', label: 'استودیو اسناد و کاتالوگ', module: 'studio' },
      { key: 'tool-settings', label: 'تنظیمات شرکتی، قالب فاکتور و PWA', module: 'settings' },
    ],
  },
];

const ALL_MODULES: ActiveModule[] = [
  'dashboard',
  'invoices',
  'vouchers',
  'audit',
  'accounts',
  'parties',
  'inventory',
  'treasury',
  'currencies',
  'commercial',
  'corporate',
  'finance-ops',
  'warehouse-crm',
  'reports',
  'studio',
  'settings',
];

function findGroupIdForModule(mod: ActiveModule, intent?: string): string {
  for (const g of HOLOO_MENU_TREE) {
    if (g.directModule === mod) return g.id;
    if (g.items?.some((it) => it.module === mod && (!intent || it.intent === intent))) {
      return g.id;
    }
  }
  for (const g of HOLOO_MENU_TREE) {
    if (g.items?.some((it) => it.module === mod)) return g.id;
  }
  return 'dashboard';
}

function getBreadcrumbLabel(mod: ActiveModule, subKey: string | null): string {
  if (mod === 'dashboard') return 'داشبورد مدیریت مالی';
  for (const g of HOLOO_MENU_TREE) {
    if (g.items) {
      const exact = subKey ? g.items.find((it) => it.key === subKey) : undefined;
      if (exact) return `${g.label} / ${exact.label}`;
    }
  }
  for (const g of HOLOO_MENU_TREE) {
    const match = g.items?.find((it) => it.module === mod);
    if (match) return `${g.label} / ${match.label}`;
  }
  return 'هلو شرکتی Apex';
}

export default function App() {
  const {
    user,
    profile,
    accounts,
    parties,
    cheques,
    trialBalance,
    balanceSheet,
    auditReport,
    activeOperator,
    isCloudMode,
    isSyncing,
    isSigningIn,
    deviceId,
    deviceLabel,
    localSnapshots,
    lastLocalBackupAt,
    triggerLocalBackupNow,
    toast,
    loginWithGoogle,
    logout,
    setCurrencyUnit,
  } = useAccounting();

  const { onlineDevices, otherOnlineDevices, setPresenceModule } =
    useWorkspaceExtensions();

  const isOnline = useOnlineStatus();
  const dualCloud = useDualCloudSync();
  const {
    supabaseStatus,
    supabaseBackups,
    conflictPolicy,
    setConflictPolicy,
    pendingQueueCount,
    lastSupabaseRevision,
    lastSupabaseSyncAt,
    isSupabaseSyncing,
    lastConflictNote,
    syncSupabaseNow,
    pullFromSupabase,
    refreshSupabaseStatus,
    firebaseBackups,
    isFirebaseBackingUp,
    lastFirebaseBackupAt,
    lastFirebaseRevision,
    pushToFirebaseNow,
    pullFromFirebaseNow,
    refreshFirebaseBackups,
    maxCloudBackups,
  } = dualCloud;

  const { prefs: chequeAlertPrefs } = useChequeAlertPreferences();

  const chequeAlertSummary = useMemo(
    () =>
      computeChequeAlerts({
        cheques,
        accounts,
        trialBalance,
        parties,
        leadDays: chequeAlertPrefs.leadDays,
        snoozedMap: chequeAlertPrefs.snoozedMap,
      }),
    [cheques, accounts, trialBalance, parties, chequeAlertPrefs.leadDays, chequeAlertPrefs.snoozedMap]
  );

  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard');
  const [moduleIntent, setModuleIntent] = useState<string | undefined>(undefined);
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    base: true,
    accounting: true,
    invoices: true,
    commercial: true,
    warehouse: false,
    treasury: false,
    corporate: false,
    reports: false,
    tools: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [showHealthDrawer, setShowHealthDrawer] = useState(false);
  const [showChequePopover, setShowChequePopover] = useState(false);
  const [showCloudPopover, setShowCloudPopover] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const systemHealthHasCritical = auditReport.errorCount > 0 || !balanceSheet.isBalanced;
  const systemHealthHasWarning = auditReport.warningCount > 0 || !isOnline;

  // Sync Tailwind v4 dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    setPresenceModule(activeModule);
  }, [activeModule, setPresenceModule]);

  const navigate = useCallback((mod: ActiveModule, intent?: string, subKey?: string) => {
    setActiveModule(mod);
    setModuleIntent(intent);
    setActiveSubKey(subKey ?? null);
    const gid = findGroupIdForModule(mod, intent);
    if (gid !== 'dashboard') {
      setOpenGroups((prev) => ({ ...prev, [gid]: true }));
    }
    setMobileMenuOpen(false);
  }, []);

  // Read PWA deep-link shortcut URL params on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') as ActiveModule | null;
    const action = params.get('action') || undefined;
    if (view && ALL_MODULES.includes(view)) {
      navigate(view, action);
    }
  }, [navigate]);

  // Global Holoo Sherkati Apex Keyboard Shortcuts (F1 - F10, Ctrl+K, Ctrl+J, Alt+C, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowCommandPalette(false);
        setShowCopilot(false);
        setShowHealthDrawer(false);
        setShowChequePopover(false);
        setShowCloudPopover(false);
        setMobileMenuOpen(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setShowCopilot((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShowHealthDrawer((prev) => !prev);
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setShowCalculator((prev) => !prev);
        return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          setShowShortcuts((prev) => !prev);
          break;
        case 'F2':
          e.preventDefault();
          navigate('invoices', 'new-sale', 'inv-sale');
          break;
        case 'F3':
          e.preventDefault();
          navigate('vouchers', 'new-voucher', 'voucher-new');
          break;
        case 'F4':
          e.preventDefault();
          navigate('invoices', 'new-purchase', 'inv-purchase');
          break;
        case 'F5':
          e.preventDefault();
          navigate('parties', undefined, 'parties');
          break;
        case 'F6':
          e.preventDefault();
          navigate('inventory', undefined, 'inventory-base');
          break;
        case 'F7':
          e.preventDefault();
          navigate('treasury', 'cheques', 'tr-cheques');
          break;
        case 'F8':
          e.preventDefault();
          navigate('corporate', 'payroll', 'corp-payroll');
          break;
        case 'F9':
          e.preventDefault();
          navigate('reports', 'trial', 'rep-trial');
          break;
        case 'F10':
          e.preventDefault();
          navigate('dashboard');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderMenuTree = () => (
    <div className="space-y-1">
      {HOLOO_MENU_TREE.map((group) => {
        const Icon = group.icon;
        if (group.directModule) {
          const isActive = activeModule === group.directModule;
          return (
            <button
              key={group.id}
              onClick={() => navigate(group.directModule!)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${group.iconAccent}`} />
                <span className="truncate">{group.label}</span>
              </span>
              {group.shortcut && (
                <span className="font-code text-[10px] text-slate-400 shrink-0">
                  {group.shortcut}
                </span>
              )}
            </button>
          );
        }

        const isOpen = !!openGroups[group.id];
        const groupHasActive = group.items?.some((it) =>
          activeSubKey ? it.key === activeSubKey : it.module === activeModule
        );

        return (
          <div key={group.id} className="space-y-0.5">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                groupHasActive
                  ? 'text-teal-900 dark:text-teal-200 bg-slate-100/80 dark:bg-slate-800/60'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${group.iconAccent}`} />
                <span className="truncate">{group.label}</span>
              </span>
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>

            {isOpen && group.items && (
              <div className="pr-5 pl-1 space-y-0.5 border-r border-slate-200 dark:border-slate-800 mr-4">
                {group.items.map((sub) => {
                  const isSubActive = activeSubKey
                    ? activeSubKey === sub.key
                    : activeModule === sub.module && !sub.intent;
                  const showAuditAlert =
                    sub.module === 'audit' &&
                    (auditReport.errorCount > 0 || auditReport.warningCount > 0);
                  const showChequeAlert =
                    sub.key === 'tr-cheques' && chequeAlertSummary.urgentAlerts.length > 0;
                  return (
                    <button
                      key={sub.key}
                      onClick={() => navigate(sub.module, sub.intent, sub.key)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors text-right ${
                        isSubActive
                          ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="truncate">{sub.label}</span>
                      {showAuditAlert ? (
                        <span
                          className={`font-code text-[10px] font-bold shrink-0 ${
                            auditReport.errorCount > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {toPersianDigits(
                            auditReport.errorCount > 0
                              ? auditReport.errorCount
                              : auditReport.warningCount
                          )}
                        </span>
                      ) : showChequeAlert ? (
                        <span
                          className={`font-code text-[10px] font-bold shrink-0 ${
                            chequeAlertSummary.overdueCount > 0 ||
                            chequeAlertSummary.dueTodayCount > 0 ||
                            chequeAlertSummary.bouncedCount > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {toPersianDigits(chequeAlertSummary.urgentAlerts.length)}
                        </span>
                      ) : sub.shortcut ? (
                        <span className="font-code text-[10px] text-slate-400 shrink-0">
                          {sub.shortcut}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const breadcrumbText = getBreadcrumbLabel(activeModule, activeSubKey);

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 dark:bg-[radial-gradient(ellipse_at_top_right,rgba(15,118,110,0.14),transparent_48%),radial-gradient(ellipse_at_bottom_left,rgba(14,116,144,0.09),transparent_46%)] text-slate-900 dark:text-slate-100">
      <a
        href="#main-accounting-viewport"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-teal-700 focus:text-white focus:text-xs focus:font-semibold"
      >
        پرش به محتوای اصلی
      </a>
      {/* Desktop Right-Hand RTL Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-68 shrink-0 bg-white dark:bg-slate-900/70 dark:backdrop-blur-xl dark:backdrop-saturate-150 border-l border-slate-200 dark:border-white/10 dark:shadow-[inset_1px_0_0_rgba(255,255,255,0.04)] sticky top-0 h-screen no-print">
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
          <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            هلو شرکتی Apex 9.6
          </span>
          <span className="font-code text-[11px] font-semibold text-teal-700 dark:text-teal-400">
            سال {toPersianDigits(profile.fiscalYear)}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="منوی اصلی هلو شرکتی آپکس">
          {renderMenuTree()}
        </nav>

        {/* Compact Sidebar Utilities & User Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-white/10 space-y-2.5">
          <button
            type="button"
            onClick={() => setShowHealthDrawer(true)}
            title="پایش هوشمند سلامت هسته، حسابداری، حسابرسی و آمادگی آفلاین (Ctrl+Shift+H)"
            className={`w-full inline-flex items-center justify-between gap-2 py-1.5 px-2.5 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              systemHealthHasCritical
                ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                : systemHealthHasWarning
                  ? 'border-amber-300/80 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-teal-800 dark:text-teal-300 hover:bg-teal-50/70 dark:hover:bg-white/[0.08]'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>سلامت سیستم و آفلاین</span>
            </span>
            <span className="font-code text-[10px]">
              {systemHealthHasCritical ? 'بررسی فوری' : isOnline ? 'سالم' : 'آفلاین'}
            </span>
          </button>

          <div className="flex items-center justify-between gap-1.5">
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors whitespace-nowrap"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>میانبرها F1</span>
            </button>
            <button
              onClick={() => setShowCalculator((p) => !p)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors whitespace-nowrap"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>ماشین‌حساب</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => navigate('settings', 'rbac', 'tool-rbac')}
              title="تغییر اپراتور فعال و سطوح دسترسی RBAC"
              className="flex items-center gap-2.5 min-w-0 text-right hover:opacity-90 transition-opacity"
            >
              {!avatarError ? (
                <img
                  src="/src/assets/images/avatar_finance_director_1795265732394.jpg"
                  alt={activeOperator.fullName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {activeOperator.fullName.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {activeOperator.fullName}
                </div>
                <div className="text-[10.5px] text-teal-700 dark:text-teal-400 truncate">
                  {RBAC_ROLE_LABELS[activeOperator.role].split('(')[0].trim()} ·{' '}
                  {isSyncing ? 'در حال همگام‌سازی' : isCloudMode ? 'ابری' : 'محلی'}
                </div>
              </div>
            </button>
            {!isCloudMode && (
              <button
                onClick={loginWithGoogle}
                disabled={isSigningIn}
                title="ورود با حساب گوگل برای ذخیره ابری"
                className="p-1.5 rounded-lg text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 disabled:opacity-50 shrink-0"
              >
                <LogIn className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-72 max-w-[84vw] bg-white dark:bg-slate-900/80 dark:backdrop-blur-xl dark:backdrop-saturate-150 h-full border-l border-slate-200 dark:border-white/10 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
              <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                هلو شرکتی Apex
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="بستن منو"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">{renderMenuTree()}</nav>
          </div>
          <div
            className="flex-1 bg-slate-950/50 dark:backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean 3-Zone Top Bar (<= 56px height) */}
        <header className="h-14 sticky top-0 z-30 bg-white/95 dark:bg-slate-900/70 backdrop-blur-md dark:backdrop-blur-xl dark:backdrop-saturate-150 border-b border-slate-200 dark:border-white/10 dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_8px_24px_-12px_rgba(2,6,23,0.65)] px-4 lg:px-6 flex items-center justify-between gap-4 no-print">
          {/* Zone 1: Mobile Menu + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="منو"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline font-medium text-slate-700 dark:text-slate-300">
                هلو Apex
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {breadcrumbText}
              </span>
            </div>
          </div>

          {/* Zone 2: Quick Command Search */}
          <button
            onClick={() => setShowCommandPalette(true)}
            className="hidden md:flex items-center justify-between gap-4 w-72 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-300 bg-slate-100/80 dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.09] rounded-lg border border-slate-200/80 dark:border-white/10 transition-colors"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span>دنبال سند، چک، کالا یا حسابی؟...</span>
            </span>
            <kbd className="font-code text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-white/10">
              Ctrl+K
            </kbd>
          </button>

          {/* Zone 3: Primary Action & Compact Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Urgent Cheque Alert Bell & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowChequePopover((p) => !p)}
                title="اعلان‌های هوشمند سررسید چک (از ۳ روز قبل)"
                aria-label="اعلان‌های هوشمند سررسید چک"
                aria-expanded={showChequePopover}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  chequeAlertSummary.urgentAlerts.length > 0
                    ? chequeAlertSummary.overdueCount > 0 ||
                      chequeAlertSummary.dueTodayCount > 0 ||
                      chequeAlertSummary.bouncedCount > 0
                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/35 text-amber-800 dark:text-amber-300'
                    : 'border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
                }`}
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                {chequeAlertSummary.urgentAlerts.length > 0 && (
                  <span className="font-code tabular-nums font-bold">
                    {toPersianDigits(chequeAlertSummary.urgentAlerts.length)}
                  </span>
                )}
              </button>

              {showChequePopover && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowChequePopover(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute left-0 mt-2 w-88 max-w-[92vw] z-50 bg-white dark:bg-slate-900/90 dark:backdrop-blur-xl border border-slate-200 dark:border-white/12 rounded-xl shadow-lg overflow-hidden text-right">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          اعلان‌های سررسید چک ({toPersianDigits(chequeAlertSummary.leadDays)} روز آینده)
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-code tabular-nums">
                          امروز {toPersianDigits(chequeAlertSummary.todayShamsi)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowChequePopover(false)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        aria-label="بستن اعلان‌ها"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {chequeAlertSummary.urgentAlerts.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        چک ضروری در بازه {toPersianDigits(chequeAlertSummary.leadDays)} روز آینده وجود ندارد.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {chequeAlertSummary.urgentAlerts.map((al) => {
                          const ch = al.cheque;
                          const isCritical =
                            al.severity === 'bounced' ||
                            al.severity === 'overdue' ||
                            al.severity === 'today';
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() => {
                                setShowChequePopover(false);
                                navigate('treasury', `cheque:${ch.id}`, 'tr-cheques');
                              }}
                              className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span
                                  className={
                                    isCritical
                                      ? 'font-bold text-rose-700 dark:text-rose-400'
                                      : 'font-semibold text-amber-700 dark:text-amber-400'
                                  }
                                >
                                  {al.urgencyLabel}
                                </span>
                                <span className="font-code tabular-nums font-bold text-slate-900 dark:text-white">
                                  {formatCompactMoney(ch.amount, profile.currencyUnit)}
                                </span>
                              </div>
                              <div className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate mt-1">
                                {ch.partyName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                                <span
                                  className={
                                    ch.direction === 'receivable'
                                      ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                      : 'text-rose-700 dark:text-rose-400 font-medium'
                                  }
                                >
                                  {ch.direction === 'receivable' ? 'دریافتی' : 'پرداختی'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-code tabular-nums">
                                  سررسید {toPersianDigits(ch.dueDate)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{ch.bankName}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setShowChequePopover(false);
                          navigate('dashboard');
                        }}
                        className="font-medium text-slate-600 dark:text-slate-300 hover:underline"
                      >
                        مرکز هشدار داشبورد
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowChequePopover(false);
                          navigate('treasury', 'cheques', 'tr-cheques');
                        }}
                        className="font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        مدیریت چک‌ها
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCopilot(true)}
              title="دستیار هوشمند مالی هلو اپکس ۹.۶ (Ctrl+J)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">دستیار هوشمند</span>
            </button>

            <button
              type="button"
              onClick={() => setShowHealthDrawer(true)}
              title="بررسی هوشمند سلامت هسته، حسابداری، حسابرسی و وضعیت آفلاین (Ctrl+Shift+H)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                systemHealthHasCritical
                  ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                  : 'border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-emerald-700 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
              }`}
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">سلامت سیستم</span>
            </button>

            <button
              onClick={() => navigate('audit', undefined, 'audit-center')}
              title="امتیاز سلامت حسابرسی دفاتر"
              className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors whitespace-nowrap ${
                auditReport.errorCount > 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-code">حسابرسی {toPersianDigits(auditReport.score)}٪</span>
            </button>

            <button
              onClick={() => setCurrencyUnit(profile.currencyUnit === 'IRT' ? 'IRR' : 'IRT')}
              title="تغییر واحد نمایش پول بین تومان و ریال"
              className="hidden sm:inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors whitespace-nowrap"
            >
              {profile.currencyUnit === 'IRT' ? 'تومان' : 'ریال'}
            </button>

            <button
              onClick={() => setDarkMode((d) => !d)}
              title={darkMode ? 'حالت روشن' : 'حالت تاریک'}
              className="p-2 rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/[0.03] text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors"
              aria-label="تغییر پوسته"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative">
              {(() => {
                const anySyncing = isSyncing || isFirebaseBackingUp || isSupabaseSyncing;
                const sbReady =
                  supabaseStatus.configured &&
                  supabaseStatus.connected &&
                  supabaseStatus.tableReady;
                const sbNeedsSql = supabaseStatus.configured && !supabaseStatus.tableReady;

                const fbShortLabel = !isOnline
                  ? 'آفلاین'
                  : isSyncing || isFirebaseBackingUp
                    ? 'سینک...'
                    : isCloudMode
                      ? 'متصل'
                      : 'محلی';

                const sbShortLabel = !isOnline
                  ? 'آفلاین'
                  : isSupabaseSyncing
                    ? 'سینک...'
                    : sbReady
                      ? 'متصل'
                      : sbNeedsSql
                        ? 'نیاز به SQL'
                        : 'در انتظار';

                const fbDotClass = !isOnline
                  ? 'bg-amber-500'
                  : isSyncing
                    ? 'bg-sky-500 animate-pulse'
                    : isCloudMode
                      ? 'bg-emerald-500'
                      : 'bg-slate-400';

                const sbDotClass = !isOnline
                  ? 'bg-amber-500'
                  : isSupabaseSyncing
                    ? 'bg-sky-500 animate-pulse'
                    : sbReady
                      ? 'bg-emerald-500'
                      : sbNeedsSql
                        ? 'bg-amber-500'
                        : 'bg-slate-400';

                const btnStyleClass = !isOnline
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                  : anySyncing
                    ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
                    : isCloudMode && sbReady
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/60'
                      : isCloudMode
                        ? 'border-teal-300 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 hover:bg-teal-100/80 dark:hover:bg-teal-950/60'
                        : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.08]';

                return (
                  <button
                    type="button"
                    onClick={() => {
                      setShowChequePopover(false);
                      setShowCloudPopover((p) => !p);
                    }}
                    title="وضعیت همزمان ذخیره ابری دوگانه (Firebase + Supabase) و صف آفلاین-اول"
                    aria-expanded={showCloudPopover}
                    className={`inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${btnStyleClass}`}
                  >
                    {!isOnline ? (
                      <CloudOff className="w-3.5 h-3.5 shrink-0" />
                    ) : anySyncing ? (
                      <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5 shrink-0" />
                    )}

                    {/* Firebase status inline */}
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fbDotClass}`} />
                      <span className="font-code text-[10.5px] opacity-80">FB</span>
                      <span className="hidden md:inline">{fbShortLabel}</span>
                    </span>

                    <span className="h-3 w-px bg-current opacity-20" aria-hidden="true" />

                    {/* Supabase status inline */}
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sbDotClass}`} />
                      <span className="font-code text-[10.5px] opacity-80">SB</span>
                      <span className="hidden md:inline">{sbShortLabel}</span>
                    </span>

                    {pendingQueueCount > 0 && (
                      <span className="font-code text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        · {toPersianDigits(pendingQueueCount)} صف
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3 opacity-60 shrink-0 hidden sm:block" />
                  </button>
                );
              })()}

              {showCloudPopover && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowCloudPopover(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute left-0 mt-2 w-[368px] max-w-[94vw] z-50 bg-white dark:bg-slate-900/95 dark:backdrop-blur-xl border border-slate-200 dark:border-white/12 rounded-xl shadow-xl overflow-hidden text-right">
                    {/* Popover Header */}
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isOnline ? (
                          <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            همگام‌سازی ابری دوگانه (Firebase + Supabase)
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-code">
                            {isCloudMode
                              ? user?.email || profile.email
                              : `حالت آفلاین-اول روی ${deviceLabel}`}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCloudPopover(false)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        aria-label="بستن"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-3.5 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
                      {/* 1. Firebase Cloud Block (Auto-Sync + Symmetrical Push/Pull + Last 3 Backups) */}
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                            <Cloud className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            <span>Firebase Firestore</span>
                            <span className="text-[10px] font-normal text-slate-500">(خودکار · {toPersianDigits(maxCloudBackups)} نسخه)</span>
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              !isOnline
                                ? 'text-amber-700 dark:text-amber-400'
                                : isSyncing || isFirebaseBackingUp
                                  ? 'text-sky-700 dark:text-sky-400'
                                  : isCloudMode
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {!isOnline
                              ? 'آفلاین · کش IndexedDB'
                              : isSyncing || isFirebaseBackingUp
                                ? 'در حال تبادل...'
                                : isCloudMode
                                  ? 'متصل و خودکار'
                                  : 'حالت محلی'}
                          </span>
                        </div>

                        {!isCloudMode ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowCloudPopover(false);
                              void loginWithGoogle();
                            }}
                            disabled={isSigningIn}
                            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-70 text-white text-[11px] font-semibold transition-colors"
                          >
                            {isSigningIn ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogIn className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isSigningIn
                                ? 'در حال ورود ابری...'
                                : 'ورود با گوگل و فعال‌سازی همگام‌سازی ابری'}
                            </span>
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                              <span>
                                نسخه بکاپ:{' '}
                                <strong className="font-code text-slate-800 dark:text-slate-200">
                                  #{toPersianDigits(lastFirebaseRevision)}
                                </strong>
                                <span className="mr-1.5 text-[10px] text-teal-700 dark:text-teal-400 font-code">
                                  ({toPersianDigits(firebaseBackups.length)}/{toPersianDigits(maxCloudBackups)} نسخه)
                                </span>
                              </span>
                              <span className="font-code text-[10.5px]">
                                {lastFirebaseBackupAt
                                  ? toPersianDigits(lastFirebaseBackupAt)
                                  : 'آماده ثبت خودکار'}
                              </span>
                            </div>

                            {/* Symmetrical Push / Pull / Refresh for Firebase */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void pushToFirebaseNow(false)}
                                disabled={isFirebaseBackingUp || !isOnline}
                                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors"
                              >
                                <ArrowUpFromLine className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                                <span>ارسال به Firebase</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void pullFromFirebaseNow()}
                                disabled={isFirebaseBackingUp || !isOnline}
                                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors"
                              >
                                <ArrowDownToLine className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                                <span>دریافت از Firebase</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void refreshFirebaseBackups(true)}
                                title="بروزرسانی و پاکسازی نسخه‌های قدیمی Firebase"
                                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 ${isFirebaseBackingUp ? 'animate-spin' : ''}`}
                                />
                              </button>
                            </div>

                            {firebaseBackups.length > 0 && (
                              <div className="space-y-1 pt-0.5">
                                {firebaseBackups.map((bak, idx) => (
                                  <div
                                    key={bak.id}
                                    className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[10.5px]"
                                  >
                                    <span className="truncate text-slate-700 dark:text-slate-300 font-code">
                                      #{toPersianDigits(bak.revision)} · {toPersianDigits(bak.savedAtShamsi)}
                                      {idx === 0 ? ' (آخرین)' : ''}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void pullFromFirebaseNow(bak.id)}
                                      disabled={isFirebaseBackingUp}
                                      className="text-teal-700 dark:text-teal-400 font-semibold hover:underline shrink-0"
                                    >
                                      بازیابی
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-slate-200/60 dark:border-slate-800">
                              <span className="inline-flex items-center gap-1">
                                <Users className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                                <span>دستگاه‌های آنلاین:</span>
                              </span>
                              <span className="font-code font-bold text-teal-700 dark:text-teal-400">
                                {toPersianDigits(Math.max(1, onlineDevices.length))} دستگاه
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Supabase PostgreSQL Block (Auto-Sync + Symmetrical Push/Pull + Last 3 Backups) */}
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                            <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Supabase PostgreSQL</span>
                            <span className="text-[10px] font-normal text-slate-500">(خودکار · {toPersianDigits(maxCloudBackups)} نسخه)</span>
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              !isOnline
                                ? 'text-amber-700 dark:text-amber-400'
                                : isSupabaseSyncing
                                  ? 'text-sky-700 dark:text-sky-400'
                                  : supabaseStatus.configured &&
                                      supabaseStatus.connected &&
                                      supabaseStatus.tableReady
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : supabaseStatus.configured
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {!isOnline
                              ? 'آفلاین · صف محلی'
                              : isSupabaseSyncing
                                ? 'در حال تبادل...'
                                : supabaseStatus.configured &&
                                    supabaseStatus.connected &&
                                    supabaseStatus.tableReady
                                  ? `متصل و خودکار${supabaseStatus.latencyMs ? ` (${toPersianDigits(supabaseStatus.latencyMs)}ms)` : ''}`
                                  : supabaseStatus.configured
                                    ? 'نیاز به اجرای SQL'
                                    : 'در انتظار تنظیم کلیدها'}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {!supabaseStatus.configured ? (
                            <span>
                              متغیرهای <span className="font-code font-semibold">SUPABASE_URL</span> و{' '}
                              <span className="font-code font-semibold">SUPABASE_SERVICE_ROLE_KEY</span>{' '}
                              در تنظیمات سرور قرار گیرند تا سینک دوگانه فعال شود.
                            </span>
                          ) : !supabaseStatus.tableReady ? (
                            <span>
                              پروژه <span className="font-code">{supabaseStatus.projectRef}</span> متصل
                              است؛ فایل <span className="font-code">supabase/schema.sql</span> را در SQL
                              Editor اجرا کنید.
                            </span>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                نسخه سرور:{' '}
                                <strong className="font-code text-slate-800 dark:text-slate-200">
                                  #{toPersianDigits(lastSupabaseRevision)}
                                </strong>
                                <span className="mr-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 font-code">
                                  ({toPersianDigits(supabaseBackups.length)}/{toPersianDigits(maxCloudBackups)} نسخه)
                                </span>
                              </span>
                              <span className="font-code text-[10.5px]">
                                {lastSupabaseSyncAt
                                  ? toPersianDigits(lastSupabaseSyncAt)
                                  : 'در حال سینک خودکار...'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => void syncSupabaseNow(false)}
                            disabled={isSupabaseSyncing}
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors"
                          >
                            <ArrowUpFromLine className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>ارسال به Supabase</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void pullFromSupabase()}
                            disabled={
                              isSupabaseSyncing ||
                              !isOnline ||
                              !isCloudMode ||
                              !supabaseStatus.tableReady
                            }
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors"
                          >
                            <ArrowDownToLine className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                            <span>دریافت از Supabase</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void refreshSupabaseStatus()}
                            title="بررسی اتصال و پاکسازی نسخه‌های قدیمی Supabase"
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isSupabaseSyncing ? 'animate-spin' : ''}`}
                            />
                          </button>
                        </div>

                        {supabaseBackups.length > 0 && (
                          <div className="space-y-1 pt-0.5">
                            {supabaseBackups.map((bak, idx) => (
                              <div
                                key={bak.id}
                                className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[10.5px]"
                              >
                                <span className="truncate text-slate-700 dark:text-slate-300 font-code">
                                  #{toPersianDigits(bak.revision)} · {toPersianDigits(bak.savedAtShamsi)}
                                  {idx === 0 ? ' (آخرین)' : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void pullFromSupabase(bak.id)}
                                  disabled={isSupabaseSyncing}
                                  className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline shrink-0"
                                >
                                  بازیابی
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Offline-First Outbox & Conflict Resolution Policy */}
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                            <GitCompareArrows className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            <span>سیاست حل تداخل ویرایش همزمان</span>
                          </span>
                          <span className="font-code text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                            صف آفلاین: {toPersianDigits(pendingQueueCount)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConflictPolicy('last_write_wins')}
                            className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors text-center ${
                              conflictPolicy === 'last_write_wins'
                                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200'
                                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            اولویت با آخرین تغییر
                          </button>
                          <button
                            type="button"
                            onClick={() => setConflictPolicy('first_write_wins')}
                            className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors text-center ${
                              conflictPolicy === 'first_write_wins'
                                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200'
                                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            اولویت با اولین ثبت
                          </button>
                        </div>

                        <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {conflictPolicy === 'last_write_wins'
                            ? 'تغییرات آفلاین ابتدا روی دستگاه ذخیره شده و هنگام اتصال، جدیدترین ثبت با ثبت لاگ ممیزی جایگزین می‌شود.'
                            : 'در صورت ویرایش همزمان روی دو دستگاه، اولین سند ثبت‌شده روی سرور حفظ می‌شود تا از بازنویسی ناخواسته جلوگیری گردد.'}
                        </p>

                        {lastConflictNote && (
                          <div className="px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[10.5px] text-amber-800 dark:text-amber-200">
                            {lastConflictNote}
                          </div>
                        )}
                      </div>

                      {/* 4. Local Backup Quick Trigger */}
                      <div className="pt-1 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">آخرین پشتیبان دستگاه:</span>
                        <span className="font-code font-semibold text-slate-700 dark:text-slate-200">
                          {lastLocalBackupAt
                            ? toPersianDigits(lastLocalBackupAt)
                            : `${toPersianDigits(localSnapshots.length)} نسخه داخلی`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void triggerLocalBackupNow(false);
                          setShowCloudPopover(false);
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/80 font-semibold transition-colors"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>ذخیره پشتیبان فوری روی حافظه دستگاه</span>
                      </button>
                    </div>

                    {/* Footer links */}
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCloudPopover(false);
                          navigate('settings', 'local-backup', 'tool-local-backup');
                        }}
                        className="font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        مدیریت پشتیبان‌ها و RBAC
                      </button>
                      {isCloudMode ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCloudPopover(false);
                            void logout();
                          }}
                          className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>خروج از ابر</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {otherOnlineDevices.length > 0
                            ? `${toPersianDigits(otherOnlineDevices.length)} دستگاه دیگر`
                            : 'آفلاین-اول آماده'}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Active Module Viewport with GPU-composited crisp transition */}
        <main
          id="main-accounting-viewport"
          tabIndex={-1}
          className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6 max-w-[1440px] w-full mx-auto focus:outline-none"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeModule === 'dashboard' && (
                <DashboardView
                  onNavigate={navigate}
                  onOpenCopilot={() => setShowCopilot(true)}
                />
              )}
              {activeModule === 'invoices' && (
                <InvoicesView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'vouchers' && (
                <VouchersView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'audit' && (
                <AuditView
                  onNavigate={navigate}
                  onOpenSystemHealth={() => setShowHealthDrawer(true)}
                />
              )}
              {activeModule === 'accounts' && (
                <AccountsView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'parties' && (
                <PartiesView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'inventory' && (
                <InventoryView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'treasury' && (
                <TreasuryView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'currencies' && (
                <CurrenciesView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                  onNavigate={navigate}
                />
              )}
              {activeModule === 'commercial' && (
                <ImportAndSubcontractView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'corporate' && (
                <CorporateView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'finance-ops' && (
                <FinanceOpsView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'warehouse-crm' && (
                <WarehouseCrmOpsView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'reports' && (
                <ReportsView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                />
              )}
              {activeModule === 'studio' && <BrandStudioView />}
              {activeModule === 'settings' && (
                <SettingsView
                  initialIntent={moduleIntent}
                  clearIntent={() => setModuleIntent(undefined)}
                  dualCloud={dualCloud}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Thumb-Friendly Quick Navigation Bar (< lg only, compact 52px) */}
      <nav
        aria-label="دسترسی سریع موبایل"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-white/10 pb-safe no-print"
      >
        <div className="grid grid-cols-5 h-13">
          <button
            type="button"
            onClick={() => navigate('dashboard', undefined, 'dashboard')}
            aria-current={activeModule === 'dashboard' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              activeModule === 'dashboard'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>داشبورد</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('vouchers', 'new-voucher', 'acc-new-voucher')}
            aria-current={activeModule === 'vouchers' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              activeModule === 'vouchers'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>ثبت سند</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('invoices', 'new-sale', 'inv-sale')}
            aria-current={activeModule === 'invoices' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              activeModule === 'invoices'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>فاکتور</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('treasury', undefined, 'trs-cheques')}
            aria-current={activeModule === 'treasury' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              activeModule === 'treasury'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>خزانه</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Menu className="w-4 h-4" />
            <span>منوها</span>
          </button>
        </div>
      </nav>

      {/* Global Transaction Feedback Toast with smooth micro-interaction */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-16 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/95 dark:bg-teal-800/95 backdrop-blur-md border border-white/10 text-white text-xs font-medium shadow-xl no-print"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="leading-relaxed">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Overlays */}
      <ShortcutHelpModal
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        onNavigate={navigate}
      />
      <CommandPaletteModal
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={navigate}
      />
      <QuickCalculatorModal
        open={showCalculator}
        onClose={() => setShowCalculator(false)}
      />
      <SmartCopilotDrawer
        open={showCopilot}
        onClose={() => setShowCopilot(false)}
        onNavigate={navigate}
      />
      <SystemHealthDrawer
        open={showHealthDrawer}
        onClose={() => setShowHealthDrawer(false)}
        onNavigate={navigate}
        supabaseStatus={supabaseStatus}
        pendingOfflineQueueCount={pendingQueueCount}
        conflictPolicy={conflictPolicy}
      />
      <OfflineIndicator onOpenHealth={() => setShowHealthDrawer(true)} />
    </div>
    </MotionConfig>
  );
}
