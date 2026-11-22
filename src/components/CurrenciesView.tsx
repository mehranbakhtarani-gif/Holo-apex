import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Coins,
  Download,
  Edit3,
  FileText,
  BookOpen,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import {
  ActiveModule,
  CurrencyDefinition,
  ExchangeRateType,
} from '../types/accounting';
import {
  exportToCsv,
  formatMoney,
  getTodayShamsi,
  toPersianDigits,
} from '../lib/format';
import {
  BASE_CURRENCY_CODE,
  convertForeignToIrr,
  convertIrrToForeign,
  formatForeignMoney,
  formatForeignNumber,
  getCurrencyRateSnapshot,
  getEffectiveExchangeRate,
  isForeignCurrency,
  normalizeCurrencyCode,
  RATE_TYPE_LABELS,
} from '../lib/currency';
import { computeFxRevaluationReport } from '../lib/enterpriseAccounting';

type CurrenciesTab = 'rates' | 'definitions' | 'converter' | 'revaluation';

const CURRENCY_PRESETS: {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  defaultRateToIrr: number;
}[] = [
  { code: 'TRY', name: 'لیر ترکیه', symbol: '₺', decimalPlaces: 2, defaultRateToIrr: 20_500 },
  { code: 'GBP', name: 'پوند انگلیس', symbol: '£', decimalPlaces: 2, defaultRateToIrr: 910_000 },
  { code: 'INR', name: 'روپیه هند (نخ پنبه)', symbol: '₹', decimalPlaces: 2, defaultRateToIrr: 8_400 },
  { code: 'OMR', name: 'ریال عمان', symbol: 'ر.ع', decimalPlaces: 3, defaultRateToIrr: 1_855_000 },
  { code: 'IQD', name: 'دینار عراق', symbol: 'د.ع', decimalPlaces: 0, defaultRateToIrr: 540 },
];

export const CurrenciesView: React.FC<{
  initialIntent?: string;
  clearIntent?: () => void;
  onNavigate?: (mod: ActiveModule, intent?: string, subKey?: string) => void;
}> = ({ initialIntent, clearIntent, onNavigate }) => {
  const {
    profile,
    currencies,
    exchangeRates,
    invoices,
    vouchers,
    parties,
    addCurrency,
    updateCurrency,
    deleteCurrency,
    upsertExchangeRate,
    deleteExchangeRate,
    postFxRevaluationVoucher,
    showToast,
  } = useAccounting();

  const [tab, setTab] = useState<CurrenciesTab>('rates');
  const [revalDate, setRevalDate] = useState<string>(getTodayShamsi());
  const [dualLedgerPartyId, setDualLedgerPartyId] = useState<string>('');

  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent === 'definitions') setTab('definitions');
    else if (initialIntent === 'converter') setTab('converter');
    else if (initialIntent === 'rates') setTab('rates');
    else if (initialIntent === 'revaluation') setTab('revaluation');
    clearIntent?.();
  }, [initialIntent, clearIntent]);

  const foreignCurrencies = useMemo(
    () =>
      currencies
        .filter((c) => !c.isBase && normalizeCurrencyCode(c.code) !== BASE_CURRENCY_CODE)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [currencies]
  );

  const activeForeignCurrencies = useMemo(
    () => foreignCurrencies.filter((c) => c.active),
    [foreignCurrencies]
  );

  const baseCurrency = useMemo(
    () => currencies.find((c) => c.isBase || normalizeCurrencyCode(c.code) === BASE_CURRENCY_CODE),
    [currencies]
  );

  // Daily Rate Entry Form State
  const [rateCurrencyCode, setRateCurrencyCode] = useState<string>(
    activeForeignCurrencies[0]?.code || 'USD'
  );
  const [rateDate, setRateDate] = useState<string>(getTodayShamsi());
  const [rateValueIrr, setRateValueIrr] = useState<number>(() => {
    const first = activeForeignCurrencies[0];
    return first ? first.defaultRateToIrr : 715_000;
  });
  const [rateType, setRateType] = useState<ExchangeRateType>('exchange_center');
  const [rateNotes, setRateNotes] = useState<string>('');
  const [historyFilterCode, setHistoryFilterCode] = useState<string>('all');

  // Sync default rate input when switching selected currency in form
  const handleSelectRateCurrency = (code: string) => {
    setRateCurrencyCode(code);
    const eff = getEffectiveExchangeRate(code, rateDate, exchangeRates, currencies);
    if (eff.rateToIrr > 1) {
      setRateValueIrr(eff.rateToIrr);
    }
    if (eff.rateType !== 'default' && eff.rateType !== 'base') {
      setRateType(eff.rateType);
    }
  };

  // Currency Definition Form State
  const [editingCurrencyId, setEditingCurrencyId] = useState<string | null>(null);
  const [curCode, setCurCode] = useState('');
  const [curName, setCurName] = useState('');
  const [curSymbol, setCurSymbol] = useState('');
  const [curDecimals, setCurDecimals] = useState(2);
  const [curDefaultRate, setCurDefaultRate] = useState(700_000);
  const [curActive, setCurActive] = useState(true);

  // Converter State
  const [convAmount, setConvAmount] = useState<number>(1000);
  const [convFrom, setConvFrom] = useState<string>('USD');
  const [convTo, setConvTo] = useState<string>('IRR');
  const [convDate, setConvDate] = useState<string>(getTodayShamsi());

  const snapshots = useMemo(
    () => foreignCurrencies.map((c) => getCurrencyRateSnapshot(c, exchangeRates)),
    [foreignCurrencies, exchangeRates]
  );

  const usdSnapshot = useMemo(
    () => snapshots.find((s) => normalizeCurrencyCode(s.currency.code) === 'USD') ?? snapshots[0],
    [snapshots]
  );

  const fxStats = useMemo(() => {
    const fxInvoicesCount = invoices.filter(
      (inv) => inv.status !== 'cancelled' && isForeignCurrency(inv.currencyCode)
    ).length;
    const fxVouchersCount = vouchers.filter((v) => isForeignCurrency(v.currencyCode)).length;
    return {
      fxInvoicesCount,
      fxVouchersCount,
      totalFxDocs: fxInvoicesCount + fxVouchersCount,
    };
  }, [invoices, vouchers]);

  const sortedHistory = useMemo(() => {
    return [...exchangeRates]
      .filter((r) =>
        historyFilterCode === 'all'
          ? true
          : normalizeCurrencyCode(r.currencyCode) === historyFilterCode
      )
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return a.currencyCode.localeCompare(b.currencyCode);
      });
  }, [exchangeRates, historyFilterCode]);

  const handleSaveDailyRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateCurrencyCode) return;
    if (rateValueIrr <= 0) {
      showToast('نرخ برابری ارز باید عددی بزرگ‌تر از صفر (به ریال) باشد.');
      return;
    }
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(rateDate.trim())) {
      showToast('فرمت تاریخ شمسی باید به شکل YYYY/MM/DD (مثلاً ۱۴۰۵/۰۸/۳۰) باشد.');
      return;
    }
    await upsertExchangeRate({
      currencyCode: rateCurrencyCode,
      date: rateDate.trim(),
      rateToIrr: Math.round(rateValueIrr),
      rateType,
      notes: rateNotes.trim() || undefined,
    });
    setRateNotes('');
  };

  const resetCurrencyForm = () => {
    setEditingCurrencyId(null);
    setCurCode('');
    setCurName('');
    setCurSymbol('');
    setCurDecimals(2);
    setCurDefaultRate(700_000);
    setCurActive(true);
  };

  const startEditCurrency = (c: CurrencyDefinition) => {
    setEditingCurrencyId(c.id);
    setCurCode(c.code);
    setCurName(c.name);
    setCurSymbol(c.symbol);
    setCurDecimals(c.decimalPlaces);
    setCurDefaultRate(c.defaultRateToIrr);
    setCurActive(c.active);
    setTab('definitions');
  };

  const handleSaveCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curName.trim() || !curCode.trim()) {
      showToast('کد ارز و نام ارز الزامی است.');
      return;
    }
    if (editingCurrencyId) {
      await updateCurrency(editingCurrencyId, {
        name: curName.trim(),
        symbol: curSymbol.trim() || curCode.trim().toUpperCase(),
        decimalPlaces: curDecimals,
        defaultRateToIrr: curDefaultRate,
        active: curActive,
      });
      resetCurrencyForm();
    } else {
      const ok = await addCurrency({
        code: curCode.trim().toUpperCase(),
        name: curName.trim(),
        symbol: curSymbol.trim() || curCode.trim().toUpperCase(),
        decimalPlaces: curDecimals,
        defaultRateToIrr: curDefaultRate,
        active: curActive,
      });
      if (ok) resetCurrencyForm();
    }
  };

  const handleExportRatesCsv = () => {
    const headers = ['تاریخ شمسی', 'کد ارز', 'نرخ برابری (ریال)', 'نوع نرخ', 'توضیحات'];
    const rows = sortedHistory.map((r) => [
      r.date,
      r.currencyCode,
      r.rateToIrr,
      RATE_TYPE_LABELS[r.rateType],
      r.notes || '',
    ]);
    exportToCsv(`exchange-rates-${getTodayShamsi().replace(/\//g, '-')}.csv`, headers, rows);
    showToast('فایل اکسل (CSV) تاریخچه نرخ روز ارزها دریافت شد.');
  };

  // Converter Computation
  const converterResult = useMemo(() => {
    const fromRate = getEffectiveExchangeRate(convFrom, convDate, exchangeRates, currencies);
    const toRate = getEffectiveExchangeRate(convTo, convDate, exchangeRates, currencies);
    const toDef = currencies.find((c) => normalizeCurrencyCode(c.code) === normalizeCurrencyCode(convTo));
    const irrValue = convertForeignToIrr(convAmount, fromRate.rateToIrr);
    const targetValue =
      normalizeCurrencyCode(convTo) === BASE_CURRENCY_CODE
        ? irrValue
        : convertIrrToForeign(irrValue, toRate.rateToIrr, toDef?.decimalPlaces ?? 2);
    return {
      fromRate,
      toRate,
      irrValue,
      targetValue,
      toDecimals: toDef?.decimalPlaces ?? 2,
    };
  }, [convAmount, convFrom, convTo, convDate, exchangeRates, currencies]);

  const availablePresets = useMemo(
    () =>
      CURRENCY_PRESETS.filter(
        (p) => !currencies.some((c) => normalizeCurrencyCode(c.code) === p.code)
      ),
    [currencies]
  );

  const revaluationRows = useMemo(
    () => computeFxRevaluationReport(vouchers, exchangeRates, currencies, revalDate),
    [vouchers, exchangeRates, currencies, revalDate]
  );

  const revalSummary = useMemo(() => {
    let totalGain = 0;
    let totalLoss = 0;
    revaluationRows.forEach((r) => {
      if (r.revaluationDiffIrr > 0) totalGain += r.revaluationDiffIrr;
      else totalLoss += Math.abs(r.revaluationDiffIrr);
    });
    return { totalGain, totalLoss, net: totalGain - totalLoss };
  }, [revaluationRows]);

  // Dual-column Foreign / Rial Party Statement
  const fxParties = useMemo(() => {
    const ids = new Set<string>();
    vouchers.forEach((v) => {
      if (!isForeignCurrency(v.currencyCode)) return;
      v.lines.forEach((l) => {
        if (l.partyId) ids.add(l.partyId);
      });
    });
    return parties.filter((p) => ids.has(p.id) || p.partyType === 'vendor' || p.partyType === 'customer');
  }, [vouchers, parties]);

  const activeDualPartyId = dualLedgerPartyId || fxParties[0]?.id || '';

  const dualPartyRows = useMemo(() => {
    if (!activeDualPartyId) return [];
    const list: {
      voucherNumber: number;
      date: string;
      description: string;
      currencyCode: string;
      rate: number;
      fxDebit: number;
      fxCredit: number;
      irrDebit: number;
      irrCredit: number;
      runningFx: number;
      runningIrr: number;
    }[] = [];
    let runningFx = 0;
    let runningIrr = 0;
    const sorted = [...vouchers].sort((a, b) => a.date.localeCompare(b.date) || a.voucherNumber - b.voucherNumber);
    for (const v of sorted) {
      for (const l of v.lines) {
        if (l.partyId !== activeDualPartyId) continue;
        const isFx = isForeignCurrency(v.currencyCode);
        const rate = v.exchangeRate || 1;
        const fxDr = isFx ? (l.foreignDebit ?? (l.debit > 0 ? l.debit / rate : 0)) : 0;
        const fxCr = isFx ? (l.foreignCredit ?? (l.credit > 0 ? l.credit / rate : 0)) : 0;
        runningFx += fxDr - fxCr;
        runningIrr += (l.debit || 0) - (l.credit || 0);
        list.push({
          voucherNumber: v.voucherNumber,
          date: v.date,
          description: l.description || v.description,
          currencyCode: isFx ? normalizeCurrencyCode(v.currencyCode) : 'IRR',
          rate,
          fxDebit: fxDr,
          fxCredit: fxCr,
          irrDebit: l.debit || 0,
          irrCredit: l.credit || 0,
          runningFx,
          runningIrr,
        });
      }
    }
    return list;
  }, [activeDualPartyId, vouchers]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            تعریف ارزها و نرخ برابری روزانه
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            مدیریت ارز پایه دفاتر (ریال)، ارزهای واردات و صادرات نخ و ثبت نرخ برابری روزانه جهت صدور فاکتور و سند ارزی
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigate && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('invoices', 'new-sale', 'inv-sale')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>صدور فاکتور ارزی</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('vouchers', 'new-voucher', 'voucher-new')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>ثبت سند ارزی</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>ارز پایه دفاتر قانونی</span>
            <Coins className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-slate-900 dark:text-white font-code">
              {baseCurrency?.code || 'IRR'}
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              ریال ایران
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            تمامی ترازها و دفاتر بر مبنای معادل ریالی قفل می‌شوند
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>ارزهای عملیاتی فعال</span>
            <span className="font-code text-[11px] text-teal-700 dark:text-teal-400 font-semibold">
              {activeForeignCurrencies.map((c) => c.code).slice(0, 4).join(' · ')}
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white font-code tabular-nums">
            {toPersianDigits(activeForeignCurrencies.length)} ارز
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            از مجموع {toPersianDigits(currencies.length)} ارز تعریف‌شده در سیستم
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              آخرین نرخ {usdSnapshot ? `${usdSnapshot.currency.name} (${usdSnapshot.currency.code})` : 'دلار'}
            </span>
            {usdSnapshot?.deltaPercent !== null && usdSnapshot?.deltaPercent !== undefined && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-code font-semibold ${
                  usdSnapshot.deltaPercent >= 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {usdSnapshot.deltaPercent >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {toPersianDigits(Math.abs(usdSnapshot.deltaPercent))}٪
              </span>
            )}
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white font-code tabular-nums">
            {usdSnapshot
              ? formatMoney(usdSnapshot.latestRateToIrr, profile.currencyUnit)
              : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-code tabular-nums">
            {usdSnapshot?.latestDate
              ? `به‌روزرسانی ${toPersianDigits(usdSnapshot.latestDate)}`
              : 'نرخ پیش‌فرض'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>تراکنش‌های ارزی ثبت‌شده</span>
            <ArrowLeftRight className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white font-code tabular-nums">
            {toPersianDigits(fxStats.totalFxDocs)} فقره
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {toPersianDigits(fxStats.fxInvoicesCount)} فاکتور ارزی · {toPersianDigits(fxStats.fxVouchersCount)} سند ارزی
          </div>
        </div>
      </div>

      {/* Segmented View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('rates')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === 'rates'
                ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            تابلوی نرخ برابری روزانه
          </button>
          <button
            type="button"
            onClick={() => setTab('definitions')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === 'definitions'
                ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            تعریف ارزهای پایه و عملیاتی ({toPersianDigits(currencies.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('converter')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === 'converter'
                ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            مبدل سریع ارزی
          </button>
          <button
            type="button"
            onClick={() => setTab('revaluation')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === 'revaluation'
                ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            تسعیر ارز و صورت‌حساب ارزی
          </button>
        </div>

        {tab === 'rates' && (
          <button
            type="button"
            onClick={handleExportRatesCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی اکسل نرخ‌ها</span>
          </button>
        )}
      </div>

      {/* TAB 1: DAILY EXCHANGE RATES */}
      {tab === 'rates' && (
        <div className="space-y-6">
          {/* Quick Daily Rate Registration Form */}
          <form
            onSubmit={handleSaveDailyRate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  ثبت یا به‌روزرسانی نرخ برابری روزانه
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  نرخ هر واحد ارز خارجی را به <strong className="text-slate-700 dark:text-slate-200">ریال</strong> وارد کنید؛ در صورت ثبت نرخ تکراری برای یک تاریخ، نرخ آن روز جایگزین می‌شود.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRateDate(getTodayShamsi())}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline self-start"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تاریخ امروز ({toPersianDigits(getTodayShamsi())})</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  ارز عملیاتی
                </label>
                <select
                  value={rateCurrencyCode}
                  onChange={(e) => handleSelectRateCurrency(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {foreignCurrencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  تاریخ شمسی
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={rateDate}
                  onChange={(e) => setRateDate(e.target.value)}
                  placeholder="1405/08/30"
                  className="w-full px-3 py-2 text-xs font-code rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
                  required
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  نرخ برابری هر ۱ {rateCurrencyCode} (به ریال)
                </label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  dir="ltr"
                  value={rateValueIrr}
                  onChange={(e) => setRateValueIrr(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs font-code tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
                  required
                />
                <div className="text-[11px] text-teal-700 dark:text-teal-400 mt-1 font-code tabular-nums">
                  معادل: {formatMoney(Math.round(rateValueIrr), 'IRT')}
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  منبع / نوع نرخ
                </label>
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as ExchangeRateType)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {(Object.keys(RATE_TYPE_LABELS) as ExchangeRateType[]).map((k) => (
                    <option key={k} value={k}>
                      {RATE_TYPE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3 flex flex-col gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    توضیحات (اختیاری)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rateNotes}
                      onChange={(e) => setRateNotes(e.target.value)}
                      placeholder="مثلاً حواله صرافی یا مرکز مبادله"
                      className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ثبت نرخ</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Live Daily Parity Board */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                تابلوی آخرین نرخ برابری ارزهای عملیاتی
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                نرخ ملاک صدور فاکتور و سند ارزی امروز
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">ارز</th>
                    <th className="py-2.5 px-4">آخرین نرخ (ریال)</th>
                    <th className="py-2.5 px-4">معادل (تومان)</th>
                    <th className="py-2.5 px-4">تاریخ آخرین ثبت</th>
                    <th className="py-2.5 px-4">نوع نرخ</th>
                    <th className="py-2.5 px-4">تغییر نسبت به قبل</th>
                    <th className="py-2.5 px-4 text-left">اقدام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {snapshots.map((snap) => (
                    <tr
                      key={snap.currency.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-code font-bold text-slate-900 dark:text-white">
                            {snap.currency.code}
                          </span>
                          <span className="text-slate-400 font-code">{snap.currency.symbol}</span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {snap.currency.name}
                          </span>
                          {!snap.currency.active && (
                            <span className="text-[10px] text-slate-400">(غیرفعال)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-code tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatMoney(snap.latestRateToIrr, 'IRR')}
                      </td>
                      <td className="py-3 px-4 font-code tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(snap.latestRateToIrr, 'IRT')}
                      </td>
                      <td className="py-3 px-4 font-code tabular-nums text-slate-600 dark:text-slate-300">
                        {snap.latestDate ? toPersianDigits(snap.latestDate) : 'پیش‌فرض'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {snap.latestRateType === 'default'
                          ? 'نرخ پیش‌فرض'
                          : snap.latestRateType === 'base'
                            ? 'پایه'
                            : RATE_TYPE_LABELS[snap.latestRateType]}
                      </td>
                      <td className="py-3 px-4 font-code tabular-nums">
                        {snap.deltaIrr !== null && snap.deltaPercent !== null ? (
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              snap.deltaIrr > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : snap.deltaIrr < 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-500'
                            }`}
                          >
                            {snap.deltaIrr > 0 ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : snap.deltaIrr < 0 ? (
                              <TrendingDown className="w-3.5 h-3.5" />
                            ) : null}
                            <span>
                              {snap.deltaIrr > 0 ? '+' : ''}
                              {toPersianDigits(snap.deltaPercent)}٪
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-left">
                        <button
                          type="button"
                          onClick={() => {
                            setRateCurrencyCode(snap.currency.code);
                            setRateDate(getTodayShamsi());
                            setRateValueIrr(snap.latestRateToIrr);
                            if (
                              snap.latestRateType !== 'default' &&
                              snap.latestRateType !== 'base'
                            ) {
                              setRateType(snap.latestRateType);
                            }
                          }}
                          className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          به‌روزرسانی امروز
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical Daily Rates Log */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  آرشیو و تاریخچه نرخ‌های برابری روزانه
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  سیستم هنگام ثبت سند یا فاکتور با تاریخ گذشته، به‌طور خودکار نرخ معتبر همان تاریخ (یا نزدیک‌ترین تاریخ قبل از آن) را بازیابی می‌کند.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={historyFilterCode}
                  onChange={(e) => setHistoryFilterCode(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="all">همه ارزها ({toPersianDigits(exchangeRates.length)})</option>
                  {foreignCurrencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">تاریخ شمسی</th>
                    <th className="py-2.5 px-4">کد ارز</th>
                    <th className="py-2.5 px-4">نرخ (ریال)</th>
                    <th className="py-2.5 px-4">معادل (تومان)</th>
                    <th className="py-2.5 px-4">نوع نرخ</th>
                    <th className="py-2.5 px-4">توضیحات</th>
                    <th className="py-2.5 px-4 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {sortedHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        نرخ برابری برای فیلتر انتخابی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    sortedHistory.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-code tabular-nums font-medium text-slate-800 dark:text-slate-200">
                          {toPersianDigits(row.date)}
                        </td>
                        <td className="py-2.5 px-4 font-code font-bold text-slate-900 dark:text-white">
                          {row.currencyCode}
                        </td>
                        <td className="py-2.5 px-4 font-code tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatMoney(row.rateToIrr, 'IRR')}
                        </td>
                        <td className="py-2.5 px-4 font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {formatMoney(row.rateToIrr, 'IRT')}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          {RATE_TYPE_LABELS[row.rateType]}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                          {row.notes || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-left">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRateCurrencyCode(row.currencyCode);
                                setRateDate(row.date);
                                setRateValueIrr(row.rateToIrr);
                                setRateType(row.rateType);
                                setRateNotes(row.notes || '');
                              }}
                              className="p-1 text-slate-500 hover:text-teal-700 dark:hover:text-teal-400"
                              title="ویرایش در فرم"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteExchangeRate(row.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                              title="حذف رکورد"
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
        </div>
      )}

      {/* TAB 2: CURRENCY DEFINITIONS */}
      {tab === 'definitions' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveCurrency}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingCurrencyId ? `ویرایش مشخصات ارز (${curCode})` : 'تعریف ارز خارجی جدید'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  ارزهای تجاری مورد نیاز واردات نخ، حواله صرافی یا فروش صادراتی را با کد استاندارد ISO تعریف کنید.
                </p>
              </div>
              {editingCurrencyId && (
                <button
                  type="button"
                  onClick={resetCurrencyForm}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  انصراف از ویرایش
                </button>
              )}
            </div>

            {!editingCurrencyId && availablePresets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">افزودن سریع ارز رایج:</span>
                {availablePresets.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => {
                      setCurCode(p.code);
                      setCurName(p.name);
                      setCurSymbol(p.symbol);
                      setCurDecimals(p.decimalPlaces);
                      setCurDefaultRate(p.defaultRateToIrr);
                      setCurActive(true);
                    }}
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:border-teal-500 transition-colors"
                  >
                    <span className="font-code font-bold">{p.code}</span> · {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  کد ISO (لاتین)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  disabled={!!editingCurrencyId}
                  value={curCode}
                  onChange={(e) => setCurCode(e.target.value.toUpperCase())}
                  placeholder="TRY"
                  maxLength={10}
                  className="w-full px-3 py-2 text-xs font-code uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white disabled:opacity-60 text-left"
                  required
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  نام فارسی ارز
                </label>
                <input
                  type="text"
                  value={curName}
                  onChange={(e) => setCurName(e.target.value)}
                  placeholder="مثلاً لیر ترکیه"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  نماد ارز
                </label>
                <input
                  type="text"
                  value={curSymbol}
                  onChange={(e) => setCurSymbol(e.target.value)}
                  placeholder="₺"
                  maxLength={16}
                  className="w-full px-3 py-2 text-xs font-code rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  نرخ پیش‌فرض (ریال)
                </label>
                <input
                  type="number"
                  min={1}
                  dir="ltr"
                  value={curDefaultRate}
                  onChange={(e) => setCurDefaultRate(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs font-code tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  تعداد اعشار
                </label>
                <select
                  value={curDecimals}
                  onChange={(e) => setCurDecimals(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-code rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value={0}>۰ (بدون اعشار)</option>
                  <option value={2}>۲ رقم اعشار (سنت)</option>
                  <option value={3}>۳ رقم اعشار</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={curActive}
                  onChange={(e) => setCurActive(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>قابل انتخاب در فرم صدور فاکتور و سند حسابداری</span>
              </label>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editingCurrencyId ? 'ذخیره تغییرات' : 'افزودن ارز جدید'}</span>
              </button>
            </div>
          </form>

          {/* Defined Currencies Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                فهرست ارزهای تعریف‌شده در شرکت
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">کد ارز</th>
                    <th className="py-2.5 px-4">عنوان</th>
                    <th className="py-2.5 px-4">نماد</th>
                    <th className="py-2.5 px-4">نقش</th>
                    <th className="py-2.5 px-4">اعشار</th>
                    <th className="py-2.5 px-4">نرخ پایه/پیش‌فرض</th>
                    <th className="py-2.5 px-4">وضعیت</th>
                    <th className="py-2.5 px-4 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {currencies.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-code font-bold text-slate-900 dark:text-white">
                        {c.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {c.name}
                      </td>
                      <td className="py-3 px-4 font-code text-slate-600 dark:text-slate-300">
                        {c.symbol}
                      </td>
                      <td className="py-3 px-4">
                        {c.isBase ? (
                          <span className="font-semibold text-teal-700 dark:text-teal-400">
                            ارز پایه دفاتر
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">ارز عملیاتی</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-code tabular-nums text-slate-600 dark:text-slate-300">
                        {toPersianDigits(c.decimalPlaces)}
                      </td>
                      <td className="py-3 px-4 font-code tabular-nums text-slate-800 dark:text-slate-200">
                        {c.isBase ? '۱ ریال' : formatMoney(c.defaultRateToIrr, profile.currencyUnit)}
                      </td>
                      <td className="py-3 px-4">
                        {c.isBase ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            همواره فعال
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateCurrency(c.id, { active: !c.active })}
                            className={`text-xs font-medium hover:underline ${
                              c.active
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {c.active ? 'فعال' : 'غیرفعال'}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-left">
                        {c.isBase ? (
                          <span className="text-[11px] text-slate-400">سیستمی</span>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditCurrency(c)}
                              className="p-1 text-slate-500 hover:text-teal-700 dark:hover:text-teal-400"
                              title="ویرایش ارز"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCurrency(c.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                              title="حذف ارز"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CURRENCY CONVERTER */}
      {tab === 'converter' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-3xl">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            ماشین‌حساب تبدیل ارز بر اساس نرخ برابری تاریخ دلخواه
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            تبدیل مستقیم بین ریال و ارزهای تعریف‌شده بر مبنای جدول نرخ روزانه شرکت
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-5 items-end">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                مبلغ
              </label>
              <input
                type="number"
                dir="ltr"
                min={0}
                step="any"
                value={convAmount}
                onChange={(e) => setConvAmount(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs font-code tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                از ارز
              </label>
              <select
                value={convFrom}
                onChange={(e) => setConvFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-1 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const prevFrom = convFrom;
                  setConvFrom(convTo);
                  setConvTo(prevFrom);
                }}
                title="جابجایی ارز مبدأ و مقصد"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                به ارز
              </label>
              <select
                value={convTo}
                onChange={(e) => setConvTo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                تاریخ ملاک
              </label>
              <input
                type="text"
                dir="ltr"
                value={convDate}
                onChange={(e) => setConvDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-code rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
              />
            </div>
          </div>

          <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">نتیجه تبدیل:</div>
            <div className="text-2xl font-extrabold text-teal-800 dark:text-teal-300 font-code tabular-nums">
              {convTo === BASE_CURRENCY_CODE
                ? formatMoney(converterResult.targetValue, 'IRR')
                : formatForeignMoney(
                    converterResult.targetValue,
                    convTo,
                    currencies,
                    converterResult.toDecimals
                  )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800 font-code tabular-nums">
              <span>معادل ریالی: {formatMoney(converterResult.irrValue, 'IRR')}</span>
              <span>معادل تومانی: {formatMoney(converterResult.irrValue, 'IRT')}</span>
              {convFrom !== BASE_CURRENCY_CODE && (
                <span>
                  نرخ {convFrom}: {formatForeignNumber(converterResult.fromRate.rateToIrr, 0)} ریال
                  {converterResult.fromRate.rateDate
                    ? ` (${toPersianDigits(converterResult.fromRate.rateDate)})`
                    : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: END-OF-PERIOD FX REVALUATION & DUAL-COLUMN PARTY STATEMENT */}
      {tab === 'revaluation' && (
        <div className="space-y-6">
          {/* FX Revaluation Engine */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  تسعیر حساب‌های پولی ارزی پایان دوره (استاندارد ۱۶ حسابداری)
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  مقایسه مانده تاریخی ریالی حساب‌های ارزی با نرخ روز ملاک و صدور سند خودکار سود (۶۰۹۰۱) یا زیان تسعیر (۸۰۹۰۱)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">تاریخ ملاک تسعیر:</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={revalDate}
                    onChange={(e) => setRevalDate(e.target.value)}
                    className="w-28 px-2.5 py-1.5 text-xs font-code rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => postFxRevaluationVoucher(revaluationRows, revalDate)}
                  disabled={revaluationRows.every((r) => Math.abs(r.revaluationDiffIrr) < 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>صدور سند تسعیر ارز پایان دوره</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500">جمع سود تسعیر (۶۰۹۰۱):</span>
                <div className="font-code tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">
                  {formatMoney(revalSummary.totalGain, profile.currencyUnit)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">جمع زیان تسعیر (۸۰۹۰۱):</span>
                <div className="font-code tabular-nums font-bold text-rose-700 dark:text-rose-400 text-sm mt-0.5">
                  {formatMoney(revalSummary.totalLoss, profile.currencyUnit)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">خالص اثر تسعیر بر سود و زیان:</span>
                <div
                  className={`font-code tabular-nums font-bold text-sm mt-0.5 ${
                    revalSummary.net >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {revalSummary.net >= 0 ? '+' : ''}
                  {formatMoney(revalSummary.net, profile.currencyUnit)}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">حساب / طرف‌حساب</th>
                    <th className="py-2.5 px-4">ارز</th>
                    <th className="py-2.5 px-4 text-left">مانده ارزی</th>
                    <th className="py-2.5 px-4 text-left">مانده دفتری (تاریخی)</th>
                    <th className="py-2.5 px-4 text-left">نرخ ملاک</th>
                    <th className="py-2.5 px-4 text-left">مانده تسعیرشده</th>
                    <th className="py-2.5 px-4 text-left">سود / (زیان) تسعیر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {revaluationRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        حساب پولی ارزی بازی برای تسعیر یافت نشد. پس از ثبت فاکتور یا سند ارزی، مانده ارزی اینجا محاسبه می‌شود.
                      </td>
                    </tr>
                  ) : (
                    revaluationRows.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            <span className="font-code text-teal-700 dark:text-teal-400 ml-1.5">
                              {row.accountCode}
                            </span>
                            {row.accountTitle}
                          </div>
                          {row.partyName && (
                            <div className="text-[11px] text-slate-500 mt-0.5">{row.partyName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-code font-bold">{row.currencyCode}</td>
                        <td className="py-3 px-4 text-left font-code tabular-nums font-semibold">
                          {formatForeignMoney(row.netForeignBalance, row.currencyCode, currencies)}
                        </td>
                        <td className="py-3 px-4 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {formatMoney(row.historicalIrrBalance, profile.currencyUnit, false)}
                        </td>
                        <td className="py-3 px-4 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {formatMoney(row.currentRateToIrr, 'IRR', false)}
                        </td>
                        <td className="py-3 px-4 text-left font-code tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatMoney(row.revaluedIrrBalance, profile.currencyUnit, false)}
                        </td>
                        <td
                          className={`py-3 px-4 text-left font-code tabular-nums font-bold ${
                            row.revaluationDiffIrr >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {row.revaluationDiffIrr >= 0 ? '+' : ''}
                          {formatMoney(row.revaluationDiffIrr, profile.currencyUnit, false)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dual-Column Foreign/Rial Party Ledger */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  صورت‌حساب دو ستونه (ارزی و ریالی) طرف‌حساب‌ها
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  نمایش همزمان گردش ارزی (دلار/یوان/درهم/یورو) و معادل ریالی هر ردیف سند جهت تسویه صرافی و تأمین‌کنندگان خارجی
                </p>
              </div>
              <select
                value={activeDualPartyId}
                onChange={(e) => setDualLedgerPartyId(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {fxParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-3">سند</th>
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">شرح</th>
                    <th className="py-2.5 px-3">ارز / نرخ</th>
                    <th className="py-2.5 px-3 text-left">گردش ارزی</th>
                    <th className="py-2.5 px-3 text-left">مانده ارزی</th>
                    <th className="py-2.5 px-3 text-left">گردش ریالی</th>
                    <th className="py-2.5 px-3 text-left">مانده ریالی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dualPartyRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        گردشی برای این طرف‌حساب ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    dualPartyRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-code font-semibold">
                          #{toPersianDigits(r.voucherNumber)}
                        </td>
                        <td className="py-2.5 px-3 font-code">{toPersianDigits(r.date)}</td>
                        <td className="py-2.5 px-3 max-w-xs truncate">{r.description}</td>
                        <td className="py-2.5 px-3 font-code text-[11px] text-slate-500">
                          {r.currencyCode}
                          {r.currencyCode !== 'IRR' ? ` @ ${formatForeignNumber(r.rate, 0)}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {r.fxDebit > 0
                            ? `+${formatForeignNumber(r.fxDebit, 2)}`
                            : r.fxCredit > 0
                              ? `-${formatForeignNumber(r.fxCredit, 2)}`
                              : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums font-semibold text-teal-700 dark:text-teal-400">
                          {formatForeignNumber(r.runningFx, 2)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {r.irrDebit > 0
                            ? formatMoney(r.irrDebit, profile.currencyUnit, false)
                            : `(${formatMoney(r.irrCredit, profile.currencyUnit, false)})`}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums font-bold">
                          {formatMoney(r.runningIrr, profile.currencyUnit, false)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
