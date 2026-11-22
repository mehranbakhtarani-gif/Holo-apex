import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ListOrdered,
  Printer,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { ActiveModule } from '../types/accounting';
import { formatMoney, toPersianDigits } from '../lib/format';

export const AuditView: React.FC<{
  onNavigate: (mod: ActiveModule, intent?: string) => void;
  onOpenSystemHealth?: () => void;
}> = ({ onNavigate, onOpenSystemHealth }) => {
  const { auditReport, profile, vouchers, renumberVouchersChronologically } = useAccounting();
  const unit = profile.currencyUnit;
  const rec = auditReport.reconciliation;

  const reconciliationRows = [
    {
      label: 'بدهکاران تجاری (معین ۱۰۴۰۱) در برابر تفصیلی مشتریان',
      bookLabel: 'مانده معین ۱۰۴۰۱',
      subLabel: 'جمع تفصیلی مشتریان',
      a: rec.glReceivables,
      b: rec.subReceivables,
    },
    {
      label: 'بستانکاران تجاری (معین ۳۰۱۰۱) در برابر تفصیلی تأمین‌کنندگان',
      bookLabel: 'مانده معین ۳۰۱۰۱',
      subLabel: 'جمع تفصیلی تأمین‌کنندگان',
      a: rec.glPayables,
      b: rec.subPayables,
    },
    {
      label: 'مالیات ارزش افزوده فروش (معین ۳۰۳۰۱) در برابر فاکتورهای مودیان',
      bookLabel: 'مانده معین ۳۰۳۰۱',
      subLabel: 'خالص مالیات فاکتور فروش',
      a: rec.glSalesVat,
      b: rec.invSalesVat,
    },
    {
      label: 'مالیات ارزش افزوده خرید (معین ۳۰۳۰۲) در برابر فاکتورهای خرید',
      bookLabel: 'مانده معین ۳۰۳۰۲',
      subLabel: 'خالص مالیات فاکتور خرید',
      a: rec.glPurchaseVat,
      b: rec.invPurchaseVat,
    },
    {
      label: 'موجودی انبار نخ (معین ۱۰۵۰۱) در برابر ارزش ریالی کالاهای انبار',
      bookLabel: 'مانده معین ۱۰۵۰۱',
      subLabel: 'جمع (موجودی × بهای تمام‌شده کالاها)',
      a: rec.glInventory,
      b: rec.subInventory,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            مرکز حسابرسی هوشمند و کنترل یکپارچگی دفاتر
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            بررسی خودکار تراز اسناد، توالی شماره‌گذاری، معادله ترازنامه، تطبیق معین با تفصیلی، مالیات مودیان و کنترل‌های داخلی
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenSystemHealth && (
            <button
              type="button"
              onClick={onOpenSystemHealth}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950 whitespace-nowrap"
            >
              <Activity className="w-4 h-4" />
              <span>پایش کامل سلامت سیستم و آفلاین</span>
            </button>
          )}
          <button
            onClick={() => renumberVouchersChronologically()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ListOrdered className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>مرتب‌سازی و شماره‌گذاری مجدد اسناد</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>چاپ گزارش حسابرسی</span>
          </button>
        </div>
      </div>

      {/* Audit Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print-container">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">امتیاز سلامت حسابداری</span>
            <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="mt-2.5 text-2xl font-bold font-code tabular-nums text-slate-900 dark:text-white">
            {toPersianDigits(auditReport.score)}٪
          </div>
          <div className="mt-1 text-xs text-slate-500">
            بررسی‌شده روی {toPersianDigits(vouchers.length)} سند حسابداری
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">کنترل‌های تأییدشده</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold font-code tabular-nums text-emerald-700 dark:text-emerald-400">
            {toPersianDigits(auditReport.passedCount)} از {toPersianDigits(auditReport.checks.length)}
          </div>
          <div className="mt-1 text-xs text-slate-500">تطابق کامل ریاضی و قانونی</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">هشدارهای عملیاتی</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold font-code tabular-nums text-amber-700 dark:text-amber-400">
            {toPersianDigits(auditReport.warningCount)} مورد
          </div>
          <div className="mt-1 text-xs text-slate-500">نیازمند پیگیری حسابدار</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">خطاهای بحرانی تراز</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold font-code tabular-nums text-rose-700 dark:text-rose-400">
            {toPersianDigits(auditReport.errorCount)} خطا
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {auditReport.errorCount === 0 ? 'بدون خطای ریاضی در دفاتر' : 'نیازمند اصلاح فوری'}
          </div>
        </div>
      </div>

      {/* GL-to-Subsidiary & Tax Reconciliation Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            ماتریس تطبیق دفتر کل و معین با تفصیلی و سامانه مودیان
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                <th className="py-3 px-4 font-medium">محور تطبیق حسابرسی</th>
                <th className="py-3 px-4 font-medium text-left">مانده دفتر معین</th>
                <th className="py-3 px-4 font-medium text-left">مجموع تفصیلی / فاکتورها</th>
                <th className="py-3 px-4 font-medium text-left">اختلاف</th>
                <th className="py-3 px-4 font-medium">وضعیت تطبیق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reconciliationRows.map((row) => {
                const diff = row.a - row.b;
                const ok = Math.abs(diff) < 1;
                return (
                  <tr key={row.label}>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {row.label}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(row.a, unit)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(row.b, unit)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums font-semibold">
                      {ok ? '۰' : formatMoney(Math.abs(diff), unit)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={
                          ok
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-amber-700 dark:text-amber-400 font-semibold'
                        }
                      >
                        {ok ? 'تطبیق ۱۰۰٪ دقیق' : 'نیازمند بررسی اختلاف'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Audit Checklist */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            چک‌لیست کنترل‌های حسابرسی استاندارد هلو شرکتی
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {auditReport.checks.map((chk) => (
            <div
              key={chk.id}
              className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                {chk.status === 'pass' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : chk.status === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {chk.title}
                    </span>
                    <span className="text-[11px] text-slate-400">· {chk.category}</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        chk.status === 'pass'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : chk.status === 'warning'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      ·{' '}
                      {chk.status === 'pass'
                        ? 'تأیید‌شده'
                        : chk.status === 'warning'
                          ? 'هشدار'
                          : 'خطای بحرانی'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{chk.summary}</p>
                  {chk.details.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
                      {chk.details.map((d, idx) => (
                        <li key={idx} className="font-code">
                          • {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2 no-print">
                {chk.id === 'voucher-sequence' && chk.status !== 'pass' && (
                  <button
                    onClick={() => renumberVouchersChronologically()}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap"
                  >
                    مرتب‌سازی خودکار
                  </button>
                )}
                <button
                  onClick={() => onNavigate(chk.targetModule)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <span>بررسی در ماژول</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
