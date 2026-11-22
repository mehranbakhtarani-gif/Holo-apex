import { CurrencyUnit } from '../types/accounting';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatMoney(amount: number, unit: CurrencyUnit = 'IRT', showUnit = true): string {
  const value = unit === 'IRT' ? Math.round(amount / 10) : Math.round(amount);
  const absFormatted = Math.abs(value).toLocaleString('en-US');
  const sign = value < 0 ? '-' : '';
  const unitText = showUnit ? (unit === 'IRT' ? ' تومان' : ' ریال') : '';
  return `${sign}${toPersianDigits(absFormatted)}${unitText}`;
}

export function formatCompactMoney(amount: number, unit: CurrencyUnit = 'IRT'): string {
  const value = unit === 'IRT' ? amount / 10 : amount;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const suffix = unit === 'IRT' ? 'تومان' : 'ریال';
  if (abs >= 1_000_000_000) {
    return `${sign}${toPersianDigits((abs / 1_000_000_000).toFixed(2))} میلیارد ${suffix}`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${toPersianDigits((abs / 1_000_000).toFixed(1))} میلیون ${suffix}`;
  }
  return formatMoney(amount, unit, true);
}

export function formatNumber(n: number): string {
  return toPersianDigits(Math.round(n).toLocaleString('en-US'));
}

/**
 * Formats weights in kilograms with up to 2 decimals cleanly in Persian digits (e.g. 248.5 -> ۲۴۸٫۵, 1200 -> ۱,۲۰۰)
 */
export function formatWeight(kg: number): string {
  if (!Number.isFinite(kg)) return '۰';
  const rounded = Math.round(kg * 100) / 100;
  const isInt = Math.abs(rounded - Math.round(rounded)) < 0.001;
  if (isInt) {
    return toPersianDigits(Math.round(rounded).toLocaleString('en-US'));
  }
  const [intPart, decPart] = rounded.toFixed(2).replace(/0+$/, '').split('.');
  return `${toPersianDigits(Number(intPart).toLocaleString('en-US'))}٫${toPersianDigits(decPart)}`;
}

const PERSIAN_ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const PERSIAN_TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];
const PERSIAN_TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const PERSIAN_HUNDREDS = [
  '',
  'یکصد',
  'دویست',
  'سیصد',
  'چهارصد',
  'پانصد',
  'ششصد',
  'هفتصد',
  'هشتصد',
  'نهصد',
];
const PERSIAN_SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function threeDigitsToPersian(num: number): string {
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rem = num % 100;
  if (h > 0) parts.push(PERSIAN_HUNDREDS[h]);
  if (rem >= 10 && rem <= 19) {
    parts.push(PERSIAN_TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(PERSIAN_TENS[t]);
    if (o > 0) parts.push(PERSIAN_ONES[o]);
  }
  return parts.join(' و ');
}

/**
 * Converts a monetary amount (stored internally in IRR) into formal Persian words (حروف فارسی)
 */
export function numberToPersianWords(amountIrr: number, unit: CurrencyUnit = 'IRT'): string {
  const value = unit === 'IRT' ? Math.round(amountIrr / 10) : Math.round(amountIrr);
  const suffix = unit === 'IRT' ? 'تومان' : 'ریال';
  if (!Number.isFinite(value) || value === 0) return `صفر ${suffix}`;

  const isNegative = value < 0;
  let remaining = Math.abs(Math.trunc(value));
  const groups: string[] = [];
  let scaleIdx = 0;

  while (remaining > 0 && scaleIdx < PERSIAN_SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigitsToPersian(chunk);
      const scale = PERSIAN_SCALES[scaleIdx];
      groups.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx += 1;
  }

  return `${isNegative ? 'منفی ' : ''}${groups.join(' و ')} ${suffix}`;
}

/**
 * Normalizes an Iranian mobile number (e.g. 09123456789 or ۰۹۱۲...) to E.164 digits without + (989123456789) for wa.me
 */
export function normalizeIranianPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  const ascii = phone.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  const digits = ascii.replace(/\D/g, '');
  if (digits.startsWith('09') && digits.length === 11) {
    return `98${digits.slice(1)}`;
  }
  if (digits.startsWith('989') && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith('00989') && digits.length === 14) {
    return digits.slice(2);
  }
  return '';
}

export function buildWhatsAppShareUrl(text: string, phone?: string): string {
  const normalizedPhone = normalizeIranianPhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(text);
  return normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function buildTelegramShareUrl(text: string): string {
  // Telegram share supports text alongside a compact url/subject cleanly inside anchor links
  return `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`;
}

export function formatInvoiceShareText(params: {
  companyName: string;
  invoiceNumber: string;
  invoiceTypeLabel: string;
  date: string;
  partyName: string;
  warehouse: string;
  items: {
    productName: string;
    quantity: number;
    unit: string;
    cartonCount?: number;
    secondaryUnit?: string;
    bobbinCount?: number;
    bobbinUnit?: string;
    unitPrice: number;
    lineTotal: number;
    foreignUnitPrice?: number;
    foreignLineTotal?: number;
    lotNumber?: string;
  }[];
  subtotal: number;
  discount: number;
  vatAmount: number;
  grandTotal: number;
  creditAmount: number;
  unit: CurrencyUnit;
  currencyCode?: string;
  exchangeRate?: number;
  foreignGrandTotal?: number;
  bankInfo?: string;
  partyCurrentBalance?: number;
}): string {
  const totalKg = params.items.reduce((s, it) => s + it.quantity, 0);
  const totalCartons = params.items.reduce((s, it) => s + (it.cartonCount ?? 0), 0);
  const isFx = Boolean(params.currencyCode && params.currencyCode !== 'IRR' && params.exchangeRate);

  const lines: string[] = [
    `${params.companyName}`,
    `${params.invoiceTypeLabel} — شماره: ${params.invoiceNumber}`,
    `تاریخ: ${toPersianDigits(params.date)}`,
    `طرف‌حساب: ${params.partyName}`,
    `انبار تحویل: ${params.warehouse}`,
  ];

  if (isFx && params.currencyCode && params.exchangeRate) {
    lines.push(
      `ارز فاکتور: ${params.currencyCode} | نرخ برابری روز: ${formatMoney(params.exchangeRate, params.unit)}`
    );
  }

  lines.push('-------------------------', 'اقلام فاکتور:');

  params.items.forEach((it, idx) => {
    const packParts: string[] = [];
    if (it.cartonCount && it.cartonCount > 0) {
      packParts.push(`${formatWeight(it.cartonCount)} ${it.secondaryUnit || 'کارتن'}`);
    }
    if (it.bobbinCount && it.bobbinCount > 0) {
      packParts.push(`${formatNumber(it.bobbinCount)} ${it.bobbinUnit || 'بوبین'}`);
    }
    packParts.push(`${formatWeight(it.quantity)} ${it.unit}`);
    const lotStr = it.lotNumber ? ` (لات ${it.lotNumber})` : '';
    const priceStr =
      isFx && it.foreignUnitPrice !== undefined && it.foreignLineTotal !== undefined && params.currencyCode
        ? `× فی ${toPersianDigits(it.foreignUnitPrice.toFixed(2))} ${params.currencyCode} = ${toPersianDigits(it.foreignLineTotal.toFixed(2))} ${params.currencyCode} (معادل ${formatMoney(it.lineTotal, params.unit)})`
        : `× فی ${formatMoney(it.unitPrice, params.unit)} = ${formatMoney(it.lineTotal, params.unit)}`;
    lines.push(
      `${toPersianDigits(idx + 1)}. ${it.productName}${lotStr}`,
      `   مقدار: ${packParts.join(' | ')} ${priceStr}`
    );
  });

  lines.push('-------------------------');
  lines.push(
    `جمع وزن: ${formatWeight(totalKg)} کیلوگرم${totalCartons > 0 ? ` (${formatWeight(totalCartons)} کارتن/عدل)` : ''}`
  );
  if (params.discount > 0) {
    lines.push(`تخفیف: ${formatMoney(params.discount, params.unit)}`);
  }
  if (params.vatAmount > 0) {
    lines.push(`مالیات ارزش افزوده (۱۰٪): ${formatMoney(params.vatAmount, params.unit)}`);
  }
  if (isFx && params.foreignGrandTotal !== undefined && params.currencyCode) {
    lines.push(
      `جمع کل ارزی: ${toPersianDigits(params.foreignGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ${params.currencyCode}`
    );
  }
  lines.push(`مبلغ قابل پرداخت (معادل ریالی/تومانی): ${formatMoney(params.grandTotal, params.unit)}`);
  lines.push(`به حروف: ${numberToPersianWords(params.grandTotal, params.unit)}`);
  if (params.creditAmount > 0) {
    lines.push(`مانده نسیه این فاکتور: ${formatMoney(params.creditAmount, params.unit)}`);
  }
  if (typeof params.partyCurrentBalance === 'number') {
    const statusText =
      params.partyCurrentBalance === 0
        ? 'تسویه'
        : params.partyCurrentBalance > 0
          ? 'بدهکار'
          : 'بستانکار';
    lines.push(
      `مانده کل حساب طرف‌حساب: ${formatMoney(Math.abs(params.partyCurrentBalance), params.unit)} (${statusText})`
    );
  }
  if (params.bankInfo) {
    lines.push('-------------------------', `اطلاعات واریز: ${params.bankInfo}`);
  }

  return lines.join('\n');
}

export function formatPartyStatementShareText(params: {
  companyName: string;
  fiscalYear: string;
  partyName: string;
  partyCode: string;
  currentBalance: number;
  entries: {
    date: string;
    voucherNumber: number;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }[];
  unit: CurrencyUnit;
  bankInfo?: string;
}): string {
  const statusText =
    params.currentBalance === 0 ? 'تسویه' : params.currentBalance > 0 ? 'بدهکار' : 'بستانکار';
  const lines: string[] = [
    `${params.companyName}`,
    `صورتحساب تفصیلی طرف‌حساب (سال مالی ${toPersianDigits(params.fiscalYear)})`,
    `طرف‌حساب: ${params.partyName} (کد ${toPersianDigits(params.partyCode)})`,
    `تاریخ گزارش: ${toPersianDigits(getTodayShamsi())}`,
    '-------------------------',
    `مانده فعلی حساب: ${formatMoney(Math.abs(params.currentBalance), params.unit)} (${statusText})`,
    `به حروف: ${numberToPersianWords(Math.abs(params.currentBalance), params.unit)}`,
  ];

  const recent = params.entries.slice(-6);
  if (recent.length > 0) {
    lines.push('-------------------------', `آخرین ${toPersianDigits(recent.length)} گردش حساب:`);
    recent.forEach((e) => {
      const side = e.debit > 0 ? `بدهکار ${formatMoney(e.debit, params.unit)}` : `بستانکار ${formatMoney(e.credit, params.unit)}`;
      lines.push(`• ${toPersianDigits(e.date)} (سند #${toPersianDigits(e.voucherNumber)}): ${e.description} — ${side}`);
    });
  }

  if (params.bankInfo) {
    lines.push('-------------------------', `اطلاعات حساب بانکی جهت واریز: ${params.bankInfo}`);
  }
  return lines.join('\n');
}

export function getTodayShamsi(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '1405';
    const m = parts.find((p) => p.type === 'month')?.value ?? '08';
    const d = parts.find((p) => p.type === 'day')?.value ?? '30';
    return `${y}/${m}/${d}`;
  } catch {
    return '1405/08/30';
  }
}

/**
 * Converts a Shamsi YYYY/MM/DD string into an approximate monotonic day index for cheque averaging (راس‌گیری)
 */
export function shamsiToDayIndex(shamsiDate: string): number {
  const parts = shamsiDate.split('/').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  const [year, month, day] = parts;
  const monthDays =
    month <= 6
      ? (month - 1) * 31
      : 6 * 31 + (month - 7) * 30;
  return year * 365 + monthDays + day;
}

export function dayIndexToShamsi(dayIndex: number): string {
  const year = Math.floor(dayIndex / 365);
  let rem = Math.max(1, Math.round(dayIndex - year * 365));
  let month = 1;
  while (month <= 12) {
    const len = month <= 6 ? 31 : month <= 11 ? 30 : 29;
    if (rem <= len) break;
    rem -= len;
    month++;
  }
  return `${year}/${String(Math.min(12, month)).padStart(2, '0')}/${String(Math.max(1, rem)).padStart(2, '0')}`;
}

export interface RasGiriResult {
  totalAmount: number;
  weightedDaysFromBase: number;
  averageDueDate: string;
}

export function calculateChequeRasGiri(
  items: { amount: number; dueDate: string }[],
  baseDate: string
): RasGiriResult {
  const baseIdx = shamsiToDayIndex(baseDate);
  const totalAmount = items.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  if (totalAmount === 0) {
    return { totalAmount: 0, weightedDaysFromBase: 0, averageDueDate: baseDate };
  }
  const weightedSum = items.reduce((sum, item) => {
    const diff = shamsiToDayIndex(item.dueDate) - baseIdx;
    return sum + diff * Math.max(0, item.amount);
  }, 0);
  const weightedDaysFromBase = Math.round(weightedSum / totalAmount);
  const averageDueDate = dayIndexToShamsi(baseIdx + weightedDaysFromBase);
  return { totalAmount, weightedDaysFromBase, averageDueDate };
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (cell: string | number) => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`;
}

