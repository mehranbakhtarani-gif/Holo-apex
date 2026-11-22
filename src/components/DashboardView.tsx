import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Barcode,
  BookOpen,
  Briefcase,
  Clock,
  Coins,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  HardDrive,
  Inbox,
  Landmark,
  LayoutGrid,
  Package,
  Scale,
  ShieldCheck,
  Ship,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import { formatCompactMoney, formatMoney, formatNumber, toPersianDigits } from '../lib/format';
import { computeChequeAlerts, useChequeAlertPreferences } from '../lib/chequeAlerts';
import {
  computeCashFlowLiquidityRadar,
  DashboardViewMode,
  loadDashboardViewMode,
  saveDashboardViewMode,
} from '../lib/smartIntelligence';
import { ActiveModule } from '../types/accounting';
import { DashboardChequeAlerts } from './DashboardChequeAlerts';
import { DashboardActionSearch } from './DashboardActionSearch';
import { LiveFxTickerCard } from './LiveFxTickerCard';
import { DashboardWidget } from './DashboardWidget';

const SHAMSI_MONTHS = [
  { key: '01', name: 'فروردین' },
  { key: '02', name: 'اردیبهشت' },
  { key: '03', name: 'خرداد' },
  { key: '04', name: 'تیر' },
  { key: '05', name: 'مرداد' },
  { key: '06', name: 'شهریور' },
  { key: '07', name: 'مهر' },
  { key: '08', name: 'آبان' },
  { key: '09', name: 'آذر' },
  { key: '10', name: 'دی' },
  { key: '11', name: 'بهمن' },
  { key: '12', name: 'اسفند' },
];

const EXPENSE_COLORS = ['#0f766e', '#0284c7', '#d97706', '#dc2626', '#475569', '#059669'];
const BANK_COLORS = ['#0f766e', '#0369a1', '#0d9488', '#334155', '#047857'];

const VIEW_MODE_TABS: {
  id: DashboardViewMode;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'integrated', label: 'نمای ادغامی', sublabel: 'جامع مدیریتی', icon: LayoutGrid },
  { id: 'fast', label: 'فست‌مد (Fast Mod)', sublabel: 'ثبت سریع روزانه', icon: Zap },
  { id: 'classic', label: 'نمای کلاسیک ۹.۶', sublabel: 'ماژول‌های دسته‌بندی‌شده', icon: FolderKanban },
  { id: 'favorites', label: 'پرکاربردها', sublabel: 'منوی شخصی‌سازی‌شده', icon: Star },
];

export const DashboardView: React.FC<{
  onNavigate: (mod: ActiveModule, intent?: string, subKey?: string) => void;
  onOpenCopilot?: () => void;
}> = ({ onNavigate, onOpenCopilot }) => {
  const {
    profile,
    trialBalance,
    incomeStatement,
    balanceSheet,
    invoices,
    vouchers,
    products,
    cheques,
    accounts,
    parties,
    triggerLocalBackupNow,
    lastLocalBackupAt,
  } = useAccounting();

  const { prefs: chequeAlertPrefs } = useChequeAlertPreferences();
  const {
    favoriteMenus: favoriteKeys,
    setFavoriteMenusSynced,
    reservedInvoices,
  } = useWorkspaceExtensions();

  const [viewMode, setViewMode] = useState<DashboardViewMode>(() => loadDashboardViewMode());

  const handleChangeViewMode = (mode: DashboardViewMode) => {
    setViewMode(mode);
    saveDashboardViewMode(mode);
  };

  const toggleFavoriteKey = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = favoriteKeys.includes(key)
      ? favoriteKeys.filter((k) => k !== key)
      : [...favoriteKeys, key];
    setFavoriteMenusSynced(next);
  };

  const unit = profile.currencyUnit;
  const unitLabel = unit === 'IRT' ? 'میلیون تومان' : 'میلیون ریال';
  const millionDivisor = unit === 'IRT' ? 10_000_000 : 1_000_000;

  // Cash & Bank Liquidity from Trial Balance (101xx + 102xx)
  const liquidity = useMemo(() => {
    return trialBalance
      .filter((r) => r.accountCode.startsWith('101') || r.accountCode.startsWith('102'))
      .reduce((s, r) => s + r.balanceDebit - r.balanceCredit, 0);
  }, [trialBalance]);

  // Smart 30-Day Cash-Flow & Cheque Liquidity Radar
  const liquidityRadar = useMemo(
    () =>
      computeCashFlowLiquidityRadar({
        currentLiquidity: liquidity,
        cheques,
      }),
    [liquidity, cheques]
  );

  // Reserved invoices & cartable draft counts for Holoo 9.6 status badges (cloud-synced)
  const draftVoucherCount = useMemo(
    () => vouchers.filter((v) => v.status === 'draft').length,
    [vouchers]
  );
  const reservedInvoiceCount = reservedInvoices.length;

  // Receivables + Pending Receivable Cheques (103xx + 104xx)
  const totalReceivables = useMemo(() => {
    return trialBalance
      .filter((r) => r.accountCode.startsWith('103') || r.accountCode.startsWith('104'))
      .reduce((s, r) => s + r.balanceDebit - r.balanceCredit, 0);
  }, [trialBalance]);

  // Determine active month horizon up to latest voucher month (minimum 8 months for readability)
  const activeMonths = useMemo(() => {
    let maxMonth = 8;
    vouchers.forEach((v) => {
      const m = parseInt(v.date.split('/')[1] || '1', 10);
      if (!Number.isNaN(m) && m > maxMonth) maxMonth = Math.min(12, m);
    });
    return SHAMSI_MONTHS.slice(0, maxMonth);
  }, [vouchers]);

  // Widget 1: Monthly Cash Flow (LineChart) — Inflows, Outflows & Cumulative Cash/Bank Balance
  const cashFlowChartData = useMemo(() => {
    let runningBalance = 0;
    return activeMonths.map((m) => {
      let inflow = 0;
      let outflow = 0;
      vouchers.forEach((v) => {
        const parts = v.date.split('/');
        if (parts[1] === m.key) {
          v.lines.forEach((l) => {
            if (l.accountCode.startsWith('101') || l.accountCode.startsWith('102')) {
              if (v.voucherType === 'opening') {
                runningBalance += (l.debit || 0) - (l.credit || 0);
              } else {
                inflow += l.debit || 0;
                outflow += l.credit || 0;
              }
            }
          });
        }
      });
      runningBalance += inflow - outflow;
      return {
        month: m.name,
        ورودی: Math.round(inflow / millionDivisor),
        خروجی: Math.round(outflow / millionDivisor),
        مانده: Math.round(runningBalance / millionDivisor),
      };
    });
  }, [activeMonths, vouchers, millionDivisor]);

  // Widget 2: Expense Composition (PieChart) — Breakdown across COGS & Operating Expense accounts
  const expensePieData = useMemo(() => {
    const items = trialBalance
      .filter((r) => r.category === 'cogs' || r.category === 'expense')
      .map((r) => ({
        code: r.accountCode,
        name: r.accountTitle,
        rawAmount: Math.max(0, r.balanceDebit - r.balanceCredit),
        value: Math.round(Math.max(0, r.balanceDebit - r.balanceCredit) / millionDivisor),
      }))
      .filter((x) => x.rawAmount > 0)
      .sort((a, b) => b.rawAmount - a.rawAmount);

    const total = items.reduce((s, i) => s + i.rawAmount, 0);
    return items.map((item, idx) => ({
      ...item,
      pct: total > 0 ? Math.round((item.rawAmount / total) * 1000) / 10 : 0,
      color: EXPENSE_COLORS[idx % EXPENSE_COLORS.length],
    }));
  }, [trialBalance, millionDivisor]);

  // Widget 3: Profit & Loss by Month (BarChart)
  const pnlBarData = useMemo(() => {
    return activeMonths.map((m) => {
      let revenue = 0;
      let totalCost = 0;
      vouchers.forEach((v) => {
        const parts = v.date.split('/');
        if (parts[1] === m.key && v.voucherType !== 'closing') {
          v.lines.forEach((l) => {
            if (l.accountCode.startsWith('601')) revenue += l.credit || 0;
            if (l.accountCode.startsWith('602')) revenue -= l.debit || 0;
            if (l.accountCode.startsWith('7') || l.accountCode.startsWith('8')) {
              totalCost += l.debit || 0;
            }
          });
        }
      });
      const profit = revenue - totalCost;
      return {
        month: m.name,
        درآمد: Math.round(revenue / millionDivisor),
        هزینه: Math.round(totalCost / millionDivisor),
        سود: Math.round(profit / millionDivisor),
      };
    });
  }, [activeMonths, vouchers, millionDivisor]);

  // Widget 4: Bank & Cash Accounts Balances (BarChart)
  const bankBalancesData = useMemo(() => {
    const balanceMap = new Map<string, number>();
    trialBalance.forEach((r) => {
      balanceMap.set(r.accountCode, r.balanceDebit - r.balanceCredit);
    });

    const cashBankAccounts = accounts
      .filter(
        (a) =>
          (a.level === 'moein' || a.level === 'tafsili') &&
          (a.code.startsWith('101') || a.code.startsWith('102'))
      )
      .sort((a, b) => a.code.localeCompare(b.code));

    return cashBankAccounts.map((acc, idx) => {
      const rawBalance = balanceMap.get(acc.code) ?? 0;
      const shortName = acc.title.split('—')[0].trim();
      return {
        code: acc.code,
        name: shortName,
        fullTitle: acc.title,
        rawBalance,
        مانده: Math.round(rawBalance / millionDivisor),
        isBank: acc.code.startsWith('102'),
        color: BANK_COLORS[idx % BANK_COLORS.length],
      };
    });
  }, [accounts, trialBalance, millionDivisor]);

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock <= p.reorderPoint),
    [products]
  );

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

  const pendingCheques = useMemo(
    () => chequeAlertSummary.allActiveAlerts,
    [chequeAlertSummary.allActiveAlerts]
  );

  const recentVouchers = useMemo(
    () => [...vouchers].sort((a, b) => b.voucherNumber - a.voucherNumber).slice(0, 5),
    [vouchers]
  );

  const quickOperations = useMemo(
    () => [
      {
        key: 'inv-sale',
        title: 'فاکتور فروش',
        hint: 'صدور رسمی · F2',
        icon: FileText,
        iconBg: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
        borderHover: 'hover:border-teal-300 dark:hover:border-teal-700',
        action: () => onNavigate('invoices', 'new-sale', 'inv-sale'),
      },
      {
        key: 'inv-purchase',
        title: 'فاکتور خرید',
        hint: 'خرید داخلی · F4',
        icon: ShoppingCart,
        iconBg: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
        borderHover: 'hover:border-sky-300 dark:hover:border-sky-700',
        action: () => onNavigate('invoices', 'new-purchase', 'inv-purchase'),
      },
      {
        key: 'voucher-new',
        title: 'ثبت سند جدید',
        hint: 'هلو ۹.۶ + AI · F3',
        icon: BookOpen,
        iconBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
        borderHover: 'hover:border-indigo-300 dark:hover:border-indigo-700',
        action: () => onNavigate('vouchers', 'new-voucher', 'voucher-new'),
      },
      {
        key: 'voucher-cartable',
        title: 'کارتابل اسناد',
        hint:
          draftVoucherCount > 0
            ? `${toPersianDigits(draftVoucherCount)} سند در انتظار`
            : 'اسناد و حواله‌ها',
        icon: Inbox,
        iconBg: 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
        borderHover: 'hover:border-violet-300 dark:hover:border-violet-700',
        action: () => onNavigate('vouchers', 'cartable', 'voucher-cartable'),
      },
      {
        key: 'inv-reserved',
        title: 'رزرو موقت فاکتور',
        hint:
          reservedInvoiceCount > 0
            ? `${toPersianDigits(reservedInvoiceCount)} فاکتور در صف`
            : 'صف موقت ۹.۶',
        icon: Clock,
        iconBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
        borderHover: 'hover:border-amber-300 dark:hover:border-amber-700',
        action: () => onNavigate('invoices', 'reserved', 'inv-reserved'),
      },
      {
        key: 'tr-quick',
        title: 'دریافت و پرداخت',
        hint: 'سریع صندوق/بانک',
        icon: ArrowLeftRight,
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
        borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
        action: () => onNavigate('treasury', 'quick', 'tr-quick'),
      },
      {
        key: 'tr-cheques',
        title: 'چک صیادی',
        hint: 'وصول و سررسید · F7',
        icon: Landmark,
        iconBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
        borderHover: 'hover:border-amber-300 dark:hover:border-amber-700',
        action: () => onNavigate('treasury', 'cheques', 'tr-cheques'),
      },
      {
        key: 'comm-imports',
        title: 'واردات و سرشکن',
        hint: 'بهای تمام‌شده نخ',
        icon: Ship,
        iconBg: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300',
        borderHover: 'hover:border-cyan-300 dark:hover:border-cyan-700',
        action: () => onNavigate('commercial', 'imports', 'comm-imports'),
      },
      {
        key: 'comm-orders',
        title: 'حواله باسکول',
        hint: 'سفارش و بارکد لات',
        icon: Scale,
        iconBg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
        borderHover: 'hover:border-purple-300 dark:hover:border-purple-700',
        action: () => onNavigate('commercial', 'orders', 'comm-orders'),
      },
      {
        key: 'inv-kardex',
        title: 'انبار و کاردکس',
        hint: 'موجودی وزنی · F6',
        icon: Package,
        iconBg: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300',
        borderHover: 'hover:border-orange-300 dark:hover:border-orange-700',
        action: () => onNavigate('inventory', 'kardex', 'inv-kardex'),
      },
      {
        key: 'inv-bulk-import',
        title: 'ورود اکسل کالا',
        hint: 'ثبت گروهی CSV',
        icon: FileSpreadsheet,
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
        borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
        action: () => onNavigate('inventory', 'bulk-import', 'inv-bulk-import'),
      },
      {
        key: 'inv-barcode-print',
        title: 'چاپ لیبل بارکد',
        hint: 'کارتن و بوبین',
        icon: Barcode,
        iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
        borderHover: 'hover:border-slate-400 dark:hover:border-slate-600',
        action: () => onNavigate('inventory', 'barcode-print', 'inv-barcode-print'),
      },
      {
        key: 'parties',
        title: 'طرف‌حساب‌ها',
        hint: 'مشتری و تأمین‌کننده · F5',
        icon: Users,
        iconBg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
        borderHover: 'hover:border-blue-300 dark:hover:border-blue-700',
        action: () => onNavigate('parties', undefined, 'parties'),
      },
      {
        key: 'rep-moroor',
        title: 'مرور و تراز مالی',
        hint: 'گزارش‌های F9',
        icon: BarChart3,
        iconBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300',
        borderHover: 'hover:border-fuchsia-300 dark:hover:border-fuchsia-700',
        action: () => onNavigate('reports', 'moroor', 'rep-moroor'),
      },
      {
        key: 'tr-fx-reval',
        title: 'نرخ و تسعیر ارز',
        hint: 'دلار، یوان و درهم',
        icon: Coins,
        iconBg: 'bg-lime-50 dark:bg-lime-950/60 text-lime-700 dark:text-lime-300',
        borderHover: 'hover:border-lime-300 dark:hover:border-lime-700',
        action: () => onNavigate('currencies', 'revaluation', 'tr-fx-reval'),
      },
      {
        key: 'local-backup-now',
        title: 'پشتیبان فوری',
        hint: 'ذخیره روی حافظه دستگاه',
        icon: HardDrive,
        iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
        borderHover: 'hover:border-rose-300 dark:hover:border-rose-700',
        action: () => {
          void triggerLocalBackupNow(false);
        },
      },
    ],
    [draftVoucherCount, reservedInvoiceCount, onNavigate, triggerLocalBackupNow]
  );

  const visibleQuickOperations = useMemo(() => {
    if (viewMode === 'favorites') {
      const pinned = quickOperations.filter((op) => favoriteKeys.includes(op.key));
      return pinned.length > 0 ? pinned : quickOperations.slice(0, 6);
    }
    return quickOperations;
  }, [quickOperations, viewMode, favoriteKeys]);

  const classicCategories = useMemo(
    () => [
      {
        title: 'خرید، فروش و سامانه مودیان',
        icon: FileText,
        accent: 'text-teal-700 dark:text-teal-400',
        links: [
          { label: 'فاکتور فروش رسمی و مودیان (F2)', action: () => onNavigate('invoices', 'new-sale', 'inv-sale') },
          { label: 'فاکتور خرید کالا (F4)', action: () => onNavigate('invoices', 'new-purchase', 'inv-purchase') },
          { label: 'صف فاکتورهای رزرو موقت (۹.۶)', action: () => onNavigate('invoices', 'reserved', 'inv-reserved') },
          { label: 'فروش اقساطی (دفترچه قسط) و تخفیف پلکانی', action: () => onNavigate('warehouse-crm', 'installments', 'crm-installments') },
          { label: 'صدور و تبدیل پیش‌فاکتور', action: () => onNavigate('invoices', 'new-proforma', 'inv-proforma') },
        ],
      },
      {
        title: 'حسابداری، اسناد و کارتابل',
        icon: BookOpen,
        accent: 'text-indigo-700 dark:text-indigo-400',
        links: [
          { label: 'ورود اطلاعات سند جدید + AI صوتی (F3)', action: () => onNavigate('vouchers', 'new-voucher', 'voucher-new') },
          { label: 'کارتابل اسناد و حواله‌ها (۹.۶)', action: () => onNavigate('vouchers', 'cartable', 'voucher-cartable') },
          { label: 'اسناد تکرارشونده دوره‌ای ماهانه', action: () => onNavigate('finance-ops', 'recurring', 'fin-recurring') },
          { label: 'مرکز حسابرسی و کنترل خطا', action: () => onNavigate('audit', undefined, 'audit-center') },
          { label: 'انتقال دوره و افتتاح سال مالی جدید', action: () => onNavigate('finance-ops', 'fiscal-rollover', 'fin-rollover') },
        ],
      },
      {
        title: 'انبارداری، لات رنگرزی، امانی و BOM',
        icon: Package,
        accent: 'text-orange-700 dark:text-orange-400',
        links: [
          { label: 'معرفی کالا و قیمت‌گذاری ۴ سطحی (F6)', action: () => onNavigate('inventory', undefined, 'inv-products') },
          { label: 'ردیابی شماره لات و شید رنگرزی نخ', action: () => onNavigate('warehouse-crm', 'dye-lots', 'wh-dyelots') },
          { label: 'رسید/حواله مستقل و کالای امانی', action: () => onNavigate('warehouse-crm', 'slips', 'wh-slips') },
          { label: 'فرمول تولید (BOM) و بهای تمام‌شده', action: () => onNavigate('warehouse-crm', 'bom', 'wh-bom') },
          { label: 'کاردکس ریالی و انبارگردانی گروهی', action: () => onNavigate('inventory', 'kardex', 'inv-kardex') },
        ],
      },
      {
        title: 'خزانه‌داری، تنخواه، وام و چک صیادی',
        icon: Landmark,
        accent: 'text-amber-700 dark:text-amber-400',
        links: [
          { label: 'مدیریت چک صیادی + اسکن هوشمند AI (F7)', action: () => onNavigate('treasury', 'cheques', 'tr-cheques') },
          { label: 'مدیریت تنخواه‌گردان و اسکن قبض', action: () => onNavigate('finance-ops', 'petty-cash', 'fin-petty') },
          { label: 'تسهیلات و وام‌های بانکی (جدول اقساط)', action: () => onNavigate('finance-ops', 'loans', 'fin-loans') },
          { label: 'مغایرت‌گیری خودکار بانکی (CSV)', action: () => onNavigate('treasury', 'reconciliation', 'tr-reconciliation') },
          { label: 'تابلوی ارز و تسعیر پایان دوره', action: () => onNavigate('currencies', 'revaluation', 'tr-fx-reval') },
        ],
      },
      {
        title: 'بازرگانی واردات، باسکول و رنگرزی',
        icon: Ship,
        accent: 'text-cyan-700 dark:text-cyan-400',
        links: [
          { label: 'پرونده واردات نخ و قیمت تمام‌شده', action: () => onNavigate('commercial', 'imports', 'comm-imports') },
          { label: 'سفارش فروش، باسکول و بارکد لات', action: () => onNavigate('commercial', 'orders', 'comm-orders') },
          { label: 'پیمانکاری رنگرزی و بافندگی', action: () => onNavigate('commercial', 'subcontract', 'comm-subcontract') },
          { label: 'طرف‌حساب‌ها و سقف اعتبار (F5)', action: () => onNavigate('parties', undefined, 'parties') },
          { label: 'کدینگ حساب‌ها (کل و معین)', action: () => onNavigate('accounts', undefined, 'accounts-all') },
        ],
      },
      {
        title: 'گزارش‌های هوشمند، امور شرکتی و تنظیمات',
        icon: Briefcase,
        accent: 'text-fuchsia-700 dark:text-fuchsia-400',
        links: [
          { label: 'تراز آزمایشی و مرور حساب‌ها (F9)', action: () => onNavigate('reports', 'trial', 'rep-trial') },
          { label: 'تحلیل هوشمند ABC کالا و مشتری', action: () => onNavigate('reports', 'abc', 'rep-abc') },
          { label: 'صورت سود و زیان و ترازنامه', action: () => onNavigate('reports', 'pnl', 'rep-pnl') },
          { label: 'حقوق و دستمزد، اموال و مراکز هزینه (F8)', action: () => onNavigate('corporate', 'payroll', 'corp-payroll') },
          { label: 'تنظیمات شرکتی، RBAC و پشتیبان دستگاه', action: () => onNavigate('settings', undefined, 'tool-settings') },
        ],
      },
    ],
    [onNavigate]
  );

  const tooltipStyle = {
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: '12px',
    direction: 'rtl' as const,
    textAlign: 'right' as const,
  };

  return (
    <div className="space-y-6">
      {/* Header Row & Quick Holoo Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            داشبورد مدیریت مالی و کنترلی هلو اپکس ۹.۶
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>{profile.companyName}</span>
            <span aria-hidden="true">·</span>
            <span>سال مالی {toPersianDigits(profile.fiscalYear)}</span>
            <span aria-hidden="true">·</span>
            <span>
              ترازنامه: {balanceSheet.isBalanced ? 'متوازن و تاییدشده' : 'نیاز به بررسی تراز'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenCopilot && (
            <button
              type="button"
              onClick={onOpenCopilot}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>دستیار هوشمند (Ctrl+J)</span>
            </button>
          )}
          <button
            onClick={() => onNavigate('invoices', 'new-sale', 'inv-sale')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            <span>فاکتور فروش (F2)</span>
          </button>
          <button
            onClick={() => onNavigate('vouchers', 'new-voucher', 'voucher-new')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-4 h-4" />
            <span>ثبت سند (F3)</span>
          </button>
          <button
            onClick={() => onNavigate('treasury', 'cheques', 'tr-cheques')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Landmark className="w-4 h-4" />
            <span>خزانه‌داری (F7)</span>
          </button>
        </div>
      </div>

      {/* Holoo Apex 9.6 Homepage View Mode Switcher (Integrated / Fast Mod / Classic / Favorites) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="نماهای صفحه اصلی هلو اپکس ۹.۶">
          {VIEW_MODE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleChangeViewMode(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-700 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                <span
                  className={`hidden md:inline text-[10.5px] ${
                    active ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  · {tab.sublabel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline">
            کارتابل موقت: <strong className="font-code text-slate-900 dark:text-white">{toPersianDigits(draftVoucherCount)}</strong>
          </span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline">
            فاکتور رزرو: <strong className="font-code text-slate-900 dark:text-white">{toPersianDigits(reservedInvoiceCount)}</strong>
          </span>
          {lastLocalBackupAt && (
            <>
              <span className="hidden md:inline" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigate('settings', 'local-backup', 'tool-local-backup')}
                className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors font-code"
              >
                پشتیبان داخلی: {toPersianDigits(lastLocalBackupAt)}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Free-Market FX Ticker Card (USD, CNY, AED, EUR — chand.app) */}
      <LiveFxTickerCard onNavigate={onNavigate} />

      {/* Smart 30-Day Cash-Flow & Cheque Liquidity Radar */}
      <section
        aria-label="رادار هوشمند نقدینگی ۳۰ روزه"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                liquidityRadar.riskLevel === 'critical'
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  : liquidityRadar.riskLevel === 'watch'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  رادار هوشمند نقدینگی و پیش‌بینی ۳۰ روزه چک‌ها
                </h2>
                <span
                  className={`text-[11px] font-semibold ${
                    liquidityRadar.riskLevel === 'critical'
                      ? 'text-rose-700 dark:text-rose-400'
                      : liquidityRadar.riskLevel === 'watch'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  ·{' '}
                  {liquidityRadar.riskLevel === 'critical'
                    ? 'هشدار کسری یا چک برگشتی'
                    : liquidityRadar.riskLevel === 'watch'
                      ? 'نیاز به مدیریت نقدینگی'
                      : 'نقدینگی ایمن در ۳۰ روز آینده'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                شبیه‌سازی آنی مانده نقد و بانک پس از وصول {toPersianDigits(liquidityRadar.upcomingReceivableCount)} چک دریافتی و پاس‌شدن {toPersianDigits(liquidityRadar.upcomingPayableCount)} چک پرداختی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('treasury', 'cheques', 'tr-cheques')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              بررسی چک‌ها
            </button>
            {onOpenCopilot && (
              <button
                type="button"
                onClick={onOpenCopilot}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-teal-700 text-white hover:bg-slate-800 dark:hover:bg-teal-600 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>تحلیل هوشمند AI</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {liquidityRadar.horizons.map((h) => (
            <div
              key={h.horizonDays}
              className={`rounded-lg border p-3.5 ${
                h.hasDeficit
                  ? 'border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/25'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{h.label}</span>
                <span className="font-code text-[11px]">
                  {h.hasDeficit ? 'کسری نقدینگی' : 'مانده پیش‌بینی'}
                </span>
              </div>
              <div
                className={`text-lg font-bold font-code tabular-nums mt-1.5 ${
                  h.hasDeficit
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {formatCompactMoney(h.projectedBalance, unit)}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-[11px] font-code tabular-nums">
                <span className="text-emerald-700 dark:text-emerald-400">
                  + دریافتی: {formatCompactMoney(h.receivableInflow, unit)}
                </span>
                <span className="text-rose-700 dark:text-rose-400">
                  − پرداختی: {formatCompactMoney(h.payableOutflow, unit)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {(liquidityRadar.earliestDeficitDate || liquidityRadar.bouncedChequesTotal > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>
                {liquidityRadar.earliestDeficitDate
                  ? `نخستین نقطه کسری نقدینگی در تاریخ ${toPersianDigits(liquidityRadar.earliestDeficitDate)} به مبلغ ${formatCompactMoney(liquidityRadar.earliestDeficitAmount, unit)} پیش‌بینی می‌شود.`
                  : `مبلغ ${formatCompactMoney(liquidityRadar.bouncedChequesTotal, unit)} چک برگشتی حل‌نشده در سیستم ثبت شده است.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('treasury', 'cheques', 'tr-cheques')}
              className="font-semibold underline whitespace-nowrap"
            >
              مدیریت و جابه‌جایی سررسید
            </button>
          </div>
        )}
      </section>

      {/* View Mode: Classic Categorized Holoo 9.6 Modules */}
      {viewMode === 'classic' ? (
        <section aria-label="ماژول‌های کلاسیک هلو اپکس ۹.۶" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {classicCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.title}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <Icon className={`w-4 h-4 shrink-0 ${cat.accent}`} />
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white">{cat.title}</h2>
                </div>
                <div className="space-y-1">
                  {cat.links.map((lk) => (
                    <button
                      key={lk.label}
                      type="button"
                      onClick={lk.action}
                      className="w-full text-right px-2.5 py-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-teal-700 dark:hover:text-teal-300 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{lk.label}</span>
                      <span className="text-slate-400 text-[10px]">←</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        /* Daily Holoo Apex Quick Operations Grid (Integrated / Fast Mod / Favorites) */
        <section aria-label="دسترسی سریع عملیات روزانه" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {viewMode === 'favorites'
                  ? `عملیات پرکاربرد شخصی‌سازی‌شده (${toPersianDigits(visibleQuickOperations.length)} مورد)`
                  : viewMode === 'fast'
                    ? 'میز کار سریع روزانه (Fast Mod ۹.۶)'
                    : 'دسترسی سریع عملیات روزانه هلو اپکس ۹.۶'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                با کلیک روی آیکون ستاره کنار هر کارت، آن عملیات را به تب «پرکاربردها» پین یا حذف کنید.
              </p>
            </div>
            {viewMode === 'favorites' && (
              <button
                type="button"
                onClick={() => handleChangeViewMode('integrated')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                مشاهده همه عملیات برای پین کردن
              </button>
            )}
          </div>
          <div
            className={`grid gap-2.5 ${
              viewMode === 'fast'
                ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'
            }`}
          >
            {visibleQuickOperations.map((item) => {
              const Icon = item.icon;
              const isPinned = favoriteKeys.includes(item.key);
              return (
                <div
                  key={item.key}
                  onClick={item.action}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      item.action();
                    }
                  }}
                  className={`group relative flex items-center gap-3 ${
                    viewMode === 'fast' ? 'p-4' : 'p-3'
                  } rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 ${item.borderHover} hover:shadow-sm transition-all text-right cursor-pointer`}
                >
                  <div
                    className={`${
                      viewMode === 'fast' ? 'w-10 h-10' : 'w-9 h-9'
                    } rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}
                  >
                    <Icon className={viewMode === 'fast' ? 'w-5 h-5' : 'w-4 h-4'} />
                  </div>
                  <div className="min-w-0 flex-1 pl-4">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {item.hint}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => toggleFavoriteKey(item.key, e)}
                    title={isPinned ? 'حذف از پرکاربردها' : 'پین به پرکاربردها'}
                    aria-label={isPinned ? 'حذف از پرکاربردها' : 'پین به پرکاربردها'}
                    className={`absolute top-2 left-2 p-1 rounded-md transition-opacity ${
                      isPinned
                        ? 'text-amber-500 opacity-100'
                        : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Inline Fuzzy Action Launcher for All ERP Functions */}
      <DashboardActionSearch onNavigate={onNavigate} />

      {/* Smart Urgent Cheque Alerts (3 Days Before Maturity — Received & Paid) */}
      <DashboardChequeAlerts onNavigate={onNavigate} />

      {/* 4-Column Executive KPI Strip (hidden only in ultra-focused Fast Mod? Keep KPIs in Integrated, Classic & Favorites; compact in Fast Mod too so executive figures stay visible) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>فروش خالص دوره</span>
            <span className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-2.5">
            {formatCompactMoney(incomeStatement.netSales, unit)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
            <span>حاشیه سود ناخالص:</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {toPersianDigits(incomeStatement.grossMarginPct.toFixed(1))}٪
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>سود خالص دوره</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div
            className={`text-2xl font-bold tabular-nums mt-2.5 ${
              incomeStatement.netProfit >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatCompactMoney(incomeStatement.netProfit, unit)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
            <span>حاشیه سود خالص:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
              {toPersianDigits(incomeStatement.netMarginPct.toFixed(1))}٪
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>موجودی نقد و بانک‌ها</span>
            <span className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-2.5">
            {formatCompactMoney(liquidity, unit)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            صندوق مرکزی · بانک ملت · بانک سامان
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>مطالبات و چک‌های دریافتنی</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-2.5">
            {formatCompactMoney(totalReceivables, unit)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {toPersianDigits(pendingCheques.length)} فقره چک فعال در جریان وصول
          </div>
        </div>
      </div>

      {/* Daily Revenue & Recent Expenses Trend Widget (Holoo Apex Reporting) */}
      <DashboardWidget onNavigate={onNavigate} />

      {/* 4 Recharts Financial Widgets Grid (2x2) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Widget 1: Monthly Cash Flow (LineChart) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                جریان نقدینگی ماهانه (ورودی، خروجی و مانده نقد)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                بر حسب {unitLabel} — محاسبه‌شده از گردش صندوق و بانک‌ها
              </p>
            </div>
            <button
              onClick={() => onNavigate('treasury')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              جزئیات خزانه
            </button>
          </div>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [
                    `${toPersianDigits(Number(value).toLocaleString('en-US'))} ${unitLabel}`,
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="مانده"
                  name="مانده تجمعی نقد"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#0f766e' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="ورودی"
                  name="ورودی نقدی"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#16a34a' }}
                />
                <Line
                  type="monotone"
                  dataKey="خروجی"
                  name="خروجی نقدی"
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#dc2626' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Widget 2: Expense Composition (PieChart) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ترکیب هزینه‌ها و بهای تمام‌شده
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                سهم هر سرفصل هزینه‌ای از کل هزینه‌های ثبت‌شده دوره
              </p>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              تراز آزمایشی
            </button>
          </div>

          {expensePieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              هنوز سرفصل هزینه‌ای در اسناد دوره ثبت نشده است.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-6 h-60 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={86}
                      paddingAngle={2}
                    >
                      {expensePieData.map((entry) => (
                        <Cell key={entry.code} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: unknown, name: unknown) => [
                        `${toPersianDigits(Number(value).toLocaleString('en-US'))} ${unitLabel}`,
                        String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="sm:col-span-6 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {expensePieData.map((item) => (
                  <div key={item.code} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="text-slate-700 dark:text-slate-300 truncate" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <div className="text-left shrink-0 font-code tabular-nums">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {toPersianDigits(item.pct)}٪
                      </span>
                      <div className="text-[11px] text-slate-500">
                        {formatCompactMoney(item.rawAmount, unit)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Widget 3: Profit & Loss (BarChart) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                نمودار سود و زیان ماهانه
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مقایسه درآمد فروش، کل بهای تمام‌شده/هزینه‌ها و سود خالص ({unitLabel})
              </p>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              صورت سود و زیان
            </button>
          </div>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlBarData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [
                    `${toPersianDigits(Number(value).toLocaleString('en-US'))} ${unitLabel}`,
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="درآمد" name="درآمد فروش" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="هزینه" name="بهای تمام‌شده و هزینه" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="سود" name="سود (زیان) خالص" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Widget 4: Bank & Cash Accounts Balances (BarChart + Tabular Summary) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                مانده حساب‌های بانکی و صندوق‌ها
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مانده لحظه‌ای حساب‌های کدینگ ۱۰۱ و ۱۰۲ بر حسب {unitLabel}
              </p>
            </div>
            <button
              onClick={() => onNavigate('accounts')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              دفتر بانک‌ها
            </button>
          </div>

          <div className="h-44 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bankBalancesData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={108}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown) => [
                    `${toPersianDigits(Number(value).toLocaleString('en-US'))} ${unitLabel}`,
                    'مانده حساب',
                  ]}
                />
                <Bar dataKey="مانده" radius={[0, 4, 4, 0]} barSize={20}>
                  {bankBalancesData.map((entry) => (
                    <Cell key={entry.code} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {bankBalancesData.map((b) => (
              <div key={b.code} className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-slate-600 dark:text-slate-400 truncate" title={b.fullTitle}>
                  <span className="font-code text-[11px] text-slate-400 ml-1">{b.code}</span>
                  {b.name}
                </span>
                <span className="font-code tabular-nums font-semibold text-slate-900 dark:text-white shrink-0">
                  {formatCompactMoney(b.rawBalance, unit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Operational Alerts + Recent Vouchers Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Vouchers */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              آخرین اسناد حسابداری ثبت‌شده
            </h2>
            <button
              onClick={() => onNavigate('vouchers')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              دفتر روزنامه ({toPersianDigits(vouchers.length)} سند)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                  <th className="py-2.5 px-4 font-medium">شماره سند</th>
                  <th className="py-2.5 px-4 font-medium">تاریخ</th>
                  <th className="py-2.5 px-4 font-medium">شرح سند</th>
                  <th className="py-2.5 px-4 font-medium text-left">جمع بدهکار/بستانکار</th>
                  <th className="py-2.5 px-4 font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {recentVouchers.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => onNavigate('vouchers')}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-code font-semibold text-slate-900 dark:text-slate-100">
                      #{toPersianDigits(v.voucherNumber)}
                    </td>
                    <td className="py-3 px-4 font-code text-slate-600 dark:text-slate-300">
                      {toPersianDigits(v.date)}
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200 max-w-xs truncate">
                      {v.description}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatMoney(v.totalDebit, unit, false)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${
                          v.status === 'permanent'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {v.status === 'permanent' ? 'دائم و قطعی' : 'موقت'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts & Action Queue */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            هشدارهای کنترلی و سررسیدها
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>تقویم سررسید چک‌های فعال</span>
              <button
                type="button"
                onClick={() => onNavigate('treasury', 'cheques', 'tr-cheques')}
                className="font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                همه چک‌ها
              </button>
            </div>
            {pendingCheques.length === 0 ? (
              <p className="text-xs text-slate-500">چک در جریان وصولی ثبت نشده است.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-b border-slate-100 dark:border-slate-800">
                {pendingCheques.slice(0, 4).map((alert) => {
                  const ch = alert.cheque;
                  const isCritical =
                    alert.severity === 'bounced' ||
                    alert.severity === 'overdue' ||
                    alert.severity === 'today';
                  const isUrgent = alert.severity === 'urgent';
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => onNavigate('treasury', `cheque:${ch.id}`, 'tr-cheques')}
                      className="w-full py-2.5 flex items-center justify-between gap-2 text-xs text-right hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {ch.partyName}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-code tabular-nums">
                            {toPersianDigits(ch.dueDate)}
                          </span>
                          <span aria-hidden="true">·</span>
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
                          <span
                            className={
                              isCritical
                                ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                : isUrgent
                                  ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                  : 'text-slate-500'
                            }
                          >
                            {alert.urgencyLabel}
                          </span>
                        </div>
                      </div>
                      <div className="font-code tabular-nums font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                        {formatCompactMoney(ch.amount, unit)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              هشدار کسری موجودی انبار (نقطه سفارش)
            </div>
            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                موجودی تمام کالاها بالاتر از نقطه سفارش است.
              </p>
            ) : (
              <div className="space-y-2">
                {lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onNavigate('inventory')}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="font-code tabular-nums font-semibold text-amber-800 dark:text-amber-300 shrink-0">
                      {formatNumber(p.stock)} / {formatNumber(p.reorderPoint)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              کل فاکتورهای صادرشده: {toPersianDigits(invoices.length)}
            </span>
            <button
              onClick={() => onNavigate('invoices')}
              className="text-teal-700 dark:text-teal-400 font-medium hover:underline"
            >
              مدیریت فاکتورها
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
