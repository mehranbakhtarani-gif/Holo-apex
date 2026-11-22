import {
  CurrencyDefinition,
  CurrencyUnit,
  ExchangeRateEntry,
  ExchangeRateType,
  VoucherLine,
} from '../types/accounting';
import { formatMoney, toPersianDigits } from './format';

export const BASE_CURRENCY_CODE = 'IRR';

export const RATE_TYPE_LABELS: Record<ExchangeRateType, string> = {
  market: 'بازار آزاد',
  exchange_center: 'مرکز مبادله ارز و طلا',
  nima: 'حواله / نیما',
  agreed: 'نرخ توافقی',
};

export function normalizeCurrencyCode(code?: string): string {
  const clean = (code || BASE_CURRENCY_CODE).trim().toUpperCase();
  return clean || BASE_CURRENCY_CODE;
}

export function isForeignCurrency(code?: string): boolean {
  return normalizeCurrencyCode(code) !== BASE_CURRENCY_CODE;
}

export function roundCurrency(amount: number, decimalPlaces = 2): number {
  const factor = Math.pow(10, Math.max(0, Math.min(4, decimalPlaces)));
  return Math.round((Number(amount) || 0) * factor) / factor;
}

export function convertForeignToIrr(foreignAmount: number, rateToIrr: number): number {
  const f = Number(foreignAmount) || 0;
  const r = Number(rateToIrr) || 0;
  if (f === 0 || r <= 0) return 0;
  return Math.round(f * r);
}

export function convertIrrToForeign(
  irrAmount: number,
  rateToIrr: number,
  decimalPlaces = 2
): number {
  const irr = Number(irrAmount) || 0;
  const r = Number(rateToIrr) || 0;
  if (irr === 0 || r <= 0) return 0;
  return roundCurrency(irr / r, decimalPlaces);
}

export interface EffectiveExchangeRateResult {
  currencyCode: string;
  rateToIrr: number;
  rateDate: string | null;
  rateType: ExchangeRateType | 'default' | 'base';
  isExactDate: boolean;
}

/**
 * Resolves the effective daily exchange rate (in IRR per 1 unit of foreign currency)
 * for a given currency and Shamsi date YYYY/MM/DD:
 *  1. Base currency (IRR) always returns 1.
 *  2. Exact match on `shamsiDate` if recorded.
 *  3. Most recent rate on or before `shamsiDate`.
 *  4. Most recent recorded rate for that currency.
 *  5. Currency definition's `defaultRateToIrr`.
 */
export function getEffectiveExchangeRate(
  currencyCode: string | undefined,
  shamsiDate: string,
  exchangeRates: ExchangeRateEntry[],
  currencies: CurrencyDefinition[]
): EffectiveExchangeRateResult {
  const code = normalizeCurrencyCode(currencyCode);
  const def = currencies.find((c) => normalizeCurrencyCode(c.code) === code);

  if (code === BASE_CURRENCY_CODE || def?.isBase) {
    return {
      currencyCode: BASE_CURRENCY_CODE,
      rateToIrr: 1,
      rateDate: shamsiDate,
      rateType: 'base',
      isExactDate: true,
    };
  }

  const matching = exchangeRates
    .filter((r) => normalizeCurrencyCode(r.currencyCode) === code && r.rateToIrr > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const exact = matching.find((r) => r.date === shamsiDate);
  if (exact) {
    return {
      currencyCode: code,
      rateToIrr: exact.rateToIrr,
      rateDate: exact.date,
      rateType: exact.rateType,
      isExactDate: true,
    };
  }

  const onOrBefore = matching.find((r) => r.date <= shamsiDate);
  if (onOrBefore) {
    return {
      currencyCode: code,
      rateToIrr: onOrBefore.rateToIrr,
      rateDate: onOrBefore.date,
      rateType: onOrBefore.rateType,
      isExactDate: false,
    };
  }

  if (matching.length > 0) {
    return {
      currencyCode: code,
      rateToIrr: matching[0].rateToIrr,
      rateDate: matching[0].date,
      rateType: matching[0].rateType,
      isExactDate: false,
    };
  }

  return {
    currencyCode: code,
    rateToIrr: def?.defaultRateToIrr && def.defaultRateToIrr > 0 ? def.defaultRateToIrr : 1,
    rateDate: null,
    rateType: 'default',
    isExactDate: false,
  };
}

export interface CurrencyRateSnapshot {
  currency: CurrencyDefinition;
  latestRateToIrr: number;
  latestDate: string | null;
  latestRateType: ExchangeRateType | 'default' | 'base';
  previousRateToIrr: number | null;
  deltaIrr: number | null;
  deltaPercent: number | null;
  historyCount: number;
}

export function getCurrencyRateSnapshot(
  currency: CurrencyDefinition,
  exchangeRates: ExchangeRateEntry[]
): CurrencyRateSnapshot {
  if (currency.isBase || normalizeCurrencyCode(currency.code) === BASE_CURRENCY_CODE) {
    return {
      currency,
      latestRateToIrr: 1,
      latestDate: null,
      latestRateType: 'base',
      previousRateToIrr: null,
      deltaIrr: null,
      deltaPercent: null,
      historyCount: 0,
    };
  }

  const code = normalizeCurrencyCode(currency.code);
  const matching = exchangeRates
    .filter((r) => normalizeCurrencyCode(r.currencyCode) === code && r.rateToIrr > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (matching.length === 0) {
    return {
      currency,
      latestRateToIrr: currency.defaultRateToIrr,
      latestDate: null,
      latestRateType: 'default',
      previousRateToIrr: null,
      deltaIrr: null,
      deltaPercent: null,
      historyCount: 0,
    };
  }

  const latest = matching[0];
  const prev = matching.length > 1 ? matching[1] : null;
  const deltaIrr = prev ? latest.rateToIrr - prev.rateToIrr : null;
  const deltaPercent =
    prev && prev.rateToIrr > 0
      ? Number((((latest.rateToIrr - prev.rateToIrr) / prev.rateToIrr) * 100).toFixed(2))
      : null;

  return {
    currency,
    latestRateToIrr: latest.rateToIrr,
    latestDate: latest.date,
    latestRateType: latest.rateType,
    previousRateToIrr: prev?.rateToIrr ?? null,
    deltaIrr,
    deltaPercent,
    historyCount: matching.length,
  };
}

export function formatForeignNumber(amount: number, decimalPlaces = 2): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(safe);
  return toPersianDigits(formatted);
}

export function formatForeignMoney(
  amount: number,
  currencyCode: string,
  currencies?: CurrencyDefinition[],
  explicitDecimals?: number
): string {
  const code = normalizeCurrencyCode(currencyCode);
  const def = currencies?.find((c) => normalizeCurrencyCode(c.code) === code);
  const decimals = explicitDecimals ?? def?.decimalPlaces ?? (code === BASE_CURRENCY_CODE ? 0 : 2);
  const num = formatForeignNumber(amount, decimals);
  const label = def?.symbol ? `${def.symbol} ${code}` : code;
  return `${num} ${label}`;
}

export function formatExchangeRate(rateToIrr: number, displayUnit: CurrencyUnit): string {
  return formatMoney(Math.round(rateToIrr), displayUnit);
}

/**
 * Annotates Rial-balanced double-entry voucher lines with proportional foreign-currency
 * debit/credit equivalents when an invoice is issued in a foreign currency.
 * Preserves the exact integer Rial debit/credit so ledger equilibrium is never perturbed.
 */
export function annotateVoucherLinesWithCurrency(
  lines: VoucherLine[],
  exchangeRate: number,
  decimalPlaces = 2
): VoucherLine[] {
  if (!exchangeRate || exchangeRate <= 0) return lines;
  return lines.map((l) => ({
    ...l,
    ...(l.debit > 0 ? { foreignDebit: convertIrrToForeign(l.debit, exchangeRate, decimalPlaces) } : {}),
    ...(l.credit > 0 ? { foreignCredit: convertIrrToForeign(l.credit, exchangeRate, decimalPlaces) } : {}),
  }));
}
