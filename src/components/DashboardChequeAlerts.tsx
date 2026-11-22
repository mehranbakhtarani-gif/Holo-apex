import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  EyeOff,
  Landmark,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import {
  ChequeAlertItem,
  computeChequeAlerts,
  formatChequeReminderText,
  useChequeAlertPreferences,
} from '../lib/chequeAlerts';
import {
  buildWhatsAppShareUrl,
  formatCompactMoney,
  formatMoney,
  toPersianDigits,
} from '../lib/format';
import { ActiveModule, ChequeDirection } from '../types/accounting';

interface DashboardChequeAlertsProps {
  onNavigate: (mod: ActiveModule, intent?: string, subKey?: string) => void;
}

const LEAD_DAY_OPTIONS = [3, 7, 14];

export const DashboardChequeAlerts: React.FC<DashboardChequeAlertsProps> = ({ onNavigate }) => {
  const {
    profile,
    cheques,
    accounts,
    trialBalance,
    parties,
    updateChequeStatus,
  } = useAccounting();

  const { prefs, setLeadDays, snoozeForToday, restoreAllSnoozed } = useChequeAlertPreferences();
  const [dirFilter, setDirFilter] = useState<'all' | ChequeDirection>('all');
  const [clearingChequeId, setClearingChequeId] = useState<string | null>(null);
  const [selectedBankCode, setSelectedBankCode] = useState<string>('10201');
  const [busyChequeId, setBusyChequeId] = useState<string | null>(null);

  const unit = profile.currencyUnit;

  const bankAccounts = useMemo(
    () =>
      accounts
        .filter((a) => a.level === 'moein' && a.code.startsWith('102'))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const summary = useMemo(
    () =>
      computeChequeAlerts({
        cheques,
        accounts,
        trialBalance,
        parties,
        leadDays: prefs.leadDays,
        snoozedMap: prefs.snoozedMap,
      }),
    [cheques, accounts, trialBalance, parties, prefs.leadDays, prefs.snoozedMap]
  );

  const visibleAlerts = useMemo(() => {
    if (dirFilter === 'all') return summary.urgentAlerts;
    return summary.urgentAlerts.filter((a) => a.cheque.direction === dirFilter);
  }, [summary.urgentAlerts, dirFilter]);

  const nextUpcomingOutsideWindow = useMemo(
    () => summary.allActiveAlerts.find((a) => a.severity === 'upcoming') ?? null,
    [summary.allActiveAlerts]
  );

  const handleDepositToBank = async (alert: ChequeAlertItem) => {
    setBusyChequeId(alert.cheque.id);
    try {
      await updateChequeStatus(alert.cheque.id, 'deposited');
    } finally {
      setBusyChequeId(null);
    }
  };

  const openInlineClear = (alert: ChequeAlertItem) => {
    setClearingChequeId(alert.cheque.id);
    setSelectedBankCode(alert.matchedBankCode || bankAccounts[0]?.code || '10201');
  };

  const handleConfirmClear = async (chequeId: string) => {
    setBusyChequeId(chequeId);
    try {
      await updateChequeStatus(chequeId, 'cleared', {
        bankAccountCode: selectedBankCode,
      });
      setClearingChequeId(null);
    } finally {
      setBusyChequeId(null);
    }
  };

  const hasCritical =
    summary.bouncedCount > 0 ||
    summary.overdueCount > 0 ||
    summary.dueTodayCount > 0 ||
    summary.bankShortfallForPayables > 0;

  const totalUrgentIncludingSnoozed =
    summary.urgentAlerts.length + summary.snoozedUrgentAlerts.length;

  const renderSeverityIndicator = (alert: ChequeAlertItem) => {
    if (alert.severity === 'bounced' || alert.severity === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400 whitespace-nowrap">
          <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
          <span>{alert.urgencyLabel}</span>
        </span>
      );
    }
    if (alert.severity === 'today') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{alert.urgencyLabel}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{alert.urgencyLabel}</span>
      </span>
    );
  };

  // All-Clear Compact State when zero cheques fall inside alert window
  if (totalUrgentIncludingSnoozed === 0) {
    return (
      <section
        aria-label="وضعیت هشدار هوشمند چک‌ها"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              هشدار هوشمند سررسید چک‌ها: بدون مورد ضروری در {toPersianDigits(summary.leadDays)} روز آینده
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              امروز {toPersianDigits(summary.todayShamsi)}
              {nextUpcomingOutsideWindow ? (
                <>
                  {' '}
                  · نزدیک‌ترین چک فعال بعدی:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {nextUpcomingOutsideWindow.cheque.partyName}
                  </span>{' '}
                  در تاریخ{' '}
                  <span className="font-code tabular-nums">
                    {toPersianDigits(nextUpcomingOutsideWindow.cheque.dueDate)}
                  </span>{' '}
                  ({nextUpcomingOutsideWindow.urgencyLabel})
                </>
              ) : (
                ' · تمامی چک‌های صیادی تسویه شده‌اند یا چک در جریانی ثبت نشده است.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {LEAD_DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setLeadDays(d)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  prefs.leadDays === d
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {toPersianDigits(d)} روزه
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('treasury', 'new-cheque', 'tr-cheques')}
            className="px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors whitespace-nowrap"
          >
            ثبت چک جدید
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="مرکز هشدار هوشمند چک‌های دریافتی و پرداختی"
      className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden ${
        hasCritical
          ? 'border-rose-300 dark:border-rose-900/70'
          : 'border-amber-300 dark:border-amber-900/70'
      }`}
    >
      {/* Top Alert Header & Filter Controls */}
      <div
        className={`px-5 py-4 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          hasCritical
            ? 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200/80 dark:border-rose-900/60'
            : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/50'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              hasCritical
                ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
            }`}
          >
            <BellRing className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              هشدار هوشمند سررسید چک‌های دریافتی و پرداختی ({toPersianDigits(summary.urgentAlerts.length)} اعلان ضروری)
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400 mt-1">
              <span>بازه پایش: از {toPersianDigits(summary.leadDays)} روز قبل از سررسید</span>
              <span aria-hidden="true">·</span>
              <span className="font-code tabular-nums">امروز {toPersianDigits(summary.todayShamsi)}</span>
              {summary.overdueCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    {toPersianDigits(summary.overdueCount)} معوق
                  </span>
                </>
              )}
              {summary.dueTodayCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    {toPersianDigits(summary.dueTodayCount)} سررسید امروز
                  </span>
                </>
              )}
              {summary.bouncedCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    {toPersianDigits(summary.bouncedCount)} برگشتی
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Controls: Direction Segmented Filter + Lookahead Horizon */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="فیلتر نوع چک"
            className="flex items-center gap-1 p-1 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {[
              { id: 'all', label: `همه (${toPersianDigits(summary.urgentAlerts.length)})` },
              {
                id: 'receivable',
                label: `دریافتی (${toPersianDigits(
                  summary.urgentAlerts.filter((a) => a.cheque.direction === 'receivable').length
                )})`,
              },
              {
                id: 'payable',
                label: `پرداختی (${toPersianDigits(
                  summary.urgentAlerts.filter((a) => a.cheque.direction === 'payable').length
                )})`,
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDirFilter(item.id as 'all' | ChequeDirection)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  dirFilter === item.id
                    ? 'bg-slate-900 dark:bg-teal-700 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="بازه روز هشدار"
            className="flex items-center gap-1 p-1 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {LEAD_DAY_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setLeadDays(days)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  prefs.leadDays === days
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {toPersianDigits(days)} روز
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Smart Liquidity & Cashflow Impact Strip */}
      <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="flex items-center justify-between md:justify-start gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>جمع دریافتی ضروری:</span>
          </span>
          <span className="font-code tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
            {formatCompactMoney(summary.urgentReceivableAmount, unit)}
          </span>
        </div>

        <div className="flex items-center justify-between md:justify-start gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>جمع پرداختی ضروری:</span>
          </span>
          <span className="font-code tabular-nums font-bold text-rose-700 dark:text-rose-400">
            {formatCompactMoney(summary.urgentPayableAmount, unit)}
          </span>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2">
          {summary.bankShortfallForPayables > 0 ? (
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                کسری بانکی پرداختی‌ها:{' '}
                <span className="font-code tabular-nums">
                  {formatCompactMoney(summary.bankShortfallForPayables, unit)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onNavigate('treasury', 'transfer', 'tr-transfer')}
                className="underline hover:text-rose-900 dark:hover:text-rose-300 whitespace-nowrap"
              >
                انتقال وجه
              </button>
            </div>
          ) : summary.urgentPayableAmount > 0 ? (
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                پوشش بانکی کافی ({formatCompactMoney(summary.totalBankBalance, unit)} موجودی بانک‌ها)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Landmark className="w-3.5 h-3.5 shrink-0" />
              <span>
                موجودی بانک‌ها:{' '}
                <strong className="font-code tabular-nums text-slate-900 dark:text-white">
                  {formatCompactMoney(summary.totalBankBalance, unit)}
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Actionable Urgent Cheques List */}
      {visibleAlerts.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {summary.snoozedUrgentAlerts.length > 0 && dirFilter === 'all' ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <span>
                همه {toPersianDigits(summary.snoozedUrgentAlerts.length)} اعلان ضروری تا فردا به تعویق افتاده‌اند.
              </span>
              <button
                type="button"
                onClick={restoreAllSnoozed}
                className="inline-flex items-center gap-1.5 font-semibold text-teal-700 dark:text-teal-400 hover:underline"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>نمایش مجدد اعلان‌ها</span>
              </button>
            </div>
          ) : (
            <span>در این فیلتر، چک ضروری ثبت نشده است.</span>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleAlerts.map((alert) => {
            const ch = alert.cheque;
            const isReceivable = ch.direction === 'receivable';
            const isClearing = clearingChequeId === ch.id;
            const isBusy = busyChequeId === ch.id;
            const waUrl = isReceivable
              ? buildWhatsAppShareUrl(
                  formatChequeReminderText(alert, profile.companyName, unit),
                  alert.partyPhone
                )
              : '';

            return (
              <div
                key={ch.id}
                className="px-5 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                  {/* Left/Primary Details */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {renderSeverityIndicator(alert)}
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`text-xs font-bold whitespace-nowrap ${
                          isReceivable
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {isReceivable ? 'چک دریافتی' : 'چک پرداختی'}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {ch.partyName}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-code tabular-nums">
                        سررسید: <strong className="text-slate-800 dark:text-slate-200">{toPersianDigits(ch.dueDate)}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {ch.bankName}
                        {ch.branch ? ` (${ch.branch})` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-code tabular-nums">
                        صیادی {toPersianDigits(ch.sayadiId)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        وضعیت:{' '}
                        {ch.status === 'in_box'
                          ? 'نزد صندوق'
                          : ch.status === 'deposited'
                            ? 'واگذار به بانک'
                            : 'برگشتی'}
                      </span>
                    </div>

                    <p
                      className={`text-xs ${
                        alert.bankSufficient === false || alert.severity === 'bounced'
                          ? 'text-rose-700 dark:text-rose-400 font-medium'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      توصیه هوشمند: {alert.recommendation}
                    </p>
                  </div>

                  {/* Right/Amount + Operational Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between xl:justify-end gap-3 shrink-0">
                    <div className="text-right sm:text-left">
                      <div className="text-sm font-bold font-code tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                        {formatMoney(ch.amount, unit)}
                      </div>
                      {!isReceivable && alert.matchedBankTitle && alert.matchedBankBalance !== undefined && (
                        <div
                          className={`text-[11px] font-code tabular-nums whitespace-nowrap ${
                            alert.bankSufficient
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400 font-semibold'
                          }`}
                        >
                          مانده {alert.matchedBankTitle}: {formatCompactMoney(alert.matchedBankBalance, unit)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {isReceivable && ch.status === 'in_box' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDepositToBank(alert)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          <Building2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                          <span>واگذاری به بانک</span>
                        </button>
                      )}

                      {(ch.status === 'in_box' || ch.status === 'deposited') && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            isClearing ? setClearingChequeId(null) : openInlineClear(alert)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isReceivable ? 'ثبت وصول' : 'ثبت پاس شدن'}</span>
                        </button>
                      )}

                      {isReceivable && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ارسال یادآوری سررسید چک در واتساپ"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>واتساپ</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => onNavigate('treasury', `cheque:${ch.id}`, 'tr-cheques')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        خزانه
                      </button>

                      <button
                        type="button"
                        onClick={() => snoozeForToday(ch.id, summary.todayShamsi)}
                        title="تعویق نمایش این اعلان تا فردا"
                        aria-label="تعویق نمایش این اعلان تا فردا"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Bank Confirmation Bar for 1-Click Cheque Clearing */}
                {isClearing && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {isReceivable
                          ? 'واریز مبلغ چک وصول‌شده به حساب بانک:'
                          : 'برداشت مبلغ چک پاس‌شده از حساب بانک:'}
                      </span>
                      <select
                        value={selectedBankCode}
                        onChange={(e) => setSelectedBankCode(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.code} — {b.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setClearingChequeId(null)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        انصراف
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleConfirmClear(ch.id)}
                        className="px-3.5 py-1.5 rounded-lg font-semibold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
                      >
                        تایید و صدور سند بانکی
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quiet Footer for Snoozed Alerts / Full Treasury Jump */}
      <div className="px-5 py-2.5 bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            جمع کل چک‌های فعال در جریان: {toPersianDigits(summary.allActiveAlerts.length)} فقره
          </span>
          {summary.snoozedUrgentAlerts.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={restoreAllSnoozed}
                className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-medium hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>
                  بازگردانی {toPersianDigits(summary.snoozedUrgentAlerts.length)} اعلان به تعویق‌افتاده
                </span>
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => onNavigate('treasury', 'cheques', 'tr-cheques')}
          className="font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
        >
          مدیریت کامل چک‌های صیادی و راس‌گیری ←
        </button>
      </div>
    </section>
  );
};
