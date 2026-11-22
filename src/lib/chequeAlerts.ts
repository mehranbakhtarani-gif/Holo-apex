import { useCallback, useEffect, useState } from 'react';
import { Account, Cheque, CurrencyUnit, Party, TrialBalanceRow } from '../types/accounting';
import { formatMoney, getTodayShamsi, toPersianDigits } from './format';

export type ChequeAlertSeverity = 'bounced' | 'overdue' | 'today' | 'urgent' | 'upcoming';

export interface ChequeAlertItem {
  cheque: Cheque;
  daysRemaining: number; // <0 overdue, 0 today, 1..leadDays urgent, >leadDays upcoming
  severity: ChequeAlertSeverity;
  urgencyLabel: string;
  recommendation: string;
  matchedBankCode?: string;
  matchedBankTitle?: string;
  matchedBankBalance?: number;
  bankSufficient?: boolean;
  partyPhone?: string;
  isSnoozed: boolean;
}

export interface ChequeAlertSummary {
  todayShamsi: string;
  leadDays: number;
  allActiveAlerts: ChequeAlertItem[];
  urgentAlerts: ChequeAlertItem[]; // visible urgent (not snoozed): bounced, overdue, today, 1..leadDays
  snoozedUrgentAlerts: ChequeAlertItem[];
  receivableUrgentCount: number;
  payableUrgentCount: number;
  overdueCount: number;
  dueTodayCount: number;
  bouncedCount: number;
  urgentReceivableAmount: number;
  urgentPayableAmount: number;
  netUrgentCashflow: number;
  totalBankBalance: number;
  totalLiquidBalance: number;
  bankShortfallForPayables: number; // >0 means banks don't cover urgent payable cheques
}

const PERSIAN_TO_ASCII: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const JALALI_LEAP_REMAINDERS = new Set([1, 5, 9, 13, 17, 22, 26, 30]);

export function isJalaliLeapYear(year: number): boolean {
  const mod = ((year % 33) + 33) % 33;
  return JALALI_LEAP_REMAINDERS.has(mod);
}

export function getJalaliMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeapYear(year) ? 30 : 29;
}

export function parseShamsiDate(input: string): { year: number; month: number; day: number } | null {
  if (!input) return null;
  const ascii = input
    .trim()
    .replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_TO_ASCII[ch] ?? ch)
    .replace(/[-.]/g, '/');
  const parts = ascii.split('/').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  if (year < 1200 || year > 1600 || month < 1 || month > 12) return null;
  const maxDay = getJalaliMonthLength(year, month);
  if (day < 1 || day > maxDay) return null;
  return { year, month, day };
}

/**
 * Exact monotonic day counter since 1300/01/01 SH (accurate across all Persian leap years 1244-1472 SH).
 */
export function shamsiToExactDayNumber(dateStr: string): number | null {
  const parsed = parseShamsiDate(dateStr);
  if (!parsed) return null;
  const { year, month, day } = parsed;
  let total = 0;
  if (year >= 1300) {
    for (let y = 1300; y < year; y++) {
      total += isJalaliLeapYear(y) ? 366 : 365;
    }
  } else {
    for (let y = year; y < 1300; y++) {
      total -= isJalaliLeapYear(y) ? 366 : 365;
    }
  }
  for (let m = 1; m < month; m++) {
    total += getJalaliMonthLength(year, m);
  }
  return total + (day - 1);
}

export function exactDayNumberToShamsi(dayNum: number): string {
  let year = 1300;
  let rem = Math.round(dayNum);

  if (rem >= 0) {
    while (true) {
      const yLen = isJalaliLeapYear(year) ? 366 : 365;
      if (rem < yLen) break;
      rem -= yLen;
      year += 1;
    }
  } else {
    while (rem < 0) {
      year -= 1;
      rem += isJalaliLeapYear(year) ? 366 : 365;
    }
  }

  let month = 1;
  while (month <= 12) {
    const mLen = getJalaliMonthLength(year, month);
    if (rem < mLen) break;
    rem -= mLen;
    month += 1;
  }

  const day = rem + 1;
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

export function addDaysToShamsi(baseDate: string, deltaDays: number): string {
  const baseNum = shamsiToExactDayNumber(baseDate);
  if (baseNum === null) return baseDate;
  return exactDayNumberToShamsi(baseNum + deltaDays);
}

/**
 * Returns (targetDate - referenceDate) in exact calendar days.
 * Negative = overdue, 0 = due today, 1..3 = due within 3 days.
 */
export function diffShamsiDays(targetDate: string, referenceDate?: string): number | null {
  const ref = referenceDate ?? getTodayShamsi();
  const tNum = shamsiToExactDayNumber(targetDate);
  const rNum = shamsiToExactDayNumber(ref);
  if (tNum === null || rNum === null) return null;
  return tNum - rNum;
}

function normalizeForMatch(text: string): string {
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeChequeAlerts(params: {
  cheques: Cheque[];
  accounts: Account[];
  trialBalance: TrialBalanceRow[];
  parties: Party[];
  leadDays?: number;
  todayShamsi?: string;
  snoozedMap?: Record<string, string>;
}): ChequeAlertSummary {
  const leadDays = Math.max(1, params.leadDays ?? 3);
  const todayShamsi = params.todayShamsi ?? getTodayShamsi();
  const snoozedMap = params.snoozedMap ?? {};

  const balanceMap = new Map<string, number>();
  let totalBankBalance = 0;
  let totalLiquidBalance = 0;
  for (const row of params.trialBalance) {
    const net = row.balanceDebit - row.balanceCredit;
    balanceMap.set(row.accountCode, net);
    if (row.accountCode.startsWith('102')) {
      totalBankBalance += net;
      totalLiquidBalance += net;
    } else if (row.accountCode.startsWith('101')) {
      totalLiquidBalance += net;
    }
  }

  const bankAccounts = params.accounts.filter(
    (a) => (a.level === 'moein' || a.level === 'tafsili') && a.code.startsWith('102')
  );
  const partyPhoneMap = new Map<string, string>();
  params.parties.forEach((p) => {
    if (p.phone) partyPhoneMap.set(p.id, p.phone);
  });

  const activeCheques = params.cheques.filter(
    (c) => c.status === 'in_box' || c.status === 'deposited' || c.status === 'bounced'
  );

  const allActiveAlerts: ChequeAlertItem[] = [];

  for (const ch of activeCheques) {
    const diff = diffShamsiDays(ch.dueDate, todayShamsi);
    const daysRemaining = diff ?? 999;

    let severity: ChequeAlertSeverity;
    let urgencyLabel: string;

    if (ch.status === 'bounced') {
      severity = 'bounced';
      urgencyLabel = 'چک برگشتی — پیگیری فوری';
    } else if (daysRemaining < 0) {
      severity = 'overdue';
      urgencyLabel = `سررسید گذشته (${toPersianDigits(Math.abs(daysRemaining))} روز تاخیر)`;
    } else if (daysRemaining === 0) {
      severity = 'today';
      urgencyLabel = 'سررسید امروز';
    } else if (daysRemaining <= leadDays) {
      severity = 'urgent';
      urgencyLabel =
        daysRemaining === 1
          ? 'فردا (۱ روز مانده)'
          : `${toPersianDigits(daysRemaining)} روز مانده تا سررسید`;
    } else {
      severity = 'upcoming';
      urgencyLabel = `${toPersianDigits(daysRemaining)} روز دیگر`;
    }

    // Match payable cheque's bank name to a GL 102xx bank account for real-time coverage intelligence
    let matchedBankCode: string | undefined;
    let matchedBankTitle: string | undefined;
    let matchedBankBalance: number | undefined;
    let bankSufficient: boolean | undefined;

    if (ch.direction === 'payable') {
      const normBank = normalizeForMatch(ch.bankName);
      const matched =
        bankAccounts.find((b) => normalizeForMatch(b.title).includes(normBank)) ?? bankAccounts[0];
      if (matched) {
        matchedBankCode = matched.code;
        matchedBankTitle = matched.title.split('—')[0].trim();
        matchedBankBalance = balanceMap.get(matched.code) ?? 0;
        bankSufficient = matchedBankBalance >= ch.amount;
      }
    }

    let recommendation: string;
    if (ch.status === 'bounced') {
      recommendation =
        ch.direction === 'receivable'
          ? 'برگشتی ثبت شده؛ با صادرکننده جهت جایگزینی یا تسویه نقدی تماس بگیرید.'
          : 'چک پرداختی برگشت خورده؛ جهت رفع سوءاثر صیادی فوراً اقدام کنید.';
    } else if (ch.direction === 'receivable') {
      if (ch.status === 'in_box') {
        recommendation =
          daysRemaining <= 0
            ? 'چک هنوز نزد صندوق است؛ امروز جهت وصول به بانک واگذار یا تعیین تکلیف کنید.'
            : 'چک نزد صندوق است؛ جهت ثبت به‌موقع در چکاوک به بانک واگذار شود.';
      } else {
        recommendation =
          daysRemaining <= 0
            ? 'واگذارشده به بانک است؛ وضعیت وصول را استعلام و در سیستم پاس کنید.'
            : 'در جریان وصول نزد بانک است؛ یادآوری دوستانه به مشتری توصیه می‌شود.';
      }
    } else {
      // Payable cheque
      if (bankSufficient === false && matchedBankTitle) {
        recommendation = `موجودی ${matchedBankTitle} برای پاس شدن این چک کافی نیست؛ فوراً انتقال وجه انجام دهید.`;
      } else if (matchedBankTitle) {
        recommendation =
          daysRemaining <= 0
            ? `موجودی ${matchedBankTitle} کافی است؛ پس از برداشت بانکی وضعیت چک را پاس ثبت کنید.`
            : `موجودی ${matchedBankTitle} کافی است؛ از ثبت تایید صیادی و حفظ مانده حساب مطمئن شوید.`;
      } else {
        recommendation = 'چک پرداختی در آستانه سررسید است؛ موجودی حساب بانکی را کنترل کنید.';
      }
    }

    const isSnoozed = snoozedMap[ch.id] === todayShamsi;

    allActiveAlerts.push({
      cheque: ch,
      daysRemaining,
      severity,
      urgencyLabel,
      recommendation,
      matchedBankCode,
      matchedBankTitle,
      matchedBankBalance,
      bankSufficient,
      partyPhone: partyPhoneMap.get(ch.partyId),
      isSnoozed,
    });
  }

  const severityRank: Record<ChequeAlertSeverity, number> = {
    bounced: 0,
    overdue: 1,
    today: 2,
    urgent: 3,
    upcoming: 4,
  };

  allActiveAlerts.sort((a, b) => {
    const sDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sDiff !== 0) return sDiff;
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    return b.cheque.amount - a.cheque.amount;
  });

  const allUrgent = allActiveAlerts.filter((a) => a.severity !== 'upcoming');
  const urgentAlerts = allUrgent.filter((a) => !a.isSnoozed);
  const snoozedUrgentAlerts = allUrgent.filter((a) => a.isSnoozed);

  const urgentReceivableAmount = allUrgent
    .filter((a) => a.cheque.direction === 'receivable')
    .reduce((s, a) => s + a.cheque.amount, 0);
  const urgentPayableAmount = allUrgent
    .filter((a) => a.cheque.direction === 'payable')
    .reduce((s, a) => s + a.cheque.amount, 0);

  return {
    todayShamsi,
    leadDays,
    allActiveAlerts,
    urgentAlerts,
    snoozedUrgentAlerts,
    receivableUrgentCount: allUrgent.filter((a) => a.cheque.direction === 'receivable').length,
    payableUrgentCount: allUrgent.filter((a) => a.cheque.direction === 'payable').length,
    overdueCount: allUrgent.filter((a) => a.severity === 'overdue').length,
    dueTodayCount: allUrgent.filter((a) => a.severity === 'today').length,
    bouncedCount: allUrgent.filter((a) => a.severity === 'bounced').length,
    urgentReceivableAmount,
    urgentPayableAmount,
    netUrgentCashflow: urgentReceivableAmount - urgentPayableAmount,
    totalBankBalance,
    totalLiquidBalance,
    bankShortfallForPayables: Math.max(0, urgentPayableAmount - totalBankBalance),
  };
}

export function formatChequeReminderText(
  alert: ChequeAlertItem,
  companyName: string,
  unit: CurrencyUnit
): string {
  const ch = alert.cheque;
  const dueText =
    alert.daysRemaining < 0
      ? `با ${toPersianDigits(Math.abs(alert.daysRemaining))} روز تاخیر از سررسید ${toPersianDigits(ch.dueDate)}`
      : alert.daysRemaining === 0
        ? `به سررسید امروز (${toPersianDigits(ch.dueDate)})`
        : `به سررسید ${toPersianDigits(ch.dueDate)} (${alert.urgencyLabel})`;

  return [
    `با سلام و احترام خدمت ${ch.partyName}`,
    `از طرف امور مالی ${companyName}، یادآوری می‌گردد چک صیادی دریافتی به مشخصات زیر ${dueText} نزدیک به موعد وصول می‌باشد:`,
    `• شناسه صیادی: ${toPersianDigits(ch.sayadiId)}`,
    `• شماره سریال: ${toPersianDigits(ch.serial)}`,
    `• بانک: ${ch.bankName}${ch.branch ? ` (${ch.branch})` : ''}`,
    `• مبلغ چک: ${formatMoney(ch.amount, unit)}`,
    'خواهشمند است جهت تامین موجودی و تایید ثبت صیادی اقدام فرمایید. با تشکر.',
  ].join('\n');
}

// Local persisted preferences for smart alert lead days (default: 3 days) & daily snooze
const PREFS_STORAGE_KEY = 'holoo_apex_cheque_alerts_v1';
const PREFS_EVENT = 'holoo-cheque-alert-prefs-changed';

export interface ChequeAlertPrefs {
  leadDays: number;
  snoozedMap: Record<string, string>; // chequeId -> Shamsi date snoozed
}

const DEFAULT_PREFS: ChequeAlertPrefs = {
  leadDays: 3,
  snoozedMap: {},
};

export function loadChequeAlertPrefs(): ChequeAlertPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ChequeAlertPrefs>;
    return {
      leadDays:
        typeof parsed.leadDays === 'number' && parsed.leadDays >= 1 && parsed.leadDays <= 30
          ? Math.round(parsed.leadDays)
          : 3,
      snoozedMap:
        parsed.snoozedMap && typeof parsed.snoozedMap === 'object' ? parsed.snoozedMap : {},
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveChequeAlertPrefs(next: ChequeAlertPrefs): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
  } catch {
    // Ignore storage quota errors in private mode
  }
}

export function useChequeAlertPreferences() {
  const [prefs, setPrefs] = useState<ChequeAlertPrefs>(() => loadChequeAlertPrefs());

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<ChequeAlertPrefs>;
      if (custom.detail) setPrefs(custom.detail);
      else setPrefs(loadChequeAlertPrefs());
    };
    window.addEventListener(PREFS_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(PREFS_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setLeadDays = useCallback((days: number) => {
    const current = loadChequeAlertPrefs();
    const next: ChequeAlertPrefs = { ...current, leadDays: Math.max(1, Math.min(30, days)) };
    setPrefs(next);
    saveChequeAlertPrefs(next);
  }, []);

  const snoozeForToday = useCallback((chequeId: string, todayShamsi?: string) => {
    const today = todayShamsi ?? getTodayShamsi();
    const current = loadChequeAlertPrefs();
    const next: ChequeAlertPrefs = {
      ...current,
      snoozedMap: { ...current.snoozedMap, [chequeId]: today },
    };
    setPrefs(next);
    saveChequeAlertPrefs(next);
  }, []);

  const restoreAllSnoozed = useCallback(() => {
    const current = loadChequeAlertPrefs();
    const next: ChequeAlertPrefs = { ...current, snoozedMap: {} };
    setPrefs(next);
    saveChequeAlertPrefs(next);
  }, []);

  return { prefs, setLeadDays, snoozeForToday, restoreAllSnoozed };
}
