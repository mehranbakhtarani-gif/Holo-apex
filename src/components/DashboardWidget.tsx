import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileText,
  Receipt,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import {
  exportToCsv,
  formatCompactMoney,
  formatMoney,
  shamsiToDayIndex,
  toPersianDigits,
} from '../lib/format';
import { ActiveModule } from '../types/accounting';

type TrendRange = '7d' | '14d' | '30d' | 'all';
type TrendSeriesMode = 'combined' | 'revenue' | 'expenses';

interface DailyTrendPoint {
  date: string;
  shortDate: string;
  dayIndex: number;
  revenueIrr: number;
  expenseIrr: number;
  cogsIrr: number;
  netIrr: number;
  revenueScaled: number;
  expenseScaled: number;
  netScaled: number;
  movingAvgExpenseScaled: number;
  invoiceCount: number;
  expenseEntryCount: number;
}

interface RecentExpenseItem {
  id: string;
  date: string;
  dayIndex: number;
  accountCode: string;
  accountTitle: string;
  description: string;
  amountIrr: number;
  source: 'voucher' | 'petty_cash';
  refLabel: string;
}

interface CustomTooltipPayloadItem {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: DailyTrendPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  unit: 'IRR' | 'IRT';
  unitLabel: string;
}

const DailyTrendTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  unit,
  unitLabel,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 min-w-[220px] text-right text-xs"
    >
      <div className="flex items-center justify-between gap-4 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
        <span className="font-bold text-slate-900 dark:text-white font-code tabular-nums">
          {toPersianDigits(point.date)}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {toPersianDigits(point.invoiceCount)} فروش · {toPersianDigits(point.expenseEntryCount)} هزینه
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-xs bg-teal-600 shrink-0" aria-hidden="true" />
            درآمد روزانه
          </span>
          <span className="font-code tabular-nums font-semibold text-teal-700 dark:text-teal-400">
            {formatMoney(point.revenueIrr, unit)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-xs bg-rose-600 shrink-0" aria-hidden="true" />
            هزینه‌های ثبت‌شده
          </span>
          <span className="font-code tabular-nums font-semibold text-rose-700 dark:text-rose-400">
            {formatMoney(point.expenseIrr, unit)}
          </span>
        </div>

        <div className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-medium">تراز روزانه</span>
          <span
            className={`font-code tabular-nums font-bold ${
              point.netIrr >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {point.netIrr > 0 ? '+' : ''}
            {formatMoney(point.netIrr, unit)}
          </span>
        </div>
      </div>

      <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10.5px] text-slate-400 dark:text-slate-500">
        مقیاس محور نمودار: {unitLabel}
      </div>
    </div>
  );
};

export interface DashboardWidgetProps {
  onNavigate: (mod: ActiveModule, intent?: string, subKey?: string) => void;
}

export const DashboardWidget: React.FC<DashboardWidgetProps> = ({ onNavigate }) => {
  const { profile, vouchers, invoices, accounts } = useAccounting();
  const { pettyCashItems } = useWorkspaceExtensions();

  const [range, setRange] = useState<TrendRange>('14d');
  const [seriesMode, setSeriesMode] = useState<TrendSeriesMode>('combined');
  const [includeCogs, setIncludeCogs] = useState<boolean>(false);

  const unit = profile.currencyUnit;
  const unitLabel = unit === 'IRT' ? 'میلیون تومان' : 'میلیون ریال';
  const millionDivisor = unit === 'IRT' ? 10_000_000 : 1_000_000;

  const accountMap = useMemo(() => {
    const map = new Map<string, { category: string; title: string }>();
    accounts.forEach((acc) => {
      map.set(acc.code, { category: acc.category, title: acc.title });
    });
    return map;
  }, [accounts]);

  // Aggregate daily revenue & expenses across accounting vouchers, invoices & open petty-cash expenses
  const { allDailyPoints, recentExpenses } = useMemo(() => {
    const dayBuckets = new Map<
      string,
      {
        revenueIrr: number;
        opExpenseIrr: number;
        cogsIrr: number;
        invoiceCount: number;
        expenseEntryCount: number;
      }
    >();

    const ensureBucket = (dateStr: string) => {
      const normalized = (dateStr || '').trim();
      let bucket = dayBuckets.get(normalized);
      if (!bucket) {
        bucket = {
          revenueIrr: 0,
          opExpenseIrr: 0,
          cogsIrr: 0,
          invoiceCount: 0,
          expenseEntryCount: 0,
        };
        dayBuckets.set(normalized, bucket);
      }
      return bucket;
    };

    const expenseEntries: RecentExpenseItem[] = [];

    // 1. Count active sales invoices per day for transaction volume context
    invoices.forEach((inv) => {
      if (inv.status === 'cancelled' || inv.invoiceType === 'proforma') return;
      if (inv.invoiceType === 'sale') {
        const b = ensureBucket(inv.date);
        b.invoiceCount += 1;
      }
    });

    // 2. Aggregate accounting vouchers (excluding opening & closing vouchers)
    vouchers.forEach((v) => {
      if (v.voucherType === 'opening' || v.voucherType === 'closing') return;
      const dateStr = (v.date || '').trim();
      if (!dateStr) return;

      v.lines.forEach((line, idx) => {
        const meta = accountMap.get(line.accountCode);
        const category = meta?.category;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        // Revenue recognition (601xx sales, 603xx other revenue, minus 602xx sales returns)
        if (
          category === 'revenue' ||
          line.accountCode.startsWith('601') ||
          line.accountCode.startsWith('602') ||
          line.accountCode.startsWith('603')
        ) {
          const b = ensureBucket(dateStr);
          if (line.accountCode.startsWith('602')) {
            b.revenueIrr -= debit - credit;
          } else if (!line.accountCode.startsWith('609')) {
            b.revenueIrr += credit - debit;
          }
          return;
        }

        // COGS (7xx)
        if (category === 'cogs' || line.accountCode.startsWith('7')) {
          const netCost = debit - credit;
          if (netCost > 0) {
            const b = ensureBucket(dateStr);
            b.cogsIrr += netCost;
            if (includeCogs) {
              b.expenseEntryCount += 1;
              expenseEntries.push({
                id: `${v.id}_cogs_${idx}`,
                date: dateStr,
                dayIndex: shamsiToDayIndex(dateStr),
                accountCode: line.accountCode,
                accountTitle: line.accountTitle || meta?.title || 'بهای تمام‌شده',
                description: line.description || v.description,
                amountIrr: netCost,
                source: 'voucher',
                refLabel: `سند #${toPersianDigits(v.voucherNumber)}`,
              });
            }
          }
          return;
        }

        // Operating & non-operating expenses (8xx)
        if (category === 'expense' || line.accountCode.startsWith('8')) {
          const netExp = debit - credit;
          if (netExp > 0) {
            const b = ensureBucket(dateStr);
            b.opExpenseIrr += netExp;
            b.expenseEntryCount += 1;
            expenseEntries.push({
              id: `${v.id}_exp_${idx}`,
              date: dateStr,
              dayIndex: shamsiToDayIndex(dateStr),
              accountCode: line.accountCode,
              accountTitle: line.accountTitle || meta?.title || 'هزینه عملیاتی',
              description: line.description || v.description,
              amountIrr: netExp,
              source: 'voucher',
              refLabel: `سند #${toPersianDigits(v.voucherNumber)}`,
            });
          }
        }
      });
    });

    // 3. Include unsettled petty cash bills so daily expense tracking stays real-time
    pettyCashItems.forEach((pce) => {
      if (pce.status === 'settled') return; // already posted to voucher
      const dateStr = (pce.date || '').trim();
      if (!dateStr || pce.amountIrr <= 0) return;
      const b = ensureBucket(dateStr);
      b.opExpenseIrr += pce.amountIrr;
      b.expenseEntryCount += 1;
      expenseEntries.push({
        id: `pce_${pce.id}`,
        date: dateStr,
        dayIndex: shamsiToDayIndex(dateStr),
        accountCode: pce.categoryAccountCode || '80199',
        accountTitle: pce.categoryTitle || 'هزینه تنخواه‌گردان',
        description: pce.title + (pce.vendorName ? ` — ${pce.vendorName}` : ''),
        amountIrr: pce.amountIrr,
        source: 'petty_cash',
        refLabel: 'تنخواه باز',
      });
    });

    const sortedDates = Array.from(dayBuckets.entries())
      .map(([date, vals]) => {
        const expenseIrr = vals.opExpenseIrr + (includeCogs ? vals.cogsIrr : 0);
        const revenueIrr = Math.max(0, vals.revenueIrr);
        const parts = date.split('/');
        const shortDate =
          parts.length === 3 ? `${toPersianDigits(parts[1])}/${toPersianDigits(parts[2])}` : toPersianDigits(date);
        return {
          date,
          shortDate,
          dayIndex: shamsiToDayIndex(date),
          revenueIrr,
          expenseIrr,
          cogsIrr: vals.cogsIrr,
          netIrr: revenueIrr - expenseIrr,
          revenueScaled: Math.round((revenueIrr / millionDivisor) * 10) / 10,
          expenseScaled: Math.round((expenseIrr / millionDivisor) * 10) / 10,
          netScaled: Math.round(((revenueIrr - expenseIrr) / millionDivisor) * 10) / 10,
          movingAvgExpenseScaled: 0,
          invoiceCount: vals.invoiceCount,
          expenseEntryCount: vals.expenseEntryCount,
        };
      })
      .filter((d) => d.revenueIrr > 0 || d.expenseIrr > 0)
      .sort((a, b) => a.dayIndex - b.dayIndex);

    // Compute 3-point trailing moving average for recent expenses trendline
    const withMovingAvg: DailyTrendPoint[] = sortedDates.map((pt, i, arr) => {
      const windowStart = Math.max(0, i - 2);
      const slice = arr.slice(windowStart, i + 1);
      const avg = slice.reduce((s, item) => s + item.expenseScaled, 0) / slice.length;
      return {
        ...pt,
        movingAvgExpenseScaled: Math.round(avg * 10) / 10,
      };
    });

    expenseEntries.sort((a, b) => b.dayIndex - a.dayIndex);

    return {
      allDailyPoints: withMovingAvg,
      recentExpenses: expenseEntries.slice(0, 6),
    };
  }, [vouchers, invoices, accounts, accountMap, pettyCashItems, includeCogs, millionDivisor]);

  // Apply selected range window
  const visibleData = useMemo(() => {
    if (allDailyPoints.length === 0) return [];
    if (range === 'all') return allDailyPoints;
    const limit = range === '7d' ? 7 : range === '14d' ? 14 : 30;
    return allDailyPoints.slice(-limit);
  }, [allDailyPoints, range]);

  // Summary KPIs for the active window
  const summary = useMemo(() => {
    const totalRevenue = visibleData.reduce((s, d) => s + d.revenueIrr, 0);
    const totalExpenses = visibleData.reduce((s, d) => s + d.expenseIrr, 0);
    const netBalance = totalRevenue - totalExpenses;
    const activeDays = visibleData.length;
    const avgDailyRevenue = activeDays > 0 ? totalRevenue / activeDays : 0;
    const avgDailyRevenueScaled =
      activeDays > 0
        ? Math.round((avgDailyRevenue / millionDivisor) * 10) / 10
        : 0;

    // Peak revenue day
    const peakDay = visibleData.reduce<DailyTrendPoint | null>(
      (best, cur) => (!best || cur.revenueIrr > best.revenueIrr ? cur : best),
      null
    );

    // Trend delta comparing second half vs first half of visible window
    let revenueTrendPct: number | null = null;
    if (visibleData.length >= 4) {
      const mid = Math.floor(visibleData.length / 2);
      const firstHalf = visibleData.slice(0, mid).reduce((s, d) => s + d.revenueIrr, 0);
      const secondHalf = visibleData.slice(mid).reduce((s, d) => s + d.revenueIrr, 0);
      if (firstHalf > 0) {
        revenueTrendPct = Math.round(((secondHalf - firstHalf) / firstHalf) * 1000) / 10;
      }
    }

    const expenseRatioPct =
      totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 1000) / 10 : 0;

    return {
      totalRevenue,
      totalExpenses,
      netBalance,
      activeDays,
      avgDailyRevenue,
      avgDailyRevenueScaled,
      peakDay,
      revenueTrendPct,
      expenseRatioPct,
    };
  }, [visibleData, millionDivisor]);

  const handleExportCsv = () => {
    if (visibleData.length === 0) return;
    exportToCsv(
      `daily-revenue-expenses-${profile.fiscalYear}.csv`,
      [
        'تاریخ',
        `درآمد روزانه (${unit === 'IRT' ? 'تومان' : 'ریال'})`,
        `هزینه‌های روزانه (${unit === 'IRT' ? 'تومان' : 'ریال'})`,
        `خالص روزانه (${unit === 'IRT' ? 'تومان' : 'ریال'})`,
        'تعداد فاکتور فروش',
        'تعداد اقلام هزینه',
      ],
      visibleData.map((d) => [
        d.date,
        unit === 'IRT' ? Math.round(d.revenueIrr / 10) : Math.round(d.revenueIrr),
        unit === 'IRT' ? Math.round(d.expenseIrr / 10) : Math.round(d.expenseIrr),
        unit === 'IRT' ? Math.round(d.netIrr / 10) : Math.round(d.netIrr),
        d.invoiceCount,
        d.expenseEntryCount,
      ])
    );
  };

  return (
    <section
      aria-label="گزارش روند درآمد روزانه و هزینه‌های اخیر"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Top Header & Reporting Controls */}
      <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
            روند درآمد روزانه و هزینه‌های اخیر (گزارش تحلیلی هلو اپکس)
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>مقیاس: {unitLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{toPersianDigits(summary.activeDays)} روز عملیاتی فعال</span>
            <span aria-hidden="true">·</span>
            <span>
              {includeCogs ? 'شامل بهای تمام‌شده (۷xx) و هزینه (۸xx)' : 'هزینه‌های عملیاتی و تنخواه (۸xx)'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Series View Segmented Control */}
          <div
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg"
            role="tablist"
            aria-label="حالت نمایش نمودار"
          >
            {(
              [
                { id: 'combined', label: 'مقایسه‌ای' },
                { id: 'revenue', label: 'درآمد روزانه' },
                { id: 'expenses', label: 'هزینه‌های اخیر' },
              ] as const
            ).map((tab) => {
              const active = seriesMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSeriesMode(tab.id)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Range Segmented Control */}
          <div
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg"
            role="group"
            aria-label="بازه زمانی"
          >
            {(
              [
                { id: '7d', label: '۷ روز' },
                { id: '14d', label: '۱۴ روز' },
                { id: '30d', label: '۳۰ روز' },
                { id: 'all', label: 'کل دوره' },
              ] as const
            ).map((item) => {
              const active = range === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-teal-700 text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* COGS Inclusion Toggle */}
          <button
            type="button"
            onClick={() => setIncludeCogs((prev) => !prev)}
            className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              includeCogs
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium'
            }`}
          >
            {includeCogs ? 'با بهای تمام‌شده' : 'فقط هزینه‌ها'}
          </button>

          {/* CSV Export */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleData.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی CSV</span>
          </button>
        </div>
      </div>

      {/* Flat Hairline KPI Summary Strip (No Nested Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-100 dark:divide-slate-800 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
        <div className="px-5 py-3.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            مجموع درآمد بازه انتخابی
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-bold font-code tabular-nums text-teal-700 dark:text-teal-400">
              {formatCompactMoney(summary.totalRevenue, unit)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-code tabular-nums">
            میانگین روزانه: {formatCompactMoney(summary.avgDailyRevenue, unit)}
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            مجموع هزینه‌های بازه
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-bold font-code tabular-nums text-rose-700 dark:text-rose-400">
              {formatCompactMoney(summary.totalExpenses, unit)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-code tabular-nums">
            نسبت هزینه به درآمد: {toPersianDigits(summary.expenseRatioPct)}٪
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            تراز خالص درآمد و هزینه
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {summary.netBalance >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <ArrowDownLeft className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span
              className={`text-base font-bold font-code tabular-nums ${
                summary.netBalance >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {formatCompactMoney(summary.netBalance, unit)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {summary.netBalance >= 0 ? 'مازاد عملیاتی مثبت در بازه' : 'فزونی هزینه بر درآمد در بازه'}
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            اوج فروش روزانه و شتاب روند
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {summary.revenueTrendPct !== null && (
              summary.revenueTrendPct >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )
            )}
            <span className="text-base font-bold font-code tabular-nums text-slate-900 dark:text-white">
              {summary.peakDay ? formatCompactMoney(summary.peakDay.revenueIrr, unit) : '—'}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-code tabular-nums">
            {summary.peakDay ? `تاریخ اوج: ${toPersianDigits(summary.peakDay.date)}` : 'بدون رکورد'}
            {summary.revenueTrendPct !== null && (
              <>
                {' · '}
                <span
                  className={
                    summary.revenueTrendPct >= 0
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-amber-700 dark:text-amber-400 font-semibold'
                  }
                >
                  {summary.revenueTrendPct > 0 ? '+' : ''}
                  {toPersianDigits(summary.revenueTrendPct)}٪
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: 2-Column Split (Chart 8 cols + Recent Expenses Ledger 4 cols) */}
      {visibleData.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            هنوز تراکنش درآمد یا هزینه‌ای برای ترسیم نمودار روزانه ثبت نشده است.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            با صدور اولین فاکتور فروش یا ثبت سند هزینه/تنخواه‌گردان، نمودار روند روزانه و فهرست هزینه‌های اخیر به‌صورت خودکار به‌روزرسانی می‌شود.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('invoices', 'new-sale', 'inv-sale')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>صدور فاکتور فروش</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('finance-ops', 'petty-cash', 'fin-petty')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>ثبت هزینه تنخواه</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x xl:divide-x-reverse divide-slate-100 dark:divide-slate-800">
          {/* Left/Primary 8 Columns: Recharts Composed Trend Visualization */}
          <div className="xl:col-span-8 p-5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300">
                {(seriesMode === 'combined' || seriesMode === 'revenue') && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-teal-600" aria-hidden="true" />
                    <span>درآمد روزانه</span>
                  </span>
                )}
                {(seriesMode === 'combined' || seriesMode === 'expenses') && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" aria-hidden="true" />
                    <span>هزینه‌های روزانه</span>
                  </span>
                )}
                {seriesMode === 'expenses' && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-amber-600" aria-hidden="true" />
                    <span>میانگین متحرک ۳ روزه هزینه</span>
                  </span>
                )}
                {seriesMode === 'revenue' && summary.avgDailyRevenueScaled > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-code tabular-nums">
                    <span className="w-3 h-0.5 border-t border-dashed border-teal-600" aria-hidden="true" />
                    <span>
                      خط میانگین ({toPersianDigits(summary.avgDailyRevenueScaled)} {unitLabel})
                    </span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onNavigate('reports', 'pnl', 'rep-pnl')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
              >
                گزارش تفصیلی سود و زیان
              </button>
            </div>

            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={visibleData}
                  margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="apexDailyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#cbd5e1"
                    strokeOpacity={0.45}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.5 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    tickFormatter={(val: number) => toPersianDigits(val)}
                  />
                  <Tooltip
                    content={
                      <DailyTrendTooltip unit={unit} unitLabel={unitLabel} />
                    }
                  />

                  {seriesMode === 'revenue' && summary.avgDailyRevenueScaled > 0 && (
                    <ReferenceLine
                      y={summary.avgDailyRevenueScaled}
                      stroke="#0f766e"
                      strokeDasharray="5 4"
                      strokeOpacity={0.75}
                    />
                  )}

                  {(seriesMode === 'combined' || seriesMode === 'revenue') && (
                    <Area
                      type="monotone"
                      dataKey="revenueScaled"
                      name="درآمد روزانه"
                      stroke="#0f766e"
                      strokeWidth={2.5}
                      fill="url(#apexDailyRevenueFill)"
                      dot={{ r: 3, fill: '#0f766e', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#0f766e', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {(seriesMode === 'combined' || seriesMode === 'expenses') && (
                    <Bar
                      dataKey="expenseScaled"
                      name="هزینه‌های روزانه"
                      fill="#e11d48"
                      fillOpacity={seriesMode === 'combined' ? 0.78 : 0.88}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  )}

                  {seriesMode === 'expenses' && (
                    <Line
                      type="monotone"
                      dataKey="movingAvgExpenseScaled"
                      name="میانگین متحرک هزینه"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right/Secondary 4 Columns: Recent Expenses Feed */}
          <div className="xl:col-span-4 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    آخرین اقلام هزینه ثبت‌شده
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    اسناد هزینه‌ای و قبض‌های تنخواه باز
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('finance-ops', 'petty-cash', 'fin-petty')}
                  className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
                >
                  تنخواه‌گردان
                </button>
              </div>

              {recentExpenses.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  در این بازه قلم هزینه‌ای ثبت نشده است.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentExpenses.map((exp) => (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() =>
                        exp.source === 'petty_cash'
                          ? onNavigate('finance-ops', 'petty-cash', 'fin-petty')
                          : onNavigate('vouchers')
                      }
                      className="w-full py-2.5 text-right flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors rounded-md px-1 -mx-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {exp.description || exp.accountTitle}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-code tabular-nums">
                            {toPersianDigits(exp.date)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[120px]">{exp.accountTitle}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              exp.source === 'petty_cash'
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {exp.refLabel}
                          </span>
                        </div>
                      </div>
                      <div className="font-code tabular-nums text-xs font-semibold text-rose-700 dark:text-rose-400 shrink-0 pt-0.5">
                        {formatCompactMoney(exp.amountIrr, unit)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>تعداد اقلام نمایش‌داده‌شده: {toPersianDigits(recentExpenses.length)}</span>
              <button
                type="button"
                onClick={() => onNavigate('vouchers')}
                className="text-teal-700 dark:text-teal-400 font-medium hover:underline whitespace-nowrap"
              >
                همه اسناد هزینه
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardWidget;
